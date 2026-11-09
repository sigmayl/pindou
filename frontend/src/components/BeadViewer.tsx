import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  beadDetail,
  buildBeadMesh,
  collectBeads,
  type BeadDetail,
  type BeadPlacement,
} from "../lib/beadGeometry";
import {
  buildReliefNormals,
  FINISHES,
  getFinish,
  RELIEF_SIZE,
  RELIEF_TILE_PITCHES,
  type FinishId,
  type ReliefKind,
} from "../lib/surfaceFinish";
import type { BeadGrid } from "../types";

const TABLE_COLOR = "#efe9dd";
const TABLE_MARGIN = 6;
const FOV = 32;
const INITIAL_TILT = 0.5;

export interface BeadViewerHandle {
  capture: () => Promise<Blob>;
}

const GLINT_VERTEX_PARS = /* glsl */ `
varying vec2 vFinishUv;
`;

// The finish is continuous across the piece, as the imprint of one pressing surface.
const GLINT_VERTEX = /* glsl */ `
vFinishUv = (instanceMatrix * vec4(position, 1.0)).xz;
vNormalMapUv = vFinishUv / ${RELIEF_TILE_PITCHES.toFixed(1)};
`;

const GLINT_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uGlint;
varying vec2 vFinishUv;

vec3 glintHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}

float beadGlint(vec2 uv, vec3 surface, vec3 view, vec3 light) {
  vec2 p = uv * uGlint.x;
  vec2 id = floor(p);
  vec3 seed = glintHash(id);
  if (seed.z > 0.6) return 0.0;
  float radius = uGlint.y * 0.5;
  vec2 centre = id + 0.5 + (seed.xy - 0.5) * (1.0 - uGlint.y);
  float disk = smoothstep(radius, radius * 0.55, length(p - centre));
  vec3 tilt = glintHash(id + 17.0) * 2.0 - 1.0;
  vec3 flake = normalize(surface + tilt * 0.55);
  float spark = pow(max(dot(flake, normalize(view + light)), 0.0), 90.0);
  return disk * (0.05 + spark);
}
`;

const GLINT_FRAGMENT = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
if (uGlint.z > 0.0) {
  float glint = beadGlint(vFinishUv, normal, normalize(vViewPosition), directionalLights[0].direction);
  outgoingLight += glint * uGlint.z * (diffuseColor.rgb * 0.5 + vec3(0.5));
}
#endif
`;

interface Stage {
  setMelt: (melt: number) => void;
  setFinish: (finish: FinishId) => void;
  resetView: () => void;
  capture: () => Promise<Blob>;
  dispose: () => void;
}

interface Props {
  grid: BeadGrid;
  melt: number;
  finish: FinishId;
  onMelt: (melt: number) => void;
  onFinish: (finish: FinishId) => void;
  ref?: Ref<BeadViewerHandle>;
}

function meltLabel(melt: number): string {
  if (melt <= 0) return "未熨烫";
  if (melt < 0.4) return "轻烫";
  if (melt < 0.8) return "半融";
  return "压平";
}

function buildBeadGeometry(melt: number, detail: BeadDetail, exposure: number): BufferGeometry {
  const { positions, shades, indices } = buildBeadMesh(melt, detail, exposure);
  const colors = new Float32Array(shades.length * 3);
  shades.forEach((shade, index) => colors.fill(shade, index * 3, index * 3 + 3));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function buildReliefTexture(kind: ReliefKind): DataTexture {
  const texture = new DataTexture(buildReliefNormals(kind), RELIEF_SIZE, RELIEF_SIZE);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Stable per-bead noise in [0, 1) so hand-ironed irregularity does not flicker. */
function noise(index: number): number {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Table with a baked soft shadow, which also reads as darkness through the holes. */
function buildTableTexture(grid: BeadGrid): CanvasTexture {
  const { width, height, rgba } = grid;
  const columns = width + TABLE_MARGIN * 2;
  const rows = height + TABLE_MARGIN * 2;
  const scale = Math.max(2, Math.min(16, Math.floor(2048 / Math.max(columns, rows))));

  const silhouette = document.createElement("canvas");
  silhouette.width = width;
  silhouette.height = height;
  const silhouetteContext = silhouette.getContext("2d");
  if (!silhouetteContext) throw new Error("浏览器不支持 Canvas 2D。");
  const mask = silhouetteContext.createImageData(width, height);
  for (let i = 3; i < rgba.length; i += 4) mask.data[i] = rgba[i] >= 128 ? 255 : 0;
  silhouetteContext.putImageData(mask, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = columns * scale;
  canvas.height = rows * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 2D。");
  context.fillStyle = TABLE_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  // Draw off-canvas and keep only the shadow: canvas filters are missing in Safari.
  const offscreen = canvas.width + canvas.height;
  const left = TABLE_MARGIN * scale;
  for (const [blur, drop, alpha] of [
    [scale * 2.4, scale * 0.5, 0.34],
    [scale * 0.5, 0, 0.72],
  ] as const) {
    context.shadowColor = `rgba(58, 44, 30, ${alpha})`;
    context.shadowBlur = blur;
    context.shadowOffsetX = offscreen + drop * 0.6;
    context.shadowOffsetY = drop;
    context.drawImage(silhouette, left - offscreen, left, width * scale, height * scale);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createStage(
  host: HTMLElement,
  grid: BeadGrid,
  initialMelt: number,
  initialFinish: FinishId,
): Stage {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.domElement.className = "bead-viewer-canvas";
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(TABLE_COLOR);
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.55;

  const sun = new DirectionalLight("#fff6ea", 1.7);
  sun.position.set(-0.55, 1, 0.45);
  scene.add(sun);

  const beads = collectBeads(grid.rgba, grid.width, grid.height);
  const detail = beadDetail(beads.length);
  const reliefTextures = new Map<ReliefKind, DataTexture>();
  function reliefTexture(kind: ReliefKind): DataTexture {
    let texture = reliefTextures.get(kind);
    if (!texture) {
      texture = buildReliefTexture(kind);
      reliefTextures.set(kind, texture);
    }
    return texture;
  }

  const glintUniform = { value: new Vector3() };
  const material = new MeshStandardMaterial({ vertexColors: true, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlint = glintUniform;
    shader.vertexShader = (GLINT_VERTEX_PARS + shader.vertexShader).replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>\n${GLINT_VERTEX}`,
    );
    shader.fragmentShader = (GLINT_FRAGMENT_PARS + shader.fragmentShader).replace(
      "#include <opaque_fragment>",
      `${GLINT_FRAGMENT}\n#include <opaque_fragment>`,
    );
  };

  function applyFinish(id: FinishId) {
    const finish = getFinish(id);
    material.normalMap = reliefTexture(finish.relief);
    material.normalScale.setScalar(finish.reliefStrength);
    material.roughness = finish.roughness;
    const { density = 0, size = 0, strength = 0 } = finish.glint ?? {};
    glintUniform.value.set(density, size, strength);
  }
  applyFinish(initialFinish);

  // One instanced batch per neighbourhood shape: interior tiles and each kind of edge.
  const groups = new Map<number, BeadPlacement[]>();
  beads.forEach((bead) => {
    const group = groups.get(bead.exposure);
    if (group) group.push(bead);
    else groups.set(bead.exposure, [bead]);
  });

  const matrix = new Matrix4();
  const color = new Color();
  let beadIndex = 0;
  const meshes = [...groups].map(([exposure, members]) => {
    const mesh = new InstancedMesh(
      buildBeadGeometry(initialMelt, detail, exposure),
      material,
      members.length,
    );
    members.forEach((bead, index) => {
      const lift = 1 + (noise(beadIndex) - 0.5) * 0.04;
      beadIndex += 1;
      matrix.makeScale(1, lift, 1).setPosition(bead.x, 0, bead.z);
      mesh.setMatrixAt(index, matrix);
      color.setRGB(bead.rgb[0] / 255, bead.rgb[1] / 255, bead.rgb[2] / 255, SRGBColorSpace);
      mesh.setColorAt(index, color);
    });
    scene.add(mesh);
    return { mesh, exposure };
  });

  const tableTexture = buildTableTexture(grid);
  const tableGeometry = new PlaneGeometry(
    grid.width + TABLE_MARGIN * 2,
    grid.height + TABLE_MARGIN * 2,
  );
  // Not tone mapped so the table edge blends into the flat background.
  const tableMaterial = new MeshBasicMaterial({ map: tableTexture, toneMapped: false });
  const table = new Mesh(tableGeometry, tableMaterial);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.01;
  scene.add(table);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 10);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.45;
  controls.minDistance = 3;

  let frame = 0;
  function renderFrame() {
    frame = 0;
    controls.update();
    renderer.render(scene, camera);
  }
  // Render on demand: controls fire "change" only while the view is still moving.
  function invalidate() {
    if (frame === 0) frame = requestAnimationFrame(renderFrame);
  }
  controls.addEventListener("change", invalidate);

  function resetView() {
    const halfTan = Math.tan((FOV * Math.PI) / 360);
    const fit = Math.max(
      (grid.height / 2 + 1.5) / halfTan,
      (grid.width / 2 + 1.5) / (halfTan * camera.aspect),
    );
    const distance = fit * 1.12;
    controls.target.set(0, 0.2, 0);
    camera.position.copy(
      new Vector3(0, Math.cos(INITIAL_TILT), Math.sin(INITIAL_TILT)).multiplyScalar(distance),
    );
    camera.far = distance * 6 + 100;
    camera.updateProjectionMatrix();
    controls.maxDistance = distance * 3;
    invalidate();
  }

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  resetView();

  return {
    setMelt(melt) {
      for (const { mesh, exposure } of meshes) {
        mesh.geometry.dispose();
        mesh.geometry = buildBeadGeometry(melt, detail, exposure);
      }
      invalidate();
    },
    setFinish(finish) {
      applyFinish(finish);
      invalidate();
    },
    resetView,
    capture() {
      // The drawing buffer is only readable in the same task as the render.
      renderer.render(scene, camera);
      return new Promise((resolve, reject) => {
        renderer.domElement.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("3D 效果图导出失败。"));
        }, "image/png");
      });
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      for (const { mesh } of meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
      reliefTextures.forEach((texture) => texture.dispose());
      tableGeometry.dispose();
      tableMaterial.dispose();
      tableTexture.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

export default function BeadViewer({ grid, melt, finish, onMelt, onFinish, ref }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      stageRef.current = createStage(host, grid, melt, finish);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    return () => {
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // The effects below apply later melt and finish changes without rebuilding the scene.
  }, [grid]);

  useEffect(() => {
    stageRef.current?.setMelt(melt);
  }, [melt]);

  useEffect(() => {
    stageRef.current?.setFinish(finish);
  }, [finish]);

  useImperativeHandle(ref, () => ({
    capture: () =>
      stageRef.current?.capture() ?? Promise.reject(new Error("3D 预览尚未就绪。")),
  }));

  if (failed) {
    return <p className="bead-viewer-error">当前浏览器无法启用 WebGL，3D 预览不可用。</p>;
  }

  return (
    <div className="bead-viewer">
      <div ref={hostRef} className="bead-viewer-host" />
      <div className="bead-viewer-controls">
        <div className="bead-viewer-melt">
          <div className="slider-row">
            <label htmlFor="melt">
              熨烫程度 <output>{meltLabel(melt)}</output>
            </label>
            <input
              id="melt"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={melt}
              onChange={(event) => onMelt(Number(event.target.value))}
            />
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => stageRef.current?.resetView()}
          >
            复位视角
          </button>
        </div>
        <div className="finish-picker" role="radiogroup" aria-label="表面纹理">
          {FINISHES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={finish === item.id}
              className={finish === item.id ? "is-active" : ""}
              onClick={() => onFinish(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <span className="bead-viewer-hint">拖动旋转 · 双指/滚轮缩放 · 右键平移</span>
    </div>
  );
}

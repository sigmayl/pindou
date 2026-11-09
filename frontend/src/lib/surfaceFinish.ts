/** Surface finishes of an ironed piece: the imprint left by what it was pressed with, plus glitter. */

export type FinishId = "normal" | "fine-glitter" | "coarse-glitter" | "scrub" | "towel";
export type ReliefKind = "grain" | "scrub" | "towel";

export interface Glint {
  /** Flake cells per peg pitch. */
  density: number;
  /** Flake diameter as a fraction of its cell. */
  size: number;
  strength: number;
}

export interface SurfaceFinish {
  id: FinishId;
  label: string;
  relief: ReliefKind;
  reliefStrength: number;
  roughness: number;
  glint: Glint | null;
}

export const FINISHES: readonly SurfaceFinish[] = [
  { id: "normal", label: "正常", relief: "grain", reliefStrength: 0.35, roughness: 0.45, glint: null },
  {
    id: "fine-glitter",
    label: "细闪",
    relief: "grain",
    reliefStrength: 0.35,
    roughness: 0.38,
    glint: { density: 22, size: 0.5, strength: 2.4 },
  },
  {
    id: "coarse-glitter",
    label: "粗闪",
    relief: "grain",
    reliefStrength: 0.35,
    roughness: 0.38,
    glint: { density: 11, size: 0.6, strength: 3.6 },
  },
  { id: "scrub", label: "澡巾", relief: "scrub", reliefStrength: 0.85, roughness: 0.55, glint: null },
  { id: "towel", label: "毛巾", relief: "towel", reliefStrength: 1.15, roughness: 0.62, glint: null },
];

export const DEFAULT_FINISH: FinishId = "normal";

export function getFinish(id: FinishId): SurfaceFinish {
  return FINISHES.find((finish) => finish.id === id) ?? FINISHES[0];
}

/** Peg pitches covered by one repeat of a relief texture. */
export const RELIEF_TILE_PITCHES = 8;
export const RELIEF_SIZE = 1024;

/** Feature repeats across one tile: higher means a smaller texture. */
export const RELIEF_PERIODS: Record<ReliefKind, number> = {
  grain: 128,
  scrub: 40,
  towel: 18,
};

function hash(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise; u and v are in tile units [0, 1). */
function valueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fx = smooth(x - cellX);
  const fy = smooth(y - cellY);
  const at = (i: number, j: number) => hash(wrap(cellX + i, period), wrap(cellY + j, period), seed);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * fx;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Tileable field of jittered soft domes, like the loops of terry cloth. */
function loops(u: number, v: number, period: number): number {
  const x = u * period;
  const y = v * period;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let highest = 0;
  for (let j = -1; j <= 1; j += 1) {
    for (let i = -1; i <= 1; i += 1) {
      const wrappedX = wrap(cellX + i, period);
      const wrappedY = wrap(cellY + j, period);
      const dx = cellX + i + 0.2 + 0.6 * hash(wrappedX, wrappedY, 1) - x;
      const dy = cellY + j + 0.2 + 0.6 * hash(wrappedX, wrappedY, 2) - y;
      const radius = 0.55 + 0.25 * hash(wrappedX, wrappedY, 3);
      const dome = 1 - (dx * dx + dy * dy) / (radius * radius);
      if (dome > highest) highest = dome;
    }
  }
  return Math.sqrt(highest);
}

export function reliefHeight(kind: ReliefKind, u: number, v: number): number {
  const period = RELIEF_PERIODS[kind];
  if (kind === "grain") {
    return valueNoise(u, v, period, 1) * 0.65 + valueNoise(u, v, period * 2, 2) * 0.35;
  }
  if (kind === "scrub") {
    // Crepe: ridged noise, warped so the creases wander.
    const warp = (valueNoise(u, v, 12, 3) - 0.5) * 0.03;
    const ridge = 1 - Math.abs(2 * valueNoise(u + warp, v - warp, period, 4) - 1);
    return ridge * 0.85 + valueNoise(u, v, period * 4, 5) * 0.15;
  }
  return loops(u, v, period) * 0.88 + valueNoise(u, v, period * 8, 6) * 0.12;
}

/** Height field to a tangent-space normal map (RGBA8, tileable). */
export function buildReliefNormals(kind: ReliefKind, size = RELIEF_SIZE): Uint8Array<ArrayBuffer> {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      heights[y * size + x] = reliefHeight(kind, x / size, y / size);
    }
  }
  // Differences are per texel; scaling by the feature width gives every relief a comparable slope.
  const slope = (size / RELIEF_PERIODS[kind]) * 0.25;
  const normals = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = heights[y * size + wrap(x - 1, size)];
      const right = heights[y * size + wrap(x + 1, size)];
      const up = heights[wrap(y - 1, size) * size + x];
      const down = heights[wrap(y + 1, size) * size + x];
      const nx = (left - right) * slope;
      const ny = (up - down) * slope;
      const scale = 1 / Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      normals[offset] = (nx * scale * 0.5 + 0.5) * 255;
      normals[offset + 1] = (ny * scale * 0.5 + 0.5) * 255;
      normals[offset + 2] = (scale * 0.5 + 0.5) * 255;
      normals[offset + 3] = 255;
    }
  }
  return normals;
}

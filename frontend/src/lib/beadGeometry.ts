/**
 * Mesh of an ironed bead, independent of the renderer. Units are peg pitches, so
 * neighbouring bead centres are 1 apart. Ironing turns the hollow cylinder into a
 * square tile. Interior beads end up as true squares that butt against their
 * neighbours; wherever a bead faces empty space it keeps a large rounded corner
 * and a soft shoulder, so edges and interior get different outlines.
 */

export interface BeadDetail {
  /** Segments in each corner arc. */
  corner: number;
  /** Segments along the top shoulder. */
  shoulder: number;
  /** Tiny beads drop the centre hole to stay within the triangle budget. */
  hole: boolean;
}

export interface BeadShape {
  halfWidth: number;
  height: number;
  hole: number;
  /** Corner radius where the bead is surrounded. */
  interiorCorner: number;
  /** Corner radius where the bead faces empty space. */
  exposedCorner: number;
  /** Top edge rounding along a fused side. */
  fusedShoulder: number;
  /** Top edge rounding along a free side. */
  freeShoulder: number;
}

export interface BeadPlacement {
  x: number;
  z: number;
  rgb: readonly [number, number, number];
  /** Bits 0-3: N/E/S/W side exposed. Bits 4-7: NE/SE/SW/NW corner rounded. */
  exposure: number;
}

export interface BeadMesh {
  positions: Float32Array;
  shades: Float32Array;
  indices: Uint16Array;
}

/** Fully surrounded bead. */
export const INTERIOR = 0;

const SIDES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const DIAGONALS = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const;

const DOME = 0.03;
const HOLE_FILLET = 0.06;
const FILLET_STEPS = 3;

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Interpolates from an un-ironed hollow cylinder (0) to a fully pressed tile (1). */
export function beadShape(melt: number): BeadShape {
  const amount = Math.max(0, Math.min(1, melt));
  const coldRadius = 0.46;
  return {
    halfWidth: Math.min(0.5, lerp(coldRadius, 0.62, amount)),
    height: lerp(0.92, 0.46, amount),
    hole: lerp(0.25, 0.06, amount),
    interiorCorner: lerp(coldRadius, 0.02, amount),
    exposedCorner: lerp(coldRadius, 0.3, amount),
    fusedShoulder: lerp(0.1, 0.03, amount),
    freeShoulder: lerp(0.1, 0.16, amount),
  };
}

/** Picks mesh density so a whole board stays around 3M triangles. */
export function beadDetail(beadCount: number): BeadDetail {
  if (beadCount <= 3000) return { corner: 5, shoulder: 4, hole: true };
  if (beadCount <= 10000) return { corner: 2, shoulder: 2, hole: true };
  if (beadCount <= 20000) return { corner: 1, shoulder: 1, hole: true };
  return { corner: 1, shoulder: 1, hole: false };
}

/** Classifies a bead from which of its 8 neighbours exist. */
export function exposureOf(present: (dx: number, dy: number) => boolean): number {
  let exposure = 0;
  SIDES.forEach(([dx, dy], side) => {
    if (!present(dx, dy)) exposure |= 1 << side;
  });
  DIAGONALS.forEach(([dx, dy], corner) => {
    const sides = (1 << corner) | (1 << ((corner + 1) % 4));
    if (exposure & sides || !present(dx, dy)) exposure |= 1 << (corner + 4);
  });
  return exposure;
}

/**
 * Closed grid of rings running from the outer foot, over the top, down the centre
 * hole. Each ring has the same vertex count; corners walk clockwise from above.
 */
export function buildBeadMesh(melt: number, detail: BeadDetail, exposure: number): BeadMesh {
  const shape = beadShape(melt);
  const { halfWidth, height, hole } = shape;
  const around = 4 * (detail.corner + 1);
  const fillet = detail.hole ? Math.min(hole * 0.7, HOLE_FILLET) : 0;
  const innerRadius = detail.hole ? hole + fillet : 0;

  const shoulderOf = (side: number) =>
    exposure & (1 << (side % 4)) ? shape.freeShoulder : shape.fusedShoulder;

  /** Outline vertex `step` of `corner`, inset from the edge by the vertex's shoulder fraction. */
  function outlineXZ(corner: number, step: number, inset: (shoulder: number) => number) {
    const [ax, az] = SIDES[corner];
    const [bx, bz] = SIDES[(corner + 1) % 4];
    const radius =
      exposure & (1 << (corner + 4)) ? shape.exposedCorner : shape.interiorCorner;
    const u = step / detail.corner;
    const angle = u * (Math.PI / 2);
    const nx = ax * Math.cos(angle) + bx * Math.sin(angle);
    const nz = az * Math.cos(angle) + bz * Math.sin(angle);
    const distance = inset(lerp(shoulderOf(corner), shoulderOf(corner + 1), u));
    const toCentre = halfWidth - radius;
    const arc = Math.max(radius - distance, 0);
    const past = Math.max(distance - radius, 0);
    return [
      (ax + bx) * (toCentre - past) + nx * arc,
      (az + bz) * (toCentre - past) + nz * arc,
    ] as const;
  }

  /** Evenly spaced around the hole, with each corner's middle vertex on its diagonal. */
  function holeXZ(index: number, radius: number) {
    const angle = Math.PI / 4 + ((index - detail.corner / 2) * 2 * Math.PI) / around;
    return [Math.sin(angle) * radius, -Math.cos(angle) * radius] as const;
  }

  type Ring = (corner: number, step: number, index: number) => readonly [number, number, number];
  const rings: Ring[] = [
    (corner, step) => {
      const [x, z] = outlineXZ(corner, step, () => 0);
      return [x, 0, z];
    },
  ];
  for (let i = 0; i <= detail.shoulder; i += 1) {
    const angle = (i / detail.shoulder) * (Math.PI / 2);
    const top = height * (1 - DOME);
    rings.push((corner, step) => {
      const [x, z] = outlineXZ(corner, step, (shoulder) => shoulder * (1 - Math.cos(angle)));
      const u = step / detail.corner;
      const shoulder = lerp(shoulderOf(corner), shoulderOf(corner + 1), u);
      return [x, top - shoulder + shoulder * Math.sin(angle), z];
    });
  }
  rings.push((_corner, _step, index) => {
    const [x, z] = holeXZ(index, innerRadius);
    return [x, height, z];
  });
  if (detail.hole) {
    for (let i = 1; i <= FILLET_STEPS; i += 1) {
      const angle = (i / FILLET_STEPS) * (Math.PI / 2);
      rings.push((_corner, _step, index) => {
        const [x, z] = holeXZ(index, innerRadius - fillet * Math.sin(angle));
        return [x, height - fillet * (1 - Math.cos(angle)), z];
      });
    }
    rings.push((_corner, _step, index) => {
      const [x, z] = holeXZ(index, hole);
      return [x, 0, z];
    });
  }

  const positions = new Float32Array(rings.length * around * 3);
  const shades = new Float32Array(rings.length * around);
  rings.forEach((ring, r) => {
    for (let index = 0; index < around; index += 1) {
      const corner = Math.floor(index / (detail.corner + 1));
      const [x, y, z] = ring(corner, index % (detail.corner + 1), index);
      const vertex = r * around + index;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z;
      // Cheap ambient occlusion: darken the foot, the hole and the seams.
      shades[vertex] = 0.42 + 0.58 * Math.min(1, y / height) ** 1.6;
    }
  });

  const indices = new Uint16Array((rings.length - 1) * around * 6);
  let cursor = 0;
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let index = 0; index < around; index += 1) {
      const next = (index + 1) % around;
      const a = r * around + index;
      const b = (r + 1) * around + index;
      const c = r * around + next;
      const d = (r + 1) * around + next;
      indices.set([a, b, c, c, b, d], cursor);
      cursor += 6;
    }
  }
  return { positions, shades, indices };
}

/** Bead positions centred on the origin; row 0 is the far edge (negative z). */
export function collectBeads(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 128,
): BeadPlacement[] {
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && rgba[(y * width + x) * 4 + 3] >= alphaThreshold;
  const beads: BeadPlacement[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!filled(x, y)) continue;
      const offset = (y * width + x) * 4;
      beads.push({
        x: x - (width - 1) / 2,
        z: y - (height - 1) / 2,
        rgb: [rgba[offset], rgba[offset + 1], rgba[offset + 2]],
        exposure: exposureOf((dx, dy) => filled(x + dx, y + dy)),
      });
    }
  }
  return beads;
}

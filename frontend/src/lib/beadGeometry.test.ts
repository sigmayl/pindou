import { describe, expect, it } from "vitest";
import {
  beadDetail,
  beadShape,
  buildBeadMesh,
  collectBeads,
  exposureOf,
  INTERIOR,
  type BeadDetail,
  type BeadMesh,
} from "./beadGeometry";

const FULL: BeadDetail = { corner: 5, shoulder: 4, hole: true };
const ALL_EXPOSED = 0xff;

function outerRing(mesh: BeadMesh, detail: BeadDetail): [number, number][] {
  const around = 4 * (detail.corner + 1);
  return Array.from({ length: around }, (_, i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 2]]);
}

function reachOnDiagonal(mesh: BeadMesh, detail: BeadDetail): number {
  return Math.max(...outerRing(mesh, detail).map(([x, z]) => Math.min(Math.abs(x), Math.abs(z))));
}

describe("bead shape", () => {
  it("flattens, widens and closes the hole as it melts", () => {
    const cold = beadShape(0);
    const hot = beadShape(1);
    expect(hot.height).toBeLessThan(cold.height);
    expect(hot.halfWidth).toBeGreaterThan(cold.halfWidth);
    expect(hot.hole).toBeLessThan(cold.hole);
  });

  it("never grows past its cell", () => {
    expect(beadShape(1).halfWidth).toBe(0.5);
  });

  it("clamps melt", () => {
    expect(beadShape(-1)).toEqual(beadShape(0));
    expect(beadShape(2)).toEqual(beadShape(1));
  });
});

describe("exposure", () => {
  it("treats a fully surrounded bead as interior", () => {
    expect(exposureOf(() => true)).toBe(INTERIOR);
  });

  it("rounds only the corners next to a missing side", () => {
    const exposure = exposureOf((dx, dy) => !(dx === 0 && dy === -1));
    expect(exposure & 0xf).toBe(0b0001);
    expect(exposure >> 4).toBe(0b1001);
  });

  it("rounds a corner facing a missing diagonal without exposing a side", () => {
    const exposure = exposureOf((dx, dy) => !(dx === 1 && dy === 1));
    expect(exposure & 0xf).toBe(0);
    expect(exposure >> 4).toBe(0b0010);
  });
});

describe("bead mesh", () => {
  it("is a circle before ironing regardless of exposure", () => {
    for (const exposure of [INTERIOR, ALL_EXPOSED]) {
      for (const [x, z] of outerRing(buildBeadMesh(0, FULL, exposure), FULL)) {
        expect(Math.hypot(x, z)).toBeCloseTo(beadShape(0).halfWidth, 5);
      }
    }
  });

  it("presses interior beads into a square that fills the cell", () => {
    const mesh = buildBeadMesh(1, FULL, INTERIOR);
    expect(reachOnDiagonal(mesh, FULL)).toBeGreaterThan(0.49);
    for (const [x, z] of outerRing(mesh, FULL)) {
      expect(Math.max(Math.abs(x), Math.abs(z))).toBeGreaterThan(0.49);
    }
  });

  it("presses edge beads into a large rounded square", () => {
    const reach = reachOnDiagonal(buildBeadMesh(1, FULL, ALL_EXPOSED), FULL);
    expect(reach).toBeLessThan(0.45);
    expect(reach).toBeGreaterThan(0.3);
  });

  it("rounds only the exposed corners of a mixed bead", () => {
    const exposure = exposureOf((dx, dy) => !(dx === 0 && dy === -1));
    const ring = outerRing(buildBeadMesh(1, FULL, exposure), FULL);
    const reach = (sx: number, sz: number) =>
      Math.max(...ring.filter(([x, z]) => x * sx > 0 && z * sz > 0).map(([x, z]) => Math.min(Math.abs(x), Math.abs(z))));
    expect(reach(1, -1)).toBeLessThan(0.45);
    expect(reach(-1, -1)).toBeLessThan(0.45);
    expect(reach(1, 1)).toBeGreaterThan(0.49);
    expect(reach(-1, 1)).toBeGreaterThan(0.49);
  });

  it("stays inside its cell at every melt", () => {
    for (const melt of [0, 0.25, 0.5, 0.75, 1]) {
      const { positions } = buildBeadMesh(melt, FULL, ALL_EXPOSED);
      for (let i = 0; i < positions.length; i += 3) {
        expect(Math.abs(positions[i])).toBeLessThanOrEqual(0.5 + 1e-5);
        expect(Math.abs(positions[i + 2])).toBeLessThanOrEqual(0.5 + 1e-5);
      }
    }
  });

  it("winds the top surface upward", () => {
    for (const detail of [FULL, beadDetail(65536)]) {
      const { positions: p, indices } = buildBeadMesh(1, detail, INTERIOR);
      let up = 0;
      let down = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
        const top = Math.min(p[a * 3 + 1], p[b * 3 + 1], p[c * 3 + 1]);
        if (top < beadShape(1).height * 0.9) continue;
        const ux = p[b * 3] - p[a * 3];
        const uz = p[b * 3 + 2] - p[a * 3 + 2];
        const vx = p[c * 3] - p[a * 3];
        const vz = p[c * 3 + 2] - p[a * 3 + 2];
        const ny = uz * vx - ux * vz;
        if (ny > 1e-9) up += 1;
        if (ny < -1e-9) down += 1;
      }
      expect(up).toBeGreaterThan(0);
      expect(down).toBe(0);
    }
  });

  it("closes at the axis without a hole", () => {
    const detail: BeadDetail = { corner: 1, shoulder: 1, hole: false };
    const { positions } = buildBeadMesh(1, detail, INTERIOR);
    const around = 8;
    const last = positions.length / 3 - around;
    expect(Math.hypot(positions[last * 3], positions[last * 3 + 2])).toBeCloseTo(0);
  });
});

describe("beadDetail", () => {
  it("stays within the triangle budget at every tier boundary", () => {
    for (const count of [3000, 10000, 20000, 65536]) {
      const detail = beadDetail(count);
      expect(count * (buildBeadMesh(1, detail, INTERIOR).indices.length / 3)).toBeLessThanOrEqual(3_200_000);
    }
  });
});

describe("collectBeads", () => {
  it("centres the board and skips transparent cells", () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 0, 0, 7, 8, 9, 200, 4, 5, 6, 127]);
    expect(collectBeads(rgba, 2, 2).map(({ x, z, rgb }) => ({ x, z, rgb }))).toEqual([
      { x: -0.5, z: -0.5, rgb: [1, 2, 3] },
      { x: -0.5, z: 0.5, rgb: [7, 8, 9] },
    ]);
  });

  it("separates interior beads from edge beads", () => {
    const rgba = new Uint8ClampedArray(3 * 3 * 4).fill(255);
    const beads = collectBeads(rgba, 3, 3);
    expect(beads[4].exposure).toBe(INTERIOR);
    expect(beads.filter((bead) => bead.exposure === INTERIOR)).toHaveLength(1);
  });
});

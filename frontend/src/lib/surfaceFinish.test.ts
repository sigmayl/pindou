import { describe, expect, it } from "vitest";
import { buildReliefNormals, FINISHES, getFinish, RELIEF_PERIODS, reliefHeight, type ReliefKind } from "./surfaceFinish";

const KINDS: ReliefKind[] = ["grain", "scrub", "towel"];

describe("surface finishes", () => {
  it("offers the five finishes", () => {
    expect(FINISHES.map((finish) => finish.label)).toEqual(["正常", "细闪", "粗闪", "澡巾", "毛巾"]);
  });

  it("orders texture size: normal and glitter small, scrub medium, towel large", () => {
    expect(RELIEF_PERIODS.towel).toBeLessThan(RELIEF_PERIODS.scrub);
    expect(RELIEF_PERIODS.scrub).toBeLessThan(RELIEF_PERIODS.grain);
    for (const id of ["normal", "fine-glitter", "coarse-glitter"] as const) {
      expect(getFinish(id).relief).toBe("grain");
    }
    expect(getFinish("scrub").relief).toBe("scrub");
    expect(getFinish("towel").relief).toBe("towel");
  });

  it("only glitter finishes sparkle, and coarse flakes are larger", () => {
    expect(getFinish("normal").glint).toBeNull();
    expect(getFinish("towel").glint).toBeNull();
    expect(getFinish("scrub").glint).toBeNull();
    const fine = getFinish("fine-glitter").glint!;
    const coarse = getFinish("coarse-glitter").glint!;
    expect(1 / coarse.density).toBeGreaterThan(1 / fine.density);
    expect(coarse.strength).toBeGreaterThan(fine.strength);
  });

  it("tiles seamlessly", () => {
    for (const kind of KINDS) {
      for (const t of [0.1, 0.37, 0.8]) {
        expect(reliefHeight(kind, 0, t)).toBeCloseTo(reliefHeight(kind, 1 - 1e-9, t), 3);
        expect(reliefHeight(kind, t, 0)).toBeCloseTo(reliefHeight(kind, t, 1 - 1e-9), 3);
      }
    }
  });

  it("encodes unit-ish normals pointing out of the surface", () => {
    for (const kind of KINDS) {
      const normals = buildReliefNormals(kind, 64);
      expect(normals.length).toBe(64 * 64 * 4);
      for (let i = 0; i < normals.length; i += 4) expect(normals[i + 2]).toBeGreaterThan(127);
    }
  });
});

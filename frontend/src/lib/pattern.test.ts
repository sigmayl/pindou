import { describe, expect, it } from "vitest";
import { cellSizeFor, codeFontSize, compareCodes, rulerStep } from "./pattern";

describe("chart layout", () => {
  it("clamps the cell size", () => {
    expect(cellSizeFor(10, 20)).toBe(40);
    expect(cellSizeFor(128, 64)).toBe(25);
    expect(cellSizeFor(256, 256)).toBe(12);
  });

  it("numbers every cell only when the labels fit", () => {
    expect(rulerStep(40, 64, 14)).toBe(1);
    expect(rulerStep(25, 128, 13)).toBe(5);
    expect(rulerStep(12, 256, 11)).toBe(5);
    expect(rulerStep(2, 999, 14)).toBe(20);
    expect(rulerStep(1, 999, 14)).toBe(50);
  });

  it("drops codes that would be unreadable", () => {
    expect(codeFontSize(40, 3)).toBe(18);
    expect(codeFontSize(25, 3)).toBe(11);
    expect(codeFontSize(12, 3)).toBeNull();
  });

  it("sorts codes naturally", () => {
    expect(["A10", "B1", "A2"].sort(compareCodes)).toEqual(["A2", "A10", "B1"]);
  });
});

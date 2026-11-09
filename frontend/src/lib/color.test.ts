import { describe, expect, it } from "vitest";
import { packRgb, rgbToLab, roundHalfEven, unpackRgb } from "./color";

describe("color", () => {
  it("rounds like Python", () => {
    expect(roundHalfEven(12.5)).toBe(12);
    expect(roundHalfEven(13.5)).toBe(14);
    expect(roundHalfEven(12.4)).toBe(12);
  });

  it("converts sRGB to Lab", () => {
    const white = rgbToLab([255, 255, 255]);
    expect(white[0]).toBeCloseTo(100, 4);
    expect(white[1]).toBeCloseTo(0, 4);
    expect(white[2]).toBeCloseTo(0, 4);
    const black = rgbToLab([0, 0, 0]);
    expect(black[0]).toBeCloseTo(0, 5);
    expect(black[1]).toBeCloseTo(0, 5);
    expect(black[2]).toBeCloseTo(0, 5);
  });

  it("packs and unpacks RGB", () => {
    expect(unpackRgb(packRgb(18, 52, 86))).toEqual([18, 52, 86]);
  });
});

import { describe, expect, it } from "vitest";
import { contrastInk, packRgb } from "./color";

describe("color", () => {
  it("packs RGB", () => {
    expect(packRgb(18, 52, 86)).toBe(0x123456);
  });

  it("picks readable ink", () => {
    expect(contrastInk([255, 255, 255])).toBe("#111111");
    expect(contrastInk([0, 0, 0])).toBe("#ffffff");
  });
});

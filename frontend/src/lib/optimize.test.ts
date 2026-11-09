import { describe, expect, it } from "vitest";
import { optimizeBeads } from "./optimize";
import { getPalette, preparePalette } from "./palette";

function image(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = color(x, y);
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = a;
    }
  }
  return rgba;
}

const options = {
  maxColors: 4,
  smoothing: 0,
  cleanup: 0,
  protectEdges: false,
  dither: false,
};

describe("optimizeBeads", () => {
  it("maps colors to the selected palette", () => {
    const input = image(4, 4, (x) => (x < 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const result = optimizeBeads(input, 4, 4, "mard-221-alfonse-doudou", options);
    const palette = preparePalette("mard-221-alfonse-doudou");
    const allowed = new Set<number>();
    for (let i = 0; i < palette.count; i += 1) {
      allowed.add(
        (palette.rgb[i * 3] << 16) | (palette.rgb[i * 3 + 1] << 8) | palette.rgb[i * 3 + 2],
      );
    }
    for (let i = 0; i < 16; i += 1) {
      const packed =
        (result.rgba[i * 4] << 16) | (result.rgba[i * 4 + 1] << 8) | result.rgba[i * 4 + 2];
      expect(allowed.has(packed)).toBe(true);
      expect(result.rgba[i * 4 + 3]).toBe(255);
    }
    expect(result.colorsUsed).toBeGreaterThanOrEqual(2);
  });

  it("cleans a single isolated bead", () => {
    const input = image(5, 5, (x, y) =>
      x === 2 && y === 2 ? [20, 20, 20, 255] : [250, 250, 250, 255],
    );
    const result = optimizeBeads(input, 5, 5, "mard-221-alfonse-doudou", {
      ...options,
      maxColors: 8,
      cleanup: 1,
    });
    const center = (2 * 5 + 2) * 4;
    expect(result.rgba[center]).toBeGreaterThan(200);
    expect(result.rgba[center + 1]).toBeGreaterThan(200);
    expect(result.rgba[center + 2]).toBeGreaterThan(200);
  });

  it("preserves transparent pixels", () => {
    const input = image(3, 3, () => [255, 0, 0, 0]);
    const result = optimizeBeads(input, 3, 3, "mard-221-alfonse-doudou", options);
    for (let i = 0; i < 9; i += 1) expect(result.rgba[i * 4 + 3]).toBe(0);
    expect(result.colorsUsed).toBe(0);
  });

  it("exposes the expected palette size", () => {
    const palette = getPalette("mard-221-alfonse-doudou");
    expect(palette.colors.length).toBe(221);
    expect(palette.colors[0].code.length).toBeGreaterThan(0);
  });
});

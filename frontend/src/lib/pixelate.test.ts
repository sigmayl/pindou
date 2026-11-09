import { describe, expect, it } from "vitest";
import { getPalette, paletteIndex } from "./palette";
import { pixelateImage } from "./pixelate";

const SIZE = 160;

/** Smooth photo-like gradient with a transparent left strip. */
function sampleImage(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const offset = (y * SIZE + x) * 4;
      rgba[offset] = (x / SIZE) * 255;
      rgba[offset + 1] = (y / SIZE) * 255;
      rgba[offset + 2] = 120 + 80 * Math.sin((x + y) / 20);
      rgba[offset + 3] = x < SIZE / 4 ? 0 : 255;
    }
  }
  return rgba;
}

function visibleColors(rgba: Uint8ClampedArray): Set<number> {
  const colors = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 255) colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
  }
  return colors;
}

describe("pixelateImage", () => {
  it("outputs the exact grid with only bead colours", () => {
    const { codeByPacked } = paletteIndex("mard-221-alfonse-doudou");
    const { rgba } = pixelateImage(sampleImage(), SIZE, SIZE, {
      gridWidth: 20,
      gridHeight: 20,
      paletteId: "mard-221-alfonse-doudou",
      maxColors: null,
    });
    expect(rgba.length).toBe(20 * 20 * 4);
    for (const packed of visibleColors(rgba)) expect(codeByPacked.has(packed)).toBe(true);
  });

  it("keeps transparency from the mask as empty cells", () => {
    const { rgba } = pixelateImage(sampleImage(), SIZE, SIZE, {
      gridWidth: 20,
      gridHeight: 20,
      paletteId: "mard-221-alfonse-doudou",
      maxColors: 12,
    });
    expect(rgba[3]).toBe(0);
    expect(rgba[(19 * 4) + 3]).toBe(255);
  });

  it("holds the colour cap on standardized output", () => {
    const { rgba, colorsUsed } = pixelateImage(sampleImage(), SIZE, SIZE, {
      gridWidth: 32,
      gridHeight: 32,
      paletteId: "mard-221-alfonse-doudou",
      maxColors: 6,
    });
    expect(visibleColors(rgba).size).toBeLessThanOrEqual(6);
    expect(colorsUsed).toBe(visibleColors(rgba).size);
  });

  it("accepts palettes larger than 256 colours", () => {
    expect(getPalette("coco-291").colors.length).toBeGreaterThan(256);
    const { rgba } = pixelateImage(sampleImage(), SIZE, SIZE, {
      gridWidth: 16,
      gridHeight: 16,
      paletteId: "coco-291",
      maxColors: null,
    });
    const { codeByPacked } = paletteIndex("coco-291");
    for (const packed of visibleColors(rgba)) expect(codeByPacked.has(packed)).toBe(true);
  });

  it("is deterministic", () => {
    const options = { gridWidth: 20, gridHeight: 20, paletteId: "", maxColors: 8 };
    const first = pixelateImage(sampleImage(), SIZE, SIZE, options);
    const second = pixelateImage(sampleImage(), SIZE, SIZE, options);
    expect(first.rgba).toEqual(second.rgba);
  });
});

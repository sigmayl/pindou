import { describe, expect, it } from "vitest";
import { oklabToSrgb } from "./color.ts";
import { areaCells, resampleToTarget } from "./resample.ts";
import type { Image } from "./types.ts";

function image(width: number, height: number, pixel: (x: number, y: number) => number[]): Image {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

function rgbAt(lab: Float32Array, cell = 0): number[] {
  const rgb = new Uint8Array(3);
  oklabToSrgb(lab[cell * 3], lab[cell * 3 + 1], lab[cell * 3 + 2], rgb, 0);
  return Array.from(rgb);
}

describe("area resampling", () => {
  it("averages in linear light", () => {
    const cells = areaCells(image(2, 1, (x) => x ? [255, 255, 255, 255] : [0, 0, 0, 255]), 1, 1);
    expect(rgbAt(cells.lab)).toEqual([188, 188, 188]);
    expect(cells.alpha[0]).toBe(255);
  });

  it("uses fractional box coverage for non-integer ratios", () => {
    const cells = areaCells(image(3, 1, (x) => x === 1 ? [255, 255, 255, 255] : [0, 0, 0, 255]), 2, 1);
    expect(rgbAt(cells.lab, 0)).toEqual([156, 156, 156]);
    expect(rgbAt(cells.lab, 1)).toEqual([156, 156, 156]);
  });

  it("ignores hidden RGB and preserves the visible foreground colour", () => {
    const cells = areaCells(image(2, 1, (x) => x ? [0, 0, 255, 0] : [255, 0, 0, 255]), 1, 1);
    expect(rgbAt(cells.lab)).toEqual([255, 0, 0]);
    expect(cells.alpha[0]).toBe(255);
  });

  it("handles upsampling and reused source rows", () => {
    const cells = areaCells(image(1, 2, (_, y) => y ? [0, 0, 255, 255] : [255, 0, 0, 255]), 4, 8);
    for (let cell = 0; cell < 32; cell++) {
      expect(rgbAt(cells.lab, cell)).toEqual(cell < 16 ? [255, 0, 0] : [0, 0, 255]);
    }
  });

  it("gives the same fractional result when axes are transposed", () => {
    const pixel = (x: number, y: number) => [x * 32, y * 48, (x + y) * 20, (x + y) % 3 ? 255 : 64];
    const a = areaCells(image(7, 5, pixel), 3, 2);
    const b = areaCells(image(5, 7, (x, y) => pixel(y, x)), 2, 3);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const p = y * 3 + x, q = x * 2 + y;
      expect(a.alpha[p]).toBe(b.alpha[q]);
      for (let channel = 0; channel < 3; channel++) {
        expect(a.lab[p * 3 + channel]).toBeCloseTo(b.lab[q * 3 + channel], 6);
      }
    }
  });
});

describe("raster cell selection", () => {
  it("leaves cells empty when actual alpha coverage is below half", () => {
    const source = image(4, 4, (x) => [200, 100, 50, x < 2 ? 128 : 0]);
    expect(resampleToTarget(source, 1, 1).alpha[0]).toBe(0);
  });

  it("keeps cells when partial samples bring actual alpha coverage above half", () => {
    const source = image(4, 4, (x, y) => [200, 100, 50, y * 4 + x < 7 ? 255 : 64]);
    const cells = resampleToTarget(source, 1, 1);
    expect(cells.alpha[0]).toBe(255);
    expect(rgbAt(cells.lab)).toEqual([200, 100, 50]);
  });

  it("keeps thin dark lines during smoothing", () => {
    const cells = resampleToTarget(image(160, 160, (x) => x >= 82 && x < 84
      ? [0, 0, 0, 255] : [255, 255, 255, 255]), 20, 20);
    for (let y = 0; y < 20; y++) {
      expect(rgbAt(cells.lab, y * 20 + 10)[0]).toBeLessThan(100);
      expect(rgbAt(cells.lab, y * 20 + 8)).toEqual([255, 255, 255]);
    }
  });
});

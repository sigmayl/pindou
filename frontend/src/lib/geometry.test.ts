import { describe, expect, it } from "vitest";
import { computeLevels, dimensionsFor, pillowThumbSize } from "./geometry";

describe("geometry", () => {
  it("matches the backend geometry", () => {
    expect(dimensionsFor(1024, 768, 4)).toMatchObject({
      gridWidth: 256,
      gridHeight: 192,
    });
    expect(dimensionsFor(1024, 768, 6)).toMatchObject({
      resizedWidth: 682,
      resizedHeight: 512,
      gridWidth: 170,
      gridHeight: 128,
    });
  });

  it("uses half-even rounding", () => {
    expect(dimensionsFor(100, 100, 8)).toMatchObject({
      gridWidth: 12,
      gridHeight: 12,
    });
  });

  it("scales thumbnails like PIL", () => {
    expect(pillowThumbSize(2048, 1024)).toEqual({ width: 1024, height: 512 });
    expect(pillowThumbSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("marks tiny levels unavailable", () => {
    const levels = computeLevels(20, 20);
    expect(levels.find((level) => level.pixelSize === 4)?.available).toBe(true);
    expect(levels.find((level) => level.pixelSize === 8)?.available).toBe(false);
  });
});

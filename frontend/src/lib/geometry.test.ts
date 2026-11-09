import { describe, expect, it } from "vitest";
import { computeLevels, gridSizeFor } from "./geometry";

describe("geometry", () => {
  it("divides the image by the block size", () => {
    expect(gridSizeFor(1024, 768, 4)).toEqual({ gridWidth: 256, gridHeight: 192 });
    expect(gridSizeFor(800, 600, 8)).toEqual({ gridWidth: 100, gridHeight: 75 });
  });

  it("measures levels against a capped long side", () => {
    expect(gridSizeFor(2048, 1024, 8)).toEqual({ gridWidth: 128, gridHeight: 64 });
  });

  it("marks tiny levels unavailable", () => {
    const levels = computeLevels(20, 20);
    expect(levels.find((level) => level.pixelSize === 4)?.available).toBe(true);
    expect(levels.find((level) => level.pixelSize === 8)?.available).toBe(false);
  });
});

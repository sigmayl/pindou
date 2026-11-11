import { describe, expect, it } from "vitest";
import { BOARD_LEVEL, computeLevels, defaultLevel, gridSizeFor } from "./geometry";

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

  it("fits square, landscape and portrait images to the 104-cell board", () => {
    expect(gridSizeFor(1024, 1024, BOARD_LEVEL)).toEqual({ gridWidth: 104, gridHeight: 104 });
    expect(gridSizeFor(2048, 1536, BOARD_LEVEL)).toEqual({ gridWidth: 104, gridHeight: 78 });
    expect(gridSizeFor(600, 800, BOARD_LEVEL)).toEqual({ gridWidth: 78, gridHeight: 104 });
    expect(gridSizeFor(52, 52, BOARD_LEVEL)).toEqual({ gridWidth: 104, gridHeight: 104 });
  });

  it("offers the board with a bounded preview scale and preserves the default pixel level", () => {
    const levels = computeLevels(1024, 1024);
    const board = levels.find((level) => level.id === BOARD_LEVEL)!;
    expect(board).toMatchObject({ pixelSize: null, beads: 10816, available: true });
    expect(board.gridWidth * board.previewScale).toBeLessThanOrEqual(1024);
    expect(new Set(levels.map((level) => level.id)).size).toBe(levels.length);
    expect(defaultLevel(levels)).toBe(8);
    expect(defaultLevel(computeLevels(20, 20))).toBe(4);
  });

  it("disables the board for extremely narrow images", () => {
    expect(computeLevels(2048, 16).find((level) => level.id === BOARD_LEVEL)?.available).toBe(false);
    expect(gridSizeFor(2048, 16, BOARD_LEVEL)).toEqual({ gridWidth: 104, gridHeight: 1 });
  });
});

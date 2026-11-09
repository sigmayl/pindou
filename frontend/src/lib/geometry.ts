export const BLOCK_SIZES = [4, 6, 8, 12, 16, 24, 32, 48, 64] as const;

/** Levels are measured against the image scaled so its long side is at most this. */
const MAX_BASE_SIDE = 1024;
const MIN_GRID_SIDE = 4;

export interface LevelOption {
  pixelSize: number;
  gridWidth: number;
  gridHeight: number;
  beads: number;
  available: boolean;
}

export function gridSizeFor(
  width: number,
  height: number,
  pixelSize: number,
): { gridWidth: number; gridHeight: number } {
  const scale = Math.min(1, MAX_BASE_SIDE / Math.max(width, height));
  return {
    gridWidth: Math.max(1, Math.round((width * scale) / pixelSize)),
    gridHeight: Math.max(1, Math.round((height * scale) / pixelSize)),
  };
}

export function computeLevels(width: number, height: number): LevelOption[] {
  return BLOCK_SIZES.map((pixelSize) => {
    const { gridWidth, gridHeight } = gridSizeFor(width, height, pixelSize);
    return {
      pixelSize,
      gridWidth,
      gridHeight,
      beads: gridWidth * gridHeight,
      available: Math.min(gridWidth, gridHeight) >= MIN_GRID_SIDE,
    };
  });
}

export function defaultLevel(levels: LevelOption[]): number {
  const preferred = levels.find((level) => level.pixelSize === 8 && level.available);
  const fallback = levels.find((level) => level.available) ?? levels[0];
  return fallback ? (preferred ?? fallback).pixelSize : 8;
}

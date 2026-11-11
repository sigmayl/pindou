export const BLOCK_SIZES = [4, 6, 8, 12, 16, 24, 32, 48, 64] as const;
export const BOARD_LEVEL = 104;

/** Pixel-block levels are measured against an image whose long side is capped at this. */
const MAX_BASE_SIDE = 1024;
const MIN_GRID_SIDE = 4;

export interface LevelOption {
  id: number;
  /** null identifies the fixed 104-cell board preset. */
  pixelSize: number | null;
  previewScale: number;
  gridWidth: number;
  gridHeight: number;
  beads: number;
  available: boolean;
}

export function gridSizeFor(
  width: number,
  height: number,
  level: number,
): { gridWidth: number; gridHeight: number } {
  if (level === BOARD_LEVEL) {
    const scale = BOARD_LEVEL / Math.max(width, height);
    return {
      gridWidth: Math.max(1, Math.round(width * scale)),
      gridHeight: Math.max(1, Math.round(height * scale)),
    };
  }
  const scale = Math.min(1, MAX_BASE_SIDE / Math.max(width, height));
  return {
    gridWidth: Math.max(1, Math.round((width * scale) / level)),
    gridHeight: Math.max(1, Math.round((height * scale) / level)),
  };
}

export function computeLevels(width: number, height: number): LevelOption[] {
  const pixelLevels = BLOCK_SIZES.map((pixelSize) => {
    const { gridWidth, gridHeight } = gridSizeFor(width, height, pixelSize);
    return {
      id: pixelSize,
      pixelSize,
      previewScale: pixelSize,
      gridWidth,
      gridHeight,
      beads: gridWidth * gridHeight,
      available: Math.min(gridWidth, gridHeight) >= MIN_GRID_SIDE,
    };
  });
  const board = gridSizeFor(width, height, BOARD_LEVEL);
  return [
    {
      id: BOARD_LEVEL,
      pixelSize: null,
      previewScale: Math.floor(MAX_BASE_SIDE / BOARD_LEVEL),
      ...board,
      beads: board.gridWidth * board.gridHeight,
      available: Math.min(board.gridWidth, board.gridHeight) >= MIN_GRID_SIDE,
    },
    ...pixelLevels,
  ];
}

export function defaultLevel(levels: LevelOption[]): number {
  const preferred = levels.find((level) => level.pixelSize === 8 && level.available);
  const fallback = levels.find((level) => level.pixelSize !== null && level.available)
    ?? levels.find((level) => level.available)
    ?? levels[0];
  return fallback ? (preferred ?? fallback).id : 8;
}

export function levelLabel(level: number): string {
  return level === BOARD_LEVEL ? "104 格底板" : `${level}px 等级`;
}

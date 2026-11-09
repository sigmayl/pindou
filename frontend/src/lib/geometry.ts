import { roundHalfEven } from "./color";

export const BLOCK_SIZES = [4, 6, 8, 12, 16, 24, 32, 48, 64] as const;
export const MAX_SOURCE_SIDE = 1024;
export const MIN_MODEL_GRID = 16;

export interface PixelateMeta {
  pixel_size: number;
  source_width: number;
  source_height: number;
  thumb_width: number;
  thumb_height: number;
  resized_width: number;
  resized_height: number;
  crop_left: number;
  crop_top: number;
  crop_width: number;
  crop_height: number;
  grid_width: number;
  grid_height: number;
}

export interface LevelOption {
  pixelSize: number;
  gridWidth: number;
  gridHeight: number;
  beads: number;
  available: boolean;
}

function roundAspect(value: number, key: (candidate: number) => number): number {
  const floor = Math.floor(value);
  const ceil = Math.ceil(value);
  return Math.max(key(floor) <= key(ceil) ? floor : ceil, 1);
}

/** Mirrors PIL Image.thumbnail(size, NEAREST) dimension selection. */
export function pillowThumbSize(width: number, height: number, size = MAX_SOURCE_SIDE) {
  if (width <= size && height <= size) return { width, height };
  const aspect = width / height;
  let x = Math.floor(size);
  let y = Math.floor(size);
  if (x / y >= aspect) {
    x = roundAspect(y * aspect, (candidate) => Math.abs(aspect - candidate / y));
  } else {
    y = roundAspect(x / aspect, (candidate) =>
      candidate === 0 ? 0 : Math.abs(aspect - x / candidate),
    );
  }
  return { width: Math.max(1, x), height: Math.max(1, y) };
}

export function dimensionsFor(
  width: number,
  height: number,
  pixelSize: number,
): { gridWidth: number; gridHeight: number; resizedWidth: number; resizedHeight: number } {
  const thumb = pillowThumbSize(width, height);
  const resizedWidth = Math.floor((thumb.width * 4) / pixelSize);
  const resizedHeight = Math.floor((thumb.height * 4) / pixelSize);
  return {
    resizedWidth,
    resizedHeight,
    gridWidth: roundHalfEven(resizedWidth / 4),
    gridHeight: roundHalfEven(resizedHeight / 4),
  };
}

export function computeLevels(width: number, height: number): LevelOption[] {
  return BLOCK_SIZES.map((pixelSize) => {
    const dims = dimensionsFor(width, height, pixelSize);
    const available =
      Math.min(dims.resizedWidth, dims.resizedHeight) >= MIN_MODEL_GRID &&
      dims.gridWidth >= 1 &&
      dims.gridHeight >= 1;
    return {
      pixelSize,
      gridWidth: dims.gridWidth,
      gridHeight: dims.gridHeight,
      beads: dims.gridWidth * dims.gridHeight,
      available,
    };
  });
}

export function defaultLevel(levels: LevelOption[]): number {
  const preferred = levels.find((level) => level.pixelSize === 8 && level.available);
  const fallback = levels.find((level) => level.available) ?? levels[0];
  return fallback ? (preferred ?? fallback).pixelSize : 8;
}

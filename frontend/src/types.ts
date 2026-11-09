export interface BeadGrid {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface GeneratedResult {
  gridWidth: number;
  gridHeight: number;
  level: number;
  paletteTitle: string | null;
  previewUrl: string;
  patternUrl: string | null;
  beadCount: number;
  colorCount: number;
  elapsedMs: number;
  pixelBlob: Blob;
  patternBlob: Blob | null;
  beadGrid: BeadGrid;
}

export type ResultTab = "pixel" | "pattern" | "bead3d";

export type Phase = "idle" | "loading" | "rmbg" | "pixelate";

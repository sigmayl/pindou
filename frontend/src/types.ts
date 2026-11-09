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
}

export type ResultTab = "pixel" | "pattern";

export type Phase = "idle" | "loading" | "rmbg" | "pixelate" | "optimizing";

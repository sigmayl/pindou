import { paletteIndex } from "./palette";
import { convert, PixilateError } from "./pixilate/pipeline.ts";

/** Slider position meaning "no cap"; Pixilate quantizes to at most 64 colours. */
export const UNLIMITED_COLORS = 65;

export interface PixelateOptions {
  gridWidth: number;
  gridHeight: number;
  /** Empty keeps Pixilate's own colours. */
  paletteId: string;
  /** null leaves the colour count to Pixilate. */
  maxColors: number | null;
}

export interface PixelateResult {
  rgba: Uint8ClampedArray;
  colorsUsed: number;
}

/** Run Pixilate on RGBA pixels; bead colour standardization happens inside its palette stage. */
export function pixelateImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: PixelateOptions,
): PixelateResult {
  try {
    const { image, report } = convert(
      { width, height, data: rgba },
      {
        targetW: options.gridWidth,
        targetH: options.gridHeight,
        fit: "stretch",
        colors: options.maxColors ?? "auto",
        palette: options.paletteId ? paletteIndex(options.paletteId).rgb : null,
      },
    );
    return { rgba: image.data, colorsUsed: report.output.colors ?? 0 };
  } catch (error) {
    if (error instanceof PixilateError && error.code === "empty-visible-region") {
      throw new Error("图片没有可见内容，请检查抠图结果。");
    }
    throw error;
  }
}

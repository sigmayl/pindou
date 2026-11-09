import type { PixelateMeta } from "./geometry";

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败。"))),
      type,
      quality,
    );
  });
}

async function encodeSmallest(canvas: HTMLCanvasElement): Promise<Blob> {
  const [png, jpeg] = await Promise.all([
    blobFromCanvas(canvas, "image/png"),
    blobFromCanvas(canvas, "image/jpeg", 0.95),
  ]);
  return png.size <= jpeg.size ? png : jpeg;
}

export interface SourceImage {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  rgba: Uint8ClampedArray;
  /** EXIF-normalized, smallest of PNG/JPEG, used for model uploads. */
  upload: Blob;
  previewUrl: string;
}

export interface MaskData {
  width: number;
  height: number;
  data: Uint8Array;
}

const DEFAULT_MAX_SOURCE_PIXELS = 20_000_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
// The model only ever sees a 1024px thumbnail, so keeping a larger working
// image wastes mobile memory without improving the bead grid.
const MAX_WORKING_SIDE = 2048;

export interface UploadLimits {
  maxBytes?: number;
  maxPixels?: number;
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器不支持 Canvas 2D。");
  return context;
}

async function decodeBitmap(file: Blob): Promise<ImageBitmap> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadSourceImage(
  file: File,
  limits: UploadLimits = {},
): Promise<SourceImage> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxPixels = limits.maxPixels ?? DEFAULT_MAX_SOURCE_PIXELS;
  if (file.size > maxBytes) {
    throw new Error(`图片不能超过 ${Math.round(maxBytes / (1024 * 1024))} MB。`);
  }
  const bitmap = await decodeBitmap(file);
  try {
    if (bitmap.width * bitmap.height > maxPixels) {
      throw new Error(
        `图片像素数过大，请使用不超过 ${Math.round(maxPixels / 1_000_000)} MP 的图片。`,
      );
    }
    if (Math.min(bitmap.width, bitmap.height) < 16) {
      throw new Error("图片最短边需至少 16 像素。");
    }
    const scale = Math.min(1, MAX_WORKING_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas2d(width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const upload = await encodeSmallest(context.canvas);
    return {
      width,
      height,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      rgba: new Uint8ClampedArray(imageData.data),
      upload,
      previewUrl: URL.createObjectURL(upload),
    };
  } finally {
    bitmap.close();
  }
}

/** Composite the source over white, optionally through a matte, for the model. */
export async function composeForeground(
  source: SourceImage,
  mask: MaskData | null,
): Promise<Blob> {
  if (!mask) return source.upload;
  const context = canvas2d(source.width, source.height);
  const image = context.createImageData(source.width, source.height);
  const rgba = source.rgba;
  const data = image.data;
  for (let i = 0; i < source.width * source.height; i += 1) {
    const alpha = mask.data[i] / 255;
    data[i * 4] = Math.round(rgba[i * 4] * alpha + 255 * (1 - alpha));
    data[i * 4 + 1] = Math.round(rgba[i * 4 + 1] * alpha + 255 * (1 - alpha));
    data[i * 4 + 2] = Math.round(rgba[i * 4 + 2] * alpha + 255 * (1 - alpha));
    data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return encodeSmallest(context.canvas);
}

function blobFromDataUri(dataUri: string): Blob {
  const marker = dataUri.indexOf(",");
  if (marker < 0) throw new Error("图片数据格式错误。");
  const header = dataUri.slice(5, marker);
  const mime = header.split(";")[0] || "image/png";
  const binary = atob(dataUri.slice(marker + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface GridImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export async function rgbaFromDataUri(dataUri: string): Promise<GridImage> {
  const blob = blobFromDataUri(dataUri);
  const bitmap = await decodeBitmap(blob);
  try {
    const context = canvas2d(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgba: new Uint8ClampedArray(image.data),
    };
  } finally {
    bitmap.close();
  }
}

export async function maskFromDataUri(
  dataUri: string,
  targetWidth: number,
  targetHeight: number,
): Promise<MaskData> {
  const blob = blobFromDataUri(dataUri);
  const bitmap = await decodeBitmap(blob);
  try {
    const context = canvas2d(targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const image = context.getImageData(0, 0, targetWidth, targetHeight);
    const data = new Uint8Array(targetWidth * targetHeight);
    for (let i = 0; i < data.length; i += 1) data[i] = image.data[i * 4];
    return { width: targetWidth, height: targetHeight, data };
  } finally {
    bitmap.close();
  }
}

/**
 * Align a full-resolution mask to the model's bead grid.
 * The three nearest-neighbour steps mirror the original Python pipeline.
 */
export function alignMaskToGrid(mask: MaskData | null, meta: PixelateMeta): Uint8Array {
  const gridSize = meta.grid_width * meta.grid_height;
  if (!mask) return new Uint8Array(gridSize).fill(255);

  const nearest = (
    data: Uint8Array,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number,
  ): Uint8Array => {
    if (srcWidth === dstWidth && srcHeight === dstHeight) return data;
    const output = new Uint8Array(dstWidth * dstHeight);
    for (let y = 0; y < dstHeight; y += 1) {
      const sourceY = Math.min(
        srcHeight - 1,
        Math.floor(((y + 0.5) * srcHeight) / dstHeight),
      );
      const sourceRow = sourceY * srcWidth;
      const targetRow = y * dstWidth;
      for (let x = 0; x < dstWidth; x += 1) {
        const sourceX = Math.min(
          srcWidth - 1,
          Math.floor(((x + 0.5) * srcWidth) / dstWidth),
        );
        output[targetRow + x] = data[sourceRow + sourceX];
      }
    }
    return output;
  };

  // PIL thumbnail -> resize -> crop (with padding) -> resize, all NEAREST.
  const thumb = nearest(
    mask.data,
    mask.width,
    mask.height,
    meta.thumb_width,
    meta.thumb_height,
  );
  const resized = nearest(
    thumb,
    meta.thumb_width,
    meta.thumb_height,
    meta.resized_width,
    meta.resized_height,
  );
  const alpha = new Uint8Array(gridSize);
  for (let y = 0; y < meta.grid_height; y += 1) {
    const cropY =
      meta.crop_top +
      Math.floor(((y + 0.5) * meta.crop_height) / meta.grid_height);
    for (let x = 0; x < meta.grid_width; x += 1) {
      const cropX =
        meta.crop_left +
        Math.floor(((x + 0.5) * meta.crop_width) / meta.grid_width);
      if (
        cropX < 0 ||
        cropY < 0 ||
        cropX >= meta.resized_width ||
        cropY >= meta.resized_height
      ) {
        alpha[y * meta.grid_width + x] = 0;
        continue;
      }
      alpha[y * meta.grid_width + x] = resized[cropY * meta.resized_width + cropX];
    }
  }
  return alpha;
}

export function applyGridAlpha(
  rgba: Uint8ClampedArray,
  alpha: Uint8Array,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i += 1) output[i * 4 + 3] = alpha[i];
  return output;
}

export function cutoutDataUrl(
  source: SourceImage,
  mask: MaskData,
  maxSide = 1400,
): string {
  const context = canvas2d(source.width, source.height);
  const image = context.createImageData(source.width, source.height);
  image.data.set(source.rgba);
  for (let i = 0; i < mask.data.length; i += 1) image.data[i * 4 + 3] = mask.data[i];
  context.putImageData(image, 0, 0);
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  if (scale >= 1) return context.canvas.toDataURL("image/png");
  const output = canvas2d(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = "high";
  output.drawImage(context.canvas, 0, 0, output.canvas.width, output.canvas.height);
  return output.canvas.toDataURL("image/png");
}

export function upscaleRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): HTMLCanvasElement {
  const source = canvas2d(width, height);
  source.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const output = document.createElement("canvas");
  output.width = width * scale;
  output.height = height * scale;
  const context = output.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 2D。");
  context.imageSmoothingEnabled = false;
  context.drawImage(source.canvas, 0, 0, output.width, output.height);
  return output;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片导出失败。"))),
      "image/png",
    );
  });
}

export function dataUriFromCanvas(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

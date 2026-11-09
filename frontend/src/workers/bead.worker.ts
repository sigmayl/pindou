import { pixelateImage, type PixelateOptions } from "../lib/pixelate";

interface PixelateRequest {
  rgba: ArrayBuffer;
  width: number;
  height: number;
  options: PixelateOptions;
}

interface PixelateResponse {
  rgba: ArrayBuffer;
  colorsUsed: number;
}

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<PixelateRequest>) => {
  try {
    const { rgba, width, height, options } = event.data;
    const result = pixelateImage(new Uint8ClampedArray(rgba), width, height, options);
    const response: PixelateResponse = {
      rgba: result.rgba.buffer as ArrayBuffer,
      colorsUsed: result.colorsUsed,
    };
    worker.postMessage(response, [response.rgba]);
  } catch (error) {
    worker.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};

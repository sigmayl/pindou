import { optimizeBeads, type OptimizeOptions } from "../lib/optimize";

interface OptimizeRequest {
  rgba: ArrayBuffer;
  width: number;
  height: number;
  paletteId: string;
  options: OptimizeOptions;
}

interface OptimizeResponse {
  rgba: ArrayBuffer;
  colorsUsed: number;
}

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<OptimizeRequest>) => {
  try {
    const { rgba, width, height, paletteId, options } = event.data;
    const result = optimizeBeads(
      new Uint8ClampedArray(rgba),
      width,
      height,
      paletteId,
      options,
    );
    const buffer = result.rgba.buffer as ArrayBuffer;
    const response: OptimizeResponse = {
      rgba: buffer,
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

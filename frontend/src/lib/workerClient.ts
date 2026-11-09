import type { OptimizeOptions } from "../lib/optimize";

export interface OptimizeJobResult {
  rgba: Uint8ClampedArray;
  colorsUsed: number;
}

/** Run the CPU-heavy bead optimization off the main thread. */
export function optimizeInWorker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  paletteId: string,
  options: OptimizeOptions,
): Promise<OptimizeJobResult> {
  const copy = new Uint8ClampedArray(rgba);
  const worker = new Worker(new URL("../workers/bead.worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const cleanup = () => worker.terminate();
    worker.onmessage = (
      event: MessageEvent<
        | { rgba: ArrayBuffer; colorsUsed: number }
        | { error: string }
      >,
    ) => {
      cleanup();
      if ("error" in event.data) {
        reject(new Error(event.data.error));
        return;
      }
      resolve({
        rgba: new Uint8ClampedArray(event.data.rgba),
        colorsUsed: event.data.colorsUsed,
      });
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "颜色优化失败。"));
    };
    worker.postMessage(
      {
        rgba: copy.buffer as ArrayBuffer,
        width,
        height,
        paletteId,
        options,
      },
      [copy.buffer as ArrayBuffer],
    );
  });
}

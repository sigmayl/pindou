import type { PixelateOptions, PixelateResult } from "./pixelate";

/** Run the CPU-heavy pixel conversion off the main thread. */
export function pixelateInWorker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: PixelateOptions,
): Promise<PixelateResult> {
  const copy = new Uint8ClampedArray(rgba);
  const worker = new Worker(new URL("../workers/bead.worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const cleanup = () => worker.terminate();
    worker.onmessage = (
      event: MessageEvent<{ rgba: ArrayBuffer; colorsUsed: number } | { error: string }>,
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
      reject(new Error(event.message || "像素化失败。"));
    };
    worker.postMessage({ rgba: copy.buffer as ArrayBuffer, width, height, options }, [
      copy.buffer as ArrayBuffer,
    ]);
  });
}

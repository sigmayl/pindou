import type { PixelateMeta } from "../lib/geometry";

export interface PixelateResponse {
  image: string;
  meta: PixelateMeta;
  elapsed_ms: number;
}

export interface MatteResponse {
  mask: string;
  width: number;
  height: number;
  elapsed_ms: number;
}

export interface ServiceInfo {
  name: string;
  version: string;
  environment: string;
  pixel_sizes: number[];
  max_upload_bytes: number;
  max_image_pixels: number;
  rmbg_enabled: boolean;
  rmbg_loaded: boolean;
  pixel_model_loaded: boolean;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit, timeoutMs = 180_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...init.headers },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok) {
      const body = payload as { error?: { code?: string; message?: string } } | null;
      throw new ApiError(
        response.status,
        body?.error?.code ?? "http_error",
        body?.error?.message ?? `请求失败（HTTP ${response.status}）。`,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "timeout", "推理超时，请稍后重试或换一张更小的图片。");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "network_error", "无法连接推理服务，请确认后端已启动。");
  } finally {
    window.clearTimeout(timer);
  }
}

function imageForm(blob: Blob, field?: Record<string, string>): FormData {
  const form = new FormData();
  const extension = blob.type === "image/png" ? "png" : "jpg";
  form.append("image", blob, `source.${extension}`);
  if (field) {
    for (const [key, value] of Object.entries(field)) form.append(key, value);
  }
  return form;
}

export function getInfo(): Promise<ServiceInfo> {
  return request<ServiceInfo>("/api/v1/info", { method: "GET" }, 10_000);
}

export function pixelate(image: Blob, pixelSize: number): Promise<PixelateResponse> {
  return request<PixelateResponse>("/api/v1/pixelate", {
    method: "POST",
    body: imageForm(image, { pixel_size: String(pixelSize) }),
  });
}

export function removeBackground(image: Blob): Promise<MatteResponse> {
  return request<MatteResponse>(
    "/api/v1/remove-background",
    {
      method: "POST",
      body: imageForm(image),
    },
    600_000,
  );
}

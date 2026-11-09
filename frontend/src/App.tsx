import { useEffect, useMemo, useState } from "react";
import { ApiError, getInfo, pixelate, removeBackground, type ServiceInfo } from "./api/client";
import { CutoutIcon, CpuIcon, GridIcon, LogoMark, PaletteIcon, SparkIcon } from "./components/Icons";
import { LevelPicker } from "./components/LevelPicker";
import { ResultPanel } from "./components/ResultPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { UploadCard } from "./components/UploadCard";
import {
  computeLevels,
  defaultLevel,
  type LevelOption,
} from "./lib/geometry";
import {
  alignMaskToGrid,
  applyGridAlpha,
  canvasToBlob,
  composeForeground,
  cutoutDataUrl,
  loadSourceImage,
  maskFromDataUri,
  rgbaFromDataUri,
  upscaleRgba,
  type MaskData,
  type SourceImage,
} from "./lib/image";
import { getPalette } from "./lib/palette";
import { renderPattern } from "./lib/pattern";
import { optimizeInWorker } from "./lib/workerClient";
import type { GeneratedResult, Phase, ResultTab } from "./types";

const BUSY_LABELS: Record<Exclude<Phase, "idle">, string> = {
  loading: "正在读取图片…",
  rmbg: "正在抠图，CPU 推理中…",
  pixelate: "正在生成像素画…",
  optimizing: "正在本地匹配颜色…",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生了未知错误，请重试。";
}

function visibleColorCount(rgba: Uint8ClampedArray): number {
  const colors = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
  }
  return colors.size;
}

function visibleBeadCount(rgba: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= 128) count += 1;
  return count;
}

function EmptyPreview() {
  return (
    <div className="empty-preview">
      <div className="empty-grid" aria-hidden="true">
        {Array.from({ length: 64 }, (_, index) => (
          <span key={index} className={`cell cell-${(index * 7) % 9}`} />
        ))}
      </div>
      <h2>生成结果会出现在这里</h2>
      <p>先上传图片，再选择等级和色表，点击“生成拼豆图纸”。</p>
      <div className="empty-steps">
        <span><b>1</b> 上传</span>
        <span><b>2</b> 抠图（可选）</span>
        <span><b>3</b> 生成</span>
      </div>
    </div>
  );
}

export default function App() {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [mask, setMask] = useState<MaskData | null>(null);
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [level, setLevel] = useState(8);
  const [paletteId, setPaletteId] = useState("mard-221-alfonse-doudou");
  const [small, setSmall] = useState(false);
  const [maxColors, setMaxColors] = useState(24);
  const [smoothing, setSmoothing] = useState(35);
  const [cleanup, setCleanup] = useState(2);
  const [protectEdges, setProtectEdges] = useState(true);
  const [dither, setDither] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [tab, setTab] = useState<ResultTab>("pixel");
  const [error, setError] = useState<string | null>(null);
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo | null>(null);
  const [serviceState, setServiceState] = useState<"checking" | "online" | "offline">(
    "checking",
  );

  const busy = phase !== "idle";
  const levels: LevelOption[] = useMemo(() => {
    if (!source) return [];
    const all = computeLevels(source.width, source.height);
    if (!serviceInfo) return all;
    return all.filter((item) => serviceInfo.pixel_sizes.includes(item.pixelSize));
  }, [source, serviceInfo]);
  const palette = paletteId ? getPalette(paletteId) : null;

  useEffect(() => {
    let cancelled = false;
    getInfo()
      .then((info) => {
        if (cancelled) return;
        setServiceInfo(info);
        setServiceState("online");
      })
      .catch(() => {
        if (cancelled) return;
        setServiceInfo(null);
        setServiceState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.previewUrl);
  }, [source]);

  useEffect(() => {
    return () => {
      if (!result) return;
      URL.revokeObjectURL(result.previewUrl);
      if (result.patternUrl) URL.revokeObjectURL(result.patternUrl);
    };
  }, [result]);

  useEffect(() => {
    if (levels.length > 0 && !levels.some((item) => item.pixelSize === level)) {
      setLevel(defaultLevel(levels));
    }
  }, [levels, level]);

  useEffect(() => {
    setResult(null);
  }, [
    level,
    paletteId,
    small,
    maxColors,
    smoothing,
    cleanup,
    protectEdges,
    dither,
  ]);

  async function handleFile(file: File) {
    if (busy) return;
    setError(null);
    setPhase("loading");
    try {
      const loaded = await loadSourceImage(
        file,
        serviceInfo
          ? {
              maxBytes: serviceInfo.max_upload_bytes,
              maxPixels: serviceInfo.max_image_pixels,
            }
          : undefined,
      );
      setSource(loaded);
      setMask(null);
      setCutoutUrl(null);
      setResult(null);
      setTab("pixel");
      const available = computeLevels(loaded.width, loaded.height).filter(
        (item) => !serviceInfo || serviceInfo.pixel_sizes.includes(item.pixelSize),
      );
      setLevel(defaultLevel(available));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  function clearSource() {
    if (busy) return;
    setSource(null);
    setMask(null);
    setCutoutUrl(null);
    setResult(null);
    setError(null);
  }

  async function handleCutout() {
    if (!source || busy) return;
    if (serviceInfo && !serviceInfo.rmbg_enabled) {
      setError("服务端未启用自动抠图，请直接在右侧生成像素画。");
      return;
    }
    setError(null);
    setPhase("rmbg");
    try {
      const response = await removeBackground(source.upload);
      const nextMask = await maskFromDataUri(response.mask, source.width, source.height);
      setMask(nextMask);
      setCutoutUrl(cutoutDataUrl(source, nextMask));
      setResult(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  function removeMask() {
    setMask(null);
    setCutoutUrl(null);
    setResult(null);
  }

  async function handleGenerate() {
    if (!source || busy) return;
    setError(null);
    setResult(null);
    setPhase("pixelate");
    try {
      const foreground = await composeForeground(source, mask);
      const response = await pixelate(foreground, level);
      const meta = response.meta;
      const grid = await rgbaFromDataUri(response.image);
      if (grid.width !== meta.grid_width || grid.height !== meta.grid_height) {
        throw new Error("服务端返回的网格尺寸不一致，请重试。");
      }

      const alpha = alignMaskToGrid(mask, meta);
      let rgba = applyGridAlpha(grid.rgba, alpha);
      let colorsUsed = visibleColorCount(rgba);
      const beadCount = visibleBeadCount(rgba);

      if (paletteId) {
        setPhase("optimizing");
        const optimized = await optimizeInWorker(
          rgba,
          meta.grid_width,
          meta.grid_height,
          paletteId,
          {
            maxColors,
            smoothing,
            cleanup,
            protectEdges,
            dither,
            alphaThreshold: 128,
          },
        );
        rgba = optimized.rgba;
        colorsUsed = optimized.colorsUsed;
      }

      const scale = small ? 1 : level;
      const previewCanvas = upscaleRgba(rgba, meta.grid_width, meta.grid_height, scale);
      const pixelBlob = await canvasToBlob(previewCanvas);

      let patternBlob: Blob | null = null;
      let patternStats: { beadCount: number; colorCount: number } | null = null;
      if (paletteId) {
        const pattern = renderPattern(
          rgba,
          meta.grid_width,
          meta.grid_height,
          paletteId,
        );
        patternBlob = await canvasToBlob(pattern.canvas);
        patternStats = pattern.stats;
      }

      const previewUrl = URL.createObjectURL(pixelBlob);
      const patternUrl = patternBlob ? URL.createObjectURL(patternBlob) : null;
      setResult({
        gridWidth: meta.grid_width,
        gridHeight: meta.grid_height,
        level,
        paletteTitle: palette?.title ?? null,
        previewUrl,
        patternUrl,
        beadCount: patternStats?.beadCount ?? beadCount,
        colorCount: patternStats?.colorCount ?? colorsUsed,
        elapsedMs: response.elapsed_ms,
        pixelBlob,
        patternBlob,
      });
      setTab(paletteId ? "pattern" : "pixel");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="拼豆工坊首页">
          <LogoMark />
          <span>
            <strong>拼豆工坊</strong>
            <small>PINDOU CONVERT</small>
          </span>
        </a>
        <div className="topbar-meta">
          <span className="pill">
            <CpuIcon width={15} height={15} /> CPU 推理
          </span>
          <span className="pill">无需登录</span>
          <span className={`status-dot status-${serviceState}`} title={
            serviceState === "online"
              ? "推理服务已连接"
              : serviceState === "offline"
                ? "推理服务未连接"
                : "正在检查推理服务"
          }>
            <span />
            {serviceState === "online"
              ? "服务在线"
              : serviceState === "offline"
                ? "服务未连接"
                : "检查中"}
          </span>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">照片 → 像素画 → 拼豆图纸</span>
            <h1>
              把喜欢的画面，
              <br />
              <em>变成一颗颗拼豆。</em>
            </h1>
            <p>
              自动抠图与像素化由自有 CPU 服务推理；颜色匹配、限色优化和图纸排版全部在浏览器本地完成。
              不需要账号，图片不会被用于训练。
            </p>
            <div className="hero-points">
              <span><SparkIcon width={15} height={15} /> 一键像素化</span>
              <span><PaletteIcon width={15} height={15} /> 11 套拼豆色表</span>
              <span><GridIcon width={15} height={15} /> 可打印图纸</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-card art-back" />
            <div className="art-card art-mid" />
            <div className="art-card art-front">
              <div className="art-grid">
                {Array.from({ length: 49 }, (_, index) => (
                  <span key={index} className={`art-cell art-${(index * 5) % 7}`} />
                ))}
              </div>
              <small>28 × 28 · 图纸预览</small>
            </div>
          </div>
        </section>

        <section className="workspace">
          <aside className="control-column">
            <div className="control-scroll">
            <UploadCard
              source={source}
              disabled={busy}
              onFile={handleFile}
              onClear={clearSource}
            />

            <div className="panel cutout-panel">
              <div className="step-heading">
                <span className="step-index">2</span>
                <div>
                  <h2>自动抠图</h2>
                  <p>可选。不抠图则保留原图背景。</p>
                </div>
              </div>
              <div className="cutout-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!source || busy || (serviceInfo !== null && !serviceInfo.rmbg_enabled)}
                  onClick={handleCutout}
                >
                  <CutoutIcon width={18} height={18} />
                  {phase === "rmbg" ? "抠图中…" : mask ? "重新抠图" : "RMBG 自动抠图"}
                </button>
                {mask && (
                  <button type="button" className="text-button" onClick={removeMask} disabled={busy}>
                    移除蒙版
                  </button>
                )}
              </div>
              {cutoutUrl && (
                <div className="cutout-preview">
                  <img src={cutoutUrl} alt="透明背景抠图预览" />
                  <span className="checker-label">透明背景预览</span>
                </div>
              )}
              {!cutoutUrl && (
                <p className="hint">
                  RMBG-2.0 会生成透明蒙版；像素画和图纸都会沿用这个轮廓。
                </p>
              )}
              {serviceInfo && !serviceInfo.rmbg_enabled && (
                <p className="hint warning">当前部署未启用自动抠图，可直接生成像素画。</p>
              )}
            </div>

            {source && (
              <div className="panel">
                <div className="panel-title-row">
                  <h2>像素等级</h2>
                  <span className="muted">数字越大，格子越粗</span>
                </div>
                <LevelPicker
                  levels={levels}
                  value={level}
                  disabled={busy}
                  onChange={setLevel}
                />
              </div>
            )}

            <div className="panel">
              <SettingsPanel
                paletteId={paletteId}
                maxColors={maxColors}
                smoothing={smoothing}
                cleanup={cleanup}
                protectEdges={protectEdges}
                dither={dither}
                small={small}
                disabled={busy}
                onPalette={setPaletteId}
                onMaxColors={setMaxColors}
                onSmoothing={setSmoothing}
                onCleanup={setCleanup}
                onProtectEdges={setProtectEdges}
                onDither={setDither}
                onSmall={setSmall}
              />
            </div>
            </div>

            <div className="control-footer">
            <button
              type="button"
              className="primary-button generate-button"
              disabled={!source || busy}
              onClick={handleGenerate}
            >
              {busy ? <span className="spinner" /> : <SparkIcon width={19} height={19} />}
              {phase === "idle" ? "生成拼豆图纸" : BUSY_LABELS[phase]}
            </button>
            <p className="privacy-note">
              图片仅用于本次推理，服务端不会保存上传文件或生成结果。
            </p>
            </div>
          </aside>

          <section className="preview-column">
            {result ? (
              <ResultPanel
                result={result}
                tab={tab}
                onTab={setTab}
                onRegenerate={handleGenerate}
              />
            ) : source ? (
              <div className="stage">
                <div className="stage-header">
                  <div>
                    <span className="eyebrow">预览</span>
                    <h2>{busy ? BUSY_LABELS[phase as Exclude<Phase, "idle">] : "等待生成"}</h2>
                  </div>
                  <span className="stage-tag">{level}px 等级</span>
                </div>
                <div className={`stage-images ${mask ? "has-cutout" : ""}`}>
                  <figure>
                    <img src={source.previewUrl} alt="源图预览" />
                    <figcaption>原图</figcaption>
                  </figure>
                  {mask && cutoutUrl && (
                    <figure>
                      <img src={cutoutUrl} alt="抠图预览" />
                      <figcaption>抠图</figcaption>
                    </figure>
                  )}
                </div>
                <div className="stage-placeholder">
                  <GridIcon width={30} height={30} />
                  <p>
                    {busy
                      ? "请稍候，完成后会自动切换结果。"
                      : "调整左侧参数后，点击“生成拼豆图纸”。"}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyPreview />
            )}
          </section>
        </section>

        <section className="how-it-works">
          <article>
            <span className="feature-icon"><CutoutIcon /></span>
            <h3>本地优先的流程</h3>
            <p>抠图与像素化只发送必要的图片到后端；蒙版对齐、色表匹配和图纸绘制都在浏览器内完成。</p>
          </article>
          <article>
            <span className="feature-icon"><CpuIcon /></span>
            <h3>CPU 友好</h3>
            <p>后端只加载推理所需子网络，CPU 线程和并发可配置，适合普通云主机部署。</p>
          </article>
          <article>
            <span className="feature-icon"><PaletteIcon /></span>
            <h3>真实拼豆色号</h3>
            <p>内置 MARD、COCO、Artkal 等 11 套色表，按 CIE Lab 色差匹配并统计每色用量。</p>
          </article>
        </section>
      </main>

      <footer className="footer">
        <p>
          模型：Pixelization（ashleykleynhans） · RMBG-2.0（briaai） · 色表数据：
          HansBug/pindou-color-data（MIT）。使用前请自行确认模型与色表的许可。
        </p>
        <p>拼豆工坊 · 像素画与图纸生成工具</p>
      </footer>

      {error && (
        <div className="toast" role="alert">
          <span className="toast-icon">!</span>
          <p>{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

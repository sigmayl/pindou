import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getInfo, removeBackground, type ServiceInfo } from "./api/client";
import { CutoutIcon, CpuIcon, GridIcon, LogoMark, PaletteIcon, SparkIcon } from "./components/Icons";
import { LevelPicker } from "./components/LevelPicker";
import { ResultPanel } from "./components/ResultPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { UploadCard } from "./components/UploadCard";
import {
  computeLevels,
  defaultLevel,
  levelLabel,
  type LevelOption,
} from "./lib/geometry";
import {
  canvasToBlob,
  cutoutDataUrl,
  foregroundRgba,
  loadSourceImage,
  maskFromDataUri,
  upscaleRgba,
  type MaskData,
  type SourceImage,
} from "./lib/image";
import { getPalette } from "./lib/palette";
import { renderPattern } from "./lib/pattern";
import { UNLIMITED_COLORS } from "./lib/pixelate";
import { pixelateInWorker } from "./lib/workerClient";
import type { GeneratedResult, Phase, ResultTab } from "./types";

const BUSY_LABELS: Record<Exclude<Phase, "idle">, string> = {
  loading: "正在读取图片…",
  rmbg: "正在抠图，CPU 推理中…",
  pixelate: "正在本地生成像素画…",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生了未知错误，请重试。";
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [tab, setTab] = useState<ResultTab>("pixel");
  const [error, setError] = useState<string | null>(null);
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo | null>(null);
  const [serviceState, setServiceState] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const previewRef = useRef<HTMLElement>(null);

  const busy = phase !== "idle";
  const levels: LevelOption[] = useMemo(() => {
    return source ? computeLevels(source.width, source.height) : [];
  }, [source]);
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
    if (levels.length > 0 && !levels.some((item) => item.id === level && item.available)) {
      setLevel(defaultLevel(levels));
    }
  }, [levels, level]);

  useEffect(() => {
    setResult(null);
  }, [level, paletteId, small, maxColors]);

  // On phones the controls stack above the result, so bring the new preview into view.
  useEffect(() => {
    if (!result || !window.matchMedia("(max-width: 900px)").matches) return;
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

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
      setLevel(defaultLevel(computeLevels(loaded.width, loaded.height)));
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
    const selectedLevel = levels.find((item) => item.id === level && item.available);
    if (!selectedLevel) return;
    setError(null);
    setResult(null);
    setPhase("pixelate");
    try {
      const started = performance.now();
      const { gridWidth, gridHeight } = selectedLevel;
      const { rgba, colorsUsed } = await pixelateInWorker(
        foregroundRgba(source, mask),
        source.width,
        source.height,
        {
          gridWidth,
          gridHeight,
          paletteId,
          maxColors: maxColors >= UNLIMITED_COLORS ? null : maxColors,
        },
      );
      const elapsedMs = performance.now() - started;
      const beadCount = visibleBeadCount(rgba);

      const scale = small ? 1 : selectedLevel.previewScale;
      const previewCanvas = upscaleRgba(rgba, gridWidth, gridHeight, scale);
      const pixelBlob = await canvasToBlob(previewCanvas);

      let patternBlob: Blob | null = null;
      let patternStats: { beadCount: number; colorCount: number } | null = null;
      if (paletteId) {
        const pattern = renderPattern(rgba, gridWidth, gridHeight, paletteId);
        patternBlob = await canvasToBlob(pattern.canvas);
        patternStats = pattern.stats;
      }

      const previewUrl = URL.createObjectURL(pixelBlob);
      const patternUrl = patternBlob ? URL.createObjectURL(patternBlob) : null;
      setResult({
        gridWidth,
        gridHeight,
        level,
        paletteTitle: palette?.title ?? null,
        previewUrl,
        patternUrl,
        beadCount: patternStats?.beadCount ?? beadCount,
        colorCount: patternStats?.colorCount ?? colorsUsed,
        elapsedMs,
        pixelBlob,
        patternBlob,
        beadGrid: { width: gridWidth, height: gridHeight, rgba },
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
            <CpuIcon width={15} height={15} /> 本地像素化
          </span>
          <span className="pill">无需登录</span>
          <span className={`status-dot status-${serviceState}`} title={
            serviceState === "online"
              ? "抠图服务已连接"
              : serviceState === "offline"
                ? "抠图服务未连接，像素化不受影响"
                : "正在检查抠图服务"
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
              像素化和拼豆色号标准化由 Pixilate 在浏览器本地完成，只有可选的自动抠图才会把图片发送到自有 CPU 服务。
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
                  <span className="muted">104 格适配底板，px 越大格子越粗</span>
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
                small={small}
                disabled={busy}
                onPalette={setPaletteId}
                onMaxColors={setMaxColors}
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
              只有使用自动抠图时图片才会上传，服务端不会保存上传文件或生成结果。
            </p>
            </div>
          </aside>

          <section className="preview-column" ref={previewRef}>
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
                  <span className="stage-tag">{levelLabel(level)}</span>
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
            <p>像素化、色号标准化和图纸绘制都在浏览器内完成，只有自动抠图才会把图片发送到后端。</p>
          </article>
          <article>
            <span className="feature-icon"><CpuIcon /></span>
            <h3>CPU 友好</h3>
            <p>后端只负责可选的 RMBG 抠图，CPU 线程和并发可配置，适合普通云主机部署。</p>
          </article>
          <article>
            <span className="feature-icon"><PaletteIcon /></span>
            <h3>真实拼豆色号</h3>
            <p>内置 MARD、COCO、Artkal 等 11 套色表，在 Pixilate 的调色板阶段按 OKLab 色差直接归到真实色号，并统计每色用量。</p>
          </article>
        </section>
      </main>

      <footer className="footer">
        <p>
          像素化：Pixilate（Shilo，MIT） · 抠图模型：RMBG-2.0（briaai） · 色表数据：
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

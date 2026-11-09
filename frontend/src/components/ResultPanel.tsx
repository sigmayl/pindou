import { lazy, Suspense, useRef, useState } from "react";
import { DEFAULT_FINISH, type FinishId } from "../lib/surfaceFinish";
import type { GeneratedResult, ResultTab } from "../types";
import type { BeadViewerHandle } from "./BeadViewer";
import { DownloadIcon, GridIcon } from "./Icons";

// three.js is large; only fetch it when the 3D tab is opened.
const BeadViewer = lazy(() => import("./BeadViewer"));

const DOWNLOAD_LABELS: Record<ResultTab, string> = {
  pixel: "像素画",
  pattern: "图纸",
  bead3d: "3D 效果图",
};

interface Props {
  result: GeneratedResult;
  tab: ResultTab;
  onTab: (tab: ResultTab) => void;
  onRegenerate: () => void;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ResultPanel({ result, tab, onTab, onRegenerate }: Props) {
  const [melt, setMelt] = useState(1);
  const [finish, setFinish] = useState<FinishId>(DEFAULT_FINISH);
  const [patternZoomed, setPatternZoomed] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const viewerRef = useRef<BeadViewerHandle>(null);
  const patternAvailable = Boolean(result.patternUrl);
  const activeTab = tab === "pattern" && !patternAvailable ? "pixel" : tab;

  async function handleDownload() {
    setDownloadError(null);
    if (activeTab === "bead3d") {
      try {
        const blob = await viewerRef.current?.capture();
        if (blob) download(blob, `pindou-3d-${result.level}px.png`);
      } catch (caught) {
        setDownloadError(caught instanceof Error ? caught.message : "导出失败，请重试。");
      }
    } else if (activeTab === "pattern" && result.patternBlob) {
      download(result.patternBlob, `pindou-pattern-${result.level}px.png`);
    } else {
      download(result.pixelBlob, `pindou-pixel-${result.level}px.png`);
    }
  }

  return (
    <div className="result-panel">
      <div className="result-header">
        <div>
          <span className="eyebrow">生成结果</span>
          <h2>
            {result.gridWidth} × {result.gridHeight} 格{" "}
            <span className="result-sub">· {result.level}px 等级</span>
          </h2>
        </div>
        <div className="result-actions">
          <button type="button" className="ghost-button" onClick={onRegenerate}>
            重新生成
          </button>
          <button
            type="button"
            className="primary-button compact"
            onClick={handleDownload}
          >
            <DownloadIcon width={17} height={17} />
            下载 {DOWNLOAD_LABELS[activeTab]}
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pixel"}
          className={activeTab === "pixel" ? "is-active" : ""}
          onClick={() => onTab("pixel")}
        >
          像素画
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pattern"}
          className={activeTab === "pattern" ? "is-active" : ""}
          disabled={!patternAvailable}
          onClick={() => onTab("pattern")}
          title={patternAvailable ? undefined : "选择拼豆色表后才会生成图纸"}
        >
          拼豆图纸
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "bead3d"}
          className={activeTab === "bead3d" ? "is-active" : ""}
          onClick={() => onTab("bead3d")}
        >
          3D 预览
        </button>
      </div>

      <div
        className={`result-canvas ${
          activeTab === "pattern"
            ? `is-pattern ${patternZoomed ? "is-zoomed" : ""}`
            : activeTab === "bead3d"
              ? "is-3d"
              : ""
        }`}
      >
        {activeTab === "pixel" && (
          <img
            className="pixel-image"
            src={result.previewUrl}
            alt={`${result.gridWidth} × ${result.gridHeight} 像素画`}
          />
        )}
        {activeTab === "pattern" && (
          <button
            type="button"
            className="pattern-zoom"
            aria-pressed={patternZoomed}
            title={patternZoomed ? "点击缩小到适应宽度" : "点击放大到原始尺寸"}
            onClick={() => setPatternZoomed((zoomed) => !zoomed)}
          >
            <img
              className="pattern-image"
              src={result.patternUrl ?? ""}
              alt="拼豆图纸与色号图例"
            />
          </button>
        )}
        {activeTab === "bead3d" && (
          <Suspense fallback={<p className="bead-viewer-loading">正在加载 3D 预览…</p>}>
            <BeadViewer
              ref={viewerRef}
              grid={result.beadGrid}
              melt={melt}
              finish={finish}
              onMelt={setMelt}
              onFinish={setFinish}
            />
          </Suspense>
        )}
      </div>
      {downloadError && <p className="hint warning">{downloadError}</p>}

      <div className="stats-row">
        <div className="stat">
          <GridIcon width={17} height={17} />
          <span>
            <strong>{result.beadCount.toLocaleString("zh-CN")}</strong> 颗拼豆
          </span>
        </div>
        <div className="stat">
          <span className="stat-dot" />
          <span>
            <strong>{result.colorCount}</strong> 种颜色
          </span>
        </div>
        <div className="stat">
          <span className="stat-dot" />
          <span>
            本地转换 <strong>{Math.round(result.elapsedMs)}</strong> ms
          </span>
        </div>
        {result.paletteTitle && (
          <div className="stat">
            <span className="stat-dot" />
            <span>{result.paletteTitle}</span>
          </div>
        )}
      </div>

      <p className="result-note">
        像素画已包含透明边缘。图纸中的每个有色格代表一颗拼豆，点击图纸可放大查看坐标和色号；3D 预览模拟空心豆被熨烫压成方块的效果，并可切换表面纹理，颜色与实物会略有差异。
      </p>
    </div>
  );
}

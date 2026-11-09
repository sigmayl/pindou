import type { GeneratedResult, ResultTab } from "../types";
import { DownloadIcon, GridIcon } from "./Icons";

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
  const patternAvailable = Boolean(result.patternUrl);
  const activeTab = tab === "pattern" && !patternAvailable ? "pixel" : tab;
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
            onClick={() => {
              if (activeTab === "pattern" && result.patternBlob) {
                download(result.patternBlob, `pindou-pattern-${result.level}px.png`);
              } else {
                download(result.pixelBlob, `pindou-pixel-${result.level}px.png`);
              }
            }}
          >
            <DownloadIcon width={17} height={17} />
            下载 {activeTab === "pattern" ? "图纸" : "像素画"}
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
      </div>

      <div className={`result-canvas ${activeTab === "pattern" ? "is-pattern" : ""}`}>
        {activeTab === "pixel" ? (
          <img
            className="pixel-image"
            src={result.previewUrl}
            alt={`${result.gridWidth} × ${result.gridHeight} 像素画`}
          />
        ) : (
          <img
            className="pattern-image"
            src={result.patternUrl ?? ""}
            alt="拼豆图纸与色号图例"
          />
        )}
      </div>

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
            服务端推理 <strong>{Math.round(result.elapsedMs)}</strong> ms
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
        像素画已包含透明边缘。图纸中的每个有色格代表一颗拼豆，图例按色号统计用量。
      </p>
    </div>
  );
}

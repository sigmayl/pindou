import { getPalette, PALETTES } from "../lib/palette";
import { PaletteIcon } from "./Icons";

interface Props {
  paletteId: string;
  maxColors: number;
  smoothing: number;
  cleanup: number;
  protectEdges: boolean;
  dither: boolean;
  small: boolean;
  disabled: boolean;
  onPalette: (value: string) => void;
  onMaxColors: (value: number) => void;
  onSmoothing: (value: number) => void;
  onCleanup: (value: number) => void;
  onProtectEdges: (value: boolean) => void;
  onDither: (value: boolean) => void;
  onSmall: (value: boolean) => void;
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className={`toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

export function SettingsPanel({
  paletteId,
  maxColors,
  smoothing,
  cleanup,
  protectEdges,
  dither,
  small,
  disabled,
  onPalette,
  onMaxColors,
  onSmoothing,
  onCleanup,
  onProtectEdges,
  onDither,
  onSmall,
}: Props) {
  const palette = paletteId ? getPalette(paletteId) : null;
  return (
    <div className="settings-panel">
      <div className="step-heading">
        <span className="step-index">3</span>
        <div>
          <h2>颜色与图纸</h2>
          <p>颜色匹配和图纸生成全部在浏览器中完成。</p>
        </div>
      </div>

      <label className="field">
        <span className="field-label">
          <PaletteIcon width={16} height={16} /> 拼豆色表
        </span>
        <select
          value={paletteId}
          disabled={disabled}
          onChange={(event) => onPalette(event.target.value)}
        >
          <option value="">不标准化（保留模型颜色）</option>
          {PALETTES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.colors.length} 色
            </option>
          ))}
        </select>
      </label>

      {palette && (
        <div className="palette-strip" aria-hidden="true">
          {palette.colors.slice(0, 14).map((color) => (
            <span
              key={`${color.code}-${color.rgb.join("-")}`}
              style={{ background: `rgb(${color.rgb.join(",")})` }}
              title={`${color.code} · rgb(${color.rgb.join(",")})`}
            />
          ))}
          <em>{palette.title}</em>
        </div>
      )}

      <details className={`advanced ${palette ? "" : "is-muted"}`}>
        <summary>
          高级优化参数
          <span>
            {maxColors} 色 · 平滑 {smoothing}% · 清理 {cleanup} 颗
          </span>
        </summary>
        <div className="advanced-body">
        <div className="slider-row">
          <label htmlFor="max-colors">
            最大颜色数 <output>{maxColors}</output>
          </label>
          <input
            id="max-colors"
            type="range"
            min={1}
            max={128}
            step={1}
            value={maxColors}
            disabled={disabled || !palette}
            onChange={(event) => onMaxColors(Number(event.target.value))}
          />
          <small>越少越好备货，细节也越少。</small>
        </div>

        <div className="slider-row">
          <label htmlFor="smoothing">
            区域平滑 <output>{smoothing}%</output>
          </label>
          <input
            id="smoothing"
            type="range"
            min={0}
            max={100}
            step={1}
            value={smoothing}
            disabled={disabled || !palette}
            onChange={(event) => onSmoothing(Number(event.target.value))}
          />
          <small>减少零散色块，过高会抹掉细节。</small>
        </div>

        <div className="slider-row">
          <label htmlFor="cleanup">
            孤立区域清理 <output>{cleanup} 颗</output>
          </label>
          <input
            id="cleanup"
            type="range"
            min={0}
            max={3}
            step={1}
            value={cleanup}
            disabled={disabled || !palette}
            onChange={(event) => onCleanup(Number(event.target.value))}
          />
          <small>0 表示关闭；只合并不超过阈值的四连通区域。</small>
        </div>

        <div className="toggle-list">
          <Toggle
            checked={protectEdges}
            disabled={disabled || !palette}
            onChange={onProtectEdges}
            label="边缘保护"
            hint="避免轮廓在平滑和清理时被吃掉。"
          />
          <Toggle
            checked={dither}
            disabled={disabled || !palette}
            onChange={onDither}
            label="有序抖动"
            hint="可能增加零散拼豆，建议先关闭。"
          />
        </div>
        </div>
      </details>

      <Toggle
        checked={small}
        disabled={disabled}
        onChange={onSmall}
        label="导出原始像素尺寸"
        hint="关闭时按所选等级放大，便于查看。"
      />
    </div>
  );
}

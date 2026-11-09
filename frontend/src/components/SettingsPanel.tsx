import { getPalette, PALETTES } from "../lib/palette";
import { UNLIMITED_COLORS } from "../lib/pixelate";
import { PaletteIcon } from "./Icons";

interface Props {
  paletteId: string;
  maxColors: number;
  small: boolean;
  disabled: boolean;
  onPalette: (value: string) => void;
  onMaxColors: (value: number) => void;
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
  small,
  disabled,
  onPalette,
  onMaxColors,
  onSmall,
}: Props) {
  const palette = paletteId ? getPalette(paletteId) : null;
  return (
    <div className="settings-panel">
      <div className="step-heading">
        <span className="step-index">3</span>
        <div>
          <h2>颜色与图纸</h2>
          <p>像素化时直接归到所选色表的真实色号。</p>
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
          <option value="">不标准化（保留原图颜色）</option>
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

      <div className="slider-row">
        <label htmlFor="max-colors">
          最大颜色数{" "}
          <output>{maxColors >= UNLIMITED_COLORS ? "不限" : maxColors}</output>
        </label>
        <input
          id="max-colors"
          type="range"
          min={1}
          max={UNLIMITED_COLORS}
          step={1}
          value={maxColors}
          disabled={disabled}
          onChange={(event) => onMaxColors(Number(event.target.value))}
        />
        <small>越少越好备货，细节也越少。</small>
      </div>

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

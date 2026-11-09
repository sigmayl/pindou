import type { LevelOption } from "../lib/geometry";

interface Props {
  levels: LevelOption[];
  value: number;
  disabled: boolean;
  onChange: (pixelSize: number) => void;
}

export function LevelPicker({ levels, value, disabled, onChange }: Props) {
  return (
    <div className="level-grid" role="radiogroup" aria-label="像素等级">
      {levels.map((level, index) => (
        <button
          key={level.pixelSize}
          type="button"
          role="radio"
          aria-checked={value === level.pixelSize}
          className={`level-card ${value === level.pixelSize ? "is-active" : ""}`}
          disabled={disabled || !level.available}
          onClick={() => onChange(level.pixelSize)}
          title={!level.available ? "该等级对当前图片太小" : undefined}
        >
          <span className="level-index">L{index + 1}</span>
          <strong>{level.pixelSize}px</strong>
          <span className="level-dims">
            {level.available ? `${level.gridWidth} × ${level.gridHeight}` : "不可用"}
          </span>
          <span className="level-count">
            {level.available ? `${level.beads.toLocaleString("zh-CN")} 格` : "图片太小"}
          </span>
        </button>
      ))}
    </div>
  );
}

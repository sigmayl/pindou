import type { LevelOption } from "../lib/geometry";

interface Props {
  levels: LevelOption[];
  value: number;
  disabled: boolean;
  onChange: (level: number) => void;
}

export function LevelPicker({ levels, value, disabled, onChange }: Props) {
  return (
    <div className="level-grid" role="radiogroup" aria-label="像素等级">
      {levels.map((level, index) => (
        <button
          key={level.id}
          type="button"
          role="radio"
          aria-checked={value === level.id}
          className={`level-card ${level.pixelSize === null ? "is-board" : ""} ${value === level.id ? "is-active" : ""}`}
          disabled={disabled || !level.available}
          onClick={() => onChange(level.id)}
          title={
            !level.available ? "该等级对当前图片太小"
              : level.pixelSize === null ? "最长边 104 格，保持原图比例，适配 104 × 104 拼豆底板"
                : undefined
          }
        >
          <span className="level-index">{level.pixelSize === null ? "常用底板" : `L${index}`}</span>
          <strong>{level.pixelSize === null ? "104 格" : `${level.pixelSize}px`}</strong>
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

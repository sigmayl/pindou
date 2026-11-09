import { contrastInk, packRgb, type RGB } from "./color";
import { getPalette, paletteIndex } from "./palette";

const FONT_STACK =
  '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif';

const INK = "#252a31";
const INK_SOFT = "#6b7280";
const ACCENT = "#b85d2c";
const RULER_LIGHT = "#f8f5ee";
const RULER_DARK = "#ece6da";
const PEG_DOT = "#e2ddd2";

const MARGIN = 40;
const HEADER_HEIGHT = 104;
const LEGEND_COLUMN = 176;
const LEGEND_ROW = 46;
const CHIP_WIDTH = 66;
const CHIP_HEIGHT = 32;

export interface PatternStats {
  beadCount: number;
  colorCount: number;
}

export interface PatternResult {
  canvas: HTMLCanvasElement;
  stats: PatternStats;
}

interface BeadCell {
  code: string;
  rgb: RGB;
}

interface BeadEntry extends BeadCell {
  count: number;
}

interface ChartFrame {
  x0: number;
  y0: number;
  cell: number;
  width: number;
  height: number;
  ruler: number;
  rulerFont: number;
}

/** Bigger cells for small boards so codes stay legible; capped to keep the PNG printable. */
export function cellSizeFor(width: number, height: number): number {
  return Math.max(12, Math.min(40, Math.floor(3200 / Math.max(width, height))));
}

/** Smallest label interval whose numbers do not collide on the ruler. */
export function rulerStep(cell: number, maxIndex: number, fontSize: number): number {
  const labelWidth = String(maxIndex).length * fontSize * 0.62 + 4;
  return [1, 5, 10, 20].find((step) => step * cell >= labelWidth) ?? 50;
}

/** Font size that fits the longest code in a cell, or null when it would be unreadable. */
export function codeFontSize(cell: number, longestCode: number): number | null {
  const size = Math.min(
    Math.floor(cell * 0.46),
    Math.floor((cell - 3) / (Math.max(1, longestCode) * 0.62)),
  );
  return size >= 7 ? size : null;
}

/** Natural order, so A2 comes before A10. */
export function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

function drawHeader(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  title: string,
  meta: string,
  hint: string,
) {
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = INK;
  context.font = `700 28px ${FONT_STACK}`;
  context.fillText(title, MARGIN, MARGIN + 18);
  context.fillStyle = INK_SOFT;
  context.font = `400 15px ${FONT_STACK}`;
  context.fillText(meta, MARGIN, MARGIN + 46, canvasWidth - MARGIN * 2);
  context.font = `400 13px ${FONT_STACK}`;
  context.fillText(hint, MARGIN, MARGIN + 68, canvasWidth - MARGIN * 2);
}

function drawCells(
  context: CanvasRenderingContext2D,
  cells: (BeadCell | null)[],
  frame: ChartFrame,
) {
  const { x0, y0, cell, width, height } = frame;
  const pegRadius = Math.max(1, cell * 0.08);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bead = cells[y * width + x];
      if (bead) {
        context.fillStyle = `rgb(${bead.rgb[0]}, ${bead.rgb[1]}, ${bead.rgb[2]})`;
        context.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
      } else {
        context.fillStyle = PEG_DOT;
        context.beginPath();
        context.arc(x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, pegRadius, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
}

function strokeGridLines(
  context: CanvasRenderingContext2D,
  frame: ChartFrame,
  matches: (index: number) => boolean,
  style: string,
  lineWidth: number,
) {
  const { x0, y0, cell, width, height } = frame;
  const offset = lineWidth % 2 === 1 ? 0.5 : 0;
  context.strokeStyle = style;
  context.lineWidth = lineWidth;
  context.beginPath();
  for (let x = 0; x <= width; x += 1) {
    if (!matches(x)) continue;
    context.moveTo(x0 + x * cell + offset, y0);
    context.lineTo(x0 + x * cell + offset, y0 + height * cell);
  }
  for (let y = 0; y <= height; y += 1) {
    if (!matches(y)) continue;
    context.moveTo(x0, y0 + y * cell + offset);
    context.lineTo(x0 + width * cell, y0 + y * cell + offset);
  }
  context.stroke();
}

function drawGrid(context: CanvasRenderingContext2D, frame: ChartFrame) {
  strokeGridLines(context, frame, (i) => i % 5 !== 0, "rgba(37, 42, 49, 0.2)", 1);
  strokeGridLines(context, frame, (i) => i % 5 === 0 && i % 10 !== 0, "rgba(37, 42, 49, 0.5)", 1);
  strokeGridLines(context, frame, (i) => i % 10 === 0, "rgba(37, 42, 49, 0.85)", 2);
  context.strokeStyle = INK;
  context.lineWidth = 2;
  context.strokeRect(frame.x0, frame.y0, frame.width * frame.cell, frame.height * frame.cell);
}

function drawCodes(
  context: CanvasRenderingContext2D,
  cells: (BeadCell | null)[],
  frame: ChartFrame,
  fontSize: number,
) {
  const { x0, y0, cell, width, height } = frame;
  context.font = `600 ${fontSize}px ${FONT_STACK}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bead = cells[y * width + x];
      if (!bead) continue;
      context.fillStyle = contrastInk(bead.rgb);
      context.fillText(bead.code, x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell + 0.5);
    }
  }
}

/** One axis of rulers (both sides), banded every 10 cells and numbered from 1. */
function drawRulerAxis(
  context: CanvasRenderingContext2D,
  frame: ChartFrame,
  axis: "x" | "y",
) {
  const { x0, y0, cell, ruler } = frame;
  const count = axis === "x" ? frame.width : frame.height;
  const across = axis === "x" ? frame.height : frame.width;
  const start = axis === "x" ? x0 : y0;
  const near = (axis === "x" ? y0 : x0) - ruler;
  const far = (axis === "x" ? y0 : x0) + across * cell;
  const step = rulerStep(cell, count, frame.rulerFont);
  const rect = (along: number, side: number, length: number) =>
    axis === "x"
      ? context.fillRect(along, side, length, ruler)
      : context.fillRect(side, along, ruler, length);

  for (let band = 0; band * 10 < count; band += 1) {
    const length = Math.min(10, count - band * 10) * cell;
    context.fillStyle = band % 2 === 0 ? RULER_LIGHT : RULER_DARK;
    rect(start + band * 10 * cell, near, length);
    rect(start + band * 10 * cell, far, length);
  }

  context.font = `600 ${frame.rulerFont}px ${FONT_STACK}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = INK;
  for (let index = 1; index <= count; index += 1) {
    if (index !== 1 && index % step !== 0) continue;
    const along = start + (index - 0.5) * cell;
    for (const side of [near + ruler / 2, far + ruler / 2]) {
      if (axis === "x") context.fillText(String(index), along, side);
      else context.fillText(String(index), side, along);
    }
  }

  // Centre marks: triangles on the outer edge of each ruler, pointing at the grid.
  const middle = start + (count * cell) / 2;
  const size = 6;
  context.fillStyle = ACCENT;
  for (const [edge, direction] of [
    [near, 1],
    [far + ruler, -1],
  ] as const) {
    context.beginPath();
    if (axis === "x") {
      context.moveTo(middle - size, edge);
      context.lineTo(middle + size, edge);
      context.lineTo(middle, edge + direction * size);
    } else {
      context.moveTo(edge, middle - size);
      context.lineTo(edge, middle + size);
      context.lineTo(edge + direction * size, middle);
    }
    context.closePath();
    context.fill();
  }
}

function drawLegend(
  context: CanvasRenderingContext2D,
  entries: BeadEntry[],
  beadCount: number,
  top: number,
  columnWidth: number,
  columns: number,
) {
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = INK;
  context.font = `700 20px ${FONT_STACK}`;
  context.fillText("色号用量", MARGIN, top);
  context.fillStyle = INK_SOFT;
  context.font = `400 14px ${FONT_STACK}`;
  context.fillText(`${entries.length} 色 · 共 ${beadCount} 颗`, MARGIN + 92, top);

  context.textBaseline = "middle";
  entries.forEach((entry, index) => {
    const left = MARGIN + (index % columns) * columnWidth;
    const y = top + 18 + Math.floor(index / columns) * LEGEND_ROW;
    context.fillStyle = `rgb(${entry.rgb[0]}, ${entry.rgb[1]}, ${entry.rgb[2]})`;
    context.beginPath();
    context.roundRect(left, y, CHIP_WIDTH, CHIP_HEIGHT, 7);
    context.fill();
    context.strokeStyle = "rgba(37, 42, 49, 0.25)";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = contrastInk(entry.rgb);
    context.font = `700 15px ${FONT_STACK}`;
    context.textAlign = "center";
    context.fillText(entry.code, left + CHIP_WIDTH / 2, y + CHIP_HEIGHT / 2 + 0.5);
    context.fillStyle = INK;
    context.font = `500 15px ${FONT_STACK}`;
    context.textAlign = "left";
    context.fillText(`× ${entry.count}`, left + CHIP_WIDTH + 10, y + CHIP_HEIGHT / 2 + 0.5);
  });
}

/**
 * Render a printable bead chart: colour grid with codes, numbered rulers on all
 * four sides, 5/10-cell guide lines, centre marks and a counted legend.
 * Each coloured cell is one bead; empty cells show only a peg dot.
 */
export function renderPattern(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  paletteId: string,
  alphaThreshold = 128,
): PatternResult {
  const palette = getPalette(paletteId);
  const { codeByPacked } = paletteIndex(paletteId);
  const counts = new Map<number, number>();
  const cells: (BeadCell | null)[] = new Array(width * height).fill(null);
  let beadCount = 0;

  for (let i = 0; i < width * height; i += 1) {
    if (rgba[i * 4 + 3] < alphaThreshold) continue;
    const packed = packRgb(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const code = codeByPacked.get(packed);
    if (!code) continue;
    beadCount += 1;
    counts.set(packed, (counts.get(packed) ?? 0) + 1);
    cells[i] = { code, rgb: [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]] as RGB };
  }

  const entries: BeadEntry[] = [...counts.entries()]
    .map(([packed, count]) => ({
      code: codeByPacked.get(packed) ?? "?",
      rgb: [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff] as RGB,
      count,
    }))
    .sort((a, b) => compareCodes(a.code, b.code));

  const cell = cellSizeFor(width, height);
  const rulerFont = Math.max(11, Math.min(14, Math.round(cell * 0.5)));
  const ruler = rulerFont * 2 + 4;
  const gridWidth = width * cell;
  const gridHeight = height * cell;
  const canvasWidth = Math.max(900, gridWidth + (ruler + MARGIN) * 2);
  const columns = Math.max(1, Math.floor((canvasWidth - MARGIN * 2) / LEGEND_COLUMN));
  const columnWidth = Math.floor((canvasWidth - MARGIN * 2) / columns);
  const legendRows = Math.ceil(entries.length / columns);
  const y0 = MARGIN + HEADER_HEIGHT + ruler;
  const legendTop = y0 + gridHeight + ruler + 54;
  const canvasHeight = legendTop + 18 + legendRows * LEGEND_ROW + MARGIN - 14;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 2D。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const frame: ChartFrame = {
    x0: Math.floor((canvasWidth - gridWidth) / 2),
    y0,
    cell,
    width,
    height,
    ruler,
    rulerFont,
  };
  const longestCode = entries.reduce((max, entry) => Math.max(max, entry.code.length), 0);
  const fontSize = codeFontSize(cell, longestCode);

  drawHeader(
    context,
    canvasWidth,
    "拼豆图纸",
    `${palette.title}  ·  ${width} × ${height} 格  ·  ${beadCount} 颗  ·  ${entries.length} 色`,
    fontSize === null
      ? "细线每 5 格 · 粗线每 10 格 · ▲ 中心 · 格子较小未标色号，请按颜色对照图例"
      : "细线每 5 格 · 粗线每 10 格 · ▲ 中心 · 坐标从 1 起",
  );
  drawCells(context, cells, frame);
  drawGrid(context, frame);
  if (fontSize !== null) drawCodes(context, cells, frame, fontSize);
  drawRulerAxis(context, frame, "x");
  drawRulerAxis(context, frame, "y");
  drawLegend(context, entries, beadCount, legendTop, columnWidth, columns);

  return { canvas, stats: { beadCount, colorCount: entries.length } };
}

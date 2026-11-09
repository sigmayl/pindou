import { contrastInk, packRgb, type RGB } from "./color";
import { getPalette, paletteIndex } from "./palette";

const FONT_STACK =
  '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif';

export interface PatternStats {
  beadCount: number;
  colorCount: number;
}

export interface PatternResult {
  canvas: HTMLCanvasElement;
  stats: PatternStats;
}

interface BeadEntry {
  code: string;
  rgb: RGB;
  count: number;
}

/**
 * Render a printable bead chart: colour grid with codes plus a counted legend.
 * Each visible grid cell is one bead.
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
  const cells: (BeadEntry | null)[] = new Array(width * height).fill(null);
  let beadCount = 0;

  for (let i = 0; i < width * height; i += 1) {
    if (rgba[i * 4 + 3] < alphaThreshold) continue;
    const packed = packRgb(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const code = codeByPacked.get(packed);
    if (!code) continue;
    beadCount += 1;
    counts.set(packed, (counts.get(packed) ?? 0) + 1);
    cells[i] = {
      code,
      rgb: [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]] as RGB,
      count: 0,
    };
  }

  const entries: BeadEntry[] = [...counts.entries()]
    .map(([packed, count]) => {
      const [r, g, b] = [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
      return {
        code: codeByPacked.get(packed) ?? "?",
        rgb: [r, g, b] as RGB,
        count,
      };
    })
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const cell = Math.max(6, Math.min(28, Math.floor(2800 / Math.max(width, height))));
  const gridWidth = width * cell;
  const gridHeight = height * cell;
  const margin = 32;
  const top = 62;
  const canvasWidth = Math.max(720, gridWidth + margin * 2);
  const columns = Math.max(1, Math.min(5, Math.floor((canvasWidth - margin * 2) / 150)));
  const legendRows = Math.ceil(entries.length / columns);
  const legendTop = top + gridHeight + 58;
  const canvasHeight = legendTop + legendRows * 38 + 50;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 2D。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const titleFont = `600 20px ${FONT_STACK}`;
  const legendFont = `400 15px ${FONT_STACK}`;
  context.fillStyle = "#252a31";
  context.font = titleFont;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(
    `${palette.title}  ·  ${width} × ${height}  ·  ${beadCount} 颗`,
    margin,
    38,
  );

  const x0 = Math.floor((canvasWidth - gridWidth) / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bead = cells[y * width + x];
      if (!bead) continue;
      context.fillStyle = `rgb(${bead.rgb[0]}, ${bead.rgb[1]}, ${bead.rgb[2]})`;
      context.fillRect(
        x0 + x * cell,
        top + y * cell,
        Math.max(1, cell - 1),
        Math.max(1, cell - 1),
      );
    }
  }

  context.strokeStyle = "#c9cdd2";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= width; x += 1) {
    const px = x0 + x * cell + 0.5;
    context.moveTo(px, top);
    context.lineTo(px, top + gridHeight);
  }
  for (let y = 0; y <= height; y += 1) {
    const py = top + y * cell + 0.5;
    context.moveTo(x0, py);
    context.lineTo(x0 + gridWidth, py);
  }
  context.stroke();

  if (cell >= 20) {
    const codeFont = `600 ${Math.max(8, Math.min(10, Math.floor(cell / 3)))}px ${FONT_STACK}`;
    context.font = codeFont;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bead = cells[y * width + x];
        if (!bead) continue;
        if (context.measureText(bead.code).width > cell - 2) continue;
        context.fillStyle = contrastInk(bead.rgb);
        context.fillText(
          bead.code,
          x0 + (x + 0.5) * cell,
          top + (y + 0.5) * cell + 0.5,
        );
      }
    }
  }

  context.fillStyle = "#252a31";
  context.font = titleFont;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(`拼豆色号  ·  ${entries.length} 色`, margin, top + gridHeight + 34);

  const columnWidth = Math.floor((canvasWidth - margin * 2) / columns);
  context.font = legendFont;
  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = margin + column * columnWidth;
    const y = legendTop + row * 38;
    context.fillStyle = `rgb(${entry.rgb[0]}, ${entry.rgb[1]}, ${entry.rgb[2]})`;
    context.fillRect(left, y, 23, 23);
    context.strokeStyle = "#b8bdc3";
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, y + 0.5, 22, 22);
    context.fillStyle = "#252a31";
    context.fillText(`${entry.code}  × ${entry.count}`, left + 30, y + 18);
  });

  return { canvas, stats: { beadCount, colorCount: entries.length } };
}

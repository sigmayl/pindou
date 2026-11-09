import raw from "../data/palettes.json";
import { packRgb, rgbToLab, type Lab, type RGB } from "./color";

export interface PaletteColor {
  code: string;
  rgb: RGB;
}

export interface Palette {
  id: string;
  title: string;
  description: string;
  colors: PaletteColor[];
}

interface RawPalette {
  id: string;
  title: string;
  description: string;
  colors: { code: string; rgb: [number, number, number] }[];
}

const DATA = raw as unknown as {
  source: string;
  revision: string;
  license: string;
  palettes: RawPalette[];
};

export const PALETTES: readonly Palette[] = DATA.palettes.map((item) => ({
  ...item,
  colors: item.colors.map((color) => ({
    code: color.code,
    rgb: [color.rgb[0], color.rgb[1], color.rgb[2]] as RGB,
  })),
}));

export const DEFAULT_PALETTE_ID = "mard-221-alfonse-doudou";

const byId = new Map(PALETTES.map((palette) => [palette.id, palette]));

export function getPalette(id: string): Palette {
  const palette = byId.get(id);
  if (!palette) throw new Error(`未知色表：${id}`);
  return palette;
}

export interface PreparedPalette {
  palette: Palette;
  /** Palette colors in stable packed-RGB order (matches numpy.unique). */
  packed: Uint32Array;
  rgb: Uint8Array;
  lab: Float32Array;
  count: number;
}

const prepared = new Map<string, PreparedPalette>();

/** Unique palette colors sorted lexicographically by RGB (numpy.unique order). */
export function preparePalette(id: string): PreparedPalette {
  const cached = prepared.get(id);
  if (cached) return cached;
  const palette = getPalette(id);
  const unique = new Map<number, RGB>();
  for (const color of palette.colors) {
    const packed = packRgb(color.rgb[0], color.rgb[1], color.rgb[2]);
    if (!unique.has(packed)) unique.set(packed, color.rgb);
  }
  const packedArray = [...unique.keys()].sort((a, b) => a - b);
  const count = packedArray.length;
  const rgb = new Uint8Array(count * 3);
  const lab = new Float32Array(count * 3);
  const packed = Uint32Array.from(packedArray);
  for (let i = 0; i < count; i += 1) {
    const value = packedArray[i];
    const channels: RGB = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
    rgb[i * 3] = channels[0];
    rgb[i * 3 + 1] = channels[1];
    rgb[i * 3 + 2] = channels[2];
    const [l, a, b] = rgbToLab(channels);
    lab[i * 3] = l;
    lab[i * 3 + 1] = a;
    lab[i * 3 + 2] = b;
  }
  const result = { palette, packed, rgb, lab, count };
  prepared.set(id, result);
  return result;
}

export interface PaletteIndex {
  /** packed RGB -> entry index in the prepared palette. */
  byPacked: Map<number, number>;
  /** packed RGB -> first code with that RGB. */
  codeByPacked: Map<number, string>;
}

const indices = new Map<string, PaletteIndex>();

export function paletteIndex(id: string): PaletteIndex {
  const cached = indices.get(id);
  if (cached) return cached;
  const palette = getPalette(id);
  const byPacked = new Map<number, number>();
  const codeByPacked = new Map<number, string>();
  const preparedPalette = preparePalette(id);
  preparedPalette.packed.forEach((packed, index) => byPacked.set(packed, index));
  for (const color of palette.colors) {
    const packed = packRgb(color.rgb[0], color.rgb[1], color.rgb[2]);
    if (!codeByPacked.has(packed)) codeByPacked.set(packed, color.code);
  }
  const result = { byPacked, codeByPacked };
  indices.set(id, result);
  return result;
}

export function paletteLab(id: string): Float32Array {
  return preparePalette(id).lab;
}

export function nearestPaletteEntry(
  lab: Lab,
  paletteLabData: Float32Array,
  count: number,
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const dl = lab[0] - paletteLabData[i * 3];
    const da = lab[1] - paletteLabData[i * 3 + 1];
    const db = lab[2] - paletteLabData[i * 3 + 2];
    const distance = dl * dl + da * da + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

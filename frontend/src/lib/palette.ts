import raw from "../data/palettes.json";
import { packRgb, type RGB } from "./color";

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

export interface PaletteIndex {
  /** Unique palette colours as flat RGB, the form Pixilate takes. */
  rgb: Uint8Array;
  /** packed RGB -> first code with that RGB. */
  codeByPacked: Map<number, string>;
}

const indices = new Map<string, PaletteIndex>();

export function paletteIndex(id: string): PaletteIndex {
  const cached = indices.get(id);
  if (cached) return cached;
  const codeByPacked = new Map<number, string>();
  for (const color of getPalette(id).colors) {
    const packed = packRgb(color.rgb[0], color.rgb[1], color.rgb[2]);
    if (!codeByPacked.has(packed)) codeByPacked.set(packed, color.code);
  }
  const rgb = new Uint8Array(codeByPacked.size * 3);
  [...codeByPacked.keys()].forEach((packed, index) => {
    rgb[index * 3] = (packed >> 16) & 0xff;
    rgb[index * 3 + 1] = (packed >> 8) & 0xff;
    rgb[index * 3 + 2] = packed & 0xff;
  });
  const result = { rgb, codeByPacked };
  indices.set(id, result);
  return result;
}

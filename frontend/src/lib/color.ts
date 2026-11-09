/** Color math shared by palette matching and bead optimization. */

export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];

export function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export function unpackRgb(packed: number): RGB {
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

/** CIE L*a*b* (D65) from sRGB, matching the Python implementation. */
export function rgbToLab([r, g, b]: RGB): Lab {
  const linear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const delta = 6 / 29;
  const f = (value: number): number =>
    value > delta ** 3 ? Math.cbrt(value) : value / (3 * delta ** 2) + 4 / 29;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labDistanceSquared(
  lab: ArrayLike<number>,
  offsetA: number,
  other: ArrayLike<number>,
  offsetB: number,
): number {
  const dl = lab[offsetA] - other[offsetB];
  const da = lab[offsetA + 1] - other[offsetB + 1];
  const db = lab[offsetA + 2] - other[offsetB + 2];
  return dl * dl + da * da + db * db;
}

/** Python's round() uses banker's rounding; Math.round() does not. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function contrastInk(rgb: RGB): string {
  return relativeLuminance(rgb) > 150 ? "#111111" : "#ffffff";
}

export type RGB = readonly [number, number, number];

export function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function contrastInk(rgb: RGB): string {
  return relativeLuminance(rgb) > 150 ? "#111111" : "#ffffff";
}

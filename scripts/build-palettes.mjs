#!/usr/bin/env node
/**
 * Build the browser palette bundle from HansBug/pindou-color-data.
 * Usage: node scripts/build-palettes.mjs
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "data", "pindou-color-data");
const target = join(root, "frontend", "src", "data", "palettes.json");
const licenseTarget = join(root, "frontend", "public", "licenses", "pindou-color-data-LICENSE.txt");

const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
const palettes = [];

for (const item of manifest) {
  const raw = JSON.parse(await readFile(join(source, item.path, "colors.json"), "utf8"));
  const colors = [];
  for (const color of raw.colors ?? []) {
    const rgb = color.rgb;
    if (!Array.isArray(rgb) || rgb.length < 3) continue;
    if (color.unidentified || color.transparency) continue;
    if (rgb.length > 3 && rgb[3] < 255) continue;
    colors.push({ code: String(color.code), rgb: [rgb[0], rgb[1], rgb[2]] });
  }
  palettes.push({
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    colors,
  });
}

palettes.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
const payload = {
  source: "https://github.com/HansBug/pindou-color-data",
  revision: "178dafbc9e77d3de556550dbd058270200129186",
  license: "MIT",
  palettes,
};
await mkdir(dirname(target), { recursive: true });
await mkdir(dirname(licenseTarget), { recursive: true });
await writeFile(target, JSON.stringify(payload, null, 2) + "\n", "utf8");
await copyFile(join(source, "LICENSE"), licenseTarget);
console.log(`Wrote ${palettes.length} palettes to ${target}`);

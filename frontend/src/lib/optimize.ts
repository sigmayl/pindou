import { labDistanceSquared, rgbToLab } from "./color";
import { preparePalette } from "./palette";

export interface OptimizeOptions {
  maxColors: number;
  smoothing: number;
  cleanup: number;
  protectEdges: boolean;
  dither: boolean;
  alphaThreshold?: number;
}

export interface OptimizeResult {
  rgba: Uint8ClampedArray;
  colorsUsed: number;
}

const ORDERED_MATRIX = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (value) => (value + 0.5) / 16,
);

const NEIGHBORS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Palette-constrained color reduction plus spatial cleanup.
 * This is a TypeScript port of the original NumPy/Python algorithm.
 */
export function optimizeBeads(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  paletteId: string,
  options: OptimizeOptions,
): OptimizeResult {
  const maxColors = Math.trunc(options.maxColors);
  const smoothing = options.smoothing;
  const cleanup = Math.trunc(options.cleanup);
  const alphaThreshold = options.alphaThreshold ?? 128;
  if (!(maxColors >= 1 && maxColors <= 256)) throw new Error("maxColors 超出范围");
  if (!(smoothing >= 0 && smoothing <= 100)) throw new Error("smoothing 超出范围");
  if (!(cleanup >= 0 && cleanup <= 3)) throw new Error("cleanup 超出范围");

  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) throw new Error("像素数据尺寸不匹配");

  const valid = new Uint8Array(pixelCount);
  const counts = new Map<number, number>();
  for (let i = 0; i < pixelCount; i += 1) {
    if (rgba[i * 4 + 3] < alphaThreshold) continue;
    valid[i] = 1;
    const packed = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    counts.set(packed, (counts.get(packed) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { rgba: new Uint8ClampedArray(rgba), colorsUsed: 0 };
  }

  const uniquePacked = [...counts.keys()].sort((a, b) => a - b);
  const uniqueCount = uniquePacked.length;
  const indexByPacked = new Map<number, number>();
  const frequencies = new Float64Array(uniqueCount);
  const sourceLab = new Float32Array(uniqueCount * 3);
  uniquePacked.forEach((packed, index) => {
    indexByPacked.set(packed, index);
    frequencies[index] = counts.get(packed) ?? 0;
    const r = (packed >> 16) & 0xff;
    const g = (packed >> 8) & 0xff;
    const b = packed & 0xff;
    const [l, a, bb] = rgbToLab([r, g, b]);
    sourceLab[index * 3] = l;
    sourceLab[index * 3 + 1] = a;
    sourceLab[index * 3 + 2] = bb;
  });

  const inverse = new Int32Array(pixelCount).fill(-1);
  for (let i = 0; i < pixelCount; i += 1) {
    if (!valid[i]) continue;
    const packed = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    inverse[i] = indexByPacked.get(packed) ?? -1;
  }

  const prepared = preparePalette(paletteId);
  const paletteCount = prepared.count;
  const distances = new Float32Array(uniqueCount * paletteCount);
  for (let i = 0; i < uniqueCount; i += 1) {
    for (let j = 0; j < paletteCount; j += 1) {
      distances[i * paletteCount + j] = labDistanceSquared(
        sourceLab,
        i * 3,
        prepared.lab,
        j * 3,
      );
    }
  }

  // Greedy palette selection weighted by pixel frequency.
  let first = 0;
  let firstWeighted = Number.POSITIVE_INFINITY;
  for (let j = 0; j < paletteCount; j += 1) {
    let total = 0;
    for (let i = 0; i < uniqueCount; i += 1) {
      total += distances[i * paletteCount + j] * frequencies[i];
      if (total >= firstWeighted) break;
    }
    if (total < firstWeighted) {
      firstWeighted = total;
      first = j;
    }
  }

  const chosen: number[] = [first];
  const chosenMask = new Uint8Array(paletteCount);
  chosenMask[first] = 1;
  const best = new Float32Array(uniqueCount);
  for (let i = 0; i < uniqueCount; i += 1) best[i] = distances[i * paletteCount + first];

  const limit = Math.min(maxColors, paletteCount, uniqueCount);
  for (let round = 1; round < limit; round += 1) {
    let next = -1;
    let bestImprovement = 0;
    for (let j = 0; j < paletteCount; j += 1) {
      if (chosenMask[j]) continue;
      let improvement = 0;
      for (let i = 0; i < uniqueCount; i += 1) {
        const gain = best[i] - distances[i * paletteCount + j];
        if (gain > 0) improvement += gain * frequencies[i];
      }
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        next = j;
      }
    }
    // The Python implementation stops when the best gain is <= 1e-5.
    if (next < 0 || bestImprovement <= 1e-5) break;
    chosen.push(next);
    chosenMask[next] = 1;
    for (let i = 0; i < uniqueCount; i += 1) {
      best[i] = Math.min(best[i], distances[i * paletteCount + next]);
    }
  }

  const k = chosen.length;
  const chosenLab = new Float32Array(k * 3);
  for (let index = 0; index < k; index += 1) {
    const paletteIndex = chosen[index];
    chosenLab[index * 3] = prepared.lab[paletteIndex * 3];
    chosenLab[index * 3 + 1] = prepared.lab[paletteIndex * 3 + 1];
    chosenLab[index * 3 + 2] = prepared.lab[paletteIndex * 3 + 2];
  }

  const cost = new Float32Array(pixelCount * k);
  for (let i = 0; i < pixelCount; i += 1) {
    if (!valid[i]) continue;
    const sourceIndex = inverse[i] * 3;
    const base = i * k;
    for (let j = 0; j < k; j += 1) {
      const dl = sourceLab[sourceIndex] - chosenLab[j * 3];
      const da = sourceLab[sourceIndex + 1] - chosenLab[j * 3 + 1];
      const db = sourceLab[sourceIndex + 2] - chosenLab[j * 3 + 2];
      cost[base + j] = dl * dl + da * da + db * db;
    }
  }

  const labels = new Int16Array(pixelCount).fill(-1);
  for (let i = 0; i < pixelCount; i += 1) {
    if (!valid[i]) continue;
    const base = i * k;
    let bestLabel = 0;
    let bestCost = cost[base];
    for (let j = 1; j < k; j += 1) {
      if (cost[base + j] < bestCost) {
        bestCost = cost[base + j];
        bestLabel = j;
      }
    }
    labels[i] = bestLabel;
  }

  const strength = (smoothing / 100) * 300;
  if (strength > 0) {
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const score = new Float32Array(cost);
      for (const [dy, dx] of NEIGHBORS) {
        const yStart = Math.max(0, dy);
        const yEnd = height + Math.min(0, dy);
        const xStart = Math.max(0, dx);
        const xEnd = width + Math.min(0, dx);
        for (let y = yStart; y < yEnd; y += 1) {
          const row = y * width;
          const neighborRow = (y + dy) * width;
          for (let x = xStart; x < xEnd; x += 1) {
            const index = row + x;
            if (!valid[index]) continue;
            const neighborIndex = neighborRow + (x + dx);
            if (!valid[neighborIndex]) continue;
            let weight = 1;
            if (options.protectEdges) {
              const delta = labDistanceSquared(
                sourceLab,
                inverse[index] * 3,
                sourceLab,
                inverse[neighborIndex] * 3,
              );
              weight = Math.exp(-delta / (2 * 18 * 18));
            }
            const neighborLabel = labels[neighborIndex];
            const base = index * k;
            const add = strength * weight;
            for (let j = 0; j < k; j += 1) {
              if (neighborLabel !== j) score[base + j] += add;
            }
          }
        }
      }

      let changed = false;
      for (let i = 0; i < pixelCount; i += 1) {
        if (!valid[i]) continue;
        const base = i * k;
        let bestLabel = 0;
        let bestCost = score[base];
        for (let j = 1; j < k; j += 1) {
          if (score[base + j] < bestCost) {
            bestCost = score[base + j];
            bestLabel = j;
          }
        }
        if (labels[i] !== bestLabel) {
          labels[i] = bestLabel;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  if (options.dither && k > 1) {
    const firstChoice = new Int32Array(pixelCount);
    const secondChoice = new Int32Array(pixelCount);
    const probability = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i += 1) {
      if (!valid[i]) continue;
      const base = i * k;
      let best1 = Number.POSITIVE_INFINITY;
      let best2 = Number.POSITIVE_INFINITY;
      let index1 = 0;
      let index2 = 0;
      for (let j = 0; j < k; j += 1) {
        const value = cost[base + j];
        if (value < best1) {
          best2 = best1;
          index2 = index1;
          best1 = value;
          index1 = j;
        } else if (value < best2) {
          best2 = value;
          index2 = j;
        }
      }
      firstChoice[i] = index1;
      secondChoice[i] = index2;
      probability[i] = (best1 / (best1 + best2 + 1e-6)) * 0.65;
    }

    let gradient: Float32Array | null = null;
    if (options.protectEdges) {
      gradient = new Float32Array(pixelCount);
      for (let y = 0; y < height; y += 1) {
        const row = y * width;
        for (let x = 1; x < width; x += 1) {
          const index = row + x;
          const previous = index - 1;
          if (!valid[index] || !valid[previous]) continue;
          const delta = Math.sqrt(
            labDistanceSquared(
              sourceLab,
              inverse[index] * 3,
              sourceLab,
              inverse[previous] * 3,
            ),
          );
          if (delta > gradient[index]) gradient[index] = delta;
          if (delta > gradient[previous]) gradient[previous] = delta;
        }
      }
      for (let y = 1; y < height; y += 1) {
        const row = y * width;
        const previousRow = row - width;
        for (let x = 0; x < width; x += 1) {
          const index = row + x;
          const previous = previousRow + x;
          if (!valid[index] || !valid[previous]) continue;
          const delta = Math.sqrt(
            labDistanceSquared(
              sourceLab,
              inverse[index] * 3,
              sourceLab,
              inverse[previous] * 3,
            ),
          );
          if (delta > gradient[index]) gradient[index] = delta;
          if (delta > gradient[previous]) gradient[previous] = delta;
        }
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (!valid[index]) continue;
        if (labels[index] !== firstChoice[index]) continue;
        if (ORDERED_MATRIX[(y % 4) * 4 + (x % 4)] >= probability[index]) continue;
        if (gradient && gradient[index] >= 18) continue;
        labels[index] = secondChoice[index];
      }
    }
  }

  if (cleanup > 0) {
    const seen = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    for (let pass = 0; pass < 3; pass += 1) {
      seen.fill(0);
      let changed = false;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const start = y * width + x;
          if (!valid[start] || seen[start]) continue;
          const oldLabel = labels[start];
          let head = 0;
          let tail = 0;
          queue[tail++] = start;
          seen[start] = 1;
          const component: number[] = [];
          const neighborCounts = new Map<number, number>();
          while (head < tail) {
            const index = queue[head++];
            component.push(index);
            const cy = Math.floor(index / width);
            const cx = index - cy * width;
            for (const [dy, dx] of NEIGHBORS) {
              const ny = cy + dy;
              const nx = cx + dx;
              if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
              const neighborIndex = ny * width + nx;
              if (!valid[neighborIndex]) continue;
              if (labels[neighborIndex] === oldLabel) {
                if (!seen[neighborIndex]) {
                  seen[neighborIndex] = 1;
                  queue[tail++] = neighborIndex;
                }
              } else if (
                !options.protectEdges ||
                Math.sqrt(
                  labDistanceSquared(
                    sourceLab,
                    inverse[index] * 3,
                    sourceLab,
                    inverse[neighborIndex] * 3,
                  ),
                ) < 25
              ) {
                neighborCounts.set(
                  labels[neighborIndex],
                  (neighborCounts.get(labels[neighborIndex]) ?? 0) + 1,
                );
              }
            }
          }
          if (component.length > cleanup || neighborCounts.size === 0) continue;
          let replacement = -1;
          let bestScore = Number.POSITIVE_INFINITY;
          for (const [candidate, count] of neighborCounts) {
            let error = 0;
            for (const index of component) {
              error += cost[index * k + candidate];
            }
            const score = error - count * 35;
            if (score < bestScore) {
              bestScore = score;
              replacement = candidate;
            }
          }
          if (replacement < 0) continue;
          for (const index of component) labels[index] = replacement;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  const output = new Uint8ClampedArray(rgba);
  const used = new Set<number>();
  for (let i = 0; i < pixelCount; i += 1) {
    if (!valid[i]) continue;
    const label = labels[i];
    if (label < 0) continue;
    used.add(label);
    const paletteIndex = chosen[label];
    output[i * 4] = prepared.rgb[paletteIndex * 3];
    output[i * 4 + 1] = prepared.rgb[paletteIndex * 3 + 1];
    output[i * 4 + 2] = prepared.rgb[paletteIndex * 3 + 2];
  }
  return { rgba: output, colorsUsed: used.size };
}

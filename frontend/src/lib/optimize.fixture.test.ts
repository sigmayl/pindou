import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optimizeBeads, type OptimizeOptions } from "./optimize";

interface Fixture {
  width: number;
  height: number;
  palette: string;
  options: {
    max_colors: number;
    smoothing: number;
    cleanup: number;
    protect_edges: boolean;
    dither: boolean;
  };
  input: string;
  expected: string;
}

const cases = ["default", "dither", "raw"] as const;

describe("optimizeBeads matches the Python implementation", () => {
  for (const name of cases) {
    it(name, () => {
      const fixture = JSON.parse(
        readFileSync(new URL(`./__fixtures__/optimize-${name}.json`, import.meta.url), "utf8"),
      ) as Fixture;
      const input = new Uint8ClampedArray(Buffer.from(fixture.input, "base64"));
      const expected = new Uint8ClampedArray(Buffer.from(fixture.expected, "base64"));
      const options: OptimizeOptions = {
        maxColors: fixture.options.max_colors,
        smoothing: fixture.options.smoothing,
        cleanup: fixture.options.cleanup,
        protectEdges: fixture.options.protect_edges,
        dither: fixture.options.dither,
      };
      const result = optimizeBeads(
        input,
        fixture.width,
        fixture.height,
        fixture.palette,
        options,
      );
      if (result.rgba.length !== expected.length) {
        throw new Error(`length mismatch ${result.rgba.length} != ${expected.length}`);
      }
      let differences = 0;
      let first = -1;
      for (let i = 0; i < expected.length; i += 4) {
        const changed =
          result.rgba[i] !== expected[i] ||
          result.rgba[i + 1] !== expected[i + 1] ||
          result.rgba[i + 2] !== expected[i + 2];
        expect(result.rgba[i + 3]).toBe(expected[i + 3]);
        if (changed) {
          differences += 1;
          if (first < 0) first = i / 4;
        }
      }
      // Float32 arithmetic in NumPy and float64 in JS can flip a near-tie in
      // the smoothing pass. The colour choices are otherwise identical.
      expect(differences, `first difference at pixel ${first}`).toBeLessThanOrEqual(2);
    });
  }
});

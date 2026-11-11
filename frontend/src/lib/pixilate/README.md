# Pixilate engine (vendored)

Source: <https://github.com/Shilo/pixilate>, commit `4a24bba1a67e03493921618f7ff5c8d2c0b77565`, `prototype/src/lib/core/`. MIT, see `LICENSE`.

Only the pure conversion core is copied; it has no runtime dependencies. Local changes are marked `pindou:` in the code:

- `palette.ts`: `colors` now also applies when `palette` is set. The image is quantized to that many clusters, then each cluster is standardized to its nearest bead colour.
- `pipeline.ts`: the palette limit is raised from 256 to 1024 entries (several bead colour sets exceed 256), and the final validator enforces the colour cap together with the palette.
- `pipeline.ts`, `resample.ts`: removed unused type imports to satisfy this project's `noUnusedLocals`.
- `resample.ts`: area resampling reads RGBA8 directly into cached filter rows, avoiding the full premultiplied float source and full horizontal intermediate. Raster cell opacity uses total fractional alpha coverage (at least 50%), with alpha-weighted colour selection, while retaining raw thin-feature ridges.
- `pipeline.ts`: local engine version `0.14.2-pindou.1`, constants revision 34, identifies the resampling and raster alpha changes.

"""Palette-constrained color reduction and spatial cleanup for bead grids."""
from collections import Counter, deque

import numpy as np
from PIL import Image

from color_standard import palette_colors, rgb_to_lab


def optimize_beads(image, palette_id, max_colors=24, smoothing=35, cleanup=2,
                   protect_edges=True, dither=False, alpha_threshold=128):
    if not 1 <= int(max_colors) <= 256 or not 0 <= float(smoothing) <= 100 or not 0 <= int(cleanup) <= 3:
        raise ValueError('Invalid bead optimization settings')
    rgba = np.array(image.convert('RGBA'), copy=True)
    valid = rgba[..., 3] >= alpha_threshold
    if not valid.any():
        return Image.fromarray(rgba)
    # Work on unique colors to keep palette selection bounded by color variety,
    # not the number of pixels. Palette choices remain actual bead colors.
    original, inverse, frequencies = np.unique(rgba[valid, :3], axis=0, return_inverse=True, return_counts=True)
    source_lab = rgb_to_lab(original)
    palette_rgb = np.unique(np.array([rgb for _, rgb in palette_colors(palette_id)], dtype=np.uint8), axis=0)
    palette_lab = rgb_to_lab(palette_rgb)
    distances = ((source_lab[:, None, :] - palette_lab[None, :, :]) ** 2).sum(axis=2)
    first = int(np.argmin((distances * frequencies[:, None]).sum(axis=0)))
    chosen = [first]
    best = distances[:, first].copy()
    for _ in range(1, min(int(max_colors), len(palette_rgb), len(original))):
        improvement = (np.maximum(best[:, None] - distances, 0) * frequencies[:, None]).sum(axis=0)
        improvement[chosen] = 0
        next_color = int(np.argmax(improvement))
        if improvement[next_color] <= 1e-5:
            break
        chosen.append(next_color)
        best = np.minimum(best, distances[:, next_color])
    rgb = palette_rgb[chosen]
    lab = palette_lab[chosen]
    h, w = valid.shape
    source = np.zeros((h, w, 3), dtype=np.float32)
    source[valid] = source_lab[inverse]
    # Scores balance color error in Lab against disagreement with 4 neighbors.
    color_cost = ((source[:, :, None, :] - lab[None, None, :, :]) ** 2).sum(axis=3)
    labels = np.full((h, w), -1, dtype=np.int16)
    labels[valid] = color_cost[valid].argmin(axis=1)
    strength = float(smoothing) / 100.0 * 300.0
    if strength:
        for _ in range(4):
            score = color_cost.copy()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ys = slice(max(0, dy), h + min(0, dy))
                xs = slice(max(0, dx), w + min(0, dx))
                yn = slice(max(0, -dy), h - max(0, dy))
                xn = slice(max(0, -dx), w - max(0, dx))
                neighbor = labels[yn, xn]
                both = valid[ys, xs] & valid[yn, xn]
                weight = both.astype(np.float32)
                if protect_edges:
                    delta = ((source[ys, xs] - source[yn, xn]) ** 2).sum(axis=2)
                    weight *= np.exp(-delta / (2 * 18.0 ** 2))
                score[ys, xs] += strength * weight[..., None] * (neighbor[..., None] != np.arange(len(rgb)))
            updated = score[valid].argmin(axis=1)
            if np.array_equal(labels[valid], updated):
                break
            labels[valid] = updated
    if dither and len(rgb) > 1:
        # Ordered dithering chooses only between selected colors and never crosses
        # the alpha boundary. Low gradients receive it; strong edges are retained.
        ordered = np.argsort(color_cost, axis=2)[..., :2]
        first_cost = np.take_along_axis(color_cost, ordered[..., :1], axis=2)[..., 0]
        second_cost = np.take_along_axis(color_cost, ordered[..., 1:2], axis=2)[..., 0]
        probability = np.divide(first_cost, first_cost + second_cost + 1e-6) * 0.65
        matrix = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16
        yy, xx = np.indices((h, w))
        take = valid & (labels == ordered[..., 0]) & (matrix[yy % 4, xx % 4] < probability)
        if protect_edges:
            gradient = np.zeros((h, w), dtype=np.float32)
            horizontal = np.linalg.norm(source[:, 1:] - source[:, :-1], axis=2) * (valid[:, 1:] & valid[:, :-1])
            vertical = np.linalg.norm(source[1:] - source[:-1], axis=2) * (valid[1:] & valid[:-1])
            gradient[:, 1:] = np.maximum(gradient[:, 1:], horizontal)
            gradient[:, :-1] = np.maximum(gradient[:, :-1], horizontal)
            gradient[1:] = np.maximum(gradient[1:], vertical)
            gradient[:-1] = np.maximum(gradient[:-1], vertical)
            take &= gradient < 18
        labels[take] = ordered[..., 1][take]
    if cleanup:
        # Four-connected islands at or below the threshold are merged into a
        # neighboring selected color. Strong source edges can veto a merge.
        for _ in range(3):
            seen = np.zeros((h, w), dtype=bool)
            changed = False
            for y in range(h):
                for x in range(w):
                    if not valid[y, x] or seen[y, x]:
                        continue
                    old = labels[y, x]
                    queue = deque([(y, x)])
                    seen[y, x] = True
                    component = []
                    neighbors = Counter()
                    while queue:
                        cy, cx = queue.popleft()
                        component.append((cy, cx))
                        for ny, nx in ((cy-1,cx), (cy+1,cx), (cy,cx-1), (cy,cx+1)):
                            if not (0 <= ny < h and 0 <= nx < w and valid[ny, nx]):
                                continue
                            if labels[ny, nx] == old:
                                if not seen[ny, nx]:
                                    seen[ny, nx] = True
                                    queue.append((ny, nx))
                            elif not protect_edges or np.linalg.norm(source[cy, cx] - source[ny, nx]) < 25:
                                neighbors[int(labels[ny, nx])] += 1
                    if len(component) <= int(cleanup) and neighbors:
                        candidates = list(neighbors)
                        ys, xs = zip(*component)
                        errors = color_cost[np.array(ys)[:, None], np.array(xs)[:, None], candidates].sum(axis=0)
                        # Favor a shared boundary when color errors are comparable.
                        scores = errors - np.array([neighbors[c] for c in candidates]) * 35
                        replacement = candidates[int(np.argmin(scores))]
                        for cy, cx in component:
                            labels[cy, cx] = replacement
                        changed = True
            if not changed:
                break
    rgba[valid, :3] = rgb[labels[valid]]
    return Image.fromarray(rgba)

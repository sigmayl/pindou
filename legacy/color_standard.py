"""Match image colors to the vendored pindou color palettes."""
from functools import lru_cache
import json
from pathlib import Path

import numpy as np
from PIL import Image

DATA = Path(__file__).resolve().parent / 'data' / 'pindou-color-data'
DEFAULT_PALETTE = 'mard-221-alfonse-doudou'


@lru_cache(maxsize=1)
def palettes():
    manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
    return {item['id']: item['title'] for item in manifest}


@lru_cache(maxsize=None)
def palette_colors(palette_id):
    if palette_id not in palettes():
        raise ValueError(f'Unknown palette: {palette_id}')
    data = json.loads((DATA / palette_id / 'colors.json').read_text(encoding='utf-8'))
    colors = []
    for color in data['colors']:
        rgb = color.get('rgb')
        if (not isinstance(rgb, list) or len(rgb) < 3 or color.get('unidentified')
                or color.get('transparency') or (len(rgb) > 3 and rgb[3] < 255)):
            continue
        colors.append((color['code'], tuple(rgb[:3])))
    if not colors:
        raise ValueError(f'Palette has no usable opaque colors: {palette_id}')
    return colors


def rgb_to_lab(rgb):
    """Convert sRGB to CIE L*a*b* (D65) for perceptual distance matching."""
    rgb = np.asarray(rgb, dtype=np.float32) / 255.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    xyz = linear @ np.array([[0.4124564, 0.2126729, 0.0193339],
                             [0.3575761, 0.7151522, 0.1191920],
                             [0.1804375, 0.0721750, 0.9503041]], dtype=np.float32)
    xyz /= np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    delta = 6 / 29
    f = np.where(xyz > delta ** 3, np.cbrt(xyz), xyz / (3 * delta ** 2) + 4 / 29)
    return np.stack((116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])), axis=-1)


def normalize_colors(image, palette_id):
    """Replace visible RGB with nearest opaque palette colors, preserving alpha."""
    colors = palette_colors(palette_id)
    palette_rgb = np.array([rgb for _, rgb in colors], dtype=np.uint8)
    palette_lab = rgb_to_lab(palette_rgb)
    rgba = np.array(image.convert('RGBA'), copy=True)
    visible = rgba[..., 3] > 0
    if visible.any():
        unique, inverse = np.unique(rgba[visible, :3], axis=0, return_inverse=True)
        lab = rgb_to_lab(unique)
        indices = []
        for start in range(0, len(lab), 2048):
            distances = ((lab[start:start + 2048, None, :] - palette_lab[None, :, :]) ** 2).sum(axis=2)
            indices.append(distances.argmin(axis=1))
        rgba[visible, :3] = palette_rgb[np.concatenate(indices)[inverse]]
    result = Image.fromarray(rgba)
    return result if 'A' in image.getbands() else result.convert('RGB')

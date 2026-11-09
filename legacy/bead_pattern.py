"""Create a printable bead pattern from a palette-normalized pixel image."""
from collections import Counter
from math import ceil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from color_standard import palette_colors, palettes


def font(size):
    candidates = (
        '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/harmonyos-sans/HarmonyOS_Sans_SC.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    )
    for path in candidates:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def create_pattern(image, palette_id, alpha_threshold=128):
    """Draw a grid and bead legend. Each nontransparent pixel represents one bead."""
    data = np.asarray(image.convert('RGBA'))
    height, width = data.shape[:2]
    colors = palette_colors(palette_id)
    # The first palette entry wins when multiple bead codes share the same RGB.
    by_rgb = {}
    for code, rgb in colors:
        by_rgb.setdefault(rgb, code)
    beads = []
    for row in data:
        bead_row = []
        for red, green, blue, alpha in row:
            if alpha < alpha_threshold:
                bead_row.append(None)
            else:
                rgb = (int(red), int(green), int(blue))
                if rgb not in by_rgb:
                    raise ValueError(f'Pixel color {rgb} is not in the selected palette')
                bead_row.append((by_rgb[rgb], rgb))
        beads.append(bead_row)
    counts = Counter(bead for row in beads for bead in row if bead is not None)
    entries = sorted(counts, key=lambda item: item[0])
    cell = max(6, min(28, 2800 // max(width, height)))
    grid_width, grid_height = width * cell, height * cell
    margin, top = 32, 62
    canvas_width = max(720, grid_width + 2 * margin)
    columns = max(1, min(5, (canvas_width - 2 * margin) // 150))
    legend_rows = ceil(len(entries) / columns)
    legend_top = top + grid_height + 58
    canvas_height = legend_top + legend_rows * 38 + 50
    canvas = Image.new('RGB', (canvas_width, canvas_height), 'white')
    draw = ImageDraw.Draw(canvas)
    title_font, legend_font = font(20), font(16)
    draw.text((margin, 18), f'{palettes()[palette_id]}  ·  {width} × {height}  ·  {sum(counts.values())} 颗', fill='#252a31', font=title_font)
    x0 = (canvas_width - grid_width) // 2
    for y, row in enumerate(beads):
        for x, bead in enumerate(row):
            if bead:
                draw.rectangle((x0+x*cell, top+y*cell, x0+(x+1)*cell-1, top+(y+1)*cell-1), fill=bead[1])
    for x in range(width + 1):
        draw.line((x0 + x*cell, top, x0+x*cell, top+grid_height), fill='#c9cdd2', width=1)
    for y in range(height + 1):
        draw.line((x0, top+y*cell, x0+grid_width, top+y*cell), fill='#c9cdd2', width=1)
    if cell >= 20:
        code_font = font(max(8, min(10, cell // 3)))
        for y, row in enumerate(beads):
            for x, bead in enumerate(row):
                if not bead:
                    continue
                code, (r, g, b) = bead
                if draw.textlength(code, font=code_font) > cell - 2:
                    continue
                ink = '#111111' if 0.299*r + 0.587*g + 0.114*b > 150 else '#ffffff'
                draw.text((x0+(x+0.5)*cell, top+(y+0.5)*cell), code, font=code_font, fill=ink, anchor='mm')
    draw.text((margin, top + grid_height + 18), f'拼豆色号  ·  {len(entries)} 色', fill='#252a31', font=title_font)
    col_width = (canvas_width - 2 * margin) // columns
    for index, (code, rgb) in enumerate(entries):
        col, row = index % columns, index // columns
        left, y = margin + col*col_width, legend_top + row*38
        draw.rectangle((left, y, left+23, y+23), fill=rgb, outline='#b8bdc3')
        draw.text((left+30, y+1), f'{code}  × {counts[(code, rgb)]}', fill='#252a31', font=legend_font)
    return canvas

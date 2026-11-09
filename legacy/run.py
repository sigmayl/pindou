#!/usr/bin/env python3
"""Run the Pixelization model locally on CPU."""
import argparse
import os
from pathlib import Path

import torch
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
for key, name in (("NET_MODEL", "160_net_G_A.pth"), ("ALIAS_MODEL", "alias_net.pth"), ("PIX_MODEL", "pixelart_vgg19.pth")):
    os.environ[key] = str(ROOT / "weights" / name)

from pixelization import Model
from color_standard import normalize_colors, palettes


# Levels are ordered from fine detail to larger, coarser blocks.
LEVEL_BLOCK_SIZES = (4, 6, 8, 12, 16, 24, 32, 48, 64)


def output_dimensions(image, pixel_size):
    # Match pixelize_modified's thumbnail, integer resize and process() rounding.
    thumbnail = image.copy()
    thumbnail.thumbnail((1024, 1024), Image.Resampling.NEAREST)
    width = thumbnail.width * 4 // pixel_size
    height = thumbnail.height * 4 // pixel_size
    if min(width, height) < 16:
        return None
    return round(width / 4), round(height / 4)


def main():
    parser = argparse.ArgumentParser(description="Convert an image to pixel art on CPU")
    parser.add_argument("input", type=Path, help="input image")
    parser.add_argument("output", type=Path, nargs="?", help="output image; omit to list available levels")
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--level", type=int, help="level number from the list (larger means coarser)")
    selection.add_argument("--pixel-size", type=int, help="custom pixel block size (minimum 4; default 4)")
    parser.add_argument("--palette", choices=sorted(palettes()), help="normalize colors using the selected palette ID")
    parser.add_argument("--small", action="store_true", help="save at native pixel-art resolution")
    parser.add_argument("--threads", type=int, default=min(8, os.cpu_count() or 1), help="CPU threads (default: up to 8)")
    args = parser.parse_args()
    if args.threads < 1 or (args.pixel_size is not None and args.pixel_size < 4):
        parser.error("--pixel-size must be at least 4 and --threads must be positive")
    with Image.open(args.input) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    levels = [(i, size, output_dimensions(image, size)) for i, size in enumerate(LEVEL_BLOCK_SIZES, 1)]
    levels = [(i, size, dimensions) for i, size, dimensions in levels if dimensions is not None]
    if args.output is None:
        if args.level is not None or args.pixel_size is not None:
            parser.error("an output path is required when selecting a level or pixel size")
        print(f"Input: {args.input} ({image.width}x{image.height})")
        if not levels:
            parser.error("image is too small for the model (shortest side must be at least 16 pixels)")
        print("Level  Block size  Pixel dimensions  Pixel count")
        for level, size, (width, height) in levels:
            print(f"{level:5}  {size:10}  {width:5} x {height:<5}  {width * height:11}")
        return
    if args.level is not None:
        matching = [size for level, size, _ in levels if level == args.level]
        if not matching:
            parser.error("level is unavailable for this image; run with only the input path to list levels")
        pixel_size = matching[0]
    else:
        pixel_size = args.pixel_size if args.pixel_size is not None else 4
    dimensions = output_dimensions(image, pixel_size)
    if dimensions is None:
        parser.error("image is too small for this pixel size; use a larger image or smaller --pixel-size")
    for key in ("NET_MODEL", "ALIAS_MODEL", "PIX_MODEL"):
        if not Path(os.environ[key]).is_file():
            parser.error(f"missing model weight: {os.environ[key]}")
    torch.set_num_threads(args.threads)
    model = Model(device="cpu")
    model.load()
    model.G_A_net.eval()
    model.alias_net.eval()
    result = model.pixelize_modified(image, pixel_size, not args.small)
    if args.palette:
        result = normalize_colors(result, args.palette)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    print(f"Saved {args.output} ({result.width}x{result.height}); pixel grid: {dimensions[0]}x{dimensions[1]} ({dimensions[0] * dimensions[1]} pixels), block size: {pixel_size}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run Bria RMBG-2.0 locally after access to the gated model is granted."""
import argparse
import os
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import torch
from PIL import Image, ImageOps
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

MODEL = 'briaai/RMBG-2.0'
REVISION = '2fd7b4b0f2393ddb39a267fb62df6c010928a6c6'


def main():
    parser = argparse.ArgumentParser(description='Remove an image background with RMBG-2.0 on CPU')
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path, help='transparent PNG output')
    parser.add_argument('--threads', type=int, default=8)
    parser.add_argument('--local-files-only', action='store_true')
    args = parser.parse_args()
    if args.output.suffix.lower() != '.png':
        parser.error('output must be a PNG to preserve transparency')
    if args.threads < 1:
        parser.error('--threads must be positive')
    torch.set_num_threads(args.threads)
    with Image.open(args.input) as src:
        image = ImageOps.exif_transpose(src).convert('RGB')
    model = AutoModelForImageSegmentation.from_pretrained(
        MODEL, revision=REVISION, trust_remote_code=True,
        local_files_only=args.local_files_only,
    ).to('cpu').eval()
    transform = transforms.Compose([
        transforms.Resize((1024, 1024)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    with torch.inference_mode():
        prediction = model(transform(image).unsqueeze(0))[-1].sigmoid().cpu()
    alpha = transforms.ToPILImage()(prediction[0].squeeze()).resize(image.size)
    result = image.convert('RGBA')
    result.putalpha(alpha)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    print(f'Saved {args.output} ({result.width}x{result.height})')


if __name__ == '__main__':
    main()

"""Local CPU interface for RMBG background removal and pixel-art conversion."""
import argparse
import subprocess
import tempfile
import threading
from pathlib import Path

import gradio as gr
from PIL import Image, ImageOps
import torch

from run import LEVEL_BLOCK_SIZES, ROOT, Model, output_dimensions
from color_standard import DEFAULT_PALETTE, normalize_colors, palettes
from bead_pattern import create_pattern
from bead_optimize import optimize_beads

LOCK = threading.Lock()
pixel_model = None


def load_image(image):
    if image is None:
        return None, None, None, gr.update(choices=[], value=None), None, None
    image = ImageOps.exif_transpose(image).convert('RGB')
    levels = []
    for number, size in enumerate(LEVEL_BLOCK_SIZES, 1):
        dims = output_dimensions(image, size)
        if dims:
            levels.append((f'等级 {number}：{dims[0]} × {dims[1]} = {dims[0] * dims[1]} 像素（块大小 {size}）', number))
    if not levels:
        raise gr.Error('图片太小，最短边需至少 16 像素。')
    return image, None, None, gr.update(choices=levels, value=levels[0][1]), None, None


def automatic_cutout(image):
    if image is None:
        raise gr.Error('请先上传图片。')
    python = ROOT / '.venv-rmbg' / 'bin' / 'python'
    if not python.is_file():
        raise gr.Error('未找到 RMBG-2.0 环境 .venv-rmbg。')
    with LOCK, tempfile.TemporaryDirectory(prefix='rmbg-') as directory:
        input_path = Path(directory) / 'input.png'
        output_path = Path(directory) / 'cutout.png'
        image.save(input_path)
        process = subprocess.run(
            [str(python), str(ROOT / 'rmbg.py'), str(input_path), str(output_path),
             '--threads', str(torch.get_num_threads())],
            cwd=ROOT, capture_output=True, text=True,
        )
        if process.returncode:
            print(process.stderr[-4000:], flush=True)
            raise gr.Error('RMBG-2.0 抠图失败；请检查终端输出和模型访问权限。')
        with Image.open(output_path) as result:
            cutout = result.convert('RGBA')
            mask = cutout.getchannel('A')
    return mask, cutout, None, None


def convert(image, mask, level, small, palette_id=None):
    global pixel_model
    if image is None or mask is None:
        raise gr.Error('请先点击“RMBG 自动抠图”。')
    if level is None or not 1 <= int(level) <= len(LEVEL_BLOCK_SIZES):
        raise gr.Error('请选择有效等级。')
    size = LEVEL_BLOCK_SIZES[int(level) - 1]
    dims = output_dimensions(image, size)
    if dims is None:
        raise gr.Error('该等级不适合当前图片。')
    # White outside the selection keeps the RGB model input predictable.
    foreground = Image.composite(image, Image.new('RGB', image.size, 'white'), mask)
    with LOCK, torch.inference_mode():
        if pixel_model is None:
            pixel_model = Model(device='cpu')
            pixel_model.load()
            pixel_model.G_A_net.eval()
            pixel_model.alias_net.eval()
        result = pixel_model.pixelize_modified(foreground, size, not small).convert('RGBA')
    # Mirror the RGB pipeline's thumbnail, resize and center crop before sampling alpha.
    alpha = mask.copy()
    alpha.thumbnail((1024, 1024), Image.Resampling.NEAREST)
    alpha = alpha.resize((alpha.width * 4 // size, alpha.height * 4 // size), Image.Resampling.NEAREST)
    width, height = round(alpha.width / 4) * 4, round(alpha.height / 4) * 4
    left, top = (alpha.width - width) // 2, (alpha.height - height) // 2
    alpha = alpha.crop((left, top, left + width, top + height))
    alpha = alpha.resize(dims, Image.Resampling.NEAREST)
    if not small:
        alpha = alpha.resize(result.size, Image.Resampling.NEAREST)
    result.putalpha(alpha)
    if palette_id:
        result = normalize_colors(result, palette_id)
    return result


def generate_results(image, mask, level, small, palette_id, max_colors=24,
                     smoothing=35, cleanup=2, protect_edges=True, dither=False):
    # Optimize at one pixel per bead; scale only after the bead grid is finalized.
    pixel_image = convert(image, mask, level, True, palette_id)
    if not palette_id:
        gr.Warning('未选择拼豆色表，无法生成色号图纸。')
        if not small:
            size = LEVEL_BLOCK_SIZES[int(level) - 1]
            pixel_image = pixel_image.resize((pixel_image.width * size, pixel_image.height * size), Image.Resampling.NEAREST)
        return pixel_image, None
    grid = optimize_beads(pixel_image, palette_id, max_colors, smoothing, cleanup, protect_edges, dither)
    pattern = create_pattern(grid, palette_id)
    if small:
        return grid, pattern
    size = LEVEL_BLOCK_SIZES[int(level) - 1]
    return grid.resize((grid.width * size, grid.height * size), Image.Resampling.NEAREST), pattern


def main():
    parser = argparse.ArgumentParser(description='Local CPU background removal and pixel-art interface')
    parser.add_argument('--port', type=int, default=7860)
    parser.add_argument('--threads', type=int, default=8)
    args = parser.parse_args()
    if args.threads < 1:
        parser.error('--threads must be positive')
    torch.set_num_threads(args.threads)
    with gr.Blocks(title='自动抠图与像素化') as demo:
        gr.Markdown('# 自动抠图与像素化\n上传图片后，使用 RMBG 自动抠图，再选择像素等级生成图片。')
        source, mask = gr.State(), gr.State()
        upload = gr.Image(type='pil', label='上传图片', image_mode='RGB')
        auto_button = gr.Button('RMBG 自动抠图', variant='primary')
        with gr.Row():
            cutout = gr.Image(type='pil', label='透明背景抠图', format='png')
            output = gr.Image(type='pil', label='像素化结果（透明 PNG）', format='png')
        with gr.Row():
            level = gr.Dropdown(choices=[], label='像素等级')
            palette = gr.Dropdown(choices=[('不标准化', '')] + [(title, key) for key, title in palettes().items()], value=DEFAULT_PALETTE, label='拼豆颜色标准')
            small = gr.Checkbox(label='保存原始像素尺寸', value=False)
            generate = gr.Button('生成像素画', variant='primary')
        gr.Markdown('### 拼豆图纸优化')
        with gr.Row():
            max_colors = gr.Slider(1, 128, value=24, step=1, label='最大颜色数')
            smoothing = gr.Slider(0, 100, value=35, step=1, label='区域平滑（%）')
            cleanup = gr.Slider(0, 3, value=2, step=1, label='孤立区域清理阈值（颗；0 为关闭）')
        with gr.Row():
            protect_edges = gr.Checkbox(value=True, label='边缘保护')
            dither = gr.Checkbox(value=False, label='抖动（可能增加零散拼豆）')
        pattern = gr.Image(type='pil', label='拼豆图纸（PNG）', format='png')
        upload.change(load_image, upload, [source, mask, cutout, level, output, pattern])
        auto_button.click(automatic_cutout, source, [mask, cutout, output, pattern])
        generate.click(generate_results, [source, mask, level, small, palette, max_colors, smoothing, cleanup, protect_edges, dither], [output, pattern])
    demo.queue(default_concurrency_limit=1).launch(server_name='127.0.0.1', server_port=args.port, inbrowser=False)


if __name__ == '__main__':
    main()

"""Upload validation, decoding and PNG encoding helpers."""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from ..errors import InvalidImageError, PayloadTooLargeError

ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP", "BMP", "GIF", "TIFF"}
MIN_SIDE = 16


@dataclass(frozen=True)
class ImageLimits:
    max_bytes: int
    max_pixels: int


async def read_upload(upload, limits: ImageLimits, chunk_size: int = 64 * 1024) -> bytes:
    """Read an UploadFile without ever buffering more than the configured limit."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > limits.max_bytes:
            raise PayloadTooLargeError(
                f"图片超过 {limits.max_bytes // (1024 * 1024)} MB 上限。"
            )
        chunks.append(chunk)
    if total == 0:
        raise InvalidImageError("上传的图片为空。")
    return b"".join(chunks)


def load_rgb_image(data: bytes, limits: ImageLimits) -> Image.Image:
    """Decode an image, normalize EXIF orientation and flatten transparency on white."""
    if len(data) > limits.max_bytes:
        raise PayloadTooLargeError("图片体积超过上限。")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise InvalidImageError(f"不支持的图片格式：{probe.format or 'unknown'}。")
            width, height = probe.size
            if width < MIN_SIDE or height < MIN_SIDE:
                raise InvalidImageError(f"图片最短边需至少 {MIN_SIDE} 像素。")
            if width * height > limits.max_pixels:
                raise InvalidImageError(
                    f"图片像素数超过上限（{limits.max_pixels // 1_000_000} MP）。"
                )
            probe.load()
            image = ImageOps.exif_transpose(probe)
    except UnidentifiedImageError as exc:
        raise InvalidImageError("无法识别图片，请上传 PNG、JPEG 或 WebP 文件。") from exc
    except Image.DecompressionBombError as exc:
        raise InvalidImageError("图片尺寸过大，无法安全解码。") from exc
    except OSError as exc:
        raise InvalidImageError("图片已损坏或格式不受支持。") from exc

    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, "white")
        background.paste(rgba, mask=rgba.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")
    return image


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=6)
    return buffer.getvalue()


def png_data_uri(image: Image.Image) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes(image)).decode("ascii")

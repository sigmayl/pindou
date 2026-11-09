"""CPU pixel-art inference using the Pixelization generator weights.

Only the sub-modules required by the modified inference path are instantiated.
The upstream generator also builds a 533 MB VGG19 encoder which is unused by
``pixelize_modified``; skipping it keeps the production image and RAM footprint
smaller while producing bit-identical output.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image

from ..errors import InvalidParameterError, ModelUnavailableError
from ..model_arch.c2pGen import MLP, AliasNet, RGBDecoder, RGBEncoder

# Fixed style code used by the upstream `pixelize_modified` entry point.
PIXELIZE_CODE = [
    233356.8125, -27387.5918, -32866.8008, 126575.0312, -181590.0156,
    -31543.1289, 50374.1289, 99631.4062, -188897.3750, 138322.7031,
    -107266.2266, 125778.5781, 42416.1836, 139710.8594, -39614.6250,
    -69972.6875, -21886.4141, 86938.4766, 31457.6270, -98892.2344,
    -1191.5887, -61662.1719, -180121.9062, -32931.0859, 43109.0391,
    21490.1328, -153485.3281, 94259.1797, 43103.1992, -231953.8125,
    52496.7422, 142697.4062, -34882.7852, -98740.0625, 34458.5078,
    -135436.3438, 11420.5488, -18895.8984, -71195.4141, 176947.2344,
    -52747.5742, 109054.6562, -28124.9473, -17736.6152, -41327.1562,
    69853.3906, 79046.2656, -3923.7344, -5644.5229, 96586.7578,
    -89315.2656, -146578.0156, -61862.1484, -83956.4375, 87574.5703,
    -75055.0469, 19571.8203, 79358.7891, -16501.5000, -147169.2188,
    -97861.6797, 60442.1797, 40156.9023, 223136.3906, -81118.0547,
    -221443.6406, 54911.6914, 54735.9258, -58805.7305, -168884.4844,
    40865.9609, -28627.9043, -18604.7227, 120274.6172, 49712.2383,
    164402.7031, -53165.0820, -60664.0469, -97956.1484, -121468.4062,
    -69926.1484, -4889.0151, 127367.7344, 200241.0781, -85817.7578,
    -143190.0625, -74049.5312, 137980.5781, -150788.7656, -115719.6719,
    -189250.1250, -153069.7344, -127429.7891, -187588.2500, 125264.7422,
    -79082.3438, -114144.5781, 36033.5039, -57502.2188, 80488.1562,
    36501.4570, -138817.5938, -22189.6523, -222146.9688, -73292.3984,
    127717.2422, -183836.3750, -105907.0859, 145422.8750, 66981.2031,
    -9596.6699, 78099.4922, 70226.3359, 35841.8789, -116117.6016,
    -150986.0156, 81622.4922, 113575.0625, 154419.4844, 53586.4141,
    118494.8750, 131625.4375, -19763.1094, 75581.1172, -42750.5039,
    97934.8281, 6706.7949, -101179.0078, 83519.6172, -83054.8359,
    -56749.2578, -30683.6992, 54615.9492, 84061.1406, -229136.7188,
    -60554.0000, 8120.2622, -106468.7891, -28316.3418, -166351.3125,
    47797.3984, 96013.4141, 71482.9453, -101429.9297, 209063.3594,
    -3033.6882, -38952.5352, -84920.6719, -5895.1543, -18641.8105,
    47884.3633, -14620.0273, -132898.6719, -40903.5859, 197217.3750,
    -128599.1328, -115397.8906, -22670.7676, -78569.9688, -54559.7070,
    -106855.2031, 40703.1484, 55568.3164, 60202.9844, -64757.9375,
    -32068.8652, 160663.3438, 72187.0703, -148519.5469, 162952.8906,
    -128048.2031, -136153.8906, -15270.3730, -52766.3281, -52517.4531,
    18652.1992, 195354.2188, -136657.3750, -8034.2622, -92699.6016,
    -129169.1406, 188479.9844, 46003.7500, -93383.0781, -67831.6484,
    -66710.5469, 104338.5234, 85878.8438, -73165.2031, 95857.3203,
    71213.1250, 94603.1094, -30359.8125, -107989.2578, 99822.1719,
    184626.3594, 79238.4531, -272978.9375, -137948.5781, -145245.8125,
    75359.2031, 26652.7930, 50421.4141, 60784.4102, -18286.3398,
    -182851.9531, -87178.7969, -13131.7539, 195674.8906, 59951.7852,
    124353.7422, -36709.1758, -54575.4766, 77822.6953, 43697.4102,
    -64394.3438, 113281.1797, -93987.0703, 221989.7188, 132902.5000,
    -9538.8574, -14594.1338, 65084.9453, -12501.7227, 130330.6875,
    -115123.4766, 20823.0898, 75512.4922, -75255.7422, -41936.7656,
    -186678.8281, -166799.9375, 138770.6250, -78969.9531, 124516.8047,
    -85558.5781, -69272.4375, -115539.1094, 228774.4844, -76529.3281,
    -107735.8906, -76798.8906, -194335.2812, 56530.5742, -9397.7529,
    132985.8281, 163929.8438, -188517.7969, -141155.6406, 45071.0391,
    207788.3125, -125826.1172, 8965.3320, -159584.8438, 95842.4609,
    -76929.4688,
]

MAX_SOURCE_SIDE = 1024


class PixelArtGenerator(nn.Module):
    """The generator sub-graph used by the fixed-style inference path."""

    def __init__(self) -> None:
        super().__init__()
        self.RGBEnc = RGBEncoder(3, 64, 2, 4, "in", "relu", "reflect")
        self.RGBDec = RGBDecoder(
            self.RGBEnc.output_dim,
            3,
            2,
            4,
            res_norm="adain",
            activ="relu",
            pad_type="reflect",
        )
        self.MLP = MLP(256, 2048, 256, 3, norm="none", activ="relu")


@dataclass(frozen=True)
class PixelateMeta:
    pixel_size: int
    source_width: int
    source_height: int
    thumb_width: int
    thumb_height: int
    resized_width: int
    resized_height: int
    crop_left: int
    crop_top: int
    crop_width: int
    crop_height: int
    grid_width: int
    grid_height: int

    def as_dict(self) -> dict[str, int]:
        return {
            "pixel_size": self.pixel_size,
            "source_width": self.source_width,
            "source_height": self.source_height,
            "thumb_width": self.thumb_width,
            "thumb_height": self.thumb_height,
            "resized_width": self.resized_width,
            "resized_height": self.resized_height,
            "crop_left": self.crop_left,
            "crop_top": self.crop_top,
            "crop_width": self.crop_width,
            "crop_height": self.crop_height,
            "grid_width": self.grid_width,
            "grid_height": self.grid_height,
        }


@dataclass(frozen=True)
class PixelateResult:
    image: Image.Image
    meta: PixelateMeta


def geometry(image: Image.Image, pixel_size: int) -> PixelateMeta:
    thumbnail = image.copy()
    thumbnail.thumbnail((MAX_SOURCE_SIDE, MAX_SOURCE_SIDE), Image.Resampling.NEAREST)
    resized_width = thumbnail.width * 4 // pixel_size
    resized_height = thumbnail.height * 4 // pixel_size
    if min(resized_width, resized_height) < 16:
        raise InvalidParameterError("该像素等级对当前图片太小，请选择更细的等级或换一张更大的图。")
    grid_width = round(resized_width / 4)
    grid_height = round(resized_height / 4)
    # The upstream pipeline rounds UP to a multiple of four and lets PIL crop
    # pad the one/two missing rows or columns. Keep the same geometry here.
    crop_width = grid_width * 4
    crop_height = grid_height * 4
    crop_left = (resized_width - crop_width) // 2
    crop_top = (resized_height - crop_height) // 2
    return PixelateMeta(
        pixel_size=pixel_size,
        source_width=image.width,
        source_height=image.height,
        thumb_width=thumbnail.width,
        thumb_height=thumbnail.height,
        resized_width=resized_width,
        resized_height=resized_height,
        crop_left=crop_left,
        crop_top=crop_top,
        crop_width=crop_width,
        crop_height=crop_height,
        grid_width=grid_width,
        grid_height=grid_height,
    )


def process_tensor(image: Image.Image) -> torch.Tensor:
    """Match the upstream `process()`: crop to multiple of 4 and normalize."""
    width, height = image.size
    crop_width = round(width / 4) * 4
    crop_height = round(height / 4) * 4
    left = (width - crop_width) // 2
    top = (height - crop_height) // 2
    image = image.crop((left, top, left + crop_width, top + crop_height))
    data = torch.from_numpy(np.asarray(image, dtype=np.float32).copy())
    data = data.permute(2, 0, 1) / 127.5 - 1.0
    return data.unsqueeze(0)


class PixelizationService:
    def __init__(self, weights_dir: Path, max_pixel_size: int = 64) -> None:
        self.weights_dir = Path(weights_dir)
        self.max_pixel_size = max_pixel_size
        self._lock = threading.Lock()
        self._generator: PixelArtGenerator | None = None
        self._alias: AliasNet | None = None
        self._adain: torch.Tensor | None = None
        self._load_error: str | None = None

    @property
    def loaded(self) -> bool:
        return self._generator is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def load(self) -> None:
        if self._generator is not None:
            return
        net_path = self.weights_dir / "160_net_G_A.pth"
        alias_path = self.weights_dir / "alias_net.pth"
        missing = [str(path) for path in (net_path, alias_path) if not path.is_file()]
        if missing:
            self._load_error = "missing weights: " + ", ".join(missing)
            raise ModelUnavailableError(
                "模型权重缺失：" + "，".join(missing) + "。请运行 scripts/download-weights.sh。"
            )
        try:
            generator = PixelArtGenerator()
            state = torch.load(net_path, map_location="cpu", weights_only=True)
            state = {key: value for key, value in state.items() if not key.startswith("PBEnc.")}
            generator.load_state_dict(state, strict=True)
            alias = AliasNet(3, 3, 64, 2, 3)
            alias.load_state_dict(
                torch.load(alias_path, map_location="cpu", weights_only=True), strict=True
            )
            generator.eval()
            alias.eval()
            for parameter in generator.parameters():
                parameter.requires_grad_(False)
            for parameter in alias.parameters():
                parameter.requires_grad_(False)
            with torch.inference_mode():
                code = torch.asarray(PIXELIZE_CODE, dtype=torch.float32).reshape(1, 256, 1, 1)
                adain = generator.MLP(code)
            self._generator = generator
            self._alias = alias
            self._adain = adain
            self._load_error = None
        except ModelUnavailableError:
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced as a 503
            self._load_error = str(exc)
            raise ModelUnavailableError(f"像素化模型加载失败：{exc}") from exc

    def pixelate(self, image: Image.Image, pixel_size: int) -> PixelateResult:
        if not 4 <= pixel_size <= self.max_pixel_size:
            raise InvalidParameterError(
                f"pixel_size 必须在 4 到 {self.max_pixel_size} 之间。"
            )
        if self._generator is None:
            self.load()
        assert self._generator is not None and self._alias is not None and self._adain is not None
        meta = geometry(image, pixel_size)
        source = image.copy()
        source.thumbnail((MAX_SOURCE_SIDE, MAX_SOURCE_SIDE), Image.Resampling.NEAREST)
        source = source.resize(
            (meta.resized_width, meta.resized_height), Image.Resampling.BICUBIC
        )
        with self._lock, torch.inference_mode():
            tensor = process_tensor(source)
            features = self._generator.RGBEnc(tensor)
            generated = self._generator.RGBDec(features, self._adain)
            output = self._alias(generated)
            data = output[0].detach().cpu().numpy()
        grid = np.transpose(data, (1, 2, 0))
        grid = np.clip((grid + 1.0) * 127.5, 0, 255).astype(np.uint8)
        image_out = Image.fromarray(grid, mode="RGB")
        # The network output is 4x the bead grid; one output pixel = one bead.
        if image_out.size != (meta.grid_width, meta.grid_height):
            image_out = image_out.resize(
                (meta.grid_width, meta.grid_height), Image.Resampling.NEAREST
            )
        return PixelateResult(image=image_out, meta=meta)

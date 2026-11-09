"""RMBG-2.0 background matte inference (optional dependency)."""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image

from ..errors import ModelUnavailableError

LOGGER = logging.getLogger(__name__)

MODEL_SIZE = (1024, 1024)


@dataclass(frozen=True)
class MatteResult:
    mask: Image.Image
    width: int = MODEL_SIZE[0]
    height: int = MODEL_SIZE[1]


class RmbgService:
    def __init__(
        self,
        enabled: bool,
        model_id: str,
        revision: str,
        local_files_only: bool = False,
        hf_token: str | None = None,
    ) -> None:
        self.enabled = enabled
        self.model_id = model_id
        self.revision = revision
        self.local_files_only = local_files_only
        self.hf_token = hf_token
        self._lock = threading.Lock()
        self._model = None
        self._transform = None
        self._load_error: str | None = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def load(self) -> None:
        if not self.enabled:
            raise ModelUnavailableError("服务端未启用自动抠图（RMBG_ENABLED=false）。")
        if self._model is not None:
            return
        try:
            from torchvision import transforms
            from transformers import AutoModelForImageSegmentation
        except ImportError as exc:
            self._load_error = str(exc)
            raise ModelUnavailableError(
                "自动抠图依赖未安装；请安装 backend/requirements-rmbg.txt。"
            ) from exc

        with self._lock:
            if self._model is not None:
                return
            try:
                LOGGER.info("Loading RMBG model %s@%s", self.model_id, self.revision)
                model = AutoModelForImageSegmentation.from_pretrained(
                    self.model_id,
                    revision=self.revision,
                    trust_remote_code=True,
                    local_files_only=self.local_files_only,
                    token=self.hf_token,
                )
                model.to("cpu").eval()
                for parameter in model.parameters():
                    parameter.requires_grad_(False)
                self._model = model
                self._transform = transforms.Compose(
                    [
                        transforms.Resize(MODEL_SIZE),
                        transforms.ToTensor(),
                        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
                    ]
                )
                self._load_error = None
                LOGGER.info("RMBG model loaded")
            except Exception as exc:  # noqa: BLE001 - surfaced as a 503
                self._load_error = str(exc)
                raise ModelUnavailableError(
                    "自动抠图模型加载失败；请确认已接受模型访问条款并配置 HF_TOKEN。"
                ) from exc

    def predict(self, image: Image.Image) -> MatteResult:
        if not self.enabled:
            raise ModelUnavailableError("服务端未启用自动抠图（RMBG_ENABLED=false）。")
        if self._model is None:
            self.load()
        assert self._model is not None and self._transform is not None
        tensor = self._transform(image.convert("RGB")).unsqueeze(0)
        with self._lock, torch.inference_mode():
            prediction = self._model(tensor)[-1].sigmoid().cpu()
        matte = prediction[0].squeeze()
        if matte.ndim != 2:
            raise ModelUnavailableError("自动抠图模型输出格式异常。")
        array = (matte.numpy() * 255.0).clip(0, 255).astype(np.uint8)
        mask = Image.fromarray(array, mode="L")
        if mask.size != MODEL_SIZE:
            mask = mask.resize(MODEL_SIZE, Image.Resampling.BICUBIC)
        return MatteResult(mask=mask)

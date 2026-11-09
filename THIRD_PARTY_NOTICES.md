# 第三方组件与许可说明

本项目包含或依赖以下第三方作品。**上线前请自行核实并取得所需授权**，尤其是商业用途。

## Pixilate（像素化引擎）

- 来源：<https://github.com/Shilo/pixilate>
- 固定提交：`4a24bba1a67e03493921618f7ff5c8d2c0b77565`（`prototype/src/lib/core/`）
- 许可证：MIT。许可证全文见 `frontend/src/lib/pixilate/LICENSE` 与 `frontend/public/licenses/pixilate-LICENSE.txt`。
- 说明：仅 vendored 无运行时依赖的纯转换核心，本地修改在源码中以 `pindou:` 注释标出（限色与拼豆色表标准化、色表条目上限、类型清理），详见 `frontend/src/lib/pixilate/README.md`。

## RMBG-2.0（自动抠图模型）

- 来源：<https://huggingface.co/briaai/RMBG-2.0>
- 上游标注：**非商业使用许可**（需在 Hugging Face 接受模型访问条款）。
- 说明：商业用途需另行向权利人确认。RMBG 是可选功能，可通过 `RMBG_ENABLED=false` 关闭。

## pindou-color-data（拼豆色表）

- 来源：<https://github.com/HansBug/pindou-color-data>
- 固定提交：`178dafbc9e77d3de556550dbd058270200129186`
- 许可证：MIT。许可证全文见 `data/pindou-color-data/LICENSE` 与 `frontend/public/licenses/pindou-color-data-LICENSE.txt`。
- 说明：色表数据由上游整理；实际豆子颜色可能与屏幕和色表存在差异。

## three.js（3D 预览）

- 来源：<https://github.com/mrdoob/three.js>
- 许可证：MIT。仅在前端按需懒加载，用于拼豆熨烫效果预览。

## Python / JavaScript 依赖

后端依赖 FastAPI、Uvicorn、PyTorch、torchvision、Pillow、NumPy、Transformers、timm、kornia 等，前端依赖 React、Vite、three.js 等。各自许可证以对应发行包为准。CPU 版 PyTorch 从 PyTorch 官方 CPU wheel 索引安装。

## 示例图片

仓库不再内置示例图片。测试时请使用你拥有权利的照片或素材。`docs/preview.png` 为界面截图。

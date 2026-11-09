# 第三方组件与许可说明

本项目包含或依赖以下第三方作品。**上线前请自行核实并取得所需授权**，尤其是商业用途。

## Pixelization（像素化模型）

- 来源：<https://huggingface.co/ashleykleynhans/pixelization>
- 内容：`160_net_G_A.pth`、`alias_net.pth`（以及本项目不再加载的 `pixelart_vgg19.pth`）、原始推理代码。
- 上游标注许可证：**unknown**。
- 说明：模型仓库未声明明确许可证，使用和分发前请自行确认原模型及推理代码的许可。本项目对上游推理代码中 `pixelize_modified` 所需子网络做了等价精简加载，不改变权重。

## RMBG-2.0（自动抠图模型）

- 来源：<https://huggingface.co/briaai/RMBG-2.0>
- 上游标注：**非商业使用许可**（需在 Hugging Face 接受模型访问条款）。
- 说明：商业用途需另行向权利人确认。RMBG 是可选功能，可通过 `RMBG_ENABLED=false` 关闭。

## pindou-color-data（拼豆色表）

- 来源：<https://github.com/HansBug/pindou-color-data>
- 固定提交：`178dafbc9e77d3de556550dbd058270200129186`
- 许可证：MIT。许可证全文见 `data/pindou-color-data/LICENSE` 与 `frontend/public/licenses/pindou-color-data-LICENSE.txt`。
- 说明：色表数据由上游整理；实际豆子颜色可能与屏幕和色表存在差异。

## Python / JavaScript 依赖

后端依赖 FastAPI、Uvicorn、PyTorch、torchvision、Pillow、NumPy、Transformers、timm、kornia 等，前端依赖 React、Vite 等。各自许可证以对应发行包为准。CPU 版 PyTorch 从 PyTorch 官方 CPU wheel 索引安装。

## 示例图片

仓库不再内置示例图片。测试时请使用你拥有权利的照片或素材。`docs/preview.png` 为界面截图。

# Legacy 参考实现

这里的文件是重构前的扁平脚本与输出，仅用于对照算法行为，不再由新项目引用。

- 新后端：`backend/`
- 新前端：`frontend/`
- 新权重：`backend/weights/`（用 `scripts/download-weights.sh` 下载）
- 旧输出：`legacy/outputs/`
- 旧权重目录：已移出，避免与新项目重复占用空间；旧 `run.py` 需要把权重放回这里才能运行。
- 示例图片：`legacy/Klee_in_Genshin_Impact.jpg`，仅本地参考，请勿再分发。

旧脚本依赖旧 Python 环境与 `pixelart_vgg19.pth`；新后端使用精简加载，不需要 533 MB 的 VGG 权重。

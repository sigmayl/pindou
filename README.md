# 拼豆工坊 · Pindou Convert

把照片转换成像素画与可打印的拼豆图纸。前后端分离，无账号体系：

- **后端**只做模型推理（CPU）：Pixelization 像素化 + 可选的 RMBG-2.0 自动抠图。
- **前端**负责所有像素图像后处理：蒙版对齐、拼豆色表匹配、限色/平滑/清理、图纸排版与 PNG 导出。
- 上传的图片只在一次请求的内存中处理，不落盘、不建库、不需要登录。

![界面预览](docs/preview.png)

## 架构

```
浏览器（React + Vite）
  ├─ 解码图片 / EXIF 方向 / 蒙版对齐 / 透明通道
  ├─ CIE Lab 色差匹配 + 贪心限色 + 区域平滑 + 孤立点清理 + 抖动
  ├─ Canvas 拼豆图纸（网格、色号、用量图例）
  └─ 下载 PNG
        │  multipart 上传（仅推理所需图片）
        ▼
FastAPI（CPU PyTorch）
  ├─ POST /api/v1/pixelate          → 原始像素网格 PNG + 几何元数据
  └─ POST /api/v1/remove-background → 1024×1024 灰度蒙版 PNG
```

后端不读取拼豆色表，也不生成图纸。像素网格的几何元数据（缩放、裁剪、网格尺寸）随响应返回，前端据此把蒙版精确对齐到网格。

### 目录

```
backend/
  app/                 FastAPI 应用、服务层、模型定义
  weights/             160_net_G_A.pth / alias_net.pth（不入库）
  tests/               pytest
  Dockerfile
frontend/
  src/lib/             Lab、色表、优化、图纸、图像几何
  src/workers/         颜色优化的 Web Worker
  src/components/      UI
  Dockerfile + nginx.conf
scripts/
  build-palettes.mjs   从 data/pindou-color-data 生成前端色表包
  download-weights.sh  下载并校验模型权重
data/pindou-color-data/ 色表原始数据（MIT）
docker-compose.yml
legacy/                重构前的扁平脚本与旧输出，仅作对照，可删除
```

## 快速开始

### Docker（推荐）

```bash
cp .env.example .env
# 编辑 .env：至少设置 CORS_ORIGINS；需要用自动抠图时填写 HF_TOKEN
bash scripts/download-weights.sh
docker compose up -d --build
```

打开 <http://localhost:8080>。API 文档在容器内部的 `/docs`，默认不对外暴露。

也可以直接使用 GHCR 已发布的双架构镜像，不本地构建：

```bash
cp .env.example .env
docker compose pull
docker compose up -d
```

首次构建会安装 CPU 版 PyTorch 与 RMBG 依赖，镜像较大；模型权重通过 bind mount 挂载，不写进镜像。

### 多架构镜像与 CI

`.github/workflows/docker.yml` 会在 push 到 `main`、推送 `v*` 标签或手动触发时，构建并推送 `linux/amd64` + `linux/arm64` 双架构镜像到 GHCR：

```text
ghcr.io/sigmayl/pindou-backend:latest
ghcr.io/sigmayl/pindou-frontend:latest
```

ARM64 上使用 PyTorch 官方 CPU wheel（`torch==2.15.0+cpu` / `torchvision==0.29.2+cpu` 均提供 aarch64 构建），不依赖 GPU。首次构建 ARM 镜像会通过 QEMU 模拟，耗时较长；后续走 GitHub Actions 缓存。

本地用 Buildx 构建双架构（需要 Docker Buildx 插件）：

```bash
docker buildx bake -f docker-bake.hcl
# 只构建 arm64 并加载到本地：
docker buildx bake -f docker-bake.hcl --set "*.platform=linux/arm64" --load
```

`.github/workflows/ci.yml` 负责后端 pytest + ruff 与前端 Vitest + 类型检查 + 生产构建。

### 本地开发

需要 Python 3.12、Node.js ≥ 20.19。

```bash
make setup          # 创建 .venv，安装后端与前端依赖
make weights        # 下载 160_net_G_A.pth + alias_net.pth（约 178 MB）
make palettes       # 从 data/ 生成前端色表（仓库已包含生成结果）
```

开两个终端：

```bash
make dev-backend    # http://127.0.0.1:8000
make dev-frontend   # http://localhost:5173
```

Vite 会把 `/api` 代理到 `127.0.0.1:8000`。若后端在别处，设置 `VITE_DEV_BACKEND` 或在 `.env` 中设置 `VITE_API_BASE_URL`。

### 启用自动抠图（RMBG-2.0）

RMBG-2.0 是 gated 模型：

1. 登录 Hugging Face，在 [briaai/RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) 接受访问条款。
2. 创建 read token，填入 `.env` 的 `HF_TOKEN`。
3. 本地开发额外安装依赖：`make setup-rmbg`。
4. 重启后端。Docker 构建默认安装 RMBG 依赖（`INSTALL_RMBG=true`）。

不启用时设置 `RMBG_ENABLED=false`，前端会隐藏/禁用抠图按钮，直接生成像素画。RMBG 模型权重会缓存到 Docker volume `huggingface-cache`。

首次抠图可能需要下载数百 MB 模型，耗时取决于网络；配置好 token 后可设置 `RMBG_PRELOAD=true`，让容器在启动阶段完成下载与加载。

## API

所有接口返回 JSON；图片以 `data:image/png;base64,...` 返回。错误统一为：

```json
{ "error": { "code": "invalid_image", "message": "..." } }
```

### `POST /api/v1/pixelate`

`multipart/form-data`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `image` | file | PNG/JPEG/WebP/BMP/GIF/TIFF，≤ 20 MB，≤ 3000 万像素 |
| `pixel_size` | int | 4–64；越大格子越粗。前端等级为 4/6/8/12/16/24/32/48/64 |

响应：

```json
{
  "image": "data:image/png;base64,...",
  "elapsed_ms": 219.4,
  "meta": {
    "pixel_size": 8,
    "source_width": 225, "source_height": 428,
    "thumb_width": 225, "thumb_height": 428,
    "resized_width": 112, "resized_height": 214,
    "crop_left": 0, "crop_top": -1,
    "crop_width": 112, "crop_height": 216,
    "grid_width": 28, "grid_height": 54
  }
}
```

`meta` 是前端对齐蒙版的唯一依据。`crop_*` 可能为负：上游流程按 4 的倍数向上取整，PIL 会补边，前端需按同样方式补透明边。

### `POST /api/v1/remove-background`

`multipart/form-data` 的 `image`。返回 1024×1024 灰度蒙版：

```json
{ "mask": "data:image/png;base64,...", "width": 1024, "height": 1024, "elapsed_ms": 11534.7 }
```

前端把蒙版缩放到原图尺寸并用于透明抠图。该接口需要 `RMBG_ENABLED=true` 且模型可加载。

### 其他

- `GET /healthz`：存活探针。
- `GET /readyz`：像素模型是否已加载；未就绪返回 503。
- `GET /api/v1/info`：版本、限制、RMBG 是否启用/已加载。
- `GET /docs`：OpenAPI 文档（生产环境建议只在内网开放）。

## 配置

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `production` | 环境标识 |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `MODEL_WEIGHTS_DIR` | `backend/weights` | 权重目录 |
| `PIXEL_THREADS` | `min(8, CPU)` | PyTorch CPU 线程数 |
| `INFERENCE_CONCURRENCY` | `1` | 同时进行的推理数；CPU 上建议 1 |
| `INFERENCE_WAIT_TIMEOUT` | `120` | 排队等待秒数，超时 503 |
| `MAX_UPLOAD_BYTES` | `20971520` | 上传体积上限 |
| `MAX_IMAGE_PIXELS` | `30000000` | 解码像素上限 |
| `RMBG_ENABLED` | `true` | 是否启用抠图接口 |
| `RMBG_PRELOAD` | `false` | 启动时预加载 RMBG |
| `RMBG_MODEL_ID` | `briaai/RMBG-2.0` | 模型 ID |
| `RMBG_REVISION` | 固定 commit | 避免上游漂移 |
| `RMBG_LOCAL_FILES_ONLY` | `false` | 只使用本地缓存 |
| `HF_TOKEN` | 空 | gated 模型访问令牌 |
| `CORS_ORIGINS` | 本地开发地址 | 逗号分隔；同源部署可不配 |
| `TRUSTED_HOSTS` | `*` | Host 白名单 |
| `TRUST_PROXY_HEADERS` | `false` | 是否信任 `X-Forwarded-For` |
| `RATE_LIMIT_PER_MINUTE` | `30` | 每 IP 每分钟请求数，0 关闭 |
| `RATE_LIMIT_BURST` | `10` | 令牌桶容量 |

前端构建变量：

- `VITE_API_BASE_URL`：默认空，表示同源 `/api`。前后端分开域名时设为 `https://api.example.com`。
- `VITE_DEV_BACKEND`：仅 Vite 开发服务器使用。

## 前端算法说明

- **颜色匹配**：sRGB → CIE L\*a\*b\*（D65），ΔE76 平方距离最近色。
- **限色**：按可见像素颜色及出现次数，贪心选择能最大程度降低总误差的色卡颜色，数量不超过“最大颜色数”。
- **区域平滑**：最多 4 轮，颜色误差与四邻域一致性加权；边缘保护按原始 Lab 色差降低跨边缘权重。
- **孤立区域清理**：四连通区域 ≤ 阈值时尝试并入邻居；强边缘可阻止合并。
- **抖动**：4×4 有序抖动，只在已选颜色间选择；边缘保护下跳过强梯度。
- **图纸**：每个可见格一颗豆；格内显示色号（空间足够时），下方图例按色号统计数量。

这些算法在 `frontend/src/lib/optimize.ts`，与原始 Python 实现以固定样例做了回归对比（允许 1–2 个像素的 float32 近似误差）。颜色优化在 Web Worker 中执行，避免阻塞界面。

前端会把工作图最长边限制为 2048 像素（模型内部仍缩到 1024），以降低手机内存占用；网格等级基于工作图尺寸计算，与直接上传原图的结果基本一致。

## 测试

```bash
make test
```

- 后端：上传校验、几何对齐、权重加载、API 行为、RMBG 未启用时的 503。
- 前端：Lab/半偶舍入、等级几何、色表匹配、清理/透明像素、与 Python 固定样例的像素回归。

端到端手工检查：

```bash
make dev-backend
make dev-frontend
# 浏览器打开 http://localhost:5173，上传图片 → 生成 → 下载图纸
```

## 生产部署清单

1. **HTTPS**：在云负载均衡或外层 Nginx/Caddy 终止 TLS；前端容器只监听 80。
2. **只暴露前端**：Compose 中 backend 使用 `expose`，不要直接映射到公网；如必须暴露，限制安全组并配置 `TRUSTED_HOSTS`。`frontend/nginx.conf` 假设 Compose 服务名为 `backend`；若前后端分开部署，设置 `VITE_API_BASE_URL` 并调整/移除 `/api` 代理。
3. **CORS**：同源部署不需要；跨域时设置精确的 `CORS_ORIGINS`，不要使用 `*` 配合凭证。
4. **限流**：后端自带按 IP 令牌桶；外层可再加 Nginx `limit_req` / 云 WAF。
5. **上传限制**：按业务调整 `MAX_UPLOAD_BYTES` / `MAX_IMAGE_PIXELS`，并同步外层 `client_max_body_size`。
6. **资源**：单进程加载两个模型约占 0.5–1 GB 内存；CPU 推理并发保持 1，按 CPU 核数设置 `PIXEL_THREADS`。
7. **健康检查**：`/healthz` 用于存活，`/readyz` 用于就绪（模型加载完成才接流量）。
8. **日志**：stdout 结构化前缀 + `X-Request-ID`；不要记录图片内容。容器日志交给平台收集。
9. **数据**：应用不写上传文件、不建数据库；如启用 RMBG，HF 缓存 volume 需要持久化。
10. **模型许可**：见 `THIRD_PARTY_NOTICES.md`。Pixelization 权重上游许可证为 unknown；RMBG-2.0 标注非商业使用。上线前请自行确认商业授权。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| `/readyz` 503，日志 `模型权重缺失` | 运行 `bash scripts/download-weights.sh`，确认 `MODEL_WEIGHTS_DIR` |
| 抠图返回 503 `model_unavailable` | 检查 `RMBG_ENABLED`、`HF_TOKEN`、是否已接受模型条款；或安装 `requirements-rmbg.txt` |
| 前端显示“服务未连接” | 后端未启动、端口不对，或 `VITE_API_BASE_URL` 配错 |
| 生成时 422 `invalid_image` | 图片损坏/格式不支持/超过像素或体积限制 |
| 生成时 503 `service_busy` | 推理排队超时；降低并发、提高 `INFERENCE_WAIT_TIMEOUT` 或扩容 |
| 图纸中文显示为方框 | 服务器端不渲染图纸；问题在用户浏览器字体，安装/启用中文字体即可 |
| 图纸下载无反应 | 浏览器拦截 blob 下载；允许本站下载后重试 |

## 第三方与许可

- Pixelization 权重与推理代码：<https://huggingface.co/ashleykleynhans/pixelization>（license: unknown）。
- RMBG-2.0：<https://huggingface.co/briaai/RMBG-2.0>（非商业使用许可，需接受条款）。
- 拼豆色表：<https://github.com/HansBug/pindou-color-data>，MIT，固定提交 `178dafbc9e77d3de556550dbd058270200129186`。许可证见 `frontend/public/licenses/`。

本项目应用代码采用 MIT 许可证（见 [LICENSE](LICENSE)）；模型权重与色表另见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

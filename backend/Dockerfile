FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=8 \
    MKL_NUM_THREADS=8 \
    HF_HOME=/home/appuser/.cache/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-rmbg.txt ./
ARG INSTALL_RMBG=true
RUN pip install --upgrade pip \
    && pip install --index-url https://download.pytorch.org/whl/cpu \
        torch==2.15.0+cpu torchvision==0.29.2+cpu \
    && pip install -r requirements.txt \
    && if [ "$INSTALL_RMBG" = "true" ]; then pip install -r requirements-rmbg.txt; fi

COPY app ./app

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /home/appuser/.cache/huggingface \
    && chown -R appuser:appuser /app /home/appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/readyz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers"]

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    HF_HOME=/app/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/sentence-transformers \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

COPY app ./app

RUN mkdir -p /app/uploads /app/.cache/huggingface /app/.cache/sentence-transformers

EXPOSE 8000

CMD sh -c 'if [ "${AVERION_PROCESS:-}" = "worker" ] || [ "${RAILWAY_SERVICE_NAME:-}" = "amiable-laughter" ] || [ "${RAILWAY_SERVICE_ID:-}" = "46b518c4-fa59-459d-a28f-22d309d856a0" ]; then python -m app.workers.document_ingestion; else uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --timeout-graceful-shutdown 30; fi'

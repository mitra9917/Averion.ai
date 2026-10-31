FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    HF_HOME=/app/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/sentence-transformers \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-api.txt requirements-ml.txt ./
RUN python -m pip install --upgrade pip \
    && pip install -r requirements-ml.txt

COPY app ./app
COPY scripts/cache_embedding_model.py ./scripts/cache_embedding_model.py

RUN python scripts/cache_embedding_model.py \
    && useradd --uid 10001 --create-home averion \
    && mkdir -p /app/uploads /app/.cache/huggingface /app/.cache/sentence-transformers \
    && chown -R averion:averion /app

USER averion

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8000/health || exit 1

EXPOSE 8000

CMD ["sh", "-c", "if [ \"${AVERION_PROCESS:-api}\" = \"worker\" ]; then exec python -m app.workers.document_ingestion; else exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --timeout-graceful-shutdown 30; fi"]

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

COPY app ./app
COPY start.sh .

RUN mkdir -p /app/uploads \
    && chmod +x start.sh

EXPOSE 8000

# Start both web server and worker process
CMD ["./start.sh"]

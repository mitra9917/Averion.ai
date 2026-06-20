# Railway Memory Optimization Guide

## Problem
Railway deployment shows "Out of memory" error when running the API with document ingestion worker.

## Root Cause
The `sentence-transformers` library loads large ML models (embedding models) that consume significant memory. Running both the web server and worker process in a single container can exceed Railway's default memory limits.

## Solution

### 1. Memory Configuration Changes

#### a. Updated `apps/api/.env`
Added memory optimization settings:
```env
# Preload embedding model at startup (set to false to reduce memory usage)
EMBEDDING_MODEL_PRELOAD=false

# Batch size for embedding generation (reduce to lower memory usage)
EMBEDDING_BATCH_SIZE=16
```

#### b. Created `apps/api/railway.toml`
Configured Railway-specific memory limits:
```toml
[deploy.resources]
memoryLimit = "2Gi"
cpuLimit = "1"

[deploy.env]
PYTORCH_CUDA_ALLOC_CONF = "max_split_size_mb:128"
OMP_NUM_THREADS = "2"
MKL_NUM_THREADS = "2"
TOKENIZERS_PARALLELISM = "false"
```

#### c. Updated `apps/api/Dockerfile`
Added environment variables to reduce memory usage:
```dockerfile
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    TOKENIZERS_PARALLELISM=false
```

### 2. How It Works

- **EMBEDDING_MODEL_PRELOAD=false**: Model loads on first use instead of startup, reducing initial memory spike
- **EMBEDDING_BATCH_SIZE=16**: Processes fewer embeddings at once (reduced from 32)
- **memoryLimit=2Gi**: Allocates 2GB RAM to the Railway service
- **PYTORCH_CUDA_ALLOC_CONF**: Limits PyTorch memory allocation chunks
- **OMP_NUM_THREADS/MKL_NUM_THREADS**: Limits parallel processing threads
- **TOKENIZERS_PARALLELISM=false**: Disables tokenizer parallelism to reduce memory

### 3. Deployment Steps

1. **Commit changes**:
   ```bash
   git add apps/api/.env apps/api/railway.toml apps/api/Dockerfile
   git commit -m "fix: optimize Railway memory usage for ML models"
   git push
   ```

2. **Railway will automatically redeploy** with the new configuration

3. **Monitor deployment**:
   - Check Railway dashboard for successful deployment
   - Verify both web and worker processes are running
   - Check logs for any errors

### 4. Verification

After deployment, verify the worker is processing documents:

1. Upload a document via the web interface
2. Check document status - should change from "processing" to "ready"
3. Try asking questions about the document

### 5. Alternative Solutions (if still out of memory)

#### Option A: Upgrade Railway Plan
- Free tier: 512MB RAM
- Hobby tier: 8GB RAM
- Upgrade to get more memory

#### Option B: Use Smaller Embedding Model
In `apps/api/.env`, change to a smaller model:
```env
EMBEDDING_MODEL_NAME=sentence-transformers/paraphrase-MiniLM-L3-v2
```
This model is smaller but slightly less accurate.

#### Option C: Separate Worker Service
Deploy worker as a separate Railway service:
1. Create new Railway service
2. Use same codebase but only run worker
3. Share database between services

### 6. Monitoring

Check Railway logs for memory usage:
```bash
railway logs
```

Look for:
- ✅ "Starting document ingestion worker"
- ✅ "Processing document [id]"
- ❌ "Out of memory" or "Killed"

## Summary

These changes optimize memory usage by:
1. Lazy-loading ML models
2. Reducing batch sizes
3. Limiting thread parallelism
4. Increasing Railway memory allocation

The worker should not run alongside the web server in the same Railway service.
Use one Railway service for the FastAPI web server and a second Railway service
for `python -m app.workers.document_ingestion`. Running both processes in one
container can still exhaust memory during embedding generation.

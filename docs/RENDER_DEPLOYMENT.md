# Render Backend Deployment

This guide deploys the existing FastAPI backend as a Render Web Service. It does not change the RAG pipeline, API contract, authentication, or frontend code.

## 1. Prerequisites

- A GitHub repository containing this project.
- A Render account.
- Your existing Supabase project and production database URL.
- A Groq API key if `LLM_PROVIDER=groq` is used.
- The existing frontend deployment.

The backend is located in `apps/api`, uses Python 3.12, and exposes the FastAPI application as `app.main:app`.

## 2. Repository preparation

Railway configuration files were removed. The portable `Procfile`, `start.sh`, and Dockerfile remain; the Dockerfile no longer contains Railway service-selection logic.

Render can use its native Python runtime. No Docker configuration is required for the steps below.

## 3. Create the Render Web Service

1. In Render, select **New** > **Web Service** and connect the GitHub repository.
2. Select the branch you want to deploy.
3. Set **Root Directory** to `apps/api`.
4. Select the **Python** runtime.
5. Set the build command:

   ```text
   pip install -r requirements.txt
   ```

6. Set the start command:

   ```text
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

7. In **Environment**, add the variables listed below. Enter real values only in Render; never commit them.
8. Set the HTTP health-check path to `/health`.
9. Choose **Standard (2 GB RAM) or larger**. Render Free and Starter instances have 512 MB RAM, which is insufficient for reliable document embedding with this unchanged `sentence-transformers` stack. Do not enable embedding preload on a 512 MB instance.
10. Select **Create Web Service** and watch the deploy logs.

Render supplies `PORT`; do not define a fixed production port. The start command binds to `0.0.0.0` and uses that value.

## 4. Environment variables

Set these in **Render Dashboard > Service > Environment**. Values are intentionally omitted.

### Production values

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_JWT_SECRET
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
DOCUMENT_STORAGE_BACKEND
AUTH_REQUIRED
CORS_ORIGINS
LLM_PROVIDER
LLM_PROVIDER_API_KEY
LLM_MODEL_NAME
```

Recommended production configuration values are `DOCUMENT_STORAGE_BACKEND=supabase`, `AUTH_REQUIRED=true`, and `CORS_ORIGINS` set to the exact deployed frontend origin or origins.

For the current embedding stack, also set:

```text
EMBEDDING_MODEL_PRELOAD=false
EMBEDDING_BATCH_SIZE=8
```

This lets Uvicorn bind and pass `/health` before the embedding model is loaded. It does not make a 512 MB instance sufficient for reliable indexing; use a Standard (2 GB) or larger instance for the full RAG application.

### Optional overrides

Only add these when you need to override the defaults in `apps/api/app/core/config.py`:

```text
ALLOWED_EMAIL_DOMAINS
DEFAULT_ORGANIZATION_ID
MAX_DOCUMENT_SIZE_BYTES
EMBEDDING_MODEL_NAME
EMBEDDING_MODEL_PRELOAD
EMBEDDING_BATCH_SIZE
RETRIEVAL_TOP_K
RETRIEVAL_MIN_SCORE
LLM_PROVIDER_BASE_URL
LLM_PROVIDER_TIMEOUT_SECONDS
LLM_PROVIDER_MAX_RETRIES
LLM_TEMPERATURE
LLM_MAX_TOKENS
TRANSCRIPTION_PROVIDER
TRANSCRIPTION_PROVIDER_API_KEY
TRANSCRIPTION_PROVIDER_BASE_URL
TRANSCRIPTION_MODEL_NAME
TRANSCRIPTION_TIMEOUT_SECONDS
TRANSCRIPTION_MAX_RETRIES
```

If Supabase Storage is used, create the configured private bucket before deploying. Apply the repository migrations to the production Supabase database before using document upload.

## 5. Verify deployment

After Render provides its URL, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

Expected response:

```json
{"status":"ok","service":"averion-api","version":"0.1.0"}
```

`/health` only confirms that the FastAPI process responds. It does not contact the LLM, database, retrieval, or embedding model.

To test the existing API contract, sign in through the frontend and upload a supported document, then send a normal chat question. Do not use `/health` as a RAG test.

## 6. Connect the frontend

Do not change frontend code. In the frontend deployment provider, update the existing variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

Redeploy the frontend after changing this value. Also ensure the Render service's `CORS_ORIGINS` includes the exact frontend URL.

## 7. UptimeRobot

See [UPTIMEROBOT.md](UPTIMEROBOT.md) for the complete setup. Create an HTTP(s) monitor for:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

Use UptimeRobot's Free-plan five-minute interval. It monitors the service and can help reduce idle spin-downs, but it does not guarantee that a free Render service always stays warm.

## 8. Troubleshooting

| Symptom | Check |
| --- | --- |
| Build fails | Verify the root directory is `apps/api` and the build command is `pip install -r requirements.txt`. |
| `app.main:app` cannot be found | Confirm the root directory is `apps/api`; do not use the repository root. |
| Service fails to start | Confirm the start command exactly uses `--host 0.0.0.0 --port $PORT` and inspect Render logs. |
| Health check fails | Set the path to `/health`; do not use `/health/database` or `/health/ai` as the service health check. |
| Frontend cannot call the API | Update `NEXT_PUBLIC_API_BASE_URL`, redeploy the frontend, and set the exact frontend origin in `CORS_ORIGINS`. |
| Authentication or document upload fails | Verify the Supabase URL, JWT secret, service-role key, database URL, private bucket, and production migrations. |
| UptimeRobot reports DOWN | Open the same `/health` URL in a browser, then review Render logs and the monitor URL for a typo. |
| Python/dependency error | Render should use Python 3.12 from `apps/api/.python-version`; do not install development dependencies for the web service. |

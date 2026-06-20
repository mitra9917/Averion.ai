# Averion.ai Deployment Checklist

Use this checklist after the repo-side deployment config is merged to `main`.

## 1. Supabase

1. Create or choose the production Supabase project.
2. Run the ordered migrations from `supabase/migrations`.
3. Verify the schema:

```bash
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/verify_schema.sql
```

4. Create a private storage bucket named `documents`.
5. Copy these values for Railway and Vercel:
   - Project URL
   - anon public key
   - service role key
   - JWT secret
   - Postgres connection string with `sslmode=require`

## 2. Railway API Service

1. New Project -> Deploy from GitHub repo -> Averion.ai.
2. Set the service root directory to `apps/api`.
3. Railway should use `apps/api/railway.json` and `apps/api/Dockerfile`.
4. Add the API environment variables from `apps/api/.env.example`.
5. Use production values:
   - `AUTH_REQUIRED=true`
   - `DOCUMENT_STORAGE_BACKEND=supabase`
   - `CORS_ORIGINS=https://<your-vercel-domain>`
   - `LLM_PROVIDER=openai` or `groq`
   - `LLM_PROVIDER_API_KEY=<real-provider-key>`
   - `EMBEDDING_MODEL_PRELOAD=false`
   - `EMBEDDING_BATCH_SIZE=8`
6. Deploy and confirm:

```bash
curl https://<railway-api-domain>/health
curl https://<railway-api-domain>/health/database
curl https://<railway-api-domain>/health/ai
```

## 3. Railway Worker Service

Create a second Railway service from the same repo and root directory `apps/api`.

Use this start command:

```bash
python -m app.workers.document_ingestion
```

Copy the same backend environment variables as the API service. The worker does not need a public domain.

Do not run the worker inside the API service. The API service should only run:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

The worker service should be the only service running:

```bash
python -m app.workers.document_ingestion
```

If Railway shows "Out of memory", check that the API and worker are not running in the same service, keep `EMBEDDING_BATCH_SIZE=8`, and upgrade the worker memory before upgrading the API memory.

## 4. Vercel Web App

1. Import the GitHub repo in Vercel.
2. Set root directory to `apps/web`.
3. Vercel should use `apps/web/vercel.json`.
4. Add the web environment variables from `apps/web/.env.example`.
5. Set:
   - `NEXT_PUBLIC_API_BASE_URL=https://<railway-api-domain>`
   - `NEXT_PUBLIC_AUTH_REDIRECT_URL=https://<your-vercel-domain>/auth/callback`
6. Deploy.

## 5. Supabase Auth URLs

After Vercel gives you the frontend URL:

1. Supabase Dashboard -> Authentication -> URL Configuration.
2. Set Site URL to `https://<your-vercel-domain>`.
3. Add Redirect URL `https://<your-vercel-domain>/auth/callback`.
4. If Google OAuth is enabled, also update Google Cloud OAuth redirect URLs.

## 6. Final Smoke Test

1. Open the Vercel app.
2. Sign in.
3. Confirm `/account` loads your organization and role.
4. Upload a small PDF/TXT/DOCX.
5. Confirm the document moves to `ready`.
6. Ask a chat question that cites the uploaded document.
7. Confirm an owner can delete a document and deleted content is no longer used in chat.

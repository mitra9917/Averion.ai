# Render Free API + AWS ML workers + manual Vercel frontend

The public API remains https://averion-api.onrender.com. Render installs only
`requirements.txt` / `requirements-api.txt`: no Torch, Transformers, NumPy, or
model download. Existing routes, UI, prompts, citations, MiniLM model, vector
semantics, and organization filters stay the same.

## Execution flow

- Browser -> Vercel frontend -> Render API.
- Render invokes `averion-embeddings-prod` synchronously through the signed AWS
  Lambda API. There is no public inference URL and no custom AWS domain needed.
- Uploads go to the existing private Supabase bucket and PostgreSQL job queue.
  Render asynchronously wakes `averion-ingestion-prod`; a one-minute EventBridge
  schedule also checks the queue if a wake-up is missed or Render sleeps.
- The AWS worker uses the existing extraction, chunking, job leases/retries, and
  pgvector storage. It reads server credentials at runtime from encrypted SSM
  parameter `/averion/production/ingestion`. Credentials are not in the image.

## Render settings

Keep root directory `apps/api`, Python 3.12, free plan, and health path `/health`.
Build: `pip install -r requirements.txt`.
Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --timeout-graceful-shutdown 30`.
The previous build command that also runs `scripts/cache_embedding_model.py` is
compatible: that script skips caching when `EMBEDDING_PROVIDER=aws_lambda`.

Set server-only variables:

- `EMBEDDING_PROVIDER=aws_lambda`
- `EMBEDDING_AWS_REGION=ap-south-1`
- `EMBEDDING_AWS_FUNCTION_NAME=arn:aws:lambda:ap-south-1:856073125851:function:averion-embeddings-prod`
- `DOCUMENT_WORKER_AWS_FUNCTION_NAME=arn:aws:lambda:ap-south-1:856073125851:function:averion-ingestion-prod`
- `INLINE_DOCUMENT_INGESTION=false`
- `ENABLE_DOCUMENT_INGESTION_DAEMON=false`
- `EMBEDDING_MODEL_PRELOAD=false`
- `AUTH_REQUIRED=true`
- `DOCUMENT_STORAGE_BACKEND=supabase`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for `averion-render-invoke`.
  This identity may invoke only the two Averion functions. Never expose these
  credentials in browser variables, logs, or source control.
- Existing database, Supabase, JWT, LLM, storage, and allowed-domain settings.
  Groq's configured model must exist; the project's default is `openai/gpt-oss-20b`.
- `CORS_ORIGINS`: exact frontend origins, comma-separated.

Render Free still sleeps when idle, can restart, has shared usage limits, and
may restrict unusually high outbound traffic. The split removes ML memory from
Render; it does not remove the provider's free-plan limits.

## AWS deployment and recovery

`aws-build.json` defines the private ECR repository, short-lived source bucket,
CodeBuild image builder, and scoped build role. `aws-runtime.json` defines two
image-based Lambda functions, scoped execution roles, bounded log retention,
Render's invoke-only identity, and the ingestion schedule. Deploy in ap-south-1,
AWS account 856073125851. The local default CLI profile belongs to a different
account; verify identity before any CLI use. The deployment uses AWS MCP.

Both functions use the same image built with `Dockerfile.lambda` and cached
MiniLM weights. Lambda uses CPU inference and a read-only model cache. No
provisioned concurrency, paid Render worker, always-on AWS VM, NAT gateway, or
load balancer is required. AWS costs depend on traffic and job duration; a
US$50 monthly budget is an alert/monitoring target, not a hard billing cap.

The account currently permits ten concurrent Lambda executions. Job claims use
PostgreSQL locking so concurrent workers do not claim the same document. A
Lambda invocation has a 15-minute limit; validate large documents against this
limit. Timed-out jobs recover using existing leases and retry limits.

For updates, build an immutable ECR image tag, validate it, then update the
runtime stack's ImageUri. Retain the previous healthy tag for rollback. Use the
existing Supabase backup strategy; AWS images/logs are not database backups.
Rotate Render invoke keys by issuing a second key, updating Render, verifying,
then revoking the old key. After rotating SSM secrets, recycle the ingestion
function execution environments so its cached configuration reloads.

## Manual Vercel deployment

Use the existing project or import the repository with root directory `apps/web`,
Node.js 22, install `npm ci`, and build `npm run build`. Set:

- `NEXT_PUBLIC_API_BASE_URL=https://averion-api.onrender.com`
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: your existing
  Supabase project's public browser values. Never use its service-role key.
- `NEXT_PUBLIC_SITE_URL=https://YOUR-FRONTEND.vercel.app`
- `NEXT_PUBLIC_AUTH_REDIRECT_URL=https://YOUR-FRONTEND.vercel.app/auth/callback`
- Preserve existing allowed-email-domain settings, if any.

Add the exact frontend origin to Render's CORS_ORIGINS and allow its callback
in Supabase Auth URL configuration. Verify configured OAuth providers as well
as email/password login. Vercel Hobby eligibility and limits still apply.

## Live verification

Use a dedicated test workspace owner's access token in the process environment:

```sh
python deploy/verify.py https://averion-api.onrender.com --origin https://YOUR-FRONTEND.vercel.app
```

Set `AVERION_VERIFY_TOKEN` before running this command. The check verifies API,
database and ML readiness, anonymous rejection, CORS, upload -> ready -> actual
cited LLM response -> conversation history -> feedback. It removes only its own
document and conversation afterward, and never logs the access token.

For local CPU inference, install `requirements-ml.txt`. For the lightweight
Render runtime, install `requirements.txt` and configure the AWS provider.

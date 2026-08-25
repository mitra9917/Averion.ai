# Averion.ai Deployment Guide

## Table of Contents
1. [Deployment Architecture Options](#deployment-architecture-options)
2. [Recommended Setup](#recommended-setup)
3. [Step-by-Step Deployment](#step-by-step-deployment)
4. [Environment Configuration](#environment-configuration)
5. [CI/CD Setup](#cicd-setup)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Cost Estimates](#cost-estimates)

---

## Deployment Architecture Options

### Option 1: Vercel + Railway (⭐ Recommended for MVP/Small-Medium Scale)

**Best for**: Quick deployment, automatic scaling, minimal DevOps overhead

#### Architecture
```
┌─────────────────┐
│   Cloudflare    │ (Optional CDN)
└────────┬────────┘
         │
    ┌────▼─────┐
    │  Vercel  │ ← Next.js Frontend
    └────┬─────┘
         │
    ┌────▼─────────┐
    │   Railway    │ ← FastAPI Backend
    └────┬─────────┘
         │
    ┌────▼─────────┐
    │   Supabase   │ ← PostgreSQL + pgvector
    └──────────────┘
```

**Components**:
- **Frontend**: Vercel (Next.js optimized, edge functions, automatic SSL)
- **Backend**: Railway (Python/FastAPI, handles ML models, persistent storage)
- **Database**: Supabase (managed PostgreSQL with pgvector)

**Pros**:
- ✅ Zero-config deployments with Git integration
- ✅ Automatic HTTPS/SSL certificates
- ✅ Built-in CI/CD pipelines
- ✅ Generous free tiers for testing
- ✅ Excellent developer experience
- ✅ Handles ML model memory requirements (Railway: up to 8GB RAM)
- ✅ Automatic scaling on Vercel

**Cons**:
- ❌ Railway pricing can increase with scale
- ❌ Less control over infrastructure
- ❌ Vendor lock-in considerations

**Cost Estimate** (Monthly):
- Vercel: $0 (Hobby) - $20 (Pro)
- Railway: $5-20 (Starter) - $50+ (scaling)
- Supabase: $0 (Free) - $25 (Pro)
- **Total**: $5-95/month depending on usage

---

### Option 2: AWS (ECS/Fargate + RDS) (For Enterprise/High Scale)

**Best for**: Large scale, full control, enterprise requirements

#### Architecture
```
┌──────────────┐
│ CloudFront   │ ← CDN
└──────┬───────┘
       │
┌──────▼───────┐
│  ALB/Route53 │ ← Load Balancer
└──────┬───────┘
       │
   ┌───▼────────────────┐
   │   ECS/Fargate      │
   │  ┌──────────────┐  │
   │  │ Next.js      │  │ ← Frontend Container
   │  └──────────────┘  │
   │  ┌──────────────┐  │
   │  │ FastAPI      │  │ ← Backend Container
   │  └──────────────┘  │
   └───┬────────────────┘
       │
   ┌───▼────────────┐
   │  RDS Postgres  │ ← Database with pgvector
   │  + pgvector    │
   └────────────────┘
```

**Components**:
- **Frontend**: ECS Fargate (containerized Next.js)
- **Backend**: ECS Fargate (containerized FastAPI)
- **Database**: RDS PostgreSQL with pgvector extension
- **Storage**: S3 for document uploads
- **CDN**: CloudFront

**Pros**:
- ✅ Full infrastructure control
- ✅ Enterprise-grade security and compliance
- ✅ Unlimited scaling potential
- ✅ VPC isolation and advanced networking
- ✅ Comprehensive monitoring (CloudWatch)

**Cons**:
- ❌ Complex setup and maintenance
- ❌ Requires DevOps expertise
- ❌ Higher baseline costs
- ❌ Longer deployment time

**Cost Estimate** (Monthly):
- ECS Fargate: $30-100
- RDS PostgreSQL: $50-200
- S3 + CloudFront: $10-50
- ALB: $20
- **Total**: $110-370/month minimum

---

### Option 3: Google Cloud Platform (Cloud Run + Cloud SQL)

**Best for**: Serverless scaling, pay-per-use model

#### Architecture
```
┌──────────────┐
│  Cloud CDN   │
└──────┬───────┘
       │
┌──────▼───────────┐
│  Cloud Run       │
│  ┌────────────┐  │
│  │ Next.js    │  │ ← Frontend Service
│  └────────────┘  │
│  ┌────────────┐  │
│  │ FastAPI    │  │ ← Backend Service
│  └────────────┘  │
└──────┬───────────┘
       │
┌──────▼───────────┐
│  Cloud SQL       │ ← PostgreSQL + pgvector
│  (PostgreSQL)    │
└──────────────────┘
```

**Pros**:
- ✅ True serverless (scale to zero)
- ✅ Pay only for actual usage
- ✅ Automatic SSL and custom domains
- ✅ Good for variable traffic patterns

**Cons**:
- ❌ Cold start latency for ML models
- ❌ Complex pricing model
- ❌ Learning curve for GCP services

**Cost Estimate** (Monthly):
- Cloud Run: $10-50 (usage-based)
- Cloud SQL: $40-150
- Cloud Storage: $5-20
- **Total**: $55-220/month

---

### Option 4: DigitalOcean App Platform (Budget-Friendly)

**Best for**: Startups, cost-conscious deployments

#### Architecture
```
┌──────────────────┐
│  App Platform    │
│  ┌────────────┐  │
│  │ Next.js    │  │ ← Frontend App
│  └────────────┘  │
│  ┌────────────┐  │
│  │ FastAPI    │  │ ← Backend App
│  └────────────┘  │
└──────┬───────────┘
       │
┌──────▼───────────┐
│  Managed DB      │ ← PostgreSQL + pgvector
│  (PostgreSQL)    │
└──────────────────┘
```

**Pros**:
- ✅ Simple pricing ($5-12/app)
- ✅ Easy to understand and manage
- ✅ Good documentation
- ✅ Managed PostgreSQL with pgvector support

**Cons**:
- ❌ Limited scaling options
- ❌ Fewer advanced features
- ❌ May struggle with large ML models

**Cost Estimate** (Monthly):
- App Platform (2 apps): $24
- Managed PostgreSQL: $15-50
- **Total**: $39-74/month

---

## Recommended Setup (Vercel + Railway)

This is the **optimal choice** for Averion.ai because:

1. **ML Model Support**: Railway handles the ~500MB sentence-transformers model efficiently
2. **Developer Experience**: Git-based deployments, automatic builds
3. **Cost-Effective**: Start free, scale as needed
4. **Production-Ready**: Both platforms are battle-tested
5. **Minimal DevOps**: Focus on features, not infrastructure

---

## Step-by-Step Deployment

### Phase 1: Supabase Setup (Database)

#### 1.1 Create Production Supabase Project

```bash
# Go to https://supabase.com
# Click "New Project"
# Project Name: averion-ai-prod
# Database Password: [Generate strong password]
# Region: [Choose closest to your users]
```

#### 1.2 Apply Database Schema

```bash
supabase link --project-ref <project-ref>
supabase db push

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 \
  --file supabase/tests/verify_schema.sql
```

#### 1.3 Get Connection Details

```bash
# From Supabase Dashboard -> Project Settings -> Database
# Copy these values:
# - Connection String (URI)
# - Host
# - Database name
# - Port
# - User
# - Password

# From Supabase Dashboard -> Project Settings -> API
# Copy these values:
# - Project URL
# - anon public key
# - JWT Secret
```

---

### Phase 2: Backend Deployment (Railway)

#### 2.1 Create Railway Account

```bash
# Go to https://railway.app
# Sign up with GitHub
# Connect your repository
```

#### 2.2 Create New Project

```bash
# Click "New Project"
# Select "Deploy from GitHub repo"
# Choose: Averion.ai repository
# Root Directory: apps/api
```

#### 2.3 Configure Build Settings

Railway will auto-detect Python. Verify these settings:

```yaml
# Railway will use:
# Build Command: pip install -r requirements.txt
# Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Create a second Railway service from the same `apps/api` root for asynchronous
document ingestion:

```yaml
# Worker Start Command:
# python -m app.workers.document_ingestion
```

The API and worker must use the same Supabase and `DATABASE_URL` variables.
Do not expose a public domain for the worker service.

Create `railway.json` in `apps/api/`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pip install -r requirements.txt"
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### 2.4 Set Environment Variables

In Railway Dashboard -> Variables:

```bash
# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001

# Supabase
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_JWT_SECRET=[your-jwt-secret]

# Authentication
ALLOWED_EMAIL_DOMAINS=
AUTH_REQUIRED=true

# File Upload
DOCUMENT_STORAGE_BACKEND=supabase
SUPABASE_SERVICE_ROLE_KEY=[server-only-service-role-key]
SUPABASE_STORAGE_BUCKET=documents
MAX_DOCUMENT_SIZE_BYTES=104857600

# CORS (will update after frontend deployment)
CORS_ORIGINS=https://your-frontend-domain.vercel.app

# Embeddings
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_BATCH_SIZE=32

# Document ingestion worker
DOCUMENT_JOB_MAX_ATTEMPTS=3
DOCUMENT_JOB_RETRY_DELAY_SECONDS=30
DOCUMENT_JOB_LEASE_SECONDS=900
DOCUMENT_WORKER_POLL_SECONDS=2
DOCUMENT_MAX_CHUNKS=2000

# Retrieval
RETRIEVAL_TOP_K=5
RETRIEVAL_MIN_SCORE=0.7

# LLM Configuration
LLM_PROVIDER=groq
LLM_PROVIDER_API_KEY=[your-groq-api-key]
LLM_MODEL_NAME=openai/gpt-oss-120b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=1000

# Railway provides PORT automatically
```

#### 2.5 Configure Resources

```bash
# In Railway Dashboard -> Settings
# Memory: 2GB (minimum for ML models)
# CPU: 2 vCPU
# Enable: Persistent Storage (for uploads)
# Volume Mount: /app/uploads
```

#### 2.6 Deploy

```bash
# Railway will automatically deploy on push to main
# Or click "Deploy" in Railway Dashboard
# Wait for build to complete (~5-10 minutes first time)
```

#### 2.7 Get Backend URL

```bash
# From Railway Dashboard -> Settings -> Domains
# Copy the generated URL: https://[project-name].up.railway.app
# Or add custom domain
```

---

### Phase 3: Frontend Deployment (Vercel)

#### 3.1 Create Vercel Account

```bash
# Go to https://vercel.com
# Sign up with GitHub
# Import your repository
```

#### 3.2 Configure Project

```bash
# Framework Preset: Next.js
# Root Directory: apps/web
# Build Command: npm run build
# Output Directory: .next
# Install Command: npm install
```

#### 3.3 Set Environment Variables

In Vercel Dashboard -> Settings -> Environment Variables:

```bash
# API Backend
NEXT_PUBLIC_API_BASE_URL=https://[your-railway-app].up.railway.app

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]

# Auth Redirect (update after deployment)
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://[your-vercel-domain].vercel.app/auth/callback

# Email Domains (optional)
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=
```

#### 3.4 Deploy

```bash
# Vercel will automatically deploy
# Or click "Deploy" in Vercel Dashboard
# Wait for build to complete (~2-3 minutes)
```

#### 3.5 Update CORS in Backend

```bash
# Go back to Railway Dashboard
# Update CORS_ORIGINS environment variable:
CORS_ORIGINS=https://[your-vercel-domain].vercel.app,https://[custom-domain].com

# Redeploy backend
```

#### 3.6 Configure Custom Domain (Optional)

```bash
# In Vercel Dashboard -> Settings -> Domains
# Add your custom domain
# Update DNS records as instructed
# Update NEXT_PUBLIC_AUTH_REDIRECT_URL
```

---

### Phase 4: Supabase Auth Configuration

#### 4.1 Configure Auth Providers

```bash
# In Supabase Dashboard -> Authentication -> Providers

# Email Provider:
# - Enable Email provider
# - Confirm email: Enabled
# - Secure email change: Enabled

# Google OAuth (optional):
# - Enable Google provider
# - Add OAuth credentials from Google Cloud Console
# - Authorized redirect URIs: https://[project-id].supabase.co/auth/v1/callback
```

#### 4.2 Configure Site URL

```bash
# In Supabase Dashboard -> Authentication -> URL Configuration
# Site URL: https://[your-vercel-domain].vercel.app
# Redirect URLs: 
#   - https://[your-vercel-domain].vercel.app/auth/callback
#   - https://[your-vercel-domain].vercel.app/**
```

---

## Environment Configuration

### Production Environment Variables Checklist

#### Backend (Railway)
- [ ] `DATABASE_URL` - Supabase connection string
- [ ] `DEFAULT_ORGANIZATION_ID` - UUID for default org
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_JWT_SECRET` - JWT secret from Supabase
- [ ] `ALLOWED_EMAIL_DOMAINS` - Comma-separated domains (optional)
- [ ] `AUTH_REQUIRED=true` - Enable authentication
- [ ] `DOCUMENT_STORAGE_BACKEND=supabase`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - server-only private bucket access
- [ ] `SUPABASE_STORAGE_BUCKET=documents`
- [ ] `MAX_DOCUMENT_SIZE_BYTES=104857600`
- [ ] `CORS_ORIGINS` - Frontend domain(s)
- [ ] `EMBEDDING_MODEL_NAME` - sentence-transformers model
- [ ] `RETRIEVAL_TOP_K=5` - Number of chunks to retrieve
- [ ] `RETRIEVAL_MIN_SCORE=0.7` - Similarity threshold
- [ ] `LLM_PROVIDER` - groq or openai
- [ ] `LLM_PROVIDER_API_KEY` - API key for LLM provider
- [ ] `LLM_MODEL_NAME` - Model name
- [ ] `LLM_TEMPERATURE=0.2` - Response randomness
- [ ] `LLM_MAX_TOKENS=1000` - Max response length

#### Frontend (Vercel)
- [ ] `NEXT_PUBLIC_API_BASE_URL` - Railway backend URL
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- [ ] `NEXT_PUBLIC_AUTH_REDIRECT_URL` - Auth callback URL
- [ ] `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` - Domain restrictions (optional)

---

## CI/CD Setup

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        working-directory: apps/api
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install -r requirements-dev.txt
      
      - name: Run tests
        working-directory: apps/api
        run: pytest tests/ -v
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          LLM_PROVIDER: mock

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install dependencies
        working-directory: apps/web
        run: npm ci
      
      - name: Type check
        working-directory: apps/web
        run: npm run typecheck
      
      - name: Lint
        working-directory: apps/web
        run: npm run lint
      
      - name: Build
        working-directory: apps/web
        run: npm run build
        env:
          NEXT_PUBLIC_API_BASE_URL: https://api.example.com
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-key

  deploy:
    needs: [test-backend, test-frontend]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy notification
        run: |
          echo "Tests passed! Railway and Vercel will auto-deploy."
          # Add Slack/Discord notification here if needed
```

### Automatic Deployments

Both Railway and Vercel support automatic deployments:

```bash
# Railway: Deploys on push to main branch
# Vercel: Deploys on push to main branch

# Preview deployments:
# - Railway: Create preview environment for PRs
# - Vercel: Automatic preview URLs for every PR
```

---

## Monitoring & Maintenance

### 1. Application Monitoring

#### Railway Monitoring
```bash
# Built-in metrics:
# - CPU usage
# - Memory usage
# - Network traffic
# - Request logs

# Access: Railway Dashboard -> Metrics
```

#### Vercel Analytics
```bash
# Enable Vercel Analytics:
# - Real User Monitoring (RUM)
# - Web Vitals
# - Page views
# - API route performance

# Access: Vercel Dashboard -> Analytics
```

### 2. Database Monitoring

#### Supabase Dashboard
```bash
# Monitor:
# - Database size
# - Connection count
# - Query performance
# - Table statistics

# Access: Supabase Dashboard -> Database -> Statistics
```

### 3. Error Tracking

#### Recommended: Sentry

```bash
# Install Sentry
npm install @sentry/nextjs  # Frontend
pip install sentry-sdk[fastapi]  # Backend

# Configure in apps/web/sentry.client.config.js
# Configure in apps/api/app/main.py
```

### 4. Logging

#### Backend Logging (Railway)
```python
# apps/api/app/main.py
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# View logs: Railway Dashboard -> Logs
```

#### Frontend Logging (Vercel)
```bash
# View logs: Vercel Dashboard -> Logs
# Real-time logs: vercel logs [deployment-url]
```

### 5. Health Checks

```bash
# Backend health endpoint
GET https://[railway-url]/health

# Database health endpoint
GET https://[railway-url]/health/database

# Set up uptime monitoring:
# - UptimeRobot (free)
# - Pingdom
# - Better Uptime
```

### 6. Backup Strategy

#### Database Backups (Supabase)
```bash
# Supabase Pro plan includes:
# - Daily automated backups (7 days retention)
# - Point-in-time recovery

# Manual backup:
# Supabase Dashboard -> Database -> Backups -> Create backup
```

#### Document Storage Backups
```bash
# Railway persistent volumes are backed up
# Consider additional S3 backup for critical documents

# Implement backup script:
# - Daily cron job to sync uploads to S3
# - Retention policy: 30 days
```

---

## Security Hardening

### 1. Environment Variables

```bash
# ✅ DO:
# - Use strong, unique secrets
# - Rotate API keys quarterly
# - Use different keys for dev/staging/prod
# - Store secrets in platform secret managers

# ❌ DON'T:
# - Commit secrets to Git
# - Share secrets in plain text
# - Use default/example values in production
```

### 2. Authentication

```bash
# Enable in production:
AUTH_REQUIRED=true

# Configure Supabase:
# - Enable email confirmation
# - Set password requirements
# - Enable MFA (optional)
# - Configure session timeout
```

### 3. CORS Configuration

```bash
# Restrict CORS to your domains only:
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Don't use wildcards (*) in production
```

### 4. Rate Limiting

Add rate limiting to FastAPI:

```python
# apps/api/app/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/chat")
@limiter.limit("10/minute")
async def chat_endpoint(request: Request):
    # Your code here
    pass
```

### 5. Database Security

```bash
# Supabase security:
# - Enable Row Level Security (RLS)
# - Use prepared statements (psycopg does this)
# - Limit connection pool size
# - Enable SSL connections

# In DATABASE_URL, ensure SSL:
DATABASE_URL=postgresql://...?sslmode=require
```

### 6. Content Security Policy

Add CSP headers in Next.js:

```typescript
// apps/web/next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};
```

---

## Cost Estimates

### Startup/MVP (0-1000 users)

**Vercel + Railway + Supabase**

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Vercel | Hobby | $0 |
| Railway | Starter (2GB RAM) | $10 |
| Supabase | Free | $0 |
| Groq API | Pay-as-you-go | $5-20 |
| **Total** | | **$15-30** |

### Small Business (1000-10,000 users)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Vercel | Pro | $20 |
| Railway | Pro (4GB RAM) | $30 |
| Supabase | Pro | $25 |
| Groq API | Pay-as-you-go | $50-100 |
| Monitoring (Sentry) | Team | $26 |
| **Total** | | **$151-201** |

### Medium Business (10,000-100,000 users)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Vercel | Pro | $20 |
| Railway | Pro (8GB RAM, scaled) | $100 |
| Supabase | Pro | $25 |
| Groq API | Pay-as-you-go | $200-500 |
| Monitoring (Sentry) | Business | $80 |
| CDN (Cloudflare) | Pro | $20 |
| **Total** | | **$445-745** |

### Enterprise (100,000+ users)

Consider migrating to AWS/GCP for better economics at scale:

| Service | Monthly Cost |
|---------|--------------|
| AWS ECS/Fargate | $200-500 |
| AWS RDS PostgreSQL | $300-800 |
| AWS S3 + CloudFront | $100-300 |
| OpenAI API | $1000-5000 |
| Monitoring & Logging | $200-500 |
| **Total** | **$1800-7100** |

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing locally
- [ ] Environment variables documented
- [ ] Database migrations tested
- [ ] API keys obtained (Groq/OpenAI, Supabase)
- [ ] Custom domain purchased (optional)

### Supabase Setup
- [ ] Production project created
- [ ] Database schema applied
- [ ] pgvector extension enabled
- [ ] Connection string obtained
- [ ] Auth providers configured
- [ ] Site URL configured

### Backend Deployment (Railway)
- [ ] Repository connected
- [ ] Build settings configured
- [ ] Environment variables set
- [ ] Private Supabase `documents` bucket and storage policies configured
- [ ] Memory allocation set (2GB minimum)
- [ ] Health check endpoint verified
- [ ] Deployment successful

### Frontend Deployment (Vercel)
- [ ] Repository connected
- [ ] Build settings configured
- [ ] Environment variables set
- [ ] Backend URL configured
- [ ] Auth redirect URL configured
- [ ] Deployment successful
- [ ] Custom domain configured (optional)

### Post-Deployment
- [ ] CORS updated in backend
- [ ] Health checks passing
- [ ] Authentication flow tested
- [ ] Document upload tested
- [ ] Chat functionality tested
- [ ] Monitoring configured
- [ ] Backup strategy implemented
- [ ] SSL certificates verified
- [ ] Performance tested

### Security
- [ ] AUTH_REQUIRED=true in production
- [ ] Strong secrets generated
- [ ] CORS restricted to production domains
- [ ] Rate limiting enabled
- [ ] Database SSL enabled
- [ ] Security headers configured
- [ ] Error tracking configured

---

## Troubleshooting

### Common Issues

#### 1. Backend Won't Start
```bash
# Check Railway logs
# Common causes:
# - Missing environment variables
# - Database connection failed
# - ML model download timeout

# Solution:
# - Verify all env vars are set
# - Check DATABASE_URL format
# - Increase memory allocation to 2GB+
```

#### 2. Frontend Can't Connect to Backend
```bash
# Check:
# - NEXT_PUBLIC_API_BASE_URL is correct
# - CORS_ORIGINS includes frontend domain
# - Backend is running (check Railway status)

# Test backend directly:
curl https://[railway-url]/health
```

#### 3. Authentication Errors
```bash
# Check:
# - SUPABASE_URL matches in both apps
# - SUPABASE_JWT_SECRET is correct
# - Auth redirect URL is configured in Supabase
# - Site URL is set in Supabase

# Test:
# - Try signup with new email
# - Check Supabase Auth logs
```

#### 4. Slow Response Times
```bash
# Causes:
# - ML model loading on cold start
# - Database query performance
# - LLM API latency

# Solutions:
# - Keep Railway instance warm (health check pings)
# - Optimize database queries
# - Implement caching
# - Use faster LLM models
```

#### 5. Out of Memory Errors
```bash
# Symptoms:
# - Backend crashes during embedding generation
# - Railway shows OOM errors

# Solutions:
# - Increase Railway memory to 4GB
# - Implement batch processing for large documents
# - Use smaller embedding models
# - Add memory monitoring
```

---

## Next Steps

After successful deployment:

1. **Monitor Performance**
   - Set up uptime monitoring
   - Configure error tracking
   - Review logs regularly

2. **Optimize Costs**
   - Monitor usage patterns
   - Adjust resource allocation
   - Implement caching where beneficial

3. **Scale Gradually**
   - Start with free/starter tiers
   - Upgrade as user base grows
   - Consider migration to AWS/GCP at 100k+ users

4. **Enhance Security**
   - Regular security audits
   - Penetration testing
   - Compliance certifications (if needed)

5. **Improve Features**
   - Gather user feedback
   - Implement analytics
   - Add new document formats
   - Enhance AI capabilities

---

## Support Resources

- **Railway**: https://docs.railway.app
- **Vercel**: https://vercel.com/docs
- **Supabase**: https://supabase.com/docs
- **FastAPI**: https://fastapi.tiangolo.com
- **Next.js**: https://nextjs.org/docs

---

**Last Updated**: 2026-06-15
**Version**: 1.0

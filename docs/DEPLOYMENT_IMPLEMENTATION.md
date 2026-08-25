# Deployment Implementation Guide

This document contains all the configuration files and step-by-step instructions to deploy Averion.ai using Vercel + Railway.

## Quick Start Summary

1. **Supabase**: Set up production database
2. **Railway**: Deploy FastAPI backend
3. **Vercel**: Deploy Next.js frontend
4. **Configure**: Set environment variables
5. **Test**: Verify deployment

---

## Configuration Files to Create

### 1. Railway Configuration

**File**: `apps/api/railway.json`

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

**Purpose**: Configures Railway build and deployment settings for the FastAPI backend.

---

### 2. Railway Procfile (Alternative)

**File**: `apps/api/Procfile`

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Purpose**: Alternative way to specify the start command for Railway.

---

### 3. GitHub Actions CI/CD Workflow

**File**: `.github/workflows/deploy.yml`

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
      
      - name: Cache Python dependencies
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('apps/api/requirements.txt') }}
          restore-keys: |
            ${{ runner.os }}-pip-
      
      - name: Install dependencies
        working-directory: apps/api
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install -r requirements-dev.txt
      
      - name: Run tests
        working-directory: apps/api
        run: pytest tests/ -v --tb=short
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          LLM_PROVIDER: mock
          AUTH_REQUIRED: false
          DEFAULT_ORGANIZATION_ID: 00000000-0000-0000-0000-000000000001

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: apps/web/package-lock.json
      
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
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-key-for-build
          NEXT_PUBLIC_AUTH_REDIRECT_URL: https://example.com/auth/callback

  deploy-notification:
    needs: [test-backend, test-frontend]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Deployment Success
        run: |
          echo "✅ All tests passed!"
          echo "🚀 Railway and Vercel will auto-deploy from main branch"
          echo "📊 Check deployment status:"
          echo "   - Railway: https://railway.app"
          echo "   - Vercel: https://vercel.com"
```

**Purpose**: Automated testing on every push and pull request. Ensures code quality before deployment.

---

### 4. Vercel Configuration

**File**: `apps/web/vercel.json`

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": ".next",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_API_BASE_URL": "@api-base-url",
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key",
    "NEXT_PUBLIC_AUTH_REDIRECT_URL": "@auth-redirect-url"
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    }
  ]
}
```

**Purpose**: Configures Vercel deployment settings and security headers.

---

### 5. Docker Configuration (Optional - for local testing)

**File**: `apps/api/Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**File**: `apps/web/Dockerfile`

```dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTH_REDIRECT_URL

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_AUTH_REDIRECT_URL=$NEXT_PUBLIC_AUTH_REDIRECT_URL

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
```

**File**: `docker-compose.yml` (root directory)

```yaml
version: '3.8'

services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
      - AUTH_REQUIRED=true
      - CORS_ORIGINS=http://localhost:3000
      - LLM_PROVIDER=${LLM_PROVIDER}
      - LLM_PROVIDER_API_KEY=${LLM_PROVIDER_API_KEY}
    volumes:
      - ./apps/api/uploads:/app/uploads
    restart: unless-stopped

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
        - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
        - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
        - NEXT_PUBLIC_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
    ports:
      - "3000:3000"
    depends_on:
      - api
    restart: unless-stopped
```

**Purpose**: Docker configurations for containerized deployment (useful for testing production builds locally).

---

## Step-by-Step Deployment Instructions

### Phase 1: Supabase Setup (15 minutes)

#### Step 1.1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create account
3. Click **"New Project"**
4. Fill in details:
   - **Name**: `averion-ai-prod`
   - **Database Password**: Generate strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Start with Free tier
5. Click **"Create new project"**
6. Wait 2-3 minutes for provisioning

#### Step 1.2: Enable pgvector Extension

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Run this SQL:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

4. Click **"Run"**
5. You should see the vector extension listed

#### Step 1.3: Apply Database Schema

Apply the ordered migration chain and verify it:

```bash
supabase link --project-ref <project-ref>
supabase db push

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 \
  --file supabase/tests/verify_schema.sql
```

For an existing database, follow the backup and consistency checks in
`supabase/README.md`. The private-workspace conversion under
`supabase/legacy/` is optional and never runs automatically.

#### Step 1.4: Get Connection Details

1. Go to **Project Settings** → **Database**
2. Copy these values (save them securely):
   - **Connection String (URI)**: `postgresql://postgres:[password]@[host]:5432/postgres`
   - Note: Replace `[password]` with your actual password

3. Go to **Project Settings** → **API**
4. Copy these values:
   - **Project URL**: `https://[project-id].supabase.co`
   - **anon public key**: `eyJ...` (long JWT token)
   - **service_role key**: `eyJ...` (keep this secret!)

5. Go to **Project Settings** → **API** → **JWT Settings**
6. Copy:
   - **JWT Secret**: Used for token verification

#### Step 1.5: Configure Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider:
   - ✅ Enable Email provider
   - ✅ Confirm email
   - ✅ Secure email change
3. (Optional) Enable **Google** OAuth:
   - Get credentials from Google Cloud Console
   - Add OAuth client ID and secret

4. Go to **Authentication** → **URL Configuration**
5. Set:
   - **Site URL**: `https://[your-domain].vercel.app` (update after Vercel deployment)
   - **Redirect URLs**: Add `https://[your-domain].vercel.app/**`

---

### Phase 2: Railway Backend Deployment (20 minutes)

#### Step 2.1: Create Railway Account

1. Go to [https://railway.app](https://railway.app)
2. Click **"Login"** → **"Login with GitHub"**
3. Authorize Railway to access your repositories

#### Step 2.2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your **Averion.ai** repository
4. Railway will detect it's a monorepo

#### Step 2.3: Configure Service

1. Click **"Add variables"** or go to **Variables** tab
2. Set **Root Directory**: `apps/api`
3. Railway will auto-detect Python and requirements.txt
4. Create a second service from the same repository and root directory
5. Use `python -m app.workers.document_ingestion` as the second service's
   start command
6. Copy the same backend environment variables to the worker service; the
   worker does not need a public domain

#### Step 2.4: Set Environment Variables

Click **"Variables"** and add these one by one:

```bash
# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres?sslmode=require
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

# CORS (update after Vercel deployment)
CORS_ORIGINS=http://localhost:3000

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
LLM_MODEL_NAME=openai/gpt-oss-20b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=1000
```

**Note**: Get Groq API key from [https://console.groq.com](https://console.groq.com)

#### Step 2.5: Configure Resources

1. Go to **Settings** tab
2. Under **Resources**:
   - **Memory**: Set to **2048 MB** (2GB minimum for ML models)
   - **CPU**: 2 vCPU (default is fine)
3. Under **Volumes**:
   - Click **"Add Volume"**
   - **Mount Path**: `/app/uploads`
   - **Size**: 1GB (or more if needed)

#### Step 2.6: Deploy

1. Railway will automatically start deploying
2. Watch the **Deployments** tab for progress
3. First deployment takes 5-10 minutes (downloading ML models)
4. Wait for status: **"Success"** ✅

#### Step 2.7: Get Backend URL

1. Go to **Settings** → **Domains**
2. Railway generates a URL like: `https://[project-name].up.railway.app`
3. Copy this URL (you'll need it for Vercel)
4. (Optional) Add custom domain:
   - Click **"Add Domain"**
   - Enter your domain: `api.yourdomain.com`
   - Update DNS records as instructed

#### Step 2.8: Test Backend

```bash
# Test health endpoint
curl https://[your-railway-url].up.railway.app/health

# Expected response:
{
  "status": "ok",
  "service": "averion-api",
  "version": "0.1.0"
}

# Test database connection
curl https://[your-railway-url].up.railway.app/health/database

# Expected response:
{
  "status": "ok",
  "database": "postgres",
  "connected": true,
  "error": null
}
```

---

### Phase 3: Vercel Frontend Deployment (15 minutes)

#### Step 3.1: Create Vercel Account

1. Go to [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"** → **"Continue with GitHub"**
3. Authorize Vercel

#### Step 3.2: Import Project

1. Click **"Add New..."** → **"Project"**
2. Find your **Averion.ai** repository
3. Click **"Import"**

#### Step 3.3: Configure Build Settings

1. **Framework Preset**: Next.js (auto-detected)
2. **Root Directory**: `apps/web`
3. **Build Command**: `npm run build` (default)
4. **Output Directory**: `.next` (default)
5. **Install Command**: `npm install` (default)

#### Step 3.4: Set Environment Variables

Click **"Environment Variables"** and add:

```bash
# API Backend (use your Railway URL)
NEXT_PUBLIC_API_BASE_URL=https://[your-railway-url].up.railway.app

# Supabase (from Phase 1)
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]

# Auth Redirect (will update after deployment)
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://[your-vercel-domain].vercel.app/auth/callback

# Email Domains (optional)
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=
```

**Important**: For `NEXT_PUBLIC_AUTH_REDIRECT_URL`, use the Vercel domain you'll get after deployment. You can update this later.

#### Step 3.5: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes for build
3. Vercel will show deployment status
4. Wait for: **"Ready"** ✅

#### Step 3.6: Get Frontend URL

1. Vercel assigns a URL like: `https://[project-name].vercel.app`
2. Copy this URL
3. (Optional) Add custom domain:
   - Go to **Settings** → **Domains**
   - Click **"Add"**
   - Enter your domain: `yourdomain.com`
   - Update DNS records as instructed

#### Step 3.7: Update Environment Variables

Now that you have the Vercel URL, update:

1. **In Vercel**:
   - Go to **Settings** → **Environment Variables**
   - Update `NEXT_PUBLIC_AUTH_REDIRECT_URL`:
     ```
     https://[your-vercel-domain].vercel.app/auth/callback
     ```
   - Click **"Save"**
   - Redeploy: **Deployments** → **...** → **"Redeploy"**

2. **In Railway**:
   - Go to **Variables**
   - Update `CORS_ORIGINS`:
     ```
     https://[your-vercel-domain].vercel.app
     ```
   - Railway will auto-redeploy

3. **In Supabase**:
   - Go to **Authentication** → **URL Configuration**
   - Update **Site URL**: `https://[your-vercel-domain].vercel.app`
   - Add to **Redirect URLs**: `https://[your-vercel-domain].vercel.app/**`

---

### Phase 4: Final Configuration & Testing (10 minutes)

#### Step 4.1: Test Authentication Flow

1. Open your Vercel URL: `https://[your-domain].vercel.app`
2. Click **"Sign Up"**
3. Enter email and password
4. Check email for verification link
5. Click verification link
6. Should redirect back to app and be logged in ✅

#### Step 4.2: Test Document Upload

1. Navigate to **Documents** page
2. Click **"Upload Document"**
3. Select a PDF file
4. Wait for processing
5. Document should appear in list ✅

#### Step 4.3: Test Chat Functionality

1. Navigate to **Chat** page
2. Type a question related to your uploaded document
3. Wait for response
4. Should receive answer with citations ✅

#### Step 4.4: Verify Security

```bash
# Test CORS (should fail from unauthorized origin)
curl -X POST https://[railway-url]/chat \
  -H "Origin: https://malicious-site.com" \
  -H "Content-Type: application/json" \
  -d '{"question": "test"}'

# Should return CORS error ✅

# Test authentication (should fail without token)
curl -X GET https://[railway-url]/documents

# Should return 401 Unauthorized ✅
```

---

## Environment Variables Reference

### Complete Backend Variables (Railway)

```bash
# Required
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres?sslmode=require
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_JWT_SECRET=[jwt-secret]
LLM_PROVIDER=groq
LLM_PROVIDER_API_KEY=[api-key]

# Recommended
AUTH_REQUIRED=true
CORS_ORIGINS=https://[frontend-domain]
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
RETRIEVAL_TOP_K=5
RETRIEVAL_MIN_SCORE=0.7
LLM_MODEL_NAME=openai/gpt-oss-20b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=1000

# Optional
DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001
ALLOWED_EMAIL_DOMAINS=
DOCUMENT_STORAGE_BACKEND=supabase
SUPABASE_SERVICE_ROLE_KEY=[server-only-service-role-key]
SUPABASE_STORAGE_BUCKET=documents
MAX_DOCUMENT_SIZE_BYTES=104857600
```

### Complete Frontend Variables (Vercel)

```bash
# Required
NEXT_PUBLIC_API_BASE_URL=https://[backend-domain]
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://[frontend-domain]/auth/callback

# Optional
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=
```

---

## Monitoring Setup

### 1. Railway Monitoring

**Built-in Metrics**:
- Go to Railway Dashboard → **Metrics**
- Monitor:
  - CPU usage
  - Memory usage
  - Network traffic
  - Request count
  - Response times

**Logs**:
- Go to **Deployments** → Click deployment → **View Logs**
- Real-time log streaming
- Filter by log level

### 2. Vercel Analytics

**Enable Analytics**:
1. Go to Vercel Dashboard → **Analytics**
2. Click **"Enable Analytics"**
3. Choose plan (Hobby is free)

**Metrics Available**:
- Page views
- Unique visitors
- Top pages
- Web Vitals (LCP, FID, CLS)
- API route performance

### 3. Supabase Monitoring

**Database Metrics**:
- Go to Supabase Dashboard → **Database** → **Statistics**
- Monitor:
  - Database size
  - Connection count
  - Query performance
  - Table sizes

**Auth Metrics**:
- Go to **Authentication** → **Users**
- Track:
  - Total users
  - Active users
  - Sign-up rate

### 4. Uptime Monitoring (Recommended)

**UptimeRobot** (Free):
1. Sign up at [https://uptimerobot.com](https://uptimerobot.com)
2. Add monitors:
   - **Backend Health**: `https://[railway-url]/health`
   - **Frontend**: `https://[vercel-url]`
3. Set check interval: 5 minutes
4. Configure alerts: Email/SMS

---

## Troubleshooting Common Issues

### Issue 1: Backend Won't Start

**Symptoms**:
- Railway deployment fails
- "Application failed to respond" error

**Solutions**:
```bash
# Check Railway logs
# Common causes:
# 1. Missing environment variables
# 2. Database connection failed
# 3. ML model download timeout

# Fix:
# 1. Verify all required env vars are set
# 2. Check DATABASE_URL format includes ?sslmode=require
# 3. Increase memory to 2GB minimum
# 4. Check Railway logs for specific error
```

### Issue 2: Frontend Can't Connect to Backend

**Symptoms**:
- Network errors in browser console
- "Failed to fetch" errors

**Solutions**:
```bash
# 1. Verify NEXT_PUBLIC_API_BASE_URL is correct
# 2. Check CORS_ORIGINS in Railway includes Vercel domain
# 3. Test backend directly:
curl https://[railway-url]/health

# 4. Check browser console for CORS errors
# 5. Ensure Railway deployment is successful
```

### Issue 3: Authentication Fails

**Symptoms**:
- Can't sign up/login
- "Invalid JWT" errors
- Redirect loops

**Solutions**:
```bash
# 1. Verify Supabase configuration:
#    - Site URL matches Vercel domain
#    - Redirect URLs include /auth/callback
#    - JWT Secret matches in Railway

# 2. Check environment variables:
#    - SUPABASE_URL matches in both apps
#    - SUPABASE_JWT_SECRET is correct
#    - NEXT_PUBLIC_AUTH_REDIRECT_URL is correct

# 3. Test Supabase auth directly:
#    - Try signup in Supabase dashboard
#    - Check Auth logs in Supabase

# 4. Clear browser cookies and try again
```

### Issue 4: Slow Response Times

**Symptoms**:
- Chat responses take >10 seconds
- Document upload times out

**Solutions**:
```bash
# 1. Check Railway metrics:
#    - CPU usage
#    - Memory usage
#    - If high, upgrade plan

# 2. Optimize retrieval:
#    - Reduce RETRIEVAL_TOP_K to 3
#    - Increase RETRIEVAL_MIN_SCORE to 0.6

# 3. Use faster LLM:
#    - Switch to groq (faster than OpenAI)
#    - Use smaller model

# 4. Implement caching:
#    - Cache embeddings
#    - Cache frequent queries
```

### Issue 5: Out of Memory

**Symptoms**:
- Railway shows OOM errors
- Backend crashes during embedding generation

**Solutions**:
```bash
# 1. Increase Railway memory:
#    - Go to Settings → Resources
#    - Set to 4GB or 8GB

# 2. Optimize model loading:
#    - Use smaller embedding model
#    - Implement lazy loading

# 3. Batch processing:
#    - Process large documents in chunks
#    - Limit concurrent uploads
```

---

## Security Checklist

### Pre-Production Security

- [ ] `AUTH_REQUIRED=true` in Railway
- [ ] Strong database password (20+ characters)
- [ ] Unique JWT secret (not default)
- [ ] CORS restricted to production domain only
- [ ] HTTPS enabled (automatic on Railway/Vercel)
- [ ] Environment variables not in Git
- [ ] API keys rotated from development
- [ ] Supabase RLS policies enabled
- [ ] Rate limiting configured
- [ ] Security headers configured in Vercel

### Post-Production Security

- [ ] Monitor auth logs for suspicious activity
- [ ] Set up security alerts
- [ ] Regular dependency updates
- [ ] Quarterly API key rotation
- [ ] Backup strategy implemented
- [ ] Incident response plan documented

---

## Cost Optimization Tips

### 1. Start Small
- Use free tiers initially
- Railway Starter: $5/month
- Vercel Hobby: Free
- Supabase Free: $0/month

### 2. Monitor Usage
- Check Railway metrics weekly
- Review Vercel bandwidth usage
- Monitor Supabase database size

### 3. Optimize Resources
- Right-size Railway memory (start with 2GB)
- Use Vercel edge functions for static content
- Implement caching to reduce API calls
- Compress images and assets

### 4. Scale Gradually
- Don't over-provision initially
- Upgrade only when metrics show need
- Consider reserved instances for predictable load

---

## Next Steps After Deployment

### Week 1: Monitoring & Stability
1. Monitor error rates daily
2. Check performance metrics
3. Gather initial user feedback
4. Fix any critical bugs

### Week 2-4: Optimization
1. Implement caching
2. Optimize database queries
3. Add performance monitoring
4. Improve error handling

### Month 2: Enhancement
1. Add analytics
2. Implement A/B testing
3. Enhance security
4. Plan new features

### Ongoing: Maintenance
1. Weekly dependency updates
2. Monthly security audits
3. Quarterly cost reviews
4. Regular backups verification

---

## Support & Resources

### Documentation
- **Railway**: https://docs.railway.app
- **Vercel**: https://vercel.com/docs
- **Supabase**: https://supabase.com/docs
- **FastAPI**: https://fastapi.tiangolo.com
- **Next.js**: https://nextjs.org/docs

### Community
- **Railway Discord**: https://discord.gg/railway
- **Vercel Discord**: https://discord.gg/vercel
- **Supabase Discord**: https://discord.supabase.com

### Getting Help
1. Check deployment logs first
2. Search documentation
3. Ask in community Discord
4. Open GitHub issue for bugs

---

**Deployment Guide Version**: 1.0  
**Last Updated**: 2026-06-15  
**Estimated Total Setup Time**: 60 minutes  
**Difficulty**: Intermediate

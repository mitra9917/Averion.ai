# Deployment Configuration Guide

This document provides detailed configuration instructions for deploying Averion.ai to Railway (API) and Vercel (Frontend).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Railway API Deployment](#railway-api-deployment)
4. [Vercel Frontend Deployment](#vercel-frontend-deployment)
5. [Environment Variables Reference](#environment-variables-reference)
6. [OAuth Configuration](#oauth-configuration)
7. [CORS Configuration](#cors-configuration)
8. [Health Checks](#health-checks)
9. [Troubleshooting](#troubleshooting)

## Overview

**Architecture:**
- **Backend API**: FastAPI application deployed on Railway with PostgreSQL
- **Frontend**: Next.js application deployed on Vercel
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage for documents
- **Database**: PostgreSQL (Railway or Supabase)

**Environments:**
- **Local**: Development on localhost
- **Preview**: Automatic deployments for pull requests
- **Staging**: Optional pre-production environment
- **Production**: Live production environment

## Prerequisites

Before deploying, ensure you have:

1. **Supabase Project**
   - Create a project at [supabase.com](https://supabase.com)
   - Note your Project URL, anon key, JWT secret, and service role key
   - Configure authentication providers (email, OAuth)
   - Create a storage bucket named `documents`

2. **Railway Account**
   - Sign up at [railway.app](https://railway.app)
   - Connect your GitHub repository

3. **Vercel Account**
   - Sign up at [vercel.com](https://vercel.com)
   - Connect your GitHub repository

4. **API Keys** (for production)
   - OpenAI API key (for LLM and transcription) OR
   - Groq API key (alternative LLM provider)

## Railway API Deployment

### Step 1: Create Railway Project

1. Go to Railway Dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will detect the Dockerfile automatically

### Step 2: Add PostgreSQL Service

1. In your Railway project, click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically inject `DATABASE_URL` into your API service
3. No manual configuration needed for database connection

### Step 3: Configure Environment Variables

In Railway Dashboard → Your API Service → Variables, add:

**Required Variables:**

```bash
# Supabase Authentication
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase

# Document Storage
DOCUMENT_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=documents

# Authentication
AUTH_REQUIRED=true

# CORS (add your Vercel domains)
CORS_ORIGINS=https://your-production-domain.com,https://your-preview-*.vercel.app

# LLM Provider
LLM_PROVIDER=openai
LLM_PROVIDER_API_KEY=your-openai-api-key
LLM_MODEL_NAME=gpt-4o-mini

# Transcription (optional)
TRANSCRIPTION_PROVIDER=openai
TRANSCRIPTION_PROVIDER_API_KEY=your-openai-api-key
```

**Optional Variables:**

```bash
# Email Domain Restrictions
ALLOWED_EMAIL_DOMAINS=company.com,partner.com

# Embedding Model (default is fine for most cases)
EMBEDDING_MODEL_PRELOAD=true

# Logging
LOG_LEVEL=INFO
REQUEST_LOGGING_ENABLED=true
```

### Step 4: Deploy

1. Railway will automatically deploy when you push to your main branch
2. Monitor deployment logs in Railway Dashboard
3. Once deployed, note your Railway URL (e.g., `https://your-api.up.railway.app`)

### Step 5: Verify Health Check

Visit `https://your-api.up.railway.app/health` to verify the API is running.

## Vercel Frontend Deployment

### Step 1: Import Project

1. Go to Vercel Dashboard
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Vercel will detect Next.js automatically

### Step 2: Configure Build Settings

Vercel should auto-detect these settings:

- **Framework Preset**: Next.js
- **Root Directory**: `apps/web`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm ci`

### Step 3: Configure Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

**Production Variables:**

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://your-production-domain.com/auth/callback
```

**Preview Variables:**

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-preview-api.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://your-preview-*.vercel.app/auth/callback
```

**Optional Variables:**

```bash
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=company.com,partner.com
```

### Step 4: Deploy

1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Preview deployments are created automatically for pull requests

## Environment Variables Reference

### Backend (Railway) - Secret Variables

These variables contain sensitive information and should NEVER be committed to Git:

| Variable | Description | Where to Find |
|----------|-------------|---------------|
| `DATABASE_URL` | PostgreSQL connection string | Auto-injected by Railway PostgreSQL service |
| `SUPABASE_JWT_SECRET` | JWT secret for token validation | Supabase Dashboard → Settings → API → JWT Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations | Supabase Dashboard → Settings → API → service_role |
| `LLM_PROVIDER_API_KEY` | OpenAI or Groq API key | OpenAI Platform or Groq Console |
| `TRANSCRIPTION_PROVIDER_API_KEY` | API key for transcription | Same as LLM or separate |

### Backend (Railway) - Configuration Variables

These variables configure application behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | - | Supabase project URL |
| `DOCUMENT_STORAGE_BACKEND` | `local` | Use `supabase` for production |
| `AUTH_REQUIRED` | `false` | Set to `true` for production |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `LLM_PROVIDER` | `mock` | Use `openai` or `groq` for production |
| `EMBEDDING_MODEL_PRELOAD` | `false` | Set to `true` for better performance |

### Frontend (Vercel) - Public Variables

All `NEXT_PUBLIC_*` variables are exposed to the browser and safe to use:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe to expose) |
| `NEXT_PUBLIC_AUTH_REDIRECT_URL` | OAuth callback URL |

## OAuth Configuration

### Supabase OAuth Setup

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable desired providers (Google, GitHub, etc.)
3. Configure OAuth credentials from provider
4. Add redirect URLs for each environment:

**Local:**
```
http://localhost:3000/auth/callback
```

**Preview:**
```
https://your-preview-*.vercel.app/auth/callback
```

**Production:**
```
https://your-production-domain.com/auth/callback
```

### Provider-Specific Configuration

**Google OAuth:**
1. Create OAuth credentials in Google Cloud Console
2. Add authorized redirect URIs (all environments)
3. Copy Client ID and Client Secret to Supabase

**GitHub OAuth:**
1. Create OAuth App in GitHub Settings → Developer settings
2. Add callback URLs (all environments)
3. Copy Client ID and Client Secret to Supabase

## CORS Configuration

### Railway API CORS Setup

The `CORS_ORIGINS` environment variable must include all domains that will call your API:

**Production:**
```bash
CORS_ORIGINS=https://your-production-domain.com
```

**With Preview:**
```bash
CORS_ORIGINS=https://your-production-domain.com,https://your-preview-*.vercel.app
```

**Multiple Domains:**
```bash
CORS_ORIGINS=https://app.example.com,https://staging.example.com,https://preview-*.vercel.app
```

### Vercel Domain Configuration

1. Add custom domain in Vercel Dashboard → Project → Settings → Domains
2. Update `CORS_ORIGINS` in Railway to include the new domain
3. Update `NEXT_PUBLIC_AUTH_REDIRECT_URL` in Vercel to use the new domain

## Health Checks

### API Health Endpoints

The API provides three health check endpoints:

1. **Basic Health Check**
   - URL: `/health`
   - Returns: Service status and version
   - Used by: Railway health checks

2. **Database Health Check**
   - URL: `/health/database`
   - Returns: Database connection status
   - Used by: Monitoring and debugging

3. **AI Health Check**
   - URL: `/health/ai`
   - Returns: LLM and embedding model status
   - Used by: Monitoring AI service availability

### Railway Health Check Configuration

Railway automatically uses the `/health` endpoint configured in `railway.json`:

```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

### Monitoring Health

**Check API Health:**
```bash
curl https://your-api.up.railway.app/health
```

**Check Database:**
```bash
curl https://your-api.up.railway.app/health/database
```

**Check AI Services:**
```bash
curl https://your-api.up.railway.app/health/ai
```

## Troubleshooting

### Common Issues

#### 1. API Health Check Fails

**Symptoms:** Railway shows service as unhealthy

**Solutions:**
- Check Railway logs for startup errors
- Verify `DATABASE_URL` is set correctly
- Ensure all required environment variables are set
- Check if PostgreSQL service is running

#### 2. CORS Errors in Browser

**Symptoms:** Browser console shows CORS policy errors

**Solutions:**
- Verify `CORS_ORIGINS` includes your Vercel domain
- Check for trailing slashes (should not have them)
- Ensure protocol matches (https vs http)
- Redeploy Railway API after changing CORS_ORIGINS

#### 3. Authentication Fails

**Symptoms:** Users cannot log in or get 401 errors

**Solutions:**
- Verify `SUPABASE_JWT_SECRET` matches Supabase Dashboard
- Check `AUTH_REQUIRED` is set correctly for environment
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Verify OAuth redirect URLs in Supabase match your domains

#### 4. Document Upload Fails

**Symptoms:** Document uploads return errors

**Solutions:**
- Verify `DOCUMENT_STORAGE_BACKEND=supabase` in Railway
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Ensure `documents` bucket exists in Supabase Storage
- Verify bucket permissions allow authenticated uploads

#### 5. LLM Requests Fail

**Symptoms:** Chat returns errors or timeouts

**Solutions:**
- Verify `LLM_PROVIDER_API_KEY` is valid
- Check API key has sufficient credits/quota
- Ensure `LLM_PROVIDER` is set to `openai` or `groq` (not `mock`)
- Check Railway logs for specific error messages

### Debugging Tips

**View Railway Logs:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# View logs
railway logs
```

**Test API Locally:**
```bash
cd apps/api
python -m uvicorn app.main:app --reload
```

**Test Frontend Locally:**
```bash
cd apps/web
npm run dev
```

**Check Environment Variables:**
- Railway: Dashboard → Service → Variables
- Vercel: Dashboard → Project → Settings → Environment Variables

### Getting Help

If you encounter issues not covered here:

1. Check Railway and Vercel status pages
2. Review application logs in Railway Dashboard
3. Check Supabase logs in Supabase Dashboard
4. Verify all environment variables are set correctly
5. Test health endpoints to isolate the issue

## Security Best Practices

1. **Never commit secrets to Git**
   - Use `.env` files locally (in `.gitignore`)
   - Use Railway/Vercel environment variables for deployment

2. **Rotate secrets regularly**
   - API keys
   - JWT secrets
   - Service role keys

3. **Use separate Supabase projects**
   - Development/local
   - Preview/staging
   - Production

4. **Restrict CORS origins**
   - Only include necessary domains
   - Don't use wildcards in production

5. **Enable security headers**
   - Set `SECURITY_HEADERS_ENABLED=true`
   - Vercel automatically adds security headers via `vercel.json`

6. **Monitor logs**
   - Enable `REQUEST_LOGGING_ENABLED=true`
   - Review logs regularly for suspicious activity

## Next Steps

After successful deployment:

1. Test all functionality in production
2. Set up monitoring and alerting
3. Configure custom domains
4. Set up CI/CD for automated deployments
5. Review and optimize performance
6. Set up backup and disaster recovery

For more information, see:
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Step-by-step deployment instructions
- [AUTH_SETUP.md](./AUTH_SETUP.md) - Authentication configuration details
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase setup guide

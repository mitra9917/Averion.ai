# Railway Deployment - Step by Step Guide

## Current Status
✅ Railway connected to GitHub
✅ Repository synced
❌ Build failed - needs configuration

## Step 1: Configure Railway Service

### 1.1 Set the Root Directory
Railway needs to know the API is in `apps/api`:

1. In Railway Dashboard, click on your **Averion.ai** service
2. Click **Settings** tab
3. Scroll to **Build** section
4. Set **Root Directory**: `apps/api`
5. Set **Dockerfile Path**: `Dockerfile` (relative to root directory)
6. Click **Save**

### 1.2 Add PostgreSQL Database

1. In Railway Dashboard, click **+ New** button
2. Select **Database** → **PostgreSQL**
3. Railway will automatically create a PostgreSQL database
4. Railway will automatically inject `DATABASE_URL` into your API service

## Step 2: Set Environment Variables

Click on your **Averion.ai** service → **Variables** tab and add these:

### Required Variables (Get from Supabase Dashboard)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase
```

**Where to find these in Supabase:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → SUPABASE_URL
   - **JWT Secret** (under JWT Settings) → SUPABASE_JWT_SECRET
   - **service_role** key (under Project API keys) → SUPABASE_SERVICE_ROLE_KEY

### Storage Configuration

```
DOCUMENT_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=documents
```

**Create the bucket in Supabase:**
1. Go to Supabase Dashboard → **Storage**
2. Click **New bucket**
3. Name: `documents`
4. Make it **Private**
5. Click **Create bucket**

### Authentication

```
AUTH_REQUIRED=true
```

### CORS (Update after Vercel deployment)

```
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

**Note:** You'll update this after deploying to Vercel

### LLM Configuration (Choose one)

**Option A: Use Mock LLM (for testing)**
```
LLM_PROVIDER=mock
```

**Option B: Use OpenAI (for production)**
```
LLM_PROVIDER=openai
LLM_PROVIDER_API_KEY=your-openai-api-key
LLM_MODEL_NAME=gpt-4o-mini
```

Get OpenAI API key from: https://platform.openai.com/api-keys

**Option C: Use Groq (alternative)**
```
LLM_PROVIDER=groq
LLM_PROVIDER_API_KEY=your-groq-api-key
LLM_MODEL_NAME=openai/gpt-oss-20b
```

Get Groq API key from: https://console.groq.com/keys

### Optional: Transcription

```
TRANSCRIPTION_PROVIDER=openai
TRANSCRIPTION_PROVIDER_API_KEY=your-openai-api-key
```

## Step 3: Deploy

1. After setting all variables, click **Deploy** button
2. Railway will rebuild with the correct configuration
3. Wait for build to complete (~2-3 minutes)
4. Check **Build Logs** tab for progress

## Step 4: Get Your Railway API URL

1. After successful deployment, go to **Settings** tab
2. Scroll to **Networking** section
3. Click **Generate Domain**
4. Copy your Railway URL (e.g., `https://averion-api-production.up.railway.app`)
5. **Save this URL** - you'll need it for Vercel

## Step 5: Test Your API

```bash
# Replace with your actual Railway URL
curl https://your-api.up.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "service": "averion-api",
  "version": "0.1.0"
}
```

## Troubleshooting

### Build fails with "No Dockerfile found"
- Make sure Root Directory is set to `apps/api`
- Make sure Dockerfile Path is set to `Dockerfile`

### Build fails with Python errors
- Check Build Logs for specific error
- Ensure all environment variables are set

### Health check fails
- Check Deploy Logs for startup errors
- Verify DATABASE_URL is set (should be auto-injected by PostgreSQL service)
- Verify SUPABASE_* variables are correct

### Database connection fails
- Make sure PostgreSQL service is created
- Railway automatically injects DATABASE_URL
- Check that both services are in the same project

## Next Steps

After Railway API is deployed successfully:
1. Note your Railway API URL
2. Proceed to Vercel deployment (see VERCEL_DEPLOYMENT_STEPS.md)
3. Update CORS_ORIGINS in Railway with your Vercel domain

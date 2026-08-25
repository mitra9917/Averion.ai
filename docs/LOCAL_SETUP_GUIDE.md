# Local Development Setup Guide

This guide helps you set up your local development environment for Averion.ai.

## Prerequisites Status

✅ Docker Desktop is installed
⚠️ Docker Desktop needs to be started (I just started it for you - wait 30-60 seconds)
⚠️ Node.js version mismatch (you have v24, need v22)

## Step 1: Wait for Docker Desktop to Start

Docker Desktop is starting. You should see the Docker icon in your system tray. Wait until it shows "Docker Desktop is running".

**To verify Docker is ready:**
```powershell
docker --version
docker ps
```

## Step 2: Install Node.js 22

You currently have Node.js v24.14.1, but the project requires v22.

### Option A: Using nvm-windows (Recommended)

1. **Check if nvm is installed:**
```powershell
nvm version
```

2. **If nvm is installed, switch to Node.js 22:**
```powershell
nvm install 22
nvm use 22
node --version  # Should show v22.x.x
```

3. **If nvm is NOT installed:**
   - Download from: https://github.com/coreybutler/nvm-windows/releases
   - Install nvm-setup.exe
   - Restart PowerShell
   - Run: `nvm install 22 && nvm use 22`

### Option B: Direct Installation (Alternative)

1. Download Node.js 22 LTS from: https://nodejs.org/
2. Run the installer
3. Restart PowerShell
4. Verify: `node --version`

## Step 3: Clean and Reinstall Frontend Dependencies

Once Node.js 22 is installed:

```powershell
cd apps/web

# Remove old dependencies
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# Install with correct Node version
npm install

# Verify build works
npm run build
```

## Step 4: Set Up API Environment

```powershell
cd apps/api

# Copy example env file
Copy-Item .env.example .env

# Edit .env and set required values:
# - DATABASE_URL (use local PostgreSQL or Supabase)
# - SUPABASE_URL, SUPABASE_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY
# - LLM_PROVIDER_API_KEY (if using real LLM)
```

## Step 5: Test Docker Build (After Docker Desktop is Ready)

```powershell
cd apps/api

# Build the Docker image
docker build -t averion-api .

# Run the container (make sure .env file exists)
docker run -p 8000:8000 --env-file .env averion-api

# In another terminal, test the API
curl http://localhost:8000/health
```

## Step 6: Run API Without Docker (Alternative)

If you prefer to run the API directly without Docker:

```powershell
cd apps/api

# Create virtual environment
python -m venv .venv

# Activate virtual environment
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run the API
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Step 7: Run Frontend

```powershell
cd apps/web

# Make sure you're using Node.js 22
node --version

# Start development server
npm run dev

# Visit http://localhost:3000
```

## Common Issues and Solutions

### Issue 1: Docker Desktop Won't Start

**Symptoms:** Docker commands fail with "daemon not running"

**Solutions:**
1. Check Windows Services: Docker Desktop Service should be running
2. Restart Docker Desktop from system tray
3. Restart your computer
4. Check if WSL 2 is installed (required for Docker Desktop)

### Issue 2: npm EPERM Errors

**Symptoms:** "operation not permitted" when installing packages

**Solutions:**
1. Close VS Code and any other editors
2. Close any running Node.js processes
3. Run PowerShell as Administrator
4. Delete node_modules and try again

### Issue 3: Python Virtual Environment Issues

**Symptoms:** Can't activate virtual environment or import errors

**Solutions:**
```powershell
# Remove old virtual environment
Remove-Item -Recurse -Force .venv

# Create new one
python -m venv .venv

# Activate
.venv\Scripts\Activate.ps1

# Reinstall dependencies
pip install -r requirements.txt
```

### Issue 4: Port Already in Use

**Symptoms:** "Address already in use" when starting API or frontend

**Solutions:**
```powershell
# Find process using port 8000 (API)
netstat -ano | findstr :8000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# For port 3000 (frontend)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## Quick Start Commands

Once everything is set up:

**Terminal 1 - API:**
```powershell
cd apps/api
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Frontend:**
```powershell
cd apps/web
npm run dev
```

**Terminal 3 - Tests:**
```powershell
cd apps/api
.venv\Scripts\Activate.ps1
pytest
```

## Environment Variables Checklist

### Required for Local Development

**API (.env in apps/api/):**
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `SUPABASE_URL` - Your Supabase project URL
- [ ] `SUPABASE_JWT_SECRET` - From Supabase Dashboard
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Dashboard

**Frontend (.env.local in apps/web/):**
- [ ] `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - From Supabase Dashboard
- [ ] `NEXT_PUBLIC_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback`

### Optional for Local Development

**API:**
- [ ] `LLM_PROVIDER=mock` (or `openai` with API key)
- [ ] `LLM_PROVIDER_API_KEY` (if using real LLM)
- [ ] `AUTH_REQUIRED=false` (easier for local dev)

## Next Steps

After local setup is complete:

1. ✅ Verify API health: http://localhost:8000/health
2. ✅ Verify frontend loads: http://localhost:3000
3. ✅ Test authentication flow
4. ✅ Test document upload
5. ✅ Test chat functionality

## Deployment vs Local Development

**Important:** The deployment configuration (Part #129) is separate from local development:

- **Local**: Uses this guide for setup
- **Render**: Uses the Render Web Service settings in `RENDER_DEPLOYMENT.md`
- **Vercel**: Uses vercel.json and package.json (already configured)

The deployment configuration in `RENDER_DEPLOYMENT.md` works with Render and Vercel regardless of your local setup.

## Getting Help

If you encounter issues:

1. Check this guide's troubleshooting section
2. Check Docker Desktop logs (Settings → Troubleshoot → View logs)
3. Check API logs in terminal
4. Check browser console for frontend errors
5. Verify all environment variables are set correctly

## Summary

**What I Did:**
1. ✅ Started Docker Desktop for you
2. ✅ Created this setup guide
3. ✅ Identified Node.js version issue

**What You Need to Do:**
1. ⏳ Wait for Docker Desktop to fully start (30-60 seconds)
2. ⏳ Install Node.js 22 using nvm or direct download
3. ⏳ Clean and reinstall frontend dependencies
4. ⏳ Set up .env files with your credentials
5. ⏳ Test local development

**Deployment Configuration (Part #129):**
- ✅ Ready for Render/Vercel after following `RENDER_DEPLOYMENT.md`
- ✅ Will work when you push to GitHub
- ✅ Does not depend on your local setup

# Vercel Deployment - Step by Step Guide

## Prerequisites
✅ Railway API deployed and URL obtained
✅ Vercel connected to GitHub

## Step 1: Import Project to Vercel

1. Go to https://vercel.com/dashboard
2. Click **Add New** → **Project**
3. Find your **Averion.ai** repository
4. Click **Import**

## Step 2: Configure Build Settings

Vercel should auto-detect Next.js, but verify these settings:

### Framework Preset
- **Framework**: Next.js
- **Root Directory**: `apps/web`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm ci`

Click **Continue**

## Step 3: Set Environment Variables

### For Production Environment

Add these variables (click **Add** for each):

#### API Connection
```
NEXT_PUBLIC_API_BASE_URL=https://your-railway-api.up.railway.app
```
**Replace with your actual Railway API URL from Step 4 of Railway deployment**

#### Supabase Configuration (Get from Supabase Dashboard)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase
```

**Where to find these:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → NEXT_PUBLIC_SUPABASE_URL
   - **anon public** key → NEXT_PUBLIC_SUPABASE_ANON_KEY

#### Auth Redirect (Update after first deployment)
```
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://your-app.vercel.app/auth/callback
```

**Note:** For first deployment, use a placeholder. Update after you get your Vercel domain.

#### Optional: Email Domain Restrictions
```
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=
```
Leave empty to allow any email, or add comma-separated domains like: `company.com,partner.com`

## Step 4: Deploy

1. Click **Deploy**
2. Wait for build to complete (~2-3 minutes)
3. Vercel will show your deployment URL

## Step 5: Get Your Vercel Domain

After successful deployment:

1. Note your Vercel URL (e.g., `https://averion-ai.vercel.app`)
2. **Optional:** Add custom domain in **Settings** → **Domains**

## Step 6: Update Environment Variables

### Update Auth Redirect URL

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Find `NEXT_PUBLIC_AUTH_REDIRECT_URL`
3. Click **Edit**
4. Update to: `https://your-actual-vercel-domain.vercel.app/auth/callback`
5. Click **Save**
6. **Redeploy** (Deployments tab → Click ⋯ → Redeploy)

### Update Railway CORS

1. Go back to Railway Dashboard
2. Click your API service → **Variables**
3. Find `CORS_ORIGINS`
4. Update to: `https://your-vercel-domain.vercel.app`
5. Railway will automatically redeploy

## Step 7: Configure Supabase OAuth Redirects

1. Go to Supabase Dashboard → **Authentication** → **URL Configuration**
2. Add your Vercel domain to **Site URL**: `https://your-vercel-domain.vercel.app`
3. Add to **Redirect URLs**:
   - `https://your-vercel-domain.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (for local development)

## Step 8: Test Your Deployment

### Test Frontend
1. Visit your Vercel URL: `https://your-vercel-domain.vercel.app`
2. Should see the Averion.ai homepage

### Test API Connection
1. Open browser console (F12)
2. Try to sign up or log in
3. Check Network tab for API calls to your Railway URL

### Test Authentication
1. Try signing up with email
2. Check email for verification link
3. Complete sign-up flow

## Step 9: Set Up Preview Deployments (Optional)

For automatic preview deployments on pull requests:

1. Go to Vercel → **Settings** → **Environment Variables**
2. Add variables for **Preview** environment:
   - Same variables as Production
   - Can use same Supabase project or separate preview project
3. Update Supabase redirect URLs to include preview domains:
   - `https://*-your-team.vercel.app/auth/callback`

## Troubleshooting

### Build fails with "Module not found"
- Check that Root Directory is set to `apps/web`
- Verify package-lock.json is committed

### "API connection failed" errors
- Verify NEXT_PUBLIC_API_BASE_URL is correct
- Check Railway API is running: `curl https://your-railway-api.up.railway.app/health`
- Verify CORS_ORIGINS in Railway includes your Vercel domain

### Authentication doesn't work
- Verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are correct
- Check Supabase redirect URLs include your Vercel domain
- Verify NEXT_PUBLIC_AUTH_REDIRECT_URL matches your actual domain

### "CORS policy" errors in browser console
- Update CORS_ORIGINS in Railway to include your Vercel domain
- Make sure there are no trailing slashes
- Railway will auto-redeploy after variable change

## Environment Variables Summary

### Production Variables (Required)
```
NEXT_PUBLIC_API_BASE_URL=https://your-railway-api.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://your-vercel-domain.vercel.app/auth/callback
```

### Production Variables (Optional)
```
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=
```

## Next Steps

After successful Vercel deployment:

1. ✅ Test the full application flow
2. ✅ Upload a test document
3. ✅ Try the chat functionality
4. ✅ Verify authentication works
5. ✅ Check that documents are stored in Supabase Storage
6. ✅ Monitor Railway and Vercel logs for any errors

## Complete Deployment Checklist

- [ ] Railway API deployed and healthy
- [ ] PostgreSQL database created in Railway
- [ ] Supabase project configured
- [ ] Supabase Storage bucket created
- [ ] Vercel frontend deployed
- [ ] Environment variables set in both Railway and Vercel
- [ ] CORS configured correctly
- [ ] OAuth redirect URLs configured in Supabase
- [ ] Test authentication flow
- [ ] Test document upload
- [ ] Test chat functionality

Congratulations! Your Averion.ai application is now deployed! 🎉
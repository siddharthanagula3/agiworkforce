# Vercel Deployment Setup for AGI Workforce

## Current Configuration

The web app is located at `apps/web` and needs to be deployed to Vercel with the domain `agiworkforce.com`.

## Project Settings Required

To properly deploy this monorepo, you need to configure the following in Vercel project settings:

1. **Root Directory**: Set to `apps/web`
2. **Framework Preset**: Next.js
3. **Build Command**: `pnpm build` (runs from apps/web)
4. **Install Command**: `cd ../.. && pnpm install` (installs from monorepo root)
5. **Output Directory**: `.next` (Next.js default)

## Domain Configuration

After successful deployment:

1. Go to Vercel project settings → Domains
2. Add `agiworkforce.com` as a custom domain
3. Configure DNS records as instructed by Vercel

## Manual Configuration Steps

1. Go to https://vercel.com/siddharthanagula4/web/settings
2. Under "General" → "Root Directory", set it to `apps/web`
3. Under "Build & Development Settings":
   - Framework Preset: Next.js
   - Build Command: `pnpm build`
   - Install Command: `cd ../.. && pnpm install`
   - Output Directory: `.next`

## Alternative: Deploy via Git Integration

If Git integration is enabled, Vercel will automatically detect the monorepo structure when you push to the repository.

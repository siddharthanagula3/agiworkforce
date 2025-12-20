# Next Steps for Vercel Deployment

## ✅ Completed

- Git repository connected to Vercel project "web"
- Domain `agiworkforce.com` is already registered (not available for purchase)

## 🔧 Required Configuration Steps

### 1. Configure Build Settings in Vercel Dashboard

Go to: **https://vercel.com/siddharthanagula4/web/settings/general**

**Critical Settings:**

- **Root Directory**: Set to `apps/web`
  - This tells Vercel where your Next.js app is located in the monorepo
- **Framework Preset**: Next.js (should auto-detect)
- **Build Command**: `pnpm build` (runs from apps/web directory)
- **Install Command**: `cd ../.. && pnpm install` (installs from monorepo root)
- **Output Directory**: `.next` (Next.js default)

### 2. Add Custom Domain

Go to: **https://vercel.com/siddharthanagula4/web/settings/domains**

1. Click **"Add Domain"**
2. Enter: `agiworkforce.com`
3. Vercel will show you DNS configuration instructions
4. Add the following DNS records to your domain registrar:
   - **A Record**: `@` → Vercel's IP address (shown in dashboard)
   - **CNAME Record**: `www` → `cname.vercel-dns.com` (or as instructed)

### 3. Trigger a New Deployment

After configuring the Root Directory, Vercel should automatically trigger a new deployment. If not:

1. Go to: **https://vercel.com/siddharthanagula4/web/deployments**
2. Click **"Redeploy"** on the latest deployment, or
3. Push a new commit to trigger automatic deployment

### 4. Verify Deployment

Once deployed successfully:

- Check deployment logs: **https://vercel.com/siddharthanagula4/web/deployments**
- Test the preview URL
- After DNS propagates (can take up to 48 hours), test `https://agiworkforce.com`

## 📝 Notes

- The `vercel.json` in `apps/web/` is configured for monorepo deployment
- Make sure `Root Directory` is set to `apps/web` - this is critical!
- The install command goes up two directories to reach the monorepo root where `pnpm-workspace.yaml` and root `package.json` are located

## 🐛 Troubleshooting

If deployments fail:

1. Check build logs in Vercel dashboard
2. Verify Root Directory is set correctly
3. Ensure `pnpm-lock.yaml` is committed to the repository
4. Check that all dependencies in `apps/web/package.json` are valid

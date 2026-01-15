# Deployment Guide

Comprehensive deployment strategies for AGI Workforce monorepo applications and services.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Web Application Deployment](#web-application-deployment)
- [Desktop Application Deployment](#desktop-application-deployment)
- [Backend Services Deployment](#backend-services-deployment)
- [Database Deployment](#database-deployment)
- [Browser Extension Deployment](#browser-extension-deployment)
- [Deployment Checklist](#deployment-checklist)
- [Rollback Procedures](#rollback-procedures)

## Overview

AGI Workforce uses a multi-platform deployment strategy:

- **Web App:** Vercel (Next.js 16) with auto-deployments
- **Desktop App:** GitHub Releases with Tauri auto-updater
- **Backend Services:** Node.js services (API Gateway, Signaling Server)
- **Database:** Supabase PostgreSQL (managed) + SQLite (desktop local)
- **CDN/Assets:** Vercel Edge Network

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Environment                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐  │
│  │   Vercel     │      │   Supabase   │      │  Upstash  │  │
│  │  (Web App)   │─────▶│  PostgreSQL  │      │   Redis   │  │
│  │  + Edge Fns  │      │   + Auth     │      │  (Cache)  │  │
│  └──────────────┘      └──────────────┘      └───────────┘  │
│         │                      │                              │
│         │                      │                              │
│  ┌──────▼──────────────────────▼──────────────────────────┐  │
│  │             API Gateway (Node.js)                       │  │
│  │          - Desktop sync endpoints                       │  │
│  │          - Mobile sync endpoints                        │  │
│  │          - JWT authentication                           │  │
│  └───────────────────────────┬─────────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────▼─────────────────────────────┐  │
│  │       WebSocket Signaling Server (Node.js)              │  │
│  │          - Device pairing (6-digit codes)               │  │
│  │          - Real-time sync                               │  │
│  │          - 5-minute TTL                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Desktop Application                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │   Tauri App (React + Rust)                           │    │
│  │   - Auto-updates via GitHub Releases                 │    │
│  │   - Local SQLite database                            │    │
│  │   - System integrations                              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools

- **Node.js:** v22.12.0+
- **pnpm:** v9.15.3+
- **Rust:** v1.90.0+ (for desktop builds)
- **Git:** Latest version
- **Docker:** Optional, for containerized services

### Required Accounts

- **Vercel:** Web app hosting
- **Supabase:** Database and authentication
- **Stripe:** Payment processing
- **GitHub:** Source control and releases
- **Upstash:** Redis rate limiting (optional)
- **Sentry:** Error tracking (optional)

### Environment Setup

Ensure all environment variables are configured for each environment:

- Development: `.env.local`
- Staging: Vercel preview deployments
- Production: Vercel production environment

## Web Application Deployment

### Vercel Configuration

The web app is configured for automatic deployments via Vercel.

**Configuration:** `/apps/web/vercel.json`

```json
{
  "buildCommand": "cd ../.. && pnpm --filter web build",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs",
  "git": {
    "deploymentEnabled": {
      "main": true
    }
  }
}
```

### Deployment Triggers

**Automatic Deployments:**

- Push to `main` branch → Production
- Pull requests → Preview deployments
- Preview deployments have unique URLs for testing

**Manual Deployments:**

```bash
# Deploy to production (via Vercel CLI)
vercel --prod

# Deploy preview
vercel
```

### Build Process

1. **Install dependencies** with pnpm workspaces
2. **Build shared packages** (types, utils)
3. **Build Next.js app** with optimizations
4. **Generate static assets**
5. **Deploy to Vercel Edge Network**

**Build command:**

```bash
cd apps/web && pnpm build
```

### Environment Variables

Configure in Vercel dashboard or via CLI:

```bash
# Required for production
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
vercel env add NEXT_PUBLIC_APP_URL

# Stripe price IDs
vercel env add STRIPE_PRICE_HOBBY_MONTHLY
vercel env add STRIPE_PRICE_HOBBY_YEARLY
vercel env add STRIPE_PRICE_PRO_MONTHLY
vercel env add STRIPE_PRICE_PRO_YEARLY
vercel env add STRIPE_PRICE_MAX_MONTHLY
vercel env add STRIPE_PRICE_MAX_YEARLY

# LLM provider keys (configure as needed)
vercel env add OPENAI_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add GOOGLE_API_KEY
vercel env add XAI_API_KEY
vercel env add DEEPSEEK_API_KEY

# Optional: Rate limiting
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
```

### Vercel Configuration Options

**Headers:**

- CORS configured for API routes
- Security headers enabled

**Rewrites:**

- API routing for LLM endpoints
- Health check endpoints

**Crons:**

- Daily credit reset at midnight UTC

### Health Checks

Verify deployment health:

```bash
# Health endpoint
curl https://agiworkforce.com/api/health

# Expected response:
# { "status": "ok", "timestamp": "2026-01-15T..." }
```

### Web Deployment Checklist

- [ ] Environment variables configured in Vercel
- [ ] Supabase database migrations applied
- [ ] Stripe webhooks configured
- [ ] Custom domain configured (if applicable)
- [ ] SSL/TLS certificates verified
- [ ] Rate limiting enabled
- [ ] Error tracking configured
- [ ] Build succeeds locally
- [ ] Preview deployment tested
- [ ] Production deployment verified
- [ ] Health checks passing

## Desktop Application Deployment

### Build Targets

Tauri supports multi-platform builds:

- **macOS:** Universal binary (ARM64 + x86_64) `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.AppImage`, `.deb`, `.rpm`

### Local Build

```bash
# Build for current platform
pnpm build:desktop

# Outputs to: apps/desktop/src-tauri/target/release/bundle/
```

### Release Process

Desktop releases are automated via GitHub Actions on version tags.

**1. Update version:**

```bash
# Edit apps/desktop/src-tauri/tauri.conf.json
{
  "version": "1.0.5"  // Increment version
}

# Edit apps/desktop/src-tauri/Cargo.toml
[package]
version = "1.0.5"
```

**2. Create git tag:**

```bash
git tag -a v1.0.5 -m "Release v1.0.5"
git push origin v1.0.5
```

**3. GitHub Actions workflow:**

The `release.yml` workflow will:

- Create GitHub release (draft)
- Build for all platforms (macOS, Windows, Linux)
- Sign binaries (macOS: Apple Developer ID, Windows: optional)
- Upload artifacts to release
- Publish release

**Workflow:** `.github/workflows/release.yml`

### Auto-Update Configuration

Tauri auto-updater is configured in `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://agiworkforce.com/api/releases/{{target}}/{{current_version}}"],
      "pubkey": "RWQahuITpry6oPekJf8JP5xSoAxMiUVUohL85U3V/vq1wVfLYzejJZCM"
    }
  }
}
```

**Update endpoint requirements:**

- Must return JSON with latest version info
- Must include download URL and signature
- Uses Tauri's signing mechanism

### Code Signing

**macOS:**

Requires Apple Developer account and certificates.

```bash
# Environment variables for GitHub Actions
APPLE_ID=your-apple-id@email.com
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_PASSWORD=xxxx-xxxx-xxxx-xxxx  # App-specific password
```

**Signing identity:**

```
Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)
```

**Notarization:**

- Automatic via Tauri action
- Requires entitlements.plist
- Takes 5-15 minutes

**Windows:**

Optional code signing with certificate.

```bash
# Set certificate in GitHub secrets
WINDOWS_CERTIFICATE
WINDOWS_CERTIFICATE_PASSWORD
```

### SQLite Database Migrations

Desktop app uses local SQLite at `~/.config/agiworkforce/agiworkforce.db`

**Migration strategy:**

- Migrations embedded in Rust code
- Automatic migration on app startup
- Version tracked in database

**Configuration:**

```rust
// Optimized SQLite pragmas
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -64000;
```

### Desktop Deployment Checklist

- [ ] Version incremented in tauri.conf.json and Cargo.toml
- [ ] Changelog updated
- [ ] Local build tested on target platform
- [ ] Database migrations tested
- [ ] Git tag created and pushed
- [ ] GitHub Actions workflow completed
- [ ] All platform builds successful
- [ ] macOS notarization completed (if applicable)
- [ ] Windows signing completed (if applicable)
- [ ] GitHub release published
- [ ] Auto-update endpoint tested
- [ ] Download links verified
- [ ] Installation tested on clean system

## Backend Services Deployment

### API Gateway

Node.js Express server for desktop/mobile sync.

**Location:** `services/api-gateway`

**Deployment options:**

**1. VPS/Cloud VM:**

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Start with PM2
pm2 start dist/server.js --name api-gateway

# Environment
cp .env.example .env
# Edit .env with production values
```

**2. Docker (future):**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**3. Serverless (future):**

Can be adapted for AWS Lambda, Google Cloud Functions, etc.

**Environment variables:**

```bash
PORT=3000
JWT_SECRET=<strong-random-secret>
ALLOWED_ORIGINS=https://agiworkforce.com,tauri://localhost
SIGNALING_HTTP_URL=http://localhost:4000
```

**Health check:**

```bash
curl http://localhost:3000/health
```

### WebSocket Signaling Server

Node.js WebSocket server for real-time device pairing.

**Location:** `services/signaling-server`

**Deployment:**

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Start with PM2
pm2 start dist/server.js --name signaling-server

# Environment
cp .env.example .env
# Edit .env with production values
```

**Environment variables:**

```bash
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SIGNALING_HOST=0.0.0.0
SIGNALING_WS_PATH=/ws
SIGNALING_PAIRING_TTL=300
ALLOWED_ORIGINS=https://agiworkforce.com,tauri://localhost
```

**WebSocket endpoint:**

```
ws://your-server:4000/ws
```

### Process Management

Use PM2 for production process management:

```bash
# Install PM2 globally
npm install -g pm2

# Start services
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs

# Restart
pm2 restart all

# Auto-start on system boot
pm2 startup
pm2 save
```

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './services/api-gateway/dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'signaling-server',
      script: './services/signaling-server/dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
```

### Reverse Proxy (Nginx)

**Configuration example:**

```nginx
# API Gateway
upstream api_gateway {
    server localhost:3000;
}

# Signaling Server
upstream signaling_server {
    server localhost:4000;
}

server {
    listen 443 ssl http2;
    server_name api.agiworkforce.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # API Gateway
    location / {
        proxy_pass http://api_gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 443 ssl http2;
    server_name signaling.agiworkforce.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # WebSocket
    location /ws {
        proxy_pass http://signaling_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://signaling_server;
    }
}
```

### Backend Services Checklist

- [ ] Environment variables configured
- [ ] Build succeeds
- [ ] Health checks passing
- [ ] PM2 configured for auto-restart
- [ ] Logs configured and rotating
- [ ] Reverse proxy configured
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] Monitoring enabled
- [ ] Backup procedures in place

## Database Deployment

### Supabase PostgreSQL

**Initial Setup:**

1. Create Supabase project at https://supabase.com
2. Note project URL and API keys
3. Configure authentication providers
4. Enable Row Level Security (RLS)

**Schema Management:**

Migrations are stored in `apps/web/supabase/migrations/`

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Link to project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push

# Create new migration
supabase migration new migration_name

# Reset database (development only)
supabase db reset
```

**RLS Policies:**

All tables have RLS enabled:

- `profiles`: Users view own data
- `subscriptions`: Users view own, service role manages all
- `processed_stripe_events`: Service role only
- `beta_invites`: Service role creates, users view own
- `beta_redemptions`: Users view own redemptions

**Backup:**

Supabase provides automatic backups:

- Point-in-time recovery (PITR)
- Daily automatic backups (retained based on plan)
- Manual backups via dashboard

**Manual backup:**

```bash
# Export schema
pg_dump -h db.your-project.supabase.co -U postgres -s > schema.sql

# Export data
pg_dump -h db.your-project.supabase.co -U postgres -a > data.sql
```

### SQLite (Desktop)

Desktop app uses local SQLite database.

**Location:** `~/.config/agiworkforce/agiworkforce.db`

**Backup strategy:**

Users should back up their data directory:

- macOS: `~/Library/Application Support/com.agiworkforce.desktop/`
- Windows: `%APPDATA%\com.agiworkforce.desktop\`
- Linux: `~/.config/agiworkforce/`

**Migration on update:**

Automatic migration on app launch:

- Version tracked in `_migrations` table
- Migrations applied sequentially
- Rollback on failure

### Database Checklist

- [ ] Supabase project created
- [ ] Migrations applied
- [ ] RLS policies verified
- [ ] Authentication configured
- [ ] API keys secured
- [ ] Backup schedule verified
- [ ] Connection pooling configured
- [ ] Performance monitoring enabled

## Browser Extension Deployment

**Location:** `apps/extension`

**Build:**

```bash
cd apps/extension
pnpm build
```

**Chrome Web Store:**

1. Build extension
2. Create ZIP of build artifacts
3. Upload to Chrome Web Store Developer Dashboard
4. Fill in store listing details
5. Submit for review

**Firefox Add-ons:**

1. Build extension
2. Create ZIP of build artifacts
3. Upload to Firefox Add-on Developer Hub
4. Fill in listing details
5. Submit for review

**Manual installation (development):**

Chrome:

1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `apps/extension/dist`

Firefox:

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `apps/extension/dist/manifest.json`

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review completed
- [ ] Security audit performed
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Environment variables verified
- [ ] Database migrations tested
- [ ] Backup procedures verified

### Web App Deployment

- [ ] Vercel environment configured
- [ ] Preview deployment tested
- [ ] Database migrations applied
- [ ] Stripe webhooks configured
- [ ] Health checks passing
- [ ] SSL certificates valid
- [ ] CDN cache cleared (if needed)

### Desktop App Deployment

- [ ] Version bumped
- [ ] Changelog updated
- [ ] Builds tested on all platforms
- [ ] Code signing verified
- [ ] Release notes prepared
- [ ] GitHub release created
- [ ] Auto-update tested

### Backend Services Deployment

- [ ] Services built successfully
- [ ] Environment variables configured
- [ ] Process manager configured
- [ ] Reverse proxy configured
- [ ] Health checks passing
- [ ] Monitoring configured
- [ ] Log aggregation enabled

### Post-Deployment

- [ ] Smoke tests passed
- [ ] User acceptance testing completed
- [ ] Performance monitoring active
- [ ] Error tracking confirmed
- [ ] Rollback procedure documented
- [ ] Team notified
- [ ] Documentation updated
- [ ] Announcement prepared (if applicable)

## Rollback Procedures

### Web App Rollback

**Via Vercel Dashboard:**

1. Navigate to Vercel dashboard
2. Select project
3. Go to "Deployments"
4. Find last known good deployment
5. Click "..." → "Promote to Production"

**Via Vercel CLI:**

```bash
# List deployments
vercel ls

# Rollback to specific deployment
vercel rollback <deployment-url>
```

**Via Git:**

```bash
# Revert commit
git revert <commit-hash>
git push origin main

# This triggers automatic redeployment
```

### Desktop App Rollback

**For users:**

Auto-updater allows reverting to previous version if needed.

**For new releases:**

1. Mark problematic release as draft in GitHub
2. Create new tag with patch
3. Deploy fixed version

**Emergency:**

Users can manually download and install previous version from GitHub releases.

### Backend Services Rollback

**With PM2:**

```bash
# Deploy new version with different name
pm2 start dist/server.js --name api-gateway-new

# Test new version
curl http://localhost:PORT/health

# If working, delete old and rename
pm2 delete api-gateway
pm2 restart api-gateway-new --name api-gateway

# If issues, revert
pm2 delete api-gateway-new
pm2 restart api-gateway
```

**With Git:**

```bash
# Revert to previous commit
git revert <commit-hash>
git push

# Rebuild and redeploy
pnpm build
pm2 restart all
```

### Database Rollback

**Supabase:**

```bash
# Rollback migration
supabase db reset --db-url <connection-string>

# Or restore from backup
# Via Supabase dashboard: Database → Backups → Restore
```

**SQLite (Desktop):**

Users must restore from their local backups.

### Rollback Checklist

- [ ] Issue severity assessed
- [ ] Rollback decision made
- [ ] Team notified
- [ ] Rollback procedure initiated
- [ ] Services verified after rollback
- [ ] Users notified (if applicable)
- [ ] Post-mortem scheduled
- [ ] Root cause documented

## Deployment Best Practices

### Blue-Green Deployments

For backend services, consider blue-green deployment strategy:

1. Deploy new version alongside current
2. Test new version with health checks
3. Switch traffic to new version
4. Keep old version running for quick rollback
5. Decommission old version after verification

### Canary Deployments

For high-risk changes:

1. Deploy to subset of users (5-10%)
2. Monitor metrics and errors
3. Gradually increase traffic
4. Full rollout after validation

### Feature Flags

Use feature flags for risky features:

```typescript
// Environment-based feature flags
const FEATURE_NEW_AGI = process.env.VITE_ENABLE_NEW_AGI === 'true';

if (FEATURE_NEW_AGI) {
  // New feature
} else {
  // Legacy feature
}
```

### Zero-Downtime Deployments

**Web app:** Vercel handles zero-downtime automatically

**Backend services:** Use PM2 cluster mode with graceful reload

```bash
pm2 reload all
```

### Monitoring During Deployment

Monitor key metrics during deployment:

- Error rate
- Response time
- CPU/Memory usage
- User sessions
- Database connections

### Communication

**Internal:**

- Notify team before deployment
- Post in deployment channel
- Share deployment status

**External:**

- Status page updates (if issues)
- Email notifications (for critical updates)
- In-app notifications (for desktop updates)

## Support Contacts

**Infrastructure Issues:**

- Vercel: support@vercel.com
- Supabase: support@supabase.com
- GitHub: support@github.com

**Emergency Contacts:**

- DevOps Lead: [contact info]
- Engineering Manager: [contact info]
- On-call rotation: [contact info]

---

**Last Updated:** 2026-01-15
**Version:** 1.0
**Maintained By:** DevOps Team

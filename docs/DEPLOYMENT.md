# Deployment Guide

Complete guide for deploying AGI Workforce across all platforms.

## Table of Contents

- [Overview](#overview)
- [Desktop Application](#desktop-application)
- [Web Application](#web-application)
- [Backend Services](#backend-services)
- [Database Setup](#database-setup)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring and Observability](#monitoring-and-observability)

## Overview

AGI Workforce consists of multiple deployable components:

- **Desktop App**: Native macOS, Windows, and Linux applications (Tauri)
- **Web App**: Next.js application (deployed on Vercel)
- **API Gateway**: Express.js REST API (port 3000)
- **Signaling Server**: WebSocket server (port 4000)
- **Database**: Supabase PostgreSQL (managed) + SQLite (desktop local)

## Desktop Application

### Building for Distribution

#### Prerequisites

**All Platforms:**

- Node.js 22.12.0+
- pnpm 9.15.0+
- Rust 1.75+

**macOS:**

- Xcode Command Line Tools
- Apple Developer account (for code signing)

**Windows:**

- Visual Studio C++ Build Tools
- NSIS (for installer creation)
- Optional: Code signing certificate

**Linux:**

- Build essentials
- WebKit2GTK development libraries

#### Build Commands

**Universal Build (all platforms):**

```bash
pnpm build:desktop
```

**Platform-Specific Builds:**

```bash
# macOS (DMG)
pnpm build:desktop -- --target universal-apple-darwin

# Windows (MSI/EXE)
pnpm build:desktop -- --target x86_64-pc-windows-msvc

# Linux (AppImage/DEB)
pnpm build:desktop -- --target x86_64-unknown-linux-gnu
```

#### Output Locations

**macOS:**

```
apps/desktop/src-tauri/target/release/bundle/dmg/
AGI Workforce_1.0.4_universal.dmg
```

**Windows:**

```
apps/desktop/src-tauri/target/release/bundle/msi/
AGI Workforce_1.0.4_x64_en-US.msi
```

**Linux:**

```
apps/desktop/src-tauri/target/release/bundle/appimage/
agi-workforce_1.0.4_amd64.AppImage
apps/desktop/src-tauri/target/release/bundle/deb/
agi-workforce_1.0.4_amd64.deb
```

### Code Signing

#### macOS Code Signing

1. **Set up signing identity in tauri.conf.json:**

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)",
      "providerShortName": "D2PR62RLT4",
      "entitlements": "entitlements.plist"
    }
  }
}
```

2. **Create entitlements.plist:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

3. **Notarize the app:**

```bash
# Submit for notarization
xcrun notarytool submit \
  "apps/desktop/src-tauri/target/release/bundle/dmg/AGI Workforce_1.0.4_universal.dmg" \
  --apple-id your-apple-id@example.com \
  --team-id D2PR62RLT4 \
  --password app-specific-password \
  --wait

# Staple notarization ticket
xcrun stapler staple \
  "apps/desktop/src-tauri/target/release/bundle/dmg/AGI Workforce_1.0.4_universal.dmg"
```

#### Windows Code Signing

1. **Obtain code signing certificate** from a trusted CA

2. **Configure in tauri.conf.json:**

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

3. **Sign the installer:**

```powershell
signtool sign /f certificate.pfx /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 "AGI Workforce_1.0.4_x64_en-US.msi"
```

### Auto-Updates

AGI Workforce uses Tauri's built-in updater plugin.

#### Update Server Setup

1. **Configure update endpoint in tauri.conf.json:**

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

2. **Generate signing keys:**

```bash
# Generate key pair
tauri signer generate

# Output:
# Private key: <save securely>
# Public key: <add to tauri.conf.json>
```

3. **Sign release artifacts:**

```bash
# Sign the update file
tauri signer sign \
  --private-key "path/to/private.key" \
  --file "AGI Workforce_1.0.4_universal.app.tar.gz"
```

4. **Update endpoint response format:**

```json
{
  "version": "1.0.4",
  "date": "2026-01-15",
  "platforms": {
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://releases.agiworkforce.com/darwin-x86_64/1.0.4/app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://releases.agiworkforce.com/darwin-aarch64/1.0.4/app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://releases.agiworkforce.com/windows-x86_64/1.0.4/app.msi"
    },
    "linux-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://releases.agiworkforce.com/linux-x86_64/1.0.4/app.AppImage"
    }
  },
  "notes": "Bug fixes and performance improvements"
}
```

### Distribution

#### GitHub Releases

1. **Create release on GitHub:**

```bash
gh release create v1.0.4 \
  --title "v1.0.4" \
  --notes "Release notes here" \
  apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg \
  apps/desktop/src-tauri/target/release/bundle/msi/*.msi \
  apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage
```

2. **Automated release workflow** (GitHub Actions):

```yaml
name: Release Desktop App

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm build:desktop
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: desktop-${{ matrix.os }}
          path: apps/desktop/src-tauri/target/release/bundle/
```

#### App Stores

**macOS App Store:**

1. Build with App Store provisioning profile
2. Submit via Xcode or Transporter
3. Fill app metadata in App Store Connect

**Microsoft Store:**

1. Convert MSI to MSIX format
2. Submit via Partner Center
3. Configure app metadata

**Snapcraft (Linux):**

1. Create snapcraft.yaml
2. Build snap: `snapcraft`
3. Publish: `snapcraft push agi-workforce_1.0.4_amd64.snap`

## Web Application

### Vercel Deployment

AGI Workforce web app is deployed on Vercel with automatic deployments.

#### Initial Setup

1. **Connect GitHub repository:**
   - Go to [vercel.com](https://vercel.com)
   - Import project from GitHub
   - Select `agiworkforce` repository

2. **Configure build settings:**
   - Framework Preset: Next.js
   - Root Directory: `apps/web`
   - Build Command: `pnpm build`
   - Output Directory: `.next`

3. **Set environment variables:**

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
SENTRY_DSN=https://your-sentry-dsn
NEXT_PUBLIC_APP_URL=https://agiworkforce.com
```

#### Deployment Workflow

**Automatic Deployments:**

- Push to `main` branch → Production deployment
- Push to `develop` branch → Preview deployment
- Pull requests → Preview deployments

**Manual Deployment:**

```bash
cd apps/web
vercel deploy --prod
```

#### Custom Domain Setup

1. **Add domain in Vercel:**
   - Go to Project Settings → Domains
   - Add `agiworkforce.com`

2. **Configure DNS:**
   - Add CNAME record: `www` → `cname.vercel-dns.com`
   - Add A record: `@` → Vercel IP

3. **SSL/TLS:**
   - Automatically provisioned by Vercel
   - Enable "Automatic HTTPS Rewrites"

### Alternative Deployment (Docker)

If not using Vercel:

1. **Create Dockerfile:**

```dockerfile
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @agiworkforce/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

2. **Build and run:**

```bash
docker build -t agiworkforce-web .
docker run -p 3000:3000 --env-file .env agiworkforce-web
```

## Backend Services

### API Gateway

#### Deployment Options

**Option 1: Railway**

1. **Create new project:**

```bash
railway init
railway link
```

2. **Configure service:**

```bash
railway add
# Select Node.js service
```

3. **Set environment variables:**

```bash
railway variables set DATABASE_URL=...
railway variables set JWT_SECRET=...
railway variables set SUPABASE_URL=...
```

4. **Deploy:**

```bash
railway up
```

**Option 2: AWS ECS/Fargate**

1. **Create ECR repository:**

```bash
aws ecr create-repository --repository-name agiworkforce-api
```

2. **Build and push Docker image:**

```bash
docker build -t agiworkforce-api services/api-gateway
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag agiworkforce-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/agiworkforce-api:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/agiworkforce-api:latest
```

3. **Create ECS task definition and service**

**Option 3: DigitalOcean App Platform**

1. **Create app.yaml:**

```yaml
name: agiworkforce-api
services:
  - name: api-gateway
    github:
      repo: siddhartha/agiworkforce
      branch: main
      deploy_on_push: true
    source_dir: services/api-gateway
    build_command: pnpm build
    run_command: node dist/index.js
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: '3000'
```

### Signaling Server

WebSocket signaling server deployment:

**Option 1: Railway**

Same process as API Gateway, with WebSocket support enabled.

**Option 2: Render**

1. **Create render.yaml:**

```yaml
services:
  - type: web
    name: agiworkforce-signaling
    env: node
    buildCommand: pnpm install && pnpm --filter @agiworkforce/signaling-server build
    startCommand: node dist/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 4000
```

**Option 3: Self-hosted (PM2)**

```bash
# Install PM2
npm install -g pm2

# Start service
cd services/signaling-server
pm2 start npm --name "signaling-server" -- start

# Configure auto-restart
pm2 startup
pm2 save
```

### Environment Variables

**API Gateway (.env):**

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=your-secret-key
REDIS_URL=redis://...
CORS_ORIGIN=https://agiworkforce.com
```

**Signaling Server (.env):**

```bash
NODE_ENV=production
PORT=4000
REDIS_URL=redis://...
JWT_SECRET=your-secret-key
```

## Database Setup

### Supabase (PostgreSQL)

#### Initial Setup

1. **Create project:**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Save database password

2. **Configure connection:**
   - Get connection string from Project Settings → Database
   - Format: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`

3. **Run migrations:**

```bash
cd apps/web
supabase link --project-ref your-project-ref
supabase db push
```

#### Migration Management

**Create migration:**

```bash
cd apps/web
supabase migration new migration_name
```

**Apply migrations:**

```bash
supabase db push
```

**Rollback migration:**

```bash
supabase db reset
```

#### Row Level Security

Ensure RLS is enabled on all tables:

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

### Redis (Upstash)

For rate limiting and caching:

1. **Create Redis database:**
   - Go to [upstash.com](https://upstash.com)
   - Create new database
   - Get REST URL and token

2. **Configure in application:**

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

## CI/CD Pipeline

### GitHub Actions Workflow

**.github/workflows/ci.yml:**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm typecheck:all
      - run: pnpm lint
      - run: pnpm test

  build-desktop:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - run: pnpm build:desktop

  deploy-web:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Monitoring and Observability

### Sentry Integration

**Desktop App:**

```rust
// In lib.rs
#[cfg(feature = "sentry")]
fn init_sentry() {
    let _guard = sentry::init((
        env::var("SENTRY_DSN").unwrap(),
        sentry::ClientOptions {
            release: Some(env!("CARGO_PKG_VERSION").into()),
            environment: Some("production".into()),
            ..Default::default()
        },
    ));
}
```

**Web App:**

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

### Logging

**Structured Logging (Rust):**

```rust
use tracing::{info, warn, error};

info!("User logged in", user_id = %user.id);
error!("Database error", error = %e);
```

**Logging (Node.js):**

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

logger.info({ userId: user.id }, 'User logged in');
```

### Health Checks

**API Gateway:**

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version,
    uptime: process.uptime(),
  });
});
```

### Metrics

**Prometheus-style metrics:**

```typescript
import { register, Counter, Histogram } from 'prom-client';

const requestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

## Security Best Practices

1. **Environment Variables:**
   - Never commit secrets to version control
   - Use secret management services (AWS Secrets Manager, Vault)
   - Rotate keys regularly

2. **HTTPS:**
   - Always use HTTPS in production
   - Enable HSTS headers
   - Use strong TLS configuration

3. **Authentication:**
   - Implement rate limiting
   - Use secure session management
   - Enable 2FA for admin accounts

4. **Database:**
   - Enable RLS policies
   - Use prepared statements
   - Regular backups

5. **API Security:**
   - Validate all inputs
   - Implement CORS properly
   - Use API keys/tokens

## Rollback Procedures

**Desktop App:**

- Users can download previous version from GitHub releases
- Auto-updater can be disabled in settings

**Web App:**

```bash
# Revert to previous deployment
vercel rollback
```

**Database:**

```bash
# Rollback migration
supabase db reset --version previous_version
```

## Support

For deployment support:

- Documentation: https://docs.agiworkforce.com
- GitHub Issues: https://github.com/siddhartha/agiworkforce/issues
- Email: devops@agiworkforce.com

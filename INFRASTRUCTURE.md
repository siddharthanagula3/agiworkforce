# Infrastructure Documentation

Comprehensive documentation for AGI Workforce infrastructure, services, and architecture.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Cloud Services](#cloud-services)
- [Infrastructure as Code](#infrastructure-as-code)
- [Networking](#networking)
- [Security](#security)
- [Storage](#storage)
- [CI/CD Pipeline](#cicd-pipeline)
- [Cost Management](#cost-management)

## Architecture Overview

AGI Workforce uses a hybrid cloud architecture with managed services and self-hosted components.

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                        Production Environment                       │
└───────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            Edge Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               Vercel Edge Network (CDN)                       │   │
│  │  - Global edge nodes                                          │   │
│  │  - Static asset delivery                                      │   │
│  │  - Edge functions                                             │   │
│  │  - DDoS protection                                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 Web Application (Vercel)                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐              │  │
│  │  │ Next.js 16 │  │  React 19  │  │ Edge API   │              │  │
│  │  │  Server    │─▶│ Components │─▶│  Routes    │              │  │
│  │  └────────────┘  └────────────┘  └────────────┘              │  │
│  │  - Server-side rendering                                       │  │
│  │  - API routes                                                  │  │
│  │  - Webhook handlers (Stripe)                                   │  │
│  │  - LLM router API                                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │            Backend Services (Node.js)                          │  │
│  │  ┌─────────────────┐      ┌──────────────────────┐            │  │
│  │  │  API Gateway    │      │  Signaling Server    │            │  │
│  │  │  - JWT auth     │      │  - WebSocket         │            │  │
│  │  │  - Desktop sync │      │  - Device pairing    │            │  │
│  │  │  - Mobile sync  │      │  - Real-time sync    │            │  │
│  │  │  - Port: 3000   │      │  - Port: 4000        │            │  │
│  │  └─────────────────┘      └──────────────────────┘            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                │                              │
                │                              │
                ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Layer                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │     Supabase       │  │  Upstash Redis │  │  Local Storage   │  │
│  │  - PostgreSQL      │  │  - Rate limit  │  │  - SQLite (desk) │  │
│  │  - Auth (JWT)      │  │  - Session     │  │  - User data     │  │
│  │  - RLS policies    │  │  - Cache       │  │  - Offline mode  │  │
│  │  - Realtime        │  │                │  │                  │  │
│  └────────────────────┘  └────────────────┘  └──────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      External Services                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Stripe    │  │   OpenAI    │  │  Anthropic  │  │   Sentry  │  │
│  │  Payments   │  │     API     │  │     API     │  │   Errors  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Google    │  │     xAI     │  │  DeepSeek   │  │   GitHub  │  │
│  │  Gemini API │  │   Grok API  │  │     API     │  │  Releases │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Client Applications                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Desktop   │  │   Browser   │  │   Mobile    │                  │
│  │  Tauri App  │  │  Extension  │  │  (Future)   │                  │
│  │ macOS/Win/  │  │ Chrome/FF   │  │  iOS/And    │                  │
│  │   Linux     │  │             │  │             │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer             | Technology            | Purpose                 |
| ----------------- | --------------------- | ----------------------- |
| **Frontend**      | React 19              | UI components           |
| **Web Framework** | Next.js 16            | SSR, API routes         |
| **Desktop**       | Tauri 2.9             | Cross-platform desktop  |
| **Backend**       | Node.js 22            | Express services        |
| **Database**      | PostgreSQL (Supabase) | Primary data store      |
| **Cache**         | Redis (Upstash)       | Rate limiting, sessions |
| **Local DB**      | SQLite                | Desktop offline storage |
| **Hosting**       | Vercel                | Web app hosting         |
| **CDN**           | Vercel Edge           | Global content delivery |
| **Auth**          | Supabase Auth         | User authentication     |
| **Payments**      | Stripe                | Subscription billing    |
| **Monitoring**    | Sentry                | Error tracking          |
| **CI/CD**         | GitHub Actions        | Automated pipelines     |

## Cloud Services

### Vercel

**Purpose:** Web application hosting and edge network

**Features Used:**

- Serverless functions
- Edge functions
- Automatic deployments
- Preview deployments
- Custom domains
- Analytics
- Web vitals monitoring
- Cron jobs

**Configuration:**

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm --filter web build",
  "installCommand": "pnpm install",
  "outputDirectory": "apps/web/.next",
  "git": {
    "deploymentEnabled": {
      "main": true
    }
  }
}
```

**Regions:** Automatic edge deployment (global)

**Pricing:** Pro plan

- Bandwidth: 1 TB/month
- Build minutes: Unlimited
- Serverless function execution: 100GB-hrs

**Domain Configuration:**

```
Primary: agiworkforce.com
API: api.agiworkforce.com
Staging: staging.agiworkforce.com
```

**Custom Headers:**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### Supabase

**Purpose:** PostgreSQL database, authentication, and real-time subscriptions

**Features Used:**

- PostgreSQL 15
- Row Level Security (RLS)
- Authentication (JWT-based)
- Realtime subscriptions
- Storage (future)
- Edge functions (future)

**Configuration:**

**Project:** AGI Workforce Production
**Region:** US East (Ohio) - us-east-1
**PostgreSQL Version:** 15.1

**Database Resources:**

```
Instance: db-small-cpu-2-memory-4gb
CPU: 2 vCPU
Memory: 4 GB RAM
Storage: 8 GB SSD (auto-expanding)
Connection pooling: Enabled (PgBouncer)
Point-in-time recovery: 7 days
```

**RLS Policies:**

All tables have RLS enabled with granular policies:

```sql
-- Example: profiles table
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

**Backup Schedule:**

- Automatic daily backups: 7-day retention
- Point-in-time recovery: Up to 7 days
- Manual backups: On-demand via dashboard

**Connection Pooling:**

```
Mode: Transaction
Default pool size: 15
Max connections: 100
```

**Extensions Enabled:**

- `uuid-ossp`: UUID generation
- `pg_stat_statements`: Query performance
- `pg_trgm`: Text search
- `pgcrypto`: Cryptographic functions

**Monitoring:**

- Query performance dashboard
- Connection metrics
- Table size monitoring
- Slow query log

### Upstash Redis

**Purpose:** Rate limiting and caching

**Configuration:**

**Instance:** Global Redis
**Region:** Multi-region replication
**Plan:** Pay-as-you-go

**Usage:**

```typescript
// Rate limiting configuration
export const rateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: '@upstash/ratelimit',
});
```

**Endpoints:**

```
Stripe webhook: 30 requests/minute
API routes: 100 requests/minute (authenticated)
Health checks: 1000 requests/minute
```

**Fallback:** In-memory rate limiting for development

### Stripe

**Purpose:** Payment processing and subscription management

**Configuration:**

**Account:** AGI Workforce
**Mode:** Live
**Currencies:** USD

**Products:**

| Product    | Pricing                |
| ---------- | ---------------------- |
| Hobby      | $19/month or $190/year |
| Pro        | $49/month or $490/year |
| Max        | $99/month or $990/year |
| Enterprise | Custom                 |

**Webhooks:**

Endpoint: `https://agiworkforce.com/api/webhooks/stripe`

Events listened:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `checkout.session.completed`

**Security:**

- Webhook signature verification
- Idempotent event processing
- Stored in `processed_stripe_events` table

### GitHub

**Purpose:** Source control, releases, and CI/CD

**Features Used:**

- Private repositories
- GitHub Actions (CI/CD)
- GitHub Releases (desktop app distribution)
- GitHub Packages (future)
- Dependabot (security updates)

**Actions Configuration:**

Monthly minutes: 3,000 (free tier)
Storage: 500 MB (actions cache)

**Secrets Management:**

Required secrets for CI/CD:

- `GITHUB_TOKEN` (automatic)
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `VERCEL_TOKEN` (if using Vercel CLI)

### Sentry

**Purpose:** Error tracking and performance monitoring

**Configuration:**

**Organization:** AGI Workforce
**Projects:**

- agiworkforce-web
- agiworkforce-desktop
- agiworkforce-api-gateway

**Features:**

- Error tracking
- Performance monitoring
- Release tracking
- User feedback
- Source maps

**Integration:**

```typescript
Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.VITE_SENTRY_ENVIRONMENT,
  release: process.env.VITE_APP_VERSION,
  tracesSampleRate: 0.1,
  integrations: [
    new BrowserTracing(),
    new Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
```

**Alerts:**

- Error rate threshold: >10 errors/minute
- Performance degradation: P95 > 2s
- New issue detection: Immediate notification

## Infrastructure as Code

### Vercel Configuration

**File:** `apps/web/vercel.json`

```json
{
  "framework": "nextjs",
  "buildCommand": "cd ../.. && pnpm --filter web build",
  "installCommand": "cd ../.. && pnpm install",
  "headers": [...],
  "rewrites": [...],
  "crons": [...]
}
```

### Supabase Migrations

**Location:** `apps/web/supabase/migrations/`

**Management:**

```bash
# Generate migration
supabase migration new <migration_name>

# Apply migrations
supabase db push

# Rollback
supabase db reset
```

**Migration Files:**

```
migrations/
├── 20240101000000_initial_schema.sql
├── 20240115000000_add_subscriptions.sql
├── 20240120000000_add_beta_invites.sql
└── 20240125000000_add_rls_policies.sql
```

### Tauri Configuration

**File:** `apps/desktop/src-tauri/tauri.conf.json`

```json
{
  "productName": "AGI Workforce",
  "version": "1.0.4",
  "identifier": "com.agiworkforce.desktop",
  "build": {...},
  "app": {...},
  "bundle": {...},
  "plugins": {...}
}
```

### GitHub Actions Workflows

**CI Workflow:** `.github/workflows/ci.yml`

Triggers:

- Push to `main`
- Pull requests to `main`

Jobs:

- Lint
- Test (unit, integration)
- Type check
- Build web app
- Build packages
- Rust tests
- Clippy checks

**Release Workflow:** `.github/workflows/release.yml`

Triggers:

- Git tags matching `v*`
- Manual workflow dispatch

Jobs:

- Create GitHub release
- Build Tauri app (macOS, Windows, Linux)
- Code signing
- Upload artifacts
- Publish release

**E2E Tests Workflow:** `.github/workflows/e2e-tests.yml`

Triggers:

- Push to `main`, `develop`
- Pull requests
- Scheduled (nightly at 2 AM UTC)
- Manual dispatch

Jobs:

- Install dependencies
- Install Playwright
- Build frontend
- Start dev server
- Run smoke tests
- Run chat tests
- Upload test results

## Networking

### DNS Configuration

**Provider:** Vercel DNS (or Cloudflare)

**Records:**

```
A     agiworkforce.com           → Vercel IP
A     www.agiworkforce.com       → Vercel IP
CNAME api.agiworkforce.com       → cname.vercel-dns.com
CNAME staging.agiworkforce.com   → cname.vercel-dns.com

TXT   agiworkforce.com           → Vercel verification
TXT   _dmarc.agiworkforce.com    → DMARC policy
TXT   agiworkforce.com           → SPF record
```

### SSL/TLS Certificates

**Provider:** Let's Encrypt (via Vercel)

**Configuration:**

- Auto-renewal enabled
- HTTPS enforced
- HTTP → HTTPS redirect
- TLS 1.2+ required
- Strong cipher suites

### CORS Configuration

**API Routes:**

```typescript
const corsConfig = {
  origin: [
    'https://agiworkforce.com',
    'https://www.agiworkforce.com',
    'tauri://localhost',
    'http://localhost:5173', // Development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
};
```

**Services:**

```javascript
// API Gateway
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS.split(',');

// Signaling Server
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS.split(',');
```

### Load Balancing

**Web App:** Vercel handles automatic load balancing

**Backend Services:** Consider Nginx upstream for multiple instances

```nginx
upstream api_gateway {
    least_conn;
    server localhost:3000;
    server localhost:3001;
}
```

## Security

### Authentication

**Provider:** Supabase Auth

**Methods:**

- Email/password
- Magic link
- OAuth providers (Google, GitHub, etc.)

**JWT Configuration:**

```typescript
{
  algorithm: 'HS256',
  expiresIn: '1h',
  issuer: 'supabase',
  audience: 'authenticated'
}
```

### Authorization

**Row Level Security (RLS):**

All tables use RLS for fine-grained access control:

```sql
-- Users can only access their own data
CREATE POLICY "user_access"
  ON table_name
  FOR ALL
  USING (auth.uid() = user_id);

-- Service role bypasses RLS
-- Used for server-side operations
```

### Secret Management

**Development:** `.env.local` files (gitignored)

**Production:**

- Vercel: Environment variables in dashboard
- GitHub Actions: Repository secrets
- Services: Environment variables or secret management service

**Never commit:**

- API keys
- Database credentials
- Private keys
- Webhook secrets
- JWT secrets

### API Security

**Rate Limiting:**

Per endpoint via Upstash Redis:

```typescript
const limiter = rateLimit({
  interval: 60000, // 1 minute
  limit: 100, // 100 requests
  failClosed: true, // Block on Redis failure (security-critical)
});
```

**Input Validation:**

Zod schemas for all inputs:

```typescript
const checkoutSchema = z.object({
  priceId: z.string().startsWith('price_'),
  userId: z.string().uuid(),
});
```

**CSRF Protection:**

Next.js built-in CSRF protection for mutations

**SQL Injection Prevention:**

Parameterized queries via Supabase SDK

### Vulnerability Management

**Dependabot:**

Automatic dependency updates and security alerts

**npm audit:**

Regular security audits:

```bash
pnpm audit
pnpm audit fix
```

**Rust cargo audit:**

```bash
cargo audit
```

### Compliance

**GDPR:**

- User data deletion on request
- Data export functionality
- Privacy policy
- Cookie consent

**PCI DSS:**

- No card data stored
- Stripe handles all payment processing

**SOC 2:**

- Audit logs for sensitive operations
- Access controls
- Regular security reviews

## Storage

### Database Storage

**Supabase PostgreSQL:**

```
Current: 8 GB SSD
Auto-expand: Yes
Max size: 500 GB (plan limit)
Backup retention: 7 days
Point-in-time recovery: 7 days
```

**Growth estimates:**

- User profiles: ~1 KB/user
- Subscriptions: ~500 bytes/subscription
- Audit logs: ~2 KB/log entry
- Stripe events: ~5 KB/event

### Local Storage (Desktop)

**SQLite database:**

```
Location: ~/.config/agiworkforce/agiworkforce.db
Initial size: ~10 MB
Average size: ~100-500 MB
Max size: Unlimited (user disk dependent)
```

**User data:**

```
Configuration: 1-2 MB
Chat history: Variable (10-100 MB)
Cached data: Variable (up to 500 MB)
```

### Static Assets

**CDN:** Vercel Edge Network

**Asset types:**

- JavaScript bundles
- CSS files
- Images
- Fonts
- Service worker

**Caching:**

```
Immutable assets: 1 year
HTML: No cache (revalidate)
API routes: No cache
```

## CI/CD Pipeline

### GitHub Actions Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    CI Pipeline (main branch)                 │
└─────────────────────────────────────────────────────────────┘

Trigger: Push to main / Pull request
    │
    ├──▶ Checkout code
    │
    ├──▶ Install dependencies (pnpm)
    │
    ├──▶ Lint (ESLint)
    │
    ├──▶ Type check (TypeScript)
    │
    ├──▶ Test (Vitest)
    │       ├─ Unit tests
    │       └─ Integration tests
    │
    ├──▶ Build packages
    │       ├─ @agiworkforce/types
    │       ├─ @agiworkforce/utils
    │       ├─ api-gateway
    │       ├─ signaling-server
    │       └─ extension
    │
    ├──▶ Build web app (Next.js)
    │
    ├──▶ Rust tests (cargo test)
    │
    └──▶ Clippy checks (cargo clippy)
```

```
┌─────────────────────────────────────────────────────────────┐
│                Release Pipeline (version tags)               │
└─────────────────────────────────────────────────────────────┘

Trigger: Git tag v*
    │
    ├──▶ Create GitHub release (draft)
    │
    ├──▶ Build Tauri app
    │       ├─ macOS (Universal binary)
    │       │   ├─ Build ARM64
    │       │   ├─ Build x86_64
    │       │   ├─ Create DMG
    │       │   ├─ Code sign
    │       │   └─ Notarize
    │       │
    │       ├─ Windows
    │       │   ├─ Build x86_64
    │       │   ├─ Create MSI/EXE
    │       │   └─ Code sign (optional)
    │       │
    │       └─ Linux
    │           ├─ Build x86_64
    │           ├─ Create AppImage
    │           ├─ Create DEB
    │           └─ Create RPM
    │
    ├──▶ Upload artifacts to release
    │
    └──▶ Publish release
```

### Deployment Automation

**Web App:**

```
Git push to main
    │
    ├──▶ Vercel webhook triggered
    │
    ├──▶ Build on Vercel infrastructure
    │       ├─ Install dependencies
    │       ├─ Build Next.js
    │       └─ Generate static assets
    │
    ├──▶ Deploy to Edge Network
    │
    └──▶ Invalidate cache (if needed)
```

**Desktop App:**

```
Git tag v* pushed
    │
    ├──▶ GitHub Actions triggered
    │
    ├──▶ Build artifacts
    │
    ├──▶ Upload to GitHub release
    │
    └──▶ Auto-updater endpoint active
```

### Build Optimization

**Web app:**

- Tree shaking
- Code splitting
- Image optimization
- Font optimization
- Minification
- Compression (Brotli, gzip)

**Desktop app:**

- Rust release builds (optimized)
- Asset bundling
- Binary stripping
- Compression

### Build Caching

**GitHub Actions:**

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}

- uses: Swatinem/rust-cache@v2
  with:
    workspaces: apps/desktop/src-tauri
```

**Vercel:**

Automatic caching of:

- Dependencies (node_modules)
- Next.js build cache
- Image optimization cache

## Cost Management

### Monthly Cost Estimate

| Service       | Plan          | Monthly Cost             |
| ------------- | ------------- | ------------------------ |
| Vercel        | Pro           | $20                      |
| Supabase      | Pro           | $25                      |
| Upstash Redis | Pay-as-you-go | $5-10                    |
| Stripe        | Standard      | 2.9% + $0.30/transaction |
| Sentry        | Team          | $26                      |
| GitHub        | Free/Pro      | $0-4                     |
| Domain        | Annual        | ~$15/year                |
| **Total**     |               | **~$80-90/month**        |

### Cost Optimization Strategies

**Vercel:**

- Use ISR for static pages
- Optimize bundle size
- Minimize serverless function executions
- Use edge functions for static logic

**Supabase:**

- Connection pooling
- Optimize queries
- Index frequently queried columns
- Archive old data

**Upstash Redis:**

- Set TTL on cached items
- Use Redis only for essential operations
- Fallback to in-memory for non-critical

**Bandwidth:**

- Image optimization
- Compression
- CDN caching
- Lazy loading

### Resource Monitoring

**Vercel Dashboard:**

- Bandwidth usage
- Build minutes
- Function invocations
- Edge requests

**Supabase Dashboard:**

- Database size
- Connection count
- Query performance
- API requests

**Cost Alerts:**

Set up billing alerts:

- Vercel: Alert at 80% of bandwidth
- Supabase: Alert at 80% of database size
- Upstash: Alert at $20/month

## Infrastructure Maintenance

### Regular Tasks

**Daily:**

- Monitor error rates (Sentry)
- Check build status
- Review API performance

**Weekly:**

- Review database performance
- Check backup status
- Update dependencies (automated)
- Review cost reports

**Monthly:**

- Security audit
- Performance review
- Cost optimization review
- Update documentation

**Quarterly:**

- Infrastructure audit
- Disaster recovery test
- Security penetration test
- Capacity planning

### Runbooks

**Database Backup Restore:**

1. Access Supabase dashboard
2. Navigate to Database → Backups
3. Select backup date/time
4. Click "Restore"
5. Confirm restoration
6. Verify data integrity

**Service Outage Response:**

1. Check status pages (Vercel, Supabase)
2. Review error logs (Sentry)
3. Check service health endpoints
4. Restart services if needed
5. Notify users if extended outage
6. Document incident

**Emergency Rollback:**

See DEPLOYMENT.md → Rollback Procedures

### Disaster Recovery

**Recovery Time Objective (RTO):** 4 hours
**Recovery Point Objective (RPO):** 1 hour

**Backup Locations:**

- Supabase: Automated backups (7-day retention)
- GitHub: Source code (always available)
- Vercel: Previous deployments (available for rollback)

**Recovery Procedures:**

See DEPLOYMENT.md → Disaster Recovery

## Support and Escalation

### Infrastructure Issues

**L1 - Service Down:**

- Impact: All users affected
- Response: Immediate (< 15 minutes)
- Actions: Check status pages, restart services, rollback if needed

**L2 - Performance Degradation:**

- Impact: Slow response times
- Response: < 1 hour
- Actions: Check metrics, optimize queries, scale resources

**L3 - Non-Critical Issues:**

- Impact: Minimal user impact
- Response: < 4 hours
- Actions: Investigate, plan fix, deploy in next release

### Contact Information

**Service Status Pages:**

- Vercel: https://www.vercel-status.com/
- Supabase: https://status.supabase.com/
- Stripe: https://status.stripe.com/

**Support Contacts:**

- DevOps Lead: [contact]
- Database Admin: [contact]
- Security Team: [contact]
- On-call rotation: [contact]

---

**Last Updated:** 2026-01-15
**Version:** 1.0
**Maintained By:** DevOps Team

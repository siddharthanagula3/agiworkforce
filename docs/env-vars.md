# Environment Variables

This document lists all environment variables required for AGI Workforce. Variables marked as **NEW** were added this week (DAY 3 — Stream G media generation, Stream H LLM enhancements).

## Web App (apps/web)

### Supabase Integration (Required)

| Variable                        | Required | Type   | Description                                          | Example                      | Added |
| ------------------------------- | -------- | ------ | ---------------------------------------------------- | ---------------------------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | String | Supabase project URL                                 | `https://abc123.supabase.co` | -     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | String | Supabase anonymous key for client-side auth          | `eyJhbGciOiJIUzI1NiIs...`    | -     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes      | String | Supabase service role key for server-side operations | `eyJhbGciOiJIUzI1NiIs...`    | -     |
| `SUPABASE_URL`                  | Yes      | String | Supabase project URL (used in server-side code)      | `https://abc123.supabase.co` | -     |

### AI Model Providers (Optional but recommended)

| Variable            | Required | Type   | Description                                              | Example      | Added   |
| ------------------- | -------- | ------ | -------------------------------------------------------- | ------------ | ------- |
| `OPENAI_API_KEY`    | Optional | String | OpenAI API key for GPT models (DALL-E, chat completions) | `sk-...`     | -       |
| `GOOGLE_API_KEY`    | Optional | String | Google API key for Gemini and Imagen 4 models            | `AIzaSyD...` | **NEW** |
| `ANTHROPIC_API_KEY` | Optional | String | Anthropic API key for Claude models                      | `sk-ant-...` | -       |

### Media Generation Providers (Optional, NEW)

| Variable            | Required | Type   | Description                                       | Example  | Added   |
| ------------------- | -------- | ------ | ------------------------------------------------- | -------- | ------- |
| `STABILITY_API_KEY` | Optional | String | Stability AI API key for Stable Image Core v2beta | `sk-...` | **NEW** |
| `RUNWAY_API_KEY`    | Optional | String | Runway ML API key for Gen4 Turbo video generation | `...`    | **NEW** |

### Stripe Billing (Required for payments)

| Variable                | Required | Type   | Description                   | Example       | Added |
| ----------------------- | -------- | ------ | ----------------------------- | ------------- | ----- |
| `STRIPE_SECRET_KEY`     | Yes      | String | Stripe secret API key         | `sk_live_...` | -     |
| `STRIPE_WEBHOOK_SECRET` | Yes      | String | Stripe webhook signing secret | `whsec_...`   | -     |

### Next.js Application URLs

| Variable               | Required | Type   | Description                        | Example                        | Added |
| ---------------------- | -------- | ------ | ---------------------------------- | ------------------------------ | ----- |
| `NEXT_PUBLIC_APP_URL`  | Yes      | String | Public URL of the web app          | `https://app.agiworkforce.com` | -     |
| `NEXT_PUBLIC_SITE_URL` | No       | String | Public URL of the marketing site   | `https://agiworkforce.com`     | -     |
| `VERCEL_ENV`           | No       | String | Vercel environment name (auto-set) | `production`, `preview`        | -     |

### Desktop App Downloads (For update checks)

| Variable                           | Required | Type   | Description                              | Example                           | Added |
| ---------------------------------- | -------- | ------ | ---------------------------------------- | --------------------------------- | ----- |
| `NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS` | No       | String | GitHub release URL for Windows installer | `https://github.com/.../releases` | -     |
| `NEXT_PUBLIC_DOWNLOAD_URL_MAC`     | No       | String | GitHub release URL for macOS DMG         | `https://github.com/.../releases` | -     |
| `NEXT_PUBLIC_DOWNLOAD_URL_LINUX`   | No       | String | GitHub release URL for Linux AppImage    | `https://github.com/.../releases` | -     |
| `DESKTOP_GITHUB_OWNER`             | No       | String | GitHub repo owner for desktop releases   | `agiworkforce`                    | -     |
| `DESKTOP_GITHUB_REPO`              | No       | String | GitHub repo name for desktop releases    | `agiworkforce`                    | -     |
| `GITHUB_TOKEN`                     | No       | String | GitHub API token for release fetching    | `ghp_...`                         | -     |

### Enterprise & Webhooks

| Variable                  | Required | Type   | Description                                                | Example                                       | Added |
| ------------------------- | -------- | ------ | ---------------------------------------------------------- | --------------------------------------------- | ----- |
| `WORKOS_WEBHOOK_SECRET`   | No       | String | WorkOS webhook signing secret for SCIM/SSO                 | `whsec_...`                                   | -     |
| `SCIM_ADMIN_GROUP_NAMES`  | No       | String | Comma-separated list of SCIM groups that get admin access  | `admin,staff`                                 | -     |
| `SCIM_VIEWER_GROUP_NAMES` | No       | String | Comma-separated list of SCIM groups that get viewer access | `viewers,guests`                              | -     |
| `ALLOWED_ORIGINS`         | No       | String | Comma-separated CORS allowed origins                       | `https://example.com,https://app.example.com` | -     |

### LLM Monitoring (Optional SLO tracking)

| Variable                 | Required | Type   | Description                                           | Example | Added |
| ------------------------ | -------- | ------ | ----------------------------------------------------- | ------- | ----- |
| `LLM_TTFT_SLO_TARGET_MS` | No       | Number | Target time-to-first-token (TTFT) SLO in milliseconds | `1000`  | -     |
| `LLM_TTFT_SLO_BREACH_MS` | No       | Number | TTFT threshold above which to log as breach           | `2000`  | -     |

### Cron & Security

| Variable      | Required | Type   | Description                                  | Example                     | Added |
| ------------- | -------- | ------ | -------------------------------------------- | --------------------------- | ----- |
| `CRON_SECRET` | No       | String | Secret token for verifying cron job requests | `your-secret-token`         | -     |
| `NODE_ENV`    | Yes      | String | Node.js environment                          | `production`, `development` | -     |

---

## Desktop App (apps/desktop)

### Tauri Application Metadata

| Variable                             | Required           | Type   | Description                        | Example                       | Added |
| ------------------------------------ | ------------------ | ------ | ---------------------------------- | ----------------------------- | ----- |
| `TAURI_CLI_LIB_DIR`                  | No                 | String | Path to Tauri lib directory        | `src-tauri`                   | -     |
| `TAURI_SIGNING_PRIVATE_KEY`          | Yes (release only) | String | Tauri updater private key (base64) | `dW50cnVzdGVkIGNvbW1lbnQ6...` | -     |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Yes (release only) | String | Password for Tauri signing key     | `...`                         | -     |

### Supabase (Desktop-local cache)

| Variable                 | Required | Type   | Description                               | Example                      | Added |
| ------------------------ | -------- | ------ | ----------------------------------------- | ---------------------------- | ----- |
| `VITE_SUPABASE_URL`      | Yes      | String | Supabase URL for Vite frontend build      | `https://abc123.supabase.co` | -     |
| `VITE_SUPABASE_ANON_KEY` | Yes      | String | Supabase anon key for Vite frontend build | `eyJhbGciOiJIUzI1NiIs...`    | -     |

---

## Backend Services

### API Gateway (services/api-gateway)

| Variable                    | Required | Type   | Description                                           | Example                      | Added |
| --------------------------- | -------- | ------ | ----------------------------------------------------- | ---------------------------- | ----- |
| `STRIPE_SECRET_KEY`         | Yes      | String | Stripe API key for billing operations                 | `sk_live_...`                | -     |
| `SUPABASE_URL`              | Yes      | String | Supabase PostgreSQL connection                        | `https://abc123.supabase.co` | -     |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | String | Supabase service role key                             | `eyJhbGciOiJIUzI1NiIs...`    | -     |
| `JWT_SECRET`                | Yes      | String | JWT signing secret (should match Supabase JWT secret) | `...`                        | -     |
| `PORT`                      | No       | Number | Port for API gateway to listen on                     | `3001`                       | -     |

### Signaling Server (services/signaling-server)

| Variable          | Required | Type   | Description                            | Example                        | Added |
| ----------------- | -------- | ------ | -------------------------------------- | ------------------------------ | ----- |
| `PORT`            | No       | Number | Port for signaling server to listen on | `3002`                         | -     |
| `ALLOWED_ORIGINS` | No       | String | CORS origins for WebRTC signaling      | `https://app.agiworkforce.com` | -     |

---

## CI/CD Environment

### GitHub Actions Secrets

Store these as encrypted secrets in GitHub (Settings → Secrets and variables → Actions):

| Secret                               | Required      | Purpose                                 | Added |
| ------------------------------------ | ------------- | --------------------------------------- | ----- |
| `APPLE_CERTIFICATE`                  | Yes (macOS)   | Apple code signing certificate (base64) | -     |
| `APPLE_CERTIFICATE_PASSWORD`         | Yes (macOS)   | Password for Apple certificate          | -     |
| `APPLE_SIGNING_IDENTITY`             | Yes (macOS)   | Common name of signing identity         | -     |
| `APPLE_ID`                           | Yes (macOS)   | Apple ID for notarization               | -     |
| `APPLE_PASSWORD`                     | Yes (macOS)   | App-specific password for notarization  | -     |
| `APPLE_TEAM_ID`                      | Yes (macOS)   | Apple team ID                           | -     |
| `TAURI_SIGNING_PRIVATE_KEY`          | Yes (all)     | Tauri updater signing key               | -     |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Yes (all)     | Tauri signing key password              | -     |
| `SUPABASE_URL`                       | Yes (release) | Supabase project URL                    | -     |
| `SUPABASE_SERVICE_ROLE_KEY`          | Yes (release) | Supabase service role key               | -     |
| `GITHUB_TOKEN`                       | Auto          | GitHub Actions token (auto-provided)    | -     |

### CI Environment Variables

These are set automatically in CI workflows:

| Variable            | Value       | Purpose                                            |
| ------------------- | ----------- | -------------------------------------------------- |
| `CI`                | `true`      | Signals to build tools that running in CI          |
| `E2E_MOCK_SUPABASE` | `1`         | Playwright E2E: mock Supabase (deterministic)      |
| `E2E_MOCK_LLM`      | `1`         | Playwright E2E: mock LLM responses (deterministic) |
| `VITE_DEV_PORT`     | `5175`      | Port for Vite dev server during E2E tests          |
| `TAURI_DEV_HOST`    | `127.0.0.1` | Host for Tauri dev server during E2E tests         |

---

## Quick Reference: Setting Up Local Development

### 1. Clone and install:

```bash
git clone https://github.com/agiworkforce/agiworkforce.git
cd agiworkforce
pnpm install
```

### 2. Create `.env.local` in `apps/web`:

```bash
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_URL=https://your-project.supabase.co

# Billing (REQUIRED)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# AI Providers (optional)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIzaSyD...
ANTHROPIC_API_KEY=sk-ant-...

# Media Providers (NEW - optional)
STABILITY_API_KEY=sk-...
RUNWAY_API_KEY=...
```

### 3. Create `.env.local` in `apps/desktop`:

```bash
# Vite build configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4. Run development:

```bash
# Web app
cd apps/web && pnpm dev

# Desktop app
pnpm dev:desktop

# Extension
pnpm dev:extension
```

---

## Production Deployment

### Vercel (Web App)

Set these environment variables in Vercel Dashboard → Settings → Environment Variables:

- All variables from "Web App" section above (except `NEXT_PUBLIC_*` which are built-in)
- Ensure `NODE_ENV=production` (auto-set by Vercel)
- Set `VERCEL_ENV=production` for production deployments

### Fly.io (Signaling Server)

Use `fly secrets set`:

```bash
fly secrets set -a signaling-server \
  PORT=3002 \
  ALLOWED_ORIGINS="https://app.agiworkforce.com"
```

### GitHub Release Workflow

The `release-desktop.yml` workflow requires:

1. All secrets listed in "GitHub Actions Secrets" section
2. Proper git tags in format `v<VERSION>` (e.g., `v1.0.0`)
3. `NEXT_PUBLIC_*` variables set for the desktop frontend build

---

## Troubleshooting

### "API key not configured" error

- Check that the env var is set in `.env.local` (dev) or Vercel/Fly.io (prod)
- For optional keys, the app will use the first available provider
- Order of preference: Google → OpenAI → Stability (images); Runway → Google (videos)

### "Missing or invalid authorization header"

- Image/video generation endpoints require Supabase JWT in `Authorization: Bearer <token>` header
- Ensure user has active subscription (Pro tier or higher)

### Cypress/Playwright E2E failures

- Set `E2E_MOCK_SUPABASE=1` and `E2E_MOCK_LLM=1` for deterministic mocks
- These are auto-set in CI; disable for integration tests only

### Desktop app not updating

- Verify `TAURI_SIGNING_PRIVATE_KEY` and password are correctly set
- Check Supabase `releases` table has entries for the target platform
- Confirm release version matches git tag (e.g., `v1.0.5`)

---

## Change Log

### DAY 3 (Stream G - Media Generation)

- **NEW** `STABILITY_API_KEY` — Stability AI Stable Image Core v2beta
- **NEW** `RUNWAY_API_KEY` — Runway ML Gen4 Turbo video generation
- **NEW** `GOOGLE_API_KEY` — Google Imagen 4 image generation (replaces Imagen 3)
- Updated image generation endpoint: `POST /api/media/image/generate` (now supports Google, OpenAI, Stability)
- Updated video generation endpoint: `POST /api/media/video/generate` (async, returns task_id)
- Added video status polling endpoint: `GET /api/media/video/status?task_id=xxx`

### Previous

- Established core web app, desktop, and backend service env vars

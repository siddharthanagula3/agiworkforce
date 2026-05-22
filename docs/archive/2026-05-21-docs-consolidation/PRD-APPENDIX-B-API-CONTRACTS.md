# PRD V3 — Appendix B: API contracts

**Parent:** [`docs/PRD.md`](PRD.md) | **Status:** locked | **Date:** 2026-05-17

This appendix specifies every shipping endpoint surface: web HTTP API (94 endpoints across 48 namespaces), Tauri command surface (1,488 commands grouped by domain), services/api-gateway, services/signaling-server, Dispatch HMAC envelope, and the Apple 5.1.2(i) consent-modal copy.

Sources of truth:

- `apps/web/app/api/**/route.ts`
- `apps/desktop/src-tauri/src/sys/commands/**/*.rs` (151 files, `#[tauri::command]`)
- `services/api-gateway/src/**/*.ts`
- `services/signaling-server/src/index.ts`

---

## §B.1 — Auth classes

Every endpoint declares one of:

| Class            | Means                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `public`         | No auth required. Rate-limited by IP.                                    |
| `csrf`           | Public but requires X-Requested-With / double-submit CSRF token.         |
| `user-jwt`       | Supabase JWT in `Authorization: Bearer <jwt>`. RLS applies.              |
| `admin-jwt`      | User JWT + `profiles.role = 'admin'` check.                              |
| `service-role`   | `SUPABASE_SERVICE_ROLE_KEY` (server-internal only, no client surface).   |
| `webhook-hmac`   | HMAC signature in vendor-specific header.                                |
| `cron`           | `CRON_SECRET` header (Vercel Cron) — `CRON_DEV_BYPASS=1` co-flag in dev. |
| `device-pairing` | One-time-code in body.                                                   |

---

## §B.2 — Web API endpoints (94)

Grouped by namespace. Format: `VERB path → auth class | rate-limit bucket | one-line purpose`. Schemas in §B.3.

### `/api/auth`

- `POST /api/auth/sign-in → public | 'auth-login' (5/15min, failClosed)` — email/password sign-in via Supabase
- `POST /api/auth/sign-up → public | 'auth-signup' (3/h, failClosed)` — sign-up
- `POST /api/auth/sign-out → user-jwt | 'default'` — sign-out + cookie clear
- `POST /api/auth/password-reset → public | 'auth-reset' (3/h, failClosed)` — magic-link send
- `GET  /api/auth/callback → public | n/a` — OAuth callback handler
- `POST /api/auth/set-token → user-jwt | 'default'` (**W6 migrate to** `getUserClient(jwt)`) — set Supabase session cookie from JWT
- `POST /api/auth/clear-token → user-jwt | 'default'` — clear cookie
- `GET  /api/auth/desktop-token → device-pairing | 'default'` — desktop OAuth handoff
- `GET  /api/auth/sso-check → user-jwt | 'default'` (**W6 migrate to** `getUserClient(jwt)`) — SSO assertion check

### `/api/csrf`

- `GET  /api/csrf → public | 'default'` — issue session-bound CSRF token (1h expiry)

### `/api/me`, `/api/user`

- `GET  /api/me → user-jwt | 'default'` — current user profile + tier
- `GET  /api/user/[id] → user-jwt | 'default'` — public profile snippet (display name only)
- `POST /api/user/delete-account → user-jwt | 'gdpr-action' (1/h, failClosed)` — GDPR account deletion
- `POST /api/user/export → user-jwt | 'gdpr-action' (1/h)` — GDPR data export
- `POST /api/user/data → user-jwt | 'default'` — preference update

### `/api/device`

- `POST /api/device/link → user-jwt | 'device-link' (10/min, failClosed)` (**W6 migrate**) — create pairing code
- `GET  /api/device/poll → device-pairing | 'default'` (**W6 migrate**) — poll for pairing approval
- `POST /api/device/approve → user-jwt | 'default'` (**W6 migrate**) — approve a pairing code

### `/api/llm/v1` (OpenAI-compatible proxy)

- `POST /api/llm/v1/chat/completions → user-jwt | 'llm-completion' (30/min, failClosed)` — primary chat proxy; SSE stream; refunds on upstream failure
- `GET  /api/llm/v1/models → user-jwt | 'model-catalog'` — per-tier model list; Cache-Control: public, max-age=300
- `POST /api/llm/v1/audio/transcriptions → user-jwt | 'voice-transcribe' (10/min)` — Whisper / Deepgram proxy (multipart/form-data, magic-byte MIME validation, ≤25 MB cap)
- `GET  /api/llm/v1/credits/balance → user-jwt | 'default'` — current usage + budget
- `POST /api/llm/v2/chat → user-jwt | 'llm-completion'` — Vercel AI SDK v6 parallel path (opt-in via `x-use-ai-sdk: true`)
- `POST /api/llm/completion → user-jwt | 'llm-completion'` — legacy tier-gated single-shot

### `/api/models`

- `GET  /api/models → public | 'model-catalog'` — canonical model catalog from `@agiworkforce/types/models.json`; no auth required (public marketing)

### `/api/voice`

- `POST /api/voice/transcribe → user-jwt | 'voice-transcribe' (10/min)` — Whisper passthrough
- `GET  /api/voice/health → public | 'health'` — voice service health
- `POST /api/voice/token → user-jwt | 'voice-token' (60/min)` — mint ephemeral Deepgram token (TTL ≤ 60 s)

### `/api/media`

- `POST /api/media/image → user-jwt | 'media-image' (10/min)` — Imagen 4 Fast generation; tier-gated
- `POST /api/media/video → user-jwt | 'media-video' (5/min)` — Veo 3.1 Lite (Pro+) / Fast (Max); tier-gated

### `/api/chat`

- `GET    /api/chat/conversations → user-jwt | 'chat-conversation'` — list user's conversations
- `POST   /api/chat/conversations → user-jwt | 'chat-conversation'` — create
- `GET    /api/chat/conversations/[id] → user-jwt | 'chat-conversation'` — fetch one
- `PATCH  /api/chat/conversations/[id] → user-jwt | 'chat-conversation'` — update (title, archive)
- `DELETE /api/chat/conversations/[id] → user-jwt | 'chat-conversation'` — delete
- `GET    /api/chat/conversations/[id]/messages → user-jwt | 'chat-conversation'` — list messages
- `POST   /api/chat/conversations/[id]/messages → user-jwt | 'chat-conversation'` — append message

### `/api/agents`, `/api/workforce`

- `GET    /api/agents → user-jwt | 'default'` — agent registry
- `POST   /api/agents/execute → user-jwt | 'agent-execute' (20/min)` — kick off a workforce task
- `GET    /api/agents/session/[id] → user-jwt | 'default'` — current state
- `POST   /api/agents/communication → user-jwt | 'default'` — inter-agent DM
- `POST   /api/agents/collaboration → user-jwt | 'default'` — multi-agent collab kickoff
- `GET    /api/workforce/[id] → user-jwt | 'default'` — workforce task detail

### `/api/connectors`, `/api/mcp`

- `GET    /api/connectors → user-jwt | 'chat-conversation'` — list active connectors (RLS-filtered)
- `POST   /api/connectors → user-jwt | 'chat-conversation'` (CSRF) — register connector
- `DELETE /api/connectors → user-jwt | 'chat-conversation'` (CSRF) — remove
- `POST   /api/mcp → user-jwt | 'chat-conversation'` (CSRF) — discover MCP server (HTTP only; stdio routed via gateway). SSRF defended: blocks loopback / RFC 1918

### `/api/skills`, `/api/marketplace`

- `GET    /api/skills → user-jwt | 'default'` — skill catalog
- `GET    /api/skills/[name] → user-jwt | 'default'` — skill detail
- `GET    /api/marketplace → user-jwt | 'default'` — list marketplace MCP servers

### `/api/projects`, `/api/teams`, `/api/schedules`

- `GET/POST/PATCH/DELETE /api/projects` and `/api/projects/[id] → user-jwt | 'default'` — CRUD
- `GET/POST/PATCH/DELETE /api/teams` and `/api/teams/[id] → user-jwt | 'default'` — CRUD
- `GET/POST/PATCH/DELETE /api/schedules` and `/api/schedules/[id] → user-jwt | 'default'` — CRUD

### `/api/cron`

- `POST /api/cron/reset-credits → cron | n/a` — monthly credit reset (Vercel Cron). Requires `CRON_SECRET` OR `NODE_ENV=development + CRON_DEV_BYPASS=1`.

### `/api/checkout`, `/api/portal`, `/api/credit-topup`, `/api/sync-subscription`

- `POST /api/checkout → user-jwt | 'checkout' (15/min, failClosed:false)` (CSRF) — create Stripe checkout session
- `POST /api/portal → user-jwt | 'default'` (CSRF) — Stripe customer-portal redirect (server JWT verify + origin whitelist)
- `POST /api/credit-topup → user-jwt | 'checkout'` — credit pay-as-you-go
- `POST /api/sync-subscription → user-jwt | 'default'` — pull Stripe state → Supabase

### `/api/stripe-webhook`

- `POST /api/stripe-webhook → webhook-hmac | 'stripe-webhook' (100/min, failClosed:false)` — Stripe events. **runtime = 'nodejs'** (locked). Excluded from `apps/web/proxy.ts` middleware (regex). HMAC verify via `stripe.webhooks.constructEvent(body, sig, secret, 60)` (60 s replay window vs SDK 300 s default). Idempotency via `process_stripe_event_idempotent` RPC at `apps/web/app/api/stripe-webhook/lib/idempotency.ts:12-15`. Generic error response `{ error: 'Internal server error' }` (no leakage).

### `/api/webhooks`

- `POST /api/webhooks/directory-sync → webhook-hmac | 'directory-sync'` — SCIM directory sync
- `POST /api/github/webhook → webhook-hmac | 'github-webhook'` — GitHub App events (HMAC timing-safe)

### `/api/github`

- `POST /api/github/install → user-jwt | 'default'` — initiate GitHub App install
- `GET  /api/github/installations → user-jwt | 'default'` — list installations

### `/api/admin`

- `GET    /api/admin/security → admin-jwt | 'default'` — security dashboard
- `GET    /api/admin/sso → admin-jwt | 'default'` — SSO config
- `GET    /api/admin/directory-sync → admin-jwt | 'default'` — directory sync state

### `/api/control-plane`

- `GET  /api/control-plane/status → user-jwt | 'default'` — cross-surface orchestration health

### `/api/health`, `/api/diagnose`, `/api/webhook-diagnostic`, `/api/validate-webhook`

- `GET  /api/health → public | 'health' (30/min per IP)` — k8s readiness probe; DB + Stripe + env checks
- `GET  /api/diagnose → admin-jwt | 'default'` (**W6 gate to admin**) — user-facing diagnostics
- `GET  /api/webhook-diagnostic → admin-jwt | 'default'` (**W6 gate to admin**) — Stripe webhook config debug
- `GET  /api/validate-webhook → admin-jwt | 'default'` — webhook signature helper

### `/api/marketplace`, `/api/share`

- `GET  /api/share/[token] → public | 'default'` — read-only shared conversation
- `POST /api/shared → user-jwt | 'default'` (**W6 migrate to** `getUserClient(jwt)`) — create share

### `/api/waitlist` (W6 NEW)

- `POST /api/waitlist → public | 'waitlist-signup' (5/h per IP, failClosed:false)` (CSRF) — append to `waitlist_signups`

### `/api/release`, `/api/download`

- `GET  /api/releases → public | 'default'` — release manifest (versions, links)
- `GET  /api/download → public | 'download' (30/min per IP)` — installer redirect
- `GET  /api/download-beta → public | 'download'` — beta installer

### `/api/usage`

- `GET  /api/usage → user-jwt | 'default'` — current month usage breakdown

### `/api/settings`

- `GET/POST /api/settings → user-jwt | 'default'` — user preferences

### `/api/messaging`

- `POST /api/messaging/config → user-jwt | 'default'` — DM config
- `GET  /api/messaging/stats → user-jwt | 'default'` — DM stats
- `POST /api/messaging/test → user-jwt | 'default'` — test DM channel

### `/api/memory`

- `GET/POST/DELETE /api/memory → user-jwt | 'default'` — user memory sync (project memories, custom instructions)

### `/api/autotag`

- `POST /api/autotag → user-jwt | 'default'` — single message auto-tagging
- `POST /api/autotag/batch → user-jwt | 'default'` — batch

---

## §B.3 — Request / response schema highlights

### `POST /api/llm/v1/chat/completions` (OpenAI-compatible request)

```ts
// Request
{
  model: string,                            // any from /api/llm/v1/models per tier
  messages: Array<{
    role: 'system'|'user'|'assistant'|'tool',
    content: string | Array<ContentPart>,
    name?: string,                          // for 'tool' role
    tool_call_id?: string                   // for 'tool' role
  }>,
  stream?: boolean,                         // default true
  temperature?: number,                     // 0..2
  max_tokens?: number,                      // capped at PER_REQUEST_MAX_TOKENS_CEILING=16384
  tools?: Array<ToolDefinition>,
  tool_choice?: 'auto'|'none'|{ type: 'function', function: { name: string } },
  response_format?: { type: 'text'|'json_object'|'json_schema', json_schema?: ... }
}

// Response (non-stream)
{
  id: string,
  object: 'chat.completion',
  created: number,
  model: string,                            // actual served model
  choices: [{
    index: 0,
    message: { role: 'assistant', content: string|null, tool_calls?: [...] },
    finish_reason: 'stop'|'length'|'tool_calls'|'content_filter'
  }],
  usage: { prompt_tokens, completion_tokens, total_tokens }
}

// Response (stream): SSE per OpenAI spec
data: { "id":"...", "choices":[{"delta":{"content":"hello"}}] }\n\n
...
data: [DONE]\n\n

// Errors
401 { error: { type: 'authentication_error', message: '...' } }
402 { error: { type: 'insufficient_quota', message: '...' } }  // user over cap
429 { error: { type: 'rate_limit_error', message: '...' } }
500 { error: { type: 'api_error', message: 'Internal server error' } }
```

### `POST /api/checkout`

```ts
// Request (CSRF token in X-CSRF header)
{
  plan: 'hobby'|'pro'|'pro_plus'|'pro_max'|'max',
  interval: 'monthly'|'yearly',
  return_url: string
}

// Response
{ sessionId: string, url: string }

// Errors
400 { error: 'invalid_plan' }
401 { error: 'unauthorized' }
429 { error: 'rate_limited' }
```

### `POST /api/stripe-webhook`

Raw body, vendor-controlled. Verified via `stripe.webhooks.constructEvent`. Stripe Dahlia (`2026-04-22.dahlia`) event types handled:

- `checkout.session.completed` → mark subscription active in `subscriptions`
- `customer.subscription.created` / `updated` / `deleted` → mirror state
- `customer.subscription.paused` / `resumed` → state flip
- `invoice.payment_succeeded` → record in `processed_stripe_events`; allocate budget
- `invoice.payment_failed` → mark `past_due`
- `charge.refunded` → record refund event

All event handlers are idempotent via the RPC.

### `POST /api/waitlist` (W6 NEW)

```ts
// Request (CSRF token in X-CSRF header)
{
  email: string,
  intended_tier: 'hobby'|'pro'|'pro_plus'|'pro_max'|'max',
  referrer?: string,
  utm_source?: string,
  utm_medium?: string,
  utm_campaign?: string
}

// Response
200 { ok: true }
400 { error: 'invalid_email' }
409 { error: 'already_signed_up' }   // unique constraint on email
429 { error: 'rate_limited' }
```

---

## §B.4 — Tauri command surface (1,488 across 151 files)

Grouped by domain. Full list lives in `apps/desktop/src-tauri/src/sys/commands/`. PRD lists only domain-level surface.

| Domain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Approx. commands | Files                                                   | Notes                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `database`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 64               | `commands/database.rs`                                  | Conversation CRUD, message CRUD, branches, overlay events, automation history, versioning                                      |
| `browser`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 56               | `commands/browser.rs`                                   | CDP operations, tab mgmt, DOM ops, semantic search, Playwright bridge                                                          |
| `voice`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 47               | `commands/voice.rs`                                     | Whisper / Deepgram transcription, TTS, wake-word, push-to-talk, audio device mgmt                                              |
| `memory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 39               | `commands/memory.rs`                                    | Embedding upsert/search, knowledge graph, context mgmt                                                                         |
| `billing/mod.rs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 38               | `commands/billing/`                                     | Subscription, pricing, credits, usage, daily budget, spend caps                                                                |
| `marketplace`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 36               | `commands/marketplace.rs`                               | Skills discovery, install/uninstall, ratings, search, bundle mgmt                                                              |
| `git`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 36               | `commands/git.rs`                                       | Repo detection, branch mgmt, diff, blame, commit, push/pull, staging                                                           |
| `agi`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 34               | `commands/agi.rs`                                       | Agent execution, result streaming, approval workflow, checkpoint mgmt                                                          |
| `analytics`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 29               | `commands/analytics.rs`                                 | Usage telemetry, cost tracking, performance metrics                                                                            |
| `teams`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 26               | `commands/teams.rs`                                     | Team invite, member mgmt, roles, permissions, workspace sharing                                                                |
| `mcp` + `mcp_extensions` + `mcp_server` + `mcp_oauth`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 55 (combined)    | `commands/mcp*.rs`                                      | Register / connect / call tools / session mgmt / install / uninstall / enable / disable / health / OAuth                       |
| `chat/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 40+              | `commands/chat/` (8 subfiles)                           | Conversation, cloud, search, pending, branching, intent, export, share, cost, control, maintenance, compaction, send, transfer |
| `computer_use`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 19               | `commands/computer_use.rs` + `automation/computer_use/` | Action executor, screenshot, click, type, hover, scroll, keyboard, permissions                                                 |
| `dispatch_hmac`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 4                | `commands/dispatch_hmac.rs`                             | `dispatch_hmac_init`, `dispatch_hmac_verify`, `dispatch_hmac_sign`, `dispatch_hmac_reset`                                      |
| `llm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 13               | `commands/llm.rs`                                       | Model catalog, provider config, token counting, cost estimation, reasoning mode                                                |
| `master_password`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 12               | `commands/master_password.rs`                           | `setup`, `verify`, `check_status`, brute-force rate limiter                                                                    |
| `automation_enhanced`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 26               | `commands/automation_enhanced.rs`                       | Higher-level workflow primitives                                                                                               |
| `email`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 24               | `commands/email.rs`                                     | Gmail-style read/send/threads via Connectors                                                                                   |
| `artifacts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 24               | `commands/artifacts.rs`                                 | Artifact CRUD, persist, share                                                                                                  |
| `file_ops`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 22               | `commands/file_ops.rs`                                  | Filesystem read/write/delete with workspace guard                                                                              |
| `cache`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 22               | `commands/cache.rs`                                     | Local cache mgmt                                                                                                               |
| `terminal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 19               | `commands/terminal.rs`                                  | Embedded zsh/bash session                                                                                                      |
| `tutorials`, `onboarding`, `tool_confirmation`, `metrics`, `lsp`, `productivity`, `ocr`, `window`, `api`, `task_persistence`, `governance`, `document`, `agi_checkpoint`                                                                                                                                                                                                                                                                                                                                                                                                               | 14-20 each       | various                                                 | feature-specific                                                                                                               |
| `notifications`, `shortcuts`, `scheduler`, `canvas`, `hooks`, `skills`, `mcpb`, `code_editing`, `cloud`, `templates`, `settings_v2`, `prompt_enhancement`, `notification_center`, `intent`, `dotfile`, `subscription`, `screen_watcher`, `realtime`, `capture`, `ai_native`, `agent`, `process_reasoning`, `ollama`, `native_messaging`, `design`, `background_llm`, `background_tasks`, `swarm`, `security`, `knowledge`, `file_watcher`, `extension`, `code_search`, `checkpoints`, `research`, `projects`, `project_context`, `operations`, `vision`, `thinking`, `error_reporting` | 6-13 each        | various                                                 | feature-specific                                                                                                               |
| `auth`, `settings`, `migrations`, `media`, `feedback`, `debugging`, `daily_budget`, `custom_agents`, `continuous_job_runner`, `connector_permissions`, `config_hierarchy`, `completion`, `capabilities`, `tray`, `interactive`, `code_execution`, `system_permissions`, `test_runner`, `ecosystem`, `custom_instructions`                                                                                                                                                                                                                                                              | 1-4 each         | various                                                 | bootstrap / singleton                                                                                                          |

**Conventions:**

- All commands are async (`tokio::main` runtime).
- All commands return `Result<T, AGIError>` where `AGIError` is a structured error type (`apps/desktop/src-tauri/src/sys/error.rs`).
- All commands tagged `#[tauri::command]` are exposed to frontend; un-tagged helpers are internal.
- Commands that mutate database state must be in a transaction (`async_sqlite.rs::transaction`).
- Commands that touch the network must respect the network policy (default deny; opt-in via `NetworkPolicy::Allow`).

---

## §B.5 — services/api-gateway endpoints

Express 5.2 host, Fly.io deploy. Bridges desktop ↔ web for shared concerns.

| Route                                 | Verb     | Auth            | Purpose                                        |
| ------------------------------------- | -------- | --------------- | ---------------------------------------------- |
| `/auth/*`                             | various  | varies          | Auth flows backing Web's `/api/auth/*`         |
| `/desktop/*`                          | various  | desktop pairing | Desktop-bridge handlers                        |
| `/mobile/*`                           | various  | user JWT        | Mobile-specific endpoints                      |
| `/device-auth/*`                      | POST/GET | device pairing  | OAuth handoff                                  |
| `/sync/*`                             | various  | user JWT        | Local↔Cloud sync                               |
| `/credits/*`                          | GET      | user JWT        | Credit balance                                 |
| `/usage/*`                            | GET      | user JWT        | Usage rollup                                   |
| `/model-catalog`                      | GET      | public          | Cached `models.json`                           |
| `/llm/*`                              | POST     | user JWT        | LLM proxy (mirrors Web `/api/llm/v1/*`)        |
| `/cloud-chat/*`                       | POST     | user JWT        | Cloud-chat path (Desktop WebRuntime hits this) |
| `/provider-stream/*`                  | POST     | user JWT        | Provider streaming bridge                      |
| `/provider-health/*`                  | GET      | public          | Per-provider health                            |
| `/agents/*`                           | various  | user JWT        | Agent registry / dispatch                      |
| `/chat/*`                             | various  | user JWT        | Chat ops                                       |
| `/pair/*`                             | POST     | device pairing  | Pairing-code exchange                          |
| `/dotfile/*`                          | various  | user JWT        | Cross-device dotfile sync                      |
| `/mcp/{tools,resources,capabilities}` | GET      | user JWT        | MCP server discovery                           |

**Middleware (6):** auth (JWT verify), requestValidation (CSRF + Content-Type), errorHandler + pino, rateLimit (per-route; multi-instance Redis warned at boot), asyncHandler (Express async wrapping), planGate (feature-flag / plan-tier gating).

**WebSocket:** at `/ws`. Realtime fan-out (Supabase change feeds), chat streaming, voice/video signaling (WebRTC offer/answer/ICE), Dispatch pairing codes.

---

## §B.6 — services/signaling-server endpoints

WebRTC signaling for pairing + ICE relay (mobile↔desktop session sync; not peer-to-peer chat).

| Route                            | Verb      | Auth                             | Rate-limit     |
| -------------------------------- | --------- | -------------------------------- | -------------- |
| `POST /pairings`                 | POST      | `SIGNALING_INTERNAL_SECRET` HMAC | 10/min         |
| `GET /pairings/:code`            | GET       | session token                    | 60/min         |
| `DELETE /pairings/:code`         | DELETE    | session token                    | 10/min         |
| `GET /health`, `/ready`, `/live` | GET       | public                           | —              |
| `GET /metrics`                   | GET       | admin API key                    | —              |
| `GET /admin/status`              | GET       | admin API key                    | —              |
| `POST /admin/blacklist`          | POST      | admin API key                    | —              |
| `WS /ws`                         | WebSocket | session token                    | 100 msg/IP/min |

Constraints: `MAX_MESSAGE_SIZE_BYTES` enforced, `MAX_SDP_SIZE` enforced, Zod input validation, session-expiry auto-cleanup, per-IP connection limits, constant-time secret compare, OWASP security headers.

---

## §B.7 — Apple 5.1.2(i) BYOK consent modal copy

Locked. Renders in iOS / iPadOS onboarding before the provider-key form is unlocked. Web shows an equivalent banner pre-key-add.

### Modal — title

**Connecting to AI providers**

### Modal — body (paragraphs)

When you add a provider key (Anthropic, OpenAI, Google, or others), AGI sends your prompts, attachments, and conversation content to that provider so they can generate a response.

Each provider stores and processes your data under their own terms. We don't see the contents of your messages or attachments when you use your own keys.

We list every provider you can connect, with a direct link to their privacy policy, on the next screen.

### Modal — provider table (rendered scrollable)

| Provider          | Privacy policy                                                                   | Data sent                             |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| Anthropic         | [anthropic.com/legal/privacy](https://anthropic.com/legal/privacy)               | Messages, attachments, system prompts |
| OpenAI            | [openai.com/policies/privacy-policy](https://openai.com/policies/privacy-policy) | Messages, attachments, system prompts |
| Google            | [policies.google.com/privacy](https://policies.google.com/privacy)               | Messages, attachments, system prompts |
| xAI               | [x.ai/legal/privacy-policy](https://x.ai/legal/privacy-policy)                   | Messages, attachments, system prompts |
| DeepSeek          | [deepseek.com/privacy](https://deepseek.com/privacy)                             | Messages, attachments                 |
| Perplexity        | [perplexity.ai/privacy](https://perplexity.ai/privacy)                           | Messages, search queries              |
| Moonshot (Kimi)   | [moonshot.cn/privacy](https://moonshot.cn/privacy)                               | Messages                              |
| Zhipu (GLM)       | [zhipu.ai/privacy](https://zhipu.ai/privacy)                                     | Messages                              |
| Mistral           | [mistral.ai/privacy-policy](https://mistral.ai/privacy-policy)                   | Messages                              |
| Ollama (Local)    | n/a — runs on your device                                                        | nothing leaves your device            |
| LM Studio (Local) | n/a — runs on your device                                                        | nothing leaves your device            |
| Custom endpoint   | per your endpoint operator's policy                                              | per your endpoint operator's policy   |

### Modal — controls

- Primary CTA: **I understand and accept** — large solid button. Tap fires `onAccept` and proceeds to provider-key form.
- Secondary: **Cancel** — text link. Tap dismisses the modal; user remains on the previous screen.
- Tertiary: **Read the AGI privacy policy** — link out to `agiworkforce.com/privacy`.

### Modal — telemetry

Fire `byok_consent_modal_shown` and `byok_consent_modal_accepted` (or `_canceled`) events. No payload includes the user's email or any provider names — just the event.

### Modal — e2e Detox test (acceptance criterion)

1. Launch fresh install on iOS simulator.
2. Tap "Add provider key" before consent — assert the modal renders.
3. Tap "Cancel" — assert key form remains locked.
4. Re-open modal, tap "I understand and accept" — assert `byok_consent_modal_accepted` fires + key form unlocks.
5. Force-quit app, re-open, navigate to "Add provider key" — assert modal does **not** re-prompt within 30 days. (Persist consent in Keychain `byok_consent_accepted_at`.)

---

## §B.8 — Rate-limit buckets (canonical list)

All buckets implemented in `apps/web/lib/rate-limit.ts`. Upstash Redis primary; in-memory fallback (Map, 60s cleanup, 10K-entry cap).

| Bucket                     | Limit          | Fail mode   | Notes                                |
| -------------------------- | -------------- | ----------- | ------------------------------------ |
| `default`                  | 60 /min        | fail-open   | Generic. Auth'd routes.              |
| `auth-login`               | 5 /15min       | fail-closed | Credential stuffing                  |
| `auth-signup`              | 3 /h           | fail-closed | Spam                                 |
| `auth-reset`               | 3 /h           | fail-closed | Magic-link abuse                     |
| `auth-verify`              | 10 /min        | fail-closed | OTP brute                            |
| `device-link`              | 10 /min        | fail-closed | Pairing code abuse                   |
| `checkout`                 | 15 /min        | fail-open   | Stripe checkout                      |
| `claim-offer`              | 3 /h           | fail-closed | Coupon abuse                         |
| `llm-completion`           | 30 /min        | fail-closed | LLM proxy                            |
| `voice-transcribe`         | 10 /min        | fail-open   | Whisper / Deepgram                   |
| `voice-token`              | 60 /min        | fail-open   | Ephemeral Deepgram token mint        |
| `media-image`              | 10 /min        | fail-open   | Imagen                               |
| `media-video`              | 5 /min         | fail-open   | Veo                                  |
| `model-catalog`            | 60 /min        | fail-open   | `/api/models` + `/api/llm/v1/models` |
| `chat-conversation`        | 60 /min        | fail-open   | Conversation CRUD + Connectors + MCP |
| `gdpr-action`              | 1 /h           | fail-closed | Account delete / export              |
| `stripe-webhook`           | 100 /min       | fail-open   | Webhook receiver                     |
| `directory-sync`           | 30 /min        | fail-open   | SCIM                                 |
| `github-webhook`           | 60 /min        | fail-open   | GitHub events                        |
| `health`                   | 30 /min per IP | fail-open   | Readiness probe                      |
| `download`                 | 30 /min per IP | fail-open   | Installer redirect                   |
| `waitlist-signup` (W6 NEW) | 5 /h per IP    | fail-open   | Pre-graduation funnel                |
| `agent-execute`            | 20 /min        | fail-open   | Workforce kickoff                    |

Identifier priority: explicit ID → JWT `sub` → `x-real-ip` → rightmost `x-forwarded-for` → `'unknown'`.

---

## §B.9 — Error code lexicon

All HTTP error responses use the shape:

```ts
{ error: { type: string, message: string, retry_after?: number } }
```

Canonical types:

| Type                   | HTTP | Meaning                                 |
| ---------------------- | ---- | --------------------------------------- |
| `authentication_error` | 401  | Missing / invalid JWT                   |
| `permission_denied`    | 403  | RLS or tier denies                      |
| `not_found`            | 404  | Resource absent                         |
| `conflict`             | 409  | Idempotency / unique constraint         |
| `validation_error`     | 400  | Body / query failed schema              |
| `rate_limit_error`     | 429  | Bucket exceeded (`retry_after` set)     |
| `insufficient_quota`   | 402  | User over tier cap                      |
| `csrf_error`           | 403  | CSRF token missing / invalid            |
| `provider_error`       | 502  | Upstream LLM provider failure           |
| `api_error`            | 500  | Generic server error (no leaked detail) |

---

_End of Appendix B. See [Appendix C](PRD-APPENDIX-C-MONOREPO-LAYOUT.md) for the monorepo layout, build commands, and CI workflow contracts._

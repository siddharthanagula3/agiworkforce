# Section 7 — Non-Functional Requirements & Technical Debt

> PRD: AGI Workforce — Open Model-Agnostic AI Desktop Platform
> Section: 7 of 8
> Last updated: 2026-02-26
> Status key: Implemented | Partial | Planned | Blocked

---

## 7.1 Performance Requirements

### 7.1.1 Streaming & Latency

**NFR-01** — P0 — Implemented

| Metric | Target | Breach Threshold | Monitoring |
|---|---|---|---|
| LLM stream TTFT (Time to First Token) | 2,500ms | 5,000ms | `/api/llm/v1/chat/completions` SLO |
| Streaming connection timeout | 300s | — | Was 60s; extended to handle long tool loops |
| Follow-up invoke timeout | 120s | — | Was 60s |
| Streaming tool loop total | 600s | — | Was 180s |
| WebSocket keepalive interval | 30s | — | Prevents proxy timeouts |
| DB busy timeout | 5,000ms | — | SQLite WAL contention guard |

Environment variables controlling SLO thresholds:
- `LLM_TTFT_SLO_TARGET_MS` — target TTFT in milliseconds
- `LLM_TTFT_SLO_BREACH_MS` — breach alert threshold in milliseconds

**NFR-02** — P0 — Implemented — SSE keepalive messages sent on streaming connections to prevent `stream_watchdog_timeout` surfacing to users. Image generation path still does not use SSE keepalive (gap; see DEBT-01).

**NFR-03** — P1 — Implemented — LRU response cache for LLM completions: 512 entries, 24h TTL. Reduces redundant API calls on repeated identical prompts.

### 7.1.2 UI Responsiveness

**NFR-04** — P1 — Planned — UI interaction targets (not yet formally benchmarked):

| Interaction | Target |
|---|---|
| App cold start (Tauri) | < 3s to interactive |
| Settings panel open | < 100ms |
| Chat message render (streaming) | Token-by-token, < 50ms latency per chunk |
| Tool approval modal display | < 200ms after tool invocation |

**NFR-05** — P2 — Partial — localStorage quota risk for large conversation histories in Zustand persist store. No enforcement of quota limits; risk of silent data loss on low-disk devices (see DEBT-10).

---

## 7.2 Scalability Requirements

**NFR-06** — P1 — Partial

| Dimension | Current Limit | Target | Status |
|---|---|---|---|
| Concurrent sub-agents (swarm) | 100 | 100 | Implemented |
| Background agents | MAX_BACKGROUND_AGENTS (configurable) | Unbounded | Implemented |
| Sync batch size (offline queue) | 100 items | 100 items | Implemented |
| Command queue per device | 100, 5-min TTL | — | Implemented |
| Pairing session rehydrations | 1,000 concurrent | — | Implemented |
| API gateway rate limiting | In-memory, single-instance | Redis-backed, multi-instance | Partial |
| Supabase RLS performance | Cached `auth.uid()` | Indexed lookups | Implemented |
| SQLite concurrent reads | WAL mode | WAL mode | Implemented |
| LLM ID mapping cap | 1,000 (STR-002 fix) | — | Implemented |

**NFR-07** — P1 — Partial — API gateway rate limiting uses in-memory storage. In a horizontally scaled deployment (multiple gateway instances), rate limits are not shared across instances. Redis integration required before multi-region production deployment (see DEBT-07).

**NFR-08** — P2 — Planned — Multi-agent swarm task decomposer (`core/swarm/task_decomposer.rs:408`) is not idempotent. Duplicate task submissions under network retry scenarios can result in double execution. SHA-256 content hash cache (1h TTL) partially mitigates this but does not fully eliminate the race.

---

## 7.3 Reliability Requirements

**NFR-09** — P0 — Implemented

| Mechanism | Detail |
|---|---|
| LLM provider circuit breaker | `record_success()` / `record_server_error()` per provider |
| Provider failover chain | Automatic fallback across configured LLM providers |
| Kill switch (auth) | Fails closed (HTTP 503) on DB error — no access granted on failure |
| Supabase session refresh | Auto-refresh before expiry |
| Ed25519 update signing | Desktop update verified before install |
| Idempotency keys (billing) | Credit deductions deduplicated via `credit_accounts.idempotency_keys` |
| Task persistence | `PersistentTask` + `TaskCheckpoint` for resumable agent sessions |
| Stripe webhook idempotency | `processed_stripe_events` table deduplicates webhook replays |
| Constant-time auth | Timing attack prevention on password compare |

**NFR-10** — P1 — Implemented — Browser extension native messaging reconnect: exponential backoff (base 1s, max 30s, 8 attempts) on host disconnect.

**NFR-11** — P1 — Partial — Extension bridge non-tool message paths (UI events, non-structured messages) do not go through the EXECUTE_SCRIPT preflight check. Mitigation: tool-path coverage is complete; non-tool paths have lower risk surface (see DEBT-09).

**NFR-12** — P1 — Partial — Task decomposer idempotency (SHA-256 hash, 1h TTL) partially mitigates but does not fully eliminate duplicate swarm task creation under retry (see NFR-08 and DEBT-08).

---

## 7.4 Testing Requirements

**NFR-13** — P0 — Implemented

| Suite | Technology | Current State |
|---|---|---|
| Unit (TypeScript) | Vitest | 820+ tests passing on CI |
| Unit (Rust) | cargo test | All non-platform-specific tests pass |
| End-to-end | Playwright | Smoke tests + self-healing; 2 retries; 1 worker |
| E2E mocking | Environment flags | `E2E_MOCK_SUPABASE=1`, `E2E_MOCK_LLM=1` |
| Linting (Rust) | cargo clippy | `-D warnings -D unsafe-code` enforced |
| Linting (TS) | ESLint | Max 5 warnings allowed |
| Security scanning | cargo audit, pnpm audit | `--audit-level=high` on pnpm |

**NFR-14** — P1 — Partial — Credits / billing domain has minimal test coverage. Critical path (charge, deduct, refund) not covered by unit tests. Risk: billing logic regressions ship silently (see DEBT-05).

**NFR-15** — P1 — Needs Human — `features.test.ts` is a 64KB monolithic test file (C3 from CodeRabbit audit). Difficult to maintain, slow to run in isolation, and prone to test order dependency. Requires human-led decomposition into domain-scoped test files.

**NFR-16** — P2 — Planned — Platform-specific Rust tests (enigo, AutomationService) are skipped in CI. They require physical display or Windows/macOS runners. No strategy yet for automated cross-platform GUI test execution.

---

## 7.5 Build, CI/CD & Release Requirements

**NFR-17** — P0 — Implemented

Three GitHub Actions workflows:

| Workflow | File | Steps |
|---|---|---|
| CI | `ci.yml` | lint → typecheck → test → build all → cargo audit → cargo clippy → Playwright e2e |
| Desktop release | `release-desktop.yml` | validate → build 5 platforms → sign → notarize → GitHub Release |
| Signaling server deploy | `deploy-signaling-server.yml` | test → Docker build → deploy → health check |

**NFR-18** — P0 — Implemented — Conventional commits enforced by commitlint:
- Header max 100 characters
- Subject must be lowercase
- Scopes validated against allowed list
- Enforced via Husky pre-commit hook

**NFR-19** — P1 — Implemented — Git hooks (lint-staged on pre-commit): ESLint --fix + Prettier applied to staged TypeScript files before commit.

**NFR-20** — P1 — Implemented — Multi-platform desktop build matrix:
- macOS universal (aarch64 + x86_64), signed + notarized
- Windows x64
- Linux AppImage

**NFR-21** — P1 — Partial — `TAURI_SIGNING_PRIVATE_KEY` is potentially logged to CI output on release build error (CodeRabbit C1, `release-desktop.yml:286`). Key material could appear in GitHub Actions log artifacts. Fix: wrap signing step in error handler that suppresses env dump (see DEBT-04).

---

## 7.6 Observability Requirements

**NFR-22** — P2 — Partial

| Signal | Current State | Gap |
|---|---|---|
| LLM TTFT SLO | Monitored via env-configured thresholds | No dashboard or alerting wired |
| Desktop audit log | HMAC-signed SQLite entries | Not shipped to central logging |
| Web security audit | Supabase service-role table | No SIEM integration |
| Error surfaces | `FriendlyError` + `FRIENDLY_ERROR_MESSAGES` | Raw errors still shown on some paths |
| Streaming errors | `stream_watchdog_timeout` suppressed | Image gen path still surfaces raw error |

**NFR-23** — P2 — Planned — Centralized observability pipeline (structured logs, metrics, traces) not implemented. Required for production SLO tracking, on-call alerting, and customer-facing status page.

---

## 7.7 Environment Variables Registry

**NFR-24** — P1 — Implemented — Complete list of required environment variables by deployment context:

**Web App (`apps/web`):**

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anonymous key |
| SUPABASE_SERVICE_ROLE_KEY | Server-side Supabase admin access |
| OPENAI_API_KEY | OpenAI API authentication |
| GOOGLE_API_KEY | Google AI / Gemini API authentication |
| ANTHROPIC_API_KEY | Anthropic Claude API authentication |
| STABILITY_API_KEY | Stability AI image generation |
| RUNWAY_API_KEY | Runway video generation |
| STRIPE_SECRET_KEY | Stripe server-side billing |
| STRIPE_WEBHOOK_SECRET | Stripe webhook HMAC validation |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Stripe client-side key |
| NEXT_PUBLIC_APP_URL | Canonical app URL |
| NEXT_PUBLIC_SITE_URL | Public site URL for redirects |
| UPSTASH_REDIS_REST_URL | Redis REST API URL |
| UPSTASH_REDIS_REST_TOKEN | Redis REST API token |
| CRON_SECRET | Internal cron job authentication |
| NODE_ENV | Runtime environment (development/production) |
| WORKOS_WEBHOOK_SECRET | WorkOS SSO webhook validation |
| LLM_TTFT_SLO_TARGET_MS | TTFT SLO target (default: 2500) |
| LLM_TTFT_SLO_BREACH_MS | TTFT SLO breach alert (default: 5000) |
| NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS | Desktop installer URL for Windows |
| NEXT_PUBLIC_DOWNLOAD_URL_MAC | Desktop installer URL for macOS |
| NEXT_PUBLIC_DOWNLOAD_URL_LINUX | Desktop installer URL for Linux |
| DESKTOP_GITHUB_OWNER | GitHub org for desktop release artifacts |
| DESKTOP_GITHUB_REPO | GitHub repo for desktop release artifacts |

**Desktop App (`apps/desktop`):**

| Variable | Purpose |
|---|---|
| TAURI_SIGNING_PRIVATE_KEY | Ed25519 private key for update signing |
| TAURI_SIGNING_PRIVATE_KEY_PASSWORD | Password for signing key |
| VITE_SUPABASE_URL | Supabase URL injected at frontend build time |
| VITE_SUPABASE_ANON_KEY | Supabase anon key injected at frontend build time |

**API Gateway (`services/api-gateway`):**

| Variable | Purpose |
|---|---|
| JWT_SECRET | HS256 JWT signing secret |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Supabase anonymous key |
| PORT | HTTP listener port |

**Signaling Server:**

| Variable | Purpose |
|---|---|
| PORT | WebSocket server port |
| ALLOWED_ORIGINS | CORS allowlist (comma-separated) |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Service-role key for session auth |

---

## 7.8 Technical Debt Register

The following items are tracked as known technical debt. Priority and effort are estimated relative to each other.

---

**DEBT-01** — P0 — Image generation streaming path does not use SSE keepalive

- **Domain:** LLM streaming / media generation
- **Impact:** `stream_watchdog_timeout` error surfaces to user on long image generation requests. Identified as a critical product quality issue (zero-visible-errors policy).
- **Root cause:** Image gen route uses a different HTTP client path that does not emit SSE keepalives during generation wait.
- **Fix:** Refactor image gen path to use the same streaming HTTP client as chat completions, or emit synthetic SSE keep-alive pings during polling.
- **Status:** Blocked (requires Rust streaming path refactor; write to `docs/rust-fixes-needed.md` before touching)
- **Effort:** Medium

---

**DEBT-02** — P1 — Model catalog source-of-truth drift between TypeScript and Rust

- **Domain:** LLM routing / model catalog
- **Impact:** 6 known mismatches between `src/constants/llm.ts` (TypeScript) and `core/llm/provider_adapter.rs` (Rust). Mismatched model IDs cause routing failures for specific model versions.
- **Root cause:** Model catalog maintained in two separate files with no automated sync check.
- **Fix (TODO #14, #15):** Introduce a single canonical model ID file (JSON or TOML) as the source of truth; generate both TypeScript and Rust constants from it at build time.
- **Status:** Open
- **Effort:** Medium

---

**DEBT-03** — P1 — Cost cap not enforced on direct LLM callers

- **Domain:** Billing / LLM routing
- **Impact:** Callers that invoke the LLM provider directly (bypassing the standard router) do not have the $50 session cost cap applied. A runaway agent could exceed budget silently.
- **Root cause:** Cost cap enforcement lives in the router middleware; direct callers skip middleware.
- **Fix:** Move cost cap check to the provider adapter layer (invoked for all callers), or add a compile-time lint that disallows direct provider calls outside the router.
- **Status:** Open
- **Effort:** Small

---

**DEBT-04** — P0 — CI may log signing private key on build error

- **Domain:** CI/CD security
- **Impact:** `TAURI_SIGNING_PRIVATE_KEY` could appear in GitHub Actions log output if the signing step in `release-desktop.yml:286` exits with an error and the runner dumps environment state.
- **Root cause:** Error handler in release workflow does not suppress environment variable logging.
- **Fix (CodeRabbit C1):** Wrap the signing invocation in an error handler that explicitly masks the key variable. Add `TAURI_SIGNING_PRIVATE_KEY` to the GitHub Actions secret masking list.
- **Status:** Pending
- **Effort:** Small

---

**DEBT-05** — P1 — Billing / credits domain has near-zero test coverage

- **Domain:** Billing
- **Impact:** Charge, deduct, refund, and credit-cap enforcement logic ships without unit test coverage. Billing regressions are not caught before production.
- **Root cause:** Billing was added rapidly; test scaffolding was not prioritized.
- **Fix:** Add unit tests for `billing_customers`, `billing_subscriptions`, `credit_accounts` mutations and the `handle_refund` RPC. Mock Stripe client.
- **Status:** Open
- **Effort:** Medium

---

**DEBT-06** — P1 — .env files absent from Tauri filesystem deny list

- **Domain:** Security / Tauri capabilities
- **Impact:** A malicious or misconfigured tool agent could read `.env`, `.env.local`, or `.env.production` from the working directory, exfiltrating API keys and secrets.
- **Root cause:** `capabilities/default.json` deny list was built targeting system paths; project-relative secret files were overlooked (TODO #16).
- **Fix:** Add `**/.env`, `**/.env.*`, `**/.env.local`, `**/.env.production` to both the read and write deny lists in `capabilities/default.json`.
- **Status:** Planned
- **Effort:** Trivial

---

**DEBT-07** — P1 — API gateway rate limiting is in-memory and not shared across instances

- **Domain:** API gateway / scalability
- **Impact:** In a horizontally scaled deployment, each gateway instance maintains its own rate limit counters. A client can exceed global rate limits by distributing requests across instances.
- **Root cause:** Rate limiter uses in-memory storage by design for simplicity; Redis integration deferred.
- **Fix:** Replace in-memory rate limit store with Upstash Redis (credentials already in environment as `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- **Status:** Planned
- **Effort:** Small

---

**DEBT-08** — P1 — Swarm task decomposer is not fully idempotent

- **Domain:** Multi-agent swarm
- **Impact:** Under network retry conditions, the same task can be submitted multiple times, resulting in duplicate agent executions, double tool invocations, and inconsistent state.
- **Root cause:** `core/swarm/task_decomposer.rs:408` performs task decomposition on every submission without a durable deduplication check.
- **Fix:** Store task fingerprint (SHA-256 of task spec + parent context) in SQLite `agi_task_checkpoints` on first decomposition. On retry, detect existing fingerprint and return existing task tree instead of re-decomposing.
- **Status:** Partial (1h in-memory cache applied as mitigation; persistent deduplication not done)
- **Effort:** Medium

---

**DEBT-09** — P2 — Browser extension non-tool message paths skip preflight

- **Domain:** Browser extension security
- **Impact:** Non-tool extension messages (UI event relay, custom DOM reads) bypass the EXECUTE_SCRIPT preflight check that validates operation safety. Lower risk surface than tool paths, but inconsistent security posture.
- **Root cause:** Preflight check was applied only to tool-dispatched operations during initial implementation.
- **Fix:** Apply the same origin validation and operation allowlist check to all extension-to-native-host messages, not only tool-dispatched ones.
- **Status:** Partially resolved
- **Effort:** Small

---

**DEBT-10** — P2 — localStorage quota risk in Zustand persist store

- **Domain:** Frontend state management
- **Impact:** Large conversation histories serialized into localStorage can silently fail when the browser's 5MB quota is exceeded, causing data loss or store corruption.
- **Root cause:** Zustand persist middleware uses localStorage with no size guard or fallback.
- **Fix:** Implement `storageFallback.ts` with quota detection. Migrate large payloads (conversation history, memory) to IndexedDB with graceful degradation.
- **Status:** Open (storageFallback.ts file created but not wired into persist middleware)
- **Effort:** Medium

---

**DEBT-11** — P2 — SCIM 2.0 provisioning fields exist but no SCIM endpoints are implemented

- **Domain:** Enterprise / identity
- **Impact:** Enterprise customers requiring automated user provisioning via Okta, Azure AD, or other IdPs cannot be served. SCIM fields were added to the database (migration `20260224000001_add_scim_fields.sql`) in anticipation of implementation, but no API endpoints handle SCIM requests.
- **Root cause:** SCIM endpoint work was deferred after DB field migration.
- **Fix:** Implement `GET/POST/PUT/DELETE /scim/v2/Users` and `GET/POST /scim/v2/Groups` endpoints on the API gateway. Integrate with WorkOS SCIM or implement RFC 7643/7644 directly.
- **Status:** Planned
- **Effort:** Large

---

**DEBT-12** — P2 — Audit logs are fragmented, not immutable, and not aggregated

- **Domain:** Compliance / security
- **Impact:** Three separate audit systems (desktop HMAC-signed log, desktop event log, Supabase security_audit_logs) cannot be queried together. No SIEM export. Supabase logs are pruned at 90 days. Not suitable for SOC 2 or ISO 27001 audit evidence.
- **Root cause:** Audit logging was added incrementally per component without a unified design.
- **Fix:** Design a unified audit event schema. Stream all audit events (desktop + web) to an append-only log (e.g., S3 + Athena, or a dedicated audit log service). Enforce immutability via write-once policy.
- **Status:** Planned
- **Effort:** Large

---

**DEBT-13** — P2 — Provider model catalogs are stale

- **Domain:** LLM routing / model catalog
- **Impact:** Model IDs in the catalog may not match current provider offerings (TODO #1). Users see outdated model names in dropdowns; routing may silently fall back.
- **Root cause:** Model catalog is a static file; no automated refresh mechanism.
- **Fix (TODO #1):** Implement a scheduled catalog refresh job that fetches live model lists from provider APIs (OpenAI `/models`, Anthropic `/models`, etc.) and patches the catalog. Add model-not-found fallback logging.
- **Status:** Open
- **Effort:** Medium

---

**DEBT-14** — P2 — Extension orchestration not wired into AGI planner

- **Domain:** Browser extension / agent planner
- **Impact:** The browser extension can execute isolated DOM operations, but these operations are not visible to or coordinated by the AGI planner. Multi-step web automation tasks require manual orchestration (FIXME #2).
- **Root cause:** Extension was built as a standalone module; planner integration was deferred.
- **Fix:** Add extension action events to the AGI planner event bus. Allow the planner to issue extension tasks as first-class actions alongside tool calls.
- **Status:** Open
- **Effort:** Large

---

**DEBT-15** — P3 — Features test file is a 64KB monolith

- **Domain:** Testing
- **Impact:** `features.test.ts` (64KB) is slow, difficult to maintain, and creates brittle test order dependencies. CI runs the entire file as a unit, making targeted re-runs impractical (CodeRabbit C3).
- **Root cause:** Feature tests were accumulated in a single file over time without domain-based decomposition.
- **Fix:** Split `features.test.ts` into per-domain test files (e.g., `chat.test.ts`, `tools.test.ts`, `billing.test.ts`). Requires human-led refactor to avoid breaking test interdependencies.
- **Status:** Needs Human
- **Effort:** Large

---

**DEBT-16** — P3 — Model behavior normalization for thinking modes incomplete

- **Domain:** LLM routing
- **Impact:** Extended thinking / reasoning mode parameters differ across providers (Anthropic `thinking` block, OpenAI `o-series` params, Gemini `thinking` mode). Normalization is partial (TODO #9), causing inconsistent behavior when users switch models.
- **Root cause:** Each provider's thinking mode API diverged during rapid release cycle; normalization layer not fully built out.
- **Fix:** Complete the model behavior normalization layer in `modelRouter.ts`. Define a provider-agnostic `thinking_mode` parameter that maps to provider-specific parameters at dispatch time.
- **Status:** Partial
- **Effort:** Medium

---

## 7.9 Stabilization Health Matrix

Current system stability as of 2026-02-26:

| Domain | Status | Key Gaps |
|---|---|---|
| Chat / LLM Routing | Stable with gaps | Direct callers bypass cost cap (DEBT-03) |
| Tool Execution | Stable | Growing unit test coverage |
| Tool Approvals | Stable | requestId race condition fix verified |
| Offline / Local LLM | Stable | Ollama health check wired |
| Checkpoints / Resume | Stable | SQLite WAL mode; persistent task checkpoints |
| Auth / JWT | Stable | Argon2id, alg:none blocked, kill switch fails closed |
| Credits / Billing | Partial | Near-zero test coverage (DEBT-05) |
| Database (SQLite) | Stable | SQLCipher, repository pattern, 55 migrations |
| Database (Supabase) | Partial | Kill switch design trade-off (fails closed) |
| Prompt Injection | Stable | escape_xml applied to all tool results |
| Extension Bridge | Partial | Non-tool paths missing preflight (DEBT-09) |
| MCP Transport | Stable | 120s timeout aligned with tool loop |
| Multi-Agent Swarm | Partial | Task decomposer not fully idempotent (DEBT-08) |
| State / Store Sync | Partial | localStorage quota risk (DEBT-10) |
| Model Catalog | Partial | 6 TS/Rust mismatches (DEBT-02), stale entries (DEBT-13) |
| Security / Filesystem | Partial | .env not in deny list (DEBT-06) |
| Build / CI | Stable | 820+ tests passing; signing key log risk (DEBT-04) |
| Image Generation | Broken | stream_watchdog_timeout surfaces to user (DEBT-01) |

---

## 7.10 CodeRabbit Audit Status (as of 2026-02-26)

Total issues reviewed: 109 across 4 severity tiers.

| Severity | Total | Fixed | Pending | Needs Human |
|---|---|---|---|---|
| Critical (C) | 4 | 2 | 1 | 1 |
| High (H) | 57 | ~35 | ~10 | ~12 |
| Medium (M) | 38 | ~25 | ~8 | ~5 |
| Low (L) | 10 | ~5 | ~5 | 0 |
| **Total** | **109** | **~67** | **~24** | **~18** |

**Remaining critical issues:**

| ID | Description | Status |
|---|---|---|
| C1 | `TAURI_SIGNING_PRIVATE_KEY` potentially logged on CI error (`release-desktop.yml:286`) | Pending — see DEBT-04 |
| C3 | `features.test.ts` 64KB monolith | Needs Human — see DEBT-15 |

**Fixed critical issues:**

| ID | Description | Commit |
|---|---|---|
| C2 | Exponential backoff test missing delay assertion | Fixed |
| C4 | Stripe webhook test must validate HMAC | Fixed |

---

## 7.11 Open TODO Items

| # | Description | Priority | Status |
|---|---|---|---|
| 1 | Refresh provider model catalogs from live API | P2 | Open — see DEBT-13 |
| 7 | Documentation and comment hygiene across codebase | P3 | Open |
| 8 | Reality-based stabilization pass | P1 | Open |
| 9 | Model behavior normalization (thinking modes) | P2 | Partial — see DEBT-16 |
| 10 | Unified multi-agent wrapper | P2 | Open |
| 13 | Internet-verified change protocol (validate before applying) | P2 | Open |
| 14 | Model ID indirection (single source of truth) | P1 | Open — see DEBT-02 |
| 15 | Synchronize model catalog (6 TS/Rust mismatches) | P1 | Open — see DEBT-02 |
| 16 | Expand Tauri filesystem deny list (.env files) | P1 | Open — see DEBT-06 |

---

## 7.12 Open FIXME Items

| # | Description | Severity | Status |
|---|---|---|---|
| 1 | Extension Bridge runtime dependency risk | Low | Partially resolved |
| 2 | Extension orchestration not wired into AGI planner | Medium | Open — see DEBT-14 |
| 3 | Model/router source-of-truth drift (TS vs Rust) | High | Resolved (6 mismatches remain as DEBT-02) |
| 4 | Tool event/execution parity | High | Ongoing |
| 5 | Prompt injection via unsanitized tool results | High | Resolved |
| 6 | Streaming path no circuit breaker | Medium | Resolved |
| 7 | Cost cap not enforced in LLM hot path | Medium | Resolved (direct-caller gap remains as DEBT-03) |
| 8 | Ollama is_available() not wired | Low | Resolved |

---

## 7.13 Enterprise Readiness Gaps

Full enterprise readiness requires resolution of the following items before an enterprise tier can be offered:

| Capability | Current State | Required State | Debt Item |
|---|---|---|---|
| SAML 2.0 / Enterprise OIDC | Not implemented | WorkOS or direct SAML 2.0 handler | — |
| Unified RBAC | Two separate systems | Single propagated role model | SEC-16 |
| SCIM 2.0 user provisioning | DB fields only | Full SCIM 2.0 API | DEBT-11 |
| Org-level billing | Per-user Stripe | Per-org consolidated billing | DATA-04 |
| Immutable audit log | Fragmented | Unified, append-only, SIEM-exportable | DEBT-12 |
| MDM / managed deployment | Passive installer | GPO/Jamf/Intune provisioning profiles | — |
| IT-controlled update deferral | Force + min_version only | Maintenance window config | — |
| In-app proxy configuration | Auto-detect env var | PAC / manual proxy UI | — |
| Tenant isolation | RLS per user | RLS per organization | DATA-04 |
| Signing key CI security | Potentially logged | Masked, never logged | DEBT-04 |

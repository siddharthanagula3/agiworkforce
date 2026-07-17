# AGI Desktop — Volume 25 — API Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and real repo paths: `apps/desktop/src-tauri/src/lib.rs` (`generate_handler!` registry), `apps/desktop/src-tauri/src/integrations/{realtime,native_messaging,sync}/`, `apps/web/app/api/{chat,memory,projects,settings,billing,search,media,llm}/`, `apps/web/lib/{api-auth.ts,server/rls-db.ts}`, `apps/web/proxy.ts`, `packages/contracts/types/src/models.json`, `packages/contracts/types/src/billing-catalog.ts`.

## Overview & stance

Desktop is the full-trust surface (Local + BYOK + Managed Cloud) and the suite's local-private compute host. Its "API" is therefore two-sided. **Cloud APIs** are the Neon-backed HTTP routes under `apps/web/app/api/*` that Desktop calls only for Managed-Cloud data (chats, memory, projects, billing, sync). **Local IPC APIs** are Tauri v2 commands and native events served in-process by `src-tauri` — no network, no cloud. The trust boundary is the contract: Local rows never travel over Cloud routes; a Local→BYOK/Cloud move is an explicit, consented fork via dedicated commands (`transfer_local_to_cloud`), never an implicit fallthrough. Model IDs used by any surface come only from `packages/contracts/types/src/models.json`; this spec cites none literally.

## Cloud APIs

### Authentication — 🟡 Partial

All cloud routes authenticate via Clerk and scope every query to the caller's `user_id` server-side. Requirements: reject unauthenticated requests with `401`; resolve identity with `getClerkAuthUser` (`apps/web/lib/api-auth.ts`) and run data access through the RLS-scoped connection `getUserScopedDb` (`apps/web/lib/server/rls-db.ts`); never trust a client-supplied `user_id`. Edge routing uses `apps/web/proxy.ts` (never `middleware.ts`). Gap: BYOK is not authenticated here at all — BYOK is Desktop-local only. ✅ auth wiring exists; 🟡 uniform RLS coverage across every route is not yet audited.

### Chat — ✅ Built

CRUD at `apps/web/app/api/chat/conversations/route.ts`, `.../[id]/route.ts`, `.../[id]/messages/route.ts`, `.../messages/bulk/route.ts`, `.../messages/[messageId]/route.ts`. Inference streams via `apps/web/app/api/llm/v1/chat/completions/route.ts` and `llm/v2/chat/route.ts`. Requirement: only `cloud_managed` conversations use these; a model ID must resolve in `models.json` or the request is rejected.

### Files — 🔭 Planned

There is no general `/api/files` route; Desktop file access is Local IPC (`file_*` commands) and stays on device. Cloud file/media handling is limited to `apps/web/app/api/media/route.ts`. A cloud file-attachment API for Desktop-uploaded artifacts is design intent, gated behind explicit transfer + secret scan.

### Images — 🟡 Partial

Generation/status at `apps/web/app/api/media/image/generate/route.ts` and `media/video/{generate,status}/route.ts`. Desktop also has a native path (`media_generate_image`). Non-LLM image engines are referenced from repo config, not re-listed. Gap: unified per-plan gating not yet enforced across both paths.

### Search — 🟡 Partial

`apps/web/app/api/search/route.ts` (Neon RPC, e.g. `get_recent_searches`) with `q`, `type`, and `limit` (capped at 100). Desktop mirrors local search via IPC (`search_chat_history`, `search_past_conversations`). Gap: cross-corpus (memory + projects) ranking is planned.

### Projects — ✅ Built

`apps/web/app/api/projects/route.ts`, `.../[id]/route.ts`, and delta-sync at `apps/web/app/api/projects/sync/route.ts`. Managed-Cloud projects only. Project-header presentation is derived locally from the shared `@agiworkforce/types` contract; Local or BYOK project metadata is never posted to a stateless Web preview route.

### Memory — ✅ Built

`apps/web/app/api/memory/route.ts`, `.../[id]/route.ts`, `memory/search/`, and `memory/sync/route.ts`. Cursor + tombstone delta-sync mirrors chat sync.

### Settings — 🟡 Partial

Routes under `apps/web/app/api/settings/{preferences,api-keys,2fa,activity,audit-logs,organization,team,test-provider,sync}/route.ts`. Requirement: settings sync (`settings/sync/route.ts`) is allowlist-gated and lands last; secrets/keys never sync. Gap: settings IA convergence and the sync allowlist are unfinished.

### Billing — 🟡 Partial

`apps/web/app/api/billing/{invoices,payment-methods,analytics}/route.ts`, checkout at `apps/web/app/api/checkout/route.ts`, and `apps/web/app/api/stripe-webhook/route.ts` (Stripe). Plans: Free $0; Basic $8/₹399; Pro $20; Max $100 and $200; Enterprise custom — Local and BYOK are free access modes, not plans. Gap: `apps/web/app/api/credit-topup/route.ts` and older tiers in `packages/contracts/types/src/billing-catalog.ts` must stay env-gated off and be reconciled (🟡 tracked separately) — no top-ups.

### Responses — 🟡 Partial

Non-stream routes return JSON with an explicit shape; LLM routes return SSE token streams. Requirement: every response echoes the resolved model ID (from `models.json`) and trust mode so the client can render the correct provider label.

### Errors — 🟡 Partial

Standard HTTP semantics: `401` unauth, `403` plan/entitlement denied, `404` not owned, `409` sync conflict, `429` metered limit, `4xx` validation, `5xx` server. Requirement: no secret or provider-key material in error bodies.

### Pagination — ✅ Built

Sync routes are cursor-based: `GET /api/chat/sync?since=<server_version>` returns rows with `server_version > cursor` plus tombstones and the next cursor; `POST` is idempotent upsert keyed by `cloud_id` (`apps/web/app/api/chat/sync/route.ts`). Non-sync list routes use `limit` caps.

## Local IPC APIs

### Tauri Commands — ✅ Built

~1,500 commands are registered in one `tauri::generate_handler!` block (`apps/desktop/src-tauri/src/lib.rs`). Representative, verified names: `chat_send_message`, `chat_create_conversation`, `file_read`/`file_write`/`file_read_range`, `memory_remember`/`memory_recall`, `settings_v2_get`/`settings_v2_set`, `mcp_call_tool`, `skill_invoke`. Trust-critical commands: `cloud_get_conversations` and siblings form an explicit cloud boundary that fails closed when cloud is unavailable; `transfer_local_to_cloud`/`transfer_cloud_to_local` are the consented fork. Requirement: every new command is added to this single registry and validates its inputs (no unvalidated IPC).

### Native Events — ✅ Built

The Rust host emits typed events consumed by React (`apps/desktop/src-tauri/src/integrations/realtime/events.rs`). Verified names include `chat:stream-start`/`stream-chunk`/`stream-end`/`stream-error`, `chat:tool-calls`/`tool-executing`/`tool-progress`, `bridge:token-rotated`, `cloud:connected`, and `extension:page-context`/`extension:task-result`. Requirement: event payloads carry no cross-boundary data (a Local session emits no cloud identifiers).

### Plugin APIs — 🟡 Partial

Extensibility surfaces: MCP (`mcp_initialize`, `mcp_list_servers`, `mcp_call_tool`), MCPB bundles (`mcpb_install_bundle`, `mcpb_uninstall_bundle`, `mcpb_check_updates`), extension host (`extension_install`, `extension_page_context`), skills (`skill_invoke`, `skill_list`), and connectors (`connector_permission_set`), backed by `crates/agiworkforce-plugin-runtime`. Gap: capability sandboxing/permission prompts are not uniform across all plugin classes.

### Streaming APIs — 🟡 Partial

Two streams. (1) Chat token streaming via the `chat:stream-*` events plus `chat-token`. (2) The `127.0.0.1` realtime WebSocket host for Chrome + VS Code (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`): loopback-only origin check (`localhost`/`127.0.0.1`/`[::1]`), bridge token (`bridge_get_token`/`bridge_rotate_token`), five-failure IP lockout (300s), and the Chrome native-messaging host `com.agiworkforce.browser` (`native_messaging/manifest.rs`). The Desktop↔Mobile companion re-uses this fabric with HMAC verification (`dispatch_hmac_verify`); it is 🟡 — the experimental chat panel is commented out and control events are re-emitted with no listener.

## Repository map

- `apps/desktop/src-tauri/src/lib.rs` — Tauri command registry (`generate_handler!`)
- `apps/desktop/src-tauri/src/sys/commands/` — command implementations (chat, file, memory, settings, mcp, skill, realtime, privacy)
- `apps/desktop/src-tauri/src/integrations/{realtime,native_messaging,sync,cloud}/` — WS host, Chrome bridge, delta-sync, cloud CRUD
- `apps/web/app/api/{chat,memory,projects,settings,billing,search,media,llm,checkout,stripe-webhook}/` — cloud routes
- `apps/web/lib/{api-auth.ts,server/rls-db.ts}`, `apps/web/proxy.ts` — auth + RLS + edge routing
- `packages/contracts/types/src/models.json` — model ID SSOT; `packages/contracts/types/src/billing-catalog.ts` — pricing (🟡 reconcile)

## Competitor notes

Claude, ChatGPT, and Codex expose a single cloud API surface; local execution (Claude Code, Codex CLI) still calls that vendor endpoint. AGI diverges deliberately: Desktop's primary API is **local IPC** with no network, provider-plural via `models.json` (multiple providers, verified list), BYOK direct-to-provider where allowed (Desktop/CLI/VS Code only), and Managed Cloud as an opt-in boundary — not the default. Remote Control mirrors Claude Code Remote Control / Codex remote connections (paired secure window, compute stays local) rather than shipping work to the cloud.

## Acceptance / Definition of Done

Production-ready when local and cloud API contracts are documented, versioned, input-validated, and boundary-tested; every response carries a resolved (never invented) model ID and trust label.

- [ ] Build: every IPC command registered in `lib.rs` and unit-covered; cloud routes typed and lint-clean.
- [ ] Trust: no Cloud route accepts Local/BYOK rows; `transfer_*` is the only Local→Cloud path (consent + secret scan + payload preview + provider label).
- [ ] Security: Clerk + RLS on all cloud routes; loopback-only + bridge-token + IP-lockout enforced on the WS host; no secrets in errors/events; keys stay in OS keychains.

## Anti-patterns

- Routing a Local chat/file/session to a Cloud route or BYOK provider without an explicit fork.
- Claiming a route/command exists without a real repo path, or documenting the companion as shipped (it is 🟡).
- Hardcoding or inventing model IDs instead of resolving from `models.json`.
- Reintroducing removed tiers (Plus, `pro_plus`, Hobby, Team) or credit top-ups; inventing Pro/Max INR prices.
- Referencing Supabase, or renaming `proxy.ts` back to `middleware.ts`.
- Trusting client-supplied `user_id`, or leaking provider keys in responses, logs, or events.

# AGI Chrome Extension — Volume 25 — Data Storage

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root) and `apps/extension/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon, esp. "Chrome scope"); grounded in real repo paths — `apps/extension/manifest.json`, `apps/extension/src/options.ts`, `apps/extension/src/features/background/conversation-history.ts`, `apps/extension/src/background/memory-bridge.ts`, `apps/extension/src/pairing.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/background.ts`, `apps/extension/src/features/computer-use/cdpDriver.ts`, and `apps/extension/THREAT_MODEL.md`.

## Overview & stance

This volume specifies **every place the AGI Browser Companion writes data on the user's device** and the invariants that keep it there. The Chrome surface is a permission-gated browser agent, not a consumer assistant: it holds **no provider keys**, runs **no inference of its own**, and by canon has **no cloud consumer tables** — conversation sync, global memory sync, and Projects are removed scope. The governing v1 invariant for this domain: **local-only.** All Companion state lives in `chrome.storage` (`local` for durable, `session` for ephemeral) scoped to the one browser profile, and **never** enters Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`), which is Web ↔ Mobile ↔ Desktop, Managed-Cloud chats only.

Trust modes shape the boundary directly. The extension has no BYOK path (BYOK is Desktop/CLI/VS Code only). Its only outbound provider path is the thin bridged chat through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`); no provider host is contacted from the extension, so no provider secret is ever a candidate for local storage.

## Extension Settings — `chrome.storage` ✅

**Built** — `apps/extension/src/options.ts` reads/writes durable `agi_*` preference keys in `chrome.storage.local`: model/provider defaults (`agi_default_model`, `agi_default_provider`, `agi_model`), agent behavior (`agi_action_mode`, `agi_quick_mode`, `agi_thinking_enabled`, `agi_cu_ask_before_acting`), endpoints (`agi_gateway_url`, `agi_bridge_url`), notification/onboarding flags (`agi_task_notifications`, `agi_onboarding_completed`, `agi_panel_disclosure_shown`), and account credentials removed on logout (`agi_api_key`, `agi_user_id`, `agi_user_tier`, `agi_session`).

Requirements: every setting is device-scoped and never enters delta-sync; settings sync is out of scope for this surface (per canon, cross-device settings sync is allowlist-gated and lands last on the app surfaces, not Chrome). Model IDs written to `agi_default_model`/`agi_model` MUST originate from the gateway model list derived from `packages/contracts/types/src/models.json` — never hardcoded. `agi_api_key` is an AGI account/gateway credential, not a provider key. 🟡 Gap: the key name `agi_api_key` is ambiguous and should be renamed to signal "account credential" (`apps/extension/src/options.ts:15`).

## Conversation History — local, 100 / 30-day TTL ✅

**Built** — `apps/extension/src/features/background/conversation-history.ts` (re-exported by `src/conversation-history.ts`). Stored under `agi_conversation_history` in `chrome.storage.local`. Hard caps: `MAX_CONVERSATIONS = 100` (oldest dropped via `.slice(0, 100)`) and `TTL_MS = 30 days` (`pruneExpired` filters on read and write). IDs use `crypto.randomUUID()` (audit batch-220 hardening).

Requirements: history is device-scoped, never synced, never mirrored to a cloud consumer table (removed scope). Prune-on-read guarantees expired conversations are invisible even before a write reclaims them. Deleting the extension or clearing site data MUST leave no server-side residue, because none is written.

## Memory — device-scoped `agi_memories`, max 200, never synced ✅

**Built** — `apps/extension/src/background/memory-bridge.ts`. Stored under `agi_memories` in `chrome.storage.local` as `MemoryItem[]` (a structural subtype of the canonical `Memory` from `@agiworkforce/types`). Hard caps: `MAX_MEMORY_ITEMS = 200` (adds refused past the cap) and `MAX_CONTENT_CHARS = 2000` per entry. Full CRUD (`memoryList/Add/Update/Delete`) with a `isMemoryItem` type guard on every read.

Requirements: **NEVER synced** — the file header states the v1 LOCAL ONLY rule (no cloud sync, no writes to consumer chat tables). Global memory sync is removed scope; these rows never touch `apps/web/app/api/memory/sync`. Writes are bounded (cap + per-item length) to prevent unbounded local-storage growth.

## Cache 🟡

**Partial** — the background maintains **in-memory, non-durable caches** rather than a persistent cache store. `apps/extension/src/background/policy.ts` holds stateful caches such as the site-allowlist cache (`siteAllowlistCache`) that back message-gating decisions; the CDP layer reads the allowlist key directly (`apps/extension/src/features/computer-use/cdpDriver.ts:572`). These reset with the service worker.

Requirements: caches are performance state only — reconstructable from the durable `chrome.storage.local` source and never the system of record for any permission or entitlement decision. 🔭 Planned: no dedicated persistent cache table exists for model-catalog or entitlement responses; if added, it must carry an explicit TTL, be invalidatable on logout, and never cache provider payloads.

## Session Cache ✅

**Built** — ephemeral state uses `chrome.storage.session` (MV3 in-memory, cleared on browser restart). The pairing/bridge credential lives here, not in `local`: `agi_bridge_token` + `agi_pairing_fingerprint` are written by `apps/extension/src/pairing.ts` (validated shape: URL-safe base64/hex, 32–128 chars, H-07 hardening) and cleared on `unpair()`. Context-menu handoffs (`agi_pending_chat`) and notification→tab mappings (`agi_notif_<id>`) are written to `chrome.storage.session` in `apps/extension/src/background.ts`.

Requirements: the bridge token MUST live in `session` (not `local`) so a paired session does not survive a browser restart unattended; pairing re-establishes outbound-only via QR + HMAC. `agi_pending_chat` is a one-shot transfer buffer, consumed-and-cleared by the side panel, never durable history.

## Permission State ✅

**Built** — the site allowlist is the durable authorization record: `agi_site_allowlist` in `chrome.storage.local`, read in `apps/extension/src/background.ts` (`:857`, updated `:1669–1675`), by `cdpDriver.ts` and `options.ts`. `policy.ts` classifies senders (`extension-page-only` / `allowlisted-tab` / `discovery`) and gates DOM-mutation message types (`TYPE`, `CLICK`, `SUBMIT_FORM`, `EXECUTE_SCRIPT`, …) to same-tab allowlisted origins. Host permissions (restricted to localhost + `agiworkforce.com`) are declared in `apps/extension/manifest.json`. Ask-before-acting state is `agi_cu_ask_before_acting`.

Requirements: no automation message may be honored for an origin absent from `agi_site_allowlist`; the allowlist is the single source of truth and in-memory caches must be revalidated against it. Removing an origin MUST immediately revoke automation on open tabs of that origin.

## Temporary Page Context — task-scoped, discarded 🟡

**Partial** — captured page context (DOM/text, console, network, screenshots, region captures) is passed to the agent loop (`apps/extension/src/features/computer-use/agentLoop.ts`) and streamed through the cloud gateway (`cloudAgentClient.ts` egress rule: no provider host contacted from the extension). It is held **in memory for the task and not written to any `chrome.storage` key** — persistence is limited to the three durable stores above.

Requirements: page context is ephemeral by construction and MUST NOT be persisted, logged to durable storage, or folded into memory/history without an explicit, redacted user action. Per canon, page content is treated as **data, never instructions** (prompt-injection defense, `apps/extension/THREAT_MODEL.md`). 🔭 Planned: an explicit "clear task context" affordance and guaranteed zeroization on task end/abort — today discard relies on GC of in-memory buffers, not an audited purge routine.

## Repository map

- `apps/extension/src/options.ts` — durable settings + account credentials (`chrome.storage.local`)
- `apps/extension/src/features/background/conversation-history.ts` — `agi_conversation_history` (100 / 30-day TTL)
- `apps/extension/src/background/memory-bridge.ts` — `agi_memories` (max 200, never synced)
- `apps/extension/src/pairing.ts` — `agi_bridge_token` / `agi_pairing_fingerprint` (`chrome.storage.session`)
- `apps/extension/src/background/policy.ts` — sender classification + in-memory allowlist cache
- `apps/extension/src/background.ts` — `agi_site_allowlist`, `agi_pending_chat`, notif mappings
- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,cloudAgentClient}.ts` — ephemeral page context, allowlist read
- `apps/extension/manifest.json`, `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md`

## Competitor notes

Claude for Chrome and ChatGPT's browser surfaces tie browsing memory and history to a cloud account; Codex's phone-paired remote steers a host but its history lives with the host/cloud. AGI's deliberate divergence on Chrome: the Companion is **local-first and account-thin** — history and memory are `chrome.storage.local` only, capped, TTL'd, and structurally excluded from delta-sync. There is no in-extension checkout and no consumer sync table; entitlements are verified server-side and paywalls render from server `429 {kind:'paywall', requiredTier}` responses, with model-by-plan gating. Cross-device continuity is reserved for the app surfaces (Web/Mobile/Desktop) under Managed Cloud, not smuggled through the browser agent.

## Acceptance / Definition of Done

Production-ready when all durable state is confined to the documented `chrome.storage.local` keys with enforced caps/TTLs, ephemeral state stays in `chrome.storage.session`, no path writes Companion data to any Neon/consumer table, and no provider key is ever persisted.

- [ ] **Build:** history enforces 100-cap + 30-day prune on read and write; memory enforces 200-cap + 2000-char limit; settings round-trip through `options.ts` with model IDs sourced from the gateway list (never hardcoded).
- [ ] **Trust:** grep proves no Companion store is referenced by `apps/web/app/api/{chat,memory,projects}/sync`; `agi_memories` and `agi_conversation_history` never leave the device; bridge token stays in `session`, cleared on `unpair()`.
- [ ] **Security:** page context is never persisted; allowlist is the sole authorization record and revocation takes effect on open tabs; no provider secret in any `agi_*` key; injection defense (page content = data) holds per `THREAT_MODEL.md`.

## Anti-patterns

- Writing conversation history, memory, or page context to Neon or any cloud consumer table — removed scope; **local-only is a v1 invariant.**
- Storing a raw provider API key in `agi_api_key` or any key — the extension holds no provider keys.
- Persisting the bridge token in `chrome.storage.local` so pairing silently survives restarts (must be `session`).
- Weakening the 100/30-day history cap or the 200/2000-char memory cap "for convenience."
- Hardcoding a model ID into `agi_default_model` instead of reading the gateway list backed by `packages/contracts/types/src/models.json`.
- Referencing Supabase, or reintroducing removed tiers (Plus / pro_plus / Hobby) or credit top-ups in any value.
- Treating an in-memory cache as the authorization source instead of `agi_site_allowlist`; honoring automation for a non-allowlisted origin.

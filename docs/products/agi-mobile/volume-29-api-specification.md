# AGI Mobile — Volume 29 — API Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and verified repo paths: `apps/mobile/services/{api,streaming,authSession,cloudSyncEngine,notifications,modelDownload,companion,realtime,dispatchRealtime,remoteChatGate}.ts`, `apps/mobile/lib/{egressGuard,v1FeatureFlags,constants,dispatchHmac}.ts`, `apps/mobile/src/features/image/services/imagegen.ts`, `apps/web/app/api/**`, `services/signaling-server`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies the network API surface that AGI Mobile consumes. Mobile exposes exactly two trust modes — **Local** (on-device LLM, free) and **Managed Cloud** (public alpha, open by default). There is **no BYOK on mobile**: no endpoint, screen, or token store accepts a user provider key. Every Cloud API is Neon-backed and reached through the managed gateway at `${API_URL}` (default `https://agiworkforce.com`, `apps/mobile/lib/constants.ts`).

The hard rule is fail-closed egress. All outbound HTTPS flows through `guardedFetch` (`apps/mobile/lib/egressGuard.ts`) via `secureFetch`; in Local mode the guard refuses the call before any I/O, so Local chats, memory, and files never reach a Cloud route. Cloud routes require a real Clerk auth gate (`remoteChatGate.ts` returns a disabled/sign-in reason and `assertRemoteChatAllowed` throws when Cloud is off — fail-closed). Model IDs are never sent as invented strings; the gateway and `packages/types/src/models.json` own the catalog and clients pass only optional overrides.

## Authentication APIs ✅ Built

Auth is Clerk Expo native (`AuthView`), wired in `app/_layout.tsx`, gated by `FEATURES.auth` (`apps/mobile/lib/v1FeatureFlags.ts`). The bearer token bridge lives in `apps/mobile/services/authSession.ts` (`getAuthToken`, `getAuthHeaders`, `refreshAuthSession`, `clearAuthSession`). The HTTP client (`services/api.ts`) injects the bearer on every Cloud call and, on a first `401`, refreshes once and retries; repeated failures clear the session and prompt re-sign-in. Requirements: signing in IS the Managed-Cloud entitlement (no demo bypass); refresh is single-flight with backoff (`MAX_REFRESH_FAILURES`, `REFRESH_TIMEOUT_MS`); no endpoint accepts a provider API key. Device-linking endpoints `/api/auth/device/{code,token,approve}` and `/api/device/{link,approve,poll}` exist server-side (✅) for desktop/web pairing but are 🔭 for mobile until a paired-window flow is wired (see Runtime APIs).

## Chat APIs ✅ Built (streaming) / 🟡 (some CRUD unused on mobile)

Cloud chat streams over SSE. `streamChat` (`services/streaming.ts`) first targets the gateway `POST /api/v1/providers/:providerId/stream` and falls back to `POST /api/llm/v1/chat/completions` (both ✅ in `apps/web/app/api/`). It uses `expo/fetch` so `response.body` is a real `ReadableStream` for token-by-token render. When the AddToChatSheet web-search toggle is on, the body carries `web_search: true` and the server injects its built-in tool, streaming `x_search_results`. Delta-sync of Managed-Cloud threads runs through `GET/POST /api/chat/sync` (✅, `cloudSyncEngine.ts`) — push changed rows, pull with a cursor. Conversation/message CRUD (`/api/chat/conversations`, `/api/chat/sessions/...`) exists server-side; mobile currently relies on sync rather than per-row CRUD. Local chats never touch any of these routes.

## File APIs 🟡 Partial

The client exposes `api.uploadFile` → `POST /api/upload` (`services/api.ts`), but **no `app/api/upload/route.ts` exists** in `apps/web` — the route is unimplemented (gap: ship the gateway-backed upload endpoint or repoint the client). Document parsing is on-device (`services/docParser.ts`); per `apps/mobile/AGENTS.md`, mobile must **not** become the first heavy local PDF/PPTX/DOCX surface — large extraction and generated-file work delegate to Desktop/host. Project knowledge files use `/api/projects/:id/knowledge-files` (✅). The `POST /api/conversations/:id/tags` path called in `services/api.ts` has no matching route (server tagging lives under `/api/autotag/*`) — 🟡 reconcile.

## Image APIs ✅ Built (generate) / 🟡 (status, list)

Generation is **cloud-backed only** — no on-device image gen. `generateImage` (`src/features/image/services/imagegen.ts`) calls `POST /api/media/image/generate` (✅), gated by `FEATURES.imageGen`; Pro-tier+ entitlement is enforced server-side and surfaced as `ApiPaywallError` → `PaywallBottomSheet`. The client also references `GET /api/media/image/status/:id` and `/api/media/image/list`, which are **not implemented** server-side (only `media/image/generate`, `media/video/generate`, `media/video/status` exist) — 🟡. On-device vision and OCR (`image/services/vision.ts`, `ocr.ts`) stay Local and never call these routes.

## Memory APIs ✅ Built

Cloud memory uses `/api/memory` (CRUD), `/api/memory/search`, `/api/memory/[id]`, and delta-sync `GET/POST /api/memory/sync` (all ✅) consumed by `cloudSyncEngine.ts` on a cursor **independent** from the chat cursor. Requirement: Local memory stays on-device (SQLCipher/MMKV) and is excluded from sync; only Managed-Cloud memory rows are pushed/pulled. An explicit reviewed transfer is required to move local memory into Cloud.

## Project APIs ✅ Built

Projects ship in v1 (`FEATURES.projects`). Endpoints: `/api/projects` (list/create), `/api/projects/[id]` (get/update/delete), `/api/projects/sync` (delta-sync, `cloudSyncEngine.ts`), and `/api/projects/[id]/knowledge-files[/[fileId]]` (all ✅). Local projects remain device-local unless explicitly transferred.

## Runtime APIs — remote runtime control 🟡 Partial / 🔭

Remote Control is a secure **window** over a host session, not a trust mode — compute stays on the host, connection is outbound-only, QR + HMAC paired, approval-gated. Pairing primitives exist: `services/companion.ts` validates `agiw:<code>[:<64-hex-role-token>]`, builds approval responses (`buildApprovalResponsePayload`, `sendApprovalResponse`, `sendEmergencyStop`) and HMAC payloads (`lib/dispatchHmac.ts`); the relay is `services/signaling-server`. **But `FEATURES.companion` and `FEATURES.dispatch` are `false`, and `services/realtime.ts` / `dispatchRealtime.ts` are subscribe/unsubscribe stubs not wired to task execution** — matching the canon example of a flag-off companion protocol. There is no public REST "runtime control" route; control rides the signaling/WebRTC fabric. Full remote runtime control is 🔭.

## Notification APIs — push services ✅ Built

`registerForPushNotifications` (`services/notifications.ts`) requests permission, fetches the Expo push token (`getExpoPushTokenAsync`), and sends `{ deviceId, pushToken, platform? }` to `POST /api/mobile/push-token` (✅, `apps/web/app/api/mobile/push-token/route.ts`), which upserts the `mobile_devices` Neon row under Clerk-bearer auth. Registration is non-fatal (degrades to no-token). Deep-link routing from pushes is feature-gated so a stray push can't open a disabled surface. Local-only reminders use `scheduleLocalNotification` (no network).

## Repository map

- Clients: `apps/mobile/services/{api,streaming,authSession,cloudSyncEngine,notifications,modelDownload,companion,realtime,dispatchRealtime,remoteChatGate,secureFetch}.ts`; `apps/mobile/lib/{egressGuard,v1FeatureFlags,constants,dispatchHmac,pinning}.ts`; `apps/mobile/src/features/image/services/imagegen.ts`.
- Gateway/Neon routes: `apps/web/app/api/{llm/v1/chat/completions, v1/providers/[providerId]/stream, chat/sync, chat/conversations, memory, memory/sync, memory/search, projects, projects/sync, projects/[id]/knowledge-files, media/image/generate, mobile/push-token, auth/device, device, settings/sync}`.
- Shared: `services/signaling-server`, `packages/types/src/models.json`.

## Competitor notes

ChatGPT and Claude mobile expose a single first-party cloud backend with one account tier path and a fixed model line. AGI diverges deliberately: (1) **multi-provider** Cloud routing brokered by the gateway against `models.json`, not a single vendor; (2) a real **on-device Local** path that fail-closes against all Cloud routes; (3) **per-surface trust** — mobile gets Cloud + Local but **never BYOK**, which Desktop/CLI/VS Code reserve; (4) Remote Control as a paired window over a host, mirroring Claude Code Remote Control / Codex remote connections rather than shipping a phone-side compute backend.

## Acceptance / Definition of Done

Production-ready when every Cloud route is Neon-backed, Clerk-authenticated, paywall-aware, and provably unreachable in Local mode, with no provider-key surface anywhere on mobile.

- [ ] Build: streaming + sync (`/api/v1/providers/:id/stream`, `/api/chat|memory|projects/sync`) green; image-gen paywall path verified; File `/api/upload` and image `status`/`list` gaps closed or marked 🔭 in-product.
- [ ] Trust: `guardedFetch` blocks every route above in Local mode; `remoteChatGate` fails closed when Cloud disabled; no BYOK endpoint exists.
- [ ] Security: all calls bearer-authenticated via `authSession`; TLS-pinning chokepoint (`secureFetch`) intact; push token scoped to `{deviceId, pushToken}`; HMAC/approval gating enforced before any remote action.

## Anti-patterns

- Adding a BYOK / provider-key entry, screen, or endpoint to mobile.
- Auto-routing Local chats, memory, files, or projects to any Cloud route without an explicit reviewed transfer.
- Faking unbuilt routes (`/api/upload`, `/api/media/image/{status,list}`, remote runtime control) as shipped, or claiming companion/dispatch works while the flags are off.
- Hardcoding or inventing model IDs instead of deferring to the gateway + `packages/types/src/models.json`.
- Referencing Supabase, or citing removed tiers ("Plus", `pro_plus`, "Hobby") in any API contract — use Free / Basic / Pro / Max / Enterprise.

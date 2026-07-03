# AGI Mobile — Volume 05 — Cloud Mode

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounds in `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md` (canon), and the real repo paths cited inline — `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/services/cloudSettingsMapping.ts`, `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/services/offlineQueue.ts`, `apps/mobile/services/authSession.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/src/features/billing/service.ts`, and the Neon delta-sync routes under `apps/web/app/api/{chat,memory,projects,settings}/sync/route.ts`. Model IDs come only from `packages/types/src/models.json`.

## Overview & stance

This volume specifies AGI Mobile's **Managed Cloud** mode: the signed-in, AGI-hosted path where conversations, projects, and memory delta-sync across Web ↔ Mobile ↔ Desktop over Neon. Mobile exposes exactly **two** trust modes — **Local** (a small on-device LLM, free, never leaves the device) and **Managed Cloud**. **Mobile has no BYOK**, and this volume never adds a provider-key affordance; "provider configuration" on mobile means on-device model management, not API keys (`apps/mobile/lib/v1FeatureFlags.ts` keeps `byokKeys: false`).

The governing rule everywhere below: **Cloud is a distinct trust boundary**. Local chats, memory, and projects live in separate stores and never auto-route to the cloud. Cloud is **public alpha, open by default** — a signed-in Clerk session is the entitlement (no invite, no waitlist), enforced by `getRemoteChatDisabledReason()` which **fails closed** when `cloudChat` is off (`apps/mobile/services/remoteChatGate.ts`). The server kill-switch `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is the only re-gate. Sync I/O is gated on `isManagedSyncEnabled()` (`FEATURES.cloudChat === true && appMode === 'cloud'`) with the `api` client's `guardedFetch` as an independent fail-closed backstop.

## Cloud Architecture — shared AGI Cloud backend (Neon + Clerk + Stripe)

✅ Built — `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/services/authSession.ts`.

The cloud backend is **Clerk** (identity/session), **Neon Postgres** (the delta-sync store of record), and **Stripe** (billing). Never reference Supabase. Mobile is a thin client: the Clerk session JWT (`@clerk/expo`, cached in `expo-secure-store`) is bridged to non-React callers as a `Bearer` token (`apps/mobile/services/authSession.ts`) and every cloud call routes through `api` → `guardedFetch`. Requirements: (1) all cloud reads/writes carry a fresh Clerk token; (2) no cloud call executes in Local mode; (3) IDs are client-generated UUIDv7 (time-ordered, collision-free) so push/pull are idempotent; (4) model selection reads only `packages/types/src/models.json` (e.g. `claude-opus-4.8`, `gpt-5.5`) — never a hardcoded ID.

## Conversation Synchronization

✅ Built — `apps/mobile/services/cloudSyncEngine.ts` (`push()`/`pull()`), wired in `apps/mobile/app/_layout.tsx` (`startCloudSyncLoop`) and after send (`apps/mobile/stores/chat/chatExecutionStore.ts`).

Cloud conversations and messages delta-sync against `apps/web/app/api/chat/sync/route.ts`: push locally-dirty rows, then pull everything with `server_version` greater than the cursor, paginating up to the page guard and **only moving the cursor forward**. Requirements: conversations push before messages (so message ownership passes in one round-trip); LWW conflict resolution keyed on `updatedAt`; remote deletes (tombstones) always win, but a locally-dirty rename is preserved until its push lands (the data-loss guard in `applyConversationDeltas`); unacked messages stay dirty for retry. Only **Managed-Cloud** chats sync — Local-mode threads live in a separate store and are never touched.

## Project Synchronization

🟡 Partial — sync engine built (`pushProjects()`/`pullProjects()` against `apps/web/app/api/projects/sync/route.ts`); the cloud project **detail** screen is gated off. Gap: `apps/mobile/app/(app)/projects/[id].tsx` gates `fetchProject` on `FEATURES.crossDeviceSync` (hard-`false`), so a synced cloud project falls through to `LocalOnlyFallback` and can render a stale "Local" label or a raw UUID. Fix (tracked in `apps/mobile/docs/cloud-mode-parity-audit.md`): drive the detail header from `cloudProjectStore` when `appMode === 'cloud'`. The underlying delta-sync (name, instructions, color, archive, soft-delete tombstones, independent project cursor) is real and runs whenever `cloudChat` is on.

## Memory Synchronization

✅ Built — `apps/mobile/services/cloudSyncEngine.ts` (`pushMemory()`/`pullMemory()`) against `apps/web/app/api/memory/sync/route.ts`, with its own memory cursor independent of the chat/project cursors.

Cloud memory entries (content, category, source, soft-delete) delta-sync inside the same `syncNow()` cycle, gated by the same `isManagedSyncEnabled()` check. Requirements: tombstones push as soft-deletes and are hard-deleted locally only after server ack; the write-side marker `markMemoryForSync()` is called only in cloud mode. **Local memory never syncs** — it stays on-device unless the user runs an explicit reviewed transfer (out of scope for auto-sync).

## Settings Synchronization (allowlist-gated, lands last)

✅ Built — `apps/mobile/services/cloudSyncEngine.ts` (`pushSettings()`/`pullSettings()`) + `apps/mobile/services/cloudSettingsMapping.ts`, server SSOT `apps/web/app/api/settings/sync/route.ts`.

Settings sync runs **last** in `syncNow()` (most sensitive). It is an **explicit allowlist projection**: `toCloudSettings()` reads only named cloud-safe namespaces (appearance, personalization, profile, notifications, language, accessibility, chat, editor) and never spreads-then-deletes. **Never synced:** any provider/API key, device tokens, model paths, `providerMode`, voice/TTS device audio, biometric flags, `autoApproveMode`, capabilities, temporary-chat state. Requirements: a fresh device pulls before it pushes (guard on `settingsUpdatedAt === null`) so defaults never clobber existing cloud settings; LWW key is the real local-edit time, not push time; snapshot-diff suppresses redundant pushes.

## Subscription Management

🟡 Partial — `apps/mobile/src/features/billing/service.ts` + `store.ts` exist and call `/api/billing/portal-session` (Stripe Customer Portal), but `FEATURES.billing` is `false`, so in-app billing is gated off in v1. Plan/paywall enforcement is **server-side**: free signed-in users hit a metered prompt cap; Pro/Max-gated actions (e.g. image gen) surface `ApiPaywallError` → `PaywallBottomSheet`. Plans follow the canon ladder only — **Free $0; Basic $8/mo (₹399); Pro $20/mo; Max $100/mo and $200/mo; Enterprise custom**. No "Plus", `pro_plus`, or "Hobby"; no credit top-ups; Pro/Max INR are TBD (do not invent). When billing flips on, mobile must render plans from server responses and open a one-time validated Stripe portal URL — no checkout secrets in the client.

## Cross-device Continuity

🟡 Partial — chat continuity is live via the same UUIDv7 rows syncing across surfaces; broader cross-device UI is gated by `FEATURES.crossDeviceSync = false` (`apps/mobile/lib/v1FeatureFlags.ts`). A conversation started on Web or Desktop appears on mobile after the next pull and vice-versa, with LWW reconciliation. Requirements: continuity covers **Managed-Cloud chats only** across Web ↔ Mobile ↔ Desktop; CLI/VS Code/Chrome stay workspace/task-scoped and never auto-join app chat. **Remote Control is not part of this** — the phone-as-remote-window over a locally-running Desktop session (QR + HMAC, outbound-only, approval-gated) is feature-flagged off (`companion`/`dispatch` false) and specified separately, not as cloud data sync.

## Offline Recovery

✅ Built — `apps/mobile/services/offlineQueue.ts`.

Sends that fail on network error enqueue into an **MMKV-backed** FIFO queue that survives app kills (`restoreFromStorage()` on cold start). Requirements: exponential backoff (1s/2s/4s capped), bounded retries with `onSuccess`/`onFailure` callbacks, and drop-after-max. On reconnect, `processQueue()` drains in order and `syncNow()`'s pull repairs any divergence; the cursor-forward-only rule guarantees no double-apply. Local-mode sends never enter the cloud queue.

## Repository map

- `apps/mobile/services/cloudSyncEngine.ts` — chat/memory/project/settings delta-sync.
- `apps/mobile/services/cloudSettingsMapping.ts` — settings allowlist projection.
- `apps/mobile/services/remoteChatGate.ts` — public-alpha cloud gate (fails closed).
- `apps/mobile/services/offlineQueue.ts` — persistent offline send queue.
- `apps/mobile/services/authSession.ts`, `apps/mobile/services/api.ts` — Clerk token bridge + `guardedFetch`.
- `apps/mobile/stores/chat/{chatCloudMessageStore,cloudSyncStateStore}.ts`, `apps/mobile/stores/{memory,projects,settings}/*` — cloud stores + per-domain cursors.
- `apps/mobile/src/features/billing/*` — Stripe portal client (gated).
- `apps/web/app/api/{chat,memory,projects,settings}/sync/route.ts` — Neon delta-sync SSOT.
- `packages/types/src/models.json` — only source of model IDs.

## Competitor notes

ChatGPT and Claude mobile sync a single first-party account silently with no trust split. AGI diverges deliberately: (1) **two explicit trust modes** on mobile — on-device **Local** that never leaves the phone plus **Managed Cloud**, instead of one cloud account; (2) **no BYOK on mobile** (keys live only on Desktop/CLI/VS Code), a sharper boundary than competitors offer; (3) **allowlist-gated settings sync** that structurally cannot leak keys or device audio, vs. opaque account settings; (4) **multi-provider** model choice from a versioned SSOT rather than a single house model. Like Anthropic/OpenAI, image generation on mobile is **cloud-backed** — mobile is never the first heavy local PDF/PPTX/image-gen surface.

## Acceptance / Definition of Done

Production-ready when: cloud sync is exercised across Web ↔ Mobile ↔ Desktop with no data loss under concurrent edits; every cloud path is provably dead in Local mode; the settings allowlist is enforced by code structure, not filtering; offline sends recover deterministically; and `pnpm --filter @agiworkforce/mobile typecheck` + `test` are green.

- [ ] Build/sync: `syncNow()` is a no-op (zero network I/O) when `appMode !== 'cloud'`; cursors only advance; UUIDv7 dedup verified.
- [ ] Trust: no BYOK affordance anywhere; Local stores never read by cloud sync; remote-delete-vs-dirty-rename guard holds.
- [ ] Security: `cloudSettingsMapping` projects only allowlisted namespaces (no keys/tokens/audio); Clerk token required on every cloud call; `guardedFetch` backstop active.

## Anti-patterns

- Adding a BYOK / API-key entry to mobile (forbidden — `byokKeys` stays false).
- Auto-routing Local chats, memory, or projects to the cloud without an explicit reviewed transfer.
- Spreading the full settings store into the sync payload, or syncing keys/device tokens/biometrics/`autoApproveMode`.
- Hardcoding or inventing a model ID instead of reading `packages/types/src/models.json`.
- Referencing Supabase, or naming "Plus" / `pro_plus` / "Hobby" / credit top-ups in any pricing surface.
- Claiming cross-device continuity or billing is fully shipped — both are 🟡 with gates noted above.
- Treating Remote Control as a cloud sync path or a fourth trust mode.

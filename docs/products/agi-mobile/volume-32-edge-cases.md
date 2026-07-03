# AGI Mobile — Volume 32 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounds in `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and verified repo paths under `apps/mobile/` — `services/offlineQueue.ts`, `lib/sendQueue.ts`, `hooks/useNetworkStatus.ts`, `src/features/edge-cases/`, `services/authSession.ts`, `services/remoteChatGate.ts`, `lib/v1FeatureFlags.ts`, `services/companion.ts`, `services/heartbeat.ts`, `services/notifications.ts`, `services/backgroundFetch.ts`, `app/_layout.tsx`, `app/error.tsx`, plus `packages/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Mobile behaves when the happy path breaks: no network, expired auth, a failed upload, a dropped companion link, a missed push, a backgrounded process, or an OS kill. Mobile exposes exactly two trust modes — **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default, gated by a real signed-in entitlement). **There is no BYOK on mobile and none may be added.** That split is the spine of every edge case here: a Local turn must never fail "open" into the cloud, and a Cloud turn must never silently degrade into a Local one without telling the user. Failures must preserve the trust boundary, never leak Local data off-device, and never fabricate availability. `remoteChatGate` fails closed when Cloud is disabled (`services/remoteChatGate.ts`). Model IDs come only from `packages/types/src/models.json`.

## No Internet — offline handling

✅ Built — `services/offlineQueue.ts`, `hooks/useNetworkStatus.ts`, `src/features/edge-cases/components/OfflineBanner.tsx`, `lib/sendQueue.ts`.

- Local Mode must remain fully usable with zero connectivity: on-device inference, history, and memory require no network.
- A connectivity loss surfaces a non-blocking `OfflineBanner` (mounted once above the route slot, `accessibilityRole="alert"`, auto-dismiss on reconnect).
- Cloud sends that fail on a network error (not a content error) enqueue into the MMKV-backed `offlineQueue` and drain FIFO on reconnect with exponential backoff (1s/2s/4s, capped) and `MAX_RETRY_COUNT` drop semantics; `useNetworkStatus` triggers `processQueue()` on the offline→online transition and strips placeholder message pairs to avoid duplicates.
- Requirement: a Cloud send while offline shows a queued state, not a fake success, and never silently re-routes to Local.

## Authentication Failure — login recovery

✅ Built — `services/authSession.ts`, `src/integrations/clerk`, `app/(auth)/`, `services/remoteChatGate.ts`, `lib/v1FeatureFlags.ts` (`auth: true`).

- Cloud requires a real Clerk session; there is no demo bypass. The Clerk token cache (expo-secure-store) persists across launches and is the source of truth for the Bearer token bridged into the cloud stream path.
- On 401/expired session the app must attempt a silent token refresh; on failure it routes to `/(auth)/login` and preserves the in-progress prompt so the user resumes after re-auth.
- Auth failure must never drop the user into authenticated UI for even one frame (the notification-navigation race fix in `services/notifications.ts` gates on a bridged `isSignedIn` boolean).
- Local Mode stays available throughout an auth failure — losing the cloud session never blocks on-device chat.

## Upload Failure

✅ Built (recovery UI) / 🔭 Planned (heavy local parsing) — `src/features/edge-cases/components/{FileTooLargeModal,FileUnreadableModal,ImageTooLargeModal,StorageFullModal}.tsx`, `services/docParser.ts`, `services/fileCreation.ts`.

- Oversized, unreadable, or storage-blocked uploads must present a specific recovery modal (copy centralized in `src/features/edge-cases/components/copy.ts`), never a silent drop or a generic crash.
- A failed upload must not poison the conversation: the user can retry or remove the attachment and continue.
- Per `apps/mobile/AGENTS.md`, Mobile must not become the first heavy local PDF/PPTX/DOCX/image-gen surface. Large parsing and image generation are cloud-backed; when Cloud is unavailable, the modal states the limit rather than attempting heavy on-device work. Heavy local parsing is 🔭 Planned and must delegate to Desktop/host or managed compute.

## Runtime Disconnect — companion recovery

🟡 Partial — `services/companion.ts`, `stores/connectionStore.ts`, `services/dispatchRealtime.ts`, `services/realtime.ts`; gated off by `FEATURES.companion` / `FEATURES.dispatch` in `lib/v1FeatureFlags.ts`; `services/heartbeat.ts` is a v1 no-op.

- Remote Control is **not** a trust mode: the phone is a secure remote window over a session that keeps running on the host; compute never moves to the phone. The pairing protocol exists (`agiw:<code>[:<64-hex-role-token>]` validation, QR + HMAC, 30s heartbeat, missed-heartbeat stale detection, 15s reconnect countdown) but is feature-flagged off and not wired to task execution — hence 🟡, matching the canon example.
- When the link drops, the UI must show a connection-quality/disconnected state from `connectionStore`, attempt bounded reconnect, and keep host-side work running; it must never reissue approval-gated actions automatically on reconnect.
- Requirement: a disconnect surfaces an explicit "reconnecting" state and re-pairing path; it must not fabricate a "connected" badge.

## Push Failure

🟡 Partial — `services/notifications.ts`, `services/companionNotifications.ts`, `services/backgroundFetch.ts`.

- Push is best-effort, never the only delivery path. If a push token can't register or a notification is missed, state must still be discoverable in-app on next open (background fetch reconciles pending approvals/agent status via `services/backgroundFetch.ts`).
- A notification tap must respect the auth gate: taps that fire before auth resolves route to `/(auth)/login`, never into authenticated screens.
- Approval/agent-status notifications depend on companion/cloud features that are flagged off in v1, so end-to-end push for those flows is 🟡 until the flags flip; degraded push must never silently approve a tool call.

## App Backgrounding

✅ Built (lifecycle hooks) / 🔭 Planned (full stream-resume) — `app/_layout.tsx`, `src/features/auth/hooks/useBiometricGate.ts`.

- On `AppState` background→active transitions the app must re-evaluate the biometric gate (`useBiometricGate`) before revealing protected content.
- In-flight Local inference and Cloud streams should survive a brief background; on return the UI reconciles partial output rather than duplicating the turn. Full guaranteed stream-resume across long backgrounds is 🔭 Planned.
- Backgrounding must not leak: sensitive content respects the biometric/redaction gate when the app re-foregrounds.

## OS Termination — state restoration

✅ Built — `lib/sendQueue.ts`, `services/offlineQueue.ts` (`restoreFromStorage()`), `lib/mmkv.ts`, `storage/` (SQLite/SQLCipher), `app/error.tsx`.

- iOS/Android reclaim memory aggressively, so durable state lives in MMKV and encrypted on-device storage, not in memory. On cold start the `next`/`later` send lanes (`lib/sendQueue.ts`) and the offline queue (`restoreFromStorage()`) rehydrate so deferred prompts and queued sends resume.
- Conversations, messages, memory, and installed-model records persist in `storage/` and reload on relaunch.
- A crash on launch renders the root error boundary (`app/error.tsx`, inline styles, retry CTA) instead of a white screen — App Store review resilience.
- Restoration must respect trust boundaries: restored Local content stays Local; restored Cloud content requires a valid session before re-sync.

## Repository map

- `apps/mobile/services/` — `offlineQueue.ts`, `authSession.ts`, `remoteChatGate.ts`, `companion.ts`, `companionNotifications.ts`, `heartbeat.ts`, `notifications.ts`, `backgroundFetch.ts`, `dispatchRealtime.ts`, `realtime.ts`, `streaming.ts`, `docParser.ts`, `fileCreation.ts`.
- `apps/mobile/lib/` — `sendQueue.ts`, `mmkv.ts`, `v1FeatureFlags.ts`, `secureStorage.ts`.
- `apps/mobile/src/features/edge-cases/` — recovery modals + `MessageErrorScreen.tsx`, `OfflineBanner.tsx`, `copy.ts`.
- `apps/mobile/hooks/useNetworkStatus.ts`; `apps/mobile/stores/connectionStore.ts`; `apps/mobile/storage/`; `apps/mobile/app/{_layout.tsx,error.tsx,(auth)/}`.
- Shared: `packages/runtime` (message-queue manager), `packages/types/src/models.json` (model IDs), `services/signaling-server` (companion relay, host-side).

## Competitor notes

ChatGPT and Claude mobile assume cloud connectivity and a single managed provider: offline means "no chat," auth failure means a full sign-in wall, and there is no on-device fallback. AGI diverges deliberately: Mobile keeps a **free on-device Local mode** that works with no network and no account, so connectivity and auth failures degrade to Local instead of dead. AGI also offers **per-surface trust** and **multi-provider Cloud**, but — unlike Desktop/CLI/VS Code — **mobile deliberately has no BYOK**, so no edge case ever prompts for an API key. Remote Control mirrors Claude Code Remote Control / Codex remote connections: the phone is a window, not a compute host, so a disconnect strands no work on the device.

## Acceptance / Definition of Done

Production-ready when every edge case shows an honest state (queued/offline/reconnecting/error), preserves trust boundaries, and restores durable state after an OS kill — with no fabricated availability and no cross-mode leakage.

- [ ] Build: offline queue + send lanes rehydrate after force-kill; root error boundary renders on launch crash; `pnpm --filter @agiworkforce/mobile test` green.
- [ ] Trust: Local edge cases never route off-device; Cloud edge cases require a valid Clerk session; `remoteChatGate` fails closed; no BYOK affordance anywhere.
- [ ] Security: restored/queued content stays encrypted at rest; biometric gate re-arms on foreground; missed-push reconciliation never auto-approves a tool call.

## Anti-patterns

- Adding any BYOK / API-key entry to mobile as an "offline" or "auth-failure" workaround.
- Auto-routing a failed Local turn into Cloud, or silently downgrading Cloud to Local.
- Faking success for a queued/offline send, or showing a "connected" companion badge while disconnected.
- Hardcoding or inventing a model ID instead of reading `packages/types/src/models.json`.
- Holding durable state only in memory (lost on OS kill) or routing notification taps into authenticated UI before auth resolves.
- Referencing Supabase, or making Mobile the first heavy local PDF/PPTX/DOCX/image-gen surface.

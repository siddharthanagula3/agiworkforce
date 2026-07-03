# AGI Mobile — Volume 22 — Cross-device Experience

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root); `apps/mobile/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo paths: `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/stores/chat/cloudSyncStateStore.ts`, `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/services/offlineQueue.ts`, `apps/mobile/stores/connectionStore.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/services/companionNotifications.ts`, `apps/mobile/lib/dispatchHmac.ts`, `apps/mobile/services/heartbeat.ts`, `apps/mobile/services/desktopStatus.ts`, `apps/mobile/lib/clipboard.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/app/_layout.tsx`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Mobile participates in a **cross-device** life: picking up a conversation that began on Web or Desktop, handing a session between devices, sharing content, showing which devices are live, and reporting sync health. The governing constraint is Mobile's **two-trust-mode split** — **Local** (small on-device LLM, free, private) and **Managed Cloud** only. **Mobile has no BYOK**; nothing in this volume may add a provider-key affordance, and "Provider Configuration" on mobile means on-device model management, never API keys.

Cross-device data movement is asymmetric by design. **Managed-Cloud chats** delta-sync over Neon (Web ↔ Mobile ↔ Desktop) and are the _only_ data this volume moves automatically. **Local chats, memory, projects, and files stay on the device** unless the user runs an explicit reviewed transfer — they are never the subject of presence, resume, or shared-clipboard sync. **Remote Control is not a fourth trust mode**: a phone acting as a window over a Desktop/CLI session keeps compute on the host (outbound-only, QR + HMAC paired, approval-gated). Every cloud path here fails closed through `services/remoteChatGate.ts` when Cloud is disabled.

## Resume Conversations — continue on another device

✅ Built (Cloud only) — A Managed-Cloud conversation started on Web or Desktop appears on Mobile, and vice versa, through the Neon delta-sync engine `apps/mobile/services/cloudSyncEngine.ts` (push-then-pull against `/api/chat/sync` with a monotonic `server_version` cursor compared as bigint). The loop runs from `apps/mobile/app/_layout.tsx` while signed in; `apps/mobile/stores/chat/cloudSyncStateStore.ts` persists the cursor under its own MMKV key so a cold start **resumes mid-stream** rather than re-fetching the world. Resume is strictly gated: `isManagedSyncEnabled()` is true only when `FEATURES.cloudChat === true` and `appMode === 'cloud'`. Requirements before this is "complete" cross-surface UX: resume lands the user at the last-read message with scroll position restored, shows the conversation's mode badge (Cloud), and never resurrects a Local chat into the cloud timeline. **Local conversations do not resume across devices** — by definition they never left the device; cross-device continuity of a Local chat requires the explicit reviewed-transfer path (🔭 Planned), never an automatic upload.

## Handoff

🟡 Partial — Two distinct handoffs exist. (1) **Data handoff** of a Cloud chat is the resume path above: pick up the same thread on another device with no manual export. (2) **Session handoff / remote window** — driving a Desktop/CLI session from the phone — has real primitives but is feature-flagged off. `apps/mobile/stores/connectionStore.ts` implements the WebRTC companion channel; `apps/mobile/services/companion.ts` validates `agiw:<code>` QR pairing payloads and builds approve/reject control messages; `apps/mobile/lib/dispatchHmac.ts` derives the per-session HMAC secret and signs/verifies messages (outbound-only, paired, approval-gated — matching the canon remote-control model). The gap: `FEATURES.dispatch` and `FEATURES.companion` are both `false` in `apps/mobile/lib/v1FeatureFlags.ts`, so the channel is **not wired to task execution** and ships dark. Requirements before ✅: the companion window must keep compute on the host, surface every tool call for approval, label the host device, and tear down on session expiry. **Composer/draft handoff** (start typing on phone, finish on desktop) is 🔭 Planned. No handoff may relocate Local data into the cloud.

## Shared Clipboard

🔭 Planned (cross-device); ✅ on-device copy only — Today the clipboard is **device-local**: `apps/mobile/lib/clipboard.ts` (`copyToClipboard`, backed solely by `expo-clipboard`) copies message or extracted text to the system clipboard, used by capture/translate flows. There is **no** cross-device shared clipboard — nothing syncs copied content between Mobile, Web, and Desktop, and that is intentional for v1. A future shared clipboard must (a) be Managed-Cloud only and gate through `remoteChatGate`; (b) never capture Local-mode content silently; (c) be explicit per-copy (user-initiated "send to my other devices"), never a background scrape of the OS clipboard; (d) carry no provider keys or secrets. Until built, do not render a "synced clipboard" affordance — that would fake an unsupported capability.

## Device Presence

🔭 Planned — There is **no presence system**: the heartbeats table is absent and the mobile writers are disabled. `apps/mobile/services/heartbeat.ts` (`startMobileHeartbeat`) returns a no-op while `FEATURES.companion` is off, and `apps/mobile/services/desktopStatus.ts` (`startDesktopStatusPolling`) is a disabled no-op pending a Clerk-authenticated Web/API endpoint (it explicitly forbids direct mobile DB reads). The only liveness signal that exists is **inside the flagged-off companion channel** — `connectionStore.ts` tracks a single peer's `ConnectionStatus`/`ConnectionQuality` and `DesktopMetadata.deviceName` via heartbeat ping latency — which is point-to-point, not account-wide presence. Requirements before ✅: a server-backed presence/heartbeat table, a Clerk-authenticated read path, and a roster showing each signed-in device's last-seen time and live state. Presence must be Cloud-only and must never imply a Local device is "online" to the cloud.

## Synchronization Status — sync health

🟡 Partial — The engine already tracks health: `apps/mobile/stores/chat/cloudSyncStateStore.ts` holds `status` (`idle | syncing | error`), `lastSyncAt`, `lastError`, and the dirty-row sets (`dirtyConversationIds`, `dirtyMessages`) awaiting push; `apps/mobile/services/offlineQueue.ts` persists failed sends to MMKV and drains them FIFO with exponential backoff on reconnect. What is **not** built is a user-facing sync-health surface: a "last synced" timestamp, a pending-changes count, and an error/offline banner that lets the user retry. Requirements before ✅: a status indicator that reads the sidecar store (never chat content), shows offline/queued/synced/error states, exposes a manual `syncNow()` retry, and **renders nothing in Local mode** (sync is a no-op when `appMode !== 'cloud'` or signed out). It must never display an INR/price string or a model id; any model label reads `packages/types/src/models.json`.

## Repository map

- `apps/mobile/services/cloudSyncEngine.ts` — Managed-Cloud delta-sync (push-then-pull, bigint cursor).
- `apps/mobile/stores/chat/cloudSyncStateStore.ts` — sync sidecar: cursor, status, lastSyncAt, lastError, dirty sets.
- `apps/mobile/services/remoteChatGate.ts` — fail-closed cloud gate.
- `apps/mobile/services/offlineQueue.ts` — persisted offline send queue + backoff.
- `apps/mobile/stores/connectionStore.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/services/companionNotifications.ts`, `apps/mobile/lib/dispatchHmac.ts` — companion/remote-window channel (flagged off).
- `apps/mobile/services/heartbeat.ts`, `apps/mobile/services/desktopStatus.ts` — presence/liveness stubs (disabled).
- `apps/mobile/lib/clipboard.ts` — device-local clipboard.
- `apps/mobile/lib/v1FeatureFlags.ts` — `cloudChat`, `dispatch:false`, `companion:false`, `crossDeviceSync:false`, `byokKeys:false`.
- `apps/mobile/app/_layout.tsx` — sync loop lifecycle.
- Shared: `packages/types/src/models.json` (model ids); `apps/web/app/api/chat/sync` (cloud endpoint); Neon delta-sync; `services/signaling-server` (companion relay).

## Competitor notes

ChatGPT and Claude mobile treat cross-device as a single cloud account: every device is a thin client over one server timeline, presence/handoff are implicit, and there is no on-device-only thread. AGI's deliberate divergence: cross-device continuity is **Managed-Cloud only and explicit** — a Local chat is private to the device and never auto-syncs; the user always sees each conversation's trust mode; and Mobile drives Desktop sessions as a **remote window** (compute stays on the host) rather than streaming everything through a vendor cloud. Multi-provider state is not tied to one vendor's account, and — unlike competitor key-entry flows — Mobile **never** exposes BYOK anywhere in the cross-device surface.

## Acceptance / Definition of Done

Cross-device is production-ready only when Cloud chats resume and report health across devices, Local data never leaves the device without an explicit reviewed transfer, and every unbuilt capability (presence, shared clipboard, composer handoff) is absent rather than faked.

- [ ] Build: resume + sync-health pass `pnpm --filter @agiworkforce/mobile typecheck` and `test`; cold start resumes mid-stream from the persisted cursor with no duplicated/lost rows.
- [ ] Trust: resume/sync are no-ops unless `cloudChat && appMode==='cloud'` and a real Clerk session exists; `byokKeys`, `dispatch`, `companion`, and `crossDeviceSync` stay false until their feature ships; Local data is never pushed.
- [ ] Security: companion handoff stays QR + HMAC paired, outbound-only, approval-gated; the sync cursor is bigint-safe; no model id, route, env var, or INR price is hardcoded.

## Anti-patterns

- Adding any BYOK / provider-key affordance to a resume, handoff, presence, clipboard, or sync screen.
- Auto-uploading Local chats/memory/files to the cloud, or treating resume/handoff as a Local→Cloud transfer.
- Rendering presence, a shared clipboard, or composer handoff as shipped — they are 🔭 (or 🟡 and flagged off) until wired.
- Enabling `companion`/`dispatch` without keeping the channel compute-on-host, outbound-only, paired, and approval-gated.
- Background-scraping the OS clipboard or showing a fake "synced" badge.
- Hardcoding/inventing a model id instead of reading `packages/types/src/models.json`; referencing Supabase; or naming a removed tier (Plus / pro_plus / Hobby).

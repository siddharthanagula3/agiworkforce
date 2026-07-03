# AGI Mobile — Volume 20 — Remote Runtime Control

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`; grounded in `apps/mobile/services/companion.ts`, `apps/mobile/stores/connectionStore.ts`, `apps/mobile/stores/dispatchStore.ts`, `apps/mobile/services/dispatchRealtime.ts`, `apps/mobile/services/desktopStatus.ts`, `apps/mobile/services/companionNotifications.ts`, `apps/mobile/lib/dispatchHmac.ts`, `apps/mobile/lib/dispatchAgentValidator.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/remoteChatGate.ts`, `services/signaling-server/src/index.ts`, and `packages/types/src/models.json`.

## Overview & stance

Remote Runtime Control lets the phone act as a secure **remote window** over a session that keeps running on a host (Desktop, CLI, or VS Code). It is **not a fourth trust mode**: compute stays on the host, the connection is outbound-only, paired with QR + HMAC, and every consequential action is approval-gated. The phone observes, approves, and steers; it does not execute the work and does not pull host files into the cloud. This mirrors Claude Code Remote Control and Codex remote connections.

The trust rules still bind. Mobile exposes only **Local** (a small on-device LLM, free) and **Managed Cloud**. **Mobile has no BYOK** and this volume must never add one — pairing carries no provider keys. The relay (`services/signaling-server`) brokers WebRTC signaling between a `desktop` and a `mobile` peer; it never sees plaintext payloads, which are HMAC-signed end to end. Cross-device **data** sync (Neon delta-sync of Managed-Cloud chats) is a separate path and is out of scope here — Remote Control moves control messages, not chat history.

Reality check: the Desktop↔Mobile companion fabric **exists in code but is feature-flagged off** (`companion: false`, `dispatch: false`, `agents: false`, `schedules: false` in `apps/mobile/lib/v1FeatureFlags.ts`) and is **not wired to real task execution**, so it is 🟡. CLI and VS Code remote control are 🔭 parity targets.

## Runtime Discovery

The phone must learn which hosts are reachable for the signed-in account. Target: a presence list keyed off a `surface_heartbeats` table so each host advertises liveness, surface kind, and version.

🔭 Planned — no `surface_heartbeats` table exists. `apps/mobile/services/desktopStatus.ts` is an explicit stub: liveness polling is disabled in v1 (`startDesktopStatusPolling` returns a no-op teardown). Until presence ships, discovery is manual: the user initiates pairing from the host's QR. Requirement: discovery must be account-scoped (Clerk), must never auto-connect, and must fail closed when Cloud is disabled (`remoteChatGate` semantics in `apps/mobile/services/remoteChatGate.ts`).

## Runtime Pairing — secure QR + HMAC

Pairing is the security spine. The host renders a QR encoding `agiw:<code>` or `agiw:<code>:<64-hex-role-token>`; the phone scans, validates format, resolves the code to a shared secret, and registers as the `mobile` role. All subsequent control traffic is HMAC-signed with per-session nonce + timestamp; inbound messages are verified before dispatch and replayed nonces are rejected.

🟡 Partial — the primitives exist but the flow is flag-gated off. `apps/mobile/services/companion.ts` validates codes (`isValidPairingCode`, `extractPairingCode`) against `PAIRING_CODE_PATTERN`. `apps/mobile/lib/dispatchHmac.ts` provides `HmacSessionState` and the sign/verify path consumed by `connectionStore`. `services/signaling-server/src/index.ts` issues role-scoped pair tokens (`issuePairToken(code, 'desktop'|'mobile', expiresAt)`) and relays only between paired peers. Gap: `FEATURES.companion === false`, sessions expire (`sessionExpiresAt`), and the path is not exercised against a live host.

Requirements: codes are short-lived and single-use; mismatched HMAC or expired session → hard disconnect with a visible error; the QR must never carry secrets that, if photographed, grant standing access beyond the session.

## Desktop Sessions

Desktop is the reference host. The phone pairs to a desktop running its `127.0.0.1` realtime host, then observes agents, approves tool calls, and can pause/resume/cancel — without the desktop relinquishing local compute.

🟡 Partial — `apps/mobile/stores/connectionStore.ts` implements the WebRTC data channel, status machine (`disconnected`/`connecting`/`connected`/`stale`/`reconnecting`/`error`), `agents_update` ingestion (capped via `dispatchAgentValidator`), approval-request ingestion, and control senders (`sendApprovalResponse`, `sendAgentCommand`, `sendEmergencyStop`) in `companion.ts`. Gap: dormant behind `companion`/`dispatch` flags and not wired to real desktop task execution. Requirement: Desktop sessions stay local-private — approvals and emergency stop must round-trip to the host, never to the cloud.

## CLI Sessions

Parity target: pair the phone to a long-running CLI workspace session (`apps/cli`) to watch streamed output and approve gated actions remotely, mirroring Claude Code Remote Control.

🔭 Planned — no mobile↔CLI transport exists; the signaling relay only models `desktop` and `mobile` roles (`services/signaling-server/src/index.ts`). CLI sessions must stay workspace/session-scoped; any handoff to phone chat is explicit and redacted, never automatic.

## VS Code Sessions

Parity target: attach the phone to a VS Code workspace agent session (`apps/extension-vscode`) for remote observation and approval.

🔭 Planned — not built; same role-model and transport gaps as CLI. VS Code sessions are workspace-scoped and local-private; the phone is a window, not a second executor.

## Session List — runtime dashboard

Target: a dashboard listing every reachable host session with surface badge, status dot, last-activity, and a tap-through to detail. Multiple concurrent sessions are first-class.

🔭 Planned — `connectionStore` currently models a **single** active connection, not a list, and discovery (above) is absent. Requirement: the list reads from account-scoped presence, shows trust context per row, and offers an unmistakable global disconnect.

## Session Details — live state

Target: per-session detail showing host name/version/platform, connection quality, heartbeat latency, session expiry, reconnect telemetry, and the live agent roster.

🟡 Partial — `connectionStore` already tracks `desktopMetadata`, `connectionQuality`, `lastHeartbeatLatencyMs`, `missedHeartbeats`, `sessionExpiresAt`, `reconnectAttempts`/`reconnectSuccesses`, and `companion.ts` derives quality labels (`getConnectionQualityLabel`). Gap: flag-gated, single-session, no UI bound to live execution. Requirement: detail view must surface staleness honestly and never fake a "connected" badge when heartbeats have lapsed.

## Streaming Output — live runtime output

Target: stream the host's live output (agent steps, tool calls, logs) to the phone over the data channel, append-only, with approval prompts inline.

🟡 Partial — the control-message pipeline ingests `agents_update` and approval requests over the HMAC-verified channel (`connectionStore.ts`), and `apps/mobile/services/dispatchRealtime.ts`/`companionNotifications.ts` exist. Gap: not wired to a real host producing output; dormant behind flags. Requirement: output is host-originated and read-only on the phone — the phone never re-runs or re-renders host work as if local.

## Task Progress

Target: show task lifecycle (`pending`/`working`/`completed`/`failed`) with progress and result artifacts, and let the user pause/resume/cancel.

🟡 Partial — `apps/mobile/stores/dispatchStore.ts` defines `TaskStatus`, `DispatchMessage`, `TaskResult`, and `sendTask` (emits `dispatch_task`, queued when offline). A red-team fix already strips `taskResult.previewUrl` before MMKV persistence. Gap: `FEATURES.dispatch === false`; not connected to real execution. Requirement: progress reflects host truth only — never optimistic local fabrication — and heavy artifact generation stays on the host (Mobile is not the first heavy local PDF/PPTX/DOCX/image-gen surface; image gen is cloud-backed).

## Repository map

- `apps/mobile/services/companion.ts` — QR validation, control builders, heartbeat/health, emergency stop.
- `apps/mobile/stores/connectionStore.ts` — WebRTC channel, status machine, HMAC verify, agent/approval ingestion.
- `apps/mobile/stores/dispatchStore.ts` — task model, `sendTask`, offline queue.
- `apps/mobile/services/dispatchRealtime.ts`, `apps/mobile/services/realtime.ts`, `apps/mobile/services/companionNotifications.ts` — realtime + notifications.
- `apps/mobile/services/desktopStatus.ts`, `apps/mobile/stores/desktopStatusStore.ts` — liveness (stub).
- `apps/mobile/lib/dispatchHmac.ts`, `apps/mobile/lib/dispatchAgentValidator.ts`, `apps/mobile/lib/v1FeatureFlags.ts`.
- `apps/mobile/services/remoteChatGate.ts` — fail-closed Cloud gate.
- Shared/host: `@agiworkforce/utils/signaling` (`SignalingClient`), `services/signaling-server/src/index.ts`.

## Competitor notes

ChatGPT and Claude mobile are primarily cloud chat clients; Claude Code Remote Control and Codex remote connections let a phone observe and approve a session that keeps running on a host — the model AGI mirrors here. AGI's deliberate divergence: per-surface trust (Desktop/CLI/VS Code stay local-private; the phone is an outbound-only window), multi-provider model selection sourced from `packages/types/src/models.json`, a free **on-device** Local mode, and **no BYOK on mobile** ever. Compute and keys stay on the host; the relay is zero-knowledge over signed payloads.

## Acceptance / Definition of Done

A session is production-ready only when pairing, transport, and the live host execution loop are wired end-to-end behind real flags, with presence discovery and honest status.

- [ ] Build: `companion`/`dispatch` flags flip on only when wired to a live host; `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass; HMAC sign/verify and pair-token expiry covered by tests.
- [ ] Trust: no BYOK affordance anywhere in pairing or session UI; Local sessions never auto-route off device; `remoteChatGate` fails closed when Cloud is disabled.
- [ ] Security: QR codes single-use and short-lived; replayed nonces rejected; phone is read-only over host output; emergency stop reaches the host; status never shows "connected" when heartbeats have lapsed.

## Anti-patterns

- Adding any BYOK / API-key entry to mobile pairing or session screens.
- Routing Local or host data into Managed Cloud to "make remote work."
- Claiming Desktop/CLI/VS Code remote control is shipped — it is 🟡/🔭; never assert without a real repo path.
- Faking discovery or a "connected" badge when no `surface_heartbeats`/host liveness exists.
- Optimistically rendering task progress the host did not report.
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`); referencing Supabase (removed — Clerk + Neon + Stripe only).
- Inventing INR prices for Pro/Max, or reintroducing "Plus"/`pro_plus`/"Hobby" tiers.

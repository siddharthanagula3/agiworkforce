# AGI Chrome Extension — Volume 14 — Desktop Bridge & Pairing

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension/AGENTS.md` (surface rules), and the real implementation in `apps/extension/manifest.json`, `apps/extension/src/pairing.ts`, `apps/extension/src/features/native-bridge/{pairing,index,providerStreamClient,sendQueue}.ts`, `apps/extension/src/features/cloud-bridge/desktopBridge.ts`, `apps/extension/src/background.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/types.ts`, `apps/extension/native-host/{com.agiworkforce.browser.json.template,INSTALL.md,install.sh}`, and `apps/extension/THREAT_MODEL.md`.

## Overview & stance

This volume replaces the removed Memory volume: on Chrome there is **no consumer memory or conversation sync** (history and `agi_memories` are `chrome.storage.local` only, device-scoped, never synced — canon Chrome scope). What remains is the **Desktop bridge** — the companion backbone that lets the permission-gated browser agent borrow a **paired, locally-running Desktop host** for inference instead of the cloud gateway.

Trust-mode implications are strict. The extension holds **no provider keys and runs no inference** (canon). When paired, the Desktop app hosts the LLM; the browser is a **secure remote window / task driver** over a session that keeps running on the host — Remote Control (a window), **not** a fourth trust mode. The bridge is **outbound-only from the browser to loopback**, paired (token + per-session HMAC), and approval-gated. It never turns Local Desktop data into Cloud data, and Chrome never gains BYOK. Two transports exist, in preference order: (1) the **native-messaging host** `com.agiworkforce.browser`; (2) the **localhost:8787 HTTP bridge** fallback. If neither is paired, the extension falls back to the thin bridged chat over the cloud gateway (`providerStreamClient.ts`), never a provider host directly.

## Native Messaging Host — com.agiworkforce.browser — ✅ Built

The extension connects via `chrome.runtime.connectNative('com.agiworkforce.browser')` (`background.ts:407`, host name `background.ts:172`), enabled by the `nativeMessaging` permission (`manifest.json:12`). The host manifest is `native-host/com.agiworkforce.browser.json.template` (`type: stdio`, `allowed_origins` pinned to `chrome-extension://<id>/`); install paths per OS are in `native-host/INSTALL.md`. Requirements: connection is not "connected" until a two-step handshake succeeds — `connect` (echoing `chrome.runtime.id`) then `ping` (`background.ts:417-432`); a failed handshake disconnects and schedules reconnect. Host-supplied action plans are **untrusted**: `validateShortcutActions` rejects unknown action types before execution (THREAT_MODEL Plane B, L-09). Requests carry a CSPRNG request id and a 10s timeout (`NATIVE_REQUEST_TIMEOUT_MS`).

## HTTP/WS Bridge — localhost 8787 fallback — ✅ Built (HTTP); 🔭 WS

The fallback transport is `POST http://localhost:8787/pair` plus HTTP streaming (`src/pairing.ts:124`; default `DEFAULT_AGI_BRIDGE_URL` from `background/policy.ts`; user-overridable via `chrome.storage.local.agi_bridge_url`). Only loopback is allowed: `validateBridgeUrl`/`ALLOWED_BRIDGE_HOSTS` accept `localhost`, `127.0.0.1`, `[::1]` and **reject `0.0.0.0`** (THREAT_MODEL §3.9, H-02/H-03/H-08). Streaming today is **SSE** via `native-bridge/providerStreamClient.ts` (barrel documents "SSE stream client"), not a full-duplex WebSocket. A persistent **WS** channel for bidirectional host-push events is **🔭 Planned** — no WebSocket client exists in `apps/extension/src` today; the barrel comment "HTTP/WS to port 8787" (`native-bridge/index.ts`) is aspirational. Requirement: any WS addition must reuse `validateBridgeUrl` and the same token/allowlist gates, not a new code path.

## Pairing — X-Bridge-Token state machine (pairing.ts) — ✅ Built

`src/pairing.ts` is the single hardened path (re-exported by `features/native-bridge/pairing.ts`). State machine: `idle → requesting → paired | error`, with `fingerprint` and `error` (`PairingState`). `requestPairing()` validates the bridge URL, POSTs `{ extensionId }`, and stores the returned token in **`chrome.storage.session`** (`agi_bridge_token`, cleared on browser exit) plus a short `agi_pairing_fingerprint` shown to the user. Token/fingerprint shape is enforced (H-07): token `^[A-Za-z0-9_-]{32,128}$`, fingerprint `^[A-Za-z0-9_-]{4,32}$` — malformed values are rejected, blocking multi-MB blobs. `confirmPairing()` accepts a user-pasted code under the same regex; `unpair()` clears both keys. Bridge requests attach `X-Bridge-Token` (`background.ts:3016`). Requirement: the provider API key (`agi_api_key`) is **never** sent to the bridge (THREAT_MODEL data classes, chrome-HIGH-3). QR-based pairing (parity with Codex/Claude phone pairing) is **🔭 Planned** — today pairing is `/pair` POST + paste; no QR encoder exists in-repo.

## Session HMAC — per-session secret on connect — ✅ Built

On the **native-messaging** channel, the host returns a 32-byte `session_secret` in its connect ack (`background.ts:246-274`, `handleNativeMessage` `background.ts:549`). Thereafter every outgoing request is enveloped `{ id, timestamp, mac, message }` with `mac = HMAC-SHA256(secret, id|timestamp|body)` (`computeEnvelopeMac`, `background.ts:232`), and every response is verified against the request id. Once a secret is negotiated the channel is **strict/fail-closed**: responses missing `mac`/`timestamp` are rejected as a downgrade attack (`background.ts:570-579`); a mismatch is rejected as a response-shuffle attack (`background.ts:590-597`). The secret must be exactly 64 hex chars or it is discarded (`setNativeSessionSecret`, `background.ts:246`). Legacy hosts without a secret get a one-time warning and no-MAC back-compat. The secret is dropped on disconnect (`background.ts:621`) so reconnect re-negotiates. Gap: the **HTTP bridge** authenticates with the static `X-Bridge-Token` only — per-message HMAC over the 8787 transport is **🔭 Planned**.

## Trust Model — THREAT_MODEL.md — ✅ Built

`THREAT_MODEL.md` declares six trust planes (A extension page → F page DOM). The Desktop host is **Plane B** ("installed by the user, trusted to host the LLM, but responses still validated"); the localhost bridge is **Plane C** ("trusted only after pairing"). Page innerText/conversation history sent to the host must first pass `sanitizePageText` (invisible-Unicode strip + `redactSecrets` + 100 KB cap; §3.4) and only from allowlisted origins (H-06b). Requirement: any new bridge message type follows the §6 checklist (DOM-mutation gate, extension-page-only gate, size cap, `sanitizePageText` before LLM egress).

## Reconnection — ✅ Built

Disconnect handling (`handleNativeDisconnect`, `background.ts:618`) drops the session secret, rejects all pending requests, and calls `scheduleNativeReconnect` (`background.ts:320`): exponential backoff `NATIVE_RECONNECT_BASE_DELAY_MS` (1000ms) → `NATIVE_RECONNECT_MAX_DELAY_MS` (30000ms), capped at `NATIVE_RECONNECT_MAX_ATTEMPTS` (8), then `nativeReconnectGaveUp` halts retries until user action — preventing macOS permission-prompt loops. **Permanent errors** ("host not found", "forbidden", "not allowed") halt immediately without backoff (`background.ts:646-655`). The user can force a retry via `RECONNECT_NATIVE` (`types.ts:361`, `triggerManualReconnect` `background.ts:293`), which clears `gaveUp` and re-handshakes. Queued messages drain on reconnect (`background.ts:443`).

## Desktop-side Approvals — 🟡 Partial

The Desktop host is trusted to run inference but its **action plans are re-validated** on the extension side (`validateShortcutActions`, THREAT_MODEL Plane B / L-09) and executed only under the extension's own ask-before-acting + high-risk approval gates (Volume 11). A **desktop-native approval surface** — the host prompting the Desktop user to confirm a requested browser action (Codex/Claude Remote-Control parity) — is **🔭 Planned**; today approvals render in the extension side panel. **Cross-surface unlock inheritance is deferred (🟡):** `features/cloud-bridge/desktopBridge.ts` documents that cloud-unlock state is `chrome.storage.local` only and that inheriting it from the paired Desktop over the 8787 bridge "requires a new message type + supervisor sign-off" and is not built.

## Repository map

- `apps/extension/src/pairing.ts` — canonical pairing state machine + token/fingerprint validation.
- `apps/extension/src/features/native-bridge/{pairing,index,providerStreamClient,sendQueue}.ts` — bridge barrel, SSE stream client, send queue.
- `apps/extension/src/background.ts` — `connectNative`, handshake, HMAC envelope, reconnection, `X-Bridge-Token` attach.
- `apps/extension/src/background/policy.ts` — `validateBridgeUrl`, `ALLOWED_BRIDGE_HOSTS`, `DEFAULT_AGI_BRIDGE_URL`.
- `apps/extension/src/features/cloud-bridge/desktopBridge.ts` — deferred cross-surface unlock inheritance.
- `apps/extension/native-host/{com.agiworkforce.browser.json.template,INSTALL.md,install.sh}` — host manifest + installer.
- `apps/extension/manifest.json` (`nativeMessaging`), `apps/extension/src/types.ts` (`RECONNECT_NATIVE`), `apps/extension/THREAT_MODEL.md`.

## Competitor notes

Claude Code Remote Control and OpenAI Codex remote connections pair a phone/web client to a locally-running host so **compute stays on the machine** ("nothing moves to the cloud"). AGI mirrors that stance for the browser: a remote window/driver over a paired Desktop host, outbound-only, token- and HMAC-gated. Divergence: AGI is **multi-provider and per-surface trust-scoped** — the paired host may run Local, BYOK, or Managed Cloud (Desktop's choice), but Chrome never holds keys, never runs inference, and never gains BYOK; page data crosses to the host only after allowlist + `sanitizePageText` redaction. Unlike a cloud-run agent, a paired session is local-first by construction.

## Acceptance / Definition of Done

Production-ready when native + HTTP transports pair, handshake, stream, and recover; the HMAC envelope is strict on the native channel; and no key/data leaves declared boundaries.

- [ ] Build: pairing state machine, handshake, reconnection backoff, and `RECONNECT_NATIVE` covered by tests; `pnpm --filter @agiworkforce/extension test` green.
- [ ] Trust: bridge URL restricted to loopback (`0.0.0.0` rejected); `agi_api_key` never sent to the bridge; page text redacted via `sanitizePageText` before host egress; unlock state stays device-local.
- [ ] Security: token/fingerprint regex enforced; native HMAC strict-mode rejects downgrade + shuffle; secret dropped on disconnect; permanent-error reconnect halt verified.

## Anti-patterns

- Do **not** treat the paired Desktop as a cloud path or move Local/BYOK data into Managed Cloud — Remote Control is a window, not a trust mode.
- Do **not** send `agi_api_key` or unredacted page content over the bridge, or accept non-loopback bridge URLs (`0.0.0.0`, LAN IPs).
- Do **not** downgrade the native channel to no-MAC once a session secret exists, or auto-execute host-supplied action plans without `validateShortcutActions` + approval gates.
- Do **not** add Chrome-side memory/conversation/Projects sync, in-extension billing, or QR/WS transports without the THREAT_MODEL §6 checklist and supervisor sign-off.
- Do **not** hardcode provider model IDs (Chrome runs no inference; IDs come only from `packages/contracts/types/src/models.json`), reference Supabase, or reintroduce removed tiers ("Plus", `pro_plus`, "Hobby"). Plans are Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.

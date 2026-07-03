# AGI Desktop — Volume 28 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/desktop/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; and the real repo paths cited inline and in the Repository map below.

## Overview & stance

This volume defines how AGI Desktop behaves when things break. Desktop is the full-trust surface — Local + BYOK + Managed Cloud, each with a visible label — and the local-private compute host for the suite (Tauri v2 Rust `src-tauri` + React + Vite). The governing rule for every failure: a fault in one trust mode must never silently degrade into another. If Managed Cloud is unreachable, the app never quietly forwards a Local chat to BYOK, nor a BYOK request through the managed gateway; recovery is same-mode retry or an explicit, consented, labeled mode switch. Local chats and files stay local through every error path. The central error catalog (`apps/desktop/src/constants/errorMessages.ts`) enumerates most cases with `title`, `message`, `suggestions`, and a `recoverable` flag; the tracked gap is wiring every failing path to the right key with consistent retry/backoff.

## No Internet

Loss of connectivity must never brick the app. Desktop listens for `online`/`offline` and updates `appModeStore`, surfacing a toast ("You're offline. Switch to Local Mode or reconnect.") and a persistent `OfflineIndicator` (`apps/desktop/src/App.tsx`). Local mode must stay fully usable offline (on-device inference, local files, local history). Cloud/BYOK sends must be queued or blocked with a clear reason, never dropped silently, via the offline queue/sync layer (`apps/desktop/src/features/offline-indicator/`). ✅ Built (detection, indicator, queue scaffolding); 🟡 the guarantee that every Cloud/BYOK action enqueues and replays idempotently is the gap.

## Cloud Service Unavailable

When the managed gateway or Neon is reachable but erroring (5xx, health-down, or the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch re-gates), Cloud chat must fail with `NETWORK_ERROR`/`NETWORK_TIMEOUT` copy and offer explicit fallbacks — retry, or a labeled switch to Local. Delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`) must degrade to local-only reads and resume from the last cursor with tombstone/idempotent-upsert semantics on recovery; no partial write may corrupt local rows. 🟡 Partial — error copy and offline queue exist; managed-gateway health probing and typed cloud-outage UX are 🔭 Planned.

## Authentication Failure

Clerk auth failures must be recoverable without data loss. `AUTH_FAILED` and `TOKEN_EXPIRED` are catalogued (`apps/desktop/src/constants/errorMessages.ts`); expired tokens trigger silent refresh, and hard auth failure drops only Cloud access — Local and BYOK keep running (Local needs no account; BYOK keys live in the OS keychain, `keyring = "3"` in `apps/desktop/src-tauri/Cargo.toml`). A failed sign-in must not wall an account-less local user out. 🟡 Partial — error keys defined and keychain isolates BYOK; refresh-then-resume and the "auth-down but Local still works" guarantee need per-path verification.

## Upload Failure

File attach/upload failures (unreadable, oversize, network drop mid-upload) must report `FILE_NOT_FOUND`/`DISK_FULL` copy and never leave a half-written artifact. A Local-mode attachment stays on disk — a failure must not be "resolved" by silently routing the file to Cloud/BYOK; any cross-boundary transfer is the explicit Local→BYOK fork (context selection, secret scan, payload preview, provider label, consent). 🟡 Partial — error catalog present; resumable/chunked upload and a preflight size/type check are 🔭 Planned.

## Streaming Failure

Token and tool-call streams must fail visibly, not hang. Tool progress arrives as structured `Started`/`Progress`/`OutputChunk` events with a final-chunk flag (`apps/desktop/src-tauri/src/ui/events/tool_stream.rs`), consumed by `apps/desktop/src/features/chat/useTauriStreamListeners.ts`. On mid-stream disconnect the partial response is preserved, marked incomplete, with retry/continue — never spin forever. 🟡 Partial — structured events are ✅ Built; automatic reconnect/resume is 🔭 Planned.

## Provider Failure

An upstream provider error (invalid key, quota, 5xx, content filter) must surface `LLM_API_ERROR`/`API_RATE_LIMIT`/`LLM_CONTENT_FILTER` with the failing provider named. Routing lives in `apps/desktop/src-tauri/src/core/llm/{llm_router.rs,provider_adapter.rs}`. Failover, where offered, stays inside the same trust mode and shows the substitute provider/model label — never a silent BYOK↔Cloud switch. Model IDs come only from `packages/types/src/models.json`. 🟡 Partial — router/adapter normalize provider errors; same-mode failover UX with visible relabeling is 🔭 Planned.

## Local Model Failure

Local inference can fail from a stopped runtime, a missing weight, or OOM. The Ollama provider (`apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`) must report "runtime not running / model not pulled" distinctly from a generation error, and local STT must report a missing model ("Whisper model not found … Please download it first", `apps/desktop/src-tauri/src/features/speech/local_stt.rs`). OOM must map to `OUT_OF_MEMORY` and never crash the shell; weight size is shown before allocation. 🟡 Partial — provider + STT error paths exist; a unified local-model health/preflight surface is 🔭 Planned.

## Disk Full

A full disk must be caught before it corrupts state. Writes to SQLite (SQLCipher-backed rusqlite, `apps/desktop/src-tauri/Cargo.toml`), artifacts, downloads, and logs must handle `ENOSPC` and raise `DISK_FULL` (`recoverable: false`), leaving prior data intact via atomic temp-then-rename writes. 🟡 Partial — `DISK_FULL` copy exists; a free-space preflight before large local-model/download writes is 🔭 Planned.

## Permission Denied

OS permission denials (filesystem, keychain, computer-use/automation, screen capture, mic) must map to `PERMISSION_DENIED` with a path to grant access, never a silent no-op. Tauri capabilities are declared in `apps/desktop/src-tauri/capabilities/default.json`; the companion host binds `127.0.0.1` only, with bridge-token/IP-lockout (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`). A denied keychain read degrades BYOK gracefully, never leaking keys to logs. 🟡 Partial — error key + scoped capabilities exist; per-permission remediation deep-links (e.g. macOS TCC) are 🔭 Planned.

## Corrupted Database

The local encrypted DB must survive corruption without data-loss surprises. `DATABASE_LOCKED` (recoverable — retry/backoff) and `DATABASE_CORRUPTED` (not recoverable — restore/reset) are catalogued; rusqlite ships with the `backup` feature and SQLCipher (`apps/desktop/src-tauri/Cargo.toml`), DB access serialized through `apps/desktop/src-tauri/src/data/async_sqlite.rs`. Requirement: integrity check on open, quarantine-and-rebuild on corruption, and periodic backups so "restore from backup" is real. 🟡 Partial — copy + backup-capable driver exist; auto integrity check, quarantine, and scheduled backup are 🔭 Planned.

## Interrupted Downloads

Long downloads (local-model weights, updates) must resume, not restart. `download_model` streams with a `(bytes_downloaded, total_bytes)` progress callback and checks "already downloaded" (`apps/desktop/src-tauri/src/features/speech/local_stt.rs`); the updater emits `updater:downloading` progress. Requirement: verify a partial file's integrity, resume via range request, and never mistake a truncated file for complete. 🟡 Partial — progress + existence checks exist; byte-range resume and checksum validation are 🔭 Planned.

## Update Failure

Updates must fail safe. The updater verifies Ed25519 signatures against a key embedded via `tauri.conf.json` before install (`apps/desktop/src-tauri/src/features/updater.rs`; hardening in `apps/desktop/src-tauri/src/sys/security/updater.rs`), emits `updater:error`, and a failed/rejected update leaves the current version fully working. Requirement: verify before applying, atomic swap, and a recoverable state if the new binary won't launch. ✅ Built (signed verify + error events) / 🔭 rollback-on-failed-launch, staged rollout.

## Repository map

- `apps/desktop/src/App.tsx`, `apps/desktop/src/features/offline-indicator/{index.tsx,offlineQueue.ts,offlineSync.ts}`, `apps/desktop/src/lib/offline/offlineSync.ts` — offline detection, UX, queue/replay.
- `apps/desktop/src/constants/errorMessages.ts` — error catalog; `apps/desktop/src/features/error-handling/ErrorBoundary.tsx` — renderer fault containment.
- `apps/desktop/src-tauri/src/ui/events/tool_stream.rs`, `apps/desktop/src/features/chat/useTauriStreamListeners.ts` — streaming events.
- `apps/desktop/src-tauri/src/core/llm/{llm_router.rs,provider_adapter.rs,providers/ollama.rs}` — provider routing + local runtime.
- `apps/desktop/src-tauri/src/features/speech/local_stt.rs` — resumable model download.
- `apps/desktop/src-tauri/src/data/async_sqlite.rs`, `apps/desktop/src-tauri/Cargo.toml` — DB, SQLCipher, backup, keyring, updater plugin.
- `apps/desktop/src-tauri/src/features/updater.rs`, `apps/desktop/src-tauri/src/sys/security/updater.rs` — signed updates.

## Competitor notes

Claude Desktop and ChatGPT Desktop are single-provider, cloud-first Electron apps: lose connectivity or auth and the product is largely inert. Codex/Claude Code degrade to a terminal. AGI Desktop's divergence is local-first resilience across a multi-provider matrix: with the network down, Local mode keeps working end-to-end; provider or cloud outages are recoverable in-mode and never resolved by silently crossing a trust boundary. Every fallback shows the real provider/model label rather than faking availability.

## Acceptance / Definition of Done

Edge-case handling is production-ready when every failure maps to a typed error, a clear recovery, and no trust-boundary leak — verified per mode on macOS/Windows/Linux.

- [ ] Build: each catalog key (`errorMessages.ts`) is reached by its real failing path; streams, uploads, and downloads resume or fail explicitly (no infinite spinners).
- [ ] Trust: offline/cloud/provider/auth failures never route Local→BYOK/Cloud silently; fallbacks are explicit, consented, and labeled.
- [ ] Security/data: DB integrity-checked on open with backup/quarantine; updates signature-verified with a working-version fallback; keychain denial degrades BYOK without leaking keys.

## Anti-patterns

- Do not resolve a Cloud/BYOK failure by silently sending a Local chat or file elsewhere; Local→BYOK is explicit only.
- Do not swallow errors into infinite spinners or a bare "something went wrong" — use the typed catalog.
- Do not mistake a truncated download or half-written DB/artifact for complete; verify integrity.
- Do not apply an unsigned/unverified update, or leave the app without a working previous version.
- Do not log secrets on keychain/permission failure; degrade BYOK gracefully.
- Do not hardcode/invent model IDs (use `packages/types/src/models.json`), reference Supabase (Clerk + Neon + Stripe only), or cite removed tiers (Plus/pro_plus/Hobby) or top-ups; pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.

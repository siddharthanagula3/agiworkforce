# Desktop Bug Hunt — 2026-06-20

Status: Current
Owner: Desktop lead
Surface: `apps/desktop` (Tauri: Rust `src-tauri/` + React/TS `src/`)

Method: spec-driven (desktop AGENTS.md contract baked into finders) → 16 finders (Rust native + frontend, high-risk double-covered) → adversarial verify (verbatim grounding, by-design exclusions, critical/high double-verified) → manual self-confirmation. 31 confirmed (1 critical / 9 high / 14 medium / 7 low); 6 refuted, 1 disputed. Ground truth: cargo check ✅, typecheck ✅.

Permission-gating applied: the critical sandbox escape + clear safe fixes applied now (they only tighten safety); architectural trust-boundary / shell-exec / IPC-surface changes listed for **sign-off**.

## Fixed now — verified (cargo check, typecheck, tool_executor 160 + nlp_parser 72 tests green)

| # | Sev | Title | File | Fix |
|---|-----|-------|------|-----|
| 13 | **critical** | LLM file tools: un-canonicalized `..` path returned as "validated" → write outside sandbox (RCE via persistence) | `src-tauri/.../core/llm/tool_executor/mod.rs:689` | Fail closed on any residual `ParentDir` component before the allowed-dir check (mirrors `file_ops.rs`). |
| 15 | **high** | LLM file tools bypassed the blocked-paths denylist → agent could read `~/.ssh`, `~/.aws/credentials`, cookies, shell history | same primitive `canonicalize_validated_path` | Added `blocked_paths::is_blocked` (narrow secrets denylist; project files unaffected). |
| 21 | **high** | `errorTracking.captureError/Message` sent Sentry exceptions in **local mode** (no privacy gate) | `src/services/errorTracking.ts:144` | Added `isLocalMode()` guard (mirrors `analytics.track`). |
| 20 | **high** | Crash-reporting toggle OFF never tore down Sentry — auto-capture kept flowing | `src/services/errorTracking.ts:110` | `Sentry.close()` on disable. |
| 19 | **high** | Auto-approve-tools safety toggle desynced from backend on IPC failure (no rollback) | `src/stores/settingsStore.ts:1011` | Capture previous value, roll back + rethrow on failure (mirrors `setAgentMode`). |
| 4 | medium | OOB index panic in WAV decoder via `voice_transcribe_file` IPC | `src-tauri/.../sys/commands/voice.rs:623` | Bound-check `pos+24 <= len` before reading fmt fields. |
| 5 | medium | `chrono::Duration` panics on out-of-range LLM-supplied schedule value (+ `amount*30` overflow) | `src-tauri/.../core/scheduler/nlp_parser.rs:227` | Fallible `try_seconds/minutes/...` + `checked_mul`, map to `ParseError`. |

## SIGN-OFF REQUIRED — high-blast-radius (shell exec / trust-boundary egress / native FS / IPC surface)

| # | Sev | Title | File |
|---|-----|-------|------|
| 16 | **high** | Autonomous tool-loop runs `terminal_execute` via `bash -c` with only a 14-pattern substring blocklist — shell metachars (`;`,`&&`,`|`,backticks,`$()`,redirects) not blocked, no sandbox, no HITL | `src-tauri/.../sys/security/tool_guard.rs:2425` |
| 18 | **high** | Local-mode chat can silently route inference to Managed Cloud — router `candidates()` has no local-mode gate | `src-tauri/.../core/llm/llm_router.rs:938` |
| 14 | **high** | `file_write_text/binary` bypass the centralized blocked-paths denylist and write the raw (uncanonicalized) path without `O_NOFOLLOW` | `src-tauri/.../sys/commands/file_ops.rs:1830` |
| 17 | **high** | `mcp_get_config` leaks remote MCP `bearer_token`/`api_key`/Authorization headers to the renderer (redaction is env-only) | `src-tauri/.../sys/commands/mcp.rs:1066` |
| 22 | **high** | Canvas HTML artifact renders model HTML in an iframe with NO CSP + `allow-popups` (defeats `connect-src 'none'`) | `src/features/canvas/ArtifactPreview.tsx:63` |
| 23 | medium | `error_report` Sentry egress ignores the `crash_reporting_enabled` consent toggle and all privacy gating | `src-tauri/.../sys/commands/error_reporting.rs:25` |
| 24 | medium | OPA computer-use destructive-action confirmation gate is structurally dead (`require_confirmation` always false) | `src-tauri/.../automation/computer_use/observe_plan_act.rs:370` |
| 26 | medium | Unauthenticated cross-origin `POST /pair` lets any web page rotate+read the bridge pair token (CSRF-on-localhost) | `src-tauri/.../integrations/realtime/websocket_server.rs:494` |
| 25 | medium | DB-password commands operate on an orphan DB at a different path with a plain (no-SQLCipher) connection | `src-tauri/.../sys/commands/database.rs:1037` |
| 27 | medium | MCP filesystem server keeps stale granted directories when allowed-dir list is emptied | `src/stores/settingsStore.ts:1347` |
| 28/29 | medium | CSP injection no-ops for full-document HTML artifacts without `<head>` (HtmlArtifact + WebRenderer) | `src/features/chat/artifacts/HtmlArtifact.tsx:210`, `src/features/artifacts/ArtifactRendererView.tsx:348` |
| 30 | low | Fully-functional ungated cloud `SyncManager`/`CloudSyncClient` exists (POSTs local data) — dead today, latent egress if wired | `src-tauri/.../integrations/sync/manager.rs:44` |
| 31 | low | Loopback `/pair` rotates the bridge token with no Origin/CSRF check → any website can DoS the desktop↔extension bridge | `src-tauri/.../integrations/realtime/websocket_server.rs:601` |

## Safe-contained, deferred for time (fixable in a follow-up pass)

- #1 `document_create_*` `resolve_output_path` allows arbitrary absolute path + `..` traversal (no validation/HITL) — `sys/commands/document.rs:335`
- #2 Remote MCP transport creds (bearer/api_key/headers) persisted plaintext — `core/mcp/config.rs:217`
- #3 Local MCP HTTP server single `read()` truncates valid requests — `core/mcp/server/http_server.rs:104`
- #6 SQLCipher migration doesn't checkpoint/remove plaintext WAL/SHM sidecars — `data/db/encryption.rs:176`
- #7 Custom-model BYOK API key silently discarded while UI says "stored" — `src/features/settings/CustomModelsSettings.tsx:262`
- #8 `computer_use_zoom_region` writes PNG to arbitrary unvalidated path (dialog omits it) — `automation/computer_use/zoom.rs:345`
- #9 QueryBuilder WHERE uses denylist not parameterized bindings (db_build_* IPC) — `data/database/query_builder.rs:548`
- #10 JS string-literal injection via single-quote-only escaping in CDP handlers — `integrations/realtime/websocket_server.rs:1387`
- #11 Auth-lockout keyed by peer IP on loopback listener → one client locks out all — `integrations/realtime/websocket_server.rs:761`
- #12 Final streamed chunk truncated (buffer cleared without flush on stream-end) — `src/features/chat/index.tsx:453`

## By-design (excluded, not bugs)

Cloud-sync `"cloud"→"local"` coercion in `settings_load_from_disk`; the removed "Sync chat history to cloud" toggle; managed cloud waitlisted (CLOUD-01); Local+BYOK+Subscription support; `chatStorageMode` default `"local"`.

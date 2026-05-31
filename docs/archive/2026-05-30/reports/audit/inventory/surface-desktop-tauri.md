# Inventory Audit — Desktop Tauri Backend (Rust)

Slice: `apps/desktop/src-tauri/src` (Rust, `agiworkforce-desktop` shipping binary + `native_messaging_host` bin)
Auditor: inventory recon subagent
Date: 2026-05-29
Mode: READ-ONLY recon. No source edited.

## Scope & Method

- 742 `.rs` files, ~379K total LOC (incl. tests/doc-comments). This is one of the largest slices in the repo.
- Top-level dirs by file count: `core` (260), `sys` (241; of which `sys/commands` = 153), `features` (90), `automation` (55), `data` (43), `integrations` (24), `ui` (22), `tests` (4), `bin` (1), plus `lib.rs`/`main.rs`.
- I did NOT read all 742 files. Approach: (a) systematic Grep signal collection over the whole slice for panic/unwrap/expect/todo, byte-slice indexing, command/shell exec, secret logging, token comparison, cloud boundary; (b) targeted Read of `lib.rs` (entry/wiring), the security-sensitive files (updater, command_validator, terminal, native messaging host, realtime websocket server, computer_use, cloud boundary), and every suspicious hit from the greps.
- Triage discipline: I distinguished test-module code (`#[cfg(test)]`, `tests.rs`, `_tests.rs`, doc-comments) from production. Most raw signal counts collapse to near-zero once test code and lock-guards are excluded (see Panic section).

## Purpose & Architecture

The Tauri backend is the local-first desktop engine. `lib.rs` (`run()`, 2798 lines) is the single wiring point: it opens a **SQLCipher-encrypted** SQLite DB (key derived from machine identity via `derive_key(KeyPurpose::DatabaseEncryption)`), runs migrations, `app.manage()`s ~80 state objects, spawns background loops (scheduler, MCP init, orchestrator, task loop, realtime WS server), and registers ~1496 `#[tauri::command]` handlers in one `generate_handler![...]` block (explicitly documented as the SOLE registration source of truth; macro registry deleted; `apps/desktop/check-wiring.sh` enforces).

Functional domains: chat/LLM routing (`core/llm`, `sys/commands/chat`), AGI orchestration/executors (`core/agi`), computer-use/browser automation (`automation`, `sys/commands/computer_use`), MCP client/server/extensions, security subsystem (`sys/security`, 29 files), messaging connectors (Discord/Telegram/Slack/Signal/WhatsApp/Teams), email (IMAP/SMTP/Gmail OAuth), productivity (Notion/Trello/Asana), cloud storage connectors (Drive/Dropbox/OneDrive), realtime collaboration WS server, and the browser-extension native-messaging bridge.

Notable: a second binary `bin/native_messaging_host.rs` is the Chrome/extension <-> desktop bridge (connects to the in-app WS server on loopback and authenticates with a per-launch token).

## Alive vs Dead

- **Alive (shipping):** the `agiworkforce-desktop` binary compiles all of `automation`, `core`, `data`, `features`, `integrations`, `sys`, `ui`. Despite the brief's cargo-tree note that Desktop's *external workspace-crate* dependency is only `sandbox-policy`, the vast majority of code here is **in-crate** (this package's own modules) and is reachable from `lib.rs`/`main.rs`. The `pnpm check:module-reachability` guard (CI-enforced, `scripts/check-module-reachability.mjs`) keeps orphan `.rs` files at a zero baseline. Per `known-flaws.md` DESKTOP-RUST-ORPHAN-01 = **Fixed**; I did not find new orphans.
- **DEAD-by-design (intentional, not defects):** the managed-cloud chat commands `cloud_get_conversations / cloud_create_conversation / cloud_delete_conversation / cloud_get_messages / cloud_create_message / cloud_update_conversation_title` (`sys/commands/chat/cloud.rs`) are all registered in `lib.rs` but every body returns `Err("[ERR_CLOUD_NOT_IMPLEMENTED] ...")`. This correctly **fails closed** to honor the v1 LOCAL-ONLY lock (`docs/locks/v1-local-only-cloud-waitlist-2026-05-18.md`). Not a defect.
- **Half-built / non-functional features (see Broken section):** `tray_set_unread_badge` (no-op), `google_batch_*` (in-memory mock), `memory_get_usage_trends` (hardcoded trend field).

## Test Coverage

Strong. 4280 `#[test]`/`#[tokio::test]` functions; 460 files carry inline `#[cfg(test)]`; 59 dedicated `tests.rs`/`*_tests.rs` files. Security-sensitive areas (command_validator, dispatch_hmac, api HMAC, realtime pair handshake, tool_confirmation truncation, computer_use safety) all have unit tests. Verification commands per `apps/desktop/AGENTS.md`: `cargo check -p agiworkforce-desktop`, `pnpm --filter @agiworkforce/desktop test`. (I did not run builds per task rules.)

## Panic / Crash Sites

Raw counts are misleading; after triage the production panic surface is **small and dominated by genuine invariants**, with one real class of bug (UTF-8 byte-slicing).

Raw signal counts (whole slice): `unwrap()` 2155, `expect(` 1085, `panic!/todo!/unimplemented!/unreachable!` 164, `unsafe` 154.

Triage results:
- **`panic!` (164):** every non-test occurrence I checked is a `#[cfg(test)]` assertion (`panic!("Expected X, got {:?}")`), e.g. `core/scheduler/nlp_parser.rs`, `core/llm/thinking.rs`, `core/agi/executors/calendar_executor.rs`, `core/artifacts/renderer.rs`. `core/sync_utils.rs:108 panic!("Intentional panic to poison mutex")` is a test helper. **Zero production `panic!`.** Zero production `unimplemented!`/`todo!()`.
- **`unwrap()` (2155):** In `sys/commands`, scanning every file for unwraps *before* the `#[cfg(test)]` boundary and excluding `.lock()/.read()/.write().unwrap()` + safe static patterns yields **0** production unwraps. Same scan over `core`/`automation`/`features`/`integrations`/`data`/`ui` yields **0** after excluding whole-file `tests.rs` modules and doc-comments. The 47 `lock().unwrap()` are mutex-poison invariants. **No user-reachable `unwrap()` panic found.**
- **`expect(` (1085):** Production expects are all genuine invariants: static regex compilation (`safety_patterns.rs`, `prompt_injection.rs`, `computer_use/safety.rs`, `nlp_parser.rs`), HMAC fixed-key acceptance (`machine_key.rs`, `dispatch_hmac.rs:371` — RFC 2104), JSON serialization of primitives, in-memory SQLite construction ("should never fail" degraded fallbacks), static RFC3339 date literals (`permissions.rs:129/135`), `spawn_blocking` join (propagates inner panic), and `models_config.rs:30 expect("models.json is invalid")` (build-time constant). None operate on untrusted runtime input.
- **UTF-8 byte-slice panics (REAL BUGS — escalated to P0):** `&s[..N]` on byte offsets where `s` is user/arbitrary content panics if byte N lands mid-codepoint.

  **CRITICAL multiplier:** workspace `Cargo.toml:64` sets `[profile.release] panic = "abort"`. In release builds a panic is NOT unwound/caught — it **aborts the entire desktop process**. So every byte-slice panic on a common path is an app-crash / data-loss-in-flight bug, i.e. **P0**, not a contained error. (In debug/unwind it would surface as a hung/failed IPC promise.)

  This is a **recurring bug class**, not isolated. The brief flagged prior byte-slice P0s as "fixed at orchestrator.rs/code_executor.rs"; those two files are now clean, but a slice-wide re-sweep found **fresh instances the fix pass missed**. Confirmed user-reachable sites (all `String`/`Value::String` content, verified):
  - `sys/commands/file_ops.rs:1394` — `&content[..500]` in `fs_read_file_content`. Arbitrary file bytes. Highest trigger likelihood. **P0.**
  - `core/agi/executors/git_executor.rs:850` — `&diff_summary.diff_content[..10000]` building an LLM commit/PR prompt from git diff text. Source with multibyte at byte 10000 crashes AGI git ops. **P0.**
  - `core/agent/code_generator.rs:187` and `:357` — `&content[..2000]` of existing file content fed to codegen. **P0.**
  - `core/hooks/event.rs:327` — `&prompt_str[..497]` truncating the user prompt in `HookEvent::with_prompt` (fires whenever a hook captures a prompt). **P0.**
  - `sys/commands/tool_confirmation.rs:540` — `&s[..47]` in `from_request()` confirmation summary for every confirmation-gated tool with a >50-char string param. **P0.**
  - `sys/commands/chat/tool_events.rs:250` — `pub fn truncate()` does `&s[..max.saturating_sub(3)]` with NO char-boundary walk; called at lines 120/126/131/198/203/216 on tool params (file paths, git commands, search queries). **P0.**
  - `core/llm/tool_executor/db_tools.rs:203` — `&query[..200]` user SQL preview (for logging). **P0/P1.**
  - `sys/commands/database.rs:233` — `&sql[..200]` preview of user SQL in `db_execute_prepared` (registered lib.rs:1715). **P1.**
  - `sys/commands/browser.rs:43` — `&script[..200]` preview of user script in the browser-tool confirmation builder. **P1.**
  - `core/llm/tool_executor/mod.rs:2020` — `&s[..27]` in `summarize_parameters` for tool params. **P1.**
  - `automation/computer_use/types.rs:320` — `&text[..50]` truncation of arbitrary typed text. **P1.**
  - `sys/commands/design.rs:356/362` — `parse_hex_color` slices `&hex[0..1]`/`&hex[0..2]` guarded by `hex.len()==3|6` (BYTE length); a single 3-byte UTF-8 char (e.g. "€") with `len()==3` panics before `from_str_radix`. Very low likelihood, ASCII-only in practice. **P3.**

  **The correct pattern already exists in-repo:** `core/agent/background_agent.rs:1458 truncate_string()` walks back to `is_char_boundary` before slicing. Every site above should route through a shared char-safe helper like that one (or use `s.char_indices()` / `chars().take(N)`).

  SAFE (not bugs): all `&uuid::Uuid::new_v4().to_string()[..8]` / `[..7]`, `&commit_hash[..8]`, `&session_id[..8]`, `hex::encode(&digest[..20])`, `&identity_hash[..16]`, `&cache_key[..16]` (hex/hash/uuid — ASCII); `chars().take(N)` patterns; `voice.rs:603 &audio_bytes[0..4]` and the WS/transport byte-buffer compares (length-guarded byte compares, not str slices).

### `.to_str().unwrap()` caveat (path-based panic class)
My "0 production unwraps" excludes `OsStr::to_str().unwrap()`, which panics on non-UTF-8 paths. I did not exhaustively confirm none of these touch `file_ops` path handling. Low likelihood (rare on macOS/Windows) but worth a follow-up grep. P3.

## TODO / FIXME / HACK

Only **6** non-test occurrences across 379K LOC (exceptionally low):
- `core/agi/core.rs:115` — TODO migrate to `tokio::sync::Mutex`.
- `automation/computer_use/window_manager.rs:525` — Linux window-id returns `None` for v1 (TODO X11/Wayland).
- `automation/computer_use/anthropic_agent.rs:715` — TODO wire `get_active_window_bundle_id()`.
- `core/agent/code_generator.rs:524/526` — string-literal "TODO" handling (not a code TODO).
- `sys/commands/migration.rs:8` — user-facing string mentioning TODO.md.

## Security-Sensitive Code (findings)

Overall this subsystem is **genuinely hardened** with a visible audit-fix trail (SEV-DESK-*, AUDIT-*, FIX-* tags), not slop:

- **Command/shell execution** (`sys/commands/terminal.rs`, `core/agi/executors/terminal_executor.rs`, `sys/commands/scheduler.rs`): `execute_terminal_command` chains `reject_if_root()` -> `write_security_audit_log()` -> `validate_command()` (centralized allowlist/dangerous-pattern/metachar/null-byte/length checks in `command_validator.rs`) -> `reject_unquoted_shell_metachars()` (shlex tokenization, blocks `; | < > \` && || $( &`) -> per-command confirmation for dangerous commands -> `canonicalize(cwd)`. Command is logged via `redact_secrets()`. No obvious injection bypass found in the one-shot path.
- **Updater** (`sys/security/updater.rs`): module intentionally emptied. The old HMAC-SHA256 (symmetric -> shipping the verify key = shipping the signing key) was removed; production uses Tauri native Ed25519/minisign (`tauri.conf.json` `plugins.updater.pubkey`, CI-held `TAURI_PRIVATE_KEY`). Correct.
- **Native messaging host** (`bin/native_messaging_host.rs`, `integrations/native_messaging/host.rs`): reads `.ipc_token` (created 0o600 atomically in lib.rs:884), authenticates to `ws://127.0.0.1:8787` and **fails closed** on auth failure/timeout (4s). Logs to stderr to avoid corrupting the Chrome stdout protocol. The two `unwrap_or_default()` on serialization are safe fallbacks.
- **Realtime WS server** (`integrations/realtime/websocket_server.rs`): binds `127.0.0.1` only, validates loopback origins, rate-limits connections (FD-exhaustion / token brute-force protection), compares the IPC token with **constant-time** `subtle::ConstantTimeEq::ct_eq` (line 683), supports runtime token rotation (`bridge_rotate_token`) and a POST `/pair` handshake.
- **HMAC dispatch / API sig** (`sys/security/api.rs:148/204`, `sys/security/dispatch_hmac.rs`): signature checks use constant-time compare.
- **DB encryption** (`lib.rs:245-296`, `data/db/encryption`): SQLCipher with machine-derived key; opening **fails hard** if encryption can't be established (refuses plaintext fallback) — correct security posture; one-time plaintext->encrypted migration on upgrade.
- **Computer-use** (`sys/commands/computer_use.rs`): every IPC entry point is gated on `require_confirmation` (SEV-DESK-09 fix specifically to stop a prompt-injected LLM from bypassing confirmation). Inner workers avoid double-prompts.
- **Cloud boundary**: managed-cloud chat commands fail closed (see Alive/Dead). `.env` is only loaded in debug builds (lib.rs:120, FIX-F10 — prevents `~/.env` LD_PRELOAD injection in release).
- **Secret logging**: searched all `tracing!/println!/eprintln!` for interpolated secret VALUES. Found only provider-name/error-message logging (`mcp_oauth.rs:638/707`, `core/mcp/config.rs:880/1050`). **No secret-value logging found.** `log_redaction::redact_secrets` is applied to terminal commands.

- **Path traversal — DEFENDED** (focus-area check): `file_ops.rs validate_path_security()` (file_ops.rs:71) canonicalizes then rejects `..` in the canonical path (AUDIT-FIX H-15 also pins writes to nonexistent files to a real parent). Both `fs_read_file_content` (line 416-418) and the write path (488-490) additionally call `sys/security/blocked_paths::is_blocked()` (denylist: `.ssh/`, `.aws/credentials`, `.gnupg/`, `.kube/config`, `.netrc`, browser Cookies/Login Data, shell histories, `/etc/shadow`, `/etc/sudoers`). Caveat: `is_blocked` is a **substring denylist**, not an allowlist — it does not cover every secret file (e.g. arbitrary `.env`, `~/.config/gh/hosts.yml`). Hardening gap, not a hole. P3.
- **SQL injection — DEFENDED** (focus-area check): `db_build_insert`/`db_build_update` (database.rs:577/617) route through `QueryBuilder::build_parameterized()`, which (a) binds all VALUES as `$N` placeholders for the driver and (b) validates every identifier via `validate_sql_identifier()` + `validate_table_whitelist()` for table, columns, and RETURNING columns (`query_builder.rs:`build_insert_parameterized`). `build()` even hard-errors for INSERT/UPDATE to force the parameterized path. No identifier-interpolation injection found.

### Security concerns (lower severity)
- **`.env` load loop** (`lib.rs:126-146`): debug-only and uses `std::env::set_var` before tokio (single-threaded) — acceptable as noted, but is `#[allow(clippy::disallowed_methods)]`; relies on `debug_assertions` gating staying intact. P3.
- **Port-config drift**: realtime server reads port from `AGI_REALTIME_PORT` (lib.rs:871) but `native_messaging_host.rs:108` hardcodes `8787`. If the env override is set, the native bridge silently can't connect. P3 (config/robustness, not exploit).

## AI-Slop

Low overall for the size of the slice. Concrete instances:
- **`sys/commands/memory.rs:621 memory_get_usage_trends`** — returns real counts but a **hardcoded `"trend": "stable"`** string regardless of data. The command is named "usage trends" and renders a fabricated trend to the user. P2.
- **`sys/commands/tray.rs:4 tray_set_unread_badge`** — registered (lib.rs:1186) but body is `tracing::debug!(...placeholder...); Ok(())`. No badge is ever set; the frontend "unread badge" feature is a no-op. P2 (broken feature).
- **`sys/commands/google_batch.rs`** — header comment line 6: "currently a mock/stub implementation using in-memory storage". Whole feature backed by `BATCH_JOBS`/`EMBEDDINGS_JOBS` static HashMaps; jobs lost on restart. `google_batch_is_beta_stub()` returns `true` to drive a "BETA: in-memory only" UI banner. Honestly documented but a half-built shipping feature. P2.
- False positives I confirmed are NOT slop: `::placeholder`/`:placeholder-shown` CSS selectors (browser_tools), `{{key}}` template placeholders (prompt_engineer, skills), `<from_oauth:...>` env placeholders (intentional secret indirection), MockProvider in tests.

## Broken / Half-Built Features (file:line evidence)

1. Unread-badge tray feature — `sys/commands/tray.rs:4` no-op `tray_set_unread_badge`, wired at `lib.rs:1186`. Dead button-equivalent.
2. Google Batch — `sys/commands/google_batch.rs:6` mock/in-memory only; no persistence; survives only in-process.
3. Memory usage trends — `sys/commands/memory.rs:621` fabricated `"trend":"stable"`.
4. Managed cloud chat (DEAD-by-design, intentional) — `sys/commands/chat/cloud.rs:41-86` all return `[ERR_CLOUD_NOT_IMPLEMENTED]`; `transfer_local_to_cloud`/`transfer_cloud_to_local` read locally then hit the fail-closed cloud layer. Correct per LOCAL-ONLY lock; flagged only so reviewers know these IPC commands are non-functional.
5. Linux active-window id — `automation/computer_use/window_manager.rs:525` returns `None` on Linux (v1 gap); `anthropic_agent.rs:715` window bundle-id not wired.

## Severity-Ranked Issues

NOTE: byte-slice panics are P0 because `Cargo.toml:64 panic = "abort"` makes a release-build panic abort the whole app. A single shared char-safe truncation helper (pattern already at `core/agent/background_agent.rs:1458`) fixes the whole class.

- **P0** — `sys/commands/file_ops.rs:1394` `&content[..500]` byte-slice panic in `fs_read_file_content`. Any file whose byte 500 is mid-codepoint crashes the app on a common path (file read).
- **P0** — `core/agi/executors/git_executor.rs:850` `&diff_summary.diff_content[..10000]` byte-slice panic building an LLM prompt from git diff text. Crashes AGI git/commit operations on multibyte source.
- **P0** — `core/agent/code_generator.rs:187` and `:357` `&content[..2000]` byte-slice panic on existing file content during code generation.
- **P0** — `core/hooks/event.rs:327` `&prompt_str[..497]` byte-slice panic in `HookEvent::with_prompt`; fires on hook-captured user prompts.
- **P0** — `sys/commands/tool_confirmation.rs:540` `&s[..47]` byte-slice panic in `from_request()` confirmation summary; triggers for any confirmation-gated tool with a >50-char multibyte param.
- **P0** — `sys/commands/chat/tool_events.rs:250` `truncate()` byte-slice panic (no char-boundary walk); called on tool params (paths, git cmds, search queries) at lines 120/126/131/198/203/216.
- **P1** — `core/llm/tool_executor/db_tools.rs:203` `&query[..200]`; `sys/commands/database.rs:233` `&sql[..200]`; `sys/commands/browser.rs:43` `&script[..200]`; `core/llm/tool_executor/mod.rs:2020` `&s[..27]`; `automation/computer_use/types.rs:320` `&text[..50]` — same byte-slice class, lower-traffic paths.
- **P2** — `sys/commands/memory.rs:621` fabricated `"trend":"stable"` rendered to users. Fix: compute a real trend or drop/rename the field.
- **P2** — `sys/commands/tray.rs:4` no-op unread-badge command wired at lib.rs:1186. Fix: implement via tray/badge API or remove command + frontend caller.
- **P2** — `sys/commands/google_batch.rs` mock-only (in-memory) feature; jobs lost on restart. Fix: persist or keep beta-gated with clear UX.
- **P3** — `sys/commands/design.rs:356/362` `parse_hex_color` byte-slice with byte-length guard; multibyte 3-byte input panics. Fix: validate ASCII.
- **P3** — `sys/security/blocked_paths.rs` is a substring denylist (incomplete coverage of secret files). Consider an allowlist/workspace-scoping model.
- **P3** — Port drift: `native_messaging_host.rs:108` hardcoded `8787` vs `AGI_REALTIME_PORT` override (lib.rs:871). Fix: host should read the same config.
- **P3** — `lib.rs:126-146` debug-only `.env` loader relies on `debug_assertions` gating; documented but fragile.
- **P3** — `OsStr::to_str().unwrap()` path-panic class excluded from my unwrap sweep; verify `file_ops` path handling doesn't hit it on non-UTF-8 paths.

## Open Questions / Uncertainty

- Resolved during this pass (advisor-prompted): panic strategy IS `panic = "abort"` (Cargo.toml:64) → byte-slice panics are P0. The byte-slice sweep was re-run **slice-wide** (not just the original 4 dirs) and found additional sites (git_executor, code_generator, hooks/event, db_tools, tool_events, computer_use/types). Path traversal and SQL-identifier injection on `file_ops`/`database` were checked and are DEFENDED.
- I confirmed the byte-slice **call sites** are in registered, user-reachable commands and operate on `String`/`Value::String` content, but did not exercise them at runtime (no builds run per task rules). Trigger requires specific multibyte content at the exact byte boundary; likelihood is highest for `file_ops` (arbitrary files), `git_executor` (source diffs), `code_generator` (file content), `tool_events`/`tool_confirmation` (any tool param).
- I did NOT exhaustively read all 742 files. High-confidence coverage: `lib.rs` wiring, all of `sys/security`, terminal/command-exec paths, native messaging, realtime server, computer_use gating, cloud boundary, and every grep hit for the dangerous patterns. Lower coverage (signal-grep only, no full read): large swaths of `core/agi/executors`, `core/llm/providers`, `features/messaging`, `features/productivity`, `integrations/*`. The grep sweeps (unwrap/expect/panic/byte-slice/secret-log/shell) covered those, and came back clean for production panics and secret logging, but a deep logic-bug audit of those modules was out of scope for this recon pass.
- `unsafe` count is 154; I confirmed the macOS `AXIsProcessTrusted`/accessibility FFI is the expected category and did not audit every `unsafe` block individually. Worth a dedicated `unsafe` review pass.
- I could not consult the advisor (rate-limited across the session) to sanity-check severity calls; severities are my own judgment.

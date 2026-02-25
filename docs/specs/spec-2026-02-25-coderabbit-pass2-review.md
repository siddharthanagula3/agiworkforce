# Specification: CodeRabbit Pass 2 -- Full Codebase Review

Generated: 2026-02-25T12:00:00Z

## Task Overview

Five parallel reviewer agents will perform a CodeRabbit-style deep review of the AGI Workforce monorepo. Each agent owns a non-overlapping zone of the codebase. Pass 1 fixed 11 issues; Pass 2 must (a) verify those fixes did not regress adjacent code, (b) find new issues using the anti-patterns learned in Pass 1, and (c) produce findings in a uniform format.

This spec is the single source of truth for all five agents. Read it completely before beginning work.

---

## Team Composition

| Agent   | Role                                   | Zone                                                                              |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| Agent 1 | **logic-bug-reviewer**                 | Zone A -- LLM core, agent runtime, AGI orchestration, research, swarm, automation |
| Agent 2 | **security-reviewer (commands + web)** | Zone B -- Rust command handlers, web admin/auth/payment routes, middleware        |
| Agent 3 | **security-reviewer (data layer)**     | Zone C -- Data access layer, database clients, encryption, secrets                |
| Agent 4 | **test-coverage-reviewer**             | Zone D -- All test files (Rust + TypeScript), cross-referencing Zones A-C         |
| Agent 5 | **config-dependency-reviewer**         | Zone E -- Cargo.toml, package.json, CI/CD workflows, Tauri capabilities           |

---

## Output Format (all agents MUST use)

Every finding must be reported as:

```
### [SEVERITY] FINDING_ID: Short title

- **File:** absolute path
- **Line(s):** line range
- **Category:** logic-bug | security | test-gap | config | regression
- **Description:** 2-3 sentences explaining the issue
- **Evidence:** code snippet or reasoning
- **Recommendation:** concrete fix suggestion
- **Cross-zone:** (optional) note if another zone's agent should also look
```

Severity levels: `[C]` Critical, `[H]` High, `[M]` Medium, `[L]` Low, `[I]` Informational.

Do NOT re-flag NEEDS_HUMAN items listed in the exclusion section below unless you have a genuinely new angle.

---

## NEEDS_HUMAN Exclusions (do not re-flag)

These were triaged in Pass 1 as requiring human decisions. Skip them unless you find a new exploitation vector:

- C2: `execute_query()` raw SQL in `sql_client.rs`
- C3: `QueryBuilder` string concatenation in `query_builder.rs`
- C4: `/api/device/link` has no auth (`device/link/route.ts`)
- C5: `$HOME/**` broad read grants in `capabilities/default.json` (allowlist model needed)
- H1: IDOR on 4 repository functions (`repository.rs`)
- H2/H3: JWT global static + `auth_retrieve_session` exposure
- H7: Stripe webhook signature check gap
- H8: CSRF anon session regeneration
- H9: Device poll legacy no-fingerprint path
- H10: Credit double-spend (mitigated with `SELECT ... FOR UPDATE`)
- H11: SQL validation incomplete in `query_builder.rs`
- H13: `validate_path` traversal
- H14: Cost cap no rollback
- H16/H17: CI/CD workflow hardening
- H18-H28: Various quality/test issues already cataloged

---

## Zone A -- Business Logic, LLM Core, Agent Runtime (Agent 1: logic-bug-reviewer)

### Scope and Priority

1. **Regression checks** on Pass 1 modified files (highest priority)
2. Fresh review of untouched logic files for logic bugs, off-by-one errors, race conditions, silent failures, infinite loops, and incorrect error propagation

### Files to Review

#### Rust -- LLM Core

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/fallback_chain.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/token_counter.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/sse_parser.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/cache_manager.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/prompt_policy.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`

#### Rust -- Agent Runtime (contains Pass 1 fix)

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/approval.rs` **[MODIFIED -- regression check]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/ai_orchestrator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/planner.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/undo_manager.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/context_manager.rs`

#### Rust -- AGI Orchestration (contains Pass 1 fix)

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/checkpoint_store.rs` **[MODIFIED -- regression check]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/orchestrator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/planner.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/checkpoint_manager.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/memory_manager.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs` **[MODIFIED]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/file_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/terminal_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/browser_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/code_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/llm_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/api_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/database_executor.rs`

#### Rust -- Research (contains Pass 1 fix)

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/agents.rs` **[MODIFIED -- regression check]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/orchestrator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/citation.rs`

#### Rust -- Swarm

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/orchestrator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/task_decomposer.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/result_aggregator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/agent_spawner.rs`

#### Rust -- Automation (contains Pass 1 fix)

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/safety_patterns.rs` **[MODIFIED]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/safety.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/vision_planner.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/observe_plan_act.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/visual_reasoner.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/cdp_client.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/dom_operations.rs`

### Specific Regression Checks

**[H12 fix] approval.rs -- AlwaysRequire bypass**

- Pass 1 added an early return at lines 61-67 that short-circuits when `AlwaysRequire` is in the rules list, before the rule loop.
- Verify: the short-circuit correctly returns `Ok(false)`. Confirm that `task.auto_approve` at line 55 still takes precedence (it runs before the short-circuit). Confirm no new code path was introduced that could re-enable the bypass.
- Current code pattern:

```rust
// AlwaysRequire is an unconditional deny -- short-circuit before any other
// rule can grant approval, preventing PatternMatch from bypassing it.
if self.approval_rules.iter().any(|r| matches!(r, ApprovalRule::AlwaysRequire)) {
    return Ok(false);
}
```

**[bonus fix] checkpoint_store.rs -- FK ordering**

- Pass 1 reordered table creation so `agi_tasks` is created before `agi_task_checkpoints`.
- Verify: `PRAGMA foreign_keys = OFF` is set during creation (line 39), so FK ordering is cosmetic but correct. Check that the `agi_checkpoint_restore_history` table (created third) also correctly references both parent tables.
- Verify no index or trigger references a table that does not exist at creation time.

**[M19 fix] agents.rs -- MemorySearchAgent warning**

- Pass 1 changed `MemorySearchAgent::search()` from silently returning `Ok(empty_result)` to logging a warning and returning with `error: Some("MemorySearchAgent: backend not implemented")`.
- Verify: callers of `SearchAgent::search()` in `research/orchestrator.rs` handle the `error` field. Check whether a non-None `error` field combined with `complete: false` could cause panics or early exits in aggregation logic.

### What to Look For (Zone A patterns)

1. **Silent error swallowing**: Functions returning `Ok(default)` instead of propagating errors. The MemorySearchAgent was one example; look for similar patterns in other executors.
2. **Race conditions in shared state**: `Arc<Mutex<...>>` or `Arc<RwLock<...>>` patterns -- check for lock ordering violations or held-across-await issues (`parking_lot` locks are not await-safe).
3. **Cost/token tracking drift**: `LLMRouter` tracks `accumulated_cost` in a `Mutex<f64>`. Verify it is updated atomically and that `SESSION_COST_SAFETY_CAP` (50.0 USD) cannot be bypassed by concurrent requests.
4. **Retry/backoff correctness**: `is_retryable_error()` in `llm_router.rs` uses substring matching on error messages. Check for false positives (e.g., a message containing "429" in a URL) or false negatives.
5. **Tool timeout mismatches**: `ToolTimeoutConfig` defines per-tool timeouts (15s-300s) but MCP tools use a separate `MCP_TOOL_TIMEOUT_MS = 120_000`. Check for conflicts.
6. **Dangerous pattern regex**: `safety_patterns.rs` uses `OnceLock` for lazy init. Verify the patterns are comprehensive and no common bypass exists (e.g., `rm -r -f` vs `rm -rf`).
7. **Swarm orchestrator concurrency**: `SwarmConfig::max_agents` defaults to `constants::MAX_CONCURRENT_AGENTS`. Verify this is actually enforced and that exceeding it does not cause unbounded spawning.

### DO NOT TOUCH (Zone A)

- Do not review files in `sys/commands/` (Zone B)
- Do not review files in `data/db/` or `data/database/` (Zone C)
- Do not review test files (Zone D)
- Do not review `Cargo.toml` or CI configs (Zone E)

---

## Zone B -- API Handlers, Routes, Middleware (Agent 2: security-reviewer, commands + web)

### Scope and Priority

1. **Regression checks** on Pass 1 auth-sanitization fixes
2. Review all Tauri command handlers for input validation, error leakage, and authorization gaps
3. Review all web API routes for auth bypass, IDOR, CSRF, and error leakage

### Files to Review

#### Rust -- Command Handlers

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/llm.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/security.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/file_ops.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/terminal.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/automation.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/computer_use.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/database.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/code_editing.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/mcp_extensions.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/research.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/background_tasks.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/checkpoints.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/memory.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/cloud.rs`

#### Rust -- Security Subsystem

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/prompt_injection.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/command_validator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/tool_guard.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/guardrails.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/validator.rs`

#### Web -- Admin Routes (contains Pass 1 fixes)

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/directory-sync/route.ts` **[MODIFIED -- regression check]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/security/route.ts` **[MODIFIED -- regression check]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/sso/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/llm/completion/route.ts` **[MODIFIED -- regression check]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/llm/v1/chat/completions/route.ts`

#### Web -- Auth & Device Routes

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/device/link/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/device/approve/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/device/poll/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/auth/callback/route.ts`

#### Web -- Payment Routes

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/stripe-webhook/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/checkout/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/sync-subscription/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/credit-topup/route.ts`

#### Web -- Middleware

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/middleware.ts`

### Specific Regression Checks

**[H4 fix] directory-sync/route.ts -- Auth error sanitized**

- Pass 1 replaced dynamic Supabase error messages with static strings in `verifyAdminAccess()`.
- Verify: line 42-44 now returns `{ isAdmin: false, error: 'Invalid or expired token' }` regardless of actual Supabase error content. Confirm no other code path in the file re-exposes the raw `error` object.
- Also check: all catch blocks in GET/POST/DELETE handlers use `isDbUnavailableError()` for Supabase outage detection (added in Pass 1 audit) and return generic 503 responses.

**[H5 fix] security/route.ts -- Auth error sanitized**

- Verify: `verifyAdminAccess()` at line 57-58 returns `{ isAdmin: false, error: 'Invalid or expired token' }`.
- The module-level `supabaseAdmin` client is created once. Verify it does not expose errors if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing (it returns `null` and the function returns `{ isAdmin: false, error: 'Server configuration error' }`).

**[H6 fix] llm/completion/route.ts -- LLM error sanitized**

- Verify: catch blocks no longer include `error.message` or stack traces in HTTP responses. Confirm the response body uses a generic message with a request ID for correlation.

**[C1 fix] installer.rs -- ZIP path traversal**

- The `extract_package()` method (in `installer.rs`) was fixed to validate each path component against traversal.
- Verify: the fix rejects `..` components in ZIP entry names. Confirm the extraction target directory is canonicalized and that symlink-following in the ZIP archive does not bypass the check.

### What to Look For (Zone B patterns)

1. **Error message leakage**: Any `catch` block that includes `error.message`, `error.stack`, or `e.to_string()` in HTTP/IPC responses. Pass 1 found this in 3 admin routes; search for the same pattern in all routes.
2. **Auth bypass via missing middleware**: Check that every POST/DELETE handler calls `verifyAdminAccess()` or equivalent before processing. Look for handlers that accept requests without any auth check.
3. **CSRF protection gaps**: Verify that mutating routes (POST/PUT/DELETE) call `requireCsrfToken()`. The SSO route imports it; verify it actually calls it.
4. **Tauri command input validation**: Every `#[tauri::command]` handler should validate string lengths, check for empty inputs, and use parameterized queries. `db_execute_query` in `database.rs` does this; verify all others do too.
5. **Tool safety tier enforcement**: `ToolSafetyTier` has 4 levels (Safe, RequiresNotification, RequiresConfirmation, RequiresExplicitApproval). Verify that `RequiresExplicitApproval` tools actually block until approval is received and that the approval flow cannot be short-circuited by a crafted IPC message.
6. **Rate limiting coverage**: All admin routes should call `withRateLimit()`. Verify the rate limit keys are distinct per route (not shared) to prevent cross-route amplification.
7. **CSP nonce implementation**: `middleware.ts` generates a per-request nonce. Verify it is cryptographically random (`crypto.randomUUID()` is used -- confirm it is not predictable).

### DO NOT TOUCH (Zone B)

- Do not review `core/llm/`, `core/agent/`, `core/agi/`, `core/swarm/`, `automation/` logic (Zone A)
- Do not review `data/db/`, `data/database/` (Zone C)
- Do not review test files (Zone D)

---

## Zone C -- Data Access Layer (Agent 3: security-reviewer, data)

### Scope and Priority

1. SQL injection review (parameterized queries vs string concatenation)
2. Encryption key management and secret storage
3. Connection management and pool security
4. Data model integrity

### Files to Review

#### Database Core

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/repository.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/models.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/migrations.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/encryption.rs`

#### External Database Clients

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/sql_client.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/query_builder.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/security.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/connection.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/pool.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/postgres_client.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/nosql_client.rs`

#### Settings Persistence

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/settings/repository.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/settings/validation.rs`

#### Security Subsystem (data-adjacent)

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/secret_manager.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/master_password.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/machine_key.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/encryption.rs`

### Current State of Key Files

**repository.rs** -- Uses `rusqlite` parameterized queries (`params![]` macro) for all operations. Verified: `create_conversation`, `get_conversation`, `list_conversations`, `create_message` all use positional `?1`, `?2` etc. with `params![]`. This is the SAFE pattern. Look for any function that deviates.

**sql_client.rs** -- The `execute_query()` function at line 71 takes raw `sql: &str` and passes it directly to the underlying client (`postgres_client.execute_query(connection_id, sql)` or `mysql_client.execute_query(connection_id, sql)`). This is KNOWN (C2/NEEDS_HUMAN). Do NOT re-flag but DO check if there are any new callers that pass user-controlled input.

**query_builder.rs** -- Uses `validate_sql_identifier()` (blocklist approach) and `escape_sql_value()` (single-quote doubling) for protection. The `validate_where_clause()` function has a weak blocklist (`["--", "EXEC", "EXECUTE"]`). This is KNOWN (C3/NEEDS_HUMAN). Instead, look for:

- Whether `on_condition` in `Join` structs is validated (it appears to be a raw string)
- Whether `RETURNING` clauses are validated
- Whether column names in `ORDER BY` are validated

**encryption.rs (data/db/)** -- SQLCipher integration. Check that the encryption key derivation uses the full HKDF chain described in CLAUDE.md (machine ID + master password + purpose salt).

### What to Look For (Zone C patterns)

1. **Unparameterized queries**: Any use of `format!()` or string concatenation to build SQL outside the `query_builder.rs` module. The `repository.rs` functions use `params![]` correctly; verify ALL functions follow this pattern.
2. **Connection string exposure**: Check if database connection strings (containing passwords) are logged, emitted as events, or included in error messages.
3. **Pool exhaustion**: `ConnectionPool` wraps connections. Verify there is a maximum pool size and that connections are returned on error paths (no leak on early return).
4. **Encryption key in memory**: Check if the SQLCipher key or master password derivative is stored in a `String` (heap-allocated, not zeroed on drop) vs a secure container.
5. **IDOR patterns in repository.rs**: Functions like `get_conversation()` filter by both `id` AND `user_id` (correct). Verify that ALL read/update/delete functions include a `user_id` filter. Any function that only takes `id` without user scoping is an IDOR. (Note: H1 already flagged 4 specific functions -- look for additional ones.)
6. **NoSQL injection**: `MongoClient` and `RedisClient` -- check for injection vectors in query construction.
7. **Secret zeroing**: After `SecretManager` or `MasterPassword` operations, verify that sensitive byte arrays are zeroed (using `zeroize` crate or equivalent).

### Interface Contract: Zone C exposes to Zone B

Zone B command handlers call Zone C data functions. The contract is:

```rust
// repository.rs functions (safe, parameterized):
pub fn create_conversation(conn: &Connection, title: String, user_id: String) -> Result<i64>
pub fn get_conversation(conn: &Connection, id: i64, user_id: &str) -> Result<Conversation>
pub fn list_conversations(conn: &Connection, limit: i64, offset: i64, user_id: &str) -> Result<Vec<Conversation>>
pub fn create_message(conn: &Connection, message: &Message) -> Result<i64>
pub fn delete_conversation(conn: &Connection, id: i64, user_id: &str) -> Result<usize>

// sql_client.rs functions (raw SQL, known risk):
pub async fn execute_query(&self, connection_id: &str, sql: &str) -> Result<QueryResult>
pub async fn create_pool(&self, connection_id: &str, config: ConnectionConfig, pool_config: PoolConfig) -> Result<()>

// query_builder.rs (string-based, known risk):
// QueryBuilder::select(), ::insert(), ::update(), ::delete() -> build() -> String
```

Zone B handlers MUST NOT pass user-supplied strings directly to `execute_query()`. Verify this in `sys/commands/database.rs` which already has blocklist validation (line 74-80). Check if all code paths go through this validation.

### DO NOT TOUCH (Zone C)

- Do not review `core/` business logic (Zone A)
- Do not review `sys/commands/` handlers (Zone B)
- Do not review test files (Zone D)

---

## Zone D -- Tests (Agent 4: test-coverage-reviewer)

### Scope and Priority

1. **Verify Pass 1 test fixes** are correct and non-tautological
2. Identify tests that are tautological (assert hardcoded values, never exercise real code)
3. Identify missing test coverage for critical paths
4. Flag tests with incorrect mocking that could hide real bugs

### Files to Review

#### Rust Tests

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/tests.rs` **[MODIFIED -- verify fix]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs` **[MODIFIED]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/tests/autonomous_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/tests/approval_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/tests/planner_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tests/security_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tests/failure_recovery_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tests/core_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tests/memory_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tests/tool_integration_tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/settings/tests.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/integration_tests.rs`

#### TypeScript Tests

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/__tests__/terminalStore.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/__tests__/unifiedChatStore.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/__tests__/costStore.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/__tests__/toolTimeoutPolicy.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/__tests__/registry.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/e2e/tests/self-healing.spec.ts` **[MODIFIED]**

#### Web API Tests

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/me.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/credits-balance.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/stripe-refund.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/stripe-cancel.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/stripe-downgrade.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/chat-conversation-single.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/chat-conversations.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/chat-messages.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/gdpr.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/checkout.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/device-approve.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/device-link.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/device-poll.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/health.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/llm-completion.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/stripe-webhook.test.ts`

### Specific Regression Checks

**[H26 fix] mcp/tests.rs -- Tautological assertions**

- Pass 1 fixed tests that were asserting constants against themselves. Current state: tests now exercise actual serialization/deserialization of MCP protocol types (`McpMessage::from_str`, `McpMessage::to_string`, `McpClient::new`, `McpClient::search_tools`).
- Verify: each test creates real struct instances, serializes them to JSON, and asserts on the JSON content. The assertions at lines 17-18, 35-37, 48-49 now check actual parsed values.
- Look for remaining tautologies: any `assert_eq!(x, x)` or assertions on locally-constructed test data that never touches production code paths.

**approval_tests.rs -- Known tautological tests**

- The current test file is KNOWN to contain tautological tests. Example from lines 9-15:

```rust
fn test_risk_classification_low() {
    let action = "read_file";
    let risk_level = "low";
    assert_eq!(risk_level, "low");  // TAUTOLOGICAL -- never calls real code
    assert_eq!(action, "read_file"); // TAUTOLOGICAL
}
```

- ALL tests in this file follow this pattern (lines 9-80). They never instantiate `ApprovalManager`, never call `should_approve()`, and never exercise the Pass 1 fix.
- Flag these but note this is a known issue (H26 class).

**security_tests.rs -- Inline test implementation**

- This file defines its OWN `SecurityValidator` struct (lines 4-60) that is completely separate from the production code. The tests validate the test-local implementation, not the real `sys/security/` code.
- Verify: does the test-local `SecurityValidator::validate_path()` match the production `validate_path()`? If they diverge, the tests provide false confidence.

### What to Look For (Zone D patterns)

1. **Tautological assertions**: `assert_eq!(local_var, literal)` where the local var was just set to that literal. The approval_tests.rs file is the canonical example. Search for this pattern in ALL test files.
2. **Test-local reimplementation**: Tests that define their own structs/functions mirroring production code but not actually importing/calling it. The security_tests.rs file is the canonical example.
3. **Mock-only tests with no integration path**: Web API tests mock everything (Supabase, Stripe, LLM providers). This is fine for unit tests but flag if there are NO integration tests that exercise the real auth flow.
4. **Missing negative tests**: For every security fix in Pass 1, there should be a test that verifies the vulnerability is closed. For example:
   - AlwaysRequire bypass (H12): needs a test that creates `ApprovalManager` with `auto_approve = false`, adds both `AlwaysRequire` and `PatternMatch`, and verifies that matching tasks are still denied.
   - ZIP traversal (C1): needs a test with a ZIP containing `../../etc/passwd` entry.
   - Auth error leakage (H4/H5): needs a test that verifies the HTTP response body does not contain the original Supabase error string.
5. **Coverage gaps for critical code paths**:
   - `LLMRouter::invoke_candidate()` cost cap enforcement -- no test found
   - `FallbackChain::run_with_fallback()` rate limit tracking -- verify test exists
   - `ToolExecutor` argument alias normalization -- verify tests exist for edge cases
   - `PromptInjectionDetector::analyze()` -- verify test coverage for all pattern categories
6. **Flaky test indicators**: Tests using `timeout` with hardcoded durations, `sleep()` calls, or network-dependent assertions.

### Interface Contract: Zone D validates Zones A-C

Zone D tests should import and exercise real production types:

```rust
// GOOD: imports real production type
use crate::core::agent::approval::ApprovalManager;

// BAD: defines a test-local copy
struct SecurityValidator; // shadows the real one
```

When reviewing, check each test file's `use` statements to determine if it tests production code or a local reimplementation.

### DO NOT TOUCH (Zone D)

- Do not review non-test source files (Zones A, B, C)
- Do not review config/build files (Zone E)

---

## Zone E -- Config, Build, CI/CD (Agent 5: config-dependency-reviewer)

### Scope and Priority

1. **Regression check** on modified Cargo.toml, package.json, capabilities
2. Dependency vulnerability analysis
3. CI/CD workflow security (permissions, pinning, secrets exposure)
4. Build configuration correctness

### Files to Review

#### Dependency Manifests

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml` **[MODIFIED]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/package.json` **[MODIFIED]**
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/package.json` **[MODIFIED]**
- `/Users/siddhartha/Desktop/agiworkforce/pnpm-lock.yaml` **[MODIFIED]**

#### Tauri Capabilities

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/capabilities/default.json` **[MODIFIED -- regression check]**

#### CI/CD Workflows

- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/ci.yml`
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/release.yml`
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/release-desktop.yml`
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/e2e-tests.yml`
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/build-appstore.yml`
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/deploy-signaling-server.yml`

#### Build Configuration

- `/Users/siddhartha/Desktop/agiworkforce/tsconfig.base.json`
- `/Users/siddhartha/Desktop/agiworkforce/eslint.config.mjs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/vite.config.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/next.config.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/middleware.ts`

### Specific Regression Checks

**[H15+M8 fix] capabilities/default.json -- Extended deny lists**

- Pass 1 added `.env` and `**/.env` to all filesystem capability deny lists.
- Current state: deny lists now include 17 entries for `fs:allow-read-file`, `fs:allow-read-dir`, `fs:allow-read-text-file`, `fs:allow-read-text-file-lines`, `fs:allow-read-text-file-lines-next`.
- Verify:
  1. ALL 5+ read capabilities have identical deny lists (they should be copy-paste consistent)
  2. WRITE capabilities (`fs:allow-write-file`, `fs:allow-write-text-file` etc.) have AT LEAST the same deny entries (TODO #16 notes write deny list may be weaker)
  3. `.env.local` and `.env.*.local` patterns are included (TODO #16 recommendation)
  4. No `allow` entry overrides a `deny` entry for the same path (Tauri deny takes precedence, but verify)

**Cargo.toml lint configuration**

- Current state (lines 9-22): `unsafe_code = "deny"`, `unused = "deny"`, `dead_code = "deny"`. This is strict and good.
- Verify: `unused_qualifications = "allow"` and `unused_results = "allow"` are intentionally relaxed. Flag if `unused_results` could hide error-handling gaps (callers ignoring `Result<()>`).

### What to Look For (Zone E patterns)

1. **Dependency version pinning**: Cargo.toml uses semver ranges (e.g., `tokio = "1.37"`, `serde = "1.0"`). Verify no dependency allows a major version range that could pull in breaking changes.
2. **Known vulnerable dependencies**: Check `rusqlite 0.31` (bundled-sqlcipher), `reqwest 0.12`, `tokio-postgres 0.7`, `redis 0.32.7` for known CVEs. Note that `pnpm audit --audit-level=high` runs in CI.
3. **CI/CD permissions scope**: `ci.yml` sets `permissions: contents: read` at the job level (line 14-15). Verify ALL workflow files use minimal permissions. Check that release workflows do not expose `GITHUB_TOKEN` with write access to PRs from forks.
4. **Action version pinning**: `ci.yml` uses `actions/checkout@v4`, `actions/setup-node@v4`. Verify these are pinned to SHA or at least major version tags. Unpinned `@latest` is a supply chain risk.
5. **Secret exposure in CI**: Check workflow files for `echo ${{ secrets.* }}` or other patterns that could leak secrets to logs.
6. **Rust toolchain pinning**: `ci.yml` uses `toolchain: '1.90.0'`. Verify this matches the project's MSRV and that all workflow files use the same version.
7. **Build feature flags**: Cargo.toml has `tauri-plugin-shell` as optional and `tauri-plugin-updater` as optional. Verify the default feature set does not include debug/test features in production builds.
8. **CSP configuration**: `middleware.ts` builds a CSP. Verify the CSP does not include `unsafe-eval` unnecessarily (it does for Stripe.js -- confirm Stripe actually requires it). Verify `frame-ancestors 'none'` prevents clickjacking.
9. **Write deny list parity**: A TODO exists (#16) to audit write deny list parity with read deny list. Check if `fs:allow-write-file` and `fs:allow-write-text-file` deny the same sensitive paths as the read capabilities.

### DO NOT TOUCH (Zone E)

- Do not review source code logic (Zones A, B, C)
- Do not review test files (Zone D)

---

## Interface Contracts Between Zones

### Zone A (logic) --> Zone C (data)

AGI orchestrator and checkpoint manager call into `CheckpointStore` (Zone A file, uses `rusqlite::Connection` directly):

```rust
// checkpoint_store.rs -- opens its own Connection via Connection::open(&db_path)
// This bypasses the Zone C repository pattern. Verify it still uses params![] for all queries.
pub struct CheckpointStore { db_path: String }
impl CheckpointStore {
    pub async fn init(&self) -> Result<()>  // Creates tables
    pub async fn save_checkpoint(&self, checkpoint: &Checkpoint) -> Result<()>
    pub async fn get_latest_checkpoint(&self, task_id: &str) -> Result<Option<Checkpoint>>
}
```

Agent 1 should verify `CheckpointStore` uses parameterized queries. Agent 3 should note that `CheckpointStore` opens its own connections outside the standard pool pattern.

### Zone A (logic) --> Zone B (commands)

LLM router is wrapped in `LLMState` and accessed from `sys/commands/llm.rs`:

```rust
// commands/llm.rs
pub struct LLMState {
    pub router: Arc<RwLock<LLMRouter>>,
    pub cache_manager: CacheManager,
}

#[tauri::command]
pub async fn llm_send_message(request: LLMSendMessageRequest, state: State<'_, LLMState>) -> Result<LLMResponse, String>
```

Agent 1 reviews `LLMRouter` internals. Agent 2 reviews the command handler that wraps it. The boundary is: Agent 2 checks that `request` is validated before being passed to `router`, and Agent 1 checks that `LLMRouter` handles all edge cases internally.

### Zone B (commands) --> Zone C (data)

Database commands call `SqlClient`:

```rust
// commands/database.rs
#[tauri::command]
pub async fn db_execute_query(connection_id: String, sql: String, state: State<'_, Mutex<DatabaseState>>) -> Result<serde_json::Value, String>
```

Agent 2 verifies input validation in the command handler (blocklist at line 74-80). Agent 3 verifies `SqlClient::execute_query()` handles the raw SQL safely downstream.

### Zone B (web routes) -- independent from Rust zones

Web API routes (`apps/web/`) are entirely TypeScript and communicate with Supabase, not the Rust backend. Agent 2 reviews these independently. The only interface is that the desktop app's `ManagedCloudProvider` calls the web app's `/api/llm/completion` endpoint. Agent 1 should note this dependency; Agent 2 should verify the endpoint's auth and error handling.

### Zone D (tests) -- reads from all zones

Zone D agent must understand Zones A-C to assess test quality but does not modify any source files. Zone D agent should cross-reference:

- Each Pass 1 fix with its corresponding test (or flag absence of test)
- Each critical interface contract above with integration test coverage

### Zone E (config) -- affects all zones at build time

Zone E agent should check that:

- Cargo.toml `[lints.rust]` settings match CI clippy flags (`-D warnings -D unsafe-code`)
- pnpm-lock.yaml integrity (no manual edits that could introduce supply chain issues)
- Tauri capabilities match what command handlers actually use (no over-permissioned capabilities)

---

## Anti-Patterns Identified in Pass 1 (search for these everywhere)

### AP-1: Silent Success on Failure

**Pattern:** Returning `Ok(empty_result)` when an operation actually failed or was not implemented.
**Found in:** `MemorySearchAgent::search()` (M19, fixed)
**Search for:** Any `Ok(Default::default())`, `Ok(vec![])`, or `Ok(String::new())` in error-handling paths. Also search for `todo!()` or `unimplemented!()` that are unreachable but indicate incomplete implementation.

### AP-2: Tautological Test Assertions

**Pattern:** Tests that assert locally-assigned variables equal their own literals, never exercising production code.
**Found in:** `approval_tests.rs` (H26), `mcp/tests.rs` (H26, fixed)
**Search for:** Test functions where all assertions can be trivially verified by reading the test body alone, without needing to understand any production code.

### AP-3: Error Message Leakage to Clients

**Pattern:** Catch blocks that include internal error details (`e.message`, `e.to_string()`, stack traces) in HTTP/IPC responses.
**Found in:** `directory-sync/route.ts` (H4), `security/route.ts` (H5), `llm/completion/route.ts` (H6) -- all fixed.
**Search for:** `.map_err(|e| format!("...: {}", e))` in Rust commands (these leak internal errors to the frontend). In TypeScript: `catch (error) { return NextResponse.json({ error: error.message })`.

### AP-4: Security Bypass via Rule Ordering

**Pattern:** A permissive rule evaluated before a restrictive rule allows bypass of the restriction.
**Found in:** `approval.rs` (H12, fixed) -- `PatternMatch` was evaluated before `AlwaysRequire`.
**Search for:** Any rule/policy evaluation loop that returns early on first match without checking for higher-priority deny rules.

### AP-5: ZIP/Path Traversal via Unsanitized Archive Entries

**Pattern:** Extracting ZIP entries without validating that the resulting path stays within the target directory.
**Found in:** `installer.rs` (C1, fixed)
**Search for:** Any use of `ZipArchive`, `tar::Archive`, or file extraction that joins an archive entry name with a base path without canonicalizing and bounds-checking.

### AP-6: FK/Schema Ordering Issues

**Pattern:** Creating database tables in an order that violates foreign key constraints.
**Found in:** `checkpoint_store.rs` (bonus fix)
**Search for:** Any `CREATE TABLE` statements with `FOREIGN KEY` references. Verify the referenced table is created first (or `PRAGMA foreign_keys = OFF` is set).

### AP-7: Weak Identifier Validation (Blocklist Approach)

**Pattern:** Using a blocklist of dangerous keywords to validate SQL identifiers/values instead of an allowlist of valid characters.
**Found in:** `query_builder.rs` `validate_sql_identifier()` -- blocks known keywords but allows `*` and space in identifiers.
**Search for:** Any validation function that uses a blocklist approach. Prefer allowlist (e.g., `[a-zA-Z0-9_]` only for identifiers).

### AP-8: Test-Local Reimplementation

**Pattern:** Test files that define their own implementation of production types instead of importing them.
**Found in:** `security_tests.rs` -- defines its own `SecurityValidator` that shadows the real one.
**Search for:** Test files that contain `struct` or `impl` blocks for types that also exist in production code.

---

## Global DO NOT TOUCH

These files/sections must NOT be modified by any agent (review only):

| File                                         | Reason                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/lib.rs`          | Core app entry point, state initialization                    |
| `apps/desktop/src-tauri/src/core/llm/mod.rs` | LLM module root, shared type definitions used by all LLM code |
| `packages/types/index.ts`                    | Shared TypeScript types across all apps                       |
| `packages/utils/`                            | Shared utilities                                              |
| `apps/extension/`                            | Excluded from ESLint, separate review track                   |
| `pnpm-lock.yaml`                             | Auto-generated, should not be manually edited                 |

---

## Verification Checklist

Before each agent begins:

- [x] All file paths verified to exist in the codebase (verified by spec writer via Read/Glob tools)
- [x] Interface contracts documented with actual function signatures from source
- [x] No overlapping file assignments between agents
- [x] DO NOT TOUCH sections clearly communicated
- [x] Anti-patterns documented with concrete search instructions
- [x] Pass 1 regression checks assigned to the correct zone agent
- [x] Output format standardized across all agents

---

## Execution Notes

1. **Start with regression checks.** Every agent should first verify the Pass 1 fixes in their zone are correct and complete. Then proceed to fresh review.
2. **Cross-reference flag.** If you find an issue that involves a file in another agent's zone, include a `Cross-zone: Agent N should also check...` note in your finding. Do not review the other zone's file yourself.
3. **Severity calibration.** Use `[C]` only for exploitable security vulnerabilities with immediate impact. Use `[H]` for issues that could cause data loss, auth bypass, or production outages. Use `[M]` for code quality issues with potential impact. Use `[L]` for minor issues. Use `[I]` for informational observations.
4. **Do not duplicate NEEDS_HUMAN.** The exclusion list above covers all known triaged issues. Only flag them again if you discover a NEW exploitation vector not previously considered.
5. **Rust compile constraints.** The Cargo.toml enforces `deny(unused)`, `deny(dead_code)`, `deny(unsafe_code)`. Any `#[allow(...)]` attribute should be flagged and justified.

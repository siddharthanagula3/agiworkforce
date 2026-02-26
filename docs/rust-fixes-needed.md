# Rust Fixes Needed

These issues were identified during the 2026-02-26 self-review and require changes to Rust source files.
Per CLAUDE.md policy, Rust files are not modified directly by AI agents — a human must apply these.

---

## [C1] Integer overflow in exponential backoff
- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs:1311`
- **Severity**: Critical
- **Description**: `2u64.pow(consecutive_failures - 1)` panics in debug builds and overflows silently in
  release builds when `consecutive_failures` is large. The DB column has no upper-bound constraint.
- **Fix**: Replace with saturating arithmetic:
  ```rust
  BASE_RETRY_DELAY_SECS.saturating_mul(
      2u64.saturating_pow(consecutive_failures.saturating_sub(1).min(62))
  )
  ```

## [C2] Deadlock via lock-order inversion in BackgroundAgent
- **File**: `apps/desktop/src-tauri/src/core/agent/background_agent.rs:410`
- **Severity**: Critical
- **Description**: `push_to_background` acquires `queue` write-lock then `agents` read-lock. Other paths
  acquire in reverse order. Creates a deadlock under async contention with tokio `RwLock`.
- **Fix**: Snapshot agent priorities while holding agents read-lock only, then drop it before acquiring
  queue write-lock for sorting. Never hold both simultaneously.

## [H5] SSE parser uses fragile string matching for error classification
- **File**: `apps/desktop/src-tauri/src/core/llm/sse_parser.rs:147`
- **Severity**: High
- **Description**: Broad string matches on error messages (`contains("error")`, `contains("failed")`)
  incorrectly escalate benign partial JSON parse errors as critical stream terminations.
- **Fix**: Use typed error matching — distinguish `reqwest::Error` (network failures) from
  `serde_json::Error` (parse errors) from structured provider API errors `{"error":{...}}`.
  Only terminate the stream for network/connection errors, not parse errors on partial chunks.

## [H7] `validate_table_whitelist()` warns but does not block execution
- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:65`
- **Severity**: High
- **Description**: Non-allowlisted table names still reach `format!()` SQL string interpolation. No
  hard block is enforced.
- **Fix**:
  1. Change `validate_table_whitelist()` to return `Result<(), QueryBuilderError>` and return `Err`
     when the table is not in the allowlist.
  2. Propagate the error from all four `build_*_query` functions.
  3. Remove space (`' '`) from `validate_sql_identifier()` allowed character set (line 97). SQL
     identifiers never legitimately contain spaces.

## [H8] Hardcoded HMAC key fallback in debug audit logger
- **File**: `apps/desktop/src-tauri/src/sys/security/audit_logger.rs:110`
- **Severity**: High
- **Description**: Known HMAC key `b"agiworkforce-audit-hmac-key-v1"` used in `#[cfg(debug_assertions)]`
  builds. If a debug build is deployed to staging, audit log integrity is broken.
- **Fix**: Remove the hardcoded fallback. Generate an ephemeral random key at startup using CSPRNG
  (e.g., `rand::thread_rng().gen::<[u8; 32]>()`) and log a prominent warning that HMAC cannot be
  verified across restarts without `AUDIT_HMAC_KEY` set.

## [H11] LLM-controllable shell type enables security policy bypass
- **File**: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:2550`
- **Severity**: High
- **Description**: The `shell` argument in LLM tool calls determines which shell binary executes
  commands. An LLM requesting `shell='wsl'` on a WSL-enabled machine bypasses bash-configured
  validator rules.
- **Fix**: Remove `shell` from LLM-controllable tool arguments. Always call `get_default_shell()`.
  If multi-shell support is needed, make it a user settings preference only.

## [H20] 17 core routing logic tests permanently `#[ignore]`d
- **File**: `apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs:747`
- **Severity**: High
- **Description**: All `intelligent_routing_*` tests for every LLM provider are ignored in CI. These
  cover the production routing logic (which model is called for every user request).
- **Fix**: Refactor `intelligent_routing` to accept an injectable mock provider-config trait so tests
  can run without real API keys. The routing decision logic must be testable in CI.

## [M2] Space allowed in SQL identifier validation
- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:97`
- **Severity**: Medium
- **Description**: Space character (`' '`) is in the allowed set for `validate_sql_identifier()`.
  SQL identifiers never contain spaces. This weakens the identifier validation.
- **Fix**: Remove `' '` (space) from the allowed character set. Valid: `[a-zA-Z0-9_.]`.

## [M3] `duration_until_midnight` ignores configured timezone
- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs:413`
- **Severity**: Medium
- **Description**: Always uses `Local::now()` (system timezone) regardless of the `timezone` field
  in `ContinuousExecutorConfig`. The field is documented as an IANA timezone string.
- **Fix**: Add `chrono-tz` crate dependency and parse the IANA string:
  ```rust
  let tz: chrono_tz::Tz = self.timezone.parse().unwrap_or(chrono_tz::UTC);
  let now = Utc::now().with_timezone(&tz);
  ```

## [M18] Non-optional heavy DB client dependencies inflate desktop binary
- **File**: `apps/desktop/src-tauri/Cargo.toml:64`
- **Severity**: Medium
- **Description**: `tokio-postgres`, `deadpool-postgres`, `mysql_async`, `mongodb`, `redis` compiled
  unconditionally into the desktop app. The app uses SQLite as its primary DB.
- **Fix**: Make these optional and gate behind a `remote-databases` Cargo feature:
  ```toml
  [features]
  remote-databases = ["dep:tokio-postgres", "dep:deadpool-postgres", "dep:mysql_async",
                      "dep:mongodb", "dep:redis"]
  ```

## [M20] No-op assertion in `autonomous_tests`
- **File**: `apps/desktop/src-tauri/src/core/agent/tests/autonomous_tests.rs:414`
- **Severity**: Medium
- **Description**: `let _ = PENDING_TASK_APPROVALS.len()` discards the result — test always passes
  regardless of state.
- **Fix**: `assert_eq!(PENDING_TASK_APPROVALS.len(), 0, "PENDING_TASK_APPROVALS should be empty");`

## [M25] Concurrent access not tested in checkpoint persistence
- **File**: `apps/desktop/src-tauri/src/core/agent/tests/continuous_executor_tests.rs:177`
- **Severity**: Medium
- **Description**: Tests use in-memory SQLite but don't test concurrent writes or recovery from
  partially-written checkpoints — critical for the crash-recovery guarantee.
- **Fix**: Add tests:
  1. Two async tasks performing concurrent checkpoint writes to the same session — verify consistency.
  2. Simulated truncated/corrupt checkpoint data — verify `load_latest` returns `None`, not panic.

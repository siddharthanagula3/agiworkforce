# Rust Fixes Needed

All issues identified during the 2026-02-26 self-review have been **resolved**.

Commit: `e23c871` — `fix(rust): resolve all 12 rust issues from self-review audit`

---

## FIXED [C1] Integer overflow in exponential backoff
- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`
- **Fix applied**: Replaced with `saturating_mul` + `saturating_pow` + `.min(62)` cap

## FIXED [C2] Deadlock via lock-order inversion in BackgroundAgent
- **File**: `apps/desktop/src-tauri/src/core/agent/background_agent.rs`
- **Fix applied**: Snapshot agent priorities via read-lock, drop it, then acquire queue write-lock. Also fixed `load_persisted_agents` to never hold both locks.

## FIXED [H5] SSE parser uses fragile string matching for error classification
- **File**: `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`
- **Fix applied**: Use `e.downcast_ref::<serde_json::Error>()` — JSON parse errors are non-terminal (partial chunks), all others are terminal.

## FIXED [H7] `validate_table_whitelist()` warns but does not block execution
- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs`
- **Fix applied**: Returns `Result<()>`, propagated via `?` in all 6 `build_*_query` call sites.

## FIXED [H8] Hardcoded HMAC key fallback in debug audit logger
- **File**: `apps/desktop/src-tauri/src/sys/security/audit_logger.rs`
- **Fix applied**: Replaced with CSPRNG ephemeral key (`rand::thread_rng().gen::<[u8; 32]>()`) + prominent tracing::warn.

## FIXED [H11] LLM-controllable shell type enables security policy bypass
- **File**: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
- **Fix applied**: Removed `args.get("shell")` — always uses `get_default_shell()`.

## FIXED [H20] 17 core routing logic tests permanently `#[ignore]`d
- **File**: `apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs`
- **Fix applied**: Added `MockProvider` with `is_configured() -> true`. Removed `#[ignore]` from all 22 tests. Routing decisions are now testable in CI without API keys.

## FIXED [M2] Space allowed in SQL identifier validation
- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs`
- **Fix applied**: Removed `' '` from allowed charset.

## FIXED [M3] `duration_until_midnight` ignores configured timezone
- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`
- **Fix applied**: Parse IANA timezone via `chrono-tz` (already a dependency), fallback to `Local::now()` with warning.

## FIXED [M18] Non-optional heavy DB client dependencies inflate desktop binary
- **File**: `apps/desktop/src-tauri/Cargo.toml` + 4 source files
- **Fix applied**: 7 deps marked `optional = true`, gated behind `remote-databases` Cargo feature. All imports and usage wrapped in `#[cfg(feature = "remote-databases")]`. Stub commands return user-friendly error when feature disabled.

## FIXED [M20] No-op assertion in `autonomous_tests`
- **File**: `apps/desktop/src-tauri/src/core/agent/tests/autonomous_tests.rs`
- **Fix applied**: Replaced `let _ =` with `assert_eq!(PENDING_TASK_APPROVALS.len(), 0, ...)`.

## FIXED [M25] Concurrent access not tested in checkpoint persistence
- **File**: `apps/desktop/src-tauri/src/core/agent/tests/continuous_executor_tests.rs`
- **Fix applied**: Added `test_concurrent_checkpoint_writes` (2 async writers, verifies consistency) and `test_corrupt_checkpoint_recovery` (truncated/invalid JSON, verifies no panic).

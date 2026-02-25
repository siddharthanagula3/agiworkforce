# AGI Workforce — Stabilization Status

**Last updated:** 2026-02-25 (Release Readiness Audit, branch `fix/ship-rc-2026-02-23`)
**Status:** Active stabilization — not yet production-ready for unrestricted release.

This document tracks the health of every major subsystem. Update it after each audit pass.

---

## Domain Health Matrix

| Domain                    | Status              | Known Failures / Gaps                                                                                                                                 | Owner Files                                                              | Test Coverage                      |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| **Chat / LLM Routing**    | 🟡 Stable with gaps | Cost caps enforced in AutonomousAgent only — direct route_with_retry() callers bypass (FIXME #7)                                                      | `core/llm/llm_router.rs`, `fallback_chain.rs`                            | Good (retry, cost, routing tested) |
| **Tool Execution**        | 🟢 Stable           | Lifecycle verified (9 error points, 0 silent exits); tilde expansion + alias normalization present; unit tests passing                                | `core/llm/tool_executor.rs`, `useAgenticEvents.ts`                       | Growing (unit tests for key paths) |
| **Tool Approvals**        | 🟢 Stable           | requestId camelCase fix verified; empty guard present in both approve/cancel; 300s timeout present                                                    | `src/api/toolConfirmation.ts`, `sys/security/approval_workflow.rs`       | In-app verified (Phase 9)          |
| **Offline / Local LLM**   | 🟢 Stable           | Ollama `is_available()` wired into both route_with_retry() and streaming paths; health check pre-filters unreachable providers                        | `core/llm/providers/ollama.rs`, `core/llm/llm_router.rs`                 | Good                               |
| **Checkpoints / Resume**  | 🟢 Stable           | SQLite-backed with WAL mode; `remaining_ms()` safe (saturating_sub); no write-atomicity issue found                                                   | `core/agi/checkpoint_store.rs`, `checkpoint_manager.rs`                  | Minimal                            |
| **Auth / JWT**            | 🟢 Stable           | HS256 pinned; alg:none blocked; issuer/audience validated; Argon2id for master password; kill switch enforced                                         | `sys/security/`, `services/api-gateway/src/middleware/auth.ts`           | Good                               |
| **Credits / Billing**     | 🟡 Partial          | SESSION_COST_SAFETY_CAP ($50) added to invoke_candidate(); double-spend fixed (FOR UPDATE + idempotency); credit check added to is_retryable_error    | `core/llm/llm_router.rs`, `core/agent/autonomous.rs`                     | Minimal                            |
| **Database (SQLite)**     | 🟢 Stable           | No production unwrap()s; SQLCipher graceful wrong-key error; encryption migration path present; repository pattern validated                          | `data/db/repository.rs`, `data/db/encryption.rs`                         | Good                               |
| **Database (Supabase)**   | 🟡 Partial          | Kill switch fail-open during outage (by design); admin routes now return 503 on outage (8 catch blocks added per Phase 9)                             | `apps/web/app/api/admin/`, `services/api-gateway/src/middleware/auth.ts` | Partial                            |
| **Prompt Injection**      | 🟢 Stable           | Tool results and agent summaries sanitized with escape_xml() and sanitize_multiline_for_prompt() before LLM prompts (FIXME #5 RESOLVED)               | `sys/commands/chat/tools.rs`, `sys/commands/chat/mod.rs`                 | Unit tests added                   |
| **Extension Bridge**      | 🟡 Partial          | Auth ACK/failure protocol implemented; preflight diagnostics in extension_status; auto-run on first tool-stream start; residual gap in non-tool paths | `automation/browser/extension_bridge.rs`, `sys/commands/extension.rs`    | Partial (e2e tests)                |
| **MCP Transport**         | 🟢 Stable           | Lifecycle leaks fixed; stdio health check detects exited processes; 120s timeout aligned; pending requests drained on shutdown                        | `core/mcp/transport.rs`, `core/mcp/health.rs`, `tool_executor.rs`        | Partial (integration)              |
| **Multi-Agent Swarm**     | 🟡 Partial          | Task decomposer not idempotent (duplicate LLM calls on retry); swarm circuit breaker not cross-wired with LLM rate limiter                            | `core/swarm/task_decomposer.rs`, `core/swarm/agent_spawner.rs`           | Partial (tests.rs present)         |
| **State / Store Sync**    | 🟡 Partial          | chatStore persisted (localStorage quota risk at scale); agentStore ephemeral; listener cleanup improved but unlisten pattern refined                  | `src/stores/chat/`, `src/hooks/useAgenticEvents.ts`                      | Growing                            |
| **Model Catalog**         | 🟡 Partial          | FIXME #3 resolved (canonicalize_model handles dot→hyphen); remaining drift: 6 model ID mismatches TS/Rust, TODO #15 to sync latest models             | `src/constants/llm.ts`, `core/llm/provider_adapter.rs`                   | Good                               |
| **Security / Filesystem** | 🟡 Partial          | .env files not in Tauri deny list (MEDIUM gap, TODO #16); write deny list weaker than read (TODO #16); device poll legacy path open (H9)              | `capabilities/default.json`, `apps/web/app/api/device/poll/route.ts`     | Partial                            |
| **Build / CI**            | 🟢 Stable           | typecheck/lint/format/vitest all pass; cargo check passes; `cargo test --lib` fixed (FileOptions → SimpleFileOptions, tauri dev-dep added)            | `pnpm-workspace.yaml`, `Cargo.toml`                                      | 820+ tests passing                 |

---

## Open Blockers (Pre-Ship)

### 🟢 Resolved This Audit (2026-02-25)

| #        | Issue                                    | File(s)                                       | Status                                          |
| -------- | ---------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| FIXME #5 | Prompt injection via unsanitized results | `sys/commands/chat/{tools,mod}.rs`            | RESOLVED via escape_xml() + sanitize_multiline  |
| FIXME #6 | Streaming path has no circuit breaker    | `llm_router.rs` (invoke_streaming_with_retry) | RESOLVED via record_success/record_server_error |
| FIXME #7 | Cost cap not in LLMRouter hot path       | `llm_router.rs` (invoke_candidate)            | RESOLVED via SESSION_COST_SAFETY_CAP ($50)      |
| FIXME #8 | Ollama `is_available()` not wired        | `ollama.rs`, `llm_router.rs`                  | RESOLVED via pre-filter in route_with_retry()   |

### 🟡 Should Fix Before Ship (or Document as Known Gap)

| #        | Issue                                      | File                                          | Severity |
| -------- | ------------------------------------------ | --------------------------------------------- | -------- |
| FIXME #2 | Extension not wired into AGI planner       | `extension_bridge.rs`, planner layer          | Medium   |
| TODO #15 | Model catalog sync (6 TS/Rust mismatches)  | `src/constants/llm.ts`, `provider_adapter.rs` | High     |
| TODO #16 | .env files not in Tauri deny list          | `capabilities/default.json`                   | Medium   |
| TODO #16 | Write deny list weaker than read deny list | `capabilities/default.json`                   | Medium   |
| Phase 5  | Task decomposer not idempotent             | `core/swarm/task_decomposer.rs:408`           | Medium   |

### ⚠️ Needs Human Decision (Not Auto-Fixable)

| #           | Issue                                                        | File                                                | Decision Needed                                                              |
| ----------- | ------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| H9          | Device poll legacy no-fingerprint path                       | `apps/web/app/api/device/poll/route.ts:97-103`      | Set sunset timeline or enforce fingerprint requirement                       |
| Kill switch | Fail-open during Supabase outage                             | `services/api-gateway/src/middleware/auth.ts:57-61` | Accept fail-open trade-off or switch to fail-closed                          |
| Migration   | non-idempotent CREATE POLICY / TRIGGER in migrations         | `supabase/migrations/` (3 files)                    | DBA awareness only — safe with Supabase runner, risky if re-applied manually |
| Build       | `cargo test --lib` fails (calamine/zip crate type inference) | `Cargo.toml`                                        | Fix `zip` crate version pinning                                              |
| TODO #1     | Model catalog refresh (gpt-5.3-codex, gemini-3.1-pro etc.)   | `src/constants/llm.ts`, `provider_adapter.rs`       | Verify new model IDs against live provider APIs                              |

---

## Fixes Applied This Audit Pass (2026-02-25, Phase 9)

| Fix                                                                       | Files Changed                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **FIXME #5 RESOLVED**: Prompt injection via escape_xml + sanitize         | `sys/commands/chat/tools.rs`, `sys/commands/chat/mod.rs`                 |
| **FIXME #6 RESOLVED**: Circuit breaker for streaming path                 | `core/llm/llm_router.rs` (invoke_streaming_with_retry)                   |
| **FIXME #7 RESOLVED**: SESSION_COST_SAFETY_CAP ($50) enforcement          | `core/llm/llm_router.rs` (invoke_candidate)                              |
| **FIXME #8 RESOLVED**: Ollama is_available() wired into routing           | `core/llm/providers/ollama.rs`, `core/llm/llm_router.rs`                 |
| TOOLCHAIN Bug #1 verified: requestId guard in approve/cancel              | `src/api/toolConfirmation.ts` (read-only verification)                   |
| TOOLCHAIN Bug #2 verified: tilde expansion + unit test                    | `core/llm/tool_executor.rs` (read-only verification)                     |
| `installer.rs:508`: FileOptions → SimpleFileOptions (zip crate)           | `apps/desktop/src-tauri/tests/installer.rs`                              |
| `Cargo.toml` dev-dependencies: Added `tauri = { features: ["test"] }`     | `apps/desktop/src-tauri/Cargo.toml`                                      |
| `safety_patterns.rs:26`: Extended rm regex to match `rm -fr` and `rm -rf` | `apps/desktop/src-tauri/src/core/agi/safety_patterns.rs`                 |
| `safety_patterns.rs:29`: Tightened deltree regex with word boundary       | `apps/desktop/src-tauri/src/core/agi/safety_patterns.rs`                 |
| `productivity_executor.rs` tests: Updated tool count 3 → 6                | `apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs` |
| `provider_adapter_tests.rs:51`: Fixed f32/f64 float comparison            | `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs`          |
| `research/agents.rs:768`: Updated test for DuckDuckGo fallback            | `apps/desktop/src-tauri/src/core/research/agents.rs`                     |
| Admin routes return 503 on Supabase outage (8 catch blocks)               | `apps/web/app/api/admin/{security,sso,directory-sync}/route.ts`          |
| Prettier auto-format (13 files including settings.local.json)             | various (apps/desktop/src and apps/web/app/api)                          |
| **Extension Bridge severity downgraded**: FIXME #1 to Low (partial fix)   | `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`      |

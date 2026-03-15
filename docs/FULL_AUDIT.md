# AGI Workforce Full Codebase Stabilization Audit

**Date:** 2026-03-11
**Total files to audit:** ~1,485 (702 Rust + 783 TypeScript)
**Total files audited:** 683 (updating as waves complete)
**Total bugs found:** 354 (updating as waves complete)
**Mode:** AUDIT + FIX — find bugs, complete stubs, stabilize

---

## Executive Summary

_(Written after all waves complete)_

## Priority Fix Matrix

| #   | Severity   | File                                   | Issue                                                                                                                                                                                                          | Fix Effort                    |
| --- | ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | ~~HIGH~~   | fallback_chain.rs                      | Re-baselined 2026-03-15: RateLimitTracker IS consulted in `route_with_retry()` (llm_router.rs:1309-1319) — records 429/5xx and skips rate-limited candidates. Audit entry was stale.                           | Fixed in live desktop runtime |
| 2   | HIGH       | thinking.rs                            | Extended thinking fully built but never wired to provider adapters                                                                                                                                             | L                             |
| 3   | MEDIUM     | models_config.rs                       | get_pricing() fallback (1.0, 1.0) masks missing models; helpers unused by router                                                                                                                               | S                             |
| 4   | MEDIUM     | capability_detection.rs                | 5s timeout on /api/show could block; only used in Ollama provider                                                                                                                                              | S                             |
| 5   | MEDIUM     | memory_integration.rs                  | Memory injection isolated to planner, not in chat send_message path                                                                                                                                            | M                             |
| 6   | LOW        | server_tools.rs                        | Anthropic server tool definitions built but never integrated                                                                                                                                                   | S                             |
| 7   | LOW        | background_manager.rs                  | 500ms polling loop instead of tokio notify                                                                                                                                                                     | S                             |
| 8   | LOW        | prompt_policy.rs                       | Searches all messages even after finding marker                                                                                                                                                                | S                             |
| 9   | CRITICAL   | server/handlers.rs                     | Historical issue resolved: embedded MCP `tools/call` now routes through `DesktopMcpServerExecutor` into the live desktop backend runtime instead of returning a placeholder                                    | Fixed in live desktop runtime |
| 10  | CRITICAL   | server/http_server.rs                  | Historical issue resolved: embedded MCP server now receives `AppHandle` through `McpServerState` and can execute tools / emit runtime events                                                                   | Fixed in live desktop runtime |
| 11  | HIGH       | extensions/manager.rs                  | Config encryption NOT implemented — API keys stored plaintext                                                                                                                                                  | M                             |
| 12  | HIGH       | extensions/installer.rs                | Install progress callback not wired to frontend                                                                                                                                                                | M                             |
| 13  | HIGH       | server/handlers.rs                     | No ToolGuard/approval integration — bash runs without consent                                                                                                                                                  | L                             |
| 14  | HIGH       | config.rs (MCP)                        | Missing DB functions: open_mcp_settings_db, decrypt_oauth_token                                                                                                                                                | M                             |
| 15  | HIGH       | config.rs (MCP)                        | Credential injection fails — OAuth tokens can't be decrypted                                                                                                                                                   | M                             |
| 16  | MEDIUM     | transport.rs                           | HttpSseTransport no timeout — unresponsive servers hang forever                                                                                                                                                | M                             |
| 17  | MEDIUM     | registry.rs                            | Tool ID resolve is O(N) full scan for hashed IDs                                                                                                                                                               | M                             |
| 18  | MEDIUM     | config.rs (MCP)                        | unwrap_or returns encrypted token if decrypt fails — garbage creds                                                                                                                                             | S                             |
| 19  | HIGH       | DUPLICATION                            | Two parallel tool execution paths: agi/executors/ AND llm/tool_executor/                                                                                                                                       | L                             |
| 20  | MEDIUM     | file_tools.rs                          | References file_read_binary tool that doesn't exist                                                                                                                                                            | S                             |
| 21  | MEDIUM     | browser_tools.rs                       | CSS selector injection — not escaped in querySelector                                                                                                                                                          | M                             |
| 22  | MEDIUM     | code_executor.rs                       | MAX_CODE_LENGTH and DANGEROUS_PATTERNS defined but not enforced                                                                                                                                                | M                             |
| 23  | LOW        | mcp_tools.rs                           | MCP tool timeout hardcoded at 120s/300s max                                                                                                                                                                    | S                             |
| 24  | CRITICAL   | memory_manager.rs                      | Historical issue resolved: `remember()` now updates the semantic index immediately; stale-search audit claim was based on older code                                                                           | Fixed in live desktop runtime |
| 25  | CRITICAL   | providers/bedrock.rs                   | Bedrock provider NOT IMPLEMENTED — blocks all AWS users                                                                                                                                                        | L                             |
| 26  | CRITICAL   | provider_adapter.rs                    | Bedrock routed to OpenAI adapter — wrong API format                                                                                                                                                            | L                             |
| 27  | ~~HIGH~~   | sse_parser.rs                          | Fixed 2026-03-15: Tool call index fallback now logs error for multi-tool chunks; single-element chunks use debug-level log. Prevents silent index corruption.                                                  | Fixed                         |
| 28  | ~~HIGH~~   | provider_adapter.rs / models_config.rs | Fixed 2026-03-15: `model_uses_responses_api()` now covers gpt-5*, gpt-4.1*, o3*, o4*, gpt-oss*, codex-* per March 2026 OpenAI model catalog                                                                    | Fixed                         |
| 29  | HIGH       | vision.rs                              | OCR feature guard missing — find_text silently returns empty on non-OCR builds                                                                                                                                 | S                             |
| 30  | HIGH       | autonomous.rs                          | Vision calls not guarded — agent loops hang 30s on TextMatch without OCR                                                                                                                                       | S                             |
| 31  | HIGH       | executor.rs (AGI)                      | Silent tool execution failure — tools registered but no executor, falls through silently                                                                                                                       | M                             |
| 32  | HIGH       | conversation_summarizer.rs             | Returns empty ExtractionResult on LLM failure — silent data loss                                                                                                                                               | M                             |
| 33  | HIGH       | continuous_executor.rs                 | 1,718 lines of dead code (#[allow(dead_code)]) — never called                                                                                                                                                  | S                             |
| 34  | ~~MEDIUM~~ | sse_parser.rs                          | Fixed 2026-03-15: Added per-chunk idle timeout (90s) in `SseStreamParser::poll_next()`. Catches frozen streams at the SSE layer before consumer-level timeout.                                                 | Fixed                         |
| 35  | MEDIUM     | core.rs (AGI)                          | Duplicate LearningSystem::new() — first instance leaked                                                                                                                                                        | S                             |
| 36  | MEDIUM     | core.rs (AGI)                          | std::sync::Mutex in async context — deadlock risk under load                                                                                                                                                   | L                             |
| 37  | MEDIUM     | autonomous.rs                          | MAX_LOOP_ITERATIONS=25 too low for multi-step tasks with replanning                                                                                                                                            | M                             |
| 38  | MEDIUM     | approval.rs                            | Two approval systems (Manager + Controller) not integrated                                                                                                                                                     | M                             |
| 39  | MEDIUM     | code_generator.rs                      | Silent failure on malformed LLM response — returns empty Vec                                                                                                                                                   | S                             |
| 40  | MEDIUM     | rag_system.rs                          | Defines embedding fields but always sets None — no actual RAG                                                                                                                                                  | M                             |
| 41  | MEDIUM     | semantic_search.rs                     | Real embeddings exist in DB but not used — TF-IDF only                                                                                                                                                         | M                             |
| 42  | LOW        | undo_manager.rs                        | TOCTOU race condition on file existence check                                                                                                                                                                  | S                             |
| 43  | LOW        | continuous_executor.rs                 | progress_percent hardcoded at 0.0 — progress bar always stuck                                                                                                                                                  | M                             |
| 44  | LOW        | api_tools_impl.rs                      | 255 lines dead code — superseded by executors/api_executor.rs                                                                                                                                                  | S                             |
| 45  | LOW        | background_tasks.rs                    | 848 lines well-implemented but never called from agent code                                                                                                                                                    | S                             |
| 46  | ~~HIGH~~   | provider_adapter.rs                    | Fixed 2026-03-15: GoogleAdapter now converts ChatMessage to Gemini-native `{ role, parts: [{ text }, { inlineData }, ...] }` format. Handles Image, Video, Audio, Document, ToolUse, ToolResult content parts. | Fixed                         |
| 47  | HIGH       | vision.rs                              | find_text returns hardcoded (960,540) screen center — OCR clicking always misses target                                                                                                                        | M                             |
| 48  | HIGH       | planner.rs (AGI)                       | calculate_plan_duration: >50 checked before >80 — 2x multiplier branch unreachable                                                                                                                             | S                             |
| 49  | HIGH       | project_memory.rs                      | UNIQUE(project_folder,memory_type) blocks multiple arch decisions — INSERT crashes                                                                                                                             | M                             |
| 50  | MEDIUM     | provider_adapter.rs                    | Anthropic adapter via DirectAPI doesn't convert tool_calls/tool-role messages                                                                                                                                  | M                             |
| 51  | MEDIUM     | autonomous.rs                          | agent:task_approval_required event uses snake_case keys — violates IPC convention                                                                                                                              | S                             |
| 52  | MEDIUM     | autonomous.rs                          | System::new_all() + refresh_all() called every 50ms loop iteration — expensive                                                                                                                                 | S                             |
| 53  | MEDIUM     | orchestrator.rs                        | Historical issue resolved: live AGI orchestrator now uses `join_all` for true parallel agent spawning                                                                                                          | Fixed in live desktop runtime |
| 54  | MEDIUM     | tools/mod.rs                           | Historical issue resolved: platform-aware shell defaults now route Windows to PowerShell, macOS to zsh, and Linux to bash                                                                                      | Fixed in live desktop runtime |
| 55  | MEDIUM     | search.rs (chat)                       | Historical issue resolved: chat search now escapes user terms into literal FTS queries instead of passing raw MATCH syntax through                                                                             | Fixed in live desktop runtime |
| 56  | MEDIUM     | control.rs                             | Historical issue resolved: local database reset now runs inside one transaction before clearing the pending queue                                                                                              | Fixed in live desktop runtime |
| 57  | MEDIUM     | compaction.rs                          | Historical issue resolved: context compaction now persists a replacement summary message locally instead of returning a no-op success                                                                          | Fixed in live desktop runtime |
| 58  | MEDIUM     | search.rs (chat)                       | Historical issue resolved: semantic chat search now computes document magnitude across all document terms instead of only query terms                                                                          | Fixed in live desktop runtime |
| 59  | CRITICAL   | auth_db.rs                             | Historical issue resolved: `auth_sessions` now rebuilds to unique hash/encrypted columns, re-encrypts legacy rows in migration `v59`, and keeps legacy token columns redacted                                  | Fixed in live desktop runtime |
| 60  | CRITICAL   | oauth.rs                               | Historical issue resolved: `OAuthAuthorizationUrl` no longer exposes `pkce_verifier`; verifier remains internal to the pending verifier store                                                                  | Fixed in live desktop runtime |
| 61  | HIGH       | auth_db.rs                             | Historical issue resolved: `update_session_tokens` now rotates hash/encrypted fields while keeping legacy token columns redacted                                                                               | Fixed in live desktop runtime |
| 62  | HIGH       | auth_db.rs                             | Historical issue resolved: auth session reads now require encrypted token payloads; plaintext legacy rows are migrated instead of being returned raw                                                           | Fixed in live desktop runtime |
| 63  | HIGH       | auth.rs                                | Historical issue resolved: token validation rate limiting now keys on a full-token digest instead of the first 8 characters                                                                                    | Fixed in live desktop runtime |
| 64  | HIGH       | permissions.rs                         | Historical issue resolved: `get_all_permissions` now uses `updated_at`, and the live permissions module has regression coverage for full-row reads                                                             | Fixed in live desktop runtime |
| 65  | HIGH       | storage.rs                             | Historical issue resolved: `SecureStorage::lock()` uses volatile writes plus a compiler fence for zeroization                                                                                                  | Fixed in live desktop runtime |
| 66  | HIGH       | audit_logger.rs                        | Historical issue resolved: `generate_signature` now returns an error on HMAC failure instead of silently producing an empty signature                                                                          | Fixed in live desktop runtime |
| 67  | MEDIUM     | tool_guard.rs                          | Historical issue resolved: SQL validation now normalizes comments, allows legitimate comments/hex literals, and still blocks classical injection plus time-based abuse patterns                                | Fixed in live desktop runtime |
| 68  | MEDIUM     | dm_protection.rs                       | All state in-memory only — pairing codes lost on restart                                                                                                                                                       | M                             |
| 69  | MEDIUM     | machine_key.rs                         | has_machine_only_secrets() is stub (always true) — migration detection broken                                                                                                                                  | S                             |
| 70  | MEDIUM     | updater.rs                             | Historical issue resolved: `should_update()` now parses semantic versions and rejects downgrades instead of using raw string inequality                                                                        | Fixed in live desktop runtime |
| 71  | MEDIUM     | validator.rs + command_validator.rs    | Historical issue resolved: `validator.rs` was removed as dead duplicate code, and `command_validator.rs` is now the sole command-validation surface exported from `sys/security/mod.rs`                        | Fixed in live desktop runtime |
| 72  | CRITICAL   | chat/mod.rs + 6 submodule files        | Historical issue resolved: the live chat runtime now declares and uses real submodules instead of leaving the refactor unreachable                                                                             | Fixed in live desktop runtime |
| 73  | HIGH       | chat/messages.rs vs mod.rs             | Historical issue resolved: assistant-message persistence/cloud-sync logic now lives in the canonical chat persistence path                                                                                     | Fixed in live desktop runtime |
| 74  | HIGH       | chat/mod.rs                            | `total_input_tokens` and `total_output_tokens` permanently hardcoded to 0 — billing broken                                                                                                                     | M                             |
| 75  | HIGH       | chat/mod.rs (context.rs)               | Historical issue resolved: tool-definition ownership now lives in canonical chat helper modules instead of the dead split path                                                                                 | Fixed in live desktop runtime |
| 76  | CRITICAL   | analytics.rs                           | Historical issue resolved: analytics now reuse the managed `AppDatabase` SQLite connection instead of opening a second writer                                                                                  | Fixed in live desktop runtime |
| 77  | CRITICAL   | code_editing.rs                        | Historical issue resolved: `apply_changes` / composer edit writes now use the canonical `validate_path_security()` guard before filesystem writes                                                              | Fixed in live desktop runtime |
| 78  | CRITICAL   | code_editing.rs                        | Historical issue resolved: `try_git_revert` now routes paths through the canonical path-security guard before invoking `git checkout -- <path>`                                                                | Fixed in live desktop runtime |
| 79  | HIGH       | cache.rs                               | Historical issue resolved: cache analytics now read `last_used_at` correctly instead of the truncated `last_used_a` column                                                                                     | Fixed in live desktop runtime |
| 80  | HIGH       | cache.rs                               | Historical issue resolved: codebase cache stats now derive hit/miss counts from percentage rates instead of truncating them to 0                                                                               | Fixed in live desktop runtime |
| 81  | HIGH       | error_reporting.rs                     | Historical issue resolved: Sentry reporting now preserves DSN auth by building the `/api/{project}/store/` endpoint and sending `X-Sentry-Auth`                                                                | Fixed in live desktop runtime |
| 82  | HIGH       | analytics.rs                           | `new_users_today` compares session `id` (UUID) to user ID — always 0                                                                                                                                           | S                             |
| 83  | HIGH       | checkpoints.rs                         | Historical issue resolved: `checkpoint_restore` now uses a real rusqlite transaction helper and records restore history atomically                                                                             | Fixed in live desktop runtime |
| 84  | CRITICAL   | llm.rs:630                             | Historical issue resolved: usage stats query now aliases `COUNT(*) AS message_count` correctly                                                                                                                 | Fixed in live desktop runtime |
| 85  | CRITICAL   | operations.rs                          | Historical issue resolved: approve/reject now reuse the managed `AppDatabase` connection via `ApprovalWorkflow` instead of opening a second SQLite writer                                                      | Fixed in live desktop runtime |
| 86  | HIGH       | github.rs                              | Historical issue resolved: GitHub clone/fetch now reuses the canonical `make_git_credentials` fallback chain, so HTTPS remotes can use the system credential helper instead of SSH-only auth                   | Fixed in live desktop runtime |
| 87  | HIGH       | scheduler.rs                           | `ShellCommand` action type with no validated executor — unvalidated shell if wired                                                                                                                             | M                             |
| 88  | HIGH       | migration.rs                           | Historical issue resolved: Lovable migration commands now fail honestly with a not-implemented error instead of returning fake validation or fabricated workflow data                                          | Fixed in live desktop runtime |
| 89  | HIGH       | mcp_server.rs                          | Historical issue resolved: embedded MCP server IPC responses redact the auth token before exposing state to the renderer                                                                                       | Fixed in live desktop runtime |
| 90  | HIGH       | draft_manager.rs:81                    | Historical issue resolved: draft queries use `saved_at` and no longer crash on the truncated `saved_a` column name                                                                                             | Fixed in live desktop runtime |
| 91  | HIGH       | draft_manager.rs                       | Historical issue resolved: `message_drafts` is created by the live draft manager before use, so draft CRUD no longer fails on a missing table                                                                  | Fixed in live desktop runtime |
| 92  | HIGH       | database/postgres.rs                   | `get_client()` creates new TCP connection every call — pool bypassed                                                                                                                                           | M                             |
| 93  | CRITICAL   | billing/webhooks.rs:252                | Historical issue resolved: subscription writes now use `updated_at` in the live webhook INSERT path                                                                                                            | Fixed in live desktop runtime |
| 94  | CRITICAL   | billing/webhooks.rs:597                | Historical issue resolved: retry processing reuses the stored payload directly instead of sending an empty signature                                                                                           | Fixed in live desktop runtime |
| 95  | CRITICAL   | permissions/manager.rs:102             | Historical issue resolved: loaded permission policies are now written into `self.policies` during startup                                                                                                      | Fixed in live desktop runtime |
| 96  | HIGH       | billing/webhooks.rs:441                | Historical issue resolved: payment-failed handling now tracks `grace_period_end` in logs only and updates persisted subscription state without referencing a missing column                                    | Fixed in live desktop runtime |
| 97  | HIGH       | billing/stripe_client.rs:790           | Historical issue resolved: payment-method persistence now funnels through the canonical helper and quotes the `"type"` column in both Stripe write paths                                                       | Fixed in live desktop runtime |
| 98  | HIGH       | permissions/audit.rs                   | Historical issue resolved: permissions audit logger now keeps a single owned SQLite connection instead of reopening the DB on every call                                                                       | Fixed in live desktop runtime |
| 99  | CRITICAL   | lib.rs                                 | Historical issue resolved: `AGICheckpointState` is managed during startup, including fallback initialization                                                                                                   | Fixed in live desktop runtime |
| 100 | CRITICAL   | lib.rs                                 | Historical issue resolved: embeddings now manage the exact `Arc<Mutex<EmbeddingService>>` Tauri state type with an in-memory degraded fallback                                                                 | Fixed in live desktop runtime |
| 101 | HIGH       | lib.rs                                 | Historical issue resolved: audited `hooks_*` commands are now registered in `generate_handler!`                                                                                                                | Fixed in live desktop runtime |
| 102 | HIGH       | lib.rs                                 | Historical issue resolved: audited `thinking_*` commands are now registered in `generate_handler!`                                                                                                             | Fixed in live desktop runtime |
| 103 | HIGH       | lib.rs                                 | Historical issue resolved: audited `canvas_*` commands are now registered in `generate_handler!`                                                                                                               | Fixed in live desktop runtime |
| 104 | HIGH       | lib.rs                                 | Historical issue resolved: audited Gmail OAuth commands are now registered in `generate_handler!`                                                                                                              | Fixed in live desktop runtime |
| 105 | HIGH       | lib.rs                                 | Historical issue resolved: audited git merge / PR / conflict commands are now registered in `generate_handler!`                                                                                                | Fixed in live desktop runtime |

---

## Wave 1: Rust Critical Path (core/llm, core/agent, core/mcp, core/agi)

### W1-A1: LLM Router + SSE Parser + Providers — COMPLETE

**Files audited:** 12 | **Total LOC:** ~9,316 | **Bugs:** 9 (2 CRITICAL, 2 HIGH, 4 MEDIUM, 1 LOW)
**Overall:** MOSTLY WORKING — 75% production ready. All 18+ providers work for basic messages. Bedrock broken.

| File                                | Lines | Status  | Purpose                                                 |
| ----------------------------------- | ----- | ------- | ------------------------------------------------------- |
| llm_router.rs                       | 2,604 | Working | Central routing, retry, cost tracking ($50 session cap) |
| sse_parser.rs                       | 1,175 | Partial | SSE parsing — tool call index out-of-order bug          |
| provider_adapter.rs                 | 2,452 | Partial | Request/response format mapping — Bedrock wrong adapter |
| providers/mod.rs                    | 13    | Working | Module exports                                          |
| providers/direct_api_provider.rs    | 576   | Working | BYOK provider for 22+ cloud LLMs, SSRF protection       |
| providers/http_client_factory.rs    | 124   | Working | reqwest client with proxy/TLS config                    |
| providers/http_client.rs            | 87    | Working | HTTP client wrapper                                     |
| providers/ollama.rs                 | 630   | Working | Local Ollama — capability detection, tool injection     |
| providers/managed_cloud_provider.rs | 895   | Working | AGI Workforce billing layer, model canonicalization     |
| providers/azure.rs                  | 100   | Working | Azure OpenAI URL construction + validation              |
| providers/bedrock.rs                | 110   | Broken  | NOT IMPLEMENTED — returns error immediately             |

**Provider Compatibility:** OpenAI ✓, Anthropic ✓, Google ✓, Ollama ✓, Azure ✓, Perplexity ✓ (no tools), DeepSeek ✓, Mistral ✓, XAI ✓, Groq ✓, Together ✓, Cohere ✓, Bedrock ✗

**Key Finding:** Core routing and streaming work for all OpenAI-compatible providers. Bedrock is completely non-functional (no SigV4 signing). SSE parser has a tool call index accumulation bug that can corrupt multi-tool streaming responses. No idle timeout on streaming — if provider goes silent, UI freezes.

### W1-A2: Tool Executors (20 files) — COMPLETE

**Files audited:** 21 | **Total LOC:** ~10,410 | **Bugs:** 5 (1 HIGH, 3 MEDIUM, 1 LOW)
**Overall:** 95% working — well-structured dispatcher with 50+ tools. All critical tools functional.

| File                   | Lines | Status  | Purpose                                                  |
| ---------------------- | ----- | ------- | -------------------------------------------------------- |
| mod.rs                 | 1,955 | Working | Main dispatcher, safety tiers, timeouts, path resolution |
| api_tools.rs           | 288   | Working | HTTP requests with HTML-to-text extraction               |
| browser_tools.rs       | 946   | Partial | CDP automation — CSS selector injection vulnerability    |
| code_tools.rs          | 291   | Working | Code execution and analysis                              |
| communication_tools.rs | 412   | Working | Email, calendar, chat integrations                       |
| db_tools.rs            | 577   | Working | Database query/execute with SQL injection protection     |
| document_tools.rs      | 277   | Working | PDF, Word, Excel generation                              |
| edit_tools.rs          | 721   | Working | Multi-edit, patch, rollback                              |
| file_tools.rs          | 729   | Partial | File R/W — references nonexistent file_read_binary       |
| git_tools.rs           | 362   | Working | Git status, commit, push                                 |
| interactive_tools.rs   | 175   | Working | User question/answer via oneshot channels                |
| llm_tools.rs           | 71    | Working | LLM reasoning sub-tool                                   |
| mcp_tools.rs           | 379   | Working | MCP tool execution with tilde expansion                  |
| media_tools.rs         | 270   | Working | Image/video generation                                   |
| memory_tools.rs        | 326   | Working | Memory remember/recall/search                            |
| planning_tools.rs      | 120   | Working | Workflow planning                                        |
| scheduler_tools.rs     | 423   | Working | Task scheduling                                          |
| search_tools.rs        | 386   | Working | Web search + physical scrape with HTML parsing           |
| terminal_tools.rs      | 668   | Working | Shell execution with security blocklist                  |
| ui_automation_tools.rs | 308   | Working | Screenshot, click, type                                  |

**Key Finding:** Tool dispatcher is solid — 50+ tools correctly routed. Main issues: missing file_read_binary, CSS selector injection in browser, and API responses truncated at 15KB.

### W1-A3: LLM Cache + Fallback + Config — COMPLETE

**Files audited:** 11 | **Total LOC:** 4,694 | **Bugs:** 8 (2 HIGH, 3 MEDIUM, 3 LOW)
**Overall:** MOSTLY WORKING but 68% (~3,200 LOC) is orphaned/unwired

| File                     | Lines | Status    | Purpose                                                                   |
| ------------------------ | ----- | --------- | ------------------------------------------------------------------------- |
| cache_manager.rs         | 339   | Working   | LLM response caching with TTL/temperature-aware expiry                    |
| fallback_chain.rs        | 1,284 | Dead Code | Model fallback with rate-limit tracking — IMPORTED but UNUSED             |
| capability_detection.rs  | 502   | Working   | Ollama /api/show probing for tool/vision support                          |
| models_config.rs         | 449   | Partial   | Model catalog from models.json — helpers defined but not called by router |
| thinking.rs              | 457   | Dead Code | Extended thinking budget + trigger detection — fully ORPHANED             |
| memory_integration.rs    | 371   | Partial   | Memory injection — only used in planner, not chat loop                    |
| prompt_policy.rs         | 76    | Working   | Anti-XML-injection rule                                                   |
| prompt_tool_injection.rs | 470   | Working   | Tool descriptions for non-function-calling models                         |
| server_tools.rs          | 319   | Dead Code | Anthropic server tool definitions — never integrated                      |
| background_manager.rs    | 327   | Dead Code | Async background LLM queue — isolated, not integrated                     |
| job_autofill_runtime.rs  | 100   | Working   | Chrome extension job autofill — extension-only                            |

**Key Finding:** Only cache_manager, prompt_tool_injection, and capability_detection are wired into the chat path. fallback_chain (1,284 LOC), thinking (457 LOC), memory_integration (371 LOC), server_tools (319 LOC), and background_manager (327 LOC) are all built but orphaned.

### W1-A4: Agent Executor + Planner + Autonomous — COMPLETE

**Files audited:** 19 | **Total LOC:** ~14,156 | **Bugs:** 7 (2 HIGH, 3 MEDIUM, 2 LOW)
**Overall:** MOSTLY WORKING with critical vision gaps. Action dispatch solid, approval partially wired.

| File                       | Lines | Status    | Purpose                                                                           |
| -------------------------- | ----- | --------- | --------------------------------------------------------------------------------- |
| mod.rs                     | 305   | Working   | Core types — Action enum (12 variants), TaskStatus (7 states)                     |
| executor.rs                | 566   | Working   | Action dispatch to OS — URL validation, path blocking                             |
| planner.rs                 | 349   | Working   | LLM task planning — JSON extraction, fallback plan                                |
| autonomous.rs              | 1,272 | Partial   | Task loop — MAX_LOOP=25, approval via oneshot channels                            |
| approval.rs                | 451   | Partial   | Two systems: ApprovalManager (bool) + ApprovalController (trust) — not integrated |
| runtime.rs                 | 1,145 | Partial   | Task queue + AGICore integration — facade for autonomous agent                    |
| vision.rs                  | 183   | Broken    | OCR feature-gated but called unconditionally — silent failures                    |
| continuous_executor.rs     | 1,718 | Dead Code | #[allow(dead_code)] — never instantiated                                          |
| background_agent.rs        | 2,010 | Working   | Parallel agent pool (max 8), proper Arc<> cloning                                 |
| context_manager.rs         | 395   | Working   | LLM context aggregation                                                           |
| context_compactor.rs       | 276   | Dead Code | Memory-efficient context — unused                                                 |
| undo_manager.rs            | 882   | Working   | Step undo/redo with 50-item limit                                                 |
| form_undo.rs               | 724   | Working   | Form field mutation tracking — 13 tests passing                                   |
| background_tasks.rs        | 848   | Working   | Task persistence to SQLite — never called from agent code                         |
| ai_orchestrator.rs         | 391   | Partial   | Internal LLM routing — limited observability                                      |
| code_generator.rs          | 629   | Partial   | Code synthesis — silent failures on malformed LLM response                        |
| intelligent_file_access.rs | 400   | Partial   | Vision fallback incomplete                                                        |
| rag_system.rs              | 262   | Dead Code | Embedding fields always None — no actual RAG                                      |
| prompt_engineer.rs         | 445   | Working   | System prompt generation — 26KB embedded instructions                             |

**Key Finding:** Action dispatch is excellent (12 variants, URL validation, path blocking). Vision features silently fail on non-OCR builds — `find_text()` returns empty Vec with no warning. Two approval systems exist (bool-based Manager + trust-based Controller) but agent only uses the simpler one. 3,600+ LOC dead code (continuous_executor + context_compactor + rag_system).

### W1-A5: Agent Secondary Modules — COMPLETE

**Files audited:** 10 | **Total LOC:** ~6,813 | **Bugs:** 6 (1 HIGH, 3 MEDIUM, 2 LOW)
**Overall:** Only change_tracker.rs is actively called. 4,600+ LOC available but unused.

| File                       | Lines | Status    | Called?       | Purpose                                          |
| -------------------------- | ----- | --------- | ------------- | ------------------------------------------------ |
| change_tracker.rs          | 594   | Working   | ✅ runtime.rs | File/git/command change tracking for undo        |
| code_generator.rs          | 629   | Partial   | ✗             | LLM code generation — silent JSON parse failures |
| continuous_executor.rs     | 1,718 | Dead Code | ✗             | 24/7 execution — #[allow(dead_code)]             |
| form_undo.rs               | 724   | Working   | ✗             | Form submission undo — 13 tests passing          |
| intelligent_file_access.rs | 400   | Partial   | Indirect      | Vision fallback incomplete                       |
| prompt_engineer.rs         | 445   | Working   | ✗             | Prompt templates — utility only                  |
| rag_system.rs              | 262   | Dead Code | ✗             | No embeddings, keyword-only matching             |
| timeout_manager.rs         | 311   | Working   | ✗             | Task timeouts — pause/resume stubs               |
| undo_manager.rs            | 882   | Working   | ✗             | Undo operations — TOCTOU race condition          |
| background_tasks.rs        | 848   | Working   | ✗             | Task persistence — well-implemented but unused   |

**Key Finding:** Only 1 of 10 modules (change_tracker) is actually called in production. The remaining ~6,200 LOC is built, some well-tested, but completely disconnected from the agent execution pipeline. continuous_executor alone is 1,718 lines of dead code.

### W1-A6: MCP Client + Manager + Transport — COMPLETE

**Files audited:** 14 | **Total LOC:** 6,295 | **Bugs:** 9 (2 HIGH, 5 MEDIUM, 2 LOW)
**Overall:** PARTIAL — architecturally sound but blocked on missing DB functions for credentials

| File             | Lines | Status  | Purpose                                        |
| ---------------- | ----- | ------- | ---------------------------------------------- |
| mod.rs           | 35    | Working | Module exports                                 |
| error.rs         | 36    | Working | McpError enum                                  |
| events.rs        | 60    | Working | Event emission system                          |
| logs.rs          | 39    | Working | Server log buffering                           |
| client.rs        | 245   | Working | MCP client connection + tool listing           |
| manager.rs       | 304   | Working | Server lifecycle management                    |
| protocol.rs      | 338   | Working | JSON-RPC 2.0 serialization                     |
| session.rs       | 362   | Working | Session init + tool execution                  |
| config.rs        | 964   | Broken  | Missing DB functions, OAuth decrypt fails      |
| transport.rs     | 1,795 | Partial | Stdio+HTTP-SSE — no timeout on SSE             |
| registry.rs      | 463   | Partial | Tool ID encoding — O(N) resolve for hashed IDs |
| health.rs        | 149   | Working | Health monitoring                              |
| tool_executor.rs | 400   | Working | Tool execution + stats tracking                |
| tests.rs         | 1,105 | Working | Integration tests                              |

**Key Finding:** MCP core (client → session → protocol → transport) works for stdio servers. HTTP-SSE has no timeout. Config/credential layer is broken due to missing DB functions (open_mcp_settings_db, decrypt_oauth_token). Servers requiring API keys cannot start.

### W1-A7: MCP Server + Extensions — COMPLETE

**Files audited:** 12 | **Total LOC:** 3,443 | **Bugs:** 5 (2 CRITICAL, 3 HIGH)
**Overall:** Extensions 85% ready; MCP HTTP Server 40% — tool execution NOT implemented

| File                     | Lines | Status  | Purpose                                  |
| ------------------------ | ----- | ------- | ---------------------------------------- |
| server/mod.rs            | 6     | Working | Module exports                           |
| server/auth.rs           | 36    | Working | Token auth with constant-time compare    |
| server/handlers.rs       | 118   | Broken  | Tool execution returns PLACEHOLDER       |
| server/http_server.rs    | 161   | Broken  | No AppHandle — can't execute tools       |
| server/tools.rs          | 79    | Working | Hardcoded 5-tool registry                |
| extensions/mod.rs        | 70    | Working | Constants + exports                      |
| extensions/error.rs      | 178   | Working | Comprehensive error types                |
| extensions/manifest.rs   | 526   | Working | Manifest parsing + validation            |
| extensions/package.rs    | 397   | Working | ZIP security (path traversal, checksums) |
| extensions/installer.rs  | 601   | Partial | ZIP extraction — no progress callback    |
| extensions/repository.rs | 634   | Working | SQLite CRUD for extensions               |
| extensions/manager.rs    | 637   | Partial | Lifecycle mgmt — no config encryption    |

**Key Finding:** MCP HTTP Server is a shell — auth/parsing works but tool execution is a placeholder. Extensions system is production-quality (security, validation) but stores API keys in plaintext.

### W1-A8: AGI Core + Orchestrator — COMPLETE

**Files audited:** 8 | **Total LOC:** ~7,975 | **Bugs:** 5 (1 HIGH, 3 MEDIUM, 1 LOW)
**Overall:** WORKING — Goal→Plan→Execute→Reflect pipeline functional. Silent tool execution fallthrough.

| File                | Lines | Status    | Purpose                                                                    |
| ------------------- | ----- | --------- | -------------------------------------------------------------------------- |
| mod.rs              | 262   | Working   | Module exports + AGI configuration structs                                 |
| core.rs             | 1,424 | Partial   | Central AGI orchestrator — duplicate LearningSystem init, async Mutex risk |
| executor.rs         | 1,148 | Partial   | Tool execution — silent fallthrough for unregistered tools                 |
| orchestrator.rs     | 739   | Working   | Agent spawning + resource coordination (120s timeout)                      |
| planner.rs          | 684   | Working   | LLM-based planning system                                                  |
| api_tools_impl.rs   | 255   | Dead Code | Superseded by executors/api_executor.rs                                    |
| tools/mod.rs        | 3,227 | Working   | Tool registry + definitions (30+ tools)                                    |
| tools/skill_tool.rs | 234   | Working   | Skill discovery + execution interface                                      |

**Key Finding:** The Goal→Plan→Execute→Reflect pipeline works for single goals. However, executor.rs has a silent fallthrough: tools registered in tools/mod.rs (30+) but not in ExecutorRegistry silently fail. Two orchestration layers exist (core/agi vs core/agent) with unclear separation — agi is primary, agent appears legacy but still imported. Duplicate LearningSystem::new() call leaks first instance.

### W1-A9: AGI Memory + Learning — COMPLETE

**Files audited:** 10 | **Total LOC:** ~8,156 | **Bugs:** 4 (1 CRITICAL, 1 HIGH, 2 MEDIUM)
**Overall:** PARTIAL — Storage works, semantic search broken at runtime. Real embeddings exist but unused.

| File                          | Lines | Status    | Purpose                                                                                                            |
| ----------------------------- | ----- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| memory.rs                     | 75    | Dead Code | Deprecated VecDeque working memory                                                                                 |
| learning.rs                   | 223   | Working   | Tool execution learning — O(1) strategy tracking                                                                   |
| knowledge.rs                  | 380   | Working   | SQLite knowledge base for goals/experiences                                                                        |
| semantic_search.rs            | 542   | Partial   | TF-IDF in-memory search — no real embeddings                                                                       |
| conversation_summarizer.rs    | 1,052 | Partial   | Auto-summarize + real embeddings (3-tier fallback) — empty on LLM failure                                          |
| reflection.rs                 | 1,220 | Working   | Post-execution failure analysis                                                                                    |
| memory_manager.rs             | 2,190 | Working   | `remember()` updates the semantic index immediately; semantic search freshness is covered by live regression tests |
| memory_persistence.rs         | 1,436 | Working   | Enhanced memory with vectors + decay                                                                               |
| project_memory.rs             | 775   | Working   | Project-scoped memories                                                                                            |
| planner_memory_integration.rs | 263   | Working   | Memory-aware planning                                                                                              |

**Key Finding:** **CRITICAL BUG** — `remember()` stores memories to SQLite but never calls `update_index()`, leaving the TF-IDF search index permanently stale. New memories are stored but unsearchable. Tests mask this by calling `build_index()` manually. Additionally, real neural embeddings are generated by HttpSummaryLLM (Ollama→OpenAI→None fallback) and stored in DB, but `semantic_search()` only uses TF-IDF — the embeddings are completely bypassed. Conversation summarizer returns empty results when both Ollama and OpenAI fail, silently discarding conversations.

### W1-A10: AGI Executors (19 files) — COMPLETE

**Files audited:** 19 | **Total LOC:** ~17,217 | **Bugs:** 5 (1 HIGH, 3 MEDIUM, 1 LOW)
**Overall:** WORKING — modern trait-based ExecutorRegistry. All critical executors functional.

| File                     | Lines  | Status  | Purpose                                             |
| ------------------------ | ------ | ------- | --------------------------------------------------- |
| mod.rs                   | ~1,000 | Working | ExecutorRegistry + dispatch + hooks                 |
| api_executor.rs          | 470    | Working | HTTP calls + upload/download                        |
| browser_executor.rs      | 1,727  | Working | CDP + ExtensionBridge fallback                      |
| calendar_executor.rs     | 382    | Working | Create/list calendar events                         |
| cloud_executor.rs        | 697    | Working | Cloud storage CRUD                                  |
| code_executor.rs         | 1,276  | Partial | Execution works but pattern validation NOT enforced |
| database_executor.rs     | 623    | Working | SQL with injection protection                       |
| email_executor.rs        | 482    | Working | Send/fetch email                                    |
| file_executor.rs         | 913    | Working | R/W/delete with size limits (50MB/10MB)             |
| git_executor.rs          | 2,899  | Working | Full VCS + PR creation + conflict resolution        |
| llm_executor.rs          | 653    | Working | Sub-LLM reasoning                                   |
| mcp_executor.rs          | 1,074  | Working | Circuit breaker, tool caching, stats — excellent    |
| media_executor.rs        | 466    | Working | Image/video generation                              |
| ocr_executor.rs          | 534    | Working | Feature-gated OCR                                   |
| outcome_executor.rs      | 1,025  | Working | Outcome tracking + false positive rates             |
| productivity_executor.rs | 1,004  | Working | Notion/Trello/Asana integration                     |
| search_executor.rs       | 957    | Working | Perplexity + DuckDuckGo fallback                    |
| terminal_executor.rs     | 1,152  | Working | Shell with ~30 blocked patterns                     |
| ui_executor.rs           | 428    | Working | Screenshot, click, type, OCR                        |

**CRITICAL FINDING: TWO PARALLEL TOOL EXECUTION PATHS EXIST:**

1. `core/agi/executors/` (ExecutorRegistry) — PRIMARY, modern, 70+ tools
2. `core/llm/tool_executor/` — LEGACY fallback, ~10K LOC of duplication
   Both implement ~18 identical tool categories. Bug fixes in one don't propagate to the other.

---

## Wave 2: Rust System + Data (sys/commands, sys/security, data/, root)

### W2-A1: Chat Commands (Core) — COMPLETE

**Files audited:** 8 | **Total LOC:** ~12,890 | **Bugs:** 9 (1 CRITICAL, 3 HIGH, 3 MEDIUM, 2 LOW)
**Overall:** `mod.rs` (6,370 lines) is a stale monolith that duplicates every function extracted into the new submodules — both `chat_send_message` implementations exist, but only `mod.rs`'s version is registered and used; all refactored submodule code (`send_message.rs`, `streaming.rs`, `context.rs`, `attachments.rs`, `cost.rs`, `intent.rs`) is unreachable dead code.

| File            | Lines | Status                                            | Purpose                                                            |
| --------------- | ----- | ------------------------------------------------- | ------------------------------------------------------------------ |
| mod.rs          | 6,370 | CRITICAL — Monolith with dead duplicate functions | CRUD, chat_send_message, tool loop, stop control, intent detection |
| send_message.rs | 2,684 | Dead code (not declared as `mod`)                 | Extracted version of chat_send_message — never called              |
| streaming.rs    | 898   | Dead code (not declared as `mod`)                 | Extracted streaming/tool-execution helpers — never called          |
| tool_events.rs  | 621   | Working                                           | ToolEvent enum, get_tool_display_info, tests                       |
| conversation.rs | 60    | Working                                           | Supabase cloud sync command                                        |
| messages.rs     | 319   | Divergent from mod.rs                             | CRUD helpers; `save_assistant_message` lacks `cloud_sync` param    |
| types.rs        | 552   | Working                                           | All request/response types, validation                             |
| tools.rs        | 1,386 | Working                                           | Tool definitions, registry, execution                              |

**Key Finding:** 6 submodule files (~4,000 lines) are never declared as `mod X;` in `mod.rs`, making them dead code. `mod.rs` retains full duplicate implementations of every extracted function. `messages.rs` IS declared but its `save_assistant_message` signature diverges — cloud sync is silently broken. `ConversationStats.total_input_tokens` and `total_output_tokens` are permanently hardcoded to `0` in every code path.

### W2-A2: Chat Commands (Secondary) — COMPLETE

**Files audited:** 13 | **Total LOC:** ~2,689 | **Bugs:** 9 (0 CRITICAL, 2 HIGH, 5 MEDIUM, 2 LOW)
**Overall:** Well-structured with proper input validation. Main issues: FTS5 injection, non-atomic DB clear, compaction is a no-op.

| File              | Lines | Status  | Purpose                                                                                                  |
| ----------------- | ----- | ------- | -------------------------------------------------------------------------------------------------------- |
| attachments.rs    | 498   | Working | Text extraction from files/PDFs, multimodal image conversion                                             |
| branching.rs      | 200   | Working | Conversation forking with ownership verification                                                         |
| compaction.rs     | 178   | Working | Compaction computes and persists a replacement summary message inside one local transaction              |
| context.rs        | 363   | Working | Context building — OS info, project structure, browser, memory                                           |
| control.rs        | 116   | Working | Stop/cancel/clear — clear_local_database now wipes tables transactionally and clears pending queue state |
| cost.rs           | 216   | Working | Billing budget checks, cost analytics, monthly budget                                                    |
| export.rs         | 219   | Working | Markdown + PDF export with path-traversal protection                                                     |
| intent.rs         | 429   | Working | NLP intent detection — stop, action, conversation classification                                         |
| memory_handler.rs | 207   | Working | Chat memory integration — loads/saves project memories                                                   |
| pending.rs        | 228   | Working | Pending message queue while AI processing                                                                |
| search.rs         | 310   | Partial | FTS5 search — metacharacter injection, TF-IDF magnitude bug                                              |
| share.rs          | 103   | Working | Conversation sharing for web app                                                                         |
| state.rs          | 146   | Working | Global state, stop/cancel flags, AppDatabase                                                             |

**Key Finding:** Compaction feature is a complete no-op — it returns success with statistics but never writes to the database, so the next message load gets the full uncompacted history. FTS5 search passes user input directly to MATCH without escaping metacharacters (\*, NOT, NEAR), enabling DoS-style queries.

### W2-A3: Security (Core) — COMPLETE

**Files audited:** 9 | **Total LOC:** ~5,226 | **Bugs:** 8 (0 CRITICAL, 2 HIGH, 4 MEDIUM, 2 LOW)
**Overall:** Architecturally sound (AES-256-GCM, Argon2, rate limiting, SSRF protection). Live auth-session storage now uses hash-based lookup, encrypted token storage, and redacted legacy columns.

| File              | Lines | Status  | Purpose                                                                                                             |
| ----------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| tool_guard.rs     | 2,218 | Working | Tool execution guard — safety tiers, rate limiting, path/URL/SQL validation                                         |
| secret_manager.rs | 363   | Working | JWT secret + encryption key lifecycle with machine-derived keys                                                     |
| encryption.rs     | 171   | Working | AES-256-GCM primitives + SecretStore (in-memory HashMap)                                                            |
| auth.rs           | 658   | Working | AuthManager — Argon2 login, sessions, rate limiting, account lockout                                                |
| auth_db.rs        | 637   | Working | DB-backed auth — `auth_sessions` now uses hashed lookup + encrypted storage with legacy token columns redacted      |
| rbac.rs           | 404   | Working | Role-based access control with permission cache                                                                     |
| rate_limit.rs     | 132   | Working | Sliding-window rate limiter (bounded VecDeque per key)                                                              |
| sandbox.rs        | 325   | Working | Session sandbox with path/host allowlists, symlink-aware cleanup                                                    |
| permissions.rs    | 318   | Working | Permission persistence/query layer — `get_all_permissions` reads `updated_at` correctly and has regression coverage |

**Key Finding:** The previously-critical `auth_db.rs` plaintext-token issue is resolved in the live runtime: migration `v59` rebuilds `auth_sessions`, re-encrypts recoverable legacy rows, redacts legacy token columns, and shifts uniqueness to the hash columns. `tool_guard.rs` now normalizes comments so legitimate SQL comments and hex literals are allowed while classical injection and time-based abuse patterns remain blocked.

### W2-A4: Security (Secondary) — COMPLETE

**Files audited:** 21 | **Total LOC:** ~8,347 | **Bugs:** 8 (0 CRITICAL, 1 HIGH, 4 MEDIUM, 3 LOW)
**Overall:** Real crypto throughout (Argon2id, AES-256-GCM, HKDF, Ed25519). The live OAuth PKCE path now keeps the verifier internal; remaining issues in this wave are outside the old duplicate validator surface.

| File                  | Lines | Status    | Purpose                                                                                                |
| --------------------- | ----- | --------- | ------------------------------------------------------------------------------------------------------ |
| approval_workflow.rs  | 616   | Working   | Approval request lifecycle with SQLite, risk classification                                            |
| audit.rs              | 457   | Removed   | Dead duplicate automation-audit helper removed from the live security surface                          |
| audit_logger.rs       | 541   | Working   | HMAC-signed tamper-evident audit trail                                                                 |
| command_validator.rs  | 592   | Working   | Shell command validation, dangerous pattern blocking                                                   |
| dm_protection.rs      | 241   | Partial   | DM pairing — in-memory only, lost on restart                                                           |
| guardrails.rs         | 1     | Dead Code | Empty file — only a newline                                                                            |
| log_redaction.rs      | 88    | Working   | Regex-based secret redaction from logs                                                                 |
| machine_key.rs        | 334   | Partial   | PBKDF2 machine keys — has_machine_only_secrets() is stub (always true)                                 |
| master_password.rs    | 769   | Working   | Argon2id + HKDF key derivation, secure zeroization                                                     |
| oauth.rs              | 479   | Working   | OAuth2 + PKCE — verifier remains internal to the pending verifier store and is not returned to callers |
| prompt_injection.rs   | 499   | Working   | 24-pattern detector with Unicode normalization                                                         |
| storage.rs            | 595   | Working   | AES-256-GCM storage — `lock()` now uses volatile zeroization plus a compiler fence                     |
| updater.rs            | 616   | Working   | Update verification — semantic version comparison rejects downgrades and handles `v` prefixes          |
| validator.rs          | 499   | Removed   | Dead duplicate command classifier removed; `command_validator.rs` is canonical                         |
| api.rs                | 419   | Working   | API key management, HMAC validation, rate limiting                                                     |
| policy_integration.rs | 313   | Working   | Policy enforcement facade                                                                              |
| policy/mod.rs         | 9     | Working   | Module re-exports                                                                                      |
| policy/engine.rs      | 653   | Working   | Full policy decision engine with trust levels                                                          |
| policy/actions.rs     | 290   | Working   | SecurityAction enum (20+ action types)                                                                 |
| policy/decisions.rs   | 107   | Working   | PolicyDecision + TrustLevel + RiskLevel enums                                                          |
| policy/scope.rs       | 229   | Working   | Workspace scope with path blacklisting                                                                 |

**Key Finding:** The previously-critical PKCE verifier leak is already resolved in the live `oauth.rs` path: the verifier stays internal to the pending verifier store and is not exposed on `OAuthAuthorizationUrl`. `storage.rs` now zeroizes with volatile writes, `audit_logger.rs` errors instead of silently emitting an empty signature, `updater.rs` compares semantic versions correctly, and `command_validator.rs` is the sole command-validation surface. The old dead duplicates `audit.rs` and `validator.rs` have been removed from the live security surface.

### W2-A5: System Commands (A-F) — COMPLETE

**Files audited:** 38 | **Total LOC:** ~23,029 | **Bugs:** 28 (3 CRITICAL, 6 HIGH, 10 MEDIUM, 9 LOW)
**Overall:** Browser and automation commands are mostly clean. The earlier `analytics.rs` second-writer defect and the `code_editing.rs` path-security issues are resolved in the live runtime. The remaining high-risk cluster here is stale/fabricated analytics metrics plus the cache SQL/typing defects.

| File                     | Lines   | Status   | Purpose                                                                                                      |
| ------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| agent.rs                 | 267     | Bugs     | Autonomous agent init/start/stop — resource leak on reinit                                                   |
| agi.rs                   | 1,440   | Review   | AGI orchestration commands                                                                                   |
| agi_checkpoint.rs        | 384     | Stubs    | Checkpoint restore always returns empty                                                                      |
| analytics.rs             | 683     | Partial  | Managed connection reuse fixed; some synthesized analytics values remain                                     |
| browser.rs               | 1,394   | Clean    | CDP browser automation                                                                                       |
| cache.rs                 | 624     | Working  | Cache analytics uses `last_used_at` correctly and codebase hit/miss counts are derived from percentage rates |
| code_editing.rs          | 741     | Security | Arbitrary file write + git command injection                                                                 |
| continuous_job_runner.rs | 3,250   | Review   | Autonomous job application runner                                                                            |
| email.rs                 | 1,451   | Clean    | IMAP/SMTP email + keyring storage                                                                            |
| file_ops.rs              | 1,691   | Clean    | Sandboxed file read/write/delete                                                                             |
| (28 more files)          | ~11,604 | Mixed    | Various command handlers                                                                                     |

**Key Finding:** `analytics.rs` now reuses the managed `AppDatabase` connection for analytics commands, closing the earlier second-writer/connection-leak defect. The remaining analytics debt is data quality: several top-level usage numbers are still synthetic desktop approximations rather than fully modeled multi-user analytics. The earlier `code_editing.rs` arbitrary-write / git-path injection issues are resolved in the live runtime through the shared canonical path-security guard.

### W2-A6: System Commands (G-Z) — COMPLETE

**Files audited:** 47 | **Total LOC:** ~36,606 | **Bugs:** 18 (2 CRITICAL, 5 HIGH, 8 MEDIUM, 3 LOW)
**Overall:** Architecturally mature in security-sensitive paths (Gmail OAuth, master password, privacy deletion). The previously audited usage-stats SQL typo and Lovable fake-data path are resolved in the live runtime. Remaining issues on this surface are concentrated around acknowledged stubs and the duplicate scheduler type hierarchy.

| File            | Lines   | Status                      | Purpose                                                                                      |
| --------------- | ------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| git.rs          | 1,782   | Functional — HTTPS auth bug | Git operations via git2 with LLM-assisted conflict resolution                                |
| llm.rs          | 888     | Working                     | Provider routing, BYOK, Ollama detection; usage stats alias bug fixed in live runtime        |
| voice.rs        | 2,218   | Functional                  | Full voice pipeline: STT, TTS, wake word, PTT, barge-in                                      |
| mcpb.rs         | 2,774   | Functional                  | MCP bridge with circuit-breaker, tool filtering                                              |
| gmail_oauth.rs  | 820     | Healthy                     | Gmail OAuth2 + PKCE; tokens encrypted; 5 tests                                               |
| scheduler.rs    | 1,393   | Duplicate types             | Proactive scheduler; incompatible with core::scheduler                                       |
| operations.rs   | 227     | Historical issue resolved   | Approve/reject now reuse the managed DB connection instead of opening a second SQLite writer |
| google_batch.rs | 424     | Stub                        | In-memory only, no real API, no persistence                                                  |
| knowledge.rs    | 138     | Stub                        | Keyword-only search, no embeddings                                                           |
| tray.rs         | 7       | Stub                        | `tray_set_unread_badge` — no-op placeholder                                                  |
| migration.rs    | 174     | Honest stub                 | Lovable migration now returns explicit not-implemented errors instead of fake data           |
| (36 more files) | ~24,362 | Mixed                       | Various command handlers                                                                     |

**Key Finding:** The earlier `llm.rs` usage-stats alias bug and the Lovable fake-data path are fixed in the live runtime. The earlier `operations.rs` double-writer lock hazard is also resolved. The remaining material issue on this surface is `scheduler.rs`, which still maintains a duplicate type hierarchy incompatible with `core::scheduler`.

### W2-A7: Data Layer — COMPLETE

**Files audited:** 42 | **Total LOC:** ~20,816 | **Bugs:** 10 (0 CRITICAL, 3 HIGH, 5 MEDIUM, 2 LOW)
**Overall:** Architecturally solid with well-guarded SQL, proper WAL/encryption, and a long migration chain. The earlier draft-manager crash/missing-table issues are resolved in the live runtime; the remaining notable data-layer issue in this slice is PostgreSQL pool bypass.

| File                            | Lines   | Status  | Purpose                                                                                |
| ------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------- |
| db/migrations.rs                | 4,985   | OK      | 57-version SQLite migration chain with savepoint transactions                          |
| db/repository.rs                | 1,011   | OK      | Parameterized CRUD: conversations, messages, settings                                  |
| database/postgres.rs            | 257     | HIGH    | `get_client()` creates new connection every call; pool bypassed                        |
| database/query_builder.rs       | 970     | MEDIUM  | Uses PostgreSQL `$N` syntax, not SQLite `?`                                            |
| database/pool.rs                | 357     | MEDIUM  | ConnectionPool is tracking-only stub — holds no real connections                       |
| state/draft_manager.rs          | 161     | Working | Draft manager now creates `message_drafts` on startup and uses `saved_at` consistently |
| supabase_sync.rs                | 298     | MEDIUM  | Reads `VITE_SUPABASE_URL` (Vite-only, never set in Rust)                               |
| analytics/metrics_aggregator.rs | 407     | MEDIUM  | Hardcodes `user_id: "default_user"`                                                    |
| (34 more files)                 | ~12,370 | OK      | Settings, cache, metrics, config                                                       |

**Key Finding:** The earlier `draft_manager.rs` truncated-column crash and missing-table failure are fixed in the live runtime. `database/pool.rs` still tracks metadata only (UUID + timestamps) rather than managing real pooled connections.

### W2-A8: Root + lib.rs + state.rs — COMPLETE

**Files audited:** 5 | **Total LOC:** ~2,491 | **Live issues:** repo-wide Tauri command registration drift + dead root `src/state.rs`
**Overall:** `lib.rs` is well-structured and the previously audited checkpoint / embedding / hooks / thinking / canvas / Gmail OAuth / git registration gaps have been fixed. The remaining live issue on this surface is broader registration drift: a current repo-wide scan still finds `387` `#[tauri::command]` functions under `sys/commands/` that are not present in `generate_handler!`.

| File            | Lines | Status    | Purpose                                                                  |
| --------------- | ----- | --------- | ------------------------------------------------------------------------ |
| main.rs         | 5     | Clean     | Entry point, delegates to `lib.rs::run()`                                |
| lib.rs          | 1,967 | Bugs      | Full Tauri setup: plugin init, state management, generate_handler!       |
| src/state.rs    | 146   | Dead Code | Orphaned duplicate of `data/state.rs` — never declared as module         |
| Cargo.toml      | 286   | Clean     | Feature flags correct                                                    |
| tauri.conf.json | 87    | Note      | `removeUnusedCommands: true` strips unreferenced commands at bundle time |

**Key Finding:** The historical unmanaged `AGICheckpointState` / embeddings state issue in `lib.rs` has been fixed, and the previously audited hooks / thinking / canvas / Gmail OAuth / git / GitHub / swarm / native messaging / background LLM registration gaps are now closed. The remaining material issue is broader registration drift: a repo-wide scan of `sys/commands/*.rs` still finds `387` `#[tauri::command]` functions absent from `generate_handler!`. Root `src/state.rs` is still a dead duplicate of `data/state.rs`.

### W2-A9: System Services — COMPLETE

**Files audited:** 54 | **Total LOC:** ~15,621 | **Bugs:** 11 (0 CRITICAL, 2 HIGH, 4 MEDIUM, 5 LOW)
**Overall:** The earlier billing webhook truncation/retry/schema issues are resolved in the live runtime, and the live permissions manager now restores persisted policies on startup while reusing a single audit connection.

| File                     | Lines  | Status  | Purpose                                                                                                                                |
| ------------------------ | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| billing/webhooks.rs      | 677    | Working | Webhook processing now uses `updated_at`, retries without fake signatures, and logs grace-period timing without a missing-column write |
| billing/stripe_client.rs | 1,021  | Working | Payment-method persistence now uses the canonical quoted `"type"` column helper across Stripe write paths                              |
| billing/mod.rs           | 773    | OK      | Billing state + command wrappers                                                                                                       |
| permissions/manager.rs   | 287    | Working | Loaded policies are written into `self.policies` during startup                                                                        |
| permissions/audit.rs     | 387    | Working | Permissions audit logger now owns one SQLite connection and reuses it across writes/reads                                              |
| error/translator.rs      | 1,414  | OK      | MCP/LLM error translation + friendly messages                                                                                          |
| diagnostics/ (9 files)   | ~2,250 | OK      | Health checks, DB integrity, dependency detection                                                                                      |
| telemetry/ (7 files)     | ~1,412 | OK      | Event buffering, metrics, correlation                                                                                                  |
| logging/mod.rs           | 257    | MEDIUM  | Regex compiled on every call                                                                                                           |
| (34 more files)          | ~7,143 | OK      | API client, filesystem, account, power                                                                                                 |

**Key Finding:** The earlier `billing/webhooks.rs` subscription lifecycle failures, `billing/stripe_client.rs` payment-method SQL bug, and the `permissions/manager.rs` startup-persistence bug are fixed in the live runtime. The remaining issues on this surface are secondary quality defects and non-critical utility inefficiencies.

### W2-A10: UI Helpers + Models — COMPLETE

**Files audited:** 23 | **Total LOC:** ~6,426 | **Bugs:** 12 (0 CRITICAL, 2 HIGH, 6 MEDIUM, 4 LOW)
**Overall:** Production-quality tray/window/hooks/events/overlay code. Onboarding uses simulated demos. models/ module is dead code.

| File                     | Lines | Status    | Purpose                                                              |
| ------------------------ | ----- | --------- | -------------------------------------------------------------------- |
| ui/tray.rs               | 150   | Working   | System tray menu (show/hide, pin, AOT, quit)                         |
| ui/hooks/ (4 files)      | 1,345 | Working   | Hook registry, YAML config, command execution with blocklist+timeout |
| ui/events/ (3 files)     | 750   | Working   | Frontend event emission, tool stream tracking                        |
| ui/overlay/ (4 files)    | 327   | Working   | Multi-monitor overlay rendering                                      |
| ui/onboarding/ (6 files) | 3,090 | Partial   | Tutorials, rewards, sample data — demos are all simulated stubs      |
| ui/window/mod.rs         | 547   | Working   | Window management — dock/undock, resize, floating companion          |
| models/ (2 files)        | 211   | Dead Code | Shadow of core/models — zero consumers anywhere in codebase          |

**Key Finding:** The `models/` module at crate root (211 lines) is entirely dead code — the actual consumer uses `core/models/advanced_features`. The `Hook.continue_on_error` field is defined/serialized but never checked during execution — all hooks always continue regardless of failures. Onboarding demos are all simulated (sleep + hardcoded results), with hardcoded statistics (unique_users=0, most_popular="inbox_manager").

## Wave 3: Rust Features + Automation (10 agents, 299 files, 162 bugs)

### W3-A1: Browser Automation — COMPLETE

**Files audited:** 8 | **Total LOC:** ~4,256 | **Bugs:** 17 (2 CRITICAL, 5 HIGH, 7 MEDIUM, 3 LOW)

**Overall:** Historical audit snapshot. Several issues from this pass have since been stabilized in the live desktop runtime, including the hardcoded CDP port drift, the fabricated browser websocket endpoint contract, and the fake `start_server()` success path. The remaining high-risk items in this section are still useful for cleanup prioritization.

| File                 | Lines | Status                  | Purpose                                                                                                                              |
| -------------------- | ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| advanced.rs          | 526   | Partially broken        | Advanced CDP ops: async JS, form fill, drag/drop, cookies, perf metrics                                                              |
| cdp_client.rs        | 541   | Mostly functional       | Core CDP WebSocket client: connect, evaluate, click, type, screenshot                                                                |
| dom_operations.rs    | 343   | Heavily stubbed         | DOM interaction wrapper; `set_attribute`, `get_element_info`, `blur` are hollow                                                      |
| extension_bridge.rs  | 970   | Functional              | Realtime WebSocket bridge to Chrome extension; auth retry logic is solid                                                             |
| mod.rs               | 55    | Working                 | Module wiring + BrowserState; live runtime now resolves per-tab CDP endpoints through shared endpoint helpers                        |
| playwright_bridge.rs | 749   | Partial                 | Browser lifecycle + direct CDP commands; live launch path now waits for a real DevTools endpoint and `start_server()` fails honestly |
| semantic.rs          | 679   | Functional (logic bugs) | NL-to-selector translation; CSS :contains() invalid in browsers                                                                      |
| tab_manager.rs       | 393   | Partially stubbed       | Tab registry; navigate/go_back/go_forward/reload are simulations, screenshot writes placeholder                                      |

**Key Finding:** `advanced.rs` line 140 has a typo `rect.heigh` (missing `t`) that always returns `undefined` for element height in `get_element_state()`, causing every visibility check that compares `rect.height > 0` to silently pass with incorrect data. The older `PlaywrightBridge.start_server()` echo-stub issue is resolved in the live runtime, but the remaining JS-injection sites across `cdp_client.rs` and `advanced.rs` still matter because selectors are not uniformly escaped across every code path.

| #   | Severity | File                                  | Issue                                                                                                                                                                                                                                                                                                                       | Fix Effort                              |
| --- | -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| 160 | CRITICAL | advanced.rs:140                       | Typo `rect.heigh` instead of `rect.height` in injected JS — element height always `undefined`, corrupting all visibility/bounds checks                                                                                                                                                                                      | 5 min                                   |
| 161 | RESOLVED | playwright_bridge.rs:141-150          | Historical issue: `start_server()` used to report fake success via an echo stub. The live runtime now reuses a reachable CDP endpoint or returns a clear error instructing callers to use `launch_browser()`                                                                                                                | Fixed in live runtime                   |
| 162 | HIGH     | cdp_client.rs:166-191                 | `send_command()` holds `self.connection` Mutex across the entire synchronous `recv()` loop using `std::sync::mpsc::Receiver` — any concurrent caller blocks indefinitely; long-running responses starve all other CDP operations                                                                                            | 2 hr                                    |
| 163 | HIGH     | advanced.rs:366-378                   | `upload_file()` passes a raw JS expression string as `objectId` to `DOM.setFileInputFiles` — the `objectId` field requires a Remote Object ID from `Runtime.evaluate`, not a raw script; this API call will always fail with a CDP error                                                                                    | 2 hr                                    |
| 164 | HIGH     | cdp_client.rs & advanced.rs (9 sites) | JS injection: selectors are escaped only for single quotes (`replace('\'', "\\'")`); backticks, `\`, `\n`, `\r` allow breaking out of the injected JS template in `click_element`, `type_into_element`, `get_text`, `get_attribute`, `wait_for_selector`, `element_exists`, `select_option`, `set_checked`, `focus_element` | 3 hr                                    |
| 165 | RESOLVED | playwright_bridge.rs:319-336          | Historical issue: the audit captured an older implementation. The live runtime now returns a real error from `connect_to_browser()` on connection failure                                                                                                                                                                   | Fixed before current stabilization pass |
| 166 | HIGH     | dom_operations.rs:180-213             | `set_attribute()` and `get_element_info()` are full stubs — `set_attribute` does nothing (ignores `_value`), `get_element_info` returns hardcoded fake data (`"div"`, `"Element text"`, x:100/y:200/w:300/h:50); any code path relying on these returns garbage                                                             | 2 hr                                    |
| 167 | MEDIUM   | advanced.rs:287-313                   | `wait_for_navigation()` races: it attaches a `window.load` event listener after `document.readyState` check — if page reaches `complete` between the check and the listener, the promise never resolves and the `timeout_ms` outer timeout fires                                                                            | 1 hr                                    |
| 168 | MEDIUM   | semantic.rs:139,143                   | CSS `:contains()` pseudo-class is not a standard CSS3 selector and is unsupported in modern browsers (Chrome, Firefox, Safari); generated selectors like `button:contains('login')` will throw a `SyntaxError` at querySelector                                                                                             | 1 hr                                    |
| 169 | MEDIUM   | semantic.rs:34-70                     | `to_selector_script()` inlines user-controlled values (`id`, `label`, `role`, `name`, `xpath`) directly into JS strings with no escaping — a value containing `"` breaks the generated JS expression                                                                                                                        | 1 hr                                    |
| 170 | MEDIUM   | tab_manager.rs:293-321                | `screenshot()` writes `b"Screenshot placeholder"` to disk — returns a path that callers treat as a real screenshot; any consumer (e.g., vision analysis) will receive corrupt PNG data silently                                                                                                                             | 2 hr                                    |
| 171 | MEDIUM   | tab_manager.rs:216-238                | `go_back()` and `go_forward()` are no-ops — they verify the tab exists and log, but perform no actual browser navigation; silently succeed                                                                                                                                                                                  | 2 hr                                    |
| 172 | MEDIUM   | playwright_bridge.rs:246-316          | `build_browser_command()` accepts arbitrary `options.args` (user-provided) and appends them directly to the process `Command` with no sanitization — allows injection of arbitrary browser flags (e.g., `--load-extension`, `--disable-web-security`)                                                                       | 1 hr                                    |
| 173 | MEDIUM   | dom_operations.rs:257-262             | `blur()` is a stub — logs "Element blurred" but sends no CDP command; focus state on the page is never changed                                                                                                                                                                                                              | 30 min                                  |
| 174 | RESOLVED | mod.rs:46                             | Historical issue: BrowserState now resolves per-tab CDP websocket URLs through the shared `CdpEndpoint` contract instead of hardcoding `127.0.0.1:9222`                                                                                                                                                                     | Fixed in live runtime                   |
| 175 | LOW      | advanced.rs:381-396                   | `call_function()` uses `window['function_name']` — only works for window-level globals; cannot call module-scoped or arbitrary JS functions; misleading API name                                                                                                                                                            | 30 min                                  |
| 176 | LOW      | extension_bridge.rs:563               | `CaptureScreenshot` ignores the `quality` field (`quality: _`) when building the native payload — screenshot quality setting is always silently dropped                                                                                                                                                                     | 15 min                                  | ### W3-A2: Computer Use — COMPLETE |

**Files audited:** 8 (mod.rs, observe_plan_act.rs, safety.rs, session.rs, types.rs, visual_reasoner.rs, window_manager.rs, zoom.rs) | **Total LOC:** ~6,337 (plus 796 tests.rs) | **Bugs:** 12 (0 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW)

**Overall:** A well-structured, security-conscious Computer Use module with multiple high-impact stubs and logic defects that prevent real-world autonomous operation.

| File                | Lines | Status       | Purpose                                                                           |
| ------------------- | ----- | ------------ | --------------------------------------------------------------------------------- |
| mod.rs              | 68    | Clean        | Public re-exports; well-organized barrel file                                     |
| types.rs            | 687   | Clean        | Core types (actions, coordinates, elements, tasks); solid with inline tests       |
| safety.rs           | 758   | Mostly solid | Multi-layer safety gate; one logic issue in window-focus path                     |
| session.rs          | 650   | Mostly solid | Session lifecycle + snapshot management; one API design bug                       |
| observe_plan_act.rs | 1138  | Defects      | Core OPA loop; 5 bugs including a blocked-action logic hole and stub Zoom handler |
| visual_reasoner.rs  | 715   | Stub defect  | Screen analysis engine; OCR path is a no-op stub; change-detection math inflated  |
| window_manager.rs   | 909   | Mostly solid | Cross-platform window control; macOS activate is a silent no-op                   |
| zoom.rs             | 616   | Clean        | Zoom/scale region capture; well-validated with good tests                         |

**Key Finding:** The Zoom action in the OPA loop captures and scales a screen region but silently discards the result (`let _result = ...`), meaning the LLM never receives the zoomed image for re-analysis — the entire zoom→plan feedback cycle is broken. The macOS `activate_window_internal` is a complete no-op stub (returns `Ok(())` immediately), so window focusing on macOS always silently claims success. OCR text extraction in `parse_analysis_response` always returns an empty `text_regions` vec with a comment "OCR would populate this," disabling half the screen-state input the safety scanner relies on.

| #   | Severity | File                | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fix Effort |
| --- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| 170 | HIGH     | observe_plan_act.rs | **Zoom result silently discarded** — `let _result = super::zoom::zoom_region(&zoom_action)?` captures and scales the region but the zoomed image is never fed back to the vision LLM or observation cache. The Zoom action as implemented does nothing useful for planning.                                                                                                                                                                       | Medium     |
| 171 | HIGH     | window_manager.rs   | **macOS `activate_window_internal` is a no-op** — the macOS `#[cfg(target_os = "macos")]` implementation returns `Ok(())` immediately with comment "this is handled by activate_by_title using AppleScript," but `activate_by_title` calls `activate_window_internal`, not AppleScript. Window activation always silently succeeds on macOS without actually focusing any window.                                                                 | Medium     |
| 172 | HIGH     | visual_reasoner.rs  | **OCR stub: `text_regions` always empty** — `parse_analysis_response` hardcodes `text_regions: Vec::new()` with comment "// OCR would populate this." `PromptInjectionDetector::scan_screen` iterates `text_regions` for injection checks, meaning OCR-only injection attacks (no element labels or screen description) are never detected.                                                                                                       | Low-Medium |
| 173 | HIGH     | observe_plan_act.rs | **Blocked-action logic hole: `continue` after no-reason block** — Lines 303–314: when `decision.allowed` is false the code enters the block, but only returns `complete_task` if `decision.reason` is `Some`. If `reason` is `None` (which `SafetyDecision::block` never produces in practice but is structurally possible), execution falls through to `continue`, silently skipping the blocked action and continuing the loop without logging. | Low        |
| 174 | MEDIUM   | observe_plan_act.rs | **Dead initial safety check block** — Lines 196–199: `if !self.safety_layer.config().detect_prompt_injection { // Task safety is already checked in safety layer }` is an empty block that does nothing. The comment is misleading (task description is never scanned for injection before the loop starts).                                                                                                                                      | Low        |
| 175 | MEDIUM   | observe_plan_act.rs | **`FocusWindow` result ignored in execute_action** — Line 941: `self.window_coordinator.activate_by_title(title).await;` discards the `WindowActivation` result. A failed focus is silently swallowed; subsequent actions may target the wrong window.                                                                                                                                                                                            | Low        |
| 176 | MEDIUM   | observe_plan_act.rs | **Busy-wait polling for confirmation pause** — Lines 322–324: `while session.is_paused() { sleep(100ms).await; }` spin-polls with no maximum wait time. If the user never resumes (e.g., dismisses the UI), this loop runs until the outer task timeout (up to 5 minutes), holding the task executor thread.                                                                                                                                      | Medium     |
| 177 | MEDIUM   | visual_reasoner.rs  | **Change-detection math over-counts changed pixels** — Line 353: `changed_pixels += 16` for every changed sampled pixel (step-by-4 grid), but `total_pixels` is the full pixel count. For a mostly-stable screen with 1 changed pixel in the sampled grid, `change_percent` would read as `16 / total_pixels * 100`, inflating the change estimate by up to 16×.                                                                                  | Low        |
| 178 | MEDIUM   | session.rs          | **`get_session` returns the whole locked map, not a session** — `SessionManager::get_session` returns `Option<MutexGuard<HashMap<...>>>` holding the entire lock rather than a reference to the specific session. Callers must know to index by session_id into the guard; the API is misleading and holds the lock for the full caller duration.                                                                                                 | Medium     |
| 179 | MEDIUM   | window_manager.rs   | **macOS `list_windows` assumes `i == 0` is focused window** — Line 392: `is_focused: i == 0` assigns focus to whichever window happens to be first in AppleScript's output order, which is not guaranteed to be the frontmost window. `WindowEnumerator::get_focused()` will return wrong results on macOS.                                                                                                                                       | Low        |
| 180 | LOW      | window_manager.rs   | **Windows fallback launch via `cmd /c start`** — Lines 644–648: if `Command::new(name).spawn()` fails, a second attempt via `cmd /c start "" name` is made. `validate_app_name` already ran, but `cmd /c start` interprets the name differently (shell context) and may allow names that bypass the validator in edge cases with embedded quotes that weren't filtered.                                                                           | Low        |
| 181 | LOW      | observe_plan_act.rs | **`estimated_percent` can silently saturate at 255** — Line 375–376: `((iteration / max_iterations) * 100.0) as u8` — if `iteration` exceeds `max_iterations` (which the loop checks `>` not `>=`), the float can exceed 100.0; casting to `u8` silently wraps at 256 (e.g., 256 → 0, 300 → 44).                                                                                                                                                  | Low        |
| 182 | LOW      | zoom.rs / types.rs  | **`save_path` in `Screenshot` and `ZoomAction` lacks path traversal validation** — Both accept arbitrary user-supplied paths and call `.save(path)` directly. A crafted path like `../../etc/cron.d/malicious` could write files outside the intended screenshot directory.                                                                                                                                                                       | Medium     | ### W3-A3: Automation (Input/Screen/Platform) — COMPLETE |

**Files audited:** 33 (including test files discovered; 29 non-test files in scope) | **Total LOC:** ~7,872 (non-test in scope) | **Bugs:** 12 (0 CRITICAL, 4 HIGH, 6 MEDIUM, 2 LOW)

**Overall:** The automation layer is structurally sound with good unsafe-code discipline and lock serialization, but has a combination of incomplete platform stubs, a silent modifier-key mapping bug that maps macOS Cmd to Ctrl, hardcoded screen-coordinate safety guards that will mis-fire on any non-1080p display, a SAFEARRAY memory leak on the error path, and codegen injection vulnerabilities from unescaped user-supplied strings.

| File                  | Lines | Status | Purpose                                                                                                                       |
| --------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| input/clipboard.rs    | 90    | OK     | Arboard-based clipboard with lazy init and OS lock                                                                            |
| input/enigo_lock.rs   | 6     | OK     | Thin alias delegating to os_lock                                                                                              |
| input/keyboard.rs     | 182   | BUG    | Keyboard simulator; Cmd→Ctrl mapping bug (line 129)                                                                           |
| input/mod.rs          | 12    | OK     | Re-exports for input subsystem                                                                                                |
| input/mouse.rs        | 321   | OK     | Mouse simulator with smooth move/drag; Linux position returns (0,0)                                                           |
| screen/capture.rs     | 564   | BUG    | Multi-screen capture; Windows path opens HWND handle without CloseHandle                                                      |
| screen/dxgi.rs        | 39    | OK     | ScreenInfo / list_displays wrapper                                                                                            |
| screen/mod.rs         | 32    | OK     | Feature-gated OCR stub for non-ocr builds                                                                                     |
| screen/ocr.rs         | 24    | OK     | Tesseract OCR via spawn_blocking                                                                                              |
| screen/xcap_lock.rs   | 6     | OK     | Thin alias delegating to os_lock                                                                                              |
| mac/inspector_impl.rs | 108   | BUG    | `find_elements` returns empty vec (stub), `get_element_tree` returns `(None, [])`                                             |
| mac/mod.rs            | 2     | OK     | Module declarations                                                                                                           |
| mac/service.rs        | 777   | BUG    | AXElement Drop race; cache never evicted; CFRelease double-free risk on registered elements                                   |
| uia/actions.rs        | 230   | BUG    | `scroll_to_element` blind scroll (ScrollAmount_LargeIncrement) ignores target position                                        |
| uia/element_tree.rs   | 250   | BUG    | `find_window` uses exact `TreeScope_Children` name match; partial names never found                                           |
| uia/inspector_impl.rs | 279   | OK     | Solid UIA inspector; delegates cleanly                                                                                        |
| uia/mod.rs            | 248   | BUG    | SAFEARRAY not destroyed on `SafeArrayAccessData` error path (memory leak)                                                     |
| uia/patterns.rs       | 129   | OK     | Pattern capability detection via COM                                                                                          |
| uia/wait.rs           | 209   | BUG    | `wait_for_element_enabled` calls `get_element()` inside loop but cache TTL is 30s — element always retrieved from stale cache |
| executor.rs           | 532   | BUG    | `execute_hotkey` does not map alpha/numeric keys (returns Err for "ctrl+a")                                                   |
| inspector.rs          | 28    | OK     | UIInspector trait definition                                                                                                  |
| recorder.rs           | 322   | OK     | Global RECORDER singleton; debounce 100ms; action deduplication                                                               |
| safety.rs             | 276   | BUG    | `is_click_location_safe` uses hardcoded pixel coordinates (y≤15, x≥1800, y≥1040) that break on 4K/non-1080p                   |
| safety_patterns.rs    | 565   | BUG    | Sensitive-keyword regex matches "token" — blocks legitimate text like "authentication token"                                  |
| screen_watcher.rs     | 359   | OK     | Periodic capture loop with atomic state; single-subscriber channel design                                                     |
| types.rs              | 217   | OK     | Shared data model types                                                                                                       |
| vision_planner.rs     | 292   | OK     | Vision LLM planning with 60s timeout and 1MB JSON size limit                                                                  |
| codegen.rs            | 350   | BUG    | Python/JS codegen injects user text into generated code without escaping newlines/format chars                                |
| os_lock.rs            | 11    | OK     | Global OS automation mutex via OnceLock                                                                                       |
| mod.rs                | 247   | OK     | Platform dispatch, AutomationService singleton                                                                                |

**Key Finding:** The most impactful issues are in the platform-specific layers: `mac/inspector_impl.rs` returns empty results for `find_elements` and `get_element_tree` (the entire macOS element search subsystem is stubbed), and `safety.rs` uses hardcoded 1080p coordinates that will incorrectly block or allow clicks on any display with a different resolution. The `keyboard.rs` modifier-key bug silently maps the macOS `cmd`/`command` key to `Ctrl` (line 129) rather than `Key::Meta`, causing incorrect hotkeys across the entire macOS platform.

| #   | Severity | File                                | Issue                                                                                                                                                                                                                                                                                                                                                                          | Fix Effort |
| --- | -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------- |
| 180 | HIGH     | input/keyboard.rs:129               | `modifier_key()` maps `"cmd"\|"command"\|"meta"\|"super"\|"windows"` → `Key::Control` instead of `Key::Meta`. macOS Cmd hotkeys silently send Ctrl instead. Every Cmd+key shortcut on macOS is broken.                                                                                                                                                                         | 1h         |
| 181 | HIGH     | safety.rs:58-74                     | `is_click_location_safe()` uses hardcoded constants `x<10&&y<10`, `y<=15&&x>=1800`, `y>=1040&&(x<=120\|\|x>=1800)` tied to 1080p resolution. On 4K or ultrawide displays these guards either block valid center-screen clicks or fail to protect corners. Should be relative to actual screen dimensions.                                                                      | 2h         |
| 182 | HIGH     | mac/inspector_impl.rs:64-70,102-107 | `find_elements()` always returns `Ok(vec![])` and `get_element_tree()` always returns `Ok((None, vec![]))`. The entire macOS element search capability is a stub; all selector-based automation on macOS silently does nothing.                                                                                                                                                | 4h         |
| 183 | HIGH     | uia/mod.rs:232-243                  | In `safe_array_to_runtime_id`, if `SafeArrayAccessData` succeeds but a subsequent call before `SafeArrayUnaccessData` returns an error, control exits via `?` operator leaving the SAFEARRAY locked and never calling `SafeArrayDestroy` — memory leak on every error path after access.                                                                                       | 2h         |
| 184 | MEDIUM   | mac/service.rs:100-112              | `AXElement::Drop` calls `CFRelease` only when `Arc::strong_count == 1`, but between the count check and the actual release, another thread can clone the Arc (TOCTOU). Under concurrent usage the underlying CFTypeRef could be released while still referenced. Should use `Arc::try_unwrap` pattern instead.                                                                 | 3h         |
| 185 | MEDIUM   | mac/service.rs:144-153              | `register_element()` manually calls `CFRetain` then passes the same pointer to `AXElement::new()`. When this `AXElement` is later dropped, its `Drop` impl calls `CFRelease`, which is correct, but if the cache grows unboundedly (no TTL eviction on Mac unlike UIA's 30s TTL), CF objects accumulate in the cache indefinitely, causing memory growth during long sessions. | 2h         |
| 186 | MEDIUM   | uia/wait.rs:99-119                  | `wait_for_element_enabled()` calls `self.get_element(element_id)?` inside the polling loop. `get_element()` cleans expired cache entries and fetches from cache. If the element expires from cache (30s TTL) during the wait loop, the function returns `anyhow!("Unknown element id")` rather than returning a proper timeout error, confusing callers.                       | 1h         |
| 187 | MEDIUM   | uia/element_tree.rs:119-143         | `find_window()` uses `UIA_NamePropertyId` with exact match semantics — the Windows UIA `CreatePropertyCondition` for Name uses substring matching only when `PropertyConditionFlags_MatchSubstring` is set (not set here). Windows with partial titles silently return `None`.                                                                                                 | 2h         |
| 188 | MEDIUM   | executor.rs:387-428                 | `execute_hotkey()` only handles 8 special keys (`Enter`, `Tab`, `Space`, etc.) for the final key component; alphanumeric keys (e.g., "ctrl+a", "ctrl+c") return `Err("Unsupported key")`. Ctrl+C, Ctrl+A, Ctrl+Z all fail. The `KeyboardSimulator` supports `Key::Unicode(char)` which should be used as fallback.                                                             | 2h         |
| 189 | MEDIUM   | codegen.rs:79-84,206-213            | Python and JavaScript code generators escape only `"` characters in user-supplied text. Multi-line strings, backslashes, null bytes, and Python format specifiers (`{`, `}`) in automation `value` fields produce syntactically broken or potentially injectable generated code.                                                                                               | 3h         |
| 190 | LOW      | safety_patterns.rs:37               | Sensitive-keyword pattern `(?i)password\|passwd\|credential\|api[_-]?key\|secret\|token` blocks all text containing "token" — including UI text like "authentication token", "JWT token", "next token in sequence", making the safety filter unusable for many legitimate automation scenarios. Pattern should be anchored or require surrounding context.                     | 2h         |
| 191 | LOW      | uia/actions.rs:132-179              | `scroll_to_element()` performs a single `ScrollAmount_LargeIncrement` scroll on the nearest scrollable parent and immediately returns `Ok(())`. It does not verify the element became visible. On large lists the element may still be offscreen after one scroll, giving callers a false success.                                                                             | 3h         | ### W3-A4: Terminal + Speech — COMPLETE |

**Files audited:** 15 | **Total LOC:** ~4,190 | **Bugs:** 14 (0 CRITICAL, 4 HIGH, 6 MEDIUM, 4 LOW)
**Overall:** Terminal is solid and mostly production-ready; speech modules are functional with feature-gating but carry several stub/incomplete paths and security/correctness concerns.

| File                        | Lines | Status | Purpose                                                  |
| --------------------------- | ----- | ------ | -------------------------------------------------------- |
| terminal/ai_assistant.rs    | 368   | WARN   | LLM-powered command suggest, error explain, smart commit |
| terminal/mod.rs             | 13    | OK     | Module barrel re-exports                                 |
| terminal/pty.rs             | 292   | WARN   | PTY session create/read/write/resize/execute             |
| terminal/session_manager.rs | 477   | WARN   | Session lifecycle, I/O streaming, DB history logging     |
| terminal/shells.rs          | 177   | OK     | Shell detection + default shell logic                    |
| speech/barge_in.rs          | 575   | OK     | Barge-in detection via VAD during TTS playback           |
| speech/deepgram.rs          | 879   | WARN   | WebSocket streaming STT via Deepgram Nova-2/3            |
| speech/local_stt.rs         | 604   | WARN   | Local Whisper transcription + model download             |
| speech/local_tts.rs         | 833   | WARN   | Local Piper TTS + binary/voice download                  |
| speech/mod.rs               | 36    | OK     | Module barrel re-exports                                 |
| speech/ptt.rs               | 251   | WARN   | Push-to-talk recording state machine                     |
| speech/recognition.rs       | 608   | WARN   | Multi-provider STT with ring-buffer result cap           |
| speech/tts.rs               | 687   | WARN   | TTS trait + ElevenLabs/OpenAI/System impls, TtsPlayer    |
| speech/vad.rs               | 512   | OK     | WebRTC VAD wrapper with dedicated worker thread          |
| speech/wake.rs              | 648   | WARN   | Wake-word detection via VAD + Levenshtein matching       |

**Key Finding:** The most critical issues are: (1) `ai_assistant.rs` hardcodes `OS: Windows` in all LLM prompts regardless of actual platform, generating wrong command suggestions on macOS/Linux. (2) `session_manager.rs` logs raw shell commands (including potential passwords and secrets) to a SQLite database with no sanitization or redaction. (3) `wake.rs` detection loop is a stub — it emits `"speech_detected"` with `confidence: 0.0` instead of actually matching wake phrases against STT output, so wake-word matching never fires at runtime.

| #   | Severity | File                           | Issue                                                                                                                                                                                                                                                                   | Fix Effort                                                                         |
| --- | -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| 190 | HIGH     | terminal/ai_assistant.rs       | All LLM prompts hardcode `OS: Windows` regardless of current platform — macOS/Linux users get Windows-specific command suggestions (e.g., PowerShell syntax on bash sessions)                                                                                           | Small: replace with `std::env::consts::OS` at runtime                              |
| 191 | HIGH     | terminal/session_manager.rs    | `log_command_to_db` stores raw input verbatim — passwords typed as `export SECRET=abc123` or `mysql -p mypassword` persist in plaintext in SQLite history with no filtering                                                                                             | Medium: add secret-pattern scrubber before DB insert                               |
| 192 | HIGH     | speech/wake.rs:394-398         | Wake-word detection is an incomplete stub — after speech is detected the code emits a placeholder event with `phrase_detected: "speech_detected"` and `confidence: 0.0` without calling STT or `matches_wake_phrase()`. The entire purpose of the module is unfulfilled | Large: wire in `recognition.rs` STT call then `matches_wake_phrase()`              |
| 193 | HIGH     | speech/recognition.rs:217-221  | `LocalWhisper` provider returns a hardcoded `Err` when `start()` is called, making `recognition.rs` + `local_stt.rs` integration entirely non-functional at runtime                                                                                                     | Medium: wire `WhisperLocal::transcribe` into the provider                          |
| 194 | MEDIUM   | terminal/pty.rs:86-93          | `write()` calls `master.take_writer()` on every write — `take_writer()` is documented to consume the writer; repeated calls on some PTY backends return an error or new independent writer, potentially dropping interleaved writes or leaking handles                  | Small: cache the writer at construction time as an `Option<Box<dyn Write + Send>>` |
| 195 | MEDIUM   | terminal/pty.rs:138-194        | `execute_command()` uses a busy-poll sleep loop with a heuristic prompt-character check (`$`, `#`, `>`). Fish and PowerShell prompts don't match this pattern reliably, causing the method to always time out at 2 seconds for those shells                             | Medium: use a unique sentinel marker injected after each command                   |
| 196 | MEDIUM   | speech/deepgram.rs:549-551     | Duration accounting divides bytes by `sample_rate * 2.0` (assumes 1 channel) even though `DeepgramConfig.channels` may be > 1, silently undercounting audio duration stats                                                                                              | Small: multiply divisor by `channels as f64`                                       |
| 197 | MEDIUM   | speech/local_tts.rs:700-750    | Piper binary extraction from `.tar.gz`/`.zip` archive uses a sync blocking loop (`archive.entries()`, `ZipArchive::by_index`) inside an async function, blocking the Tokio thread pool for potentially several seconds on large archives                                | Medium: spawn extraction on `tokio::task::spawn_blocking`                          |
| 198 | MEDIUM   | speech/local_stt.rs:501-524    | `resample_audio` uses linear interpolation — correct for simple downsampling but causes audible aliasing when upsampling (e.g., 8kHz → 16kHz for telephone audio). Whisper accuracy degrades measurably on aliased input                                                | Medium: add a low-pass pre-filter or use the `rubato` crate                        |
| 199 | MEDIUM   | speech/tts.rs:382-384          | `SystemTts::stop_playback` fires a `pkill -9 say` shell command to kill any `say` process system-wide — if multiple TTS instances exist (possible in agent pipelines), it kills them all indiscriminately                                                               | Small: use the stored `Child.kill()` only, remove `pkill`                          |
| 200 | LOW      | terminal/ai_assistant.rs:54-62 | Code-fence stripping in `suggest_command` is order-dependent and fragile: `trim_start_matches("```")` then `trim_start_matches("bash")` fails on ` ```\nbash\n ``` ` (newline after backticks) and doesn't handle ` ```python ` or ` ```shell `                         | Small: use a proper regex or find+trim inner content                               |
| 201 | LOW      | speech/deepgram.rs:556-562     | The `tokio::select!` polling arm uses a 100ms `sleep` timer solely to check `is_streaming`. This introduces up to 100ms lag before stop is acknowledged, and the pattern burns a timer on every 100ms tick even when idle                                               | Small: use a `watch` channel for cancellation signaling                            |
| 202 | LOW      | speech/ptt.rs                  | `PushToTalk::audio_buffer` is a `std::sync::Mutex<Vec<u8>>` with no size cap — a misbehaving caller running `add_audio` continuously will grow this buffer unboundedly until OOM                                                                                        | Small: add a configurable max buffer size (e.g., 10MB)                             |
| 203 | LOW      | speech/local_tts.rs:187-202    | `PiperVoiceDefinitions::download_url` URL construction splits on `'/'` after replacing `'-'` with `'/'`, so `en_US-lessac-medium` becomes `en_US/lessac/medium` and `split('/').next()` returns only `"en_US"`, generating an incorrect HuggingFace path that will 404  | Small: use the known Piper voice path convention directly                          | ### W3-A5: Document + Canvas — COMPLETE |

**Files audited:** 14 | **Total LOC:** ~4,492 | **Bugs:** 14 (0 CRITICAL, 3 HIGH, 7 MEDIUM, 4 LOW)

**Overall:** The document subsystem has several large stubs where edit operations silently no-op (ExcelEditor ignores the source file entirely; WordEditor drops ReplaceText/DeleteParagraph/InsertTableRow/DeleteTableRow), and both editor files use `anyhow::Result` instead of the project's `crate::sys::error::Result` which breaks error type consistency; the canvas subsystem is structurally sound but `ShowNotification` is a no-op stub and `update_element` performs a redundant second read-lock after already capturing the post-update clone.

| File                       | Lines | Status  | Purpose                                                                                                                                                                                                                                                      |
| -------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `document/mod.rs`          | 302   | Healthy | DocumentManager + file-type detection + magic-number validation                                                                                                                                                                                              |
| `document/create_excel.rs` | 329   | Healthy | Excel workbook creation via rust_xlsxwriter                                                                                                                                                                                                                  |
| `document/create_pdf.rs`   | 440   | Healthy | PDF creation via printpdf with word-wrap and pagination                                                                                                                                                                                                      |
| `document/create_word.rs`  | 289   | Medium  | DOCX creation — `_config` param (metadata) silently ignored                                                                                                                                                                                                  |
| `document/edit_excel.rs`   | 190   | HIGH    | ExcelEditor ignores source file; `DeleteRow/DeleteColumn/InsertColumn/UpdateStyle` silently no-op                                                                                                                                                            |
| `document/edit_pdf.rs`     | 502   | Medium  | PDF editing with lopdf — uses `anyhow::Result` not project error type; escape_pdf_string misses `\n`/`\r`                                                                                                                                                    |
| `document/edit_word.rs`    | 134   | HIGH    | `ReplaceText/DeleteParagraph/InsertTableRow/DeleteTableRow` silently no-op; uses `anyhow::Result`; reads input file then discards it                                                                                                                         |
| `document/excel.rs`        | 249   | Low     | Excel text extraction — `(f.fract() - 0.0).abs() < f64::EPSILON` is a convoluted way to write `f.fract() == 0.0`                                                                                                                                             |
| `document/pdf.rs`          | 266   | Medium  | PdfHandler — cache hit checks `modified_at` as string-parsed u64, fragile; `clear_cache` is `#[allow(dead_code)]`                                                                                                                                            |
| `document/word.rs`         | 199   | HIGH    | `search()` is a permanent stub returning empty vec; `EXT_PROPS_NS` namespace is wrong for `Pages`/`Words` — those live in the default `http://schemas.openxmlformats.org/officeDocument/2006/extended-properties` namespace, not the relationships namespace |
| `canvas/mod.rs`            | 51    | Healthy | Re-exports all canvas submodules                                                                                                                                                                                                                             |
| `canvas/a2ui.rs`           | 753   | Medium  | `ShowNotification` is a no-op stub; no canvas size/element count limits                                                                                                                                                                                      |
| `canvas/elements.rs`       | 375   | Healthy | All element types, styles, enums — well-formed                                                                                                                                                                                                               |
| `canvas/renderer.rs`       | 413   | Low     | `update_element` performs a redundant second read-lock to return the element after already capturing a pre-return clone                                                                                                                                      |

**Key Finding:** The three edit files (`edit_excel.rs`, `edit_word.rs`, `edit_pdf.rs`) are the most concerning — `ExcelEditor::edit_spreadsheet` accepts a `_file_path` but creates a brand-new blank workbook and never loads the source, so all "edits" are actually create-from-scratch operations that silently discard the existing file's data. Similarly, `WordEditor::edit_document` reads the source file into a buffer then never uses that buffer, constructing a new empty `Docx`. The `word.rs` `EXT_PROPS_NS` namespace mismatch causes `page_count` and `word_count` metadata to always be `None` for DOCX files even when the data is present in `app.xml`.

| #   | Severity | File                                                   | Issue                                                                                                                                                                                                                                                                                              | Fix Effort                                                                                                    |
| --- | -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 200 | HIGH     | `edit_excel.rs:61`                                     | `_file_path` is unused — `edit_spreadsheet` creates a new blank workbook instead of loading and modifying the source file; all edits are create-not-edit operations                                                                                                                                | Large — requires switching to a read/modify/write library (calamine for read, xlsxwriter for write)           |
| 201 | HIGH     | `edit_word.rs:58-62`                                   | Source file is opened and read into `buffer` but `buffer` is never used; a blank `Docx::new()` is created instead; `ReplaceText`, `DeleteParagraph`, `InsertTableRow`, `DeleteTableRow` hit the `_ => {}` wildcard and silently no-op                                                              | Large — docx-rs has no in-place edit API; needs a proper parse-edit approach                                  |
| 202 | HIGH     | `word.rs:183,196`                                      | `EXT_PROPS_NS` is set to the relationships namespace URL but `app.xml` uses the base namespace `http://schemas.openxmlformats.org/officeDocument/2006/extended-properties`; `Pages` and `Words` never match, so `page_count` and `word_count` are always `None`                                    | Small — fix the namespace constant and add a `CORE_PROPS_CREATED_NS` for `dcterms:created`/`dcterms:modified` |
| 203 | MEDIUM   | `edit_excel.rs:82`                                     | `_workbook` parameter in `apply_edit` is unused; `DeleteRow`, `DeleteColumn`, `InsertColumn`, `UpdateStyle` all fall through to `_ => {}` no-op silently                                                                                                                                           | Medium — implement the missing match arms once source-file loading is fixed                                   |
| 204 | MEDIUM   | `edit_word.rs:1` / `edit_excel.rs:1` / `edit_pdf.rs:1` | All three editor files use `anyhow::Result` instead of `crate::sys::error::Result` — inconsistent with all other files in the module and breaks type unification at call sites                                                                                                                     | Small — change imports and convert `anyhow::anyhow!` to `Error::Generic`                                      |
| 205 | MEDIUM   | `edit_pdf.rs:88-92`                                    | `escape_pdf_string` does not escape newlines (`\n`, `\r`) or non-ASCII bytes; inserting text with embedded newlines or multi-byte UTF-8 characters generates malformed PDF content streams                                                                                                         | Small — add newline/CR escaping and validate ASCII-only or use proper encoding                                |
| 206 | MEDIUM   | `create_word.rs:53`                                    | `_config: WordDocumentConfig` (title, author, subject, keywords) is accepted but silently discarded — DOCX metadata properties are never written to the output file                                                                                                                                | Medium — use `docx_rs` custom properties or core-properties XML to write the metadata                         |
| 207 | MEDIUM   | `word.rs:196-198`                                      | `WordHandler::search` is a permanent stub (`Ok(vec![])`) — search over Word documents always returns no results with no warning or error                                                                                                                                                           | Medium — extract text first then apply the same line-scan logic used in `pdf.rs` and `excel.rs`               |
| 208 | MEDIUM   | `a2ui.rs:547-563`                                      | `ShowNotification` command accepts `message`, `notification_type`, and `duration_ms` but discards all of them with `let _ = (...)` — notifications are never emitted to the frontend                                                                                                               | Medium — wire into `emit_event` or return an error until implemented                                          |
| 209 | MEDIUM   | `a2ui.rs` (general)                                    | No canvas element count limit — an LLM agent can call `AddText` in a loop, growing `elements: Vec<CanvasElement>` without bound, eventually causing memory exhaustion                                                                                                                              | Small — add a `MAX_ELEMENTS_PER_CANVAS` guard in `add_element`                                                |
| 210 | LOW      | `renderer.rs:279-286`                                  | `update_element` captures `element_clone` before the write-lock is dropped, emits the event with the clone, then immediately acquires a new read-lock to return the same element — the second lock is redundant and can return `Err` if the element was concurrently removed between the two locks | Small — return `element_clone` directly instead of re-reading                                                 |
| 211 | LOW      | `excel.rs:218`                                         | `(f.fract() - 0.0).abs() < f64::EPSILON` is a needlessly convoluted integer-float check; `f.fract() == 0.0` is equivalent and clearer since `fract()` returns exactly 0.0 for whole numbers                                                                                                        | Trivial                                                                                                       |
| 212 | LOW      | `pdf.rs:108-115`                                       | Cache invalidation compares `modified_at` as a string-parsed `u64` (Unix seconds) against the current file mtime; sub-second mtime changes (common on fast SSDs) will be missed, serving stale metadata                                                                                            | Small — store `SystemTime` directly in the cache entry instead of going through string serialization          |
| 213 | LOW      | `create_excel.rs:154-158`                              | Column auto-width is calculated only from header text length (`header.len() * 1.2`), not from data cell content; wide data values will be clipped in the rendered spreadsheet                                                                                                                      | Small — scan data column values too when computing width                                                      | ### W3-A6: Features (Calendar/Comms/Messaging/Productivity/Teams/Workflows) — COMPLETE |

**Files audited:** 58 | **Total LOC:** ~18,400 | **Bugs:** 27 (1 CRITICAL, 8 HIGH, 11 MEDIUM, 7 LOW)
**Overall:** Core task/team/search subsystems are solid; critical SQL column truncation in two features will crash at runtime, and a constellation of security issues across messaging, communications, and RAG require urgent fixes.

| File                               | Lines | Status   | Purpose                                      |
| ---------------------------------- | ----- | -------- | -------------------------------------------- |
| calendar/event_types.rs            | 175   | CLEAN    | Calendar event/reminder type definitions     |
| calendar/google_calendar.rs        | 526   | BUG      | Google Calendar CRUD via PKCE OAuth          |
| calendar/outlook_calendar.rs       | 575   | BUG      | Outlook/Graph Calendar CRUD                  |
| calendar/mod.rs                    | 517   | BUG      | CalendarManager, multi-account orchestration |
| calendar/timezone.rs               | 119   | BUG      | System timezone detection                    |
| clipboard/mod.rs                   | 6     | CLEAN    | Re-export (Windows-only feature gate)        |
| clipboard/monitor.rs               | 416   | BUG+DEAD | Clipboard history monitoring                 |
| communications/contacts.rs         | 370   | MEDIUM   | vCard CRUD, contact management               |
| communications/email_parser.rs     | 316   | BUG      | MIME email parsing, HTML sanitize            |
| communications/gmail_oauth.rs      | 644   | MEDIUM   | Gmail PKCE OAuth, token refresh              |
| communications/gmail_pubsub.rs     | 928   | DEAD     | Gmail Pub/Sub streaming pull                 |
| communications/imap_client.rs      | 524   | BUG      | IMAP email client                            |
| communications/mod.rs              | 105   | CLEAN    | Email/comms type definitions                 |
| communications/smtp_client.rs      | 180   | BUG      | SMTP email send                              |
| messaging/channel.rs               | 231   | BUG      | Multi-platform channel router                |
| messaging/discord.rs               | 405   | BUG      | Discord REST API client                      |
| messaging/mod.rs                   | 21    | CLEAN    | Messaging re-exports                         |
| messaging/signal.rs                | 248   | BUG      | Signal CLI subprocess wrapper                |
| messaging/slack.rs                 | 622   | BUG      | Slack WebSocket + REST client                |
| messaging/teams.rs                 | 709   | BUG      | Microsoft Teams Graph API                    |
| messaging/telegram.rs              | 265   | CLEAN    | Telegram Bot API client                      |
| messaging/types.rs                 | 306   | BUG      | Messaging platform enum/types                |
| messaging/whatsapp.rs              | 673   | BUG      | WhatsApp Business API                        |
| productivity/asana_client.rs       | 528   | BUG      | Asana API client                             |
| productivity/mod.rs                | ~30   | CLEAN    | Re-exports                                   |
| productivity/notion_client.rs      | 584   | BUG      | Notion API client                            |
| productivity/trello_client.rs      | 575   | BUG      | Trello API client                            |
| productivity/unified_task.rs       | 221   | CLEAN    | UnifiedTask trait abstraction                |
| projects/knowledge.rs              | 419   | MEDIUM   | Knowledge base SQLite ops                    |
| projects/manager.rs                | 362   | CRITICAL | Project + settings manager                   |
| projects/mod.rs                    | ~10   | CLEAN    | Re-exports                                   |
| projects/rag.rs                    | 387   | BUG      | RAG: chunking, embeddings, search            |
| search/fts.rs                      | 474   | CLEAN    | SQLite FTS5 full-text search                 |
| search/mod.rs                      | 7     | CLEAN    | Re-exports                                   |
| search/web_search.rs               | 500   | MEDIUM   | DuckDuckGo HTML scrape search                |
| tasks/examples.rs                  | 115   | CLEAN    | Example task function stubs                  |
| tasks/executor.rs                  | 244   | CLEAN    | Async task executor                          |
| tasks/mod.rs                       | 397   | MEDIUM   | TaskManager: process_queue bug               |
| tasks/persistence.rs               | 248   | CLEAN    | Task SQLite persistence                      |
| tasks/queue.rs                     | 244   | CLEAN    | Priority queue with mark-and-sweep           |
| tasks/types.rs                     | 286   | CLEAN    | Task, Priority, Status types                 |
| teams/mod.rs                       | 12    | CLEAN    | Re-exports                                   |
| teams/team_activity.rs             | 632   | CLEAN    | Team audit log                               |
| teams/team_billing.rs              | 582   | CLEAN    | Team billing, seat management                |
| teams/team_manager.rs              | 800   | BUG      | Team CRUD, invitations                       |
| teams/team_permissions.rs          | 428   | CLEAN    | RBAC permission matrix                       |
| teams/team_resources.rs            | 627   | CLEAN    | Shared resource registry                     |
| workflows/marketplace.rs           | 428   | BUG      | Workflow marketplace queries                 |
| workflows/mod.rs                   | 10    | CLEAN    | Re-exports                                   |
| workflows/publishing.rs            | 422   | BUG      | Publish/clone/fork workflows                 |
| workflows/social.rs                | 514   | CLEAN    | Ratings, comments, favorites                 |
| workflows/templates_marketplace.rs | ~400  | CLEAN    | Static template catalog                      |
| webhooks/mod.rs                    | 291   | BUG      | Webhook send/receive manager                 |
| updater.rs                         | 557   | CLEAN    | Tauri auto-updater commands                  |
| features/mod.rs                    | 19    | CLEAN    | Feature module re-exports                    |

**Key Finding:** A SQL column truncation pattern — `updated_a` instead of `updated_at` — appears in `projects/manager.rs` (lines 134, 162) and propagates identically through `workflows/marketplace.rs` (7 queries) and `workflows/publishing.rs` (6 queries), meaning every read of the published workflows table and every project listing will fail at runtime with a "no such column" error. WhatsApp's webhook handler completely skips signature verification, accepting any unauthenticated payload from the internet. Signal's `send_message` and `receive_messages` use blocking `std::process::Command` inside async functions, blocking all tokio worker threads during subprocess execution.

| #   | Severity | File                           | Issue                                                                                                                                                                   | Fix Effort |
| --- | -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- |
| 210 | CRITICAL | projects/manager.rs            | SQL column alias `updated_a` (lines 134, 162) — runtime crash on any project listing or load                                                                            | 15 min     |
| 211 | HIGH     | workflows/marketplace.rs       | `updated_a` truncation in all 7 SELECT queries — every marketplace read fails at runtime                                                                                | 30 min     |
| 212 | HIGH     | workflows/publishing.rs        | `updated_a` truncation in 6 SELECT queries including `publish_workflow` INSERT                                                                                          | 30 min     |
| 213 | HIGH     | messaging/whatsapp.rs          | `handle_webhook` does not verify `webhook_verify_token` from config — unauthenticated webhook acceptance                                                                | 1 hr       |
| 214 | HIGH     | messaging/signal.rs            | `send_message`, `receive_messages`, `list_contacts` use blocking `std::process::Command` inside `async fn` — blocks tokio threads                                       | 2 hr       |
| 215 | HIGH     | messaging/signal.rs            | `register()` is a stub (only sets `registered = true`, makes no API call) — feature silently broken                                                                     | 1 hr       |
| 216 | HIGH     | messaging/teams.rs             | `TeamsMessage.created_at` is `i64` but Graph API returns RFC3339 string — serde deserialization panic on any Teams message read                                         | 2 hr       |
| 217 | HIGH     | messaging/slack.rs             | Uses deprecated `files.upload` API (replaced by `files.getUploadURLExternal` v2) — file uploads will fail when Slack deprecates endpoint                                | 3 hr       |
| 218 | HIGH     | communications/smtp_client.rs  | `use_tls: false` path uses `builder_dangerous`, allowing plaintext SMTP with no warning or error to user                                                                | 1 hr       |
| 219 | MEDIUM   | projects/rag.rs                | `chunk_by_size` slices `content[start..end]` by byte offset without checking UTF-8 char boundaries — potential panic on non-ASCII docs                                  | 1 hr       |
| 220 | MEDIUM   | projects/rag.rs                | `hybrid_search` second pass calls `find_similar_chunks(query_embedding, vec![], ...)` — always returns empty vec (broken logic)                                         | 30 min     |
| 221 | MEDIUM   | communications/email_parser.rs | `EVENT_HANDLER_RE` only matches double-quoted handlers (`on\w+="`); single-quoted XSS attributes bypass `sanitize_html`                                                 | 1 hr       |
| 222 | MEDIUM   | messaging/discord.rs           | `connect()` only stores token in struct; never calls Discord API to validate token — silently appears connected                                                         | 1 hr       |
| 223 | MEDIUM   | messaging/types.rs             | `MessagingPlatform` enum contains only Slack/WhatsApp/Teams; `channel.rs::Platform` adds Discord/Telegram/Signal — inconsistent, unmaintainable                         | 2 hr       |
| 224 | MEDIUM   | productivity/asana_client.rs   | `create_task` has duplicate branch logic (lines 465–477): both `if` and `else` blocks call `list_workspaces().first()` — condition on `project_id.is_none()` is a no-op | 1 hr       |
| 225 | MEDIUM   | productivity/notion_client.rs  | `let _permit = self.rate_limiter.acquire().await;` without `?` — semaphore errors silently ignored in `get_page_content`, `create_page`, `create_database_row`          | 30 min     |
| 226 | MEDIUM   | productivity/notion_client.rs  | `NOTION_API_VERSION = "2025-12-01"` is future-dated and will be rejected by Notion API as invalid version                                                               | 15 min     |
| 227 | MEDIUM   | productivity/trello_client.rs  | `encode_path_segment` uses `c as u8` cast — multi-byte UTF-8 characters encoded incorrectly (only low byte used)                                                        | 2 hr       |
| 228 | MEDIUM   | productivity/trello_client.rs  | `update_task` fetches all boards, uses first board regardless of `task.project_id` — task updates go to wrong board                                                     | 1 hr       |
| 229 | MEDIUM   | tasks/mod.rs                   | `process_queue` uses `executors.values().next()` — always dispatches to the first registered executor regardless of task type; task routing is broken                   | 2 hr       |
| 230 | MEDIUM   | teams/team_manager.rs          | `get_user_teams` query has `updated_a` alias (line 251) — same truncation pattern; runtime crash when listing user teams                                                | 15 min     |
| 231 | MEDIUM   | webhooks/mod.rs                | `handle_incoming` signature verification is a placeholder — `let _ = (secret, sig)` does nothing; incoming webhooks have no authentication                              | 2 hr       |
| 232 | LOW      | calendar/google_calendar.rs    | `convert_google_event` drops all reminders and recurrence data (hardcoded empty) — silent data loss on import                                                           | 2 hr       |
| 233 | LOW      | calendar/outlook_calendar.rs   | Same as above: reminders/recurrence silently dropped during Outlook event conversion                                                                                    | 2 hr       |
| 234 | LOW      | calendar/timezone.rs           | `get_system_timezone()` returns `"UTC"` on macOS/Linux; no system TZ detection — all-day events will display in wrong timezone                                          | 3 hr       |
| 235 | LOW      | clipboard/monitor.rs           | `track_files` branch unreachable (`let has_files = false;` line 214 is permanently false); `get_foreground_app_name()` is a stub returning `None`                       | 2 hr       |
| 236 | LOW      | communications/imap_client.rs  | Uses deprecated `chrono::DateTime::from_timestamp` (line 388) — will trigger deprecation warning/error on next chrono bump                                              | 15 min     | ### W3-A7: Integrations — COMPLETE |

**Files audited:** 24 | **Total LOC:** ~8,890 | **Bugs:** 18 (1 CRITICAL, 5 HIGH, 8 MEDIUM, 4 LOW)
**Overall:** The integrations layer is architecturally sound with full OAuth flows and real WebSocket auth, but contains a JavaScript injection vulnerability, several dead/stub code paths, and a recurring pattern of silently swallowing errors in broadcast paths.

| File                           | Lines | Status | Purpose                                                                                       |
| ------------------------------ | ----- | ------ | --------------------------------------------------------------------------------------------- |
| api_integrations/mod.rs        | 48    | CLEAN  | Shared error types and RequestConfig                                                          |
| api_integrations/image_gen.rs  | 555   | GOOD   | DALL-E / Stable Diffusion / Imagen image generation                                           |
| api_integrations/perplexity.rs | 311   | GOOD   | Perplexity Sonar search client                                                                |
| api_integrations/runway.rs     | 435   | GOOD   | Runway Gen-4 / Veo video generation                                                           |
| api_integrations/veo3.rs       | 237   | ISSUES | Google Veo3 video client — wrong API schema                                                   |
| cloud/mod.rs                   | 302   | GOOD   | CloudStorageManager, CloudClient dispatcher                                                   |
| cloud/dropbox.rs               | 735   | GOOD   | Dropbox OAuth2 + chunked upload                                                               |
| cloud/google_drive.rs          | 776   | ISSUES | Google Drive resumable upload — post-upload ID lookup race                                    |
| cloud/one_drive.rs             | 656   | ISSUES | OneDrive upload — incomplete completion detection                                             |
| native_messaging/mod.rs        | 403   | GOOD   | Chrome native messaging protocol framing                                                      |
| native_messaging/host.rs       | 575   | ISSUES | Host: empty extension allowlist on initial install                                            |
| native_messaging/manifest.rs   | 627   | ISSUES | Windows registry stub not yet real; `register_windows_native_host` in manifest.rs is a no-op  |
| native_messaging/messages.rs   | 264   | CLEAN  | Message types and accessibility tree helpers                                                  |
| realtime/mod.rs                | 9     | CLEAN  | Re-exports                                                                                    |
| realtime/events.rs             | 92    | CLEAN  | RealtimeEvent enum                                                                            |
| realtime/collaboration.rs      | 84    | CLEAN  | CollaborationSession with cursor tracking                                                     |
| realtime/presence.rs           | 121   | ISSUES | PresenceManager: DB table not created before use                                              |
| realtime/websocket_server.rs   | 1,425 | ISSUES | JS injection, broadcast_to_resource broadcasts to all users                                   |
| sync/mod.rs                    | 9     | CLEAN  | Re-exports                                                                                    |
| sync/cloud.rs                  | 308   | ISSUES | CloudSyncClient: API key in plain struct field                                                |
| sync/conflict.rs               | 202   | ISSUES | ConflictResolver.auto_resolve ignores `auto_resolve` flag                                     |
| sync/manager.rs                | 267   | ISSUES | Remote updates fetched but dispatching is a stub                                              |
| sync/queue.rs                  | 439   | ISSUES | received_updates table created inside queries (TOCTOU); entity parse falls back to wrong type |

**Key Finding:** The `websocket_server.rs` `SetAttribute`/`GetElement` JS template injection bug (Bug #220) allows arbitrary JavaScript execution via unsanitized CSS selectors — single-quote escaping is done for selector values but not for attribute names or values in the `SetAttribute` path, and multi-level nesting in string interpolation makes the escaping incomplete. The `broadcast_to_resource` function (Bug #221) ignores the `resource_id` parameter entirely and broadcasts every event to all authenticated users, which is a serious data-confidentiality regression. Additionally, the Windows native messaging registry registration in `manifest.rs` is a logged stub that always returns `Ok(())` but writes nothing, meaning the extension will silently fail to connect on Windows.

| #   | Severity | File                         | Issue                                                                                                                                                                                                                                                                                                                              | Fix Effort |
| --- | -------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| 220 | CRITICAL | realtime/websocket_server.rs | JS injection in `SetAttribute`: `attribute` and `value` are interpolated into a script string with only single-quote escaping; a selector or attribute value containing `\` or `}}` can escape the IIFE context and execute arbitrary JS via `evaluate()`                                                                          | Medium     |
| 221 | HIGH     | realtime/websocket_server.rs | `broadcast_to_resource` ignores `_resource_id` param and broadcasts to all authenticated users — exposes data cross-team/cross-user                                                                                                                                                                                                | Small      |
| 222 | HIGH     | realtime/presence.rs         | `PresenceManager` uses a `rusqlite::Connection` in a plain `Mutex` but never runs `CREATE TABLE IF NOT EXISTS user_presence` — first call to `set_online` panics with "no such table"                                                                                                                                              | Small      |
| 223 | HIGH     | native_messaging/manifest.rs | `register_windows_native_host` in manifest.rs is a stub that always returns `Ok(())` and emits only a log line — Chrome extension native messaging silently fails on Windows                                                                                                                                                       | Medium     |
| 224 | HIGH     | native_messaging/host.rs     | `install_native_host_manifest()` calls `generate_host_manifest` with `&[]` for `extension_ids`, writing a manifest with empty `allowed_origins` — no extension can connect                                                                                                                                                         | Small      |
| 225 | HIGH     | sync/conflict.rs             | `ConflictResolver::auto_resolve` is called unconditionally from `SyncManager` regardless of the `auto_resolve` flag — user preference to require manual resolution is silently ignored                                                                                                                                             | Small      |
| 226 | MEDIUM   | veo3.rs                      | `VideoGenerationResponse` expects `"Completed"` / `"Processing"` as status strings but Google Veo3 API uses `"STATE_SUCCEEDED"` / `"STATE_ACTIVE"` — deserialization always fails, `wait_for_completion` loops forever                                                                                                             | Small      |
| 227 | MEDIUM   | sync/manager.rs              | Remote updates are fetched, stored, and immediately marked `applied` without dispatching to any handler — remote changes from server are silently discarded                                                                                                                                                                        | Medium     |
| 228 | MEDIUM   | cloud/google_drive.rs        | After resumable upload completes, the code calls `find_in_parent` by filename to retrieve the file ID — if two files share a name, the wrong ID is returned; the Drive API returns the file ID in the `201` response body which is discarded                                                                                       | Small      |
| 229 | MEDIUM   | cloud/one_drive.rs           | In `resumable_upload`, final chunk detection relies on `response.status().is_success() && offset >= total_size`, but OneDrive returns `201 Created` (success) only for the last chunk; intermediate `202 Accepted` (also counted as success here) causes premature function exit and data loss when chunk boundary aligns with EOF | Small      |
| 230 | MEDIUM   | sync/queue.rs                | `get_pending` falls back to `SyncEntity::Message` and `SyncAction::Update` for unrecognized discriminants from the DB — corrupt rows silently mutate as Message/Update instead of returning an error                                                                                                                               | Small      |
| 231 | MEDIUM   | sync/queue.rs                | `store_remote_update` and `get_pending_remote_updates` both run `CREATE TABLE IF NOT EXISTS received_updates` — the table creation DDL is duplicated and differs (no index on `applied`), and DDL in read paths is an anti-pattern                                                                                                 | Small      |
| 232 | MEDIUM   | realtime/websocket_server.rs | `broadcast_to_team` holds both `clients_lock` and `senders_lock` simultaneously and calls `sender.send().await` while both locks are held — potential deadlock if any other task acquiring these locks in a different order                                                                                                        | Medium     |
| 233 | MEDIUM   | image_gen.rs                 | `collect_images_from_value` recurses over the entire JSON tree including already-extracted fields, causing duplicate images to be appended when both `inlineData` and a top-level `base64` key are present                                                                                                                         | Small      |
| 234 | LOW      | api_integrations/mod.rs      | `RequestConfig.max_retries` field is defined and serialized but never used by any of the four API clients — retry logic is absent                                                                                                                                                                                                  | Medium     |
| 235 | LOW      | realtime/websocket_server.rs | `start()` loop is infinite with no shutdown signal — the server cannot be stopped gracefully, preventing clean app shutdown                                                                                                                                                                                                        | Medium     |
| 236 | LOW      | sync/cloud.rs                | `api_key` is stored as a plain `String` field on `CloudSyncConfig` and `CloudSyncClient` — should route through `SecretManager` per project security rules                                                                                                                                                                         | Medium     |
| 237 | LOW      | cloud/dropbox.rs             | `use_pkce: false` in Dropbox OAuth config — Dropbox supports PKCE for public clients; omitting it is weaker, though not exploitable given client_secret is present                                                                                                                                                                 | Small      | ### W3-A8: Core (Remaining Modules) — COMPLETE |

**Files audited:** 57 (excluding test files) | **Total LOC:** ~29,609 | **Bugs:** 14 (0 CRITICAL, 4 HIGH, 6 MEDIUM, 4 LOW)

**Overall:** Solid architecture with good security layering; primary risks are two real stubs (scheduler body, webhook auth), a regex-per-call hotspot in the codebase indexer, unsafe hash usage for dedup, and a missing cycle-detection guard that allows infinite recursion in the workflow graph traversal.

| File                                    | Lines | Status           | Purpose                                                                 |
| --------------------------------------- | ----- | ---------------- | ----------------------------------------------------------------------- |
| **artifacts/mod.rs**                    | 17    | Clean            | Module re-exports                                                       |
| **artifacts/types.rs**                  | 563   | Clean            | Artifact domain types + versioning                                      |
| **artifacts/renderer.rs**               | 721   | Clean            | Type-based render dispatch for frontend                                 |
| **artifacts/store.rs**                  | 674   | Clean            | In-memory artifact CRUD with RwLock indexes                             |
| **codebase/mod.rs**                     | 79    | Clean            | Tauri commands + degraded state wrapper                                 |
| **codebase/indexer.rs**                 | 486   | Buggy (LOW)      | SQLite-backed symbol indexer with regex extraction                      |
| **embeddings/mod.rs**                   | 351   | Clean            | EmbeddingService facade + Tauri commands                                |
| **embeddings/generator.rs**             | 239   | Buggy (LOW)      | Ollama embedding generator; fastembed variant is dead enum arm          |
| **embeddings/cache.rs**                 | 248   | Buggy (HIGH)     | LRU in-memory + SQLite cache for vectors                                |
| **embeddings/chunker.rs**               | 572   | Clean            | Semantic/fixed/hybrid code chunker                                      |
| **embeddings/indexer.rs**               | 267   | Clean            | Incremental file indexer using WalkDir                                  |
| **embeddings/similarity.rs**            | 424   | Clean            | Cosine similarity search over SQLite BLOB vectors                       |
| **hooks/config.rs**                     | 682   | Clean            | Hook definition schema + validation                                     |
| **hooks/error.rs**                      | 97    | Clean            | Hook error types                                                        |
| **hooks/event.rs**                      | 491   | Clean            | HookEvent enum + context struct                                         |
| **hooks/executor.rs**                   | 930   | Clean            | Shell hook executor with blocklist + semaphore                          |
| **hooks/mod.rs**                        | 134   | Clean            | Module re-exports                                                       |
| **intent/detector.rs**                  | 554   | Clean            | Pattern + LLM-fallback intent detection                                 |
| **intent/error.rs**                     | ~40   | Clean            | Intent error types                                                      |
| **intent/mod.rs**                       | ~50   | Clean            | Re-exports                                                              |
| **intent/patterns.rs**                  | 963   | Clean            | Regex pattern catalog for 15+ categories                                |
| **intent/quick_win.rs**                 | 533   | Clean            | Fast-path optimizer for trivial intents                                 |
| **intent/router.rs**                    | 795   | Clean            | MCP tool routing + server lifecycle                                     |
| **intent/types.rs**                     | 449   | Clean            | Intent domain types                                                     |
| **models/advanced_features.rs**         | 194   | Clean            | Advanced feature structs (ToolExecution, ExecutionPlan, etc.)           |
| **models/mod.rs**                       | ~30   | Clean            | Re-exports                                                              |
| **orchestration/mod.rs**                | ~30   | Clean            | Re-exports                                                              |
| **orchestration/workflow_engine.rs**    | 785   | Clean            | In-memory workflow store + execution tracking                           |
| **orchestration/workflow_executor.rs**  | 1,333 | Buggy (HIGH+MED) | Full node executor: agent, decision, loop, parallel, wait, script, tool |
| **orchestration/workflow_scheduler.rs** | 211   | Stubbed (HIGH)   | Cron scheduler; body is empty stub + webhook auth skipped               |
| **research/agents.rs**                  | 819   | Clean            | Search agent trait + Web/Doc/Email/Calendar/Memory agents               |
| **research/citation.rs**                | 518   | Clean            | Citation tracking + formatting                                          |
| **research/mod.rs**                     | ~30   | Clean            | Re-exports                                                              |
| **research/orchestrator.rs**            | 1,038 | Clean            | Multi-agent research coordinator                                        |
| **research/report.rs**                  | 514   | Clean            | Report generation with sections                                         |
| **research/types.rs**                   | 485   | Clean            | Research domain types                                                   |
| **research/web_search_config.rs**       | 124   | Clean            | Search provider config                                                  |
| **scheduler/error.rs**                  | ~40   | Clean            | Scheduler error types                                                   |
| **scheduler/mod.rs**                    | ~30   | Clean            | Re-exports                                                              |
| **scheduler/nlp_parser.rs**             | 1,449 | Clean            | NLP→Schedule parser with pre-compiled static regexes                    |
| **scheduler/proactive.rs**              | 1,231 | Clean            | tokio-cron-scheduler wrapper with pause/resume                          |
| **scheduler/types.rs**                  | 437   | Clean            | Scheduler domain types                                                  |
| **skills/error.rs**                     | ~30   | Clean            | Skill error types                                                       |
| **skills/loader.rs**                    | 707   | Clean            | YAML frontmatter skill loader + requirement checker                     |
| **skills/manager.rs**                   | 1,104 | Clean            | Skill manager: bundled + managed + workspace skill loading              |
| **skills/mod.rs**                       | 299   | Clean            | Skill Tauri commands                                                    |
| **skills/skill.rs**                     | 709   | Clean            | Skill domain struct + context rendering                                 |
| **swarm/agent_spawner.rs**              | 695   | Clean            | Circuit-breaker sub-agent spawner                                       |
| **swarm/mod.rs**                        | 266   | Clean            | Swarm module + constants                                                |
| **swarm/orchestrator.rs**               | 763   | Clean            | Hub-and-spoke swarm coordinator                                         |
| **swarm/result_aggregator.rs**          | 569   | Clean            | Multi-strategy result aggregation                                       |
| **swarm/task_decomposer.rs**            | 908   | Clean            | LLM-assisted task decomposition + DAG builder                           |
| **sync_utils.rs**                       | 117   | Clean            | Safe mutex/rwlock extension traits                                      |

**Key Finding:** The workflow executor now has cycle detection and live loop-body execution, and the workflow scheduler now executes registered cron entries instead of acting as an empty stub. The remaining live workflow risk in this area is script execution hardening and the still-duplicate `sys/commands/scheduler.rs` hierarchy. The `EmbeddingCache::get_top_accessed()` SQL typo was also resolved in the live runtime.

| #   | Severity | File                                         | Issue                                                                                                                                                                                                                                                         | Fix Effort                                                                            |
| --- | -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| 230 | HIGH     | `orchestration/workflow_executor.rs:250-278` | `execute_next_nodes` → `execute_node` recursion has no visited-set or depth limit; a cyclic workflow graph (A→B→A) causes unbounded `Box::pin` recursion and stack overflow                                                                                   | Medium — add `execution_path` HashSet check before calling `execute_node`             |
| 231 | HIGH     | `orchestration/workflow_scheduler.rs:43-45`  | Historical issue resolved: the scheduler now registers runtime schedules, starts with `WorkflowEngineState`, and executes due cron entries instead of returning `Ok(())`                                                                                      | Fixed in live desktop runtime                                                         |
| 232 | HIGH     | `embeddings/cache.rs:167-181`                | SQL typo: `"access_coun"` (missing `t`) in `get_top_accessed()` — query fails with a rusqlite column error at runtime; function always returns an error                                                                                                       | Trivial — fix column name to `access_count`                                           |
| 233 | HIGH     | `orchestration/workflow_scheduler.rs:80-93`  | Historical issue resolved: webhook-triggered workflows now validate the configured auth token before execution and reject mismatches                                                                                                                          | Fixed in live desktop runtime                                                         |
| 234 | MEDIUM   | `codebase/indexer.rs:457-462`                | `extract_pattern()` calls `regex::Regex::new(pattern)` on every line of every file — O(lines × symbols) regex compilations; on a 50k-line codebase this is a ~200k regex construction calls                                                                   | Low — use `once_cell::sync::Lazy` static patterns (as done correctly in `chunker.rs`) |
| 235 | MEDIUM   | `artifacts/types.rs:472-479`                 | `hash_content()` uses `std::collections::hash_map::DefaultHasher` (non-deterministic, not guaranteed stable across Rust versions) for version deduplication — two identical artifacts could get different hashes if the hasher seed changes                   | Low — replace with SHA-256 (already used in `codebase/indexer.rs::hash_content`)      |
| 236 | MEDIUM   | `orchestration/workflow_executor.rs:400-406` | Historical issue resolved: count-based loop nodes now execute child nodes on each iteration instead of being no-op iteration wrappers                                                                                                                         | Fixed in live desktop runtime                                                         |
| 237 | MEDIUM   | `orchestration/workflow_executor.rs:408-417` | Historical issue resolved: condition loop nodes now execute child nodes in the loop body instead of spinning without traversing the graph                                                                                                                     | Fixed in live desktop runtime                                                         |
| 238 | MEDIUM   | `orchestration/workflow_executor.rs:420-428` | Historical issue resolved: for-each loop nodes now execute child nodes for each collection item instead of only rebinding the loop variable                                                                                                                   | Fixed in live desktop runtime                                                         |
| 239 | MEDIUM   | `orchestration/workflow_executor.rs:923-933` | Historical issue resolved: script-node timeouts now kill and reap the child process before returning the timeout error                                                                                                                                        | Fixed in live desktop runtime                                                         |
| 240 | LOW      | `embeddings/generator.rs:8-15`               | `EmbeddingModel::FastembedAllMiniLM` enum variant is permanently unreachable — `generate_fastembed()` always returns `Err(...)` and the variant has no `ollama_model_name()`, so selecting it always fails; it is dead code that confuses the API             | Low — remove the variant or implement it                                              |
| 241 | LOW      | `orchestration/workflow_executor.rs:53-62`   | `LoopType::Count` guard: `data.iterations` is `Option<i32>` and defaults to 1 — a workflow that sets `iterations: -1` silently runs 0 iterations (Rust `0..-1` is empty); there is no validation that the value is non-negative                               | Trivial — clamp or error on negative values                                           |
| 242 | LOW      | `orchestration/workflow_scheduler.rs:47-62`  | Historical issue resolved for the live desktop runtime: schedules are now registered in scheduler state and surfaced via `list_scheduled_workflows()` instead of being dropped immediately                                                                    | Fixed in live desktop runtime                                                         |
| 243 | LOW      | `artifacts/store.rs:441-464`                 | `prune_versions` logic is off-by-one: when `versions.len() == max_versions + 1`, it keeps `first + (max_versions - 1)` recent entries, which is correct, but the first entry may already be included in the `recent` slice, causing a duplicate first version | Low — check if `recent` already contains the first version before prepending          | ### W3-A9: AGI (Remaining) — COMPLETE |

**Files audited:** 15 | **Total LOC:** ~8,113 | **Bugs:** 16 (0 CRITICAL, 5 HIGH, 7 MEDIUM, 4 LOW)

**Overall:** Solid checkpoint and sandbox infrastructure with well-documented stubs; key issues are O(n) cache eviction, hardcoded model IDs, a completely hollow audio stub, unconnected DB tables in process_ontology, and advisory-only network isolation in the sandbox.

| File                              | Lines | Status    | Purpose                                     |
| --------------------------------- | ----- | --------- | ------------------------------------------- |
| audio_processing.rs               | 75    | Stub      | Audio transcription/analysis placeholder    |
| checkpoint.rs                     | 351   | Good      | Core checkpoint types, serialization, tests |
| checkpoint_manager.rs             | 401   | Good      | Checkpoint orchestration with metrics       |
| checkpoint_store.rs               | 539   | Good      | SQLite persistence for checkpoints          |
| checkpoint_integration_example.rs | 353   | Reference | Doc-only example file with empty test       |
| comparator.rs                     | 167   | Good      | Result scoring and ranking                  |
| context_manager.rs                | 311   | Medium    | Context compaction with hardcoded model     |
| orchestrator_examples.rs          | 446   | Reference | Example functions with ignored tests        |
| outcome_tracker.rs                | 579   | Medium    | Per-goal outcome tracking, O(n) cache       |
| process_ontology.rs               | 587   | Medium    | Process templates — DB table not created    |
| process_reasoning.rs              | 779   | Medium    | Process classification + LLM fallback       |
| resources.rs                      | 141   | Medium    | sysinfo-based resource monitoring           |
| sandbox.rs                        | 1048  | Good      | Sandboxed code execution, good security     |
| templates/builtin_templates.rs    | 1785  | Good      | 15 built-in agent templates                 |
| templates/template_manager.rs     | 551   | Good      | Template CRUD with SQLite                   |

**Key Finding:** The checkpoint subsystem is well-constructed (transactional, ACID-safe, proper index design) but is never wired into the main AGI executor — checkpoint_integration_example.rs confirms this with a TODO checklist. The sandbox has good path-traversal guards and env-var blocklisting, but explicitly documents that network isolation is advisory only, which is a runtime security gap that callers must understand. The `process_ontology.rs` file tries to persist templates to a `process_templates` table that is never created anywhere in the schema, so every `ProcessOntology::new()` call silently no-ops the DB write.

| #   | Severity | File                              | Issue                                                                                                                                                                                                                                                                                                                                                                                                             | Fix Effort |
| --- | -------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------- |
| 240 | HIGH     | audio_processing.rs               | `analyze_audio` returns entirely fabricated hardcoded data (duration=0, language="en", has_speech=true) with no actual audio analysis — callers receive plausible-looking but meaningless results                                                                                                                                                                                                                 | Medium     |
| 241 | HIGH     | process_ontology.rs               | `process_templates` table is never created (no `init()` / `CREATE TABLE` call in this file or any known migration); `save_template_to_db` called in `initialize_default_templates` silently fails via `?` propagation back to `new()`, so templates are only ever in-memory                                                                                                                                       | Medium     |
| 242 | HIGH     | context_manager.rs                | `summarize_segment` hardcodes model `"gpt-4o-mini"` directly in the call — violates model-routing policy; should use default preferences or a configurable model                                                                                                                                                                                                                                                  | Small      |
| 243 | HIGH     | outcome_tracker.rs                | `track_outcome` calls `refresh_success_rates()` which opens a new DB connection and queries all ProcessType variants on **every single outcome write** — O(N\*M) DB connections per write where N=outcomes/sec and M=10 process types; under load this is a connection storm                                                                                                                                      | Medium     |
| 244 | HIGH     | outcome_tracker.rs                | Cache eviction in `track_outcome` uses `Vec::remove(0)` (O(n) shift) instead of a ring buffer or `VecDeque`; at 100-item cap this copies 99 elements per write                                                                                                                                                                                                                                                    | Small      |
| 245 | MEDIUM   | sandbox.rs                        | Network isolation via env vars `OFFLINE`, `NO_PROXY`, `HTTP_PROXY` is explicitly advisory; code itself documents the bypass risk but callers (executor, tools) have no way to detect that isolation failed — should return a flag indicating isolation quality                                                                                                                                                    | Small      |
| 246 | MEDIUM   | sandbox.rs                        | `kill_all_processes` uses `libc::kill(pid, SIGKILL)` with no PID validation — if `active_processes` contains a stale PID that was recycled by the OS to a different process, it will kill an unrelated process                                                                                                                                                                                                    | Small      |
| 247 | MEDIUM   | checkpoint_store.rs               | `get_latest_checkpoint` uses `WHERE is_latest = 1 LIMIT 1` but there is a window where the `UPDATE … SET is_latest = 0` and the `INSERT` in `save_checkpoint` are in the same transaction — if two concurrent save calls race (multi-threaded spawn_blocking), both can mark prior checkpoints as non-latest leaving multiple `is_latest=1` rows                                                                  | Medium     |
| 248 | MEDIUM   | checkpoint_store.rs               | `cleanup_old_checkpoints` uses `LIMIT -1 OFFSET ?2` which is SQLite extension syntax, not standard SQL — technically works in SQLite but may break on schema migration to another DB; also deletes checkpoints one-by-one in a loop instead of a single `DELETE WHERE id IN (...)`                                                                                                                                | Small      |
| 249 | MEDIUM   | process_reasoning.rs              | `classify_by_llm` hardcodes model `"claude-haiku-4-5"` in both `RouterPreferences` and `LLMRequest.model` — if the user has no Anthropic key or the model is unavailable, it falls back silently to `ProcessType::DataEntry` with no error surfaced to the caller                                                                                                                                                 | Small      |
| 250 | MEDIUM   | resources.rs                      | `update_usage_internal` acquires `self.reservations` lock while holding `self.current_usage` lock — two-lock acquisition in consistent order prevents deadlock here, but `reserve_resources` acquires `current_usage` first then `reservations`, creating the same ordering; `release_resources` only acquires `current_usage` — mixed ordering across methods is a latent deadlock risk if usage pattern changes | Medium     |
| 251 | MEDIUM   | context_manager.rs                | Token count estimation uses `summary_response.len() / 4` (byte length ÷ 4) — this underestimates non-ASCII text (e.g., CJK characters are 3 bytes but ~1 token) and for multilingual content can be off by 3x, causing incorrect compaction decisions                                                                                                                                                             | Small      |
| 252 | LOW      | checkpoint_integration_example.rs | `example_checkpoint_workflow` test body is empty (just comments) — passes vacuously, gives false confidence that the checkpoint integration is tested                                                                                                                                                                                                                                                             | Small      |
| 253 | LOW      | audio_processing.rs               | `AudioProcessor::new()` always sets `enabled: true` but there is no mechanism to detect whether any speech-to-text backend is actually available — `is_available()` always returns `true` misleading callers                                                                                                                                                                                                      | Small      |
| 254 | LOW      | comparator.rs                     | `calculate_score` has no normalization — a failed run with 0 steps (0.0 completion rate + 0 time bonus) gets a base score of 10.0 while a successful run with no steps gets 50.0; score is not bounded to [0,100] and `cost` bonus can push past 100 if both success and all bonuses apply (50+30+10+10=100 exactly, OK), but future additions could overflow                                                     | Small      |
| 255 | LOW      | templates/template_manager.rs     | `connection()` converts a `PoisonError` to `rusqlite::Error::InvalidQuery` — this loses the original poisoning context and makes the error message misleading ("Invalid query" vs "mutex poisoned"); callers cannot distinguish a real invalid query from a poisoned lock                                                                                                                                         | Small      | ### W3-A10: Rust Tests — COMPLETE |

**Files audited:** 67 | **Total LOC:** ~35,491 | **Bugs:** 18 (issues found)
**Overall:** The test suite has strong coverage in critical security and LLM layers but contains a structural cluster of vacuous placeholder tests in the AGI/memory/features modules that provide zero signal.

| Module                               | Test Files | Tests | Status | Notes                                                                                          |
| ------------------------------------ | ---------- | ----- | ------ | ---------------------------------------------------------------------------------------------- |
| `core/llm/tests/`                    | 9          | ~300  | GOOD   | Real production paths tested; fallback chain, cost calc, routing all exercised                 |
| `core/llm/provider_adapter_tests.rs` | 1          | 25    | GOOD   | Serialization of provider-specific formats                                                     |
| `core/agent/tests/`                  | 7          | ~120  | GOOD   | planner, executor, undo, context compactor all tested with real logic                          |
| `core/agi/executors/tests/`          | 4          | ~100  | GOOD   | FileExecutor uses tempfiles and real executor paths                                            |
| `core/agi/tests/`                    | 11         | ~200  | MIXED  | core_tests/failure_recovery are real; **memory_tests** and **security_tests** are placeholders |
| `core/mcp/tests.rs`                  | 1          | 63    | GOOD   | Protocol parsing, timeout handling, credential tests all real                                  |
| `core/swarm/tests.rs`                | 1          | ~30   | GOOD   | DependencyGraph, aggregator, cache TTL are real                                                |
| `core/hooks/tests.rs`                | 1          | ~25   | GOOD   | Hook config lifecycle is real                                                                  |
| `core/scheduler/tests.rs`            | 1          | 42    | GOOD   | Scheduler logic tested                                                                         |
| `core/research/tests.rs`             | 1          | 36    | GOOD   |                                                                                                |
| `core/intent/tests.rs`               | 1          | 38    | GOOD   |                                                                                                |
| `core/artifacts/tests.rs`            | 1          | ~20   | GOOD   |                                                                                                |
| `sys/commands/`                      | 5          | ~80   | MIXED  | security_tests is strong; file_ops has 2 vacuous tests; test_runner.rs has NO tests            |
| `data/settings/tests.rs`             | 1          | ~12   | GOOD   | In-memory SQLite with full CRUD exercised                                                      |
| `tests/` (root)                      | 4          | ~200  | MIXED  | audit_regression good; **security_tests.rs** (agi) has fake tests                              |
| `automation/`                        | 4          | ~60   | MIXED  | integration_tests require live apps; unit tests are real                                       |
| `features/tests/`                    | 4          | ~80   | MIXED  | router_tests has empty `router_core_tests` module                                              |

**Key Finding:** The worst cluster is `core/agi/tests/memory_tests.rs` (8 tests) and `core/agi/tests/security_tests.rs` (14 tests), where tests either assert against locally-defined mock objects that are never connected to production code, or assert on string literals (`assert_eq!(key, "memory_key")`), constants, or string membership (`code.contains("exec")`). These tests always pass and provide zero coverage of actual production AGI memory and security code. A second pattern is found in `sys/commands/file_ops_tests.rs`, where `test_dir_operations` and `test_glob_patterns` assert only on the shape of test-local data with no production calls at all. The regression test module `r6_path_validation` (in `audit_regression_tests.rs`) explicitly replicates the denylist logic rather than calling the production function, meaning the production `check_blocked_prefix` could silently diverge.

| #   | Severity | File                                                              | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix Effort                                           |
| --- | -------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 250 | CRITICAL | `core/agi/tests/memory_tests.rs`                                  | 6 of 8 tests assert on local variables only (`assert_eq!(item_count, 5)`, `assert!(persisted)`, `assert!(current < capacity)`) — no production code is ever called. `WorkingMemory` is a local mock; production AGI memory system is untested.                                                                                                                                                                                                                                                                 | Medium — wire to production `MemoryManager`          |
| 251 | CRITICAL | `core/agi/tests/security_tests.rs`                                | `test_sql_injection_patterns` asserts `injection.contains("'")` — tests that the hard-coded test strings contain their own known characters, not that any production validator blocks them. `test_code_execution_sandboxing` and `test_network_request_validation` have the same pattern. Tests a local `SecurityValidator` struct, not the production `ToolGuard` or `command_validator`.                                                                                                                     | Medium                                               |
| 252 | HIGH     | `sys/commands/file_ops_tests.rs`                                  | `test_dir_operations` never calls production code — creates a temp dir, asserts the test path doesn't exist and that `.to_str()` returns `Some`. `test_glob_patterns` asserts that a hard-coded string `"**/*.rs"` contains `"**"` — entirely vacuous.                                                                                                                                                                                                                                                         | Low — replace or delete                              |
| 253 | HIGH     | `core/llm/tests/llm_router_tests.rs`                              | `test_provider_enum_values` builds a `[Provider; 4]` array and asserts `len() == 4`, and `test_routing_strategy_variants` does the same with a `[RoutingStrategy; 4]` array. These test Rust's type system, not routing behavior. `test_all_providers_fail_error_message_pattern` asserts a hard-coded string contains itself.                                                                                                                                                                                 | Low — delete or replace                              |
| 254 | HIGH     | `core/llm/tests/llm_router_tests.rs` → `router_fallback_tests`    | `test_session_cost_below_cap_is_allowed` and `test_session_cost_at_cap_triggers_guard` do arithmetic comparisons on literal floats against `SESSION_COST_SAFETY_CAP`. They verify that `49.99 < 50.0`, not that the actual router enforces the cap on a live session. The production `route_with_retry` cost-cap enforcement path has no test that actually triggers it.                                                                                                                                       | High — mock or integration test needed               |
| 255 | HIGH     | `core/llm/tests/audit_regression_tests.rs` → `r6_path_validation` | The module explicitly acknowledges it **replicates** the denylist logic from `AgentExecutor::check_blocked_prefix` rather than calling the production function. The production and test implementations can silently diverge. E.g., `/etc/passwd` is blocked by the production function but is NOT in the `denied_prefixes` list in the test replication (only `/etc/shadow`, `/etc/gshadow`, `/etc/sudoers` are listed).                                                                                      | Medium                                               |
| 256 | HIGH     | `core/agent/tests/executor_tests.rs`                              | `validate_file_path_ssh_dir_is_rejected` and `validate_file_path_gnupg_dir_is_rejected` skip silently if `~/.ssh` or `~/.gnupg` don't exist on the CI runner — the entire security assertion is conditioned on filesystem state. In a minimal CI environment both directories may be absent, causing the tests to vacuously pass.                                                                                                                                                                              | Low — use a temp directory with a fake `.ssh` subdir |
| 257 | MEDIUM   | `sys/commands/test_runner.rs`                                     | This 902-line file is not a test file — it is a Tauri command implementation (`test_run`, `test_detect_runner`). It contains zero `#[test]` functions. It is named `test_runner.rs` and lives in the commands directory, which causes it to appear in test audits but provides no test coverage of itself (e.g., `parse_cargo_failures`, `extract_count`, `detect_runner` are untested).                                                                                                                       | Medium — add unit tests for parsers                  |
| 258 | MEDIUM   | `features/tests/router_tests.rs`                                  | `router_core_tests` module has a comment `// Obsolete tests removed` and zero test functions. The module declaration remains and contributes to the test file count but runs nothing.                                                                                                                                                                                                                                                                                                                          | Low — remove the empty module                        |
| 259 | MEDIUM   | `core/agi/tests/security_tests.rs`                                | `test_path_validation_safe_paths` calls the local mock `SecurityValidator::validate_path`, not the production `validate_file_path` from `sys::commands::file_ops`. The production validator uses canonicalization and a different denylist. These safe paths would also be accepted by the production code, but the test gives false confidence that the production code is covered.                                                                                                                           | Medium                                               |
| 260 | MEDIUM   | `core/agi/tests/memory_tests.rs`                                  | The local `WorkingMemory` struct is marked `#[allow(dead_code)]` (lines 16, 22) because the 6 vacuous tests never instantiate it — confirming that even the mock implementation is unused.                                                                                                                                                                                                                                                                                                                     | Low — delete vacuous tests                           |
| 261 | MEDIUM   | `tests/windows_compat_tests.rs`                                   | 66 tests — not examined in detail above, but the high count and the pattern seen elsewhere in this module suggests similar platform-conditioned tests that silently skip on macOS CI. Needs spot-check.                                                                                                                                                                                                                                                                                                        | Low                                                  |
| 262 | MEDIUM   | `core/llm/tests/cost_calculator_tests.rs`                         | Pricing values are hardcoded (`$3.00/M`, `$15.00/M` for claude-sonnet-4-6). If pricing constants in `cost_calculator.rs` are updated, these tests will fail on exact values — but the inverse risk is they give false confidence about pricing correctness when they pass. Model IDs like `claude-sonnet-4-6`, `claude-opus-4-6`, `gpt-5.2`, `gpt-5-nano` are speculative future model names that may not exist in the production pricing table, meaning tests may silently fall through to provider defaults. | Low                                                  |
| 263 | LOW      | `core/agent/tests/planner_tests.rs`                               | 3 live-LLM tests are correctly marked `#[ignore]`. No issue with ignoring, but `plan_task_requires_llm_provider` has no assertions about response shape if it were run — only `assert!(!steps.is_empty())`.                                                                                                                                                                                                                                                                                                    | Low                                                  |
| 264 | LOW      | `core/mcp/tests.rs` → `credential_tests`                          | `test_mcp_credential_encryption_produces_output` only asserts the output is non-empty and differs from plaintext. It does not verify decryption produces the original value — so a broken decryption path would not be caught.                                                                                                                                                                                                                                                                                 | Low                                                  |
| 265 | LOW      | `automation/integration_tests.rs`                                 | Integration tests launch real desktop applications (Calculator, Notepad) and use `#[serial]`. All have `#[ignore]` — but no unit-level abstraction exists to test automation logic without a real GUI.                                                                                                                                                                                                                                                                                                         | Low                                                  |
| 266 | LOW      | `core/agi/tests/failure_recovery_tests.rs`                        | `test_three_strike_triggers_abandonment` simulates the counter logic with bare local variables, not by calling the actual `ReflectionEngine` or `AutonomousExecutor`. The 3-strike check at the call site in production could be off-by-one and these tests would still pass.                                                                                                                                                                                                                                  | Medium                                               |
| 267 | LOW      | `sys/commands/file_ops_tests.rs`                                  | `test_path_traversal_detection` accepts both `"directory traversal"` and `"does not exist"` as valid error messages. This means a broken traversal detector that returns a generic "file does not exist" error (even for valid-looking traversal paths) would pass the test without blocking the traversal.                                                                                                                                                                                                    | Medium                                               |

## Wave 4: Frontend Components A-M

**Total files audited:** 331 | **Total LOC:** ~99,658 | **Total bugs:** 133 (3 CRITICAL, 16 HIGH, 60 MEDIUM, 54 LOW)

| Agent  | Scope                            | Files | LOC    | Bugs | Key Issue                                                                                                                 |
| ------ | -------------------------------- | ----- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| W4-A1  | UnifiedAgenticChat Core          | 8     | 8,574  | 11   | Historical broad duplicate-listener issue resolved; live overlap is now limited to `agi:tool_stream` cancellation cleanup |
| W4-A2  | UnifiedAgenticChat Tools UI      | 12    | 2,244  | 8    | ApprovalRequestCard double-click bypass                                                                                   |
| W4-A3  | InlineToolResults                | 27    | 4,770  | 12   | URL injection via `html_url` in InlineGitHub                                                                              |
| W4-A4  | Message Rendering                | 14    | 3,136  | 10   | Store mutation inside JSX render IIFE                                                                                     |
| W4-A5  | Chat UI Chrome                   | 50    | 21,613 | 12   | CheckpointManager nested IPC object keys wrong                                                                            |
| W4-A6  | Chat Panels + Hooks              | 33    | 6,957  | 18   | 4 download handlers leak object URLs / detached anchors                                                                   |
| W4-A7  | Settings                         | 41    | 13,446 | 11   | Dead PrivacySettings component with hook violation                                                                        |
| W4-A8  | MCP + Browser + Agent + AGI      | 31    | 9,118  | 24   | MCPToolExplorer discards tool result (always undefined)                                                                   |
| W4-A9  | Execution + ToolCalling + Canvas | 42    | 11,700 | 16   | xterm escape injection from untrusted content                                                                             |
| W4-A10 | Components A-L                   | 73    | 18,100 | 11   | EmailWorkspace silently swallows all errors                                                                               |

### W4 Priority Fix Matrix

| #       | Severity | File                                     | Issue                                                                                                                                                                                | Fix                                                    |
| ------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 300     | CRITICAL | UnifiedAgenticChat/index.tsx             | Historical issue resolved: the old inline listener block is gone; current live listener overlap is limited to `agi:tool_stream` cancellation cleanup between the two canonical hooks | Fixed in live desktop runtime                          |
| 301     | CRITICAL | UnifiedAgenticChat/index.tsx             | Historical issue resolved: `agent_set_workflow_hash` is now invoked with `workflowHash`                                                                                              | Fixed in live desktop runtime                          |
| 370     | CRITICAL | MCP/MCPToolExplorer.tsx                  | Historical issue resolved: `handleExecuteTool` returns the awaited `McpClient.callTool()` result                                                                                     | Fixed in live desktop runtime                          |
| 302     | HIGH     | UnifiedAgenticChat/index.tsx             | Historical issue resolved: the old duplicate `useSendMessage` split path is gone; the live send path is the inline `handleSendMessage` in `index.tsx`                                | Fixed in live desktop runtime                          |
| 303     | HIGH     | ChatMessageList.tsx                      | Historical issue resolved: the chat UI now uses `RiskConfirmationDialog` instead of `window.confirm()`                                                                               | Fixed in live desktop runtime                          |
| 310     | HIGH     | ApprovalRequestCard.tsx                  | `onApprove` prop bypasses `pendingDecision` guard — double-click sends duplicate approvals                                                                                           | Set pendingDecision before calling external handler    |
| 311     | HIGH     | ToolRationaleDisplay.tsx                 | `showAlternatives` toggles chevron but no content renders on expand                                                                                                                  | Add conditional content block                          |
| 320     | HIGH     | InlineGitHub.tsx                         | `html_url` passed to href without `https?://` guard — javascript: URL injection                                                                                                      | Add protocol validation                                |
| 321     | HIGH     | InlineGitHub.tsx                         | CSS injection via `label.color` from GitHub API (no hex validation)                                                                                                                  | Validate hex format                                    |
| 330     | HIGH     | MessageBubble.tsx:713                    | `registerMcpApp()` store mutation inside JSX render IIFE — infinite loop risk                                                                                                        | Move to useEffect                                      |
| 331     | HIGH     | ThinkingBlock.tsx                        | Auto-collapse useEffect fires on mount for non-streaming messages, overrides defaultExpanded                                                                                         | Add isMountedRef guard                                 |
| 340     | HIGH     | CheckpointManager.tsx:98                 | Nested IPC object: `{ request: { conversationId } }` — Tauri only converts top-level keys                                                                                            | Flatten params or use snake_case inside nested objects |
| 341     | HIGH     | CheckpointManager.tsx:135                | Same nested IPC pattern for checkpoint_restore                                                                                                                                       | Same fix                                               |
| 350     | HIGH     | Sidecar/CodeCanvas.tsx                   | handleSave returns cleanup from useCallback but callers discard it — timeout leaks on unmount                                                                                        | Use useEffect with ref instead                         |
| 351     | HIGH     | Sidecar/DiffViewer.tsx                   | Mixed toast API (useToast vs sonner) — double-toasts or silent failures                                                                                                              | Switch to sonner                                       |
| 361     | HIGH     | PrivacySettings.tsx                      | Dead component (never imported); contains React Hook rule violation                                                                                                                  | Delete file                                            |
| 371     | HIGH     | AGI/ProgressIndicator.tsx                | Direct mutation of GoalData objects in setState updaters                                                                                                                             | Use spread copies                                      |
| 372     | HIGH     | AGI/IterationProgressPanel.tsx           | Direct mutation inside setState updater                                                                                                                                              | Spread into new object                                 |
| 380     | HIGH     | Execution/InteractiveTerminal.tsx        | xterm escape injection — raw error strings injected into terminal                                                                                                                    | Strip ANSI sequences                                   |
| 381     | HIGH     | Execution/TerminalPanel.tsx              | Same xterm escape injection from store-sourced strings                                                                                                                               | Strip ANSI sequences                                   |
| 382     | HIGH     | Canvas/ArtifactPreview.tsx               | iframe srcDoc with allow-scripts — intentional but undocumented XSS vector                                                                                                           | Document or strip allow-scripts                        |
| 390     | HIGH     | Communications/EmailWorkspace.tsx        | 4 catch blocks silently swallow errors — zero user feedback on failures                                                                                                              | Add toast.error                                        |
| 391     | HIGH     | Filesystem/FilesystemWorkspace.tsx       | Default path `C:\Users` hardcoded — crashes on macOS/Linux                                                                                                                           | Use Tauri homeDir()                                    |
| 305     | MEDIUM   | useTauriStreamListeners.ts               | toolExecutionTimeoutsRef cleared via snapshot copy, not live ref                                                                                                                     | Clear ref.current directly                             |
| 306     | MEDIUM   | index.tsx                                | `chat:tool-progress` uses raw tool name instead of normalizeToolNameForUi()                                                                                                          | Apply normalizer                                       |
| 307     | MEDIUM   | ChatMessageList.tsx                      | handleExport revokes URL synchronously before download begins                                                                                                                        | Wrap in setTimeout                                     |
| 308     | MEDIUM   | ChatStream.tsx                           | Stale searchQuery in isSearchMatch (debounce mismatch)                                                                                                                               | Use deferredSearchQuery                                |
| 312     | MEDIUM   | ToolTimeline.tsx                         | Cannot manually collapse while tools running (hasRunning overrides)                                                                                                                  | Track userForcedClosed state                           |
| 313     | MEDIUM   | ScreenshotCard.tsx                       | SVG overlay math is identity no-op; pixel coords mispositioned                                                                                                                       | Normalize coordinates                                  |
| 314     | MEDIUM   | ActiveToolStreams.tsx                    | Inline selectors create new arrays every render                                                                                                                                      | Use useShallow                                         |
| 315     | MEDIUM   | ToolCallCard.tsx                         | setInterval fires with no visible output when startedAt undefined                                                                                                                    | Guard with early return                                |
| 322-323 | MEDIUM   | InlineVoiceResult, InlineMediaGeneration | No URL validation on audio/video src attributes                                                                                                                                      | Add protocol check                                     |
| 324     | MEDIUM   | InlineDocumentGeneration.tsx             | Running check placed after null guard — spinner unreachable                                                                                                                          | Invert guard order                                     |
| 325     | MEDIUM   | InlineLSPResult.tsx                      | Definition click handler is permanent no-op                                                                                                                                          | Implement file open via Tauri                          |
| 326-329 | MEDIUM   | 4 InlineToolResults files                | Unhandled clipboard promises (6 instances)                                                                                                                                           | Add void or .catch()                                   |
| 332-333 | MEDIUM   | CodeBlock, MessageBubble                 | setTimeout with no cleanup ref — unmount leak                                                                                                                                        | Add cleanup ref                                        |
| 334     | MEDIUM   | MessageHeader.tsx                        | Subscribes to entire actionTrail array — all headers re-render                                                                                                                       | Select last entry only                                 |
| 335     | MEDIUM   | CodeBlock.tsx (top-level)                | Dead code — 270 lines, never imported                                                                                                                                                | Delete or consolidate                                  |
| 342     | MEDIUM   | Sidebar.tsx                              | loadConversationMessages silently skips when userId undefined                                                                                                                        | Add error feedback                                     |
| 343     | MEDIUM   | Sidebar.tsx                              | Markdown export: URL leak + DOM mutation on failure                                                                                                                                  | Add cleanup guard                                      |
| 344-345 | MEDIUM   | AudioPreview.tsx                         | Math.random shimmer + stale isPlaying closure                                                                                                                                        | Use seeded values + sync state                         |
| 346     | MEDIUM   | ChatInputToolbar.tsx                     | Dual-store write/read split — incognito toggle doesn't update UI                                                                                                                     | Fix store target                                       |
| 347     | MEDIUM   | ShareConversationDialog.tsx              | No timeout/AbortController on network fetch                                                                                                                                          | Add AbortController                                    |
| 352-356 | MEDIUM   | 5 files                                  | Detached-anchor + unrevoked-object-URL download pattern                                                                                                                              | Append to DOM, revoke after delay                      |
| 357     | MEDIUM   | Sidecar/DiffViewer.tsx                   | Diff-stat algorithm overcounts additions/deletions                                                                                                                                   | Use proper LCS diff                                    |
| 358     | MEDIUM   | hooks/useChatSubmit.ts                   | Stale isSending closure allows double-send                                                                                                                                           | Use useRef guard                                       |
| 359     | MEDIUM   | Widgets/DiffWidget.tsx                   | Duplicate DiffViewerWidgetData type definition                                                                                                                                       | Import from shared index                               |
| 360     | MEDIUM   | ApiKeysSettings.tsx                      | Historical issue resolved by removing an unreferenced duplicate API Keys settings component; live API Keys UX remains inline in `SettingsPanel.tsx`                                  | Removed dead duplicate surface                         |
| 362-365 | MEDIUM   | 3 Settings files                         | Historical issue resolved: settings/MCP async UI handlers now route through explicit callbacks or `void` wrappers instead of returning raw promises from React handlers              | Wrapped/normalized live handlers                       |
| 364     | MEDIUM   | MCPServerSettings.tsx                    | Historical issue resolved: port input is controlled from `mcpServerStore` and re-syncs when runtime config changes                                                                   | Controlled input + regression added                    |
| 373     | MEDIUM   | MCPCredentialManager.tsx                 | Historical issue resolved: OAuth callback now uses the locally stored verified state and rejects mismatches before calling the backend                                               | Fixed + regression added                               |
| 375-376 | MEDIUM   | BrowserDebugPanel.tsx                    | Historical issue resolved by removing an unmounted panel that only showed cosmetic mock data                                                                                         | Removed from live browser surface                      |
| 377     | MEDIUM   | BrowserRecorder.tsx                      | Historical issue resolved by removing an unmounted duplicate recorder UI; live recording remains in `browserStore` / `useBrowserAutomation`                                          | Removed duplicate UI surface                           |
| 378     | MEDIUM   | MCPToolExplorer.tsx                      | "View Schema" button has no onClick handler                                                                                                                                          | Add schema modal                                       |
| 379-384 | MEDIUM   | MCPServerManager, MCPConfigEditor        | Silent error swallowing, wrong save conditions                                                                                                                                       | Add toast.error, fix conditions                        |
| 383     | MEDIUM   | Execution/CheckpointManager.tsx          | formatDuration receives epoch timestamp instead of elapsed ms                                                                                                                        | Use Date.now() - ts                                    |
| 384     | MEDIUM   | ToolExecutionTimeline.tsx                | NaN% when totalSteps is 0                                                                                                                                                            | Guard division                                         |
| 385     | MEDIUM   | ToolApprovalDialog.tsx                   | onApprove not awaited — errors silently swallowed                                                                                                                                    | Add await + try/catch                                  |
| 386     | MEDIUM   | Editor/MonacoEditor.tsx                  | process.cwd() unavailable in Tauri WebView — falls back to '/'                                                                                                                       | Use settingsStore workspace root                       |
| 387     | MEDIUM   | ExecutionDashboard.tsx                   | AnimatePresence exit animation never fires                                                                                                                                           | Move null check above AnimatePresence                  |
| 392     | MEDIUM   | FileDropZone.tsx                         | handleRemoveFile doesn't notify parent via onFilesSelected                                                                                                                           | Call callback after removal                            |
| 393     | MEDIUM   | Auth/AuthForm.tsx                        | OAuth errors silently lost (no try/catch)                                                                                                                                            | Add error handling                                     |
| 394     | MEDIUM   | Governance (7 files)                     | 140+ raw Tailwind gray/white classes instead of design tokens                                                                                                                        | Systematic replacement                                 |
| 395     | MEDIUM   | Artifacts/ArtifactPanel.tsx              | getState() in render bypasses reactivity                                                                                                                                             | Load into state                                        |

### W4 Detailed Reports

## Wave 5: Frontend Components M-Z + Stores

**Total files audited:** 389 | **Total LOC:** ~224,421 | **Total bugs:** 55 (5 CRITICAL, 12 HIGH, 27 MEDIUM, 11 LOW)

| Agent  | Scope                   | Files | LOC     | Bugs | Key Issue                                                                                                                                                                            |
| ------ | ----------------------- | ----- | ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W5-A1  | Components M-S          | 61    | 17,500  | 4    | IPC violation in MessageComposer, ResearchPanel stale closure                                                                                                                        |
| W5-A2  | Components S-W          | 89    | 129,173 | 7    | TerminalAIAssistant unhandled promise, regex injection in TemplateInstaller                                                                                                          |
| W5-A3  | Chat Stores             | 7     | 5,700   | 3    | IPC snake_case violation in chatStore.ts (conversation_id, user_id)                                                                                                                  |
| W5-A4  | Settings + Auth Stores  | 9     | 6,200   | 6    | IPC violation in settingsStore, OAuth token plaintext in deviceLink                                                                                                                  |
| W5-A5  | Model + MCP Stores      | 6     | 2,050   | 8    | Historical issue resolved: `llmConfigStore` plan subscription now uses a guarded one-time initializer, and `mcpServerStore` exposes a real error field with a validated failure path |
| W5-A6  | Remaining Stores        | 44    | 13,400  | 5    | IPC snake_case in ui.ts error_report, unbounded history in apiStore                                                                                                                  |
| W5-A7  | Hooks                   | 56    | 18,500  | 5    | 5 IPC snake_case violations in useEmail/useCalendar, 3 direct @tauri-apps imports                                                                                                    |
| W5-A8  | lib + utils + services  | 54    | 14,900  | 4    | Unhandled Promise.allSettled in newChatReset, placeholder Supabase key                                                                                                               |
| W5-A9  | Types + Constants + API | 45    | 11,200  | 6    | 3 IPC snake_case violations in api/chat.ts, dead code in toolCalling.ts                                                                                                              |
| W5-A10 | Root + Config + Themes  | 18    | 5,798   | 7    | App.tsx startup race conditions, duplicate MSW handlers                                                                                                                              |

### W5 Priority Fix Matrix

| #       | Severity | File                              | Issue                                                                                                                                                                                                   | Fix                              |
| ------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 441     | CRITICAL | chat/chatStore.ts:568             | IPC snake_case: `conversation_id` and `user_id` instead of camelCase — breaks loadConversationMessages                                                                                                  | Change to conversationId, userId |
| 520     | CRITICAL | useEmail.ts                       | 5 IPC snake_case violations: account_id, from_folder, to_folder, reply_to, body_text, body_html                                                                                                         | Convert all to camelCase         |
| 521     | CRITICAL | useCalendar.ts                    | 4 IPC snake_case violations: account_id, calendar_id, event_id                                                                                                                                          | Convert to camelCase             |
| 560-562 | CRITICAL | api/chat.ts                       | 3 IPC command names use snake_case instead of camelCase                                                                                                                                                 | Convert to camelCase             |
| 580     | CRITICAL | test/msw-setup.ts                 | Duplicate POST handler for OpenAI endpoint — second handler unreachable                                                                                                                                 | Remove duplicate                 |
| 581     | CRITICAL | App.tsx                           | Historical issue resolved: desktop shell startup IIFE now catches outer bootstrap failures, routes listener setup through guarded startup steps, and cleans up delayed window-centering work on unmount | Fixed in live desktop runtime    |
| 442     | HIGH     | chat/chatStore.ts:1870            | Historical issue resolved: chatStore model subscription bootstrap is now guarded, manually invokable in tests, and no longer auto-initializes during Vitest teardown                                    | Fixed in live desktop runtime    |
| 460     | HIGH     | settingsStore.ts:752              | IPC: `set_agent_mode` param `{ mode }` should be `{ agentMode: mode }`                                                                                                                                  | Fix param name                   |
| 461     | HIGH     | deviceLinkStore.ts:99             | OAuth tokens persisted to localStorage without encryption                                                                                                                                               | Use secure store                 |
| 522-524 | HIGH     | useGit, useNotifications, useTeam | Direct @tauri-apps/api imports instead of tauri-mock shim                                                                                                                                               | Switch to tauri-mock             |
| 582     | HIGH     | App.tsx                           | Historical issue resolved: root auth bootstrap now guards imports/hydration with cancellation and catches async failures instead of leaking rejections after unmount                                    | Fixed in live desktop runtime    |
| 583     | HIGH     | handlers/slashCommandHandlers.ts  | Promise fire-and-forget in terminal commands without cleanup                                                                                                                                            | Add proper error handling        |
| 401     | HIGH     | Research/ResearchPanel.tsx        | Event listener unresolved promises — memory leak on unmount                                                                                                                                             | Await unlistens                  |
| 420     | HIGH     | TerminalAIAssistant.tsx           | Unhandled promise in smart commit flow                                                                                                                                                                  | Add .catch()                     |
| 421     | HIGH     | TemplateInstaller.tsx             | Unsafe regex in getRequiredParams — template injection possible                                                                                                                                         | Validate matched params          |
| 501     | HIGH     | ui.ts                             | IPC snake_case in error_report nested fields (error_type, stack_trace)                                                                                                                                  | Convert to camelCase             |
| 563-564 | HIGH     | types/toolCalling.ts              | Dead code: createToolStreamState() and updateToolStreamState() never imported                                                                                                                           | Remove exports                   |
| 400     | MEDIUM   | Messaging/MessageComposer.tsx     | Missing async error propagation in handleSendMessage                                                                                                                                                    | Add try/catch                    |
| 402     | MEDIUM   | Memory/MemoryManager.tsx          | URL not cleaned up in handleExport if click fails                                                                                                                                                       | Add cleanup                      |
| 403     | MEDIUM   | ROIDashboard.tsx                  | Poll interval continues after errors with no backoff                                                                                                                                                    | Add exponential backoff          |
| 422     | MEDIUM   | TeamInvitation.tsx                | Stale closure: currentUserId captured once                                                                                                                                                              | Use store inside handler         |
| 423     | MEDIUM   | VisionWorkspace.tsx               | Blob URL memory leak from capture commands                                                                                                                                                              | Track refs for cleanup           |
| 424     | MEDIUM   | TerminalWorkspace.tsx             | Race condition in initial session creation                                                                                                                                                              | Use useRef guard                 |
| 462     | MEDIUM   | billingUsage.ts                   | Circular dependency with auth.ts via useBillingStore import                                                                                                                                             | Decouple                         |
| 463     | MEDIUM   | authOrchestrator vs auth.ts       | Duplicate subscription cache logic with divergent implementations                                                                                                                                       | Consolidate                      |
| 464     | MEDIUM   | billingUsage.ts                   | Race condition between authOrchestrator and billingUsage concurrent updates                                                                                                                             | Add lock/debounce                |
| 483     | MEDIUM   | modelStore.ts                     | \_isEnforcingTier global guard with no timeout — potential deadlock                                                                                                                                     | Add timeout guard                |
| 485     | MEDIUM   | mcpStore.ts:227                   | Race condition in loadConfig — config and location out of sync                                                                                                                                          | Add await                        |
| 486     | MEDIUM   | modelStore.ts                     | HMR guard for plan-change listener — failed import leaves dangling listener                                                                                                                             | Fix cleanup                      |
| 502     | MEDIUM   | apiStore.ts                       | Unbounded history array growth                                                                                                                                                                          | Add configurable cap             |
| 540     | MEDIUM   | lib/newChatReset.ts               | Unhandled Promise in Promise.allSettled                                                                                                                                                                 | Check failures                   |
| 565     | MEDIUM   | constants/llm.ts                  | MODEL_METADATA weak type safety for dynamic model lookups                                                                                                                                               | Add validation                   |
| 584     | MEDIUM   | providers/ThemeProvider.tsx       | localStorage.getItem without SSR guard                                                                                                                                                                  | Add typeof check                 |
| 585     | MEDIUM   | TeamDashboard.tsx                 | Incomplete ErrorBoundary wrapping                                                                                                                                                                       | Fix tags                         |
| 586     | MEDIUM   | test/setup.ts                     | Overly broad unhandled rejection suppression                                                                                                                                                            | Narrow pattern                   |

## Wave 6: Cross-cutting Integration

**Agents:** 5 | **Integration bugs:** 20 | **Dead LOC:** ~16,786

| Agent | Scope                            | Key Finding                                                                                                     |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| W6-A1 | Chat Message Path (8 hops)       | Path is clean — all IPC camelCase correct, RAF batching works, but delta field never consumed (bandwidth waste) |
| W6-A2 | Tool Execution Path (7 hops)     | Pipeline is solid — parallel_group always None in streaming path, tool success/error semantics ambiguous        |
| W6-A3 | MCP Tool Path (8 hops)           | Well-secured with rate limiting + confirmation — tool ID parsing uses dual logic (hash IDs may break)           |
| W6-A4 | Dead Code Detection              | 73 unwired commands, 14 dead stores (3.3K LOC), 27 dead hooks (9.8K LOC), 1 dead type                           |
| W6-A5 | IPC Contract Audit (314 invokes) | 7 violations all in MessagingPanel.tsx, 2 event name mismatches, 2 missing commands                             |

### W6 Integration Bugs

| #       | Severity | Source        | Issue                                                                                     | Fix                                 |
| ------- | -------- | ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| 601     | MEDIUM   | W6-A1 Hop 5→6 | `chat:stream-chunk` emits `delta` but listener only uses `content` — bandwidth waste      | Use delta for incremental rendering |
| 602     | MEDIUM   | W6-A1 Hop 3   | `message_id` typed `string                                                                | number` — type looseness masks bugs | Declare strict `string` type |
| 620     | MEDIUM   | W6-A2 Hop 5→6 | `parallel_group` always None in streaming tool execution — no parallel visualization      | Pass executor context               |
| 621     | LOW      | W6-A2 Hop 6→7 | Stale tool stream entries leak if listener callback fails                                 | Add try-catch + TTL                 |
| 622     | LOW      | W6-A2 Hop 6   | resolveToolLabel fallback may show raw MCP base64 names                                   | Always compute display_name in Rust |
| 623     | MEDIUM   | W6-A2 Hop 4→5 | Tool success/error conflates execution success with tool-reported errors                  | Use structured result type          |
| 640     | HIGH     | W6-A3 Hop 4   | Tool ID parsing: command handler uses simplified split, mishandles hash-encoded IDs       | Use resolve_tool_id() from registry |
| 641     | MEDIUM   | W6-A3 Hop 6   | Tool result loses error metadata (type, code, tool_id) — generic error string only        | Extend return type with error codes |
| 680-682 | CRITICAL | W6-A5         | 3 IPC violations in MessagingPanel.tsx: connect_slack/whatsapp/teams nested snake_case    | Convert all to camelCase            |
| 683-684 | HIGH     | W6-A5         | 2 more IPC violations: discord/signal nested snake_case in MessagingPanel.tsx             | Convert to camelCase                |
| 685-686 | MEDIUM   | W6-A5         | messaging_send and messaging_get_history nested snake_case                                | Verify and fix                      |
| 687     | LOW      | W6-A5         | Event mismatch: `research:completed` (listener) vs `research:complete` (emitter)          | Standardize name                    |
| 689-690 | HIGH     | W6-A5         | `minimize_window` and `toggle_fullscreen` invoked but not registered in generate_handler! | Register or remove                  |

### Dead Code Registry

| Category              | Count   | Dead LOC    | Key Items                                                                  |
| --------------------- | ------- | ----------- | -------------------------------------------------------------------------- |
| Unwired Rust commands | 73      | ~3,650      | agi_submit_goal_parallel, cancel_agent, window_set_fullscreen, 70 more     |
| Dead stores           | 14      | 3,264       | billingStore, usageTrackingStore, tokenBudgetStore, authCoreStore, 10 more |
| Dead hooks            | 27      | 9,834       | useBrowserAutomation, useAgentLoopEvents, useMCP, useToolEvents, 23 more   |
| Dead types            | 1       | 38          | tauri.d.ts                                                                 |
| **TOTAL**             | **115** | **~16,786** |                                                                            |

---

## Executive Summary

### Audit Scope

Full codebase stabilization audit of AGI Workforce — a Tauri v2 desktop application (Rust backend + React/TypeScript frontend).

| Wave      | Scope                            | Files      | LOC          | Bugs    |
| --------- | -------------------------------- | ---------- | ------------ | ------- |
| W1        | Rust Critical Path               | 134        | 88,475       | 58      |
| W2        | Rust System + Data               | 384        | ~82,000      | 134     |
| W3        | Rust Features + Automation       | 299        | ~65,000      | 162     |
| W4        | Frontend Components A-M          | 331        | ~99,658      | 133     |
| W5        | Frontend Components M-Z + Stores | 389        | ~224,421     | 55      |
| W6        | Cross-cutting Integration        | N/A        | N/A          | 20      |
| **TOTAL** | **Full codebase**                | **1,537+** | **~559,554** | **562** |

**Dead code:** 16,786 LOC across 115 items (73 commands, 14 stores, 27 hooks, 1 type)

### Critical Issues (Must Fix Before Launch)

1. **387 `#[tauri::command]` functions still unregistered** (W2) — repo-wide IPC surface drift remains large
2. **Billing webhook pipeline broken** (W2) — truncated column name, broken retry, missing column
3. **Code editing path injection** (W2) — apply_changes writes to arbitrary paths, try_git_revert has command injection
4. **12+ IPC snake_case violations** (W5-W6) — email, calendar, chat, messaging commands silently send undefined
5. **MCP embedded server coverage still narrow** (W1) — embedded HTTP MCP server now executes built-in tools, but server-level coverage is still focused on JSON-RPC routing instead of full end-to-end app-handle execution
6. **xterm escape injection** (W4) — untrusted content injected into terminal without sanitization
7. **App.tsx startup races reduced** (W5) — shell/root bootstrap now use guarded async startup paths; remaining startup work should follow the same cancellation/error-handling pattern

### High-Impact Patterns

| Pattern                          | Occurrences | Impact                           |
| -------------------------------- | ----------- | -------------------------------- |
| IPC snake_case violations        | 20+         | Silent param failures            |
| Unhandled promises               | 15+         | Swallowed errors                 |
| Detached anchor / unrevoked URL  | 8+          | Download failures + memory leaks |
| Direct state mutation in React   | 5+          | Unpredictable renders            |
| Missing type="button" on buttons | 23+         | Accidental form submission       |
| Dead code (stores + hooks)       | 41 files    | 13K LOC maintenance burden       |
| Stale closures in hooks          | 8+          | Race conditions                  |

### Stabilization Roadmap

**Phase 1 — Critical Fixes (Week 1)**

- Fix all CRITICAL bugs (#1-10 above)
- Fix all IPC snake_case violations (mechanical find-replace)
- Wire useTauriStreamListeners.ts properly (delete duplicate in index.tsx)
- Register missing commands in generate_handler!

**Phase 2 — High Priority (Week 2)**

- Fix billing webhook pipeline (3 SQL bugs)
- Fix all unhandled promise chains
- Fix xterm escape injection
- Fix detached anchor download pattern (8 files)
- Add type="button" to all 23 buttons

**Phase 3 — Medium Priority (Week 3-4)**

- Fix stale closures and missing cleanup
- Fix direct state mutations
- Consolidate duplicate code (CodeBlock, DiffViewer, analytics)
- Wire dead stores or delete them

**Phase 4 — Dead Code Cleanup (Week 5)**

- Remove 73 unwired Rust commands or wire them
- Remove 27 dead hooks (9.8K LOC)
- Remove 14 dead stores (3.3K LOC)
- Remove dead components and types

**Phase 5 — Polish (Week 6)**

- Add ErrorBoundary wrappers to all panel components
- Replace raw Tailwind colors with design tokens (Governance, Settings)
- Improve test coverage (registry tests, integration tests)
- Document intentional security decisions (Canvas allow-scripts)

# Stabilization Sprint Report — 2026-03-16

## Summary

- **Total [LIVE] bugs at start**: 33
- **Verified already fixed** (re-tagged [HISTORICAL/STALE]): **18**
- **Fixed with code changes**: **6** (359 insertions, 56 deletions across 7 Rust files)
- **Total [LIVE] → [HISTORICAL] this session**: **24 (73%)**
- **Bugs remaining [LIVE]**: **9**
- **Build**: cargo check ✅ | pnpm typecheck ✅ | **CLEAN**

## Verified as Already Fixed (18)

| #   | Sev  | File                    | Why Already Fixed                                                                                           |
| --- | ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | HIGH | fallback_chain.rs       | record_rate_limit() on 429 + is_rate_limited() checked before each candidate                                |
| 2   | HIGH | thinking.rs             | Fully wired: ChatSendMessageRequest → resolve_thinking_parameter() → LLMRequest → OpenAI+Anthropic adapters |
| 11  | HIGH | extensions/manager.rs   | AES-256-GCM encrypt_sensitive_values(); auto-migrates legacy plaintext                                      |
| 28  | HIGH | provider_adapter.rs     | model_uses_responses_api() parses major version for gpt-5+                                                  |
| 31  | HIGH | executor.rs (AGI)       | tracing::warn! + execute_fallback_tool()                                                                    |
| 87  | HIGH | scheduler.rs            | 7-layer validate_shell_command() + allowlist + ToolGuard; 20+ tests                                         |
| 4   | MED  | capability_detection.rs | Double async timeout (5s); non-blocking                                                                     |
| 17  | MED  | registry.rs             | HashMap id_index with 3-tier resolve; benchmark tests                                                       |
| 22  | MED  | code_executor.rs        | MAX_CODE_LENGTH enforced at line 352; check_critical_patterns at line 366                                   |
| 37  | MED  | autonomous.rs           | MAX_LOOP_ITERATIONS=100; configurable per-agent                                                             |
| 36  | MED  | core.rs (AGI)           | Documented as intentional (sync callers, clone-and-release)                                                 |
| 42  | LOW  | undo_manager.rs         | O_CREAT\|O_EXCL for create; direct remove for delete                                                        |
| 23  | LOW  | mcp_tools.rs            | Configurable per-call via timeout_ms; 120s default, 300s max                                                |
| 6   | LOW  | server_tools.rs         | Actively used by provider_adapter.rs                                                                        |
| 7   | LOW  | background_manager.rs   | Uses tokio::sync::Notify                                                                                    |
| 8   | LOW  | prompt_policy.rs        | scan_request() has early-break; comprehensive tests                                                         |
| 44  | LOW  | api_tools_impl.rs       | Used by api_executor.rs                                                                                     |
| 45  | LOW  | background_tasks.rs     | Used by lib.rs, autonomous.rs, agi_checkpoint.rs                                                            |

## Code Fixes Applied (6)

| #   | Sev  | File                             | Fix                                                               | Lines   |
| --- | ---- | -------------------------------- | ----------------------------------------------------------------- | ------- |
| 12  | HIGH | installer.rs + mcp_extensions.rs | Per-file extraction progress + app_handle wiring                  | +24     |
| 13  | HIGH | executor.rs (MCP)                | ToolGuard validation before bash execution; degraded mode warning | +31     |
| 16  | MED  | transport.rs                     | read_timeout(60s) on SSE client                                   | +17/-6  |
| 35  | MED  | core.rs (AGI)                    | Removed duplicate LearningSystem::new() + dead comments           | -11     |
| 39  | MED  | code_generator.rs                | Returns Err(anyhow!) instead of empty Vec                         | +41/-15 |
| 68  | MED  | dm_protection.rs                 | Config+allowlist persisted to JSON; 4 new tests                   | +243    |

```
7 Rust files changed: 359 insertions(+), 56 deletions(-)
1 docs file: FULL_AUDIT.md (24 tag updates)
```

## Remaining [LIVE] (9)

### CRITICAL — Needs dedicated implementation sprint

| #   | File                 | Issue                   | Effort                                   |
| --- | -------------------- | ----------------------- | ---------------------------------------- |
| 25  | providers/bedrock.rs | NOT IMPLEMENTED         | L — needs aws-sigv4 crate + Converse API |
| 26  | provider_adapter.rs  | Bedrock → wrong adapter | L — depends on #25                       |

### HIGH — Architectural debt

| #   | File                   | Issue                             | Effort                                                   |
| --- | ---------------------- | --------------------------------- | -------------------------------------------------------- |
| 19  | DUPLICATION            | Two parallel tool execution paths | L — chat uses tool_executor, agents use ExecutorRegistry |
| 33  | continuous_executor.rs | 1,718 LOC dead code               | S — types used by tests; #![allow(dead_code)]            |

### MEDIUM — Feature gaps

| #   | File                  | Issue                               | Effort |
| --- | --------------------- | ----------------------------------- | ------ |
| 5   | memory_integration.rs | Memory not injected in chat path    | M      |
| 38  | approval.rs           | Two approval systems not integrated | M      |
| 40  | rag_system.rs         | Embedding fields always None        | M      |
| 41  | semantic_search.rs    | TF-IDF only, embeddings unused      | M      |

### LOW

| #   | File                   | Issue                      | Effort            |
| --- | ---------------------- | -------------------------- | ----------------- |
| 43  | continuous_executor.rs | progress_percent hardcoded | M (linked to #33) |

## Recommendations

### Priority 1 (Next Sprint)

1. **Bedrock (#25/#26)** — Add `aws-sdk-bedrockruntime`; unlocks AWS enterprise users
2. **Tool Executor Dedup (#19)** — Designate `agi/executors/` as canonical; shim `llm/tool_executor/`

### Priority 2

3. **Memory in Chat (#5)** — Wire memory context injection into send_message path
4. **RAG Activation (#40/#41)** — Wire existing embeddings into semantic_search

### Process

5. **Audit Hygiene** — 55% of [LIVE] bugs were already fixed. Run verification pass after every fix sprint.

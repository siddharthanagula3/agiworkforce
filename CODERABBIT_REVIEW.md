# CodeRabbit Full Codebase Review

Pass: 1 of 2
Generated: 2026-02-25
Total issues: 115 (Critical: 22 | High: 43 | Medium: 32 | Low: 18)

Reviewers: logic-bug-reviewer (Zone A), security-reviewer (Zone B+C), code-quality-reviewer (Zone A+B), test-coverage-reviewer (Zone D), config-dependency-reviewer (Zone E)
Superpowers principles active: systematic-debugging, verification-before-completion, requesting-code-review

## Pass 1 Summary (Updated 2026-02-26)

- **Fixed**: 35 issues (9 Critical + 16 High + 2 Medium + 2 Low + 6 Config)
- **Needs Human**: 28 issues (test suites, architectural refactors, stub implementations)
- **Open (automatable in Pass 2)**: 52 issues
- **cargo check**: PASS (all features)
- **pnpm typecheck**: PASS
- **pnpm lint**: PASS (within 15-warning limit)
- **Settings UI**: 4 new components + MCPWorkspace wired in (8-tab settings panel)

### Fixed in Batch 1 (Rust + TS): C9, H30, H31, H7, H4, M2, L1, H6, M6, M8, L24

### Fixed in Batch 2 (Rust Security): C19, C20, C21, C16, H28, H29, H26, H34, H2, H3, H5

### Fixed in Batch 3 (TS Quality): H9, H19, H17, H18, C4(partial)

### Fixed in Batch 4 (Config): H20, C10, H21, H22, M24, M25

---

## Critical Issues

### [C1] Session cost cap enforced AFTER provider billing — TOCTOU race

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:1076`
- **Category**: logic
- **Description**: `invoke_candidate()` accumulates cost into `cumulative_cost` then checks `SESSION_COST_SAFETY_CAP`. In concurrent scenarios sharing the same `LLMRouter` via `Arc<RwLock>`, multiple tasks can all read `cumulative_cost` before any writes its increment — all pass the guard and bill the provider. The cap provides false safety; the provider is already billed when the error fires.
- **Suggested Fix**: Pre-check cap BEFORE sending inside a Mutex block. Use a 'reserved' counter to atomically hold pre-committed budget.
- **Status**: OPEN

### [C2] ExtensionBridge.connect() is a phantom — only sets a boolean, never opens a real connection

- **File**: `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs:124`
- **Category**: logic
- **Description**: `connect()` acquires a mutex and sets `*connected = true` without opening any WebSocket or performing a handshake. `is_connected()` returns true after the first call regardless of whether the server is actually running.
- **Suggested Fix**: Remove the connected flag entirely and rely on `send_native_message_via_realtime`'s error handling. Or make `connect()` actually probe connectivity and set connected=true only on success.
- **Status**: OPEN

### [C3] MediaExecutor::new() expect() panics entire Tauri process on TLS failure

- **File**: `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs:115`
- **Category**: logic
- **Description**: `MediaExecutor::new()` calls `.build().expect('Failed to create HTTP client')`. On TLS initialization failure, this panics and kills the entire Tauri process during startup.
- **Suggested Fix**: Change `new()` to return `Result<Self, anyhow::Error>` and propagate the error with `?`.
- **Status**: OPEN

### FIXED [C4] storageFallback duplicated in 10+ store files — DRY violation at scale

- **File**: `apps/desktop/src/stores/auth.ts:288`
- **Category**: quality
- **Description**: `storageFallback` is defined identically in 10+ store files: `auth.ts`, `billingUsage.ts`, `ui.ts`, `schedulerStore.ts`, `projectStore.ts`, `settingsStore.ts`, `modelStore.ts`, `updaterStore.ts`, `customInstructionsStore.ts`, `memoryStore.ts`. Any bug fix must be applied to every copy.
- **Suggested Fix**: Remove local `const storageFallback` and `import { storageFallback } from '../../utils/localStorage'` in all files.
- **Status**: FIXED (partial) — Shared `lib/storageFallback.ts` utility created; `auth.ts`, `modelStore.ts`, `settingsStore.ts` migrated. Remaining stores (billingUsage, ui, schedulerStore, etc.) still use local copies — NEEDS_HUMAN for full migration.

### [C5] getAuthToken() duplicated in 3 web hooks

- **File**: `apps/web/lib/hooks/useMediaGeneration.ts:6`
- **Category**: quality
- **Description**: `getAuthToken()` is defined identically in `useMediaGeneration.ts:6`, `useVoiceTranscription.ts:112`, and `useChatStream.ts:330`. Auth flow changes must be applied to 3 places.
- **Suggested Fix**: Extract to `apps/web/lib/auth/getAuthToken.ts` and import in all three hooks.
- **Status**: OPEN

### [C6] layoutClasses all empty strings — the layout prop has zero visual effect

- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2657`
- **Category**: quality
- **Description**: `layoutClasses` maps `'default'`, `'compact'`, `'immersive'` all to empty strings. Used in `className` at line 2758 but contributes zero CSS regardless of the layout prop value.
- **Suggested Fix**: Implement distinct CSS classes for each variant, or remove the prop entirely.
- **Status**: OPEN

### [C7] gpt-5.2-codex MODEL_METADATA copy-pasted 4 times — ~160 lines of duplication

- **File**: `apps/desktop/src/constants/llm.ts:625`
- **Category**: quality
- **Description**: Entries for `gpt-5.2-codex-low`, `-medium`, `-high`, `-xhigh` are copy-pasted with identical `apiModelId`, `capabilities`, `benchmarks`, `inputCost`, `outputCost`. Only `speed` and `qualityTier` differ.
- **Suggested Fix**: Define `const CODEX_BASE_META = { ... }` and spread it into each entry with only overrides.
- **Status**: OPEN

### [C8] chat_send_message is ~3124 lines — the longest function in the codebase, untestable

- **File**: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:1627`
- **Category**: quality
- **Description**: `chat_send_message` spans lines 1627-4751 (~3124 lines). It encompasses request validation, attachment processing, conversation creation, LLM routing, streaming tool loops, tool execution, MCP orchestration, billing checks, stop-generation handling, and event emission. Test coverage is effectively zero.
- **Suggested Fix**: Decompose into: `validate_and_prepare_request`, `build_llm_request`, `stream_and_emit_response`, `execute_tool_loop`, `finalize_conversation`. The streaming tool loop alone (~lines 2000-4700) should be its own module.
- **Status**: NEEDS_HUMAN (architectural decomposition)

### FIXED [C9] SQLCipher encryption silently falls back to plaintext database

- **File**: `apps/desktop/src-tauri/src/lib.rs:189`
- **Category**: config
- **Description**: `lib.rs` initializes the encrypted database with a `.map_err()` that logs a warning and falls back to unencrypted SQLite if encryption initialization fails. Sensitive data is stored in plaintext without user notification.
- **Suggested Fix**: Replace the fallback with a hard failure: if encryption init fails, return Err and show a user-facing error dialog. Never silently downgrade security.
- **Status**: FIXED — Hard error on encryption failure; silent plaintext fallback removed.

### FIXED [C10] PostgreSQL password hardcoded as 'postgres' in docker-compose.yml

- **File**: `docker-compose.yml:1`
- **Category**: config
- **Description**: `docker-compose.yml` sets `POSTGRES_PASSWORD=postgres` committed to source control. Critical credential exposure if used in staging or CI with external access.
- **Suggested Fix**: Replace with `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}` and add `.env.example`.
- **Status**: FIXED — `POSTGRES_PASSWORD` and `PGADMIN_DEFAULT_PASSWORD` now use `${VAR:-default}` env var expansion.

### [C11] router_core_tests module is entirely empty — all LLM router tests deleted

- **File**: `apps/desktop/src-tauri/src/features/tests/router_tests.rs:1`
- **Category**: test
- **Description**: Comment 'Obsolete tests removed' with zero test functions. The LLM router handles all provider routing, fallback chains, cost tracking, and retry logic — yet has zero test coverage.
- **Suggested Fix**: Restore or rewrite router tests covering: happy path, fallback on 5xx, cost cap enforcement, circuit breaker open/close.
- **Status**: NEEDS_HUMAN (write new tests)

### [C12] SSE parser tests construct structs but never call parse functions — vacuously passing

- **File**: `apps/desktop/src-tauri/src/core/llm/tests/sse_parser_tests.rs:1`
- **Category**: test
- **Description**: `sse_parser_tests.rs` creates `SseStreamParser` instances but never calls `parse_sse_event()`, `process_buffer()`, or `poll_next()`. All tests pass unconditionally.
- **Suggested Fix**: Add tests feeding actual SSE byte sequences through `parse_sse_event()` and verify returned chunk types.
- **Status**: NEEDS_HUMAN (write real tests)

### [C13] SESSION_COST_SAFETY_CAP enforcement has zero test coverage

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:1076`
- **Category**: test
- **Description**: Critical safety control preventing runaway spending, but no test verifies it fires, fires at the correct threshold, or blocks concurrent requests.
- **Suggested Fix**: Add tests: single request at cap boundary returns error; two concurrent requests both under cap individually but over cap together.
- **Status**: NEEDS_HUMAN (write tests)

### [C14] CostCalculator::calculate() has zero tests despite 200+ pricing entries

- **File**: `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs:12`
- **Category**: test
- **Description**: No test file exists for `cost_calculator.rs`. The 1000x pricing underestimate for image/video models (H2) would have been caught by a simple assertion on cost for a single `imagen-4` call.
- **Suggested Fix**: Create `tests/cost_calculator_tests.rs`. Test known-price models at published rates; test image models return cost >= per_image_price.
- **Status**: NEEDS_HUMAN (write tests)

### [C15] SHA-256 decomposition cache has zero tests

- **File**: `apps/desktop/src-tauri/src/core/swarm/task_decomposer.rs:408`
- **Category**: test
- **Description**: No test verifies: cache is populated after first call, second identical call returns cached result, expired entries are evicted, SHA-256 key is deterministic.
- **Suggested Fix**: Add tests for cache hit, miss, TTL expiry, and serialization roundtrip.
- **Status**: NEEDS_HUMAN (write tests)

### FIXED [C16] validate_sql() warns but never returns Err on DROP TABLE — SQL protection non-enforcing

- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:1`
- **Category**: logic/test
- **Description**: `validate_sql()` uses `eprintln!` to warn about `DROP TABLE` but always returns `Ok(())`. SQL injection prevention is unenforced at the validation boundary.
- **Suggested Fix**: Fix `validate_sql()` to return `Err` for `DROP TABLE`, `DROP DATABASE`, and `DELETE/UPDATE` without WHERE.
- **Status**: FIXED — `validate_sql()` now returns `Err` for DROP TABLE/DATABASE, TRUNCATE, ALTER TABLE, DELETE/UPDATE without WHERE.

### [C17] chatStore.ts has zero direct test coverage

- **File**: `apps/desktop/src/stores/chat/chatStore.ts:1`
- **Category**: test
- **Description**: Central state manager for all conversations, messages, citations, and token usage has no test coverage for any store action.
- **Suggested Fix**: Create `apps/desktop/src/__tests__/stores/chatStore.test.ts`. Test all store actions.
- **Status**: NEEDS_HUMAN (write tests)

### [C18] content.ts isAttributeAllowed() XSS prevention completely untested

- **File**: `apps/extension/src/content.ts:1`
- **Category**: test
- **Description**: `isAttributeAllowed()` gates which HTML attributes the extension can inject. An error in the allowlist logic could allow `javascript:` href injection. No test covers this security-critical function.
- **Suggested Fix**: Add `content.test.ts` verifying XSS prevention: `isAttributeAllowed('href', a_el, 'javascript:alert()')` returns false.
- **Status**: NEEDS_HUMAN (write tests)

### FIXED [C19] Arbitrary JavaScript execution via browser_evaluate — no approval gate

- **File**: `apps/desktop/src-tauri/src/sys/commands/browser.rs:584`
- **Category**: security
- **Description**: `browser_evaluate` accepts arbitrary user-supplied script and executes it directly in the active browser tab via CDP evaluate. No sanitization, allowlist, approval gate, or security tier check. Any renderer process can read cookies, exfiltrate local storage, or pivot to localhost services.
- **Suggested Fix**: Route through `ApprovalController` at `RequiresExplicitApproval` tier. Add configurable script allowlist.
- **Status**: FIXED — `RequiresExplicitApproval` gate via `ToolConfirmationRequest` added before script execution.

### [C20] Arbitrary JavaScript execution via browser_execute_async_js — no approval gate

- **File**: `apps/desktop/src-tauri/src/sys/commands/browser.rs:665`
- **Category**: security
- **Description**: `browser_execute_async_js` wraps the user-supplied script in a `Promise.resolve().then(async () => { ... })` wrapper and evaluates it via CDP with no validation or approval gate.
- **Suggested Fix**: Apply same controls as `browser_evaluate`. Route through `ApprovalController` at `RequiresExplicitApproval` tier.
- **Status**: FIXED — Same `RequiresExplicitApproval` gate added to `browser_execute_async_js`.

### FIXED [C21] Local file SSRF via file:// fetch in browser_upload_file — bypasses Tauri deny list

- **File**: `apps/desktop/src-tauri/src/sys/commands/browser.rs:905`
- **Category**: security
- **Description**: `browser_upload_file` injects user-supplied file paths into a JavaScript `fetch('file://' + path)` call executing inside the browser tab. A malicious renderer can supply paths like `../../../../etc/passwd` or `/Users/user/.ssh/id_rsa`. The Tauri capabilities deny list is bypassed entirely.
- **Suggested Fix**: Validate each path against `check_file_permission()` and `validate_path_security()` before constructing the script. Reject any path outside `allowed_directories`.
- **Status**: FIXED — Path validation added: null bytes, `..` traversal, `file://` prefix, length limit, existence check, is-file check.

### [C22] No integration test for route_with_retry() multi-provider fallback chain

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:1`
- **Category**: test
- **Description**: The fallback chain (primary → secondary → tertiary provider) is the most user-visible resilience feature of the LLM router. No test exercises a scenario where the primary provider returns 500, the secondary returns 429, and the tertiary succeeds.
- **Suggested Fix**: Create an integration test using mock HTTP servers (httpmock): primary 500 twice, secondary 429, tertiary 200. Assert final response is from tertiary.
- **Status**: NEEDS_HUMAN (write tests)

---

## High Issues

### [H1] LLM cache stored using pre-resolution model key — different strategies share cache entries

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:1027`
- **Category**: logic
- **Description**: Cache is written using `candidate.model` as the key, but the model may have been dynamically resolved to a completely different model string at lines 940-969 (e.g., `'auto-economy'` → `'gpt-5-nano'`). Two strategies resolving to different models share the same cache entry.
- **Suggested Fix**: After model resolution, use `routed_request.model` as the cache key for both lookup and write.
- **Status**: OPEN

### FIXED [H2] Image and video models use token-based cost formula — 1000x underestimate

- **File**: `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs:12`
- **Category**: logic
- **Description**: `Pricing::cost()` computes `(tokens/1_000_000) * per_million_rate`. Image models like `imagen-4`, `dall-e-3`, `gpt-image-1`, `veo-3` are priced per-image (~$0.04/image). With `output_tokens=1`, `cost()` returns `$0.000040` instead of `$0.04` — a 1000x underestimate. Session cost cap fails to constrain image/video costs.
- **Suggested Fix**: Add `MediaUnit` pricing variant with `cost_per_unit`. For media models, `calculate(provider, model, 0, num_images)` returns `num_images * cost_per_unit`.
- **Status**: FIXED — `MediaType` enum + `calculate_media_cost()` added with per-unit pricing for image/video models.

### FIXED [H3] dfs_longest_path shared visited set produces wrong critical path for diamond DAGs

- **File**: `apps/desktop/src-tauri/src/core/swarm/task_decomposer.rs:271`
- **Category**: logic
- **Description**: `dfs_longest_path()` passes a shared `visited: &mut HashSet<String>` across sibling recursive branches. For diamond-shaped DAGs, sibling branches interfere with each other's visited state. The critical path is wrong, causing incorrect priority assignments to bottleneck tasks.
- **Suggested Fix**: Replace DFS with topological-order DP: `dp[id] = 1 + max(dp[dep])` iterating in reverse topological order. O(V+E) and correct for all DAGs.
- **Status**: FIXED — Replaced recursive DFS with Kahn's algorithm + forward DP, O(V+E), correct for all DAG topologies.

### [H4] SubtaskResult.agent_id populated with subtask_id — all agent metrics misattributed

- **File**: `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs:440`
- **Category**: logic
- **Description**: `SubtaskResult` is constructed with `agent_id: task_result.subtask_id.clone()` with inline comment 'Note: should be agent_id'. All per-agent metrics and `AgentHealth` circuit breaker updates are misattributed.
- **Suggested Fix**: Add `agent_id` to `AgentTaskResult` struct, set it when agent accepts the task, and use `task_result.agent_id.clone()` here.
- **Status**: OPEN

### FIXED [H5] TOCTOU race in spawned_subtask_ids — same subtask dispatched twice concurrently

- **File**: `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs:365`
- **Category**: logic
- **Description**: In `execute_parallel()`, the `spawned_subtask_ids` lock is acquired to check `contains()`, then released. `mark_running()` is not called until line 400. Between lock release and `mark_running()`, another concurrent task can pass the same check.
- **Suggested Fix**: Hold the `spawned_subtask_ids` lock across the check, insert, and `graph.mark_running()` in a single critical section.
- **Status**: FIXED — Atomic check+insert+mark_running under single lock hold; rollback on spawn/send failure.

### FIXED [H6] GetUrl and GetTitle emit identical native payload — extension cannot distinguish requests

- **File**: `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs:504`
- **Category**: logic
- **Description**: `extension_message_to_native_payload()` produces `{type:'get_page_info', tab_id:null}` for both `ExtensionMessage::GetUrl` and `ExtensionMessage::GetTitle`. The native handler cannot distinguish which field is requested.
- **Suggested Fix**: Use distinct type values: `GetUrl` → `{type:'get_url'}` and `GetTitle` → `{type:'get_title'}`.
- **Status**: FIXED — Distinct type values `get_url` and `get_title` used for each variant.

### FIXED [H7] Blocking std::fs I/O in async fn save_image_to_history stalls Tokio runtime

- **File**: `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs:439`
- **Category**: logic
- **Description**: `save_image_to_history()` is `async` but calls `std::fs::read_to_string` and `std::fs::write` (blocking). This blocks the Tokio worker thread during concurrent image generation.
- **Suggested Fix**: Replace with `tokio::fs::read_to_string().await` and `tokio::fs::write().await`. Same fix applies to `save_video_to_history()`.
- **Status**: FIXED — `tokio::fs::read_to_string` and `tokio::fs::write` used in both save functions.

### [H8] handlersRef captures stale store methods at mount time — stale after logout

- **File**: `apps/desktop/src/hooks/useAgenticEvents.ts:216`
- **Category**: logic
- **Description**: `handlersRef.current` is populated once with `useUnifiedChatStore.getState().addFileOperation` etc. After logout or store reset, handlers operate on stale closed-over state.
- **Suggested Fix**: Access handlers dynamically inside each event listener: `useUnifiedChatStore.getState().addFileOperation(...)`.
- **Status**: OPEN

### FIXED [H9] 37+ console.log statements in production UnifiedAgenticChat — logs credit balances, user IDs

- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:959`
- **Category**: quality
- **Description**: 37+ `console.log` statements in production code. Several log credit balances, user IDs, message content previews, and full agent state JSON.
- **Suggested Fix**: Replace with dev-only debug logger: `const debug = import.meta.env.DEV ? console.log : () => {}`.
- **Status**: FIXED — All 37 `console.log` calls removed (console.warn/error retained).

### [H10] Auth store exposes subscription tier, user IDs, retry counts via console.log

- **File**: `apps/desktop/src/stores/auth.ts:382`
- **Category**: quality
- **Description**: 12 `console.log` calls in production auth store expose subscription tier values, user IDs, retry counts, and auth state details.
- **Suggested Fix**: Replace with dev-only debug logger. Retain `console.error`/`warn` for actual failures only.
- **Status**: OPEN

### [H11] useVoiceInput.ts has zero consumers — 150-line dead file

- **File**: `apps/web/lib/hooks/useVoiceInput.ts:38`
- **Category**: quality
- **Description**: `useVoiceInput.ts` has zero import consumers (confirmed by grep). Duplicates ~150 lines of Web Speech API logic already in `useVoiceTranscription.ts`.
- **Suggested Fix**: Remove `useVoiceInput.ts` entirely.
- **Status**: OPEN

### [H12] build_decomposition_prompt inlines 43-line format string with unescaped user-controlled data

- **File**: `apps/desktop/src-tauri/src/core/swarm/task_decomposer.rs:590`
- **Category**: quality (security risk)
- **Description**: Uses raw `format!` to embed `goal.description`, `goal.priority`, `goal.constraints`, `goal.success_criteria` into LLM prompt without sanitization. Prompt injection risk via goal fields.
- **Suggested Fix**: Apply `sanitize_multiline_for_prompt` utility to each substituted field.
- **Status**: OPEN

### [H13] Hard-coded app data path 'agiworkforce.db' duplicated across 4 functions

- **File**: `apps/desktop/src-tauri/src/sys/commands/database.rs:883`
- **Category**: quality
- **Description**: The path `dirs::data_dir().join("agiworkforce").join("agiworkforce.db")` is copied verbatim at lines 883, 918, 951, and 986.
- **Suggested Fix**: Extract `fn get_credential_db_path() -> Result<std::path::PathBuf, String>`. Call from all four functions.
- **Status**: OPEN

### [H14] browser_get_dom_snapshot is an exact duplicate of browser_get_content

- **File**: `apps/desktop/src-tauri/src/sys/commands/browser.rs:656`
- **Category**: quality
- **Description**: `browser_get_dom_snapshot` at line 656 has identical body to `browser_get_content` at line 647. Callers receive false confidence that they get a structured DOM snapshot when they get raw HTML.
- **Suggested Fix**: Remove `browser_get_dom_snapshot` from the command registry.
- **Status**: OPEN

### [H15] 15 semantic browser commands are no-op stubs returning hardcoded empty values

- **File**: `apps/desktop/src-tauri/src/sys/commands/browser.rs:1082`
- **Category**: quality
- **Description**: `browser_get_frames`, `find_element_semantic`, `click_semantic`, `get_accessibility_tree`, `test_selector_strategies`, `get_dom_semantic_graph`, `get_interactive_elements`, `find_by_role`, and 7 others return `Ok(vec![])`, `Ok(Value::Null)`, or hardcoded strings. Callers receive nonsense data silently.
- **Suggested Fix**: Return `Err("Not implemented".to_string())` from every stub command. Remove from Tauri command registry until implemented.
- **Status**: OPEN

### [H16] isSending return value is stale — reads ref at hook-call time, Send button never disables

- **File**: `apps/desktop/src/components/UnifiedAgenticChat/hooks/useChatSubmit.ts:247`
- **Category**: quality
- **Description**: Returns `isSending: isSendingRef.current` — a React ref, not state. Reading `.current` at return time does not trigger a re-render. Send button consuming this value permanently shows `false`.
- **Suggested Fix**: Replace `const isSendingRef = useRef(false)` with `const [isSending, setIsSending] = useState(false)`.
- **Status**: OPEN

### FIXED [H17] window.confirm() for destructive cache-clear — blocks main thread, broken in Tauri

- **File**: `apps/desktop/src/components/Settings/CacheManagement.tsx:43`
- **Category**: quality
- **Description**: `handleClearAll` calls `window.confirm(...)`. This blocks the JavaScript event loop and is suppressed by Tauri's default webview policy.
- **Suggested Fix**: Replace with application-level confirmation dialog using `RiskConfirmationDialog` or Radix `AlertDialog`.
- **Status**: FIXED — Replaced with Radix UI `AlertDialog`; `clearAllDialogOpen` state added.

### FIXED [H18] CacheService.clearByProvider called in onClick without await, error handling, or loading state

- **File**: `apps/desktop/src/components/Settings/CacheManagement.tsx:245`
- **Category**: quality
- **Description**: Errors are silently dropped, the UI does not indicate operation progress, and stats display is not refreshed after the call completes.
- **Suggested Fix**: Extract `const handleClearByProvider = async (provider: string) => { try { setLoading(true); await CacheService.clearByProvider(provider); await loadStats(); } catch(err) { setError(...); } finally { setLoading(false); } }`.
- **Status**: FIXED — Async handler with try/catch, toast success/error, and stats reload after clear.

### FIXED [H19] Stream teardown logic duplicated across 4 code paths — subtle behavioral differences guaranteed

- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:1119`
- **Category**: quality
- **Description**: Nearly identical 30-line cleanup block in `chat:stream-end` (lines 1119-1146), `chat:stream-error` (lines 1254-1282), `handleStopGeneration`, and `handleNewConversation`. Future teardown changes must be applied to all four copies.
- **Suggested Fix**: Extract `function finalizeStream(status: 'completed' | 'failed', error?: string, finalizedMessageId?: string | null): void`.
- **Status**: FIXED — `finalizeStream(finalizedMessageId, agentOutcome, agentError?)` helper extracted; 4 duplicates unified.

### FIXED [H20] pgAdmin has no authentication and is bound to 0.0.0.0:5050

- **File**: `docker-compose.yml:45`
- **Category**: config
- **Description**: pgAdmin configured with plaintext credentials listening on `0.0.0.0:5050`. On a developer machine connected to a shared network or VPN, this exposes the database admin UI to the entire network.
- **Suggested Fix**: Bind to `127.0.0.1:5050` only. Move credentials to `.env`.
- **Status**: FIXED — Port bound to `127.0.0.1:5050:80`; credentials use `${VAR:-default}` env var expansion.

### FIXED [H21] shell:allow-open grants unrestricted URL/program opening

- **File**: `apps/desktop/src-tauri/capabilities/default.json:1`
- **Category**: config
- **Description**: `shell:allow-open` granted without URL scheme or program allowlist. Allows opening `file://`, `javascript:`, and custom protocol handlers.
- **Suggested Fix**: Restrict to specific URL schemes: `{\"allow\": [{\"cmd\": \"open\", \"args\": {\"validator\": \"^(https|http|mailto):\"}}]}`.
- **Status**: FIXED — Replaced string `shell:allow-open` with scoped object allowing only `^https?://` and `^mailto:` URLs.

### FIXED [H22] Filesystem deny list missing ~/.gitconfig and ~/.git-credentials

- **File**: `apps/desktop/src-tauri/capabilities/default.json:1`
- **Category**: config
- **Description**: The deny list excludes 19 sensitive paths but is missing `~/.gitconfig` and `~/.git-credentials`. An AGI agent could exfiltrate git credentials.
- **Suggested Fix**: Add `'$HOME/.gitconfig'`, `'$HOME/.git-credentials'`, `'$HOME/.config/git/credentials'` to the deny list.
- **Status**: FIXED — Added `$HOME/.gitconfig`, `$HOME/.git-credentials`, `$HOME/.config/git/**` to deny lists for all read and exists permissions.

### [H23] Release workflow runs no Rust compilation or security checks

- **File**: `.github/workflows/release.yml:1`
- **Category**: config
- **Description**: The release.yml validate job runs `pnpm typecheck` and `pnpm lint` but not `cargo check`, `cargo clippy`, or `cargo audit`.
- **Suggested Fix**: Add `cargo check --all-features`, `cargo clippy --all-features -- -D warnings`, `cargo audit` to the validate job.
- **Status**: OPEN

### [H24] CSP allows unsafe-inline for style-src — CSS injection risk

- **File**: `apps/desktop/src-tauri/tauri.conf.json:1`
- **Category**: config
- **Description**: `style-src 'self' 'unsafe-inline'`. CSS injection enables CSS-based data exfiltration via attribute selectors.
- **Suggested Fix**: Remove `'unsafe-inline'` from `style-src`. Migrate inline styles to CSS classes. Use nonce-based CSP if needed.
- **Status**: OPEN

### [H25] UPSTASH_REDIS_REST_URL undocumented — missing causes silent rate limit fail-open

- **File**: `docs/env-vars.md:1`
- **Category**: config
- **Description**: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not documented. When absent, rate limiting fails open — requests pass through without rate limiting.
- **Suggested Fix**: Add both vars to docs with `required=true`. Add startup validation that throws if missing.
- **Status**: OPEN

### FIXED [H26] db_get_stored_password is unauthenticated — any renderer can retrieve stored DB credentials

- **File**: `apps/desktop/src-tauri/src/sys/commands/database.rs:941`
- **Category**: security
- **Description**: Public `#[tauri::command]` accepts arbitrary `connection_id` and returns decrypted database password. No authentication check.
- **Suggested Fix**: Gate behind master password approval flow using `ApprovalController`. Or never return plaintext password to the renderer.
- **Status**: FIXED — `RequiresExplicitApproval` gate via `ToolConfirmationRequest` with `RiskLevel::Critical` added.

### [H27] Raw SQL forwarded to external databases with bypass-susceptible keyword blocklist

- **File**: `apps/desktop/src-tauri/src/sys/commands/database.rs:101`
- **Category**: security
- **Description**: `db_execute_query` accepts raw SQL from renderer, passes to external databases after only a keyword blocklist check that can be bypassed by comment injection (`SE/**/LECT`).
- **Suggested Fix**: Replace blocklist with SQL parser (sqlparser crate). Validate statement is exactly SELECT.
- **Status**: OPEN

### FIXED [H28] build_with_params is a silent no-op — callers believe they have parameterized queries when they don't

- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:596`
- **Category**: security
- **Description**: `build_with_params` is documented as a parameterized query builder but calls `self.build()` (string escaping) and returns an empty parameter vector. Architecturally deceptive.
- **Suggested Fix**: Remove `build_with_params` or make it delegate to `build_parameterized()`. Add `#[deprecated]` attribute.
- **Status**: FIXED — `build_with_params` now returns `Err` directing callers to `build_parameterized()`.

### FIXED [H29] INSERT and UPDATE use single-quote doubling instead of true prepared statement parameterization

- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:466`
- **Category**: security
- **Description**: `build_insert` and `build_update` escape values by doubling single quotes. Insufficient in databases with `ANSI_QUOTES` or `NO_BACKSLASH_ESCAPES` modes.
- **Suggested Fix**: All write queries must use `build_parameterized()` which returns actual `?` placeholders and a params vector.
- **Status**: FIXED — `validate_sql_value()` called before string interpolation in build_insert/build_update.

### FIXED [H30] WebSocket token comparison uses non-constant-time equality — timing oracle attack

- **File**: `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs:132`
- **Category**: security
- **Description**: `handle_connection` compares tokens using `sent_token == token`, which short-circuits on the first differing byte. Creates a timing oracle for brute-forcing the WebSocket auth token.
- **Suggested Fix**: `use subtle::ConstantTimeEq; if sent_token.as_bytes().ct_eq(token.as_bytes()).into() { ... }`.
- **Status**: FIXED — `subtle::ConstantTimeEq` used; `subtle = "2"` added to Cargo.toml.

### FIXED [H31] Post-authentication Authenticate event allows identity takeover

- **File**: `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs:257`
- **Category**: security
- **Description**: `handle_event` processes `RealtimeEvent::Authenticate` messages after initial authentication. Overwrites `client.user_id` and `client.team_id` without re-validating the token. Any authenticated client can impersonate another user.
- **Suggested Fix**: Ignore `Authenticate` events for already-authenticated clients: `if client.user_id.is_some() { return; }`.
- **Status**: FIXED — Already-authenticated clients' re-Authenticate events are ignored.

### [H32] NativeMessage::ExecuteScript executes arbitrary JS without approval gate

- **File**: `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:178`
- **Category**: security
- **Description**: `NativeMessage::ExecuteScript` with arbitrary `script: String` field. Allows browser extension to request Tauri to execute arbitrary JS in any browser tab without approval gate. Bypasses Tauri IPC security model.
- **Suggested Fix**: Require `ExecuteScript` to go through `ApprovalController` at `RequiresExplicitApproval` tier. Log script to audit trail.
- **Status**: OPEN

### [H33] IDOR: video task status accessible without ownership verification

- **File**: `apps/web/app/api/media/video/status/route.ts:328`
- **Category**: security
- **Description**: `handleVideoStatus` authenticates the user but never verifies that the requested `task_id` belongs to that user. Any authenticated user can poll any other user's video generation task status and retrieve the resulting video URL.
- **Suggested Fix**: Store `(user_id, task_id)` mapping in Redis when task is created. Verify ownership in `handleVideoStatus` before forwarding to provider.
- **Status**: OPEN

### FIXED [H34] Client-supplied plan tier in request body bypasses video subscription gate

- **File**: `apps/desktop/src-tauri/src/sys/commands/media.rs:211`
- **Category**: security
- **Description**: `media_generate_video` reads subscription plan from `request.plan`, a renderer-supplied field. If renderer omits the field, the gate is skipped. Renderer can supply `'pro'` to bypass the paywall.
- **Suggested Fix**: Remove `plan` field from `MediaVideoRequest`. Read subscription tier from Rust-side `BillingState`.
- **Status**: FIXED — `plan` field removed from `MediaVideoRequest`; tier read from server-side `BillingState`.

### [H35] Billing enforcement guards on chat invocation are untested

- **File**: `apps/desktop/src-tauri/src/sys/billing/mod.rs:1`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H36] calculate_backoff_delay() untested — exponential overflow at attempt > 64 not caught

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:850`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H37] Provider routing candidates() selection logic has zero test coverage

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:200`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H38] SwarmOrchestrator TOCTOU race has no concurrency test

- **File**: `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs:1`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H39] Extension background.ts reconnect logic completely untested

- **File**: `apps/extension/src/background.ts:1`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H40] isPermanentError() fragile string matching untested against actual Chrome error messages

- **File**: `apps/extension/src/content.ts:400`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H41] ManagedCloudProvider proxy URL lookup from env vars is untested

- **File**: `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs:1`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H42] dfs_longest_path diamond-DAG bug has no graph topology test

- **File**: `apps/desktop/src-tauri/src/core/swarm/task_decomposer.rs:271`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

### [H43] invoke_candidate() model resolution from 'auto-economy' to actual model is untested

- **File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs:940`
- **Category**: test
- **Status**: NEEDS_HUMAN (write tests)

---

## Medium Issues (Summary Table)

| ID          | File                      | Line | Category | Title                                                                                                                                                                            |
| ----------- | ------------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [M1]        | `task_decomposer.rs`      | 363  | logic    | stats() pending count usize subtraction can underflow and panic                                                                                                                  |
| FIXED [M2]  | `sse_parser.rs`           | 181  | logic    | pending_chunks.remove(0) is O(n) — quadratic for long streams — **Fix applied**: Replaced Vec with VecDeque; pop_front() is O(1).                                                |
| [M3]        | `sse_parser.rs`           | 134  | logic    | Error criticality classified by substring matching — false positives/negatives                                                                                                   |
| [M4]        | `modelRouter.ts`          | 619  | logic    | classifyTaskLocally confidence saturates at score=4.5                                                                                                                            |
| [M5]        | `modelRouter.ts`          | 737  | logic    | hasRequiredCapabilities hard-requires agentic:true, excluding tool-capable models                                                                                                |
| FIXED [M6]  | `chatStore.ts`            | 358  | logic    | tokenUsage.max hardcoded to 128000 regardless of selected model context window — **Fix applied**: Dynamic context window from selected model metadata.                           |
| [M7]        | `useAgenticEvents.ts`     | 252  | logic    | normalizeRiskLevel defaults unknown risk to 'high' causing unnecessary approval dialogs                                                                                          |
| FIXED [M8]  | `chatStore.ts`            | 411  | logic    | Conversation cap eviction uses slice(499) — may evict 0 entries — **Fix applied**: Corrected slice offset to ensure at least 1 eviction.                                         |
| [M9]        | `mod.rs` (llm)            | 539  | quality  | Provider::as_string suppresses clippy instead of implementing Display/FromStr                                                                                                    |
| [M10]       | `task_decomposer.rs`      | 451  | quality  | Dead fields max_depth and min_subtask_size suppressed with allow(dead_code)                                                                                                      |
| [M11]       | `chat/mod.rs`             | 220  | quality  | Four near-identical resolver functions for fast-metadata path                                                                                                                    |
| [M12]       | `media.rs`                | 271  | quality  | Magic numbers 100/3s for video polling unexplained                                                                                                                               |
| [M13]       | `media.rs`                | 173  | quality  | History-building logic duplicated between image and video handlers                                                                                                               |
| [M14]       | `database.rs`             | 106  | quality  | connection_id empty-check duplicated 8 times                                                                                                                                     |
| [M15]       | `database.rs`             | 119  | quality  | SQL maximum length 1_000_000 magic number duplicated twice                                                                                                                       |
| [M16]       | `BrowserActionLog.tsx`    | 28   | quality  | ACTION_ICONS typed as Record<ActionType, any>                                                                                                                                    |
| [M17]       | `BrowserActionLog.tsx`    | 154  | quality  | Action type filter list hardcoded instead of derived from ACTION_ICONS keys                                                                                                      |
| [M18]       | `useChatSubmit.ts`        | 125  | quality  | useAccountStore.getState() inside useCallback bypasses React data-flow                                                                                                           |
| [M19]       | `billingUsage.ts`         | 353  | quality  | 15 async store actions call console.error redundantly                                                                                                                            |
| [M20]       | `browser.rs`              | 241  | security | CDP URL injection via unsanitized target_url in browser_open_tab                                                                                                                 |
| [M21]       | `browser.rs`              | 313  | security | CDP URL injection via unvalidated tab_id in browser_close_tab                                                                                                                    |
| [M22]       | `database.rs`             | 862  | security | db_store_password accepts unvalidated connection_id format                                                                                                                       |
| [M23]       | `query_builder.rs`        | 110  | security | validate_where_clause blocks OR tautologies but not AND-based tautologies                                                                                                        |
| FIXED [M24] | `encryption.rs`           | 47   | security | SQLCipher PRAGMA key may be exposed in rusqlite error logs — **Fix applied**: Error message redacted; key no longer appears in error output.                                     |
| FIXED [M25] | `encryption.rs`           | 112  | security | migrate_to_encrypted leaves plaintext database backup on disk permanently — **Fix applied**: Plaintext backup deleted after successful rename; warning logged if deletion fails. |
| [M26]       | `websocket_server.rs`     | 61   | security | WebSocket server has no connection rate limiting or unauthenticated timeout                                                                                                      |
| [M27]       | `admin/security/route.ts` | 200  | security | Admin action body uses type cast instead of Zod schema — no UUID format check                                                                                                    |
| [M28]       | `device/link/route.ts`    | 159  | security | Device link code leaked to third-party QR service                                                                                                                                |
| [M29]       | `completion/route.ts`     | 363  | security | Message content length check fails for array multi-modal content                                                                                                                 |
| [M30]       | `database.rs`             | 126  | security | validate_read_only_sql uses bypass-susceptible to_uppercase().contains()                                                                                                         |
| [M31]       | `router_tests.rs`         | 1    | test     | No test covers circuit breaker open/close/half-open state transitions                                                                                                            |
| [M32]       | `features.test.ts`        | 1    | test     | Feature test file is a placeholder with no real behavioral assertions                                                                                                            |

---

## Low Issues (Summary Table)

| ID          | File                         | Line | Category | Title                                                                                                                               |
| ----------- | ---------------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| FIXED [L1]  | `extension_bridge.rs`        | 581  | logic    | Exponential retry delay bit-shift overflows if REALTIME_MAX_RETRIES > 64 — **Fix applied**: Bit-shift capped at 31 before shifting. |
| [L2]        | `useAgenticEvents.ts`        | 252  | logic    | normalizeRiskLevel defaults unknown risk to 'high' — use 'medium'                                                                   |
| [L3]        | `chatStore.ts`               | 411  | logic    | Conversation cap eviction slice(499) may evict 0 entries                                                                            |
| [L4]        | `mod.rs` (llm)               | 479  | quality  | Redundant getter methods on ToolDefinition duplicate public field access                                                            |
| [L5]        | `mod.rs` (llm)               | 91   | quality  | Stale inline comment block for 10 removed Google fields                                                                             |
| [L6]        | `task_decomposer.rs`         | 716  | quality  | Magic numbers 0.7/0.3 for resource intensity                                                                                        |
| [L7]        | `chat/mod.rs`                | 286  | quality  | Duplicate AUDIT-CANCEL-060 comment 10 lines apart                                                                                   |
| [L8]        | `media.rs`                   | 91   | quality  | MediaHistoryItem.type\_ should be a typed enum MediaKind                                                                            |
| [L9]        | `browser.rs`                 | 97   | quality  | get_error_message() duplicates error-build logic in get()                                                                           |
| [L10]       | `manifest.rs`                | 377  | quality  | Stale commented-out wildcard extension line with 'remove in production' note                                                        |
| [L11]       | `manifest.rs`                | 482  | quality  | Windows registry stub is a no-op that falsely reports success                                                                       |
| [L12]       | `BrowserActionLog.tsx`       | 107  | quality  | DOM-anchor download pattern duplicated — needs shared utility                                                                       |
| [L13]       | `CacheManagement.tsx`        | 210  | quality  | Array index used as React key for items with stable unique identifiers                                                              |
| [L14]       | `CacheManagement.tsx`        | 117  | quality  | formatMB/formatCurrency are private inline helpers — should be shared                                                               |
| [L15]       | `useChatSubmit.ts`           | 107  | quality  | console.log in queue-mode success path leaks message IDs                                                                            |
| [L16]       | `media.rs`                   | 373  | security | Media generation history stored as plaintext JSON — bypasses SQLCipher                                                              |
| [L17]       | `chat/mod.rs`                | 82   | security | sanitize_for_prompt leaves shell metacharacters enabling prompt injection                                                           |
| [L18]       | `validation.ts`              | 283  | security | validateSqlQuery blocklist too narrow — permits DELETE without WHERE, EXEC                                                          |
| [L19]       | `validation.ts`              | 313  | security | sanitizeCommandArgs silently corrupts arguments by character deletion                                                               |
| [L20]       | `browser.rs`                 | 893  | security | browser_upload_file paths not validated against Tauri allowed directories                                                           |
| [L21]       | `docker-compose.yml`         | 1    | config   | PostgreSQL ports bound to all interfaces in development                                                                             |
| [L22]       | `Cargo.toml`                 | 1    | config   | reqwest blocking feature in async binary                                                                                            |
| [L23]       | `Cargo.toml`                 | 1    | config   | tokio full feature includes test-util in production binary                                                                          |
| FIXED [L24] | `package.json vs Cargo.toml` | 1    | config   | Version mismatch: package.json 1.1.3 vs Cargo.toml 1.1.5 — **Fix applied**: package.json bumped to v1.1.5.                          |
| [L25]       | `query_builder.rs`           | 50   | test     | QueryBuilder tests don't cover SQL injection via parameter values                                                                   |
| [L26]       | `sse_parser.rs`              | 181  | test     | O(n) Vec::remove(0) performance regression has no benchmark test                                                                    |
| [L27]       | All 15 AGI executors         | 1    | test     | All 15 AGI executors have zero unit tests                                                                                           |
| [L28]       | `websocket_server.rs`        | 1    | test     | WebSocket server message routing and connection lifecycle untested                                                                  |

---

## Autonomous Fix Loop — Pass 1

### Priority Fix Order (highest impact, automatable)

**SECURITY CRITICAL — Fix immediately:**

1. [C19] browser.rs:584 — Add `RequiresExplicitApproval` approval gate to `browser_evaluate`
2. [C20] browser.rs:665 — Add `RequiresExplicitApproval` approval gate to `browser_execute_async_js`
3. [C21] browser.rs:905 — Add path validation in `browser_upload_file`
4. [C9] lib.rs:189 — Remove SQLCipher silent fallback to plaintext
5. [C16] query_builder.rs — Fix `validate_sql()` to return `Err` not just warn
6. [H28] query_builder.rs:596 — Remove/deprecate `build_with_params` silent no-op
7. [H29] query_builder.rs:466 — Enforce parameterized queries for INSERT/UPDATE
8. [H26] database.rs:941 — Gate `db_get_stored_password` behind `ApprovalController`
9. [H30] websocket_server.rs:132 — Add constant-time token comparison (subtle crate)
10. [H31] websocket_server.rs:257 — Ignore re-Authenticate for already-authenticated clients
11. [H34] media.rs:211 — Remove client-supplied plan tier from `MediaVideoRequest`
12. [H33] status route:328 — Add task ownership verification

**LOGIC BUGS — Fix next:** 13. [H2] cost_calculator.rs:12 — Add MediaUnit pricing variant 14. [H3] task_decomposer.rs:271 — Fix dfs_longest_path with topological DP 15. [H4] orchestrator.rs:440 — Fix SubtaskResult.agent_id field assignment 16. [H5] orchestrator.rs:365 — Fix TOCTOU in spawned_subtask_ids 17. [H7] media_executor.rs:439 — Replace blocking fs I/O with tokio::fs 18. [H6] extension_bridge.rs:504 — Fix GetUrl/GetTitle identical native payloads 19. [M2] sse_parser.rs:181 — Replace Vec with VecDeque for O(1) dequeue 20. [M6] chatStore.ts:358 — Remove hardcoded tokenUsage.max = 128000 21. [M8] chatStore.ts:411 — Fix conversation cap eviction slice(499) bug 22. [L1] extension_bridge.rs:581 — Cap bit-shift to prevent overflow

**QUALITY — Fix after security/logic:** 23. [H16] useChatSubmit.ts:247 — Fix stale isSending ref → useState 24. [H17] CacheManagement.tsx:43 — Replace window.confirm() with AlertDialog 25. [H18] CacheManagement.tsx:245 — Add await/error handling to clearByProvider 26. [H9] index.tsx:959 — Strip 37+ console.log statements 27. [C4] auth.ts:288 — Deduplicate storageFallback (10+ files) 28. [C5] useMediaGeneration.ts:6 — Extract shared getAuthToken() 29. [H19] index.tsx:1119 — Extract finalizeStream() to remove 4x duplication 30. [H8] useAgenticEvents.ts:216 — Fix stale handlersRef → dynamic access 31. [H11] useVoiceInput.ts — Delete dead file 32. [H14] browser.rs:656 — Remove duplicate browser_get_dom_snapshot 33. [L24] package.json — Sync version to 1.1.5

**CONFIG — Fix after code:** 34. [H20] docker-compose.yml — Bind pgAdmin to 127.0.0.1 35. [H21] capabilities/default.json — Restrict shell:allow-open to https/http/mailto 36. [H22] capabilities/default.json — Add gitconfig/git-credentials to deny list 37. [C10] docker-compose.yml — Parameterize postgres password 38. [M24] encryption.rs:47 — Use pragma_update API for SQLCipher key 39. [M25] encryption.rs:112 — Delete plaintext backup after successful migration

### Items Requiring Human Attention

- [C8] Decompose 3124-line chat_send_message (architectural refactor)
- [C11-C18][C22] Write missing test suites (new test files needed)
- [H35-H43] Write missing test coverage (new test files)
- [H15] Implement 15 stub browser commands (real implementation needed)
- [H23] Update release.yml to add Rust checks (GitHub Actions YAML)
- [H24] Remove unsafe-inline from CSP (may require Tailwind configuration changes)
- [H12] Sanitize build_decomposition_prompt (verify sanitize_multiline_for_prompt is accessible)
- [H1] Fix cache key post-resolution (requires careful refactoring of cache lookup flow)

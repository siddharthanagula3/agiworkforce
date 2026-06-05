# Desktop Tool Parity Ledger

Status: Active
Owner: Platform lead
Last updated: 2026-06-05

Purpose: track AGI Desktop model-callable tool parity against Claude Code and Codex local references. A row is complete only when the Desktop UI/tool loop exposes the capability honestly, the runtime path works, errors are visible, trust boundaries are enforced, and verification evidence exists.

Reference folders:

- Claude Code: `/Users/siddhartha/Desktop/claude_reference/src`
- Codex CLI: `/Users/siddhartha/Desktop/reference/codex-cli`
- Hermes Agent: `/Users/siddhartha/Desktop/reference/hermes-agent`
- OpenClaw: `/Users/siddhartha/Desktop/reference/openclaw`
- Claw Code: `/Users/siddhartha/Desktop/reference/claw-code`
- Gemini CLI: `/Users/siddhartha/Desktop/reference/gemini-cli`

## Operating Rules

- Compare AGI Desktop tool capability, not AGI CLI, unless the row explicitly says cross-surface.
- Use local repo truth first, then local references, then official docs through Context7/OpenAI docs/web when needed.
- Do not expose fake tools. If a registered tool is not beta-ready, gate or hide it from model-visible schemas.
- Do not silently cross Local, BYOK, and Managed Cloud trust boundaries.
- Do not add invented APIs, SDK calls, imports, packages, env vars, config keys, routes, file paths, types, hooks, or commands.
- Do not add stubs, placeholders, fake responses, production mocks, empty handlers, skipped tests, or green-check theater.
- Do not accept half-wired features. Each completed row needs UI/surface wiring, runtime behavior, error/loading/success states where applicable, and verification evidence.

## Desktop Tool Families

| Family                      | AGI Desktop status                                                           | Claude Code reference                                                                                      | Codex reference                                                                   | Current finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Next action                                                                                                                                                                                                                                                                                                                      | Verification                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool loop and registry      | First pass complete                                                          | `src/tools.ts`, `src/services/api/claude.ts`, tool UI components                                           | `codex-rs/tools`, `codex-rs/core/src/tools`, `codex-rs/core/src/session`          | AGI has broad registry/executor/chat loop. First pass added exposure metadata, capability gating, and provider-server event visibility.                                                                                                                                                                                                                                                                                                                                                                      | Verify full Desktop UI timeline during app run.                                                                                                                                                                                                                                                                                  | Rust tests and cargo check passed.                                                                                                         |
| Files                       | First pass complete                                                          | `FileReadTool`, `FileWriteTool`, `FileEditTool`                                                            | `file-system`, `file-search`, `apply-patch`, core handlers                        | AGI has read/list/range/binary/write/delete and MCP filesystem fallback. Fixed `file_read_range` registered-but-unrouted gap, exposed `file_list.timeout_ms`, made directory pagination stable after sorting, and added `file_version.sha256` to model/AGI file reads. Existing-file writes through both Desktop tool executor and core AGI file executor now require matching `expected_sha256`.                                                                                                            | Verify Desktop UI rendering for file version metadata, stale-write errors, and direct app save flows that use Tauri file commands outside model tools.                                                                                                                                                                           | Rust file tests and cargo check passed.                                                                                                    |
| Edits and patches           | First pass complete                                                          | `FileEditTool`, diff UI, mtime checks                                                                      | `apply-patch`, patch runtime/tests                                                | AGI has `multi_edit`, `apply_patch`, `edit_exact_replace`, `format_file`, model-callable undo, and named coding checkpoints. First pass made `apply_patch` all-or-fail, rejected no-op and empty exact replacements, made `multi_edit` reject ambiguous matches unless `replace_all` is explicit, added stale-read hash guards to file mutations, and exposed the existing UndoState/ChangeTracker checkpoint backend through guarded model tools.                                                           | Verify Desktop UI rendering for diffs, checkpoints, edit errors, undo/rewind flows, and stale-read retry guidance.                                                                                                                                                                                                               | Rust edit/undo/checkpoint tests and cargo check passed.                                                                                    |
| Terminal, tests, git        | First pass complete                                                          | `BashTool`, task output, permissions                                                                       | `shell-command`, `execpolicy`, `unified_exec`, sandboxing                         | AGI has one-shot terminal execution, test runner delegation, and git tools. First pass removed the false model-visible shell override, added bounded terminal output capture with truncation metadata, clamped terminal/test timeouts, validated `test_run.project_root` before runner detection, aligned git schema defaults with executor behavior, and added read-only model-callable `git_diff`, `git_log`, and `git_list_branches` with bounded or read-only outputs and honest limits.                 | Next pass: background/long-running sessions, stdin continuation, cancellation UI, sandbox policy parity, read-only PR context flows, and full Desktop timeline verification.                                                                                                                                                     | Rust terminal/git/test-run/git-diff/git-log/branch-list tests and cargo check passed.                                                      |
| Search and research         | First pass complete                                                          | `Grep`, `Glob`, `WebSearch`, `WebFetch`                                                                    | `file-search`, `web_search`, tool discovery                                       | AGI has grep/glob/code search, web search, physical scrape, API response HTML extraction, and research agents. First pass added grep/glob pagination, fail-closed search-root handling for model executor calls, search schema pagination fields, and accurate web/API truncation metadata.                                                                                                                                                                                                                  | Next pass: Desktop UI verification, search cancellation, richer Grep output modes, web fetch permissions, source/citation UX, and tool discovery.                                                                                                                                                                                | Rust search tests and cargo check passed.                                                                                                  |
| Browser and UI automation   | First pass complete                                                          | `ComputerUseApproval`, `WebFetchTool`, strict tool schemas                                                 | app protocol command/fs/app metadata, config strictness                           | AGI has browser and UI automation tools with selector validation. First pass aligned browser/UI schemas with actual executor support, added strict guard rejection for stale params, implemented browser wait/timeout handling, selector-safe JS interpolation, async JS timeout/script limits, extract modes, type clear-first, screenshot full-page, query-all metadata, and UI target validation.                                                                                                         | Next pass: full Desktop UI run for permissions, screenshots, DOM state, app timeline, and native UI target reliability.                                                                                                                                                                                                          | Rust browser/UI, guard, tool-executor, cargo check, and diff checks passed.                                                                |
| MCP, skills, tool discovery | First pass complete                                                          | MCP resource tools, `ToolSearchTool`, `SkillTool`                                                          | MCP server/client, plugins, skills, tool discovery                                | AGI has MCP merge, Tauri skill commands, MCP server exposure, prompt-side skill injection, and MCP bundle install flows. First pass removed unverifiable MCP registry and bundle version/rating/download claims, removed inflated skill-count claims, normalized MCP list/search tool IDs through the registry, and stopped forwarding AGI-only `timeout_ms` control args to MCP servers.                                                                                                                    | Next pass: model-callable tool search/discovery parity, MCP resources/prompts UI, skill invocation as a first-class model tool or explicit prompt-only design, and full Desktop Settings/chat verification.                                                                                                                      | Rust MCP tests, MCPB compile check, regression test, typecheck, cargo check, and diff checks passed.                                       |
| LSP and code intelligence   | First pass complete                                                          | `services/lsp/*`, `services/diagnosticTracking.ts`, `FileEditTool`, `LSPTool` references                   | Codex code/file search paths; Claw/Hermes LSP registry and diagnostics references | AGI Desktop has real Tauri LSP IPC and Monaco wiring. First pass fixed protocol response correlation, async diagnostics storage, common server-to-client request responses, request timeouts, and `/lsp` slash-command argument honesty. Model-callable LSP tools are still not verified.                                                                                                                                                                                                                    | Next pass: expose or explicitly gate diagnostics/definitions/references/actions as model-callable tools, wire edit-after-diagnostics feedback, and verify Desktop editor UI with real language servers.                                                                                                                          | Rust LSP tests, desktop typecheck, cargo check, and diff checks passed.                                                                    |
| Tasks and subagents         | First pass complete                                                          | `AgentTool`, `TaskOutputTool`, `TaskStopTool`, `TaskListTool`, `TaskGetTool`, `TaskUpdateTool`, team tools | subagent thread lineage, delegated approval metadata, goal accounting             | AGI has real background-agent manager, persistence, queueing, pause/resume/cancel/takeover commands, and autonomous execution when router/automation are available. First pass fixed Desktop `/agents` slash-command IPC and added model-callable `background_agent_start`, `background_agent_get`, and `background_agent_cancel` tools backed by the desktop manager. Full Claude-style typed subagents, output files, task list/update, isolation/worktree, and task footer parity are still not complete. | Next pass: task output/read-file contract, cooperative cancellation proof under running autonomous work, agent isolation/worktree handling, typed subagent definitions, and Desktop UI verification.                                                                                                                             | Handler tests, desktop typecheck, tauri-mock regression test, Rust background-agent/model-tool tests, cargo check, and diff checks passed. |
| Worktrees and sandbox       | First pass complete for worktree lifecycle, sandbox parity still open        | Enter/Exit worktree tools                                                                                  | sandboxing, worktree/session concepts                                             | AGI now exposes model-callable `worktree_create`, `worktree_list`, and `worktree_remove` backed by real git worktrees under `.agiworkforce/worktrees`. The tools validate slugs, create/resume AGI-managed branches, refuse dirty removal unless `force` is explicitly approved, and describe worktrees as file isolation, not OS sandboxes. AGI still does not expose a proven worktree enter/session-switch tool or prove OS-level sandbox enforcement for code execution.                                 | Implement or explicitly gate worktree enter/exit/session routing, wire terminal/code/background-agent execution to selected worktrees with visible scope, wire code execution to a proven external sandbox runtime or keep it clearly labeled temporary-workspace execution, and verify terminal sandbox behavior in Desktop UI. | Rust worktree lifecycle tests, ToolGuard/registry/routing tests, chat schema tests, cargo check, and diff check passed.                    |
| Specialized tools           | First pass complete for contract honesty, UI/account verification still open | Notebook/document/media/memory/scheduler where equivalent                                                  | skills/media/app tools where equivalent                                           | AGI exposes document, media, email, calendar, productivity, memory, scheduler, conversation, todo, question, and reasoning tools through the Desktop registry. This pass aligned several advertised schemas with executor inputs, removed unverified media provider/model claims, required approval for metered media generation and durable/external task creation, made todo clearing work, and rejected malformed document/email/calendar/productivity payloads before side effects.                      | Verify each specialized capability in Desktop UI with real configured accounts/providers, or gate tools that cannot complete without credentials in the demo environment.                                                                                                                                                        | Rust specialized-tool tests, ToolGuard tests, chat schema tests, registry routing test, cargo check, scan, and diff check passed.          |

## Current Completed Changes

- Added explicit Desktop chat tool exposure metadata for execution source, safety tier, confirmation need, and required model capability.
- Added provider server-side tool timeline visibility so `__server__*` calls emit `tool:event` started/completed events instead of only a `chat:tool-result`.
- Extended Desktop chat capability filtering so vision tools require vision capability and git/test tools require code-execution capability.
- Implemented and routed `file_read_range` so the model-visible line-range reader executes with canonical path validation, bounded reads, numbered output, and pagination metadata.
- Updated `file_list` to paginate after deterministic sorting and added `total_matched` result metadata.
- Exposed `timeout_ms` in the production `file_list` registry schema to match the executor behavior already available to callers.
- Changed Desktop `apply_patch` so all hunks must apply before the file is written; partial patches now fail with no file changes.
- Changed `edit_exact_replace` to reject identical `old_text`/`new_text` and empty `old_text` before file access.
- Changed `multi_edit` to reject ambiguous repeated matches by default, support explicit `replace_all`, support `expected_replacements`, and roll back earlier writes on later edit failure.
- Added `file_version.sha256` read metadata and required matching `expected_sha256` for existing-file writes/edits/patches through the Desktop model tool executor and core AGI file executor.
- Updated chat-facing file tool schemas and coding prompt guidance so models read first and pass `file_version.sha256` before editing existing files.
- Added model-callable `undo_get_summary`, `undo_get_changes`, `undo_last`, `undo_change`, `coding_checkpoint_create`, `coding_checkpoint_list`, and `coding_checkpoint_rewind` backed by the existing Desktop `UndoState` and `ChangeTracker`.
- Kept `coding_checkpoint_list` content-safe for model use: it returns checkpoint IDs, names, timestamps, paths, counts, and `snapshot_contents_included: false`, not the stored file snapshots.
- Gated destructive undo and checkpoint rewind tools through confirmation policy, while keeping summary/list tools read-only and code-capability filtered.
- Removed model-visible `shell` from Desktop `terminal_execute` schemas because the executor intentionally uses the user's system default shell.
- Added implemented `max_output_bytes` support to Desktop `terminal_execute`, with bounded stdout/stderr capture, truncation markers, and byte/truncation metadata.
- Clamped Desktop terminal timeouts to 300 seconds and rejected zero/non-integer timeout or output-cap values.
- Validated `test_run.project_root` before runner detection and clamped `test_run.timeout_secs` to 300 seconds.
- Aligned git tool schemas with executor behavior: `git_add.files` now defaults to `["."]`, and read-only `git_status.path` can default to the active project folder.
- Added read-only model-callable `git_diff`, backed by the existing Tauri git diff command, with `path`, repository-relative `file_path`, `staged`, and capped `max_bytes` parameters.
- Added git-diff truncation metadata and an explicit `includes_untracked_file_content: false` response field so the model does not overclaim untracked diff coverage.
- Added read-only model-callable `git_log`, backed by the existing Tauri git log command, with an optional repository path and bounded commit `limit`.
- Added read-only model-callable `git_list_branches`, backed by the existing Tauri branch-list command, with local branch names, current-branch flags, and last commit hashes.
- Added real `limit` and `offset` support to Desktop `grep_search` and `glob_search`, with returned count, total match count, and `has_more` metadata.
- Added Claude-style `head_limit` aliasing to AGI `grep_search` and `glob_search` by mapping it to the implemented `limit` parameter.
- Changed model executor search roots for `code_search`, `grep_search`, and `glob_search` to validate paths before execution instead of allowing lower-level fallback to a different directory.
- Changed lower-level grep/glob search roots to reject missing or non-directory roots instead of silently falling back to environment or current working directory.
- Added accurate `truncated` metadata for HTML and API response body extraction, and made plain-text truncation preserve UTF-8 character boundaries.
- Aligned Desktop browser/UI schemas with implemented behavior: removed unsupported async-JS parameters, documented async function-body execution, and updated UI targets to coordinates, native `element_id`, or visible text.
- Added canonical browser timeout handling for navigation, selector waits, interactivity waits, and async JavaScript, with default and maximum timeout bounds.
- Changed browser selector interpolation to use JSON string literals so quoted attribute selectors work without reopening script-injection paths.
- Implemented browser `extract_type` modes for text, attribute, and full element information, plus `clear_first` support for browser typing, `full_page` screenshot handling, and structured `browser_query_all` results.
- Changed Desktop UI automation to reject missing coordinates, empty text, unsupported target formats, and unsupported right/middle clicks on native/text targets instead of silently falling through.
- Changed Desktop tool guard validation to reject unknown non-MCP tool parameters and aligned allowlists with current file, terminal, search, edit, browser, and UI contracts.
- Removed unverifiable MCP registry popularity/version claims from Desktop backend and UI. Registry entries now expose package templates and known tool names without fake ratings, downloads, or current versions.
- Removed unverifiable MCP bundle popularity claims from Desktop backend and UI. Embedded bundle entries now omit rating/download fields unless a verified live source supplies them, and the browser displays package/tool details instead.
- Removed inflated skill-count language from Desktop skill surfaces and external MCP server tool descriptions.
- Changed MCP tool list/search commands to use the same safe registry-generated MCP tool IDs as chat/tool schemas.
- Changed MCP execution so AGI-only control fields such as `timeout_ms` stay local to AGI and are not forwarded to strict MCP servers.
- Changed Desktop LSP transport to correlate JSON-RPC responses by request ID, keep reading through async server notifications, answer common server-to-client requests, and enforce initialization/request timeouts.
- Changed Desktop LSP diagnostics to parse and store `textDocument/publishDiagnostics` notifications with runtime validation, including numeric diagnostic code normalization.
- Changed Desktop `/lsp` slash command to use running server state and required backend arguments for `servers`, `symbols`, and `diagnostics` instead of calling LSP commands with missing `language` or `uri` parameters.
- Changed Desktop `/agents push` slash command to call `background_agent_push` with the real Rust IPC shape: `input.conversationId`, `input.goal`, recent conversation history, working directory, and merged custom instructions.
- Added Desktop `/agents` subcommands for `list`, `active`, `stats`, `status`, `output`, `pause`, `resume`, `cancel`, `takeover`, and `cleanup`, mapped to registered Tauri background-agent commands.
- Tightened the Desktop dev/test Tauri mock so `background_agent_push` rejects missing `input.conversationId` or `input.goal` and reports the real max background-agent limit of 8.
- Added model-callable Desktop background-agent tools: `background_agent_start`, `background_agent_get`, and `background_agent_cancel`.
- Backed model-callable background-agent tools with the existing desktop manager instead of adding a parallel runtime.
- Sanitized `background_agent_get` output so model calls can read status, progress, summary, and counts without exposing hidden conversation snapshots or custom instruction text.
- Added policy guard entries so `background_agent_start` and `background_agent_cancel` require confirmation, while `background_agent_get` remains read-only and safe.
- Corrected stale background-agent Rust docs to show the real `background_agent_push` IPC shape.
- Corrected `code_execute` docs and progress labels to describe temporary-workspace execution instead of OS-level sandbox isolation.
- Corrected command validation comments so blocklist checks are described as defense-in-depth, not as an authoritative OS sandbox boundary.
- Renamed the OS-profile helper in the desktop security sandbox module so it reports profile selection, not proven enforcement.
- Corrected the terminal MCP catalog description so it no longer claims shell commands are safely sandboxed.
- Added model-callable Desktop git worktree lifecycle tools: `worktree_create`, `worktree_list`, and `worktree_remove`.
- Backed worktree tools with real git worktrees under `.agiworkforce/worktrees`, AGI-managed branch names, slug validation, dirty-tree removal protection, explicit approval for create/remove, and honest "not an OS sandbox" result metadata.
- Changed document creation tools to reject malformed `paragraphs`, `headers`, and `rows` payloads instead of silently creating empty or incomplete files.
- Changed `todo_write` to allow an empty todo list to clear the displayed checklist and to reject multiple `in_progress` todos.
- Changed email tool execution to parse the advertised `account_id`, recipient, subject, and body fields without dropping recipients, and to reject invalid email addresses or missing bodies.
- Changed calendar event/list tools to build real calendar requests from advertised top-level fields, including required `calendar_id`, `start_time`, and `end_time`.
- Changed productivity task creation to build real tasks from advertised top-level fields, including description, status, due date, priority, and tags.
- Changed recurring scheduler tasks created from chat to preserve `task_description` as the AGI task prompt and to reject chat-supplied shell, webhook, workflow, or script action types.
- Changed scheduled-task cancellation to accept the registry-advertised `task_id` alias as well as executor `job_id`.
- Changed media tool registry descriptions to avoid unverified model/provider and plan claims.
- Changed ToolGuard policies so metered media generation, productivity task creation, recurring scheduled tasks, and scheduled-task cancellation require confirmation, and specialized tool allowlists match the current registry/executor contracts.

## Verification Evidence

- 2026-06-04: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 9/9 tests.
- 2026-06-04: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 test.
- 2026-06-04: `cargo check -p agiworkforce-desktop` passed.
- 2026-06-05: `cargo test -p agiworkforce-desktop file_read_range --lib` passed, 2/2 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop file_list --lib` passed, 6/6 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 9/9 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 test.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed.
- 2026-06-05: `cargo test -p agiworkforce-desktop apply_patch --lib` passed, 3/3 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop edit_exact_replace --lib` passed, 4/4 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop multi_edit --lib` passed, 4/4 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop file_version_hash --lib` passed, 1/1 stale-read metadata test.
- 2026-06-05: `cargo test -p agiworkforce-desktop matching_expected_sha256 --lib` passed, 1/1 existing-file write guard test.
- 2026-06-05: `cargo test -p agiworkforce-desktop stale_expected_sha256 --lib` passed, 1/1 stale exact-replace guard test.
- 2026-06-05: `cargo test -p agiworkforce-desktop expected_sha256 --lib` passed, 5/5 hash contract tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop file_executor --lib` passed, 48/48 tests after adding the core AGI file executor hash guard.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 13/13 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 test.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after edit/patch changes.
- 2026-06-05: `git diff --check` passed after stale-read guard changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop undo_registry --lib` passed, 1/1 undo/checkpoint registry contract test.
- 2026-06-05: `cargo test -p agiworkforce-desktop undo_and_checkpoint_tool_contracts_are_guarded --lib` passed, 1/1 guard contract test.
- 2026-06-05: `cargo test -p agiworkforce-desktop undo_tools_require_desktop_app_state --lib` passed, 1/1 no-app-state failure test.
- 2026-06-05: `cargo test -p agiworkforce-desktop checkpoint --lib` passed, 22/22 checkpoint-matching tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop undo --lib` passed, 64/64 undo-matching tests.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after undo/checkpoint model-tool exposure.
- 2026-06-05: `cargo test -p agiworkforce-desktop terminal --lib` passed, 64/64 tests, including terminal output truncation and chat schema regression.
- 2026-06-05: `cargo test -p agiworkforce-desktop git_registry --lib` passed, 1/1 test.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_run --lib` passed, 8/8 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 test after terminal/test/git changes.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after terminal/test/git changes.
- 2026-06-05: `git diff --check` passed after terminal/test/git changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop git_diff --lib` passed, 6/6 matching tests after model-callable git diff.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_git_registry_matches_executor_defaults --lib` passed, 1/1 registry test after model-callable git diff.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 12/12 chat schema tests after model-callable git diff.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 registry-routing test after model-callable git diff.
- 2026-06-05: `cargo test -p agiworkforce-desktop tool_guard --lib` passed, 32/32 ToolGuard tests after model-callable git diff.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after model-callable git diff.
- 2026-06-05: `cargo test -p agiworkforce-desktop git_log --lib` passed, 3/3 matching tests after model-callable git log.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_git_registry_matches_executor_defaults --lib` passed, 1/1 registry test after model-callable git log.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 12/12 chat schema tests after model-callable git log.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 registry-routing test after model-callable git log.
- 2026-06-05: `cargo test -p agiworkforce-desktop tool_guard --lib` passed, 33/33 ToolGuard tests after model-callable git log.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after model-callable git log.
- 2026-06-05: `cargo test -p agiworkforce-desktop git_list_branches --lib` passed, 2/2 matching tests after model-callable branch listing.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_git_registry_matches_executor_defaults --lib` passed, 1/1 registry test after model-callable branch listing.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 12/12 chat schema tests after model-callable branch listing.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 registry-routing test after model-callable branch listing.
- 2026-06-05: `cargo test -p agiworkforce-desktop tool_guard --lib` passed, 34/34 ToolGuard tests after model-callable branch listing.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after model-callable branch listing.
- 2026-06-05: `cargo test -p agiworkforce-desktop search --lib` passed, 144/145 tests, with one pre-existing ignored network test.
- 2026-06-05: `cargo test -p agiworkforce-desktop response_truncation --lib` passed, 2/2 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 test after search/research changes.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after search/research changes.
- 2026-06-05: `git diff --check` passed after search/research changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop browser_execute_async_js --lib` passed, 2/2 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop browser_wait_timeout_alias --lib` passed, 1/1 test.
- 2026-06-05: `cargo test -p agiworkforce-desktop alias_normalization_removes_alias --lib` passed, 1/1 test.
- 2026-06-05: `cargo test -p agiworkforce-desktop browser_tools::tests --lib` passed, 51/51 tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop build_chat_tools_browser_ui_schemas_match_desktop_executor --lib` passed, 1/1 test.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests --lib` passed, 52/52 tests after browser/UI changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop tool_guard --lib` passed, 28/28 tests after strict guard changes.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after browser/UI changes.
- 2026-06-05: `git diff --check` passed after browser/UI changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop mcp --lib` passed, 254/257 tests with 3 pre-existing ignored tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_mcp_control_args_are_not_forwarded_to_server --lib` passed, 1/1 test.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop typecheck` passed after MCP/skills honesty changes and one stale unused import cleanup.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after MCP/skills changes.
- 2026-06-05: `git diff --check` passed after MCP/skills changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop mcpb --lib` compiled successfully, with 0 matching focused tests.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop typecheck` passed after MCP bundle honesty changes.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after MCP bundle honesty changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop lsp --lib` passed, 4/4 focused LSP protocol tests.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop typecheck` passed after LSP slash-command changes.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after LSP transport changes.
- 2026-06-05: `git diff --check` passed after LSP changes.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop test src/handlers/__tests__/slashCommandHandlers.test.ts` passed, 5/5 slash-command handler tests including `/agents push`, `/agents cancel`, and `/agents output`.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop typecheck` passed after `/agents` command-contract changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop background_agent --lib` passed, 128/129 matching tests with one pre-existing ignored test.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after task/subagent slash-command changes.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop test src/__tests__/tauriMock.test.ts` passed, 20/20 tests after background-agent mock validation changes.
- 2026-06-05: `git diff --check` passed after task/subagent changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 test after background-agent model-tool registration.
- 2026-06-05: `cargo test -p agiworkforce-desktop background_agent --lib` passed, 131/132 matching tests with one pre-existing ignored test after model-callable background-agent tools.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_background_agent_tools_are_policy_registered --lib` passed, 1/1 test.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after background-agent model-tool changes.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop typecheck` passed after background-agent model-tool changes.
- 2026-06-05: `pnpm --filter @agiworkforce/desktop test src/handlers/__tests__/slashCommandHandlers.test.ts` passed, 5/5 tests after background-agent model-tool changes.
- 2026-06-05: `git diff --check` passed after background-agent model-tool changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop code_executor --lib` passed, 20/20 matching tests after worktree/sandbox honesty changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop dangerous_code_patterns --lib` passed, 1/1 focused test after renaming the misleading sandboxing test.
- 2026-06-05: `cargo test -p agiworkforce-desktop sandbox_runtime --lib` passed, 3/3 focused terminal sandbox-wrapper tests.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after worktree/sandbox honesty changes.
- 2026-06-05: `git diff --check` passed after worktree/sandbox honesty changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop worktree_tools --lib` passed, 3/3 focused git worktree lifecycle tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_worktree_registry_matches_executor_contract --lib` passed, 1/1 worktree registry contract test.
- 2026-06-05: `cargo test -p agiworkforce-desktop test_worktree_tool_contracts_require_approval_and_validate_slug --lib` passed, 1/1 ToolGuard worktree contract test.
- 2026-06-05: `cargo test -p agiworkforce-desktop tool_guard --lib` passed, 31/31 ToolGuard tests after worktree lifecycle tools.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 registry-routing test after worktree lifecycle tools.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 12/12 chat schema tests after worktree lifecycle tools.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after worktree lifecycle tools.
- 2026-06-05: `cargo test -p agiworkforce-desktop planning_tools --lib` passed, 2/2 focused todo-tool tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop document_tools --lib` passed, 3/3 focused document payload tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop communication_tools --lib` passed, 4/4 focused email/calendar/productivity tests.
- 2026-06-05: `cargo test -p agiworkforce-desktop specialized_tool_contracts --lib` passed, 1/1 focused ToolGuard contract test.
- 2026-06-05: `cargo test -p agiworkforce-desktop metered_media_generation --lib` passed, 1/1 focused ToolGuard media approval test.
- 2026-06-05: `cargo test -p agiworkforce-desktop sys::commands::chat::tools::tests --lib` passed, 12/12 chat schema tests after specialized registry changes.
- 2026-06-05: `cargo test -p agiworkforce-desktop core::llm::tool_executor::tests::test_registry_tools_are_routable_in_executor --lib` passed, 1/1 registry-routing test after specialized registry changes.
- 2026-06-05: `cargo check -p agiworkforce-desktop` passed after specialized-tool contract changes.
- 2026-06-05: `git diff --check` passed after specialized-tool contract changes.

## Open Blockers

- No full Desktop run has been completed yet after the tool-loop, file-tool, edit/patch, terminal/test/git, search/research, browser/UI, MCP/skills, and LSP patches.
- File edit/write parity still needs Desktop UI verification for diff rendering, edit errors, checkpoints, and undo surfaces.
- Stale-read hash protection is implemented for Desktop model file writes, exact edits, multi-edits, patches, and the core AGI file executor; direct UI save flows and stale-error rendering still need Desktop UI verification.
- Terminal parity still lacks Claude/Codex-grade background sessions, stdin continuation, cancellation UI verification, and sandbox-policy parity.
- Search/research parity still needs Desktop UI verification for result rendering, cancellation, web-fetch permission UX, and citations/source presentation.
- Browser/UI parity still needs full Desktop UI verification for permissions, screenshots, DOM state rendering, native UI target reliability, timeline events, and cancellation.
- MCP/skills parity still needs full Desktop UI verification for Settings install/connect flows, registry honesty, MCP tool search/list rendering, permission prompts, logs, health, resources/prompts, and chat timeline events.
- Skill parity still needs a product decision and implementation pass for Claude-style first-class model skill invocation versus AGI's current prompt-side auto-injection and UI/Tauri skill commands.
- LSP parity still needs real Desktop editor verification with installed language servers, model-callable code-intelligence tool exposure or explicit gating, and edit-after-diagnostics feedback comparable to Claude/Hermes.
- Tasks/subagents parity still needs task output file/read contracts, cooperative cancellation proof under running autonomous work, worktree/isolation behavior, typed subagent definitions, task list/update equivalents, and Desktop UI verification.
- Worktree/sandbox parity is not complete: AGI Desktop has model-callable worktree create/list/remove, but lacks proven worktree enter/session-switch routing, `code_execute` is temporary-workspace execution rather than proven OS-level process isolation, and terminal sandbox settings still need Desktop UI/runtime verification with the configured `srt` backend.
- Specialized tools still need Desktop UI verification with real configured media, email, calendar, cloud, productivity, document, memory, scheduler, and conversation-search states. Tools that lack credentials or provider setup in the demo environment should show clear unavailable/credential errors or be gated from the public demo path.
- Tool-family status beyond tool loop, files, edit/patch, terminal/test/git, search/research, browser/UI, MCP/skills, LSP, first-pass task/subagent controls, worktree/sandbox honesty, and specialized-tool contract honesty is not verified.

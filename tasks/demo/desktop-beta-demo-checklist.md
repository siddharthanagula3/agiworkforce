# Desktop Beta Demo Checklist

Status: Active
Owner: Platform lead
Last updated: 2026-06-05

Use this checklist for public-demo readiness. A scenario is demo-ready only when the user can perform it in AGI Desktop, the tool result is visible, and errors are understandable.

## Tool Loop

- [ ] Start Desktop chat with tools enabled.
- [ ] Verify model-visible tools are filtered by model capabilities.
- [ ] Run one safe local tool, such as `file_list` or `file_read`.
- [ ] Run one confirmation-required tool, such as `file_write`, and verify approval UX.
- [ ] Trigger one provider server-side tool path and verify the timeline shows started/completed.
- [ ] Stop/cancel during a tool run and verify the UI records interruption.

## File Tools

- [x] Code-level: `file_read_range` is routed and returns numbered bounded output.
- [x] Code-level: `file_read` and `file_read_range` return `file_version.sha256` for stale-read protection.
- [x] Code-level: existing-file `file_write` through model/core AGI executors requires matching `expected_sha256`.
- [x] Code-level: `file_list` paginates after sorting and exposes `timeout_ms` in the production registry schema.
- [ ] Desktop UI: ask AGI to list a selected project folder and verify stable paginated results are visible.
- [ ] Desktop UI: ask AGI to read a line range from a large file and verify numbered output is visible.
- [ ] Desktop UI: ask AGI to overwrite a file after it changed on disk and verify AGI shows a stale-read error and asks to read again.
- [ ] Desktop UI: verify missing path, permission, oversized file, and offset-out-of-range errors are understandable.

## Edit And Patch Tools

- [x] Code-level: `apply_patch` rejects partial patches and leaves the target file unchanged.
- [x] Code-level: `edit_exact_replace` rejects empty `old_text` and no-op identical replacements.
- [x] Code-level: `multi_edit` rejects ambiguous matches unless `replace_all` is explicit and rolls back earlier writes on later failure.
- [x] Code-level: `edit_exact_replace`, `multi_edit`, and `apply_patch` require or validate `expected_sha256` for existing files.
- [x] Code-level: `undo_get_summary`, `undo_get_changes`, `undo_last`, and `undo_change` are model-visible, routed, and guard-validated.
- [x] Code-level: `coding_checkpoint_create`, `coding_checkpoint_list`, and `coding_checkpoint_rewind` are model-visible, routed, guard-validated, and backed by the existing local `ChangeTracker`.
- [x] Code-level: `coding_checkpoint_list` omits stored snapshot contents from model results.
- [ ] Desktop UI: ask AGI to perform one exact replacement and verify the diff is visible.
- [ ] Desktop UI: ask AGI to perform one multi-file edit and verify success and error states are visible.
- [ ] Desktop UI: ask AGI to apply a failing patch and verify the UI says no file changes were written.
- [ ] Desktop UI: verify checkpoints and undo surfaces after a successful edit.

## Terminal, Test, And Git Tools

- [x] Code-level: `terminal_execute` no longer exposes a model-set `shell` parameter in registry or chat schemas.
- [x] Code-level: `terminal_execute` caps returned stdout/stderr and reports truncation metadata.
- [x] Code-level: `test_run` validates `project_root` before runner detection and clamps timeout.
- [x] Code-level: git schemas match executor defaults for `git_add.files` and `git_status.path`.
- [x] Code-level: `git_diff` is model-visible, read-only, routed, capped by `max_bytes`, and states that untracked file content is not included.
- [x] Code-level: `git_log` is model-visible, read-only, routed, and bounded by a commit `limit`.
- [x] Code-level: `git_list_branches` is model-visible, read-only, routed, and returns local branch names, current-branch flags, and last commit hashes.
- [ ] Desktop UI: ask AGI to run a safe short command and verify stdout, stderr, exit code, and duration are visible.
- [ ] Desktop UI: ask AGI to run a high-output command and verify truncation is visible without freezing the app.
- [ ] Desktop UI: ask AGI to run the smallest relevant test command in a fixture and verify failure output is readable.
- [ ] Desktop UI: ask AGI for git status in the active project and verify branch, staged, unstaged, and untracked data are visible.
- [ ] Desktop UI: ask AGI for git diff in the active project and verify file paths, additions, deletions, truncation, and untracked-limit messaging are visible.
- [ ] Desktop UI: ask AGI for recent git commits and verify commit hash, author, date, message, limit, and empty-history errors are visible.
- [ ] Desktop UI: ask AGI to list local git branches and verify current branch, branch names, and last commit hashes are visible.
- [ ] Desktop UI: stop/cancel a long-running command and verify the timeline records the interruption.

## Search And Research Tools

- [x] Code-level: `grep_search` and `glob_search` support real `limit` and `offset` pagination.
- [x] Code-level: `grep_search` and `glob_search` reject missing search roots instead of falling back to another directory.
- [x] Code-level: search schemas expose pagination fields in registry and chat tool definitions.
- [x] Code-level: web/API body extraction reports truncation accurately and preserves UTF-8 boundaries.
- [ ] Desktop UI: ask AGI to grep a fixture with `limit` and `offset`, then verify `has_more` and returned matches are visible.
- [ ] Desktop UI: ask AGI to glob a fixture with pagination and verify stable result rendering.
- [ ] Desktop UI: ask AGI to search an invalid folder and verify the error does not silently search another directory.
- [ ] Desktop UI: ask AGI to search the web for a current fact and verify sources/titles/URLs are visible.
- [ ] Desktop UI: ask AGI to fetch a simple HTML page and verify readable extracted text plus truncation metadata.

## Browser And UI Automation

- [x] Code-level: `browser_execute_async_js` schema matches executor support and rejects obsolete async-JS parameters.
- [x] Code-level: browser selectors allow practical quoted attributes while rejecting script-breakout and unsafe selector patterns.
- [x] Code-level: browser waits, async JS, extracts, typing, screenshots, and query-all paths use canonical parameters and return structured metadata.
- [x] Code-level: `ui_click` and `ui_type` validate target shape and reject unsupported or empty actions.
- [x] Code-level: the Desktop tool guard rejects unknown non-MCP parameters and allows current browser/UI/file/search/edit/terminal contracts.
- [ ] Desktop UI: use browser automation on a safe local or test page and verify navigation, wait, click, type, extract, screenshot, and query-all results render in the timeline.
- [ ] Desktop UI: verify async JavaScript timeout and oversized script errors are visible and understandable.
- [ ] Desktop UI: verify full-page screenshot output is visible and does not freeze the app.
- [ ] Desktop UI: verify native UI click/type target failures are understandable when coordinates, `element_id`, or text are invalid.
- [ ] Desktop UI: verify confirmation and permission prompts appear for high-risk browser/UI actions before execution.

## MCP, Skills, And Tool Discovery

- [x] Code-level: MCP registry package templates no longer show unverifiable ratings, downloads, or current package versions.
- [x] Code-level: MCP bundle templates no longer serialize or render unverifiable ratings or download counts.
- [x] Code-level: skill surfaces no longer claim an unverified inflated skills count.
- [x] Code-level: MCP list/search tool IDs use the same safe registry ID generation as chat tool schemas.
- [x] Code-level: AGI-only MCP control fields such as `timeout_ms` are not forwarded to MCP servers.
- [ ] Desktop UI: open Tools & Skills settings and verify MCP registry entries do not show fake popularity/version metrics.
- [ ] Desktop UI: open MCP bundle browser and verify cards/details show package and tool details, not fake popularity metrics.
- [ ] Desktop UI: install one MCP server template and verify approval, disabled-by-default state, and understandable errors.
- [ ] Desktop UI: connect or list one safe MCP read tool and verify tool IDs, server labels, and parameters render clearly.
- [ ] Desktop UI: invoke one safe MCP read tool and verify result, duration, success/error state, and logs are visible.
- [ ] Desktop UI: verify skill list, skill search, slash-command parsing, and auto-injected skill event behavior.
- [ ] Desktop UI: verify whether first-class model skill invocation is available or intentionally absent from model-visible tools.

## LSP And Code Intelligence

- [x] Code-level: LSP JSON-RPC responses are correlated by request ID and request paths have bounded timeouts.
- [x] Code-level: LSP `textDocument/publishDiagnostics` notifications are parsed, validated, and stored for diagnostics queries.
- [x] Code-level: common server-to-client LSP requests receive bounded protocol responses instead of corrupting the next client response.
- [x] Code-level: `/lsp` slash command no longer calls backend LSP commands with missing `language` or `uri` arguments.
- [ ] Desktop UI: open a real TypeScript, Rust, Python, or Go file with the matching language server installed and verify completion, hover, definition, references, formatting, and diagnostics.
- [ ] Desktop UI: run `/lsp servers`, `/lsp symbols <query>`, and `/lsp diagnostics` and verify success and unavailable states are understandable.
- [ ] Desktop UI: introduce a small semantic error in a fixture and verify LSP diagnostics appear without restarting the app.
- [ ] Desktop UI: verify whether diagnostics/definitions/references are model-callable tools or intentionally absent from model-visible tools.
- [ ] Desktop UI: verify edit/write tools either feed new diagnostics back to the model or clearly record that code-intelligence feedback is editor-only.

## Tasks And Subagents

- [x] Code-level: `/agents push <goal>` sends `background_agent_push` the required Rust `input` object with active conversation ID, recent history, working directory, and custom instructions.
- [x] Code-level: `/agents status`, `/agents output`, `/agents pause`, `/agents resume`, `/agents cancel`, `/agents takeover`, `/agents active`, `/agents stats`, and `/agents cleanup` route to registered background-agent commands.
- [x] Code-level: desktop dev/test mock rejects invalid `background_agent_push` calls and uses the real max background-agent limit of 8.
- [x] Code-level: model-visible `background_agent_start`, `background_agent_get`, and `background_agent_cancel` tools are registered, routable, and backed by the desktop background-agent manager.
- [x] Code-level: `background_agent_get` returns sanitized status/progress/summary data without exposing hidden conversation snapshots or custom instruction text.
- [x] Code-level: background-agent start/cancel model tools require confirmation through the Desktop tool guard.
- [ ] Desktop UI: run `/agents push <safe goal>` in a local conversation and verify the inline panel shows agent ID, queue/start status, and understandable errors when router or automation is unavailable.
- [ ] Desktop UI: run `/agents status <agent-id>` and `/agents output <agent-id>` for queued, running, completed, failed, and cancelled agents.
- [ ] Desktop UI: verify `/agents pause`, `/agents resume`, `/agents cancel`, and `/agents takeover` visibly update state and do not leave dead controls.
- [ ] Desktop UI: verify background-agent completion/failure events appear in notifications, action log, and sidecar without duplicating or hiding errors.
- [ ] Desktop UI: ask the model to use `background_agent_start`, then verify confirmation, agent ID, status polling, sanitized output, and cancellation behavior.
- [ ] Desktop UI: verify whether Claude-style task output files, task list/update tools, typed subagents, and subagent isolation are implemented or intentionally gated.

## Worktrees And Sandbox

- [x] Code-level: `code_execute` now describes temporary-workspace execution, not OS-level process sandbox isolation.
- [x] Code-level: command validation comments describe blocklist checks as defense-in-depth, not as an authoritative sandbox boundary.
- [x] Code-level: the desktop security sandbox profile helper reports OS-profile selection, not proven runtime enforcement.
- [x] Code-level: the terminal MCP catalog no longer claims shell commands run safely in a sandboxed environment.
- [x] Code-level: model-visible `worktree_create`, `worktree_list`, and `worktree_remove` are registered, routed, guarded, and backed by real git worktrees under `.agiworkforce/worktrees`.
- [x] Code-level: worktree slugs reject traversal/unsafe segments, dirty worktree removal fails unless `force` is explicit, and tool output says git worktree isolation is not an OS sandbox.
- [ ] Desktop UI: ask AGI to execute a small approved code snippet and verify the confirmation/progress/result text says temporary workspace, not OS isolation.
- [ ] Desktop UI: enable terminal sandbox settings with the configured `srt` backend and verify a safe command is wrapped, errors clearly when `srt` is missing, and does not silently fall back.
- [ ] Desktop UI: ask AGI to create, list, and remove an AGI-managed worktree in a fixture repository and verify path, branch, dirty-state, approval, and error output are visible.
- [ ] Desktop UI: verify worktree enter/exit/session switching is absent or clearly gated until terminal, code, and background-agent execution can use the selected worktree with visible scope.
- [ ] Desktop UI: verify worktree cleanup, branch deletion opt-in, branch naming, and repository safety before any public demo that uses isolated worktrees.

## Specialized Tools

- [x] Code-level: document creation rejects malformed `paragraphs`, `headers`, and `rows` instead of silently creating empty or incomplete files.
- [x] Code-level: `todo_write` can clear the visible checklist with an empty array and rejects more than one `in_progress` item.
- [x] Code-level: email send/fetch schemas, ToolGuard allowlists, and executor parsing agree on `account_id`, recipients, folder, limit, subject, and body fields.
- [x] Code-level: calendar create/list schemas, ToolGuard allowlists, and executor parsing agree on required account, calendar, start, and end fields.
- [x] Code-level: productivity task creation accepts advertised title, description, status, due date, priority, and tags without requiring a hidden `task` object.
- [x] Code-level: recurring scheduled tasks preserve `task_description`, reject chat-supplied shell/webhook/script/workflow action types, and require confirmation.
- [x] Code-level: metered image/video generation requires confirmation and no longer carries unverified provider/model or plan claims in registry descriptions.
- [ ] Desktop UI: create a DOCX, XLSX, and PDF in a fixture folder and verify generated file links, artifact manifests, errors, and confirmations are visible.
- [ ] Desktop UI: ask the model to create, update, and clear a todo list and verify the inline checklist state changes correctly.
- [ ] Desktop UI: verify media generation asks for confirmation and clearly errors when provider credentials or plan access are unavailable.
- [ ] Desktop UI: verify email, calendar, cloud, and productivity tools either work with configured test accounts or show clear credential/setup errors without pretending success.
- [ ] Desktop UI: verify scheduler create/list/cancel flows show durable job IDs, confirmation, and understandable errors.
- [ ] Desktop UI: verify memory and conversation-search tools return visible, scoped results and do not leak unrelated conversations.

## Core Demo Script

- [ ] Select a local project folder.
- [ ] Ask AGI to inspect the folder and summarize relevant files.
- [ ] Ask AGI to edit one small file in an isolated test fixture.
- [ ] Ask AGI to run the smallest relevant test command.
- [ ] Ask AGI to show git status and explain the diff.
- [ ] Ask AGI to search the web only when the user request needs current information.
- [ ] Ask AGI to use browser automation on a safe test page.
- [ ] Ask AGI to discover or list MCP tools, then use one safe MCP read tool.

## Beta Bar

- [ ] No fake exposed tools.
- [ ] No dead visible controls in the demo path.
- [ ] No silent Local to BYOK or Managed Cloud routing.
- [ ] No unclear error messages for missing permissions, credentials, or app context.
- [ ] No console/runtime error during the demo path.
- [ ] Parity ledger updated with evidence after each tool-family boundary.

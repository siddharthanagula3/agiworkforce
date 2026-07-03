# AGI CLI — Volume 07 — Coding

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/cli/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/cli.md`, `docs/cli/COMMAND_SURFACE.md`. Grounded in real repo code: `apps/cli/src/agent/mod.rs`, `apps/cli/src/agent/executor.rs`, `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/features/exec/tools/file_ops/mod.rs`, `apps/cli/src/apply_patch.rs`, `apps/cli/src/review.rs`, `apps/cli/src/plan_mode.rs`, `apps/cli/src/subagent.rs`, `apps/cli/src/platform/lsp/{client.rs,mod.rs}`, `apps/cli/src/init.rs`, `apps/cli/src/notebook_edit.rs`, `crates/agiworkforce-app-server/src/lib.rs`, and the model SSOT `packages/types/src/models.json`.

## Overview & stance

This volume covers how AGI CLI writes, edits, and reasons about code inside a terminal workspace. AGI CLI is the pure-Rust (Ratatui TUI) developer surface and exposes all three trust modes — **Local**, **BYOK**, **Managed Cloud**. Every coding capability here is a composition of the agent loop (`apps/cli/src/agent/executor.rs`) over a fixed built-in tool catalog: `built_in_tool_definitions()` in `apps/cli/src/platform/runtime/tool_catalog.rs` defines the coding primitives (`read_file`, `write_file`, `edit_file`, `multiedit`, `apply_patch`, `search_files`, `grep_files`, `glob`, `read_many_files`, `run_command`, `lsp_*`, `notebook_edit`, `task`, `update_plan`). Do not restate a fixed tool count in specs; verify it from source (the catalog is asserted in that module's tests).

Two rules from canon shape every subsection below. First, **trust boundaries are load-bearing**: a Local session must never silently ship code, files, or context to a BYOK or Managed provider — `AgentSession::validate_privacy_boundary` (`apps/cli/src/agent/mod.rs`) fails closed, and Local→BYOK requires an explicit, consent-gated handoff (`arm_byok_handoff` / `consume_byok_handoff`). Second, **sessions are workspace/session-scoped**: coding output stays in the workspace and never auto-syncs to app chat; any handoff to app chat is explicit and redacted. Model IDs shown to the user come only from `packages/types/src/models.json`.

## Code Generation

✅ Built. The agent loop turns a prompt into new source via `write_file` (create/overwrite) and streams reasoning through `apps/cli/src/agent/executor.rs`; `agi exec "…"` runs one-shot generation non-interactively. Generation must respect the active trust mode and never invent a model — the effective model is resolved through `AgentSession::new_checked` (`apps/cli/src/agent/mod.rs`), which fails closed on unknown IDs. Requirement: generated files land only under validated workspace roots (`path_security`), and Local sessions generate using the local provider only.

## Code Editing

✅ Built. Targeted single-file edits use `edit_file` (exact unique `old_string` → `new_string`) and `multiedit` (`MultiEditOp` batch of edits to one file) in `apps/cli/src/features/exec/tools/file_ops/mod.rs`. The catalog descriptions require reading a file before editing/overwriting; `read_file` supports line ranges. Requirement: an edit that does not match uniquely must error rather than guess, and every edit is subject to the permission/approval broker before it touches disk in non-`--yolo` modes.

## Multi-file Editing

✅ Built (patch + subagent paths). Coordinated cross-file changes use `apply_patch` → `apply_git_patch` (`apps/cli/src/apply_patch.rs`), which returns an explicit `PatchResult { applied, skipped, conflicted }`; `agi apply` replays the latest session diff as a git patch. Parallel multi-file work fans out through the `task` subagent tool (`apps/cli/src/subagent.rs`). Requirement: partial-apply results are reported per file, never silently swallowed. 🔭 Planned: a single atomic transaction spanning many files with automatic rollback on any hunk conflict.

## Refactoring

🟡 Partial. Rename/extract/inline are performed today by combining discovery (`search_files`, `grep_files`, `glob`, `lsp_document_symbols`, `lsp_definition`) with `edit_file`/`multiedit`, then verifying via `run_command` (tests/build). LSP tooling is real and wired (`apps/cli/src/platform/lsp/client.rs`, spawned in `apps/cli/src/features/exec/tools/task_registry/mod.rs`). Gap: there is **no** semantic cross-file `lsp_rename` tool in the catalog, so language-server-driven atomic renames are 🔭 Planned; refactors remain string- and diagnostics-assisted rather than fully symbol-safe.

## Bug Fixes

✅ Built. The loop reproduces (via `run_command`), locates (`search_files`, `lsp_diagnostics`), patches (`edit_file`/`multiedit`/`apply_patch`), and re-verifies. `agi review` (`apps/cli/src/review.rs`) produces structured `ReviewIssue`s for non-interactive triage. Requirement: a fix is not "done" on compile success alone — the volume requires a green verification command (test/build) captured in the session before the agent claims resolution, matching the repo's "do not mark work complete from build success alone" rule.

## Test Generation

🟡 Partial. Tests are authored with `write_file`/`edit_file` and executed through `run_command` against the project's own runner (e.g. `cargo test`, `pnpm test`); LSP diagnostics guide fixture typing. Gap: there is no dedicated coverage-aware test-generation command or coverage feedback loop in `apps/cli/src`. Requirement: generated tests must actually assert behavior (no empty/always-pass tests) per `pnpm check:llm-failures`; 🔭 Planned: coverage-driven test scaffolding that targets uncovered branches.

## Documentation

✅ Built. Inline docs, READMEs, and comments are written via `write_file`/`edit_file`; `agi init` (`apps/cli/src/init.rs`) generates project instruction files (`AGENTS.md`/`CLAUDE.md`) so agent context is documented per repo. `notebook_edit` (`apps/cli/src/notebook_edit.rs`) covers Jupyter narrative cells. Requirement: documentation generation must not fabricate APIs, routes, env vars, or model IDs — claims must be grounded in files the agent has read.

## Project Scaffolding

🟡 Partial. `agi init` scaffolds AGI project instructions and onboarding context (`apps/cli/src/init.rs`). New-application scaffolding (framework starters) is achieved by driving the ecosystem's own generators through `run_command` (e.g. `cargo new`, `pnpm create …`) plus `write_file`. Gap: there is no built-in template/scaffold registry that generates a project skeleton directly. 🔭 Planned: opinionated, trust-mode-aware scaffold templates. Command examples always use the `agi` binary — never the `agiworkforce` compatibility alias.

## Code Explanation

✅ Built. Explanations read the real tree first — `read_file`, `read_many_files`, `search_files`, `glob`, plus `lsp_hover` and `lsp_document_symbols` for symbol-level context — then summarize. `agi exec` gives one-shot "explain this" without an interactive session. Requirement: explanations cite files/lines actually read, and in Local mode no snippet leaves the device. Any decision to carry an explanation into app chat is explicit and redacted, never automatic.

## Code Optimization

🟡 Partial. Optimization uses the same loop: measure via `run_command` (benchmarks/profilers the project already has), inspect with `lsp_diagnostics`, then apply `edit_file`/`multiedit` and re-measure. Gap: there is no first-party profiler integration or perf-regression harness in `apps/cli/src`. Requirement: any claimed speedup must be backed by a before/after measurement captured in the session; 🔭 Planned: built-in benchmark capture and perf-delta reporting.

## Repository map

- `apps/cli/src/agent/mod.rs` — `AgentSession`, `PrivacyMode`, trust-boundary enforcement, `update_plan` handling.
- `apps/cli/src/agent/executor.rs` — the tool-call agent loop that drives all coding actions.
- `apps/cli/src/platform/runtime/tool_catalog.rs` — built-in coding tool definitions and aliases.
- `apps/cli/src/features/exec/tools/file_ops/mod.rs` — `write_file`, `edit_file`, `multiedit`, `execute_apply_patch`.
- `apps/cli/src/apply_patch.rs` — multi-file git-patch application (`PatchResult`).
- `apps/cli/src/review.rs` — `agi review` structured code review.
- `apps/cli/src/plan_mode.rs` — plan-mode `Plan` used before mutating tools run.
- `apps/cli/src/subagent.rs` — `task` subagent fan-out for parallel multi-file work.
- `apps/cli/src/platform/lsp/{client.rs,mod.rs,types.rs}` + `apps/cli/src/features/exec/tools/task_registry/mod.rs` — LSP tools.
- `apps/cli/src/init.rs` — project instruction scaffolding.
- `apps/cli/src/notebook_edit.rs` — Jupyter cell editing.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC/WS `tools/list` + `tools/call` host for IDE/programmatic clients.

## Competitor notes

Claude Code and Codex CLI ship comparable edit/patch/plan/subagent loops bound to one vendor's models. AGI CLI's deliberate divergence: (1) **multi-provider** — coding runs against Anthropic, OpenAI, Google, local Ollama/LM Studio, and more, resolved from the `packages/types/src/models.json` SSOT, never hardcoded; (2) **BYOK where allowed** — the CLI is one of only three surfaces (Desktop, CLI, VS Code) permitted to use user keys, with Local→BYOK as an explicit consented fork; (3) **per-surface trust + local-first** — a Local coding session provably stays on-device (`validate_privacy_boundary`), which vendor CLIs cannot offer; (4) **workspace-scoped by default** — coding output does not auto-sync to any cloud chat. Remote control of a running CLI coding session from phone/web is 🔭 Planned, mirroring Claude Code Remote Control and Codex remote connections (session keeps running locally, outbound-only, QR + HMAC paired, approval-gated) — not a fourth trust mode.

## Acceptance / Definition of Done

A coding capability is production-ready only when its tool path is wired in `apps/cli/src`, respects the permission/approval broker, holds the trust boundary under test, and is verified by a real command (not build success alone).

- [ ] **Build/behavior**: `cargo test -p agiworkforce-cli --lib` green; edit/patch tools error on non-unique or conflicting matches instead of guessing; catalog tool set verified from `tool_catalog.rs` tests (no hardcoded count in prose).
- [ ] **Trust**: Local session cannot route code/context to BYOK or Managed without an explicit consented handoff; provider/model label visible; no auto-sync of coding output to app chat.
- [ ] **Security**: all file writes confined to validated workspace roots; `pnpm check:llm-failures` clean (no fake/always-pass tests, no swallowed errors, no unvalidated tool inputs); patch results report `applied`/`skipped`/`conflicted` truthfully.

## Anti-patterns

- Silently routing a Local coding session to BYOK/Managed, or drafting a BYOK handoff and treating drafting as consent.
- Hardcoding or inventing model IDs, provider names, routes, env vars, or command names; bypassing `packages/types/src/models.json`.
- Claiming a fix/optimization "done" from a successful compile with no test/benchmark evidence.
- Generating empty or always-passing tests, or documentation that fabricates APIs the agent never read.
- Writing outside validated workspace roots, or auto-syncing coding artifacts to app chat.
- Referencing Supabase (fully migrated away), reintroducing removed tiers (Plus/pro_plus/Hobby) or credit top-ups, or using the `agiworkforce` alias in user-facing command examples instead of `agi`.
- Asserting an unbuilt capability (atomic cross-file transactions, LSP semantic rename, coverage-driven test-gen, profiler integration) as shipped instead of labeling it 🔭 Planned.

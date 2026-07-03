# AGI CLI — Volume 10 — Git

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real implementation this volume grounds in: `apps/cli/src/context.rs`, `apps/cli/src/review.rs`, `apps/cli/src/repl/registry.rs`, `apps/cli/src/features/exec/tools/git/mod.rs`, `apps/cli/src/platform/runtime/{worktree.rs,tool_catalog.rs}`, `apps/cli/src/safety/dangerous_commands.rs`, `apps/cli/src/safety/mod.rs`, `apps/cli/src/claude_parity.rs`, `apps/cli/src/tui/widgets/statusline_setup.rs`, `apps/cli/src/agent/mod.rs`, and `crates/agiworkforce-app-server`.

## Overview & stance

This volume specifies how AGI CLI reads a Git repository, reasons about its changes, and helps a developer commit, branch, review, and land work. Git itself is an **on-device** capability: every `git` invocation runs against the local `.git`, so touching the repo never changes the trust boundary. What the trust mode governs is where repo **content** — diffs, file bytes, commit context — travels once it enters the model context. Local (`local_only`) keeps it on-device; BYOK sends selected context to the user's provider key (Desktop/CLI/VS Code only); Managed Cloud routes it through AGI-managed compute. The `PrivacyMode` guard (`apps/cli/src/agent/mod.rs`) is ✅ Built and blocks a Local session from silently feeding a diff to a non-local provider — moving one to BYOK/Cloud requires the explicit fork (context selection, secret scan, payload preview, visible provider label, consent). All Git work is workspace/session-scoped and is never auto-synced to app chat.

Two invariants govern every mutation. **Read-only Git is unattended, writes are approval-gated:** `safety/dangerous_commands.rs` lists `status`, `log`, `diff`, `show` as `GIT_SAFE_SUBCOMMANDS`, while `git commit`/`add`/`push`/`merge`/`checkout` classify as `Unknown` (approval-gated) and `git push --force`/`git reset --hard` sit in `DANGEROUS_PREFIXES` (confirmed by `safety/mod.rs` tests). **The agent has no bespoke Git binary** — mutations run through the `run_command` shell tool (`tool_catalog.rs`) under that classification, and a small set of first-class worktree tools.

## Repository Summary

✅ Built — `SystemContext` (`apps/cli/src/context.rs`) gathers `git_branch` (via `git rev-parse --abbrev-ref HEAD`), `git_status_summary` (via `git status --short`, summarized to modified/added/deleted counts), `git_remote_url`, and `monorepo_type`, injecting them into every session's system context. Requirement: the summary must reflect real repo state at session start and never fabricate a branch, remote, or clean/dirty state. A richer narrative "explain this repo" summary (contributors, hot files, history shape) is 🔭 Planned.

## Status Analysis

✅ Built — status is surfaced two ways: the `git_status_summary` field above, and the always-on HUD branch item (`show_branch`, `apps/cli/src/tui/widgets/statusline_setup.rs`). Ad-hoc status runs unattended because `git status` is a `GIT_SAFE_SUBCOMMAND` — no approval prompt. Requirement: status must show branch, ahead/behind, and staged vs. unstaged counts truthfully; a dirty tree must never render as clean. A dedicated `agi status` narrative command that classifies changes by intent is 🔭 Planned.

## Diff Analysis

✅ Built — the `/diff` slash command (`handle_diff`, `apps/cli/src/repl/registry.rs`) runs `git diff --stat` then a colorized `git diff` (additions/deletions/hunk headers styled), capped at 100 rendered lines with a truncation marker. For model-driven analysis, `review::gather_diff` (`apps/cli/src/review.rs`) assembles the diff from `git show --patch <commit>`, `git diff <base>...HEAD`, or `git diff --cached` + `git diff`, truncated on a UTF-8 char boundary at 100 KB before it reaches the model. Requirement: diff output must never split a multi-byte character (`truncate_on_char_boundary`) and must visibly mark truncation, never silently drop hunks.

## Commit Message Generation

🔭 Planned — there is **no** built-in commit-message generator today (no `commit_message`/`agi commit` path in `apps/cli/src`). A developer can still ask the agent to draft one from the staged diff (`git diff --cached`), but the actual `git commit` stays approval-gated (`Unknown`), so nothing lands without consent. Target design: a first-class generator that reads the staged diff, produces a Conventional-Commits-style subject/body, previews it, and commits only after approval — model selection honoring the session trust mode. Requirement (when built): scan the diff for secrets before it reaches any non-local provider; generated messages must never invent paths or claims absent from the diff.

## Branch Analysis

🟡 Partial — Git **worktree** management is first-class and ✅ Built: `enter_worktree`, `exit_worktree`, `list_worktrees` (`apps/cli/src/features/exec/tools/git/mod.rs`, registered in `tool_catalog.rs`, implemented in `platform/runtime/worktree.rs`), each approval-gated via `worktree_approval_denial` + `PermissionStore` and emitting `WorktreeCreate`/`WorktreeRemove` hooks. Branch-name handling guards against option injection (`worktree.rs` treats the branch as a positional, never a flag). Ordinary branch inspection (`git branch --list`, `git log`) runs read-only via the shell. **Naming trap:** the `/branch` and `/fork` slash commands (`handle_branch`, `registry.rs`) fork the **conversation** (a managed-session fork resumable with `agi --session <id>`), _not_ a Git branch. Gap: a "compare/analyze branches" summary command is 🔭 Planned. Requirement: worktree removal stays approval-gated and never discards uncommitted work without confirmation.

## Pull Request Assistance

🟡 Partial — the `/pr-comments` prompt (`pr_comments_prompt`, `apps/cli/src/claude_parity.rs`) is ✅ Built: it directs the agent to inspect unresolved review comments on the current PR, summarize required changes, and implement fixes if repo access exists. PR creation otherwise flows through `gh` via the approval-gated `run_command` shell tool, and GitHub-style PR prompts can be supplied by a connected MCP server (`apps/cli/src/mcp/mod.rs` parses a "Review PR" prompt). Gap: native `agi`-owned PR create/list/status/draft commands are 🔭 Planned (a `draft-pr` custom prompt is a user-authorable pattern, not a shipped command). Requirement: any handoff of PR/diff content to a non-local provider obeys the session trust mode and secret scan; pushes and PR creation stay approval-gated.

## Merge Conflict Resolution

🔭 Planned — there is no dedicated conflict resolver, conflict-marker parser, or `rerere` integration in `apps/cli/src`. `git merge` classifies as `Unknown` (approval-gated), so a merge proceeds only with consent; once conflicts exist the agent can resolve them via `read_file`/`edit_file` and shell `git`, but with no purpose-built "theirs vs. ours vs. resolved" preview. Target design: detect conflict markers, present each hunk with both sides, propose a resolution, and stage only after approval. Requirement (when built): never `git checkout --theirs/--ours` or complete a merge without an explicit reviewable preview and consent.

## Code Review

✅ Built — `agi review` (`Command::Review` in `apps/cli/src/lib.rs`, `run_review` in `apps/cli/src/review.rs`) reviews a diff scoped by `--commit`, base branch (`<base>...HEAD`), or the working tree (staged + unstaged), runs a single bounded turn (`max_turns = 1`), and returns structured `ReviewOutput` (severity `clean|minor|major|critical`, per-file/line issues, suggestions). Prompt-driven `/security-review` and `/ultrareview` (`claude_parity.rs`) extend it with security- and taxonomy-focused passes. Requirement: review runs under the session's trust mode (a Local diff is not reviewed by a non-local model without the explicit fork); severity and file/line references must come from the diff, not be invented.

## Repository map

- `apps/cli/src/context.rs` — `SystemContext` Git detection (branch, status summary, remote).
- `apps/cli/src/review.rs` — `agi review` diff gathering + structured review output.
- `apps/cli/src/repl/registry.rs` — `/diff` renderer; `/branch` + `/fork` conversation fork.
- `apps/cli/src/features/exec/tools/git/mod.rs` — worktree tools + approval gating.
- `apps/cli/src/platform/runtime/{worktree.rs,tool_catalog.rs}` — worktree impl + tool registration.
- `apps/cli/src/safety/{dangerous_commands.rs,mod.rs}` — Git safe/unknown/dangerous classification.
- `apps/cli/src/claude_parity.rs` — `/pr-comments`, `/security-review`, `/ultrareview` prompts.
- `apps/cli/src/tui/widgets/statusline_setup.rs` — HUD branch item.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` guard for Local→BYOK/Cloud.
- `crates/agiworkforce-app-server` — JSON-RPC/WS tool host exposing these tools.

## Competitor notes

Claude Code and Codex CLI center Git on one provider (Anthropic / OpenAI) and ship polished commit-message and PR helpers; Gemini CLI is Google-only. AGI's deliberate divergence: Git assistance is **multi-provider** (the reviewing/drafting model is chosen per session, switchable mid-turn via `/model`), **trust-scoped per surface** (Local review never silently leaves the device; BYOK is allowed because CLI is a BYOK surface; Cloud is opt-in), and **local-first** — read-only Git is unattended while every mutation is approval-gated by the safety classifier. AGI does not auto-sync CLI Git work into app chat; any handoff is explicit and redacted.

## Acceptance / Definition of Done

Production-ready when read-only Git analysis is unattended and truthful, every mutation is approval-gated, and no diff crosses a trust boundary without the explicit fork.

- [ ] Build: `agi review` (working-tree, `--commit`, base-branch) and `/diff` render correct, truncation-safe output; worktree tools create/list/remove under approval.
- [ ] Trust: a Local session's diff/commit context is provably blocked from BYOK/Cloud without the explicit fork (`PrivacyMode`).
- [ ] Security: `git push --force`/`git reset --hard` stay in `DANGEROUS_PREFIXES`; `commit`/`add`/`push`/`merge`/`checkout` stay approval-gated; secret scan runs before any diff leaves the device.

## Anti-patterns

- Silently routing a Local session's diff or commit context to BYOK/Cloud, or reviewing it with a non-local model without the explicit fork.
- Auto-committing, auto-pushing, force-pushing, or `reset --hard` without approval; downgrading a `DANGEROUS_PREFIXES` entry.
- Claiming a built-in commit-message generator, native PR commands, or a merge-conflict resolver — those are 🔭 Planned; do not describe them as shipped.
- Conflating `/branch`/`/fork` (conversation fork) with Git branching in docs or UI.
- Hardcoding or inventing model IDs for the review/commit model (read from `packages/types/src/models.json`), inventing routes/env vars/INR prices, referencing removed tiers ("Plus"/`pro_plus`/"Hobby") or credit top-ups, or referencing Supabase (use Clerk + Neon + Stripe).
- Using `agiworkforce <cmd>` in examples — the user-facing binary is `agi`.

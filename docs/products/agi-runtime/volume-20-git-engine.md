# AGI Runtime — Volume 20 — Git Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/mobile/AGENTS.md` (active surface). Grounded in `apps/cli/src/safety/approval.rs`, `apps/cli/src/safety/dangerous_commands.rs`, `apps/cli/src/init.rs`, `crates/agiworkforce-command-registry/src/lib.rs`, `crates/agiworkforce-apply-patch/src/{lib,parser}.rs`, `crates/agiworkforce-protocol/src/prompts/base_instructions/default.md`, `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `packages/client/client-runtime/src/registry.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

The Git Engine is the internal capability that lets an agent read, reason about, and (with approval) mutate a Git working tree. It is not a surface and not a daemon; it is shared runtime plumbing that the **workspace-scoped** surfaces compile in. A Git repository is a filesystem artifact, so this engine exists **only** where there is a local workspace: **Desktop, CLI, and VS Code**. Web and Mobile have no repository, no shell, and no Git Engine — they never receive git output and never issue git commands.

Trust framing is strict. Every git _operation_ (read or write) runs as a local shell command on the host — a `LocalShell` task under **Local** trust (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`); compute and repository contents stay on-device and are never silently routed to BYOK or Cloud. The only step that reaches a model is _inference over_ git artifacts (summarizing a diff, drafting a commit message, analyzing a PR). That inference inherits the surface's allowed modes — **BYOK** on Desktop/CLI/VS Code via an explicit Local→BYOK fork (context selection, secret scan, payload preview, visible provider label, consent), or **Managed Cloud** for signed-in users — and reads model IDs only from `packages/contracts/types/src/models.json`. Remote control adds no mode: a paired phone/web window may _approve_ a commit or branch action, but the git command executes on the host, outbound-only and approval-gated. Mutating git actions are approval-gated by the safety classifier; the destructive ones are hard-flagged.

## Repository Detection

Requirement: before any git capability activates, the engine must resolve whether the working directory is inside a repository, find the repo root, and read HEAD/branch/dirty state — deterministically and without network access. Today this is 🔭 Planned as a first-class detector. The nearest real substrate is the CLI initializer, which bootstraps a workspace and writes `AGENTS.md`/policy for the project (🟡 `apps/cli/src/init.rs` — project setup, not a repo detector), and the safety classifier's awareness of repo-scoping global options (`-C`, `--git-dir`, `--work-tree`, `--namespace` are skipped to find the real subcommand — `GIT_GLOBAL_OPTIONS_WITH_VALUE`, `apps/cli/src/safety/dangerous_commands.rs`). The 🔭 detector must expose repo root, current branch, ahead/behind, and staged/unstaged/untracked counts as structured data the higher engines consume; detection must never assume a repo and must degrade cleanly (no-repo → git capabilities disabled, not errored).

## Diff Analysis

Requirement: the engine surfaces the working-tree delta (staged, unstaged, and untracked) and can parse it structurally. Surfacing the raw diff is ✅ Built: the `/diff` slash command is registered as "Show git diff (incl. untracked)" (`crates/agiworkforce-command-registry/src/lib.rs`), and `/review` "Review current code changes" is the review entry point. Structural parsing of unified diffs is ✅ Built in the apply-patch crate: `parse_patch` yields typed `Hunk` / `UpdateFileChunk` values with per-file add/update/delete chunks (`crates/agiworkforce-apply-patch/src/{lib,parser}.rs`). _Semantic_ diff analysis — summarizing intent, flagging risk, grouping related hunks, or estimating blast radius — is 🔭 Planned and is an inference step bound by the trust rules above (model ID from `models.json`; secret scan before any payload leaves Local). Requirement: diff payloads sent to a model must pass the same secret scan and payload preview as a Local→BYOK fork.

## Commit Generation

Requirement: the agent may draft a commit message and stage/commit **only when explicitly requested**. The guardrail is ✅ Built and enforced in the base agent instructions: "Do not `git commit` your changes or create new git branches unless explicitly requested" (`crates/agiworkforce-protocol/src/prompts/base_instructions/default.md`). Applying edits to files is ✅ Built via `apply_patch`, which refuses absolute paths and path traversal before touching disk (`crates/agiworkforce-apply-patch/src/lib.rs`). AI _commit-message generation_ from a staged diff is 🔭 Planned — inference-mode, model ID from `models.json`, never hardcoded. `git commit` itself is not on the safe read-only list, so it is Unknown → approval-gated by the classifier (below). Requirement: a generated message is a proposal; the human (or an approving remote window) confirms before the commit runs on the host.

## Branch Operations

Requirement: read-only branch inspection is auto-safe; branch mutation is approval-gated. This is ✅ Built in the classifier: `classify_git_branch` returns `Safe` for no-arg listing and for read-only flags (`--list`, `-l`, `--show-current`, `-a`, `-r`, `-v`, `--verbose`) and `Unknown` (→ prompt) for anything else (`apps/cli/src/safety/approval.rs`, `GIT_BRANCH_READONLY_FLAGS` in `dangerous_commands.rs`); the default policy auto-approves `git status`/`diff`/`log`/`branch` (`apps/cli/src/init.rs`). Note `/fork` (alias `branch`) is a **conversation** fork, not a git branch. Orchestrated create/switch/delete-branch workflows (worktrees, tracking setup) are 🔭 Planned and must stay approval-gated; no branch mutation may cross a trust boundary.

## Merge Assistance

Requirement: help the user integrate branches and resolve conflicts without ever losing work. This is 🔭 Planned in full — there is no merge/rebase/conflict-resolution component today. The only shipped behavior is defensive: the classifier hard-flags history-destroying commands `push --force` and `reset --hard` as `Dangerous` and blocks `git -c`/`--config` override injection (✅ `apps/cli/src/safety/approval.rs`). The 🔭 design: three-way conflict presentation, hunk-level accept/resolve, and dry-run merge preview — all Local, all approval-gated, with force-push kept behind an explicit destructive-action confirmation.

## PR Analysis

Requirement: inspect and reason about pull requests, and (later) draft them. Inspection entry points are ✅ Built: `/pr-comments` "Inspect pull request review comments" and `/install-github-app` "Install or connect the GitHub app" are registered commands (`crates/agiworkforce-command-registry/src/lib.rs`), and `/review` provides change review. There is a declared `git_` tool tier gated `desktop-only` under feature group `Git` (🟡 `packages/client/client-runtime/src/registry.ts` — a capability gate, not an engine). PR _summarization_, review-comment triage, and PR/description _generation_ are 🔭 Planned inference steps. Any handoff of PR context into app chat must be explicit and redacted — never automatic (canon: CLI/VS Code/Chrome stay workspace/task-scoped).

## Repository map

- `apps/cli/src/safety/approval.rs` — `classify_git`, `classify_git_branch` (git command safety).
- `apps/cli/src/safety/dangerous_commands.rs` — `GIT_SAFE_SUBCOMMANDS`, `GIT_BRANCH_READONLY_FLAGS`, `GIT_GLOBAL_OPTIONS_WITH_VALUE`.
- `apps/cli/src/init.rs` — workspace init + default git allow-list.
- `crates/agiworkforce-command-registry/src/lib.rs` — `/diff`, `/review`, `/pr-comments`, `/install-github-app`.
- `crates/agiworkforce-apply-patch/src/{lib,parser}.rs` — unified-diff parse/apply.
- `crates/agiworkforce-protocol/src/prompts/base_instructions/default.md` — commit/branch guardrail.
- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — `LocalShell` execution host.
- `packages/client/client-runtime/src/registry.ts` — `git_` desktop-only capability tier.

## Competitor notes

Claude Code, ChatGPT/Codex, and Codex CLI all bundle single-provider git helpers (auto commit messages, PR summaries, conflict help) tied to one vendor model and one cloud identity. AGI diverges deliberately: git operations are **local-first** and workspace-scoped, the inference that reasons over diffs is **multi-provider** (model IDs from `packages/contracts/types/src/models.json`) and runs under **BYOK where allowed** (Desktop/CLI/VS Code) or Managed Cloud, and **per-surface trust** removes the engine entirely on Web/Mobile. Destructive git actions are classifier-gated rather than silently executed. Managed-Cloud usage of the generation features is metered against the plan ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise); Local and BYOK are free access modes, no top-ups.

## Acceptance / Definition of Done

The Git Engine is production-ready when repository state is detected deterministically and offline; diffs are surfaced and structurally parsed; commit-message and PR generation are inference steps that pass secret scan + payload preview and cite a real model ID; every mutating git command is approval-gated, with `push --force` / `reset --hard` / `git -c` hard-flagged; and the engine is absent on Web/Mobile.

- [ ] Build: `/diff`, `/review`, `/pr-comments` resolve; `apply_patch` round-trips a unified diff; repo detector returns root/branch/dirty state.
- [ ] Trust: no git op auto-routes Local repo contents to BYOK/Cloud; generation inference honors the surface's allowed modes and `models.json` IDs.
- [ ] Security: mutating commands (commit, branch mutate, merge, push, reset) require approval; force-push and hard-reset stay `Dangerous`; path traversal and config-override injection are refused.

## Anti-patterns

- Do not expose any Git Engine surface on Web or Mobile (no local repo; no shell).
- Do not auto-commit, auto-branch, or auto-push without an explicit request and approval — the base-instruction guardrail is binding.
- Do not send a diff or PR body to a model without a secret scan, payload preview, and visible provider label; never silently route Local repo data to BYOK/Cloud.
- Do not hardcode or invent a model ID for commit/PR generation — read `packages/contracts/types/src/models.json`.
- Do not downgrade `push --force`, `reset --hard`, or `git -c` classifications, or bypass the approval gate.
- Do not claim merge assistance, PR generation, or a repo detector as shipped — they are 🔭.
- Do not reference removed tiers (Plus, pro_plus, Hobby), invent INR prices, add credit top-ups, or reference Supabase; auth/DB/billing is Clerk + Neon + Stripe.
- CLI examples use the `agi` binary, never `agiworkforce <cmd>`.

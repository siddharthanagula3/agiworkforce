# AGI VS Code Extension — Volume 10 — Git

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/vscode-extension.md`, and real repo paths: `apps/extension-vscode/src/core/commandSetup.ts`, `apps/extension-vscode/src/data/contextBuilder.ts`, `apps/extension-vscode/src/data/checkpointManager.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`, `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, `apps/extension-vscode/package.json`. Model IDs come only from `packages/types/src/models.json`.

## Overview & stance

This volume specifies how AGI's VS Code extension participates in the developer's Git workflow: reviewing AI-proposed diffs, drafting commit messages, reviewing changes at PR scope, resolving merge conflicts, and summarizing repository state for context.

Two boundaries govern every requirement. First, **Git operations are local VCS operations.** The extension shells `git` (or drives the built-in `vscode.git` API) against the open workspace on the user's machine; that stays true regardless of which LLM trust mode powers the AI features on top. Second, the **AI layer obeys the three trust modes.** When a feature reads a diff and generates text (a commit message, a review comment, a conflict resolution), that inference routes through the surface's selected mode — Local, BYOK, or Managed Cloud — with a visible provider label and no silent promotion. Diffs, staged content, and conflict hunks are workspace data; handing them to app chat is explicit and redacted, never automatic (`docs/products/README.md`). BYOK is permitted on this surface (Desktop/CLI/VS Code only). In untrusted workspaces, write-side Git paths are gated (`vscode.workspace.isTrusted`).

## Diff Review

AI-proposed edits are reviewed as inline diffs before they touch the working tree. The patch engine parses `patch:path` envelopes with `<<<<<<< SEARCH` / `======= ` / `>>>>>>> REPLACE` hunks (`apps/extension-vscode/src/integrations/patchEngine.ts`), and decorations render additions/deletions inline (`apps/extension-vscode/src/providers/diffDecorationProvider.ts`). Users accept or reject per-hunk, per-file, per-batch, or globally via the `agi-workforce.accept*`/`reject*` commands and `agi-workforce.showOriginalContext` (expected-vs-actual), all declared in `apps/extension-vscode/package.json`. ✅ Built. A checkpoint is captured before applying changes so any accepted batch can be rewound (see Repository Summary / checkpoints). Requirements: no hunk applies without an explicit accept unless `agiWorkforce.autoApplyFixes` is enabled; rejection restores original bytes exactly; the provider that produced the diff is labeled; auto-apply is a restricted configuration in untrusted workspaces (`package.json:capabilities.untrustedWorkspaces`).

## Commit Messages

The `agi.git.commit` command is Built (`apps/extension-vscode/src/core/commandSetup.ts:797`). It prefers the `vscode.git` extension API (`repo.commit(msg, { all: true })`) and falls back to `execFile('git', ['add','-u'])` then `execFile('git', ['commit','-m', msg])` — `execFile`, never a shell, so commit messages pass as a single argv entry and shell metacharacters are never interpreted (PR-3B / F-12, F-19). The fallback refuses to run in untrusted workspaces. Today the message is **typed by the user** in an input box. ✅ Built for the commit action; 🔭 Planned for **AI-drafted commit messages** — generating a Conventional-Commits-style message from the staged diff, then presenting it for edit/accept, is not yet wired. When built, drafting must read only the staged diff, route generation through the selected trust mode with a visible provider label, never auto-commit without user confirmation, and never append machine co-author trailers (house rule).

## PR Review

Reviewing a full pull request — fetching the PR diff, walking files, emitting line-anchored review comments, and posting back to GitHub/GitLab — is 🔭 Planned. What exists is selection-scoped review: `agi-workforce.codeReview` (`apps/extension-vscode/src/core/commandSetup.ts:245`) reviews the current selection or file through the chat participant. ✅ Built (selection scope only). The PR-scoped design target (parity with Claude Code and Codex IDE PR review): resolve the branch/PR range via local `git` and an explicit forge auth handoff, produce findings grouped by file and severity, apply the same trust-mode routing and provider label, and treat forge credentials as a distinct secret — never bundled into the bridge token or a Managed-Cloud payload. No forge write (approve/merge/comment) happens without explicit user action.

## Merge Conflicts

AI-assisted resolution of Git merge conflicts (three-way conflicts left by `git merge`/`rebase`, marked `<<<<<<< HEAD` … `>>>>>>> branch`) is 🔭 Planned. Note the collision risk: AGI's own patch envelope reuses `<<<<<<< SEARCH` / `>>>>>>> REPLACE` markers (`apps/extension-vscode/src/integrations/patchEngine.ts`), which are **not** Git conflict markers — the planned resolver must parse Git's `HEAD`/incoming form distinctly and must not treat a real conflict as a patch hunk. Target behavior: detect conflicted files from `git status`, present each region with "ours / theirs / AI-merged" options rendered through the Diff Review pipeline, require per-region accept, run generation through the selected trust mode with a provider label, and re-stage only after the user confirms. Until built, users resolve conflicts with VS Code's native merge editor.

## Repository Summary

A working-tree summary is Built via `getGitContext()` (`apps/extension-vscode/src/data/contextBuilder.ts:130`): it runs `git status --porcelain` and `git diff --stat` (5s timeout, silent no-op outside a repo) and injects a compact status/change-stat block into chat context. Raw inspection is also Built through `agi.git.status` and `agi.git.diff`, which stream `git status`/`git diff` to an output channel (`apps/extension-vscode/src/core/commandSetup.ts:779`, `:788`). 🟡 Partial: this is a change/dirty-state summary, not a narrative repository overview (history, hotspots, ownership, branch topology), which is 🔭 Planned. Related and Built: the git-stash checkpoint system (`apps/extension-vscode/src/data/checkpointManager.ts`) snapshots working-tree state before AI edits (max 20, 5s timeout, `agi-checkpoint:` stash prefix) so summarized changes can be rewound. Requirement: any summary that leaves the machine (into Managed-Cloud chat) is redacted and explicit, never an automatic sync (CLI/VS Code stay workspace-scoped).

## Repository map

- `apps/extension-vscode/src/core/commandSetup.ts` — `agi.git.status`, `agi.git.diff`, `agi.git.commit`, `agi-workforce.codeReview`, checkpoint commands.
- `apps/extension-vscode/src/data/contextBuilder.ts` — `getGitContext()` status/diff-stat summary.
- `apps/extension-vscode/src/data/checkpointManager.ts` — git-stash checkpoint/restore.
- `apps/extension-vscode/src/integrations/patchEngine.ts` — SEARCH/REPLACE patch envelope parsing.
- `apps/extension-vscode/src/providers/diffDecorationProvider.ts` — inline diff decorations + accept/reject.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge (`ws://127.0.0.1:8787/ws`, token at `~/.agiworkforce/bridge-token`, 0600).
- `apps/extension-vscode/package.json` — command/keybinding/configuration contributions; `capabilities.untrustedWorkspaces`.
- `apps/extension-vscode/AGENTS.md` — nearest path-scoped rules.

## Competitor notes

Claude Code's VS Code extension and Codex IDE extension offer AI commit messages, PR review with inline comments, conflict assistance, inline diff review with approvals, and cloud-handoff previews. AGI's deliberate divergence: **multi-provider** — the diff, commit-draft, review, and conflict layers run through any provider chosen in the model picker (IDs sourced from `packages/types/src/models.json`), not a single vendor; **BYOK allowed here** (Desktop/CLI/VS Code only); **per-surface trust with visible labels** on every AI-driven Git action; **local-first Git** — `git` runs locally via `execFile`/`vscode.git` regardless of LLM mode, and **no automatic app-chat sync** — any handoff of diffs or summaries is explicit and redacted.

## Acceptance / Definition of Done

- [ ] **Build:** `pnpm --filter agi-workforce typecheck && pnpm --filter agi-workforce test` pass; git commands compile into `out/extension.js`; diff accept/reject round-trips restore original bytes.
- [ ] **Trust:** every AI-driven Git action (commit draft, review, conflict resolution) shows the active mode + provider label; nothing routes Local diffs/commit content to BYOK or Managed Cloud without an explicit, redacted fork; forge credentials are a distinct secret from the bridge token.
- [ ] **Security:** all git invocations use `execFile` (no shell); commit/write paths refuse untrusted workspaces; patch parser distinguishes Git conflict markers from AGI's SEARCH/REPLACE envelope; a checkpoint precedes any applied batch.

## Anti-patterns

- Routing staged diffs, commit content, conflict hunks, or repo summaries to Cloud/BYOK without explicit consent, redaction, and a provider label.
- Running `git` through a shell or forwarding attacker-controlled args (regresses PR-3B / F-12); auto-committing without user confirmation; appending machine co-author trailers.
- Claiming AI commit messages, PR review, or merge-conflict resolution are shipped — they are 🔭; only cite ✅ with a real path.
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`), routes, env vars, or command names.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups — use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise. 🟡 Note: `package.json:contributes.configuration` still lists a `agiWorkforce.tier` enum with `hobby`/`pro_plus`; that reconciliation is a separate tracked task.
- Referencing Supabase (fully migrated to Clerk + Neon + Stripe); treating a real Git conflict as a patch hunk because both use `<<<<<<<` markers.

# Agent Task Templates

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

Use these templates when splitting AGI Workforce work across Codex, Claude Code, Cursor agents, VS Code agents, opencode, or future internal agents.

## Exploration Task

Use when the agent must read and report without editing.

Required prompt fields:

- Goal.
- Read scope.
- Explicit non-goals.
- Questions to answer.
- Expected output format.
- "Do not edit files."

Required final output:

- Files/directories inspected.
- Findings ordered by severity or importance.
- Unknowns.
- Suggested next tasks.
- Checks run, if any.

## Implementation Task

Use when the agent owns a bounded code/docs change.

Required prompt fields:

- Goal.
- Lane ID from `docs/agent-context/lanes.json`.
- Owned write paths.
- Paths that must not be edited.
- Existing plan/doc to follow.
- Required checks.
- Expected final summary.
- "You are not alone in the codebase; do not revert edits made by others."

Required final output:

- Files changed.
- Behavior changed.
- Checks run and result.
- Remaining risks.

## Review Task

Use when the agent should find bugs or architecture problems.

Required prompt fields:

- Review scope.
- Risk focus.
- Baseline branch/commit when relevant.
- Whether to inspect tests.
- "Do not edit files."

Required final output:

- Findings first, ordered by severity.
- File/line references.
- Reproduction or reasoning.
- Missing tests or residual risk.

## Verification Task

Use when the agent should run checks and summarize failures.

Required prompt fields:

- Commands to run.
- Expected environment.
- Which failures are known.
- Whether the agent may fix failures.

Required final output:

- Command results.
- First failing error, if any.
- Files likely responsible.
- Fix recommendation.

## Parallel Work Rules

- Split by disjoint write paths.
- Keep immediate blockers local; delegate sidecar tasks.
- Never assign two agents to the same unresolved files unless one is read-only.
- Ask workers to edit directly only inside their owned paths.
- Integrate returned work with a human or lead-agent review before committing.
- For long-running or parallel implementation, follow `docs/engineering/agent-native-development.md`.

## Worktree Task

Use when an agent or human needs an isolated branch/worktree.

Required prompt fields:

- Goal.
- Branch name.
- Worktree path.
- Lane ID from `docs/agent-context/lanes.json`.
- Owned write paths.
- Integration target.
- Required checks before handoff.

Required final output:

- Branch/worktree used.
- Files changed.
- Checks run and result.
- Integration notes.
- Remaining risks.

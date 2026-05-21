# Agent Context

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

This folder is the tool-neutral map for coding agents. Codex, Claude Code, Cursor, VS Code agents, opencode, and future agents should read this before deep exploration.

## Read Order

1. Root `AGENTS.md` - canonical operating rules for all coding agents.
2. `repo-map.json` - where product and platform code lives.
3. `lanes.json` - write-lane map for 15+ parallel implementation agents.
4. `shared-files.md` - collision policy for manifests, locks, root docs, CI, schemas, and migrations.
5. `commands.json` - exact commands by surface.
6. `risk-map.json` - high-risk areas and required checks.
7. `known-flaws.md` - open issues and stale claims agents should not rediscover as new.
8. `doc-status.json` - which docs are current, historical, or working notes.
9. `../engineering/naming-conventions.md` - product, CLI, files, folders, packages, branches, commits, versions, and hook policy.
10. `bug-finding-guide.md` - workflow for finding bugs without getting lost in stale docs.
11. `agent-task-templates.md` - standard prompts for exploration, implementation, review, and verification agents.

## Rules

- Treat `AGENTS.md` as canonical. Tool-specific files such as `CLAUDE.md` must point back to it.
- If a bug is already listed in `known-flaws.md`, update its status instead of creating a duplicate finding.
- If a source-of-truth conflict appears, prefer `docs/decisions/CURRENT_DECISIONS.md`, `PLAN.md`, and this folder over older launch plans.
- Keep JSON files parseable without comments.
- Split parallel agent work by disjoint write paths from `lanes.json` and record verification evidence before committing.
- Do not edit shared files from feature lanes; route them through the integrator or a lane that owns shared files.
- Run `pnpm check:hooks` after editing Husky hooks, commit rules, package scripts, or repo-operability checks.
- Run `pnpm check:llm-operability` after editing report retention, CI, CODEOWNERS, structure, ownership, or agent-context rules.

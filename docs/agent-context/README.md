# Agent Context

Status: Current
Owner: Platform lead
Last updated: 2026-05-28

This folder is the tool-neutral map for coding agents. Codex, Claude Code, Cursor, VS Code agents, opencode, and future agents should read this before deep exploration.

## Read Order

1. Root `AGENTS.md` - canonical operating rules for all coding agents and the entry point before this folder.
2. `../current/source-of-truth.md` - product definition, v1 target, current position, parity baseline, P0 gaps, docs rule, and verification rule.
3. `../current/agi-product-requirements.md` - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
4. `../current/parity-implementation-matrix.md` - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
5. `../current/byok-open-model-provider-strategy.md` - BYOK provider classes, hosted open-model APIs, open model priorities, and Desktop model-selector rules.
6. `repo-map.json` - where product and platform code lives.
7. `known-flaws.md` - open issues and stale claims agents should not rediscover as new.
8. `commands.json` - exact commands by surface.
9. Nearest path-scoped `AGENTS.md` - local surface rules before editing.
10. `risk-map.json` - high-risk areas and required checks.
11. `doc-status.json` - which docs are current, historical, or working notes.
12. `lanes.json` - write-lane map for 15+ parallel implementation agents.
13. `shared-files.md` - collision policy for manifests, locks, root docs, CI, schemas, and migrations.
14. `../engineering/naming-conventions.md` - product, CLI, files, folders, packages, branches, commits, versions, and hook policy.
15. `../engineering/agent-harness-rollout.md` - context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
16. `../engineering/service-layer.md` - action/route orchestration vs reusable service mechanics.
17. `bug-finding-guide.md` - workflow for finding bugs without getting lost in stale docs.
18. `agent-task-templates.md` - standard prompts for exploration, implementation, review, and verification agents.

## Rules

- Treat `AGENTS.md` as canonical. Tool-specific files such as `CLAUDE.md` must point back to it.
- If a bug is already listed in `known-flaws.md`, update its status instead of creating a duplicate finding.
- If a source-of-truth conflict appears, prefer `docs/product/definition.md`, `docs/decisions/README.md`, `PLAN.md`, and this folder over older launch plans.
- Keep JSON files parseable without comments.
- Split parallel agent work by disjoint write paths from `lanes.json` and record verification evidence before committing.
- Do not edit shared files from feature lanes; route them through the integrator or a lane that owns shared files.
- Keep root context lean; put local conventions in path-scoped `AGENTS.md` files and owner READMEs.
- Extract repeated operational mechanics into service functions only when reuse or risk justifies it; keep product policy in actions, routes, and command handlers.
- Run `pnpm check:hooks` after editing Husky hooks, commit rules, package scripts, or repo-operability checks.
- Run `pnpm check:llm-operability` after editing report retention, CI, CODEOWNERS, structure, ownership, or agent-context rules.

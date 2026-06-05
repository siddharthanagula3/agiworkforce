# Documentation Reset And Re-Audit Plan

Status: Current
Owner: Platform lead
Last updated: 2026-06-05
Purpose: Replace stale Markdown sprawl with source-backed current docs, archived historical inputs, and verifiable rebuild waves.

## Operating Rules

- Keep root control docs lean: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `PLAN.md`, `TODO.md`, `THIRD_PARTY_LICENSES.md`, and required contribution/build docs.
- Archive stale research, audit, report, and plan Markdown with path preservation under `docs/archive/`.
- Do not archive executable agent contracts until classified: `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, `.mcp.json`, and path-scoped `AGENTS.md`.
- Treat archived docs as rebuild inputs only. Current claims must come from source code, current docs, official docs, or fresh audit evidence.
- Use local reference repos frequently for parity patterns: Claude reference, Codex CLI, Hermes, OpenClaw, Claw Code, and Gemini CLI. Do not copy proprietary code or assets.

## Wave Strategy

| Wave | Scope                             | Completion condition                                                                                                                                 | Verification                                             |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0    | Guardrails and archive rules      | `docs/AGENTS.md`, doc-status map, stale-phrase checks, and archive manifest exist.                                                                   | `pnpm docs:check`, `pnpm check:repo-organization`        |
| 1    | Stale audit/report archive        | Active `audit/` contains only current index, active Desktop evidence, and report policy. Dated May audit corpus is archived.                         | `pnpm docs:check`, `pnpm check:report-retention`         |
| 2    | Agent contract cleanup            | `.claude`, `.codex`, `.agents`, skills, plugins, and MCP configs have stale claims removed and loading contracts classified.                         | `pnpm check:agent-context`, targeted contract searches   |
| 3    | Surface-by-surface source rebuild | Desktop, Web, Mobile, CLI, Chrome, VS Code, services, packages, and crates each get a current source-backed README or AGENTS file only where needed. | Surface commands from `docs/agent-context/commands.json` |
| 4    | Current docs rebuild              | `docs/current` is reduced to decision-complete product, parity, architecture, provider, launch, and operability truth.                               | `pnpm docs:check`, source-reference spot checks          |
| 5    | Public/demo readiness docs        | Public README, demo checklist, release notes, and investor-facing claims are rebuilt from verified product state only.                               | Browser/manual demo checks plus claim verification table |
| 6    | Final laziness audit              | Re-scan Markdown, unresolved archive references, stale phrases, fake claims, dead links, and unsupported current-status docs.                        | `rg`, `pnpm check:llm-failures`, `git diff --check`      |

## Current Wave Status

- Wave 0: complete, guardrails added and passing.
- Wave 1: complete, stale May audit/report/plan corpus archived and current audit index rebuilt.
- Wave 2: in progress, tracked Claude/Codex mobile agent contracts corrected and stale local Claude memory moved into an ignored local archive.
- Waves 3-6: pending after the current Desktop tool-parity implementation slice is stabilized.

## Parallel Agent Pattern

Use read-only exploration agents before broad moves:

1. Dependency mapper: find code and doc references before archiving.
2. Contract classifier: inspect hidden agent/tooling folders and path-scoped rules.
3. Reference comparator: check local Claude, Codex, Hermes, OpenClaw, Claw Code, and Gemini patterns.

Editing agents must work one wave at a time and finish with checks. Any finding that cannot be verified from current source becomes a tracked rebuild item, not a current claim.

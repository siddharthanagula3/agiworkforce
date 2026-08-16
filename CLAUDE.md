# Claude Code Repository Context

Status: Current
Owner: Platform lead
Last updated: 2026-07-15

Read `AGENTS.md` first. It is the canonical, tool-neutral entry point. This
file keeps only Claude Code-specific guidance and the mirrored critical rules
that must be visible before deeper context is loaded.

Claude-specific notes must also follow
`docs/engineering/naming-conventions.md`,
`docs/engineering/service-layer-architecture.md`, and
`docs/engineering/agent-harness-rollout.md`.

## Claude-Specific Guidance

- Use the nearest path-scoped `AGENTS.md` before editing a surface, package,
  crate, service, database, or infrastructure boundary.
- Use `docs/agent-context/repo-map.json` and
  `docs/agent-context/commands.json` instead of duplicating repository maps or
  command inventories here. Single-test invocations live in `commands.json`
  under `surfaces.<surface>.testSingle` and repo-wide `testSinglePackage`.
- Do not add Commands, Repo Map, or Product Lock sections (even the literal
  heading text) to this file — `pnpm check:agent-context` fails them as
  duplicated repo truth. This includes `/init`-style regeneration. Run that
  check after editing this file or `AGENTS.md`.
- `.claude/settings.json` hooks run on every Edit/Write: lockfile edits
  (`pnpm-lock.yaml`, `Cargo.lock`, etc.) are blocked — change manifests and
  run the package manager instead — and saved files are auto-formatted with
  Prettier, so do not hand-reformat or fight post-save diffs.
- Use `PLAN.md` for the active production restructure and its executable queue
  (the Exact Resume Point section), `CHANGELOG.md` for verified completed
  slices, and `docs/agent-context/known-flaws.md` for durable defects.
- Keep Claude-specific loader configuration under `.claude/`; it is not a
  product or architecture source of truth.
- Do not add Claude-generated attribution footers to commits or pull requests.

## Critical Rules

These rules must stay mirrored in `AGENTS.md` and guarded by
`pnpm check:agent-context`.

- Verify current facts from repo files, official docs, web search, or configured plugins/MCP before changing fast-moving APIs, model IDs, pricing, App Store rules, provider terms, framework behavior, or release claims.
- Read model IDs from `packages/contracts/types/src/models.json` and provider capability metadata. Never invent, guess, or hardcode a model ID from training data. Concrete catalog or provider model IDs may appear only in canonical model-registry sources and generated mirrors; production code, tests, fixtures, snapshots, comments, and docs must derive them from the catalog, routing slots, or capability queries. Synthetic test IDs must be obviously non-provider fixtures. Replacing a model must not require editing consumers.
- Next.js 16 uses `proxy.ts` and an exported `proxy` function. Do not rename it back to `middleware.ts`.
- Local, BYOK, and Managed Cloud are separate trust boundaries.
- Never silently route Local chats, files, or developer sessions to BYOK or managed cloud.
- Local to BYOK must be an explicit fork/continuation with context selection, secret scan, payload preview, user consent, and visible provider label.
- Managed cloud is in public alpha and open by default — the private-beta/waitlist launch gate has been removed (founder decision, 2026-06-27). The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains ONLY as an incident-response kill-switch (set to `0`/`false`/`off` to re-gate). Billing, metering, abuse, fraud, refunds, chargebacks, provider terms, retention, and deletion controls must keep pace with public usage, but they no longer gate access.
- Do not invent APIs, routes, env vars, schemas, prompts, docs, or release status. If the repo does not prove it, mark it unknown or add a tracked gap.
- Finish what you start. Do not ship a capability in half: if a control is
  added, it must be wired through every layer to the thing it claims to do —
  UI state, client options type, request contract, network body, and server
  handler — and verified by observing the real request or result, not by a
  passing typecheck. A picker that renders but never reaches the API, a model
  added to the registry with no way to select it, or a validated parameter no
  caller can send are all failures, not progress. If the full path genuinely
  cannot be completed, stop and record the exact remaining step in
  `ExecutionPlan.md` as `TODO` or in `FoundersAssistance.md` as
  `BLOCKED_BY_HUMAN` — never leave a half-wired surface and describe it as done.
- Do not mark work complete from build success alone. Inspect relevant files, run surface checks, inspect `git status`/diff, and record unresolved risks.
- Treat unusual product behavior as a bug, not as background noise: unreadable UI, dead or duplicate controls, unexpected redirects, visible console/network errors, stale provider/model labels, fake availability badges, and confusing auth or upgrade gates must be fixed immediately when reproducible, or recorded as a concrete blocker with evidence.
- Do not treat generated audit/report markdown as remediation. Audit files are triage queues: open the cited source files, confirm the issue in implementation, patch production paths when safe, and only summarize after code changes or explicit blocked risks are recorded.
- Write lean code with no comments. Name things so the code reads without narration. Comment only when a reader would otherwise get it wrong: a non-obvious constraint, a correctness or security reason a change would silently break, or a directive the tooling reads (`eslint-*`, `@ts-expect-error`, `/// <reference>`, license headers). Never restate what the line already says, never narrate history or the diff, and never leave a comment where a clearer name or a test would do the job.
- Use the nearest path-scoped `AGENTS.md` before editing high-risk areas.

Follow the LLM Failure Prevention Rules in `AGENTS.md` and the machine-readable
taxonomy at `docs/agent-context/llm-failure-taxonomy.json`. Do not leave
unvalidated LLM/tool/API/IPC inputs, fake tests, swallowed assertions,
production stubs, or vulnerable dependency ranges.

## Claude Code Context Order

1. `AGENTS.md`
2. nearest path-scoped `AGENTS.md`
3. `docs/current/source-of-truth.md`
4. `docs/agent-context/repo-map.json`
5. `docs/agent-context/commands.json`
6. `docs/agent-context/known-flaws.md`
7. relevant architecture decision or implementation plan

For the active restructure, resume from the exact checkpoint in `PLAN.md`.

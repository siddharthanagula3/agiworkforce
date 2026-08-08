# Documentation Agent Rules

Status: Current
Owner: Docs/platform
Last updated: 2026-08-07

Read root `AGENTS.md` before this file. This file applies to documentation work under `docs/`.

## Lane Contract

- Current product truth lives in `docs/current/`, `docs/decisions/CURRENT_DECISIONS.md`, root `PLAN.md`, root `TODO.md`, and `docs/agent-context/`.
- Durable evidence and findings live in `docs/agent-context/known-flaws.md`; dated point-in-time research lives in `docs/research/`. Promote only verified durable conclusions into current docs.
- The former `reports/`, `tasks/`, and `docs/archive/` directories were removed repo-wide on 2026-06-28 (clean-repo pass). Do not cite them as existing or recreate them without a current decision doc. Root `audit/` has since been reintroduced as the live evidence-ledger and triage root; treat its entries as claims to verify in code, never as proof that work is complete. If a future archiving need arises, use `docs/archive/<date>-<reason>/` per `docs/engineering/naming-conventions.md`.

## High-Risk Areas

- Trust-boundary claims for Local, BYOK, and Managed Cloud.
- Model IDs, provider capabilities, pricing, availability, and SDK behavior.
- Launch, release, billing, customer, funding, traction, production-readiness, and parity claims.
- Agent instruction files and skills that are loaded by tools.

## Rules

- Do not preserve stale claims for politeness. If code or current sources do not prove a claim, remove it or mark it unknown.
- Do not move executable Markdown contracts such as `SKILL.md`, agent prompts, command prompts, or store metadata unless their loader/consumer is checked.
- Do not bulk-archive feature READMEs or other current docs without checking source references and guardrails.
- When archiving, preserve the original path under `docs/archive/<date>-<reason>/` and add a short manifest entry.

## Verification

- `pnpm docs:check`
- `pnpm check:agent-context`
- `pnpm check:doc-status`
- `pnpm check:repo-organization`
- `pnpm check:report-retention`
- `pnpm check:non-md-artifacts`

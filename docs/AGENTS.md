# Documentation Agent Rules

Status: Current
Owner: Docs/platform
Last updated: 2026-06-05

Read root `AGENTS.md` before this file. This file applies to documentation work under `docs/`.

## Lane Contract

- Current product truth lives in `docs/current/`, `docs/decisions/CURRENT_DECISIONS.md`, root `PLAN.md`, root `TODO.md`, and `docs/agent-context/`.
- Evidence lives in `audit/` and `reports/`; promote only verified durable conclusions into current docs.
- Historical material lives in `docs/archive/`; never cite it as current unless a current doc explicitly references it.
- Working notes in `tasks/` and archived hardening/report collections are rebuild inputs, not source of truth.

## High-Risk Areas

- Trust-boundary claims for Local, BYOK, and Managed Cloud.
- Model IDs, provider capabilities, pricing, availability, and SDK behavior.
- Launch, release, billing, customer, funding, traction, production-readiness, and parity claims.
- Agent instruction files and skills that are loaded by tools.

## Rules

- Do not preserve stale claims for politeness. If code or current sources do not prove a claim, remove it or mark it unknown.
- Do not move executable Markdown contracts such as `SKILL.md`, agent prompts, command prompts, or store metadata unless their loader/consumer is checked.
- Do not bulk-archive `tasks/**`, `audit/**`, `reports/**`, or feature READMEs without checking source references and guardrails.
- When archiving, preserve the original path under `docs/archive/<date>-<reason>/` and add a short manifest entry.

## Verification

- `pnpm docs:check`
- `pnpm check:agent-context`
- `pnpm check:doc-status`
- `pnpm check:repo-organization`
- `pnpm check:report-retention`
- `pnpm check:non-md-artifacts`
- `pnpm check:readme-ownership`

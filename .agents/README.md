# Agent Skills

Status: Current
Owner role: Platform lead
Last updated: 2026-05-21
Kind: shared agent skills

## Purpose

`.agents/` stores repo-shared skills that coding agents may load on demand. Skills must be self-describing and must not become a dumping ground for project rules that belong in `AGENTS.md` or `docs/agent-context/`.

## Tracked Policy

- Each tracked skill directory under `.agents/skills/` must include `SKILL.md`.
- Skill evals may live under `evals/`, but eval-only directories are not valid shared skills.
- Executable scripts inside skills require owner and license review before public distribution.
- Keep local or experimental skills outside the tracked repo unless they are promoted with documentation.

## Verification

- `pnpm check:agent-context`
- `pnpm check:repo-organization`

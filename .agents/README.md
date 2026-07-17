# Agent Skills

Status: Current
Owner role: Platform lead
Last updated: 2026-07-14
Kind: shared agent skills

## Purpose

`.agents/` is the loader-owned root for project-specific skills that coding
agents may load on demand. General vendor/framework skills belong in the
developer's installed plugin/skill catalog instead of being vendored into this
product repository.

## Tracked Policy

- Each tracked skill directory under `.agents/skills/` must include `SKILL.md`.
- Add a repository skill only when it encodes AGI-specific mechanics that
  cannot live in `AGENTS.md`, a deterministic script, or canonical docs.
- Skill evals may live under `evals/`, but eval-only directories are not valid
  shared skills.
- Executable scripts require owner and license review before distribution.
- Never store credentials, private customer data, or generated reports here.

## Verification

- `pnpm check:agent-context`
- `pnpm check:repo-organization`

# Shared Skill Catalog

Status: Current
Owner role: Platform lead
Last updated: 2026-07-14
Kind: skill catalog

## Purpose

This folder is intentionally empty except for this policy file. General
third-party skills are installed through the agent/plugin runtime; only future
AGI-specific, repository-owned skills belong here.

## Rules

- Use lowercase kebab-case directory names.
- Include `SKILL.md` in every skill directory.
- Put test fixtures and evals under `evals/`.
- Put helper programs under `scripts/` and document credential requirements.
- Do not duplicate general framework or vendor skills already distributed by
  the installed agent/plugin ecosystem.
- Do not store credentials, private customer data, or generated reports here.

# Shared Skill Catalog

Status: Current
Owner role: Platform lead
Last updated: 2026-05-21
Kind: skill catalog

## Purpose

This folder contains tracked skills available to local coding-agent tools. Each child directory must be independently understandable from its `SKILL.md`.

## Rules

- Use lowercase kebab-case directory names.
- Include `SKILL.md` in every skill directory.
- Put test fixtures and evals under `evals/`.
- Put helper programs under `scripts/` and document credential requirements in the skill text.
- Do not store credentials, private customer data, or generated reports here.

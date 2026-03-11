# Harness Audit Command

Audit the current repository's agent harness setup and return a prioritized scorecard.

## Usage

`/harness-audit [scope] [--format text|json]`

- `scope` (optional): `repo` (default), `hooks`, `skills`, `commands`, `agents`
- `--format`: output style (`text` default, `json` for automation)

## What to Evaluate

Score each category from `0` to `10`:

1. Tool Coverage
2. Context Efficiency
3. Quality Gates
4. Memory Persistence
5. Eval Coverage
6. Security Guardrails
7. Cost Efficiency

## Output Contract

Return:

1. `overall_score` out of 70
2. Category scores and concrete findings
3. Top 3 actions with exact file paths
4. Suggested skills to apply next

## Checklist

- Inspect `.opencode/` config, commands, and agent coverage.
- Verify cross-harness parity for `.claude/`, `.opencode/`.
- Flag broken or stale references.

## Arguments

$ARGUMENTS:
- `repo|hooks|skills|commands|agents` (optional scope)
- `--format text|json` (optional output format)

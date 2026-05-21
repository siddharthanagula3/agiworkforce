# Generated Artifact Policy

Status: Current proposal
Owner: Platform + QA
Last updated: 2026-05-20

Purpose: stop generated captures, reports, build outputs, and local tool artifacts from hiding real source code.

Current enforcement: `pnpm check:generated-artifacts` is debt-aware. It fails new unclassified generated artifacts and warns on known tracked local/generated debt until root scratch files and transient captures are moved or untracked.

## Policy

| Artifact type               | Default location                                                 | Tracking rule                                                                   |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Build output                | `dist/`, `build/`, `.next/`, `target/`, app-specific output dirs | Ignore. Never commit unless a package explicitly requires static source output. |
| Test output                 | `test-results/`, `playwright-report/`, coverage dirs             | Ignore. Commit only curated reports under `reports/`.                           |
| Browser automation captures | `.playwright-mcp/`                                               | Ignore transient logs/page YAML; move durable screenshots/repros to `reports/`. |
| Screenshots/design captures | `reports/<topic>/`                                               | Track only when they are durable evidence.                                      |
| Audit scan raw output       | `audit/reports/<date-or-topic>/`                                 | Track when tied to a report and useful for evidence.                            |
| Root scratch files          | root                                                             | Do not allow. Move to `reports/root-scratch-archive/<date>/` or `_archive/`.    |
| Local credentials/config    | `.env*`, `.mcp.json`, local settings                             | Ignore. Commit sanitized examples only.                                         |

## Current Tracked Debt

- Root screenshots and scratch markdown are tracked.
- `.playwright-mcp/` includes tracked page YAML and screenshots.
- `reports/frontend-reference-comparison/` includes useful screenshots and should remain under reports.
- `audit/reports/` contains large raw scans; keep if tied to dated audit evidence, otherwise archive/compress later.

## Required Guardrails

- `scripts/check-repo-organization.mjs` should warn on known debt now.
- After cleanup, the same script should fail on new root scratch files and transient `.playwright-mcp` files.
- CI should run `pnpm check:llm-operability`.
- Add `.gitignore` rules for transient `.playwright-mcp` captures after durable evidence is moved.

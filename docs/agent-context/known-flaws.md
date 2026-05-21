# Known Flaws And Drift Ledger

Status: Current
Owner: Platform + security
Last updated: 2026-05-20

Use this file to prevent duplicate bug discovery. If an agent finds one of these again, update the row instead of reporting it as new.

| ID               | Severity | Status       | Owner             | Paths                                                                    | Finding                                                                                                                                 | Verification                                                         |
| ---------------- | -------- | ------------ | ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AGENT-DOC-01     | Medium   | Open         | Platform          | `AGENTS.md`, `CLAUDE.md`                                                 | Tool-specific agent docs were duplicated and stale. Root `AGENTS.md` is now canonical; `CLAUDE.md` must remain a mirror.                | `pnpm check:agent-context`                                           |
| ORG-ROOT-01      | Low      | Open debt    | Platform          | repo root                                                                | Root contains scratch markdown/images and generated artifacts. They are classified as debt until moved to dated archive/report folders. | `pnpm check:repo-organization`                                       |
| ORG-TOOL-01      | Medium   | Open         | Platform          | `.claude/`, `.codex/`, `.cursor/`, `.opencode/`, `.agents/`, `.mcp.json` | Tool folders/configs need a contract ledger before any move/delete.                                                                     | `pnpm check:repo-organization`                                       |
| DOC-DRIFT-01     | Medium   | Open         | Docs              | `docs/plans/`, `docs/archive/`, `tasks/research/`, `reports/`            | Current, historical, working, and generated docs are still mixed. `doc-status.json` is the interim index.                               | `pnpm check:agent-context`                                           |
| BOUNDARY-01      | High     | Guarded      | Platform          | `apps/`, `packages/`, `services/`                                        | Apps must not import other apps; packages must not import apps; services must not import UI packages.                                   | `pnpm check:boundaries`                                              |
| CLOUD-01         | High     | Product lock | Backend + billing | `services/`, `apps/web`, `supabase/`                                     | Managed cloud/credits remain waitlist/private beta until metering, fraud, refunds, disputes, retention, and deletion controls are done. | Read `docs/decisions/CURRENT_DECISIONS.md`                           |
| PRIVACY-01       | High     | Product lock | All surfaces      | `apps/*`, `packages/types`, `crates/*`                                   | Local to BYOK must be an explicit fork with context selection, secret scan, preview, and provider label.                                | Search `PrivacyMode`; add tests when implementing.                   |
| DOC-CLAIM-01     | Medium   | Open         | Docs + desktop    | `docs/PRD.md`, `AGENTS.md`, `CLAUDE.md`, `apps/desktop/src/App.tsx`      | Older docs disagree on whether parts of `UnifiedAgenticChat` are dead or partially live. Verify before deleting any desktop chat files. | `rg "UnifiedAgenticChat" apps/desktop docs AGENTS.md CLAUDE.md`      |
| SUPABASE-01      | High     | Open         | Backend + web     | `supabase/migrations/`, `apps/web/supabase/`                             | Canonical migrations are in root `supabase/migrations`; legacy web migrations still need reconciliation before paid tiers.              | Compare both migration dirs before billing work.                     |
| DX-README-01     | Medium   | Open         | Platform          | `apps/`, `packages/`, `crates/`, `services/`                             | Most packages, crates, and services lack local README files with owner, purpose, public API, and test commands.                         | See `audit/repo-organization/package-readme-coverage-2026-05-20.md`. |
| DX-NODE-01       | Low      | Open         | Platform          | `.nvmrc`, `node-version.txt`, `package.json`                             | Current shell may run Node 20 while repo expects Node 22, producing pnpm engine warnings.                                               | `node --version && pnpm --version`                                   |
| ORG-GENERATED-01 | Medium   | Guarded      | Platform          | `.playwright-mcp/`, `reports/`, `audit/reports/`, root screenshots       | Generated captures now have a strict tracked-artifact check; remaining work is retention review for existing reports.                   | `pnpm check:generated-artifacts`                                     |

## Update Rules

- Add a row when a repeated bug class, stale claim, or high-risk open gap is discovered.
- Mark `Fixed` only after naming the PR/commit or verification command.
- Prefer owner roles over individual names until the team is hired.

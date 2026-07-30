# apps/web/features/analytics

Status: Current
Owner role: Web lead
Last updated: 2026-05-21
Purpose: Web analytics, usage, cost, and operational insight feature code.

## Status of `AnalyticsDashboard`

`pages/AnalyticsDashboard.tsx` renders **sample data only** (STB-10). No
analytics API is wired to it: executions, tokens, cost, the per-model split,
tool counts, activity rows, and the named team leaderboard are all fixtures. The
component renders its own sample-data banner so the caveat survives a
screenshot, and it deliberately has no refresh and no CSV export — both existed
and both operated on invented numbers.

Do not mount it on a user-facing route until it reads a real data source. The
change that wires the API must remove the banner and the fixture builder in the
same commit.

The chart/table components in `components/` are generic and take their data as
props; they are unaffected.

## Rules

- Keep analytics presentation and domain helpers here.
- Shared billing/accounting contracts come from `packages/contracts/types` or the relevant shared package.
- Do not call provider SDKs directly from analytics UI.

# Prioritized Audit Backlog - 2026-05-20

## P1

1. Reconcile Supabase migration directories before paid-tier launch.
   - Canonical: `supabase/migrations/`.
   - Legacy: `apps/web/supabase/migrations/`.
   - Required proof: canonical migrations contain Stripe idempotency RPCs, apply cleanly to staging, and web webhook path resolves the expected RPC.

2. Decide ownership of the large untracked mobile wave.
   - Includes mobile storage files, model screens, legal/store-listing files, tests, and services.
   - Required proof: either commit intentionally with tests or remove after confirming unused.

3. Persist mobile compliance consent ledger.
   - Current `mmkvConsentLedger` is in-memory only.
   - Required proof: consent survives app restart and is covered by unit tests.

## P2

1. Add web E2E coverage or remove stale config.
   - `apps/web/playwright.config.ts` exists, but no `apps/web/e2e` directory was present.

2. Burn down passing-test warning noise.
   - jsdom `window.confirm`/navigation messages and React `act(...)` warnings should be converted into explicit mocks or assertions.

3. Investigate web/desktop build warnings.
   - Vite externalization warnings and ineffective dynamic imports should be triaged for bundle/runtime impact.

4. Continue hardcoded model/provider/API URL sweep.
   - `scan-model-ids.txt` captured candidates. Confirm each is catalog-driven, test fixture only, or backlog.

5. Continue skipped/weakened test review.
   - `scan-skipped-tests.txt` captured candidates. Confirm each skip has an owner and removal condition.

6. Review service-role and privileged-token scan hits.
   - `scan-service-role.txt` captured candidates. Confirm no client bundle path can receive privileged credentials.

## P3

1. Archive or commit audit/research/doc sprawl.
   - Numerous untracked audit, research, reports, and docs files remain outside tracked state.

2. Consolidate duplicated docs/status claims.
   - `AGI_WORKFORCE.md`, `BUILD.md`, `README.md`, and historical audit docs contain time-sensitive status that can drift.

3. Add CODEOWNERS or ownership map for high-risk boundaries.
   - Suggested areas: native messaging, MCP/tool execution, provider adapters, Supabase migrations, billing/webhooks, mobile storage, extension background.

4. Reduce dependency graph bloat after security floor updates.
   - After advisories are clear, inspect why old/new ESLint-related packages and transitive graph versions coexist.

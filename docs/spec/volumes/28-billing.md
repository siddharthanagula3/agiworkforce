# Volume 28 — Billing

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 28)
Authority: `docs/strategy/05` (GTM/pricing), `docs/strategy/06` (financials), `docs/strategy/04` §5 (metering at scale), Vol 4 (Entitlement)

## Philosophy & Cloud/Local stance

We charge for the software, never for the tokens. Compute passes through at cost — like electricity — and the business is the orchestration, trust/governance layer, connectors, compliance tooling, and the work the product performs (`docs/strategy/05` §1, §4). This is both a trust feature and a structural cost advantage: Local and BYOK push inference onto the user's device or provider account, so AGI's billing system only has to meter and bill the _Managed_ slice (`docs/strategy/04` §1). That makes metering correctness the single most important property here — when inference is your COGS, a meter that under-bills or double-bills on retries is an existential margin bug (`04` §3, `06`). Local/BYOK users may have zero billable inference and must never be charged token markup. Spend caps and quotas are a server-side safety control, not a client convenience.

## Binding rules

1. Tokens pass through at cost. No markup on inference. Monetize the software layer (`docs/strategy/05`). Marketing must not imply token resale margin.
2. Metering is exactly-once: idempotent debit on retries/partial runs; reserve-then-settle (reserve on start, settle/refund on completion or failure).
3. Spend limits and quotas are enforced server-side, before the provider call — never client-side only.
4. A daily drift audit reconciles usage events against the credit ledger; non-zero drift is an alert (Vol 29), and a launch gate before Managed agentic billing scales (`BILL-01`, `04` §5).
5. Cost estimation shown pre-send must derive from catalog pricing (`models.json`) — never invented numbers.
6. Tiers are Free, Plus, Pro, Max, Enterprise. Entitlement, not just sign-in, gates paid capability (Vol 4/27).
7. Invoices, refunds, and chargebacks have defined flows; refunds reverse the ledger idempotently.
8. Usage UI must show real data or an honest empty state — never fabricated zeros or placeholder history (R10/R15, `docs/strategy/03`).

## Repository map (real paths)

- Metering/credits (gateway): `services/api-gateway/src/routes/credits.ts`, `src/routes/usage.ts`, `src/middleware/planGate.ts`; managed gate `src/middleware/managedComputeGate.ts`.
- Stream→meter path: `services/api-gateway/src/routes/providerStream.ts` (token accounting at stream completion).
- Schema (canonical, `apps/web/db/neon`): `0003_subscriptions.sql`, `0004_token_credits.sql`, `0012_stripe.sql`, `0030_allow_enterprise_subscription_tier.sql`, `0033_auto_economy_trial_usage.sql`, `0044_fix_increment_usage_unit_bug.sql` (usage-unit bug fix).
- Web billing UI/hooks: `apps/web/features/billing/hooks/` (note R10: history hooks returning `[]` pending endpoints — build, don't fake).
- Pricing source of truth: `packages/contracts/types/src/models.json` (per-provider `defaultPricing`, per-model `inputCost`/`outputCost`).
- Cost-control routing tiers: `auto-economy`/`auto-balanced`/`auto-premium` (Vol 8) — the margin lever (`04` §4).

## Competitor notes (`docs/strategy/01`, `02`)

Incumbents monetize tokens directly: subscriptions + relative-multiplier rate limits + weekly caps + overage; API token metering with caching/batch discounts; agent billing on tokens **plus** session-hour fees (Claude Managed Agents at ~$0.08/session-hour; `01` §2.2). 2026 saw flat AI subscriptions break under inference cost — GitHub moved Copilot to usage-based; Anthropic reportedly burned ~$8 of compute per $1 of subscription (`05` §1). AGI's deliberate divergence: the only safe flat plan is one where inference is BYOK or genuinely passed through — our architecture already avoids the trap. We bake prompt caching (0.1× input on hit) and batch (50% off) into the Managed gateway by default to cut the pass-through bill (`04` §4). We do **not** copy the metered-black-box framing; "no metered surprise" is a sales message (`05` §5).

## Checklists

### Metering correctness (the critical path)

- [ ] Every Managed token billed exactly once; retries carry an idempotency key.
- [ ] Reserve-then-settle: reserve credits at stream start, settle actuals at completion, refund on failure.
- [ ] Partial/interrupted streams bill only consumed tokens (reconcile with Vol 24 interrupted state).
- [ ] Usage unit is correct after `0044` fix; no double-counting prompt vs. completion.
- [ ] Token counts derive from provider response, validated against catalog token multipliers.

### Pricing, estimation & passthrough

- [ ] Cost estimate pre-send reads `models.json` pricing; no hardcoded rates.
- [ ] Passthrough = provider cost; no markup added to inference line.
- [ ] Caching/batch discounts applied and reflected in the metered cost.
- [ ] Cheap/economy routing default for casual traffic (margin lever, `04`).

### Tiers, quotas & spend limits

- [ ] Free/Plus/Pro/Max/Enterprise entitlements enforced server-side.
- [ ] Monthly spend limit + weekly limits enforced before the provider call.
- [ ] Quota exhaustion returns a clear upgrade/limit message, never a silent stop.
- [ ] Auto-reload (if enabled) is consent-gated and capped.

### Invoices, refunds & disputes

- [ ] Invoice list shows plan, due date, total, status, action (source-of-truth Billing settings) with real data.
- [ ] Refund reverses the ledger idempotently and is auditable.
- [ ] Chargeback/dispute path defined and logged (Vol 30 audit).
- [ ] Stripe (or payment link) integration handles webhooks idempotently (`0012_stripe.sql`).

### Drift audit & reconciliation

- [ ] Daily job compares `usage_events` to the credit ledger; emits a drift metric.
- [ ] Non-zero drift raises a P1+ alert (Vol 29) and blocks Managed agentic billing scale-up.
- [ ] Reconciliation report retained for audit.

### Honest UI

- [ ] No fabricated billing history / zeros; show empty state until endpoints exist (R10/R15).
- [ ] Current-session usage, balance, and limits reflect server truth.

## Definition of Done

Reserve-then-settle and idempotent retry proven by tests on the credits/usage path; interrupted-stream billing reconciled with Vol 24; pricing/estimation sourced from `models.json` (no literals); spend-limit enforcement verified server-side; daily drift audit implemented and wired to alerting with a green baseline; billing-history UI either real or an honest empty state (no fabricated rows); Stripe webhooks idempotent. Gateway billing tests green (`services/api-gateway/__tests__/routes/`).

## Anti-patterns

- Adding any markup to pass-through inference, or implying token-resale margin in marketing.
- Client-side-only spend limits or quota checks.
- Non-idempotent debit that double-charges on retry.
- Billing the full prompt on an interrupted/failed stream.
- Hardcoded prices instead of `models.json`.
- Fabricated billing history or placeholder zeros shown as real (R10/R15).
- Scaling Managed agentic billing before the drift audit is green.

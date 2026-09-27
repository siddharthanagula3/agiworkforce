# Founder decisions, 2026-09-27

Status: Current
Owner: Founder, recorded by the billing program
Last updated: 2026-09-27

The founder's billing decisions of 2026-09-27, in the shape of
`2026-09-15-founder-decisions.md`.

## D-2026-09-27-01 Individual plans are billed monthly only

- Decision: Basic, Pro, Max 5x and Max 20x are sold with monthly billing only,
  and yearly Pro at $200 is withdrawn from sale. Team is a workspace plan and
  keeps both cadences, $25 per seat a month or $240 per seat a year.
- Why: the founder's call. The recorded economics agree with it. A plan's
  worst-case month of usage may cost at most half of what the plan charges for
  that month (`packages/contracts/types/src/__tests__/managed-usage-limits.test.ts`
  now holds yearly prices to the same ceiling). Yearly Pro works out at $16.67 a
  month against a $10 worst case, a 39.5% worst-case margin in
  `docs/research/unit-economics-2026-09-27.md`, while yearly Team at $20 a seat
  a month meets the ceiling exactly.
- Existing subscribers: a yearly Pro subscription bought before this decision
  keeps what it bought. Its Stripe Price stays mapped to Pro, so it keeps
  renewing yearly at its price with Pro's allowances until the subscriber
  changes or cancels it; nobody is moved. That is more than section 10 of the
  terms promises, which is an annual subscription's price through the end of
  its current term. No new yearly purchase of an individual plan is possible.
- Follow-through:
  - the catalog publishes no yearly price for an individual plan and its type
    refuses one; `WITHDRAWN_BILLING_INTERVALS` records the withdrawal, and the
    catalog moved to version 2 with version 1's allowances kept for the
    subscriptions sold under it (`packages/contracts/types/src/billing-plan-catalog.ts`,
    `packages/contracts/types/src/managed-usage-limits.ts`);
  - checkout, `/api/upgrade`, `/api/upgrade/preview` and the waitlist refuse a
    yearly interval for an individual plan with a 400 that names the cadence
    the plan is sold with (`apps/web/lib/validations/checkout.ts`);
  - `STRIPE_PRICE_PRO_YEARLY` is no longer required or sold; it stays optional
    so renewals of existing yearly Pro subscriptions still resolve to Pro
    (`apps/web/lib/price-tier-mapping.ts`);
  - the pricing page's only cadence toggle is Team's; the chat upgrade chooser,
    `/upgrade/[plan]` and the desktop plans modal price individual plans
    monthly, Settings > Billing shows a yearly subscriber the yearly price they
    pay and that Pro is now sold monthly only, and the mobile store catalog has
    no yearly product (`packages/contracts/types/src/mobile-iap.ts`);
  - founder: archive the yearly Pro Price in Stripe, which stops new use while
    existing subscriptions keep renewing on it, and remove it from the billing
    portal's plan-switching products.

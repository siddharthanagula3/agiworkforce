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
- Existing subscribers: a legacy yearly Pro subscription keeps renewing yearly
  at its price, with Pro's allowances, until the customer changes or cancels
  it. Nobody is moved, so no customer's price changes and the 30-day notice in
  section 10 of the terms is not triggered. No new yearly purchase of an
  individual plan is possible. What a yearly subscriber sees in Settings >
  Billing and the plan change previews: "If you already pay yearly for Pro,
  nothing changes. Your subscription keeps its price and renews yearly until
  you switch to monthly or cancel. Once you switch to monthly, yearly billing
  is no longer available for that plan."
- The paths open to a yearly subscriber: renewal stays yearly; upgrading to
  Max 5x or Max 20x moves the subscription to that plan's monthly price at
  once, with the usual proration preview and the unused part of the year
  credited to the customer's Stripe balance for later invoices; Switch to
  monthly billing in Settings > Billing, or a smaller plan, takes effect when
  the yearly term ends; nothing offers a way back to yearly.
- Not decided here: moving legacy yearly subscribers to monthly without their
  asking. That changes their price, so it needs 30 days' notice on /pricing and
  /changelog, an email and a Stripe schedule per subscription, and it is a
  separate founder decision.
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
  - `assertUpgradeBillingInterval` lets a yearly subscriber upgrade onto a plan
    that is sold monthly only, and the preview clamps what is due today at zero
    and shows the rest as credit (`apps/web/lib/server/stripe-plan-change.ts`,
    `apps/web/app/api/upgrade/preview/route.ts`);
  - `readPlanChangeState` offers the same plan's monthly price as
    `cadenceSwitch`, and `scheduleDowngrade` schedules it for the end of the
    yearly term (`apps/web/lib/server/stripe-plan-change.ts`);
  - the pricing page's only cadence toggle is Team's; the chat upgrade chooser,
    `/upgrade/[plan]` and the desktop plans modal price individual plans
    monthly; Settings > Billing shows a yearly subscriber the yearly price they
    pay, the notice above and Switch to monthly billing; the mobile store
    catalog has no yearly product (`packages/contracts/types/src/mobile-iap.ts`);
  - `grandfatheredYearlyBillingNotice` in
    `packages/contracts/types/src/billing-plan-catalog.ts` is the one source of
    the notice, and the 2026-09-27 changelog entry announces the change
    (`apps/web/lib/changelog-entries.ts`);
  - founder: archive the yearly Pro Price in Stripe, which stops new use while
    existing subscriptions keep renewing on it, and remove it from the billing
    portal's plan-switching products.

## D-2026-09-27-02 Features ChatGPT and Claude do not offer are not built

The founder's standing rule is to match ChatGPT and Claude first, then Gemini
and Perplexity. Where neither ChatGPT nor Claude offers a control, we do not
build it, and the audit cell is recorded as not applicable by this decision.

- **Per-routine effort (S63.10).** ChatGPT tasks and Claude routines choose a
  model only; our routines already choose a model.
- **Per-routine notification settings (S63.30).** ChatGPT task notifications
  and Claude's task notifications are account-wide, which ours already are.
- **In-app display language, text size and reduced motion on mobile (S84.01,
  S84.05, S84.07).** The mobile apps follow the device settings, as ChatGPT and
  Claude do (D-2026-09-15-03).

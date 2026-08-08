# Founder Assistance

Status: Active
Owner: Founder
Last updated: 2026-08-08

Steps that require you personally, because they need a credential, an approval, or a
console I cannot reach. Each is written to be done without further context.

When this list is empty, nothing is waiting on you.

---

## 1. Nothing blocking right now

Both open items are automated and in flight:

- **PR #400** — CI fix (one Rust test has blocked 100 consecutive runs)
- **PR #401** — production fix (authenticated API returning 500 since 2026-08-07)

I have CLI permission for Vercel, Stripe and Neon, so merge and deploy proceed without you
once CI is green.

---

## 2. Waiting on you — Stripe live catalog

**Not urgent, but production cannot sell anything until it is done.**

Your **live** Stripe account has no current catalog. It holds three inactive products —
Max, Pro, Hobby — priced $299.99 / $29.99 / $10, none of which match what the site
advertises. There is no live Team, Basic or Max 15x product at all.

I can create these with the Stripe CLI, but creating **live** products spends real money
and Stripe prices archive rather than delete, so I want your explicit yes first.

**To approve:** reply "create the live Stripe catalog" and I will create 5 products and
~9 prices matching `BILLING_PLAN_PRICING`, then report every ID for your records.

**To do it yourself instead:** create products named exactly `Basic`, `Pro`, `Max 5x`,
`Max 15x`, `Team` with these recurring prices, then send me the price IDs:

| Product         | Monthly USD | Yearly USD | Monthly INR |
| --------------- | ----------- | ---------- | ----------- |
| Basic           | $7          | —          | ₹399        |
| Pro             | $20         | $200       | ₹1,999      |
| Max 5x          | $100        | —          | ₹9,999      |
| Max 15x         | $200        | —          | ₹24,999     |
| Team (per seat) | $25         | $240       | ₹1,999      |

---

## 3. Waiting on you — one environment variable

Team annual pricing is fully built and hidden, because the toggle only renders when the
Stripe price is checkout-ready. The price already exists in **test** mode.

Add to `apps/web/.env.local` (and to Vercel's environment for preview/production):

```
STRIPE_PRICE_TEAM_YEARLY_USD=price_1Tv2zR0zEfO6BZMhPTByLptE
```

Then restart the dev server. The Team monthly/annual toggle appears on its own.

I cannot write `.env` files — the sandbox blocks it, which is correct for secrets.

---

## 4. When the work is finished

You mentioned making the GitHub repository private again. Safe to do once the open PRs are
merged and CI has run — I will tell you when that point is reached.

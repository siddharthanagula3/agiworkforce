# Founder Assistance

Status: Active
Owner: Founder
Last updated: 2026-08-08

Steps that require you personally, because they need a credential, an approval, or a
console I cannot reach. Each is written to be done without further context.

When this list is empty, nothing is waiting on you.

---

## 1. BLOCKING — one toggle in the Vercel dashboard

**This is the only thing standing between you and production being restored.** Two minutes
of clicking.

Production has been returning HTTP 500 on every authenticated route since 2026-08-07
21:41 UTC. The fix is written, verified and merged-ready (PR #401) — I built it and
confirmed 197 route traces now carry the native binary that was missing.

**Every deploy fails at the final upload step**, production included:

```
Build Completed in /vercel/output [4m]
Deploying outputs...
Cannot patch preview comments when immutable static file upload is enabled.
Upgrade to next@v16.3.0-canary.32 or newer to resolve this.
status ● Error
```

The build succeeds every time. Vercel then tries to patch its Git PR comment and dies,
because Next 16.3.0 enabled immutable static uploads. There is no stable Next release that
fixes it — only `16.3.1-canary.8`, and I will not put a canary into production during an
incident.

The fix is to turn off Vercel's Git comments. I tried via the API and the PATCH was
silently rejected, so it needs the dashboard.

**Steps:**

1. Open https://vercel.com/siddharthanagula4/agiworkforce/settings/git
2. Find **Git Comments** (may be listed as "Comments" or under Git Integration)
3. Turn **off** both "Pull Request Comments" and "Commit Comments"
4. Save
5. Tell me it is done — I will redeploy immediately and confirm the 500s stop

Re-enable it whenever Next ships a stable release past 16.3.0; it is a convenience
feature, not a dependency.

**If you would rather not disable it:** the alternative is pinning Next to
`16.3.1-canary.8`. Say so and I will do that instead, but a canary in production carries
its own risk and I would not choose it.

---

## 2. In flight, no action needed

- **PR #400** — CI fix. One Rust test has blocked 100 consecutive runs and every E2E job
  for 18 days. Verified locally: full suite 1,837 passed / 0 failed.
- **PR #401** — the production fix above.
- **PR #402** — the ExecutionPlan working convention.

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

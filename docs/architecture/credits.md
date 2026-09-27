# Credits

Status: Current

## The one public definition

**1 credit = $0.005 of provider cost** at the provider's public list price.
Credits are the only usage unit any customer-facing surface shows: plan
allowances, usage bars, top-ups, credit history and receipts all read the same
number. Dollars appear only as the price paid at checkout.

| identity    | value                           |
| ----------- | ------------------------------- |
| 1 credit    | 5,000 microUSD of provider cost |
| 1 credit    | 0.5 ledger cents                |
| 200 credits | $1 of provider cost             |

## Charging

Every billable action is charged `credits = provider cost ÷ 5,000 microUSD`,
rounded up to 0.01 credit and never below cost (`chargeCreditsForMicrousd`).
Model tokens are priced from the model registry at list price; tools, media,
voice, sandbox and search are priced from the rate card. There is no separate
customer price: the plan price carries the margin, and a plan's full monthly
allowance costs at most half its monthly price.

## Plan allowances

| plan       | 5-hour   | weekly   | monthly          |
| ---------- | -------- | -------- | ---------------- |
| Free       | 2        | 15       | 20               |
| Basic      | 10       | 100      | 400              |
| Pro        | 50       | 500      | 2,000            |
| Max 5x     | 250      | 2,500    | 10,000           |
| Max 20x    | 1,000    | 5,000    | 20,000           |
| Team       | 50       | 500      | 2,000 (per seat) |
| Enterprise | contract | contract | contract         |

The 5-hour window is 10% of the week, and 20% on Max 20x. Flagship models may
use at most 30% of the weekly allowance.

## Consumption order

A request draws on the plan windows first, then bonus credits (soonest expiry
first), then purchased credits once a plan limit is reached and extra usage is
on. Bonus credits expire 90 days after they are granted. Purchased credits
never expire, except where local law requires it: credits bought in Japan
expire six months after purchase, with a reminder seven days before.

## Top-ups

Sold on the web only, at 50 credits per $1 of pack size: $20 (no discount),
$50 (5% off), $100 (10% off), $250 (20% off) and $1,000 (30% off), or any whole
dollar amount from $20 to $1,000 at its bracket's discount. Auto-reload takes
a further 5% off. A purchase is at most $1,000 and a user's top-ups at most
$2,000 a day. The ledger is funded with the provider-cost value of the credits
sold, so a $20 pack of 1,000 credits funds $5.

## Ownership

- `packages/contracts/types/src/credits.ts`: the credit constants and
  conversions (`MICROUSD_PER_CREDIT`, `CREDITS_PER_USD`, `CENTS_PER_CREDIT`,
  `chargeCreditsForMicrousd`, `formatCredits` and the rest).
- `packages/contracts/types/src/managed-usage-limits.ts`: the per-plan window
  table (`MANAGED_USAGE_LIMITS`) and `PLAN_CREDIT_ALLOWANCES`. Nothing else may
  hand-type a plan's credit numbers.
- `packages/contracts/types/src/billing-topups.ts`: packs, discounts, purchase
  limits, quotes, and the auto-reload contract and consent text.
- `packages/contracts/types/src/rate-card.ts`: the provider cost of every
  billable action.
- `apps/web/lib/server/managed-usage-policy.ts`: turns plan credits into ledger
  budgets for the reservation system.

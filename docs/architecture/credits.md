# Credits

Status: Current

## The one public definition

**50 credits = $1** of canonical usage value. That is the only meaning of
"credit" any customer-facing surface may use: plan allowances, top-ups,
credit history, and purchase receipts all read the same number.

| identity    | value           |
| ----------- | --------------- |
| 1 credit    | $0.02           |
| 1 credit    | 2 ledger cents  |
| 1 credit    | 20,000 microUSD |
| 500 credits | $10             |

## Conversion table (public plan allowances)

| plan    | monthly | weekly | 5-hour | flagship/week   |
| ------- | ------- | ------ | ------ | --------------- |
| Free    | 5       | 3.75   | 1.25   | n/a             |
| Basic   | 100     | 25     | 5      | n/a             |
| Pro     | 500     | 125    | 25     | 37.5            |
| Max     | 2,500   | 625    | 125    | 187.5           |
| Max 15x | 7,500   | 1,875  | 375    | 562.5           |
| Team    | 500     | 125    | 25     | 37.5 (per seat) |

## Internal units never appear in UI

Plan entitlements and the managed-usage ledger are tracked internally in
"internal usage units" (1 unit = $0.005) and ledger cents. Those are backend
accounting representations only. Any surface a customer can see, including
settings, receipts, marketing, mobile, desktop, CLI, and extensions, converts through
`credits.ts` before rendering, and never prints a raw internal unit count or
a raw cents figure as if it were the customer-facing number.

## Ownership

- `packages/contracts/types/src/credits.ts` is the canonical owner of the
  credit constants and conversion functions (`CREDITS_PER_USD`,
  `MICROUSD_PER_CREDIT`, `CENTS_PER_CREDIT`, `creditsFromCents`,
  `creditsFromMicrousd`, `centsFromCredits`, `microusdFromCredits`,
  `usdFromCredits`, `formatCredits`, `formatCreditsPerMillionTokens`).
- `packages/contracts/types/src/billing-topups.ts` re-exports the same
  constants under its legacy names (`TOP_UP_UNITS_PER_USD`) so existing
  imports keep working; it defines no conversion logic of its own.
- `apps/web/lib/billing/plan-credits.ts` is the canonical owner of the public
  per-plan credit allowance table, derived from
  `apps/web/lib/billing/managed-usage-caps.ts`'s internal-unit limits. Nothing
  else may hand-type a plan's credit numbers.

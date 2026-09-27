# Infrastructure cost allocation

Status: Current
Owner: Founder / billing operator
Last updated: 2026-09-27

The `allocate-infrastructure-costs` cron runs at 06:00 UTC on the 5th of each
month and spreads the previous month's vendor bills across that month's active
accounts in the COGS ledger. Unit prices and their sources are in
`docs/research/infrastructure-unit-costs-2026-09-27.md`.

## What it does

For each vendor in `INFRASTRUCTURE_VENDORS`
(`packages/contracts/types/src/rate-card.ts`):

1. It uses the `infrastructure_vendor_bills` row for the month when one exists.
2. Otherwise, when the vendor has committed monthly rate card rows (Vercel,
   Clerk, Sentry, Resend), it records a `rate_card` bill: the platform fee plus
   any per-active-user charge above the included allowance.
3. Otherwise the vendor is reported as `missing` and nothing is allocated.

It subtracts what that vendor's per-use rows already priced in the month and
writes the remainder as `provider_cost_events` rows with unit basis
`active_user_month`, one per active account, whose totals equal the remainder
to the microUSD and to the cent.

## Recording an invoice

Record each invoice total before 06:00 UTC on the 5th, in microUSD, against the
first day of the month it covers:

```sql
insert into public.infrastructure_vendor_bills (vendor, billing_month, amount_microusd, source)
values ('vercel', '2026-09-01', 43120000, 'invoice')
on conflict (vendor, billing_month) do update
  set amount_microusd = excluded.amount_microusd,
      source = 'invoice',
      updated_at = now()
  where public.infrastructure_vendor_bills.allocated_at is null;
```

An invoice recorded after its month is allocated is refused by the `where`
clause: the month's rows are already in the ledger. Neon, Cloudflare R2 and
Upstash have no committed monthly fee, so their months are only allocated from
a recorded invoice. A bill recorded for an earlier month that is still
unallocated is picked up by the next run.

## Checking a run

The cron answers with the month, the active account count, the vendors it
estimated, the vendors missing a bill, and one line per allocated bill. A
missing vendor is also logged as `infrastructure_bill_missing`, and a bill that
could not be allocated as `infrastructure_allocation_failed`; the run then
answers 500 and the next run retries that bill.

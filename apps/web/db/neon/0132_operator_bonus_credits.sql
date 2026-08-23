-- Operator goodwill grants.
--
-- Bonus credit is spendable immediately: it raises credits_allocated_cents so
-- the existing consumption path draws on it with no fork, and every grant also
-- writes a 'bonus' row to credit_transactions. Keeping a running
-- bonus_granted_cents on the account means revenue reporting can subtract
-- goodwill from allocation without replaying the whole ledger, which is the
-- question finance actually asks ("how much of this allocation did we sell?").
alter table public.token_credits
  add column if not exists bonus_granted_cents integer not null default 0;

comment on column public.token_credits.bonus_granted_cents is
  'Cumulative operator-granted goodwill credit included in credits_allocated_cents. Not revenue.';

-- Reporting reads the ledger by type and period; without this the operator
-- dashboard sequential-scans credit_transactions on every load.
create index if not exists idx_credit_transactions_type_created
  on public.credit_transactions (transaction_type, created_at desc);

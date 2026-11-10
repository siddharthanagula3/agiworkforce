-- =============================================================================
-- Migration 0398: durable coverage for the Stripe cost import
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the daily /api/cron/reconcile-credits run imported Stripe fees,
--          refunds and chargebacks into cogs_adjustments over the three days
--          before its own wall clock. When imports failed for longer than
--          that, the next healthy run asked Stripe only for the latest three
--          days, so older activity was never imported, the operator margin
--          stayed overstated, and the run still reported success.
--
-- Shape  : stripe_cogs_import_coverage holds one row per cost source (only
--          'stripe' today). covered_until is the end of the last window whose
--          every Stripe read and ledger write succeeded; a run starts at the
--          earlier of covered_until and its three-day overlap, spans at most
--          seven days, and advances covered_until only after that window has
--          been imported in full. A failed run keeps covered_until and records
--          last_error, so the next run retries the same range however old it
--          is. lease_token and lease_expires_at give one run ownership of the
--          import at a time; a lease that outlives its run expires on its own.
--          An operator backfills by setting covered_until earlier while no
--          lease is held. The table is service-owned: forced RLS and no
--          app_rls policy or grant.
--
-- Empty  : the first run after deploy seeds the row at three days before its
--          own clock, which is exactly the window the import read before.
--
-- Depends: 0076 (set_row_updated_at), 0127 (cogs ledger)
-- =============================================================================

begin;

create table if not exists public.stripe_cogs_import_coverage (
  source text primary key check (source = 'stripe'),
  covered_until timestamptz not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_cogs_import_coverage_lease_complete
    check ((lease_token is null) = (lease_expires_at is null))
);

drop trigger if exists set_stripe_cogs_import_coverage_updated_at
  on public.stripe_cogs_import_coverage;
create trigger set_stripe_cogs_import_coverage_updated_at
  before update on public.stripe_cogs_import_coverage
  for each row execute function public.set_row_updated_at();

alter table public.stripe_cogs_import_coverage enable row level security;
alter table public.stripe_cogs_import_coverage force row level security;
revoke all on public.stripe_cogs_import_coverage from public, app_rls;

comment on table public.stripe_cogs_import_coverage is
  'How far the Stripe fee, refund and chargeback import into cogs_adjustments is complete. Service-owned.';
comment on column public.stripe_cogs_import_coverage.covered_until is
  'End of the last import window whose every Stripe read and ledger write succeeded. The next run starts no later than this.';
comment on column public.stripe_cogs_import_coverage.lease_token is
  'The run that owns the import until lease_expires_at. Null when no run holds it.';

commit;

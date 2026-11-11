-- =============================================================================
-- Migration 0402: write off the overage tail when an enterprise contract ends
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the daily overage reporter reads only contracts with no ended_at.
--          When a contract ended, a pending overage report and any overage
--          used before the end but not yet reported stayed on the row with no
--          reader, so the amount was neither billed nor recorded as forgiven.
--          The tail of an ended contract is forgiven, never billed; it now has
--          to be written off explicitly and on record.
--
-- Shape  : organization_billing_contracts gains a closeout: the ended_at it
--          settles, when it was recorded, why, the overage written off, and
--          the identifier of a pending report it dropped (that report's
--          outcome at Stripe was unknown). The reporter closes out each ended
--          contract whose ended_at has no closeout, sends nothing to Stripe,
--          clears the pending report and moves the reported baseline past the
--          written-off amount so a reactivated contract never bills it later.
--          The closeout columns are set together.
--
-- Empty  : no contract has a closeout. Contracts that ended before this
--          migration are closed out on the reporter's next run.
--
-- Access : no policy or grant changes; the table keeps its existing RLS.
--
-- Depends: 0163 (organization_billing_contracts), 0367 (pending overage report),
--          0401 (pending overage destination)
-- =============================================================================

begin;

alter table public.organization_billing_contracts
  add column if not exists overage_closeout_ended_at timestamptz,
  add column if not exists overage_closeout_at timestamptz,
  add column if not exists overage_closeout_reason text,
  add column if not exists overage_written_off_cents bigint,
  add column if not exists overage_written_off_unconfirmed_identifier text;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_overage_closeout_complete;
alter table public.organization_billing_contracts
  add constraint organization_billing_contracts_overage_closeout_complete check (
    (overage_closeout_ended_at is null) = (overage_closeout_at is null)
    and (overage_closeout_ended_at is null) = (overage_closeout_reason is null)
    and (overage_closeout_ended_at is null) = (overage_written_off_cents is null)
    and (overage_closeout_ended_at is not null or overage_written_off_unconfirmed_identifier is null)
  );

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_overage_closeout_values;
alter table public.organization_billing_contracts
  add constraint organization_billing_contracts_overage_closeout_values check (
    (overage_closeout_reason is null or overage_closeout_reason in ('contract_ended'))
    and (overage_written_off_cents is null or overage_written_off_cents >= 0)
  );

comment on column public.organization_billing_contracts.overage_closeout_ended_at is
  'The ended_at the latest overage closeout settled. A contract whose ended_at differs from it is closed out on the next reporter run.';
comment on column public.organization_billing_contracts.overage_closeout_at is
  'When the latest overage closeout was recorded.';
comment on column public.organization_billing_contracts.overage_closeout_reason is
  'Why the overage tail was written off. contract_ended: the contract ended and its unreported tail is forgiven, never billed.';
comment on column public.organization_billing_contracts.overage_written_off_cents is
  'Overage used before the end that was never reported to Stripe and was written off by the latest closeout, including any pending report it dropped.';
comment on column public.organization_billing_contracts.overage_written_off_unconfirmed_identifier is
  'Meter-event identifier of a pending report the closeout dropped. Stripe may or may not have accepted it; reconcile against Stripe before treating its amount as unbilled.';

commit;

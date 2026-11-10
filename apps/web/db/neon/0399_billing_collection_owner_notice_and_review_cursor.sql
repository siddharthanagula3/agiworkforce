-- =============================================================================
-- Migration 0399: owner notice obligation and review cursor for collection
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the daily /api/cron/enforce-billing-collection sweep saved a new
--          collection stage and only then told the workspace owner, deciding
--          whether to tell them from the stage change alone. When the email
--          or the in-app notice failed, the next run saw an unchanged stage
--          and never tried again, so an owner could reach read-only without
--          being told. The sweep also started from the most overdue contract
--          on every run, so when one run could not finish, the same contracts
--          went first again and the rest could wait indefinitely.
--
-- Shape  : organization_billing_contracts gains the owner notice the current
--          stage still owes: owner_notice_pending_stage and
--          owner_notice_pending_since are written in the same statement that
--          changes collection_stage, and each channel is stamped
--          (owner_notice_email_delivered_at, owner_notice_in_app_recorded_at)
--          only after it succeeded. Each run retries a channel that is not yet
--          stamped while the pending stage is still the contract's stage.
--          collection_reviewed_at is stamped on every contract a run reviewed;
--          the sweep reads contracts never reviewed first, then the least
--          recently reviewed, so a run that stops early resumes where the
--          previous one left off.
--
-- Access : no policy or grant changes; the table keeps its existing RLS.
--
-- Empty  : existing contracts keep null in every new column. They owe no
--          notice until their next stage change, and are reviewed first by the
--          next sweep.
--
-- Depends: 0163 (organization_billing_contracts)
-- =============================================================================

begin;

alter table public.organization_billing_contracts
  add column if not exists owner_notice_pending_stage text,
  add column if not exists owner_notice_pending_since timestamptz,
  add column if not exists owner_notice_email_delivered_at timestamptz,
  add column if not exists owner_notice_in_app_recorded_at timestamptz,
  add column if not exists collection_reviewed_at timestamptz;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_owner_notice_stage;
alter table public.organization_billing_contracts
  add constraint organization_billing_contracts_owner_notice_stage
    check (
      owner_notice_pending_stage is null
      or owner_notice_pending_stage in ('past_due_30', 'past_due_60', 'read_only')
    );

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_owner_notice_complete;
alter table public.organization_billing_contracts
  add constraint organization_billing_contracts_owner_notice_complete
    check ((owner_notice_pending_stage is null) = (owner_notice_pending_since is null));

create index if not exists idx_organization_billing_contracts_collection_review
  on public.organization_billing_contracts (collection_reviewed_at asc nulls first)
  where ended_at is null;

comment on column public.organization_billing_contracts.owner_notice_pending_stage is
  'The collection stage whose owner notice is owed, set with the stage change. A channel is retried while this equals collection_stage and its delivered stamp is null.';
comment on column public.organization_billing_contracts.owner_notice_email_delivered_at is
  'When the owner notice for owner_notice_pending_stage was accepted by the email provider. Null means it is still owed.';
comment on column public.organization_billing_contracts.owner_notice_in_app_recorded_at is
  'When the owner notice for owner_notice_pending_stage was recorded in the owner''s in-app feed. Null means it is still owed.';
comment on column public.organization_billing_contracts.collection_reviewed_at is
  'When the collection sweep last reviewed this contract. Null rows are reviewed first, then the least recently reviewed.';

commit;

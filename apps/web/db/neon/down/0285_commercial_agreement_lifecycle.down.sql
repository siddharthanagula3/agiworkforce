-- Reversal of the commercial agreement ending and change-kind columns.
--
-- COST, read this before running it: every recorded termination is lost, so an
-- agreement a customer ended reads as executed again and grants what it
-- granted before. Whether a version was an amendment or a renewal is also
-- forgotten. The envelope index goes back to being non-unique, which allows
-- one signature to author two versions again.

begin;

drop index if exists public.idx_org_commercial_agreements_envelope;
create index if not exists idx_org_commercial_agreements_envelope
  on public.organization_commercial_agreements (signature_envelope_id)
  where signature_envelope_id is not null;

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_supersedes_earlier;
alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_termination_recorded;
alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_change_kind_check;

alter table public.organization_commercial_agreements
  drop column if exists change_kind,
  drop column if exists supersedes_version,
  drop column if exists terminated_at,
  drop column if exists termination_reason;

-- destructive: removes this migration's ledger row so the runner can apply it again.
delete from public.schema_migrations
 where filename = '0285_commercial_agreement_lifecycle.sql';

commit;

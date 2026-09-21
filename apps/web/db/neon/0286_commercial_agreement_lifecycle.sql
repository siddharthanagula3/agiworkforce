-- =============================================================================
-- Migration 0285: an agreement that ended says so, and one signature signs once
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a customer who terminates for convenience left a row that still
--          reads `executed`, so every reader went on treating the workspace as
--          contracted. There was also no way to tell an amendment from a
--          renewal after the fact: both are a new version, and only a
--          free-text reason hinted at which had happened.
--
-- Ending : terminated_at is a date someone decides, so it is stored. Expiry is
--          NOT stored: it follows from contract_term_end and the negotiated
--          grace, and a status that has to be swept into place is a status
--          that is wrong between sweeps. The status vocabulary is unchanged;
--          an ending is a date on the live version, not a fifth status.
--
-- Signed : the envelope index becomes unique per workspace. A signature
--          webhook that arrives twice authored a second executed version,
--          which superseded the first, bumped the version Stripe metadata
--          refers to and left the workspace reading as amended by an
--          amendment nobody signed.
--
-- Depends: 0228 (organization_commercial_agreements)
-- =============================================================================

begin;

alter table public.organization_commercial_agreements
  add column if not exists change_kind text not null default 'initial',
  add column if not exists supersedes_version integer,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_reason text;

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_change_kind_check;
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_change_kind_check
  check (change_kind = any (array['initial', 'amendment', 'renewal']));

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_termination_recorded;
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_termination_recorded
  check (terminated_at is null
         or (status = 'executed' and char_length(btrim(coalesce(termination_reason, ''))) > 0));

alter table public.organization_commercial_agreements
  drop constraint if exists organization_commercial_agreements_supersedes_earlier;
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_supersedes_earlier
  check (supersedes_version is null or supersedes_version < version);

drop index if exists public.idx_org_commercial_agreements_envelope;
create unique index if not exists idx_org_commercial_agreements_envelope
  on public.organization_commercial_agreements (organization_id, signature_envelope_id)
  where signature_envelope_id is not null;

comment on column public.organization_commercial_agreements.change_kind is
  'Whether this version is the first Order Form, an amendment to the one before it, or a renewal that starts a new term.';
comment on column public.organization_commercial_agreements.supersedes_version is
  'The version this one replaced. NULL on the first version of an agreement.';
comment on column public.organization_commercial_agreements.terminated_at is
  'When the agreement was ended before its term ran out. Expiry is not recorded here: it follows from contract_term_end and the negotiated grace.';
comment on column public.organization_commercial_agreements.termination_reason is
  'Why the agreement was ended early. Required whenever terminated_at is set, so no workspace loses its contract without a stated cause.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A termination has to carry a reason:
-- --    UPDATE public.organization_commercial_agreements SET terminated_at = now()
-- --     WHERE id = '<executed id>';
-- --    EXPECT: check violation (organization_commercial_agreements_termination_recorded).
--
-- -- 2. Only an executed version can be terminated:
-- --    Same UPDATE with termination_reason set, against a draft row.
-- --    EXPECT: check violation.
--
-- -- 3. A version cannot supersede itself or a later one:
-- --    UPDATE public.organization_commercial_agreements SET supersedes_version = version
-- --     WHERE id = '<id>';
-- --    EXPECT: check violation (organization_commercial_agreements_supersedes_earlier).
--
-- -- 4. One envelope signs one agreement per workspace:
-- --    INSERT a second row for the same organization_id and signature_envelope_id.
-- --    EXPECT: unique violation (idx_org_commercial_agreements_envelope).

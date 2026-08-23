-- Reversal of 0138 — remove retention enforcement, legal holds, and the sweep
-- evidence trail.
--
-- WHAT THIS COSTS: dropping `legal_holds` destroys the record of which
-- custodians were placed under hold and when. That record is itself evidence in
-- any matter the holds were created for. Export both tables before running this
-- if any hold has ever existed.
--
-- Dropping `retention_enforced` reverts every workspace to the recorded-but-
-- unenforced behaviour. No conversation is deleted by this file; deletion
-- simply stops happening.

begin;

drop index if exists public.idx_web_conversations_org_updated;

drop policy if exists retention_sweeps_admin_read on public.organization_retention_sweeps;
drop table if exists public.organization_retention_sweeps;

drop policy if exists legal_holds_admin_read on public.legal_holds;
drop trigger if exists set_legal_holds_updated_at on public.legal_holds;
drop table if exists public.legal_holds;

alter table public.organization_admin_policies
  drop column if exists retention_enforced;

delete from public.schema_migrations
 where filename = '0138_retention_enforcement_and_legal_hold.sql';

commit;

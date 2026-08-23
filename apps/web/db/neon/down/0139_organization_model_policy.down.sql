-- Reversal of 0139 — remove workspace model and provider governance.
--
-- WHAT THIS COSTS: every saved restriction is destroyed. A workspace that had
-- blocked a provider for a compliance reason silently regains access to it, and
-- there is no record left of what was blocked. Export the table before running
-- this if any policy row exists.
--
-- No conversation, model, or member is affected. Only the restrictions stop
-- being applied.

begin;

drop policy if exists model_policy_member_read on public.organization_model_policies;
drop trigger if exists set_organization_model_policies_updated_at
  on public.organization_model_policies;
drop table if exists public.organization_model_policies;

delete from public.schema_migrations
 where filename = '0139_organization_model_policy.sql';

commit;

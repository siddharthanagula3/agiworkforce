-- Reversal of 0140 — remove workspace control over public sharing.
--
-- WHAT THIS COSTS: any workspace that had switched public sharing OFF silently
-- regains it, and members can publish anonymous links again with no record that
-- the restriction ever existed. Note which organizations had it disabled before
-- running this.
--
-- No existing share link is created, revoked, or changed.

begin;

alter table public.organization_admin_policies
  drop column if exists external_sharing_enabled;

delete from public.schema_migrations
 where filename = '0140_external_sharing_policy.sql';

commit;

-- Reversal of 0350 : stop enforcing the shape of allowProductAnalytics.
--
-- Any key an administrator already stored stays stored, and the runtime read
-- still treats only an absent key or the boolean true as permission, so
-- dropping the constraint widens what can be written, not what is honoured.

begin;

alter table public.organization_admin_policies
  drop constraint if exists organization_admin_policies_product_analytics_boolean;

delete from public.schema_migrations
 where filename = '0350_workspace_product_analytics_switch.sql';

commit;

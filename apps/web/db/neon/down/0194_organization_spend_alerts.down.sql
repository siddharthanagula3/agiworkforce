-- Reversal of 0194 : forget which spend limit crossings were announced.
--
-- WHAT THIS COSTS: the delivery record goes, so a workspace already over its
-- threshold this month is told again the next time its spend is recomputed.
-- No limit, usage record or charge changes.

begin;

drop policy if exists spend_alerts_member_read on public.organization_spend_alerts;
drop table if exists public.organization_spend_alerts;

delete from public.schema_migrations
 where filename = '0194_organization_spend_alerts.sql';

commit;

-- Reversal of 0143 — remove audit event streaming.
--
-- WHAT THIS COSTS: every configured SIEM destination is destroyed, including
-- its delivery cursor. A workspace that re-configures streaming afterwards
-- starts from the current moment, so events written between the drop and the
-- reconfiguration are never delivered and must be collected with the JSONL
-- export instead. Note the cursors before running this.
--
-- No audit event is deleted. Only the delivery of them stops.

begin;

drop policy if exists audit_destinations_admin_read on public.organization_audit_destinations;
drop trigger if exists set_organization_audit_destinations_updated_at
  on public.organization_audit_destinations;
drop table if exists public.organization_audit_destinations;

delete from public.schema_migrations
 where filename = '0143_audit_event_streaming.sql';

commit;

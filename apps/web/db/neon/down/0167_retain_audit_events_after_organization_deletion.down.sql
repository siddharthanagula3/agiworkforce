-- Reversal of 0167 : restore the not null constraint on
-- enterprise_audit_events.organization_id.
--
-- Refuses if any row was anonymized in the meantime (organization_id is
-- null): restoring the constraint would need those rows deleted or
-- reattached, and this reversal does neither. Clear the null rows first if
-- the intent is truly to go back to hard-deleting the tenant's audit trail
-- on organization erasure.

begin;

do $$
begin
  if exists (
    select 1 from public.enterprise_audit_events where organization_id is null
  ) then
    raise exception
      'enterprise_audit_events has organization_id = null rows; resolve them before reversing 0167';
  end if;
end $$;

alter table public.enterprise_audit_events
  alter column organization_id set not null;

delete from public.schema_migrations
 where filename = '0167_retain_audit_events_after_organization_deletion.sql';

commit;

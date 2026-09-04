-- 0168 : let the tenant audit trail survive the tenant.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- organization-erasure.ts hard-deleted enterprise_audit_events alongside
-- every other organization-scoped table, so a legal hold placed after a
-- workspace is purged, or an investigation opened after the fact, finds
-- nothing: the very rows that would show what an admin did are gone with the
-- workspace. The independent review that flagged this (SHOULD-FIX, gates
-- section) named the same gap for legal_holds; that table is out of scope
-- here because its rows describe a hold that ends when the hold is released,
-- not a permanent record, whereas enterprise_audit_events is the record.
--
-- The fix moves enterprise_audit_events from organization-erasure.ts's
-- delete list to its anonymize list: organization_id is set to null instead
-- of the row being deleted, actor_user_id/action/resource_type/resource_id/
-- outcome/severity/metadata are left exactly as recorded. That requires
-- organization_id to be nullable, which it is not today (not null,
-- references public.organizations(id) on delete cascade), so this migration
-- only relaxes that one constraint. The foreign key itself is untouched:
-- once organization_id is nulled ahead of the organizations row being
-- deleted, the row no longer references anything for cascade to reach.

begin;

alter table public.enterprise_audit_events
  alter column organization_id drop not null;

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. The column accepts null without touching any existing row:
-- --    UPDATE public.enterprise_audit_events SET organization_id = organization_id
-- --     WHERE false; -- no-op, just proves the alter committed
-- --    INSERT INTO public.enterprise_audit_events
-- --      (organization_id, surface, action, resource_type, outcome, severity)
-- --    VALUES (NULL, 'web', 'test', 'test', 'success', 'info');
-- --                                                              -- EXPECT: succeeds
-- --    DELETE FROM public.enterprise_audit_events WHERE action = 'test';
-- --
-- -- 2. No existing row was retroactively nulled:
-- --    SELECT count(*) FROM public.enterprise_audit_events WHERE organization_id IS NULL;
-- --                                                              -- EXPECT: 0
-- =============================================================================

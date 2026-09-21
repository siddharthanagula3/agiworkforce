-- =============================================================================
-- Tamper-evident tables survive a re-grant
--
-- Why    : eight tables tell the application role it may not rewrite them, and
--          say it with a privilege REVOKE alone. 0043_audit_log_immutability.sql
--          wrote down why that is not enough, in its own header: 0037 grants
--          app_rls SELECT, INSERT, UPDATE and DELETE on every table in schema
--          public, and hands the same four to every table created afterwards
--          through ALTER DEFAULT PRIVILEGES. Re-issuing either statement, or
--          adding a table and letting the default apply, silently restores
--          UPDATE and DELETE on a trail that was deliberately closed, and
--          nothing fails when it does. 0123 landed the durable mechanism for
--          public.security_audit_logs and 0116 for public.consent_records; the
--          other eight declarations were left resting on the REVOKE.
--
-- What   : one row trigger per table, before UPDATE and before DELETE, refusing
--          every role that is not the table owner. The privilege check still
--          runs first, so nothing about today's behaviour changes; what changes
--          is that the refusal no longer depends on a privilege that a later
--          blanket statement can hand back.
--
-- Why the owner is admitted: these eight are not all append-only. A support
--          access grant is revoked, a data rights request is progressed, an
--          organization's MCP server entry is edited, and the SECURITY DEFINER
--          writers for the enterprise audit trail and the retention purges run
--          as the table owner. Refusing the owner would break all of that. A
--          deny list naming app_rls would instead admit by default every
--          application role added later, so the test is ownership.
--
-- Precondition, the same one 0043 and 0123 already rest on: app_rls must not
--          own these tables. Verified by (a) below before this is applied.
--
-- Depends: public.consent_records, public.data_rights_requests,
--          public.enterprise_audit_events, public.legal_hold_custodians,
--          public.organization_admin_delegations, public.organization_mcp_servers,
--          public.organization_policy_revisions, public.scim_group_members,
--          public.support_access_grants.
-- =============================================================================

create or replace function public.forbid_non_owner_rewrite()
returns trigger
language plpgsql
as $$
declare
  table_owner text;
begin
  select pg_get_userbyid(relowner)
    into table_owner
    from pg_class
   where oid = tg_relid;

  if current_user is distinct from table_owner then
    raise exception
      'public.% is not writable by %: % is refused', tg_table_name, current_user, tg_op
      using errcode = 'insufficient_privilege',
            hint = 'This table was closed to the application role deliberately. Reach it through the owner connection or the SECURITY DEFINER function that maintains it.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.forbid_non_owner_rewrite() is
  'Holds a table closed to the application role after a blanket GRANT or ALTER DEFAULT PRIVILEGES hands UPDATE and DELETE back. Admits the table owner, which is the role the SECURITY DEFINER writers and the retention purges run as.';

drop trigger if exists data_rights_requests_owner_writes_only on public.data_rights_requests;
create trigger data_rights_requests_owner_writes_only
  before update or delete on public.data_rights_requests
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists enterprise_audit_events_owner_writes_only on public.enterprise_audit_events;
create trigger enterprise_audit_events_owner_writes_only
  before update or delete on public.enterprise_audit_events
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists legal_hold_custodians_owner_writes_only on public.legal_hold_custodians;
create trigger legal_hold_custodians_owner_writes_only
  before update or delete on public.legal_hold_custodians
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists organization_admin_delegations_owner_writes_only on public.organization_admin_delegations;
create trigger organization_admin_delegations_owner_writes_only
  before update or delete on public.organization_admin_delegations
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists organization_mcp_servers_owner_writes_only on public.organization_mcp_servers;
create trigger organization_mcp_servers_owner_writes_only
  before update or delete on public.organization_mcp_servers
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists organization_policy_revisions_owner_writes_only on public.organization_policy_revisions;
create trigger organization_policy_revisions_owner_writes_only
  before update or delete on public.organization_policy_revisions
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists scim_group_members_owner_writes_only on public.scim_group_members;
create trigger scim_group_members_owner_writes_only
  before update or delete on public.scim_group_members
  for each row execute function public.forbid_non_owner_rewrite();

drop trigger if exists support_access_grants_owner_writes_only on public.support_access_grants;
create trigger support_access_grants_owner_writes_only
  before update or delete on public.support_access_grants
  for each row execute function public.forbid_non_owner_rewrite();

-- Re-assert the declarations these triggers now hold. Each is idempotent and
-- removes whatever a blanket grant has applied since the original migration.
revoke update, delete on public.data_rights_requests from app_rls;
revoke insert, update, delete on public.enterprise_audit_events from app_rls;
revoke insert, update, delete on public.legal_hold_custodians from app_rls;
revoke insert, update, delete on public.organization_admin_delegations from app_rls;
revoke insert, update, delete on public.organization_mcp_servers from app_rls;
revoke insert, update, delete on public.organization_policy_revisions from app_rls;
revoke insert, update, delete on public.scim_group_members from app_rls;
revoke insert, update, delete on public.support_access_grants from app_rls;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before applying. Both
-- directions must pass: a trigger that blocks the owner is a worse incident
-- than the re-grant it defends against. (Commented so it never runs on apply.)
-- =============================================================================
--
-- -- (a) Ownership precondition. One owner for all eight, and not app_rls.
-- select relname, pg_get_userbyid(relowner) as owner
--   from pg_class
--  where relname in ('data_rights_requests', 'enterprise_audit_events',
--                    'legal_hold_custodians', 'organization_admin_delegations',
--                    'organization_mcp_servers', 'organization_policy_revisions',
--                    'scim_group_members', 'support_access_grants')
--    and relkind = 'r';
-- --   EXPECT: eight rows, one owner, owner <> 'app_rls'.
--
-- -- (b) Direction 1, the trigger holds after the footgun fires.
-- grant update, delete on public.support_access_grants to app_rls;  -- simulate it
-- set role app_rls;
-- update public.support_access_grants set revoked_at = now();  -- EXPECT: 42501
-- delete from public.support_access_grants;                    -- EXPECT: 42501
-- reset role;
-- revoke update, delete on public.support_access_grants from app_rls;
--
-- -- (c) Direction 2, the legitimate owner paths still write.
-- update public.support_access_grants set revoked_at = now() where 1 = 0;
-- update public.data_rights_requests set status = status where 1 = 0;
-- delete from public.enterprise_audit_events where 1 = 0;
-- --   EXPECT: all succeed on the owner connection, zero rows affected.
-- =============================================================================

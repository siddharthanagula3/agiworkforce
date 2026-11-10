-- =============================================================================
-- Migration 0415: a deleting member's own statement can see the holds on their row
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : legal_holds (0138) and legal_hold_custodians (0261) are readable
--          only by workspace owners and admins. The hold predicate every
--          destructive statement carries (apps/web/lib/services/legal-hold-gate.ts)
--          read those tables inline, so on an ordinary member's app_rls
--          connection RLS filtered every hold out and the predicate answered
--          "not held". A member could permanently delete their own trashed file
--          or hard-delete a live message that an existing hold preserves.
--          Keeping hold details from members is right; treating them as absent
--          is not.
--
-- Shape  : one SECURITY DEFINER function, public.legal_hold_preserves(
--          organization, owner, store), returning only a boolean. It answers
--          with the same scope rules as the inline predicate (organization,
--          member, custodian; a null store or null resource_types means every
--          store). It is not an oracle over other people's holds:
--            - an app_rls caller gets the real answer only for a row it may
--              see (app_row_is_visible, 0272) or for a workspace whose holds it
--              can already read (active owner or admin); otherwise it gets
--              true, so the statement fails closed and learns nothing;
--            - an app_rls statement with no bound subject also gets true;
--            - the privileged owner connection (no SET ROLE) gets the real
--              answer, as it does today by reading the tables directly.
--          search_path is pinned, row_security is off so a missing BYPASSRLS
--          raises instead of filtering, and only app_rls may execute it.
--
-- Empty  : no table or row changes. Holds placed before this migration are
--          read exactly as before.
--
-- Depends: 0138_retention_enforcement_and_legal_hold (legal_holds)
--          0261_legal_hold_custodians_and_resource_scope (custodians, resource_types)
--          0272_active_membership_authorization (app_row_is_visible)
-- =============================================================================

begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Legal hold preservation helper requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

create or replace function public.legal_hold_preserves(
  p_organization_id uuid,
  p_owner_user_id text,
  p_resource_type text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
set row_security = off
as $$
declare
  caller text := nullif(btrim(public.current_app_user_id()), '');
begin
  if p_organization_id is null then
    return false;
  end if;

  if caller is null then
    if pg_catalog.current_setting('role', true) is distinct from 'none' then
      return true;
    end if;
  elsif not (
    public.app_row_is_visible(p_owner_user_id, p_organization_id)
    or exists (
      select 1
        from public.organization_members m
       where m.organization_id = p_organization_id
         and m.user_id = caller
         and m.status = 'active'
         and m.role in ('owner', 'admin')
    )
  ) then
    return true;
  end if;

  return exists (
    select 1
      from public.legal_holds h
     where h.released_at is null
       and h.organization_id = p_organization_id
       and (
         p_resource_type is null
         or h.resource_types is null
         or p_resource_type = any (h.resource_types)
       )
       and (
         h.scope = 'organization'
         or (h.scope = 'member' and h.subject_user_id = p_owner_user_id)
         or (
           h.scope = 'custodian'
           and exists (
             select 1
               from public.legal_hold_custodians c
              where c.hold_id = h.id
                and c.user_id = p_owner_user_id
           )
         )
       )
  );
end;
$$;

comment on function public.legal_hold_preserves(uuid, text, text) is
  'True when an active legal hold in the workspace preserves content owned by p_owner_user_id in store p_resource_type (null: any store). Returns true, never a hold detail, to an app_rls caller who may not see that row, so a destructive statement fails closed.';

revoke all on function public.legal_hold_preserves(uuid, text, text) from public;
grant execute on function public.legal_hold_preserves(uuid, text, text) to app_rls;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_roles owner_role on owner_role.oid = proc.proowner
     where proc.oid = 'public.legal_hold_preserves(uuid, text, text)'::pg_catalog.regprocedure
       and (owner_role.rolsuper or owner_role.rolbypassrls)
  ) then
    raise exception 'Legal hold preservation helper requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

commit;

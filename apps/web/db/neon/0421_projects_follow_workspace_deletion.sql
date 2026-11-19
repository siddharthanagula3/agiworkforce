-- =============================================================================
-- Migration 0421: a member's project demotes to Personal when its workspace is deleted
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : 0053 makes user_projects.organization_id ON DELETE SET NULL, so a
--          member's project demotes to Personal when the workspace is
--          deleted. Two BEFORE UPDATE guards on user_projects refuse that
--          cascade. 0217's user_projects_owner_column_guard refuses any
--          change of a project's workspace unless the session is the
--          project's owner, and organization erasure runs as no user, so a
--          workspace with any member project could not be deleted. 0419's
--          guard_project_knowledge_object_scope refuses any ownership change
--          while the project holds a stored source. Organization erasure
--          therefore never finished for such a workspace.
--
-- Shape  : both guards are replaced. Each admits exactly one more change: the
--          owner stays the same, organization_id goes from a workspace to
--          null, and the organizations row it named no longer exists, which
--          is true only inside the cascade from that row's delete. Every
--          other change keeps its refusal. When the cascade demotes a project
--          that holds stored sources, the ledger rows its live sources
--          reference are detached from the deleted workspace in the same
--          statement, so the ledger keeps matching its project. 0419's
--          retirement fence (read committed, row locks) is unchanged.
--
-- Empty  : no rows are rewritten. Projects and ledger rows change only when a
--          workspace is deleted after this migration.
--
-- Depends: 0053 (user_projects_organization_fk), 0217 (the owner column guard
--          replaced), 0419 (the source guard replaced, project_knowledge_objects,
--          project_knowledge_object_fingerprint)
-- =============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.user_projects_owner_column_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.user_id is distinct from old.user_id
      or new.organization_id is distinct from old.organization_id)
     and old.user_id is distinct from public.current_app_user_id()
     and (new.user_id is distinct from old.user_id
       or old.organization_id is null
       or new.organization_id is not null
       or exists (select 1 from public.organizations where id = old.organization_id)) then
    raise exception 'only the project owner may move a project to another owner or organization'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_project_knowledge_object_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
    and current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Project retirement requires a fresh source snapshot' using errcode = '40001';
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform k.id from public.project_knowledge_files k
      where k.project_id=old.id and k.deleted_at is null order by k.id for update;
    perform objects.fingerprint from public.project_knowledge_objects objects
      where objects.fingerprint in (
        select public.project_knowledge_object_fingerprint(k.storage_uri)
          from public.project_knowledge_files k where k.project_id=old.id and k.deleted_at is null
      ) order by objects.fingerprint for update;
  end if;
  if (new.user_id is distinct from old.user_id or new.organization_id is distinct from old.organization_id)
    and exists (select 1 from public.project_knowledge_files where project_id = old.id and deleted_at is null and nullif(storage_uri, '') is not null) then
    if new.user_id is distinct from old.user_id
      or old.organization_id is null
      or new.organization_id is not null
      or exists (select 1 from public.organizations where id = old.organization_id) then
      raise exception 'Project source ownership cannot change without a reviewed source transfer' using errcode = '23514';
    end if;
    update public.project_knowledge_objects objects
       set organization_id = null, updated_at = now()
     where objects.organization_id = old.organization_id
       and objects.fingerprint in (
         select public.project_knowledge_object_fingerprint(k.storage_uri)
           from public.project_knowledge_files k
          where k.project_id = old.id and k.deleted_at is null and nullif(k.storage_uri, '') is not null
       );
  end if;
  return new;
end
$$;

revoke all on function public.guard_project_knowledge_object_scope() from public, app_rls;
commit;

-- Reversal of 0421: the 0217 owner column guard and the 0419 source guard return.
--
-- WHAT THIS COSTS: deleting a workspace fails again whenever it still has a
-- member project, because the cascade that demotes the project to Personal is
-- refused, so organization erasure cannot finish for that workspace. Projects
-- already demoted and ledger rows already detached stay as they are; they were
-- changed together, so they still match. Both bodies below are verbatim, from
-- 0217 and 0419.

begin;

create or replace function public.user_projects_owner_column_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.user_id is distinct from old.user_id
      or new.organization_id is distinct from old.organization_id)
     and old.user_id is distinct from public.current_app_user_id() then
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
    raise exception 'Project source ownership cannot change without a reviewed source transfer' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function public.guard_project_knowledge_object_scope() from public, app_rls;

delete from public.schema_migrations
 where filename = '0421_projects_follow_workspace_deletion.sql';

commit;

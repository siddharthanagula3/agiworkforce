begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Publication audience revocation requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

-- A plain ownership EXISTS in grant SELECT recurses through publication RLS (0185).
-- CREATE, not replacement, binds this new helper to the checked migration owner.
create function public.app_owns_published_artifact(p_published_artifact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
set row_security = off
as $$
  select exists (
    select 1
      from public.published_artifacts artifact
     where artifact.id = p_published_artifact_id
       and nullif(btrim(public.current_app_user_id()), '') is not null
       and artifact.user_id = public.current_app_user_id()
  );
$$;

revoke all on function public.app_owns_published_artifact(uuid) from public;
grant execute on function public.app_owns_published_artifact(uuid) to app_rls;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_roles owner_role on owner_role.oid = proc.proowner
     where proc.oid = 'public.app_owns_published_artifact(uuid)'::pg_catalog.regprocedure
       and (owner_role.rolsuper or owner_role.rolbypassrls)
  ) then
    raise exception 'Publication ownership helper requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

-- Owners must see and revoke their old grants even after leaving that workspace.
create policy organization_shared_artifacts_publication_owner_read
  on public.organization_shared_artifacts for select to app_rls
  using (public.app_owns_published_artifact(published_artifact_id));

create policy organization_shared_artifacts_publication_owner_delete
  on public.organization_shared_artifacts for delete to app_rls
  using (public.app_owns_published_artifact(published_artifact_id));

drop policy if exists published_artifacts_org_shared_read on public.published_artifacts;
create policy published_artifacts_org_shared_read
  on public.published_artifacts for select to app_rls
  using (
    visibility in ('public', 'organization')
    and exists (
      select 1
        from public.organization_shared_artifacts share
       where share.published_artifact_id = published_artifacts.id
         and public.app_org_resource_is_readable(share.organization_id)
    )
  );

create or replace function public.app_runnable_published_artifact(p_token text)
returns table (published_artifact_id uuid, owner_user_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.user_id
    from public.published_artifacts a
   where a.token = p_token
     and a.kind in ('html', 'react')
     and nullif(public.current_app_user_id(), '') is not null
     and (
       a.visibility = 'public'
       or a.user_id = public.current_app_user_id()
       or (
         a.visibility = 'organization'
         and exists (
           select 1
             from public.organization_shared_artifacts share
            where share.published_artifact_id = a.id
              and public.app_org_resource_is_readable(share.organization_id)
         )
       )
       or (
         a.visibility = 'invited'
         and exists (
           select 1
             from public.published_artifact_viewers viewer
             join public.profiles profile on profile.id = public.current_app_user_id()
            where viewer.published_artifact_id = a.id
              and viewer.email = lower(profile.email)
         )
       )
     );
$$;

revoke all on function public.app_runnable_published_artifact(text) from public;
grant execute on function public.app_runnable_published_artifact(text) to app_rls;

create or replace function public.app_can_run_published_artifact(p_published_artifact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.published_artifacts a
     where a.id = p_published_artifact_id
       and a.kind in ('html', 'react')
       and nullif(public.current_app_user_id(), '') is not null
       and (
         a.visibility = 'public'
         or a.user_id = public.current_app_user_id()
         or (
           a.visibility = 'organization'
           and exists (
             select 1
               from public.organization_shared_artifacts share
              where share.published_artifact_id = a.id
                and public.app_org_resource_is_readable(share.organization_id)
           )
         )
         or (
           a.visibility = 'invited'
           and exists (
             select 1
               from public.published_artifact_viewers viewer
               join public.profiles profile on profile.id = public.current_app_user_id()
              where viewer.published_artifact_id = a.id
                and viewer.email = lower(profile.email)
           )
         )
       )
  );
$$;

revoke all on function public.app_can_run_published_artifact(uuid) from public;
grant execute on function public.app_can_run_published_artifact(uuid) to app_rls;

commit;

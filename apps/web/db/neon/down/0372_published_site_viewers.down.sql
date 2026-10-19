-- Reversal of 0372 removes every invited viewer list. Publications shared
-- with named people fall back to the publisher alone: their visibility becomes
-- 'organization' with no workspace grant, so the anonymous page stays closed
-- rather than opening to anyone with the link.

begin;

drop policy if exists published_artifacts_invited_read on public.published_artifacts;
drop policy if exists published_artifact_viewers_owner_delete on public.published_artifact_viewers;
drop policy if exists published_artifact_viewers_owner_insert on public.published_artifact_viewers;
drop policy if exists published_artifact_viewers_read on public.published_artifact_viewers;
alter table if exists public.published_artifact_viewers disable row level security;
alter table if exists public.published_artifact_viewers no force row level security;
drop index if exists public.idx_published_artifact_viewers_email;
drop table if exists public.published_artifact_viewers;

update public.published_artifacts set visibility = 'organization' where visibility = 'invited';

alter table public.published_artifacts
  drop constraint if exists published_artifacts_visibility_check;
alter table public.published_artifacts
  add constraint published_artifacts_visibility_check
  check (visibility in ('public', 'organization'));

-- The run functions go back to their 0325 definitions.
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
       or exists (
         select 1
           from public.organization_shared_artifacts share
          where share.published_artifact_id = a.id
            and public.app_org_resource_is_readable(share.organization_id)
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
         or exists (
           select 1
             from public.organization_shared_artifacts share
            where share.published_artifact_id = a.id
              and public.app_org_resource_is_readable(share.organization_id)
         )
       )
  );
$$;

revoke all on function public.app_can_run_published_artifact(uuid) from public;
grant execute on function public.app_can_run_published_artifact(uuid) to app_rls;

revoke all on public.published_artifact_storage from app_rls;
grant select, insert, update, delete on public.published_artifact_storage to app_rls;

alter table public.published_artifact_storage enable row level security;
alter table public.published_artifact_storage force row level security;

drop policy if exists published_artifact_storage_viewer_read on public.published_artifact_storage;
create policy published_artifact_storage_viewer_read
  on public.published_artifact_storage for select to app_rls
  using (
    public.app_can_run_published_artifact(published_artifact_id)
    and (owner_user_id is null or owner_user_id = (select public.current_app_user_id()))
  );

drop policy if exists published_artifact_storage_viewer_insert on public.published_artifact_storage;
create policy published_artifact_storage_viewer_insert
  on public.published_artifact_storage for insert to app_rls
  with check (
    public.app_can_run_published_artifact(published_artifact_id)
    and (owner_user_id is null or owner_user_id = (select public.current_app_user_id()))
    and updated_by = (select public.current_app_user_id())
  );

drop policy if exists published_artifact_storage_viewer_update on public.published_artifact_storage;
create policy published_artifact_storage_viewer_update
  on public.published_artifact_storage for update to app_rls
  using (
    public.app_can_run_published_artifact(published_artifact_id)
    and (owner_user_id is null or owner_user_id = (select public.current_app_user_id()))
  )
  with check (
    public.app_can_run_published_artifact(published_artifact_id)
    and (owner_user_id is null or owner_user_id = (select public.current_app_user_id()))
    and updated_by = (select public.current_app_user_id())
  );

drop policy if exists published_artifact_storage_viewer_delete on public.published_artifact_storage;
create policy published_artifact_storage_viewer_delete
  on public.published_artifact_storage for delete to app_rls
  using (
    public.app_can_run_published_artifact(published_artifact_id)
    and (owner_user_id is null or owner_user_id = (select public.current_app_user_id()))
  );

comment on table public.published_artifact_storage is
  'Key-value text a published HTML or React artifact keeps between visits. A row with owner_user_id is personal to that signed-in viewer; a row without one is shared by every viewer who can open the artifact. Unpublishing the artifact deletes its rows.';
comment on column public.published_artifact_storage.value_bytes is
  'UTF-8 bytes of the key and value, summed per artifact and scope against the 20 MB storage allowance.';

delete from public.schema_migrations where filename = '0372_published_site_viewers.sql';

commit;

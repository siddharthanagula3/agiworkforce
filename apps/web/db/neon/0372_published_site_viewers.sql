-- =============================================================================
-- Migration 0372: share a published site with named people
--
-- Why    : a published artifact could be opened by anyone with the link or by
--          the publisher's workspace, never by a short list of named people.
--
-- Shape  : a third visibility, 'invited', closes the anonymous token page.
--          published_artifact_viewers lists the email addresses invited to one
--          publication. A signed-in account may read an invited publication
--          when its profile email is on that list; the publisher manages the
--          list and every other account sees nothing. Emails are stored
--          lower-cased and compared lower-cased.
--
-- Depends: 0037_rls_user_isolation (current_app_user_id, app_rls role)
--          0095_published_artifacts, 0184_organization_shared_artifacts
-- =============================================================================

begin;

alter table public.published_artifacts
  drop constraint if exists published_artifacts_visibility_check;

alter table public.published_artifacts
  add constraint published_artifacts_visibility_check
  check (visibility in ('public', 'organization', 'invited'));

create table if not exists public.published_artifact_viewers (
  published_artifact_id uuid not null references public.published_artifacts(id) on delete cascade,
  email text not null check (
    email = lower(email) and char_length(email) between 3 and 320 and position('@' in email) > 1
  ),
  invited_by_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (published_artifact_id, email)
);

create index if not exists idx_published_artifact_viewers_email
  on public.published_artifact_viewers(email);

grant select, insert, delete on public.published_artifact_viewers to app_rls;

alter table public.published_artifact_viewers enable row level security;
alter table public.published_artifact_viewers force row level security;

-- The read policies never consult published_artifacts: its invited-read policy
-- consults this table, and a cycle between the two would recurse (see 0185).
drop policy if exists published_artifact_viewers_read on public.published_artifact_viewers;
create policy published_artifact_viewers_read
  on public.published_artifact_viewers for select to app_rls
  using (
    invited_by_user_id = public.current_app_user_id()
    or exists (
      select 1
        from public.profiles profile
       where profile.id = public.current_app_user_id()
         and lower(profile.email) = published_artifact_viewers.email
    )
  );

drop policy if exists published_artifact_viewers_owner_insert on public.published_artifact_viewers;
create policy published_artifact_viewers_owner_insert
  on public.published_artifact_viewers for insert to app_rls
  with check (
    invited_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.published_artifacts artifact
       where artifact.id = published_artifact_viewers.published_artifact_id
         and artifact.user_id = public.current_app_user_id()
    )
  );

drop policy if exists published_artifact_viewers_owner_delete on public.published_artifact_viewers;
create policy published_artifact_viewers_owner_delete
  on public.published_artifact_viewers for delete to app_rls
  using (
    exists (
      select 1
        from public.published_artifacts artifact
       where artifact.id = published_artifact_viewers.published_artifact_id
         and artifact.user_id = public.current_app_user_id()
    )
  );

drop policy if exists published_artifacts_invited_read on public.published_artifacts;
create policy published_artifacts_invited_read
  on public.published_artifacts for select to app_rls
  using (
    visibility = 'invited'
    and exists (
      select 1
        from public.published_artifact_viewers viewer
        join public.profiles profile on profile.id = public.current_app_user_id()
       where viewer.published_artifact_id = published_artifacts.id
         and viewer.email = lower(profile.email)
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
       or exists (
         select 1
           from public.organization_shared_artifacts share
          where share.published_artifact_id = a.id
            and public.app_org_resource_is_readable(share.organization_id)
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
         or exists (
           select 1
             from public.organization_shared_artifacts share
            where share.published_artifact_id = a.id
              and public.app_org_resource_is_readable(share.organization_id)
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

commit;

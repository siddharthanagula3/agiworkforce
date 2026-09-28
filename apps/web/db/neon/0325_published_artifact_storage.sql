begin;

create table if not exists public.published_artifact_storage (
  id uuid primary key default gen_random_uuid(),
  published_artifact_id uuid not null references public.published_artifacts(id) on delete cascade,
  owner_user_id text references public.profiles(id) on delete cascade,
  scope_key text generated always as (coalesce(owner_user_id, '')) stored,
  storage_key text not null check (
    char_length(storage_key) between 1 and 200
    and storage_key !~ '[[:space:]/\\''"]'
  ),
  value text not null,
  value_bytes integer generated always as (octet_length(storage_key) + octet_length(value)) stored,
  updated_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_artifact_storage_value_size check (octet_length(value) <= 5242880)
);

create unique index if not exists published_artifact_storage_key_idx
  on public.published_artifact_storage (published_artifact_id, scope_key, storage_key);

drop trigger if exists set_published_artifact_storage_updated_at
  on public.published_artifact_storage;
create trigger set_published_artifact_storage_updated_at
  before update on public.published_artifact_storage
  for each row execute function public.set_row_updated_at();

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
comment on function public.app_runnable_published_artifact(text) is
  'The published artifact a signed-in viewer may run by token: public, their own, or shared with a workspace they can read. HTML and React only, since only those run script.';

commit;

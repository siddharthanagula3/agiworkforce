-- Full-stack SaaS reference schema: tenant projects, tasks, RLS, and storage.
create extension if not exists pgcrypto;

do $$
begin
  create type public.project_role as enum ('owner', 'admin', 'member', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_status as enum ('todo', 'doing', 'blocked', 'done');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete restrict,
  assignee_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  body text check (body is null or char_length(body) <= 4000),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 3 and 80),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_members_user_idx on public.project_members (user_id, project_id);
create index if not exists project_members_project_role_idx on public.project_members (project_id, role);
create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index if not exists tasks_project_status_idx on public.tasks (project_id, status, updated_at desc);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id) where assignee_id is not null;
create index if not exists activity_project_created_idx on public.activity_events (project_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.prevent_project_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'project owner_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_owner_immutable on public.projects;
create trigger projects_owner_immutable
before update on public.projects
for each row execute function public.prevent_project_owner_change();

create or replace function public.prevent_task_scope_change()
returns trigger
language plpgsql
as $$
begin
  if new.project_id <> old.project_id or new.creator_id <> old.creator_id then
    raise exception 'task project_id and creator_id are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_scope_immutable on public.tasks;
create trigger tasks_scope_immutable
before update on public.tasks
for each row execute function public.prevent_task_scope_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.has_project_role(project_uuid uuid, allowed_roles public.project_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_uuid
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  );
$$;

create or replace function public.unaccent_fallback(value text)
returns text
language sql
immutable
as $$
  select translate(value, 'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn');
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(public.unaccent_fallback(value)), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.create_project(p_name text, p_description text default null)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  base_slug text := public.slugify(p_name);
  inserted public.projects;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if base_slug = '' then
    base_slug := 'project';
  end if;

  insert into public.projects (owner_id, name, slug, description)
  values (current_user_id, p_name, base_slug || '-' || substr(gen_random_uuid()::text, 1, 8), p_description)
  returning * into inserted;

  return inserted;
end;
$$;

create or replace function public.ensure_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists projects_owner_membership on public.projects;
create trigger projects_owner_membership
after insert on public.projects
for each row execute function public.ensure_owner_membership();

create or replace function public.storage_project_id(path text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(path))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(path))[1])::uuid
    else null
  end;
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "projects_select_members" on public.projects;
create policy "projects_select_members" on public.projects
for select to authenticated
using (public.has_project_role(id, array['owner','admin','member','viewer']::public.project_role[]));

drop policy if exists "projects_insert_owner" on public.projects;
create policy "projects_insert_owner" on public.projects
for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "projects_update_admins" on public.projects;
create policy "projects_update_admins" on public.projects
for update to authenticated
using (public.has_project_role(id, array['owner','admin']::public.project_role[]))
with check (public.has_project_role(id, array['owner','admin']::public.project_role[]));

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects
for delete to authenticated
using (public.has_project_role(id, array['owner']::public.project_role[]));

drop policy if exists "members_select_project" on public.project_members;
create policy "members_select_project" on public.project_members
for select to authenticated
using (public.has_project_role(project_id, array['owner','admin','member','viewer']::public.project_role[]));

drop policy if exists "members_insert_admins" on public.project_members;
create policy "members_insert_admins" on public.project_members
for insert to authenticated
with check (
  public.has_project_role(project_id, array['owner','admin']::public.project_role[])
  and (role <> 'owner' or public.has_project_role(project_id, array['owner']::public.project_role[]))
);

drop policy if exists "members_update_admins" on public.project_members;
create policy "members_update_admins" on public.project_members
for update to authenticated
using (public.has_project_role(project_id, array['owner','admin']::public.project_role[]))
with check (
  public.has_project_role(project_id, array['owner','admin']::public.project_role[])
  and (role <> 'owner' or public.has_project_role(project_id, array['owner']::public.project_role[]))
);

drop policy if exists "members_delete_admins" on public.project_members;
create policy "members_delete_admins" on public.project_members
for delete to authenticated
using (public.has_project_role(project_id, array['owner','admin']::public.project_role[]));

drop policy if exists "tasks_select_members" on public.tasks;
create policy "tasks_select_members" on public.tasks
for select to authenticated
using (public.has_project_role(project_id, array['owner','admin','member','viewer']::public.project_role[]));

drop policy if exists "tasks_insert_writers" on public.tasks;
create policy "tasks_insert_writers" on public.tasks
for insert to authenticated
with check (
  (select auth.uid()) = creator_id
  and public.has_project_role(project_id, array['owner','admin','member']::public.project_role[])
);

drop policy if exists "tasks_update_writers" on public.tasks;
create policy "tasks_update_writers" on public.tasks
for update to authenticated
using (public.has_project_role(project_id, array['owner','admin','member']::public.project_role[]))
with check (public.has_project_role(project_id, array['owner','admin','member']::public.project_role[]));

drop policy if exists "tasks_delete_writers" on public.tasks;
create policy "tasks_delete_writers" on public.tasks
for delete to authenticated
using (public.has_project_role(project_id, array['owner','admin','member']::public.project_role[]));

drop policy if exists "activity_select_members" on public.activity_events;
create policy "activity_select_members" on public.activity_events
for select to authenticated
using (public.has_project_role(project_id, array['owner','admin','member','viewer']::public.project_role[]));

drop policy if exists "activity_insert_members" on public.activity_events;
create policy "activity_insert_members" on public.activity_events
for insert to authenticated
with check (
  (select auth.uid()) = actor_id
  and public.has_project_role(project_id, array['owner','admin','member']::public.project_role[])
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project_files_select_members" on storage.objects;
create policy "project_files_select_members" on storage.objects
for select to authenticated
using (
  bucket_id = 'project-files'
  and public.has_project_role(public.storage_project_id(name), array['owner','admin','member','viewer']::public.project_role[])
);

drop policy if exists "project_files_insert_writers" on storage.objects;
create policy "project_files_insert_writers" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-files'
  and public.has_project_role(public.storage_project_id(name), array['owner','admin','member']::public.project_role[])
);

drop policy if exists "project_files_update_writers" on storage.objects;
create policy "project_files_update_writers" on storage.objects
for update to authenticated
using (
  bucket_id = 'project-files'
  and public.has_project_role(public.storage_project_id(name), array['owner','admin','member']::public.project_role[])
)
with check (
  bucket_id = 'project-files'
  and public.has_project_role(public.storage_project_id(name), array['owner','admin','member']::public.project_role[])
);

drop policy if exists "project_files_delete_admins" on storage.objects;
create policy "project_files_delete_admins" on storage.objects
for delete to authenticated
using (
  bucket_id = 'project-files'
  and public.has_project_role(public.storage_project_id(name), array['owner','admin']::public.project_role[])
);

grant execute on function public.has_project_role(uuid, public.project_role[]) to authenticated;
grant execute on function public.create_project(text, text) to authenticated;

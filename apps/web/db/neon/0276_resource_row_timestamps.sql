-- Depends: 0008, 0015, 0147
-- Rows that are rewritten in place must say when they began and when they last changed.
begin;

alter table public.connector_tool_permissions
  add column if not exists created_at timestamptz not null default now();

update public.connector_tool_permissions
   set created_at = updated_at
 where updated_at is not null
   and updated_at < created_at;

alter table public.mcp_response_cache
  add column if not exists created_at timestamptz not null default now();

update public.mcp_response_cache
   set created_at = updated_at
 where updated_at is not null
   and updated_at < created_at;

alter table public.organization_members
  add column if not exists updated_at timestamptz not null default now();

update public.organization_members
   set updated_at = greatest(
         coalesce(status_changed_at, joined_at),
         coalesce(joined_at, status_changed_at)
       )
 where status_changed_at is not null
    or joined_at is not null;

create or replace function public.touch_organization_member_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organization_members_touch_updated_at on public.organization_members;
create trigger organization_members_touch_updated_at
  before update on public.organization_members
  for each row
  execute function public.touch_organization_member_updated_at();

commit;

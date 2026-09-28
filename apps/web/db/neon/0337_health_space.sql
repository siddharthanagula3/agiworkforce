begin;

alter table public.user_projects
  add column if not exists space_kind text;

alter table public.user_projects
  drop constraint if exists user_projects_space_kind_check,
  add constraint user_projects_space_kind_check
    check (space_kind is null or (space_kind = 'health' and organization_id is null));

create unique index if not exists user_projects_one_health_space
  on public.user_projects (user_id)
  where space_kind = 'health' and deleted_at is null;

create or replace function public.assert_user_resource_limit(
  p_resource text,
  p_user_id text,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  if p_limit is null then
    return true;
  end if;

  if p_limit < 0 then
    raise exception 'invalid_user_resource_limit' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agi:user-resource:' || p_resource || ':' || p_user_id, 0)
  );

  case p_resource
    when 'projects' then
      select count(*) into v_count
        from public.user_projects
       where user_id = p_user_id
         and deleted_at is null
         and space_kind is null;
    when 'custom_connectors' then
      select count(*) into v_count
        from public.user_custom_connectors
       where user_id = p_user_id;
    else
      raise exception 'unknown_user_resource' using errcode = '22023';
  end case;

  if v_count > p_limit then
    raise exception 'user_resource_limit_reached'
      using errcode = 'P0001', detail = p_resource;
  end if;

  return true;
end;
$$;

create or replace function public.keep_health_space_conversations()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.project_id is not null
     and new.deleted_at is null
     and new.project_id is distinct from old.project_id
     and exists (
       select 1
         from public.user_projects p
        where p.user_id = old.user_id
          and p.id::text = old.project_id
          and p.space_kind = 'health'
     ) then
    new.project_id := old.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_health_space_conversations on public.web_conversations;
create trigger keep_health_space_conversations
  before update of project_id on public.web_conversations
  for each row
  execute function public.keep_health_space_conversations();

create or replace function public.delete_health_space_conversations()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.web_conversations
     set deleted_at = new.deleted_at,
         updated_at = now(),
         compaction_summary = null,
         compaction_summary_through_message_id = null,
         compaction_summary_digest = null
   where user_id = new.user_id
     and project_id = new.id::text
     and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists delete_health_space_conversations on public.user_projects;
create trigger delete_health_space_conversations
  after update of deleted_at on public.user_projects
  for each row
  when (old.deleted_at is null and new.deleted_at is not null and new.space_kind = 'health')
  execute function public.delete_health_space_conversations();

create or replace function public.refuse_health_space_share()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
      from public.user_projects p
     where p.id = new.project_id
       and p.space_kind = 'health'
  ) then
    raise exception 'Health cannot be shared.'
      using errcode = 'check_violation',
            constraint = 'organization_shared_projects_health_space';
  end if;
  return new;
end;
$$;

drop trigger if exists refuse_health_space_share on public.organization_shared_projects;
create trigger refuse_health_space_share
  before insert or update of project_id on public.organization_shared_projects
  for each row
  execute function public.refuse_health_space_share();

commit;

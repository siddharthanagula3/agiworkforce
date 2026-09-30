begin;

drop trigger if exists refuse_health_space_share on public.organization_shared_projects;
drop function if exists public.refuse_health_space_share();

drop trigger if exists delete_health_space_conversations on public.user_projects;
drop function if exists public.delete_health_space_conversations();

drop trigger if exists keep_health_space_conversations on public.web_conversations;
drop function if exists public.keep_health_space_conversations();

drop index if exists public.user_projects_one_health_space;

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
         and deleted_at is null;
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

alter table public.user_projects
  drop constraint if exists user_projects_space_kind_check,
  drop column if exists space_kind;

delete from public.schema_migrations
 where filename = '0337_health_space.sql';

commit;

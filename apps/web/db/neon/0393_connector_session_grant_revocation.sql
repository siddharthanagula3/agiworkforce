-- destructive: the function below deletes a caller's connector session grants only when they revoke a tool. Applying this migration creates the function and deletes no rows.
begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Connector grant revocation requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

create function public.revoke_connector_tool_session_grants(
  p_connector_id text,
  p_tool_name text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set row_security = off
as $$
declare
  v_subject text := public.current_app_user_id();
  v_removed integer;
begin
  if v_subject is null or btrim(v_subject) = '' or char_length(v_subject) > 255 then
    raise exception using errcode = '42501', message = 'Connector grant revocation requires a bound user';
  end if;
  if p_connector_id is null or char_length(p_connector_id) not between 1 and 200
    or (p_tool_name is not null and char_length(p_tool_name) not between 1 and 200) then
    raise exception using errcode = '22023', message = 'Invalid connector grant revocation';
  end if;

  delete from public.connector_tool_session_grants
   where user_id = v_subject
     and connector_id = p_connector_id
     and (p_tool_name is null or tool_name = p_tool_name);
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.revoke_connector_tool_session_grants(text, text) from public;
grant execute on function public.revoke_connector_tool_session_grants(text, text) to app_rls;

commit;

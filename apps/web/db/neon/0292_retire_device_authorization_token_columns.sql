-- destructive: the two legacy token columns are dropped only when every value is NULL;
-- the currently deployed application no longer names them, and the retained RPC
-- keeps its return shape without reading bearer values from this table.

do $$
begin
  if exists (
    select 1
      from public.device_authorization_codes
     where access_token is not null or refresh_token is not null
  ) then
    raise exception 'device authorization token retirement requires empty legacy columns'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.consume_device_authorization_tokens(p_device_id text)
returns table(
  status text,
  user_id text,
  user_email text,
  user_name text,
  access_token text,
  refresh_token text
)
language plpgsql
as $$
declare
  v_rec record;
begin
  select dac.status, dac.expires_at, dac.user_id, dac.user_email, dac.user_name
    into v_rec
    from public.device_authorization_codes dac
   where dac.device_id = p_device_id
   for update;

  if not found then
    return;
  end if;

  if v_rec.expires_at is not null and v_rec.expires_at < now() then
    update public.device_authorization_codes d
       set status = 'expired', updated_at = now()
     where d.device_id = p_device_id
       and d.status in ('pending', 'approved');

    return query
      select 'expired'::text, v_rec.user_id::text,
             v_rec.user_email::text, v_rec.user_name::text,
             null::text, null::text;
    return;
  end if;

  if v_rec.status <> 'approved' then
    return query
      select v_rec.status::text, v_rec.user_id::text,
             v_rec.user_email::text, v_rec.user_name::text,
             null::text, null::text;
    return;
  end if;

  update public.device_authorization_codes d
     set status = 'consumed', consumed_at = now(), updated_at = now()
   where d.device_id = p_device_id
     and d.status = 'approved';

  return query
    select 'approved'::text, v_rec.user_id::text,
           v_rec.user_email::text, v_rec.user_name::text,
           null::text, null::text;
end;
$$;

alter table public.device_authorization_codes
  drop column access_token,
  drop column refresh_token;

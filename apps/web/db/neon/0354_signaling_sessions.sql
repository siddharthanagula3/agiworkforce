create table if not exists public.signaling_sessions (
  code text primary key,
  created_at bigint not null,
  expires_at bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint signaling_sessions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

do $$
declare
  relation oid := 'public.signaling_sessions'::regclass;
  columns jsonb;
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'The signaling store requires a privileged owner with BYPASSRLS';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class where oid = relation and relkind = 'r'
  ) then
    raise exception 'The existing signaling_sessions relation is not an ordinary table';
  end if;

  select jsonb_object_agg(
           attname,
           jsonb_build_array(
             pg_catalog.format_type(atttypid, atttypmod), attnotnull, attidentity, attgenerated
           )
         )
    into columns
    from pg_catalog.pg_attribute
   where attrelid = relation and attnum > 0 and not attisdropped;

  if columns is distinct from '{
    "code": ["text", true, "", ""],
    "created_at": ["bigint", true, "", ""],
    "expires_at": ["bigint", true, "", ""],
    "metadata": ["jsonb", true, "", ""]
  }'::jsonb then
    raise exception 'The existing signaling_sessions columns do not match the relay contract';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = relation and contype = 'p' and not condeferrable
       and conkey = array[
         (select attnum from pg_catalog.pg_attribute
           where attrelid = relation and attname = 'code' and not attisdropped)
       ]::smallint[]
  ) then
    raise exception 'The signaling store requires an immediate primary key on code';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = relation and contype = 'c' and convalidated
       and conname = 'signaling_sessions_metadata_object'
       and pg_catalog.pg_get_constraintdef(oid)
           = 'CHECK ((jsonb_typeof(metadata) = ''object''::text))'
  ) then
    raise exception 'The signaling store requires object-shaped pairing metadata';
  end if;

  if exists (select 1 from pg_catalog.pg_policy where polrelid = relation) then
    raise exception 'The server-only signaling store must not have row access policies';
  end if;
end;
$$;

revoke all on public.signaling_sessions from app_rls;
revoke all on public.signaling_sessions from public;

alter table public.signaling_sessions enable row level security;
alter table public.signaling_sessions force row level security;

comment on table public.signaling_sessions is
  'Server-only pairing sessions and rotated peer credentials. The relay uses the privileged Neon owner; application roles have no access. Creation and expiry times are Unix milliseconds.';

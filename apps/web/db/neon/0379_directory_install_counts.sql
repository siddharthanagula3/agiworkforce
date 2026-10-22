-- =============================================================================
-- Migration 0379: directory install counts
--
-- Why    : the directory shows how many accounts use a skill and ranks the
--          connectors people connect most. Both numbers must be measured, and
--          neither may expose who installed or connected what.
--
-- Shape  : skill_install_counts holds one running total per skill name. It is
--          kept by a trigger on user_settings, where each account records the
--          skills it installed (settings.skills.installs, name -> true), so
--          every writer of that document keeps the total exact, including
--          account erasure. The table is service-owned: forced RLS and no
--          app_rls policy. Accounts read it only through skill_install_totals,
--          which returns the total for the names asked about and nothing else.
--          directory_connector_connection_counts returns, per connector id,
--          how many distinct accounts hold a live connection or OAuth grant.
--          It runs as its caller and is executable only by the owner role, so
--          app_rls can neither call it nor reach rows through it.
--
-- Depends: 0028_user_settings, 0048_user_connectors, 0097_connector_oauth_broker
-- =============================================================================

begin;

create table if not exists public.skill_install_counts (
  skill_name text primary key check (char_length(skill_name) between 1 and 200),
  installs bigint not null default 0 check (installs >= 0),
  updated_at timestamptz not null default now()
);

alter table public.skill_install_counts enable row level security;
alter table public.skill_install_counts force row level security;
revoke all on public.skill_install_counts from public, app_rls;

create or replace function public.installed_skill_names(p_settings jsonb)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(entry.key order by entry.key), '{}'::text[])
    from jsonb_each(
      case
        when jsonb_typeof(p_settings -> 'skills' -> 'installs') = 'object'
          then p_settings -> 'skills' -> 'installs'
        else '{}'::jsonb
      end
    ) as entry
   where entry.value = 'true'::jsonb
     and char_length(entry.key) between 1 and 200;
$$;

revoke all on function public.installed_skill_names(jsonb) from public;

create or replace function public.sync_skill_install_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_names text[] := '{}'::text[];
  next_names text[] := '{}'::text[];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    previous_names := public.installed_skill_names(old.settings);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    next_names := public.installed_skill_names(new.settings);
  end if;
  if previous_names = next_names then
    return null;
  end if;

  insert into public.skill_install_counts as counts (skill_name, installs, updated_at)
  select added.name, 1, now()
    from unnest(next_names) as added(name)
   where not (added.name = any (previous_names))
  on conflict (skill_name)
  do update set installs = counts.installs + 1, updated_at = now();

  update public.skill_install_counts as counts
     set installs = greatest(counts.installs - 1, 0),
         updated_at = now()
   where counts.skill_name in (
     select removed.name
       from unnest(previous_names) as removed(name)
      where not (removed.name = any (next_names))
   );

  return null;
end;
$$;

revoke all on function public.sync_skill_install_counts() from public;

lock table public.user_settings in share row exclusive mode;

insert into public.skill_install_counts (skill_name, installs, updated_at)
select installed.name, count(*), now()
  from public.user_settings settings_row
 cross join lateral unnest(public.installed_skill_names(settings_row.settings)) as installed(name)
 group by installed.name
on conflict (skill_name)
do update set installs = excluded.installs, updated_at = excluded.updated_at;

drop trigger if exists user_settings_skill_install_counts on public.user_settings;
create trigger user_settings_skill_install_counts
  after insert or update of settings or delete on public.user_settings
  for each row execute function public.sync_skill_install_counts();

create or replace function public.skill_install_totals(p_names text[])
returns table (skill_name text, installs bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select counts.skill_name, counts.installs
    from public.skill_install_counts counts
   where counts.skill_name = any (p_names)
     and counts.installs > 0;
$$;

revoke all on function public.skill_install_totals(text[]) from public;
grant execute on function public.skill_install_totals(text[]) to app_rls;

create or replace function public.directory_connector_connection_counts()
returns table (connector_id text, connections bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select live.connector_id, count(distinct live.user_id)::bigint
    from (
      select uc.connector_id, uc.user_id
        from public.user_connectors uc
       where uc.is_active
      union all
      select grant_row.connector_id, grant_row.user_id
        from public.connector_oauth_grants grant_row
       where grant_row.revoked_at is null
    ) as live
   group by live.connector_id;
$$;

revoke all on function public.directory_connector_connection_counts() from public, app_rls;

comment on table public.skill_install_counts is
  'Running total of accounts that installed each skill, kept by a trigger on user_settings. Holds no account ids.';
comment on function public.skill_install_totals(text[]) is
  'Install totals for the named skills, only where at least one account installed it.';
comment on function public.directory_connector_connection_counts() is
  'Distinct accounts with a live connection or OAuth grant per connector id. Owner role only.';

commit;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

lock table public.project_knowledge_files in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.project_knowledge_files
     where deleted_at is null and nullif(storage_uri, '') is not null
       and (storage_uri !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
         or storage_uri like '%//%'
         or storage_uri ~ '(^|/)\.{1,2}(/|$)')
  ) then
    raise exception 'Normalize legacy project knowledge URLs through the configured object-storage owner before applying this migration';
  end if;
  if exists (
    select storage_uri from public.project_knowledge_files f
      join public.user_projects p on p.id = f.project_id
     where f.deleted_at is null and nullif(f.storage_uri, '') is not null
     group by storage_uri
    having count(distinct (p.user_id, p.organization_id)) <> 1
  ) then
    raise exception 'A project knowledge key has references in multiple owning scopes; resolve its ownership before applying this migration';
  end if;
end
$$;

create function public.project_knowledge_object_fingerprint(object_key text)
returns text language sql immutable strict parallel safe
set search_path = pg_catalog
as $$ select encode(sha256(convert_to(object_key, 'UTF8')), 'hex') $$;

create function public.valid_project_knowledge_storage_targets(descriptor jsonb)
returns boolean language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  select case when jsonb_typeof(descriptor) = 'object' and octet_length(descriptor::text) <= 16384
    then not exists (
      select 1 from jsonb_each(descriptor) entry
       where entry.key = '' or jsonb_typeof(entry.value) <> 'string' or entry.value #>> '{}' = ''
    ) else false end
$$;

alter table public.project_knowledge_files
  add column storage_targets jsonb not null default '{}'::jsonb
    check (public.valid_project_knowledge_storage_targets(storage_targets));

create table public.project_knowledge_objects (
  fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{64}$'),
  object_key text unique,
  user_id text,
  organization_id uuid,
  origin_region text,
  origin_known boolean not null default false,
  cleanup_job_id uuid,
  reference_count bigint not null check (reference_count >= 0),
  state text not null check (state in ('referenced', 'queued', 'deleting', 'deleted')),
  targets jsonb not null default '{}'::jsonb
    check (public.valid_project_knowledge_storage_targets(targets)),
  receipts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(receipts) = 'object' and pg_column_size(receipts) <= 16384),
  claim_token uuid,
  lease_expires_at timestamptz,
  retired_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_knowledge_objects_origin_state check (origin_known or origin_region is null),
  constraint project_knowledge_objects_reference_state check (
    (state = 'referenced' and reference_count > 0)
    or (state <> 'referenced' and reference_count = 0)
  ),
  constraint project_knowledge_objects_live_key check (
    (state = 'deleted' and object_key is null and user_id is null and organization_id is null)
    or (state <> 'deleted' and object_key is not null and user_id is not null)
  ),
  constraint project_knowledge_objects_key_identity check (
    object_key is null or fingerprint = public.project_knowledge_object_fingerprint(object_key)
  ),
  constraint project_knowledge_objects_claim_state check (
    (state = 'deleting' and claim_token is not null and lease_expires_at is not null and targets <> '{}'::jsonb)
    or (state <> 'deleting' and claim_token is null and lease_expires_at is null)
  )
);

insert into public.project_knowledge_objects
  (fingerprint, object_key, user_id, organization_id, reference_count, state)
select public.project_knowledge_object_fingerprint(f.storage_uri), f.storage_uri,
       p.user_id, p.organization_id, count(*), 'referenced'
  from public.project_knowledge_files f join public.user_projects p on p.id = f.project_id
 where f.deleted_at is null and nullif(f.storage_uri, '') is not null
 group by f.storage_uri, p.user_id, p.organization_id;

create index project_knowledge_objects_cleanup_idx
  on public.project_knowledge_objects (updated_at, fingerprint)
  where state in ('queued', 'deleting');

create index project_knowledge_objects_dispatch_idx
  on public.project_knowledge_objects (origin_region, retired_at, fingerprint)
  where state in ('queued', 'deleting') and cleanup_job_id is null and origin_known;

revoke all on public.project_knowledge_objects from public, app_rls;
grant select on public.project_knowledge_objects to app_rls;
alter table public.project_knowledge_objects enable row level security;
alter table public.project_knowledge_objects force row level security;
create policy project_knowledge_objects_owner_read on public.project_knowledge_objects
  for select to app_rls
  using (user_id = (select public.current_app_user_id())
    and organization_id is not distinct from (select public.current_app_org_id()));
do $$
begin
  execute format('create policy project_knowledge_objects_service on public.project_knowledge_objects for all to %I using (true) with check (true)', current_user);
end
$$;

create function public.track_project_knowledge_object_reference()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  previous_key text;
  next_key text;
  owning_user text;
  owning_org uuid;
  owning_region text;
  region_owner uuid;
  acquired text;
  admitted_targets jsonb;
begin
  if tg_op = 'UPDATE' and new.storage_targets is distinct from old.storage_targets then
    raise exception 'Project source storage provenance is immutable' using errcode = '23514';
  end if;
  if tg_op <> 'INSERT' and old.deleted_at is null then previous_key := nullif(old.storage_uri, ''); end if;
  if tg_op <> 'DELETE' and new.deleted_at is null then next_key := nullif(new.storage_uri, ''); end if;
  if next_key is not null then
    if next_key !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' or next_key like '%//%' or next_key ~ '(^|/)\.{1,2}(/|$)' then
      raise exception 'Project knowledge references require a canonical object key' using errcode = '23514';
    end if;
    select p.user_id, p.organization_id, o.data_region, o.id
      into owning_user, owning_org, owning_region, region_owner
      from public.user_projects p left join public.organizations o on o.id = p.organization_id
      where p.id = new.project_id and p.deleted_at is null
        and (not p.is_archived or previous_key is not distinct from next_key)
      for share of p;
    if not found then raise exception 'The owning project is unavailable' using errcode = '23503'; end if;
    if owning_org is not null and region_owner is null then
      raise exception 'The owning workspace is unavailable' using errcode = '23503';
    end if;
  end if;
  if previous_key is not distinct from next_key then
    if next_key is not null then
      update public.project_knowledge_objects
         set updated_at = updated_at
       where fingerprint = public.project_knowledge_object_fingerprint(next_key)
         and state = 'referenced' and user_id = owning_user
         and organization_id is not distinct from owning_org;
      if not found then raise exception 'The object no longer admits references in this owning scope' using errcode = '23514'; end if;
    end if;
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if next_key is not null then
    insert into public.project_knowledge_objects as objects
      (fingerprint, object_key, user_id, organization_id, reference_count, state, targets, origin_region, origin_known)
    values (public.project_knowledge_object_fingerprint(next_key), next_key, owning_user, owning_org, 1, 'referenced', new.storage_targets,
      case when new.storage_targets <> '{}'::jsonb then owning_region else null end,
      new.storage_targets <> '{}'::jsonb)
    on conflict (fingerprint) do update
      set reference_count = objects.reference_count + 1, updated_at = now()
      where objects.state = 'referenced' and objects.object_key = excluded.object_key
        and objects.user_id = excluded.user_id
        and objects.organization_id is not distinct from excluded.organization_id
        and (excluded.targets = '{}'::jsonb or (objects.targets = excluded.targets
          and objects.origin_known and objects.origin_region is not distinct from excluded.origin_region))
    returning fingerprint, targets into acquired, admitted_targets;
    if acquired is null then raise exception 'The object no longer admits references in this owning scope' using errcode = '23514'; end if;
    new.storage_targets := admitted_targets;
  end if;
  if previous_key is not null then
    update public.project_knowledge_objects
       set reference_count = reference_count - 1,
           state = case when reference_count = 1 then 'queued' else 'referenced' end,
           retired_at = case when reference_count = 1 then now() else retired_at end,
           updated_at = now()
     where fingerprint = public.project_knowledge_object_fingerprint(previous_key)
       and state = 'referenced' and reference_count > 0;
    if not found then raise exception 'Project knowledge reference accounting is inconsistent' using errcode = '23514'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;

create trigger project_knowledge_object_reference
before insert or delete or update of storage_uri, deleted_at, project_id, storage_targets
on public.project_knowledge_files
for each row execute function public.track_project_knowledge_object_reference();

create function public.guard_project_knowledge_object_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
    and current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Project retirement requires a fresh source snapshot' using errcode = '40001';
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform k.id from public.project_knowledge_files k
      where k.project_id=old.id and k.deleted_at is null order by k.id for update;
    perform objects.fingerprint from public.project_knowledge_objects objects
      where objects.fingerprint in (
        select public.project_knowledge_object_fingerprint(k.storage_uri)
          from public.project_knowledge_files k where k.project_id=old.id and k.deleted_at is null
      ) order by objects.fingerprint for update;
  end if;
  if (new.user_id is distinct from old.user_id or new.organization_id is distinct from old.organization_id)
    and exists (select 1 from public.project_knowledge_files where project_id = old.id and deleted_at is null and nullif(storage_uri, '') is not null) then
    raise exception 'Project source ownership cannot change without a reviewed source transfer' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger project_knowledge_object_scope
before update of user_id, organization_id, deleted_at on public.user_projects
for each row execute function public.guard_project_knowledge_object_scope();

create function public.claim_project_knowledge_object_cleanup(
  object_fingerprint text, target_descriptor jsonb, lease_seconds integer
) returns setof public.project_knowledge_objects
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if lease_seconds < 1 or lease_seconds > 3600 or lease_seconds is null
    or target_descriptor is null or not public.valid_project_knowledge_storage_targets(target_descriptor)
    or target_descriptor = '{}'::jsonb then
    raise exception 'Invalid cleanup claim parameters' using errcode = '22023';
  end if;
  return query update public.project_knowledge_objects as objects
    set state = 'deleting', claim_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds), updated_at = now()
    where fingerprint = object_fingerprint and reference_count = 0
      and (state = 'queued' or (state = 'deleting' and lease_expires_at <= clock_timestamp()))
      and targets <> '{}'::jsonb and target_descriptor @> targets
    returning objects.*;
end
$$;

create function public.renew_project_knowledge_object_cleanup(
  object_fingerprint text, token uuid, lease_seconds integer
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if lease_seconds < 1 or lease_seconds > 3600 or lease_seconds is null then
    raise exception 'Invalid cleanup lease duration' using errcode = '22023';
  end if;
  update public.project_knowledge_objects
     set lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds), updated_at = now()
   where fingerprint = object_fingerprint and state = 'deleting' and reference_count = 0
     and claim_token = token and lease_expires_at > clock_timestamp();
  return found;
end
$$;

create function public.record_project_knowledge_object_cleanup(
  object_fingerprint text, token uuid, target_name text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  pending public.project_knowledge_objects%rowtype;
  confirmed jsonb;
begin
  select * into pending from public.project_knowledge_objects
    where fingerprint = object_fingerprint and state = 'deleting' and reference_count = 0
      and claim_token = token and lease_expires_at > clock_timestamp()
    for update;
  if not found then return false; end if;
  if not pending.targets ? target_name then raise exception 'Unknown cleanup target' using errcode = '22023'; end if;
  confirmed := pending.receipts || jsonb_build_object(target_name, clock_timestamp());
  if confirmed ?& array(select jsonb_object_keys(pending.targets)) then
    update public.project_knowledge_objects
      set state = 'deleted', object_key = null, user_id = null, organization_id = null,
          targets = '{}'::jsonb, receipts = confirmed, claim_token = null, lease_expires_at = null,
          completed_at = now(), updated_at = now()
      where fingerprint = object_fingerprint and claim_token = token;
  else
    update public.project_knowledge_objects set receipts = confirmed, updated_at = now()
      where fingerprint = object_fingerprint and claim_token = token;
  end if;
  return true;
end
$$;

create function public.app_project_content_held(target_project uuid, content_type text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  trusted_caller boolean;
  held_result boolean;
begin
  if content_type is null or content_type not in ('project', 'project_file') then return true; end if;
  trusted_caller := pg_has_role(coalesce(nullif(current_setting('role'), 'none'), session_user)::name, current_user, 'USAGE');
  select public.legal_hold_preserves(p.organization_id::uuid, p.user_id::text, content_type::text) into held_result from public.user_projects p
    where p.id=target_project and (trusted_caller or (
      p.user_id=public.current_app_user_id()
      and p.organization_id is not distinct from public.current_app_org_id()
      and (p.organization_id is null or public.current_app_org_role() is not null)
    ));
  if not found then raise exception 'Project content access is unavailable' using errcode = '42501'; end if;
  return held_result;
end
$$;

revoke all on function public.app_project_content_held(uuid, text) from public, app_rls;
grant execute on function public.app_project_content_held(uuid, text) to app_rls;
revoke all on function public.guard_project_knowledge_object_scope() from public, app_rls;
revoke all on function public.project_knowledge_object_fingerprint(text) from public, app_rls;
revoke all on function public.valid_project_knowledge_storage_targets(jsonb) from public, app_rls;
grant execute on function public.valid_project_knowledge_storage_targets(jsonb) to app_rls;
revoke all on function public.track_project_knowledge_object_reference() from public, app_rls;
revoke all on function public.claim_project_knowledge_object_cleanup(text, jsonb, integer) from public, app_rls;
revoke all on function public.renew_project_knowledge_object_cleanup(text, uuid, integer) from public, app_rls;
revoke all on function public.record_project_knowledge_object_cleanup(text, uuid, text) from public, app_rls;
commit;

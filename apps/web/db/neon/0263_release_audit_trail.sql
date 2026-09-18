-- =============================================================================
-- Migration 0263: append-only release audit trail
--
-- Why    : what happened to production was recorded only in GitHub Actions run
--          logs and a step summary. Those expire on the Actions retention
--          window, they are readable only by somebody with repository access,
--          and they cannot be read by the product, so no surface could show
--          what production is serving or when it was last rolled back.
--
-- Shape  : one row per release event (a promotion, a rollback, a drill), keyed
--          by nothing the deployer controls. `deployment_id` is the Vercel
--          deployment the event acted on, `previous_deployment_id` is what it
--          came from, which is what makes a rollback readable as a pair.
--
-- Chain  : previous_hash / entry_hash over the whole trail, the construction
--          0229 uses for the break-glass trail and 0262 for export custody.
--          One chain, not one per tenant: releases are platform events.
--
-- Write  : through public.append_release_event only. The function computes the
--          chain under a lock, so two concurrent writers cannot both read the
--          same tail and produce two rows claiming the same predecessor.
--
-- Keep   : UPDATE is refused for every role, always. DELETE is refused inside
--          the retention window, so a trail can age out but cannot be edited
--          or cleared after an incident.
--
-- Depends: none
-- =============================================================================

begin;

create table if not exists public.release_events (
  id bigint generated always as identity primary key,
  event text not null check (
    event in ('promoted', 'rolled_back', 'verification_failed', 'rollback_drill')
  ),
  surface text not null check (surface in ('web', 'gateway', 'sandbox')),
  environment text not null check (environment in ('production', 'staging')),
  outcome text not null check (outcome in ('succeeded', 'failed')),
  commit_sha text check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  deployment_id text,
  previous_deployment_id text,
  actor text not null,
  source text not null check (source in ('deploy_workflow', 'rollback_workflow', 'operator')),
  reason text,
  run_url text,
  detail jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  previous_hash text not null,
  entry_hash text not null,
  constraint release_events_failure_has_reason check (outcome <> 'failed' or reason is not null)
);

create index if not exists idx_release_events_recorded
  on public.release_events (recorded_at desc, id desc);

create index if not exists idx_release_events_surface
  on public.release_events (surface, environment, recorded_at desc);

comment on table public.release_events is
  'Append-only trail of what happened to a deployed surface: promotions, rollbacks, failed verifications and rollback drills, hash chained over the whole table. Written only through public.append_release_event.';

create or replace function public.append_release_event(
  p_event text,
  p_surface text,
  p_environment text,
  p_outcome text,
  p_actor text,
  p_source text,
  p_commit_sha text default null,
  p_deployment_id text default null,
  p_previous_deployment_id text default null,
  p_reason text default null,
  p_run_url text default null,
  p_detail jsonb default '{}'::jsonb
)
returns public.release_events
language plpgsql
as $$
declare
  v_previous text;
  v_recorded timestamptz := clock_timestamp();
  v_entry text;
  v_row public.release_events;
begin
  -- One advisory lock over the whole trail. Two writers that both read the same
  -- tail would otherwise chain two rows onto one predecessor.
  perform pg_advisory_xact_lock(hashtext('public.release_events'));

  select entry_hash into v_previous
    from public.release_events
   order by id desc
   limit 1;
  v_previous := coalesce(v_previous, repeat('0', 64));

  v_entry := encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          v_previous,
          p_event,
          p_surface,
          p_environment,
          p_outcome,
          coalesce(p_commit_sha, ''),
          coalesce(p_deployment_id, ''),
          coalesce(p_previous_deployment_id, ''),
          p_actor,
          p_source,
          coalesce(p_reason, ''),
          coalesce(p_run_url, ''),
          coalesce(p_detail, '{}'::jsonb)::text,
          to_char(v_recorded at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF')
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  insert into public.release_events (
    event, surface, environment, outcome, commit_sha, deployment_id,
    previous_deployment_id, actor, source, reason, run_url, detail,
    recorded_at, previous_hash, entry_hash
  ) values (
    p_event, p_surface, p_environment, p_outcome, p_commit_sha, p_deployment_id,
    p_previous_deployment_id, p_actor, p_source, p_reason, p_run_url,
    coalesce(p_detail, '{}'::jsonb), v_recorded, v_previous, v_entry
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.append_release_event(
  text, text, text, text, text, text, text, text, text, text, text, jsonb
) is
  'The only supported write to public.release_events: computes the hash chain under an advisory lock and returns the appended row.';

create or replace function public.release_events_are_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.recorded_at < now() - interval '400 days' then
    return old;
  end if;
  raise exception
    'release_events is append-only: % is refused inside the 400 day retention window. Correct the trail by appending.',
    tg_op;
end;
$$;

comment on function public.release_events_are_append_only() is
  'Refuses UPDATE for every role and DELETE of any row still inside the release audit retention window, including the owner connection the deploy path holds.';

drop trigger if exists release_events_append_only on public.release_events;
create trigger release_events_append_only
  before update or delete on public.release_events
  for each row execute function public.release_events_are_append_only();

revoke all on public.release_events from app_rls;

commit;

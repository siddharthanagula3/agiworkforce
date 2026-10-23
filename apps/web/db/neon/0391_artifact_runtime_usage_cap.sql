-- =============================================================================
-- Migration 0391: each app's AI calls are attributed to it and capped per app
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : an app that calls AI from inside the page reserved managed usage as
--          an ordinary chat request. Nothing on the row said which app made
--          the call, and the only ceilings were the plan's own, so an app
--          looping with a fresh idempotency key per iteration could spend the
--          person's whole five-hour and weekly allowance, and nobody could
--          tell afterwards which app had done it.
--
-- Shape  : managed_usage_requests gains artifact_subject, 'published:<id>' for
--          an app opened from a published link and 'owned:<id>' for an app in
--          the person's own chat, null for every other request.
--          reserve_artifact_runtime_usage_microusd takes the per-user
--          reservation lock, counts the calls and spend this person made
--          through this app inside the window, refuses past either ceiling
--          with ARTIFACT_RUNTIME_LIMIT_REACHED, and otherwise delegates to
--          reserve_managed_usage_request_with_limits_microusd (0347) and
--          records the app on the reserved row, all in one transaction, so
--          parallel calls cannot each pass the count. A replayed idempotency
--          key is not counted again. A null call ceiling is an unlimited tier.
--          extend_artifact_runtime_usage_provider_step_microusd applies the
--          same spend ceiling to every later provider step of an app's run
--          before delegating to extend_managed_usage_request_provider_step_
--          microusd (0347), so a tool loop cannot outgrow the app's share one
--          step at a time. The window and ceilings come from the plan
--          catalogs through apps/web/lib/server/managed-usage-policy.ts.
--          app_published_artifact_uses_connectors tells a viewer whether a
--          publication reads connected apps, so the server can refuse a
--          viewer's write to data the publisher reads while connector output
--          could be in it.
--
-- Empty  : existing rows keep a null artifact_subject and count toward no app.
--
-- Depends: 0056 (managed_usage_requests), 0347 (reservation with limits),
--          0372 (app_can_run_published_artifact), 0380 (live_artifacts)
-- =============================================================================

begin;

alter table public.managed_usage_requests
  add column if not exists artifact_subject text
    constraint managed_usage_requests_artifact_subject_shape
      check (
        artifact_subject is null
        or artifact_subject ~ '^(published|owned):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );

create index if not exists idx_managed_usage_requests_artifact_subject
  on public.managed_usage_requests (user_id, artifact_subject, created_at desc)
  where artifact_subject is not null;

comment on column public.managed_usage_requests.artifact_subject is
  'The app whose page made this request: published:<published artifact id> or owned:<artifact id>. Null for requests no app made.';

create or replace function public.reserve_artifact_runtime_usage_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_microusd bigint,
  p_lease_token text,
  p_lease_seconds integer,
  p_session_cap_microusd bigint,
  p_weekly_cap_microusd bigint,
  p_flagship_weekly_cap_microusd bigint,
  p_is_flagship boolean,
  p_artifact_subject text,
  p_artifact_window_hours integer,
  p_artifact_max_calls integer,
  p_artifact_cap_microusd bigint
)
returns table(
  reservation_decision text,
  request_status text,
  lease_token text,
  estimated_cost_microusd bigint,
  settlement_status text,
  error_code text
)
language plpgsql
as $$
declare
  v_calls bigint := 0;
  v_spent bigint := 0;
  v_reservation record;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_artifact_subject is null
    or p_artifact_subject !~ '^(published|owned):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_artifact_window_hours is null or p_artifact_window_hours < 1
    or (p_artifact_max_calls is not null and p_artifact_max_calls < 0)
    or (p_artifact_cap_microusd is not null and p_artifact_cap_microusd < 0)
    or p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0 then
    raise exception using errcode = '22023', message = 'invalid artifact runtime limits';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  if not exists (
    select 1
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
  ) then
    select
      count(*)::bigint,
      coalesce(sum(coalesce(
        request_row.actual_cost_microusd,
        request_row.estimated_cost_microusd
      )), 0)::bigint
    into v_calls, v_spent
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.artifact_subject = p_artifact_subject
      and request_row.created_at >= now() - make_interval(hours => p_artifact_window_hours);

    if (p_artifact_max_calls is not null and v_calls >= p_artifact_max_calls)
      or (
        p_artifact_cap_microusd is not null
        and v_spent + p_estimated_cost_microusd > p_artifact_cap_microusd
      ) then
      return query select
        'artifact_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'ARTIFACT_RUNTIME_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  select limited.* into v_reservation
  from public.reserve_managed_usage_request_with_limits_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_microusd,
    p_lease_token,
    p_lease_seconds,
    p_session_cap_microusd,
    p_weekly_cap_microusd,
    p_flagship_weekly_cap_microusd,
    p_is_flagship
  ) limited;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'managed usage reservation returned no result';
  end if;

  if v_reservation.reservation_decision = 'acquired' then
    update public.managed_usage_requests request_row
    set artifact_subject = p_artifact_subject,
        updated_at = now()
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
      and request_row.artifact_subject is null;
  end if;

  return query select
    v_reservation.reservation_decision::text,
    v_reservation.request_status::text,
    v_reservation.lease_token::text,
    v_reservation.estimated_cost_microusd::bigint,
    v_reservation.settlement_status::text,
    v_reservation.error_code::text;
end;
$$;

revoke all on function public.reserve_artifact_runtime_usage_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean,
  text, integer, integer, bigint
) from public;
grant execute on function public.reserve_artifact_runtime_usage_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean,
  text, integer, integer, bigint
) to app_rls;

comment on function public.reserve_artifact_runtime_usage_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean,
  text, integer, integer, bigint
) is
  'Reserves managed usage for a call an app made from inside its page: refuses once the caller''s calls or spend through that app inside the window reach the given ceilings, then applies the plan ceilings of reserve_managed_usage_request_with_limits_microusd and records the app on the row, under one per-user lock.';

create or replace function public.extend_artifact_runtime_usage_provider_step_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_operation_key text,
  p_estimated_cost_microusd bigint,
  p_session_cap_microusd bigint,
  p_weekly_cap_microusd bigint,
  p_flagship_weekly_cap_microusd bigint,
  p_is_flagship boolean,
  p_artifact_subject text,
  p_artifact_window_hours integer,
  p_artifact_cap_microusd bigint
)
returns table(
  extension_decision text,
  request_status text,
  estimated_cost_microusd bigint,
  settlement_status text,
  error_code text
)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_spent bigint := 0;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_artifact_subject is null
    or p_artifact_subject !~ '^(published|owned):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_artifact_window_hours is null or p_artifact_window_hours < 1
    or (p_artifact_cap_microusd is not null and p_artifact_cap_microusd < 0)
    or p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0 then
    raise exception using errcode = '22023', message = 'invalid artifact runtime limits';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key;

  if not found or v_request.artifact_subject is distinct from p_artifact_subject then
    return query select
      'conflict'::text,
      coalesce(v_request.status, 'unknown')::text,
      coalesce(v_request.estimated_cost_microusd, 0)::bigint,
      null::text,
      'STATE_CONFLICT'::text;
    return;
  end if;

  if p_artifact_cap_microusd is not null
    and v_request.initial_provider_operation_key is not null
    and v_request.initial_provider_operation_key <> p_operation_key
    and not exists (
      select 1
      from public.managed_usage_request_extensions extension_row
      where extension_row.request_id = v_request.id
        and extension_row.operation_key = p_operation_key
    ) then
    select coalesce(sum(coalesce(
      request_row.actual_cost_microusd,
      request_row.estimated_cost_microusd
    )), 0)::bigint
    into v_spent
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.artifact_subject = p_artifact_subject
      and request_row.created_at >= now() - make_interval(hours => p_artifact_window_hours);

    if v_spent + p_estimated_cost_microusd > p_artifact_cap_microusd then
      return query select
        'artifact_limit'::text,
        v_request.status,
        v_request.estimated_cost_microusd,
        null::text,
        'ARTIFACT_RUNTIME_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  return query
  select extended.*
  from public.extend_managed_usage_request_provider_step_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_lease_token,
    p_operation_key,
    p_estimated_cost_microusd,
    p_session_cap_microusd,
    p_weekly_cap_microusd,
    p_flagship_weekly_cap_microusd,
    p_is_flagship
  ) extended;
end;
$$;

revoke all on function public.extend_artifact_runtime_usage_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, text, integer, bigint
) from public;
grant execute on function public.extend_artifact_runtime_usage_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, text, integer, bigint
) to app_rls;

comment on function public.extend_artifact_runtime_usage_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, text, integer, bigint
) is
  'Extends an app''s managed usage reservation by one provider step: refuses once the caller''s spend through that app inside the window would pass the given ceiling, then applies the plan ceilings of extend_managed_usage_request_provider_step_microusd, under one per-user lock.';

create or replace function public.app_published_artifact_uses_connectors(
  p_published_artifact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.published_artifacts a
      join public.live_artifacts live
        on live.user_id = a.user_id
       and live.artifact_id::text = lower(a.artifact_id)
     where a.id = p_published_artifact_id
       and public.app_can_run_published_artifact(a.id)
  );
$$;

revoke all on function public.app_published_artifact_uses_connectors(uuid) from public;
grant execute on function public.app_published_artifact_uses_connectors(uuid) to app_rls;

comment on function public.app_published_artifact_uses_connectors(uuid) is
  'True when the caller may run this publication and its publisher bound connected apps to it. A viewer cannot read the publisher''s binding under RLS, so the answer is this one boolean.';

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. The column and its shape check exist:
-- --    select conname from pg_constraint
-- --     where conname = 'managed_usage_requests_artifact_subject_shape';      -- EXPECT: 1 row
-- -- 2. As a test user, reserve with p_artifact_max_calls = 1 twice under two
-- --    idempotency keys for the same p_artifact_subject: the second answers
-- --    'artifact_limit' / 'ARTIFACT_RUNTIME_LIMIT_REACHED'; replaying the first
-- --    key answers the first reservation again.
-- =============================================================================

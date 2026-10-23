-- =============================================================================
-- Migration 0390: each app's AI calls are attributed to it and capped per app
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
--          key is not counted again. The window and ceilings are passed in
--          from apps/web/lib/server/managed-usage-policy.ts.
--
-- Empty  : existing rows keep a null artifact_subject and count toward no app.
--
-- Depends: 0056 (managed_usage_requests), 0347 (reservation with limits)
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
    or p_artifact_max_calls is null or p_artifact_max_calls < 1
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

    if v_calls >= p_artifact_max_calls
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

-- Down for 0118: restore the plan-only rolling caps.
--
-- Restores the 12-argument signature and the unsplit window sums, i.e. every
-- deduction counts against the plan cap again regardless of how it was funded.
--
-- `overage_enabled` is dropped: leaving it would let an operator toggle a
-- setting the restored function cannot honour, which reads as a silent failure
-- rather than a removed feature.
--
-- `is_overage` tags already written onto credit_transactions metadata are left
-- in place. They are inert once the filters below stop reading them, and
-- deleting settled ledger metadata to undo a schema change would destroy the
-- only record of how past spend was funded.

begin;

drop function if exists public.reserve_managed_usage_request_with_limits(
  text, text, text, text, text, integer, text, integer, integer, integer, integer, boolean, integer
);

create or replace function public.reserve_managed_usage_request_with_limits(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_cents integer,
  p_lease_token text,
  p_lease_seconds integer,
  p_session_cap_cents integer,
  p_weekly_cap_cents integer,
  p_flagship_weekly_cap_cents integer,
  p_is_flagship boolean
)
returns table(
  reservation_decision text,
  request_status text,
  lease_token text,
  estimated_cost_cents integer,
  settlement_status text,
  error_code text
)
language plpgsql
as $function$
declare
  v_session_used integer := 0;
  v_weekly_used integer := 0;
  v_flagship_weekly_used integer := 0;
  v_request_id uuid;
  v_reservation record;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_estimated_cost_cents is null or p_estimated_cost_cents < 0
    or p_session_cap_cents is null or p_session_cap_cents < 0
    or p_weekly_cap_cents is null or p_weekly_cap_cents < 0
    or p_flagship_weekly_cap_cents is null or p_flagship_weekly_cap_cents < 0
    or p_is_flagship is null then
    raise exception using errcode = '22023', message = 'invalid managed usage limits';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  if exists (
    select 1
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
  ) then
    return query
    select legacy.*
    from public.reserve_managed_usage_request(
      p_user_id,
      p_idempotency_key,
      p_request_hash,
      p_provider,
      p_model,
      p_estimated_cost_cents,
      p_lease_token,
      p_lease_seconds
    ) legacy;
    return;
  end if;

  select
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.created_at >= now() - interval '5 hours'
    ), 0)::integer,
    coalesce(sum(transaction_row.amount_cents), 0)::integer,
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.metadata->>'is_flagship' = 'true'
    ), 0)::integer
  into v_session_used, v_weekly_used, v_flagship_weekly_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  if p_session_cap_cents > 0
    and v_session_used + p_estimated_cost_cents > p_session_cap_cents then
    return query select
      'session_limit'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_cents,
      null::text,
      'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
    return;
  end if;

  if p_weekly_cap_cents > 0
    and v_weekly_used + p_estimated_cost_cents > p_weekly_cap_cents then
    return query select
      'weekly_limit'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_cents,
      null::text,
      'ROLLING_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_cents > 0
    and v_flagship_weekly_used + p_estimated_cost_cents > p_flagship_weekly_cap_cents then
    return query select
      'flagship_weekly_limit'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_cents,
      null::text,
      'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  select legacy.* into v_reservation
  from public.reserve_managed_usage_request(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_cents,
    p_lease_token,
    p_lease_seconds
  ) legacy;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'managed usage reservation returned no result';
  end if;

  if v_reservation.reservation_decision = 'acquired' then
    update public.managed_usage_requests request_row
    set is_flagship = p_is_flagship,
        updated_at = now()
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
    returning request_row.id into v_request_id;

    update public.credit_transactions transaction_row
    set metadata = coalesce(transaction_row.metadata, '{}'::jsonb)
      || jsonb_build_object('is_flagship', p_is_flagship)
    where transaction_row.user_id = p_user_id
      and transaction_row.metadata->>'managed_usage_request_id' = v_request_id::text;
  end if;

  return query select
    v_reservation.reservation_decision::text,
    v_reservation.request_status::text,
    v_reservation.lease_token::text,
    v_reservation.estimated_cost_cents::integer,
    v_reservation.settlement_status::text,
    v_reservation.error_code::text;
end;
$function$;

alter table public.subscriptions drop column if exists overage_enabled;

-- Without this the runner still considers 0118 applied and would never re-apply
-- it after a rollback.
delete from public.schema_migrations where filename = '0118_managed_usage_overage.sql';

commit;

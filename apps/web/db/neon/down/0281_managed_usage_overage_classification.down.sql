-- Reversal of the managed-usage overage classification.
--
-- Restores the per-row labelling: the trigger inherits `is_flagship` only, the
-- reservation function tags the reservation row alone, and the request column
-- is dropped. Ledger rows written while the classification was in force keep
-- the `is_overage` key they were labelled with; the tag is metadata on a
-- settled row, so nothing is recomputed and no balance moves.

begin;

create or replace function public.label_managed_usage_transaction_flagship()
returns trigger
language plpgsql
as $$
declare
  v_is_flagship boolean;
begin
  if new.metadata ? 'managed_usage_request_id' then
    select request_row.is_flagship into v_is_flagship
    from public.managed_usage_requests request_row
    where request_row.user_id = new.user_id
      and request_row.id::text = new.metadata->>'managed_usage_request_id';

    if found then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object('is_flagship', v_is_flagship);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.label_managed_usage_transaction_flagship() from public;

drop trigger if exists label_managed_usage_transaction_classification
  on public.credit_transactions;
drop trigger if exists label_managed_usage_transaction_flagship
  on public.credit_transactions;
create trigger label_managed_usage_transaction_flagship
  before insert on public.credit_transactions
  for each row execute function public.label_managed_usage_transaction_flagship();

drop function if exists public.label_managed_usage_transaction_classification();

commit;

begin;

create or replace function public.reserve_managed_usage_request_with_limits_microusd(
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
  p_top_up_headroom_microusd bigint default 0
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
  v_session_used bigint := 0;
  v_weekly_used bigint := 0;
  v_flagship_weekly_used bigint := 0;
  v_headroom bigint := greatest(coalesce(p_top_up_headroom_microusd, 0), 0);
  v_is_overage boolean := false;
  v_request_id uuid;
  v_reservation record;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0
    or (p_session_cap_microusd is not null and p_session_cap_microusd < 0)
    or (p_weekly_cap_microusd is not null and p_weekly_cap_microusd < 0)
    or (p_flagship_weekly_cap_microusd is not null and p_flagship_weekly_cap_microusd < 0)
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
    from public.reserve_managed_usage_request_microusd(
      p_user_id,
      p_idempotency_key,
      p_request_hash,
      p_provider,
      p_model,
      p_estimated_cost_microusd,
      p_lease_token,
      p_lease_seconds
    ) legacy;
    return;
  end if;

  select
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.created_at >= now() - interval '5 hours'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint,
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint,
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.metadata->>'is_flagship' = 'true'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint
  into v_session_used, v_weekly_used, v_flagship_weekly_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  if p_session_cap_microusd is not null
    and v_session_used + p_estimated_cost_microusd > p_session_cap_microusd then
    if p_estimated_cost_microusd <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'session_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  if p_weekly_cap_microusd is not null
    and v_weekly_used + p_estimated_cost_microusd > p_weekly_cap_microusd then
    if p_estimated_cost_microusd <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'weekly_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'ROLLING_WEEKLY_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_microusd is not null
    and v_flagship_weekly_used + p_estimated_cost_microusd > p_flagship_weekly_cap_microusd then
    if p_estimated_cost_microusd <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'flagship_weekly_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  select legacy.* into v_reservation
  from public.reserve_managed_usage_request_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_microusd,
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
      || jsonb_build_object('is_flagship', p_is_flagship, 'is_overage', v_is_overage)
    where transaction_row.user_id = p_user_id
      and transaction_row.metadata->>'managed_usage_request_id' = v_request_id::text;
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

revoke all on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) from public;
grant execute on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) to app_rls;

commit;

begin;

alter table public.managed_usage_requests
  drop column if exists is_overage;

delete from public.schema_migrations
 where filename = '0281_managed_usage_overage_classification.sql';

commit;

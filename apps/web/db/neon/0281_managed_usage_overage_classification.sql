-- 0279 : an overage turn must not repay itself out of the plan's rolling window.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A managed request that would breach a rolling cap is admitted anyway when the
-- account holds purchased top-up headroom. Admission tags that reservation's
-- ledger row `is_overage`, and every rolling-window sum excludes tagged rows,
-- so the turn is paid for out of purchased credits and leaves the plan's
-- five-hour, weekly and flagship-weekly windows untouched.
--
-- Only the reservation row is tagged. The tag is written by an UPDATE over the
-- rows that already carry the request id at admission time, and the request's
-- later ledger rows -- the actual-cost delta, the release of a failed turn, the
-- recovery release of an expired lease -- are inserted afterwards and carry no
-- tag at all. `is_overage is distinct from 'true'` therefore counts every one
-- of them against the plan windows the reservation was excluded from.
--
-- The sign is what makes this serious. A reservation is an estimate, so most
-- turns settle below it and the reconciliation row is negative; a failed or
-- recovered turn releases the whole estimate. Each of those negatives is
-- subtracted from a rolling total the matching positive never entered, so an
-- account with headroom can drive its own plan usage below zero and keep
-- spending plan-included allowance after its limits should bind. Nothing about
-- it is visible in the balance: the money is right, the windows are not.
--
-- The classification belongs to the request, not to one row of it: a turn is
-- either plan usage or overage usage for its whole life. This migration stores
-- it on `managed_usage_requests` at admission and has the labelling trigger
-- inherit it onto every ledger row of that request, exactly as the trigger
-- already inherits `is_flagship`. The trigger is renamed for what it now does
-- and still sorts before `sync_credit_transactions_units`, which must stay the
-- last word on the amount columns.
--
-- Rows already written keep counting until they age out, so both backfills run
-- here: the request's classification, then the untagged ledger rows of a
-- classified request that are still young enough to be inside a window.
--
-- An extension inside an overage request inherits the tag too. That is the same
-- whole-request rule: the extension is another provider operation of a turn the
-- account is funding from purchased credits, and its admission check already
-- refused to let it through unless a plan window had room for it.
--
-- destructive: label_managed_usage_transaction_flagship is dropped. It holds no
-- rows, it is replaced in the same transaction by the labeller that inherits
-- both classifications, and its trigger is recreated under the new name before
-- the drop, so no insert between the two statements goes unlabelled. Nothing
-- outside that trigger calls it. Ledger rows written while it was in force keep
-- the metadata it stamped and are untouched.

begin;

alter table public.managed_usage_requests
  add column if not exists is_overage boolean not null default false;

comment on column public.managed_usage_requests.is_overage is
  'True when admission covered this request from purchased top-up headroom rather than the plan windows. Every ledger row of the request inherits it and is excluded from the rolling window sums.';

-- Rows written before this column existed were classified per ledger row. The
-- reservation row is the one admission tagged, so it carries the verdict for
-- the whole request and backfills it exactly.
update public.managed_usage_requests request_row
set is_overage = true
where request_row.is_overage = false
  and exists (
    select 1
    from public.credit_transactions transaction_row
    where transaction_row.user_id = request_row.user_id
      and transaction_row.metadata->>'managed_usage_request_id' = request_row.id::text
      and transaction_row.metadata->>'type' = 'managed_usage_reservation'
      and transaction_row.metadata->>'is_overage' = 'true'
  );

-- The requests are classified above; their already-written ledger rows are not.
-- An actual-cost delta, a failed-turn release or a recovery release of an
-- overage request still counts against the plan windows its reservation was
-- excluded from, so without this every affected account keeps a depressed
-- five-hour, weekly and flagship-weekly total until those rows age out.
--
-- Bounded to eight days because the longest rolling window sums the last seven
-- and the extra day is margin; a row older than that can no longer enter any
-- window sum, so rewriting it would buy nothing and cost a full-table pass.
--
-- The last predicate restricts the update to rows whose cents mirror already
-- equals microusd_to_cents_mirror(amount_microusd). sync_zz_credit_transactions
-- _units fires before update and assigns exactly that value, recomputed from an
-- amount_microusd this statement does not touch, so on every row matched here
-- the trigger writes back what is already there and no amount can move.
-- credit_transactions_owner_immutable only forbids moving user_id or
-- credit_account_id, neither of which is touched.
update public.credit_transactions transaction_row
set metadata = coalesce(transaction_row.metadata, '{}'::jsonb)
  || jsonb_build_object('is_overage', true)
from public.managed_usage_requests request_row
where request_row.is_overage
  and request_row.user_id = transaction_row.user_id
  and request_row.id::text = transaction_row.metadata->>'managed_usage_request_id'
  and transaction_row.metadata->>'is_overage' is distinct from 'true'
  and transaction_row.created_at >= now() - interval '8 days'
  and transaction_row.amount_cents
      = public.microusd_to_cents_mirror(transaction_row.amount_microusd);

commit;

begin;

create or replace function public.label_managed_usage_transaction_classification()
returns trigger
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
begin
  if new.metadata ? 'managed_usage_request_id' then
    select request_row.* into v_request
    from public.managed_usage_requests request_row
    where request_row.user_id = new.user_id
      and request_row.id::text = new.metadata->>'managed_usage_request_id';

    if found then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object(
             'is_flagship', v_request.is_flagship,
             'is_overage', v_request.is_overage
           );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.label_managed_usage_transaction_classification() from public;

drop trigger if exists label_managed_usage_transaction_flagship
  on public.credit_transactions;
drop trigger if exists label_managed_usage_transaction_classification
  on public.credit_transactions;
create trigger label_managed_usage_transaction_classification
  before insert on public.credit_transactions
  for each row execute function public.label_managed_usage_transaction_classification();

drop function if exists public.label_managed_usage_transaction_flagship();

commit;

begin;

-- Redefined for one reason: the admission verdict is persisted on the request
-- in the same statement that already stamps the reservation's ledger row, so
-- every later row of the request has something to inherit. The admission
-- arithmetic, the null/zero cap contract and the delegation are unchanged.
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
        is_overage = v_is_overage,
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

comment on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) is
  'Atomically enforces private rolling spend ceilings in microUSD, records whether purchased headroom covered the request, and delegates the durable managed usage lifecycle.';

commit;

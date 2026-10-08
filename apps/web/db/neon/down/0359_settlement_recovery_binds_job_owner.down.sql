-- Reversal of 0359 : the recovery sweep and the settlement queue go back to
-- their 0182 bodies.
--
-- WHAT THIS COSTS: recovery runs without a claim again, so every
-- outcome-unknown release and queued managed-usage retry it settles goes
-- terminal with SQLSTATE_42501 and the reserved credit stays held.

begin;

create or replace function public.recover_stale_managed_usage_requests(
  p_batch_size integer default 100
)
returns integer
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_reservation_status text;
  v_settlement record;
  v_recovered integer := 0;
begin
  for v_request in
    select request_row.*
    from public.managed_usage_requests request_row
    where request_row.status in ('reserving', 'reserved', 'provider_started')
      and request_row.lease_expires_at <= now()
    order by request_row.lease_expires_at, request_row.created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    if v_request.status = 'reserving' then
      select job.status into v_reservation_status
      from public.credit_settlement_jobs job
      where job.user_id = v_request.user_id
        and job.idempotency_key = 'managed-reserve:' || v_request.id::text;

      if v_reservation_status in ('pending', 'processing') then
        continue;
      end if;
      if v_reservation_status is null or v_reservation_status = 'terminal' then
        update public.managed_usage_requests request_row
        set status = 'outcome_unknown',
            actual_cost_microusd = 0,
            actual_cost_cents = 0,
            final_settlement_status = v_reservation_status,
            final_error_code = 'OUTCOME_UNKNOWN_BEFORE_RESERVATION',
            finalized_at = now(),
            updated_at = now()
        where request_row.id = v_request.id;
        v_recovered := v_recovered + 1;
        continue;
      end if;
    end if;

    select settlement.* into v_settlement
    from public.enqueue_credit_settlement_microusd(
      v_request.user_id,
      -v_request.estimated_cost_microusd,
      'Managed usage outcome-unknown reservation release',
      jsonb_build_object(
        'type', 'managed_usage_outcome_unknown',
        'managed_usage_request_id', v_request.id,
        'provider', v_request.provider,
        'model', v_request.model,
        'provider_started', v_request.provider_started_at is not null,
        'client_delivered', v_request.client_delivered_at is not null
      ),
      'managed-final:' || v_request.id::text
    ) settlement;

    update public.managed_usage_requests request_row
    set status = 'outcome_unknown',
        actual_cost_microusd = 0,
        actual_cost_cents = 0,
        usage = '{}'::jsonb,
        final_settlement_status = v_settlement.settlement_status,
        final_error_code = coalesce(v_settlement.error_code, 'OUTCOME_UNKNOWN'),
        finalized_at = now(),
        updated_at = now()
    where request_row.id = v_request.id;
    v_recovered := v_recovered + 1;
  end loop;

  return v_recovered;
end;
$$;

revoke all on function public.recover_stale_managed_usage_requests(integer) from public;

create or replace function public.process_credit_settlement_queue(
  p_batch_size integer default 100
)
returns table(
  job_id uuid,
  settlement_status text,
  error_code text,
  attempts integer
)
language plpgsql
as $$
declare
  v_job public.credit_settlement_jobs%rowtype;
  v_settlement record;
begin
  perform public.recover_stale_managed_usage_requests(p_batch_size);

  for v_job in
    select job.*
    from public.credit_settlement_jobs job
    where status = 'pending'
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    select settlement.* into v_settlement
    from public.enqueue_credit_settlement_microusd(
      v_job.user_id,
      v_job.amount_microusd,
      v_job.description,
      v_job.metadata,
      v_job.idempotency_key
    ) settlement;

    return query select
      v_job.id,
      v_settlement.settlement_status,
      v_settlement.error_code,
      v_settlement.attempts;
  end loop;
end;
$$;

revoke all on function public.process_credit_settlement_queue(integer) from public;

delete from public.schema_migrations
 where filename = '0359_settlement_recovery_binds_job_owner.sql';

commit;

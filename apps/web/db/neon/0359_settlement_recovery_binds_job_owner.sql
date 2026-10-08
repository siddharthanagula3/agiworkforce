-- =============================================================================
-- Migration 0359: reservation recovery settles each job as the user it belongs to
--
-- Why    : settle_managed_usage_credits_microusd refuses any caller whose
--          request.jwt.claim.sub is not the job's user (0182), and raises 42501,
--          which credit_retryable_sqlstate (0055) does not retry. The recovery
--          crons run recover_stale_managed_usage_requests and
--          process_credit_settlement_queue on the service connection, which
--          carries no claim. Every outcome-unknown release and every queued
--          managed-usage retry therefore went terminal on its first attempt
--          with SQLSTATE_42501, and the reserved credit was never returned.
--
-- Shape  : both functions keep their 0182 bodies and bind the claim to the
--          locked row's own user_id around the settlement call, then restore
--          the caller's claim, the pattern 0105 uses for video reconciliation.
--          The tenant check inside settle_managed_usage_credits_microusd is
--          untouched, so a user-initiated call still settles only its own
--          rows. Neither function is granted to app_rls. A caller that already
--          carries a claim only touches rows of that user, so binding can never
--          act for someone else.
--
-- Data   : jobs that already went terminal with SQLSTATE_42501 are not
--          reopened here; re-queueing them returns money and is decided apart.
--
-- Depends: 0055 (credit_settlement_jobs), 0056 / 0182 (both functions),
--          0037 (current_app_user_id)
-- =============================================================================

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
  v_subject text := nullif(current_setting('request.jwt.claim.sub', true), '');
begin
  for v_request in
    select request_row.*
    from public.managed_usage_requests request_row
    where request_row.status in ('reserving', 'reserved', 'provider_started')
      and request_row.lease_expires_at <= now()
      and (v_subject is null or request_row.user_id = v_subject)
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

    perform set_config('request.jwt.claim.sub', v_request.user_id, true);
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
    perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);

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
  v_subject text := nullif(current_setting('request.jwt.claim.sub', true), '');
begin
  perform public.recover_stale_managed_usage_requests(p_batch_size);

  for v_job in
    select job.*
    from public.credit_settlement_jobs job
    where status = 'pending'
      and next_attempt_at <= now()
      and (v_subject is null or job.user_id = v_subject)
    order by next_attempt_at, created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    perform set_config('request.jwt.claim.sub', v_job.user_id, true);
    select settlement.* into v_settlement
    from public.enqueue_credit_settlement_microusd(
      v_job.user_id,
      v_job.amount_microusd,
      v_job.description,
      v_job.metadata,
      v_job.idempotency_key
    ) settlement;
    perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);

    return query select
      v_job.id,
      v_settlement.settlement_status,
      v_settlement.error_code,
      v_settlement.attempts;
  end loop;
end;
$$;

revoke all on function public.process_credit_settlement_queue(integer) from public;

commit;

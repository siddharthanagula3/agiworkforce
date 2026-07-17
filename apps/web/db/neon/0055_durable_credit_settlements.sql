-- 0055 — Durable, idempotent post-response credit settlement.
--
-- Managed chat reserves estimated credits before provider execution. Actual
-- usage is known only after the provider response finishes, so the final
-- reservation delta must survive a process crash or transient database error.
-- This queue is owned by the canonical Neon billing ledger and calls the
-- existing deduct_credits() function; it does not create a second ledger.

create table if not exists public.credit_settlement_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  idempotency_key text not null,
  amount_cents integer not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status = any (array['pending', 'processing', 'succeeded', 'terminal'])),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  last_error text,
  result jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (length(idempotency_key) between 1 and 255)
);

-- Queue workers only scan due pending rows. Completed history does not bloat
-- this index, and equality precedes the range column.
create index if not exists idx_credit_settlement_jobs_pending
  on public.credit_settlement_jobs (next_attempt_at, created_at)
  where status = 'pending';

create index if not exists idx_credit_settlement_jobs_user
  on public.credit_settlement_jobs (user_id, created_at desc);

alter table public.credit_settlement_jobs enable row level security;
alter table public.credit_settlement_jobs force row level security;

drop policy if exists credit_settlement_jobs_user_isolation
  on public.credit_settlement_jobs;
create policy credit_settlement_jobs_user_isolation
  on public.credit_settlement_jobs
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

revoke all on public.credit_settlement_jobs from public;
grant select, insert, update on public.credit_settlement_jobs to app_rls;

-- Only transport, concurrency, and temporary resource failures are retryable.
-- Invalid payload/schema errors and deduct_credits() business decisions are
-- terminal; repeatedly retrying them can never make the charge valid.
create or replace function public.credit_retryable_sqlstate(p_sqlstate text)
returns boolean
language sql
immutable
as $$
  select
    p_sqlstate like '08%'              -- connection exception
    or p_sqlstate in ('40001', '40P01') -- serialization failure / deadlock
    or p_sqlstate like '53%'            -- insufficient resources
    or p_sqlstate in (
      '55P03', -- lock not available
      '57014', -- query cancelled / timeout
      '57P01', -- admin shutdown
      '57P02', -- crash shutdown
      '57P03'  -- cannot connect now
    );
$$;

revoke all on function public.credit_retryable_sqlstate(text) from public;
grant execute on function public.credit_retryable_sqlstate(text) to app_rls;

create or replace function public.enqueue_credit_settlement(
  p_user_id text,
  p_amount_cents integer,
  p_description text,
  p_metadata jsonb,
  p_idempotency_key text
)
returns table(
  settlement_status text,
  deduction_success boolean,
  remaining_cents integer,
  error_code text,
  error_message text,
  attempts integer
)
language plpgsql
as $$
declare
  v_job public.credit_settlement_jobs%rowtype;
  v_deduction record;
  v_attempt integer;
  v_sqlstate text;
  v_message text;
  v_retryable boolean;
  v_terminal_code text;
  v_result jsonb;
begin
  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;
  if p_idempotency_key is null
    or length(p_idempotency_key) < 1
    or length(p_idempotency_key) > 255 then
    raise exception using errcode = '22023', message = 'valid idempotency_key is required';
  end if;

  insert into public.credit_settlement_jobs (
    user_id,
    idempotency_key,
    amount_cents,
    description,
    metadata
  ) values (
    p_user_id,
    p_idempotency_key,
    p_amount_cents,
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key) do nothing;

  select job.* into v_job
  from public.credit_settlement_jobs job
  where job.user_id = p_user_id
    and job.idempotency_key = p_idempotency_key
  for update;

  -- An idempotency key identifies one immutable financial operation. Never
  -- mutate an existing job into a different charge.
  if v_job.amount_cents is distinct from p_amount_cents
    or v_job.description is distinct from p_description
    or v_job.metadata is distinct from coalesce(p_metadata, '{}'::jsonb) then
    return query select
      'terminal'::text,
      false,
      null::integer,
      'IDEMPOTENCY_CONFLICT'::text,
      'idempotency key was reused with a different settlement payload'::text,
      v_job.attempt_count;
    return;
  end if;

  if v_job.status in ('succeeded', 'terminal') then
    return query select
      v_job.status,
      coalesce((v_job.result->>'success')::boolean, false),
      (v_job.result->>'remaining_cents')::integer,
      coalesce(v_job.result->>'code', v_job.last_error_code),
      coalesce(v_job.result->>'error', v_job.last_error),
      v_job.attempt_count;
    return;
  end if;

  if v_job.attempt_count >= 12 then
    update public.credit_settlement_jobs job
    set status = 'terminal',
        last_error_code = 'RETRY_EXHAUSTED',
        last_error = 'credit settlement retry budget exhausted',
        completed_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query select
      'terminal'::text,
      false,
      null::integer,
      'RETRY_EXHAUSTED'::text,
      'credit settlement retry budget exhausted'::text,
      v_job.attempt_count;
    return;
  end if;

  update public.credit_settlement_jobs job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      last_error_code = null,
      last_error = null,
      updated_at = now()
  where job.id = v_job.id
  returning job.attempt_count into v_attempt;

  begin
    select deduction.* into v_deduction
    from public.deduct_credits(
      p_user_id,
      p_amount_cents,
      p_description,
      coalesce(p_metadata, '{}'::jsonb),
      p_idempotency_key
    ) deduction;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'deduct_credits returned no result';
    end if;

    v_result := jsonb_build_object(
      'success', v_deduction.success,
      'remaining_cents', v_deduction.remaining_cents,
      'error', v_deduction.error,
      'code', v_deduction.code,
      'daily_limit', v_deduction.daily_limit,
      'daily_used', v_deduction.daily_used,
      'daily_remaining', v_deduction.daily_remaining,
      'reset_in_hours', v_deduction.reset_in_hours
    );

    if v_deduction.success then
      update public.credit_settlement_jobs job
      set status = 'succeeded',
          result = v_result,
          completed_at = now(),
          next_attempt_at = now(),
          updated_at = now()
      where job.id = v_job.id;

      return query select
        'succeeded'::text,
        true,
        v_deduction.remaining_cents,
        null::text,
        null::text,
        v_attempt;
      return;
    end if;

    -- deduct_credits returned a business decision, equivalent to a terminal
    -- 4xx. Retrying cannot create credits or change plan limits.
    update public.credit_settlement_jobs job
    set status = 'terminal',
        result = v_result,
        last_error_code = coalesce(v_deduction.code, 'DEDUCTION_REJECTED'),
        last_error = coalesce(v_deduction.error, 'credit deduction rejected'),
        completed_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query select
      'terminal'::text,
      false,
      v_deduction.remaining_cents,
      coalesce(v_deduction.code, 'DEDUCTION_REJECTED'),
      coalesce(v_deduction.error, 'credit deduction rejected'),
      v_attempt;
    return;
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text;
    v_retryable := public.credit_retryable_sqlstate(v_sqlstate);

    if v_retryable and v_attempt < 12 then
      update public.credit_settlement_jobs job
      set status = 'pending',
          next_attempt_at = now()
            + least(
                interval '1 hour',
                interval '5 seconds'
                  * power(2::double precision, least(v_attempt - 1, 10)::double precision)
              ),
          last_error_code = v_sqlstate,
          last_error = v_message,
          updated_at = now()
      where job.id = v_job.id;

      return query select
        'pending'::text,
        false,
        null::integer,
        v_sqlstate,
        v_message,
        v_attempt;
      return;
    end if;

    v_terminal_code := case
      when v_retryable then 'RETRY_EXHAUSTED'
      else 'SQLSTATE_' || coalesce(v_sqlstate, 'UNKNOWN')
    end;

    update public.credit_settlement_jobs job
    set status = 'terminal',
        last_error_code = v_terminal_code,
        last_error = v_message,
        completed_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query select
      'terminal'::text,
      false,
      null::integer,
      v_terminal_code,
      v_message,
      v_attempt;
    return;
  end;
end;
$$;

revoke all on function public.enqueue_credit_settlement(text, integer, text, jsonb, text)
  from public;
grant execute on function public.enqueue_credit_settlement(text, integer, text, jsonb, text)
  to app_rls;

-- Cron/worker recovery. SKIP LOCKED permits overlapping invocations without
-- processing the same settlement twice or blocking another worker.
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
    from public.enqueue_credit_settlement(
      v_job.user_id,
      v_job.amount_cents,
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

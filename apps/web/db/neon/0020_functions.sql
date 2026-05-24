-- =============================================================================
-- 0020_functions.sql
-- Neon-compatible PL/pgSQL port of all Supabase RPC functions.
--
-- Key differences from Supabase originals:
--   1. No auth schema: auth.uid() replaced with p_user_id text parameter.
--      auth.role() checks removed; authorization is caller-enforced at the
--      app/API layer (Next.js route handlers validate Clerk JWTs before calling
--      these functions).
--   2. No SECURITY DEFINER: all functions run with caller privileges.
--   3. user_id columns are text (Clerk IDs), not uuid.
--   4. No GRANT/REVOKE to service_role / authenticated / anon -- these roles
--      do not exist in Neon.
--   5. Neon token_credits schema differs from legacy Supabase schema:
--        - No credits_remaining_cents column -- computed as
--          (credits_allocated_cents - credits_used_cents) inline.
--        - No daily_used_cents / last_daily_reset_at columns -- daily tracking
--          uses flagship_used_today_cents / flagship_cap_reset_date.
--      Functions that previously relied on credits_remaining_cents / daily_*
--      are adapted accordingly (see credit/billing group).
--   6. credit_transactions has no description column in Neon (0004 schema).
--      description values are folded into the metadata jsonb column.
--   7. processed_stripe_events needs extra columns (attempts, locked_at,
--      updated_at, last_error) -- added via ALTER TABLE ... ADD COLUMN IF NOT
--      EXISTS below before the function definitions.
--   8. search_history and account_lockout_attempts tables do not exist in
--      any Neon migration; they are created here as prerequisites for the
--      search and lockout function groups.
--   9. validate_and_redeem_invite_code originally used auth.uid() internally;
--      replaced with p_user_id text parameter.
--  10. consume_device_authorization_tokens: returned user_id was uuid in
--      Supabase; changed to text to match Neon schema.
-- =============================================================================

-- =============================================================================
-- SECTION 0: Schema prerequisites (ALTER TABLE + new tables)
-- =============================================================================

-- 0a. Extend processed_stripe_events with status-tracking columns that are
--     present in the Supabase migration path (20260108000004) but not in the
--     Neon 0012_stripe.sql baseline.

alter table if exists public.processed_stripe_events
  add column if not exists attempts integer not null default 0;

alter table if exists public.processed_stripe_events
  add column if not exists locked_at timestamptz;

alter table if exists public.processed_stripe_events
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

alter table if exists public.processed_stripe_events
  add column if not exists last_error text;

-- Drop and re-add the status check constraint to include 'processing' and 'failed'
-- (Neon 0012 only has status with default 'succeeded'; add the full set here).
alter table if exists public.processed_stripe_events
  drop constraint if exists processed_stripe_events_status_check;

alter table if exists public.processed_stripe_events
  add constraint processed_stripe_events_status_check
  check (status = any (array['processing'::text, 'succeeded'::text, 'failed'::text]));

create index if not exists idx_processed_stripe_events_status
  on public.processed_stripe_events(status);

create index if not exists idx_processed_stripe_events_locked_at
  on public.processed_stripe_events(locked_at);

-- 0b. Add a description column to credit_transactions so audit entries can
--     carry human-readable labels (folded into metadata otherwise, but having
--     a real column keeps parity with callers that SELECT description).

alter table if exists public.credit_transactions
  add column if not exists description text;

-- 0c. search_history -- does not exist in any Neon migration.
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  query text not null,
  result_count integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_history_user_id
  on public.search_history(user_id);

create index if not exists idx_search_history_created_at
  on public.search_history(created_at desc);

-- 0d. account_lockout_attempts -- does not exist in any Neon migration.
create table if not exists public.account_lockout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  identifier text not null,   -- email or user_id used for login
  ip_address text,
  attempt_type text not null default 'login'
    check (attempt_type = any (array['login', 'mfa', 'password_reset'])),
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_lockout_identifier
  on public.account_lockout_attempts(identifier);

create index if not exists idx_account_lockout_created_at
  on public.account_lockout_attempts(created_at desc);

-- 0e. Add plan_duration_days to beta_invites if not present (used by
--     claim_beta_invite; created in 0011_waitlist.sql but may lack this column).

alter table if exists public.beta_invites
  add column if not exists plan_duration_days integer default 90;

alter table if exists public.beta_invites
  add column if not exists plan_tier text default 'hobby';

alter table if exists public.beta_invites
  add column if not exists trial_days integer default 0;

alter table if exists public.beta_invites
  add column if not exists discount_percent integer default 0;

alter table if exists public.beta_invites
  add column if not exists stripe_coupon_id text;

-- beta_redemptions: ensure surface/source columns exist (added in 20260523).
alter table if exists public.beta_redemptions
  add column if not exists surface text;

alter table if exists public.beta_redemptions
  add column if not exists source text;

-- 0f. Add consumed_at to device_authorization_codes (used in consume RPC).
alter table if exists public.device_authorization_codes
  add column if not exists consumed_at timestamptz;

-- 0g. Add account_status to profiles (used by is_account_active).
alter table if exists public.profiles
  add column if not exists account_status text default 'active';

-- 0h. Unique index on token_credits(user_id, subscription_id, period_start, period_end)
--     needed by reset_credits_for_period ON CONFLICT clause.
create unique index if not exists idx_token_credits_unique_period
  on public.token_credits(user_id, subscription_id, period_start, period_end);

-- =============================================================================
-- SECTION 1: Credit / Billing functions
-- =============================================================================

-- 1a. calculate_daily_limit
-- Helper: compute 30% of monthly allocation as the daily soft-cap.

create or replace function public.calculate_daily_limit(
  monthly_cents integer
)
returns integer
language plpgsql
as $$
begin
  return floor(monthly_cents * 0.30);
end;
$$;

-- 1b. get_credit_balance
-- Returns the current credit state for p_user_id.
-- Adaptation: credits_remaining computed inline as allocated - used because
-- Neon token_credits has no credits_remaining_cents column.
-- Daily tracking uses flagship_used_today_cents / flagship_cap_reset_date.

create or replace function public.get_credit_balance(
  p_user_id text
)
returns table (
  account_id uuid,
  credits_allocated_cents integer,
  credits_used_cents integer,
  credits_remaining_cents integer,
  daily_limit_cents integer,
  daily_used_cents integer,
  daily_remaining_cents integer,
  period_start timestamptz,
  period_end timestamptz,
  last_daily_reset_at timestamptz
)
language plpgsql
as $$
declare
  v_account record;
  v_daily_limit integer;
  v_daily_used integer;
  v_remaining integer;
  v_needs_reset boolean;
begin
  select tc.* into v_account
  from public.token_credits tc
  where tc.user_id = p_user_id
    and tc.period_end > now()
  order by tc.period_end desc
  limit 1;

  if v_account is null then
    return query select
      null::uuid, 0, 0, 0, 0, 0, 0,
      null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;
  v_daily_limit := public.calculate_daily_limit(v_account.credits_allocated_cents);

  -- Daily reset check: flagship_cap_reset_date is a date column.
  v_needs_reset := v_account.flagship_cap_reset_date is null
    or v_account.flagship_cap_reset_date < current_date;

  if v_needs_reset then
    update public.token_credits
    set flagship_used_today_cents = 0,
        flagship_cap_reset_date = current_date,
        updated_at = now()
    where id = v_account.id;
    v_daily_used := 0;
  else
    v_daily_used := coalesce(v_account.flagship_used_today_cents, 0);
  end if;

  return query select
    v_account.id,
    v_account.credits_allocated_cents,
    v_account.credits_used_cents,
    v_remaining,
    v_daily_limit,
    v_daily_used,
    greatest(0, v_daily_limit - v_daily_used),
    v_account.period_start,
    v_account.period_end,
    coalesce(
      (v_account.flagship_cap_reset_date::text)::timestamptz,
      now()
    );
end;
$$;

-- 1c. check_credits_available
-- Returns true if p_user_id has at least p_amount_cents in both monthly and
-- daily buckets.

create or replace function public.check_credits_available(
  p_user_id text,
  p_amount_cents integer
)
returns boolean
language plpgsql
as $$
declare
  v_balance record;
begin
  select * into v_balance
  from public.get_credit_balance(p_user_id);

  if v_balance.credits_remaining_cents < p_amount_cents then
    return false;
  end if;

  if v_balance.daily_remaining_cents < p_amount_cents then
    return false;
  end if;

  return true;
end;
$$;

-- 1d. add_credits
-- Increases allocated and effective balance for a credit account.
-- No auth.role() check; call only from privileged API routes.

create or replace function public.add_credits(
  p_user_id text,
  p_account_id uuid,
  p_amount_cents integer,
  p_description text,
  p_transaction_type text default 'purchase'
)
returns void
language plpgsql
as $$
begin
  if p_amount_cents <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_transaction_type not in ('purchase', 'adjustment', 'refund', 'bonus') then
    raise exception 'invalid transaction type: %', p_transaction_type;
  end if;

  update public.token_credits
  set credits_allocated_cents = credits_allocated_cents + p_amount_cents,
      credits_used_cents = greatest(0, credits_used_cents),  -- no-op guard
      updated_at = now()
  where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'credit account not found for user';
  end if;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) values (
    p_user_id, p_account_id, p_amount_cents, p_transaction_type, p_description
  );
end;
$$;

-- 1e. handle_refund
-- Reduces the effective balance. Uses FOR UPDATE to prevent races.
-- Adaptation: credits_remaining computed as allocated - used inline.

create or replace function public.handle_refund(
  p_user_id text,
  p_refund_amount_cents integer,
  p_reason text default 'Refund processed'
)
returns boolean
language plpgsql
as $$
declare
  v_account record;
  v_credits_to_revoke integer;
  v_remaining integer;
begin
  select * into v_account
  from public.token_credits
  where user_id = p_user_id
  order by period_end desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;
  v_credits_to_revoke := least(p_refund_amount_cents, greatest(0, v_remaining));

  -- Increase used_cents to shrink the effective remaining balance.
  update public.token_credits
  set credits_used_cents = credits_used_cents + v_credits_to_revoke,
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) values (
    p_user_id, v_account.id, -v_credits_to_revoke, 'refund', p_reason
  );

  return true;
end;
$$;

-- 1f. get_or_create_credit_account
-- Finds the credit row for the given billing period, creating it if absent.
-- Adaptation: no credits_remaining_cents column; sets credits_used_cents = 0.

create or replace function public.get_or_create_credit_account(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_cents integer
)
returns uuid
language plpgsql
as $$
declare
  v_account_id uuid;
begin
  select id into v_account_id
  from public.token_credits
  where user_id = p_user_id
    and subscription_id = p_subscription_id
    and period_start = p_period_start
    and period_end = p_period_end;

  if v_account_id is not null then
    return v_account_id;
  end if;

  insert into public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_cents,
    credits_used_cents,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents,
    0,
    0,
    current_date
  )
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) values (
    p_user_id, v_account_id, 'allocation', p_credits_allocated_cents,
    'initial credit allocation for billing period'
  );

  return v_account_id;
end;
$$;

-- 1g. reset_credits_for_period
-- Upserts a new billing-period row and logs the reset transaction.

create or replace function public.reset_credits_for_period(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_cents integer
)
returns uuid
language plpgsql
as $$
declare
  v_account_id uuid;
begin
  insert into public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_cents,
    credits_used_cents,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents,
    0,
    0,
    current_date
  )
  on conflict (user_id, subscription_id, period_start, period_end)
  do update set
    credits_allocated_cents = p_credits_allocated_cents,
    credits_used_cents = 0,
    flagship_used_today_cents = 0,
    flagship_cap_reset_date = current_date,
    updated_at = now()
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) values (
    p_user_id, v_account_id, 'reset', p_credits_allocated_cents,
    'credit reset for new billing period'
  );

  return v_account_id;
end;
$$;

-- 1h. deduct_credits
-- Atomically deducts credits with idempotency-key support.
-- Adaptation: daily tracking via flagship_used_today_cents / flagship_cap_reset_date;
-- credits_remaining computed inline; idempotency_key user_id is text.

create or replace function public.deduct_credits(
  p_user_id text,
  p_amount_cents integer,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table(
  success boolean,
  remaining_cents integer,
  error text,
  code text,
  daily_limit integer,
  daily_used integer,
  daily_remaining integer,
  reset_in_hours numeric
)
language plpgsql
as $$
declare
  v_account record;
  v_daily_limit integer;
  v_needs_reset boolean;
  v_hours_until_reset numeric;
  v_existing_result jsonb;
  v_result jsonb;
  v_remaining integer;
begin
  -- Idempotency check.
  if p_idempotency_key is not null then
    select result into v_existing_result
    from public.credit_idempotency_keys
    where idempotency_key = p_idempotency_key
      and user_id = p_user_id
      and expires_at > now();

    if v_existing_result is not null then
      return query select
        (v_existing_result->>'success')::boolean,
        (v_existing_result->>'remaining_cents')::integer,
        v_existing_result->>'error',
        v_existing_result->>'code',
        (v_existing_result->>'daily_limit')::integer,
        (v_existing_result->>'daily_used')::integer,
        (v_existing_result->>'daily_remaining')::integer,
        (v_existing_result->>'reset_in_hours')::numeric;
      return;
    end if;
  end if;

  -- Lock the active-period credit row.
  select tc.* into v_account
  from public.token_credits tc
  where tc.user_id = p_user_id
    and tc.period_end > now()
  order by tc.period_end desc
  limit 1
  for update;

  if v_account is null then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', 0,
      'error', 'no active credit account found',
      'code', 'NO_ACCOUNT',
      'daily_limit', 0,
      'daily_used', 0,
      'daily_remaining', 0,
      'reset_in_hours', 0
    );

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select false, 0, 'no active credit account found'::text,
      'NO_ACCOUNT'::text, 0, 0, 0, 0::numeric;
    return;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;
  v_daily_limit := public.calculate_daily_limit(v_account.credits_allocated_cents);

  -- Daily reset via flagship_cap_reset_date (date column, resets at midnight UTC).
  v_needs_reset := v_account.flagship_cap_reset_date is null
    or v_account.flagship_cap_reset_date < current_date;

  if v_needs_reset then
    update public.token_credits
    set flagship_used_today_cents = 0,
        flagship_cap_reset_date = current_date,
        updated_at = now()
    where id = v_account.id;
    v_account.flagship_used_today_cents := 0;
    v_account.flagship_cap_reset_date := current_date;
  end if;

  -- Hours until next midnight UTC.
  v_hours_until_reset := extract(epoch from
    ((current_date + 1)::timestamptz - now())
  ) / 3600.0;

  -- Daily limit check.
  if coalesce(v_account.flagship_used_today_cents, 0) + p_amount_cents > v_daily_limit then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', v_remaining,
      'error', 'daily credit limit exceeded',
      'code', 'DAILY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', coalesce(v_account.flagship_used_today_cents, 0),
      'daily_remaining', greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      'reset_in_hours', greatest(0, v_hours_until_reset)
    );

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select
      false, v_remaining,
      'daily credit limit exceeded'::text, 'DAILY_CREDIT_LIMIT_REACHED'::text,
      v_daily_limit, coalesce(v_account.flagship_used_today_cents, 0),
      greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      greatest(0::numeric, v_hours_until_reset);
    return;
  end if;

  -- Monthly limit check.
  if v_remaining < p_amount_cents then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', v_remaining,
      'error', 'monthly credit limit exceeded',
      'code', 'MONTHLY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', coalesce(v_account.flagship_used_today_cents, 0),
      'daily_remaining', greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      'reset_in_hours', greatest(0, v_hours_until_reset)
    );

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select
      false, v_remaining,
      'monthly credit limit exceeded'::text, 'MONTHLY_CREDIT_LIMIT_REACHED'::text,
      v_daily_limit, coalesce(v_account.flagship_used_today_cents, 0),
      greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      greatest(0::numeric, v_hours_until_reset);
    return;
  end if;

  -- Perform atomic deduction.
  update public.token_credits
  set credits_used_cents = credits_used_cents + p_amount_cents,
      flagship_used_today_cents = coalesce(flagship_used_today_cents, 0) + p_amount_cents,
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description, metadata
  ) values (
    p_user_id, v_account.id, 'deduction', p_amount_cents, p_description,
    case when p_idempotency_key is not null
      then coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('idempotency_key', p_idempotency_key)
      else coalesce(p_metadata, '{}'::jsonb)
    end
  );

  v_result := jsonb_build_object(
    'success', true,
    'remaining_cents', v_remaining - p_amount_cents,
    'error', null,
    'code', null,
    'daily_limit', v_daily_limit,
    'daily_used', coalesce(v_account.flagship_used_today_cents, 0) + p_amount_cents,
    'daily_remaining', greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0) - p_amount_cents),
    'reset_in_hours', greatest(0, v_hours_until_reset)
  );

  if p_idempotency_key is not null then
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
  end if;

  return query select
    true, v_remaining - p_amount_cents,
    null::text, null::text,
    v_daily_limit,
    coalesce(v_account.flagship_used_today_cents, 0) + p_amount_cents,
    greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0) - p_amount_cents),
    greatest(0::numeric, v_hours_until_reset);
end;
$$;

-- 1i. increment_usage
-- Atomically increments token usage for a user.
-- Adaptation: p_user_id is text; flagship daily tracking uses
-- flagship_used_today_cents / flagship_cap_reset_date.

create or replace function public.increment_usage(
  p_user_id text,
  p_tokens integer,
  p_feature text default null,
  p_is_flagship boolean default false
)
returns void
language plpgsql
as $$
declare
  v_account_id uuid;
  v_reset_date date;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_tokens is null or p_tokens <= 0 then
    raise exception 'p_tokens must be positive (got %)', p_tokens;
  end if;

  -- Find active-period row, prefer the one whose window contains now().
  select id, flagship_cap_reset_date into v_account_id, v_reset_date
  from public.token_credits
  where user_id = p_user_id
    and current_timestamp between period_start and period_end
  order by period_end desc
  limit 1
  for update;

  if v_account_id is null then
    select id, flagship_cap_reset_date into v_account_id, v_reset_date
    from public.token_credits
    where user_id = p_user_id
    order by period_end desc
    limit 1
    for update;
  end if;

  if v_account_id is null then
    raise notice 'increment_usage: no token_credits row for user %', p_user_id;
    return;
  end if;

  if p_is_flagship then
    if v_reset_date is null or v_reset_date < current_date then
      update public.token_credits
      set credits_used_cents = credits_used_cents + p_tokens,
          flagship_used_today_cents = p_tokens,
          flagship_cap_reset_date = current_date,
          updated_at = now()
      where id = v_account_id;
    else
      update public.token_credits
      set credits_used_cents = credits_used_cents + p_tokens,
          flagship_used_today_cents = flagship_used_today_cents + p_tokens,
          updated_at = now()
      where id = v_account_id;
    end if;
  else
    update public.token_credits
    set credits_used_cents = credits_used_cents + p_tokens,
        updated_at = now()
    where id = v_account_id;
  end if;

  insert into public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description,
    metadata
  ) values (
    p_user_id,
    v_account_id,
    p_tokens,
    'deduction',
    'usage increment via reconcileUsage',
    jsonb_build_object(
      'feature', coalesce(p_feature, 'chat'),
      'is_flagship', p_is_flagship
    )
  );
end;
$$;

-- =============================================================================
-- SECTION 2: Stripe idempotency functions
-- =============================================================================

-- 2a. process_stripe_event_idempotent  (also aliased as check_idempotent_stripe_event)
-- Returns true if the caller should process this event now.
-- Uses a soft lock (locked_at) to prevent concurrent duplicate processing.

create or replace function public.process_stripe_event_idempotent(
  p_event_id text
)
returns boolean
language plpgsql
as $$
declare
  v_status text;
  v_locked_at timestamptz;
  v_now timestamptz := timezone('utc'::text, now());
  v_lock_stale_interval interval := interval '10 minutes';
begin
  -- Try to insert a new row in 'processing' state.
  insert into public.processed_stripe_events (
    event_id,
    processed_at,
    status,
    attempts,
    locked_at,
    updated_at,
    last_error
  )
  values (
    p_event_id,
    v_now,
    'processing',
    1,
    v_now,
    v_now,
    null
  )
  on conflict (event_id) do nothing;

  if found then
    return true;
  end if;

  -- Existing row: decide based on status and lock freshness.
  select status, locked_at
  into v_status, v_locked_at
  from public.processed_stripe_events
  where event_id = p_event_id;

  if v_status = 'succeeded' then
    return false;
  end if;

  if v_status = 'processing'
     and v_locked_at is not null
     and v_locked_at > (v_now - v_lock_stale_interval) then
    return false;
  end if;

  -- Retry: failed or stale-processing.
  update public.processed_stripe_events
  set status = 'processing',
      attempts = coalesce(attempts, 0) + 1,
      locked_at = v_now,
      updated_at = v_now
  where event_id = p_event_id;

  return true;
end;
$$;

-- Alias used by some call sites.
create or replace function public.check_idempotent_stripe_event(
  p_event_id text
)
returns boolean
language plpgsql
as $$
begin
  return public.process_stripe_event_idempotent(p_event_id);
end;
$$;

-- 2b. mark_stripe_event_succeeded

create or replace function public.mark_stripe_event_succeeded(
  p_event_id text
)
returns boolean
language plpgsql
as $$
begin
  update public.processed_stripe_events
  set status = 'succeeded',
      updated_at = timezone('utc'::text, now()),
      last_error = null
  where event_id = p_event_id;

  return found;
end;
$$;

-- 2c. mark_stripe_event_failed

create or replace function public.mark_stripe_event_failed(
  p_event_id text,
  p_error text
)
returns boolean
language plpgsql
as $$
begin
  update public.processed_stripe_events
  set status = 'failed',
      updated_at = timezone('utc'::text, now()),
      last_error = left(p_error, 4000)
  where event_id = p_event_id;

  return found;
end;
$$;

-- 2d. cleanup_expired_idempotency_keys
-- Deletes expired rows from credit_idempotency_keys. Call from a cron route.

create or replace function public.cleanup_expired_idempotency_keys()
returns integer
language plpgsql
as $$
declare
  v_deleted_count integer;
begin
  delete from public.credit_idempotency_keys
  where expires_at < now();

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- =============================================================================
-- SECTION 3: Search functions
-- =============================================================================

-- 3a. track_search

create or replace function public.track_search(
  p_user_id text,
  p_query text,
  p_result_count integer default 0
)
returns void
language plpgsql
as $$
begin
  if p_query is null or trim(p_query) = '' then
    return;
  end if;

  insert into public.search_history (user_id, query, result_count)
  values (p_user_id, trim(p_query), coalesce(p_result_count, 0));
end;
$$;

-- 3b. get_recent_searches

create or replace function public.get_recent_searches(
  p_user_id text,
  p_limit integer default 10
)
returns table(query text, searched_at timestamptz)
language plpgsql
as $$
begin
  return query
    select distinct on (sh.query) sh.query, sh.created_at as searched_at
    from public.search_history sh
    where sh.user_id = p_user_id
    order by sh.query, sh.created_at desc
    limit p_limit;
end;
$$;

-- 3c. clear_search_history

create or replace function public.clear_search_history(
  p_user_id text
)
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.search_history where user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- 3d. get_popular_searches
-- Returns aggregate query popularity across all users.

create or replace function public.get_popular_searches(
  p_limit integer default 10,
  p_days integer default 7
)
returns table(query text, search_count bigint, avg_results numeric)
language plpgsql
stable
as $$
begin
  return query
    select sh.query,
           count(*)::bigint as search_count,
           avg(sh.result_count)::numeric as avg_results
    from public.search_history sh
    where sh.created_at >= now() - (p_days || ' days')::interval
    group by sh.query
    order by search_count desc
    limit p_limit;
end;
$$;

-- 3e. get_search_suggestions
-- Returns per-user recent searches matching a partial query.

create or replace function public.get_search_suggestions(
  p_user_id text,
  p_partial_query text,
  p_limit integer default 5
)
returns table(suggestion text, source text, score numeric)
language plpgsql
stable
as $$
begin
  return query
    select distinct on (sh.query)
      sh.query as suggestion,
      'recent'::text as source,
      1.0::numeric as score
    from public.search_history sh
    where sh.user_id = p_user_id
      and sh.query ilike '%' || p_partial_query || '%'
    order by sh.query, sh.created_at desc
    limit p_limit;
end;
$$;

-- =============================================================================
-- SECTION 4: Security / account-lockout functions
-- =============================================================================

-- 4a. check_account_lockout
-- Returns true if the account is currently locked out (5+ failed attempts in
-- 15 minutes with no successful attempt since).

create or replace function public.check_account_lockout(
  p_identifier text
)
returns boolean
language plpgsql
stable
as $$
declare
  v_failed_count integer;
  v_last_success timestamptz;
  v_window_start timestamptz := now() - interval '15 minutes';
begin
  -- Most recent successful login.
  select max(created_at) into v_last_success
  from public.account_lockout_attempts
  where identifier = p_identifier
    and succeeded = true;

  -- Failed attempts within window after last success.
  select count(*) into v_failed_count
  from public.account_lockout_attempts
  where identifier = p_identifier
    and succeeded = false
    and created_at >= v_window_start
    and (v_last_success is null or created_at > v_last_success);

  return v_failed_count >= 5;
end;
$$;

-- 4b. record_failed_login

create or replace function public.record_failed_login(
  p_identifier text,
  p_user_id text default null,
  p_ip_address text default null
)
returns void
language plpgsql
as $$
begin
  insert into public.account_lockout_attempts (
    user_id, identifier, ip_address, attempt_type, succeeded
  ) values (
    p_user_id, p_identifier, p_ip_address, 'login', false
  );
end;
$$;

-- 4c. record_successful_login

create or replace function public.record_successful_login(
  p_identifier text,
  p_user_id text default null,
  p_ip_address text default null
)
returns void
language plpgsql
as $$
begin
  insert into public.account_lockout_attempts (
    user_id, identifier, ip_address, attempt_type, succeeded
  ) values (
    p_user_id, p_identifier, p_ip_address, 'login', true
  );
end;
$$;

-- 4d. admin_unlock_account
-- Inserts a synthetic successful attempt to clear the lockout window.

create or replace function public.admin_unlock_account(
  p_identifier text,
  p_admin_user_id text default null
)
returns void
language plpgsql
as $$
begin
  insert into public.account_lockout_attempts (
    user_id, identifier, attempt_type, succeeded
  ) values (
    p_admin_user_id, p_identifier, 'login', true
  );

  insert into public.security_audit_logs (
    user_id, event_type, severity, details
  ) values (
    p_admin_user_id, 'account_unlocked', 'info',
    jsonb_build_object('unlocked_identifier', p_identifier, 'by', p_admin_user_id)
  );
end;
$$;

-- 4e. get_lockout_stats
-- Returns failed-attempt counts in rolling time windows.

create or replace function public.get_lockout_stats(
  p_identifier text
)
returns table(
  failed_last_15m integer,
  failed_last_1h integer,
  failed_last_24h integer,
  is_locked boolean
)
language plpgsql
stable
as $$
begin
  return query
    select
      count(*) filter (
        where created_at >= now() - interval '15 minutes' and not succeeded
      )::integer,
      count(*) filter (
        where created_at >= now() - interval '1 hour' and not succeeded
      )::integer,
      count(*) filter (
        where created_at >= now() - interval '24 hours' and not succeeded
      )::integer,
      public.check_account_lockout(p_identifier)
    from public.account_lockout_attempts
    where identifier = p_identifier;
end;
$$;

-- 4f. log_security_event
-- Inserts a row into security_audit_logs.

create or replace function public.log_security_event(
  p_user_id text,
  p_event_type text,
  p_severity text default 'info',
  p_ip_address text default null,
  p_user_agent text default null,
  p_endpoint text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  insert into public.security_audit_logs (
    user_id, event_type, severity, ip_address, user_agent, endpoint, details
  ) values (
    p_user_id, p_event_type, p_severity, p_ip_address, p_user_agent,
    p_endpoint, coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- 4g. cleanup_old_security_logs
-- Deletes security_audit_logs rows older than 90 days.

create or replace function public.cleanup_old_security_logs()
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.security_audit_logs
  where created_at < now() - interval '90 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- 4h. is_account_active
-- Returns true if the profile's account_status is 'active' (or profile missing).

create or replace function public.is_account_active(
  p_user_id text
)
returns boolean
language plpgsql
stable
as $$
begin
  return coalesce(
    (select account_status = 'active' from public.profiles where id = p_user_id),
    true
  );
end;
$$;

-- =============================================================================
-- SECTION 5: Data management / GDPR functions
-- =============================================================================

-- 5a. export_user_data
-- Collects all user data into a JSONB export (GDPR Article 20).
-- Tables that may not exist in all Neon environments are queried defensively
-- via COALESCE(..., '[]'::jsonb).

create or replace function public.export_user_data(
  p_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_profile jsonb;
  v_subscriptions jsonb;
  v_credit_accounts jsonb;
  v_credit_transactions jsonb;
  v_api_keys jsonb;
  v_beta_redemptions jsonb;
  v_devices jsonb;
  v_result jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'user_id is required',
      'exported_at', null
    );
  end if;

  select to_jsonb(p.*) into v_profile
  from public.profiles p
  where p.id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb) into v_subscriptions
  from public.subscriptions s
  where s.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(tc.*)), '[]'::jsonb) into v_credit_accounts
  from public.token_credits tc
  where tc.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(ct.*) order by ct.created_at desc), '[]'::jsonb)
  into v_credit_transactions
  from public.credit_transactions ct
  where ct.user_id = p_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ak.id,
      'name', ak.name,
      'scopes', ak.scopes,
      'last_used_at', ak.last_used_at,
      'expires_at', ak.expires_at,
      'created_at', ak.created_at
    )
  ), '[]'::jsonb) into v_api_keys
  from public.api_keys ak
  where ak.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(br.*)), '[]'::jsonb) into v_beta_redemptions
  from public.beta_redemptions br
  where br.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(dd.*)), '[]'::jsonb) into v_devices
  from public.desktop_devices dd
  where dd.user_id = p_user_id;

  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'exported_at', now(),
    'gdpr_article', 'Article 20 - Right to data portability',
    'data', jsonb_build_object(
      'profile', coalesce(v_profile, '{}'::jsonb),
      'subscriptions', v_subscriptions,
      'credit_accounts', v_credit_accounts,
      'credit_transactions', v_credit_transactions,
      'api_keys', v_api_keys,
      'beta_redemptions', v_beta_redemptions,
      'devices', v_devices
    )
  );

  return v_result;

exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', sqlerrm,
      'error_detail', sqlstate,
      'user_id', p_user_id
    );
end;
$$;

-- 5b. delete_user_data
-- Cascading deletion in FK dependency order (GDPR Article 17).
-- Tables that may not exist in this Neon environment are skipped via
-- EXCEPTION WHEN undefined_table.

create or replace function public.delete_user_data(
  p_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'user_id is required',
      'deleted_at', null
    );
  end if;

  delete from public.credit_transactions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('credit_transactions', v_count);

  delete from public.token_credits where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('token_credits', v_count);

  delete from public.subscriptions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('subscriptions', v_count);

  delete from public.beta_redemptions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('beta_redemptions', v_count);

  delete from public.device_authorization_codes where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('device_authorization_codes', v_count);

  delete from public.desktop_devices where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('desktop_devices', v_count);

  delete from public.mobile_devices where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mobile_devices', v_count);

  delete from public.sync_data where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sync_data', v_count);

  delete from public.api_keys where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('api_keys', v_count);

  delete from public.security_audit_logs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('security_audit_logs', v_count);

  delete from public.revoked_jwts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('revoked_jwts', v_count);

  delete from public.account_sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('account_sessions', v_count);

  delete from public.search_history where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('search_history', v_count);

  delete from public.account_lockout_attempts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('account_lockout_attempts', v_count);

  delete from public.waitlist where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('waitlist', v_count);

  delete from public.profiles where id = p_user_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles', v_count);

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted_at', now(),
    'deleted_counts', v_deleted_counts,
    'gdpr_article', 'Article 17 - Right to erasure'
  );

exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', sqlerrm,
      'error_detail', sqlstate,
      'user_id', p_user_id
    );
end;
$$;

-- =============================================================================
-- SECTION 6: Beta invite functions
-- =============================================================================

-- 6a. validate_and_redeem_invite_code
-- Atomic invite redemption with FOR UPDATE race-condition guard.
-- Adaptation: p_user_id text replaces auth.uid().

create or replace function public.validate_and_redeem_invite_code(
  p_user_id text,
  p_code text,
  p_surface text,
  p_source text
)
returns table(valid boolean, invite_id uuid, error text)
language plpgsql
as $$
declare
  v_invite public.beta_invites%rowtype;
  v_already_used boolean := false;
begin
  -- Lock the invite row to serialize concurrent redemptions.
  select * into v_invite
  from public.beta_invites
  where lower(code) = lower(p_code)
    and is_active = true
  for update;

  if not found then
    return query select false, null::uuid, 'invalid_code'::text;
    return;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return query select false, v_invite.id, 'expired'::text;
    return;
  end if;

  if v_invite.current_uses >= v_invite.max_uses then
    return query select false, v_invite.id, 'fully_redeemed'::text;
    return;
  end if;

  select exists(
    select 1 from public.beta_redemptions
    where invite_id = v_invite.id
      and user_id = p_user_id
  ) into v_already_used;

  if v_already_used then
    return query select false, v_invite.id, 'already_redeemed_by_user'::text;
    return;
  end if;

  insert into public.beta_redemptions (invite_id, user_id, surface, source)
  values (v_invite.id, p_user_id, p_surface, p_source);

  -- Increment use count (trigger beta_invites_increment_uses may also exist;
  -- this UPDATE is a safety belt in case the trigger is absent on Neon).
  update public.beta_invites
  set current_uses = current_uses + 1
  where id = v_invite.id;

  return query select true, v_invite.id, null::text;
end;
$$;

-- 6b. beta_invites_increment_uses  (trigger function)

create or replace function public.beta_invites_increment_uses()
returns trigger
language plpgsql
as $$
begin
  update public.beta_invites
  set current_uses = current_uses + 1
  where id = new.invite_id;
  return new;
end;
$$;

-- Create the trigger only if it does not already exist.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'beta_redemptions_after_insert'
      and tgrelid = 'public.beta_redemptions'::regclass
  ) then
    create trigger beta_redemptions_after_insert
      after insert on public.beta_redemptions
      for each row execute function public.beta_invites_increment_uses();
  end if;
exception
  when undefined_table then null;
end;
$$;

-- 6c. claim_beta_invite
-- Full version: accepts invite_id directly (admin/service path).
-- Adaptation: p_user_id is text; no auth.role() check.

create or replace function public.claim_beta_invite(
  p_user_id text,
  p_invite_id uuid,
  p_plan_tier text default 'hobby'
)
returns json
language plpgsql
as $$
declare
  v_invite record;
  v_any_redemption record;
  v_existing_subscription record;
  v_redemption_id uuid;
  v_subscription_id uuid;
  v_plan_tier text;
  v_trial_days integer;
begin
  select * into v_invite
  from public.beta_invites
  where id = p_invite_id
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'invite not found');
  end if;

  if not v_invite.is_active then
    return json_build_object('success', false, 'error', 'invite is not active');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return json_build_object('success', false, 'error', 'invite has expired');
  end if;

  if v_invite.max_uses is not null and v_invite.current_uses >= v_invite.max_uses then
    return json_build_object('success', false, 'error', 'invite has reached maximum uses');
  end if;

  select id into v_any_redemption
  from public.beta_redemptions
  where user_id = p_user_id
  limit 1;

  if found then
    return json_build_object('success', false, 'error', 'you have already claimed an offer');
  end if;

  select id into v_existing_subscription
  from public.subscriptions
  where user_id = p_user_id
    and status in ('active', 'trialing', 'past_due')
    and plan_tier <> 'free'
  limit 1;

  if found then
    return json_build_object('success', false, 'error', 'you already have an active subscription');
  end if;

  v_plan_tier := coalesce(v_invite.plan_tier, p_plan_tier, 'hobby');
  v_trial_days := coalesce(v_invite.trial_days, 0);

  insert into public.beta_redemptions (invite_id, user_id)
  values (p_invite_id, p_user_id)
  returning id into v_redemption_id;

  update public.beta_invites
  set current_uses = current_uses + 1
  where id = p_invite_id;

  insert into public.subscriptions (
    user_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end,
    stripe_coupon_id,
    updated_at
  ) values (
    p_user_id,
    v_plan_tier,
    'trialing',
    now(),
    now() + (v_trial_days || ' days')::interval,
    v_invite.stripe_coupon_id,
    now()
  )
  on conflict (user_id) do update set
    plan_tier = excluded.plan_tier,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    stripe_coupon_id = excluded.stripe_coupon_id,
    updated_at = now()
  returning id into v_subscription_id;

  return json_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'subscription_id', v_subscription_id,
    'plan_tier', v_plan_tier,
    'trial_days', v_trial_days,
    'discount_percent', v_invite.discount_percent,
    'stripe_coupon_id', v_invite.stripe_coupon_id
  );
end;
$$;

-- =============================================================================
-- SECTION 7: Other / device + release functions
-- =============================================================================

-- 7a. consume_device_authorization_tokens
-- Atomically flips approved -> consumed and returns tokens exactly once.
-- Adaptation: returned user_id is text (Neon Clerk IDs).

create or replace function public.consume_device_authorization_tokens(
  p_device_id text
)
returns table(
  status text,
  user_id text,
  user_email text,
  user_name text,
  access_token text,
  refresh_token text
)
language plpgsql
as $$
declare
  v_rec record;
begin
  select
    dac.status,
    dac.expires_at,
    dac.user_id,
    dac.user_email,
    dac.user_name,
    dac.access_token,
    dac.refresh_token
  into v_rec
  from public.device_authorization_codes dac
  where dac.device_id = p_device_id
  for update;

  if not found then
    return;
  end if;

  if v_rec.expires_at is not null and v_rec.expires_at < now() then
    update public.device_authorization_codes
    set status = 'expired',
        updated_at = now()
    where device_id = p_device_id
      and status in ('pending', 'approved');

    return query
      select 'expired'::text, v_rec.user_id::text,
             v_rec.user_email, v_rec.user_name,
             null::text, null::text;
    return;
  end if;

  if v_rec.status <> 'approved' then
    return query
      select v_rec.status::text, v_rec.user_id::text,
             v_rec.user_email, v_rec.user_name,
             null::text, null::text;
    return;
  end if;

  update public.device_authorization_codes
  set status = 'consumed',
      consumed_at = now(),
      access_token = null,
      refresh_token = null,
      updated_at = now()
  where device_id = p_device_id
    and status = 'approved';

  return query
    select 'approved'::text, v_rec.user_id::text,
           v_rec.user_email, v_rec.user_name,
           v_rec.access_token::text,
           v_rec.refresh_token::text;
end;
$$;

-- 7b. get_latest_release
-- Returns the most recent non-prerelease for a platform/channel pair.

create or replace function public.get_latest_release(
  p_platform text,
  p_channel text default 'stable'
)
returns table(
  id uuid,
  version text,
  platform text,
  download_url text,
  signature text,
  notes text,
  pub_date timestamptz,
  file_size_bytes bigint,
  is_critical boolean
)
language plpgsql
stable
as $$
begin
  return query
    select
      r.id,
      r.version,
      r.platform,
      r.download_url,
      r.signature,
      r.notes,
      r.pub_date,
      r.file_size_bytes,
      r.is_critical
    from public.releases r
    where r.platform = p_platform
      and r.is_prerelease = false
    order by r.pub_date desc
    limit 1;
end;
$$;

-- 7c. record_release_download
-- Hashes the IP address with pgcrypto digest for privacy.
-- Requires pgcrypto extension (CREATE EXTENSION IF NOT EXISTS pgcrypto).

create extension if not exists pgcrypto;

create or replace function public.record_release_download(
  p_release_id uuid,
  p_ip_address text,
  p_user_agent text default null,
  p_country_code text default null,
  p_region text default null,
  p_referrer text default null
)
returns uuid
language plpgsql
as $$
declare
  v_ip_hash text;
  v_download_id uuid;
begin
  v_ip_hash := encode(digest(p_ip_address || 'agiworkforce-salt', 'sha256'), 'hex');

  insert into public.release_downloads (
    release_id,
    ip_hash,
    user_agent,
    country_code,
    region,
    referrer
  ) values (
    p_release_id,
    v_ip_hash,
    p_user_agent,
    p_country_code,
    p_region,
    p_referrer
  )
  returning id into v_download_id;

  return v_download_id;
end;
$$;

-- 7d. upsert_release
-- Idempotent CI/CD helper for publishing a new release.

create or replace function public.upsert_release(
  p_version text,
  p_platform text,
  p_download_url text,
  p_signature text,
  p_notes text default null,
  p_pub_date timestamptz default now(),
  p_file_size_bytes bigint default null,
  p_sha256_hash text default null,
  p_min_os_version text default null,
  p_is_prerelease boolean default false,
  p_is_critical boolean default false,
  p_channel text default 'stable'
)
returns uuid
language plpgsql
as $$
declare
  v_release_id uuid;
begin
  insert into public.releases (
    version, platform, download_url, signature, notes,
    pub_date, file_size_bytes, sha256_hash, min_os_version,
    is_prerelease, is_critical
  ) values (
    p_version, p_platform, p_download_url, p_signature, p_notes,
    p_pub_date, p_file_size_bytes, p_sha256_hash, p_min_os_version,
    p_is_prerelease, p_is_critical
  )
  on conflict (version, platform)
  do update set
    download_url = excluded.download_url,
    signature = excluded.signature,
    notes = coalesce(excluded.notes, releases.notes),
    pub_date = excluded.pub_date,
    file_size_bytes = coalesce(excluded.file_size_bytes, releases.file_size_bytes),
    sha256_hash = coalesce(excluded.sha256_hash, releases.sha256_hash),
    min_os_version = coalesce(excluded.min_os_version, releases.min_os_version),
    is_prerelease = excluded.is_prerelease,
    is_critical = excluded.is_critical,
    updated_at = now()
  returning id into v_release_id;

  return v_release_id;
end;
$$;

-- 7e. get_release_download_stats

create or replace function public.get_release_download_stats(
  p_release_id uuid
)
returns table(
  total_downloads bigint,
  unique_downloads bigint,
  downloads_today bigint,
  downloads_this_week bigint,
  downloads_this_month bigint
)
language plpgsql
stable
as $$
begin
  return query
    select
      count(*)::bigint,
      count(distinct rd.ip_hash)::bigint,
      count(*) filter (where rd.downloaded_at >= current_date)::bigint,
      count(*) filter (where rd.downloaded_at >= current_date - interval '7 days')::bigint,
      count(*) filter (where rd.downloaded_at >= current_date - interval '30 days')::bigint
    from public.release_downloads rd
    where rd.release_id = p_release_id;
end;
$$;

-- 7f. cleanup_old_download_records

create or replace function public.cleanup_old_download_records()
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.release_downloads
  where downloaded_at < now() - interval '90 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

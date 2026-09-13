-- 0182 : give the managed-usage ledger a microUSD unit.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Every money column on the credit ledger is an integer number of cents, and
-- LLMCostCalculator.calculateCost rounds a turn up to at least one whole cent.
-- A $0.0009 request therefore debits 1 cent, eleven times what it cost, and a
-- caller who splits one $0.09 call into a hundred $0.0009 calls is billed
-- $1.00 instead of $0.09. The floor is not a rounding detail, it is an
-- arbitrage surface in both directions.
--
-- This migration gives every one of those columns a bigint microUSD twin and
-- makes microUSD the unit the functions compute in. One credit is 20,000
-- microUSD, one cent is 10,000, so 900 microUSD is 0.045 credits and is now
-- representable.
--
-- THE CENTS COLUMNS STAY, AND STAY CORRECT. Every function that writes a
-- microUSD value also writes its cents column as
-- microusd_to_cents_mirror(<the new TOTAL>), never as a sum of rounded deltas,
-- so a reader that has not migrated is wrong by at most half a cent on the
-- balance rather than drifting by half a cent per request. The rolling-window
-- sums, the caps and the headroom all read microUSD.
--
-- EVERY EXISTING SIGNATURE KEEPS WORKING. The cents-shaped functions are
-- redefined as wrappers that multiply by 10,000 and delegate to the microUSD
-- body, so a call site that has not been migrated bills exactly what it billed
-- before, to the cent. Nothing is dropped and no grant changes.
--
-- flagship_used_today_microusd is added beyond the columns the brief named:
-- deduct_credits enforces the calendar-day ceiling against
-- flagship_used_today_cents, and without a microUSD twin every sub-cent
-- deduction would add zero to it and the ceiling would stop counting the exact
-- traffic this migration exists to price.

begin;

-- Round-half-up, exactly, in both directions. Integer division in Postgres
-- truncates toward zero, which rounds -1.4 cents to 0 rather than to -1, and a
-- release is a negative amount.
create or replace function public.microusd_to_cents_mirror(p_microusd bigint)
returns integer
language sql
immutable
as $$
  select floor((p_microusd + 5000)::numeric / 10000)::integer;
$$;

comment on function public.microusd_to_cents_mirror(bigint) is
  'The cents mirror of a microUSD amount, round-half-up. Apply to a running total, never to a delta.';

revoke all on function public.microusd_to_cents_mirror(bigint) from public;
grant execute on function public.microusd_to_cents_mirror(bigint) to app_rls;

alter table public.token_credits
  add column if not exists credits_allocated_microusd bigint not null default 0,
  add column if not exists credits_used_microusd bigint not null default 0,
  add column if not exists top_up_allocated_microusd bigint not null default 0,
  add column if not exists flagship_used_today_microusd bigint not null default 0;

alter table public.credit_transactions
  add column if not exists amount_microusd bigint not null default 0;

alter table public.managed_usage_requests
  add column if not exists estimated_cost_microusd bigint not null default 0,
  add column if not exists actual_cost_microusd bigint;

alter table public.managed_usage_request_extensions
  add column if not exists estimated_cost_microusd bigint not null default 0;

alter table public.credit_settlement_jobs
  add column if not exists amount_microusd bigint not null default 0;

-- Backfill in bounded batches. Each predicate names rows whose microUSD twin is
-- still at its default while the cents column it mirrors is not zero, so each
-- pass strictly shrinks the remaining set and re-running the block is a no-op.
do $$
declare
  v_touched integer;
begin
  loop
    update public.token_credits target
    set credits_allocated_microusd = target.credits_allocated_cents::bigint * 10000,
        credits_used_microusd = target.credits_used_cents::bigint * 10000,
        top_up_allocated_microusd = target.top_up_allocated_cents::bigint * 10000,
        flagship_used_today_microusd =
          coalesce(target.flagship_used_today_cents, 0)::bigint * 10000
    where target.id in (
      select account_row.id
      from public.token_credits account_row
      where (account_row.credits_allocated_microusd = 0
              and account_row.credits_allocated_cents <> 0)
         or (account_row.credits_used_microusd = 0
              and account_row.credits_used_cents <> 0)
         or (account_row.top_up_allocated_microusd = 0
              and account_row.top_up_allocated_cents <> 0)
         or (account_row.flagship_used_today_microusd = 0
              and coalesce(account_row.flagship_used_today_cents, 0) <> 0)
      limit 5000
    );
    get diagnostics v_touched = row_count;
    exit when v_touched = 0;
  end loop;

  loop
    update public.credit_transactions target
    set amount_microusd = target.amount_cents::bigint * 10000
    where target.id in (
      select transaction_row.id
      from public.credit_transactions transaction_row
      where transaction_row.amount_microusd = 0 and transaction_row.amount_cents <> 0
      limit 5000
    );
    get diagnostics v_touched = row_count;
    exit when v_touched = 0;
  end loop;

  loop
    update public.managed_usage_requests target
    set estimated_cost_microusd = target.estimated_cost_cents::bigint * 10000,
        actual_cost_microusd = target.actual_cost_cents::bigint * 10000
    where target.id in (
      select request_row.id
      from public.managed_usage_requests request_row
      where (request_row.estimated_cost_microusd = 0
              and request_row.estimated_cost_cents <> 0)
         or (request_row.actual_cost_microusd is null
              and request_row.actual_cost_cents is not null)
      limit 5000
    );
    get diagnostics v_touched = row_count;
    exit when v_touched = 0;
  end loop;

  loop
    update public.managed_usage_request_extensions target
    set estimated_cost_microusd = target.estimated_cost_cents::bigint * 10000
    where (target.request_id, target.operation_key) in (
      select extension_row.request_id, extension_row.operation_key
      from public.managed_usage_request_extensions extension_row
      where extension_row.estimated_cost_microusd = 0
        and extension_row.estimated_cost_cents <> 0
      limit 5000
    );
    get diagnostics v_touched = row_count;
    exit when v_touched = 0;
  end loop;

  loop
    update public.credit_settlement_jobs target
    set amount_microusd = target.amount_cents::bigint * 10000
    where target.id in (
      select job_row.id
      from public.credit_settlement_jobs job_row
      where job_row.amount_microusd = 0 and job_row.amount_cents <> 0
      limit 5000
    );
    get diagnostics v_touched = row_count;
    exit when v_touched = 0;
  end loop;
end $$;

alter table public.token_credits
  drop constraint if exists token_credits_top_up_allocation_valid_microusd;
alter table public.token_credits
  add constraint token_credits_top_up_allocation_valid_microusd
  check (
    top_up_allocated_microusd >= 0
    and top_up_allocated_microusd <= credits_allocated_microusd
  );

alter table public.managed_usage_requests
  drop constraint if exists managed_usage_requests_microusd_non_negative;
alter table public.managed_usage_requests
  add constraint managed_usage_requests_microusd_non_negative
  check (
    estimated_cost_microusd >= 0
    and (actual_cost_microusd is null or actual_cost_microusd >= 0)
  );

alter table public.managed_usage_request_extensions
  drop constraint if exists managed_usage_request_extensions_microusd_non_negative;
alter table public.managed_usage_request_extensions
  add constraint managed_usage_request_extensions_microusd_non_negative
  check (estimated_cost_microusd >= 0);

-- KEEPING THE TWO UNITS CONSISTENT FOR WRITERS THAT NEVER MOVED.
--
-- The backfill above is a one-shot. Every row written afterwards by code that
-- still speaks cents, operator-metrics.ts adjusts balances and inserts
-- transactions in cents at six call sites, and the lease probe seeds an
-- account the same way, would leave the microUSD twin at its zero default.
-- Because the functions below read microUSD, such an account holds no
-- spendable balance at all and every reservation against it is declined, and
-- such a transaction sums as zero spend in the rolling windows that bound a
-- plan. Mirrored columns are only safe if something maintains the mirror in
-- both directions, so these triggers do.
--
-- microUSD wins whenever the writer supplied it, which keeps every function
-- below authoritative; cents is read only when the microUSD side was left at
-- its default, which is exactly the cents-only writer.

create or replace function public.sync_token_credits_units()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.credits_allocated_microusd = 0 and new.credits_allocated_cents <> 0 then
      new.credits_allocated_microusd := new.credits_allocated_cents::bigint * 10000;
    end if;
    if new.credits_used_microusd = 0 and new.credits_used_cents <> 0 then
      new.credits_used_microusd := new.credits_used_cents::bigint * 10000;
    end if;
    if new.top_up_allocated_microusd = 0 and new.top_up_allocated_cents <> 0 then
      new.top_up_allocated_microusd := new.top_up_allocated_cents::bigint * 10000;
    end if;
    if new.flagship_used_today_microusd = 0
      and coalesce(new.flagship_used_today_cents, 0) <> 0 then
      new.flagship_used_today_microusd := new.flagship_used_today_cents::bigint * 10000;
    end if;
  else
    if new.credits_allocated_microusd is not distinct from old.credits_allocated_microusd
      and new.credits_allocated_cents is distinct from old.credits_allocated_cents then
      new.credits_allocated_microusd := new.credits_allocated_cents::bigint * 10000;
    end if;
    if new.credits_used_microusd is not distinct from old.credits_used_microusd
      and new.credits_used_cents is distinct from old.credits_used_cents then
      new.credits_used_microusd := new.credits_used_cents::bigint * 10000;
    end if;
    if new.top_up_allocated_microusd is not distinct from old.top_up_allocated_microusd
      and new.top_up_allocated_cents is distinct from old.top_up_allocated_cents then
      new.top_up_allocated_microusd := new.top_up_allocated_cents::bigint * 10000;
    end if;
    if new.flagship_used_today_microusd is not distinct from old.flagship_used_today_microusd
      and new.flagship_used_today_cents is distinct from old.flagship_used_today_cents then
      new.flagship_used_today_microusd := coalesce(new.flagship_used_today_cents, 0)::bigint * 10000;
    end if;
  end if;

  new.credits_allocated_cents := public.microusd_to_cents_mirror(new.credits_allocated_microusd);
  new.credits_used_cents := public.microusd_to_cents_mirror(new.credits_used_microusd);
  new.top_up_allocated_cents := public.microusd_to_cents_mirror(new.top_up_allocated_microusd);
  new.flagship_used_today_cents :=
    public.microusd_to_cents_mirror(new.flagship_used_today_microusd);
  return new;
end;
$$;

revoke all on function public.sync_token_credits_units() from public;

drop trigger if exists sync_token_credits_units on public.token_credits;
create trigger sync_token_credits_units
  before insert or update on public.token_credits
  for each row execute function public.sync_token_credits_units();

create or replace function public.sync_credit_transactions_units()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_microusd = 0 and new.amount_cents <> 0 then
      new.amount_microusd := new.amount_cents::bigint * 10000;
    end if;
  elsif new.amount_microusd is not distinct from old.amount_microusd
    and new.amount_cents is distinct from old.amount_cents then
    new.amount_microusd := new.amount_cents::bigint * 10000;
  end if;

  new.amount_cents := public.microusd_to_cents_mirror(new.amount_microusd);
  return new;
end;
$$;

revoke all on function public.sync_credit_transactions_units() from public;

-- Named to sort after label_managed_usage_transaction_flagship: Postgres fires
-- same-timing row triggers in name order and each returns NEW, so the two
-- compose, but only one may be the last word on the amount columns.
drop trigger if exists sync_zz_credit_transactions_units on public.credit_transactions;
create trigger sync_zz_credit_transactions_units
  before insert or update on public.credit_transactions
  for each row execute function public.sync_credit_transactions_units();

create or replace function public.sync_credit_settlement_jobs_units()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_microusd = 0 and new.amount_cents <> 0 then
      new.amount_microusd := new.amount_cents::bigint * 10000;
    end if;
  elsif new.amount_microusd is not distinct from old.amount_microusd
    and new.amount_cents is distinct from old.amount_cents then
    new.amount_microusd := new.amount_cents::bigint * 10000;
  end if;

  new.amount_cents := public.microusd_to_cents_mirror(new.amount_microusd);
  return new;
end;
$$;

revoke all on function public.sync_credit_settlement_jobs_units() from public;

drop trigger if exists sync_credit_settlement_jobs_units on public.credit_settlement_jobs;
create trigger sync_credit_settlement_jobs_units
  before insert or update on public.credit_settlement_jobs
  for each row execute function public.sync_credit_settlement_jobs_units();

create or replace function public.sync_managed_usage_request_units()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.estimated_cost_microusd = 0 and new.estimated_cost_cents <> 0 then
      new.estimated_cost_microusd := new.estimated_cost_cents::bigint * 10000;
    end if;
    if new.actual_cost_microusd is null and new.actual_cost_cents is not null then
      new.actual_cost_microusd := new.actual_cost_cents::bigint * 10000;
    end if;
  else
    if new.estimated_cost_microusd is not distinct from old.estimated_cost_microusd
      and new.estimated_cost_cents is distinct from old.estimated_cost_cents then
      new.estimated_cost_microusd := new.estimated_cost_cents::bigint * 10000;
    end if;
    if new.actual_cost_microusd is not distinct from old.actual_cost_microusd
      and new.actual_cost_cents is distinct from old.actual_cost_cents then
      new.actual_cost_microusd := new.actual_cost_cents::bigint * 10000;
    end if;
  end if;

  new.estimated_cost_cents := public.microusd_to_cents_mirror(new.estimated_cost_microusd);
  new.actual_cost_cents := public.microusd_to_cents_mirror(new.actual_cost_microusd);
  return new;
end;
$$;

revoke all on function public.sync_managed_usage_request_units() from public;

drop trigger if exists sync_managed_usage_request_units on public.managed_usage_requests;
create trigger sync_managed_usage_request_units
  before insert or update on public.managed_usage_requests
  for each row execute function public.sync_managed_usage_request_units();

create or replace function public.sync_managed_usage_extension_units()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.estimated_cost_microusd = 0 and new.estimated_cost_cents <> 0 then
      new.estimated_cost_microusd := new.estimated_cost_cents::bigint * 10000;
    end if;
  elsif new.estimated_cost_microusd is not distinct from old.estimated_cost_microusd
    and new.estimated_cost_cents is distinct from old.estimated_cost_cents then
    new.estimated_cost_microusd := new.estimated_cost_cents::bigint * 10000;
  end if;

  new.estimated_cost_cents := public.microusd_to_cents_mirror(new.estimated_cost_microusd);
  return new;
end;
$$;

revoke all on function public.sync_managed_usage_extension_units() from public;

drop trigger if exists sync_managed_usage_extension_units
  on public.managed_usage_request_extensions;
create trigger sync_managed_usage_extension_units
  before insert or update on public.managed_usage_request_extensions
  for each row execute function public.sync_managed_usage_extension_units();

comment on column public.token_credits.credits_used_microusd is
  'Authoritative spend. credits_used_cents is its round-half-up mirror, kept for readers that predate 0182.';
comment on column public.credit_transactions.amount_microusd is
  'Authoritative ledger amount. Rolling windows sum this column; amount_cents is a per-row mirror and does not sum to it.';

commit;

begin;

create or replace function public.calculate_daily_limit_microusd(
  p_monthly_microusd bigint
)
returns bigint
language sql
immutable
as $$
  select floor(coalesce(p_monthly_microusd, 0) * 0.30)::bigint;
$$;

revoke all on function public.calculate_daily_limit_microusd(bigint) from public;
grant execute on function public.calculate_daily_limit_microusd(bigint) to app_rls;

create or replace function public.get_credit_balance_microusd(
  p_user_id text
)
returns table (
  account_id uuid,
  credits_allocated_microusd bigint,
  credits_used_microusd bigint,
  credits_remaining_microusd bigint,
  daily_limit_microusd bigint,
  daily_used_microusd bigint,
  daily_remaining_microusd bigint,
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
  v_daily_limit bigint;
  v_daily_used bigint;
  v_remaining bigint;
  v_needs_reset boolean;
begin
  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.period_end > now()
  order by account_row.period_end desc
  limit 1;

  if v_account is null then
    return query select
      null::uuid, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
      0, 0, 0, 0, 0, 0,
      null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_remaining := v_account.credits_allocated_microusd - v_account.credits_used_microusd;
  v_daily_limit := public.calculate_daily_limit_microusd(v_account.credits_allocated_microusd);

  v_needs_reset := v_account.flagship_cap_reset_date is null
    or v_account.flagship_cap_reset_date < current_date;

  if v_needs_reset then
    update public.token_credits
    set flagship_used_today_microusd = 0,
        flagship_used_today_cents = 0,
        flagship_cap_reset_date = current_date,
        updated_at = now()
    where id = v_account.id;
    v_daily_used := 0;
  else
    v_daily_used := coalesce(v_account.flagship_used_today_microusd, 0);
  end if;

  return query select
    v_account.id,
    v_account.credits_allocated_microusd,
    v_account.credits_used_microusd,
    v_remaining,
    v_daily_limit,
    v_daily_used,
    greatest(0::bigint, v_daily_limit - v_daily_used),
    public.microusd_to_cents_mirror(v_account.credits_allocated_microusd),
    public.microusd_to_cents_mirror(v_account.credits_used_microusd),
    public.microusd_to_cents_mirror(v_remaining),
    public.microusd_to_cents_mirror(v_daily_limit),
    public.microusd_to_cents_mirror(v_daily_used),
    public.microusd_to_cents_mirror(greatest(0::bigint, v_daily_limit - v_daily_used)),
    v_account.period_start,
    v_account.period_end,
    coalesce((v_account.flagship_cap_reset_date::text)::timestamptz, now());
end;
$$;

revoke all on function public.get_credit_balance_microusd(text) from public;
grant execute on function public.get_credit_balance_microusd(text) to app_rls;

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
begin
  return query select
    balance.account_id,
    balance.credits_allocated_cents,
    balance.credits_used_cents,
    balance.credits_remaining_cents,
    balance.daily_limit_cents,
    balance.daily_used_cents,
    balance.daily_remaining_cents,
    balance.period_start,
    balance.period_end,
    balance.last_daily_reset_at
  from public.get_credit_balance_microusd(p_user_id) balance;
end;
$$;

create or replace function public.check_credits_available_microusd(
  p_user_id text,
  p_amount_microusd bigint
)
returns boolean
language plpgsql
as $$
declare
  v_balance record;
begin
  select * into v_balance
  from public.get_credit_balance_microusd(p_user_id);

  if v_balance.credits_remaining_microusd < p_amount_microusd then
    return false;
  end if;

  if v_balance.daily_remaining_microusd < p_amount_microusd then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.check_credits_available_microusd(text, bigint) from public;
grant execute on function public.check_credits_available_microusd(text, bigint) to app_rls;

create or replace function public.check_credits_available(
  p_user_id text,
  p_amount_cents integer
)
returns boolean
language sql
as $$
  select public.check_credits_available_microusd(p_user_id, p_amount_cents::bigint * 10000);
$$;

create or replace function public.get_or_create_credit_account_microusd(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_microusd bigint
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
    credits_allocated_microusd,
    credits_allocated_cents,
    credits_used_microusd,
    credits_used_cents,
    flagship_used_today_microusd,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_microusd,
    public.microusd_to_cents_mirror(p_credits_allocated_microusd),
    0,
    0,
    0,
    0,
    current_date
  )
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type,
    amount_microusd, amount_cents, description
  ) values (
    p_user_id, v_account_id, 'allocation',
    p_credits_allocated_microusd,
    public.microusd_to_cents_mirror(p_credits_allocated_microusd),
    'initial credit allocation for billing period'
  );

  return v_account_id;
end;
$$;

revoke all on function public.get_or_create_credit_account_microusd(
  text, uuid, timestamptz, timestamptz, bigint
) from public;
grant execute on function public.get_or_create_credit_account_microusd(
  text, uuid, timestamptz, timestamptz, bigint
) to app_rls;

create or replace function public.get_or_create_credit_account(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_cents integer
)
returns uuid
language sql
as $$
  select public.get_or_create_credit_account_microusd(
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents::bigint * 10000
  );
$$;

create or replace function public.handle_refund_microusd(
  p_user_id text,
  p_refund_amount_microusd bigint,
  p_reason text default 'Refund processed'
)
returns boolean
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_credits_to_revoke bigint;
  v_remaining bigint;
begin
  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
  order by account_row.period_end desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  v_remaining := v_account.credits_allocated_microusd - v_account.credits_used_microusd;
  v_credits_to_revoke := least(p_refund_amount_microusd, greatest(0::bigint, v_remaining));

  update public.token_credits
  set credits_used_microusd = credits_used_microusd + v_credits_to_revoke,
      credits_used_cents =
        public.microusd_to_cents_mirror(credits_used_microusd + v_credits_to_revoke),
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_microusd, amount_cents, transaction_type, description
  ) values (
    p_user_id,
    v_account.id,
    -v_credits_to_revoke,
    public.microusd_to_cents_mirror(-v_credits_to_revoke),
    'refund',
    p_reason
  );

  return true;
end;
$$;

revoke all on function public.handle_refund_microusd(text, bigint, text) from public;
grant execute on function public.handle_refund_microusd(text, bigint, text) to app_rls;

create or replace function public.handle_refund(
  p_user_id text,
  p_refund_amount_cents integer,
  p_reason text default 'Refund processed'
)
returns boolean
language sql
as $$
  select public.handle_refund_microusd(
    p_user_id, p_refund_amount_cents::bigint * 10000, p_reason
  );
$$;

create or replace function public.add_credits_microusd(
  p_user_id text,
  p_account_id uuid,
  p_amount_microusd bigint,
  p_description text,
  p_transaction_type text default 'purchase'
)
returns void
language plpgsql
as $$
begin
  if p_amount_microusd <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_transaction_type not in ('purchase', 'adjustment', 'refund', 'bonus') then
    raise exception 'invalid transaction type: %', p_transaction_type;
  end if;

  update public.token_credits
  set credits_allocated_microusd = credits_allocated_microusd + p_amount_microusd,
      credits_allocated_cents =
        public.microusd_to_cents_mirror(credits_allocated_microusd + p_amount_microusd),
      top_up_allocated_microusd = top_up_allocated_microusd
        + case when p_transaction_type = 'purchase' then p_amount_microusd else 0 end,
      top_up_allocated_cents = public.microusd_to_cents_mirror(
        top_up_allocated_microusd
          + case when p_transaction_type = 'purchase' then p_amount_microusd else 0 end
      ),
      credits_used_microusd = greatest(0::bigint, credits_used_microusd),
      credits_used_cents = public.microusd_to_cents_mirror(
        greatest(0::bigint, credits_used_microusd)
      ),
      updated_at = now()
  where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'credit account not found for user';
  end if;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_microusd, amount_cents, transaction_type, description
  ) values (
    p_user_id,
    p_account_id,
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_transaction_type,
    p_description
  );
end;
$$;

revoke all on function public.add_credits_microusd(text, uuid, bigint, text, text) from public;
grant execute on function public.add_credits_microusd(text, uuid, bigint, text, text) to app_rls;

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
  perform public.add_credits_microusd(
    p_user_id, p_account_id, p_amount_cents::bigint * 10000, p_description, p_transaction_type
  );
end;
$$;

create or replace function public.handle_top_up_refund_microusd(
  p_user_id text,
  p_refund_amount_microusd bigint,
  p_reason text default 'Top-up refund processed'
)
returns boolean
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_remaining_microusd bigint;
  v_balance_to_revoke bigint;
  v_purchase_to_retire bigint;
begin
  if p_refund_amount_microusd <= 0 then
    raise exception 'refund amount must be positive';
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
  order by account_row.period_end desc
  limit 1
  for update;

  if v_account.id is null then
    return false;
  end if;

  v_remaining_microusd := greatest(
    v_account.credits_allocated_microusd - v_account.credits_used_microusd,
    0
  );
  v_balance_to_revoke := least(p_refund_amount_microusd, v_remaining_microusd);
  v_purchase_to_retire := least(p_refund_amount_microusd, v_account.top_up_allocated_microusd);

  update public.token_credits
  set credits_used_microusd = credits_used_microusd + v_balance_to_revoke,
      credits_used_cents =
        public.microusd_to_cents_mirror(credits_used_microusd + v_balance_to_revoke),
      top_up_allocated_microusd = top_up_allocated_microusd - v_purchase_to_retire,
      top_up_allocated_cents =
        public.microusd_to_cents_mirror(top_up_allocated_microusd - v_purchase_to_retire),
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_microusd, amount_cents,
    transaction_type, description, metadata
  ) values (
    p_user_id,
    v_account.id,
    -p_refund_amount_microusd,
    public.microusd_to_cents_mirror(-p_refund_amount_microusd),
    'refund',
    p_reason,
    jsonb_build_object(
      'top_up_refund', true,
      'balance_revoked_microusd', v_balance_to_revoke,
      'purchase_retired_microusd', v_purchase_to_retire,
      'balance_revoked_cents', public.microusd_to_cents_mirror(v_balance_to_revoke),
      'purchase_retired_cents', public.microusd_to_cents_mirror(v_purchase_to_retire)
    )
  );

  return true;
end;
$$;

revoke all on function public.handle_top_up_refund_microusd(text, bigint, text) from public;
grant execute on function public.handle_top_up_refund_microusd(text, bigint, text) to app_rls;

create or replace function public.handle_top_up_refund(
  p_user_id text,
  p_refund_amount_cents integer,
  p_reason text default 'Top-up refund processed'
)
returns boolean
language sql
as $$
  select public.handle_top_up_refund_microusd(
    p_user_id, p_refund_amount_cents::bigint * 10000, p_reason
  );
$$;

create or replace function public.reset_credits_for_period_microusd(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_microusd bigint
)
returns uuid
language plpgsql
as $$
declare
  v_account_id uuid;
  v_previous public.token_credits%rowtype;
  v_remaining_microusd bigint := 0;
  v_unexpired_purchases_microusd bigint := 0;
  v_carried_top_up_microusd bigint := 0;
  v_allocated_microusd bigint;
begin
  select id into v_account_id
  from public.token_credits
  where user_id = p_user_id
    and subscription_id = p_subscription_id
    and period_start = p_period_start
    and period_end = p_period_end
  limit 1;
  if v_account_id is not null then
    return v_account_id;
  end if;

  select account_row.* into v_previous
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.subscription_id = p_subscription_id
    and account_row.period_start < p_period_start
  order by account_row.period_end desc
  limit 1
  for update;

  if v_previous.id is not null then
    v_remaining_microusd := greatest(
      v_previous.credits_allocated_microusd - v_previous.credits_used_microusd,
      0
    );

    select coalesce(sum(purchase_row.amount_microusd), 0)::bigint
      into v_unexpired_purchases_microusd
    from public.credit_transactions purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.transaction_type = 'purchase'
      and purchase_row.amount_microusd > 0
      and purchase_row.created_at > p_period_start - interval '12 months';

    v_carried_top_up_microusd := least(
      v_previous.top_up_allocated_microusd,
      v_remaining_microusd,
      v_unexpired_purchases_microusd
    );
  end if;

  v_allocated_microusd := p_credits_allocated_microusd + v_carried_top_up_microusd;

  insert into public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_microusd,
    credits_allocated_cents,
    top_up_allocated_microusd,
    top_up_allocated_cents,
    credits_used_microusd,
    credits_used_cents,
    flagship_used_today_microusd,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    v_allocated_microusd,
    public.microusd_to_cents_mirror(v_allocated_microusd),
    v_carried_top_up_microusd,
    public.microusd_to_cents_mirror(v_carried_top_up_microusd),
    0,
    0,
    0,
    0,
    current_date
  )
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type,
    amount_microusd, amount_cents, description, metadata
  ) values (
    p_user_id,
    v_account_id,
    'reset',
    v_allocated_microusd,
    public.microusd_to_cents_mirror(v_allocated_microusd),
    'credit reset for new billing period',
    jsonb_build_object(
      'carried_top_up_microusd', v_carried_top_up_microusd,
      'carried_top_up_cents', public.microusd_to_cents_mirror(v_carried_top_up_microusd)
    )
  );

  return v_account_id;
end;
$$;

revoke all on function public.reset_credits_for_period_microusd(
  text, uuid, timestamptz, timestamptz, bigint
) from public;
grant execute on function public.reset_credits_for_period_microusd(
  text, uuid, timestamptz, timestamptz, bigint
) to app_rls;

create or replace function public.reset_credits_for_period(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_cents integer
)
returns uuid
language sql
as $$
  select public.reset_credits_for_period_microusd(
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents::bigint * 10000
  );
$$;

commit;

begin;

-- The settlement result jsonb is read back by the idempotency replay paths and
-- by TypeScript. It carries both units: the microUSD keys are authoritative and
-- the legacy keys keep every unmigrated reader correct to the cent.
create or replace function public.build_settlement_result(
  p_success boolean,
  p_remaining_microusd bigint,
  p_error text,
  p_code text,
  p_daily_limit_microusd bigint,
  p_daily_used_microusd bigint,
  p_daily_remaining_microusd bigint,
  p_reset_in_hours numeric
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'success', p_success,
    'remaining_microusd', p_remaining_microusd,
    'remaining_cents', public.microusd_to_cents_mirror(p_remaining_microusd),
    'error', p_error,
    'code', p_code,
    'daily_limit_microusd', p_daily_limit_microusd,
    'daily_limit', public.microusd_to_cents_mirror(p_daily_limit_microusd),
    'daily_used_microusd', p_daily_used_microusd,
    'daily_used', public.microusd_to_cents_mirror(p_daily_used_microusd),
    'daily_remaining_microusd', p_daily_remaining_microusd,
    'daily_remaining', public.microusd_to_cents_mirror(p_daily_remaining_microusd),
    'reset_in_hours', p_reset_in_hours
  );
$$;

-- A result written before 0182 carries only the cents key. Reading it as
-- microUSD is exact for those rows, because they were whole cents.
create or replace function public.settlement_result_microusd(
  p_result jsonb,
  p_microusd_key text,
  p_cents_key text
)
returns bigint
language sql
immutable
as $$
  select coalesce(
    (p_result->>p_microusd_key)::bigint,
    (p_result->>p_cents_key)::bigint * 10000,
    0
  );
$$;

revoke all on function public.build_settlement_result(
  boolean, bigint, text, text, bigint, bigint, bigint, numeric
) from public;
revoke all on function public.settlement_result_microusd(jsonb, text, text) from public;
grant execute on function public.build_settlement_result(
  boolean, bigint, text, text, bigint, bigint, bigint, numeric
) to app_rls;
grant execute on function public.settlement_result_microusd(jsonb, text, text) to app_rls;

create or replace function public.deduct_credits_microusd(
  p_user_id text,
  p_amount_microusd bigint,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table(
  success boolean,
  remaining_microusd bigint,
  error text,
  code text,
  daily_limit_microusd bigint,
  daily_used_microusd bigint,
  daily_remaining_microusd bigint,
  reset_in_hours numeric
)
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_daily_limit bigint;
  v_daily_used bigint;
  v_needs_reset boolean;
  v_hours_until_reset numeric;
  v_existing_result jsonb;
  v_result jsonb;
  v_remaining bigint;
begin
  if p_idempotency_key is not null then
    select key_row.result into v_existing_result
    from public.credit_idempotency_keys key_row
    where key_row.idempotency_key = p_idempotency_key
      and key_row.user_id = p_user_id
      and key_row.expires_at > now();

    if v_existing_result is not null then
      return query select
        (v_existing_result->>'success')::boolean,
        public.settlement_result_microusd(v_existing_result, 'remaining_microusd', 'remaining_cents'),
        v_existing_result->>'error',
        v_existing_result->>'code',
        public.settlement_result_microusd(v_existing_result, 'daily_limit_microusd', 'daily_limit'),
        public.settlement_result_microusd(v_existing_result, 'daily_used_microusd', 'daily_used'),
        public.settlement_result_microusd(v_existing_result, 'daily_remaining_microusd', 'daily_remaining'),
        (v_existing_result->>'reset_in_hours')::numeric;
      return;
    end if;
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.period_end > now()
  order by account_row.period_end desc
  limit 1
  for update;

  if v_account is null then
    v_result := public.build_settlement_result(false, 0, 'no active credit account found',
      'NO_ACCOUNT', 0, 0, 0, 0::numeric);

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select false, 0::bigint, 'no active credit account found'::text,
      'NO_ACCOUNT'::text, 0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  v_remaining := v_account.credits_allocated_microusd - v_account.credits_used_microusd;
  v_daily_limit := public.calculate_daily_limit_microusd(v_account.credits_allocated_microusd);

  v_needs_reset := v_account.flagship_cap_reset_date is null
    or v_account.flagship_cap_reset_date < current_date;

  if v_needs_reset then
    update public.token_credits
    set flagship_used_today_microusd = 0,
        flagship_used_today_cents = 0,
        flagship_cap_reset_date = current_date,
        updated_at = now()
    where id = v_account.id;
    v_account.flagship_used_today_microusd := 0;
    v_account.flagship_cap_reset_date := current_date;
  end if;

  v_daily_used := coalesce(v_account.flagship_used_today_microusd, 0);
  v_hours_until_reset := extract(epoch from ((current_date + 1)::timestamptz - now())) / 3600.0;

  if v_daily_used + p_amount_microusd > v_daily_limit then
    v_result := public.build_settlement_result(false, v_remaining, 'daily credit limit exceeded',
      'DAILY_CREDIT_LIMIT_REACHED', v_daily_limit, v_daily_used,
      greatest(0::bigint, v_daily_limit - v_daily_used), greatest(0::numeric, v_hours_until_reset));

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select
      false, v_remaining,
      'daily credit limit exceeded'::text, 'DAILY_CREDIT_LIMIT_REACHED'::text,
      v_daily_limit, v_daily_used, greatest(0::bigint, v_daily_limit - v_daily_used),
      greatest(0::numeric, v_hours_until_reset);
    return;
  end if;

  if v_remaining < p_amount_microusd then
    v_result := public.build_settlement_result(false, v_remaining, 'monthly credit limit exceeded',
      'MONTHLY_CREDIT_LIMIT_REACHED', v_daily_limit, v_daily_used,
      greatest(0::bigint, v_daily_limit - v_daily_used), greatest(0::numeric, v_hours_until_reset));

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select
      false, v_remaining,
      'monthly credit limit exceeded'::text, 'MONTHLY_CREDIT_LIMIT_REACHED'::text,
      v_daily_limit, v_daily_used, greatest(0::bigint, v_daily_limit - v_daily_used),
      greatest(0::numeric, v_hours_until_reset);
    return;
  end if;

  update public.token_credits
  set credits_used_microusd = credits_used_microusd + p_amount_microusd,
      credits_used_cents =
        public.microusd_to_cents_mirror(credits_used_microusd + p_amount_microusd),
      flagship_used_today_microusd =
        coalesce(flagship_used_today_microusd, 0) + p_amount_microusd,
      flagship_used_today_cents = public.microusd_to_cents_mirror(
        coalesce(flagship_used_today_microusd, 0) + p_amount_microusd
      ),
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type,
    amount_microusd, amount_cents, description, metadata
  ) values (
    p_user_id, v_account.id, 'deduction',
    p_amount_microusd, public.microusd_to_cents_mirror(p_amount_microusd), p_description,
    case when p_idempotency_key is not null
      then coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object('idempotency_key', p_idempotency_key)
      else coalesce(p_metadata, '{}'::jsonb)
    end
  );

  v_result := public.build_settlement_result(true, v_remaining - p_amount_microusd, null, null,
    v_daily_limit, v_daily_used + p_amount_microusd,
    greatest(0::bigint, v_daily_limit - v_daily_used - p_amount_microusd),
    greatest(0::numeric, v_hours_until_reset));

  if p_idempotency_key is not null then
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
  end if;

  return query select
    true, v_remaining - p_amount_microusd,
    null::text, null::text,
    v_daily_limit, v_daily_used + p_amount_microusd,
    greatest(0::bigint, v_daily_limit - v_daily_used - p_amount_microusd),
    greatest(0::numeric, v_hours_until_reset);
end;
$$;

revoke all on function public.deduct_credits_microusd(text, bigint, text, jsonb, text) from public;
grant execute on function public.deduct_credits_microusd(text, bigint, text, jsonb, text)
  to app_rls;

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
begin
  return query select
    deduction.success,
    public.microusd_to_cents_mirror(deduction.remaining_microusd),
    deduction.error,
    deduction.code,
    public.microusd_to_cents_mirror(deduction.daily_limit_microusd),
    public.microusd_to_cents_mirror(deduction.daily_used_microusd),
    public.microusd_to_cents_mirror(deduction.daily_remaining_microusd),
    deduction.reset_in_hours
  from public.deduct_credits_microusd(
    p_user_id, p_amount_cents::bigint * 10000, p_description, p_metadata, p_idempotency_key
  ) deduction;
end;
$$;

commit;

begin;

create or replace function public.settle_managed_usage_credits_microusd(
  p_user_id text,
  p_amount_microusd bigint,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table(
  success boolean,
  remaining_microusd bigint,
  error text,
  code text,
  daily_limit_microusd bigint,
  daily_used_microusd bigint,
  daily_remaining_microusd bigint,
  reset_in_hours numeric
)
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_existing_result jsonb;
  v_result jsonb;
  v_remaining bigint;
  v_request_id text;
  v_operation_key text;
  v_operation_type text;
  v_expected_key text;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_amount_microusd is null then
    raise exception using errcode = '22023', message = 'managed usage amount is required';
  end if;
  if p_idempotency_key is null
    or length(p_idempotency_key) < 1
    or length(p_idempotency_key) > 255 then
    raise exception using errcode = '22023', message = 'valid idempotency_key is required';
  end if;

  v_operation_type := coalesce(p_metadata->>'type', '');
  v_request_id := coalesce(p_metadata->>'managed_usage_request_id', '');
  v_operation_key := coalesce(p_metadata->>'operation_key', '');

  if v_operation_type not in (
    'managed_usage_reservation',
    'managed_usage_extension',
    'managed_usage_finalization',
    'managed_usage_outcome_unknown'
  ) or v_request_id = '' then
    raise exception using errcode = '22023', message = 'invalid managed usage settlement metadata';
  end if;

  v_expected_key := case
    when v_operation_type = 'managed_usage_reservation'
      then 'managed-reserve:' || v_request_id
    when v_operation_type = 'managed_usage_extension'
      and v_operation_key ~ '^provider:[1-9][0-9]{0,8}$'
      then 'managed-extend:' || v_request_id || ':' || v_operation_key
    else 'managed-final:' || v_request_id
  end;
  if p_idempotency_key is distinct from v_expected_key then
    raise exception using errcode = '22023', message = 'invalid managed usage settlement key';
  end if;
  if not exists (
    select 1
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.id::text = v_request_id
  ) then
    raise exception using errcode = '22023', message = 'managed usage request not found';
  end if;

  select key_row.result into v_existing_result
  from public.credit_idempotency_keys key_row
  where key_row.idempotency_key = p_idempotency_key
    and key_row.user_id = p_user_id
    and key_row.expires_at > now();

  if v_existing_result is not null then
    return query select
      (v_existing_result->>'success')::boolean,
      public.settlement_result_microusd(v_existing_result, 'remaining_microusd', 'remaining_cents'),
      v_existing_result->>'error',
      v_existing_result->>'code',
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.period_start <= now()
    and account_row.period_end > now()
  order by account_row.period_end desc
  limit 1
  for update;

  if v_account is null then
    v_result := public.build_settlement_result(false, 0, 'no active credit account found',
      'NO_ACCOUNT', 0, 0, 0, 0::numeric);
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false, 0::bigint, 'no active credit account found'::text, 'NO_ACCOUNT'::text,
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  v_remaining := v_account.credits_allocated_microusd - v_account.credits_used_microusd;

  if p_amount_microusd > 0 and v_remaining < p_amount_microusd then
    v_result := public.build_settlement_result(false, v_remaining,
      'billing period credit limit exceeded', 'BILLING_PERIOD_LIMIT_REACHED',
      0, 0, 0, 0::numeric);
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false,
      v_remaining,
      'billing period credit limit exceeded'::text,
      'BILLING_PERIOD_LIMIT_REACHED'::text,
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  -- A negative reconciliation may only release a reservation that has already
  -- contributed to this billing-period ledger. Failing closed prevents a bad
  -- retry or forged payload from manufacturing account credit.
  if p_amount_microusd < 0 and v_account.credits_used_microusd < -p_amount_microusd then
    v_result := public.build_settlement_result(false, v_remaining,
      'managed usage release exceeds settled usage', 'INVALID_MANAGED_USAGE_RELEASE',
      0, 0, 0, 0::numeric);
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false,
      v_remaining,
      'managed usage release exceeds settled usage'::text,
      'INVALID_MANAGED_USAGE_RELEASE'::text,
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  update public.token_credits account_row
  set credits_used_microusd = account_row.credits_used_microusd + p_amount_microusd,
      credits_used_cents = public.microusd_to_cents_mirror(
        account_row.credits_used_microusd + p_amount_microusd
      ),
      updated_at = now()
  where account_row.id = v_account.id;

  insert into public.credit_transactions (
    user_id,
    credit_account_id,
    transaction_type,
    amount_microusd,
    amount_cents,
    description,
    metadata
  ) values (
    p_user_id,
    v_account.id,
    'deduction',
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('idempotency_key', p_idempotency_key)
  );

  v_result := public.build_settlement_result(true, v_remaining - p_amount_microusd, null, null,
    0, 0, 0, 0::numeric);
  insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
  values (p_idempotency_key, p_user_id, v_result)
  on conflict (idempotency_key) do nothing;

  return query select
    true,
    v_remaining - p_amount_microusd,
    null::text,
    null::text,
    0::bigint, 0::bigint, 0::bigint, 0::numeric;
end;
$$;

revoke all on function public.settle_managed_usage_credits_microusd(
  text, bigint, text, jsonb, text
) from public;
grant execute on function public.settle_managed_usage_credits_microusd(
  text, bigint, text, jsonb, text
) to app_rls;

create or replace function public.settle_managed_usage_credits(
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
begin
  return query select
    settlement.success,
    public.microusd_to_cents_mirror(settlement.remaining_microusd),
    settlement.error,
    settlement.code,
    public.microusd_to_cents_mirror(settlement.daily_limit_microusd),
    public.microusd_to_cents_mirror(settlement.daily_used_microusd),
    public.microusd_to_cents_mirror(settlement.daily_remaining_microusd),
    settlement.reset_in_hours
  from public.settle_managed_usage_credits_microusd(
    p_user_id, p_amount_cents::bigint * 10000, p_description, p_metadata, p_idempotency_key
  ) settlement;
end;
$$;

create or replace function public.enqueue_credit_settlement_microusd(
  p_user_id text,
  p_amount_microusd bigint,
  p_description text,
  p_metadata jsonb,
  p_idempotency_key text
)
returns table(
  settlement_status text,
  deduction_success boolean,
  remaining_microusd bigint,
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
    amount_microusd,
    amount_cents,
    description,
    metadata
  ) values (
    p_user_id,
    p_idempotency_key,
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key) do nothing;

  select job.* into v_job
  from public.credit_settlement_jobs job
  where job.user_id = p_user_id
    and job.idempotency_key = p_idempotency_key
  for update;

  if v_job.amount_microusd is distinct from p_amount_microusd
    or v_job.description is distinct from p_description
    or v_job.metadata is distinct from coalesce(p_metadata, '{}'::jsonb) then
    return query select
      'terminal'::text,
      false,
      null::bigint,
      'IDEMPOTENCY_CONFLICT'::text,
      'idempotency key was reused with a different settlement payload'::text,
      v_job.attempt_count;
    return;
  end if;

  if v_job.status in ('succeeded', 'terminal') then
    return query select
      v_job.status,
      coalesce((v_job.result->>'success')::boolean, false),
      case
        when v_job.result is null then null::bigint
        else public.settlement_result_microusd(
          v_job.result, 'remaining_microusd', 'remaining_cents'
        )
      end,
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
      null::bigint,
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
    if coalesce(p_metadata->>'type', '') in (
      'managed_usage_reservation',
      'managed_usage_extension',
      'managed_usage_finalization',
      'managed_usage_outcome_unknown'
    ) then
      select deduction.* into v_deduction
      from public.settle_managed_usage_credits_microusd(
        p_user_id,
        p_amount_microusd,
        p_description,
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key
      ) deduction;
    else
      select deduction.* into v_deduction
      from public.deduct_credits_microusd(
        p_user_id,
        p_amount_microusd,
        p_description,
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key
      ) deduction;
    end if;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'credit settlement returned no result';
    end if;

    v_result := public.build_settlement_result(
      v_deduction.success,
      v_deduction.remaining_microusd,
      v_deduction.error,
      v_deduction.code,
      v_deduction.daily_limit_microusd,
      v_deduction.daily_used_microusd,
      v_deduction.daily_remaining_microusd,
      v_deduction.reset_in_hours
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
        v_deduction.remaining_microusd,
        null::text,
        null::text,
        v_attempt;
      return;
    end if;

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
      v_deduction.remaining_microusd,
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
        null::bigint,
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
      null::bigint,
      v_terminal_code,
      v_message,
      v_attempt;
    return;
  end;
end;
$$;

revoke all on function public.enqueue_credit_settlement_microusd(
  text, bigint, text, jsonb, text
) from public;
grant execute on function public.enqueue_credit_settlement_microusd(
  text, bigint, text, jsonb, text
) to app_rls;

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
begin
  return query select
    settlement.settlement_status,
    settlement.deduction_success,
    public.microusd_to_cents_mirror(settlement.remaining_microusd),
    settlement.error_code,
    settlement.error_message,
    settlement.attempts
  from public.enqueue_credit_settlement_microusd(
    p_user_id, p_amount_cents::bigint * 10000, p_description, p_metadata, p_idempotency_key
  ) settlement;
end;
$$;

commit;

begin;

-- Reproduces 0178's body in microUSD. The lease window, the immutability of
-- request hash/provider/model, and the acquired/in_progress/declined decision
-- table are unchanged; only the unit of the estimate moves.
create or replace function public.reserve_managed_usage_request_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_microusd bigint,
  p_lease_token text,
  p_lease_seconds integer default 900
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
  v_request public.managed_usage_requests%rowtype;
  v_settlement record;
  v_lease_seconds integer;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_idempotency_key is null
    or length(p_idempotency_key) < 8
    or length(p_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid request hash';
  end if;
  if p_provider is null or btrim(p_provider) = ''
    or p_model is null or btrim(p_model) = ''
    or p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0
    or p_lease_token is null or length(p_lease_token) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid managed usage reservation';
  end if;

  v_lease_seconds := greatest(60, least(coalesce(p_lease_seconds, 900), 21600));

  insert into public.managed_usage_requests (
    user_id,
    idempotency_key,
    request_hash,
    provider,
    model,
    estimated_cost_microusd,
    estimated_cost_cents,
    lease_token,
    lease_expires_at
  ) values (
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_microusd,
    public.microusd_to_cents_mirror(p_estimated_cost_microusd),
    p_lease_token,
    now() + make_interval(secs => v_lease_seconds)
  )
  on conflict (user_id, idempotency_key) do nothing;

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'managed usage reservation unavailable';
  end if;

  if v_request.request_hash is distinct from p_request_hash
    or v_request.provider is distinct from p_provider
    or v_request.model is distinct from p_model then
    return query select
      'conflict'::text,
      v_request.status,
      null::text,
      v_request.estimated_cost_microusd,
      v_request.reservation_settlement_status,
      'IDEMPOTENCY_CONFLICT'::text;
    return;
  end if;

  if v_request.status in ('completed', 'released', 'outcome_unknown', 'declined') then
    return query select
      v_request.status,
      v_request.status,
      null::text,
      v_request.estimated_cost_microusd,
      coalesce(v_request.final_settlement_status, v_request.reservation_settlement_status),
      v_request.final_error_code;
    return;
  end if;

  if v_request.status in ('reserved', 'provider_started') then
    if v_request.lease_token = p_lease_token
      and v_request.lease_expires_at > now() then
      return query select
        'acquired'::text,
        'reserved'::text,
        v_request.lease_token,
        v_request.estimated_cost_microusd,
        v_request.reservation_settlement_status,
        null::text;
    else
      return query select
        'in_progress'::text,
        v_request.status,
        null::text,
        v_request.estimated_cost_microusd,
        v_request.reservation_settlement_status,
        null::text;
    end if;
    return;
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement_microusd(
    p_user_id,
    v_request.estimated_cost_microusd,
    'Managed usage reservation: ' || v_request.provider || '/' || v_request.model,
    jsonb_build_object(
      'type', 'managed_usage_reservation',
      'managed_usage_request_id', v_request.id,
      'provider', v_request.provider,
      'model', v_request.model
    ),
    'managed-reserve:' || v_request.id::text
  ) settlement;

  if not found then
    raise exception using errcode = 'P0001', message = 'managed usage reservation returned no result';
  end if;

  if v_settlement.settlement_status = 'succeeded'
    and v_settlement.deduction_success then
    update public.managed_usage_requests request_row
    set status = 'reserved',
        lease_token = p_lease_token,
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        reservation_settlement_status = 'succeeded',
        final_error_code = null,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'acquired'::text,
      'reserved'::text,
      p_lease_token,
      v_request.estimated_cost_microusd,
      'succeeded'::text,
      null::text;
    return;
  end if;

  if v_settlement.settlement_status = 'pending' then
    update public.managed_usage_requests request_row
    set reservation_settlement_status = 'pending',
        final_error_code = v_settlement.error_code,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'unavailable'::text,
      'reserving'::text,
      null::text,
      v_request.estimated_cost_microusd,
      'pending'::text,
      v_settlement.error_code;
    return;
  end if;

  update public.managed_usage_requests request_row
  set status = 'declined',
      reservation_settlement_status = 'terminal',
      final_error_code = coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS'),
      finalized_at = now(),
      updated_at = now()
  where request_row.id = v_request.id;

  return query select
    'declined'::text,
    'declined'::text,
    null::text,
    v_request.estimated_cost_microusd,
    'terminal'::text,
    coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS')::text;
end;
$$;

revoke all on function public.reserve_managed_usage_request_microusd(
  text, text, text, text, text, bigint, text, integer
) from public;
grant execute on function public.reserve_managed_usage_request_microusd(
  text, text, text, text, text, bigint, text, integer
) to app_rls;

create or replace function public.reserve_managed_usage_request(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_cents integer,
  p_lease_token text,
  p_lease_seconds integer default 900
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
as $$
begin
  return query select
    reservation.reservation_decision,
    reservation.request_status,
    reservation.lease_token,
    public.microusd_to_cents_mirror(reservation.estimated_cost_microusd),
    reservation.settlement_status,
    reservation.error_code
  from public.reserve_managed_usage_request_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_cents::bigint * 10000,
    p_lease_token,
    p_lease_seconds
  ) reservation;
end;
$$;

-- Reproduces 0152's null/zero cap contract in microUSD:
--   cap IS NULL -> the tier declares itself uncapped, no ceiling applied
--   cap = 0     -> deny every reservation against the paid ledger
--   cap > 0     -> that ceiling
-- The rolling windows sum amount_microusd, which is the only column that can
-- represent a sub-cent turn; summing the cents mirror would round each row.
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

comment on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) is
  'Atomically enforces private rolling spend ceilings in microUSD and delegates the durable managed usage lifecycle.';

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
  p_is_flagship boolean,
  p_top_up_headroom_cents integer default 0
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
begin
  return query select
    reservation.reservation_decision,
    reservation.request_status,
    reservation.lease_token,
    public.microusd_to_cents_mirror(reservation.estimated_cost_microusd),
    reservation.settlement_status,
    reservation.error_code
  from public.reserve_managed_usage_request_with_limits_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_cents::bigint * 10000,
    p_lease_token,
    p_lease_seconds,
    p_session_cap_cents::bigint * 10000,
    p_weekly_cap_cents::bigint * 10000,
    p_flagship_weekly_cap_cents::bigint * 10000,
    p_is_flagship,
    coalesce(p_top_up_headroom_cents, 0)::bigint * 10000
  ) reservation;
end;
$function$;

commit;

begin;

create or replace function public.extend_managed_usage_request_provider_step_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_operation_key text,
  p_estimated_cost_microusd bigint,
  p_session_cap_microusd bigint,
  p_weekly_cap_microusd bigint,
  p_flagship_weekly_cap_microusd bigint,
  p_is_flagship boolean
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
  v_extension public.managed_usage_request_extensions%rowtype;
  v_settlement record;
  v_session_used bigint := 0;
  v_weekly_used bigint := 0;
  v_flagship_weekly_used bigint := 0;
  v_renewed_lease timestamptz;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_operation_key is null
    or p_operation_key !~ '^provider:[1-9][0-9]{0,8}$'
    or p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0
    or (p_session_cap_microusd is not null and p_session_cap_microusd < 0)
    or (p_weekly_cap_microusd is not null and p_weekly_cap_microusd < 0)
    or (p_flagship_weekly_cap_microusd is not null and p_flagship_weekly_cap_microusd < 0)
    or p_is_flagship is null then
    raise exception using errcode = '22023', message = 'invalid provider-step reservation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found
    or v_request.request_hash is distinct from p_request_hash
    or v_request.lease_token is distinct from p_lease_token
    or v_request.is_flagship is distinct from p_is_flagship
    or v_request.status <> 'provider_started'
    or v_request.lease_expires_at <= now() then
    return query select
      'conflict'::text,
      coalesce(v_request.status, 'unknown')::text,
      coalesce(v_request.estimated_cost_microusd, 0)::bigint,
      null::text,
      'STATE_CONFLICT'::text;
    return;
  end if;

  -- 0178's renewal, reproduced: reaching here proves the turn is still
  -- executing, so its lease moves out at least an hour, never shortening a
  -- longer window a caller reserved up front, and never past the absolute
  -- ceiling measured from creation.
  update public.managed_usage_requests request_row
  set lease_expires_at = least(
        greatest(
          request_row.lease_expires_at,
          now() + make_interval(secs => 3600)
        ),
        request_row.created_at + make_interval(secs => 86400)
      ),
      updated_at = now()
  where request_row.id = v_request.id
  returning request_row.lease_expires_at into v_renewed_lease;
  v_request.lease_expires_at := v_renewed_lease;

  if v_request.initial_provider_operation_key is null then
    update public.managed_usage_requests request_row
    set initial_provider_operation_key = p_operation_key,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'covered'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_request.reservation_settlement_status,
      null::text;
    return;
  end if;

  if v_request.initial_provider_operation_key = p_operation_key then
    return query select
      'covered'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_request.reservation_settlement_status,
      null::text;
    return;
  end if;

  insert into public.managed_usage_request_extensions (
    request_id,
    user_id,
    operation_key,
    estimated_cost_microusd,
    estimated_cost_cents
  ) values (
    v_request.id,
    p_user_id,
    p_operation_key,
    p_estimated_cost_microusd,
    public.microusd_to_cents_mirror(p_estimated_cost_microusd)
  ) on conflict (request_id, operation_key) do nothing;

  select extension_row.* into v_extension
  from public.managed_usage_request_extensions extension_row
  where extension_row.request_id = v_request.id
    and extension_row.operation_key = p_operation_key
  for update;

  if not found
    or v_extension.estimated_cost_microusd is distinct from p_estimated_cost_microusd then
    return query select
      'conflict'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_extension.settlement_status,
      'IDEMPOTENCY_CONFLICT'::text;
    return;
  end if;

  if v_extension.status = 'extended' then
    return query select
      'already_extended'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_extension.settlement_status,
      null::text;
    return;
  end if;

  if v_extension.status = 'declined' then
    return query select
      case v_extension.error_code
        when 'ROLLING_FIVE_HOUR_LIMIT_REACHED' then 'session_limit'
        when 'ROLLING_WEEKLY_LIMIT_REACHED' then 'weekly_limit'
        when 'FLAGSHIP_WEEKLY_LIMIT_REACHED' then 'flagship_weekly_limit'
        else 'declined'
      end,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_extension.settlement_status,
      v_extension.error_code;
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
    update public.managed_usage_request_extensions extension_row
    set status = 'declined',
        error_code = 'ROLLING_FIVE_HOUR_LIMIT_REACHED',
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'session_limit'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      null::text,
      'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
    return;
  end if;

  if p_weekly_cap_microusd is not null
    and v_weekly_used + p_estimated_cost_microusd > p_weekly_cap_microusd then
    update public.managed_usage_request_extensions extension_row
    set status = 'declined',
        error_code = 'ROLLING_WEEKLY_LIMIT_REACHED',
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'weekly_limit'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      null::text,
      'ROLLING_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_microusd is not null
    and v_flagship_weekly_used + p_estimated_cost_microusd
        > p_flagship_weekly_cap_microusd then
    update public.managed_usage_request_extensions extension_row
    set status = 'declined',
        error_code = 'FLAGSHIP_WEEKLY_LIMIT_REACHED',
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'flagship_weekly_limit'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      null::text,
      'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement_microusd(
    p_user_id,
    p_estimated_cost_microusd,
    'Managed usage provider-step reservation',
    jsonb_build_object(
      'type', 'managed_usage_extension',
      'managed_usage_request_id', v_request.id,
      'provider', v_request.provider,
      'model', v_request.model,
      'operation_key', p_operation_key
    ),
    'managed-extend:' || v_request.id::text || ':' || p_operation_key
  ) settlement;

  if not found then
    raise exception using errcode = 'P0001', message = 'provider-step reservation returned no result';
  end if;

  if v_settlement.settlement_status = 'succeeded'
    and v_settlement.deduction_success then
    update public.managed_usage_requests request_row
    set estimated_cost_microusd =
          request_row.estimated_cost_microusd + p_estimated_cost_microusd,
        estimated_cost_cents = public.microusd_to_cents_mirror(
          request_row.estimated_cost_microusd + p_estimated_cost_microusd
        ),
        updated_at = now()
    where request_row.id = v_request.id
    returning request_row.estimated_cost_microusd into v_request.estimated_cost_microusd;

    update public.managed_usage_request_extensions extension_row
    set status = 'extended',
        settlement_status = 'succeeded',
        error_code = null,
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'extended'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      'succeeded'::text,
      null::text;
    return;
  end if;

  if v_settlement.settlement_status = 'pending' then
    update public.managed_usage_request_extensions extension_row
    set settlement_status = 'pending',
        error_code = v_settlement.error_code,
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'unavailable'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      'pending'::text,
      v_settlement.error_code;
    return;
  end if;

  update public.managed_usage_request_extensions extension_row
  set status = 'declined',
      settlement_status = 'terminal',
      error_code = coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS'),
      updated_at = now()
  where extension_row.request_id = v_request.id
    and extension_row.operation_key = p_operation_key;

  return query select
    'declined'::text,
    v_request.status,
    v_request.estimated_cost_microusd,
    'terminal'::text,
    coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS')::text;
end;
$$;

revoke all on function public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean
) from public;
grant execute on function public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean
) to app_rls;

comment on function public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean
) is
  'Idempotently reserves each provider operation in microUSD under the original tenant, request, lease, rolling caps, and billing-period balance, renewing the lease as 0178 requires.';

create or replace function public.extend_managed_usage_request_provider_step(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_operation_key text,
  p_estimated_cost_cents integer,
  p_session_cap_cents integer,
  p_weekly_cap_cents integer,
  p_flagship_weekly_cap_cents integer,
  p_is_flagship boolean
)
returns table(
  extension_decision text,
  request_status text,
  estimated_cost_cents integer,
  settlement_status text,
  error_code text
)
language plpgsql
as $$
begin
  return query select
    extension.extension_decision,
    extension.request_status,
    public.microusd_to_cents_mirror(extension.estimated_cost_microusd),
    extension.settlement_status,
    extension.error_code
  from public.extend_managed_usage_request_provider_step_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_lease_token,
    p_operation_key,
    p_estimated_cost_cents::bigint * 10000,
    p_session_cap_cents::bigint * 10000,
    p_weekly_cap_cents::bigint * 10000,
    p_flagship_weekly_cap_cents::bigint * 10000,
    p_is_flagship
  ) extension;
end;
$$;

create or replace function public.finalize_managed_usage_request_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_outcome text,
  p_actual_cost_microusd bigint,
  p_usage jsonb
)
returns table(
  request_status text,
  operation_result text,
  settlement_status text,
  actual_cost_microusd bigint,
  error_code text
)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_settlement record;
  v_delta bigint;
  v_final_status text;
  v_settled bigint;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_outcome not in ('completed', 'failed')
    or p_actual_cost_microusd is null or p_actual_cost_microusd < 0 then
    raise exception using errcode = '22023', message = 'invalid managed usage finalization';
  end if;

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found
    or v_request.request_hash is distinct from p_request_hash
    or v_request.lease_token is distinct from p_lease_token then
    return query select
      'unknown'::text, 'conflict'::text, null::text, 0::bigint, 'STATE_CONFLICT'::text;
    return;
  end if;

  -- First terminal transition wins. Reordered/duplicate completion, failure,
  -- disconnect, and timeout callbacks can only observe the stored result.
  if v_request.status in ('completed', 'released', 'outcome_unknown') then
    return query select
      v_request.status,
      'already_finalized'::text,
      v_request.final_settlement_status,
      coalesce(v_request.actual_cost_microusd, 0),
      v_request.final_error_code;
    return;
  end if;

  if v_request.status not in ('reserved', 'provider_started')
    or (p_outcome = 'completed' and v_request.status <> 'provider_started') then
    return query select
      v_request.status,
      'conflict'::text,
      v_request.final_settlement_status,
      coalesce(v_request.actual_cost_microusd, 0),
      'STATE_CONFLICT'::text;
    return;
  end if;

  if p_outcome = 'completed' then
    v_delta := p_actual_cost_microusd - v_request.estimated_cost_microusd;
    v_final_status := 'completed';
    v_settled := p_actual_cost_microusd;
  else
    v_delta := -v_request.estimated_cost_microusd;
    v_final_status := 'released';
    v_settled := 0;
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement_microusd(
    p_user_id,
    v_delta,
    case
      when p_outcome = 'completed' then 'Managed usage actual-cost reconciliation'
      else 'Managed usage reservation release'
    end,
    jsonb_build_object(
      'type', 'managed_usage_finalization',
      'managed_usage_request_id', v_request.id,
      'provider', v_request.provider,
      'model', v_request.model,
      'outcome', p_outcome,
      'estimated_cost_microusd', v_request.estimated_cost_microusd,
      'actual_cost_microusd', v_settled,
      'estimated_cost_cents',
        public.microusd_to_cents_mirror(v_request.estimated_cost_microusd),
      'actual_cost_cents', public.microusd_to_cents_mirror(v_settled),
      'usage', coalesce(p_usage, '{}'::jsonb)
    ),
    'managed-final:' || v_request.id::text
  ) settlement;

  if not found then
    raise exception using errcode = 'P0001', message = 'managed usage finalization returned no result';
  end if;

  update public.managed_usage_requests request_row
  set status = v_final_status,
      actual_cost_microusd = v_settled,
      actual_cost_cents = public.microusd_to_cents_mirror(v_settled),
      usage = coalesce(p_usage, '{}'::jsonb),
      provider_succeeded_at = case
        when p_outcome = 'completed' then coalesce(request_row.provider_succeeded_at, now())
        else request_row.provider_succeeded_at
      end,
      final_settlement_status = v_settlement.settlement_status,
      final_error_code = v_settlement.error_code,
      finalized_at = now(),
      updated_at = now()
  where request_row.id = v_request.id;

  return query select
    v_final_status,
    'finalized'::text,
    v_settlement.settlement_status,
    v_settled,
    v_settlement.error_code;
end;
$$;

revoke all on function public.finalize_managed_usage_request_microusd(
  text, text, text, text, text, bigint, jsonb
) from public;
grant execute on function public.finalize_managed_usage_request_microusd(
  text, text, text, text, text, bigint, jsonb
) to app_rls;

create or replace function public.finalize_managed_usage_request(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_outcome text,
  p_actual_cost_cents integer,
  p_usage jsonb
)
returns table(
  request_status text,
  operation_result text,
  settlement_status text,
  actual_cost_cents integer,
  error_code text
)
language plpgsql
as $$
begin
  return query select
    finalization.request_status,
    finalization.operation_result,
    finalization.settlement_status,
    public.microusd_to_cents_mirror(finalization.actual_cost_microusd),
    finalization.error_code
  from public.finalize_managed_usage_request_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_lease_token,
    p_outcome,
    p_actual_cost_cents::bigint * 10000,
    p_usage
  ) finalization;
end;
$$;

-- Cron-only. Redefined in place rather than given a microUSD twin: nothing
-- passes it an amount, so its signature does not carry a unit.
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

commit;

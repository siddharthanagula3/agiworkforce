-- =============================================================================
-- Migration 0299: dispute outcomes, plan refunds and refund requests
--
-- Why    : a chargeback revoked the plan and the whole balance through
--          deduct_credits, which the 30% daily flagship limit refused for most
--          balances, and nothing ever put a won dispute back. A plan refund
--          revoked the refunded money amount as if it were ledger cents, taking
--          purchased credits with it. A customer could only ask for a refund by
--          email.
--
-- Shape  : billing_disputes is one row per Stripe dispute: what the opening
--          revoked (the credit period, the balance and its purchased part, and
--          the subscription state before it), and how it closed. The opening
--          hold is applied once, keyed on revoked_at, and a won dispute restores
--          exactly that once, keyed on restored_at.
--          revoke_disputed_credits_microusd and restore_disputed_credits_microusd
--          post those two movements; revoke_plan_allowance_microusd takes a
--          plan refund from the plan part of the refunded period only.
--          billing_refund_requests is what a customer asked for, how it was
--          assessed, and the decision, automatic or by an operator.
--
-- Access : the webhook and the operator console write on the owner connection.
--          A customer reads their own disputes, and reads and files their own
--          refund requests; they never write a decision.
--
-- Depends: 0004 (credit_transactions, token_credits), 0037 (profiles,
--          current_app_user_id), 0182 (microUSD ledger)
-- =============================================================================

begin;

create table if not exists public.billing_disputes (
  id text primary key check (char_length(id) between 3 and 255),
  user_id text references public.profiles(id) on delete set null,
  stripe_customer_id text
    check (stripe_customer_id is null or char_length(stripe_customer_id) between 3 and 255),
  charge_id text not null check (char_length(charge_id) between 3 and 255),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  reason text check (reason is null or char_length(reason) between 1 and 64),
  stripe_status text not null check (char_length(stripe_status) between 1 and 64),
  outcome text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  revoked_account_id uuid,
  revoked_credits_microusd bigint not null default 0 check (revoked_credits_microusd >= 0),
  revoked_top_up_microusd bigint not null default 0 check (revoked_top_up_microusd >= 0),
  prior_subscription_status text,
  prior_cancel_at_period_end boolean,
  opened_at timestamptz not null,
  revoked_at timestamptz,
  closed_at timestamptz,
  restored_at timestamptz,
  restored_credits_microusd bigint
    check (restored_credits_microusd is null or restored_credits_microusd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_disputes_top_up_within_revocation
    check (revoked_top_up_microusd <= revoked_credits_microusd),
  constraint billing_disputes_closed_when_decided
    check ((outcome = 'open') = (closed_at is null)),
  constraint billing_disputes_restoration_is_whole
    check ((restored_at is null) = (restored_credits_microusd is null))
);

create index if not exists idx_billing_disputes_user
  on public.billing_disputes (user_id, opened_at desc);
create index if not exists idx_billing_disputes_open_customer
  on public.billing_disputes (stripe_customer_id)
  where outcome = 'open';

alter table public.billing_disputes enable row level security;
alter table public.billing_disputes force row level security;

drop policy if exists billing_disputes_owner_read on public.billing_disputes;
create policy billing_disputes_owner_read
  on public.billing_disputes for select to app_rls
  using (user_id = (select public.current_app_user_id()));

revoke all on public.billing_disputes from app_rls;
grant select on public.billing_disputes to app_rls;

create table if not exists public.billing_refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  charge_id text not null check (char_length(charge_id) between 3 and 255),
  charge_kind text not null check (charge_kind in ('plan', 'top_up')),
  charge_amount_cents bigint not null check (charge_amount_cents > 0),
  charge_currency text not null check (charge_currency ~ '^[a-z]{3}$'),
  charge_created_at timestamptz not null,
  reason text not null check (reason in (
    'accidental_purchase', 'not_as_expected', 'technical_problem',
    'duplicate_charge', 'unrecognized_charge', 'statutory_withdrawal', 'other'
  )),
  details text check (details is null or char_length(details) <= 2000),
  statutory_withdrawal boolean not null default false,
  billing_country text check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  assessment text not null check (assessment in (
    'statutory_withdrawal', 'unused_within_policy', 'needs_review'
  )),
  status text not null default 'pending' check (status in ('pending', 'refunded', 'declined')),
  refund_amount_cents bigint check (refund_amount_cents is null or refund_amount_cents > 0),
  stripe_refund_id text
    check (stripe_refund_id is null or char_length(stripe_refund_id) between 3 and 255),
  decided_by text check (decided_by is null or decided_by in ('automatic', 'operator')),
  decided_by_user_id text,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_refund_requests_decision_is_whole
    check ((status = 'pending') = (decided_at is null) and (decided_at is null) = (decided_by is null)),
  constraint billing_refund_requests_refund_is_recorded
    check (status <> 'refunded' or (stripe_refund_id is not null and refund_amount_cents is not null))
);

create unique index if not exists idx_billing_refund_requests_one_per_charge
  on public.billing_refund_requests (charge_id)
  where status in ('pending', 'refunded');
create index if not exists idx_billing_refund_requests_user
  on public.billing_refund_requests (user_id, created_at desc);
create index if not exists idx_billing_refund_requests_pending
  on public.billing_refund_requests (created_at)
  where status = 'pending';

alter table public.billing_refund_requests enable row level security;
alter table public.billing_refund_requests force row level security;

drop policy if exists billing_refund_requests_owner_read on public.billing_refund_requests;
create policy billing_refund_requests_owner_read
  on public.billing_refund_requests for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists billing_refund_requests_owner_file on public.billing_refund_requests;
create policy billing_refund_requests_owner_file
  on public.billing_refund_requests for insert to app_rls
  with check (
    user_id = (select public.current_app_user_id())
    and status = 'pending'
    and decided_at is null
    and stripe_refund_id is null
    and refund_amount_cents is null
  );

revoke all on public.billing_refund_requests from app_rls;
grant select, insert on public.billing_refund_requests to app_rls;

create unique index if not exists idx_credit_transactions_dispute_postings
  on public.credit_transactions (user_id, description)
  where transaction_type = 'adjustment'
    and (description like 'Dispute revocation %' or description like 'Dispute restoration %');

create or replace function public.revoke_disputed_credits_microusd(
  p_user_id text,
  p_dispute_id text
)
returns table (account_id uuid, revoked_microusd bigint, top_up_microusd bigint)
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_remaining bigint;
  v_top_up bigint;
begin
  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.period_end > now()
  order by account_row.period_end desc
  limit 1
  for update;

  if v_account.id is null then
    return query select null::uuid, 0::bigint, 0::bigint;
    return;
  end if;

  v_remaining := greatest(v_account.credits_allocated_microusd - v_account.credits_used_microusd, 0);
  v_top_up := least(v_account.top_up_allocated_microusd, v_remaining);

  if v_remaining > 0 then
    update public.token_credits
    set credits_used_microusd = credits_used_microusd + v_remaining,
        credits_used_cents =
          public.microusd_to_cents_mirror(credits_used_microusd + v_remaining),
        updated_at = now()
    where id = v_account.id;

    insert into public.credit_transactions (
      user_id, credit_account_id, transaction_type,
      amount_microusd, amount_cents, description, metadata
    ) values (
      p_user_id,
      v_account.id,
      'adjustment',
      -v_remaining,
      public.microusd_to_cents_mirror(-v_remaining),
      'Dispute revocation ' || p_dispute_id,
      jsonb_build_object('dispute_id', p_dispute_id, 'top_up_microusd', v_top_up)
    );
  end if;

  return query select v_account.id, v_remaining, v_top_up;
end;
$$;

revoke all on function public.revoke_disputed_credits_microusd(text, text) from public;

create or replace function public.restore_disputed_credits_microusd(
  p_user_id text,
  p_dispute_id text,
  p_account_id uuid,
  p_revoked_microusd bigint,
  p_top_up_microusd bigint
)
returns bigint
language plpgsql
as $$
declare
  v_latest public.token_credits%rowtype;
  v_same_period boolean;
  v_restored bigint;
begin
  if p_revoked_microusd < 0 or p_top_up_microusd < 0 or p_top_up_microusd > p_revoked_microusd then
    raise exception 'invalid dispute restoration amounts';
  end if;

  select account_row.* into v_latest
  from public.token_credits account_row
  where account_row.user_id = p_user_id
  order by account_row.period_end desc
  limit 1
  for update;

  if v_latest.id is null then
    return 0;
  end if;

  v_same_period := v_latest.id = p_account_id;

  if v_same_period then
    v_restored := least(p_revoked_microusd, v_latest.credits_used_microusd);
    update public.token_credits
    set credits_used_microusd = credits_used_microusd - v_restored,
        credits_used_cents =
          public.microusd_to_cents_mirror(credits_used_microusd - v_restored),
        updated_at = now()
    where id = v_latest.id;
  else
    v_restored := p_top_up_microusd;
    update public.token_credits
    set credits_allocated_microusd = credits_allocated_microusd + v_restored,
        credits_allocated_cents =
          public.microusd_to_cents_mirror(credits_allocated_microusd + v_restored),
        top_up_allocated_microusd = top_up_allocated_microusd + v_restored,
        top_up_allocated_cents =
          public.microusd_to_cents_mirror(top_up_allocated_microusd + v_restored),
        updated_at = now()
    where id = v_latest.id;
  end if;

  if v_restored > 0 then
    insert into public.credit_transactions (
      user_id, credit_account_id, transaction_type,
      amount_microusd, amount_cents, description, metadata
    ) values (
      p_user_id,
      v_latest.id,
      'adjustment',
      v_restored,
      public.microusd_to_cents_mirror(v_restored),
      'Dispute restoration ' || p_dispute_id,
      jsonb_build_object(
        'dispute_id', p_dispute_id,
        'same_period', v_same_period,
        'revoked_account_id', p_account_id
      )
    );
  end if;

  return v_restored;
end;
$$;

revoke all on function public.restore_disputed_credits_microusd(text, text, uuid, bigint, bigint)
  from public;

create or replace function public.revoke_plan_allowance_microusd(
  p_user_id text,
  p_account_id uuid,
  p_amount_microusd bigint,
  p_reason text
)
returns bigint
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_remaining bigint;
  v_plan_remaining bigint;
  v_revoked bigint;
begin
  if p_amount_microusd <= 0 then
    raise exception 'plan refund amount must be positive';
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.id = p_account_id
    and account_row.user_id = p_user_id
  for update;

  if v_account.id is null then
    return 0;
  end if;

  v_remaining := greatest(v_account.credits_allocated_microusd - v_account.credits_used_microusd, 0);
  v_plan_remaining := v_remaining - least(v_account.top_up_allocated_microusd, v_remaining);
  v_revoked := least(p_amount_microusd, v_plan_remaining);

  update public.token_credits
  set credits_used_microusd = credits_used_microusd + v_revoked,
      credits_used_cents = public.microusd_to_cents_mirror(credits_used_microusd + v_revoked),
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_microusd, amount_cents,
    transaction_type, description, metadata
  ) values (
    p_user_id,
    v_account.id,
    -p_amount_microusd,
    public.microusd_to_cents_mirror(-p_amount_microusd),
    'refund',
    p_reason,
    jsonb_build_object('plan_refund', true, 'balance_revoked_microusd', v_revoked)
  );

  return v_revoked;
end;
$$;

revoke all on function public.revoke_plan_allowance_microusd(text, uuid, bigint, text) from public;

comment on table public.billing_disputes is
  'One row per Stripe dispute: what opening it revoked, the subscription state before it, how it closed, and when a won dispute was restored.';
comment on table public.billing_refund_requests is
  'Refund requests a customer filed, the automatic assessment, and the decision with the Stripe refund it produced.';
comment on column public.billing_refund_requests.assessment is
  'statutory_withdrawal: a consumer in the EEA, UK or Turkey withdrawing within 14 days. unused_within_policy: the purchase was not used and is inside the 7-day window. needs_review: an operator decides.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A dispute revocation posts once:
-- --    SELECT * FROM public.revoke_disputed_credits_microusd('<user>', 'du_verify');  -- twice
-- --    EXPECT: the second call fails on idx_credit_transactions_dispute_postings
-- --            when the first revoked a positive balance.
-- -- 2. A restoration in the same period puts the balance back:
-- --    SELECT public.restore_disputed_credits_microusd('<user>', 'du_verify', '<account>', <revoked>, <top_up>);
-- --    EXPECT: credits_used_microusd back to its value before step 1.
-- -- 3. A plan refund never touches purchased credits:
-- --    SELECT public.revoke_plan_allowance_microusd('<user>', '<account>', 999999999999, 'Refund for charge ch_verify');
-- --    EXPECT: remaining balance equals least(top_up_allocated_microusd, remaining before).
-- -- 4. A customer cannot write a decision:
-- --    SET ROLE app_rls;
-- --    UPDATE public.billing_refund_requests SET status = 'refunded';  -- EXPECT permission denied
-- --    RESET ROLE;
-- -- 5. Clean up:
-- --    DELETE FROM public.credit_transactions WHERE description LIKE 'Dispute % du_verify'
-- --       OR description = 'Refund for charge ch_verify';
-- =============================================================================

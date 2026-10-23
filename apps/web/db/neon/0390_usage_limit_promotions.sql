-- =============================================================================
-- Migration 0390: usage-limit promotions (banked resets and time-boxed uplifts)
--
-- Why    : Owner decision 25 (2026-10-22). Two promotion types an operator
--          can configure at any time without a deploy: a banked one-time
--          reset of the 5-hour and weekly windows, granted by a promotion or
--          a referral and applied by the account holder at or near a limit;
--          and a percentage uplift on the 5-hour or weekly limit for given
--          plans and workloads between two dates. Neither has an amount in
--          code: every number lives in a usage_limit_promotions row.
--
-- Shape  : usage_limit_promotions is the operator's configuration, one row
--          per promotion, written only on the service connection through the
--          platform-admin route. Every row starts disabled. cost_ceiling and
--          committed are microUSD: committed grows by what each applied reset
--          refreshed, or by the most an uplift claim can add before the
--          promotion ends, and nothing is committed past the ceiling.
--          usage_limit_promotion_grants holds one row per banked reset and
--          one per uplift claim. A reset is applied once, keyed by the
--          caller's idempotency key; applied_at is when the account's windows
--          restart. Rows belong to the account and go with it.
--
-- Empty  : Both tables start empty and every promotion row defaults to
--          disabled, so no account gains a reset or an uplift until an
--          operator writes and enables one and turns on the
--          billing.usage_promotions flag.
--
-- Depends: 0037 (profiles), 0076 (set_row_updated_at), 0347 (rolling windows
--          summed from credit_transactions)
-- =============================================================================

begin;

create table if not exists public.usage_limit_promotions (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind text not null check (kind in ('limit_reset', 'limit_uplift')),
  description text not null default '' check (char_length(description) <= 500),
  enabled boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  plans text[] not null check (cardinality(plans) between 1 and 16),
  cost_ceiling_microusd bigint not null check (cost_ceiling_microusd > 0),
  committed_microusd bigint not null default 0 check (committed_microusd >= 0),
  reset_source text check (reset_source is null or reset_source in ('promotion', 'referral')),
  resets_per_grant integer check (resets_per_grant is null or resets_per_grant between 1 and 10),
  reset_valid_days integer check (reset_valid_days is null or reset_valid_days between 1 and 365),
  apply_at_percent integer check (apply_at_percent is null or apply_at_percent between 0 and 100),
  uplift_percent integer check (uplift_percent is null or uplift_percent between 1 and 1000),
  uplift_windows text[] not null default '{}'
    check (uplift_windows <@ array['session', 'weekly']::text[]),
  uplift_workloads text[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  updated_by text check (updated_by is null or char_length(updated_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_limit_promotions_window check (ends_at > starts_at),
  constraint usage_limit_promotions_kind_fields check (
    (
      kind = 'limit_reset'
      and reset_source is not null
      and resets_per_grant is not null
      and reset_valid_days is not null
      and apply_at_percent is not null
      and uplift_percent is null
      and cardinality(uplift_windows) = 0
    )
    or (
      kind = 'limit_uplift'
      and uplift_percent is not null
      and cardinality(uplift_windows) >= 1
      and reset_source is null
      and resets_per_grant is null
      and reset_valid_days is null
      and apply_at_percent is null
    )
  )
);

comment on table public.usage_limit_promotions is
  'Operator-configured usage-limit promotions: banked resets (limit_reset) and time-boxed uplifts (limit_uplift). Every amount is a row value; rows start disabled. Written only on the service connection.';
comment on column public.usage_limit_promotions.committed_microusd is
  'Usage this promotion has given away or may still give away: refreshed usage for applied resets, the bound on extra usage for uplift claims. Never raised past cost_ceiling_microusd.';

drop trigger if exists set_usage_limit_promotions_updated_at on public.usage_limit_promotions;
create trigger set_usage_limit_promotions_updated_at
  before update on public.usage_limit_promotions
  for each row execute function public.set_row_updated_at();

revoke all on public.usage_limit_promotions from public;
revoke all on public.usage_limit_promotions from app_rls;

create table if not exists public.usage_limit_promotion_grants (
  id uuid primary key default gen_random_uuid(),
  promotion_id text not null references public.usage_limit_promotions(id) on delete restrict,
  user_id text not null references public.profiles(id) on delete cascade,
  reference_id text not null check (char_length(reference_id) between 1 and 200),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  applied_at timestamptz,
  apply_key text check (apply_key is null or apply_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  committed_microusd bigint check (committed_microusd is null or committed_microusd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_limit_promotion_grants_expiry check (expires_at > granted_at),
  constraint usage_limit_promotion_grants_applied
    check ((applied_at is null) = (committed_microusd is null)),
  constraint usage_limit_promotion_grants_reference unique (promotion_id, user_id, reference_id),
  constraint usage_limit_promotion_grants_apply_key unique (user_id, apply_key)
);

comment on table public.usage_limit_promotion_grants is
  'One row per banked usage-limit reset or uplift claim. applied_at is when a reset restarted the account''s 5-hour and weekly windows, or when an uplift was claimed. Written only on the service connection.';

create index if not exists idx_usage_limit_promotion_grants_user_applied
  on public.usage_limit_promotion_grants (user_id, applied_at desc)
  where applied_at is not null;

create index if not exists idx_usage_limit_promotion_grants_user_available
  on public.usage_limit_promotion_grants (user_id, expires_at)
  where applied_at is null;

drop trigger if exists set_usage_limit_promotion_grants_updated_at
  on public.usage_limit_promotion_grants;
create trigger set_usage_limit_promotion_grants_updated_at
  before update on public.usage_limit_promotion_grants
  for each row execute function public.set_row_updated_at();

alter table public.usage_limit_promotion_grants enable row level security;
alter table public.usage_limit_promotion_grants force row level security;
revoke all on public.usage_limit_promotion_grants from public;
revoke all on public.usage_limit_promotion_grants from app_rls;
grant select on public.usage_limit_promotion_grants to app_rls;

drop policy if exists usage_limit_promotion_grants_owner_read
  on public.usage_limit_promotion_grants;
create policy usage_limit_promotion_grants_owner_read
  on public.usage_limit_promotion_grants
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Nothing is live after apply:
-- --    select count(*) from public.usage_limit_promotions where enabled;   -- EXPECT: 0
--
-- -- 2. A reset promotion without its reset fields is refused:
-- --    insert into public.usage_limit_promotions
-- --      (id, kind, starts_at, ends_at, plans, cost_ceiling_microusd)
-- --    values ('x-reset', 'limit_reset', now(), now() + interval '1 day', '{pro}', 1);
-- --                                                     -- EXPECT: check violation
--
-- -- 3. One apply key per account:
-- --    two updates setting the same apply_key for one user_id
-- --                                                     -- EXPECT: unique violation
-- =============================================================================

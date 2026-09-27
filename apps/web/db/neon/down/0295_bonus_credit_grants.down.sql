begin;

drop trigger if exists carry_bonus_credits_into_new_account on public.token_credits;
drop function if exists public.carry_bonus_credits_into_new_account();

drop trigger if exists draw_overage_from_prepaid_credits on public.managed_usage_requests;
drop function if exists public.draw_overage_from_prepaid_credits();

drop function if exists public.revoke_bonus_credit_grant(uuid, text);
drop function if exists public.grant_bonus_credits(
  text, text, bigint, integer, timestamptz, text, uuid, text
);
drop function if exists public.reconcile_bonus_credit_grants(text, uuid);
drop function if exists public.post_bonus_credit_adjustment(
  text, uuid, bigint, text, text, text, jsonb
);
drop function if exists public.prepaid_credit_balances_microusd(text);
drop function if exists public.overage_in_flight_microusd(text);

drop index if exists public.idx_managed_usage_requests_overage_in_flight;
drop index if exists public.idx_credit_transactions_bonus_credit_event;

drop policy if exists bonus_credit_grants_owner_read on public.bonus_credit_grants;
alter table public.bonus_credit_grants no force row level security;
alter table public.bonus_credit_grants disable row level security;

drop trigger if exists bonus_credit_grants_assign_version on public.bonus_credit_grants;
drop trigger if exists set_bonus_credit_grants_updated_at on public.bonus_credit_grants;

drop index if exists public.idx_bonus_credit_grants_live_expiry;
drop index if exists public.idx_bonus_credit_grants_live_account;
drop index if exists public.idx_bonus_credit_grants_user_expiry;

drop table if exists public.bonus_credit_grants;

delete from public.schema_migrations where filename = '0295_bonus_credit_grants.sql';

commit;

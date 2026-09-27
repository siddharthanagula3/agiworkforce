begin;

drop policy if exists referrals_party_read on public.referrals;
alter table public.referrals no force row level security;
alter table public.referrals disable row level security;
grant select, insert, update, delete on public.referrals to app_rls;

drop trigger if exists set_referrals_updated_at on public.referrals;

drop index if exists public.idx_referrals_reward_due;
drop index if exists public.idx_referrals_referrer_created;
drop index if exists public.idx_referrals_referred_user;

alter table public.referrals drop constraint if exists referrals_status_check;

alter table public.referrals
  drop column if exists updated_at,
  drop column if exists signup_network_hash,
  drop column if exists blocked_reason,
  drop column if exists clawed_back_at,
  drop column if exists hold_until,
  drop column if exists qualifying_invoice_id,
  drop column if exists referrer_reward_grant_id,
  drop column if exists friend_bonus_grant_id;

alter table public.referrals
  add constraint referrals_referral_code_key unique (referral_code);

drop policy if exists referral_codes_owner on public.referral_codes;
alter table public.referral_codes no force row level security;
alter table public.referral_codes disable row level security;

drop trigger if exists referral_codes_assign_version on public.referral_codes;
drop trigger if exists set_referral_codes_updated_at on public.referral_codes;

drop table if exists public.referral_codes;

delete from public.schema_migrations where filename = '0296_referral_program.sql';

commit;

-- destructive: referrals.referral_code stops being unique because one code now names every referral its owner makes; no row or value is lost.
begin;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  network_hash text check (network_hash is null or network_hash ~ '^[0-9a-f]{64}$'),
  network_seen_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

drop trigger if exists set_referral_codes_updated_at on public.referral_codes;
create trigger set_referral_codes_updated_at
  before update on public.referral_codes
  for each row execute function public.set_row_updated_at();

drop trigger if exists referral_codes_assign_version on public.referral_codes;
create trigger referral_codes_assign_version
  before insert or update on public.referral_codes
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.referral_codes from app_rls;
grant select, insert, update on public.referral_codes to app_rls;

alter table public.referral_codes enable row level security;
alter table public.referral_codes force row level security;

drop policy if exists referral_codes_owner on public.referral_codes;
create policy referral_codes_owner
  on public.referral_codes
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.referral_codes is
  'One referral code per account, created on first request. network_hash is the HMAC of the /24 (IPv4) or /64 (IPv6) network the owner last managed the code from, compared against a referred sign-up for 30 days.';

alter table public.referrals drop constraint if exists referrals_referral_code_key;

alter table public.referrals
  add column if not exists friend_bonus_grant_id uuid
    references public.bonus_credit_grants(id) on delete set null,
  add column if not exists referrer_reward_grant_id uuid
    references public.bonus_credit_grants(id) on delete set null,
  add column if not exists qualifying_invoice_id text
    check (qualifying_invoice_id is null or qualifying_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  add column if not exists hold_until timestamptz,
  add column if not exists clawed_back_at timestamptz,
  add column if not exists blocked_reason text
    check (
      blocked_reason is null
      or blocked_reason = any (array[
        'same_card', 'same_device', 'same_network', 'email_alias', 'disposable_email'
      ])
    ),
  add column if not exists signup_network_hash text
    check (signup_network_hash is null or signup_network_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists updated_at timestamptz not null default now();

alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals
  add constraint referrals_status_check
  check (status = any (array[
    'pending', 'signed_up', 'converted', 'rewarded', 'capped', 'blocked', 'clawed_back'
  ]));

create unique index if not exists idx_referrals_referred_user
  on public.referrals (referred_user_id);

create index if not exists idx_referrals_referrer_created
  on public.referrals (referrer_id, created_at desc);

create index if not exists idx_referrals_reward_due
  on public.referrals (hold_until)
  where status = 'converted';

drop trigger if exists set_referrals_updated_at on public.referrals;
create trigger set_referrals_updated_at
  before update on public.referrals
  for each row execute function public.set_row_updated_at();

revoke all on public.referrals from app_rls;
grant select on public.referrals to app_rls;

alter table public.referrals enable row level security;
alter table public.referrals force row level security;

drop policy if exists referrals_party_read on public.referrals;
create policy referrals_party_read
  on public.referrals
  for select to app_rls
  using (
    referrer_id = (select public.current_app_user_id())
    or referred_user_id = (select public.current_app_user_id())
  );

comment on column public.referrals.status is
  'signed_up when an account is created through the link, converted on its first paid invoice, then rewarded, capped, blocked or clawed_back. pending is the unused 0016 default.';

commit;

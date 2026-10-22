-- =============================================================================
-- Migration 0377: App Store app transactions and withdrawn parental consent
--
-- Why    : under the US state app-store laws (Texas SB 2420, Utah, Louisiana)
--          a parent or guardian can withdraw consent for a child's use of the
--          app. Apple reports it as a RESCIND_CONSENT server notification that
--          names only the install's app transaction, never an AGI account, so
--          the server had no way to find the account to act on.
--
-- Shape  : mobile_app_transactions records each Apple app transaction id an
--          account has signed in from, as the iOS app proves it with Apple's
--          signed app transaction. One install can serve several accounts and
--          one account several installs, so the pair is the key.
--          mobile_app_consent_rescissions records each app transaction whose
--          consent was withdrawn, whether or not an account had registered it
--          yet, so a later registration inherits the withdrawal. Both are
--          service-owned like the other mobile IAP tables (0112): forced RLS,
--          no app_rls policy, reached only through the signed Apple routes.
--
-- Depends: 0112_mobile_native_iap (service-owned mobile IAP pattern)
-- =============================================================================

begin;

create table if not exists public.mobile_app_transactions (
  app_transaction_id text not null check (char_length(app_transaction_id) between 1 and 200),
  user_id text not null references public.profiles(id) on delete cascade,
  environment text not null check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_transaction_id, user_id)
);

create index if not exists idx_mobile_app_transactions_user
  on public.mobile_app_transactions(user_id);

create table if not exists public.mobile_app_consent_rescissions (
  app_transaction_id text primary key check (char_length(app_transaction_id) between 1 and 200),
  notification_id text not null,
  environment text not null check (environment in ('production', 'sandbox')),
  consent_rescinded_at timestamptz not null default now()
);

alter table public.mobile_app_transactions enable row level security;
alter table public.mobile_app_transactions force row level security;
alter table public.mobile_app_consent_rescissions enable row level security;
alter table public.mobile_app_consent_rescissions force row level security;

comment on table public.mobile_app_transactions is
  'Apple app transaction ids each account signed in from, taken only from an Apple-signed app transaction.';
comment on table public.mobile_app_consent_rescissions is
  'App transactions whose parent or guardian withdrew consent (App Store RESCIND_CONSENT). Store purchases are refused for every account mapped to one.';

commit;

-- Reversal of 0377 forgets every withdrawn parental consent Apple reported and
-- every app transaction mapped to an account. Accounts whose consent was
-- withdrawn can buy through the store again, and the withdrawals cannot be
-- recovered: Apple does not resend a RESCIND_CONSENT notification.

begin;

alter table if exists public.mobile_app_consent_rescissions disable row level security;
alter table if exists public.mobile_app_consent_rescissions no force row level security;
alter table if exists public.mobile_app_transactions disable row level security;
alter table if exists public.mobile_app_transactions no force row level security;
drop index if exists public.idx_mobile_app_transactions_user;
drop table if exists public.mobile_app_consent_rescissions;
drop table if exists public.mobile_app_transactions;

delete from public.schema_migrations where filename = '0377_mobile_app_transactions_and_consent.sql';

commit;

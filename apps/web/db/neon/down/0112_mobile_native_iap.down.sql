begin;
drop table if exists public.mobile_iap_notification_receipts;
drop table if exists public.mobile_iap_transactions;
drop table if exists public.mobile_iap_accounts;
delete from public.schema_migrations where filename = '0112_mobile_native_iap.sql';
commit;

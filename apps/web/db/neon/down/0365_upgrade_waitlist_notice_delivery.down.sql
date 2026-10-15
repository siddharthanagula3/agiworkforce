begin;

alter table public.waitlist
  drop column if exists upgrade_email_failure,
  drop column if exists upgrade_email_attempted_at,
  drop column if exists upgrade_email_attempts,
  drop column if exists upgrade_emailed_at,
  drop column if exists upgrade_notified_at;

delete from public.schema_migrations
 where filename = '0365_upgrade_waitlist_notice_delivery.sql';

commit;

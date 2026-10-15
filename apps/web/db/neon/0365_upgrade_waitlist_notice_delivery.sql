begin;

alter table public.waitlist
  add column if not exists upgrade_notified_at timestamptz,
  add column if not exists upgrade_emailed_at timestamptz,
  add column if not exists upgrade_email_attempts integer not null default 0,
  add column if not exists upgrade_email_attempted_at timestamptz,
  add column if not exists upgrade_email_failure text;

comment on column public.waitlist.upgrade_notified_at is
  'When the account was told in the app that paid upgrades opened. Set on every row of the account together.';
comment on column public.waitlist.upgrade_emailed_at is
  'When the upgrades-open email reached the provider, or was given up as undeliverable (upgrade_email_failure says why).';
comment on column public.waitlist.upgrade_email_attempts is
  'Upgrades-open email attempts that failed and will be retried with backoff.';
comment on column public.waitlist.upgrade_email_attempted_at is
  'When the last failed upgrades-open email attempt ran; the retry backoff counts from here.';
comment on column public.waitlist.upgrade_email_failure is
  'Why the last upgrades-open email attempt failed: the send reason and provider status, never the provider message.';

commit;

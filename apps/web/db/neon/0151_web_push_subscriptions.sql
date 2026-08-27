-- 0151 — durable Web Push registrations so the web surface can be notified.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- `push-notification-service` could only read `public.mobile_devices`, so an
-- agent run that finished while the user was on web ended silently. This is the
-- browser half of the same contract: an opaque push-service endpoint plus the
-- two client key values a payload is encrypted against (RFC 8291 — `p256dh` is
-- the subscriber's uncompressed P-256 public point, `auth` its 16-byte secret).
--
-- The endpoint is unique across the whole table on purpose. A push service
-- hands the same endpoint back to whoever is signed into that browser profile,
-- so a re-subscribe under a second account has to MOVE the row rather than add
-- one — otherwise the first account keeps receiving notifications that the
-- second account's browser renders on its lock screen.
--
-- Erasure: the profile foreign key cascades, and `profiles` is the last table
-- `lib/server/account-erasure.ts` clears, so a deleted account takes its
-- registrations with it without that list having to name this table.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22,24}$'),
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists idx_web_push_subscriptions_user_id
  on public.web_push_subscriptions (user_id);

grant select, insert, update, delete on public.web_push_subscriptions to app_rls;

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_subscriptions force row level security;

drop policy if exists web_push_subscriptions_user_isolation on public.web_push_subscriptions;
create policy web_push_subscriptions_user_isolation
  on public.web_push_subscriptions
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.web_push_subscriptions is
  'Browser Web Push registrations. Delivery reads them through the privileged connection; app_rls sees only the signed-in account''s own rows.';

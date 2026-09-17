-- 0194 : tell workspace owners and admins when their spend limit is crossed.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0142 promised that in `notify` mode "the crossing is audited". Nothing did
-- it: the console showed the crossing to whoever happened to open it, and the
-- people who own the budget were never told. One row per workspace, calendar
-- month and kind is the delivery record, and its primary key is what keeps a
-- crossing from being announced again on every recomputed decision.
--
-- threshold : month-to-date spend reached alert_threshold_pct of the cap
-- cap       : month-to-date spend reached the cap itself
--
-- Written only by the service role. Members may read their own workspace's
-- rows so the console can say when admins were last told.

begin;

create table if not exists public.organization_spend_alerts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  kind text not null check (kind in ('threshold', 'cap')),
  enforcement text not null check (enforcement in ('notify', 'block')),
  spent_cents bigint not null check (spent_cents >= 0),
  monthly_cap_cents integer not null check (monthly_cap_cents > 0),
  alert_threshold_pct integer not null check (alert_threshold_pct between 1 and 100),
  recipients_notified integer not null default 0 check (recipients_notified >= 0),
  created_at timestamptz not null default now(),
  primary key (organization_id, period_start, kind)
);

grant select on public.organization_spend_alerts to app_rls;

alter table public.organization_spend_alerts enable row level security;
alter table public.organization_spend_alerts force row level security;

drop policy if exists spend_alerts_member_read on public.organization_spend_alerts;
create policy spend_alerts_member_read
  on public.organization_spend_alerts
  for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_spend_alerts.organization_id
         and m.user_id = public.current_app_user_id()
    )
  );

commit;

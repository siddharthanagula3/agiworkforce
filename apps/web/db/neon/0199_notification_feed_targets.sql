-- 0199 : give in-app notifications an event category, a deep-link target and a
-- per-event dedupe key, so every delivery path writes one feed row per event.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0016 created public.notifications with a free-text link and nothing else to
-- say what a row is about. Surfaces cannot build a native deep link from a web
-- path, and a notifier that runs more than once for the same event (a retried
-- workflow step, a webhook redelivery) would write the row twice. The target is
-- stored as (target_kind, target_id) so each surface resolves it itself, and a
-- unique (user_id, dedupe_key) makes the writer idempotent.
--
-- read_at records when the row was read; is_read stays the indexed flag.

begin;

alter table public.notifications
  add column if not exists category text not null default 'general',
  add column if not exists target_kind text,
  add column if not exists target_id text,
  add column if not exists dedupe_key text,
  add column if not exists read_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'general', 'agent_run', 'schedule', 'media', 'research', 'connector',
    'device', 'security', 'billing'
  ));

alter table public.notifications
  drop constraint if exists notifications_target_check;
alter table public.notifications
  add constraint notifications_target_check
  check (
    (target_kind is null and target_id is null)
    or (
      target_kind in (
        'chat', 'file', 'artifact', 'work', 'research', 'schedule', 'browser-task', 'settings'
      )
      and target_id is not null
      and length(target_id) between 1 and 128
    )
  );

alter table public.notifications
  drop constraint if exists notifications_dedupe_key_length_check;
alter table public.notifications
  add constraint notifications_dedupe_key_length_check
  check (dedupe_key is null or length(dedupe_key) between 1 and 200);

create unique index if not exists notifications_user_dedupe_key_idx
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

commit;

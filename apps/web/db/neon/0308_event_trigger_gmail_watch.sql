-- =============================================================================
-- Migration 0308: the Gmail mailbox watch behind each Gmail trigger
--
-- Why    : a Gmail trigger was created pending and nothing ever registered the
--          mailbox watch that 0210 names as its ownership proof, so no Gmail
--          trigger could fire. Registering users.watch with the account's own
--          Gmail grant now verifies the trigger, and each Pub/Sub notice is
--          read through users.history.list from the point the trigger last
--          reached, so a run starts for each new inbox message.
--
-- Shape  : watch_history_id is the Gmail history id the trigger has read up
--          to. watch_expires_at is when Gmail stops publishing unless the watch
--          is renewed. watch_error is the last reason registering or reading
--          the watch failed, shown on the trigger. Only the service role writes
--          them: the column-level update grant 0210 gives app_rls names none of
--          them. Gmail triggers now fire per new message, so the one Gmail
--          event type, mailbox.changed, becomes message.received.
--
-- Depends: 0210 (event_triggers)
-- =============================================================================

begin;

alter table public.event_triggers
  add column if not exists watch_history_id text
    check (watch_history_id is null or watch_history_id ~ '^[0-9]{1,20}$'),
  add column if not exists watch_expires_at timestamptz,
  add column if not exists watch_error text
    check (watch_error is null or char_length(watch_error) between 1 and 500);

update public.event_triggers
   set event_types = array(
         select distinct case
                  when event_type in ('mailbox.changed', 'mailbox') then 'message.received'
                  else event_type
                end
           from unnest(event_types) as event_type
       ),
       updated_at = now()
 where source = 'gmail'
   and event_types && array['mailbox.changed', 'mailbox'];

comment on column public.event_triggers.watch_history_id is
  'Gmail history id this trigger has read up to; the next notice lists history after it.';
comment on column public.event_triggers.watch_expires_at is
  'When the provider stops publishing for this watch unless it is renewed.';
comment on column public.event_triggers.watch_error is
  'Why registering or reading the provider watch last failed; null once it succeeds.';

commit;

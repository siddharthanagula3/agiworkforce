-- Reversal of 0307 : removes the Gmail watch state from event triggers.
--
-- WHAT THIS COSTS: Gmail triggers keep their verification but lose the history
-- id they had read up to, so the code that reads new mail for them has nothing
-- to start from and the watch expiry and error they showed are gone. Triggers
-- listening for message.received go back to mailbox.changed. Registered Gmail
-- watches lapse on their own within seven days once nothing renews them.

begin;

update public.event_triggers
   set event_types = array(
         select distinct case
                  when event_type in ('message.received', 'message') then 'mailbox.changed'
                  else event_type
                end
           from unnest(event_types) as event_type
       ),
       updated_at = now()
 where source = 'gmail'
   and event_types && array['message.received', 'message'];

alter table public.event_triggers
  drop column if exists watch_error,
  drop column if exists watch_expires_at,
  drop column if exists watch_history_id;

delete from public.schema_migrations
 where filename = '0307_event_trigger_gmail_watch.sql';

commit;

-- Reversal of 0242, remove the engineering escalation record.
--
-- COST, read this before running it: this drops the only record that
-- engineering was ever told about a ticket, including which on-call responder
-- was paged for a p0. Export public.support_ticket_escalations first if any
-- escalation has been raised; the ticket it came from keeps no copy.

begin;

alter table if exists public.support_ticket_escalations disable row level security;

drop index if exists public.support_ticket_escalations_open_idx;
drop index if exists public.support_ticket_escalations_ticket_idx;

drop table if exists public.support_ticket_escalations;

delete from public.schema_migrations
 where filename = '0242_support_ticket_escalations.sql';

commit;

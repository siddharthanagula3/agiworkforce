-- Reversal of 0169, drop 'tool' from the cost-event capability constraint.
--
-- Any row already written with capability 'tool' would violate the restored
-- constraint, so those rows are deleted first: they are per-request tool
-- purchases the ledger can no longer represent. Every other cost event is
-- untouched, and the places tool stops recording cost until 0169 is
-- re-applied.

begin;

delete from public.provider_cost_events
 where capability = 'tool';

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox'
  ]));

delete from public.schema_migrations
 where filename = '0169_provider_cost_events_tool_capability.sql';

commit;

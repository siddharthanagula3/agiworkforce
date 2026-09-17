-- Reversal of 0214, drop the prompt manifest stamps.
--
-- The stamps are the only record of which prompt version produced a row, so
-- dropping the columns discards that attribution for every row already
-- written. Nothing else depends on them: the ledger and trace writers pass an
-- empty array when the column is absent, and both tables keep every other
-- column untouched.

begin;

drop index if exists public.idx_routing_decision_traces_prompt_ids;

drop index if exists public.idx_provider_cost_events_prompt_ids;

alter table public.routing_decision_traces
  drop column if exists prompt_ids;

alter table public.provider_cost_events
  drop column if exists prompt_ids;

delete from public.schema_migrations
 where filename = '0214_prompt_manifest_stamps.sql';

commit;

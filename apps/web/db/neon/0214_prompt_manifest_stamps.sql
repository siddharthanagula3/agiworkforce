-- 0214 : stamp the prompt manifest on the rows that account for a turn.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Prompts stay in code, so the only thing the database needs from the manifest
-- is the identity of what was sent: an array of `id@version` stamps. With it,
-- "which prompt version produced this spend" and "did the B arm cost more than
-- the A arm" are one group-by; without it a prompt change is invisible to
-- every cost and routing question asked after the fact.
--
-- text[] rather than jsonb: the values are short opaque labels, they are only
-- ever matched or grouped, and an array index answers both. Null is not used;
-- an empty array says "this row ran no manifest prompt", which is a different
-- fact from "we did not record it" only while the column is being backfilled,
-- and no backfill is possible for rows written before the manifest existed.
--
-- Operational and financial telemetry on tables that already exist, so no new
-- grants, no new RLS policy and no new erasure or export inventory entry: both
-- tables are already classified by 0127 and 0212.

begin;

alter table public.provider_cost_events
  add column if not exists prompt_ids text[] not null default '{}'::text[];

alter table public.routing_decision_traces
  add column if not exists prompt_ids text[] not null default '{}'::text[];

create index if not exists idx_provider_cost_events_prompt_ids
  on public.provider_cost_events using gin (prompt_ids);

create index if not exists idx_routing_decision_traces_prompt_ids
  on public.routing_decision_traces using gin (prompt_ids);

comment on column public.provider_cost_events.prompt_ids is
  'Prompt manifest stamps (id@version) of every prompt the settled operation sent to the model. Empty when the operation ran no manifest prompt.';

comment on column public.routing_decision_traces.prompt_ids is
  'Prompt manifest stamps (id@version) in force for the traced decision, so a rollout comparison can separate a model change from a prompt change.';

commit;

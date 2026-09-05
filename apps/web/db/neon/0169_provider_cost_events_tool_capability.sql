-- 0169 : let the COGS ledger record a paid tool call.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- provider_cost_events.capability enumerated only the capabilities the
-- platform bought from a model provider. The places tool buys something else:
-- one metered request to a places provider, priced per call rather than per
-- token, with no model attached. Recorded under any existing capability the
-- row would either be rejected by the check constraint or, worse, land in
-- 'chat' with zero token units and silently disappear from every per-token
-- margin question.
--
-- 'tool' is the capability for a per-request purchase made on the user's
-- behalf by a tool in the chat loop; its unit basis is 'request', which the
-- constraint already allows. resolveCogsUnits reads usage.requests for it, the
-- same shape computer_use already uses.

begin;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool'
  ]));

commit;

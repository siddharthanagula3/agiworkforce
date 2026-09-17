-- 0221 : two costs the ledger still could not name — connector calls and the
--        bytes a generated file leaves behind.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0215 widened provider_cost_events to every infrastructure cost the platform
-- carries, but two consumptions still had no capability of their own and so
-- were either invisible or misfiled under the generic 'tool':
--
--   connector  one call to a connected third-party account, over MCP or the
--              GitHub App. Metered per request, because the cost the platform
--              carries is per call — egress and any per-seat vendor fee are
--              already their own rows.
--   artifact   object storage held by a file the platform generated for the
--              account (an image, a video, a rendered document), as distinct
--              from 'storage', which is everything else at rest.
--
-- Accrual convention for 'artifact': one row is written when the file is
-- stored, for one month of that file's own size. A file kept longer accrues
-- again from the retention sweep that re-reads live bytes; a file deleted
-- inside the month is not credited back, which errs towards over-counting the
-- platform's own cost rather than under-counting it.
--
-- Neither capability carries a price in this repository: both are rate-carded
-- as deployment_metered, so an unpriced row still records what was consumed
-- and becomes priced the moment the deployment sets that row's override.

begin;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact'
  ]));

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The two new capabilities are accepted:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents, source_ref)
-- --    VALUES ('connector', 'mcp', 'request', 1, 0, 0, 'verify:connector');
-- --    EXPECT: INSERT 0 1
--
-- -- 2. An unknown capability is still refused:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents, source_ref)
-- --    VALUES ('nonsense', 'mcp', 'request', 1, 0, 0, 'verify:bad');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. Clean up:
-- --    DELETE FROM public.provider_cost_events WHERE source_ref LIKE 'verify:%';
-- =============================================================================

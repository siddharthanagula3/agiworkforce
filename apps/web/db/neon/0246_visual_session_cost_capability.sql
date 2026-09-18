-- 0246 : the cost of a live camera or screen share, which the ledger could not
--        name at all.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A live visual session runs for a wall-clock span, samples frames on an
-- interval and sends only the ones the scene changed enough to justify. Its
-- cost is the session, not the turn: pricing it as tokens files the most
-- expensive thing a turn can carry under the cheapest line in the ledger, and
-- leaving it unmetered makes camera and screen share the only capabilities the
-- platform buys and never counts.
--
--   visual   one minute of an attached camera, screen or shared window,
--            metered per started minute the way 'browser' and the live voice
--            minute already are. The source is carried in metadata and in the
--            feature column: visual_camera_minute against a camera,
--            visual_screen_share_minute against a screen or a window, because
--            a shared window is a screen share by another name.
--
-- Neither feature carries a price in this repository: both are rate-carded as
-- deployment_metered, so an unpriced row still records what was consumed and
-- becomes priced the moment the deployment sets that row's override.
--
-- 'minute' is already in provider_cost_events_unit_basis_check, so only the
-- capability constraint moves.

begin;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact', 'visual'
  ]));

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The new capability is accepted on its per-minute basis:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents,
-- --       source_ref, feature)
-- --    VALUES ('visual', 'agiworkforce', 'minute', 3, 0, 0, 'verify:visual',
-- --            'visual_screen_share_minute');
-- --    EXPECT: INSERT 0 1
--
-- -- 2. An unknown capability is still refused:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents, source_ref)
-- --    VALUES ('nonsense', 'agiworkforce', 'minute', 1, 0, 0, 'verify:bad');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. A retried session close cannot double-count the same minutes:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents, source_ref)
-- --    VALUES ('visual', 'agiworkforce', 'minute', 3, 0, 0, 'verify:visual')
-- --    ON CONFLICT (source_ref) DO NOTHING;
-- --    EXPECT: INSERT 0 0
--
-- -- 4. Clean up:
-- --    DELETE FROM public.provider_cost_events WHERE source_ref LIKE 'verify:%';
-- =============================================================================

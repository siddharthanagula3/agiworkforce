-- =============================================================================
-- Migration 0306: a lease and a serving route on every Free usage reservation
--
-- Why    : a Free turn reserves the smallest remaining Free window, so a turn
--          that dies without settling holds that window until it ages out. The
--          lease lets the reservation sweep release it as failed, at nothing to
--          the user, once the turn can no longer be running, and the provider
--          and model attribute the absorbed estimate in the COGS ledger.
--
-- Empty  : rows written before this migration carry no lease; the sweep treats
--          an unsettled row without one as expired.
--
-- Depends: 0065 (free_daily_usage_reservations), 0067
-- =============================================================================

begin;

alter table public.free_daily_usage_reservations
  add column if not exists lease_expires_at timestamptz,
  add column if not exists provider text
    check (provider is null or char_length(provider) between 1 and 100),
  add column if not exists model text
    check (model is null or char_length(model) between 1 and 200);

commit;

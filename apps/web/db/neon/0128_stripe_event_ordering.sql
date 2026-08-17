-- =============================================================================
-- 0128 — Stripe subscription snapshots reconcile by sequence, not by arrival
--
-- Stripe delivers events at least once and in no guaranteed order: a retried
-- `customer.subscription.updated` from 11:00 can land after the 13:00 one and
-- overwrite the newer plan, status and period with stale values. Idempotency
-- keys stop the same event replaying; they do nothing about two different
-- events arriving backwards.
--
-- last_stripe_event_at is the applied-sequence watermark, set from the Stripe
-- event's own `created`. Every subscription write carries the incoming
-- sequence and is gated on it not going backwards, so the guard survives two
-- webhook workers racing on the same row, not just the read-then-write in a
-- single handler.
-- =============================================================================

alter table if exists public.subscriptions
  add column if not exists last_stripe_event_at timestamptz;

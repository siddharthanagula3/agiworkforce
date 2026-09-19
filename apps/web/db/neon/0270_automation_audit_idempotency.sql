-- Depends: 0266
BEGIN;

ALTER TABLE public.automation_audit_events
  ADD COLUMN IF NOT EXISTS client_event_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS automation_audit_events_user_client_event_idx
  ON public.automation_audit_events (user_id, client_event_id);

COMMENT ON COLUMN public.automation_audit_events.client_event_id IS
  'Stable client-generated receipt id used to make outbox retries idempotent.';

COMMIT;

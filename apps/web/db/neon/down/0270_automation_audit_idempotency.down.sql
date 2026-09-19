BEGIN;

DROP INDEX IF EXISTS public.automation_audit_events_user_client_event_idx;
ALTER TABLE public.automation_audit_events DROP COLUMN IF EXISTS client_event_id;
DELETE FROM public.schema_migrations
WHERE filename = '0270_automation_audit_idempotency.sql';

COMMIT;

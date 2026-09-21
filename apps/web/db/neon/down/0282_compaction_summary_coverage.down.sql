BEGIN;

ALTER TABLE public.web_conversations
  DROP COLUMN IF EXISTS compaction_summary_digest;

DELETE FROM public.schema_migrations
WHERE filename = '0282_compaction_summary_coverage.sql';

COMMIT;

BEGIN;

ALTER TABLE public.feature_flag_definitions
  DROP COLUMN IF EXISTS owner_name,
  DROP COLUMN IF EXISTS availability,
  DROP COLUMN IF EXISTS release_channel,
  DROP COLUMN IF EXISTS maturity;

DELETE FROM public.schema_migrations
WHERE filename = '0271_feature_flag_governance_metadata.sql';

COMMIT;

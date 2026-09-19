-- Depends: 0211
BEGIN;

ALTER TABLE public.feature_flag_definitions
  ADD COLUMN IF NOT EXISTS maturity text
    CHECK (maturity IS NULL OR maturity IN ('experimental', 'beta', 'general_availability', 'deprecated')),
  ADD COLUMN IF NOT EXISTS release_channel text
    CHECK (release_channel IS NULL OR release_channel IN ('stable', 'beta', 'nightly')),
  ADD COLUMN IF NOT EXISTS availability text
    CHECK (availability IS NULL OR availability IN ('unavailable', 'internal', 'waitlist', 'limited', 'general')),
  ADD COLUMN IF NOT EXISTS owner_name text
    CHECK (owner_name IS NULL OR char_length(owner_name) BETWEEN 1 AND 120);

COMMIT;

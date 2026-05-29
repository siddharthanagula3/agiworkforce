-- Migration 0028: persistent per-user settings
--
-- Backing table for apps/web/app/api/settings/preferences/route.ts. Settings
-- are grouped by namespace inside a JSONB document so each settings page can
-- persist real user changes without inventing one table per tab.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id text PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS user_settings_updated_at_idx
  ON public.user_settings (updated_at DESC);

COMMENT ON TABLE public.user_settings IS
  'Per-user app settings persisted by /api/settings/preferences. Values are grouped by settings page key.';

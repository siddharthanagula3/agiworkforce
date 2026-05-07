-- 20260508130000_add_routing_preferences_to_profiles.sql
-- Add a JSONB column to profiles for per-user routing preferences.
--
-- Phase 3 / spec §11 Round 14-15: Pro+/Max users may opt in to US-only
-- routing (skips DeepSeek/Kimi/Zhipu/MiniMax/Qwen). The column is shaped
-- as a JSON object so future preferences (geo overlay, no-thinking, etc.)
-- plug in without further DDL.
--
-- Default: empty object → all flags resolve to undefined → router uses
-- canonical Pool slot for the tier.
--
-- Shape (informational):
--   { "us_only": boolean, "geo_overlay": "auto" | "us" | "in" | "cn" }
--
-- This file mirrors the live state applied via Supabase MCP on 2026-05-08.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS routing_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.routing_preferences IS
  'Per-user routing preferences. Pro+/Max us_only toggle + future geo overlay flags. Read on each chat completion request to gate the resolveAutoModeModel call.';

-- Migration 0031: drop legacy Neon-to-Clerk identity bridge
--
-- AGI Web cloud identity is Clerk-only and stored in Neon text user_id columns.
-- The user_id_mapping table was migration baggage from the Neon era and is
-- not referenced by runtime code.

DROP TABLE IF EXISTS public.user_id_mapping;

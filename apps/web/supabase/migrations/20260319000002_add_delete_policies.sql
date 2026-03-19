-- Migration: Add missing DELETE policies
-- Date: 2026-03-19
--
-- Audit of per-operation policies across chat and device tables revealed
-- that some tables have SELECT/INSERT/UPDATE policies but no DELETE policy,
-- leaving users unable to remove their own data (a GDPR compliance gap).
--
-- Tables with confirmed missing DELETE policies:
--
--   web_messages              — no DELETE policy (only SELECT + INSERT exist)
--   device_authorization_codes — no user DELETE policy (only SELECT + service_role)
--
-- Tables intentionally excluded:
--   conversation_tags  — uses FOR ALL policy; DELETE already covered
--   scheduled_tasks    — uses FOR ALL policy; DELETE already covered
--   user_memories      — DELETE policy added in 20260319000000_create_user_memories.sql
--
-- All policies are wrapped in DO blocks for idempotent re-runs.

-- =============================================================================
-- 1. web_messages — allow users to delete messages in their own conversations
--
--    web_messages has no user_id column; ownership is derived through the
--    parent web_conversations row. This matches the pattern used by the
--    existing SELECT policy on this table.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'web_messages'
      AND policyname = 'Users can delete own messages'
  ) THEN
    CREATE POLICY "Users can delete own messages"
      ON public.web_messages
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.web_conversations c
          WHERE c.id = conversation_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 2. device_authorization_codes — allow users to revoke their own auth codes
--
--    user_id is nullable (codes start unbound before the user authorises them),
--    so the USING clause guards against NULL matches automatically.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'device_authorization_codes'
      AND policyname = 'Users can delete own device auth codes'
  ) THEN
    CREATE POLICY "Users can delete own device auth codes"
      ON public.device_authorization_codes
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

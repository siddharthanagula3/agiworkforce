-- Migration: fix_feedback_rls
-- Fix security advisory: "Anon users can insert feedback" policy had WITH CHECK (true)
-- which effectively bypassed row-level security for anonymous users.
-- Authenticated users retain their properly-scoped INSERT policy.

DROP POLICY IF EXISTS "Anon users can insert feedback" ON public.feedback;

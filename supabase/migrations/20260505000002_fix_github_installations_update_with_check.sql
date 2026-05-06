-- =============================================================================
-- Security fix: github_installations UPDATE policy missing WITH CHECK
-- Date: 2026-05-05
-- Source: docs/security/red-team-2026-05-04.md HIGH-2
--          (was H4 in red-supabase agent report)
--
-- The original policy at 20260307000002_create_github_installations.sql:31-34:
--   CREATE POLICY "Users can update their own installations"
--     ON public.github_installations FOR UPDATE TO authenticated
--     USING (user_id = auth.uid());
--
-- PostgreSQL UPDATE policies do NOT default WITH CHECK = USING. A user could
-- update their own installation row to set user_id = '<victim_uuid>',
-- transferring the GitHub App installation to the victim's account. The
-- victim's PR-review automation would then run against the attacker's
-- installation; alternatively, the attacker's installation events would be
-- billed to (and visible in) the victim's account.
--
-- Reproduction (before fix):
--   await supabase.from('github_installations')
--     .update({ user_id: VICTIM_UUID })
--     .eq('id', MY_INSTALLATION_ID);
--   -- success: row's user_id is now VICTIM_UUID.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'github_installations'
          AND policyname = 'Users can update their own installations'
    ) THEN
        ALTER POLICY "Users can update their own installations"
          ON public.github_installations
          USING (user_id = auth.uid())
          WITH CHECK (user_id = auth.uid());
        RAISE NOTICE 'Tightened UPDATE policy on github_installations with WITH CHECK clause';
    ELSE
        RAISE NOTICE 'Policy not found; skipping (table may not exist in this environment)';
    END IF;
END $$;

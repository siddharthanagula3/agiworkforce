-- 0049 — Add FORCE ROW LEVEL SECURITY to web_artifacts / web_artifact_versions.
--
-- 0039_artifact_cloud_sync.sql enabled RLS on both tables and commented that
-- the policy shape was "identical to web_conversations (0037)", but only
-- copied ENABLE ROW LEVEL SECURITY, not the accompanying FORCE ROW LEVEL
-- SECURITY that 0037 applies to every other user-scoped table. Without FORCE,
-- the table owner role bypasses RLS entirely, so any code path that queries
-- as the owner (rather than `app_rls`) reads/writes cross-tenant rows.

alter table public.web_artifacts force row level security;
alter table public.web_artifact_versions force row level security;

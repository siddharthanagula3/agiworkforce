-- 20260521130000_fix_project_knowledge_files_fk.sql
--
-- Hotfix for 20260521120000_project_schema_round_10.sql self-audit finding.
--
-- The previous migration declared:
--
--   added_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
--
-- The NOT NULL and ON DELETE SET NULL are incompatible. When an auth user
-- is deleted, the FK action tries to set the column to NULL but the NOT
-- NULL constraint rejects it, raising:
--
--   ERROR: null value in column "added_by_user_id" of relation
--   "project_knowledge_files" violates not-null constraint
--
-- This either blocks user deletion entirely or — depending on transaction
-- ordering — leaves orphaned rows pointing at a now-deleted user.
--
-- The right policy for project knowledge files: keep the file even if the
-- original uploader is deleted (other project members still depend on it).
-- The audit trail becomes "uploaded by deleted user" — `added_by_user_id`
-- becomes NULL. So the fix is to drop NOT NULL and let SET NULL work.

ALTER TABLE public.project_knowledge_files
  ALTER COLUMN added_by_user_id DROP NOT NULL;

-- Sanity: keep the FK as ON DELETE SET NULL (the previous migration
-- already declared it). No-op if unchanged.
ALTER TABLE public.project_knowledge_files
  DROP CONSTRAINT IF EXISTS project_knowledge_files_added_by_user_id_fkey;

ALTER TABLE public.project_knowledge_files
  ADD CONSTRAINT project_knowledge_files_added_by_user_id_fkey
  FOREIGN KEY (added_by_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- 0090_shared_project_knowledge_read_only.sql
--
-- SECURITY FIX for 0086_org_shared_ecosystem.sql.
--
-- 0086 replaced the knowledge-file policy with a single `FOR ALL` policy whose
-- USING clause admits rows belonging to any org-shared project. Its own comment
-- states the intent exactly:
--
--     "The asymmetry is deliberate: members READ knowledge files on a shared
--      project; only the owner WRITES them."
--
-- The implementation does not do that. In Postgres RLS a `FOR ALL` policy uses
-- USING for SELECT, UPDATE **and DELETE**, while WITH CHECK constrains only the
-- rows produced by INSERT and UPDATE. DELETE has no WITH CHECK. So the
-- owner-only WITH CHECK correctly blocked members from inserting or editing
-- knowledge files, and did nothing at all about deletion: any member of the
-- organization — including a `viewer` — could DELETE another member's extracted
-- knowledge files from a shared project. Destructive, silent, and irreversible.
--
-- This splits the single policy into read and write policies so the granted
-- permissions match the stated intent:
--
--   SELECT           org members with readable access (minus explicit denials)
--   INSERT/UPDATE    project owner only
--   DELETE           project owner only
--
-- The per-member `access = 'none'` denial is preserved on the read path.
--
-- Applying this migration is safe whether or not 0086 has been applied: it
-- drops by name and recreates.

begin;

drop policy if exists project_knowledge_files_user_isolation on public.project_knowledge_files;
drop policy if exists project_knowledge_files_tenant_isolation on public.project_knowledge_files;
drop policy if exists project_knowledge_files_shared_read on public.project_knowledge_files;
drop policy if exists project_knowledge_files_owner_write on public.project_knowledge_files;

-- READ: the owner, plus members of an org the project is shared into who have
-- not been explicitly denied.
create policy project_knowledge_files_shared_read
  on public.project_knowledge_files
  for select to app_rls
  using (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
    or project_id in (
      select s.project_id
        from public.organization_shared_projects s
       where public.app_org_resource_is_readable(s.organization_id)
         and not exists (
           select 1
             from public.organization_project_access a
            where a.organization_id = s.organization_id
              and a.project_id = s.project_id
              and a.user_id = public.current_app_user_id()
              and a.access = 'none'
         )
    )
  );

-- WRITE: owner only. Separate policies per command so DELETE can never inherit
-- the read policy's wider USING clause again.
create policy project_knowledge_files_owner_insert
  on public.project_knowledge_files
  for insert to app_rls
  with check (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
  );

create policy project_knowledge_files_owner_update
  on public.project_knowledge_files
  for update to app_rls
  using (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
  )
  with check (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
  );

create policy project_knowledge_files_owner_delete
  on public.project_knowledge_files
  for delete to app_rls
  using (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
  );

comment on table public.project_knowledge_files is
  'Knowledge files for a project. Readable by the owner and by members of an organization the project is shared into; writable and deletable by the project owner only. Split across per-command policies because a FOR ALL policy grants DELETE through USING, which silently let any org member delete another member''s files (see 0086).';

commit;

-- Reversal of 0185 : restore 0184's single FOR ALL policy on the grant table.
--
-- WHAT THIS COSTS: the fix. 0184's FOR ALL policy also governs SELECT, so
-- reading `organization_shared_artifacts` evaluates an EXISTS against
-- `published_artifacts`, whose org-shared read policy reads the grant table
-- again. Every publish, list and read of published_artifacts then fails with
-- 42P17, infinite recursion. Roll this back only as a step toward rolling back
-- 0184 as well; on its own it re-breaks artifact publishing outright.
--
-- ROLLBACK ORDER: this file, then 0184's. Nothing in application code changes.

begin;

drop policy if exists organization_shared_artifacts_owner_insert on public.organization_shared_artifacts;
drop policy if exists organization_shared_artifacts_owner_update on public.organization_shared_artifacts;
drop policy if exists organization_shared_artifacts_owner_delete on public.organization_shared_artifacts;

drop policy if exists organization_shared_artifacts_owner_write on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_write
  on public.organization_shared_artifacts for all to app_rls
  using (
    public.app_org_resource_is_readable(organization_id)
    and (
      public.app_org_resource_is_manageable(organization_id)
      or exists (
        select 1
          from public.published_artifacts artifact
         where artifact.id = organization_shared_artifacts.published_artifact_id
           and artifact.user_id = public.current_app_user_id()
      )
    )
  )
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.published_artifacts artifact
       where artifact.id = organization_shared_artifacts.published_artifact_id
         and artifact.user_id = public.current_app_user_id()
    )
  );

delete from public.schema_migrations
  where filename = '0185_org_shared_artifact_policy_recursion.sql';

commit;

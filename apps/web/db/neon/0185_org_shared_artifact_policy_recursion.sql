-- =============================================================================
-- Migration 0185: break the policy recursion 0184 introduced.
--
-- Symptom: every publish, list and read of `published_artifacts` failed with
--          42P17, "infinite recursion detected in policy for relation
--          published_artifacts". Observed on a live publish against the local
--          stack on 2026-09-13; no unit test can see it, because the cycle is
--          between two Postgres policies and not in any statement.
--
-- Cause  : 0184 created `organization_shared_artifacts_owner_write` as FOR ALL.
--          Postgres applies a FOR ALL policy to SELECT as well, so reading the
--          grant table evaluated its ownership EXISTS against
--          `published_artifacts`, whose new `published_artifacts_org_shared_read`
--          policy reads the grant table, which evaluates the FOR ALL policy
--          again. Two policies, each correct alone, forming a cycle.
--
-- Fix    : split the write side into INSERT, UPDATE and DELETE policies, the
--          same shape 0095 uses on `published_artifacts` itself. A SELECT on
--          the grant table then evaluates only
--          `organization_shared_artifacts_member_read`, which touches no other
--          table, so the cycle has nowhere to close. The permissions are
--          unchanged: read for every member, write for the artifact's owner or
--          an org admin, and the WITH CHECK side still demands that the writer
--          own the artifact and name themselves as the sharer.
--
-- Depends: 0184_organization_shared_artifacts.
-- =============================================================================

drop policy if exists organization_shared_artifacts_owner_write on public.organization_shared_artifacts;

drop policy if exists organization_shared_artifacts_owner_insert on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_insert
  on public.organization_shared_artifacts for insert to app_rls
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

drop policy if exists organization_shared_artifacts_owner_update on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_update
  on public.organization_shared_artifacts for update to app_rls
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

drop policy if exists organization_shared_artifacts_owner_delete on public.organization_shared_artifacts;
create policy organization_shared_artifacts_owner_delete
  on public.organization_shared_artifacts for delete to app_rls
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
  );

comment on table public.organization_shared_artifacts is
  'Org sharing grant for a published_artifacts row. Absence of a row means personal. Read by every member; written by the artifact owner or an org admin through per-command policies, never FOR ALL: a FOR ALL policy here also governs SELECT and recurses through published_artifacts_org_shared_read.';

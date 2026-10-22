-- =============================================================================
-- Migration 0383: connected apps stay off publicly shared artifacts
--
-- Why    : a published app could call each viewer's connected apps whoever
--          opened it, including anyone holding a public link. Connected apps
--          are for artifacts shared with a workspace or with invited people.
--
-- Shape  : app_published_artifact_allows_connectors answers one boolean for a
--          publication the caller may already run (0372): true only when its
--          audience is not public. A viewer cannot read a public publication's
--          row under RLS, so the answer comes from a security definer function
--          that returns nothing but the boolean.
--
-- Depends: 0095_published_artifacts, 0184_organization_shared_artifacts,
--          0372_published_site_viewers (app_can_run_published_artifact)
-- =============================================================================

begin;

create or replace function public.app_published_artifact_allows_connectors(
  p_published_artifact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.published_artifacts a
     where a.id = p_published_artifact_id
       and a.visibility <> 'public'
       and public.app_can_run_published_artifact(a.id)
  );
$$;

revoke all on function public.app_published_artifact_allows_connectors(uuid) from public;
grant execute on function public.app_published_artifact_allows_connectors(uuid) to app_rls;

comment on function public.app_published_artifact_allows_connectors(uuid) is
  'True when the caller may run this publication and its audience is a workspace or invited people, never anyone with the link.';

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. A public publication never allows connectors:
-- --    select public.app_published_artifact_allows_connectors(id)
-- --      from public.published_artifacts where visibility = 'public' limit 1;  -- EXPECT: false
-- -- 2. An invited viewer of an invited publication gets true; anyone else false.
-- =============================================================================

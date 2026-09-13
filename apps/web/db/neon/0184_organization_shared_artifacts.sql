-- =============================================================================
-- Migration 0184: organization sharing for published artifacts (AGI-10).
--
-- Why    : 0095 gave an artifact exactly one audience, "anyone holding the
--          144-bit token". A team customer who wants their colleagues to read
--          an artifact has had no option but to make it readable by the whole
--          internet. AGI-10 asks for the audience the org already has for
--          projects and connectors (0086): every member, nobody else, with
--          membership revocation taking effect.
--
-- Model  : the same two-part shape 0086 established, and for the same reason.
--            * `published_artifacts.visibility` answers "is the ANONYMOUS
--              token path open for this row?" It is a property of the
--              publication, not a grant, and defaults to 'public' so every
--              existing row keeps exactly today's behaviour.
--            * `organization_shared_artifacts` is the GRANT ROW: which org may
--              read it, who granted it, when. Absent a grant row an artifact is
--              personal (plus its public link if visibility says so), and
--              un-sharing is a DELETE that restores that state.
--          One column cannot carry both, for the reason 0086 recorded: an
--          artifact can be simultaneously org-shared AND publicly linked, and
--          turning one off must never turn the other off by accident.
--
-- Who may share: UNLIKE projects and connectors, the write side here is the
--          artifact's OWNER, not an org admin. Sharing a project hands the org
--          somebody's workspace, and sharing a connector hands the org the
--          EFFECT of somebody's bearer token, so both are org-level acts. An
--          artifact is a document the caller already owns and can already make
--          world-readable through 0095 on their own authority; requiring an
--          admin to narrow that exposure to the workspace would make the safer
--          option the harder one. The owner must still be a member of the
--          organization they are sharing into, resolved from
--          `organization_members` by `app_has_org_role` (0076), so org scope
--          cannot be forged from a client.
--
-- Fails  : `app_org_resource_is_readable(NULL)` is false, every policy is bound
-- closed   `TO app_rls` (the non-BYPASSRLS role), and the anonymous read path
--          in lib/services/published-artifact-service.ts now demands
--          `visibility = 'public'` in the statement as well. A row that names
--          an organization is therefore unreadable through the public page even
--          if its token leaks.
--
-- Depends: 0015_organizations, 0037_rls_user_isolation (app_rls,
--          current_app_user_id), 0076_enterprise_control_plane_tables
--          (app_has_org_role, set_row_updated_at), 0086_org_shared_ecosystem
--          (app_org_resource_is_readable, app_org_resource_is_manageable),
--          0095_published_artifacts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Is the anonymous token path open?
--
-- 'public'       — knowledge of the token is the read grant, exactly as 0095.
-- 'organization' — the token page refuses; only a signed-in member holding a
--                  grant row below can open it.
--
-- Defaulted to 'public' and NOT backfilled to anything else, so applying this
-- migration changes the visibility of no existing artifact.
-- ---------------------------------------------------------------------------
alter table public.published_artifacts
  add column if not exists visibility text not null default 'public';

alter table public.published_artifacts
  drop constraint if exists published_artifacts_visibility_check;

alter table public.published_artifacts
  add constraint published_artifacts_visibility_check
  check (visibility in ('public', 'organization'));

-- ---------------------------------------------------------------------------
-- The grant row.
--
-- One artifact belongs to at most one organization's shared set, for the same
-- reason a project does: "who can see this" must have a single answer.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_shared_artifacts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  published_artifact_id uuid not null references public.published_artifacts(id) on delete cascade,
  shared_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, published_artifact_id)
);

create unique index if not exists idx_org_shared_artifacts_artifact
  on public.organization_shared_artifacts (published_artifact_id);

create index if not exists idx_org_shared_artifacts_org_created
  on public.organization_shared_artifacts (organization_id, created_at desc);

drop trigger if exists set_org_shared_artifacts_updated_at on public.organization_shared_artifacts;
create trigger set_org_shared_artifacts_updated_at
  before update on public.organization_shared_artifacts
  for each row execute function public.set_row_updated_at();

grant select, insert, update, delete on public.organization_shared_artifacts to app_rls;

alter table public.organization_shared_artifacts enable row level security;
alter table public.organization_shared_artifacts force row level security;

-- Read: every member of the owning organization. That is what a shared surface
-- is for, and it is what lets the settings list show a member what is shared.
drop policy if exists organization_shared_artifacts_member_read on public.organization_shared_artifacts;
create policy organization_shared_artifacts_member_read
  on public.organization_shared_artifacts for select to app_rls
  using (public.app_org_resource_is_readable(organization_id));

-- Write: the artifact's owner, sharing into an organization they belong to. The
-- ownership test reads `published_artifacts` directly rather than trusting the
-- route, so a member cannot mint a grant for somebody else's artifact even with
-- a forged request body.
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

-- ---------------------------------------------------------------------------
-- Let members SELECT a shared artifact.
--
-- An ADDITIONAL permissive policy on `published_artifacts`. Postgres OR's
-- permissive policies per command, so this widens SELECT only: 0095's owner
-- policies remain the sole gate on INSERT, UPDATE and DELETE, and each still
-- demands `user_id = current_app_user_id()`. A member can open a shared
-- artifact and can never edit, republish or revoke it through RLS.
--
-- Revocation is enforced here rather than only in a route: dropping the
-- membership row makes `app_has_org_role` false, and deleting the grant row
-- removes the EXISTS, so either one closes the read on the next statement.
-- ---------------------------------------------------------------------------
drop policy if exists published_artifacts_org_shared_read on public.published_artifacts;
create policy published_artifacts_org_shared_read
  on public.published_artifacts for select to app_rls
  using (
    exists (
      select 1
        from public.organization_shared_artifacts share
       where share.published_artifact_id = published_artifacts.id
         and public.app_org_resource_is_readable(share.organization_id)
    )
  );

comment on table public.organization_shared_artifacts is
  'Org sharing grant for a published_artifacts row. Absence of a row means personal. Un-sharing is a DELETE and restores personal visibility. Written by the artifact owner, read by every member.';

comment on column public.published_artifacts.visibility is
  'Whether the ANONYMOUS token page serves this row. public = knowledge of the token is the read grant (0095 behaviour); organization = the token page refuses and only a member holding an organization_shared_artifacts grant may read it.';

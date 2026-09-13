-- =============================================================================
-- Migration 0186: organization sharing for shared conversations (AGI-10).
--
-- Why    : 0051 gave a conversation share exactly one audience, "anyone holding
--          the 144-bit token, until it expires". 0184 gave published artifacts
--          the second audience a team customer actually asks for, every member
--          of their workspace and nobody else, and left conversations behind.
--          This is that same audience for `shared_sessions`.
--
-- Model  : identical to 0184, deliberately, so the two surfaces cannot drift.
--            * `shared_sessions.visibility` answers "is the ANONYMOUS token
--              path open for this row?" It is a property of the share, not a
--              grant, and defaults to 'public' so every existing link keeps
--              exactly today's behaviour.
--            * `organization_shared_sessions` is the GRANT ROW: which org may
--              read it, who granted it, when. Absent a grant row the share is
--              personal (plus its public link if visibility says so), and
--              un-sharing is a DELETE that restores that state.
--          Two audiences can be open at once, so one column cannot carry both:
--          turning the workspace share off must never also revoke the link.
--
-- Expiry : unchanged and still enforced in the page, not here. A workspace
--          share expires on the same clock as a public one, because the row is
--          the same row; nothing about org membership extends it.
--
-- Who may share: the share's OWNER, the same answer 0184 gave for artifacts and
--          for the same reason. The owner can already publish this transcript
--          to the whole internet on their own authority, so requiring an admin
--          to NARROW that exposure to the workspace would make the safer option
--          the harder one. Org scope is resolved from `organization_members` by
--          `app_has_org_role` (0076), so it cannot be forged from a client.
--
-- RLS    : `shared_sessions` had row level security disabled and no grants for
--          `app_rls` at all, because every reader of it was the anonymous token
--          path on the BYPASSRLS pool. A member read is the first statement
--          that has a subject, so the table gets policies and the two grants
--          those statements need, SELECT and UPDATE. The anonymous path is
--          untouched: it still runs on the owner pool and now also demands
--          `visibility = 'public'` in the statement.
--
-- Fails  : `app_org_resource_is_readable(NULL)` is false, every policy is bound
-- closed   `TO app_rls`, and the public page's lookup filters on visibility. A
--          row that names an organization is therefore unreadable through the
--          public page even if its token leaks.
--
-- Policy shape: per-command write policies, never FOR ALL. 0185 records what a
--          FOR ALL policy on a grant table costs: it governs SELECT too, so
--          reading the grant table evaluates its ownership EXISTS against the
--          shared table, whose org-shared read policy reads the grant table
--          again, and Postgres raises 42P17 on every statement.
--
-- Depends: 0015_organizations, 0037_rls_user_isolation (app_rls,
--          current_app_user_id), 0051_shared_sessions,
--          0076_enterprise_control_plane_tables (app_has_org_role,
--          set_row_updated_at), 0086_org_shared_ecosystem
--          (app_org_resource_is_readable, app_org_resource_is_manageable),
--          0184_organization_shared_artifacts (the shape this mirrors).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Is the anonymous token path open?
--
-- 'public'       — knowledge of the token is the read grant, exactly as 0051.
-- 'organization' — the token page refuses; only a signed-in member holding a
--                  grant row below can open it.
--
-- Defaulted to 'public' and NOT backfilled, so applying this migration changes
-- the audience of no existing share.
-- ---------------------------------------------------------------------------
alter table public.shared_sessions
  add column if not exists visibility text not null default 'public';

alter table public.shared_sessions
  drop constraint if exists shared_sessions_visibility_check;

alter table public.shared_sessions
  add constraint shared_sessions_visibility_check
  check (visibility in ('public', 'organization'));

-- ---------------------------------------------------------------------------
-- The grant row.
--
-- One share belongs to at most one organization's shared set, for the same
-- reason a project does: "who can see this" must have a single answer.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_shared_sessions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shared_session_id uuid not null references public.shared_sessions(id) on delete cascade,
  shared_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, shared_session_id)
);

create unique index if not exists idx_org_shared_sessions_session
  on public.organization_shared_sessions (shared_session_id);

create index if not exists idx_org_shared_sessions_org_created
  on public.organization_shared_sessions (organization_id, created_at desc);

drop trigger if exists set_org_shared_sessions_updated_at on public.organization_shared_sessions;
create trigger set_org_shared_sessions_updated_at
  before update on public.organization_shared_sessions
  for each row execute function public.set_row_updated_at();

grant select, insert, update, delete on public.organization_shared_sessions to app_rls;

alter table public.organization_shared_sessions enable row level security;
alter table public.organization_shared_sessions force row level security;

-- Read: every member of the owning organization. That is what a shared surface
-- is for, and it is what lets the sharing console show a member what is shared.
-- It touches no other table, which is what keeps the cycle 0185 found closed.
drop policy if exists organization_shared_sessions_member_read on public.organization_shared_sessions;
create policy organization_shared_sessions_member_read
  on public.organization_shared_sessions for select to app_rls
  using (public.app_org_resource_is_readable(organization_id));

-- Write: the share's owner, sharing into an organization they belong to, or an
-- org admin withdrawing one. The ownership test reads `shared_sessions`
-- directly rather than trusting the route, so a member cannot mint a grant for
-- somebody else's conversation even with a forged request body.
drop policy if exists organization_shared_sessions_owner_insert on public.organization_shared_sessions;
create policy organization_shared_sessions_owner_insert
  on public.organization_shared_sessions for insert to app_rls
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.shared_sessions session
       where session.id = organization_shared_sessions.shared_session_id
         and session.owner_id = public.current_app_user_id()
    )
  );

drop policy if exists organization_shared_sessions_owner_update on public.organization_shared_sessions;
create policy organization_shared_sessions_owner_update
  on public.organization_shared_sessions for update to app_rls
  using (
    public.app_org_resource_is_readable(organization_id)
    and (
      public.app_org_resource_is_manageable(organization_id)
      or exists (
        select 1
          from public.shared_sessions session
         where session.id = organization_shared_sessions.shared_session_id
           and session.owner_id = public.current_app_user_id()
      )
    )
  )
  with check (
    public.app_org_resource_is_readable(organization_id)
    and shared_by_user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.shared_sessions session
       where session.id = organization_shared_sessions.shared_session_id
         and session.owner_id = public.current_app_user_id()
    )
  );

drop policy if exists organization_shared_sessions_owner_delete on public.organization_shared_sessions;
create policy organization_shared_sessions_owner_delete
  on public.organization_shared_sessions for delete to app_rls
  using (
    public.app_org_resource_is_readable(organization_id)
    and (
      public.app_org_resource_is_manageable(organization_id)
      or exists (
        select 1
          from public.shared_sessions session
         where session.id = organization_shared_sessions.shared_session_id
           and session.owner_id = public.current_app_user_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Row level security on the share table itself.
--
-- SELECT and UPDATE are the only grants any scoped statement needs: the member
-- read, the owner's own read of the share they are re-aiming, and the audience
-- write. Creating and revoking a share stay on the anonymous-token routes,
-- which run on the owner pool and are allowlisted for it.
-- ---------------------------------------------------------------------------
grant select, update on public.shared_sessions to app_rls;

alter table public.shared_sessions enable row level security;
alter table public.shared_sessions force row level security;

drop policy if exists shared_sessions_owner_read on public.shared_sessions;
create policy shared_sessions_owner_read
  on public.shared_sessions for select to app_rls
  using (owner_id = public.current_app_user_id());

drop policy if exists shared_sessions_owner_update on public.shared_sessions;
create policy shared_sessions_owner_update
  on public.shared_sessions for update to app_rls
  using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

-- An ADDITIONAL permissive policy. Postgres OR's permissive policies per
-- command, so this widens SELECT only: the owner policies above remain the sole
-- gate on UPDATE, and each still demands `owner_id = current_app_user_id()`. A
-- member can open a shared conversation and can never re-aim or revoke it.
--
-- Revocation is enforced here rather than only in a route: dropping the
-- membership row makes `app_has_org_role` false, and deleting the grant row
-- removes the EXISTS, so either one closes the read on the next statement.
drop policy if exists shared_sessions_org_shared_read on public.shared_sessions;
create policy shared_sessions_org_shared_read
  on public.shared_sessions for select to app_rls
  using (
    exists (
      select 1
        from public.organization_shared_sessions share
       where share.shared_session_id = shared_sessions.id
         and public.app_org_resource_is_readable(share.organization_id)
    )
  );

comment on table public.organization_shared_sessions is
  'Org sharing grant for a shared_sessions row. Absence of a row means personal. Un-sharing is a DELETE and restores personal visibility. Read by every member; written by the share owner or an org admin through per-command policies, never FOR ALL: a FOR ALL policy here also governs SELECT and recurses through shared_sessions_org_shared_read.';

comment on column public.shared_sessions.visibility is
  'Whether the ANONYMOUS token page serves this row. public = knowledge of the token is the read grant (0051 behaviour); organization = the token page refuses and only a member holding an organization_shared_sessions grant may read it. Expiry applies to both.';

-- =============================================================================
-- Migration 0086: organization shared ecosystem — shared projects + connectors
--
-- Why    : Migration 0073 gave every content root an `organization_id` and a
--          tenancy predicate, but that predicate answers a GOVERNANCE question
--          ("may an org admin audit this row?"), not a SHARING one ("may every
--          member open this project?"). `app_row_is_visible` deliberately
--          admits only ('owner','admin') of the ACTIVE org, and it is applied
--          by twelve policies including `api_keys`, `usage_events` and
--          `user_memories`. Widening that one role list to include 'member'
--          would hand every member of every org their admins' API keys and
--          billing usage. It must not be touched.
--
--          So sharing gets its OWN predicates and its OWN join tables. An org
--          membership is currently a billing container with no shared surface;
--          this migration is what makes membership mean something.
--
-- Model  : Sharing is a GRANT ROW, never a flag on the content row.
--            * `organization_shared_projects`  (organization_id, project_id)
--            * `organization_project_access`   per-member override on a share
--            * `organization_shared_connectors`(organization_id, connector row)
--          Nothing is backfilled. Absent a grant row, every project and every
--          connector keeps exactly today's personal visibility, so this
--          migration is behaviour-preserving on apply.
--
-- Fails  : `app_org_resource_is_readable(NULL)` is false, and
-- closed   `app_has_org_role` resolves membership from the TABLE for the
--          authenticated subject, so a client cannot forge org scope. Every
--          new policy is bound `TO app_rls` (the non-BYPASSRLS role), and the
--          WITH CHECK side of every sharing table demands owner/admin, so a
--          plain member can read the share set but can never extend it.
--
-- Membership-based, not GUC-based, on the READ side: no client in this repo
--          sends `x-agi-organization-id` today (grep: three definition sites,
--          zero setters), so `current_app_org_id()` is NULL on every real
--          request. A read predicate built on the GUC would ship dead. Sharing
--          therefore reads through `app_has_org_role` (0076), which resolves
--          from `organization_members` regardless of the scope selector. The
--          GUC path stays untouched for the 0073 governance predicate and for
--          `app_row_is_writable`, so tenancy still cannot be forged on write.
--
-- Depends: 0015_organizations, 0037_rls_user_isolation (app_rls,
--          current_app_user_id), 0053/0073 (user_projects.organization_id),
--          0060_free_tier_token_budget (assert_user_resource_limit shape),
--          0076_enterprise_control_plane_tables (app_has_org_role,
--          set_row_updated_at).
--
-- NOT here: `teams` / `team_members` / any second membership system. 0058
--          dropped that shape for good reasons (competing role vocabulary with
--          no owner, never RLS-hardened, dead readers). "Team" is a PLAN NAME;
--          the tenant entity is `organizations` and the membership row is
--          `organization_members`. Everything below hangs off those two.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sharing predicates. Separate functions, separate names, used ONLY by the
-- sharing tables and the shared read paths below. Keeping them textually
-- distinct from `app_row_is_visible` is the whole point: a future widening of
-- sharing can never accidentally widen api_keys / usage_events visibility.
-- ---------------------------------------------------------------------------
create or replace function public.app_org_resource_is_readable(row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_org_id is not null
     and public.app_has_org_role(
           row_org_id,
           array['owner', 'admin', 'member', 'viewer']::text[]
         );
$$;

create or replace function public.app_org_resource_is_manageable(row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_org_id is not null
     and public.app_has_org_role(row_org_id, array['owner', 'admin']::text[]);
$$;

revoke all on function public.app_org_resource_is_readable(uuid) from public;
revoke all on function public.app_org_resource_is_manageable(uuid) from public;
grant execute on function public.app_org_resource_is_readable(uuid) to app_rls;
grant execute on function public.app_org_resource_is_manageable(uuid) to app_rls;

-- ---------------------------------------------------------------------------
-- Shared projects.
--
-- A join table rather than reusing `user_projects.organization_id`, because
-- that column already means "workspace-owned and admin-auditable" (0073). One
-- bit cannot mean both "an admin may audit this" and "every member may open
-- this" — you could never un-share without also un-governing.
--
-- The project's owner row is untouched: the owner still owns it, still writes
-- it, and un-sharing is a single DELETE that restores personal visibility.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_shared_projects (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.user_projects(id) on delete cascade,
  shared_by_user_id text not null,
  default_access text not null default 'read' check (default_access in ('read', 'write')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, project_id)
);

-- A project may be shared into at most one organization. Without this a row
-- could be granted to two orgs at once, and "who can see this" would have no
-- single answer.
create unique index if not exists idx_org_shared_projects_project
  on public.organization_shared_projects (project_id);

create index if not exists idx_org_shared_projects_org_created
  on public.organization_shared_projects (organization_id, created_at desc);

drop trigger if exists set_org_shared_projects_updated_at on public.organization_shared_projects;
create trigger set_org_shared_projects_updated_at
  before update on public.organization_shared_projects
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- Per-member access override on a shared project.
--
-- The composite FK to `organization_members` is load-bearing: removing a member
-- CASCADE-deletes every grant they held, so revocation cannot be forgotten by
-- application code. `access = 'none'` is an explicit denial that overrides the
-- share's `default_access`.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_project_access (
  organization_id uuid not null,
  project_id uuid not null,
  user_id text not null,
  access text not null check (access in ('read', 'write', 'none')),
  granted_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, project_id, user_id),
  constraint organization_project_access_share_fk
    foreign key (organization_id, project_id)
    references public.organization_shared_projects (organization_id, project_id)
    on delete cascade,
  constraint organization_project_access_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade
);

create index if not exists idx_org_project_access_user
  on public.organization_project_access (user_id, organization_id);

drop trigger if exists set_org_project_access_updated_at on public.organization_project_access;
create trigger set_org_project_access_updated_at
  before update on public.organization_project_access
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- Shared connectors (custom remote MCP servers).
--
-- `org_short_id` is REQUIRED, not convenience. The chat-facing server id is
-- `custom-<short_id>` and `short_id` is unique only per (user_id, short_id)
-- (see lib/user-connector-tools.ts). Emitting a shared connector under the
-- owner's personal short id would (a) collide with another member's personal
-- connector inside one conversation and (b) cross-wire
-- `connector_tool_permissions`, which is keyed (user_id, connector_id,
-- tool_name). Shared connectors get their own org-stable id and their own
-- `orgmcp-` prefix so the tool loop can tell the two namespaces apart and
-- per-member permission verdicts stay stably keyed.
--
-- Members INVOKE a shared connector. They never read the encrypted credential
-- column on `user_custom_connectors` (no policy below touches that table), never
-- edit the URL, and never delete the row — sharing a connector shares the
-- EFFECT of its bearer token, not the token.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_shared_connectors (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_row_id uuid not null references public.user_custom_connectors(id) on delete cascade,
  org_short_id text not null check (org_short_id ~ '^[0-9a-f]{10}$'),
  shared_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, connector_row_id)
);

create unique index if not exists idx_org_shared_connectors_short_id
  on public.organization_shared_connectors (organization_id, org_short_id);

-- One connector row belongs to one org's shared set, for the same reason a
-- project does: a single answer to "who can use this credential".
create unique index if not exists idx_org_shared_connectors_row
  on public.organization_shared_connectors (connector_row_id);

create index if not exists idx_org_shared_connectors_org_created
  on public.organization_shared_connectors (organization_id, created_at desc);

drop trigger if exists set_org_shared_connectors_updated_at on public.organization_shared_connectors;
create trigger set_org_shared_connectors_updated_at
  before update on public.organization_shared_connectors
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- Org-wide resource ceiling.
--
-- The org sibling of `assert_user_resource_limit` (0060), keyed on the
-- organization instead of the user. Same contract: NULL limit is uncapped, a
-- negative limit raises 22023, and the transaction-scoped advisory lock is
-- taken BEFORE the count so two admins sharing the 25th and 26th connector
-- concurrently serialize instead of both seeing one free slot. Routes call it
-- from inside the same transaction as their INSERT CTE, so a failure rolls the
-- write back.
--
-- The error message shape matches 0060 exactly so the TypeScript detector can
-- have an org sibling without a second error vocabulary.
-- ---------------------------------------------------------------------------
create or replace function public.assert_org_resource_limit(
  p_resource text,
  p_organization_id uuid,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  if p_limit is null then
    return true;
  end if;

  if p_limit < 0 then
    raise exception 'invalid_org_resource_limit' using errcode = '22023';
  end if;

  if p_organization_id is null then
    raise exception 'invalid_org_resource_limit' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agi:org-resource:' || p_resource || ':' || p_organization_id::text, 0)
  );

  case p_resource
    when 'org_shared_projects' then
      select count(*) into v_count
        from public.organization_shared_projects s
        join public.user_projects p on p.id = s.project_id
       where s.organization_id = p_organization_id
         and p.deleted_at is null;
    when 'org_shared_connectors' then
      select count(*) into v_count
        from public.organization_shared_connectors
       where organization_id = p_organization_id;
    else
      raise exception 'unknown_org_resource' using errcode = '22023';
  end case;

  if v_count > p_limit then
    raise exception 'org_resource_limit_reached'
      using errcode = 'P0001', detail = p_resource;
  end if;

  return true;
end;
$$;

revoke execute on function public.assert_org_resource_limit(text, uuid, integer) from public;
grant execute on function public.assert_org_resource_limit(text, uuid, integer) to app_rls;

-- ---------------------------------------------------------------------------
-- RLS on the sharing tables.
--
-- Read  : every member of the owning org (owner/admin/member/viewer) — that is
--         the entire point of a shared surface.
-- Write : owner/admin only. A plain member can see WHAT is shared but can
--         never extend the share set, grant themselves write, or un-share.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.organization_shared_projects,
  public.organization_project_access,
  public.organization_shared_connectors
to app_rls;

alter table public.organization_shared_projects enable row level security;
alter table public.organization_shared_projects force row level security;
drop policy if exists organization_shared_projects_member_read on public.organization_shared_projects;
create policy organization_shared_projects_member_read
  on public.organization_shared_projects for select to app_rls
  using (public.app_org_resource_is_readable(organization_id));
drop policy if exists organization_shared_projects_admin_write on public.organization_shared_projects;
create policy organization_shared_projects_admin_write
  on public.organization_shared_projects for all to app_rls
  using (public.app_org_resource_is_manageable(organization_id))
  with check (public.app_org_resource_is_manageable(organization_id));

alter table public.organization_project_access enable row level security;
alter table public.organization_project_access force row level security;
drop policy if exists organization_project_access_member_read on public.organization_project_access;
create policy organization_project_access_member_read
  on public.organization_project_access for select to app_rls
  using (public.app_org_resource_is_readable(organization_id));
drop policy if exists organization_project_access_admin_write on public.organization_project_access;
create policy organization_project_access_admin_write
  on public.organization_project_access for all to app_rls
  using (public.app_org_resource_is_manageable(organization_id))
  with check (public.app_org_resource_is_manageable(organization_id));

alter table public.organization_shared_connectors enable row level security;
alter table public.organization_shared_connectors force row level security;
drop policy if exists organization_shared_connectors_member_read on public.organization_shared_connectors;
create policy organization_shared_connectors_member_read
  on public.organization_shared_connectors for select to app_rls
  using (public.app_org_resource_is_readable(organization_id));
drop policy if exists organization_shared_connectors_admin_write on public.organization_shared_connectors;
create policy organization_shared_connectors_admin_write
  on public.organization_shared_connectors for all to app_rls
  using (public.app_org_resource_is_manageable(organization_id))
  with check (public.app_org_resource_is_manageable(organization_id));

-- ---------------------------------------------------------------------------
-- Let members SELECT a shared project.
--
-- This is an ADDITIONAL permissive policy on `user_projects`. Postgres OR's
-- permissive policies per command, so it widens SELECT only: 0073's
-- `user_projects_tenant_isolation` (FOR ALL) remains the sole gate on
-- INSERT/UPDATE/DELETE, and its USING/WITH CHECK still demand ownership. A
-- member can therefore open a shared project and can never modify or delete
-- it through RLS in this slice.
--
-- `access = 'none'` in the per-member override is an explicit denial and is
-- honoured here, so revoking one member's access is enforced by the DATABASE,
-- not only by the route.
-- ---------------------------------------------------------------------------
drop policy if exists user_projects_org_shared_read on public.user_projects;
create policy user_projects_org_shared_read
  on public.user_projects for select to app_rls
  using (
    exists (
      select 1
        from public.organization_shared_projects s
       where s.project_id = user_projects.id
         and public.app_org_resource_is_readable(s.organization_id)
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

-- ---------------------------------------------------------------------------
-- project_knowledge_files: follow the PROJECT's visibility, not the project
-- OWNER.
--
-- 0037 scoped this child table through `user_projects WHERE user_id =
-- current_app_user_id()`, and 0073 explicitly left child tables to "inherit
-- isolation through a subquery on their parent" — but that subquery still
-- filters on the owner. Left as-is, a shared project's knowledge files would
-- be invisible to every member but the owner, which silently guts the point of
-- sharing a project.
--
-- The asymmetry is deliberate: members READ knowledge files on a shared
-- project; only the owner WRITES them. Widening write is a separate decision.
-- ---------------------------------------------------------------------------
drop policy if exists project_knowledge_files_user_isolation on public.project_knowledge_files;
drop policy if exists project_knowledge_files_tenant_isolation on public.project_knowledge_files;
create policy project_knowledge_files_tenant_isolation
  on public.project_knowledge_files
  for all to app_rls
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
  )
  with check (
    project_id in (
      select p.id
        from public.user_projects p
       where p.user_id = public.current_app_user_id()
    )
  );

comment on table public.organization_shared_projects is
  'Org sharing grant for a user_projects row. Absence of a row means personal. Un-sharing is a DELETE and restores personal visibility.';
comment on table public.organization_project_access is
  'Per-member override on a shared project. access=''none'' is an explicit denial enforced by RLS, not only by the route.';
comment on table public.organization_shared_connectors is
  'Org sharing grant for a user_custom_connectors row. Members invoke the connector under orgmcp-<org_short_id>; they never read the stored credential.';

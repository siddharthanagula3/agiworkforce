-- 0240 : who made this row, who last wrote it, and from which surface.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Ownership on a resource table means `user_id` and, since 0073,
-- `organization_id`. Neither says who acted. A conversation moved by a
-- workspace admin, a message written by a support agent under a break-glass
-- grant and a row imported by a migration are indistinguishable afterwards:
-- all three read as the owner's own work. `created_by` and `updated_by` are
-- the two columns that separate the account a row belongs to from the
-- principal that wrote it, and `origin_surface` records which product wrote
-- it, the same vocabulary cloud_agent_runs has carried since 0061.
--
-- The three columns are filled by the database, not by each route.
-- `set_resource_provenance()` reads the same GUC every RLS policy already
-- reads, so a write through the RLS-scoped connection records its actor with
-- no call-site change, and a write on the owner connection (migrations, the
-- admin path) records none rather than guessing.
--
-- Nothing is backfilled, deliberately. Both tables carry the sync trigger from
-- 0038, which assigns a fresh `server_version` on every UPDATE: a backfill
-- statement would re-version every conversation and every message on the
-- platform, invalidate every client's delta cursor and force a full re-pull
-- for every user, to record a value that is not actually known for historic
-- rows. NULL here means "not recorded", which is the truth.
--
-- The contract these columns satisfy is
-- packages/contracts/types/src/concept-registry.json (columnContract), and
-- scripts/check-concept-registry.mjs fails when a table created after this
-- point carries none of them.
--
-- Depends: 0001_mvp_chat (web_conversations, web_messages)
--          0037_rls_user_isolation (current_app_user_id)
--          0038_cloud_sync_versioning (the trigger this must not fight)

begin;

create or replace function public.set_resource_provenance()
returns trigger as $$
declare
  v_actor text := nullif(public.current_app_user_id(), '');
  v_surface text := nullif(current_setting('request.surface', true), '');
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, v_actor);
    new.updated_by := coalesce(new.updated_by, new.created_by);
    new.origin_surface := coalesce(new.origin_surface, v_surface);
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(v_actor, new.updated_by, old.updated_by);
    new.origin_surface := coalesce(new.origin_surface, old.origin_surface);
  end if;
  return new;
end;
$$ language plpgsql;

alter table public.web_conversations
  add column if not exists created_by text,
  add column if not exists updated_by text,
  add column if not exists origin_surface text;

alter table public.web_messages
  add column if not exists created_by text,
  add column if not exists updated_by text,
  add column if not exists origin_surface text;

-- The surface list is packages/contracts/types/src/concept-registry.json
-- (originSurfaces). A value outside it is a surface nothing can attribute.
alter table public.web_conversations
  drop constraint if exists web_conversations_origin_surface_check,
  add constraint web_conversations_origin_surface_check
    check (
      origin_surface is null
      or origin_surface = any (
        array['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome', 'api']
      )
    );

alter table public.web_messages
  drop constraint if exists web_messages_origin_surface_check,
  add constraint web_messages_origin_surface_check
    check (
      origin_surface is null
      or origin_surface = any (
        array['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome', 'api']
      )
    );

drop trigger if exists trg_web_conversations_provenance on public.web_conversations;
create trigger trg_web_conversations_provenance
  before insert or update on public.web_conversations
  for each row execute function public.set_resource_provenance();

drop trigger if exists trg_web_messages_provenance on public.web_messages;
create trigger trg_web_messages_provenance
  before insert or update on public.web_messages
  for each row execute function public.set_resource_provenance();

create index if not exists idx_web_conversations_created_by
  on public.web_conversations(created_by)
  where created_by is not null;

commit;

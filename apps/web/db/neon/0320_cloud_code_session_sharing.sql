-- =============================================================================
-- Migration 0318: a Code session's owner shares it with their team or by link
--
-- Why    : Copy link on a Code session copied the owner's own page address,
--          and every Code read is owner-scoped, so anyone else who opened it
--          got a 404 and nothing was shared. Claude Code on the web shares a
--          session by its visibility: Private or Team for a workspace, Private
--          or Public for a personal account, and a recipient sees the session
--          as it stands when they open the link.
--
-- Shape  : share_visibility is the audience the owner chose. share_token is
--          the address of the shared view; it exists exactly while the session
--          is shared, so making a session private again kills every link to it
--          and sharing it again mints a new one. Team needs a workspace and
--          Public needs a personal session, as in Claude. Every existing row
--          is private with no token, which is what the defaults say.
--
-- Access : app_shared_cloud_code_session answers one question for the signed
--          in caller: which session, if any, this token opens for them. Public
--          opens for any signed-in account. Team opens for an active member of
--          the session's workspace who may read its shared content, checked
--          through app_has_org_permission. The owner's policy on
--          cloud_code_sessions is unchanged, so nothing but this function
--          reads another account's session.
--
-- Depends: 0075 (cloud_code_sessions), 0200 (app_org_resource_is_readable),
--          0272 (active membership)
-- =============================================================================

begin;

alter table public.cloud_code_sessions
  add column if not exists share_visibility text not null default 'private',
  add column if not exists share_token text;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_share_check,
  add constraint cloud_code_sessions_share_check
    check (
      share_visibility in ('private', 'team', 'public')
      and (share_token is null or share_token ~ '^[A-Za-z0-9_-]{24}$')
      and ((share_visibility = 'private') = (share_token is null))
      and (share_visibility <> 'team' or organization_id is not null)
      and (share_visibility <> 'public' or organization_id is null)
    );

create unique index if not exists cloud_code_sessions_share_token_idx
  on public.cloud_code_sessions (share_token)
  where share_token is not null;

create or replace function public.app_shared_cloud_code_session(p_share_token text)
returns table (
  session_id uuid,
  owner_user_id text,
  organization_id uuid,
  share_visibility text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.user_id, s.organization_id, s.share_visibility
    from public.cloud_code_sessions s
   where s.share_token = p_share_token
     and nullif(public.current_app_user_id(), '') is not null
     and (
       s.share_visibility = 'public'
       or (
         s.share_visibility = 'team'
         and public.app_org_resource_is_readable(s.organization_id)
       )
     );
$$;

revoke all on function public.app_shared_cloud_code_session(text) from public;
grant execute on function public.app_shared_cloud_code_session(text) to app_rls;

comment on column public.cloud_code_sessions.share_visibility is
  'Who besides the owner may open the session: private, team (members of its workspace) or public (any signed-in account).';

comment on column public.cloud_code_sessions.share_token is
  'Address of the shared view while the session is shared; null while it is private.';

commit;

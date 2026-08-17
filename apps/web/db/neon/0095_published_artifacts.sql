-- 0095_published_artifacts.sql
--
-- Sites-style artifact publishing (CAP-015 slice 1).
--
-- packages/platform/artifacts/src/artifacts.ts has shipped a `CloudPublisher`
-- seam since AUDIT-FIX ART-27, and its own docs said the honest truth: "No
-- surface ships a CloudPublisher yet, so byok/managed publish currently
-- resolves to { kind: 'unavailable' } everywhere." This table is the storage
-- behind the first real adapter (apps/web), so the Publish action stops being
-- a clipboard copy and becomes a durable, revocable public URL.
--
-- Shape mirrors the conversation share precedent (public.shared_sessions +
-- app/share/[token]/page.tsx) one concept at a time:
--   token        — unguessable 24-char base64url handle (144 bits of entropy),
--                  minted server-side with crypto.randomBytes. Knowledge of the
--                  token IS the read grant, exactly as for shared_sessions.
--   user_id      — the publisher; the only principal who may list or unpublish.
--   content/kind — the artifact bytes and the renderer the public page must use.
--
-- DELIBERATE DIFFERENCES FROM shared_sessions
--
-- 1. No expiry column at all. Conversation shares expire after 7 days; published
--    artifacts do not. TTL is FOUNDER-PENDING for CAP-015 and no window has been
--    chosen, so this migration does not invent one — a column defaulted to some
--    arbitrary window would silently start removing user-visible pages on a
--    policy nobody approved. Revocation is explicit
--    (DELETE /api/artifacts/publish/[token]) and is the only removal path.
--    The per-user cap is NOT a column either: it is enforced by
--    MAX_PUBLISHED_PER_USER in lib/services/published-artifact-service.ts, which
--    counts live rows before the insert and refuses with a 409 the publisher can
--    act on. A CHECK constraint cannot count sibling rows, and a trigger would
--    surface the refusal as an opaque database error.
--
-- 2. `kind` is CHECK-constrained to the artifact kinds the public renderer can
--    actually serve (apps/web/lib/artifact-sandbox.ts `ArtifactKind`). html,
--    react and mermaid execute script and are served ONLY through the
--    cross-origin sandbox frame; svg renders as an inert <img> and
--    markdown/text/code render inline under a strict CSP. Anything
--    else (pdf/docx/image bytes, spreadsheet/presentation/email renderers) has
--    no safe public serving path yet and is rejected at the API rather than
--    stored as a row the page cannot honour.
--
-- 3. `unique (user_id, artifact_id)` makes republish an UPSERT: the same
--    artifact keeps the same public URL as its content is edited, and a
--    double-click cannot mint two live pages for one artifact.

create table if not exists public.published_artifacts (
  id uuid primary key default gen_random_uuid(),
  -- 24-char base64url (randomBytes(18)) — same entropy as shared_sessions.
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  user_id text not null,
  -- The client-side artifact id this page was published from. Text, not uuid:
  -- artifact ids are content-derived strings from the chat artifact store.
  artifact_id text not null check (length(artifact_id) between 1 and 200),
  conversation_id uuid references public.web_conversations(id) on delete cascade,
  title text not null default '' check (length(title) <= 300),
  -- Must stay in step with ArtifactKind in apps/web/lib/artifact-sandbox.ts.
  kind text not null check (
    kind in ('html', 'react', 'svg', 'mermaid', 'markdown', 'text', 'code')
  ),
  -- Syntax-highlighting / source language hint for kind in ('code','text').
  language text check (language is null or length(language) <= 50),
  -- Raw artifact source. Capped so one publish cannot bloat a row; the API
  -- rejects oversize content with a 400 rather than truncating it silently.
  content text not null check (length(content) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, artifact_id)
);

-- "My published artifacts" management list: newest first, per publisher.
create index if not exists idx_published_artifacts_user_created
  on public.published_artifacts (user_id, created_at desc);

-- Conversation-scoped cleanup/lookup (which pages came out of this chat).
create index if not exists idx_published_artifacts_conversation
  on public.published_artifacts (conversation_id, created_at desc)
  where conversation_id is not null;

grant select, insert, update, delete on public.published_artifacts to app_rls;

alter table public.published_artifacts enable row level security;
alter table public.published_artifacts force row level security;

-- Owner-only isolation enforced in the database, not merely a where clause.
-- The public read path deliberately does NOT go through app_rls: it is an
-- anonymous token lookup served by the app-owner adapter, exactly as
-- app/share/[token]/page.tsx reads shared_sessions. RLS here protects the
-- authenticated management surface (list / republish / unpublish) so one
-- signed-in user can never enumerate or revoke another user's pages.
drop policy if exists published_artifacts_owner_read on public.published_artifacts;
create policy published_artifacts_owner_read
  on public.published_artifacts for select to app_rls
  using (user_id = public.current_app_user_id());

drop policy if exists published_artifacts_owner_insert on public.published_artifacts;
create policy published_artifacts_owner_insert
  on public.published_artifacts for insert to app_rls
  with check (
    user_id = public.current_app_user_id()
    and (
      conversation_id is null
      or exists (
        select 1
          from public.web_conversations as conversation
         where conversation.id = conversation_id
           and conversation.user_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists published_artifacts_owner_update on public.published_artifacts;
create policy published_artifacts_owner_update
  on public.published_artifacts for update to app_rls
  using (user_id = public.current_app_user_id())
  with check (
    user_id = public.current_app_user_id()
    and (
      conversation_id is null
      or exists (
        select 1
          from public.web_conversations as conversation
         where conversation.id = conversation_id
           and conversation.user_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists published_artifacts_owner_delete on public.published_artifacts;
create policy published_artifacts_owner_delete
  on public.published_artifacts for delete to app_rls
  using (user_id = public.current_app_user_id());

comment on table public.published_artifacts is
  'Publicly served artifact pages (CAP-015). Knowledge of the token is the read grant; there is no TTL yet (founder-pending) and revocation is explicit. The per-user cap is enforced in the app layer (MAX_PUBLISHED_PER_USER), not by a constraint here.';

comment on column public.published_artifacts.kind is
  'Renderer the public page must use. html/react/mermaid execute script and are served only through the cross-origin sandbox frame; svg renders as an inert img and markdown/text/code render inline under a strict CSP.';

comment on column public.published_artifacts.token is
  'Unguessable 24-char base64url handle (crypto.randomBytes(18)). Never derived from the artifact id — a derived token would be guessable from a shared chat.';

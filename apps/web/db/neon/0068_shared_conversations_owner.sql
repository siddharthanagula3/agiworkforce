-- 0068: bind shared conversations to an owner.
--
-- AUDIT-FIX BUG-19. POST /api/shared was fully unauthenticated with no owner
-- column, which meant:
--   (a) any anonymous caller could mint pages of fabricated "AI conversations"
--       on the product's own domain, with its TLS and reputation;
--   (b) growth was bounded only by a per-IP rate limit; and
--   (c) shares were unreachable from /api/user/delete-account and
--       /api/user/export, so account deletion and data portability were both
--       incomplete.
--
-- The route now requires authentication and records the creator. The column is
-- nullable so pre-existing rows (created while the endpoint was anonymous)
-- remain readable by token; they simply have no owner to attribute them to.
-- The GET path stays public on purpose — the unguessable token IS the
-- capability, which is the intended sharing model.

alter table public.shared_conversations
  add column if not exists user_id text;

create index if not exists idx_shared_conversations_user_id
  on public.shared_conversations(user_id)
  where user_id is not null;

-- =============================================================================
-- Migration 0203: memory expiry and superseded history on user_memories
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : A memory lived until someone deleted it, and a new fact on the same
--          single-valued topic ("User lives in Berlin" after "User lives in
--          Paris") sat beside the old one, so the model read both as true.
--
-- Shape  : `expires_at` is an optional end of life. Every read treats a row
--          past it as gone, and /api/cron/expire-memories soft-deletes and
--          blanks it so sync clients receive the deletion.
--
--          `superseded_by` / `superseded_at` keep the older fact as history
--          instead of overwriting it. The write path sets them when a newer
--          fact on the same topic wins by recency and source; active reads
--          exclude superseded rows. The id is the superseding row's id under
--          the same user_id, matching the (user_id, id) key from 0189.
--
-- Scope  : columns only. RLS, grants and erasure are unchanged: the table is
--          already user and organization scoped.
-- =============================================================================

begin;

alter table public.user_memories
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_by uuid,
  add column if not exists superseded_at timestamptz;

alter table public.user_memories
  drop constraint if exists user_memories_superseded_pair;
alter table public.user_memories
  add constraint user_memories_superseded_pair
  check ((superseded_by is null) = (superseded_at is null) and (superseded_by is null or superseded_by <> id));

comment on column public.user_memories.expires_at is
  'Optional end of life. Reads ignore a row past it; the expire-memories cron soft-deletes it.';
comment on column public.user_memories.superseded_by is
  'Id (same user_id) of the newer memory that replaced this one on the same topic. NULL while active.';

create index if not exists idx_user_memories_expiry_due
  on public.user_memories (expires_at)
  where is_deleted = false and expires_at is not null;

commit;

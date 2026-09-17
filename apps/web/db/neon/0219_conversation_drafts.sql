-- 0219 : a half-written message survives the machine it was typed on.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- The composer parks a draft in a zustand map and, for the unsaved surface,
-- in sessionStorage. Both die with the tab, so a message someone was part way
-- through was lost by closing the laptop, and was never on their phone at all,
-- while every other part of a conversation syncs across devices.
--
-- `draft` is that text, on the conversation it belongs to. `draft_updated_at`
-- is what lets two devices settle on the later one without a second table or a
-- version counter: the composer writes only when its own text is newer.
--
-- Writing a draft deliberately does NOT touch `updated_at` or `server_version`.
-- The sidebar orders by `updated_at`, so typing would otherwise pull a chat to
-- the top of the list with every debounce, and `server_version` guards the
-- conversation's own edits, which a draft is not one of.
--
-- A temporary chat never stores one: the route refuses it, for the same reason
-- the transcript is not stored.
--
-- No new table, so no new RLS policy, grant, erasure entry or export entry:
-- web_conversations is already user-owned, already classified, and a draft is
-- deleted with the conversation that holds it.

begin;

alter table public.web_conversations
  add column if not exists draft text,
  add column if not exists draft_updated_at timestamptz;

comment on column public.web_conversations.draft is
  'The unsent composer text for this conversation, so a half-written message survives a reload and reaches the user''s other devices. Never written for a temporary chat.';

comment on column public.web_conversations.draft_updated_at is
  'When the draft was last written, by which two devices settle on the later text. Independent of updated_at, which a draft write must not move.';

commit;

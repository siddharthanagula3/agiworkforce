-- 0156 — in-thread response variants: a parent pointer on every message and an
-- active leaf on every conversation.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- Regenerating an answer destroys the previous one today, and editing a question
-- destroys every turn after it. Both should keep the replaced turn as a sibling
-- the reader can page back to, and a sibling is not expressible in the flat
-- created_at ordering web_messages has had since 0001.
--
-- parent_id is the entire tree. A variant group is the set of rows sharing
-- (conversation_id, parent_id) — the regenerations of one answer, or the edits
-- of one question — ordered by (created_at, id). The visible transcript is the
-- ancestor chain of the conversation's active leaf, root to leaf.
--
-- active_leaf_message_id doubles as the discriminator that makes this migration
-- free for every conversation that never branches. Null means linear: the
-- transcript is still every row by created_at, which is today's query byte for
-- byte, with no backfill and no behaviour change. The first variant a
-- conversation is ever given stamps parents across its existing rows inside one
-- transaction and sets the leaf. A global backfill would instead rewrite every
-- user's history to buy nothing at all for the conversations that stay linear.
--
-- Both columns are nullable with no default because there is no honest value to
-- invent for rows written before the tree existed.
--
-- parent_id keeps the default NO ACTION rather than cascading. Deleting a whole
-- conversation still removes its messages in one statement and passes, while
-- deleting a single parented message fails loudly unless the route splices its
-- children onto their grandparent first. ON DELETE CASCADE would quietly take
-- the rest of the thread with it and SET NULL would quietly scatter orphan roots
-- through the transcript; a foreign key error is the outcome we can find.
-- active_leaf_message_id does clear itself, because a leaf pointing at a deleted
-- row has to degrade to "linear" rather than dangle.

alter table public.web_messages
  add column if not exists parent_id uuid references public.web_messages(id);

comment on column public.web_messages.parent_id is
  'Message this row answers or replaces. Null is a thread root. Rows sharing a parent are variants of one another, ordered by created_at then id.';

-- Paging a variant group and walking an ancestor chain both look rows up by
-- parent within one conversation, which the transcript index on
-- (conversation_id, created_at) cannot serve.
create index if not exists idx_web_messages_conversation_parent
  on public.web_messages (conversation_id, parent_id);

alter table public.web_conversations
  add column if not exists active_leaf_message_id uuid
    references public.web_messages(id) on delete set null;

comment on column public.web_conversations.active_leaf_message_id is
  'Deepest message on the visible path. Null means the conversation is linear and every row is on the path.';

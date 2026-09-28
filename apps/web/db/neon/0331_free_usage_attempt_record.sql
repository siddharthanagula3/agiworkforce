-- =============================================================================
-- Migration 0331: every Free generation attempt records how it ended
--
-- Why    : 0329 made each managed turn record its conversation, how it ended
--          and why it failed. A Free turn settles in free_daily_usage_reservations
--          instead, which had neither, and a Free turn on a free-pool route whose
--          windows were spent reserved nothing, so it left no row at all.
--
-- Shape  : the same three columns as 0329, with the same constraints.
--          conversation_id is set when the turn is reserved for a conversation
--          the caller owns and cleared if that conversation is deleted.
--          attempt_outcome is completed, failed or cancelled and
--          attempt_error_class is the failure class of a failed attempt; both
--          are written by the settlement that ends the attempt, and stay null
--          for a turn that only paused for input. A free-pool turn now writes a
--          zero-cost row, so reserved_microusd may be 0: it adds nothing to any
--          usage window and is settled without touching the trial ledger or
--          its usage events.
--
-- Depends: 0001 (public.web_conversations), 0065 (free_daily_usage_reservations),
--          0306, 0329
-- =============================================================================

begin;

alter table public.free_daily_usage_reservations
  drop constraint if exists free_daily_usage_reservations_reserved_microusd_check;

alter table public.free_daily_usage_reservations
  add constraint free_daily_usage_reservations_reserved_microusd_check
    check (reserved_microusd >= 0);

alter table public.free_daily_usage_reservations
  add column if not exists conversation_id uuid
    constraint free_daily_usage_reservations_conversation_fk
      references public.web_conversations(id) on delete set null,
  add column if not exists attempt_outcome text
    constraint free_daily_usage_reservations_attempt_outcome_known
      check (attempt_outcome is null or attempt_outcome = any (array['completed', 'failed', 'cancelled'])),
  add column if not exists attempt_error_class text
    constraint free_daily_usage_reservations_attempt_error_class_shape
      check (attempt_error_class is null or attempt_error_class ~ '^[a-z][a-z0-9_]{0,63}$');

create index if not exists idx_free_daily_usage_reservations_conversation
  on public.free_daily_usage_reservations (conversation_id, created_at desc)
  where conversation_id is not null;

comment on column public.free_daily_usage_reservations.conversation_id is
  'The conversation this Free generation attempt answered, set when the turn is reserved for a conversation the caller owns. Cleared when the conversation is deleted.';
comment on column public.free_daily_usage_reservations.attempt_outcome is
  'How the Free generation attempt ended: completed, failed or cancelled. Null for a turn that paused for input, never settled, or predates 0331.';
comment on column public.free_daily_usage_reservations.attempt_error_class is
  'The failure class of a failed Free attempt, such as rate_limit or free_trial_token_budget_reached. Null when the attempt did not fail or its failure carried no class.';

commit;

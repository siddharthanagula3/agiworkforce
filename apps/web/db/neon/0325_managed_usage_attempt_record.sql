-- =============================================================================
-- Migration 0325: every managed generation attempt records how it ended
--
-- Why    : each managed turn, a plain chat turn included, already reserves one
--          managed_usage_requests row under its request id, with the provider
--          and model it was dispatched to and its settlement state. The row
--          could not say which conversation the attempt belonged to, whether
--          it completed, failed or was cancelled (a failure and a cancellation
--          both end as released), or why it failed.
--
-- Shape  : conversation_id is set when the request is reserved for a
--          conversation the caller owns, and cleared if that conversation is
--          deleted. attempt_outcome is completed, failed or cancelled, and
--          attempt_error_class is the provider failure category of a failed
--          attempt. Both are written once, by the first finalization. Null on
--          every existing row means the attempt predates the record.
--
-- Depends: 0001 (public.web_conversations), 0056 (public.managed_usage_requests)
-- =============================================================================

begin;

alter table public.managed_usage_requests
  add column if not exists conversation_id uuid
    constraint managed_usage_requests_conversation_fk
      references public.web_conversations(id) on delete set null,
  add column if not exists attempt_outcome text
    constraint managed_usage_requests_attempt_outcome_known
      check (attempt_outcome is null or attempt_outcome = any (array['completed', 'failed', 'cancelled'])),
  add column if not exists attempt_error_class text
    constraint managed_usage_requests_attempt_error_class_shape
      check (attempt_error_class is null or attempt_error_class ~ '^[a-z][a-z0-9_]{0,63}$');

create index if not exists idx_managed_usage_requests_conversation
  on public.managed_usage_requests (conversation_id, created_at desc)
  where conversation_id is not null;

comment on column public.managed_usage_requests.conversation_id is
  'The conversation this generation attempt answered, set when the request is reserved for a conversation the caller owns. Cleared when the conversation is deleted.';
comment on column public.managed_usage_requests.attempt_outcome is
  'How the generation attempt ended: completed, failed or cancelled. Written once by the first finalization; null for attempts that predate 0325 or never finalized.';
comment on column public.managed_usage_requests.attempt_error_class is
  'The provider failure category of a failed attempt, such as rate_limit or api_timeout. Null when the attempt did not fail or its failure carried no category.';

commit;

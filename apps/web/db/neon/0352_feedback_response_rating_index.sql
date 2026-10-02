begin;

create index if not exists idx_feedback_response_rating
  on public.feedback (user_id, (metadata ->> 'message_id'))
  where metadata ->> 'feedback_context' = 'response_rating';

commit;

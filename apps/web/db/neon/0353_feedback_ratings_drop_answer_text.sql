begin;

update public.feedback
   set message = 'An answer in web chat. The answer text is not attached.'
 where metadata ->> 'feedback_context' = 'response_rating'
   and metadata ->> 'source' = 'web'
   and message <> 'An answer in web chat. The answer text is not attached.';

commit;

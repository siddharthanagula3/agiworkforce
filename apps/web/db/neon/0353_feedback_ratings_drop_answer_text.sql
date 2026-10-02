begin;

create or replace function public.keep_answer_text_out_of_web_rating()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.message := 'An answer in web chat. The answer text is not attached.';
  return new;
end;
$$;

drop trigger if exists keep_answer_text_out_of_web_rating on public.feedback;
create trigger keep_answer_text_out_of_web_rating
  before insert on public.feedback
  for each row
  when (
    new.metadata ->> 'feedback_context' = 'response_rating'
    and new.metadata ->> 'source' = 'web'
    and not (new.metadata ? 'message_source')
  )
  execute function public.keep_answer_text_out_of_web_rating();

update public.feedback
   set message = 'An answer in web chat. The answer text is not attached.'
 where metadata ->> 'feedback_context' = 'response_rating'
   and metadata ->> 'source' = 'web'
   and not (metadata ? 'message_source')
   and message <> 'An answer in web chat. The answer text is not attached.';

commit;

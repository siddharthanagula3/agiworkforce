-- Reversal of 0353 : the replaced answer copies do not come back.
--
-- WHAT THIS COSTS: a web rating sent by a build older than the route that
-- marks its message stores up to 500 characters of the rated answer again.
-- 0353 replaced the copy of the rated answer that web response ratings stored
-- in public.feedback.message with the note those ratings carry now. The
-- copies are gone, no reversal can bring them back, and none should: the
-- chats they came from may already be deleted.

begin;

drop trigger if exists keep_answer_text_out_of_web_rating on public.feedback;
drop function if exists public.keep_answer_text_out_of_web_rating();

delete from public.schema_migrations
 where filename = '0353_feedback_ratings_drop_answer_text.sql';

commit;

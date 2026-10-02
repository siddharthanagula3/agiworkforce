-- Reversal of 0353 : nothing comes back.
--
-- WHAT THIS COSTS: nothing, and it restores nothing. 0353 replaced the copy of
-- the rated answer that web response ratings stored in public.feedback.message
-- with the note those ratings carry now. The copies are gone, no reversal can
-- bring them back, and none should: the chats they came from may already be
-- deleted. This only retracts the ledger row.

begin;

delete from public.schema_migrations
 where filename = '0353_feedback_ratings_drop_answer_text.sql';

commit;

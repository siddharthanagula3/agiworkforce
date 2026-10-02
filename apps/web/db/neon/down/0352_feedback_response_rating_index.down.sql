begin;

drop index if exists public.idx_feedback_response_rating;

delete from public.schema_migrations
 where filename = '0352_feedback_response_rating_index.sql';

commit;

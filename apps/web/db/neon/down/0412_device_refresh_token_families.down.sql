-- Reversal of 0412: forget which device refresh credential families were ended.
--
-- WHAT THIS COSTS: the refresh route, developer-token admission and every
-- device revocation read and write this table, so the code built on 0412 must
-- be rolled back first or every device refresh and every unlink fails. After
-- this runs, a rotation racing an unlink or a sign-out can again leave a live
-- successor credential, and the record of which families were ended is lost;
-- the token rows keep their own revoked_at.

begin;

drop index if exists public.idx_device_refresh_token_families_user;

drop table if exists public.device_refresh_token_families;

drop function if exists public.device_refresh_token_families_stay_ended();

delete from public.schema_migrations
 where filename = '0412_device_refresh_token_families.sql';

commit;

-- Reverses 0097_connector_oauth_broker.sql.
--
-- DESTRUCTIVE AND ONE-WAY. `connector_oauth_grants` holds the credentials a
-- user personally consented to hand over; dropping it disconnects every
-- connector for every user, and re-applying 0097 brings back an empty table.
-- Recovery is each user clicking Connect again, so run this only when the
-- broker itself is the thing being rolled back. In-flight authorizations
-- expire on their own, so losing them strands only flows seconds old.
--
-- The two tables own every index and policy 0097 created, so dropping them
-- takes those with them. Nothing outside these tables is touched.
--
-- Order: grants first — nothing references authorizations, but rolling back
-- newest-object-first keeps this readable next to the migration it reverses.

begin;

drop table if exists public.connector_oauth_grants;
drop table if exists public.connector_oauth_authorizations;

delete from public.schema_migrations where filename = '0097_connector_oauth_broker.sql';

commit;

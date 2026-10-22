-- Reversal of 0383 removes the audience check; published apps then cannot use
-- connected apps at all until it is restored, because the runtime fails closed.

begin;

drop function if exists public.app_published_artifact_allows_connectors(uuid);

delete from public.schema_migrations
 where filename = '0383_published_artifact_connector_audience.sql';

commit;

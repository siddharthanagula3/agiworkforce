-- Reversal of 0253 : back to one connected account per connector.
--
-- WHAT THIS COSTS: every connector that holds more than one account loses all
-- but one of them, and the losing rows are DELETED, not revoked: the restored
-- unique constraint covers revoked rows too, so a kept tombstone would block
-- the connector from ever being reconnected. Which account survives is the live
-- default, or the most recently connected one when no default is marked. Every
-- other account has to be connected again and its audit row is gone.

BEGIN;

DELETE FROM public.connector_oauth_grants g
 WHERE g.id <> (
   SELECT keep.id
     FROM public.connector_oauth_grants keep
    WHERE keep.user_id = g.user_id
      AND keep.connector_id = g.connector_id
    ORDER BY (keep.revoked_at IS NULL) DESC, keep.is_default DESC, keep.connected_at DESC
    LIMIT 1
 );

DROP INDEX IF EXISTS public.idx_connector_oauth_grants_one_default;
DROP INDEX IF EXISTS public.idx_connector_oauth_grants_accounts;

ALTER TABLE public.connector_oauth_authorizations
  DROP CONSTRAINT IF EXISTS connector_oauth_authorizations_account_scope_values;
ALTER TABLE public.connector_oauth_authorizations
  DROP COLUMN IF EXISTS account_key,
  DROP COLUMN IF EXISTS account_label,
  DROP COLUMN IF EXISTS account_scope;

ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_account_unique;
ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_account_key_shape;
ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_account_scope_values;
ALTER TABLE public.connector_oauth_grants
  DROP COLUMN IF EXISTS account_key,
  DROP COLUMN IF EXISTS account_label,
  DROP COLUMN IF EXISTS account_scope,
  DROP COLUMN IF EXISTS is_default;

ALTER TABLE public.connector_oauth_grants
  ADD CONSTRAINT connector_oauth_grants_unique UNIQUE (user_id, connector_id);

DELETE FROM public.schema_migrations
 WHERE filename = '0253_connector_accounts.sql';

COMMIT;

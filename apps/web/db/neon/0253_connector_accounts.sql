-- =============================================================================
-- Migration 0253: more than one connected account per connector
--
-- Why    : 0097 gave connector_oauth_grants a unique constraint on
--          (user_id, connector_id), so authorizing a second account of the
--          same provider overwrote the first. Someone with a personal and a
--          work mailbox could hold only one of them, and the one they held was
--          whichever they connected last. Worse, nothing recorded WHICH account
--          a grant belonged to, so a tool call could not be pointed at one and
--          the two could not be told apart in the interface at all.
--
-- Shape  : account_key identifies the account within the connector and defaults
--          to 'default', which is exactly what every existing row becomes, so
--          nothing changes for an account that has one. account_label is the
--          provider's own identity for it (an address, a workspace name) and is
--          what the interface shows. account_scope is the separation the
--          product promises: a personal account and a work account are never
--          the same account, and a request scoped to one must never resolve to
--          the other. is_default picks which one an unqualified call uses.
--
-- Empty  : Every existing grant becomes the single default personal account of
--          its connector. No grant is created, removed or re-keyed.
--
-- Depends: 0097 (connector_oauth_grants, connector_oauth_authorizations)
-- =============================================================================

BEGIN;

ALTER TABLE public.connector_oauth_grants
  ADD COLUMN IF NOT EXISTS account_key text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS account_label text,
  ADD COLUMN IF NOT EXISTS account_scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true;

ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_account_key_shape;
ALTER TABLE public.connector_oauth_grants
  ADD CONSTRAINT connector_oauth_grants_account_key_shape
    CHECK (char_length(account_key) BETWEEN 1 AND 128);

ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_account_scope_values;
ALTER TABLE public.connector_oauth_grants
  ADD CONSTRAINT connector_oauth_grants_account_scope_values
    CHECK (account_scope = ANY (ARRAY['personal', 'work', 'service']));

-- The old constraint IS the single-account limit, so it goes and the account
-- key joins the key. A row that already exists keeps its identity: its
-- account_key is 'default'.
ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_unique;
ALTER TABLE public.connector_oauth_grants
  DROP CONSTRAINT IF EXISTS connector_oauth_grants_account_unique;
ALTER TABLE public.connector_oauth_grants
  ADD CONSTRAINT connector_oauth_grants_account_unique
    UNIQUE (user_id, connector_id, account_key);

-- At most one live default per connector: two defaults would make "which
-- account did that call use?" unanswerable, which is the whole point of this
-- migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_oauth_grants_one_default
  ON public.connector_oauth_grants (user_id, connector_id)
  WHERE revoked_at IS NULL AND is_default;

CREATE INDEX IF NOT EXISTS idx_connector_oauth_grants_accounts
  ON public.connector_oauth_grants (user_id, connector_id, account_scope)
  WHERE revoked_at IS NULL;

-- The authorization in flight has to carry the account it is for, or the
-- callback cannot tell a second account apart from a re-authorization of the
-- first and would overwrite it again.
ALTER TABLE public.connector_oauth_authorizations
  ADD COLUMN IF NOT EXISTS account_key text,
  ADD COLUMN IF NOT EXISTS account_label text,
  ADD COLUMN IF NOT EXISTS account_scope text;

ALTER TABLE public.connector_oauth_authorizations
  DROP CONSTRAINT IF EXISTS connector_oauth_authorizations_account_scope_values;
ALTER TABLE public.connector_oauth_authorizations
  ADD CONSTRAINT connector_oauth_authorizations_account_scope_values
    CHECK (account_scope IS NULL OR account_scope = ANY (ARRAY['personal', 'work', 'service']));

COMMENT ON COLUMN public.connector_oauth_grants.account_key IS
  'Identifies one connected account within a connector. Existing single-account grants are ''default''.';
COMMENT ON COLUMN public.connector_oauth_grants.account_scope IS
  'personal, work or service. A request scoped to one must never resolve to a grant in another; see lib/connectors/accounts.ts.';

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A second account of the same connector is now accepted:
-- --    INSERT INTO public.connector_oauth_grants
-- --      (user_id, connector_id, account_key, account_label, account_scope,
-- --       is_default, access_token_enc, token_endpoint)
-- --    VALUES ('<an existing profiles.id>', 'gmail', 'work', 'work@example.com',
-- --            'work', false, 'x', 'https://oauth2.googleapis.com/token');
-- --    EXPECT: INSERT 0 1
--
-- -- 2. Two live defaults for one connector are refused:
-- --    UPDATE public.connector_oauth_grants SET is_default = true
-- --     WHERE user_id = '<same user>' AND connector_id = 'gmail';
-- --    EXPECT: ERROR duplicate key value violates unique constraint
--
-- -- 3. An unknown account scope is refused:
-- --    UPDATE public.connector_oauth_grants SET account_scope = 'shared'
-- --     WHERE user_id = '<same user>' AND connector_id = 'gmail';
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 4. Clean up:
-- --    DELETE FROM public.connector_oauth_grants
-- --     WHERE connector_id = 'gmail' AND account_key = 'work';
-- =============================================================================

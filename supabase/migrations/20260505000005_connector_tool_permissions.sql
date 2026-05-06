-- Migration: connector_tool_permissions
-- Desktop P0 (audit C-rank 1) — per-tool connector permission storage for Cloud mode.
-- Local/BYOK Desktop users: permissions are stored encrypted in
--   ~/.agiworkforce/connector-permissions.json via the master_password.rs vault.
-- Cloud mode users: this table is the source of truth (RLS-isolated per user).

CREATE TABLE IF NOT EXISTS public.connector_tool_permissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connector_id text        NOT NULL,
  tool_name    text        NOT NULL,
  level        text        NOT NULL
                           CHECK (level IN ('always-allow', 'needs-approval', 'blocked')),
  destructive  boolean     NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id, tool_name)
);

-- Index for fast per-user connector lookups
CREATE INDEX IF NOT EXISTS connector_tool_permissions_user_connector_idx
  ON public.connector_tool_permissions (user_id, connector_id);

-- Row-level security: each user manages only their own rows.
ALTER TABLE public.connector_tool_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own connector permissions"
  ON public.connector_tool_permissions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at auto-update trigger
CREATE OR REPLACE FUNCTION public.set_connector_tool_permissions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER connector_tool_permissions_updated_at
  BEFORE UPDATE ON public.connector_tool_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_connector_tool_permissions_updated_at();

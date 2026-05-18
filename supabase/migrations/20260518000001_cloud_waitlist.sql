-- =============================================================================
-- Cloud waitlist capture table
-- Date: 2026-05-18
-- Purpose: Persist mobile waitlist sign-ups for the cloud-gated features.
--          No auth required; anonymous users can insert their own email.
--          Nobody can SELECT rows — rank is returned via a security-definer RPC.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cloud_waitlist (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email        text NOT NULL,
    country      text,
    device_model text,
    device_tier  int,
    created_at   timestamptz NOT NULL DEFAULT now(),
    notified_at  timestamptz,

    CONSTRAINT cloud_waitlist_email_unique UNIQUE (email)
);

-- Index to make the rank RPC sub-query fast.
CREATE INDEX IF NOT EXISTS cloud_waitlist_created_at_idx
    ON public.cloud_waitlist (created_at);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.cloud_waitlist ENABLE ROW LEVEL SECURITY;

-- INSERT-only: anyone (anon or authenticated) can add their email once.
-- No SELECT, UPDATE, or DELETE is allowed via the anon/user key.
CREATE POLICY "cloud_waitlist_insert_anyone"
    ON public.cloud_waitlist
    FOR INSERT
    WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Rank RPC (security-definer so it can bypass RLS for the count query)
-- ---------------------------------------------------------------------------
-- Returns the number of rows inserted BEFORE the caller's own row.
-- This is the 0-indexed position in line; callers should display rank + 1
-- for a 1-based "#N in line" UX (done in the client service layer).
--
-- If the email does not exist yet, returns NULL (the service layer treats
-- this as an error; it should only be called after a successful INSERT).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cloud_waitlist_rank(p_email text)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::int
    FROM public.cloud_waitlist older
    WHERE older.created_at < (
        SELECT created_at
        FROM public.cloud_waitlist
        WHERE email = p_email
    );
$$;

-- Restrict execute to the anon role and authenticated role only
-- (not the service_role, which always bypasses RLS anyway).
REVOKE ALL ON FUNCTION public.cloud_waitlist_rank(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cloud_waitlist_rank(text) TO anon;
GRANT EXECUTE ON FUNCTION public.cloud_waitlist_rank(text) TO authenticated;

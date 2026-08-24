-- =============================================================================
-- Migration 0143: stream audit events to a customer's SIEM
--
-- Why    : The workspace posture reports "SIEM streaming: Not available" and
--          tells administrators to pull the JSONL export on a schedule. A
--          security team that runs Splunk or Sentinel expects events to arrive,
--          not to be collected. It is the last "Not available" row a security
--          review reads on the audit group.
--
-- Shape  : One destination per workspace, drained by a cron rather than written
--          to inline. Delivering on the audit write path would couple every
--          audited action to a customer endpoint being up and slow the action
--          that is being audited — an admin changing a policy should not wait on
--          a webhook, and an unreachable SIEM must never stop a policy change.
--
-- Cursor : `last_delivered_at` plus `last_delivered_id` rather than a timestamp
--          alone. `created_at` is not unique, and a burst of events sharing a
--          millisecond is exactly what a busy workspace produces — a
--          timestamp-only cursor silently skips or repeats those rows. Same
--          reasoning as the audit read's keyset pagination.
--
-- Secret : Stored, because HMAC signing needs the key on both sides and there
--          is nothing to compare against otherwise. It is write-only over the
--          API: the console shows a prefix and offers rotation, never the value.
--
-- SSRF   : A customer-supplied URL is an egress target. The route validates it
--          with `assertResolvedPublicHostname`, which resolves DNS and refuses
--          any address that is private, loopback, or link-local, and delivery
--          uses `pinnedPublicFetch` so a rebind between validation and send
--          cannot redirect the request inward.
--
-- Depends: 0076 (enterprise_audit_events), 0015 (organizations), 0037 (app_rls)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_audit_destinations (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint_url text NOT NULL CHECK (endpoint_url ~ '^https://' AND char_length(endpoint_url) <= 2048),
  secret_hash text NOT NULL,
  secret_prefix text NOT NULL CHECK (secret_prefix ~ '^[0-9a-f]{8}$'),
  enabled boolean NOT NULL DEFAULT true,
  last_delivered_at timestamptz,
  last_delivered_id uuid,
  last_attempt_at timestamptz,
  last_status text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A cursor is only meaningful as a pair. Half of one would let the drain
  -- resume from a timestamp with no tiebreak and repeat a burst.
  CONSTRAINT audit_destination_cursor_is_whole CHECK (
    (last_delivered_at IS NULL) = (last_delivered_id IS NULL)
  )
);

COMMENT ON TABLE public.organization_audit_destinations IS
  'Where a workspace wants its audit events streamed. Drained by cron, never written inline: an unreachable SIEM must not stop the action being audited.';
COMMENT ON COLUMN public.organization_audit_destinations.secret_hash IS
  'SHA-256 of the signing secret. The raw value is returned once on creation and never again.';
COMMENT ON COLUMN public.organization_audit_destinations.consecutive_failures IS
  'Reset on any success. The drain backs off as this climbs so one dead endpoint cannot consume the run.';

DROP TRIGGER IF EXISTS set_organization_audit_destinations_updated_at
  ON public.organization_audit_destinations;
CREATE TRIGGER set_organization_audit_destinations_updated_at
  BEFORE UPDATE ON public.organization_audit_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Readable by owners and admins only: the endpoint and its delivery health are
-- security configuration, not something every member needs. Writable by nobody
-- through the application role — and never SELECT on the secret in practice,
-- since the service projects the columns it needs.
GRANT SELECT ON public.organization_audit_destinations TO app_rls;

ALTER TABLE public.organization_audit_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_audit_destinations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_destinations_admin_read ON public.organization_audit_destinations;
CREATE POLICY audit_destinations_admin_read
  ON public.organization_audit_destinations
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_audit_destinations.organization_id
         AND m.user_id = public.current_app_user_id()
         AND m.role IN ('owner', 'admin')
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A plaintext http endpoint cannot be saved:
-- --    INSERT INTO public.organization_audit_destinations
-- --      (organization_id, endpoint_url, secret_hash, secret_prefix, created_by_user_id)
-- --      VALUES ('<org>', 'http://example.test', 'x', '0123abcd', 'u');
-- --    EXPECT: check violation.
--
-- -- 2. Half a cursor cannot be saved:
-- --    UPDATE public.organization_audit_destinations SET last_delivered_at = now();
-- --    EXPECT: check violation (last_delivered_id is still null).
--
-- -- 3. A plain member reads nothing:
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<plain-member>"}';
-- --    SELECT count(*) FROM public.organization_audit_destinations;   -- EXPECT: 0
--
-- -- 4. The application role cannot write:
-- --    UPDATE public.organization_audit_destinations SET enabled = false;
-- --    EXPECT: permission denied.
-- =============================================================================

-- =============================================================================
-- Worker direction-inversion tables: worker_registrations + work_units
-- Date: 2026-05-09
-- Source: tasks/research/EXECUTION_PLAN_2026-05-09.md §1.7 (Wave 4 services-inversion)
--          tasks/research/exec/1.7-report.md §8 "DB Migrations Required"
--          docs/architecture/worker-protocol.md
--
-- Background: Task 1.7 (branch task-1.7-services-inversion) implemented the
-- outbound-worker direction-inversion protocol in services/api-gateway/src/worker/
-- (registration.ts, assignment.ts, heartbeat.ts, types.ts). All endpoints query
-- two tables that did not yet exist in any migration: worker_registrations and
-- work_units. Without these tables the entire worker control plane returns 500
-- in production. This migration creates both tables to match the column shapes
-- the api-gateway code reads/writes.
--
-- Schema rationale (column names match the api-gateway code, not the prose in
-- Task #1's description — verified 2026-05-09 against
-- services/api-gateway/src/worker/registration.ts:104-118, assignment.ts:175-201,
-- heartbeat.ts:113-118, etc.):
--
--   worker_registrations:
--     id                         uuid PK             — registration row id (also used as environment_id)
--     user_id                    uuid FK auth.users  — owner; cascades on delete
--     worker_type                text enum           — cli|desktop|mobile|custom
--     platform                   text                — host platform string
--     version                    text                — semver-prefixed version string
--     worker_epoch               bigint              — incremented per /bridge call
--     environment_id             text UNIQUE         — worker's external bridge id (matches `id` at registration)
--     environment_secret_hash    text                — sha256(secret + JWT_SECRET)
--     trusted_device_token_hash  text NULL           — sha256(token + JWT_SECRET); NULL until enrolled
--     status                     text enum           — available|busy|offline
--     last_heartbeat_at          timestamptz         — last keep-alive (worker-level or work-level)
--     created_at, updated_at     timestamptz
--
--   work_units:
--     id                  uuid PK
--     environment_id      text FK → worker_registrations.environment_id
--     worker_id           uuid NULL FK → worker_registrations.id   (set when assigned)
--     status              text enum                                  — pending|assigned|completed|failed|reassigned
--     payload             jsonb                                      — input + (after complete) result
--     idempotency_key     text NULL                                  — duplicate-ack detection
--     created_at, updated_at, completed_at timestamptz
--
-- RLS: service_role only via TO service_role (per HIGH-1 fix in
-- 20260505000003_replace_authrole_with_role_grant.sql; we never use
-- auth.role() = 'service_role' as a USING/WITH CHECK clause).
--
-- Forward-only: this migration only CREATEs. It does not alter any existing
-- objects, so re-running on a partially-applied env is safe via IF NOT EXISTS.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. worker_registrations
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.worker_registrations (
    id                         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    worker_type                text        NOT NULL
                                           CHECK (worker_type IN ('cli', 'desktop', 'mobile', 'custom')),
    platform                   text        NOT NULL CHECK (length(platform) BETWEEN 1 AND 64),
    version                    text        NOT NULL,
    worker_epoch               bigint      NOT NULL DEFAULT 0,
    environment_id             text        NOT NULL UNIQUE
                                           CHECK (environment_id ~ '^[a-zA-Z0-9_-]+$'),
    environment_secret_hash    text        NOT NULL,
    trusted_device_token_hash  text,
    status                     text        NOT NULL DEFAULT 'available'
                                           CHECK (status IN ('available', 'busy', 'offline')),
    last_heartbeat_at          timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Indexes:
--   - Unique on environment_id is provided by the column constraint above (used by every Tier 2 lookup).
--   - last_heartbeat_at: heartbeat-sweep query in heartbeat.ts:reassignStaleWork
--     (`.lt('last_heartbeat_at', cutoff)` → btree partial range scan).
--   - user_id: scope-by-owner queries.
--   - status (partial): "find another available worker" query in reassignment.

CREATE INDEX IF NOT EXISTS idx_worker_registrations_last_heartbeat_at
    ON public.worker_registrations (last_heartbeat_at)
    WHERE status IN ('available', 'busy');

CREATE INDEX IF NOT EXISTS idx_worker_registrations_user_id
    ON public.worker_registrations (user_id);

CREATE INDEX IF NOT EXISTS idx_worker_registrations_status_env
    ON public.worker_registrations (environment_id, status);

-- updated_at trigger function. We define a dedicated function rather than
-- reusing public.update_dispatch_updated_at to keep ownership/audit clear.
-- search_path is pinned per 20260506060001 (function_search_path_mutable
-- advisor — non-pinned trigger functions can be hijacked via schema-search
-- shadowing in SECURITY DEFINER context).
CREATE OR REPLACE FUNCTION public.update_worker_registrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_worker_registrations_updated_at ON public.worker_registrations;
CREATE TRIGGER trigger_worker_registrations_updated_at
    BEFORE UPDATE ON public.worker_registrations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_worker_registrations_updated_at();

-- RLS: service_role only.
--
-- The api-gateway uses getServiceClient() (service-role key) for all writes
-- + cross-row reads, and getUserScopedClient(userId) (with the user's JWT)
-- only for the registration insert. The user-scoped insert path requires a
-- TO authenticated INSERT policy that checks user_id = auth.uid(); all
-- other operations are TO service_role.
ALTER TABLE public.worker_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worker_registrations: service_role full access"
    ON public.worker_registrations FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "worker_registrations: authenticated user can insert own"
    ON public.worker_registrations FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "worker_registrations: authenticated user can read own"
    ON public.worker_registrations FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.worker_registrations IS
    'Outbound-worker direction-inversion: workers (CLI/desktop/mobile) register here ' ||
    'and the cloud assigns them work via work_units. Created in Wave 5.1 (2026-05-09) ' ||
    'to back the api-gateway worker control plane shipped in Task 1.7.';

COMMENT ON COLUMN public.worker_registrations.environment_id IS
    'External bridge id (matches the row id at registration time). ' ||
    'Validated against ^[a-zA-Z0-9_-]+$ to prevent path-traversal in route handlers.';

COMMENT ON COLUMN public.worker_registrations.worker_epoch IS
    'Incremented every /v1/environments/:id/bridge call. Part of every wire ' ||
    'message so a JWT-only credential swap (not a full transport rebuild) ' ||
    '409s on the next heartbeat within 20s.';

COMMENT ON COLUMN public.worker_registrations.environment_secret_hash IS
    'sha256(environment_secret + JWT_SECRET). Plaintext secret never persisted.';

COMMENT ON COLUMN public.worker_registrations.trusted_device_token_hash IS
    'sha256(trusted_device_token + JWT_SECRET). NULL until /api/auth/trusted_devices ' ||
    'enrollment within 10 min of login.';


-- -----------------------------------------------------------------------------
-- 2. work_units
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_units (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    environment_id  text        NOT NULL REFERENCES public.worker_registrations(environment_id) ON DELETE CASCADE,
    worker_id       uuid        REFERENCES public.worker_registrations(id) ON DELETE SET NULL,
    status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'assigned', 'completed', 'failed', 'reassigned')),
    payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

-- Indexes:
--   - poll path: WHERE environment_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1
--   - reassign path: WHERE worker_id = ? AND status = 'assigned'
--   - idempotency_key: unique partial — duplicate-ack detection. Per the api-gateway's
--     ackWorkSchema, the key is sender-supplied and required at ack time, so a
--     UNIQUE constraint scoped to (environment_id, idempotency_key) protects against
--     two workers acking the same logical unit. NULL keys (legacy/early rows) are
--     tolerated via the partial index.
CREATE INDEX IF NOT EXISTS idx_work_units_env_status_created
    ON public.work_units (environment_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_work_units_worker_status
    ON public.work_units (worker_id, status)
    WHERE worker_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_units_env_idempotency_key_unique
    ON public.work_units (environment_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- updated_at trigger.
CREATE OR REPLACE FUNCTION public.update_work_units_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_work_units_updated_at ON public.work_units;
CREATE TRIGGER trigger_work_units_updated_at
    BEFORE UPDATE ON public.work_units
    FOR EACH ROW
    EXECUTE FUNCTION public.update_work_units_updated_at();

-- RLS: service_role only. Workers never read this table directly; they
-- receive work via long-poll which the gateway resolves with the service
-- role client.
ALTER TABLE public.work_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_units: service_role full access"
    ON public.work_units FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE public.work_units IS
    'Work-queue rows assigned to registered workers. status transitions: ' ||
    'pending → assigned (poll) → completed | failed | reassigned. ' ||
    'Created in Wave 5.1 (2026-05-09) to back api-gateway work assignment.';

COMMENT ON COLUMN public.work_units.environment_id IS
    'FK → worker_registrations.environment_id. Identifies the worker pool.';

COMMENT ON COLUMN public.work_units.worker_id IS
    'FK → worker_registrations.id. Set when status transitions to assigned. ' ||
    'NULL while pending or after reassignment back to pending.';

COMMENT ON COLUMN public.work_units.idempotency_key IS
    'Sender-supplied dedup key (UNIQUE per environment_id when non-null). ' ||
    'Two workers receiving the same logical unit detect the collision at ack time.';

COMMIT;

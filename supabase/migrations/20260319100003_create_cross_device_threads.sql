-- Wave 5: Cross-Device Threads Backing Tables
-- Description: Four tables supporting persistent conversation threads that
--   span the desktop ↔ mobile boundary:
--   device_pairings         — active device pairings established via QR code
--   cross_device_threads    — conversation threads shared across paired devices
--   cross_device_messages   — messages within a thread from any paired device
--   cross_device_artifacts  — files/screenshots shared between paired devices
-- Date: 2026-03-19
--
-- Access model: all tables are user-scoped — rows belonging to a user are
-- only accessible by that user. Paired devices share the same user_id by
-- design (QR pairing links a secondary device to the authenticated session).

-- ============================================================================
-- 1. device_pairings
-- Records active QR-code-based device pairings between a primary device
-- (desktop/web) and a secondary device (mobile). The mobile companion scans
-- a QR code that encodes a short-lived pairing_token; the backend validates
-- the token and creates or refreshes this row.
-- Expired or revoked pairings are retained with status = 'revoked' | 'expired'
-- so the audit trail is preserved.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_pairings (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Primary device (the QR code presenter — usually desktop or web) --
    primary_device_id   text    NOT NULL,
    primary_surface     text    NOT NULL
                                CHECK (primary_surface IN ('desktop', 'web', 'cli', 'vscode', 'extension')),
    primary_label       text,
    -- Secondary device (the QR code scanner — usually mobile) --
    secondary_device_id text,
    secondary_surface   text
                                CHECK (secondary_surface IN ('mobile', 'desktop', 'web')),
    secondary_label     text,
    -- Pairing flow --
    pairing_token       text    NOT NULL UNIQUE,  -- short-lived token encoded in the QR code
    status              text    NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
    paired_at           timestamptz,
    last_seen_at        timestamptz,
    expires_at          timestamptz NOT NULL,
    -- Audit --
    metadata            jsonb   DEFAULT '{}',
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.device_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own device pairings"
    ON public.device_pairings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own device pairings"
    ON public.device_pairings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own device pairings"
    ON public.device_pairings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own device pairings"
    ON public.device_pairings FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on device_pairings"
    ON public.device_pairings FOR ALL
    USING (auth.role() = 'service_role');

-- Fast token lookup on QR scan
CREATE INDEX IF NOT EXISTS idx_device_pairings_pairing_token
    ON public.device_pairings(pairing_token);

-- List active pairings for a user (mobile companion device list screen)
CREATE INDEX IF NOT EXISTS idx_device_pairings_user_id_status
    ON public.device_pairings(user_id, status);

-- Cron job to expire stale pairings
CREATE INDEX IF NOT EXISTS idx_device_pairings_expires_at
    ON public.device_pairings(expires_at)
    WHERE status = 'pending' OR status = 'active';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_device_pairings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_device_pairings_updated_at ON public.device_pairings;
CREATE TRIGGER trigger_device_pairings_updated_at
    BEFORE UPDATE ON public.device_pairings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_device_pairings_updated_at();

-- ============================================================================
-- 2. cross_device_threads
-- A thread is a named conversation context that persists across devices.
-- Unlike the surface-local `conversations` table, threads are explicitly
-- cross-device: the user can start a thread on the desktop and resume it
-- on mobile without losing context.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cross_device_threads (
    id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pairing_id       uuid        REFERENCES public.device_pairings(id) ON DELETE SET NULL,
    title            text,
    model            text,
    provider         text,
    -- State --
    status           text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'archived', 'deleted')),
    message_count    integer     NOT NULL DEFAULT 0,
    last_message_at  timestamptz,
    -- The surface that created this thread
    origin_surface   text        NOT NULL
                                 CHECK (origin_surface IN ('desktop', 'web', 'mobile', 'cli', 'vscode', 'extension')),
    -- Audit --
    metadata         jsonb       DEFAULT '{}',
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.cross_device_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cross-device threads"
    ON public.cross_device_threads FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cross-device threads"
    ON public.cross_device_threads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cross-device threads"
    ON public.cross_device_threads FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cross-device threads"
    ON public.cross_device_threads FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on cross_device_threads"
    ON public.cross_device_threads FOR ALL
    USING (auth.role() = 'service_role');

-- Thread list ordered by most recently active
CREATE INDEX IF NOT EXISTS idx_cross_device_threads_user_id_last_message_at
    ON public.cross_device_threads(user_id, last_message_at DESC NULLS LAST);

-- Filter by status (active threads vs archived history)
CREATE INDEX IF NOT EXISTS idx_cross_device_threads_user_id_status
    ON public.cross_device_threads(user_id, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_cross_device_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cross_device_threads_updated_at ON public.cross_device_threads;
CREATE TRIGGER trigger_cross_device_threads_updated_at
    BEFORE UPDATE ON public.cross_device_threads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_cross_device_threads_updated_at();

-- ============================================================================
-- 3. cross_device_messages
-- Individual messages within a cross-device thread. Each message records the
-- originating surface and device so the UI can visually distinguish desktop-
-- authored messages from mobile-authored ones. Supports the full message role
-- set used by the LLM router: 'user', 'assistant', 'tool', 'system'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cross_device_messages (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id       uuid        NOT NULL REFERENCES public.cross_device_threads(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Message content --
    role            text        NOT NULL
                                CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content         text,
    content_parts   jsonb,      -- structured content blocks (text, image, tool_use, tool_result)
    model           text,       -- model that produced this response (if role = 'assistant')
    -- Origin --
    surface         text        NOT NULL
                                CHECK (surface IN ('desktop', 'web', 'mobile', 'cli', 'vscode', 'extension')),
    device_id       text,       -- device fingerprint / pairing secondary_device_id
    -- Token accounting --
    input_tokens    integer,
    output_tokens   integer,
    -- Audit --
    metadata        jsonb       DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cross_device_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages in threads they own
CREATE POLICY "Users can view own cross-device messages"
    ON public.cross_device_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.cross_device_threads
            WHERE id = cross_device_messages.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can write messages to threads they own
CREATE POLICY "Users can insert own cross-device messages"
    ON public.cross_device_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.cross_device_threads
            WHERE id = cross_device_messages.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can delete their own messages (e.g., edit via delete+reinsert)
CREATE POLICY "Users can delete own cross-device messages"
    ON public.cross_device_messages FOR DELETE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.cross_device_threads
            WHERE id = cross_device_messages.thread_id
              AND user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access on cross_device_messages"
    ON public.cross_device_messages FOR ALL
    USING (auth.role() = 'service_role');

-- Primary message list query: all messages in a thread in creation order
CREATE INDEX IF NOT EXISTS idx_cross_device_messages_thread_id_created_at
    ON public.cross_device_messages(thread_id, created_at ASC);

-- Fast lookup of messages by originating device (for device-specific history)
CREATE INDEX IF NOT EXISTS idx_cross_device_messages_thread_id_surface
    ON public.cross_device_messages(thread_id, surface);

-- ============================================================================
-- 4. cross_device_artifacts
-- Files, screenshots, and binary blobs shared between paired devices within
-- the context of a cross-device thread. Artifacts are stored in Supabase
-- Storage; this table holds the metadata and a reference to the storage path.
-- Supports the mobile companion's "share screenshot to desktop" and
-- "send file from desktop to mobile" features.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cross_device_artifacts (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id       uuid        NOT NULL REFERENCES public.cross_device_threads(id) ON DELETE CASCADE,
    message_id      uuid        REFERENCES public.cross_device_messages(id) ON DELETE SET NULL,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- File metadata --
    file_name       text        NOT NULL,
    file_type       text        NOT NULL,   -- MIME type, e.g. 'image/png', 'application/pdf'
    file_size_bytes bigint,
    -- Storage reference --
    storage_bucket  text        NOT NULL DEFAULT 'cross-device-artifacts',
    storage_path    text        NOT NULL,   -- path within the bucket, e.g. '{user_id}/{artifact_id}/file.png'
    -- Origin --
    surface         text        NOT NULL
                                CHECK (surface IN ('desktop', 'web', 'mobile', 'cli', 'vscode', 'extension')),
    device_id       text,
    -- Lifecycle --
    expires_at      timestamptz,            -- null = no expiry; set for ephemeral screenshots
    -- Audit --
    metadata        jsonb       DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cross_device_artifacts ENABLE ROW LEVEL SECURITY;

-- Users can view artifacts in threads they own
CREATE POLICY "Users can view own cross-device artifacts"
    ON public.cross_device_artifacts FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.cross_device_threads
            WHERE id = cross_device_artifacts.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can upload artifacts to threads they own
CREATE POLICY "Users can insert own cross-device artifacts"
    ON public.cross_device_artifacts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.cross_device_threads
            WHERE id = cross_device_artifacts.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can delete their own artifacts (e.g., remove a shared screenshot)
CREATE POLICY "Users can delete own cross-device artifacts"
    ON public.cross_device_artifacts FOR DELETE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.cross_device_threads
            WHERE id = cross_device_artifacts.thread_id
              AND user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access on cross_device_artifacts"
    ON public.cross_device_artifacts FOR ALL
    USING (auth.role() = 'service_role');

-- All artifacts for a thread (attachment panel, ordered newest first)
CREATE INDEX IF NOT EXISTS idx_cross_device_artifacts_thread_id_created_at
    ON public.cross_device_artifacts(thread_id, created_at DESC);

-- Cron job to delete artifacts past their expiry date
CREATE INDEX IF NOT EXISTS idx_cross_device_artifacts_expires_at
    ON public.cross_device_artifacts(expires_at)
    WHERE expires_at IS NOT NULL;

-- Enable Realtime so paired devices receive artifact and message updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_pairings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cross_device_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cross_device_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cross_device_artifacts;

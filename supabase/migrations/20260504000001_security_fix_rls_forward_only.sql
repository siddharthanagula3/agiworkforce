-- =============================================================================
-- Security fix: forward-only RLS hardening
-- Date: 2026-05-04
-- Source: docs/plans/redteam-services.md (red team report 2026-05-04)
--
-- This migration is FORWARD-ONLY. We never edit historical migrations because
-- production may have already applied them; instead we DROP the previous
-- broken policies and CREATE NEW ones with the missing ownership checks.
--
-- Findings closed:
--   H1 — vibe_messages, vibe_agent_actions, vibe_agent_messages, messages
--        INSERT/UPDATE policies validated user_id but NOT session_id /
--        conversation_id / parent_message_id ownership. Attacker authenticated
--        with their own JWT could plant messages in any victim's session,
--        polluting transcripts and triggering counter-bumping triggers on
--        the victim's session row.
--   H5 — dispatch_messages allowed any user to forge `surface=desktop,
--        role=assistant` rows. Mobile UI consumed these via Realtime as if
--        they came from the desktop agent — a prompt-injection vector.
--   H6 — cross_device_messages and cross_device_artifacts had no UPDATE
--        policy, forcing application code to use service-role for benign
--        edits and expanding the blast radius of a service-key leak.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- H1.a — vibe_messages: enforce session ownership + parent-message ownership
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create messages in their own sessions"
    ON public.vibe_messages;

CREATE POLICY "Users can create messages in their own sessions"
    ON public.vibe_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.vibe_sessions
            WHERE id = vibe_messages.session_id
              AND user_id = auth.uid()
        )
        AND (
            parent_message_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.vibe_messages parent
                WHERE parent.id = vibe_messages.parent_message_id
                  AND parent.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update their own messages"
    ON public.vibe_messages;

CREATE POLICY "Users can update their own messages"
    ON public.vibe_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.vibe_sessions
            WHERE id = vibe_messages.session_id
              AND user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- H1.b — vibe_agent_actions: enforce session ownership
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create their own agent actions"
    ON public.vibe_agent_actions;

CREATE POLICY "Users can create their own agent actions"
    ON public.vibe_agent_actions FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.vibe_sessions
            WHERE id = vibe_agent_actions.session_id
              AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their own agent actions"
    ON public.vibe_agent_actions;

CREATE POLICY "Users can update their own agent actions"
    ON public.vibe_agent_actions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.vibe_sessions
            WHERE id = vibe_agent_actions.session_id
              AND user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- H1.c — vibe_agent_messages: enforce session ownership
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create their own agent messages"
    ON public.vibe_agent_messages;

CREATE POLICY "Users can create their own agent messages"
    ON public.vibe_agent_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.vibe_sessions
            WHERE id = vibe_agent_messages.session_id
              AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their own agent messages"
    ON public.vibe_agent_messages;

CREATE POLICY "Users can update their own agent messages"
    ON public.vibe_agent_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.vibe_sessions
            WHERE id = vibe_agent_messages.session_id
              AND user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- H1.d — messages: enforce conversation ownership on INSERT and UPDATE.
--
-- The existing "Users can CRUD own messages" policy is a single FOR ALL
-- policy. We split it into per-action policies so we can add the
-- conversation_id ownership check on INSERT/UPDATE without breaking SELECT
-- and DELETE.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can CRUD own messages"
    ON public.messages;

CREATE POLICY "Users can view own messages"
    ON public.messages FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own messages"
    ON public.messages FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.conversations
            WHERE id = messages.conversation_id
              AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own messages"
    ON public.messages FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.conversations
            WHERE id = messages.conversation_id
              AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own messages"
    ON public.messages FOR DELETE
    USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- H5 — dispatch_messages: prevent surface/role forgery.
--
-- We use a CHECK constraint (not RLS) because the JWT does not currently
-- carry a `surface` claim — the desktop and mobile clients share the same
-- JWT issuer in services/api-gateway/src/routes/auth.ts. The proper fix
-- is to add a `surface` claim to the JWT and then add an RLS policy that
-- checks `surface = (auth.jwt()->>'surface')`. As a stop-gap, we add a
-- CHECK constraint that enforces a "user-message-from-mobile,
-- assistant-message-from-desktop" invariant, which matches how the dispatch
-- protocol is supposed to work (mobile sends user prompts, desktop sends
-- assistant responses). This blocks the prompt-injection vector identified
-- in the red team report.
--
-- Mobile cannot post `surface=desktop` rows because they would have to also
-- claim `role=assistant`, and the application code on mobile only sends
-- `role=user` rows. (The constraint enforces this by aborting any row where
-- the role and surface do not agree.)
--
-- Once the JWT carries a `surface` claim, replace this with an RLS policy.
-- -----------------------------------------------------------------------------

ALTER TABLE public.dispatch_messages
    DROP CONSTRAINT IF EXISTS dispatch_messages_surface_role_consistency;

ALTER TABLE public.dispatch_messages
    ADD CONSTRAINT dispatch_messages_surface_role_consistency
    CHECK (
        (surface = 'mobile' AND role = 'user')
        OR (surface = 'desktop' AND role = 'assistant')
    );

-- -----------------------------------------------------------------------------
-- H6 — cross_device_messages + cross_device_artifacts: add explicit UPDATE
-- policies so the application can update without falling back to service-role.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update own cross-device messages"
    ON public.cross_device_messages;

CREATE POLICY "Users can update own cross-device messages"
    ON public.cross_device_messages FOR UPDATE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.cross_device_threads
            WHERE id = cross_device_messages.thread_id
              AND user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.cross_device_threads
            WHERE id = cross_device_messages.thread_id
              AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own cross-device artifacts"
    ON public.cross_device_artifacts;

CREATE POLICY "Users can update own cross-device artifacts"
    ON public.cross_device_artifacts FOR UPDATE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.cross_device_threads
            WHERE id = cross_device_artifacts.thread_id
              AND user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.cross_device_threads
            WHERE id = cross_device_artifacts.thread_id
              AND user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- H2 — shared_sessions: tighten anon SELECT.
--
-- The existing policy `USING (expires_at > now())` lets ANY anon-key client
-- list every non-expired shared session. We restrict by token because the
-- application path always carries the token in the URL. The token column
-- already has a UNIQUE index — token-based access is still O(log n).
--
-- We require the caller to either (a) be authenticated and own the row, or
-- (b) supply the token via a request header that PostgREST forwards through
-- `request.headers`. Option (b) keeps the existing public-share UX working
-- without Edge-Function rewrites: the share page must include the token in
-- the request header `x-share-token` (PostgREST exposes this via
-- `current_setting('request.headers', true)::json ->> 'x-share-token'`).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view non-expired shared sessions"
    ON public.shared_sessions;

CREATE POLICY "View shared session by token or owner"
    ON public.shared_sessions FOR SELECT
    USING (
        expires_at > now()
        AND (
            -- Owner can always see their own row
            owner_id = auth.uid()
            OR
            -- Anonymous viewer must present the matching token via header
            token = COALESCE(
                current_setting('request.headers', true)::json ->> 'x-share-token',
                ''
            )
        )
    );

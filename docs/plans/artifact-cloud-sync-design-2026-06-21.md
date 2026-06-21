# Artifact cloud-sync (P5) — managed-only synced artifact entity (DESIGN, gated)

Status: DESIGN — awaiting founder sign-off before the migration. Owner: this session.
Last updated: 2026-06-21. Decision: founder chose "new managed-only synced artifact
entity" (Option A) for desktop's first-class editable artifacts. See
`artifacts-splitview-parity-2026-06-21.md` for the conflict that motivated this.

Extends the P2 cross-device chat sync (`cross-device-cloud-sync-design-2026-06-20.md`,
migration `0038_cloud_sync_versioning.sql`, endpoint `/api/chat/sync`). This is the same
machinery applied to a third entity — artifacts — NOT a new pipeline.

## 0. Why this exists (the gap)

Web + mobile artifacts are DERIVED from message content (view-only) → they persist for
free on message sync. **Desktop artifacts are first-class (Tauri SQLite) and editable in
place** (`InlineArtifactEditor` + `applyDiffToArtifact`), so an edited artifact's content
diverges from any message and message sync does NOT carry it. To make desktop artifacts
appear identically on web/mobile in cloud mode, they need their own synced entity.

## 1. Trust boundary (LOCKED — non-negotiable)

- Managed-Cloud ONLY. The artifact sync endpoint is the managed store; Local/BYOK
  artifacts have NO `cloud_id` and are NEVER pushed/pulled (client-enforced per the
  matrix, same as P2 conversations/messages).
- `user_id` is set SERVER-SIDE from the JWT; RLS `WITH CHECK` rejects any row whose
  `user_id` ≠ the authenticated subject (reuse the `0037_rls_user_isolation` policy shape).
- Never silently route a Local/BYOK artifact to the cloud. A managed-mode gate
  (`isManagedSyncEnabled()` on mobile / `selectPrivacyMode==='managed'` on desktop) gates
  every push/pull, identical to P2.

## 2. Schema — migration `0039_artifact_cloud_sync.sql` (ADDITIVE, idempotent)

Mirror `0038` exactly: reuse the shared `public.cloud_sync_version_seq` so ONE monotonic
cursor spans conversations + messages + artifacts (a single `since` pulls all three).

```sql
-- web_artifacts: first-class cloud artifact (the canonical cloud copy).
CREATE TABLE IF NOT EXISTS public.web_artifacts (
  id              UUID PRIMARY KEY,                 -- = cloud_id (desktop maps its INT PK → UUIDv7)
  user_id         <subject type> NOT NULL,          -- forced server-side; RLS WITH CHECK
  conversation_id UUID NOT NULL REFERENCES public.web_conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.web_messages(id) ON DELETE SET NULL, -- backref (de-dup key)
  title           TEXT,
  artifact_type   TEXT NOT NULL,                    -- 'html'|'react'|'svg'|'mermaid'|'code'|'document'|…
  language        TEXT,
  content         TEXT NOT NULL,                    -- current content (may diverge from message)
  current_version INTEGER NOT NULL DEFAULT 1,
  pinned          BOOLEAN NOT NULL DEFAULT false,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,                       -- tombstone (soft delete)
  server_version  BIGINT NOT NULL                    -- nextval(cloud_sync_version_seq) via trigger
);

-- web_artifact_versions: append-only version history (desktop's ArtifactVersion).
CREATE TABLE IF NOT EXISTS public.web_artifact_versions (
  artifact_id        UUID NOT NULL REFERENCES public.web_artifacts(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  content            TEXT NOT NULL,
  change_description TEXT,
  content_hash       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, version)
);

-- Reuse 0038's trigger fn: advance the shared cursor on every INSERT/UPDATE.
CREATE TRIGGER trg_web_artifacts_sync_version
  BEFORE INSERT OR UPDATE ON public.web_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.assign_cloud_sync_version();

CREATE INDEX IF NOT EXISTS idx_web_artifacts_server_version ON public.web_artifacts(server_version);
CREATE INDEX IF NOT EXISTS idx_web_artifacts_conversation   ON public.web_artifacts(conversation_id);

-- RLS: enable + WITH CHECK user_id = auth subject (match 0037; do NOT alter 0037).
```

Open schema sub-decisions (flagged for sign-off):

- **`<subject type>`**: match `web_conversations.user_id` exactly (uuid vs text) — confirm
  from 0037 before writing.
- **Version history**: separate `web_artifact_versions` table (above) vs a JSONB column on
  `web_artifacts`. Recommend the table (queryable, matches desktop's per-version rows;
  append-only so it never needs the version trigger).

## 3. Endpoint — extend `/api/chat/sync` (NOT a new route)

- **GET** `?since=<cursor>`: add `artifacts: ArtifactDelta[]` to the response, pulled with
  `where user_id=$1 and server_version > $2 order by server_version asc`, same bound
  pattern (`MAX_ARTIFACTS_PULL`). Versions ride inline on each artifact (bounded) or via a
  second bounded query keyed by the pulled artifact ids.
- **POST** `{ artifacts: [...] }`: UPSERT by `id`, `user_id` forced from JWT,
  last-writer-wins on metadata/content via the server_version/`updated_at` compare (same as
  conversations). Bound `MAX_ARTIFACTS_PUSH`. Version rows are append-only (insert-if-absent
  by `(artifact_id, version)`).
- `ArtifactDelta` shape (snake_case, mirrors MessageDelta): `id, conversation_id,
message_id, title, artifact_type, language, content, current_version, pinned, tags,
created_at, updated_at, deleted_at, server_version`.

## 4. Client roles (the asymmetry that avoids duplication)

- **Desktop = the only PUSHER.** Desktop owns first-class editable artifacts. On managed
  mode, it maps local INT `id`/`conversation_id`/`message_id` → their cloud UUIDs (reuse the
  P2 Phase-2 `cloud_id` mapping) and pushes via the extended endpoint. Reuses
  `cloudSyncTrigger` (mode transition / post-turn / periodic).
- **Web + mobile = PULL + render; do NOT push.** Their artifacts are local projections of
  already-synced messages, so pushing them would duplicate. They PULL desktop-authored
  artifacts and render them.
- **De-dup rule (load-bearing):** when a client renders a message, if a pulled cloud
  artifact exists with that `message_id`, render the CLOUD artifact (authoritative, may be
  edited) and SUPPRESS local re-extraction for that message. Otherwise fall back to local
  re-extraction (today's behavior). Keying on `message_id` makes this deterministic.
- **Edit propagation:** web/mobile remain view-only for now (no edit-in-place → no push
  path needed). If web/mobile editing is ever added, they become pushers too and the same
  last-writer-wins applies. Out of scope for P5.

## 5. Conflict resolution

Last-writer-wins by `server_version` (server-assigned) with `updated_at` as the client
intent timestamp, identical to P2 conversation metadata. Content is the editable field;
two devices editing the same artifact resolve to the latest `updated_at`. Version history
is append-only and union-merged by `(artifact_id, version)` so no version is lost.

## 6. Phasing (each phase independently verifiable; migration gated)

1. **Spec sign-off (this doc)** — founder approves schema + the de-dup rule. ← WE ARE HERE
2. **Migration `0039`** — apply on a Neon BRANCH first, verify, then prod via the Neon
   workflow. Additive, idempotent, does not touch `0037`/`0038`.
3. **Endpoint extension** — GET/POST artifacts on `/api/chat/sync`, with tests (RLS
   isolation, UPSERT idempotency, bound saturation, tombstones) mirroring the P2 sync tests.
4. **Desktop push/pull** — cloud_id mapping + wire into `cloudSyncTrigger`.
5. **Web + mobile pull + render + de-dup** — overlay cloud artifacts by `message_id`.
6. **Mobile UI polish (parallel, no schema):** preview/source toggle + live preview +
   download in `ArtifactFullScreen` (can land anytime, independent of 1–5).

## 7. What this does NOT do (scope guard)

- Does not change Local/BYOK behavior at all.
- Does not add edit-in-place to web/mobile.
- Does not touch the E2B execution path (separate, see e2b design doc).
- Does not alter `0037` RLS or `0038` versioning beyond reusing their sequence/trigger.

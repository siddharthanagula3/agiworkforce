# AGI Web — Volume 11 — Projects

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and real repo paths: `apps/web/app/api/projects/route.ts`, `apps/web/app/api/projects/[id]/route.ts`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts` (+ `[fileId]/route.ts`), `apps/web/app/api/projects/sync/route.ts`, `apps/web/app/projects/page.tsx`, `apps/web/app/projects/[id]/page.tsx`, `apps/web/features/projects/**`, `apps/web/db/neon/{0006_projects,0035_project_knowledge_file_lifecycle,0041_projects_cloud_sync}.sql`.

## Overview & stance

Projects group related conversations, instructions, and files under one workspace on AGI Web. Web is the **cloud-only** surface: there is **no BYOK and no Local mode**, so every project here is a Managed-Cloud object owned by a signed-in Clerk user and persisted to Neon (`user_projects`, `apps/web/db/neon/0006_projects.sql`). Managed Cloud is public alpha, open by default (founder decision 2026-06-27) — projects are presented as available, never waitlist-gated. Trust-mode routing hints a project may carry (`default_privacy_mode`, `default_provider_mode`, `allowed_surfaces`) exist so Desktop/CLI/VS Code can honor them; Web never acts on them to open a Local or BYOK path. Cross-device sync is the Neon delta-sync Web itself hosts (`apps/web/app/api/projects/sync/route.ts`), Web ↔ Mobile ↔ Desktop, Managed-Cloud only. All state-changing routes require Clerk auth, CSRF (`requireCsrfToken`), and rate limiting.

## Create

✅ Built — `POST /api/projects` (`apps/web/app/api/projects/route.ts`) inserts into `user_projects` with `user_id` bound server-side from the verified Clerk session (never the body). Validation: `name` required and ≤ 200 chars; `description` ≤ 2,000; `instructions` ≤ 10,000; `accentColor`/`defaultPrivacyMode`/`defaultProviderMode`/`importedFrom` validated against `@agiworkforce/types` enums; `iconEmoji` ≤ 16 chars. "Round-10" columns (`icon_emoji`, `accent_color`, `default_privacy_mode`, `default_provider_mode`, `allowed_surfaces`, `default_model_id`, `imported_from`) are only written when supplied, with a pre-migration fallback that retries legacy columns on PG `42703`. `default_model_id` is a stored string only — model IDs must originate from `packages/contracts/types/src/models.json`, never hardcoded here. The web hub (`apps/web/app/projects/page.tsx`, `handleCreateProject`) posts to this route and merges the canonical returned row into the shared `ProjectGallery` store (`@agiworkforce/unified-chat`), so a created project is server-backed, not device-local. Returns `201 { project }`.

## Rename

✅ Built — `PUT /api/projects/[id]` (`apps/web/app/api/projects/[id]/route.ts`) updates `name` (non-empty, ≤ 200) plus `description`, `instructions`, `color`, `is_archived`, and the round-10 fields, bumping `updated_at = now()`. The row is scoped by `where id = $1 and user_id = $2`, so a user can only rename their own projects; a missing row returns `404`. The UI entry point is `ProjectSettingsDialog` (`apps/web/features/projects/components/ProjectSettingsDialog.tsx`), reachable from the gallery gear and the per-project "…" menu (`apps/web/app/projects/[id]/page.tsx`). Same round-10 pre-migration fallback applies.

## Delete

✅ Built — `DELETE /api/projects/[id]` performs a **soft delete**: it sets `deleted_at = now(), updated_at = now()` (tombstone) rather than a hard `DELETE`, scoped to the owner. This is required by cross-device sync (`apps/web/db/neon/0041_projects_cloud_sync.sql`): the tombstone propagates on the next `/api/projects/sync` pull so a delete on one device does not resurrect from another device's stale copy. The list query (`GET /api/projects`) filters `deleted_at is null`. The hub's `handleDeleteProjectServer` calls the route, then removes the row from the local store in a `finally` block so the UI updates even if the network call fails. 🟡 Gap: there is no hard-purge / permanent-erase endpoint or retention window for tombstoned projects yet — track as a deletion-SLA item alongside billing/retention controls.

## Instructions — project prompts

✅ Built — Each project stores an `instructions` text field (schema `apps/web/db/neon/0006_projects.sql`; column enforced ≤ 10,000 chars on both `POST` and `PUT`). Edited via the "Instructions" textarea in `ProjectSettingsDialog` (`apps/web/features/projects/components/ProjectSettingsDialog.tsx`). Instructions are **synced core content**: `apps/web/app/api/projects/sync/route.ts` includes `instructions` in the delta payload, so a project prompt authored on Web reaches Mobile and Desktop. 🔭 Planned: automatic injection of these instructions as a system preamble into every project chat is a Runtime/chat concern and is not proven in this domain's code — treat prompt-application as design intent until a chat path cites it.

## Files

🟡 Partial — Knowledge files attach to a project via `GET/POST /api/projects/[id]/knowledge-files/route.ts` and soft-delete via `DELETE …/[fileId]/route.ts`. Uploads go to Vercel Blob from the client (`apps/web/features/projects/components/{KnowledgeFilesPanel,SourcesPanel,AddSourcesModal}.tsx`), which computes a SHA-256 checksum, enforces the client-side `MAX_FILE_BYTES` cap (10 MiB — `KnowledgeFilesPanel.tsx:20`, `SourcesPanel.tsx:31`; its comment wrongly claims it "mirrors" the 25 MiB server `MAX_ATTACHMENT_BYTES` in `packages/contracts/types/src/chat.ts:134` — a tracked client/server cap mismatch) and an allowlist of MIME types (images, PDF, text/markdown/CSV, JSON, XML, HTML), then records `file_name`, `mime_type`, `byte_count`, `checksum_sha256`, `source_surface`, and `storage_uri`. Ownership is re-verified server-side before every list/insert/delete. Schema: `project_knowledge_files` (`0006`) with lifecycle columns `added_at`, `retention_expires_at`, `deleted_at` (`apps/web/db/neon/0035_project_knowledge_file_lifecycle.sql`). Gaps: routes return a pre-migration `503 knowledge_files_unavailable` / empty list when the table/columns are absent (rollout guard, not final state); file **bytes are intentionally out of scope for delta-sync** (`apps/web/app/api/projects/sync/route.ts` header — bytes follow the media/blob path); and `retention_expires_at` is stored but no enforcement job is proven here.

## Knowledge

🔭 Planned (storage 🟡) — The `summary` column on `project_knowledge_files` and the retention field exist for a knowledge layer, but there is **no retrieval, embedding, chunking, or RAG pipeline** in this domain — uploaded files are stored and listed, not yet grounded into chat context. External sources (Google Drive, Slack) in `AddSourcesModal` deliberately route to `/connectors` and have **no import pipeline** (explicit "connect in Settings," not a faked ingest). Any future retrieval must stay Managed-Cloud and per-user scoped; embedding-model identifiers are non-LLM and must reference real repo code rather than being invented.

## Search

🟡 Partial — The Projects hub (`apps/web/app/projects/page.tsx`) offers name search (via the shared `ProjectGallery`) and sort modes (Updated / Created / Name / Starred). 🔭 Planned: full-text search **across project contents** — instructions, chats, and knowledge files — and cross-project search are not built; do not present a content-search box until a route backs it.

## Repository map

- `apps/web/app/api/projects/route.ts` — list + create.
- `apps/web/app/api/projects/[id]/route.ts` — get / rename-update / soft-delete.
- `apps/web/app/api/projects/[id]/knowledge-files/route.ts`, `…/[fileId]/route.ts` — file list/record/soft-delete.
- `apps/web/app/api/projects/sync/route.ts` — cross-device delta sync (cursor + tombstones + idempotent upsert).
- `apps/web/app/projects/page.tsx`, `apps/web/app/projects/[id]/page.tsx` — hub + detail UI.
- `apps/web/features/projects/**` — stores + `ProjectSettingsDialog`, `SourcesPanel`, `AddSourcesModal`, `KnowledgeFilesPanel`, `FilePreviewModal`.
- `apps/web/db/neon/{0006_projects,0035_project_knowledge_file_lifecycle,0041_projects_cloud_sync}.sql` — schema, lifecycle, sync.
- `apps/web/lib/projects.ts` (`mapProjectRow`, `mapKnowledgeFileRow`); `apps/web/lib/server/rls-db.ts` (`getUserScopedDb`).

## Competitor notes

Claude Projects and ChatGPT Projects/GPTs bundle custom instructions plus a knowledge base with retrieval; Codex scopes work to a repo/workspace rather than a chat "project." AGI's divergence: projects are Managed-Cloud objects on Web but **carry per-surface trust hints** (privacy/provider mode, allowed surfaces) so the same project behaves as Local or BYOK on Desktop/CLI/VS Code — routing hints Web stores but never acts on. Sync is our own Neon delta-sync (RLS-scoped, tombstoned), not a vendor black box, and knowledge retrieval is deliberately unshipped rather than faked.

## Acceptance / Definition of Done

Production-ready when create/rename/soft-delete round-trip through Neon with owner scoping, tombstones propagate via sync, file upload enforces size/MIME/checksum, and no UI copy promises unbuilt retrieval or content search.

- [ ] Build: `POST`/`PUT`/`DELETE` and knowledge-file routes pass with CSRF + rate limit; soft-delete tombstone hides the row from `GET /api/projects` and appears in `/api/projects/sync` pulls.
- [ ] Trust: no BYOK/Local affordance on Web; `default_privacy_mode`/`default_provider_mode`/`allowed_surfaces` are stored/synced-excluded per the sync route, never used to open a non-cloud path.
- [ ] Security: every project/file route re-verifies ownership; sync runs through `getUserScopedDb` (RLS); `user_id` is always server-derived; uploads reject files over the client `MAX_FILE_BYTES` cap (10 MiB; server `MAX_ATTACHMENT_BYTES` is 25 MiB — reconcile the mismatch) and non-allowlisted MIME types.

## Anti-patterns

- Adding a BYOK or Local toggle, or routing a Web project's chats/files off Managed Cloud.
- Hard-deleting projects (breaks cross-device sync — always soft-delete with a tombstone).
- Trusting `user_id` from the request body instead of the Clerk session; skipping the ownership check on file routes.
- Claiming knowledge retrieval, RAG, connector import, or content search as shipped — they are 🔭; keep UI copy honest.
- Hardcoding a `default_model_id` not sourced from `packages/contracts/types/src/models.json`.
- Syncing file bytes or trust-routing hints through the projects delta API, or exposing removed tiers (Plus/Hobby/`pro_plus`), credit top-ups, Supabase, or `middleware.ts` (Web uses `proxy.ts`).

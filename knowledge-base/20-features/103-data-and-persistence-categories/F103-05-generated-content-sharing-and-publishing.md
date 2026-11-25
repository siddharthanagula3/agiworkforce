---
id: "F103-05"
type: "feature"
title: "Generated content, sharing and publishing"
aliases: ["Citations and source locators (S103.17)", "Artifacts and revisions (S103.18)", "Generated applications and deployments (S103.19)", "Media jobs and assets (S103.20)", "Published-content access rules (S103.38)", "shared_sessions", "published_artifacts", "research_reports", "image_generation_jobs", "video_generation_jobs", "Share link"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.17", "S103.18", "S103.19", "S103.20", "S103.38"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-inference-providers", "SYS-chat-turn-pipeline", "surface:web", "mode:cloud", "table:shared_sessions", "table:published_artifacts", "table:research_reports", "table:image_generation_jobs", "table:video_generation_jobs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-05 Generated content, sharing and publishing

Server records for things the assistant produces and the person shares: research reports with their citations, artifacts with version history, published pages, image and video jobs with their assets, and shared chat links with expiry. Share links expire in 1, 7 or 30 days. Published pages have no expiry and stay until unpublished. All runs on our servers.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.17](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10317), [S103.18](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10318), [S103.19](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10319), [S103.20](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10320), [S103.38](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10338).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps citations inside research reports (apps/web/db/neon/0094_research_reports.sql:28), artifacts and their versions (web_artifacts, web_artifact_versions, apps/web/db/neon/0039_artifact_cloud_sync.sql:59), published pages by token (apps/web/db/neon/0095_published_artifacts.sql:47), durable image and video jobs (apps/web/db/neon/0226_durable_image_generation_jobs.sql:32; apps/web/db/neon/0105_durable_video_generation_jobs.sql), and shared chat snapshots (apps/web/db/neon/0051_shared_sessions.sql:1).

**Why it exists.** So generated work survives the request that made it, can be shared by link with controlled access, and paid generation is not lost when a tab closes (apps/web/db/neon/0226_durable_image_generation_jobs.sql:4-12). Brief items S103.17 to S103.20 and S103.38 (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md).

**Who uses it.** People who share chats, publish artifacts, run research or generate images and video; anyone opening a shared link.

**Problems it solves**

- A shared chat that never stops working (expiry, apps/web/app/api/share/route.ts:80)
- Leaking secrets or local paths in a shared transcript (apps/web/app/api/share/route.ts sanitising helpers)
- Losing a research report when the tab closes (apps/web/db/neon/0094_research_reports.sql:1-20)
- Paying twice for a retried image (apps/web/db/neon/0226_durable_image_generation_jobs.sql:4-12)

**Use cases**

- Share a chat for 7 days and revoke it early.
- Publish an HTML artifact and later unpublish it.
- Run Deep Research and reopen the report with citations.
- Start a video, close the tab, and find the finished video later.

## 2. User experience

**Where to find it**

- Web: share dialog (apps/web/features/chat/components/share/ShareConversationDialog.tsx), Settings > Shared links (apps/web/features/settings/sections/SharedLinksSection.tsx:306), shared page /share/[token], /chat/artifacts, /chat/images, Research report view with a 'Library' button (apps/web/features/chat/components/research/ResearchReportView.tsx:390).
- Other apps: sharing and publishing UI on desktop, mobile, CLI, VS Code and Chrome not traced.

**Before you start**

- A chat saved to the account: 'Only a chat saved to your account can be shared. Turn on sync for this chat, then share it again.' (apps/web/app/api/share/route.ts:204).
- Workspace policy external_sharing_enabled must allow it (buildExternalSharingGateResponse, apps/web/app/api/share/route.ts).

**Screens and controls**

- Share dialog with expiry choice of 1, 7 or 30 days (apps/web/app/api/share/route.ts:80).
- Shared links list with revoke.
- Publish and unpublish for artifacts (apps/web/app/api/artifacts/publish/route.ts:136).
- Image and video generate, status, cancel, retry (apps/web/app/api/media).

**Journey**

1. 1. Person picks Share and an expiry.
2. 2. Server checks the chat is saved and sharing is allowed, compares the snapshot with stored messages, strips secrets and local paths.
3. 3. A token is created and the link returned.
4. 4. Anyone with the link (or, if visibility is organization, a signed-in member with a grant) reads the snapshot until it expires.
5. 5. The owner can update the snapshot or revoke.

**What the person sees and gets**

- Update of a dead link: 'This link was revoked or has expired, so there is nothing to update. Create a new link instead.' (apps/web/app/api/share/route.ts:382).
- Out-of-date snapshot: 'This chat has changes that are not saved to your account yet. Wait for them to save, then share again.' (apps/web/app/api/share/route.ts:205).
- List shows an expired flag per link (apps/web/app/api/share/route.ts:791).
- Revoke returns the count revoked (apps/web/app/api/share/route.ts:835).

**Settings**

- Share visibility: public or organization (apps/web/db/neon/0186_organization_shared_sessions.sql:70).
- Published page visibility values come from MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES (apps/web/lib/services/published-artifact-service.ts:60-85); code also writes 'invited' for artifacts that are live artifacts (apps/web/lib/services/published-artifact-service.ts:421).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/share creates a token with random bytes, snapshot messages, owner, expiry and visibility (apps/web/app/api/share/route.ts:572-608).
- Expiry choices are 1, 7 or 30 days (apps/web/app/api/share/route.ts:80).
- Refresh (PUT) updates a link only while expires_at is in the future (apps/web/app/api/share/route.ts:401).
- Revoke (DELETE) hard-deletes the live link rows for a conversation (apps/web/app/api/share/route.ts:817) and records a share_link_revoked event.
- Published pages: kinds html, react, svg, mermaid, markdown, text, code; content up to 1,000,000 characters; unique per user and artifact id, so publishing again updates the same row (apps/web/db/neon/0095_published_artifacts.sql:47; apps/web/lib/services/published-artifact-service.ts:421).
- Unpublish deletes the row by token and user (apps/web/lib/services/published-artifact-service.ts:563).
- No expiry column or expiry check was found for published pages (search of apps/web/lib/services/published-artifact-service.ts for 'expires' returned nothing).
- Research report upsert by user and request id keeps citations, steps, status and error (apps/web/lib/services/research-report-service.ts:238).
- Image jobs: create, claim attempt, defer failure, fail, complete, cancel, requeue and close exhausted (apps/web/lib/server/image-generation-jobs.ts:220-630). Video jobs: admission, create, workflow attach, provider task record, cancel, claim and defer (apps/web/lib/server/video-generation-jobs.ts:270-848).
- Artifacts sync through /api/chat/sync, which also schedules artifact indexing (apps/web/app/api/chat/sync/route.ts:302,764).

**Incomplete**

- Version history for published pages (published_artifact_versions, restore) is described in migration 0257, headed not applied (apps/web/db/neon/0257_file_versions_and_lineage.sql:4); service functions listPublishedArtifactVersions and restorePublishedArtifactRecord exist (apps/web/lib/services/published-artifact-service.ts:500,971).

**Present but disconnected or switched off**

- Migration 0226 (image jobs) carries 'NOT YET APPLIED : draft only' (apps/web/db/neon/0226_durable_image_generation_jobs.sql:4); the video job migration 0105 does not carry that header in its first lines. Applied state: unknown.

**Not available**

- Expiry for published pages: not offered; they live until unpublished.
- Other apps' share and publish screens: not traced.

## 4. Required behaviour

**Established requirements**

- Citations and source locators are persisted with the answers that use them and classified. (source: S103.17)
- Artifacts and their revision history are durably stored and classified. (source: S103.18)
- Generated applications and published artifacts, with deployed versions, are stored and classified. (source: S103.19)
- Media generation jobs and their assets are durably stored and classified. (source: S103.20)
- Access rules for shared and published content (visibility, expiry, revocation) are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.38)
- A retryable image failure keeps its single billing reservation so trying again is free. (source: apps/web/db/neon/0226_durable_image_generation_jobs.sql:4)

**Acceptance criteria**

1. Create a share with expiry 7: expires_at is 7 days ahead; a request with expiry 3 is refused.
2. After expiry, the share page refuses and a refresh gets the 'create a new link' message.
3. Revoke removes the link and the page stops loading.
4. Publish the same artifact twice: one row, same token, content updated.
5. Unpublish: the page no longer loads.
6. Run research, kill the request: a row exists with status interrupted or failed and the retry updates the same row.
7. Start an image job, close the tab: the job and its assets are readable by id later.
8. A share for a chat not saved to the account is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because revoke deletes rows, a revoked link cannot be distinguished from a never-existing one on the viewer page [inferred from apps/web/app/api/share/route.ts:817].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep revoked links as rows with a revoked time so audit can show them.
- [proposed] Offer an optional expiry for published pages.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | shared_sessions | `apps/web/db/neon/0051_shared_sessions.sql` | Shared chat snapshot with token, owner, expiry. |
| schema | share visibility and organization grants | `apps/web/db/neon/0186_organization_shared_sessions.sql` | visibility public or organization and grant rows. |
| endpoint | /api/share | `apps/web/app/api/share/route.ts` | Create, refresh, list, revoke shares. |
| endpoint | /api/share/[token] | `apps/web/app/api/share/[token]/route.ts` | Read a shared snapshot by token. |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | Published page by token. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publish, restore, unpublish, list, read by token. |
| endpoint | /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish and list publications. |
| table | web_artifacts / web_artifact_versions | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Artifacts and append-only versions. |
| endpoint | /api/chat/sync | `apps/web/app/api/chat/sync/route.ts` | Syncs artifacts and schedules their indexing. |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Report text, citations, steps, status. |
| service | research-report-service | `apps/web/lib/services/research-report-service.ts` | Upsert and read reports. |
| table | image_generation_jobs | `apps/web/db/neon/0226_durable_image_generation_jobs.sql` | Durable image jobs with attempts and a billing reservation. |
| service | image-generation-jobs | `apps/web/lib/server/image-generation-jobs.ts` | Job life cycle. |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Durable video jobs with provider task id and lease. |
| service | video-generation-jobs | `apps/web/lib/server/video-generation-jobs.ts` | Video job life cycle. |
| endpoint | /api/media/image and /api/media/video | `apps/web/app/api/media/image/generate/route.ts` | Start, status, cancel and retry generation. |
| service | media-assets | `apps/web/lib/server/media-assets.ts` | Stores generated outputs in the Library catalog. |
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Share UI. |
| component | SharedLinksSection | `apps/web/features/settings/sections/SharedLinksSection.tsx` | Shared links list and revoke. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies shares, publications, reports and jobs. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks to share; app sends conversation id and expiry. | device and our servers | apps/web/app/api/share/route.ts:572 |
| Server verifies the chat is stored, applies the sharing policy, checks the snapshot against stored messages, inspects for secrets and strips local paths. | our servers | apps/web/app/api/share/route.ts:204-205,572-596 |
| Row inserted with token and expiry; link returned; an event is recorded. | our servers | apps/web/app/api/share/route.ts:598-632 |
| Image or video job: a billing reservation is made, a provider is called, assets are saved to the Library catalog. | our servers | apps/web/db/neon/0226_durable_image_generation_jobs.sql:4; apps/web/lib/server/video-generation-jobs.ts:320 |
| The image or video itself is produced by a provider. | outside service | apps/web/lib/server/video-generation-jobs.ts:574 (recordVideoProviderTask) |
| Research report is written by the research loop after search and synthesis. | our servers | apps/web/db/neon/0094_research_reports.sql:1-20 (comment names research-loop.ts) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shared snapshot | shared_sessions (messages as jsonb) | Server only; viewers read by token. | Until expiry or revoke (hard delete). |
| Published page content | published_artifacts | Served by token. | Until unpublished; deleted with the conversation via unpublishArtifactsForConversations (apps/web/lib/services/published-artifact-service.ts:581). |
| Generated media bytes and rows | Object storage plus media_assets and job tables | Library lists them. | Library recovery rules (F103-04). |
| Reports and citations | research_reports.citations | Read on web. | Cascade with the conversation (apps/web/db/neon/0094_research_reports.sql:28). |

**Models and providers.** Image and video generation and research use model providers behind the managed route; media rows record provider and model (apps/web/db/neon/0036_media_assets.sql:9). Specific models are not named here. Own-key (BYOK) behaviour for media jobs: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required to create shares, publish, or run jobs; viewers of a public link need none; organization-visibility links need a signed-in member with a grant (apps/web/db/neon/0186_organization_shared_sessions.sql:70). |
| Permissions | Owner checks on every write; share creation passes the workspace external-sharing gate; publication admission checks quota (test apps/web/lib/services/__tests__/published-artifact-service.quota-admission.test.ts). |
| Subscription | Image and video jobs hold a managed usage reservation (apps/web/db/neon/0226_durable_image_generation_jobs.sql:4-12). A daily share-create rate limit per account exists ('share-create-account-day', apps/web/app/api/share/route.ts). Plan limits for publications: a quota admission exists (admitPublishedArtifact); values unknown. |
| Limits and metering | Expiry 1, 7 or 30 days; default value DEFAULT_SHARE_EXPIRY_DAYS (value not opened); content cap 1,000,000 characters; rate limit values unknown. |
| Feature flags | none found in the code opened. |
| Model compatibility | Not opened for media jobs. |
| Provider restrictions | Video jobs keep a provider task id (apps/web/db/neon/0105_durable_video_generation_jobs.sql:1-8). |
| Local mode | Sharing and publishing need the server, so they are Cloud actions. A local-only chat cannot be shared because it must be saved to the account first (apps/web/app/api/share/route.ts:204). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Expired or revoked link | Viewer refused; owner update gets the create-new-link error. | apps/web/app/api/share/route.ts:382,401 |
| Unsaved or changed chat | Share refused with a message. | apps/web/app/api/share/route.ts:204-205 |
| Sharing blocked by workspace policy | Gate response returned. | apps/web/app/api/share/route.ts:572-596 |
| Image job retryable failure | Job stays open with the reservation until attempts run out, cancel or lease expiry. | apps/web/db/neon/0226_durable_image_generation_jobs.sql:4 |
| Cancel while video running | Cancellation requested and provider cancellation attempted; settlement rule in migration 0392. | apps/web/lib/server/video-generation-jobs.ts:704,723 |
| Interrupted research | An interrupted or failed row is written first and overwritten by the completed report. | apps/web/db/neon/0094_research_reports.sql:1-20 |
| Offline, accessibility | not established in this pass. | Share dialog and viewer components not opened |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/share/route.test.ts`: Share routes.
- `apps/web/app/api/share/[token]/route.test.ts`: Viewing a share.
- `apps/web/app/api/share/[token]/route.visibility.test.ts`: Visibility.
- `apps/web/app/api/share/archive-policy.test.ts`: Archive policy.
- `apps/web/features/chat/components/share/ExpiredShareBanner.test.tsx`: Expired banner.
- `apps/web/features/chat/components/share/ShareConversationDialog.test.tsx`: Dialog.
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route.
- `apps/web/lib/services/published-artifact-service.test.ts`: Publish service.
- `apps/web/lib/services/__tests__/published-artifact-service.visibility.test.ts`: Visibility.
- `apps/web/lib/services/research-report-service.test.ts`: Reports.
- `apps/web/db/neon/research-reports-migration.test.ts`: Report migration.
- `apps/web/lib/server/__tests__/media-image-jobs.test.ts`: Image jobs.
- `apps/web/lib/server/video-generation-jobs.test.ts`: Video jobs.

**Test scenarios**

- **Expiry choices**
  1. POST /api/share with expires_in_days 7, then 3.
  - Expected: 7 accepted with matching expires_at; 3 rejected.
- **Dead link update**
  1. Create a share.
  2. Revoke it.
  3. Call PUT refresh with its token.
  - Expected: Error asking to create a new link.
- **Republish**
  1. Publish an artifact.
  2. Change and publish again.
  3. Open the link.
  - Expected: Same token, new content.
- **Closed tab image job**
  1. Start an image job.
  2. Close the client.
  3. Poll status by job id.
  - Expected: Job finishes and assets are listed.
- **Organization visibility**
  1. Create an organization-visibility share.
  2. Open it signed out, then as a member.
  - Expected: Signed-out refused; member opens.

**Where to look when it fails**

- shared_sessions.expires_at; audit events share_link_created, share_link_updated, share_link_revoked.
- research_reports.status and error columns.
- Job tables' status, attempt and lease columns.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Revoked shares leave no row.** Affects: Audit and viewer messages. Evidence: apps/web/app/api/share/route.ts:817. Work needed: Decide on tombstone rows.
- **Draft migrations 0226 and 0257 not marked applied.** Affects: Image jobs and page version history on all apps. Evidence: headers line 4 of each file. Work needed: Confirm ledger.
- **Per-app share and publish surfaces not traced.** Affects: Desktop, Mobile, CLI, VS Code, Chrome. Evidence: Brief status 'platform'. Work needed: Trace each app.
- **Citations are stored inside research reports; citation storage for ordinary answers not confirmed.** Affects: Web chat. Evidence: apps/web/lib/services/research-report-service.ts:238 only. Work needed: Trace message-level citations.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-inference-providers
- SYS-chat-turn-pipeline
- surface:web
- mode:cloud
- table:shared_sessions
- table:published_artifacts
- table:research_reports
- table:image_generation_jobs
- table:video_generation_jobs

## Unknown

- Whether migrations 0226 and 0257 are applied in production.
- Value of DEFAULT_SHARE_EXPIRY_DAYS and the rate limits.
- Which providers and models serve image, video and research.
- Own-key and Local behaviour for media jobs.
- Share and publish screens on desktop, mobile, CLI, VS Code and Chrome.
- Whether ordinary chat answers store citations outside research reports.

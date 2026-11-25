---
id: "F096-01"
type: "feature"
title: "Account-wide artifact index"
aliases: ["Account-wide artifact index", "Artifact index", "Artifact registry (brief S96.01)", "web_artifact_index table (migration 0121)", "GET /api/artifacts/index", "Artifacts gallery (index feed)", "Project Artifacts tab"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.01"]
depends_on: ["SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-authentication-and-identity", "table:web_artifact_index", "table:web_conversations", "table:web_messages", "api:GET /api/artifacts/index"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-01 Account-wide artifact index

A metadata-only list of every artifact an account's assistant messages have produced. The server writes one row per artifact when an assistant message is saved. The web gallery, the web and phone project Artifacts tabs, the CLI and the VS Code tree read it, so a new device sees artifacts it never opened. It holds no artifact content.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.01](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9601).

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

**What it does.** Stores id, title, type, language, source conversation, source message and time for each artifact found in assistant message markdown, and serves the caller's rows newest first, optionally limited to one project (apps/web/app/api/artifacts/index/route.ts:39-106; apps/web/db/neon/0121_artifact_index.sql:37).

**Why it exists.** Web artifacts are re-derived from message text, so a device only knew artifacts from chats it had rendered. The index fixes discovery without copying content (apps/web/db/neon/0121_artifact_index.sql header; doc: docs/architecture/derived-state.md).

**Who uses it.** Signed-in people on web (gallery and project panel), phone (project tab), CLI (artifacts list) and VS Code (artifacts tree). Engineers use it as the account's artifact registry.

**Problems it solves**

- Gallery showed one artifact after clearing local storage while the account had four (apps/web/db/neon/0121_artifact_index.sql header)
- Project views could not list artifacts from chats never opened on this device (apps/web/features/projects/components/ProjectArtifactsPanel.tsx:28)
- No second copy of content to drift from the message (apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:40-48)

**Use cases**

- Open /gallery on a new laptop and see every artifact the account made
- Open a project and see all artifacts from its chats
- Run the CLI artifacts list command to find an artifact id to show or publish
- Browse artifacts in the VS Code Artifacts tree

## 2. User experience

**Where to find it**

- Web: /gallery page, heading 'Artifacts', with the 'Yours' scope (apps/web/app/gallery/page.tsx:18; apps/web/app/gallery/GalleryClient.tsx:1401). The old /chat/artifacts route only redirects to /chat/library?surface=artifact (apps/web/app/chat/artifacts/page.tsx:8).
- Web: a project's Artifacts panel (apps/web/features/projects/components/ProjectArtifactsPanel.tsx:28)
- Mobile: the project Artifacts tab (apps/mobile/src/features/projects/components/ProjectArtifactsTab.tsx:53)
- CLI: 'agi artifacts list --limit N' (apps/cli/src/lib.rs:10147)
- VS Code: command 'Code: Show Artifacts' (apps/extension-vscode/package.json:690)
- Desktop (public Electron app shows the hosted web app): same web pages (doc: AGENTS.md section 5). Chrome extension: no use of the index found (grep of apps/extension).

**Before you start**

- Signed in; signed-out web shows the real empty state and makes no request (apps/web/features/chat/hooks/use-artifact-index.ts:65-68)
- At least one assistant message that contains a renderable block, saved through the server

**Screens and controls**

- Gallery: search 'Search artifacts', filter 'Filter by: ...', scope control 'Show artifacts' (apps/web/app/gallery/GalleryClient.tsx:1416,1480,1506)
- Project panel list rows open the source chat (apps/web/features/projects/components/ProjectArtifactsPanel.tsx header comment)
- Mobile row label 'Open <title> in its chat' (apps/mobile/src/features/projects/components/ProjectArtifactsTab.tsx)

**Journey**

1. Open the Artifacts gallery or a project
2. The page reads GET /api/artifacts/index (with projectId on project views) (apps/web/features/chat/hooks/use-artifact-index.ts:78)
3. Rows merge with artifacts derived on this device by id; the local copy wins because it has content (apps/web/app/gallery/GalleryClient.tsx:1213-1243)
4. Index-only rows show as cards without a live thumbnail; opening one goes to its source chat where the artifact is re-derived (apps/web/app/gallery/GalleryClient.tsx comment above line 1213)

**What the person sees and gets**

- Gallery empty text: 'Artifacts you create in conversations will appear here.' (apps/web/app/gallery/GalleryClient.tsx:1626)
- Project panel: 'Loading artifacts...', 'No artifacts yet', 'This project's artifacts could not be loaded.' (apps/web/features/projects/components/ProjectArtifactsPanel.tsx:41,57)
- Mobile: 'Artifacts could not be loaded' or 'No artifacts yet' (apps/mobile/src/features/projects/components/ProjectArtifactsTab.tsx:53)
- Untitled rows show 'Untitled artifact' (apps/web/app/gallery/GalleryClient.tsx:1218)

**Settings**

- No setting found. Query parameters: limit (1-500, default 200) and projectId (uuid) (apps/web/app/api/artifacts/index/route.ts:39-40,68)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server writes index rows after assistant messages are saved from seven call sites: single save, bulk save, keep, message edit, sync push, managed chat turn persistence and branch copy (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:147; .../messages/bulk/route.ts:161; .../[id]/keep/route.ts:155; .../messages/[messageId]/route.ts:165; apps/web/app/api/chat/sync/route.ts:762; apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:436; apps/web/lib/services/conversation-branch-service.ts:466)
- Indexing is fire-and-forget; failure is only logged (apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:108-125)
- Re-index deletes the message's old rows then inserts, so a retry leaves no stale rows (index-artifacts.ts:70,77)
- Titles are capped at 200 characters (index-artifacts.ts:40)
- Read route validates limit and projectId, rate limits, runs in a user-scoped database, skips deleted conversations, returns metadata only (apps/web/app/api/artifacts/index/route.ts:39,55,67,84)
- Table has row-level security with FORCE (apps/web/db/neon/0121_artifact_index.sql:65-70)
- Account erasure, export and deletion manifest include the table (apps/web/lib/server/account-erasure.ts:49; apps/web/app/api/user/export/route.ts:2475; apps/web/lib/services/deletion-manifest.ts:114)
- CLI, VS Code and phone project tab read the same endpoint (apps/cli/src/cloud/artifacts.rs:299; apps/extension-vscode/src/features/artifacts/artifactsClient.ts:64; apps/mobile/src/features/projects/projectArtifacts.ts:4)

**Incomplete**

- No cursor or page token: only the newest 500 rows can ever be read (apps/web/app/api/artifacts/index/route.ts:39,68)
- No backfill job for messages saved before migration 0121 was applied was found (search of scripts and db folders found only the migration and a guard script)
- Phone main Artifacts screen uses its local store, not the index; only the project tab calls the index (apps/mobile/app/(app)/artifacts/index.tsx:1-6; apps/mobile/src/features/projects/projectArtifacts.ts)

**Present but disconnected or switched off**

- Library surface 'artifact' (/chat/library?surface=artifact) does not call useArtifactIndex; its data source was not traced (apps/web/features/library/components/LibraryView.tsx:77; grep of useArtifactIndex callers shows only gallery and project panel)

**Not available**

- Desktop Tauri build, Chrome extension: no caller of the index found (grep of apps/desktop/src and apps/extension). Public Desktop is the hosted web app (doc: AGENTS.md section 5).
- Index content: by design none (packages/contracts/cloud-contracts/src/artifact-index.ts:19-28)

## 4. Required behaviour

**Established requirements**

- A server-side registry records every artifact (id, type, title, source conversation/message) for the account. (source: brief S96.01)
- The index holds metadata only, never content; rows are keyed by the deterministic derived id so they merge with locally derived artifacts. (source: apps/web/db/neon/0121_artifact_index.sql header; doc: docs/architecture/derived-state.md)
- Rows are written by the server when an assistant message is saved; indexing never fails or delays the save. (source: apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:108-125)
- Each user sees only their own rows (row-level security). (source: apps/web/db/neon/0121_artifact_index.sql:65-70)
- Default page 200, maximum 500. (source: apps/web/app/api/artifacts/index/route.ts:39,68)
- Artifacts carry id, title, type and source message or session. (source: doc: docs/product/requirements.md section 9.5)

**Acceptance criteria**

1. After an assistant message with a renderable block is saved, one row exists with the same id the client derives
2. The row has no content column and title is at most 200 characters
3. GET /api/artifacts/index returns only the caller's rows, newest first, default 200, maximum 500; limit 501 returns a validation error
4. projectId returns only artifacts whose source conversation is in that project; a non-uuid projectId is rejected
5. Deleting a conversation removes its artifacts from the list
6. A forced indexing failure still saves the message
7. Signed-out web gallery shows its empty state without a network call

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local-mode chats that never reach the server have no index rows; the index is Cloud-side only [inferred from the table being server-side and written by server routes]
- A reader that needs content must fetch the message and derive it [inferred from packages/contracts/cloud-contracts/src/artifact-index.ts:13-18 comment]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a cursor so accounts with more than 500 artifacts can page
- [proposed] Add a one-time rebuild job from messages for history older than migration 0121
- [proposed] Show index rows on the phone main Artifacts screen

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | web_artifact_index | `apps/web/db/neon/0121_artifact_index.sql` | Metadata rows, indexes on (user_id, created_at) and message_id, FORCE RLS policy |
| service | indexMessageArtifacts / scheduleArtifactIndexing | `apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts` | Derives artifacts from message text and writes rows; fire-and-forget wrapper |
| endpoint | GET /api/artifacts/index | `apps/web/app/api/artifacts/index/route.ts` | Reads the caller's rows with optional projectId and limit |
| service | persistMessage call site | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Schedules indexing for saved assistant messages |
| endpoint | bulk messages route | `apps/web/app/api/chat/conversations/[id]/messages/bulk/route.ts` | Schedules indexing for bulk-saved assistant messages |
| endpoint | chat sync push | `apps/web/app/api/chat/sync/route.ts` | Schedules indexing for assistant messages pushed from other surfaces (line 762) |
| service | assistant turn persistence | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Schedules indexing for managed chat turns (line 436) |
| service | conversation branch service | `apps/web/lib/services/conversation-branch-service.ts` | Indexes copied messages on branch (line 466) |
| schema | ManagedCloudArtifactIndexEntrySchema | `packages/contracts/cloud-contracts/src/artifact-index.ts` | Shared wire contract; rejects a row carrying content |
| hook | useArtifactIndex | `apps/web/features/chat/hooks/use-artifact-index.ts` | Web client read with loaded and error state |
| screen | GalleryClient | `apps/web/app/gallery/GalleryClient.tsx` | Merges index rows with local artifacts, filters, search |
| component | ProjectArtifactsPanel | `apps/web/features/projects/components/ProjectArtifactsPanel.tsx` | Project-scoped list with loading, error and empty states |
| service | fetchProjectArtifacts | `apps/mobile/src/features/projects/projectArtifacts.ts` | Phone read of the index for one project |
| component | ProjectArtifactsTab | `apps/mobile/src/features/projects/components/ProjectArtifactsTab.tsx` | Phone tab UI |
| command | agi artifacts list | `apps/cli/src/cloud/artifacts.rs` | CLI route to the index (list_route, line 299) |
| service | createExtensionArtifactsWorkspace | `apps/extension-vscode/src/features/artifacts/artifactsClient.ts` | VS Code client for the index |
| config | account erasure and export lists | `apps/web/lib/server/account-erasure.ts` | Deletes the table's rows with the account (line 49) |
| config | deletion manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies the table as derived content (line 114) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| An assistant message is saved on the server (single, bulk, keep, edit, sync push, managed turn, branch) | our servers | apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:147 |
| Artifacts are derived from the message text with the shared derivation under the policy stored in message metadata | our servers | apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:58-62 |
| Old rows for the message are deleted and the new rows inserted in one unnest statement; errors are logged only | our servers | index-artifacts.ts:70-125 |
| A client asks GET /api/artifacts/index; the route validates, rate limits and queries as the user | our servers | apps/web/app/api/artifacts/index/route.ts:55-90 |
| The client merges rows with locally derived artifacts by id | device | apps/web/app/gallery/GalleryClient.tsx:1213-1243 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| id, user_id, conversation_id, message_id, ordinal, title, artifact_type, language, created_at | table web_artifact_index (apps/web/db/neon/0121_artifact_index.sql:37-49) | Server-held; clients read it, never write it | Cascades when the conversation or message is deleted; erased with the account (0121 FK lines; apps/web/lib/server/account-erasure.ts:49) |

**Models and providers.** No model or provider takes part. Derivation is code. The artifact text exists because a model wrote it, but any model works [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the route resolves the user through getUserScopedDb (apps/web/app/api/artifacts/index/route.ts:67). CORS wrapper present (route.ts:106). |
| Permissions | Row-level security restricts rows to the user (apps/web/db/neon/0121_artifact_index.sql:65-70). Workspace or organization rules: none found in this route. |
| Subscription | none found in the code |
| Limits and metering | Rate limit bucket 'chat-conversation' (route.ts:55); page size 200 default and 500 maximum; title 200 characters (index-artifacts.ts:40). No usage metering found. |
| Feature flags | none found in the code |
| Model compatibility | Independent of model; derives from message markdown. |
| Provider restrictions | none found in the code |
| Local mode | The index is server-side. Chats that stay on the device are not indexed because nothing writes the table from the device; no code path found that sends Local chats to the index. Local artifacts still appear in the web gallery from the local store (apps/web/app/gallery/GalleryClient.tsx:1226-1242). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Gallery shows skeleton until loaded; project panel shows 'Loading artifacts...' | apps/web/app/gallery/GalleryClient.tsx:1291 (yoursLoading); apps/web/features/projects/components/ProjectArtifactsPanel.tsx:31-36 |
| Empty | Gallery empty state and 'No artifacts yet' project text | GalleryClient.tsx:1626; ProjectArtifactsPanel.tsx:57 |
| Error | Hook keeps previous rows and sets an error message; project panel shows an alert only when there are no rows; gallery degrades quietly to local artifacts | apps/web/features/chat/hooks/use-artifact-index.ts:89-101; ProjectArtifactsPanel.tsx:38-44 |
| Signed out | No request; loaded with empty list | use-artifact-index.ts:65-68 |
| Cancel / unmount | Request is aborted | use-artifact-index.ts:104-107 |
| Indexing failure | Logged as '[artifact-index] failed to index message artifacts'; message save unaffected | index-artifacts.ts:116-124 |
| Retry or offline | Web hook has no retry; mobile asks the person to reopen the tab; CLI and VS Code retry not examined | apps/mobile/src/features/projects/components/ProjectArtifactsTab.tsx:53-56 |
| Rows beyond 500 | not handled in the code (no cursor) | apps/web/app/api/artifacts/index/route.ts:39 |
| Accessibility | Project list has role status and alert text; mobile rows carry accessibilityLabel | ProjectArtifactsPanel.tsx:31,38; ProjectArtifactsTab.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/index/route.project.test.ts`: Project derived from conversation, project filter bound to caller, null filter, deleted conversations skipped, non-uuid projectId rejected
- `apps/web/app/api/chat/conversations/[id]/messages/lib/__tests__/index-artifacts.test.ts`: Same ids as client, no content written, title cap, clear-then-insert, no artifacts, explicit policy, failure swallowed
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.artifact-index.test.ts`: Managed turn indexing, indexer failure does not fail persistence, no index when insert affects no rows
- `apps/web/app/api/chat/conversations/[id]/messages/bulk/route.artifact-index.test.ts`: Bulk assistant indexed, user messages not
- `apps/web/app/api/chat/sync/route.artifact-index.test.ts`: Sync-pushed assistant indexed, tombstoned or user messages not, scoped read-back
- `packages/contracts/cloud-contracts/src/__tests__/artifact-index.test.ts`: Wire row accepted; a row with content rejected
- `apps/web/app/gallery/GalleryClient.test.tsx`: Gallery scopes, filters and empty state with a mocked index hook
- `apps/mobile/src/features/projects/__tests__/ProjectArtifactsRoutines.test.tsx`: Phone request to /api/artifacts/index?projectId=...
- `apps/web/lib/services/__tests__/deletion-manifest.test.ts`: web_artifact_index classed as derived content

**Test scenarios**

- **New device discovery**
  1. Make an artifact in a chat on device A
  2. Sign in on device B with empty local storage
  3. Open /gallery
  - Expected: The artifact card appears (no thumbnail); opening it goes to the chat and the artifact re-derives
- **Cross-account isolation**
  1. Create artifacts on account A and B
  2. Call GET /api/artifacts/index as A
  - Expected: Only A's rows return
- **Project filter**
  1. Move a chat into a project
  2. GET /api/artifacts/index?projectId=<id>
  - Expected: Its artifacts appear; moving the chat out removes them
- **Limit bounds**
  1. Request limit=501, then limit=0, then no limit
  - Expected: First two are rejected with a validation error; the last returns at most 200
- **Indexer failure**
  1. Make the index insert fail
  2. Send an assistant message
  - Expected: Message saves; a warn log appears; no row

**Where to look when it fails**

- Log line '[artifact-index] failed to index message artifacts' (index-artifacts.ts:122)
- Table web_artifact_index; compare ids against deriveArtifacts output for the message
- Hook error text 'The artifact index could not be read' (use-artifact-index.ts:99)

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No paging beyond 500 rows** Affects: Accounts with many artifacts on web, phone, CLI, VS Code. Evidence: apps/web/app/api/artifacts/index/route.ts:39,68. Work needed: Add a cursor to the route and contract and use it in each client
- **No rebuild or backfill found, although the design says the index can be rebuilt** Affects: Everyone with chats saved before the table existed. Evidence: Search of scripts and db folders found only the migration and a guard script; apps/web/db/neon/0121_artifact_index.sql. Work needed: Write and run a rebuild job over messages [proposed]
- **Phone main Artifacts screen and desktop Tauri screen do not read the index** Affects: Mobile, desktop. Evidence: apps/mobile/app/(app)/artifacts/index.tsx:1-6; no caller in apps/desktop/src. Work needed: Decide per surface whether to merge index rows
- **Library artifact surface does not use the index; relation unclear** Affects: Web. Evidence: apps/web/features/library/components/LibraryView.tsx:77. Work needed: Trace the Library data source and align or document
- **Stale comment in migration and gallery cite migration 0120 for RLS and index** Affects: Engineers. Evidence: apps/web/app/gallery/GalleryClient.tsx comment above line 1213; apps/web/app/api/artifacts/index/route.ts header. Work needed: Fix comments

**Depends on**

- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-authentication-and-identity
- table:web_artifact_index
- table:web_conversations
- table:web_messages
- api:GET /api/artifacts/index

## Unknown

- Whether any pre-0121 messages were backfilled in production (no record found)
- Whether Chrome extension or Tauri desktop read the index by another route
- What the Library artifact surface reads
- Rate-limit numeric value for the 'chat-conversation' bucket (not opened)
- Whether limits differ by plan: none found

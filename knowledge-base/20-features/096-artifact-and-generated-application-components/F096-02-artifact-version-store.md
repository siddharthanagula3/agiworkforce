---
id: "F096-02"
type: "feature"
title: "Artifact version store"
aliases: ["Artifact version store", "web_artifacts and web_artifact_versions", "Artifact cloud sync (migration 0039)", "Managed artifact entity", "Version history", "S96.02"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.02"]
depends_on: ["SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "mode:cloud", "table:web_artifacts", "table:web_artifact_versions", "api:GET /api/chat/sync", "api:POST /api/chat/sync"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-02 Artifact version store

A server copy of artifacts whose content was edited or authored on a device, with an append-only version table. Web and phone push and pull these through the chat sync endpoint in Cloud mode. Re-derivable artifacts are not pushed. The server keeps versions, but no API to read one back or restore it was found; restore works on the local copy.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.02](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9602).

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

**What it does.** Holds one current row per edited artifact (content, title, type, version, pin, tags, soft-delete) and writes a version row each time a push is applied (apps/web/db/neon/0039_artifact_cloud_sync.sql:40,59; apps/web/app/api/chat/sync/route.ts:366-374,886).

**Why it exists.** An edited artifact can no longer be re-derived from its message, so it needs a server copy to follow the account across devices (apps/web/db/neon/0039_artifact_cloud_sync.sql:12-22).

**Who uses it.** Signed-in people who edit artifacts on web or phone in Cloud mode; the sync engine on each client; support staff reading data exports.

**Problems it solves**

- Edits made on one device vanish on another (0039 header)
- Concurrent edits need a defined rule: last writer wins on the current row, history unions (0039 header; route.ts:259)
- Account export must include edit history (apps/web/app/api/user/export/route.ts:2976-2986)

**Use cases**

- Edit an HTML artifact on web and see the edit on the phone
- Delete an edited artifact and have the deletion reach other devices
- Export account data including artifact versions

## 2. User experience

**Where to find it**

- Web: artifact panel; history list labelled 'Version history' with a 'Restore version N' button (apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:109,171). Sync runs in the background, mounted by the chat page (apps/web/features/chat/pages/WebChatPage.tsx:1108).
- Mobile: artifacts store pushes and pulls through the cloud sync engine (apps/mobile/services/cloudSyncEngine.ts:441,452)
- Desktop (public Electron app shows hosted web): same web behaviour (doc: AGENTS.md section 5). Tauri desktop: no caller of the sync endpoint found in apps/desktop/src.
- CLI, VS Code, Chrome: no artifact push found (apps/cli/src/cloud/chat.rs has no artifact handling in grep).

**Before you start**

- Signed in with a Cloud account
- Conversation is not temporary and holds no device-local turns (apps/web/features/chat/stores/artifacts-store.ts:1059-1072)
- Artifact has been edited so it differs from what the message derives [inferred from 0039 header]

**Screens and controls**

- Version history panel and 'Restore version N' action; restore asks before replacing and appends the older content as the new latest version (apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx:55,85)
- No visible sync control; status is held in store setCloudSyncStatus (apps/web/features/chat/hooks/use-artifact-cloud-sync.ts:60)

**Journey**

1. Edit an artifact on web
2. The hook waits 2 seconds then pulls, collects changed artifacts and pushes (use-artifact-cloud-sync.ts:20,62-74)
3. Server updates the row if the base version matches, or inserts a new one, then records a version row (route.ts:259,289,886)
4. Another device pulls with its cursor and merges (apps/web/features/chat/services/artifact-cloud-sync.ts:46)

**What the person sees and gets**

- Silent when it works; failures set an error status and retry with backoff up to 5 minutes (use-artifact-cloud-sync.ts:93)
- Conflicts come back as the server's current row and are kept as a version on the losing side (apps/web/features/chat/stores/artifacts-store.ts:308-313)

**Settings**

- none found; interval 30 seconds (use-artifact-cloud-sync.ts:19)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Tables web_artifacts and web_artifact_versions with RLS, FORCE added later (0039:40,59,86,96; apps/web/db/neon/0049_artifact_force_rls.sql:11)
- Pull of up to 500 changed artifacts per request, scoped to the user and skipping temporary conversations (apps/web/app/api/chat/sync/route.ts:56,165-171)
- Push applies update only when base_version matches and parent conversation is not temporary; insert when base_version is 0 (route.ts:259-261,289)
- Version row inserted for the artifact's current_version, ignoring duplicates (route.ts:366-374)
- Web push and pull loop with online and visibility triggers (use-artifact-cloud-sync.ts:99-125)
- Phone merge and push through shared platform logic (packages/platform/artifacts/src/artifact-sync.ts:20,56; apps/mobile/src/features/artifacts/store.ts:104)
- Account export includes versions (apps/web/app/api/user/export/route.ts:2976)

**Incomplete**

- Only one version row per push, for the version number the client sends; whether web increments the number on every edit was not established (apps/web/features/chat/stores/artifacts-store.ts:265 uses artifact.version or 1)
- Web local version list is browser state; phone keeps 20 versions per artifact locally (apps/mobile/src/features/artifacts/store.ts:45)

**Present but disconnected or switched off**

- Server versions are write-only: the only reads found are the data export and deletion policy (apps/web/app/api/user/export/route.ts:2976; apps/web/lib/resources/deletion-policies.ts:153)

**Not available**

- Read-back or restore of a stored version from the server: no endpoint found
- Desktop Tauri push: none found in apps/desktop/src
- CLI, VS Code, Chrome: none found

## 4. Required behaviour

**Established requirements**

- A server store keeps each artifact's successive versions so any version can be read back or restored. (source: brief S96.02)
- Only non-re-derivable (edited or authored) artifacts are stored; re-derivable ones are never pushed. (source: apps/web/db/neon/0039_artifact_cloud_sync.sql:17-21)
- Version rows are append-only keyed by artifact and version; current row is last-writer-wins; history unions. (source: apps/web/db/neon/0039_artifact_cloud_sync.sql:20-22,59-66)
- Rows are isolated per user; Managed Cloud only, Local and own-key artifacts never pushed. (source: apps/web/db/neon/0039_artifact_cloud_sync.sql:24-26)
- Artifacts must have version history and retention behaviour. (source: doc: docs/product/requirements.md section 9.5)

**Acceptance criteria**

1. Edit an artifact on web; it appears on the phone after sync with the same content
2. Pushing with a stale base version returns a conflict containing the server's current row
3. A second push of the same version number does not duplicate the version row
4. A temporary conversation's artifact is never pushed
5. User B cannot read user A's artifact or version rows
6. Deleting the account removes both tables' rows for the user
7. A stored version can be read back through an API [not met today]

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and own-key conversations stay off the account because the client filters them (artifacts-store.ts:1059-1072) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a read endpoint listing versions and returning one
- [proposed] Make the restore action write back through sync so history is server-complete
- [proposed] Record a version row for every applied edit even if the client did not bump the number

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | web_artifacts | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Current artifact row with server_version cursor and soft delete |
| table | web_artifact_versions | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Append-only versions keyed (artifact_id, version) |
| schema | FORCE RLS backfill | `apps/web/db/neon/0049_artifact_force_rls.sql` | Forces row-level security on both tables |
| endpoint | GET /api/chat/sync (pull) | `apps/web/app/api/chat/sync/route.ts` | Delta pull of conversations, messages, artifacts (handlePull line 105) |
| endpoint | POST /api/chat/sync (push) | `apps/web/app/api/chat/sync/route.ts` | Applies artifact pushes with optimistic base_version (handlePush line 542) |
| schema | ArtifactSyncPushItemSchema / ArtifactWireDeltaSchema | `packages/contracts/cloud-contracts/src/sync.ts` | Wire contracts; at most 500 artifacts per push (lines 151,220,241) |
| service | gate and free allowance | `apps/web/lib/managed-compute-gate.ts` | buildChatSyncGateResponse applies workspace policy to sync (line 262) |
| hook | useArtifactCloudSync | `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts` | Web pull and push loop with backoff |
| service | pull/pushArtifactCloudChanges | `apps/web/features/chat/services/artifact-cloud-sync.ts` | Web sync transport |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | Local artifacts, versionsById, collectArtifactPushBatch (line 1053) |
| component | ArtifactVersionHistory | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | Local version list and restore button |
| service | mergeCloudArtifacts / applyArtifactDeltas | `packages/platform/artifacts/src/artifact-sync.ts` | Shared merge rules for all surfaces |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Phone pull and push including artifacts |
| store | mobile artifact store | `apps/mobile/src/features/artifacts/store.ts` | Phone artifacts, versions (max 20), pending pushes |
| endpoint | data export | `apps/web/app/api/user/export/route.ts` | Exports artifact_versions (line 2976) |
| config | deletion policy | `apps/web/lib/resources/deletion-policies.ts` | Lists web_artifact_versions for deletion (line 153) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client detects locally changed artifacts and builds a batch, skipping temporary or local-turn conversations | device | apps/web/features/chat/stores/artifacts-store.ts:1053-1087 |
| Client pulls from the saved cursor, then pushes the batch with bearer token | device and our servers | apps/web/features/chat/hooks/use-artifact-cloud-sync.ts:62-74 |
| Server checks workspace policy, free daily allowance (conversation and message counts), and parses the payload | our servers | apps/web/app/api/chat/sync/route.ts:542-583 |
| One SQL statement updates matching rows or inserts new ones, returning applied and conflict rows | our servers | route.ts:792-880 |
| Version rows are inserted for applied artifacts | our servers | route.ts:885-890 |
| Other devices pull and merge by id | device and our servers | apps/mobile/services/cloudSyncEngine.ts:441 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact content, title, type, language, version, pin, tags | table web_artifacts | Yes, through /api/chat/sync cursor | Soft delete tombstone; content blanked when deleted (route.ts:160); erased with account (apps/web/lib/server/account-erasure.ts) |
| Version content and hash | table web_artifact_versions | Not sent back to clients (pull reads web_artifacts only, route.ts:165) | Cascade from the artifact; export and deletion lists include it |
| Local versions and cursor | store: browser artifacts store and cursor storage (artifact-sync-cursor-storage imported at use-artifact-cloud-sync.ts); phone store | No | Cleared on sign-out hook cleanup (use-artifact-cloud-sync.ts:30,129) |

**Models and providers.** No model takes part in storing versions. Edits may come from model output applied by the person [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; user resolved by getUserScopedDb (route.ts:109) |
| Permissions | Workspace policy resource 'chat_sync' (apps/web/lib/managed-compute-gate.ts:262-275); RLS on both tables; the push checks the parent conversation belongs to the user (route.ts:259-261) |
| Subscription | Free daily allowance counts conversation creates and message writes, not artifacts (route.ts:576-583). Plan rules for artifact sync: none found in the code. |
| Limits and metering | 500 artifacts per push and per pull (sync.ts:241; route.ts:56); rate limit 'chat-conversation' on push (route.ts:548) |
| Feature flags | Sync protocol version check (assertReadableSyncProtocol, route.ts:567); no feature flag found |
| Model compatibility | Independent of model. |
| Provider restrictions | none found in the code |
| Local mode | Local and own-key artifacts are not pushed: temporary conversations and conversations holding local turns are skipped client-side (artifacts-store.ts:1059-1072) and temporary conversations are refused server-side (route.ts:261). Phone filters temporary ids (cloudSyncEngine.ts:453). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Conflict | Server returns current row; client keeps the losing content as a version | route.ts:845-870; artifacts-store.ts:308-313 |
| Offline / error | Retry with exponential backoff capped at 5 minutes; online and tab-visible events trigger sync | use-artifact-cloud-sync.ts:21,93,111-125 |
| Cursor rejected | Cursor cleared and sync restarts | use-artifact-cloud-sync.ts:84-88; apps/web/features/chat/services/artifact-cloud-sync.ts:21 |
| Hidden tab | Next sync is not scheduled until visible | use-artifact-cloud-sync.ts:51-54 |
| Saturated pull | Cursor advances to the last artifact so the next page continues | route.ts:993-994 |
| Deleted artifact | Tombstone with blank content pulled | route.ts:160 |
| Restore | Confirm dialog; discards unsaved edit with a warning | ArtifactPreview.restore.test.tsx:55,99 |
| Server-side version read | not handled in the code | grep of web_artifact_versions in apps/web/app and lib found only the insert, export and deletion policy |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/sync/__tests__/route.contract.test.ts`: Pull response shape including an artifact row and citation-markup stripping
- `apps/web/__tests__/api/chat-sync-push.test.ts`: Artifact push admitted only inside the owner's conversation; replay idempotent; non-disclosing conflict
- `apps/web/features/chat/services/artifact-cloud-sync.test.ts`: Web pull and push transport
- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Local restore confirm, cancel, append as latest
- `apps/web/__tests__/api/gdpr.test.ts`: Export includes artifact_versions
- `packages/contracts/cloud-contracts/src/__tests__/sync.test.ts`: Sync wire schemas

**Test scenarios**

- **Cross-device edit**
  1. Edit an artifact on web
  2. Wait for sync
  3. Open the same chat on the phone
  - Expected: The phone shows the edited content
- **Stale base**
  1. Edit on A and B from the same base
  2. Sync A, then B
  - Expected: B receives a conflict and keeps its text as a version; current row is A's
- **Temporary chat**
  1. Edit an artifact in a temporary chat
  2. Sync
  - Expected: No row is pushed or stored
- **Isolation**
  1. As user B read the tables through the app role for A's artifact id
  - Expected: No rows
- **Version read-back**
  1. Search for an API that lists web_artifact_versions
  - Expected: None exists today; confirm the gap

**Where to look when it fails**

- Log '[artifact-cloud-sync] sync failed; retry scheduled' (use-artifact-cloud-sync.ts:91)
- Tables web_artifacts, web_artifact_versions
- ArtifactSyncCursorRejectedError

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No endpoint reads back or restores a server version** Affects: All apps; the requirement in brief S96.02. Evidence: Only the insert (route.ts:366), export (export/route.ts:2976) and deletion list reference web_artifact_versions. Work needed: Add list and get endpoints and a restore that appends a new version
- **Brief and migration say desktop is the editing surface and web does not edit; code shows web and phone push** Affects: Documentation, engineers. Evidence: use-artifact-cloud-sync.ts; cloudSyncEngine.ts:452; no desktop caller. Work needed: Correct the migration comment and brief
- **Version rows depend on the client's version number** Affects: History completeness on web. Evidence: route.ts:366-374 (do nothing on conflict); artifacts-store.ts:265. Work needed: Verify that web increments version per edit or make the server assign it
- **Tauri desktop does not use this sync** Affects: Internal Tauri desktop. Evidence: No caller in apps/desktop/src. Work needed: Decide if needed; public Desktop is the web app
- **No plan or quota rule for artifact storage** Affects: Cost control. Evidence: route.ts:576-583 counts only conversations and messages. Work needed: Define a limit if required

**Depends on**

- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- mode:cloud
- table:web_artifacts
- table:web_artifact_versions
- api:GET /api/chat/sync
- api:POST /api/chat/sync

## Unknown

- Whether web increments the artifact version on each edit
- Whether the Tauri desktop syncs artifacts through another path
- What the publication version list (published artifacts) shares with this store; publishing is another feature and was not read in depth
- Free allowance numeric limits
- Whether MAX_ARTIFACTS_PER_PUSH on web is smaller than 500

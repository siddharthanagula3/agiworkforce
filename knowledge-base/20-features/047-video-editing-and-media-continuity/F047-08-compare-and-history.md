---
id: "F047-08"
type: "feature"
title: "Compare and history"
aliases: ["Before/after comparison (S47.17)", "Parent-clip lineage (S47.18)", "Version history (S47.19)", "file_lineage", "parent_version_id", "Compare", "Versions", "Details"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.17", "S47.18", "S47.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "table:file_lineage", "table:media_assets", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "F047-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-08 Compare and history

Planned: compare a clip before and after a change, see the parent clip of a derived clip, and restore an older version. For video it is not built on any app. The server can record versions and parent links for generated files, but nothing reads them, and no video editing exists to create them. Text artifacts have their own version history.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.17](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4717), [S47.18](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4718), [S47.19](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4719).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Planned: a clip with a changed version can be opened in Compare (side by side or slider), Details shows its parent clip, and Versions lists older ones to restore. Today only the storing half exists on the server, for generated files in general.

**Why it exists.** Briefs S47.17 to S47.19 ask for it. The guidance says never overwrite the wrong original and distinguish edits, copies, exports, new versions and rollback (doc: docs/product/competitive-guidance.md:329).

**Who uses it.** People who revise generated clips and need to find where a clip came from or go back. Video editing itself is missing (briefs S47.01 to S47.05), so there is no derived clip yet.

**Problems it solves**

- A republished file overwrote the earlier one so history was lost (apps/web/db/neon/0257_file_versions_and_lineage.sql:6-11).
- After the chat scrolls away nobody can tell which upload an export came from (apps/web/db/neon/0257_file_versions_and_lineage.sql:11-14).

**Use cases**

- Compare a restyled clip against the original.
- See that clip B was made from clip A.
- Go back to the first version after a bad revision.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome extension: no Compare, Details or Versions control for clips exists (brief S47.17-S47.19 missing on those four; CLI and VS Code n/a).
- Different, built: text artifacts have 'Version history' with 'Restore version N' on web (apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:109,171), in the shared chat panel (packages/ui/unified-chat/src/components/artifact-components/ArtifactVersionHistory.tsx) and in the mobile sheet 'Version history' (apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:58). These are not for video.

**Before you start**

- A clip with at least two versions or a parent. No feature creates them for video today (briefs S47.01-S47.05 missing).
- Cloud mode; video generation needs plan max_15x or enterprise (packages/contracts/types/src/billing-catalog.ts:357).

**Screens and controls**

- Not built for video. Proposed: Compare, Details, Versions [proposed from the brief's wording].
- Library item actions today: Download, Add to chat, Add to Work, Open chat, Remix, Add to project, Share link (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1795-1850); none shows versions or parent.

**Journey**

1. Planned: open a clip with changes, choose Compare.
2. Planned: open Details to see the parent clip.
3. Planned: open Versions, choose an older one, restore it as a new version.
4. Today: a regenerated clip is a separate Library row with no link to the first.

**What the person sees and gets**

- Planned empty state: a clip with no changes has one version and no comparison.
- Planned failure: a missing version shows as unavailable, not blank (brief).
- Today: nothing.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server stores a version number and parent for a generated file: persistGeneratedFile bumps version and sets parent_version_id when given supersedesFileId, and writes a file_lineage edge when given parentFileId (apps/web/lib/server/generated-file-persist.ts:56-125,296-318).
- The migration file is listed in the applied-checksums file (scripts/config/applied-migration-checksums.json:258), account erasure lists file_lineage (apps/web/lib/server/account-erasure.ts:178), deletion policy covers it (apps/web/lib/resources/deletion-policies.ts:247) and the data export describes it (apps/web/app/api/user/export/route.ts:2485).
- Text artifacts: published versions can be read and restored through a route (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:1-45).

**Incomplete**

- The 0257 header says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0257_file_versions_and_lineage.sql:4) while the checksums file lists it and server code writes to its tables. The code and config outrank the comment (doc: AGENTS.md section 2), but whether production applied it is unknown.
- No production caller passes supersedesFileId or parentFileId: only tests do (searched apps/web; matches only in apps/web/lib/server/generated-file-persist.test.ts:440,473).
- The version and lineage helpers exist in the shared type model (packages/contracts/types/src/file-model.ts:32-104) but the Library item contract has no version or parent field (packages/contracts/cloud-contracts/src/library.ts:62-81).

**Present but disconnected or switched off**

- Storage side (version, parent_version_id, file_lineage) is written by code but no route or screen reads it back for files or videos (searched apps/web/app/api/library and files routes; no read).

**Not available**

- Compare, lineage display and version list for video on web, desktop, mobile, Chrome (brief missing).
- Any video editing that would create a derived clip (briefs S47.01-S47.05 missing; founder decision: video editing not built, doc: docs/decisions/2026-09-27-founder-decisions.md:310).

## 4. Required behaviour

**Established requirements**

- Compare shows a clip before and after a change. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.17)
- User sees which clip a derived clip came from. (source: S47.18 (same brief))
- User browses earlier versions of a clip. (source: S47.19 (same brief))
- Distinguish source edits, copies, exported derivatives, new versions, conflicts and rollback; never overwrite the wrong original. (source: doc: docs/product/competitive-guidance.md:329)
- Video editing is not built; image and video edit controls are declined. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144,310)

**Acceptance criteria**

1. Compare shows two versions side by side or with a slider.
2. Details shows exactly one parent link for a derived clip, and none for an original.
3. Restoring an older version never deletes any version.
4. A clip with one version shows no comparison and a plain empty state.
5. A missing version shows as unavailable, not blank.
6. A person cannot read lineage of another account's clips.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Without video editing the only derived clips are regenerations, so lineage for video needs a caller that passes the parent id [inferred from generated-file-persist.ts and the missing S47.01-S47.05].
- History must be append-only; the draft makes published_artifact_versions append-only with no update policy (apps/web/db/neon/0257_file_versions_and_lineage.sql:73-76) [inferred as the model to follow].

**Proposed improvements** (suggestions, not requirements)

- Add version and parent fields to the Library item contract and a details route.
- Record a lineage edge whenever a video is regenerated from an earlier clip.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | 0257 file versions and lineage | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Adds version, parent_version_id, published_artifact_versions, file_lineage |
| schema | 0257 down migration | `apps/web/db/neon/down/0257_file_versions_and_lineage.down.sql` | Reverses the migration |
| config | applied migration checksums | `scripts/config/applied-migration-checksums.json` | Lists 0257 as applied in the chain |
| table | file_lineage | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | One row per parent-to-child edge with derivation kind |
| table | media_assets (version, parent_version_id) | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Version chain for generated files and uploads |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Append-only history of published text artifacts |
| service | persistGeneratedFile revision and lineage | `apps/web/lib/server/generated-file-persist.ts` | Writes version bump and lineage edge |
| other | file-model | `packages/contracts/types/src/file-model.ts` | FILE_DERIVATIONS, FileLineage, version helpers |
| schema | LibraryItemSchema | `packages/contracts/cloud-contracts/src/library.ts` | Library item shape; has no version or parent |
| service | account erasure | `apps/web/lib/server/account-erasure.ts` | Removes file_lineage rows with the account |
| config | deletion policies | `apps/web/lib/resources/deletion-policies.ts` | Declares file_lineage as derived records of media_assets |
| endpoint | GET /api/user/export | `apps/web/app/api/user/export/route.ts` | Describes file_lineage in the data export |
| endpoint | published artifact version route | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Reads or restores a published text version |
| component | ArtifactVersionHistory (web) | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | Version list and Restore for text artifacts |
| component | ArtifactVersionHistorySheet (mobile) | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Mobile version list for text artifacts |
| component | LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared Library where a clip detail would live |
| test | generated-file-persist test | `apps/web/lib/server/generated-file-persist.test.ts` | Covers next-version and lineage writes |
| service | video job reconciliation | `apps/web/lib/services/video-job-reconciliation-service.ts` | Stores finished video as an asset; passes no parent |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A caller saves a generated file and may pass supersedesFileId or parentFileId. | our servers | apps/web/lib/server/generated-file-persist.ts:36-50 |
| The new media_assets row is inserted; if it supersedes another, the row gets version = parent's version + 1 and parent_version_id. | our servers | apps/web/lib/server/generated-file-persist.ts:95-125,296-303 |
| If a parent file is given, one file_lineage row is inserted, ignoring duplicates; a failure is logged and the file still stays. | our servers | apps/web/lib/server/generated-file-persist.ts:56-93,305-315 |
| Nothing reads the chain back for the person: no compare, details or versions screen for video. | device and our servers | No reader found in apps/web/app/api/library or apps/web/app/api/files; Library contract has no version field (packages/contracts/cloud-contracts/src/library.ts:62-81) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Version number and parent version id per file | media_assets columns (apps/web/db/neon/0257_file_versions_and_lineage.sql:31-34) | Server side only; no client reads it | Parent link set null if the parent row is removed; old bytes stay |
| Lineage edges | table file_lineage with row security by user (apps/web/db/neon/0257_file_versions_and_lineage.sql:99-119) | Server side only | Removed on account erasure (apps/web/lib/server/account-erasure.ts:178); included in export |

**Models and providers.** Version and lineage need no model. Generated_by_turn_id and conversation id are stored for provenance (apps/web/lib/server/generated-file-persist.ts:56-80). Which provider made a clip is on media_assets (apps/web/db/neon/0036_media_assets.sql:9-25).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; rows are user-scoped with row-level security (apps/web/db/neon/0257_file_versions_and_lineage.sql:99-119). |
| Permissions | Owner only: file_lineage policy is user_id = current user (apps/web/db/neon/0257_file_versions_and_lineage.sql:114-118). |
| Subscription | No rule for compare or history: none found in the code. Video creation is limited to plans max_15x and enterprise (packages/contracts/types/src/billing-catalog.ts:357). |
| Limits and metering | Published text versions are limited by artifact content size 1,000,000 characters (apps/web/db/neon/0257_file_versions_and_lineage.sql:68). No limit on video versions: none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None found in the code. |
| Local mode | Local mode keeps no server version chain. On desktop, removed or overwritten files go to the operating system Trash first (doc: AGENTS.md section 9); a video version history on device: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Clip has one version | Planned empty state; not built | brief S47.17-S47.19 |
| Lineage write fails | Logged as 'Failed to record file lineage for a generated file'; the file stays | apps/web/lib/server/generated-file-persist.ts:90-93 |
| Revision write fails | Logged; version falls back to 1 | apps/web/lib/server/generated-file-persist.ts:114-122 |
| A file as its own parent | Refused by a check constraint | apps/web/db/neon/0257_file_versions_and_lineage.sql:96 |
| Missing version shown as unavailable | not handled in the code for video | No video version screen |
| Offline, cancel, retry | not handled in the code (no screen) | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/generated-file-persist.test.ts`: A file that supersedes another becomes the next version; a parent file records a lineage edge
- `apps/web/lib/services/published-artifact-service.test.ts`: Published artifact version recording
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route including version handling
- apps/mobile/__tests__/ArtifactVersionHistorySheet.test.tsx (not found) (not found): Mobile text artifact version sheet (file name not opened; confirm it exists before relying on it)

**Test scenarios**

- **Version chain written**
  1. Call persistGeneratedFile with supersedesFileId set
  2. Read the new media_assets row
  - Expected: version is parent version plus one and parent_version_id is the parent
- **Lineage cannot self-reference**
  1. Insert a file_lineage row with child equal to parent
  - Expected: Check violation
- **Other user cannot read lineage**
  1. Set app user to another id
  2. Select from file_lineage
  - Expected: Zero rows
- **Compare for video (after built)**
  1. Revise a clip
  2. Open Versions, choose Compare
  - Expected: Both versions play side by side; a missing one shows unavailable
- **Applied state of 0257**
  1. Run pnpm db:migrate -- status against the target
  2. Look for 0257
  - Expected: Shows applied or pending; resolves the unknown

**Where to look when it fails**

- Log lines 'Failed to record file lineage for a generated file' and 'Failed to record a generated file revision'.
- Tables file_lineage, media_assets (version, parent_version_id), published_artifact_versions.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No compare, lineage or version screen for video** Affects: All users on web, desktop, mobile, Chrome. Evidence: Brief S47.17-S47.19 missing. Work needed: API to read versions and parents, Library details, compare view
- **Nothing creates derived or revised videos** Affects: All users. Evidence: Brief S47.01-S47.05 missing; no caller passes parentFileId or supersedesFileId outside tests. Work needed: Call persistGeneratedFile with provenance when a clip is regenerated or edited
- **Migration header says draft while config lists it as applied** Affects: Engineers and testers. Evidence: apps/web/db/neon/0257_file_versions_and_lineage.sql:4 versus scripts/config/applied-migration-checksums.json:258. Work needed: Confirm production state with the migration status command and fix the header
- **Library item contract lacks version and parent** Affects: All Library clients. Evidence: packages/contracts/cloud-contracts/src/library.ts:62-81. Work needed: Add fields and populate them in the library route
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- table:file_lineage
- table:media_assets
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- F047-07

## Unknown

- Whether migration 0257 is applied in production (header says draft; checksum file lists it).
- Whether the ArtifactVersionHistorySheet test file named above exists; not opened.
- Whether Local mode on desktop keeps any clip versions.
- Plan rules for history are not defined.

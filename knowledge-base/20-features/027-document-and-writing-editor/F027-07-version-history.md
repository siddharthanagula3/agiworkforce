---
id: "F027-07"
type: "feature"
title: "Version history"
aliases: ["Revision history", "Version history", "Version chip (v3/5)", "Restore version", "Show changes", "Review changes", "Undo last change / Redo change (version steps)", "S27.29"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S27.29"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:local", "mode:cloud", "table:web_artifact_versions", "table:web_artifacts", "store:agi-artifacts-store", "file:apps/web/features/chat/stores/artifacts-store.ts", "file:packages/platform/artifacts/src/artifact-store.ts", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "F027-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-07 Version history

Version history lets a person see every saved version of a document or other artifact with its time and a short note on what changed, open an older one, compare it with the one before, and restore it. Restoring adds the old text as the newest version, so nothing is deleted. Built on web, mobile and the Tauri desktop panel; not in CLI or VS Code.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.29](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2729).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps each saved state of an artifact (document, deck, code, page) as a numbered version. The person can step through versions, open a list showing time and change size, view a line or word comparison with the previous version, and restore an older version. Restore never removes later versions; it appends the old content as the new latest (packages/platform/artifacts/src/artifact-store.ts:40-44).

**Why it exists.** The assistant and the person both rewrite the same document. Without history one bad rewrite would lose good text. The product requirements say an artifact has version history (doc: docs/product/requirements.md:748) and an artifact lifecycle with preview, edit, compare, restore (doc: docs/product/experience-contract.md:43-45).

**Who uses it.** Anyone who edits an artifact by hand or asks the assistant to change it: writers, analysts, students, developers working with generated pages or code.

**Problems it solves**

- Undoing an assistant rewrite that made the document worse
- Finding what changed between two versions
- Recovering older wording without keeping copies by hand
- Knowing when a version was made

**Use cases**

- After asking the assistant to shorten a report, the person opens Version history, sees 'N lines added, M removed', and restores version 2.
- On the phone, the person steps back one version with the Previous version button to read the earlier draft.
- The person opens 'Show changes' to see exactly which words the assistant replaced.
- On the Tauri desktop panel, the person picks an older version and chooses 'Restore version N'.

## 2. User experience

**Where to find it**

- Web (also the Electron desktop window, which shows the hosted web app: ARCHITECTURE.md:53): in the artifact side panel header, a chip with a previous arrow, a label 'v3/5' and a next arrow. The label is visible text 'v{position}/{total}'; the longer words 'Version 3 of 5. Show version history' are only the accessible name (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2658-2686). Clicking the label opens the 'Version history' list (ArtifactPreview.tsx:2980-2987). The More menu adds 'Show changes' / 'Hide changes', 'Review changes' (latest version only, when editable) and 'Restore version N' (when an older version is shown) (ArtifactPreview.tsx:2325-2350).
- Mobile: full-screen artifact view. A chip with 'Previous version', a button labelled 'Version N of M' (visible 'vN/M') and 'Next version' shows only when there is more than one version (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1434-1490). Beside it are 'Show changes' (:1499) and 'Restore' (:1517, accessible name 'Restore version N'). The label button opens the sheet titled 'Version history' (apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx).
- Tauri desktop (internal build, not the public Desktop): the shared artifact panel has its own history list with the same wording and a confirm step (packages/ui/unified-chat/src/components/ArtifactPanel.tsx:447-470; packages/ui/unified-chat/src/components/artifact-components/ArtifactVersionHistory.tsx:39). In local privacy mode a host action 'Restore version N' is added when a past version is shown (apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts:56-73).
- CLI and VS Code: none found. Chrome: not searched, unknown.

**Before you start**

- An artifact with at least one saved version. Web shows the chip when versionCount > 0 or the lineage has more than one artifact (ArtifactPreview.tsx:965); mobile only when there is more than one version (ArtifactFullScreen.tsx:1434).
- Web: the artifact must be a stored artifact in the side panel variant for undo/redo steps (ArtifactPreview.tsx:1055).
- No separate plan or sign-in check found for viewing history on any app (see access_and_usage).

**Screens and controls**

- Web chip: 'Previous version', version label button (disabled when no versions), 'Next version' (ArtifactPreview.tsx:2650-2700).
- Web history list: heading 'N versions' (plural-aware), close button 'Close version history', newest-first rows 'Version N' with '· Latest' on the newest, a time line then ' · ' then change text, and a 'Restore' button on every row except the latest (apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:109-183). Escape closes the list (:111-118).
- Change text per row: 'Created, N lines' for the first; 'Same as version K' if identical to an earlier non-adjacent version; 'Line order changed'; otherwise 'N lines added, M removed' (ArtifactVersionHistory.tsx:38-67). Time is formatted with the browser locale, medium date and short time (:69-74).
- Restore confirmation dialog on web: title 'Restore version N?', text 'This replaces what you are looking at with version N, added as the new latest so the versions in between survive.' plus 'Your unsaved edits are discarded.' when an unsaved source edit exists; button 'Restore' (ArtifactPreview.tsx:1008-1030).
- Web 'Show changes' view: word-level for text documents and email, line-level for other types (ArtifactPreview.tsx:3210-3217). 'Review changes': Keep all / Undo all and per-change 'Undo change N' / 'Keep change N', then saves a new version (apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.tsx:25-130; ArtifactPreview.tsx:3128-3141).
- Undo and redo while viewing the latest version step through saved versions, named 'Undo last change' and 'Redo change' (ArtifactPreview.tsx:530-531, 1060-1082). Mobile has the same pair (ArtifactFullScreen.tsx:145-146, 855-878).

**Journey**

1. 1. Open the artifact in the side panel (web) or full screen (mobile).
2. 2. Click or tap the version chip label to open the history list, or use the Previous version / Next version arrows to step.
3. 3. Read each row's time and change note; click or tap a row to view that version (the latest row returns to the live version).
4. 4. Optionally open 'Show changes' to see what changed against the version before it.
5. 5. Choose Restore. On web a dialog asks first; on mobile the restore happens at once.
6. 6. The old text appears as the newest version, the view returns to the latest, and all older versions remain in the list.

**What the person sees and gets**

- Web: a new top row 'Version N · Latest' appears after restore; unsaved-edit warning appears in the dialog text.
- Mobile: success haptic after restore (ArtifactFullScreen.tsx:811-817, 827-836).
- Tauri desktop: toast 'Restored version N' or error toast 'Could not restore this version' (useDesktopArtifactActions.ts:67-73).
- Restoring the content that is already current does nothing and returns false (apps/web/features/chat/stores/artifacts-store.ts:976-989).

**Settings**

- None found for version history on any app. Mobile keeps at most 20 versions per artifact (apps/mobile/src/features/artifacts/store.ts:45); web keeps at most 200 artifacts (artifacts-store.ts:30) and mobile 200 (store.ts:36); these are constants, not user settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: version chip, history list with times and change notes, open, restore with confirmation, word/line 'Show changes', per-change 'Review changes', undo/redo by version steps (ArtifactPreview.tsx:1008-1082, 2325-2350, 2658-2686, 2980-2987; ArtifactVersionHistory.tsx).
- Web store: same id with different content appends a version; identical content does not (packages/platform/artifacts/src/artifact-store.ts:15-17, 69-115); restore re-publishes the old content as newest (artifacts-store.ts:976-989).
- Web persists artifacts and versions in browser storage key 'agi-artifacts-store' (artifacts-store.ts:589-591) and pushes edited artifacts to the account for managed-cloud chats (artifacts-store.ts:1053-1087).
- Mobile: version stepper, history sheet, restore, show changes, undo/redo (ArtifactFullScreen.tsx:855-878, 1434-1530; ArtifactVersionHistorySheet.tsx); store appends a version on restore and returns false if the chosen version is already the latest (store.ts:358-380).
- Tauri desktop: versions come from stored artifacts via commands artifact_get_versions and artifact_rollback; rollback creates a new version 'Rolled back to version N' (apps/desktop/src-tauri/src/core/artifacts/types.rs:370-385; apps/desktop/src/runtime/TauriRuntime.ts:1569-1600).

**Incomplete**

- Mobile restore has no confirmation step and the sheet restore also acts at once (ArtifactFullScreen.tsx:811-837), while web asks first (ArtifactPreview.tsx:1008-1030).
- Mobile drops the oldest version once more than 20 exist (store.ts:175-178). The wording 'restoring does not delete newer versions' still holds; older ones fall off the start.
- Web has no per-artifact version cap that I found; only artifact count (200) and a browser-storage fallback that shrinks the saved payload when storage is full (artifacts-store.ts:564-583). How versions are trimmed in that fallback: unknown.

**Present but disconnected or switched off**

- Tauri host action 'Restore version N' is returned only when the privacy mode is 'local' (useDesktopArtifactActions.ts:42, 53-56); the cloud-mode restore path goes through ChatInterface (packages/ui/unified-chat/src/components/ChatInterface.tsx:703-790). Whether both are reachable in the Tauri app: unknown.

**Not available**

- CLI: no command lists or restores versions (apps/cli/src/lib.rs:1359-1415 lists only list, show, open, publish, published, audience).
- VS Code: the artifacts view lists, opens read-only, copies and saves; no history (apps/extension-vscode/package.json:689-719).
- Chrome extension: no version history code searched for; status unknown.
- Electron desktop has no separate implementation; it shows the hosted web app (ARCHITECTURE.md:53).

## 4. Required behaviour

**Established requirements**

- The user can browse a document's past revisions with their times and open or restore one (S27.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.29)
- Artifacts must have version history. (source: doc: docs/product/requirements.md:748)
- Artifacts are versioned objects with preview, edit, compare, restore. (source: doc: docs/product/experience-contract.md:43-45)
- Restore adds the chosen version as the new latest and keeps the versions in between; the dialog warns that unsaved edits are discarded. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1013-1019)
- History is append-only and restore never deletes later versions. (source: packages/platform/artifacts/src/artifact-store.ts:40-44)

**Acceptance criteria**

1. Every history row shows a time in the viewer's locale and a change note.
2. Choosing Restore on web opens a confirmation naming the version; cancelling leaves the artifact unchanged.
3. If there are unsaved edits, the web confirmation says they are discarded.
4. After restoring version K, the list holds one more version than before and the new latest has version K's text; versions in between are still listed (web).
5. Restoring the version that is already latest does nothing.
6. On mobile the previous and next buttons move between versions; the sheet lists newest first with 'Version N, current' on the newest.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should confirm before restore to match web [inferred from the brief's Should line and the web dialog].
- A 20-version cap on mobile is a storage choice; whether it is a product rule is not documented [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the same confirm dialog to the mobile restore buttons.
- [proposed] Show a notice on mobile when the oldest version is dropped by the 20-version cap.
- [proposed] Decide and document a version cap for web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactVersionHistory (web) | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | List of versions with time, change note, open and Restore buttons. |
| component | ArtifactPreview (web) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Version chip (2658), restore dialog (1008), undo/redo steps (1060), Show/Review changes menu items (2325), history mount (2980). |
| store | artifacts-store (web) | `apps/web/features/chat/stores/artifacts-store.ts` | Holds versionsById, restoreArtifactVersion (976), persistence key 'agi-artifacts-store' (591), 200-artifact cap (30), cloud push batch (1053). |
| service | createArtifactStore | `packages/platform/artifacts/src/artifact-store.ts` | Shared engine: append version on changed content, restore as new latest (172). |
| component | ArtifactChangesView | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Shows added and removed words or lines between two versions. |
| service | artifactChanges / buildChangeReview | `packages/platform/artifacts/src/artifact-changes.ts` | Computes the word or line comparison (173); change-review.ts builds the per-change keep/undo model. |
| component | ArtifactChangesReview | `apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.tsx` | Keep all / Undo all and per-change choices that save a new version. |
| component | ArtifactVersionHistorySheet (mobile) | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Modal sheet 'Version history' with open and Restore per row. |
| component | ArtifactFullScreen (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Version chip (1434), restore handlers (811, 827), undo/redo (855), Show changes (1499). |
| service | versionSummary (mobile) | `apps/mobile/src/features/artifacts/versionSummary.ts` | Builds each row's time and change note. |
| store | mobile artifact store | `apps/mobile/src/features/artifacts/store.ts` | versionsById, 20-version cap (45), appendVersion (175), restoreArtifactVersion (358), pending cloud push on restore. |
| component | ArtifactPanel + ArtifactVersionHistory (shared) | `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | Panel used by the Tauri desktop: history list with confirm (447); list component in artifact-components/ArtifactVersionHistory.tsx. |
| hook | useDesktopArtifactActions | `apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts` | Adds 'Restore version N' host action in local mode (56-73). |
| service | TauriRuntime artifact versions | `apps/desktop/src/runtime/TauriRuntime.ts` | restoreArtifactVersion (1569) and getArtifactVersions (1584) call Tauri commands. |
| command | artifact_rollback / artifact_get_versions | `apps/desktop/src-tauri/src/sys/commands/artifacts.rs` | Tauri commands (110, 242) over the artifact store; rollback in core/artifacts/types.rs:370 and store.rs:271. |
| table | web_artifact_versions | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Append-only cloud version history (59-67), managed cloud only. |
| schema | ArtifactWireDeltaSchema | `packages/contracts/cloud-contracts/src/sync.ts` | Wire shape of a synced artifact including current_version (151-167). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the chip or sheet; the app reads versions from its local store. | device | apps/web/features/chat/stores/artifacts-store.ts:589-591; apps/mobile/src/features/artifacts/store.ts:356 |
| Each row's time and change note is computed in the client by comparing line counts of neighbouring versions. | device | apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:28-67 |
| Person confirms Restore (web) or taps Restore (mobile); the store appends the old content as a new version. | device | apps/web/features/chat/stores/artifacts-store.ts:976-989; apps/mobile/src/features/artifacts/store.ts:358-380 |
| For a managed-cloud chat, the changed artifact is queued and pushed in a sync batch; chats that are temporary or hold on-device turns stay off the account. | device and our servers | apps/web/features/chat/stores/artifacts-store.ts:1053-1087; apps/web/db/neon/0039_artifact_cloud_sync.sql:1-30 |
| On Tauri desktop the version list and rollback run in the local Rust store and database. | device | apps/desktop/src-tauri/src/sys/commands/artifacts.rs:110-117; apps/desktop/src-tauri/src/core/artifacts/store.rs:271-283 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact versions (content, time) | Web: browser storage 'agi-artifacts-store' and, for synced chats, table web_artifacts / web_artifact_versions. Mobile: on-device storage (mmkv, store.ts:3) and pending cloud push. Tauri: local artifact database. | Web and mobile push for managed-cloud chats only (0039 header: 'Managed-Cloud ONLY'). Local and own-key artifacts are never pushed (0039 header; artifacts-store.ts:1059-1063). | Web: up to 200 artifacts retained, oldest dropped (artifact-store.ts:75-80). Mobile: 20 versions per artifact, 200 artifacts. Deleting a message or conversation removes its artifacts and versions (artifacts-store.ts:1002-1034). Server retention beyond that: unknown. |

**Models and providers.** Version history does not call a model or provider. Restore, compare and listing are local logic. A new version usually comes from an assistant reply to an edit request, which is a normal chat turn (see F027-08).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing and restoring local versions needs no account in the code read; the web app's own sign-in requirement is unknown. Cloud sync of artifacts needs a managed-cloud account (0039 header). |
| Permissions | Cloud rows are user-isolated by row-level security (0039 header). No role or workspace check for version history found. |
| Subscription | none found in the code for version history on any app. |
| Limits and metering | Web 200 artifacts (artifacts-store.ts:30); mobile 200 artifacts and 20 versions each (store.ts:36, 45). No usage metering found. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device: web keeps versions in browser storage and mobile in on-device storage; local and own-key artifacts are not pushed to the account (artifacts-store.ts:1059-1063; 0039 header). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Single version / no history | Web shows the chip only when versions exist; undo is hidden for a single version. Mobile hides the chip until there are 2 or more versions. | ArtifactPreview.tsx:965; ArtifactPreview.editSteps.test.tsx:64; ArtifactFullScreen.tsx:1434 |
| Unsaved source edit then restore | Web dialog adds 'Your unsaved edits are discarded.' and marks the confirm destructive; stored draft is cleared on confirm. | ArtifactPreview.tsx:1010-1027 |
| Restore of the current content | Web store returns false and nothing is added; mobile store returns false for the latest index. | artifacts-store.ts:982-983; apps/mobile/src/features/artifacts/store.ts:361 |
| Missing or invalid time | The row shows only the change note. | ArtifactVersionHistory.tsx:69-74, 156-158 |
| PDF, Word or image artifact | 'Show changes' is not offered. | ArtifactPreview.tsx:987-993 |
| Versions too different for per-change review | Review shows a notice to use Show changes or restore. | review/ArtifactChangesReview.tsx:29-35 |
| Browser storage full | Saved payload is shrunk; if still failing persistence is disabled and an error is logged. | artifacts-store.ts:564-583 |
| Accessibility | List is an ordered list, current row has aria-current, focus moves to the opened row, Escape closes; mobile sheet is modal with named buttons. | ArtifactVersionHistory.tsx:98-118; ArtifactVersionHistorySheet.tsx |
| Offline / retry for sync | Cloud push state shows 'Syncing…', 'Sync retrying' or 'Synced' in the panel header; offline handling of restore itself not found. | apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:716-724 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Restore asks first, cancel leaves it unchanged, confirm appends the old content as latest, unsaved edit warning.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.editSteps.test.tsx`: No undo for one version, stepping back and forward keeps every version, redo dropped after outside change, last-changed time.
- `apps/web/features/chat/components/artifacts/ArtifactChangesView.test.tsx`: Show changes wording for punctuation-only and identical versions.
- `apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.test.tsx`: Rebuilding either version and undoing one change into a new version.
- `packages/platform/artifacts/src/__tests__/artifact-store.test.ts`: Single version on add, no bump on identical content, bump on edit, artifact cap.
- `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx`: Sheet lists versions newest first with change notes; open and restore.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.versions.test.tsx`: Version append, idempotent re-derive, restore as newest, refusing to restore current, chip hidden until history, navigating to an earlier version.
- `apps/mobile/__tests__/artifact-store-cloud-push.test.ts`: Mobile store cloud push behaviour; exact cases not read.

**Test scenarios**

- **Web restore with confirmation**
  1. Open a document with at least 3 versions in the web side panel.
  2. Click the v3/3 label to open Version history.
  3. Click Restore on Version 1 and read the dialog.
  4. Confirm.
  - Expected: Dialog says the version is added as the new latest. After confirm the list shows Version 4 · Latest with version 1's text and versions 2 and 3 remain.
- **Unsaved edit warning**
  1. Open the source editor and type without saving.
  2. Open history and click Restore on an older version.
  - Expected: The dialog adds 'Your unsaved edits are discarded.' and the edit is discarded only after confirm.
- **Mobile cap**
  1. On mobile edit one artifact 22 times.
  2. Open Version history.
  - Expected: At most 20 rows are listed; the oldest are gone and the newest is marked current.
- **Mobile restore without prompt**
  1. Open an artifact with 2 versions on mobile.
  2. Tap Previous version, then Restore.
  - Expected: Restore happens at once with no dialog (current behaviour) and the chip shows the new latest.
- **Tauri rollback**
  1. In the Tauri desktop build in local mode open an artifact version 'id::v1'.
  2. Choose 'Restore version 1' from the panel actions.
  - Expected: Toast 'Restored version 1' and a new latest version whose note is 'Rolled back to version 1'.

**Where to look when it fails**

- Browser console logger lines 'Artifact persistence write failed; shrinking payload' and 'Artifact persistence disabled: browser storage quota exhausted' (artifacts-store.ts:576-583).
- Toast 'Could not restore this version' on Tauri (useDesktopArtifactActions.ts:72).
- Tables web_artifacts and web_artifact_versions for synced artifacts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Mobile: [70-qa/test-plans/mobile/027-document-and-writing-editor.md](../../70-qa/test-plans/mobile/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **Mobile restore has no confirmation, web does.** Affects: Mobile users. Evidence: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:811-837 vs apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1030. Work needed: Add a confirm dialog naming the version before restoring.
- **Mobile drops the oldest versions beyond 20; no notice and no documented rule.** Affects: Mobile users with long edit chains. Evidence: apps/mobile/src/features/artifacts/store.ts:45, 175-178. Work needed: Document the cap or raise it; consider telling the person.
- **No version history in CLI or VS Code.** Affects: CLI and VS Code users. Evidence: apps/cli/src/lib.rs:1359-1415; apps/extension-vscode/package.json:689-719. Work needed: Decide whether it is in scope; no decision found in docs/decisions.
- **The brief's example 'Version 3 of 5' is only the accessible name; the visible label is 'v3/5'.** Affects: Testers and docs. Evidence: ArtifactPreview.tsx:2666-2680. Work needed: Correct test scripts and copy.
- **Brief marks desktop 'done' but only the Tauri build has its own code; the public Electron app shows the web app.** Affects: Desktop. Evidence: ARCHITECTURE.md:53; apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts. Work needed: Track Electron under web and Tauri separately.
- **Chrome status unverified.** Affects: Chrome extension. Evidence: No version-history code searched in apps/extension.. Work needed: Search and record.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:local
- mode:cloud
- table:web_artifact_versions
- table:web_artifacts
- store:agi-artifacts-store
- file:apps/web/features/chat/stores/artifacts-store.ts
- file:packages/platform/artifacts/src/artifact-store.ts
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- F027-08

## Unknown

- Whether the Chrome extension has any version history.
- How the web storage fallback trims versions when the browser quota is full.
- Server-side retention of web_artifact_versions.
- Whether the Tauri host action and the shared-panel restore are both reachable in the running app.
- Contents of apps/desktop/src-tauri/src/core/artifacts/tests.rs and useDesktopArtifactActions.test.ts (not opened).
- The mobile on-device storage key name.

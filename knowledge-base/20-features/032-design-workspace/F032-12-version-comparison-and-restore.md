---
id: "F032-12"
type: "feature"
title: "Version comparison and restore"
aliases: ["Version comparison and restore", "Version history", "Show changes", "Review changes", "Restore version", "Undo and Redo of edits (S32.34)"]
area: "32 Design workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S32.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:local", "mode:cloud", "table:web_artifacts", "table:web_artifact_versions", "store:artifact-store", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "F032-11", "F032-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-12 Version comparison and restore

Each artifact keeps its versions. Web and Mobile can open an earlier version, show what changed against the one just before it (lines or words added and removed), and restore an older version as a new latest. Web asks before restoring; Mobile does not. Only neighbouring versions are compared.

Area: [32. Design workspace](README.md). Requirement items: [S32.34](../../10-requirements/capabilities/032-design-workspace.md#s3234).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person step through an artifact's versions, see added and removed text between a version and its predecessor, and bring an older version back without losing the ones between. (ArtifactChangesView.tsx:65-130; artifacts-store.ts:976-989)

**Why it exists.** Edits and model revisions replace content; people need to see what changed and undo it. The product contract says compare and restore are part of artifacts, and failed edits must keep the previous version. (docs/product/experience-contract.md:782; docs/product/requirements.md:1470,1489)

**Who uses it.** Anyone revising a design, document or code artifact with the assistant, on Web, the Desktop window or Mobile.

**Problems it solves**

- Finding what the assistant changed.
- Undoing a bad revision.
- Choosing which suggested changes to keep (Review changes for text documents).

**Use cases**

- Open version 2 and press Show changes to see the lines the assistant added.
- Press Restore on version 1 to go back.
- Use Review changes to undo one of several suggested edits.
- Step Undo and Redo through edit versions.

## 2. User experience

**Where to find it**

- Web: version chip 'v n/total' with previous and next arrows in the panel header (aria-label 'Version n of m. Show version history', ArtifactPreview.tsx:2650-2680); more menu items Show changes / Hide changes, Review changes, Restore version n (2329-2354).
- Web history list: heading 'n versions', each row 'Version n', 'Latest', and a Restore button (ArtifactVersionHistory.tsx:109-175).
- Mobile: version chip and arrows, Show changes, Restore text buttons (ArtifactFullScreen.tsx:1485-1531) and a version history sheet (ArtifactVersionHistorySheet.tsx).
- Desktop Electron window: web app [inferred]. Tauri desktop: shared panel has version history and Restore with confirm (ArtifactPanel.tsx:447-470) but no changes view found.
- Chrome, VS Code, CLI: no version history found (search of the Chrome artifact panel for version found nothing).

**Before you start**

- The artifact has at least two versions; Show changes needs a version before the one shown (ArtifactPreview.tsx:991-999).

**Screens and controls**

- Changes view: summary line then coloured added and removed runs with plus and minus signs, screen-reader markers 'Added:' and 'Removed:' (ArtifactChangesView.tsx:21-24,97-130).
- Restore confirm dialog 'Restore version n?' (ArtifactPreview.tsx:1015-1020).
- Mobile changes view is a list with 'Added line:' and 'Removed line:' labels (ArtifactChangesView.tsx mobile:25-29).

**Journey**

1. Open an artifact that has been revised.
2. Press the version chip or an arrow to open an earlier version.
3. Press Show changes; read the summary and the marked text.
4. Press Restore (Web: confirm in the dialog).
5. The older content is added as the newest version; the view jumps to latest.

**What the person sees and gets**

- Summary 'No changes since version N' or 'Since version N: X lines added, Y removed' (words for documents and email) (ArtifactChangesView.tsx:73-95).
- Web restore description: 'This replaces what you are looking at with version N, added as the new latest so the versions in between survive.' plus 'Your unsaved edits are discarded.' when a draft exists (ArtifactPreview.tsx:1012-1018).
- Mobile restore gives a success haptic (ArtifactFullScreen.tsx:813-816).

**Settings**

- none found. Mobile keeps at most 20 versions per artifact (apps/mobile/src/features/artifacts/store.ts:45).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web comparison and Show changes with a shared engine that returns added, removed and changed (packages/platform/artifacts/src/artifact-changes.ts:94-122).
- Web restore through requestRestore with confirm and store restoreArtifactVersion appending a new version (ArtifactPreview.tsx:1008-1040; artifacts-store.ts:976-989).
- Web Undo and Redo of edits built on restore (ArtifactPreview.tsx:1055-1090; 2300-2320).
- Web Review changes lets the person undo single changes and saves as a new version (review/ArtifactChangesReview.tsx:12-60).
- Mobile Show changes, Restore, history sheet and undo (ArtifactFullScreen.tsx:609-615,811-870,1668-1676).
- Mobile store restore appends a copy and queues a cloud push (mobile store.ts:358-380).

**Incomplete**

- Compare is only against the immediately previous version; no choice of two arbitrary versions (ArtifactPreview.tsx:991-993; ArtifactFullScreen.tsx:608-610).
- Very different versions: engine gives up beyond 1000 edits and shows everything as removed and added (artifact-changes.ts:15,183-192). Review changes then says versions differ too much (ArtifactChangesReview.tsx:26-31).
- Mobile restore has no confirmation (ArtifactFullScreen.tsx:811-817), unlike Web.
- Changes are shown as text, not as a visual before and after of the rendered design [inferred].

**Present but disconnected or switched off**

- Show changes is hidden for PDF, Word and image artifacts and while editing a draft (ArtifactPreview.tsx:994-1001); on Mobile for generated-file artifacts (ArtifactFullScreen.tsx:611).

**Not available**

- Version history and compare on Chrome, VS Code and CLI (n/a in the brief for the last two).
- Two-version picker on all apps.
- Changes view in the Tauri shared panel: not found.

## 4. Required behaviour

**Established requirements**

- The user can compare two versions of a design and restore an earlier one (S32.34); brief marks web, desktop, mobile done, chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.34)
- Artifact UI includes version history; multi-artboard versioning and history is a design workspace requirement. (source: docs/product/requirements.md:1470,1489)
- Compare and restore are part of the artifacts and revisions workflow; failed edits preserve the previous version and the user's draft. (source: docs/product/experience-contract.md:782 (W09))
- An action a user cannot undo asks first; code gets a checkpoint. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Show changes between version 2 and 1 lists added and removed text and the correct counts.
2. Identical versions show 'No changes since version 1'; a punctuation-only edit does not say no changes.
3. Restoring version 1 on Web asks first and adds a new latest equal to version 1; versions in between remain.
4. Restoring the version already current does nothing.
5. Unsaved edits are named as discarded in the Web dialog.
6. Mobile keeps no more than 20 versions.
7. A very large rewrite still shows a changes view, not a crash.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should confirm restore like Web, since it replaces the visible content; code differs. [inferred from the two restore paths]

**Proposed improvements** (suggestions, not requirements)

- Let the person choose any two versions.
- Add a visual side-by-side for rendered designs.
- Add Chrome and Tauri parity only if the plan calls for it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactChangesView (Web) | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Summary and marked runs. |
| component | ArtifactVersionHistory (Web) | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | History list with Restore and per-version change summary. |
| component | ArtifactChangesReview | `apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.tsx` | Keep or undo single changes in text documents. |
| component | ArtifactPreview (version wiring) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canShowChanges (991), requestRestore (1008), stepEdit (1055), menu items (2329-2354), history toggle (2650), view mount (3211). |
| store | artifacts-store restoreArtifactVersion | `apps/web/features/chat/stores/artifacts-store.ts` | Appends a version with the older content (976); persisted in the browser store. |
| store | shared artifact store | `packages/platform/artifacts/src/artifact-store.ts` | versionsById and upsert rules (60-120). |
| service | artifactChanges engine | `packages/platform/artifacts/src/artifact-changes.ts` | Shortest-edit comparison by line or word with fallback. |
| service | change-review | `packages/platform/artifacts/src/change-review.ts` | buildChangeReview and resolveReview. |
| component | ArtifactChangesView (Mobile) | `apps/mobile/src/features/chat/components/ArtifactChangesView.tsx` | Mobile list view using the shared engine. |
| component | ArtifactFullScreen (version wiring) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Show changes (1497), Restore (1517), handlers (811-870). |
| component | ArtifactVersionHistorySheet | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Mobile history sheet. |
| store | mobile artifact store | `apps/mobile/src/features/artifacts/store.ts` | Restore (358), 20-version cap (45), persisted in MMKV (577). |
| component | shared ArtifactPanel history | `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | Tauri and shared UI history with confirm restore (447-470). |
| table | web_artifacts and web_artifact_versions | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Cloud copy of edited artifacts and append-only versions in cloud mode. |
| other | diff colour classes | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Uses diff-added and diff-removed token classes (26-29); token file not located. |
| test | artifact-changes tests | `packages/platform/artifacts/src/__tests__/artifact-changes.test.ts` | Engine behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A new model answer or edit with different content appends a version in the local store. | device | packages/platform/artifacts/src/artifact-store.ts:105-117 |
| The person opens a version; the view computes the diff against the previous one in the browser or app. | device | ArtifactChangesView.tsx:72 |
| Restore appends the old content as a new version (Web asks first). | device | ArtifactPreview.tsx:1015-1030; artifacts-store.ts:976-989 |
| In cloud mode edited artifacts and their versions sync to our servers; temporary or locally answered chats are skipped. | device and our servers | artifacts-store.ts:1055-1075; 0039_artifact_cloud_sync.sql:5-20,56-64 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Version list per artifact | Web: persisted browser store (localStorage); Mobile: MMKV store 'artifact-store'; cloud copy in tables web_artifacts and web_artifact_versions | Cloud mode only, last writer wins with union-merged append-only history (0039:12-20) | Mobile keeps 20 per artifact; removed with the artifact or chat (artifact-store.ts:137-159); Web cap not found. |

**Models and providers.** No model is used to compare or restore. Versions are created by model answers or user edits, whichever model the chat used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Compare and restore on the device need no account. Cloud sync needs sign-in and Cloud mode. |
| Permissions | Cloud rows are per user with row-level security (0039). |
| Subscription | none found in the code. |
| Limits and metering | Mobile: 20 versions. Engine: edit distance 1000 (artifact-changes.ts:15). Web version cap: unknown. |
| Feature flags | none found in the code. |
| Model compatibility | independent of model. |
| Provider restrictions | none found in the code. |
| Local mode | Fully works on the device in Local mode on Web and Mobile; versions of Local or temporary chats stay on the device and are never pushed (artifacts-store.ts:1059-1075; 0039 header: Managed-Cloud only). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| no earlier version | Show changes and Restore not offered; Mobile hides the version chip until real edit history exists. | ArtifactPreview.tsx:991; ArtifactFullScreen.versions.test.tsx 'hides the version chip until real edit history exists' |
| identical versions | 'No changes since version N'. | ArtifactChangesView.tsx:74 |
| punctuation or whitespace only | Reported as changed. | packages/platform/artifacts/src/__tests__/artifact-changes.test.ts |
| huge rewrite | Falls back to removed then added. | artifact-changes.ts:183-192 |
| restore current version | Returns false, nothing happens. | artifacts-store.ts:983; mobile store.ts:361 |
| unsaved edit on Web | Dialog says edits are discarded; destructive style. | ArtifactPreview.tsx:1018-1020 |
| restore conflicting with a late edit | Ignored if the draft changed since the dialog opened. | ArtifactPreview.tsx:1021 |
| cancel | Cancelling leaves the artifact untouched. | ArtifactPreview.restore.test.tsx |
| offline, timeout, retry | not handled in the code; local operations only. | searched, nothing found |
| accessibility | Screen-reader markers for added and removed text; region label 'Changes from version N to version M'; Mobile targets 44 points. | ArtifactChangesView.tsx:21-24,104; ArtifactFullScreen.versions.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactChangesView.test.tsx`: No changes only for identical versions; punctuation-only edit.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Confirm before restore, cancel, appends as latest, unsaved edit warning.
- `apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.test.tsx`: Rebuilding either version, undoing one change and saving as a new version.
- `packages/platform/artifacts/src/__tests__/artifact-changes.test.ts`: Word and line comparison results and counts.
- `packages/platform/artifacts/src/__tests__/change-review.test.ts`: Change review building (name only).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.versions.test.tsx`: Version append, restore, Show changes, chip, targets, store behaviour.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactChangesView.summary.test.tsx`: No-changes and counted summaries on Mobile.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.undo.test.tsx`: Mobile undo (name only).

**Test scenarios**

- **Compare**
  1. Ask for a document, then ask for one paragraph to change.
  2. Open version 2, Show changes.
  - Expected: Summary 'Since version 1: ...words added, ... removed' and the paragraph marked.
- **Restore on Web**
  1. Open version 1, press Restore, read the dialog, confirm.
  - Expected: A new latest equals version 1; the count rises by one.
- **Restore on Mobile**
  1. Open an older version, press Restore.
  - Expected: Restores immediately with no dialog (documents the difference).
- **Big rewrite**
  1. Replace a long document with unrelated text, Show changes.
  - Expected: All old text removed, all new added; no crash.
- **Local chat boundary**
  1. Use a temporary chat, edit twice, check network for artifact sync.
  - Expected: No push of the artifact (code skips it).
- **Two-version compare**
  1. Try to compare version 1 with version 3.
  - Expected: Not possible; only neighbours (documents the gap).

**Where to look when it fails**

- Toast 'Saved your choices as a new version' after Review changes.
- Store persistence degraded flag (artifacts-store.ts:528-531).
- Cloud tables web_artifacts and web_artifact_versions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- Desktop: [70-qa/test-plans/desktop/032-design-workspace.md](../../70-qa/test-plans/desktop/032-design-workspace.md)
- Mobile: [70-qa/test-plans/mobile/032-design-workspace.md](../../70-qa/test-plans/mobile/032-design-workspace.md)

## 10. Gaps and dependencies

- **Only the previous version can be compared; no arbitrary pair.** Affects: Web and Mobile.. Evidence: ArtifactPreview.tsx:991-993; ArtifactFullScreen.tsx:608-610. Work needed: Pick-two UI and engine call with chosen versions.
- **Mobile restore has no confirmation.** Affects: Mobile users.. Evidence: ArtifactFullScreen.tsx:811-817. Work needed: Add the confirmation or document the reason.
- **Compare is textual, not visual, for rendered designs.** Affects: Design users on Web and Mobile.. Evidence: ArtifactChangesView.tsx:97-130. Work needed: Rendered side-by-side [proposed].
- **Chrome has no version history; brief says unverified.** Affects: Chrome users.. Evidence: search of artifactPanel.ts for version found nothing. Work needed: Decide scope.
- **Brief citations foundation.css:173 and theme-contrast.test.ts:314 do not relate to this feature.** Affects: Brief readers.. Evidence: files read show logo tokens and brand mark tokens. Work needed: Replace citations.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:local
- mode:cloud
- table:web_artifacts
- table:web_artifact_versions
- store:artifact-store
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- F032-11
- F032-07

## Unknown

- Whether Web caps the number of versions per artifact.
- Whether the Tauri shared panel passes onRestoreVersion in current builds.
- Where the diff colour tokens (diff-added, diff-removed) are defined.
- Whether Chrome has any version feature beyond the grep done.
- Content of change-review tests and mobile undo tests (names only).

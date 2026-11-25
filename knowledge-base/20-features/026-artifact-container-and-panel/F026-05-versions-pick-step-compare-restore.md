---
id: "F026-05"
type: "feature"
title: "Versions: pick, step, compare, restore"
aliases: ["Version history", "Version chip (v2/3)", "Previous version / Next version", "Restore version", "Show changes", "Review changes", "ArtifactVersionHistory", "Version history sheet"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S26.20", "S26.21", "S26.22", "S26.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "F026-04", "file:packages/platform/artifacts/src/artifact-store.ts", "file:packages/platform/artifacts/src/artifact-changes.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-05 Versions: pick, step, compare, restore

Shows which version of an artifact is on screen, lets a person step to the previous or next version, open any version from a history list, restore an older version as a new latest copy, and see what changed since the version before. Web, Desktop and mobile have it. CLI, VS Code and Chrome do not.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.20](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2620), [S26.21](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2621), [S26.22](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2622), [S26.23](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2623).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Keeps every saved version of an artifact, shows 'v2/3' with previous and next buttons, a history list with when and what changed, and a Restore action that adds the old text as the newest version without deleting the ones between (ArtifactVersionHistory.tsx:61-182; artifacts-store.ts:976-989).

**Why it exists.** Edits, regenerations and conflicts create several versions. People need to look back and undo without losing work (doc: docs/decisions/wire-or-cut.md:325).

**Who uses it.** Anyone editing or regenerating an artifact.

**Problems it solves**

- Undo a bad edit
- See what changed
- Recover a version after a sync conflict

**Use cases**

- Step back one version to compare wording
- Restore version 1 after a poor edit
- Open version history to read 'N lines added, M removed'
- Find the version kept after choosing 'Keep theirs'

## 2. User experience

**Where to find it**

- Web and Desktop: version chip with 'Previous version', 'Version N of M. Show version history' and 'Next version' under the artifact title (ArtifactPreview.tsx:2641-2688); history panel 'Version history' (ArtifactVersionHistory.tsx:76-85); menu 'Show changes' / 'Hide changes' and 'Restore version N' (ArtifactPreview.tsx:2336-2350)
- Mobile: chevrons with 'Previous version', a 'Version N of M' button that opens the history sheet, 'Restore version N' and 'Show changes' (ArtifactFullScreen.tsx:1440-1530)
- CLI, VS Code, Chrome: no version control found

**Before you start**

- More than one version exists (the web chip shows when versionCount > 0 or the lineage has more than one, ArtifactPreview.tsx near line 970)

**Screens and controls**

- History list newest first: 'Version N', '· Latest', date, and change summary such as 'Created, 12 lines' or '3 lines added, 1 removed' (ArtifactVersionHistory.tsx:44-66,141-165)
- 'Restore' button on every row except the latest (ArtifactVersionHistory.tsx:166-176)
- Confirm dialog 'Restore version N?' (ArtifactPreview.tsx:1015-1022)
- Changes view: added and removed runs with screen reader markers (ArtifactChangesView.tsx:17-70)
- Web undo and redo steps built on restore (ArtifactPreview.tsx:1060-1080)

**Journey**

1. Open the version chip and pick a version
2. Or press previous and next
3. The viewer shows that version; edit is not offered
4. Choose 'Show changes' to see added and removed text against the one before
5. Choose Restore, confirm; the old text becomes the newest version and the viewer returns to latest

**What the person sees and gets**

- 'v2/3' live label
- Same-as text 'Same as version N' when content repeats (ArtifactVersionHistory.tsx:52-55)
- Summary 'No changes since version N' in the changes view (ArtifactChangesView.tsx:67)
- Mobile success haptic after restore (ArtifactFullScreen.tsx:813-816)

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web version chip, history, step, restore with confirm (ArtifactPreview.tsx:1010-1036,2641-2688)
- Restore appends the old content as the new latest; versions are content-keyed and history is kept (artifacts-store.ts:976-989; doc: docs/decisions/wire-or-cut.md:325)
- Web 'Show changes' compares the shown version with the one before it (ArtifactPreview.tsx:993-997,2336-2341)
- Mobile chevrons, history sheet, restore, show changes (ArtifactFullScreen.tsx:1440-1530,811-836)
- Mobile restore refuses the latest version (store.ts:358-362)

**Incomplete**

- Compare is against the previous version only; the brief asks to compare two chosen versions (S26.22) and marks it missing
- Mobile keeps only the last 20 versions, so restore cannot reach older ones (store.ts:45,177)

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI: no version command in the artifacts subcommands (lib.rs:1359-1424)
- VS Code: no version control in artifactActions.ts or artifactsTree.ts
- Chrome: no version control found in artifactPanel.ts

## 4. Required behaviour

**Established requirements**

- The viewer shows which version is displayed and lets the user pick any other (S26.20) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.20)
- The user can step to the previous and next version and see which is shown (S26.21) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.21)
- The user can compare two versions and see what changed (S26.22) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.22)
- Restoring an earlier version makes it current without losing the versions in between (S26.23) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.23)
- Generate, preview, revise, compare, restore, download and reopen with the intended version selected (source: doc: docs/product/experience-contract.md:782)

**Acceptance criteria**

1. Web: after one edit the chip reads v2/2 and the history lists two versions with Latest on the newest
2. Web: Previous version shows version 1 and disables edit
3. Web: Restore version 1 asks for confirmation, then the history has three versions and version 3 equals version 1
4. Web: 'Show changes' on version 2 marks added and removed lines against version 1
5. Mobile: 'Version 2 of 3' opens the history sheet; Restore adds a new latest
6. Restoring never removes any version on web
7. Restore on the latest version is not offered

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Compare of two arbitrary versions should reuse artifactChanges from the shared package (ArtifactChangesView.tsx:6-10) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the person pick the base version in the changes view
- [proposed] Raise or explain mobile's 20-version cap

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactVersionHistory | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | History list and restore |
| component | ArtifactChangesView | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Added and removed view |
| component | ArtifactPreview version chip | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chip, stepVersion, requestRestore, undo and redo |
| other | artifact-lineage | `apps/web/features/chat/components/artifacts/artifact-lineage.ts` | Version timeline across related artifacts [inferred from imports] |
| store | restoreArtifactVersion (web) | `apps/web/features/chat/stores/artifacts-store.ts` | Appends the old content as the latest (line 976) |
| store | shared engine restore | `packages/platform/artifacts/src/artifact-store.ts` | restoreArtifactVersion and version append (lines 41-44,96-115,172-189) |
| other | artifact-changes | `packages/platform/artifacts/src/artifact-changes.ts` | artifactChanges diff used by the changes view |
| component | ArtifactFullScreen version controls | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Chip, restore, show changes (lines 811-836,1440-1530) |
| component | ArtifactVersionHistorySheet | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Mobile history sheet |
| store | restoreArtifactVersion (mobile) | `apps/mobile/src/features/artifacts/store.ts` | Appends a version (line 358) |
| other | versionSummary | `apps/mobile/src/features/artifacts/versionSummary.ts` | Mobile change summaries |
| test | ArtifactPreview.restore.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx` | Restore tests |
| test | ArtifactVersionHistory.test (mobile) | `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx` | Mobile history tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Every content change upserts the artifact; the engine keeps each distinct content as a version | device | artifact-store.ts:96-115 |
| The chip reads versionsById for the artifact; stepping sets a viewed index | device | ArtifactPreview.tsx:966-986 |
| Restore confirms, then restoreArtifactVersion upserts the old content as the newest | device | ArtifactPreview.tsx:1010-1036; artifacts-store.ts:976-989 |
| Changes view computes added and removed units from two strings | device | ArtifactChangesView.tsx:67-70 |
| The new latest is pushed to the account by sync | device and our servers | use-artifact-cloud-sync.ts:21-22; artifact-cloud-sync.ts:114 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Version list per artifact | Web 'agi-artifacts-store' versionsById; mobile 'artifact-store' versionsById | Latest content syncs; whether each older version syncs is unknown | Mobile last 20; web cap not found in files opened |

**Models and providers.** Not involved. A regeneration by the model creates a new version through the same store.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none for local versions; sync needs sign-in |
| Permissions | Edit and restore only for a stored artifact (ArtifactPreview.tsx:618,1041) |
| Subscription | none found in the code in the files opened |
| Limits and metering | Mobile 20 versions per artifact (store.ts:45) |
| Feature flags | none found |
| Model compatibility | Not applicable |
| Provider restrictions | none found |
| Local mode | Works on the device in Local mode. Local conversations are not pushed to the account (artifacts-store.ts:1054-1068). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Single version | Chip hidden on web until there is more than one | ArtifactPreview.tsx, showVersionChip near line 974 |
| Restore with unsaved draft | Warns that unsaved edits are discarded | ArtifactPreview.tsx:1011-1021 |
| Restore same content as current | Returns false, nothing added | artifacts-store.ts:981 |
| Repeated content | Row says 'Same as version N' | ArtifactVersionHistory.tsx:52-55 |
| Escape in history | Closes and returns focus to the chip button | ArtifactVersionHistory.tsx:96-103; ArtifactPreview.tsx:1000-1004 |
| Conflict | The refused edit is kept as a version | artifacts-store.ts:300-313 |
| Offline | not handled in the code for versions beyond local storage | use-artifact-cloud-sync.ts:21-23 |
| Accessibility | Buttons labelled; aria-current on shown row; aria-live on the chip text | ArtifactVersionHistory.tsx:152; ArtifactPreview.tsx:2666-2672 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Asks before replacing, cancel leaves untouched, appends older content as new latest, unsaved edit wording
- `apps/web/features/chat/components/artifacts/ArtifactChangesView.test.tsx`: Changes view
- `apps/web/features/chat/components/artifacts/artifact-lineage.test.ts`: Version lineage
- `apps/web/features/chat/components/artifacts/ArtifactPreview.mermaidVersion.test.tsx`: Version handling for diagrams
- `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx`: History newest first with change text; open and restore a version
- `apps/web/features/chat/stores/artifacts-store.test.ts`: Store behaviour [inferred from name]

**Test scenarios**

- **Step and restore**
  1. Edit an artifact twice
  2. Click Previous version twice
  3. Choose Restore version 1 and confirm
  - Expected: History has four versions; the newest equals version 1
- **Show changes**
  1. Open version 2
  2. Choose Show changes
  - Expected: Added text marked, removed text marked, summary line shown
- **Mobile history**
  1. Open an edited artifact on the phone
  2. Tap 'Version 2 of 2'
  3. Restore version 1
  - Expected: Sheet closes; a new latest version exists
- **Mobile cap**
  1. Save 25 edits on the phone
  2. Open history
  - Expected: Only the latest 20 versions are listed
- **No version control elsewhere**
  1. Open an artifact in VS Code and with agi artifacts show
  - Expected: No version choice is offered

**Where to look when it fails**

- Store key 'agi-artifacts-store' versionsById in browser storage
- Mobile test ids artifact-version-chip, artifact-version-history-button, artifact-restore-version (ArtifactFullScreen.tsx:1450-1521)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Compare picks only the previous version, not any two versions** Affects: Web, Desktop, mobile. Evidence: ArtifactPreview.tsx:993-997. Work needed: Add a base-version choice
- **Brief marks compare missing though a changes view exists** Affects: Documentation. Evidence: ArtifactChangesView.tsx; ArtifactPreview.tsx:2336-2341. Work needed: Update the brief to partial
- **Mobile history is capped at 20 versions** Affects: Mobile. Evidence: store.ts:45,177. Work needed: Explain or raise
- **CLI, VS Code and Chrome have no versions** Affects: CLI, VS Code, Chrome. Evidence: artifactActions.ts; cloud/artifacts.rs; artifactPanel.ts. Work needed: Decide scope
- **Whether each older version reaches the account is unknown** Affects: All synced surfaces. Evidence: artifacts-store.ts sync items not fully read. Work needed: Read collectArtifactPushBatch and the sync route
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- F026-04
- file:packages/platform/artifacts/src/artifact-store.ts
- file:packages/platform/artifacts/src/artifact-changes.ts

## Unknown

- Web cap on versions per artifact
- Whether older versions reach the account or only the latest
- Whether the Electron Desktop shows the same chip (it loads hosted web, doc: AGENTS.md section 5)
- Chrome version support

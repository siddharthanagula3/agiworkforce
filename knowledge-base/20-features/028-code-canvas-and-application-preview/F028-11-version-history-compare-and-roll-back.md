---
id: "F028-11"
type: "feature"
title: "Version history: compare and roll back"
aliases: ["Version history", "Restore version", "Show changes", "Put live", "Rollback", "S28.29", "S28.30"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S28.29", "S28.30"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "F028-10", "table:published_artifact_versions", "table:web_artifact_versions", "store:artifacts-store", "mode:cloud", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-11 Version history: compare and roll back

Step through earlier versions of an artifact, see what changed from the previous version, and restore an older one as a new latest version. Web and mobile do all three; the internal Tauri desktop restores only. Web Settings can also put an older published version live. CLI, VS Code and Chrome have none.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.29](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2829), [S28.30](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2830).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Keeps each saved version of an artifact, lets the person view one, compare it with the version just before it, and restore it; the restored content is appended so the versions between it and the latest survive (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1030; apps/mobile/src/features/artifacts/store.ts:358-381).

**Why it exists.** So an edit or a regenerate that went wrong can be undone without losing work. The brief wants version comparison and rollback (doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.29-S28.30).

**Who uses it.** Anyone editing or regenerating artifacts; owners who published a link and want an older version live.

**Problems it solves**

- Undoing a bad edit.
- Seeing what a new version changed.
- Putting an earlier published version back on the live link.

**Use cases**

- Web: open the version chip, view version 2, choose Restore.
- Mobile: press 'Show changes' to see added and removed lines.
- Web Settings: 'History' then 'Put live' for an older published version.

## 2. User experience

**Where to find it**

- Web preview: buttons 'Previous version', 'Version history', 'Next version'; more menu items 'Show changes' or 'Hide changes', 'Review changes', 'Restore version N' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2325-2350,2652-2684,2986).
- Web Settings: Shared links, Published artifacts, 'History', 'Put live' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:615-617,670-700).
- Mobile full screen: 'Previous version', 'Next version', 'Show changes', 'Restore version N', and a history sheet with 'Restore' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1496-1519; apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:134-154).
- Desktop: the public Desktop shows web (doc: AGENTS.md section 5). Internal Tauri Local: panel action 'Restore version N' (apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts, id restore-version).
- CLI, VS Code, Chrome: none found.

**Before you start**

- The artifact has more than one version (mobile history sheet needs more than one: ArtifactFullScreen.tsx:1930).
- Web 'Show changes' needs the panel variant and a previous version; it is unavailable for PDF, Word, image or with an unsaved source draft (ArtifactPreview.tsx:987-994).
- Put live needs a published artifact.

**Screens and controls**

- Version chip and history list; changes view with added and removed lines; confirmation dialog 'Restore version N?' with button 'Restore' (ArtifactPreview.tsx:1015-1018).

**Journey**

1. 1. Open the artifact and step to an older version.
2. 2. Optionally open 'Show changes' to see the difference from the version before it.
3. 3. Press Restore (web asks first; mobile and Tauri restore at once).
4. 4. The chosen content becomes the newest version; the viewing index returns to latest.

**What the person sees and gets**

- Web dialog text: 'This replaces what you are looking at with version N, added as the new latest so the versions in between survive.' plus 'Your unsaved edits are discarded.' when a draft exists (ArtifactPreview.tsx:1013-1019).
- Mobile success haptic (ArtifactFullScreen.tsx:814).
- Tauri toast 'Restored version N' or 'Could not restore this version' (useDesktopArtifactActions.ts).
- Settings notice 'Version N of "<title>" is live again.' (PublishedArtifactsSection.tsx:410-413).

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web restore with confirmation; destructive style only when unsaved edits exist (ArtifactPreview.tsx:1008-1030). The store appends the older content as the newest and does nothing if it is identical (apps/web/features/chat/stores/artifacts-store.ts:976-990).
- Web 'Show changes' compares the shown version with the one before it (ArtifactPreview.tsx:975-996; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx).
- Mobile version stepping, 'Show changes', restore, and history sheet (ArtifactFullScreen.tsx:579-617,811-836,1496-1519; apps/mobile/src/features/artifacts/store.ts:358-381; apps/mobile/src/features/chat/components/ArtifactChangesView.tsx).
- Tauri Local restore calls the artifact_rollback command (apps/desktop/src/runtime/TauriRuntime.ts:1569-1581).
- Published versions: GET list and GET one version; POST puts an older version live and records a new version with an audit event (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:20-37,120-132; apps/web/lib/services/published-artifact-service.ts:500-560).

**Incomplete**

- Comparison is only against the immediately previous version, not any two versions (ArtifactPreview.tsx:987-989; ArtifactFullScreen.tsx:608-613).
- Mobile and Tauri restore have no confirmation; web has one (ArtifactFullScreen.tsx:811-817; useDesktopArtifactActions.ts).
- Web restore returns false and does nothing if the content equals the current content (artifacts-store.ts:982).

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI, VS Code and Chrome have no version list, compare or restore in the code read (apps/cli/src/lib.rs:1359-1430; apps/extension-vscode/src/features/surfaces/index.ts:97-114; apps/extension/src/features/side-panel/artifactPanel.ts).
- The brief marks S28.29 missing everywhere and mobile rollback missing; the code shows a previous-version changes view on web and mobile and restore on mobile.

## 4. Required behaviour

**Established requirements**

- The user can compare two versions of the app's code (brief: missing on every app). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.29)
- The user can roll the app back to an earlier version (brief: web and desktop done; CLI and VS Code missing; Chrome unverified). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.30)
- Restore asks first, says unsaved edits are discarded, and keeps in-between versions. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1030)
- An action a user cannot undo asks first and names the consequence; code gets a checkpoint. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Web: with 3 versions, view version 1, press 'Restore version 1', confirm: version 4 appears equal to version 1 and versions 2 and 3 remain.
2. Web: cancel the dialog; nothing changes.
3. Web: with an unsaved source edit, the dialog warns the edits are discarded and is styled destructive.
4. Web: 'Show changes' on version 2 highlights lines added and removed relative to version 1.
5. Mobile: 'Restore version N' makes a new latest version and returns to the latest view.
6. Settings: 'Put live' on an older published version updates the live page and marks that version 'Live now'.
7. CLI, VS Code and Chrome offer no restore.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and Tauri restore should confirm as web does, per the undo-asks-first rule [inferred from doc: AGENTS.md section 9]; restore is non-destructive since earlier versions are kept, so the rule may not require it.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a two-version picker for compare.
- [proposed] Add a confirmation to mobile and Tauri restore for consistency.
- [proposed] Offer version history in the CLI (list and restore) if the account store supports it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview version UI | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Version chip, changes toggle, restore confirmation |
| component | ArtifactChangesView web | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Added and removed lines view |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | restoreArtifactVersion, getArtifactVersions, forkArtifact |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Publish history and Put live |
| service | sites-service | `apps/web/features/sites/services/sites-service.ts` | listPublishedArtifactVersions and republishArtifactVersion |
| endpoint | GET versions | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | List published versions |
| endpoint | GET and POST version | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Read one version; POST restores it as live |
| service | published-artifact-service versions | `apps/web/lib/services/published-artifact-service.ts` | recordPublishedVersion, restorePublishedArtifactRecord, list and read versions |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Published version snapshots |
| table | web_artifact_versions | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Cloud-synced artifact versions (table created at line 59) |
| component | mobile ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Version stepping, Show changes, Restore |
| component | mobile ArtifactVersionHistorySheet | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | History list with Restore |
| component | mobile ArtifactChangesView | `apps/mobile/src/features/chat/components/ArtifactChangesView.tsx` | Line changes view |
| store | mobile artifact store | `apps/mobile/src/features/artifacts/store.ts` | restoreArtifactVersion appends a version and queues a cloud push |
| hook | useDesktopArtifactActions | `apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts` | Tauri 'Restore version N' action |
| service | TauriRuntime restoreArtifactVersion | `apps/desktop/src/runtime/TauriRuntime.ts` | Invokes artifact_rollback |
| test | web restore test | `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx` | Restore confirmation tests |
| test | web changes view test | `apps/web/features/chat/components/artifacts/ArtifactChangesView.test.tsx` | Changes view |
| test | mobile version history test | `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx` | Mobile history |
| test | published restore route test | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.restore.test.ts` | Put live route |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The panel reads the stored version list and shows the chosen version's content. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:962-994 |
| Show changes computes the line difference with the previous version in the page. | device | ArtifactPreview.tsx:987-996; ArtifactChangesView.tsx |
| Restore appends the older content as a new version in the local store and marks it for cloud sync. | device | artifacts-store.ts:976-990; apps/mobile/src/features/artifacts/store.ts:358-381 |
| Synced artifacts push the new version to the account. | our servers | apps/web/features/chat/stores/artifacts-store.ts:683-684 (collectArtifactPushBatch, applyArtifactPushResult); apps/mobile/src/features/artifacts/store.ts:358-381 (pendingCloudPushes) |
| Put live: the server reads the chosen snapshot, runs sharing and content checks, rewrites the live publication and records a new version. | our servers | apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:66-120 |
| Tauri Local restore runs the native artifact_rollback command. | device | apps/desktop/src/runtime/TauriRuntime.ts:1569-1581 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact versions | Browser store on web; mobile store on the phone; table web_artifact_versions for synced artifacts; native store for Tauri Local | Web and mobile push to the account when signed in to Cloud (stores above); Tauri Local not synced | Tauri delete removes 'every saved version' from the device (useDesktopArtifactActions.ts); other retention: unknown |
| Published snapshots | table published_artifact_versions | Server only | Cascade on unpublish |

**Models and providers.** No model is involved in restore or compare.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local versions need no account. Put live needs the signed-in owner. |
| Permissions | Put live is owner only (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:76-82; row-level security in the service). |
| Subscription | none found in the code. |
| Limits and metering | Published content up to 1,000,000 characters per version (apps/web/db/neon/0257_file_versions_and_lineage.sql:53-70). Number of versions kept: unknown. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Versions, compare and restore on web, mobile and Tauri work on the device without a provider or subscription. Put live and cloud sync need Cloud mode. Whether web artifacts in Local mode keep versions across sessions: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Only one version | Compare and history are not offered (canShowChanges needs a previous version; mobile sheet needs more than one) | ArtifactPreview.tsx:987-994; ArtifactFullScreen.tsx:1930 |
| PDF, Word, image artifacts | Show changes unavailable | ArtifactPreview.tsx:989-993 |
| Restore with unsaved edit | Warning and destructive dialog; draft cleared after confirm | ArtifactPreview.tsx:1010-1031 |
| Restore cancelled | Nothing changes | apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx:70 (title: leaves the artifact untouched when the reader cancels) |
| Restore of identical content | No new version | artifacts-store.ts:982 |
| Put live of a version that fails checks | Validation, ownership or quota errors, or conflict 'This publication is no longer available to restore.' | publish/[token]/versions/[version]/route.ts:96-118 |
| Tauri restore fails | Toast 'Could not restore this version' with the reason | useDesktopArtifactActions.ts |
| Accessibility | Mobile controls carry labels such as 'Restore version N'; web chip has aria-label 'Previous version' | ArtifactFullScreen.tsx:1519-1530; ArtifactPreview.tsx:2652-2684 |
| Offline, timeout, retry | not handled in the code beyond sync status | artifacts-store.ts:685-689 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Asks before replacing, leaves artifact untouched on cancel, appends older content as new latest, warns about unsaved edit (from it titles)
- `apps/web/features/chat/components/artifacts/ArtifactChangesView.test.tsx`: Changes view; titles not read
- `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx`: Mobile version history; titles not read
- `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.restore.test.ts`: Put live route; titles not read
- `apps/web/app/api/artifacts/publish/[token]/versions/__tests__/route.test.ts`: Version list route; titles not read
- `apps/desktop/src/features/artifacts/__tests__/useDesktopArtifactActions.test.ts`: Tauri panel actions; titles not read
- `apps/web/lib/services/published-artifact-publication-policy.restore.test.ts`: Policy on restore; titles not read

**Test scenarios**

- **Restore on web**
  1. Edit an artifact twice so it has 3 versions.
  2. View version 1 and choose 'Restore version 1'.
  3. Confirm.
  - Expected: A fourth version equal to version 1 is latest; versions 2 and 3 remain in history.
- **Cancel restore**
  1. Start Restore and press cancel.
  - Expected: No change.
- **Compare**
  1. View version 2.
  2. Choose 'Show changes'.
  - Expected: Lines added or removed against version 1 are marked.
- **Mobile restore**
  1. Open an artifact with 2 versions full screen.
  2. Step to version 1.
  3. Press 'Restore version 1'.
  - Expected: New latest version; view returns to latest.
- **Put live**
  1. Publish, edit, publish again.
  2. Settings, Shared links, History, Put live on version 1.
  - Expected: Link shows version 1 content; notice 'Version 1 ... is live again.'
- **Absent on CLI, VS Code, Chrome**
  1. Search each for a version or restore action.
  - Expected: None offered.

**Where to look when it fails**

- Audit event status 'version_restored' (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:111-118).
- Tauri error 'Could not restore version N' (apps/desktop/src/runtime/TauriRuntime.ts:1578).
- Tables web_artifact_versions and published_artifact_versions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)
- Mobile: [70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **Compare is only previous-version, not any two versions.** Affects: Web and mobile users. Evidence: ArtifactPreview.tsx:987-989. Work needed: Add a picker if full compare is required.
- **The brief says comparison is missing everywhere and mobile rollback missing; code shows both on mobile and compare on web.** Affects: Documentation. Evidence: ArtifactFullScreen.tsx:608-617,811-817; ArtifactPreview.tsx:987-996. Work needed: Update brief statuses (S28.29 partial on web and mobile; S28.30 done on mobile).
- **No version history or restore in CLI, VS Code, Chrome.** Affects: Those users. Evidence: apps/cli/src/lib.rs:1359-1430; apps/extension-vscode/src/features/surfaces/index.ts:97-114. Work needed: Decide scope and build.
- **Restore confirmation differs by app.** Affects: Mobile and Tauri users. Evidence: ArtifactFullScreen.tsx:811-817; ArtifactPreview.tsx:1015-1018. Work needed: Align or record the reason.
- **Local-mode web persistence of versions not established.** Affects: Local users. Evidence: unknown. Work needed: Read the web store persistence code.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- F028-10
- table:published_artifact_versions
- table:web_artifact_versions
- store:artifacts-store
- mode:cloud
- mode:local

## Unknown

- Number of versions retained and any pruning rule.
- Whether versions of Local-mode web artifacts persist across sessions.
- Whether the Electron Desktop gets the web restore only.
- What the Tauri artifact_rollback command does inside (Rust side not read).
- Test titles beyond those listed.

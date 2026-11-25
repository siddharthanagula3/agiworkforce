---
id: "F033-07"
type: "feature"
title: "Copy, duplicate and download source"
aliases: ["Duplicate", "Duplicate this artifact", "Download source", "Download as HTML / Markdown / PDF / Word", "Download artifact (mobile)", "agi artifacts show --out", "Save Artifact into Workspace (VS Code)", "Save a copy to my chats", "fork (code name forkArtifact)", "S33.25 Duplicate/fork", "S33.26 Download source"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S33.25", "S33.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "F033-01", "F033-06", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-shared-ui-and-design", "store:agi-artifacts-store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-07 Copy, duplicate and download source

Lets a person keep working on a copy of a generated app or file, and take its source out as a file. Web has Duplicate (a local copy) and a Download menu. Mobile exports through the share sheet. The CLI writes to a file. VS Code saves into the workspace. Chrome downloads from the side panel.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.25](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3325), [S33.26](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3326).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Two jobs. Duplicate makes a separate artifact that starts from what is on screen, so edits to the copy never touch the original (artifacts-store.ts:929). Download hands the person the artifact's source or a converted document as a real file on their own device (ArtifactPreview.tsx:2381-2418).

**Why it exists.** Generated apps and documents are made in chat. People need to try a different version without losing the first, and to own the file outside the product. The brief lists both as owner needs (S33.25, S33.26).

**Who uses it.** The owner of a generated artifact on web (and desktop, which shows the hosted web app), phone users, CLI users, VS Code users and Chrome side-panel users. A viewer of a shared page can also save a copy into their own chats.

**Problems it solves**

- Trying a risky change without overwriting the working version.
- Getting the HTML, code, Markdown, PDF or Word file out of the product.
- Moving a generated file into a local project (CLI file output, VS Code workspace save).
- Spreadsheet formulas in exported CSV or TSV text being run by Excel: exports are made safe (ArtifactPreview.tsx:1405-1410).

**Use cases**

- A person duplicates a landing page, asks for a new colour scheme on the copy, and keeps the original.
- A person downloads a generated deck as PDF to send it by email.
- A developer runs agi artifacts show <id> --out ./site.html to put a generated page in a repo.
- A VS Code user saves an artifact from the Artifacts view into the open folder.

## 2. User experience

**Where to find it**

- Web: artifact panel, More actions menu. Items 'Duplicate' (group 'Keep') and a download group (ArtifactPreview.tsx:2502-2516, 2381-2418). Duplicate shows only in the panel variant for an artifact held in the store, not on the inline card (ArtifactPreview.forkAndProjectSave.test.tsx:65).
- Web download labels: 'Download as HTML', 'Download source (.<language>)', 'Download as Markdown', 'Download as PDF', 'Download as Word (.docx)', 'Download as CSV', 'Download as SVG', 'Download file', 'Download image', 'Download generated file' (ArtifactPreview.tsx:2371-2418).
- Web shared page: button 'Save a copy to my chats' (PublishedArtifactView.tsx:229-231).
- Desktop: the public desktop shows the hosted web app, so the same menus apply (doc: AGENTS.md section 5).
- Mobile: header icon with accessibility label 'Download artifact' in the full-screen artifact view (ArtifactFullScreen.tsx:1337-1339); a sheet titled by 'Dismiss download options' lists formats (ArtifactExportSheet.tsx).
- CLI: agi artifacts show <id> [--out <path>] [--open] [--copy] [--json] (lib.rs:1372-1386, handler lib.rs:3910).
- VS Code: command 'Code: Save Artifact into Workspace' and a save icon in the Artifacts view (package.json:713; surfaces/index.ts:104-107).
- Chrome extension: Download icon on each artifact card and in the artifact panel of the side panel (artifactPanel.ts:500-506, 622-625).

**Before you start**

- Web Duplicate needs the artifact to be in the browser artifact store (ArtifactPreview.tsx:618, 2500).
- CLI and VS Code need a signed-in account because they read the artifact from the cloud index (lib.rs:3910-3920; artifactActions.ts:163-190) [inferred from the cloud client use].
- VS Code needs an open folder first, or it warns 'open a folder first' (artifactActions.ts:167-171).
- Web download needs no account in the code read; none found in the code.

**Screens and controls**

- Web More menu: Duplicate, Download items, Rename, Start Work, Save to Library (ArtifactPreview.tsx:2370-2540).
- Mobile export sheet: one row per format with an icon; a single format downloads directly, several open the sheet (ArtifactFullScreen.tsx:694-699).
- CLI flags: --out, --open (needs --out), --copy, --json (lib.rs:1376-1384).
- VS Code save dialog titled Save "<title>" into the workspace (artifactActions.ts:191-194).

**Journey**

1. Web duplicate: open an artifact in the panel, open More actions, choose Duplicate.
2. The store makes a new artifact with a new id, an empty version history, the title plus ' (copy)' (' (copy 2)' for a copy of a copy), and selects it (artifacts-store.ts:929-952; test artifacts-store.test.ts:743-755).
3. If the person was viewing an older version, the copy starts from that version (ArtifactPreview.tsx:2509 passes activeContent).
4. A toast says 'Duplicated. Edits here no longer touch the original.'; the panel resets any unsaved source draft (ArtifactPreview.tsx:2513-2516).
5. Web download: open More actions, choose a Download item; the browser saves the file (saveBlob, ArtifactPreview.tsx:1352-1361).
6. Mobile download: tap the Download icon; pick a format if several; the file is written and handed to the share sheet (ArtifactFullScreen.tsx:686-728).
7. CLI: run agi artifacts show <id>; without --out it prints the content, with --out it writes the file and prints its path (lib.rs:3935-3971).

**What the person sees and gets**

- Web: success toast on Duplicate; error toast 'That artifact could not be duplicated' (ArtifactPreview.tsx:2511); download errors use toasts such as 'Could not download this file' (ArtifactPreview.tsx:1678).
- Mobile: an alert 'Download failed' with a reason, and a success haptic (ArtifactFullScreen.tsx:723-725).
- CLI: prints the content, or the path of the written file; 'could not open it automatically' when --open fails (lib.rs:3965-3969).
- VS Code: opens the saved file in an editor; warnings and errors are shown as messages (artifactActions.ts:195-215).
- Output files: HTML, source in the artifact's language, Markdown, PDF, DOCX, CSV, SVG or the real bytes of a generated file.

**Settings**

- None found in the code for fork or download.
- Mobile and web choose the extension from the artifact's language, not from a setting (artifactExport.ts:38-45; ArtifactPreview.tsx:1405-1410).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Duplicate makes an independent copy, numbers repeats, forks the version on screen and selects the copy (artifacts-store.ts:929-952; artifacts-store.test.ts:702-779).
- Web download of HTML, Markdown, source, deck HTML, deck PDF, Word, PDF, CSV, SVG, images and generated files (ArtifactPreview.tsx:1381-1413, 1765-1782, 2381-2418).
- PDF and Word artifacts download as real bytes, not as text (ArtifactPreview.tsx:1760-1782).
- Mobile export of Markdown, PDF, Word, text and source files, with deck PDF, then the share sheet (artifactExport.ts:54-150; ArtifactFullScreen.tsx:686-728).
- CLI show prints or writes the artifact, chooses the extension from the kind then language, and keeps an explicit file name (lib.rs:3910-3971; artifacts.rs:236-296; unit tests artifacts.rs:856-890).
- VS Code saves an artifact into the workspace through a save dialog (artifactActions.ts:163-215).
- Chrome side panel downloads an artifact with a spreadsheet-safe export (artifactPanel.ts:381-387).
- Viewer-side 'Save a copy to my chats' copies a shared page into the viewer's own chat (PublishedArtifactView.tsx:229-231; copy-shared-artifact imported at line 19).

**Incomplete**

- Duplicate is a copy in the browser store only. The fork handler writes to the shared artifact store and its side entry; no server call is in it (artifacts-store.ts:929-952). Whether the copy syncs anywhere is not established.
- The copy keeps the source message id, so its link to the original chat is the same (artifacts-store.ts:940-941) [inferred: it is not a new chat artifact for CLI or VS Code, whose index is derived from messages].
- The brief marks mobile download as done but the mobile path is a share sheet, so the file is not saved to a chosen folder by the app itself (ArtifactFullScreen.tsx:721).

**Present but disconnected or switched off**

- The brief cites package.json:593 and commandSetup.ts:2297 as the VS Code download command. Those lines are 'Code: Continue in the Cloud' and plan-usage text. The real command is saveArtifactToWorkspace (package.json:713; commandSetup.ts:2653). Its entry in the command palette list is hidden (package.json:1198 'when: false'); it is shown on tree items instead (surfaces/index.ts:104-107).

**Not available**

- Duplicate on mobile, CLI, VS Code and Chrome: none found in the code (grep for forkArtifact finds only web files).
- Duplicating or forking a published page as a server action: none found; only the viewer's 'Save a copy to my chats'.
- Download of a whole multi-file project: none found in the code.

## 4. Required behaviour

**Established requirements**

- S33.25: the owner can duplicate or fork an app to keep working on a copy. Brief status: web done, desktop done, mobile missing, CLI missing, VS Code missing, Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.25)
- S33.26: the owner can download the app's source. Brief status: web, desktop, mobile, CLI, VS Code done, Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.26)
- Editing a copy must not write a version onto the original, and restoring the original must not reach the copy. (source: apps/web/features/chat/stores/artifacts-store.ts:920-927)
- An action a user cannot undo asks first; a file an agent overwrites goes to Trash first. Download and duplicate create files or copies and do not overwrite. (source: doc: AGENTS.md section 9)
- Exported spreadsheet text must neutralize formula cells. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx:117-133)

**Acceptance criteria**

1. On web, choosing Duplicate on a stored panel artifact adds exactly one new artifact titled '<title> (copy)', selects it, and leaves the original content and version list unchanged.
2. Duplicating a copy gives '(copy 2)'; duplicating while viewing an old version copies that version's content.
3. Duplicate is absent on the inline card variant.
4. Download as HTML, Markdown and source each save a file whose name ends in the right extension; a PDF or Word artifact saves valid bytes that open in a viewer.
5. A CSV artifact containing a cell starting with = is saved with that cell neutralized.
6. agi artifacts show <id> --out <dir> writes <id>.<ext> in that directory and prints the path.
7. On mobile, a Markdown artifact offers Markdown, PDF, Word and Plain text; a code artifact offers one source file.
8. VS Code with no folder open shows the 'open a folder first' warning and writes nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A copy should reach the account, not only the browser, so it appears on other apps [inferred from the six-app parity rule in the project context; the code shows no sync of the copy].
- Mobile, CLI and VS Code should offer Duplicate for parity with web [inferred from S33.25 statuses missing].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make Duplicate create a server-side artifact so CLI, VS Code and mobile list it.
- [proposed] Add a duplicate action on mobile and a 'agi artifacts copy' command in the CLI.
- [proposed] Offer a 'download project as zip' once multi-file apps exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview (More menu, download handlers) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Builds the Duplicate and Download menu items; handleDownload (line 1381), handleDownloadBinaryDoc (1765), saveBlob (1352), duplicate item (2502). |
| store | forkArtifact | `apps/web/features/chat/stores/artifacts-store.ts` | Makes the independent copy, titles it, selects it (lines 929-952). Persisted under the browser key agi-artifacts-store (line 591). |
| component | ArtifactMoreMenu | `apps/web/features/chat/components/artifacts/ArtifactMoreMenu.tsx` | Renders the menu items passed by ArtifactPreview. |
| service | downloadGeneratedFile | `apps/web/features/chat/utils/downloadArtifacts.ts` | Downloads generated files and images (imported at ArtifactPreview.tsx:160). |
| component | PublishedArtifactView 'Save a copy to my chats' | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Viewer-side copy of a shared page into the viewer's chats (lines 229-231). |
| service | copySharedArtifactToChat | `apps/web/features/chat/lib/copy-shared-artifact.ts` | Creates the chat and artifact for the viewer's copy (imported at PublishedArtifactView.tsx:19). |
| service | artifactExport (mobile) | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Chooses export formats per artifact and writes the file (lines 54-150). |
| component | ArtifactExportSheet | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | Mobile bottom sheet listing formats, then shares the file. |
| screen | ArtifactFullScreen download handler | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | handleDownload (686-728) and the 'Download artifact' button (1337). |
| command | agi artifacts show | `apps/cli/src/lib.rs` | Arguments at 1372-1386; handler at 3910-3971 prints or writes content. |
| service | CLI artifacts helpers | `apps/cli/src/cloud/artifacts.rs` | file_extension (236), output_path (283), content (400) used by show. |
| command | agi-workforce.saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | saveArtifactToWorkspace (163-215) reads content from the source message and writes it with a save dialog. |
| config | VS Code command registration | `apps/extension-vscode/src/core/commandSetup.ts` | Registers the save command (line 2650-2654). |
| config | VS Code command manifest | `apps/extension-vscode/package.json` | Declares 'Code: Save Artifact into Workspace' (713). |
| component | Chrome artifactDownload | `apps/extension/src/features/side-panel/artifactPanel.ts` | artifactDownload (381) builds the file; buttons at 500-506 and 622-625. |
| service | spreadsheetSafeExport | `packages/ui/unified-chat` | Shared formula-safe export used by web, mobile and Chrome (imports at artifactExport.ts:11, ArtifactPreview.tsx:1408). |
| test | Fork store tests | `apps/web/features/chat/stores/artifacts-store.test.ts` | forkArtifact cases (702-779). |
| test | Duplicate panel test | `apps/web/features/chat/components/artifacts/ArtifactPreview.forkAndProjectSave.test.tsx` | Duplicate menu behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web Duplicate: the browser calls forkArtifact, which reads the artifact from the shared in-memory store, makes a new id and writes the copy back to the store. | device | apps/web/features/chat/stores/artifacts-store.ts:929-952 |
| Web Download: the page builds a Blob from the artifact content and clicks a temporary link. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1352-1361, 1381-1413 |
| Deck PDF, Word and PDF conversions run in the browser code (imports from presentation/deck-pdf and an export handler). | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1647-1649 |
| Mobile Download: converts and writes the file locally, then opens the share sheet. If the artifact is a generated file at an http address, it is fetched first. | device and our servers | apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:690-694, 721 |
| CLI show: resolves the artifact id against the cloud index, fetches the source message, re-derives the content, then writes the file locally. | device and our servers | apps/cli/src/lib.rs:3910-3921, 3956-3960; apps/cli/src/cloud/artifacts.rs:400 |
| VS Code save: pages through the conversation to find the source message, derives the artifact and writes it to a chosen path. | device and our servers | apps/extension-vscode/src/features/artifacts/artifactActions.ts:28-58, 163-215 |
| Viewer 'Save a copy to my chats': posts the shared page content to create a chat in the viewer's account. | our servers | apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:151-176 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The duplicate artifact (content, title, language, message and conversation ids, compute session, manifest). | Browser storage key agi-artifacts-store through the shared artifact store (store:agi-artifacts-store). | Not established in the code read for the fork handler; no server call in forkArtifact. | Kept until the person clears artifacts; storage is quota-aware and can degrade (artifacts-store.ts:528, 593). |
| Downloaded file. | The person's device: browser downloads folder, mobile app files then share sheet, CLI path, VS Code workspace. | No. | Owned by the person; the product does not delete it. |
| Viewer's copy created by 'Save a copy to my chats'. | The viewer's chats on our servers, and the browser artifact store. | Yes, through the chat account. | Follows chat deletion rules; details unknown here. |

**Models and providers.** No model or provider takes part in duplicate or download. Format conversion is local code. Nothing in this feature calls a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web duplicate and download: no account check found in the handlers. CLI and VS Code need a signed-in account to read cloud artifacts. Viewer copy needs sign-in; a signed-out viewer is sent to the sign-in page (PublishedArtifactView.tsx:151-154). |
| Permissions | Only the person who sees the artifact in their own panel. There is no owner check for the local copy because it never leaves the browser. The viewer copy takes the content as shown to the viewer (PublishedArtifactView.tsx:160-175). |
| Subscription | None found in the code: no plan gate on duplicate or download. |
| Limits and metering | None found in the code for duplicate or download. Local storage quota handling exists for the artifact store (artifacts-store.ts:528). |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable; no model is called. |
| Provider restrictions | None; no provider is used. |
| Local mode | Web duplicate and download work entirely on the device. Mobile export works on the device for a local artifact. CLI show and VS Code save need the cloud index, so they do not work for purely local artifacts [inferred from their cloud client]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Artifact not in the store | forkArtifact returns null and the UI shows 'That artifact could not be duplicated'. | artifacts-store.ts:931; ArtifactPreview.tsx:2509-2512; artifacts-store.test.ts:776-778 |
| Inline card | Duplicate is not offered. | ArtifactPreview.forkAndProjectSave.test.tsx:65 |
| Viewing an older version | The copy starts from the version on screen. | ArtifactPreview.tsx:2509; artifacts-store.test.ts:759-766 |
| Copy of a copy | Title gets '(copy 2)'. | artifacts-store.ts:209-214 |
| PDF or Word download error | Error toast such as 'The PDF could not be made'. | ArtifactPreview.tsx:1651 |
| Mobile export failure | Alert 'Download failed' and the button is re-enabled. | ArtifactFullScreen.tsx:723-727 |
| Mobile double tap | Ignored while a download is running. | ArtifactFullScreen.tsx:687 |
| VS Code, message no longer produces the artifact | Warning that there is nothing to save. | artifactActions.ts:177-182 |
| VS Code, no folder open | Warning; nothing written. | artifactActions.ts:167-171 |
| CLI out path with no extension | Gains the artifact's extension; a directory takes <id>.<ext>. | artifacts.rs:283-296 |
| Offline | Web duplicate and download work offline. CLI and VS Code errors are shown; retry logic: not handled in the code. | artifacts-store.ts:929; artifactActions.ts:174-186 |
| Cancel | VS Code save dialog cancel writes nothing; mobile alert has a Cancel option. | artifactActions.ts:196; ArtifactFullScreen.tsx:719 |
| Accessibility | Duplicate has aria label 'Duplicate this artifact'; mobile button has label 'Download artifact'. | ArtifactPreview.tsx:2506; ArtifactFullScreen.tsx:1339 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/stores/artifacts-store.test.ts`: forkArtifact: independence, copy naming, forking the version on screen, selecting the copy, null for unknown id.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.forkAndProjectSave.test.tsx`: Duplicate from the More menu and its absence on the inline card; save to project file naming.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx`: Formula-safe source downloads for csv and tsv.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx`: Markdown export from the artifact panel (name only read; content not opened).
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Mobile exports byte for byte, file names, source extensions, downloaded file names.
- `apps/cli/src/cloud/artifacts.rs`: Rust unit tests for extension choice and --out path rules (lines 856-890).
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: artifactDownload and the card download button.
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Artifacts view; no test of saveArtifactToWorkspace found.

**Test scenarios**

- **Duplicate keeps the original**
  1. Open an HTML artifact in the web panel.
  2. Edit its source in the copy after choosing More actions, Duplicate.
  3. Select the original.
  - Expected: Two artifacts; the copy is titled '<title> (copy)'; the original content and versions are unchanged.
- **Duplicate an older version**
  1. Make two edits.
  2. Open version history and view version 1.
  3. Choose Duplicate.
  - Expected: The copy holds version 1 content.
- **Download deck as PDF**
  1. Open a presentation artifact.
  2. More actions, Download as PDF.
  - Expected: A PDF with one slide per page is saved; on failure a toast 'The PDF could not be made' appears.
- **CLI file output**
  1. Run agi artifacts list.
  2. Run agi artifacts show <id> --out ./out.
  3. Open the file.
  - Expected: ./out.<ext> exists with the artifact source; the path is printed.
- **Mobile export**
  1. Open a Markdown artifact full screen.
  2. Tap Download artifact, choose Word.
  - Expected: A .docx file opens in the share sheet.
- **VS Code save**
  1. Open a folder.
  2. In the Artifacts view, choose the save icon.
  3. Pick a path.
  - Expected: The file is written and opened; with no folder, a warning shows.

**Where to look when it fails**

- Web: browser console and the toasts named above; check the localStorage key agi-artifacts-store.
- Mobile: the 'Download failed' alert text (downloadFailureMessage).
- CLI: error text from agi artifacts show; --json prints the path.
- VS Code: messages beginning with the product name, e.g. 'the copy was not saved'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)
- CLI: [70-qa/test-plans/cli/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/cli/033-generated-sites-and-published-applications.md)
- VS Code: [70-qa/test-plans/vscode/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/vscode/033-generated-sites-and-published-applications.md)
- Chrome: [70-qa/test-plans/chrome/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/chrome/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **Duplicate exists only on web (and desktop through web).** Affects: Mobile, CLI, VS Code, Chrome users.. Evidence: forkArtifact is referenced only in web files; brief S33.25 mobile, CLI, VS Code missing.. Work needed: Add a duplicate action per app on top of a shared server-side copy.
- **The copy is held in the browser store, with no server-side record found.** Affects: Anyone who signs in on another device or app.. Evidence: artifacts-store.ts:929-952 has no network call.. Work needed: Decide whether copies sync; persist through the artifacts API if so.
- **The brief's VS Code evidence points at the wrong lines.** Affects: Testers and engineers using the brief.. Evidence: package.json:593 and commandSetup.ts:2297 do not hold a download command; the real one is package.json:713.. Work needed: Correct the brief citations.
- **No test covers the VS Code save command or the CLI show handler end to end.** Affects: VS Code and CLI.. Evidence: artifactsView.test.ts has no save case; artifacts.rs tests cover only path helpers.. Work needed: Add tests for saveArtifactToWorkspace and the show --out handler.
- **Download source is not a project download for multi-file apps.** Affects: Users who want a whole site.. Evidence: All download handlers write one file (ArtifactPreview.tsx:1381-1413).. Work needed: Define a multi-file artifact and a zip export.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- F033-01
- F033-06
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- store:agi-artifacts-store

## Unknown

- Whether the duplicated web artifact is ever synced to the server or other apps (no network call found in forkArtifact).
- What 'Save a copy to my chats' stores and for how long (copy-shared-artifact.ts not read).
- Whether Electron desktop shows any extra download behaviour such as a save dialog (only the hosted web app was assumed from AGENTS.md).
- Whether the Chrome extension has a duplicate action (none found; not exhaustively searched).
- Whether any run of the listed tests has passed; no result file was read.

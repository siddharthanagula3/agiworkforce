---
id: "F028-08"
type: "feature"
title: "Download and export"
aliases: ["Download source", "Download all", "Export project archive", "artifacts.zip", "agi artifacts show --out", "S28.24", "S28.25"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S28.24", "S28.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "api:GET /api/artifacts/index", "file:apps/web/features/chat/utils/downloadArtifacts.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-08 Download and export

Save an artifact's source as a file, or on web download every artifact in the panel as one zip. Web, Mobile, CLI, VS Code and the Chrome side panel can save a single artifact; only web builds a zip. CSV-style content is made spreadsheet-safe before saving.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.24](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2824), [S28.25](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2825).

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

**What it does.** Lets a person take generated code or documents out of AGI as a file on their own device. On web it also bundles all artifacts of the open panel into artifacts.zip (apps/web/features/chat/utils/downloadArtifacts.ts:104-131,157-164).

**Why it exists.** To keep work portable and let it continue in other tools; the brief says the user can download the source and export a project archive (doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.24-S28.25).

**Who uses it.** Anyone who generated an artifact and wants the file; engineers who want the files in a folder.

**Problems it solves**

- Getting code out of a chat without copy and paste.
- Getting several artifacts at once.
- Spreadsheet formula injection when a model-chosen file is opened in a spreadsheet (apps/web/features/chat/utils/downloadArtifacts.ts:117).

**Use cases**

- Web: open an HTML artifact and choose 'Download as HTML'.
- Web: press 'Download all' to get artifacts.zip.
- Mobile: open the artifact full screen and press Download to share the .html or .tsx file.
- CLI: agi artifacts show <id> --out ./app.html.

## 2. User experience

**Where to find it**

- Web: artifact preview download menu with items 'Download as HTML', 'Download source (.<language>)', 'Download as Markdown', plus 'Download as CSV', 'Download as SVG', 'Download as PDF', 'Download as Word (.docx)' where they apply (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2386-2412).
- Web zip: artifacts panel button 'Download all' (aria-label 'Download all artifacts as zip'), shown only when the panel holds more than one artifact (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:732-749).
- Desktop: the public Desktop shows the hosted web app, so it uses the web controls (doc: AGENTS.md section 5). The internal Tauri build has 'Save a copy to the artifacts folder' (apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts, id save-copy).
- Mobile: full-screen artifact view button with accessibility label 'Download artifact' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1337-1339).
- CLI: agi artifacts show <id> --out <path> (apps/cli/src/lib.rs:1371-1387).
- VS Code: Artifacts list row actions 'Copy the content' and 'Save into the workspace' (apps/extension-vscode/src/features/surfaces/index.ts:97-107).
- Chrome: side panel artifact toolbar copy and download buttons, label 'Download $FILE$' (apps/extension/src/features/side-panel/artifactPanel.ts:500-506; apps/extension/_locales/en/messages.json:1370-1372).

**Before you start**

- An artifact exists in the chat or account.
- CLI and VS Code need a signed-in Cloud account: the CLI refuses a non-managed session (apps/cli/src/cloud/client.rs:361-373); VS Code shows a sign-in item when signed out (apps/extension-vscode/src/features/artifacts/artifactsTree.ts:100-105).
- Zip: more than one artifact in the panel.

**Screens and controls**

- Web download menu items and 'Download all' button.
- Mobile export sheet when more than one format exists (ArtifactFullScreen.tsx:686-700).
- CLI flags --out, --open, --copy, --json (apps/cli/src/lib.rs:1371-1387).
- VS Code save dialog titled 'Save "<title>" into the workspace' (apps/extension-vscode/src/features/artifacts/artifactActions.ts:192-195).

**Journey**

1. 1. Open the artifact.
2. 2. Choose the download or save control for your app.
3. 3. On web, the file is built in the browser and the browser saves it; for zip a toast says 'Preparing artifact download…' then 'Artifact download ready' (ArtifactsPanel.tsx:737-741).
4. 4. On mobile the file is made and the system share sheet opens (ArtifactFullScreen.tsx:686-722).
5. 5. In the CLI the path of the written file is printed.
6. 6. In VS Code a save dialog opens, the file is written and shown in the editor.

**What the person sees and gets**

- Web zip: toast error 'Could not download artifacts' on failure (ArtifactsPanel.tsx:741).
- Mobile: haptic on success; alert 'Download failed' on error (ArtifactFullScreen.tsx:723-727).
- CLI: prints the path, or JSON with id, path, opened (apps/cli/src/lib.rs:3954-3969).
- VS Code: messages such as 'the copy was not saved, ...' (artifactActions.ts:181,202).
- Chrome: status text from spArtifactsDownloaded or spArtifactsDownloadFailed (artifactPanel.ts:693-699).

**Settings**

- None found for download. The mobile code-wrap preference exists but concerns display (ArtifactFullScreen.tsx:637).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web single-file download of HTML, source, Markdown and more; source download runs through spreadsheet-safe export (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1381-1417).
- Web zip: createArtifactsZip builds in the browser with jszip, unique file names, spreadsheet-safe bodies, and fetches generated files with a 60 second timeout (apps/web/features/chat/utils/downloadArtifacts.ts:16,42-60,71-91,104-131).
- Web single downloads using the shared helper revoke the object URL after 60 seconds (apps/web/features/chat/utils/downloadArtifacts.ts:93-102). The artifact preview's own saveBlob revokes immediately (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1357-1365).
- Mobile export options by type: markdown, pdf, docx, text or source file (apps/mobile/src/features/chat/utils/artifactExport.ts:54-126), written then shared (artifactExport.ts:128-155).
- CLI writes content to a file or directory, can copy to clipboard or open the file in the default app (apps/cli/src/lib.rs:3910-3969).
- VS Code copy and save (apps/extension-vscode/src/features/artifacts/artifactActions.ts:138-208).
- Chrome downloads the artifact source with a spreadsheet-safe body (apps/extension/src/features/side-panel/artifactPanel.ts:381-386,693-699).
- Tauri desktop writes a copy under the app data folder (apps/desktop/src/features/artifacts/publishAdapter.ts:1-8).

**Incomplete**

- The web zip bundles the panel's artifacts as one flat file each, named artifacts.zip; it is not a folder tree of a project [inferred from apps/web/features/chat/utils/downloadArtifacts.ts:104-131].
- VS Code save writes through a save dialog whose default folder is the workspace but the user may choose any place (apps/extension-vscode/src/features/artifacts/artifactActions.ts:192-197).

**Present but disconnected or switched off**

- VS Code palette entries for these commands are hidden (when false); they are reached through the Artifacts list row actions (apps/extension-vscode/package.json menus commandPalette entries; apps/extension-vscode/src/features/surfaces/index.ts:97-107).

**Not available**

- Zip export on Mobile, CLI, VS Code and Chrome: not found in the code (apps/cli/src/lib.rs:1359-1430 has no zip option).
- The brief's CLI citations lib.rs:1034 and 1944 do not match; the command is agi artifacts show --out, there is no 'get' (apps/cli/src/lib.rs:1371-1387).

## 4. Required behaviour

**Established requirements**

- The user can download the app's source code. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.24)
- The user can export a whole multi-file project as an archive such as zip; the brief shows web and desktop done and mobile, CLI, VS Code missing, Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.25)
- Model-chosen CSV or TSV content gets formula neutralisation in single and zipped downloads. (source: apps/web/features/chat/utils/downloadArtifacts.ts:115-118)
- A file the agent removes or overwrites goes to Trash first; permanent loss needs a user action naming what is lost (relevant to saving over existing files). (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Web: with two or more artifacts, 'Download all' saves artifacts.zip containing one file per artifact with unique names.
2. Web: a CSV artifact whose cell starts with = is saved with the formula neutralised.
3. Web: a generated-file artifact is fetched and added to the zip; a failed fetch shows 'Could not download artifacts'.
4. Mobile: Download on an html artifact opens the share sheet with an .html file.
5. CLI: agi artifacts show <id> --out dir/ writes a file named after the artifact and prints its path.
6. VS Code: Save into the workspace with no folder open shows 'open a folder first, a copy needs somewhere to land.'
7. Chrome: the download button saves a file named from the title and type; disabled while the artifact is still streaming.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Zip on the other apps would reuse the same file naming and spreadsheet-safe export [inferred].
- Desktop 'done' in the brief reflects the web controls in Electron (doc: AGENTS.md section 5).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a project-level zip on Mobile, CLI and VS Code, or state that single-file save is the final scope.
- [proposed] Make saveBlob in ArtifactPreview use the shared 60 second revoke helper so both paths behave the same.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | downloadArtifacts | `apps/web/features/chat/utils/downloadArtifacts.ts` | File naming, zip building, browser download trigger, spreadsheet-safe export |
| component | ArtifactPreview download menu | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | handleDownload and the menu items |
| component | ArtifactsPanel Download all | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Zip button with toast |
| service | spreadsheetSafeExport | packages/ui/unified-chat/src/tabular (not found) (not found) | Neutralises spreadsheet formulas (imported as @agiworkforce/unified-chat/tabular) |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile download handler and export sheet |
| service | artifactExport | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Mobile export options and file writers |
| command | agi artifacts show | `apps/cli/src/lib.rs` | CLI subcommand definition and handler writing content to a file |
| service | cli cloud artifacts | `apps/cli/src/cloud/artifacts.rs` | CLI artifact list, content, file extension and output path helpers |
| command | saveArtifactToWorkspace and copyArtifact | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | VS Code save and copy |
| config | ARTIFACT_ROW_ACTIONS | `apps/extension-vscode/src/features/surfaces/index.ts` | Row buttons that call the VS Code commands |
| component | Chrome artifact panel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Copy and download buttons and artifactDownload |
| service | desktop publishAdapter | `apps/desktop/src/features/artifacts/publishAdapter.ts` | Tauri save-a-copy into the app data artifacts folder |
| hook | useDesktopArtifactActions | `apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts` | Tauri panel action 'Save a copy to the artifacts folder' |
| test | downloadArtifacts tests | `apps/web/features/chat/utils/downloadArtifacts.test.ts` | Zip and download helper tests |
| test | csv injection test | `apps/web/features/chat/utils/downloadArtifacts.csvInjection.test.ts` | Formula neutralisation in downloads |
| test | mobile export fidelity | `apps/mobile/__tests__/artifact-export-fidelity.test.ts` | Mobile export output |
| test | chrome artifact tests | `apps/extension/__tests__/side-panel-artifacts.test.ts` | Chrome download and copy |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web builds the file or zip in the browser from content already held in the page; generated files are fetched with the user's session. | device | apps/web/features/chat/utils/downloadArtifacts.ts:62-131 |
| The browser saves the blob through a temporary link. | device | apps/web/features/chat/utils/downloadArtifacts.ts:93-102 |
| Mobile writes the file on the phone and opens the share sheet. | device | apps/mobile/src/features/chat/utils/artifactExport.ts:128-155; ArtifactFullScreen.tsx:686-722 |
| CLI asks our servers for the artifact list and the source conversation, then writes the file locally. | device and our servers | apps/cli/src/lib.rs:3910-3969; apps/cli/src/cloud/artifacts.rs:385-450 |
| VS Code reads the source message from our servers, re-derives the artifact, then writes through the VS Code file system. | device and our servers | apps/extension-vscode/src/features/artifacts/artifactActions.ts:31-68,198-199 |
| Chrome builds the file from content already in the panel. | device | apps/extension/src/features/side-panel/artifactPanel.ts:381-386,693-699 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The saved file or zip | The user's download folder, share target, chosen path or workspace folder | No | Owned by the user; AGI does not track it |
| Temporary object URL | Browser memory | No | Revoked after 60 seconds in the shared helper (downloadArtifacts.ts:101) |

**Models and providers.** No model is involved in downloading.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Mobile and Chrome handle content already on the device; CLI and VS Code need a signed-in Cloud account (apps/cli/src/cloud/client.rs:361-380; apps/extension-vscode/src/features/artifacts/artifactsTree.ts:100-105). |
| Permissions | Generated-file fetches use same-origin credentials only for the app's own origin, otherwise none (apps/web/features/chat/utils/downloadArtifacts.ts:62-69). |
| Subscription | none found in the code for download. |
| Limits and metering | Generated file fetch times out after 60 seconds (apps/web/features/chat/utils/downloadArtifacts.ts:16,71-91). File name length capped at 180 characters (same file:23). No metering found. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Web, Mobile and Chrome download works from content on the device. Tauri Local desktop saves a copy locally (apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts). CLI refuses non-Cloud sessions for artifacts (apps/cli/src/cloud/client.rs:361-373). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Zip with one artifact | Button hidden | apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:732 |
| Duplicate file names | Second becomes 'name (2).ext' | apps/web/features/chat/utils/downloadArtifacts.ts:42-60 |
| Generated file fetch fails or times out | Error 'Could not download <file> (HTTP n)' or '(request timed out)' | apps/web/features/chat/utils/downloadArtifacts.ts:79-86 |
| Zip empty | downloadAllArtifacts returns without action | apps/web/features/chat/utils/downloadArtifacts.ts:160 |
| Mobile already downloading | Second press ignored | apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:686-687 |
| Chrome artifact still streaming | Copy and download disabled | apps/extension/src/features/side-panel/artifactPanel.ts:722-723 |
| VS Code artifact no longer produced by its message | Warning 'is indexed but its message no longer produces it, so there is nothing to save.' | apps/extension-vscode/src/features/artifacts/artifactActions.ts:185-190 |
| Offline, cancel and retry | not handled in the code beyond the errors above | apps/web/features/chat/utils/downloadArtifacts.ts:71-91 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/utils/downloadArtifacts.test.ts`: Zip and download helpers; titles not read
- `apps/web/features/chat/utils/downloadArtifacts.csvInjection.test.ts`: Spreadsheet-safe export in downloads; titles not read
- `apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx`: CSV neutralisation in the preview; titles not read
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Mobile export fidelity; titles not read
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Includes 'names the file from the title and the artifact type', 'saves the artifact source, not the rendered page', and 'copies and downloads the open artifact'
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Includes 're-derives content from the source message under the indexed id' and paging to the source message
- `apps/desktop/src/features/artifacts/__tests__/publishAdapter.csvInjection.test.ts`: Tauri save-a-copy formula safety; titles not read

**Test scenarios**

- **Zip two artifacts**
  1. In web chat, ask for two files so the panel holds two artifacts.
  2. Press 'Download all'.
  - Expected: artifacts.zip downloads with two uniquely named files; toast 'Artifact download ready'.
- **Formula safety**
  1. Create a CSV artifact with a cell =1+1.
  2. Use 'Download source (.csv)'.
  - Expected: The saved cell does not start as a live formula.
- **Mobile share**
  1. Open an html artifact full screen on a phone.
  2. Press Download.
  - Expected: System share sheet offers an .html file.
- **CLI write**
  1. Run agi artifacts list.
  2. Run agi artifacts show <id> --out ./out/.
  - Expected: A file is created in ./out/ and its path printed.
- **VS Code no folder**
  1. Open VS Code with no folder.
  2. Press the save row action on an artifact.
  - Expected: Warning asks to open a folder first; nothing written.
- **No zip elsewhere**
  1. Look for a zip option in Mobile, CLI, VS Code, Chrome.
  - Expected: None is offered.

**Where to look when it fails**

- Web error text 'Could not download <file> (HTTP n)' (apps/web/features/chat/utils/downloadArtifacts.ts:80).
- CLI error 'Could not copy to the clipboard' (apps/cli/src/lib.rs, show handler).
- VS Code messages beginning 'Code: the copy was not saved' (artifactActions.ts:181,202).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)
- Mobile: [70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md)
- CLI: [70-qa/test-plans/cli/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/cli/028-code-canvas-and-application-preview.md)
- VS Code: [70-qa/test-plans/vscode/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/vscode/028-code-canvas-and-application-preview.md)
- Chrome: [70-qa/test-plans/chrome/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/chrome/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **No zip or project archive on Mobile, CLI, VS Code; Chrome unverified in the brief but no zip found.** Affects: Mobile, CLI, VS Code, Chrome users. Evidence: doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.25; apps/cli/src/lib.rs:1359-1430. Work needed: Decide scope and add a per-surface archive or document the limit.
- **The zip is a flat bundle of the panel's artifacts, not a project folder tree.** Affects: Web users expecting a project layout. Evidence: apps/web/features/chat/utils/downloadArtifacts.ts:104-131. Work needed: Add folder structure if a multi-file project concept is introduced (the brief's S28.02 multi-file tree is missing on web).
- **Two different object-URL lifetimes on web (immediate in ArtifactPreview, 60 seconds in the helper).** Affects: Web users with slow saves. Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1357-1365; apps/web/features/chat/utils/downloadArtifacts.ts:101. Work needed: Use the one helper.
- **Brief says Chrome 'unverified'; code shows copy and download exist.** Affects: Documentation. Evidence: apps/extension/src/features/side-panel/artifactPanel.ts:381-386,693-699. Work needed: Update the brief status.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- api:GET /api/artifacts/index
- file:apps/web/features/chat/utils/downloadArtifacts.ts

## Unknown

- What the web and mobile download tests assert beyond their file names.
- Whether the Electron Desktop adds any native save dialog beyond the web behaviour.
- Whether Chrome should show a zip; the brief says unverified.

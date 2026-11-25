---
id: "F028-09"
type: "feature"
title: "Open in a coding workspace"
aliases: ["Save Artifact into Workspace", "Open in coding workspace", "S28.26"]
area: "28 Code Canvas and application preview"
available_on: ["cli", "vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S28.26"]
depends_on: ["surface:vscode", "surface:cli", "mode:cloud", "SYS-authentication-and-identity", "SYS-files-artifacts-and-storage", "F028-08", "api:GET /api/artifacts/index"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-09 Open in a coding workspace

Take generated code into a real coding tool. VS Code can save an artifact into a folder with a save dialog. The CLI can write an artifact to a file and open it in the computer's default app. Web, Desktop, Mobile and Chrome have no hand-off to a coding workspace.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.26](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2826).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** VS Code reads an artifact from the account and writes it into a folder the user chooses, then opens it (apps/extension-vscode/src/features/artifacts/artifactActions.ts:163-208). The CLI writes it to a path, optionally opening it with the default app (apps/cli/src/lib.rs:3910-3969).

**Why it exists.** The brief wants generated code to be openable in a real coding workspace to keep developing it (doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.26).

**Who uses it.** Developers who start an app in chat and finish it in an editor or terminal.

**Problems it solves**

- Moving generated code from chat into a project folder without copy and paste.

**Use cases**

- In VS Code, press the save icon on an artifact and place it in the repo.
- In a terminal, run agi artifacts show <id> --out ./src/ then edit it.

## 2. User experience

**Where to find it**

- VS Code: Artifacts list in the AGI Code sidebar; row action 'Save into the workspace'; command title 'Code: Save Artifact into Workspace' (apps/extension-vscode/src/features/surfaces/index.ts:103-107; apps/extension-vscode/package.json command list). The command is hidden from the palette.
- CLI: agi artifacts show <id> --out <path> [--open]; agi artifacts open <id> opens a browser page (apps/cli/src/lib.rs:1371-1397).
- Web, Desktop, Mobile, Chrome: none found. The web preview has 'Duplicate' (a copy inside AGI) and 'Start Work', whose target was not established (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2503-2530).

**Before you start**

- Signed-in Cloud account (VS Code sign-in item when signed out: apps/extension-vscode/src/features/artifacts/artifactsTree.ts:100-105; CLI: apps/cli/src/cloud/client.rs:361-380).
- VS Code: a folder open (artifactActions.ts:167-172).

**Screens and controls**

- VS Code save dialog 'Save "<title>" into the workspace' with the workspace folder as the default location (artifactActions.ts:192-195).
- CLI flags --out, --open, --copy (lib.rs:1371-1387).

**Journey**

1. 1. List artifacts (VS Code sidebar or agi artifacts list).
2. 2. Choose Save into the workspace, or run show --out.
3. 3. Pick or confirm the target path.
4. 4. The file is written; VS Code opens it in an editor; the CLI prints the path and can open the default app.

**What the person sees and gets**

- VS Code warning 'open a folder first, a copy needs somewhere to land.' with no folder (artifactActions.ts:167-172).
- CLI prints the written path or 'could not open it automatically' (lib.rs:3956-3966).

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- VS Code save with dialog, write and open (artifactActions.ts:163-208).
- CLI show --out writes the file, creates parent folders and can open it (apps/cli/src/lib.rs:3948-3969).

**Incomplete**

- CLI 'open in workspace' is only the nearest fit: the artifacts open command opens a browser page, not a workspace (apps/cli/src/lib.rs:3971-3994) [inferred].
- The save dialog lets the user choose any location, not only the workspace (artifactActions.ts:192-197).

**Present but disconnected or switched off**

- VS Code commands are hidden from the palette and used through row actions (apps/extension-vscode/src/features/surfaces/index.ts:97-107).

**Not available**

- Web, Desktop, Mobile, Chrome: no hand-off to a coding workspace found in the code read.
- The brief's citations lib.rs:1034 and 1944 do not match the CLI code; the real code is at lib.rs:1371-1397 and 3910-3994.

## 4. Required behaviour

**Established requirements**

- Generated code can be opened in a real coding workspace; brief shows CLI and VS Code done, web, desktop, mobile and chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.26)
- VS Code refuses the save when no folder is open, with a warning. (source: apps/extension-vscode/src/features/artifacts/artifactActions.ts:167-172)

**Acceptance criteria**

1. VS Code with no folder: warning, nothing written.
2. VS Code with a folder: save dialog defaults to the workspace folder; after confirming, the file exists and opens.
3. VS Code with an artifact whose message no longer produces it: warning, nothing written.
4. CLI show --out dir/ writes a file with the artifact's extension; --open launches the default app.
5. CLI while signed out or in a non-Cloud session: refuses with a clear error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI is counted done because its working directory is the workspace [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether the web should offer 'Open in VS Code' or 'Copy CLI command' and add a deep link.
- [proposed] Make VS Code refuse targets outside the workspace folder, or state that they are allowed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Reads content, shows save dialog, writes and opens the file |
| command | command registration | `apps/extension-vscode/src/core/commandSetup.ts` | Registers the save, copy and open-on-web commands |
| config | ARTIFACT_ROW_ACTIONS | `apps/extension-vscode/src/features/surfaces/index.ts` | Row action 'Save into the workspace' |
| config | VS Code contributes | `apps/extension-vscode/package.json` | Declares the command and hides it from the palette |
| component | ArtifactsTreeProvider | `apps/extension-vscode/src/features/artifacts/artifactsTree.ts` | Lists artifacts, shows sign-in item |
| service | artifactsClient | `apps/extension-vscode/src/features/artifacts/artifactsClient.ts` | Reads the artifact index and published list |
| command | agi artifacts show and open | `apps/cli/src/lib.rs` | CLI write-to-file and open-in-browser handlers |
| service | cli cloud artifacts | `apps/cli/src/cloud/artifacts.rs` | output_path, file_extension, browse_url helpers |
| service | CloudClient connect | `apps/cli/src/cloud/client.rs` | Admits only managed Cloud sessions |
| test | vscode artifacts tests | `apps/extension-vscode/src/__tests__/artifactsView.test.ts` | Tree, content derivation, language mapping |
| test | cli parse test | `apps/cli/src/lib.rs` | the_artifact_commands_parse test covers command parsing (apps/cli/src/lib.rs:10145-10155) |
| component | web Duplicate action | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Copies an artifact inside AGI; not a workspace hand-off |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| VS Code asks our servers for the conversation page that holds the source message, re-derives the artifact under its id. | our servers | apps/extension-vscode/src/features/artifacts/artifactActions.ts:31-68 |
| VS Code shows a save dialog and writes the file through the editor's file system, then opens it. | device | apps/extension-vscode/src/features/artifacts/artifactActions.ts:192-207 |
| CLI resolves the id, fetches the content from the account, writes the file locally. | device and our servers | apps/cli/src/lib.rs:3917-3969 |
| CLI --open launches the default application for the file. | device | apps/cli/src/lib.rs:3955-3956 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The saved source file | The chosen folder on the user's machine | No | Owned by the user; no AGI tracking found |
| Read-only virtual document for opening in VS Code | Editor memory under scheme agi-artifact | No | Cleared by the content provider (artifactActions.ts:70-98) |

**Models and providers.** No model is involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account for VS Code and CLI. |
| Permissions | Writes only where the user chooses; VS Code uses the editor's file system. |
| Subscription | none found in the code. |
| Limits and metering | VS Code pages through conversation messages: 500 per page, at most 100 pages (artifactActions.ts:22-23). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Local and own-key sessions cannot list account artifacts in the CLI (apps/cli/src/cloud/client.rs:361-373). VS Code shows a sign-in item when signed out (artifactsTree.ts:100-105). Whether VS Code Local mode behaves the same: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No folder open (VS Code) | Warning and stop | artifactActions.ts:167-172 |
| Save dialog cancelled | Nothing written | artifactActions.ts:196 |
| Write fails | Error message 'the copy was not saved, ...' | artifactActions.ts:198-205 |
| Source message long history | Fails rather than claim exhaustion after 100 pages | artifactActions.ts:47-49; apps/extension-vscode/src/__tests__/artifactsView.test.ts:269 |
| CLI cannot open the file | Prints the path with '(could not open it automatically)' | apps/cli/src/lib.rs:3956-3962 |
| Offline or retry | not handled in the code beyond error messages | artifactActions.ts:179-184 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Tree mapping, sign-in prompt, content re-derivation, paging, editor language and file name
- `apps/cli/src/lib.rs`: the_artifact_commands_parse checks that show, open, publish, unpublish parse (lines 10145-10155)
- `apps/cli/src/cloud/artifacts.rs`: Route paths and helpers in its test module (lines 715 onward); titles not read

**Test scenarios**

- **VS Code save**
  1. Sign in, open a folder.
  2. Select an artifact and press 'Save into the workspace'.
  3. Accept the default path.
  - Expected: File written in the folder and opened in an editor.
- **VS Code no folder**
  1. Close the folder.
  2. Press the same action.
  - Expected: Warning asks to open a folder; nothing is written.
- **CLI write and open**
  1. agi artifacts show <id> --out ./x.html --open
  - Expected: File written, default app opens it, path printed.
- **Web has no hand-off**
  1. Open an artifact on web and search the menus for a workspace or editor action.
  - Expected: Only Duplicate and Start Work appear; no hand-off to an editor.

**Where to look when it fails**

- VS Code warning texts in artifactActions.ts:125-130,151-156,185-190.
- CLI error 'Could not copy to the clipboard' when --copy fails (apps/cli/src/lib.rs show handler).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/cli/028-code-canvas-and-application-preview.md)
- VS Code: [70-qa/test-plans/vscode/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/vscode/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **No hand-off from web, desktop, mobile or Chrome.** Affects: Web, Desktop, Mobile, Chrome users. Evidence: doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.26. Work needed: Choose a design such as a deep link to the editor or a CLI command, then build it.
- **The CLI 'done' status rests on file writing; artifacts open opens a browser.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:3971-3994. Work needed: Confirm acceptance with the owner.
- **The brief's line citations for the CLI and VS Code point to the wrong lines (lib.rs:1034, 1944; package.json:593).** Affects: Documentation. Evidence: apps/cli/src/lib.rs:1371-1397. Work needed: Refresh the brief citations.
- **What 'Start Work' on a web artifact does was not read; it may relate to coding sessions.** Affects: Web users. Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2518-2530. Work needed: Read the start-work flow and record it.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:vscode
- surface:cli
- mode:cloud
- SYS-authentication-and-identity
- SYS-files-artifacts-and-storage
- F028-08
- api:GET /api/artifacts/index

## Unknown

- What 'Start Work' on a web artifact opens.
- How VS Code behaves in Local mode for artifacts.
- Whether the VS Code row actions show in the installed UI as designed; the code defines them but no UI run is recorded.

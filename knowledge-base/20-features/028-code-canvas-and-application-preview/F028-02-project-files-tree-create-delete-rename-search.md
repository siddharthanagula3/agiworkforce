---
id: "F028-02"
type: "feature"
title: "Project files: tree, create, delete, rename, search"
aliases: ["Project file tree", "Multi-file project", "File create, delete, rename", "Search across generated files", "S28.02", "S28.03", "S28.04", "S28.08", "Artifacts tree (VS Code)"]
area: "28 Code Canvas and application preview"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S28.02", "S28.03", "S28.04", "S28.08"]
depends_on: ["surface:vscode", "surface:web", "surface:cli", "mode:cloud", "api:GET /api/artifacts/index", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-authentication-and-identity", "file:apps/extension-vscode/src/features/artifacts/artifactsTree.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-02 Project files: tree, create, delete, rename, search

The brief wants a browsable tree of a generated project's files with create, delete, rename and search. No app has this for generated projects. Artifacts are single text blocks. VS Code shows a flat list of cloud artifacts, and its own file explorer works only after an artifact is saved into the workspace.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.02](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2802), [S28.03](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2803), [S28.04](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2804), [S28.08](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2808).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would show a generated multi-file project as a tree and let the person add, delete, rename and search files inside it. In the code today, an artifact is one block of content, so there is no project tree to show.

**Why it exists.** Real apps have several files. The brief (S28.02 to S28.04, S28.08) asks for a tree and file operations so a generated project can be worked on like a normal code project.

**Who uses it.** Developers who want a model to build whole apps, not single pages.

**Problems it solves**

- Browsing a project made of many files
- Reorganising generated files
- Finding text across files

**Use cases**

- Open a generated React project and see src/App.tsx, src/index.css in a tree (not built).
- Rename a generated file before download (not built).
- Save a single artifact into a VS Code workspace and use VS Code's own explorer and search on it (works through VS Code, not through this feature).

## 2. User experience

**Where to find it**

- VS Code: sidebar tree of artifacts, commands 'Code: Show Artifacts', 'Code: Refresh Artifacts', 'Code: Open Artifact', 'Code: Save Artifact into Workspace' (apps/extension-vscode/package.json:689-719). This tree lists artifacts, one row per artifact, not files.
- Web, Desktop, Mobile, Chrome, CLI: no file tree found.
- Web 'Rename' changes the artifact title only (ArtifactPreview.tsx:2570 area, ArtifactTitleField).

**Before you start**

- VS Code: signed in to AGI Cloud, otherwise the tree shows 'Sign in to see your artifacts' (artifactsTree.ts:99-110).
- A folder open in VS Code before 'Save Artifact into Workspace' (artifactActions.ts:163-170).

**Screens and controls**

- VS Code artifacts tree items with no children (getChildren returns [] for an element, artifactsTree.ts:96-98).
- VS Code save dialog 'Save "<title>" into the workspace' (artifactActions.ts:196).

**Journey**

1. Sign in to AGI Cloud in VS Code.
2. Open the artifacts view; the tree lists artifacts.
3. Run 'Code: Save Artifact into Workspace' and pick a path.
4. From there, VS Code's own explorer, rename, delete and search apply to the saved file; the extension adds nothing.

**What the person sees and gets**

- Notice rows: 'Artifacts could not be loaded' with Retry, 'No artifacts yet' (artifactsTree.ts:111-135).
- Warning 'open a folder first, a copy needs somewhere to land.' (artifactActions.ts:168).

**Settings**

- Auto refresh of the VS Code artifacts list (setAutoRefreshEnabled, artifactsTree.ts:82); exact setting name unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- VS Code lists account artifacts and saves one into the workspace as a file (artifactsTree.ts:96-150; artifactActions.ts:163-215).
- Web renames the artifact title through renameArtifact (artifacts-store.ts:955; ArtifactPreview.rename.test.tsx).

**Incomplete**

- Multi-file output is only partly modelled: web and mobile recognise a 'generated file manifest' (hasGeneratedFileManifest, ArtifactFullScreen.tsx:880; artifactManifest, artifacts-store.ts:743) but this is for files produced by tools, not an editable project tree. Detail not read.

**Present but disconnected or switched off**

- None found.

**Not available**

- File tree, create, delete, rename and search of a project's files on Web, Desktop, Mobile, Chrome and CLI (no component found).
- The brief's VS Code lines (package.json:74, extension.ts:50, diffDecorationProvider.ts:335-346) are a settings list, an import and diff-proposal code; they do not implement a project tree. The brief's 'done' for VS Code is contradicted by the cited code.

## 4. Required behaviour

**Established requirements**

- A multi-file project is shown as a browsable file tree (S28.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.02)
- The user can create and delete files in the generated project (S28.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.03)
- The user can rename files in the generated project (S28.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.04)
- The user can search across all generated files (S28.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.08)
- An action the user cannot undo asks first and names the consequence; files an agent removes go to Trash first. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A project artifact with three files shows three rows in a tree on web.
2. Creating a file adds a row and a new version of the project.
3. Deleting a file asks first, names what is lost, and can be undone through version restore.
4. Renaming a file keeps its content and updates the project version.
5. Searching a word lists each file and line that contains it.
6. Renaming the artifact title is a separate control and does not touch file names.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A project artifact needs a data shape holding several files; none was found in the artifact types read [inferred from artifacts.ts and the single content field].
- Delete must use useConfirmAction [inferred from AGENTS.md section 9].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Define a project artifact type with a file list, then build the tree once in packages/ui/unified-chat for web and desktop.
- [proposed] Re-state the VS Code status as 'uses the host editor' rather than 'done'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactsTreeProvider | `apps/extension-vscode/src/features/artifacts/artifactsTree.ts` | Flat list of account artifacts in VS Code |
| command | openArtifactReadOnly | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Opens one artifact read-only |
| command | saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Writes one artifact into a folder; later file operations are VS Code's own |
| service | artifactsClient | `apps/extension-vscode/src/features/artifacts/artifactsClient.ts` | Reads the hosted artifact index |
| config | VS Code artifact commands | `apps/extension-vscode/package.json` | Declares Code: Show Artifacts and the other artifact commands (lines 689-719) |
| store | renameArtifact | `apps/web/features/chat/stores/artifacts-store.ts` | Renames the artifact title only (line 955) |
| component | ArtifactTitleField | `apps/web/features/chat/components/artifacts/ArtifactTitleField.tsx` | Title editing control on web |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Lists artifacts of a conversation; export of many artifacts (not a file tree) |
| other | downloadArtifacts | `apps/web/features/chat/utils/downloadArtifacts.ts` | Names and bundles downloaded artifact files |
| endpoint | artifact index | `apps/web/app/api/artifacts/index/route.ts` | Hosted account-wide artifact list the VS Code and CLI lists read |
| command | agi artifacts list | `apps/cli/src/lib.rs` | CLI list of artifacts (handle_artifacts_command, line 3850) |
| service | cloud artifacts (CLI) | `apps/cli/src/cloud/artifacts.rs` | CLI hosted artifact index and publish client |
| test | ArtifactPreview.rename.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.rename.test.tsx` | Title rename |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| VS Code asks the hosted artifact index for the list and shows one row per artifact. | our servers | apps/extension-vscode/src/features/artifacts/artifactsTree.ts:96-150; apps/web/app/api/artifacts/index/route.ts |
| Save into Workspace reads the artifact text and writes a file with VS Code's file API. | device | apps/extension-vscode/src/features/artifacts/artifactActions.ts:163-215 |
| File rename, delete and search then run inside VS Code on the saved files. | device | [inferred] these are host editor features, not extension code |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact index rows (metadata only) | Hosted store behind the artifact index route; content is re-derived from the chat message (apps/cli/src/cloud/artifacts.rs:1-12) | Hosted, shared across apps | unknown |
| Saved workspace file | The person's folder on disk | No | Owned by the person; the extension does not delete it |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | VS Code and CLI need an AGI Cloud account (artifactsTree.ts:99-110; apps/cli/src/lib.rs:3850). |
| Permissions | VS Code asks for a save location through the host dialog; nothing else found. |
| Subscription | none found in the code for listing or saving. |
| Limits and metering | List page limit ARTIFACTS_PAGE_LIMIT in VS Code and DEFAULT_ARTIFACT_LIMIT 50 in the CLI (apps/cli/src/cloud/artifacts.rs:30). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | The VS Code tree and the CLI list read hosted artifacts, so they need a cloud sign-in and network. Local-only artifacts on web or mobile have no tree at all. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out (VS Code) | Row 'Sign in to see your artifacts' runs the sign-in command. | artifactsTree.ts:99-110 |
| List failed | Row 'Artifacts could not be loaded' with a Retry command. | artifactsTree.ts:111-122 |
| No artifacts | Row 'No artifacts yet' with an explanation. | artifactsTree.ts:124-135 |
| No folder open | Warning asks the person to open a folder before saving. | artifactActions.ts:163-170 |
| Message no longer produces the artifact | Warning that it is indexed but there is nothing to show. | artifactActions.ts:117-122 |
| File tree on any app | not handled in the code; no tree exists. | searched apps/web/features/chat, packages/ui/unified-chat/src, apps/mobile/src/features/chat for tree or multi-file code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.rename.test.tsx`: Renaming the artifact title
- `apps/cli/src/cloud/artifacts.rs`: Rust unit tests inside the module pin the id derivation vectors (module comment, lines 1-12); other cases unknown

**Test scenarios**

- **VS Code tree lists artifacts**
  1. Sign in
  2. Run Code: Show Artifacts
  - Expected: One row per artifact, none expandable.
- **Save into workspace**
  1. Open a folder
  2. Right-click an artifact, Save Artifact into Workspace
  3. Choose a path
  - Expected: File written with the artifact text and opened in an editor.
- **Signed-out tree**
  1. Sign out
  2. Open the view
  - Expected: Sign-in row appears.
- **Web has no tree**
  1. Open a multi-block answer on web
  2. Look in the side panel
  - Expected: Artifacts are listed as separate items; no file tree, no create, delete or search of files.
- **Title rename is not file rename**
  1. Open an artifact on web
  2. Edit its title
  - Expected: Only the title changes; downloaded file name follows the title.

**Where to look when it fails**

- VS Code error notifications prefixed with the product name 'Code:'.
- CLI exit output of agi artifacts list.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No project data shape or file tree exists** Affects: All apps. Evidence: No tree component found; brief S28.02. Work needed: Define a multi-file artifact model, then build tree, create, delete, rename, search.
- **Brief marks VS Code done, but the cited lines are unrelated** Affects: Planning. Evidence: apps/extension-vscode/package.json:74 (settings list); src/extension.ts:50 (an import); diffDecorationProvider.ts:335-346 (diff proposal text). Work needed: Correct the brief; record VS Code as 'host editor only'.
- **Delete and rename would need confirm and undo** Affects: Any future build. Evidence: AGENTS.md section 9. Work needed: Use useConfirmAction and version restore.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:vscode
- surface:web
- surface:cli
- mode:cloud
- api:GET /api/artifacts/index
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-authentication-and-identity
- file:apps/extension-vscode/src/features/artifacts/artifactsTree.ts

## Unknown

- Whether the generated-file manifest on web and mobile could carry multiple editable files (not read).
- The exact VS Code setting name for artifact auto refresh.
- Whether Chrome has any tree: no code found.

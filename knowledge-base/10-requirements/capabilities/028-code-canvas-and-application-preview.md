---
id: "REQ-AREA-028"
type: "requirements"
title: "Requirement items: Code Canvas and application preview"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 28. Code Canvas and application preview

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S28.01

**Editable code source.** Generated code opens in an editable source view where the user can change it and keep the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code done, Chrome unverified
- Feature: [F028-01 Edit the generated source](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Competitor trace: CAP-artifacts-and-documents-25

## S28.02

**Multi-file project tree.** A multi-file project is shown as a browsable file tree.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code done, Chrome unverified
- Feature: [F028-02 Project files: tree, create, delete, rename, search](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)

## S28.03

**File creation and deletion.** The user can create and delete files in the generated project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome missing
- Feature: [F028-02 Project files: tree, create, delete, rename, search](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)

## S28.04

**File rename.** The user can rename files in the generated project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F028-02 Project files: tree, create, delete, rename, search](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)

## S28.05

**Language-aware editing.** The code editor is language-aware (syntax highlighting, indentation, brackets) while editing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome missing
- Feature: [F028-01 Edit the generated source](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Competitor trace: CAP-artifacts-and-documents-25

## S28.06

**Syntax diagnostics.** The code editor shows syntax errors and diagnostics inline.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome missing
- Feature: [F028-01 Edit the generated source](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Competitor trace: CAP-artifacts-and-documents-25

## S28.07

**Code completion where offered.** The code editor offers code completion (where the product offers it).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-01 Edit the generated source](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)

## S28.08

**Search across generated files.** The user can search across all the generated files of a project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome missing
- Feature: [F028-02 Project files: tree, create, delete, rename, search](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)

## S28.09

**Source/preview split view.** Source and preview can be shown side by side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome unverified
- Feature: [F028-03 Preview view options](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)

## S28.10

**HTML preview.** HTML artifacts render as a live, interactive preview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, Chrome unverified
- Feature: [F028-03 Preview view options](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S28.11

**React or supported framework preview.** React (or other supported framework) components render as a live preview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, Chrome unverified
- Feature: [F028-03 Preview view options](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S28.12

**Responsive preview sizes.** The preview can be switched between device sizes (phone, tablet, desktop).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-03 Preview view options](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)

## S28.13

**Preview theme selection.** The preview can be switched between light and dark themes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-03 Preview view options](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)

## S28.14

**Element-selection editing.** The user can click an element in the preview to select it and ask for an edit to that element.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-04 Element picking for edit requests](../../20-features/028-code-canvas-and-application-preview/F028-04-element-picking-for-edit-requests.md)

## S28.15

**Console panel.** A console panel shows the preview's logs and errors.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-05 Preview errors and reload](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)

## S28.16

**Runtime-error overlay.** Runtime errors in the preview appear as an overlay with a way to recover.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F028-05 Preview errors and reload](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Competitor trace: CAP-artifacts-and-documents-02, CAP-artifacts-and-documents-19

## S28.17

**Dependency-installation panel.** A panel shows and manages the dependencies/packages the app installs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-06 App dependencies, network and secrets](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)

## S28.18

**Preview reload.** The user can reload the preview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F028-05 Preview errors and reload](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S28.19

**Restart runtime.** The user can restart the app's runtime from a clean state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F028-05 Preview errors and reload](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S28.20

**Network-permission controls.** The user can see and control which network destinations an app may reach.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-06 App dependencies, network and secrets](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)

## S28.21

**Secret/configuration placeholders.** Apps can declare secrets/config values as placeholders the user fills in without exposing them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-06 App dependencies, network and secrets](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)

## S28.22

**AI-backed app behavior through a brokered API.** An app can call AI through a brokered product API instead of embedding keys.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-07 AI and saved data inside a published app](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Competitor trace: CAP-artifacts-and-documents-17

## S28.23

**App-local storage or database configuration.** An app can be given persistent local storage or a database, configured by the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-07 AI and saved data inside a published app](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Competitor trace: CAP-artifacts-and-documents-17

## S28.24

**Download source.** The user can download the app's source code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F028-08 Download and export](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Competitor trace: CAP-artifacts-and-documents-24

## S28.25

**Export project archive.** The user can export a whole multi-file project as an archive (e.g. zip).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F028-08 Download and export](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)

## S28.26

**Open in coding workspace.** Generated code can be opened in a real coding workspace to keep developing it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F028-09 Open in a coding workspace](../../20-features/028-code-canvas-and-application-preview/F028-09-open-in-a-coding-workspace.md)

## S28.27

**Publish preview.** The user can publish the app to a shareable preview link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome unverified
- Feature: [F028-10 Publish a preview link](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Competitor trace: CAP-artifacts-and-documents-15, CAP-artifacts-and-documents-24

## S28.28

**Publish production version.** The user can publish a separate production version (stable URL or domain) distinct from previews.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code missing, Chrome unverified
- Feature: [F028-10 Publish a preview link](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)

## S28.29

**Version comparison.** The user can compare two versions of the app's code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F028-11 Version history: compare and roll back](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S28.30

**Rollback.** The user can roll the app back to an earlier version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F028-11 Version history: compare and roll back](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S28.31

**Fork/copy another shared creation.** From someone else's shared creation, the user can make their own copy to keep editing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F028-12 Shared apps: fork and viewer sign-in](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)

## S28.32

**Viewer-specific authentication for connected apps.** A viewer of a shared app can authenticate their own accounts for the app's connected services.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F028-12 Shared apps: fork and viewer sign-in](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)
- Competitor trace: CAP-artifacts-and-documents-18

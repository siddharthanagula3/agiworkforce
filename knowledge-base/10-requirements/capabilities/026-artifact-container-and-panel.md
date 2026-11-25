---
id: "REQ-AREA-026"
type: "requirements"
title: "Requirement items: Artifact container and panel"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 26. Artifact container and panel

40 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S26.01

**Artifact launch card inside chat.** An assistant reply that produces an artifact shows a card in the transcript; activating it opens that artifact.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F026-01 Artifact cards in chat, opening, closing, reopening](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Competitor trace: CAP-artifacts-and-documents-01

## S26.02

**Artifact title.** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-01 Artifact cards in chat, opening, closing, reopening](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Competitor trace: CAP-artifacts-and-documents-24

## S26.03

**Artifact type.** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-01 Artifact cards in chat, opening, closing, reopening](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)

## S26.04

**Artifact status.** The artifact shows its lifecycle state: being written, finished, stopped before it finished, or failed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F026-02 Lifecycle state, live updates, error and recovery panels](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)

## S26.05

**Open artifact.** User can open an artifact from the chat or from an artifact list into a view that shows its content.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-01 Artifact cards in chat, opening, closing, reopening](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Competitor trace: CAP-artifacts-and-documents-01, CAP-artifacts-and-documents-24

## S26.06

**Close artifact without deleting it.** Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome unverified
- Feature: [F026-01 Artifact cards in chat, opening, closing, reopening](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)

## S26.07

**Reopen artifact.** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-01 Artifact cards in chat, opening, closing, reopening](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)

## S26.08

**Docked side panel.** The artifact opens in a panel docked beside the conversation, so both are visible at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Competitor trace: CAP-artifacts-and-documents-01

## S26.09

**Resizable panel.** The user can change the width of the docked artifact panel (pointer drag or keyboard), and the width is kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Competitor trace: CAP-artifacts-and-documents-01

## S26.10

**Full-screen artifact.** The user can expand any open artifact to fill the screen and return from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Competitor trace: CAP-artifacts-and-documents-01

## S26.11

**Detached artifact window where supported.** Where the platform allows it, the artifact can be popped out into its own window or tab that shows the rendered artifact.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)

## S26.12

**Multiple-artifact switching.** When a conversation has several artifacts, the user can switch between them without leaving the viewer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Competitor trace: CAP-artifacts-and-documents-01

## S26.13

**Artifact tabs.** The open artifacts of a conversation are shown as tabs in the viewer, one per artifact, including one being written.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Competitor trace: CAP-artifacts-and-documents-01

## S26.14

**Source/preview toggle.** For a renderable artifact the user can switch between the rendered preview and its source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F026-04 Preview, source view and read-only mode](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S26.15

**Direct-edit mode.** The user can edit an artifact's content directly in the viewer and save it as a new version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-04 Preview, source view and read-only mode](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)

## S26.16

**Read-only mode.** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-04 Preview, source view and read-only mode](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Competitor trace: CAP-sharing-and-collaboration-11, CAP-sharing-and-collaboration-12

## S26.17

**Selection-based edit request.** The user selects part of an artifact and asks the assistant to change just that part, and the artifact is revised.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F026-09 Edit requests: selection, comments, collected requests (not built per brief)](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Competitor trace: CAP-artifacts-and-documents-04

## S26.18

**Inline comments.** The user can attach comments to specific places in an artifact and see them inline.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F026-09 Edit requests: selection, comments, collected requests (not built per brief)](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Competitor trace: CAP-artifacts-and-documents-05, CAP-sharing-and-collaboration-14

## S26.19

**Pending edit-request collection.** Several requested changes to an artifact can be collected (e.g. from comments or selections) and sent to the assistant together.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F026-09 Edit requests: selection, comments, collected requests (not built per brief)](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Competitor trace: CAP-artifacts-and-documents-04, CAP-sharing-and-collaboration-14

## S26.20

**Version selector.** The viewer shows which version of the artifact is displayed and lets the user pick any other version directly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-05 Versions: pick, step, compare, restore](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S26.21

**Previous/next version.** The user can step to the previous and next version of an artifact and see which version is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-05 Versions: pick, step, compare, restore](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S26.22

**Compare versions.** The user can compare two versions of an artifact and see what changed between them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F026-05 Versions: pick, step, compare, restore](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S26.23

**Restore version.** The user can restore an earlier version so it becomes the current one, without losing the versions in between.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-05 Versions: pick, step, compare, restore](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S26.24

**Duplicate artifact.** The user can duplicate an artifact into an independent copy that can change without touching the original.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-08 Library, projects, copies, and handoff to another chat](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)

## S26.25

**Rename artifact.** The user can rename an artifact, and the new title shows wherever the artifact is listed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F026-08 Library, projects, copies, and handoff to another chat](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)

## S26.26

**Save to Library.** The user can save an artifact into their Library so it lives with their other files outside the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-08 Library, projects, copies, and handoff to another chat](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Competitor trace: CAP-artifacts-and-documents-23

## S26.27

**Associate with Project.** From the artifact viewer the user can attach the artifact to a chosen project, and it then shows up in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome unverified
- Feature: [F026-08 Library, projects, copies, and handoff to another chat](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)

## S26.28

**Continue from another chat.** The user can take an existing artifact into a different (e.g. new) chat and keep working on it there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F026-08 Library, projects, copies, and handoff to another chat](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)

## S26.29

**Export menu.** The artifact viewer offers a menu of export formats and each choice saves a file in that format.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F026-06 Copy and export](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)

## S26.30

**Copy content.** A copy control puts the artifact's own content on the clipboard and confirms it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-06 Copy and export](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)

## S26.31

**Share controls.** The user can publish an artifact to a link, copy/share the link, choose who can open it, and take it down.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome unverified
- Feature: [F026-07 Sharing and visibility](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Competitor trace: CAP-artifacts-and-documents-15, CAP-sharing-and-collaboration-11, CAP-sharing-and-collaboration-13, CAP-sharing-and-collaboration-24

## S26.32

**Public/private state.** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F026-07 Sharing and visibility](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Competitor trace: CAP-artifacts-and-documents-15, CAP-sharing-and-collaboration-11

## S26.33

**Connected-data status.** An artifact that reads connected data shows which sources it uses and whether they are connected/healthy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F026-10 Connected-data status, refresh, and artifact usage (not built per brief)](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Competitor trace: CAP-artifacts-and-documents-13, CAP-artifacts-and-documents-18

## S26.34

**Refresh connected data.** An artifact bound to connected data offers a refresh that re-pulls that data without regenerating the artifact.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F026-10 Connected-data status, refresh, and artifact usage (not built per brief)](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Competitor trace: CAP-artifacts-and-documents-13, CAP-artifacts-and-documents-18

## S26.35

**Runtime error panel.** When an artifact fails while rendering or running, the viewer replaces it with an error panel that explains the failure and offers source/retry.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F026-02 Lifecycle state, live updates, error and recovery panels](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Competitor trace: CAP-artifacts-and-documents-19

## S26.36

**Dependency-loading state.** While an artifact's runtime or libraries load, the viewer shows a loading state, and a failed load is reported.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F026-02 Lifecycle state, live updates, error and recovery panels](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Competitor trace: CAP-artifacts-and-documents-19

## S26.37

**Artifact-specific usage information.** The user can see usage attributable to a specific artifact (e.g. model calls, credits or views it consumed).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F026-10 Connected-data status, refresh, and artifact usage (not built per brief)](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Competitor trace: CAP-artifacts-and-documents-26

## S26.38

**Open originating session.** From an artifact seen outside its chat (gallery, list, library), the user can jump to the conversation that produced it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome done
- Feature: [F026-08 Library, projects, copies, and handoff to another chat](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Competitor trace: CAP-artifacts-and-documents-23

## S26.39

**Live updates from ongoing work.** While a reply or run is still producing an artifact, the artifact view updates live as content arrives.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome unverified
- Feature: [F026-02 Lifecycle state, live updates, error and recovery panels](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)

## S26.40

**Mobile reader adaptation.** On a phone-sized screen the artifact reader adapts (full-screen sheet, touch controls) instead of a cramped side panel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Mobile done, Chrome unverified
- Feature: [F026-03 Viewer layout: docked panel, resize, full screen, detached window, tabs, switching](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Competitor trace: CAP-artifacts-and-documents-01

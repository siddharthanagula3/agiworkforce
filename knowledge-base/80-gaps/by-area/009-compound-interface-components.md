---
id: "GAPS-AREA-009"
type: "gap-list"
title: "Gaps: Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 9. Compound interface components

76 open gaps that touch this area. Area page: [20-features/009-compound-interface-components](../../20-features/009-compound-interface-components/README.md).

## CMP-WP178

**Deep research reads your connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notio… The research loop does read connected apps (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2818), but only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist: packages/contracts/types/src/connec
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2812-2842

## CMP-WP80

**Research uses connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Research can include connectors, but connectors are mostly Coming soon Research can include connectors, but connectors are mostly Coming soon.
- Evidence: apps/web/features/chat/components/research/ResearchActivity.tsx:218,313; packages/contracts/types/src/connector-release.ts:14

## GAP-AREA009-LW01

**Image comparison slider (S9.18) is missing in every app; no code exists.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-009
- Detail: Area 9. Compound interface components
- Evidence: brief S9.18

## GAP-AREA009-LW02

**Docking layout manager (S9.25) exists only in the VS Code extension; web and desktop are marked missing.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-009
- Detail: Area 9. Compound interface components
- Evidence: brief S9.25

## GAP-AREA009-LW05

**Web repository and branch pickers exist in code but the cloud sandbox is not switched on in production yet.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-009
- Detail: Area 9. Compound interface components
- Evidence: apps/web/lib/e2b/gate.ts:22

## GAP-AREA009-LW07

**Mobile has no global command palette (decision D-2026-09-28-27).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-009
- Detail: Area 9. Compound interface components
- Evidence: brief S9.38

## GAP-AREA009-LW08

**Credit balance card is missing on mobile.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-009
- Detail: Area 9. Compound interface components
- Evidence: brief S9.30

## GAP-CAP-research-04

**Choose research sources: web, uploads, connected apps: Comparison marks connected-app research as Partial (WP80, WP178); the exact missing part was not read. Mobile has no source panel.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Requirement items: S10.16, S35.05, S35.07, S35.08, S9.03
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-F009-01-01

**Stored-file picker exists only on Web/Desktop and only in AGI Work mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-01](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)
- Detail: Affects: Free users and all users of Mobile, CLI, VS Code, Chrome. Work needed: Decide the intended scope, then add a library picker on the other surfaces or document it as Web only.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062, :2768; brief S9.01 gives file-picker code only for Web

## GAP-F009-01-02

**CLI lets a locked managed model be selected.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-01](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)
- Detail: Affects: CLI users on a plan that cannot route the model. Work needed: Show a notice on selection and offer the upgrade path, like Web.
- Evidence: apps/cli/src/tui/widgets/model_picker.rs:199-205

## GAP-F009-01-03

**Mobile locked tap does nothing when native purchases are unavailable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-01](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)
- Detail: Affects: Mobile users on builds without purchases. Work needed: Show a plain message explaining the plan limit.
- Evidence: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:466

## GAP-F009-01-04

**Web short-list search and catalogue search are two code paths.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-01](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)
- Detail: Affects: Web and Desktop. Work needed: Confirm they agree or merge them.
- Evidence: ComposerFooter.tsx:1260-1269; ModelCatalogue.tsx:381

## GAP-F009-01-05

**Chrome and VS Code model search verified only by reading code; no Chrome test found for the filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-01](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)
- Detail: Affects: Chrome. Work needed: Add a unit test for filterManagedModelOptions.
- Evidence: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:249

## GAP-F009-02-01

**No way to pick among linked connector accounts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Detail: Affects: Web, Desktop, Mobile, CLI. Work needed: Build a selector bound to accountKey and the default flag, and make the chat or task use it; correct the brief status.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:32-60 has no press handler on rows; brief S9.04 marks Mobile and CLI done

## GAP-F009-02-02

**Source picker missing on Mobile, CLI, VS Code, Chrome and only offered at plan approval on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome users doing research. Work needed: Decide per surface; add the picker or document Web-only.
- Evidence: audit/partial/009-compound-interface-components.md (S9.03)

## GAP-F009-02-03

**Mobile project bar disappears when the account has no projects.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Detail: Affects: Mobile users. Work needed: Show an empty message with a way to create a project.
- Evidence: ProjectSelectorBar.tsx:177

## GAP-F009-02-04

**CLI has no interactive project list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Detail: Affects: CLI users. Work needed: Add a picker in the TUI or accept command-only as the design.
- Evidence: apps/cli/src/lib.rs:1287-1330

## GAP-F009-02-NOTBUILT

**Source, project and connected-account pickers: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Requirement items: S9.03
- Detail: Mobile: S9.03; CLI: S9.03; VS Code: S9.03; Chrome: S9.03

## GAP-F009-02-PARTLY

**Source, project and connected-account pickers: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Requirement items: S9.04

## GAP-F009-03-01

**Mobile switches workspaces without warning about running work.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-03](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)
- Detail: Affects: Mobile. Work needed: Show the same kind of list of work that will not come along, or confirm there is none.
- Evidence: apps/mobile/app/(app)/settings/workspace.tsx:164-176

## GAP-F009-03-02

**No workspace picker on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-03](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)
- Detail: Affects: CLI, VS Code and Chrome users in team workspaces. Work needed: Decide whether those apps follow the account's active workspace and show it, or let the person switch.
- Evidence: audit/partial/009-compound-interface-components.md (S9.05)

## GAP-F009-03-03

**No member picker on Mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-03](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)
- Detail: Affects: Mobile users sharing projects. Work needed: Build or declare Web-only.
- Evidence: audit/partial/009-compound-interface-components.md (S9.11)

## GAP-F009-03-04

**MemberPicker has no test file of its own.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-03](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)
- Detail: Affects: Web, Desktop. Work needed: Add keyboard, paste and single versus multiple tests.
- Evidence: No test found for apps/web/shared/components/people/MemberPicker.tsx

## GAP-F009-03-NOTBUILT

**Workspace switcher and member picker: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F009-03](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)
- Requirement items: S9.05, S9.11
- Detail: Mobile: S9.11; CLI: S9.05, S9.11; VS Code: S9.05, S9.11; Chrome: S9.05, S9.11

## GAP-F009-04-01

**Web cloud repository and branch features are switched off in production until the sandbox keys and flag are set.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-04](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)
- Detail: Affects: Web users of Code. Work needed: Owner sets the switch in production, redeploys, then a live check in /code (not done by this page).
- Evidence: brief S9.07 and S9.08 Unfinished; apps/web/lib/e2b/gate.ts:16-30

## GAP-F009-04-02

**Mobile pickers exist but the brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-04](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)
- Detail: Affects: Documentation and audit accuracy. Work needed: Update the audit ledger after verification.
- Evidence: apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:254, :291

## GAP-F009-04-03

**CLI has no branch picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-04](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)
- Detail: Affects: CLI users. Work needed: Decide: add a picker or rely on git.
- Evidence: brief S9.08

## GAP-F009-04-04

**Brief code references for CLI (lib.rs:416, :2965) and Desktop dispatcher (:704) no longer point at the repository code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-04](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)
- Detail: Affects: Engineers following the brief. Work needed: Refresh the brief references.
- Evidence: apps/cli/src/lib.rs:421; apps/desktop/electron/runtime/dispatcher.ts:914

## GAP-F009-04-NOTBUILT

**Repository and branch pickers (Code): not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F009-04](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)
- Requirement items: S9.08
- Detail: CLI: S9.08

## GAP-F009-04-PARTLY

**Repository and branch pickers (Code): partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F009-04](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)
- Requirement items: S9.07, S9.08
- Detail: Web S9.07: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S9.08: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F009-05-01

**No microphone, camera or paired-computer choice in the device picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-05](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)
- Detail: Affects: Web and Desktop voice users. Work needed: Add input selection or narrow the requirement.
- Evidence: apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:44-47

## GAP-F009-05-02

**Device picker absent on CLI and Chrome; Mobile and VS Code not stated.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-05](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)
- Detail: Affects: CLI, Chrome. Work needed: Decide scope per app.
- Evidence: audit/partial/009-compound-interface-components.md (S9.09)

## GAP-F009-05-03

**Chrome approval card status unverified in the brief.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-05](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)
- Detail: Affects: Chrome. Work needed: Add a test and record result.
- Evidence: brief S9.32; apps/extension/src/side_panel.ts:5543-5577

## GAP-F009-05-04

**Approval labels differ by app: Web says 'Allow', CLI offers 'Allow Session' and 'Always allow'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-05](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)
- Detail: Affects: Consistency across apps. Work needed: Decide whether to align labels and whether Web needs an 'Always allow'.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:23-31; apps/cli/src/tui/widgets/approval_overlay.rs:91-94

## GAP-F009-05-NOTBUILT

**Device, permission-scope and approval controls: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F009-05](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)
- Requirement items: S9.09
- Detail: CLI: S9.09; Chrome: S9.09

## GAP-F009-05-PARTLY

**Device, permission-scope and approval controls: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F009-05](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)
- Requirement items: S9.32

## GAP-F009-06-01

**Web wizard does not collect a model, and sign-in is checked before it starts rather than inside it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-06](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)
- Detail: Affects: Web and Desktop new users. Work needed: Decide if the brief or the wizard should change.
- Evidence: apps/web/features/onboarding/components/OnboardingWizard.tsx:118-146; apps/web/app/welcome/page.tsx:15-18; brief S9.23

## GAP-F009-06-02

**CLI schedule creation takes only cron.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-06](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)
- Detail: Affects: CLI users. Work needed: Add the same frequencies or document cron only.
- Evidence: apps/cli/src/lib.rs:1515-1523

## GAP-F009-06-03

**Mobile and Chrome cannot create interval, cron, rule or event schedules and Mobile will not turn on a schedule of those kinds.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-06](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)
- Detail: Affects: Mobile, Chrome. Work needed: State this in the form or add support.
- Evidence: apps/mobile/src/features/schedules/policy.ts:3-9; apps/mobile/src/features/schedules/store.ts:345

## GAP-F009-06-04

**CLI has no step indicator; VS Code has no editor found for recurrence; brief lists stepper 'done' for VS Code with no code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-06](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)
- Detail: Affects: CLI, VS Code. Work needed: Verify or add a 'Step X of N' line.
- Evidence: brief S9.22; apps/cli/src/onboarding.rs:796-1006

## GAP-F009-06-05

**The brief's stepper code points to the Web gallery wizard and the mobile demo, not to the Web welcome wizard that also shows steps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-06](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)
- Detail: Affects: Audit accuracy. Work needed: Name one shared stepper or record separate implementations.
- Evidence: apps/web/app/gallery/GalleryClient.tsx:608-640; apps/web/features/onboarding/components/OnboardingWizard.tsx:125

## GAP-F009-06-NOTBUILT

**Schedule recurrence, step indicator and setup wizard: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F009-06](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)
- Requirement items: S9.12, S9.22, S9.23
- Detail: CLI: S9.22; VS Code: S9.12, S9.22, S9.23

## GAP-F009-07-01

**Image comparison slider does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Detail: Affects: All apps with image editing.. Work needed: Build a shared slider component and mount it where an edited image appears.
- Evidence: Brief S9.18 says missing; no code found.

## GAP-F009-07-02

**Storage breakdown not shown on the web Library.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Detail: Affects: Web and desktop window.. Work needed: Read storage_documents_bytes and storage_images_bytes and show them.
- Evidence: route.ts:195-206 returns it; LibraryView.tsx:489-492 ignores it.

## GAP-F009-07-03

**Brief marks CLI file browser as missing but a library command exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Detail: Affects: Brief accuracy for CLI.. Work needed: Update the capability ledger row.
- Evidence: apps/cli/src/lib.rs:7295-7345.

## GAP-F009-07-04

**CLI tables are not sortable and Chrome has no table or gallery.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Detail: Affects: CLI, Chrome.. Work needed: Decide whether the terminal and the extension need sorting; add if so.
- Evidence: apps/cli/src/markdown.rs:470-486; brief S9.15, S9.17.

## GAP-F009-07-05

**No grid or list toggle on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Detail: Affects: Mobile.. Work needed: Decide if the toggle is wanted; the brief only requires a grid.
- Evidence: apps/mobile/src/features/library/index.tsx:177-179.

## GAP-F009-07-06

**Local mode has no Library on desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Detail: Affects: Desktop Tauri build Local mode.. Work needed: Decide if local files should appear in a Library view.
- Evidence: DesktopShellV3.tsx:601-604.

## GAP-F009-07-NOTBUILT

**Library: file browser, folders, grid, gallery and image comparison: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F009-07](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)
- Requirement items: S9.13, S9.14, S9.15, S9.17, S9.18
- Detail: Web: S9.18; Desktop: S9.18; Mobile: S9.14, S9.18; CLI: S9.13, S9.14; Chrome: S9.14, S9.15, S9.17, S9.18

## GAP-F009-08-01

**No per-step duration in the timeline.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Detail: Affects: Web, desktop window, mobile.. Work needed: Show step durations where start and end are known.
- Evidence: Only run elapsed time formatted, AgentActivityTimeline.tsx:241-252.

## GAP-F009-08-02

**Docking layout manager missing on Web and desktop; VS Code relies on the host.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Detail: Affects: Web, desktop.. Work needed: Decide scope; update brief if VS Code only registers a view.
- Evidence: Brief S9.25; package.json:953-971 only registers a view.

## GAP-F009-08-03

**No unit tests found for ArtifactVersionHistory, SidePanelResizeHandle or CodeChangesPanel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Detail: Affects: Web.. Work needed: Add component tests.
- Evidence: Search of test files for these names found only the mobile version history test.

## GAP-F009-08-04

**VS Code board groups differ from the web board stages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Detail: Affects: VS Code.. Work needed: Align or document.
- Evidence: cloudTasksTree.ts stage groups versus cross-device.ts:403-410.

## GAP-F009-08-05

**Brief code anchors for CLI version history and VS Code split pane do not match the described feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Detail: Affects: Brief accuracy.. Work needed: Correct the ledger rows.
- Evidence: tui_app.rs:3005 is spinner time; applyEdit.ts:77-90 is a choice prompt.

## GAP-F009-08-06

**Chrome task board, progress card, version history and diff not built or unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Detail: Affects: Chrome.. Work needed: Verify or build.
- Evidence: Brief S9.21, S9.26, S9.27, S9.35.

## GAP-F009-08-NOTBUILT

**Run progress, task board, versions, diffs, widgets and layout: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Requirement items: S9.19, S9.21, S9.24, S9.25, S9.26, S9.27, S9.35, S9.36
- Detail: Web: S9.25; Desktop: S9.25; CLI: S9.21, S9.36, S9.24; VS Code: S9.26, S9.36; Chrome: S9.19, S9.21, S9.35, S9.26, S9.27, S9.36, S9.24, S9.25

## GAP-F009-08-PARTLY

**Run progress, task board, versions, diffs, widgets and layout: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F009-08](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)
- Requirement items: S9.21, S9.35

## GAP-F009-09-01

**Warning lives only in the picker popover on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-09](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)
- Detail: Affects: Web and desktop window.. Work needed: Decide if a note must show in the composer; update the brief wording.
- Evidence: ComposerFooter.tsx:1755-1760.

## GAP-F009-09-02

**Mobile covers only the image case.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-09](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)
- Detail: Affects: Mobile.. Work needed: Add context, tools and attachments checks or mark them not applicable.
- Evidence: unreadableImagesNotice.ts:15-34; no other codes found in apps/mobile/src.

## GAP-F009-09-03

**No capability warning on CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-09](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)
- Detail: Affects: Those apps.. Work needed: Share the rules and add the notice.
- Evidence: Brief S9.34; no hit in apps/extension/src.

## GAP-F009-09-04

**No source inspector on CLI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-09](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)
- Detail: Affects: CLI, VS Code.. Work needed: Add a source list view.
- Evidence: Brief S9.28.

## GAP-F009-09-05

**The check is a web-only file, not a shared package.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-09](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)
- Detail: Affects: Consistency across apps.. Work needed: Move rules to a shared package.
- Evidence: File path under apps/web; AGENTS.md section 3 on shared domain behaviour.

## GAP-F009-09-NOTBUILT

**Source inspector and model warning: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F009-09](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)
- Requirement items: S9.28, S9.34
- Detail: CLI: S9.28, S9.34; VS Code: S9.28, S9.34; Chrome: S9.34

## GAP-F009-10-01

**Tauri desktop usage tab is a separate implementation without stale handling or Free Upgrade behaviour seen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-10](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)
- Detail: Affects: Desktop Tauri build.. Work needed: Reuse the shared section or add the same states.
- Evidence: DesktopCloudSettingsModal.tsx:395-470.

## GAP-F009-10-02

**Mobile shows no bonus or purchased credits while purchases are off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-10](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)
- Detail: Affects: Mobile.. Work needed: Decide whether bonus credits should show without store purchases.
- Evidence: cloud-usage/index.tsx:416-418; storePurchases.json.

## GAP-F009-10-03

**Brief says mobile credit-balance card missing, but a reduced card exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-10](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)
- Detail: Affects: Brief accuracy.. Work needed: Update the ledger.
- Evidence: cloud-usage/index.tsx:411-432.

## GAP-F009-10-04

**Unknown state draws an empty bar, not a distinct style.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-10](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)
- Detail: Affects: Web.. Work needed: Consider a hatched or hidden bar.
- Evidence: UsageSection.tsx:322-327.

## GAP-F009-10-05

**CLI has no bonus credits line and no bars.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-10](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)
- Detail: Affects: CLI.. Work needed: Add bonus if the API reports it.
- Evidence: usage_summary.rs:564-607.

## GAP-F009-10-NOTBUILT

**Usage meter and credit balance: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F009-10](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)
- Requirement items: S9.30
- Detail: Mobile: S9.30

## GAP-F009-11-01

**Mobile has no global command palette (accepted by decision).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Detail: Affects: Mobile.. Work needed: None unless the decision changes.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:412-421.

## GAP-F009-11-02

**Inbox and activity feed missing on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Detail: Affects: Those apps.. Work needed: Decide scope; the server endpoints already exist.
- Evidence: Brief S9.20, S9.37.

## GAP-F009-11-03

**Mobile inbox mixes device items with server items; the web inbox shows server items only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Detail: Affects: Mobile, Web consistency.. Work needed: Document or unify.
- Evidence: notifications.ts:661-703; accountFeed.ts.

## GAP-F009-11-04

**Brief calls the activity feed sign-ins, changes and runs; the panel shows the security audit record.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Detail: Affects: Web, mobile.. Work needed: Confirm event types or adjust the brief.
- Evidence: RecentActivityPanel.tsx:10-11; activity/route.ts:52.

## GAP-F009-11-05

**Desktop palette test is skipped.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Detail: Affects: Desktop Tauri tests.. Work needed: Replace or remove.
- Evidence: CommandPalette.test.tsx.skip in apps/desktop/src/features/chat/__tests__.

## GAP-F009-11-NOTBUILT

**Activity feed, notification inbox, command palette and integration cards: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Requirement items: S9.20, S9.33, S9.37, S9.38
- Detail: CLI: S9.20, S9.37; VS Code: S9.20, S9.37, S9.38, S9.33; Chrome: S9.20, S9.37

## GAP-F009-11-PARTLY

**Activity feed, notification inbox, command palette and integration cards: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F009-11](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
- Requirement items: S9.38
- Detail: Mobile S9.38: D-2026-09-28-27: a global command palette is not built on mobile.

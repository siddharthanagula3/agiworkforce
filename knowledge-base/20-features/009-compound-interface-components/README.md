---
id: "AREA-009"
type: "area"
title: "Compound interface components"
features: ["F009-01", "F009-02", "F009-03", "F009-04", "F009-05", "F009-06", "F009-07", "F009-08", "F009-09", "F009-10", "F009-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 9. Compound interface components

This area is the set of larger screen parts that are built from smaller controls: pickers (model, file, project, workspace, repository, branch, device), lists and grids (library, tables, timelines, task board), review panels (diffs, versions, sources) and status cards (usage, credits, approvals, progress, notifications). A person uses them to choose what a chat or task works with, to watch it run, and to check and approve the result. They matter because every app needs the same choices and the same safety prompts, and a wrong or silent state here (a locked model that looks open, a missing warning) misleads the person.

**Who uses it.** Mostly every signed-in user. Some parts depend on plan: the model picker marks models that need a higher plan and sends the person to upgrade; Free users see an "Upgrade" prompt in usage instead of the plan meters; the Code repository and branch pickers need the cloud sandbox switched on for the server; workspace switching only matters to people who belong to a team workspace; the member and recipient picker is for people who share or invite inside a workspace or project. Developers use the repository, branch, diff and command palette parts.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F009-01](F009-01-model-picker-and-file-picker-in-the-chat-box.md) | Model picker and file picker in the chat box | built | built | built | built | built | built |
| [F009-02](F009-02-source-project-and-connected-account-pickers.md) | Source, project and connected-account pickers | partly | partly | partly | partly | partly | partly |
| [F009-03](F009-03-workspace-switcher-and-member-picker.md) | Workspace switcher and member picker | built | built | partly | no | no | no |
| [F009-04](F009-04-repository-and-branch-pickers-code.md) | Repository and branch pickers (Code) | partly | built | built | partly | built | n/a |
| [F009-05](F009-05-device-permission-scope-and-approval-controls.md) | Device, permission-scope and approval controls | built | built | built | partly | built | partly |
| [F009-06](F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md) | Schedule recurrence, step indicator and setup wizard | built | built | built | partly | no | built |
| [F009-07](F009-07-library-file-browser-folders-grid-gallery-and-imag.md) | Library: file browser, folders, grid, gallery and image comparison | partly | partly | partly | partly | n/a | no |
| [F009-08](F009-08-run-progress-task-board-versions-diffs-widgets-and.md) | Run progress, task board, versions, diffs, widgets and layout | partly | partly | built | partly | partly | no |
| [F009-09](F009-09-source-inspector-and-model-warning.md) | Source inspector and model warning | built | built | built | no | no | partly |
| [F009-10](F009-10-usage-meter-and-credit-balance.md) | Usage meter and credit balance | built | built | partly | built | built | built |
| [F009-11](F009-11-activity-feed-notification-inbox-command-palette-a.md) | Activity feed, notification inbox, command palette and integration cards | built | built | partly | partly | no | partly |

Requirement items for this area: [10-requirements/capabilities/009-compound-interface-components.md](../../10-requirements/capabilities/009-compound-interface-components.md).

## How this area works in the code

1. **The person touches a control.** The control lives in a shared component. Chat-box pieces sit in the web Composer folder; library, tasks, tool cards and tables are in shared packages used by web and desktop. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043`, `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:203`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:79`)
2. **Typing is narrowed locally or after a short wait.** The model list filters in the footer; the file menu waits for the typed text to settle, cancels the old request, and asks the library list. (`apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:203`, `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:80`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:445`)
3. **Plan and capability checks decide what is allowed.** The footer reads the plan from the billing store and treats an unknown plan as unknown. Before a model switch it runs the compatibility check using the model catalogue. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:660`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1108`, `apps/web/features/chat/components/Composer/model-compatibility.ts:90`)
4. **A warning notice is drawn.** Findings are shown in a status region under the chat box, in warning colour. (`apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:15`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1756`)
5. **The screen asks the server.** Lists call web API routes. The library list is rate-limited, takes the signed-in user and workspace, checks the query shape, and returns one page plus storage and download meters. Usage comes from /api/usage through a shared hook; notifications through a feed client. (`apps/web/app/api/library/route.ts:146`, `apps/web/app/api/library/route.ts:170`, `apps/web/lib/hooks/useManagedUsageSummary.ts:67`, `apps/web/features/notifications/hooks/use-notification-feed.ts:42`)
6. **The server reads stored data.** Library items come from the media assets table, scoped to user and workspace, skipping temporary chats and deleted rows for the storage total. (`apps/web/app/api/library/route.ts:130`, `apps/web/app/api/library/route.ts:149`)
7. **Gates switch cloud code parts on.** The Code repository and branch pickers rely on the cloud sandbox. The server reads two environment values and a price check. (`apps/web/lib/e2b/gate.ts:8`, `apps/web/lib/e2b/gate.ts:22`, `apps/web/features/code/components/CodeComposer.tsx:681`)
8. **Result is shown with states.** Each part shows loading, empty, error and ready states: workspace menu, notification panel and usage bars all do. Approval buttons call back into the run. (`apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:162`, `apps/web/features/notifications/components/NotificationBell.tsx:132`, `packages/ui/unified-chat/src/components/ToolCallCard.tsx:412`)
9. **Saved choices.** The wizard saves name and completion time as account preferences; library view mode is kept in the browser; schedules go through the schedule service that builds a cron rule. (`apps/web/features/onboarding/lib/onboarding-preferences.ts:51`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:131`, `apps/web/lib/services/schedule-service.ts:806`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Model picker, plan lock labels, and the compatibility check before a switch. |
| `apps/web/features/chat/components/Composer/model-compatibility.ts` | Works out context, vision, tool and attachment warnings from the model catalogue. |
| `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Searchable file picker in the chat box using the library list. |
| `apps/web/app/api/library/route.ts` | Library list endpoint: filters, paging, storage and download meters. |
| `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared library screen: grid or list, search, gallery, deleted items, viewer. |
| `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx` | Workspace switcher with confirmation of interrupted work. |
| `apps/web/features/code/components/CodeComposer.tsx` | Repository and branch pickers for cloud code sessions. |
| `apps/web/lib/e2b/gate.ts` | Server switches for the cloud code sandbox. |
| `apps/web/features/settings/sections/UsageSection.tsx` | Usage bars, credit balances, limit resets, Free upgrade prompt. |
| `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Approval card with Approve, Approve for chat, Deny and diff display. |
| `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx` | Task board with a column per stage. |
| `apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx` | Opens the palette on Ctrl/Cmd+K on every page. |

## What is stored

- Library files and their metadata (kind, size, origin, prompt, model, deleted time): database table media_assets, read in apps/web/app/api/library/route.ts:130
- Library grid or list choice: browser storage key agi-library-view-mode (packages/ui/unified-chat/src/components/library/LibraryView.tsx:131)
- Preferred name, work description, onboarding completed time: account preference namespace 'general' (apps/web/features/onboarding/lib/onboarding-preferences.ts:9, :65)
- Side panel width: kept by useSidePanelWidth in apps/web/features/chat/components/SidePanelResizeHandle.tsx; where it is stored was not checked
- Usage readings: in memory only, shared by the page (apps/web/lib/hooks/useManagedUsageSummary.ts:67); the server source behind /api/usage was not traced
- Schedules: stored by schedule-service (cron expression, type, timezone); table not opened (apps/web/lib/services/schedule-service.ts:806)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION=1**: Turns on cloud sandbox execution for Code (repository and branch pickers become usable); with the sandbox key it makes provisioning ready. (apps/web/lib/e2b/gate.ts:8)
- **E2B_API_KEY**: Needed together with the flag for provisioning; a key alone also counts as enabled for execution. (apps/web/lib/e2b/gate.ts:9)
- **sandboxComputeIsPriceable**: Provisioning is not ready unless the sandbox rate card can be priced. (apps/web/lib/e2b/gate.ts:22)
- **Managed compute private beta**: Separate gate for managed compute routes; the brief says it is on when unset and must not be set to 0. (apps/web/lib/e2b/gate.ts:31)
- **Plan tier (Free versus paid)**: Locks models in the picker, hides model catalogue for Free, switches usage to an Upgrade prompt. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:660; apps/web/features/settings/sections/UsageSection.tsx:1224)
- **Plan storage and download limits**: Library shows storage and download meters when a limit exists. (apps/web/app/api/library/route.ts:79)

## Shared between apps

Web and desktop share almost everything in apps/web plus the packages: packages/ui/unified-chat (library, tasks board, tool card, spreadsheet, citation chip) and packages/ui/ui (connector and skill directory, settings modal). The brief says the public Desktop shows the hosted web app. Mobile has its own versions in apps/mobile (model picker sheet, project bar, library, schedule form, approvals). CLI has terminal widgets in apps/cli/src/tui. VS Code (webviewContent.ts, cloud tasks tree) and the Chrome extension (side-panel files) each have their own code.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Image comparison slider (S9.18) is missing in every app; no code exists. (brief S9.18)
- Docking layout manager (S9.25) exists only in the VS Code extension; web and desktop are marked missing. (brief S9.25)
- The web setup wizard has 2 steps (name, and what you do). The brief's Should says the wizard collects name, model and sign-in. (apps/web/features/onboarding/components/OnboardingWizard.tsx:36)
- Several brief line numbers no longer match the code. For example UsageSection.tsx:500 is the limit-reset card, while the credit balances card starts at line 407. (apps/web/features/settings/sections/UsageSection.tsx:407)
- Web repository and branch pickers exist in code but the cloud sandbox is not switched on in production yet. (apps/web/lib/e2b/gate.ts:22)
- The brief marks the keyboard split resize for ArtifactsPanel; the keyboard code is in SidePanelResizeHandle, shown only in desktop layout. (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:690)
- Mobile has no global command palette (decision D-2026-09-28-27). (brief S9.38)
- Credit balance card is missing on mobile. (brief S9.30)

## Not established

- I did not open most mobile, CLI, VS Code and Chrome files; their behaviour is taken from the brief's Status lines and a few spot reads (mobile model sheet, CLI model picker filter line).
- Connected-account picker (S9.04): the brief lists no code and web and desktop are unverified. I did not search for it.
- Where side panel width is stored and what feeds /api/usage were not traced.
- Device picker, member picker, project picker and approval-for-chat server behaviour on the web were not opened beyond the files named.
- Whether the Free-plan upgrade prompt hides all usage meters was seen only as a heading and button at UsageSection.tsx:1313-1328, not the whole branch.
- Desktop (Electron) behaviour was not separately checked; I assumed it shows the hosted web app as AGENTS.md says. Branch listing on desktop was in a local git service I only partly read.
- Live behaviour was not run; nothing here was seen working in a running app.

---
id: "F012-09"
type: "feature"
title: "Model, workspace and project for the next message"
aliases: ["Model name in the composer", "Workspace line", "Project picker", "Project or folder", "Active project", "NewChatWorkspace", "ModelSelectorButton", "ProjectSelectorBar", "S12.18", "S12.19", "S12.20"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.18", "S12.19", "S12.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "SYS-model-catalog-and-routing", "SYS-authorization-and-workspaces", "SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "F012-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-09 Model, workspace and project for the next message

Before the first message the new-chat screen shows which model will answer, which workspace (Personal or an organization) the chat will belong to, and lets the person pick a project. Local folders can be picked only on desktop. Changing the project changes where the new chat is created.

Area: [12. New-chat experience](README.md). Requirement items: [S12.18](../../10-requirements/capabilities/012-new-chat-experience.md#s1218), [S12.19](../../10-requirements/capabilities/012-new-chat-experience.md#s1219), [S12.20](../../10-requirements/capabilities/012-new-chat-experience.md#s1220).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows and controls three choices for the next message: the model (composer footer trigger), the workspace (line under the greeting, 'Workspace: <name>') and the project (picker labelled 'Project or folder' on web). (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1460) (packages/ui/i18n/locales/en/common.json:202) (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7161)

**Why it exists.** The brief says the new-chat screen must show which model, which workspace and which project a new chat will use before sending (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md, S12.18-S12.20).

**Who uses it.** Everyone starting a chat; organization members especially for workspace; desktop users for local folders.

**Problems it solves**

- Surprise: sending to the wrong model, workspace or project.
- Cost and privacy: a person can see a Local, own-key or Cloud model before sending.
- Context: choosing a project before the first message puts the chat there.

**Use cases**

- Open web chat, read the model name in the footer, click it to change.
- As a member of an organization, see 'Workspace: <organization name>' under the greeting.
- Pick a project in 'Project or folder' so the first message creates the chat inside it.
- On desktop, choose 'Choose a different folder' to work in a local folder.

## 2. User experience

**Where to find it**

- Web model: trigger in the composer footer showing the model name (or a local model name with a 'Local' badge) and an accessible name ending 'change model' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1460).
- Web workspace: line under the greeting reading 'Workspace: <name>' with a building or person icon (apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:22).
- Web project: a picker chip with placeholder 'Project or folder' (or 'Project' when AGI Work is not available), a search box 'Search projects...', 'No projects yet' / 'No projects found', 'Create new project' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2765, 7161-7229).
- Desktop: same web composer plus 'Choose a different folder' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7216).
- Mobile: model button (test id chat.composer.model, label 'Model: <name>', hint 'Opens the model picker') (apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:53); workspace line 'Workspace: <name>' under the empty-state (apps/mobile/app/(app)/(tabs)/chat.tsx:1328); project bar 'No project' / 'Active project: <name>. Tap to change' (apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:220); add-to-chat sheet project row (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:545).
- VS Code: model pill and an 'Active project' strip with 'Stop using this project' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3295).
- Chrome: model selector and project chip in the side panel (ids sp-model-selector-btn, sp-project-chip) (apps/extension/src/side_panel.ts:2050).
- CLI: /model command; no workspace line and no project picker were found (apps/cli/src/tui/tui_app.rs:5553).

**Before you start**

- Workspace line: the account has at least one organization workspace; otherwise nothing shows (apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:14).
- Mobile workspace line: Cloud mode and signed in (apps/mobile/app/(app)/(tabs)/chat.tsx:385).
- Project picker: the host provides a project list (apps/web/features/chat/pages/WebChatPage.tsx:5015).

**Screens and controls**

- Model picker popover with shortlist, plan lock labels and a catalogue view (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1215).
- Project picker menu with search, check on active project, 'Create new project'.
- Mobile ProjectSelectorBar sheet (test id project-selector-sheet) and 'Clear project' button.
- Local folder chip on desktop with 'Clear working folder' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5201).

**Journey**

1. Open a new chat; the default model hook applies the saved default model if it is on the person's plan and the person has not already changed the model (apps/web/features/chat/hooks/use-new-chat-default-model.ts:13).
2. Read the model name in the footer; click to change.
3. Read the workspace line; switching workspace is done elsewhere (unknown).
4. Open 'Project or folder', pick a project (or on desktop a folder).
5. Send: the conversation is created with that project id (apps/web/features/chat/pages/WebChatPage.tsx:2662).

**What the person sees and gets**

- Footer shows 'Saving…' while a model change is pending (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1498).
- Locked models show plan labels and an upgrade path (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1218).
- Project chip shows the active project; a check mark in the menu.
- Mobile project bar and the project line under the greeting (apps/mobile/app/(app)/(tabs)/chat.tsx:1351).

**Settings**

- Default model preference namespace 'default-model' saved in Settings General (apps/web/features/chat/lib/default-model-preference.ts:15).
- Free-plan model promotion changes the default (apps/web/features/chat/hooks/use-new-chat-default-model.ts:15).
- Mobile model and project stores (model-picker store, project store).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web default model hook: applies saved default once, skips if the user already changed the model, skips models not on the plan (apps/web/features/chat/hooks/use-new-chat-default-model.ts:13-35).
- Web composer reads selectedModelId from the model store (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1049) and the footer shows its name (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1460).
- Workspace line: shows the organization name when the active scope is organization, 'Personal' when personal, nothing when no organization exists (apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:14-22).
- Web project picker lists store projects; picking sets the active project that createConversation uses (apps/web/features/chat/pages/WebChatPage.tsx:5015) (apps/web/features/chat/pages/WebChatPage.tsx:2662).
- Local folder option only when canUseAgiWork and canUseWorkingDirectory (desktop capability) (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7200).
- Mobile model button, workspace hook and project bar are wired (apps/mobile/src/features/team/useNewChatWorkspace.ts:10).

**Incomplete**

- CLI: model shown through /model; no workspace or project selection found (brief says workspace missing; project 'done' but no code reference was in the brief and none found).
- Chrome: brief says all three done but the brief does not list Chrome code; model selector and project chip exist, workspace line not found.

**Present but disconnected or switched off**

- Brief's WebChatPage.tsx:6175 reference for the workspace line no longer holds; the line is rendered through GreetingBanner showWorkspace (apps/web/features/chat/pages/WebChatPage.tsx:7647).

**Not available**

- Local folder picker on web (non-desktop) and mobile (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7197).
- Workspace line for people with no organization workspace (apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:14).
- CLI workspace line (brief: missing).

## 4. Required behaviour

**Established requirements**

- The new-chat screen shows which model the next message will use before the user sends. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.18)
- The new-chat screen shows which workspace (personal or organization) the new chat will belong to. (source: S12.19 (same brief))
- Before sending, the user can pick the project a new chat will be created in. (source: S12.20 (same brief))
- Local folders are added only on the desktop host. (source: S12.20 and apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7197)
- Every app is model agnostic and provider agnostic; the model shown must match what the send uses. (source: product context given for this task)

**Acceptance criteria**

1. The footer model name equals the model the next request uses; changing it changes the request.
2. With a saved default model on the plan, a fresh new chat starts on it; with a different choice already made, it is not overwritten.
3. An organization member sees 'Workspace: <organization>'; a personal-scope account with an organization sees 'Workspace: Personal'; an account with no organization sees no line.
4. Picking a project then sending creates the conversation inside that project.
5. Local folder choice appears only in the desktop app.
6. Clearing the project on mobile ('Clear project') puts the next chat outside any project.
7. A model locked by plan shows its lock label and cannot be selected.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The workspace line is display-only; no control to change it sits there [inferred: no handler in NewChatWorkspace].
- Mobile hides the workspace line in Local mode because workspaces are a Cloud concept [inferred from activeMode === 'cloud' condition].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the workspace line on the CLI and Chrome.
- [proposed] Show the provider mode label (Local, own key, Cloud) next to the model name on every app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useNewChatDefaultModel | `apps/web/features/chat/hooks/use-new-chat-default-model.ts` | Applies saved default or free promotion model on a new chat. |
| hook | useDefaultModelPreference | `apps/web/features/chat/lib/default-model-preference.ts` | Loads and saves the 'default-model' preference; plan check (isModelOnPlan). |
| store | model-store | `apps/web/shared/stores/model-store.ts` | selectedModelId and selectable model lookup. |
| component | ComposerFooter model trigger | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Shows the model name, local badge, lock labels, the popover. |
| component | ChatComposerNew project picker | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Project or folder menu, folder option for desktop (lines 2758-2815, 7161-7235). |
| screen | WebChatPage project wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | composerProjectPicker memo; createConversation with sendProjectId (lines 5015, 2662). |
| store | project store (web) | `apps/web/features/projects` | activeProjectId and setActiveProject (used at WebChatPage.tsx:1648); exact store file not opened. |
| component | NewChatWorkspace | `apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx` | Workspace line. |
| component | GreetingBanner | `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx` | Renders the workspace line when showWorkspace is set. |
| hook | useAccountWorkspaces | `apps/web/features/workspaces/hooks/use-workspaces.ts` | Loads the workspace list and active scope. |
| config | newChat.workspace string | `packages/ui/i18n/locales/en/common.json` | 'Workspace: {{name}}' text. |
| component | ModelSelectorButton | `apps/mobile/src/features/chat/components/ModelSelectorButton.tsx` | Mobile model button with fast-mode token. |
| component | ProjectSelectorBar | `apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx` | Mobile project bar and sheet (local or cloud list). |
| component | AddToChatSheet project row | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Project choice in the add-to-chat sheet (lines 356, 545). |
| hook | useNewChatWorkspace | `apps/mobile/src/features/team/useNewChatWorkspace.ts` | Fetches workspace overview; returns active org or Personal. |
| screen | Mobile new chat screen | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Renders workspace line, project line, project bar (lines 385, 1328, 1395). |
| component | VS Code project strip | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Model pill, 'Active project' strip (lines 3192, 3295). |
| command | useProjectInChat command | `apps/extension-vscode/package.json` | 'Code: Use Project in This Chat' command. |
| component | Chrome model and project chip | `apps/extension/src/side_panel.ts` | sp-model-selector-btn and sp-project-chip (lines 2049-2052). |
| command | /model (CLI) | `apps/cli/src/tui/tui_app.rs` | Model switch command (line 5553). |
| test | NewChatModelChoice.test | `apps/mobile/__tests__/NewChatModelChoice.test.tsx` | Mobile new-chat model choice. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| On a new chat the default model hook reads the saved default-model preference and sets the model store. | device and our servers | apps/web/features/chat/lib/default-model-preference.ts:62 |
| The footer reads the model store and shows the name or a local model name. | device | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1460 |
| The workspace hook fetches the account workspace list and scope; the component filters organizations. | our servers | apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:10 |
| Picking a project calls setActiveProject; on send createConversation receives the project id and the server creates the chat there. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:2662 |
| On desktop, choosing a folder uses the host folder picker and the working directory stays on the device. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7200 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Default model preference | Account preference namespace 'default-model' on our servers | Yes across devices through the account | Until changed |
| Selected model | Model store (browser) | unknown | unknown |
| Active project | Project store | Projects come from the account; selection storage unknown | unknown |
| Mobile local project list | Mobile project store | No (Local) | On device |

**Models and providers.** The shown name comes from the model catalog entry (AVAILABLE_MODELS) so any provider's model shows the same way; plan locks come from modelLock (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1215). Free plans are restricted to a trial model list (apps/web/features/chat/lib/default-model-preference.ts:41). Specific model names are not restated here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for the workspace line and cloud projects. Mobile Local projects need no account. |
| Permissions | Workspace membership decides organization visibility (useAccountWorkspaces). |
| Subscription | Models are locked by plan tier (modelLock) and Free is limited to a trial list (apps/web/features/chat/lib/default-model-preference.ts:41). |
| Limits and metering | none found for the display itself. |
| Feature flags | canUseAgiWork and canUseWorkingDirectory capabilities decide the folder option and picker label (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2765, 7197). |
| Model compatibility | A local model selection shows its own name and 'Local' badge (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1463); a local model chat cannot be saved in a project (apps/web/lib/temporary-chat-policy.ts:51). |
| Provider restrictions | none found in the code for the display. |
| Local mode | Web: local model name shown with 'Local' badge. Mobile: workspace line hidden outside Cloud mode (apps/mobile/app/(app)/(tabs)/chat.tsx:1328); project bar uses the local project list (apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:111). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Billing policy not ready | Default model hook waits (tier null). | apps/web/features/chat/hooks/use-new-chat-default-model.ts:28 |
| Default model not on plan | Skipped; current model kept. | apps/web/features/chat/hooks/use-new-chat-default-model.ts:30 |
| Default load fails | Status 'error' with message 'Your default model could not be loaded.' with retry. | apps/web/features/chat/lib/default-model-preference.ts:16 |
| No projects | 'No projects yet'. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7178 |
| Workspace list failed or loading | Line absent on web; mobile sets overview null. | apps/mobile/src/features/team/useNewChatWorkspace.ts:20 |
| Organization scope but org not found | Line hidden. | apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:19 |
| Model change saving | Footer shows 'Saving…'. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1498 |
| Folder not supported in browser | Button disabled with title 'Folder access is not supported in this browser'. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7207 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/hooks/__tests__/useNewChatDefaultModel.free-model-promotion.test.tsx`: Default and promotion model on new chat.
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Composer including project picker.
- `apps/web/features/desktop-host/__tests__/DesktopHostMount.find-folder.test.tsx`: Desktop folder find flow.
- `apps/mobile/__tests__/NewChatModelChoice.test.tsx`: Mobile model choice on new chat.
- `apps/mobile/__tests__/NewChatProjectRoundTrip.test.tsx`: Mobile project selected on new chat.
- `apps/mobile/__tests__/ProjectSelectorBarMove.test.tsx`: Mobile project selector move.
- `apps/mobile/__tests__/AddToChat.test.tsx`: Add-to-chat sheet.

**Test scenarios**

- **Default model**
  1. Set a default model in Settings General.
  2. Open a fresh new chat.
  - Expected: Footer shows that model; sending uses it.
- **Organization workspace**
  1. Sign in as an organization member in organization scope.
  2. Open new chat.
  - Expected: 'Workspace: <organization>' under the greeting.
- **Personal with org**
  1. Switch scope to personal.
  2. Open new chat.
  - Expected: 'Workspace: Personal'.
- **No organization**
  1. Sign in with a personal-only account.
  - Expected: No workspace line.
- **Project before send**
  1. Pick a project.
  2. Send a message.
  3. Open the project.
  - Expected: The new chat is in that project.
- **Desktop folder**
  1. In the desktop app, open 'Project or folder'.
  2. Choose a different folder.
  - Expected: Folder chip appears; the option is absent in the browser.

**Where to look when it fails**

- Message 'Your default model could not be loaded.'
- Network call to the preference namespace 'default-model'.
- Workspace overview request on mobile (fetchWorkspaceOverview).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **CLI lacks a workspace line and a project picker was not found.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:5553. Work needed: Decide the CLI equivalent (working folder and account scope line).
- **Chrome has no workspace line found.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts search. Work needed: Confirm and add if required.
- **Brief code references for WebChatPage.tsx:6175 and several composer lines have drifted.** Affects: Brief readers. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:7647. Work needed: Refresh references.
- **The model name does not state whether it runs Local, own key or Cloud (except the Local badge).** Affects: All apps. Evidence: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1463. Work needed: Consider a mode label, in line with AGENTS.md section 6 visible provider label.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- SYS-model-catalog-and-routing
- SYS-authorization-and-workspaces
- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- F012-08

## Unknown

- Where workspace switching is done on web and mobile.
- Persistence of the selected model and active project across reloads.
- Whether the CLI has any project concept in the new-chat screen.
- Chrome workspace line.
- Server rule when a project belongs to another workspace than the active scope.

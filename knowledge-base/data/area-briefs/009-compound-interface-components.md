# Area 9. Compound interface components

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S9.01 Searchable resource picker.
- Should: A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:203; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:80; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5312; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4205; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:535; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:546; apps/mobile/app/(app)/(tabs)/chat.tsx:942; apps/cli/src/tui/tui_app.rs:2507

## S9.02 Model picker.
- Should: A control lists the available models and switches the conversation to the one the user picks.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:670; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4964; apps/mobile/src/features/model-picker/components/ModelRow.tsx:150; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:368; apps/mobile/app/(app)/(tabs)/chat.tsx:942; apps/cli/src/tui/widgets/model_picker.rs:487; apps/cli/src/tui/widgets/model_picker.rs:690

## S9.03 Source picker.
- Should: Before or while asking, the user can choose which sources (specific sites, files, connected apps) the answer may draw on.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:373; apps/web/features/chat/components/research/ResearchActivity.tsx:455; apps/web/features/chat/components/messages/MessageBubble.tsx:1834

## S9.04 Connected-account picker.
- Should: When a connector has more than one linked account, the user can pick which account a task or chat uses.
- Status: web unverified, desktop unverified, mobile done, cli done

## S9.05 Workspace picker.
- Should: The user can see their personal and team workspaces in a list and switch the active one.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:162; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:85; apps/web/shared/components/layout/AccountMenuItems.tsx:76; apps/mobile/app/(app)/settings/workspace.tsx:348; apps/mobile/app/(app)/settings/workspace.tsx:108; apps/mobile/src/features/team/service.ts:118; apps/mobile/src/features/settings/index.tsx:451

## S9.06 Project picker.
- Should: The user can pick one of their projects so the chat or task runs in that project.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5273; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2420; apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:180; apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:128; apps/mobile/app/(app)/(tabs)/chat.tsx:900; apps/cli/src/lib.rs:994; apps/cli/src/lib.rs:1866; apps/extension-vscode/src/features/projects/projectActions.ts:177

## S9.07 Repository picker.
- Should: The user can choose which code repository a coding session works in, from a list or by URL/path.
- Status: web partial, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/CodeComposer.tsx:328; apps/desktop/electron/runtime/dispatcher.ts:704; apps/cli/src/lib.rs:416; apps/cli/src/lib.rs:2965; apps/extension-vscode/src/platform/workspaceFolders.ts:16; apps/extension-vscode/src/platform/workspaceFolders.ts:4
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S9.08 Branch picker.
- Should: The user can pick the branch a coding session starts from or works on from a list of the repository's branches.
- Status: web partial, desktop done, mobile missing, cli missing
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/CodeComposer.tsx:880; apps/web/features/code/components/CodeComposer.tsx:903; apps/web/features/code/components/CodeComposer.tsx:923; apps/desktop/electron/runtime/gitService.ts:195; apps/desktop/electron/runtime/gitService.ts:223; apps/desktop/electron/runtime/dispatcher.ts:553
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S9.09 Device picker.
- Should: The user can pick which device is used (microphone, speaker, camera or paired computer) from a list.
- Status: web done, desktop done, cli missing, chrome missing
- Code: apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:10; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:87; apps/web/features/chat/components/Voice/VoiceComposer.tsx:139

## S9.10 Permission-scope picker.
- Should: When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/Settings/ApiKeys.tsx:254; apps/web/features/settings/services/user-preferences.ts:541; apps/web/features/settings/sections/AccountSection.tsx:22; apps/mobile/app/(app)/settings/auto-approve.tsx:45; apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts:74; apps/mobile/src/features/settings/capabilities/index.tsx:150; apps/cli/src/tui/widgets/approval_overlay.rs:72; apps/cli/src/tui/widgets/approval_overlay.rs:366

## S9.11 Member and recipient picker.
- Should: The user can pick one or more people (workspace members or recipients) by name or email to share with, invite or assign.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:398; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:221; apps/web/app/chat/projects/[id]/page.tsx:631; apps/web/features/projects/components/ProjectSharingControls.tsx:223

## S9.12 Recurrence editor.
- Should: When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:215; apps/web/lib/services/schedule-service.ts:536; apps/web/features/schedules/components/SchedulesPage.tsx:960; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:238; apps/mobile/src/features/schedules/service.ts:116; apps/mobile/app/(app)/schedules/create.tsx:237; apps/cli/src/lib.rs:1105; apps/cli/src/lib.rs:2163

## S9.13 File browser.
- Should: The user can browse their stored files (uploads and generated outputs) in a list or grid, open one, and filter or search it.
- Status: web done, desktop done, mobile done, cli missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:836; apps/web/app/api/library/route.ts:67; apps/web/app/chat/library/page.tsx:17; apps/mobile/src/features/library/index.tsx:249; apps/mobile/src/features/library/libraryClient.ts:53; apps/mobile/app/(app)/library/index.tsx:4

## S9.14 Folder tree.
- Should: Files are shown in a nested folder tree the user can expand and collapse to reach a file.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: packages/ui/ui/src/directory/SkillFileViewer.tsx:115; packages/ui/ui/src/directory/SkillFileViewer.tsx:99; packages/ui/ui/src/directory/SkillDetailView.tsx:148; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967

## S9.15 Data table.
- Should: Tabular data is shown in a table with column headers that the user can sort (and scroll) to inspect the rows.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:190; packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:32; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1042; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:139; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:250; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:329; apps/cli/src/markdown.rs:474; apps/cli/src/claude_parity.rs:832

## S9.16 Resource grid.
- Should: Resources (files, artifacts, projects) are shown as a grid of cards the user can scan and open.
- Status: web done, desktop done, mobile done
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:885; packages/ui/unified-chat/src/components/library/LibraryView.tsx:952; apps/web/app/api/library/route.ts:67; apps/web/app/chat/library/page.tsx:17; apps/mobile/src/features/library/index.tsx:272; apps/mobile/src/features/library/libraryClient.ts:53

## S9.17 Media gallery.
- Should: The user can browse their images and videos as a gallery and open one in a larger viewer.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:80; packages/ui/unified-chat/src/components/library/LibraryView.tsx:680; packages/ui/unified-chat/src/components/library/LibraryView.tsx:797; apps/web/app/chat/library/page.tsx:17; apps/mobile/src/features/library/index.tsx:205; apps/mobile/src/features/library/index.tsx:250; apps/mobile/src/features/library/libraryClient.ts:53; apps/cli/src/cloud/library.rs:40

## S9.18 Image comparison slider.
- Should: After an image edit, the user can drag a slider over one frame to compare the original and edited images.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S9.19 Timeline.
- Should: The steps of a run are shown in time order, each with its state and (where known) how long it took.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:1020; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/web/lib/hooks/useChatStream.ts:1436; apps/mobile/src/features/chat/components/MessageBubble.tsx:795; apps/mobile/stores/chat/chatExecutionStore.ts:670; apps/cli/src/tui/tui_app.rs:168; apps/cli/src/tui/tui_app.rs:4865; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5107

## S9.20 Activity feed.
- Should: The user can see a feed of recent account events (sign-ins, changes, runs), newest first.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/components/RecentActivityPanel.tsx:63; apps/web/features/settings/components/RecentActivityPanel.tsx:121; apps/web/features/settings/hooks/use-settings-queries.ts:1454; apps/web/features/settings/sections/AccountSection.tsx:784; apps/mobile/src/features/settings/account-security/index.tsx:435; apps/mobile/src/features/settings/account-security/service.ts:162

## S9.21 Task board.
- Should: Tasks are laid out as a board with a column per status so the user sees and manages work by stage.
- Status: web done, desktop done, cli missing, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:84; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:592; packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx:46; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:46

## S9.22 Stepper.
- Should: A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/app/gallery/GalleryClient.tsx:779; apps/web/app/gallery/GalleryClient.tsx:818; apps/web/app/gallery/GalleryClient.tsx:717; apps/web/app/gallery/GalleryClient.tsx:1535; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:106; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:237; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:146; apps/mobile/app/(app)/companion/index.tsx:270

## S9.23 Multi-step setup wizard.
- Should: A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/onboarding/components/OnboardingWizard.tsx:112; apps/web/features/onboarding/components/OnboardingWizard.tsx:140; apps/web/features/onboarding/components/OnboardingWizard.tsx:83; apps/web/features/onboarding/lib/onboarding-preferences.ts:65; apps/web/app/welcome/page.tsx:29; apps/mobile/app/(public)/onboarding.tsx:129; apps/mobile/app/(public)/onboarding.tsx:258; apps/mobile/app/(public)/onboarding.tsx:236

## S9.24 Split-pane container.
- Should: Two panes sit side by side (e.g. chat and artifact) and the user can resize the split, by pointer and by keyboard.
- Status: web done, desktop done, cli missing, vscode done
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:471; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:412; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428; apps/web/features/chat/pages/WebChatPage.tsx:5834; apps/extension-vscode/src/platform/applyEdit.ts:78; apps/extension-vscode/src/core/commandSetup.ts:970

## S9.25 Docking layout manager.
- Should: The user can move panels to different positions (left, right, bottom, floating) and the layout keeps that arrangement.
- Status: web missing, desktop missing, vscode done
- Code: apps/extension-vscode/package.json:799; apps/extension-vscode/src/core/chatSetup.ts:60

## S9.26 Version-history panel.
- Should: A panel lists a resource's saved versions (when, what) and lets the user open or restore one.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:61; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1318; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1000; apps/cli/src/tui/tui_app.rs:3005; apps/cli/src/tui/widgets/checkpoint_picker.rs:46; apps/cli/src/repl/registry.rs:986

## S9.27 Diff viewer.
- Should: Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/code/components/CodeChangesPanel.tsx:39; apps/web/features/code/components/CodeChangesPanel.tsx:140; apps/web/features/code/services/cloud-code-api.ts:398; apps/web/features/code/CloudCodePage.tsx:1224; apps/mobile/src/features/companion/components/CodeSessionView.tsx:336; apps/mobile/src/features/companion/components/CodeSessionView.tsx:345; apps/mobile/app/(app)/companion/code/[threadId].tsx:25; apps/cli/src/tui/tui_app.rs:3974

## S9.28 Source inspector.
- Should: The user can open an answer's sources and see each one's title, origin and the excerpt it contributed, then open it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2739; apps/web/features/chat/components/research/ResearchPanel.tsx:556; apps/web/features/chat/components/research/ResearchPanel.tsx:141; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:126; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:191; apps/extension/src/features/side-panel/sources.ts:42

## S9.29 Usage meter.
- Should: A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/UsageSection.tsx:101; apps/web/lib/hooks/useManagedUsageSummary.ts:67; apps/web/app/settings/usage/page.tsx:6; apps/mobile/src/features/settings/cloud-usage/index.tsx:300; apps/mobile/services/usage.ts:47; apps/cli/src/usage_summary.rs:297; apps/cli/src/usage_summary.rs:203; apps/cli/src/tui/tui_app.rs:3897

## S9.30 Credit-balance card.
- Should: The user sees their purchased credit balance in one place, next to a way to add credits.
- Status: web done, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/features/settings/sections/UsageSection.tsx:500; apps/web/lib/hooks/useManagedUsageSummary.ts:67; apps/web/features/settings/sections/BillingSection.tsx:988; apps/cli/src/usage_summary.rs:250; apps/cli/src/usage_summary.rs:319; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2985; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2992; apps/extension-vscode/src/utils/api.ts:779

## S9.31 Permission summary.
- Should: One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/connectors/components/ConnectorScopeList.tsx:26; apps/web/features/connectors/components/ConnectorScopeList.tsx:18; apps/web/features/connectors/components/ConnectorScopeList.tsx:63; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:841; apps/mobile/src/features/settings/capabilities/index.tsx:230; apps/mobile/src/features/settings/capabilities/index.tsx:147; apps/mobile/src/features/settings/capabilities/index.tsx:244; apps/cli/src/tui/tui_app.rs:4019

## S9.32 Approval card.
- Should: When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:473; packages/ui/unified-chat/src/components/ToolCallCard.tsx:479; apps/web/features/chat/components/messages/MessageBubble.tsx:1872; apps/web/lib/hooks/useChatStream.ts:1031; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:226; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:280; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:285; apps/cli/src/tui/widgets/approval_overlay.rs:312

## S9.33 Integration connection card.
- Should: Each integration shows a card with its connection state (connected, expired, not connected) and the action to connect or disconnect.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:289; packages/ui/ui/src/directory/ConnectorDetailView.tsx:295; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:686; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/mobile/src/features/settings/cloud-connectors/index.tsx:430; apps/mobile/src/features/settings/cloud-connectors/index.tsx:699; apps/cli/src/cloud/connectors.rs:138; apps/cli/src/cloud/connectors.rs:120

## S9.34 Capability-warning card.
- Should: Before sending, a visible notice warns when the chosen model cannot handle something in the request (images, tools, attachments, context size).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:21; apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:28; apps/web/features/chat/components/Composer/model-compatibility.ts:90; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1523; apps/mobile/src/features/chat/components/ChatInput.tsx:880

## S9.35 Task-progress card.
- Should: A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:302; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:293; apps/web/features/chat/pages/WebChatPage.tsx:5817; apps/mobile/app/(app)/companion/agent/[id].tsx:239; apps/mobile/src/features/companion/components/AgentDashboard.tsx:113; apps/cli/src/tui/tui_app.rs:1575; apps/cli/src/tui/tui_app.rs:1577; apps/cli/src/tui/tui_app.rs:1557

## S9.36 Interactive result widget.
- Should: An answer can embed a widget the user operates in place (choices, map, app card), and the choice or state feeds back into the conversation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:90; apps/web/features/chat/components/messages/MessageBubble.tsx:2020; apps/web/features/chat/pages/WebChatPage.tsx:5716; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:593; apps/extension/src/features/side-panel/interactiveCards.ts:394; apps/extension/src/side_panel.ts:6087; apps/extension/src/features/side-panel/bubbles.ts:124

## S9.37 Notification inbox.
- Should: An inbox lists the user's notifications newest first, marks which are unread (visibly and for screen readers), and lets them open or mark them read.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/notifications/components/NotificationBell.tsx:74; apps/web/features/notifications/components/NotificationBell.tsx:92; apps/web/features/notifications/components/NotificationBell.tsx:100; apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/mobile/app/(app)/notifications/index.tsx:93

## S9.38 Keyboard-command palette.
- Should: A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- Status: web done, desktop done, mobile partial, cli done, vscode done, chrome done
- Code: apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16; apps/web/shared/components/CommandPalette/CommandPalette.tsx:453; apps/web/shared/components/CommandPalette/CommandPalette.tsx:192; apps/web/app/AppRuntimeMounts.tsx:19; apps/mobile/src/features/search/mobileDestinations.ts:180; apps/cli/src/tui/tui_app.rs:2449; apps/cli/src/tui/tui_app.rs:2767; apps/cli/src/tui/widgets/command_popup.rs:87
- Unfinished: mobile: D-2026-09-28-27: a global command palette is not built on mobile.

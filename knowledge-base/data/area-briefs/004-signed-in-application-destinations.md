# Area 4. Signed-in application destinations

44 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S4.01 New-chat home.
- Should: Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/features/chat/pages/WebChatPage.tsx:5648; apps/web/features/chat/pages/WebChatPage.tsx:4943; apps/mobile/app/(app)/(tabs)/chat.tsx:816; apps/mobile/app/(app)/(tabs)/chat.tsx:902; apps/mobile/src/features/drawer/components/DrawerContent.tsx:296; apps/cli/src/tui/tui_app.rs:1447

## S4.02 Existing conversation.
- Should: Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/chat/[sessionId]/page.tsx:3; apps/web/features/chat/pages/WebChatPage.tsx:896; apps/web/features/chat/pages/WebChatPage.tsx:1785; apps/mobile/app/(app)/chat/[id].tsx:304; apps/mobile/src/features/drawer/components/DrawerContent.tsx:490; apps/cli/src/tui/tui_app.rs:3545; apps/cli/src/tui/tui_app.rs:2708; apps/extension-vscode/src/core/commandSetup.ts:1243

## S4.03 Conversation search.
- Should: A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5252; packages/ui/ui/src/sidebar/Sidebar.tsx:577; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:378; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:185; apps/web/features/chat/services/global-search-service.ts:161; apps/mobile/src/features/drawer/components/DrawerContent.tsx:304; apps/mobile/src/features/chat/ChatsListScreen.tsx:140; apps/cli/src/lib.rs:269

## S4.04 Archived conversations.
- Should: A destination lists the user's archived conversations and lets them open, restore or delete them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/app/settings/archived/page.tsx:5; apps/web/features/settings/components/WebSettingsModal.tsx:200; apps/web/features/settings/sections/ArchivedChatsSection.tsx:59; apps/web/features/settings/sections/ArchivedChatsSection.tsx:110; packages/ui/ui/src/sidebar/Sidebar.tsx:610; apps/mobile/app/(app)/settings/archived-chats.tsx:49; apps/mobile/src/features/settings/index.tsx:559; apps/mobile/src/features/archived-chats/service.ts:44

## S4.05 Pinned conversations.
- Should: Conversations the user pinned are shown together in a pinned section or filter and open from there.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:852; packages/ui/ui/src/sidebar/SessionItem.tsx:329; apps/web/features/chat/pages/WebChatPage.tsx:4189; apps/web/features/chat/pages/WebChatPage.tsx:5307; apps/mobile/src/features/chat/ChatsListScreen.tsx:75; apps/mobile/src/features/chat/ChatsListScreen.tsx:174; apps/mobile/src/features/conversation-actions/useConversationActions.ts:124

## S4.06 Projects index.
- Should: A Projects destination lists the user's projects and lets them open or create one.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/shared/components/layout/app-nav-items.ts:99; apps/web/app/chat/projects/page.tsx:393; apps/web/features/projects/hooks/use-managed-cloud-projects.ts:36; apps/mobile/src/features/drawer/components/DrawerContent.tsx:86; apps/mobile/app/(app)/(tabs)/projects.tsx:400; apps/mobile/app/(app)/(tabs)/projects.tsx:93; apps/cli/src/lib.rs:984; apps/cli/src/lib.rs:1831

## S4.07 Project overview.
- Should: Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/chat/projects/[id]/page.tsx:965; apps/web/app/chat/projects/[id]/page.tsx:994; apps/web/app/chat/projects/[id]/page.tsx:100; apps/mobile/app/(app)/projects/[id].tsx:99; apps/mobile/app/(app)/projects/[id].tsx:111; apps/cli/src/lib.rs:2101; apps/cli/src/cloud/mod.rs:287; apps/extension-vscode/src/core/commandSetup.ts:2247

## S4.08 Project conversations.
- Should: Within a project, a list of the project's conversations that open when selected.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: apps/web/app/chat/projects/[id]/page.tsx:1092; apps/web/app/chat/projects/[id]/page.tsx:1152; apps/web/app/chat/projects/[id]/page.tsx:117; apps/mobile/app/(app)/projects/[id].tsx:319; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:64; apps/extension-vscode/src/features/projects/projectActions.ts:107; apps/extension-vscode/src/features/projects/projectActions.ts:201

## S4.09 Project files and sources.
- Should: Within a project, a files/sources view lists the project's knowledge files and lets the user add and remove them.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227; apps/web/lib/services/entitlement-resolution.ts:285

## S4.10 Project instructions.
- Should: A place to view and edit a project's instructions, which then apply to chats in that project.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/projects/components/ProjectSettingsDialog.tsx:218; apps/web/features/projects/components/ProjectSettingsDialog.tsx:99; apps/web/app/chat/projects/[id]/page.tsx:623; apps/mobile/app/(app)/(tabs)/projects.tsx:565; apps/mobile/app/(app)/(tabs)/projects.tsx:170; apps/mobile/src/features/projects/store.ts:266; apps/cli/src/repl/registry.rs:1450; apps/cli/src/memory.rs:25

## S4.11 Project members.
- Should: A project members view shows who has access to a project and lets the owner add or remove people.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectSharingControls.tsx:157; apps/web/features/projects/components/ProjectSharingControls.tsx:223; apps/web/lib/services/org-sharing-service.ts:82; apps/web/db/neon/0316_project_owner_sharing.sql:76

## S4.12 Project Memory.
- Should: A project memory view shows what has been remembered for that project, with scope controls, separately from account memory.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectSettingsDialog.tsx:345; apps/web/features/projects/components/ProjectSettingsDialog.tsx:360; apps/web/features/projects/components/ProjectMemoryPanel.tsx:17; apps/cli/src/repl/registry.rs:1450; apps/cli/src/memory.rs:194; apps/cli/src/tui/tui_app.rs:3792

## S4.13 Work-task home.
- Should: A home for agentic work where the user states a goal for an autonomous multi-step (AGI Work) run and can reach their recent work.
- Status: web done, desktop done, mobile done, cli missing, chrome done
- Code: apps/web/app/chat/page.tsx:9; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2236; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:877; apps/web/features/tasks/components/TasksPage.tsx:39; apps/mobile/src/features/drawer/components/DrawerContent.tsx:144; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:437; apps/mobile/src/features/tasks/startWork.ts:38; apps/extension/src/side_panel.ts:8718

## S4.14 Active-task dashboard.
- Should: A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: apps/web/app/tasks/page.tsx:12; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:464; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:199; apps/web/shared/components/CommandPalette/CommandPalette.tsx:187; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:448; apps/mobile/src/features/tasks/runPresentation.ts:15; apps/mobile/src/features/tasks/service.ts:29; apps/extension-vscode/src/core/commandSetup.ts:2196

## S4.15 Task details and transcript.
- Should: Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:785; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:89; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:338; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:301; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:189; apps/mobile/src/features/tasks/service.ts:38; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:61; apps/extension-vscode/src/core/commandSetup.ts:2331

## S4.16 Approvals inbox.
- Should: An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:60; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:72; apps/mobile/src/features/tasks/runPresentation.ts:17; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:189; apps/mobile/src/features/tasks/service.ts:45; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:132; apps/extension-vscode/src/features/surfaces/treeQuickPick.ts:134

## S4.17 Scheduled-task manager.
- Should: A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/shared/components/layout/app-nav-items.ts:135; apps/web/app/chat/schedules/page.tsx:11; apps/web/features/schedules/components/SchedulesPage.tsx:683; apps/web/features/schedules/components/SchedulesPage.tsx:215; apps/mobile/src/features/drawer/components/DrawerContent.tsx:122; apps/mobile/app/(app)/schedules/index.tsx:60; apps/mobile/src/features/schedules/service.ts:105; apps/cli/src/schedules.rs:293

## S4.18 Routine details.
- Should: Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:284; apps/web/features/schedules/components/SchedulesPage.tsx:430; apps/web/features/schedules/components/ScheduleRunHistory.tsx:121; apps/mobile/src/features/schedules/components/ScheduleCard.tsx:215; apps/mobile/src/features/schedules/service.ts:163; apps/cli/src/lib.rs:1139; apps/cli/src/lib.rs:2199; apps/extension-vscode/src/core/commandSetup.ts:2235

## S4.19 Coding-session home.
- Should: A coding home lists the user's coding sessions and starts a new one on a repository or runtime.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/app/code/page.tsx:11; packages/ui/ui/src/sidebar/Sidebar.tsx:555; apps/web/features/code/CloudCodePage.tsx:972; apps/web/features/code/services/cloud-code-api.ts:356; apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:122; apps/cli/src/tui/tui_app.rs:1447; apps/cli/src/lib.rs:4636; apps/cli/src/tui/tui_app.rs:3545

## S4.20 Coding-session workspace.
- Should: A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/app/code/[sessionId]/page.tsx:16; apps/web/features/code/CloudCodePage.tsx:1108; apps/web/features/code/CloudCodePage.tsx:1224; apps/web/features/code/services/cloud-code-api.ts:364; apps/mobile/app/(app)/companion/code/[threadId].tsx:44; apps/mobile/src/features/companion/components/CodeSessionView.tsx:46; apps/cli/src/tui/tui_app.rs:1447; apps/cli/src/lib.rs:4636

## S4.21 Remote devices.
- Should: A devices destination lists the user's linked devices with status/last activity and lets them manage (rename, unlink, pair) them.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/AccountSection.tsx:529; apps/web/features/settings/components/LinkedDevicesPanel.tsx:148; apps/web/features/settings/components/LinkedDevicesPanel.tsx:100; apps/mobile/src/features/drawer/components/DrawerContent.tsx:129; apps/mobile/app/(app)/companion/index.tsx:126; apps/mobile/app/(app)/companion/index.tsx:256

## S4.22 Remote-session viewer.
- Should: A viewer opens a session running on another of the user's devices and shows its live transcript/state with controls.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/app/(app)/companion/code/[threadId].tsx:44; apps/mobile/src/features/companion/remote-code/service.ts:33

## S4.23 Library.
- Should: A Library destination lists everything the account produced or uploaded (files, images, videos, documents, artifacts) with filters and open/download actions.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/shared/components/layout/app-nav-items.ts:116; apps/web/app/chat/library/page.tsx:17; packages/ui/unified-chat/src/components/library/LibraryView.tsx:82; apps/web/features/library/components/LibraryView.tsx:144; apps/mobile/src/features/drawer/components/DrawerContent.tsx:98; apps/mobile/src/features/library/index.tsx:42; apps/mobile/src/features/library/libraryClient.ts:52; apps/cli/src/cloud/library.rs:40

## S4.24 Shared-with-me resources.
- Should: A destination lists resources (projects, conversations, artifacts, connectors) that other people shared with the user, and opens them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/workspace/sharing/page.tsx:10; apps/web/features/settings/sections/OrganizationSharingSection.tsx:440; apps/web/app/api/settings/organization/shared/route.ts:54; apps/web/app/chat/projects/[id]/page.tsx:976

## S4.25 Artifact gallery.
- Should: An artifact gallery lists the user's generated artifacts and opens any of them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/chat/artifacts/page.tsx:21; packages/ui/unified-chat/src/components/library/LibraryView.tsx:82; apps/web/features/library/components/LibraryView.tsx:144; apps/mobile/src/features/library/index.tsx:262; apps/mobile/src/features/library/index.tsx:83; apps/cli/src/lib.rs:1023; apps/cli/src/lib.rs:1888; apps/cli/src/tui/tui_app.rs:3312

## S4.26 Artifact editor.
- Should: An artifact editor lets the user edit an artifact's content directly and saves the result as a new version.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1340; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485

## S4.27 Image studio.
- Should: A dedicated image studio where the user writes a prompt, picks style/size options, generates images and sees results/history in one place.
- Status: web unverified, desktop unverified, mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:233; apps/mobile/src/features/image/components/ImageAreaEditor.tsx:284; apps/mobile/src/features/image/components/ImageAreaEditor.tsx:146; apps/mobile/src/features/image/services/imageMask.ts:187; apps/mobile/app/(app)/chat/[id].tsx:1453; apps/mobile/app/(app)/chat/[id].tsx:1477; apps/mobile/src/features/library/index.tsx:294; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:271

## S4.28 Image collection.
- Should: An image collection view shows all images the user generated or uploaded, with open/download/remix actions.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:82; packages/ui/unified-chat/src/components/library/LibraryView.tsx:96; apps/web/features/library/components/LibraryView.tsx:144; apps/mobile/src/features/library/index.tsx:95; apps/mobile/src/features/library/libraryClient.ts:52

## S4.29 Video studio.
- Should: A dedicated video studio where the user prompts, configures and generates videos and sees results/history in one place.
- Status: not applicable anywhere

## S4.30 Media job history.
- Should: A media job history lists image/video generation jobs with their status (queued, running, failed, done) and links to results.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/media/jobs/route.ts:20; apps/web/lib/server/media-job-history.ts:156; packages/ui/unified-chat/src/components/library/LibraryView.tsx:883; packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:49; apps/web/features/library/components/LibraryView.tsx:225; apps/desktop/src/features/library/DesktopLibrary.tsx:185; apps/mobile/src/features/library/index.tsx:678; apps/mobile/src/features/library/libraryClient.ts:145

## S4.31 Notebook workspace.
- Should: A notebook workspace holds a set of sources and notes that the user reads, annotates and chats over, with generated outputs (NotebookLM-style).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectSourcesPanel.tsx:20; apps/web/features/chat/pages/web-chat-layout.ts:3; apps/web/features/projects/components/ProjectStudio.tsx:30; apps/web/features/projects/components/AddSourcesModal.tsx:108

## S4.32 Research report reader.
- Should: A research report reader lists the user's research reports and opens one with its sections and cited sources.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5832; apps/web/features/chat/components/research/ResearchReportsGallery.tsx:96; apps/web/features/chat/components/research/ResearchPanel.tsx:400; apps/mobile/src/features/drawer/components/DrawerContent.tsx:108; apps/mobile/src/features/research/ReportsScreen.tsx:222; apps/mobile/src/features/research/service.ts:116

## S4.33 Custom-assistant manager.
- Should: A signed-in destination lists the user's custom assistants (GPT/Gem-style) and lets them open, create, edit and delete them.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:447; apps/cli/src/agents.rs:726; apps/cli/src/agents.rs:744; apps/cli/src/agents.rs:767

## S4.34 Custom-assistant builder.
- Should: A builder lets the user define a custom assistant (name, instructions, knowledge, tools, starters), preview it and save it.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S4.35 Skills manager.
- Should: A skills manager lists installed and available skills and lets the user install, enable/disable, author and remove them.
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/app/skills/page.tsx:8; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1029; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1109; apps/web/features/directory/services/skills-directory.ts:197; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/tui/tui_app.rs:3932; apps/cli/src/tui/tui_app.rs:731; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:197

## S4.36 Plugins manager.
- Should: A plugins manager lists installed and available plugins and lets the user install, configure, update and remove them.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/app/chat/customize/page.tsx:5; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1109; apps/web/features/directory/services/plugins-directory.ts:779; apps/web/features/directory/services/plugins-directory.ts:823; apps/cli/src/lib.rs:3986; apps/cli/src/tui/tui_app.rs:3762; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:342; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:285

## S4.37 Connected accounts.
- Should: A connected-accounts destination lists the third-party services the user has connected and lets them connect, reconnect and disconnect each.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/app/settings/connections/page.tsx:7; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:640; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:686; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:780; apps/mobile/app/(app)/connectors/index.tsx:1; apps/mobile/src/features/settings/cloud-connectors/index.tsx:695; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:352; apps/mobile/services/connectors.ts:61

## S4.38 Model catalog.
- Should: A model catalog lists the models the user can reach with capabilities/context/price and lets them pick one or set a default.
- Status: web done, desktop done, mobile done, cli done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1578; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:623; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:528; apps/web/features/models/components/ModelCard.tsx:135; apps/web/lib/server/model-catalogue.ts:242; apps/web/features/settings/sections/GeneralSection.tsx:1060; apps/web/features/settings/sections/GeneralSection.tsx:1072; apps/mobile/app/(app)/(tabs)/chat.tsx:880

## S4.39 Usage dashboard.
- Should: A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/app/settings/usage/page.tsx:1; apps/web/features/settings/components/WebSettingsModal.tsx:203; apps/web/features/settings/sections/UsageSection.tsx:397; apps/web/features/settings/sections/UsageSection.tsx:218; apps/mobile/src/features/settings/index.tsx:578; apps/mobile/src/features/settings/cloud-usage/index.tsx:176; apps/mobile/services/usage.ts:45; apps/cli/src/lib.rs:4049

## S4.40 Billing settings.
- Should: A billing settings destination shows the current plan, renewal, payment method and invoices, and lets the user change or cancel the plan.
- Status: web partial, desktop partial, mobile partial
- Code: apps/web/features/settings/sections/BillingSection.tsx:304; apps/mobile/src/features/settings/index.tsx:434; apps/mobile/src/features/settings/cloud-billing/index.tsx:128; apps/mobile/lib/v1FeatureFlags.ts:1
- Unfinished: web: live-check: with a beta_redemptions-granted test account run Stripe test checkout, then /settings/billing on web and in Electron: plan, invoices, portal (opens externally in Electron) and the overage toggle work; migration 0281 is applied | desktop: live-check: with a beta_redemptions-granted test account run Stripe test checkout, then /settings/billing on web and in Electron: plan, invoices, portal (opens externally in Electron) and the overage toggle work; migration 0281 is applied | mobile: D-2026-09-28-27: web-billed plans are managed on the web; invoices, card and plan change link ou

## S4.41 Personal settings.
- Should: A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/settings/general/page.tsx:1; apps/web/features/settings/sections/GeneralSection.tsx:320; apps/web/app/settings/_lib/preferences-client.ts:162; apps/mobile/app/(app)/(tabs)/settings.tsx:1; apps/mobile/src/features/settings/index.tsx:476; apps/mobile/src/features/settings/index.tsx:345; apps/cli/src/tui/tui_app.rs:3864; apps/cli/src/repl/registry.rs:1864

## S4.42 Workspace administration.
- Should: A workspace administration destination lets an admin manage members, roles, invitations, policies and workspace settings.
- Status: web done, desktop done, cli missing, vscode missing, api done
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:190; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:40; apps/web/app/workspace/people/page.tsx:10; apps/web/features/settings/sections/TeamSection.tsx:395; apps/web/app/api/scim/v2/Users/route.ts:22

## S4.43 Developer console.
- Should: A developer console lets the user create/revoke API keys, see API usage per key, read API docs and try requests.
- Status: web done, desktop done
- Code: apps/web/features/settings/components/Settings/ApiKeys.tsx:207; apps/web/features/settings/components/Settings/ApiKeys.tsx:55; apps/web/app/api/developers/usage/route.ts:20; apps/web/lib/services/developer-usage-service.ts:37; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4869

## S4.44 Help and feedback.
- Should: A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:203; apps/web/shared/components/layout/AccountMenuItems.tsx:82; apps/web/shared/components/layout/WebAppShell.tsx:485; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:155; apps/mobile/src/features/settings/index.tsx:598; apps/mobile/src/features/feedback/index.tsx:45; apps/cli/src/cloud/feedback.rs:53; apps/cli/src/claude_parity.rs:157

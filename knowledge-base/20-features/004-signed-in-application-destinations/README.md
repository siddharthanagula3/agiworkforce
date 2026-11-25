---
id: "AREA-004"
type: "area"
title: "Signed-in application destinations"
features: ["F004-01", "F004-02", "F004-03", "F004-04", "F004-05", "F004-06", "F004-07", "F004-08", "F004-09", "F004-10", "F004-11", "F004-12", "F004-13", "F004-14", "F004-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 4. Signed-in application destinations

This area is the set of places a signed-in person can go inside the app: the new-chat home, past chats, search, archived and pinned chats, projects, AGI Work tasks, schedules, coding sessions, devices, the Library, shared items, agents, skills, plugins, connected accounts, models, usage, billing, settings, admin, developer keys and help. It is how a person finds and returns to everything the account holds. The web app owns most of these screens, and the other apps reuse them or build their own version on the same server routes.

**Who uses it.** Mostly every signed-in user. Some destinations depend on the plan: schedules need a plan that allows scheduled tasks (SchedulesPage.tsx:306), projects have a per-plan count limit (free-plan-entitlements.ts:10), and file storage has a per-plan byte limit (free-plan-entitlements.ts:18). Workspace members only see Shared items, Members and Sharing (org membership is required, organization/shared/route.ts:57). Only people with the sharing right can change what is shared (org-sharing-service.ts:82). Workspace admin pages are for admins. Developer keys are for people who use the API.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F004-01](F004-01-new-chat-and-past-chats.md) | New chat and past chats | built | built | built | built | built | built |
| [F004-02](F004-02-search-archived-and-pinned-chats.md) | Search, archived and pinned chats | built | built | built | partly | partly | no |
| [F004-03](F004-03-projects-list-overview-chats-instructions.md) | Projects: list, overview, chats, instructions | built | built | built | partly | built | partly |
| [F004-04](F004-04-project-sources-members-memory-and-notebook.md) | Project sources, members, memory and notebook | built | built | partly | partly | no | no |
| [F004-05](F004-05-agi-work-tasks-approvals-and-details.md) | AGI Work tasks, approvals and details | built | built | built | no | built | partly |
| [F004-06](F004-06-scheduled-tasks-and-routine-details.md) | Scheduled tasks and routine details | built | built | built | built | built | built |
| [F004-07](F004-07-coding-sessions.md) | Coding sessions | built | built | built | built | built | no |
| [F004-08](F004-08-devices-and-remote-sessions.md) | Devices and remote sessions | partly | partly | built | partly | no | no |
| [F004-09](F004-09-library-artifacts-images-and-media-jobs.md) | Library, artifacts, images and media jobs | partly | partly | partly | partly | no | no |
| [F004-10](F004-10-shared-items.md) | Shared items | built | built | no | no | no | no |
| [F004-11](F004-11-agents-custom-assistants.md) | Agents (custom assistants) | built | built | built | no | no | no |
| [F004-12](F004-12-skills-plugins-and-connected-accounts.md) | Skills, plugins and connected accounts | built | built | partly | partly | built | no |
| [F004-13](F004-13-models-usage-billing-and-settings.md) | Models, usage, billing and settings | partly | partly | partly | built | built | built |
| [F004-14](F004-14-workspace-admin-developer-console-and-help.md) | Workspace admin, developer console and help | built | built | built | partly | partly | no |
| [F004-99](F004-99-other-items.md) | Other items in Signed-in application destinations | built | built | built | no | no | no |

Requirement items for this area: [10-requirements/capabilities/004-signed-in-application-destinations.md](../../10-requirements/capabilities/004-signed-in-application-destinations.md).

## How this area works in the code

1. **Open a page.** A person goes to a web address like /chat, /chat/<id>, /tasks, /chat/library. Some are plain pages; others redirect to a pane in the settings panel or to the Library. (`apps/web/app/chat/page.tsx:9`, `apps/web/app/chat/[sessionId]/page.tsx:13`, `apps/web/app/chat/artifacts/page.tsx:7`, `apps/web/app/chat/customize/page.tsx:13`, `apps/web/features/settings/components/SettingsModalRedirect.tsx:40`)
2. **Show the shell.** Pages are wrapped in the app shell with the sidebar. The sidebar items (Chat, Projects, Library, and so on) come from one list. The chat root loads the chat page without server rendering. (`apps/web/shared/components/layout/app-nav-items.ts:90`, `apps/web/features/chat/components/WebChatRoot.tsx:11`, `packages/ui/ui/src/sidebar/Sidebar.tsx:263`)
3. **Pick a settings pane.** Settings routes turn the pane name into a link that opens the modal. Only listed pane names are allowed so a bad link cannot show an empty modal. (`apps/web/features/settings/lib/web-settings-sections.ts:18`, `apps/web/features/settings/components/WebSettingsModal.tsx:301`)
4. **Call the server.** The screen calls a route under /api (projects, schedules, library, search, custom-agents, settings/devices and others). Routes check the rate limit and the CSRF token on writes. (`apps/web/app/api/projects/route.ts:46`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts:68`, `apps/web/app/api/schedules/route.ts:138`, `apps/web/app/api/library/route.ts:276`, `apps/web/app/api/custom-agents/route.ts:44`)
5. **Scope the data to the person.** Routes get a database handle limited to the signed-in user and workspace, so a query only sees that person's rows. Shared projects are read through a readable-project check. (`apps/web/app/api/media/jobs/route.ts:19`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts:34`, `apps/web/lib/services/org-sharing-service.ts:82`)
6. **Check the plan.** Plan tiers set how many projects, how many scheduled tasks and how many bytes of files a person may hold. The server refuses with a message naming the plan. (`apps/web/lib/services/free-plan-entitlements.ts:10`, `apps/web/lib/services/free-plan-entitlements.ts:18`, `apps/web/lib/services/free-plan-entitlements.ts:54`, `apps/web/features/schedules/components/SchedulesPage.tsx:306`)
7. **Search.** The search dialog calls the search service, which sends one request to /api/search. The server runs case-insensitive matches on chat titles, project names, files, schedules and message text. (`apps/web/features/chat/services/global-search-service.ts:170`, `apps/web/app/api/search/route.ts:321`, `apps/web/app/api/search/route.ts:372`)
8. **Shared task and library screens.** Tasks and Library are drawn by shared components in the unified chat package. Web hands them a transport object (how to fetch, open, archive); the shared screen does the rest. Mobile has its own native screens on the same routes. (`apps/web/features/tasks/components/TasksPage.tsx:39`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:464`, `apps/web/features/library/components/LibraryView.tsx:144`, `apps/mobile/src/features/tasks/service.ts:29`)
9. **Other apps.** The CLI calls the same hosted routes through a client (schedules, library, projects, artifacts, memory, devices, code). Mobile hides parts by a flag file. (`apps/cli/src/schedules.rs:293`, `apps/cli/src/cloud/library.rs:7`, `apps/cli/src/lib.rs:1073`, `apps/mobile/lib/v1FeatureFlags.ts:1`)

## Files to know

| File | Role |
|---|---|
| `apps/web/shared/components/layout/app-nav-items.ts` | The list of sidebar destinations (Chat, Projects, Library, Sites, Study, and others) with their links. |
| `apps/web/features/chat/components/WebChatRoot.tsx` | Entry point for the new-chat and existing-chat pages. |
| `packages/ui/ui/src/sidebar/Sidebar.tsx` | Shared sidebar: recents, pinned, archived view, projects and search button. |
| `apps/web/features/settings/lib/web-settings-sections.ts` | The allowed settings panes and old-name aliases for deep links. |
| `apps/web/app/api/search/route.ts` | Server search across chats, projects, files and schedules. |
| `apps/web/app/chat/projects/[id]/page.tsx` | Project home with its tabs, composer, menu and settings. |
| `apps/web/lib/services/free-plan-entitlements.ts` | Plan limits and the messages shown when a limit is hit. |
| `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Shared AGI Work task list with filters, detail and approvals. |
| `apps/web/features/schedules/components/SchedulesPage.tsx` | Scheduled-task manager screen. |
| `apps/web/app/api/library/route.ts` | Library listing and artifact save. |
| `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | Linked devices list with rename and unlink. |
| `apps/mobile/lib/v1FeatureFlags.ts` | Turns mobile features on or off for version 1. |

## What is stored

- Chats (title, archived, pinned, deleted time, temporary flag) and their messages: database tables web_conversations and its messages (apps/web/app/api/search/route.ts:372, apps/web/app/api/chat/conversations/bulk/route.ts:74)
- Projects and their knowledge files: tables user_projects and project_knowledge_files (apps/web/app/api/projects/[id]/knowledge-files/route.ts:47)
- Who a project is shared with: tables organization_shared_projects and organization_project_access (apps/web/db/neon/0316_project_owner_sharing.sql:76)
- Library files, images and artifacts: table media_assets (apps/web/lib/server/media-job-history.ts:193)
- Video generation jobs: table video_generation_jobs (apps/web/lib/server/media-job-history.ts:142)
- Schedules and their runs: tables scheduled_tasks and scheduled_task_runs (apps/web/app/api/schedules/[id]/share/route.ts:42, apps/web/lib/services/retention-service.ts:392)
- Linked devices: tables desktop_devices, mobile_devices, device_refresh_tokens, device_registrations (apps/web/app/api/settings/devices/route.ts:122)
- API key use per request: tables managed_usage_requests and api_keys (apps/web/lib/services/developer-usage-service.ts:37)
- Tasks layout choice (list or board): browser localStorage key agi-tasks-layout (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:93)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Mobile v1 feature flags (projects, schedules, cloudTasks, research, billing=false, companion=false, dispatch=false, videoGen=false, skills, connectors)**: Hide or show whole destinations in the mobile drawer and block their calls. (apps/mobile/lib/v1FeatureFlags.ts:1; apps/mobile/src/features/drawer/components/DrawerContent.tsx:564; apps/mobile/services/companion.ts:133; apps/mobile/src/features/billing/service.ts:9)
- **Plan project limit**: Refuses creating projects above the plan count. (apps/web/lib/services/free-plan-entitlements.ts:10)
- **Plan storage limit**: Refuses adding project sources or files above the plan bytes. (apps/web/lib/services/free-plan-entitlements.ts:18)
- **Plan scheduled-task limit**: Hides schedule creation when the plan allows none. (apps/web/features/schedules/components/SchedulesPage.tsx:306)
- **Workspace permissions sharing.manage and content.share**: Decide who can change project sharing. (apps/web/lib/services/org-sharing-service.ts:82)
- **Health space requirement on the Health nav item**: Shows Health only when a health space exists. (apps/web/shared/components/layout/app-nav-items.ts:130)
- **Initial work mode from the x-agi-pathname header**: Opens AGI Work mode when the path is /agi-work. (apps/web/app/chat/page.tsx:9)

## Shared between apps

Shared: the sidebar (packages/ui/ui/src/sidebar/Sidebar.tsx), the tasks screen and the library screen (packages/ui/unified-chat/src/components/tasks and library), the plan limits in the types package, and the cloud contracts used by routes and clients. Desktop shows the hosted web app, so it gets the web screens. Separate per app: mobile has its own native screens under apps/mobile/src/features and its drawer; the CLI has Rust commands under apps/cli/src; VS Code has tree views and commands under apps/extension-vscode/src; Chrome has its own side panel in apps/extension/src/side_panel.ts.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says Custom-assistant manager and builder are missing on web and mobile, but web has /chat/agents with list, new and editor pages and /api/custom-agents routes, and mobile has agents screens. (apps/web/app/chat/agents/page.tsx:1; apps/web/app/api/custom-agents/route.ts:44; apps/mobile/app/(app)/agents/index.tsx:1)
- Brief lists mobile Remote devices as done, but the mobile flag file sets companion and dispatch to false, and the drawer item list has no Devices entry. (apps/mobile/lib/v1FeatureFlags.ts:1; apps/mobile/src/features/drawer/components/DrawerContent.tsx:67)
- Brief says CLI has no Remote devices and no Connectors, but the CLI has a devices command and a connectors command. (apps/cli/src/lib.rs:1100; apps/cli/src/lib.rs:3452)
- Brief says Remote devices should allow pair, but the web linked-devices panel only rename (PATCH) and unlink (DELETE); no pair action found. (apps/web/features/settings/components/LinkedDevicesPanel.tsx:176)
- Image studio: brief wants a dedicated studio, but /chat/images is only a redirect to the Library Images tab. (apps/web/app/chat/images/page.tsx:1)
- Approvals inbox: the web has a 'Needs you' filter inside the tasks page, not a separate inbox. It covers Cloud runs only, not schedule run approvals, which are resolved from the schedule card. (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:60; apps/web/features/schedules/components/SchedulesPage.tsx:430)
- Shared-with-me is a workspace sharing overview (what the workspace shares), not a personal list of what others shared with me. A separate shared-with-me artifacts route exists but is not cited by the brief. (apps/web/app/workspace/sharing/page.tsx:10; apps/web/app/api/artifacts/shared-with-me)
- Video studio is marked not applicable everywhere, yet video generation routes and a jobs table exist. (apps/web/app/api/media/video; apps/web/lib/server/media-job-history.ts:142)
- Brief points S4.09 at entitlement-resolution.ts:285, which is the entitlement bundle builder and not the knowledge-files code. Many brief line numbers are stale (for example WebChatPage.tsx:5648 and Sidebar.tsx:577 now land on unrelated code). (apps/web/lib/services/entitlement-resolution.ts:285; apps/web/features/chat/pages/WebChatPage.tsx:5648)
- The workspace-sharing page lists items only for workspace members. (apps/web/app/api/settings/organization/shared/route.ts:57)
- Billing is partial on web, desktop and mobile; the brief says live checks with test checkout and migration 0281 are still to be done. (apps/web/features/settings/sections/BillingSection.tsx:304)

## Not established

- I did not open the desktop-only code in apps/desktop/src (for example DesktopLibrary.tsx) or the Tauri side, so how desktop differs from web is taken from AGENTS.md and the brief.
- I did not verify the VS Code extension and Chrome extension destinations beyond seeing the files exist.
- I did not read the CLI commands in detail (projects, schedules, artifacts, memory, code, usage, keys); I only saw their definitions in lib.rs.
- I could not confirm the plan gate for coding sessions, notebook workspace, or custom assistants.
- I did not read the web usage and billing routes' limits per window (session, weekly, credits), so the exact windows are not described.
- I did not open the workspace admin pages beyond Members and Sharing, nor SCIM, so roles, policies and invitations are described from the brief only.
- I did not run anything, so the redirects and empty states described come from reading code, not from seeing the screens.
- Unknown how the Chrome extension side panel reaches any of these destinations beyond the work home.

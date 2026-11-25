---
id: "F010-01"
type: "feature"
title: "Create and rename"
aliases: ["Create project", "New project", "Rename conversation", "Rename chat", "Edit project", "S10.01", "S10.02", "Rename session"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S10.01", "S10.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "api:POST /api/projects", "api:PATCH /api/chat/conversations/[id]", "table:user_projects", "table:web_conversations", "store:mobile-project-store", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-01 Create and rename

Lets a signed-in person make a new project and change the title of a chat or project. Web and the Electron desktop share one web implementation. Mobile and CLI have their own. Chrome can rename chats in its history list but no project create was found. VS Code has a New Project command but no session rename was found.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.01](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1001), [S10.02](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1002).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a project (a named folder for chats, files and instructions) in the account, and saves a new title for an existing chat or project. Create asks for a name. Rename edits the title in place or in a prompt.

**Why it exists.** People need to group work into named projects and fix the auto-generated titles of chats. The brief says create must ask for a name and make the project in the account, and rename must save the new title (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.01 and S10.02).

**Who uses it.** Any signed-in user of web, the Electron desktop, mobile, CLI, VS Code and Chrome. Local-only mobile users can create local projects.

**Problems it solves**

- A new topic has no home until a project exists.
- Auto titles are often unhelpful and hard to find later.
- Developers using the terminal need a way to name projects and sessions without opening the web app.

**Use cases**

- On web, open Projects, choose New project, type a name and create it; the page opens the new project.
- In a chat header on web, open the title menu, choose Rename, type, press Enter.
- In the CLI, run the projects create command with a name, or /rename with a session id and a new title.
- On mobile, long-press a chat, choose Rename, type, save.

## 2. User experience

**Where to find it**

- Web create: Projects page empty-state button and a New project control; the sidebar project create button opens /chat/projects?new=1 (apps/web/app/chat/projects/page.tsx:397; apps/web/shared/components/layout/WebAppShell.tsx:395-400).
- Web rename chat: title button with aria-label 'Conversation options' then menu item 'Rename' (apps/web/features/chat/components/ConversationTitleMenu.tsx:142). Sidebar row menu has Rename too (packages/ui/ui/src/sidebar/SessionItem.tsx:346).
- Web rename project: project settings dialog, name field; dialog text 'Rename the project, update its instructions and knowledge files, or delete it.' (apps/web/features/projects/components/ProjectSettingsDialog.tsx:244). The sidebar project Rename opens the project page, where the field lives (apps/web/shared/components/layout/WebAppShell.tsx:372-376).
- Desktop: the public Electron window loads the hosted web app, so the web screens apply (doc: AGENTS.md section 5; apps/desktop/electron/main.ts:1065-1067).
- Mobile: Projects tab, floating button 'New project' (accessibility label 'Create new project'); chat row action sheet item 'Rename'; project action sheet item 'Edit project' (apps/mobile/app/(app)/(tabs)/projects.tsx:435-445; apps/mobile/src/features/conversation-actions/useConversationActions.ts:260-275; apps/mobile/src/features/projects/useProjectActions.ts:105-112).
- CLI: agi projects create <name>, agi projects edit <project> --name; in the terminal UI the /rename <id> <new title> slash command (apps/cli/src/lib.rs:3750-3798; apps/cli/src/tui/tui_app.rs:6026-6031).
- VS Code: command 'Code: New Project' (apps/extension-vscode/package.json:665); rename of a developer session was not found (see unknowns).
- Chrome: side panel recent chats menu item 'Rename' (apps/extension/src/side_panel.ts:12756; apps/extension/_locales/en/messages.json spHistoryRename).

**Before you start**

- Signed in to an account for cloud projects and cloud chats (apps/web/app/api/projects/route.ts:133-140).
- On web the 'projects' workspace feature gate must pass and the plan must allow at least one project (apps/web/app/api/projects/route.ts:140-165).
- CLI account commands refuse Local and BYOK modes and name the mode (apps/cli/src/lib.rs:2611-2614).

**Screens and controls**

- Web create dialog: title 'Create project', a name field with Enter to submit, optional description and template choice, a Create control, close control labelled 'Close create project dialog' (apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:60-135).
- Web title menu: inline text field labelled 'Rename conversation'; Enter commits, Escape cancels, blur commits (apps/web/features/chat/components/ConversationTitleMenu.tsx:112-130).
- Desktop internal sidebar row: inline rename input (apps/desktop/src/features/v3/ConversationRow.tsx) - internal Tauri code, not the public window.
- Mobile: ProjectEditorModal for create and edit; chat Rename uses a text modal (apps/mobile/src/features/projects/useProjectEditor.ts:160-200; apps/mobile/src/features/conversation-actions/useConversationActions.ts:376-390).

**Journey**

1. 1. Person opens Projects (or a chat title menu / row menu).
2. 2. Chooses New project or Rename.
3. 3. Types the name or title. An empty or unchanged title is ignored on web (ConversationTitleMenu.tsx:93-103).
4. 4. Confirms with Create, Enter, or Save.
5. 5. The new project appears in the list and (web) the page opens it; or the title shows at once and is saved in the background.

**What the person sees and gets**

- Web create: button shows a submitting state; on error an inline message and the dialog stays open with the typed name (CreateProjectDialog.tsx:62-90).
- Web rename: new title shows immediately; if the save returns false the shown title rolls back and a toast 'Could not rename this conversation' appears (ConversationTitleMenu.tsx:93-103; apps/web/shared/components/layout/sidebar-session-actions.ts:18-40).
- Project settings: toast 'Project updated' or an error toast (ProjectSettingsDialog.tsx:168-200).
- CLI: 'Created <name> in your account (<id>).', 'Updated project <id>.', or 'Renamed session <id> to <title>' (apps/cli/src/lib.rs:3787-3798; apps/cli/src/repl/registry.rs:1031-1043).

**Settings**

- Plan project limit (getProjectLimit by plan tier) decides how many projects can exist (apps/web/app/api/projects/route.ts:150-156).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web create dialog posts to the managed cloud projects client and navigates to the new project (CreateProjectDialog.tsx:62-90). Server inserts into user_projects with a quota guard (apps/web/app/api/projects/route.ts:133-200).
- Web chat rename is optimistic with rollback (ConversationTitleMenu.tsx:93-103) and a failure toast through runSessionRowAction (sidebar-session-actions.ts:36-42). Server PATCH accepts title (apps/web/app/api/chat/conversations/[id]/route.ts:291).
- Web project rename and update through ProjectSettingsDialog with an unsaved-changes guard (ProjectSettingsDialog.tsx:107-131).
- Mobile create and rename write to the store first and mark the item for sync (apps/mobile/src/features/projects/store.ts:390-420; apps/mobile/stores/chat/chatMessageStore.ts:906-925).
- CLI projects create, projects edit (--name, --description, --instructions) and /rename for sessions work (apps/cli/src/lib.rs:3750-3798; apps/cli/src/repl/registry.rs:1031-1043).
- Chrome history menu has Rename (apps/extension/src/side_panel.ts:12756).
- VS Code registers createProject and deleteProject commands (apps/extension-vscode/package.json:665-676; apps/extension-vscode/src/features/projects/projectActions.ts:33-34).

**Incomplete**

- Mobile create and rename close the editor straight away and do not keep the typed text on a failed save; failures are swallowed and retried by the sync queue (apps/mobile/src/features/projects/useProjectEditor.ts:160-200; apps/mobile/stores/chat/chatMessageStore.ts:918-922). This differs from the brief's keep-text-and-show-error rule.
- Web chat rename failure rolls the title back and toasts, but the typed text is not kept for a retry (ConversationTitleMenu.tsx:93-103).
- CLI /rename takes the id and title as arguments in one line; it does not open a prompt (apps/cli/src/tui/tui_app.rs:6026-6031; apps/cli/src/repl/registry.rs:1031-1040).
- The sidebar Rename for a project on the web shell only navigates to the project page (WebAppShell.tsx:372-376).

**Present but disconnected or switched off**

- Desktop internal Tauri sidebar (apps/desktop/src/features/v3/Sidebar.tsx:476-483) has its own project rename, but the public desktop shows the hosted web app, so users do not see it (doc: AGENTS.md section 5).

**Not available**

- VS Code: no session or conversation rename command found; the only rename seen is inside the cloud task detail (apps/extension-vscode/src/core/commandSetup.ts:2712-2716).
- Chrome: a project create dialog was not found; the Chrome client lists projects only (apps/extension/src/features/cloud-bridge/projectsClient.ts:154).
- Rename of a conversation title is not a project operation on CLI: sessions are renamed by id (apps/cli/src/repl/registry.rs:1031).

## 4. Required behaviour

**Established requirements**

- A create-project dialog or command asks for a name and creates the project in the account. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.01)
- The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.02)
- Chat lifecycle changes must survive reload; failed persistence is visible and recoverable. (source: (doc: docs/product/experience-contract.md, row W02))
- Forms keep input on failure (stated for feedback; applied here by analogy). (source: (doc: docs/product/experience-contract.md, row W26))

**Acceptance criteria**

1. Creating a project with a valid name adds it to the Projects list on web without a reload.
2. Creating with an empty name cannot be submitted.
3. Renaming a chat updates the title in the header and sidebar at once and after reload.
4. If the save fails, an error is shown; the person can retry without retyping (target; not met today on mobile or web chat).
5. A project count at the plan limit gives a clear refusal message.
6. A signed-out or Local-only CLI refuses account project commands with a message naming the mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's rule 'a failed save must keep the typed text' is not met on mobile, where the editor closes first [inferred from useProjectEditor.ts:160-200].
- Desktop users get the web behaviour because Electron loads the web app [inferred from main.ts:1065-1067 and AGENTS.md].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep the mobile editor open until the first sync acknowledgement or show a visible failed state on the row.
- [proposed] Keep the web rename input open with the draft when onRename returns false.
- [proposed] Add a session rename command to VS Code that reuses the fork name prompt pattern.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CreateProjectDialog | `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx` | Web and desktop create dialog with name, description, templates and error state |
| screen | Projects page | `apps/web/app/chat/projects/page.tsx` | Lists projects, empty-state create button, opens the dialog |
| endpoint | POST /api/projects | `apps/web/app/api/projects/route.ts` | Creates a user_projects row after CSRF, rate limit, feature gate and plan limit checks |
| table | user_projects | `apps/web/app/api/projects/route.ts` | Stores the project row |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Chat header title menu with inline rename |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Shared sidebar row with inline rename and menu |
| service | sidebar-session-actions | `apps/web/shared/components/layout/sidebar-session-actions.ts` | runSessionRowAction toasts a failure message per action |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Wires sidebar rename, project create and project rename |
| endpoint | PATCH /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Saves title, archive, project and other conversation fields |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Project rename, instructions, duplicate, delete |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile chat action sheet and rename modal state |
| hook | useProjectEditor | `apps/mobile/src/features/projects/useProjectEditor.ts` | Mobile project create and edit form |
| store | mobile project store | `apps/mobile/src/features/projects/store.ts` | createProject writes cloud or local project and marks it for sync |
| store | mobile chat message store | `apps/mobile/stores/chat/chatMessageStore.ts` | renameConversation, optimistic with sync retry |
| screen | Mobile Projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | New project button and list |
| command | agi projects create / edit | `apps/cli/src/lib.rs` | CLI project create and rename through the account client |
| command | /rename | `apps/cli/src/repl/registry.rs` | Renames a stored CLI session by id |
| command | agi-workforce.createProject | `apps/extension-vscode/src/features/projects/projectActions.ts` | VS Code New Project command id |
| component | Chrome history menu | `apps/extension/src/side_panel.ts` | Rename entry in the recent chats menu |
| integration | projectsClient | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | Chrome list-only projects client |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person submits the create dialog on web or Electron desktop. | device | apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:62-90 |
| The client sends POST /api/projects with CSRF token; the server checks rate limit, feature gate and plan limit, inserts the row under a quota guard. | our servers | apps/web/app/api/projects/route.ts:133-200 |
| Client adds the returned project to its store and navigates to the project page. | device | CreateProjectDialog.tsx:70-80 |
| Chat rename: the client shows the new title, then PATCHes the conversation; a false result rolls back the title. | device and our servers | ConversationTitleMenu.tsx:93-103; apps/web/app/api/chat/conversations/[id]/route.ts:291 |
| Mobile writes the project or title to the on-device store, then a sync queue pushes it to the account. | device and our servers | apps/mobile/src/features/projects/store.ts:390-420; apps/mobile/stores/chat/chatMessageStore.ts:906-925 |
| CLI /rename updates the local session database only; agi projects create or edit calls the account API. | device | apps/cli/src/repl/registry.rs:1031-1043 (local store). Account calls: apps/cli/src/lib.rs:3750-3798 (our servers) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project row (name, description, instructions, color, privacy and model defaults) | table user_projects (cloud) or the mobile project store (local) | Cloud projects sync across clients; local mobile projects stay on the device | Soft deletion by deleted_at on delete (see F010-03) |
| Conversation title | table web_conversations, and the on-device chat store | Yes for cloud chats; mobile queue retries failed pushes | Kept with the conversation |
| CLI session title | CLI local session database | No account sync seen in the rename path | Kept with the session |

**Models and providers.** No model or provider takes part in create or rename. A project may carry a default model id and chat defaults chosen elsewhere (apps/web/app/api/projects/route.ts:165-190).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud project create and rename need sign-in (apps/web/app/api/projects/route.ts:133-140). Local mobile projects and CLI local session rename do not. |
| Permissions | Rows are scoped to user_id and organization_id (apps/web/app/api/projects/route.ts:150-160). Workspace admin rules beyond that: unknown. |
| Subscription | A plan project limit applies; a limit of 0 refuses create with a plan message (apps/web/app/api/projects/route.ts:150-156). The 'projects' feature gate also applies (route.ts:140-148). |
| Limits and metering | Rate limit bucket 'chat-conversation' on create (route.ts:137-139); database quota guard assert_user_resource_limit('projects') (route.ts:200-203). |
| Feature flags | Feature gate 'projects' through buildWorkspaceFeatureGateResponse (route.ts:140-148). Others: none found in the code read. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode creates a device-only project with a generated local id (apps/mobile/src/features/projects/store.ts:420-440). CLI account project commands are refused in Local and BYOK (apps/cli/src/lib.rs:2611-2614). Web has no Local mode for project create. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Create in flight | The dialog refuses to close while submitting (CreateProjectDialog.tsx:100-106). | apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:100-106 |
| Create error | Inline error text with a fallback 'Something went wrong. Please try again.'; the name stays. | CreateProjectDialog.tsx:84-88 |
| IME composition | Enter during IME composition does not submit. | CreateProjectDialog.tsx:108-116; ConversationTitleMenu.tsx:123 |
| Empty or unchanged title | Ignored without a request on web chat rename. | ConversationTitleMenu.tsx:93-98 |
| Rename fails (web) | Title rolls back and a toast names the action; typed text is not kept. | ConversationTitleMenu.tsx:99-103; sidebar-session-actions.ts:36-42 |
| Rename fails or offline (mobile) | Optimistic title stands; the dirty-queue retry pushes later; no inline error. | apps/mobile/stores/chat/chatMessageStore.ts:918-922 |
| Account switched while a mobile rename modal is open | The rename is dropped if the account that owned the row changed. | apps/mobile/src/features/conversation-actions/useConversationActions.ts:376-386 |
| Plan project limit reached | Server returns a validation error with plan text. | apps/web/app/api/projects/route.ts:150-156 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/dialogs/CreateProjectDialog.templates.test.tsx`: Create dialog template behaviour (inferred from file name; contents not read)
- apps/web/shared/components/layout/__tests__/sidebar-session-actions.test.ts (not found) (not found): Row action failure copy and archive toast helper (inferred from file name; contents not read)
- `apps/web/app/api/projects/__tests__/route.keyset-pagination.test.ts`: Projects list paging (inferred)
- `apps/cli/src/repl/registry.rs`: Inline rename_tests: usage error for a missing title and a failure message for an unknown session id (read)
- `apps/mobile/src/features/projects/__tests__`: Mobile project features such as instructions and memory (inferred from folder content; create/rename coverage unknown)
- `apps/desktop/src/features/v3/__tests__/AgiWorkProjects.test.tsx`: Internal desktop projects view (inferred)

**Test scenarios**

- **Create a project on web**
  1. Sign in on web.
  2. Open Projects and choose New project.
  3. Enter a name and press Enter.
  - Expected: Dialog closes, the project page opens and the project is in the list after reload.
- **Create fails**
  1. Open the dialog.
  2. Block the network or hit the plan limit.
  3. Submit.
  - Expected: An inline error shows and the name field still holds the typed name.
- **Rename a chat on web and break the save**
  1. Open a chat title menu and choose Rename.
  2. Type a new title and press Enter.
  3. Repeat with the network off.
  - Expected: Online the title persists after reload. Offline the title rolls back and a toast 'Could not rename this conversation' shows.
- **Rename on mobile offline**
  1. Long-press a cloud chat and choose Rename.
  2. Turn on airplane mode, save.
  3. Turn it off.
  - Expected: Title shows at once; after reconnect it appears on web (checks the sync retry).
- **CLI rename**
  1. Run agi, then /rename <id> New title.
  2. Run /rename with an unknown id.
  - Expected: First reports Renamed; second reports Failed to rename.

**Where to look when it fails**

- Toast text 'Could not rename this conversation'.
- Server logs 'Failed to fetch projects' and project create errors in apps/web/app/api/projects/route.ts.
- Tables user_projects and web_conversations (title, updated_at).
- CLI message 'Failed to rename:' from registry.rs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Typed text is not kept after a failed rename on web chat and mobile, and mobile project create closes before any result.** Affects: Web, desktop (Electron) and mobile users. Evidence: ConversationTitleMenu.tsx:93-103; apps/mobile/src/features/projects/useProjectEditor.ts:160-200. Work needed: Keep the editor open on failure, show an inline error, retain the draft.
- **VS Code has no session rename; Chrome has no project create.** Affects: VS Code and Chrome users. Evidence: apps/extension-vscode/src/core/commandSetup.ts (only task-detail rename at 2712); apps/extension/src/features/cloud-bridge/projectsClient.ts:154. Work needed: Add the commands or record the exclusion in the surface matrix.
- **Brief says VS Code and Chrome rename are missing; the code shows Chrome Rename exists and VS Code has a New Project command. The brief's line pointers are stale for CLI tui_app.rs and VS Code commandSetup.ts.** Affects: Documentation readers. Evidence: apps/extension/src/side_panel.ts:12756; apps/extension-vscode/package.json:665. Work needed: Update the brief statuses.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- api:POST /api/projects
- api:PATCH /api/chat/conversations/[id]
- table:user_projects
- table:web_conversations
- store:mobile-project-store
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether VS Code has any developer-session rename path outside the files read.
- Contents and assertions of the listed test files (only names were seen).
- Whether workspace admin roles restrict project create beyond the user-scoped checks read.
- Whether the brief's tui_app.rs:3574 pointer maps to a separate TUI rename prompt; /rename at tui_app.rs:6026 takes arguments.

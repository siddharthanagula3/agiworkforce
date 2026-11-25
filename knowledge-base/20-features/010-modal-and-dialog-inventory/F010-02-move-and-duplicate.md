---
id: "F010-02"
type: "feature"
title: "Move and duplicate"
aliases: ["Move to project", "Change project", "Remove from project", "Duplicate", "Duplicate as branch", "Fork", "S10.03", "S10.04", "Add to project"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S10.03", "S10.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "api:PATCH /api/chat/conversations/[id]", "api:POST /api/projects/[id]/duplicate", "table:web_conversations", "table:user_projects", "F010-01", "SYS-sync-and-continuity", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-02 Move and duplicate

Files a chat under a project (or removes it) and makes an independent copy of a chat or project. Web, mobile and Chrome can move a chat. Web branches a chat as a copy and duplicates a project; mobile duplicates a chat; CLI and VS Code fork a session. The brief's 'mobile missing' is wrong in the code.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.03](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1003), [S10.04](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1004).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Move changes which project a chat belongs to. Duplicate creates a separate copy (a chat branch, a forked session, or a project with its settings and files) so the original is untouched.

**Why it exists.** People reorganise work and want to try a variation without losing the original. The brief requires move to pick a project and file the chat there, and duplicate to create an independent copy and say where it is (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.03, S10.04).

**Who uses it.** Signed-in users of web, Electron desktop, mobile, Chrome, CLI and VS Code.

**Problems it solves**

- A chat started outside a project cannot otherwise be filed.
- Experimenting on a long thread risks the original.
- Reusing a project's setup for a new topic needs a copy.

**Use cases**

- Web: open the chat title menu, choose Move to project, pick a project.
- Web: choose Duplicate as branch to continue a copy of the whole thread.
- Web: in project settings choose Duplicate to copy a project.
- CLI: agi session fork <id> --as <name>; VS Code: Fork command with a name prompt.

## 2. User experience

**Where to find it**

- Web title menu: 'Move to project' or 'Change project' submenu, and 'Duplicate as branch' (apps/web/features/chat/components/ConversationTitleMenu.tsx:146-190).
- Web and desktop sidebar row menu: 'Move to project' submenu listing project names (packages/ui/ui/src/sidebar/SessionItem.tsx:405-425).
- Web project settings dialog: 'Duplicate' button (apps/web/features/projects/components/ProjectSettingsDialog.tsx:436-455).
- Mobile chat action sheet: 'Move to project' (sheet titled 'Move to project', with 'Remove from project') and 'Duplicate' (apps/mobile/src/features/conversation-actions/useConversationActions.ts:205-285).
- Chrome recent chats menu: 'Move to project' (apps/extension/src/side_panel.ts:12759; apps/extension/_locales/en/messages.json spHistoryMove) and 'Add to project' on the title menu (spTitleAddToProject).
- CLI: agi session fork <session_id> with --at-turn, --as and --force (apps/cli/src/lib.rs:5691-5760). A Fork command also exists at the top level (lib.rs:928).
- VS Code: command agi-workforce.forkConversation, prompt 'Name for the forked session' (apps/extension-vscode/src/core/commandSetup.ts:1452-1476).

**Before you start**

- Signed in for cloud chats and projects.
- At least one project for the web submenu to appear (ConversationTitleMenu.tsx:146 requires projects.length > 0).
- A chat with at least one message for web Duplicate as branch (apps/web/features/chat/pages/WebChatPage.tsx:7418-7425).
- Mobile hides Duplicate for temporary chats (useConversationActions.ts:300-303).

**Screens and controls**

- Web submenu of project names; the current project is marked active in the sidebar submenu (SessionItem.tsx:415).
- Mobile Move sheet lists projects other than the current one, plus 'Remove from project' when filed (useConversationActions.ts:205-230).
- VS Code input box prefilled with '<title> (fork)' (commandSetup.ts:1456-1459).

**Journey**

1. 1. Person opens the chat or row menu.
2. 2. Chooses Move to project or Duplicate.
3. 3. For move: picks a project (or Remove from project on mobile).
4. 4. For duplicate: optionally names it (VS Code, CLI).
5. 5. Sees the result: a toast 'Moved to <project>' or 'Chat duplicated', and the copy opens (mobile, VS Code).

**What the person sees and gets**

- Mobile toast 'Moved to <project>' or 'Removed from project' (useConversationActions.ts:188-198).
- Mobile toast 'Chat duplicated' and the copy opens (useConversationActions.ts:225-232).
- Web failure toast 'Could not move this conversation' (sidebar-session-actions.ts:18-30).
- Web project duplicate toast 'Project duplicated.' or 'Project duplicated with N files.' (ProjectSettingsDialog.tsx:150-162).
- CLI prints 'Forked <id> to <id> (N messages)' and a resume hint (apps/cli/src/lib.rs:5745-5760).

**Settings**

- Plan project limit applies to project duplicate (apps/web/app/api/projects/[id]/duplicate/route.ts:82-87).
- none found for chat move or branch.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web move uses updateConversation with projectId and toasts on failure with 'Could not move this conversation' (apps/web/shared/components/layout/WebAppShell.tsx:337-341; sidebar-session-actions.ts:18-30). Server PATCH writes project_id (apps/web/app/api/chat/conversations/[id]/route.ts:373).
- Web Duplicate as branch calls createBranch from the last message, which copies the whole thread (WebChatPage.tsx:7414-7425). A branches API exists (apps/web/app/api/chat/conversations/[id]/branches/route.ts).
- Web project Duplicate posts to /api/projects/[id]/duplicate; the copy is named 'X (copy)' and 'X (copy N)' and carries settings, memory switches and knowledge files; Health spaces refuse (apps/web/app/api/projects/[id]/duplicate/route.ts:46-80; ProjectSettingsDialog.tsx:136-165).
- Mobile move and duplicate are implemented, including account-ownership checks, a 'Moved to <name>' toast, 'Chat duplicated' toast, and opening the copy (useConversationActions.ts:180-240).
- CLI session fork creates a new managed session, refuses to overwrite without --force, and prints how to resume (apps/cli/src/lib.rs:5691-5760).
- VS Code fork prompts for a name and resumes the forked session (commandSetup.ts:1452-1476).
- Chrome has Move to project in the history menu (side_panel.ts:12759).

**Incomplete**

- Web duplicate of a chat is named 'Duplicate as branch' and the brief expects it to say where the copy is; the post-create message was not read (unknown).
- CLI has no move of an existing hosted conversation into a project; agi projects link only links a directory to a project (apps/cli/src/lib.rs:1323-1327,3821-3835).
- Mobile Local-mode chats move only into local projects (useConversationActions.ts:196-200).

**Present but disconnected or switched off**

- Desktop internal Tauri sidebar has its own move handler (apps/desktop/src/features/v3/Sidebar.tsx:538-551); not the public window.

**Not available**

- Chrome: duplicate of a chat or project was not found.
- VS Code and CLI: no move of a session into a project found.
- Project move: not applicable.

## 4. Required behaviour

**Established requirements**

- A move dialog or menu lets the user pick a project for a conversation and files it there. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.03)
- A duplicate action creates an independent copy of a conversation or project and says where the copy is. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.04)
- A fork creates an independent owned copy; later edits do not silently alter a snapshot. (source: (doc: docs/product/experience-contract.md, row W10))

**Acceptance criteria**

1. After Move to project the chat appears under the project and leaves its old place.
2. Remove from project returns it to the general list.
3. Duplicate leaves the original unchanged; editing the copy does not edit the original.
4. The person is told or shown where the copy is.
5. A failed move shows an error and the chat stays where it was.
6. Duplicating a Health project is refused with a clear message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile Move and Duplicate satisfy the brief, which listed them missing [inferred from useConversationActions.ts:205-285].
- Web chat duplicate is a branch of the full thread [inferred from WebChatPage.tsx:7414-7425].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Duplicate action to the Chrome history menu or document that it is excluded.
- [proposed] Add a CLI command to file a hosted conversation under a project.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Move to project and Duplicate as branch menu items |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Row menu with Move to project submenu |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | handleMoveToProjectSession |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Passes onMoveToProject and onFork (createBranch) to the title menu |
| endpoint | PATCH /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Writes project_id |
| endpoint | /api/chat/conversations/[id]/branches | `apps/web/app/api/chat/conversations/[id]/branches/route.ts` | Creates a conversation branch (route file exists; method not read) |
| endpoint | POST /api/projects/[id]/duplicate | `apps/web/app/api/projects/[id]/duplicate/route.ts` | Copies a project with settings and files |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Project Duplicate button and toast |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile move and duplicate actions |
| store | mobile chat store | `apps/mobile/stores/chat/chatMessageStore.ts` | moveConversationToProject and forkConversation |
| command | agi session fork | `apps/cli/src/lib.rs` | Forks a managed session |
| command | agi-workforce.forkConversation | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code fork with a name prompt |
| component | Chrome history menu | `apps/extension/src/side_panel.ts` | Move to project entry (startHistoryMove) |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/route.ts` | project_id column |
| table | user_projects | `apps/web/app/api/projects/[id]/duplicate/route.ts` | Copy inserted as a new row |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a project in the menu. | device | packages/ui/ui/src/sidebar/SessionItem.tsx:405-425 |
| The client calls updateConversation({ projectId }); the server updates project_id and checks the target. | our servers | apps/web/shared/components/layout/WebAppShell.tsx:337-341; apps/web/app/api/chat/conversations/[id]/route.ts:373-395 |
| Web project duplicate: client posts to the duplicate route; the server checks CSRF, rate limit and plan limit, copies the row and files. | our servers | apps/web/app/api/projects/[id]/duplicate/route.ts:54-120 |
| Mobile duplicate loads messages and forks the conversation, then opens the copy. | device and our servers | useConversationActions.ts:218-238 |
| CLI fork copies the session transcript on disk into a new session id. | device | apps/cli/src/lib.rs:5691-5760 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chat project assignment | web_conversations.project_id | Yes for cloud chats | Kept with the chat |
| Duplicated project row and files | user_projects and project knowledge storage | Yes | Independent of the source |
| Forked CLI session | CLI local session store (ManagedSessionStore) | unknown | Kept until archived or deleted |

**Models and providers.** No model takes part. A forked CLI session keeps the source model and routing authority (apps/cli/src/lib.rs:5710-5740).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud move and duplicate need sign-in. CLI fork and Chrome local entries can work on stored data. |
| Permissions | User-scoped rows; the duplicate route reads only the caller's non-deleted project (apps/web/app/api/projects/[id]/duplicate/route.ts:60-75). |
| Subscription | Project duplicate is refused when the plan project limit is 0 (duplicate/route.ts:82-87). |
| Limits and metering | Rate bucket 'chat-conversation' on project duplicate (duplicate/route.ts:56-58). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local-mode chats move into local projects and can be duplicated; cloud projects are listed only for cloud chats (useConversationActions.ts:196-200). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No projects | Web hides the Move submenu; mobile hides Move when there is nothing to move to. | ConversationTitleMenu.tsx:146; useConversationActions.ts:255-258 |
| Move fails (web) | Toast 'Could not move this conversation'. | sidebar-session-actions.ts:18-30 |
| Move fails (mobile) | Alert 'Could not move chat' with 'Check your connection and try again.' | useConversationActions.ts:188-195 |
| Duplicate fails (mobile) | Alert 'Could not duplicate chat'. | useConversationActions.ts:228-236 |
| Fork target exists (CLI) | Refuses unless --force. | apps/cli/src/lib.rs:5726-5730 |
| Health project | Duplicate returns a conflict that Health cannot be duplicated. | apps/web/app/api/projects/[id]/duplicate/route.ts:76-80 |
| Account switch mid-action (mobile) | Result is ignored if the owning account changed. | useConversationActions.ts:100-110 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/[id]/duplicate/route.test.ts`: Project duplicate route (inferred from file name)
- `apps/web/app/api/chat/conversations/[id]/branches/route.test.ts`: Branch route (inferred)
- `apps/mobile/__tests__/chat-message-store-thread-delete-fork.test.ts`: Mobile fork and thread delete in the message store (inferred from file name)
- `apps/mobile/__tests__/ConversationActionSheetInset.test.tsx`: Mobile action sheet layout (inferred)
- apps/web/shared/components/layout/__tests__/WebAppShell.test.tsx (not found) (not found): Shell wiring (inferred)

**Test scenarios**

- **Move a chat on web**
  1. Open a chat title menu.
  2. Choose Move to project and pick one.
  3. Open that project.
  - Expected: The chat is listed in the project and no longer in All chats.
- **Duplicate a project**
  1. Open project settings.
  2. Choose Duplicate.
  - Expected: Toast says the project was duplicated, a new project named with (copy) exists, original unchanged.
- **Duplicate a chat on mobile**
  1. Long-press a cloud chat.
  2. Choose Duplicate.
  - Expected: Toast 'Chat duplicated' and the copy opens; the original is unchanged.
- **Fork a CLI session twice**
  1. agi session fork <id> --as demo.
  2. Repeat the same command.
  - Expected: Second run fails with 'already exists' unless --force.
- **Move fails**
  1. Go offline on web.
  2. Move a chat.
  - Expected: Toast 'Could not move this conversation' and the chat stays.

**Where to look when it fails**

- Toasts named in sidebar-session-actions.ts.
- Table web_conversations.project_id.
- Duplicate route error 'Health cannot be duplicated' and the plan limit message.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **The brief says mobile Move and Duplicate are missing; the code has both. The brief's mobile statuses are stale.** Affects: Documentation, testers. Evidence: apps/mobile/src/features/conversation-actions/useConversationActions.ts:205-285. Work needed: Update the brief and surface matrix.
- **Duplicate on web is called 'Duplicate as branch'; whether it tells the person where the copy is was not established.** Affects: Web and desktop. Evidence: ConversationTitleMenu.tsx:184-190; WebChatPage.tsx:7414-7425. Work needed: Read createBranch outcome handling and add a clear 'opened copy' message if absent.
- **Chrome has no duplicate; CLI and VS Code have no move of a session into a project.** Affects: Chrome, CLI, VS Code. Evidence: apps/extension/src/side_panel.ts:12700-12770; apps/cli/src/lib.rs:1323-1327. Work needed: Decide whether to build or record as not applicable.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- api:PATCH /api/chat/conversations/[id]
- api:POST /api/projects/[id]/duplicate
- table:web_conversations
- table:user_projects
- F010-01
- SYS-sync-and-continuity
- SYS-memory-projects-and-context

## Unknown

- Whether web createBranch tells the person where the copy opened (function body not read).
- Method and body of the branches route (only its folder was seen).
- Whether CLI forked sessions sync to the account.
- Test contents (only names seen).
- Whether Chrome has any duplicate path outside side_panel.ts.

---
id: "F018-99"
type: "feature"
title: "Other items in Conversation-level controls"
aliases: ["Other items in Conversation-level controls", "Conversation actions", "Conversation menu", "S18.02-S18.28"]
area: "18 Conversation-level controls"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (6 of 21)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S18.02", "S18.03", "S18.04", "S18.05", "S18.06", "S18.07", "S18.08", "S18.09", "S18.10", "S18.11", "S18.12", "S18.13", "S18.14", "S18.15", "S18.16", "S18.17", "S18.18", "S18.19", "S18.20", "S18.21", "S18.22", "S18.23", "S18.24", "S18.25", "S18.26", "S18.27", "S18.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "table:web_conversations", "api:PATCH /api/chat/conversations/[id]", "api:POST /api/chat/conversations/[id]/restore", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-execution-boundaries", "F018-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F018-99 Other items in Conversation-level controls

The remaining 27 items of the conversation controls area: rename, pin, archive, delete, duplicate, move to project, mode, privacy, search, jump, branches, export, share, details, tools, tasks and continuation. The code exists on Web and Mobile for most; CLI and VS Code have a few; Chrome very few. The brief is partly out of date.

Area: [18. Conversation-level controls](README.md). Requirement items: [S18.02](../../10-requirements/capabilities/018-conversation-level-controls.md#s1802), [S18.03](../../10-requirements/capabilities/018-conversation-level-controls.md#s1803), [S18.04](../../10-requirements/capabilities/018-conversation-level-controls.md#s1804), [S18.05](../../10-requirements/capabilities/018-conversation-level-controls.md#s1805), [S18.06](../../10-requirements/capabilities/018-conversation-level-controls.md#s1806), [S18.07](../../10-requirements/capabilities/018-conversation-level-controls.md#s1807), [S18.08](../../10-requirements/capabilities/018-conversation-level-controls.md#s1808), [S18.09](../../10-requirements/capabilities/018-conversation-level-controls.md#s1809), [S18.10](../../10-requirements/capabilities/018-conversation-level-controls.md#s1810), [S18.11](../../10-requirements/capabilities/018-conversation-level-controls.md#s1811), [S18.12](../../10-requirements/capabilities/018-conversation-level-controls.md#s1812), [S18.13](../../10-requirements/capabilities/018-conversation-level-controls.md#s1813), [S18.14](../../10-requirements/capabilities/018-conversation-level-controls.md#s1814), [S18.15](../../10-requirements/capabilities/018-conversation-level-controls.md#s1815), [S18.16](../../10-requirements/capabilities/018-conversation-level-controls.md#s1816), [S18.17](../../10-requirements/capabilities/018-conversation-level-controls.md#s1817), [S18.18](../../10-requirements/capabilities/018-conversation-level-controls.md#s1818), [S18.19](../../10-requirements/capabilities/018-conversation-level-controls.md#s1819), [S18.20](../../10-requirements/capabilities/018-conversation-level-controls.md#s1820), [S18.21](../../10-requirements/capabilities/018-conversation-level-controls.md#s1821), [S18.22](../../10-requirements/capabilities/018-conversation-level-controls.md#s1822), [S18.23](../../10-requirements/capabilities/018-conversation-level-controls.md#s1823), [S18.24](../../10-requirements/capabilities/018-conversation-level-controls.md#s1824), [S18.25](../../10-requirements/capabilities/018-conversation-level-controls.md#s1825), [S18.26](../../10-requirements/capabilities/018-conversation-level-controls.md#s1826), [S18.27](../../10-requirements/capabilities/018-conversation-level-controls.md#s1827), [S18.28](../../10-requirements/capabilities/018-conversation-level-controls.md#s1828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (6 of 21) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Groups the per-conversation actions a person can take after a chat exists. The brief lists 27 items S18.02 to S18.28 (doc: knowledge-base/data/area-briefs/018-conversation-level-controls.md:10-140). Examples verified in code: Web header menu with Rename, Move to project, Share, Export, Duplicate as branch (apps/web/features/chat/components/ConversationTitleMenu.tsx:153-209); Mobile menu with Share, Rename, Pin, Move to project, Duplicate, Mark as unread, Archive, Delete (apps/mobile/src/features/conversation-actions/useConversationActions.ts:263-293).

**Why it exists.** People need to organise, protect, search and share long-lived chats, and the leaders (ChatGPT and Claude) offer these actions; the shared sidebar item comments say its menu order matches both leaders (packages/ui/ui/src/sidebar/SessionItem.tsx:326-329).

**Who uses it.** Signed-in people with existing conversations, on every app; the set differs by app.

**Problems it solves**

- Finding old chats (pin, archive, search, projects)
- Mistaken deletion (confirmation, restore route)
- Sharing or exporting a chat
- Keeping settings per chat (instructions, privacy)

**Use cases**

- Web: pin a chat so it stays on top, then archive it later.
- Mobile: long-press a chat, choose Move to project, pick a project.
- CLI: type /rename or /fork inside a session.
- Web: set a conversation's own instructions through the conversation update API.

## 2. User experience

**Where to find it**

- Web: header title button labelled 'Conversation options' opens a menu with 'Rename', 'Move to project' or 'Change project', 'Share…', 'Print', 'Export…', 'Duplicate as branch', Archive toggle and Delete (apps/web/features/chat/components/ConversationTitleMenu.tsx:142-209).
- Web and Desktop sidebar row: a more-options button; menu order Share, Rename, Pin or Unpin, Mark as unread, Archive, Delete, then Move to project flyout (packages/ui/ui/src/sidebar/SessionItem.tsx:326-386).
- Mobile: conversation menu with 'Share', 'Rename', 'Pin'/'Unpin', 'Move to project', 'Duplicate', 'Mark as unread', 'Archive', 'Delete' (useConversationActions.ts:263-293).
- CLI: slash commands '/resume', '/fork' (alias '/branch'), '/rename', '/export', '/title' (apps/cli/src/tui/tui_app.rs:6002-6033,6571).
- Web share dialog headings 'Share conversation', 'Public link ready', 'Shared with your workspace', 'Conversation links' (ShareConversationDialog.tsx:262-270).
- Mobile shared links list at settings/shared-links (apps/mobile/app/(app)/settings/shared-links.tsx).
- VS Code, Chrome: exact labels not opened; unknown.

**Before you start**

- A signed-in account for Web and Mobile cloud conversations.
- Mobile Share only for cloud, non-temporary conversations (useConversationActions.ts:263-265); Duplicate hidden for temporary ones (lines 280-283).
- Archive on mobile shows only for cloud conversations (line 290).

**Screens and controls**

- Web header menu, sidebar row menu, in-chat message search box (MessageSearch.tsx), jump-to-latest control (ChatMessageList.tsx), share dialog, work session panel (WorkSessionPanel.tsx).
- Mobile rename modal (RenameConversationModal.tsx) and delete alert 'Delete chat?' (useConversationActions.ts:297).

**Journey**

1. Open a conversation or the chat list.
2. Open its menu.
3. Pick an action.
4. Destructive or consequence-bearing actions ask first: mobile Delete shows an alert with a Delete button (useConversationActions.ts:297-304); the sidebar says Delete cannot be taken back (SessionItem.tsx comment near line 386).
5. The app shows the result: mobile Archive shows toast 'Chat archived. Find it in Settings, Archived chats.' with an Undo (useConversationActions.ts:138-139); moving shows 'Moved to <project>' (line 213).

**What the person sees and gets**

- Toasts on mobile archive and move.
- Web rename returns accepted or refused to the menu (ConversationTitleMenu.tsx:107).
- Web export and print files; share link.

**Settings**

- Per-conversation instructions stored in the instructions column (apps/web/app/api/chat/conversations/[id]/route.ts:276-285); a visible web control for it was not found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web conversation PATCH updates pinned, starred, archived, is_temporary, active leaf and project (apps/web/app/api/chat/conversations/[id]/route.ts:378-392).
- Web conversation instructions are saved (route.ts:276-285), though the brief says web missing for S18.24.
- Web soft delete and restore: bulk delete sets deleted_at and clears compaction summary (apps/web/app/api/chat/conversations/bulk/route.ts:62-69); restore route clears deleted_at (apps/web/app/api/chat/conversations/[id]/restore/route.ts:26-40).
- Web refuses a temporary chat that would be in a project (route.ts:468-473).
- Web branches API exists (apps/web/app/api/chat/conversations/[id]/branches/route.ts) and tool-grants API (apps/web/app/api/chat/conversations/[id]/tool-grants/route.ts).
- Mobile has Duplicate in its menu (useConversationActions.ts:280-283) although the brief says S18.06 mobile missing.
- CLI slash commands for resume, fork, rename, export, title (tui_app.rs:6002-6033,6571).
- VS Code shows running cost from a token counter (apps/extension-vscode/src/data/tokenCounter.ts:119-124).

**Incomplete**

- Brief marks S18.26 connected accounts as unfinished in the UI on Web and Desktop (brief line 130).
- Rows with no code listed (S18.08 Copy into Project, S18.13 Outline, S18.16 Scroll restoration) are marked missing on every app in the brief; I did not search to confirm.
- Brief S18.23 says usage summary missing on Web, Desktop and Mobile; not re-checked.

**Present but disconnected or switched off**

- unknown; no feature flag was searched

**Not available**

- Chrome extension: brief marks nearly all items missing except delete, mode, privacy and continuation.
- CLI and VS Code: no pin, move to project, share (brief).
- Brief code reference apps/cli/src/lib.rs:258 for S18.24 points to the '--search' option, not to conversation instructions (apps/cli/src/lib.rs:258-262), so that citation is stale.

## 4. Required behaviour

**Established requirements**

- The user can rename a conversation and the new title persists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S18.02)
- A conversation can be pinned and unpinned. (source: S18.03 (doc: same file:16))
- A conversation can be archived (hidden, kept) and restored. (source: S18.04 (doc: same file:21))
- A conversation can be deleted, with confirmation, and disappears everywhere. (source: S18.05 (doc: same file:26))
- A conversation can be duplicated into a new independent one. (source: S18.06 (doc: same file:31))
- Move to Project and Copy into Project (original stays). (source: S18.07, S18.08 (doc: same file:36,41))
- Mode switch, privacy switch through an explicit flow that explains the consequence. (source: S18.09, S18.10 (doc: same file:45,50))
- Search in conversation, jump between matches, outline, jump to a turn, jump to latest, scroll restoration, branch navigation. (source: S18.11-S18.17 (doc: same file:55-82))
- Export, share, shared-link management, details, context inspector, usage summary. (source: S18.18-S18.23 (doc: same file:87-112))
- Conversation-level instructions, enabled tools, connected accounts, active tasks, continuation on another device. (source: S18.24-S18.28 (doc: same file:117-138))
- Nothing may silently route a Local chat to BYOK or managed cloud; a Local-to-BYOK move is an explicit fork with consent. (source: doc: AGENTS.md section 6)
- An action a user cannot undo asks first and names the consequence; a removed chat is archived or moved to Recently deleted. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Rename persists after reload on Web, Mobile and CLI.
2. Pinned chats stay at the top and unpin returns them.
3. Archive hides a chat and restore brings it back.
4. Delete asks first and the chat leaves every list.
5. Turning a chat temporary while it is in a project is refused.
6. Edited resend of a local-history chat does not cross Local to BYOK without refusal (WebChatPage.tsx:5535-5545).
7. Share dialog lists links and revoke works.
8. Each 'missing' item is either built or shown as unavailable, not as a dead control.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's per-app status needs a refresh because at least two items (mobile Duplicate, web instructions) exist in code [inferred from route.ts:276 and useConversationActions.ts:282].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Re-audit all 27 items against code and update the brief.
- [proposed] Add a visible web control for conversation instructions.
- [proposed] Build outline, scroll restoration and Copy into Project, or drop them from the area.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Web header menu: rename, project, share, print, export, duplicate, archive, delete |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Shared sidebar row menu: share, rename, pin, unread, archive, delete, move to project |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Wires sidebar actions on web (per brief) |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Hosts share, export, branches, details and task wiring |
| endpoint | api:PATCH conversation | `apps/web/app/api/chat/conversations/[id]/route.ts` | Updates pinned, archived, temporary, project, instructions, active leaf |
| endpoint | api:POST bulk conversations | `apps/web/app/api/chat/conversations/bulk/route.ts` | Bulk soft delete and other actions |
| endpoint | restore | `apps/web/app/api/chat/conversations/[id]/restore/route.ts` | Restores a soft-deleted conversation |
| endpoint | branches | `apps/web/app/api/chat/conversations/[id]/branches/route.ts` | Branch data for branch navigation |
| endpoint | tool-grants | `apps/web/app/api/chat/conversations/[id]/tool-grants/route.ts` | Per-conversation tool grants |
| component | MessageSearch | `apps/web/features/chat/components/messages/MessageSearch.tsx` | In-conversation search box |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Search match jumping and jump to latest |
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Share link create, list and revoke |
| hook | use-share-conversation | `apps/web/features/chat/hooks/use-share-conversation.ts` | Share state and calls |
| component | WorkSessionPanel | `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx` | Details, context and active tasks panel |
| hook | useConversationActions | `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile menu actions |
| component | RenameConversationModal | `apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx` | Mobile rename input |
| screen | shared-links | `apps/mobile/app/(app)/settings/shared-links.tsx` | Mobile shared link list |
| service | shared-links service | `apps/mobile/src/features/shared-links/service.ts` | Mobile shared link calls |
| command | CLI slash commands | `apps/cli/src/tui/tui_app.rs` | /resume, /fork, /rename, /export, /title |
| service | CLI sessions | `apps/cli/src/sessions.rs` | Session metadata, pin label, archived mark in list |
| command | VS Code session commands | `apps/extension-vscode/src/core/commandSetup.ts` | Delete and duplicate session commands (per brief) |
| service | tokenCounter | `apps/extension-vscode/src/data/tokenCounter.ts` | Running token and cost estimate |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/route.ts` | Columns title, pinned, starred, archived, is_temporary, project_id, instructions, deleted_at |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Mobile archive and continuation sync (per brief) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks an action in a menu | device | useConversationActions.ts:263-293; ConversationTitleMenu.tsx:153-209 |
| Mobile checks account ownership before running the action | device | useConversationActions.ts:116-122 |
| Web sends a conversation PATCH with CSRF and rate limit; server updates the row scoped to user and organisation | our servers | route.ts:378-392; restore/route.ts:20-24 |
| Server rejects invalid combinations such as temporary plus project | our servers | route.ts:468-473 |
| Delete is a soft delete that also clears compaction summaries | our servers | bulk/route.ts:62-69 |
| CLI actions read and write session files on the device | device | apps/cli/src/sessions.rs:105-107,143-144 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation flags, project link, instructions | web_conversations (server) | Web and cloud mobile read the server rows; local-only chats stay on the device [inferred] | Soft delete via deleted_at; restore clears it; hard purge rules: unknown |
| CLI session metadata | files on disk | unknown | unknown |

**Models and providers.** These controls do not call a model themselves. Mode and privacy interact with model routing; trust-boundary refusal exists for edited resend (WebChatPage.tsx:5540-5545).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web endpoints require a user id and scope by organisation (route.ts:378-392). Mobile Share and Archive need a cloud conversation. |
| Permissions | Organisation scoping in SQL; role checks: unknown. |
| Subscription | none found in the code I opened for these actions; share-link audience 'organization' exists in the dialog (ShareConversationDialog.tsx:264). |
| Limits and metering | Rate limit name 'chat-conversation' on restore (restore/route.ts:23); other limits: unknown. |
| Feature flags | unknown; not searched. |
| Model compatibility | none found in the code for these actions. |
| Provider restrictions | Edited resend refuses to cross Local to BYOK (WebChatPage.tsx:5540-5545). |
| Local mode | Mobile local conversations hide Share and Archive (useConversationActions.ts:263,290); CLI works fully on the device; desktop local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Rename refused | Menu waits for accepted flag | ConversationTitleMenu.tsx:107 |
| Account changes during action | Mobile ignores the action | useConversationActions.ts:116-122 |
| Archive undone | Toast Undo calls restoreArchivedConversation; failure message 'Could not confirm the restore...' | useConversationActions.ts:138-169 |
| Conversation not found or deleted | Update filters deleted_at is null and returns not found | route.ts:285-286 |
| Invalid id | Not found | restore/route.ts:26-29 |
| Temporary chat | No Share or Duplicate on mobile | useConversationActions.ts:263-283 |
| Offline, timeout, retry | not handled in the code I opened | searched route and mobile action files only |
| Accessibility | Web rename input has aria-label 'Rename conversation', menu button 'Conversation options' | ConversationTitleMenu.tsx:119,142 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/[id]/route.instructions.test.ts`: Conversation instructions update (file exists; contents not read)
- `apps/web/app/api/chat/conversations/[id]/route.delete.test.ts`: Delete route
- `apps/web/app/api/chat/conversations/[id]/route.variants.test.ts`: Variants on conversation route
- `apps/web/app/api/chat/conversations/[id]/branches/route.test.ts`: Branches route
- `apps/web/app/api/chat/conversations/route.archived-filter.test.ts`: Archived filter in the list
- `apps/web/app/api/chat/conversations/route.deleted-filter.test.ts`: Deleted filter in the list
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary history in the list
- `apps/web/app/api/chat/conversations/[id]/route.concurrency.test.ts`: Concurrent updates

**Test scenarios**

- **Pin and unpin on Web**
  1. Open the sidebar row menu
  2. Choose Pin
  3. Reload
  4. Choose Unpin
  - Expected: Chat sits at top while pinned and returns after unpin
- **Delete and restore**
  1. Delete a chat with confirmation
  2. Call restore
  - Expected: Chat disappears then returns
- **Temporary plus project**
  1. Put a chat in a project
  2. Turn it temporary
  - Expected: Server refuses with the temporary-project message
- **Mobile archive undo**
  1. Archive a cloud chat
  2. Tap Undo
  - Expected: Chat returns to the list
- **CLI rename and fork**
  1. Open a session
  2. Type /rename then /fork
  - Expected: Title changes; a new session is created
- **Share and revoke**
  1. Open Share…
  2. Create link
  3. Revoke it
  - Expected: Link stops working and list updates

**Where to look when it fails**

- Table web_conversations columns deleted_at, archived, pinned, is_temporary, instructions
- Error 'Conversation not found' from the routes
- TEMPORARY_CHAT_PROJECT_REFUSAL error

**Hands-on test plans**

- Web: [70-qa/test-plans/web/018-conversation-level-controls.md](../../70-qa/test-plans/web/018-conversation-level-controls.md)
- Desktop: [70-qa/test-plans/desktop/018-conversation-level-controls.md](../../70-qa/test-plans/desktop/018-conversation-level-controls.md)
- Mobile: [70-qa/test-plans/mobile/018-conversation-level-controls.md](../../70-qa/test-plans/mobile/018-conversation-level-controls.md)
- CLI: [70-qa/test-plans/cli/018-conversation-level-controls.md](../../70-qa/test-plans/cli/018-conversation-level-controls.md)
- VS Code: [70-qa/test-plans/vscode/018-conversation-level-controls.md](../../70-qa/test-plans/vscode/018-conversation-level-controls.md)
- Chrome: [70-qa/test-plans/chrome/018-conversation-level-controls.md](../../70-qa/test-plans/chrome/018-conversation-level-controls.md)

## 10. Gaps and dependencies

- **Copy into Project, Outline and Scroll-position restoration have no code in the brief** Affects: all apps. Evidence: brief lines 40-42, 64-66, 77-79. Work needed: Design and build
- **Jump to a turn missing on mobile, CLI, VS Code, Chrome; brief lists no web or desktop status** Affects: those apps. Evidence: brief line 70. Work needed: Confirm and build
- **Usage summary missing on Web, Desktop, Mobile** Affects: Web, Desktop, Mobile. Evidence: brief line 113. Work needed: Add per-conversation totals
- **Connected accounts per conversation unfinished in the UI** Affects: Web, Desktop. Evidence: brief line 130. Work needed: Finish the UI
- **Brief is out of date: mobile Duplicate and web instructions exist** Affects: planners and testers. Evidence: useConversationActions.ts:282; route.ts:276. Work needed: Re-audit and correct the brief
- **Chrome extension lacks most controls** Affects: Chrome. Evidence: brief status lines. Work needed: Decide scope

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- table:web_conversations
- api:PATCH /api/chat/conversations/[id]
- api:POST /api/chat/conversations/[id]/restore
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-execution-boundaries
- F018-01

## Unknown

- Desktop and Chrome code for most items was not opened
- VS Code labels and behaviour not opened
- Contents and results of listed tests
- Share link plan limits and expiry rules
- Whether conversation instructions have a web UI
- Hard-purge schedule for soft-deleted chats
- Which items the brief's stale line numbers actually point to (apps/cli/src/lib.rs:258 does not)
- Feature flags for any item

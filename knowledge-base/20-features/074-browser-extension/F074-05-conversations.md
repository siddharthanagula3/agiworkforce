---
id: "F074-05"
type: "feature"
title: "Conversations"
aliases: ["Multiple side conversations", "Recent chats", "History drawer", "Conversation history", "New chat", "S74.11", "agi_browser_conversations_v2"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.11"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "store:chrome.storage.local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-05 Conversations

In the Chrome extension the person keeps several separate chats. A clock icon ('Recent chats') opens a drawer to open, search, pin, rename, move to a project, archive, share or delete a chat; a new-chat icon starts another. Chats are saved in the browser and chats run only in Managed Cloud can be mirrored to the AGI account.

Area: [74. Browser extension](README.md). Requirement items: [S74.11](../../10-requirements/capabilities/074-browser-extension.md#s7411).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores each conversation locally under the signed-in account, lets the person switch between them, and organises them. Cloud-eligible chats are synced to the AGI account so they appear on other apps. (apps/extension/src/features/background/conversation-history.ts:41-60; apps/extension/src/side_panel.ts:11523-11547, 12807-12960)

**Why it exists.** Brief item S74.11: the user keeps several separate conversations in the extension and switches between them. (doc: knowledge-base/data/area-briefs/074-browser-extension.md)

**Who uses it.** Chrome extension users who work on several topics.

**Problems it solves**

- Return to an earlier chat after closing the panel.
- Keep topics apart.
- Continue the same chat on the web or phone.

**Use cases**

- Open yesterday's research chat from Recent chats.
- Pin an important chat to the top.
- Archive finished chats.
- Search by words in a chat when the list is long.

## 2. User experience

**Where to find it**

- surface:chrome side panel header: clock icon titled 'Recent chats' and an icon titled 'New chat' (apps/extension/_locales/en/messages.json:812-814, 946-948; side_panel.ts:11523-11547).
- Search box 'Search recent chats' appears when more than 10 chats are listed (side_panel.ts:1131, 12812-12820).
- Row menu (three dots) and a title menu for the open chat (side_panel.ts:12685-12800).
- 'Archived' toggle appears when archived chats exist (messages.json:2772-2774).

**Before you start**

- A signed-in AGI account; the list shows only chats of the current account and organisation (side_panel.ts:12807-12826).
- Archive, Open in Web and cloud sharing need the chat to be synced to the account (side_panel.ts:12731-12738, 12778-12786).

**Screens and controls**

- Drawer list with a badge showing device or cloud state, title, age, pinned marker.
- Row menu: Share, Rename, Pin or Unpin, Move to project, Archive or Unarchive, Open in Web, Copy session ID, Delete chat (side_panel.ts:12755-12800).
- Title menu for the open chat adds Schedule, Add to project and Continue on phone (side_panel.ts:12741-12760).
- Confirmations: delete says 'Delete this chat from this device? It cannot be recovered.' or the account variant; archive says it moves to Archived and can be restored (messages.json:295-300, 4179-4181).
- Temporary chat item: 'Stays out of your history, search, memory and Library.' (messages.json:2230-2236).

**Journey**

1. 1. Click the clock icon to open Recent chats.
2. 2. Type in 'Search recent chats' if shown.
3. 3. Click a chat; 'Opening chat…' shows and the drawer closes when it loads.
4. 4. Or choose a row action such as Rename, then Save.
5. 5. Click the new-chat icon for a fresh chat. If there is an unsent draft the person is told to send or clear it first (side_panel.ts:11531-11537).

**What the person sees and gets**

- Status line in the drawer ('Chat pinned to the top.', 'Opening chat…', failure messages).
- Empty states: 'No saved conversations', no match, archived empty (side_panel.ts:12840-12850).
- Open chats cannot be opened while a reply streams (side_panel.ts:12905-12915).

**Settings**

- Cloud conversation mirroring toggle stored as agi_cloud_conversation_mirroring; mirroring is on unless set to false (features/privacy/cloudMirroring.ts:1-8). The label of the toggle in Options was not read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Local store key agi_browser_conversations_v2, up to 100 conversations, 100 messages each, 4 MB store, 1 MB per entry, entries expire after 30 days (conversation-history.ts:41-60, 863-866).
- Saved per account owner; list is filtered to the current owner and organisation (side_panel.ts:12807-12826).
- Pin, rename, move to project, archive, unarchive, share, delete, copy session id (side_panel.ts:12685-12800, 12283-12420).
- Pinned chats sort first, then newest activity (side_panel.ts:12830-12838).
- Cloud sync: entries carry a sync state (idle, pending, error, blocked) and ids; flags and titles are sent to the account (conversation-history.ts:121-158; side_panel.ts:12195-12235).
- Chats from the account are pulled into the drawer (refreshManagedCloudRecentHistory at side_panel.ts:12940).
- Temporary chat stays out of history (messages.json:2230-2236).

**Incomplete**

- Sync details were not read in full; only the state model and call sites were.

**Present but disconnected or switched off**

- Chats containing any non-Managed-Cloud or unknown-provenance turn are never mirrored (doc: apps/extension/docs/threat-model.md:12-20).

**Not available**

- Other apps: they have their own history. Account or workspace switching in the extension is 'not applicable anywhere' per brief S74.20.

## 4. Required behaviour

**Established requirements**

- The user keeps several separate conversations and switches between them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.11)
- Chrome keeps conversations browser-local as the authoritative copy; fully Managed Cloud chats are mirrored to the account. (source: doc: apps/extension/docs/threat-model.md:12-20)
- Browser data must not enter synced chat by default. (source: doc: docs/product/requirements.md lines 1215-1218)

**Acceptance criteria**

1. New chat starts an empty conversation; the earlier one appears in Recent chats.
2. Opening a chat from the drawer restores its messages.
3. Pin moves a chat to the top; Rename changes the title; both survive reopening the panel.
4. With more than 10 chats a search box appears and filters the list.
5. Archived chats leave the main list and show under 'Archived'.
6. Delete asks first and removes the chat after confirmation.
7. A chat of another account does not appear after signing in as someone else.
8. Opening a chat is blocked while a reply streams.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Archive is offered only for account-synced chats. [inferred] (side_panel.ts:12731)
- Old local chats disappear after 30 days. [inferred] (conversation-history.ts:863-866)

**Proposed improvements** (suggestions, not requirements)

- [proposed] Tell the person when local chats are about to expire after 30 days.
- [proposed] Offer a 'Recently deleted' holding area (AGENTS.md section 9 asks chats be archived or moved there for agent actions; user delete here is permanent and confirmed).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | Conversation store | `apps/extension/src/features/background/conversation-history.ts` | Saves, lists, updates, deletes and prunes conversations (1373, 1590, 1918, 1956; limits 41-60). |
| store | agi_browser_conversations_v2 | `apps/extension/src/features/background/conversation-history.ts` | chrome.storage.local key (41). |
| service | filterConversations | `apps/extension/src/features/background/conversation-history.ts` | Search over titles and bounded text (1597). |
| component | History drawer | `apps/extension/src/side_panel.ts` | Search, list, archived toggle (12150-12230, 12807-12960). |
| component | History row menu | `apps/extension/src/side_panel.ts` | Row and title menus (12685-12800). |
| component | Header buttons | `apps/extension/src/side_panel.ts` | Recent chats and New chat icons (11523-11547). |
| service | changeHistoryEntry | `apps/extension/src/side_panel.ts` | Applies pin, archive, rename, move locally and in the account (12196-12245). |
| service | openStoredConversation | `apps/extension/src/side_panel.ts` | Restores a chat into the panel. |
| service | resetConversationView | `apps/extension/src/side_panel.ts` | Clears the view for a new chat (1901). |
| service | conversationSync | `apps/extension/src/features/cloud-bridge/conversationSync.ts` | Pushes and pulls conversations with the account. |
| service | conversationSyncClient | `apps/extension/src/features/cloud-bridge/conversationSyncClient.ts` | HTTP client for conversation sync. |
| service | conversationHistoryPull | `apps/extension/src/features/cloud-bridge/conversationHistoryPull.ts` | Refreshes recent history from the account. |
| config | cloudMirroring | `apps/extension/src/features/privacy/cloudMirroring.ts` | Mirroring on/off flag (1-8). |
| service | conversation-session | `apps/extension/src/features/background/conversation-session.ts` | Session scope for conversations (file exists; contents not read). |
| config | history strings | `apps/extension/_locales/en/messages.json` | Labels and confirmations. |
| test | conversation-history test | `apps/extension/__tests__/conversation-history.test.ts` | Store behaviour (41 tests). |
| test | conversation-sync test | `apps/extension/__tests__/conversation-sync.test.ts` | Sync behaviour (49 tests). |
| test | side-panel-history-resume test | `apps/extension/__tests__/side-panel-history-resume.test.ts` | Resume from history (19 tests). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Each turn is saved to the local store under the account owner. | device | apps/extension/src/features/background/conversation-history.ts:1373 |
| The drawer reads the local store and, when opened, asks the account for recent chats to merge. | device and our servers | apps/extension/src/side_panel.ts:12923-12960 |
| Pin and archive flags are first sent to the account for synced chats, then saved locally. | our servers | apps/extension/src/side_panel.ts:12205-12225 |
| Eligible chats are mirrored to the account in the background with inference skipped, so mirroring costs no model use. | our servers | doc: apps/extension/docs/threat-model.md:44-50 |
| Entries older than 30 days are removed at save time. | device | conversation-history.ts:863-866 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversations with messages, titles, flags, sync state | chrome.storage.local key agi_browser_conversations_v2 | Fully Managed Cloud chats to the AGI account when mirroring is on | 30 days locally; delete asks first and says it cannot be recovered; account copy removed too when confirmed (messages.json:295-300). |
| Session scope and pending state | chrome.storage.session | no | Cleared when the browser session ends. [inferred] |

**Models and providers.** Listing and organising use no model. Titles are derived from the first user message locally (conversation-history.ts:869-873). The conversation runtime field is managed-cloud or local (conversation-history.ts:104).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account owner scopes the list (side_panel.ts:12807-12826). |
| Permissions | storage permission; no site permission. |
| Subscription | none found for history itself. Sync needs a valid account and may be blocked by policy or workspace (conversation-history.ts:121-158). |
| Limits and metering | 100 chats, 100 messages per chat, 4 MB total, 1 MB per entry, 30 days (conversation-history.ts:41-60). Mirrored writes force skipLlm so they do not bill (doc: threat-model.md:44-50). |
| Feature flags | agi_cloud_conversation_mirroring (default on) (features/privacy/cloudMirroring.ts). |
| Model compatibility | not applicable. |
| Provider restrictions | Only chats whose turns all ran in Managed Cloud are mirrored (threat-model.md:12-20). |
| Local mode | Local saving works with no cloud call. The extension has no Local inference mode; the runtime field allows a value 'local' [inferred as a legacy or reserved value; not explained in code read]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty list | 'No saved conversations'. | side_panel.ts:12840-12846 |
| No search match | No-match text. | side_panel.ts:12843-12846 |
| Unsent draft on New chat | Blocked with 'Send or clear your draft before leaving this unsent chat.' | side_panel.ts:11531-11537; messages.json:1446 |
| Reply streaming | Rows are disabled; 'stop before opening' status. | side_panel.ts:12868, 12905-12915 |
| Open fails | Failure status in the drawer. | side_panel.ts:12905-12915 |
| Change fails (account call error) | 'history change failed' status; nothing changes locally. | side_panel.ts:12226-12232 |
| Storage limit reached | Handled with size limits and normalising; user-facing message not found. | conversation-history.ts:41-60 |
| Account refresh fails | 'history refresh failed' status. | side_panel.ts:12956-12960 |
| Sync error and retry | State error with retryAfter and lastError is kept per chat. | conversation-history.ts:121-158 |
| Accessibility | Rows have named open buttons with title and date, menus have role menu, status is a live region. | side_panel.ts:12161-12175, 12855-12866 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/conversation-history.test.ts`: Local store behaviour (41 tests).
- `apps/extension/__tests__/conversation-sync.test.ts`: Sync behaviour (49 tests).
- `apps/extension/__tests__/conversation-cloud-sync-state.test.ts`: Sync state (name only).
- `apps/extension/__tests__/conversation-history-fork.test.ts`: Fork handling (name only).
- `apps/extension/__tests__/conversation-history-new-session.test.ts`: New session (name only).
- `apps/extension/__tests__/conversation-session.test.ts`: Session scope (name only).
- `apps/extension/__tests__/conversation-alias-reconcile.test.ts`: Id alias reconcile (name only).
- `apps/extension/__tests__/side-panel-history-resume.test.ts`: Resume from history (19 tests).
- `apps/extension/__tests__/history-share.test.ts`: Sharing (name only).
- `apps/extension/__tests__/side-panel-history-fork.test.ts`: Fork in panel (name only).

**Test scenarios**

- **Switch chats**
  1. Sign in and send a message.
  2. Click New chat and send another.
  3. Open Recent chats and click the first chat.
  - Expected: The first chat's messages are restored.
- **Pin and rename**
  1. Open a row menu, choose Pin, then Rename and Save.
  - Expected: The chat moves to the top with the new name and keeps both after reopening the panel.
- **Search**
  1. Create 11 chats and open Recent chats.
  - Expected: A search box appears and filters by text.
- **Archive**
  1. Archive a synced chat and press the Archived toggle.
  - Expected: It leaves the main list and shows under Archived.
- **Delete**
  1. Choose Delete chat and confirm.
  - Expected: The confirmation names the consequence; after confirm the chat is gone.
- **Account switch**
  1. Sign out and in as another account.
  - Expected: The first account's chats are not listed.

**Where to look when it fails**

- Panel console '[SidePanel] history change failed:'.
- chrome.storage.local key agi_browser_conversations_v2 in devtools.
- Per-entry cloudSync.state, lastError and blockedReason fields (conversation-history.ts:121-158).

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Local chats expire after 30 days with no notice.** Affects: surface:chrome users. Evidence: conversation-history.ts:60, 863-866. Work needed: Notice or setting; confirm intended.
- **Sync behaviour was not verified in full.** Affects: documentation accuracy. Evidence: conversationSync.ts only skimmed. Work needed: Read sync code and tests and document the rules.
- **Archive hidden for chats not yet synced.** Affects: surface:chrome signed-in users with local-only chats. Evidence: side_panel.ts:12731-12732. Work needed: Decide if local archive is wanted.
- **Permanent delete has no Recently deleted holding area.** Affects: surface:chrome. Evidence: messages.json:295-300 says cannot be recovered. Work needed: Product decision against AGENTS.md section 9 intent.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- store:chrome.storage.local

## Unknown

- The account endpoints used for conversation sync (client not read in detail).
- Exact label of the mirroring toggle in Options.
- What 'local' runtime means for a saved message.
- Whether the 30 day expiry also removes the account copy (probably not; not verified).

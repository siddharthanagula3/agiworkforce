---
id: "F041-06"
type: "feature"
title: "Save a temporary chat to history"
aliases: ["Keep this chat", "Save a temporary chat", "Save this chat?", "POST /api/chat/conversations/[id]/keep", "keepTemporaryChat", "keepTemporaryConversation", "Save chat", "S41.10", "S41.11"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.10", "S41.11"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "api:POST /api/chat/conversations/[id]/keep", "table:web_conversations", "table:media_assets", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-files-artifacts-and-storage", "F041-01", "F041-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-06 Save a temporary chat to history

Turns a temporary chat into a normal saved one. On web the person sees a Save this chat? question that counts the messages and mentions files; one database transaction keeps the messages and files. On mobile it is reached only through Share link. Chrome and Tauri desktop have no save path.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.10](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4110), [S41.11](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4111).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Writes the messages of a temporary chat into history, flips the chat to saved and keeps its files, after the person confirms (apps/web/features/chat/pages/WebChatPage.tsx:4969-5012; apps/web/app/api/chat/conversations/[id]/keep/route.ts).

**Why it exists.** A temporary chat holds no messages on the server, so switching it off without a save would lose the conversation. The person can change their mind about a chat worth keeping, and sharing needs a saved chat (apps/web/lib/temporary-chat-policy.ts:6-7).

**Who uses it.** Anyone who started temporary and later wants the chat kept or shared.

**Problems it solves**

- Losing a useful chat because it began as temporary.
- Sharing a temporary chat (refused until saved).

**Use cases**

- Web: turn off Use incognito mid-chat, confirm Save chat.
- Mobile: Share link on a temporary Cloud chat, then Save chat.
- Share a temporary chat after saving.

## 2. User experience

**Where to find it**

- Web: + menu row 'Exit incognito', or the same control reached from the header flow (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1822-1838).
- Web dialog titled 'Save this chat?' with confirm 'Save chat' (WebChatPage.tsx:4987-4991).
- Mobile: open a Cloud temporary chat, chat menu, 'Share link' (cloud only), alert 'Save this chat to share it?' with Cancel and 'Save chat' (apps/mobile/app/(app)/chat/[id].tsx:2136-2160, 2186-2196).
- Share dialog on web shows 'A temporary chat cannot be shared. Turn off temporary chat to keep it, then share it.' (apps/web/features/chat/components/share/ShareConversationDialog.tsx:396).

**Before you start**

- The chat is temporary and has an id on the server.
- No turn is running (web toggle disabled during a turn).
- Mobile: Cloud mode.

**Screens and controls**

- Web confirm dialog (useConfirmAction), non-destructive style.
- Mobile system alert.

**Journey**

1. Web: turn off temporary. If there are keepable messages the dialog shows: 'All N messages in this chat (or The message in this chat), and any files you attached, will be kept in your history. From now on it follows your memory and data settings like any other chat.'
2. Choose Save chat. The page posts messages to the keep endpoint.
3. Server flips the chat, writes messages in order, sets the active leaf and flips the files in one transaction.
4. Toast 'Chat saved to your history.' and the row becomes a normal chat.
5. Choose Cancel: the chat stays temporary and nothing changes.
6. If there are no keepable messages the flag is simply patched with no question.

**What the person sees and gets**

- Success toast 'Chat saved to your history.' (WebChatPage.tsx:5002).
- Failure toast with the server message or 'This chat could not be saved.' (WebChatPage.tsx:5004-5006).
- 409 'This chat is already saved.' if already kept (keep route.ts:28).
- Free daily message-write limit error if exhausted.
- Mobile: alert 'Chat saved' / 'It is in your history. You can share it now.' or 'This chat could not be saved' (chat/[id].tsx:2154-2163).

**Settings**

- none; memory and data settings then apply 'like any other chat' (dialog text).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: handleSetTemporaryChat opens the dialog when there are user or assistant messages that are not streaming and keepable (WebChatPage.tsx:4973-4981, 4988-5008).
- Server keep route: CSRF, rate limit, UUID check, body schema (max 1000 messages), ownership read, 409 if already saved, free daily allowance check, one transaction with chat flip, ordered message inserts, active leaf, file flip; then artifact indexing for assistant messages (keep route.ts:38-167).
- Files flipped include those attached by the kept messages and those linked to the conversation (keep route.ts:137-147).
- Mobile: keepTemporaryConversation posts to the same endpoint then marks the chat permanent locally (apps/mobile/stores/chat/chatMessageStore.ts:1031-1050, 1020-1030).
- Messages with empty text are dropped unless an assistant message holds a completed image or video (apps/web/lib/chat-kept-messages.ts:25-36).

**Incomplete**

- Mobile: the alert only says 'Saving moves it into your history like any other chat.' and does not list what will be kept, so the review step in S41.11 is not fully met (chat/[id].tsx:2140-2143).
- Mobile: reached only from 'Share link' in the chat menu; no plain 'Save chat' action (chat/[id].tsx:2186-2196).
- Mobile keep drops messages with empty text, so an image-only assistant reply is not kept, and sends no message metadata or attachments info (chatMessageStore.ts:1034-1040); the web path keeps media-only assistant messages and attachment metadata (WebChatPage.tsx:905-926).
- Web: cancel returns 'true' to the composer so no failure notice shows; a failed save shows a toast and the store stays temporary (WebChatPage.tsx:4985-5010).
- The brief says desktop is done per brief; no save path was found in apps/desktop/src (search for keep and Save this chat found nothing). In the public Electron desktop the hosted web flow applies.

**Present but disconnected or switched off**

- none found

**Not available**

- Chrome: only End temporary chat (discard) or Turn off before sending; no save (apps/extension/src/side_panel.ts:8959-8970).
- Desktop Tauri: no save path found.
- CLI, VS Code: no temporary chat.

## 4. Required behaviour

**Established requirements**

- The user can explicitly save a temporary conversation, and everything in it is then kept. (source: Brief S41.10)
- Before a temporary chat becomes a normal one, the user sees what will be kept and confirms. (source: Brief S41.11)
- The save is one database transaction; any failure changes nothing. (source: apps/web/app/api/chat/conversations/[id]/keep/route.ts:101-148)
- At most 1000 messages; Free users pass a daily message-write allowance first. (source: keep route.ts:27, 90-96)
- A temporary chat cannot be shared until saved. (source: apps/web/lib/temporary-chat-policy.ts:6-7; apps/web/app/api/share/route.ts:186)

**Acceptance criteria**

1. Turning off temporary on a chat with messages shows 'Save this chat?' with the correct message count.
2. Cancel leaves is_temporary true and keeps all messages on screen.
3. Save chat results in web_conversations.is_temporary false, messages in web_messages in order, and the files' temporary_chat false.
4. Saving an already saved chat returns 409 'This chat is already saved.'
5. A failure mid-way (for example a bad message id) leaves the chat temporary and no partial messages.
6. A Free user over the daily write allowance gets the limit error and nothing is saved.
7. On mobile, Share link on a temporary Cloud chat asks first and, after Save chat, the chat appears in history.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Messages not on screen are lost for a temporary chat, since the server holds none; the client sends what it has [inferred from persist-message.ts:80 and the keep body].

**Proposed improvements** (suggestions, not requirements)

- [proposed] On mobile list how many messages and files will be kept in the alert.
- [proposed] Add a direct Save chat action on mobile.
- [proposed] Keep image-only replies and attachment metadata on mobile to match web.
- [proposed] Add a Chrome and Tauri save path or document why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/chat/conversations/[id]/keep | `apps/web/app/api/chat/conversations/[id]/keep/route.ts` | Transactional save. |
| screen | WebChatPage keepTemporaryChat and handleSetTemporaryChat | `apps/web/features/chat/pages/WebChatPage.tsx` | Client call (905-927) and dialog (4969-5012). |
| hook | useConfirmAction | `packages/ui` | Confirmation surface used for the dialog (import in WebChatPage.tsx). |
| component | ChatComposerNew toggle | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Calls onSetTemporaryChat and shows failure notice. |
| service | chat-kept-messages | `apps/web/lib/chat-kept-messages.ts` | Which messages are keepable and how empty ones are stored. |
| service | message-thread helpers | `apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts` | INSERT_MESSAGE_SQL and setActiveLeaf used in the transaction. |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | assertFreeDailyAllowance for message writes (519-539). |
| service | index-artifacts | `apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts` | scheduleArtifactIndexing after save. |
| table | web_conversations, web_messages, media_assets | `apps/web/db/neon/0050_temporary_chat_retention.sql` | Rows changed by the transaction (web_messages name from persist-message code path, not opened). |
| store | mobile keepTemporaryConversation | `apps/mobile/stores/chat/chatMessageStore.ts` | Posts to keep and clears temporary locally. |
| screen | mobile chat thread share flow | `apps/mobile/app/(app)/chat/[id].tsx` | Share link menu and save alert. |
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Refusal text for temporary chats. |
| endpoint | POST /api/share | `apps/web/app/api/share/route.ts` | Refuses sharing a temporary chat (line 186). |
| config | policy texts | `apps/web/lib/temporary-chat-policy.ts` | TEMPORARY_CHAT_SHARE_REFUSAL and NOT_SAVED. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person turns temporary off; client collects keepable user and assistant messages not streaming. | device | WebChatPage.tsx:4973-4981 |
| Dialog asks; on confirm the client POSTs title and messages with CSRF header. | device | WebChatPage.tsx:905-926 |
| Server checks CSRF, rate limit, id, body, ownership; refuses if already saved. | our servers | keep route.ts:52-90 |
| For Free plans checks the daily message-write allowance. | our servers | keep route.ts:90-96; tier-unit-quota-service.ts:519-539 |
| Transaction: flip is_temporary, insert messages in order with parent links, set active leaf, flip file flags. | our servers | keep route.ts:101-148 |
| After commit, assistant messages are scheduled for artifact indexing; response returns kept and keptFiles counts. | our servers | keep route.ts:154-167 |
| Client sets the local chat as not temporary and shows a toast. | device | WebChatPage.tsx:5001-5002 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Messages of the chat | tables for conversation messages on our servers (created by this transaction) | Join normal history, search and sync once saved | Normal chat retention |
| Conversation flag | web_conversations.is_temporary | Yes, appears in lists | No 30-day purge after save |
| Files | media_assets.temporary_chat false | Appear in Library | Library clock |

**Models and providers.** No model is called by the save. Assistant messages are indexed for artifacts afterwards (scheduleArtifactIndexing); whether that calls a model was not traced (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in owner of the chat; ownership checked with user and workspace. |
| Permissions | CSRF token, rate limit class chat-message, owner scope (keep route.ts:52-88). |
| Subscription | Free users: daily message_writes allowance checked before saving (keep route.ts:90-96). Paid plans: allowance function resolves the entitled plan tier; exact numbers were not read (unknown). |
| Limits and metering | 1000 messages per save; content length limited by MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH; message writes counted for Free. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Device-model chats on web are temporary and cannot be in a project; saving one uses the same keep endpoint only if a server conversation exists (unknown). Mobile Local temporary chats have no server row and no save path was found (the Share link item is cloud only, chat/[id].tsx:2189). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Already saved | 409 'This chat is already saved.' | keep route.ts:28, 87-88, 112 |
| Not found / not owner | 404 Conversation not found | keep route.ts:86 |
| Concurrent save | Second one gets 409 after the guarded update returns 0 rows | keep route.ts:101-113; test 'answers 409 when a concurrent save won the race' |
| Message id from another chat | Validation error and rollback | keep route.ts:124-128 |
| Transaction error | 500 'Failed to save this chat'; client shows 'This chat could not be saved.' | keep route.ts:149-150; WebChatPage.tsx:5004-5006 |
| Free allowance spent | Limit error before any write | keep route.ts:90-96 |
| Streaming message | Not included in the saved set | WebChatPage.tsx:4976 |
| Cancel | Chat stays temporary | WebChatPage.tsx:4986 |
| Offline | not handled in the code beyond the generic failure toast | none found: no offline branch in the keep call (WebChatPage.tsx:905-926) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/[id]/keep/__tests__/route.test.ts`: CSRF, bad id, bad body, 401, 404, already saved 409, race 409, free allowance, ordered chain with indexing, media-only assistant message, files kept.
- `apps/mobile/__tests__/cloud-delete-rename-durability.test.ts`: Contains a keepTemporaryConversation case (line 1106; details not read).
- `apps/web/features/chat/components/share/ShareConversationDialog.test.tsx`: Share dialog with temporary chats (mentions temporary).
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: Toggle off and on from the menu.

**Test scenarios**

- **Save with files**
  1. Web temporary chat, attach a file, send two messages.
  2. Exit incognito, choose Save chat.
  3. Open History and Library.
  - Expected: Chat in history with both messages, file in Library, toast shown.
- **Cancel**
  1. Same chat; Exit incognito; Cancel.
  - Expected: Still temporary, header label remains.
- **Already saved**
  1. Call keep twice.
  - Expected: Second call 409 'This chat is already saved.'
- **Free allowance**
  1. As a Free user at the daily write limit, save a chat.
  - Expected: Limit error, chat remains temporary.
- **Mobile save**
  1. Cloud temporary chat on phone; menu, Share link, Save chat.
  - Expected: Alert 'Chat saved'; chat shows in history; sharing can continue.
- **Atomicity**
  1. Send a keep request with a message id that belongs to another conversation.
  - Expected: Error and no change.

**Where to look when it fails**

- Server log 'Failed to keep temporary chat' with conversationId (keep route.ts:149).
- Check is_temporary and message rows for the chat.
- Response JSON kept and keptFiles counts.
- Mobile alert 'This chat could not be saved' text.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Mobile alert does not show what will be kept.** Affects: Mobile. Evidence: chat/[id].tsx:2140-2143. Work needed: List counts like the web dialog.
- **Mobile entry only through Share link, and drops image-only replies and attachment metadata.** Affects: Mobile. Evidence: chatMessageStore.ts:1034-1040; chat/[id].tsx:2189-2196. Work needed: Add Save chat action and match web filtering.
- **No save on Chrome or Tauri desktop.** Affects: Chrome, Desktop Tauri. Evidence: side_panel.ts:8959-8970. Work needed: Decide.
- **First draft says turning on in a chat with messages asks Save this chat?; the question appears when turning off.** Affects: Documentation. Evidence: WebChatPage.tsx:4973-4990. Work needed: Correct the draft; decide whether turning ON with existing saved messages needs a question about what happens to them.
- **Brief says desktop done; no desktop code found for save.** Affects: Desktop. Evidence: no match in apps/desktop/src. Work needed: Check the Electron path through the hosted web app and update the brief.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- api:POST /api/chat/conversations/[id]/keep
- table:web_conversations
- table:media_assets
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-files-artifacts-and-storage
- F041-01
- F041-05

## Unknown

- Plan numbers behind the Free daily message-write allowance.
- Whether a device-model web chat has a server row that can be kept.
- What happens to messages persisted before temporary was turned ON in an existing chat (the flip does not delete them in the route read).
- Whether scheduleArtifactIndexing calls a model.
- Whether the public Electron desktop shows the same dialog (it hosts the web app; not run).

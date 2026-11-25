---
id: "F016-05"
type: "feature"
title: "Edit in place and version paging"
aliases: ["Edit in place and version paging", "Edit message", "MessageEditModal (mobile)", "Message version navigation (S16.11)", "Edit action (S16.08)", "Replace this message"]
area: "16 User-message components"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S16.08", "S16.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "table:web_messages", "table:web_conversations", "F016-03", "F016-06", "mode:local", "mode:own-key"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-05 Edit in place and version paging

Lets you change a sent message and resubmit it for a new reply. On web the bubble turns into an editor; saving adds the new version beside the old one and you page between them with previous and next arrows. With versions switched off the old reply is deleted after a confirm. Mobile edits in a modal. CLI, VS Code and Chrome cannot edit.

Area: [16. User-message components](README.md). Requirement items: [S16.08](../../10-requirements/capabilities/016-user-message-components.md#s1608), [S16.11](../../10-requirements/capabilities/016-user-message-components.md#s1611).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Opens an editor on a user message, resubmits the changed text as a new turn, and keeps the old message and its reply reachable through a pager ('2/3').

**Why it exists.** Edit and resubmit is a universal chat concept (docs/product/requirements.md section 6.2) and the brief requires edit in place (S16.08) and paging between versions (S16.11). The migration comment says earlier behaviour destroyed the old answer, so versions were added (apps/web/db/neon/0156_message_thread_variants.sql:5-9).

**Who uses it.** People who want to fix or refine a question without losing the first answer.

**Problems it solves**

- Typo or wrong wording in a prompt.
- Losing a good earlier answer when you try a new wording.
- Accidentally deleting later replies.

**Use cases**

- Fix a typo in a prompt and compare both answers.
- Rework a question three times and page between versions.
- On phone, edit a prompt and its attachments through a modal.

## 2. User experience

**Where to find it**

- Web and public Electron desktop: pencil button 'Edit message' in the user message's action row (apps/web/features/chat/components/messages/MessageBubble.tsx:3726-3739).
- Mobile: long-press, 'Edit Message', opens MessageEditModal (apps/mobile/src/features/chat/components/MessageBubble.tsx:1642-1644, 3310).
- Internal Tauri desktop: edit icon under the bubble opens an inline textarea with Cancel and Save (packages/ui/unified-chat/src/components/MessageBubble.tsx:737-780), shown only if the host passes onEdit.
- CLI, VS Code and Chrome: no edit control found.

**Before you start**

- The conversation is not streaming; for the free website trial, the trial must not be used up (WebChatPage.tsx:5478-5495).
- Message is a user message.

**Screens and controls**

- Web editor (EditableMessage) with save and cancel; pager buttons 'Previous version' and 'Next version' beside the message (VariantPager.tsx).
- Confirm dialog 'Replace this message?' with button 'Replace' when versions are off and replies would be deleted (WebChatPage.tsx:5636-5646).
- Mobile modal edits text and attachments; save asks confirmations before rewriting.

**Journey**

1. Click Edit message on your message.
2. The bubble becomes an editor with the text.
3. Change the text, then save (or cancel).
4. A new turn is sent. With versions on, the old version stays; with versions off a confirm names how many replies will be deleted.
5. Use the arrows to page between versions.

**What the person sees and gets**

- New reply streams below the edited version.
- Pager text 'n/m'; screen reader 'Edited message, version n of m'.
- Errors appear as chat errors, for example a refused replay or a Local-to-own-key boundary refusal.

**Settings**

- Message variants switch (build variable NEXT_PUBLIC_MESSAGE_VARIANTS, 'variants' query parameter, local storage agi.message-variants; default on) (apps/web/features/chat/lib/message-variants-gate.ts:1-60).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Edit opens only if planMessageEdit allows it (not streaming, not an image turn still saving, not trial-exhausted, a rollback plan exists) (apps/web/features/chat/pages/WebChatPage.tsx:5478-5503).
- Web: save with variants on resends as a sibling of the original, with the edited row's parent (WebChatPage.tsx:5574-5594).
- Web: variants off falls back to replace with a confirm that names the discarded count (WebChatPage.tsx:5596-5612, 5626-5656).
- Web: an open editor closes when the message starts streaming (MessageBubble.tsx:954-956).
- Web: empty text is ignored (WebChatPage.tsx:5631-5632).
- Web: pager disabled while the conversation streams (MessageBubble.tsx:992-1002).
- Mobile: editMessage keeps versions when the conversation keeps earlier versions, otherwise removes later messages and restores them if the send is not accepted (apps/mobile/stores/chat/chatExecutionStore.ts:6076-6184).
- Mobile: pager labelled 'Edited message, version n of m' (MessageBubble.tsx:548-590).

**Incomplete**

- Brief marks the pager UI unfinished on web and desktop (S16.11); not identified in code.
- Tauri shared bubble edit only saves when text changed and is non-empty; does nothing for attachments (packages/ui/unified-chat/src/components/MessageBubble.tsx:720-724).
- Without the inline-edit provider, web falls back to prefilling the composer (WebChatPage.tsx:5509-5524).

**Present but disconnected or switched off**

- Variants can be switched off by environment, query or local storage (message-variants-gate.ts:1-60).
- Whether the Tauri host passes onEdit into the shared list: unknown.

**Not available**

- Edit in CLI, VS Code, Chrome (brief S16.08; no edit code found in their bubble files).
- Version paging in CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- A sent user message can be edited in place and resubmitted, producing a new reply. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.08)
- When a user message has several revisions the user can page between them (n of m) and the thread follows the chosen revision. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.11)
- Edit opens only if the page's guards allow it; save resubmits as a sibling so both versions and replies stay reachable; with variants off the old reply is deleted behind a confirm. (source: S16.08 brief Should (code: apps/web/features/chat/pages/WebChatPage.tsx:5619-5656))
- An action a user cannot undo asks first and names the consequence; useConfirmAction is that surface. (source: AGENTS.md section 9)
- Nothing silently routes a Local chat to BYOK or managed cloud; an edit that would do so must fail closed. (source: AGENTS.md section 6 (code: WebChatPage.tsx:5540-5551))

**Acceptance criteria**

1. Web: Edit message opens an editor with the current text; Cancel leaves the transcript unchanged.
2. Web: Save with variants on shows '2/2' and both replies are reachable via the pager.
3. Web: Save with variants off and later replies shows 'Replace this message?' naming the number of deleted messages; Cancel changes nothing.
4. Web: empty or whitespace-only text is ignored on save.
5. Web: Edit does nothing while a reply streams, and opens the upgrade dialog when the free trial is used up.
6. Web: an editor that is open closes when a reply starts streaming.
7. Web: editing a Local conversation while an own-key model is selected is refused with a visible reason.
8. Mobile: Edit Message opens a modal; saving sends and keeps the earlier version when versions are kept.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An edited resend should carry the original attachments and send options; web passes planned.message.attachments and replay options [inferred from WebChatPage.tsx:5586-5592].
- Keyboard users must be able to reach Save and Cancel [inferred; EditableMessage not opened].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Edit in VS Code through the existing rewind and resend flow.
- [proposed] Show a discard count in the mobile confirm as web does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Edit button, handleBeginEdit, handleSaveEdit, closes editor on streaming, mounts pager. |
| component | EditableMessage | `apps/web/features/chat/components/messages/EditableMessage.tsx` | The inline editor UI (file exists; internals not opened). |
| component | VariantPager | `apps/web/features/chat/components/messages/VariantPager.tsx` | Version paging control. |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | planMessageEdit, runSubmitEdit, messageInlineEdit provider, confirm dialog. |
| service | pendingEdit | `apps/web/features/chat/lib/pendingEdit.ts` | planEditRollback: which rows an edit would replace. |
| service | message-variants-gate | `apps/web/features/chat/lib/message-variants-gate.ts` | Variants on or off. |
| service | localByokHandoff | `apps/web/features/chat/lib/localByokHandoff.ts` | resolveRegenerateBoundaryRefusal blocks Local-to-own-key edits. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | sendMessage with userMessageParentId for the sibling edit. |
| schema | Message thread variants migration | `apps/web/db/neon/0156_message_thread_variants.sql` | parent_id and active_leaf_message_id. |
| component | MessageEditModal (mobile) | `apps/mobile/src/features/chat/components/MessageEditModal.tsx` | Edit modal (imported at MessageBubble.tsx:168; file path inferred from the import). |
| store | chatExecutionStore.editMessage | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile edit logic with version or replace paths. |
| screen | Chat screen (mobile) | `apps/mobile/app/(app)/chat/[id].tsx` | handleEditMessage wires the store call. |
| component | MessageBubble (shared UI) | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Inline textarea editor for the Tauri chat. |
| test | Edit request test | `apps/web/features/chat/components/messages/__tests__/MessageBubble.editRequest.test.tsx` | Opens editor on request; respects refusal. |
| test | Pending edit test | `apps/web/features/chat/lib/pendingEdit.test.ts` | Rollback planning. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click Edit: the bubble asks the page's beginEdit; the page runs planMessageEdit and answers whether the editor may open. | device | MessageBubble.tsx:931-936; WebChatPage.tsx:5478-5503, 5629 |
| Save: text is trimmed, empty is ignored; with versions off and replies below, a confirm opens first. | device | WebChatPage.tsx:5630-5646 |
| runSubmitEdit checks the Local-to-own-key boundary, the replay of recorded send options and connector context; any refusal sets a chat error and stops. | device | WebChatPage.tsx:5540-5572 |
| With versions on, sendMessage posts the new text with the edited row's parent id, so the new row is a sibling; the stream replies on the server (cloud) or on the device (Local model). | device and our servers | WebChatPage.tsx:5574-5594; apps/web/lib/hooks/useChatStream.ts:4160-4163 |
| With versions off, sendReplacingMessages deletes the replaced server rows only after the new turn is saved. | our servers | WebChatPage.tsx:5596-5612, comment at 5621-5625 |
| Paging moves the active leaf, the visible thread switches. | device | ChatMessageList.variants.test.tsx:134 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New user message row with parent_id equal to the original's parent; conversation active leaf | Client store and server tables web_messages and web_conversations (migration 0156); mobile local message store and, for cloud chats, remote messages | Yes for cloud conversations | Versions-off edits delete replaced rows; mobile cloud edit calls deleteCloudMessagesRemote and warns 'could not be removed' on failure (chatExecutionStore.ts:6140-6152) |

**Models and providers.** The edited turn is sent under the currently active model (activeModelId); a Local conversation edited with an own-key model is refused (WebChatPage.tsx:5540-5551). The edit UI is model independent.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a displayed conversation id and a signed-in session to send (WebChatPage.tsx:5479). |
| Permissions | none found in the code beyond the guards above. |
| Subscription | Free website trial: when the trial is used up, Edit opens the upgrade dialog instead (WebChatPage.tsx:1288-1293, 5488-5491). Other plan checks: none found in this path. |
| Limits and metering | The edited turn is a new send and counts as one like any send; metering is server side (not read). |
| Feature flags | Message variants flag (message-variants-gate.ts:1-60). |
| Model compatibility | Any model for the new turn; replay options are checked and may refuse (WebChatPage.tsx:5553-5560). |
| Provider restrictions | Local conversation cannot be edited under an own-key provider (localByokHandoff.ts:105-117). |
| Local mode | Edit works on a Local conversation if the active model is still the local one; the turn stays on the device (useChatStream.ts:4160-4163). Switching to an own-key model first is refused. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | planMessageEdit returns null, and an open editor closes. | WebChatPage.tsx:5479; MessageBubble.tsx:954-956 |
| Image turn still saving | Toast 'Wait for this image turn to finish saving before editing it.' | WebChatPage.tsx:5480-5483 |
| Trial used up | Upgrade dialog opens. | WebChatPage.tsx:5488-5491 |
| Row vanished while editing | Save returns silently. | WebChatPage.tsx:5580-5584 |
| Empty text | Ignored. | WebChatPage.tsx:5631-5632 |
| Mobile send not accepted | Removed tail is put back. | apps/mobile/stores/chat/chatExecutionStore.ts:6155-6171 |
| Mobile cloud edit fails | Error text 'Could not replace the Cloud message...'. | chatExecutionStore.ts:6173-6182 |
| Offline | not handled in the code on web in this path | No offline branch in WebChatPage.tsx:5478-5666 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/__tests__/MessageBubble.editRequest.test.tsx`: Opens the editor for the named message; leaves others alone; respects a refusal from the guard.
- `apps/web/features/chat/components/messages/VariantPager.test.tsx`: Pager behaviour including user messages (line 157).
- `apps/web/features/chat/components/messages/ChatMessageList.variants.test.tsx`: Pager state per message, selection, thread swap.
- `apps/web/features/chat/lib/pendingEdit.test.ts`: Rollback planning for edits.
- `apps/web/features/chat/lib/message-variants-gate.test.ts`: Variants mode resolution.
- `apps/web/lib/hooks/useChatStream.variants.test.tsx`: Sending as a sibling in the stream hook (content not opened; name suggests variants).

**Test scenarios**

- **Edit with versions**
  1. Send a question, wait for the reply.
  2. Edit message, change text, Save.
  3. Click Previous version.
  - Expected: Pager shows 2/2 then 1/2; the first question and reply are back.
- **Edit with versions off**
  1. Open ?variants=off.
  2. Edit a message that has a reply, Save.
  - Expected: 'Replace this message?' names the deleted reply; Replace sends; Cancel changes nothing.
- **Guard refusals**
  1. Start a reply and click Edit.
  2. Then, with a used-up trial, click Edit.
  - Expected: First: nothing opens. Second: upgrade dialog.
- **Local to own key**
  1. Open a Local-model conversation, switch to an own-key model, edit and save.
  - Expected: A chat error explains that regenerating would send the chat off the device.
- **Mobile edit**
  1. Long-press a message, Edit Message, change text and Save.
  - Expected: Modal closes; new reply streams; pager appears if versions are kept.

**Where to look when it fails**

- Check chatError text on web for refusal reasons.
- Mobile: console warnings from chatExecutionStore and the error strings in the store.
- Server: rows with the same parent_id in web_messages.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- Mobile: [70-qa/test-plans/mobile/016-user-message-components.md](../../70-qa/test-plans/mobile/016-user-message-components.md)

## 10. Gaps and dependencies

- **No edit in CLI, VS Code or Chrome** Affects: Those apps. Evidence: Brief S16.08 missing; VS Code offers only Resend and Branch (webviewContent.ts:4925-4932). Work needed: Add edit-and-resend per surface or mark not applicable.
- **Pager UI marked unfinished by the brief** Affects: Web, desktop. Evidence: S16.11 'Unfinished: ui'. Work needed: Find what is unfinished and close it; current code and tests show a working pager.
- **Tauri shared bubble edit lacks versions and attachments** Affects: Internal Tauri desktop. Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:720-724. Work needed: Align with web or retire.
- **Migration 0156 header says not applied** Affects: All cloud users if the column is missing. Evidence: apps/web/db/neon/0156_message_thread_variants.sql:4. Work needed: Confirm applied state and fix the header.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- table:web_messages
- table:web_conversations
- F016-03
- F016-06
- mode:local
- mode:own-key

## Unknown

- Whether EditableMessage supports keyboard-only save and cancel (file not opened).
- Whether the Tauri host passes onEdit into the shared list.
- Whether migration 0156 is applied in production.
- What the brief means by the unfinished 'ui' part of the pager.
- Mobile versions-kept rule (keepsEarlierVersions) definition was not opened.

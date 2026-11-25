---
id: "F016-09"
type: "feature"
title: "Sending state: queued, pending, draft"
aliases: ["Queued", "Queued messages", "follow-up queue", "Steer", "Sent to the running reply", "Sending / Not sent (VS Code)", "delivery state", "draft", "composer draft", "unsent draft", "Choose which draft to keep", "S16.14", "S16.17", "S16.18"]
area: "16 User-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S16.14", "S16.17", "S16.18"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:cli", "surface:chrome", "mode:local", "mode:cloud", "table:web_conversations", "api:PUT /api/chat/conversations/[id]", "store:composer-draft (mobile on-device key-value store)", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-execution-boundaries", "SYS-memory-projects-and-context", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "5 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-09 Sending state: queued, pending, draft

While a reply is running, a message you type waits in a queue (shown as a Queued row with Edit and Cancel) and is sent when the reply ends. Unsent text is also kept as a draft per conversation. Web syncs drafts across devices. VS Code marks each message Sending, Queued, Running, Steered, Not sent or Cancelled.

Area: [16. User-message components](README.md). Requirement items: [S16.14](../../10-requirements/capabilities/016-user-message-components.md#s1614), [S16.17](../../10-requirements/capabilities/016-user-message-components.md#s1617), [S16.18](../../10-requirements/capabilities/016-user-message-components.md#s1618).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | built (this page lists unfinished parts) | partly built | not seen by a person |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Holds follow-up messages written during a running reply, shows them as waiting, and sends them when the turn ends. Keeps unsent composer text for each conversation so leaving and returning does not lose it (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3951-3972,4342-4420).

**Why it exists.** People think of the next question while the model is still answering. They also leave chats half-written. Without a queue and a draft the text is lost or the send is blocked. [inferred]

**Who uses it.** Everyone who chats; developers on VS Code, CLI and Chrome use the same ideas in their own forms.

**Problems it solves**

- A second message typed during a reply is not lost.
- Unsent text survives switching chats, reloads and, on web, other devices.
- A failed or cancelled send is visible as its own state (VS Code).

**Use cases**

- Type a follow-up while a long answer streams; it appears as 'Queued: <text>' and goes out when the answer ends.
- Click Edit on a queued row to change it, or Cancel to drop it.
- Half-write a message, open another chat, come back and find the text there.
- Edit the same draft on two web tabs and choose which version to keep.

## 2. User experience

**Where to find it**

- Web composer: a list labelled 'Queued messages' above the input with rows 'Queued: <text>' (or 'Queued 1 of 2: <text>'), and buttons Edit and Cancel, and Steer when the running reply can take it (ChatComposerNew.tsx:5009-5063).
- Hosted desktop: same as web (doc: AGENTS.md section 5). Tauri desktop: a section labelled 'Follow-up messages' with rows 'Queued', 'Steering' or 'Not sent' and buttons Edit, Send now, Remove (packages/ui/unified-chat/src/components/FollowUpQueue.tsx).
- Mobile: rows with accessibility labels 'Queued message n of m: <text>', 'Edit queued message', 'Cancel queued message' (apps/mobile/src/features/chat/components/ChatInput.tsx:1857-1902).
- VS Code: your message bubble has a dashed border and a caption Sending, Queued, Running, Steered, Not sent or Cancelled; queued ones have Edit and Cancel icons (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:624-690,5554-5591).
- Chrome side panel: list 'Queued messages' with 'Queued: <text>', Edit, Cancel (apps/extension/src/side_panel.ts:15312-15364; apps/extension/_locales/en/messages.json).
- CLI: the hint line shows '· 1 message queued' or 'N messages queued' while a turn runs (apps/cli/src/tui/tui_app.rs:2064-2075).
- Drafts: web 'Choose which draft to keep' dialog with 'Here' and 'Elsewhere' and buttons 'Use the other version' and 'Keep this version' (apps/web/features/chat/components/DraftConflictDialog.tsx:67-93).

**Before you start**

- Queue: a reply must be running (isTurnActive).
- Web draft sync: signed in, a stored (non-temporary) conversation with a UUID id, and no on-device model selected or used in that chat for non-empty drafts (use-conversation-draft-sync.ts:75-84).

**Screens and controls**

- Composer text box, send control (with a chip that a message is waiting), queued rows with Edit, Cancel, Steer.
- Draft conflict dialog and toasts 'This draft changed elsewhere...' with action Compare; 'This draft couldn't sync to your other devices. Retry when ready.' with action Retry (use-conversation-draft-sync.ts:183-216).

**Journey**

1. Send a message and, while it runs, type another and press send.
2. The text clears from the box and appears as 'Queued: <text>'.
3. Optionally press Edit (text returns to the box and the slot is replaced on resend) or Cancel.
4. When the reply ends, the first queued message is sent; the next waits for the following turn end (ChatComposerNew.tsx:4342-4385).
5. Draft: type text and leave the chat; the text is parked per conversation and restored on return; on web, after about 1.5 seconds it is also saved to the server and appears on other devices.

**What the person sees and gets**

- Rows and labels as above; notice 'Your queued message was not sent: you switched chats before the reply finished. It was saved as a draft in the original chat.' when a queued message is stranded (ChatComposerNew.tsx:4405-4418).
- Chrome notices 'Restored your unsent text.' and 'Chrome couldn’t save your draft. Keep this panel open to retain your text.'
- Toast errors for draft sync as listed.

**Settings**

- Settings store option followUpBehavior chooses steer or queue for a message sent during a reply (ChatComposerNew.tsx:1791; packages/ui/unified-chat/src/queue/followUps.ts:88-95).
- One-message override: invert the follow-up behaviour (Cmd or Ctrl plus Shift plus Enter) (followUps.ts comment line 84-87).
- VS Code has a followUpBehavior test file, setting details not opened.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer holds a list of queued follow-ups in component state and flushes the first after the turn ends (ChatComposerNew.tsx:910-914,4342-4385).
- Web queued rows with Edit, Cancel and Steer (ChatComposerNew.tsx:5009-5063).
- Web draft saved as its own column draft with draft_updated_at, never moving updated_at; temporary chats store none (apps/web/app/api/chat/conversations/[id]/route.ts:208-263; migration apps/web/db/neon/0219_conversation_drafts.sql).
- Web sync hook: debounce 1500 ms, up to 3 automatic attempts with growing delay, conflict toast and dialog (use-conversation-draft-sync.ts:23-24,161-216; packages/contracts/cloud-contracts/src/conversation-contract.json:4).
- Web browser-side persistence of drafts in local storage (apps/web/features/chat/components/Composer/composer-draft-storage.ts:150-195).
- Mobile: queue of follow-ups with edit and cancel; drafts, with attachments, in on-device storage keyed by conversation (ChatInput.tsx:383-391,940-956; apps/mobile/src/features/chat/draftStore.ts:137-203).
- VS Code: per-message delivery states via data-delivery-state, queued controls, and per-thread composer drafts in webview state (webviewContent.ts:624-690,5001-5002,5772-5782,5957-5967).
- CLI: queued_prompts list sent after the turn and put back in the composer if the turn stops; a cleared composer is parked per session and recalled with Up (tui_app.rs:611,7274-7275,8482,8756-8763,1133-1157).
- Chrome side panel: queued list from followUpQueue and a per-conversation draft in chrome.storage.session (side_panel.ts:10103-10170,15312-15364).
- Tauri desktop: FollowUpQueue component backed by useFollowUpStore with held state (packages/ui/unified-chat/src/queue/followUps.ts, components/FollowUpQueue.tsx).
- Web draft sync only runs for UUID conversation ids (isUuid check at use-conversation-draft-sync.ts:~158), and every save is rejected when the session or draft owner is no longer current (isCurrentDraft, use-conversation-draft-sync.ts:62-70).
- The server draft cap is 20,000 characters (conversation-contract.json:2, zod .max at packages/contracts/cloud-contracts/src/conversations.ts:191).

**Incomplete**

- Web queue lives only in memory: reload or leaving the chat loses it, except that stranded text is saved as a draft and attachments are dropped (ChatComposerNew.tsx:4393-4418).
- Only the first queued message is flushed per turn end; others wait for later turn ends (ChatComposerNew.tsx:4346-4385).
- Web draft sync stops after 3 failed attempts until the person presses Retry (use-conversation-draft-sync.ts:25-26,176-216).
- Tauri desktop keeps one global draftContent in the store rather than one per conversation (packages/ui/unified-chat/src/components/ChatInput.tsx:278-280); per-conversation draft there: unknown.
- Brief status 'cli missing' and 'chrome missing' for queue and draft is not what the code shows; both have a queue and a draft of some form.

**Present but disconnected or switched off**

- Web does not sync non-empty drafts when a local model is selected or the chat holds on-device turns; an empty draft (a clear) is still sent so a stale server draft is removed (use-conversation-draft-sync.ts:73-84).

**Not available**

- CLI and Chrome do not show 'pending/sending' per message states (only VS Code does).
- CLI draft is device-memory only and not shared across devices (tui_app.rs:608).

## 4. Required behaviour

**Established requirements**

- A message sent while a reply is still running is shown as queued (not yet sent) until it goes out. (source: brief S16.17)
- While a user message is not yet accepted by the service, it shows a pending, sending or queued state. (source: brief S16.14)
- Unsent composer text is kept as a draft per conversation, separate from sent messages, and a failed send returns to the composer as an unsent draft. (source: brief S16.18)
- The composer holds a list of queued follow-ups and sends them when the stream ends. (source: ChatComposerNew.tsx:302,910-914,359)
- The draft is saved as its own field, never as part of the message list, with a revision to detect conflicts; temporary chats store no draft. (source: conversations/[id]/route.ts:208-263)
- Saves are debounced and retried up to 3 times; a conflict can be resolved by keeping mine or theirs. (source: use-conversation-draft-sync.ts:24-27,37-41; DraftConflictDialog.tsx:90-93)
- Non-empty drafts are not synced for conversations that hold Local-model turns; an empty draft is still sent so clearing reaches the server. (source: use-conversation-draft-sync.ts:73-84)
- An empty draft bypasses the local-model and on-device-turn block, so clearing a draft is still sent to the server. (source: use-conversation-draft-sync.ts:80-83)
- Local, own key and Cloud are separate trust boundaries; nothing may silently route a Local chat to another boundary. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Sending while a reply runs shows a 'Queued' row and the box clears.
2. Edit on a queued row puts its text back; sending again replaces that slot, not adds one.
3. Cancel removes the row and sends nothing.
4. When the reply ends the first queued message is sent exactly once.
5. Typing in a stored chat, waiting about 2 seconds, and opening the same chat on another device shows the same draft (web).
6. Editing the same draft on two devices produces the 'Choose which draft to keep' dialog with both versions.
7. A temporary chat never stores a draft on the server.
8. After 3 failed saves a persistent toast with Retry appears.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A failed send should return text to the composer, per brief S16.18; the code path for web failed sends was not opened.
- [inferred] Drafts must be removed or cleared on sign-out; the mobile store has clearAccountScopedDrafts (draftStore.ts:200), but its sign-out call site is not cited, so that part is unverified.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Persist the web queue so a reload keeps it.
- [proposed] Give CLI, Chrome and Tauri the same per-message delivery caption as VS Code.
- [proposed] Update the brief status for CLI and Chrome, since both have a queue.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew (queue) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | QueuedFollowUp type, queue state, flush effect, Edit, Cancel, Steer, queued list UI. |
| hook | useConversationDraftSync | `apps/web/features/chat/hooks/use-conversation-draft-sync.ts` | Debounced save, retry up to 3, conflict handling, local-model exclusion. |
| service | saveConversationDraft | `apps/web/features/chat/services/conversation-draft.ts` | PUT of draft and revision, per-session queue of saves. |
| component | DraftConflictDialog | `apps/web/features/chat/components/DraftConflictDialog.tsx` | Shows 'Here' versus 'Elsewhere' and the two buttons. |
| service | composer-draft-storage | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Browser storage of drafts per owner and conversation. |
| endpoint | PUT /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Writes draft and draft_updated_at; 409 conflict with current draft. |
| table | web_conversations.draft, draft_updated_at | `apps/web/db/neon/0219_conversation_drafts.sql` | Stores the server draft and its revision. |
| config | conversation-contract.json draftSaveDebounceMs | `packages/contracts/cloud-contracts/src/conversation-contract.json` | Debounce value 1500 shared by clients (MANAGED_CLOUD_DRAFT_SAVE_DEBOUNCE_MS); also draftMaxLength 20000, exported as MANAGED_CLOUD_MAX_DRAFT_LENGTH (conversations.ts:60) and enforced by zod .max() at conversations.ts:191. |
| store | useFollowUpStore and resolveFollowUpState | `packages/ui/unified-chat/src/queue/followUps.ts` | Tauri and shared queue store; steer or queue decision. |
| component | FollowUpQueue (unified chat) | `packages/ui/unified-chat/src/components/FollowUpQueue.tsx` | Tauri follow-up rows with Edit, Send now, Remove. |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile queue rows, edit, cancel and draft saving. |
| store | draftStore (mobile) | `apps/mobile/src/features/chat/draftStore.ts` | Draft text and attachments in on-device storage with local or cloud-owner provenance. |
| component | VS Code webview delivery states | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | data-delivery-state captions, queued controls, per-thread composer drafts. |
| service | ChatStateManager (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Extension side of queued messages and composer state. |
| component | TUI queued prompts and parked drafts | `apps/cli/src/tui/tui_app.rs` | queued_prompts, parked_drafts, composer hint. |
| component | Chrome side panel queue and draft | `apps/extension/src/side_panel.ts` | sp-queued-list and chrome.storage.session draft. |
| config | Chrome English strings | `apps/extension/_locales/en/messages.json` | Queued, Edit, Cancel, draft notices. |
| store | settings followUpBehavior | `packages/ui/unified-chat/src/stores/settingsStore.ts` | Steer-or-queue preference (referenced by the composer). |
| test | Composer follow-up queue tests | `apps/web/features/chat/components/Composer/ChatComposerNew.followUpQueue.test.tsx` | Queue behaviour tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses send while a turn is active; the composer stores the send arguments with the conversation id and clears the box. | device | ChatComposerNew.tsx:3951-3972 |
| When the turn ends, the composer sends the first queued item in the same conversation; items for another conversation become a draft and a notice. | device | ChatComposerNew.tsx:4342-4418 |
| Draft text is parked in the web chat store and in browser storage as the person types. | device | composer-draft-storage.ts:150-195; ChatComposerNew.tsx:900-913 |
| After the debounce the sync hook PUTs the draft with its revision to the conversation route; the server writes draft and draft_updated_at or answers 409 with the current draft. | our servers | use-conversation-draft-sync.ts:161-176; conversation-draft.ts:159-160; conversations/[id]/route.ts:208-263 |
| A conflict opens a toast and dialog; the person keeps this version or the other. | device | use-conversation-draft-sync.ts:196-216; DraftConflictDialog.tsx:67-93 |
| Mobile saves drafts in on-device storage; Chrome in session storage; VS Code in webview state; CLI in memory. | device | draftStore.ts:148-190; side_panel.ts:10104-10114; webviewContent.ts:5957-5966; tui_app.rs:1133-1141 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web draft text and revision | web_conversations.draft and draft_updated_at; also browser local storage | Yes across devices on web; non-empty drafts are not synced for temporary chats or chats with on-device turns (an empty draft is still sent so a clear reaches the server). | Overwritten by later drafts; an empty draft clears it; every save is rejected when the session or draft owner is no longer current (isCurrentDraft, use-conversation-draft-sync.ts:62-70); further sign-out handling: unknown. |
| Queued follow-ups on web | React state in the composer | No | Lost on reload; stranded text becomes a draft. |
| Mobile draft and attachments | on-device key-value store under 'composer-draft:' keys (draftStore.ts:5) | No | Removed when empty; clearAccountScopedDrafts exists (draftStore.ts:200) but its sign-out call site is not cited, so clearing on sign-out is unverified. |
| Chrome draft | chrome.storage.session | No | Cleared when the browser session ends [inferred from session storage]. |
| VS Code draft and delivery state | webview state and DOM attributes | No | Per webview state. |

**Models and providers.** No model is called to queue or draft. The queued message is later sent through the normal turn path with the same model and route settings captured at queue time (ChatComposerNew.tsx:3925-3945). Web draft sync of non-empty drafts is switched off when an on-device model is selected.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web draft sync needs a loaded, signed-in, current session (use-conversation-draft-sync.ts:86,138). The queue and local drafts need no account on the device. |
| Permissions | The draft route filters by user, organization and non-deleted (route.ts:222-228). |
| Subscription | none found in the code for queue or draft. Sending a queued message later follows the normal plan and usage rules, which belong to SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Draft length cap MANAGED_CLOUD_MAX_DRAFT_LENGTH = 20,000 characters (conversation-contract.json draftMaxLength; exported at conversations.ts:60, enforced by zod .max() at conversations.ts:191); debounce 1500 ms (MANAGED_CLOUD_DRAFT_SAVE_DEBOUNCE_MS, use-conversation-draft-sync.ts:308, from conversation-contract.json draftSaveDebounceMs); 3 automatic attempts and base retry delay 3000 ms (constants at use-conversation-draft-sync.ts:25-26), doubling as 3000 * 2 ** (attempt-1) (line 241), giving 3 s then 6 s. Composer character cap from the message contract (ChatComposerNew.tsx:296). |
| Feature flags | none found in the code; followUpBehavior is a user setting. |
| Model compatibility | Non-empty draft sync is excluded when the chat holds on-device model turns; an empty draft is still sent (use-conversation-draft-sync.ts:73-84). Steering needs a running cloud agent run id (ChatComposerNew.tsx:4430-4436). |
| Provider restrictions | none found in the code. |
| Local mode | Queue and draft work on the device. On web, a non-empty draft is not sent to the server when a local model is selected, which keeps Local text off Cloud storage; an empty draft (clearing) is still sent so a stale server draft is removed (use-conversation-draft-sync.ts:73-84). Mobile marks drafts with local or cloud provenance (draftStore.ts:9). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Queue then switch chats | Queued message is not delivered to the wrong chat; its text is merged into the original chat's draft; attachments are dropped with a notice. | ChatComposerNew.tsx:4393-4418 |
| Edit a queued message | Pending admission is cancelled, text and attachments return to the composer, resend replaces the slot. (Lines 4466-4481 are the steer handler, not Edit.) | ChatComposerNew.tsx:914,3522-3563,3951-3971 |
| Save fails | Retry after delays 3 s, 6 s; third failure shows a persistent toast with Retry. | use-conversation-draft-sync.ts:25-26,241,204-216 |
| Conflict (409) | Toast with Compare and dialog 'Choose which draft to keep'; text kept locally but not synced. | use-conversation-draft-sync.ts:249-275; route.ts:248-258 |
| Chat not on server yet | Save returns not_saved_yet and waits until the conversation appears. | use-conversation-draft-sync.ts:201-205 |
| Temporary chat | Server writes null draft; client does not dispatch. | route.ts:213-216; use-conversation-draft-sync.ts:72-73 |
| Non-UUID conversation id or session/owner no longer current | Draft sync only runs for UUID conversation ids, and every save is rejected when the session or draft owner is no longer current. | use-conversation-draft-sync.ts:~158 (isUuid), 62-70 (isCurrentDraft) |
| Local model selected or on-device turns, draft cleared | An empty draft bypasses the block and is still sent to the server, removing a stale server draft; non-empty drafts are never PUT. | use-conversation-draft-sync.ts:73-84 |
| Stopped or failed turn (CLI) | Queued prompts return to the composer. | tui_app.rs:8744,8756-8763 |
| Mobile storage error | Draft errors are swallowed so rendering never fails. | draftStore.ts:186-189 |
| Chrome storage error | Notice 'Chrome couldn’t save your draft...' or restore failure notice. | side_panel.ts:10113-10116,10163-10168 |
| Accessibility | Web list has aria-label 'Queued messages' and buttons have per-message labels; VS Code buttons have aria-labels; mobile has accessibility labels. | ChatComposerNew.tsx:5010,5045,5053; webviewContent.ts:5561,5570; ChatInput.tsx:1857-1902 |
| Offline | Draft sync fails and retries as above; queue itself needs no network until delivery. | use-conversation-draft-sync.ts:197-216 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpQueue.test.tsx`: Keeps both follow-ups, marks queued sends, cancels one, edits in place.
- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpSteer.test.tsx`: Steering a queued follow-up.
- `apps/web/e2e/composer-follow-up-and-shortcuts.spec.ts`: Follow-up and shortcut end-to-end spec (content not opened).
- `apps/web/features/chat/hooks/useConversationDraftSync.test.tsx`: Debounced save, temporary chat, local-turn chats, retries, clearing, unmount.
- `apps/web/features/chat/services/conversation-draft.test.ts`: Draft save service.
- `apps/web/__tests__/api/chat-conversation-draft.test.ts`: Draft route behaviour.
- `apps/web/db/neon/conversation-drafts-migration.test.ts`: Migration 0219 content.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.followUpQueue.test.tsx`: Mobile follow-up queue.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.draftAttachments.test.tsx`: Mobile drafts with attachments.
- apps/mobile/src/features/chat/__tests__/draft-store.test.ts (not found) (not found): Mobile draft store.
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: VS Code follow-up behaviour in the webview.
- `packages/ui/unified-chat/src/components/__tests__/FollowUpQueue.test.tsx`: Tauri follow-up rows.
- `packages/ui/unified-chat/src/hooks/__tests__/useChat.followUps.test.tsx`: Follow-up handling in the shared chat hook.
- `apps/cli/src/tui/tui_app.rs`: Rust unit tests: stopped turn returns queued prompts; cleared draft recalled only in its session.

**Test scenarios**

- **Queue on web**
  1. Send a long request.
  2. While it streams type 'next' and send.
  3. Watch the row and wait for the reply to end.
  - Expected: 'Queued: next' shows with Edit and Cancel; after the reply 'next' is sent once and the row disappears.
- **Cancel and edit**
  1. Queue two messages.
  2. Cancel the first; edit the second and resend.
  - Expected: First is gone, second keeps one slot with the new text.
- **Cross-device draft**
  1. On web device A type a draft in a saved chat and wait 3 seconds.
  2. Open the chat on device B.
  - Expected: Draft text appears on B.
- **Conflict**
  1. Edit the draft differently on two tabs, one offline until both changed, then reconnect.
  - Expected: Toast 'This draft changed elsewhere...' with Compare, and the dialog offers the two versions.
- **Local model exclusion**
  1. Select an on-device model, type a draft in a stored chat, check the network.
  - Expected: No draft PUT with non-empty text is sent. Clearing the draft to empty is still sent, so a stale server draft is removed.
- **VS Code states**
  1. Send a message, then another while it runs; cancel the queued one.
  - Expected: Captions move Sending, Running, then Queued, then Cancelled.

**Where to look when it fails**

- Toast ids 'draft-sync-<id>' and 'draft-conflict-<id>' on web.
- HTTP 409 with {saved:false, conflict:true, current} from the draft route.
- Column web_conversations.draft_updated_at.
- Mobile storage keys starting 'composer-draft:'.
- Chrome notices spDraftSaveFailed and spDraftRestoreFailed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- Mobile: [70-qa/test-plans/mobile/016-user-message-components.md](../../70-qa/test-plans/mobile/016-user-message-components.md)
- CLI: [70-qa/test-plans/cli/016-user-message-components.md](../../70-qa/test-plans/cli/016-user-message-components.md)
- VS Code: [70-qa/test-plans/vscode/016-user-message-components.md](../../70-qa/test-plans/vscode/016-user-message-components.md)
- Chrome: [70-qa/test-plans/chrome/016-user-message-components.md](../../70-qa/test-plans/chrome/016-user-message-components.md)

## 10. Gaps and dependencies

- **Brief says CLI lacks queue and draft, but the CLI has queued_prompts and a parked draft.** Affects: Brief accuracy, CLI testers. Evidence: apps/cli/src/tui/tui_app.rs:611,1133-1157,2064-2075. Work needed: Correct the brief and decide if the CLI needs a per-message state.
- **Brief says Chrome lacks queue and draft, but the side panel has both.** Affects: Brief accuracy, Chrome testers. Evidence: apps/extension/src/side_panel.ts:10103-10170,15312-15364. Work needed: Correct the brief.
- **Brief says VS Code lacks a draft, but the webview keeps per-thread drafts.** Affects: Brief accuracy. Evidence: webviewContent.ts:5957-5967. Work needed: Correct the brief.
- **Web queue is in memory only; reload loses queued messages.** Affects: Web and hosted desktop users. Evidence: ChatComposerNew.tsx:910-914. Work needed: Persist or warn.
- **Only VS Code shows a per-message sending or failed caption in the transcript.** Affects: Web, mobile, Chrome, CLI users. Evidence: webviewContent.ts:624-690. Work needed: Decide whether to show delivery state elsewhere.
- **Tauri desktop draft is one global value, not per conversation.** Affects: Tauri desktop users. Evidence: packages/ui/unified-chat/src/components/ChatInput.tsx:278-280. Work needed: Confirm and fix if per-conversation is required.
- **Draft sync is off for non-empty drafts in on-device model chats, so those drafts do not follow the person across devices.** Affects: Web users with local models. Evidence: use-conversation-draft-sync.ts:73-84. Work needed: Intentional trust boundary; document it.
- **The mobile sign-out call site for clearAccountScopedDrafts is not cited, so clearing of account-scoped drafts on sign-out is unverified.** Affects: Mobile users who sign out on a shared device. Evidence: apps/mobile/src/features/chat/draftStore.ts:200-210. Work needed: Find the call site and confirm it runs on sign-out.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:cli
- surface:chrome
- mode:local
- mode:cloud
- table:web_conversations
- api:PUT /api/chat/conversations/[id]
- store:composer-draft (mobile on-device key-value store)
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-execution-boundaries
- SYS-memory-projects-and-context
- SYS-authentication-and-identity

## Unknown

- What the contents of apps/web/e2e/composer-follow-up-and-shortcuts.spec.ts assert.
- Whether the Tauri desktop keeps drafts per conversation.
- How a failed web send returns text to the composer (code path not opened).
- Whether CLI or Chrome tests cover the queue (CLI has Rust unit tests; Chrome tests not located).
- Retention of web_conversations.draft after sign-out or account deletion (partly answered: saves are rejected once the session or draft owner is no longer current, use-conversation-draft-sync.ts:62-70).
- Whether the mobile sign-out path calls clearAccountScopedDrafts (draftStore.ts:200).
- Which code makes the 'chip on the send control' that the web comment mentions.

## Second reader's check

A second reader checked 10 statements of this page against the code: 5 correct, 5 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7 Account):** "Web draft sync needs a signed-in session (use-conversation-draft-sync.ts:98,128)." The code shows: The sign-in guard is real: `if (!isLoaded || !isSignedIn || !session?.isCurrent()) return;`. It sits at line 138, and isLoaded/isSignedIn come from useSession() at line 86. Lines 98 and 128 hold neither. (apps/web/features/chat/hooks/use-conversation-draft-sync.ts:86,138). **Corrected:** Web draft sync needs a loaded, signed-in, current session (use-conversation-draft-sync.ts:86,138).
- **Partly wrong (section 7 Local mode / 3 Present but disconnected / 8 test scenario):** "Web does not sync drafts when a local model is selected or the chat holds on-device turns; 'No draft PUT is sent'." The code shows: canDispatchDraft blocks a non-empty draft when a local model is selected or the chat holds local turns. An empty draft (`job.draft === ''`) is still dispatched, so a clear does reach the server. Temporary chats are also excluded. The cited lines 75-84 are correct for this function. (use-conversation-draft-sync.ts:73-84). **Corrected:** With a local model selected or on-device turns in the chat, non-empty drafts are never PUT. An empty draft (clearing) is still sent so a stale server draft is removed.
- **Partly wrong (section 7 Limits and metering):** "Debounce 1500 ms; 3 automatic attempts; retry delay 3000 ms doubling (constants at use-conversation-draft-sync.ts:30-31,204-206)." The code shows: The values are right. DRAFT_RETRY_DELAY_MS=3000 and MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS=3 are at lines 25-26. The delay is `3000 * 2 ** (attempt-1)` at line 241, which gives 3 s then 6 s. The debounce is MANAGED_CLOUD_DRAFT_SAVE_DEBOUNCE_MS (line 308), which comes from conversation-contract.json draftSaveDebounceMs: 1500. The page's 'value not opened' draft cap is draftMaxLength: 20000 in the same JSON, exported as MANAGED_CLOUD_MAX_DRAFT_LENGTH (conversations.ts:60) and enforced by zod .max() at conversations.ts:191. (use-conversation-draft-sync.ts:25-26,241,308; packages/contracts/cloud-contracts/src/conversation-contract.json:2-4; packages/contracts/cloud-contracts/src/conversations.ts:60,191). **Corrected:** Constants are at lines 25-26 and the retry delay at line 241. The draft cap is 20,000 characters (conversation-contract.json), so it is not unknown.
- **Partly wrong (section 8 Edit a queued message):** "Edit: pending admission is cancelled, text and attachments return to the composer, resend replaces the slot (ChatComposerNew.tsx:4466-4481,3951-3971)." The code shows: Lines 4466-4481 are the steer handler, not Edit. The edit state is editingQueuedIdRef (lines 914, 3522-3563) and the resend path (3952-3953) consumes it. The behaviour is plausible but the first citation does not locate it. (ChatComposerNew.tsx:914,3522-3563,3951-3953,4466-4476). **Corrected:** Cite 3522-3563 and 3951-3971 for edit. 4466-4481 is steering.
- **Partly wrong (section 7 Account / 6 Mobile):** "Mobile drafts on device under 'composer-draft:' keys; account-scoped drafts cleared on sign-out (draftStore.ts:205); local or cloud provenance (draftStore.ts:8)." The code shows: PREFIX = 'composer-draft:' is at line 5. Provenance type {scope:'local'} | {scope:'cloud', ownerId} is at line 9, not 8. clearAccountScopedDrafts begins at line 200 and iterates the prefixed keys. Whether it is called on sign-out was not shown by the cited lines. The page presents the clearing as established, but the call site is uncited. (apps/mobile/src/features/chat/draftStore.ts:5,9,200-210). **Corrected:** The function clearAccountScopedDrafts exists (draftStore.ts:200). The sign-out call site is not cited, so that part is unverified.

**Facts the page missed**

- An empty draft bypasses the local-model and on-device-turn block, so clearing a draft is still sent to the server (use-conversation-draft-sync.ts:80-83).
- The server draft cap is 20,000 characters (conversation-contract.json:2, zod .max at conversations.ts:191), so the page's 'Unknown' entry for it can be closed.
- Draft sync only runs for UUID conversation ids (isUuid check at use-conversation-draft-sync.ts:~158), and every save is rejected when the session or draft owner is no longer current (isCurrentDraft, lines 62-70). That is why the page's sign-out question has a partial answer.

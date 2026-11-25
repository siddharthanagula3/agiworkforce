---
id: "F071-02"
type: "feature"
title: "Writing a message in the composer"
aliases: ["Composer", "Chat input", "Message box", "Expanded editor", "Expand message", "Keyboard-aware layout", "Compact composer", "Draft", "Follow-up queue", "S71.02", "S71.03"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.02", "S71.03"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F071-04", "F071-05", "store:mmkv-composer-drafts", "file:apps/mobile/src/features/chat/components/ChatInput.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-02 Writing a message in the composer

The message box in AGI Mobile chat. It starts at one line and grows to about six lines, then scrolls. An expand control opens a full-screen editor. Send, queue a follow-up while a reply streams, keep drafts after leaving, and keep the box above the keyboard. Mobile only.

Area: [71. Mobile application](README.md). Requirement items: [S71.02](../../10-requirements/capabilities/071-mobile-application.md#s7102), [S71.03](../../10-requirements/capabilities/071-mobile-application.md#s7103).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person write, edit and send a message. Handles attachments staged in the box, queued follow-ups, draft saving, offline send rules and keyboard avoidance.

**Why it exists.** The brief requires a compact composer that grows, expands to a full-screen editor and sends (S71.02), and a keyboard-aware layout (S71.03). (doc: knowledge-base/data/area-briefs/071-mobile-application.md) The product requirements say the mobile composer must be multi-line, keyboard-safe and send on explicit action. (doc: docs/product/requirements.md)

**Who uses it.** Every person who chats in AGI Mobile, in Local mode or Cloud mode.

**Problems it solves**

- A long message is hard to edit in a small box.
- A reply in progress should not block the next thought.
- Leaving a screen should not lose a typed message.
- The keyboard must not hide the box.

**Use cases**

- Type a short question and send it.
- Paste a long email, tap expand, tidy it, send from the full-screen editor.
- Type a follow-up while an answer is streaming; it sends when the answer ends.
- Start a message in a chat, leave, come back and find the draft.

## 2. User experience

**Where to find it**

- Mobile: bottom of every chat. Input has accessibility label 'Message input' (apps/mobile/src/features/chat/components/ChatInput.tsx:2125-2130).
- Expand control: label 'Expand message', hint 'Opens the message in a full-screen editor', top-right corner of the box (ChatInput.tsx:2136-2158).
- Full-screen editor: input labelled 'Expanded message input' (apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:138).
- Voice control: when the box is empty a button 'Start voice mode' replaces send (ChatInput.tsx:2278-2300; see F071-05).

**Before you start**

- A chat open. In Cloud mode, a signed-in account; usage allowance for Cloud turns.
- For sending with files, see F071-04.

**Screens and controls**

- Text box with placeholder: 'What's on your mind?', 'Reply to AGI' while a thread is active or streaming, 'Work with AGI' in AGI Work mode, 'Type or hold to talk' when hold-to-talk is ready, an offline text when offline (ChatInput.tsx:1645-1662).
- Plus control opens the Add to chat sheet.
- Send button with states idle, streaming (acts as stop) and queued ('Sending when the upload finishes').
- Queued follow-up rows 'Queued message N of M' with edit and cancel (ChatInput.tsx:1851-1905).
- Expand and collapse controls for the full-screen editor.

**Journey**

1. Tap the box. The keyboard opens and the chat and box move up.
2. Type. After the text wraps past about one and a half lines the expand control appears.
3. Optional: tap expand, edit in the full-screen editor, tap send there or collapse.
4. Tap send. The box clears at once; the message appears in the thread.
5. If a reply is streaming, sending queues the text as a follow-up row; it is sent when the stream ends.
6. If the send is refused, the text comes back into the box and the attachments are marked as not sent.

**What the person sees and gets**

- Light haptic on send when haptics are on (ChatInput.tsx:925-927).
- Alert 'Pasted text not sent' or 'Pasted text not attached' on pasted-text failures (ChatInput.tsx:884-892, 1020-1024).
- Alerts for missing files: 'File no longer available' (ChatInput.tsx:866-872).
- Offline cloud alerts from the chat screen (see states).

**Settings**

- Haptics, auto-correct and spell check follow settings (ChatInput.tsx:2117-2118).
- Keyboard behaviour is not user-configurable.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Box grows up to six lines (MAX_INPUT_LINES = 6, apps/mobile/lib/constants.ts:25; numberOfLines at ChatInput.tsx:2123) and is capped at 160 points high, then scrolls (ChatInput.tsx:2107).
- Expand control shows only when the text is wrapped (more than 1.5 lines) and not while dictating or while the effort panel is open (ChatInput.tsx:150, 1533, 2136).
- The full-screen editor owns no text; edits go up to the composer; it has send and collapse; keyboard avoidance with a Modal-safe mode (apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:66-68; test:apps/mobile/__tests__/ComposerFullscreenEditor.test.tsx).
- While streaming, send queues a follow-up; when the stream ends the first queued item is sent, and it returns to the box if refused (ChatInput.tsx:945-958, 1170-1195).
- If the send opened a different conversation, the text typed after sending is prefilled into the new chat (ChatInput.tsx:1041-1068).
- Drafts are stored on the device under keys 'composer-draft:' with the owner scope (local or cloud account) and attachment records (apps/mobile/src/features/chat/draftStore.ts:4, 148-186).
- Keyboard: iOS pads; Android screens pad, modals shrink height; offset 0 (apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts:17-20, 40-50; apps/mobile/app/(app)/chat/[id].tsx:2282-2288).
- Empty guard: nothing runs without trimmed text or an attachment (ChatInput.tsx:865).
- A send held while an attachment uploads, sent when the upload settles (ChatInput.tsx:874-877, 1105-1118).
- Send failure marks attachments sendFailed and restores the text (ChatInput.tsx:965-972, 1025-1040; flag cleared on the next attempt at ~1004-1006).

**Incomplete**

- Only the first queued follow-up is sent when a stream ends; later ones wait for the next stream end. (ChatInput.tsx:1172-1180) [inferred from the destructuring of the queue]

**Present but disconnected or switched off**

- Sending in AGI Work mode is blocked while usage recovery is owed (usageBlocked) (ChatInput.tsx:566, 863).

**Not available**

- Web, Desktop, CLI, VS Code, Chrome: not part of this feature.

## 4. Required behaviour

**Established requirements**

- The composer starts as a one-line pill that grows up to a cap and can expand to a full-screen editor, then sends. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.02)
- When the keyboard opens the chat screen and composer move above it rather than being covered. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.03)
- Text input is multi-line capable, keyboard-safe and sends on explicit action; the composer must not resize or overlap badly on small devices; dark and light appearance. (source: docs/product/requirements.md section 10.7 (doc: docs/product/requirements.md))
- Sending a file cannot cross Local to BYOK or Cloud without consent. (source: docs/product/requirements.md M-US-004 acceptance (doc: docs/product/requirements.md))

**Acceptance criteria**

1. Typing past one line grows the box; past six lines it stops growing and scrolls.
2. The expand control is absent for a one-line message and present for a wrapped message.
3. Send from the full-screen editor sends the same text and the box clears.
4. Sending while a reply streams shows a queued row, and the message sends after the reply ends.
5. Leaving the chat with text typed and returning shows the same text.
6. On iOS and Android the box stays fully visible with the keyboard open, in the main chat and in the full-screen editor.
7. Empty text with no attachment does nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local-mode chats treat the app as online so Local send never queues for the network. [inferred from isOnline={conversationExecutionMode === 'local' || isOnline} at apps/mobile/app/(app)/chat/[id].tsx:2751]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send all queued follow-ups in order, or show that only one goes at a time.
- [proposed] Name the draft retention period.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | The composer: text, send, queue, drafts, attachments, voice entry. |
| component | ComposerFullScreenEditor | `apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx` | Modal editor with send and collapse. |
| component | SendButton | `apps/mobile/src/features/chat/components/SendButton.tsx` | Send, stop and queued states. |
| store | draftStore | `apps/mobile/src/features/chat/draftStore.ts` | Saves drafts with owner scope and attachments on the device. |
| hook | useKeyboardSafeComposer | `apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts` | Keyboard behaviour per platform and surface kind. |
| screen | Chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Hosts the composer, KeyboardAvoidingView, send handler and offline rules. |
| service | offlineQueue | `apps/mobile/services/offlineQueue.ts` | Queues Cloud text messages while offline (imported by the chat screen). |
| other | composerHandoff | `apps/mobile/src/features/chat/composerHandoff.ts` | Stages text and attachments for a composer from another screen. |
| config | MAX_INPUT_LINES | `apps/mobile/lib/constants.ts` | Line cap constant (6). |
| test | Composer tests | `apps/mobile/__tests__/ChatInput.test.tsx` | Component tests for the composer. |
| test | Draft store tests | `apps/mobile/__tests__/draft-store.test.ts` | Draft round trip, isolation and clearing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Typing updates local state and the draft store. | device | apps/mobile/src/features/chat/components/ChatInput.tsx:760-780; draftStore.ts:148-186 |
| Send checks text, missing files and uploads in flight, then calls onSend or queues if streaming. | device | ChatInput.tsx:861-960 |
| The chat screen decides: offline Cloud text is queued; otherwise sendMessage runs the turn for the chat's mode. | device | apps/mobile/app/(app)/chat/[id].tsx:859-920 |
| In Cloud mode the turn goes to AGI Cloud servers; in Local mode the on-device model answers (not traced here). | device and our servers | SYS-chat-turn-pipeline; chat screen passes executionMode (chat/[id].tsx:859) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Composer draft text and attachment records | MMKV on the device, keys 'composer-draft:<key>' | no sync found | cleared after an accepted send or when empty (draftStore.ts:170-196; ChatInput.tsx:1020) |
| Queued follow-ups | component memory only | no | lost if the app is killed; text is written back to the draft on unmount (ChatInput.tsx:748-780) [inferred] |
| Offline queue entries | offline queue service on the device | sent on reconnect | queue-full and account-change refusals shown (chat/[id].tsx:889-909) |

**Models and providers.** The composer shows the selected model and passes it to send. It does not choose providers. Pasted-text limits use cloud limits for managed Cloud turns (ChatInput.tsx:884-895).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local: no account. Cloud: signed-in account; queueing offline needs a signed-in session (chat/[id].tsx:874-880). |
| Permissions | None for typing. Keyboard and haptics follow the OS. |
| Subscription | A Cloud turn can be refused by usage or plan limits; the chat screen shows a paywall sheet (chat/[id].tsx:2851-2860). The composer itself has no plan rule except usageBlocked for AGI Work. |
| Limits and metering | Cloud message length limit (cloudLatestMessageMaxChars) and a managed Cloud limit for free-quota turns are applied to pasted text (ChatInput.tsx:884-895). Offline queue has a capacity ('queue-full') (chat/[id].tsx:891-896). |
| Feature flags | none found in the code for the composer controls |
| Model compatibility | Effort control shows only in Cloud text mode when the model has more than one effort step (ChatInput.tsx:1536-1540). |
| Provider restrictions | none found in the code |
| Local mode | Works with no account. Treated as online, so no offline gate (chat/[id].tsx:2751). Drafts are scoped as local (chat/[id].tsx:1505-1511). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Offline in Cloud, text only, signed in | Message is queued, shown with a queued label, and sent on reconnect. | apps/mobile/app/(app)/chat/[id].tsx:859-915 |
| Offline in Cloud with attachments | Alert 'Connect to send attachments'; draft stays; send returns false. | apps/mobile/app/(app)/chat/[id].tsx:859-866 |
| Offline Cloud, temporary chat or signed out | Alerts 'Connect to send in a temporary chat' and 'Sign in to queue this message'. | chat/[id].tsx:867-880 |
| Offline queue full | Alert 'Offline queue is full'; message stays in the composer. | chat/[id].tsx:889-896 |
| Reply streaming | Send queues a follow-up; the button acts as stop when the box is empty. | ChatInput.tsx:945-958, 1583-1597 |
| Upload in flight | Send is held ('Sending when the upload finishes') and fires after. | ChatInput.tsx:874-877; 2316-2318 |
| Send refused | Text restored, attachments marked not sent, hand-over to a new chat withdrawn. | ChatInput.tsx:1025-1040 |
| Account changed during send | Alert 'Account changed'; message not queued. | chat/[id].tsx:899-908 |
| Screen reader | Input labelled 'Message input' with hint; expand button has label and hint. | ChatInput.tsx:2125-2130, 2155-2158 |
| Keyboard and orientation | Padding behaviour on iOS and Android screens; height behaviour in Android modals. | keyboardSafeComposer.ts:17-20; test:apps/mobile/__tests__/KeyboardGate.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ChatInput.test.tsx`: Composer component behaviour (titles not read in detail).
- `apps/mobile/__tests__/ComposerFullscreenEditor.test.tsx`: Renders nothing while closed, shows the whole text, owns no text state, collapse without send, send without collapse.
- `apps/mobile/__tests__/draft-store.test.ts`: Draft round trip, per-key isolation, empty text clears, clearDraft removes a draft.
- `apps/mobile/__tests__/KeyboardGate.test.tsx`: Padding on iOS, Android screen padding, shared contract, zero offset, iOS will-show/will-hide events.
- `apps/mobile/__tests__/ChatKeyboardReveal.test.tsx`: Scrolling a focused field above the keyboard once, with frame waits and cancellation.
- `apps/mobile/__tests__/offline-cloud-attachments.source.test.ts`: Offline Cloud attachment refusal and text-only queue admission, by source inspection.
- `apps/mobile/__tests__/CloudCodeRefusedDraft.test.tsx`: Refused draft handling in a related composer (not read in detail).

**Test scenarios**

- **Grow and expand**
  1. Type a single word.
  2. Paste six lines of text.
  3. Tap 'Expand message', edit, tap send.
  - Expected: Box is one line, then grows with the expand control, then the full-screen editor sends and closes.
- **Follow-up while streaming**
  1. Send a long request.
  2. While it streams type another message and send.
  - Expected: A 'Queued message 1 of 1' row appears and the text sends after the reply ends.
- **Draft survives**
  1. Type text without sending.
  2. Open another chat or settings.
  3. Come back.
  - Expected: The same text is in the box; after a send it is gone.
- **Keyboard cover**
  1. Open a chat on iOS and on Android.
  2. Tap the box with the keyboard.
  - Expected: Last message and box are above the keyboard in both.
- **Offline Cloud**
  1. Go offline in a Cloud chat.
  2. Send text, then try with a photo.
  - Expected: Text is queued and sent on reconnect; the photo send shows 'Connect to send attachments' and keeps the draft.

**Where to look when it fails**

- Warnings with prefix '[ChatScreen]' in the console.
- Draft keys in MMKV start with 'composer-draft:'.
- Alert titles listed under states point to the refusing branch.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **Only one queued follow-up is released per finished reply.** Affects: Mobile users who queue several messages.. Evidence: apps/mobile/src/features/chat/components/ChatInput.tsx:1172-1180. Work needed: Confirm intent; either release all in order or tell the person.
- **Queued follow-ups are held in memory; behaviour after the app is killed is not shown.** Affects: Mobile users when the OS ends the app during a reply.. Evidence: ChatInput.tsx:383-395, 748-780. Work needed: Verify on device; persist if lost.
- **The draft's cited line for the empty-send rule (1525) was wrong; the rule is at line 865.** Affects: Documentation only.. Evidence: ChatInput.tsx:865. Work needed: None.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F071-04
- F071-05
- store:mmkv-composer-drafts
- file:apps/mobile/src/features/chat/components/ChatInput.tsx

## Unknown

- Whether queued follow-ups survive the app being killed.
- What ChatInput.test.tsx asserts in detail.
- How long drafts are kept and whether they sync to other devices (no sync code found in draftStore.ts).
- Where the local on-device model answers the send; owned by SYS-local-inference.

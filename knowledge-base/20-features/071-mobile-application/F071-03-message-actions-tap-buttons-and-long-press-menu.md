---
id: "F071-03"
type: "feature"
title: "Message actions (tap buttons and long-press menu)"
aliases: ["Message actions", "Long-press menu", "Message menu", "More message actions", "Answer controls", "Export Message", "Touch message actions", "S71.04", "S71.05"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.04", "S71.05"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "api:POST /api/feedback", "api:DELETE /api/feedback", "api:POST /api/voice/speech", "SYS-chat-turn-pipeline", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-03 Message actions (tap buttons and long-press menu)

Actions on one message in AGI Mobile chat. Under a reply: Copy, Read aloud, Regenerate response, and a three-dot button. Long-press a message for the full menu: edit, resend, retry, branch, schedule, copy, select text, export, save as document, rate, report, delete. Double-tap a reply for a thumbs up.

Area: [71. Mobile application](README.md). Requirement items: [S71.04](../../10-requirements/capabilities/071-mobile-application.md#s7104), [S71.05](../../10-requirements/capabilities/071-mobile-application.md#s7105).

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

**What it does.** Lets a person copy, hear, redo, rate, export, edit, branch, report or delete a single message.

**Why it exists.** The brief requires tap targets under assistant messages (copy, read aloud, share, regenerate, rate) (S71.04) and a long-press menu with edit, retry, copy, export, delete that run (S71.05). (doc: knowledge-base/data/area-briefs/071-mobile-application.md)

**Who uses it.** Anyone reading or steering a conversation on a phone, in Local or Cloud mode.

**Problems it solves**

- Reuse an answer outside the app.
- Fix a typo in a past message and re-run the turn.
- Try a different answer or model.
- Tell the product an answer was good or bad.

**Use cases**

- Tap Copy under an answer and paste it into a note.
- Tap Read aloud while walking.
- Long-press an answer and choose Retry with Another Model.
- Long-press my own message, choose Edit Message, change it and send.

## 2. User experience

**Where to find it**

- Mobile: under each finished reply, a row labelled 'Message actions' (apps/mobile/src/features/chat/components/MessageBubble.tsx:3146).
- Long-press any message to open the action sheet (MessageBubble.tsx:1759-1766; onLongPress at 2212).
- Export sheet from the menu entry 'Export Message…' (MessageBubble.tsx:1696; apps/mobile/src/features/chat/components/FileExportButton.tsx).

**Before you start**

- A message in a chat. Some actions need the chat to be idle ('Available when the current response finishes.', MessageBubble.tsx:259).
- Rating and Branch need the chat screen to wire the handlers (MessageList.tsx:380-397).

**Screens and controls**

- Tap row under a reply: Copy, Read aloud (turns into 'Stop reading aloud'), 'Regenerate response', and 'More message actions for <role>' (MessageBubble.tsx:3146-3196).
- User message menu: Edit Message, Resend, Branch Conversation from Here, 'Schedule as Task…', Copy Message, Select Text, Delete Message (MessageBubble.tsx:1640-1722).
- Reply menu: Retry, Retry with Another Model, Branch Conversation from Here, Copy Message, Select Text, 'Export Message…', the save-as-document entry, Good Response, Bad Response, 'Report…', Delete Message (same range).
- Export sheet: 'Export as PDF', 'Export as Text', 'Copy to Clipboard', 'Share Text', 'Share...' (FileExportButton.tsx:30-70).
- Rating detail sheet on a thumbs down; report sheet 'Report this response' (MessageBubble.tsx:3268-3280).

**Journey**

1. Read a reply. Tap Copy: the icon changes to a check, or to a warning icon if copying failed.
2. Tap Read aloud: speech starts and the control shows a stop square; tap again to stop.
3. Long-press the message or tap the three dots to open the menu.
4. Pick an action. On iOS the sheet closes first and the action runs after (MessageBubble.tsx:1768-1775).
5. For Delete, an alert 'Delete message?' says it cannot be recovered; confirm to remove.
6. For Export, choose a format; the system share sheet or clipboard completes the task and 'Done!' shows.

**What the person sees and gets**

- Copy state icon: check on success, warning on failure (MessageBubble.tsx:3154-3166).
- Toast for read-aloud problems (MessageBubble.tsx:2012-2029).
- 'Export Failed' alert on failure (FileExportButton.tsx:131-136).
- Alert 'Could not save rating' when the rating call fails (apps/mobile/app/(app)/chat/[id].tsx:1851-1862).

**Settings**

- Haptics setting gives a light tap on rating (MessageBubble.tsx:1482-1487).
- Speech voice and language settings shape read aloud (voiceOutput.speechOptionsFromSettings, MessageBubble.tsx:2018).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Tap row on finished replies with content: Copy, Read aloud, Regenerate, More (MessageBubble.tsx:3146-3196).
- Long-press action list is built per role and state (MessageBubble.tsx:1640-1722).
- User messages also get 'Branch Conversation from Here' when a branch handler exists (MessageBubble.tsx:1668-1675).
- Retry, Resend and Edit ask before discarding unsaved edits to the following answer (MessageBubble.tsx:295-309, 1212-1218, 1550-1553).
- Delete shows 'Delete message?' with 'It cannot be recovered.' (MessageBubble.tsx:1609-1623). Cloud delete is optimistic and rolls back with an alert on failure; Local delete is immediate (chat/[id].tsx:1822-1850).
- While streaming, redo actions are hidden or carry 'Available when the current response finishes.' (MessageBubble.tsx:259, 1629-1630).
- Rating: double-tap gives or removes thumbs up only when not streaming and a handler exists (MessageBubble.tsx:1625, 1632-1637). Thumbs down opens a rating-detail sheet when wired (MessageBubble.tsx:1482-1495).
- Rating in Cloud posts to /api/feedback and patches the message; in Local it is kept on the device only (apps/mobile/stores/chat/chatMessageStore.ts:160-215; apps/mobile/src/features/chat/services/cloudMessageMutations.ts:30-85).
- Read aloud: stops cleanly on scope change; Android checks for an installed voice in Local; Cloud uses a server voice (apps/mobile/src/features/voice/services/readAloudAvailability.ts:6-60; MessageBubble.tsx:2018-2021).
- Export sheet actions and share (apps/mobile/src/features/chat/components/FileExportButton.tsx:30-140).

**Incomplete**

- The brief lists share and rate as tap targets under a reply. The row has no share and no rate button; share is in the export sheet and rate is in the menu or double-tap. (MessageBubble.tsx:3146-3196 vs S71.04)

**Present but disconnected or switched off**

- Branch, Schedule as Task, Retry with Another Model, Edit and rating appear only when the parent passes the handler (MessageBubble.tsx:1640-1722; MessageList.tsx:380-397).

**Not available**

- Web, Desktop, CLI, VS Code, Chrome: not part of this feature.

## 4. Required behaviour

**Established requirements**

- Assistant messages show tap targets (copy, read aloud, share, regenerate, rate) that act on the message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.04)
- Long-pressing a message opens a menu of actions (edit, retry, copy, export, delete) that run. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.05)
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9 (doc: AGENTS.md))

**Acceptance criteria**

1. Every finished reply shows Copy, Read aloud, Regenerate response and the three-dot button.
2. Copy puts the visible answer text on the clipboard and shows the success icon; a forced failure shows the warning icon.
3. Read aloud starts speech and the same control stops it.
4. Long-press opens the menu and each entry in it runs or is dimmed with a reason while streaming.
5. Delete asks 'Delete message?' and removes the message only after Delete is confirmed.
6. Double-tap on a finished reply sets a thumbs up; a second double-tap removes it.
7. Export sheet copy and share work and an induced failure shows 'Export Failed'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Message deletion cannot be undone by design because the alert says so; AGENTS.md allows permanent removal from an explicit action that names what is lost. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a visible rate control or update S71.04 to say rate lives in the menu and double-tap.
- [proposed] Add a Share button under replies if S71.04 stays as written.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Renders a message, the tap row and the long-press action sheet. |
| component | MessageList | `apps/mobile/src/features/chat/components/MessageList.tsx` | Passes action handlers (retry, branch, delete, reaction) to each bubble. |
| component | FileExportButton (export sheet) | `apps/mobile/src/features/chat/components/FileExportButton.tsx` | PDF, text, copy and share of an answer. |
| screen | Chat screen handlers | `apps/mobile/app/(app)/chat/[id].tsx` | handleReaction, handleDeleteMessage, handleRetryMessage, branch and edit handlers. |
| store | chatMessageStore | `apps/mobile/stores/chat/chatMessageStore.ts` | setMessageReaction and local or Cloud rating writes. |
| service | cloudMessageMutations | `apps/mobile/src/features/chat/services/cloudMessageMutations.ts` | Cloud message delete, reaction patch and rating post. |
| endpoint | POST and DELETE /api/feedback | `apps/web/app/api/feedback/route.ts` | Receives response ratings from the mobile app. |
| service | voiceOutput and readAloudAvailability | `apps/mobile/src/features/voice/services/readAloudAvailability.ts` | Read-aloud owner check and unavailable reasons. |
| hook | useCopyAction | `apps/mobile/src/shared/hooks/useCopyAction.ts` | Clipboard copy with copied or failed state. |
| other | markdownPlainText | `apps/mobile/src/features/chat/utils/markdownPlainText.ts` | Turns an answer into plain text for copy and share. |
| component | ReportSheet | apps/mobile/src/features/chat/components/ReportSheet.tsx (not found) (not found) | Report this response. |
| test | Answer controls tests | `apps/mobile/__tests__/MessageBubbleAnswerControls.test.tsx` | Copy, select text, double-tap rating. |
| test | Read-aloud reason tests | `apps/mobile/__tests__/MessageBubbleReadAloudReason.test.tsx` | Read aloud availability reasons. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A tap or long-press builds the action list from the message role, streaming state and passed handlers. | device | MessageBubble.tsx:1640-1760 |
| Copy and select text use the clipboard on the device. | device | MessageBubble.tsx:1555-1557 |
| Read aloud in Local uses the device speech engine; in Cloud it asks the server for a voice. | device and our servers | MessageBubble.tsx:2018-2021; apps/mobile/src/features/voice/services/serverSpeech.ts:10 (path /api/voice/speech); apps/mobile/src/features/voice/services/voiceOutput.ts:102-131 |
| Rating in Cloud posts the rating and patches the message on our servers; Local keeps it in the device store. | device and our servers | apps/mobile/stores/chat/chatMessageStore.ts:160-215; cloudMessageMutations.ts:45-85 |
| Delete in Cloud removes the message on the server with rollback on failure; Local removes it on the device. | device and our servers | apps/mobile/app/(app)/chat/[id].tsx:1822-1850 |
| Export builds a PDF or text file on the device, then hands it to the OS share sheet. | device | FileExportButton.tsx:108-130 |
| Retry, Resend, Edit and Retry with Another Model start a new turn through the chat turn pipeline. | device and our servers | MessageBubble.tsx:1212-1218; SYS-chat-turn-pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Message reaction (thumbs up or down) | message metadata in the local store (Local) or the Cloud store plus server (Cloud) | Cloud yes (feedback and message patch); Local no | cleared by a second tap; Cloud removal uses DELETE on /api/feedback (response-rating.ts:119-121) |
| Rating details and report text | our servers (Cloud feedback) | n/a | not traced |
| Exported file | device cache until shared | no | not traced |

**Models and providers.** Retry with Another Model lets the person pick a different model through the chat screen's handler. Models come from the shared model catalog (SYS-model-catalog-and-routing). Rating payload carries surface 'mobile' and platform, no model call (cloudMessageMutations.ts:58-75).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local: none. Cloud: signed in; rating without an account shows 'Sign in to rate this Cloud message.' (chatMessageStore.ts:166-168). |
| Permissions | Clipboard and share sheet through the OS. No special permission. |
| Subscription | none found in the code for these actions. Retry in Cloud is a new turn and counts against usage like any turn (SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | none found in the code for the actions; Cloud feedback is behind a server route (rate limits not read). |
| Feature flags | none found in the code |
| Model compatibility | Save as document and Export need non-empty content; image or video answers use Report with an asset (MessageBubble.tsx:1625-1631, 3268-3280). |
| Provider restrictions | none found in the code |
| Local mode | Copy, read aloud (device voice), regenerate, branch, export, edit and delete work on the device. Rating stays on the device and is not sent. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Redo actions hidden or dimmed with 'Available when the current response finishes.'; Copy becomes 'Copy Partial Response'. | MessageBubble.tsx:259, 1629-1630, 1686-1690 |
| Unsaved answer edits | Alert 'Keep editing' or confirm before Retry, Resend or Edit. | MessageBubble.tsx:295-309 |
| Copy fails | Warning icon and failed label. | MessageBubble.tsx:3154-3166 |
| Read aloud not ready, account changed, no device voice | Control dimmed with a reason; toast on tap. | readAloudAvailability.ts:6-60; MessageBubble.tsx:2012-2016; test:apps/mobile/__tests__/MessageBubbleReadAloudReason.test.tsx |
| Rating fails | Reaction rolled back; alert 'Could not save rating'. | chat/[id].tsx:1851-1862; chatMessageStore.ts:175-215 |
| Delete fails in Cloud | Messages restored; alert 'Could not delete message'. | chat/[id].tsx:1832-1843 |
| Export fails | 'Export Failed' alert. | FileExportButton.tsx:131-136 |
| Screen reader | Three-dot button exposes the actions as accessibility actions. | MessageBubble.tsx:3188-3196, 1808-1830 |
| Offline | Cloud rating and delete need the network and show their failure alerts; copy and export work offline. Not separately handled. | chat/[id].tsx:1832-1843 [inferred] |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/MessageBubbleAnswerControls.test.tsx`: Copy as visible text, Copied confirmation, user message copied as typed, select text, double-tap rating with acknowledgement.
- `apps/mobile/__tests__/MessageBubbleReadAloudReason.test.tsx`: Read aloud plays when current, dimmed with reasons for account change, preparing, no voice; available in Cloud with a server voice.
- `apps/mobile/__tests__/FileExportButton.test.tsx`: Export sheet renders, closes on backdrop, PDF export, hand-off to the share sheet.
- `apps/mobile/__tests__/MessageBubbleAccessibility.test.tsx`: Accessibility of message actions (titles not read).
- `apps/mobile/__tests__/MessageBubbleEditVersions.test.tsx`: Edit and version behaviour (titles not read).
- `apps/mobile/__tests__/MessageBubbleReport.test.tsx`: Report flow (titles not read).
- `apps/mobile/__tests__/ResponseRatingDetails.test.tsx`: Rating detail sheet (titles not read).

**Test scenarios**

- **Copy and read aloud**
  1. Finish a reply.
  2. Tap Copy and paste elsewhere.
  3. Tap Read aloud, then tap again.
  - Expected: Text matches the answer; speech starts and stops.
- **Long-press menu on a reply**
  1. Long-press a finished reply.
  2. Choose Retry with Another Model.
  - Expected: A model choice appears and a new answer streams; during streaming the entries are dimmed.
- **Delete with confirmation**
  1. Long-press a message.
  2. Choose Delete Message.
  3. Cancel, then repeat and confirm.
  - Expected: Cancel keeps it; confirm removes it and the warning said it cannot be recovered.
- **Rate in Cloud**
  1. Sign in, use a Cloud chat.
  2. Double-tap a reply.
  3. Go offline and double-tap another.
  - Expected: First rating saved; the offline attempt rolls back with 'Could not save rating'.
- **Export**
  1. Menu, Export Message…, choose Copy to Clipboard, then Share….
  - Expected: Clipboard has the answer text; the share sheet opens with a PDF.

**Where to look when it fails**

- Alert titles above identify the failing branch.
- Cloud rating errors surface as ResponseRatingError text (apps/mobile/stores/chat/responseRatingError.ts).
- Server side: POST /api/feedback route logs (apps/web/app/api/feedback/route.ts).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **No Share or Rate button in the tap row, although S71.04 lists them.** Affects: Mobile users who look for them under a reply.. Evidence: MessageBubble.tsx:3146-3196; S71.04. Work needed: Add the buttons or change the brief text.
- **Message delete is permanent with no Recently deleted step.** Affects: Mobile users who delete a message by mistake.. Evidence: MessageBubble.tsx:1609-1623; AGENTS.md section 9 says chats are archived or moved to Recently deleted. Work needed: Decide whether single messages are covered by that rule; the alert names the loss, so this may be intended.
- **Whether delete uses the shared confirm component is not established.** Affects: Consistency only.. Evidence: MessageBubble.tsx:1609-1623 uses Alert.alert. Work needed: Check useConfirmAction in the shared UI package against this alert.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- api:POST /api/feedback
- api:DELETE /api/feedback
- api:POST /api/voice/speech
- SYS-chat-turn-pipeline
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing

## Unknown

- Rate limits and storage of POST /api/feedback were not read.
- The value of SAVE_ANSWER_AS_DOCUMENT_LABEL (constant not opened).
- How the server voice for Cloud read-aloud is billed or limited.
- What Branch Conversation does in detail (handleBranchFromMessage at chat/[id].tsx:1316 not read).
- Whether a thumbs-down in Local mode ever reaches a server; code shows Cloud-only writes.

---
id: "F016-03"
type: "feature"
title: "Timestamp and edited marker"
aliases: ["Timestamp and edited marker", "Sent at", "Edited message, version n of m", "Edited-message indicator (S16.06)", "Timestamp (S16.05)"]
area: "16 User-message components"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S16.05", "S16.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "table:web_messages", "table:web_conversations", "file:apps/web/features/chat/lib/message-variants-gate.ts", "F016-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-03 Timestamp and edited marker

Shows when a message was sent and that it was edited. On web the time is inside the 'More message actions' menu as 'Sent at HH:MM' with the full date on hover. The edited mark is the 'n/m' version pager on a user message that has several versions. Chrome shows the time inline. Mobile, CLI and VS Code show no time.

Area: [16. User-message components](README.md). Requirement items: [S16.05](../../10-requirements/capabilities/016-user-message-components.md#s1605), [S16.06](../../10-requirements/capabilities/016-user-message-components.md#s1606).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives each sent message a time, and marks a user message that has more than one version through the version pager read out as 'Edited message, version n of m'.

**Why it exists.** The brief asks that each user message exposes when it was sent, and that an edited message is visibly marked (S16.05, S16.06).

**Who uses it.** People who revisit old chats and people who edit questions and want to know which version they are reading.

**Problems it solves**

- Not knowing when something was asked.
- Not noticing that you are looking at an earlier version of an edited question.

**Use cases**

- Hover a message, open the menu and read the exact send time.
- After editing a question, see '2/3' beside it and page back to the first version.
- Chrome user glances at the time under each bubble.

## 2. User experience

**Where to find it**

- Web and public Electron desktop: hover or focus the message, open 'More message actions', read 'Sent at <time>' at the top of the menu (apps/web/features/chat/components/messages/MessageBubble.tsx:3957-3972).
- Web edited mark: version pager left of the action row on a user message with more than one version (MessageBubble.tsx:3706 region, VariantPager.tsx:44-100).
- Mobile: version pager under the user bubble with label 'Edited message, version n of m' (apps/mobile/src/features/chat/components/MessageBubble.tsx:548-590, 3198-3202). No time shown.
- Chrome: a time label in each bubble's action row (apps/extension/src/features/side-panel/bubbles.ts:614; apps/extension/src/features/side-panel/dom.ts:15-17). No edit marker because Chrome cannot edit.
- CLI and VS Code: no time and no edited marker found.

**Before you start**

- A sent message. For the edited mark: the message has at least one more version (web needs message variants on; see settings).

**Screens and controls**

- Web: menu label 'Sent at' with a <time> element; the title attribute holds the full local date and time (MessageBubble.tsx:3960-3971).
- Pager buttons labelled 'Previous version' and 'Next version'; text '2/3'; a polite live region reads 'Edited message, version 2 of 3' (VariantPager.tsx:19-23, 69-100).

**Journey**

1. Send a message.
2. Hover or focus it; open 'More message actions'; read 'Sent at HH:MM'; hover the time for the full date.
3. Edit the message and save (see F016-05).
4. The edited message now shows '2/2'; the screen reader announces 'Edited message, version 2 of 2'.

**What the person sees and gets**

- Time text in the person's locale, hour and minute only.
- Pager position text and a live region announcement.

**Settings**

- Message variants switch: NEXT_PUBLIC_MESSAGE_VARIANTS (build), a 'variants' query parameter, or local storage key agi.message-variants; default on (apps/web/features/chat/lib/message-variants-gate.ts:1-60).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: timestamp in the menu of both user and assistant messages, hidden while the message streams (MessageBubble.tsx:3957-3972; test apps/web/features/chat/components/messages/MessageBubble.timestamp.test.tsx:144-149).
- Web: pager shown only when a message has siblings and the surface can page; disabled while the conversation streams (VariantPager.tsx:44-60; MessageBubble.tsx:992-1002).
- Mobile: pager for user messages with the 'Edited message, version n of m' label (apps/mobile/src/features/chat/components/MessageBubble.tsx:3198-3202).
- Chrome: time shown for every message in the action row (bubbles.ts:614).

**Incomplete**

- Web has no separate 'edited' badge; a single-version message shows no mark even if it was edited under the variants-off setting, where the old text is replaced (MessageBubble.tsx:992-1002; WebChatPage.tsx:5634-5656) [inferred].
- Web time is behind a menu, not inline; hour and minute only, no date unless hovered.
- Brief lists the pager UI as unfinished on web and desktop (S16.11 'Unfinished: ui'); the code has a working pager with tests, so which part is unfinished is unknown.

**Present but disconnected or switched off**

- Pager is hidden when variants are switched off, because no sibling versions are kept then (message-variants-gate.ts:50-60; WebChatPage.tsx:2048-2077).

**Not available**

- Timestamp on mobile, CLI, VS Code (brief: missing; I found none in apps/mobile/src/features/chat/components/MessageBubble.tsx where createdAt is used only for the activity start time at line 2524, and none in the CLI or VS Code user message code).
- Edited marker on CLI, VS Code and Chrome: those apps cannot edit a message.

## 4. Required behaviour

**Established requirements**

- Each user message exposes when it was sent (inline or on demand). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.05)
- A user message that was edited after sending is visibly marked as edited. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.06)
- When a user message has several revisions the user can page between them (n of m). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.11)

**Acceptance criteria**

1. Web: opening 'More message actions' on a user message shows 'Sent at' and a time in the local format.
2. Web: hovering the time shows the full local date and time.
3. Web: while the message streams there is no timestamp.
4. Web: a user message with two versions shows '1/2' or '2/2' and buttons named 'Previous version' and 'Next version'; the ends are disabled.
5. Web: the pager buttons are disabled while the conversation streams.
6. Mobile: a user message with versions announces 'Edited message, version n of m'.
7. Chrome: each message shows its send time.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An edited message with one version should still show some mark; the code does not [inferred from the brief's 'visibly marked as edited'].
- Time should include the date for old messages [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a small 'Edited' text on web and mobile next to the pager.
- [proposed] Show the time inline on mobile on tap or long-press menu, and in the VS Code and CLI transcripts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Renders the Sent at time in the More menu and mounts the pager. |
| component | VariantPager | `apps/web/features/chat/components/messages/VariantPager.tsx` | Pager with labels 'Edited message, version n of m' and live region. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Passes variantInfo and onSelectVariant per message. |
| service | message-variants-gate | `apps/web/features/chat/lib/message-variants-gate.ts` | Decides whether variants are on (env, query, storage). |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Computes the active path and variant info from stored rows (lines 2048-2077, 1593 per brief). |
| schema | 0156 message thread variants migration | `apps/web/db/neon/0156_message_thread_variants.sql` | Adds parent_id on messages and active_leaf_message_id on conversations. |
| component | VariantPager (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Mobile pager; noun 'version' for user messages. |
| component | MessageList (mobile) | `apps/mobile/src/features/chat/components/MessageList.tsx` | Passes variantInfoByMessageId to rows. |
| component | Side-panel bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | sp-timestamp span in the action row. |
| service | formatTime | `apps/extension/src/features/side-panel/dom.ts` | Formats the Chrome timestamp. |
| test | VariantPager test | `apps/web/features/chat/components/messages/VariantPager.test.tsx` | Pager behaviour. |
| test | Timestamp test | `apps/web/features/chat/components/messages/MessageBubble.timestamp.test.tsx` | Answered-by label and no timestamp while streaming. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The message carries a timestamp (Date) set when it is created in the client store. | device | apps/web/lib/hooks/useChatStream.ts:4298-4309 (createdAt set at send) |
| The bubble formats it with the browser locale into hour and minute and a full-date tooltip. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:3960-3971 |
| Edited versions are sibling rows sharing a parent; the page works out each message's index and total and passes them to the pager. | device | apps/web/features/chat/lib/message-variants-gate.ts:1-60; WebChatPage.tsx:2048-2077; apps/web/db/neon/0156_message_thread_variants.sql:5-15 |
| Choosing a sibling moves the active leaf, and the thread follows the chosen version. | device and our servers | apps/web/features/chat/components/messages/ChatMessageList.variants.test.tsx:91 (carries the selection up); server persistence of the leaf: unknown beyond migration comment |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Message creation time; parent_id per message; active leaf per conversation | Client chat store; server tables web_messages (parent_id) and web_conversations (active_leaf_message_id) per migration 0156 | Yes for cloud conversations | Deleted with the message or conversation; whether 0156 is applied in production: unknown (file header says draft) |

**Models and providers.** Not involved in showing time or pager.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for display. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | Message variants: build variable NEXT_PUBLIC_MESSAGE_VARIANTS (off is a kill switch), 'variants' query parameter, local storage agi.message-variants; default on (message-variants-gate.ts:1-60). |
| Model compatibility | Any model. |
| Provider restrictions | none found in the code |
| Local mode | Time and pager are device display. Whether Local-mode conversations keep sibling versions the same way as cloud ones: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | No timestamp and no More menu while the message streams; pager disabled while conversation streams. | MessageBubble.timestamp.test.tsx:144-149; VariantPager.tsx:108 |
| Single version | Pager returns null. | VariantPager.tsx:44-46 (total <= 1) |
| At first or last version | Previous/next button disabled. | VariantPager.tsx:51-53 |
| Screen reader | Visible '2/3' is hidden from assistive tech; a polite live region speaks the sentence. | VariantPager.tsx:69-100 |
| Variants off | No versions kept, so no pager. | message-variants-gate.ts:50-60 |
| Offline or timeout | not handled in the code for display | No offline branch in VariantPager.tsx or the timestamp block at MessageBubble.tsx:3957-3972 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/VariantPager.test.tsx`: Hidden with one version; position text; sentence announcement; both directions; disabled while streaming; user messages page like answers (line 157).
- `apps/web/features/chat/components/messages/ChatMessageList.variants.test.tsx`: Each message gets its own pager state; selection reaches the page; streaming disables paging.
- `apps/web/features/chat/components/messages/MessageBubble.timestamp.test.tsx`: Answered-by label and no timestamp while streaming; it does not test the user time text itself.
- `apps/web/features/chat/lib/message-variants-gate.test.ts`: Variants on/off resolution.

**Test scenarios**

- **Read send time**
  1. Open a web chat.
  2. Hover a user message.
  3. Open 'More message actions'.
  4. Hover the time.
  - Expected: 'Sent at HH:MM' then the full date in the tooltip.
- **Edited mark**
  1. Edit a message and save.
  2. Look at the message.
  - Expected: '2/2' with 'Previous version' enabled; screen reader says 'Edited message, version 2 of 2'.
- **Pager during streaming**
  1. Send a message and, while the reply streams, look at the pager.
  - Expected: Both buttons disabled.
- **Variants off**
  1. Open the chat with ?variants=off, edit a message.
  - Expected: No pager; old reply replaced after a confirm.
- **Chrome time**
  1. Send a message in the Chrome side panel.
  - Expected: A time appears in the message action row.
- **Mobile pager**
  1. On mobile edit a message in a conversation that keeps versions.
  - Expected: Pager under the bubble reads 'Edited message, version 2 of 2'.

**Where to look when it fails**

- Check the variants query/local storage override first.
- Check parent_id and active_leaf_message_id on the rows for the conversation.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- Mobile: [70-qa/test-plans/mobile/016-user-message-components.md](../../70-qa/test-plans/mobile/016-user-message-components.md)
- Chrome: [70-qa/test-plans/chrome/016-user-message-components.md](../../70-qa/test-plans/chrome/016-user-message-components.md)

## 10. Gaps and dependencies

- **No timestamp on mobile, CLI, VS Code** Affects: Those apps. Evidence: Brief S16.05 lists them missing; no time rendering found in apps/mobile/src/features/chat/components/MessageBubble.tsx. Work needed: Add a time on demand (long-press menu, hover or details row).
- **No explicit 'edited' mark apart from the pager** Affects: Web, desktop, mobile. Evidence: MessageBubble.tsx:992-1002. Work needed: Decide whether the pager satisfies S16.06 or add a word mark.
- **Brief says the edited marker is missing on mobile but mobile has one** Affects: Brief accuracy. Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:563-567, 3198-3202. Work needed: Update the brief.
- **Brief marks Chrome edited marker missing; Chrome has no edit so it is not applicable** Affects: Brief accuracy. Evidence: No edit action in apps/extension/src/features/side-panel/bubbles.ts. Work needed: Mark as n/a.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- table:web_messages
- table:web_conversations
- file:apps/web/features/chat/lib/message-variants-gate.ts
- F016-05

## Unknown

- Whether migration 0156 is applied in production (the file's own header says draft only).
- What exactly is 'unfinished' about the pager UI on web and desktop (the brief says ui).
- Whether mobile or Chrome expose time anywhere I did not read (for example a details sheet).
- Whether the Tauri shared bubble has any time display (none found in packages/ui/unified-chat/src/components/MessageBubble.tsx).

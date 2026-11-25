---
id: "F011-04"
type: "feature"
title: "Screen-reader announcements for finished work and streaming replies"
aliases: ["Screen-reader announcements for completed events (S11.07)", "Non-spammy streaming announcements (S11.08)", "StreamAnnouncer", "live region", "announceForAccessibility", "screen reader mode (CLI)"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.07", "S11.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "file:packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "F011-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-04 Screen-reader announcements for finished work and streaming replies

Tells a screen-reader user, without moving focus, that a reply, tool step, save or connection has finished, and reads a streaming reply in calm whole-word chunks at most every 2 seconds. Web and Desktop do this; Mobile announces only start and outcome; VS Code and Chrome use a plain polite log and are unverified.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.07](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1107), [S11.08](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1108).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Uses polite live regions (web, VS Code, Chrome) and native announcements (mobile) to speak status changes. On web it has two parts: one short phrase per generation state change, and a per-message announcer that reads streamed text in 2-second word-bounded chunks.

**Why it exists.** Without it, a blind user hears nothing when a reply ends, or hears every token and every repeated word. The comments in the code say a token is not a word and the answer should be read once.

**Who uses it.** Screen-reader users on every app; people who rely on audible feedback.

**Problems it solves**

- Silence when a reply finishes.
- Token-by-token speech.
- The same text read twice.
- Focus jumping to the reply.

**Use cases**

- Send a message on web and hear 'Generating response', then the reply in short pieces, then the final tail.
- Hear 'Response paused, waiting for your approval'.
- On the phone hear 'Responding' then the outcome when the reply ends.
- Hear a connector reconnect toast.

## 2. User experience

**Where to find it**

- Web and Desktop chat: invisible; sr-only status paragraph in the message list plus a StreamAnnouncer inside each assistant message (apps/web/features/chat/components/messages/ChatMessageList.tsx:2086-2091; MessageBubble.tsx:2914).
- Mobile chat list: system announcement through the screen reader (apps/mobile/src/features/chat/components/MessageList.tsx:246-258).
- VS Code sidebar: transcript role=log aria-live=polite; runtime status and follow-up status regions (webviewContent.ts:3122,3167,3360).
- Chrome side panel: sp-messages role=log aria-live=polite; thinking status (apps/extension/src/side_panel.ts:6340-6346).

**Before you start**

- A screen reader running.
- A chat turn in progress.

**Screens and controls**

- No visible control; it is an output channel.
- The Settings 'Motion' control does not change it.

**Journey**

1. Send a message.
2. Reader says 'Generating response' (web) or 'Responding' (mobile).
3. Web: about every 2 seconds the reader says the newest whole words of the reply.
4. When the stream ends the remaining text is read once.
5. The status phrase then says the outcome (for example completed, stopped, finished with errors).

**What the person sees and gets**

- Spoken phrases only.
- Phrases such as 'Response paused, waiting for your approval' (ChatMessageList.tsx:1756-1758); 'Agent activity completed' (AgentActivityTimeline.tsx:383).
- Mobile outcome text from turnOutcomeAnnouncement (MessageList.tsx:176).

**Settings**

- Chat text size, motion and similar Appearance settings do not alter announcements.
- Streaming interval is a parameter, default 2000 ms (StreamAnnouncer.tsx:3).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- useStreamAnnouncement: each 2 s tick announces only the new text up to the last whitespace, strips markdown, and announces the tail once when streaming ends; says nothing for a message already finished at mount (packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:3-77).
- StreamAnnouncer renders children plus a sr-only role=status aria-live=polite aria-atomic span (StreamAnnouncer.tsx:88-109); used in web MessageBubble (apps/web/features/chat/components/messages/MessageBubble.tsx:2914) and shared MessageBubble (packages/ui/unified-chat/src/components/MessageBubble.tsx:825) and StreamingMarkdownContent.tsx:3.
- Web message list: one status phrase per phase (settled, awaiting approval, generating) from a ref guard so it is spoken once; the log itself has aria-live off (ChatMessageList.tsx:1744-1759,2086-2116).
- Shared activity timeline announces activity states (AgentActivityTimeline.tsx:369-384,870-872).
- Mobile announces 'Responding' when an assistant message starts streaming and an outcome when it ends, via AccessibilityInfo.announceForAccessibility (MessageList.tsx:164,246-258); other mobile screens use accessibilityLiveRegion polite (OfflineBanner.tsx:31, CloudTasksScreen.tsx:324, ServiceNoticesBanner.tsx:91).
- Web connector outcomes: ConnectorOutcomeAnnouncer raises toasts for reauthorization and unavailable connectors (apps/web/features/connectors/components/ConnectorOutcomeAnnouncer.tsx:22-52, mounted at apps/web/app/AppRuntimeMounts.tsx:21).
- CLI screen reader mode: plain line REPL, 'you:' and 'agi:' labels, bell when input needed, enabled by flag, environment or config (apps/cli/src/lib.rs:442-448,5941-5950).

**Incomplete**

- Mobile reads no streamed text, only start and outcome; the brief marks S11.08 mobile as missing.
- VS Code and Chrome transcripts are live logs (aria-live polite); whether they chunk or repeat streamed text is unverified (brief S11.08).
- Announcement phrases are English literals.

**Present but disconnected or switched off**

- None found.

**Not available**

- Chunked streaming announcement on Mobile, VS Code and Chrome.
- CLI: no live region concept; the equivalent is the plain line mode.

## 4. Required behaviour

**Established requirements**

- When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus. (source: brief S11.07 Should)
- A streaming reply is announced calmly (word-bounded chunks or once when done), never token by token and never twice. (source: brief S11.08 Should)
- Streamed text is announced at most every 2 seconds, in whole-word pieces, and the final tail once when streaming ends. (source: task brief for F011-04; matches StreamAnnouncer.tsx:3)
- Status changes use a polite live region and never move focus. (source: task brief for F011-04)
- Mobile announces only the start and the outcome of a reply, not the streamed text. (source: task brief for F011-04)

**Acceptance criteria**

1. On web with a reader, a 30-second streamed reply is spoken in pieces no more often than every 2 seconds.
2. No spoken piece ends mid-word.
3. The last words are spoken once after streaming ends.
4. The reply is not read twice (not by the message log and again by the announcer).
5. Focus stays where it was throughout.
6. On the phone the reader says a start phrase and an outcome phrase and no streamed text.
7. A paused turn waiting for approval is announced as waiting for approval.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile having no chunking is by design per the task brief, but the brief marks it 'missing' [inferred conflict].
- VS Code and Chrome may double-announce, since the log is polite and receives appended nodes [inferred, unverified].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the StreamAnnouncer algorithm in VS Code and Chrome.
- [proposed] Translate announcement phrases.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useStreamAnnouncement | `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx` | Chunk timing, word boundary, tail (lines 35-77). |
| component | StreamAnnouncer | `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx` | sr-only polite status span (lines 88-109). |
| component | StreamingMarkdownContent | `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` | Imports StreamAnnouncer (line 3). |
| component | Shared MessageBubble | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Wraps body in StreamAnnouncer (lines 825-841). |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Wraps prose in StreamAnnouncer (line 2914); status regions (3310-3402). |
| component | Web ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Phase announcement and log role (lines 1744-1759,2086-2116). |
| service | buildStreamAnnouncement | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Builds the settled-turn phrase (used at line 1755; tests in stream-announcement.test.ts). |
| component | AgentActivityTimeline (shared) | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Activity announcement builder (369-384). |
| component | ConnectorOutcomeAnnouncer | `apps/web/features/connectors/components/ConnectorOutcomeAnnouncer.tsx` | Announces connector reconnect and unavailable states by toast. |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts the announcer and appearance sync. |
| component | Mobile MessageList | `apps/mobile/src/features/chat/components/MessageList.tsx` | RESPONDING_ANNOUNCEMENT and turnOutcomeAnnouncement (164-258). |
| component | Mobile OfflineBanner | `apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx` | role alert polite live region for offline. |
| component | Mobile CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Search result announcement (line 519). |
| component | VS Code webview log | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | role=log aria-live=polite transcript and status regions (3122,3167,3360). |
| component | Chrome side panel log | `apps/extension/src/side_panel.ts` | sp-messages log, showThinking status (6335-6350), announceSidePanelPresence (16105). |
| service | CLI plain output | `apps/cli/src/output.rs` | Plain mode, spinner replaced by announced-once text (lines 20-60,247). |
| config | CLI screen reader flags | `apps/cli/src/lib.rs` | --plain, --screen-reader, environment and config switches (442-448,5941-5950). |
| test | StreamAnnouncer.test | `packages/ui/unified-chat/src/components/markdown/__tests__/StreamAnnouncer.test.tsx` | Interval, word boundary, tail, markdown stripping. |
| test | stream-announcement.test | `apps/web/features/chat/components/messages/__tests__/stream-announcement.test.ts` | Outcome phrase cases. |
| test | MessageListTurnOutcome.test | `apps/mobile/__tests__/MessageListTurnOutcome.test.tsx` | Mobile outcome announcement. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The chat turn streams text into the message state. | our servers | Managed Cloud turns stream from the server; own-key and Local run elsewhere (see SYS-chat-turn-pipeline) [inferred]. |
| The announcer keeps the latest text in a ref and, every 2 s, takes the new text up to the last whitespace. | device | StreamAnnouncer.tsx:35-77 |
| The text is stripped of markdown and written into a polite sr-only region; the browser accessibility layer speaks it. | device | StreamAnnouncer.tsx:15-27,102-107 |
| When streaming stops, the unspoken tail is written once; the list-level phrase then gives the outcome. | device | StreamAnnouncer.tsx:65-76; ChatMessageList.tsx:1749-1759 |
| On Mobile the list calls announceForAccessibility with 'Responding' and later the outcome. | device | apps/mobile/src/features/chat/components/MessageList.tsx:246-258 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Announcement strings only. | component state, not persisted | no | replaced by the next phrase |

**Models and providers.** Model text is what is read aloud, but the announcer works on any text from any model or provider. Nothing in it chooses a provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found for the announcer; chat itself needs the app's sign-in rules. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code; the interval is a parameter (StreamAnnouncer.tsx:3,36). |
| Feature flags | None found in the code. |
| Model compatibility | Any model; works on whatever text streams in. |
| Provider restrictions | None found in the code. |
| Local mode | Works in Local mode on the device because it only reads the text in memory; mobile local inference was not traced here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Message already complete at mount | Nothing is announced. | StreamAnnouncer.tsx:62-64; StreamAnnouncer.test.tsx:113 |
| Stream ends with unspoken tail | Tail announced once. | StreamAnnouncer.tsx:65-76 |
| Only a partial word pending | Nothing is spoken until a space arrives. | StreamAnnouncer.tsx:6-13 |
| Turn paused for approval | Phrase 'Response paused, waiting for your approval'. | ChatMessageList.tsx:1756-1757 |
| Cancelled or failed turn | Outcome text says cancelled or failed (tested). | apps/web/features/chat/components/messages/__tests__/stream-announcement.test.ts:30,112 |
| Offline (mobile) | Banner with alert role and polite live region. | OfflineBanner.tsx:30-32 |
| Retry, reconnect, timeout | not handled in the code for streamed text; connectors raise a toast instead. | apps/web/features/connectors/components/ConnectorOutcomeAnnouncer.tsx:22-52 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/StreamAnnouncer.test.tsx`: No announcement until a tick, once per interval, whole words only, tail once, nothing for finished messages, stops ticking, region beside the body, markdown stripped.
- `apps/web/features/chat/components/messages/__tests__/stream-announcement.test.ts`: Completed, cancelled, partial failure, approval wait, paused, recovered and failed outcomes.
- `apps/web/features/connectors/components/__tests__/ConnectorOutcomeAnnouncer.test.tsx`: Connector outcome announcements.
- `apps/mobile/__tests__/MessageListTurnOutcome.test.tsx`: Mobile outcome announcement.
- `apps/mobile/__tests__/MessageListFollowBottom.test.tsx`: Mobile list behaviour that references announceForAccessibility.
- `apps/mobile/src/features/tasks/__tests__/CloudTasksScreen.test.tsx`: Search announcement spy.
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Chrome sp-messages role log and aria-live polite in source.

**Test scenarios**

- **Calm streaming**
  1. Turn on a screen reader, send a long prompt on web.
  2. Listen to the whole reply.
  - Expected: Pieces about every 2 seconds, whole words, tail once, no repeat.
- **Approval pause**
  1. Run a task that needs approval.
  - Expected: Reader says the paused-for-approval phrase; focus unchanged.
- **Mobile start and outcome**
  1. Use VoiceOver on a phone; send a message.
  - Expected: 'Responding' then an outcome; no streamed text spoken.
- **VS Code and Chrome streaming**
  1. Stream a long reply with a reader on.
  - Expected: Record whether text repeats or arrives token by token (currently unverified).
- **CLI screen reader**
  1. Run the CLI with --screen-reader or AGI_SCREEN_READER set.
  - Expected: Plain lines labelled you: and agi:; bell when input is needed.

**Where to look when it fails**

- DevTools: watch the sr-only region text change (data-testid stream-announcer).
- Mobile: spy on announceForAccessibility in tests.
- CLI: output.rs plain-mode tests.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **Mobile does not announce streamed text.** Affects: Mobile screen-reader users.. Evidence: MessageList.tsx:246-258 only announces start and outcome; brief S11.08 mobile missing.. Work needed: Decide if start and outcome is the intended design and update the brief, or add chunking.
- **VS Code and Chrome streaming announcements unverified.** Affects: VS Code and Chrome screen-reader users.. Evidence: webviewContent.ts:3167; side_panel.ts:6340-6346; brief S11.08.. Work needed: Test with a reader and, if needed, reuse StreamAnnouncer logic.
- **Announcement strings are English only.** Affects: Non-English users.. Evidence: ChatMessageList.tsx:1756-1758; MessageList.tsx:164. Work needed: Add translations.
- **No recorded screen-reader run for any app.** Affects: All.. Evidence: No result file found.. Work needed: Run and record.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- file:packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- F011-01

## Unknown

- Whether VS Code and Chrome double-announce or read token by token.
- Whether Mobile local inference path triggers the same announcements.
- Where the CLI voice and screen reader paths interact with approvals.
- Whether any recorded screen-reader test run exists outside the repository.

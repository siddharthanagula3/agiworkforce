---
id: "F016-01"
type: "feature"
title: "Who sent it (identity)"
aliases: ["User identity", "Who sent it", "User avatar (brief S16.01)", "Author label", "You said heading"]
area: "16 User-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S16.01"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:apps/web/features/chat/components/messages/MessageBubble.tsx", "file:packages/ui/unified-chat/src/components/MessageBubble.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-01 Who sent it (identity)

Shows which turns in a chat transcript are the person's and which are the assistant's. Each app marks the author a different way: a right-aligned bubble with a hidden heading on web and in the shared desktop bubble, a '>' marker in the CLI, a hidden 'You said:' label in VS Code and Chrome, and a 'You' role label on mobile.

Area: [16. User-message components](README.md). Requirement items: [S16.01](../../10-requirements/capabilities/016-user-message-components.md#s1601).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Marks every transcript turn with its author so the eye and a screen reader can tell the user's turns from the assistant's. The web app uses layout (user turns in a right-aligned bubble, assistant turns as a flat column) plus a hidden heading; it deliberately has no avatars (apps/web/features/chat/components/messages/MessageBubble.tsx:2593-2594).

**Why it exists.** The brief requires that the author of each turn is visually distinguishable and announced to assistive technology (doc: knowledge-base/data/area-briefs/016-user-message-components.md, S16.01). Without it a long transcript is hard to read and unusable with a screen reader.

**Who uses it.** Every person who reads a chat transcript; screen-reader users rely on the hidden headings and labels most.

**Problems it solves**

- Telling your own turns from the assistant's at a glance in a long chat.
- Letting a screen reader announce who spoke before each turn.
- Keeping the same idea (bubble, marker or label) readable in a terminal, a side panel and a phone.

**Use cases**

- Scrolling back through a long web chat to find what you asked.
- Navigating the transcript by headings with a screen reader.
- Reading a CLI session where the '>' marker separates your prompt from the reply.
- Checking in the VS Code panel which message was yours before pressing a message action.

## 2. User experience

**Where to find it**

- Web: every chat transcript. User rows carry data-role=user, assistant rows data-role=assistant (apps/web/features/chat/components/messages/MessageBubble.tsx:2572).
- Desktop (public Electron app): shows the hosted web app, so it is the same as web (ARCHITECTURE.md:51-54).
- Desktop (internal Tauri build): the shared chat bubble, user turns in a bubble capped at 85% width with a hidden 'You said:' heading (packages/ui/unified-chat/src/components/MessageBubble.tsx:726-736).
- Mobile: user turns right-aligned, labelled 'Your message: ...' for accessibility; assistant turns left-aligned with the model name or 'AGI' as role label (apps/mobile/src/features/chat/components/MessageBubble.tsx:1129, 2217-2222, 2237).
- CLI: the terminal transcript prefixes user turns with '>' and assistant turns with a star marker (apps/cli/src/tui/tui_app.rs:2881-2896).
- VS Code: user messages are right-aligned boxes (85% max width) with a hidden 'You said:' label (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:617-623, 5771).
- Chrome: each message has a hidden heading reading 'You said:' or 'AGI said:' (apps/extension/src/features/side-panel/bubbles.ts:383-389; apps/extension/_locales/en/messages.json keys spAuthorUser, spAuthorAssistant).

**Before you start**

- A conversation with at least one sent message.
- For the hidden labels: a screen reader or the browser's accessibility tree.

**Screens and controls**

- No control. The author marker is part of every message row.
- Web: user bubble is capped at 75% width and aligned to the end; assistant content fills the column (MessageBubble.tsx:2603-2607).

**Journey**

1. Open a conversation.
2. Read the transcript: your turns sit at the right (or after '>' in the CLI), the assistant's fill the column.
3. With a screen reader, move by heading: each turn is announced as 'You said:' or 'Assistant said:' (web) / 'AGI said:' (Chrome).

**What the person sees and gets**

- Visible alignment and bubble styling per app.
- Hidden heading text for assistive technology.

**Settings**

- Web entry animation is skipped when the operating system asks for reduced motion (MessageBubble.tsx:852-859, 2579-2583).
- No setting changes the author marker itself.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: data-role, data-message-id and a hidden h5 'You said:' / h6 'Assistant said:' on each row; user content is a right-aligned column capped at 75% (apps/web/features/chat/components/messages/MessageBubble.tsx:2571-2607).
- Shared desktop bubble: data-role=user, hidden h5 'You said:' and hidden h6 'Assistant said:' for assistant (packages/ui/unified-chat/src/components/MessageBubble.tsx:726-736, 786-792).
- Mobile: right-aligned user turn; accessible label 'Your message: <first 100 chars>' with long-press actions (apps/mobile/src/features/chat/components/MessageBubble.tsx:2217-2222).
- CLI: ' > ' prefix for user, a star prefix for assistant (apps/cli/src/tui/tui_app.rs:2881-2896).
- VS Code: hidden 'You said:' prepended to each sent user message (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4934-4939, 5771).
- Chrome: hidden h2 author label and a bubble class per role (apps/extension/src/features/side-panel/bubbles.ts:383-393, 775-781).

**Incomplete**

- Web uses h5 for the user label and h6 for the assistant label, which skips heading levels [inferred] (MessageBubble.tsx:2589-2593).
- The assistant label text differs between apps: 'Assistant said:' on web and the shared bubble, 'AGI said:' in Chrome (MessageBubble.tsx:2590; apps/extension/_locales/en/messages.json spAuthorAssistant).
- CLI has only a '>' glyph; I found no hidden or spoken author label in the CLI transcript code I read (apps/cli/src/tui/tui_app.rs:2881-2960).

**Present but disconnected or switched off**

- Group-conversation author identity (which person wrote a turn) is not built on any app (doc: knowledge-base/data/area-briefs/016-user-message-components.md, S16.21).

**Not available**

- Avatars or names on user turns: none on web by design (MessageBubble.tsx:2593-2594); mobile shows the label 'You' only in accessibility strings and the menu label (MessageBubble.tsx:1129, 3188).

## 4. Required behaviour

**Established requirements**

- The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) and announced to assistive technology. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.01)
- On web every user row carries data-role=user and a hidden heading 'You said:'; assistant rows carry 'Assistant said:'. (source: S16.01 brief 'Should' (code: apps/web/features/chat/components/messages/MessageBubble.tsx:2571-2593))
- Every chat surface should show message labels and keep one set of chat concepts across surfaces. (source: docs/product/requirements.md section 6.2 (universal chat concepts))

**Acceptance criteria**

1. Web: a user row has data-role=user and contains a visually hidden 'You said:' heading; an assistant row has 'Assistant said:'.
2. Web: the user bubble is never wider than 75% of the column and sits at the end side.
3. Mobile: the user turn is announced as 'Your message: ...' by a screen reader.
4. CLI: a user turn starts with '>' and a reply with the star marker.
5. VS Code and Chrome: each user message has a hidden 'You said:' label in the accessibility tree.
6. In a right-to-left language the user bubble sits on the end (left) side [inferred from items-end / flex-row-reverse].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The labels should be translated; web uses plain English strings in MessageBubble.tsx while Chrome and the shared bubble use translation keys [inferred].
- Heading levels should be consistent so heading navigation works [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the CLI a screen-reader-friendly author word (for example 'you') beside the glyph.
- [proposed] Use one assistant label text across web and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Row wrapper with data-role, hidden You said / Assistant said headings, 75% user width. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Maps each message to a row and passes displayRole to the bubble. |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Page that mounts the transcript for web and the Electron desktop window. |
| component | MessageBubble (shared UI) | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Shared bubble used by the internal Tauri desktop chat; hidden You said heading, 85% width. |
| component | MessageList (shared UI) | `packages/ui/unified-chat/src/components/MessageList.tsx` | Renders the shared bubbles. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Mobile row: right-aligned user turn, roleLabel, accessibility label. |
| component | MessageList (mobile) | `apps/mobile/src/features/chat/components/MessageList.tsx` | Mobile transcript list that renders the bubble rows. |
| screen | Chat screen (mobile) | `apps/mobile/app/(app)/chat/[id].tsx` | Mobile chat screen that feeds the list. |
| service | TUI transcript renderer | `apps/cli/src/tui/tui_app.rs` | Draws the '>' and star prefixes per ChatRole. |
| component | Sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code message styling and the hidden You said label. |
| component | Side-panel bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | Builds the hidden author heading and role class per bubble. |
| config | Chrome locale strings | `apps/extension/_locales/en/messages.json` | Text for spAuthorUser and spAuthorAssistant. |
| test | Desktop bubble layout test | `apps/desktop/src/__tests__/ChatMessageBubbleLayout.test.tsx` | Checks the shared user bubble keeps its width cap. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A message object with role user or assistant is read from the chat store and handed to the bubble. | device | apps/web/features/chat/components/messages/ChatMessageList.tsx:819-855 passes message props to MessageBubble |
| The bubble sets data-role from message.role and renders the hidden heading and layout classes. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:2571-2593 |
| Other apps do the same locally: the TUI picks a prefix per ChatRole, VS Code and Chrome add a hidden label. | device | apps/cli/src/tui/tui_app.rs:2881-2896; apps/extension/src/features/side-panel/bubbles.ts:383-389 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Role of each message (user or assistant) | Chat store in memory and the saved conversation rows (web_messages per apps/web/db/neon/0156_message_thread_variants.sql header comment); other apps keep their own stores | Role travels with the message wherever it syncs; this feature adds no data of its own | Follows the message; no separate retention |

**Models and providers.** Not involved. The marker depends only on the message role, not on any model or provider [inferred from MessageBubble.tsx:2572].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for showing the marker. Reading a transcript needs whatever sign-in the chat screen already needs. |
| Permissions | none found in the code |
| Subscription | none found in the code; no entitlement check guards the author marker. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code for the marker. Web entry animation depends on the reduced-motion preference (MessageBubble.tsx:852-859). |
| Model compatibility | Any model; the marker does not depend on the model. |
| Provider restrictions | none found in the code |
| Local mode | Works the same in Local mode: it is a display rule on the device with no server call. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming reply | The assistant heading stays on the row while content streams; the web bubble keeps data-role=assistant. | apps/web/features/chat/components/messages/MessageBubble.tsx:2572-2593 |
| Reduced motion | Entry animation is skipped when the user prefers reduced motion. | apps/web/features/chat/components/messages/MessageBubble.tsx:2579-2583 |
| Empty or very long user text | Mobile label shows the first 100 characters or the word 'empty'. | apps/mobile/src/features/chat/components/MessageBubble.tsx:2219 |
| Several human authors in one chat | not handled in the code | S16.21 status is missing on every app in knowledge-base/data/area-briefs/016-user-message-components.md |
| Offline, retry, cancel, timeout | not handled in the code: this feature is static display and has no such states | apps/web/features/chat/components/messages/MessageBubble.tsx:2571-2607 has no such logic for the author marker |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Renders the user message inside a right-aligned bubble and bounds its width (titles at lines 158 and 164); assistant content renders flat (line 205).
- `apps/desktop/src/__tests__/ChatMessageBubbleLayout.test.tsx`: The shared user bubble has the max-w-[85%] class.
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Renders a user message into a right-tagged bubble with its text (line 142).

**Test scenarios**

- **Web hidden headings**
  1. Open a web chat with one question and one answer.
  2. Open the accessibility tree.
  3. Find the headings in each row.
  - Expected: User row: 'You said:'; assistant row: 'Assistant said:'.
- **Bubble width**
  1. Send a very long single-line message on web at desktop width.
  - Expected: The bubble never exceeds about 75% of the column and stays at the end side.
- **Mobile screen reader**
  1. Turn on the phone screen reader.
  2. Focus a sent message.
  - Expected: It reads 'Your message: ' and the start of the text.
- **CLI markers**
  1. Start a CLI chat, send one prompt, wait for the reply.
  - Expected: Prompt line begins with '>' and the reply with the star marker.
- **Chrome and VS Code labels**
  1. Send a message in the Chrome side panel and in the VS Code panel.
  2. Inspect the DOM.
  - Expected: A visually hidden 'You said:' is present before the text.

**Where to look when it fails**

- Inspect data-role and data-message-id on the row in browser dev tools.
- No log lines: this is display only.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- Mobile: [70-qa/test-plans/mobile/016-user-message-components.md](../../70-qa/test-plans/mobile/016-user-message-components.md)
- CLI: [70-qa/test-plans/cli/016-user-message-components.md](../../70-qa/test-plans/cli/016-user-message-components.md)
- VS Code: [70-qa/test-plans/vscode/016-user-message-components.md](../../70-qa/test-plans/vscode/016-user-message-components.md)
- Chrome: [70-qa/test-plans/chrome/016-user-message-components.md](../../70-qa/test-plans/chrome/016-user-message-components.md)

## 10. Gaps and dependencies

- **No author identity for groups of people** Affects: All six apps. Evidence: S16.21 missing everywhere in knowledge-base/data/area-briefs/016-user-message-components.md. Work needed: Define a participant model, then show a name or avatar on each user turn.
- **Heading levels h5/h6 and different assistant wording across apps** Affects: Web, Chrome, shared bubble. Evidence: MessageBubble.tsx:2589-2593; apps/extension/_locales/en/messages.json spAuthorAssistant. Work needed: Pick one heading level and one assistant label and apply it everywhere.
- **No spoken author label in the CLI** Affects: CLI users with screen readers. Evidence: apps/cli/src/tui/tui_app.rs:2881-2896 uses glyph prefixes only. Work needed: Add a plain-word label or confirm terminal readers announce the glyph.
- **Brief says 'built' for all six apps but the brief's line references for CLI (tui_app.rs:1500) do not match the author code** Affects: Documentation accuracy. Evidence: apps/cli/src/tui/tui_app.rs:1490-1510 is footer text, author prefixes are at 2881. Work needed: Update the brief's code references.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:apps/web/features/chat/components/messages/MessageBubble.tsx
- file:packages/ui/unified-chat/src/components/MessageBubble.tsx

## Unknown

- Whether the Tauri desktop shell still ships to anyone: ARCHITECTURE.md calls it retained internal code, so 'desktop built' in the brief may only describe the hosted web app.
- Whether Chrome's author heading is placed before the bubble in DOM order for all message types (only buildBubble was read).
- The CSS alignment of Chrome user bubbles (stylesheet not opened).

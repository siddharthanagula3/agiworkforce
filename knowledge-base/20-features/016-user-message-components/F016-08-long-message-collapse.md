---
id: "F016-08"
type: "feature"
title: "Long message collapse"
aliases: ["Show more", "Show less", "long message collapse", "user message clamp", "USER_MESSAGE_COLLAPSE_HEIGHT_PX", "Expand long message (S16.12)", "Collapse long message (S16.13)"]
area: "16 User-message components"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S16.12", "S16.13"]
depends_on: ["surface:web", "surface:desktop", "SYS-shared-ui-and-design", "file:apps/web/features/chat/components/messages/MessageBubble.tsx", "file:apps/web/app/globals.css", "F016-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-08 Long message collapse

A very tall message you sent is cut off with a fade at 320 pixels, with a 'Show more' button under it. Pressing it shows the whole message and the button changes to 'Show less'. It exists on web and on the desktop that shows the web app. It is not in the other apps.

Area: [16. User-message components](README.md). Requirement items: [S16.12](../../10-requirements/capabilities/016-user-message-components.md#s1612), [S16.13](../../10-requirements/capabilities/016-user-message-components.md#s1613).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Clips a sent user message that is taller than 320 pixels, adds a fade at the bottom, and shows a toggle button to expand and fold it (apps/web/features/chat/components/messages/MessageBubble.tsx:388,2855-2857,2931-2952).

**Why it exists.** Pasted logs, code or documents can fill many screens and push the reply out of view. Folding the message keeps the thread readable. [inferred from the behaviour]

**Who uses it.** People who paste long text into chat on web or in the hosted desktop.

**Problems it solves**

- A long paste hides the assistant reply below it.
- Scrolling past a pasted document is slow.
- The full text stays reachable with one click.

**Use cases**

- Paste a long error log, then see only the first part with a fade and 'Show more'.
- Click 'Show more' to read the full prompt, then 'Show less' to fold it.
- Start editing a long message: the fold and button hide while the editor is open.

## 2. User experience

**Where to find it**

- Web: under your own tall message in the transcript, a small button 'Show more' or 'Show less' (MessageBubble.tsx:2943-2952).
- Desktop: the public Electron desktop shows the hosted web app, so the same control appears (doc: AGENTS.md section 5). The internal Tauri chat view uses a different user bubble with no collapse (packages/ui/unified-chat/src/components/MessageBubble.tsx:595-607).
- Mobile, CLI, VS Code, Chrome: not present (brief S16.12 and S16.13 missing).

**Before you start**

- A user message whose rendered height is above 320 pixels plus one pixel (MessageBubble.tsx:927).

**Screens and controls**

- Clipped text area with a gradient fade at the bottom, 64 pixels high, hidden from screen readers (MessageBubble.tsx:2931-2941).
- Text button with aria-expanded set to the expanded state (MessageBubble.tsx:2943-2951).

**Journey**

1. Send or open a conversation with a tall message.
2. The message shows clipped with a fade.
3. Click 'Show more'; the clip and fade are removed and the button reads 'Show less'.
4. Click 'Show less' to fold it again.
5. While editing the message, neither the fade nor the button shows (MessageBubble.tsx:2931,2943).

**What the person sees and gets**

- The visible text height changes; the button label switches between 'Show more' and 'Show less'; aria-expanded switches between false and true.

**Settings**

- none found in the code. The 320 pixel threshold is a constant, not a setting (MessageBubble.tsx:388).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web user bubble measures its content with scrollHeight and sets the overflow state (MessageBubble.tsx:923-928).
- Clip uses maxHeight and overflow hidden while collapsed (MessageBubble.tsx:2855-2857).
- Fade overlay and toggle are hidden while editing (MessageBubble.tsx:2931,2943).
- Expanded state is kept per message component (MessageBubble.tsx:877).

**Incomplete**

- The height is measured only when the message content or edit state changes, with no observer for window resize or font changes, so a resize can leave the fold decision stale (the effect depends on isUser, isEditing, message.content, MessageBubble.tsx:923-928; no ResizeObserver found in the file). [inferred consequence]
- The toggle's colour and focus style are minimal (text-xs underline on hover); visual quality not checked.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Tauri desktop chat bubble: no collapse code (packages/ui/unified-chat/src/components/MessageBubble.tsx:595-607,726-780).
- Mobile, CLI, VS Code, Chrome: not built per the brief; none found.

## 4. Required behaviour

**Established requirements**

- A long user message is shown collapsed with a control that expands it to full length. (source: brief S16.12)
- An expanded long user message can be collapsed again. (source: brief S16.13)
- A message taller than 320px is clipped with a fade and a button toggles it; the button has aria-expanded and is hidden while editing. (source: MessageBubble.tsx:388,2931-2951 (as cited in the feature draft))

**Acceptance criteria**

1. A user message taller than 321 pixels renders clipped to 320 pixels with a fade and a 'Show more' button.
2. A user message of 320 pixels or less shows no button and no fade.
3. Clicking 'Show more' removes the clip and fade, and the button reads 'Show less' with aria-expanded true.
4. Clicking 'Show less' restores the clip and sets aria-expanded false.
5. Opening Edit on the message hides the fade and button.
6. Assistant messages never show this control.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The clip should be re-evaluated when the width changes, because wrapping changes height.
- [inferred] Keyboard users must reach the button with Tab and press Enter or Space; it is a native button.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Re-measure with a ResizeObserver.
- [proposed] Add a test; none was found for this control.
- [proposed] Carry the same fold to the Tauri chat and to mobile if long pastes are common there.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | USER_MESSAGE_COLLAPSE_HEIGHT_PX | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Constant 320 that defines the clip height (line 388). |
| component | MessageBubble user content | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Holds userContentRef, userContentOverflows and userContentExpanded state (lines 875-877). |
| hook | overflow measurement layout effect | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Measures scrollHeight against 321 pixels (lines 923-928). |
| component | Fade overlay | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Gradient from transparent to the bubble background colour (lines 2931-2941). |
| component | Show more / Show less button | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Toggle with aria-expanded (lines 2943-2952). |
| config | --chat-user-bubble-bg token | `apps/web/app/globals.css` | Background colour used by the fade (line 659). |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Renders MessageBubble for each message. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Hosts the message list on web and in the hosted desktop. |
| component | Tauri UserBubbleBody | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Tauri user bubble with no clip; shows the gap (lines 595-607). |
| component | Tauri UserBubbleActions | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Copy and edit only (lines 609-650). |
| config | Electron shell | `apps/desktop/electron` | Electron desktop that shows the hosted web app (doc: AGENTS.md section 5); not opened. |
| test | Desktop bubble layout test | `apps/desktop/src/__tests__/ChatMessageBubbleLayout.test.tsx` | Layout test of the unified user bubble; no collapse assertion seen. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The message renders; a layout effect reads the content element's scrollHeight. | device | MessageBubble.tsx:923-928 |
| If the height is above 321 pixels the content gets maxHeight 320 and overflow hidden, and the fade and button appear. | device | MessageBubble.tsx:2855-2857,2931-2952 |
| Clicking the button flips the expanded state in memory. | device | MessageBubble.tsx:2946 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Expanded or folded state | React component state in the page | No | Lost on reload or when the message component unmounts. |

**Models and providers.** No model or provider takes part. The feature only changes how stored text is displayed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for this control; it renders for any message shown. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code; the 320 pixel threshold is a constant. |
| Feature flags | none found in the code. |
| Model compatibility | none; it applies to user messages only (isUser check, MessageBubble.tsx:2931,2943). |
| Provider restrictions | none found in the code. |
| Local mode | Runs entirely on the device. It works in the hosted web app whether the reply came from Local, own key or Cloud, because it only handles display [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Short message | No fade and no button. | MessageBubble.tsx:927 |
| Editing | Overflow is not re-measured while editing; the fade and button are hidden. | MessageBubble.tsx:924,2931,2943 |
| Window resized or font changed | not handled in the code (no observer found); the state updates only when content or edit state changes. | MessageBubble.tsx:923-928 |
| Message content changes | Overflow is re-measured; expanded state is not reset. | MessageBubble.tsx:928 |
| Accessibility | Button has aria-expanded; the fade is aria-hidden and not clickable. | MessageBubble.tsx:2933,2947 |
| Loading, error, offline, retry | not applicable; no network is used. | MessageBubble.tsx:923-952 |
| Tauri internal desktop | A tall message is shown in full; no fold. | packages/ui/unified-chat/src/components/MessageBubble.tsx:595-607 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/src/__tests__/ChatMessageBubbleLayout.test.tsx`: Layout of the unified (Tauri) user bubble; it does not test collapse.

**Test scenarios**

- **Fold a tall message**
  1. On web, send a message with about 60 lines.
  2. Look under the message.
  - Expected: Message is clipped near 320 pixels with a fade and 'Show more'.
- **Expand and fold**
  1. Click 'Show more'.
  2. Check the button and aria-expanded.
  3. Click 'Show less'.
  - Expected: Full text shows, label 'Show less', aria-expanded true; then folds again with aria-expanded false.
- **Edit hides control**
  1. With a folded message open Edit from '...'.
  - Expected: No fade and no button while the editor is open.
- **Short message**
  1. Send a two-line message.
  - Expected: No button.
- **Resize stale state**
  1. Open a message that just fits on a wide window.
  2. Narrow the window.
  - Expected: Test the behaviour; the code has no resize handler so the fold may not appear.

**Where to look when it fails**

- No log lines or tables. Inspect the element with ref userContentRef: check scrollHeight against 321 and the inline maxHeight style.
- Search found no automated test for this control (search of apps for USER_MESSAGE_COLLAPSE and 'Show more' found only the component).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)

## 10. Gaps and dependencies

- **No automated test covers the fold and toggle.** Affects: Web and hosted desktop. Evidence: search of apps and packages found USER_MESSAGE_COLLAPSE_HEIGHT_PX and userContentOverflows only in MessageBubble.tsx. Work needed: Add a component test with a mocked scrollHeight.
- **No re-measure on resize.** Affects: Web and hosted desktop on narrow or resized windows. Evidence: MessageBubble.tsx:923-928. Work needed: Use a ResizeObserver.
- **Tauri desktop chat has no collapse although the brief says desktop built.** Affects: Internal Tauri desktop. Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:595-607. Work needed: Add the fold to the shared bubble or record the difference.
- **Mobile, CLI, VS Code and Chrome have no fold.** Affects: Those apps. Evidence: brief S16.12/S16.13 missing. Work needed: Decide per app; terminals may not need it.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- SYS-shared-ui-and-design
- file:apps/web/features/chat/components/messages/MessageBubble.tsx
- file:apps/web/app/globals.css
- F016-07

## Unknown

- Whether the hosted desktop adds any CSS that changes the 320 pixel behaviour.
- Whether there is an end-to-end test of the toggle (none found in the searched folders).
- How the control looks and behaves on a phone-width web page (not checked).
- Whether Electron desktop wraps the web page with different message components (apps/desktop/electron not opened).

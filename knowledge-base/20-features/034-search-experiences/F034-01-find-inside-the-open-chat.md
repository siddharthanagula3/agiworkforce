---
id: "F034-01"
type: "feature"
title: "Find inside the open chat"
aliases: ["Find in chat", "Search messages", "Message search", "Cmd+F / Ctrl+F find", "/find", "S34.01", "MessageSearch"]
area: "34 Search experiences"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S34.01"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "file:apps/web/features/chat/components/messages/MessageSearch.tsx", "file:apps/web/features/chat/lib/message-search.ts", "file:apps/cli/src/tui/tui_app.rs", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-01 Find inside the open chat

Find inside the open chat lets a person type some text and jump between the messages of the conversation they are reading that contain it. Web and Desktop show a search bar with match count, next/previous and highlighting. The CLI full-screen chat has /find, which lists matching lines but does not jump. Mobile, VS Code and Chrome have none.

Area: [34. Search experiences](README.md). Requirement items: [S34.01](../../10-requirements/capabilities/034-search-experiences.md#s3401).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Searches only the messages of the conversation that is open. On Web and Desktop it finds messages whose visible (rendered) text contains the query, scrolls the chat to each one in turn and paints the matched words. In the CLI full-screen chat it prints a list of matching lines.

**Why it exists.** Long chats are hard to scan. Claude and ChatGPT both let people find text in the chat they are in, and the repository's product rules say to follow them (doc: AGENTS.md section 10; doc: docs/product/competitive-guidance.md).

**Who uses it.** Anyone reading a long conversation: people reviewing an earlier answer, a code snippet or a decision inside one chat.

**Problems it solves**

- Scrolling a long transcript to find one earlier answer
- Telling whether a word was ever said in this chat
- Reaching a specific message quickly with the keyboard

**Use cases**

- Web user presses Ctrl+F in a 200-message chat to find where a command was suggested
- Desktop user searches for a file name mentioned earlier
- CLI user types /find migration to list every line that mentions it

## 2. User experience

**Where to find it**

- Web and Desktop: inside any open chat, press Cmd+F (Mac) or Ctrl+F; a bar slides in at the top of the message list (apps/web/features/chat/components/messages/ChatMessageList.tsx:1539, :2092). Desktop is the hosted web app (doc: AGENTS.md section 5).
- CLI full-screen chat: type /find followed by the text; the command list describes it as 'Search this conversation's messages' (apps/cli/src/tui/tui_app.rs:4524, :5620).
- Mobile, VS Code, Chrome: not present (doc: knowledge-base/data/area-briefs/034-search-experiences.md S34.01).

**Before you start**

- An open conversation with messages (Web/Desktop: the chat page; CLI: the full-screen chat).
- No sign-in, plan or network is needed for the search itself: matching runs on text already loaded in the page or terminal (apps/web/features/chat/lib/message-search.ts:9; apps/cli/src/tui/tui_app.rs:4680).

**Screens and controls**

- Search bar (role search, label 'Search messages') with a text box whose placeholder is 'Search messages...' (apps/web/features/chat/components/messages/MessageSearch.tsx:79, :95).
- Match label: '<n> of <total> matches' or 'No matches' once something is typed (MessageSearch.tsx:62).
- Buttons 'Go to previous match' (Shift+Enter) and 'Go to next match' (Enter); both disabled when there are no matches (MessageSearch.tsx:112-132).
- Button 'Close search' (Escape) (MessageSearch.tsx:136).
- CLI: /find <text>; with no text it answers 'Usage: /find <text>' (apps/cli/src/tui/tui_app.rs:4683).

**Journey**

1. Web/Desktop: press Cmd+F or Ctrl+F; the browser's own find is cancelled and the bar opens with the text box focused and selected.
2. Type the text. The count updates and matching words are highlighted in the messages that are on screen.
3. Press Enter or click the down arrow for the next matching message; Shift+Enter or the up arrow for the previous one. The list scrolls so the match sits in the middle and wraps from last to first.
4. Press Escape or click Close. The bar closes and the query is cleared.
5. CLI: type /find text; a system message lists '<n> line(s) match ...' with '#<message number> <you|assistant|teammate> <first 120 characters of the line>'.

**What the person sees and gets**

- Count text, highlighted words, smooth scroll to the matching message.
- 'No matches' text and disabled arrows when nothing matches.
- CLI: a list capped at 30 lines followed by '... N more'; or "Nothing in this conversation matches '<text>'." (apps/cli/src/tui/tui_app.rs:4702-4713).

**Settings**

- None found for find-in-chat itself. The shortcut is a fixed key check on the window, not a registry entry (ChatMessageList.tsx:1539) [inferred: no shortcut id was found for it].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: bar opens on Cmd/Ctrl+F, Escape closes and clears (apps/web/features/chat/components/messages/ChatMessageList.tsx:1504, :1539-1551).
- Web: matching ignores case, trims the query and compares against the Markdown-rendered text, so formatting marks and link addresses are not matched (apps/web/features/chat/lib/message-search.ts:9-40).
- Web: next/previous wrap around using modulo and scroll the row to the centre (ChatMessageList.tsx:1518-1535).
- Web: matched words are painted with the browser highlight registry, skipping buttons, inputs and hidden text, capped at 500 highlights (apps/web/features/chat/hooks/use-text-match-highlight.ts:6-14).
- Desktop shows the same code because the public desktop window shows the hosted web app (doc: AGENTS.md section 5).
- CLI full-screen chat: /find lists matching lines of user, assistant and teammate messages, skipping system, error, detail and tool messages (apps/cli/src/tui/tui_app.rs:4680-4713).

**Incomplete**

- The count is the number of message groups (rows) that match, not the number of occurrences: the total comes from matchingGroupIndexes, which returns one index per group (message-search.ts:9-31) [inferred].
- Highlighting reaches only text currently mounted in the page; the transcript is a virtualised list with a small overscan (ChatMessageList.tsx:2110) [inferred: rows far away are not in the page until scrolled to].
- CLI lists lines only; it does not jump or highlight (apps/cli/src/tui/tui_app.rs:4713).

**Present but disconnected or switched off**

- none found. A code comment above the search state at ChatMessageList.tsx:1493 is cut off mid-sentence; it is cosmetic.

**Not available**

- Mobile app: no in-chat find (doc: area brief S34.01).
- VS Code extension: no in-chat find (doc: area brief S34.01).
- Chrome extension: no in-chat find (doc: area brief S34.01).
- CLI line-mode chat (apps/cli/src/repl): no /find command found by searching that folder for '/find' [inferred: not present].

## 4. Required behaviour

**Established requirements**

- Inside an open conversation the user can type a query and jump between the messages that match it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.01)
- Matching is case-insensitive on the text as shown on screen; the list scrolls to the match, centres it and wraps from last to first; matched text is highlighted; with no matches the arrows are disabled; closing clears the query. (source: apps/web/features/chat/components/messages/ChatMessageList.tsx:1504-1535; apps/web/features/chat/components/messages/MessageSearch.tsx:112-132)
- CLI /find lists matching lines as '#<message number> <who> <line>', shows at most FIND_RESULT_LIMIT with '... N more', and says nothing matches when empty; it does not jump. (source: apps/cli/src/tui/tui_app.rs:4680-4713)

**Acceptance criteria**

1. On Web, Ctrl+F in an open chat opens the bar with the text box focused; typing 'abc' shows '1 of N matches' when N messages contain 'abc' in any letter case.
2. Enter moves to the next matching message and the list scrolls so it is centred; on the last match Enter goes to the first.
3. Shift+Enter moves backwards and wraps from the first to the last.
4. A query that matches nothing shows 'No matches' and both arrow buttons are disabled.
5. Escape closes the bar and reopening it shows an empty query.
6. Text that only appears as Markdown syntax (for example the asterisks around bold text or a link address) is not matched.
7. CLI: /find with a word present in 40 lines lists 30 lines and '... 10 more'; with a word not present prints "Nothing in this conversation matches '<word>'."

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The count label should say how many messages match rather than 'matches' if it counts rows [inferred from the code, not stated in any document].
- Find should work offline, because no network call is made in the matching path [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the number of occurrences, or label the count as 'messages', so the count matches what people expect.
- [proposed] Make CLI /find jump the transcript view to the chosen line, like the web bar.
- [proposed] Add in-chat find to Mobile, as the leaders do, with the same matching rules.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageSearch | `apps/web/features/chat/components/messages/MessageSearch.tsx` | The search bar: input, count label, previous/next/close buttons, Enter/Shift+Enter/Escape keys. |
| component | ChatMessageList (search state) | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Holds open/query/index state, Cmd/Ctrl+F listener, next/previous with wrap, scroll-to-row centre, mounts the bar (lines 1494-1551, 2092). |
| service | matchingGroupIndexes | `apps/web/features/chat/lib/message-search.ts` | Returns the indexes of message groups whose rendered text contains the lower-cased, trimmed query; caches rendered text. |
| hook | useTextMatchHighlight | `apps/web/features/chat/hooks/use-text-match-highlight.ts` | Paints the query in the message elements with the browser highlight registry (name agi-find-match); max 500 matches. |
| other | text-match-highlight.css | `apps/web/features/chat/hooks/text-match-highlight.css` | Style for the highlight names. |
| service | markdownRenderedText | packages/ui/unified-chat/src/lib/markdown-document.ts (not found) (not found) | Turns message Markdown into the text a reader sees; used so matching equals what is on screen (import in message-search.ts:1) [inferred path from the package export name]. |
| command | /find | `apps/cli/src/tui/tui_app.rs` | Slash command entry at line 5620 and list entry at 4524. |
| service | find_in_transcript | `apps/cli/src/tui/tui_app.rs` | Case-insensitive line search of chat messages, 120-character snippets, FIND_RESULT_LIMIT = 30 (lines 4680-4713). |
| test | message-search.test.ts | `apps/web/features/chat/lib/message-search.test.ts` | Unit tests for the matching rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: a window key listener catches Cmd/Ctrl+F, cancels the browser find and opens the bar. | device | apps/web/features/chat/components/messages/ChatMessageList.tsx:1539-1551 |
| Each keystroke recomputes matching groups from the messages already loaded in the page, using cached rendered text. | device | apps/web/features/chat/lib/message-search.ts:9-40 |
| Next/previous changes the current index (with wrap) and asks the virtual list to scroll that row to the centre. | device | ChatMessageList.tsx:1518-1535 |
| The highlight hook walks the message elements in the page and paints matches. | device | apps/web/features/chat/hooks/use-text-match-highlight.ts:6-14 |
| CLI: /find scans the in-memory chat messages and returns a system message. | device | apps/cli/src/tui/tui_app.rs:4680-4713, :5620 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search query and current match index | React state in the open chat page; nothing persisted | No | Cleared when the bar is closed (ChatMessageList.tsx:1504-1508) |
| Rendered-text cache | In-memory map in the chat list | No | Entries for messages no longer shown are dropped on each run (message-search.ts:34-36) |

**Models and providers.** No model or provider takes part. The search is plain text comparison on the device.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for the search itself; the chat must already be open, which on Web and Desktop needs sign-in elsewhere. |
| Permissions | none found in the code |
| Subscription | none found in the code; no entitlement check on find-in-chat. |
| Limits and metering | Web highlights at most 500 matches (use-text-match-highlight.ts:14). CLI lists at most 30 lines (tui_app.rs:4713). No metering. |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Fully on the device with no network; the same behaviour in Local, own key and Cloud because it searches text already loaded. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty query | No label is shown and no highlight is painted; matches list is empty and the cache is cleared. | apps/web/features/chat/lib/message-search.ts:16-19; MessageSearch.tsx:62 |
| No matches | Label 'No matches'; previous/next disabled and do nothing. | MessageSearch.tsx:62-68, :112-132; ChatMessageList.tsx:1523-1526 |
| Input method composition (for example Chinese or Japanese typing) | Enter during composition is ignored so it does not jump. | MessageSearch.tsx:46 |
| Screen reader | Bar has role search; count label is a polite live region; buttons have labels. | MessageSearch.tsx:79, :99-108 |
| Message with non-text content | Skipped when matching. | message-search.ts:23 |
| CLI no matches / over limit | Message 'Nothing in this conversation matches ...' / first 30 then '... N more'. | tui_app.rs:4702-4713 |
| Offline, retry, timeout | not handled in the code because there is no network step. | apps/web/features/chat/lib/message-search.ts (no fetch call) |
| Text hidden in collapsed or not-yet-mounted rows | unknown: not tested in the code read; the group still counts as a match, but highlight needs the row to be mounted. | ChatMessageList.tsx:2110 [inferred] |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/message-search.test.ts`: Matching across inline formatting, ignoring Markdown syntax, code asterisks, paragraph breaks, case and padding, non-text content, and cache pruning.

**Test scenarios**

- **Find with wrap on Web**
  1. Open a chat with at least three messages containing the word 'alpha' in different letter case.
  2. Press Ctrl+F, type 'alpha'.
  3. Press Enter three times.
  - Expected: Label reads '1 of 3 matches', then 2, 3, then wraps to 1; each jump centres the message and 'alpha' is highlighted.
- **No match state**
  1. Open the bar and type a string that is not in the chat.
  - Expected: 'No matches' is shown and both arrows are disabled.
- **Close clears**
  1. Open the bar, type a word, press Escape, press Ctrl+F again.
  - Expected: The bar is empty and nothing is highlighted.
- **Hidden Markdown is not matched**
  1. Have a message with a link whose address is 'x.test' and visible text 'docs'.
  2. Search 'x.test'.
  - Expected: No matches.
- **CLI limit**
  1. In the full-screen CLI chat with more than 30 lines containing 'foo', type /find foo.
  - Expected: 30 lines listed with '#<n> <who> <text>' and a '... N more' line.
- **Desktop parity**
  1. Open the desktop app on a chat and press Cmd+F.
  - Expected: The same bar appears (hosted web app).

**Where to look when it fails**

- Web: browser console for errors from use-text-match-highlight; check that CSS.highlights exists in the browser (the hook returns null when it does not, use-text-match-highlight.ts:30).
- CLI: if /find prints nothing useful, confirm the command is listed in tui_app.rs:4524.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)

## 10. Gaps and dependencies

- **No in-chat find on Mobile, VS Code or Chrome.** Affects: Mobile, VS Code extension, Chrome extension users. Evidence: doc: knowledge-base/data/area-briefs/034-search-experiences.md S34.01. Work needed: Design a per-app find control with the same matching rules; reuse matchingGroupIndexes logic where the surface is shared.
- **CLI /find lists lines only and cannot jump.** Affects: CLI full-screen chat users. Evidence: apps/cli/src/tui/tui_app.rs:4713. Work needed: Add a jump or scroll-to-message action in the full-screen view.
- **Count counts messages not occurrences and highlight depends on mounted rows.** Affects: Web and Desktop users of very long chats. Evidence: apps/web/features/chat/lib/message-search.ts:9-31; ChatMessageList.tsx:2110. Work needed: Decide the counting rule; test highlight after a jump to a far row.
- **No component-level test for MessageSearch and no test for CLI find_in_transcript found.** Affects: Maintainers. Evidence: searched apps/web/features/chat/components/messages/__tests__ and apps/cli/src/tui for tests naming search or find; none found. Work needed: Add a component test for keys and wrap, and a Rust test for the limit text.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- file:apps/web/features/chat/components/messages/MessageSearch.tsx
- file:apps/web/features/chat/lib/message-search.ts
- file:apps/cli/src/tui/tui_app.rs
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline

## Unknown

- Whether Cmd/Ctrl+F is blocked when another dialog or text field has focus: no check seen in the listener (ChatMessageList.tsx:1539).
- Whether any test covers MessageSearch keyboard behaviour: none found in the messages test folder.
- Whether VS Code, Chrome or Mobile have an unlisted find control: only the brief was used, those apps were not searched for in-chat find.
- Exact path of the markdownRenderedText source file.

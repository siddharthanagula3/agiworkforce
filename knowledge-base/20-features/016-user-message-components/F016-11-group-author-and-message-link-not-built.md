---
id: "F016-11"
type: "feature"
title: "Group author and message link (not built)"
aliases: ["Group-conversation author identity (S16.21)", "Message-level deep link (S16.22)", "message permalink", "Group author", "Link to one message"]
area: "16 User-message components"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S16.21", "S16.22"]
depends_on: ["surface:web", "surface:mobile", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "table:web_conversations", "table:web_messages", "table:shared_conversations", "file:apps/web/features/chat/pages/WebChatPage.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-11 Group author and message link (not built)

Not built. A group author label would show which person wrote each message in a shared chat with several people. A message link would let you copy and open a link to one message. Chats today have one owner, and no copy-link action exists. Web does have an internal highlightMessage address used by search.

Area: [16. User-message components](README.md). Requirement items: [S16.21](../../10-requirements/capabilities/016-user-message-components.md#s1621), [S16.22](../../10-requirements/capabilities/016-user-message-components.md#s1622).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Nothing yet. The intended design is a name on each user message in a chat with several people (S16.21) and a link that lands on one message (S16.22).

**Why it exists.** Shared and team chats need to show who spoke, and people want to point a colleague at one message. [inferred from the brief's Should lines]

**Who uses it.** Not available to anyone. Future users would be teams and people sharing a conversation.

**Problems it solves**

- Cannot tell which participant wrote a message in a multi-person chat (no multi-person chat exists today).
- Cannot send someone a link to one message.

**Use cases**

- A team shares a chat and each message shows its author.
- Copy a link to a message and open it to land on that message.
- Not available today.

## 2. User experience

**Where to find it**

- Not available. No author label or 'copy link to message' control was found in apps/web/features/chat/components/messages/MessageBubble.tsx, in apps/mobile, apps/extension-vscode, apps/cli or apps/extension (search for 'copy link to', 'permalink' and participants).
- Nearest existing behaviour: web opens /chat/<id>?highlightMessage=<messageId> from global search and past-chat citations, scrolls to the message and flashes an outline (apps/web/features/chat/pages/WebChatPage.tsx:5088-5120; MessageBubble.test.tsx:524).

**Before you start**

- Not applicable.

**Screens and controls**

- Not available. The existing highlight is reached only by following a search result or citation link; no button creates the link.

**Journey**

1. Not available. Existing internal path: search or cite a past chat, follow the link, the page scrolls to the message and highlights it for about 2 seconds, then removes the query parameter (WebChatPage.tsx:5098-5115).

**What the person sees and gets**

- none for the feature. The highlight outline is the only visible result of the internal link.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web internal landing on one message through the highlightMessage query parameter, with reveal of a non-visible variant (WebChatPage.tsx:1142-1143,5088-5120).
- Each web message element carries data-message-id (MessageBubble.tsx:2572).
- Mobile reads a highlight parameter in the chat screen (apps/mobile/app/(app)/chat/[id].tsx:280-281,2628).

**Incomplete**

- The highlight link is not offered to the person as a copyable link; only search and citations produce it (no copy-link action found).

**Present but disconnected or switched off**

- WebChatPage builds a conversation view with participants: [] always empty (WebChatPage.tsx:863).

**Not available**

- Group author identity: missing on all six apps (brief S16.21). Web messages table has no author column; the table web_messages has no user_id and ownership comes from web_conversations.user_id (apps/web/db/neon/0037_rls_user_isolation.sql:93).
- Message deep link as a user feature: missing on mobile, CLI, VS Code and Chrome (brief S16.22); web and desktop not stated in the brief.
- Shared conversations exist as read-only snapshots by token (apps/web/db/neon/0021_shared_conversations.sql), which are not group chats.

## 4. Required behaviour

**Established requirements**

- In a conversation with several human participants, each user message shows which person wrote it. (source: brief S16.21)
- A user can obtain and open a link that lands on one specific message in a conversation. (source: brief S16.22)
- The brief lists no code for either item and says nothing to verify. (source: brief S16.21, S16.22)

**Acceptance criteria**

1. Not testable today: no author label or copy-link action exists.
2. If built: a message from a second participant shows that person's name and avatar and is announced to assistive technology.
3. If built: opening a message link signed in as an allowed person lands on and highlights that message.
4. If built: opening it as a person without access shows no content.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A link must respect conversation ownership and workspace rules (SYS-authorization-and-workspaces).
- [inferred] The existing highlightMessage parameter can be the landing half of a link feature.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Copy link to message' action that produces the existing highlightMessage address.
- [proposed] Decide whether multi-person conversations are in scope before designing the author label; today a conversation has one owner.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WebChatPage highlight effect | `apps/web/features/chat/pages/WebChatPage.tsx` | Scrolls to and outlines the message named in highlightMessage (lines 5088-5120). |
| hook | useSearchJumpHighlight | `apps/web/features/chat/hooks/use-text-match-highlight.ts` | Text match highlight after a search jump (selector '[data-message-id]', line 9). |
| component | MessageBubble data-message-id | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Gives each message an addressable attribute (line 2572). |
| component | Past-chat citation link | `apps/web/features/chat/components/messages/__tests__/CitationPastChats.test.tsx` | Test of links to /chat/<id>?highlightMessage=<id> (line 18). |
| screen | Mobile chat screen highlight | `apps/mobile/app/(app)/chat/[id].tsx` | Reads the highlight parameter and passes highlightMessageId (lines 280-281,2628). |
| table | web_conversations | `apps/web/db/neon` | Single owner per conversation through user_id (see 0037_rls_user_isolation.sql); no participant list found. |
| table | web_messages | `apps/web/db/neon/0037_rls_user_isolation.sql` | Messages inherit isolation through the conversation; no author column (comment line 93). |
| table | shared_conversations | `apps/web/db/neon/0021_shared_conversations.sql` | Token-addressed read-only snapshot of messages_json; not a group chat. |
| screen | WebChatPage conversation view | `apps/web/features/chat/pages/WebChatPage.tsx` | Builds a conversation with participants: [] (line 863). |
| test | WebChatPage highlight-message test | `apps/web/features/chat/pages/__tests__/WebChatPage.highlight-message.test.tsx` | Tests the highlightMessage landing. |
| test | new-chat-entry test | `apps/web/features/chat/lib/new-chat-entry.test.ts` | Asserts highlightMessage does not start a new chat (line 45). |
| test | MessageBubble citation link test | `apps/web/features/chat/components/messages/MessageBubble.test.tsx` | Asserts the href with highlightMessage (line 524). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs for the planned feature. | device | no code found |
| Existing internal path: a link with highlightMessage opens the chat; the page waits for messages, reveals the target if it is a hidden variant, scrolls, outlines, then removes the query parameter. | device | apps/web/features/chat/pages/WebChatPage.tsx:5088-5120 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No new data for this feature | none | not applicable | not applicable |
| Message ids used by the internal link | web_messages.id | Server data | Kept with the conversation. |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable for the unbuilt feature. The existing highlight link opens a chat page that needs the owner's sign-in [inferred from per-user conversation queries]. |
| Permissions | Conversation access is per owner (user_id) in the queries opened; group or sharing permissions for messages: none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none; not model related. |
| Provider restrictions | none found in the code. |
| Local mode | Not applicable. A Local conversation has one owner on one device; the Tauri build has no link or author code found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Link to a message not yet loaded | Existing highlight waits until messages are loaded. | WebChatPage.tsx:5092 |
| Link to a hidden edit variant | revealMessage moves the path to the variant first. | WebChatPage.tsx:5093-5097 |
| Crafted message id | Matched by dataset value, not inserted into a selector string. | WebChatPage.tsx:1084-1092 |
| Message missing | No element is found and the effect returns with no message to the person. | WebChatPage.tsx:5098-5099 |
| Group author, loading, error, offline, retry, accessibility | not handled in the code; the feature does not exist. | searches found no author or copy-link code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/pages/__tests__/WebChatPage.highlight-message.test.tsx`: The internal highlightMessage landing (existing behaviour, not the planned feature).
- `apps/web/features/chat/components/messages/__tests__/CitationPastChats.test.tsx`: Past-chat citation links with highlightMessage.
- `apps/web/features/chat/lib/new-chat-entry.test.ts`: highlightMessage alone does not start a new chat.

**Test scenarios**

- **Confirm no author label**
  1. Open a shared or normal chat on every app.
  2. Look for a name on user messages.
  - Expected: No author label appears; this confirms the item is not built.
- **Confirm no copy-link action**
  1. Open '...' on a message on web.
  2. Look for a link action.
  - Expected: No such action.
- **Existing highlight landing**
  1. Open /chat/<id>?highlightMessage=<messageId> for a real message.
  - Expected: The page scrolls to the message, outlines it for about 2 seconds, then the parameter is removed.
- **Bad id**
  1. Open the same address with a non-existing id.
  - Expected: Page opens with no highlight and no error message.

**Where to look when it fails**

- No log lines. For the existing highlight inspect the query parameter and the data-message-id attributes.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)

## 10. Gaps and dependencies

- **Group author identity is not built and the data model has a single owner per conversation.** Affects: All six apps. Evidence: brief S16.21 missing on all; web_messages has no author column (0037_rls_user_isolation.sql:93); participants: [] (WebChatPage.tsx:863). Work needed: Decide scope, add participants and an author field, and render and announce it.
- **No way to copy a link to one message.** Affects: All six apps. Evidence: brief S16.22; no copy-link action found in MessageBubble.tsx. Work needed: Add an action that builds the highlightMessage address and respects access rules.
- **The brief gives no status for web and desktop S16.22, though web has an internal highlight link.** Affects: Brief accuracy. Evidence: WebChatPage.tsx:5088-5120. Work needed: Update the brief.
- **Mobile reads a highlight parameter but no creation path was checked.** Affects: Mobile. Evidence: apps/mobile/app/(app)/chat/[id].tsx:280-281. Work needed: Inspect the mobile route and link opening.
- Not built on: Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- table:web_conversations
- table:web_messages
- table:shared_conversations
- file:apps/web/features/chat/pages/WebChatPage.tsx

## Unknown

- Whether any product decision says group chats are planned (nothing found under docs/product or docs/decisions in a keyword search for branch, queue and draft only).
- Whether desktop or mobile can create a message link (not found).
- How the Tauri desktop handles highlight links.
- What 'S16.22 web and desktop' should read in the brief.
- Whether workspace or organization accounts imply several human participants (organization_id exists on conversations; participant model unknown).

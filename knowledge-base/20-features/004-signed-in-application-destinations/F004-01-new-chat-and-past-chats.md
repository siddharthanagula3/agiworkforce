---
id: "F004-01"
type: "feature"
title: "New chat and past chats"
aliases: ["New-chat home", "Existing conversation", "/chat", "/chat/[sessionId]", "/agi-work (signed-in)", "New chat (mobile drawer)", "S4.01", "S4.02", "WebChatRoot"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.01", "S4.02"]
depends_on: ["SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-model-catalog-and-routing", "SYS-shared-ui-and-design", "table:web_conversations", "table:web_messages", "api:GET /api/chat/conversations", "api:GET /api/chat/conversations/{id}"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-01 New chat and past chats

The place where a signed-in person starts a fresh chat with a ready composer, or reopens an earlier chat to read it and carry on. On web the same chat page serves /chat, /chat/<id> and, for signed-in people, /agi-work with Work mode on. Mobile, CLI, VS Code and Chrome have their own versions.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.01](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s401), [S4.02](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s402).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives every app one starting point for conversations: an empty chat with a composer, and a way to reopen a saved chat with its transcript so the person can keep going. On web both routes render one component, WebChatRoot, so a link and the sidebar land in the same place (apps/web/app/chat/page.tsx:13, apps/web/app/chat/[sessionId]/page.tsx:13).

**Why it exists.** A chat product must open ready to type and must let people return to past work. Competing products (ChatGPT, Claude) open on an empty composer and list past chats in a sidebar [inferred from the product context given].

**Who uses it.** Every signed-in person on the Web, Desktop (which shows the hosted web app), Mobile, CLI, VS Code and Chrome apps.

**Problems it solves**

- No dead end after sign-in: the person always lands on a usable composer.
- Past chats can be reopened from a list or from a link.
- A deep link can pre-fill a draft or switch on Work mode (q, from, mode parameters).
- The browser tab shows the chat title.

**Use cases**

- Open agiworkforce.com signed in and type a first question.
- Click an old chat in the sidebar and ask a follow-up.
- Follow a link such as /chat?q=... that opens a new chat with a draft in the composer.
- Start 'agi' in a terminal for a new session or run 'agi --session <id>' to resume one.

## 2. User experience

**Where to find it**

- Web: /chat for a new chat; /chat/<id> for an old one; clicking a chat in the sidebar goes to /chat/<id>; for a signed-in person /agi-work is rewritten to /chat with Work mode on (apps/web/proxy.ts:128-130, apps/web/proxy.ts:209).
- Desktop: the Electron window shows the hosted web app, so it is the same /chat page (AGENTS.md section 5; apps/desktop/electron/config.ts:10-12).
- Mobile: drawer row 'New chat' (packages/ui/i18n/locales/en/common.json drawer.newChat; apps/mobile/src/features/drawer/components/DrawerContent.tsx:655) and chats in the drawer list; a chat opens at apps/mobile/app/(app)/chat/[id].tsx.
- CLI: 'agi' starts the terminal UI for a new session; '--session <id>' or '-r/--resume <id>' resumes one; '-c/--continue' continues the newest session in the project; 'agi session list' and 'agi session show <id>' (apps/cli/src/lib.rs:246-298, apps/cli/src/lib.rs:1931-1980).
- VS Code: commands 'Code: New Conversation' (agi-workforce.newConversation, keybinding ctrl/cmd+n when chat is focused) and 'Code: Open Conversation' (apps/extension-vscode/package.json:192,355,1521-1529).
- Chrome: side panel; a new chat shows the label 'New chat' until the first message, after which it is saved on the device or mirrored to the account (apps/extension/src/side_panel.ts:595-615).

**Before you start**

- Web, Desktop, Mobile cloud mode: a signed-in account (identity session cookie or token).
- Mobile Local mode: no account is needed to chat on the device [inferred from Local-mode code paths in apps/mobile/stores/chat/chatViewStore.ts:262-330 that search on-device stores]; sign-in rules for Local are unknown.
- CLI: sessions are files on the device; account features need 'agi login'.

**Screens and controls**

- Web: composer, sidebar list of chats, chat title in the browser tab.
- Web error states: error.tsx shows ChatFailureNotice with a retry callback (apps/web/app/chat/error.tsx:12-30); not-found.tsx shows 'Conversation not found' with 'Start a new chat' (apps/web/app/chat/not-found.tsx:21).
- Mobile: 'New chat' row, 'Search' icon in the drawer header, 'Recents' and 'Pinned' chat rows.
- CLI: start view with key hints, status line, 'Workspace' pane.

**Journey**

1. 1. Person signs in and opens /chat (web) or taps 'New chat' (mobile).
2. 2. The page loads the chat shell; a loading skeleton shows first (ChatLoadingSkeleton, apps/web/features/chat/components/WebChatRoot.tsx:12-15).
3. 3. If the link carries q, from or mode=agiwork, the draft and Work mode are applied once and the parameters are removed from the address (apps/web/features/chat/hooks/use-new-chat.ts:20-36).
4. 4. Person types in the composer and sends; the app creates the conversation and moves to /chat/<id> [inferred from WebChatPage.tsx:2615-2680 where a conversation id is created and set].
5. 5. To reopen an old chat the person clicks it; the page loads the transcript; if loading fails a toast with the message appears and the app returns to /chat (apps/web/features/chat/pages/WebChatPage.tsx:2369-2384).
6. 6. The person continues the chat with the composer.

**What the person sees and gets**

- Tab title is the chat title, or a new-chat title for /chat (apps/web/lib/server/conversation-title.ts:32-41; apps/web/app/chat/page.tsx:7).
- Toast with the load error and a retry action when a chat cannot be opened (WebChatPage.tsx:2376-2383).
- Inline notice for a load failure of the displayed conversation (WebChatPage.tsx:7923).

**Settings**

- Mobile: Local or Cloud mode switch in the drawer (DrawerContent.tsx:431-440).
- Composer Chat or Work mode toggle (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:314-341).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web /chat and /chat/<id> both render WebChatRoot, which loads WebChatPage with no server render and a skeleton (apps/web/features/chat/components/WebChatRoot.tsx:12-27).
- Web page title for /chat/<id> is read server side from web_conversations for the signed-in owner, and returns null if the id is not a UUID or the row is deleted (apps/web/lib/server/conversation-title.ts:11-30).
- Signed-in /agi-work is rewritten to /chat and /chat reads the x-agi-pathname header to start in Work mode (apps/web/proxy.ts:112-130, apps/web/app/chat/page.tsx:9-15).
- New-chat deep link parameters q, from, mode are parsed and applied once; the draft is cut at 2000 characters (apps/web/features/chat/lib/new-chat-entry.ts:38,69-78; use-new-chat.ts:20-36).
- Opening /chat/<id> loads the conversation unless it is already in memory; on failure the person is sent back to /chat with an error toast (WebChatPage.tsx:2357-2384).
- Mobile has a 'New chat' row, a chat route, and separate lists for Local and Cloud chats (DrawerContent.tsx:442-457,655).
- CLI resumes sessions with --session, --resume and --continue, and lists them with 'agi session list' (apps/cli/src/lib.rs:246-298,5586-5645).
- VS Code registers newConversation, openConversation, forkConversation and deleteConversation commands (apps/extension-vscode/src/core/commandSetup.ts:1392-1475,1725).

**Incomplete**

- The brief says a missing or deleted chat shows a not-found or error state. The web code instead toasts and redirects to /chat; app/chat/not-found.tsx exists but I did not find what triggers it for a chat id (not-found.tsx:21 vs WebChatPage.tsx:2369-2384).
- Chrome status in the brief is 'done' but I did not open the Chrome history list code beyond the sync label function (side_panel.ts:595-615); how a past chat is reopened there is not verified.

**Present but disconnected or switched off**

- Marketing page apps/web/app/agi-work/page.tsx is shown only to signed-out visitors; signed-in visitors never see it because of the proxy rewrite (proxy.ts:112-130).

**Not available**

- Desktop has no separate Local chat: the Electron shell treats every chat request as Managed Cloud (apps/desktop/electron/config.ts:10-12).
- Web has no Local mode [inferred from the same constraint and from web_conversations being the only store seen].

## 4. Required behaviour

**Established requirements**

- A signed-in user lands on or opens an empty new-chat screen with a ready composer from which a new conversation starts. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.01)
- Opening a past conversation from the list or a link shows its transcript and lets the user continue it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.02)
- Local, own-key and Cloud are separate trust boundaries; nothing may silently route a Local chat to BYOK or managed cloud. (source: AGENTS.md section 6)
- packages/ui/unified-chat is shared by desktop, web, Chrome and VS Code, so it may not assume one surface's routing or billing. (source: AGENTS.md section 5)

**Acceptance criteria**

1. Signed in on web, visiting /chat shows an empty transcript and a focused, usable composer.
2. Visiting /chat/<id> of an own chat shows its messages and a working composer; the tab title equals the chat title.
3. Visiting /chat/<id> of a deleted or foreign id does not show the chat, shows an error message and returns the person to /chat.
4. Signed in, visiting /agi-work shows the /chat page with the composer in Work mode; signed out it shows the marketing page.
5. A link /chat?q=hello pre-fills the draft once and the q parameter is removed from the address.
6. Mobile: tapping 'New chat' opens an empty chat; tapping a chat in the drawer opens its transcript.
7. CLI: 'agi --session <id>' opens the saved session with its history.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The composer must accept input while an old chat is still loading or must show the loading skeleton [inferred from ChatLoadingSkeleton use].
- Mobile Local chats and Cloud chats must stay in separate lists (drawer filters by execution mode, DrawerContent.tsx:449-457).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether not-found.tsx should be shown for an unknown chat id and update the brief or the code so they agree.
- [proposed] Add one test that opens /chat/<unknown uuid> end to end and asserts the exact message and redirect.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | New chat route | `apps/web/app/chat/page.tsx` | Server page; reads x-agi-pathname to decide Work mode; renders WebChatRoot |
| screen | Existing chat route | `apps/web/app/chat/[sessionId]/page.tsx` | Renders WebChatRoot and sets title from conversationMetadata |
| component | WebChatRoot | `apps/web/features/chat/components/WebChatRoot.tsx` | Shared root: finishChatHandoff, useNewChatEntry, dynamic WebChatPage |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Main chat page: URL id, conversation load, send, search dialog param, Work mode init |
| hook | useNewChatEntry | `apps/web/features/chat/hooks/use-new-chat.ts` | Applies deep-link draft and Work mode once, then strips parameters |
| service | new-chat-entry | `apps/web/features/chat/lib/new-chat-entry.ts` | Builds and parses /chat?q=&from=&mode= links |
| service | conversationMetadata | `apps/web/lib/server/conversation-title.ts` | Reads owner chat title for the tab title under row-level security |
| config | Proxy rewrites | `apps/web/proxy.ts` | Rewrites signed-in / and /agi-work to /chat and sets x-agi-pathname |
| screen | Chat error boundary | `apps/web/app/chat/error.tsx` | Last-resort error screen with retry |
| screen | Chat not-found | `apps/web/app/chat/not-found.tsx` | 'Conversation not found' with link to start a new chat |
| endpoint | Conversation read/update/delete | `apps/web/app/api/chat/conversations/[id]/route.ts` | GET/PUT/DELETE one conversation |
| endpoint | Conversation list | `apps/web/app/api/chat/conversations/route.ts` | Paged list used by sidebar |
| table | web_conversations | `apps/web/lib/server/conversation-title.ts` | Row per chat; title read here |
| screen | Mobile chat tab | `apps/mobile/app/(app)/(tabs)/chat.tsx` | New chat screen and send handling |
| screen | Mobile chat by id | `apps/mobile/app/(app)/chat/[id].tsx` | Open existing chat |
| component | DrawerContent | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | 'New chat' row, Local/Cloud mode switch, pinned and recent chat lists |
| command | CLI session flags and session subcommand | `apps/cli/src/lib.rs` | --session, --resume, --continue, 'agi session ...' |
| screen | CLI terminal UI | `apps/cli/src/tui/tui_app.rs` | Start view and session screens |
| command | VS Code conversation commands | `apps/extension-vscode/src/core/commandSetup.ts` | newConversation, openConversation, fork, delete |
| screen | Chrome side panel | `apps/extension/src/side_panel.ts` | New chat label, local or mirrored history |
| test | Chat route tests | `apps/web/app/chat/[sessionId]/page.test.tsx` | Tests the [sessionId] page |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web request for /chat or /agi-work passes the proxy, which checks the identity session and, for signed-in /agi-work, rewrites to /chat. | our servers | apps/web/proxy.ts:112-130,209 |
| For /chat/<id> the server reads the chat title for the owner under row-level security and sets the tab title. | our servers | apps/web/lib/server/conversation-title.ts:11-41 |
| The browser loads WebChatPage (client only) and applies deep-link draft and Work mode. | device | apps/web/features/chat/components/WebChatRoot.tsx:12-27; use-new-chat.ts:20-36 |
| The page loads the transcript of /chat/<id> from the account unless it is already in memory. | device and our servers | WebChatPage.tsx:2357-2384 (loadConversation); endpoint file apps/web/app/api/chat/conversations/[id]/route.ts:590 [inferred that loadConversation calls it] |
| A sent message is processed by the chat turn pipeline and a model provider chosen by routing. | our servers | SYS-chat-turn-pipeline; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts (not opened here) |
| Mobile Local mode keeps chats in on-device stores and searches them on the device. | device | apps/mobile/stores/chat/chatViewStore.ts:279-330 |
| CLI reads and writes session files on the device. | device | apps/cli/src/lib.rs:5586-5645 (ManagedSessionStore user_config) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and messages (web, mobile cloud, desktop) | table:web_conversations and table:web_messages in our database | Yes, across web, desktop and mobile cloud mode (same API) | Soft delete sets deleted_at; restorable for a recovery window (apps/web/lib/resources/lifecycle-sql.ts:58-62) |
| Draft and composer toggles for a pending chat | browser store (PENDING_CONVERSATION_KEY in web-chat-store) | No | Cleared when sent or reloaded [inferred]; unknown exact lifetime |
| Mobile Local chats | device store (useChatMessageStore) | No: 'Local Mode chats never leave the device' (apps/mobile/src/features/conversation-actions/useConversationActions.ts:109-112) | Until the person deletes them; details unknown |
| CLI sessions | session files in the user config directory | Not by this feature | Kept until deleted; archive hides, delete removes the file (apps/cli/src/lib.rs:1931-1975) |

**Models and providers.** Opening a chat does not call a model. Sending the next message does, and which model and provider answer is decided by the chat turn pipeline and routing (SYS-chat-turn-pipeline, SYS-model-catalog-and-routing). The composer shows the model picker; no model is named by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop and Mobile Cloud mode require a signed-in account (proxy identity session; mobile checks isClerkSignedIn). CLI chat can run without an account; cloud features need 'agi login'. Mobile Local sign-in rule: unknown. |
| Permissions | A chat is only readable by its owner (user_id and organization scope in the title query, conversation-title.ts:19-25). Organization workspace chats are scoped by organization_id. |
| Subscription | Opening and continuing chats is in the Free plan: managed_chat, projects and cloud_sync list 'free' (packages/contracts/types/src/billing-catalog.ts:322-352). Work mode needs the agi_work capability (pro and above, billing-catalog.ts:354). |
| Limits and metering | Sending a message is metered by the chat pipeline (SYS-subscriptions-entitlements-and-usage). Opening a chat itself: none found in the code. |
| Feature flags | Mobile FEATURES.cloudChat is true (apps/mobile/lib/v1FeatureFlags.ts:3). Web: none found for the route itself. |
| Model compatibility | None found in the code for opening a chat; sending depends on the selected model's catalog entry (SYS-model-catalog-and-routing). |
| Provider restrictions | None found for opening a chat. |
| Local mode | Web and Desktop have no Local chat. Mobile Local mode lists and opens on-device chats separately from Cloud chats and they never leave the device. CLI sessions are device files. Whether mobile Local needs sign-in: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton while WebChatPage loads | WebChatRoot.tsx:12-15 |
| Chat id unknown, deleted, or load fails | Toast with the error, app returns to /chat, chat shown nowhere | WebChatPage.tsx:2369-2384 |
| Render error in the page hooks | error.tsx replaces the page with a failure notice and retry; an error while rendering the transcript is caught lower so the shell stays | apps/web/app/chat/error.tsx:5-30 |
| Non-UUID id in the tab title | Title lookup returns null; title falls back | conversation-title.ts:11-13 |
| Title read fails | Warning logged, null returned | conversation-title.ts:27-30 |
| Deep link draft over 2000 characters | Truncated to 2000 characters | new-chat-entry.ts:38,71 |
| Reload after deep link | Parameters were stripped, so the draft is not applied twice | use-new-chat.ts:13-18,31-35 |
| Offline or reconnect on web | not handled in the code I opened for this route | nothing found in WebChatPage.tsx:2357-2400 |
| Signed out | Proxy sends to sign-in; /agi-work shows marketing page | proxy.ts:136, 209 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/[sessionId]/page.test.tsx`: The /chat/[sessionId] page and its metadata (contents not opened)
- `apps/web/app/chat/__tests__/error.test.tsx`: The chat error boundary (name only)
- `apps/web/app/chat/__tests__/NewChatDeepLink.test.tsx`: New-chat deep link handling (name only)
- `apps/web/features/chat/lib/new-chat-entry.test.ts`: Building and parsing new-chat links (name only)
- `apps/web/features/chat/pages/__tests__/WebChatPage.auto-title.test.tsx`: Chat auto-title on the page (name only)
- `apps/cli/src/sessions.rs`: Inline tests of CLI session storage, search and archive (e.g. line 1645, 1707)

**Test scenarios**

- **Open new chat on web**
  1. Sign in
  2. Open /chat
  - Expected: Empty transcript, composer ready, tab shows the new-chat title
- **Reopen an old chat**
  1. Click a chat in the sidebar
  2. Wait for load
  3. Send a follow-up
  - Expected: URL is /chat/<id>, transcript shown, reply streams, tab title equals chat title
- **Unknown chat id**
  1. Open /chat/00000000-0000-0000-0000-000000000000
  - Expected: Error toast with the load message and return to /chat
- **Work mode link**
  1. Signed in, open /agi-work
  2. Check the composer mode
  - Expected: Chat page appears with Work selected; signed out shows marketing page
- **Deep link draft**
  1. Open /chat?q=hello
  - Expected: Draft 'hello' in composer once; q removed from the address; reload does not refill it
- **CLI resume**
  1. Run 'agi session list'
  2. Run 'agi --session <id>'
  - Expected: Saved history appears and the session continues

**Where to look when it fails**

- Browser console '[chat] render error' from error.tsx
- Server log 'Could not read the conversation title for its tab'
- Toast text from getConversationLoadError()
- Table web_conversations (deleted_at, user_id, organization_id)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)
- Chrome: [70-qa/test-plans/chrome/004-signed-in-application-destinations.md](../../70-qa/test-plans/chrome/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Not-found behaviour differs from the brief: the code redirects with a toast.** Affects: Web and Desktop. Evidence: WebChatPage.tsx:2369-2384 vs not-found.tsx:21. Work needed: Decide the intended state and align code, tests and brief
- **Offline or reconnect handling for opening a chat not found.** Affects: Web, Desktop. Evidence: No handling seen in WebChatPage.tsx:2357-2400. Work needed: Confirm and add or document
- **Chrome and VS Code reopen paths not verified in this review.** Affects: Chrome, VS Code. Evidence: Only command registration seen (commandSetup.ts:1392-1399). Work needed: Read the history list code and add a test
- **No test found that covers the Work-mode rewrite from /agi-work.** Affects: Web. Evidence: No test file named for the proxy rewrite was found in this review (search was by name only). Work needed: Add a proxy test

**Depends on**

- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-model-catalog-and-routing
- SYS-shared-ui-and-design
- table:web_conversations
- table:web_messages
- api:GET /api/chat/conversations
- api:GET /api/chat/conversations/{id}

## Unknown

- What triggers apps/web/app/chat/not-found.tsx for a chat id.
- Whether web offline or reconnect is handled when opening a chat.
- How Chrome and VS Code reopen a past chat and show its transcript (not read).
- Sign-in requirement for mobile Local mode.
- Exact lifetime of the pending draft in the browser store.
- Contents of the listed existing tests (only names and locations known).

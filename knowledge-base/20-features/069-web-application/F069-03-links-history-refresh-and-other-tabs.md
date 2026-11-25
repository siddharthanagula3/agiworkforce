---
id: "F069-03"
type: "feature"
title: "Links, history, refresh and other tabs"
aliases: ["URL-addressable conversations", "History", "Refresh restoration", "Multi-tab", "/chat/<id>", "S69.03", "S69.04", "S69.05", "S69.16"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (1 of 3)", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.03", "S69.04", "S69.05", "S69.16"]
depends_on: ["surface:web", "mode:cloud", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "table:web_conversations", "store:browser localStorage", "F069-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-03 Links, history, refresh and other tabs

Every web conversation has its own address, /chat/<id>. A new chat starts at /chat and takes its address on the first send. Back, Forward and reload return to the same conversation, and an unsent draft comes back after reload. Other tabs do not live-update, but a tab re-reads its open chat when it regains focus.

Area: [69. Web application](README.md). Requirement items: [S69.03](../../10-requirements/capabilities/069-web-application.md#s6903), [S69.04](../../10-requirements/capabilities/069-web-application.md#s6904), [S69.05](../../10-requirements/capabilities/069-web-application.md#s6905), [S69.16](../../10-requirements/capabilities/069-web-application.md#s6916).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 3) |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Ties the open conversation to the browser address so links, history and reload work, and keeps the draft in browser storage (apps/web/features/chat/pages/WebChatPage.tsx:2354-2375; apps/web/features/chat/components/Composer/composer-draft-storage.ts).

**Why it exists.** People expect to copy a link, press Back, and reload without losing their place. The brief requires each conversation to have a URL, history to work and reload to restore the conversation and draft (doc: knowledge-base/data/area-briefs/069-web-application.md S69.03 to S69.05).

**Who uses it.** All signed-in web users.

**Problems it solves**

- Lost place on reload.
- No way to share a link to a conversation with yourself on another device.
- Lost typed text when the page reloads.

**Use cases**

- Reload a long chat and continue.
- Open a saved /chat/<id> link on another computer.
- Press Back from a chat to the previous page.
- Open a second tab on the same chat and see new messages when switching to it.

## 2. User experience

**Where to find it**

- surface:web: the browser address bar and Back and Forward buttons; sidebar conversation list (WebChatPage.tsx:4807-4813).
- Artifact links use the address query ?artifact=<id> (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:283-290).

**Before you start**

- Signed in. The conversation must belong to the account.

**Screens and controls**

- Sidebar list rows push a history entry (WebChatPage.tsx:4807-4813).
- 'New chat' pushes /chat (WebChatPage.tsx:4778).

**Journey**

1. Click a conversation in the sidebar; the address becomes /chat/<id> (WebChatPage.tsx:4812).
2. Or start at /chat, type, send; the address is replaced with /chat/<id> (WebChatPage.tsx:2679, 5792, 6711).
3. Press Back or Forward; the page loads the conversation the address names (WebChatPage.tsx:2358-2375).
4. Reload; the conversation and draft return (composer-draft-storage.ts; ChatComposerNew.tsx:4150-4165).
5. Open /chat/<id> in a new tab; the chat loads from the server.

**What the person sees and gets**

- If the address names a conversation that cannot be loaded, an error toast shows the message or 'Couldn't load this conversation. Check your connection and try again.' and the page goes back to /chat (WebChatPage.tsx:2366-2381).

**Settings**

- Temporary chat settings affect whether a chat is saved (WebChatPage.tsx:2459-2470); not traced further.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- New chat stays at /chat with nothing saved until first send (WebChatPage.tsx:2354-2356).
- First send creates the conversation and replaces the address with /chat/<id>; replace, not push, so Back leaves the page (WebChatPage.tsx:2679, 5792, 6711).
- Opening a conversation from the sidebar pushes history (WebChatPage.tsx:4807-4813).
- Loading from the address when the conversation is not already in local state, and a failure path with toast and redirect to /chat (WebChatPage.tsx:2358-2381).
- The artifact panel re-reads ?artifact=<id> on popstate (ArtifactsPanel.tsx:636-639).
- Draft kept in localStorage keyed by a per-tab owner id kept in sessionStorage; earlier owner ids are copied forward and, after a reload, retired (composer-draft-storage.ts:60-95, 146-200).
- Tab focus or visibility re-fetches the open conversation at most once per 2 seconds, unless it is streaming or loading (WebChatPage.tsx:567, 2329-2345; apps/web/lib/hooks/useConversations.ts:877-890).
- Unread-count store syncs across tabs on the browser storage event (apps/web/shared/stores/unread-conversations-store.ts:63).

**Incomplete**

- No live sync of messages between tabs. The brief marks multi-tab n/a, but the focus refresh above is a partial form (WebChatPage.tsx:2329-2345).

**Present but disconnected or switched off**

- An offline queue and sync manager exist (apps/web/lib/offline/offlineQueue.ts, offlineSync.ts); only OfflineIndicator.tsx imports offlineSync. Whether chat sends use the queue is unknown.

**Not available**

- Cross-tab live message sync, rename or create propagation (brief S69.16 says not applicable anywhere).

## 4. Required behaviour

**Established requirements**

- Each conversation has its own URL (/chat/<id>), a new chat gets that URL after the first send, and opening the URL loads that conversation. (source: S69.03)
- Opening conversations pushes browser history, and Back/Forward reloads the conversation the URL names. (source: S69.04)
- Reloading restores the open conversation from its URL and the unsent composer draft. (source: S69.05)
- Several open tabs stay consistent: a chat created, renamed or answered in one tab appears in the others (brief status: not applicable anywhere). (source: S69.16)
- Interaction modes carry the draft and the conversation resumes in the same conversation. (source: packages/contracts/types/src/interaction-modes.json:78-85)

**Acceptance criteria**

1. At /chat send a first message; the address becomes /chat/<id> and the page does not reload.
2. Reload on /chat/<id>; the same conversation shows.
3. Type text without sending and reload; the text is back.
4. Click chat A then chat B then Back; chat A shows.
5. Open /chat/<unknown id>; an error toast shows and the address becomes /chat.
6. Answer in tab 1; switch to tab 2 on the same chat; the new answer appears within a few seconds.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A draft is private to a tab family: a brand-new tab gets a new owner id and does not see another tab's draft [inferred from composer-draft-storage.ts:146-200].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide the S69.16 requirement: the brief says not applicable, the code does a partial refresh. Either record the focus refresh as the rule, or add live sync.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | /chat/[sessionId] route | `apps/web/app/chat/[sessionId]/page.tsx` | Renders the chat for an id and builds the page title. |
| screen | WebChatPage URL logic | `apps/web/features/chat/pages/WebChatPage.tsx` | Route init effect, first-send address replace, sidebar push, focus refresh. |
| hook | useConversations | `apps/web/lib/hooks/useConversations.ts` | loadConversation, refreshOpenConversation, createConversation. |
| store | Composer draft storage | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | localStorage drafts, per-tab owner id in sessionStorage. |
| component | ChatComposerNew draft restore | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Reads and writes the draft on arrival and leave (lines 4150-4170). |
| component | ArtifactsPanel deep link | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | ?artifact= and popstate. |
| store | Unread conversations store | `apps/web/shared/stores/unread-conversations-store.ts` | Cross-tab unread sync by storage event. |
| service | Conversation title metadata | `apps/web/lib/server/conversation-title.ts` | Server-side page title for /chat/<id> (imported by the route). |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Table that holds conversations (queried at lines 82-90); table definition file not traced. |
| test | Draft tabs test | `apps/web/features/chat/components/Composer/composer-draft-storage.tabs.test.ts` | Per-tab draft rules. |
| test | Draft persistence test | `apps/web/features/chat/components/Composer/ChatComposerNew.draftPersistence.test.tsx` | Draft saved. |
| test | Draft restore test | `apps/web/features/chat/components/Composer/ChatComposerNew.draftRestore.test.tsx` | Draft restored. |
| test | Unread store test | `apps/web/shared/stores/unread-conversations-store.test.ts` | Unread count store. |
| test | Session page test | `apps/web/app/chat/[sessionId]/page.test.tsx` | Conversation route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The route /chat/<id> renders the chat page; the page reads sessionId from the address. | device | WebChatPage.tsx:1141 |
| If the conversation is not in local state, the client asks the server for it. | our servers | WebChatPage.tsx:2358-2366; useConversations.ts loadConversation |
| On first send the client creates the conversation on the server and replaces the address. | device and our servers | WebChatPage.tsx:2679, 5792 |
| The composer reads or writes the draft in browser storage. | device | composer-draft-storage.ts:207-217 |
| On focus or visibility the open chat is re-read from the server. | device and our servers | WebChatPage.tsx:2329-2345 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and messages | Server database | Yes, read on demand | Until deleted or archived by the person |
| Draft text | store:browser localStorage (key prefix agi-composer-draft), owner id in sessionStorage | No | Empty text kept as a tombstone; cleared on send; sign-out cleanup is mentioned in a code comment (composer-draft-storage.ts:119-125) |
| Unread counts | Browser storage with storage events | Across tabs of one browser | unknown |

**Models and providers.** Not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the conversation is read for the signed-in user only (the code-runs route filters by user_id, route.ts:82-90; the read route for loading was not opened). |
| Permissions | Conversation ownership, enforced on the server [inferred from the owner filter in the code-runs query]. |
| Subscription | none found in the code |
| Limits and metering | Focus refresh is limited to one every 2 seconds (WebChatPage.tsx:567). |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | A local-model turn starts as a temporary chat and a project start is refused with a toast (WebChatPage.tsx:2459-2470). Address behaviour for local chats beyond this is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | /chat is the empty surface. | WebChatPage.tsx:2354-2356 |
| Loading | Conversation loads from the server; a transcript pending state exists. | WebChatPage.tsx:6858 isConversationTranscriptPending |
| Error: unknown or unreadable conversation | Toast with the message and an action to retry; address replaced with /chat. | WebChatPage.tsx:2366-2381 |
| Streaming | Focus refresh skips a chat that is streaming or loading. | useConversations.ts:880-886 |
| Tab hidden | Refresh runs only when the tab is visible. | WebChatPage.tsx:2333 |
| Storage blocked | Draft functions return empty or false without throwing. | composer-draft-storage.ts:25-36, 188-205 |
| Reload | Drafts of earlier owner ids are copied; after a reload they are removed. | composer-draft-storage.ts:66-95, 166-172 |
| Duplicate send | A same-content send in flight is suppressed. | WebChatPage.tsx:2476-2480 |
| Offline | not handled in the code for URL loading beyond the load error toast. | WebChatPage.tsx:2366-2381 (the only failure path found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/composer-draft-storage.tabs.test.ts`: Draft rules across tabs and reloads.
- `apps/web/features/chat/components/Composer/ChatComposerNew.draftPersistence.test.tsx`: Draft saved while typing.
- `apps/web/features/chat/components/Composer/ChatComposerNew.draftRestore.test.tsx`: Draft restored on arrival.
- `apps/web/shared/stores/unread-conversations-store.test.ts`: Unread store.
- `apps/web/app/chat/[sessionId]/page.test.tsx`: Conversation route.
- `apps/web/features/chat/pages/__tests__/ChatRoute.test.tsx`: Chat route.
- `apps/web/e2e/chat-run-recovery.spec.ts`: Recovering a run in the browser.

**Test scenarios**

- **First send address**
  1. Open /chat.
  2. Send a message.
  - Expected: Address becomes /chat/<id> with no full reload.
- **Reload with draft**
  1. Open a chat.
  2. Type without sending.
  3. Reload.
  - Expected: Same chat and same draft.
- **Back and Forward**
  1. Open chat A, then chat B from the sidebar.
  2. Press Back, then Forward.
  - Expected: A then B.
- **Bad id**
  1. Open /chat/00000000-0000-0000-0000-000000000000.
  - Expected: Error toast and address becomes /chat.
- **Second tab refresh**
  1. Open the chat in two tabs.
  2. Send in tab 1.
  3. Switch to tab 2.
  - Expected: New messages appear after the focus refresh, no earlier.

**Where to look when it fails**

- Toast text 'Couldn't load this conversation...'.
- Server logs for the conversation read route (path not traced).
- Browser storage keys starting agi-composer-draft.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **No live cross-tab message sync; the brief calls multi-tab not applicable but the code refreshes on focus.** Affects: Users with several tabs. Evidence: WebChatPage.tsx:2329-2345. Work needed: Choose and record the rule; add tests for the focus refresh.
- **The draft is per tab owner, so a fresh tab does not see the draft typed in another tab.** Affects: Users who open a link in a new tab. Evidence: composer-draft-storage.ts:146-200 [inferred]. Work needed: Decide if that is wanted.
- **Offline queue code exists with unclear link to chat sends.** Affects: Offline users. Evidence: apps/web/lib/offline/offlineSync.ts imported only by OfflineIndicator.tsx. Work needed: Trace and either connect or remove.

**Depends on**

- surface:web
- mode:cloud
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- table:web_conversations
- store:browser localStorage
- F069-01

## Unknown

- Which API route and table definition serve conversation reads for /chat/<id>.
- How long drafts stay and what removes them at sign-out.
- Whether the offline queue is used by chat sends.
- Behaviour when a conversation is deleted in another tab.

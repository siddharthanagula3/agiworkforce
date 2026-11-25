---
id: "F090-04"
type: "feature"
title: "Automatic chat titles"
aliases: ["Conversation-title generator (S90.06)", "Automatic chat title", "Auto-title", "Provisional title", "conversation_title"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.06"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "F090-01", "F090-03", "mode:cloud", "table:web_conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-04 Automatic chat titles

A new chat first gets a title cut from the first question on the server. Then a model may write a short title in the background and replace it, but only if the title is still the cut one. Titles for temporary and on-device-model chats stay on the device. The person can rename at any time.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.06](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9006).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a new chat a readable title in two stages: a cut of the first question (50 characters plus ...) saved with the message, then a model-written title of at most 60 characters saved if the title is unchanged (apps/web/lib/chat-title.ts:7-26; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:169-208; generate-title.ts:324-346).

**Why it exists.** So the sidebar is readable without typing a name and never shows a blank row (generate-title.ts:3-11).

**Who uses it.** Everyone who starts a chat; engineers maintaining titles and cost.

**Problems it solves**

- Untitled rows in the sidebar.
- A slow or failing provider blocking message save (the title runs after the response).
- A background title overwriting a name the person typed.

**Use cases**

- Send a first question; the sidebar shows the cut question, then a short title within seconds.
- Rename right after; the generated title does not replace it.
- Use a temporary chat; the title is cut on the device only.

## 2. User experience

**Where to find it**

- Web sidebar and chat header title (apps/web/features/chat/components/ConversationTitleMenu.tsx:140-155).
- Mobile list and chat header; mobile auto-title code was not found in the files read (unknown).
- Rename: web menu item Rename; mobile menu Rename with a field labelled Chat title (apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx:267).

**Before you start**

- Cloud chat with a first user question.
- A model title also needs a managed utility route admitted for the account.

**Screens and controls**

- Title text in sidebar and header; rename field; no switch to turn automatic titles off was found.

**Journey**

1. Person sends the first question.
2. Server stores the message and, if this is the chat's first activation, sets the title to the cut question.
3. Server schedules title generation after the response (Next after()).
4. Web also polls the server for the title after the first answer: reads at 0, 1200 and 3000 ms and adopts a non-placeholder title unless the person renamed (apps/web/features/chat/pages/WebChatPage.tsx:565, :5046-5068).
5. If the server gave no title, the web writes its own 60-character cut with an expectedTitle guard (WebChatPage.tsx:5069-5075).
6. The sidebar updates to the generated title.

**What the person sees and gets**

- No toast. Failures only log a warning; the cut title stands (generate-title.ts:353-358).
- Title is plain text: markdown markers, quotes and control characters are stripped and it is capped at 60 characters with an ellipsis (generate-title.ts:68-81).

**Settings**

- None found. Title cap 500 characters applies to renames (conversation-contract.json:2).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server cut title at first activation of the chat, only if no earlier user question and no assistant answer exists (persist-message.ts:169-197; apps/web/lib/chat-title.ts:21-26).
- Model title in the background through a managed utility route, with a 24-token output cap, temperature 0, input limited to 4000 characters (generate-title.ts:47-52, :135-158).
- Exact-response cache for titles, bypassed for temporary chats (generate-title.ts:160-182).
- Usage lease under quota feature conversation_title, with a reservation, completion or failure record (generate-title.ts:54, :187-252, :279-299).
- Update guarded: title replaced only if it equals the server cut or the web's 60-character cut (generate-title.ts:324-346).
- Content with a detected leak or secret skips generation (generate-title.ts:127-133).
- Web keeps the title on the device for temporary chats and for chats using a model on the device (WebChatPage.tsx:5036-5039, :5071-5073).

**Incomplete**

- The model title is skipped when the chat's model key is a provider offering in the model catalog (persist-message.ts:199). What these offerings are in product terms was not established (unknown).
- Mobile and other apps: no auto-title code found in the mobile files opened beyond a userTitlePending guard that protects a typed title (apps/mobile/services/cloudSyncEngine.ts:124, :532, :557).

**Present but disconnected or switched off**

- Generation does nothing when admission is refused (generate-title.ts:144).

**Not available**

- Regenerate title control: not found.
- Automatic titles on CLI, Chrome and VS Code: not found in opened files (unknown).

## 4. Required behaviour

**Established requirements**

- S90.06: a new conversation gets a short model-generated title after its first message, without overwriting a title the user set. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.06)
- A slow or failing provider must not delay or break sending a message. (source: apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:13-16)
- Temporary chats stay out of history and search. (source: apps/web/lib/temporary-chat-policy.ts:9-33)

**Acceptance criteria**

1. After the first question the title is the cut question (50 characters plus ... when longer).
2. Within a few seconds a short generated title replaces it when generation is admitted.
3. A title renamed by the person before generation finishes is kept.
4. A failing provider leaves the cut title and saves the message.
5. A temporary chat or a chat answered by a device model never gets a server generated title.
6. Generated titles contain no markdown, quotes or line breaks and are at most 60 characters (plus an ellipsis).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Title generation spends managed-route budget for Free accounts through the free-trial window (apps/web/lib/services/background-usage-lease.ts:45-70), not the daily chat and message counts.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Regenerate title action.
- [proposed] Show in the knowledge base which models are provider offerings and why titles are skipped for them.
- [proposed] Port the title step to mobile Cloud chats if absent.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | generateAndPersistTitle / scheduleConversationTitleGeneration | `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts` | Background model title, cache, usage lease, guarded update. |
| service | persistConversationMessage | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Sets the cut title and schedules the model title. |
| config | chat-title | `apps/web/lib/chat-title.ts` | Cut rules: 50 characters server, 60 client. |
| service | background-usage-lease | `apps/web/lib/services/background-usage-lease.ts` | Reserves usage for background calls; Free plan uses the free-trial window. |
| service | managed-cloud-routing admission | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Chooses a utility route for the title call. |
| service | exact-response cache | `apps/web/lib/services/exact-response-cache-service.ts` | Caches the title result by input. |
| screen | WebChatPage auto-title effect | `apps/web/features/chat/pages/WebChatPage.tsx` | Polls the server title and falls back to a client cut. |
| endpoint | PUT /api/chat/conversations/[id] (expectedTitle) | `apps/web/app/api/chat/conversations/[id]/route.ts` | Rename with an expectedTitle guard. |
| schema | conversation-contract.json | `packages/contracts/cloud-contracts/src/conversation-contract.json` | Title max length. |
| test | generate-title tests | `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.test.ts` | Routing, cache and failure behaviour. |
| component | RenameConversationModal | `apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx` | Mobile rename. |
| service | mobile cloudSyncEngine userTitlePending | `apps/mobile/services/cloudSyncEngine.ts` | Protects a title the person typed on mobile from a pull. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server marks the chat activated on the first user message and writes the cut title. | our servers | persist-message.ts:41-55, :169-197 |
| If the chat's model is not a catalog provider offering, title generation is queued with after(). | our servers | persist-message.ts:199-207; generate-title.ts:368-377 |
| The job checks content for leaks, asks for a utility route, looks up the cache. | our servers | generate-title.ts:127-182 |
| On a cache miss it reserves usage, calls the chosen provider through a server adapter, records completion, stores the cache entry. | outside service | generate-title.ts:187-278 |
| It updates the title only where the title equals one of the two known cut values. | our servers | generate-title.ts:324-346 |
| Web reads the server title at 0, 1200 and 3000 ms and applies it unless the person renamed. | device | WebChatPage.tsx:565, :5046-5068 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The title | web_conversations.title | Yes | With the chat. |
| First question text (up to 4000 characters) sent to a provider | Not stored by the titler; held by the provider per its terms (not established here) | No | Exact-response cache entry for the input is stored by exact-response-cache-service; retention not opened (unknown). |
| Usage record type conversation_title | background usage lease records | Server only | Not opened (unknown). |

**Models and providers.** The utility route and provider are chosen by managed Cloud admission, not by the chat's model (generate-title.ts:135-145). Provider chosen at run time: unknown. A none-effort setting is applied when the route allows it (:157).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; Cloud chat. |
| Permissions | Owner scope; admission may refuse the account. |
| Subscription | Not a Free daily chat or message count. The title uses a background usage lease with quota feature conversation_title (generate-title.ts:54, :192-212); on Free the lease starts a free-trial request and is refused with free_trial_token_budget_reached if the windows cannot cover it (background-usage-lease.ts:45-70). When refused the cut title stays (generate-title.ts:213-219). Paid plan branch of the lease not opened (unknown). |
| Limits and metering | 24 output tokens; 4000 input characters; 60 title characters; 60 second lease (generate-title.ts:47-52, :209-210). |
| Feature flags | None found in the code. |
| Model compatibility | Skipped when the chat's model is a catalog provider offering (persist-message.ts:199). |
| Provider restrictions | Route comes from the utility admission policy; own-key routes are not used for titles here (not established beyond the admission call). |
| Local mode | With a model on this device selected, a temporary chat, or a chat holding device turns, the web page does not read a server title and sets its own cut title locally (WebChatPage.tsx:5036-5039, :5071-5073). Where a device-model chat title is stored: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Provider failure | Warning logged; the cut title stays; reservation released. | generate-title.ts:279-299 |
| Empty or unusable output | Warning conversation_title_unusable; the title is kept. | generate-title.ts:309-321 |
| Usage refused | Warning; cut title kept. | generate-title.ts:213-219 |
| Title changed meanwhile | Update affects no row; info log; person's title kept. | generate-title.ts:347-352 |
| Regenerate or edit of the only question | Title is not set again when an earlier user question or an answer exists. | persist-message.ts:172-196 |
| Retry scheduling twice | Second run finds the title changed and does nothing; usage key is title:<conversationId>. | generate-title.ts:91-96, :197 |
| Offline | Not handled for the server step; the web falls back to its own cut title. | WebChatPage.tsx:5069-5075 |
| Accessibility | Title is plain text; header button labelled Conversation options. | ConversationTitleMenu.tsx:140 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.test.ts`: Utility route request, no provider call when admission refuses, cache integration, none-effort handling, empty cached results, route adapter mapping.
- `apps/web/app/api/chat/conversations/[id]/messages/route.activation.test.ts`: Activation stamp, title from the activating question, title kept on regenerate or edit of synced chats, per-chat scoping.
- `apps/web/app/api/chat/conversations/[id]/route.concurrency.test.ts`: Automatic title written only over the expected title; owner title kept.

**Test scenarios**

- **First question titles the chat**
  1. Start a Cloud chat on web.
  2. Send a 100-character first question.
  3. Watch the sidebar for 10 seconds.
  - Expected: First a 50-character cut with ..., then a short title of up to 60 characters.
- **Rename wins**
  1. Send a first question.
  2. Rename immediately.
  3. Wait 10 seconds.
  - Expected: Your title stays.
- **Temporary chat**
  1. Open a temporary chat.
  2. Send a first question.
  - Expected: The question is not saved; no server title generation.
- **Provider failure**
  1. Make the utility route unavailable in a test environment.
  2. Send a first question.
  - Expected: Message saved; cut title remains; warning in logs.
- **Device model**
  1. Select a model on the device.
  2. Send a first question.
  - Expected: Title is set on the device only.

**Where to look when it fails**

- Log tags: [conversation-title] generation failed; keeping the truncated title, [conversation-title] usage reservation refused, conversation_title_unusable.
- Error code free_trial_token_budget_reached.
- Column web_conversations.title and activated_at.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Mobile and other apps have no confirmed auto-title step of their own; they depend on the server path after sync or save.** Affects: Mobile, CLI, Chrome, VS Code.. Evidence: no title generation code found outside apps/web in files opened. Work needed: Search mobile cloud turn code and record how a title appears.
- **Model titles are skipped for chats whose model is a catalog provider offering; reason not documented.** Affects: Chats on those models.. Evidence: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:199. Work needed: Document or remove the condition.
- **The draft says title generation counts against the daily allowance; it uses a usage lease instead.** Affects: Documentation, Free users.. Evidence: apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:187-212. Work needed: Use the corrected wording.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- F090-01
- F090-03
- mode:cloud
- table:web_conversations

## Unknown

- Which provider and model serve the title call (chosen at run time).
- What provider offerings are in product terms and why titles skip them.
- Paid-plan branch of the background usage lease.
- Retention of exact-response cache entries.
- Mobile, CLI, Chrome, VS Code title paths.
- Where a device-model chat title is stored on web.

---
id: "F017-04"
type: "feature"
title: "Follow-up suggestions"
aliases: ["Follow-up suggestions", "Suggested follow-ups", "Related questions", "Show follow-up suggestions in chats", "S17.14"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S17.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations", "api:POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups", "table:web_messages"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-04 Follow-up suggestions

After a finished answer the app can offer up to three short next questions. On web they are written by a model on our servers and saved on the message, but they show only for turns that searched, because a code default is off. Mobile shows them in Cloud chats. CLI has none.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.14](../../10-requirements/capabilities/017-assistant-message-components.md#s1714).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers up to three next questions under the latest answer so the person does not have to type.

**Why it exists.** Leading products offer related questions after a searched answer (comment at ChatMessageList.tsx:1428-1430).

**Who uses it.** People who want a quick next step.

**Problems it solves**

- Blank-box problem after an answer
- Keeping research chats moving

**Use cases**

- Tap a suggestion on mobile to send it.
- On web, tap a suggestion to place it in the composer.
- Turn suggestions off in General settings.

## 2. User experience

**Where to find it**

- Web and Desktop: a row of pill buttons under the last answer, group label Follow-up suggestions (apps/web/features/chat/components/FollowUpSuggestions.tsx; ChatMessageList.tsx:2013-2028). Setting: General, Show follow-up suggestions in chats (apps/web/features/settings/sections/GeneralSection.tsx:626-638).
- Mobile: list labelled Suggested follow-ups, each button labelled Ask: <text> (apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx, near lines 128-140).
- CLI, Chrome, VS Code: no follow-up chip row found.

**Before you start**

- Web: setting on (default true, apps/web/shared/stores/web-settings-store.ts:135), turn finished, last answer over 20 characters, not failed, and either the answer searched or the code default is on (ChatMessageList.tsx:1466-1474).
- Mobile: Cloud conversation, not temporary, finished clean answer, no research metadata, composer empty (apps/mobile/app/(app)/chat/[id].tsx:1367-1377, 2593).

**Screens and controls**

- Web pills have a dismiss control (FollowUpSuggestions.tsx, dismissed state).
- Mobile has a dismissed state per message (mobile FollowUpSuggestions.tsx).

**Journey**

1. Answer finishes.
2. The app asks the server once for suggestions for that message (or uses stored ones).
3. Pills appear.
4. Web: tap puts the text in the composer (wired via setComposerPrefill, WebChatPage.tsx:7762). Mobile: tap sends it (handleFollowUp calls handleSend, chat/[id].tsx:1016-1018).

**What the person sees and gets**

- If generation fails or is refused, web falls back to a keyword matcher (FollowUpSuggestions.tsx, deriveFollowUps).
- On mobile, the same fallback applies once the fetch settles (mobile FollowUpSuggestions.tsx).

**Settings**

- Web General setting Show follow-up suggestions in chats; stored in web-settings-store.ts:80,135 and synced by CloudSettingsSync.tsx.
- Mobile: no follow-up toggle found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server route generates and caches suggestions per message (apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts).
- Web hook requests once per turn (apps/web/features/chat/hooks/use-generated-follow-ups.ts:14-70).
- Web UI and setting exist (FollowUpSuggestions.tsx; GeneralSection.tsx:626).
- Mobile footer fetches the same endpoint and stores suggestions into the message (apps/mobile/src/features/chat/services/followUps.ts; apps/mobile/stores/chat/chatMessageStore.ts:1095-1107).

**Incomplete**

- Web default FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT is false, so suggestions show only after a searched turn (ChatMessageList.tsx:1104, 1431-1435, 1468).
- Mobile works for Cloud chats only.

**Present but disconnected or switched off**

- Web general switch-on is off by a code constant (ChatMessageList.tsx:1104).

**Not available**

- CLI: none found. Chrome and VS Code: no chip row found; Chrome has a model-written followups answer block instead (apps/extension/src/features/side-panel/markdown.ts:443), a different mechanism. VS Code followUpBehavior (queue or steer) is about queued messages, not suggestions (webviewContent.ts:139).

## 4. Required behaviour

**Established requirements**

- After an answer the product offers relevant follow-up prompts the user can pick. (source: brief S17.14)
- Unfinished: change the default constant to true to switch on (deploy step follow-ups on). (source: brief S17.14)

**Acceptance criteria**

1. On web after a searched turn, up to three pills appear under the last answer.
2. After reload, the same suggestions appear without a new model call (cached on the message).
3. With the setting off, no pills appear.
4. In a temporary chat the server returns an empty list and no model call is made.
5. A failed turn shows no pills.
6. On mobile Cloud chat, tapping a pill sends it as the next message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Generation is metered: free plan uses the free-trial lease, others use a lease path not read [inferred from apps/web/lib/services/background-usage-lease.ts:44-60].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether the web default should be on for all answers, then flip the constant.
- [proposed] Add the same setting to mobile settings.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST follow-ups | `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts` | Authenticated, CSRF and rate-limited route; returns cached or new suggestions. |
| service | generateFollowUpSuggestions | `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts` | One utility model call: 160 output tokens, three questions, sanitising, usage lease (quota feature follow_up_suggestions). |
| hook | useGeneratedFollowUps | `apps/web/features/chat/hooks/use-generated-follow-ups.ts` | Asks once per message and keeps cached results. |
| component | FollowUpSuggestions (web) | `apps/web/features/chat/components/FollowUpSuggestions.tsx` | Pill row with keyword fallback. |
| component | ChatMessageList follow-up gate | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Default constant (1104), conditions (1465-1474), mount (2013). |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | followUpSuggestionsEnabled (default true). |
| component | General settings row | `apps/web/features/settings/sections/GeneralSection.tsx` | Switch labelled Show follow-up suggestions in chats. |
| service | deriveFollowUps | `packages/ui/unified-chat/src/lib/follow-ups.ts` | Shared keyword fallback used by web and mobile. |
| component | FollowUpSuggestions (mobile) | `apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx` | Fetches, caches, falls back, dismisses. |
| service | fetchFollowUpSuggestions | `apps/mobile/src/features/chat/services/followUps.ts` | POST to the same endpoint. |
| store | chatMessageStore rememberFollowUpSuggestions | `apps/mobile/stores/chat/chatMessageStore.ts` | Saves suggestions in message metadata (1095-1107). |
| table | web_messages | `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts` | Metadata key followUpSuggestions merged into the row (update statement). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client checks gates, then POSTs to the follow-ups route. | device | use-generated-follow-ups.ts:34-45 |
| Route checks sign-in, CSRF, rate limit, ownership; temporary chats return an empty list. | our servers | follow-ups/route.ts:20-50 |
| If suggestions are already on the message, they are returned. | our servers | route.ts:63-64 |
| Else the managed-cloud route is admitted, a usage lease is reserved, one non-streaming model call runs and output is sanitised to at most three lines. | our servers | generate-follow-ups.ts (admitManagedCloudRoute, reserveBackgroundUsage, sanitizeFollowUpSuggestions) |
| The model provider answers. | outside service | buildServerProviderAdapter(dispatchProvider).stream in generate-follow-ups.ts |
| Result is saved into message metadata if none exists and returned. | our servers | route.ts update statement near the end |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| followUpSuggestions list on the assistant message | web_messages.metadata (route.ts); mobile message metadata (chatMessageStore.ts:1107) | Web yes (server row). Mobile stores locally and the server also has it. | With the message; empty results are never cached (route.ts comment). |
| Usage record type follow_up_suggestions | Managed usage ledger via lease (table name not opened) | Server only | unknown |

**Models and providers.** The server picks a utility route through admission (kind utility) and the model effort option none when supported (generate-follow-ups.ts). Which model and provider serve it is decided by routing, not named here. No local or own-key path: the call always uses the managed route.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on the server route (getUserScopedDb). |
| Permissions | Conversation must belong to the user and be not deleted (route.ts query). |
| Subscription | Metered under quota feature follow_up_suggestions. A refused reservation returns no suggestions (generate-follow-ups.ts: logs a warning and returns an empty list); the UI then shows the keyword fallback. Per-plan amounts: unknown (not found in code searched). |
| Limits and metering | Idempotency key follow-ups:<messageId>, lease 60 seconds, max 160 output tokens, answer cut at 6000 characters, up to 8 source titles (generate-follow-ups.ts constants). Rate limit class chat-message (route.ts). |
| Feature flags | FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT = false (ChatMessageList.tsx:1104); user setting default true. |
| Model compatibility | Any model the utility route admits. |
| Provider restrictions | Managed cloud only. |
| Local mode | No server call in a Local chat; mobile shows suggestions only for Cloud conversations (chat/[id].tsx:1368). Web Local behaviour for this feature not confirmed; temporary chats get none. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web hides the row while generation is pending. | ChatMessageList.tsx:2013 (!followUpsPending) |
| Failure | Silent; keyword fallback still renders. | use-generated-follow-ups.ts comment in catch |
| Quota refused | Empty list, fallback pills. | generate-follow-ups.ts reservation catch |
| User typing | Web pills fade and ignore pointer. | FollowUpSuggestions.tsx isUserTyping |
| Message with unsynced edits (mobile) | Waits until the message is synced before asking. | mobile FollowUpSuggestions.tsx waitingToSync |
| Search unavailable | Pills that ask for web search are removed. | FollowUpSuggestions.tsx searchUnavailable |
| Truncated reply | Last cut line is dropped. | completeFollowUpLines in generate-follow-ups.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/FollowUpSuggestions.test.tsx`: deriveFollowUps guard clauses and topic patterns (test names read).
- `apps/web/features/chat/components/messages/__tests__/ChatMessageList.followUpFence.test.tsx`: Follow-ups in the list (from file name).
- `apps/mobile/src/features/chat/components/__tests__/FollowUpSuggestions.test.tsx`: Mobile pills (from file name).
- `apps/mobile/src/features/chat/services/__tests__/followUps.test.ts`: Mobile fetch service (from file name).
- `apps/web/e2e/composer-follow-up-and-shortcuts.spec.ts`: Browser spec mentioning follow-ups (from file name and grep hit).

**Test scenarios**

- **Searched turn**
  1. On web ask a question that uses web search.
  2. Wait for finish.
  - Expected: Up to three pills appear.
- **Cache on reload**
  1. Reload the chat after pills appeared.
  - Expected: Same pills, no new server generation.
- **Setting off**
  1. Turn off Show follow-up suggestions in chats.
  - Expected: No pills.
- **Plain answer on web**
  1. Ask a question without search.
  - Expected: No pills while the default constant is false.
- **Mobile tap**
  1. In a Cloud chat tap a pill.
  - Expected: It is sent as the next message.

**Where to look when it fails**

- Server log lines [follow-ups] usage reservation refused and [follow-ups] suggestions could not be cached on the turn.
- Audit registry entry for the route (apps/web/lib/services/audit-coverage/registry.ts:39).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **Web default is off; suggestions appear only after searched turns.** Affects: Web and Desktop. Evidence: ChatMessageList.tsx:1104, 1468. Work needed: Flip the constant when owners approve.
- **Brief says mobile missing; code shows it built for Cloud chats.** Affects: Brief accuracy. Evidence: chat/[id].tsx:2593. Work needed: Update the brief status.
- **No follow-ups on CLI, Chrome inline row, VS Code.** Affects: Those apps. Evidence: no chip row found. Work needed: Decide scope.
- **Draft said a tap sends on web; the code wires onSendMessage to setComposerPrefill.** Affects: Web testers. Evidence: WebChatPage.tsx:7762. Work needed: Confirm the behaviour in a live run.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations
- api:POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups
- table:web_messages

## Unknown

- Per-plan follow-up quota amounts and the paid-plan lease path (background-usage-lease.ts after line 60 not read).
- Whether a web tap sends or only fills the composer (prefill consumption not fully traced).
- Which model and provider the utility route picks.
- Whether Desktop Electron differs from web.

---
id: "F085-05"
type: "feature"
title: "Past-chat reference"
aliases: ["Past-chat reference (S85.06)", "Search past chats", "Search and reference chats", "Reference chat history", "searchPastChats", "referencePastChats"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S85.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "table:web_messages", "table:web_conversations", "table:user_settings", "F085-04", "F085-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-05 Past-chat reference

When switched on, the assistant can pull short excerpts from the person's other chats to answer a new question. Temporary chats are never used. It is off unless the person turns it on, needs memory not to be switched off, and is available on web, desktop and mobile; CLI and VS Code have none; Chrome is unknown.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.06](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8506).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Searches the person's earlier chats for text related to the new question and adds up to three short excerpts to the model request, with sources shown (apps/web/lib/services/past-chat-context-service.ts:459-493; apps/web/lib/services/__tests__/past-chat-context-service.test.ts:81).

**Why it exists.** Continuity without re-explaining, like Claude's chat search and ChatGPT's chat history reference (doc: docs/product/requirements.md:754-766).

**Who uses it.** Web, Desktop and Mobile users.

**Problems it solves**

- Having to paste earlier answers back in.
- Control: the person can turn it off, and temporary chats stay out.

**Use cases**

- Ask 'what did we decide about the budget last week?'
- Switch it off before a sensitive chat.
- Use in a project and see only that project's chats when account memory is off for it.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Memory > 'Search past chats' (apps/web/features/settings/sections/MemorySection.tsx:407-415).
- Mobile: Settings > Assistant > Memory > 'Search and reference chats' (apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:75).
- Chrome: no past-chat switch found in apps/extension/src (grep returned nothing); brief says done, so unknown.
- CLI and VS Code: none.

**Before you start**

- Signed in for Cloud chats; Mobile Local uses on-device history. Memory must not be switched off at the chat level (memoryEnabled !== false) (turn-context-service.ts:128-129).

**Screens and controls**

- Web switch with description 'Let the assistant look up excerpts from your other conversations when answering. Never used in temporary chats.' (MemorySection.tsx:408-415).
- Mobile switch 'Search and reference chats'.
- Citation list on web replies (apps/web/features/chat/components/messages/__tests__/CitationPastChats.test.tsx).

**Journey**

1. Turn on the switch.
2. Ask a question related to an earlier chat.
3. The reply may include a note and a list of source chats.
4. Turn off to stop.

**What the person sees and gets**

- Excerpts labelled with chat title and date and fenced as untrusted data (past-chat-context-service.test.ts:101).
- If the search fails a degraded notice replaces the excerpts (turn-context-service.ts:227-232).

**Settings**

- capabilities.searchPastChats; workspace context policy can withdraw it (turn-context-service.ts:189).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Eligibility: policy flag searchPastChats true, surface not api, memoryEnabled not false, chat not temporary, and a non-empty query (turn-context-service.ts:128-131).
- Read only the person's chats that are not deleted and not temporary, with a 90-day freshness window (past-chat-context-service.ts:36,255-259,344-348,522-525).
- Excerpts are chosen by relevance, at most three, with budgets of 600 characters per excerpt and 1500 in total (packages/platform/utils/src/pastChatContext.ts:4-5; test past-chat-context-service.test.ts:81,120).
- Project chats are confined to their own project when global memory is off for the project (past-chat-context-service.test.ts:53).
- Search and retrieval endpoints exclude temporary chats (apps/web/app/api/search/route.ts:324,375; apps/web/lib/services/retrieval-search-service.ts:270,363).
- Mobile Cloud: the server assembles it (chatExecutionStore.ts:2800); mobile Local searches on-device history with no network call (apps/mobile/__tests__/past-chat-context.test.ts:98).

**Incomplete**

- Chrome: brief says done; no control or code found by search.

**Present but disconnected or switched off**

- The reference is off unless stored searchPastChats is true (managed-memory-context-service.ts:278).

**Not available**

- CLI: missing (brief).
- VS Code: missing (brief).

## 4. Required behaviour

**Established requirements**

- The user can let the assistant search or reference other chats, switch it off, and temporary chats are never referenced. (source: S85.06 Should (brief))
- Temporary chats must not reference memory or past chats unless the user changes that. (source: doc: docs/product/requirements.md:765-766)
- Temporary chats are left out of search by is_temporary filters. (source: apps/web/lib/temporary-chat-policy.ts:13-23)

**Acceptance criteria**

1. With the switch off no excerpt is added.
2. With it on, a related question gets excerpts from other chats and not from the current chat.
3. A temporary chat is never an excerpt source and a temporary chat never receives excerpts.
4. Deleted chats are not used.
5. Total excerpt text stays within 1500 characters.
6. A failing search shows the degraded notice and the answer still arrives.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Archived chats are not excluded by the visible filters; unconfirmed.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the switch in CLI, VS Code and (if missing) Chrome, or state it is account-side only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | pastChatContextLoader | `apps/web/lib/services/past-chat-context-service.ts` | Loads and selects excerpts (line 459). |
| service | resolveInteractiveTurnContext | `apps/web/lib/services/turn-context-service.ts` | Eligibility rules (lines 124-131). |
| service | past chat formatting | `packages/platform/utils/src/pastChatContext.ts` | Budgets and formatting shared with mobile. |
| endpoint | GET /api/search | `apps/web/app/api/search/route.ts` | Search excludes temporary chats (lines 324,375). |
| service | retrieval search | `apps/web/lib/services/retrieval-search-service.ts` | Retrieval index excludes temporary chats (lines 270,363). |
| component | MemorySection switch | `apps/web/features/settings/sections/MemorySection.tsx` | Search past chats switch (line 408). |
| component | MemoryControlsCard | `apps/mobile/src/features/memory/components/MemoryControlsCard.tsx` | Mobile switch (line 75). |
| service | mobile pastChatContext | `apps/mobile/src/features/memory/services/pastChatContext.ts` | Local and Cloud retrieval on the phone (line 109). |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps referencePastChats to capabilities.searchPastChats (lines 160-170). |
| table | web_messages / web_conversations | `apps/web/lib/services/past-chat-context-service.ts` | Source rows (lines 255-259,518-525). |
| table | user_settings | `apps/web/lib/services/managed-memory-context-service.ts` | capabilities.searchPastChats (line 278). |
| test | past-chat-context-service tests | `apps/web/lib/services/__tests__/past-chat-context-service.test.ts` | Scope, budget, fencing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person switches Search past chats on; the capability is saved to the account. | device and our servers | MemorySection.tsx:408-415 |
| On a turn the server checks eligibility and builds search terms from the question. | our servers | turn-context-service.ts:128-131; past-chat-context-service.test.ts:70 |
| It reads matching messages from web_messages joined to web_conversations, excluding deleted and temporary chats. | our servers | past-chat-context-service.ts:255-259,522-525 |
| Best excerpts are fenced and added; sources are returned to show as citations. | our servers | turn-context-service.ts:225-250 |
| Mobile Local filters the on-device conversations and adds a fenced block. | device | mobile pastChatContext.ts:25-60,109-115; test past-chat-context.test.ts:98 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Excerpts for one turn | not stored beyond the request; a context manifest row is written for non-temporary turns | No | Manifest written by createPostgresContextManifestStore (turn-context-service.ts:198-210); retention not opened |
| Switch value | user_settings capabilities | Yes | Until changed |

**Models and providers.** Excerpts go to whatever model answers. The excerpt fencing treats chat text as untrusted [inferred from the test title].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needed for Cloud; not for Mobile Local. |
| Permissions | Only the person's own chats; organisation context policy can disable the source (turn-context-service.ts:189). |
| Subscription | none found in the code in the files read. |
| Limits and metering | Three excerpts, 600 characters each, 1500 total, 90-day window. |
| Feature flags | capabilities.searchPastChats. |
| Model compatibility | Not model-specific. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local searches only on-device chats and never calls the network; Cloud never falls back to Local history (past-chat-context.test.ts:136). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Search failure | Degraded notice replaces excerpts; turn continues. | turn-context-service.ts:226-232 |
| Empty query | No search. | turn-context-service.ts:131; test past-chat-context-service.test.ts:70 |
| Temporary chat | Never searched or referenced. | turn-context-service.ts:130; past-chat-context-service.ts:256 |
| Switch off | Mobile returns immediately without reading history. | mobile/__tests__/past-chat-context.test.ts:86 |
| Offline | Mobile Cloud uses only authenticated cache or search; no further offline handling found. | apps/mobile/__tests__/past-chat-context.test.ts:136 (Cloud uses authenticated search or cache, never Local history) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/past-chat-context-service.test.ts`: Scoped to user, current chat excluded, no query no read, three excerpts, fencing and labels, budget.
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary chats excluded from list reads and title search.
- `apps/mobile/__tests__/past-chat-context.test.ts`: Relevance, bounded fenced output, disabled returns early, Local on device, Cloud never falls back to Local.
- `apps/web/features/chat/components/messages/__tests__/CitationPastChats.test.tsx`: Past-chat citations display (title only).

**Test scenarios**

- **Reference works**
  1. Turn on Search past chats
  2. In chat A discuss a unique codeword
  3. In new chat B ask about the codeword
  - Expected: Answer uses chat A with a citation.
- **Temporary excluded**
  1. Discuss a codeword in a temporary chat
  2. Ask in a normal chat
  - Expected: Not found.
- **Switch off**
  1. Turn the switch off
  2. Repeat the question
  - Expected: No excerpts.
- **Mobile Local offline**
  1. Local mode, airplane mode
  2. Ask about an earlier Local chat
  - Expected: Excerpt used, no network call.

**Where to look when it fails**

- Log 'A context source failed to load; the turn continues without it' with sourceClass past_chat.
- Context manifest rows for the turn.
- capabilities.searchPastChats value.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- Chrome: [70-qa/test-plans/chrome/085-personalization-and-data-settings.md](../../70-qa/test-plans/chrome/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **CLI and VS Code cannot reference past chats.** Affects: CLI, VS Code. Evidence: S85.06 brief. Work needed: Add or document.
- **Chrome status unverified: no control found.** Affects: Chrome. Evidence: search of apps/extension/src returned no match. Work needed: Verify the Chrome surface value and add a control or link.
- **Whether archived chats may be referenced is unconfirmed.** Affects: All. Evidence: filters at past-chat-context-service.ts:255-259 show deleted and temporary only. Work needed: Decide the rule.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- table:web_messages
- table:web_conversations
- table:user_settings
- F085-04
- F085-06

## Unknown

- Whether Chrome sends a surface that lets the server use past chats and how the Chrome switch is shown.
- Whether archived chats are searched.
- Retention period of the context manifest.
- How the organisation context policy toggles are set.
- Exact label text of the web citation list.

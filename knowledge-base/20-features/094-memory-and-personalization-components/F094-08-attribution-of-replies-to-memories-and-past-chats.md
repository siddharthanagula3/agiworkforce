---
id: "F094-08"
type: "feature"
title: "Attribution of replies to memories and past chats"
aliases: ["Memory used", "Memory · N", "Show sources", "Manage memory", "memory citations", "x-agi-memory-citations", "personalization attribution", "Previous chats this answer used", "past-chat citations"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.18"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "api:POST /api/llm/v1/chat/completions", "api:GET /api/memory/local-context", "table:user_memories", "table:web_messages", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-shared-ui-and-design", "F094-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-08 Attribution of replies to memories and past chats

After a chat turn the server tells the app which saved memories it put in front of the model, and the app shows them: a 'Show sources' panel with 'Memory · N' on the web, a 'Memory · N' chip on mobile. Past chats used are listed too. The server sends the list in a response header, and the app saves it with the message.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.18](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9418).

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

**What it does.** Records which memories (and past chats) were placed in the model's context for a reply, so the person can see where an answer may have come from. The list is built from the memories actually loaded for the turn, then trimmed to what survived the final prompt fit (apps/web/lib/services/turn-context-service.ts:216-218; apps/web/app/api/llm/v1/chat/completions/lib/reference-citations.ts:68-77).

**Why it exists.** Recall is otherwise invisible. The past-chat component says so in its own comment: without it the reader cannot tell a remembered fact from an invented one (apps/web/features/chat/components/messages/CitationPastChats.tsx:15-19).

**Who uses it.** People who use memory and want to check or manage what shaped an answer; testers checking that memory is used only when allowed.

**Problems it solves**

- Trust: the person can see which memories were in play.
- Control: from the list the person jumps to memory settings ('Manage memory').
- Correctness: no memory is cited when memory was off, the chat was temporary, or the text was cut by the prompt fit.

**Use cases**

- Ask 'Plan my weekend' and see 'Memory · 2' showing a hiking preference.
- Open a past-chat link under an answer to check the claim at its source message.
- Turn memory off for a chat and confirm no memory list appears.
- Use a temporary chat and confirm no memory list appears.

## 2. User experience

**Where to find it**

- Web: under an assistant reply, the action bar button 'Show sources' (tooltip 'Sources', book icon) opens a side panel with a section headed 'Memory · N' and a 'Manage memory' button (apps/web/features/chat/components/messages/MessageBubble.tsx:3846-3858; apps/web/features/chat/components/research/ResearchPanel.tsx:156-196).
- Web past chats: a row of chips labelled by chat title and date under the reply, aria-label 'Previous chats this answer used' (apps/web/features/chat/components/messages/CitationPastChats.tsx:30-37).
- Mobile: a 'Memory · N' chip under the reply with a detail sheet and a 'Manage memory' button that opens Settings > Memory (apps/mobile/src/features/chat/components/MemoryUsedChip.tsx:14-16; MessageBubble.tsx:2785-2786).
- Desktop, CLI, VS Code and Chrome: no display of memory citations found (search of apps/desktop/src, apps/cli/src, apps/extension-vscode/src, apps/extension/src for memoryCitations returned nothing).

**Before you start**

- Memory on in settings and for the chat; not a temporary chat (turn-context-service.ts:121-124).
- A reply that actually had memories loaded for the turn.
- Cloud mode (managed chat) on web and mobile, or a browser-local web turn that fetched context from /api/memory/local-context (apps/web/lib/hooks/useChatStream.ts:4479-4503).

**Screens and controls**

- Web: 'Show sources' button; panel section 'Memory · N' with up to a few excerpts, 'And N more' when the list was shortened, and a 'Manage memory' button that opens settings (ResearchPanel.tsx:156-196).
- Mobile: 'Memory · N' chip (accessibility label 'Used one saved memory. Show which'), sheet with excerpts, 'Manage memory' button (MemoryUsedChip.tsx:36-62,140-143).

**Journey**

1. Send a chat message with memory on.
2. The server loads memories, adds them to the prompt and sends the list as a response header.
3. The app reads the header and attaches it to the assistant message.
4. After the reply finishes, tap 'Show sources' (web) or the 'Memory · N' chip (mobile).
5. Read the excerpts; choose 'Manage memory' to open memory settings.

**What the person sees and gets**

- Count and excerpts of up to 240 characters each (packages/contracts/types/src/memory-wire.ts:10).
- 'And N more' when some memories are counted but not listed (ResearchPanel.tsx:176-182).
- Past-chat chips link to the source conversation at the cited message (CitationPastChats.tsx:11-14).

**Settings**

- Memory switches and 'Search past chats' decide whether anything can be cited (managed-memory-context-service.ts:255-281).
- The per-chat memory toggle (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6133).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Citations are built from the memories the context engine admitted: one {id, excerpt} per admitted memory (apps/web/lib/services/turn-context-service.ts:213-218).
- The list is cut to what the final prompt fit kept; if none of the memory section was sent, the list is dropped (apps/web/app/api/llm/v1/chat/completions/lib/reference-citations.ts:48-77; request-processor.ts:6760-6772).
- Citations are put on the response as header 'x-agi-memory-citations' (packages/contracts/types/src/memory-wire.ts:9; apps/web/lib/chat-project-sources.ts:44-58) and the value is cut to fit a header limit, keeping the true count (chat-project-sources.ts:60-70).
- No citations when memory is off, the chat is temporary or the surface is the API without opt-in (turn-context-service.ts:70-73,121-124). The post-fit result is only included when non-empty (request-processor.ts:6888-6890).
- The free-plan path also emits the header (apps/web/lib/server/free-quota-turn.ts:1170,1318).
- Web client reads the header, stores it on the message and saves it into the message metadata (apps/web/lib/hooks/useChatStream.ts:2031-2036,2698-2702). Mobile does the same (apps/mobile/services/streaming.ts:740-741; apps/mobile/stores/chat/chatExecutionStore.ts:3466).
- Browser-local web turns compute citations from the local-context response, and only when the chat is not temporary and memory and personalization are on (packages/contracts/types/src/memory-wire.ts:197-211).

**Incomplete**

- The brief says the citation is stored with the assistant turn on the server. The server-side persistence file writes project-file citations but no memory citations (apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:300-340); the client saves them instead. Whether a turn the server persists alone (client gone) keeps the memory list is not shown in the code.
- The list is 'memories placed in the prompt', not 'memories the answer used'. The model may ignore some. [inferred]
- Past-chat citations are shown on web and mobile; memory citations on web and mobile only.

**Present but disconnected or switched off**

- none found.

**Not available**

- Desktop, CLI, VS Code and Chrome extension show no memory or past-chat citations (no code found).

## 4. Required behaviour

**Established requirements**

- Memory citations are built from the memories actually injected into the turn and stored with the assistant turn; none for memories not used. (source: S94.18 (brief); apps/web/lib/services/turn-context-service.ts:156 and 213-218)
- If memory was off or unavailable, no memory citations are recorded. (source: S94.18 (brief); turn-context-service.ts:121-124,322-327)
- A source whose text the final fit cut is not shown as one the answer used. (source: apps/web/app/api/llm/v1/chat/completions/lib/reference-citations.ts:57-65 (code comment))

**Acceptance criteria**

1. With memory on and 2 memories loaded, the reply shows 'Memory · 2' and the two excerpts.
2. With memory off for the chat, no memory list appears.
3. In a temporary chat no memory list appears.
4. With 'auto' suppressed, an auto memory is not listed.
5. When the memory section is cut off by the prompt fit, the list is absent.
6. After reload the list is still on the saved message (web and mobile).
7. 'Manage memory' opens memory settings.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The saved list should survive a reload on every app that shows it; this depends on message metadata being saved by the client. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Persist memory citations server side with the assistant turn so a client that disconnects keeps them.
- [proposed] Show the list on desktop and in the extensions, or document that they do not.
- [proposed] Show per-memory source (auto, web, desktop, mobile) in the list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveInteractiveTurnContext | `apps/web/lib/services/turn-context-service.ts` | Builds memories and memoryCitations for a turn |
| service | citationsSentAfterFit | `apps/web/app/api/llm/v1/chat/completions/lib/reference-citations.ts` | Drops citations whose text the final fit cut |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Takes citations from turn context (4342) and returns them after fit (6760-6772,6888) |
| service | chat-project-sources | `apps/web/lib/chat-project-sources.ts` | Encodes and decodes the citations header |
| config | memory-wire | `packages/contracts/types/src/memory-wire.ts` | Header name, excerpt length, citation types, parse and local turn helpers |
| service | free-quota-turn | `apps/web/lib/server/free-quota-turn.ts` | Free-plan path also sends the header |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Loads the memories whose ids become citation ids |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Web reads the header, stores it and saves it in message metadata |
| store | web-chat-store | `apps/web/shared/stores/web-chat-store.ts` | setMemoryCitations and message metadata |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Shows the 'Show sources' button when memory citations exist |
| component | ResearchPanel MemorySources | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Panel section 'Memory · N' and 'Manage memory' |
| component | CitationPastChats | `apps/web/features/chat/components/messages/CitationPastChats.tsx` | Past-chat chips with links |
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | pastChatCitation builds the past-chat citation |
| service | memoryCitations (mobile) | `apps/mobile/src/features/memory/services/memoryCitations.ts` | Reads the header and message metadata |
| service | streaming (mobile) | `apps/mobile/services/streaming.ts` | Calls onMemoryCitations after the response starts (740-741) |
| component | MemoryUsedChip | `apps/mobile/src/features/chat/components/MemoryUsedChip.tsx` | Mobile 'Memory · N' chip and sheet |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Renders the chip when not streaming (2785) |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Gives browser-local turns memory text and citations |
| service | assistant-turn-persistence | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Server-side turn save; does not write memory citations (checked) |
| table | web_messages | `apps/web/lib/hooks/useChatStream.ts` | Message metadata (memoryCitations) saved by the client through the messages API |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server loads memory and past chats for the turn and builds the prompt blocks and the citation list from the same admitted items. | our servers | apps/web/lib/services/turn-context-service.ts:105-239 |
| Final prompt fit is applied; citations whose text was cut are removed. | our servers | request-processor.ts:6760-6772; reference-citations.ts:68-77 |
| The list is encoded into the response header, shortened if too large. | our servers | apps/web/lib/chat-project-sources.ts:44-70 |
| The app reads the header on the first response bytes and puts it on the assistant message; the message is then saved with the list in metadata. | device | apps/web/lib/hooks/useChatStream.ts:2031-2036,2698-2702; apps/mobile/services/streaming.ts:740-741 |
| The person opens the panel or chip; 'Manage memory' opens memory settings. | device | ResearchPanel.tsx:186-193; MemoryUsedChip.tsx:140-143 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Citation list {count, memories:[{id, excerpt up to 240 chars}]} | Message metadata field memoryCitations in the app's chat store and, once the client saves the message, in the saved message | With the message when the message syncs; whether the server message API keeps the field is not shown in the files read | Lives and goes with the message; deleting the memory does not remove the excerpt from an old message [inferred] |

**Models and providers.** No model decides the citations. They are built before the model call from what was loaded. They work the same for any model or provider because they describe the prompt, not the answer.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for the managed chat path; the local-context endpoint needs a signed-in user (apps/web/app/api/memory/local-context/route.ts:21). |
| Permissions | Only the person's own memories, in their workspace and project scope, are loaded (managed-memory-context-service.ts:1170-1183). |
| Subscription | none found in the code for showing citations; free-plan turns also send them (apps/web/lib/server/free-quota-turn.ts:1318). |
| Limits and metering | At most 30 memories loaded; excerpt 240 characters; header size capped (managed-memory-context-service.ts:67; memory-wire.ts:10; chat-project-sources.ts:60-70). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code; independent of model. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile and desktop Local mode do not use account memory, so no account citations; no Local-mode citation code was found. Browser-local web turns do get citations from the server's local-context endpoint (memory-wire.ts:197-211). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Memory off or temporary chat | No memory loaded, no citations. | turn-context-service.ts:121-124 |
| Memory read fails | Turn continues without memory; no citations. | turn-context-service.ts:322-327 |
| Prompt too long, memory section cut | Citations dropped when none of the memory section was sent. | reference-citations.ts:48-56 |
| Header too large | Excerpts are removed one by one; count is kept; 'And N more' is shown. | chat-project-sources.ts:60-70; ResearchPanel.tsx:176-182 |
| Bad header value | Ignored (parse returns null). | apps/mobile/src/features/memory/services/memoryCitations.ts:18-24 |
| Continuation of a reply | Existing list is kept on a continuation, cleared on a fresh turn without one. | useChatStream.ts:2031-2038 |
| Streaming reply (mobile) | Chip hidden while the reply streams. | apps/mobile/src/features/chat/components/MessageBubble.tsx:2785 |
| Accessibility | Mobile chip has a descriptive label; web section is labelled 'Memory'. | MemoryUsedChip.tsx:36-40; ResearchPanel.tsx:160 |
| Offline / retry / cancel | not handled in the code for the citation display itself. | files in the map |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/reference-citations.test.ts`: Citations kept or dropped after the fit
- `packages/contracts/types/src/__tests__/memory-wire.test.ts`: Citation parsing, header and local turn context
- `packages/contracts/types/src/__tests__/past-chat-citations.test.ts`: Past-chat citation shape
- `apps/web/features/chat/components/research/ResearchPanel.memorySources.test.tsx`: Web Memory section of the sources panel
- `apps/web/features/chat/components/messages/MessageBubble.sources.test.tsx`: Web message sources button
- `apps/mobile/src/features/chat/components/__tests__/MemoryUsedChip.test.tsx`: Mobile chip
- `apps/mobile/__tests__/cloud-stream-finish-reason-and-error.test.ts`: Mobile streaming, including memory citation callback
- `apps/mobile/__tests__/PastChatCitations.test.tsx`: Mobile past-chat citations

**Test scenarios**

- **Memory cited**
  1. Save the memory 'I prefer vegetarian food'.
  2. Ask for dinner ideas on the web in Cloud mode.
  3. Open 'Show sources'.
  - Expected: A 'Memory · 1' section shows the excerpt.
- **No citation with memory off**
  1. Turn the composer memory toggle off.
  2. Send the same prompt.
  - Expected: No 'Show sources' memory section.
- **No citation in a temporary chat**
  1. Start a temporary chat and send the same prompt.
  - Expected: No memory list.
- **Reload persists**
  1. Reload the page after scenario 1.
  - Expected: The list is still on the message (client-saved metadata).
- **Mobile chip**
  1. Repeat scenario 1 on mobile in Cloud mode.
  2. Tap the chip and 'Manage memory'.
  - Expected: Sheet lists excerpt; settings memory opens.

**Where to look when it fails**

- Response header x-agi-memory-citations (base64 JSON) in the network tab.
- Span attribute retrieval.result_count on 'memory.context.load'.
- Message metadata field memoryCitations in the chat store.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Server does not persist memory citations with the assistant turn** Affects: Any client that disconnects before saving; desktop and extensions have no display at all. Evidence: assistant-turn-persistence.ts:300-340 has no memory field; brief item S94.18 claims storage there. Work needed: Add the field to server-side persistence or correct the brief.
- **No display on desktop, CLI, VS Code, Chrome** Affects: Those surfaces. Evidence: no memoryCitations in their source. Work needed: Build the display or record why not.
- **Citation means 'was in the prompt', not 'was used in the answer'** Affects: All users reading the list. Evidence: turn-context-service.ts:213-218. Work needed: Word the label accordingly or add a usage signal.

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- api:POST /api/llm/v1/chat/completions
- api:GET /api/memory/local-context
- table:user_memories
- table:web_messages
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-shared-ui-and-design
- F094-07

## Unknown

- Whether the messages API stores metadata.memoryCitations unchanged; the route was not read.
- Whether any desktop code renders memory citations from another package (packages/ui) was only searched by name.
- Whether the web panel is reachable when a reply has memory citations but no web sources: the action bar button depends on hasTurnSources, which includes memory (MessageBubble.tsx:2509), but the inline SourcesControl needs web sources (MessageBubble.tsx:3590).

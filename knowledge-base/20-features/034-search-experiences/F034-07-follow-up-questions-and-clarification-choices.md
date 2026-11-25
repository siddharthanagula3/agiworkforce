---
id: "F034-07"
type: "feature"
title: "Follow-up questions and clarification choices"
aliases: ["Follow-up suggestions", "Related questions", "Suggested follow-ups chips", "Follow-up query refinement (S34.21)", "Clarifying questions", "Clarify card", "clarify.v1", "ask_clarifying_questions tool", "Query clarification choices (S34.22)", "ask_user tool (CLI)"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S34.21", "S34.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "mode:cloud", "file:apps/web/features/chat/components/messages/ChatMessageList.tsx", "file:packages/ui/unified-chat/src/lib/follow-ups.ts", "file:apps/web/lib/services/clarify-tool-service.ts", "api:POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups", "api:POST /api/interactive-cards/respond", "api:POST /api/llm/v1/chat/completions", "table:web_messages", "table:web_conversations", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "F034-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-07 Follow-up questions and clarification choices

After a finished answer, the app can show up to three tappable next questions. When a short request is too vague, the assistant can show a choice card instead of guessing. Follow-ups run on Web, Desktop and Mobile (Cloud only). Choice cards run on Web, Mobile and Chrome. The CLI has a separate question tool.

Area: [34. Search experiences](README.md). Requirement items: [S34.21](../../10-requirements/capabilities/034-search-experiences.md#s3421), [S34.22](../../10-requirements/capabilities/034-search-experiences.md#s3422).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Two helpers that keep a chat moving. Follow-up suggestions show up to three short questions under the last answer; one tap sends it as the next message. The clarify card shows one to four questions, each with two to four options plus a free-text 'Something else' box, so the person answers by tapping instead of typing.

**Why it exists.** Leaders such as ChatGPT and Perplexity show related questions after a searched answer, and ask a quick choice question when a request has no usable default. The code comments say the same: a searched turn earns follow-ups, and an ambiguous request used to come back as prose asking the reader to describe the choice in words (apps/web/features/chat/components/messages/ChatMessageList.tsx:1428; apps/web/lib/services/clarify-tool-service.ts:210).

**Who uses it.** Anyone chatting on Web, the public Desktop (which shows the hosted web app), Mobile in Cloud mode, or the Chrome side panel. Developers on the CLI get the ask_user tool.

**Problems it solves**

- People do not know what to ask next after an answer.
- A vague one-line request such as a trip with no destination leads to a guess or a wall of questions in prose.
- Typing a reply on a phone is slow; a tap is faster.

**Use cases**

- After a web-searched answer about a product, tap 'Is it repairable?'-style follow-up to dig deeper.
- Type a bare 'plan my trip' and pick destination and budget from a card.
- On Mobile in Cloud mode, tap a suggested question under the answer while the composer is empty.
- In the CLI, the agent asks which of three options to take, and the person picks one in the terminal.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): chips in a group labelled 'Follow-up suggestions' under the last assistant answer, with a 'Hide' button (apps/web/features/chat/components/FollowUpSuggestions.tsx:111,148).
- Web and Desktop setting: Settings, General, switch 'Show follow-up suggestions in chats' (apps/web/features/settings/sections/GeneralSection.tsx:631).
- Mobile: a group labelled 'Suggested follow-ups' under the last answer, each chip labelled 'Ask: <text>', plus a 'Hide' button (apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx:130,141,150). No settings switch was found on Mobile.
- Web and Mobile clarify card: inside the assistant message; buttons 'Send answers' and 'I'll just type it', text box placeholder 'Something else…' (apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:188,209,217; apps/mobile/src/features/chat/components/ClarifyCard.tsx:70,303).
- Chrome side panel clarify card: same wording through localized strings 'Send answers', 'I'll just type it', 'Something else…' (apps/extension/_locales/en/messages.json:2104-2121).
- CLI: the agent tool ask_user prints 'Agent asks:' and a list of options plus 'Type your own answer' (apps/cli/src/features/exec/tools/task_registry/mod.rs:660-690).
- VS Code: neither feature found; its 'follow-up' words mean a queue of messages sent while a reply runs (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:345,597).

**Before you start**

- Signed in to the Cloud (managed) route: the follow-up route and the clarify tool both live behind the managed chat service (apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts:25; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1269).
- Web and Desktop: setting 'Show follow-up suggestions in chats' on (default on) (apps/web/shared/stores/web-settings-store.ts:135).
- Mobile: conversation in Cloud mode and not temporary (apps/mobile/app/(app)/chat/[id].tsx:1366).
- Clarify card: the chosen model must support tools, the reply must stream, and the message must pass the short-message test (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1276-1291).

**Screens and controls**

- Follow-up chip: one tap sends its text as the next user message (apps/web/features/chat/components/FollowUpSuggestions.tsx:118).
- 'Hide' button: hides the group for that answer on Web (dismissed state, line 94) and Mobile.
- Clarify card option buttons, a 'Something else…' text box per question, 'Send answers', and 'I'll just type it' (dismiss).
- CLI option picker with a last row 'Type your own answer'.

**Journey**

1. 1. Ask a question; the answer streams in. If it searched the web, Web marks the turn as searched.
2. 2. When the reply finishes and is longer than 20 characters and did not fail, Web asks the server for three questions grounded in the answer and its source titles; chips appear when they arrive.
3. 3. If the server gives nothing (temporary chat, refused, error), Web shows chips picked by a keyword matcher instead.
4. 4. Tap a chip; its text is sent as the next message.
5. 5. Separate path: send a short vague message. If the model decides it cannot go on, it calls the clarify tool and a card appears.
6. 6. Tick options or type in 'Something else…', press 'Send answers'; the answers go back as the next turn and the model continues.
7. 7. Or press 'I'll just type it' to decline and answer in your own words.

**What the person sees and gets**

- Chips fade in with a short stagger; they are hidden while the person is typing (Web) or while the composer has text (Mobile).
- After answering, the clarify card turns read-only and shows each answer, 'Skipped' or 'No answer'.
- A card that can no longer be answered says so: turn ended, turn failed or superseded by a newer message (Chrome strings spClarifyExpired*).
- A failed answer shows an error line: "Couldn't send that answer, the questions are still waiting for you." (apps/web/lib/hooks/useChatStream.ts:1354).

**Settings**

- Web and Desktop: followUpSuggestionsEnabled, synced to the account as 'followUpSuggestions' in the appearance settings (apps/web/features/settings/lib/appearance-namespace.ts:121,163).
- Web and Desktop: followUpBehavior Queue or Steer is a different feature (messages sent while a reply runs), not these suggestions (apps/web/features/settings/sections/GeneralSection.tsx:640).
- Mobile: none found for follow-up suggestions.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop (hosted web app): the chip row with Hide, the server generator and the keyword fallback are wired into the transcript (apps/web/features/chat/components/messages/ChatMessageList.tsx:2013).
- Server generation of exactly three questions, one model call per answer, cached on the message, with a quota reservation (apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts:24,158; apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts:65-110).
- Mobile (Cloud mode): chips, fetch, cache into the message metadata, keyword fallback after the fetch settles, and dropping chips that ask for a web search when search was unavailable (apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx:60-117; apps/mobile/stores/chat/chatMessageStore.ts:1095). The brief marks Mobile as missing; the code has it.
- Clarify tool on Web, Mobile and Chrome: the request advertises clarify.v1 support, the server adds the tool for short messages, executes it, persists the card and accepts the answer at the respond endpoint (apps/web/lib/hooks/useChatStream.ts:4590; apps/mobile/stores/chat/chatExecutionStore.ts:3442; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1581; apps/web/app/api/interactive-cards/respond/route.ts:198). The brief marks Mobile and Chrome as missing; the code has both.
- Rejection of format-only questions: a question is dropped only when every option is about format, tone, length, depth, style and similar, unless the user asked for choices (apps/web/lib/services/clarify-tool-service.ts:108,315).
- CLI ask_user tool: question with up to six options, approval kind, answers through the TUI broker, the app-server client, or the terminal (apps/cli/src/platform/runtime/tool_catalog.rs:793-815; apps/cli/src/features/exec/tools/task_registry/mod.rs:528-690).

**Incomplete**

- Web: the 'enableFollowUpSuggestions' prop defaults to false and no caller outside tests passes it, so in practice chips show only after a searched or research turn (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104,1226,1468). [inferred from searching for the prop in apps and packages]
- Mobile: never shown for research turns, only in Cloud mode, and with no user setting to turn them off (apps/mobile/app/(app)/chat/[id].tsx:1366-1376).
- CLI ask_user is not offered through the 'short message, no attachment' rule and is not a card; it is a plain terminal or TUI prompt (apps/cli/src/features/exec/tools/task_registry/mod.rs:528).
- The decision doc says an answerable clarify card is not built (apps/../docs/decisions/wire-or-cut.md:340); the code now has the respond endpoint and the tool, so that doc line is out of date. Code wins (AGENTS.md section 2).

**Present but disconnected or switched off**

- Web prop enableFollowUpSuggestions exists but is only set in tests (ChatMessageList.test.tsx:324; ChatMessageList.turnFailureNotice.test.tsx:43).
- The clarify tool is not offered for the desktop surface: the offer function allows only web, mobile and chrome, while the Electron shell sends the 'desktop' surface (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1276; apps/web/lib/device-steps/host-headers.ts:41-50). The brief says Desktop is done; the code says otherwise. [inferred; not run]

**Not available**

- Follow-up suggestions: CLI, VS Code and Chrome side panel (no suggestion code found; searched apps/cli, apps/extension, apps/extension-vscode).
- Clarify card: VS Code and CLI (the CLI has ask_user only). The server offer excludes the vscode and cli surfaces (request-processor.ts:1276).
- Follow-ups and clarify cards in Local mode on Mobile or Desktop: both depend on the managed Cloud route (see access_and_usage).

## 4. Required behaviour

**Established requirements**

- Follow-ups appear only if the user setting for follow-up suggestions is on, the last reply is longer than 20 characters, it is not generating or failed, and either follow-ups are enabled for the surface or the last turn searched the web. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.21)
- Follow-up generation is hidden in temporary chats, and any follow-up that asks for a web search is dropped when search was unavailable. (source: Brief S34.21; apps/web/features/chat/components/messages/ChatMessageList.tsx:1486; apps/web/features/chat/components/FollowUpSuggestions.tsx:86)
- The clarify tool is offered only for short messages with no attachment, URL or code, and not for research runs; choices that are only about format, tone or length are rejected. (source: Brief S34.22; apps/web/lib/services/clarify-tool-service.ts:56-68,315)
- After a search-backed answer, the user is offered follow-up or refined queries and can send one with a tap (Web, Desktop, Mobile, CLI, VS Code, Chrome per the area, with CLI, VS Code and Chrome marked missing). (source: Brief S34.21)
- When a query is ambiguous the product offers clarification choices the user can pick before answering. (source: Brief S34.22)
- Citation chip and sources disclosure and search and citations are named components of the experience contract; follow-ups and clarify are not named there. (source: doc: docs/product/experience-contract.md:394,457)

**Acceptance criteria**

1. On Web with the setting on, after a web-searched answer longer than 20 characters finishes, one to three chips appear under it; tapping one sends that text as a new user message.
2. With the setting off, no chips appear on Web or Desktop.
3. In a temporary chat on Web, no server call is made for suggestions and the keyword-matched chips appear instead.
4. When the turn's web search was unavailable, no chip containing 'search ... web' or 'browse ... online' wording is shown on Web or Mobile.
5. On Mobile in Cloud mode, chips appear under the last clean answer only while the composer is empty, and 'Hide' removes them for that answer.
6. A bare 'plan my trip' on Web in Cloud mode can produce a clarify card; a message that starts with 'summarize', or holds a URL, code fence or attachment, does not offer the tool.
7. Pressing 'Send answers' on a clarify card sends the chosen labels back and the card becomes read-only.
8. A card whose options are only 'Short / Long / Bullets' is rejected and the model answers directly.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Follow-up generation should respect the same plan and quota rules as other background model calls, because it reserves usage under the quota feature name follow_up_suggestions. [inferred]
- Because the Electron desktop shell reports the 'desktop' surface, the clarify tool should be allowed there if Desktop is meant to match Web. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass enableFollowUpSuggestions from the chat page, or delete the prop, so the behaviour in the brief and the code agree.
- [proposed] Add 'desktop' to the surfaces that may receive the clarify tool, with a test.
- [proposed] Add a follow-up suggestions switch on Mobile that matches the Web setting.
- [proposed] Show suggestions in the Chrome side panel and VS Code using the same server route.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatMessageList (follow-up gating) | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Computes showFollowUps from the setting, searched turn, generating, failed and length; mounts the chips; reads cached suggestions (lines 1411-1490, 2013). |
| component | FollowUpSuggestions (web) | `apps/web/features/chat/components/FollowUpSuggestions.tsx` | Renders up to three chips plus Hide; prefers server suggestions, falls back to the keyword matcher; drops search-asking chips when search was unavailable. |
| hook | useGeneratedFollowUps | `apps/web/features/chat/hooks/use-generated-follow-ups.ts` | Posts once per answer to the follow-ups route and hands back suggestions and a pending flag. |
| other | deriveFollowUps and followUpAsksForWebSearch | `packages/ui/unified-chat/src/lib/follow-ups.ts` | Shared keyword matcher (topic patterns, generic pool, code and verify hints) and the regex that spots 'search the web' wording (lines 183, 270). |
| endpoint | POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups | `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts` | Checks CSRF and rate limit, returns empty for temporary chats, serves the cached set or generates and caches a new one on the message. |
| service | generateFollowUpSuggestions | `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts` | One auxiliary model call (3 questions, 160 output tokens, untrusted-content fence), routed through managed admission with a usage lease and a sanitiser. |
| service | admitManagedCloudRoute (utility) | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Chooses the model route for the utility call on the economy tier and applies account policy. |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | Holds followUpSuggestionsEnabled (default true). |
| config | appearance namespace and settings sync | `apps/web/features/settings/lib/appearance-namespace.ts` | Maps followUpSuggestionsEnabled to the account key followUpSuggestions. |
| screen | GeneralSection setting row | `apps/web/features/settings/sections/GeneralSection.tsx` | The 'Show follow-up suggestions in chats' switch (line 626-638). |
| component | FollowUpSuggestions (mobile) | `apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx` | Mobile chips with fetch, cache, keyword fallback and Hide. |
| service | fetchFollowUpSuggestions | `apps/mobile/src/features/chat/services/followUps.ts` | Calls the same follow-ups endpoint through the phone API client. |
| screen | Mobile chat screen (follow-up target rule) | `apps/mobile/app/(app)/chat/[id].tsx` | Shows chips only in Cloud mode, non-temporary, not streaming, no error, clean ending, not research (lines 1366-1376, 2597). |
| store | rememberFollowUpSuggestions | `apps/mobile/stores/chat/chatMessageStore.ts` | Writes fetched suggestions into message metadata so reopening does not refetch (line 1095). |
| service | clarify-tool-service | `apps/web/lib/services/clarify-tool-service.ts` | Offer rule, tool definition, argument normalising, rejection of format-only questions, card building. |
| service | applyClarifyCardCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the clarify tool to a request when surface, streaming, tools, research flag, client support and message shape allow (line 1269). |
| service | tool loop and stream transform (clarify) | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Executes the clarify call, stores the card, and ends the turn to wait for the answer (lines 2705, 5962, 6660). |
| endpoint | POST /api/interactive-cards/respond | `apps/web/app/api/interactive-cards/respond/route.ts` | Validates and records the answers or dismissal on the stored card. |
| component | ClarifyCard (web) | `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx` | Renders options, 'Something else…' box, Send answers and dismiss. |
| component | ClarifyCard (mobile) | `apps/mobile/src/features/chat/components/ClarifyCard.tsx` | Mobile card with the same controls; capability list in apps/mobile/src/features/chat/utils/clarifyCard.ts. |
| component | buildClarifyCard (Chrome) | `apps/extension/src/features/side-panel/interactiveCards.ts` | Side-panel clarify card with answered, dismissed and expired states. |
| service | Chrome request capability | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Declares clarify.v1 among supported card kinds in the chat request (line 1581). |
| schema | interactive card contract | `packages/contracts/types/src/interactive-cards.ts` | Card kinds, request key x_interactive_cards, limits per message. |
| command | ask_user tool (CLI) | `apps/cli/src/features/exec/tools/task_registry/mod.rs` | Executes questions with options, approval kind, and terminal fallbacks; definition in apps/cli/src/platform/runtime/tool_catalog.rs:793. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web finishes an answer and decides whether chips may show (setting, length over 20, not failed, searched or enabled). | device | apps/web/features/chat/components/messages/ChatMessageList.tsx:1466-1474 |
| Web or Mobile posts to the follow-ups route for the answer's message id, once per answer. | device and our servers | apps/web/features/chat/hooks/use-generated-follow-ups.ts:34-46; apps/mobile/src/features/chat/services/followUps.ts:14 |
| Server loads the conversation and message, returns empty for a temporary chat, or the cached set if present. | our servers | apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts:36-67 |
| Otherwise it admits a utility route, reserves usage, sends the answer (max 6,000 characters) and up to 8 source titles to a model, and sanitises the lines into at most three questions. | our servers | apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts:24-37,133,158,233 |
| The model call goes to the chosen provider adapter. | outside service | apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts:200-206 |
| The set is saved into the message metadata under followUpSuggestions unless one already exists; the client shows the chips, or the keyword matcher if the list is empty. | our servers | route.ts:96-116; apps/web/features/chat/components/FollowUpSuggestions.tsx:72-90 |
| Tapping a chip sends its text through the normal send path. | device | apps/web/features/chat/components/FollowUpSuggestions.tsx:118 |
| For the clarify card: the client lists clarify.v1 in x_interactive_cards, the server adds the tool if the message passes the test, the model calls it, the server validates and stores a card, and the turn pauses. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1269-1297,5598; tool-loop.ts:2705,5962 |
| The person's answers go to the respond endpoint, which records them on the card; the client then sends the answers as the next message. | device and our servers | apps/web/app/api/interactive-cards/respond/route.ts:198; apps/web/lib/hooks/useChatStream.ts:1349-1351 |
| CLI ask_user shows the question in the TUI or terminal, or asks the connected client, and returns 'User responded: ...' to the model. | device | apps/cli/src/features/exec/tools/task_registry/mod.rs:586-690 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Suggested follow-up strings (up to 3, each at most 100 characters) | Message metadata key followUpSuggestions in table web_messages; on Mobile also the local message store | Yes with the conversation (Cloud); the Mobile store writes it locally after fetching | Lives with the message; deleted when the message or conversation is deleted [inferred]. Empty results are never cached (route.ts:96). |
| Clarify card and its state (pending, answered, dismissed, expired) | Message metadata key interactiveCards in table web_messages | Yes with the conversation | Lives with the message; up to 4 cards per message (packages/contracts/types/src/interactive-cards.ts:14). |
| followUpSuggestionsEnabled setting | Browser settings store and the account appearance settings | Yes through CloudSettingsSync | Until the user changes it. |
| Usage record for the suggestion call | Background usage lease under quota feature follow_up_suggestions | Server side only | unknown |

**Models and providers.** The suggestion call uses a model chosen by the managed Auto route on the economy tier, not the model the user picked, and is dispatched through the server provider adapter (apps/web/lib/server/managed-cloud-routing/admission.ts:25-27; generate-follow-ups.ts:137-146). The clarify tool is called by whichever model answers the turn, and only if that model can use tools (request-processor.ts:5598). The keyword matcher uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Follow-ups and clarify need a signed-in account because both go through account-scoped server routes (getUserScopedDb in route.ts:26; respond/route.ts:61). The keyword fallback on Web needs no account but is only shown after the server step settles. |
| Permissions | The route checks the conversation belongs to the user and organisation (route.ts:36-44). Workspace rules for providers apply through managed admission. No other permission found. |
| Subscription | No plan check in the follow-up code beyond the usage lease: the lease takes the entitled plan tier and refuses when the reservation fails, which returns no suggestions (generate-follow-ups.ts:151-176). Which plans may use it: unknown. The clarify tool has no plan check of its own; the chat route itself is gated by plan (apps/web/lib/free-chat-surface-policy.ts:121). |
| Limits and metering | One model call per answer, 160 output tokens, three suggestions, lease of 60 seconds, usage recorded as follow_up_suggestions (generate-follow-ups.ts:24-33,155-170). The route uses the 'chat-message' rate limit (route.ts:31). Clarify limits: at most 4 questions, 4 options, labels 60 characters, questions 200 (clarify-tool-service.ts:14-19). |
| Feature flags | Setting followUpSuggestionsEnabled (default on). Prop enableFollowUpSuggestions (default off, not passed in app code). Request field x_interactive_cards.supported must list clarify.v1. No remote feature flag found. |
| Model compatibility | Clarify needs a model that supports tools; otherwise it is not offered (request-processor.ts:5598-5603). Suggestions work with the economy utility route whatever model answered the turn. |
| Provider restrictions | Utility calls skip providers that an account policy excludes, for example US-only or no-training settings (admission.ts:249). Exact excluded providers are in the model registry, not read here. |
| Local mode | Mobile: chips and clarify cards are shown only in Cloud mode (apps/mobile/app/(app)/chat/[id].tsx:1366). Web and Desktop: the server route needs the chat to exist in the account; whether a Local-mode desktop conversation reaches it is unknown. CLI ask_user works with no server because it runs on the device. Local inference itself does not use a paid plan, but these two features have no local implementation. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Generating or streaming | No chips while a reply runs (Web and Mobile). | ChatMessageList.tsx:1470; apps/mobile/app/(app)/chat/[id].tsx:1368 |
| Failed, refused, stopped, or Continue offered | Web hides chips so they do not compete with the error action. | ChatMessageList.tsx:1411-1420 |
| Temporary chat | Server returns empty and Web shows keyword chips; Mobile shows none. | route.ts:47; apps/mobile/app/(app)/chat/[id].tsx:1367 |
| Loading suggestions | Web hides the row while the request is pending, then shows server or fallback chips; Mobile waits for the fetch to settle before using the fallback. | ChatMessageList.tsx:2013; apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx:103-112 |
| Server error or refusal | Silent: no error is shown; fallback chips appear. | apps/web/features/chat/hooks/use-generated-follow-ups.ts:46-60 |
| Two tabs request at once | The first saved set wins and is returned to the second. | route.ts:78-90,96-104 |
| Search unavailable | Chips asking to search or browse the web are removed. | packages/client/client-runtime/src/agentActivity.ts:189; FollowUpSuggestions.tsx:86 |
| User typing | Web chips become invisible and unclickable; Mobile hides them when the composer has text. | FollowUpSuggestions.tsx:104; apps/mobile/app/(app)/chat/[id].tsx:2596 |
| Clarify answer fails to send | Error line shown and the questions stay answerable. | apps/web/lib/hooks/useChatStream.ts:1354 |
| Clarify card out of date | Shown read-only with a reason on Chrome; Mobile checks the deadline and pending state. | apps/extension/src/features/side-panel/interactiveCards.ts:349-360; apps/mobile/src/features/chat/utils/clarifyCard.ts:30-40 |
| Secret answers | A card with a secret question cannot be answered in place on Mobile. | apps/mobile/src/features/chat/utils/clarifyCard.ts:38 |
| Accessibility | Web chips are a labelled group; Mobile chips have role button and 'Ask: ...' labels and 44-point height; Chrome options use aria-pressed and a labelled text box. | FollowUpSuggestions.tsx:111; apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx:130-141; apps/extension/src/features/side-panel/interactiveCards.ts:463 |
| Offline, cancel, timeout of the chip request | Request is aborted when the component unmounts; offline retry not handled in the code. | apps/web/features/chat/hooks/use-generated-follow-ups.ts:62-68 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/follow-ups.test.ts`: Generic fallback, short content, web-search wording detector.
- `apps/web/features/chat/components/FollowUpSuggestions.test.tsx`: deriveFollowUps guards, topics, scoring, caps, dedup, result shape.
- `apps/web/features/chat/components/messages/ChatMessageList.test.tsx`: Chat list with cached followUpSuggestions metadata and the enable prop (lines 324-375).
- `apps/web/features/chat/components/messages/__tests__/ChatMessageList.turnFailureNotice.test.tsx`: Chips and the failure notice (uses the enable prop); detail not read.
- `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.test.ts`: Cached set, generated set, race with another tab, empty result.
- `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.withdrawal.test.ts`: Route behaviour for withdrawn messages; detail not read.
- `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.test.ts`: Generator and sanitiser; detail not read.
- `apps/mobile/src/features/chat/components/__tests__/FollowUpSuggestions.test.tsx`: Mobile chips, cached suggestions, search-unavailable filter.
- `apps/mobile/__tests__/ChatThreadControls.test.tsx`: Stored follow-up suggestions on a Cloud answer (lines 775-801).
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Setting round trip to the account key.
- `apps/web/lib/services/clarify-tool-service.test.ts`: Clarify tool rules; detail not read.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.stable-tools.test.ts`: Tool offer when cards are supported.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/stream-transform.empty-turn.test.ts`: Clarify call inside a stream.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.turn-withheld.test.ts`: Turn withheld after a clarify card.
- `apps/web/app/api/interactive-cards/respond/route.test.ts`: Respond endpoint.
- `apps/web/features/chat/components/messages/InteractiveCardBlock.respond.test.tsx`: Answering a card in the web transcript.
- `apps/mobile/src/features/chat/utils/__tests__/clarifyAndPlan.test.ts`: Mobile clarify helper logic.
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Side-panel bubbles including interactive cards (matched search; detail not read).
- `apps/cli/src/features/exec/tools/task_registry/mod.rs`: Inline module ask_user_tests (line 1248): refuses to read stdin when it carries protocol frames.

**Test scenarios**

- **Chips after a searched answer (Web)**
  1. Sign in on Web, setting on.
  2. Ask a question that needs a web search, e.g. a current product.
  3. Wait for the answer to finish.
  - Expected: Up to three chips appear under the answer; tapping one sends it; 'Hide' removes the row.
- **Setting off**
  1. Turn off 'Show follow-up suggestions in chats'.
  2. Repeat the searched question.
  - Expected: No chips; no request to the follow-ups route.
- **Temporary chat**
  1. Open a temporary chat and ask a searched question.
  - Expected: Route returns an empty list if called; only keyword-matched chips (if any) show.
- **Mobile Cloud chips**
  1. Open Mobile in Cloud mode, ask any question, wait for the end.
  2. Leave the composer empty, then type a letter.
  - Expected: Chips under the last answer; they vanish when the composer has text.
- **Clarify card**
  1. On Web in Cloud mode, send 'plan my trip' with no other detail.
  2. Pick options and press 'Send answers'.
  - Expected: A card with questions appears, the answers are sent, the card turns read-only and the answer follows. Repeat on the Desktop shell to check the surface gap.
- **Clarify not offered**
  1. Send 'summarize this: https://example.com'.
  2. Send a message with a code fence.
  - Expected: No clarify card; the assistant answers directly.

**Where to look when it fails**

- Log warning '[follow-ups] suggestions could not be cached on the turn' and '[follow-ups] usage reservation refused; no suggestions are generated' (generate-follow-ups.ts:175; route.ts:112).
- Log '[follow-ups] reservation release failed' (generate-follow-ups.ts:196).
- Stream log 'Inline clarify call was rejected and shows no card' (stream-transform.ts:603).
- Tool result text 'The clarifying questions were rejected: ...' seen in the tool trace (clarify-tool-service.ts:307-318).
- Tables web_messages (metadata keys followUpSuggestions and interactiveCards) and web_conversations (is_temporary).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)
- Chrome: [70-qa/test-plans/chrome/034-search-experiences.md](../../70-qa/test-plans/chrome/034-search-experiences.md)

## 10. Gaps and dependencies

- **Brief says follow-ups are missing on Mobile; the code has them (Cloud mode only, no setting).** Affects: Mobile; anyone reading the brief. Evidence: apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx; apps/mobile/app/(app)/chat/[id].tsx:2597. Work needed: Correct the brief; decide whether to add a Mobile setting and a Local-mode version.
- **Brief says clarify is missing on Mobile and Chrome; the code renders and answers cards on both.** Affects: Mobile, Chrome. Evidence: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1077; apps/extension/src/features/side-panel/bubbles.ts:245. Work needed: Correct the brief; add a device test for each.
- **Clarify tool is not offered to the desktop surface although the brief says Desktop is done.** Affects: Public Desktop (Electron). Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1276; apps/web/lib/device-steps/host-headers.ts:41. Work needed: Confirm by running the desktop shell, then allow the surface or fix the brief.
- **Web chips need a searched turn because the enable prop is never passed.** Affects: Web, Desktop. Evidence: ChatMessageList.tsx:1104,1468. Work needed: Decide the intended default and remove the dead prop or pass it.
- **No follow-up suggestions on CLI, VS Code and Chrome.** Affects: CLI, VS Code, Chrome. Evidence: no code found in apps/cli, apps/extension-vscode, apps/extension. Work needed: Build on the shared route for VS Code and Chrome; CLI needs a text design.
- **No local or own-key implementation of either feature.** Affects: Mobile and Desktop in Local mode, own-key users. Evidence: generate-follow-ups.ts:137 uses managed admission only. Work needed: A local small-model path or a clear unavailable state.
- **Decision doc says the clarify answer path is not built; code has it.** Affects: Engineers reading docs. Evidence: docs/decisions/wire-or-cut.md:340 vs apps/web/app/api/interactive-cards/respond/route.ts. Work needed: Update the doc (AGENTS.md section 11).
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- mode:cloud
- file:apps/web/features/chat/components/messages/ChatMessageList.tsx
- file:packages/ui/unified-chat/src/lib/follow-ups.ts
- file:apps/web/lib/services/clarify-tool-service.ts
- api:POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups
- api:POST /api/interactive-cards/respond
- api:POST /api/llm/v1/chat/completions
- table:web_messages
- table:web_conversations
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- F034-08

## Unknown

- Whether the Electron desktop shell really sends the 'desktop' surface on every chat request, so the clarify tool is excluded there; confirm by running the shell (not run).
- Which plans may use background suggestion calls and what quota they draw from.
- Whether Local-mode desktop conversations can reach the follow-ups route.
- Whether a Tauri build of apps/desktop/src has follow-ups or clarify; it is internal code and was not read.
- What the Chrome and CLI tests assert in detail; only file names were checked.
- Retention of the usage lease records.

---
id: "F108-11"
type: "feature"
title: "Shopping comparisons and travel planning"
aliases: ["Shopping comparison", "Product comparison card", "compare_products", "product-comparison.v1", "Travel planning", "Itinerary card", "plan_itinerary", "itinerary.v1", "Commerce checkout (S108.34)"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S108.31", "S108.33", "S108.34"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "file:packages/contracts/types/src/interactive-cards.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-11 Shopping comparisons and travel planning

In chat the model can show a comparison card of two to four products (price, store, buy link, specs, all tied to pages found this turn) or an itinerary card of up to twelve stops numbered on a map with Google Maps route links. Places lookups are charged. The tools do not book or buy. Web, desktop (hosted), mobile and Chrome render the cards.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.31](../../10-requirements/capabilities/108-specialist-workspaces.md#s10831), [S108.33](../../10-requirements/capabilities/108-specialist-workspaces.md#s10833), [S108.34](../../10-requirements/capabilities/108-specialist-workspaces.md#s10834).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Two model tools that build typed cards. compare_products turns web-search findings into a side-by-side table; plan_itinerary looks up each stop through a places provider and builds a numbered itinerary with route legs that open in Google Maps (apps/web/lib/services/product-comparison-tool-service.ts:85, :369; apps/web/lib/places/itinerary-tool.ts:102, :336, :493).

**Why it exists.** Brief S108.31 (shopping comparisons), S108.33 (travel planning and reservations) and S108.34 (commerce checkout, not applicable) (doc: knowledge-base/data/area-briefs/108-specialist-workspaces.md). Cards give a structured result instead of a long text answer.

**Who uses it.** Shoppers deciding between products and travellers planning a day or trip.

**Problems it solves**

- Prices and links cannot be invented: every price source, buy link and source must be a URL returned by a search or fetch in the same turn (product-comparison-tool-service.ts:85-100 description, :224-227).
- Stops are looked up as real places so the map pins and route are real (itinerary-tool.ts:264-300, :536-560).
- Booking is not faked: the model is told to use a booking connector or point the person to Settings > Connectors (itinerary-tool.ts:217-220).

**Use cases**

- 'Compare these three laptops under $1000.'
- 'Plan a day in Lisbon with a walking route.'
- 'Book a table for stop 3' leads to a connector hint.

## 2. User experience

**Where to find it**

- Web and desktop (hosted web app): chat. The cards appear above the model's reply (cards: apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx, ItineraryCard.tsx; dispatcher InteractiveCardBlock.tsx).
- Mobile: chat; renderers ProductComparisonCard.tsx and the itinerary map in InteractiveCardBlock.tsx; the phone declares support for itinerary.v1 and product-comparison.v1 and sends it with each managed chat request (apps/mobile/src/features/chat/utils/clarifyCard.ts:7-18; apps/mobile/stores/chat/chatExecutionStore.ts:3442).
- Chrome: side-panel chat; card builders buildItineraryCard and buildProductComparisonCard (apps/extension/src/features/side-panel/interactiveCards.ts:109, :316); capability list sent in freeTrialClient.ts:1581-1590.
- CLI, VS Code: not offered; the card tools are limited to web, desktop, mobile, chrome surfaces (request-processor.ts:1357-1362).

**Before you start**

- Cloud chat, streaming on, tool-capable model (request-processor.ts:1371-1382, :1410-1417).
- The app must declare card support in the request (x_interactive_cards).
- Shopping: a web-search tool must be attached to the turn (request-processor.ts:1414).
- Travel: a places provider configured on the server and, on the Free trial path, a window that can cover a places search (request-processor.ts:5518-5520).
- The message must look like the intent: shopping needs a purchase word and a choice word; travel needs an itinerary-type phrase (product-comparison-tool-service.ts:36-47; itinerary-tool.ts:57-68).

**Screens and controls**

- Comparison card: product columns with price, 'Buy at <merchant>' or 'View product' links, spec rows, sources (ProductComparisonCard.tsx:111).
- Itinerary card: numbered stops on a map, time labels, notes, route buttons by leg ('Full route' or 'Stops 1 to 5') (itinerary-tool.ts:356-376).

**Journey**

1. Type a request such as 'compare headphones under $400' or 'plan a weekend in Rome'.
2. The server checks surface, tool support, streaming, card support and intent, then offers the tool to the model.
3. For shopping the model first searches the web, then calls compare_products with products and spec labels.
4. For travel the model calls plan_itinerary with stops; the server looks each stop up and builds the card.
5. The card renders above the reply; the model adds a short note without repeating the table.
6. For booking the model uses a connected booking connector or tells the person to connect one.

**What the person sees and gets**

- Card with fallback text if the app cannot render it (fallback headline and text, itinerary-tool.ts:457-465; product-comparison buildCard :338).
- Model-side messages when unavailable: no places provider, no credits, lookup failed, too large (itinerary-tool.ts:200-216).
- Omitted prices or links with a note when no URL came from this turn (product-comparison-tool-service.ts:168-177).
- Prices stamped 'as of' a check date and the model is told to say they can change (:200).

**Settings**

- Connectors: a travel or booking connector in Settings, Connectors (itinerary-tool.ts:217-220).
- No shopping or travel specific settings found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Product comparison: input schema 2-4 products with limits, grounded-URL check, size fitting in three budget steps, card and model summary (product-comparison-tool-service.ts:55-83, :224-227, :338-352, :369).
- Itinerary: up to 12 stops, routes in legs of 5 stops, Google Maps directions URLs, reservation and settlement of charged places searches, card fitting (itinerary-tool.ts:264-334, :336-380, :457-493; packages/contracts/types/src/interactive-cards.ts:207-210).
- Offers wired into the request and tool loop (request-processor.ts:1364-1420; tool-loop.ts:2643-2675).
- Renderers on web, mobile, Chrome.

**Incomplete**

- Neither tool completes a booking or purchase; reservations depend on external connectors the person must connect (itinerary-tool.ts:217-220).
- Itinerary needs a Google places backend key set on the server (apps/web/lib/places/places-config.ts:7 names the env GOOGLE_PLACES_API_KEY); without it the tool is not offered (request-processor.ts:5518).
- Desktop: no desktop-specific card code; relies on hosted web app [inferred].

**Present but disconnected or switched off**

- Card tools are not offered on cli, vscode or api (request-processor.ts:1357-1362).
- No dedicated itinerary-tool test file was found; the tool name appears in request-processor.stable-tools.test.ts and chat-tool-provider-schemas.test.ts.

**Not available**

- Commerce checkout on every app (brief: not applicable).
- Booking inside the product with no connector.

## 4. Required behaviour

**Established requirements**

- S108.31 Should: compare products for purchase (specs, prices, merchants) in a structured comparison. Brief: web, desktop, Chrome done; mobile missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.31)
- S108.33 Should: plan a trip (itinerary, places, routes) and make reservations from the product. Brief: done on all four. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.33)
- S108.34 Should: assistant completes a purchase. Brief: not applicable anywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.34)
- Product comparison cards show only sources, prices and links from URLs returned in the same turn. (source: apps/web/lib/services/product-comparison-tool-service.ts:85-100, :224-227)
- Itinerary place searches are billed via a reserve-then-settle step. (source: apps/web/lib/places/itinerary-tool.ts:264-334)
- Cards need the client to declare support for the kind. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1376, :1414)

**Acceptance criteria**

1. 'Compare A and B under $300' with web search on yields a card with 2-4 products and only URLs found this turn.
2. A product with no grounded source is dropped and named to the model.
3. 'Plan a 2 day trip in Paris' yields a card with numbered stops and route buttons, each leg up to 5 stops.
4. With the places provider unconfigured the tool is not offered and the model writes text.
5. With no credits the model is told the balance stopped the lookups and writes text.
6. Asking to book gives a connector hint, not a booking.
7. The same prompt on CLI gives no card.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile shopping works because the phone declares support and has a renderer; brief status 'missing' appears out of date [inferred, not run].
- Reservation is out of scope until connectors exist [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Name which booking connectors are supported and show them in the itinerary card.
- [proposed] Add direct tests for the itinerary tool.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | product comparison tool | `apps/web/lib/services/product-comparison-tool-service.ts` | Tool definition, intent test, grounding, card build. |
| service | itinerary tool | `apps/web/lib/places/itinerary-tool.ts` | Tool definition, place lookups, routes, card build, booking guidance. |
| service | places cost | `apps/web/lib/places/places-cost.ts` | Reserve and settle charge for places searches (free-trial hold or credits). |
| config | places config | `apps/web/lib/places/places-config.ts` | Env name for the places key, price per call, timeout. |
| service | places provider | `apps/web/lib/places/google-places-provider.ts` | The places lookup against an outside service. |
| schema | interactive card types | `packages/contracts/types/src/interactive-cards.ts` | Tool names, limits, card body types. |
| schema | interactive card contract | `packages/contracts/cloud-contracts/src/interactive-cards.ts` | Card parsing and route-url allowlist. |
| service | request processor offers | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | applyItineraryToolCapability (:1364), productComparisonOffer (:1403), places availability (:5518). |
| service | tool loop execution | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tools (:2643, :2663). |
| component | web card dispatcher | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Renders cards by kind. |
| component | web ProductComparisonCard | `apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx` | Comparison table UI. |
| component | web ItineraryCard | `apps/web/features/chat/components/messages/cards/ItineraryCard.tsx` | Itinerary UI with map. |
| hook | web card kinds | `apps/web/lib/hooks/useChatStream.ts` | WEB_INTERACTIVE_CARD_KINDS list sent in requests (:1334-1348). |
| component | mobile InteractiveCardBlock | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Itinerary map and card kinds on the phone. |
| component | mobile ProductComparisonCard | `apps/mobile/src/features/chat/components/cards/ProductComparisonCard.tsx` | Comparison card on the phone. |
| config | mobile card capability | `apps/mobile/src/features/chat/utils/clarifyCard.ts` | Lists supported card kinds (:7-18). |
| component | Chrome card builders | `apps/extension/src/features/side-panel/interactiveCards.ts` | DOM builders for both cards. |
| service | Chrome chat client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Declares supported card kinds (:1581-1590). |
| test | product comparison tests | `apps/web/lib/services/product-comparison-tool-service.test.ts` | Fitting, source trimming, model summary. |
| test | places cost tests | `apps/web/lib/places/places-cost.test.ts` | Reserve and settle behaviour. |
| test | mobile comparison card test | `apps/mobile/src/features/chat/components/cards/__tests__/ProductComparisonCard.test.tsx` | Phone card rendering. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App sends the chat request with the list of card kinds it can render and streaming on. | device | useChatStream.ts:1334-1348; chatExecutionStore.ts:3442; freeTrialClient.ts:1581 |
| Server tests surface, tool support, stream, card support, intent and (for travel) places availability, then adds the tool to the turn. | our servers | request-processor.ts:1364-1420, :5518 |
| Shopping: web search results are fetched; the model calls compare_products; the server keeps only URLs retrieved this turn and builds the card. | outside service | product-comparison-tool-service.ts:224-227; tool-loop.ts:2663-2675 |
| Travel: the model calls plan_itinerary; the server reserves a charge for each distinct stop lookup, calls the places provider, settles the charge, builds stops and route URLs. | outside service | itinerary-tool.ts:264-334, :493-560 |
| The card is streamed to the app and rendered; route buttons open Google Maps. | device | itinerary-tool.ts:336-355; InteractiveCardBlock.tsx |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Card body (title, products or stops, sources) as part of the assistant message | Conversation messages on our servers [inferred] | Yes with the chat | Chat retention |
| Places search charge records | Usage and charge system (places-cost.ts) | Server-side | unknown |
| Place identity (provider id, coordinates, address, attribution) | Inside the card body | With the message | With the message |

**Models and providers.** Any tool-capable model can call the tools (request-processor.ts:1371). The places lookup uses an outside Google-based places service (apps/web/lib/places/google-places-provider.ts); this is not an AI model provider folder. Web search for shopping uses whatever search tool is attached to the turn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud chat. |
| Permissions | Workspace policy and connector permissions apply to booking connectors; none specific to cards found. |
| Subscription | Places searches are charged per call: Free trial window hold or credit reservation (places-cost.ts:30-60; itinerary-tool.ts:204-208). Shopping cards: no separate charge found. Plan names for each rule are unknown. |
| Limits and metering | 2-4 products (interactive-cards.ts:334-335); up to 12 stops and 5 stops per route leg (:207, :210); card size cap INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH; places timeout 8 seconds (places-config.ts:10). |
| Feature flags | A places key in the server environment (places-config.ts:7); the client must declare the card kind. |
| Model compatibility | Needs tools and streaming. |
| Provider restrictions | Itinerary relies on one places provider implementation in this path (google-places-provider.ts); other providers not found. |
| Local mode | Cards come from the server chat path; mobile Local inference producing these cards: unknown; no Local code path found in the files read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No places provider | Tool not offered or returns unavailable message; model writes text. | request-processor.ts:5518; itinerary-tool.ts:200-203 |
| Out of credits | Lookups refused; unaffordable flag; model told. | itinerary-tool.ts:204-208, :264-290 |
| All lookups fail | LOOKUP_FAILED message. | itinerary-tool.ts:209-213, :520-523 |
| Stop not found | Stop kept as unresolved; no route built; model names it. | itinerary-tool.ts:222-250, :391-405 |
| Card too large | Shortens notes and summary in three steps, then tells the model to split by day. | itinerary-tool.ts:214-216, :457-480 |
| Ungrounded URL in comparison | URL left out and named; product dropped if no source. | product-comparison-tool-service.ts:168-177, :224-240 |
| Map unavailable on phone | Message ITINERARY_MAP_UNAVAILABLE_MESSAGE. | InteractiveCardBlock.tsx (mobile):552-560 |
| Offline or timeout | Places call times out after 8 seconds; other offline handling not found. | places-config.ts:10 |
| Accessibility | unknown; card components not audited here | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/product-comparison-tool-service.test.ts`: Source trimming, summary, price/source ordering
- `apps/web/lib/places/places-cost.test.ts`: Places charge reserve and settle
- `apps/web/lib/places/places-tool.test.ts`: Places search tool
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.stable-tools.test.ts`: Tool set stability including itinerary tool name
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Card rendering on web
- `apps/mobile/src/features/chat/components/cards/__tests__/ProductComparisonCard.test.tsx`: Phone comparison card
- `apps/mobile/src/features/chat/components/cards/__tests__/MapCardsSafety.test.tsx`: Map card safety on the phone
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Chrome side-panel bubbles

**Test scenarios**

- **Compare products**
  1. Ask 'Which is better under $400: model A or model B?' with web search on.
  2. Open the card links.
  - Expected: Card with 2-4 products; every link was in the search results.
- **Plan itinerary**
  1. Ask 'Plan a one day walking itinerary in Kyoto'.
  - Expected: Numbered stops, route buttons, a charge recorded per distinct stop.
- **Out of credits**
  1. Use an account with no credits and ask for an itinerary.
  - Expected: Text plan; model says credit balance stopped lookups.
- **Book request**
  1. After an itinerary, ask 'book a table at stop 2'.
  - Expected: Connector hint or a connector tool call; no fake booking.
- **Surface check**
  1. Ask the same prompts on mobile and Chrome.
  - Expected: Cards render (confirm brief status for mobile shopping).
- **CLI**
  1. Ask on the CLI.
  - Expected: No card tool.

**Where to look when it fails**

- Tool errors 'Unknown tool: plan_itinerary' or compare_products in tool loop (tool-loop.ts:2643-2675).
- free_trial_token_budget_reached for places holds (places-cost.ts:40-46).
- Model summary text in the tool result names left-out URLs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)
- Mobile: [70-qa/test-plans/mobile/108-specialist-workspaces.md](../../70-qa/test-plans/mobile/108-specialist-workspaces.md)
- Chrome: [70-qa/test-plans/chrome/108-specialist-workspaces.md](../../70-qa/test-plans/chrome/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **No booking or reservation tool; only guidance to connect one.** Affects: All apps; S108.33 'make reservations'.. Evidence: itinerary-tool.ts:217-220. Work needed: Confirm which connectors can book and test the flow.
- **Brief says shopping is missing on mobile but code declares and renders it.** Affects: Documentation.. Evidence: clarifyCard.ts:7-18; chatExecutionStore.ts:3442; mobile ProductComparisonCard.tsx. Work needed: Run on a device and correct the brief.
- **No direct unit test for itinerary-tool.ts.** Affects: Web, mobile, Chrome.. Evidence: No itinerary test file in apps/web/lib/places. Work needed: Add tests for fitting, unresolved stops, billing refusal.
- **Depends on a single places provider and key.** Affects: All apps.. Evidence: places-config.ts:7. Work needed: Add a second provider or a clear unavailable message.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- file:packages/contracts/types/src/interactive-cards.ts

## Unknown

- Which plans may run places lookups and the credit price per call (value not read).
- Whether Local mode on mobile or desktop can produce these cards.
- Whether any booking connector is available end to end.
- Accessibility of the card components.
- Whether desktop's Electron window renders the cards identically to web.

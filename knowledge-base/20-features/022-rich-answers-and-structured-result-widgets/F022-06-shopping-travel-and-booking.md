---
id: "F022-06"
type: "feature"
title: "Shopping, travel and booking"
aliases: ["Shopping, travel and booking cards", "Product comparison", "product-comparison.v1", "compare_products", "Itinerary card", "itinerary.v1", "plan_itinerary", "View as comparison", "MessageFormatCard", "S22.17", "S22.18", "S22.19", "S22.22", "S22.23"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.17", "S22.18", "S22.19", "S22.22", "S22.23"]
depends_on: ["F022-04", "F022-01", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-06 Shopping, travel and booking

Product comparison and itinerary cards are built and connected, with more reach than the brief says. Web, Desktop, Mobile and Chrome show both; prices appear only when sourced, and availability is not shown. A text-based 'View as comparison' toggle also exists on Web. Reservation choices and calendar grids are not built.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.17](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2217), [S22.18](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2218), [S22.19](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2219), [S22.22](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2222), [S22.23](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2223).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Product comparison puts two to four products side by side with price, store, buy link and spec rows. The itinerary card shows trip stops with times, notes, a map and direction links. A separate Web toggle turns a prose comparison into a card.

**Why it exists.** Choosing what to buy or planning a day is easier in structured form. The brief lists comparison (S22.17), price and availability (S22.18), itinerary (S22.19), reservation choices (S22.22) and calendar grids (S22.23).

**Who uses it.** Shoppers and travellers on Web, Desktop (Electron hosted web), Mobile (Cloud) and the Chrome side panel.

**Problems it solves**

- Comparing products across many paragraphs.
- Invented prices (every price needs a source URL from this turn).
- Planning the order and routes of stops.

**Use cases**

- Ask 'best budget laptops under 800, compare' and read side-by-side cards with buy links.
- Ask for a one-day plan in a city and read stops with times and a route.
- Click 'View as comparison' on a prose comparison.

## 2. User experience

**Where to find it**

- Web and Desktop: product comparison and itinerary cards rendered before the prose (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38-55; cards/ProductComparisonCard.tsx; cards/ItineraryCard.tsx); text toggle 'View as comparison' under a prose answer (apps/web/features/chat/components/cards/MessageFormatCard.tsx).
- Mobile: ProductComparisonCard and ItineraryCard (apps/mobile/src/features/chat/components/cards/ProductComparisonCard.tsx; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:735,1113-1124); itinerary map tiles only in Cloud mode.
- Chrome: buildProductComparisonCard and buildItineraryCard (apps/extension/src/features/side-panel/interactiveCards.ts:109,316).
- CLI and VS Code: none found.

**Before you start**

- Cloud chat on the web, desktop, mobile or chrome surface; tool-capable streaming model; web search offered for product comparison; places key so itinerary stops can resolve.

**Screens and controls**

- Comparison: product tiles with name, best-for line, price with merchant or 'Price not found', buy link, spec table with 'Not listed' for unknown values, source list, checked date.
- Itinerary: numbered stops, times, notes, place address, 'Not found on the map' or 'Could not be looked up', route legs with directions links.
- Web toggle 'View as recipe, comparison, steps, calculation' and 'Hide ... view' (MessageFormatCard.tsx:17-60).

**Journey**

1. Person asks to compare products or plan a trip.
2. Server checks the wording (purchase plus choice words; itinerary phrases) and offers the tool.
3. Model searches, calls the tool with URLs that search returned this turn; the server drops any URL not seen.
4. Card streams and appears before the prose.
5. Person reads and opens buy or direction links.

**What the person sees and gets**

- 'Price not found' when absent.
- Direction links by travel mode.
- Source numbers with host names.

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- compare_products tool with grounded price, merchant and buy URLs, 2 to 4 products, 8 spec rows, 4 sources (apps/web/lib/services/product-comparison-tool-service.ts:25-45; packages/contracts/types/src/interactive-cards.ts:333-343).
- plan_itinerary tool with up to 12 stops and routes (apps/web/lib/places/itinerary-tool.ts:36-66; interactive-cards.ts:207).
- Web, Mobile and Chrome renderers for both kinds (InteractiveCardBlock.tsx:38-55; mobile InteractiveCardBlock.tsx:1113-1124; apps/extension/src/features/side-panel/bubbles.ts:247-249).
- Leading placement: comparison and itinerary render before prose (interactive-cards.ts:39-44).
- Web text-heuristic comparison card behind a toggle (apps/web/features/chat/components/messages/MessageBubble.tsx:2200,2916).

**Incomplete**

- Price is shown but no availability or seller stock (ProductComparisonProduct has price, merchant and buyUrl only; interactive-cards.ts:351-360).
- Itinerary stops need the places key to resolve; otherwise 'Not found on the map' [inferred from the places dependency in request-processor.ts:1378-1385].

**Present but disconnected or switched off**

- The brief marks mobile comparison, Chrome itinerary and web itinerary as missing, but code exists and is wired; end-to-end live use was not verified here.

**Not available**

- Reservation choices (S22.22) and calendar availability grids (S22.23): no code found.
- CLI and VS Code: no cards.

## 4. Required behaviour

**Established requirements**

- Product comparisons render as side-by-side comparison cards (web, desktop done; mobile and others missing per brief). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.17)
- Shopping answers show price and availability in a structured display. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.18)
- Trip plans render as a structured itinerary card (days, stops, times). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.19)
- Booking answers offer selectable reservation choices. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.22)
- Scheduling answers render a calendar availability grid to pick slots. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.23)
- Every price source, buy link and source must be a URL a web search or fetch returned in this turn; others are left out. (source: apps/web/lib/services/product-comparison-tool-service.ts:91)
- Itinerary and comparison cards lead the prose. (source: packages/contracts/types/src/interactive-cards.ts:39-44)

**Acceptance criteria**

1. A comparison of 2 to 4 products shows the same spec labels for each.
2. A price without a source URL is not shown; 'Price not found' appears.
3. Buy links not returned by search this turn are dropped.
4. An itinerary card with more than 12 stops is not produced.
5. Both cards appear above the text answer.
6. Unresolved itinerary places show 'Not found on the map' and the route says why it is missing.
7. Reservation and calendar controls are absent (not built).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Availability needs a data source not present in the repo [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add stock or availability fields to the product schema when a source exists.
- [proposed] Add reservation and calendar card kinds under the existing registry.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | product comparison tool | `apps/web/lib/services/product-comparison-tool-service.ts` | Tool definition, intent check, URL grounding |
| service | itinerary tool | `apps/web/lib/places/itinerary-tool.ts` | Tool definition, intent check, stops and routes |
| schema | Card body types | `packages/contracts/types/src/interactive-cards.ts` | Product and itinerary bodies, limits, leading kinds |
| schema | Cloud card validation | `packages/contracts/cloud-contracts/src/interactive-cards.ts` | Zod checks for card bodies and URL allow-lists |
| service | request-processor offers | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | productComparisonOffer :1403, itinerary offer near :1370-1390, CARD_TOOL_SURFACES :1357 |
| component | Web ProductComparisonCard | `apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx` | Web comparison card |
| component | Web ItineraryCard | `apps/web/features/chat/components/messages/cards/ItineraryCard.tsx` | Web itinerary with map and route |
| component | Web card registry | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Maps kinds to components (:38-55) |
| component | MessageFormatCard | `apps/web/features/chat/components/cards/MessageFormatCard.tsx` | Prose to card toggle |
| component | ComparisonCard | `apps/web/features/chat/components/cards/ComparisonCard.tsx` | Text-parsed comparison view |
| service | message-format | `packages/ui/unified-chat/src/lib/message-format.ts` | Detects recipe, comparison, steps, calculation |
| component | Mobile ProductComparisonCard | `apps/mobile/src/features/chat/components/cards/ProductComparisonCard.tsx` | Mobile comparison |
| component | Mobile card block | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | ItineraryCard :735, registry :1113-1124 |
| component | Chrome interactiveCards | `apps/extension/src/features/side-panel/interactiveCards.ts` | buildItineraryCard :109, buildProductComparisonCard :316 |
| component | Chrome registry | `apps/extension/src/features/side-panel/bubbles.ts` | Registry :241-249 |
| config | Web capability list | `apps/web/lib/hooks/useChatStream.ts` | Declares support (:1334) |
| config | Mobile capability list | `apps/mobile/src/features/chat/utils/clarifyCard.ts` | Declares support (:7) |
| service | Chrome capability list | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Declares itinerary, comparison, map-search, image, clarify (:1581) |
| test | Product comparison service test | `apps/web/lib/services/product-comparison-tool-service.test.ts` | Tool |
| test | Mobile ProductComparisonCard test | `apps/mobile/src/features/chat/components/cards/__tests__/ProductComparisonCard.test.tsx` | Mobile |
| test | MessageFormatCard test | `apps/web/features/chat/components/cards/MessageFormatCard.test.tsx` | Toggle |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client declares supported card kinds in the request. | device | apps/web/lib/hooks/useChatStream.ts:4590; apps/mobile/src/features/chat/utils/clarifyCard.ts:7-17; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1581-1590 |
| Server checks surface (web, desktop, mobile, chrome), tool-capable model, streaming, card support and the wording pattern. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1357-1425 |
| Model searches the web first, then calls compare_products with URLs from this turn. | outside service | apps/web/lib/services/product-comparison-tool-service.ts:91 |
| Server drops ungrounded URLs, validates and streams the card. | our servers | apps/web/lib/services/product-comparison-tool-service.ts:194-260 |
| Itinerary stops are looked up through the places vendor and routed. | outside service | apps/web/lib/places/itinerary-tool.ts:23-31 |
| Client renders the card before the prose and opens links in a new tab. | device | packages/contracts/types/src/interactive-cards.ts:39-52 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cards (max 4 per message, 12,000 characters each) | Message metadata key interactiveCards in web_messages | With the conversation | Follows the message |

**Models and providers.** Needs a tool-capable model. Product comparison needs web search to be attached to the turn (request-processor.ts:1413-1416). Itinerary uses the places vendor.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud chat; signed-in account [inferred]. |
| Permissions | Tool classes are listed in tool-metadata.ts (plan_itinerary and compare_products as read) [inferred from the file]. |
| Subscription | Searches and places calls inside the turn are metered (apps/web/lib/web-search/search-budget.ts; apps/web/lib/places/places-cost.ts). A card-specific plan gate: none found in the code. |
| Limits and metering | 2 to 4 products, 8 specs, 4 sources (interactive-cards.ts:333-343); 12 stops (interactive-cards.ts:207); 4 cards per message. |
| Feature flags | Itinerary needs places to be available (request-processor.ts:1378-1380); comparison needs search attached. |
| Model compatibility | Tool-capable streaming model. |
| Provider restrictions | Places vendor for itinerary; search vendor for comparison. |
| Local mode | Cards are produced by the Cloud server tool loop, so they do not appear in Local or own-key chat [inferred]. Mobile itinerary tiles are blocked outside Managed Cloud (apps/mobile/src/features/chat/components/MessageBubble.tsx:2462). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Price missing | 'Price not found' | apps/mobile/src/features/chat/components/cards/ProductComparisonCard.tsx:12; Chrome string spComparisonPriceNotFound |
| Spec missing | 'Not listed' | ProductComparisonCard.tsx:13; interactiveCards.ts:306 |
| Ungrounded URL | Dropped from the card | product-comparison-tool-service.ts:91 |
| Unresolved place | 'Not found on the map' or 'Could not be looked up' | apps/web/features/chat/components/messages/cards/ItineraryCard.tsx:27-33 |
| Route unavailable | Explains why (too few stops, missing places) | ItineraryCard.tsx:35-45 |
| Map tiles unavailable | 'The map could not be loaded. The stops are listed below.' | ItineraryCard.tsx:21-22 |
| Unrecognised kind | Text fallback | apps/extension/src/features/side-panel/bubbles.ts:138,259 |
| Mis-detected prose comparison | Original markdown stays; the card is a toggle | apps/web/features/chat/components/cards/MessageFormatCard.tsx:20-30 |
| Offline, cancel, retry | not handled in the code at card level | none found in the card files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/product-comparison-tool-service.test.ts`: Comparison tool (file exists; bodies not read)
- `apps/mobile/src/features/chat/components/cards/__tests__/ProductComparisonCard.test.tsx`: Mobile comparison (file exists)
- `apps/web/features/chat/components/cards/MessageFormatCard.test.tsx`: Format card (file exists)
- `apps/web/features/chat/components/cards/CardTokens.test.tsx`: Card styling of ComparisonCard and others (imports seen)
- `apps/web/features/chat/components/cards/CardRoundtrip.test.tsx`: Card roundtrip (imports ComparisonCard)
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Chrome cards including a map card and a read-only unknown card (test names read)
- `packages/contracts/types/src/__tests__/interactive-cards.types.test.ts`: Card types (file exists)
- `apps/web/lib/places/places-tool.test.ts`: Places lookups used by itinerary (file exists)

**Test scenarios**

- **Grounded comparison**
  1. On Web ask which of two named laptops to buy under a budget.
  2. Check each price and buy link.
  - Expected: Every price and link was returned by this turn's search; an unknown price shows 'Price not found'.
- **Itinerary**
  1. Ask for a one-day plan in a city.
  - Expected: Card with numbered stops and route links appears above the prose.
- **Mobile Local**
  1. Run the same on Mobile in Local mode.
  - Expected: No card (tools are cloud side); in Cloud mode the map shows.
- **Chrome**
  1. Run the comparison in the Chrome side panel.
  - Expected: Comparison tiles render.
- **Absent controls**
  1. Ask to book a table and to find free meeting slots.
  - Expected: Text only; no selectable choices or grid.

**Where to look when it fails**

- tool-loop logs for compare_products and plan_itinerary.
- normalizeMessageMetadata drops cards beyond 4 (apps/web/lib/server/neon-chat.interactive-cards.test.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **No availability data in product cards** Affects: All apps. Evidence: ProductComparisonProduct fields (interactive-cards.ts:351-360). Work needed: Source of stock data, schema and UI
- **Reservation choices missing** Affects: All apps. Evidence: S22.22; no code. Work needed: Booking source, card kind, consent flow
- **Calendar availability grid missing** Affects: All apps. Evidence: S22.23; no code. Work needed: Calendar connector data and grid card
- **Brief out of date for itinerary and mobile and Chrome comparison** Affects: Documentation. Evidence: InteractiveCardBlock.tsx:38-55; interactiveCards.ts:109,316. Work needed: Update the brief; live-check each app
- **Desktop Tauri is not a cards path; Electron shows hosted web** Affects: Desktop. Evidence: doc: docs/product/definition.md:452. Work needed: Live check in Electron
- **Cards absent in Local and own-key chat** Affects: Local and own-key users. Evidence: Cards come from the server tool loop (request-processor.ts:1403). Work needed: Decide whether local tools should produce cards
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- F022-04
- F022-01
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud

## Unknown

- Whether reservation or calendar scenarios are handled by connectors elsewhere.
- Whether the Chrome and Mobile cards have been live-checked.
- Plan allowance for itinerary and comparison tool calls.
- Bodies of the listed tests.
- Whether Electron Desktop shows these cards identically to Web.

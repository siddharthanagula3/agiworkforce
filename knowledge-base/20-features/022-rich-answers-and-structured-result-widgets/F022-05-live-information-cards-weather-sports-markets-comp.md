---
id: "F022-05"
type: "feature"
title: "Live information cards (weather, sports, markets, company, flights, packages)"
aliases: ["Live information cards", "Weather card", "Sports widgets", "Market price chart", "Company summary card", "Flight status card", "Package tracking card", "S22.12", "S22.13", "S22.14", "S22.15", "S22.16", "S22.20", "S22.21"]
area: "22 Rich answers and structured result widgets"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.12", "S22.13", "S22.14", "S22.15", "S22.16", "S22.20", "S22.21"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "F022-01", "F022-03", "surface:web", "surface:mobile", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-05 Live information cards (weather, sports, markets, company, flights, packages)

Not built in any app. Weather, sports schedules and scores, market price charts, company summaries, flight status and package tracking have no card kind, no data source and no renderer. People get a text answer, possibly with web search sources, a chart or an answer-ui table written by the model.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.12](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2212), [S22.13](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2213), [S22.14](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2214), [S22.15](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2215), [S22.16](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2216), [S22.20](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2220), [S22.21](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2221).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would show live facts as structured cards instead of prose. Today it does nothing; this page records the gap so it can be planned.

**Why it exists.** Leading assistants render weather, sports, price, company, flight and tracking widgets. The brief lists seven items (S22.12 to S22.16, S22.20, S22.21) as missing on all six apps.

**Who uses it.** Intended for everyday users asking time-sensitive questions on all six apps. No one can use it yet.

**Problems it solves**

- Planned: reading live numbers at a glance and trusting they are current.

**Use cases**

- Planned: 'weather this weekend' shows a forecast card.
- Planned: 'Lakers score' shows a scoreboard.
- Planned: 'AAPL price' shows a price chart.
- Planned: 'track my package' shows carrier and ETA.

## 2. User experience

**Where to find it**

- Nowhere. No app has these cards (absence search over web chat, unified chat, mobile chat and contract types found no weather, sports, market, company, flight or tracking card).

**Before you start**

- none, feature not built

**Screens and controls**

- none

**Journey**

1. Person asks a live-data question and reads the text reply; the model may cite web search sources (F022-01) or draw a chart it writes itself (F022-03).

**What the person sees and gets**

- Text answer only.

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The generic parts a future card would reuse exist: the card kind list and registry (packages/contracts/types/src/interactive-cards.ts:16-25) and the answer-ui card with table, chart, keyvalue and status blocks (packages/contracts/types/src/answer-ui.ts:35-59).

**Incomplete**

- No live-data tool for weather, sports, markets, companies, flights or packages was found in the tool metadata read (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts lists search_maps, search_places, plan_itinerary, compare_products, ask_clarifying_questions and others; none of these topics).

**Present but disconnected or switched off**

- none found

**Not available**

- All six apps: no card kinds for these topics. The draft is confirmed: interactive-cards.ts:16-25 lists exactly eight kinds, none are live-information cards.

## 4. Required behaviour

**Established requirements**

- Weather answers render as a weather card (conditions, temperature, forecast). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.12)
- Sports schedules render as a schedule widget. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.13)
- Sports scores and standings render as a scoreboard or standings table. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.14)
- Stock and market price answers render a price chart widget. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.15)
- Company and financial answers render a summary card (key figures, ticker). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.16)
- Flight status answers render a flight-status card (times, gate, status). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.20)
- Package-tracking answers render a tracking card (carrier, status, ETA). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.21)

**Acceptance criteria**

1. Today: asking each question returns no card on any app.
2. Future: each card kind is in KNOWN_INTERACTIVE_CARD_KINDS and in the registry of each app that claims support.
3. Future: a card never shows data older than its stated check time.
4. Future: a failed data fetch shows a plain error, not remembered values.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Live data needs a paid or keyed outside data source per topic, which the repo does not list [inferred from web-search-providers.json containing only a search provider].
- Any new kind must be added to every client capability list or servers will not offer the tool (request-processor.ts:1300-1425 pattern) [inferred].
- Empty and failure states for these cards are not established in any document; each future card must define its own [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one kind per topic or a generic 'facts' kind built on answer-ui blocks.
- [proposed] Record data vendor choices in docs/decisions before building.
- [proposed] Follow the places pattern: grounded tool, billed per call, never answer from memory.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Known card kinds | `packages/contracts/types/src/interactive-cards.ts` | List of 8 kinds at :16-25; where a new kind would be registered [proposed] |
| schema | Cloud card parsing | `packages/contracts/cloud-contracts/src/interactive-cards.ts` | Validation of card bodies [proposed home for new schemas] |
| schema | Answer UI blocks | `packages/contracts/types/src/answer-ui.ts` | Generic blocks (table, chart, keyvalue, status, readout) a model can use today |
| component | Web card registry | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Where a Web and Desktop renderer would register (:38) |
| component | Mobile card block | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Where a Mobile renderer would register (:1003) |
| component | Chrome card registry | `apps/extension/src/features/side-panel/bubbles.ts` | Chrome registry at :241 |
| config | Web client capability list | `apps/web/lib/hooks/useChatStream.ts` | WEB_INTERACTIVE_CARD_KINDS at :1334 |
| config | Mobile capability list | `apps/mobile/src/features/chat/utils/clarifyCard.ts` | MOBILE_INTERACTIVE_CARD_CAPABILITY at :7 |
| service | Server tool offers | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Where a new tool would be offered (:1300-1425) |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares each tool's action class; none exist for these topics |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks a live-data question. | device | No card code exists, so the normal chat turn applies |
| Server may run web_search and return a text answer. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6288 |
| No card is produced. | our servers | No tool for these topics in tool-metadata.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None created by this feature | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable until built. No live-data provider is registered in the repo (web-search-providers.json:4-8 lists search only).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (feature not built). |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Not applicable. Any future live card needs the internet, so it cannot be fully local [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person asks a live-data question | Text answer, optional sources | No card code found |
| Loading, empty, error, retry, offline for these cards | not handled in the code (the cards do not exist) | No card files found by the absence search |
| Unknown card kind sent by a server | Clients show a text fallback card with headline and text | apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx (fallback near :1160); apps/extension/src/features/side-panel/bubbles.ts:138,259 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/interactive-cards.types.test.ts`: Card types (file exists; bodies not read)
- `packages/contracts/cloud-contracts/src/__tests__/answer-ui.test.ts`: Answer UI schema (file exists)

**Test scenarios**

- **Absence check**
  1. On each app ask for weather, a score, a stock price, a company summary, a flight status and a parcel.
  - Expected: Text answers only; no card on any app.
- **Unknown kind fallback**
  1. Send a card with an unrecognised kind to Web and Mobile test builds.
  - Expected: Headline and text fallback shown.
- **Kind list guard**
  1. Read KNOWN_INTERACTIVE_CARD_KINDS.
  - Expected: Eight kinds, none live-information.

**Where to look when it fails**

- Search the repo for the card kind names after any future work.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No weather card** Affects: All apps. Evidence: S22.12 missing; no code. Work needed: Data source, kind, renderers, tests
- **No sports schedule or score cards** Affects: All apps. Evidence: S22.13 and S22.14 missing. Work needed: Same
- **No market price chart** Affects: All apps. Evidence: S22.15 missing. Work needed: Market data source; reuse the chart renderer (F022-03)
- **No company summary card** Affects: All apps. Evidence: S22.16 missing. Work needed: Data source and card
- **No flight status card** Affects: All apps. Evidence: S22.20 missing. Work needed: Flight data source and card
- **No package tracking card** Affects: All apps. Evidence: S22.21 missing. Work needed: Carrier data source and card
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- F022-01
- F022-03
- surface:web
- surface:mobile
- surface:chrome

## Unknown

- Whether any connector or MCP app already shows weather or similar through mcp-app.v1.
- Owner decisions on data vendors.
- Whether CLI or VS Code have any text-mode equivalent.

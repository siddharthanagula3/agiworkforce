---
id: "F093-09"
type: "feature"
title: "Ranking and de-duplicating sources"
aliases: ["Ranking and de-duplicating sources", "source ranking", "Result deduplication (S93.15)", "Relevance ranking (S93.16)", "Source freshness evaluation (S93.17)", "rankSources", "dedupeSearchSources"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.15", "S93.16", "S93.17"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "F093-07", "F093-10", "F093-11", "file:packages/ai/search/src/source-ranking.ts", "file:packages/contracts/types/src/search-provider.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-09 Ranking and de-duplicating sources

After a search, the platform orders the sources by evidence of a primary account, removes repeats of the same page, and computes a freshness class from the publication date. Ranking and URL dedupe are live. The freshness class and the delivery-based merge exist in code, but nothing was found that shows or uses them.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.15](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9315), [S93.16](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9316), [S93.17](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9317).

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

**What it does.** Orders one search call's results with weighted signals (recency, publisher page, structured data, repeats across searches, https, language, near-duplicate, boilerplate); merges repeated URLs; defines fresh, recent, stale and unknown by age [packages/ai/search/src/source-ranking.ts:67-130, 333-384; packages/contracts/types/src/search-provider.ts:26-27, 130-146].

**Why it exists.** The first source is numbered [1] and read first, so the primary account of a fact should come before a retelling [apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2774-2781 comment].

**Who uses it.** Every Cloud turn that searches; readers see the order; engineers tune one weights table [source-ranking.ts:56-76].

**Problems it solves**

- Duplicate links padding the citation list
- Aggregators outranking the original publisher
- Undated pages treated like fresh ones

**Use cases**

- A news question where several results retell one story
- A research run merging sources from many rounds
- Choosing which source becomes [1]

## 2. User experience

**Where to find it**

- No control of its own. The effect is the order and count of source chips on web, and the source list on mobile [apps/web/features/chat/components/messages/MessageBubble.tsx:3859; apps/mobile/src/features/chat/utils/inlineCitationMarkers.ts].

**Before you start**

- A turn that searched (F093-07) or a Deep Research run (F093-11).

**Screens and controls**

- Source chips and the Research sources panel (title 'Research sources') [apps/web/features/chat/components/research/ResearchPanel.tsx:551].

**Journey**

1. 1. A search returns results.
2. 2. The server ranks them and numbers them.
3. 3. The user reads [1], [2] in that order and opens a chip.

**What the person sees and gets**

- Numbered sources in ranked order.
- A freshness label for the user: not found in any screen (see gaps).

**Settings**

- none found; weights are constants [source-ranking.ts:67-76].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chat: each search call's results are ranked, then numbered; nothing is dropped by ranking [tool-loop.ts:1437-1457, 2774-2786].
- Research: each search frame's results are ranked before joining the run's sources [research-loop.ts:1085-1117].
- Signals and weights: recency 0.2, publisher page 0.3, structured data 0.1, cited in several searches 0.15, https 0.05, language 0.15, duplicate -0.35, boilerplate -0.25 [source-ranking.ts:67-76]. There is no query-term or title-match signal, unlike the first draft.
- Near-duplicate: a later result whose title and snippet words overlap 0.85 or more with a higher-ranked one is penalised, not removed; ties keep provider order [source-ranking.ts:84-90, 350-384].
- URL dedupe in chat uses normalizeSourceUrlKey for numbering [tool-loop.ts:4686-4696]; in research SourceAggregator.add merges by the same key and backfills title, snippet and date [research-loop.ts:855-895]; persistence dedupes by canonical-URL id, first seen wins, up to 20 [assistant-turn-sources.ts:86, 215-230].
- Canonical URL ignores scheme, www, trailing slash and tracking parameters (utm_*, fbclid, gclid, msclkid, mc_cid, mc_eid, ref) [packages/contracts/types/src/search-provider.ts:62-80].

**Incomplete**

- Freshness classes (7 days or less fresh, 90 or less recent, older stale, none unknown) are computed when a source is created and stored in provenance, but no reader in apps or packages outside contracts was found [search-provider.ts:26-27, 130-146; grep for freshness readers found none]. Generic search dates travel as page_age and the persistence reader files page_age under indexedAt, so these sources probably persist as 'unknown' [inferred from tool-loop.ts:1544, research-loop.ts:985, assistant-turn-sources.ts:138-143].
- dedupeSearchSources (keeps the weaker delivery claim) runs only inside webSearchSources, which has no production caller [apps/web/lib/web-search/search-provider.ts:158-180; web-search-tool.ts:484-491].

**Present but disconnected or switched off**

- Delivery-aware merge: code and tests exist, not reached in production [packages/contracts/types/src/__tests__/search-provider.test.ts].

**Not available**

- Ranking on mobile, CLI, VS Code, Chrome is done by the server for Cloud turns; no separate ranking was found on those apps (none found).

## 4. Required behaviour

**Established requirements**

- Duplicate results (same canonical URL) are merged. (source: brief S93.15)
- Results are ranked by relevance before use. (source: brief S93.16)
- Each source is classified by freshness (age from publication date). (source: brief S93.17)
- No list of good domains; ranking uses properties of the result only. (source: packages/ai/search/src/source-ranking.ts:1-22 header comment)

**Acceptance criteria**

1. Two results with the same page but different tracking parameters appear once in the numbered list.
2. A dated page ranks above an otherwise equal undated page.
3. A near-copy of a ranked result sorts behind it.
4. Equal scores keep provider order.
5. A page dated 6 days ago classifies fresh, 60 days recent, 200 days stale, no date unknown.
6. Ranking drops no result in chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief item 'relevance ranking' is met only through evidence signals, not query relevance [inferred from source-ranking.ts:67-76].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the freshness class on source chips or tell the model, or remove the unused code.
- [proposed] Fix the page_age versus published date mapping so freshness is real.
- [proposed] Use one URL normalizer: contracts, the shared utils key, and the client chip code each list tracking parameters separately.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | source-ranking | `packages/ai/search/src/source-ranking.ts` | Weights, scoring, rankSources |
| schema | search-provider contract | `packages/contracts/types/src/search-provider.ts` | canonicalSourceUrl, searchCitationId, classifySourceFreshness, dedupeSearchSources |
| service | rankWebSearchResults | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Ranks one chat search call |
| service | rankResearchResults | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Ranks one research search frame |
| service | SourceAggregator | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Run-wide dedupe and stable positions |
| service | source-url-key | `apps/web/lib/web-search/source-url-key.ts` | Re-exports normalizeSourceUrlKey from shared utils |
| service | assistant-turn-sources | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts` | Persistence dedupe by canonical id and provenance |
| service | search-provider registry | `apps/web/lib/web-search/search-provider.ts` | webSearchSources (no production caller) |
| service | page metadata enrichment | `apps/web/lib/web-search/web-search-tool.ts` | Fills missing title, snippet, date before ranking |
| component | citationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Client URL normalization for [n] markers |
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Renders a source chip |
| test | source-ranking tests | `packages/ai/search/src/__tests__/source-ranking.test.ts` | Ranking behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Provider results come back; missing titles, snippets and dates are filled from the page's own metadata. | our servers | tool-loop.ts:2774-2781; web-search-tool.ts:733-775 |
| Results are ranked, then each URL gets a position in the turn's list; a repeat URL keeps its first position. | our servers | tool-loop.ts:1445-1457, 4686-4696 |
| Sources stream to the client as a cumulative list; the persisted copy is deduped by canonical id and stamped with provenance. | our servers | tool-loop.ts:1529-1560; assistant-turn-sources.ts:190-230 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Persisted source with id, canonical identity, content version, provenance (provider, retrieved, indexed, delivery, freshness) | Assistant message metadata | yes with the conversation | Follows the conversation; 20 per turn |

**Models and providers.** Ranking is deterministic code and uses no model. Native-search providers return their own order, which is ranked the same way in research frames [research-loop.ts:1085-1117].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for ranking itself. |
| Permissions | none found. |
| Subscription | none found; applies to every plan that can search. |
| Limits and metering | 20 persisted sources per turn; turn source budget is calls times 5 plus fetches [assistant-turn-sources.ts:86; tool-loop.ts:4677]. |
| Feature flags | none found. |
| Model compatibility | Independent of the model. |
| Provider restrictions | Delivery tag and provider id depend on provider declaration; generic results default to 'indexed' at persistence [assistant-turn-sources.ts:126-129]. |
| Local mode | Server ranking does not run in Local mode; CLI and internal desktop searches were not found to rank (none found). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty results | Nothing to rank; 'No results found' text | web-search-tool.ts:513-514 |
| Unparseable or missing date | Freshness class unknown, ageDays null | search-provider.ts:130-137 |
| Future date | Age floors at 0 and the source reads fresh; recency signal gives nothing for dates in the future | search-provider.ts:136; source-ranking.test.ts title 'gives nothing for a page older than the recency horizon or dated in the future' |
| URL that does not parse | Falls back to lower-cased text as the key | search-provider.ts:76-78 |
| Source with no usable URL | Identity falls back to a content fingerprint | search-provider.ts:116-122 |
| Accessibility | not traced | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/search/src/__tests__/source-ranking.test.ts`: 14 cases: recency, horizon, publisher from title, duplicates, ordering ties
- `packages/contracts/types/src/__tests__/search-provider.test.ts`: 23 cases: canonical key, shared id across providers, freshness, dedupe
- `apps/web/lib/web-search/search-provider.test.ts`: provider list shape
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.test.ts`: 79 cases including SourceAggregator dedupe across protocol, www, trailing slash and tracking variants
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.test.ts`: 33 cases: one entry per page, order of arrival
- `packages/ui/unified-chat/src/components/markdown/citationMarkers.test.ts`: client marker and URL normalization

**Test scenarios**

- **Dedupe variants**
  1. Return the same article as http, https with www and with utm parameters
  - Expected: One numbered source.
- **Primary before retelling**
  1. Search a story with a publisher page and an aggregator copy
  - Expected: The publisher page gets a lower number.
- **Freshness classes**
  1. Run classifySourceFreshness with ages 6, 60, 200 days and no date
  - Expected: fresh, recent, stale, unknown.
- **Tie order**
  1. Two results with equal signals
  - Expected: Provider order is kept.

**Where to look when it fails**

- Compare the order in the tool result text with the x_search_results frame positions.
- Inspect persisted message metadata provenance for freshness values.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Freshness is computed and stored but not shown or used.** Affects: All apps. Evidence: search-provider.ts:130-146; no consumer found. Work needed: Show it or tell the model, or remove it.
- **Generic search dates likely persist as indexed time, so freshness is unknown.** Affects: Web, mobile, Chrome persisted sources. Evidence: tool-loop.ts:1544; assistant-turn-sources.ts:138-143. Work needed: Map the date to the published field; add a test.
- **Weaker-delivery merge is not reached in production.** Affects: Delivery honesty. Evidence: web-search-tool.ts:484-491. Work needed: Wire webSearchSources or drop it.
- **Three URL normalizers with different tracking lists.** Affects: Dedupe consistency between server and client. Evidence: search-provider.ts:62; citationMarkers.ts:16-18; utils source-url (not read). Work needed: One shared normalizer.
- **Brief item 'relevance ranking' is evidence-based, not query-based.** Affects: Result quality. Evidence: source-ranking.ts:67-76. Work needed: Decide if a query-match signal is wanted.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- F093-07
- F093-10
- F093-11
- file:packages/ai/search/src/source-ranking.ts
- file:packages/contracts/types/src/search-provider.ts

## Unknown

- How the shared utils normalizeSourceUrlKey differs from the contracts canonical URL.
- Whether any mobile or desktop screen reads provenance.freshness (searched apps and packages, none found).
- The exact message table name.

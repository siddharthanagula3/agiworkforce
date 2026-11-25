---
id: "F034-09"
type: "feature"
title: "Empty and unavailable search states"
aliases: ["Search kinds and filters not built", "Source-type filter", "Academic search", "News search", "Video search", "Image search", "Social or X search", "Language filter", "Region or geography filter", "Add source to answer", "Remove source from answer", "Save source to Project", "S34.09", "S34.10", "S34.11", "S34.12", "S34.13", "S34.14", "S34.16", "S34.17", "S34.28", "S34.29", "S34.30"]
area: "34 Search experiences"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S34.09", "S34.10", "S34.11", "S34.12", "S34.13", "S34.14", "S34.16", "S34.17", "S34.28", "S34.29", "S34.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "file:apps/web/lib/web-search/web-search-tool.ts", "file:apps/web/features/chat/lib/global-search-categories.ts", "api:POST /api/llm/v1/chat/completions", "provider:perplexity", "SYS-api-and-contracts", "SYS-inference-providers", "SYS-connectors-plugins-and-skills", "F034-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-09 Empty and unavailable search states

A list of search controls the product does not have: choosing source types, academic, news, video, image or social search, language and region filters, and adding, removing or saving a source on an answer. There is nothing to click in any app. The web search tool takes only query text. Nearby: allowed and blocked site lists and Search dialog chips.

Area: [34. Search experiences](README.md). Requirement items: [S34.09](../../10-requirements/capabilities/034-search-experiences.md#s3409), [S34.10](../../10-requirements/capabilities/034-search-experiences.md#s3410), [S34.11](../../10-requirements/capabilities/034-search-experiences.md#s3411), [S34.12](../../10-requirements/capabilities/034-search-experiences.md#s3412), [S34.13](../../10-requirements/capabilities/034-search-experiences.md#s3413), [S34.14](../../10-requirements/capabilities/034-search-experiences.md#s3414), [S34.16](../../10-requirements/capabilities/034-search-experiences.md#s3416), [S34.17](../../10-requirements/capabilities/034-search-experiences.md#s3417), [S34.28](../../10-requirements/capabilities/034-search-experiences.md#s3428), [S34.29](../../10-requirements/capabilities/034-search-experiences.md#s3429), [S34.30](../../10-requirements/capabilities/034-search-experiences.md#s3430).

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

**What it does.** Records what is missing so no one assumes it exists. It also names the closest things that are built, so a tester knows what not to expect.

**Why it exists.** Perplexity, ChatGPT and Claude offer some of these (for example academic or news modes, or source filters). The brief lists them as requirements; the code has none, and four are marked not applicable.

**Who uses it.** Product owners, engineers planning search work, and testers who must not report a missing control as a bug that was never built.

**Problems it solves**

- Stops false 'done' claims.
- Shows where the nearest working controls are.
- Gives each gap an owner and an evidence line.

**Use cases**

- A tester is told to find an 'Academic' mode: this page says there is none.
- An engineer plans a news-only search: starts from the single query field in the web search tool.
- A reviewer asks if a user can remove a bad source and regenerate: no, nothing exists.

## 2. User experience

**Where to find it**

- Nothing to click for source-type, academic, news, video, image, social, language, region, add source, remove source or save source on any of the six apps (searched the web search tool, apps/cli, apps/mobile, apps/extension, apps/extension-vscode).
- Nearest control on Web: the global Search dialog 'Search category' chips All, Artifacts, Sessions, Code, Projects, Scheduled (and 'Local Code' on the desktop host); these filter your own content, not web sources (apps/web/features/chat/lib/global-search-categories.ts:1-8; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:72,541).
- Nearest control for web sources: in a Deep Research plan, 'Only these sites' and 'Never these sites' lists on Web and Mobile (apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx:283-295; apps/web/features/chat/components/research/ResearchPlan.tsx:283,290).
- Nearest control for saving: a finished research report can be saved to a Project from the report view (apps/web/features/chat/components/research/ResearchReportView.tsx:139,282); this saves the report, not a single source.

**Before you start**

- None, because the features do not exist.
- For the nearest controls: a Deep Research run (site lists) or a saved report (save to project).

**Screens and controls**

- None for the missing features.
- Search dialog chips (All, Artifacts, Sessions, Code, Projects, Scheduled) and the date filter (S34.15, separate feature).
- Research plan site lists: free-text domain entries, up to 32 per list (ResearchPlanOptions.tsx:27).

**Journey**

1. 1. A person looks for a news, academic, image, language or region control: there is none.
2. 2. The only way to steer a web search is to write it in the prompt (the model sends a text query) or, in a Deep Research plan, to set allowed and blocked sites.
3. 3. To drop a bad source, the person must ask in a new message; no control regenerates without it.

**What the person sees and gets**

- No dedicated message. The web search tool schema has one field, the query (apps/web/lib/web-search/web-search-tool.ts:70-79).
- If a search fails or finds nothing the assistant says so (see F034-08 and the CLI messages in apps/cli/src/features/exec/tools/web/mod.rs:392-411).

**Settings**

- None for these features.
- API field research_sources with allow_domains and deny_domains (up to 32 each) steers which sites a run may read (apps/web/public/openapi.json:768-795).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Allowed and blocked site lists: accepted on the chat request, passed to the search backend as a domain filter and checked on every result (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5272-5273; apps/web/lib/web-search/web-search-tool.ts:433-458).
- Mobile and Web research plan lists 'Only these sites' and 'Never these sites' (ResearchPlanOptions.tsx:283-295).
- CLI drops results from sites a workspace administrator disallows (apps/cli/src/features/exec/tools/web/mod.rs:462-471).
- Search dialog category chips for own content (GlobalSearchDialog.tsx:541).

**Incomplete**

- The domain lists have no control in ordinary chat on Web or Mobile; only the Deep Research plan and the API expose them. [inferred from where the field is set: useChatStream.ts and WebChatPage.tsx:6270 pass it for research]
- The nearest 'save' saves a whole report to a Project, not one source.

**Present but disconnected or switched off**

- The server search provider (Perplexity) is called with only query, result count and an optional domain filter; its other options are not used (web-search-tool.ts:300-308). [inferred from the request body]

**Not available**

- S34.09 source-type search: marked not applicable everywhere in the brief.
- S34.10 academic, S34.11 news, S34.12 video, S34.13 image, S34.14 social search: missing on all six apps.
- S34.16 language filter and S34.17 region filter: missing on all six apps.
- S34.28 add source to an answer, S34.29 remove source and regenerate, S34.30 save a source to a Project or notebook: not applicable in the brief; no code found.
- The CLI web_search tool sends query and max_results only (apps/cli/src/features/exec/tools/web/mod.rs:308-314,444-446).

## 4. Required behaviour

**Established requirements**

- S34.09 Search by source type is marked not applicable on every app. (source: S34.09)
- S34.28 add source to an answer, S34.29 remove source from an answer and S34.30 save source to Project or notebook are marked not applicable on every app. (source: S34.28, S34.29, S34.30)
- Academic, news, video, image and social search, and language and region filters should exist as distinct modes or filters. (source: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17 'Should' lines)
- All of S34.10 to S34.14, S34.16 and S34.17 are missing on web, desktop, mobile, cli, vscode and chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.10, S34.14, S34.16, S34.17)
- Include and exclude domains, and date-range filters, are separate items already covered (API done; date range web and desktop done). (source: S34.18, S34.15)
- The competitor policy requires comparing against ChatGPT and Claude (primary) and Perplexity, Gemini, Manus and Grok before material product choices. (source: doc: AGENTS.md section 10; docs/product/competitive-guidance.md)

**Acceptance criteria**

1. Searching each of the six apps finds no control named academic, news, video, image, social, language or region search.
2. The web search tool definition exposes only a query field.
3. A Deep Research plan lets the person enter allowed and blocked sites, and results outside the allowed list are not returned.
4. No button on a cited source adds it to a Project or removes it from the answer.
5. The Search dialog category chips filter the person's own content only.
6. If any of these gets built, this page and the brief are updated in the same change.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Rows marked not applicable are decisions not to build; rows marked missing are open work. [inferred from the brief's status words: 'n/a' means does not apply]
- A first step toward news or academic search could reuse the domain filter, which needs no new provider. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a recency and a country option to the web search tool, only if the chosen provider accepts them (verify in the provider's current documentation first).
- [proposed] Offer allowed and blocked sites in ordinary chat, not only in Deep Research.
- [proposed] Add 'Save to Project' on a source card using the existing project knowledge upload path.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | webSearchToolDef | `apps/web/lib/web-search/web-search-tool.ts` | Server tool definition with a single query field and a result ceiling of 5 (line 56). |
| service | search provider call | `apps/web/lib/web-search/web-search-tool.ts` | Sends query, max_results and optional search_domain_filter (lines 300-308). |
| config | web-search-providers.json | `apps/web/lib/web-search/web-search-providers.json` | Lists the one registered search provider and its key environment name. |
| schema | research_sources request field | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates files, allow_domains, deny_domains, connectors (line 727) and passes the lists on (5272). |
| schema | OpenAPI research_sources | `apps/web/public/openapi.json` | Documents the field and its limit of 32 domains. |
| service | research-run-options | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Carries domain policy into research runs. |
| component | ResearchPlan (web) | `apps/web/features/chat/components/research/ResearchPlan.tsx` | 'Only these sites' and 'Never these sites' lists. |
| component | ResearchPlanOptions (mobile) | `apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx` | Same lists on Mobile with a 32-domain cap. |
| hook | useChatStream research options | `apps/web/lib/hooks/useChatStream.ts` | Sends allow and deny domains with a research request. |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | Search dialog with category chips for own content. |
| config | global search categories | `apps/web/features/chat/lib/global-search-categories.ts` | The chip list: All, Artifacts, Sessions, Code, Projects, Scheduled. |
| component | ResearchReportView save to project | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Saves a whole report to a Project (nearest 'save' control). |
| service | CLI web_search tool | `apps/cli/src/features/exec/tools/web/mod.rs` | Takes query and max_results; Brave or Tavily backend; workspace site rules. |
| command | CLI tool catalog entry | `apps/cli/src/platform/runtime/tool_catalog.rs` | Declares web_search among tools (line 623). |
| service | search budget and allowance | `apps/web/lib/web-search/search-budget.ts` | Per-turn search call limits (file name only; contents not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model decides to search and sends one text query to the server tool. | our servers | apps/web/lib/web-search/web-search-tool.ts:70-79 |
| The server posts the query, a result count and any allowed or blocked domains to the search provider. | outside service | web-search-tool.ts:300-308 |
| Results from sites outside the allow list or on the deny list are dropped before the model sees them. | our servers | web-search-tool.ts:458 |
| On the CLI the device posts query and count to Brave or Tavily, then filters by workspace site rules. | outside service | apps/cli/src/features/exec/tools/web/mod.rs:437-471 |
| Nothing happens for academic, news, video, image, social, language, region, add, remove or save: no step exists. | device | no code found by searching for those terms in apps/web/lib/web-search, apps/cli web tools, apps/mobile/stores/chat, apps/extension/src and apps/extension-vscode/src |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Allowed and blocked domain lists (max 32 each) | Request body only; the mobile plan keeps them in run state | Not stored as a user setting; research runs may keep them with the run (unknown) | unknown |

**Models and providers.** The search backend is Perplexity on the server (key name PERPLEXITY_API_KEY) and Brave or Tavily on CLI own-key. Search mode choices are not passed to any provider. No chat model setting changes search kind.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable: nothing to access. The nearest site lists need the signed-in chat route. |
| Permissions | Workspace administrators can restrict which sites the assistant may read; the CLI and server honour it (apps/cli/src/features/exec/tools/web/mod.rs:462; web-search-tool.ts:458). |
| Subscription | None found for these features. Search itself is billed as Agentic search (apps/web/public/openapi.json:762). |
| Limits and metering | Domain lists: at most 32 entries, each at most 253 characters (openapi.json:777-795). Search: 5 results per call and 3 calls per turn (web-search-tool.ts:54-56). |
| Feature flags | None found. |
| Model compatibility | Not applicable; the lists work for any model that can search. |
| Provider restrictions | A provider that cannot filter domains would need the post-filter; the code applies both a provider filter and a result check (web-search-tool.ts:433-458). |
| Local mode | none found in the code: no local implementation of any listed feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature requested | No control exists; not handled in the code. | searched the paths listed in execution steps |
| All results blocked by site rules (CLI) | Tool tells the model every result was on a disallowed website and to answer without web sources. | apps/cli/src/features/exec/tools/web/mod.rs:462-471 |
| Search finds nothing (CLI) | Tool tells the model nothing was found. | apps/cli/src/features/exec/tools/web/mod.rs:476-488 |
| Search backend missing key (CLI) | Message 'Web search not configured...' naming `agi login brave` and `agi login tavily`. | apps/cli/src/features/exec/tools/web/mod.rs:431-435 |
| Search provider down | Server returns upstream_error, rate_limited or timeout codes; CLI says 'Web search is unavailable'. | web-search-tool.ts:112-118; mod.rs:449-453 |
| Domain list over 32 entries | Rejected by the schema; the mobile UI stops adding at 32. | openapi.json:777; ResearchPlanOptions.tsx:27,120 |
| Accessibility | Search dialog chips use aria-pressed and a labelled group; no other control to assess. | GlobalSearchDialog.tsx:541-548 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/web-search/web-search-tool.test.ts`: Server web search tool; whether domain filtering is asserted was not read.
- `apps/web/lib/web-search/search-provider.test.ts`: Search provider adapter.
- `apps/web/lib/web-search/required-search.test.ts`: Rule for when a search is required.
- `apps/web/features/chat/components/research/__tests__/ResearchPlan.test.tsx`: Research plan card; whether it checks the site lists was not read.

**Test scenarios**

- **No search-kind controls**
  1. Open each of the six apps and look through composer, search dialog, chat menu and settings for academic, news, video, image, social, language and region options.
  - Expected: None found; any found means this page is out of date.
- **Tool schema**
  1. Open apps/web/lib/web-search/web-search-tool.ts and read the tool definition.
  - Expected: Only a query field is required and present.
- **Allowed sites**
  1. Start Deep Research on Web, enter 'nature.com' under 'Only these sites', run it.
  - Expected: Cited pages are only from that site.
- **Blocked sites**
  1. Add a news site under 'Never these sites' and run a research on a topic it covers.
  - Expected: That site never appears in Citations or More.
- **Save report**
  1. Open a finished report and save it to a Project.
  - Expected: The report file appears in the Project; no single-source save exists.

**Where to look when it fails**

- Server search error codes invalid_tool_input, not_configured, rate_limited, upstream_error, cancelled, timeout (web-search-tool.ts:112-118).
- CLI tool output strings listed in states_and_edge_cases.
- Request validation errors on research_sources for lists over 32 entries.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No academic, news, video, image or social search mode.** Affects: All six apps. Evidence: S34.10-S34.14 status lines; web-search-tool.ts:70-79. Work needed: Pick provider options, add a mode field to the tool and a control in each app; verify provider documentation first.
- **No language or region filter.** Affects: All six apps. Evidence: S34.16, S34.17; request body at web-search-tool.ts:300-308. Work needed: Add fields to the tool, request schema and a settings control.
- **Source-type filter, add, remove and save source are marked not applicable; no equivalent control exists.** Affects: All six apps. Evidence: S34.09, S34.28, S34.29, S34.30. Work needed: Owner decision to build or to drop from the brief.
- **Site lists are not available in ordinary chat on Web or Mobile.** Affects: Web, Desktop, Mobile. Evidence: Fields set only for research (apps/web/features/chat/pages/WebChatPage.tsx:6270). Work needed: Expose in the composer or settings if wanted.
- **Save is possible for a report but not for a single source.** Affects: Web and Desktop. Evidence: ResearchReportView.tsx:282. Work needed: Add a source-card action using project knowledge upload.
- **Own-key and Local modes have no search kind or filter support either.** Affects: CLI own-key, Mobile and Desktop Local. Evidence: apps/cli/src/features/exec/tools/web/mod.rs:308-314. Work needed: Same fields for Brave and Tavily bodies.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- file:apps/web/lib/web-search/web-search-tool.ts
- file:apps/web/features/chat/lib/global-search-categories.ts
- api:POST /api/llm/v1/chat/completions
- provider:perplexity
- SYS-api-and-contracts
- SYS-inference-providers
- SYS-connectors-plugins-and-skills
- F034-08

## Unknown

- Which options the current search providers accept for recency, language or country; not checked against provider documentation (AGENTS.md section 1 requires checking before building).
- Whether research runs persist the allowed and blocked site lists with the run.
- Whether the existing tests assert the domain filter; only file names were checked.
- Whether any internal Tauri desktop screen has such filters; apps/desktop/src was not searched in detail.
- The meaning of 'not applicable' for S34.09 and S34.28 to S34.30: no decision text was found in docs/decisions.

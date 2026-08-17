# Domain audit: Search + Deep Research

Scope: `apps/web/lib/web-search/**`, `apps/web/lib/url-fetch/**`,
`apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`, the built-in
`web_search`/`url_fetch` tools, `packages/ai/search`, `apps/web/app/api/search`
and `apps/web/app/api/memory/search`, plus reachability from mobile,
desktop (Tauri + Electron), and the Chrome/VS Code extensions. Benchmarked
against ChatGPT Web Search + Deep Research and Claude Web Search + Research.

## Summary

Deep Research (`research-loop.ts`) is one of the best-engineered features
found in this audit — a genuine plan → multi-round search → cited-synthesis
loop with cancellation, partial-failure handling, retry-that-carries-forward
prior sources with stable citation numbers, and durable persistence to a
`research_reports` table, all wired end-to-end into a polished web UI
(`ResearchActivity`, `ResearchPanel`, `ResearchReportView`) that matches or
exceeds what the benchmark research could confirm about ChatGPT/Claude's own
research UI (several of Claude's own research-UI details are explicitly
marked "UNVERIFIED" in the benchmark doc; AGI's equivalent is fully readable
in source and does more — e.g. a genuine per-run plan-step list and
markdown/PDF/DOCX export). Ordinary web search (`web_search`/`url_fetch`) is
similarly mature: provider-aware routing (native tool for
Anthropic/Google/OpenAI, a Perplexity-backed generic fallback for everyone
else, derived from the model-registry rather than hardcoded), budgeted
per-turn call limits, and prompt-injection-safe untrusted-content framing.

The gaps are all about **reach and consistency**, not about the core engine.
The multi-stage research experience quietly degrades to a plain single-turn
web-searched answer for two large audiences — Anthropic-backed conversations
and free-trial users — with the identical "Research" toggle and zero visual
indication anything is different (SEARCH-RESEARCH-001). The plan/progress
events and the persisted report are essentially web-only: Desktop Cloud
parses the progress events into state and then never renders them; Mobile and
the Chrome extension don't even parse them; and nothing outside the web app
can reopen a previously-run report (SEARCH-RESEARCH-002). Research is
strictly web-search-only — no read-only connector/connected-data integration,
unlike Claude's own Research mode (SEARCH-RESEARCH-003). And there is no
semantic/vector retrieval anywhere in the product — chat/memory search is
ILIKE substring matching, and a fully-built embeddings gateway sits unused
(SEARCH-RESEARCH-004).

One genuinely pleasant surprise: Desktop's **Local mode** ships a completely
separate, native, multi-agent research engine (Rust, `core/research/`,
DuckDuckGo by default with no API key required, Perplexity as an optional
upgrade) with its own dedicated `DeepResearchPage` — a legitimately
local-first, privacy-preserving research capability neither ChatGPT nor
Claude currently offers, cleanly gated behind the Local/Cloud trust boundary
with an honest toast ("Deep research runs on this device and is available in
Local mode") when a Cloud/BYOK session tries to reach it.

## What's already strong (do not rebuild)

| Capability                                                         | Where                                                                                                                 | Evidence                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan → search rounds → cited synthesis loop                        | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`                                                       | Real planning turn (`parsePlanQueries`), bounded gathering rounds with `url_fetch` resolution passes, an empty-synthesis guarantee that never silently ends a run, and a `SourceAggregator` with stable insertion-order citation numbering            |
| Retry that resumes, not restarts                                   | `research-loop.ts:171-181,841-857`, `WebChatPage.tsx:3540-3557`                                                       | `priorSources`/`priorSteps` seed the aggregator and plan so a retry keeps stable citation numbers and doesn't re-run completed searches; a real "Retry" control renders only for error/interrupted runs                                               |
| Durable, cited report persistence                                  | `research-loop.ts` `persistRun`, `lib/services/research-report-service.ts`, `db/neon/0094_research_reports.sql`       | Every terminal path (completed/failed/interrupted, including abrupt client teardown) persists exactly once; never throws into the stream                                                                                                              |
| Cancellation                                                       | `research-loop.ts:925-951`, `flushCancellationIfRequested`                                                            | Both a client `AbortSignal` and a durable DB-polled cancellation flag are checked before every provider/fetch side effect, and a cancelled run still persists what it gathered                                                                        |
| Inline progress UI matching/exceeding the benchmark                | `ResearchActivity.tsx`                                                                                                | Phase label, live elapsed clock, round/search/source counts, a real per-step plan list with status icons, and a Retry button — several of these details are explicitly unconfirmed for Claude's own Research UI in the benchmark research             |
| Persisted-report artifact view with real export                    | `ResearchReportView.tsx`                                                                                              | Markdown/PDF/DOCX export reusing the existing document-export-service, incomplete-run warning banner, citation list with working hostnames                                                                                                            |
| Provider-aware web search routing, derived from the model registry | `packages/ai/search/src/web-search-support.ts`, `request-processor.ts:appendWebSearchTool`                            | Native tool for anthropic/google/openai, Perplexity-backed generic fallback for every other provider, all derived from `getProvidersWithImplementedHarnessFeature` rather than hardcoded provider lists                                               |
| Budgeted, prompt-injection-safe `web_search` tool                  | `apps/web/lib/web-search/web-search-tool.ts`                                                                          | Per-turn call caps (3 ordinary / 10 AGI Work / research loop's own larger budget), snippet length caps, `<untrusted_web_results>` framing instructing the model to treat results as data only                                                         |
| Local-mode native multi-agent research engine                      | `apps/desktop/src-tauri/src/core/research/*` (4,294 lines), `apps/desktop/src/features/research/DeepResearchPage.tsx` | DuckDuckGo-default (no API key), Perplexity optional upgrade, Quick/Standard/Deep depth tiers matching real backend source ceilings, dedicated history sidebar with search/delete/detail — cleanly gated to Local mode with an honest toast elsewhere |
| Citation chip design intentionally matches Claude, not ChatGPT     | `InlineSourceTags.tsx:14-16`                                                                                          | Explicit comment: "matching Claude's visual pattern where source names appear as chips rather than a separate footer list" — a deliberate choice, not an oversight, and a reasonable one (see "What NOT to copy" below)                               |

## Verified gaps

| ID                  | Sev | Surface          | Gap                                                                                                                                                                                                             | Benchmark                                                                             |
| ------------------- | --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| SEARCH-RESEARCH-001 | P1  | backend          | Deep Research silently degrades to a single-turn, unbranded web-search fallback for Anthropic models and free-trial users, with the identical "Research" toggle and no visible difference                       | Claude Research; ChatGPT Deep Research                                                |
| SEARCH-RESEARCH-002 | P1  | cross-surface    | Research progress/plan events and the persisted report are effectively web-only — Desktop parses but never renders them; Mobile/Chrome extension don't parse them; no non-web surface can reopen a saved report | Both products' research UI ships consistently across web/desktop/mobile               |
| SEARCH-RESEARCH-003 | P2  | backend          | Deep Research is strictly web-search-only — every client tool except `url_fetch` is stripped before gathering rounds, so no connector/connected-data integration                                                | Claude Research — combines web search + connected data (Google Workspace, connectors) |
| SEARCH-RESEARCH-004 | P2  | backend          | No semantic/vector retrieval anywhere — chat/memory/project-knowledge search is ILIKE substring matching; a working embeddings gateway has zero internal callers                                                | ChatGPT "Reference chat history"; Claude "Search and reference chats"                 |
| SEARCH-RESEARCH-005 | P2  | extension-chrome | Chrome extension side panel has no manual "Search the web" toggle or Deep Research entry point at all — search only fires when the model decides to call it                                                     | Claude in Chrome; ChatGPT composer's "Web search" tool entry                          |
| SEARCH-RESEARCH-006 | P3  | backend          | No image-result or current-data (weather/stock/sports) card types in search results                                                                                                                             | ChatGPT rich cards (benchmark itself flags this as unverified — low-confidence gap)   |

Full detail with file:line evidence for each row is in `domain-search-research.json`.

### SEARCH-RESEARCH-001 — the one that matters most

`route.ts:314-316` gates the entire multi-stage research loop behind
`processed.researchMode && !processed.freeTrial && processed.provider.toLowerCase() !== 'anthropic'`.
The route's own comment justifies excluding Anthropic because "their raw
streams are only normalized by buildStreamResponse." That justification
appears **stale**: `tool-loop-anthropic.ts`'s own header comment documents
that this normalization (`buildToolLoopStream` → `chunksToOpenAiSse` via
`OpenAIWireAssembler`) was generalized from an Anthropic-only bridge months
ago specifically so every provider — including Anthropic — reaches the
tool loop on the same OpenAI-shaped SSE wire. That is the exact function
`research-loop.ts`'s own `runTurn()` calls for every provider today. Nothing
in the current code appears to block Anthropic from taking the same
multi-turn path other providers use.

The practical effect: an Anthropic conversation with "Research" turned on
gets `applyResearchMode()` instead — a system-prompt injection plus the
native Anthropic search tool forced to `max_uses: 20` for **one** turn. No
`x_research_status`/`x_research_plan` events are ever emitted, so
`ResearchActivity` (the plan/progress header) never mounts, and no
`research_reports` row is ever written, so the Research panel's "Report" tab
permanently reads "No saved report yet — Deep Research runs save their
report here when they finish" for that conversation. The composer's toggle
itself gives no indication of any of this: `modelSupportsResearch`
(`ChatComposerNew.tsx:732-733`) is gated purely on catalog capability, so it
renders and enables identically regardless of provider. A user who explicitly
turns on "Deep Research" on a Claude model gets a plain web-searched answer
with none of the branding, plan visibility, or persisted-report behavior the
same toggle produces on every other provider — and no way to tell from the
UI that this happened.

## What NOT to copy

- **Claude's block-level citation chips, not ChatGPT's per-claim inline
  chips.** `InlineSourceTags.tsx` explicitly matches Claude's pattern (source
  chips after the response, not mid-sentence). This is a reasonable,
  deliberate choice — cross-cutting-and-complaints.md documents that both
  patterns are live in production today, and per-claim inline chips add
  layout complexity for marginal benefit. Do not "fix" this to chase
  ChatGPT's pattern; it isn't broken.
- **Do not copy ChatGPT's provider-substitution failure mode into the
  research-toggle fix.** The lesson from SEARCH-RESEARCH-001 is the opposite
  of a documented ChatGPT complaint (cross-cutting-and-complaints.md §6:
  "the selected model doesn't visibly change response behavior... described
  by some users as the model selector becoming 'decorative'"). Whatever fix
  ships for Anthropic research should make the difference either disappear
  (unify the two paths) or be visibly disclosed — never leave a control that
  silently no-ops depending on hidden state.
- **Rich current-data/shopping cards (SEARCH-RESEARCH-006) are explicitly
  low-confidence.** The benchmark research itself could not confirm ChatGPT's
  current rich-card behavior first-party and flags it UNVERIFIED. Do not
  treat this as a confirmed parity gap worth urgent investment — it is filed
  at P3 specifically because the evidence for "this is table stakes" is weak
  on both sides.

## Surface reachability summary (research-loop.ts and `/api/research/reports`)

| Surface                                  | Sends `research: true`                                                                                                                          | Renders plan/progress                                            | Can reopen a saved report           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Web                                      | Yes                                                                                                                                             | Yes (`ResearchActivity`)                                         | Yes (`ResearchPanel` → `ReportTab`) |
| Desktop, Electron shell (default config) | Yes (loads the hosted web app directly)                                                                                                         | Yes                                                              | Yes                                 |
| Desktop, Tauri shell, Cloud mode         | Yes                                                                                                                                             | **No** — events parsed into state, never rendered                | **No** caller found                 |
| Desktop, Tauri shell, Local mode         | n/a — separate native engine (`DeepResearchPage`), not this backend                                                                             | Yes, via its own `ResearchProgress`/`ResearchReport` components  | Yes, via its own `ResearchHistory`  |
| Mobile                                   | Yes (`AddToChatSheet` "Deep research" toggle)                                                                                                   | **No** — `toolCallAccumulator.ts` has no research-event handling | **No** caller found                 |
| Chrome extension                         | **No** — no toggle exists                                                                                                                       | n/a                                                              | **No** caller found                 |
| VS Code extension                        | Out of scope — CLI-agent product with its own one-turn "Browse the web" context flag (GAP-126, already Done); not a Cloud Deep Research surface | n/a                                                              | n/a                                 |

## What NOT to build

- A separate "Local Deep Research" web UI to mirror desktop's native engine —
  the two are architecturally different (LLM-orchestrated cloud loop vs.
  on-device multi-agent orchestrator) and the trust-boundary split
  (`AGENTS.md` "one Desktop surface, two shells" / Local-Cloud separation) is
  the right design, not a gap. Building it on web would require either a
  server-run swarm orchestrator or shipping the Rust engine to WASM — neither
  is justified by the current gap evidence.
- A depth selector (Quick/Standard/Deep) for the **Cloud** research loop just
  because Desktop's Local engine has one. Neither ChatGPT nor Claude expose
  per-request research-depth controls on their cloud research products
  either; the current fixed, environment-tunable budget (`maxIterations`/
  `maxSearches`/`budgetMs`) is consistent with the benchmark.

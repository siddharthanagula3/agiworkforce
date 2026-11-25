---
id: "AREA-093"
type: "area"
title: "Search, retrieval, and context components"
features: ["F093-01", "F093-02", "F093-03", "F093-04", "F093-05", "F093-06", "F093-07", "F093-08", "F093-09", "F093-10", "F093-11", "F093-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 93. Search, retrieval, and context components

This area decides what the assistant can see when it answers. Before each turn it picks the right context: the account's memory, the user's past chats, the files in a project, and the instructions that apply. It also runs web search, reads a web page for the user, runs a hybrid search over files and chats, and runs Deep Research, which plans, searches in rounds, and writes a cited report. Long chats are shortened into a saved summary so they still fit the model's window. Together these let the assistant answer from the user's own material and from the web, and show where each fact came from.

**Who uses it.** Every signed-in user in the web chat gets the per-turn context, the long-chat summaries and the web tools, subject to plan and capability gates (see switches). Deep Research is limited to the paid tiers listed in billing-catalog.ts:355. The free plan gets a fixed monthly allowance of 20 search calls (search-budget.ts:32). Temporary chats get no memory, no past-chat recall and no saved summary. Workspace admins control workspace memory through the organization policy (turn-context-service.ts:176-178, 0164 migration header). Developers and operators run the indexing sweep (apps/web/app/api/cron/index-retrieval-documents/route.ts). Temporary and archived content is meant to be excluded (see things_that_look_wrong).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F093-01](F093-01-per-turn-context-assembly.md) | Per-turn context assembly | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-02](F093-02-instruction-order.md) | Instruction order | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-03](F093-03-long-chat-summaries.md) | Long-chat summaries | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-04](F093-04-recall-of-past-chats-and-project-files.md) | Recall of past chats and project files | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-05](F093-05-building-the-search-index.md) | Building the search index | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-06](F093-06-searching-your-indexed-content.md) | Searching your indexed content | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-07](F093-07-web-search.md) | Web search | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-08](F093-08-reading-a-web-page.md) | Reading a web page | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-09](F093-09-ranking-and-de-duplicating-sources.md) | Ranking and de-duplicating sources | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-10](F093-10-citations.md) | Citations | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-11](F093-11-deep-research-runs.md) | Deep Research runs | n/a | n/a | n/a | n/a | n/a | n/a |
| [F093-12](F093-12-knowledge-graph-or-wiki.md) | Knowledge graph or wiki | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/093-search-retrieval-and-context-components.md](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md).

## How this area works in the code

1. **The turn starts and the context for it is built.** The chat endpoint calls resolveInteractiveTurnContext with the user, conversation, project, temporary flag, memory settings and the organization context policy. This function decides whether memory, past chats or project sources apply, and loads them. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4237-4249`, `apps/web/lib/services/turn-context-service.ts:105-131`, `apps/web/lib/services/turn-context-service.ts:145-178`)
2. **Each source is admitted or refused, loaded, and budgeted.** The context engine checks each source class against user switches, temporary-chat rules and shared-project rules. It loads candidates, drops stale or refused items, and keeps the items that fit the budget, in precedence order. A loader that throws is logged and skipped. (`packages/platform/context-engine/src/engine.ts:115-132`, `packages/platform/context-engine/src/engine.ts:134-144`, `packages/contracts/context/src/context-source.ts:132-167`)
3. **Project context is loaded and its passages are picked.** For a project chat, the project's instructions, files and sibling chats are loaded. Indexed passages are looked up for the question; if none, passages are picked per request. Blocks are fitted to a character budget. (`apps/web/lib/services/project-context-service.ts:188`, `apps/web/lib/services/project-context-service.ts:339-347`, `apps/web/lib/services/project-knowledge-retrieval.ts:27-45`, `apps/web/lib/services/project-context-service.ts:516-552`)
4. **Past chats are recalled by meaning or by keyword.** If an index exists, semantic recall runs through the search provider. Otherwise a keyword query runs over messages. Temporary and deleted rows are filtered out. A failure marks the turn's recall as degraded. (`apps/web/lib/services/past-chat-context-service.ts:371-397`, `apps/web/lib/services/past-chat-context-service.ts:344-348`, `apps/web/lib/services/past-chat-context-service.ts:405-420`)
5. **The manifest is written and the instructions are ordered.** The manifest of included and excluded sources is written to the database without blocking the turn. The system instructions are then ordered by layer before they are sent. (`apps/web/lib/services/turn-context-service.ts:198-206`, `packages/platform/context-engine/src/manifest-store.ts:50-60`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2120-2123`, `packages/contracts/context/src/instruction-precedence.ts:69-71`)
6. **Long conversations are summarized or trimmed.** If the messages do not fit the model window, the oldest are summarized once and the summary is cached with a digest. A summary is reused only when the digest still matches. A failure falls back to a plain trim. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6702-6712`, `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:411-440`, `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:335-349`, `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:469-474`)
7. **The turn decides whether to offer web search.** The platform checks whether the user asked for a search, whether the question needs fresh facts, the plan and the capability gates. If yes, the search tool is added to the tools list for the model. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6251-6265`, `apps/web/lib/web-search/required-search.ts:218-260`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6283-6296`)
8. **A search runs through the configured provider.** The search tool picks the configured providers in list order, calls the adapter, retries once on a transient failure, and turns each result into a source with the provider tag and freshness. (`apps/web/lib/web-search/web-search-tool.ts:388-397`, `apps/web/lib/web-search/web-search-tool.ts:409-420`, `apps/web/lib/web-search/search-provider.ts:131-143`, `packages/contracts/types/src/search-provider.ts:157-185`)
9. **A page is read safely, hop by hop.** The page reader checks the domain policy, then fetches each hop after checking the scheme, the credentials and the resolved address. Redirects are followed by hand. The body is capped and turned into text, with title, description and date extracted. (`apps/web/lib/url-fetch/url-fetch-tool.ts:526-570`, `apps/web/lib/url-fetch/guarded-fetch.ts:91-95`, `apps/web/lib/url-fetch/guarded-fetch.ts:124-138`, `apps/web/lib/egress-policy.ts:289-300`, `apps/web/lib/url-fetch/url-fetch-tool.ts:657-690`)
10. **Indexed content is searched and re-ranked.** The search provider builds one SQL query that joins the keyword and meaning candidates, filters by owner, organization, deletion and temporary status, then re-ranks the merged list. (`apps/web/lib/services/retrieval-search-service.ts:444-470`, `apps/web/lib/services/retrieval-search-service.ts:190-275`, `apps/web/lib/services/retrieval-search-service.ts:268-271`, `packages/platform/data-layer/src/search/rank.ts:24-30`, `apps/web/lib/services/retrieval-search-service.ts:521-525`)
11. **Deep Research runs and saves its report.** A research turn starts a cloud run, runs the research loop (plan, search rounds, stop rules, synthesis), ranks the results, and saves the report with its sources, status and cost. Cancellation is checked at each boundary. (`apps/web/app/api/llm/v1/chat/completions/route.ts:567-568`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1746`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1085-1110`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2034-2040`, `apps/web/lib/services/research-report-service.ts:212-225`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/services/turn-context-service.ts` | Decides which memory, past-chat and project sources a turn gets, runs the context engine, and writes the manifest. |
| `packages/platform/context-engine/src/engine.ts` | Admits, loads, orders and budgets context candidates, and builds the manifest. |
| `packages/contracts/context/src/context-source.ts` | Registry of source classes with their trust, precedence (line 132) and budget priority (line 154). |
| `packages/contracts/context/src/instruction-precedence.ts` | Instruction layers, their rank, and which source class lands in which layer. |
| `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Summarizes long conversations once, caches the summary with a digest, and falls back to a plain trim. |
| `apps/web/lib/web-search/web-search-tool.ts` | The web search tool: provider selection, the one registered adapter, limits, and model-facing text. |
| `apps/web/lib/web-search/search-provider.ts` | Provider registry, provider order, and the conversion of results into one source shape. |
| `apps/web/lib/url-fetch/url-fetch-tool.ts` | The page reader: limits, content extraction, title, description and date. |
| `apps/web/lib/url-fetch/guarded-fetch.ts` | The one fetch path for URLs the platform did not choose; checks every hop. |
| `apps/web/lib/services/retrieval-search-service.ts` | Hybrid keyword and meaning search over the user's indexed content, with permission filters. |
| `apps/web/lib/services/retrieval-index-service.ts` | Splits documents into chunks, embeds them, stores them, and retries failures. |
| `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Deep Research: plan, search rounds, stop rules, cancellation, resume and synthesis. |
| `packages/contracts/types/src/search-provider.ts` | Source shape, canonical URL identity, freshness classes and de-duplication. |
| `apps/web/db/neon/0202_retrieval_index.sql` | Creates the document and chunk tables, the full-text index and the vector index. |

## What is stored

- Indexed documents (one row per source document, with status, attempts and retry time): Database table retrieval_documents, apps/web/db/neon/0202_retrieval_index.sql:48
- Indexed chunks: text, offsets, metadata, full-text vector, and embedding (1536 dimensions): Database table retrieval_chunks, apps/web/db/neon/0202_retrieval_index.sql:116-143
- Saved summary of a long conversation, the last message it covers, and its digest: Columns on web_conversations: compaction_summary, compaction_summary_through_message_id (apps/web/db/neon/0164_memory_policy_and_context_compaction.sql:16-22) and compaction_summary_digest (apps/web/db/neon/0282_compaction_summary_coverage.sql:28-30)
- Per-turn context manifest: which sources were included, excluded and why: Database table context_manifests, written by packages/platform/context-engine/src/manifest-store.ts:56
- Deep Research report: title, summary, content, citations, steps, status, sources, duration and settled cost: Database table research_reports (apps/web/db/neon/0094_research_reports.sql:28); settled cost column added by apps/web/db/neon/0191_research_report_settled_cost.sql:19
- Saved message citations (search results and citation lists) after redirect resolution: Message metadata on the saved message (apps/web/lib/web-search/source-url-metadata.ts:13 lists the keys searchResults and citations; persist-message.ts:88)
- Past chats and messages that are read for recall (not copied): Tables web_conversations and web_messages, read by apps/web/lib/services/past-chat-context-service.ts:250-262
- Search and fetch results used in a turn: Not established as stored beyond the turn. The web search and page reader code I read does not write them to a table (see not_sure).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Memory on or off (account and per-chat)**: Turns account memory into a source for the turn. Off means memory is not loaded. (apps/web/lib/services/turn-context-service.ts:124-127 (policy.enabled, temporaryChat, memoryEnabled); request field memory_enabled from the request)
- **Past-chat search switch**: Turns past-chat recall on or off. Also off when memory_enabled is false, and off for the API surface. (apps/web/lib/services/turn-context-service.ts:128-131 (policy.searchPastChats))
- **Organization context policy**: Workspace rules for context sources (for example, the workspace memory gate). (apps/web/lib/services/turn-context-service.ts:176-178; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4249 (contextPolicySnapshot.policy))
- **Temporary chat**: Removes memory and past chats from the turn and skips summary creation and the manifest write. (apps/web/lib/services/turn-context-service.ts:126, 198; apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:434-437)
- **AGI_CONTEXT_COMPACTION_ENABLED (environment variable)**: When set to 0, false or off, long conversations are trimmed without a summary. (apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38 and 59-62)
- **Web search capability gate**: Turns web search off for the plan or for a kill switch. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5227 (assertCapabilityAvailable canUseWebSearch) and 5238 (kill-switch gate); kill switch keys in apps/web/lib/observability/ownership.ts:141; plan grant in apps/web/lib/services/capability-handshake-service.ts:117)
- **Deep Research capability gate**: Refuses a research turn when the plan or kill switch does not allow it. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5221; kill switch apps/web/lib/observability/ownership.ts:111; plan list packages/contracts/types/src/billing-catalog.ts:341 and 355 (paid tiers))
- **Free monthly search allowance**: Free plan gets 20 search calls per 30 days; other plans pay per call. (apps/web/lib/web-search/search-budget.ts:32, 66-67, 116)
- **Generic web search feature flag (client)**: Shows the generic web search option in the composer. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1596-1597 (featureFlags.generic_web_search))
- **Search provider key**: A provider is configured only when its key is set. With no key, search says it is not configured. (apps/web/lib/web-search/web-search-providers.json:6 (key variable name); apps/web/lib/web-search/web-search-tool.ts:388-394 and 399-402)
- **AGI_NATIVE_SEARCH_MAX_USES (environment variable)**: Limit on native search uses per turn, from 1 to 50. Defaults are 3 for chat and 20 for research. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2542-2560)
- **Research limits (environment variables)**: AGI_RESEARCH_MAX_ITERATIONS, AGI_RESEARCH_MAX_SEARCHES, AGI_RESEARCH_BUDGET_MS, AGI_RESEARCH_MAX_PARALLEL_TOOL_CALLS, AGI_RESEARCH_MAX_QUERY_REWRITES. Each is clamped to a fixed range. (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1771-1840)
- **Per-turn caps for search and page reads**: Searches per turn 3 (10 for AGI Work). Page reads per turn 5 (15 for AGI Work). (apps/web/lib/web-search/web-search-tool.ts:54-58; apps/web/lib/url-fetch/url-fetch-tool.ts:30-31)
- **Embedding route slot**: Chooses which embedding model serves indexing and query embedding. Changed in the model catalog, not in code. (apps/web/lib/services/retrieval-embedding-service.ts:48 (slot name) and 96-115)
- **Indexing sweep cron**: Runs the background indexing of due documents. Skipped on low-power runs. (apps/web/app/api/cron/index-retrieval-documents/route.ts:15-33)

## Shared between apps

Shared across apps (in packages/ or the web server library): the context source registry and instruction layers (packages/contracts/context/src/), the context engine (packages/platform/context-engine/src/), the source shape, freshness and de-duplication (packages/contracts/types/src/search-provider.ts), the ranking code (packages/ai/search/src/source-ranking.ts and packages/platform/data-layer/src/search/rank.ts), and the citation locators (packages/contracts/types/src/project-file-citations.ts). The chat endpoint (apps/web/app/api/llm/v1/chat/completions/) is one server path for all calls that reach it. Separate per app: the desktop Tauri build has its own search and page-scrape executor in Rust (apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs and apps/desktop/src-tauri/src/core/llm/tool_executor/search_tools.rs) that does not use the web provider list. Mobile, the CLI, the Chrome extension and the VS Code extension each have their own search-related client code; I only grepped those and did not trace them.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Archived chats and archived files are not excluded from the search query. The brief says they should be. The query checks deleted and temporary only. The archive exclusion depends on the migration 0244, whose header says it is not yet applied. (apps/web/lib/services/retrieval-search-service.ts:268-271; apps/web/lib/services/past-chat-context-service.ts:344-348; apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql:3. Project sibling chats do check archived: apps/web/lib/services/project-context-service.ts:248)
- Migration headers say NOT YET APPLIED for the retrieval index, the compaction and manifest columns, and the research cost column. The code depends on all of them. Applied state could not be checked here. (apps/web/db/neon/0202_retrieval_index.sql:4; apps/web/db/neon/0164_memory_policy_and_context_compaction.sql:3; apps/web/db/neon/0252_context_manifests_and_source_policy.sql:5; apps/web/db/neon/0191_research_report_settled_cost.sql:3)
- Migration 0282 header calls itself Migration 0280. (apps/web/db/neon/0282_compaction_summary_coverage.sql:2)
- The brief names the instruction layers as system, workspace, project, user and skill. The code has system, developer, project, personalized, memory and untrusted_context. There is no workspace layer and no skill layer. (packages/contracts/context/src/instruction-precedence.ts:11-18)
- Seven source classes declare no producer (producedBy is empty). The helper that lists them has no caller in the code I searched. (packages/contracts/context/src/context-source.ts:325, 345, 365, 385, 405, 451, 471 (library_file, user_upload, connector_result, web_result, security_policy, template_instruction, local_repository_instruction); helper at context-source.ts:511)
- The manifest write is fire-and-forget. If it fails, the turn goes on and the manifest is simply missing, with only a warning log. The brief says each turn produces a stored manifest. (apps/web/lib/services/turn-context-service.ts:198-206)
- The search adapter registry is code-only. The JSON file sets order and key name, but a provider runs only if an adapter is registered in code. The brief says adapters are selected by configuration. (apps/web/lib/web-search/web-search-tool.ts:388-397; apps/web/lib/web-search/web-search-providers.json:2-9)
- A hard-coded search endpoint constant duplicates the host in the JSON registry. AGENTS.md section 4 says endpoints should come from the registry. (apps/web/lib/web-search/web-search-tool.ts:37 and 263-264; apps/web/lib/web-search/web-search-providers.json:5)
- The desktop Tauri build has its own search executor. It scrapes an HTML search page and calls a second search API directly, outside the provider list and the web search budget. I did not check its egress policy. (apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs:290 and 443)
- Several line references in the brief point to unrelated code. request-processor.ts:1250 is the plugin draft tool and :3156 is a body size constant. research-loop.ts:1523 is a query overlap helper. scheduled-agent-executor.ts:393 is a note about withheld tools, not context assembly. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1250, 3156; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1523; apps/web/lib/services/scheduled-agent-executor.ts:393)
- A grounding checker (S93.27) is not built. The brief marks it missing, and I found no code for it. Likewise S93.31 is not built. (No file found. Checked apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts and apps/web/lib)

## Not established

- Whether the migrations marked NOT YET APPLIED have been applied to the live database. I could not run the migration status command, and this task allowed no commands.
- Per-app status for each item. The brief gives only 'platform done' or 'platform missing' and no lines for Web, Desktop, Mobile, CLI, the VS Code extension or the Chrome extension.
- Whether search results or fetched page text are stored anywhere after the turn. I did not find a write in the code I read.
- Whether the indexing sweep cron is scheduled and how often. The schedule file was not read.
- Which code writes rows to retrieval_documents when a chat, file or artifact changes. The trigger file 0202 was not read in full.
- How the research plan approval, resume and cancel controls look in each app. I read only the web composer toggle and the stream types.
- Whether the Electron desktop app goes through the same web chat endpoint. The Tauri build clearly has its own path.
- Whether the provider list's adapter ever gets a second entry. Only one adapter exists in the code I read.
- How the mobile, CLI and extension apps handle citations and research progress. Only grep hits were seen.

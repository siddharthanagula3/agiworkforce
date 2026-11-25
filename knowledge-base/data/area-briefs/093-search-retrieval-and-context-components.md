# Area 93. Search, retrieval, and context components

31 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S93.01 Context-source registry.
- Should: A registry defines the kinds of context sources (memory, project, conversation, fetched pages...) with their trust/precedence, and context assembly uses it.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3156; apps/web/lib/services/turn-context-service.ts:126; apps/web/lib/services/turn-context-service.ts:171; apps/web/lib/services/project-context-service.ts:530; apps/web/lib/services/scheduled-agent-executor.ts:393

## S93.02 Context selection.
- Should: Before each turn the platform selects which context (project blocks, memories, past chats) fits the budget and includes only that.
- Status: platform done
- Code: apps/web/lib/services/project-context-service.ts:516; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2571; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1250

## S93.03 Instruction resolver.
- Should: Instructions from different layers (system, workspace, project, user, skill) are resolved in a defined precedence order.
- Status: platform done
- Code: packages/contracts/context/src/instruction-precedence.ts:125; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1170

## S93.04 Context manifest builder.
- Should: Each turn produces a stored manifest of which context sources were included, excluded and why.
- Status: platform done
- Code: apps/web/lib/services/turn-context-service.ts:144; apps/web/lib/services/turn-context-service.ts:145; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3157; packages/platform/context-engine/src/manifest-store.ts:56

## S93.05 Context compaction.
- Should: When a conversation outgrows the context window, older turns are compacted into a summary and the turn continues.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:391; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4579; apps/web/db/neon/0164_memory_policy_and_context_compaction.sql:16

## S93.06 Summary versioning.
- Should: Stored summaries are versioned against the messages they cover so an edited or deleted message invalidates the summary.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:121; apps/web/db/neon/0282_compaction_summary_coverage.sql:29

## S93.07 Conversation retrieval.
- Should: Past conversations are retrievable by relevance to ground a new turn (excluding temporary/deleted chats).
- Status: platform done
- Code: apps/web/lib/services/past-chat-context-service.ts:315; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1250; apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql:38

## S93.08 Project retrieval.
- Should: Project knowledge files are retrievable by relevance for chats in that project.
- Status: platform done
- Code: apps/web/lib/services/project-knowledge-retrieval.ts:38; apps/web/lib/services/project-context-service.ts:352; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550

## S93.09 Public-search adapters.
- Should: Public web search goes through pluggable provider adapters selected by configuration.
- Status: platform done
- Code: apps/web/lib/web-search/search-provider.ts:118; apps/web/lib/web-search/web-search-providers.json:2; apps/web/lib/web-search/web-search-tool.ts:386

## S93.10 Web-fetch service.
- Should: A web-fetch service reads a given URL and returns its text for the model.
- Status: platform done
- Code: apps/web/lib/url-fetch/url-fetch-tool.ts:486; apps/web/lib/url-fetch/url-fetch-tool.ts:69

## S93.11 Safe URL resolver.
- Should: URLs are resolved safely: only public http(s) hosts, no credentials, redirects re-checked, private/internal addresses refused.
- Status: platform done
- Code: apps/web/lib/url-fetch/guarded-fetch.ts:110

## S93.12 Page-content extraction.
- Should: Fetched pages are reduced to readable text with title/description/date extracted.
- Status: platform done
- Code: apps/web/lib/url-fetch/url-fetch-tool.ts:423; apps/web/lib/url-fetch/url-fetch-tool.ts:586

## S93.13 Search-query planner.
- Should: A query planner decides when and what to search (required search detection, research query plan).
- Status: platform done
- Code: apps/web/lib/web-search/required-search.ts:110; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1012

## S93.14 Search-result normalization.
- Should: Results from any provider are normalized into one source shape (id, url, title, provider, dates).
- Status: platform done
- Code: packages/contracts/types/src/search-provider.ts:157; apps/web/lib/web-search/search-provider.ts:184

## S93.15 Result deduplication.
- Should: Duplicate results (same canonical URL) are merged.
- Status: platform done
- Code: packages/contracts/types/src/search-provider.ts:188; apps/web/lib/web-search/search-provider.ts:182

## S93.16 Relevance ranking.
- Should: Results are ranked by relevance before use.
- Status: platform done
- Code: packages/ai/search/src/source-ranking.ts:333; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:844

## S93.17 Source freshness evaluation.
- Should: Each source is classified by freshness (age from publication date).
- Status: platform done
- Code: packages/contracts/types/src/search-provider.ts:130; packages/contracts/types/src/search-provider.ts:171

## S93.18 Document chunking.
- Should: Documents are split into chunks for indexing.
- Status: platform done
- Code: apps/web/lib/services/retrieval-index-service.ts:248; apps/web/db/neon/0202_retrieval_index.sql:116

## S93.19 Embedding generation.
- Should: Chunks get embeddings generated (metered) for semantic search.
- Status: platform done
- Code: apps/web/lib/services/retrieval-embedding-service.ts:193; apps/web/lib/services/retrieval-index-service.ts:319; apps/web/app/api/cron/index-retrieval-documents/route.ts:1

## S93.20 Vector index.
- Should: Embeddings are stored in a vector index queried by similarity.
- Status: platform done
- Code: apps/web/db/neon/0202_retrieval_index.sql:130; apps/web/db/neon/0202_retrieval_index.sql:143; apps/web/lib/services/retrieval-search-service.ts:268

## S93.21 Lexical index.
- Should: A lexical (full-text) index serves keyword retrieval.
- Status: platform done
- Code: apps/web/db/neon/0202_retrieval_index.sql:131; apps/web/db/neon/0202_retrieval_index.sql:140; apps/web/lib/services/retrieval-search-service.ts:70

## S93.22 Hybrid retrieval.
- Should: Retrieval fuses lexical and vector candidates (hybrid).
- Status: platform done
- Code: apps/web/lib/services/retrieval-search-service.ts:231; apps/web/lib/services/retrieval-search-service.ts:269

## S93.23 Reranking.
- Should: Candidates are re-ranked before being returned.
- Status: platform done
- Code: packages/platform/data-layer/src/search/rank.ts:49; apps/web/lib/services/retrieval-search-service.ts:295

## S93.24 Permission-aware retrieval filters.
- Should: Retrieval only returns content the requesting user may see (tenant, owner, deleted/temporary/archived exclusions).
- Status: platform done
- Code: apps/web/db/neon/0202_retrieval_index.sql:154; apps/web/lib/services/retrieval-search-service.ts:178; apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql:38

## S93.25 Source locator registry.
- Should: A registry of locator types (page, heading, line, cell, slide, timestamp, message) lets any citation point inside its source.
- Status: platform done
- Code: packages/contracts/types/src/project-file-citations.ts:10; apps/web/lib/services/retrieval-search-service.ts:64

## S93.26 Citation resolver.
- Should: Citations are resolved to stable publisher URLs and numbered consistently for display and storage.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/[id]/messages/lib/resolve-source-urls.ts:29; packages/contracts/types/src/search-provider.ts:116; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:11

## S93.27 Grounding checker.
- Should: A grounding checker verifies that cited claims are supported by their sources before/after answering.
- Status: platform missing

## S93.28 Research evidence store.
- Should: Research runs store their evidence (sources, citations, status, cost) durably.
- Status: platform done
- Code: apps/web/lib/services/research-report-service.ts:213; apps/web/db/neon/0094_research_reports.sql:1; apps/web/app/api/llm/v1/chat/completions/route.ts:565

## S93.29 Research orchestrator.
- Should: A research orchestrator runs plan, search rounds, stop rules, synthesis, cancellation and resume.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/route.ts:554; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1523; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2025

## S93.30 Research report generator.
- Should: A report generator synthesizes the final report in the requested deliverable format with citations.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1105; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1076

## S93.31 Knowledge-graph or wiki projection where offered.
- Should: Where offered, content is projected into a knowledge graph or wiki the user/agent can browse.
- Status: platform missing

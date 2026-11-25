---
id: "REQ-AREA-093"
type: "requirements"
title: "Requirement items: Search, retrieval, and context components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 93. Search, retrieval, and context components

31 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S93.01

**Context-source registry.** A registry defines the kinds of context sources (memory, project, conversation, fetched pages...) with their trust/precedence, and context assembly uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-01 Per-turn context assembly](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Competitor trace: CAP-context-management-15

## S93.02

**Context selection.** Before each turn the platform selects which context (project blocks, memories, past chats) fits the budget and includes only that.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-01 Per-turn context assembly](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Competitor trace: CAP-context-management-14, CAP-context-management-15

## S93.03

**Instruction resolver.** Instructions from different layers (system, workspace, project, user, skill) are resolved in a defined precedence order.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-02 Instruction order](../../20-features/093-search-retrieval-and-context-components/F093-02-instruction-order.md)
- Competitor trace: CAP-context-management-07, CAP-context-management-15

## S93.04

**Context manifest builder.** Each turn produces a stored manifest of which context sources were included, excluded and why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-01 Per-turn context assembly](../../20-features/093-search-retrieval-and-context-components/F093-01-per-turn-context-assembly.md)
- Competitor trace: CAP-context-management-15

## S93.05

**Context compaction.** When a conversation outgrows the context window, older turns are compacted into a summary and the turn continues.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-03 Long-chat summaries](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Competitor trace: CAP-context-management-02

## S93.06

**Summary versioning.** Stored summaries are versioned against the messages they cover so an edited or deleted message invalidates the summary.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-03 Long-chat summaries](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Competitor trace: CAP-context-management-16

## S93.07

**Conversation retrieval.** Past conversations are retrievable by relevance to ground a new turn (excluding temporary/deleted chats).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-04 Recall of past chats and project files](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Competitor trace: CAP-context-management-24

## S93.08

**Project retrieval.** Project knowledge files are retrievable by relevance for chats in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-04 Recall of past chats and project files](../../20-features/093-search-retrieval-and-context-components/F093-04-recall-of-past-chats-and-project-files.md)
- Competitor trace: CAP-context-management-14

## S93.09

**Public-search adapters.** Public web search goes through pluggable provider adapters selected by configuration.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-07 Web search](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)

## S93.10

**Web-fetch service.** A web-fetch service reads a given URL and returns its text for the model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-08 Reading a web page](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)

## S93.11

**Safe URL resolver.** URLs are resolved safely: only public http(s) hosts, no credentials, redirects re-checked, private/internal addresses refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-08 Reading a web page](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)

## S93.12

**Page-content extraction.** Fetched pages are reduced to readable text with title/description/date extracted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-08 Reading a web page](../../20-features/093-search-retrieval-and-context-components/F093-08-reading-a-web-page.md)

## S93.13

**Search-query planner.** A query planner decides when and what to search (required search detection, research query plan).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-07 Web search](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)

## S93.14

**Search-result normalization.** Results from any provider are normalized into one source shape (id, url, title, provider, dates).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-07 Web search](../../20-features/093-search-retrieval-and-context-components/F093-07-web-search.md)

## S93.15

**Result deduplication.** Duplicate results (same canonical URL) are merged.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-09 Ranking and de-duplicating sources](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)

## S93.16

**Relevance ranking.** Results are ranked by relevance before use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-09 Ranking and de-duplicating sources](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)

## S93.17

**Source freshness evaluation.** Each source is classified by freshness (age from publication date).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-09 Ranking and de-duplicating sources](../../20-features/093-search-retrieval-and-context-components/F093-09-ranking-and-de-duplicating-sources.md)

## S93.18

**Document chunking.** Documents are split into chunks for indexing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-05 Building the search index](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Competitor trace: CAP-context-management-13

## S93.19

**Embedding generation.** Chunks get embeddings generated (metered) for semantic search.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-05 Building the search index](../../20-features/093-search-retrieval-and-context-components/F093-05-building-the-search-index.md)
- Competitor trace: CAP-context-management-13

## S93.20

**Vector index.** Embeddings are stored in a vector index queried by similarity.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-06 Searching your indexed content](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Competitor trace: CAP-context-management-13

## S93.21

**Lexical index.** A lexical (full-text) index serves keyword retrieval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-06 Searching your indexed content](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Competitor trace: CAP-context-management-13

## S93.22

**Hybrid retrieval.** Retrieval fuses lexical and vector candidates (hybrid).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-06 Searching your indexed content](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Competitor trace: CAP-context-management-13

## S93.23

**Reranking.** Candidates are re-ranked before being returned.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-06 Searching your indexed content](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Competitor trace: CAP-context-management-13

## S93.24

**Permission-aware retrieval filters.** Retrieval only returns content the requesting user may see (tenant, owner, deleted/temporary/archived exclusions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-06 Searching your indexed content](../../20-features/093-search-retrieval-and-context-components/F093-06-searching-your-indexed-content.md)
- Competitor trace: CAP-context-management-13

## S93.25

**Source locator registry.** A registry of locator types (page, heading, line, cell, slide, timestamp, message) lets any citation point inside its source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-10 Citations](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)

## S93.26

**Citation resolver.** Citations are resolved to stable publisher URLs and numbered consistently for display and storage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-10 Citations](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)

## S93.27

**Grounding checker.** A grounding checker verifies that cited claims are supported by their sources before/after answering.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-10 Citations](../../20-features/093-search-retrieval-and-context-components/F093-10-citations.md)

## S93.28

**Research evidence store.** Research runs store their evidence (sources, citations, status, cost) durably.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-11 Deep Research runs](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)

## S93.29

**Research orchestrator.** A research orchestrator runs plan, search rounds, stop rules, synthesis, cancellation and resume.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-11 Deep Research runs](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)

## S93.30

**Research report generator.** A report generator synthesizes the final report in the requested deliverable format with citations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-11 Deep Research runs](../../20-features/093-search-retrieval-and-context-components/F093-11-deep-research-runs.md)

## S93.31

**Knowledge-graph or wiki projection where offered.** Where offered, content is projected into a knowledge graph or wiki the user/agent can browse.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F093-12 Knowledge graph or wiki](../../20-features/093-search-retrieval-and-context-components/F093-12-knowledge-graph-or-wiki.md)

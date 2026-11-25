---
id: 'META-retrieval-proposal'
type: 'proposal'
title: 'Optional: retrieval and graph infrastructure'
basis: 'proposed'
last_reviewed: '2026-11-24'
---

# Optional: retrieval and graph infrastructure

Everything here is a proposal. The knowledge base works without it: an LLM can use `index.json`, `20-features/catalog.json` and `graph/edges.jsonl` directly with file reads and text search.

## What is already in place for retrieval

| Need                   | Where it is today                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A unit to retrieve     | One Markdown page per feature, area, system, app, competitor topic. Each starts with a metadata header and a summary and reads alone |
| Stable identifiers     | `F013-02`, `S13.10`, `SYS-...`, `CAP-...`, `GAP-...`; listed in `index.json` and `graph/nodes.jsonl`                                 |
| Metadata for filtering | Header fields: `type`, `area`, `available_on`, `implementation`, `verification`, `last_reviewed`, `revision`                         |
| Relationships          | `graph/edges.jsonl` with evidence and basis on every edge                                                                            |
| Section boundaries     | Fixed numbered headings on feature pages (1 to 10), so a section can be a chunk                                                      |

## Proposal 1: text retrieval (RAG)

1. **Chunking.** Split each page at its second-level headings. Prefix every chunk with the page identifier, title and heading, so a chunk is understandable alone. Keep tables whole.
2. **Metadata on each chunk.** Page id, type, area, apps, implementation and verification status, section name, revision.
3. **Two indexes.** A keyword index (identifiers, file paths, interface labels and code names match exactly) and an embedding index (questions in plain words). Merge the results; exact identifier matches rank first.
4. **Filters before search.** "On mobile", "not built", "seen failing" are metadata filters, not text queries.
5. **Freshness.** Re-index a page when its `revision` changes. Store the revision with the chunk and show it with every answer.

## Proposal 2: graph retrieval

1. Load `graph/nodes.jsonl` and `graph/edges.jsonl` into any graph store, or keep them in memory; the whole map is small.
2. Answer structural questions by traversal, then fetch the pages of the nodes found:
   - "What breaks if this file changes?" Follow `implemented_by` backwards from `file:<path>` to features, then `satisfies` to requirement items and `available_on` to apps.
   - "What does this feature need?" Follow `depends_on`, `uses_provider`, `governed_by_subscription`, `stores_data_in`.
   - "What is blocking this feature?" Follow `blocked_by` to gaps.
   - "Why do we need this?" Follow `satisfies` to requirement items, then `traced_to` backwards to competitor capabilities and their web addresses.
3. Use edge `basis` to weigh answers: `executed` above `code` above `inferred`.

## Proposal 3: keep it honest automatically

- A check in continuous integration that runs `tools/04_build_indexes.py` and fails on broken links, cited files that no longer exist, or duplicate identifiers.
- A job that lists pages whose cited files changed since the page's revision, and opens them for re-reading.
- Writing hands-on test results straight into the capability ledger, so verification status on every page updates on the next build.

## What this would cost

Not estimated. The choice of embedding model and store is open, and under the product's own principles it should not tie the knowledge base to one provider.

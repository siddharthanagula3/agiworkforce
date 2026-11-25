---
id: 'KB-README'
type: 'readme'
title: 'AGI Workforce knowledge base'
last_reviewed: '2026-11-24'
---

# AGI Workforce knowledge base

One place that explains the product, its requirements, how it is built, what is missing, and how to check it. Written so a person or an LLM can find the answer to a question without exploring the repository again.

It answers, for any feature: what it is, why it exists, how a person uses it, how it works inside, how it should work, where it is implemented, what it depends on, how models, providers, subscriptions and local inference affect it, what is missing, and how to verify it.

## Where to start

| You want                                                                           | Open                                                                    |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| The product in one page                                                            | [00-start/product-overview.md](00-start/product-overview.md)            |
| How the whole system fits together                                                 | [00-start/system-architecture.md](00-start/system-architecture.md)      |
| What a word means (product name, interface label, code name)                       | [00-start/glossary.md](00-start/glossary.md)                            |
| What the labels on statements mean (seen in a run, read in code, requirement, ...) | [00-start/evidence-and-status.md](00-start/evidence-and-status.md)      |
| A feature                                                                          | [20-features/README.md](20-features/README.md) (catalog), then its page |
| A requirement                                                                      | [10-requirements/README.md](10-requirements/README.md)                  |
| One app                                                                            | [30-surfaces/](30-surfaces/)                                            |
| A subsystem (models, providers, local inference, subscription, sign-in, data, ...) | [40-systems/](40-systems/)                                              |
| How Claude and ChatGPT do something, and what that requires of us                  | [50-competitors/README.md](50-competitors/README.md)                    |
| Setup, configuration, build, deploy, release, recovery                             | [60-engineering/](60-engineering/)                                      |
| How to test by hand, the test plans, results and defects                           | [70-qa/README.md](70-qa/README.md)                                      |
| What is missing or broken                                                          | [80-gaps/README.md](80-gaps/README.md)                                  |
| What has been documented, read and tested so far                                   | [90-meta/coverage.md](90-meta/coverage.md)                              |
| How to keep this up to date                                                        | [90-meta/maintenance-guide.md](90-meta/maintenance-guide.md)            |

## How it is organised

| Folder                   | Holds                                                                                                        | Identifier form                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `00-start`               | Product overview, system architecture, glossary, evidence labels                                             |                                     |
| `10-requirements`        | The product principles, every established requirement and owner decision, requirement items by area          | `PR-1`, `S13.10`                    |
| `20-features`            | The feature catalog and one page per feature, grouped by product area                                        | `F013-02`, `AREA-013`               |
| `30-surfaces`            | One page per app                                                                                             | `SURF-web`                          |
| `40-systems`             | Cross-cutting subsystems                                                                                     | `SYS-local-inference`               |
| `50-competitors`         | Claude and ChatGPT evidence traced to requirements, plus the comparison data                                 | `CAP-memory-and-personalization-03` |
| `60-engineering`         | Setup, configuration, build and test, deployment, release, migrations, monitoring, troubleshooting, recovery | `ENG-deployment`                    |
| `70-qa`                  | Hands-on test method, setup per app, test plans, result sheets, defects                                      | `PLAN-web-013`                      |
| `80-gaps`                | The gap register                                                                                             | `GAP-F013-02-01`                    |
| `90-meta`                | Coverage, checks, maintenance guide, outdated documents, retrieval proposal                                  |                                     |
| `graph`                  | The relationship map: nodes and edges                                                                        |                                     |
| `index.json`, `index.md` | Every page with its identifier, type and path                                                                |                                     |
| `data`, `tools`          | The structured data the pages are built from, and the scripts that build them                                |                                     |

## Finding things as an LLM

1. Look up the identifier or a keyword in `index.json` (pages) or `20-features/catalog.json` (features with names, aliases and status per app).
2. Open the page. Every page starts with a metadata header and a summary and can be read alone.
3. Follow relationships in `graph/edges.jsonl`: `implemented_by` (code), `depends_on`, `available_on` (apps), `uses_provider`, `governed_by_subscription`, `stores_data_in`, `tested_by`, `blocked_by` (gaps), `satisfies` (requirement items), `traced_to` (competitor capability to requirement).
4. Trust statements according to their label. Only "seen in a real run" means someone watched it work.

## Rules of this knowledge base

- **One home per fact.** A fact lives on one page; other pages link to it. The project's own documents (`docs/`, `ARCHITECTURE.md`, `AGENTS.md`, `audit/`) remain the home of what they already hold; pages here summarise and link, and list where those documents are out of date.
- **Evidence on every statement.** See [evidence-and-status.md](00-start/evidence-and-status.md).
- **Two separate statuses.** Whether the code is there (implementation) and whether a person has seen it work (verification) are never merged.
- **Nothing is decided silently.** Open product choices are listed as open.
- **No secrets.** Configuration is recorded by name and purpose only.

## State

Built on 2026-11-24 against the project at commit `f51d16e747`.

| | Count |
|---|---:|
| Pages | 2053 |
| Features with a stable identifier and a ten-section page | 1148 |
| Requirement items, each placed in one feature | 3439 |
| Competitor capabilities traced to requirements | 877 in 31 topics |
| System, app and engineering pages | 37 |
| Hands-on test items (item and app) | 7200 |
| Open gaps | 10441 |
| Relationship map | 24795 nodes, 87587 edges |
| Links checked / broken | 28903 / 0 |
| References to project files checked / not found | 37260 / 186 |

**How far to trust it.** Almost everything here was written by reading code; very little has been run. A second reader of the same model checked 535 statements on 48 sampled feature pages: 356 fully correct, 153 partly wrong, 16 wrong. Those pages were corrected. The other feature pages have not been re-read, so expect about one statement in three to be imprecise and about one in thirty to be wrong until they are. Details: [90-meta/review.md](90-meta/review.md).

**Where the project's own records and these pages disagree.** The capability ledger and the feature pages disagree on whether a feature exists on an app in 473 cases; a separate reader decided 20 of them from the code and found the feature page right in 14, the ledger in 5 and neither in 1 ([ledger corrections](90-meta/ledger-corrections.md)). In 787 more cases both say the feature exists and the page lists unfinished parts. 115 statements in project documents were reported as out of date ([outdated documents](90-meta/outdated-documents.md)); 26 of them, in 23 documents, were corrected and then confirmed against the code by a second reader, on the branch `claude/agent-contract`, not yet merged. 16 other corrections were made and taken back because they did not hold.

**Open product choices** are collected in [10-requirements/open-product-choices.md](10-requirements/open-product-choices.md).

The folder is part of the repository, so the repository's checks read it like any other tracked folder. The last build step, `tools/06_finalize.mjs`, keeps it within their rules: it replaces model names with `(model name)`, home folder paths with `~`, and cleans line endings. What stays out of the repository is listed in `.gitignore` here: screenshots and logs from hands-on runs, the saved third-party pages, and leads from studying the leaders' apps. See the [maintenance guide](90-meta/maintenance-guide.md).

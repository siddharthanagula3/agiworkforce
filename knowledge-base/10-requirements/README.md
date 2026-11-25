---
id: 'REQ-README'
type: 'index'
title: 'Requirements'
last_reviewed: '2026-11-24'
---

# Requirements

What the product must do, with the source of each requirement.

| Page                                                       | Holds                                                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [principles.md](principles.md)                             | The five product principles (`PR-1` to `PR-5`) that apply to every feature                                                                                            |
| [established-requirements.md](established-requirements.md) | Every requirement and owner decision recorded in the project's documents, each with its source and date; unresolved product choices; contradictions between documents |
| [capability-index.md](capability-index.md)                 | Requirement items by product area: 3,439 items, each the acceptance criterion of one capability (`S13.10`)                                                            |
| [capabilities/](capabilities/)                             | One page per area with every item, its status in the code per app, any result from a real run, the feature it belongs to and its competitor trace                     |

## Three kinds of requirement

| Kind        | Where it comes from                                                                       | How it is marked                           |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| Established | The owner, a project document, or an item of the capability ledger                        | "stated requirement", with the source      |
| Inferred    | Needed to match Claude and ChatGPT, or implied by the code; not written down by the owner | "inferred", with what it was inferred from |
| Proposed    | A suggestion                                                                              | "proposed"                                 |

Competitor parity alone never makes a requirement established. The trace from competitor evidence to a requirement is in [50-competitors](../50-competitors/README.md), and each line there says which kind it is.

## The homes of requirements in the project

This knowledge base links to these and does not replace them.

| Project document                                                          | Holds                                                                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `docs/product/definition.md`, `requirements.md`, `experience-contract.md` | The product definition and experience requirements                                                                           |
| `docs/product/commercial.md`                                              | Plans and commercial rules                                                                                                   |
| `docs/product/surface-feature-matrix.md`                                  | What each app is meant to have                                                                                               |
| `docs/product/competitive-guidance.md`                                    | How Claude and ChatGPT are used as the reference                                                                             |
| `docs/decisions/`                                                         | Decision records, including the owner's dated decisions                                                                      |
| `audit/ledger/ecosystem-capability-ledger.jsonl`                          | The capability ledger: every item, its acceptance criterion, its status per app with code evidence, and results of real runs |
| `audit/decisions/`                                                        | Actions and questions waiting for the owner                                                                                  |

## From a requirement to everything else

- Requirement item to feature: the "Feature" line under each item, or `satisfies` edges in `graph/edges.jsonl`.
- Feature to code, tests and gaps: the feature page, sections 5, 9 and 10.
- Requirement item to competitor evidence: the "Competitor trace" line under each item, or `traced_to` edges.

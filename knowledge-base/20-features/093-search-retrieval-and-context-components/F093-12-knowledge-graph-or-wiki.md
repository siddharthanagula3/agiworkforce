---
id: "F093-12"
type: "feature"
title: "Knowledge graph or wiki"
aliases: ["Knowledge graph or wiki", "Knowledge-graph or wiki projection (S93.31)"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.31"]
depends_on: ["SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-12 Knowledge graph or wiki

A knowledge graph or wiki view would turn a user's content into something browsable. The area brief marks it missing on the platform. A search of the repository found no code that builds or shows one in any app, so this page records the gap and the nearest existing building blocks.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.31](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9331).

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

**What it does.** Nothing today. The intended feature would project content into a graph or wiki that a user or agent can browse [brief S93.31].

**Why it exists.** The brief lists it as 'where offered', meaning optional; the reason beyond that is not stated (unknown).

**Who uses it.** No one yet.

**Problems it solves**

- none yet

**Use cases**

- unknown: no product document describing a use case was found in the files read

## 2. User experience

**Where to find it**

- Not available on web, desktop, mobile, CLI, VS Code or Chrome; no screen, route or command was found [brief S93.31; grep of apps and packages for knowledge graph and wiki terms found only a connector category label and unrelated text].

**Before you start**

- none

**Screens and controls**

- none found

**Journey**

1. none: the feature does not exist

**What the person sees and gets**

- none

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- none found

**Present but disconnected or switched off**

- none found

**Not available**

- Knowledge graph or wiki projection on every app (brief S93.31 'platform missing').
- A connector directory labels some connectors with 'knowledge graph' and 'wiki' categories; this is a classification of third-party apps, not a feature [apps/web/lib/connectors/directory/categorize.ts:315-316, 349-350].

## 4. Required behaviour

**Established requirements**

- Where offered, content is projected into a knowledge graph or wiki the user or agent can browse. Status: platform missing. (source: brief S93.31)

**Acceptance criteria**

1. Not testable today: no feature exists. A tester should confirm no graph or wiki entry point appears in any app.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the brief says 'where offered', absence is not a defect until a product decision offers it [inferred from the brief wording].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether to offer it at all, using docs/product as the owner; if yes, build it on the existing retrieval index and project context rather than a new store.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | area brief item S93.31 | `knowledge-base/data/area-briefs/093-search-retrieval-and-context-components.md` | Declares the item missing |
| service | retrieval index service | `apps/web/lib/services/retrieval-index-service.ts` | Possible source of chunks for a future projection (not a graph today) |
| service | retrieval search service | `apps/web/lib/services/retrieval-search-service.ts` | Hybrid retrieval a projection could read |
| service | project context service | `apps/web/lib/services/project-context-service.ts` | Project knowledge files a wiki could be built from |
| service | connector directory categorize | `apps/web/lib/connectors/directory/categorize.ts` | Only place the words knowledge graph and wiki appear, as connector categories |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. A search of apps/web, apps/mobile, apps/desktop/src, packages and the Rust sources found no graph or wiki builder. | device | repository search; only categorize.ts:315-350 and unrelated text matched |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | none | no | none |

**Models and providers.** not applicable; no feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, offline) | not handled in the code: the feature does not exist | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Absence check**
  1. Open each app's menus, settings and slash commands
  2. Search the help text for graph or wiki
  - Expected: No knowledge graph or wiki entry exists.
- **Repository search**
  1. Search source for knowledge graph, wiki projection and graph view components
  - Expected: Only the connector category labels match.
- **Brief consistency**
  1. Read S93.31 in the area brief
  - Expected: Status reads 'platform missing' with no code paths.

**Where to look when it fails**

- none: nothing runs

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Feature not built on any app.** Affects: All six apps. Evidence: brief S93.31 'Status: platform missing'; no code found. Work needed: A product decision on whether to offer it, then a spec under docs/specs/.

**Depends on**

- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations

## Unknown

- Whether a product decision to offer a knowledge graph or wiki exists outside the files read.
- Whether any Rust crate outside apps/cli, crates and the Tauri source builds a graph (searched those, none found).
- The intended user and use case.

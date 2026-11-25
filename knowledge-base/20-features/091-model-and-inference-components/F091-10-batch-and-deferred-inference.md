---
id: "F091-10"
type: "feature"
title: "Batch and deferred inference"
aliases: ["Batch inference coordinator", "Deferred inference", "Batch jobs", "S91.30"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.30"]
depends_on: ["SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "F091-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-10 Batch and deferred inference

A coordinator to submit and track batch or deferred model jobs is a required platform part, but the brief marks it 'platform missing' and no screen, route or code for it was found. Provider batch discounts are noted in catalog notes only. Nothing is built on any of the six apps.

Area: [91. Model and inference components](README.md). Requirement items: [S91.30](../../10-requirements/capabilities/091-model-and-inference-components.md#s9130).

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

**What it does.** Intended: submit batch or deferred model jobs and track them. Today it does nothing because it does not exist. (doc: knowledge-base/data/area-briefs/091-model-and-inference-components.md S91.30)

**Why it exists.** The brief lists it as part of the inference platform. The reason is not written in the repository: unknown. Providers publish cheaper batch prices, and the catalog notes record them because 'the catalog has no batch-pricing field' (packages/ai/model-registry/catalog/models.curation.json:135) [inferred that cost is a motive].

**Who uses it.** Nobody yet.

**Problems it solves**

- None today.

**Use cases**

- [proposed] Run a large background summarisation at a lower price and fetch it later.
- [proposed] Offline evaluations of models without holding a live stream.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, CLI, VS Code, Chrome: not available. No screen, command or endpoint found. The LLM v1 API folder holds only chat, audio, credits, embeddings, models and route (apps/web/app/api/llm/v1).

**Before you start**

- None; not built.

**Screens and controls**

- none found in the code

**Journey**

1. not applicable; not built

**What the person sees and gets**

- none

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature. A separate durable job pattern exists for video generation (apps/web/db/neon/0105_durable_video_generation_jobs.sql) but it is not a batch inference coordinator [inferred].

**Incomplete**

- none

**Present but disconnected or switched off**

- none

**Not available**

- Batch or deferred inference coordinator on all six apps: brief status 'platform missing' (S91.30). A search of packages/ai, packages/contracts/types, apps/web/app/api and apps/web/lib for a batch API or coordinator found only catalog price notes, not code.

## 4. Required behaviour

**Established requirements**

- A coordinator submits and tracks batch or deferred inference jobs. (source: S91.30)
- Status is missing; nothing is built to satisfy the Should. (source: S91.30)

**Acceptance criteria**

1. [proposed] A job can be submitted with a model, route and input set and returns a job id.
2. [proposed] Job status moves through queued, running, completed, failed or cancelled and can be read by its owner only.
3. [proposed] Cost is reserved and settled through the same managed usage ledger as live turns.
4. [proposed] Results are retrievable and expire per a stated retention.
5. [proposed] Local and own-key jobs follow the stated trust boundaries.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A batch job in Cloud mode would need the same reservation and settlement as a live turn [inferred from F091-07].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether the product wants this at all; owner decision needed.
- [proposed] If yes, add a batch field to the catalog price model and a jobs table, reusing the durable job pattern.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Brief item S91.30 | `knowledge-base/data/area-briefs/091-model-and-inference-components.md` | States status 'platform missing', no code listed. |
| endpoint | LLM v1 API folder | `apps/web/app/api/llm/v1` | Where a batch route would sit; contains no batch route. |
| config | Catalog curation notes | `packages/ai/model-registry/catalog/models.curation.json` | Records provider batch prices in notes only. |
| schema | Durable video jobs migration | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Existing durable job pattern for a different feature. |
| service | Managed usage request service | `apps/web/lib/services/managed-usage-request-service.ts` | Would be the metering base for batch jobs. |
| config | Provider adapter contract | `packages/contracts/types/src/provider-adapter.ts` | Adapter interface; no batch methods were found by search. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. | our servers | no route or code found under apps/web/app/api/llm/v1 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | none | none | none |

**Models and providers.** Some providers offer batch interfaces and discounts (catalog notes in packages/ai/model-registry/catalog/models.curation.json:135,423), but no adapter in the repository calls them as far as searched.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | none found in the code; no batch feature exists for Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state (loading, error, retry, cancel, offline) | not handled in the code; the feature does not exist. | No batch route or code under apps/web/app/api/llm/v1. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Search apps/web/app/api for a batch or jobs route under llm
  2. List apps/web/app/api/llm/v1
  - Expected: No batch route; only chat, audio, credits, embeddings, models, route.
- **Confirm absence in adapters**
  1. Search packages/ai/providers/*/src for batch calls
  - Expected: No batch submission code.
- **Brief status**
  1. Open S91.30 in the area brief
  - Expected: Status 'platform missing'.

**Where to look when it fails**

- Not applicable; nothing runs.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The whole coordinator is missing.** Affects: All six apps and all modes. Evidence: S91.30 status 'platform missing'. Work needed: Owner decision, a product spec under docs/specs, jobs table, adapter methods, metering and a UI or API.
- **The catalog has no batch-price field.** Affects: Cost accounting for any future batch. Evidence: packages/ai/model-registry/catalog/models.curation.json:135 note. Work needed: Add a field and regenerate the catalog.

**Depends on**

- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- F091-07

## Unknown

- Whether the owner wants batch or deferred inference in the product.
- Whether any provider adapter exposes a batch call (search found none).
- Which apps, if any, should offer it, and under which plans.

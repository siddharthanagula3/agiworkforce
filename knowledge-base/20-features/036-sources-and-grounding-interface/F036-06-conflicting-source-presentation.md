---
id: "F036-06"
type: "feature"
title: "Conflicting-source presentation"
aliases: ["Conflicting sources", "Source disagreement", "S36.18"]
area: "36 Sources and grounding interface"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.18"]
depends_on: ["F036-01", "F036-02", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "surface:web", "surface:mobile", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-06 Conflicting-source presentation

Not built. When sources disagree, the answer should say so and list each side's sources. No app has a special display for it, and no code for it was found in the files opened. A model may describe a disagreement in plain text, but the product does nothing to structure it.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.18](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3618).

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

**What it does.** Nothing today. It would present a claim on which sources disagree, with each side's sources listed.

**Why it exists.** A confident answer built on conflicting sources misleads. The brief lists it as S36.18, missing on all apps.

**Who uses it.** Readers of research and search answers; no one can use it yet.

**Problems it solves**

- A reader sees one claim and one chip and never learns that another source says the opposite.

**Use cases**

- Two news sites report different totals.
- A vendor page and a review disagree on a feature.

## 2. User experience

**Where to find it**

- Not available on any app (brief S36.18).

**Before you start**

- Not applicable.

**Screens and controls**

- Not available. Today a grouped chip lists several sources for one claim without saying whether they agree (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:168-182).

**Journey**

1. Not available.

**What the person sees and gets**

- Not available.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for conflicts.

**Incomplete**

- A grouped chip can hold several sources, but carries no agree or disagree meaning (CitationChip.tsx:124-186).

**Present but disconnected or switched off**

- none found.

**Not available**

- Any conflict marker, side grouping, or conflict wording. Searches covered the brief, the shared chip code and the contract files; a full repository search for a conflict feature was not run, so other code may exist (unknown).

## 4. Required behaviour

**Established requirements**

- When sources conflict, the answer presents the disagreement with each side's sources. (source: S36.18)
- The research flow requires each factual claim to have supporting evidence or an explicit uncertainty. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. [proposed] An answer with two disagreeing sources names the disagreement.
2. [proposed] Each side lists its sources as chips.
3. [proposed] The grouping works on Web, Desktop, Mobile, Chrome.
4. [proposed] A claim with no conflict looks as today.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Detecting a conflict needs model judgment or a structured field from the research step, because the contract has no such field [inferred from absence in AgentEventSource.ts:3].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the model mark sides in its answer with a defined markdown form, rendered as two groups of chips.
- [proposed] Add an evaluation set of conflicting sources to the research quality checks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Would render each side's group. |
| service | linkifyCitationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Markers have no side meaning (354). |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Where a conflict form would be rendered. |
| schema | AgentEventSource | `packages/contracts/types/src/generated/protocol/AgentEventSource.ts` | Source record with no stance field. |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Where research sources are gathered and could be compared. |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Report display where a conflict section could go. |
| component | MarkdownInline (mobile) | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | Mobile marker grouping (305). |
| component | Chrome sources.ts | `apps/extension/src/features/side-panel/sources.ts` | Chrome grouping (102). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. Sources reach the answer as one numbered list with no stance. | our servers | AgentEventSource.ts:3; research-loop.ts:847 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None | not applicable | not applicable | not applicable |

**Models and providers.** Only the model's own prose could state a disagreement today. Whether any prompt asks for it: not established (a limited search of the chat prompts folder returned no relevant result).

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
| Local mode | Not available in any mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sources disagree | not handled in the code; the answer shows chips as for any claim. | CitationChip.tsx:124-186 |
| Loading, error, offline for conflicts | not handled in the code because the feature does not exist. | No conflict code found in CitationChip.tsx, citationMarkers.ts or the contract files |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `none found` (not found): No test for conflicting-source presentation was found.

**Test scenarios**

- **Confirm absence**
  1. Ask about a topic where two sources disagree.
  2. Read the answer.
  - Expected: No special conflict display, only normal chips.
- **Future: two sides**
  1. [proposed] Run the same question after the feature exists.
  - Expected: [proposed] The answer states the disagreement and shows two groups of sources.
- **Future: no conflict**
  1. [proposed] Ask a question with agreeing sources.
  - Expected: [proposed] No conflict section.

**Where to look when it fails**

- No log lines exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No conflict presentation** Affects: All six apps. Evidence: area brief S36.18. Work needed: Define the form, extraction, rendering and tests.
- **Source record has no stance** Affects: All apps. Evidence: AgentEventSource.ts:3. Work needed: Contract field or markdown form.
- **No evaluation for conflicts** Affects: Quality. Evidence: none found. Work needed: Add cases.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F036-01
- F036-02
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- surface:web
- surface:mobile
- surface:chrome

## Unknown

- Whether prompts ask models to flag conflicts.
- Whether any code outside the files opened handles conflicts.
- Whether research reports have a conflict section.

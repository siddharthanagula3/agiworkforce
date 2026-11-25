---
id: "F036-09"
type: "feature"
title: "User-controlled evidence set"
aliases: ["User-controlled evidence set (S36.24)", "Add, pin or remove sources", "Allowed source controls"]
area: "36 Sources and grounding interface"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.24"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-09 User-controlled evidence set

A person choosing which sources an answer may use. The brief marks it not applicable on every app, so nothing in the Sources area implements it. Project files are shown as citations, but the choice happens elsewhere (projects). Project docs say allowed source controls must be enforced.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.24](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3624).

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

**What it does.** Would let a person add, pin or remove sources and have the answer use only that set. The brief says 'not applicable anywhere' for this area (brief S36.24).

**Why it exists.** Control over evidence builds trust. The product contract says allowed source controls are enforced, not just included in a prompt (doc: docs/product/experience-contract.md:781 W08).

**Who uses it.** Researchers and project users. Today they set project knowledge outside this area.

**Problems it solves**

- Not solved in this area. Project knowledge and connectors cover part of it elsewhere.

**Use cases**

- A user limits a research run to chosen sites.
- A user pins a project file as required evidence.
- A tester checks the answer cites only allowed sources.

## 2. User experience

**Where to find it**

- Not applicable on all six apps per the brief.
- Related: Web project 'SourcesPanel' (apps/web/features/projects/components/SourcesPanel.tsx) cited in the brief for page locators (S36.09); its add/remove controls were not read: unknown.
- Related: Web 'Project' menu in the report view saves a report into a project's sources (ResearchReportView.tsx:395-415).

**Before you start**

- none for this area.

**Screens and controls**

- No add, pin or remove control in the report view or the citation chips.

**Journey**

1. not defined in this area. [proposed] Choose sources before a run, run, check the answer cites only them.

**What the person sees and gets**

- none

**Settings**

- none found in the code in this area.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Saving a finished report into a project makes it one of that project's sources (apps/web/features/chat/components/research/ResearchReportView.tsx:199-208,284-300; test apps/web/features/chat/components/research/ResearchReportView.projectSave.test.tsx).

**Incomplete**

- Allowed-source enforcement for research runs: not traced. A research source module exists (apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts) but its rules were not read: unknown.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Adding, pinning or removing sources for one answer from the citation area on any app (brief: not applicable).

## 4. Required behaviour

**Established requirements**

- The answer uses only the set of sources the person chose. (source: S36.24 (brief; marked not applicable))
- Allowed source controls are enforced, not just included in a prompt. (source: doc: docs/product/experience-contract.md:781 (W08))
- Shared-project access follows current permissions; omitted or unreadable sources are reported. (source: doc: docs/product/experience-contract.md:778 (W05))

**Acceptance criteria**

1. Because the brief says not applicable, a tester confirms no evidence-set control appears in the report view.
2. If built: with sources A and B chosen, no citation points to C.
3. If built: removing a source removes it from later citations.
4. If built: pinned source is used when relevant.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The decision that this is not applicable in the Sources area may mean the control lives in Projects or research settings. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Confirm with the owner where evidence control belongs, then link it from here; do not build a second copy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Report view; has Save to project but no evidence controls |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | Used to upload a report as a project source (imported at line 46) |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Project sources UI cited in the brief; controls not read |
| service | research-sources | `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Server research source handling; rules not read |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Server research loop that gathers sources and sets retrieval time (brief S36.06) |
| schema | project-file-citations | `packages/contracts/types/src/project-file-citations.ts` | Contract for project-file citations |
| component | ProjectFileCitationChip | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | Shows a project file as a citation |
| schema | Citation | `packages/contracts/types/src/research.ts` | Citation record; no pinned or excluded field |
| test | research-sources.test.ts | `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-sources.test.ts` | Tests server research-source code; coverage not read |
| test | ResearchReportView.projectSave.test.tsx | `apps/web/features/chat/components/research/ResearchReportView.projectSave.test.tsx` | Tests saving a report into a project |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No evidence-set flow exists in this area. A person can save a report to a project, which uploads a markdown file as project knowledge. | device and our servers | ResearchReportView.tsx:284-300; apps/web/features/projects/services/project-knowledge-upload.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report saved as a project source file | project knowledge storage (exact store not traced): unknown | unknown | unknown |

**Models and providers.** none found in this area.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Project save needs a signed-in account [inferred from project store use]. |
| Permissions | none found in the code for evidence control. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Not available in this area. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Save to project fails | Alert text 'That report could not be saved to the project' | ResearchReportView.tsx:292-296 |
| Evidence-set states | not handled in the code | No match in files listed |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportView.projectSave.test.tsx`: Saving a report into a project's sources

**Test scenarios**

- **No evidence control present**
  1. Open a report on Web.
  2. Look for add, pin, remove source controls.
  - Expected: None, matching the brief's not-applicable status.
- **Save to project**
  1. Open a report, choose Project menu, pick a project.
  - Expected: Report becomes a project source; failure shows an alert.
- **Allowed-source enforcement (when defined)**
  1. Restrict a run to one site.
  2. Run research.
  3. Check citations.
  - Expected: Only that site's sources appear. Not testable until the control exists.

**Where to look when it fails**

- none specific.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No user control over the evidence set in the Sources area** Affects: All six apps. Evidence: Brief S36.24 not applicable. Work needed: Decide ownership (Projects or research settings) and link it; do not duplicate.
- **Project docs require enforced source controls; enforcement not verified** Affects: Web, Desktop. Evidence: docs/product/experience-contract.md:781. Work needed: Read research-sources.ts and research-loop.ts and test enforcement.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline

## Unknown

- Where evidence selection actually lives, if anywhere.
- Whether research runs honour allowed-source lists (research-sources.ts not read).
- Whether SourcesPanel offers add or remove controls.
- Why the brief marks this not applicable.

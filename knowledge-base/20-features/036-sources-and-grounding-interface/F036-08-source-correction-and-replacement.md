---
id: "F036-08"
type: "feature"
title: "Source correction and replacement"
aliases: ["Source correction (S36.22)", "Source replacement (S36.23)", "Flag a wrong citation", "Swap a cited source"]
area: "36 Sources and grounding interface"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.22", "S36.23"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "table:research_reports", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-08 Source correction and replacement

Planned ability to flag a wrong citation or replace a cited source and have the answer updated. Not built on any of the six apps. The only nearby control is Mobile's 'Report this research report', which reports the whole report for content problems, not one citation.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.22](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3622), [S36.23](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3623).

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

**What it does.** Would let a person mark one citation as wrong, or swap it for a different source so the answer text is corrected. Today neither exists (brief S36.22 and S36.23: missing on all apps).

**Why it exists.** The brief says a user should be able to flag or correct a wrong citation and have the correction applied, and replace a cited source and get the answer updated (doc: knowledge-base/data/area-briefs/036-sources-and-grounding-interface.md S36.22, S36.23).

**Who uses it.** Readers of cited answers and research reports who find a wrong source. No one can use it yet.

**Problems it solves**

- Not solved today: a wrong citation can only be ignored or the report rerun.

**Use cases**

- A reader sees a claim linked to an unrelated page and wants to flag it.
- A reader wants to replace a weak source with a better one and regenerate the sentence.
- A tester confirms there is no such control (current state).

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile, CLI, VS Code or Chrome.
- Nearest related controls: Web 'Run again' button (aria-label 'Run this research again for current sources') (apps/web/features/chat/components/research/ResearchReportView.tsx:360-363) and Mobile 'Report this research report' in the report More menu (apps/mobile/src/features/research/ReportsScreen.tsx:72,353).

**Before you start**

- none: feature does not exist.

**Screens and controls**

- No per-citation flag or replace control in CitationRow (ResearchReportView.tsx:70-130) or in the mobile chip (CitationChip.tsx).

**Journey**

1. Required journey not defined in the code. [proposed] Open citation, choose Flag or Replace, confirm, see the answer update.

**What the person sees and gets**

- none

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile can report a whole research report through a report sheet with subject kind 'research-report' (apps/mobile/src/features/research/ReportsScreen.tsx:72-86,505-511). This is content reporting, not citation correction.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Flagging one citation: all apps (brief S36.22).
- Replacing a cited source and updating the answer: all apps (brief S36.23).
- Web 'Run again' reruns the entire research for current sources; it does not replace one source (ResearchReportView.tsx:355-363).

## 4. Required behaviour

**Established requirements**

- A flagged citation is recorded and the correction applied. (source: S36.22 (brief))
- A replaced source updates the answer that cites it. (source: S36.23 (brief))
- Citations must resolve to the material that supports the claim. (source: doc: docs/product/experience-contract.md:781 (W08))

**Acceptance criteria**

1. Each citation offers a flag control (currently fails).
2. A flagged citation is stored and visible after reload (currently fails).
3. Replacing a source changes the cited text and the source list (currently fails).
4. The control is reachable by keyboard and screen reader (currently fails).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Corrections would need a stored record per citation, so a table or column is required. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with a flag that records report id, citation index and a reason, and use it in quality review.
- [proposed] Replacement should rerun only the affected claim, not the whole report, and ask first because it changes the saved report.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Where a Web control would sit; today has Run again only |
| component | CitationRow | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Per-source row with no flag or replace control |
| component | CitationChip (shared) | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Shared inline chip with tooltip; no flag control |
| component | CitationChip (mobile) | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Mobile chip dialog has Cancel and Open page only (line 49-53) |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Hosts the whole-report 'Report this research report' action |
| service | researchReportTarget | `apps/mobile/src/features/research/ReportsScreen.tsx` | Builds the report target for the report sheet (research-report subject) |
| schema | Citation | `packages/contracts/types/src/research.ts` | Citation contract with no correction fields |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Stores citations; no correction or flag column |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Read-only; this file has GET handling only in what was read (lines 1-60); other methods not checked |
| test | ReportsScreenActions.test.tsx | `apps/mobile/src/features/research/__tests__/ReportsScreenActions.test.tsx` | Tests the report-level menu actions |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. A person can only reopen the report; on Web, 'Run again' starts a new research run on the same question through the host. | device and our servers | ResearchReportView.tsx:355-363 (onRunAgain host callback) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No correction record | not stored: none found in the code | not applicable | not applicable |

**Models and providers.** A replacement that updates an answer would need a model call; none is wired. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (feature absent). |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable until built. |
| Provider restrictions | none found in the code. |
| Local mode | Not available. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | not handled in the code (feature absent) | No match in the files under implementation_map |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/research/__tests__/ReportsScreenActions.test.tsx`: Mobile More menu lists Download, Share, Save to Library and 'Report this research report'; no citation correction

**Test scenarios**

- **No per-citation flag on Web**
  1. Open a report with sources on Web.
  2. Look at each source row and inline marker.
  - Expected: No flag or replace control (current state; failing against the brief).
- **No per-citation flag on Mobile**
  1. Open a report on Mobile, tap a chip.
  - Expected: Dialog offers Cancel and Open page only.
- **Whole-report report**
  1. Open More menu on a Mobile report.
  2. Choose 'Report this research report'.
  - Expected: Report sheet opens for the whole report, not a citation.

**Where to look when it fails**

- none: no log lines or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No way to flag a wrong citation** Affects: All six apps. Evidence: Brief S36.22 missing. Work needed: Control, API, storage, review path.
- **No way to replace a cited source** Affects: All six apps. Evidence: Brief S36.23 missing. Work needed: Control, regeneration of the affected claim, confirmation, saved-version handling.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- table:research_reports
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-security-and-privacy

## Unknown

- Whether other methods (POST, PATCH) exist on /api/research/reports beyond line 60 of route.ts.
- What the Mobile report sheet does with its submission.
- Whether a design for correction exists in docs/specs: not searched.

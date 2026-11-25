---
id: "F108-04"
type: "feature"
title: "Financial filings analysis and source library (not built)"
aliases: ["Earnings and filing analysis (S108.11)", "Literature and source management (S108.21)", "Source library", "BibTeX export"]
area: "108 Specialist workspaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.11", "S108.21"]
depends_on: ["F108-03", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-04 Financial filings analysis and source library (not built)

Planned: fetch earnings releases, transcripts or SEC filings and analyse them, and keep a source library with tags, citations and BibTeX export. Nothing for filings, tags or BibTeX exists. The nearest real code is the Deep Research source list and Markdown report export, which are per report, not a library.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.11](../../10-requirements/capabilities/108-specialist-workspaces.md#s10811), [S108.21](../../10-requirements/capabilities/108-specialist-workspaces.md#s10821).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. Planned per the brief: pull filings or transcripts and analyse them, and keep a user library of sources and papers with import, tags, citations and BibTeX export.

**Why it exists.** The brief lists them as parts of the finance and science workspaces (S108.11, S108.21).

**Who uses it.** Planned for investors and researchers.

**Problems it solves**

- Planned: reading long filings quickly
- Planned: keeping sources between research runs
- Planned: exporting citations to reference managers

**Use cases**

- Planned: summarise a quarterly filing
- Planned: tag papers and export a BibTeX file
- Planned: reuse a source across reports

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome: not present (brief status missing).
- CLI, VS Code: not applicable.

**Before you start**

- Not built.

**Screens and controls**

- None. Adjacent: the sources side panel for one answer (apps/web/features/chat/components/research/ResearchPanel.tsx) and report export formats including Markdown (ResearchReportView.tsx:134).

**Journey**

1. No journey. A person can ask Deep Research (F108-03) about a company; the loop may read public pages, but there is no filing-specific fetch.

**What the person sees and gets**

- None specific. Reports show numbered citations.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for these two items. Search: git grep -i -E 'bibtex|edgar|sec filing|earnings (call|release)' across apps and packages (excluding json and markdown) found no feature code.

**Incomplete**

- Adjacent: research runs can read pages through url_fetch (research-loop.ts:152-165) and keep a deduplicated source list per run; saved reports store citations (apps/web/lib/services/research-report-service.ts:23-36). Citations are not a reusable library.

**Present but disconnected or switched off**

- none found

**Not available**

- All apps: filings analysis and source library are missing (brief).

## 4. Required behaviour

**Established requirements**

- The product pulls earnings releases, transcripts or SEC filings and analyses them. (source: S108.11 (brief))
- The user keeps a library of sources and papers inside the product: import, tag, cite and export BibTeX. (source: S108.21 (brief))

**Acceptance criteria**

1. Given a company and a filing type, the product retrieves the document from a named public source and shows an analysis with citations to passages.
2. A source can be added to a library, tagged and found again.
3. Exporting selected sources produces a valid BibTeX file.
4. Library data is per user and removable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A library could reuse the saved citations in research_reports [inferred from the citations column].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with a per-user table of sources fed by research runs, with tags.
- [proposed] Add a BibTeX export beside the Markdown export.
- [proposed] For filings, add a filing fetch tool with explicit allowed hosts through the existing domain policy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | research-loop source aggregator (adjacent) | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Adjacent: per-run dedupe and numbering of sources |
| service | research-report-service (adjacent) | `apps/web/lib/services/research-report-service.ts` | Adjacent: stores citations per report |
| component | ResearchReportView (adjacent) | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Adjacent: report export (Markdown) |
| component | ResearchPanel sources (adjacent) | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Adjacent: sources list per answer |
| other | url fetch tool (adjacent) | `apps/web/lib/url-fetch/url-fetch-tool.ts` | Adjacent: reads a page for a research round |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No filing fetch or library flow exists. | our servers | absence search over apps and packages |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data created | none | not applicable | not applicable |

**Models and providers.** None today. Adjacent research uses the shared provider adapters (see F108-03).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code for these items; adjacent Deep Research needs pro or higher (billing-catalog.ts:355) |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not available; nothing built. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the feature does not exist | absence search |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/research-report.test.ts`: Adjacent: report shaping and export helpers, not filings or BibTeX

**Test scenarios**

- **Confirm absence**
  1. Run git grep -i -E 'bibtex|edgar|sec filing' over apps and packages excluding json and markdown
  - Expected: No feature code
- **Adjacent behaviour**
  1. Run a Deep Research question about a company
  2. Open the sources panel
  - Expected: Numbered sources for this run only; no tags, library or BibTeX

**Where to look when it fails**

- No logs or tables exist for these items; see briefs S108.11 and S108.21

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Filing and transcript analysis is not built** Affects: All apps. Evidence: brief S108.11. Work needed: Source choice, fetch tool, analysis flow, tests
- **Source library with tags and BibTeX export is not built** Affects: All apps. Evidence: brief S108.21. Work needed: Table, endpoints, screens, export
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- F108-03
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Which filing sources are intended (SEC full-text, vendor APIs).
- Whether the library should be per account or per project.
- Whether a reference-manager import is wanted.

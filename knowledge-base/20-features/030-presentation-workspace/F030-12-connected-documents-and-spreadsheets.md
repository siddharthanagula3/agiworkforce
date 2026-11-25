---
id: "F030-12"
type: "feature"
title: "Connected documents and spreadsheets"
aliases: ["Connected documents and spreadsheets", "Linked sources for slides", "S30.31"]
area: "30 Presentation workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.31"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-execution-boundaries", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-12 Connected documents and spreadsheets

This feature would keep slides tied to a connected document or spreadsheet so they stay in step. No code for it was found on any app. Decks are plain text with optional charts and tables typed in by hand. Document export to Google Docs exists for documents only.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.31](../../10-requirements/capabilities/030-presentation-workspace.md#s3031).

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

**What it does.** Would let a slide point to a connected document or spreadsheet and stay tied to it (not built).

**Why it exists.** The brief wants slides that reference connected documents or spreadsheets and stay tied to them (S30.31).

**Who uses it.** Not applicable until built. Likely people who present numbers kept in a spreadsheet.

**Problems it solves**

- Stale numbers in a deck when the source sheet changes (not solved today)

**Use cases**

- A chart on slide 4 that reads a connected sheet (not built).
- A slide that quotes a connected document and updates (not built).

## 2. User experience

**Where to find it**

- Not found in any app.

**Before you start**

- Not applicable.

**Screens and controls**

- Closest present controls: 'Insert' menu items Image, Table, Chart, Diagram, shapes that put typed data into the slide (PresentationWorkspace.tsx:327-363); 'Edit chart data' grid for chart numbers (PresentationWorkspace.tsx:670-688).

**Journey**

1. No linking journey exists. A person types or pastes numbers into the chart grid, or asks the assistant to write them.

**What the person sees and gets**

- none found in the code

**Settings**

- Connectors have their own settings (SYS-connectors-plugins-and-skills); none connect to decks in the code read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chart data is stored inside the slide as a chart block and edited in a grid (apps/web/features/chat/components/artifacts/presentation/chart-block.ts; ChartDataEditor.tsx).
- Document artifacts can be exported to Google Docs through api /api/artifacts/export/google-docs (ArtifactPreview.tsx:1491-1511); this is for text documents, not decks.

**Incomplete**

- none found

**Present but disconnected or switched off**

- none found

**Not available**

- Any reference from a slide to a connected document or spreadsheet, on web, desktop, mobile, CLI, VS Code and Chrome. A search of the presentation folder, deck model and mobile deck viewer found no source reference field (files read: PresentationWorkspace.tsx, deck-request.ts, PresentationDeckView.tsx).

## 4. Required behaviour

**Established requirements**

- Slides can reference connected documents or spreadsheets and stay tied to them (S30.31). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.31)
- Connected document and spreadsheet access follows the connector rules and the trust boundary: nothing routes across Local, own key and Cloud silently. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A slide element can name a connected source and range.
2. When the source changes, the slide shows a stale marker or refreshes on request.
3. If the connector is disconnected, the slide keeps the last values and says the link is broken.
4. A Local chat never reads a connected source through Cloud without consent (AGENTS.md section 6).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The link must survive export to PDF and HTML as static values [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the source reference as a field beside the chart block in the deck text.
- [proposed] Start with spreadsheet-backed charts, then document quotes.
- [proposed] Write a spec under docs/specs before building, because no spec was found.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Where an Insert entry for a linked source would go (327-363); not present today. |
| service | chart-block | `apps/web/features/chat/components/artifacts/presentation/chart-block.ts` | Holds chart data inside the slide; no source reference. |
| component | ChartDataEditor | `apps/web/features/chat/components/artifacts/presentation/ChartDataEditor.tsx` | Manual chart data grid. |
| service | deck-model | `packages/ui/unified-chat/src/lib/deck-model.ts` | Deck text model; no field for sources. |
| component | PresentationDeckView | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile deck viewer; no linking. |
| endpoint | api:/api/artifacts/export/google-docs | `apps/web/app/api/artifacts/export/google-docs` | Exports a document artifact to Google Docs; not for decks. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Hosts the deck and the Google Docs export for documents (1491-1511). |
| test | chart-block.test.ts | `apps/web/features/chat/components/artifacts/presentation/chart-block.test.ts` | Chart block parsing; no linking cases. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Not applicable. No code reads a connected document or spreadsheet for a slide. | device | not found in the presentation folder or mobile deck viewer |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chart numbers typed by the person | Inside the deck text as a chart block | With the artifact | As the artifact versions |

**Models and providers.** No model takes part because the feature does not exist.

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
| Local mode | Not applicable; no code. When built, it must not read connected sources through our servers in Local mode without consent (doc: AGENTS.md section 6). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, offline, recovery) | not handled in the code because the feature is not built | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/chart-block.test.ts`: Chart block data only; nothing about linked sources.

**Test scenarios**

- **Confirm absence**
  1. Open a deck on web and mobile
  2. Look in Insert, Slide and Theme menus and the viewer for a link or source control
  - Expected: No such control. Record the date and version.
- **Manual workaround**
  1. Insert a chart
  2. Press 'Edit chart data' and paste numbers from a sheet
  - Expected: Chart shows pasted numbers; no link to the sheet exists.
- **Search**
  1. Search the repository for a slide source or link field in deck-model.ts
  - Expected: No match.

**Where to look when it fails**

- No log lines or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Linked documents and spreadsheets are not built** Affects: All six apps (S30.31). Evidence: No code in apps/web presentation folder, deck-model.ts or the mobile deck viewer. Work needed: Write a spec; add a source field to the deck model; build refresh over the connector layer; add trust-boundary checks.
- **No spec found for this feature** Affects: Planning. Evidence: docs/product/requirements.md mentions deck export but no linking; no deck spec folder was read. Work needed: Create a spec under docs/specs after owner decision.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-execution-boundaries
- surface:web
- surface:mobile

## Unknown

- Whether the owner wants linking in this release.
- Which connectors would be the first source.
- Whether any spec elsewhere describes it; only docs/product and docs/decisions were searched by keyword and the deck-linking topic did not appear in the lines read.

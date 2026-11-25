---
id: "F036-05"
type: "feature"
title: "Locators for lines, cells, slides and media"
aliases: ["Line-range locator", "Cell-range locator", "Slide locator", "Timestamp locator", "S36.10", "S36.11", "S36.12", "S36.13"]
area: "36 Sources and grounding interface"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.10", "S36.11", "S36.12", "S36.13"]
depends_on: ["F036-04", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-api-and-contracts", "surface:web", "surface:mobile", "file:packages/contracts/types/src/project-file-citations.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-05 Locators for lines, cells, slides and media

Not built. It would let a citation name a line range in code or text, a cell range in a sheet, a slide number, or a timestamp in audio or video, and open the source there. No app has it. The shared contract has only a page number or a heading trail.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.10](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3610), [S36.11](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3611), [S36.12](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3612), [S36.13](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3613).

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

**What it does.** Nothing today. It is meant to name the exact place inside a source for four more file kinds: text or code lines, sheet cells, slides and media time.

**Why it exists.** Citations should resolve to the page or line that supports the claim (doc: docs/product/competitive-guidance.md:283). The brief lists the four locators as S36.10 to S36.13, all missing.

**Who uses it.** Users who ask about code, spreadsheets, slide decks, audio and video in Projects or files; none can use it yet.

**Problems it solves**

- Reader must search a long file to check a claim.
- Citation to a sheet or video gives no place.

**Use cases**

- Cite lines 10 to 20 of a source file.
- Cite cells B2 to C8 of a sheet.
- Cite slide 4 of a deck.
- Cite 03:12 in a recording.

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile, CLI, VS Code or Chrome (brief S36.10-S36.13).

**Before you start**

- Not applicable.

**Screens and controls**

- Not available. The nearest existing control is the project-file chip, which shows 'p. N' or a heading trail only (packages/contracts/types/src/project-file-citations.ts:86-93).

**Journey**

1. Not available.

**What the person sees and gets**

- Not available. A project file chip shows only a page or heading, so a file of another kind shows only its file name.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for these four locators. The existing page and heading locator works (see F036-04).

**Incomplete**

- The anchor type has only page and headingPath (project-file-citations.ts:10-15).

**Present but disconnected or switched off**

- none found.

**Not available**

- Line range, cell range, slide number, media timestamp: no field, parser, formatter or chip on any app. parseAnchor reads only page and headingPath, so an extra field from a server would be dropped (project-file-citations.ts:44-60) [inferred]. The search for other code was limited to the files named in the brief and the contract.

## 4. Required behaviour

**Established requirements**

- Citations to text or code name a line range and open the source at those lines. (source: S36.10)
- Citations to spreadsheets name the sheet and cell range. (source: S36.11)
- Citations to slide decks name the slide number. (source: S36.12)
- Citations to audio or video name a timestamp and open the media there. (source: S36.13)
- Citation integrity names the file page or line. (source: doc: docs/product/competitive-guidance.md:283)

**Acceptance criteria**

1. [proposed] A citation with a line range shows 'lines 10-20' and opens the file at line 10.
2. [proposed] A citation with a cell range shows the sheet and range.
3. [proposed] A citation with a slide shows 'slide 4'.
4. [proposed] A citation with a timestamp shows mm:ss and the player starts there.
5. [proposed] A citation with no locator shows the file name only (current behaviour).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The contract needs new optional anchor fields, which older apps would ignore because every field is optional (comment at project-file-citations.ts:1-7) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Extend ProjectFileAnchor with line, cell, slide and time fields and one formatter.
- [proposed] Server-side extraction of these anchors beside the page and heading anchors in apps/web/lib/server/project-knowledge-anchors.ts.
- [proposed] Viewer support for each kind.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ProjectFileAnchor | `packages/contracts/types/src/project-file-citations.ts` | Current anchor shape: page and headingPath only (10-15). |
| service | parseAnchor | `packages/contracts/types/src/project-file-citations.ts` | Reads only page or headingPath (44-60). |
| service | formatProjectFileAnchor | `packages/contracts/types/src/project-file-citations.ts` | Formats page or heading only (86-93). |
| service | projectFileCitationHref | `packages/contracts/types/src/project-file-citations.ts` | Link carries file and page only (138-150). |
| component | ProjectFileCitationChip | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | Web chip that would show a new locator. |
| component | ProjectFileCitations (mobile) | `apps/mobile/src/features/chat/components/ProjectFileCitations.tsx` | Mobile chip that would show it. |
| service | project-knowledge-anchors | `apps/web/lib/server/project-knowledge-anchors.ts` | Builds page and heading anchors; where new anchors would be built. |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Opens a file at a page; would need to open at a line, cell, slide or time. |
| test | project-file-citation-links test | `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts` | Existing link test to extend. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists for these locators. The existing page and heading flow is in F036-04. | our servers | project-file-citations.ts:44-60 shows nothing else is read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None for these locators | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable today. A model would need to be given line, cell, slide or time information in its context to cite it; how is unknown.

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
| Source has no recognised locator | Chip shows the file name only. | project-file-citations.ts:86-93 |
| Server sends an unknown anchor field | Dropped by the parser [inferred]. | project-file-citations.ts:44-60 |
| Loading, error, offline for these locators | not handled in the code because the feature does not exist. | No code found for the four locators in project-file-citations.ts or the chips |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts`: Existing page and link behaviour only (by file name); no test for these four locators was found.

**Test scenarios**

- **Confirm absence**
  1. Cite a spreadsheet in a Project chat.
  2. Read the chip.
  - Expected: File name only, no cell range.
- **Unknown anchor field**
  1. Feed parseProjectFileCitations an anchor with a line field.
  - Expected: Anchor comes back undefined.
- **Future: line range**
  1. [proposed] Cite lines 10-20.
  - Expected: [proposed] Chip shows the range and opens at line 10.

**Where to look when it fails**

- No log lines exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No locator types for lines, cells, slides or media time** Affects: All six apps. Evidence: project-file-citations.ts:10-15. Work needed: Contract fields, server extraction, chip display, viewer positioning.
- **Viewer cannot open at those places** Affects: Web, Mobile. Evidence: SourcesPanel.tsx:164-168 reads only page. Work needed: Viewer support per file kind.
- **Whether a media player or sheet viewer exists in Projects** Affects: Planning. Evidence: not checked. Work needed: Inspect the project file previewers.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F036-04
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-api-and-contracts
- surface:web
- surface:mobile
- file:packages/contracts/types/src/project-file-citations.ts

## Unknown

- Whether any code path outside the files opened handles these locators.
- What viewers Projects has for sheets, slides and media.
- Whether the search retrieval keeps line, cell, slide or time information.

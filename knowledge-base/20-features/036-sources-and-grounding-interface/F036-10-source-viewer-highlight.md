---
id: "F036-10"
type: "feature"
title: "Source viewer highlight"
aliases: ["Highlighted passage in source viewer (S36.15)", "Cited-passage highlight"]
area: "36 Sources and grounding interface"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-10 Source viewer highlight

A source viewer that opens a citation with the cited passage marked. The brief marks it not applicable on every app and no viewer exists. Citations open the external page in a new tab or in-app browser, with only a text excerpt shown beside them.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.15](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3615).

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

**What it does.** Would show the source with the supporting passage highlighted. Today a citation opens the source page itself, unmarked. The nearest feature is the quoted excerpt in the citation tooltip or preview (brief S36.08).

**Why it exists.** Brief: opening a citation should show the source with the cited passage highlighted (S36.15). Product guidance asks to connect each citation to the correct source passage (doc: docs/product/competitive-guidance.md:283).

**Who uses it.** Readers checking a claim. No one yet.

**Problems it solves**

- Not solved: the reader must search the opened page for the passage.

**Use cases**

- A reader checks a quote in a long PDF.
- A reader checks a claim against a web page.
- A tester confirms the marked passage matches the claim.

## 2. User experience

**Where to find it**

- Not available on any app (brief: not applicable).
- Nearest: Web and Desktop citation chip opens the source URL in a new tab (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:148-150) and its tooltip lists each source; Mobile chip shows an alert with the source name, dates and snippet, then 'Open page' (apps/mobile/src/features/chat/components/CitationChip.tsx:43-53).

**Before you start**

- none: feature does not exist.

**Screens and controls**

- Web chip: anchor with target _blank; tooltip rows (TooltipSourceRow).
- Mobile chip: Alert dialog with Cancel and Open page.

**Journey**

1. Tap or click the citation.
2. Web opens the page in a new tab; Mobile shows the dialog then the in-app browser. No highlight.

**What the person sees and gets**

- Excerpt text in the tooltip or dialog when the source has a snippet (CitationChip.tsx:125 shared; mobile line 46).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Citation opens the source in a new tab on Web (CitationChip.tsx:148-150) and in the in-app browser on Mobile (apps/mobile/src/features/chat/utils/sourceDisplay.ts:24-31).
- Mobile strips tracking parameters before opening (sourceDisplay.ts:29).

**Incomplete**

- Quoted excerpt is shown as text, not located in the source (shared CitationChip.tsx:125; project-file-citations.ts:21).

**Present but disconnected or switched off**

- nothing found

**Not available**

- In-product source viewer with highlight on all apps (brief S36.15).

## 4. Required behaviour

**Established requirements**

- Opening a citation shows the source with the cited passage highlighted. (source: S36.15 (brief; not applicable))
- Connect each citation to the correct source passage, file page or line. (source: doc: docs/product/competitive-guidance.md:283)

**Acceptance criteria**

1. Because brief says not applicable, a tester confirms clicking a citation opens the plain source with no highlight.
2. If built: opening a PDF citation lands on the page and marks the passage.
3. If built: opening a web citation marks the passage or shows it in context.
4. If built: a source that cannot be shown falls back to the plain link.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A highlight needs a stored passage and an offset or text fragment; the Citation contract has only snippet, not offsets. [inferred from packages/contracts/types/src/research.ts:76-90]

**Proposed improvements** (suggestions, not requirements)

- [proposed] For web pages use a text-fragment link to the snippet where the site allows; for project files reuse the page locator.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CitationChip (shared) | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Inline chip and tooltip; opens URL |
| component | ProjectFileCitationChip | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | Chip for project files with page locator |
| schema | project-file-citations | `packages/contracts/types/src/project-file-citations.ts` | Project file citation contract incl. excerpt and page |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Project source panel; opens a file at a page per brief S36.09 |
| component | CitationChip (mobile) | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Preview dialog with snippet, then open |
| service | openSource | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | Opens URL in the in-app browser |
| service | citationPublisher | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Publisher, date and snippet helpers |
| schema | Citation | `packages/contracts/types/src/research.ts` | Has snippet but no offsets |
| component | CitationRow | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Report source row; plain link |
| test | project-file-citation-links.test.ts | `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts` | Tests project-file citation links; contents not read |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks a Web citation; the browser opens the external page in a new tab. | device | CitationChip.tsx:148-150 (target _blank, rel noopener noreferrer) |
| The external site serves the page; the product does not mark anything. | outside service | No highlight code found in the listed files |
| On Mobile the chip shows an alert and opens the URL in the in-app browser. | device | apps/mobile/src/features/chat/components/CitationChip.tsx:43-53; sourceDisplay.ts:24-31 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Snippet text on the citation | citations jsonb in research_reports; message metadata for chat answers | Server-stored for reports | With the report; chat answer retention unknown |

**Models and providers.** The snippet comes from the search or research provider result; which provider was not traced for this page.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for opening a link. |
| Permissions | Opens only http/https on Mobile (externalUrls.ts:3). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Opening a link needs the device network; no product server is involved on Mobile. Web citations from Local answers: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Open fails on Mobile | Alert 'Could not open citation' with 'Check your connection and try again.' | CitationChip.tsx:48; sourceDisplay.ts:30-33 |
| Source has no snippet | Dialog shows site line only | CitationChip.tsx:46-47 |
| Highlight states | not handled in the code | No match |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts`: Project-file citation links (contents not read)
- `apps/mobile/__tests__/AssistantLinkOpening.test.tsx`: Mobile link opening; exact cases not read

**Test scenarios**

- **Plain open on Web**
  1. Click a citation chip.
  - Expected: New tab with the source; no highlight (matches brief).
- **Mobile preview**
  1. Tap a chip with a snippet.
  - Expected: Dialog shows title, host, dates and snippet, then Open page.
- **Open failure**
  1. Go offline, tap Open page.
  - Expected: Alert 'Could not open citation'.

**Where to look when it fails**

- Mobile alert titles above.
- No server logs relate.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No viewer and no highlight** Affects: All six apps. Evidence: Brief S36.15 not applicable. Work needed: Needs product decision first; then viewer, stored offsets, fallback.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx

## Unknown

- Whether the owner wants a viewer at all (brief says not applicable).
- How the page-locator open (S36.09) is implemented in SourcesPanel.
- Contents of the two listed tests.

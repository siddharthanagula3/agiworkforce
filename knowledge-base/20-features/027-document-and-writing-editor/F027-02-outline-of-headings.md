---
id: "F027-02"
type: "feature"
title: "Outline of headings"
aliases: ["Outline panel", "Document outline", "Outline", "Table of contents", "S27.12"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S27.12"]
depends_on: ["surface:web", "surface:mobile", "file:packages/ui/unified-chat/src/lib/markdown-headings.ts", "file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-02 Outline of headings

For a long Markdown document, the web viewer and the mobile full-screen view show a collapsible Outline of its headings. Each entry is indented by heading level, and choosing one scrolls to that section. It appears only when the document has at least 3 headings.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.12](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2712).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists the headings (levels 1 to 4) found in the document and jumps to a heading when chosen (packages/ui/unified-chat/src/lib/markdown-headings.ts:17,31).

**Why it exists.** Long reports are slow to scan; the outline gives a map and a quick jump.

**Who uses it.** Readers of long generated documents on web and mobile.

**Problems it solves**

- Finding a section in a long report.
- Seeing the shape of a document before reading.

**Use cases**

- Open a research report on web and jump to its conclusion.
- On a phone, tap Outline and go to the third section.
- Skim headings of a plan before editing it.

## 2. User experience

**Where to find it**

- Web: a collapsible 'Outline' row with a count at the top of the rendered Markdown document in the panel (ArtifactPreview.tsx:313-350).
- Mobile: an 'Outline · N' button above the document in the full-screen view (ArtifactDocumentOutline.tsx:41-52; ArtifactFullScreen.tsx:1892).
- Desktop: no artifact code in apps/desktop; shows the hosted web app (AGENTS.md section 5). Chrome: no outline code found in artifactPanel.ts. CLI and VS Code: not applicable.

**Before you start**

- The document is Markdown (web) or non-code, non-chart text (mobile, ArtifactFullScreen.tsx:1070-1076) with at least 3 headings.

**Screens and controls**

- Web: a details element; its summary reads 'Outline' with the count; list inside a nav labelled 'Document outline'.
- Mobile: a button with accessibility label 'Outline, N sections' and, when open, one button per heading labelled 'Go to <heading>' (ArtifactDocumentOutline.tsx:41-65).

**Journey**

1. Open the document.
2. Open the Outline row.
3. Click or tap a heading.
4. The document scrolls to that heading.

**What the person sees and gets**

- The page scrolls so the heading is at the top (web scrollIntoView, ArtifactPreview.tsx:338-340; mobile animated scrollTo, ArtifactFullScreen.tsx:1089-1096).
- Mobile open state is remembered per artifact only while that artifact is open (outlineOpenFor, line 1078).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web builds the list with extractMarkdownHeadings and shows it when headings are 3 or more (ArtifactPreview.tsx:286,293,312).
- Web indents each entry by 12 pixels per level below the first heading (ArtifactPreview.tsx:330-333).
- Web gives rendered h1 to h4 elements ids so the jump works (ArtifactPreview.tsx:295-301).
- Mobile outline exists and is wired into the full screen, capped at 60 sections (reportSections.ts:8,26; ArtifactFullScreen.tsx:1070-1077,1892).
- Headings inside code fences are skipped (markdown-headings.ts:28-38).

**Incomplete**

- Only levels 1 to 4 are listed; headings 5 and 6 are not (markdown-headings.ts:17).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Chrome: no outline code found in apps/extension/src/features/side-panel/artifactPanel.ts.
- Web: the outline is not shown while the visual editor or source editor is open (the rendered preview component only).

## 4. Required behaviour

**Established requirements**

- A document view offers an outline of its headings that jumps to each section. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.12)
- The outline is shown only when there are at least 3 headings. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:286; apps/mobile/src/features/chat/components/ArtifactDocumentOutline.tsx:11)

**Acceptance criteria**

1. A document with 2 headings shows no outline on web or mobile.
2. A document with 3 headings shows 'Outline' with the number 3.
3. A level-3 heading under a level-1 heading is indented more than the level-1 heading.
4. Choosing a heading scrolls it to the top.
5. A '# comment' line inside a code fence is not listed.
6. On mobile each outline row is at least 44 points tall (test name in ArtifactFullScreen.outline.test.tsx:103).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief's 'mobile missing' is out of date, since the mobile outline exists and has a test.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Include levels 5 and 6.
- [proposed] Show the outline in the web editor view too.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | extractMarkdownHeadings, slugifyHeading | `packages/ui/unified-chat/src/lib/markdown-headings.ts` | Finds headings, skips fences, builds unique ids. |
| component | MarkdownDocumentPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web outline UI and heading id assignment (lines 288-355). |
| component | ArtifactDocumentOutline | `apps/mobile/src/features/chat/components/ArtifactDocumentOutline.tsx` | Mobile outline control and list. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Computes sections, tracks heading positions, scrolls (lines 1070-1100, 1892). |
| service | extractReportSections | `apps/mobile/src/features/research/reportSections.ts` | Wraps extractMarkdownHeadings and caps at 60. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Renders the headings the outline jumps to. |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Another web user of the same heading extractor (line 211). |
| test | markdown-headings test | `packages/ui/unified-chat/src/lib/markdown-headings.test.ts` | Tests the extractor. |
| test | mobile outline test | `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.outline.test.tsx` | Tests the mobile outline. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The viewer takes the document text and extracts headings. | device | ArtifactPreview.tsx:293; ArtifactFullScreen.tsx:1070 |
| If 3 or more, the outline is drawn; web sets ids on rendered headings, mobile records each heading's position when laid out. | device | ArtifactPreview.tsx:295-301; ArtifactFullScreen.tsx:1086-1088 |
| Selecting an entry scrolls the document. | device | ArtifactPreview.tsx:338; ArtifactFullScreen.tsx:1089-1096 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Outline entries | Not stored; derived from the document text each time. | No | Discarded when the view closes. |

**Models and providers.** No model or provider is involved; the outline is computed on the device from the text.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | Mobile caps at 60 sections (reportSections.ts:8). Web has no cap found. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device in Local mode; nothing leaves the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Fewer than 3 headings | No outline drawn. | ArtifactPreview.tsx:312; ArtifactDocumentOutline.tsx:24 |
| Duplicate heading text | Ids get a numeric suffix. | markdown-headings.ts:40-49 |
| Heading with only markup characters | Skipped. | markdown-headings.ts:41 |
| Heading position not yet laid out (mobile) | Tap does nothing. | ArtifactFullScreen.tsx:1090-1091 |
| Reduced motion | Web chevron rotation respects motion-reduce; mobile scroll is always animated. | ArtifactPreview.tsx:322; ArtifactFullScreen.tsx:1095 |
| Accessibility | Web nav labelled 'Document outline'; mobile buttons carry labels and an expanded state. | ArtifactPreview.tsx:327; ArtifactDocumentOutline.tsx:33-35 |
| Loading, error, offline | not handled in the code (no network is involved; the list is computed from text already on the device). | ArtifactPreview.tsx:293 computes headings with useMemo and no fetch |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/markdown-headings.test.ts`: Heading extraction (file exists; contents not opened).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.outline.test.tsx`: Closed Outline control lists headings, scroll to chosen heading, 44 point tap area, none for short document, ignores headings in code blocks (by test names).

**Test scenarios**

- **Threshold**
  1. Open a document with 2 headings
  2. Then one with 3
  - Expected: No outline for 2; outline with count 3 for 3.
- **Web jump**
  1. Open a long document
  2. Open Outline
  3. Click the last heading
  - Expected: The page scrolls to that heading.
- **Mobile jump**
  1. Open full screen
  2. Tap 'Outline · N'
  3. Tap a section
  - Expected: Scrolls to it.
- **Fence**
  1. Put '# not a heading' inside a code fence in a 3-heading document
  - Expected: It is not listed.
- **Deep levels**
  1. Add a level-5 heading
  - Expected: Not listed (current behaviour).

**Where to look when it fails**

- Web: element ids of the form 'artifact-<slug>' in the page.
- Mobile: testID artifact-document-outline and artifact-document-outline-list.
- No web test for the outline was found in the artifacts test folder.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Mobile: [70-qa/test-plans/mobile/027-document-and-writing-editor.md](../../70-qa/test-plans/mobile/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **Headings 5 and 6 are not listed.** Affects: Web and mobile. Evidence: markdown-headings.ts:17. Work needed: Raise the limit if wanted.
- **No web outline test found.** Affects: Web. Evidence: No match for the outline test id in apps/web test files.. Work needed: Add a web test.
- **Chrome has no outline.** Affects: Chrome. Evidence: No code in artifactPanel.ts. Work needed: Decide if required; implement using the shared extractor.
- **Brief status for mobile says missing but code exists.** Affects: Documentation. Evidence: Brief S27.12 vs ArtifactDocumentOutline.tsx. Work needed: Correct the brief.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- file:packages/ui/unified-chat/src/lib/markdown-headings.ts
- file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage

## Unknown

- Whether Desktop (hosted web) shows the outline in practice; not run.
- Whether Chrome offers any outline elsewhere in its large side_panel.ts.

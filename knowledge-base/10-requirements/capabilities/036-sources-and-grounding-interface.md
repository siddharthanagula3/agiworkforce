---
id: "REQ-AREA-036"
type: "requirements"
title: "Requirement items: Sources and grounding interface"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 36. Sources and grounding interface

25 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S36.01

**Citation marker.** Claims in an answer carry an inline citation marker that identifies the source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-01 Inline citation markers](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Competitor trace: CAP-search-01, CAP-research-16, CAP-research-17

## S36.02

**Source title.** Each cited source shows its title.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F036-02 Source card details](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Competitor trace: CAP-search-03, CAP-research-17

## S36.03

**Publisher or provider.** Each cited source shows its publisher or provider (site name/domain).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F036-02 Source card details](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Competitor trace: CAP-search-03, CAP-research-17

## S36.04

**Source URL or resource identifier.** Each cited source exposes its URL or resource identifier and can be opened.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F036-03 Source link and type icon](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Competitor trace: CAP-search-03, CAP-research-16, CAP-research-17

## S36.05

**Publication date.** Cited sources show their publication date when known.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-02 Source card details](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Competitor trace: CAP-search-24, CAP-research-17

## S36.06

**Retrieval date.** Cited sources show when they were retrieved/accessed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-02 Source card details](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Competitor trace: CAP-search-24, CAP-research-17

## S36.07

**Source-type icon.** Each source shows an icon for its type (web page, file, chat, connector...).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F036-03 Source link and type icon](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)

## S36.08

**Quoted supporting excerpt.** A cited source shows the quoted excerpt that supports the claim.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-02 Source card details](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Competitor trace: CAP-search-04, CAP-research-17

## S36.09

**Page-number locator.** Citations to paginated documents name the page and open the source at that page.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-04 Locators inside files and chats](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)

## S36.10

**Line-range locator.** Citations to text/code name a line range and open the source at those lines.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-05 Locators for lines, cells, slides and media](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)

## S36.11

**Spreadsheet-cell locator.** Citations to spreadsheets name the sheet/cell range.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-05 Locators for lines, cells, slides and media](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)

## S36.12

**Slide locator.** Citations to slide decks name the slide number.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-05 Locators for lines, cells, slides and media](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)

## S36.13

**Audio/video timestamp locator.** Citations to audio/video name a timestamp and open the media there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-05 Locators for lines, cells, slides and media](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)

## S36.14

**Message/thread locator.** Citations to earlier chats/messages link to the exact message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-04 Locators inside files and chats](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Competitor trace: CAP-search-25

## S36.15

**Highlighted passage in source viewer.** Opening a citation shows the source with the cited passage highlighted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F036-10 Source viewer highlight](../../20-features/036-sources-and-grounding-interface/F036-10-source-viewer-highlight.md)

## S36.16

**Claim-to-source relationship.** Each citation sits at the claim it supports so the user can tell which source backs which claim.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-01 Inline citation markers](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Competitor trace: CAP-search-01, CAP-research-17

## S36.17

**Multiple sources per claim.** A single claim can cite several sources and the user can see all of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-01 Inline citation markers](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Competitor trace: CAP-research-17

## S36.18

**Conflicting-source presentation.** When sources conflict, the answer presents the disagreement with each side's sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-06 Conflicting-source presentation](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Competitor trace: CAP-search-24, CAP-research-17, CAP-research-18

## S36.19

**Unavailable-source notice.** When a cited source cannot be opened or was not captured, the product says so instead of showing a dead link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-07 Unavailable, restricted and stale source notices](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Competitor trace: CAP-search-19, CAP-search-24, CAP-research-17, CAP-research-20

## S36.20

**Restricted-source notice.** When a cited source is restricted (no access/permission), the citation says so.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-07 Unavailable, restricted and stale source notices](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Competitor trace: CAP-search-24, CAP-research-17

## S36.21

**Stale-source notice.** When a cited source is old or may have changed, a stale-source notice is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-07 Unavailable, restricted and stale source notices](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Competitor trace: CAP-search-24, CAP-research-17

## S36.22

**Source correction.** The user can flag or correct a wrong citation and have the correction applied.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-08 Source correction and replacement](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Competitor trace: CAP-research-17

## S36.23

**Source replacement.** The user can replace a cited source with another and get the answer updated.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-08 Source correction and replacement](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Competitor trace: CAP-research-17

## S36.24

**User-controlled evidence set.** The user controls the set of evidence an answer may use (add, pin, remove sources) and the answer respects it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F036-09 User-controlled evidence set](../../20-features/036-sources-and-grounding-interface/F036-09-user-controlled-evidence-set.md)

## S36.25

**Citation-preserving export.** Exporting an answer/report keeps its citations and source list.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F036-11 Citation-preserving export](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Competitor trace: CAP-search-17, CAP-search-19, CAP-research-11

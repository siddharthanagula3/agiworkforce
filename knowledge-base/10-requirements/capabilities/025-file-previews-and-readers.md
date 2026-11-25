---
id: "REQ-AREA-025"
type: "requirements"
title: "Requirement items: File previews and readers"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 25. File previews and readers

31 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S25.01

**PDF reader.** A PDF opens in an in-product reader.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-01 Read a PDF and move through its pages](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.02

**Text-file reader.** Plain-text files open in a readable in-product view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome missing
- Feature: [F025-02 Read plain text, Markdown and source code](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.03

**Markdown reader.** Markdown files render formatted in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome missing
- Feature: [F025-02 Read plain text, Markdown and source code](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.04

**Source-code reader.** Source-code files open with syntax-aware display.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Feature: [F025-02 Read plain text, Markdown and source code](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.05

**Image viewer.** Images open in a viewer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F025-04 View an image](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.06

**Audio player.** Audio files play in an in-product player.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-05 Play audio and video, with transcripts and timestamps](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Competitor trace: CAP-files-and-attachments-09

## S25.07

**Video player.** Video files play in an in-product player.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F025-05 Play audio and video, with transcripts and timestamps](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.08

**Spreadsheet preview.** Spreadsheets preview as a table.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-03 Preview Office files and archives](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Competitor trace: CAP-files-and-attachments-08, CAP-files-and-attachments-23

## S25.09

**Presentation preview.** Presentations (pptx) preview in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-03 Preview Office files and archives](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.10

**Document preview.** Word-processing documents (docx) preview in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-03 Preview Office files and archives](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.11

**Archive-content preview.** Archive (zip) contents can be listed/previewed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-03 Preview Office files and archives](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.12

**Page thumbnails.** A document shows page thumbnails for navigation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-01 Read a PDF and move through its pages](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.13

**Page navigation.** Users can navigate pages of a multi-page document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-01 Read a PDF and move through its pages](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)

## S25.14

**Zoom controls.** Viewers offer zoom controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F025-06 Zoom and full-screen view](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.15

**Fit-to-width.** Viewers can fit content to width.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-01 Read a PDF and move through its pages](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)

## S25.16

**Fit-to-page.** Viewers can fit a page to the screen.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-01 Read a PDF and move through its pages](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)

## S25.17

**Rotate view.** Viewers can rotate the view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F025-01 Read a PDF and move through its pages](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)

## S25.18

**Search within file.** Users can search within an open file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-08 Search inside a file](../../20-features/025-file-previews-and-readers/F025-08-search-inside-a-file.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.19

**Highlight search matches.** Search matches are highlighted in the file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-08 Search inside a file](../../20-features/025-file-previews-and-readers/F025-08-search-inside-a-file.md)

## S25.20

**Select text for a question.** Users can select text in a file and ask a question about it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome missing
- Feature: [F025-09 Ask about a selected passage or the whole file](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Competitor trace: CAP-files-and-attachments-24

## S25.21

**Ask about selected page or range.** Users can ask about a selected page or range of a file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F025-09 Ask about a selected passage or the whole file](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Competitor trace: CAP-files-and-attachments-24

## S25.22

**Citation-linked highlighting.** Opening a citation highlights the cited passage in the file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-09 Ask about a selected passage or the whole file](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Competitor trace: CAP-files-and-attachments-24

## S25.23

**Transcript panel for audio/video.** Audio/video files show a transcript panel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-05 Play audio and video, with transcripts and timestamps](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Competitor trace: CAP-files-and-attachments-09

## S25.24

**Timestamp navigation.** Users can navigate audio/video by timestamp.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-05 Play audio and video, with transcripts and timestamps](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)

## S25.25

**Full-screen mode.** Viewers offer a full-screen mode.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F025-06 Zoom and full-screen view](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)

## S25.26

**Download original.** Users can download the original file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Seen in a real run: Web PASS
- Feature: [F025-07 Save, copy or open a file outside the viewer](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Competitor trace: CAP-files-and-attachments-23, CAP-files-and-attachments-25

## S25.27

**Download converted representation.** Users can download a converted representation of a file (e.g. PDF, text).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-07 Save, copy or open a file outside the viewer](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.28

**Copy selected content.** Users can copy selected content from a preview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, VS Code done
- Feature: [F025-07 Save, copy or open a file outside the viewer](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)

## S25.29

**Open in native application.** Users can open a file in its native application.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F025-07 Save, copy or open a file outside the viewer](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.30

**Unsupported-preview fallback.** When a file cannot be previewed, the product says so and offers download/open.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F025-10 Show a clear message when a file cannot be previewed or only partly loaded](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Competitor trace: CAP-files-and-attachments-23

## S25.31

**Partial-extraction warning.** When only part of a file could be extracted, the product warns the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F025-10 Show a clear message when a file cannot be previewed or only partly loaded](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Competitor trace: CAP-files-and-attachments-16

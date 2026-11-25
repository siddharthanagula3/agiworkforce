---
id: "REQ-AREA-027"
type: "requirements"
title: "Requirement items: Document and writing editor"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 27. Document and writing editor

41 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S27.01

**Document title.** A document shows its title in its card and viewer, falling back to a default when it has none.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F027-01 Document title](../../20-features/027-document-and-writing-editor/F027-01-document-title.md)

## S27.02

**Structured rich-text editor.** Documents open in a structured rich-text editor where formatting is edited visually (not as raw source).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-03 Rich text editing, find and word count](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.03

**Markdown editing mode.** The user can switch a document to a Markdown source mode, edit the text and save it back as a new version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F027-06 Markdown source, saving and undo](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.04

**Heading controls.** The editor offers controls to set heading levels on the current block.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-04 Text and block formatting](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)

## S27.05

**Paragraph formatting.** The editor offers paragraph formatting controls (alignment, spacing, indentation).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-04 Text and block formatting](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)

## S27.06

**Bold, italic, underline, and links.** The user can make text bold, italic or underlined and add links in a document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-04 Text and block formatting](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.07

**Lists and checklists.** The user can create bulleted, numbered and checklist items in a document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-04 Text and block formatting](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.08

**Tables.** The user can insert and edit tables in a document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-05 Tables and images](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.09

**Images.** The user can insert images into a document and see them rendered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-05 Tables and images](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)

## S27.10

**Callouts.** The user can add callout blocks (note, warning, tip) to a document and see them styled.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-04 Text and block formatting](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)

## S27.11

**Code and equation blocks.** The user can add code blocks and math equations to a document and see them rendered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-04 Text and block formatting](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)

## S27.12

**Outline panel.** A document view offers an outline of its headings that jumps to each section.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-02 Outline of headings](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.13

**Find and replace.** The editor can find text in a document and replace matches.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-03 Rich text editing, find and word count](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.14

**Word count.** The editor shows the document's word (or character) count.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-03 Rich text editing, find and word count](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.15

**Selection toolbar.** Selecting text in a document shows a toolbar of actions for that selection.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Competitor trace: CAP-artifacts-and-documents-04

## S27.16

**Rewrite selection.** The user can select text in a document and ask for that selection to be rewritten in place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Competitor trace: CAP-artifacts-and-documents-04

## S27.17

**Shorten selection.** The user can ask for a selected passage to be made shorter.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)

## S27.18

**Expand selection.** The user can ask for a selected passage to be expanded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)

## S27.19

**Change tone.** The user can change the tone of a selected passage (e.g. formal, friendly).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)

## S27.20

**Adjust audience.** The user can adapt a selected passage for a chosen audience or reading level.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)

## S27.21

**Translate selection.** The user can translate a selected passage into another language.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome done
- Feature: [F027-08 Selection actions](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)

## S27.22

**Suggest edits.** The assistant can propose edits to a document as suggestions instead of overwriting it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-09 Suggestions, tracked changes, comments and presence](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)

## S27.23

**Accept/reject suggestions.** The user can accept or reject each suggested edit individually.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-09 Suggestions, tracked changes, comments and presence](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)

## S27.24

**Tracked changes.** Edits to a document are recorded as tracked insertions/deletions that stay visible until resolved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-09 Suggestions, tracked changes, comments and presence](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)

## S27.25

**Comments and replies.** The user can leave comments on parts of a document and reply to them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F027-09 Suggestions, tracked changes, comments and presence](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Competitor trace: CAP-artifacts-and-documents-05

## S27.26

**Collaborative presence.** People viewing or editing the same document see each other's presence (avatars, cursors).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-09 Suggestions, tracked changes, comments and presence](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)

## S27.27

**Autosave indicator.** While editing, the document saves automatically and shows its save state (saving / saved).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-06 Markdown source, saving and undo](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.28

**Undo and redo.** Undo and redo work while editing a document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F027-06 Markdown source, saving and undo](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.29

**Revision history.** The user can browse a document's past revisions with their times and open or restore one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F027-07 Version history](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)

## S27.30

**Page-layout view.** The document can be shown in a page-layout view (page size, margins, page breaks).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-10 Page layout, print, templates, brand and citations](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.31

**Print view.** The document has a print view or print action producing a print-ready layout.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-10 Page layout, print, templates, brand and citations](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Competitor trace: CAP-artifacts-and-documents-06

## S27.32

**Template selection.** The user can start a document from a chosen template.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-10 Page layout, print, templates, brand and citations](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Competitor trace: CAP-artifacts-and-documents-22

## S27.33

**Brand/style application.** The user can apply a saved brand or house style (fonts, colours, voice) to a document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F027-10 Page layout, print, templates, brand and citations](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Competitor trace: CAP-artifacts-and-documents-22

## S27.34

**Citation management.** The user can add, edit and format citations and a bibliography in a document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome unverified
- Feature: [F027-10 Page layout, print, templates, brand and citations](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)

## S27.35

**Export to document formats.** A document can be exported to office document formats (e.g. Word/DOCX).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F027-11 Export and save out](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Competitor trace: CAP-artifacts-and-documents-07

## S27.36

**Export to PDF.** A document can be exported as a PDF.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F027-11 Export and save out](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Competitor trace: CAP-artifacts-and-documents-07

## S27.37

**Export to Markdown.** A document can be exported as a Markdown file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F027-11 Export and save out](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Competitor trace: CAP-artifacts-and-documents-07

## S27.38

**Save into a connected document service.** The user can save a document straight into a connected document service (e.g. Google Docs, Notion, Drive).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F027-11 Export and save out](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Competitor trace: CAP-artifacts-and-documents-20

## S27.39

**Email draft presentation.** An email the assistant drafts is presented as an email (subject, recipients, body) rather than plain text.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code missing, Chrome unverified
- Feature: [F027-12 Email drafts](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)

## S27.40

**Recipient, subject, and attachment fields.** An email draft has editable recipient, subject and attachment fields.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code missing, Chrome unverified
- Feature: [F027-12 Email drafts](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)

## S27.41

**Send-email review step.** Before an email is sent on the user's behalf, they review the final message (recipients, subject, body) and confirm.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code unverified
- Feature: [F027-12 Email drafts](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)

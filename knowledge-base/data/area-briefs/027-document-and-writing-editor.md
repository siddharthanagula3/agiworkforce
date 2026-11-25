# Area 27. Document and writing editor

41 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S27.01 Document title.
- Should: A document shows its title in its card and viewer, falling back to a default when it has none.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1243; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:297; apps/web/features/chat/stores/artifacts-store.ts:119; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:153; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:310; apps/mobile/src/features/chat/components/MessageBubble.tsx:341; apps/cli/src/cloud/artifacts.rs:518; apps/cli/src/lib.rs:1899

## S27.02 Structured rich-text editor.
- Should: Documents open in a structured rich-text editor where formatting is edited visually (not as raw source).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.03 Markdown editing mode.
- Should: The user can switch a document to a Markdown source mode, edit the text and save it back as a new version.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485

## S27.04 Heading controls.
- Should: The editor offers controls to set heading levels on the current block.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.05 Paragraph formatting.
- Should: The editor offers paragraph formatting controls (alignment, spacing, indentation).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.06 Bold, italic, underline, and links.
- Should: The user can make text bold, italic or underlined and add links in a document.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:262; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:674

## S27.07 Lists and checklists.
- Should: The user can create bulleted, numbered and checklist items in a document.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: packages/ui/unified-chat/src/components/markdown/taskList.ts:34; packages/ui/unified-chat/src/components/markdown/taskList.ts:40; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:344; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:405; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:728; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:738; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1315

## S27.08 Tables.
- Should: The user can insert and edit tables in a document.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:27; apps/web/lib/services/managed-office-file-service.ts:304

## S27.09 Images.
- Should: The user can insert images into a document and see them rendered.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:27

## S27.10 Callouts.
- Should: The user can add callout blocks (note, warning, tip) to a document and see them styled.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.11 Code and equation blocks.
- Should: The user can add code blocks and math equations to a document and see them rendered.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:28; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:470

## S27.12 Outline panel.
- Should: A document view offers an outline of its headings that jumps to each section.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:202; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:224

## S27.13 Find and replace.
- Should: The editor can find text in a document and replace matches.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.14 Word count.
- Should: The editor shows the document's word (or character) count.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.15 Selection toolbar.
- Should: Selecting text in a document shows a toolbar of actions for that selection.
- Status: web missing, desktop missing, mobile missing, vscode done
- Code: apps/extension-vscode/src/providers/codeActionProvider.ts:37

## S27.16 Rewrite selection.
- Should: The user can select text in a document and ask for that selection to be rewritten in place.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.17 Shorten selection.
- Should: The user can ask for a selected passage to be made shorter.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S27.18 Expand selection.
- Should: The user can ask for a selected passage to be expanded.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S27.19 Change tone.
- Should: The user can change the tone of a selected passage (e.g. formal, friendly).
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S27.20 Adjust audience.
- Should: The user can adapt a selected passage for a chosen audience or reading level.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S27.21 Translate selection.
- Should: The user can translate a selected passage into another language.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome done
- Code: apps/extension/src/side_panel.ts:14710; apps/extension/src/side_panel.ts:14725

## S27.22 Suggest edits.
- Should: The assistant can propose edits to a document as suggestions instead of overwriting it.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.23 Accept/reject suggestions.
- Should: The user can accept or reject each suggested edit individually.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.24 Tracked changes.
- Should: Edits to a document are recorded as tracked insertions/deletions that stay visible until resolved.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.25 Comments and replies.
- Should: The user can leave comments on parts of a document and reply to them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S27.26 Collaborative presence.
- Should: People viewing or editing the same document see each other's presence (avatars, cursors).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.27 Autosave indicator.
- Should: While editing, the document saves automatically and shows its save state (saving / saved).
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:658; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:669; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1605

## S27.28 Undo and redo.
- Should: Undo and redo work while editing a document.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485

## S27.29 Revision history.
- Should: The user can browse a document's past revisions with their times and open or restore one.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1563; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1965; apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:54; apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:134; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:658; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1000; apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:100; apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:111

## S27.30 Page-layout view.
- Should: The document can be shown in a page-layout view (page size, margins, page breaks).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.31 Print view.
- Should: The document has a print view or print action producing a print-ready layout.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.32 Template selection.
- Should: The user can start a document from a chosen template.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.33 Brand/style application.
- Should: The user can apply a saved brand or house style (fonts, colours, voice) to a document.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S27.34 Citation management.
- Should: The user can add, edit and format citations and a bibliography in a document.
- Status: chrome unverified

## S27.35 Export to document formats.
- Should: A document can be exported to office document formats (e.g. Word/DOCX).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1055; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1700; apps/mobile/src/features/chat/utils/artifactExport.ts:98; apps/mobile/services/docxExport.ts:160

## S27.36 Export to PDF.
- Should: A document can be exported as a PDF.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1055; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1700; apps/mobile/src/features/chat/utils/artifactExport.ts:96; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:562

## S27.37 Export to Markdown.
- Should: A document can be exported as a Markdown file.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1441; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745; apps/mobile/src/features/chat/utils/artifactExport.ts:92; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:562; apps/cli/src/lib.rs:1034; apps/cli/src/lib.rs:1944; apps/extension-vscode/package.json:593; apps/extension-vscode/src/features/artifacts/artifactActions.ts:138

## S27.38 Save into a connected document service.
- Should: The user can save a document straight into a connected document service (e.g. Google Docs, Notion, Drive).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S27.39 Email draft presentation.
- Should: An email the assistant drafts is presented as an email (subject, recipients, body) rather than plain text.
- Status: cli missing, vscode missing, chrome unverified

## S27.40 Recipient, subject, and attachment fields.
- Should: An email draft has editable recipient, subject and attachment fields.
- Status: cli missing, vscode missing, chrome unverified

## S27.41 Send-email review step.
- Should: Before an email is sent on the user's behalf, they review the final message (recipients, subject, body) and confirm.
- Status: cli done, vscode unverified
- Code: apps/cli/src/approval_details.rs:73; apps/cli/src/approval_details.rs:74; apps/cli/src/agent/tools.rs:128

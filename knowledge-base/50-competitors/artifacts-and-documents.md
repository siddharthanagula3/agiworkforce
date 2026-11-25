---
id: "COMP-artifacts-and-documents"
type: "competitor-trace"
title: "Generated artifacts and documents"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Generated artifacts and documents: competitors to requirements

Claude (artifacts, Docs, Sheets, Design, Data) and ChatGPT (Work files, Pages, Slides, Sites) both document rich generated outputs. AGI's web app has the broadest base: panel, preview, versions, exports, publishing, Sites. Gaps are real sheets with formulas, spreadsheet and slide editing depth, co-editing, Office add-ins, and non-web apps. Only the web Free and subscribed runs show anything working. Excel creation failed in every test. Local-mode behaviour is not documented.

**How the products divide this topic.** Claude (chat product, support.claude.com): artifacts are standalone outputs beside the chat. Templates are Docs, Slides, Design, Data, Sheets, Whiteboards and Motion, plus file creation through a sandbox. Claude Code (code.claude.com) is a separate tool. It can publish a private page to claude.ai, with the claude.ai sign-in needed. Those pages appear in the same gallery as chat artifacts (code.claude.com glossary, cc08:4). It is not available on API-key, Bedrock, Vertex or gateway sessions (cc01:187). ChatGPT (help.openai.com, learn.chatgpt.com): Work makes Office files, Pages and Slides live in Space, Sites hosts websites, and older canvas has been removed from newer models for chat (oh08:262). Codex is the separate coding tool; it can also build Sites (cl07:39 says ChatGPT or Codex). The artifacts viewer page (learn.chatgpt.com artifacts-viewer) covers the desktop app, Codex CLI and IDE. Plan limits vary: Claude Docs, Slides and Design are on all plans, Data, Sheets and Whiteboards need Pro or above, Motion is Team and Enterprise only (ch05:136). ChatGPT Sites is Plus and above, and public publishing needs Business or Enterprise. Review date for all competitor evidence: 2026-11-22. AGI evidence: QA comparison CSVs, area briefs 26-33 and 96, code. The area briefs and comparison CSVs disagree with the code in places (rename, selection edit, comments, deck editing and Google Docs save all exist in apps/web code but briefs mark them missing), so code is used as the higher source. Where I cite the briefs, they are code-reading output, not human observation.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-artifacts-and-documents-01](#cap-artifacts-and-documents-01) | Artifact side panel for standalone outputs | yes | partly | partly built | seen working by a person |
| [CAP-artifacts-and-documents-02](#cap-artifacts-and-documents-02) | Live preview with source toggle (HTML, React, SVG, Mermaid, Markdown) | yes | yes | partly built | seen working by a person |
| [CAP-artifacts-and-documents-03](#cap-artifacts-and-documents-03) | Artifact versions, restore and compare | partly | partly | partly built | seen failing by a person |
| [CAP-artifacts-and-documents-04](#cap-artifacts-and-documents-04) | Selection-based edit requests and edit-in-place | yes | yes | partly built | code inspected only |
| [CAP-artifacts-and-documents-05](#cap-artifacts-and-documents-05) | Comments and @mention edits on documents | yes | yes | partly built | code inspected only |
| [CAP-artifacts-and-documents-06](#cap-artifacts-and-documents-06) | Living documents (rich-text Docs and Pages) | yes | yes | partly built | code inspected only |
| [CAP-artifacts-and-documents-07](#cap-artifacts-and-documents-07) | Export documents and decks to Word, PDF, Markdown, PowerPoint | yes | yes | partly built | seen failing by a person |
| [CAP-artifacts-and-documents-08](#cap-artifacts-and-documents-08) | Create real Word, PowerPoint, Excel and PDF files from chat | yes | yes | partly built | seen failing by a person |
| [CAP-artifacts-and-documents-09](#cap-artifacts-and-documents-09) | Spreadsheet artifact edited together with the assistant | yes | partly | partly built | code inspected only |
| [CAP-artifacts-and-documents-10](#cap-artifacts-and-documents-10) | Slide decks: build, edit, present, export | yes | yes | partly built | code inspected only |
| [CAP-artifacts-and-documents-11](#cap-artifacts-and-documents-11) | Design canvas, design systems and brand import | yes | unknown | partly built | code inspected only |
| [CAP-artifacts-and-documents-12](#cap-artifacts-and-documents-12) | Whiteboard artifacts | yes | unknown | not built | not verified |
| [CAP-artifacts-and-documents-13](#cap-artifacts-and-documents-13) | Data dashboards with query provenance, refresh and certified queries | yes | partly | partly built | not verified |
| [CAP-artifacts-and-documents-14](#cap-artifacts-and-documents-14) | Motion artifacts (animated explainers exported as MP4) | yes | unknown | not built | not verified |
| [CAP-artifacts-and-documents-15](#cap-artifacts-and-documents-15) | Publish an artifact to a link and choose who can open it | yes | yes | partly built | not verified |
| [CAP-artifacts-and-documents-16](#cap-artifacts-and-documents-16) | Sites: build, host and manage websites and lightweight apps | partly | yes | partly built | not verified |
| [CAP-artifacts-and-documents-17](#cap-artifacts-and-documents-17) | Artifact storage and AI-powered artifacts | yes | partly | partly built | not verified |
| [CAP-artifacts-and-documents-18](#cap-artifacts-and-documents-18) | Live data from connected apps | yes | yes | partly built | not verified |
| [CAP-artifacts-and-documents-19](#cap-artifacts-and-documents-19) | Fix-with-assistant button on broken artifacts | yes | partly | partly built | code inspected only |
| [CAP-artifacts-and-documents-20](#cap-artifacts-and-documents-20) | Save to or co-edit with Google Docs, Sheets and Slides | yes | partly | partly built | code inspected only |
| [CAP-artifacts-and-documents-21](#cap-artifacts-and-documents-21) | Office add-ins (Word, Excel, PowerPoint) | yes | yes | not built | not verified |
| [CAP-artifacts-and-documents-22](#cap-artifacts-and-documents-22) | Templates, saved brand style and design systems for documents and decks | yes | yes | partly built | code inspected only |
| [CAP-artifacts-and-documents-23](#cap-artifacts-and-documents-23) | Artifact library, gallery and deletion safety | partly | yes | built | seen failing by a person |
| [CAP-artifacts-and-documents-24](#cap-artifacts-and-documents-24) | Coding tools that publish artifacts and documents | yes | partly | partly built | not verified |
| [CAP-artifacts-and-documents-25](#cap-artifacts-and-documents-25) | Canvas for writing and code in chat | unknown | partly | partly built | code inspected only |
| [CAP-artifacts-and-documents-26](#cap-artifacts-and-documents-26) | Plan limits and usage cost of generated files | yes | yes | unknown | seen failing by a person |
| [CAP-artifacts-and-documents-27](#cap-artifacts-and-documents-27) | Generated file deliverables from agent runs | yes | yes | partly built | seen failing by a person |

## CAP-artifacts-and-documents-01 Artifact side panel for standalone outputs

Self-contained results (documents, code, pages, diagrams, dashboards) open in a panel beside the chat instead of staying in the message stream.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Claude creates an artifact for self-contained content, typically 15+ lines, beside the chat (ch05:135). Plans: Free to Enterprise. Apps: web, desktop, iOS, Android.
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts tab in the sidebar lists and starts all artifacts (ch05:144). Apps: web, desktop.
- **ChatGPT: partly**
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Desktop app previews generated documents, slides, spreadsheets and PDFs beside the chat (cl01:117). Apps: desktop.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Canvas removed from newer models on 2026-05-28; writing and code appear as blocks in chat (oh08:262). Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 17 (Artifact UI must include side panel or equivalent) and docs/product/experience-contract.md (conversation split: transcript plus resizable artifact pane)). Every Cloud-chat app shows generated outputs in a card plus a viewer that is docked on wide screens and full-screen on phones, for any model the user picked.

**With different models, providers and the one subscription.** The panel must not depend on one provider's tool format; artifacts from any model or BYOK route render the same. Opening and viewing are not metered. Local mode shows artifacts made by the on-device model, with no sign-in.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop and Mobile done in code; CLI and VS Code list artifacts but have no card or docked panel; Chrome unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.01, S26.05, S26.08, S26.09, S26.10, S26.12, S26.13, S26.40
- Comparison list ids: CP48, MP38, WP91, XP5
- Code: `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:679`; `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:364`; `apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154`; `apps/web/app/chat/artifacts/page.tsx:8`

**Gap.** Mobile has no docked panel or tabs (by design on a phone). Sidebar destination is only partial on web. At 390 px wide the web panel header overlaps (version box over Download and Comments).

**Acceptance criteria**

1. Ask any model for a small HTML page; a card appears in the chat and clicking it opens the panel beside the chat.
2. Drag the panel edge; width changes and is kept after reload.
3. At 390 px wide the viewer opens full screen with no overlapping header controls.
4. In Local mode on the desktop or phone, an on-device reply that makes an artifact still shows a card and opens it.

**Verification: seen working by a person.** web scorecard W-8 (Free and subscribed): artifact rendered in the side panel, survived reload; W-8 problem: header controls overlap at 390 px wide. Other apps not seen.

## CAP-artifacts-and-documents-02 Live preview with source toggle (HTML, React, SVG, Mermaid, Markdown)

Generated code renders as a working page or diagram, and the user can flip to the source.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): HTML and React apps, markdown, mermaid and SVG artifacts still work, now generated via the computing environment (ch01:261). Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Generated .html files open as interactive previews with rendered and source views (cl01:118). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 17 (preview/source switch, error-fix loop)). Rendered and source views for every renderable artifact, with the preview sandboxed and an error panel when it fails.

**With different models, providers and the one subscription.** Rendering runs on the device in a sandbox, so it needs no subscription and works in Local mode. Any generated runtime calls to a model must go through the one subscription system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop done; Mobile HTML preview done, React preview missing; CLI and VS Code have no preview. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.14, S28.10, S28.11, S28.16, S28.18, S28.19, S96.12, S96.15
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/artifacts/artifact-render.ts:121`; `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx`

**Gap.** Responsive preview sizes, console panel, theme choice and dependency panel are missing. SVG preview crops a square and the preview stays light in dark mode (seen).

**Acceptance criteria**

1. Ask for an HTML page with two inputs and a sum; preview shows 36, and typing 20 shows 37.
2. Toggle to source; source matches what is shown.
3. Break the code on purpose; an error panel with a fix action appears instead of a blank panel.
4. View an SVG with a yellow square; the square is not cropped.

**Verification: seen working by a person.** web scorecard W-8 (partial): preview, edit to 20 giving 37, reload all worked. Defects seen: W-7 SVG crop; W-8 preview stays light in dark mode.

## CAP-artifacts-and-documents-03 Artifact versions, restore and compare

Each edit makes a new version; the user can step through versions, restore one, and sometimes see what changed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude, Claude Code: partly**
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Republish to the same URL; each publish is a version and the Share control picks which version viewers see (cc01:168). This is Claude Code. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
  - [https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets](https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets): Sheet version history shows earlier versions and restores one, discarding later edits (ch06:20). Plans: Pro and above. Apps: web, desktop.
  - [https://support.claude.com/en/articles/14604416-get-started-with-claude-design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design): Design: no version history yet (ch04:43). Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites): Sites: save a version before deploying; restoring restores code only, not the database (oh05:119). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Artifact lifecycle: preview, edit, compare, restore, share, export, revoke, reopen)). Every artifact keeps ordered versions, shows which one is open, lets the user restore an older one without losing the rest, and compares two versions.

**With different models, providers and the one subscription.** Versions are stored with the artifact, not the model, so switching model mid-artifact keeps history. Storage counts toward the plan's storage quota. Local mode keeps versions on the device only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile have selector, step and restore; compare is missing everywhere; CLI and VS Code only list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.20, S26.21, S26.22, S26.23, S28.29, S28.30, S96.02
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:12`; `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx`; `apps/mobile/src/features/artifacts/versionSummary.ts`

**Gap.** Compare view not in the briefs as built (ArtifactChangesView exists; its reach is not verified). A follow-up edit created a duplicate artifact with the same name and a stale v1 panel (seen).

**Acceptance criteria**

1. Edit an artifact twice; the selector shows 3 versions and arrows step between them.
2. Restore version 1; it becomes current and versions 2 and 3 remain.
3. A follow-up edit after Stop and Try again updates the same artifact, not a second one with the same name.
4. Open the compare view for two versions; changed text is marked.

**Verification: seen failing by a person.** web scorecard W-8 subscribed: follow-up edit produced a second 'Live Sum' artifact and showed v1/2 stale; free run produced v2 correctly.

## CAP-artifacts-and-documents-04 Selection-based edit requests and edit-in-place

The user highlights part of a document, page, sheet range, slide or design and asks for a change just there.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Highlight text in a doc or Markdown file, click Edit with Claude and describe the change; several requests batch (ch05:145). Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Point to part of a document, spreadsheet, slide, code, Markdown or site and request a targeted change (cl01:120). Desktop app. Apps: desktop.
  - [https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work](https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work): Select a claim, chart or slide and describe the change (oh05:91). Plans: Eligible paid plans. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Selecting part of any editable artifact and asking for a change edits only that part, with the model chosen by the user or Auto.

**With different models, providers and the one subscription.** The edit request is one metered model call under the subscription; the selection and diff logic is app-side, not tied to a provider. In Local mode the on-device model does the edit, and a small model may refuse large selections with a clear message.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web code has an Edit with AI toolbar and edit-request layer; briefs mark selection edit missing on every app, so briefs and code disagree. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.17, S26.19, S27.15, S27.16, S30.20, S96.06
- Comparison list ids: WP105
- Code: `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:22-24`; `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx`; `apps/web/features/chat/components/artifacts/artifact-selection-request.ts`

**Gap.** Reach on Desktop, Mobile, VS Code and Chrome unknown. Spreadsheet range questions and per-slide edits not found.

**Acceptance criteria**

1. Select one sentence in a document, choose Edit with AI, type 'shorter'; only that sentence changes.
2. Request two edits; both are sent as one batch.
3. After an edit, the version list gains one entry.
4. Repeat on Desktop and Mobile and note which app lacks it.

**Verification: code inspected only.** Web files above; no person has run selection edits (not in W-8/W-9 scorecards).

## CAP-artifacts-and-documents-05 Comments and @mention edits on documents

Users and the assistant leave comments on parts of a document; mentioning the assistant in a comment triggers an edit with an explanation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude, Claude Code: yes**
  - [https://support.claude.com/en/articles/16923645-get-started-with-claude-docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs): Mention @Claude in a comment to get an edit and explanation; Claude leaves its own comments (ch05:89). Plans: Free to Enterprise. Apps: web, desktop.
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Org viewers comment on a shared page; Send to Claude or @claude opens a thread Claude replies to (cc01:176). Claude Code. Plans: Team, Enterprise. Apps: web, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt): Select a passage to comment a change; a page chat handles document-wide changes (oh07:37). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity). Comments anchor to a place in an artifact and can trigger an assistant edit; comment text and authorship follow the workspace's privacy rules.

**With different models, providers and the one subscription.** The assistant reply to a comment is a metered call on the commenter's allowance, not the author's, and uses whichever model that user selected. Comments are Cloud-only; in Local mode only the owner can comment and nothing leaves the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a comments panel; briefs say inline comments missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.18, S27.25, S96.05
- Comparison list ids: WP101, WP108
- Code: `apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx`; `apps/web/features/chat/components/artifacts/comments/comment-request.ts`

**Gap.** Reach of @mention edits, and non-web apps, not verified.

**Acceptance criteria**

1. Add a comment on a selected phrase; the phrase is highlighted and the comment listed.
2. Mention the assistant in the comment; an edit and a short explanation appear.
3. A second user in the same workspace sees the comment; a user outside it does not.

**Verification: code inspected only.** comments/ArtifactComments.test.tsx exists; no human run recorded.

## CAP-artifacts-and-documents-06 Living documents (rich-text Docs and Pages)

A rich document the assistant drafts in front of you, with headings, tables, charts, autosave and keyboard shortcuts, edited by hand or by chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16923645-get-started-with-claude-docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs): Ask for a doc, Claude asks questions, drafts it and leaves comments; rich text with tables; nothing locks while Claude works; edits autosave (ch05:87, ch05:89). Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt): Pages are editable documents created from a Work or Codex conversation or Space; edit by hand or ask ChatGPT to revise a section (oh07:36). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.
  - [https://learn.chatgpt.com/docs/space/pages.md](https://learn.chatgpt.com/docs/space/pages.md): Blocks include headings, lists, tables, code, images; drag blocks; table width options (cl07:74, cl07:76). Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md (durable document deliverables)). A document artifact is edited as rich text, autosaves, can be started from chat or a template, and works with any model.

**With different models, providers and the one subscription.** Editing by hand costs nothing; each assistant revision is one metered call. In Local mode documents are stored on the device and edited with the local model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop have a formatting toolbar, tables, images, outline, autosave and undo; Mobile lacks them; briefs list find/replace, word count, callouts, page layout and print as missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S27.02, S27.03, S27.06, S27.07, S27.08, S27.12, S27.13, S27.14, S27.27, S27.28, S27.30, S27.31
- Comparison list ids: W115, W133, WP113, WP94
- Code: `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx`; `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx`; apps/web/features/chat/components/artifacts/SaveAnswerAsDocument.tsx (not found) (not found)

**Gap.** Mobile read-only; no slash menu, section collapse, table merge/sort, placeholders for unwritten sections.

**Acceptance criteria**

1. Ask for a one-page plan; it appears as an editable document with a save state.
2. Add a table and a link by hand; reload; both remain.
3. Undo a change; the previous text returns.
4. On Mobile the document opens and shows the same content.

**Verification: code inspected only.** Doc editor tests exist; W-9 saw a Word file but not the in-app editor.

## CAP-artifacts-and-documents-07 Export documents and decks to Word, PDF, Markdown, PowerPoint

The viewer offers a menu to save the artifact as an Office or PDF file.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Docs to Word, PDF, Markdown, Google Docs; decks to PowerPoint, PDF or Google Slides; designs to zip, PDF, PowerPoint, standalone HTML; animations MP4 (ch05:147). Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001605-creating-and-collaborating-on-slides-in-chatgpt](https://help.openai.com/en/articles/20001605-creating-and-collaborating-on-slides-in-chatgpt): Present from ChatGPT; export to .pptx, PDF or Google Slides on web (oh07:79). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Deep research reports download as Markdown, Word or PDF (oh01:81). Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 17 (Download/export) and docs/product/definition.md line 475 (Mobile is not the first heavy local PDF/PPTX/DOCX generation surface)). Every artifact type has an export menu with the formats that fit it; each format opens in the matching Office app without clipped content.

**With different models, providers and the one subscription.** Export is independent of the model. If export runs on our servers it is metered and needs sign-in; if it runs on the device it must work in Local mode. Each app must say which. Mobile may use a server export rather than local generation.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop and Mobile export DOCX, PDF, Markdown; deck to PPTX done, deck to PDF not in briefs; CLI and VS Code export Markdown only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S27.35, S27.36, S27.37, S29.34, S29.35, S29.36, S30.28, S30.29, S96.11
- Comparison list ids: WP104, WP106
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2399-2410`; `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts`; `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1655`

**Gap.** Export fidelity: seen duplicated title and a page footer without a number in a Word file; export to Google formats gated while connectors are unreleased. Two near-identical download entries.

**Acceptance criteria**

1. Export one document as Word, PDF and Markdown; each opens with the same headings and no clipped text.
2. Export a deck as PowerPoint and open it in PowerPoint or Keynote.
3. The export of an edited artifact contains the edit (typed value 20, not the original 19).
4. Run the same export in Local mode and see whether it works offline; the app states the answer on screen.

**Verification: seen failing by a person.** web scorecard W-9: Word and PowerPoint files real and correct; defects: Word title duplicated and footer 'Page' without number; W-8: exported file held original default 19, not typed 20.

## CAP-artifacts-and-documents-08 Create real Word, PowerPoint, Excel and PDF files from chat

The assistant builds an editable Office file or PDF, runs code in a sandbox to do it, and returns it as a downloadable file.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Claude runs code in a sandbox to build downloadable Excel, PowerPoint, Word and PDF files and charts, and can convert formats (ch01:254). Plans: All plans. Apps: web, desktop, iOS, Android.
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): File creation draws from plan limits and uses more than ordinary chat (ch01:259). Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work](https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work): Work builds editable files from instructions, sources or a reference file and can match an existing deck or layout (oh05:87). Plans: Eligible paid plans. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 17 (generated outputs: PDFs, spreadsheets, presentations) and docs/product/definition.md line 285 (capabilities include file creation)). On every app that offers chat, the user can ask for a Word, Excel, PowerPoint or PDF file and get a real file with working formulas, regardless of model.

**With different models, providers and the one subscription.** File creation is an AGI harness tool, not a model skill, so any model that can call tools may use it; models that cannot must say so rather than claim the tool is missing. It is metered under the subscription and is heavier than chat. Whether it can run on the device in Local mode is not decided; the app must say which side runs it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a create_office_file tool and a Word/Excel/PowerPoint output picker; Excel failed in every human test. Other apps not seen. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S96.07, S96.08, S96.09, S96.10
- Comparison list ids: WP83
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:239`; `apps/web/lib/chat-output-format.ts:11-15`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`

**Gap.** Excel creation fails (workbook recalculation error); a retry gets a false 'tool isn't available'; success only with typed values, not a SUM formula. PDF creation was not tested by a person.

**Acceptance criteria**

1. Ask for a Word file, an Excel file with a SUM total, and a deck in one chat; all three download and open.
2. The Excel total is a working formula: change a cell and the total changes.
3. If the tool truly fails, the message states the real cause and offers a retry that works, not a false 'unavailable'.
4. Check the usage meter after the request; file creation is counted.

**Verification: seen failing by a person.** web scorecard W-9 free partial, subscribed fail: Word and PowerPoint good; Excel failed four times; problems W-9 'Excel (.xlsx) file cannot be created', 'false tool isn't available'.

## CAP-artifacts-and-documents-09 Spreadsheet artifact edited together with the assistant

A real sheet (tabs, formulas, formats, charts) where the user and assistant edit the same cells.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets](https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets): Claude and users edit the same cells: tabs, cross-tab formulas, formatting, dropdowns, checkboxes; select a range and ask about it (ch06:17, ch06:19). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, iOS, Android.
  - [https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets](https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets): No pivot tables, protected ranges, shared filter views, multi-select dropdowns; at least 200,000 filled cells (ch06:24). Plans: Pro and above. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt): Sheets in Space are announced, coming soon (oh07:43). Apps: web, desktop.
  - [https://help.openai.com/en/articles/20001063-chatgpt-for-excel-and-google-sheets](https://help.openai.com/en/articles/20001063-chatgpt-for-excel-and-google-sheets): A separate add-in works inside Excel and Sheets (oh03:130). Plans: Free through Enterprise. Apps: other.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md (spreadsheet deliverables)). A spreadsheet artifact with a grid, formulas and charts that the user and assistant can both edit.

**With different models, providers and the one subscription.** Formula calculation must run in the app, not depend on the model. Assistant edits are metered calls. In Local mode a sheet can be edited by hand with no account; the on-device model may help if it can.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop have a data artifact with charts, CSV and workbook export; briefs show no grid cell editing, formula bar, import or range questions. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S29.05, S29.06, S29.17, S29.18, S29.19, S29.31, S29.32, S29.33, S29.34, S29.35
- Comparison list ids: W118, WP93, WP98
- Code: `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx`; `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx`

**Gap.** No confirmed cell editing with formulas, no range questions, no accept/reject of proposed range changes; Mobile partial; CLI and VS Code none.

**Acceptance criteria**

1. Open a sheet, type =SUM over two cells; the total updates when a cell changes.
2. Select a cell range and ask a question; the answer cites that range.
3. Import a CSV and an .xlsx; both open with their values.
4. Export to .xlsx and CSV; formulas survive in the .xlsx.

**Verification: code inspected only.** No scorecard covers the in-app sheet; W-9 only tested file creation.

## CAP-artifacts-and-documents-10 Slide decks: build, edit, present, export

The assistant makes a deck; the user edits text, charts and shapes, presents it, and exports.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14604416-get-started-with-claude-design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design): Presentations moved from Claude Design to Claude Slides, on-brand decks exported to PowerPoint or PDF (ch04:32 in claude-design admin guide, Team and Enterprise). Plans: Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Slides present in-app and export to PowerPoint/PDF; Docs, Slides and Design are on all plans (ch05:139, ch05:136). Plans: All. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): 2026-10-16: build decks from a chat, files or outline; edit text, shapes, charts; shared comments; present; export to PowerPoint (oh08:132). Plans: Pro, Business, Enterprise. Apps: web, desktop.
  - [https://learn.chatgpt.com/docs/space/getting-started.md](https://learn.chatgpt.com/docs/space/getting-started.md): On mobile you can generate slides and view decks; direct editing is web or desktop (cl07:70). Apps: iOS, Android.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md section 17.1 (slide deck and design export)). Decks are editable (text, charts, tables, shapes), can be presented, and export to PowerPoint and PDF.

**With different models, providers and the one subscription.** Deck editing and presenting run on the device; generating or rewriting a slide is a metered call on any model. Local mode: hand editing and presenting work offline; local-model generation quality is not promised.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a presentation workspace (themes, shapes, charts, text editor, PDF); briefs mark slide rail, reorder and presenter mode missing; Mobile exports PPTX. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S30.02, S30.07, S30.08, S30.10, S30.12, S30.22, S30.26, S30.27, S30.28, S30.29
- Comparison list ids: W134, WP106
- Code: `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx`; `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts`; `apps/web/features/chat/components/artifacts/presentation/DeckMenu.tsx`

**Gap.** No co-editing; presenter mode, reorder, per-slide regenerate, PDF/selected-slide export not confirmed.

**Acceptance criteria**

1. Generate a 5-slide deck; edit one title by hand; reload; the edit remains.
2. Export PPTX and PDF; slide count and text match.
3. Present full screen and step through slides with the keyboard.
4. Ask to rewrite slide 3 only; slides 1,2,4,5 are unchanged.

**Verification: code inspected only.** W-9 confirmed a generated .pptx opens with correct text (slide sparse); the in-app editor was not tested by a person.

## CAP-artifacts-and-documents-11 Design canvas, design systems and brand import

Prototypes, mockups and one-pagers on a canvas, with a saved design system (colours, fonts, components) applied to new designs and decks.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14604416-get-started-with-claude-design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design): Export zip, PDF, PPTX, Google Slides, standalone HTML; refine by chat, comments or canvas edits (ch04:35, ch04:38). Plans: Free to Enterprise. Apps: web, desktop, CLI.
  - [https://claude.com/product/design](https://claude.com/product/design): Import DOCX, PPTX, XLSX or codebase; admin can lock a team to one design system (cl08-pr01:148, :150). Plans: All plans / Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans](https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans): Standalone Claude Design closes 2026-12-14 and moves into Artifacts (ch05:115). Plans: Team, Enterprise. Apps: web.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 17.1 (Visual Artifact And Design Workspace; not Mobile v1 scope)). A visual design workspace with artboards, properties, export and a brand/design-system import, using AGI's own design language.

**With different models, providers and the one subscription.** Generation and variations are metered calls on any model; design-system extraction reads user files and must say which model and route saw them. Local mode: canvas editing works offline; extraction needs the chosen model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has design artifacts, colour contrast, import and zip/PDF/PPTX/HTML export in code; briefs list design workspace area 32 separately; no multi-design-system or 2-3 variations. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S96.28
- Comparison list ids: W121, W128, WP103, WP104, WP105, WP107
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2471`; `apps/web/features/chat/components/artifacts/design/`; `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx`

**Gap.** Missing: variations, several design systems with admin lock, design-system registry on the platform side. Area 32 brief was not read.

**Acceptance criteria**

1. Create a design from chat; edit one element's text on canvas; export a zip and PDF.
2. Import a brand kit; a new design uses its colours and fonts.
3. Pick a text colour with poor contrast; the picker warns.
4. Ask for variations; two or three are offered.

**Verification: code inspected only.** No scorecard covers design.

## CAP-artifacts-and-documents-12 Whiteboard artifacts

A shared board where the assistant draws shapes, arrows and flows from typed, spoken or sketched input.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18324319-get-started-with-claude-whiteboards](https://support.claude.com/en/articles/18324319-get-started-with-claude-whiteboards): Claude draws shapes, arrows, sections, diagrams from typed, spoken or sketched input; regroup, timeline, find gaps; convert to doc or deck; PNG export (ch06:27, ch06:30, ch06:32). Beta. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, iOS, Android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude only, beta)). Not decided whether AGI needs a whiteboard artifact.

**With different models, providers and the one subscription.** If built, it follows the same artifact rules: any model, metered assistant actions, local drawing free offline.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web code mentions a whiteboard type but comparison marks it missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M55, W136
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:202`

**Gap.** Feature absent. Depends on an owner decision.

**Acceptance criteria**

1. If chosen: ask for a flow of 5 steps; shapes and arrows appear and can be dragged.
2. If chosen: convert the board to a document.

**Verification: not verified.** No evidence.

## CAP-artifacts-and-documents-13 Data dashboards with query provenance, refresh and certified queries

Dashboards built from a warehouse or apps, where each chart shows its query and last refresh, can be refreshed and versioned.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17454700-get-started-with-claude-data](https://support.claude.com/en/articles/17454700-get-started-with-claude-data): Each chart shows its query and last refresh; version history with Restore; certified queries (beta) reusable across dashboards (ch05:140, ch05:195, ch05:196). Plans: Pro and above. Apps: web, desktop.
- **ChatGPT, Codex: partly**
  - [https://help.openai.com/en/articles/20001518-using-the-data-plugin-in-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001518-using-the-data-plugin-in-chatgpt-work-and-codex): Publish a generated dashboard to chosen workspace people with Sites and keep it refreshed with cloud automation; data is copied into the site (oh06:92). Apps: desktop, web.

**AGI requirement** (inferred; source: competitor parity). Dashboards show the source and time of every number and can be refreshed on request.

**With different models, providers and the one subscription.** Data connectors and refresh need sign-in and servers; the page must say so. Refresh is metered by connector calls and any model summary. Not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a live-artifacts route and connector catalog entries; refresh and certified queries not built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.33, S26.34, S96.18
- Comparison list ids: W119, WP102, WP97
- Code: `apps/web/lib/connectors/catalog.ts:235-237`; `apps/web/app/chat/live-artifacts`

**Gap.** No connected-data status or refresh control; connectors are gated as unreleased in artifact save paths.

**Acceptance criteria**

1. Open a dashboard; each chart shows its source query and refresh time.
2. Press refresh; the time changes and numbers update.
3. Without a connection, the artifact says which source is disconnected rather than showing blanks.

**Verification: not verified.** No human run; connectors unreleased per ArtifactPreview.connectorsUnreleased.test.tsx.

## CAP-artifacts-and-documents-14 Motion artifacts (animated explainers exported as MP4)

Prompt-built code-based animations with targeted edits and MP4 export.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17454997-get-started-with-claude-motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion): Animated explainers made as code, no video model; edit by chat or editor (ch05:198). Beta. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude only, beta, Team and Enterprise)). Not decided whether AGI needs animated explainers.

**With different models, providers and the one subscription.** If built, rendering MP4 is heavy; it must declare device versus server rendering and be metered.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web; no other app has it. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W124
- Code: `comparison-web.csv W124 'searched: mp4, motion'` (not found)

**Gap.** Absent. Depends on owner decision.

**Acceptance criteria**

1. If chosen: ask for a 10-second animated chart; preview plays; MP4 downloads and plays.

**Verification: not verified.** No evidence.

## CAP-artifacts-and-documents-15 Publish an artifact to a link and choose who can open it

A private artifact can be shared by link, inside the organisation or publicly, with the owner choosing the version viewers see.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude, Claude Code: yes**
  - [https://claude.com/product/design](https://claude.com/product/design): Every artifact gets a link private until shared (cl08-pr01:151). Plans: All plans. Apps: web.
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Claude Code publishes a file as a private page, shareable by public link or inside a Team or Enterprise org; public sharing needs an Owner to enable (cc21:49 and cc01:163). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, desktop.
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Free, Pro and Max users can generate embed code for shared artifacts (ch01:319). Plans: Free, Pro, Max. Apps: web.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/sites.md](https://learn.chatgpt.com/docs/sites.md): Sites can be built, hosted and shared from ChatGPT or Codex (cl07:39). Plans: Plus, Pro, Business, Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 17 (share/publish controls where allowed) and section 9.5 (share/publish state)). Publish creates a link that is private by default, shows its public/private state everywhere, can be unpublished, and shows the owner's choice of who can open it.

**With different models, providers and the one subscription.** Publishing needs our servers and sign-in, so it is Cloud-only; Local-mode work must not be published without an explicit consent step that names what leaves the device. Hosting and viewer limits are plan entitlements from the subscription system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile publish; CLI publishes; VS Code browses cloud artifacts but cannot publish; Chrome partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.31, S26.32, S28.27, S33.10, S33.12, S33.24, S96.20, S96.23, S96.26
- Comparison list ids: CP48, V27, XP5
- Code: `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:115`; `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:144`; `apps/desktop/src/features/artifacts/publishAdapter.ts`; `apps/cli/src/cloud/artifacts.rs:1`

**Gap.** VS Code cannot publish; named-viewer access, custom domains, analytics missing; no human check of the publish flow.

**Acceptance criteria**

1. Publish an artifact; the link opens in a signed-out browser only when set to public.
2. A private artifact shows 'Private' on its card; after publishing it shows the new state.
3. Unpublish; the old link stops working.
4. A Local-mode artifact asks consent before publishing.

**Verification: not verified.** No scorecard covers publishing; unit tests ArtifactPreview.publish.test.tsx and ArtifactsPanel.publish.test.tsx exist.

## CAP-artifacts-and-documents-16 Sites: build, host and manage websites and lightweight apps

The assistant builds a website or small app, hosts it at a URL, and lets the owner save versions, edit, change the URL and set access.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts can hold persistent personal or shared storage, 100 MB and 25,000 records by default (ch05:152). No hosted-site product is documented in the catalogue. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/sites.md](https://learn.chatgpt.com/docs/sites.md): Describe a site or host an existing app; database up to 10 GB per site; no PHI or impersonation (cl07:39, cl07:41). Plans: Plus, Pro, Business, Enterprise. Apps: web.
  - [https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites): Save a version before deploy; Edit site from the published page; restoring restores code only (oh05:119). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.
  - [https://learn.chatgpt.com/docs/sites/creating-a-site.md](https://learn.chatgpt.com/docs/sites/creating-a-site.md): Remix opens a composer with a coworker's site attached (cl07:44). Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity (ChatGPT); docs/product/definition.md (site deliverables)). A Sites feature with prompt creation, preview, deploy, URL change, version save and restore, remix, and usage limits as plan entitlements.

**With different models, providers and the one subscription.** Hosting always needs our servers; the site count, storage and viewer limits come from the subscription catalog, not hard-coded. Models only generate the site code. Not in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a Sites area with data tab, settings, URL change and fork; Desktop done; Mobile builds and shares; CLI lists and unpublishes; analytics, schedules, tunnels and bypass token missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S33.01, S33.04, S33.07, S33.10, S33.14, S33.19, S33.23, S33.25, S33.26, S33.27, S33.30
- Comparison list ids: W129, W130, W131, W132, WP110, WP111, WP112, WP95
- Code: `apps/web/features/sites/components/SiteSettingsTab.tsx:319-360`; `apps/web/features/sites/components/SiteSettingsTab.tsx:405`; `packages/contracts/cloud-contracts/src/artifact-runtime.ts:11`

**Gap.** Missing: usage analytics, recurring refresh, private tunnels, bypass token, custom domain, logs, build status. No human run.

**Acceptance criteria**

1. Describe a tracker site; a preview appears; deploy gives a URL that opens.
2. Save a version without deploying; the live URL is unchanged.
3. Restore an older version; the page reverts and the note says data is not restored.
4. Change the hosted URL; the old address redirects.
5. Hit the plan's site limit; the app shows an Upgrade prompt, not a raw error.

**Verification: not verified.** No scorecard covers Sites.

## CAP-artifacts-and-documents-17 Artifact storage and AI-powered artifacts

Artifacts keep data between visits and can call the assistant themselves, charged to the viewer's own account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): AI-powered artifacts: users sign in with their Claude account and usage counts against their own plan, no API keys (ch05:150). Personal or shared storage, 100 MB default (ch05:152). Plans: Pro and above for storage. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://learn.chatgpt.com/docs/sites/data-and-connections.md](https://learn.chatgpt.com/docs/sites/data-and-connections.md): Sites use D1 and R2 storage and optional Sign in with ChatGPT (cl07:47, cl07:48). Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity). Generated apps can store data and call a model through a brokered route so the viewer's own subscription, not the creator's, pays.

**With different models, providers and the one subscription.** Calls pass through the one subscription system with the viewer's quota. The generated app never holds a provider key. A viewer on Local mode or Free sees what is allowed. Storage size is a plan entitlement.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a runtime contract and an artifact-ai client; briefs mark Desktop and Mobile missing; comparison marks AI-powered artifacts missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S28.22, S28.23, S33.20, S96.17, S96.24
- Comparison list ids: W117, WP96
- Code: `packages/contracts/cloud-contracts/src/artifact-runtime.ts:11`; `apps/web/lib/artifact-ai.ts:3`; `apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts`

**Gap.** Briefs and comparison disagree with each other; app-level metering missing.

**Acceptance criteria**

1. An artifact that saves a note keeps it after reload.
2. An artifact that calls the assistant uses the viewer's quota, not the owner's.
3. At quota, the artifact shows the Upgrade message.

**Verification: not verified.** No human run.

## CAP-artifacts-and-documents-18 Live data from connected apps

Pages and documents read data from connected accounts on each view, using the viewer's own permissions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Pages call claude.ai MCP connectors on each view with the viewer's own account and a permission ask; not local MCP servers (cc01:178). Claude Code only. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console](https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console): Sites can use each visitor's connected apps after Sign in with ChatGPT; admins enable per plugin (oh02:208). Plans: Business, Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Where a page reads connected data, it shows which sources it uses and reads them with the viewer's rights.

**With different models, providers and the one subscription.** Connector calls need sign-in and servers (Cloud only). A Local-mode artifact must never read Cloud connectors silently; it needs an explicit consent step.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a live-artifacts route; CLI missing; connected-data status and refresh missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.33, S26.34, S28.32, S96.19
- Comparison list ids: C82, WP97
- Code: `apps/web/app/chat/live-artifacts`; `apps/web/lib/connectors/catalog.ts:235-237`

**Gap.** Viewer-bound authentication bridge missing; connectors gated.

**Acceptance criteria**

1. A page with connector data lists its sources; a viewer without the connector sees a connect prompt.
2. Viewer sees only data their own account may read.

**Verification: not verified.** No human run.

## CAP-artifacts-and-documents-19 Fix-with-assistant button on broken artifacts

When an artifact fails, a button sends the error to the assistant to repair.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Try fixing with Claude copies error details into a new message (ch05:149). Apps: web, desktop.
- **ChatGPT: partly**
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): LaTeX: a failed compile keeps the last good PDF and your edits (cl01:119). No general fix button shown. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 9.5 and 17 (error-fix loop)). A failed render shows the error and a one-press fix that sends it to the assistant.

**With different models, providers and the one subscription.** The fix is one ordinary metered turn on the current model. The error panel itself needs no account.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Runtime error overlay done on Web, Desktop and Mobile; the comparison says the fix button is missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.35, S26.36, S28.16
- Comparison list ids: W122
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3222`

**Gap.** Fix button not confirmed.

**Acceptance criteria**

1. Break an artifact; an error panel with a Fix button appears.
2. Pressing Fix sends the error text and the artifact is repaired in a new version.

**Verification: code inspected only.** Code lines above only.

## CAP-artifacts-and-documents-20 Save to or co-edit with Google Docs, Sheets and Slides

Generated files are saved to Drive, and Google files are edited live beside the chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Separate connectors let Claude and the user edit the same Google file in a pane; save Claude-generated files to Drive (ch01:29, ch01:26). No Slides charts (ch01:33). Plans: All plans. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): 2026-08-13: Drive in Library; keep Docs, Sheets, Slides open beside chat (oh08:204). Plans: Plus, Pro, Business, Enterprise. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Not decided whether AGI must edit Google files live; saving generated files to a connected drive is a lower bar.

**With different models, providers and the one subscription.** Connector use needs sign-in and servers and follows each plan's connector rules. Not Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a Save to Google Docs code path, hidden while connectors are unreleased. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S27.38
- Comparison list ids: W112, W123
- Code: `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1512-1531`; `apps/web/features/chat/components/artifacts/ArtifactPreview.connectorsUnreleased.test.tsx:20`

**Gap.** Hidden by the connector release switch; no live pane.

**Acceptance criteria**

1. With connectors released, 'Save to Google Docs' creates the file and shows its link.
2. With connectors unreleased, no dead save entry appears.

**Verification: code inspected only.** Test asserts entries are hidden today.

## CAP-artifacts-and-documents-21 Office add-ins (Word, Excel, PowerPoint)

A sidebar inside Microsoft Office where the assistant drafts and edits the open file.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Claude for Excel and PowerPoint add-ins share conversation context; PowerPoint add-in launched (ch01:303, ch01:311). Plans: Max, Team, Enterprise / paid. Apps: desktop.
  - [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude): Skills apply in Excel, PowerPoint, Word and Outlook add-ins (ch02:58). Plans: Free to Enterprise. Apps: other.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001526-chatgpt-for-word](https://help.openai.com/en/articles/20001526-chatgpt-for-word): Word sidebar drafts, summarizes, revises; Word usage metered in tokens at API rates from a shared allowance (oh06:104, oh06:106). Plans: Free to Enterprise. Apps: other.
  - [https://help.openai.com/en/articles/20001242-chatgpt-for-powerpoint](https://help.openai.com/en/articles/20001242-chatgpt-for-powerpoint): PowerPoint add-in drafts decks and revises slides; Free and Go get limited usage (oh04:117, oh04:119). Plans: Free to Enterprise. Apps: desktop, other.

**AGI requirement** (proposed; source: competitor parity). Not decided whether AGI ships Office add-ins.

**With different models, providers and the one subscription.** If built, add-ins use the same subscription meter and let the user pick the model; file text goes to the chosen provider and the add-in must say so.

**Current implementation, as this trace read it on 2026-11-24: not built.** No add-in found in the comparison. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `No code searched beyond the comparison CSVs` (not found)

**Gap.** Absent. Code was not searched for add-ins, so this is not fully confirmed.

**Acceptance criteria**

1. If chosen: open Word, run the add-in, select a paragraph and revise it; usage appears in the AGI meter.

**Verification: not verified.** No evidence.

## CAP-artifacts-and-documents-22 Templates, saved brand style and design systems for documents and decks

Start from a template or apply a saved house style to new documents, decks and designs.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans](https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans): Admins enable each template; new decks and designs inherit a saved design system (ch05:112, ch05:143). Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work](https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work): @Template-Creator makes a reusable template from a .docx, .xlsx, .pptx or Google file (oh05:88). Plans: Eligible paid plans. Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity). Users can start from a template and save their own; teams can apply one brand style.

**With different models, providers and the one subscription.** Templates are data, the same on any model. Team libraries need sign-in; personal templates work in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has artifact templates and save-as-template; briefs mark template selection missing; admin template switches missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S27.32, S27.33, S30.32, S96.27
- Comparison list ids: M54, MP41, W116
- Code: `apps/web/features/chat/components/artifacts/templates/`; `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2433`; `packages/contracts/types/src/enterprise/workspace-controls.ts:38-52`

**Gap.** No admin per-template switch; Mobile has no template gallery.

**Acceptance criteria**

1. Start a document from a template and see its structure.
2. Save a deck as a template and start a new deck from it.
3. Admin turns a template off; members no longer see it.

**Verification: code inspected only.** No human run.

## CAP-artifacts-and-documents-23 Artifact library, gallery and deletion safety

One place lists everything generated; deletion goes to a recoverable bin.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts tab lists and organises artifacts across conversations (ch05:144). Apps: web, desktop.
  - [https://support.claude.com/en/articles/16923645-get-started-with-claude-docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs): Deleting a doc has no trash and removes access for everyone shared (ch05:94). Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/chatgpt-space.md](https://learn.chatgpt.com/docs/enterprise/chatgpt-space.md): Deleted pages or Spaces go to Trash (cl03:74). Plans: Enterprise. Apps: web, desktop.
  - [https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt): Space replaces Library for accounts with access (oh07:14). Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (agent never destroys user data; Trash first) and docs/product/requirements.md section 17). All generated outputs are in one library; deleting one moves it to Recently deleted and names what is lost; permanent removal is an explicit user action.

**With different models, providers and the one subscription.** Storage counts against the plan's storage quota. Local mode keeps its own library on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Web library and Recently deleted (30 days) built; Mobile has an artifacts tab; zip of all chat artifacts on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.26, S26.38
- Comparison list ids: MP38, MP40
- Code: `packages/ui/unified-chat/src/components/library/LibraryView.tsx:736`; `packages/ui/unified-chat/src/components/library/LibraryView.tsx:1035`; `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:745`

**Gap.** Observed: the 'Where your artifacts are saved' card pushes the preview below the fold and files show an UNKNOWN badge.

**Acceptance criteria**

1. Delete an artifact; it appears in Recently deleted and can be restored.
2. The delete confirmation names the retention window.
3. The library lists artifacts from several chats and opens the originating chat.

**Verification: seen failing by a person.** web problems W-9 and W-15: UNKNOWN badge, notice pushes preview down.

## CAP-artifacts-and-documents-24 Coding tools that publish artifacts and documents

The coding tools (Claude Code, Codex) publish pages or Sites from a session and keep them updated.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Claude Code publishes a live page to a private claude.ai URL that updates in place; permission prompts, /artifacts list, Ctrl+] to reopen (cc01:163, cc01:165, cc01:167, cc01:170). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, desktop.
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Not available on Bedrock, Vertex, Foundry, API key or gateway sessions; page is one static file, 16 MiB max (cc01:187, cc01:186). Apps: cli, desktop.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/sites.md](https://learn.chatgpt.com/docs/sites.md): Sites can be built from ChatGPT or Codex (cl07:39). Plans: Plus, Pro, Business, Enterprise. Apps: web.
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Codex CLI has no preview or annotations; IDE opens documents in compatible viewers (cl01:123). Apps: cli, ide.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md section 17). The CLI and VS Code extension can publish a page or file as an artifact and reopen it, working with any model including BYOK.

**With different models, providers and the one subscription.** AGI must not copy the competitor limit of 'no API-key or gateway sessions': publishing is gated by our account and entitlement, not by which provider the model came from. Local-mode sessions need consent before any publish.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has /artifacts and publish; VS Code can browse and save cloud artifacts but cannot publish. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.02, S26.05, S28.24, S28.27
- Comparison list ids: C82, C83, C84, C85, C86, CP48, CP49, V27
- Code: `apps/cli/src/cloud/artifacts.rs:1`; `apps/extension-vscode/src/features/artifacts/artifactsTree.ts:42`

**Gap.** CLI: no reopen key, no permission prompts, no live connector pages, no docs or design commands. VS Code: no publish.

**Acceptance criteria**

1. From the CLI, publish a page; the URL opens and the artifact appears in the web gallery.
2. VS Code lists the same artifact and opens it.
3. Publish while on a BYOK model; it works or says plainly why not.

**Verification: not verified.** Code reading only.

## CAP-artifacts-and-documents-25 Canvas for writing and code in chat

A side editor where the model opens a document or code file, edits it and can run Python.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Canvas: import from chat, run Python, in GPTs (oh08:372); removed from newer models on 2026-05-28, paid users keep it through legacy models until they are retired (oh08:262, oh10:8). Plans: Free, Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only, being retired)). AGI offers the same document/code panel already covered by artifacts; Python execution in a document is an open choice.

**With different models, providers and the one subscription.** Code execution is an AGI sandbox tool, not a model feature. If offered it is metered and shows where it runs.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop have code editing in artifacts; no run in a document. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S28.01, S28.05, S28.06
- Comparison list ids: W126, WP109
- Code: `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`

**Gap.** No Python run in a canvas; language-aware editing missing on web and desktop.

**Acceptance criteria**

1. Open a code artifact; edit and save; a new version appears.
2. If run is offered, output shows below the code and says where it ran.

**Verification: code inspected only.** No human run.

## CAP-artifacts-and-documents-26 Plan limits and usage cost of generated files

File and artifact creation consumes plan usage; some types are gated by plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): File creation draws from the plan limits and uses more than ordinary chat (ch01:259). Apps: web, desktop.
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Docs, Slides, Design on all plans; Data, Sheets, Whiteboards Pro and above; Motion Team and Enterprise (ch05:136). Plans: varies. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001526-chatgpt-for-word](https://help.openai.com/en/articles/20001526-chatgpt-for-word): Word add-in usage is metered in tokens at API rates from a shared allowance (oh06:106). Plans: Free, Plus, Pro, Business, Enterprise. Apps: other.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Sites: fixed site-count cap removed 2026-10-15; usage and storage limits still apply (oh08:136). Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md (one subscription system) and owner decision recorded in project memory: Free usage screens show only Upgrade). Every generated-file action counts under the one subscription system and the Free plan shows only an Upgrade prompt, never meters.

**With different models, providers and the one subscription.** Costs, limits and gates come from the subscription catalog on every app. BYOK users are not charged by AGI for model cost but still follow storage and publish limits. Local mode on-device generation is free.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Per-artifact usage not built; Free-plan messages for Work (W-15) not shown; plan gating of artifact types not found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.37, S33.19, S96.24
- Comparison list ids: WP84
- Code: `packages/contracts/types/src/billing-catalog.ts:544`

**Gap.** Free account in W-15 got a plain chat with no message that Work is unavailable.

**Acceptance criteria**

1. On Free, ask for a gated type; the app shows an Upgrade prompt, not a meter.
2. On a paid plan, creating a file lowers the allowance and the meter changes.
3. The same limit applies on Web and Mobile.

**Verification: seen failing by a person.** web scorecard W-15 free: Work not available, and the app never says so.

## CAP-artifacts-and-documents-27 Generated file deliverables from agent runs

A longer task finishes with a file deliverable the user can open, download and review in a files panel.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Claude returns editable documents, spreadsheets with working formulas and PowerPoint decks (ch05:40). Plans: Paid plans. Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Chat sidebar shows plan, sources, generated files and summary; create and download files in Work on web (cl01:121, cl01:122). Apps: desktop, web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Work exposes durable document, spreadsheet, presentation, report and site deliverables)). Work output becomes durable document, spreadsheet, presentation, report or site deliverables the user can download.

**With different models, providers and the one subscription.** Deliverables are stored as account files (Cloud); local-only work stays on the computer. Metered as agent work.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has an outputs panel and Work mode; Desktop has the same sidebar equivalent. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: W-15 in scorecard
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:7525`

**Gap.** Free-plan summary card had no download; reload of a finished Work task showed duplicate rows and a re-armed Start button.

**Acceptance criteria**

1. A finished Work task shows a downloadable file card that actually downloads.
2. After reload the completed task view has no duplicated rows or live Start button.

**Verification: seen failing by a person.** web scorecard W-15 free and subscribed partial; problem 'Dispatch summary card is not downloadable'.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match Claude-only artifact types: Whiteboards, Motion (MP4) and certified-query dashboards.
- Whether to match ChatGPT-only features: Space shared pages with live collaboration, prompt blocks in pages, Sites tunnels, bypass tokens and recurring Site refresh.
- Whether to ship Office add-ins (Word, Excel, PowerPoint) and Google Workspace live co-editing.
- Whether Office file creation and PDF export may run on the device in Local mode, or must use our servers, and how each app states that.
- Whether a Local-mode artifact can be published, and what consent text names what leaves the device.
- Whether publishing and AI-powered artifacts work for BYOK and gateway sessions (Claude Code blocks them on API-key sessions).
- Which artifact types and storage sizes each plan (Free, Premium, Max, Ultra) gets; the competitor plan tables are not a decision.
- Whether to keep two near-identical Download entries and a separate Design area 32 workspace.
- Whether to offer Python execution inside a document or code artifact.

## Could not establish

- Whether ChatGPT has any whiteboard, motion or general design-canvas artifact; the catalogue shows none, so has is unknown.
- Whether Claude has a separate chat canvas and Python in documents; the catalogue shows none.
- Where AGI's Office-file tool runs for Desktop, Mobile and Local mode; only the web tool definition was read.
- Whether the briefs or the code are right about selection edit, comments, rename and deck editing; briefs say missing, code files exist, no human run.
- Any person check of artifacts on Desktop, Mobile, CLI, VS Code or Chrome; only the web scorecard rows W-8, W-9 and W-15 were read.
- Area briefs 32 (design) and 24-25 (library, previews) were not read in detail.
- Plan and region rollout for Slides and Space is stated as 'rolling out' by ChatGPT; exact dates by account are unknown.
- The saved Anthropic and OpenAI pages were not opened beyond the catalogue lines, so detail not shown there (limits, error cases) is unknown.
- No ledger live result was read beyond the web scorecards; none was searched for.

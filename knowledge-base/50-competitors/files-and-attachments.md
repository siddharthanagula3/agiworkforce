---
id: "COMP-files-and-attachments"
type: "competitor-trace"
title: "Files and attachments"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Files and attachments: competitors to requirements

Both leaders take mixed files and images, show per-plan limits, keep a saved-files library and read PDFs, sheets and Office files. AGI already matches most of the web basics: 20 files per message, 500 MiB on paid plans, a Library with storage meter and trash. Gaps: audio and video attach, cloud drives in chat, Library folders and batch actions, mobile limits, preview depth, and Local-mode rules. One browser run saw attach working and project file upload failing.

**How the products divide this topic.** Review date for all competitor evidence: 2026-11-22, catalogue only. Claude (support.claude.com) documents chat uploads, project files, Drive and GitHub knowledge, file creation, Sheets, Cowork local files and Claude in Chrome. Claude Code (code.claude.com and its support FAQ) is a separate coding tool: @path references, Ctrl+V image paste, browser file upload limited to 10 MB, and a Projects page with folder uploads. Its Remote Control saves phone attachments under ~/.claude/uploads, which is where the coding tool meets the chat apps. ChatGPT (help.openai.com, chatgpt.com/pricing, learn.chatgpt.com use-chatgpt page) documents uploads, Images, Library, Projects, data analysis and per-plan limits. Codex (other learn.chatgpt.com pages) is the separate coding tool: -i image flags, Shift-drag images, and non-image attachments. Plan limits matter: ChatGPT limits differ for Free, Go, Plus, Pro and Business, Library is replacing by Space for some accounts, audio upload is paid only, and Claude project files are capped at 30 MB each. Image generation, Slides and Docs authoring are out of scope except where they touch Library or download. AGI status comes from the comparison CSVs, area briefs 14, 24, 25 and 95, and code. Only the web scorecard and web defect list count as seen by a person.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-files-and-attachments-01](#cap-files-and-attachments-01) | Attach files from the device picker | yes | yes | built | seen working by a person |
| [CAP-files-and-attachments-02](#cap-files-and-attachments-02) | Drag, drop and paste intake | yes | yes | partly built | code inspected only |
| [CAP-files-and-attachments-03](#cap-files-and-attachments-03) | Supported file and image types | yes | yes | partly built | code inspected only |
| [CAP-files-and-attachments-04](#cap-files-and-attachments-04) | Size and count limits per message | yes | yes | partly built | code inspected only |
| [CAP-files-and-attachments-05](#cap-files-and-attachments-05) | Per-plan upload allowances | partly | yes | partly built | not verified |
| [CAP-files-and-attachments-06](#cap-files-and-attachments-06) | Image input (vision) | yes | yes | built | seen working by a person |
| [CAP-files-and-attachments-07](#cap-files-and-attachments-07) | PDF reading with page limits and embedded visuals | yes | yes | built | seen working by a person |
| [CAP-files-and-attachments-08](#cap-files-and-attachments-08) | Spreadsheets and data files with analysis | yes | yes | partly built | seen failing by a person |
| [CAP-files-and-attachments-09](#cap-files-and-attachments-09) | Audio file upload and transcription | unknown | yes | not built | not verified |
| [CAP-files-and-attachments-10](#cap-files-and-attachments-10) | Video file attachment | unknown | partly | not built | not verified |
| [CAP-files-and-attachments-11](#cap-files-and-attachments-11) | Camera, photo library and document scan on phones | partly | yes | partly built | code inspected only |
| [CAP-files-and-attachments-12](#cap-files-and-attachments-12) | Screenshot and window capture | yes | yes | partly built | not verified |
| [CAP-files-and-attachments-13](#cap-files-and-attachments-13) | Long paste becomes an attachment | unknown | yes | built | not verified |
| [CAP-files-and-attachments-14](#cap-files-and-attachments-14) | Attachment lifecycle: progress, retry, cancel, per-file errors | unknown | partly | partly built | seen working by a person |
| [CAP-files-and-attachments-15](#cap-files-and-attachments-15) | Warning when the model cannot read an attachment | unknown | unknown | partly built | not verified |
| [CAP-files-and-attachments-16](#cap-files-and-attachments-16) | Large files: what reaches the model and what is searched | yes | yes | partly built | not verified |
| [CAP-files-and-attachments-17](#cap-files-and-attachments-17) | Project files as knowledge | yes | yes | partly built | seen failing by a person |
| [CAP-files-and-attachments-18](#cap-files-and-attachments-18) | Library: one place for uploaded and generated files | partly | yes | partly built | code inspected only |
| [CAP-files-and-attachments-19](#cap-files-and-attachments-19) | Library organisation: folders, favorites, select and batch actions | unknown | partly | not built | not verified |
| [CAP-files-and-attachments-20](#cap-files-and-attachments-20) | Storage allowance and manager | unknown | yes | partly built | code inspected only |
| [CAP-files-and-attachments-21](#cap-files-and-attachments-21) | Trash, restore and deletion | unknown | yes | built | seen failing by a person |
| [CAP-files-and-attachments-22](#cap-files-and-attachments-22) | Connected storage in chat and Library | partly | yes | partly built | not verified |
| [CAP-files-and-attachments-23](#cap-files-and-attachments-23) | Previews and readers for files | partly | yes | partly built | seen failing by a person |
| [CAP-files-and-attachments-24](#cap-files-and-attachments-24) | Ask about a selected part, page or passage | partly | yes | partly built | not verified |
| [CAP-files-and-attachments-25](#cap-files-and-attachments-25) | Generated files in Library and download | yes | yes | partly built | seen failing by a person |
| [CAP-files-and-attachments-26](#cap-files-and-attachments-26) | Files and images in coding tools | yes | yes | built | code inspected only |
| [CAP-files-and-attachments-27](#cap-files-and-attachments-27) | Upload a local file into a web page (browser agent) | yes | unknown | partly built | not verified |
| [CAP-files-and-attachments-28](#cap-files-and-attachments-28) | Share sheet and system hand-off to the app | unknown | unknown | built | code inspected only |
| [CAP-files-and-attachments-29](#cap-files-and-attachments-29) | Local mode attachments | unknown | unknown | partly built | not verified |
| [CAP-files-and-attachments-30](#cap-files-and-attachments-30) | Retention and privacy note for attached files | partly | partly | partly built | code inspected only |

## CAP-files-and-attachments-01 Attach files from the device picker

A plus-menu control opens the system file chooser and adds the chosen files to the next message.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Add files or photos from the + menu; files can go to a chat or to a project Files section. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): Add via the plus button (Add photos & files), drag-drop or paste. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 18 (Mixed attachments); docs/product/requirements.md 4.2 One Chat). Every app with a composer offers a device file picker that attaches one or many files to the next message.

**With different models, providers and the one subscription.** The picker is the same for every model. Whether a file is accepted comes from the selected model's capability and the account's plan limits, never from the provider. In Local mode the file stays on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI (/attach, /files, -f), VS Code and Chrome all done per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.01, S14.15
- Comparison list ids: XP1
- Code: `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:647`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:382`; `apps/cli/src/claude_parity.rs:145`; `apps/extension/src/side_panel.ts:14092`

**Gap.** Chrome picker takes only images, PDF and text; no folder pick on Chrome.

**Acceptance criteria**

1. On each app, pick two files at once and both appear as chips before send.
2. Send with a file attached and the model answers from its content.
3. Pick a file type the app does not accept and see a notice naming the file.

**Verification: seen working by a person.** Web scorecard W-4 (free and subscribed): PDF and image attached and answered correctly. Other apps: code inspected only.

## CAP-files-and-attachments-02 Drag, drop and paste intake

Dropping files on the chat or pasting a copied image attaches it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude; Claude Code for the terminal: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Drag into the chat window or paste copied images. [2026-11-22] Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/14554922-claude-code-user-faq](https://support.claude.com/en/articles/14554922-claude-code-user-faq): Claude Code: drag images into the terminal or paste with Ctrl+V (not Cmd+V on Mac). [2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **ChatGPT; Codex for CLI and IDE: yes**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): Add by plus button, drag-drop or paste. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/image-inputs.md](https://learn.chatgpt.com/docs/image-inputs.md): Codex: drag with Shift in desktop or IDE; paste into the CLI composer. [2026-11-22] Apps: desktop, ide, cli.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 18). Drop and paste attach files and images on every app that has a composer and a pointer or clipboard.

**With different models, providers and the one subscription.** Same intake for all models; the model check happens after intake. Local mode attaches on device only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Drag: web, desktop, VS Code, Chrome done; mobile missing (n/a for touch). Paste image: web, desktop, CLI, VS Code, Chrome done; mobile has a clipboard read in the Add sheet. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.02, S14.03
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/DragDropOverlay.tsx:50`; `apps/cli/src/tui/tui_app.rs:2477`; `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4992`; `apps/mobile/src/features/media/clipboard-image.ts`

**Gap.** Ledger lists mobile drag and paste as missing while the comparison says the Add sheet reads the clipboard; the two disagree. Web composer keeps plain text only when pasting rich text (W70).

**Acceptance criteria**

1. Drop two files on the web chat and see two chips.
2. Paste a clipboard screenshot in web, desktop, CLI and VS Code and see an image attachment.
3. On the phone, copy an image and attach it from the Add sheet.

**Verification: code inspected only.** No run in the web scorecard covers drop or paste.

## CAP-files-and-attachments-03 Supported file and image types

The list of document, data, code and image types a chat accepts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB, JSON, XLSX (needs code execution and file creation on); images JPEG, PNG, GIF, WebP. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): DOCX, PDF, TXT, MD, HTML, JSON, XLSX, CSV, PPTX, ODS and more; .gdoc must be exported. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W04). Each advertised type either gives the model usable input or shows an explicit unsupported or extraction-failed state. The accepted list lives in one shared policy, not in each app.

**With different models, providers and the one subscription.** Types a model cannot read go through a labelled alternative path or are refused with the reason. The list is configuration shared by all plans.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Shared policy accepts images, PDF, text, code, CSV, JSON, notebooks, XML, HTML, docx, xlsx, pptx. Not accepted: ODT, RTF, EPUB, ODS, audio, video. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.24
- Comparison list ids: W102
- Code: `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:17-52`; `apps/mobile/src/features/chat/utils/attachmentValidation.ts:61`

**Gap.** Missing ODT, RTF, EPUB, ODS (W102).

**Acceptance criteria**

1. Attach one file of each accepted type and get usable model input or a named failure.
2. Attach an unsupported type and see a notice naming the file and the reason.
3. The same type list is enforced on web, desktop and mobile.

**Verification: code inspected only.** Policy file read; only PDF and PNG exercised in web scorecard W-4.

## CAP-files-and-attachments-04 Size and count limits per message

Largest single file, files per message and image dimensions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): 500 MB per file, up to 20 files per chat, images up to 8000x8000 pixels, PDFs up to 1000 pages. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): 512 MB per document, 2M tokens per text file, about 50 MB for spreadsheets, 20 MB per image. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 13, 2026: up to 20 files per message. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W04; AGENTS.md section 8 (limits are configuration)). Limits are read from one shared policy and plan entitlements and shown before send. No app keeps its own constants.

**With different models, providers and the one subscription.** Limits come from the AGI Subscription entitlement and the file policy, not from the model. A smaller model context may reduce what is read, with a notice, not what is accepted.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: 20 files, 500 MiB paid, 25 MiB Free and Basic, images 20 MiB and 8000 px. Mobile: 25 MB each and per message, 20 files. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.23
- Comparison list ids: MP32, WP84
- Code: `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:1-6,38-45`; `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:55-68`

**Gap.** Mobile does not use the 500 MiB paid limit (MP32). Desktop, CLI, VS Code and Chrome limits not compared.

**Acceptance criteria**

1. Attach a 21st file and see a clear refusal naming the limit.
2. On a Free account attach a file over 25 MiB and see the limit and an upgrade path.
3. On a paid account attach a file near 500 MiB on web and on mobile; both behave the same or the difference is stated.

**Verification: code inspected only.** No oversize file run in the scorecards.

## CAP-files-and-attachments-05 Per-plan upload allowances

Daily or rolling upload caps and project file counts that differ by plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): File creation draws from plan limits and uses more than ordinary chat. [2026-11-22] Plans: All plans. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/9797557-usage-limit-best-practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices): Project documents are cached and count less when reused; the first message after a long break counts in full. [2026-11-22] Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): 80 uploads per 3 hours (Free 3 per day); storage 25 GB per user. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): File uploads limited on Free, fuller on Go, Plus and Pro. [2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (file limits and concurrency admission); owner decision Free usage shows only Upgrade (memory index)). File allowances are entitlements of the one AGI Subscription, shown in plain words on every app, and the Free usage screen shows only Upgrade, not meters.

**With different models, providers and the one subscription.** Counted once per account across apps and across providers; BYOK and Local do not spend AGI file allowances.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: Free 5 files a day; paid capped by daily bytes. Mobile shows no per-plan project limits. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M182; rows without an id: comparison-web row 'Daily upload count limit by plan' (no id)
- Code: `packages/contracts/cloud-contracts/src/chat-attachment-policy.json`

**Gap.** Mobile project file limits not shown (M182). Per-plan project file counts not compared on desktop.

**Acceptance criteria**

1. On Free, the sixth file of the day is refused with a one-line Upgrade message.
2. On a paid plan the daily byte cap message names what stops working and when it resets.
3. The same account sees the same allowance on web and mobile.

**Verification: not verified.** No scorecard exercises an allowance.

## CAP-files-and-attachments-06 Image input (vision)

The model reads photos, screenshots and diagrams attached to a message.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Images JPEG, PNG, GIF, WebP up to 8000x8000 pixels. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT; Codex: yes**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): All models accept images on Free and paid plans, subject to plan limits; PNG, JPEG and non-animated GIF up to 20MB. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/image-inputs.md](https://learn.chatgpt.com/docs/image-inputs.md): Codex: pass PNG or JPEG with -i or --image, or paste into the composer. [2026-11-22] Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/requirements.md 4.3 Capability Honesty). Images attach on every app. If the selected route has no vision, the app does not silently accept the image: it warns and offers a labelled alternative.

**With different models, providers and the one subscription.** Vision comes from model capability metadata (the model picker already has an Images filter). In Local mode the on-device model reads the text in a photo, not the picture, and the app says so.

**Current implementation, as this trace read it on 2026-11-24: built.** All six apps accept images; web and desktop warn when the model cannot read an attachment; mobile, CLI, VS Code and Chrome partly. Local mobile note exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.35, S14.36
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4031`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:130`; `apps/cli/src/tui/tui_app.rs:4054`

**Gap.** Model-compatibility warning missing on mobile, CLI, VS Code, Chrome (S14.35). Web image chip shows a cropped square with no filename (seen).

**Acceptance criteria**

1. Attach a photo with a vision model and get a correct description.
2. Switch to a model without vision and see a warning before send with a fix.
3. In Local mode on mobile the note says on-device models read text in photos only.

**Verification: seen working by a person.** Web scorecard W-4: image attached, 3 shapes counted. Defect W-4 free: wrong shape count with PDF and image together (intermittent).

## CAP-files-and-attachments-07 PDF reading with page limits and embedded visuals

The model reads PDF text and, within a page limit, charts and images in the PDF.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): PDFs of 100 pages or fewer get text and visual analysis; 101-1000 pages are text only. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): ChatGPT reads text and images (charts, diagrams) in PDFs attached directly to a chat; project and GPT knowledge files may not include embedded images. [2026-11-22] Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). PDFs are read for text, scanned pages by OCR within a stated limit, and visuals where the model supports them. The page limits are shown.

**With different models, providers and the one subscription.** OCR and text extraction run on AGI servers so any model gets text; embedded visuals reach only vision models. In Local mode the extraction must run on the device or be refused with an explicit fork to cloud.

**Current implementation, as this trace read it on 2026-11-24: built.** Web comparison: 1000 text pages, OCR up to 100 pages a file. CLI reads PDF pages in ranges. Password-protected notice on web, desktop, mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.25, S95.08
- Comparison list ids: none matched; rows without an id: comparison-web row 'PDF limits' (no id); comparison-vscode row 'Read specific pages of a PDF' (no id)
- Code: `apps/web/lib/server/pdf-attachment-content.ts:264`; `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:68-79`; `apps/cli/src/documents.rs:22-24`

**Gap.** Local-mode PDF extraction not established. Web PDF read was seen correct; tool failure 'pymupdf missing' seen once in Work mode.

**Acceptance criteria**

1. Attach a 5-page PDF and ask about the last page; the answer is right.
2. Attach a scanned PDF and get text through OCR or a clear refusal.
3. Attach a locked PDF and see how to unlock it.

**Verification: seen working by a person.** Web scorecard W-4 and W-15: PDF answered (Cedar Bay, VELA-74). Defect W-15 subscribed: first tool step failed visibly (pymupdf missing) then recovered.

## CAP-files-and-attachments-08 Spreadsheets and data files with analysis

CSV and Excel files are analysed with code in a sandbox, with tables and charts shown.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Claude runs code in a sandbox to build Excel, PowerPoint, Word and PDF files, charts and Python analysis; max 30MB per file. [2026-11-22] Plans: All plans. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets](https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets): Sheets import from CSV, Excel, Google Sheets or paste. [2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt): Analyses xls, xlsx, csv, PDFs, json, xml, yaml, txt, md in a stateful sandbox with no external web access. [2026-11-22] Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9213685-extracting-insights-with-chatgpt-data-analysis](https://help.openai.com/en/articles/9213685-extracting-insights-with-chatgpt-data-analysis): Uploaded data opens as an interactive table; select rows or cells to ask about them. [2026-11-22] Apps: web.

**AGI requirement** (inferred; source: competitor parity). Attached tabular files can be analysed in a sandbox and shown as tables. Sandbox use is described as an AGI harness feature, not a model feature.

**With different models, providers and the one subscription.** Sandbox runs on AGI servers and works with any tool-capable model; non-tool models get a labelled sample instead. Counts toward the subscription's code-run allowance. Not available in Local mode on a phone; say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: attached files placed in a sandbox; tables preview. Mobile: code runs and shows in chat; no interactive data tables (MP31). Web: no row or column selection (WP89). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S25.08
- Comparison list ids: MP31, WP89, WP98
- Code: `apps/web/lib/server/file-text-preview.ts:34`; `apps/web/features/projects/components/FilePreviewModal.tsx:187`

**Gap.** No interactive table selection; no import into an editable sheet (WP98). Xlsx creation failed every time in the browser run.

**Acceptance criteria**

1. Attach a CSV and ask for a sum; the answer matches.
2. Open the table preview and see rows and columns.
3. Attach an xlsx on a non-tool model and see the labelled fallback.

**Verification: seen failing by a person.** Defects W-9: Excel file cannot be created, fails every time; free run: false 'tool isn't available' answer.

## CAP-files-and-attachments-09 Audio file upload and transcription

Attach an audio file and get a transcript, summary or answers.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): Paid plans and Enterprise attach audio (WAV, MP3, OGG, FLAC, AAC, M4A) up to 512 MB; not on Free, not yet in Work or Codex. [2026-11-22] Plans: Paid, Enterprise. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Oct 6, 2026: attach audio for transcripts, summaries, notes or an email draft; may err across languages. [2026-11-22] Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). Audio attach with transcription is offered on paid plans, with a size limit and a notice about language accuracy.

**With different models, providers and the one subscription.** Transcription is a separate speech service, so any chat model can read the transcript. It needs a server or a local speech model; Local mode must say which.

**Current implementation, as this trace read it on 2026-11-24: not built.** Audio is not an accepted type on any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.13, S24.07, S25.06, S25.23, S95.10
- Comparison list ids: M45, W103
- Code: `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:17-36 (no audio types)`

**Gap.** No audio attachment, player, transcript panel or timestamp navigation. A transcription worker exists in the platform ledger (S95.10) but is not wired to attach.

**Acceptance criteria**

1. Attach an MP3 on a paid plan and get a transcript.
2. Attach audio on Free and see an Upgrade message.
3. Open the audio in the Library and play it.

**Verification: not verified.** Not built.

## CAP-files-and-attachments-10 Video file attachment

Attach a video and ask about it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): Videos can be attached even on Free; analysis may be incomplete and may not interpret audio; counts toward upload limits. [2026-11-22] Plans: Free and paid. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Decide whether to accept video; if accepted, say what is read (frames, transcript) and what is not.

**With different models, providers and the one subscription.** Only models with video or frame input can use it; others need a frame and transcript path labelled as such.

**Current implementation, as this trace read it on 2026-11-24: not built.** Video is not an attachable type on any app. Video generation is separate and plan gated; Library plays generated videos. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.14, S95.11
- Comparison list ids: M46, W113
- Code: `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:17-36`

**Gap.** No attachment path, no frame or transcript processor.

**Acceptance criteria**

1. Owner decision recorded first.
2. If built: attach a short video and the reply states what was read.
3. A model without video input shows the alternative path.

**Verification: not verified.** Not built.

## CAP-files-and-attachments-11 Camera, photo library and document scan on phones

Take a photo, pick photos, or scan several pages into one PDF from the phone.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Add files or photos from the + menu on web, desktop, iOS and Android. Camera capture is not shown in the catalogue. [2026-11-22] Apps: ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Oct 1, 2026 (iOS): Scan in the camera menu captures several pages and merges them into a PDF. Aug 21, 2026: long-press + shows recent photos. [2026-11-22] Apps: ios.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 154 (Mobile input)). Phone composer offers camera, photo library and recent photos; multi-page scan to PDF is optional.

**With different models, providers and the one subscription.** Capture is on device for every mode. In Local mode the photo stays on the phone and the on-device model gets the text only. Denied camera permission shows a settings path.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: camera and photos done; no strip of recent photos (M22); scan is partial (MP37). Web, desktop, Chrome: no camera. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.04, S14.05
- Comparison list ids: M22, MP37
- Code: `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:366,375`; `apps/mobile/app/_layout.tsx:307`

**Gap.** No recent-photo strip; no multi-page scan to one PDF.

**Acceptance criteria**

1. Tap Camera, take a photo, see it as a chip.
2. Deny camera permission and see a path to settings.
3. Pick three photos at once up to the plan limit.

**Verification: code inspected only.** No mobile run in the web-only scorecards.

## CAP-files-and-attachments-12 Screenshot and window capture

A control or shortcut captures the screen or one window into the message.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (desktop and Chrome); Claude Code: yes**
  - [https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac): Quick entry: drag-select a screen area, or click an app window, to attach it; needs Screen recording permission. [2026-11-22] Apps: desktop.
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Users share screenshots or regions. [2026-11-22] Apps: chrome.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10003026-windows-app-release-notes](https://help.openai.com/en/articles/10003026-windows-app-release-notes): Windows app: take a window, full-screen or region screenshot with the Snipping Tool and insert it into the chat. [2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 148 (OS integration)). Desktop and Chrome capture a screen, window or tab into the message with the permission named; web offers it where the browser allows.

**With different models, providers and the one subscription.** Captured image follows the vision rules. A screenshot is sent to a provider only after the normal send; Local mode keeps it on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop and Chrome capture done. Web comparison says no screenshot row in the plus menu (W71) while the ledger marks web done. CLI and VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.06, S14.07
- Comparison list ids: DP100, W71
- Code: `apps/desktop/electron/screenshot.ts:111`; `apps/extension/src/side_panel.ts:14051`; `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:857`

**Gap.** Web ledger and comparison disagree; desktop quick shortcut captures the whole display only (DP100).

**Acceptance criteria**

1. On desktop pick one window and see only that window attached.
2. In Chrome capture the active tab and attach it.
3. Deny screen permission and see a recovery step.

**Verification: not verified.** No run exercises capture.

## CAP-files-and-attachments-13 Long paste becomes an attachment

Pasting over 10,000 characters turns into a file so the box stays light.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Pastes over 10,000 characters become attachments; Show in text field restores them; all plans. [2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android, desktop.

**AGI requirement** (inferred; source: competitor parity (ChatGPT; Claude Code collapses long pastes in its own tool)). Large pastes become a removable attachment, with a link to put the text back in the message.

**With different models, providers and the one subscription.** Threshold is configuration. The text still counts against the model's context and the plan's usage.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and mobile: 10,000 characters. CLI collapses to a placeholder. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: comparison-web row 'Long paste becomes an attachment' (no id); comparison-mobile row 'Large pasted text becomes an attachment' (no id)
- Code: `apps/cli/src/tui/composer_edits.rs:113`

**Gap.** none known

**Acceptance criteria**

1. Paste 12,000 characters and see an attachment chip.
2. Press Put it back and see the text in the box.
3. Send; the model sees the full text.

**Verification: not verified.** Comparison row only.

## CAP-files-and-attachments-14 Attachment lifecycle: progress, retry, cancel, per-file errors

Each file shows upload progress, can be retried or cancelled, and a failure names the file and the reason.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Duplicate-name prompt: Upload anyway or Skip; max 10 uploads at once; preview, download, delete. [2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Download failed or not found when a generated file expired or exceeded 512 MB. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 19 (Upload lifecycle); docs/product/experience-contract.md W04). Every file shows progress, can be retried or cancelled, shows its own error, handles duplicates visibly and keeps the draft if upload fails.

**With different models, providers and the one subscription.** Lifecycle is independent of model. A failed upload never sends a partial set without a choice.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done for progress, retry, cancel, password notice. Parsing progress missing everywhere. Duplicate handling missing in VS Code and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.19, S14.20, S14.26, S14.27, S14.28, S14.31, S14.32, S14.33
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/AttachmentPreview.tsx:100,109,125`; `apps/mobile/src/features/chat/upload/uploadAttachment.ts:17`; `apps/web/features/chat/hooks/use-attachments.ts:258`

**Gap.** No parsing progress (S14.20); no replacement in place (S14.29); no full-size preview before send (S14.30). Seen: chip remove button covers last letters of the filename on web.

**Acceptance criteria**

1. Start a large upload, cancel it, and the chip disappears.
2. Break the network mid-upload; the chip shows Retry and the draft text stays.
3. Add the same file twice and see it flagged.
4. Remove a file before send and confirm it is absent after reload.

**Verification: seen working by a person.** Web scorecard W-4: removed attachment stayed absent after reload. Defects W-4/W-11/W-15: filename clipped by remove button.

## CAP-files-and-attachments-15 Warning when the model cannot read an attachment

Before send, the composer says if the chosen model cannot read this file type and offers a fix.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md 4.3 Capability Honesty; docs/product/competitive-guidance.md item 24). If the selected model cannot read an attachment the composer warns and offers a deliberate alternative: switch model, convert, or a labelled preprocessing path.

**With different models, providers and the one subscription.** This is the model-agnostic core. The warning reads capability metadata. The Free-plan rule already sends a message with a file the free model cannot read to the Auto model once, with a saved note.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop done; CLI warns on image paste; mobile has a validation message; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.35, S14.36
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4017,4031,4036`; `apps/mobile/src/features/chat/utils/attachmentValidation.ts:47,55`; `apps/cli/src/mentions.rs:288`

**Gap.** No warning on mobile, VS Code, Chrome.

**Acceptance criteria**

1. Attach an image and pick a text-only model; see the warning and a one-click fix.
2. Send anyway on Free and see the Auto-model note.
3. In Local mode attach an image and see the on-device limits.

**Verification: not verified.** Code only; no run in scorecards.

## CAP-files-and-attachments-16 Large files: what reaches the model and what is searched

Part of a big file goes into context and the rest is searched; the user is told when only part was read.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Project files: total content must fit the context window; text extraction only except multimodal PDFs; PDFs over 100 pages are text only. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10029836-optimizing-file-uploads-in-chatgpt-enterprise](https://help.openai.com/en/articles/10029836-optimizing-file-uploads-in-chatgpt-enterprise): Up to 110k document tokens go in context (55k split across several documents); the remainder is placed in a private vector index. [2026-11-22] Plans: Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 69 and W04; item 24). A turn has a visible attachment budget. When a file is cut or only partly read, the answer says so; later turns reuse a short card plus retrieved passages.

**With different models, providers and the one subscription.** The budget scales with the selected model's context and the plan; it is configuration. Local on-device models get a smaller budget and the app says so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Notice done on web, desktop, mobile, CLI, VS Code. File viewer has no partial-extraction warning (S25.31). Turn budget is set in policy. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.23, S25.31
- Comparison list ids: none matched
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:473,542`; `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:90-101`

**Gap.** Previews and Library do not show partial extraction (S25.31).

**Acceptance criteria**

1. Attach a file larger than the turn budget; the reply says part was read.
2. Ask about a late section; the answer cites the passage or says it was not read.
3. The Library preview shows the same partial warning.

**Verification: not verified.** Code only.

## CAP-files-and-attachments-17 Project files as knowledge

Files added to a project are shared across its chats and indexed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude; Claude Code (Projects page): yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Project files: 30 MB per file, unlimited count but total content must fit context. [2026-11-22] Apps: web, desktop, ios, android.
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): Claude Code Projects: upload up to 1,000 files and 2 GB per batch, single file up to 480 MB; folders skip hidden files and node_modules; threads read copies under /mnt/project-files. [2026-11-22] Plans: Pro, Max, Ultra (public beta). Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): 5 files Free, 25 Go/Plus, 40 Pro/Business/Enterprise/Edu; max 10 uploads at once; preview, download, delete. [2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W05; docs/product/competitive-guidance.md item 50). Project files are separate from per-chat attachments, indexed with a status, searchable, and limited by plan storage; retrieval cites the source file and location.

**With different models, providers and the one subscription.** Retrieval runs in AGI so any model gets passages. Projects with files are Cloud only; Local projects keep files on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have an indexing status panel; mobile has a Sources tab but shows no limits and no indexing progress. Limit is plan storage, not file count (WP244). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.21, S24.27
- Comparison list ids: M182, WP244
- Code: `apps/web/features/projects/components/KnowledgeFilesPanel.tsx:557`; `apps/web/app/api/projects/[id]/knowledge-files/route.ts:227`

**Gap.** Upload of a PDF as project knowledge failed twice in the browser run.

**Acceptance criteria**

1. Add a PDF to a project and see Indexed.
2. Ask a question whose answer is near the end and get the right file and place.
3. Add an over-limit file and see which limit.

**Verification: seen failing by a person.** Defects W-11 free and subscribed: project knowledge upload and Add text fail with a generic server error (blocker, setup_limit).

## CAP-files-and-attachments-18 Library: one place for uploaded and generated files

Uploads and created files are saved automatically; browse all, uploaded, generated, images, videos, documents; search and sort.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Files can go to a chat or a project Files section; no separate cross-chat library is shown in the catalogue. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Uploaded and created files are saved automatically to Library with search, filters, upload, download, a Storage meter and Add from library in the composer; generated images stay in Images. Replaced by Space where available. [2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 23, 2026: files saved automatically; Temporary Chat uploads are not saved. [2026-11-22] Plans: Plus, Pro, Business. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Library indexes uploaded, generated, and connected-source content); competitive-guidance.md item 65 and 67). A Library lists every file the user owns across chats, uploads and generation, with views, search, filters and sort, and attaches into a chat without re-upload. Temporary chats save nothing.

**With different models, providers and the one subscription.** Library belongs to the Cloud account and is the same for every model and provider. In Local mode files stay in local storage and are not in the cloud Library.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile: uploaded, generated, artifacts, images, videos, recent, search, type filter, storage meter. No all-files view stated for CLI, VS Code, Chrome. Audio view missing. Mobile lacks source filter, sort, grid and list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S24.01, S24.02, S24.03, S24.04, S24.05, S24.06, S24.07, S24.08, S24.12, S24.13, S24.14, S24.15, S24.19, S24.28, S95.16
- Comparison list ids: M185, M186, WP43
- Code: `packages/ui/unified-chat/src/components/library/LibraryView.tsx:81,96,838,852`; `apps/web/app/api/library/route.ts:67`; `apps/mobile/src/features/library/index.tsx:78,330`

**Gap.** No Suggested, Favorites or Shared-with-you views; mobile missing sort, grid and source filters.

**Acceptance criteria**

1. Upload a file in chat; it appears in Library without a second step.
2. Search by name and filter to Documents.
3. Attach a Library file into a new chat without re-uploading.
4. A file uploaded in a temporary chat does not appear in Library.

**Verification: code inspected only.** Library not exercised in the web scorecard.

## CAP-files-and-attachments-19 Library organisation: folders, favorites, select and batch actions

Folders, favorites, multi-select, rename, duplicate, move, batch download and delete.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Favorites with optional folders and a Move action; Library search matches folders and titles. [2026-11-22] Plans: Free, Go, Plus, Pro, Business. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 7, 2026: drag-select several Library items; Add from library in the composer menu. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 65; AGENTS.md section 9 (undoable actions ask first)). Library supports folders, favorites, multi-select and batch actions, each destructive action asking first and naming the consequence.

**With different models, providers and the one subscription.** Account-level feature, model independent; the same on every app that has a Library.

**Current implementation, as this trace read it on 2026-11-24: not built.** Folders, favorites, multi-select, rename, duplicate, move and batch actions are missing on web, desktop and mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S24.09, S24.11, S24.16, S24.17, S24.18, S24.20, S24.21, S24.22, S24.23, S24.24, S24.25, S24.26, S95.17
- Comparison list ids: M185, M186, W312
- Code: `comparison-web: Library has tabs and sort only (WP43)` (not found)

**Gap.** All listed actions.

**Acceptance criteria**

1. Create a folder and move two files into it.
2. Select five files and delete them with one confirm that names the Trash and restore period.
3. Rename a file and see the new name in chat attachments.

**Verification: not verified.** Not built.

## CAP-files-and-attachments-20 Storage allowance and manager

Shows saved-file storage used against the plan allowance, with a place to delete.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Storage: Free 500 MB, Go 4 GB, Plus and Business 20 GB, Pro 100 GB; per file 512 MB, images 20 MB. [2026-11-22] Plans: Free, Go, Plus, Pro, Business. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): May 14, 2026: storage manager in Settings > Storage on web with delete in Library. [2026-11-22] Apps: web, ios, android.

**AGI requirement** (stated requirement; source: owner decision Free usage shows only Upgrade (memory index); docs/product/commercial.md (storage allowances owned elsewhere)). The Library shows used storage against the plan allowance. The Free screen shows only Upgrade, not meters.

**With different models, providers and the one subscription.** Allowance is a subscription entitlement counted per account across apps. Local files do not count.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile show a meter. Mobile Storage page covers on-device usage only, no cloud quota (M47). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S24.33, S95.23
- Comparison list ids: M47
- Code: `apps/web/app/api/library/route.ts:139`; `apps/mobile/src/features/library/index.tsx:661,667`

**Gap.** Mobile lacks the cloud quota in Storage settings. Comparison states web sizes 500 MB Free to 100 GB.

**Acceptance criteria**

1. Upload a file and see used storage rise.
2. Fill the allowance and see a message that names what stops working.
3. Delete from Library and see storage fall.

**Verification: code inspected only.** Not in scorecards.

## CAP-files-and-attachments-21 Trash, restore and deletion

Deleting a file moves it to a trash from which it can be restored; permanent removal is explicit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): Saved files live in Library with Recently deleted, restore and Delete forever, independent of chat deletion. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (agent never destroys user data; Trash first)). Library files go to Recently deleted first; permanent removal names what is lost.

**With different models, providers and the one subscription.** Same for all models. Deleting a file also removes its derived text and search index.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile done; generated images restorable for 30 days. CLI, VS Code, Chrome have no Library. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S24.34, S95.24, S95.25, S95.26, S95.28
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/library/LibraryView.tsx:876,1578`; `apps/web/lib/server/media-assets.ts:492`; `apps/mobile/src/features/library/index.tsx:168`

**Gap.** Web chat delete dialog says it cannot be undone while the product has Recently deleted (seen).

**Acceptance criteria**

1. Delete a file, find it in Recently deleted, restore it.
2. Delete forever shows what is lost.
3. Deleted file no longer answers questions in chats.

**Verification: seen failing by a person.** Defect W-13 subscribed: delete dialog says chat cannot be undone, no Recently deleted recovery (chat, not file).

## CAP-files-and-attachments-22 Connected storage in chat and Library

Add files from Google Drive, OneDrive, SharePoint, Box or Dropbox to a chat or browse them in the Library.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Plus menu > Add from Google Drive; docs stay synced; only text is extracted, not images; project knowledge from Drive unavailable for shared projects. [2026-11-22] Apps: web, desktop.
  - [https://support.claude.com/en/articles/12542951-set-up-the-microsoft-365-connector](https://support.claude.com/en/articles/12542951-set-up-the-microsoft-365-connector): Reads Word, Excel, PowerPoint, PDF and plain text from SharePoint and OneDrive. [2026-11-22]
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Sep 10, 2026: browse, search and @mention Box, Dropbox and SharePoint files with Google Drive in Library, web only. Aug 13, 2026: Drive in Library with side-by-side docs. [2026-11-22] Plans: Go, Plus, Pro, Business, Edu, Healthcare, Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 66). Files from connected storage can be attached in chat; whether to browse them in Library is an owner choice. External files are marked as references and keep their original location.

**With different models, providers and the one subscription.** Needs a signed-in Cloud account and a plan that includes connectors. Not available in Local mode; the app says why.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Drive files can be project sources on web; the chat composer has no add-from-Drive (WP82). Library does not browse connected storage (W104, W222). Box and Dropbox connectors are switched off (W229). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.09, S24.37, S24.38, S24.39, S24.40, S95.18, S95.19
- Comparison list ids: M200, M32, W104, W222, W229, WP82
- Code: `comparison-web rows WP82, W104, W222, W229` (not found)

**Gap.** No cloud-file picker in the composer, no connected browsing in Library, no external-reference marking.

**Acceptance criteria**

1. From the plus menu pick a Drive file and the model reads it.
2. A Drive file shows as a reference, not an owned copy.
3. Without a connected account the row explains how to connect.

**Verification: not verified.** Project Drive sources only seen as code. Defect W-17 free: reply to a Drive request implies a connection exists.

## CAP-files-and-attachments-23 Previews and readers for files

Open a file in the product: PDF, text, Markdown, code, image, sheet, document, with zoom and download.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Mobile Download opens the file in the system preview or a related app such as Word. [2026-11-22] Plans: All plans. Apps: ios, android.
- **ChatGPT; Codex for desktop viewer: yes**
  - [https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work](https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work): Desktop sidebar opens documents, spreadsheets, presentations and PDFs; select a part and describe the change. [2026-11-22] Plans: Eligible paid plans. Apps: desktop.
  - [https://learn.chatgpt.com/docs/artifacts-viewer.md](https://learn.chatgpt.com/docs/artifacts-viewer.md): Codex desktop previews documents, slides, spreadsheets and PDFs beside the chat. [2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 10 (renderer manifest); competitive-guidance.md item 76). Each file type the product accepts opens in a reader, or says it cannot and offers download or open in the native app.

**With different models, providers and the one subscription.** Rendering is a product feature, not a model feature. Works the same in every mode; Local files render on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop: PDF, text, Markdown, code, image, spreadsheet, docx, zoom, full screen, download original and converted. Mobile: image, video, zoom, download, native open; no PDF reader (S25.01), no sheet or docx preview. Missing everywhere: pptx, archives, page thumbnails, search in file, audio player. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S25.01, S25.02, S25.03, S25.04, S25.05, S25.07, S25.08, S25.09, S25.10, S25.11, S25.12, S25.14, S25.18, S25.26, S25.27, S25.29, S25.30
- Comparison list ids: none matched; rows without an id: comparison-mobile row 'Open a downloaded file in the system preview' (no id)
- Code: `apps/web/features/projects/components/FilePreviewModal.tsx:127,368,376`; `packages/ui/unified-chat/src/components/library/LibraryView.tsx:1096,1312`; `apps/mobile/src/features/library/index.tsx:140`

**Gap.** No pptx or archive preview, no page thumbnails, no search inside a file, no fit and rotate controls. Desktop has no Open File menu item (D104).

**Acceptance criteria**

1. Open a PDF, docx and CSV from Library and read each.
2. Open a pptx and see a preview or a download prompt.
3. Open an unsupported type and see the fallback with download.

**Verification: seen failing by a person.** Defect W-9: artifact panel shows UNKNOWN badge on every file and cuts a table to 3 of 5 columns (cosmetic, minor).

## CAP-files-and-attachments-24 Ask about a selected part, page or passage

Select text or a region of a file and ask or request a change; citations open the cited passage.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Desktop Cowork reads and writes local files without upload. Selection-based questions are not shown in the catalogue. [2026-11-22] Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work](https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work): Select a part (claim, chart, slide) and describe the change. [2026-11-22] Plans: Eligible paid plans. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 36 (Citation integrity)). Users can select text or a page range in a file and ask about it; opening a citation highlights the cited passage.

**With different models, providers and the one subscription.** Passage retrieval runs in AGI for all models; the selection is sent as context like any attachment.

**Current implementation, as this trace read it on 2026-11-24: partly built.** VS Code asks about selection and range. Web and desktop can select content in an artifact and request a change, but not in uploaded files. Citation highlighting missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S25.20, S25.21, S25.22
- Comparison list ids: none matched; rows without an id: comparison-desktop row 'Point at part of a document, slide or page' (no id)
- Code: `apps/extension-vscode/src/core/commandSetup.ts:965,713`

**Gap.** Not in file readers on web, desktop, mobile.

**Acceptance criteria**

1. Select a paragraph in a PDF reader and ask; the reply cites that passage.
2. Open a citation and see the passage highlighted.
3. Choose a page range and the reply covers only that range.

**Verification: not verified.** Not built for uploaded files.

## CAP-files-and-attachments-25 Generated files in Library and download

Files the assistant makes (Word, Excel, PowerPoint, PDF, images) are listed, previewed and downloadable.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Builds downloadable Excel, PowerPoint, Word and PDF files; max 30MB per file; counts toward plan limits. [2026-11-22] Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Generated files expire quickly and downloads over 512 MB fail. [2026-11-22] Apps: web.
  - [https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work](https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work): Work creates editable documents, spreadsheets and presentations from instructions and attached sources. [2026-11-22] Plans: Eligible paid plans. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 38 (Artifacts in chat)). Generated files are saved to the Library, listed in an Outputs view per chat, previewed and downloadable; expiry is shown.

**With different models, providers and the one subscription.** File creation is an AGI sandbox feature, not a model feature, and counts toward the plan. Not available for on-device models.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: Outputs panel; Word, PowerPoint, Excel; no PDF output (WP83). Mobile: no PDF option (MP30). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S24.03, S25.26
- Comparison list ids: MP30, WP83
- Code: `apps/web/app/api/library/route.ts:67`; `apps/mobile/services/fileCreation.ts:253`

**Gap.** No PDF creation in chat; xlsx creation failing in the browser run; dispatch summary card not downloadable.

**Acceptance criteria**

1. Ask for a Word file; it appears in Outputs and in Library and downloads.
2. Ask for a spreadsheet and open it.
3. An expired file says it expired.

**Verification: seen failing by a person.** Defects W-9 (xlsx fails every time) and W-15 (summary card not downloadable).

## CAP-files-and-attachments-26 Files and images in coding tools

File and folder references and image input in the terminal and editor tools.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): Type @ and a path to include a file, paste screenshots, pipe command output into claude -p. [2026-11-22] Apps: cli.
  - [https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts](https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts): @path injects the whole file plus its CLAUDE.md tree into context. [2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/image-inputs.md](https://learn.chatgpt.com/docs/image-inputs.md): Pass one or more PNG or JPEG files with -i or --image, or paste; Shift-drag in the IDE. [2026-11-22] Apps: cli, ide, desktop.
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Attachments extended beyond images in the Codex desktop app. [2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 20 (Context mentions)). CLI and VS Code accept @ file and folder mentions, image paste or flag, and URL or repository attachment, inside the approved workspace.

**With different models, providers and the one subscription.** Mentions are read on the device; file bytes go to the provider only after the normal send and permission. Local sessions never route files to BYOK or cloud silently.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI: /attach, /files, -f images, paste, @ mentions, URL, folder. VS Code: @ files and folders, paste or drop images, selection auto-attach. Chrome: page text attach. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.08, S14.11, S14.12
- Comparison list ids: C52, CP47
- Code: `apps/cli/src/tui/tui_app.rs:5397`; `apps/cli/src/lib.rs:8417`; `apps/extension-vscode/src/data/mentionSearch.ts`

**Gap.** CLI draws no image previews (C52); at the image limit the next image is refused rather than the oldest trimmed (CP47). @path import inside instruction files missing (C405).

**Acceptance criteria**

1. In the CLI run /attach on a PNG and ask about it.
2. In VS Code type @ and pick a folder.
3. Try a credential file such as .env and see it refused.

**Verification: code inspected only.** Web-only scorecards.

## CAP-files-and-attachments-27 Upload a local file into a web page (browser agent)

The browser agent attaches a local file to a page upload field under approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (with Chrome); Claude in Chrome: yes**
  - [https://code.claude.com/docs/en/chrome.md](https://code.claude.com/docs/en/chrome.md): Attaches local files to page upload fields; limited to 10 MB total, needs Read permission, refuses credential-named files (.env, .pem, .key, .ssh). [2026-11-22] Apps: cli, chrome.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 114 (Browser tasks)). If the browser agent can upload a file, it asks first, names the file, caps the size and refuses secret files.

**With different models, providers and the one subscription.** Runs on the device through the extension; permission is per site and not tied to a model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome has per-site download and upload permission (DP40 partial). CLI browser tool has no upload (C150). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C150, DP40
- Code: `apps/extension/src (per comparison DP40)`

**Gap.** CLI upload missing; size and secret-file rules not compared.

**Acceptance criteria**

1. Agent asks before attaching a file to a page.
2. A file over the cap is refused with the cap named.
3. A .env file is refused.

**Verification: not verified.** Comparison rows only.

## CAP-files-and-attachments-28 Share sheet and system hand-off to the app

Send photos, PDFs and text from other apps into the chat from the phone.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI has it; the catalogue does not show it for the leaders). The phone app accepts items shared from other apps and puts them in a draft with a model and retention note.

**With different models, providers and the one subscription.** Shared items follow the same type and size rules and the same Local versus Cloud rule.

**Current implementation, as this trace read it on 2026-11-24: built.** iOS share extension and Android SEND targets exist. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: comparison-mobile row 'Share sheet: send text, images and PDFs to the app' (no id)
- Code: `apps/mobile/native/ios/AGIShareExtension`

**Gap.** none known

**Acceptance criteria**

1. Share a PDF from Files into the app and see it as a chip in a new draft.
2. Shared item in Local mode stays on device.

**Verification: code inspected only.** Comparison row only.

## CAP-files-and-attachments-29 Local mode attachments

Attaching files and images when the chat runs on the device with no account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md Local mode means (local files remain local; no hidden cloud call); AGENTS.md section 6). In Local mode files stay on the device, are read by on-device code and models only, and nothing is uploaded. A move to cloud is an explicit fork with consent and a provider label.

**With different models, providers and the one subscription.** Free and local on mobile and desktop, sign-in separate from payment. Types and sizes allowed depend on the on-device model; the composer says what it can read.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: note says on-device models read text in photos, not the picture; the File card opens the picker for Cloud chats only. Local library picks come from local conversations. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.34
- Comparison list ids: none matched; rows without an id: comparison-mobile row 'Attach files' (no id)
- Code: `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:130,368-389,741`

**Gap.** Local file reading on mobile, and Local attach behaviour on desktop, web and CLI, not established.

**Acceptance criteria**

1. In Local mode attach a text file and the on-device model reads it with no network.
2. A file type the model cannot read says so and offers a deliberate move to Cloud.
3. Network log shows no upload.

**Verification: not verified.** No Local-mode run.

## CAP-files-and-attachments-30 Retention and privacy note for attached files

The composer says whether and how long attached files are kept.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude; Claude Code: partly**
  - [https://code.claude.com/docs/en/claude-directory.md](https://code.claude.com/docs/en/claude-directory.md): Claude Code: files and phone photos attached to a Remote Control session are saved under ~/.claude/uploads; cloud-session attachments stay in the cloud environment; transcripts, pastes and uploads are deleted after a set age (default 30). [2026-11-22] Apps: cli.
  - [https://support.claude.com/en/articles/13346720-export-your-organization-s-data](https://support.claude.com/en/articles/13346720-export-your-organization-s-data): Member self-export excludes uploaded file contents. [2026-11-22] Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Temporary Chat uploads are not saved. [2026-11-22] Plans: Plus, Pro, Business. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md 9.4 Files (storage location, provider-upload status, deletion behavior)). Every attach surface states where the file goes and how long it is kept; Cloud, Local and temporary chats differ and are labelled.

**With different models, providers and the one subscription.** The note names the provider route when a third party receives the file.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile, Chrome done; CLI and VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S14.34
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:670`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:461`

**Gap.** No note in CLI or VS Code.

**Acceptance criteria**

1. Open the plus menu and read the retention line.
2. In a temporary chat the note says the file is not saved.
3. In Local mode the note says it stays on the device.

**Verification: code inspected only.** Not in scorecards.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to accept video attachments (only ChatGPT documents it, with incomplete analysis).
- Whether to add audio attach with transcription on paid plans (only ChatGPT documents it) and whether Free gets it.
- Whether Library should browse connected storage (Drive, OneDrive, Box, Dropbox) or only attach from it in chat.
- Whether to match ChatGPT's folders, favorites and Space-style shared files in Library, which Claude does not document.
- Whether the mobile per-message limit should match the web paid limit or stay at 25 MB.
- Whether to accept ODT, RTF, EPUB and ODS, which both leaders list.
- Whether the Library should have a Shared-with-you view, given Claude has no documented Library.
- Whether Local mode on desktop and mobile may read office files and PDFs, or only text and photos.

## Could not establish

- Claude per-plan upload counts and any Claude Library or storage quota: the catalogue shows none.
- Whether Claude has audio, video, camera scan or long-paste-to-attachment: not in the catalogue.
- The 512 MB versus 500 MB and 20 versus 25 file figures come from separate pages dated differently; the catalogue does not say which is newer.
- The Library article's catalogue line for the per-file limits has a truncated url in one entry; the article url was taken from the matching line.
- Local-mode file reading on desktop, web and CLI.
- Ledger cells with no status for web, desktop or mobile (for example S24.01) were not treated as done.
- Ledger and comparison disagree on web screenshot capture and mobile paste or drag; code was not rerun.
- Nothing on mobile, desktop, CLI, VS Code or Chrome has been seen by a person; the scorecards cover web only, and the web scorecard covered attach, remove, project upload and file creation only.

---
id: "F027-10"
type: "feature"
title: "Page layout, print, templates, brand and citations"
aliases: ["Page layout", "Print view", "New from template", "Save as template", "Apply brand voice", "Brand kit", "Templates and brands", "Citations", "S27.30 to S27.34"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S27.30", "S27.31", "S27.32", "S27.33", "S27.34"]
depends_on: ["surface:web", "mode:cloud", "table:studio_library_items", "api:GET /api/artifacts/library", "api:POST /api/artifacts/library", "F027-08", "F027-11", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-10 Page layout, print, templates, brand and citations

Web lets a person start a document or deck from built-in or saved templates, save a document as a template, and rewrite a document in a saved brand's voice. There is no page layout view, no print view for documents, and no citation or bibliography tool for documents. Other apps have none of these. Citations were decided out of scope.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.30](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2730), [S27.31](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2731), [S27.32](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2732), [S27.33](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2733), [S27.34](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2734).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers starting points (templates), reusable house voice and look (brands) and, as required by the brief, would offer page layout, print and citations. In the code today: 'New from template' creates a document or deck in the open conversation; 'Save as template' stores the current document; a saved brand's voice can be applied by asking the assistant to rewrite; a brand's colours and fonts apply to decks.

**Why it exists.** People write the same kinds of documents again and again and want consistent wording and look. Gemini and Claude documents start from templates and edit in place (doc: docs/decisions/2026-09-27-founder-decisions.md:301-306).

**Who uses it.** Professionals and teams who write meeting notes, briefs, updates, press releases and decks on the web app.

**Problems it solves**

- Starting from a blank page
- Re-typing the same structure
- Keeping one house voice across documents

**Use cases**

- Open 'New from template' and pick Meeting notes.
- Write a good brief, choose 'Save as template', and reuse it next week.
- Save a brand with voice 'plain and warm' and apply it to a draft.
- Apply a saved brand's colours to a deck from the deck Theme menu.

## 2. User experience

**Where to find it**

- Web (and the Electron window): side panel header button 'New from template' (apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:14, mounted at ArtifactsPanel.tsx:728). Menu groups: 'Documents', 'Presentations', 'Your templates', 'Saved' (item 'Templates and brands') and 'Designs' (item 'Design from a brief') (NewArtifactMenu.tsx:61-95).
- Web More menu: 'Save as template' under the group 'Keep' (markdown documents and decks only) and, under the group 'Apply brand voice', one item per saved brand name (ArtifactPreview.tsx:2437-2495).
- Mobile, CLI, VS Code: none found. Chrome: unknown (brief says partial; nothing found). Tauri desktop: the 'New from template' menu is a web component; not found in the Tauri code searched.

**Before you start**

- 'New from template' needs an open conversation to hold the new artifact; otherwise the menu is hidden (NewArtifactMenu.tsx:55, 59).
- Saving a template or brand needs a signed-in account (library routes use a user-scoped database) [inferred from route file]; the dialogs call the account API (studio-library-client.ts).
- 'Apply brand voice' needs at least one saved brand and the latest version of a text document (ArtifactPreview.tsx:2473).

**Screens and controls**

- Built-in documents: Blank document, Meeting notes, Project brief, Product requirements, Weekly update, Research summary, Blog post, Press release. Built-in decks: Pitch deck, Project update, Lesson (templates/artifact-templates.ts:17-310). The placeholder {{date}} is filled with today's date (artifact-templates.ts fillTemplate).
- Save-as-template dialog (SaveTemplateDialog, library/LibraryDialogs.tsx:36); brand dialog (BrandKitDialog, :111) with background, text, accent colours, heading and body font (sans, serif or mono) and a voice text up to 2,000 characters (packages/contracts/cloud-contracts/src/studio-library.ts:20-34); manager dialog (LibraryManagerDialog, :250).
- Page layout and print: no control exists for documents.

**Journey**

1. 1. Create: press 'New from template', pick an item; the new artifact opens in the panel.
2. 2. Keep: choose 'Save as template' in More, name it, save; it appears under 'Your templates'.
3. 3. Brand: open 'Templates and brands', save a brand; in a document More menu pick the brand name under 'Apply brand voice'.
4. 4. The brand request is sent to chat; the assistant's rewrite arrives as a new version.

**What the person sees and gets**

- New artifact is selected in the panel (NewArtifactMenu.tsx:21-33).
- If the brand request cannot be sent: toast 'The change request was not sent. Try again.' (ArtifactPreview.tsx:2484-2487).
- Library load failure state 'failed' in the client (studio-library-client.ts:44-58).

**Settings**

- Saved templates and brands are the only configuration; they are account data.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: built-in and saved templates create a new document or deck (NewArtifactMenu.tsx:21-45; tests NewArtifactMenu.test.tsx:25-42).
- Web: Save as template posts a document_template or deck_template to /api/artifacts/library (ArtifactPreview.tsx:3351-3358; studio-library-client.ts:61-75; apps/web/app/api/artifacts/library/route.ts).
- Web: brand voice request (library/brand-request.ts:4-15; test library/ArtifactPreview.brand.test.tsx:55) and brand theme for decks (ArtifactPreview.tsx:593-607, 1960; test :74).

**Incomplete**

- A brand's colours and fonts apply to decks only; for documents only the voice text is used (brand-request.ts uses brand.voice only).
- Applying a brand to a document asks the assistant to reword; it does not restyle fonts or colours.
- Citation chips exist for answer citations in chat markdown (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:936) but not as a bibliography for documents.

**Present but disconnected or switched off**

- Server routes for Google Docs, Drive and OneDrive saves are covered under F027-11, not here.

**Not available**

- Page-layout view (S27.30): no code found.
- Print view for documents (S27.31): window.print is used only for study sets, conversations and recipe cards (apps/web/features/chat/components/artifacts/study/study-print.ts:67; apps/web/features/chat/lib/print-conversation.ts:26; apps/web/features/chat/components/cards/RecipeCard.tsx:31). A global print stylesheet exists at apps/web/app/globals.css:1862; its effect on artifacts was not read.
- Citation management (S27.34): recorded as not built by decision (doc: docs/decisions/2026-09-27-founder-decisions.md:119-122).
- Templates on mobile, CLI, VS Code: none found.

## 4. Required behaviour

**Established requirements**

- The document can be shown in a page-layout view (S27.30); has a print view or action (S27.31); can start from a chosen template (S27.32); a saved brand or house style can be applied (S27.33); citations and a bibliography can be managed (S27.34). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.30, S27.31, S27.32, S27.33, S27.34)
- Dedicated artifact editors including citation management (S27.34) are not built because ChatGPT Canvas and Claude artifacts change files by prompt. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:119-122)
- Document templates get direct editing. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:301-306)
- A template saves a title and content of up to 200,000 characters; a name up to 120 characters. (source: packages/contracts/cloud-contracts/src/studio-library.ts:15-32; apps/web/db/neon/0373_studio_library_items.sql)

**Acceptance criteria**

1. 'New from template' lists 8 document and 3 presentation built-ins plus saved templates.
2. Choosing a template creates a new artifact in the open conversation and selects it; {{date}} is replaced.
3. The menu is hidden when there is no open conversation.
4. 'Save as template' adds an entry under 'Your templates'.
5. A saved brand appears under 'Apply brand voice' for text documents on the latest version and sends a rewrite request using the brand voice.
6. Another account does not see the template (row-level security).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Print for documents could reuse the browser print path used elsewhere [inferred].
- Mobile is expected to stay without templates, following the phone-file decision (doc: docs/decisions/2026-09-27-founder-decisions.md:285-289) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief: S27.32 'start from template' and S27.33 'brand' are built on web.
- [proposed] Add a print stylesheet or 'Print' action for documents if page layout stays in scope.
- [proposed] Apply brand fonts and colours to documents on export.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | NewArtifactMenu | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx` | New from template menu and create-from-template hook. |
| service | artifact-templates | `apps/web/features/chat/components/artifacts/templates/artifact-templates.ts` | Built-in templates and date placeholder. |
| component | LibraryDialogs | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | SaveTemplateDialog, BrandKitDialog, LibraryManagerDialog. |
| service | studio-library-client | `apps/web/features/chat/components/artifacts/library/studio-library-client.ts` | Loads and saves library items through the account API. |
| service | brand-request | `apps/web/features/chat/components/artifacts/library/brand-request.ts` | Builds the rewrite request from a brand voice. |
| component | ArtifactPreview menu wiring | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Save as template (2437), Apply brand voice (2473), dialogs (3351-3368). |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Mounts the New from template menu (728). |
| endpoint | /api/artifacts/library | `apps/web/app/api/artifacts/library/route.ts` | List and create library items; CSRF and rate limit class 'chat-conversation'; item route in [itemId]/route.ts. |
| schema | studio library contracts | `packages/contracts/cloud-contracts/src/studio-library.ts` | Kinds, template and brand payload limits. |
| table | studio_library_items | `apps/web/db/neon/0373_studio_library_items.sql` | Saved templates and brands; RLS per account. |
| service | deck-themes brandThemeMeta | `apps/web/features/chat/components/artifacts/presentation/deck-themes.ts` | Turns a brand into deck theme meta. |
| component | study-print | `apps/web/features/chat/components/artifacts/study/study-print.ts` | The only artifact print path found (study sets). |
| component | MarkdownContent citations | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Citation chips for answers (936), not for documents. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens 'New from template'; the saved list is loaded from the account on first open. | device and our servers | NewArtifactMenu.tsx:98-108; studio-library-client.ts:44-58 |
| A choice creates an artifact locally with the template text and today's date. | device | NewArtifactMenu.tsx:21-35; artifact-templates.ts |
| 'Save as template' posts name, title and content to the library API, which stores a row for the account. | our servers | studio-library-client.ts:61-75; apps/web/app/api/artifacts/library/route.ts:37-40 |
| 'Apply brand voice' sends a rewrite request to chat; the model returns the full document. | device and our servers | ArtifactPreview.tsx:2479-2490; library/brand-request.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved template (title, content) or brand (colours, fonts, voice) | table studio_library_items | Account-level; loaded on demand to any web session | Removed from the manager dialog [item route exists, methods not read]; account erasure handling for this table: unknown. |

**Models and providers.** Templates and saving use no model. Brand voice application is a chat turn on the current model and provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Creating from a built-in template works without the library; saving and listing library items uses the account API. |
| Permissions | Row-level security per account (0373). |
| Subscription | none found in the code for templates or brands (library route checks CSRF and rate limit only: route.ts:22-40). |
| Limits and metering | Name up to 120 characters; template content up to 200,000; voice up to 2,000 (studio-library.ts). Number of saved items: no limit found. |
| Feature flags | none found in the code. |
| Model compatibility | Brand voice rewrite depends on the chat model following the reply format. |
| Provider restrictions | none found in the code. |
| Local mode | Creating from built-in templates works on the device. Saved templates and brands live on our servers; behaviour for Local-only use: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No open conversation | New from template hidden | NewArtifactMenu.tsx:59 |
| Library load fails | Client state 'failed'; saved items not shown | studio-library-client.ts:53-58 |
| Save fails | Error 'That was not saved' | studio-library-client.ts:61-72 |
| Brand request not sent | Toast 'The change request was not sent. Try again.' | ArtifactPreview.tsx:2484-2487 |
| Brand has no voice | Uses 'clear, confident and plain' | brand-request.ts:10-12 |
| Older version or non-text document | Brand voice and Save as template items not offered | ArtifactPreview.tsx:2437, 2473 |
| Print, page layout, offline, retry | not handled in the code for documents (no control). | No print or layout control in ArtifactPreview.tsx menus (2325-2495); window.print found only in study-print.ts:67, print-conversation.ts:26, RecipeCard.tsx:31 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.test.tsx`: Date placeholder, deck templates parse, creating a document and a presentation, hidden without a conversation.
- `apps/web/features/chat/components/artifacts/library/ArtifactPreview.brand.test.tsx`: Rewriting a document in a brand voice; applying a brand to a deck from the Theme menu.
- `apps/web/features/chat/components/artifacts/library/LibraryDialogs.test.tsx`: Library dialogs; cases not read.
- `apps/web/app/api/artifacts/library/route.test.ts`: Library API; cases not read.

**Test scenarios**

- **Create from template**
  1. Open a conversation and the artifact panel.
  2. Press 'New from template' and pick 'Meeting notes'.
  - Expected: A document titled Meeting notes opens with today's date filled in.
- **Save and reuse**
  1. Open a document, More then 'Save as template', save.
  2. Open 'New from template'.
  - Expected: The new template is listed under 'Your templates' and creates a copy.
- **Brand voice**
  1. Save a brand with a voice.
  2. Open a text document on its latest version, More then the brand name under 'Apply brand voice'.
  - Expected: A chat message asking for a rewrite in that house style is sent; no change until the reply.
- **No print control**
  1. Open any document and look through More and the header.
  - Expected: No Print or page-layout control (current behaviour).

**Where to look when it fails**

- Toast texts above.
- Table studio_library_items.
- API response error messages surfaced by studio-library-client.ts:36-42.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No page-layout view and no print action for documents.** Affects: All apps. Evidence: No code found; print exists only for study sets, conversations and recipes. Work needed: Decide scope; then add print stylesheet or export-first path.
- **No citation or bibliography tool.** Affects: All apps. Evidence: docs/decisions/2026-09-27-founder-decisions.md:119-122. Work needed: None unless the decision changes.
- **Brand fonts and colours do not apply to documents; only voice does.** Affects: Web users. Evidence: library/brand-request.ts. Work needed: Apply brand to document export or preview if wanted.
- **Brief says 'start from template' is missing; it is built on web.** Affects: Docs. Evidence: NewArtifactMenu.tsx:14. Work needed: Update the brief.
- **No templates on mobile, CLI, VS Code; Chrome unknown.** Affects: Those apps. Evidence: No code found. Work needed: Decide scope.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- mode:cloud
- table:studio_library_items
- api:GET /api/artifacts/library
- api:POST /api/artifacts/library
- F027-08
- F027-11
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations

## Unknown

- Effect of the global print stylesheet (apps/web/app/globals.css:1862) on artifacts.
- Methods of the library item route and whether saved items can be renamed or deleted from the manager dialog.
- Whether account erasure covers studio_library_items.
- Whether Chrome has any related feature (brief says partial; nothing found).
- Whether Tauri desktop offers templates.

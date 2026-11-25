---
id: "F032-08"
type: "feature"
title: "Design system and brand library"
aliases: ["Design system and brand library", "Templates and brands", "Studio library", "Brand kit", "New brand", "Apply brand voice", "S32.21 to S32.25"]
area: "32 Design workspace"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.21", "S32.22", "S32.23", "S32.24", "S32.25"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "table:studio_library_items", "api:GET /api/artifacts/library", "api:POST /api/artifacts/library", "api:DELETE /api/artifacts/library/[itemId]", "file:packages/contracts/cloud-contracts/src/studio-library.ts", "F032-07", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-authentication-and-identity", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-08 Design system and brand library

Web has a saved library of templates and brands (colours, two font choices, a voice note) that applies to decks and text documents only. Importing a design system, a component library, token mapping and conformance feedback for HTML designs are not built in any app.

Area: [32. Design workspace](README.md). Requirement items: [S32.21](../../10-requirements/capabilities/032-design-workspace.md#s3221), [S32.22](../../10-requirements/capabilities/032-design-workspace.md#s3222), [S32.23](../../10-requirements/capabilities/032-design-workspace.md#s3223), [S32.24](../../10-requirements/capabilities/032-design-workspace.md#s3224), [S32.25](../../10-requirements/capabilities/032-design-workspace.md#s3225).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Today the Web side panel keeps per-account templates and brand kits. A brand holds background, text and accent colours, heading and body font family (sans, serif, mono) and a voice note. A brand can theme a deck or rewrite a document in its voice. (packages/contracts/cloud-contracts/src/studio-library.ts:25-33; ArtifactPreview.tsx:600-607,2473-2490)

**Why it exists.** Migration 0373 says documents or decks could not be kept to start new ones from, and there was nowhere to keep a brand's colours, fonts and voice. (apps/web/db/neon/0373_studio_library_items.sql:4-6) The brief items S32.21 to S32.25 ask for design-system import, brand assets, reusable components, token mapping and conformance feedback for designs. (doc: knowledge-base/data/area-briefs/032-design-workspace.md)

**Who uses it.** A signed-in Web or Desktop-window user who makes decks and documents in house style. Nobody can yet use it for HTML designs.

**Problems it solves**

- Re-typing brand colours and tone on every deck.
- Starting a new document from a saved layout.
- Warning when a chosen text colour is too faint on the background.

**Use cases**

- Save a brand named after a company and apply it to a deck from the Theme menu.
- Press a saved brand under Apply brand voice to rewrite a document in that tone.
- Save a finished deck as a template and start the next one from New from template.
- Delete an old brand in Templates and brands.

## 2. User experience

**Where to find it**

- Web side panel header: New from template menu, item Templates and brands (templates/NewArtifactMenu.tsx:14,79).
- Deck panel: Theme menu, New brand (ArtifactPreview.tsx:1963; LibraryDialogs.tsx:276).
- Document more menu: group Apply brand voice listing saved brands (ArtifactPreview.tsx:2474-2490).
- Document or deck more menu: Save as template (ArtifactPreview.tsx:2440-2441).
- Same menu entry New from template also holds Design from a brief (NewArtifactMenu.tsx:88).
- Desktop window: inherits web [inferred from ARCHITECTURE.md:51]. Mobile, Chrome, VS Code, CLI: nothing found.

**Before you start**

- Signed-in account (route uses the user-scoped database).
- The panel loads the library only for presentation and document artifacts (ArtifactPreview.tsx:610-614).

**Screens and controls**

- Dialog New brand: Brand name, three colour pickers (background, text, accent), Heading font and Body font selects, Voice textarea, Save brand (LibraryDialogs.tsx:111-240).
- Dialog Save as template: Template name, Save template (LibraryDialogs.tsx:36-100).
- Dialog Templates and brands: groups Document templates, Deck templates, Brands with a delete icon each; delete asks to confirm (LibraryDialogs.tsx:250-320).

**Journey**

1. Open a deck and its Theme menu, press New brand.
2. Fill the name, colours, fonts and voice; read the contrast note if shown.
3. Press Save brand; a toast says 'Saved the <name> brand' and the brand is applied to the deck.
4. Later, in a document, open the more menu and pick the brand under Apply brand voice.
5. The assistant receives a request to rewrite wording and tone; the new version appears when it answers.

**What the person sees and gets**

- Toast 'Saved as a template. Find it under New from template.'
- Contrast note: 'The text colour is too faint on this background (n:1), so decks use a readable one instead.' (LibraryDialogs.tsx:224-228)
- Empty library text: 'Nothing saved yet...' (LibraryDialogs.tsx:276).

**Settings**

- None found. Limit is 100 items per kind (studio-library-service.ts:10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create, list and delete templates and brands through the API with CSRF, validation (hex colours, font names, name up to 120 characters) and a 100 per kind cap. (apps/web/app/api/artifacts/library/route.ts:21-61; studio-library.ts:19-53)
- Brand colours theme decks with an automatic readable-colour fallback (LibraryDialogs.tsx:70-73 via deck-themes).
- Applying a brand to a document sends only the voice text as an edit request (library/brand-request.ts:4-15).
- Library in account export and erasure (user/export/route.ts:2281; account-erasure.ts:51).

**Incomplete**

- Brand fonts and colours do not reach documents; only the voice does (brand-request.ts:9-13).
- Brand apply is limited to text documents and decks: the menu group requires isTextDocument and the library loads only for presentation or document (ArtifactPreview.tsx:610-614,2473).

**Present but disconnected or switched off**

- none found in this feature beyond the above.

**Not available**

- Design-system import (tokens, components, guidelines) in every app.
- Reusable component library inserted into designs.
- Mapping design values to named tokens, visible or editable.
- Conformance feedback against a design system.
- Brand logos and imagery assets (the brand payload has colours, fonts, voice only).
- Any of these on Mobile, Chrome, VS Code, CLI or the Tauri desktop. A search of web features, app, lib, unified-chat and contracts for design-system, token or conformance terms returned only unrelated files.

## 4. Required behaviour

**Established requirements**

- The user imports a design system (tokens, components, guidelines) that designs then use (S32.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.21)
- A library holds brand assets (logos, colors, fonts, imagery) reusable across designs (S32.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.22)
- A library of reusable components can be inserted into designs (S32.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.23)
- Design values map to named tokens and the mapping is visible and editable (S32.24). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.24)
- The workspace flags where a design departs from the imported design system (S32.25). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.25)
- The design workspace has a layers/assets/files panel and AGI-owned interaction and visual design, not copied assets. (source: docs/product/requirements.md:1474-1500)
- Do not hardcode values the repository models; one design system for AGI's own UI. (source: AGENTS.md section 4; docs/product/experience-contract.md:138 (this concerns AGI's own UI, not user design systems))

**Acceptance criteria**

1. A saved brand appears in Templates and brands and survives reload.
2. Saving the 101st item of one kind is refused.
3. A brand with a non-hex colour is refused by the API.
4. Applying a saved brand to a document sends a request naming the brand and its voice.
5. Another account cannot list or delete the item.
6. An HTML design can be given a brand or design system [proposed; not met].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brand library is the nearest base for logos and tokens, since it already has a validated payload, table and dialogs. [inferred]

**Proposed improvements** (suggestions, not requirements)

- Extend the brand payload with logo and image assets and tokens, and let HTML designs consume them.
- Add a token table view and a conformance check that scans a design for off-palette values.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LibraryDialogs (SaveTemplateDialog, BrandKitDialog, LibraryManagerDialog) | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | Dialogs to save, create and delete. |
| service | studio-library-client | `apps/web/features/chat/components/artifacts/library/studio-library-client.ts` | Load, save, delete, shared store hook. |
| other | buildApplyBrandRequest | `apps/web/features/chat/components/artifacts/library/brand-request.ts` | Prompt that rewrites a document in a brand voice. |
| component | NewArtifactMenu | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx` | New from template menu, saved templates, Templates and brands, Design from a brief. |
| component | ArtifactPreview (library wiring) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | savedBrands, brandThemes, Apply brand voice items, Save as template, BrandKitDialog mount. |
| other | deck-themes | `apps/web/features/chat/components/artifacts/presentation/deck-themes.ts` | brandThemeMeta, resolveDeckTheme and contrastRatio (imported by LibraryDialogs.tsx:15-21; file body not opened). |
| endpoint | GET and POST /api/artifacts/library | `apps/web/app/api/artifacts/library/route.ts` | List by kind and create. |
| endpoint | DELETE /api/artifacts/library/[itemId] | `apps/web/app/api/artifacts/library/[itemId]/route.ts` | Delete one item (file head read only). |
| service | studio-library-service | `apps/web/lib/services/studio-library-service.ts` | SQL and the 100 per kind cap. |
| schema | studio-library contract | `packages/contracts/cloud-contracts/src/studio-library.ts` | Kinds, template and brand payload schemas, paths. |
| table | studio_library_items | `apps/web/db/neon/0373_studio_library_items.sql` | Table with row-level security. |
| other | design-brief | `apps/web/features/chat/components/artifacts/design/design-brief.ts` | Nearest design input: format, goal, audience, style, content, layout stored in an HTML comment. Not a design system. |
| other | design tokens of the product | `packages/ui/design-tokens/src/foundation.css` | AGI's own UI tokens; not a user design-system import. |
| job | account export and erasure | `apps/web/lib/server/account-erasure.ts` | Removes studio_library_items with the account. |
| test | library tests | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.test.tsx` | Dialog behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the brand dialog; the page previews the resolved theme and contrast. | device | LibraryDialogs.tsx:70-73,224-228 |
| Client POSTs the item with CSRF. | device and our servers | studio-library-client.ts:67-80 |
| Route validates with the contract schema and inserts, refusing past 100 per kind. | our servers | library/route.ts:36-58; studio-library-service.ts:73 |
| Apply brand voice builds a rewrite prompt and sends it to the chat as an edit request. | device and our servers | ArtifactPreview.tsx:2483; brand-request.ts:4-15 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Template (title, content up to 200000 characters) or brand (colours, fonts, voice) | table studio_library_items in our database | Read from the server by every Web client; not stored on the device. | Deleted by the owner (confirm dialog) or with the account; retention matrix says no maximum (docs/architecture/RETENTION_MATRIX.md:227). |

**Models and providers.** Library storage uses no model. Apply brand voice runs a normal chat turn on the selected model and provider; the library code names none. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required (user-scoped database). |
| Permissions | Owner only through row-level security (0373). |
| Subscription | none found in the code. |
| Limits and metering | 100 items per kind; rate limit chat-conversation. No metering found. |
| Feature flags | none found in the code. |
| Model compatibility | Storage is model independent; voice rewrite works with any chat model [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | No local store for brands or templates was found; the library needs sign-in and our server. Mobile and local-only use cannot reach it. Unknown whether Local-mode Desktop shows it. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| load failure | Dialog text 'Your templates could not be loaded.' | LibraryDialogs.tsx:270-274 |
| empty | 'Nothing saved yet...' guidance. | LibraryDialogs.tsx:276 |
| save failure | Toast 'The brand was not saved' or 'The template was not saved'. | LibraryDialogs.tsx:54-56,134-135 |
| cap | 409 'You can keep at most 100 of these.' | studio-library-service.ts:28-31; library/route.ts:55 |
| faint text colour | Saved as entered; decks use a readable colour instead. | LibraryDialogs.tsx:224-228 |
| delete | Confirmation names that it is removed for good; documents already made keep content. | LibraryDialogs.tsx:300-312 |
| offline, retry, timeout | not handled in the code beyond a failed state with no retry button in the library dialog. | studio-library-client.ts:62-64 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/library/LibraryDialogs.test.tsx`: Save deck as template, contrast warning still saves, start from saved template, delete after confirm.
- `apps/web/features/chat/components/artifacts/library/ArtifactPreview.brand.test.tsx`: Rewrite document in brand voice; apply brand to a deck from Theme menu.
- `apps/web/app/api/artifacts/library/route.test.ts`: List by kind, unknown kind, CSRF create, non-hex colour refused, cap, owner-only delete.
- `apps/web/features/chat/components/artifacts/design/DesignBrief.test.tsx`: Design brief request and read-back (nearest design input).

**Test scenarios**

- **Save and apply a brand to a deck**
  1. Open a deck, Theme, New brand.
  2. Enter name and colours, Save brand.
  - Expected: Toast confirms and the deck uses the brand colours.
- **Brand does not reach an HTML design**
  1. Open an HTML design.
  2. Open the more menu.
  - Expected: No Apply brand voice group and no brand control (documents the gap).
- **Cap**
  1. Create 100 brands through the API.
  2. Create one more.
  - Expected: 409 conflict.
- **Bad colour**
  1. POST a brand with colour 'red'.
  - Expected: Validation error.
- **Cross-account delete**
  1. Create item as A.
  2. DELETE as B.
  - Expected: Not found; item remains.

**Where to look when it fails**

- Toasts named above.
- StudioLibraryLimitError.
- Table studio_library_items; kind and payload columns.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- Desktop: [70-qa/test-plans/desktop/032-design-workspace.md](../../70-qa/test-plans/desktop/032-design-workspace.md)

## 10. Gaps and dependencies

- **No design-system import, component library, token mapping or conformance feedback.** Affects: All apps; HTML design users.. Evidence: no code found; brief S32.21-S32.25. Work needed: Define a design-system payload, import path, token view and a checker.
- **Brand does not apply to HTML designs and carries no logos or imagery.** Affects: Web users making designs.. Evidence: ArtifactPreview.tsx:2473; studio-library.ts:25-33. Work needed: Extend payload and wire brand into design requests.
- **Document brand apply ignores brand colours and fonts.** Affects: Web users.. Evidence: brand-request.ts:9-13. Work needed: Pass them in the request or style the document.
- **Library is web-only and cloud-only.** Affects: Mobile, Chrome, VS Code, CLI, local use.. Evidence: no other app references STUDIO_LIBRARY_PATH. Work needed: Decide per-surface scope.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- table:studio_library_items
- api:GET /api/artifacts/library
- api:POST /api/artifacts/library
- api:DELETE /api/artifacts/library/[itemId]
- file:packages/contracts/cloud-contracts/src/studio-library.ts
- F032-07
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-authentication-and-identity
- SYS-data-model-and-migrations

## Unknown

- Whether Local-mode Desktop (Tauri) exposes any library.
- Contents of deck-themes.ts and DELETE route beyond the head.
- Whether product plans intend design-system import before the 2027 sales window (no document found).

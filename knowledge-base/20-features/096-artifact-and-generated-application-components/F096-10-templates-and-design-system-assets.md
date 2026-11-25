---
id: "F096-10"
type: "feature"
title: "Templates and design-system assets"
aliases: ["Template registry (S96.27)", "Design-system asset registry (S96.28)", "Studio library", "New from template", "Save as template", "Brand kit", "Templates and brands", "studio_library_items"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.27", "S96.28"]
depends_on: ["F096-09", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-authentication-and-identity", "surface:web", "table:studio_library_items"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-10 Templates and design-system assets

The brief calls both a template registry and a design-system asset registry missing. On the web there is a smaller per-account version: built-in document and deck templates, saved templates, and saved brand kits (three colours, two fonts, a voice note). There are no shared company registries and no logos or font files.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.27](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9627), [S96.28](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9628).

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

**What it does.** Lets a web user start a document or presentation from a built-in or saved template, save a document or deck as a template, and save brand kits that restyle decks. Items are stored per account in studio_library_items (apps/web/db/neon/0373_studio_library_items.sql:19, apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:14).

**Why it exists.** Migration 0373 says a document or deck could not be kept to start new ones from, and there was nowhere to keep a brand's colours, fonts and voice (apps/web/db/neon/0373_studio_library_items.sql:3-9).

**Who uses it.** Web users who write documents and decks and want repeatable starts or a consistent look.

**Problems it solves**

- Starting from a blank page every time.
- Re-entering brand colours and fonts.
- Keeping house style across decks.

**Use cases**

- Start a 'Meeting notes' document from a built-in template.
- Save a finished board deck as 'Board' and start the next one from it.
- Create a brand with accent colour and serif headings and apply it to a deck.
- Delete an old saved template.

## 2. User experience

**Where to find it**

- Web artifact panel: menu 'New from template' with groups 'Documents', 'Presentations', 'Your templates' and an item 'Templates and brands' (apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:14,76-79).
- Web artifact menu item 'Save as template' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2441).
- Brand kit dialog from a deck ('New brand') (apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:111; empty-state text at :276).
- Other apps: not found in the code searched; unknown.

**Before you start**

- Web, signed in, and an open conversation (the menu returns nothing without a conversation id) (apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:58).
- To save, a document or presentation artifact.

**Screens and controls**

- Dialog 'Save as template' with a name field and save button (apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:77).
- Brand kit dialog with colours, fonts and a voice note, limited to the fields in the schema (packages/contracts/cloud-contracts/src/studio-library.ts:25-32).
- Library manager dialog titled via 'Templates and brands' listing saved items with delete (apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:250).

**Journey**

1. Open the artifact panel in a chat.
2. Choose 'New from template' and pick a built-in or saved template; a new artifact opens with its content.
3. Edit it.
4. Choose 'Save as template', name it, save; toast says 'Saved as a template. Find it under New from template.'
5. In a deck, create a brand and apply it as a theme.

**What the person sees and gets**

- Toast success 'Saved as a template. Find it under New from template.' and error 'The template was not saved' (apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:64-67).
- Limit error becomes a conflict message when 100 items of a kind exist (apps/web/lib/services/studio-library-service.ts:73).
- Brand themes appear beside the built-in deck themes (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:600-607).

**Settings**

- None besides the saved items. The 100 per kind limit is a code constant.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Built-in templates in a static client list: documents (blank, meeting notes, project brief, product requirements, weekly update, research summary, blog post, press release) and a presentation 'Pitch deck' (apps/web/features/chat/components/artifacts/templates/artifact-templates.ts:17-206).
- Saved items API: api:GET and api:POST /api/artifacts/library with kind filter, CSRF, rate limit, validation and a 100-per-kind limit; api: DELETE on /api/artifacts/library/[itemId] (apps/web/app/api/artifacts/library/route.ts:60-61, apps/web/lib/services/studio-library-service.ts:10).
- Three kinds: document_template, deck_template, brand (packages/contracts/cloud-contracts/src/studio-library.ts:9).
- Template payload: title up to 200 characters and content up to 200,000 characters; brand payload: background, text and accent as #rrggbb, heading and body font from sans, serif, mono, and a voice up to 2,000 characters (packages/contracts/cloud-contracts/src/studio-library.ts:15-32).
- Rows are private to the account with forced row-level security (apps/web/db/neon/0373_studio_library_items.sql:30-38).
- Brand to deck theme conversion (apps/web/features/chat/components/artifacts/presentation/deck-themes.ts:112).

**Incomplete**

- Templates cover only documents and decks; no templates for html, react or other artifact kinds were found.

**Present but disconnected or switched off**

- nothing found

**Not available**

- A shared or workspace-wide template or brand registry: none found; rows belong to one user.
- Logos, font files or image assets: the brand schema has none (packages/contracts/cloud-contracts/src/studio-library.ts:25-32).
- Fonts beyond three families sans, serif, mono.
- Use by generated html or react apps as design tokens: no route or injection found.
- Desktop, mobile, CLI, VS Code, Chrome: not found in the code searched; unknown.

## 4. Required behaviour

**Established requirements**

- A registry serves artifact and app templates users can start from. (source: S96.27)
- A registry stores design-system assets (brand colours, fonts, logos) artifacts can use. (source: S96.28)
- Template documents edit in place like the leaders' template documents. (source: docs/decisions/2026-09-27-founder-decisions.md:303-304)

**Acceptance criteria**

1. Choosing a built-in template creates a new artifact in the open conversation with the template content.
2. Saving a template as 'Board' makes it appear under 'Your templates' after reload.
3. The 101st saved item of one kind returns a conflict.
4. A brand with a colour that is not #rrggbb is refused with a validation error.
5. User B cannot list or delete user A's saved items.
6. Deleting a saved item removes it from the menu.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'missing' rating refers to a platform-wide registry; the per-account library on web is a smaller form of it [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Define whether workspaces get shared templates and brands.
- [proposed] Add logo assets only after an asset storage owner is chosen.
- [proposed] Offer templates for html and react apps.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | studio_library_items | `apps/web/db/neon/0373_studio_library_items.sql` | Saved templates and brands with row-level security. |
| endpoint | GET/POST /api/artifacts/library | `apps/web/app/api/artifacts/library/route.ts` | List and create saved items. |
| endpoint | DELETE /api/artifacts/library/[itemId] | `apps/web/app/api/artifacts/library/[itemId]/route.ts` | Delete one saved item. |
| service | studio-library-service | `apps/web/lib/services/studio-library-service.ts` | List, create with 100 per kind limit, delete. |
| schema | Studio library schemas | `packages/contracts/cloud-contracts/src/studio-library.ts` | Kinds and payload limits. |
| store | studio-library-client | `apps/web/features/chat/components/artifacts/library/studio-library-client.ts` | Client store and fetch calls. |
| component | NewArtifactMenu | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx` | New from template menu and manager entry. |
| other | artifact-templates | `apps/web/features/chat/components/artifacts/templates/artifact-templates.ts` | Built-in templates list. |
| component | LibraryDialogs | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | Save as template, brand kit and manager dialogs. |
| service | deck-themes brandThemeMeta | `apps/web/features/chat/components/artifacts/presentation/deck-themes.ts` | Turns a brand into deck theme values. |
| service | brand-request | `apps/web/features/chat/components/artifacts/library/brand-request.ts` | Builds the request to apply a brand. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Hosts Save as template and brand themes. |
| test | library route test | `apps/web/app/api/artifacts/library/route.test.ts` | Route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks a template. The client creates a new artifact from its content in the artifact store. | device | apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:17-32 |
| To save a template or brand, the client posts to the library route with a CSRF header. | device and our servers | apps/web/features/chat/components/artifacts/library/studio-library-client.ts:1-50 |
| Server checks CSRF, rate limit, schema and the 100 per kind limit, then inserts the row under the account. | our servers | apps/web/app/api/artifacts/library/route.ts:33-58; apps/web/lib/services/studio-library-service.ts:65-80 |
| The menu lists built-in plus saved items; brand items become deck themes. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:593-607 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Name, kind and payload (template content or brand colours, fonts, voice) | table studio_library_items | Server only; every web session of the account sees it | Until deleted by the owner; no other deletion rule found |
| Built-in templates | Compiled into the web client | Shipped with the app | Changes with releases |

**Models and providers.** No model takes part. A separate 'design from brief' dialog sits in the same menu and does call chat, but it was not read; unknown (apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:8-9).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web account for saved items (rows keyed by user id). Built-in templates need only an open conversation. |
| Permissions | Rows are visible only to their owner (apps/web/db/neon/0373_studio_library_items.sql:34-38). |
| Subscription | none found in the code. |
| Limits and metering | 100 saved items per kind per account; template content up to 200,000 characters; name up to 120 characters (apps/web/lib/services/studio-library-service.ts:10; packages/contracts/cloud-contracts/src/studio-library.ts:15,35). Rate-limit bucket 'chat-conversation'. No metering. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Built-in templates are in the client and need no server. Saved items use our servers; whether the web app offers this in a Local mode is unknown. Other apps: not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No open conversation | The menu renders nothing. | apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:58 |
| Library loading or failed | Client store has idle, loading, ready and failed states; failed shows no saved items. | apps/web/features/chat/components/artifacts/library/studio-library-client.ts:30-45 |
| Empty library | Manager shows 'Nothing saved yet. Use Save as template on a document or deck, or New brand in a deck's ...' | apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:276 |
| Save fails | Toast 'The template was not saved' or the server message. | apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:67 |
| Limit reached | 409 conflict from StudioLibraryLimitError. | apps/web/app/api/artifacts/library/route.ts:53 |
| Offline | not handled in the code beyond the failed state. | apps/web/features/chat/components/artifacts/library/studio-library-client.ts:30-45 |
| Other apps | not found in the code searched. | No templates or brand code was found outside apps/web in the searches run. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/library/route.test.ts`: Saving deck and document templates behind the CSRF check.
- `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.test.tsx`: New from template menu.
- `apps/web/features/chat/components/artifacts/library/LibraryDialogs.test.tsx`: Save and brand dialogs.
- `apps/web/features/chat/components/artifacts/library/ArtifactPreview.brand.test.tsx`: Brand themes in the preview.

**Test scenarios**

- **Built-in template**
  1. Open a chat, open the artifact menu, choose 'New from template', pick 'Meeting notes'.
  - Expected: A new document artifact with the template text opens.
- **Save and reuse**
  1. Save the document as 'Board'.
  2. Reload and open 'New from template'.
  - Expected: 'Board' is under 'Your templates'.
- **Brand kit**
  1. Create a brand with three colours and a serif heading font.
  2. Apply it to a deck.
  - Expected: Deck uses the brand colours and fonts.
- **Limit**
  1. Create 100 saved templates then one more.
  - Expected: Conflict message; list stays at 100.
- **Isolation**
  1. Save an item as user A.
  2. List as user B.
  - Expected: User B sees nothing of A's.

**Where to look when it fails**

- HTTP 409 on create at the limit; 400 'Invalid library item'.
- Table studio_library_items.
- Toast 'The template was not saved'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief calls both registries missing; code has a per-account library and built-in list.** Affects: Planners and testers. Evidence: apps/web/app/api/artifacts/library/route.ts:60; apps/web/db/neon/0373_studio_library_items.sql:19. Work needed: Update brief status to partial.
- **No workspace-shared templates or brands.** Affects: Teams on web. Evidence: apps/web/db/neon/0373_studio_library_items.sql:34-38. Work needed: Product decision and an owner for sharing rules.
- **No logos or font files; only three font families.** Affects: Brand users. Evidence: packages/contracts/cloud-contracts/src/studio-library.ts:17,25-32. Work needed: Design asset storage.
- **Generated html and react apps cannot read the brand kit.** Affects: App authors. Evidence: No route or injection found. Work needed: Define how tokens reach app code.
- **Built-ins are hard-coded in the client.** Affects: Maintainers. Evidence: apps/web/features/chat/components/artifacts/templates/artifact-templates.ts:17. Work needed: Decide whether a served registry is needed.
- **No other app was found with templates or brands.** Affects: Desktop, mobile, CLI, VS Code, Chrome. Evidence: not found in the searched code. Work needed: Confirm and decide parity.

**Depends on**

- F096-09
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-authentication-and-identity
- surface:web
- table:studio_library_items

## Unknown

- Whether other apps have templates or brand kits.
- What the 'design from brief' dialog sends and to which model route.
- Whether the web app offers templates in a Local mode.
- Whether deleting an account removes studio_library_items rows.
- Contents of the brand dialog fields beyond the schema.
- Rate-limit numbers for the 'chat-conversation' bucket.

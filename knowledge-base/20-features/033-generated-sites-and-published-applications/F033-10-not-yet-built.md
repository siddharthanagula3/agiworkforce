---
id: "F033-10"
type: "feature"
title: "Not yet built"
aliases: ["Not yet built (Generated Sites)", "Site hosting features missing", "Template start, source workspace, build status, production stage, custom domain, domain check, environment variables, connected services, app database, logs, promotion, analytics", "S33.03", "S33.05", "S33.06", "S33.08", "S33.14-S33.18", "S33.21", "S33.22", "S33.27"]
area: "33 Generated Sites and published applications"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.03", "S33.05", "S33.06", "S33.08", "S33.14", "S33.15", "S33.16", "S33.17", "S33.18", "S33.21", "S33.22", "S33.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "F033-01", "F033-02", "F033-04", "F033-06", "F033-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-10 Not yet built

The brief lists twelve site-hosting items: site templates, source workspace, build status, production stage, custom domain and its check, environment variables, connected service settings, app database, logs, promotion and analytics. The code read has none of them as a site feature. Today's hosting is one live page per artifact with versions and a small app key-value store.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.03](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3303), [S33.05](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3305), [S33.06](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3306), [S33.08](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3308), [S33.14](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3314), [S33.15](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3315), [S33.16](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3316), [S33.17](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3317), [S33.18](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3318), [S33.21](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3321), [S33.22](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3322), [S33.27](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3327).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Records what is missing between today's 'publish an artifact to a link' and a full site-hosting product, so teams know what to build and testers know not to expect it.

**Why it exists.** The area brief expects ChatGPT and Claude style hosted apps. These items are the distance still to go (knowledge-base gap register GAP-F033-01-NOTBUILT).

**Who uses it.** Product owners, engineers planning work, testers writing negative checks.

**Problems it solves**

- Stops testers from reporting missing items as bugs.
- Gives engineers the starting points already in the code.
- Shows which pieces exist only for documents or decks, not sites.

**Use cases**

- An engineer plans a custom-domain feature and finds the publish record has only a token URL.
- A tester confirms no environment-variable screen exists.
- A planner sees that a template feature exists for documents and decks and decides whether to extend it to sites.

## 2. User experience

**Where to find it**

- None of the twelve items has a screen in any app.
- Nearest existing things: web More menu 'Save as template' and 'New from template' for documents and decks (ArtifactPreview.tsx:2438-2446; NewArtifactMenu.tsx:14).
- Nearest to a hosting dashboard: web Settings, published apps list (PublishedArtifactsSection.tsx, covered by F033-04).
- Nearest to an app database: an owner can read and clear the saved data of a published app through api GET/DELETE /api/artifacts/publish/[token]/data (data/route.ts:26-62); no UI for it was opened.

**Before you start**

- Not applicable; nothing to use.

**Screens and controls**

- No template picker for sites, source workspace, build or deploy status, stage switch, domain form, env var editor, connector settings for an app, database setup, log viewer, promote button or analytics view was found.

**Journey**

1. Today's path: publish an artifact from chat, get a token link, share it, roll back versions, unpublish (see F033-01, F033-02, F033-06, F033-05).
2. A person who wants a custom domain, logs or analytics has no path; they must use outside tools.

**What the person sees and gets**

- None for these items. A person only sees the token link /shared-artifact/<token>.

**Settings**

- None found in the code for any of the twelve items.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing in this feature is a working site-hosting item. Related working pieces: a published page with one live row per artifact and versions (publish/route.ts), an app key-value store with owner read and clear (data/route.ts), and document and deck templates (LibraryDialogs.tsx:36-71).

**Incomplete**

- Templates: 'Save as template' saves a document or deck (kind document_template or deck_template) to the studio library and 'New from template' creates a document or deck artifact (LibraryDialogs.tsx:46-64; NewArtifactMenu.tsx:14-35). This is not S33.03 for sites, but it is the closest base.
- App data: the key-value store lets a published app save values per viewer or shared, limited by ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES (artifact-runtime-service.ts:190-250). It is not S33.18 (database setup).
- Source view: the artifact panel has a source editor for the artifact text (ArtifactCodeEditor); it edits one artifact, not a site workspace. Whether it applies to a published page was not traced.

**Present but disconnected or switched off**

- None found.

**Not available**

- S33.03 site template start, S33.05 source-code workspace, S33.06 build status, S33.08 production stage, S33.14 custom domain, S33.15 domain verification, S33.16 environment variables, S33.17 connected-service configuration, S33.18 app database setup, S33.21 logs and runtime errors, S33.22 preview to production promotion, S33.27 analytics: none found in web, desktop, mobile, CLI, VS Code or Chrome (search of apps/web/app/api/artifacts and the artifact components found no domain, env-var, promote, build-status or views code; the knowledge-base gap file records the same, 80-gaps/by-area/033... lines 219-246).

## 4. Required behaviour

**Established requirements**

- S33.03 The user can start a site from a template. Status missing on all six apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.03)
- S33.05 The site's source can be browsed and edited in a workspace. Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.05)
- S33.06 The user sees the build or deploy status. Missing on all apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.06)
- S33.08 A separate production URL or stage. VS Code missing, Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.08)
- S33.14 Attach a custom domain; S33.15 verify DNS ownership. Missing on all apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.14, S33.15)
- S33.16 Manage environment variables and secrets; S33.17 configure connected services; S33.18 set up a database. Missing on all apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.16, S33.17, S33.18)
- S33.21 Inspect logs and runtime errors; S33.22 promote a preview to production; S33.27 see analytics. Missing on all apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.21, S33.22, S33.27)
- The dated competitor inventory is not authority for building; refresh official sources and record deviations before a material product choice. (source: doc: AGENTS.md section 10)

**Acceptance criteria**

1. Today, no app shows a site template picker, domain form, env var editor, build status, log view, promote button or analytics (negative checks).
2. 'Save as template' on a document or deck creates a library item and appears under 'New from template'.
3. The publish record has no description or domain field (publish route schema).
4. A published page is reachable only at /shared-artifact/<token>.
5. Owner GET /api/artifacts/publish/[token]/data returns the app's saved data and DELETE clears it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Production stage and promotion cannot exist until a published artifact has more than one live row; today it is one live row per artifact id [inferred from knowledge-base 80-gaps file lines 228-236, which cites the publish code].
- Build status and logs have no meaning while pages are static HTML or React run in a browser sandbox with no build step [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether AGI hosts real sites or only shared artifacts; the twelve items depend on that choice.
- [proposed] Start with analytics (views) and a description field since they need no build system.
- [proposed] Extend templates from documents and decks to HTML apps using the existing library client.
- [proposed] Custom domain and verification only after a stable production URL concept exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Creates the single live published row; no stage, domain or description fields. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | publishArtifactRecord and token handling. |
| endpoint | GET and DELETE /api/artifacts/publish/[token]/data | `apps/web/app/api/artifacts/publish/[token]/data/route.ts` | Owner read and clear of an app's saved data. |
| service | published-site-data-service | `apps/web/lib/services/published-site-data-service.ts` | readOwnedSiteData and clearOwnedSiteSharedData. |
| table | published_artifact_storage | `apps/web/db/neon/0325_published_artifact_storage.sql` | Key-value rows for an app; cascades on publication delete. |
| service | Artifact storage admission | `apps/web/lib/services/artifact-runtime-service.ts` | writeArtifactStorageValue with a per-scope byte cap (lines 190-250). |
| endpoint | Runtime storage route | `apps/web/app/api/artifacts/runtime/[token]/storage` | Viewer-side read and write of app data (directory listed; route file not opened). |
| component | SaveTemplateDialog | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | Saves a document or deck as a template (lines 36-71). |
| component | NewArtifactMenu 'New from template' | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx` | Creates a document or deck from a template. |
| service | artifact-templates | `apps/web/features/chat/components/artifacts/templates/artifact-templates.ts` | Template data and fillTemplate (imported at NewArtifactMenu.tsx:12). |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Existing list of published apps; no stage, domain or analytics columns found (covered by F033-04). |
| component | ArtifactPreview More menu | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Hosts 'Save as template' (2438-2446) and publish controls. |
| schema | Published version history routes | `apps/web/app/api/artifacts/publish/[token]/versions` | Only existing deploy history: versions of one live page (F033-06). |
| test | Data route tests | `apps/web/app/api/artifacts/publish/[token]/data/__tests__/route.test.ts` | Owner data read and clear. |
| other | Gap register | `knowledge-base/80-gaps/by-area/033-generated-sites-and-published-applications.md` | Records the missing items and the brief inconsistencies. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists for the twelve items. The only existing hosting flow is publish: the browser posts the artifact and the server stores one row and returns a token link. | our servers | apps/web/app/api/artifacts/publish/route.ts:63-110 |
| Owner reads or clears an app's saved data with a session-scoped database call. | our servers | apps/web/app/api/artifacts/publish/[token]/data/route.ts:26-62 |
| Save as template stores a document or deck payload in the studio library. | our servers | apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:63 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published row (title, kind, language, content, visibility, token). | published_artifacts. | Server only. | Deleted on unpublish or takedown. |
| App saved data. | published_artifact_storage. | Server only. | Cascades on publication delete; owner can clear. |
| Document and deck templates. | studio library items on the server (saveStudioLibraryItem). | Account level; details not traced. | Unknown. |

**Models and providers.** None for these missing items. No model or provider is involved in template saving or app data.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Publishing and owner data routes need a signed-in owner (getUserScopedDb). Missing items: not applicable. |
| Permissions | Owner-only for data read and clear (readOwnedSiteData takes userId and token). |
| Subscription | None found in the code for the twelve items; no plan gate because they do not exist. |
| Limits and metering | App data is capped per scope by ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES (artifact-runtime-service.ts:241). No hosting limits (bandwidth, sites per plan) were found; S33.19 is covered by F033-08 for AI use only. |
| Feature flags | None found in the code for these items. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. No hosting provider integration (custom domain, deployment host) found in the artifact publish code. |
| Local mode | Not applicable: nothing runs locally for these items; hosted pages need the cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Looking for a domain, env var, log, build or analytics screen | Nothing exists; not handled in the code. | No matches in apps/web/app/api/artifacts or the artifact components (search made for custom domain, env var, promote, build status, views). |
| Template saved for a document or deck | Toast 'Saved as a template. Find it under New from template.'; on error 'The template was not saved'. | LibraryDialogs.tsx:64-68 |
| Template menu on non-document artifact | 'Save as template' shows only for Markdown documents and presentations in the panel. | ArtifactPreview.tsx:2438 |
| App data over the cap | Write returns 'over_limit'. | artifact-runtime-service.ts:250 |
| Owner data for an unknown token | 404 'Published artifact not found'. | data/route.ts:34-37 |
| Chrome and other apps | The brief says Chrome partial for some items; no matching code found. | brief S33.05, S33.08 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/publish/[token]/data/__tests__/route.test.ts`: Owner data read and clear route.
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route (the single-row model).
- `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.handler.test.ts`: Runtime storage route handler.
- `apps/web/features/chat/components/artifacts/templates`: Template code folder; no site template test known. Test file names not listed here.

**Test scenarios**

- **Negative check: no hosting settings**
  1. Publish an artifact on web.
  2. Open the published apps list in Settings.
  3. Look for domain, environment, logs, stage, analytics controls.
  - Expected: None are present.
- **Template for a deck**
  1. Open a presentation artifact.
  2. More actions, Save as template, name it.
  3. Open New from template.
  - Expected: The saved template appears and creates a new deck.
- **Owner clears app data**
  1. Run a published app that saves data.
  2. As owner, call DELETE /api/artifacts/publish/<token>/data.
  - Expected: Response with the cleared count; the app's shared data is gone.
- **Public URL shape**
  1. Publish an artifact and read the link.
  - Expected: The link is /shared-artifact/<token> on the product host, with no custom domain option.

**Where to look when it fails**

- Gap register knowledge-base/80-gaps/by-area/033-generated-sites-and-published-applications.md.
- Tables published_artifacts and published_artifact_storage for what exists today.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No site templates (S33.03).** Affects: All six apps.. Evidence: Templates exist only for document_template and deck_template (LibraryDialogs.tsx:46).. Work needed: Add an HTML app template kind and a picker.
- **No source workspace, build status, logs (S33.05, S33.06, S33.21).** Affects: All apps.. Evidence: Published pages have no build step in the publish route.. Work needed: Needs a build and run model first.
- **No production stage or promotion (S33.08, S33.22).** Affects: All apps.. Evidence: One live row per artifact id (knowledge-base gap file line 228).. Work needed: Add a stage column and promote action.
- **No custom domain or verification (S33.14, S33.15).** Affects: All apps.. Evidence: No domain code found.. Work needed: Domain model, DNS check and a host integration.
- **No environment variables, connected-service settings, or database setup (S33.16 to S33.18).** Affects: All apps.. Evidence: Only the key-value store exists.. Work needed: Secret storage per app with consent, and a database design.
- **No analytics (S33.27).** Affects: Owners on all apps.. Evidence: No view-count table or code found.. Work needed: Privacy-reviewed view counting.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- F033-01
- F033-02
- F033-04
- F033-06
- F033-08

## Unknown

- Whether any site-hosting provider is planned or integrated outside the artifact publish code (not searched beyond apps/web artifact paths).
- Whether the Chrome extension has any hosting behaviour; the brief marks Chrome partial or unverified for several items and none was found.
- Whether the source editor works on a published page's source (not traced).
- Which test files exist inside the templates folder.
- Whether templates in the library sync to other apps.
- Whether any hosting limits such as number of published apps per plan exist elsewhere (none found in the code read).

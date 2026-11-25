---
id: "F033-04"
type: "feature"
title: "Your published apps list"
aliases: ["Sites", "Published artifacts list", "Published artifacts section", "Generated-site dashboard (S33.01)", "Application name and description (S33.02)", "Shared links settings", "agi artifacts published"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.01", "S33.02"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "table:published_artifacts", "api:GET /api/artifacts/publish", "api:PATCH /api/artifacts/publish/[token]", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-authentication-and-identity", "F033-01", "F033-03"]
basis: "code inspection"
second_reader: "8 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-04 Your published apps list

A list of everything the person has published, with name, kind, audience and link, and actions per item. Web has a Sites page (/chat/sites) and a section in Settings. Mobile has a Sites screen with Yours and Shared with you tabs. The CLI has a published command. Names can be changed; there is no description field.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.01](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3301), [S33.02](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3302).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists the owner's publications newest first, 200 per page at most, and lets the owner open, copy, rename, share, view versions and data, or take down each one (apps/web/lib/services/published-artifact-service.ts:728-763).

**Why it exists.** After publishing, owners need one place to find and manage their links instead of hunting through chats.

**Who uses it.** Anyone who has published; admins checking what a person has shared.

**Problems it solves**

- Losing track of links.
- No way to rename a page without republishing.
- Needing to find which pages are public.

**Use cases**

- Open Sites to copy yesterday's link.
- Rename 'Untitled' to the client name.
- See which pages are still public.
- On mobile, find a site and open its chat.

## 2. User experience

**Where to find it**

- Web: sidebar item 'Sites' (route /chat/sites; also redirects from /sites) (apps/web/shared/components/layout/app-nav-items.ts:123-131; apps/web/next.config.ts:143-144).
- Web Settings: the Shared links section includes a published artifacts list (apps/web/features/settings/sections/SharedLinksSection.tsx:502; PublishedArtifactsSection.tsx).
- Mobile: drawer item 'Sites' (labelKey navSites) to a Sites screen with chips 'Yours' and 'Shared with you' (apps/mobile/src/features/drawer/components/DrawerContent.tsx:145-150; apps/mobile/src/features/sites/SitesScreen.tsx:225-228).
- CLI: agi artifacts published, and agi artifacts list marks published ones (apps/cli/src/lib.rs:1410-1414; 3860-3876).
- VS Code and Chrome: none found.

**Before you start**

- Signed in; mobile needs Cloud mode (Sites screen shows a cloud gate otherwise: 'Sites live in AGI Cloud; switching won't upload your local chats.').

**Screens and controls**

- Web Sites page: heading 'Sites', cards with Copy link, a menu 'More actions for <name>' with Rename, Sharing, Unpublish; empty state 'No sites yet' with 'Start a chat'; Create link (apps/web/features/sites/components/SitesPage.tsx:225-244; SiteCard.tsx:83-113).
- Web site detail: tabs Settings and Data; page 'This site is not available' when missing (SiteDetail.tsx:258-280).
- Web Settings list: shows audience label, date, 'Publish history', 'Unpublish' (PublishedArtifactsSection.tsx:39-41, 644-700).
- Mobile list: paged with 'Older' and 'Back to first page'; empty 'Nothing published' (SitesScreen.tsx:48-57, 268-278).
- Mobile Site screen: sections Link, Who can open it, Name with a Rename button, Publish history, Data, Take it down (SiteDetailScreen.tsx:275-460).

**Journey**

1. Open Sites (web or mobile) or run the CLI list.
2. The app loads the first page of publications.
3. Pick a site; copy or open its link.
4. Rename it, change its audience, or open versions and data.
5. Load older pages as needed.

**What the person sees and gets**

- Web toast 'Site renamed'; errors 'Your sites could not be loaded.' and per-action messages (SiteSettingsTab.tsx:80; SitesPage.tsx:116).
- Settings list shows 'Loading published artifacts…', 'Sign in to manage published artifacts.', 'No published artifacts' (PublishedArtifactsSection.tsx:534-545).
- CLI prints 'Nothing is published from this account.' when empty (cloud/artifacts.rs:692-696).

**Settings**

- None. The web Sites item can be hidden from navigation (hideable true in app-nav-items.ts:130).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/artifacts/publish returns a paged list with next cursor, share links, sandboxed flag and workspace member count, private no-store (apps/web/app/api/artifacts/publish/route.ts:~125-160).
- Cursor paging with a validated owner-bound cursor (published-artifact-service.ts:728-763).
- Rename through PATCH with a title; the title passes moderation and secret inspection before saving; a republish keeps the name (apps/web/app/api/artifacts/publish/[token]/route.ts:103-130; published-artifact-service.ts:442-448; :646-668).
- Web Sites page with cards, sharing dialog, rename dialog, detail tabs (apps/web/features/sites/components/*).
- Mobile Sites screen with paging, Shared with you tab and Site detail screen (apps/mobile/src/features/sites/*).
- The CLI published list follows page cursors up to 200 pages (MAX_PUBLISHED_PAGES), fails on a repeated cursor, and fails with 'did not end within 200 pages' if the list does not end within that cap (apps/cli/src/cloud/artifacts.rs:31, 343-380).
- The list is read through getUserScopedDb, so row-level security (forced on published_artifacts) is the access control, not only the user_id filter (apps/web/app/api/artifacts/publish/route.ts:133; apps/web/db/neon/0095_published_artifacts.sql:82-92).

**Incomplete**

- Rename is on web and mobile only; the CLI has no rename command (apps/cli/src/lib.rs:1359-1430 lists none).
- The brief marks mobile dashboard missing but a full Sites screen exists, so the brief status is stale.

**Present but disconnected or switched off**

- The web nav item is hideable by the user (app-nav-items.ts:130).

**Not available**

- Description field: not in the row (published-artifact-service.ts:154-167), request (route.ts:33-40) or update schema (artifact-index.ts:242-254).
- Build status, templates, analytics: none found (brief S33.03, S33.06, S33.27 missing).
- VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- A dashboard lists generated and published sites with state and actions (brief S33.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.01)
- The user can set a name and description for a published app (brief S33.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.02)
- The list is paged with at most 200 per page. (source: packages/contracts/cloud-contracts/src/artifact-index.ts:132)
- The name is kept when a new version is published, and a name must pass the content policy before saving. (source: published-artifact-service.ts:442-448; token route.ts:103-130)
- Sites is a ChatGPT and Claude style parity feature set; follow the leaders where it applies. (source: doc: AGENTS.md section 10)

**Acceptance criteria**

1. After publishing two artifacts, the Sites page and Settings list show both, newest first.
2. The list returns at most 200 rows per page and a cursor when more exist.
3. Renaming a site changes its title in the list and survives a republish.
4. A name that violates policy is refused with 'This name cannot be used because it violates the AGI Workforce usage policy.'
5. On mobile the Yours tab shows the same sites as web for the same account.
6. CLI published prints each page's audience and link.
7. A signed-out web visitor sees 'Sign in to manage published artifacts.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Description is expected by S33.02 but nothing in the code stores it. [inferred]
- Both web lists read the same API so counts match. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add description to schema, route, web and mobile edit forms.
- [proposed] Add a CLI rename.
- [proposed] Show state such as 'live version' in the list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Paged owner list with share links and workspace info. |
| service | listPublishedArtifactsPage | `apps/web/lib/services/published-artifact-service.ts` | Keyset paging newest first (728-763). |
| endpoint | GET and PATCH /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | One site's detail and rename. |
| service | renamePublishedArtifact | `apps/web/lib/services/published-artifact-service.ts` | Updates the title only (646-668). |
| schema | published artifact contracts | `packages/contracts/cloud-contracts/src/artifact-index.ts` | List response, update request, page size, title limit. |
| screen | SitesPage | `apps/web/features/sites/components/SitesPage.tsx` | Web Sites list with empty and error states. |
| component | SiteCard | `apps/web/features/sites/components/SiteCard.tsx` | Card with Copy link and the Rename, Sharing, Unpublish menu. |
| screen | SiteDetail | `apps/web/features/sites/components/SiteDetail.tsx` | Detail with Settings and Data tabs. |
| service | sites-service | `apps/web/features/sites/services/sites-service.ts` | Web client for list, detail, update, versions, data, viewers. |
| store | published-sites-store | `apps/web/features/sites/stores/published-sites-store.ts` | Client store for the list. |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Settings list with unpublish and publish history. |
| config | app navigation item sites | `apps/web/shared/components/layout/app-nav-items.ts` | Sidebar entry 'Sites' to /chat/sites. |
| screen | SitesScreen | `apps/mobile/src/features/sites/SitesScreen.tsx` | Mobile list, tabs and paging. |
| screen | SiteDetailScreen | `apps/mobile/src/features/sites/SiteDetailScreen.tsx` | Mobile site management. |
| service | mobile sites service | `apps/mobile/src/features/sites/service.ts` | List, detail, update, versions, data calls and visibility labels. |
| command | agi artifacts published | `apps/cli/src/lib.rs` | CLI list command (1410-1414, 3877-3887). |
| service | cli published listing | `apps/cli/src/cloud/artifacts.rs` | Follows page cursors up to MAX_PUBLISHED_PAGES = 200, renders list (31, 343-380, 692). |
| test | web e2e sites | `apps/web/e2e/sites.spec.ts` | Browser spec for list, rename, clear data and unpublish. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page loads and requests the first page; the GET needs no CSRF token and uses a session cookie or bearer token (PATCH on a publication, by contrast, requires a CSRF token before the rate limit: apps/web/app/api/artifacts/publish/[token]/route.ts:138-143). | device | apps/web/features/sites/services/sites-service.ts:98-155; apps/mobile/src/features/sites/service.ts:78-104 |
| Server rate limits (share-view 60 per minute), resolves the user scope (getUserScopedDb, so row-level security applies), and queries published_artifacts for the owner ordered by creation date. | our servers | apps/web/app/api/artifacts/publish/route.ts:~125-160, 133; published-artifact-service.ts:728-763 |
| Client validates the page against the shared schema, rejects duplicates and cursors that do not advance (mobile). | device | apps/mobile/src/features/sites/service.ts:90-103 |
| Rename: client PATCH title; server runs moderation and secret inspection, then updates the title. | our servers | token route.ts:103-130; :160-200 |
| CLI follows next cursors until done, at most 200 pages (MAX_PUBLISHED_PAGES), and prints the list. | device and our servers | apps/cli/src/cloud/artifacts.rs:31, 343-380 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Publication rows listed | table published_artifacts | Fetched on demand; web keeps a store, mobile keeps in-memory audiences | As in F033-01. |
| Title | column title of published_artifacts | Server is truth | Updated in place; a version stores the title it was published with. |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required; a list is per owner (user_id bound in the query). |
| Permissions | Only the owner's rows are returned; the list is read through getUserScopedDb, so row-level security (forced on published_artifacts) is the access control, not only the user_id filter (apps/web/app/api/artifacts/publish/route.ts:133; apps/web/db/neon/0095_published_artifacts.sql:82-92). |
| Subscription | none found in the code for listing or renaming. |
| Limits and metering | 200 per page (artifact-index.ts:132); the CLI list is bounded at 200 pages (apps/cli/src/cloud/artifacts.rs:31,348,376); share-view rate limit 60 per minute; share-create 5 per minute for rename. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Unavailable. Mobile Local mode shows a cloud gate for Sites; CLI refuses non-managed mode. Local artifacts are never listed here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows loading rows; mobile shows loading rows. | PublishedArtifactsSection.tsx:534; SitesScreen.tsx:239, 254, 329 |
| Empty | Web 'No sites yet' with Start a chat; mobile 'Nothing published'; CLI 'Nothing is published from this account.' | SitesPage.tsx:53-58; SitesScreen.tsx:48-49; artifacts.rs:692-696 |
| Error | 'Your sites could not be loaded.' with retry; Settings 'Failed to load published artifacts'. | SitesPage.tsx:116-121; PublishedArtifactsSection.tsx:183 |
| Stale page | Settings notes the previously loaded page may be out of date after a failed refresh. | PublishedArtifactsSection.tsx:504 |
| Signed out | 'Sign in to manage published artifacts.' | PublishedArtifactsSection.tsx:534 |
| Paging | Mobile 'Older' and 'Back to first page'; empty later pages show 'No more sites'. | SitesScreen.tsx:52-57 |
| Account switch | Mobile and web discard results that arrive after the account changes (authority and lease checks). | service.ts:30-50; sites-service.authority.test.ts exists |
| Offline | not handled in the code beyond error banners. | searched SitesPage.tsx and SitesScreen.tsx |
| Accessibility | Cards expose labelled buttons such as 'Copy link to <name>' and 'More actions for <name>'. | SiteCard.tsx:83; :113 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/sites/components/__tests__/SitesPage.test.tsx`: Sites page (by file name).
- `apps/web/features/sites/components/__tests__/SitesPage.updates.test.tsx`: List updates after actions (by file name).
- `apps/web/features/sites/services/sites-service.pagination.test.ts`: Paging in the web service (by file name).
- `apps/web/features/sites/services/sites-service.update.test.ts`: Rename and audience updates (by file name).
- `apps/web/features/sites/stores/published-sites-store.test.ts`: Store behaviour (by file name).
- `apps/web/app/api/artifacts/publish/[token]/route.rename.test.ts`: Rename route (by file name).
- `apps/web/features/settings/sections/PublishedArtifactsSection.authority.test.tsx`: Settings list under account changes (by file name).
- `apps/mobile/src/features/sites/__tests__/SitesPages.test.tsx`: Mobile paging (by file name).
- `apps/mobile/src/features/sites/__tests__/service.test.ts`: Mobile sites service (by file name).
- `apps/web/e2e/sites.spec.ts`: Browser spec: lists a site, renames it, clears data, unpublishes; cancelled unpublish leaves the site (a spec file; no run result is recorded).

**Test scenarios**

- **List order and paging**
  1. Publish 3 artifacts, load Sites.
  2. With more than 200, load the next page.
  - Expected: Newest first; a cursor appears only after 200 rows.
- **Rename survives republish**
  1. Rename a site to 'Client demo'.
  2. Republish the artifact with new content.
  - Expected: Title still 'Client demo'; version increases.
- **Policy name**
  1. Rename to text that violates the usage policy.
  - Expected: Validation error and the old title remains.
- **Mobile list**
  1. Cloud mode, open drawer, Sites.
  - Expected: Yours tab lists the same sites as web; Shared with you tab loads invited and workspace sites.
- **CLI list**
  1. agi artifacts published --json
  - Expected: JSON array with token, artifactId, visibility, shareUrl.
- **Signed out**
  1. Open web Settings signed out.
  - Expected: 'Sign in to manage published artifacts.'

**Where to look when it fails**

- Web error text 'Your sites could not be loaded.'
- Route validation 'Invalid published artifact page request' and cursor errors from the service.
- Table published_artifacts for the owner's rows.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)
- CLI: [70-qa/test-plans/cli/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/cli/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **No description for a published app** Affects: All apps. Evidence: published-artifact-service.ts:154-167. Work needed: Add field end to end (S33.02).
- **Brief says mobile dashboard missing** Affects: Documentation. Evidence: apps/mobile/src/features/sites/SitesScreen.tsx exists. Work needed: Update brief.
- **CLI cannot rename** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1359-1430. Work needed: Add rename command if parity is wanted.
- **No state such as build or deploy status** Affects: All apps. Evidence: Brief S33.06 missing; no code. Work needed: Not needed for a static publish; decide.
- **VS Code and Chrome have no list** Affects: Those apps. Evidence: No code found. Work needed: Decision.
- **Desktop (Electron) has no own list; it shows the web page** Affects: Desktop. Evidence: AGENTS.md section 5. Work needed: None if the web page is reachable in the desktop window; not verified.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- table:published_artifacts
- api:GET /api/artifacts/publish
- api:PATCH /api/artifacts/publish/[token]
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-authentication-and-identity
- F033-01
- F033-03

## Unknown

- Whether Electron desktop exposes the Sites page in its window (only the web app is shown per AGENTS.md; routing allowlist not read).
- Exact line range of handleList in route.ts was approximated from the file read.
- Whether the Shared with you list matches workspace share rules (SharedSitesList not fully read).
- Content of several named tests not read.

## Second reader's check

A second reader checked 10 statements of this page against the code: 8 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "CLI published list follows every page cursor and fails on a repeated cursor (artifacts.rs:343-380)" The code shows: It follows cursors and errors on a repeated cursor. It is also capped at MAX_PUBLISHED_PAGES = 200 pages and errors with 'did not end within 200 pages' after that. The cap is not mentioned. (apps/cli/src/cloud/artifacts.rs:31, 343-380). **Corrected:** The CLI published list follows page cursors up to 200 pages, fails on a repeated cursor, and fails if the list does not end within 200 pages.
- **Partly wrong (section 8):** "Loading state cites SiteDetailScreen.tsx:244-248 for mobile loading rows" The code shows: That file is the single-site detail screen, not the list. The citation does not show list loading. The web strings 'Sign in to manage published artifacts.', 'Loading published artifacts…', 'No published artifacts', 'May be out of date' and 'Failed to load published artifacts' all exist in PublishedArtifactsSection.tsx at 183, 497-544. Mobile 'Nothing published', 'No more sites', 'Older' and 'Back to first page' exist in SitesScreen.tsx:48-56, 268-278. (apps/mobile/src/features/sites/SiteDetailScreen.tsx:244; SitesScreen.tsx:48-56). **Corrected:** Cite the list loading code in SitesScreen.tsx, not SiteDetailScreen.tsx. The detail screen loading belongs to a different screen.

**Facts the page missed**

- PATCH on a publication requires a CSRF token before the rate limit, so the claim 'CSRF-free' applies to GET only: apps/web/app/api/artifacts/publish/[token]/route.ts:138-143.
- The CLI list is bounded at 200 pages (MAX_PUBLISHED_PAGES): apps/cli/src/cloud/artifacts.rs:31,348,376.
- The list is read through getUserScopedDb, so row-level security (forced on published_artifacts) is the access control, not only the user_id filter: apps/web/app/api/artifacts/publish/route.ts:133; apps/web/db/neon/0095_published_artifacts.sql:82-92.

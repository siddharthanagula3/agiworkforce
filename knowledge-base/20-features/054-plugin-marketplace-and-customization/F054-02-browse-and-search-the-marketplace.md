---
id: "F054-02"
type: "feature"
title: "Browse and search the marketplace"
aliases: ["Plugin directory", "Public marketplace", "Plugin search and filters", "Role and use-case categories", "GET /api/plugins", "S54.05", "S54.08", "S54.09", "Marketplace tab (Built in, Partners, Marketplace)"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.05", "S54.08", "S54.09"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:GET /api/plugins", "api:GET /api/plugins/{id}", "api:GET /api/plugins/marketplaces/entries", "table:plugin_registry_entries", "file:apps/web/features/plugins/server/directory/query.ts", "file:apps/web/app/api/plugins/route.ts", "SYS-connectors-plugins-and-skills", "SYS-api-and-contracts", "SYS-observability-and-operations", "F054-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-02 Browse and search the marketplace

Browse and search the plugin catalogue. The server merges built-in packs with a daily-refreshed copy of an outside public directory and the official marketplace repository. People filter by source, works-with, category and publisher, and page through results. Web and Desktop use it. Mobile has its own screen. CLI searches only the account's own marketplaces.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.05](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5405), [S54.08](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5408), [S54.09](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5409).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists plugins from the catalogue with search text, source tabs (Built in, Partners, Marketplace), works-with and category filters, a publisher filter reached from a plugin's page, and paging (apps/web/app/api/plugins/route.ts:30-42; apps/web/features/directory/services/plugins-directory.ts:1108-1150).

**Why it exists.** Brief S54.05, S54.08 and S54.09: a user can browse a public plugin marketplace, search and filter it, and browse role or use-case categories. Product requirements ask for marketplace and source controls (doc: docs/product/requirements.md section 19).

**Who uses it.** Any signed-in person on web or the public Desktop, and phone users in Cloud mode. Developers use the CLI for account marketplaces and VS Code for the account marketplace picker.

**Problems it solves**

- Finding a plugin without knowing its name.
- Seeing only plugins that work on this surface (works-with filter).
- Keeping a long list usable by paging and category shelves.

**Use cases**

- Search 'calendar' and install the top matching plugin.
- Filter by category to browse plugins for one job.
- On the phone, scan the Popular shelf and category shelves.
- In the CLI, search the plugins of marketplaces added to the account.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Customize, Plugins (packages/ui/ui/src/settings-nav.ts:378). Search box placeholder 'Search plugins' (packages/ui/ui/src/directory/constants.ts:58-62).
- Mobile: Customize, Plugins; bottom search bar 'Search plugins' (apps/mobile/src/features/plugins/PluginsScreen.tsx:845-851).
- CLI: 'agi marketplace browse', 'agi marketplace search <query>', 'agi marketplace show <plugin>@<marketplace>' (apps/cli/src/lib.rs:2340-2380, 7552-7632).
- VS Code: 'Code: Browse AGI Cloud Marketplace' with a search box 'Search plugins by name, description, or source' (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:104).
- Chrome: not available.

**Before you start**

- Signed in on web, Desktop, mobile and VS Code. Catalogue reads need only the public API on web (GET /api/plugins is public, apps/web/app/api/plugins/route.ts:50-56) but the settings tab is behind sign-in.
- Mobile: Cloud mode (apps/mobile/src/features/plugins/PluginsScreen.tsx:658).
- CLI: an account; the account's plan must not deny canUseMarketplace (apps/cli/src/lib.rs:7553-7558).

**Screens and controls**

- Web: search field with Clear button, source tabs All, Built in, Partners, Marketplace and one tab per marketplace the user added, 'Works with' filter (Web, CLI, Cowork), 'Category' filter, count label such as '120 plugins' (packages/ui/ui/src/directory/DirectoryToolbar.tsx:84-140; apps/web/features/directory/constants.ts:93-98, 150-154, 119).
- Web: sort control is hidden because plugins offer one sort (name) (apps/web/features/directory/services/plugins-directory.ts:149; packages/ui/ui/src/directory/DirectoryToolbar.tsx:222).
- Web: the 'verified' and 'status' filters exist on the server but have no control in the UI (apps/web/features/directory/services/plugins-directory.ts:219-232).
- Mobile: chips All, Built in, Partners, Marketplace, Popular, Name; a second row 'Every category' plus one chip per category; sections Updates available, Popular, Recommended for you, category shelves, All plugins; 'Show more' button (apps/mobile/src/features/plugins/PluginsScreen.tsx:76-86, 704-840).
- VS Code: quick pick list of marketplace entries plus 'Manage marketplace sources' (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:83-102).

**Journey**

1. Open the Plugins tab; the first page loads (100 per page on web).
2. Type in the search box; after 250 ms the list reloads.
3. Choose a source tab or filters; the list reloads with the new request.
4. Scroll down; near the bottom the next page loads automatically (a 'Load more' label exists too).
5. Click a plugin to open its detail (F054-06).

**What the person sees and gets**

- Web error: 'The plugin catalog is unavailable right now.' when the directory request fails and nothing else can be shown (apps/web/features/directory/constants.ts:243).
- Mobile empty: 'No matching plugins' with 'Try a different name, category or source.', or 'No plugins yet' (apps/mobile/src/features/plugins/PluginsScreen.tsx:770-775).
- Mobile load error banner with retry; refresh by pulling down (apps/mobile/src/features/plugins/PluginsScreen.tsx:701-702).

**Settings**

- No user setting. Page size and limits are constants (apps/web/features/directory/constants.ts:182; apps/web/features/plugins/server/directory/constants.ts:68-70).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/plugins validates search (trim, 1-200 chars), verified, worksWith, source, category (max 100), publisher (max 200), status, sort (installs or name), limit (1-100), cursor (digits only, max 7), offset (0-10000); a bad value returns 400 INVALID_QUERY (apps/web/app/api/plugins/route.ts:22-72).
- Results are filtered, sorted (default most installs, then name) and ranked by eight search rules from exact name to marketplace name; the page comes back with total, nextCursor and stats (apps/web/features/plugins/server/directory/query.ts:67-156).
- The catalogue is built-in packs from the registry plus a snapshot of external entries, merged (apps/web/features/plugins/server/directory/catalog.ts:11-37).
- The snapshot is refreshed by a daily cron that reads the outside public directory and the official marketplace repository (vercel.json:158-159; apps/web/features/plugins/server/directory/ingest.ts:146; apps/web/features/plugins/server/directory/constants.ts:1-17).
- Rate limit 'model-catalog' 120 per minute per IP, fail-open; response cached 60 s with 300 s stale-while-revalidate (apps/web/lib/rate-limit.ts:459-463; apps/web/app/api/plugins/route.ts:55, 83).
- Web client: debounced search (250 ms), IntersectionObserver paging, source, works-with, category and publisher filters (packages/ui/ui/src/directory/constants.ts:386; packages/ui/ui/src/directory/DirectoryPanel.tsx:269; apps/web/features/directory/services/plugins-directory.ts:219-254).
- Web: a 'popular' group of up to 6 verified, installable, not-yet-installed plugins ranked by installs (apps/web/features/directory/services/plugins-directory.ts:1222-1239; apps/web/features/directory/constants.ts:118).
- Mobile: search, source, sort and category chips, category shelves, Show more with cursor (apps/mobile/src/features/plugins/PluginsScreen.tsx:304-460, 704-840).
- CLI: search and browse over entries of the marketplaces added to the account (apps/cli/src/cloud/marketplaces.rs:145-153; apps/cli/src/lib.rs:7552-7632).
- VS Code: pick-and-install over the account marketplace entries (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:83-170).

**Incomplete**

- The web client always sends sort=name and limit=100 and never sends offset or verified (apps/web/features/directory/services/plugins-directory.ts:219-254), so those server options are unused by web.
- Sort order differs by surface: server default is installs, web sends name, mobile defaults to installs (apps/web/features/plugins/server/directory/query.ts:116; apps/mobile/src/features/plugins/PluginsScreen.tsx:310).
- CLI search covers only account marketplaces, not the built-in or public catalogue (apps/cli/src/cloud/marketplaces.rs:145-153); the brief marks CLI public marketplace unverified.
- Categories come from the catalogue entries' own category text, lower-cased; there is no editorial role or use-case taxonomy (apps/web/features/plugins/server/directory/query.ts:48-65).

**Present but disconnected or switched off**

- None found for browse on web.

**Not available**

- Mobile has no works-with filter or publisher filter control; it passes publisher only from the detail screen (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:101).
- VS Code and CLI have no category or works-with filter.
- Chrome: nothing.

## 4. Required behaviour

**Established requirements**

- A user can browse a public plugin marketplace and install from it. (source: S54.05 (brief))
- A user can search the plugin catalogue and filter the results. (source: S54.08 (brief))
- Plugins are grouped into role or use-case categories a user can browse. (source: S54.09 (brief))
- Search text is trimmed and capped (200 characters); the server rejects bad filter values with 400 INVALID_QUERY. (source: apps/web/app/api/plugins/route.ts:30-72 (code))
- Page size is capped by the server at 100 (default 50). (source: apps/web/features/plugins/server/directory/constants.ts:68-69 (code))
- Requests are rate limited. (source: apps/web/app/api/plugins/route.ts:55 (code))
- Marketplace and source controls are a plugin requirement. (source: doc: docs/product/requirements.md section 19)
- Discovery, packaging, compatibility and trustworthy publishers should be explicit for plugins. (source: doc: docs/product/competitive-guidance.md section 5.13 items 98-101)

**Acceptance criteria**

1. GET /api/plugins?limit=101 returns 400 INVALID_QUERY; limit=100 returns at most 100 entries.
2. GET /api/plugins?search=<201 characters> returns 400; a 200-character search succeeds.
3. Searching an exact plugin name returns it first; a name prefix next; description matches last.
4. If the response has nextCursor, requesting with cursor returns the following entries with no repeats.
5. On web, typing in the search box reloads the list once, about 250 ms after the last key.
6. Source tab Partners shows only partner entries; Marketplace only marketplace entries; Built in only built-in packs.
7. With the catalogue failing, the tab shows 'The plugin catalog is unavailable right now.' and a retry.
8. More than 120 requests a minute from one IP get a rate-limit response.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because GET /api/plugins sets a public cache header and is not user-scoped, the list never contains user-specific data.
- [inferred] A tester can count total entries from stats.totalPlugins in the response.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the name and installs sort in the web toolbar since the server supports both.
- [proposed] Expose a verified-only filter in the UI.
- [proposed] Let CLI search include the built-in and public catalogue.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/plugins | `apps/web/app/api/plugins/route.ts` | Validates the query, loads the merged directory, returns a page; 400, 503, rate limit, cache header. |
| service | queryPluginDirectory | `apps/web/features/plugins/server/directory/query.ts` | Filter, sort, rank search, cursor paging and stats (lines 48-156). |
| service | loadPluginDirectory | `apps/web/features/plugins/server/directory/catalog.ts` | Merges built-in registry entries with the snapshot (lines 11-37). |
| config | Directory constants | `apps/web/features/plugins/server/directory/constants.ts` | Limits, facets, sorts, public directory URL, official marketplace name, runtime notes. |
| job | refresh-plugin-directory cron | `apps/web/app/api/cron/refresh-plugin-directory/route.ts` | Daily ingest trigger; schedule in vercel.json lines 158-159. |
| service | ingestPluginDirectory | `apps/web/features/plugins/server/directory/ingest.ts` | Fetches the public directory and the official marketplace, inspects sources on GitHub, writes the snapshot (line 146). |
| service | merge directory entries | `apps/web/features/plugins/server/directory/merge.ts` | Combines built-in and external entries; built-in wins on id clash (line 42). |
| service | plugin registry service | `apps/web/lib/services/plugin-registry-service.ts` | Reads built-in registry entries from the database (used at catalog.ts:15). |
| service | plugins-directory client service | `apps/web/features/directory/services/plugins-directory.ts` | Builds the request, fetches pages, source chips, filters, popular ranking (lines 219-310, 1108-1239). |
| hook | useDirectoryAdapter plugin query | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | primePlugins, runPluginQuery, loadMorePlugins with stale-response guard (lines 776-890). |
| component | DirectoryToolbar | `packages/ui/ui/src/directory/DirectoryToolbar.tsx` | Search, source tabs, filters, sort (hidden for one option). |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Debounce, IntersectionObserver paging, Popular group (lines 148, 269, 970). |
| config | Directory UI constants | `packages/ui/ui/src/directory/constants.ts` | Search placeholders, debounce 250 ms, Load more label. |
| config | Web directory constants | `apps/web/features/directory/constants.ts` | Source labels, works-with labels, page size 100, failure copy. |
| config | cloud-contracts plugin directory | `packages/contracts/cloud-contracts/src/plugin-directory.ts` | Shared paths, sort keys and wire schemas used by mobile and VS Code. |
| screen | Mobile PluginsScreen | `apps/mobile/src/features/plugins/PluginsScreen.tsx` | Browse, search, chips, shelves, paging. |
| service | Mobile plugin service | `apps/mobile/src/features/plugins/service.ts` | fetchPluginDirectory and href builder (lines 41-72). |
| service | Mobile pluginsModel | `apps/mobile/src/features/plugins/pluginsModel.ts` | Popular, recommended, categories, compatibility helpers. |
| command | CLI marketplace browse and search | `apps/cli/src/lib.rs` | Handlers at lines 7552-7632. |
| service | CLI marketplace client | `apps/cli/src/cloud/marketplaces.rs` | entries, search_catalogue, render helpers. |
| command | VS Code account marketplace | `apps/extension-vscode/src/features/surfaces/accountMarketplace.ts` | Quick-pick browse and install over account marketplace entries. |
| config | Rate-limit table | `apps/web/lib/rate-limit.ts` | 'model-catalog' 120/min fail-open (line 459). |
| table | plugin_registry_entries | `apps/web/lib/services/plugin-registry-service.ts` | Built-in plugin entries (table name from the migration comment at apps/web/db/neon/0159_plugin_marketplace_sources.sql:12). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types or picks a filter; the panel waits 250 ms then asks the adapter to query. | device | packages/ui/ui/src/directory/constants.ts:386; packages/ui/ui/src/directory/DirectoryPanel.tsx:148 |
| Adapter fetches built-in and partner pages, installs, user marketplaces, workspace and community plugins, and the marketplace page. | our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:776-830 |
| GET /api/plugins checks the rate limit, validates parameters, loads built-in rows from the database and the snapshot from cache, merges, filters, ranks, pages. | our servers | apps/web/app/api/plugins/route.ts:50-86; apps/web/features/plugins/server/directory/catalog.ts:30-37 |
| Once a day the cron refreshes the snapshot from the outside public directory and the official marketplace GitHub repository, then inspects plugin sources on GitHub. | outside service | vercel.json:158-159; apps/web/features/plugins/server/directory/constants.ts:1-17, 59-62 |
| Scrolling near the end triggers the next page using nextCursor. | device and our servers | packages/ui/ui/src/directory/DirectoryPanel.tsx:263-269; apps/web/features/directory/hooks/useDirectoryAdapter.ts:874-890 |
| CLI search lists the account's marketplaces and entries, then matches name or description on the device. | device and our servers | apps/cli/src/cloud/marketplaces.rs:145-153 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Built-in plugin entries | database table plugin_registry_entries | server-side only | managed by registry (not traced) |
| External directory snapshot, sync state and inspections | a cache layer keyed 'plugins.directory.snapshot', '.sync-state', '.inspections'; physical store not traced | server-side only | snapshot 7 days, sync state 30 days, inspections 30 days TTL (apps/web/features/plugins/server/directory/constants.ts:122-126) |
| Search text and filters | memory of the page | no | discarded on close; the server logs failures only |

**Models and providers.** No model or provider is used for browse, search or filtering. Ranking is rule based (apps/web/features/plugins/server/directory/query.ts:67-101). Brand words in imported descriptions are rewritten to 'the assistant' (apps/web/features/plugins/server/directory/constants.ts:63-64).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | GET /api/plugins needs no account (public, cached) (apps/web/app/api/plugins/route.ts:50-56). The Plugins tab needs sign-in; the CLI marketplace commands need an account. |
| Permissions | none found in the code for reading the public list. Workspace administrators can remove the tab by switching plugins off (apps/web/lib/services/capability-handshake-service.ts:184). |
| Subscription | No tier gate on browsing found; the handshake service says canUseMarketplace has no tier or model gate (apps/web/lib/services/capability-handshake-service.ts:39-42). CLI refuses with a reason if the cached capability document denies it (apps/cli/src/tier_cache.rs:376-392). |
| Limits and metering | IP rate limit 120 per minute, fail-open (apps/web/lib/rate-limit.ts:459-463); mobile and CLI paging limits come from the server. No usage metering against the AGI Subscription was found for browsing. |
| Feature flags | none found in the code for browse on web; mobile pluginMarketplaceAdmin does not affect browse. |
| Model compatibility | Not model dependent. none found in the code. |
| Provider restrictions | none found in the code; the catalogue is not tied to a model provider. |
| Local mode | Web has no Local mode. Public Desktop is Cloud by construction. Mobile in Local mode shows a gate and sends no plugin request. CLI plugin commands over local folders work offline; marketplace browse and search need our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Panel marks loading while a query is in flight; a newer query makes older responses ignored by a sequence number. | apps/web/features/directory/hooks/useDirectoryAdapter.ts:808-855 |
| error | If the marketplace page fails but built-in lists exist, a notice is kept; with nothing to show the error 'The plugin catalog is unavailable right now.' appears with retry. | apps/web/features/directory/hooks/useDirectoryAdapter.ts:827-845 |
| server catalogue unavailable | 503 PLUGIN_REGISTRY_UNAVAILABLE. | apps/web/app/api/plugins/route.ts:87-91 |
| bad parameter | 400 INVALID_QUERY with flattened details. | apps/web/app/api/plugins/route.ts:60-72 |
| empty result | Mobile shows 'No matching plugins'; web grid shows its empty state (copy not read). | apps/mobile/src/features/plugins/PluginsScreen.tsx:770-775 |
| load-more failure | Web silently stops the spinner; mobile shows 'Could not load more plugins.' | apps/web/features/directory/hooks/useDirectoryAdapter.ts:892-897; apps/mobile/src/features/plugins/PluginsScreen.tsx:445-447 |
| stale late page on mobile | A page that resolves after the search changed is discarded. | apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx:270-330 |
| rate limited | Returns the limiter response; list not queried. | apps/web/app/api/plugins/__tests__/route.test.ts:265 |
| offline and timeout | Web: generic failure copy only. VS Code request uses a 20 second timeout. Other timeouts not handled in the code that I read. | apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:50 |
| accessibility | Source tabs use role tablist and tab; search has an aria-label; mobile chips have sort labels. | packages/ui/ui/src/directory/DirectoryToolbar.tsx:117-140; apps/mobile/src/features/plugins/PluginsScreen.tsx:715 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/plugins/__tests__/route.test.ts`: List: built-in first, stats, default sort, cursor paging, filters (search, verified, worksWith, source), cache header, install counts, 503 cases, 400 for bad source or limit or cursor, rate limit. Detail: 404, 503.
- `apps/web/features/plugins/server/directory/__tests__/merge-query.test.ts`: Merge and query logic (exact cases not read).
- `apps/web/features/plugins/server/directory/__tests__/ingest.test.ts`: Directory ingest (exact cases not read).
- `apps/web/features/plugins/server/directory/__tests__/public-directory.test.ts`: Public directory fetch parsing.
- `apps/web/features/plugins/server/directory/public-directory.redos.test.ts`: Regular-expression safety of the public directory parser.
- `apps/web/features/directory/__tests__/plugins-directory.test.ts`: Client request building, chips, filters, sections.
- `packages/ui/ui/src/directory/__tests__/DirectoryPanel.test.tsx`: Panel behaviour; exact cases not read.
- `packages/ui/ui/src/directory/__tests__/directory-filtering.test.ts`: Filtering helper.
- `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx`: Shelves, category chip merging, late-page discard, 250 ms search debounce, empty state, installed tiles.
- `apps/mobile/src/features/plugins/__tests__/pluginsModel.test.ts`: Popular, recommended and category helpers.

**Test scenarios**

- **Search ranking**
  1. Call GET /api/plugins?search=<an exact plugin name>.
  2. Call it with a prefix; then with a word from a description.
  - Expected: Exact name first, prefix next, description matches last.
- **Limit ceiling**
  1. Call GET /api/plugins?limit=100 then limit=101.
  - Expected: First returns up to 100 entries; second returns 400 INVALID_QUERY.
- **Paging**
  1. Call with limit=10, read nextCursor, call again with cursor=<value>.
  - Expected: Next 10 entries, no duplicates, nextCursor null at the end.
- **Web scroll paging**
  1. Open Plugins tab with the Marketplace source.
  2. Scroll to the bottom.
  - Expected: More plugins load without clicking; total count label stays the same.
- **Debounce**
  1. Type five letters quickly in the search box and watch the network panel.
  - Expected: One list request about 250 ms after the last key.
- **Mobile Local mode**
  1. Switch the phone to Local mode and open Plugins.
  - Expected: Cloud gate; no /api/plugins request.

**Where to look when it fails**

- Server log 'Plugin directory list failed' (apps/web/app/api/plugins/route.ts:88).
- Ingest outcomes via the cron route response and the operator action refresh-plugin-directory (apps/web/app/api/operator/route.ts:40, 217).
- Response field stats.byCategory shows which categories exist.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **Web does not use the server sort, offset or verified filter; there is no sort control.** Affects: Web and Desktop users. Evidence: apps/web/features/directory/services/plugins-directory.ts:149, 219-254. Work needed: Add UI controls or remove unused server options.
- **CLI search and browse cover only marketplaces on the account; public marketplace search from the CLI is unverified or missing.** Affects: CLI users. Evidence: apps/cli/src/cloud/marketplaces.rs:145-153. Work needed: Add a public-catalogue search command or document the limit.
- **Categories are free text from entries; no curated role or use-case list.** Affects: All browsing users. Evidence: apps/web/features/plugins/server/directory/query.ts:48-65. Work needed: Define a category taxonomy in the registry and map imported entries.
- **The public catalogue depends on an outside public directory and a third-party marketplace repository; terms of that use were not found in the files I read.** Affects: Product and legal owners. Evidence: apps/web/features/plugins/server/directory/constants.ts:1-17. Work needed: Confirm permission and fallback if the outside source changes or disappears.
- **No plugin browsing on Chrome; VS Code has no filters.** Affects: Chrome and VS Code users. Evidence: apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:83-107. Work needed: Product decision.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:GET /api/plugins
- api:GET /api/plugins/{id}
- api:GET /api/plugins/marketplaces/entries
- table:plugin_registry_entries
- file:apps/web/features/plugins/server/directory/query.ts
- file:apps/web/app/api/plugins/route.ts
- SYS-connectors-plugins-and-skills
- SYS-api-and-contracts
- SYS-observability-and-operations
- F054-01

## Unknown

- Where the snapshot cache physically lives (database, Redis or memory) and its size.
- How many plugins the live catalogue holds.
- Licence and permission for the outside directory and marketplace sources.
- Whether the unused server options (offset, verified, status) are used by any client other than tests.
- The web grid's exact empty-state copy.

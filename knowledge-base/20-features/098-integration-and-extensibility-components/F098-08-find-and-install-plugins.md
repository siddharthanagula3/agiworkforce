---
id: "F098-08"
type: "feature"
title: "Find and install plugins"
aliases: ["Plugin registry", "Plugin dependency resolver", "Plugin installer and updater", "Marketplace catalog service", "Plugins directory", "Marketplace source", "S98.17", "S98.19", "S98.20", "S98.25"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.17", "S98.19", "S98.20", "S98.25"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-observability-and-operations", "F098-09", "F098-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-08 Find and install plugins

A hosted list of plugins (packs of skills and connector needs). A signed-in web account can install one, which also installs the plugins it needs, then update, turn off or remove it. A person can also add a public GitHub marketplace, and a daily job refreshes the public directory. The CLI can browse and install too.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.17](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9817), [S98.19](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9819), [S98.20](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9820), [S98.25](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9825).

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

**What it does.** Lists plugins from three sources (built-in registry rows, a cached public directory snapshot, and the person's own marketplaces). Installs a built-in plugin for one account after resolving its dependencies, records which permissions the person approved, offers updates with a diff, and removes plugins. Lets a person register a public GitHub repository as a marketplace and refresh it.

**Why it exists.** Plugins bundle skills and connector needs so a workflow can be added in one step, as ChatGPT and Claude do (doc: docs/product/requirements.md lines 1560-1568 list install, enable or disable, update, uninstall, namespacing and marketplace or source controls).

**Who uses it.** Signed-in people on web and the CLI; desktop users are sent to the web to manage plugins.

**Problems it solves**

- Finding packs of skills without hand-copying files.
- Pulling in the plugins a pack depends on automatically.
- Keeping installed plugins current, and noticing when an installed version was stopped.
- Using a team's or publisher's own plugin catalog.

**Use cases**

- Browse GET /api/plugins and install a built-in pack from the web directory.
- Update an installed plugin after approving any new permissions it asks for.
- Add a public GitHub marketplace on the account and install a plugin from it with the CLI (agi marketplace get plugin@marketplace).
- Remove a plugin; if other plugins depend on it, choose to remove them too.

## 2. User experience

**Where to find it**

- Web: marketing page /plugins and /plugins/[id] (apps/web/app/plugins/page.tsx:1-80); in-app plugin management lives under settings section 'plugins' (apps/web/features/settings/lib/web-settings-sections.ts:78) and the directory UI labels 'Install', 'Installed', 'Required', 'Turned off', 'Built in', 'Partners', 'Marketplace' (apps/web/features/directory/constants.ts:81-103). Exact navigation path inside the app was not traced: unknown.
- Desktop: Settings, Plugins section titled 'Plugins' with a 'Manage plugins' button that opens /settings/plugins in the system browser (apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:9-48).
- CLI: 'agi plugin' (list, install, info, login, configure) and 'agi marketplace' (add, sources, remove, browse, get, show, recommend, search) (apps/cli/src/lib.rs:941-945, 2340-2372).
- Mobile, VS Code, Chrome: no plugin install found; the matrix says absent for all three (doc: docs/product/surface-feature-matrix.md:372-381). Note the capability table lists canUsePlugins true for mobile (packages/contracts/types/src/capabilities.ts:120) while the matrix says false; code is the higher source, and no mobile install code was found.

**Before you start**

- A signed-in account. Plugin routes use a user-scoped database session (apps/web/app/api/plugins/installations/route.ts:43).
- The workspace must allow the 'plugins' feature (apps/web/features/plugins/server/directory/install-gate.ts:11-33).
- Browsing GET /api/plugins needs no sign-in found in the route (apps/web/app/api/plugins/route.ts:51-94).

**Screens and controls**

- Directory tabs 'Built in', 'Partners', 'Marketplace' and group headings 'Built-in packs', 'Partner plugins', 'Marketplace plugins' (apps/web/features/directory/constants.ts:90-103).
- Buttons and states 'Install', 'Installed', 'Desktop and CLI', 'Coming later' (same file, lines 81-85).
- Desktop 'Manage plugins' button, with an error line 'Could not open your plugins.' if the browser cannot open (CloudPluginsSection.tsx:10,45).
- CLI: 'agi marketplace show plugin@marketplace' previews what a plugin adds, the connections it needs and the permissions it asks for (apps/cli/src/lib.rs:2362-2364).

**Journey**

1. Open the plugin directory and search or filter (search, verified, worksWith, source, category, publisher, status, sort, limit, cursor; apps/web/app/api/plugins/route.ts:30-42).
2. Open a plugin and choose Install. The server resolves dependencies, checks policy for the plugin and each dependency, then checks version, signature, digest and scan (installations/route.ts:58-85; plugin-installation-service.ts:303-336).
3. If a dependency is missing or its version clashes, the install is refused with a message naming the plugin (plugin-dependencies.ts:182-206).
4. The page receives the installation and the list of dependencies installed with it (installations/route.ts:117).
5. Later, the updates list shows a newer version with a diff; the person names any new permissions and applies the update (updates/route.ts:26-79; plugin-lifecycle.ts:656-745).
6. To turn off or remove, the server refuses if other plugins depend on it unless the person agrees to include them (installations/[id]/route.ts:49-135).
7. To add a catalog: register a public GitHub repository URL; refresh it later (marketplaces/route.ts:42-76; marketplaces/[id]/refresh/route.ts).

**What the person sees and gets**

- 201 with { installation, dependencies } on install.
- 409 PLUGIN_NOT_INSTALLABLE 'This plugin is not available for Managed Cloud installation.' when not web-installable (installations/route.ts:75-84).
- 409 permission-review message 'now asks for permissions you have not approved ... Open the plugin, choose its new version and approve these permissions before it runs again.' (plugin-installation-service.ts:104).
- 409 'was suspended and cannot be installed: <reason>' (plugin-installation-service.ts:139).
- Marketplace errors: 422 MARKETPLACE_MANIFEST_INVALID and 502 MARKETPLACE_UNREACHABLE (marketplaces/route.ts:63-76).
- Each install, update and removal writes a workspace audit event (installations/route.ts:94-116; updates/route.ts:66-76).

**Settings**

- Per-plugin enabled skills and custom example prompts (plugin-installation-service.ts:525-595).
- Enable or disable a plugin (setWebPluginEnabled, plugin-installation-service.ts:417).
- CLI registry address: environment variable AGI_PLUGIN_REGISTRY_URL or [plugins] registry_url in the CLI config file; no default address (apps/cli/src/features/plugins/registry.rs:9-23,36-40).
- GITHUB_TOKEN on the deployment raises the directory refresh inspection cap (doc: docs/development/plugins-directory.md:68-71).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Directory list GET /api/plugins merges built-in registry rows with a cached public snapshot and filters them (apps/web/features/plugins/server/directory/catalog.ts:30-36; apps/web/app/api/plugins/route.ts:51-94).
- Install with dependency resolution: breadth-first, depth at most 8, at most 32 plugins, version ranges checked for conflicts (apps/web/lib/services/plugin-dependencies.ts:6-7,118-169; plugin-installation-service.ts:255-301).
- A plugin whose dependencies cannot be read is not installed (plugin-installation-service.ts:204-206).
- A built-in plugin may depend only on built-in plugins; a dependency in another marketplace is refused (plugin-installation-service.ts:269-274).
- Dependencies are installed before the root, inside the same install call (plugin-installation-service.ts:346-367).
- Update offers and apply, including repairing an installation pinned to a suspended or deprecated version (plugin-lifecycle.ts:592-745).
- Remove: delete the row, with a dependents check (plugin-installation-service.ts:434; installations/[id]/route.ts:104-135).
- Marketplace source register, refresh (user-triggered, keeps last-known-good entries on failure), list and delete (plugin-marketplace-service.ts:839-1022).
- Daily refresh of the public directory snapshot by cron at 06:08 UTC (vercel.json:157-160; apps/web/app/api/cron/refresh-plugin-directory/route.ts:17-40).
- CLI browse, show, get and search of account marketplaces (apps/cli/src/lib.rs:2340-2372; apps/cli/src/cloud/marketplaces.rs:5,81-82).

**Incomplete**

- User-registered marketplace sources refresh only when a person calls the refresh route. The only caller of refreshMarketplaceSource is that route (apps/web/app/api/plugins/marketplaces/[id]/refresh/route.ts:36); no cron or job was found for them. The daily cron refreshes the public directory, a different store.
- Registry installs only work for plugins marked web-installable with an embedded manifest (plugin-installation-service.ts:190-197); others return PLUGIN_NOT_INSTALLABLE.
- The brief names plugin-lifecycle.ts:603 for update and removal; at HEAD update offers start at line 592, apply at 656, and removal lives in plugin-installation-service.ts:434 and the DELETE handler. The brief predates HEAD.

**Present but disconnected or switched off**

- Migration 0232 (signing, scan table, approved permissions) carries a header 'NOT YET APPLIED : draft only' (apps/web/db/neon/0232_plugin_package_signing_and_permission_review.sql:4). Whether it is applied in each environment is unknown; code reads plugin_package_scans and approved_permissions, so installs would fail without it.

**Not available**

- Mobile, VS Code extension and Chrome extension: no plugin install (doc: docs/product/surface-feature-matrix.md:372-381).
- Desktop: no in-app install; it opens the web (CloudPluginsSection.tsx:38-41).
- Marketplaces from non-GitHub hosts: refused, 'Only public github.com repository URLs are supported.' (plugin-marketplace-service.ts:520-523).

## 4. Required behaviour

**Established requirements**

- A registry lists available plugins with versions and metadata (S98.17). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.17)
- Installing a plugin resolves and installs the plugins it depends on (S98.19). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.19)
- Plugins can be installed, updated to a newer version and uninstalled (S98.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.20)
- A marketplace service registers plugin catalogs and keeps them refreshed (S98.25). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.25)
- Plugin requirements: install, enable/disable, update, uninstall, namespacing, marketplace or source controls, and included MCP servers, skills, hooks, subagents and prompts. (source: doc: docs/product/requirements.md (section 19, lines 1560-1568))

**Acceptance criteria**

1. GET /api/plugins returns entries with total and filters; an invalid query returns 400 INVALID_QUERY.
2. Installing a plugin that depends on two others installs the two others first and returns them in 'dependencies'.
3. Installing a plugin with an unreadable dependency list installs nothing and names the plugin.
4. An update that adds a permission the member has not approved is refused until the member names it.
5. Removing a plugin that others depend on is refused with the dependents named, unless the person agrees to remove them too.
6. A marketplace refresh that fails keeps the old entries and marks the source 'error' with the message.
7. A suspended version cannot be installed and shows its reason.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Update and removal should be offered on every app that shows installed plugins; today only the web and CLI do [inferred from matrix].
- A user-registered marketplace should refresh without a manual call to meet 'keeps them refreshed' [inferred from S98.25 and the lack of a job].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a scheduled refresh for user-registered marketplace sources, bounded by a per-run budget like the directory ingest.
- [proposed] Show update offers in the desktop and CLI plugin screens so the web is not the only place to learn about one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/plugins | `apps/web/app/api/plugins/route.ts` | Lists and filters plugins; rate-limit bucket 'model-catalog'; cache 60s (lines 51-94). |
| service | Directory loader | `apps/web/features/plugins/server/directory/catalog.ts` | Merges built-in registry rows with the cached snapshot (lines 12-36). |
| service | Plugin registry service | `apps/web/lib/services/plugin-registry-service.ts` | Reads plugin_registry_entries and withholds rows with bad data (lines 143-257). |
| table | plugin_registry_entries and plugin_registry_versions | `apps/web/db/neon/0096_plugin_registry.sql` | Registry rows and per-version records (brief S98.17 line 33). |
| endpoint | POST/GET /api/plugins/installations | `apps/web/app/api/plugins/installations/route.ts` | List installs and install with dependencies (lines 31-118). |
| endpoint | PATCH/DELETE /api/plugins/installations/[id] | `apps/web/app/api/plugins/installations/[id]/route.ts` | Turn on or off, and remove, with dependents handling (lines 49, 104). |
| service | Plugin installation service | `apps/web/lib/services/plugin-installation-service.ts` | Plan, prepare, write, enable, remove, enabled list, install counts, settings (lines 190-595). |
| service | Dependency resolver | `apps/web/lib/services/plugin-dependencies.ts` | Parses dependency lists, resolves breadth-first, checks version ranges (lines 77-206). |
| service | Plugin lifecycle service | `apps/web/lib/services/plugin-lifecycle.ts` | Versions, suspend, rollback, update offers (592), apply update (656), lifecycle events (758). |
| endpoint | GET/POST /api/plugins/updates | `apps/web/app/api/plugins/updates/route.ts` | List update offers and apply one; csrf and rate limit 'plugin-installation-write' (lines 26-79). |
| endpoint | Marketplace source routes | `apps/web/app/api/plugins/marketplaces/route.ts` | List and register sources (lines 27-76); also marketplaces/[id]/route.ts, marketplaces/[id]/refresh/route.ts, marketplaces/entries/route.ts. |
| service | Marketplace service | `apps/web/lib/services/plugin-marketplace-service.ts` | Fetch manifest from GitHub, validate, scan, register (839), refresh (909), list (980). |
| table | plugin_marketplace_sources and entries | `apps/web/db/neon/0159_plugin_marketplace_sources.sql` | Stores account marketplaces and their entries (brief S98.25 line 22). |
| table | plugin_installations | `apps/web/db/neon/0109_web_plugin_installations.sql` | One row per account and plugin: installed version, enabled, approved permissions (plus 0232 columns). |
| job | Plugin directory refresh cron | `apps/web/app/api/cron/refresh-plugin-directory/route.ts` | Daily ingest of public marketplaces into the cached snapshot (budget 800 s); snapshot in mcp_response_cache (doc: docs/development/plugins-directory.md:77-88). |
| service | Directory ingest | `apps/web/features/plugins/server/directory/ingest.ts` | Fetch manifests, inspect sources, write snapshot with an ingest lease (lines 68-120). |
| service | Install policy gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Workspace feature gate 'plugins' and per-plugin policy for the plugin and each dependency (lines 24-84). |
| schema | Web route constants | `apps/web/features/plugins/routes.ts` | API paths used by the client for installs, marketplaces and settings. |
| screen | Plugins marketing page | `apps/web/app/plugins/page.tsx` | Public catalogue preview with availability claim. |
| component | Directory labels | `apps/web/features/directory/constants.ts` | Visible labels for plugin states and source tabs (lines 81-103). |
| component | Desktop Plugins section | `apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx` | 'Manage plugins' button that opens the web. |
| command | CLI plugin and marketplace commands | `apps/cli/src/lib.rs` | Subcommand definitions (941, 2340) and the marketplace browse and get flow (7494-7600). |
| service | CLI hosted registry client | `apps/cli/src/features/plugins/registry.rs` | Resolves plugin references against the hosted registry with integrity check; depth 8, 32 plugins (lines 1-60). |
| service | CLI marketplace client | `apps/cli/src/cloud/marketplaces.rs` | Calls /api/plugins/marketplaces, /entries and /marketplace-installations (lines 5, 81-82). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens the directory or runs a CLI command. The client calls GET /api/plugins (or the marketplace routes). | device and our servers | apps/web/app/api/plugins/route.ts:51; apps/cli/src/cloud/marketplaces.rs:5 |
| The server reads built-in rows from the database and the cached public snapshot, merges and filters them, and returns a page. | our servers | apps/web/features/plugins/server/directory/catalog.ts:12-36 |
| On Install the server checks the csrf token, a rate limit, the workspace 'plugins' gate and the per-plugin policy. | our servers | apps/web/app/api/plugins/installations/route.ts:44-61; install-gate.ts:24-52 |
| It resolves dependencies, checks the dependency policy, then for each plugin checks suspension, signed digest, scan record and permissions, then writes the install rows. | our servers | plugin-installation-service.ts:255-367 |
| A workspace audit event 'plugin_installed' is written for each dependency and the root. | our servers | installations/route.ts:94-116 |
| Registering a marketplace fetches the manifest from raw GitHub with a 10 second timeout, validates, scans and stores it in one transaction. | outside service | plugin-marketplace-service.ts:76,514-560,839-907 |
| Once a day the cron refreshes the public directory snapshot from public marketplace manifests and listings. | our servers | vercel.json:157-160; refresh-plugin-directory/route.ts:17-40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Installation rows (plugin, version, enabled, approved permissions, enabled skills) | table:plugin_installations, per user with row level security | Server side only; every app that signs in sees the same list | Hard-deleted on uninstall (plugin-installation-service.ts:434-445); no trash step found |
| Marketplace sources and entries | table:plugin_marketplace_sources, table:plugin_marketplace_entries | Server side | Source deletion via deleteMarketplaceSource (plugin-marketplace-service.ts:1010); retention of entries after that: unknown |
| Public directory snapshot, sync state, inspection cache, ingest lease | table:mcp_response_cache under plugins.directory.* keys | Rebuilt daily | Overwritten each run (doc: docs/development/plugins-directory.md:86-89) |
| Audit events (installed, removed, setting changed, marketplace changed) | workspace audit log (table name not read) | Server side | unknown |

**Models and providers.** No model or provider takes part in finding, installing or updating a plugin. A plugin's skills are used later in chat turns, where any model may run them [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for install, update, remove and marketplace routes (getUserScopedDb in each route). GET /api/plugins showed no sign-in check. |
| Permissions | Workspace policy: the 'plugins' feature must be allowed and each plugin must pass the plugin policy (install-gate.ts:11-52). Members manage their own installs; an admin can suspend a version (plugin-lifecycle.ts:428). |
| Subscription | No plan name is checked in the plugin routes read. A capability 'canUsePlugins' exists and an administrator switch for 'plugins' closes it (apps/web/lib/services/capability-handshake-service.ts:180-185; packages/contracts/types/src/capabilities.ts:54,87,120). Whether any plan's 'tier' layer denies plugins was not read: unknown. |
| Limits and metering | Rate-limit buckets 'model-catalog' (reads) and 'plugin-installation-write' (writes); limit values not read. Dependency caps 8 levels and 32 plugins (plugin-dependencies.ts:6-7). Marketplace manifest byte and plugin-count caps exist (constants PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES and PLUGIN_MARKETPLACE_MAX_PLUGINS; values not read). |
| Feature flags | Environment variable GITHUB_TOKEN (directory refresh), PLUGIN_SIGNING_PUBLIC_KEYS (trust keys, see F098-09). |
| Model compatibility | none found in the code. The CLI capability message has a 'model' layer ('with the current model') that could deny a capability, but no plugin rule using it was read (apps/cli/src/tier_cache.rs:376-392). |
| Provider restrictions | none found in the code. Marketplaces must be public github.com repositories (plugin-marketplace-service.ts:520-523). |
| Local mode | Web install is Managed Cloud only (installations/route.ts:79-80). The desktop says Local Mode extensions are managed in Local settings and never installed or enabled from the Cloud account (CloudPluginsSection.tsx:50-53). The CLI can install from a local folder or git URL without the hosted registry (apps/cli/src/features/plugins/registry.rs:3-5); whether that needs an account was not read: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | The plugins page has a loading file; directory UI loading states not opened: unknown. | apps/web/app/plugins/loading.tsx |
| Empty directory | The marketing page shows 'The catalogue below has the full picture.' when there are no preview entries; app empty states not opened. | apps/web/app/plugins/page.tsx:73-77 |
| Registry unavailable | GET /api/plugins returns 503 PLUGIN_REGISTRY_UNAVAILABLE and logs 'Plugin directory list failed'. | apps/web/app/api/plugins/route.ts:87-93 |
| Bad registry row | The row is withheld from the list and logged '[plugins] registry row withheld'. | plugin-registry-service.ts:230-236 |
| Missing or conflicting dependency | Install refused with a 409 message that names the dependency and the root. | plugin-dependencies.ts:39-46,182-206 |
| Update raced by another change | Update fails with 'changed while it was being updated. Reload and try again.' | plugin-lifecycle.ts:731-735 |
| Marketplace fetch fails on refresh | Source status becomes 'error', last_error saved (up to 1000 characters), old entries kept. | plugin-marketplace-service.ts:951-975 |
| Offline or timeout | Manifest fetch aborts after 10 seconds; the registration returns 502 MARKETPLACE_UNREACHABLE only for fetch errors. Retry is manual. | plugin-marketplace-service.ts:76,519-525; marketplaces/route.ts:71-76 |
| Cancel | Not handled in the code: no cancel path for an in-flight install found. | plugin-installation-service.ts:346-367 |
| Accessibility and app differences | Desktop shows a role='alert' error line; plugin screens' accessibility otherwise not opened: unknown. | CloudPluginsSection.tsx:41-45 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/plugin-installation-service.test.ts`: Install counts without user ids; refusal of suspended, unsigned, unscanned, mismatched and untrusted packages; install of a signed scanned entry and the shipped pack.
- `apps/web/lib/services/plugin-lifecycle.test.ts`: Update with scan and signature checks, permission re-approval, racing installs.
- `apps/web/lib/services/plugin-registry-service.test.ts`: Registry row mapping and list paging.
- `apps/web/lib/services/plugin-marketplace-service.test.ts`: GitHub URL parsing, manifest fetch limits, register, refresh (hash unchanged, changed, failed), permission review on refresh.
- `apps/web/app/api/plugins/__tests__/route.test.ts`: GET /api/plugins route.
- `apps/web/app/api/plugins/installations/__tests__/route.test.ts`: Install, list, patch and delete routes.
- `apps/web/app/api/plugins/updates/__tests__/route.test.ts`: Update list, rate limit, csrf, apply and audit, bad body.
- `apps/web/app/api/plugins/marketplaces/__tests__/route.test.ts`: Marketplace register and list route.
- `apps/web/app/api/plugins/marketplaces/[id]/refresh/__tests__/route.test.ts`: Refresh route.
- `apps/web/app/api/cron/refresh-plugin-directory/route.test.ts`: Cron route auth and summary.
- `apps/web/features/plugins/server/directory/__tests__/ingest.test.ts`: Directory ingest.
- `apps/cli/src/features/plugins/registry.rs`: Inline tests of hosted registry resolution (test module in the file, around lines 760-870).

**Test scenarios**

- **Install with a dependency**
  1. Sign in on web with a workspace that allows plugins.
  2. Pick a built-in plugin that declares one dependency.
  3. Install it.
  4. List installations.
  - Expected: 201; 'dependencies' names the extra plugin; both appear in GET /api/plugins/installations.
- **Update asks for new permission**
  1. Install a plugin.
  2. Publish a newer version that adds a permission.
  3. Open GET /api/plugins/updates, then POST without acknowledging it.
  - Expected: Refused with the unapproved permission named; succeeds when it is listed in acknowledgedPermissions.
- **Remove with dependents**
  1. Install plugin A which depends on B.
  2. DELETE B without withDependents.
  3. DELETE B again with the with-dependents query set.
  - Expected: First call refused with A named; second removes A then B and writes two plugin_removed events.
- **Marketplace refresh failure**
  1. Register a public GitHub marketplace.
  2. Break its manifest in the repository.
  3. POST the refresh route.
  - Expected: Source status 'error' with last_error text; earlier entries still listed.
- **CLI browse and get**
  1. Sign in to the CLI.
  2. agi marketplace sources, then agi marketplace browse, then agi marketplace get plugin@marketplace.
  - Expected: Sources and entries list; get installs or refuses with a scan or permission message.

**Where to look when it fails**

- Logs: 'Plugin directory list failed', '[plugins] registry row withheld', 'Plugin marketplace source registered', 'Plugin marketplace refresh failed; keeping last-known-good cache', 'Plugin directory refreshed'.
- Error names: PluginDependencyError, PluginPermissionReviewRequiredError, PluginVersionSuspendedError, PluginPackageRefusedError, PluginLifecycleError, PluginMarketplaceValidationError, PluginMarketplaceFetchError.
- Tables: plugin_installations, plugin_registry_versions, plugin_registry_lifecycle_events, plugin_marketplace_sources (status, last_error), mcp_response_cache.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **User-registered marketplaces are not refreshed automatically** Affects: Web, CLI and every app showing account marketplaces. Evidence: The only caller of refreshMarketplaceSource is the refresh route (apps/web/app/api/plugins/marketplaces/[id]/refresh/route.ts:36); S98.25 says 'keeps them refreshed'. Work needed: Add a scheduled job with a budget and per-source backoff.
- **No plugin install on mobile, VS Code and Chrome, and desktop only opens the web** Affects: Desktop, mobile, VS Code, Chrome. Evidence: doc: docs/product/surface-feature-matrix.md:372-381; CloudPluginsSection.tsx:38-41. Work needed: Decide per app whether to build it; the capability table already says true for mobile (capabilities.ts:120), which disagrees with the matrix.
- **Uninstall deletes the row without a recorded undo and the confirmation UI was not opened** Affects: Web users. Evidence: plugin-installation-service.ts:434-445; AGENTS.md section 9 on irreversible actions. Work needed: Check the web remove control uses the confirm surface naming what stops working.
- **Migration 0232 may not be applied** Affects: All installs. Evidence: 0232 header 'NOT YET APPLIED : draft only'. Work needed: Confirm applied state with 'pnpm db:migrate -- status' per environment.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-observability-and-operations
- F098-09
- F098-10

## Unknown

- Exact in-app navigation to the plugin directory and its loading, empty and error screens on web.
- Whether any plan's tier layer denies plugins.
- Rate-limit values for 'model-catalog' and 'plugin-installation-write'.
- Whether migration 0232 is applied in each environment.
- How long audit events and deleted marketplace entries are kept.
- Whether the CLI local-folder install needs an account.
- Which plan names, if any, change plugin limits.

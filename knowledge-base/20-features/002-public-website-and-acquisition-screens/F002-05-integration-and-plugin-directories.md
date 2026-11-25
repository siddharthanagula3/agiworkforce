---
id: "F002-05"
type: "feature"
title: "Integration and plugin directories"
aliases: ["MCP connector directory", "Connector directory", "Integrations page", "Plugin catalogue", "Plugin marketplace", "Plugin detail page", "Connector detail page", "S2.14", "S2.15", "S2.19", "S2.20"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.14", "S2.15", "S2.19", "S2.20"]
depends_on: ["surface:web", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "table:mcp_response_cache", "table:plugin_registry_entries", "table:plugin_registry_versions", "file:packages/contracts/types/src/connector-release.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-05 Integration and plugin directories

Public, signed-out browsing of the connector (MCP) directory and the plugin catalogue. Search and category filter exist on the connector directory only. Connectors and plugins each have a detail page. /integrations is an explanation page, not a directory. Connect and install need an account.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.14](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s214), [S2.15](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s215), [S2.19](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s219), [S2.20](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s220).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists indexed remote MCP servers at /connectors/mcp-directory with search, category pills and a community view, and a detail page per server (apps/web/app/connectors/mcp-directory/page.tsx; apps/web/app/connectors/mcp-directory/[...id]/page.tsx). Lists plugin packs at /plugins from the registry and a detail page per pack with status, install command, declared capabilities and release history (apps/web/app/plugins/page.tsx; apps/web/app/plugins/[id]/page.tsx:77,259-300). /integrations explains the three connection patterns (apps/web/app/integrations/page.tsx:40-62).

**Why it exists.** Visitors should see what AGI can connect to and which packs exist before signing up, and the lists must not claim more than is installable.

**Who uses it.** Prospective users, workspace admins checking publishers and tools, and developers looking for the CLI plugin install command.

**Problems it solves**

- Inspect publisher, sign-in mode and listed tools before connecting (apps/web/app/connectors/mcp-directory/[...id]/page.tsx:95-130)
- Know whether a pack is installable, declared only, deprecated or suspended (apps/web/app/plugins/[id]/page.tsx:36-42,131-145)
- Registry outage shows an honest message, not an empty list (apps/web/features/plugins/server/registry-source.ts:34-41)

**Use cases**

- Search the connector directory for a tool and open its page
- Open /plugins and read which packs install on the web
- Open a plugin to copy the CLI install command with its checksum
- Check a plugin's release history for a suspended version

## 2. User experience

**Where to find it**

- Web nav Resources: 'Integrations' (/integrations), 'MCP directory' (/connectors/mcp-directory) (apps/web/features/marketing/components/system/nav.ts)
- Web: /plugins and /plugins/<id>; listed on the site map page (apps/web/app/sitemap-page/page.tsx:32)
- Other apps: not applicable; installed packs are managed in Settings on the web (/apps)

**Before you start**

- None to browse
- An account to connect a connector or install a web pack

**Screens and controls**

- Connector directory: search box, category select and pills, 'Featured' and 'All connectors' groups, 'Show Community listings' link, 'Clear' link, up to 60 cards (apps/web/app/connectors/mcp-directory/page.tsx:60-125)
- Connector detail: button 'Sign in to see connectors' (while connectors are Coming soon) or 'Sign in to connect', 'Back to the directory'; ledger of publisher, sign-in mode, endpoint host, version, links; listed tools (apps/web/app/connectors/mcp-directory/directory-public.ts:11-15)
- Plugins page: catalogue cards linking to /plugins/<id>, button 'What a plugin bundles', and 'Sign up to install' or 'Open plugin settings' (apps/web/app/plugins/PluginsCta.tsx:7-24)
- Plugin detail: buttons 'Open Plugin settings', 'How installation works', 'Back to plugins'; sections Details, Install, Release history, Declared skills, Declared capabilities, Required connectors

**Journey**

1. Visitor opens the directory or catalogue
2. Optionally searches or picks a category (connectors only)
3. Opens a card to the detail page
4. Reads publisher, tools, status and history
5. Clicks the sign-in or install action, which goes to sign-in or to /apps

**What the person sees and gets**

- Counts and notices: short-list notice, community notice, limit note over 60 matches, empty message with clear link (apps/web/app/connectors/mcp-directory/__tests__/McpDirectoryPage.test.tsx:151-190)
- Plugin status sentences from availability.ts, for example how many packs install on the web (apps/web/features/plugins/availability.ts:36-75)
- Message 'The plugin registry is temporarily unreachable...' on outage (apps/web/app/plugins/page.tsx:130-134)

**Settings**

- Directory view parameters q, category, view=community in the address (apps/web/app/connectors/mcp-directory/page.tsx:77-80)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Connector directory with search over name, publisher, description and tool names, category filter, featured ordering, page size 60 (apps/web/app/connectors/mcp-directory/page.tsx:56-61,85-100,115-125)
- Per-connector detail pages at /connectors/mcp-directory/[...id]; not found for a record that cannot be connected now; unknown records not indexed (apps/web/app/connectors/mcp-directory/[...id]/page.tsx:49-61,97-100)
- Directory snapshot refreshed by a scheduled job and stored compressed in a server cache table with a 7-day lifetime (apps/web/app/api/cron/refresh-connector-directory/route.ts; apps/web/lib/connectors/directory/snapshot-cache.ts:13-17)
- Plugin catalogue read from the registry table through a 300-second render cache plus a per-request memo (apps/web/features/plugins/server/registry-source.ts:51-95; apps/web/lib/server/render-cache.ts:39)
- Plugin detail with fallback to the plugin directory when the registry lacks the id; release history read per request, never cached (apps/web/features/plugins/server/registry-source.ts:43-50,108-120)
- Pages stay public: /connectors and /skills switch on the signed-in state, mcp-directory does not (apps/web/proxy.ts:182-192)

**Incomplete**

- Plugin catalogue has no search or filter; it lists up to 100 registry entries (apps/web/features/plugins/server/registry-source.ts:32-38)
- Plugin detail shows capabilities as declarations and says they are not enforced by a sandbox (apps/web/app/plugins/[id]/page.tsx: Declared capabilities section)
- Connector detail and plugin detail pages are not in the sitemap (apps/web/app/sitemap.ts:59-64 lists only the index pages)

**Present but disconnected or switched off**

- Connecting is off: the connector release state is 'coming_soon', so the pages say 'Sign in to see connectors' and offer no custom connector row (packages/contracts/types/src/connector-release.ts:13-14; apps/web/app/connectors/mcp-directory/directory-public.ts:11-15)

**Not available**

- Searchable /integrations directory and /integrations/<name> detail pages do not exist: apps/web/app/integrations holds only page.tsx; per-integration detail exists only as connector pages under /connectors/mcp-directory
- Plugin search and filter

## 4. Required behaviour

**Established requirements**

- A logged-out visitor can browse and search a directory of available integrations (S2.14) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.14)
- A logged-out visitor can browse the plugin catalogue read from the live registry, with a path to install (S2.15) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.15)
- Each integration has its own public detail page (S2.19, brief status missing) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.19)
- Each plugin has a public detail page with description, permissions, install info and release history (S2.20) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.20)
- Documentation availability stays separate from account, region and route availability; MCP and tool discovery depend on a harness (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Signed out, /connectors/mcp-directory lists records and a search narrows them
2. A connector card opens a detail page with publisher and tools; an unknown id returns 404
3. Signed out, /plugins lists the registry packs or says the registry is unreachable
4. A plugin page shows its release history with the stopped versions marked
5. A web-installable pack's button goes to /apps; a declared-only pack offers no install command
6. No page offers Connect while connectors are Coming soon
7. Community records need view=community and never include API-key servers

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A visitor expects plugin search like connector search [inferred from S2.15 'browse the catalogue' and the connector pattern]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add search and category filter to /plugins
- [proposed] Add the detail pages to the sitemap where indexable
- [proposed] Decide whether S2.19 means /integrations/<name> pages or accepts the connector pages and update the brief

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Integrations page | `apps/web/app/integrations/page.tsx` | Explains MCP, bridge and provider-key patterns; links to the directory |
| screen | MCP directory page | `apps/web/app/connectors/mcp-directory/page.tsx` | Search, categories, cards, notices |
| screen | MCP directory detail page | `apps/web/app/connectors/mcp-directory/[...id]/page.tsx` | Record ledger and listed tools |
| config | Directory public constants | `apps/web/app/connectors/mcp-directory/directory-public.ts` | Labels, notices, view parameter, safe link helpers |
| service | Directory snapshot cache | `apps/web/lib/connectors/directory/memory-cache.ts` | In-memory view of the stored snapshot |
| service | Directory snapshot store | `apps/web/lib/connectors/directory/snapshot-cache.ts` | Reads and writes the compressed snapshot, sync state, ingest lease |
| table | mcp_response_cache | `apps/web/lib/connectors/mcp-runtime-cache.ts` | Server table holding the snapshot rows |
| job | Connector directory refresh cron | `apps/web/app/api/cron/refresh-connector-directory/route.ts` | Scheduled ingest, optional rebuild mode |
| job | Plugin directory refresh cron | `apps/web/app/api/cron/refresh-plugin-directory/route.ts` | Scheduled refresh of the plugin directory snapshot |
| config | Connector release state | `packages/contracts/types/src/connector-release.ts` | coming_soon switch that hides Connect |
| screen | Plugins page | `apps/web/app/plugins/page.tsx` | Catalogue, status sentence, install section |
| screen | Plugin detail page | `apps/web/app/plugins/[id]/page.tsx` | Details, install, release history, skills, capabilities, connectors |
| component | PluginsCta | `apps/web/app/plugins/PluginsCta.tsx` | Sign up to install or Open plugin settings |
| service | Plugin registry source | `apps/web/features/plugins/server/registry-source.ts` | Cached catalogue, entry and release history readers |
| service | Plugin registry service | `apps/web/lib/services/plugin-registry-service.ts` | Reads plugin_registry_entries |
| table | plugin_registry_entries | `apps/web/lib/services/plugin-registry-service.ts` | Catalogue rows |
| table | plugin_registry_versions | `apps/web/lib/services/plugin-lifecycle.ts` | Per-version status and changelog |
| config | Plugin availability text | `apps/web/features/plugins/availability.ts` | Status labels and sentences from computed counts |
| service | Plugin directory catalog | `apps/web/features/plugins/server/directory/catalog.ts` | Fallback entries for ids not in the registry |
| service | Render cache | `apps/web/lib/server/render-cache.ts` | 300-second catalog cache with tags |
| test | Plugins page test | `apps/web/app/plugins/page.test.tsx` | Catalogue claims and CTAs |
| test | Plugin detail test | `apps/web/app/plugins/[id]/page.test.tsx` | Detail states and release history |
| test | MCP directory tests | `apps/web/app/connectors/mcp-directory/__tests__/McpDirectoryPage.test.tsx` | Search, notices, lists |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A scheduled job ingests registry sources into a snapshot stored in the server database | our servers | apps/web/app/api/cron/refresh-connector-directory/route.ts:12-35; apps/web/lib/connectors/directory/snapshot-cache.ts:13-17 |
| The page loads the snapshot, filters by connectable state, listing rules, search text and category, and renders up to 60 | our servers | apps/web/app/connectors/mcp-directory/page.tsx:92-110 |
| For plugins the page reads registry entries through the render cache from the server database | our servers | apps/web/features/plugins/server/registry-source.ts:27-36,60-67 |
| A detail page reads the entry, falls back to the directory snapshot, and reads release history from the versions table | our servers | apps/web/features/plugins/server/registry-source.ts:38-50,108-120 |
| Install or connect clicks go to sign-up or settings; nothing connects from a public page | device | apps/web/app/plugins/PluginsCta.tsx:14-24; apps/web/app/connectors/mcp-directory/[...id]/page.tsx:127 ('Reading this page connects nothing') |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector directory snapshot (records, icon index, sync state) | Server table mcp_response_cache | Server only | Snapshot lifetime 7 days, sync state 30 days (apps/web/lib/connectors/directory/snapshot-cache.ts:13-17) |
| Plugin entries and versions | Tables plugin_registry_entries and plugin_registry_versions | Server only | Owned by the plugin lifecycle; deletion rules not reviewed |

**Models and providers.** No model is called. The directory lists MCP servers from the official MCP registry and an AGI vendor directory (apps/web/app/connectors/mcp-directory/directory-public.ts:SOURCE_LABELS); the page states the provider authenticates connections itself.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None to browse; an account to connect or install. |
| Permissions | Public. Records the public list cannot connect, API-key servers and unchecked payment connectors are not listed (apps/web/app/connectors/mcp-directory/directory-public.ts: COMMUNITY_VIEW_NOTICE). |
| Subscription | none found in the code for browsing. |
| Limits and metering | none found in the code for browsing; the connector page caps at 60 records. |
| Feature flags | Connector release state 'coming_soon' (packages/contracts/types/src/connector-release.ts:13-14) with a list of selectively released connector ids at line 16; plugin install availability computed from the entries (apps/web/features/plugins/availability.ts). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Web has no Local mode. Pages say MCP servers and own keys run in the CLI, whose status is Coming soon (apps/web/app/integrations/page.tsx:40-50). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Directory empty or bootstrapping | Page says the index is incomplete while bootstrap runs | apps/web/app/connectors/mcp-directory/__tests__/McpDirectoryPage.test.tsx:190 |
| No search match | Empty message with a clear link | apps/web/app/connectors/mcp-directory/__tests__/McpDirectoryPage.test.tsx:180 |
| Short default list | Notice that only hand-checked connectors are listed by default and a link to the community view | apps/web/app/connectors/mcp-directory/directory-public.ts:SHORT_LIST_NOTICE |
| Registry unreachable | Catalogue shows a status message; detail page shows 'Registry unreachable.' | apps/web/app/plugins/page.tsx:130-134; apps/web/app/plugins/[id]/page.tsx:100-120 |
| Unknown plugin id | 404 only when neither registry nor directory has it, never when the registry is merely down | apps/web/features/plugins/server/registry-source.test.ts:62-95 |
| Deprecated or suspended version | Release history labels 'Deprecated, do not install' and 'Suspended, installs stopped' | apps/web/app/plugins/[id]/page.tsx:36-42 |
| Unsafe publisher link | Not rendered as a link | apps/web/app/connectors/mcp-directory/[...id]/page.test.tsx:137 |
| Loading | Route loading files exist for /plugins and /connectors | apps/web/app/plugins/loading.tsx; apps/web/app/connectors/loading.tsx |
| Offline, retry, cancel | not handled in the code; pages are server rendered (reload is the retry) | no client fetch in these pages |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/connectors/mcp-directory/__tests__/McpDirectoryPage.test.tsx`: Search, category links, filters summary, limit note, empty state, bootstrap notice, featured grouping, release-state wording, community view rules
- `apps/web/app/connectors/mcp-directory/[...id]/page.test.tsx`: Detail fields and tools, honest missing values, unsafe links, not found, slash ids, canonical path, noindex for unknown
- `apps/web/app/connectors/mcp-directory/__tests__/directory-public.test.ts`: Public directory helpers (contents not opened)
- `apps/web/app/plugins/page.test.tsx`: Heading, unreachable registry, empty vs declared-only, web and CLI counts, sign-up and settings CTAs, wording
- `apps/web/app/plugins/[id]/page.test.tsx`: Web pack to settings, release history, pinned command wrapping, CLI wording, connector heading, fragment target, marketplace and partner packs
- `apps/web/features/plugins/server/registry-source.test.ts`: Catalogue, outage vs empty, entry, directory fallback, unavailable states
- `apps/web/app/plugins/__tests__/plugin-lifecycle.test.ts`: Plugin lifecycle (contents not opened)
- `apps/web/app/api/cron/refresh-connector-directory/__tests__/route.test.ts`: Refresh cron route (contents not opened)

**Test scenarios**

- **Search connectors**
  1. Signed out, open /connectors/mcp-directory
  2. Type a tool or publisher name
  3. Pick a category
  - Expected: List narrows; filter summary and clear link show
- **Open a connector**
  1. Click a card
  - Expected: Detail page with publisher, sign-in mode, tools and a sign-in button; nothing connects
- **Plugin catalogue**
  1. Open /plugins signed out
  2. Open one pack
  - Expected: Pack page with status, history; 'Sign up to install' on the list page
- **Registry outage**
  1. Make the database unreachable
  2. Open /plugins and /plugins/<id>
  - Expected: Unreachable messages, no 404
- **Suspended version**
  1. Mark a version suspended in the registry
  2. Open the pack
  - Expected: History shows 'Suspended, installs stopped' without waiting for the cache
- **Missing integration page**
  1. Open /integrations/anything
  - Expected: 404 (gap)

**Where to look when it fails**

- Cron route logs 'Connector directory refreshed' or 'Connector directory refresh cron job failed'
- Error class DirectorySnapshotUnreadableError when the snapshot cannot be decoded
- Tables mcp_response_cache, plugin_registry_entries, plugin_registry_versions

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **S2.19: /integrations has no per-integration pages; connector detail pages exist elsewhere** Affects: Visitors looking for an integration by name. Evidence: apps/web/app/integrations contains only page.tsx; apps/web/app/connectors/mcp-directory/[...id]/page.tsx exists. Work needed: Decide the canonical route and align the brief; link /integrations to the directory (already linked)
- **No search or filter on /plugins** Affects: Visitors browsing plugins. Evidence: apps/web/app/plugins/page.tsx has no search input. Work needed: Add query and category filters
- **Detail pages missing from the sitemap** Affects: Search discovery. Evidence: apps/web/app/sitemap.ts:59-64. Work needed: Add indexable records and packs
- **Connect is switched off for all connectors** Affects: All visitors on Web. Evidence: packages/contracts/types/src/connector-release.ts:13. Work needed: Release decision and verification, owned by SYS-connectors-plugins-and-skills

**Depends on**

- surface:web
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- table:mcp_response_cache
- table:plugin_registry_entries
- table:plugin_registry_versions
- file:packages/contracts/types/src/connector-release.ts

## Unknown

- How often the directory refresh cron runs (schedule not read)
- Whether the registry currently holds packs
- Which records are in the live snapshot
- How the cache invalidation tag is triggered on publish
- Whether S2.19 intends pages under /integrations
- Contents of the plugin-lifecycle and directory-public tests

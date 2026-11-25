---
id: "F054-03"
type: "feature"
title: "Add a git repository as a marketplace"
aliases: ["Add marketplace", "Repository-backed marketplace", "Plugin marketplace source", "Sync marketplace", "agi marketplace add", "Add GitHub source", "S54.07", "POST /api/plugins/marketplaces"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.07"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:cloud", "api:POST /api/plugins/marketplaces", "api:GET /api/plugins/marketplaces", "api:POST /api/plugins/marketplace-installations", "table:plugin_marketplace_sources", "table:plugin_marketplace_entries", "file:apps/web/lib/services/plugin-marketplace-service.ts", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-03 Add a git repository as a marketplace

A person adds a public GitHub repository that holds a plugin marketplace manifest. The server fetches and checks it, scans it, saves it as a source on the account and lists its plugins, which can then be installed on every surface. Web, Desktop, CLI and VS Code can add; mobile can only list sources because the add form is switched off.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.07](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5407).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Registers a GitHub repository as a personal plugin marketplace, caches the plugins it lists and lets the person refresh or remove it (apps/web/app/api/plugins/marketplaces/route.ts:39-95; apps/web/lib/services/plugin-marketplace-service.ts:839-907).

**Why it exists.** Brief S54.07: a user can add a git repository as a plugin marketplace and install plugins listed in it. The migration says it adds a self-serve path beyond the curated catalogue (apps/web/db/neon/0159_plugin_marketplace_sources.sql:3-20).

**Who uses it.** Developers, teams and publishers who host their own plugin list; also people following a publisher's instructions to add their marketplace.

**Problems it solves**

- Installing a plugin that is not in the built-in or public catalogue.
- Sharing a set of plugins by publishing one repository.
- Keeping the server's outbound fetch to a known host (github.com only).

**Use cases**

- Add a publisher's marketplace from the web Plugins tab and install one plugin.
- Run 'agi marketplace add owner/repo' then 'agi marketplace get plugin@marketplace'.
- In VS Code choose 'Add GitHub source' in the marketplace picker.
- Refresh a marketplace after the repository changed.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Customize, Plugins, 'Add marketplace' action; dialog title 'Add marketplace' with 'Add from a repository', fields 'Repository url' and 'Branch or tag (optional)', button 'Sync marketplace' (packages/ui/ui/src/directory/constants.ts:226-236). Added sources become tabs next to Marketplace, removable and refreshable (apps/web/features/directory/services/plugins-directory.ts:1108-1124).
- CLI: 'agi marketplace add <owner/repo or URL> [--ref <tag>] [--name <name>]', 'agi marketplace sources', 'agi marketplace remove <id>' (apps/cli/src/lib.rs:2340-2362).
- VS Code: 'Code: Browse AGI Cloud Marketplace', then 'Manage marketplace sources', then 'Add GitHub source' (apps/extension-vscode/src/features/surfaces/accountMarketplaceSources.ts:115).
- Mobile: Plugins screen title menu, then 'Sources' shows sources; the 'Add a marketplace' form exists but is hidden because FEATURES.pluginMarketplaceAdmin is false (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:267; apps/mobile/lib/v1FeatureFlags.ts:32).
- Chrome: not available.

**Before you start**

- Signed in with an AGI account.
- A public github.com repository with a marketplace manifest.
- Mobile: Cloud mode.

**Screens and controls**

- Web dialog: Repository url, Branch or tag (optional), Sync marketplace, Cancel. No name field in the dialog; the API accepts an optional name (packages/ui/ui/src/directory/AddMarketplaceDialog.tsx:73; packages/contracts/cloud-contracts/src/plugin-marketplaces.ts:172-178).
- CLI: arguments repository_url, --ref, --name; prints 'Added <name> to your account (<n> plugins).' (apps/cli/src/lib.rs:2758-2778).
- VS Code: input boxes 'Public GitHub repository URL' and 'Branch, tag, or commit' (apps/extension-vscode/src/features/surfaces/accountMarketplaceSources.ts:23-40).
- Mobile sources screen: lists each source with status, a Sync again button, Remove marketplace, entries with Install or Remove (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:309-410).

**Journey**

1. Open the add control and enter the repository address (and optional branch).
2. The surface sends it to the server, which checks it is a public GitHub address, fetches the manifest, validates and scans it.
3. On success the source appears with its plugin count and the plugins show in the list under that source.
4. Pick a plugin and install it (F054-06 shows what it includes).
5. Later use refresh to re-read the repository, or remove to forget it.

**What the person sees and gets**

- Web failure copy: 'That marketplace could not be synced.' (apps/web/features/directory/constants.ts:244); validation issues are returned as a list.
- Server errors: 422 MARKETPLACE_MANIFEST_INVALID with issues, 502 MARKETPLACE_UNREACHABLE, 400 INVALID_MARKETPLACE_SOURCE 'Provide a public GitHub repository URL.' for a malformed body (apps/web/app/api/plugins/marketplaces/route.ts:46-90).
- CLI success line with plugin count; CLI errors pass the server message (apps/cli/src/lib.rs:2758-2778).

**Settings**

- Optional ref (branch, tag) and optional name when adding. Sources whose name begins 'agi:installed:' are internal shadow sources and are hidden from the list (apps/web/app/api/plugins/marketplaces/route.ts:34; apps/web/features/plugins/server/directory/constants.ts:48-54).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/plugins/marketplaces: CSRF check, rate limit 20 per minute per user (fail-closed), strict body (repositoryUrl up to 2000 characters, ref and name up to 200), audit event 'plugin_marketplace_changed' (apps/web/app/api/plugins/marketplaces/route.ts:39-76; apps/web/lib/rate-limit.ts:519-523; packages/contracts/cloud-contracts/src/plugin-marketplaces.ts:172-178).
- Service: only public github.com URLs (else 'Only public github.com repository URLs are supported.' as a 422), fetch manifest, check connectors against the known connector catalogue, scan, refuse if the scan blocks, upsert the source by canonical URL, replace entries, write dependency declarations, review permission changes in one transaction (apps/web/lib/services/plugin-marketplace-service.ts:839-897, 598-611).
- Refresh and remove endpoints exist (apps/web/app/api/plugins/marketplaces/[id]/route.ts; apps/web/app/api/plugins/marketplaces/[id]/refresh) with route tests (apps/web/app/api/plugins/marketplaces/__tests__/route.test.ts:198-250).
- Web adapter addMarketplace, refreshMarketplace, removeMarketplace (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1544, 1906, 1922).
- CLI add, sources, remove, browse, show, get (apps/cli/src/lib.rs:7499-7617); owner/repo shorthand is converted to a URL by marketplace_repository_url (apps/cli/src/lib.rs:2765-2766).
- VS Code add, refresh and remove source (apps/extension-vscode/src/features/surfaces/accountMarketplaceSources.ts:55-105).

**Incomplete**

- The brief says the web route 'accepts only a public GitHub address and anything else is refused with a message'. In code a non-GitHub address passes the body check and is refused later as a 422 with the message 'Only public github.com repository URLs are supported.'; only an empty or oversize body gets the 400 (apps/web/app/api/plugins/marketplaces/route.ts:46-56; apps/web/lib/services/plugin-marketplace-service.ts:844-849).
- Web dialog does not offer the optional name field that the API and CLI accept (packages/ui/ui/src/directory/constants.ts:226-236).
- No limit on the number of sources per user was found (none found in the code I read).

**Present but disconnected or switched off**

- Mobile 'Add a marketplace' and 'Submit to directory' are switched off by FEATURES.pluginMarketplaceAdmin = false (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:267, 364; apps/mobile/lib/v1FeatureFlags.ts:32).

**Not available**

- Chrome extension: no marketplace code.
- Non-GitHub hosts, private repositories and local paths cannot be registered as account marketplaces (the CLI 'marketplace install' from a local path or git URL is a different, on-device install, apps/cli/src/lib.rs:2392-2405).

## 4. Required behaviour

**Established requirements**

- A user can add a git repository as a plugin marketplace and install plugins listed in it. (source: S54.07 (brief))
- The web route accepts only a public GitHub repository address and refuses anything else with a message. (source: S54 first-draft behaviour; code: apps/web/lib/services/plugin-marketplace-service.ts:844-849)
- A manifest that does not validate is refused with the list of issues. (source: apps/web/app/api/plugins/marketplaces/route.ts:71-85 (code))
- Each add writes an audit event. (source: apps/web/app/api/plugins/marketplaces/route.ts:65-70 (code))
- Server fetches only from a fixed known host and pins the manifest by content hash. (source: apps/web/db/neon/0159_plugin_marketplace_sources.sql:8-12 (migration comment))
- Marketplace and source controls are part of the plugin requirements; source revocation must be clear. (source: doc: docs/product/requirements.md section 19; docs/product/competitive-guidance.md items 101-102)
- Plugin content must be treated as untrusted and reviewed. (source: doc: docs/product/competitive-guidance.md item 101)

**Acceptance criteria**

1. Adding https://github.com/<owner>/<repo> with a valid manifest returns 201 and a source with entry count.
2. Adding https://example.com/x returns 422 with 'Only public github.com repository URLs are supported.'.
3. A manifest naming an unknown connector returns 422 MARKETPLACE_MANIFEST_INVALID listing that plugin and connector.
4. A repository that cannot be fetched returns 502 MARKETPLACE_UNREACHABLE.
5. A request without a CSRF token does not create a source.
6. After a successful add, an audit event of type plugin_marketplace_changed exists for the user.
7. Adding the same repository twice updates the same source rather than creating a second.
8. Removing the source removes its tab and plugins from the list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Adding a repository does not install anything; installs are a separate action that is checked against workspace policy (apps/web/app/api/plugins/marketplace-installations/route.ts:148).
- [inferred] Because the table has row level security keyed to user, one person's sources are invisible to others (apps/web/db/neon/0159_plugin_marketplace_sources.sql:42-54).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the optional name field to the web dialog.
- [proposed] Return 400 with the GitHub message for a non-GitHub address so clients can tell it apart from a bad manifest.
- [proposed] Enable the mobile add form after review, or remove the hidden code (doc: AGENTS.md section 9 forbids dead controls).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/plugins/marketplaces | `apps/web/app/api/plugins/marketplaces/route.ts` | List and register sources; CSRF, rate limit, audit, error mapping. |
| endpoint | DELETE /api/plugins/marketplaces/{id} | `apps/web/app/api/plugins/marketplaces/[id]/route.ts` | Remove a source. |
| endpoint | POST /api/plugins/marketplaces/{id}/refresh | `apps/web/app/api/plugins/marketplaces/[id]/refresh` | Re-read the repository. |
| endpoint | GET /api/plugins/marketplaces/entries | `apps/web/app/api/plugins/marketplaces/entries` | List cached entries of the user's sources. |
| service | registerMarketplaceSource | `apps/web/lib/services/plugin-marketplace-service.ts` | Parse GitHub URL, fetch, validate, scan, upsert source and entries (lines 839-907). |
| service | refreshMarketplaceSource | `apps/web/lib/services/plugin-marketplace-service.ts` | Re-fetch and update a source (line 909). |
| schema | RegisterMarketplaceBodySchema | `packages/contracts/cloud-contracts/src/plugin-marketplaces.ts` | Strict body: repositoryUrl, ref, name (lines 172-178). |
| table | plugin_marketplace_sources | `apps/web/db/neon/0159_plugin_marketplace_sources.sql` | One row per user source; github-only URL check; RLS (lines 22-55). |
| table | plugin_marketplace_entries | `apps/web/db/neon/0159_plugin_marketplace_sources.sql` | Cached plugins per source (insert at plugin-marketplace-service.ts:622). |
| event | plugin_marketplace_changed audit event | `apps/web/app/api/plugins/marketplaces/route.ts` | Audit record on registration (line 65). |
| hook | useDirectoryAdapter marketplace actions | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | addMarketplace (1544), refreshMarketplace (1906), removeMarketplace (1922). |
| component | AddMarketplaceDialog | `packages/ui/ui/src/directory/AddMarketplaceDialog.tsx` | The add dialog (line 73). |
| component | DirectoryPanel add control | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Shows the add action (line 885). |
| command | agi marketplace add and sources and remove | `apps/cli/src/lib.rs` | Handlers at 7499-7527; add_marketplace at 2758. |
| service | CLI marketplace cloud client | `apps/cli/src/cloud/marketplaces.rs` | list, add, remove calls to /api/plugins/marketplaces (lines 5-100). |
| command | VS Code marketplace sources | `apps/extension-vscode/src/features/surfaces/accountMarketplaceSources.ts` | Add, refresh, remove source via quick picks. |
| screen | Mobile PluginSourcesScreen | `apps/mobile/src/features/plugins/PluginSourcesScreen.tsx` | Lists sources and entries; add form hidden by flag. |
| service | Mobile sourcesService | `apps/mobile/src/features/plugins/sourcesService.ts` | addMarketplace, refresh, remove, install entry (lines 51-100). |
| config | mobile feature flag | `apps/mobile/lib/v1FeatureFlags.ts` | pluginMarketplaceAdmin false. |
| test | marketplace route tests | `apps/web/app/api/plugins/marketplaces/__tests__/route.test.ts` | List, register 201, 400, 422, 502, CSRF, remove, refresh. |
| test | marketplace service tests | `apps/web/lib/services/plugin-marketplace-service.test.ts` | Service logic (cases not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person enters the repository address; the surface posts it with a CSRF token (web) or account token (CLI, VS Code, mobile). | device and our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1544; apps/cli/src/lib.rs:2758-2772 |
| The server checks CSRF, rate limit and the body shape. | our servers | apps/web/app/api/plugins/marketplaces/route.ts:41-56 |
| The server checks it is a github.com repository and fetches the marketplace manifest from GitHub. | outside service | apps/web/lib/services/plugin-marketplace-service.ts:844-853; apps/web/features/plugins/server/directory/constants.ts:59-62 |
| The server validates the manifest against the connector catalogue, scans its text and refuses if blocked. | our servers | apps/web/lib/services/plugin-marketplace-service.ts:854-864 |
| In one transaction the source is inserted or updated, entries are replaced, dependency declarations are written and permission changes are reviewed. | our servers | apps/web/lib/services/plugin-marketplace-service.ts:869-897 |
| An audit event is recorded and the source summary is returned with 201. | our servers | apps/web/app/api/plugins/marketplaces/route.ts:65-78 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Marketplace source (name, repository URL, ref, status, content hash, last sync, last error) | table plugin_marketplace_sources, row level security by user | account level, visible on every surface for the same user | deleted when the user removes it or the profile is deleted (on delete cascade, apps/web/db/neon/0159_plugin_marketplace_sources.sql:24) |
| Marketplace entries (plugin key, name, description, version, skills, connectors, agents, permissions) | table plugin_marketplace_entries | account level | replaced on each sync; removed with the source (on delete cascade) |
| Audit event plugin_marketplace_changed | security audit log (recordAuditEvent) | server only | retention not traced |

**Models and providers.** No model or provider is used. The manifest scan is a rule scan, not a model call (apps/web/lib/services/plugin-marketplace-service.ts:858-864; exact scanner not read).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account required (user-scoped database, apps/web/app/api/plugins/marketplaces/route.ts:40). |
| Permissions | Per-user; no workspace permission needed. Installing from the source is later checked against the workspace plugin policy (apps/web/app/api/plugins/marketplace-installations/route.ts:148). |
| Subscription | No plan gate on adding a marketplace found. CLI commands browse, search, recommend, show and get refuse if the capability document denies canUseMarketplace; 'add', 'sources' and 'remove' have no such check in the handler (apps/cli/src/lib.rs:7499-7527 versus 7529-7560). |
| Limits and metering | 20 writes per minute per user, fail-closed (apps/web/lib/rate-limit.ts:519-523). No cap on number of sources found. |
| Feature flags | Mobile pluginMarketplaceAdmin false hides the add form. |
| Model compatibility | Not model dependent. |
| Provider restrictions | Source host must be github.com (apps/web/db/neon/0159_plugin_marketplace_sources.sql:29-30). |
| Local mode | Adding a marketplace needs our servers, so it is Cloud only. Mobile Local mode shows the Cloud gate (apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:187). CLI 'marketplace install <path or git URL>' installs on the device without our servers (apps/cli/src/lib.rs:7634-7643). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| invalid body | 400 INVALID_MARKETPLACE_SOURCE. | apps/web/app/api/plugins/marketplaces/route.ts:46-56 |
| non-GitHub address | 422 with 'Only public github.com repository URLs are supported.' | apps/web/lib/services/plugin-marketplace-service.ts:844-849 |
| manifest invalid or scan blocks | 422 MARKETPLACE_MANIFEST_INVALID with issues. | apps/web/app/api/plugins/marketplaces/route.ts:71-85; plugin-marketplace-service.ts:861-863 |
| repository unreachable | 502 MARKETPLACE_UNREACHABLE. | apps/web/app/api/plugins/marketplaces/route.ts:86-91 |
| missing CSRF | Request refused, nothing registered. | apps/web/app/api/plugins/marketplaces/__tests__/route.test.ts:189 |
| retry | Same address again updates the existing source and resets status to active. | apps/web/lib/services/plugin-marketplace-service.ts:870-879 |
| session changed during VS Code add | The mutation is refused and the user must reopen the marketplace. | apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:38-48 |
| timeout | VS Code requests time out at 20 seconds; web and CLI timeouts not handled in the code I read. | apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:50 |
| cancel | VS Code input boxes return undefined on Escape and nothing is sent; web dialog has Cancel. | packages/ui/ui/src/directory/constants.ts:236 |
| offline or recovery | A failed source keeps status 'error' and last_error; refresh retries (schema fields status, last_error). | apps/web/db/neon/0159_plugin_marketplace_sources.sql:28-34 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/plugins/marketplaces/__tests__/route.test.ts`: List sources, register 201, missing url 400, manifest invalid 422 with issues, unreachable 502, CSRF refusal, remove 204, 404s.
- `apps/web/app/api/plugins/marketplaces/[id]/refresh/__tests__/route.test.ts`: Refresh a source.
- `apps/web/lib/services/plugin-marketplace-service.test.ts`: Marketplace service (cases not read).
- `apps/web/db/neon/plugin-marketplace-sources-migration.test.ts`: Migration shape of the sources table.
- `packages/ui/ui/src/directory/__tests__/AddMarketplaceDialog.test.tsx`: The add dialog.
- `apps/extension-vscode/src/__tests__/accountMarketplace.test.ts`: Install stops when the credential changes during review.
- `apps/mobile/src/features/plugins/__tests__/PluginSources.test.tsx`: Sources screen including the flag-controlled admin controls (line 187-192).

**Test scenarios**

- **Add a valid repository**
  1. Sign in on web.
  2. Plugins tab, Add marketplace, enter a public GitHub repo with a valid manifest, Sync marketplace.
  - Expected: A new source tab appears with its plugins; audit event recorded.
- **Reject a non-GitHub address**
  1. Enter https://gitlab.com/x/y.
  - Expected: Message 'Only public github.com repository URLs are supported.' and no source.
- **Bad manifest**
  1. Add a repository whose manifest lists an unknown connector.
  - Expected: 422 with an issue naming the plugin and connector.
- **CLI add then install**
  1. agi marketplace add owner/repo
  2. agi marketplace browse
  3. agi marketplace get plugin@marketplace
  - Expected: Add prints plugin count; get prints an install receipt; the plugin shows in the web Plugins tab.
- **Remove**
  1. Remove the source from web.
  - Expected: Tab and its plugins disappear on web, CLI sources and VS Code.
- **Mobile flag**
  1. Open Plugins, Sources on a phone build.
  - Expected: Sources listed; no 'Add a marketplace' form.

**Where to look when it fails**

- Server log 'Plugin marketplace source registered' with userId, sourceId, ref (apps/web/lib/services/plugin-marketplace-service.ts:899-902).
- Table plugin_marketplace_sources columns status and last_error.
- Audit events of type plugin_marketplace_changed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **Mobile cannot add a marketplace (hidden by flag).** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:32; apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:267. Work needed: Decide: enable the form or delete it.
- **Web dialog lacks the optional name.** Affects: Web and Desktop users. Evidence: packages/ui/ui/src/directory/constants.ts:226-236. Work needed: Add the field or drop the option.
- **No visible per-user cap on sources and no per-source size cap found.** Affects: Server load. Evidence: apps/web/lib/services/plugin-marketplace-service.ts:839-907. Work needed: Confirm limits in fetchMarketplaceManifest or add caps.
- **Error status for non-GitHub address is 422 while the brief and the route copy imply a simple refusal.** Affects: API clients. Evidence: apps/web/app/api/plugins/marketplaces/route.ts:46-56. Work needed: Align the status and message.
- **Chrome extension has no marketplace support.** Affects: Chrome users. Evidence: apps/extension/src. Work needed: Product decision.
- **CLI add, sources, remove do not check the plan capability the other marketplace commands check.** Affects: CLI users on plans that deny the marketplace. Evidence: apps/cli/src/lib.rs:7499-7527 versus 7529-7560. Work needed: Confirm intent and align.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:cloud
- api:POST /api/plugins/marketplaces
- api:GET /api/plugins/marketplaces
- api:POST /api/plugins/marketplace-installations
- table:plugin_marketplace_sources
- table:plugin_marketplace_entries
- file:apps/web/lib/services/plugin-marketplace-service.ts
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-api-and-contracts

## Unknown

- How fetchMarketplaceManifest bounds size and time (function at plugin-marketplace-service.ts:514 not read).
- What the scanner checks.
- Audit-log retention.
- Whether a user can add unlimited sources.
- Whether 'name' is shown anywhere other than the tab label.

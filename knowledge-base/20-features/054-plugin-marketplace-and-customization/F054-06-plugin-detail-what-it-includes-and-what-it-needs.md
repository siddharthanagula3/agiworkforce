---
id: "F054-06"
type: "feature"
title: "Plugin detail: what it includes and what it needs"
aliases: ["Plugin detail", "Plugin page", "What it includes", "Works with", "Publisher details", "Included skills, connectors, agents, commands, hooks", "Supported surfaces", "S54.12", "S54.13", "S54.14", "S54.15", "S54.16", "S54.17", "S54.18", "S54.20", "agi plugin info", "agi marketplace show"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (3 of 7)", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S54.12", "S54.13", "S54.14", "S54.15", "S54.16", "S54.17", "S54.18", "S54.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:GET /api/plugins/{id}", "api:GET /api/plugins/{id}/scan", "api:GET /api/plugins/{id}/versions", "table:plugin_registry_entries", "table:plugin_marketplace_entries", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "F054-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-06 Plugin detail: what it includes and what it needs

Opening a plugin shows its publisher, description, version, what it includes (skills, commands, agents, connectors, MCP servers, hooks), which surfaces it works on, permissions and security scan. Web and Desktop show the full page. Mobile has a detail screen too. CLI shows details of installed plugins and marketplace plugins. VS Code shows skills only.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.12](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5412), [S54.13](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5413), [S54.14](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5414), [S54.15](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5415), [S54.16](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5416), [S54.17](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5417), [S54.18](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5418), [S54.20](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5420).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (3 of 7) |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows what a plugin is and what it needs before and after install: publisher, category, version, included parts, connectors and their status, permissions, works-with chips and an 'Install from the CLI' hint when the web cannot run it (packages/ui/ui/src/directory/PluginDetailView.tsx:791-1150; apps/web/features/directory/services/plugins-directory.ts:972-1015).

**Why it exists.** Brief S54.12 to S54.18 and S54.20: see publisher, open detail, see included skills, connectors, agents, commands and hooks, and supported surfaces. Product rules ask for trustworthy publishers and explicit packaging (doc: docs/product/competitive-guidance.md items 98, 101).

**Who uses it.** Anyone deciding whether to install a plugin; admins checking what a workspace plugin does.

**Problems it solves**

- Knowing what a plugin will add before installing.
- Knowing why a plugin cannot run on this app (agents and hooks need the CLI).
- Seeing who published it and whether it is verified, unreviewed or community.

**Use cases**

- A web user opens a plugin and reads its Skills and Connectors tabs.
- A phone user checks 'What it includes' and 'Works with' before tapping Install.
- A developer runs 'agi plugin info <name>' to see the publisher, signature and hook events.
- A VS Code user checks 'Skills: ...' under an installed plugin.

## 2. User experience

**Where to find it**

- Web and Desktop: click a plugin card in Settings, Customize, Plugins; the detail view has a back link, header with name, publisher, category and verified badge, Install or Installed button (packages/ui/ui/src/directory/PluginDetailView.tsx:870-905).
- Publisher page: the publisher name opens a list filtered to that publisher, heading prefix 'Plugins by' (packages/ui/ui/src/directory/PluginDetailView.tsx:1109; apps/web/features/directory/constants.ts:156).
- Mobile: tap a plugin row; screen 'Plugin' with cards 'What it includes', 'Connectors', 'Permissions', 'Security scan', 'Version', 'Customize', 'Try asking', 'More from <publisher>' (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:304-610).
- CLI: 'agi plugin info <name>' for an installed plugin (apps/cli/src/lib.rs:6810); 'agi marketplace show <plugin>@<marketplace>' before installing (apps/cli/src/lib.rs:7596).
- VS Code: 'Code: Show Plugins' lists an installed plugin with 'Skills: <names>' as detail (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:495-500); the marketplace picker shows Permissions, Connectors, Skills and Agents in the install prompt (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:118-136).
- Chrome: not available.

**Before you start**

- Signed in; mobile in Cloud mode.
- Web: the plugin must be in the directory or the user's marketplaces.

**Screens and controls**

- Web labels: 'Publisher', 'Category', 'Version', 'Works with', 'Homepage', 'Repository', 'Marketplace', 'Source', 'Last updated', 'Skills', 'Commands', 'Agents', 'MCP servers', 'Hooks', 'Language servers', 'Try asking', tabs 'Plugin contents' with Skills, Commands, Agents, Connectors (packages/ui/ui/src/directory/constants.ts:152-197; packages/ui/ui/src/directory/PluginDetailView.tsx:469-472).
- Web notes: 'Agents run in the agi CLI, not in chat.' and hooks value 'Included. Hooks run in the agi CLI, not in chat.' (packages/ui/ui/src/directory/constants.ts:159-160).
- Web badges: verified, unreviewed (note), community (note) (packages/ui/ui/src/directory/PluginDetailView.tsx:877-886, 970-981).
- Web non-installable: status 'Desktop and CLI' or the entry's availability note, with 'Install from the CLI' and a 'Copy install command' control (packages/ui/ui/src/directory/constants.ts:163-166; PluginDetailView.tsx:856, 902).
- Mobile: button 'Install' or 'Not available on mobile' (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:369).

**Journey**

1. Pick a plugin from the list.
2. Read header, description and badges.
3. Read what it includes and the Connectors tab (each connector shows Connected or Not connected, with a Connect button).
4. Check 'Works with' and any availability note.
5. Install, or copy the CLI command if the web cannot run it.
6. After install, switch it on or off and choose skills (see the install feature).

**What the person sees and gets**

- Badges Verified, Unreviewed, Community and matching notes.
- Connector status chips Connected and Not connected; a lock notice when connectors are coming soon (packages/ui/ui/src/directory/PluginDetailView.tsx:569-596).
- CLI info prints rows Name, Version, Publisher, Signature, About, Homepage, Source, License, Installed, State, Skills, Commands, Agents, Hooks, MCP, Connects, Trust, Setting (apps/cli/src/features/plugins/plugins.rs:380-470, 478-537).

**Settings**

- After install: Enabled switch and per-skill switches on web (packages/ui/ui/src/directory/PluginDetailView.tsx:440-466, 530-560); owned by the install feature.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web detail mapping fills publisher profile (name, kind label, URL), description, verified, community, category, permissions, version, example prompts, components, install command, runtime note, links, source label, updated date and works-with labels (apps/web/features/directory/services/plugins-directory.ts:972-1015).
- Components summary shows skills, commands count, agents, MCP servers with transport, hooks and language servers; skills, commands and agents are shown in tabs when the tabs exist (packages/ui/ui/src/directory/PluginDetailView.tsx:155-200, 700-770).
- Included connectors are listed with status from the account (packages/ui/ui/src/directory/PluginDetailView.tsx:600-660; apps/web/features/directory/services/plugins-directory.ts:1072-1100).
- Works-with chips show Web, CLI, Cowork (apps/web/features/directory/constants.ts:150-154; packages/ui/ui/src/directory/PluginDetailView.tsx:1139).
- Web decides installable with isPluginEntryWebInstallable and gives reasons: Cowork only, source unknown, not inspected, CLI hooks, language server, stdio MCP server, only agents (apps/web/features/plugins/server/directory/constants.ts:106-120).
- Detail endpoint GET /api/plugins/{id} returns the entry and recomputes skillsRequireInstall (apps/web/app/api/plugins/[id]/route.ts:21-60; apps/web/app/api/plugins/__tests__/route.test.ts:331).
- Mobile detail: includes (skills, agents, MCP servers, command count, a line 'Runs hooks around tool calls'), connectors with Connect, permissions, security scan, publisher's other plugins, works-with line (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:333-610; apps/mobile/src/features/plugins/pluginsModel.ts:251-262).
- CLI plugin info prints publisher (manifest publisher or author), signature, skill, command and agent counts, hook events, MCP servers, connected apps and a trust warning that hooks and MCP servers run with the user's permissions (apps/cli/src/features/plugins/plugins.rs:380-537).
- CLI marketplace show prints one marketplace plugin's additions, connections and permissions (apps/cli/src/lib.rs:7596-7603; apps/cli/src/cloud/marketplaces.rs:366).
- VS Code lists skills that belong to each installed plugin by path (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:441-456, 495-500).

**Incomplete**

- Included hooks run only after install and only in the CLI: web and mobile list them but do not run them (packages/ui/ui/src/directory/constants.ts:159; apps/mobile/src/features/plugins/PluginDetailScreen.tsx:397). This matches the brief; the web copy says 'Hooks run in the agi CLI, not in chat'.
- CLI plugin info shows counts for skills, commands and agents, not their names (apps/cli/src/features/plugins/plugins.rs:480-488).
- VS Code shows skill names only; no publisher, agents, commands, hooks or works-with for installed plugins, and the marketplace prompt lists only permissions, connectors, skills, agents (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:118-136).
- Publisher detail comes from the registry or manifest entry; its depth (profile page, verification source) is limited to name, kind, URL (apps/web/features/directory/services/plugins-directory.ts:980-986).
- Mobile 'Works with' is a single line from the entry's worksWith field (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:333).

**Present but disconnected or switched off**

- CLI included hooks: shown in info; they run through the CLI hook system after install (apps/cli/src/features/hooks/hooks.rs; the install-to-run path was not traced).

**Not available**

- Plugin detail on Chrome.
- Dedicated detail screens in VS Code (quick pick only).
- CLI detail for public-directory plugins not yet added to the account (info works for installed plugins only).

## 4. Required behaviour

**Established requirements**

- A user can see details about a plugin's publisher. (source: S54.12 (brief))
- A user can open a plugin's detail page. (source: S54.13 (brief))
- A plugin shows the skills it includes, and they become usable when installed. (source: S54.14 (brief))
- A plugin shows the connectors it includes, and they work when installed. (source: S54.15 (brief))
- A plugin shows the agents it includes, and they are usable when installed. (source: S54.16 (brief))
- A plugin shows the commands it includes, and they are usable when installed. (source: S54.17 (brief))
- A plugin shows the hooks it includes, and they run when installed (CLI only). (source: S54.18 (brief))
- A plugin shows which surfaces it works on. (source: S54.20 (brief))
- Included items are shown from the package contents; hooks run only after install and only in the CLI. (source: code: packages/ui/ui/src/directory/constants.ts:159-160; apps/web/features/plugins/server/directory/constants.ts:112-113)
- Install lifecycle must handle unavailable dependencies and explain missing credentials, unavailable runtimes and failed fetches without claiming installation. (source: doc: docs/product/experience-contract.md row W15; docs/product/competitive-guidance.md item 99)
- Show what a plugin can access and inspect permissions and executable code. (source: doc: docs/product/competitive-guidance.md items 101, 103)

**Acceptance criteria**

1. Opening a plugin on web shows its publisher name, category, version and verified or unreviewed or community badge.
2. The Skills tab lists each declared skill as a slash command with its description.
3. The Connectors tab lists each required connector with Connected or Not connected.
4. A plugin with agents shows the note 'Agents run in the agi CLI, not in chat.'.
5. A plugin with hooks shows 'Hooks run in the agi CLI, not in chat.'.
6. A plugin the web cannot run shows 'Desktop and CLI' or its note and a copyable install command, and no Install button.
7. 'Works with' chips match the entry's worksWith values.
8. agi plugin info <name> prints Publisher, Signature and hook events for an installed plugin.
9. Mobile shows 'Not available on mobile' for a plugin that is not web installable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because installable depends on the plugin's contents, the list of included parts must be read from the inspected package, not the marketing text.
- [inferred] 'Works with: Web' means Cloud chat can load it; it does not mean the phone can run local parts.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show works-with in terms of AGI surfaces (Web, Desktop, Mobile, CLI, VS Code, Chrome) instead of Web, CLI, Cowork, since the labels come from the imported source (apps/web/features/directory/constants.ts:150-154).
- [proposed] Add publisher, agents and commands to the VS Code plugin entries.
- [proposed] List names, not counts, for commands and agents in agi plugin info.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Shared detail screen: header, badges, components, tabs, connectors, works-with, settings. |
| config | directory UI copy | `packages/ui/ui/src/directory/constants.ts` | Labels and notes for plugin detail (lines 152-197). |
| service | toPluginDetail | `apps/web/features/directory/services/plugins-directory.ts` | Maps a directory entry to the detail model (line 972). |
| service | pluginConnectorRows | `apps/web/features/directory/services/plugins-directory.ts` | Connector rows with account status (line 1072). |
| hook | useDirectoryAdapter loadDetail | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Loads the entry and attaches connectors and review (line 1205; fetch at 1125). |
| endpoint | GET /api/plugins/{id} | `apps/web/app/api/plugins/[id]/route.ts` | Returns one entry from the registry or snapshot. |
| endpoint | GET /api/plugins/{id}/scan | `apps/web/app/api/plugins/[id]/scan` | Security scan result shown on the detail. |
| endpoint | GET/PATCH /api/plugins/{id}/settings | `apps/web/app/api/plugins/[id]/settings` | Installed settings and per-skill switches. |
| endpoint | GET /api/plugins/{id}/versions | `apps/web/app/api/plugins/[id]/versions` | Versions for the version selector. |
| service | inspection | `apps/web/features/plugins/server/directory/inspection.ts` | Reads a plugin repository to find skills, commands, agents, hooks, MCP and language servers. |
| service | entries | `apps/web/features/plugins/server/directory/entries.ts` | Builds directory entries including runtime notes and publisher. |
| config | runtime notes | `apps/web/features/plugins/server/directory/constants.ts` | Reasons the web cannot install (lines 106-120). |
| schema | plugin directory wire schemas | `packages/contracts/cloud-contracts/src/plugin-directory.ts` | Entry, publisher, runtime components schemas used by mobile and VS Code. |
| screen | Mobile PluginDetailScreen | `apps/mobile/src/features/plugins/PluginDetailScreen.tsx` | Detail with includes, connectors, permissions, scan, versions, customize, more from publisher. |
| service | Mobile pluginIncludes and compatibility | `apps/mobile/src/features/plugins/pluginsModel.ts` | pluginIncludes (251), pluginCompatibility (119), pluginWorksWith (239). |
| service | CLI describe_plugin | `apps/cli/src/features/plugins/plugins.rs` | Info text and plugin_contents (lines 380-537). |
| command | agi plugin info | `apps/cli/src/lib.rs` | Handler at line 6810. |
| service | CLI render_entry_detail | `apps/cli/src/cloud/marketplaces.rs` | Marketplace plugin detail (line 366). |
| command | CLI hooks | `apps/cli/src/features/hooks/hooks.rs` | Runs plugin hooks in the CLI. |
| command | VS Code plugin list | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Plugin rows with included skills (lines 418-515). |
| command | VS Code marketplace detail prompt | `apps/extension-vscode/src/features/surfaces/accountMarketplace.ts` | Permissions, connectors, skills, agents in the install prompt. |
| test | PluginDetailView tests | `packages/ui/ui/src/directory/__tests__/PluginDetailView.test.tsx` | Detail rendering cases. |
| test | mobile plugin screens tests | `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx` | Detail screen install and needs (line 547). |
| config | surface capability descriptor | `packages/contracts/types/src/capabilities.ts` | managed-plugins availability map (lines 299-308). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens a plugin; the adapter fetches the entry by id and, for built-in packs, the registry detail. | our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1125-1135; apps/web/app/api/plugins/[id]/route.ts:21-60 |
| The adapter joins the account's connector status and installed settings to the entry and maps it to the detail model. | device and our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1125-1135; apps/web/features/directory/services/plugins-directory.ts:972-1015 |
| The detail view decides what to show: Install, Installed with Uninstall, or the CLI hint, using installable and installed flags. | device | packages/ui/ui/src/directory/PluginDetailView.tsx:856, 896-905 |
| The scan result and versions are requested for the plugin. | our servers | apps/web/app/api/plugins/[id]/scan/__tests__/route.test.ts; apps/mobile/src/features/plugins/PluginDetailScreen.tsx:91-100 |
| Plugin contents (skills, commands, agents, hooks, servers) were determined earlier by the ingest job, which reads the plugin's source on GitHub. | outside service | apps/web/features/plugins/server/directory/inspection.ts; apps/web/features/plugins/server/directory/ingest.ts:146 |
| CLI info reads the installed plugin's manifest and signature from disk. | device | apps/cli/src/features/plugins/plugins.rs:380-470 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plugin entry metadata (publisher, components, permissions, worksWith) | built-in: database registry; others: directory snapshot cache; user marketplaces: plugin_marketplace_entries | server side, read by every surface | snapshot TTL 7 days (apps/web/features/plugins/server/directory/constants.ts:122) |
| Security scan record | server (scanAndRecordPluginPackage); exact table not traced | server side | not traced |
| CLI plugin files and manifest | plugin folders on the computer | no | until removed |

**Models and providers.** No model or provider is used. Example prompts are text from the plugin, not generated.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on web, Desktop, mobile and VS Code. CLI info needs none; marketplace show needs an account. |
| Permissions | none found in the code for viewing a detail beyond sign-in; workspace blocks apply at install (F054-04). |
| Subscription | No plan gate for viewing details found (apps/web/lib/services/capability-handshake-service.ts:39-42). |
| Limits and metering | The detail endpoint uses the 'model-catalog' rate limit, 120 per minute per IP (apps/web/app/api/plugins/[id]/route.ts:28; apps/web/lib/rate-limit.ts:459). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. Works-with labels (Web, CLI, Cowork) come from the imported source and name AGI surfaces only partly (apps/web/features/plugins/server/directory/constants.ts:76-84). |
| Local mode | Web has no Local mode. Mobile in Local mode shows the Cloud gate (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:289). CLI plugin info works fully on the device; hooks and local MCP servers run on the computer with the user's permissions (apps/cli/src/features/plugins/plugins.rs:530-535). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Settings loading label 'Loading plugin settings'; mobile loads entry, installs, scan, updates together. | packages/ui/ui/src/directory/constants.ts:394; apps/mobile/src/features/plugins/PluginDetailScreen.tsx:91-100 |
| error | Mobile 'Could not load this plugin' with 'Try again'; web settings read failure shows an alert instead of an empty list. | apps/mobile/src/features/plugins/PluginDetailScreen.tsx:307-309; packages/ui/ui/src/directory/__tests__/PluginDetailView.test.tsx:315 |
| unknown id | 404; traversal or oversized id 404 without service call. | apps/web/app/api/plugins/__tests__/route.test.ts:304-320 |
| registry failure | 503. | apps/web/app/api/plugins/__tests__/route.test.ts:322 |
| not inspected or cannot run on web | No Install button; note and CLI command shown. | apps/web/features/plugins/server/directory/constants.ts:106-120; packages/ui/ui/src/directory/PluginDetailView.tsx:856 |
| connectors coming soon | Rows locked with a notice and no Connect button. | packages/ui/ui/src/directory/__tests__/PluginDetailView.test.tsx:351 |
| scan fails to load on mobile | Scan call result null; section shows its fallback. | apps/mobile/src/features/plugins/PluginDetailScreen.tsx:93 |
| offline, timeout, cancel | not handled in the code beyond the load error and retry. | apps/mobile/src/features/plugins/PluginDetailScreen.tsx:307-309 (only a load error with 'Try again'); no timeout handling seen in packages/ui/ui/src/directory/PluginDetailView.tsx |
| accessibility | Definition lists, labelled switches and tab roles; mobile cards have text labels. | packages/ui/ui/src/directory/PluginDetailView.tsx:88-100, 440-466 |
| unreviewed or community | Badge and notice shown so the person knows it was not reviewed. | packages/ui/ui/src/directory/PluginDetailView.tsx:877-886, 970-981 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/directory/__tests__/PluginDetailView.test.tsx`: Header with name, publisher, verified glyph and Install; Installed with Uninstall; CLI-only explanation with copy command; components summary; example prompts; links; works-with chips; enable switch; skills as slash commands; connectors status and Connect; locked connectors; unreviewed mark; failed settings read alert.
- `apps/web/app/api/plugins/__tests__/route.test.ts`: Detail: registry entry, snapshot fallback, 404, traversal id, 503, skillsRequireInstall.
- `apps/web/features/plugins/server/directory/__tests__/inspection.test.ts`: Source inspection of plugin contents.
- `apps/web/features/plugins/server/directory/__tests__/entries.test.ts`: Directory entry building.
- `apps/web/app/api/plugins/[id]/scan/__tests__/route.test.ts`: Scan endpoint.
- `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx`: Detail screen: install, needs, installed controls, refocus, failure retry.
- `apps/mobile/src/features/plugins/__tests__/pluginsModel.test.ts`: Includes and compatibility helpers (cases not read).
- `apps/cli/src/features/plugins/plugins.rs`: In-file tests, if any, of describe_plugin (not read).

**Test scenarios**

- **Web detail content**
  1. Open a built-in plugin that ships skills and connectors.
  2. Read Skills and Connectors tabs.
  - Expected: Each skill is listed as /<name> with description; each connector shows Connected or Not connected.
- **CLI-only plugin**
  1. Open a plugin that ships hooks.
  - Expected: No Install button; 'Install from the CLI' with a copyable command and the hooks note.
- **Works with**
  1. Compare the chips with the entry's worksWith in GET /api/plugins/{id}.
  - Expected: Same values, labelled Web, CLI, Cowork.
- **Mobile compatibility**
  1. Open a non-web-installable plugin on the phone.
  - Expected: Button reads 'Not available on mobile' with the entry's note.
- **CLI info**
  1. agi plugin install <folder with hooks and an MCP server>
  2. agi plugin info <name>
  - Expected: Rows Publisher, Signature, Skills count, Hooks 'runs commands on <events>', MCP, Trust.
- **VS Code skills**
  1. Install a plugin that has skills in the CLI.
  2. Run Code: Show Plugins.
  - Expected: The plugin row's detail reads 'Skills: <names>'.

**Where to look when it fails**

- 404 or 503 from /api/plugins/{id}; log 'Plugin directory list failed' pattern for list.
- Entry fields runtime.components, runtime.note, worksWith, webInstallable in the response.
- CLI: 'No installed plugin named ...' message for a wrong name (apps/cli/src/lib.rs:6819-6823).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **VS Code shows only skills for installed plugins; no publisher, agents, commands, hooks or works-with.** Affects: VS Code users. Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:495-500. Work needed: Add the detail rows from the CLI plugin info output.
- **Brief says mobile detail missing; code has it. Product matrix also says absent.** Affects: Planning. Evidence: apps/mobile/src/features/plugins/PluginDetailScreen.tsx; docs/product/surface-feature-matrix.md:376. Work needed: Update brief and matrix.
- **CLI info lists counts for commands and agents, not names.** Affects: CLI users. Evidence: apps/cli/src/features/plugins/plugins.rs:480-488. Work needed: Print names.
- **Works-with vocabulary is Web, CLI, Cowork from an outside source, not AGI's six surfaces.** Affects: All users reading 'Works with'. Evidence: apps/web/features/directory/constants.ts:150-154; apps/web/features/plugins/server/directory/constants.ts:76-84. Work needed: Map to AGI surfaces.
- **No plugin detail on Chrome; no detail for public-directory plugins in the CLI.** Affects: Chrome and CLI users. Evidence: apps/extension/src; apps/cli/src/lib.rs:6810. Work needed: Product decision.
- **Whether bundled hooks truly run after a CLI install was not traced end to end.** Affects: Plugin authors. Evidence: apps/cli/src/features/hooks/hooks.rs not read in detail. Work needed: Trace and add a test.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:GET /api/plugins/{id}
- api:GET /api/plugins/{id}/scan
- api:GET /api/plugins/{id}/versions
- table:plugin_registry_entries
- table:plugin_marketplace_entries
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- F054-02

## Unknown

- Whether the CLI runs bundled hooks right after install in the normal agent loop (install-to-run path not traced).
- How publisher 'verified' is decided (source of entry.verified for external entries).
- Where the security scan record is stored.
- Contents of the in-file CLI tests.
- Whether the Skills tab uses names from the inspected package or from the registry for non-built-in plugins in every case.

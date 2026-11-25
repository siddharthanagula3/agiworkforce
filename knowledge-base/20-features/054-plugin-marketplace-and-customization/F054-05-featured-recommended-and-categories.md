---
id: "F054-05"
type: "feature"
title: "Featured, recommended and categories"
aliases: ["Featured plugins", "Recommended plugins", "Popular plugins", "Recommended for you", "Suggest plugins (CLI recommend)", "S54.10", "S54.11"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.10", "S54.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "api:GET /api/plugins", "api:GET /api/plugins/marketplaces/entries", "F054-02", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "file:apps/mobile/src/features/plugins/pluginsModel.ts", "file:apps/cli/src/cloud/marketplaces.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-05 Featured, recommended and categories

Editorial 'featured' plugins do not exist. Instead, derived suggestions exist on some apps: web and Desktop group up to six popular plugins, mobile shows Popular and 'Recommended for you' (plugins that use connectors you already connected), and the CLI has 'agi marketplace recommend' that matches the current project. Categories are covered in F054-02.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.10](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5410), [S54.11](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5411).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Highlights plugins without the user searching. Web and Desktop mark the top installed verified plugins as popular; mobile adds a rule-based 'Recommended for you' shelf; the CLI suggests marketplace plugins that fit the folder's language, tools and packages (apps/web/features/directory/services/plugins-directory.ts:1222-1239; apps/mobile/src/features/plugins/pluginsModel.ts:138-179; apps/cli/src/cloud/marketplaces.rs:156-200).

**Why it exists.** Brief S54.10 (featured plugins) and S54.11 (recommended plugins). The brief marks both missing on all six apps; code shows derived popular and recommended features on three apps, but no featured flag for plugins.

**Who uses it.** New users who do not know what to install; developers wanting project-fit suggestions.

**Problems it solves**

- Choosing a first plugin.
- Finding plugins that fit connectors already connected.
- Finding plugins that fit the project in the current folder.

**Use cases**

- A web user sees a Popular group at the top of the Plugins tab.
- A phone user sees 'Recommended for you' because they connected a calendar connector.
- A developer runs 'agi marketplace recommend' in a Rust project.

## 2. User experience

**Where to find it**

- Web and Desktop: top of Settings, Customize, Plugins when not searching; heading from DIRECTORY_POPULAR_HEADINGS (packages/ui/ui/src/directory/DirectoryPanel.tsx:970-973). Exact heading text not read (unknown).
- Mobile: Customize, Plugins; sections 'Popular' ('Verified plugins people install most') and 'Recommended for you' ('They use connectors you already connected') (apps/mobile/src/features/plugins/PluginsScreen.tsx:786-808).
- CLI: 'agi marketplace recommend' (alias 'suggest') (apps/cli/src/lib.rs:2358-2362).
- VS Code and Chrome: not available.

**Before you start**

- Web and mobile: signed in; mobile in Cloud mode.
- Mobile recommendations need at least one connected connector that a plugin requires.
- CLI: an account with at least one marketplace added, run inside a project folder.

**Screens and controls**

- Web: Popular group with a rank label per entry (packages/ui/ui/src/directory/DirectoryGrid.tsx:133).
- Mobile: two section titles above the category shelves, hidden while a search or filter is active (apps/mobile/src/features/plugins/PluginsScreen.tsx:788-809).
- CLI: text list of up to 5 plugins with the reasons (apps/cli/src/cloud/marketplaces.rs:170).

**Journey**

1. Open the Plugins tab with no search.
2. Look at the Popular group or the Recommended shelf.
3. Open or install a suggested plugin.
4. CLI: run 'agi marketplace recommend', read the reasons, then run 'agi marketplace get <plugin>@<marketplace>'.

**What the person sees and gets**

- Mobile rows show the plugin, publisher and state; shelves are hidden when empty.
- CLI prints the best matches first and leaves out plugins already installed here (apps/cli/src/cloud/marketplaces.rs:152-155).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: popularPluginIds picks up to PLUGIN_POPULAR_LIMIT (6) entries that are verified, have installs, can be installed on web and are not installed, ranked by installs then name (apps/web/features/directory/services/plugins-directory.ts:1222-1239; apps/web/features/directory/constants.ts:118); applied only to the default unfiltered query (apps/web/features/directory/services/plugins-directory.ts:1338-1346).
- Web panel renders a popular group separate from the rest (packages/ui/ui/src/directory/DirectoryPanel.tsx:325-326, 970-973).
- Mobile: popularPlugins (verified, installs above zero, installable, top by installs) and recommendedPlugins (installable, not installed, not already in Popular, requiring a connector the person has connected, up to a limit) (apps/mobile/src/features/plugins/pluginsModel.ts:138-179).
- CLI recommend: matches project signals to entry words, leaves out installed ones, limit 5 (apps/cli/src/cloud/marketplaces.rs:156-200; apps/cli/src/lib.rs:7529-7551).
- A mobile test named 'shows featured and recommended sections and filters by category' exists (apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx:230); the screen itself uses the titles Popular and Recommended for you.

**Incomplete**

- There is no way for the product team to feature a plugin by hand: no featured field was found on plugin directory entries or the plugin registry (search of apps/web/features/plugins, apps/web/lib/services/plugin-*.ts and packages returned none). Only connectors have a featured flag (apps/web/features/directory/services/connectors-directory.ts:621).
- Recommendations are rules (popularity, connector overlap, word match), not personal history or model based.
- Web Popular depends on install counts that exist only for built-in entries in the code path I saw (apps/web/features/plugins/server/directory/catalog.ts:16-22); marketplace entries use installs or installCount if present (apps/web/features/plugins/server/directory/query.ts:77-79).

**Present but disconnected or switched off**

- None found.

**Not available**

- Editorial featured plugins on all six apps.
- Recommended on web, Desktop, VS Code and Chrome (web has Popular only).
- Popular on CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- The marketplace highlights featured plugins. (source: S54.10 (brief))
- The marketplace recommends plugins for the user. (source: S54.11 (brief))
- Only the connector directory has a featured flag. (source: apps/web/features/directory/services/connectors-directory.ts:621 (code))
- Show which skill or plugin is active and why it was selected; trustworthy publishers. (source: doc: docs/product/competitive-guidance.md items 98, 103)

**Acceptance criteria**

1. On web with no search, a Popular group lists at most 6 verified installable plugins not already installed.
2. With a search or filter active, mobile hides Popular and Recommended.
3. Mobile Recommended lists only plugins that need a connector the person has connected.
4. An installed plugin never appears in Recommended.
5. CLI recommend never lists a plugin already installed on the machine.
6. No surface shows a 'Featured' label for plugins (confirms the gap until built).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Popular is a stand-in for featured; marking it as editorial would be misleading.
- [inferred] A real featured list needs a curated field in the plugin registry and a place to edit it.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a featured flag and order to registry entries with an admin control (platform staff already have moderation pages, apps/web/features/admin/pages/PluginModerationPage.tsx).
- [proposed] Show the reason for each recommendation on web, as the CLI does.
- [proposed] Use the same recommendation rule on all surfaces from one shared package.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | popularPluginIds | `apps/web/features/directory/services/plugins-directory.ts` | Selects popular plugins (line 1222); applied at 1338-1346. |
| config | PLUGIN_POPULAR_LIMIT | `apps/web/features/directory/constants.ts` | Limit 6 (line 118). |
| component | DirectoryPanel popular group | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Splits catalog into popular and rest (lines 325-326, 970). |
| component | DirectoryGrid rank label | `packages/ui/ui/src/directory/DirectoryGrid.tsx` | Shows popular rank (line 133). |
| service | mobile popularPlugins and recommendedPlugins | `apps/mobile/src/features/plugins/pluginsModel.ts` | Rules for the two shelves (lines 138-179). |
| screen | Mobile PluginsScreen shelves | `apps/mobile/src/features/plugins/PluginsScreen.tsx` | Renders Popular and Recommended for you (lines 786-808). |
| service | CLI recommend | `apps/cli/src/cloud/marketplaces.rs` | recommend_catalogue and recommend (lines 156-222). |
| command | agi marketplace recommend | `apps/cli/src/lib.rs` | Command and handler (2358, 7529). |
| service | project signals | `apps/cli/src/context.rs` | project_signals function used by the handler (called at apps/cli/src/lib.rs:7541). |
| service | connectors featured flag | `apps/web/features/directory/services/connectors-directory.ts` | The only featured flag (line 621); not for plugins. |
| test | mobile PluginsScreens test | `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx` | Shelves test (line 230). |
| test | mobile pluginsModel test | `apps/mobile/src/features/plugins/__tests__/pluginsModel.test.ts` | Popular and recommended rules. |
| test | web plugins-directory test | `apps/web/features/directory/__tests__/plugins-directory.test.ts` | Client-side directory mapping (popular cases not confirmed). |
| service | query installs helper | `apps/web/features/plugins/server/directory/query.ts` | installsOf and installs sort used by popularity (lines 77-86). |
| service | catalog install counts | `apps/web/features/plugins/server/directory/catalog.ts` | Attaches real install counts to built-in entries (lines 13-22). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web adapter loads the directory page and computes the popular set in the browser from installs and install state. | device | apps/web/features/directory/services/plugins-directory.ts:1338-1346 |
| Mobile fetches the plugin page, installations, updates and the connector directory, then computes Popular and Recommended on the phone. | device and our servers | apps/mobile/src/features/plugins/PluginsScreen.tsx:341-376, 576-585 |
| CLI reads project signals from the folder, fetches marketplaces and entries from our servers and ranks on the device. | device and our servers | apps/cli/src/lib.rs:7541-7547; apps/cli/src/cloud/marketplaces.rs:156-168 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Install counts | counted from plugin installations in the database | server side | derived; the API never exposes user ids (apps/web/app/api/plugins/__tests__/route.test.ts:207) |
| Project signals (language, tools, packages) | computed in memory by the CLI | no | not stored; whether they are sent to the server is not shown, matching is done on the device (apps/cli/src/cloud/marketplaces.rs:156-168) |

**Models and providers.** No model or provider is used; all rules are deterministic.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; CLI needs an account. |
| Permissions | none found in the code. |
| Subscription | No plan gate found. CLI recommend refuses if the capability document denies canUseMarketplace (apps/cli/src/lib.rs:7530-7535). |
| Limits and metering | Popular limit 6 on web (apps/web/features/directory/constants.ts:118); CLI limit 5 (apps/cli/src/cloud/marketplaces.rs:170). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile in Local mode shows the Cloud gate and no shelves. CLI recommend needs our servers; matching happens on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| nothing qualifies | Mobile hides the section; web shows no popular group. | apps/mobile/src/features/plugins/PluginsScreen.tsx:788-808; packages/ui/ui/src/directory/DirectoryPanel.tsx:795 |
| filter or search active | Mobile hides Popular and Recommended; web applies Popular only to the default query. | apps/mobile/src/features/plugins/PluginsScreen.tsx:788; apps/web/features/directory/services/plugins-directory.ts:1210-1220 |
| no connected connectors | Mobile Recommended is empty; the connector lookup failure is swallowed to null. | apps/mobile/src/features/plugins/PluginsScreen.tsx:355 |
| error, offline, retry | Same as the plugin list (F054-02). | apps/mobile/src/features/plugins/PluginsScreen.tsx:366-372 |
| accessibility | Section titles are plain text; hints exist on tappable titles. | apps/mobile/src/features/plugins/PluginsScreen.tsx:790-796 |
| featured | not handled in the code. | no featured field found in apps/web/features/plugins, apps/web/lib/services/plugin-*.ts or packages (search returned none) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx`: Test at line 230 for the shelves and category filtering.
- `apps/mobile/src/features/plugins/__tests__/pluginsModel.test.ts`: Model helpers including popular and recommended (cases not read in detail).
- `apps/web/features/directory/__tests__/plugins-directory.test.ts`: Web directory mapping; popular cases not confirmed.
- `packages/ui/ui/src/directory/__tests__/DirectoryGrid.test.tsx`: Grid rendering; rank label cases not confirmed.
- `apps/cli/src/cloud/marketplaces.rs`: In-file tests from line 431 (recommend cases not read).

**Test scenarios**

- **Web popular**
  1. Open Plugins with no search; note the Popular group.
  2. Install one of them; reload.
  - Expected: At most 6 shown; the installed one leaves the group.
- **Mobile recommended**
  1. Connect a connector that a plugin requires.
  2. Open Plugins on the phone with no search.
  - Expected: 'Recommended for you' lists plugins needing that connector, not installed ones.
- **Mobile search hides shelves**
  1. Type in the search bar.
  - Expected: Popular and Recommended disappear; 'Results' shows.
- **CLI recommend**
  1. Add a marketplace.
  2. cd into a Rust project; run agi marketplace recommend.
  - Expected: Up to 5 plugins with reasons, none already installed.
- **Featured absence**
  1. Search the UI on all apps for a Featured label on plugins.
  - Expected: None, matching the brief.

**Where to look when it fails**

- Check entry fields installs, verified, requiredConnectors in the /api/plugins response.
- Mobile: connector directory call failure hides Recommended silently.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **No editorial featured plugins.** Affects: All six apps. Evidence: no featured field found in plugin code; apps/web/features/directory/services/connectors-directory.ts:621 only for connectors. Work needed: Add field, admin control, UI shelf.
- **Recommended exists only on mobile and CLI with different rules; web and Desktop have none.** Affects: Web and Desktop users; consistency. Evidence: apps/mobile/src/features/plugins/pluginsModel.ts:163; apps/cli/src/cloud/marketplaces.rs:196. Work needed: Share one rule in a package and show it on web.
- **The brief and docs say missing on all apps, while code has derived versions.** Affects: Planning. Evidence: apps/mobile/src/features/plugins/PluginsScreen.tsx:786-808. Work needed: Update the brief status to partial.
- **Mobile test name says featured but the screen says Popular.** Affects: Test readers. Evidence: apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx:230. Work needed: Rename the test.
- **Popular relies on install counts that may be zero for external marketplace entries.** Affects: Quality of the shelf. Evidence: apps/web/features/plugins/server/directory/query.ts:77-79. Work needed: Verify counts for marketplace entries.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- api:GET /api/plugins
- api:GET /api/plugins/marketplaces/entries
- F054-02
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- file:apps/mobile/src/features/plugins/pluginsModel.ts
- file:apps/cli/src/cloud/marketplaces.rs

## Unknown

- Exact heading text of the web Popular group (DIRECTORY_POPULAR_HEADINGS not read).
- Whether install counts exist for marketplace entries in production.
- Whether popularity tests exist in plugins-directory.test.ts.
- How project_signals computes signals (apps/cli/src/context.rs not read).

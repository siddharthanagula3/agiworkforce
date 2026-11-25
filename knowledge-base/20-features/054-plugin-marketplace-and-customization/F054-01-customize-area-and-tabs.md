---
id: "F054-01"
type: "feature"
title: "Customize area and tabs"
aliases: ["Customize", "Customize destination", "Customize group in Settings", "Skills, Connectors and Plugins tabs", "/chat/customize", "Customize screen (mobile)", "/plugin overlay (CLI)", "Show Plugins / Show Skills (VS Code)", "S54.01", "S54.02", "S54.03", "S54.04"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "built", chrome: "missing"}
verification: {web: "partly seen (3 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S54.01", "S54.02", "S54.03", "S54.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "file:apps/web/app/chat/customize/page.tsx", "file:packages/ui/ui/src/settings-nav.ts", "file:packages/contracts/types/src/capabilities.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-01 Customize area and tabs

One place to shape what the assistant can do: Skills, Connectors and Plugins. On web and the public Desktop it is the 'Customize' group in Settings. Mobile has a Customize screen. The CLI has plugin commands and a /plugin overlay. VS Code has separate Plugins and Skills pickers. Chrome has none.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.01](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5401), [S54.02](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5402), [S54.03](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5403), [S54.04](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5404).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (3 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gathers the three ways to extend the assistant (skills, connectors, plugins) under one name. On web it is a nav group of the settings modal whose Plugins panel is the shared directory panel (packages/ui/ui/src/settings-nav.ts:374-386; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2198-2256). Old /chat/customize links redirect into it (apps/web/app/chat/customize/page.tsx:17-23).

**Why it exists.** Brief item S54.01 says one Customize destination should gather skills, connectors and plugins. The product requirements list plugins, skills and connectors together as one extensibility area (doc: docs/product/requirements.md section 19).

**Who uses it.** Any signed-in person who wants to add skills, connect apps or install plugins. Developers use the CLI and VS Code equivalents. Workspace members see their workspace's plugins in the same tab.

**Problems it solves**

- People do not need to know three different places for skills, connectors and plugins.
- Old shared links still land on the right section instead of an error page.
- A workspace administrator can switch skills or plugins off and the tab says so instead of showing a broken list.

**Use cases**

- A web user opens Settings, then Customize, then Plugins to install a plugin.
- A phone user taps Customize and sees a Plugins row with a count of added plugins.
- A developer runs 'agi plugin list' or opens /plugin in the terminal to see what is installed.
- A VS Code user runs the 'Code: Show Plugins' command to turn a plugin off.

## 2. User experience

**Where to find it**

- Web: Settings, group 'Customize', items 'Skills', 'Connectors', 'Plugins' (and 'Slack app') (packages/ui/ui/src/settings-nav.ts:374-386). Direct routes /settings/skills, /settings/connectors, /settings/plugins (apps/web/app/settings/[section]/page.tsx:9-12).
- Old link: /chat/customize?section=skills|connectors|plugins redirects to /settings/<section> (apps/web/app/chat/customize/page.tsx:5-23).
- Desktop (public, Electron): the same hosted web app, so the same Settings (doc: AGENTS.md section 5; apps/desktop/electron/config.ts:17).
- Mobile: the 'Customize' screen lists 'Plugins', 'Skills' (when the skills flag is on), 'Connectors' and 'Agents' (apps/mobile/src/features/customize/CustomizeScreen.tsx:41-77; apps/mobile/lib/v1FeatureFlags.ts:20).
- CLI: 'agi plugin ...' commands (apps/cli/src/lib.rs:2017), 'agi marketplace ...' (apps/cli/src/lib.rs:2340), 'agi connectors' (apps/cli/src/lib.rs:1275), and the /plugin, /plugins, /marketplace, /market slash command that opens a tabbed overlay (apps/cli/src/tui/tui_app.rs:6292; apps/cli/src/command_registry.rs:576); /skills (apps/cli/src/tui/tui_app.rs:6198).
- VS Code: command palette 'Code: Show Skills', 'Code: Show Plugins', 'Code: Browse AGI Cloud Marketplace' (apps/extension-vscode/package.json:753-781); connectors are a separate tree with a 'Manage on web' link (apps/extension-vscode/src/features/surfaces/index.ts:161).
- Chrome extension: not available. Only a skills client exists (apps/extension/src/features/cloud-bridge/skillsClient.ts).

**Before you start**

- Web and Desktop: signed in; the workspace administrator has not switched off skills or plugins (apps/web/features/settings/components/WebSettingsModal.tsx:243-261).
- Mobile: signed in AND in Cloud mode; otherwise a gate says 'Plugins live in AGI Cloud; switching won't upload your local chats.' (apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:28-31; apps/mobile/src/features/plugins/PluginsScreen.tsx:658-668).
- CLI: plugin list, info, enable, disable work on local folders; marketplace commands need an AGI account (apps/cli/src/lib.rs:7511-7518).

**Screens and controls**

- Web/Desktop: left nav of the settings modal; each of the three items opens the shared DirectoryPanel with a search box, source tabs and filters (packages/ui/ui/src/directory/DirectoryPanel.tsx; packages/ui/ui/src/directory/DirectoryToolbar.tsx:84).
- Web/Desktop Plugins panel header actions: 'Add marketplace' and a 'create with AGI' action (apps/web/features/directory/constants.ts PLUGIN_CREATE_WITH_AGI_LABEL; packages/ui/ui/src/directory/constants.ts:226).
- Mobile Customize: search button, a Discover section, one row per destination with an accessibility hint, a count such as '3 added' on Plugins (apps/mobile/src/features/customize/CustomizeScreen.tsx:120-190).
- CLI /plugin overlay: tabs Discover, Installed, Marketplaces, Errors, switched with left and right arrows, Esc closes (apps/cli/src/tui/widgets/screen_renderers.rs:482-487, 519-596).

**Journey**

1. Web: open Settings, choose Customize, pick Plugins, Skills or Connectors.
2. The panel loads its list (skeleton while loading); on failure an error with a retry action is shown.
3. Pick an entry to open its detail page, or use the toolbar to search and filter.
4. Mobile: open Customize, tap a row; the plugins count loads in the background.
5. CLI: run /plugin to see installed plugins grouped as Project and User; run 'agi marketplace browse' for what the account's marketplaces offer.

**What the person sees and gets**

- Web: loading skeleton, error alert with 'Retry', empty text 'No plugins installed. Browse the directory to add an available Web plugin.' in the fallback panel (packages/ui/ui/src/settings-modal/SettingsModal.tsx:1700-1731).
- Web: when the administrator switched plugins or skills off, a CapabilityDeniedNotice with the reason replaces the panel (apps/web/features/settings/components/WebSettingsModal.tsx:256-261).
- Mobile: '<n> added' meta text beside Plugins; hidden when the count is zero or cannot be loaded (apps/mobile/src/features/customize/__tests__/CustomizeScreen.test.tsx:73-125).
- CLI: plain text rows; 'No plugins installed.' and 'No plugin errors' empty states (apps/cli/src/tui/widgets/screen_renderers.rs:557, 584).

**Settings**

- Workspace administrator switches for skills and plugins turn the capabilities canUseSkills and canUsePlugins off for members (apps/web/lib/services/capability-handshake-service.ts:180-185).
- Mobile feature flag skills (apps/mobile/lib/v1FeatureFlags.ts:20) hides the Skills row when false (apps/mobile/src/features/customize/CustomizeScreen.tsx:75).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: the settings nav has the group 'Customize' with Skills, Connectors, Plugins (packages/ui/ui/src/settings-nav.ts:374-386); the web modal treats connectors, skills and plugins as built-in sections it renders itself (apps/web/features/settings/lib/web-settings-sections.ts:75-79).
- Web: /chat/customize accepts only skills, connectors, plugins; anything else (or nothing) goes to /settings/general (apps/web/app/chat/customize/page.tsx:5-23); a test file covers each case (apps/web/app/chat/customize/page.test.tsx:20-36).
- Web and Desktop: the three tabs use one DirectoryPanel and one adapter whose sections are skills, connectors, plugins (apps/web/features/directory/hooks/useDirectoryAdapter.ts:261, 1978).
- Desktop (public Electron): loads the hosted web app, so it gets the same tabs (doc: AGENTS.md section 5; apps/desktop/electron/config.ts:17).
- Mobile: Customize screen with Plugins, Skills, Connectors, Agents rows, a plugins count and search (apps/mobile/src/features/customize/CustomizeScreen.tsx:41-190); routes /(app)/plugins, /(app)/skills, /(app)/connectors exist (apps/mobile/app/(app)/plugins/index.tsx, apps/mobile/app/(app)/skills/index.tsx, apps/mobile/app/(app)/connectors/index.tsx).
- CLI: plugin subcommands list, install, info, login, configure, remove, enable, disable, update, digest, sign (apps/cli/src/lib.rs:2017-2082); /plugin overlay lists installed plugins (apps/cli/src/tui/tui_app.rs:6292-6327).
- VS Code: 'Show Plugins' lists installed plugins with on/off, options, update and remove actions; 'Show Skills' lists skills (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220, 418-515).

**Incomplete**

- CLI has no single Customize destination; the /plugin overlay Discover and Marketplaces tabs only print command hints, they do not act (apps/cli/src/tui/widgets/screen_renderers.rs:519-526, 567-572).
- The CLI Discover tab text says 'Search the plugin directory', but the search command only searches marketplaces added to the account (apps/cli/src/tui/widgets/screen_renderers.rs:525; apps/cli/src/cloud/marketplaces.rs:145-153).
- VS Code has separate commands, not one Customize destination; connectors only link to the web (apps/extension-vscode/src/features/surfaces/index.ts:158-165). Whether any sidebar view groups them was not traced (unknown).
- Mobile plugin screens depend on Cloud mode and sign-in (apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:28-31).

**Present but disconnected or switched off**

- The Tauri internal desktop has its own Plugins tab that lists Claude Code plugins on this machine and says desktop chat does not load them (apps/desktop/src/features/settings/tabs/Plugins/index.tsx:13-16). It is retained internal code, not the public Desktop (doc: AGENTS.md section 5).
- A legacy PluginsPanel inside the shared settings modal renders only when no directory adapter is supplied (packages/ui/ui/src/settings-modal/SettingsModal.tsx:2198-2203, 2276).

**Not available**

- Chrome extension: no Customize destination and no plugin code; only skills client code exists (apps/extension/src/features/cloud-bridge/skillsClient.ts; DISCOVERABLE managed-plugins availability is false for chrome, packages/contracts/types/src/capabilities.ts:299-308).
- The brief marks mobile Customize as missing; the code shows it exists. The product doc docs/product/surface-feature-matrix.md:376 also says mobile is absent for plugins. Code ranks higher than prose (doc: AGENTS.md section 2).

## 4. Required behaviour

**Established requirements**

- One Customize destination gathers skills, connectors and plugins. (source: S54.01 (brief))
- A Plugins section lists available and installed plugins. (source: S54.02 (brief))
- A Skills section sits beside plugins in the customization area. (source: S54.03 (brief))
- A Connectors section sits in the customization area. (source: S54.04 (brief))
- Old Customize links must still reach the right section; the chat route redirects to settings; only skills, connectors and plugins are accepted and anything else opens General. (source: apps/web/app/chat/customize/page.tsx:5-23 (code) and apps/web/app/chat/customize/page.test.tsx:20-36 (test))
- Plugins requirements: install, enable or disable, update, uninstall, namespacing, marketplace and source controls, included MCP servers, skills, hooks, subagents and prompts. (source: doc: docs/product/requirements.md section 19)
- Install, enable, update, disable and uninstall of skills and plugins affect the next turn and survive reload; failed source fetches and revoked workspace permissions are explained without claiming installation. (source: doc: docs/product/experience-contract.md row W15)

**Acceptance criteria**

1. Web: Settings shows a Customize group with Skills, Connectors, Plugins and each opens its panel.
2. Visiting /chat/customize?section=plugins lands on /settings/plugins; ?section=bogus and no section land on /settings/general.
3. With the workspace plugins switch off, the Plugins tab shows the denial reason and no list.
4. Mobile in Cloud mode: Customize shows Plugins, Skills, Connectors, Agents rows; in Local mode the plugins list shows the Cloud gate and the Customize screen makes no plugin request.
5. CLI: 'agi plugin list' prints each installed plugin with enabled or disabled state and signature.
6. Chrome extension offers no Customize screen (expected absent).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A single Customize idea is satisfied on VS Code and CLI by separate commands, since no unified screen exists on those terminals.
- [inferred] The Desktop requirement is met by the hosted web app because the public Desktop loads it.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a one-screen Customize summary to CLI (/customize) that shows counts of skills, connectors, plugins.
- [proposed] Correct the CLI Discover tab text so it does not say the public directory is searched.
- [proposed] Update docs/product/surface-feature-matrix.md so mobile and VS Code plugin status matches the code.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Customize redirect route | `apps/web/app/chat/customize/page.tsx` | Reads ?section=, accepts skills/connectors/plugins, redirects to /settings/<section> or /settings/general. |
| test | Customize redirect test | `apps/web/app/chat/customize/page.test.tsx` | Covers general default, each named section and the fallback. |
| config | Settings nav group Customize | `packages/ui/ui/src/settings-nav.ts` | Defines the Customize group and its Skills, Connectors, Plugins, Slack app items (lines 374-386). |
| config | Web settings section registry | `apps/web/features/settings/lib/web-settings-sections.ts` | Lists connectors, skills, plugins as built-in sections and validates a section name (lines 75-79, 122). |
| screen | Settings section route | `apps/web/app/settings/[section]/page.tsx` | Serves /settings/<section> and 404s unknown names. |
| component | SettingsModal directory routing | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Shows DirectoryPanel for skills, connectors, plugins when the adapter lists them; legacy PluginsPanel fallback (lines 84, 1616, 2198-2276). |
| component | WebSettingsModal | `apps/web/features/settings/components/WebSettingsModal.tsx` | Wires adapters and swaps in CapabilityDeniedNotice when canUseSkills or canUsePlugins is denied (lines 243-261). |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Single adapter for skills, connectors and plugins sections (lines 261, 1978). |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Shared list, search, filters and detail host for the three sections. |
| config | Surface capability table | `packages/contracts/types/src/capabilities.ts` | canUsePlugins and canUseSkills per surface and the managed-plugins availability descriptor (lines 54, 87, 120, 299-308). |
| service | Capability handshake workspace switches | `apps/web/lib/services/capability-handshake-service.ts` | Maps workspace features skills and plugins to the capabilities they close (lines 180-185). |
| screen | Mobile CustomizeScreen | `apps/mobile/src/features/customize/CustomizeScreen.tsx` | Destination rows, plugin count, search, Local-mode guard (lines 41-190). |
| screen | Mobile customize route | `apps/mobile/app/(app)/customize/index.tsx` | Expo route that renders CustomizeScreen. |
| config | Mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | skills true, pluginMarketplaceAdmin false (lines 20, 32). |
| hook | useCloudFeatureAccess | `apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts` | ready only when signed in, in Cloud mode and with a user id. |
| command | agi plugin subcommands | `apps/cli/src/lib.rs` | PluginSubcommand enum (2017) and handlers (6769-7080). |
| command | /plugin overlay | `apps/cli/src/tui/tui_app.rs` | Opens the tabbed plugin overlay from /plugin, /plugins, /marketplace, /market (line 6292). |
| component | PluginTab renderer | `apps/cli/src/tui/widgets/screen_renderers.rs` | Renders Discover, Installed, Marketplaces, Errors tabs (lines 482-600). |
| command | VS Code plugin and skill pickers | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | manageSkills (220) and managePlugins (418). |
| command | VS Code command registration | `apps/extension-vscode/src/core/commandSetup.ts` | Registers showSkills, showPlugins, browsePluginMarketplace (lines 2668-2677). |
| config | Desktop cloud origin | `apps/desktop/electron/config.ts` | Public Desktop loads the hosted app origin; comment states chat has no Local mode (lines 1-17). |
| component | Tauri internal Plugins tab | `apps/desktop/src/features/settings/tabs/Plugins/index.tsx` | Internal-only tab for local Claude Code plugins. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Settings, then Customize, then Plugins; the web modal picks the DirectoryPanel because the adapter lists the section. | device | packages/ui/ui/src/settings-modal/SettingsModal.tsx:2198-2203 |
| Before rendering, the modal asks whether the workspace allows skills and plugins and swaps in a denial notice if not. | device and our servers | apps/web/features/settings/components/WebSettingsModal.tsx:243-261; apps/web/lib/services/capability-handshake-service.ts:180-185 |
| The adapter loads the plugin list from our API (see F054-02) and the installed state from the account. | our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:776-806 |
| Old link /chat/customize is resolved on the server and redirected. | our servers | apps/web/app/chat/customize/page.tsx:17-23 |
| Mobile Customize fetches installed plugins for the count, only in Cloud mode. | our servers | apps/mobile/src/features/customize/CustomizeScreen.tsx:92-115 |
| CLI /plugin reads plugin folders on the computer and shows them; no server call. | device | apps/cli/src/tui/tui_app.rs:6297-6327 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Navigation state (active section, hash) of the settings modal | URL path and hash in the browser | no | lives in the page; not persisted (apps/web/features/settings/components/WebSettingsModal.tsx:165-181) |
| Installed plugin records shown in the tab | server tables plugin_installations and plugin_marketplace_installations | yes, account level | until uninstall (see F054-06 and the install feature) |
| CLI installed plugins | plugin folders under the user and project directories | no | until removed with agi plugin remove (apps/cli/src/lib.rs:7047) |

**Models and providers.** No model or provider is used to show the Customize destination. Selecting skills or plugins later affects chat turns, but that is owned by other features (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, public Desktop, mobile and VS Code marketplace need a signed-in AGI account. CLI local plugin commands work without one; CLI marketplace commands need one (apps/cli/src/lib.rs:7511-7518). The /chat/customize redirect itself needs no account check in this file (apps/web/app/chat/customize/page.tsx). |
| Permissions | Workspace administrators can turn off skills and plugins for members; the tab then shows the reason (apps/web/lib/services/capability-handshake-service.ts:180-185). |
| Subscription | No plan-based gate for opening Customize was found. The handshake comment says canUseMarketplace has no tier or model gate (apps/web/lib/services/capability-handshake-service.ts:39-42). canUsePlugins and canUseSkills are true on web, desktop and mobile in the capability table (packages/contracts/types/src/capabilities.ts:54, 87, 120). |
| Limits and metering | none found in the code for opening Customize. |
| Feature flags | Mobile: FEATURES.skills (true) and FEATURES.pluginMarketplaceAdmin (false) (apps/mobile/lib/v1FeatureFlags.ts:20, 32). |
| Model compatibility | Not model dependent. none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Web has no Local mode. Public Desktop is Cloud by construction (apps/desktop/electron/config.ts:5-12). Mobile in Local mode shows the Cloud gate for Plugins and makes no plugin request (apps/mobile/src/features/plugins/PluginsScreen.tsx:658-668; apps/mobile/src/features/customize/__tests__/CustomizeScreen.test.tsx:140). CLI plugin list, info, enable, disable work locally with no account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Fallback panel shows four skeleton rows and 'Loading plugins…' for screen readers. | packages/ui/ui/src/settings-modal/SettingsModal.tsx:1700-1710 |
| error | Alert with the message and a Retry button when a retry function is supplied. | packages/ui/ui/src/settings-modal/SettingsModal.tsx:1711-1727 |
| empty | 'No plugins installed. Browse the directory to add an available Web plugin.' or 'No plugins match your search.' | packages/ui/ui/src/settings-modal/SettingsModal.tsx:1728-1732 |
| unknown or missing section in the old link | Falls back to /settings/general. | apps/web/app/chat/customize/page.tsx:5-23 |
| desktop-only section opened in a browser | Falls back to general (not part of the three Customize sections). | apps/web/features/settings/lib/web-settings-sections.ts:131-139 |
| administrator turned plugins off | Denial notice replaces the panel. | apps/web/features/settings/components/WebSettingsModal.tsx:259-261 |
| mobile Local mode or signed out | Cloud gate with a continue action; plugin count reset to zero. | apps/mobile/src/features/customize/CustomizeScreen.tsx:92-96; apps/mobile/src/features/plugins/PluginsScreen.tsx:658-668 |
| mobile plugin count request fails | Count hidden. | apps/mobile/src/features/customize/CustomizeScreen.tsx:108-113 |
| offline, timeout, cancel on the web Customize redirect | not handled in the code beyond the list-load error and retry above. | apps/web/app/chat/customize/page.tsx:1-23 (a plain redirect with no handling of these cases) |
| accessibility | Nav items use aria-current and aria-controls; mobile rows have role link with label and hint; fallback panel table has scoped headers. | packages/ui/ui/src/settings-modal/SettingsModal.tsx:1964-1969; apps/mobile/src/features/customize/CustomizeScreen.tsx:145-151 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/customize/page.test.tsx`: Redirect to general by default, to skills, connectors, plugins when named, and fallback for an unowned section.
- `apps/web/app/settings/__tests__/settings-routes-reachable.test.ts`: [inferred from the name] that settings routes can be reached; the content was not read.
- `apps/web/features/settings/components/WebSettingsModal.test.tsx`: Web settings modal behaviour; matched a search for plugins; exact cases not read.
- `apps/mobile/src/features/customize/__tests__/CustomizeScreen.test.tsx`: Plugin count label, wide-pane column, count hidden on failure, refresh on focus, discover above rows, no server call in Local mode.
- `apps/mobile/src/features/customize/__tests__/customizeDestinations.test.ts`: The destination list and the skills flag.
- `packages/contracts/types/src/__tests__/surface-capability-manifest.test.ts`: Per-surface capability manifest including disabled_by_organization for canUsePlugins.
- `apps/cli/src/command_registry.rs`: In-file test that plugin, plugins, marketplace and market resolve to /plugin (line 576).
- `apps/cli/src/tui/widgets/screen_renderers.rs`: In-file tests of the plugin tab text including Marketplaces tab (around line 1222-1251).

**Test scenarios**

- **Old link redirect**
  1. Open /chat/customize?section=plugins while signed in.
  2. Open /chat/customize?section=nonsense.
  3. Open /chat/customize.
  - Expected: First lands on /settings/plugins, the other two on /settings/general.
- **Administrator switch**
  1. As workspace admin switch plugins off for members.
  2. As a member open Settings, Customize, Plugins.
  - Expected: A denial notice with a reason is shown instead of the list.
- **Mobile Local mode**
  1. On a phone in Local mode open Customize.
  2. Tap Plugins.
  - Expected: No plugin request is made; the Plugins screen shows the AGI Cloud gate.
- **Mobile Cloud count**
  1. Sign in, switch to Cloud, install one plugin on web.
  2. Open Customize on the phone.
  - Expected: Plugins row shows '1 added'.
- **CLI overlay**
  1. Install a plugin with agi plugin install <folder>.
  2. In the TUI run /plugin.
  - Expected: Installed tab lists it under Project or User with a tick.

**Where to look when it fails**

- Web: browser network tab for /api/plugins and /api/plugins/installations; server log 'Plugin directory list failed' (apps/web/app/api/plugins/route.ts:87-90).
- Capability decision: GET of the capability handshake document; cached by CLI in tier_cache (apps/cli/src/tier_cache.rs:376).
- Mobile: gate title 'Plugins' means access.ready is false (Local mode or signed out).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **No unified Customize destination on CLI, VS Code and Chrome.** Affects: CLI, VS Code and Chrome users. Evidence: apps/extension-vscode/package.json:753-781; apps/cli/src/tui/widgets/screen_renderers.rs:519-572. Work needed: Decide whether a unified entry is wanted on terminal surfaces; build it or record the decision.
- **Product documents say mobile and VS Code have no plugin support, but code exists on both.** Affects: Anyone reading docs or planning work. Evidence: docs/product/surface-feature-matrix.md:376-378 versus apps/mobile/src/features/plugins/PluginsScreen.tsx and apps/extension-vscode/src/features/surfaces/accountMarketplace.ts. Work needed: Regenerate or correct the matrix; fix the hard-coded mobile:false, cli:false, vscode:false in the managed-plugins descriptor (packages/contracts/types/src/capabilities.ts:305-307) if those surfaces are meant to count.
- **Chrome extension has no skills, connectors or plugins area.** Affects: Chrome users. Evidence: apps/extension/src (only cloud-bridge/skillsClient.ts mentions skills). Work needed: Product decision, then a surface in the side panel.
- **CLI Discover tab text implies the public directory can be searched.** Affects: CLI users. Evidence: apps/cli/src/tui/widgets/screen_renderers.rs:525 versus apps/cli/src/cloud/marketplaces.rs:145-153. Work needed: Change the text or add public-directory search.
- **Empty and failure states of Customize were not exercised by any test I read for the Skills and Connectors tabs.** Affects: Web and Desktop. Evidence: not traced. Work needed: Add tests or confirm existing ones.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- file:apps/web/app/chat/customize/page.tsx
- file:packages/ui/ui/src/settings-nav.ts
- file:packages/contracts/types/src/capabilities.ts

## Unknown

- Whether the Electron desktop shell exposes /chat/customize or only /settings/* (the route is web; Electron routing not traced).
- Whether any VS Code sidebar view groups skills, plugins and connectors.
- How the Skills and Connectors panels behave on empty and failed loads (only Plugins was traced).
- Contents of apps/web/app/settings/__tests__/settings-routes-reachable.test.ts and WebSettingsModal.test.tsx.

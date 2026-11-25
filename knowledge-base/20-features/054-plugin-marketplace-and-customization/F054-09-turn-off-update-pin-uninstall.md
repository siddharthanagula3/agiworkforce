---
id: "F054-09"
type: "feature"
title: "Turn off, update, pin, uninstall"
aliases: ["Enabled switch", "Turned on", "Update to", "Switch version", "Choose a version", "Uninstall", "Remove plugin", "agi plugin enable", "agi plugin disable", "agi plugin update", "--ref pin", "S54.24 Enable/disable", "S54.25 Update", "S54.26 Pin version", "S54.29 Uninstall"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S54.24", "S54.25", "S54.26", "S54.29"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:PATCH /api/plugins/installations/[id]", "api:DELETE /api/plugins/installations/[id]", "api:GET /api/plugins/[id]/versions", "api:GET /api/plugins/updates", "api:POST /api/plugins/updates", "table:plugin_installations", "table:plugin_registry_versions", "table:plugin_registry_lifecycle_events", "F054-07", "F054-08", "F054-11", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-09 Turn off, update, pin, uninstall

Turn an installed plugin off and on, move it to a newer or older published version, stay on a chosen version, or remove it. On web and mobile, turning off or removing a plugin that others need asks to include them. Updates that add permissions need the person to approve them first. The CLI uses git commits and tags.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.24](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5424), [S54.25](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5425), [S54.26](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5426), [S54.29](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5429).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person keep a plugin without using it, move it between published versions, hold it on one version, and delete it, with checks on dependents, permissions and version status.

**Why it exists.** People need control after install: pause a plugin, take a fix, avoid a bad release, or clean up (brief: S54.24-S54.26, S54.29; doc: docs/product/requirements.md section 19 lists Enable/disable, Update, Uninstall).

**Who uses it.** Signed-in users on web, desktop (hosted web), mobile; CLI users; VS Code users; platform admins whose suspend and rollback actions move installs.

**Problems it solves**

- A plugin interfering with chats but worth keeping.
- A new version asking for more access than before.
- A withdrawn or suspended version still installed.
- Breaking another plugin by removing one it needs.

**Use cases**

- Turn a plugin off on web with the 'Enabled' switch.
- Press 'Update to 1.2.0' and read the new permissions in the dialog.
- Pick an older published version and press 'Switch version'.
- Run agi plugin install <git-url> --ref v1.0 so 'agi plugin update' leaves it alone.

## 2. User experience

**Where to find it**

- Web: Settings > Customize > Plugins > installed plugin: 'Enabled' switch, 'Version' section with 'Update to <v>', 'Choose a version', 'Switch version', and 'Uninstall' (packages/ui/ui/src/directory/PluginDetailView.tsx:369-437,439-460,900-905; constants.ts:122,193,212-216,388).
- Desktop (public Electron app): same hosted page; Tauri build opens the web page (apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:7).
- Mobile: plugin page: 'Turned on' switch, 'Version' card with 'Update to <v>', 'Choose a version to stay on', 'Switch version', 'Remove plugin' (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:353,360,472-520).
- CLI: agi plugin enable|disable|update|remove <name>; agi plugin install --ref <tag> (apps/cli/src/lib.rs:2017-2060, 7029-7060).
- VS Code: Plugins list item buttons 'Turn off' / 'Turn on', update (sync icon) and trash 'Remove' (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:475-518).
- Chrome: not available.

**Before you start**

- The plugin is installed.
- Web version control appears only for built-in registry packs that have versions (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1029-1041).
- CLI update needs a git checkout and an unpinned install (apps/cli/src/installs.rs:358-380; apps/cli/src/marketplace.rs:670).

**Screens and controls**

- Switch 'Enabled' with hint 'Turn this off to keep the plugin installed without using it.' (constants.ts:388-389).
- Update button 'Update to <version>' and a select 'Choose a version' with button 'Switch version' (PluginDetailView.tsx:369-437).
- Confirm dialog 'Switch to version <v>?' naming new permissions, added and removed skills and the changelog; confirm label 'Switch version' (DirectoryPanel.tsx:630-650).
- Confirm dialog for turn off with dependents: title from PLUGIN_TURN_OFF_TOGETHER_TITLE, 'This cannot be undone' text for removal (useDirectoryAdapter.ts:1449-1465,1860-1890).
- Mobile confirm 'Remove <name>?' and 'Remove <name> and what needs it?' (usePluginActions.ts:104-140).

**Journey**

1. Open the installed plugin.
2. To pause: flip 'Enabled' off. If other plugins need it, read the refusal or the 'turn off together' confirm and choose to proceed or cancel.
3. To update: press 'Update to <v>' (shown when a newer published version exists), read the dialog, press 'Switch version'.
4. To stay on a version: pick it under 'Choose a version' and press 'Switch version'; it stays until you change it.
5. To remove: press 'Uninstall'. If other plugins need it you are asked to remove them together.
6. CLI: run the matching agi plugin command and restart agi.

**What the person sees and gets**

- Web: refreshed installs, badge 'update' on rows with an offer (plugins-directory.ts:711), errors in the page.
- Server messages: '<name> cannot be turned off yet because ... need it...' and '<name> cannot be turned on yet because it needs ...' (apps/web/features/plugins/server/directory/installed-dependents.ts:62-74,146-151).
- CLI: 'Enabled plugin <name>. Restart agi ...', 'Plugin <name> is already up to date.' or a changed-files summary, 'Removed plugin <name> from <path>.' (apps/cli/src/installs.rs:464-480,402-421; lib.rs).
- VS Code notices from pluginUpdate.* strings (capabilityManagement.ts:351-375).

**Settings**

- None besides the controls. Org policy is not read on turn on (see gaps).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: PATCH /api/plugins/installations/[id] turns a registry plugin on or off; turning on checks dependencies (409 PLUGIN_DEPENDENCIES_UNAVAILABLE); turning off with dependents returns 409 PLUGIN_HAS_DEPENDENTS unless withDependents is true, then turns them off too (apps/web/app/api/plugins/installations/[id]/route.ts:49-102; install-responses.ts:9-42).
- Web: the same rules for directory installs via /api/plugins/marketplace-installations/[id], plus bundled connectors are disabled or enabled with the plugin (apps/web/app/api/plugins/marketplace-installations/[id]/route.ts:58-120).
- Web: turning on is refused while a permission review is pending (apps/web/lib/services/plugin-installation-service.ts:398-420).
- Web: DELETE removes an installation; with dependents it needs ?withDependents=true and removes them first; audit event plugin_removed (installations/[id]/route.ts:104-145).
- Web: GET /api/plugins/[id]/versions lists only published versions with the installed version and approved permissions (apps/web/lib/services/plugin-lifecycle.ts:142-168).
- Web: GET /api/plugins/updates lists offers for newer versions and for installs pinned to a deprecated or suspended version (plugin-lifecycle.ts:592-650).
- Web: POST /api/plugins/updates applies a move to a published version after signature, scan and permission checks, and re-enables an installation that was on a suspended version (plugin-lifecycle.ts:656-745).
- Web: the version control is shown only when the plugin is a built-in registry pack (useDirectoryAdapter.ts:1029-1041).
- Admin suspend turns off installations on that version; admin rollback moves installations from the withdrawn version to the target (plugin-lifecycle.ts:428-450,518-575).
- Mobile: turn on/off, remove with confirmation and a 'remove together' second confirm, update and switch version with permission acknowledgement (apps/mobile/src/features/plugins/usePluginActions.ts:86-145; PluginDetailScreen.tsx:256-275; service.ts:117-160).
- CLI: enable, disable, update, remove implemented; tag or branch pin with --ref makes update refuse; update pulls fast-forward only and holds the pull behind a marker until the signature check passes (apps/cli/src/installs.rs:330-421,464-480; apps/cli/src/marketplace.rs:665-730).
- VS Code: turn on/off, update (user-installed plugins only, when the runtime offers it), remove with a confirm (capabilityManagement.ts:475-518).

**Incomplete**

- Web version control and update offers exist only for built-in registry packs; directory and marketplace plugins have no update or version switch in the web page (useDirectoryAdapter.ts:1029-1041).
- Pin is not a separate setting: a version choice is simply the installed version that stays until changed (packages/ui/ui/src/directory/constants.ts:217-218). An admin rollback can still move installs off a withdrawn version (plugin-lifecycle.ts:553-562).
- Mobile turn-off never retries with withDependents; a refusal only shows its message (apps/mobile/src/features/plugins/usePluginActions.ts:86-102).
- Web Uninstall button calls the action directly; a confirmation appears only when dependents exist (DirectoryPanel.tsx:549-551; DirectoryDetailHeader.tsx:137-147; useDirectoryAdapter.ts:1449-1465).
- CLI enable, disable and remove do not check dependents (apps/cli/src/installs.rs:330-356,464-480).

**Present but disconnected or switched off**

- Lifecycle action 'restore' is declared but the lifecycle route has no case for it (apps/web/lib/services/plugin-lifecycle.ts:33; apps/web/app/api/plugins/[id]/lifecycle/route.ts:31-64).
- Tauri enabledPlugins switch: see unknowns.

**Not available**

- Chrome: none.
- VS Code: no version pin and no dependents check.
- Mobile: no list of 'what needs it' on turn off; no pin beyond choosing a version.

## 4. Required behaviour

**Established requirements**

- A user can turn an installed plugin off and on without uninstalling it (S54.24). (source: brief: S54.24 Should)
- A user can update an installed plugin to a newer version (S54.25). (source: brief: S54.25 Should)
- A user can pin a plugin to a specific version (S54.26). (source: brief: S54.26 Should)
- A user can uninstall a plugin (S54.29). (source: brief: S54.29 Should)
- Turning on checks dependencies; turning off is refused while dependents exist unless the user confirms; only published versions are offered. (source: brief: draft Should, confirmed in apps/web/app/api/plugins/installations/[id]/route.ts:61-82 and plugin-lifecycle.ts:142-168)
- A new permission needs a review before an update applies. (source: brief: draft Should for update, confirmed at plugin-lifecycle.ts:699-705)
- An action a user cannot undo asks first and the question names the consequence; a mutation fired straight from onClick is a defect. (source: doc: AGENTS.md section 9)
- Plugin requirements list Enable/disable, Update, Uninstall. (source: doc: docs/product/requirements.md section 19)

**Acceptance criteria**

1. Turning a plugin off on web keeps it listed as installed and 'Enabled' reads off after reload.
2. Turning off a plugin that another enabled plugin needs returns the refusal; repeating with the confirm turns both off.
3. Update to a version that adds a permission fails unless the permission is acknowledged; the dialog lists it.
4. The version list shows only published versions.
5. After 'Switch version' the page shows 'Installed version <chosen>' and the plugin stays there when a newer version is published.
6. Uninstall with dependents returns the refusal first and, on confirm, removes dependents and the plugin.
7. agi plugin update on a plugin installed with --ref <tag> fails with a 'pinned to' message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Uninstall on web should ask first, per the irreversible-action rule, because it deletes the installation and its settings.
- [inferred] Update and version switch should exist for directory plugins too, because mobile and web both show installed directory plugins.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a single 'Turn off together' confirm on mobile, matching web.
- [proposed] Add a dependents check to CLI disable and remove.
- [proposed] Make version pinning an explicit setting so admin rollback does not move pinned installs, if that is the intent.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PATCH and DELETE /api/plugins/installations/[id] | `apps/web/app/api/plugins/installations/[id]/route.ts` | Enable, disable, uninstall registry packs with dependents checks (49, 104). |
| endpoint | PATCH and DELETE /api/plugins/marketplace-installations/[id] | `apps/web/app/api/plugins/marketplace-installations/[id]/route.ts` | Same for directory and marketplace installs and their connectors (58, 121). |
| endpoint | GET /api/plugins/[id]/versions | `apps/web/app/api/plugins/[id]/versions/route.ts` | Published versions, installed version, approved permissions. |
| endpoint | GET and POST /api/plugins/updates | `apps/web/app/api/plugins/updates/route.ts` | List offers (26) and apply a version move (37). |
| service | plugin-lifecycle | `apps/web/lib/services/plugin-lifecycle.ts` | listPublishedPluginVersions (142), diffPluginVersionRecords (206), listPluginUpdateOffers (592), applyPluginUpdate (656), suspend (428), rollback (518). |
| service | plugin-installation-service | `apps/web/lib/services/plugin-installation-service.ts` | setWebPluginEnabled (417), uninstallWebPlugin (434), pending review guard (398). |
| service | installed-dependents | `apps/web/features/plugins/server/directory/installed-dependents.ts` | Dependents and unmet dependencies; refusal messages. |
| service | install-responses | `apps/web/features/plugins/server/directory/install-responses.ts` | PLUGIN_HAS_DEPENDENTS and PLUGIN_DEPENDENCIES_UNAVAILABLE bodies. |
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | VersionControl (369), EnabledRow (439), Uninstall button (900). |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Version confirm dialog (630), uninstall wiring (549). |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | removePlugin (1431), setPluginEnabled (1860), setPluginVersion (1843), withPluginReview (1029). |
| service | plugins-directory service | `apps/web/features/directory/services/plugins-directory.ts` | fetchPluginVersions (1541), applyPluginVersion (1573). |
| table | plugin_registry_versions | `apps/web/db/neon/0259_extension_versions_and_lifecycle.sql` | Version rows with status, permissions, digest, signature. |
| table | plugin_installations | `apps/web/db/neon/0109_web_plugin_installations.sql` | installed_version, enabled, review_required. |
| hook | Mobile usePluginActions | `apps/mobile/src/features/plugins/usePluginActions.ts` | setEnabled (86), remove (104). |
| screen | Mobile PluginDetailScreen | `apps/mobile/src/features/plugins/PluginDetailScreen.tsx` | Version card and switchVersion (256, 472). |
| service | Mobile plugin service | `apps/mobile/src/features/plugins/service.ts` | setPluginEnabled (117), uninstallPlugin (132), movePluginToVersion (145). |
| service | CLI installs | `apps/cli/src/installs.rs` | remove_plugin (330), update_plugin (358), set_plugin_enabled (464). |
| service | CLI marketplace update | `apps/cli/src/marketplace.rs` | update_plugin_checkout (665) and pinned_at (733). |
| command | VS Code managePlugins | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Turn on/off (483), update (351), remove (513). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips the switch, picks a version or presses Uninstall; browser sends PATCH, POST or DELETE with a CSRF token. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1431,1843,1860 |
| Server rate-limits, then for turn on checks unmet dependencies and pending permission review; for turn off lists dependents. | our servers | apps/web/app/api/plugins/installations/[id]/route.ts:41-82 |
| Server writes enabled, deletes the installation, or applies the version after signature, scan and permission checks. | our servers | plugin-installation-service.ts:417-445; plugin-lifecycle.ts:656-745 |
| Server writes an audit event plugin_setting_changed or plugin_removed. | our servers | installations/[id]/route.ts:90-100,139-143 |
| Browser refreshes the installs and the skill catalog. | device | useDirectoryAdapter.ts:1468-1471,1851-1855 |
| CLI update runs git pull --ff-only in the plugin folder (a network call to the git host), then checks the signature; on failure puts the previous commit back. | device | apps/cli/src/marketplace.rs:665-730 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| installed_version, enabled, approved_permissions | table plugin_installations | Server side; shared across Cloud surfaces | Row deleted on uninstall |
| Version records and lifecycle events | tables plugin_registry_versions, plugin_registry_lifecycle_events | Server side | Versions are never deleted, only moved between statuses (apps/web/lib/services/plugin-lifecycle.ts:46-50) |
| Audit events plugin_setting_changed, plugin_removed | workspace audit log | Server side | Retention not examined |
| CLI enabled flag, plugin folder, update marker | CLI config and plugin directories on the device | No | Folder removed on remove; marker cleared when the update is decided |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud sign-in for web, desktop-hosted and mobile (getUserScopedDb in installations/[id]/route.ts:42). CLI and VS Code local actions need no account. |
| Permissions | CSRF and rate limit on every write. Turn on, update and uninstall do not call the install gate or org policy (installations/[id]/route.ts:49-145; updates/route.ts:37-79). Version and offer reads need sign-in only. |
| Subscription | none found in the code. |
| Limits and metering | plugin-installation-write 20 per minute per user, fails closed (apps/web/lib/rate-limit.ts:519). Reads use the model-catalog limiter. No metering found. |
| Feature flags | none found for these actions. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Web, desktop-hosted and mobile actions change Managed Cloud installs only. CLI and VS Code local actions work on the device with no account or plan (apps/cli/src/installs.rs:330-480). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Turn off with dependents | 409 PLUGIN_HAS_DEPENDENTS; web converts it to a confirm that turns them off together; mobile shows the message only. | installations/[id]/route.ts:69-82; useDirectoryAdapter.ts:1860-1890; usePluginActions.ts:86-102 |
| Turn on with unmet dependency | 409 PLUGIN_DEPENDENCIES_UNAVAILABLE listing each problem. | installations/[id]/route.ts:61-68 |
| Turn on while permission review pending | 409 naming the added permissions; fixed only by a version update that records them. | plugin-installation-service.ts:398-420 |
| Update target not published | 409 '<id> <v> is <status>, so it cannot be installed.' | plugin-lifecycle.ts:679-683 |
| Installation changed during update | The conditional update writes nothing and returns 'changed while it was being updated. Reload and try again.' | plugin-lifecycle.ts:716-745 |
| Installed version suspended | Offer is listed as a repair; applying it re-enables the installation. | plugin-lifecycle.ts:592-650,708-713 |
| Not installed | 404 PLUGIN_NOT_INSTALLED. | installations/[id]/route.ts:84-88 |
| CLI pinned install | agi plugin update refuses with 'pinned to <tag>; install it again with --ref <tag> to move it'. | apps/cli/src/marketplace.rs:670-674 |
| CLI update pending decision | Refuses until the earlier update is reviewed with agi marketplace update. | apps/cli/src/marketplace.rs:675-680 |
| Offline | not handled in the code beyond error messages. | none found |
| Accessibility | The Enabled switch has aria-label 'Enabled'; the version select has a label; confirmation uses a modal dialog (PluginDetailView.tsx:462,389-396). | as cited |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/plugin-lifecycle.test.ts`: Moving an installation to another version: scan, signature and permission refusals, races, signature kept or dropped on republish.
- `apps/web/app/api/plugins/updates/__tests__/route.test.ts`: Updates route; contents not opened.
- `apps/web/app/api/plugins/installations/__tests__/route.test.ts`: Installations route including enable and delete; contents not opened.
- `apps/web/app/api/plugins/[id]/versions/__tests__/route.test.ts`: Versions route; contents not opened.
- `apps/web/features/plugins/server/directory/__tests__/installed-dependents.test.ts`: Dependents graph; contents not opened.
- `apps/web/app/api/plugins/marketplace-installations/__tests__/route.test.ts`: Marketplace installs route; contents not opened.
- `apps/mobile/src/features/plugins/__tests__/InstalledPluginsScreen.test.tsx`: Mobile installed list; contents not opened.
- `apps/cli/src/features/plugins/plugins.rs`: Inline tests for plugin loading and enablement; specific cases not enumerated.

**Test scenarios**

- **Turn off with dependent**
  1. Install plugin A that depends on B.
  2. Turn B off on web.
  - Expected: Refusal names A; confirming turns off A and B.
- **Update adds permission**
  1. Publish a newer version of a pack that adds a permission.
  2. Open the plugin, press 'Update to <v>'.
  3. Read the dialog and confirm.
  - Expected: Dialog shows 'It also asks for: <permission>'; after confirm installed version is the new one and no review flag remains.
- **Suspended version**
  1. As admin, suspend the version a user has installed.
  2. Open the plugin as that user.
  - Expected: The plugin is off; an update offer is listed; applying a published version turns it back on.
- **Stay on a version**
  1. Switch to an older published version.
  2. Publish a newer one.
  - Expected: Installed version does not change until the user switches.
- **Uninstall with dependents**
  1. Press Uninstall on B while A needs it.
  - Expected: Refusal first; confirm removes A and B and writes two plugin_removed events.
- **CLI pin**
  1. agi plugin install <git-url> --ref v1.0
  2. agi plugin update <name>
  - Expected: Update refuses with the pinned message.

**Where to look when it fails**

- Error codes PLUGIN_HAS_DEPENDENTS, PLUGIN_DEPENDENCIES_UNAVAILABLE, PLUGIN_NOT_INSTALLED, INVALID_PLUGIN_UPDATE.
- Class PluginLifecycleError (409) (apps/web/lib/services/plugin-lifecycle.ts:60).
- Tables plugin_installations, plugin_registry_versions, plugin_registry_lifecycle_events; audit events plugin_setting_changed, plugin_removed.
- CLI: marker file from pending_update_marker beside the plugin folder.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **Web Uninstall fires without a confirmation unless dependents exist.** Affects: Web and desktop-hosted users. Evidence: DirectoryPanel.tsx:549-551; DirectoryDetailHeader.tsx:137-147; AGENTS.md section 9. Work needed: Wrap uninstall in useConfirmAction naming what is lost (skills, settings, connectors).
- **Mobile turn-off does not offer 'turn off together'.** Affects: Mobile users. Evidence: apps/mobile/src/features/plugins/usePluginActions.ts:86-102 versus web useDirectoryAdapter.ts:1860-1890. Work needed: Catch PluginDependentsError and retry with withDependents after a confirm.
- **Update and version choice exist for built-in packs only on web.** Affects: Users of directory and marketplace plugins. Evidence: useDirectoryAdapter.ts:1029-1041. Work needed: Decide if directory plugins get versions; add an offer path.
- **Pin is implicit; an admin rollback moves installs off the withdrawn version.** Affects: Users who chose a version. Evidence: plugin-lifecycle.ts:553-562. Work needed: Confirm intent; document or add an explicit pin.
- **Brief says mobile is missing for all four; mobile has enable, update, version switch and remove.** Affects: Status accuracy. Evidence: PluginDetailScreen.tsx:353,360,472-520. Work needed: Correct the brief; verify on a device.
- **Brief says VS Code has enable/disable only; it also has update and remove (user-installed plugins).** Affects: Status accuracy. Evidence: capabilityManagement.ts:497-516. Work needed: Correct the brief.
- **CLI disable and remove ignore dependents.** Affects: CLI users with dependent plugins. Evidence: apps/cli/src/installs.rs:330-356,464-480. Work needed: Add a dependents check or document it.
- **Turn on, update and uninstall do not re-check org policy.** Affects: Org admins. Evidence: installations/[id]/route.ts:49-145. Work needed: Decide whether policy applies after install.
- **The lifecycle action 'restore' has no route handler.** Affects: Platform admins. Evidence: plugin-lifecycle.ts:33 vs lifecycle/route.ts:31-64. Work needed: Wire or remove the action.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:PATCH /api/plugins/installations/[id]
- api:DELETE /api/plugins/installations/[id]
- api:GET /api/plugins/[id]/versions
- api:GET /api/plugins/updates
- api:POST /api/plugins/updates
- table:plugin_installations
- table:plugin_registry_versions
- table:plugin_registry_lifecycle_events
- F054-07
- F054-08
- F054-11
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations

## Unknown

- Whether the Tauri 'enabledPlugins' switch is wired to a runtime now.
- What the existing tests assert beyond titles (most not opened).
- How the CLI TUI handles /plugin enable, disable and update (apps/cli/src/tui/tui_app.rs not read).
- Whether the update badge on web rows is shown for directory plugins (plugins-directory.ts:711 reads installs.updates populated from /api/plugins/updates only).
- Whether CLI remove clears stored plugin settings.
- Retention of lifecycle events and audit events.

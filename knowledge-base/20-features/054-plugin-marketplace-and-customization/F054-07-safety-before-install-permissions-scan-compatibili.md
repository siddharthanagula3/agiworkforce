---
id: "F054-07"
type: "feature"
title: "Safety before install: permissions, scan, compatibility, dependencies"
aliases: ["Safety before install", "Permissions section", "Security scan section", "Works with row", "Needs attention list", "S54.19 Required permissions", "S54.32 Security-scan result", "S54.33 Compatibility warning", "S54.34 Missing-dependency repair", "Plugin integrity and signature check", "plugins.require_signed"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.19", "S54.32", "S54.33", "S54.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "table:plugin_package_scans", "table:plugin_installations", "table:plugin_registry_versions", "api:GET /api/plugins/[id]/scan", "api:POST /api/plugins/installations", "api:POST /api/plugins/updates", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "file:packages/ui/ui/src/directory/PluginDetailView.tsx", "file:apps/web/lib/services/plugin-marketplace-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-07 Safety before install: permissions, scan, compatibility, dependencies

Before and after a plugin is installed, the product shows what the plugin asks for, its security-scan verdict and which surfaces it fits. The server refuses unscanned, blocked or badly signed packages, and holds a plugin whose update asks for new permissions. Missing plugin dependencies are installed automatically; the 'Needs attention' list fixes missing skills and connectors.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.19](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5419), [S54.32](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5432), [S54.33](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5433), [S54.34](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5434).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a person the facts needed to decide on a plugin (permissions it declares, scan verdict with findings, which surfaces it works on, what it depends on) and enforces safety rules on the server: signed and scanned packages only, no silent permission growth, dependency checks. Web and Desktop (hosted web app) show the facts on the plugin detail page (packages/ui/ui/src/directory/PluginDetailView.tsx:296,307,1066,1068). Mobile shows them in its own screens (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:453,459). The CLI enforces compatibility and signing rules in the terminal (apps/cli/src/features/plugins/plugins.rs:539,1285).

**Why it exists.** A plugin can add skills, hooks and servers that run with the user's access. The brief asks that a user see permissions, scan result, compatibility and dependency problems before trusting a plugin (brief: S54.19, S54.32, S54.33, S54.34). docs/product/competitive-guidance.md:462 lists plugin review and dependency risk as a security-operations topic (doc: docs/product/competitive-guidance.md).

**Who uses it.** Any signed-in person installing or updating a plugin on web, desktop, mobile or CLI; org admins who rely on the gates; support staff reading scan records.

**Problems it solves**

- Installing a plugin without knowing what access it declares.
- A plugin that grows its permissions in an update and runs unreviewed.
- Installing a package nobody scanned or signed.
- Installing a plugin on a surface that cannot run it.
- A plugin that stops working because a plugin it needs is off, missing or suspended.

**Use cases**

- A user on web opens a plugin, reads the Permissions and Security scan sections, then installs.
- A user updates a built-in pack to a version that asks for a new permission and must confirm it first.
- A CLI user with plugins.require_signed set is refused an unsigned plugin.
- A mobile user sees 'Not available on mobile' for a plugin that only runs on Desktop and CLI.

## 2. User experience

**Where to find it**

- Web: Settings > Customize > Plugins, then open a plugin (packages/ui/ui/src/settings-nav.ts:173,378; apps/web/app/chat/customize/page.tsx redirects section=plugins). Sections are headed 'Permissions' and 'Security scan' (packages/ui/ui/src/directory/constants.ts:200,203).
- Desktop (public Electron app): the same hosted web app; the retained Tauri build only shows a 'Manage plugins' button that opens the web page (apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:7, doc: AGENTS.md section 5).
- Mobile: Customize > Plugins > plugin page; cards 'Permissions' and 'Security scan' (apps/mobile/src/features/customize/CustomizeScreen.tsx:44; apps/mobile/src/features/plugins/PluginDetailScreen.tsx:453,459).
- CLI: agi plugin install / info; warnings and refusals print in the terminal (apps/cli/src/lib.rs:2017; apps/cli/src/features/plugins/plugins.rs:380).
- VS Code: Cloud marketplace install dialog lists 'Permissions' before 'Install' (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:122); local plugin install shows a warning that hooks and servers run with the user's permissions (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:340).
- Chrome: not available. No file under apps/extension/src mentions plugins (grep, 2026-11-24).

**Before you start**

- Web, desktop and mobile: signed in to Cloud (mobile route is scoped to cloud, apps/mobile/src/features/shell/destinationScope.ts:38).
- CLI: none for local folder or git installs; no account is read in apps/cli/src/installs.rs:85-125.
- Web scan section needs a scan record for the plugin; otherwise it reads 'Not scanned' (packages/ui/ui/src/directory/constants.ts:210).

**Screens and controls**

- Web detail page: 'Permissions' list with the copy 'What this plugin says it needs. Installing it agrees to these; you can remove it at any time.' (constants.ts:200-202).
- Web detail page: 'Security scan' with verdict text 'Passed. No unsafe patterns were found.', 'Needs your review...', or 'Blocked. It cannot be installed.' and a 'Scanned <date>' line (constants.ts:204-209).
- Web detail page: 'Works with' chips, and when a plugin cannot be installed on the web the label 'Desktop and CLI' with a copyable CLI install command (PluginDetailView.tsx:856,1139; constants.ts:163).
- Web detail page: 'Needs attention' list with one row and button per problem (PluginDetailView.tsx:337; constants.ts:224).
- Web version confirm dialog titled 'Switch to version <v>?' that names new permissions with 'It also asks for:' (DirectoryPanel.tsx:630-650).
- Mobile: install button reads 'Install' or 'Not available on mobile'; a native alert 'Install <name>?' lists permissions (PluginDetailScreen.tsx:369; usePluginActions.ts:65-84).
- CLI: flags --integrity, --unsafe-no-integrity, --unsafe-allow-unsigned, --ref (apps/cli/src/lib.rs:2017-2045).

**Journey**

1. Open the plugin from Customize > Plugins (web/desktop/mobile).
2. Read the Permissions section and the Security scan section on the detail page.
3. Check 'Works with' or the 'Not available' label for your app.
4. Press Install. The server refuses if the package is unscanned, blocked, unsigned or against org policy; the message appears in the page.
5. If the plugin needs other plugins, they are installed first and the page reports them afterwards.
6. Later, open 'Needs attention' to reload missing skills or connect a missing connector.
7. On update, read the new permissions in the confirm dialog and choose 'Switch version'.

**What the person sees and gets**

- Verdict text and findings list (path:line message) in the scan section (PluginDetailView.tsx:307-330; plugins-directory.ts:1526).
- Error message from the server, for example 'The <plugin> package has not been scanned, so it cannot be installed yet.' (apps/web/lib/services/plugin-marketplace-service.ts:294-324).
- 409 'now asks for permissions you have not approved' naming the added permissions (apps/web/lib/services/plugin-installation-service.ts:96-114).
- Toast or note 'Also installed: ...' on mobile; a line naming installed dependencies on web (usePluginActions.ts:44-47; useDirectoryAdapter.ts:1330).

**Settings**

- PLUGIN_SIGNING_PUBLIC_KEYS: server list of trusted publisher keys (name and purpose only) (apps/web/lib/services/plugin-marketplace-service.ts:78).
- plugins.require_signed in the CLI config.toml and a managed plugin policy (apps/cli/src/features/plugins/plugins.rs:254-300).
- No user-facing toggle for scan or permission display on web or mobile: none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: detail page shows Permissions when the plugin declares any, and a Security scan section whenever a scan lookup was made (packages/ui/ui/src/directory/PluginDetailView.tsx:1066,1068; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1029).
- Web: GET /api/plugins/[id]/scan returns the recorded scan for the user's plugin, or null (apps/web/app/api/plugins/[id]/scan/route.ts:21-34; apps/web/lib/services/plugin-marketplace-service.ts:1042-1080).
- Web: scans are rule based pattern matching, no model (packages/client/client-runtime/src/plugins/packageScan.ts:1,65).
- Web: registry package install fails closed on missing hash, missing or invalid signature, untrusted key, and then on a missing or non-pass scan (apps/web/lib/services/plugin-marketplace-service.ts:118-163,294-324).
- Web: a re-install or update that adds permissions sets the installation to review_required and disabled, and throws PluginPermissionReviewRequiredError (apps/web/lib/services/plugin-installation-service.ts:303-336).
- Web: applying an update refuses until every permission the target asks for is in the approved set or acknowledged (apps/web/lib/services/plugin-lifecycle.ts:699-705).
- Web: user-added marketplace entries are installable only with a recorded 'pass' scan (apps/web/lib/services/plugin-marketplace-service.ts:763-790).
- Web: plugin dependencies are resolved and installed before the plugin; install is refused on unreadable, out-of-range or conflicting dependencies (apps/web/lib/services/plugin-installation-service.ts:255-300,346-366).
- Web: enabling a plugin with unmet dependencies returns 409 PLUGIN_DEPENDENCIES_UNAVAILABLE naming each problem (apps/web/app/api/plugins/installations/[id]/route.ts:61-68; apps/web/features/plugins/server/directory/installed-dependents.ts:100-151).
- Web: 'Needs attention' offers Reload for missing skills and Connect for missing connectors (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1774-1812).
- Web: surface fit is shown through 'Works with' and the web-installable flag (published and webInstallable) (packages/contracts/types/src/plugins.ts:240; apps/web/features/directory/services/plugins-directory.ts:972-1013).
- Mobile: permissions alert before install, Permissions and Security scan cards, compatibility warning, Install disabled on a 'block' verdict (apps/mobile/src/features/plugins/usePluginActions.ts:65-84; PluginDetailScreen.tsx:369-372,453,459; pluginsModel.ts:119-132).
- CLI: install refuses a plugin whose engines.agiworkforce range excludes this CLI, and removes the files again (apps/cli/src/features/plugins/plugins.rs:1229-1233,1285-1302); load also reports the refusal (plugins.rs:827).
- CLI: plugins.require_signed refuses unsigned plugins unless --unsafe-allow-unsigned is passed and managed policy permits (apps/cli/src/features/plugins/plugins.rs:539-575).
- CLI: sha256 pin check with --integrity (apps/cli/src/lib.rs:6850-6870; plugins.rs:1312).
- VS Code: Cloud marketplace install dialog lists Permissions, Connectors, Skills and Agents before Install (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:112-146).

**Incomplete**

- Public directory plugins installed through POST /api/plugins/marketplace-installations with pluginId: no scan lookup was found in the install file, and the scan lookup for a directory id returns null, so the page reads 'Not scanned' (apps/web/features/plugins/server/directory/install.ts has no scan call; apps/web/lib/services/plugin-marketplace-service.ts:1042-1062).
- Web 'Needs attention' covers missing skills and missing connectors only; a missing plugin dependency has no repair button, only the 409 message on turn on (useDirectoryAdapter.ts:1774-1812; installations/[id]/route.ts:61-68).
- Mobile: Permissions card appears only if the plugin lists permissions or capabilities (PluginDetailScreen.tsx:452).
- VS Code: no scan result, no compatibility warning and no permission review for local plugin installs; the only warning is a generic one (capabilityManagement.ts:340).

**Present but disconnected or switched off**

- Tauri desktop 'enabledPlugins' switch: docs record that no runtime read it (doc: docs/decisions/wire-or-cut.md GAP-102); whether it is wired now was not checked, see unknowns.

**Not available**

- Chrome extension: nothing found under apps/extension/src.
- VS Code: no per-plugin permission or scan display for plugins in Local mode.
- CLI: no scan result display and no permission list; describe_plugin prints a generic line that hooks and servers run with the user's permissions (apps/cli/src/features/plugins/plugins.rs:533).

## 4. Required behaviour

**Established requirements**

- Before and after installing, a user sees the permissions a plugin requires (S54.19). (source: brief: S54.19 Should)
- A user can see a plugin's security-scan result (S54.32). (source: brief: S54.32 Should)
- The product warns when a plugin is not compatible with this surface or version (S54.33). (source: brief: S54.33 Should)
- When a plugin's dependency is missing, the product offers to fix it (S54.34). (source: brief: S54.34 Should)
- Plugin requirements include install, enable/disable, update, uninstall, namespacing and marketplace/source controls. (source: doc: docs/product/requirements.md section 19)
- Show which skill or plugin is active, what it can access and how a user can intervene. (source: doc: docs/product/competitive-guidance.md item 103)

**Acceptance criteria**

1. On web, a plugin with declared permissions shows each one under 'Permissions' before and after install.
2. A plugin version with no recorded scan cannot be installed; the message says it has not been scanned.
3. A plugin whose scan verdict is 'block' cannot be installed on web or mobile (mobile Install button is disabled).
4. Applying an update whose version adds a permission fails unless that permission is acknowledged in the request.
5. Installing a plugin with an unmet plugin dependency installs the dependency first and reports its name.
6. Turning on a plugin whose dependency is off returns an error naming the dependency and the problem.
7. CLI install of a plugin with an excluded engines.agiworkforce range fails and leaves no files; with plugins.require_signed true an unsigned plugin is refused without --unsafe-allow-unsigned.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The 'repair' in S54.34 should cover plugin-on-plugin dependencies, not only skills and connectors, because the brief says 'dependency'.
- [inferred] Every surface that can install a plugin should show scan and permissions, because VS Code and CLI installs run code on the device.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Turn on <dependency>' repair button for an unmet dependency on web and mobile.
- [proposed] Scan or label as unscanned every directory (GitHub) plugin before install, and say so in the install dialog.
- [proposed] Show scan verdict and permissions in the VS Code and CLI install flow.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Shared detail page: PermissionsSection (296), ScanSection (307), RepairList (337), 'Works with' row, Desktop-and-CLI label (856). |
| config | Directory UI copy | `packages/ui/ui/src/directory/constants.ts` | Exact labels and verdict texts for permissions, scan, repairs and version confirm. |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Loads scan and versions for the detail (withPluginReview 1029), builds repairs (1774), installs and reports dependencies (1330). |
| service | plugins-directory service | `apps/web/features/directory/services/plugins-directory.ts` | Maps entries to detail (972), fetchPluginScan (1526), fetchPluginVersions (1541), availability label (674). |
| endpoint | GET /api/plugins/[id]/scan | `apps/web/app/api/plugins/[id]/scan/route.ts` | Returns the recorded scan for the user's plugin. |
| service | plugin-marketplace-service | `apps/web/lib/services/plugin-marketplace-service.ts` | Signature and hash check (118), install gate (294), entry gate (763), scan lookup (1042-1080), scan recording (216). |
| service | plugin-installation-service | `apps/web/lib/services/plugin-installation-service.ts` | Permission review on install (303), dependency plan (255), enable guard for pending review (398). |
| service | plugin-lifecycle | `apps/web/lib/services/plugin-lifecycle.ts` | Version diff with requiresPermissionReview (206), update with permission acknowledgement (656). |
| service | installed-dependents | `apps/web/features/plugins/server/directory/installed-dependents.ts` | Readiness graph and unmet-dependency messages. |
| service | packageScan | `packages/client/client-runtime/src/plugins/packageScan.ts` | Rule-based content scanner (scan-rules.json). |
| table | plugin_package_scans | `apps/web/db/neon/0232_plugin_package_signing_and_permission_review.sql` | Stores verdict, findings and rules version by content hash. |
| table | plugin_installations | `apps/web/db/neon/0109_web_plugin_installations.sql` | Holds approved_permissions, pending_permissions, review_required (columns used at plugin-installation-service.ts:369). |
| screen | Mobile PluginDetailScreen | `apps/mobile/src/features/plugins/PluginDetailScreen.tsx` | Permissions, Security scan, compatibility warning, install button state. |
| hook | Mobile usePluginActions | `apps/mobile/src/features/plugins/usePluginActions.ts` | Permission alert before install (65). |
| service | CLI plugin signature and compatibility | `apps/cli/src/features/plugins/plugins.rs` | PluginSignaturePolicy (254), evaluate_plugin_signature (539), check_plugin_compatibility (1285). |
| service | CLI installs | `apps/cli/src/installs.rs` | install_plugin (85), install_dependencies (150), unmet_version (285). |
| command | VS Code Cloud marketplace browser | `apps/extension-vscode/src/features/surfaces/accountMarketplace.ts` | Install confirm that lists permissions (122). |
| config | Rate limit plugin-installation-write | `apps/web/lib/rate-limit.ts` | 20 per minute, fails closed (519). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the plugin detail page; the browser loads the entry, then fetches scan and versions for it. | device and our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1029; apps/web/app/api/plugins/[id]/scan/route.ts:21-34 |
| Server finds the content hash for the plugin (marketplace entry hash, or registry version digest) and reads the stored scan record. | our servers | apps/web/lib/services/plugin-marketplace-service.ts:1042-1080 |
| Person presses Install; the server applies the workspace feature gate for plugins and the per-plugin org policy before anything is written. | our servers | apps/web/features/plugins/server/directory/install-gate.ts:21-50; apps/web/app/api/plugins/installations/route.ts:58-61 |
| Server plans dependencies, refuses unreadable or conflicting ones, checks policy for each dependency. | our servers | apps/web/lib/services/plugin-installation-service.ts:255-300; apps/web/app/api/plugins/installations/route.ts:62-73 |
| Server verifies hash, signature (Ed25519 against trusted keys) and scan verdict, then compares declared permissions with the approved set; growth holds the install for review. | our servers | apps/web/lib/services/plugin-installation-service.ts:303-345; apps/web/lib/services/plugin-marketplace-service.ts:118-163 |
| Install writes the rows (dependencies first) and an audit event per plugin. | our servers | apps/web/lib/services/plugin-installation-service.ts:346-366; apps/web/app/api/plugins/installations/route.ts:94-116 |
| CLI install runs entirely on the device: clone or copy, signature policy, sha256 pin, compatibility check; the only network use is git and remote server sign-in. | device | apps/cli/src/installs.rs:85-125; apps/cli/src/features/plugins/plugins.rs:1229-1233 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Scan verdict, findings, rules version per content hash | table plugin_package_scans | Server side only; web, mobile read it through the API | Upserted on rescan (scanned_at refreshed); deletion rule not found |
| Approved and pending permissions per installation | table plugin_installations | Server side; shared by web, desktop, mobile | Deleted when the plugin is uninstalled (apps/web/lib/services/plugin-installation-service.ts:434) |
| Audit event plugin_installed with source and version | workspace audit log via recordWorkspaceAuditEvent | Server side | Retention not examined |
| CLI installed plugin folders and signature state | CLI plugin directory on the device | No | Removed by agi plugin remove (apps/cli/src/installs.rs:330) |

**Models and providers.** No model or provider takes part. The scan is a fixed rule set (packages/client/client-runtime/src/plugins/packageScan.ts:1) and signature checks use Ed25519 keys (apps/web/lib/services/plugin-marketplace-service.ts:118-163).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, desktop and mobile calls need a signed-in user (getUserScopedDb in apps/web/app/api/plugins/installations/route.ts:43). CLI install needs no account (apps/cli/src/installs.rs:85). |
| Permissions | Workspace feature gate for 'plugins' and per-plugin org policy; refusal is 403 PLUGIN_NOT_PERMITTED (apps/web/features/plugins/server/directory/install-gate.ts:13,39-48; install-responses.ts:47). Turning a plugin on (PATCH) does not call this gate (apps/web/app/api/plugins/installations/[id]/route.ts:49-102). Viewing scan and versions needs only sign-in. |
| Subscription | none found in the code. No plan, entitlement or credit check appears in the plugin install or scan routes (grep of apps/web/app/api/plugins/installations/route.ts, uploads/route.ts, authored/route.ts, lib/services/plugin-installation-service.ts). Whether the workspace policy gate itself reads the plan was not examined. |
| Limits and metering | plugin-installation-write: 20 per minute per user, fails closed (apps/web/lib/rate-limit.ts:519). Read routes use the model-catalog limiter (apps/web/app/api/plugins/[id]/scan/route.ts:26). No usage metering found. |
| Feature flags | PLUGIN_SIGNING_PUBLIC_KEYS (trusted publisher keys) (apps/web/lib/services/plugin-marketplace-service.ts:78); plugins.require_signed and managed plugin policy in the CLI (apps/cli/src/features/plugins/plugins.rs:254-300). |
| Model compatibility | Not applicable; no model is involved. |
| Provider restrictions | none found in the code. |
| Local mode | Web plugin install is Cloud only: the API says 'not available for Managed Cloud installation' (apps/web/app/api/plugins/installations/route.ts:75-84). The Tauri desktop page states Local Mode extensions are managed in Local settings and never listed from the Cloud account (apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:46-51). The CLI works fully on the device without an account (apps/cli/src/installs.rs:85). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web detail shows a spinner 'Loading plugin settings' while settings load; scan and versions failures fall back to null (apps/web/features/directory/services/plugins-directory.ts:1526 readOptional; PluginDetailView.tsx:677). Mobile catches scan, versions and update fetch errors and shows nothing for them (PluginDetailScreen.tsx:93-99). | as cited |
| No scan record | Web reads 'Not scanned. Scans run on plugins you upload or create and on registry versions.' (packages/ui/ui/src/directory/constants.ts:210). Mobile reads 'Not scanned.' (apps/mobile/src/features/plugins/pluginsModel.ts:12). | as cited |
| Scan verdict review or block | Server refuses the install with the findings; for 'review' the upload path lets a user acknowledge (scanCautionFrom in useDirectoryAdapter.ts); mobile disables Install on 'block' only. | apps/web/lib/services/plugin-marketplace-service.ts:310-322; PluginDetailScreen.tsx:371 |
| Permissions grew | Installation is switched off and flagged review_required; turning it on is refused until a version update records the permissions. | apps/web/lib/services/plugin-installation-service.ts:317-336,398-420 |
| Plugin not installable on this surface | Web shows 'Desktop and CLI' and an install command; mobile shows 'Not available on mobile' with the plugin's runtime note. | PluginDetailView.tsx:856; apps/mobile/src/features/plugins/pluginsModel.ts:119-132 |
| Dependency suspended, off or in review | Turn-on is refused with problems 'is turned off', 'is waiting for a permission review', 'is suspended'. | apps/web/features/plugins/server/directory/installed-dependents.ts:94-104 |
| Rate limited | Install writes return the rate limit response after 20 per minute. | apps/web/app/api/plugins/installations/route.ts:47-48 |
| Offline or timeout | not handled in the code for the web detail page beyond the error banner; VS Code Cloud calls abort after 20 seconds (apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:51). | as cited |
| Accessibility | Mobile compatibility warning uses accessibilityRole alert; web error text uses role alert (PluginDetailScreen.tsx:338-345; PluginDetailView.tsx:681). | as cited |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/plugin-lifecycle.test.ts`: Update refuses a target that was never scanned, whose scan did not pass or that is unsigned; asks again for unapproved permissions; records approved set (test titles at lines 220-320).
- `apps/web/lib/services/plugin-installation-service.test.ts`: Install service behaviour; contents not opened, covers inferred from file name.
- `apps/web/lib/services/plugin-marketplace-service.test.ts`: Marketplace service including signature and scan gates; contents not opened.
- `apps/web/app/api/plugins/[id]/scan/__tests__/route.test.ts`: Scan route; contents not opened.
- `packages/client/client-runtime/src/__tests__/plugin-package-scan.test.ts`: Scanner rules; contents not opened.
- `apps/web/features/plugins/server/directory/__tests__/installed-dependents.test.ts`: Dependent and unmet-dependency graph; contents not opened.
- `packages/ui/ui/src/directory/__tests__/PluginDetailView.test.tsx`: Shared detail view; contents not opened.
- `apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx`: Mobile plugin screens; contents not opened.
- `apps/cli/src/features/plugins/plugins.rs`: Inline Rust tests for signature policy and compatibility (lines 2274-2389, 2845-2860).

**Test scenarios**

- **Permissions visible before and after install**
  1. Sign in on web.
  2. Open Settings > Customize > Plugins and pick a plugin that declares permissions.
  3. Read the Permissions section.
  4. Install it and reopen the page.
  - Expected: The same permission list shows both times.
- **Unscanned package refused**
  1. Pick a registry version with no row in plugin_package_scans (test database).
  2. Press Install.
  - Expected: 409 with the message that the package has not been scanned.
- **Permission growth held**
  1. Install a pack version.
  2. Publish a newer version that adds a permission.
  3. Try to turn the plugin on or re-install.
  - Expected: Install is refused, the plugin stays off and the message names the added permission; update with the permission acknowledged succeeds.
- **Dependency installed first**
  1. Install a pack that declares a dependency.
  2. Read the install result.
  - Expected: Response lists the dependency under dependencies and both appear as installed.
- **CLI refuses unsigned**
  1. Set plugins.require_signed = true in config.toml.
  2. Run agi plugin install on an unsigned local folder.
  3. Repeat with --unsafe-allow-unsigned.
  - Expected: First run refuses with the message naming plugins.require_signed; second installs with a warning unless managed policy forbids override.
- **Incompatible CLI version**
  1. Create a plugin manifest with engines.agiworkforce set to a range that excludes the CLI version.
  2. Run agi plugin install.
  - Expected: Install fails with 'plugin requires agiworkforce <range>, this CLI is <version>' and no folder remains.

**Where to look when it fails**

- Error codes PLUGIN_NOT_PERMITTED, PLUGIN_DEPENDENCIES_UNAVAILABLE, PLUGIN_NOT_INSTALLABLE (apps/web/features/plugins/server/directory/install-responses.ts).
- Class names PluginPackageRefusedError and PluginPermissionReviewRequiredError (apps/web/lib/services/plugin-installation-service.ts:94,96).
- Log line '[plugin-signing] a configured publisher key could not be parsed and was ignored' (plugin-marketplace-service.ts:98).
- Tables plugin_package_scans, plugin_installations; audit event plugin_installed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)
- Mobile: [70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/mobile/054-plugin-marketplace-and-customization.md)
- CLI: [70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/cli/054-plugin-marketplace-and-customization.md)
- VS Code: [70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/vscode/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **The brief says CLI permissions and scan are 'not in the brief'; the code shows no permission list or scan result in the CLI.** Affects: CLI users installing plugins that run hooks and servers. Evidence: apps/cli/src/features/plugins/plugins.rs:533 is the only permission wording. Work needed: Decide the CLI contract and, if wanted, print declared permissions and a scan verdict at install.
- **The brief and docs/product/surface-feature-matrix.md:376 record mobile plugins as missing; mobile has install, permissions, scan, compatibility, update and remove screens.** Affects: Anyone reading the brief as truth for mobile. Evidence: apps/mobile/src/features/plugins/PluginDetailScreen.tsx:369,453,459; apps/mobile/src/features/customize/CustomizeScreen.tsx:44. Work needed: Correct the brief and matrix; verify the mobile screens on a device.
- **The brief says VS Code permissions are missing; the Cloud marketplace install dialog lists them, but local plugin installs show no permission list and no scan.** Affects: VS Code users. Evidence: apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:122; capabilityManagement.ts:340. Work needed: Show permissions and scan for local installs, or record the decision not to.
- **Missing-dependency repair is not an offer to install; dependencies install automatically at install time, and a later unmet dependency only gives an error message.** Affects: Web, desktop and mobile users who turned off a dependency. Evidence: apps/web/app/api/plugins/installations/[id]/route.ts:61-68; useDirectoryAdapter.ts:1774-1812. Work needed: Add a repair row that turns on or reinstalls the dependency.
- **Directory (GitHub) plugins are installable without a recorded scan and show 'Not scanned'.** Affects: Web and desktop users installing public directory plugins. Evidence: apps/web/features/plugins/server/directory/install.ts (no scan call); plugin-marketplace-service.ts:1042-1062. Work needed: Decide whether to scan before install or label the risk in the install confirm.
- **PATCH turn-on does not re-run the org policy gate.** Affects: Orgs that block a plugin after members installed it. Evidence: apps/web/app/api/plugins/installations/[id]/route.ts:49-102 has no call to refusePluginInstall. Work needed: Confirm intended behaviour; add the gate to turn-on if policy should apply.
- **No Chrome extension support for any of this.** Affects: Chrome extension users. Evidence: no plugin reference under apps/extension/src. Work needed: Product decision on whether Chrome needs plugins.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- table:plugin_package_scans
- table:plugin_installations
- table:plugin_registry_versions
- api:GET /api/plugins/[id]/scan
- api:POST /api/plugins/installations
- api:POST /api/plugins/updates
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- file:packages/ui/ui/src/directory/PluginDetailView.tsx
- file:apps/web/lib/services/plugin-marketplace-service.ts

## Unknown

- Values of PLUGIN_SIGNING_PUBLIC_KEYS in any environment (secret-adjacent, not read).
- Whether decideWorkspacePolicy takes the subscription plan into account (apps/web/lib/managed-compute-gate.ts was read only up to the gate wrapper).
- Whether the Tauri enabledPlugins switch is wired to a runtime now (decision doc says it was not).
- What the existing tests assert beyond their titles (most files not opened).
- How the CLI TUI /plugin screens present compatibility and signature state (apps/cli/src/tui/tui_app.rs not read).
- Retention rule for plugin_package_scans rows.
- Whether mobile scan and permission cards have been verified on a device (no record found).

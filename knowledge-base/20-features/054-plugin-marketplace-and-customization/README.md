---
id: "AREA-054"
type: "area"
title: "Plugin marketplace and customization"
features: ["F054-01", "F054-02", "F054-03", "F054-04", "F054-05", "F054-06", "F054-07", "F054-08", "F054-09", "F054-10", "F054-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 54. Plugin marketplace and customization

A person finds add-ons (plugins) that add skills, connectors, agents, commands or hooks, installs them, and turns them on or off. It sits under one Customize area that also holds Skills and Connectors. A company can also run a private plugin marketplace for its members. Plugin use is the main way the product gets new abilities without a new app release.

**Who uses it.** Every signed-in web or desktop user can browse and install plugins (installs are stored per user). Workspace admins assign plugins to an organization, its groups or members. Publishers submit plugins for review. Platform staff moderate listings. Command-line users manage plugins from the terminal, both on disk and from their account's marketplaces. Mobile and the Chrome extension have no plugin install path in the code I read. Plan-level limits were not established (not sure).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F054-01](F054-01-customize-area-and-tabs.md) | Customize area and tabs | built | built | partly | partly | built | no |
| [F054-02](F054-02-browse-and-search-the-marketplace.md) | Browse and search the marketplace | built | built | built | partly | partly | no |
| [F054-03](F054-03-add-a-git-repository-as-a-marketplace.md) | Add a git repository as a marketplace | built | built | partly | built | built | no |
| [F054-04](F054-04-organization-private-marketplace-and-admin-assignm.md) | Organization private marketplace and admin assignment | partly | partly | partly | no | no | no |
| [F054-05](F054-05-featured-recommended-and-categories.md) | Featured, recommended and categories | partly | partly | partly | partly | no | no |
| [F054-06](F054-06-plugin-detail-what-it-includes-and-what-it-needs.md) | Plugin detail: what it includes and what it needs | built | built | built | partly | partly | no |
| [F054-07](F054-07-safety-before-install-permissions-scan-compatibili.md) | Safety before install: permissions, scan, compatibility, dependencies | built | built | built | partly | partly | no |
| [F054-08](F054-08-install-configure-and-bundled-connections.md) | Install, configure and bundled connections | built | built | built | partly | partly | no |
| [F054-09](F054-09-turn-off-update-pin-uninstall.md) | Turn off, update, pin, uninstall | built | built | built | built | partly | no |
| [F054-10](F054-10-customize-a-plugin-copy-its-skills.md) | Customize a plugin (copy its skills) | built | built | no | no | no | no |
| [F054-11](F054-11-publish-review-and-moderate.md) | Publish, review and moderate | partly | partly | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/054-plugin-marketplace-and-customization.md](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md).

## How this area works in the code

1. **Find the area in settings.** The Customize group in the settings navigation lists Skills, Connectors and Plugins. The chat customize route only redirects to the matching settings section. (`packages/ui/ui/src/settings-nav.ts:376-378`, `apps/web/app/chat/customize/page.tsx:5`)
2. **Load the directory and install state.** The directory hook loads the catalogue and the user's installs in one place. It keeps the plugin page state and the settings target. (`apps/web/features/directory/hooks/useDirectoryAdapter.ts:341`, `apps/web/features/directory/hooks/useDirectoryAdapter.ts:910`, `apps/web/features/directory/hooks/useDirectoryAdapter.ts:1013`)
3. **Install request reaches the server.** The install route checks the request token, applies a rate limit, validates the plugin id, and then runs the workspace and dependency gates before it plans and writes the install. (`apps/web/app/api/plugins/installations/route.ts:45-80`)
4. **Gates decide if the install is allowed.** The workspace feature check for plugins (and skills for authored plugins) runs first. Then each plugin is checked against the organization policy. (`apps/web/features/plugins/server/directory/install-gate.ts:12-49`, `apps/web/lib/services/connector-policy-gate.ts:217-223`)
5. **Plan and write the install.** The service works out required dependencies, then writes the install row for each one. The write upserts the row, turns it on, and records the approved permissions and skills. (`apps/web/lib/services/plugin-installation-service.ts:255`, `apps/web/lib/services/plugin-installation-service.ts:346`, `apps/web/lib/services/plugin-installation-service.ts:375`)
6. **Turn a plugin on or off.** The enable route checks unmet dependencies when turning on. When turning off, it refuses if other plugins depend on it, unless withDependents is set, in which case those dependents are turned off too. (`apps/web/app/api/plugins/installations/[id]/route.ts:35`, `apps/web/app/api/plugins/installations/[id]/route.ts:61-83`, `apps/web/lib/services/plugin-installation-service.ts:417`)
7. **Versions and lifecycle.** Versions move only along allowed steps (draft, in review, published, deprecated, suspended). The installed view lists only published versions. (`apps/web/lib/services/plugin-lifecycle.ts:51`, `apps/web/lib/services/plugin-lifecycle.ts:142`)
8. **Customize (copy skills).** The customize route checks the request token, applies a rate limit, runs the authored-skill gate, and copies the installed plugin's skills into an owned editable copy. (`apps/web/app/api/plugins/customize/route.ts:24-50`, `apps/web/features/plugins/server/directory/customize.ts:154`)
9. **Add a marketplace.** The marketplace route accepts a public GitHub address, registers the source, and writes an audit event. (`apps/web/app/api/plugins/marketplaces/route.ts:52-70`)
10. **Command-line path.** The command-line tool has its own plugin commands. Marketplace installs go to the account (cloud); plugin installs from a path or git address are kept on disk in the plugins folder. (`apps/cli/src/lib.rs:2357-2397`, `apps/cli/src/cloud/marketplaces.rs:136`, `apps/cli/src/features/plugins/plugins.rs:624`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/ui/src/settings-nav.ts` | Defines the Customize group and the Tools group where Skills, Connectors and Plugins appear. |
| `packages/ui/ui/src/directory/PluginDetailView.tsx` | Plugin detail page: included items, permissions, scan, compatibility, enable switch, settings, install and update actions. |
| `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Directory list panel shared by web and desktop. |
| `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Client hook that loads the catalogue and installs and runs install, enable, update, uninstall and settings actions. |
| `apps/web/app/api/plugins/installations/route.ts` | Server route to list installs and install a plugin, with gates. |
| `apps/web/features/plugins/server/directory/install-gate.ts` | Gate that checks workspace features and organization policy before install or customize. |
| `apps/web/lib/services/plugin-installation-service.ts` | Plans and writes installs, enable state and dependency handling. |
| `apps/web/lib/services/plugin-lifecycle.ts` | Version status rules and the published-version list. |
| `apps/web/features/plugins/server/directory/customize.ts` | Copies an installed plugin's skills into an owned editable copy. |
| `apps/cli/src/features/plugins/plugins.rs` | Command-line plugin loading, signature policy and local install outcomes. |
| `apps/cli/src/cloud/marketplaces.rs` | Command-line calls to account marketplaces (list, entries, install). |
| `apps/mobile/src/features/customize/CustomizeScreen.tsx` | Mobile Customize screen with links to Plugins, Skills and Connectors. |
| `apps/web/db/neon/0109_web_plugin_installations.sql` | Creates the per-user plugin installs table. |

## What is stored

- Per-user plugin installs: user, plugin id, installed version, on/off, enabled skills, approved and pending permissions, review flag, times: Database table public.plugin_installations (apps/web/db/neon/0109_web_plugin_installations.sql:53; written in apps/web/lib/services/plugin-installation-service.ts:375)
- Plugin versions, status, manifest address, checksum, signature, declared skills, permissions, changelog: Database table public.plugin_registry_versions (apps/web/db/neon/0259_extension_versions_and_lifecycle.sql:44)
- Lifecycle history of plugin versions: Database table public.plugin_registry_lifecycle_events (apps/web/db/neon/0259_extension_versions_and_lifecycle.sql:81)
- Marketplace sources and their plugin entries and installs: Database tables public.plugin_marketplace_sources, plugin_marketplace_entries, plugin_marketplace_installations (apps/web/db/neon/0159_plugin_marketplace_sources.sql:22,54,105)
- Organization plugins, their files, members and group settings: Database tables public.organization_plugins (apps/web/db/neon/0326_organization_plugins.sql:33), organization_plugin_files (:73), organization_plugin_members (:104), organization_plugin_group_settings (apps/web/db/neon/0327_organization_plugin_group_settings.sql:29)
- Plugin submissions and their files and installs: Database tables public.plugin_submissions (apps/web/db/neon/0328_plugin_submissions.sql:31), plugin_submission_files (:79), plugin_submission_installs (:110)
- Package security scan records: Database table public.plugin_package_scans (apps/web/db/neon/0232_plugin_package_signing_and_permission_review.sql:89)
- Command-line plugins installed from a path or git address: A plugins folder on disk (apps/cli/src/features/plugins/plugins.rs:624, lookup at :734)
- Customized copies of plugin skills: Owned plugin source records (apps/web/lib/services/plugin-owned-source-service.ts, storage details not traced)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_USER_SKILL_AUTHORING environment value**: Setting it to 0 turns skill authoring and customize off; the server then returns a not-found error. Empty or any other value leaves it on. (apps/web/lib/services/user-skill-authoring.ts:5-16; read also in apps/web/lib/services/user-skill-service.ts:173,200,228; example in apps/web/.env.example:408)
- **Workspace feature plugins (and skills for authored plugins)**: Workspace policy can refuse install or customize for the user. (apps/web/features/plugins/server/directory/install-gate.ts:12, 28-38; enforced by apps/web/lib/managed-compute-gate.ts:205-230)
- **Organization plugin policy**: Blocks a single plugin for a user before install. (apps/web/features/plugins/server/directory/install-gate.ts:44-49; apps/web/lib/services/connector-policy-gate.ts:217-223)
- **Plugin dependency refusal**: Refuses install when a required plugin is blocked. (apps/web/app/api/plugins/installations/route.ts:57-67; install-gate.ts:pluginDependencyRefusal)
- **Mobile skills feature flag**: When false, skill calls on mobile throw Skills are not available on Mobile. (apps/mobile/lib/v1FeatureFlags.ts:20 (set to true); checked in apps/mobile/src/features/skills/service.ts (assertSkillsAvailable))
- **CLI plugins.require_signed setting**: When on, unsigned plugins are refused unless the user passes the unsafe flag. Trusted publishers list is also read here. (apps/cli/src/features/plugins/plugins.rs:273-278, 554, 570, 580; flags in apps/cli/src/lib.rs:2034 and :2383)
- **Settings group placement**: Decides where Skills, Connectors and Plugins appear in the settings menu. (packages/ui/ui/src/settings-nav.ts:251-254 (Tools group), :376-378 (Customize group))

## Shared between apps

Shared by web and desktop: the directory and plugin detail UI in packages/ui/ui/src/directory (PluginDetailView.tsx, DirectoryPanel.tsx, DirectoryToolbar.tsx) and the settings navigation in packages/ui/ui/src/settings-nav.ts. The web client hook apps/web/features/directory/hooks/useDirectoryAdapter.ts is the one used by web; whether desktop uses the same hook was not checked. Shared API contracts for plugin wire shapes come from @agiworkforce/cloud-contracts, used by web and by mobile (apps/mobile/src/features/plugins/service.ts). Separate per app: CLI plugin and marketplace code is Rust (apps/cli/src/lib.rs, apps/cli/src/features/plugins/plugins.rs, apps/cli/src/cloud/marketplaces.rs). VS Code has its own surface file apps/extension-vscode/src/features/surfaces/capabilityManagement.ts. Mobile plugin screens are in apps/mobile/src/features/plugins/. The Chrome extension (apps/extension/src) has no plugin code found.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief marks mobile plugins as missing, but mobile has plugin screens and a Plugins entry in Customize. The screens are hidden from the drawer and reached from Customize. Status in the brief may be stale. (apps/mobile/app/(app)/_layout.tsx:91-93; apps/mobile/src/features/customize/CustomizeScreen.tsx:44-47; apps/mobile/src/features/plugins/PluginsScreen.tsx:300)
- The brief points items S54.27, S54.28 and S54.35 to apps/web/lib/services/user-skill-authoring.ts:11, which only holds the authoring on/off check. The real customize copy is in the customize route and customizePlugin. No separate fork action or plugin-creation assistant was found in plugin code. (apps/web/lib/services/user-skill-authoring.ts:10-16; apps/web/app/api/plugins/customize/route.ts:24; apps/web/features/plugins/server/directory/customize.ts:154)
- The customize route calls the request-token check without the user id, while the install route passes it. This may be intended, but it is inconsistent. (apps/web/app/api/plugins/customize/route.ts:24 versus apps/web/app/api/plugins/installations/route.ts:45)
- Brief item S54.07 says a git repository can be added as a marketplace. The web route accepts only a public GitHub address and refuses others. (apps/web/app/api/plugins/marketplaces/route.ts:52)
- Featured and recommended plugins are missing. The only featured flag in the directory code belongs to connectors, not plugins. (apps/web/features/directory/services/connectors-directory.ts:601-621)
- The scan route only reads a scan result (GET). The code that starts a scan was not traced in this pass. (apps/web/app/api/plugins/[id]/scan/route.ts (handleGet))

## Not established

- Plan tiers: which paid plan unlocks plugins, skills or private marketplaces was not established. The gate is a workspace policy feature, but the plan mapping was not traced.
- Own-key and Local modes for plugins: the web install path is Managed Cloud only (apps/web/app/api/plugins/installations/route.ts:80); whether plugins run in Local or own-key mode was not established for the desktop or the command-line tool.
- Empty, loading and failure states on the directory and detail pages were not checked.
- Desktop: whether the desktop app loads the same web directory hook and routes was not verified.
- Brief items S54.05 and S54.08 are marked unverified for the command-line tool; I did not confirm them.
- Permissions review (S54.19) and the plugin-lifecycle service at plugin-lifecycle.ts:142 were only partly traced.
- Security-scan creation (where plugin_package_scans rows are written) was located only in apps/web/lib/services/plugin-marketplace-service.ts; the write itself was not opened.
- Mobile plugin screens were located but not read in full, so their real coverage against the brief is unknown.
- Nothing was run: no build, tests, localhost or per-surface testing was done, as the task required read-only work.

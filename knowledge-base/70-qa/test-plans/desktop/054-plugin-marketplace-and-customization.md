---
id: "PLAN-desktop-054"
type: "test-plan"
title: "Desktop · 54. Plugin marketplace and customization"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "54"
---
# Desktop · 54. Plugin marketplace and customization

33 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S54.01 Unified Customize destination.

- **Expected:** One Customize destination gathers skills, connectors and plugins.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:374; apps/web/app/chat/customize/page.tsx:5; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475
- **Where to find it:** Settings > Customize (group) > Skills, Connectors, Plugins (labels found in the code)
- **Steps:**
  1. Open Settings from the account menu.
  2. Look for the group named Customize in the left list.
  3. Open Skills, then Connectors, then Plugins: all three sit under that one group.
  4. Compare: one Customize group gathers skills, connectors and plugins.

## S54.02 Plugins tab.

- **Expected:** A Plugins section lists available and installed plugins.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:173; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776; apps/web/features/directory/services/plugins-directory.ts:1313
- **Where to find it:** Settings > Customize > Plugins (labels found in the code)
- **Steps:**
  1. Open Settings, then click Plugins under Customize.
  2. Look for the headings Installed and All plugins.
  3. Check that the list shows installed and available plugins.

## S54.03 Skills tab.

- **Expected:** A Skills section sits beside plugins in the customization area.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:376; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/settings/components/WebSettingsModal.tsx:222; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475
- **Where to find it:** Settings > Customize > Skills (labels found in the code)
- **Steps:**
  1. Open Settings, then click Skills under Customize, right beside Plugins.
  2. Look for the headings Installed and All skills.
  3. Check that the Skills page opens next to the Plugins entry.

## S54.04 Connectors tab.

- **Expected:** A Connectors section sits in the customization area.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:377; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/settings/components/WebSettingsModal.tsx:332; apps/web/features/directory/services/connectors-directory.ts:431
- **Where to find it:** Settings > Customize > Connectors (labels found in the code)
- **Steps:**
  1. Open Settings, then click Connectors under Customize.
  2. Look for the headings Connected and All connectors.
  3. Check that the Connectors section sits in the same Customize group.

## S54.05 Public marketplace.

- **Expected:** A user can browse a public plugin marketplace and install from it.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776; apps/web/features/directory/services/plugins-directory.ts:1313; apps/web/features/plugins/server/directory/constants.ts:17; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1363; apps/web/features/plugins/server/directory/install.ts:311
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Customize > Plugins > Add marketplace > Browse AGI sources (labels found in the code)
- **Steps:**
  1. Open Settings > Customize > Plugins.
  2. Click Add marketplace.
  3. Click Browse AGI sources (text: Curated marketplaces of plugins from AGI and partners).
  4. Look for a list of marketplaces and install a plugin from one of them, to compare with Expected.

## S54.06 Private organization marketplace.

- **Expected:** An organization has a private marketplace of plugins for its members.
- **Code:** done. Evidence present: apps/web/app/api/settings/organization/plugins/route.ts:62; apps/web/lib/services/organization-plugin-service.ts:214; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:325; apps/web/features/directory/services/plugins-directory.ts:1286; apps/web/db/neon/0326_organization_plugins.sql:33
- **Where to find it:** Workspace console > Plugins (labels found in the code)
- **Needs:** an organization admin account in a workspace
- **Steps:**
  1. Sign in as an organization admin and open the workspace console.
  2. Click Plugins in the console menu (hint: Plugins this workspace publishes, and who gets them).
  3. Look at the assignment choices Required, Installed by default, Available to install and Not available.

## S54.07 Repository-backed marketplace.

- **Expected:** A user can add a git repository as a plugin marketplace and install plugins listed in it.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryPanel.tsx:459; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1546; apps/web/app/api/plugins/marketplaces/route.ts:61; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1909
- **Where to find it:** Settings > Customize > Plugins > Add marketplace > Add from a repository (labels found in the code)
- **Needs:** a git repository url that holds a plugin marketplace
- **Steps:**
  1. Open Settings > Customize > Plugins and click Add marketplace.
  2. Click Add from a repository.
  3. Type a git repository url in Repository url, optionally a branch or tag, then click Sync marketplace.
  4. Look for the plugins listed under Plugins in this marketplace, then install one, to compare with Expected.

## S54.08 Search and filters.

- **Expected:** A user can search the plugin catalogue and filter the results.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryToolbar.tsx:109; apps/web/features/directory/services/plugins-directory.ts:1126; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776
- **Where to find it:** Settings > Customize > Plugins (labels found in the code)
- **Steps:**
  1. Open Settings > Customize > Plugins.
  2. Click the search box (placeholder Search plugins) and type a plugin name.
  3. Click Filter by, then Sort by, and try a choice.
  4. Look for the list to narrow to matching plugins, to compare with Expected.

## S54.09 Role/use-case categories.

- **Expected:** Plugins are grouped into role or use-case categories a user can browse.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:1139; apps/web/features/plugins/server/directory/query.ts:60; apps/web/app/api/plugins/route.ts:36
- **Where to find it:** Settings > Customize > Plugins > Filter by > Category (labels found in the code)
- **Steps:**
  1. Open Settings > Customize > Plugins.
  2. Click Filter by and look for the group Category.
  3. Pick a category and check that the list shows only plugins in it.

## S54.12 Publisher detail.

- **Expected:** A user can see details about a plugin's publisher.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1118; packages/ui/ui/src/directory/DirectoryPanel.tsx:623; apps/web/features/directory/services/plugins-directory.ts:1152; apps/web/features/plugins/server/directory/query.ts:113
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Publisher (labels found in the code)
- **Steps:**
  1. Open Settings > Customize > Plugins and click a plugin.
  2. Scroll to the Publisher section.
  3. Check the publisher name, the link More from and the Website link.

## S54.13 Plugin detail.

- **Expected:** A user can open a plugin's detail page.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; packages/ui/ui/src/directory/PluginDetailView.tsx:113 (quoted code not found in the file now); packages/ui/ui/src/directory/PluginDetailView.tsx:1141; packages/ui/ui/src/directory/PluginDetailView.tsx:1151; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1076
- **Where to find it:** Settings > Customize > Plugins > click a plugin (labels found in the code)
- **Steps:**
  1. Open Settings > Customize > Plugins.
  2. Click a plugin card, or its More info link.
  3. Check the detail page: name, Install or Uninstall button, Plugin contents tabs.

## S54.14 Included Skills.

- **Expected:** A plugin shows the skills it includes, and they become usable when installed.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:161; packages/ui/ui/src/directory/PluginDetailView.tsx:553; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1899; apps/web/app/api/plugins/[id]/settings/route.ts:69
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Includes > Skills (labels found in the code)
- **Needs:** a plugin that includes skills
- **Steps:**
  1. Open a plugin's detail page.
  2. Look at the Includes section and its Skills tab under Plugin contents.
  3. Click Install, then type / in chat and look for the plugin's skills in the list.

## S54.15 Included connectors.

- **Expected:** A plugin shows the connectors it includes, and they work when installed.
- **Code:** done. Evidence present: apps/web/features/plugins/server/directory/inspection.ts:256; apps/web/features/plugins/server/directory/archive.ts:490; apps/web/lib/connectors/plugin-connectors.ts:39; apps/web/app/api/plugins/marketplace-installations/route.ts:99; apps/web/app/api/plugins/uploads/route.ts:87
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Plugin contents > Connectors (labels found in the code)
- **Needs:** a plugin that includes connectors
- **Steps:**
  1. Open a plugin's detail page that lists connectors.
  2. Click the Connectors tab under Plugin contents.
  3. Look at each connector's status: Connected, Not connected or Not added.

## S54.16 Included agents.

- **Expected:** A plugin shows the agents it includes, and they are usable when installed.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:172; apps/cli/src/agents.rs:296
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Includes > Agents (labels found in the code)
- **Needs:** a plugin that includes agents; the agi CLI if you want to use them
- **Steps:**
  1. Open a plugin's detail page that includes agents.
  2. Look at the Includes section for the Agents line.
  3. Read the note: Agents run in the agi CLI, not in chat.

## S54.17 Included commands.

- **Expected:** A plugin shows the commands it includes, and they are usable when installed.
- **Code:** done. Evidence moved: apps/web/features/plugins/server/directory/inspection.ts:200; apps/web/features/plugins/server/directory/skill-files.ts:26 (quoted code not found in the file now); apps/web/features/plugins/server/directory/install.ts:331; apps/web/features/plugins/server/directory/archive.ts:462; apps/web/features/plugins/server/directory/inspection.ts:445
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Includes > Commands (labels found in the code)
- **Needs:** a plugin that includes commands
- **Steps:**
  1. Open a plugin's detail page that includes commands.
  2. Look at the Includes section for the Commands line and its tab.
  3. Install the plugin and check that its commands appear for use.

## S54.19 Required permissions.

- **Expected:** Before and after installing, a user sees the permissions a plugin requires.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1066; packages/ui/ui/src/directory/DirectoryPanel.tsx:361; apps/web/lib/services/plugin-lifecycle.ts:142
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Permissions (labels found in the code)
- **Needs:** a plugin that lists permissions
- **Steps:**
  1. Open a plugin's detail page before installing it.
  2. Read the Permissions section and its copy: What this plugin says it needs.
  3. Install, then open the same page again and check that the permissions are still shown.

## S54.20 Supported surfaces.

- **Expected:** A plugin shows which surfaces it works on.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1141; apps/web/features/directory/services/plugins-directory.ts:1126; packages/ui/ui/src/directory/PluginDetailView.tsx:998
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Works with (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page.
  2. Look at the Works with line and the Desktop and CLI note.
  3. Compare with the surface you are on.

## S54.21 Install.

- **Expected:** A user can install a plugin.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1363; apps/web/app/api/plugins/installations/route.ts:58 (quoted code not found in the file now); apps/web/features/plugins/server/directory/install.ts:311
- **Where to find it:** Settings > Customize > Plugins > click a plugin > Install (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page.
  2. Click Install.
  3. Confirm in the Install dialog (Cancel is the other button).
  4. Look for the primary button to change to the installed state, and the plugin to appear under Installed.

## S54.22 Configure.

- **Expected:** A user can configure an installed plugin's settings.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:553; packages/ui/ui/src/directory/PluginDetailView.tsx:600; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1899; apps/web/app/api/plugins/[id]/settings/route.ts:69
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Look at the Enabled switch and the per-skill Use switches.
  3. Change a setting, then reopen the page and check it was kept.

## S54.23 Authenticate bundled connections.

- **Expected:** A user can authenticate the connections a plugin bundles.
- **Code:** done. Evidence present: apps/web/lib/connectors/plugin-connectors.ts:51; apps/web/features/directory/constants.ts:355; apps/web/lib/connectors/plugin-connectors.ts:82; apps/web/app/api/plugins/marketplace-installations/[id]/route.ts:150; apps/web/db/neon/0332_custom_connector_plugin_source.sql:20
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin > Plugin contents > Connectors > Connect (labels found in the code)
- **Needs:** an installed plugin with connectors; an outside account for connectors that sign in with a service
- **Steps:**
  1. Open an installed plugin that bundles connectors.
  2. Click the Connectors tab under Plugin contents.
  3. Click Connect (or Add API key) on a connector.
  4. Look for the status to change from Not connected to Connected.

## S54.24 Enable/disable.

- **Expected:** A user can turn an installed plugin off and on without uninstalling it.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:461; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1265 (quoted code not found in the file now); apps/web/app/api/plugins/installations/[id]/route.ts:83
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin > Enabled (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Turn the Enabled switch off.
  3. Read the hint: Turn this off to keep the plugin installed without using it.
  4. Check that the plugin is still listed as installed, then turn Enabled back on.

## S54.25 Update.

- **Expected:** A user can update an installed plugin to a newer version.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:712; packages/ui/ui/src/directory/PluginDetailView.tsx:1058; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1850; apps/web/features/directory/services/plugins-directory.ts:1584
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin > Update to (labels found in the code)
- **Needs:** an installed plugin with a newer version published
- **Steps:**
  1. Open an installed plugin that has a newer version.
  2. Look for the Update available label and the Update to line in the version section.
  3. Click Update to and confirm.
  4. Check that the Installed version changes to the new version.

## S54.26 Pin version.

- **Expected:** A user can pin a plugin to a specific version.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:369; apps/web/features/directory/services/plugins-directory.ts:1555; apps/web/app/api/plugins/[id]/versions/route.ts:25
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin > Choose a version (labels found in the code)
- **Needs:** an installed plugin with more than one version
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Click Choose a version (or Switch version).
  3. Pick an older version and confirm in Switch to version.
  4. Check that the plugin stays on that version.

## S54.27 Customize installed plugin.

- **Expected:** A user can customize an installed plugin (edit its skills or content).
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin > Customize (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Click Customize (hint: Make your own copy of this plugin and edit its skills).
  3. Confirm with Make my copy.
  4. Look for your own copy to be editable and the original to be turned off.

## S54.28 Fork plugin.

- **Expected:** A user can fork a plugin into their own editable copy.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Customize > Plugins > click an installed plugin > Customize > Make my copy (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Click Customize, then Make my copy.
  3. Look for the copy in your own plugins list with the same skills and files.

## S54.29 Uninstall.

- **Expected:** A user can uninstall a plugin.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1057 (quoted code not found in the file now); apps/web/app/api/plugins/installations/[id]/route.ts:132
- **Where to find it:** Settings > Customize > Plugins > Remove (beside an installed plugin) > Remove in the "Remove plugin?" box. A second route: open the plugin's detail and click Uninstall. (labels found in the code)
- **Needs:** an account with at least one installed plugin
- **Steps:**
  1. Sign in and open Settings.
  2. Under Customize, click Plugins.
  3. On a plugin that shows as installed, click Remove.
  4. In the "Remove plugin?" box, click Remove.
  5. Compare with Expected: the plugin leaves the installed list and its skills and commands stop working. Then open the plugin's detail and check that Uninstall is gone or changed.

## S54.30 Organization assignment.

- **Expected:** An admin can assign plugins to an organization, its groups or members.
- **Code:** done. Evidence present: apps/web/db/neon/0327_organization_plugin_group_settings.sql:63; apps/web/lib/services/organization-plugin-service.ts:306; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:210; apps/web/lib/services/organization-plugin-service.ts:384; apps/web/app/api/plugins/organization/[pluginId]/route.ts:56
- **Where to find it:** Settings > Workspace > Workspace administration > Plugins (workspace console at /workspace/plugins) (labels found in the code)
- **Needs:** an admin account in a workspace, plus a member account in the same workspace
- **Steps:**
  1. Sign in as an admin of a workspace and open Settings, then Workspace, then Workspace administration.
  2. Click Plugins in the console's left list.
  3. On a plugin row, open the install setting and choose one of Required, Installed by default, Available to install or Not available.
  4. Under the group settings, pick a group in "Choose a group", choose a setting for it and save.
  5. Sign in as a member of that workspace and compare with Expected: a Required plugin is on and cannot be turned off, a Not available plugin is hidden.

## S54.32 Security-scan result.

- **Expected:** A user can see a plugin's security-scan result.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:307; apps/web/lib/services/plugin-marketplace-service.ts:1064; apps/web/app/api/plugins/[id]/scan/route.ts:25; packages/ui/ui/src/directory/UploadFileDialog.tsx:136
- **Where to find it:** Settings > Customize > Plugins > click a plugin row > Security scan (labels found in the code)
- **Needs:** a plugin that has a scan result (for example one you uploaded as an archive)
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Click a plugin row to open its detail.
  3. Scroll to the section headed Security scan.
  4. Read the verdict line under the heading.
  5. Compare with Expected: the verdict is one of "Passed. No unsafe patterns were found.", "Needs your review. It may carry risk depending on where it came from." or "Blocked. It cannot be installed.", with any findings listed below it.

## S54.33 Compatibility warning.

- **Expected:** The product warns when a plugin is not compatible with this surface or version.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1013; apps/web/features/directory/services/plugins-directory.ts:680; packages/ui/ui/src/directory/PluginDetailView.tsx:998
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin's detail > Not available on this surface (labels found in the code)
- **Needs:** a plugin the server has stopped running on this surface; ask the owner for one
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Open an installed plugin that the server no longer runs on this surface.
  3. Look for the row headed "Not available on this surface" with the hint "Still installed, but the server no longer runs it here."
  4. Compare with Expected: the warning replaces the Enabled switch for that plugin.

## S54.34 Missing-dependency repair.

- **Expected:** When a plugin's dependency is missing, the product offers to fix it.
- **Code:** done. Evidence present: apps/web/features/directory/hooks/useDirectoryAdapter.ts:1781; packages/ui/ui/src/directory/PluginDetailView.tsx:992
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin's detail > Reload skills or Connect (labels found in the code)
- **Needs:** an installed plugin with a missing skill or an unconnected connector
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Open an installed plugin whose skill failed to load or whose connector is not connected.
  3. Look for the line "These skills did not load:" with the skill names and a Reload skills button, or the line "Its skills need the connector" with a Connect button.
  4. Click the button shown and compare with Expected: skills reload, or the connector's connect flow opens.

## S54.35 Plugin-creation assistant.

- **Expected:** The product helps a user build a plugin with an assistant.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** not found in the code. No assistant was found. The only plugin-making flow is the "Create a plugin" form (packages/ui/ui/src/directory/constants.ts, opened from DirectoryPanel.tsx when the plugins section has createPlugin). apps/web/lib/services/user-skill-authoring.ts only holds an on/off switch (AGI_USER_SKILL_AUTHORING) and no assistant UI. I did not confirm the form is shown in Settings > Customize > Plugins.

## S54.36 Submission and review workflow.

- **Expected:** A publisher can submit a plugin for review and track the review.
- **Code:** done. Evidence present: apps/web/app/api/plugins/submissions/route.ts:57; apps/web/features/admin/pages/PluginModerationPage.tsx:776; apps/web/lib/services/plugin-submission-service.ts:329
- **Where to find it:** Settings > Customize > Plugins > open a plugin you created > Submit to the directory > Submit for review (labels found in the code)
- **Needs:** a plugin you created, and a platform staff account to review it
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Open a plugin you created (through Create a plugin).
  3. Click Submit to the directory.
  4. Click Submit for review in the confirmation.
  5. Compare with Expected: the plugin shows Submitted for review and a Withdraw button. A second admin account can then open Admin > Plugin moderation to review it.

## S54.37 Listing moderation.

- **Expected:** Platform staff can moderate listings (suspend, deprecate).
- **Code:** done. Evidence present: apps/web/features/admin/pages/PluginModerationPage.tsx:794; apps/web/features/admin/pages/PluginModerationPage.tsx:998; apps/web/app/api/admin/plugin-submissions/[id]/route.ts:102
- **Where to find it:** Admin console > Plugin moderation (page at /admin/plugins) (labels found in the code)
- **Needs:** a platform staff account
- **Steps:**
  1. Sign in as platform staff and open the admin console.
  2. Click Plugin moderation.
  3. Click Review next to a plugin, then open a version.
  4. Click Deprecate or Suspend. In the confirmation, click Suspend.
  5. Compare with Expected: the version shows the Deprecated or Suspended badge.

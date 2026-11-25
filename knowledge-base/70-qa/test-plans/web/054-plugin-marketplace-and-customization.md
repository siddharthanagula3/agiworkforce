---
id: "PLAN-web-054"
type: "test-plan"
title: "Web · 54. Plugin marketplace and customization"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "54"
---
# Web · 54. Plugin marketplace and customization

33 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S54.01 Unified Customize destination.

- **Expected:** One Customize destination gathers skills, connectors and plugins.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:374; apps/web/app/chat/customize/page.tsx:5; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475
- **Earlier check in the running app:** PASS: E008 [PASS; interaction]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Customize (group heading) > Skills, Connectors, Plugins (labels found in the code)
- **Steps:**
  1. Open Settings from the app.
  2. Find the group headed Customize in the left list.
  3. Click Skills, then Connectors, then Plugins in turn.
  4. Check that all three sit under the one Customize heading, as Expected says.

## S54.02 Plugins tab.

- **Expected:** A Plugins section lists available and installed plugins.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:173; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776; apps/web/features/directory/services/plugins-directory.ts:1313
- **Earlier check in the running app:** PASS: E021 [PASS; empty-state interaction]: Plugin manager loads with Browse/Add and an empty installed list. No third-party software installed.
- **Where to find it:** Settings > Customize > Plugins (labels found in the code)
- **Steps:**
  1. Open Settings and click Plugins under Customize.
  2. Look for the Browse and Add buttons above the list.
  3. Check the installed list and the available plugins shown after Browse.

## S54.03 Skills tab.

- **Expected:** A Skills section sits beside plugins in the customization area.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:376; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/settings/components/WebSettingsModal.tsx:222; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475
- **Earlier check in the running app:** PASS: E019 [PASS; interaction]: Browse opens the built-in Installed catalog; searching research-and-citations narrows it to one skill with name, publisher and description.
- **Where to find it:** Settings > Customize > Skills (labels found in the code)
- **Steps:**
  1. Open Settings and click Skills under Customize.
  2. Click Browse.
  3. Type research-and-citations in the Search skills box.
  4. Check that one skill shows with its name, publisher and description.

## S54.04 Connectors tab.

- **Expected:** A Connectors section sits in the customization area.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:377; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/settings/components/WebSettingsModal.tsx:332; apps/web/features/directory/services/connectors-directory.ts:431
- **Where to find it:** Settings > Customize > Connectors (labels found in the code)
- **Needs:** none to view; an outside account for the service to connect it
- **Steps:**
  1. Open Settings and click Connectors under Customize.
  2. Look at the list of connectors and the Connect buttons.
  3. Check that each connector shows its status.

## S54.05 Public marketplace.

- **Expected:** A user can browse a public plugin marketplace and install from it.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776; apps/web/features/directory/services/plugins-directory.ts:1313; apps/web/features/plugins/server/directory/constants.ts:17; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1363; apps/web/features/plugins/server/directory/install.ts:311
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Customize > Plugins > Browse (labels found in the code)
- **Steps:**
  1. Open Settings, click Plugins under Customize, then click Browse.
  2. Type a plugin name in Search plugins.
  3. Click a plugin, then click Install.
  4. Read the install confirmation, then compare with Expected.

## S54.06 Private organization marketplace.

- **Expected:** An organization has a private marketplace of plugins for its members.
- **Code:** done. Evidence present: apps/web/app/api/settings/organization/plugins/route.ts:62; apps/web/lib/services/organization-plugin-service.ts:214; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:325; apps/web/features/directory/services/plugins-directory.ts:1286; apps/web/db/neon/0326_organization_plugins.sql:33
- **Where to find it:** Workspace console > Controls > Plugins (labels found in the code)
- **Needs:** an organization admin account in a workspace, and a second member account in the same workspace
- **Steps:**
  1. Sign in as an organization admin and open the workspace console.
  2. Under Controls, click Plugins.
  3. Read the publish options Required, Installed by default and Available to install.
  4. Compare with Expected, then check that a member sees the plugin in Settings > Customize > Plugins.

## S54.07 Repository-backed marketplace.

- **Expected:** A user can add a git repository as a plugin marketplace and install plugins listed in it.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryPanel.tsx:459; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1546; apps/web/app/api/plugins/marketplaces/route.ts:61; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1909
- **Where to find it:** Settings > Customize > Plugins > Add > Add marketplace > Add from a repository (labels found in the code)
- **Needs:** a git repository that lists plugins
- **Steps:**
  1. Open Settings, click Plugins, then click Add.
  2. Click Add marketplace, then Add from a repository.
  3. Type a git repository address in Repository url and click Sync marketplace.
  4. Check that plugins from that repository appear in the list.

## S54.08 Search and filters.

- **Expected:** A user can search the plugin catalogue and filter the results.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryToolbar.tsx:109; apps/web/features/directory/services/plugins-directory.ts:1126; apps/web/features/directory/hooks/useDirectoryAdapter.ts:776
- **Earlier check in the running app:** PASS: E022 [PASS; search and detail interaction]: Search Research settled at two matching results (Research and Writing packs). Research detail lists literature-review skill, Web support, publisher and version. No pack installed.
- **Where to find it:** Settings > Customize > Plugins, then the Search plugins box (labels found in the code)
- **Steps:**
  1. Open Settings, click Plugins under Customize.
  2. Type Research in Search plugins.
  3. Check that the results narrow to matching plugins.
  4. Use the filter control beside the search box and check the results change.

## S54.09 Role/use-case categories.

- **Expected:** Plugins are grouped into role or use-case categories a user can browse.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:1139; apps/web/features/plugins/server/directory/query.ts:60; apps/web/app/api/plugins/route.ts:36
- **Where to find it:** not found in the code. The plugin detail shows a Category row, but no browse-by-category control was found in DirectoryToolbar.tsx or the directory constants. Searched packages/ui/ui/src/directory and apps/web/features/directory for category controls.

## S54.12 Publisher detail.

- **Expected:** A user can see details about a plugin's publisher.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1118; packages/ui/ui/src/directory/DirectoryPanel.tsx:623; apps/web/features/directory/services/plugins-directory.ts:1152; apps/web/features/plugins/server/directory/query.ts:113
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Publisher (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page from Browse.
  2. Find the Publisher row and read the publisher name.
  3. Click the link that reads More from and the publisher name.
  4. Check that the list now shows that publisher's plugins.

## S54.13 Plugin detail.

- **Expected:** A user can open a plugin's detail page.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; packages/ui/ui/src/directory/PluginDetailView.tsx:113 (quoted code not found in the file now); packages/ui/ui/src/directory/PluginDetailView.tsx:1141; packages/ui/ui/src/directory/PluginDetailView.tsx:1151; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1076
- **Earlier check in the running app:** PASS: E022 [PASS; search and detail interaction]: Search Research settled at two matching results (Research and Writing packs). Research detail lists literature-review skill, Web support, publisher and version. No pack installed.
- **Where to find it:** Settings > Customize > Plugins > Browse > click a plugin (labels found in the code)
- **Steps:**
  1. Open Settings, click Plugins, then click Browse.
  2. Type Research in Search plugins.
  3. Click the Research pack card.
  4. Check the detail page shows the name, publisher, version and Includes section.

## S54.14 Included Skills.

- **Expected:** A plugin shows the skills it includes, and they become usable when installed.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:161; packages/ui/ui/src/directory/PluginDetailView.tsx:553; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1899; apps/web/app/api/plugins/[id]/settings/route.ts:69
- **Earlier check in the running app:** PASS: E022 [PASS; search and detail interaction]: Search Research settled at two matching results (Research and Writing packs). Research detail lists literature-review skill, Web support, publisher and version. No pack installed.
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Includes > Skills (labels found in the code)
- **Needs:** none to view; an install is needed for the Use switches
- **Steps:**
  1. Open a plugin's detail page.
  2. Under Includes, click the Skills tab.
  3. Read the skill names and descriptions.
  4. Install the plugin, then check that each skill has a Use switch.

## S54.15 Included connectors.

- **Expected:** A plugin shows the connectors it includes, and they work when installed.
- **Code:** done. Evidence present: apps/web/features/plugins/server/directory/inspection.ts:256; apps/web/features/plugins/server/directory/archive.ts:490; apps/web/lib/connectors/plugin-connectors.ts:39; apps/web/app/api/plugins/marketplace-installations/route.ts:99; apps/web/app/api/plugins/uploads/route.ts:87
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Includes > Connectors (labels found in the code)
- **Needs:** an outside account for the service
- **Steps:**
  1. Open a plugin's detail page.
  2. Under Includes, click the Connectors tab.
  3. Read each connector's status: Connected, Not connected or Not added.
  4. Click Connect on one connector and check the status changes.

## S54.16 Included agents.

- **Expected:** A plugin shows the agents it includes, and they are usable when installed.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:172; apps/cli/src/agents.rs:296
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Includes > Agents (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page.
  2. Find the Agents row under Includes.
  3. Read the note: Agents run in the agi CLI, not in chat.
  4. Compare with Expected.

## S54.17 Included commands.

- **Expected:** A plugin shows the commands it includes, and they are usable when installed.
- **Code:** done. Evidence moved: apps/web/features/plugins/server/directory/inspection.ts:200; apps/web/features/plugins/server/directory/skill-files.ts:26 (quoted code not found in the file now); apps/web/features/plugins/server/directory/install.ts:331; apps/web/features/plugins/server/directory/archive.ts:462; apps/web/features/plugins/server/directory/inspection.ts:445
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Includes > Commands (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page.
  2. Find the Commands row under Includes.
  3. Read the list of commands shown.

## S54.19 Required permissions.

- **Expected:** Before and after installing, a user sees the permissions a plugin requires.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1066; packages/ui/ui/src/directory/DirectoryPanel.tsx:361; apps/web/lib/services/plugin-lifecycle.ts:142
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Permissions (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page before installing.
  2. Read the Permissions section and its copy.
  3. Click Install and read the confirmation.
  4. Cancel, then compare with Expected.

## S54.20 Supported surfaces.

- **Expected:** A plugin shows which surfaces it works on.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1141; apps/web/features/directory/services/plugins-directory.ts:1126; packages/ui/ui/src/directory/PluginDetailView.tsx:998
- **Earlier check in the running app:** PASS: E022 [PASS; search and detail interaction]: Search Research settled at two matching results (Research and Writing packs). Research detail lists literature-review skill, Web support, publisher and version. No pack installed.
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Works with (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page.
  2. Find the Works with row and read its chips.
  3. Find the Desktop and CLI text if the plugin is not for this surface.

## S54.21 Install.

- **Expected:** A user can install a plugin.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1363; apps/web/app/api/plugins/installations/route.ts:58 (quoted code not found in the file now); apps/web/features/plugins/server/directory/install.ts:311
- **Earlier check in the running app:** UI_ONLY: E021 [NOT_TESTED; installation not performed]: Plugin manager loads with Browse/Add and an empty installed list. No third-party software installed. | E022 [UI_ONLY; install button only]: Search Research settled at two matching results (Research and Writing packs). Research detail lists literature-review skill, Web support, publisher and version. No pack installed.
- **Where to find it:** Settings > Customize > Plugins > Browse > open a plugin > Install (labels found in the code)
- **Steps:**
  1. Open a plugin's detail page.
  2. Click Install.
  3. Read the confirmation title that starts with Install.
  4. Confirm and check that the button changes to Uninstall.

## S54.22 Configure.

- **Expected:** A user can configure an installed plugin's settings.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:553; packages/ui/ui/src/directory/PluginDetailView.tsx:600; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1899; apps/web/app/api/plugins/[id]/settings/route.ts:69
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Find the Enabled switch and the Use switches for its skills.
  3. Change one Use switch.
  4. Check the change stays after reopening the plugin.

## S54.23 Authenticate bundled connections.

- **Expected:** A user can authenticate the connections a plugin bundles.
- **Code:** done. Evidence present: apps/web/lib/connectors/plugin-connectors.ts:51; apps/web/features/directory/constants.ts:355; apps/web/lib/connectors/plugin-connectors.ts:82; apps/web/app/api/plugins/marketplace-installations/[id]/route.ts:150; apps/web/db/neon/0332_custom_connector_plugin_source.sql:20
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin > Includes > Connectors > Connect (labels found in the code)
- **Needs:** an outside account for that service
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Click the Connectors tab under Includes.
  3. Click Connect on a bundled connector.
  4. Complete the sign-in and check the status shows Connected.

## S54.24 Enable/disable.

- **Expected:** A user can turn an installed plugin off and on without uninstalling it.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:461; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1265 (quoted code not found in the file now); apps/web/app/api/plugins/installations/[id]/route.ts:83
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin > Enabled (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Turn the Enabled switch off.
  3. Check the plugin is still listed as installed and Uninstall is still there.
  4. Turn Enabled back on.

## S54.25 Update.

- **Expected:** A user can update an installed plugin to a newer version.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:712; packages/ui/ui/src/directory/PluginDetailView.tsx:1058; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1850; apps/web/features/directory/services/plugins-directory.ts:1584
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin > Installed version (labels found in the code)
- **Needs:** an installed plugin that has a newer version
- **Steps:**
  1. Open an installed plugin that has a newer version.
  2. Read the Update available badge and the Installed version row.
  3. Click Choose a version, pick the newer version, then click Switch version.
  4. Read the confirmation, then check the Installed version changed.

## S54.26 Pin version.

- **Expected:** A user can pin a plugin to a specific version.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:369; apps/web/features/directory/services/plugins-directory.ts:1555; apps/web/app/api/plugins/[id]/versions/route.ts:25
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin > Installed version > Choose a version (labels found in the code)
- **Needs:** an installed plugin with more than one version
- **Steps:**
  1. Open an installed plugin's detail page.
  2. Find the Installed version row.
  3. Click Choose a version and pick a different version.
  4. Click Switch version, read the confirmation, and check the Installed version row.

## S54.27 Customize installed plugin.

- **Expected:** A user can customize an installed plugin (edit its skills or content).
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Customize > Plugins > open a plugin > Customize (labels found in the code)
- **Needs:** a plugin that allows customizing
- **Steps:**
  1. Open a plugin's detail page where Customize is shown.
  2. Click Customize and read the confirmation that starts with Customize.
  3. Confirm and open the copy that is made.
  4. Edit one of its skills and check the change is kept.

## S54.28 Fork plugin.

- **Expected:** A user can fork a plugin into their own editable copy.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Customize > Plugins > open a plugin > Customize (labels found in the code)
- **Needs:** a plugin that allows customizing
- **Steps:**
  1. Open a plugin's detail page.
  2. Click Customize to make an editable copy.
  3. Check that a copy of the plugin appears with its own skills.
  4. Check the original plugin is unchanged.

## S54.29 Uninstall.

- **Expected:** A user can uninstall a plugin.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1057 (quoted code not found in the file now); apps/web/app/api/plugins/installations/[id]/route.ts:132
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin > Uninstall (labels found in the code)
- **Needs:** a plugin already installed (install one from Browse first)
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Open a plugin whose header shows Installed.
  3. Click Uninstall in the plugin header.
  4. Look: the plugin should leave the installed list, as Expected says a user can uninstall it.

## S54.30 Organization assignment.

- **Expected:** An admin can assign plugins to an organization, its groups or members.
- **Code:** done. Evidence present: apps/web/db/neon/0327_organization_plugin_group_settings.sql:63; apps/web/lib/services/organization-plugin-service.ts:306; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:210; apps/web/lib/services/organization-plugin-service.ts:384; apps/web/app/api/plugins/organization/[pluginId]/route.ts:56
- **Where to find it:** Workspace > Plugins (labels found in the code)
- **Needs:** a workspace admin account and a member account in the same workspace; a group if testing the group step
- **Steps:**
  1. Sign in as a workspace admin, open the Workspace section and click Plugins.
  2. Find a plugin the workspace publishes and open its install setting.
  3. Choose Required, Installed by default or Available to install.
  4. For a group setting, pick a group under Choose a group and check the row reads Setting for that group.
  5. Sign in as a member of the same workspace, open Settings > Customize > Plugins, and compare the plugin's state with the setting you chose.

## S54.32 Security-scan result.

- **Expected:** A user can see a plugin's security-scan result.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:307; apps/web/lib/services/plugin-marketplace-service.ts:1064; apps/web/app/api/plugins/[id]/scan/route.ts:25; packages/ui/ui/src/directory/UploadFileDialog.tsx:136
- **Where to find it:** Settings > Customize > Plugins > open a plugin > Security scan (labels found in the code)
- **Needs:** none; a plugin with a scan result (check which plugins show a verdict)
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Open a plugin's detail page.
  3. Scroll below the Permissions section to the Security scan heading.
  4. Compare the verdict text with Expected: Passed, Needs your review, or Blocked, with a Scanned date. If it reads Not scanned, the plugin has no scan yet.

## S54.33 Compatibility warning.

- **Expected:** The product warns when a plugin is not compatible with this surface or version.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:1013; apps/web/features/directory/services/plugins-directory.ts:680; packages/ui/ui/src/directory/PluginDetailView.tsx:998
- **Where to find it:** Settings > Customize > Plugins > open a plugin (labels found in the code)
- **Needs:** an installed plugin the server no longer runs (hard to get on demand); a web account
- **Steps:**
  1. Open Settings, then Customize, then Plugins.
  2. Open a plugin that is not installed. If it reads Desktop and CLI, it is set up from the desktop app or CLI on this surface.
  3. Open an installed plugin the server no longer runs. Look for the warning Not available on this surface.
  4. Read its hint: Still installed, but the server no longer runs it here. Compare with Expected.

## S54.34 Missing-dependency repair.

- **Expected:** When a plugin's dependency is missing, the product offers to fix it.
- **Code:** done. Evidence present: apps/web/features/directory/hooks/useDirectoryAdapter.ts:1781; packages/ui/ui/src/directory/PluginDetailView.tsx:992
- **Where to find it:** Settings > Customize > Plugins > open an installed plugin (labels found in the code)
- **Needs:** an installed plugin whose skill is missing or whose connector is not connected (hard to set up on demand)
- **Steps:**
  1. Open Settings, then Customize, then Plugins, and open an installed plugin.
  2. Look for a repair row: These skills did not load: with a Reload skills button, or Its skills need the connector with a Connect button.
  3. Click Reload skills or Connect.
  4. Look: the row should clear, or the connector flow should open. Compare with Expected.

## S54.35 Plugin-creation assistant.

- **Expected:** The product helps a user build a plugin with an assistant.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** not found in the code. No plugin-creation assistant found. I searched 'assistant' in apps/web/features/directory, packages/ui/ui/src/directory and apps/web/features/plugins. The only creation path is a manual 'Create a plugin' form with Name, Description and Skills fields (packages/ui/ui/src/directory/constants.ts:429). apps/web/lib/services/user-skill-authoring.ts is only an on/off environment guard, not an assistant.

## S54.36 Submission and review workflow.

- **Expected:** A publisher can submit a plugin for review and track the review.
- **Code:** done. Evidence present: apps/web/app/api/plugins/submissions/route.ts:57; apps/web/features/admin/pages/PluginModerationPage.tsx:776; apps/web/lib/services/plugin-submission-service.ts:329
- **Where to find it:** Settings > Customize > Plugins > open a plugin you created or uploaded > Submit to the directory (labels found in the code)
- **Needs:** a plugin you created or uploaded; a platform admin account for the review step
- **Steps:**
  1. Open Settings, then Customize, then Plugins, and open a plugin you created or uploaded. The button appears only when the plugin is submittable.
  2. Click Submit to the directory, then Submit for review in the dialog.
  3. Look for the status Submitted for review and a Withdraw button in the plugin detail.
  4. Sign in as a platform admin, open Plugin moderation (/admin/plugins), and filter by Waiting for review to find the submission.
  5. Compare with Expected: the publisher can see the review status.

## S54.37 Listing moderation.

- **Expected:** Platform staff can moderate listings (suspend, deprecate).
- **Code:** done. Evidence present: apps/web/features/admin/pages/PluginModerationPage.tsx:794; apps/web/features/admin/pages/PluginModerationPage.tsx:998; apps/web/app/api/admin/plugin-submissions/[id]/route.ts:102
- **Where to find it:** Admin console > Plugin moderation > open a plugin > Deprecate or Suspend next to a version (labels found in the code)
- **Needs:** a platform admin account; a test plugin version you can safely suspend
- **Steps:**
  1. Sign in as a platform admin, open the admin console and click Plugin moderation (/admin/plugins). Other accounts get a not-found page.
  2. Find a plugin and open its versions list.
  3. Click Deprecate or Suspend next to a published version.
  4. Confirm in the dialog (Suspend asks Suspend <name> <version>?).
  5. Look: the version status should change to Deprecated or Suspended. Compare with Expected.

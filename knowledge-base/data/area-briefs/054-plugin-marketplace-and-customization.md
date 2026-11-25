# Area 54. Plugin marketplace and customization

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S54.01 Unified Customize destination.
- Should: One Customize destination gathers skills, connectors and plugins.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome missing
- Code: packages/ui/ui/src/settings-nav.ts:303; apps/web/app/chat/customize/page.tsx:5; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/directory/hooks/useDirectoryAdapter.ts:628; apps/web/features/directory/hooks/useDirectoryAdapter.ts:356; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:293; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:551; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:642

## S54.02 Plugins tab.
- Should: A Plugins section lists available and installed plugins.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/settings-nav.ts:303; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/directory/hooks/useDirectoryAdapter.ts:628; apps/web/features/directory/services/plugins-directory.ts:686; apps/cli/src/tui/tui_app.rs:3762; apps/cli/src/lib.rs:1293; apps/cli/src/lib.rs:3613; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:145

## S54.03 Skills tab.
- Should: A Skills section sits beside plugins in the customization area.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/settings-nav.ts:303; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/settings/components/WebSettingsModal.tsx:176; apps/web/features/directory/hooks/useDirectoryAdapter.ts:356; apps/mobile/src/features/drawer/components/DrawerContent.tsx:115; apps/mobile/src/features/skills/service.ts:19; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/skills.rs:121

## S54.04 Connectors tab.
- Should: A Connectors section sits in the customization area.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/settings-nav.ts:303; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/settings/components/WebSettingsModal.tsx:226; apps/web/features/directory/services/connectors-directory.ts:367; apps/mobile/app/(app)/connectors/index.tsx:1; apps/mobile/services/connectors.ts:57; apps/cli/src/lib.rs:1336; apps/cli/src/lib.rs:1376

## S54.05 Public marketplace.
- Should: A user can browse a public plugin marketplace and install from it.
- Status: web done, desktop done, mobile missing, cli unverified, vscode missing, chrome missing
- Code: packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/directory/hooks/useDirectoryAdapter.ts:628; apps/web/features/directory/services/plugins-directory.ts:686; apps/web/features/plugins/server/directory/constants.ts:14; apps/web/features/directory/hooks/useDirectoryAdapter.ts:996; apps/web/features/plugins/server/directory/install.ts:155

## S54.06 Private organization marketplace.
- Should: An organization has a private marketplace of plugins for its members.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/settings/organization/plugins/route.ts:62; apps/web/lib/services/organization-plugin-service.ts:222; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:324; apps/web/features/directory/services/plugins-directory.ts:1132; apps/web/db/neon/0326_organization_plugins.sql:33

## S54.07 Repository-backed marketplace.
- Should: A user can add a git repository as a plugin marketplace and install plugins listed in it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/DirectoryPanel.tsx:360; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1142; apps/web/app/api/plugins/marketplaces/route.ts:60; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1286; apps/cli/src/cloud/marketplaces.rs:125; apps/cli/src/cloud/marketplaces.rs:130; apps/cli/src/lib.rs:6587

## S54.08 Search and filters.
- Should: A user can search the plugin catalogue and filter the results.
- Status: web done, desktop done, mobile missing, cli unverified, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/DirectoryToolbar.tsx:84; apps/web/features/directory/services/plugins-directory.ts:602; apps/web/features/directory/hooks/useDirectoryAdapter.ts:628

## S54.09 Role/use-case categories.
- Should: Plugins are grouped into role or use-case categories a user can browse.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/directory/services/plugins-directory.ts:692; apps/web/features/plugins/server/directory/query.ts:60; apps/web/app/api/plugins/route.ts:36

## S54.10 Featured plugins.
- Should: The marketplace highlights featured plugins.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S54.11 Recommended plugins.
- Should: The marketplace recommends plugins for the user.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S54.12 Publisher detail.
- Should: A user can see details about a plugin's publisher.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:779; packages/ui/ui/src/directory/DirectoryPanel.tsx:506; apps/web/features/directory/services/plugins-directory.ts:705; apps/web/features/plugins/server/directory/query.ts:113; apps/cli/src/features/plugins/plugins.rs:369; apps/cli/src/lib.rs:5491

## S54.13 Plugin detail.
- Should: A user can open a plugin's detail page.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:456; packages/ui/ui/src/directory/PluginDetailView.tsx:113; packages/ui/ui/src/directory/PluginDetailView.tsx:556; packages/ui/ui/src/directory/PluginDetailView.tsx:568; apps/web/features/directory/hooks/useDirectoryAdapter.ts:822

## S54.14 Included Skills.
- Should: A plugin shows the skills it includes, and they become usable when installed.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:113; packages/ui/ui/src/directory/PluginDetailView.tsx:271; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1276; apps/web/app/api/plugins/[id]/settings/route.ts:53; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/skills.rs:160; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:132

## S54.15 Included connectors.
- Should: A plugin shows the connectors it includes, and they work when installed.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/plugins/server/directory/inspection.ts:255; apps/web/features/plugins/server/directory/archive.ts:484; apps/web/lib/connectors/plugin-connectors.ts:39; apps/web/app/api/plugins/marketplace-installations/route.ts:112; apps/web/app/api/plugins/uploads/route.ts:92; apps/cli/src/tui/tui_app.rs:3762; apps/cli/src/lib.rs:4920

## S54.16 Included agents.
- Should: A plugin shows the agents it includes, and they are usable when installed.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:160; apps/cli/src/agents.rs:247; apps/cli/src/tui/tui_app.rs:3762; apps/cli/src/agents.rs:197

## S54.17 Included commands.
- Should: A plugin shows the commands it includes, and they are usable when installed.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/plugins/server/directory/inspection.ts:199; apps/web/features/plugins/server/directory/skill-files.ts:26; apps/web/features/plugins/server/directory/install.ts:322; apps/web/features/plugins/server/directory/archive.ts:456; apps/web/features/plugins/server/directory/inspection.ts:442; apps/cli/src/tui/tui_app.rs:3762; apps/cli/src/command_registry.rs:101

## S54.18 Included hooks.
- Should: A plugin shows the hooks it includes, and they run when installed.
- Status: cli done, vscode missing
- Code: apps/cli/src/tui/tui_app.rs:3762; apps/cli/src/features/hooks/hooks.rs:837

## S54.19 Required permissions.
- Should: Before and after installing, a user sees the permissions a plugin requires.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:727; packages/ui/ui/src/directory/DirectoryPanel.tsx:515; apps/web/lib/services/plugin-lifecycle.ts:142

## S54.20 Supported surfaces.
- Should: A plugin shows which surfaces it works on.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:556; apps/web/features/directory/services/plugins-directory.ts:602; packages/ui/ui/src/directory/PluginDetailView.tsx:473

## S54.21 Install.
- Should: A user can install a plugin.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:456; apps/web/features/directory/hooks/useDirectoryAdapter.ts:996; apps/web/app/api/plugins/installations/route.ts:58; apps/web/features/plugins/server/directory/install.ts:155; apps/cli/src/lib.rs:1293; apps/cli/src/lib.rs:3655; apps/cli/src/lib.rs:3984

## S54.22 Configure.
- Should: A user can configure an installed plugin's settings.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:271; packages/ui/ui/src/directory/PluginDetailView.tsx:311; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1276; apps/web/app/api/plugins/[id]/settings/route.ts:53

## S54.23 Authenticate bundled connections.
- Should: A user can authenticate the connections a plugin bundles.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/lib/connectors/plugin-connectors.ts:51; apps/web/features/directory/constants.ts:318; apps/web/lib/connectors/plugin-connectors.ts:82; apps/web/app/api/plugins/marketplace-installations/[id]/route.ts:89; apps/web/db/neon/0332_custom_connector_plugin_source.sql:20; apps/cli/src/lib.rs:5621; apps/cli/src/mcp/mod.rs:607

## S54.24 Enable/disable.
- Should: A user can turn an installed plugin off and on without uninstalling it.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:239; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1265; apps/web/app/api/plugins/installations/[id]/route.ts:38; apps/cli/src/installs.rs:169; apps/cli/src/installs.rs:186; apps/cli/src/lib.rs:4583; apps/cli/src/tui/tui_app.rs:4401; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:145

## S54.25 Update.
- Should: A user can update an installed plugin to a newer version.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/directory/services/plugins-directory.ts:411; packages/ui/ui/src/directory/PluginDetailView.tsx:719; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1398; apps/web/features/directory/services/plugins-directory.ts:1034; apps/cli/src/lib.rs:1428; apps/cli/src/lib.rs:3984

## S54.26 Pin version.
- Should: A user can pin a plugin to a specific version.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:340; apps/web/features/directory/services/plugins-directory.ts:1010; apps/web/app/api/plugins/[id]/versions/route.ts:27; apps/cli/src/installs.rs:89; apps/cli/src/marketplace.rs:612

## S54.27 Customize installed plugin.
- Should: A user can customize an installed plugin (edit its skills or content).
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11

## S54.28 Fork plugin.
- Should: A user can fork a plugin into their own editable copy.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11

## S54.29 Uninstall.
- Should: A user can uninstall a plugin.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:456; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1057; apps/web/app/api/plugins/installations/[id]/route.ts:71; apps/cli/src/lib.rs:1428; apps/cli/src/lib.rs:3984

## S54.30 Organization assignment.
- Should: An admin can assign plugins to an organization, its groups or members.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/db/neon/0327_organization_plugin_group_settings.sql:63; apps/web/lib/services/organization-plugin-service.ts:314; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:209; apps/web/lib/services/organization-plugin-service.ts:392; apps/web/app/api/plugins/organization/[pluginId]/route.ts:56

## S54.31 Installation approval request.
- Should: A member can request admin approval to install a blocked plugin.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S54.32 Security-scan result.
- Should: A user can see a plugin's security-scan result.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:278; apps/web/lib/services/plugin-marketplace-service.ts:1077; apps/web/app/api/plugins/[id]/scan/route.ts:27; packages/ui/ui/src/directory/UploadFileDialog.tsx:128

## S54.33 Compatibility warning.
- Should: The product warns when a plugin is not compatible with this surface or version.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:489; apps/web/features/directory/services/plugins-directory.ts:339; packages/ui/ui/src/directory/PluginDetailView.tsx:473; apps/cli/src/tui/tui_app.rs:3762; apps/cli/src/features/plugins/plugins.rs:558

## S54.34 Missing-dependency repair.
- Should: When a plugin's dependency is missing, the product offers to fix it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/directory/hooks/useDirectoryAdapter.ts:1334; packages/ui/ui/src/directory/PluginDetailView.tsx:668

## S54.35 Plugin-creation assistant.
- Should: The product helps a user build a plugin with an assistant.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11

## S54.36 Submission and review workflow.
- Should: A publisher can submit a plugin for review and track the review.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/plugins/submissions/route.ts:57; apps/web/features/admin/pages/PluginModerationPage.tsx:785; apps/web/lib/services/plugin-submission-service.ts:327

## S54.37 Listing moderation.
- Should: Platform staff can moderate listings (suspend, deprecate).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/admin/pages/PluginModerationPage.tsx:803; apps/web/features/admin/pages/PluginModerationPage.tsx:1007; apps/web/app/api/admin/plugin-submissions/[id]/route.ts:102

## S54.38 Report plugin.
- Should: A user can report a plugin.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S54.39 Publisher analytics.
- Should: A publisher sees analytics for their plugins.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S54.40 Commercial procurement where offered.
- Should: Paid plugins can be bought through commercial procurement where offered.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

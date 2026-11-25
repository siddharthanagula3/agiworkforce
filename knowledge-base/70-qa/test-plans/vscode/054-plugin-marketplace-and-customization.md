---
id: "PLAN-vscode-054"
type: "test-plan"
title: "VS Code · 54. Plugin marketplace and customization"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "54"
---
# VS Code · 54. Plugin marketplace and customization

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S54.01 Unified Customize destination.

- **Expected:** One Customize destination gathers skills, connectors and plugins.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:470; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:793; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1013
- **Where to find it:** not found in the code. No 'Customize' wording exists anywhere in apps/extension-vscode (searched case-insensitively). Skills, Connectors and Plugins are separate rows in the sidebar More menu (apps/extension-vscode/src/features/surfaces/surfaceMenu.ts), and Connectors is not in the Settings nav. The closest single place is Settings > Integrations, which holds Plugins and Skills but not Connectors.
- **Needs:** the AGI CLI connected to this window
- **Steps:**
  1. Click the button titled More in the sidebar header (the ... button).
  2. Look through the menu for one Customize entry that holds Skills, Connectors and Plugins together.
  3. Compare with Expected: the menu lists Connectors, Skills, Plugins and MCP servers as separate rows, and no Customize entry exists.

## S54.02 Plugins tab.

- **Expected:** A Plugins section lists available and installed plugins.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:483
- **Where to find it:** More > Plugins (labels found in the code)
- **Needs:** the AGI CLI connected to this window; an installed plugin to see rows (otherwise it reads 'No plugins are installed yet')
- **Steps:**
  1. Click the button titled More in the sidebar header.
  2. Click Plugins in the menu.
  3. Look at the list: the Browse AGI Cloud Marketplace row comes first, then the installed plugins below it (and an Install a plugin row if installing is offered).
  4. Compare with Expected: the list shows installed plugins, and marketplace plugins are reached through the Browse AGI Cloud Marketplace row, not listed directly.

## S54.03 Skills tab.

- **Expected:** A Skills section sits beside plugins in the customization area.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:283
- **Where to find it:** More > Skills (the Skills row sits directly above Plugins) (labels found in the code)
- **Needs:** the AGI CLI connected to this window
- **Steps:**
  1. Click the button titled More in the sidebar header.
  2. Look at the menu: the Skills row sits directly above the Plugins row.
  3. Click Skills and look at the list of loaded skills, with Create a skill and Install a skill rows at the top.
  4. Compare with Expected: Skills sits beside Plugins in the same menu and opens its own list.

## S54.14 Included Skills.

- **Expected:** A plugin shows the skills it includes, and they become usable when installed.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:456
- **Where to find it:** More > Plugins, then read the Skills: line under an installed plugin; then More > Skills (labels found in the code)
- **Needs:** an installed plugin that includes skills; the AGI CLI connected to this window
- **Steps:**
  1. Click the button titled More in the sidebar header, then click Plugins.
  2. Look at an installed plugin row: if the plugin includes skills, its second line reads 'Skills:' followed by the skill names; a plugin without skills shows its folder path instead.
  3. Click More > Skills and look for those skill names with the scope word plugin in the row description.
  4. Compare with Expected: the plugin shows its included skills, and those skills appear in the Skills list.

## S54.24 Enable/disable.

- **Expected:** A user can turn an installed plugin off and on without uninstalling it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:483
- **Where to find it:** More > Plugins > click the installed plugin row > Turn off (or Turn on) (labels found in the code)
- **Needs:** an installed plugin; the AGI CLI connected to this window
- **Steps:**
  1. Click the button titled More in the sidebar header, then click Plugins.
  2. Click an installed plugin row; a small menu titled with the plugin name opens with a Turn off or Turn on entry.
  3. Click Turn off. The Plugins list reopens; the plugin row icon changes from a filled circle to an empty circle and the plugin is still listed.
  4. Click the same plugin again and choose Turn on. Compare with Expected: the plugin is switched off and on again without being removed from the list.

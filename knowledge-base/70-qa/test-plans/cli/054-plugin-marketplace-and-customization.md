---
id: "PLAN-cli-054"
type: "test-plan"
title: "CLI · 54. Plugin marketplace and customization"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "54"
---
# CLI · 54. Plugin marketplace and customization

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S54.02 Plugins tab.

- **Expected:** A Plugins section lists available and installed plugins.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3762 (quoted code not found in the file now); apps/cli/src/lib.rs:2017; apps/cli/src/lib.rs:6769
- **Where to find it:** Type /plugins in the chat (opens the Plugins overlay). CLI: agi plugin list (labels found in the code)
- **Steps:**
  1. Start the app, sign in, and type /plugins then Enter.
  2. Look for the title Plugins and the tabs Discover, Installed, Marketplaces, Errors. The overlay opens on Installed.
  3. Press Left or Right to move to Discover. It shows text and commands only, not a list of plugin names.
  4. On Installed, check that each installed plugin appears with a status dot under User or Project.
  5. Compare with Expected: installed plugins are listed; the Discover tab does not list available plugins by name.

## S54.03 Skills tab.

- **Expected:** A Skills section sits beside plugins in the customization area.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/skills.rs:144
- **Where to find it:** Type /skills in the chat (text list). Type /skills-toggle to open the Skills overlay (labels found in the code)
- **Steps:**
  1. Type /skills and press Enter. Look for the list headed Skills with a count, or the message No skills found.
  2. Type /skills-toggle and press Enter to open the overlay titled Skills.
  3. Use the arrow keys to move, Space to toggle a skill, and Enter to save.
  4. Compare with Expected: a Skills section sits beside plugins in the customization area.

## S54.04 Connectors tab.

- **Expected:** A Connectors section sits in the customization area.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:2213
- **Where to find it:** Type /connectors in the chat. CLI: agi connectors (labels found in the code)
- **Needs:** a paid account (the code gates connectors to paid plans; a refusal message is shown otherwise)
- **Steps:**
  1. Sign in, type /connectors and press Enter.
  2. Look for the text Your account's connectors, then the list or None connected yet.
  3. Run agi connectors in a terminal and compare the same heading.
  4. Compare with Expected: a Connectors section is shown.

## S54.05 Public marketplace.

- **Expected:** A user can browse a public plugin marketplace and install from it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Owner decision is open on this item.**
- **Where to find it:** CLI: agi marketplace browse (labels found in the code)
- **Needs:** a signed-in account and a marketplace that the account has added; external service
- **Steps:**
  1. Add a marketplace first (see S54.07), or run agi marketplace sources to see what the account has.
  2. Run agi marketplace browse and read the plugin list it prints.
  3. Run agi marketplace get <plugin>@<marketplace> on a listed plugin to install it.
  4. Compare with Expected: the user can browse a public marketplace and install from it.

## S54.07 Repository-backed marketplace.

- **Expected:** A user can add a git repository as a plugin marketplace and install plugins listed in it.
- **Code:** done. Evidence present: apps/cli/src/cloud/marketplaces.rs:131; apps/cli/src/cloud/marketplaces.rs:136; apps/cli/src/lib.rs:7369
- **Where to find it:** CLI: agi marketplace add <github url>, then agi marketplace sources, agi marketplace browse, agi marketplace get <plugin>@<marketplace>. Hint text is on the Marketplaces tab of /plugins (labels found in the code)
- **Needs:** a public GitHub repository with a marketplace manifest, and a signed-in account
- **Steps:**
  1. Run agi marketplace add owner/repo with a public GitHub repository that has a marketplace manifest (use --ref for a branch or tag if needed).
  2. Run agi marketplace sources and check that the new marketplace is listed with its plugin count.
  3. Run agi marketplace browse and check that its plugins are listed.
  4. Run agi marketplace get <plugin>@<marketplace> and check that the plugin installs.

## S54.08 Search and filters.

- **Expected:** A user can search the plugin catalogue and filter the results.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** CLI: agi marketplace search <query>. Narrow by one marketplace with agi marketplace browse <marketplace> (labels found in the code)
- **Needs:** a signed-in account with marketplaces added; external service
- **Steps:**
  1. Run agi marketplace search with a word from a plugin name or description, such as a word you saw in agi marketplace browse.
  2. Check that matching plugins are listed.
  3. Run agi marketplace browse <marketplace id or name> to show only that marketplace's plugins.
  4. Compare with Expected: the user can search and filter the catalogue.

## S54.12 Publisher detail.

- **Expected:** A user can see details about a plugin's publisher.
- **Code:** done. Evidence present: apps/cli/src/features/plugins/plugins.rs:380; apps/cli/src/lib.rs:6783
- **Where to find it:** CLI: agi plugin list, then agi plugin info <name> (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Run agi plugin list and copy an installed plugin's name.
  2. Run agi plugin info <name>.
  3. Look for the Publisher row and the Signature row.
  4. Compare with Expected: the publisher's details are shown (the row reads not stated when the manifest gives none).

## S54.14 Included Skills.

- **Expected:** A plugin shows the skills it includes, and they become usable when installed.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/skills.rs:249
- **Where to find it:** CLI: agi plugin info <name> (row Skills). Then type /skills in the chat (labels found in the code)
- **Needs:** a plugin that includes skills; a plugin folder or git URL to install
- **Steps:**
  1. Install a plugin that includes skills (see S54.21), then run agi plugin info <name>.
  2. Look for the Skills row and its count.
  3. Type /skills in the chat and look for the skill names from the plugin.
  4. Compare with Expected: the plugin shows its skills and they are usable once installed.

## S54.15 Included connectors.

- **Expected:** A plugin shows the connectors it includes, and they work when installed.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3762 (quoted code not found in the file now); apps/cli/src/lib.rs:4920 (quoted code not found in the file now)
- **Where to find it:** CLI: agi plugin info <name> (rows MCP and Connects) (labels found in the code)
- **Needs:** a plugin that bundles a remote or local connection; an outside account for remote sign-in
- **Steps:**
  1. Install a plugin that bundles connections, then run agi plugin info <name>.
  2. Look for the MCP row (name and target) and the Connects row.
  3. For a remote connection, run agi plugin login <name> (see S54.23) and check it signs in.
  4. Compare with Expected: the plugin shows its connectors and they work once installed.

## S54.16 Included agents.

- **Expected:** A plugin shows the agents it includes, and they are usable when installed.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3762 (quoted code not found in the file now); apps/cli/src/agents.rs:296
- **Where to find it:** CLI: agi plugin info <name> (row Agents). Then type /agents in the chat (labels found in the code)
- **Needs:** a plugin that includes agents
- **Steps:**
  1. Install a plugin that includes agents, then run agi plugin info <name>.
  2. Look for the Agents row and its count.
  3. Type /agents and press Enter to open the agent picker.
  4. Compare with Expected: the plugin's agents appear and can be used.

## S54.17 Included commands.

- **Expected:** A plugin shows the commands it includes, and they are usable when installed.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3762 (quoted code not found in the file now); apps/cli/src/command_registry.rs:113
- **Where to find it:** CLI: agi plugin info <name> (row Commands). Then use a command from the plugin in the chat (labels found in the code)
- **Needs:** a plugin that includes commands
- **Steps:**
  1. Install a plugin that includes commands, then run agi plugin info <name>.
  2. Look for the Commands row and its count.
  3. Type a slash command from the plugin in the chat and press Enter.
  4. Compare with Expected: the plugin's commands run.

## S54.18 Included hooks.

- **Expected:** A plugin shows the hooks it includes, and they run when installed.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3762 (quoted code not found in the file now); apps/cli/src/features/hooks/hooks.rs:1045
- **Where to find it:** CLI: agi plugin info <name> (row Hooks). Then type /hooks in the chat (labels found in the code)
- **Needs:** a plugin that declares hooks, installed from a path or git URL (not inside a project folder)
- **Steps:**
  1. Install a plugin that declares hooks, then run agi plugin info <name>.
  2. Look for the Hooks row, which reads runs commands on followed by the event names.
  3. Type /hooks and press Enter to see hook settings.
  4. Compare with Expected: the plugin's hooks are shown and run when installed.

## S54.21 Install.

- **Expected:** A user can install a plugin.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2017; apps/cli/src/lib.rs:3655 (quoted code not found in the file now); apps/cli/src/lib.rs:7642
- **Where to find it:** CLI: agi plugin install <path or git url>. Marketplace plugins: agi marketplace get <plugin>@<marketplace> (labels found in the code)
- **Needs:** a plugin folder or a git URL
- **Steps:**
  1. Run agi plugin install with a local plugin folder or a git URL.
  2. Read the line that starts Installed to and the rows printed under it.
  3. Run agi plugin list and check the plugin shows as enabled.
  4. Compare with Expected: the user can install a plugin.

## S54.23 Authenticate bundled connections.

- **Expected:** A user can authenticate the connections a plugin bundles.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:6362; apps/cli/src/mcp/mod.rs:1183
- **Where to find it:** CLI: agi plugin login <name> (labels found in the code)
- **Needs:** an installed, enabled plugin with a remote connection; an outside account to sign in to
- **Steps:**
  1. Install a plugin that bundles a remote connection, and make sure it is enabled (see S54.24).
  2. Run agi plugin login <name>.
  3. Follow the sign-in step it shows for each remote connection.
  4. Run agi plugin info <name> and check the MCP row, then compare with Expected.

## S54.24 Enable/disable.

- **Expected:** A user can turn an installed plugin off and on without uninstalling it.
- **Code:** done. Evidence moved: apps/cli/src/installs.rs:464; apps/cli/src/installs.rs:570; apps/cli/src/lib.rs:7029; apps/cli/src/tui/tui_app.rs:4401 (quoted code not found in the file now)
- **Where to find it:** CLI: agi plugin disable <name> and agi plugin enable <name>. Chat: /plugins disable <name> and /plugins enable <name> (labels found in the code)
- **Needs:** an installed plugin
- **Steps:**
  1. Run agi plugin list and note the plugin shows as enabled.
  2. Run agi plugin disable <name> and read the message it prints.
  3. Run agi plugin list and check the plugin shows as disabled, and that it is still listed.
  4. Run agi plugin enable <name> and check it shows as enabled again.

## S54.25 Update.

- **Expected:** A user can update an installed plugin to a newer version.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2340; apps/cli/src/lib.rs:7654
- **Where to find it:** CLI: agi plugin update <name> (plugins installed from git). All marketplace plugins: agi marketplace update (labels found in the code)
- **Needs:** a plugin installed from a git URL and a newer commit in that repository
- **Steps:**
  1. Install a plugin from a git URL, then push a newer commit to that repository.
  2. Run agi plugin update <name> and read the line it prints.
  3. Run agi plugin info <name> and check the Version row.
  4. Compare with Expected: the plugin moves to the newer version.

## S54.26 Pin version.

- **Expected:** A user can pin a plugin to a specific version.
- **Code:** done. Evidence present: apps/cli/src/installs.rs:90; apps/cli/src/marketplace.rs:672
- **Where to find it:** CLI: agi plugin install <git url> --ref <TAG_OR_BRANCH>, then agi plugin update <name> (path not confirmed in the code; trust the screen)
- **Needs:** a git plugin repository with a tag and a newer commit
- **Steps:**
  1. Install a git plugin with --ref set to a tag, for example agi plugin install <git url> --ref v1.0.0.
  2. Run agi plugin update <name> and read the message.
  3. Check that the message says the plugin is pinned to that tag.
  4. Compare with Expected: the plugin stays on the pinned version.

## S54.29 Uninstall.

- **Expected:** A user can uninstall a plugin.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2340; apps/cli/src/lib.rs:7646
- **Where to find it:** CLI: agi plugin remove <name>. Marketplace plugins: agi marketplace uninstall <name>. Chat: /plugins remove <name> (labels found in the code)
- **Needs:** an installed plugin you can afford to remove
- **Steps:**
  1. Run agi plugin list and note the plugin name.
  2. Run agi plugin remove <name> and read the line it prints.
  3. Run agi plugin list and check the plugin is gone.
  4. Compare with Expected: the user can uninstall the plugin.

## S54.33 Compatibility warning.

- **Expected:** The product warns when a plugin is not compatible with this surface or version.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3762 (quoted code not found in the file now); apps/cli/src/features/plugins/plugins.rs:827
- **Where to find it:** Chat: /plugins, then the Errors tab (or type /plugins Errors) (labels found in the code)
- **Needs:** a plugin with a version range this CLI does not meet
- **Steps:**
  1. Install a plugin whose manifest sets an engines.agiworkforce version range that this CLI version does not meet.
  2. Type /plugins and press Right until the Errors tab, or type /plugins Errors.
  3. Look for a line that reads plugin requires agiworkforce and the range, with this CLI's version.
  4. Compare with Expected: the product warns that the plugin is not compatible.

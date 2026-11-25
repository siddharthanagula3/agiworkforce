---
id: "PLAN-cli-087"
type: "test-plan"
title: "CLI · 87. Enterprise administration screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "87"
---
# CLI · 87. Enterprise administration screens

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S87.14 Feature-access policy.

- **Expected:** An administrator switches product features on or off for the workspace (with exceptions) and each switched-off feature is refused wherever it runs.
- **Code:** done. Evidence present: apps/cli/src/features/hooks/hooks.rs:1408; apps/cli/src/cloud/workspace_policy.rs:14; apps/cli/src/cloud/workspace_policy.rs:752; apps/cli/src/agent/chat.rs:1160
- **Where to find it:** Chat, after /login on a Managed session: type /hooks and press Enter (agi hooks list shows the same) (labels found in the code)
- **Needs:** A Managed Cloud account that is a member of a workspace where the administrator has turned hooks off
- **Steps:**
  1. Sign in with /login on a Managed session as a member of a workspace whose administrator has turned hooks off (that switch is set outside this app; no CLI control for it was found).
  2. Add one hook so the list is not empty: run agi hooks add SessionStart "echo hook-ran" in a terminal.
  3. In the chat, type /hooks and press Enter.
  4. Look for the line "Your workspace administrator has turned hooks off, so none of these run." under the hook list, and check that "hook-ran" does not print when a new session starts, as Expected says.

## S87.15 Tool policy.

- **Expected:** An administrator decides which individual tools members and agents may use (allow, block or require approval) and the tool loop enforces it.
- **Code:** done. Evidence present: apps/cli/src/cloud/workspace_policy.rs:353; apps/cli/src/mcp/mod.rs:1211
- **Where to find it:** Trusted project folder: create .agiworkforce/policy.toml with a [[rules]] entry, then run agi in that folder and ask it to read a file (labels found in the code)
- **Needs:** A trusted project folder you can write to (an administrator would normally set this rule through managed policy)
- **Steps:**
  1. Trust a project folder in agi, then create .agiworkforce/policy.toml in it with this block: [[rules]] then tool = "read_file" then decision = "ask" (the file is read only when the folder is trusted).
  2. Start agi in that folder and ask it to read a file that is in the folder.
  3. When the tool call starts, look for the prompt "Workspace policy requires approval for `read_file`. Allow it?"
  4. Answer no and check that the file is not read and the tool reports it was not approved under the workspace policy, as Expected says.

## S87.16 Connector policy.

- **Expected:** An administrator allows or blocks connectors (and custom connectors) for the workspace, and blocked connectors are not offered or connectable.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:525 (quoted code not found in the file now)
- **Where to find it:** Chat, after /login on a Managed session: type /connectors and press Enter (then /install-github-app for a blocked GitHub connector) (labels found in the code)
- **Needs:** A Managed Cloud account in a workspace whose administrator has blocked a connector (or allows custom connectors only from an approved list)
- **Steps:**
  1. Sign in with /login on a Managed session as a member of a workspace whose administrator has allowed or blocked some connectors (set outside this app).
  2. In the chat, type /connectors and press Enter.
  3. Look for the "Workspace connectors" block with the approved:, blocked:, custom endpoints: and approved plugins: lines, and compare them with what the administrator set.
  4. If GitHub is blocked, type /install-github-app and press Enter, and look for "Your workspace administrator has blocked the" with the connector name.

## S87.17 Skill and Plugin policy.

- **Expected:** An administrator controls which skills and plugins members may install or use, per item, and the product enforces it.
- **Code:** done. Evidence present: apps/cli/src/features/hooks/managed.rs:29; apps/cli/src/features/plugins/plugins.rs:287
- **Where to find it:** not found in the code. Searched apps/cli for skill and plugin admin controls. /connectors shows approved plugins and blocked plugins lines, and a blocked-plugin refusal function exists (evaluate_plugin_access in apps/cli/src/claude_parity.rs), but no production code calls it. Found no per-skill admin switch. The signed-plugin rule in the managed plugin policy is wired, but no path was found where a person would see it refuse a skill or plugin install.
- **Needs:** a Managed Cloud account in a workspace with plugin or skill limits set by the administrator

## S87.27 Device-management integration.

- **Expected:** An organisation can deploy and configure the product through its device-management system (MDM or managed policy), and the app honours that managed configuration.
- **Code:** done. Evidence present: apps/cli/src/features/hooks/managed.rs:156; apps/cli/src/platform/policy/managed.rs:105; apps/cli/src/onboarding.rs:193; apps/cli/src/features/exec/tools/mod.rs:601
- **Where to find it:** no screen of its own. The managed settings file is installed by an administrator or MDM, not from the app, so the tester needs admin access on the Mac. The trust-choice limit was not checked in detail, and the managed policy also reads a cached file and an environment variable (AGIWORKFORCE_MANAGED_POLICY) per apps/cli/src/platform/policy/managed.rs.
- **Needs:** A Mac with admin rights to place a managed settings file, and an untrusted folder
- **Steps:**
  1. On a Mac with admin rights, place a managed-settings.json file in /Library/Application Support/AGIWorkforce/ that sets a managed policy that does not allow trusting workspaces (the file name and folder are read in apps/cli/src/features/hooks/managed.rs).
  2. Open a terminal, go to a folder that has not been trusted, and start agi.
  3. Look for the line "Your organization's managed policy does not allow trusting workspaces." above the question "Do you trust the contents of this directory?", and check that the trust choices are limited, as Expected says.

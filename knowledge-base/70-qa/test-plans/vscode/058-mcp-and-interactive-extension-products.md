---
id: "PLAN-vscode-058"
type: "test-plan"
title: "VS Code · 58. MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "58"
---
# VS Code · 58. MCP and interactive extension products

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S58.01 MCP server list.

- **Expected:** The user can see a list of the MCP servers configured for their account or workspace.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:167; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2182
- **Where to find it:** Chat panel > More (the "..." button in the panel header) > MCP servers. Or Command Palette > Code: Show MCP Servers (labels found in the code)
- **Needs:** Signed in, with the AGI CLI available. At least one MCP server configured helps; none shows the empty message.
- **Steps:**
  1. Sign in, then open the AGI chat panel in the editor.
  2. Click the "..." button in the panel header (tooltip "More").
  3. Click "MCP servers" in the menu.
  4. Look at the list titled "Code, MCP servers". Each configured server is a row with its name, status, transport and scope. With none configured it shows "No MCP servers are configured yet" and "Add an MCP server". Compare with Expected.

## S58.07 Connection test.

- **Expected:** The user can test the connection to an MCP server and see whether it succeeded.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:827; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:721
- **Where to find it:** Chat panel > More > MCP servers > click a server row > Test connection (labels found in the code)
- **Needs:** A configured MCP server. A user-added server is needed for the row to offer actions when its status is not blocked or off.
- **Steps:**
  1. Open the chat panel and click the "..." button in its header.
  2. Click "MCP servers", then click a server row (not a Remove action).
  3. In the "Choose an action" list, click "Test connection".
  4. Watch for a notification such as "connected in N ms and offers N tools" (success), or a failure message saying the server "did not connect" with a reason. Compare with Expected.

## S58.08 Tool discovery.

- **Expected:** Connecting an MCP server discovers its tools and the user can see them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:818; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:670
- **Where to find it:** Chat panel > More > MCP servers > click a server row > Show tools (labels found in the code)
- **Needs:** A configured MCP server that connects, so its tools can be listed.
- **Steps:**
  1. Open the chat panel, click the "..." button in its header, then click "MCP servers".
  2. Click a server row. In the "Choose an action" list, click "Show tools".
  3. Look at the list titled with the server name. Under the "Tools" heading, each tool is shown with its name and description.
  4. If the server has no tools, the list says "This server offers no tools". Compare with Expected.

## S58.11 Server capability inspector.

- **Expected:** The user can inspect a server's capabilities (protocol, tools, resources, prompts, extensions).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:809; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:750; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:42; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:47; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1713
- **Where to find it:** Chat panel > More > MCP servers > click a server row > Server details (some labels not found in the code; trust the screen)
- **Needs:** A configured MCP server that is not blocked or off, so the details action appears.
- **Steps:**
  1. Open the chat panel, click the "..." button in its header, then click "MCP servers".
  2. Click a server row, then click "Server details" (or use the info button on the row).
  3. A text document named "<server name> MCP server" opens. Read its "Protocol", "Server" and "Capabilities" lines.
  4. Compare the fields shown with Expected (protocol, tools, resources, prompts, extensions).

## S58.12 Server health and logs.

- **Expected:** Each server shows its health and the user can read recent logs or call history.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:37; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:40; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:62; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:809
- **Where to find it:** Chat panel > More > MCP servers > click a server row > Server details (some labels not found in the code; trust the screen)
- **Needs:** A configured MCP server that is not blocked or off.
- **Steps:**
  1. Open the chat panel, click the "..." button in its header, then click "MCP servers".
  2. Click a server row, then click "Server details".
  3. Read the "Health" line in the document: "Responding", "Connected, but it did not answer a ping" or "Did not connect".
  4. Scroll to the "Recent output" section. It shows server logs, or "No output from this server yet." Compare with Expected.

## S58.14 Per-Project server configuration.

- **Expected:** MCP servers can be configured per project so they load only in that project.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:167; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2182; apps/extension-vscode/src/integrations/localRuntimeClient.ts:794
- **Where to find it:** Code: Show MCP Servers (Chat panel > More > MCP servers), then read the row description ending in "project"; Settings > MCP servers shows "From this workspace" (labels found in the code)
- **Needs:** A workspace with a project-scoped MCP server already configured outside the extension, since the extension cannot create one.
- **Steps:**
  1. Open the MCP servers list from the chat panel's "..." menu, or run Code: Show MCP Servers.
  2. Look for a server whose row description ends with "project" or whose Settings row says "From this workspace".
  3. Compare with Expected: that server should load only in this project.

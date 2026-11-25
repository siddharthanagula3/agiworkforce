---
id: "PLAN-cli-058"
type: "test-plan"
title: "CLI · 58. MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "58"
---
# CLI · 58. MCP and interactive extension products

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S58.01 MCP server list.

- **Expected:** The user can see a list of the MCP servers configured for their account or workspace.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2158; apps/cli/src/lib.rs:5149
- **Where to find it:** Type "agi mcp list" in a terminal, or type "/mcp" in the agi chat screen (labels found in the code)
- **Steps:**
  1. Run: agi mcp list
  2. Look for one row per registered server, each with its name, a status word (enabled, disabled or blocked), its transport and its target.
  3. If no servers exist, look for the line that names the registry file.
  4. Compare with Expected: a list of configured MCP servers.

## S58.02 Add local server.

- **Expected:** The user can register a local (stdio) MCP server that the product starts on their machine.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2127; apps/cli/src/lib.rs:5101
- **Where to find it:** Type "agi mcp add <name> --command <executable>" in a terminal (in chat, "/mcp add <name> stdio <command>") (labels found in the code)
- **Needs:** a local executable for a stdio server
- **Steps:**
  1. Run: agi mcp add my-local-server --command node --arg server.js (use any executable on this Mac)
  2. Read the confirmation line that starts with "Registered MCP server".
  3. Run: agi mcp list and check the new row appears with status enabled.
  4. Run: agi mcp get my-local-server and check the transport shows stdio and the target shows the command.

## S58.03 Add remote server.

- **Expected:** The user can add a remote MCP server by URL (with optional credentials) and it becomes available to the assistant.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2127; apps/cli/src/lib.rs:5101
- **Where to find it:** Type "agi mcp add <name> --url <url>" in a terminal (in chat, "/mcp add <name> <url>") (labels found in the code)
- **Needs:** a remote MCP server URL; a token if the server needs one
- **Steps:**
  1. Run: agi mcp add my-remote --url https://example.com/mcp (use a real remote MCP URL)
  2. Read the line that starts with "Registered MCP server".
  3. Optional credentials: add --header "Authorization: Bearer <token>" to the same command, then check with agi mcp get my-remote.
  4. Run: agi mcp list and check the row shows the URL with status enabled.

## S58.04 Server configuration editor.

- **Expected:** The user can view and edit an existing MCP server's configuration (URL, transport, arguments).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2154; apps/cli/src/lib.rs:5192
- **Where to find it:** Type "agi mcp get <name>" in a terminal to view, then "agi mcp add <name> --url <url> --force" to edit (labels found in the code)
- **Needs:** an existing registered server
- **Steps:**
  1. Run: agi mcp get my-remote and read the name, status, transport, target and file lines.
  2. Run: agi mcp add my-remote --url https://new.example.com/mcp --force to replace the entry.
  3. Run: agi mcp get my-remote again and check the target now shows the new URL.
  4. Compare with Expected: the URL, transport and arguments can be viewed and changed.

## S58.05 Environment-variable configuration.

- **Expected:** The user can set environment variables for an MCP server from the product.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2150; apps/cli/src/lib.rs:3215 (quoted code not found in the file now)
- **Where to find it:** Type "agi mcp add <name> --command <executable> --env KEY=VALUE" in a terminal (labels found in the code)
- **Steps:**
  1. Run: agi mcp add my-local-server --command node --arg server.js --env API_REGION=us-east-1
  2. Read the line that starts with "Registered MCP server".
  3. Run: agi mcp get my-local-server and check the file line points to the registry where the entry is stored.
  4. Compare with Expected: the variable is set for the stdio server.

## S58.06 Credential configuration.

- **Expected:** The user can supply credentials (token or OAuth sign-in) for an MCP server and they are stored securely.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2203; apps/cli/src/lib.rs:5359
- **Where to find it:** Type "agi mcp login <name>" in a terminal (for OAuth), or pass --header when adding a remote server (labels found in the code)
- **Needs:** an outside account (the remote server's sign-in) and a remote server that offers OAuth
- **Steps:**
  1. Run: agi mcp login my-remote (for a remote server that offers OAuth)
  2. Complete the sign-in in the browser that opens.
  3. Read the line that starts with "Authorized MCP server" and check it says the token is stored in the OS credential store.
  4. Optional: run agi mcp logout my-remote and read the sign-out result line.

## S58.07 Connection test.

- **Expected:** The user can test the connection to an MCP server and see whether it succeeded.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1671; apps/cli/src/tui/tui_app.rs:7718
- **Where to find it:** Type "agi mcp get <name>" in a terminal, or "/mcp restart" in the agi chat screen (labels found in the code)
- **Needs:** a registered server (a remote one needs a reachable URL)
- **Steps:**
  1. Make sure the server is enabled (agi mcp list shows enabled).
  2. Run: agi mcp get my-remote and wait up to 20 seconds.
  3. Read the connection line: it shows a connect error or "did not answer within 20 seconds" on failure, and the tool list on success.
  4. Compare with Expected: the result shows whether the connection succeeded.

## S58.08 Tool discovery.

- **Expected:** Connecting an MCP server discovers its tools and the user can see them.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1603; apps/cli/src/tui/tui_app.rs:6055
- **Where to find it:** Type "/mcp tools" in the agi chat screen, or "agi mcp get <name>" in a terminal (labels found in the code)
- **Needs:** a connected MCP server that offers tools
- **Steps:**
  1. Connect a server first (agi mcp get <name> or /mcp restart).
  2. In chat, type: /mcp tools
  3. Read the heading "MCP tools:" and check each tool row lists its server name and description.
  4. Optional: type /mcp tools <server-name> and check only that server's tools appear.

## S58.10 Prompt discovery where supported.

- **Expected:** Where a server offers prompts, the product lists them and lets the user run one.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:743; apps/cli/src/tui/tui_app.rs:6720
- **Where to find it:** Type "/" in the agi chat screen and find the entries that start with "[MCP:", or type "/mcp:<server>:<prompt>" (labels found in the code)
- **Needs:** a connected MCP server that offers prompts
- **Steps:**
  1. Connect a server that offers prompts (/mcp restart).
  2. Type / in the chat input and look for commands whose description starts with [MCP:<server-name>].
  3. Choose one and run it, then read the reply in chat.
  4. Compare with Expected: the prompt is listed and runs.

## S58.11 Server capability inspector.

- **Expected:** The user can inspect a server's capabilities (protocol, tools, resources, prompts, extensions).
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1687; apps/cli/src/repl/registry.rs:1714; apps/cli/src/app_server/surfaces.rs:838; apps/cli/src/mcp/mod.rs:1551
- **Where to find it:** Type "/mcp info <server>" in the agi chat screen, or "agi mcp get <name>" in a terminal (labels found in the code)
- **Needs:** a connected MCP server
- **Steps:**
  1. Connect the server first (/mcp restart).
  2. In chat, type: /mcp info <server-name>
  3. Read the Protocol line, the server name and version, and the Capabilities line.
  4. Compare with Expected: protocol, tools, resources, prompts and extensions are visible.

## S58.12 Server health and logs.

- **Expected:** Each server shows its health and the user can read recent logs or call history.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1687; apps/cli/src/mcp/mod.rs:1555; apps/cli/src/app_server/surfaces.rs:838
- **Where to find it:** Type "/mcp info <server>" for health, or "/mcp logs <server>" for recent logs, in the agi chat screen (labels found in the code)
- **Needs:** a connected MCP server
- **Steps:**
  1. Connect the server first (/mcp restart).
  2. In chat, type: /mcp info <server-name> and read whether it says responding or not responding.
  3. Type: /mcp logs <server-name> and read the Recent output section.
  4. Compare with Expected: health and recent logs are visible; no call history was found in the code.

## S58.13 Enable/disable server.

- **Expected:** The user can disable a configured server without removing it, and re-enable it.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1654; apps/cli/src/tui/tui_app.rs:7718
- **Where to find it:** Type "agi mcp disable <name>" and "agi mcp enable <name>" in a terminal, or "/mcp disable <name>" and "/mcp enable <name>" in chat (labels found in the code)
- **Steps:**
  1. Run: agi mcp disable my-remote and read the Disabled MCP server line.
  2. Run: agi mcp list and check the status is disabled and the row is still there.
  3. Run: agi mcp enable my-remote and check the status returns to enabled.
  4. Compare with Expected: the server is kept while off and can be turned back on.

## S58.14 Per-Project server configuration.

- **Expected:** MCP servers can be configured per project so they load only in that project.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3619 (quoted code not found in the file now); apps/cli/src/mcp/mod.rs:2012; apps/cli/src/mcp/mod.rs:1090
- **Where to find it:** Put a .mcp.json file in the project folder, then type "/mcp" in agi started from that folder (labels found in the code)
- **Needs:** a project folder you can write to; a terminal for the first approval
- **Steps:**
  1. In a project folder, create a .mcp.json file with one server entry (or run agi init, which creates mcp.json).
  2. Start agi from that folder in a terminal and approve the project servers when asked (the code says Run /trust grant in agi).
  3. Type /mcp in the chat screen and check the server appears under the project scope.
  4. Start agi from a different folder and check the server does not appear.

## S58.16 Private-network connector route.

- **Expected:** Where offered, an MCP server on a private network can be reached through a supported route.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/mcp/registry.rs:358
- **Where to find it:** not found in the code. Searched apps/cli/src/mcp for private network, relay, tunnel and bridge wording; only a URL check (apps/cli/src/mcp/registry.rs validate_remote_url) and unrelated sandbox text were found, and no private-network connector route was found.
- **Needs:** a server on a private network

## S58.27 Developer-mode connection flow.

- **Expected:** A developer can connect an in-development server (e.g. localhost) through a developer-mode flow.
- **Code:** done. Evidence present: apps/cli/src/mcp/registry.rs:446; apps/cli/src/lib.rs:2127
- **Where to find it:** not found in the code. No developer-mode flow found; searched for developer mode, dev mode and localhost. The nearest path is agi mcp add <name> --url http://localhost:<port>, which validate_remote_url in apps/cli/src/mcp/registry.rs accepts, but that is not a dedicated developer-mode flow.
- **Needs:** an in-development server on localhost

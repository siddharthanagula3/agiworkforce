---
id: "PLAN-cli-055"
type: "test-plan"
title: "CLI · 55. Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "55"
---
# CLI · 55. Connector setup and account management

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S55.04 Connector detail page.

- **Expected:** Selecting a connector opens a detail page with its description, publisher, sign-in requirement, tools and links.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5239
- **Where to find it:** agi mcp list, then agi mcp get <name> (labels found in the code)
- **Needs:** a registered MCP server (agi mcp add first)
- **Steps:**
  1. Type agi mcp list to see the registered server names.
  2. Type agi mcp get <name> with one of those names.
  3. Look at the lines name, status, transport, target and file, and compare them with Expected. The description, publisher, sign-in requirement, tools and links are not shown here.

## S55.05 Supported-operation list.

- **Expected:** The connector page lists the operations/tools the connector exposes (before or after connecting).
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1603; apps/cli/src/tui/tui_app.rs:6055
- **Where to find it:** agi mcp get <name>, or /mcp tools [server] inside an agi session (labels found in the code)
- **Needs:** a registered MCP server; /mcp tools lists only servers connected in this session
- **Steps:**
  1. Type agi mcp get <name> in a terminal.
  2. Look for the Tools (N): list with each tool name and description.
  3. Start agi, type /mcp tools and look for the MCP tools: list.

## S55.07 Connect action.

- **Expected:** A Connect action on a connector starts its real authorization or credential flow.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:5096; apps/cli/src/lib.rs:5361
- **Where to find it:** agi mcp login <name> (remote server); for account connectors, agi connectors shows the browser address to connect (labels found in the code)
- **Needs:** a remote server address, a browser, and an outside account for that service
- **Steps:**
  1. Type agi mcp add <name> --url <https address> to register a remote server.
  2. Type agi mcp login <name> in an interactive terminal and complete the step in the browser.
  3. Look for The token is stored in the OS credential store. For account connectors, run agi connectors and look for Connect one in your browser.

## S55.08 OAuth authorization.

- **Expected:** Connecting an OAuth provider opens the provider consent page and stores the returned grant.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:5359; apps/cli/src/mcp/mod.rs:1196
- **Where to find it:** agi mcp login <name> (labels found in the code)
- **Needs:** an account at an OAuth provider and a browser
- **Steps:**
  1. Register an OAuth remote server with agi mcp add <name> --url <https URL>.
  2. Type agi mcp login <name>; the provider consent page should open in the browser.
  3. Approve access in the browser, then look in the terminal for The token is stored in the OS credential store.
  4. Type agi mcp get <name> and check that it lists tools.

## S55.09 API-key authorization.

- **Expected:** A connector that needs an API key offers a form to enter it, stores it encrypted, and connects.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2153; apps/cli/src/lib.rs:3226 (quoted code not found in the file now)
- **Where to find it:** agi mcp add <name> --url <URL> --header "Name: value" (labels found in the code)
- **Needs:** the API key for the service
- **Steps:**
  1. Type agi mcp add <name> --url <https URL> --header "<Header name>: <your API key>".
  2. Press Enter and read the success line the command prints.
  3. Type agi mcp get <name> and check that it connects and lists tools.

## S55.18 Connection health.

- **Expected:** Each connector shows whether it is healthy, needs reauthorization or is not responding.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6079
- **Where to find it:** /mcp inside an agi session; /mcp info <server>; agi connectors for account connectors (labels found in the code)
- **Needs:** at least one registered MCP server or a connected account connector
- **Steps:**
  1. Start agi and type /mcp.
  2. Read the status after each server name: connected, disabled, needs authentication, failed, blocked by your workspace or starting.
  3. Type /mcp info <server> and look for responding or not responding.
  4. Type agi connectors and look for needs reconnecting or connected since <date>, <health>.

## S55.20 Reconnect/reauthorize.

- **Expected:** An expired or revoked connection offers a Reconnect action that re-runs authorization.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:5359
- **Where to find it:** agi connectors (account connectors); agi mcp login <name> (remote MCP servers) (labels found in the code)
- **Needs:** an account connector whose connection expired or was revoked, or a remote MCP server that needs sign-in
- **Steps:**
  1. Type agi connectors.
  2. Find a connector that shows needs reconnecting: open <url>.
  3. Open that URL in the browser and reconnect, then run agi connectors again.
  4. Look for connected since on that connector. For an MCP server showing needs authentication, run agi mcp login <name>.

## S55.21 Test connection.

- **Expected:** The user can run an on-demand check that a connection works and see the result.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1671; apps/cli/src/tui/tui_app.rs:7718
- **Where to find it:** agi mcp get <name>; /mcp restart inside an agi session (labels found in the code)
- **Needs:** a registered MCP server
- **Steps:**
  1. Type agi mcp get <name> in a terminal.
  2. Look at the connection line: could not connect with a reason, or did not answer within 20 seconds, or the server name and Tools list when it works.
  3. Start agi, type /mcp restart and look for MCP reconnected: N tool(s) available. or MCP restart failed.

## S55.22 Disconnect.

- **Expected:** The user can disconnect a connector and it stops being available to the assistant.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:5387
- **Where to find it:** agi connectors disconnect <connector> (account connectors); agi mcp remove <name> (MCP servers) (labels found in the code)
- **Needs:** a connector connected to your account
- **Steps:**
  1. Type agi connectors and note the connector id.
  2. Type agi connectors disconnect <id>, read the prompt and its consequence, then answer it.
  3. Look for Disconnected <id> from your account.
  4. Type agi connectors again and ask the assistant to use that connector; check that it is no longer offered.

## S55.23 Revoke permission.

- **Expected:** Revoking removes the stored grant and asks the provider to revoke the token.
- **Code:** done. Evidence present: crates/agiworkforce-mcp/src/oauth/flow.rs:756; apps/cli/src/mcp/mod.rs:400; apps/cli/src/lib.rs:4745
- **Where to find it:** agi mcp logout <name> (labels found in the code)
- **Needs:** a remote MCP server signed in over OAuth, and the provider account
- **Steps:**
  1. Use a remote server already signed in with agi mcp login <name>.
  2. Type agi mcp logout <name>.
  3. Look for Revoked the OAuth grant for '<name>' at its provider and removed the stored token.
  4. If the provider did not confirm, read the line that tells you to remove the app's access in the provider's own settings, and check that page.

## S55.27 Write-action settings.

- **Expected:** The user controls whether a connector's write actions run automatically, need approval, or are blocked.
- **Code:** done. Evidence present: apps/cli/src/agent/tools.rs:77; apps/cli/src/platform/policy/engine.rs:350; apps/cli/src/platform/policy/engine.rs:327
- **Where to find it:** agi mcp ask|allow|block <server> [tool] to set it; agi mcp get <server> to view it; /connectors shows workspace tool rules (labels found in the code)
- **Needs:** a registered MCP server; a Managed session to see workspace rules
- **Steps:**
  1. Type agi mcp block <server> <tool>; look for the message that says the tool is now blocked.
  2. Type agi mcp get <server> and look for the rule line showing blocked, asks first or runs without asking.
  3. Type agi mcp unset <server> <tool> to remove the setting.
  4. In a Managed session type /connectors and look for the Workspace connectors section; write tools rules there are set by the workspace, not here.

## S55.29 Source-provider attribution.

- **Expected:** Answers or steps that used a connector name the provider that supplied the data.
- **Code:** done. Evidence present: apps/cli/src/agent/tools.rs:150; apps/cli/src/agent/tools.rs:146; apps/cli/src/mcp/mod.rs:344
- **Where to find it:** not found in the code. Searched apps/cli/src for attribution and provider text near answers and tool output. Only the approval prompt Allow MCP tool '<tool>' from server '<server>'? (agent/tools.rs:150) names a server; no provider label on answers was found.
- **Needs:** a connector that supplied data in an answer

## S55.30 Missing-scope request.

- **Expected:** When a task needs a scope the grant lacks, the product asks the user to grant that permission.
- **Code:** done. Evidence present: crates/agiworkforce-mcp/src/transport/http.rs:271; crates/agiworkforce-mcp/src/error.rs:38; apps/cli/src/mcp/mod.rs:1304; apps/cli/src/mcp/mod.rs:2596; apps/cli/src/mcp/oauth_store.rs:226; apps/cli/src/mcp/mod.rs:1230; apps/cli/src/mcp/mod.rs:1255
- **Where to find it:** agi mcp login <name>, after a tool error in an agi session (labels found in the code)
- **Needs:** a remote MCP server whose tool needs a scope your grant lacks; hard to set up
- **Steps:**
  1. Use a remote server whose tool needs a wider permission than your grant.
  2. Ask the assistant to run that tool.
  3. Look for the error text needs the additional permission '<scope>'. Run agi mcp login <name> to grant it.
  4. Type agi mcp login <name>, approve in the browser, then ask again and check that the tool runs.

## S55.32 Private-network setup where offered.

- **Expected:** Where offered, a connector can reach services on a private network through a supported setup.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/mcp/registry.rs:358
- **Where to find it:** not found in the code. Searched apps/cli/src for private network, VPN and tunnel. Only refusals for private addresses in fetch tools (features/exec/tools/mod.rs:1523, permissions.rs:173) were found; validate_remote_url in mcp/registry.rs accepts only http and https. No private-network setup was found.
- **Needs:** a service on a private network

---
id: "REQ-AREA-058"
type: "requirements"
title: "Requirement items: MCP and interactive extension products"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 58. MCP and interactive extension products

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S58.01

**MCP server list.** The user can see a list of the MCP servers configured for their account or workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F058-01 See your servers and their tools](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07, CAP-connectors-apps-and-extensions-26

## S58.02

**Add local server.** The user can register a local (stdio) MCP server that the product starts on their machine.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code missing
- Feature: [F058-02 Add a server (remote or local)](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Competitor trace: CAP-connectors-apps-and-extensions-17, CAP-connectors-apps-and-extensions-26

## S58.03

**Add remote server.** The user can add a remote MCP server by URL (with optional credentials) and it becomes available to the assistant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code missing
- Feature: [F058-02 Add a server (remote or local)](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07

## S58.04

**Server configuration editor.** The user can view and edit an existing MCP server's configuration (URL, transport, arguments).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F058-03 Configure a server](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Competitor trace: CAP-connectors-apps-and-extensions-26

## S58.05

**Environment-variable configuration.** The user can set environment variables for an MCP server from the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code missing
- Feature: [F058-03 Configure a server](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Competitor trace: CAP-connectors-apps-and-extensions-17, CAP-connectors-apps-and-extensions-26

## S58.06

**Credential configuration.** The user can supply credentials (token or OAuth sign-in) for an MCP server and they are stored securely.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing
- Feature: [F058-03 Configure a server](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07, CAP-connectors-apps-and-extensions-08

## S58.07

**Connection test.** The user can test the connection to an MCP server and see whether it succeeded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done
- Feature: [F058-04 Test a connection and read health and logs](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07

## S58.08

**Tool discovery.** Connecting an MCP server discovers its tools and the user can see them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F058-01 See your servers and their tools](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07

## S58.09

**Resource discovery.** The product discovers an MCP server's resources and lets the user browse or attach them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F058-06 Resources and prompts](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)

## S58.10

**Prompt discovery where supported.** Where a server offers prompts, the product lists them and lets the user run one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing
- Feature: [F058-06 Resources and prompts](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)

## S58.11

**Server capability inspector.** The user can inspect a server's capabilities (protocol, tools, resources, prompts, extensions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F058-01 See your servers and their tools](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)

## S58.12

**Server health and logs.** Each server shows its health and the user can read recent logs or call history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F058-04 Test a connection and read health and logs](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07

## S58.13

**Enable/disable server.** The user can disable a configured server without removing it, and re-enable it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing
- Feature: [F058-05 Turn a server on or off](../../20-features/058-mcp-and-interactive-extension-products/F058-05-turn-a-server-on-or-off.md)

## S58.14

**Per-Project server configuration.** MCP servers can be configured per project so they load only in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F058-03 Configure a server](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Competitor trace: CAP-connectors-apps-and-extensions-17, CAP-connectors-apps-and-extensions-26

## S58.15

**Organization-approved server catalog.** An organization admin maintains a catalog of approved MCP servers that members can use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F058-07 Organization-approved server catalog](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Competitor trace: CAP-connectors-apps-and-extensions-12

## S58.16

**Private-network connector route.** Where offered, an MCP server on a private network can be reached through a supported route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, Chrome missing
- Feature: [F058-02 Add a server (remote or local)](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Competitor trace: CAP-connectors-apps-and-extensions-09

## S58.17

**Interactive MCP app panel.** A tool result that ships an MCP App renders as an interactive panel inside the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.18

**Embedded app initialization.** The host initializes the embedded app with the standard handshake before it runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.19

**Host-to-widget state.** The host passes the tool input, result and host context (theme, display mode) to the widget.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.20

**Widget-to-host actions.** The widget can call server tools and read resources through the host, with approval for tool calls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.21

**Widget resizing.** The widget can request a new height and the host resizes it within limits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.22

**Widget authentication.** The widget acts as the signed-in user without handling credentials itself.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.23

**Viewer-specific authorization.** An app's payload and actions are authorized for the viewing user only.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-08 Interactive MCP App panels in chat](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S58.24

**Site-provided tools such as WebMCP as a distinct category.** Tools a website provides (e.g. WebMCP) appear to the assistant as their own category, distinct from connectors.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, Chrome done
- Feature: [F058-09 Site-provided tools in the browser extension](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)

## S58.25

**Tool availability changing with site state.** When the page state changes, the set of site-provided tools available to the assistant updates.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, Chrome done
- Feature: [F058-09 Site-provided tools in the browser extension](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)

## S58.26

**Extension debugging console.** Extension developers get a console to watch MCP traffic and debug their server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F058-10 Developer debugging console](../../20-features/058-mcp-and-interactive-extension-products/F058-10-developer-debugging-console.md)
- Competitor trace: CAP-connectors-apps-and-extensions-33

## S58.27

**Developer-mode connection flow.** A developer can connect an in-development server (e.g. localhost) through a developer-mode flow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F058-02 Add a server (remote or local)](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Competitor trace: CAP-connectors-apps-and-extensions-33

## S58.28

**Schema/version compatibility diagnostics.** The product reports protocol/schema version mismatches or partial compatibility for a server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F058-01 See your servers and their tools](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Competitor trace: CAP-connectors-apps-and-extensions-33

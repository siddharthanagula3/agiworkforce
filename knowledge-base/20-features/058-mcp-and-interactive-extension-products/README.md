---
id: "AREA-058"
type: "area"
title: "MCP and interactive extension products"
features: ["F058-01", "F058-02", "F058-03", "F058-04", "F058-05", "F058-06", "F058-07", "F058-08", "F058-09", "F058-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 58. MCP and interactive extension products

This area lets a person connect outside tools to the assistant using MCP (Model Context Protocol, a shared standard for giving an AI access to outside tools, resources and prompts). A person can add a remote server by web address or a local server on their machine, see what it offers, and switch it off without deleting it. Some tool results also show a small interactive panel (an "MCP App") inside the chat, and the browser extension can use tools that a web page itself publishes.

**Who uses it.** Signed-in users of the web app and desktop can manage their own custom servers; adding one is gated by the workspace access check and the organization policy flag allowCustomConnectors (apps/web/app/api/connectors/custom/route.ts:94-112). Workspace admins control the organization-approved catalog and can publish or retire servers (role check "policy.manage", apps/web/app/api/settings/organization/mcp/route.ts:240-245). Developers use the CLI to add local servers and project-level config files. Chat users see MCP App panels when a tool returns one. The browser extension uses site-provided tools on pages it runs on. A per-plan cap on connector tools exists (apps/web/lib/user-connector-tools.ts:177-179); the exact paid-plan rules were not traced.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F058-01](F058-01-see-your-servers-and-their-tools.md) | See your servers and their tools | built | built | partly | partly | partly | n/a |
| [F058-02](F058-02-add-a-server-remote-or-local.md) | Add a server (remote or local) | partly | partly | partly | built | built | no |
| [F058-03](F058-03-configure-a-server.md) | Configure a server | partly | partly | partly | built | partly | n/a |
| [F058-04](F058-04-test-a-connection-and-read-health-and-logs.md) | Test a connection and read health and logs | built | built | built | built | built | n/a |
| [F058-05](F058-05-turn-a-server-on-or-off.md) | Turn a server on or off | built | built | no | built | partly | n/a |
| [F058-06](F058-06-resources-and-prompts.md) | Resources and prompts | built | built | no | partly | partly | n/a |
| [F058-07](F058-07-organization-approved-server-catalog.md) | Organization-approved server catalog | built | built | n/a | n/a | n/a | n/a |
| [F058-08](F058-08-interactive-mcp-app-panels-in-chat.md) | Interactive MCP App panels in chat | built | built | no | n/a | no | no |
| [F058-09](F058-09-site-provided-tools-in-the-browser-extension.md) | Site-provided tools in the browser extension | n/a | n/a | n/a | no | n/a | built |
| [F058-10](F058-10-developer-debugging-console.md) | Developer debugging console | no | no | no | n/a | no | no |

Requirement items for this area: [10-requirements/capabilities/058-mcp-and-interactive-extension-products.md](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md).

## How this area works in the code

1. **Person opens the connector list.** The web app and desktop request the user's custom connectors. The route checks the user, rate limit and workspace access, then returns the user's connectors with a sign-in flag from their OAuth grants. (`apps/web/app/api/connectors/custom/route.ts:59-83`)
2. **Person adds a custom server.** The route checks CSRF, rate limit, workspace access and the allowCustomConnectors policy. If allowed, it reads the body and creates the connector, then records an external resource reference and returns 201. (`apps/web/app/api/connectors/custom/route.ts:85-112`, `apps/web/app/api/connectors/custom/route.ts:114-134`, `apps/web/app/api/connectors/custom/route.ts:136-175`)
3. **Server discovery and tool list.** The capabilities route validates the connector ID, loads the user's capability catalog, and returns tools, resources, prompts, apps and discovery errors. Text from the server is cleaned before display, and each tool gets a read-only flag and risk tier. (`apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:49-70`, `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:86-117`)
4. **Saving an MCP App payload.** When a tool returns an app, the payload (tool input and result) is saved for 30 days. Payloads over 2 MB are not saved. (`apps/web/lib/connectors/mcp-state-store.ts:10-11`, `apps/web/lib/connectors/mcp-state-store.ts:22-31`)
5. **Chat creates the app card.** The tool loop turns a tool result that carries an app into a card of kind mcp-app.v1, with a text fallback for clients that cannot show it. A failed task binding returns a message instead. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2955`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2982-2988`)
6. **Rendering the panel and sandbox.** The web card registry maps the kind to McpAppCard. The card builds a sandbox URL on a separate origin (required in production), waits for the sandbox to be ready, then passes the resource with its security policy. Device requests from the app need approval per device name. (`apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38-45`, `apps/web/features/chat/components/messages/cards/McpAppCard.tsx:113-117`, `apps/web/features/chat/components/messages/cards/McpAppCard.tsx:222-294`, `apps/web/features/chat/components/messages/cards/McpAppCard.tsx:340-365`)
7. **Admin catalog change.** An admin's publish or retire request checks the policy.manage role and the connectors-released gate, then updates the server, checks the workspace revision and writes an audit event. (`apps/web/app/api/settings/organization/mcp/route.ts:240-275`)
8. **Browser extension site tools.** The content script discovers page-published tools and reports them to the background worker, which sends change updates. The browser agent's discover action takes no arguments. (`apps/extension/src/content.ts:40-50`, `apps/extension/src/webmcp.ts:55`, `apps/extension/src/background.ts:2294`, `apps/extension/src/features/computer-use/agentLoop.ts:383-386`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/connectors/custom/route.ts` | Lists, adds (policy-gated) and deletes the user's custom MCP servers. |
| `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Returns one server's tools, resources, prompts, apps, protocol details and discovery errors. |
| `apps/web/lib/connectors/mcp-state-store.ts` | Saves MCP App payloads to the database with a 30-day expiry and a 2 MB limit. |
| `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | Runs an MCP App in a sandboxed frame in the web chat and handles tool-call approval and resizing. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Creates the mcp-app.v1 chat card from a tool result and saves its payload. |
| `apps/web/app/api/settings/organization/mcp/route.ts` | Admin catalog: publish and retire approved servers with role, release gate, revision and audit checks. |
| `apps/mobile/src/features/chat/services/mcpAppPayload.ts` | Mobile client that fetches a saved MCP App payload from the web payload route. |
| `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Mobile chat card switch; renders McpAppCard for kind mcp-app.v1. |
| `apps/extension/src/webmcp.ts` | Finds tools a web page declares (declarative and imperative) and watches for changes. |
| `apps/extension/src/features/computer-use/agentLoop.ts` | Extension browser agent; has the discover_site_tools action. |
| `apps/cli/src/mcp/mod.rs` | CLI MCP runtime; reads project and global .mcp.json and mcp.json config files. |
| `apps/web/lib/user-connector-tools.ts` | Builds the user's connector tool catalog, applies the plan tool limit and the connectors-released gate. |

## What is stored

- Custom MCP server rows (name, address, transport, short ID): Database, through mcp-custom-connections helpers imported at apps/web/app/api/connectors/custom/route.ts:35-41 (helper internals not opened)
- OAuth grant state for servers (sign-in and re-authorization flag): Database via oauth-store, imported at apps/web/app/api/connectors/custom/route.ts:34
- MCP App payloads: tool input and tool result, 30-day expiry, 2 MB cap: Neon database through getNeonDb, apps/web/lib/connectors/mcp-state-store.ts:8, 10-11, 22-31
- Audit events for connector add, removal and admin policy change: recordAuditEvent in apps/web/app/api/connectors/custom/route.ts:204 and apps/web/app/api/settings/organization/mcp/route.ts
- External resource references for custom servers: recordExternalResourceReferences, apps/web/app/api/connectors/custom/route.ts:136-150
- CLI MCP server config: Files on disk named .mcp.json and mcp.json in the project folder and the CLI config folder, apps/cli/src/mcp/mod.rs:1130 and 2047
- Browser extension page tool list: Extension background state; the storage mechanism was not opened (apps/extension/src/background.ts:2294 sends updates)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **allowCustomConnectors (organization policy)**: When off, members cannot add custom MCP servers; the add request is refused with a forbidden error. (Read in apps/web/app/api/connectors/custom/route.ts:104-112 via evaluateConnectorPolicyForUser; stored by apps/web/lib/services/connector-policy-service.ts:56 and 137)
- **Connectors released gate (connectorsReleased)**: When the release is not on, the full connector tool list is not loaded unless the caller opts into selective loading; publish and un-retire in the admin catalog are blocked. (apps/web/lib/user-connector-tools.ts:2084 and 2277; apps/web/app/api/settings/organization/mcp/route.ts:245)
- **Plan tool limit**: Caps how many connector tools a user can load; a default cap applies when the plan has no product limits. (apps/web/lib/user-connector-tools.ts:177-179)
- **Dedicated sandbox origin for MCP Apps**: In production an app runs only when the sandbox URL is on a different origin; otherwise the panel shows the unavailable message. (apps/web/features/chat/components/messages/cards/McpAppCard.tsx:113-117)
- **Workspace access gate**: Refuses connector list, add and delete requests for users whose workspace blocks them. (apps/web/app/api/connectors/custom/route.ts:65, 94, 186)
- **Rate limit bucket chat-conversation**: Limits how often connector routes can be called per user. (apps/web/app/api/connectors/custom/route.ts:46, 62, 91; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:53)
- **Project MCP config files**: Servers in .mcp.json or mcp.json in a project folder load only for that project and win over global servers. (apps/cli/src/mcp/mod.rs:1130 and 2012-2013)

## Shared between apps

[{"what": "Web routes, chat cards and admin catalog", "detail": "Shared within apps/web. The brief cites packages/ui/ui/src/directory/DirectoryPanel.tsx and packages/ui/ui/src/settings-modal/SettingsModal.tsx for the web and desktop settings UI (not opened)."}, {"what": "Typed contracts", "detail": "@agiworkforce/cloud-contracts supplies request and response types and CONNECTOR_REF_PATTERN for the web routes and McpAppCard; @agiworkforce/mcp supplies protocol types used by mcp-state-store.ts."}, {"what": "Mobile chat card helpers", "detail": "apps/mobile/src/features/chat/services/mcpAppPayload.ts imports mcpAppPlainResultText from @agiworkforce/unified-chat/mcp-app, which is shared with the unified chat package."}, {"what": "Separate per app", "detail": "Desktop settings (apps/desktop/src/features/settings), mobile settings (apps/mobile/src/features/settings/cloud-connectors), the Rust CLI (apps/cli/src/mcp and lib.rs), the VS Code extension (apps/extension-vscode) and the Chrome extension (apps/extension/src) each have their own screen code."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says mobile has no interactive MCP app panel (S58.17-S58.23 marked missing), but mobile chat renders McpAppCard for kind mcp-app.v1 and has a payload fetch service. (apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1103-1105; apps/mobile/src/features/chat/services/mcpAppPayload.ts:1-30)
- Brief's code references for the MCP App items do not point to the named behaviour. InteractiveCardBlock.tsx:38 is the card registry import block, and tool-loop.ts:2159 is streaming text code. (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159)
- Brief's code references for site-provided tools (background.ts:4325-4326) point to scroll-handling code, not WebMCP. agentLoop.ts:636 is tab ownership code, not tool availability. (apps/extension/src/background.ts:4320-4330; apps/extension/src/features/computer-use/agentLoop.ts:630-640)
- The custom server route omits the organization ID and its comment says the policy gate then skips policy for personal accounts. If that is so for workspace members, allowCustomConnectors could be bypassed. Not confirmed, because the gate was not opened. (apps/web/app/api/connectors/custom/route.ts:97-112)

## Not established

- How the custom connector helpers (mcp-custom-connections) store rows; not opened.
- Whether evaluateConnectorPolicyForUser looks up the workspace when organizationId is omitted (route comment at custom/route.ts:101-103); the gate was not opened.
- Mobile connector screens (apps/mobile/src/features/settings/cloud-connectors/*) and apps/mobile/services/connectors.ts; not opened, so their status comes from the brief.
- Web and desktop connector hooks and panels (useConnectorsSettingsAdapter.tsx, ConnectorCapabilitiesPanel.tsx, ToolPermissionsPanel.tsx) and the settings modals; cited by the brief but not opened.
- CLI private-network route (apps/cli/src/lib.rs:1337, apps/cli/src/mcp/registry.rs:261) and developer-mode flow (registry.rs:349); not opened.
- VS Code connector code (apps/extension-vscode/src/features/surfaces/*); not opened.
- The payload route apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts and its viewer check; not opened.
- The OAuth start route (apps/web/app/api/connectors/oauth/start/route.ts) and how tokens are stored; not opened.
- The calls route (apps/web/app/api/connectors/calls/route.ts) behind the web call history; not opened.
- Whether any MCP traffic debugging console exists; the brief lists it as missing and no code was found in the paths checked.
- Paid-plan rules for MCP servers beyond the tool cap; not established.
- Whether the browser extension stores the page tool list in browser storage; not established.

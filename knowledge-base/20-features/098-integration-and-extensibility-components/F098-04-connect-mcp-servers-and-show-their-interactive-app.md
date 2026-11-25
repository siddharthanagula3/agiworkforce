---
id: "F098-04"
type: "feature"
title: "Connect MCP servers and show their interactive apps"
aliases: ["MCP client", "MCP apps", "Interactive app card", "MCP App host bridge", "MCP directory", "Custom connector by URL"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.12", "S98.16"]
depends_on: ["F098-01", "F098-03", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-shared-ui-and-design", "surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "mode:local", "table:mcp_app_payloads"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-04 Connect MCP servers and show their interactive apps

Talks to MCP servers: lists their tools, resources and prompts and calls tools. The web server uses a TypeScript client; the CLI and Tauri desktop use a Rust crate. When a tool returns an interactive app, the web chat shows it in a sandboxed card; mobile shows plain text.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.12](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9812), [S98.16](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9816).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Connects to any MCP server (remote over HTTP or SSE, or local over stdio in the CLI and Tauri desktop), negotiates the protocol revision, lists capabilities and calls tools. In web chat, a tool that returns an app resource is shown as a card in a separate sandbox origin, and calls from the app go back through the gateway.

**Why it exists.** MCP is the shared way to add tools and rich results from outside vendors without custom code per vendor (S98.12, S98.16).

**Who uses it.** People who add an MCP server or custom connector, and anyone whose connector returns an interactive result.

**Problems it solves**

- One client for many servers.
- Safe display of third-party interactive content.
- Honest fallback to plain text when no safe sandbox exists.

**Use cases**

- Add a vendor's MCP server by URL from the connectors page.
- Use a CLI-configured stdio MCP server in a terminal session.
- See a chart or form from a tool as a card in chat.
- Click inside the card and approve a follow-up tool call.

## 2. User experience

**Where to find it**

- Web: Settings, Connectors, add by URL or from the directory; public /connectors/mcp-directory page 'Browse the MCP directory' (app/connectors/page.tsx:33; app/connectors/mcp-directory).
- Web chat: card titled '<tool name> interactive result', text 'Loading MCP App…', buttons 'Allow once' and 'Deny' (McpAppCard.tsx:147-236, 440).
- Mobile: plain result text; messages 'This MCP App result expired or is unavailable.' and 'The tool returned no text to show.' (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:12-13).
- CLI: 'agi mcp add/list/remove' style commands (apps/cli/src/lib.rs:5112-5388) [command names not fully read].
- Desktop (Tauri): commands mcp_list_servers, mcp_connect_server, mcp_call_tool (apps/desktop/src-tauri/src/sys/commands/mcp.rs:781-999). The public Electron Desktop shows the hosted web app.
- VS Code and Chrome: unknown.

**Before you start**

- For web remote servers: connector released, paid plan, connect done (F098-01, F098-03).
- For apps: NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN set to an https origin different from the app origin in production (McpAppCard.tsx:111-118; lib/validate-env.ts:461-490).
- CLI and Tauri: a stdio command or URL configured locally.

**Screens and controls**

- Add-by-URL form with optional bearer token or OAuth client ID and secret (docs/development/connectors-setup.md).
- Card controls: 'Allow once' and 'Deny' for tool calls and for device permissions (camera, microphone, location, clipboard) the app asks for (McpAppCard.tsx:54-80, 196-236).

**Journey**

1. 1. Person adds a server or has one connected.
2. 2. Server connects, negotiates, and lists tools, resources, prompts (packages/tools/mcp/src/connect.ts:655-760).
3. 3. A tool call returns a result with an app resource; the server saves the payload and the chat shows a card (tool-loop.ts:2968-3000).
4. 4. The browser fetches the payload, reads the app HTML through the gateway, and loads it in a sandbox frame on the dedicated origin (McpAppCard.tsx:225-255).
5. 5. Calls from the app go to the gateway; non-allowed tools ask first (McpAppCard.tsx:283-300).
6. 6. If anything is unsafe or missing, the plain tool result is shown with a reason.

**What the person sees and gets**

- 'Loading MCP App…' while loading.
- "This app can't be displayed here, so the tool's result is shown instead." when no separate sandbox origin exists (packages/ui/unified-chat/src/lib/mcp-app.ts:3-4).
- "This app's content is too large to display." over 2 MB (mcp-app.ts:1-2).
- Device ask sentence: 'This app wants to use your camera ...' (McpAppCard.tsx:74-80).

**Settings**

- NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN (name only; .env.example:868).
- Per-tool permissions (F098-03).
- CLI MCP server config files and OAuth store (apps/cli/src/mcp/).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Rust client: list_tools, list_resources, list_resource_templates, read_resource, call_tool (crates/agiworkforce-mcp/src/client.rs:151-223); transports stdio, HTTP, SSE (client.rs transport kinds at 230-262; transport/ folder).
- Rust discovery: probes server/discover, classifies modern, legacy or silent servers and reports an unsupported revision (client.rs:288-390).
- Rust OAuth flow helpers: protected-resource and authorization-server discovery, dynamic registration, PKCE, refresh (crates/agiworkforce-mcp/src/oauth/flow.rs:147-672).
- Rust response cache for list calls (cache.rs:16 lists prompts/list among cached methods).
- TypeScript client used by the web server lists tools, resources, resource templates and prompts with item limits and error capture, and exposes callTool, readResource, getPrompt, and tasks (packages/tools/mcp/src/connect.ts:395-430, 655-760, 815-895).
- Web card: separate sandbox origin required in production, 2 MB cap, CSP from the app's metadata, device-permission prompts, approval for tool calls (McpAppCard.tsx:54-144, 283-300).
- Payload saved for 30 days, up to 2 MB, in table mcp_app_payloads; payload route returns it to its owner (mcp-state-store.ts:10-60; app/api/mcp-apps/payload/[payloadId]/route.ts).

**Incomplete**

- The Rust client has no prompts/list or prompts/get method; prompts are only referenced in cache keys and input-required rules (client.rs:33; cache.rs:16, 241). The brief says the client lists prompts (S98.12). The web's TypeScript client does list and get prompts (connect.ts:733, 889).
- Apps render only on web chat. Mobile shows result text (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:1-40). Desktop (Tauri), VS Code and Chrome handling of app cards: unknown; a search found no card code there.
- The brief cites tool-loop.ts:2147 for the host bridge; the card is built near tool-loop.ts:2968-3000 (stale reference).

**Present but disconnected or switched off**

- Interactive apps are off in production without a dedicated sandbox origin (McpAppCard.tsx:111-118).
- Web connectors are off except released ids (F098-01).

**Not available**

- Local mode for remote servers: only stdio servers on the device are local; HTTP servers need the network.
- Private-network reach from cloud (S98.15 missing).

## 4. Required behaviour

**Established requirements**

- An MCP client runtime connects to servers and lists and calls their tools, resources and prompts (S98.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.12)
- A host bridge renders MCP App resources in a sandbox and relays calls between widget and server (S98.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.16)
- Interactive apps load in a separate sandbox origin; production refuses a same-origin sandbox. (source: apps/web/features/chat/components/messages/cards/McpAppCard.tsx:111-118)
- Rust protocol types flow one way into TypeScript; a Rust client and a TypeScript client both exist. (source: AGENTS.md section 5)

**Acceptance criteria**

1. Connecting to a test server lists its tools, resources and prompts (web) or tools and resources (Rust).
2. A server that publishes only a newer unsupported revision gives a clear 'unsupported revision' error.
3. With no dedicated sandbox origin in a production build, the card shows the plain result and the explanatory sentence.
4. An app resource over 2 MB shows the too-large sentence.
5. An app asking for camera shows the device sentence and no access until 'Allow once'.
6. A tool call from the app for a non-allowed tool asks before running.
7. The payload route refuses another user's payload id.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Mobile cannot host the sandbox, so plain text is the product choice there.
- [inferred] A prompts method on the Rust client would be needed for CLI parity with web.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add list_prompts and get_prompt to the Rust client or change the brief wording.
- [proposed] Decide card behaviour for Tauri desktop, VS Code and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Rust MCP client | `crates/agiworkforce-mcp/src/client.rs` | Connect, negotiate, list and call. |
| config | Rust MCP config | `crates/agiworkforce-mcp/src/config.rs` | TransportConfig, OAuthConfig, McpTimeouts. |
| service | Rust MCP cache | `crates/agiworkforce-mcp/src/cache.rs` | Cache for list calls and invalidation by notifications. |
| service | Rust MCP OAuth flow | `crates/agiworkforce-mcp/src/oauth/flow.rs` | Discovery, registration, PKCE, refresh. |
| service | Rust MCP transports | `crates/agiworkforce-mcp/src/transport/http.rs` | HTTP (and sse.rs, stdio.rs) transports. |
| service | Rust MCP security | `crates/agiworkforce-mcp/src/security.rs` | Safety checks on server text and frames. |
| command | Tauri MCP commands | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` | mcp_connect_server, mcp_list_tools, mcp_call_tool for the Tauri build. |
| service | CLI MCP module | `apps/cli/src/mcp/mod.rs` | CLI use of the crate, OAuth store, consent, elicitation. |
| service | TypeScript MCP client | `packages/tools/mcp/src/connect.ts` | connectMcpServer used by the web server. |
| service | Custom MCP connections | `apps/web/lib/connectors/mcp-custom-connections.ts` | Connect custom servers by URL. |
| service | MCP discovery | `apps/web/lib/connectors/mcp-discovery.ts` | Probe, authorize and refresh directory servers. |
| service | MCP directory targets | `apps/web/lib/connectors/mcp-directory-targets.ts` | Maps directory entries to MCP targets. |
| component | McpAppCard (web) | `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | Sandbox frame, bridge, approvals, fallback. |
| endpoint | api:GET /api/mcp-apps/sandbox | `apps/web/app/api/mcp-apps/sandbox/route.ts` | Serves the sandbox proxy page with a built CSP. |
| endpoint | api:GET /api/mcp-apps/payload/{payloadId} | `apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts` | Returns a saved app payload to its owner. |
| endpoint | api:POST /api/connectors/{connectorId}/mcp | `apps/web/app/api/connectors/[connectorId]/mcp/route.ts` | Gateway for readResource and callTool from the card. |
| table | table:mcp_app_payloads | `apps/web/db/neon/0147_mcp_stateless_cache.sql` | Saved app payloads; row-level security in 0173. |
| service | MCP state store | `apps/web/lib/connectors/mcp-state-store.ts` | Save and load app payloads, bind tasks. |
| service | Tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Builds the mcp-app.v1 interactive card (lines 2968-3000). |
| component | McpAppCard (mobile) | `apps/mobile/src/features/chat/components/cards/McpAppCard.tsx` | Plain result text fallback. |
| config | App messages and limits | `packages/ui/unified-chat/src/lib/mcp-app.ts` | 2 MB cap and fallback sentences shared by apps. |
| config | Sandbox origin check | `apps/web/lib/validate-env.ts` | Validates NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN (lines 461-490). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server (web) or process (CLI, Tauri) connects to the MCP server and negotiates the protocol revision. | device and our servers | client.rs:81-130, 288-357; connect.ts:655 |
| Client lists tools, resources, prompts (TypeScript) or tools and resources (Rust). | outside service | connect.ts:655-760; client.rs:151-190 |
| A tool call returns a result that names an app resource; the web server saves the payload and emits a card. | our servers | tool-loop.ts:2968-3000; mcp-state-store.ts:22-60 |
| The browser loads the payload, reads the resource via the gateway, and opens the sandbox frame on another origin. | device and our servers | McpAppCard.tsx:225-255 |
| Calls from the app go through the gateway with approval; the host relays results to the frame. | device and our servers | McpAppCard.tsx:283-300; mcp/route.ts:25-146 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| App payload (tool input and result). | table:mcp_app_payloads | Server; fetched by the owner's browser or phone. | Expires after 30 days; over 2 MB not saved (mcp-state-store.ts:10-11, 30-38). |
| Local MCP server configuration and OAuth tokens (CLI and Tauri). | Device (CLI apps/cli/src/mcp/oauth_store.rs; Tauri core/mcp/oauth.rs) | Not read. | Not read. |
| Stdio server stderr and logs. | In memory buffer (client.rs stderr_buf). | No. | Drained on demand. |

**Models and providers.** No model is needed to connect or list. A model decides to call tools through the normal tool loop. Remote MCP servers are outside services; their content is untrusted and is fenced or sanitized (connect.ts sanitizeCatalogText; lib/connectors/mcp-untrusted-text.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs sign-in. CLI and Tauri local stdio servers need no AGI account to connect [inferred]; not verified. |
| Permissions | Per-tool permission levels and approvals (mcp/route.ts:49-59); egress policy for MCP in the web (user-connector-tools.ts MCP_EGRESS_POLICY; assertResolvedPublicHostname at line 2431 region); Rust security module. |
| Subscription | Web remote servers: paid plan with the connectors capability (F098-03). Local stdio: none found in the code read. |
| Limits and metering | Catalog item limits per capability (connect.ts CATALOG_ITEM_LIMITS), 2 MB app cap, request payload cap, timeouts (config.rs McpTimeouts). |
| Feature flags | NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN; release gate for web connectors. |
| Model compatibility | Not model dependent for connection; tool use depends on the model route's tool support [inferred]. |
| Provider restrictions | Server must speak a supported MCP revision; some need pre-registered OAuth clients (docs/runbooks/connector-oauth-apps.md). |
| Local mode | Local stdio MCP servers run on the device in the CLI and Tauri desktop. Remote servers in Local mode: whether the product routes them is not verified. Web card requires a browser and our server gateway. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading MCP App…' with a spinner. | McpAppCard.tsx:147-151 |
| Error | Shows the message or 'MCP App failed to load' with a warning icon. | McpAppCard.tsx:152-158 |
| Fallback | Shows the notice and the plain result text for missing sandbox origin or oversized resource. | McpAppCard.tsx:102-125, 159-171; mcp-app.ts:1-4 |
| Expired payload | 'This MCP App result expired or is unavailable' (web error path; mobile constant). | McpAppCard.tsx:232; mobile McpAppCard.tsx:12 |
| Identity mismatch | Payload connector, resource or tool differing from the card gives an error. | McpAppCard.tsx:234-240 |
| Declined approval | Returns 'The user declined this MCP App tool call.' to the app. | McpAppCard.tsx:283-300 |
| Unsupported revision | Rust connect fails with an unsupported-revision error. | client.rs:333-357, 379 |
| Stdio server dies | transport_alive and is_alive report false; stderr is attached to errors. | client.rs:230-262, 366-377 |
| Cancel and timeout | Gateway passes request.signal; Rust applies timeouts. | mcp/route.ts:61; config.rs McpTimeouts |
| Offline | not handled in the code for the card beyond fetch errors. | McpAppCard.tsx:225-255 |
| Accessibility | Iframe has a title; icons are aria-hidden. Keyboard handling inside apps is the app's own. | McpAppCard.tsx:429-436 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx`: Sandbox origin refusal, 2 MB cap, device permission asks.
- `apps/web/app/api/mcp-apps/sandbox/route.test.ts`: Sandbox page and CSP.
- `apps/web/app/api/mcp-apps/payload/[payloadId]/__tests__/route.test.ts`: Payload route.
- `apps/mobile/src/features/chat/components/cards/__tests__/McpAppCard.test.tsx`: Mobile plain result card.
- `packages/tools/mcp/src/__tests__/connect.test.ts`: TypeScript client connect and catalog.
- `packages/tools/mcp/src/__tests__/protocol-era.test.ts`: Modern and legacy protocol eras.
- `crates/agiworkforce-mcp/tests/tools.rs`: Rust client tool listing and calls.
- `crates/agiworkforce-mcp/tests/resources.rs`: Rust resources.
- `crates/agiworkforce-mcp/tests/initialize.rs`: Negotiation.
- `crates/agiworkforce-mcp/tests/oauth.rs`: Rust OAuth flow.
- `apps/web/lib/connectors/__tests__/mcp-discovery.test.ts`: Discovery authorization.

**Test scenarios**

- **Add a no-auth server**
  1. Add a test MCP server by URL on web.
  2. Open its tool list.
  - Expected: Tools appear; a call returns text.
- **App without sandbox origin**
  1. Run a production build without the sandbox origin.
  2. Trigger a tool that returns an app.
  - Expected: Plain result with the sentence about not displaying here.
- **App with sandbox origin**
  1. Set a separate https origin.
  2. Trigger the tool.
  - Expected: Card renders; clicking inside calls the gateway; a non-allowed tool asks Allow once or Deny.
- **Oversized app**
  1. Return an app HTML over 2 MB.
  - Expected: Too-large sentence plus plain text.
- **Rust prompts**
  1. Connect the CLI to a server with prompts.
  2. Look for a prompt listing command.
  - Expected: Required by the brief; not present in the crate today. Record the result.
- **Revision mismatch**
  1. Connect the Rust client to a server that supports only an unknown newer revision.
  - Expected: Error naming the unsupported revision.

**Where to look when it fails**

- Web logs '[mcp-app] could not persist app payload', '[mcp-app] payload exceeded the persisted app limit'.
- validate-env message when the sandbox origin is missing (validate-env.ts:461-490).
- Rust: '[server] MCP connected via <transport> (protocol <v>)' hook log (client.rs:120-124); stderr attached to errors.
- Table mcp_app_payloads.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Rust MCP client lacks prompt list and get.** Affects: CLI and Tauri desktop.. Evidence: client.rs:151-223 has no prompt method; brief S98.12 says prompts.. Work needed: Add the methods or narrow the brief.
- **Interactive apps work only on web chat; mobile shows text, other apps unknown.** Affects: Mobile, Tauri desktop, VS Code, Chrome.. Evidence: mobile McpAppCard.tsx:1-40; search of other apps found no card.. Work needed: Decide per-app behaviour and test.
- **Brief reference for S98.16 points at stale code.** Affects: Testers.. Evidence: tool-loop.ts:2147 is stream parsing; card built at 2968-3000.. Work needed: Update the brief.
- **Two client implementations (TypeScript and Rust) must stay in step.** Affects: All apps using MCP.. Evidence: packages/tools/mcp and crates/agiworkforce-mcp are separate.. Work needed: Shared conformance tests.

**Depends on**

- F098-01
- F098-03
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-shared-ui-and-design
- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- mode:local
- table:mcp_app_payloads

## Unknown

- Whether VS Code, Chrome and Tauri desktop render app cards.
- How the CLI names its MCP add and list commands exactly (lib.rs lines read only partly).
- Whether remote MCP servers are allowed in Local mode on desktop.
- Which models and providers support the tool loop for apps.
- Exact keyboard and screen reader behaviour inside the sandbox frame.

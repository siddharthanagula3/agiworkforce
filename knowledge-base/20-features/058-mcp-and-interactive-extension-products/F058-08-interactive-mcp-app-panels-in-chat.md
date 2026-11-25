---
id: "F058-08"
type: "feature"
title: "Interactive MCP App panels in chat"
aliases: ["MCP App card", "mcp-app.v1", "Interactive connector result", "MCP Apps panel", "Interactive MCP app panel", "McpAppCard", "S58.17 to S58.23"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S58.17", "S58.18", "S58.19", "S58.20", "S58.21", "S58.22", "S58.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:mcp_app_payloads", "table:mcp_task_bindings", "api:GET /api/mcp-apps/payload/[payloadId]", "api:GET /api/mcp-apps/sandbox", "api:POST /api/connectors/[connectorId]/mcp", "file:apps/web/features/chat/components/messages/cards/McpAppCard.tsx", "file:packages/ui/unified-chat/src/lib/mcp-app.ts", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-08 Interactive MCP App panels in chat

When an MCP tool result includes an app, the chat shows it as a small page inside a sandboxed frame. The app can ask to call tools (with approval), read resources, resize, and use device features after consent. Only the signed-in owner can load it. It is built on web and the Electron desktop; mobile shows plain text only; VS Code and Chrome have nothing.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.17](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5817), [S58.18](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5818), [S58.19](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5819), [S58.20](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5820), [S58.21](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5821), [S58.22](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5822), [S58.23](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5823).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** A tool result that points to an MCP App resource becomes an interactive card (kind 'mcp-app.v1'). The web chat loads the app HTML from the server's resource, runs it in a sandboxed iframe behind a relay page, passes it the tool input, tool result and theme, and brokers its calls back to the server's tools through our servers.

**Why it exists.** MCP Apps let a tool show a chart, form or dashboard instead of only text. Earlier desktop prototypes were cut because they did not follow the standard host contract; this host was built end to end (doc: docs/decisions/wire-or-cut.md section 'MCP Apps Host Boundary').

**Who uses it.** People chatting with a connector or MCP server that ships an app, and server authors whose apps run in chat.

**Problems it solves**

- Rich results instead of long text.
- Safe execution of third-party HTML: separate origin, strict CSP, no credentials in the app.
- The app acts as the signed-in person without ever holding a token.
- Device features need a visible 'Allow once'.

**Use cases**

- A connector returns a chart; the person sees it and can resize it.
- An app button calls a server tool; the person approves 'This App wants to run <tool>'.
- An app asks for the camera; the person chooses 'Allow once' or 'Deny'.

## 2. User experience

**Where to find it**

- Web chat: inside an assistant message after a tool call whose result has an app; the card has frame title '<tool> interactive result' (apps/web/features/chat/components/messages/cards/McpAppCard.tsx:431-441).
- Desktop: the Electron desktop shows the hosted web app, so the same card appears (doc: apps/desktop/README.md). The Tauri source has no card (no match under apps/desktop/src).
- Mobile: card testID 'interactive-card-mcp-app' shows the result as text with a notice, not an interactive app (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx).
- VS Code, Chrome: nothing found.

**Before you start**

- Signed in to Cloud (Managed Cloud account); the card loads via our servers.
- A connected MCP server that returns an app (tool metadata with a ui:// resource).
- On production web: a separate sandbox origin configured (NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN) or the card shows plain text.
- A saved (non-temporary) chat for buttons that send messages is an Answer-UI rule, not MCP App (InteractiveCardBlock.tsx:60-73).

**Screens and controls**

- Loading line 'Loading MCP App…' with a spinner (McpAppCard.tsx:407-411).
- The sandboxed frame, height 180 to 1000 px (starts at 360) (McpAppCard.tsx:204,329-333).
- Device ask bar: 'This app wants to use your camera, microphone and location.' with 'Allow once' and 'Deny' (McpAppCard.tsx:74-80,442-469).
- Tool ask bar: 'This App wants to run <tool name>.' with 'Allow once' and 'Deny' (McpAppCard.tsx:470-498).
- Notice with warning icon and the plain tool text when the app cannot run (McpAppCard.tsx:418-430).

**Journey**

1. Person asks the assistant to use a tool that returns an app.
2. The server runs the tool; if the result has an app and a user id, it stores the payload and emits the card (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2969-3002).
3. The chat shows 'Loading MCP App…'.
4. The card fetches its stored payload, reads the app HTML resource through our server, and checks size and permissions.
5. If the app wants device features the person sees the ask bar and chooses.
6. The relay page announces readiness, the host handshake runs, and the app receives the tool input and result.
7. The app is used; tool calls that need approval show 'This App wants to run …'; resize requests change the height within limits.

**What the person sees and gets**

- Error text from toUserMessage or 'MCP App failed to load' (McpAppCard.tsx:388-389,412-417).
- Expired payload: 'This MCP App result expired or is unavailable' (McpAppCard.tsx:232).
- Too large: "This app's content is too large to display." and the plain result (packages/ui/unified-chat/src/lib/mcp-app.ts:2).
- No separate origin: "This app can't be displayed here, so the tool's result is shown instead." (mcp-app.ts:3-4).
- Declined tool call returns 'The user declined this MCP App tool call.' to the app (McpAppCard.tsx:297).

**Settings**

- NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN deployment setting (apps/web/lib/validate-env.ts:458-490).
- Per-connector tool permission levels (allow, ask, deny) decide whether a widget call needs approval (apps/web/app/api/connectors/[connectorId]/mcp/route.ts:69-80).
- No per-person setting for apps found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server builds the 'mcp-app.v1' card and saves payload (tool-loop.ts:2969-3002; apps/web/lib/connectors/mcp-state-store.ts saveMcpAppPayload).
- Payload over 2 MB (input plus result JSON) is not saved, a warning is logged, and the message shows text only (mcp-state-store.ts:9-10,28-35).
- Task-binding failure returns 'The MCP server started a task, but its secure task binding could not be persisted.' (tool-loop.ts:2944-2958).
- Payload is fetched by id and only for the owning user, expires after 30 days, no-store (apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts:15-27; mcp-state-store.ts:8,63-70).
- Host card: standard AppBridge handshake, passes tool input, tool result and host context (platform web, theme, inline display, max height 1000) (McpAppCard.tsx:268-281,334-338).
- Widget actions: oncalltool with approval round trip, onreadresource, list resources, templates and prompts, openlink https only (McpAppCard.tsx:283-328).
- Resize: height clamped to 180..1000 (McpAppCard.tsx:329-333).
- Sandbox: relay page with strict CSP, inner frame sandbox 'allow-scripts allow-forms', no cache (apps/web/app/api/mcp-apps/sandbox/route.ts).
- Production requires a separate origin, else the plain text fallback (McpAppCard.tsx:111-118,242-248; apps/web/lib/validate-env.ts:458-490).
- Resource over 2 MB is shown as plain text with the too-large notice and logged with reason resource_too_large (McpAppCard.tsx:177-179,378-386).
- Device permissions (camera, microphone, geolocation, clipboard) are withheld until 'Allow once' (McpAppCard.tsx:54-90,259-266).
- Connector endpoint authorises each widget call for the viewer, enforces deny, asks for approval on non-allow or critical tools, audits (apps/web/app/api/connectors/[connectorId]/mcp/route.ts:57-80,130-150).

**Incomplete**

- Theme is read once when the bridge is created; no code updates the app when the theme changes (McpAppCard.tsx:273-275) [inferred from absence of any host-context update call].
- Display mode is only 'inline' (McpAppCard.tsx:276-277).
- Mobile shows the stored tool result as text with a notice; no interactive app (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:28-52,88-99).
- Row-level security migration 0173 says 'NOT YET APPLIED, draft only'; the store code uses the privileged database connection and filters by user_id itself (apps/web/db/neon/0173_mcp_app_state_row_level_security.sql header; mcp-state-store.ts:48,70-75). Whether applied: unknown.

**Present but disconnected or switched off**

- Connectors are 'coming soon' in the current release state, which gates connector tool turns (packages/contracts/types/src/connector-release.ts:12; connector-capability.ts:44-52). Effect on MCP App cards: unknown.
- Without NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN in production the app never runs; the card shows text (validate-env.ts:462-471).

**Not available**

- VS Code: no MCP App rendering found.
- Chrome extension: none found.
- CLI: not in scope.
- Tauri desktop source: no MCP App code found under apps/desktop/src.
- Local-mode MCP servers: the card reads resources through the cloud connector route only (McpAppCard.tsx:129-145).

## 4. Required behaviour

**Established requirements**

- A tool result that ships an MCP App renders as an interactive panel inside the chat (web done, desktop done, mobile/VS Code/Chrome missing). (source: S58.17)
- The host initializes the embedded app with the standard handshake before it runs. (source: S58.18)
- The host passes tool input, result and host context (theme, display mode) to the widget. (source: S58.19)
- The widget can call server tools and read resources through the host, with approval for tool calls. (source: S58.20)
- The widget can request a new height and the host resizes within limits. (source: S58.21)
- The widget acts as the signed-in user without handling credentials. (source: S58.22)
- An app's payload and actions are authorized for the viewing user only. (source: S58.23)
- Embedded Apps need the standard host contract end to end; arbitrary HTML via private formats was cut. (source: docs/decisions/wire-or-cut.md (MCP Apps Host Boundary, 2026-07-30))

**Acceptance criteria**

1. A tool result with an app shows a 'Loading MCP App…' line and then a frame on a deployment with a dedicated sandbox origin.
2. With no dedicated origin in production the card shows the notice and the tool's plain text and never runs the app.
3. A payload over 2 MB is not stored and the message carries text only.
4. Resource HTML over 2 MB shows "This app's content is too large to display." and the plain result.
5. A widget tool call that needs approval shows 'This App wants to run <tool>.'; Deny returns 'The user declined this MCP App tool call.'
6. An app that requests camera or location gets nothing until 'Allow once' is pressed.
7. A resize request of 5000 results in a height of 1000; of 10 results in 180.
8. Another user requesting the payload id gets 404.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Theme changes after load should reach the app [inferred from S58.19 'host context'].
- Mobile 'missing' for S58.17 to S58.23 is accurate for interactivity; mobile shows text only [inferred from code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send host-context updates when theme changes.
- [proposed] Show text fallback for VS Code and Chrome chats rather than only the card fallback headline.
- [proposed] Confirm and apply migration 0173 so the database enforces owner-only reads.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | McpAppCard (web) | `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | Host: payload fetch, AppBridge, sandbox, approvals, resize, fallbacks. |
| component | InteractiveCardBlock (web) | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Registry maps 'mcp-app.v1' to McpAppCard (line 48). |
| service | tool-loop card creation | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs MCP tool, binds tasks, saves payload, builds interactive card (2938-3019). |
| service | mcp-state-store | `apps/web/lib/connectors/mcp-state-store.ts` | saveMcpAppPayload, loadMcpAppPayload, bindMcpTask, isMcpTaskBound. |
| endpoint | GET /api/mcp-apps/payload/[payloadId] | `apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts` | Returns the caller's own payload. |
| endpoint | GET /api/mcp-apps/sandbox | `apps/web/app/api/mcp-apps/sandbox/route.ts` | Relay HTML and CSP for the sandbox origin. |
| endpoint | POST /api/connectors/[connectorId]/mcp | `apps/web/app/api/connectors/[connectorId]/mcp/route.ts` | Widget operations: callTool, readResource, getPrompt, task ops; approval and audit. |
| endpoint | GET /api/connectors/[connectorId]/capabilities | `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Resource and prompt lists for the widget. |
| config | MCP App rules | `packages/ui/unified-chat/src/lib/mcp-app.ts` | 2 MB cap, notices, plain-text extraction shared by web and mobile. |
| schema | McpAppCardBody | `packages/contracts/types/src/interactive-cards.ts` | Card body type (281-286) and union member (409). |
| schema | interactive-cards contract | `packages/contracts/cloud-contracts/src/interactive-cards.ts` | Wire validation of cards. |
| service | MCP app descriptor | `packages/tools/mcp/src/connect.ts` | Reads tool ui resource uri (line 491) and flags app resources (line 691). |
| config | validateMcpAppSandboxOrigin | `apps/web/lib/validate-env.ts` | Startup check of the sandbox origin setting. |
| table | mcp_app_payloads | `apps/web/db/neon/0147_mcp_stateless_cache.sql` | Stores payloads with expiry. |
| table | mcp_task_bindings | `apps/web/db/neon/0147_mcp_stateless_cache.sql` | Who owns an MCP task handle. |
| schema | RLS draft | `apps/web/db/neon/0173_mcp_app_state_row_level_security.sql` | Draft owner-only policies, marked not yet applied. |
| component | McpAppCard (mobile) | `apps/mobile/src/features/chat/components/cards/McpAppCard.tsx` | Text-only result with notice. |
| service | mcpAppPayload (mobile) | `apps/mobile/src/features/chat/services/mcpAppPayload.ts` | Fetches payload and checks identity and account epoch. |
| component | InteractiveCardBlock (mobile) | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Renders the mobile card at line 1103. |
| service | deletion manifest | `apps/web/lib/services/deletion-manifest.ts` | Lists mcp_app_payloads for account deletion (line 58). |
| test | McpAppCard.test.tsx | `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx` | Web card tests. |
| test | sandbox route test | `apps/web/app/api/mcp-apps/sandbox/route.test.ts` | CSP tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The assistant calls an MCP tool; our server runs it on the connector. | our servers | tool-loop.ts:2938-2943 |
| If the result has an app and a user id, the server stores input and result (limit 2 MB) and puts a card with only an opaque payload id and ids in the message. | our servers | tool-loop.ts:2969-3002; mcp-state-store.ts:19-60 |
| The browser fetches the payload by id; the server returns it only to its owner. | device and our servers | McpAppCard.tsx:228-233; payload route.ts:24-26 |
| The browser asks our connector route to read the ui:// resource; our server reads it from the MCP server. | device and our servers | McpAppCard.tsx:249-253; connectors mcp route.ts:99-103 |
| The MCP server supplies the HTML and its declared CSP and permissions. | outside service | McpAppCard.tsx:159-196 |
| The browser loads the relay page from the sandbox origin and runs the app in a nested frame; the handshake passes tool input, result and host context. | device | McpAppCard.tsx:340-372,334-338; sandbox route.ts PROXY_HTML |
| App calls are proxied: callTool (approval first if required), readResource, lists; each hits our connector route and an audit event is recorded. | device and our servers | McpAppCard.tsx:283-322; connectors mcp route.ts:69-80,130-150 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| App payload (tool input and result JSON) | table mcp_app_payloads | server-held; fetched on demand per device | expires after 30 days; listed in the account deletion manifest |
| MCP task binding (user, connector, task id) | table mcp_task_bindings | server only | expires with task ttl when given |
| Audit events data_accessed or tool_executed for widget operations | security audit log | server only | unknown |
| Device grant choice | component state only | no | lost when the card unmounts (McpAppCard.tsx:208-214) |

**Models and providers.** The model decides to call the tool in the normal chat turn (SYS-chat-turn-pipeline); the app itself is not model-driven. No provider-specific behaviour found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; payload and widget calls require a user id (payload route.ts:23; connectors mcp route.ts:60). |
| Permissions | Payload read by owner only; connector tool permission levels allow/ask/deny with critical-tier always asking (connectors mcp route.ts:69-80). Device permissions need 'Allow once'. |
| Subscription | Connector capability is plan-gated and connector release state applies to turns (connector-capability.ts:23-52). Direct gate on the card: none found in the code. |
| Limits and metering | 2 MB payload, 2 MB resource HTML, height 180-1000, 30-day expiry, operation size cap CONNECTOR_MCP_OPERATION_MAX_BYTES, rate limit bucket chat-conversation. No usage metering of app views found. |
| Feature flags | NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN; connector kill switch. |
| Model compatibility | No model dependency found for rendering; whether a model can produce an app tool call depends on tool support (SYS-chat-turn-pipeline). |
| Provider restrictions | none found in the code |
| Local mode | Local mode: the card goes through cloud routes, so it does not work offline or without Cloud sign-in. The mobile card makes no server request outside Managed Cloud and shows the card text (apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1103-1109; McpAppCard.test.tsx 'asks nothing of the server outside Managed Cloud'). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading MCP App…'. | McpAppCard.tsx:407-411 |
| Success | Frame visible after the oninitialized handshake. | McpAppCard.tsx:334-338 |
| Sandbox did not answer in 10 s | Error 'MCP App sandbox did not become ready'. | McpAppCard.tsx:341-345 |
| Payload expired or other user | Error 'This MCP App result expired or is unavailable'; 404 from the API. | McpAppCard.tsx:232; payload route.ts:25 |
| Identity mismatch | Error 'MCP App payload identity mismatch'. | McpAppCard.tsx:234-240 |
| No dedicated sandbox origin in production | Plain text fallback with notice. | McpAppCard.tsx:111-118,242-248 |
| Resource too large | Plain text fallback with notice, logged. | McpAppCard.tsx:177-179,378-386 |
| Resource wrong mime or empty | Error 'The MCP App resource did not return the required HTML MIME type' or 'has no HTML body'. | McpAppCard.tsx:167-176 |
| Approval declined | App receives an error result. | McpAppCard.tsx:293-299 |
| Card unmounts with approval open | Pending approval is resolved as declined and the bridge is closed. | McpAppCard.tsx:393-401 |
| Open link | https only, opens with noopener. | McpAppCard.tsx:323-328 |
| Retry | not handled in the code (no retry button) | McpAppCard.tsx:412-417 |
| Offline | not handled beyond error message | McpAppCard.tsx:388-389 |
| Accessibility | Frame has a title; card sections announce no live region; hidden frame when error. | McpAppCard.tsx:431-441 |
| Mobile | Text only, scroll up to 384 px, label '<tool> result'. | apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:57-110 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx`: Plain result without dedicated origin, framing a dedicated origin, over-cap HTML, byte measurement, device ask sentence and grants, re-asking for new devices.
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Contains an mcp-app.v1 case (lines 139-140); details not fully read.
- `apps/web/app/api/mcp-apps/sandbox/route.test.ts`: Relay shell, no cache, deny-by-default CSP, framing rules, https-only sources, no eval, oversized csp.
- `apps/web/app/api/mcp-apps/payload/[payloadId]/__tests__/route.test.ts`: Rate limit, bad id, 401, 404 for non-owner or expired, no-store response.
- `apps/web/app/api/connectors/[connectorId]/mcp/__tests__/route.test.ts`: Connector operation route; mocks the app payload store.
- `apps/web/app/api/connectors/[connectorId]/mcp/route.critical-tools.test.ts`: Critical tool approval (name matched; details not read).
- `apps/mobile/src/features/chat/components/cards/__tests__/McpAppCard.test.tsx`: Mobile plain text, shared notice, structured fallback, identity mismatch, failure, no request outside Managed Cloud.
- `apps/web/lib/__tests__/validate-env.test.ts`: Matches the sandbox origin check.

**Test scenarios**

- **App renders on a dedicated origin**
  1. Set the sandbox origin to a different https origin.
  2. Use a connector whose tool returns an app.
  3. Ask the assistant to run it.
  - Expected: Loading line then a framed app showing the tool result.
- **No dedicated origin**
  1. Run a production build without the sandbox origin.
  2. Trigger the same tool.
  - Expected: Notice "This app can't be displayed here..." plus plain tool text.
- **Approve a tool call from the app**
  1. Press a button in the app that calls a tool needing approval.
  2. Press 'Allow once', then repeat with 'Deny'.
  - Expected: First call runs; second shows 'The user declined this MCP App tool call.' inside the app.
- **Viewer isolation**
  1. Copy a payload id from user A's chat.
  2. Request /api/mcp-apps/payload/<id> as user B.
  - Expected: 404.
- **Oversize payload**
  1. Use a tool whose result exceeds 2 MB.
  2. Run it.
  - Expected: No card; text in the message; server warning '[mcp-app] payload exceeded the persisted app limit'.
- **Mobile**
  1. Open the same chat in the mobile app signed in to Cloud.
  - Expected: Card with tool text and the unavailable notice, no interactivity.

**Where to look when it fails**

- Server logs '[mcp-app] payload exceeded the persisted app limit', '[mcp-app] could not persist app payload', '[mcp-app] payload read failed', '[mcp-tasks] task binding failed'.
- Browser log '[mcp-app] rendering the plain tool result instead of the app' with reason.
- Table mcp_app_payloads rows and expires_at.
- Audit events data_accessed and tool_executed for connectors.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Mobile has no interactive panel; the brief says missing and the code shows text only.** Affects: Mobile users.. Evidence: apps/mobile/src/features/chat/components/cards/McpAppCard.tsx. Work needed: Native webview host with the same bridge, or accept text-only and mark n/a.
- **VS Code and Chrome do not render the card.** Affects: VS Code and Chrome users.. Evidence: no match under apps/extension-vscode/src or apps/extension/src for mcp-app card code. Work needed: Decide scope; show the card fallback text.
- **Theme changes after load are not forwarded.** Affects: Web and desktop users.. Evidence: McpAppCard.tsx:273-275. Work needed: Send host-context changes.
- **RLS migration 0173 is a draft; store uses the privileged connection.** Affects: All web users (defence in depth).. Evidence: 0173 header; mcp-state-store.ts:48. Work needed: Confirm apply state and move the store to the user-scoped database.
- **No retry control after an error.** Affects: Web and desktop users.. Evidence: McpAppCard.tsx:412-417. Work needed: Add retry.
- **Release state 'coming soon' may hide connector-based apps.** Affects: All users.. Evidence: connector-release.ts:12. Work needed: Verify live.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:mcp_app_payloads
- table:mcp_task_bindings
- api:GET /api/mcp-apps/payload/[payloadId]
- api:GET /api/mcp-apps/sandbox
- api:POST /api/connectors/[connectorId]/mcp
- file:apps/web/features/chat/components/messages/cards/McpAppCard.tsx
- file:packages/ui/unified-chat/src/lib/mcp-app.ts
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-shared-ui-and-design

## Unknown

- Whether migration 0173 has been applied in production.
- Whether card creation is blocked while connectors are 'coming soon'.
- Whether the Tauri desktop renders the card.
- Retention period of the audit events.
- Whether a real MCP App has been run in a live browser (no file records it).

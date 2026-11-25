---
id: "F022-11"
type: "feature"
title: "Live previews and embedded apps"
aliases: ["Live preview", "Artifact preview", "Generated app preview", "Interactive demonstration", "MCP App", "MCP app card", "McpAppCard", "SandboxedIframe", "SafeArtifactPreview", "S22.36", "S22.37", "S22.38"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.36", "S22.37", "S22.38"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "api:GET /api/mcp-apps/sandbox", "api:GET /api/mcp-apps/payload/[payloadId]", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-api-and-contracts", "F022-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-11 Live previews and embedded apps

HTML, React and SVG artifacts run live in a sandboxed frame in the artifact panel on web and desktop, and in a sandboxed web view on mobile, with full screen on both. Third-party MCP app panels render as interactive frames in the web chat; mobile shows only their text result. CLI, VS Code, Chrome have neither.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.36](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2236), [S22.37](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2237), [S22.38](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2238).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs small HTML, React or SVG artifacts live in an isolated frame so a demo, page or app can be used, refreshed, opened in a new tab and expanded. An MCP app card loads a third-party app's interface into a sandboxed frame inside the chat and lets it call the connector's tools after approval. (apps/web/features/chat/components/SandboxedIframe.tsx:380-440; apps/web/features/chat/components/artifacts/artifact-render.ts:11-19; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:200-420)

**Why it exists.** People expect to try a generated page or app without leaving the chat, and connectors can ship their own interface. (doc: area brief S22.36-S22.38)

**Who uses it.** Anyone asking for a demo, mini-app, page or SVG; anyone using a connector that ships an MCP app.

**Problems it solves**

- Generated code can be tried at once, safely isolated from the account.
- Connector apps show their own interface instead of plain text.
- Preview failures show a message rather than a blank frame.

**Use cases**

- Ask for a calculator in HTML and use it in the panel.
- Expand a generated landing page to full screen.
- Use a connector's chart app inside the chat.
- On mobile, open a React demo in a full-screen preview.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): artifact panel Preview tab for html, react and svg artifacts; controls 'Enter fullscreen'/'Exit fullscreen' (title 'Expand'), More menu items 'Refresh preview' and 'Open in new tab' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2352-2366,2937-2940,3565-3567).
- Web chat: MCP app card appears in the reply, text 'Loading MCP App…', 'Allow once' and 'Deny' for tool-call approval (McpAppCard.tsx:430-495).
- Mobile: artifact full-screen viewer with SafeArtifactPreview; inline preview for html/react (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1722; SafeArtifactPreview.tsx:98-99). MCP app card shows the tool's text result only (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:48-54).
- CLI, VS Code, Chrome: none found for live previews; Chrome has no mcp-app entry in its card registry (apps/extension/src/features/side-panel/bubbles.ts:243-249).

**Before you start**

- An artifact of type html, react or svg (ArtifactPreview.tsx:1806; artifact-render.ts:11-14).
- MCP apps need a connected connector whose tool returns an app resource, and the cloud service (the card loads data from /api/mcp-apps/payload).
- Mobile MCP card loads only where managed cloud tiles may load (canLoad = canLoadManagedCloudTiles, mobile InteractiveCardBlock.tsx:1103-1112).

**Screens and controls**

- Web artifact toolbar: Preview and source tabs, fullscreen toggle, More menu with Refresh preview and Open in new tab.
- Web preview frame states: 'Loading preview…' then the frame; a banner when scripts cannot run (SandboxedIframe.tsx:380-415).
- MCP card: loading spinner, error line, fallback text, device-permission ask, 'Allow once' / 'Deny' for app-initiated tool calls (McpAppCard.tsx:430-495).
- Mobile preview: 'Nothing to preview yet.', 'This preview stopped with an error.', 'Open link?' prompt for links (SafeArtifactPreview.tsx:217-240; navigation prompt at 160-170).

**Journey**

1. Ask for a demo or app; the reply creates an html/react/svg artifact.
2. Open the artifact; the Preview tab loads the sandboxed frame.
3. Use the app; press Refresh preview if needed; Enter fullscreen to expand; Open in new tab for a separate page.
4. For an MCP app: the card loads, the app starts, and any tool call it makes asks Allow once or Deny.

**What the person sees and gets**

- Banner 'This artifact's scripts cannot run here...' when scripts are blocked (SandboxedIframe.tsx:392-402).
- MCP fallback to the plain tool result with a notice when the app cannot load or is too large (McpAppCard.tsx:343-348; MCP_APP_TOO_LARGE_MESSAGE).
- Mobile load timeout headline and error text (SafeArtifactPreview.tsx:226-238).

**Settings**

- Environment names NEXT_PUBLIC_SANDBOX_ORIGIN (dedicated sandbox origin for artifacts, apps/web/lib/artifact-sandbox.ts:159) and NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN (McpAppCard.tsx:112). Values not recorded.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/desktop live preview of html, react, svg in a sandboxed iframe; either a dedicated cross-origin sandbox or a srcdoc fallback with sandbox 'allow-scripts allow-modals' (SandboxedIframe.tsx:396-430; artifact-render.ts:25-40).
- Fullscreen with the native Fullscreen API as an enhancement over an in-page expanded layout (ArtifactPreview.tsx:1787-1800).
- Refresh preview and Open in new tab (ArtifactPreview.tsx:2352-2366).
- Web MCP app card with an app bridge, sandbox route, payload route, CSP from the resource, device-permission ask, tool-call approval, https-only link opening (McpAppCard.tsx:200-420; apps/web/app/api/mcp-apps/sandbox/route.ts; apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts).
- Mobile sandboxed preview: scripts run only for html and react kinds; everything else has JavaScript off (SafeArtifactPreview.tsx:98-99,141).
- Mobile MCP card shows text result or a notice (cards/McpAppCard.tsx:48-54).

**Incomplete**

- Mobile MCP apps are not interactive; they show text only. The brief says 'missing'; the code shows a text-only card.
- The mobile preview loads with a timeout and may be reclaimed; recovery is a reload (SafeArtifactPreview.tsx:60-75).
- The brief's code citations for live preview (ArtifactPreview.tsx:511-530, 241) do not point to preview code; the real code is in SandboxedIframe.tsx and artifact-render.ts.

**Present but disconnected or switched off**

- The dedicated sandbox origin is used only when NEXT_PUBLIC_SANDBOX_ORIGIN is set to an https or localhost URL that is not the app's own origin; otherwise the srcdoc fallback is used (artifact-sandbox.ts:159-175).

**Not available**

- CLI, VS Code, Chrome: no live preview and no MCP app card. Chrome registry lists clarify, image, itinerary, map-search and product-comparison only (bubbles.ts:243-249). Mobile: no interactive third-party app panel.

## 4. Required behaviour

**Established requirements**

- Interactive demonstrations (HTML/JS/React) run live and interactively inside the answer or panel. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.36)
- Third-party apps (e.g. MCP apps) render as embedded interactive panels inside the chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.37)
- Generated apps/sites render as a live preview that can be opened or expanded. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.38)
- Mobile runs scripts only for HTML and React kinds in a sandboxed preview. (source: apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:98-99)
- Third-party apps render as a card in the chat on the web. (source: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48)
- Security fails closed; untrusted content stays isolated; Local, BYOK and managed cloud stay separate. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. An html artifact opens in the Preview tab and its scripts run (button clicks change the page).
2. The preview frame cannot read the app's session (null origin or separate origin).
3. Enter fullscreen expands the preview; Exit fullscreen returns it; Esc exits.
4. Refresh preview reloads the frame; Open in new tab opens the page.
5. A script-blocked environment shows the 'scripts cannot run' banner.
6. A web MCP app card loads, shows the app, and an app tool call asks Allow once or Deny; Deny returns 'The user declined this MCP App tool call.'
7. On mobile, an html artifact runs; an svg or markdown artifact has scripts off; a broken preview shows the error view.
8. Opening a link from a mobile preview asks 'Open link?' first.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- MCP apps on mobile need a sandbox frame equal to web's to meet S22.37. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mount the MCP app bridge in a mobile web view with the same approval prompts.
- [proposed] Add a read-only preview to Chrome and VS Code by opening the artifact in the web app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Frame host: cross-origin sandbox or srcdoc fallback, timeouts, script-blocked banner. |
| service | artifact-render | `apps/web/features/chat/components/artifacts/artifact-render.ts` | Builds preview documents for html, react, svg with CSP. |
| service | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Sandbox origin rules and render payload. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Panel with Preview tab, fullscreen, refresh, open in new tab. |
| component | HtmlCodePreview | `packages/ui/unified-chat/src/components/markdown/HtmlCodePreview.tsx` | Shared inline HTML preview in a script-only sandbox (line 63). |
| service | artifact-preview-capability | `packages/ui/unified-chat/src/lib/artifact-preview-capability.ts` | Probe for whether preview scripts can run. |
| component | McpAppCard (web) | `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | App bridge, sandbox frame, tool-call approval, permissions, fallback. |
| endpoint | GET /api/mcp-apps/sandbox | `apps/web/app/api/mcp-apps/sandbox/route.ts` | Serves the sandbox page with a CSP built from the app resource. |
| endpoint | GET /api/mcp-apps/payload/[payloadId] | `apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts` | Returns the stored MCP app payload for the signed-in user. |
| service | mcp-state-store (loadMcpAppPayload) | `apps/web/lib/connectors/mcp-state-store.ts` | Loads the payload by id and user. |
| component | InteractiveCardBlock (web registry) | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Maps mcp-app.v1 to McpAppCard (line 48). |
| schema | McpAppCardBodySchema | `packages/contracts/cloud-contracts/src/interactive-cards.ts` | Validates the mcp-app card body (line 508). |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Mobile sandboxed web view with load timeout, errors and link prompt. |
| service | sandboxedArtifactHtml | `apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts` | Builds the mobile preview document. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile full-screen artifact viewer using the preview (line 1722). |
| component | McpAppCard (mobile) | `apps/mobile/src/features/chat/components/cards/McpAppCard.tsx` | Text-only MCP app result. |
| test | SandboxedIframe.test.tsx | `apps/web/features/chat/components/SandboxedIframe.test.tsx` | Frame host behaviour. |
| test | McpAppCard.test.tsx (web) | `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx` | MCP app card behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model produces an html/react/svg artifact in the reply. | our servers | Chat stream; artifact type check at ArtifactPreview.tsx:1806. Local and own-key paths: unknown. |
| The app builds a preview document (CSP, React runtime) and sanitizes it. | device | artifact-render.ts:25-45; ArtifactPreview.tsx:1201-1210 |
| The frame loads from a dedicated sandbox origin, or from srcdoc with a null origin when none is configured. | device and our servers | SandboxedIframe.tsx:396-430; artifact-sandbox.ts:159-175 (the sandbox origin is a separate host if configured) |
| Artifact code runs inside the frame on the device; the artifact CSP starts from default-src 'none'. | device | ArtifactPreview.tsx:875 |
| For MCP apps, the card fetches the payload, loads the sandbox page, connects the app bridge, and forwards the app's tool calls to the connector endpoint with approved=false, then approved=true after Allow once. | device and our servers | McpAppCard.tsx:228-300; apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts |
| The connector's MCP server runs the tool. | outside service | connectorMcpPath call at McpAppCard.tsx:134 (connector server side not traced) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| MCP app payload (tool input, result, resource reference) | Server MCP state store, read by payload id and user | Fetched on demand; 'private, no-store' response | Expires: route returns 'MCP App payload not found or expired' (payload route.ts) |
| Artifact source | Artifact content in the chat | With the conversation | With the artifact versions |
| App-internal state in the preview | Inside the sandbox frame only | No | Lost on refresh [inferred] |

**Models and providers.** Previews depend on model output only for the code. MCP apps depend on the connector, not on a model provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web artifact panel needs the chat (signed in). Payload route requires a signed-in user (getUserScopedDb) and a rate limit 'chat-conversation'. |
| Permissions | MCP app device permissions (camera, microphone, geolocation, clipboard write) are asked before granting (McpAppCard.tsx:56-66). App-initiated tool calls ask Allow once or Deny. MCP apps may open https links only (McpAppCard.tsx:323-327). |
| Subscription | none found in the code for the preview or the MCP card; connector availability follows SYS-subscriptions-entitlements-and-usage and SYS-connectors-plugins-and-skills. |
| Limits and metering | MCP app resource max size MCP_APP_RESOURCE_MAX_BYTES; height clamped 180 to 1000 pixels (McpAppCard.tsx:277-280); sandbox ready timeout 10 seconds; preview connect timeout 3 seconds, document timeout 15 seconds (SandboxedIframe.tsx:37-38). CSP query limited to 8192 characters and 64 sources per directive (sandbox route.ts:12,40). |
| Feature flags | Environment names NEXT_PUBLIC_SANDBOX_ORIGIN and NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN select dedicated origins; NEXT_PUBLIC_APP_URL sets frame-ancestors in the MCP sandbox page. |
| Model compatibility | Any model that can write html/react/svg. |
| Provider restrictions | none found in the code |
| Local mode | Artifact previews run on the device, so a Local reply that makes an html artifact can be previewed on mobile. [inferred] MCP apps need the cloud (payload route) and, on mobile, managed cloud tiles; Local mode shows the fallback text. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading preview…' until the client owns the handlers; 'Loading MCP App…' for apps. | SandboxedIframe.tsx:382-388; McpAppCard.tsx:430 |
| Scripts blocked | Banner explains the layout is shown without scripts. | SandboxedIframe.tsx:392-402 |
| Timeout | Sandbox connect 3 s then fallback; document 15 s; mobile load timeout headline. | SandboxedIframe.tsx:37-38; SafeArtifactPreview.tsx:226 |
| MCP load failure | Error line or fallback to plain tool result with notice. | McpAppCard.tsx:343-352,437-445 |
| MCP resource too large | Fallback with MCP_APP_TOO_LARGE_MESSAGE. | McpAppCard.tsx:177-178 |
| User denies app tool call | Returns an error result 'The user declined this MCP App tool call.' | McpAppCard.tsx:291-297 |
| Empty content (mobile) | 'Nothing to preview yet.' | SafeArtifactPreview.tsx:217-222 |
| Invalid svg (mobile) | 'This image couldn't be rendered.' | SafeArtifactPreview.tsx:228-231 |
| Fullscreen exit | Esc and the fullscreenchange event reset the state. | ArtifactPreview.tsx:770-789 |
| Offline / reconnect | not handled in the code beyond refresh and error views. | searched SandboxedIframe.tsx and McpAppCard.tsx for online/offline handling; none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/SandboxedIframe.test.tsx`: Frame host behaviour
- `apps/web/features/chat/components/SandboxedIframe.origin.test.tsx`: Sandbox origin rules
- `apps/web/features/chat/components/__tests__/SandboxedIframeRepost.test.tsx`: Reposting the payload to the sandbox
- `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx`: Web MCP app card
- `apps/mobile/src/features/chat/components/cards/__tests__/McpAppCard.test.tsx`: Mobile MCP app text card
- `apps/mobile/__tests__/SafeArtifactPreviewStates.test.tsx`: Mobile preview states
- `apps/mobile/__tests__/SafeArtifactPreviewRuntimeError.test.tsx`: Mobile preview runtime errors
- `apps/mobile/__tests__/SafeArtifactPreviewLinks.test.tsx`: Mobile preview links
- `apps/mobile/__tests__/SafeArtifactPreviewNavigation.test.tsx`: Mobile preview navigation
- `packages/ui/unified-chat/src/components/markdown/__tests__/HtmlCodePreview.test.tsx`: Shared inline HTML preview

**Test scenarios**

- **Run an HTML demo**
  1. Ask 'Make a tip calculator in HTML'.
  2. Open the artifact Preview tab.
  3. Enter numbers and press the button.
  - Expected: The calculator works inside the frame.
- **Fullscreen and refresh**
  1. Press Enter fullscreen, then Esc.
  2. Open More and choose Refresh preview, then Open in new tab.
  - Expected: Expanded layout enters and exits; frame reloads; a new tab opens the page.
- **Isolation**
  1. Ask for a demo that tries to read cookies or the parent page.
  - Expected: Access is blocked (null origin or separate origin); no account data readable.
- **MCP app on web**
  1. Connect a connector that ships an app.
  2. Run its tool in a saved chat.
  3. Use a button in the app that calls a tool.
  - Expected: App renders; an Allow once / Deny prompt appears; Deny gives the declined message.
- **MCP app on mobile**
  1. Run the same tool on mobile.
  - Expected: Text result with a notice, not an interactive app.
- **Mobile preview links**
  1. Open an html artifact on mobile with a link; tap it.
  - Expected: 'Open link?' prompt appears before leaving the preview.

**Where to look when it fails**

- Web: logger error '[mcp-app] rendering the plain tool result instead of the app' with reason, connector and tool names (McpAppCard.tsx:343-350).
- Errors 'MCP App sandbox did not become ready' and 'MCP App payload not found or expired'.
- Sandbox page route /api/mcp-apps/sandbox; payload route /api/mcp-apps/payload/{id}; server store in mcp-state-store.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **Mobile MCP apps are text only.** Affects: Mobile. Evidence: cards/McpAppCard.tsx:48-54. Work needed: Add a web view with the app bridge and approvals, or keep it text and mark the brief partial.
- **No live preview or MCP app on CLI, VS Code, Chrome.** Affects: CLI, VS Code, Chrome. Evidence: bubbles.ts:243-249. Work needed: Decide whether to link out to the web app.
- **Brief code citations for S22.36 and S22.38 point at unrelated lines.** Affects: Brief accuracy. Evidence: ArtifactPreview.tsx:241,511-530. Work needed: Replace with SandboxedIframe.tsx and artifact-render.ts.
- **Dedicated sandbox origin depends on configuration; without it the srcdoc fallback is used.** Affects: Web, desktop. Evidence: artifact-sandbox.ts:159-175. Work needed: Confirm the production value is set (owner knowledge; value not recorded).
- **No record that the preview runs scripts on desktop (Electron) with the real CSP.** Affects: Desktop. Evidence: no record found. Work needed: Run the scenarios on the Electron app.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- api:GET /api/mcp-apps/sandbox
- api:GET /api/mcp-apps/payload/[payloadId]
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-api-and-contracts
- F022-08

## Unknown

- Whether the production sandbox origin is configured.
- Whether Electron enforces the same CSP and sandbox for the preview (not traced).
- Whether MCP apps are limited by plan or connector entitlement.
- Whether artifact state persists across Refresh preview.
- Whether mobile preview works fully offline for React artifacts (runtime source not traced).

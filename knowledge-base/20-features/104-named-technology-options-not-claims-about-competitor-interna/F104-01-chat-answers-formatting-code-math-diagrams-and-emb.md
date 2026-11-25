---
id: "F104-01"
type: "feature"
title: "Chat answers: formatting, code, math, diagrams and embedded app cards"
aliases: ["Markdown renderer", "MarkdownContent", "StreamingMarkdownContent", "answer renderer", "KaTeX math", "Shiki code highlighting", "Mermaid diagram block", "MCP App card", "mcp-app.v1 interactive card", "Interactive connector result"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.02", "S104.03"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-connectors-plugins-and-skills", "SYS-shared-ui-and-design", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "surface:web", "surface:mobile", "surface:chrome", "surface:vscode", "surface:desktop", "mode:cloud", "mode:local", "table:mcp_app_payloads", "api:GET /api/mcp-apps/sandbox", "api:GET /api/mcp-apps/payload/[payloadId]", "file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-01 Chat answers: formatting, code, math, diagrams and embedded app cards

Turns the assistant's streamed text into a readable answer: sanitized Markdown, highlighted code, typeset math and Mermaid diagrams, plus small connector app cards. On web the app card runs in a sandboxed frame on a separate origin; on mobile it shows only the tool's text result. The chat renderer is shared code; each app has its own wiring.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.02](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10402), [S104.03](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10403).

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

**What it does.** Parses answer text as Markdown, strips unsafe HTML, highlights code with a Shiki-based highlighter, typesets math with KaTeX, draws Mermaid diagrams on first use, and shows connector 'MCP App' cards in an isolated frame (web) or as plain result text (mobile). (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:2-5, 57, 820-823)

**Why it exists.** Answers from any model must display the same way and must never run unsafe markup. Connector tools can return small interactive apps; those must run apart from the main app so they cannot read the user's session. (apps/web/app/api/mcp-apps/sandbox/route.ts:80-97)

**Who uses it.** Every person reading chat answers on web, the hosted-web desktop window, mobile, the Chrome side panel and the VS Code webview. Connector users see app cards.

**Problems it solves**

- Raw Markdown or LaTeX shown as plain symbols.
- Unsafe HTML or SVG from a model reaching the page (sanitizer schema: packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts:1-36; Mermaid output passed through sanitizeSvg: MermaidDiagram.tsx:~232).
- Half-written diagrams and formulas flashing errors while an answer streams (MermaidDiagram.tsx looksComplete; MarkdownContent.tsx:748).
- Third-party app code touching the host page (iframe sandbox without same-origin: sandbox/route.ts:84).

**Use cases**

- Ask for a worked physics answer and read the formulas typeset.
- Ask for a flowchart and read it as a diagram, with the source kept if drawing fails.
- Read a code answer with highlighted, copyable code blocks.
- A connected tool returns an app; on web the person clicks inside the card; on mobile they read the text result.

## 2. User experience

**Where to find it**

- Web chat message list: the answer body (apps/web/features/chat/components/messages/MessageBubble.tsx:157-165, 2884-2895).
- Desktop (Electron): shows the hosted web app, so the same web renderer (AGENTS.md section 5).
- Mobile: chat message renderer MessageContentRenderer with MathBlock and MermaidDiagramBlock (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:8-9, 1538-1559; MathBlock.tsx).
- Chrome side panel: its own markdown-it pipeline using shared highlighter and math helpers (apps/extension/src/features/side-panel/markdown.ts:1-19).
- VS Code webview: markdown-it with math helper, html disabled (apps/extension-vscode/src/webview/render.ts:1-24).

**Before you start**

- A chat answer. Web app cards also need a connector that returns an app and a deployed separate sandbox origin in production (McpAppCard.tsx:111-118).
- No subscription is needed to render (none found in the code).

**Screens and controls**

- Code block: 'Copy code' button and a download button labelled 'Download {{fileName}}' (CodeBlock.tsx:116-159).
- Diagram: 'Show source' / 'Hide source', 'Copy diagram source', 'Expand diagram' dialog titled 'Diagram' with 'Close' (MermaidDiagram.tsx:~255-330).
- App card: loading text 'Loading MCP App…', an approval prompt before a tool call, and a device-permission ask (McpAppCard.tsx:~404-445).
- Mobile app card: text result or messages 'This MCP App result expired or is unavailable.' and 'The tool returned no text to show.' (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:12-13).

**Journey**

1. Send a message.
2. The answer streams in; text appears as Markdown. Unfinished math is hidden and unfinished diagrams wait (MarkdownContent.tsx:748; MermaidDiagram.tsx:208).
3. Code blocks highlight when the highlighter loads; until then plain code shows (HighlightedCode.tsx:~58).
4. When the turn finishes, a diagram that is complete is drawn; one that cannot be drawn shows a notice and keeps its source (MermaidDiagram.tsx:~340-352).
5. If a connector returned an app, the card loads the stored payload, reads the app page, opens the sandbox frame and connects the bridge (McpAppCard.tsx:~225-370).

**What the person sees and gets**

- Diagram failure text: 'This diagram could not be drawn: <reason>. Its source is kept below.' (MermaidDiagram.tsx:~345).
- Diagram drawing text: 'Drawing diagram…' (MermaidDiagram.tsx:~365).
- Sandbox missing: 'This app can't be displayed here, so the tool's result is shown instead.' with the code sandbox_origin_unavailable logged (packages/ui/unified-chat/src/lib/mcp-app.ts:3-4; McpAppCard.tsx:242-248).
- Image that fails: 'Image failed to load' with retry (MarkdownContent.tsx:~63-80).

**Settings**

- Code theme (read through getCodeTheme in HighlightedCode.tsx:~28); where the control lives is unknown.
- MCP App device permissions (camera, microphone, location, clipboard write) ask the person first (McpAppCard.tsx:255-268; sandbox/route.ts:80).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Markdown + raw HTML parsed then sanitized then KaTeX, in that order (MarkdownContent.tsx:818-823).
- KaTeX stylesheet imported with the component (MarkdownContent.tsx:57).
- Math delimiters normalised so one-line $$ blocks become display math (preprocessMath.ts:1-22).
- Shiki highlighter with lazy language loaders and a bounded cache (shikiHighlighter.ts:6-40, 133-160).
- Mermaid loaded on first diagram via dynamic import with strict security level, no HTML labels (MermaidDiagram.tsx:~38-50, 135-140).
- MCP App flow on web: tool result stored in a table with a 2 MB cap and a 30-day expiry, card fetched by id, resource read, sandbox frame, JSON-RPC bridge, approval for tool calls (apps/web/lib/connectors/mcp-state-store.ts:10-11, 22-60; tool-loop.ts:2969-3000; McpAppCard.tsx:120-370).
- Sandbox route: inner frame sandbox 'allow-scripts allow-forms', page CSP built from allow-listed https/wss domains, no-store caching (sandbox/route.ts:49-97, 100-118).
- Mobile renders math in a WebView with a locked content policy and embedded KaTeX styles (MathBlock.tsx:21-23; apps/mobile/scripts/vendor-katex-math-styles.cjs).
- Chrome extension and VS Code highlight code and typeset math through shared helpers (extension markdown.ts:1-19; vscode render.ts:1-24).

**Incomplete**

- Chrome side panel and VS Code webview have no Mermaid rendering in answers; only an artifact-type label for mermaid exists (grep of apps/extension/src and apps/extension-vscode/src: artifactPanel.ts:256-291, artifactPresentation.ts:15,51).
- Mobile never opens the app itself; the card only fetches and shows the tool's text (apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:1-30).

**Present but disconnected or switched off**

- In a production web build, if no separate sandbox origin is configured the app card is switched off and falls back to text (McpAppCard.tsx:111-118).

**Not available**

- Interactive MCP App frame on mobile, Chrome and VS Code (mobile shows text; the chat fallback tells people to use a compatible web client: tool-loop.ts:2985-2988). Chrome and VS Code card support: none found in the code (grep 'mcp-app.v1' found only web, mobile, shared packages).

## 4. Required behaviour

**Established requirements**

- S104.03: answers are parsed as Markdown and sanitized before rendering. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.03)
- S104.02: code blocks are highlighted by a highlighter engine in the mounted renderer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.02)
- T07: math is typeset with KaTeX in the mounted chat renderer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.02, S104.03)
- T06: Mermaid code blocks render as diagrams in the mounted chat renderer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.02, S104.03)
- T12: connector tools that return an MCP App render it inline in an isolated sandbox frame driven by a JSON-RPC bridge. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.02, S104.03)
- If a capability such as live voice is unavailable, the UI says so without broken controls. (source: (doc: docs/product/requirements.md M-VOICE-004))
- Local mode must fail closed and never silently route to remote compute. (source: (doc: docs/product/requirements.md section 7.1))

**Acceptance criteria**

1. A reply containing <script> or an onerror attribute shows no running script and no broken layout.
2. A reply with $$ x^2 $$ and \( a+b \) shows typeset math; a malformed formula never leaves a visible error flash while still streaming.
3. A reply with a closed ```mermaid block shows a diagram with 'Show source', 'Copy diagram source' and 'Expand diagram'.
4. A reply with an invalid diagram shows 'This diagram could not be drawn' and the source.
5. A fenced code block with a known language is coloured and copyable; with an unknown language it still shows as plain code.
6. On web production without a sandbox origin an MCP App card shows the plain tool result and the notice text.
7. An MCP App tool call from the frame asks the person before it runs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Rendering is independent of mode (Local, own key, Cloud) because it runs on the client over text already received [inferred].
- A connector app card is only produced in Cloud turns because it is created in the Cloud tool loop on the server [inferred from tool-loop.ts:2969-3000].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an empty-state and error-state spec for formulas, since the brief lists it as not verified.
- [proposed] Show Mermaid in the Chrome and VS Code answer renderers or label the code block clearly as a diagram source.
- [proposed] Let mobile open the app card in a locked WebView or label it 'Open on web'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Markdown to React with remark and rehype plugins: raw HTML, sanitize, KaTeX (lines 818-823, 940-946). |
| component | StreamingMarkdownContent | `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` | Renders an unfinished answer, holding back open tables, links and math. |
| config | MARKDOWN_SANITIZE_SCHEMA | `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts` | Allow-list of tags and attributes; prefixes ids. |
| service | preprocessMath | `packages/ui/unified-chat/src/components/markdown/preprocessMath.ts` | Normalises math delimiters before parsing. |
| service | shikiHighlighter | `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts` | Lazy-loaded languages and themes, JS regex engine, line cache. |
| component | HighlightedCode | `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Shows plain code, then swaps in highlighted tokens; reports a client failure on error. |
| component | CodeBlock | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Copy, download and edit controls around code. |
| component | MermaidDiagram | `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` | Lazy Mermaid load, SVG sanitize, cache, source toggle, expand dialog, failure notice. |
| service | mermaidExternalResource | `packages/ui/unified-chat/src/components/markdown/mermaidExternalResources.ts` | Refuses diagrams that reference outside resources (used at MermaidDiagram.tsx:~218). |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Mounts the renderer lazily (lines 157-165, 2884-2895, 3218-3229). |
| component | InteractiveCardBlock | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Picks the card for kind 'mcp-app.v1'. |
| component | McpAppCard (web) | `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | Fetches payload, reads resource, builds sandbox frame and bridge, approvals, fallback. |
| endpoint | GET /api/mcp-apps/sandbox | `apps/web/app/api/mcp-apps/sandbox/route.ts` | Serves the proxy page with a built Content-Security-Policy. |
| endpoint | GET /api/mcp-apps/payload/[payloadId] | `apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts` | Returns the stored app payload for the signed-in user, no-store. |
| table | mcp_app_payloads | `apps/web/db/neon/0147_mcp_stateless_cache.sql` | Stores app tool results with expiry (create at line 42). |
| service | saveMcpAppPayload | `apps/web/lib/connectors/mcp-state-store.ts` | Inserts the payload, refuses over 2 MB. |
| service | tool-loop interactive card | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Creates the 'mcp-app.v1' card when a connector result carries an app (2969-3000). |
| service | mcp-app helpers | `packages/ui/unified-chat/src/lib/mcp-app.ts` | Size limit, fallback messages, plain-text result. |
| component | McpAppCard (mobile) | `apps/mobile/src/features/chat/components/cards/McpAppCard.tsx` | Shows the tool's text result only. |
| component | MathBlock | `apps/mobile/src/features/chat/components/MathBlock.tsx` | Typesets math in a locked WebView on the device. |
| component | MermaidDiagramBlock | `apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx` | Draws diagrams on mobile through a sandboxed drawing page. |
| service | extension markdown | `apps/extension/src/features/side-panel/markdown.ts` | markdown-it plus DOMPurify, math and highlighter for the Chrome side panel. |
| service | vscode render | `apps/extension-vscode/src/webview/render.ts` | markdown-it with html off plus DOMPurify and math for the webview. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Answer text arrives over the stream and is held in client state. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:2884-2895 |
| Math is normalised, Markdown parsed, raw HTML sanitized, KaTeX applied. | device | MarkdownContent.tsx:818-823; preprocessMath.ts:1-22 |
| Code is highlighted after the highlighter and language module load. | device | HighlightedCode.tsx:35-55; shikiHighlighter.ts:6-40 |
| Mermaid module is imported on first diagram; the SVG is built in an offscreen host, sanitized, cached (32 entries). | device | MermaidDiagram.tsx:~108-140,225-245 |
| Connector tool runs in the Cloud tool loop; if it returns an app, the server stores the payload and adds an 'mcp-app.v1' card to the turn. | our servers | tool-loop.ts:2969-3000; mcp-state-store.ts:22-60 |
| The card fetches the payload and reads the app page through the connector endpoint, which contacts the connector's server. | device and our servers | McpAppCard.tsx:129-150,225-253 |
| The app runs in an iframe from the sandbox origin; its tool calls go back through the bridge and the connector endpoint, with person approval. | outside service | McpAppCard.tsx:280-330; sandbox/route.ts:80-97 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| MCP App payload (tool input and result) | Postgres table mcp_app_payloads | Read by the same signed-in user on any web client | Expires 30 days after creation (mcp-state-store.ts:10, 54); deletion job: unknown |
| Diagram SVG cache | In-memory on the device, 32 entries | no | Lost on page reload (MermaidDiagram.tsx:~108-120) |
| Highlight cache | In-memory on the device | no | Bounded cache, cleared by clearHighlightCache (shikiHighlighter.ts:160-171) |

**Models and providers.** Rendering does not call any model or provider. The text it shows can come from any model in any mode. Connector apps come from the connector's own server, not a model provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rendering needs no account. The app card payload route needs a signed-in user (apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts:20-28). |
| Permissions | Device permissions (camera, microphone, geolocation, clipboard write) are asked before the frame gets them; tool calls from an app can need approval (McpAppCard.tsx:255-268,300-318). |
| Subscription | none found in the code for rendering. Connector availability follows the connector rules (see SYS-connectors-plugins-and-skills). |
| Limits and metering | App payload at most 2 MB (mcp-state-store.ts:11); app resource at most 2 MB (packages/ui/unified-chat/src/lib/mcp-app.ts:1); only https links may be opened (McpAppCard.tsx:~345). Rendering is not metered. |
| Feature flags | NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN picks the sandbox origin; NEXT_PUBLIC_APP_URL feeds frame-ancestors (McpAppCard.tsx:111-113; sandbox/route.ts:34-45). No feature flag found. |
| Model compatibility | Works with any model that produces text. Whether a model writes Mermaid or LaTeX well is outside this feature. |
| Provider restrictions | none found in the code |
| Local mode | Markdown, code, math and diagrams render on the device in Local mode (mobile MathBlock and diagram block are on-device). Connector apps are Cloud only because the card is created in the Cloud tool loop (tool-loop.ts:2969-3000) [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | App card shows a spinner and 'Loading MCP App…'; diagram shows 'Drawing diagram…' with source below. | McpAppCard.tsx:~404; MermaidDiagram.tsx:~365 |
| Streaming | Incomplete math errors are hidden; diagrams are not compiled until brackets balance. | MarkdownContent.tsx:748; MermaidDiagram.tsx:~178-190,208 |
| Diagram error | Shows the first line of the error plus kept source and copy control. | MermaidDiagram.tsx:~335-352 |
| Diagram has no displayable content | Treated as failed, client failure reported. | MermaidDiagram.tsx:~236-243 |
| Math formula fails after the answer is done | Not handled in the code beyond KaTeX's own error span; what a person sees is not verified. | MarkdownContent.tsx:748 (only the streaming case is hidden) |
| Highlighter fails | Plain code stays; a client failure is reported. | HighlightedCode.tsx:46-49,58 |
| App payload expired or identity mismatch | Web shows an error line; mobile shows 'This MCP App result expired or is unavailable.' | McpAppCard.tsx:~228-237; apps/mobile/.../McpAppCard.tsx:12 |
| Sandbox origin missing (production) | Plain tool result with notice; error code sandbox_origin_unavailable logged. | McpAppCard.tsx:111-118,242-248,~375-385 |
| Tool call needs approval and person declines | Returns an error result 'The user declined this MCP App tool call.' | McpAppCard.tsx:~306-314 |
| Accessibility | Diagram region has role region, label 'Diagram' and is focusable; copy buttons have labels; iframe has a title. | MermaidDiagram.tsx:~255-262; McpAppCard.tsx:~425 |
| Offline | Already shown text keeps rendering; app cards need the network. Retry control on the app card: not handled in the code. | McpAppCard.tsx:~404-445 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.test.tsx`: Draws, sanitizes, keeps source on failure, waits while streaming.
- `packages/ui/unified-chat/src/components/markdown/__tests__/MermaidDiagram.externalResources.test.tsx`: Refusal of external resources in diagrams.
- `packages/ui/unified-chat/src/components/markdown/__tests__/MathRendering.test.tsx`: Math rendering.
- `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.test.ts`: Sanitizer allow-list.
- `packages/ui/unified-chat/src/components/markdown/preprocessMath.test.ts`: Delimiter normalisation.
- `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.test.ts`: Highlighter.
- `packages/ui/unified-chat/src/components/markdown/__tests__/CodeBlock.test.tsx`: Code block controls.
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Markdown render.
- `apps/web/features/chat/components/messages/MessageBubble.math.test.tsx`: Math in the web message bubble.
- `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx`: Web app card including the sandbox-unavailable message.
- `apps/web/app/api/mcp-apps/sandbox/route.test.ts`: Sandbox page and CSP.
- `apps/web/app/api/mcp-apps/payload/[payloadId]/__tests__/route.test.ts`: Payload route.
- `apps/mobile/src/features/chat/components/cards/__tests__/McpAppCard.test.tsx`: Mobile text-only app card.
- `apps/mobile/__tests__/MathBlockOffline.test.tsx`: Mobile math works offline.
- `apps/mobile/__tests__/MermaidDiagramViewing.test.tsx`: Mobile diagram viewing.
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: Chrome side panel markdown parity.

**Test scenarios**

- **Unsafe HTML in an answer**
  1. Ask the model to reply with a <script> tag and an <img onerror> tag.
  2. Read the answer.
  - Expected: No script runs; no alert; text or inert markup only.
- **Streaming diagram**
  1. Ask for a flowchart.
  2. Watch while it streams.
  - Expected: Source shows; no error; after the end the diagram appears with the three controls.
- **Broken diagram**
  1. Ask for a diagram with deliberately invalid syntax.
  - Expected: 'This diagram could not be drawn' with reason and source.
- **Formula typesetting**
  1. Ask for the quadratic formula in LaTeX display form.
  2. Repeat on mobile in Local mode with the network off.
  - Expected: Typeset formula on both; mobile works offline.
- **Sandbox missing**
  1. Run a production-mode web build without a separate sandbox origin.
  2. Trigger a connector that returns an app.
  - Expected: Plain result text and the unavailable notice.
- **Approval**
  1. In an app card, press a control that calls a connector tool.
  - Expected: An approval prompt; Decline gives 'The user declined this MCP App tool call.'

**Where to look when it fails**

- Client failure reports with failure 'mermaid_render' (detail parse or render) and 'markdown_render' (client-failures).
- Server log '[mcp-app] rendering the plain tool result instead of the app' with reason sandbox_origin_unavailable (McpAppCard.tsx:~376).
- Server warning '[mcp-app] payload exceeded the persisted app limit' (mcp-state-store.ts:33).
- Table mcp_app_payloads.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief marks S104.02 and S104.03 'platform done' with one status; no per-app status exists. Chrome and VS Code lack Mermaid in answers; mobile cannot run app cards.** Affects: Chrome, VS Code, mobile. Evidence: extension and vscode source grep; apps/mobile/.../McpAppCard.tsx:1-30. Work needed: Record per-app status; decide whether to add Mermaid and app support or label them unsupported.
- **Failed-formula and empty-answer states are not specified or tested.** Affects: All apps. Evidence: MarkdownContent.tsx:748 handles only streaming. Work needed: Define visible behaviour; add a test.
- **The brief cites tool-loop.ts:2146 for the app card; that line is stream parsing. The card code is at 2969-3000.** Affects: Documentation accuracy. Evidence: tool-loop.ts:2130-2160 vs 2969-3000. Work needed: Correct the brief's references.
- **No retry control on a failed app card.** Affects: Web. Evidence: McpAppCard.tsx:~404-445. Work needed: Add retry or explain.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-connectors-plugins-and-skills
- SYS-shared-ui-and-design
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- surface:web
- surface:mobile
- surface:chrome
- surface:vscode
- surface:desktop
- mode:cloud
- mode:local
- table:mcp_app_payloads
- api:GET /api/mcp-apps/sandbox
- api:GET /api/mcp-apps/payload/[payloadId]
- file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx

## Unknown

- What a person sees when a formula fails after streaming ends.
- Where the code theme choice is set in the interface.
- Whether any job deletes expired mcp_app_payloads rows.
- Whether the production deployment sets a separate sandbox origin (deployment config not in the repo files read).
- Chrome and VS Code behaviour for 'mcp-app.v1' cards beyond the grep.

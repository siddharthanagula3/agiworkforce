---
id: "F104-99"
type: "feature"
title: "Other items in Named technology options-not claims about competitor internals"
aliases: ["Other items in Named technology options-not claims about competitor internals", "platform technology items S104.T01 to S104.T12"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.T01", "S104.T02", "S104.T03", "S104.T04", "S104.T05", "S104.T06", "S104.T07", "S104.T08", "S104.T09", "S104.T10", "S104.T11", "S104.T12"]
depends_on: ["surface:web", "surface:cli", "surface:desktop", "SYS-shared-ui-and-design", "SYS-data-model-and-migrations", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "file:apps/web/package.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-99 Other items in Named technology options-not claims about competitor internals

Twelve technology-choice items: Next.js with React, shared Radix-based UI primitives, Tiptap editor, TanStack Query, Mermaid, KaTeX, PDF handling, the Rust CLI split, PostgreSQL storage and MCP app cards are present. Yjs co-editing is missing. xterm.js is present in code though the brief says not applicable.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.T01](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t01), [S104.T02](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t02), [S104.T03](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t03), [S104.T04](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t04), [S104.T05](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t05), [S104.T06](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t06), [S104.T07](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t07), [S104.T08](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t08), [S104.T09](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t09), [S104.T10](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t10), [S104.T11](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t11), [S104.T12](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s104t12).

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

**What it does.** Records which named libraries and architectures the product uses and whether each is wired to a screen.

**Why it exists.** The area states technology options as product requirements, without claims about competitors (doc: knowledge-base/data/area-briefs/104-named-technology-options-not-claims-about-competitor-interna.md).

**Who uses it.** Engineers and testers checking that the stack matches the plan; product owners checking gaps.

**Problems it solves**

- One place to see each technology, its status and where it lives.
- Surfaces disagreements between the brief and the code.

**Use cases**

- Check whether collaborative editing exists (it does not).
- Find where math and diagrams render.
- Confirm where the Rust CLI separates its front end from the app server.

## 2. User experience

**Where to find it**

- Web chat answers render Markdown, math (KaTeX) and diagrams (Mermaid) through the shared chat renderer (MarkdownContent.tsx:3,57,730,822).
- Web artifacts: document editor (Tiptap), PDF iframe viewer (ArtifactPreview.tsx:2002-2014).
- Web Code page: terminal view through xterm inside the desktop host (LocalPtyTerminal.tsx:4,96; LocalTerminal.tsx:559).
- CLI: terminal UI and app-server crate (apps/cli/Cargo.toml:41,83-84).

**Before you start**

- Signed-in web account for chat; desktop host for the terminal view [inferred from useDesktopHost use] (LocalPtyTerminal.tsx:15).

**Screens and controls**

- Document editor toolbar, PDF frame, chat code and diagram blocks, MCP app card in a sandbox frame (McpAppCard.tsx:102-113).

**Journey**

1. Chat returns Markdown; the renderer sanitizes it and typesets math and diagrams.
2. A document artifact opens in the Tiptap editor.
3. An MCP connector tool that returns an app shows a card in an isolated iframe.

**What the person sees and gets**

- Rendered math, diagrams and highlighted code in answers.
- Fallback when the MCP app sandbox origin is unavailable or the resource is too large (McpAppCard.tsx:102-110).

**Settings**

- none found in the code for these libraries as user settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- S104.T01 React with Next.js: next ^16.4.5 and react 19.3.0 (apps/web/package.json:148,156); layout imports Next (apps/web/app/layout.tsx:1-2).
- S104.T02 UI primitives: shared package wraps Radix dialog (packages/ui/ui/src/primitives/Dialog.tsx:4,8); Popover is used in WebChatPage (apps/web/features/chat/pages/WebChatPage.tsx:230-231).
- S104.T03 Tiptap: editor built with useEditor and the Markdown extension (ArtifactDocumentEditor.tsx:4-5,27); packages listed (apps/web/package.json:112-118).
- S104.T04 TanStack Query: QueryClient created and QueryClientProvider exported as QueryProvider (apps/web/shared/stores/query-client.ts:2,48,118); mounted in ProductRuntimeProviders.tsx:6,13.
- S104.T06 Mermaid: lazy-loaded renderer (MermaidDiagram.tsx:135-142); chat renderer routes 'mermaid' fences to it (MarkdownContent.tsx:730).
- S104.T07 KaTeX: rehype-katex plugin and CSS in the chat renderer (MarkdownContent.tsx:3,57,822); sanitizer rehype-sanitize in the same file (MarkdownContent.tsx:5).
- S104.T08 PDF: server-side PDF text and page-image parsing uses pdfjs-dist (pdf-attachment-content.ts:156,196,231); in-product PDF viewing is a framed document, not a PDF.js viewer (ArtifactPreview.tsx:2002-2014).
- S104.T10 CLI: a library crate for the app server is a dependency and a module (apps/cli/Cargo.toml:41; apps/cli/src/lib.rs:109); terminal UI crates ratatui and crossterm are dependencies (Cargo.toml:83-84); app_server.rs describes stdio and WebSocket developer-session transports and an MCP stdio server (app_server.rs:1-12).
- S104.T11 PostgreSQL: NeonDatabaseAdapter implements the data-layer interface over the Neon serverless driver (packages/platform/data-layer/src/adapters/neon.ts:54,287).
- S104.T12 MCP app: the chat tool loop saves an MCP app payload and emits a card of kind 'mcp-app.v1' (tool-loop.ts:2971-2983); the web card loads a sandbox page at /api/mcp-apps/sandbox in an iframe (McpAppCard.tsx:113; app/api/mcp-apps/sandbox/route.ts).

**Incomplete**

- S104.T08: brief says PDFs open in PDF.js; code frames the PDF URL in an iframe (conflict).
- Line numbers in the brief for T02, T03, T04, T06, T07, T08 and T10 point at unrelated lines now; file-level claims hold, line citations drifted (checked 2026-11-24).

**Present but disconnected or switched off**

- S104.T09 xterm.js: brief says not applicable anywhere, but xterm is a dependency and used in a web terminal view that needs the desktop host (apps/web/package.json:121-123; LocalPtyTerminal.tsx:4,96) and in the desktop Tauri code (apps/desktop/src/features/terminal/Terminal.tsx).

**Not available**

- S104.T05 Yjs: no yjs, y-websocket or y-prosemirror import or dependency found in any .ts, .tsx or package.json under apps and packages. Co-editing is missing.

## 4. Required behaviour

**Established requirements**

- Web is built with React on Next.js. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.T01, S104.T02, S104.T03, S104.T04, S104.T05, S104.T06, S104.T07, S104.T08, S104.T09, S104.T10, S104.T11, S104.T12)
- Web UI uses a shared shadcn-style primitive library over Radix. (source: S104.T02 (same brief))
- Rich documents are edited in an embedded rich-text engine. (source: S104.T03 (same brief))
- Web server state is fetched through TanStack Query with a mounted provider. (source: S104.T04 (same brief))
- Documents can be co-edited live through a CRDT engine. (source: S104.T05 (same brief); status platform missing)
- Mermaid blocks render as diagrams. (source: S104.T06 (same brief))
- Math is typeset with KaTeX. (source: S104.T07 (same brief))
- PDFs open in an in-product viewer backed by a PDF engine, and PDF text is parsed by a PDF engine. (source: S104.T08 (same brief))
- A terminal UI is shown in the browser or desktop product. (source: S104.T09 (same brief), status not applicable anywhere, conflicts with code)
- The CLI separates a Rust terminal front end from its agent runtime, which also serves other clients as an app-server. (source: S104.T10 (same brief))
- Application data lives in PostgreSQL (Neon) through the data-layer adapter. (source: S104.T11 (same brief))
- Connector tools that return an MCP App render it inline in an isolated sandbox iframe. (source: S104.T12 (same brief))

**Acceptance criteria**

1. A Mermaid fence in an answer renders as a diagram, and invalid Mermaid does not break the message.
2. A formula in an answer shows typeset math.
3. A document artifact opens in the Tiptap editor and edits save.
4. A PDF artifact displays in the framed viewer only for same-origin or verified blob sources.
5. A connector returning an MCP app shows an isolated card; with no sandbox origin it shows a fallback.
6. Two people editing one document see each other's changes (currently fails: not built).
7. The terminal view opens only where the desktop host exists.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- xterm terminal is available only inside the desktop host [inferred] (LocalPtyTerminal.tsx:15-20).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief: T09 status, T08 viewer wording, and refresh the line references.
- [proposed] Decide whether T05 co-editing is on the plan or should be removed from the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | web package manifest | `apps/web/package.json` | Next, React, Tiptap, TanStack Query, Mermaid, KaTeX, pdfjs-dist, xterm versions. |
| component | root layout | `apps/web/app/layout.tsx` | Next app shell. |
| component | Dialog primitive | `packages/ui/ui/src/primitives/Dialog.tsx` | Shared Radix wrapper. |
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Tiptap editor. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | PDF frame and other artifact viewers. |
| store | query-client | `apps/web/shared/stores/query-client.ts` | QueryClient and provider. |
| component | ProductRuntimeProviders | `apps/web/app/ProductRuntimeProviders.tsx` | Mounts QueryProvider. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Markdown, sanitize, KaTeX, code and Mermaid routing. |
| component | MermaidDiagram | `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` | Mermaid render. |
| service | pdf-attachment-content | `apps/web/lib/server/pdf-attachment-content.ts` | Server PDF text and page images via pdfjs-dist. |
| component | LocalPtyTerminal | `apps/web/features/code/components/LocalPtyTerminal.tsx` | xterm terminal bound to the desktop host. |
| component | desktop Terminal | `apps/desktop/src/features/terminal/Terminal.tsx` | Tauri-build terminal (retained internal code). |
| config | CLI manifest | `apps/cli/Cargo.toml` | App-server crate, ratatui and crossterm. |
| service | CLI app_server | `apps/cli/src/app_server.rs` | CLI engine host for stdio and WebSocket transports and MCP server. |
| service | app-server crate | `crates/agiworkforce-app-server` | Shared app-server library. |
| service | NeonDatabaseAdapter | `packages/platform/data-layer/src/adapters/neon.ts` | Postgres adapter. |
| component | McpAppCard | `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | Inline MCP app in sandbox iframe. |
| endpoint | /api/mcp-apps/sandbox | `apps/web/app/api/mcp-apps/sandbox/route.ts` | Sandbox host page. |
| service | tool-loop MCP app payload | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Saves payload and emits card. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat answer streams to the page; the markdown component sanitizes and renders math, diagrams and code. | device | MarkdownContent.tsx:3,5,730,822 |
| Mermaid library loads on demand in the browser. | device | MermaidDiagram.tsx:135-142 |
| Server tool loop saves an MCP app payload and sends a card. | our servers | tool-loop.ts:2971-2983 |
| The card creates an iframe pointed at the sandbox route. | device | McpAppCard.tsx:113 |
| Server reads uploaded PDFs with pdfjs-dist to extract text for the model. | our servers | pdf-attachment-content.ts:231-232 |
| Data queries run through the Neon adapter. | our servers | neon.ts:287 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| MCP app payload | connector state store (saveMcpAppPayload) | Server only | unknown |
| Application data | Neon PostgreSQL | Server is the source for Cloud | Per feature; see F104-07 and F104-08. |

**Models and providers.** Rendering libraries use no model. The MCP app flow depends on connector tools called by the chat model (tool-loop.ts:2971). PDF extraction can feed page images to a vision-capable model (pdf-attachment-content.ts:89).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rendering needs no account beyond chat access; MCP apps need connectors tied to an account. |
| Permissions | MCP app runs in an isolated frame; sandbox origin must be configured (McpAppCard.tsx:102-113). |
| Subscription | none found in the code for these libraries; connector and chat limits apply elsewhere. |
| Limits and metering | MCP resource too large triggers a fallback (McpAppCard.tsx:102-110); PDF text is truncated by MAX_FILE_TEXT_CHARS (pdf-attachment-content.ts:144). |
| Feature flags | none found in the code for these libraries. |
| Model compatibility | Any model that produces Markdown; MCP app depends on tool calling. |
| Provider restrictions | none found in the code. |
| Local mode | Rendering is on the device and works in any mode. Local-mode PDF parsing and MCP behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| MCP sandbox origin missing | Falls back (reason sandbox_origin_unavailable). | McpAppCard.tsx:102-110 |
| MCP resource too large | Falls back (reason resource_too_large). | McpAppCard.tsx:102-110 |
| PDF blob of wrong type | Not rendered; error state. | ArtifactPreview.tsx:839-864,2002 |
| Streaming math error | A katex-error is hidden while streaming. | MarkdownContent.tsx:748 |
| Streaming Mermaid fence | Handled specially while incomplete. | MermaidDiagram.tsx:147 |
| Co-editing | not handled in the code (no CRDT). | no yjs import in apps or packages |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.test.tsx`: PDF preview URL handling.
- `apps/web/features/code/components/LocalPtyTerminal.test.tsx`: xterm terminal view.
- `apps/web/app/api/mcp-apps/sandbox/route.test.ts`: MCP sandbox route.
- `packages/platform/data-layer/src/__tests__/search-rank.test.ts`: Data-layer search ranking (shared with F104-07).

**Test scenarios**

- **Diagram render**
  1. Ask the assistant for a flowchart in Mermaid.
  2. Watch the message.
  - Expected: A diagram appears; an invalid diagram shows an error, not a crash.
- **Math**
  1. Ask for a formula in LaTeX.
  - Expected: Typeset math.
- **PDF viewer**
  1. Open a PDF artifact.
  - Expected: A framed PDF shows page content.
- **MCP app**
  1. Connect a connector that returns an MCP app.
  2. Call the tool.
  - Expected: Inline isolated card.
- **Co-edit**
  1. Open one document in two sessions and type in both.
  - Expected: Expected shared edits; currently no sync (gap).

**Where to look when it fails**

- Browser console errors from Mermaid or KaTeX.
- McpAppFallback reasons.
- Search the repo for yjs to confirm co-editing absence.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **S104.T05 live co-editing with a CRDT is not built.** Affects: All apps with documents.. Evidence: no yjs import or dependency found. Work needed: Product decision, then a CRDT engine plus transport and persistence.
- **S104.T09 brief status contradicts the code (xterm used).** Affects: Brief accuracy; web inside desktop host.. Evidence: apps/web/package.json:121-123; LocalPtyTerminal.tsx:4,96. Work needed: Correct the brief.
- **S104.T08 viewer is an iframe, not an in-product PDF.js viewer.** Affects: Web PDF artifacts.. Evidence: ArtifactPreview.tsx:2002-2014. Work needed: Either adopt a PDF.js viewer or reword the requirement.
- **Brief code references for several items no longer hit the stated symbols.** Affects: Auditors.. Evidence: lines checked on 2026-11-24. Work needed: Refresh the references.

**Depends on**

- surface:web
- surface:cli
- surface:desktop
- SYS-shared-ui-and-design
- SYS-data-model-and-migrations
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- file:apps/web/package.json

## Unknown

- Whether the desktop Electron host exposes the terminal API the web terminal uses.
- Where the apps/cli front end and runtime split exactly lies in lib.rs.
- MCP app payload retention.
- Whether VS Code and Chrome render Markdown with the same shared package.
- Contents of scripts/config/production-migrations-applied.json cited by the brief (not opened).

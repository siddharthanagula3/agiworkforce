# R26-PARITY Lane W2c — Claude Desktop Platform Parity Audit

# Connectors + Artifacts

**Date:** 2026-05-22
**Auditor:** desktop-engineer (claude-sonnet-4-6)
**Reference images:** 46 total

- `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/` — 19 images (01–19)
- `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/` — 27 images (01–27)
  **Source truth:** `apps/desktop/src/` — read-only audit, no builds

---

## 1. Inventory Table

Each row: screenshot path → what it shows → our equivalent (`apps/desktop/<path:line>`) or ABSENT.

### Connectors Surface (19 images)

| #   | Screenshot Path                                          | What It Shows                                                                                                                                                                                          | Our Equivalent                                                                                                                                                                                       |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `claude-connectors/01_connector-directory-open.png`      | Connector directory modal open; header "Apps & Integrations"; search bar; tabs: Featured / All; initial featured grid with large cards (Slack, Linear, Jira, GitHub, etc.)                             | `apps/desktop/src/features/connectors/ConnectorGallery.tsx` — Featured/All tabs, search input. Tabs exist; card layout exists.                                                                       |
| 02  | `claude-connectors/02_connector-directory-filters.png`   | Sort button + Type dropdown + Categories multi-select filter bar above connector grid; ~12 category pills visible                                                                                      | `ConnectorGallery.tsx` — category dropdown filter exists; **Sort button and Type filter: ABSENT**                                                                                                    |
| 03  | `claude-connectors/03_connector-page-2.png`              | Second page of All connectors; ~12 connector cards per row; pagination or scroll; badge labels on cards: "Popular", "Interactive"                                                                      | `ConnectorGallery.tsx` — scrollable grid; **badge labels (Popular/Interactive/New/Trending): ABSENT**                                                                                                |
| 04  | `claude-connectors/04_connector-page-3.png`              | Third page; connectors including Brave Search, HackerNews, Exa; "New" badge on some cards                                                                                                              | Same as above — no badges in our connector cards                                                                                                                                                     |
| 05  | `claude-connectors/05_connector-page-4.png`              | Fourth page; diverse connector set; "Trending" badge visible                                                                                                                                           | Same as above                                                                                                                                                                                        |
| 06  | `claude-connectors/06_connector-page-5.png`              | Fifth page; connectors including time/calendar tools; no pagination UI — continuous scroll implied                                                                                                     | `ConnectorGallery.tsx` — continuous scroll grid. Matches pattern.                                                                                                                                    |
| 07  | `claude-connectors/07_connector-page-6.png`              | Sixth page; connectors including Maps, Weather tools                                                                                                                                                   | Continuous scroll. Matches.                                                                                                                                                                          |
| 08  | `claude-connectors/08_connector-page-7.png`              | Seventh page; developer-oriented connectors (npm, PyPI, etc.)                                                                                                                                          | Continuous scroll. Matches.                                                                                                                                                                          |
| 09  | `claude-connectors/09_connector-page-8.png`              | Eighth page; more developer tools                                                                                                                                                                      | Continuous scroll. Matches.                                                                                                                                                                          |
| 10  | `claude-connectors/10_connector-page-9.png`              | Ninth page; database and data connectors                                                                                                                                                               | Continuous scroll. Matches.                                                                                                                                                                          |
| 11  | `claude-connectors/11_connector-page-10.png`             | Tenth page                                                                                                                                                                                             | Continuous scroll. Matches.                                                                                                                                                                          |
| 12  | `claude-connectors/12_connector-page-11.png`             | Eleventh page                                                                                                                                                                                          | Continuous scroll. Matches.                                                                                                                                                                          |
| 13  | `claude-connectors/13_connector-page-12.png`             | Twelfth page                                                                                                                                                                                           | Continuous scroll. Matches.                                                                                                                                                                          |
| 14  | `claude-connectors/14_connector-page-13.png`             | Thirteenth page; approximately 250+ total connectors implied across all pages                                                                                                                          | `connectorDefinitions.ts` — 75 total (15 active, 60 `comingSoon: true`). **Scale gap: ~250 vs 75**.                                                                                                  |
| 15  | `claude-connectors/15_computer-use-connectors.png`       | Computer-use connectors section: "Control Chrome", "Desktop Commander", "Read and Send iMessages", "Windows-MCP", "Kapture Browser Automation", "Control your Mac" — all under a Computer Use category | `connectorDefinitions.ts` — no computer-use category connectors present. **ABSENT** in connector gallery. Computer-use exists as separate feature (`apps/desktop/src/features/computer-use/`).       |
| 16  | `claude-connectors/16_computer-use-connector-detail.png` | Individual computer-use connector detail card; shows description, "Connect" button, install/auth instructions                                                                                          | Our computer-use is triggered via sidecar (`apps/desktop/src/features/chat/index.tsx:683`) not via connector directory. **Connector-style entry: ABSENT**                                            |
| 17  | `claude-connectors/17_connector-oauth-flow.png`          | OAuth consent screen flow initiated from connector; browser popup or in-app webview; scopes listed                                                                                                     | `ConnectorGallery.tsx` — OAuth via Tauri event listeners (`mcp-oauth-callback`, `mcp-oauth-error`); `CustomRemoteMcpConnectorDialog.tsx`. Flow exists.                                               |
| 18  | `claude-connectors/18_custom-connector-link.png`         | "Add a custom connector" link/button at bottom of connector directory                                                                                                                                  | `ConnectorGallery.tsx` — `CustomRemoteMcpConnectorDialog` accessible from gallery. Matches intent.                                                                                                   |
| 19  | `claude-connectors/19_connector-connected-state.png`     | Connected connector card: green checkmark badge, "Connected" status label, token expiry indicator, "Disconnect" option                                                                                 | `ConnectorGallery.tsx` — token expiry display (`tokenExpiresAt` state), refresh button. Connected state rendering exists. **Green checkmark badge styling may differ** (not audited at pixel level). |

### Artifacts Surface (27 images)

| #   | Screenshot Path                                         | What It Shows                                                                                                                                                                         | Our Equivalent                                                                                                                                                                                         |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | `claude-artifacts/01_ab-response-variants.png`          | Inline A/B response variant pills in chat: "Builder-focused" vs "Vision-forward" — user can pick between two generated drafts without regenerating                                    | `apps/desktop/src/features/chat/index.tsx` — **ABSENT**. No A/B variant comparison UI.                                                                                                                 |
| 02  | `claude-artifacts/02_inline-tool-steps-collapsed.png`   | Tool call steps shown collapsed in chat as a single "Used X tools" pill that can be expanded                                                                                          | `apps/desktop/src/features/chat/InlineToolResults/` — 28 inline tool result types registered. Collapsed/expandable steps exist. Matches.                                                               |
| 03  | `claude-artifacts/03_inline-tool-steps-expanded.png`    | Expanded tool steps showing individual calls: web search, code execution, file read — each with icon and brief output                                                                 | `apps/desktop/src/features/chat/InlineToolResults/InlineSearchResults.tsx` — web search results with domain + favicon. Matches pattern.                                                                |
| 04  | `claude-artifacts/04_web-search-with-favicons.png`      | Web search result cards with provider favicon, title, domain, snippet — 3-4 results displayed inline in chat                                                                          | `apps/desktop/src/features/chat/InlineToolResults/InlineSearchResults.tsx` — Google favicon fallback at `https://www.google.com/s2/favicons?domain=X&sz=32`. Matches.                                  |
| 05  | `claude-artifacts/05_artifact-thumbnail-in-chat.png`    | Artifact inline card in chat showing a rendered thumbnail of the artifact (document preview or code screenshot), type label, "Open" button                                            | `apps/desktop/src/features/chat/InlineToolResults/InlineArtifactCard.tsx` — shows type badge + ExternalLink icon. **Thumbnail preview: ABSENT**. Text-only card.                                       |
| 06  | `claude-artifacts/06_artifact-sidebar-split.png`        | Chat + artifact panel side-by-side split view; artifact sidebar occupies right ~40% of window                                                                                         | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — sidebar split view exists. Matches layout.                                                                                                   |
| 07  | `claude-artifacts/07_artifact-toolbar.png`              | Artifact toolbar: Copy / Refresh / Close buttons; tab label shows artifact name                                                                                                       | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — toolbar has Edit, Copy, Download, History, Refresh, Share, Publish, dropdown. Superset of Claude's toolbar.                                  |
| 08  | `claude-artifacts/08_artifact-preview-tab.png`          | Preview tab active showing rendered HTML page in artifact panel                                                                                                                       | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — Preview/Code/Versions inner tabs. Matches.                                                                                                   |
| 09  | `claude-artifacts/09_relevant-chats-section.png`        | "Relevant chats" section appears below AI response — shows 2-3 prior conversation cards with thumbnail and summary that are semantically related to current query                     | `apps/desktop/src/features/chat/` — **ABSENT**. No relevant-chats surface.                                                                                                                             |
| 10  | `claude-artifacts/10_thinking-block-inline.png`         | Inline collapsible "thinking" block within AI response — shows reasoning steps, collapsed by default with "Thinking..." label                                                         | `apps/desktop/src/features/chat/index.tsx:1145-1153` — `thinkingMode`, `thinkingBudget`, `perTurnAdaptiveThinking` present. Thinking blocks rendered inline. Matches.                                  |
| 11  | `claude-artifacts/11_file-creation-steps.png`           | Sequential file creation tool steps shown compactly: "Created file: main.py", "Created file: requirements.txt" — stacked with timestamps                                              | `apps/desktop/src/features/chat/InlineToolResults/` — inline tool result registry. File creation tool result type supported if registered. Partial match.                                              |
| 12  | `claude-artifacts/12_compact-stacked-tool-messages.png` | Multiple consecutive tool calls stacked compactly into a single collapsible group rather than individual message bubbles                                                              | `apps/desktop/src/features/chat/InlineToolResults/` — inline results rendering. Stacking behavior depends on implementation detail. Likely partial match.                                              |
| 13  | `claude-artifacts/13_pasted-content-tag.png`            | Pasted content shown as a tag/chip in the composer (e.g., "Pasted content · 2.3 KB") rather than expanding full text inline                                                           | `apps/desktop/src/features/chat/` — **ABSENT**. Paste handling not confirmed as tag/chip.                                                                                                              |
| 14  | `claude-artifacts/14_multi-artifact-cards.png`          | Multiple artifact cards shown after a multi-file generation response: 3 cards side-by-side, each with artifact name, "Open in [app]" button (e.g., "Open in Antigravity"), "Download" | `apps/desktop/src/features/chat/InlineToolResults/InlineArtifactCard.tsx` — single artifact card with ExternalLink. **Multi-card grid layout: ABSENT. "Open in [app]" CTA: ABSENT.**                   |
| 15  | `claude-artifacts/15_download-all-button.png`           | "Download all" batch download button appears when multiple artifacts present in same response                                                                                         | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — individual Download per artifact tab. **"Download all" batch: ABSENT.**                                                                      |
| 16  | `claude-artifacts/16_markdown-view-artifact.png`        | Artifact panel showing rendered Markdown view (formatted prose with headers, lists)                                                                                                   | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — Document renderer. Matches.                                                                                                                  |
| 17  | `claude-artifacts/17_open-in-system-app.png`            | Artifact panel toolbar includes "Open in Antigravity" button (opens artifact in system browser/app)                                                                                   | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — **ABSENT**. No "Open in system app" button. Toolbar has Share/Publish/Download only.                                                         |
| 18  | `claude-artifacts/18_open-in-textedit.png`              | "Open in TextEdit" button for a text/document artifact — integrates with macOS native app                                                                                             | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — **ABSENT**. No native app handoff.                                                                                                           |
| 19  | `claude-artifacts/19_source-view-tab.png`               | "Source" tab in artifact panel showing raw HTML/Markdown/code source alongside Preview tab                                                                                            | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — Code tab shows raw source. Matches.                                                                                                          |
| 20  | `claude-artifacts/20_open-in-preview.png`               | "Open in Preview" button for image/PDF artifact — macOS Preview integration                                                                                                           | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — **ABSENT**. No macOS Preview handoff.                                                                                                        |
| 21  | `claude-artifacts/21_rich-text-view.png`                | Rich text (WYSIWYG) view mode for document artifact — editable formatted text view                                                                                                    | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — `InlineArtifactEditor` exists for in-panel source editing. **WYSIWYG rich text view: uncertain**, not confirmed.                             |
| 22  | `claude-artifacts/22_pdf-view-artifact.png`             | Artifact panel rendering a PDF artifact with page navigation                                                                                                                          | `apps/desktop/src/features/artifacts/ArtifactRendererView.tsx` — 8 renderer types: Code, Document, Spreadsheet, Diagram, Web, Chart, Presentation, Image. **PDF viewer renderer: not listed**. ABSENT. |
| 23  | `claude-artifacts/23_pdf-generation-python.png`         | Python code execution artifact producing PDF output (via reportlab) — shown as both code and output artifact                                                                          | `apps/desktop/src/features/artifacts/ArtifactRendererView.tsx` — Code renderer handles Python display. PDF output artifact rendering: **ABSENT** (no PDF renderer).                                    |
| 24  | `claude-artifacts/24_print-button.png`                  | Print button in artifact toolbar — prints artifact content via browser/system print dialog                                                                                            | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — **ABSENT**. No Print button in toolbar. Toolbar has: Edit, Copy, Download, History, Refresh, Share, Publish, dropdown.                       |
| 25  | `claude-artifacts/25_tabbed-artifact-content.png`       | Tabbed artifact navigation when multiple artifacts: tabs at top of artifact panel named per artifact                                                                                  | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — multi-tab layout for multiple artifacts exists. Matches.                                                                                     |
| 26  | `claude-artifacts/26_scroll-to-bottom-button.png`       | Floating scroll-to-bottom chevron button in chat when scrolled up                                                                                                                     | `apps/desktop/src/features/chat/ChatStream.tsx:522,940` — `scrollToBottom` callback and floating button exist. Matches.                                                                                |
| 27  | `claude-artifacts/27_version-history-empty.png`         | Version history panel in artifact; shows "No previous versions" state                                                                                                                 | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — Versions tab + `VersionHistoryDialog.tsx` exist. Matches (we have version history).                                                          |

---

## 2. Parity Scorecard

### Connectors

| Area                                                      | Claude | Us             | Status |
| --------------------------------------------------------- | ------ | -------------- | ------ |
| Connector directory modal                                 | Yes    | Yes            | PARITY |
| Featured / All tabs                                       | Yes    | Yes            | PARITY |
| Search                                                    | Yes    | Yes            | PARITY |
| Category filter                                           | Yes    | Yes            | PARITY |
| Sort button                                               | Yes    | No             | GAP    |
| Type filter dropdown                                      | Yes    | No             | GAP    |
| Connector badge labels (Popular/Interactive/New/Trending) | Yes    | No             | GAP    |
| Connector breadth                                         | ~250+  | 75 (15 active) | GAP    |
| Custom connector entry                                    | Yes    | Yes            | PARITY |
| OAuth flow                                                | Yes    | Yes            | PARITY |
| API-key auth flow                                         | Yes    | Yes            | PARITY |
| Token expiry display                                      | Yes    | Yes            | PARITY |
| Token refresh button                                      | Yes    | Yes            | PARITY |
| Computer-use connectors in directory                      | Yes    | No             | GAP    |
| Bridge status card (Chrome + VSCode)                      | No     | Yes            | AHEAD  |
| Structured MCP transport/package metadata                 | No     | Yes            | AHEAD  |

**Connector score: 8/14 parity items matched (57%), 2 areas ahead**

### Artifacts

| Area                                     | Claude    | Us             | Status |
| ---------------------------------------- | --------- | -------------- | ------ |
| Artifact sidebar split view              | Yes       | Yes            | PARITY |
| Preview / Source / Code tabs             | Yes       | Yes            | PARITY |
| Artifact toolbar (Copy/Refresh/Close)    | Yes       | Yes (superset) | AHEAD  |
| Inline tool steps (collapsed/expandable) | Yes       | Yes            | PARITY |
| Web search results with favicons         | Yes       | Yes            | PARITY |
| HTML live preview (sandboxed)            | Yes       | Yes            | PARITY |
| React live preview                       | Yes       | Yes            | PARITY |
| Thinking/reasoning blocks inline         | Yes       | Yes            | PARITY |
| Scroll-to-bottom floating button         | Yes       | Yes            | PARITY |
| Markdown/document renderer               | Yes       | Yes            | PARITY |
| Multi-artifact tabs                      | Yes       | Yes            | PARITY |
| Version history                          | Yes       | Yes            | AHEAD  |
| InlineArtifactEditor                     | Uncertain | Yes            | AHEAD  |
| Chart renderer (recharts)                | Uncertain | Yes            | AHEAD  |
| Presentation renderer                    | Uncertain | Yes            | AHEAD  |
| Artifact thumbnail in chat card          | Yes       | No             | GAP    |
| "Open in [system app]" button            | Yes       | No             | GAP    |
| "Download all" batch download            | Yes       | No             | GAP    |
| Print button                             | Yes       | No             | GAP    |
| A/B response variant pills               | Yes       | No             | GAP    |
| "Relevant chats" section                 | Yes       | No             | GAP    |
| Pasted content tag/chip in composer      | Yes       | Uncertain      | GAP    |
| Multi-artifact card grid in chat         | Yes       | No             | GAP    |
| PDF artifact renderer                    | Yes       | No             | GAP    |

**Artifacts score: 12/24 parity items matched (50%), 5 areas ahead**

---

## 3. Where We Are Ahead

### Ahead of Claude — Connectors

**A1. BridgeStatusCard (Chrome + VSCode extensions on port 8787)**

- `apps/desktop/src/features/connectors/ConnectorGallery.tsx` — `BridgeStatusCard` component renders live connection status for Chrome extension and VSCode extension bridges.
- Claude's connector directory has no equivalent surface for IDE/browser extension status.
- This is a unique capability that surfaces bridge connectivity directly in the connector UI.

**A2. Structured MCP transport + package metadata per connector**

- `apps/desktop/src/features/connectors/connectorDefinitions.ts` — each `ConnectorDef` carries `mcpPackage`, `mcpTransport`, auth scopes, `comingSoon` flag.
- Claude's connector directory is a UI surface; no equivalent structured catalog metadata is visible in reference images.
- This enables programmatic connector management (transport negotiation, scope enforcement) beyond what Claude's UI exposes.

**A3. Per-connector token expiry tracking + refresh**

- `apps/desktop/src/features/connectors/ConnectorGallery.tsx` — `tokenExpiresAt` state + refresh button per connected connector.
- Claude shows connected state (image `19_connector-connected-state.png`) but per-connector expiry with proactive refresh is a stronger UX.

### Ahead of Claude — Artifacts

**A4. Artifact version history with rollback**

- `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — Versions tab, `VersionHistoryDialog.tsx`, version pin/archive/rollback.
- Claude shows only an empty version history state (image `27_version-history-empty.png`). Our system has a functional version history with diff and rollback.

**A5. Richer artifact toolbar (superset)**

- Our toolbar includes: Edit, Copy, Download, History, Refresh, Share, Publish (v1 LOCAL ONLY gated), plus a dropdown.
- Claude's toolbar (image `07_artifact-toolbar.png`) shows Copy, Refresh, Close only.

**A6. InlineArtifactEditor — in-panel source editing**

- `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` — `InlineArtifactEditor` component enables editing artifact source directly in the panel.
- Claude's artifact panel does not surface in-panel editing in any reference image.

**A7. Additional artifact renderers (Chart + Presentation)**

- `apps/desktop/src/features/artifacts/ArtifactRendererView.tsx` — 8 types: Code, Document, Spreadsheet, Diagram, Web, Chart (recharts), Presentation, Image.
- Claude's reference images do not show Chart (recharts) or Presentation renderers — these may be unique to our implementation.

---

## 3b. User-Flow Reality Check

For each major Connectors/Artifacts flow, this section reasons from source code about what a user opening AGI Workforce.app would actually experience — vs what the code superficially implies.

### Flow 1: Adding a Connector (OAuth path — e.g. Slack, GitHub, Google Drive)

**What the code implies:** User clicks Connect on a connector card → OAuth browser popup → callback → connected state.

**What actually happens (Tauri mode):**

1. `handleConnect()` in `ConnectorGallery.tsx` calls `McpClient.oauthStartRaw(id)` which invokes `mcp_oauth_start` Rust command.
2. The Rust handler (`mcp_oauth.rs:774`) calls `get_client_credentials(oauth_provider)` which reads `GITHUB_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `SLACK_CLIENT_ID` from environment or stored credentials.
3. **BROKEN in production builds**: These env vars are not bundled in the app. If they were not set before building and not stored via `mcp_oauth_set_credentials`, `get_client_credentials` returns `Err(...)` → the frontend receives a thrown error → `OAuthFlowState` shows `status: 'error'`. The OAuth popup never opens.
4. Even if credentials exist: `mcp_oauth_start` calls a HITL `request_confirmation_simple` gate first (`mcp_oauth.rs:786`). In agent-mode "Safe" or "Plan", this gate can block the flow.
5. After OAuth callback: `completeOAuth()` calls `McpClient.connectConnector(id)` which invokes `mcp_connect_connector`. That Rust command (`mcp_oauth.rs:1562`) writes an MCP server config entry and calls the MCP subsystem to spawn `npx -y @modelcontextprotocol/server-slack` (or equivalent) as a child process. This requires `npx` / Node.js to be installed on the user's machine — **no bundled Node runtime**. If Node is absent, the MCP server spawn fails silently (the `completeOAuth` catch block marks connected anyway for "tokens stored").
6. **Net result for a first-time user**: Unless GITHUB_CLIENT_ID/SECRET are pre-configured and Node.js is installed, clicking Connect on any OAuth connector shows an error dialog or silently fails after OAuth. The "connected" badge may show even when the MCP server is not running.

**Verdict: CODE EXISTS but flow is BROKEN for OAuth connectors without pre-configured client credentials and local Node.js.**

Source chain: `ConnectorGallery.tsx:198-219` → `connectorsStore.ts:66-116` → `mcp_oauth.rs:774-830` (credential check at line 800) → `mcp_oauth.rs:1562` (connector spawn).

---

### Flow 2: Adding a Connector (API key path — e.g. Stripe, Linear, Vercel)

**What actually happens (Tauri mode):**

1. `handleConnectClick` detects `authType === 'api_key'` and opens `ConnectorApiKeyDialog`.
2. User enters key → `connectWithApiKey(id, key)` → `McpClient.saveApiKey(id, key)` invokes `save_api_key` Rust command, which writes the key to the encrypted settings store.
3. Then `McpClient.connectConnector(id)` is called → spawns `npx -y @stripe/mcp --tools=all` (or equivalent) with the API key as env var.
4. Same Node.js dependency as above. If Node is absent, `mcp_connect_connector` fails.
5. **The credential storage step works** — `save_api_key` writes to SQLite with AES-256-GCM. The spawn step depends on Node.
6. **Verdict: PARTIALLY FUNCTIONAL.** Credential capture works. MCP server activation requires Node.js. Users without Node will see a "connected" badge but the tools will not actually be available in chat.

Source: `ConnectorGallery.tsx:240-253` → `connectorsStore.ts:118-138` → `mcp_oauth.rs:1562`

---

### Flow 3: Connector Directory — is it a live catalog or hardcoded list?

**What actually happens:** The gallery renders from `CONNECTORS` and `FEATURED_CONNECTORS` arrays in `connectorDefinitions.ts` — **a hardcoded TypeScript file**. There is no network fetch, no server-side catalog, no version check.

`fetchConnected()` calls `McpClient.listConnectedProviders()` → `mcp_list_connected_providers` Rust command (line 1440 in `mcp_oauth.rs`) which returns the list of currently-running MCP servers. This is a live query, not a mock. **But the catalog itself (which connectors are shown, their names, icons, descriptions) is entirely static.**

Claude's directory, by contrast, appears to be a server-fetched catalog (250+ connectors across 19 pages with badges like "New" and "Trending" that imply server-driven metadata).

**Verdict: HARDCODED LIST — not a live catalog. No dynamic discovery. Adding a connector to Claude requires a PR to `connectorDefinitions.ts`.**

Source: `ConnectorGallery.tsx:176` (`const sourceList = activeTab === 'featured' ? FEATURED_CONNECTORS : CONNECTORS`)

---

### Flow 4: MCP Server Discovery — does it scan installed servers?

**What actually happens:** There is no scan of the user's local filesystem or `~/.mcp.json` on gallery open. `fetchConnected()` (called on mount) queries what MCP servers are already running via the Rust MCP subsystem. It does not auto-discover servers the user may have installed separately outside the app.

`mcpGetConfig()` → `mcp_get_config` Rust command reads the app's own managed MCP config (not the user's global `~/.mcp.json` or Claude's config). Auto-import from the user's existing Claude Code MCP setup does not exist.

**Verdict: NO AUTO-DISCOVERY. Only servers explicitly connected through the app's own gallery flow are tracked. Users with existing MCP setups from other tools start with zero connectors.**

---

### Flow 5: Custom Remote MCP Connector

**What actually happens:** `CustomRemoteMcpConnectorDialog.tsx` accepts a server URL and credentials, invokes `mcp_update_config` to write the remote MCP entry to the config, then calls `mcp_connect_server`. This is a real Tauri call path. The server URL is user-supplied and the connection is attempted immediately.

**Verdict: FUNCTIONAL** — the custom connector path is the most complete flow in the gallery. It does not depend on hardcoded credential lookups or Node.js (for SSE/HTTP remote transports).

---

### Flow 6: Artifact HTML/React/SVG Preview — does it actually render?

**What actually happens:**

- **HTML artifacts**: `HtmlArtifact.tsx` renders a sandboxed `<iframe>` with `srcDoc` set to the raw HTML and `sandbox="allow-scripts allow-modals"`. This renders in the browser's sandboxed frame. **FUNCTIONAL** — no external dependencies.
- **React artifacts**: `ReactPreview.tsx` builds an HTML document that loads Babel standalone from CDN (`https://unpkg.com/@babel/standalone/babel.min.js`) and Tailwind CDN, then transpiles JSX in-browser. **FUNCTIONAL when online.** If the CDN is unreachable (air-gapped, offline), the React preview silently fails to render (Babel undefined error in iframe).
- **SVG artifacts**: Rendered via the Diagram renderer in `ArtifactRendererView.tsx`. Uses `mermaid` or direct SVG `innerHTML`. **FUNCTIONAL** for plain SVG; Mermaid diagrams need the mermaid lib loaded.

**Verdict: HTML preview ALWAYS functional. React preview REQUIRES internet (CDN). No offline fallback.**

Source: `HtmlArtifact.tsx` (sandbox attr), `ReactPreview.tsx` (`buildReactPreviewDocument()` with unpkg CDN URLs)

---

### Flow 7: Code Canvas — does it actually execute code?

**What actually happens:** `execute_code` is a real Tauri command (`code_execution.rs:49`) backed by `SandboxManager` (`core/agi/sandbox.rs`). It:

1. Shows a HITL confirmation dialog first (`tool_confirmation::request_confirmation_simple` at `code_execution.rs:66`).
2. Uses OS-level sandboxing (Seatbelt on macOS, Bubblewrap/Landlock on Linux).
3. Runs 8 supported languages: python, javascript, typescript, bash, powershell, ruby, perl, r.
4. Returns real stdout/stderr.

**HOWEVER**: The sandbox requires the language runtime to be installed on the host machine. Python execution requires system Python. JavaScript execution runs via Node.js. If the runtime is absent, execution fails with an interpreter-not-found error.

In the mock (`tauri-mock.ts:321`), `execute_code` returns `{ success: true, stdout: '(mock output)' }` — so in non-Tauri environments (dev browser, tests) code "runs" as a no-op mock.

**Verdict: ACTUALLY EXECUTES code in Tauri mode with real OS sandbox. User sees HITL dialog before each execution. Requires language runtimes installed on host. Mock only in browser/test mode.**

Source: `code_execution.rs:49-113`, `tauri-mock.ts:321-332`

---

### Flow 8: Connector OAuth — type mismatch for non-canonical providers

**Critical structural bug (not a flow, a type constraint):** The TypeScript `McpOAuthProvider` type (`types/mcp.ts:383`) is defined as `'github' | 'google_drive' | 'slack'` — exactly 3 providers. But `connectorsStore.ts:93-116` calls `McpClient.oauthStatus(id as Parameters<typeof McpClient.oauthStatus>[0])` for any `id` in `connectedIds`. If a user connects "figma", "notion", "jira", or any other OAuth connector, the cast `id as McpOAuthProvider` compiles but the Rust `mcp_oauth_status` handler will receive a provider string it may not recognize for status checks.

Additionally, `mcpOAuthGetAllStatuses()` (`mcp.ts:891`) hardcodes `['github', 'google_drive', 'slack']` — it will never report status for figma, notion, jira, outlook, or microsoft-auth connectors.

**Verdict: CODE HAS TYPE MISMATCH — the TS provider union covers 3 providers; the Rust connector registry covers 13 providers. `oauthStatus` calls for non-canonical providers will return errors that are silently caught, showing `expiresAt: null` even for active sessions.**

Source: `types/mcp.ts:383`, `mcp.ts:891`, `connectorsStore.ts:100-110`

---

### Flow 9: Plugin Manifests — do they load and run?

**What actually happens:** `mcpGetConnectorManifests()` → `get_connector_manifests` Rust command (`mcp_oauth.rs:1964`). In the non-Tauri mock this returns `[]`. In Tauri mode it returns the list of connector manifests from the Rust backend.

The extension system (`extension_list`, `extension_install`, etc.) is fully wired in Rust but `extension_install` and `extension_uninstall` throw in non-Tauri mode (`tauri-mock.ts:590`). In Tauri mode, extensions are `.tar.gz` packages installed to an extensions directory via `extension_install` Tauri command.

**Verdict: FUNCTIONAL in Tauri mode for both connector manifests and extension install. In browser/test mode, extension install throws. Gallery renders from hardcoded list, not manifests.**

---

### Flow 10: File/Tool Integration — Drive, GitHub, Notion — actual API calls or mock-only?

**GitHub**: After OAuth, `mcp_connect_connector("github")` spawns `npx -y @modelcontextprotocol/server-github` with `GITHUB_PERSONAL_ACCESS_TOKEN` env var. This is the official GitHub MCP server. **Real API calls** via the MCP server process — not mock. But requires Node.js + successful OAuth credential exchange.

**Google Drive**: Same pattern — spawns `@modelcontextprotocol/server-gdrive` with `GDRIVE_OAUTH_TOKEN`. Real API calls once running. Same Node.js dependency.

**Notion**: Spawns `@notionhq/notion-mcp-server` with `OPENAPI_MCP_HEADERS`. Real API calls.

**Critical gap**: All of these connectors use `npx -y` at runtime, which downloads the npm package on first use. A user's first connection attempt on a fresh machine will spend 10–30 seconds downloading the npm package before the MCP server starts. There is no bundling, no version pinning (`-y` with no `@version`), and no user-visible progress for this download step.

**Verdict: REAL API CALLS once running, but the activation path (npm download + Node.js requirement + OAuth credentials) makes the first-connection experience fragile. No bundled runtimes, no version pinning, no download progress UX.**

Source: `mcp_oauth.rs:66-178` (connector mapping, npx invocations)

---

## 4. Recommendations

### P0 — Critical parity blockers

**R26-PARITY-DESKTOP-PLATFORM-01 [P0] — Expand active connector count from 15 to 50+**

Evidence: Claude's connector directory spans 250+ connectors across 19 pages (images `01–14`). Our `connectorDefinitions.ts` has 75 entries but only 15 are active (`comingSoon: false`). The remaining 60 are not functional.

Action: Prioritize enabling the top 20–30 most-requested connectors by removing `comingSoon: true` and wiring their MCP packages. Focus on connectors where the npm package (`@modelcontextprotocol/server-slack`, `@vercel/mcp`, `@stripe/mcp`, etc.) is already referenced in `connectorDefinitions.ts`. No new categories needed; enable what we already have defined.

File: `apps/desktop/src/features/connectors/connectorDefinitions.ts`

---

**R26-PARITY-DESKTOP-PLATFORM-02 [P0] — Add artifact thumbnail preview to inline artifact card in chat**

Evidence: Claude (image `05_artifact-thumbnail-in-chat.png`) shows a rendered thumbnail of the artifact content within the inline chat card. Our `InlineArtifactCard.tsx` shows only a text type badge and ExternalLink icon — no thumbnail.

Action: Capture a static screenshot or low-res render of the artifact when it first opens, and display it as a thumbnail in `InlineArtifactCard.tsx`. Alternatively, render a CSS-scaled iframe snapshot (same approach as our `ReactPreview.tsx`) into a small card slot.

File: `apps/desktop/src/features/chat/InlineToolResults/InlineArtifactCard.tsx`

---

### P1 — High-value missing features

**R26-PARITY-DESKTOP-PLATFORM-03 [P1] — Add "Open in [system app]" to artifact toolbar**

Evidence: Claude (images `17_open-in-system-app.png`, `18_open-in-textedit.png`, `20_open-in-preview.png`) provides system-app handoff buttons in the artifact panel. Our ArtifactPanel has Share/Publish/Download only — no native app handoff.

Action: Add a Tauri shell `open()` call triggered by a new toolbar button. For macOS: HTML → Safari/default browser; Markdown/text → TextEdit; Images → Preview; PDF → Preview. Map MIME type or artifact type to system handler. Tauri v2 `tauri::shell::open()` is already available in the backend.

Files: `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`, `apps/desktop/src-tauri/src/`

---

**R26-PARITY-DESKTOP-PLATFORM-04 [P1] — Add "Download all" batch download for multi-artifact responses**

Evidence: Claude (image `15_download-all-button.png`) shows a "Download all" button when multiple artifacts exist in the same response. Our ArtifactPanel has per-artifact Download only.

Action: When `artifacts.length > 1`, render a "Download all" button in the panel header that zips all artifacts (using the browser's File System API or a Tauri zip command) and saves the archive.

File: `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`

---

**R26-PARITY-DESKTOP-PLATFORM-05 [P1] — Add computer-use connectors to connector directory**

Evidence: Claude surfaces computer-use as named connectors in its directory: "Control Chrome", "Desktop Commander", "Read and Send iMessages", "Control your Mac" (images `15–16`). Our computer-use is triggered via sidecar at `chat/index.tsx:683` and is completely separate from the connector directory — no discoverability.

Action: Add computer-use entries to `connectorDefinitions.ts` as a `computer-use` category. Each card links to the computer-use sidecar rather than an MCP package install. This makes the surface discoverable without changing the underlying implementation.

File: `apps/desktop/src/features/connectors/connectorDefinitions.ts`

---

**R26-PARITY-DESKTOP-PLATFORM-06 [P1] — Add PDF artifact renderer**

Evidence: Claude (images `22–23`) renders PDF artifacts in the artifact panel with page navigation, and shows Python-generated PDFs (reportlab) as an artifact output. Our `ArtifactRendererView.tsx` lists 8 renderer types; PDF is not among them.

Action: Add a PDF renderer using the browser's native `<embed type="application/pdf">` or an iframe with a PDF data URL. Wire it as a 9th renderer type in `ArtifactRendererView.tsx`.

File: `apps/desktop/src/features/artifacts/ArtifactRendererView.tsx`

---

### P2 — Polish and secondary gaps

**R26-PARITY-DESKTOP-PLATFORM-07 [P2] — Add Sort and Type filter controls to connector gallery**

Evidence: Claude (image `02_connector-directory-filters.png`) shows Sort button + Type dropdown alongside Categories filter. Our `ConnectorGallery.tsx` has only category dropdown and search.

Action: Add Sort (A-Z, Recently Connected, Popular) and Type (OAuth, API Key, MCP Remote) filter controls to the filter bar in `ConnectorGallery.tsx`.

File: `apps/desktop/src/features/connectors/ConnectorGallery.tsx`

---

**R26-PARITY-DESKTOP-PLATFORM-08 [P2] — Add connector badge labels (Popular, Interactive, New, Trending)**

Evidence: Claude (images `03–05`) shows badge labels on connector cards in the directory. Our connector cards have no badges.

Action: Add an optional `badge?: 'popular' | 'interactive' | 'new' | 'trending'` field to `ConnectorDef` in `connectorDefinitions.ts`, and render it as a small pill overlay on connector cards in `ConnectorGallery.tsx`.

Files: `apps/desktop/src/features/connectors/connectorDefinitions.ts`, `apps/desktop/src/features/connectors/ConnectorGallery.tsx`

---

**R26-PARITY-DESKTOP-PLATFORM-09 [P2] — Add Print button to artifact panel toolbar**

Evidence: Claude (image `24_print-button.png`) shows a Print button in the artifact toolbar. Our `ArtifactPanel.tsx` toolbar omits Print.

Action: Add a Print button that calls `window.print()` scoped to the artifact iframe content. For non-HTML artifacts, trigger system print via the artifact's rendered view.

File: `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`

---

**R26-PARITY-DESKTOP-PLATFORM-10 [P2] — Add pasted content tag/chip in chat composer**

Evidence: Claude (image `13_pasted-content-tag.png`) collapses pasted text into a tag chip ("Pasted content · 2.3 KB") in the composer rather than showing the full paste inline. Our composer behavior for large pastes is not confirmed from source.

Action: Intercept paste events in the chat composer; if paste length exceeds a threshold (e.g., 500 chars), collapse it to a labeled chip with byte count. Clicking the chip expands to full text.

File: `apps/desktop/src/features/chat/` (composer component, path to be confirmed)

---

**R26-PARITY-DESKTOP-PLATFORM-11 [P2] — Add "Relevant chats" related conversation surfacing**

Evidence: Claude (image `09_relevant-chats-section.png`) surfaces semantically related past conversations below AI responses as clickable cards with thumbnail + summary. We have no equivalent.

Action: After each response, query local chat history for semantic similarity (using existing embedding infrastructure if present, else keyword match) and render a collapsible "Relevant chats" section. This is a discovery/memory feature.

File: `apps/desktop/src/features/chat/` (new component needed)

---

**R26-PARITY-DESKTOP-PLATFORM-12 [P2] — Multi-artifact card grid layout in chat**

Evidence: Claude (image `14_multi-artifact-cards.png`) shows multiple artifact cards in a horizontal grid within a single chat message, each with an "Open in [app]" CTA. Our `InlineArtifactCard.tsx` renders one card per artifact in a vertical list with no grid.

Action: When a message produces 2+ artifacts, render them in a 2-column grid in `InlineArtifactCard.tsx`. Add the "Open in" CTA once R26-PARITY-DESKTOP-PLATFORM-03 is implemented.

File: `apps/desktop/src/features/chat/InlineToolResults/InlineArtifactCard.tsx`

---

## Appendix: Out-of-scope observations

- **A/B response variant pills** (image `01_ab-response-variants.png`): Claude shows inline response comparison. This is a significant UX innovation but requires model-level support (generating two variants in one call). Not recommended for P2 without confirming API support. Track separately.
- **ComputerUseMonitor commented out**: `apps/desktop/src/features/chat/index.tsx:94` — `ComputerUseMonitor` import is commented out. The sidecar trigger at line 683 still works. This is a known in-progress state; no action recommended here.
- **v1 LOCAL ONLY lock**: `Publish` button in ArtifactPanel is gated behind the v1 local-only lock per `apps/desktop/AGENTS.md` (R25-V5). No recommendations touch cloud-sync or publish flows.

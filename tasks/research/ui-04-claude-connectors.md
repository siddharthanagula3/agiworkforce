# UI Research 04 — Claude Connectors Directory & Per-Connector Detail

**Scope** — `~/Desktop/reference/ui/claude/claude-connectors-directory/` (19 PNGs, all titled `*_directory_modal-page-NN_*.png`) plus deep-dive cross-reference into `~/Desktop/reference/ui/claude/claude-desktop/14,15,18,19,23-34.png` for per-connector detail pages and OAuth flows.

**Method** — Pixel-level read of every screenshot via the `Read` tool (multimodal). Every claim cites the file. Where the same UI affordance recurs across pages, the citation flags one canonical occurrence.

---

## 1. Directory / Gallery

### 1.1 Top-level layout — modal, not a full page

Every directory screenshot (`01-19_directory_modal-page-NN_*.png`) shows the directory rendered as a **centered dark-grey modal layered over the dimmed Customize page**. This is critical: the directory is NOT a full-screen route, it's a discoverable panel summoned from `Customize → Connectors`. The dimmed background (visible at left in `01_directory_modal-page-01...`) reveals the underlying Customize navigation: skill categories like "Legal", "Slack by salesforce", "Common room", "Brand voice", "Apollo", "Product management", "Productivity", "Enterprise search", "Sales", "Finance", "Data", "Marketing", "Design", "Engineering", "Operations", "Customer support". The modal's close affordance is a small `×` glyph at the top-right (visible all 19 pages, e.g. `01_directory_modal-page-01...`).

The body is a **two-column card grid**, two cards per row, scrollable vertically — pages 01–19 are scroll snapshots of a single contiguous list, **not a paginated UI** (no page numbers, dots, or Next button visible at the bottom of any frame). At ~10 visible cards per page × 19 captured pages, the live directory holds ~190 connectors.

There is no hero/featured banner above the grid. The header strip is just:

1. Title `Connectors` (large, white, ~24-28px sans-serif).
2. Subtitle: "Connect Claude to your apps, files, and services. Connectors are built by third parties and reviewed by Anthropic for safety. You can also add a custom connector." (`custom connector` is a hyperlinked underlined string — visible all pages).
3. A row of controls (search + 3 dropdowns).

### 1.2 Categorization

The directory itself does **not** group cards by category headings. Instead categorization is exposed through the **`Categories ▽` dropdown** (top-right of the controls row, `01_directory_modal-page-01...`). Cards are presented as a flat alphabetical-ish stream interrupted only by a few high-priority promo cards at the very top. The left-rail Customize sidebar carries category labels (Legal, Common room, Brand voice, Apollo, Product management, Productivity, Enterprise search, Sales, Finance, Data, Marketing, Design, Engineering, Operations, Customer support) but those drive the user's installed-skill scope, not the connector directory's grouping.

**Grouping inferred from filter dropdowns** — the `Type ▽` and `Categories ▽` filters strongly suggest server-side faceting; the Type filter likely toggles between Web / Desktop / Custom (matching the `Web` / `Desktop` / `Not connected` section dividers seen in the _installed list_ at `claude-desktop/24_connector-detail_gmail-tool-permissions.png`).

**Inferred categories from card content across all 19 pages:**

- Productivity / docs: Notion, Zoho Desk, Zoho Projects, Zoho Books, Zoho CRM, Box, Coupler.io, Egnyte, Drafts, Apple Notes, Mem, Sanity, Craft, Gamma, Mailtrap.
- Communication: Slack, Gmail, Google Calendar, Calendly, Fantastical, Jam, Crossbeam, Outreach, MailerLite, Mailtrap, Customer.io, Klaviyo, Send Stripe MCP, ElevenLabs, Tomba, Ramp, Lumin, SignWell.
- Dev / engineering: Vercel, GitHub Integration, Sentry, Supabase, Cloudflare Developer Platform, Cloudflare Asset Mgmt, PlanetScale, MotherDuck, Snowflake, Databricks, Honeycomb, Grafana MCP, PostHog, Bigdata.com, n8n, Make, Airtable, Linear, ClickUp, Asana, Atlassian Rovo, Postman MCP, Render, NetSuite, Webflow, Wix, Stytch, Clerk, Port IO, Lumin.
- Design / creative: Figma, Canva, Mermaid Chart, Three.js 3D Viewer, BioRender, Excalidraw, Cloudinary, ElevenLabs Player, ElevenLabs Agents.
- Search / research: Hugging Face, S&P Global, Ahrefs, PubMed, Scholar Gateway, Mixpanel, Pendo, Amplitude, Clay, Pitchbook Premium, CB Insights, Clinical Trials, Visier, Common Room, Apollo.io, Indeed, Microsoft Learn, Context7, Glean, FactSet AI-Ready, Morningstar.
- Finance / payments: Stripe, PayPal, QuickBooks, Square, Crypto.com, Granted, Intuit TurboTax, Yardi Virtuoso, Daloopa, Vendr, Mercury, Plaid Developer Tools, Gusto, Coupler.io, Brex, LegalZoom.
- Specialized / vertical: Q2, Clarity AI, Owkin (biology agents), Medidata (clinical trials), Blockscout (blockchain), Aura (workforce analytics), Yardi (real estate), bioRxiv, ChEMBL, ICD-10 Codes, NPI Registry, Wyndham Hotels, Trivago, DirectBooker, Sprouts Data, Massive Market Data, Moody's, Udemy Business, Spotify (AppleScript), TomTom Maps MCP.
- Desktop-class (system-level): Filesystem, PowerPoint (By Anthropic), Word (By Anthropic), Excel (By Anthropic), Desktop Commander, Control your Mac, Control Chrome, Read and Write Apple Notes, Apify, Read and Send Messages, Windows-MCP, Android-MCP, Apple Notes, PDF Tools, pdf-viewer, Tableau.
- Generic AI/ops: Zapier, Workato, Pylon, Pylon Support, Operations.

Page 14 (`14_directory_modal-page-14-alayyn-cb-insights-clinical-trials.png`) carries multiple `New` orange pill badges (Alayyn Tax, Process Street, Gainsight (Staircase AI), DocuSeal, DataGrail, Bencting, Fever Event Discovery, Tango, Dremio Cloud, Jentic) suggesting this page is a recently-added cohort.

### 1.3 Search bar

Top-left of the controls row across **every** directory page. Pixel detail (`08_directory_modal-page-08...`):

- Single-line input, dark-grey rounded-rectangle background.
- Placeholder text: `Search` (no example query, no magnifying-glass icon visible in the resting state).
- Width is approximately 1/3 of the modal width; flush-left.
- No type-ahead suggestions visible in any captured frame (i.e., no user query was being typed when the screenshots were taken — search resting state only).

### 1.4 Filters / sort

Three pill-style dropdowns sit to the right of the search input on every page (`01_directory_modal-page-01...`):

- `Sort ▽` — order (alphabetical / popular / recently-added / etc., dropdown contents not captured).
- `Type ▽` — likely Web / Desktop / MCP server / Custom — substantiated by the "Type" facet showing in installed-list (`claude-desktop/15_settings-connectors-desktop-tools.png` shows a `DESKTOP` pill on each card next to its name, e.g. `Apify DESKTOP`, `Context7 DESKTOP`, `Control your Mac DESKTOP`, `Desktop Commander DESKTOP`).
- `Categories ▽` — taxonomic facet matching the inferred categories above.

All three use the same down-caret + light-grey label styling. None of the captured frames show the dropdowns expanded, so we can't enumerate option text.

### 1.5 Per-card visual

Each card is a **horizontal pill** approximately 280-300 px wide × 64-72 px tall (`01_directory_modal-page-01...`):

- Left: 32×32 connector logo (rounded square, full color brand mark — Gmail's red multi-stripe `M`, Notion's white-on-dark `N`, Slack's hash, Vercel's monochrome triangle, etc.).
- Mid: connector name in white + small inline badges right of name (`Popular` orange pill, `Trending` green pill, `New` orange pill, `Beta` grey pill, `Limited` grey pill — see Section 2.3). Below name is a one-to-two-line description in muted grey.
- Right: install affordance, either a plain `+` glyph (e.g. Notion in `01_directory_modal-page-01...`) or a `✓` (e.g. Gmail in `01_directory_modal-page-01...`, Google Drive in `04_directory_modal-page-04...`, Filesystem & pdf-viewer in `15_directory_modal-page-15...`, Read and Write Apple Notes in `16_directory_modal-page-16...`).

The `+` denotes "available — click to install/connect"; the `✓` denotes "already installed/connected" (verified by cross-referencing — Gmail and Google Drive show "Connected" status in the installed list at `claude-desktop/14_settings-connectors-web-integrations.png`). No card surfaces a star rating, install count, or version number anywhere in the directory; install state is binary.

---

## 2. Per-Connector Detail

### 2.1 Detail layout

Two distinct detail surfaces exist:

(a) **OAuth grant modal** for cloud connectors — `claude-desktop/33_connector-oauth-flow_slack-grant-access-modal.png`, `34_connector-overview_slack-details.png`. A child modal slides over the directory modal. Header: Slack logo + name + "Send messages, create canvases, and fetch Slack data" + a `Connect` button (top-right). Body: two preview cards showing example chat messages ("Draft Sean a message about attending our next startup event", "Take last week's update and draft Jerome a message recapping everything") with embedded card thumbnails — i.e., **demonstration of what the connector can do, not raw API docs**. Below the demos: full description ("Connect to Slack to share messages and create canvases directly to simplify collaboration and boost productivity..."), then `Developed by Slack ↗` (link icon — externally opens slack.com), then a trust statement: "Only use connectors from developers you trust. Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change." (`33_*` and `34_*` show this is identical text; `33_*` includes a translucent "Grant access to Slack" overlay panel showing the Claude-→-Slack handshake mid-flight).

(b) **Per-connector permissions surface** for installed connectors — `claude-desktop/23_connector-permissions-dropdown_airtable.png` through `32_connectors-list_apple-notes-selected.png`. This is a three-column detail layout inside Customize: left rail (skill categories), middle rail (connector list grouped by `Web` / `Desktop` / `Not connected`), right pane (selected connector's detail).

The right pane shows: connector logo + name (large), `Disconnect` button (top-right) for OAuth-class, OR `Uninstall` button for desktop-class with an `Enabled` toggle directly under the name (`27_connector-detail_control-your-mac.png`, `28_connector-detail_desktop-commander-permissions.png`, `29_connector-detail_excel-blocked-permissions.png`, `30_connector-detail_filesystem-settings.png`).

Below the name: a one-paragraph description ("Bring strategic data and context into the flow of your Claude conversations…" for Airtable in `23_*`; "Connect Gmail to Claude to quickly find important emails and understand long conversations…" for Gmail in `24_*`; "Vercel MCP is Vercel's official MCP server, allowing you to search and navigate documentation, manage projects and deployments…" for Vercel in `26_*`).

Then a `Tool permissions` block. Tools are grouped by **Read-only tools / Write/delete tools / Interactive tools / Other tools**, each row collapsible (down-caret next to group name + tool count, e.g. "Read-only tools 6" or "Write/delete tools 8").

Each tool row exposes three small action-glyphs on the right (a green-check, a yellow-clock, a red-circle-slash — see Section 3.4). To the right of each _group_ heading sits a per-group default selector showing `Always allow ▽`, `Needs approval ▽`, or `Blocked ▽` (`23_*` shows the dropdown expanded with options: `Always allow` / `Needs approval` / `Blocked` / `Custom`).

### 2.2 Documentation surface

Every detail page surfaces the description inline plus an external link. For OAuth-class: `Developed by [Vendor] ↗` linking out (`34_connector-overview_slack-details.png`). For desktop-class: a small external-link arrow `↗` next to the connector name in the header (visible at `27_connector-detail_control-your-mac.png` to right of "Control your Mac"). For GitHub Integration (`25_connector-detail_github-integration-info.png`) the description is unusually feature-led: bullets explain each surface where the connector activates — "Chat — Attach files directly from a repo when asking Claude a question. Projects — Sync repository files into a Project so Claude always has your codebase as context. Claude Code — Select repositories, browse branches, and track pull requests in remote coding sessions. And more — Power repository selection across code review, admin settings, and other GitHub-backed features."

### 2.3 Required scopes / OAuth preview

Slack OAuth flow (`33_connector-oauth-flow_slack-grant-access-modal.png`, `34_connector-overview_slack-details.png`) lists raw tool/scope identifiers as a tag-cloud of **chip pills** at the bottom under a `Tools 11` heading: `slack_send_message`, `slack_search_public_and_private`, `slack_search_users`, `slack_search_channels`, `slack_search_public`, `slack_read_channel`, `slack_read_thread`, `slack_create_canvas`. This is the **scope preview before consent** — user can see exactly which calls the connector will make.

For native OAuth (Slack/Google/etc.) the grant modal (`33_*`) shows a pictorial three-step indicator: Claude logo — bridge icon — Slack logo — caption "Complete the sign-in steps in the new browser tab. Didn't work? Relaunch the tab." This is a **passive wait state** while Claude listens for the OAuth callback.

### 2.4 Required env vars / API keys / config fields

Most cloud connectors don't surface raw config — OAuth handles credentials. The exception is the **Filesystem connector** (`30_connector-detail_filesystem-settings.png`) which shows an `Allowed Directories (Required)` section with subtitle "Select directories the filesystem server can access". Body: a row with `/Users/siddhartha/Desktop` followed by a folder icon (browse) and an `×` (remove), plus an `+ Add directory` outlined button. Below that, a `Save` filled button (sage green) sits flush-right. This pattern is the **canonical template for any connector that needs structured configuration before it works**.

Custom connectors show a third pattern via `claude-desktop/19_settings-desktop-app-developer-mcp-servers.png` (`Settings → Developer → Local MCP servers`). Detail panel for Filesystem MCP server shows `Command: node` and `Arguments: /Users/siddhartha/Library/Application Support/Claude Extensions/ant.dir.ant.anthropic.filesystem/server/index.js /Users/siddhartha/Desktop` — i.e., raw exec command + args list. There's an `Edit Config` button (top of left list) and a `View Logs` button (bottom of detail). Status pill `running` next to server name confirms a live process indicator.

### 2.5 Install button microcopy

Three distinct verbs based on connector class (`claude-desktop/14_settings-connectors-web-integrations.png` shows them side-by-side):

- **`Connect`** — for cloud OAuth (Google Calendar, n8n in `14_*`; Slack in `33_*`/`34_*`).
- **`Configure`** — for connectors needing config but not OAuth (Airtable, Gmail, Vercel, Apify in `14_*`/`15_*` — note these are already authed but still show `Configure` rather than `Manage`, suggesting `Configure` covers re-config + tool-permissions adjustment).
- **`Connected`** — read-only state-pill, sage-green text, for cloud connectors that are actively authed (Google Drive, GitHub Integration in `14_*`).

Inside the directory grid itself, the install gesture is the bare `+` glyph — no text label. Hovering presumably surfaces a tooltip but no hover state was captured.

### 2.6 Uninstall / disconnect flow

Two button variants depending on class (`claude-desktop/27_*`, `28_*`, `29_*`, `30_*`, `32_*` for desktop; `23_*`, `24_*`, `26_*` for cloud):

- **`Disconnect`** (cloud OAuth, e.g. Airtable, Gmail, Vercel) — outlined button, top-right of the right pane.
- **`Uninstall`** (desktop/MCP, e.g. Control your Mac, desktop-commander, Excel, Filesystem, Notes) — outlined button, top-right.

Desktop-class connectors get an additional `Enabled` toggle (cyan filled when on, grey when off) directly under the connector name (`27_*`, `28_*`, `29_*`, `30_*`). This is **separate** from uninstall — toggle it off and the connector remains installed but Claude can't call its tools. No confirmation dialog was captured for either flow.

### 2.7 Per-tool permission scopes

Permission control is granular **per individual tool**, not just per-connector. The Vercel detail (`26_connector-detail_vercel-tool-permissions.png`) lists ten tools individually: `check_domain_availability_and_price`, `get_access_to_vercel_url`, `get_deployment`, `get_deployment_build_logs`, `get_project`, `get_runtime_logs`, `get_toolbar_thread`, `list_deployments`, `list_projects`, `list_teams`, `list_toolbar_threads`. Each row has the same three glyphs:

1. **Green check** (left) — explicit `Always allow`.
2. **Yellow clock** (middle) — `Needs approval` (will prompt user mid-conversation).
3. **Red slash-circle** (right) — `Blocked`.

The desktop-commander detail (`28_*`) shows the same control over twelve `Read-only tools` (`Read Multiple Files`, `List Directory Contents`, `Start Search`, `Get Search Results`, `List Active Searches`, `Get File Information`, `Read Process Output`, …) and two `Interactive tools` (`Get Configuration`, `Read File or URL`). The Filesystem detail (`30_*`, `31_*`) covers thirteen tools split across `Read-only tools 9` (`Read File (Deprecated)`, `Read Text File`, `Read Multiple Files`, `List Directory`, `List Directory with Sizes`, `Directory Tree`, `Search Files`, `Get File Info`, `List Allowed Directories`), `Write/delete tools 4` (`Write File`, `Edit File`, `Create Directory`, `Move File`), and `Other tools 1` (`Copy file to Claude`).

Excel (`29_connector-detail_excel-blocked-permissions.png`) shows the **fully blocked state**: every tool name is rendered grey/disabled, with the per-group selector locked at `Blocked`. The connector is still `Enabled` but no tools can fire — useful "kill switch" UX.

---

## 3. Connector States

### 3.1 Available vs Installed vs Auth-needed

In the directory grid:

- **Available** — `+` glyph on the right.
- **Installed/connected** — `✓` glyph on the right (Gmail, Google Drive, Filesystem, pdf-viewer, Read and Write Apple Notes).

In the installed-list pane (`claude-desktop/14_settings-connectors-web-integrations.png`):

- **Connected** — sage-green text label, no button (Google Drive, GitHub Integration).
- **Configure** — outlined button (Airtable, Gmail, Vercel — these are authed but the action surface lets the user revisit permissions).
- **Connect** — outlined button (Google Calendar, n8n — authed-but-needs-action OR not yet authenticated).

The middle rail in the detail layout (`23_*` through `32_*`) groups installed connectors as `Web` / `Desktop` / `Not connected`. The `Not connected` group at the bottom (`24_*`) lists `Airtable`, `Google Calendar`, `n8n`, `Tableau` — these are connectors the user has shown intent to install but haven't completed auth.

### 3.2 Disabled / disconnected indicator

Excel detail (`29_*`) is the canonical example. The `Enabled` toggle stays on (cyan), but every tool name is rendered light-grey rather than white, and the per-group dropdown is locked at `Blocked`. Greyed text alone signals "this tool will not run."

For OAuth connectors that have been disconnected, users return to the directory and the card flips back to the `+` glyph state (inferred — no captured screenshot of post-disconnect state).

### 3.3 Update available indicator

**Not visible in any captured screenshot.** No version number is exposed on cards, in the detail header, or near the Disconnect/Uninstall button. Anthropic's MCP servers update through Claude's binary updates (`Settings → Desktop app → Extensions` at `claude-desktop/18_*` mentions "Drag .MCPB or .DXT files here to install") rather than per-connector versioning. This is a **gap relative to a typical app store** — users have no signal that a connector's tool surface has changed since they last reviewed permissions.

### 3.4 Three-glyph control row

Three small icon buttons appear at the right of every individual tool row (visible at `23_*`, `24_*`, `26_*`, `28_*`, `30_*`, `32_*`). Reading left-to-right:

1. Green check (`✓` in a circle) — set "Always allow" for this specific tool.
2. Yellow clock (face icon, amber tint) — set "Needs approval" (prompt mid-chat).
3. Red circle-slash — set "Blocked".

Selected state is shown by the icon being filled rather than outlined. Tools inherit their _group's_ default until the user clicks one of the three glyphs to override.

---

## 4. Featured / Curated, Verified, Anthropic-built

### 4.1 Anthropic-built distinction

Three connectors carry the `(By Anthropic)` suffix in the directory: `PowerPoint (By Anthropic)`, `Word (By Anthropic)`, `Excel (By Anthropic)` (`15_directory_modal-page-15-zoho-filesystem-pdf-figma-tableau.png`). These are **first-party desktop connectors** for Microsoft Office automation and ship pre-bundled. The suffix also surfaces in the installed-list (`claude-desktop/15_settings-connectors-desktop-tools.png`: `Excel (By Anthropic) DESKTOP`).

### 4.2 Trust badging — chips inline with name

Four distinct chip badges appear in the captured pages, color-coded:

- **`Popular` (orange/red pill)** — Gmail, Canva, Google Calendar, Notion, Slack, Figma (all `01_*`); Vercel, Sentry, Atlassian Rovo, HubSpot, Linear, Box, Miro (`01_*`/`02_*`); Filesystem, Windows-MCP, pdf-viewer, Apify (`15_*`); Read and Write Apple Notes, Control your Mac (`16_*`).
- **`Trending` (green pill)** — Calendly (`07_*`), Quartr (`12_*`), Tavily (`09_*`), Granted (`12_*`), Intuit TurboTax (`11_*`), Fever Event Discovery (`14_*`), tldraw (`06_*`).
- **`New` (orange pill)** — Mixpanel (`06_*`), Craft (`10_*`), Krisp (`10_*`), Q2 (`13_*`), Process Street (`14_*`), DocuSeal (`14_*`), Bencting (`13_*`), Gainsight (Staircase AI) (`13_*`), Tango (`13_*`), Dremio Cloud (`13_*`), Jentic (`13_*`), pg-elguide (`13_*`), Intapp Celeste (`13_*`), Alayyn Tax (`14_*`), DataGrail (`14_*`), Starburst (`14_*`).
- **`Interactive` (small grey/white pill)** — Excalidraw (`02_*`), Asana (`02_*`), Indeed (`02_*`), Klaviyo (`05_*`), Postman (`05_*`), Gusto (`08_*`), Amplitude (`14_*`).
- **`Beta` (grey pill)** — Apollo.io (`03_*`).
- **`Limited` (grey pill)** — Mistplay/Clarify-style cards on `11_*` (Aura, Clerk).

There's **no explicit `Verified` or `Official` badge** — the curation signal is the directory's body copy itself: "Connectors are built by third parties and **reviewed by Anthropic for safety**." Trust messaging is centralized at the modal header rather than per-card.

### 4.3 Recommendation for current user

No "Recommended for you" rail is visible in any captured directory page. The `Popular` + `Trending` chips do soft-curation but aren't user-personalized. The first ~6 cards (Gmail, Canva, Google Calendar, Notion, Slack, Figma) appear to be a global default top-of-list rather than a user-tailored list.

---

## 5. MCP-Specific

### 5.1 MCP server vs Connector distinction

The directory **does not surface MCP-vs-OAuth as a primary axis**. Instead the distinction is implicit in card naming:

- Cards named `[Vendor] MCP Server` or `[Vendor] MCP` (e.g. `Windows-MCP`, `Android-MCP`, `Postman MCP Server (Minimal)`, `Drafts MCP Server`, `AWS API MCP Server`, `Enrichr MCP Server`, `Massive Market Data MCP Server`, `Kubernetes MCP Server`, `Kapture Browser Automation MCP`, `Metabase MCP Server`, `Ziscaler MCP Server`, `Cloudglue MCP Server`, `Microsoft Clarity MCP Server`, `Cloudinary Asset Management MCP Server`, `Shaden UI MCP Server`, `ElevenLabs Agents MCP App`, `Grafana MCP Server`, `Growthbook MCP Server`, `Docling MCP`, `ToolUniverse`, `SAP Fiori MCP Server`, `SAPUS MCP Server`, `PopHIVE Public Health Data`, `MeetGeek`, `MCP Instana Server`, `10x Genomics Cloud`, `Vendr Software Pricing Tools`, `TomTom Maps MCP`, `Tomba MCP Server`, `PanOS MCP`, `KARP Inspector Lite`, `SAP CAP MCP Server`, `Pathmode`, `SAP MDK MCP Server`, `SignWell`, `Vybit Notifications`, `Defense.com Threat Analysis`, `Jaz Accounting`, `Dynatrace MCP Server`, `Conviso MCP Server`, `Migpo Public API MCP Server` — pages 16-19) are clearly MCP-class.
- Cards without that suffix can be either OAuth/cloud or MCP — no visible discriminator other than naming convention.
- Type filter likely discriminates: see Section 1.4.

### 5.2 Custom MCP server add flow

Two entry points visible:

(a) **From the directory** — the modal header text reads "You can also add a `custom connector`" — the underlined string is a hyperlink (`01_*` through `19_*`). Clicking presumably opens an `Add custom connector` flow not captured in this set. The standalone `+ Add custom connector` button at the bottom of the installed-list (`claude-desktop/15_settings-connectors-desktop-tools.png`) is the second entry. There's no visible "URL / command / env vars / transport" form in this screenshot set, but the developer MCP-servers panel (`claude-desktop/19_settings-desktop-app-developer-mcp-servers.png`) reveals what custom config looks like once added: `Command` (e.g. `node`), `Arguments` (long absolute path + script + arg list), and a `View Logs` action. The transport (stdio vs HTTP vs SSE) is not exposed as a separate dropdown — implied to be stdio for local server processes.

(b) **From the Extensions panel** (`claude-desktop/18_settings-desktop-app-extensions.png`) — has a `Browse extensions` button top-right plus a drop-zone caption: "Drag .MCPB or .DXT files here to install". This is **bundle-based MCP install** — a packaged file format Anthropic ships rather than raw command-line config. Extensions installed via this drop-zone show in the same `Configure` button format as connectors (`Filesystem`, `Excel (By Anthropic)`, `Read and Write Apple Notes`, `Apify`, `Control your Mac`, `Tableau`, `Desktop Commander`, `Context7`).

Notably the Extensions and Connectors panels overlap in content — both list Filesystem, Excel, Apify, etc. The `Connectors have moved to Customize` banner at top of the legacy Settings panel (`claude-desktop/14_settings-connectors-web-integrations.png`) confirms Anthropic is mid-migration from a Settings-tab IA to a `Customize → Connectors` IA.

---

## 6. Other Surfaces

### 6.1 Onboarding for first connector

Not captured in the directory subset. The `Connectors have moved to Customize. Head to the new Customize page to manage your skills and connectors.` banner (`claude-desktop/14_*`) is the onboarding nudge for **legacy users**, not a new-user empty state. No dedicated first-run walk-through visible.

### 6.2 Connector running / status indicator

The Local MCP-server detail at `claude-desktop/19_*` shows a green `running` pill next to the server name with subtitle "This server is managed by an extension." `View Logs` button is present, suggesting per-server live log streaming. No errored / starting / stopped states captured.

The directory grid itself shows **no live status indicator** — no green dot for "currently running", no red dot for "errored". Status is only visible inside the Settings → Developer → MCP servers detail panel.

### 6.3 Empty state

No dedicated empty-state screenshot. Mid-page on the right of `08_directory_modal-page-08...` and `19_directory_modal-page-19...` we can faintly read "Slack yet." truncated text from the underlying Customize page — this is the dimmed background's onboarding prompt, not the directory's own empty state.

---

## 7. Open Questions / Things To Investigate Next

1. **Sort dropdown options.** None of the screenshots show `Sort ▽` expanded. Most plausible options are Popular / Recently added / A–Z / Recently used — but I can't confirm. **Action:** open Claude desktop and screenshot it.
2. **Custom connector add-flow form fields.** The hyperlinked "custom connector" string in the modal header presumably opens a form for URL / command / env vars / transport selection (stdio / HTTP / SSE). None of those frames are in the captured set. The closest evidence — `claude-desktop/19_*` — only shows post-install state with `Command` and `Arguments` already populated. **Action:** click the `custom connector` link in production and capture the modal.
3. **Pagination boundary.** All 19 captured pages are scroll positions of one continuous list. Whether the directory virtualizes / paginates server-side or loads all ~190 entries upfront is unclear. **Action:** instrument the network panel during scroll to watch for fetches.
4. **Hover/focus states.** No hover state visible on directory cards; install (`+`) and connected (`✓`) glyphs may have tooltip copy or expanded affordances. **Action:** capture hover-state frames.
5. **Search behavior.** Whether search is title-only, fuzzy, or also matches description / tool names was not testable from resting-state screenshots. **Action:** type queries and capture suggestion flow.
6. **Update / version diff UX.** No update-available indicator captured anywhere. If a connector adds new tools after install, does the user get re-consent? **Action:** look for `claude-desktop/*update*` / `*changelog*` screenshots; if none, ask Anthropic docs.
7. **Featured / promoted slot mechanics.** The first six cards (Gmail, Canva, Google Calendar, Notion, Slack, Figma) appear consistent across pages — but is this user-static curation or A/B'd? **Action:** capture another user's directory.
8. **Categories dropdown content.** All inferred from card content. **Action:** click `Categories ▽` and screenshot expanded.
9. **Type dropdown content.** Likely Web / Desktop / MCP / Custom. **Action:** screenshot.
10. **Disconnect confirmation.** No confirm dialog captured. Does Disconnect immediately revoke OAuth or prompt? **Action:** capture click flow.
11. **The trust statement language.** "Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change." (`33_*`) — this is the ONLY user-facing ToS-style copy. Liability / privacy implications worth pulling into AGI Workforce's connector copy.
12. **Per-group `Custom` permission option.** `23_*` shows `Custom` as a fourth dropdown option. What does Custom let you configure beyond per-tool toggles? **Action:** capture expanded Custom flow.
13. **`Apify DESKTOP` dual presence.** Apify shows up in BOTH `claude-desktop/14_*` (web/cloud) AND `claude-desktop/15_*` (desktop). Is this two separate connectors that share a name, or one connector available on two surfaces? **Action:** click into both to compare.

---

## 8. Implications for AGI Workforce

Concrete recommendations these screenshots should pin into the design spec:

- **Modal-not-route directory.** Mirror Anthropic's modal-overlay pattern instead of a dedicated page — keeps users in their conversation context. The dimmed background reinforces "this is auxiliary."
- **Three-verb install vocabulary.** `Connect` (OAuth) / `Configure` (post-auth + per-tool perms) / `Connected` (status pill). Don't use ambiguous `Add` / `Install` for everything.
- **Per-tool permission grid is the differentiator.** Per-tool Always-allow / Needs-approval / Blocked + per-group default + Custom. AGI Workforce's connector UX must match this granularity at minimum to be competitive.
- **Trust copy at the modal header, not per-card.** "Connectors are built by third parties and reviewed by [AGI Workforce] for safety" — single canonical trust statement.
- **Chip badges for `Popular` / `Trending` / `New` / `Beta` / `Interactive` / `Limited`.** Five-chip taxonomy is enough. Don't add a `Verified` chip — let "reviewed by..." copy do that work.
- **Surface raw scopes/tools at consent time.** Slack OAuth modal's tag-cloud of scope names (`slack_send_message`, `slack_search_users`, …) is a strong privacy-honoring pattern.
- **Filesystem-class connectors need a config form.** `Allowed Directories (Required)` + add/remove rows + `Save` button is the canonical template for any connector with structured config.
- **`(By [Org])` suffix for first-party connectors.** `Excel (By Anthropic)`-style naming distinguishes vendor-built vs first-party without needing an extra badge.
- **MCP server bundling via .MCPB / .DXT.** Drop-zone install for packaged MCPs is faster than CLI for non-dev users. AGI Workforce should consider an analogous bundle format.
- **`Enabled` toggle separate from `Uninstall`.** Two distinct kill-switches: pause-without-uninstall vs full removal. Don't conflate.
- **What Anthropic is missing — version diff / update available.** If AGI Workforce ships a versioned connector model with tool-set-changed re-consent, that's a real differentiator.

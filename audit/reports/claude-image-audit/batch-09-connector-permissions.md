# Batch 09: Connector Detail and Permissions

Status: Complete
Auditor: Claude Opus 4.7
Date: 2026-05-24
Images audited: 14
Image base: /Users/siddhartha/Desktop/reference/ui

---

## IMG: 123_claude-max20x_customize_connectors_github-detail.png

- Feature: GitHub Integration connector detail panel showing description, use-case bullets (Chat, Projects, Claude Code, And more), Disconnect button; left sidebar lists connected (Web) and not-connected connectors with official logos
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/123_claude-max20x_customize_connectors_github-detail.png
- Implementation status: partial
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
  - apps/web/features/connectors/config/connector-logos.ts
  - apps/web/app/connectors/page.tsx
- API endpoints: /api/connectors (GET, POST, DELETE)
- Data flow:
  - User navigates to /connectors, ConnectorsPage loads
  - useEffect fetches GET /api/connectors to populate connected set
  - CONNECTORS array provides static connector metadata (id, name, description)
  - ConnectorCard renders each connector as a card in a grid layout
  - No detail panel exists -- clicking a connector has no drill-down view
  - No two-column sidebar+detail layout exists; layout is full-width card grid
- Flaws:
  - [critical] No connector detail panel -- Claude shows a master-detail layout with left sidebar listing connectors and right panel showing per-connector info; AGI only has card grid with no drill-down @ apps/web/features/connectors/pages/ConnectorsPage.tsx (entire file)
  - [critical] No sidebar connector list -- Claude has a left sidebar with "Web" (connected) and "Not connected" sections with official logos; AGI has no sidebar at all @ apps/web/features/connectors/pages/ConnectorsPage.tsx (entire file)
  - [major] No per-connector description/use-case bullets -- Claude shows GitHub detail with bullet list (Chat, Projects, Claude Code, And more); AGI only stores a one-line `description` string per connector @ apps/web/features/connectors/pages/ConnectorsPage.tsx:46-58
  - [major] Missing connectors from Claude's list -- Claude shows Xcode, Google Calendar, Google Drive, Airtable, n8n as distinct connectors; AGI combines Gmail & Calendar into one entry, has no Xcode, no n8n @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
- Visual gaps:
  - Claude uses Customize > Connectors navigation breadcrumb; AGI has flat /connectors page
  - Claude groups connectors by connection status (Web = connected, Not connected); AGI groups by Connected/Available sections in card grid
  - Claude detail panel shows large connector icon + name header with Disconnect button in top-right; AGI has no equivalent
  - Claude sidebar shows official branded logos (GitHub octocat, Gmail envelope, Vercel triangle); AGI attempts logos via external URLs that may fail to load

---

## IMG: 124_claude-max20x_customize_connectors_gmail-permissions.png

- Feature: Gmail connector detail with tool permissions UI -- read-only tools (3) with "Always allow" dropdown, write/delete tools (9) with "Needs approval" dropdown; each tool has description text and three action icons (allow/manual/block)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/124_claude-max20x_customize_connectors_gmail-permissions.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
  - apps/web/app/api/connectors/route.ts
- API endpoints: /api/connectors (no tool-permission endpoints exist)
- Data flow:
  - Claude shows per-tool permission controls for each connector
  - Each tool listed with description, categorized as read-only vs write/delete
  - Per-category permission level dropdown: "Always allow", "Needs approval", "Blocked", "Custom"
  - Per-tool override icons for fine-grained control
  - AGI stores no tool-level metadata or permission state
  - AGI API only tracks connector_id, auth_type, is_active -- no tool permissions schema
- Flaws:
  - [critical] No tool permissions system -- Claude has a full per-tool permission matrix (Always allow / Needs approval / Blocked / Custom) with category-level and tool-level overrides; AGI has zero tool permission infrastructure @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [critical] No tool inventory per connector -- Claude lists individual tools (e.g., "Retrieves a specific email thread", "Lists user labels", "Creates a new draft email"); AGI only stores `actionCount: 8` as a number with no tool details @ apps/web/features/connectors/pages/ConnectorsPage.tsx:66-73
  - [critical] No tool permission API -- no database schema, no API route, no state management for per-tool permissions @ apps/web/app/api/connectors/route.ts
  - [major] No read/write tool categorization -- Claude separates tools into "Read-only tools" and "Write/delete tools" with separate default permission levels; AGI has no concept of tool categories
- Visual gaps:
  - Claude shows collapsible tool sections with count badges
  - Claude has three per-tool action icons (allow/manual/block) for each tool row
  - Claude permission dropdown has lock icon for "Needs approval"
  - Gmail description text in Claude is much richer than AGI's one-liner

---

## IMG: 125_claude-max20x_customize_connectors_vercel-permissions.png

- Feature: Vercel connector detail with tool permissions -- 13 read-only tools listed with "Custom" permission level, each with individual tool names (check_domain_availability_and_price, get_access_to_vercel_url, get_deployment, etc.)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/125_claude-max20x_customize_connectors_vercel-permissions.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none for Vercel connector or tool permissions
- Data flow:
  - Claude shows Vercel connector with 13 read-only tools listed individually by function name
  - Each tool has three per-tool action icons
  - Category-level "Custom" dropdown for the read-only tools section
  - Vercel connector is not in AGI's CONNECTORS array at all
  - No tool permission system exists in AGI
- Flaws:
  - [critical] Vercel connector entirely absent -- Claude has a first-class Vercel connector with MCP tool listing; AGI's CONNECTORS array has no Vercel entry @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
  - [critical] No MCP tool enumeration UI -- Claude lists actual MCP server tools by function name with per-tool permissions; AGI has no way to discover or display tools from a connected MCP server @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] "Custom" permission level not supported -- Claude allows "Custom" as a category-level permission where individual tools can have different settings; AGI has no permission levels at all
- Visual gaps:
  - Claude shows three-dot menu button next to Disconnect for additional actions
  - Claude tool names are technical snake_case function names; AGI has no equivalent display
  - Claude shows per-tool allow/manual/block triple-icon pattern

---

## IMG: 23_connector-permissions-dropdown_airtable.png

- Feature: Airtable connector detail with tool permissions and expanded permission dropdown showing options: Always allow, Needs approval, Blocked, Custom; read-only tools (get_table_schema, list_bases, list_records_for_table, etc.) and write/delete tools with "Blocked" default
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/23_connector-permissions-dropdown_airtable.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
  - apps/web/app/settings/connections/page.tsx
- API endpoints: none for Airtable or tool permissions
- Data flow:
  - Claude shows full permission dropdown with 4 levels + Custom
  - Read-only tools have "Always allow"; write/delete tools have "Blocked" as default
  - Each tool row shows description and per-tool override toggles
  - Claude left sidebar shows Web + Desktop sections with "Personal plugins" section
  - AGI has no Airtable connector, no permission dropdowns, no tool inventory
- Flaws:
  - [critical] No permission dropdown component -- Claude has a 4+1 option dropdown (Always allow, Needs approval, Blocked, Custom) that appears per tool-category; AGI has no dropdown component for permissions @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [critical] No "Personal plugins" sidebar section -- Claude sidebar shows "Personal plugins" with entries like Legal, Slack by Salesforce, Common Room, Apollo, etc.; AGI has no plugin sidebar concept @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] No Desktop vs Web connector grouping -- Claude sidebar splits connectors into "Web" and "Desktop" sections; AGI has no such grouping @ apps/web/features/connectors/pages/ConnectorsPage.tsx:34-44
  - [major] Missing Airtable connector tools -- Claude shows specific Airtable tools (get_table_schema, list_bases, list_records_for_table, etc.); AGI has no Airtable connector
- Visual gaps:
  - Claude dropdown has colored icons next to permission labels (green check for Always allow, lock for Needs approval, red X for Blocked)
  - Claude sidebar shows branded icons for each personal plugin entry
  - Write/delete tools section defaults to "Blocked" with red styling

---

## IMG: 24_connector-detail_gmail-tool-permissions.png

- Feature: Gmail connector detail (March 2026 version) -- read-only tools with "Always allow" default (Get Gmail Profile, List Gmail Drafts, List Gmail Labels, Read Gmail Email, Read Gmail Thread, Search Gmail Emails) and write/delete tools with "Always allow" (Create Gmail Draft)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/24_connector-detail_gmail-tool-permissions.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
  - apps/web/app/api/connectors/route.ts
- API endpoints: /api/connectors (no tool permission schema)
- Data flow:
  - Claude lists Gmail read-only tools with human-readable names (Get Gmail Profile, etc.)
  - Per-tool toggle icons present on each row
  - Tool names use PascalCase readable format vs the May 2026 version's snake_case
  - AGI Gmail connector (id: 'gmail') has description but no tool inventory
  - AGI stores `actionCount: 8` but never enumerates the 8 actions
- Flaws:
  - [critical] No tool enumeration for Gmail -- Claude lists 7+ specific tools; AGI only says "8 actions" with no detail @ apps/web/features/connectors/pages/ConnectorsPage.tsx:62-73
  - [major] No distinction between read and write tools -- Claude separates "Read-only tools" from "Write/delete tools"; AGI has no tool categorization @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [minor] AGI names connector "Gmail & Calendar" but Claude separates Gmail and Google Calendar as distinct connectors @ apps/web/features/connectors/pages/ConnectorsPage.tsx:65
- Visual gaps:
  - Claude uses human-readable tool names (Read Gmail Email); no equivalent in AGI
  - Claude tool rows have consistent spacing with per-tool action icons
  - Claude sidebar shows Web + Desktop groupings

---

## IMG: 25_connector-detail_github-integration-info.png

- Feature: GitHub Integration detail panel (March 2026 version) showing description and use-case bullets (Chat, Projects, Claude Code, And more) with Disconnect button; sidebar lists Web connectors and Desktop connectors including Apify, Context7, Control your Mac, etc.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/25_connector-detail_github-integration-info.png
- Implementation status: partial
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
  - apps/web/features/connectors/config/connector-logos.ts
- API endpoints: /api/connectors
- Data flow:
  - Claude detail panel shows GitHub Integration with 4 use-case bullets
  - Sidebar has Desktop section with MCP connectors (Apify, Context7, Control your Mac, Desktop Commander, Excel, Filesystem, Read and Write Apple Notes)
  - Not connected section shows Airtable, Google Calendar, n8n, Tableau
  - AGI has GitHub in CONNECTORS array but no detail panel, no Desktop section, no MCP connector listing
- Flaws:
  - [critical] No Desktop connector section -- Claude shows "Desktop" connectors (Apify, Context7, Control your Mac, Desktop Commander, Excel, Filesystem, Apple Notes); these are MCP servers installed on the desktop app. AGI web has no Desktop section and no way to display locally-installed MCP servers @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] No connector detail view -- AGI has no master-detail layout; clicking a connector does nothing @ apps/web/features/connectors/pages/ConnectorsPage.tsx:699-833
  - [major] Missing connectors -- Claude lists Apify, Context7, Desktop Commander, Tableau; none of these exist in AGI's CONNECTORS array @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
- Visual gaps:
  - Claude sidebar has gear icon for Desktop section settings
  - Claude shows "Not connected" with collapsible sections
  - Claude detail panel has large branded icon header

---

## IMG: 26_connector-detail_vercel-tool-permissions.png

- Feature: Vercel connector detail (March 2026 version) showing tool permissions -- 11 read-only tools listed (check_domain_availability_and_price, get_access_to_vercel_url, get_deployment, etc.) with "Always allow" default
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/26_connector-detail_vercel-tool-permissions.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Claude lists 11 Vercel MCP tools with snake_case names
  - Each tool has per-tool action toggles
  - Category-level "Always allow" dropdown
  - Vercel is not in AGI CONNECTORS array
  - No tool listing UI exists in AGI
- Flaws:
  - [critical] Vercel connector absent from AGI @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
  - [critical] No tool permission UI for any connector @ apps/web/features/connectors/pages/ConnectorsPage.tsx
- Visual gaps:
  - Claude shows Vercel triangle icon in sidebar; AGI has no Vercel entry
  - Tool list shows 11+ read-only tools; AGI shows nothing

---

## IMG: 27_connector-detail_control-your-mac.png

- Feature: "Control your Mac" desktop connector detail -- Enabled toggle, Uninstall button, external link icon, Tool permissions section with "Other tools 1" category set to "Always allow", single tool "osascript" listed
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/27_connector-detail_control-your-mac.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Claude shows a desktop-only MCP connector with Enabled/Disabled toggle
  - Has Uninstall button (distinct from Disconnect for web connectors)
  - "Other tools" category with 1 tool (osascript)
  - Shows "View details" link at bottom
  - AGI web app has no concept of desktop MCP connectors
  - AGI has "Screen Vision" and "Browser Automation" exclusive connectors but they are web-only entries with Connect button, not toggle/uninstall
- Flaws:
  - [critical] No desktop MCP connector management -- Claude allows managing desktop-installed connectors (enable/disable toggle, uninstall, tool permissions) from the same UI; AGI has no desktop connector awareness @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] No Enabled/Disabled toggle -- Claude connectors can be toggled on/off without disconnecting; AGI only has Connect/Disconnect binary state @ apps/web/features/connectors/pages/ConnectorsPage.tsx:762-833
  - [major] No Uninstall action -- Claude desktop connectors have Uninstall button; AGI has no equivalent @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [minor] No "View details" link for connector metadata @ apps/web/features/connectors/pages/ConnectorsPage.tsx
- Visual gaps:
  - Claude shows external-link icon to open connector source
  - Enabled toggle is a styled switch component
  - "Other tools" category distinct from "Read-only" and "Write/delete"

---

## IMG: 28_connector-detail_desktop-commander-permissions.png

- Feature: Desktop Commander connector detail -- Enabled toggle, Uninstall button, tool permissions with "Interactive tools 2" (Get Configuration, Read File or URL) and "Read-only tools 12" (Read Multiple Files, List Directory Contents, Start Search, Get Search Results, List Active Searches, Get File Information, Read Process Output) categories, all set to "Always allow"
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/28_connector-detail_desktop-commander-permissions.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Claude shows 3 tool categories: Interactive tools (2), Read-only tools (12)
  - Each tool listed with human-readable name (Get Configuration, Read File or URL, etc.)
  - All categories set to "Always allow" with per-tool overrides available
  - AGI has no Desktop Commander connector and no tool category system
- Flaws:
  - [critical] No "Interactive tools" category -- Claude has three distinct tool categories (Interactive, Read-only, Write/delete); AGI has zero tool categorization @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [critical] Desktop Commander connector absent -- AGI has no equivalent to this MCP connector @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
  - [major] No tool listing with human-readable names -- Claude shows "Get Configuration", "Read File or URL", "List Directory Contents", etc.; AGI has no tool name display
- Visual gaps:
  - Claude shows tool count badge per category section header
  - "Interactive tools" is a third category beyond read-only and write/delete
  - Each tool row has consistent icon triplet for allow/manual/block

---

## IMG: 29_connector-detail_excel-blocked-permissions.png

- Feature: Excel (By Anthropic) connector detail -- Enabled toggle, Uninstall button, tool permissions with all categories (Read-only tools 3, Write/delete tools 5) set to "Blocked"; tools listed: open_workbook, get_cell_value, get_range_values (read), create_workbook, set_cell_value, set_range_values, insert_formula, create_chart, save_workbook (write)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/29_connector-detail_excel-blocked-permissions.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Claude shows Excel connector with all permissions "Blocked" by default
  - This demonstrates the "Blocked" permission level applied to entire categories
  - Read-only (3 tools) and Write/delete (5 tools) both blocked
  - AGI has no Excel connector and no blocked-permission concept
- Flaws:
  - [critical] No "Blocked" permission state -- Claude can block entire tool categories for a connector; AGI has no permission states at all @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [critical] Excel connector absent -- AGI CONNECTORS array has no Excel entry @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
  - [major] No per-category default permission with visual indicator -- Claude shows red/blocked styling for disabled categories; AGI has no visual differentiation
- Visual gaps:
  - "Blocked" dropdown shown in red/muted styling
  - All tool action icons show blocked/disabled state
  - "(By Anthropic)" attribution label on connector name

---

## IMG: 30_connector-detail_filesystem-settings.png

- Feature: Filesystem connector detail with settings panel -- "Allowed Directories (Required)" section with directory path input (/Users/siddhartha/Desktop), folder browse button, delete button, "+ Add directory" button, Save button; below that Tool permissions with Read-only tools 9 set to "Always allow" (Read File (Deprecated), Read Text File, Read Multiple Files, List Directory, List Directory with Sizes)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/30_connector-detail_filesystem-settings.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Claude shows connector-specific settings (allowed directories) above tool permissions
  - Directory path input with browse and delete icons
  - Save button persists directory configuration
  - Below settings, standard tool permission matrix
  - AGI has a "Local Filesystem" connector in CONNECTORS but it is a static card with no settings or directory configuration @ apps/web/features/connectors/pages/ConnectorsPage.tsx:400-412
- Flaws:
  - [critical] No connector-specific settings -- Claude Filesystem connector has directory allowlist configuration; AGI Local Filesystem connector has no settings panel @ apps/web/features/connectors/pages/ConnectorsPage.tsx:400-412
  - [critical] No directory path management -- Claude allows adding/removing allowed directories with file browser; AGI has no equivalent @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] No Save button pattern for connector configuration -- Claude shows explicit Save button for directory settings; AGI has no connector configuration persistence
- Visual gaps:
  - Claude shows file path input with folder-browse icon button
  - "+ Add directory" button for multi-directory support
  - "Read File (Deprecated)" label shows deprecation awareness in tool listing

---

## IMG: 31_connectors-list_filesystem-selected.png

- Feature: Filesystem connector detail scrolled down -- showing remaining read-only tools (Read Text File, Read Multiple Files, List Directory, List Directory with Sizes, Directory Tree, Search Files, Get File Info, List Allowed Directories) and Write/delete tools 4 set to "Always allow" (Write File, Edit File, Create Directory, Move File), plus "Other tools 1" (Copy file to Claude)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/31_connectors-list_filesystem-selected.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Continuation of Filesystem connector showing full tool inventory
  - 9 read-only tools + 4 write/delete tools + 1 "Other" tool = 14 total
  - "Other tools" is a third category (Copy file to Claude)
  - AGI Local Filesystem has `actionCount: 8` -- significantly fewer than Claude's 14
  - No tool listing exists in AGI
- Flaws:
  - [major] Incorrect actionCount -- AGI says 8 actions for Local Filesystem; Claude shows 14 distinct tools. The count is misleading since tools are never enumerated @ apps/web/features/connectors/pages/ConnectorsPage.tsx:407
  - [major] No "Other tools" category -- Claude has three categories (Read-only, Write/delete, Other); AGI has zero @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [minor] "View details" link at bottom of tool list absent from AGI
- Visual gaps:
  - Claude shows "Copy file to Claude" as a special "Other tools" category
  - Full tool list is scrollable within the detail panel
  - Consistent per-tool icon pattern across all categories

---

## IMG: 32_connectors-list_apple-notes-selected.png

- Feature: Apple Notes connector detail (labeled "Notes") -- Enabled toggle, Uninstall button, Tool permissions with "Other tools 4" set to "Blocked" (list_notes, get_note_content, add_note, update_note_content)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/32_connectors-list_apple-notes-selected.png
- Implementation status: missing
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: none
- Data flow:
  - Claude shows Apple Notes connector with 4 tools all in "Other tools" category
  - All tools are "Blocked" by default
  - Tool names: list_notes, get_note_content, add_note, update_note_content
  - Connector labeled "Notes" in detail, "Read and Write Apple Notes" in sidebar
  - AGI has no Apple Notes connector
- Flaws:
  - [critical] Apple Notes connector absent -- Claude has a first-party Notes connector for macOS; AGI has no equivalent @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
  - [major] No "Other tools" as sole category -- Claude allows connectors where all tools fall under "Other tools" instead of read/write; AGI has no tool categories
  - [minor] Sidebar shows different label ("Read and Write Apple Notes") than detail panel ("Notes") -- demonstrates aliasing pattern AGI doesn't support
- Visual gaps:
  - "Blocked" state shown for entire "Other tools" category
  - Only 4 tools listed -- demonstrates small connector support
  - "View details" link at bottom

---

## IMG: 34_connector-overview_slack-details.png

- Feature: Slack connector pre-connection overview dialog -- shows Slack logo, name, description ("Send messages, create canvases, and fetch Slack data"), Connect button, example use-case preview cards, "Developed by Slack" attribution with external link, trust disclaimer, Tools section listing 11 tools as tag chips (slack_send_message, slack_search_public_and_private, slack_search_users, etc.)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/34_connector-overview_slack-details.png
- Implementation status: partial
- Primary files:
  - apps/web/features/connectors/pages/ConnectorsPage.tsx
- API endpoints: /api/connectors
- Data flow:
  - Claude shows a pre-connection overview modal/dialog before actually connecting
  - Dialog includes: logo, name, description, use-case preview cards, developer attribution, trust disclaimer, tool listing as chips
  - User reads overview then clicks "Connect" to authorize
  - AGI connector card has a Connect button that immediately calls POST /api/connectors with no preview
  - AGI has Slack in CONNECTORS array but with basic card view only
- Flaws:
  - [critical] No pre-connection overview dialog -- Claude shows a rich overview (description, examples, attribution, trust warning, tool list) before connecting; AGI immediately calls the API on Connect click with no preview @ apps/web/features/connectors/pages/ConnectorsPage.tsx:921-957
  - [critical] No developer attribution -- Claude shows "Developed by Slack" with external link and trust disclaimer; AGI has no developer/publisher metadata per connector @ apps/web/features/connectors/pages/ConnectorsPage.tsx:46-58
  - [critical] No trust/safety disclaimer -- Claude warns "Only use connectors from developers you trust. Anthropic does not control which tools developers make available"; AGI has no equivalent safety messaging @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] No tool listing as chips -- Claude shows tool names as tag chips (slack_send_message, etc.) with count; AGI only shows `actionCount: 5` @ apps/web/features/connectors/pages/ConnectorsPage.tsx:99-109
  - [major] No example use-case preview cards -- Claude shows visual preview cards of how the connector is used in conversation; AGI has no equivalent
  - [minor] Tool count mismatch -- Claude shows 11 Slack tools; AGI says `actionCount: 5` @ apps/web/features/connectors/pages/ConnectorsPage.tsx:104
- Visual gaps:
  - Claude modal has "Back" button and close icon
  - Use-case preview cards show simulated chat messages
  - Tool chips are styled as pill badges
  - "Developed by" section has external link icon

---

## Summary of Systemic Gaps

### Architecture-Level Missing Features

1. **Master-detail layout** (14/14 images): Claude uses a persistent left sidebar with connector list + right detail panel. AGI has a flat card grid with no detail view. This is the single largest architectural gap.

2. **Tool permissions system** (10/14 images): Claude has a complete per-tool permission matrix with 4 levels (Always allow, Needs approval, Blocked, Custom), per-category defaults, and per-tool overrides. AGI has zero tool permission infrastructure -- no schema, no API, no UI.

3. **Tool inventory per connector** (10/14 images): Claude enumerates actual MCP tools by name with descriptions and categories (Read-only, Write/delete, Interactive, Other). AGI only stores a static `actionCount` number.

4. **Desktop connector management** (6/14 images): Claude manages desktop-installed MCP connectors (Enabled toggle, Uninstall, tool permissions) from the same web UI. AGI web has no awareness of desktop MCP servers.

5. **Pre-connection overview** (1/14 images): Claude shows a rich preview dialog before connecting with developer attribution, trust disclaimer, example cards, and tool listing. AGI immediately connects.

6. **Connector-specific settings** (1/14 images): Claude Filesystem connector has directory allowlist configuration. AGI connectors have no per-connector settings.

### Data Model Gaps

| Field | Claude | AGI |
|-------|--------|-----|
| Tool list per connector | Full tool inventory with names, descriptions, categories | `actionCount` number only |
| Tool permission state | Per-tool (allow/manual/block) + per-category default | None |
| Connector grouping | Web / Desktop / Personal plugins | Single flat list with phase-based gating |
| Developer attribution | Publisher name + link + trust disclaimer | None |
| Enable/disable toggle | Yes (distinct from connect/disconnect) | No (binary connect/disconnect only) |
| Connector settings | Per-connector config (e.g., allowed directories) | None |
| Tool categories | Read-only / Write-delete / Interactive / Other | None |

### Files Requiring Changes

| File | Priority | Changes Needed |
|------|----------|----------------|
| `apps/web/features/connectors/pages/ConnectorsPage.tsx` | P0 | Complete rewrite to master-detail layout with sidebar, detail panel, tool permissions |
| `apps/web/app/api/connectors/route.ts` | P0 | Add tool permissions CRUD endpoints, tool inventory endpoint |
| `apps/web/features/connectors/config/connector-logos.ts` | P1 | Add missing connectors (Vercel, Xcode, Airtable, Apple Notes, Desktop Commander, etc.) |
| New: `apps/web/features/connectors/components/ToolPermissions.tsx` | P0 | Tool permission matrix component with category defaults and per-tool overrides |
| New: `apps/web/features/connectors/components/ConnectorDetail.tsx` | P0 | Detail panel with description, settings, tool permissions |
| New: `apps/web/features/connectors/components/ConnectorSidebar.tsx` | P0 | Left sidebar with Web/Desktop/Not connected groupings |
| New: `apps/web/features/connectors/components/ConnectorOverview.tsx` | P1 | Pre-connection overview dialog with attribution and trust warning |
| New: DB migration for tool_permissions table | P0 | Schema for per-user, per-connector, per-tool permission state |

### Connector Inventory Gaps

Connectors present in Claude but absent from AGI:
- Vercel
- Xcode
- Airtable (in AGI's "Not connected" concept but not in CONNECTORS array)
- Google Calendar (merged into "Gmail & Calendar" in AGI)
- n8n
- Apify
- Context7
- Control your Mac
- Desktop Commander
- Excel (By Anthropic)
- Filesystem (desktop MCP -- AGI has "Local Filesystem" but as a web exclusive, not desktop MCP)
- Read and Write Apple Notes
- Tableau
- Google Drive (in both, but Claude has it as a separate web connector)

### Critical Count

- Critical flaws: 22
- Major flaws: 17
- Minor flaws: 4
- Cosmetic flaws: 0

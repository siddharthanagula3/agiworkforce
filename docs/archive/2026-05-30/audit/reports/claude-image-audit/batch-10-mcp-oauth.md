# Batch 10 Audit: Custom MCP + OAuth + Warnings

Audited: 2026-05-24
Branch: audit/preexisting-remediation-2026-05-23
Auditor: Claude Opus 4.7

---

## IMG: 127_claude-max20x_custom-remote-mcp-connector-modal.png

- **Feature:** Modal dialog for adding a custom remote MCP connector. Shows Name field, Remote MCP Server URL field, Advanced Settings collapsible, BETA badge, trust warning ("Only use connectors from developers you trust"), "Building an MCP server?" link, Cancel/Add buttons.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/127_claude-max20x_custom-remote-mcp-connector-modal.png
- **Implementation status:** partial
- **Primary files:**
  - apps/web/features/connectors/pages/ConnectorsPage.tsx (AddCustomConnectorDialog, lines 496-631)
  - apps/web/app/api/mcp/route.ts
  - apps/web/types/mcp.ts
- **API endpoints:**
  - POST /api/connectors/mcp -- referenced by dialog but **does not exist** (404)
  - POST /api/mcp -- exists but is not wired to the dialog
- **Data flow:**
  1. User clicks "Add custom connector" button on ConnectorsPage header
  2. AddCustomConnectorDialog opens with MCP URL input + auth token input
  3. On submit, dialog POSTs to `/api/connectors/mcp` which has no route handler
  4. Fetch 404s, catch block opens `modelcontextprotocol.io` in a new tab and closes dialog
  5. No MCP server is actually registered; the flow is decorative
  6. The real MCP route at `/api/mcp` (route.ts) connects, lists tools, and closes -- but the dialog never calls it
- **Flaws:**
  - [critical] Dialog POSTs to `/api/connectors/mcp` which does not exist. The entire custom MCP registration flow is a no-op; on 404 it silently opens external docs and closes the dialog, masking the failure. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:511
  - [major] No Name field. Claude shows a required "Name" text input above the URL field; AGI only has URL + auth token. Without a name, the user cannot identify the server in their list. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:558-568
  - [major] No trust/safety warning. Claude shows "Only use connectors from developers you trust. Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change." AGI has no equivalent warning, which is a security UX gap. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:496-631
  - [major] No Advanced Settings collapsible section. Claude's modal includes an expandable "Advanced settings" section below the URL field. AGI's dialog has no equivalent. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:496-631
  - [minor] No BETA badge. Claude's modal title shows "Add custom connector" with a "BETA" badge. AGI's title is "Add custom connector" without the badge. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:541
  - [minor] No "Building an MCP server?" footer link. Claude includes a link to report issues and subscribe to updates. AGI's MCP docs link goes to the generic modelcontextprotocol.io page. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:496-631
  - [minor] No explicit Cancel button. Claude has Cancel + Add buttons. AGI relies on the dialog's X close button. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:537
  - [minor] Dialog has two sections (MCP URL + MCP Directory) which diverges from Claude's single-purpose modal. Claude's modal is focused solely on adding one custom connector. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:549-626
- **Visual gaps:**
  - Claude's modal has a clean single-purpose layout with Name, URL, Advanced Settings, warning text, and Cancel/Add. AGI's dialog is a two-section card layout with URL+token in one card and directory browse in another.
  - Missing "pre-built ones" link from Claude's intro text ("Connect Claude to your data and tools. Learn more about connectors or get started with pre-built ones.")
  - Claude's Tool Permissions section (Read-only tools count + checkmark) visible behind the modal is a separate feature entirely missing from AGI web.

---

## IMG: 33_connector-oauth-flow_slack-grant-access-modal.png

- **Feature:** OAuth grant-access flow for Slack connector. Shows a "Grant access to Slack" modal overlay with OAuth handoff instruction ("Complete the sign-in steps in the new browser tab"), Slack connector detail page behind it showing description, developer attribution ("Developed by Slack"), trust disclaimer, and list of tool chips (slack_send_message, slack_search_users, etc.).
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/33_connector-oauth-flow_slack-grant-access-modal.png
- **Implementation status:** missing
- **Primary files:**
  - apps/web/features/connectors/pages/ConnectorsPage.tsx (connect handler, lines 921-957)
  - apps/web/app/api/connectors/route.ts (POST handler, lines 109-178)
  - apps/web/types/mcp.ts (McpOAuthStartResponse, McpOAuthTokenResponse types defined but unused)
- **API endpoints:**
  - POST /api/connectors -- saves connector row with is_active=true but performs no OAuth handshake
- **Data flow:**
  1. User clicks "Connect" on a connector card (e.g. Slack)
  2. Optimistic UI update: connector ID added to connectedIds set immediately
  3. POST /api/connectors with {connectorId: "slack", authType: "oauth"}
  4. Server upserts a user_connectors row with is_active=true and connected_at timestamp
  5. No OAuth provider redirect, no token exchange, no access token storage
  6. UI shows green "Connected" dot -- user believes they are connected but no data access is possible
- **Flaws:**
  - [critical] No OAuth handshake implementation. The POST /api/connectors handler upserts a database flag without performing any OAuth authorization code flow, token exchange, or credential storage. The "Connected" state is a lie -- no actual provider access is granted. @ apps/web/app/api/connectors/route.ts:109-178
  - [critical] No grant-access modal. Claude shows a dedicated overlay instructing the user to complete OAuth in a browser tab. AGI has no equivalent modal, redirect, or popup OAuth flow. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:921-957
  - [major] No connector detail page. Claude shows a full detail view with description, developer attribution ("Developed by Slack" with external link), trust disclaimer, and tool chips listing individual capabilities. AGI only has a card grid view with no drill-down. @ apps/web/features/connectors/pages/ConnectorsPage.tsx
  - [major] No developer attribution. Claude shows "Developed by [Provider]" with verified external link. AGI has no developer/publisher field or verification. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:60-465
  - [major] No tool chip listing. Claude lists individual tools (slack_send_message, slack_search_public, etc.) for transparency. AGI shows only an actionCount number ("5 actions") with no tool-level detail. @ apps/web/features/connectors/pages/ConnectorsPage.tsx:744-746
  - [major] MCP OAuth types (McpOAuthStartResponse, McpOAuthTokenResponse, McpOAuthConnectionStatus) are defined in types/mcp.ts but are not imported or used anywhere in the codebase. Dead code. @ apps/web/types/mcp.ts:118-143
  - [minor] No "Didn't work? Relaunch the tab." fallback link for OAuth flow recovery. @ N/A (feature not implemented)
- **Visual gaps:**
  - No modal overlay with Slack + Claude logo handshake animation
  - No "Back" navigation link to return from connector detail to connector list
  - No "Connect" button in detail header (separate from card grid Connect button)
  - No per-connector trust disclaimer text
  - No expandable/collapsible tool list with individual tool chips

---

## IMG: 204_claude-desktop_settings-connectors-or-extensions.png

- **Feature:** Settings > Extensions page showing locally installed MCP extensions. Lists 8 extensions (Filesystem, Excel by Anthropic, Read and Write Apple Notes, Apify, Control your Mac, Tableau MCP Server, Desktop Commander, Context7) each with Configure button and overflow menu. Includes "Browse extensions" button and "Drag .MCPB or .DXT files here to install" footer with Advanced Settings link.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/204_claude-desktop_settings-connectors-or-extensions.png
- **Implementation status:** missing
- **Primary files:**
  - apps/web/app/settings/layout.tsx (settings nav, "Connectors" link points to /settings/connections)
  - apps/web/app/settings/connections/page.tsx (waitlist stub page)
  - apps/web/app/settings/capabilities/page.tsx (capability matrix, not extension management)
- **API endpoints:** none (feature not implemented)
- **Data flow:**
  1. User navigates to Settings > Connectors in the web app
  2. /settings/connections renders a static waitlist notice and disabled connector list
  3. No extension discovery, installation, or management functionality exists
  4. v1-LOCAL-ONLY lock (locks/v1-local-only-cloud-waitlist-2026-05-18.md) explicitly defers cloud connectors to waitlist
- **Flaws:**
  - [major] No extension management UI. Claude shows a dedicated Settings > Extensions page with per-extension icons, Configure buttons, overflow menus, and drag-to-install. AGI web has no equivalent -- the closest is /settings/connections which is an inert waitlist stub. Note: per v1-LOCAL-ONLY lock, cloud connectors are intentionally deferred, but the local MCP extension management surface (which is local-only and within scope) is also absent. @ apps/web/app/settings/connections/page.tsx
  - [major] No "Browse extensions" button or extension marketplace/directory in settings. The /connectors/mcp-directory page exists but is not linked from settings. @ apps/web/app/settings/connections/page.tsx
  - [minor] No .MCPB/.DXT drag-to-install zone. This is a desktop-native feature (file drag from Finder). Web equivalent would be file upload or URL-based install. @ N/A
  - [minor] No "Advanced settings" link in the extensions section. AGI has advancedSettingsSchema in features/settings/schemas/settings-validation.ts but it covers different concerns (not MCP). @ apps/web/features/settings/schemas/settings-validation.ts:160
- **Visual gaps:**
  - No extension icon column with per-extension branded logos/avatars
  - No "Installed on your computer" section heading
  - No per-extension Configure button or overflow (three-dot) menu
  - No "Browse extensions" CTA button in page header
  - No drag-to-install footer zone
  - Settings nav shows "Connectors" but Claude shows "Extensions" as a separate category under "Desktop app" sub-section

---

## IMG: 205_claude-desktop_settings-extension-detail.png

- **Feature:** Extension detail/configuration page for the Filesystem MCP extension. Shows extension name with icon, Enabled/Disabled toggle, Uninstall button, Allowed Directories configuration (editable path list with add/remove), Save button, and Tool Permissions section with "Read-only tools" expandable group (9 tools listed: Read File Deprecated, Read Text File, Read Multiple Files, List Directory, List Directory with Sizes) with per-tool "Needs approval" dropdown.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/205_claude-desktop_settings-extension-detail.png
- **Implementation status:** missing
- **Primary files:**
  - apps/web/core/ai/tools/types.ts (ToolPermission, UserPermissionLevel types exist but not surfaced in UI)
  - apps/web/stores/unified/settingsStore.ts (autoApproveTools boolean exists as stub)
  - apps/web/stores/unified/chat/toolStore.ts (tool execution tracking, no per-tool permission config)
- **API endpoints:** none (feature not implemented)
- **Data flow:**
  1. No extension detail page exists in the web app
  2. Tool permission types exist at the code level (types.ts PERMISSION_LEVELS) but are not exposed in any settings UI
  3. settingsStore stub has an autoApproveTools boolean but it defaults to false and has no UI toggle
  4. No per-extension enable/disable, uninstall, directory configuration, or per-tool approval workflow
- **Flaws:**
  - [major] No extension detail/configuration page. Claude shows a full detail view with enable toggle, uninstall, directory config, and tool permissions. AGI has no equivalent page or route. @ N/A (no route exists)
  - [major] No per-extension Allowed Directories configuration. Claude's Filesystem extension lets users specify which directories the extension can access. AGI has no directory sandboxing UI. @ N/A
  - [major] No per-tool permission controls. Claude shows per-tool "Needs approval" dropdown with options (Always allow, Needs approval, Blocked, Custom). AGI has PERMISSION_LEVELS in types.ts at the code level but no UI to configure individual tool approval policies. @ apps/web/core/ai/tools/types.ts:36-50
  - [minor] No enable/disable toggle per extension. The settings store has autoApproveTools as a global boolean stub, not per-extension. @ apps/web/stores/unified/settingsStore.ts:36
  - [minor] No Uninstall button for extensions. @ N/A
  - [minor] No "Read-only tools" expandable section with tool count badge. @ N/A
- **Visual gaps:**
  - No "All extensions" breadcrumb/back link
  - No extension icon + name header with external link icon
  - No Enabled/Disabled toggle with blue active state
  - No Uninstall button
  - No directory path input with folder-browse and remove buttons
  - No "+ Add directory" link
  - No Save button for directory configuration
  - No Tool Permissions section with gear icon and "Needs approval" dropdown
  - No per-tool row with approval status indicators

---

## IMG: 206_claude-desktop_local-permission-or-mcp-warning.png

- **Feature:** Same extension detail page as image 205, but with the "Needs approval" dropdown open showing three permission levels: "Always allow", "Needs approval" (currently selected, checkmarked), and "Blocked", plus a "Custom" option. This is the per-tool permission tri-state control for MCP extension tools.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/206_claude-desktop_local-permission-or-mcp-warning.png
- **Implementation status:** missing
- **Primary files:**
  - apps/web/core/ai/tools/types.ts (ToolPermission type, PERMISSION_LEVELS mapping)
  - apps/web/core/ai/tools/unified-tool-registry.ts (permission checks in code)
  - apps/web/stores/unified/settingsStore.ts (autoApproveTools boolean stub)
- **API endpoints:** none (feature not implemented)
- **Data flow:**
  1. No per-tool permission dropdown exists in the web app
  2. Code-level permission model exists: types.ts defines basic/standard/admin levels with specific ToolPermission values
  3. UnifiedToolRegistry performs permission checks during tool execution
  4. No UI surface exposes this permission model to the user for configuration
  5. The settingsStore autoApproveTools is a single global boolean, not the four-state per-tool control Claude offers
- **Flaws:**
  - [major] No per-tool permission tri-state control. Claude offers four options per tool: Always allow, Needs approval, Blocked, Custom. AGI has no UI for this. The closest is a single autoApproveTools boolean in the settings store which is globally on or off for all tools. @ apps/web/stores/unified/settingsStore.ts:36
  - [major] No tool-level approval workflow during execution. When a tool requires approval, Claude prompts the user inline. AGI's tool execution in toolStore.ts tracks status (pending/running/success/failed/blocked) but has no user-facing approval prompt or modal. @ apps/web/stores/unified/chat/toolStore.ts:69-77
  - [minor] The four-state model (Always allow / Needs approval / Blocked / Custom) is not represented in any AGI type definition. The ToolPermission type covers capability categories (file:read, system:execute, etc.) but not approval policy per tool instance. @ apps/web/core/ai/tools/types.ts:36-50
- **Visual gaps:**
  - No dropdown menu with checkmark indicator for current selection
  - No "Always allow" / "Needs approval" / "Blocked" / "Custom" option labels
  - No per-tool approval status icon in tool list rows (the gear icon + shield icon Claude uses)
  - No inline approval prompt during chat tool execution

---

## Summary

| Image | Feature | Status | Critical | Major | Minor | Cosmetic |
|-------|---------|--------|----------|-------|-------|----------|
| 127 | Custom MCP connector modal | partial | 1 | 3 | 4 | 0 |
| 33 | OAuth grant-access flow | missing | 2 | 4 | 1 | 0 |
| 204 | Settings extensions list | missing | 0 | 2 | 2 | 0 |
| 205 | Extension detail config | missing | 0 | 3 | 3 | 0 |
| 206 | Per-tool permission control | missing | 0 | 2 | 1 | 0 |
| **Totals** | | | **3** | **14** | **11** | **0** |

### Critical findings:
1. **Dead custom MCP registration endpoint** -- AddCustomConnectorDialog POSTs to `/api/connectors/mcp` which has no route handler. The flow silently fails, opens external docs, and closes the dialog. No custom MCP server can ever be registered through the UI.
2. **Fake OAuth connector flow** -- POST /api/connectors upserts a database flag without any OAuth provider redirect, token exchange, or credential storage. The "Connected" green dot is a false positive; no actual provider access is granted.
3. **No OAuth grant-access modal** -- The entire OAuth handoff flow (redirect to provider, grant access in browser tab, return with token) does not exist. The McpOAuth types in types/mcp.ts are dead code.

### Context:
The v1-LOCAL-ONLY lock (locks/v1-local-only-cloud-waitlist-2026-05-18.md) explicitly defers cloud OAuth connectors to the waitlist phase, which explains why /settings/connections is intentionally inert. However, the /connectors page and its API routes present a misleading "Connect" flow that appears functional but is not. The extension management surface (images 204-206) represents desktop-native functionality that has no web equivalent yet -- this is partially expected for v1 but means the web app lacks any tool permission management UI.

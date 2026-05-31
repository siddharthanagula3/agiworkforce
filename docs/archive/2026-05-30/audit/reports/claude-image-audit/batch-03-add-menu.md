# Batch 03 -- Add Menu / Tools / Connectors Submenu

**Auditor:** Claude Opus 4.7 (1M context)
**Date:** 2026-05-24
**Scope:** 8 reference images covering the Claude desktop Add Menu, Connectors submenu, tool access, and Customize connectors panel.
**Web app root:** `apps/web`

---

## IMG: 103_claude-max20x_add-menu_tools-connectors.png

- **Feature:** Main composer "+" add menu showing top-level items: Add files or photos, Add to project (submenu), Add from GitHub, Skills (submenu), Connectors (submenu), Plugins, Research, Web search (toggle with checkmark), Use style (submenu).
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/103_claude-max20x_add-menu_tools-connectors.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (lines 690-872, overflow menu)
  - `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
- **API endpoints:** None specific to the menu itself.
- **Data flow:**
  - User clicks "+" button at line 692 toggling `showOverflowMenu` state
  - Overflow menu renders sections: Focus Mode, Agent Mode, Project Context, Skills, Response Style, Tools
  - No connector, plugin, research, or add-to-project menu entries exist in the overflow popup
  - Web search and style toggles are inline quick-toggle buttons outside the menu (lines 891-941)
- **Flaws:**
  - [critical] "Connectors" top-level menu entry entirely missing from the "+" overflow menu @ `ChatComposerNew.tsx:711-872`. Claude shows Connectors with a submenu arrow; AGI has no connector integration in the composer.
  - [critical] "Plugins" top-level menu entry entirely missing from the "+" overflow menu @ `ChatComposerNew.tsx:711-872`.
  - [major] "Research" standalone menu entry missing. AGI has a "Research" quick-toggle button outside the menu, but Claude puts it as a dedicated item inside the "+" menu.
  - [major] "Add to project" submenu entry missing from the "+" menu. No project-attachment workflow exists in the composer.
  - [major] "Add from GitHub" entry missing from the "+" menu. No GitHub file-import flow.
  - [minor] "Add files or photos" is handled by a separate paperclip button outside the menu (line 876) rather than as the first item inside the "+" menu. Structural layout diverges from Claude.
  - [minor] "Web search" is a quick-toggle button outside the menu rather than a toggleable item inside the "+" menu with a checkmark indicator.
- **Visual gaps:**
  - Claude menu is a flat list of 9 items with icons, submenu arrows, and checkmark toggles. AGI menu is sectioned into 6 labeled groups (Focus Mode, Agent Mode, Project Context, Skills, Response Style, Tools) with dividers -- a fundamentally different menu architecture.
  - Claude menu items use compact single-row layout with icons; AGI uses section headers in all-caps muted text.

---

## IMG: 104_claude-max20x_connectors-submenu_connected.png

- **Feature:** Connectors submenu flyout showing 6 connected connectors (Gmail, Vercel, Apify, Claude in Chrome, Context7, Control your Mac) each with blue toggle switches, plus footer items: Manage connectors, Add connector, Tool access (with subtitle "Load tools when needed").
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/104_claude-max20x_connectors-submenu_connected.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (no connector submenu exists)
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx` (full-page standalone, not a composer flyout)
  - `apps/web/app/api/connectors/route.ts`
- **API endpoints:**
  - `GET /api/connectors` -- lists global user connections
  - `POST /api/connectors` -- creates a global connection
  - `DELETE /api/connectors` -- soft-deletes a connection
- **Data flow:**
  - Claude: User opens "+" menu > clicks Connectors > sees per-chat toggle switches for each connected connector. Toggle state is per-conversation.
  - AGI: No connector submenu in the composer. `/api/connectors/route.ts` stores a global `is_active` boolean in the `user_connectors` table with no per-chat granularity.
  - AGI's `ConnectorsPage.tsx` is a standalone full-page grid, not a flyout submenu.
- **Flaws:**
  - [critical] Entire connectors submenu flyout missing from the composer "+" menu. No per-chat connector toggle UI exists anywhere @ `ChatComposerNew.tsx`.
  - [critical] Per-chat connector enablement data model absent. `user_connectors` table has only `is_active` (global). Claude shows per-conversation toggles that gate which connectors can be invoked in a specific chat.
  - [major] "Tool access" submenu entry with "Load tools when needed" subtitle missing. No per-tool access gating UI exists in the composer.
  - [major] "Manage connectors" link missing from composer context -- AGI has this only at `/connectors` page level.
  - [major] "Add connector" inline link missing from composer context.
  - [major] Connector logos missing from `connector-logos.ts` for Claude-shown connectors: Vercel, Apify, Context7, Claude in Chrome, Control your Mac. None of these 5 are in the `CONNECTOR_LOGOS` map or the `VALID_CONNECTOR_IDS` set.
- **Visual gaps:**
  - Claude shows toggle switches (blue pill-style) for each connector with their brand icon. AGI has no comparable inline connector control in the chat flow.
  - The flyout appears as a nested submenu to the right of the main "+" menu. AGI has no nested submenu architecture in its overflow menu.

---

## IMG: 043_claude-free_add-menu_tools-connectors.png

- **Feature:** Free-tier "+" add menu showing reduced item set: Add files or photos, Take a screenshot, Add to project (submenu), Add from GitHub, Skills (submenu), Add connectors (single action, no submenu), Web search (toggle with checkmark), Use style (submenu). No Plugins or Research entries.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/043_claude-free_add-menu_tools-connectors.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- **API endpoints:** N/A
- **Data flow:**
  - Claude free tier shows a simplified menu with "Add connectors" as a single navigation action (no submenu, no toggle switches, just navigates to connector management).
  - AGI's "+" menu renders identically regardless of tier -- no tier-aware menu gating exists.
- **Flaws:**
  - [major] "Take a screenshot" entry entirely missing from AGI's "+" menu. No screenshot-capture workflow in the web app composer.
  - [major] "Add connectors" entry (free tier variant -- single action without submenu) missing from the composer menu.
  - [major] No tier-gated menu rendering. Claude differentiates free vs paid menu items. AGI shows the same "+" overflow menu for all tiers.
  - [minor] Free tier shows "Add connectors" (plural action) vs paid tier's "Connectors" (submenu with toggles). This tier-aware behavioral difference has no AGI equivalent.
- **Visual gaps:**
  - Claude free menu is visually simpler (7 items) vs Max (9 items). AGI's sectioned menu is identical regardless of subscription state.
  - Light mode styling visible in the free-tier screenshot; AGI's add menu is dark-only in current implementation.

---

## IMG: 005-cowork-connectors-submenu-toggles.png

- **Feature:** Cowork tab connectors submenu showing 7 connected MCP connectors (Gmail, Vercel, Apify, Claude in Chrome, Context7, Control your Mac, Excel (By Anthropic)) with toggle switches plus footer: Manage connectors, Add connector. This is in the Cowork surface specifically.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/005-cowork-connectors-submenu-toggles.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/connectors/config/connector-logos.ts`
- **API endpoints:** `GET /api/connectors`
- **Data flow:**
  - Claude Cowork surface shows the same connector toggle submenu pattern as Chat.
  - AGI has no Cowork surface and no per-chat connector toggles in any surface.
- **Flaws:**
  - [critical] Cowork surface does not exist in AGI web app. AGI has Chat, Code concept but no Cowork tab.
  - [critical] Per-chat connector toggles missing (same root cause as IMG 104).
  - [major] "Excel (By Anthropic)" connector not in `VALID_CONNECTOR_IDS` or `CONNECTOR_LOGOS` @ `connector-logos.ts`. This appears to be an Anthropic-exclusive MCP connector.
  - [minor] Connector list in Claude Cowork shows 7 connectors without alphabetical sort -- uses connection order. AGI's global ConnectorsPage sorts by `connected_at` descending.
- **Visual gaps:**
  - Cowork tab has a distinct UX context ("Let's knock some..." greeting). AGI has no equivalent multi-surface composer paradigm.
  - Toggle switches are compact single-row with brand icons. AGI has no toggle-switch connector control.

---

## IMG: 115_claude-max20x_code_connectors-submenu.png

- **Feature:** Code tab "+" add menu showing Add files or photos, Add folder, Import GitHub issue, Slash commands, Connectors (submenu with 9 connected: Gmail, Vercel, Apify, Context7, Control your Mac, Excel, Filesystem, Read and Write Apple Notes -- all with toggles), Manage connectors, Add connectors.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/115_claude-max20x_code_connectors-submenu.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/connectors/config/connector-logos.ts`
  - `apps/web/app/api/connectors/route.ts`
- **API endpoints:** `GET /api/connectors`
- **Data flow:**
  - Claude Code surface has its own add menu variant with Code-specific entries (Add folder, Import GitHub issue, Slash commands) and the same Connectors submenu.
  - AGI has no Code-surface-specific composer; `ChatComposerNew.tsx` is used uniformly.
- **Flaws:**
  - [critical] Code surface does not exist as a distinct AGI web app surface with its own add menu.
  - [critical] Connector submenu with per-chat toggles entirely absent (same root cause).
  - [major] "Add folder" entry missing from any AGI add menu variant.
  - [major] "Import GitHub issue" entry missing from any AGI add menu variant.
  - [major] "Slash commands" as a top-level menu entry missing. AGI has `SlashCommandMenu.tsx` activated by typing `/` in the textarea, but no menu entry to access it.
  - [major] Additional connectors missing from logo registry: "Filesystem" (distinct from `local-filesystem`), "Read and Write Apple Notes" -- neither exists in `CONNECTOR_LOGOS` or `VALID_CONNECTOR_IDS` @ `connector-logos.ts` and `route.ts:40-73`.
- **Visual gaps:**
  - Code tab menu has a distinct layout with "Auto" language selector button at bottom. AGI has no code-specific composer chrome.
  - 9 connectors shown with toggle switches vs AGI's 0 toggleable connectors in the composer.

---

## IMG: 126_claude-max20x_customize_connectors_add-menu.png

- **Feature:** Full-page Customize > Connectors settings panel. Left sidebar: Skills, Connectors. Connectors list split into "Web" section (GitHub Integration, Gmail, Vercel, Xcode) connected, and "Not connected" section (Airtable, Google Calendar, Google Drive, n8n, Slack). Top-right dropdown: Browse connectors, Add custom connector. Right panel: selected connector (Vercel) detail with description, tool permissions table with 13 read-only tools each having tri-state (auto/ask/deny) permission controls. Disconnect button at top right.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/126_claude-max20x_customize_connectors_add-menu.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx` (closest equivalent)
  - `apps/web/app/connectors/page.tsx`
  - `apps/web/app/settings/connections/page.tsx`
  - `apps/web/app/settings/capabilities/page.tsx`
- **API endpoints:** `GET /api/connectors`, `POST /api/connectors`, `DELETE /api/connectors`
- **Data flow:**
  - Claude: Customize sidebar > Connectors shows a master-detail layout. Left list shows connected/not-connected connectors. Right panel shows tool-level permission controls per connector.
  - AGI: `/connectors` page (ConnectorsPage.tsx) shows a card grid with Connect/Disconnect buttons. No master-detail view. No per-tool permission controls.
  - AGI: `/settings/connections` is an inert waitlist stub with all buttons disabled.
- **Flaws:**
  - [critical] Per-tool permission controls (auto/ask/deny tri-state) entirely absent. Claude shows 13 individual Vercel tools with tri-state gating. AGI has no concept of tool-level permissions @ `ConnectorsPage.tsx`.
  - [critical] Master-detail connector management layout absent. AGI uses a flat card grid at `/connectors`; Claude uses a sidebar list + detail panel.
  - [major] "Browse connectors" dropdown action missing from AGI connector page. AGI has the "Add custom connector" dialog but no separate "Browse connectors" action.
  - [major] Connected/Not-connected split with "Web" category header missing. AGI splits by "Connected" and "Available" but does not sub-categorize by type (Web, etc.).
  - [major] Xcode, n8n connector definitions missing from `ConnectorsPage.tsx` CONNECTORS array and `VALID_CONNECTOR_IDS` in `route.ts:40-73`.
  - [major] `AddCustomConnectorDialog` at `ConnectorsPage.tsx:511` POSTs to `/api/connectors/mcp` which does not exist -- only `/api/connectors/route.ts` exists. The dialog silently falls back to opening `modelcontextprotocol.io` in a new tab, masking the missing endpoint.
  - [minor] "Disconnect" button in Claude is top-right prominent red. AGI uses a "..." more-options button that calls `handleDisconnect`.
- **Visual gaps:**
  - Claude has a clean 3-column layout (sidebar nav > connector list > tool detail). AGI has a single-page card grid.
  - Tool permissions table with "Read-only tools (13)" count badge and "Custom" dropdown has no AGI equivalent.
  - Per-tool icons (emoji circle for auto, hand for ask, no-entry for deny) absent.

---

## IMG: 164_claude-max20x_project-composer-add-menu.png

- **Feature:** Project composer "+" add menu within a project context ("How to use Claude" example project). Shows: Add files or photos, Take a screenshot, Add from GitHub, Skills (submenu), Connectors (submenu), Research, Web search (toggle with checkmark), Use style (submenu). Right side shows project context panel with files and memory.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/164_claude-max20x_project-composer-add-menu.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/app/projects/page.tsx`
- **API endpoints:** N/A
- **Data flow:**
  - Claude project composer shows a context-aware add menu: within a project, menu items are adjusted (no "Add to project" since already in project context, but "Connectors" submenu is present).
  - AGI has a `/projects` page but the `ChatComposerNew` does not adapt its menu based on project context.
- **Flaws:**
  - [critical] Connectors submenu missing from project composer (same root cause as all other images).
  - [major] "Take a screenshot" action missing from any AGI add menu.
  - [major] No project-context-aware menu adaptation. AGI's "+" menu is static regardless of whether the user is in a project or standalone chat.
  - [major] Project context panel (right sidebar showing "Files", "Memory" sections) not visible alongside the composer in AGI's project view.
  - [minor] "Research" as a standalone menu item (not a quick-toggle) missing from the "+" menu.
- **Visual gaps:**
  - Claude project view has a two-panel layout: composer on the left, project context on the right. AGI's projects page does not reproduce this layout.
  - Project badge ("Example project") and star/kebab actions on the project title have no AGI equivalent.

---

## IMG: 165_claude-max20x_project-connectors-submenu.png

- **Feature:** Project composer connectors submenu showing 2 connected connectors (Gmail, Vercel) with toggle switches, "Add from Vercel" submenu entry, Manage connectors, Add connector, Tool access (with "Load tools when needed" subtitle). This is the same submenu pattern but within a project context.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/165_claude-max20x_project-connectors-submenu.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/connectors/config/connector-logos.ts`
- **API endpoints:** `GET /api/connectors`
- **Data flow:**
  - Claude: Project composer > "+" menu > Connectors submenu shows only connectors relevant to the project, plus an "Add from Vercel" shortcut specific to the Vercel connector.
  - AGI: No connector submenu exists in any composer context (same root cause).
- **Flaws:**
  - [critical] Per-chat connector toggles in project context entirely absent (same root cause).
  - [major] "Add from [Connector]" dynamic submenu entry absent. Claude shows "Add from Vercel" as a connector-specific action within the Connectors submenu. No equivalent in AGI.
  - [major] "Tool access" with "Load tools when needed" subtitle absent from any AGI UI surface.
  - [major] Project-scoped connector filtering absent. Claude appears to show connectors relevant to the project context rather than all globally-connected connectors.
  - [minor] Vercel connector logo missing from `connector-logos.ts` (same issue as IMG 104).
- **Visual gaps:**
  - The submenu shows 2 connectors (project-filtered) vs Claude Max having 6+ globally. AGI would need both global and project-scoped connector views.
  - "Add from Vercel" entry with Vercel icon and submenu arrow has no AGI equivalent.

---

## Summary of Cross-Cutting Flaws

### Critical (blocks parity)

| # | Flaw | Scope | File(s) |
|---|------|-------|---------|
| C1 | Connectors submenu entirely absent from composer "+" menu | All 8 images | `ChatComposerNew.tsx:711-872` |
| C2 | Per-chat connector enable/disable toggles missing -- no data model or UI | IMG 104, 005, 115, 165 | `route.ts` (global `is_active` only), `ChatComposerNew.tsx` |
| C3 | Per-tool permission controls (auto/ask/deny) absent | IMG 126 | `ConnectorsPage.tsx` |
| C4 | Code and Cowork surface-specific composers absent | IMG 005, 115 | `ChatComposerNew.tsx` (single implementation) |

### Major (significant gap)

| # | Flaw | Scope | File(s) |
|---|------|-------|---------|
| M1 | Plugins menu entry missing | IMG 103 | `ChatComposerNew.tsx` |
| M2 | "Add to project", "Add from GitHub", "Take a screenshot" menu entries missing | IMG 103, 043, 164 | `ChatComposerNew.tsx` |
| M3 | "Tool access / Load tools when needed" submenu absent | IMG 104, 165 | No file |
| M4 | Connector logos missing: Vercel, Apify, Context7, Claude in Chrome, Control your Mac, Excel, Filesystem, Apple Notes, Xcode, n8n | IMG 104, 005, 115, 126 | `connector-logos.ts`, `route.ts:40-73` |
| M5 | `/api/connectors/mcp` endpoint missing; `AddCustomConnectorDialog` silently falls back to external URL | IMG 126 | `ConnectorsPage.tsx:511`, missing `app/api/connectors/mcp/route.ts` |
| M6 | Master-detail connector management layout absent | IMG 126 | `ConnectorsPage.tsx` |
| M7 | Tier-gated menu rendering absent | IMG 043 | `ChatComposerNew.tsx` |
| M8 | "Add from [Connector]" dynamic connector-specific submenu absent | IMG 165 | No file |
| M9 | Project context panel (files, memory sidebar) absent alongside composer | IMG 164 | `ChatComposerNew.tsx` |

### Minor

| # | Flaw | File(s) |
|---|------|---------|
| m1 | Gmail logo uses generic Material icon vs brand logo | `connector-logos.ts:18` |
| m2 | "Add files" is a separate paperclip button, not an in-menu item | `ChatComposerNew.tsx:876` |
| m3 | Menu architecture is sectioned-groups vs Claude's flat list | `ChatComposerNew.tsx:711-872` |
| m4 | `formatRelativeTime` duplicated in `ConnectorsPage.tsx:686` and `settings/connections/page.tsx:70` | Both files |

### Data Model Gaps

1. **`user_connectors` table lacks per-chat scope.** Current schema: `user_id + connector_id + is_active` (global). Required: `chat_id` or `conversation_id` column to support per-chat connector toggling as shown in Claude reference.
2. **No tool-permission model.** Claude has per-tool (auto/ask/deny) tri-state permissions per connector. AGI has no `tool_permissions` table or equivalent state.
3. **No project-scoped connector association.** Claude filters connectors per project. AGI has no `project_id` linkage in the connector schema.

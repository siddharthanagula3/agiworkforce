# Batch 23 — Settings Cluster 2: Capabilities / Connectors / Code / Extensions

**Auditor:** Claude Opus 4.7 (1M context)
**Date:** 2026-05-24
**Branch:** audit/preexisting-remediation-2026-05-23
**Image base:** /Users/siddhartha/Desktop/reference/ui

---

## IMG: 029-settings-capabilities.png

- **Feature:** Claude Settings > Capabilities page showing Memory section (search/reference chats toggle, generate memory toggle, "View and manage memory" link, import from other AI providers), General section (tool access mode dropdown, connector discovery toggle), and start of Visuals section. Settings nav shows: General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code, Cowork, Claude... (Beta). Desktop app sub-nav: General, Extensions, Developer.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/029-settings-capabilities.png
- **Implementation status:** partial
- **Primary files:**
  - apps/web/app/settings/capabilities/page.tsx
  - apps/web/app/settings/memory/page.tsx
  - apps/web/app/settings/layout.tsx
- **API endpoints:** N/A (client-side localStorage for memory; billingStore for tier)
- **Data flow:**
  - User navigates to /settings/capabilities
  - Claude reference: page shows Memory toggles (search chats, generate memory), tool access mode dropdown, connector discovery toggle, Visuals section
  - AGI implementation: shows a capability matrix table (feature x tier) with upgrade CTA
  - Settings nav is a static list in layout.tsx with only 6 items (General, Account, Privacy, Billing, Capabilities, Connectors)
  - Memory is on a separate /settings/memory page, not embedded in Capabilities
- **Flaws:**
  - [major] Capabilities page content is completely different from Claude reference. Claude shows Memory, General (tool access mode, connector discovery), and Visuals sections with toggles. AGI shows a static tier-feature matrix table. The page shares only the name. @ apps/web/app/settings/capabilities/page.tsx:1-210
  - [major] "Search and reference chats" toggle missing from UI. State exists in unified-chat settingsStore (`memorySearchChats`) but is not imported or rendered in any web settings page. @ apps/web/app/settings/capabilities/page.tsx (not wired from packages/unified-chat/src/stores/settingsStore.ts:21)
  - [major] "Tool access mode" dropdown missing from UI. State exists in unified-chat settingsStore (`toolAccessMode: 'lazy' | 'eager'`) but is not imported or rendered in any web settings page. @ apps/web/app/settings/capabilities/page.tsx (not wired from packages/unified-chat/src/stores/settingsStore.ts:23)
  - [major] "Connector discovery" toggle missing. Claude has a toggle to let Claude surface connectors from the user's directory. No equivalent in AGI state or UI. @ apps/web/app/settings/capabilities/page.tsx
  - [major] Visuals section (Artifacts toggle, AI-powered artifacts toggle) missing from capabilities page. State exists in unified-chat settingsStore (`artifactsEnabled`) but is not imported or rendered in any web settings page. @ apps/web/app/settings/capabilities/page.tsx (not wired from packages/unified-chat/src/stores/settingsStore.ts:18)
  - [minor] Memory is on a separate /settings/memory page rather than embedded in capabilities as Claude does. This separates related functionality. @ apps/web/app/settings/memory/page.tsx
  - [major] Settings nav missing entries: Claude nav has Capabilities, Connectors, Claude Code, Cowork, Claude...(Beta), plus Desktop app sub-nav (General, Extensions, Developer). AGI nav only has General, Account, Privacy, Billing, Capabilities, Connectors. Missing: Claude Code, Cowork, Desktop app sections. @ apps/web/app/settings/layout.tsx:8-15
- **Visual gaps:**
  - Claude uses a modal/overlay settings dialog with close button; AGI uses a full-page layout with sidebar nav
  - Claude settings nav has a search bar at the top; AGI nav has no search
  - Claude nav sections have category dividers (main settings vs Desktop app); AGI has a flat list
  - Memory import "Start Import" button and "View and manage memory" expandable row are absent

---

## IMG: 030-settings-connectors-deferred.png

- **Feature:** Claude Settings > Connectors page. Shows a message "Connectors have moved to Customize. Head there to browse, connect, and manage them." with a link to Customize. The page is essentially a redirect/notice.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/030-settings-connectors-deferred.png
- **Implementation status:** partial
- **Primary files:**
  - apps/web/app/settings/connections/page.tsx
- **API endpoints:** None wired (waitlisted)
- **Data flow:**
  - Claude: Connectors page is a single-line redirect notice pointing to Customize
  - AGI: Connections page shows a full list of 6 OAuth connectors (Google Drive, GitHub, Slack, Gmail, Google Calendar, Notion) with "Waitlist" buttons
  - connectedAtMap is intentionally empty (all waitlisted)
  - No actual OAuth flow implemented
- **Flaws:**
  - [minor] Conceptual mismatch: Claude's Connectors page is a deferred redirect to a separate Customize experience. AGI's Connections page is a full listing of connector stubs. Different UX pattern but functionally equivalent (both non-functional). @ apps/web/app/settings/connections/page.tsx:1-256
  - [minor] Page title mismatch: AGI shows "Connections" (h1) while nav label says "Connectors." The h1 and nav label should match. @ apps/web/app/settings/connections/page.tsx:100 vs apps/web/app/settings/layout.tsx:15
  - [cosmetic] AGI shows a "Cloud Managed only" notice with custom icon badges (GD, GH, SL, GM, GC, NO) for connector stubs. Claude simply shows plain text with a link. AGI is more elaborate for a waitlisted feature. @ apps/web/app/settings/connections/page.tsx:112-253
- **Visual gaps:**
  - Claude shows a minimal single-line message; AGI shows a full connector gallery with waitlist buttons
  - No "Customize" equivalent page exists in AGI

---

## IMG: 031-settings-claude-code.png

- **Feature:** Claude Settings > Claude Code page. Shows: (1) "Gift a week of Claude Code" card with a pixelated pig mascot, a guest pass URL with copy button ("0/3 left"), note "Friends can try both Cowork and Claude Code." (2) Code appearance section with code font input (e.g. JetBrains Mono), Claude Light/Claude Dark code preview panes showing syntax highlighting. (3) Start of "General" section below.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/031-settings-claude-code.png
- **Implementation status:** missing
- **Primary files:** N/A (no /settings/claude-code page exists)
- **API endpoints:** N/A
- **Data flow:**
  - Claude: dedicated "Claude Code" settings page with referral/gift system, code font selector, light/dark code theme preview
  - AGI: no equivalent page exists. The settings nav does not include a "Claude Code" entry. The AIConfiguration page exists at features/settings/pages/AIConfiguration.tsx but is a BYOK provider configuration page, not a code settings page.
  - The general page has a "Chat font" dropdown but no code-specific font setting
  - No referral/gift system exists
- **Flaws:**
  - [major] Entire "Claude Code" settings page missing. No /settings/claude-code route exists. No code appearance settings, no code font picker, no light/dark code theme preview. @ apps/web/app/settings/layout.tsx:8-15
  - [major] No referral/gift system. Claude has a "Gift a week" card with guest pass URL and copy link functionality. AGI has no referral, invite, or gift mechanism. @ N/A
  - [major] No code font configuration. The general page has a chat font dropdown (Newsreader Serif / System Sans / JetBrains Mono) but no dedicated code/terminal font input. Claude has a separate code font input with placeholder "e.g. JetBrains Mono". @ apps/web/app/settings/general/page.tsx:143-157
  - [major] No code theme preview (Claude Light / Claude Dark split view with syntax-highlighted code). AGI has no visual preview of code rendering. @ N/A
- **Visual gaps:**
  - Entire page absent from navigation and routing
  - Pixelated mascot / guest pass card UI pattern not replicated anywhere
  - Claude Light/Dark side-by-side code preview completely missing

---

## IMG: 032-settings-cowork.png

- **Feature:** Claude Settings > Cowork page. Shows: (1) "Dispatch" section with Beta badge - toggle to "Let Claude work on tasks from your phone using this computer" with explanation text. (2) "Gift a week of Claude Cowork" card with gift box illustration, guest pass URL, copy link, "Q/3 left", and note showing Claude can be used in Excel, PowerPoint, Chrome, Claude Code icons. (3) "Global instructions" section with description "Instructions here apply to all Cowork sessions" and an Edit button.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/032-settings-cowork.png
- **Implementation status:** missing
- **Primary files:** N/A (no /settings/cowork page exists)
- **API endpoints:** N/A
- **Data flow:**
  - Claude: dedicated Cowork settings page with dispatch toggle, gift/referral, global instructions
  - AGI: no equivalent exists. No "Cowork" entry in settings nav. No dispatch/remote task feature. No global instructions editor scoped to a specific mode.
- **Flaws:**
  - [major] Entire "Cowork" settings page missing. No /settings/cowork route, no Dispatch toggle, no global instructions for agent mode. @ apps/web/app/settings/layout.tsx:8-15
  - [major] No "Dispatch" feature (let Claude work on tasks from phone using desktop computer). This is a key Claude desktop feature with no AGI equivalent. @ N/A
  - [major] No mode-scoped global instructions. Claude has editable instructions that apply to all Cowork sessions. AGI's general page has a plain "Instructions for AGI" textarea but it is not mode-scoped. @ apps/web/app/settings/general/page.tsx:88-105
  - [major] No gift/referral for Cowork mode. Same referral gap as Claude Code settings. @ N/A
- **Visual gaps:**
  - Entire page absent
  - Dispatch toggle with Beta badge and explanation text missing
  - Gift card with application icons (Excel, PowerPoint, Chrome, Claude Code) not replicated
  - Global instructions section with Edit button pattern not replicated

---

## IMG: 033-settings-chrome-extension.png

- **Feature:** Claude Settings > Claude in Chrome settings page. Shows: Site permissions section with "Default for all sites" dropdown ("Allow extension"), description "Claude in Chrome works everywhere except sites you block below", a "Blocked sites" section with "Add websites" button and "No sites added yet" empty state.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/033-settings-chrome-extension.png
- **Implementation status:** N/A
- **Primary files:** N/A
- **API endpoints:** N/A
- **Data flow:**
  - This is a Chrome extension management page specific to Claude's Chrome extension
  - AGI does not have a Chrome extension shipped yet (chrome extension surface exists at apps/extension/ but settings integration is not wired to the web app)
  - No site permissions management UI exists
- **Flaws:**
  - [minor] No Chrome extension settings page in web settings. The nav item "Claude... Beta" visible in Claude's nav corresponds to Chrome extension settings. AGI has no equivalent. This is appropriate for current scope since AGI's Chrome extension is not yet launched. @ apps/web/app/settings/layout.tsx
- **Visual gaps:**
  - Entire Chrome extension settings page absent (expected given AGI extension is not shipped)
  - Site permissions pattern (allow/block per-domain) not replicated
  - Chrome extension icon in nav with Beta badge missing

---

## IMG: 034-settings-desktop-app-extensions.png

- **Feature:** Claude Settings > Desktop app > Extensions page. Shows: "Extensions" heading with subtitle "Allow Claude to directly interact with apps, data, and tools on your computer." Browse extensions button. List of installed extensions: Filesystem, Excel (By Anthropic), Read and Write Apple Notes, Apify, Control your Mac, Tableau MCP Server, Desktop Commander, Context7 — each with Configure button and overflow menu. "Advanced settings" button at bottom. Drag-and-drop zone: "Drag .MCPB or .DXT files here to install".
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/034-settings-desktop-app-extensions.png
- **Implementation status:** N/A
- **Primary files:** N/A
- **API endpoints:** N/A
- **Data flow:**
  - This is a desktop-app-only feature for managing MCP extensions
  - The web app cannot install local MCP extensions or interact with desktop file system
  - AGI desktop app at apps/desktop/ may have extension management but it is not surfaced in the web settings
- **Flaws:**
  - [minor] No extensions management in web settings. This is desktop-app-specific and not expected in a web-only context. The "Desktop app" settings section in Claude's nav (General, Extensions, Developer) has no AGI equivalent since AGI web does not manage desktop extensions. @ apps/web/app/settings/layout.tsx
- **Visual gaps:**
  - Entire extensions list UI (icon + label + Configure + overflow menu) absent
  - "Browse extensions" button and marketplace concept absent
  - Drag-and-drop .MCPB/.DXT install zone absent
  - "Advanced settings" button absent

---

## IMG: 035-settings-desktop-app-developer.png

- **Feature:** Claude Settings > Desktop app > Developer page. Shows: "Local MCP servers" heading with subtitle "Add and manage MCP servers that you're working on." "Edit Config" button. Left sidebar lists MCP servers: Filesystem, Excel (By Anthropic), Read and Write Apple Notes, Apify, Control your Mac, Context7. Right pane shows selected "Filesystem" server details: Running badge, "This server is managed by an extension" note, Command: node, Arguments: path to filesystem dist/index.js, "View Logs" button.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/035-settings-desktop-app-developer.png
- **Implementation status:** N/A
- **Primary files:** N/A
- **API endpoints:** N/A
- **Data flow:**
  - Desktop-app-specific MCP server management with config editing, server status, logs
  - Web app cannot manage local MCP servers
  - No equivalent developer/MCP settings page in AGI web
- **Flaws:**
  - [minor] No MCP server management page in web settings. This is desktop-only functionality. Web cannot run local MCP servers. Appropriate absence for web surface. @ N/A
- **Visual gaps:**
  - Entire MCP server list/detail split-pane UI absent
  - Server status badges (Running/Stopped) absent
  - Edit Config button and View Logs button absent
  - Command/Arguments detail view absent

---

## IMG: 053_claude-free_settings_capabilities.png

- **Feature:** Claude Free tier Settings > Capabilities page (light mode, browser). Identical structure to image 029 but in light theme and without paid-tier features. Shows: Memory section (no "Search and reference chats" toggle for free tier, "Generate memory from chat history" toggle, "View and manage memory - Updated 5 months ago" row, "Import memory from other AI providers" with Start Import). General section: "Tool access mode" with "Load tools when needed" dropdown, "Connector discovery" toggle (off). Start of Visuals section: Artifacts toggle (on), AI-powered artifacts toggle (off). Left nav: General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/053_claude-free_settings_capabilities.png
- **Implementation status:** partial
- **Primary files:**
  - apps/web/app/settings/capabilities/page.tsx
  - apps/web/app/settings/layout.tsx
- **API endpoints:** N/A
- **Data flow:**
  - Claude Free: capabilities page with Memory, General, and Visuals sections, tier-gated feature toggles
  - AGI: capabilities page shows static tier matrix table with upgrade CTA
  - Free tier: "Search and reference chats" is hidden; "Generate memory" is available
  - Tool access mode and connector discovery are general controls present for all tiers
- **Flaws:**
  - [major] Same structural mismatch as image 029: AGI capabilities page is a feature matrix, not a settings page with toggles. All flaws from 029 apply. @ apps/web/app/settings/capabilities/page.tsx:1-210
  - [major] Tier-gated visibility not implemented. Claude Free hides "Search and reference chats" for free users. AGI has no equivalent feature to gate. @ apps/web/app/settings/capabilities/page.tsx
  - [major] Artifacts settings (Artifacts toggle, AI-powered artifacts toggle) completely missing from any settings page. Claude shows these under Visuals in Capabilities. @ N/A
  - [minor] "View and manage memory" with "Updated X ago" timestamp pattern missing. AGI memory page has a MemoryEditor but no last-updated indicator. @ apps/web/app/settings/memory/page.tsx
  - [minor] Settings nav on Claude Free shows 7 items (General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code). AGI shows 6 items (no Claude Code). @ apps/web/app/settings/layout.tsx:8-15
- **Visual gaps:**
  - Light mode rendering differences (Claude uses warm cream background; AGI's light mode appearance untested in this audit)
  - Toggle switches vs checkboxes style difference
  - Claude uses proper toggle switches for Memory/Artifacts; AGI privacy page uses native checkboxes
  - "Updated 5 months ago" timestamp on memory row absent

---

## IMG: 054_claude-free_settings_connectors-moved.png

- **Feature:** Claude Free Settings > Connectors page (light mode, browser). Shows "Connectors" heading with message "Connectors have moved to Customize. Head there to browse, connect, and manage them." with "Customize" as a clickable link. Clean, minimal page.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/054_claude-free_settings_connectors-moved.png
- **Implementation status:** partial
- **Primary files:**
  - apps/web/app/settings/connections/page.tsx
- **API endpoints:** N/A
- **Data flow:**
  - Claude Free: same redirect notice as paid tier (image 030)
  - AGI: full connector listing with 6 OAuth stubs and waitlist buttons
  - Both are effectively non-functional (connectors not available)
- **Flaws:**
  - [minor] Same mismatch as image 030. Claude shows a simple redirect message; AGI shows a full connector listing. Functionally equivalent (no connectors work) but visually different. @ apps/web/app/settings/connections/page.tsx:1-256
  - [minor] No "Customize" equivalent page in AGI. Claude redirects to a separate Customize experience; AGI has no such page. @ N/A
- **Visual gaps:**
  - Claude's minimal single-line layout vs AGI's full gallery
  - Light mode rendering (Claude uses off-white background with dark text; AGI untested)
  - Link styling: Claude uses blue underlined "Customize" link; AGI has no equivalent

---

## IMG: 055_claude-free_settings_claude-code-upgrade.png

- **Feature:** Claude Free Settings > Claude Code page (light mode, browser). Shows: upgrade banner "Claude Code" with description "Claude understands your codebase and helps you build, debug, and ship faster. Upgrade your plan to get started." Black "Upgrade to Max or Pro" button with sparkle icon. Pixelated character mascot and terminal preview "Fix the auth bug in signup flow." Below: "Code appearance" section with code font input, Claude Light/Claude Dark code preview panes with syntax highlighting. Start of "General" section.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/055_claude-free_settings_claude-code-upgrade.png
- **Implementation status:** missing
- **Primary files:** N/A (no /settings/claude-code page exists)
- **API endpoints:** N/A
- **Data flow:**
  - Claude Free: Claude Code page exists but shows upgrade CTA for free users (no gift pass, just upgrade button). Code appearance settings are still visible and configurable.
  - AGI: no equivalent page or route exists
- **Flaws:**
  - [major] Same as image 031: entire Claude Code settings page missing. No route, no UI. @ apps/web/app/settings/layout.tsx:8-15
  - [major] No tier-gated upgrade CTA for code features. Claude Free shows "Upgrade to Max or Pro" with feature description. AGI has no equivalent upsell for code-specific features. @ N/A
  - [major] Code appearance settings (code font, light/dark theme preview) missing regardless of tier. @ N/A
  - [minor] No terminal preview mockup showing code task ("Fix the auth bug in signup flow"). This is a marketing/onboarding element. @ N/A
- **Visual gaps:**
  - Entire page absent
  - Upgrade banner with mascot and terminal preview missing
  - "Upgrade to Max or Pro" button with sparkle icon absent
  - Code font input and dual-pane theme preview absent

---

## Summary of Cross-Cutting Issues

### Critical Nav Gaps

The settings layout at `apps/web/app/settings/layout.tsx` defines only 6 nav items:
1. General
2. Account
3. Privacy
4. Billing
5. Capabilities
6. Connectors

Claude's paid tier nav has at minimum 10 items across two sections:
- **Main:** General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code, Cowork, Claude in Chrome (Beta)
- **Desktop app:** General, Extensions, Developer

**Missing pages (no route exists):**
- /settings/claude-code (gift/referral, code appearance, code font, theme preview)
- /settings/cowork (dispatch toggle, gift/referral, global instructions)
- Chrome extension settings (site permissions, blocked sites)
- Desktop app settings (extensions list, MCP server management, developer tools)

**Pages that exist but are not in nav:**
- /settings/memory (accessible directly but not in nav sidebar)
- /settings/voice (accessible but not in nav)
- /settings/sync (accessible but not in nav)
- /settings/notifications (accessible but not in nav)
- /settings/byok (accessible but not in nav)

### Capabilities Page Architecture Mismatch

The most significant design divergence: Claude's Capabilities page is a settings page with functional toggles (Memory, Tool access mode, Connector discovery, Artifacts). AGI's Capabilities page is an informational tier-comparison matrix. These serve entirely different purposes. Claude users configure behavior; AGI users view what their tier includes.

### Store State Exists But Is Not Wired to Web Settings

The `packages/unified-chat/src/stores/settingsStore.ts` already defines state fields for several Claude-parity features:
- `memorySearchChats` (toggle for "Search and reference chats")
- `memoryGenerateFromHistory` (toggle for "Generate memory from chat history")
- `artifactsEnabled` (toggle for Artifacts)
- `toolAccessMode` (`'lazy' | 'eager'` for "Tool access mode")

**None of these are imported or surfaced in any `apps/web/` settings page.** The state exists in the shared package but the web Capabilities page does not consume it. Wiring these to the capabilities page would close 4 major findings.

### Missing Feature Systems

| Feature | Claude Status | AGI Status |
|---------|-------------|-----------|
| Gift/referral system | Active (guest pass URLs, copy link) | Missing |
| Code appearance settings | Active (font, theme preview) | Missing |
| Dispatch/remote task | Beta toggle | Missing |
| Artifact toggles | Active settings | Missing |
| Tool access mode | Active dropdown | Missing |
| Connector discovery | Active toggle | Missing |
| Search & reference chats | Active toggle | Missing |
| MCP extension management | Active (desktop) | N/A (web) |
| Site permissions (Chrome) | Active (desktop) | N/A (web) |

### Flaw Severity Tally

| Severity | Count |
|----------|-------|
| Critical | 0 |
| Major | 18 |
| Minor | 11 |
| Cosmetic | 1 |
| **Total** | **30** |

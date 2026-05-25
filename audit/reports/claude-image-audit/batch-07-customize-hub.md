# Batch 07 — Customize Page Hub Audit

Audited: 2026-05-24
Reference: Claude Desktop (Max 20x + Standard), 10 images
Web app root: `apps/web/`

---

## IMG: 116_claude-max20x_customize_home.png

- Feature: Customize Claude landing hub with left sidebar (Skills, Connectors) and center area showing briefcase icon, "Customize Claude" title, subtitle, and two CTA cards ("Connect your apps", "Create new skills")
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/116_claude-max20x_customize_home.png
- Implementation status: missing
- Primary files: No unified "Customize" hub page exists. Related scattered pages:
  - `apps/web/app/settings/layout.tsx` (Settings nav, no "Customize" section)
  - `apps/web/app/skills/page.tsx` (Skills library, standalone)
  - `apps/web/app/connectors/page.tsx` (Connectors, standalone)
  - `apps/web/features/settings/pages/SettingsPage.tsx` (tabbed settings, no customize tab)
- API endpoints: N/A
- Data flow:
  - Claude: Customize hub is a dedicated page with sidebar nav (Skills, Connectors) and landing CTA
  - AGI: No equivalent hub exists; Skills and Connectors are separate top-level routes
  - Settings layout has a nav sidebar but only for General/Account/Privacy/Billing/Capabilities/Connectors
  - No "Customize" entry point or landing page exists anywhere in the routing tree
- Flaws:
  - [critical] No unified "Customize" hub page combining Skills + Connectors + Plugins into a single navigable section. Claude's core extensibility surface is entirely absent as a unified concept.
  - [major] No back-arrow navigation pattern from Customize hub back to main chat, as Claude shows with the left-arrow header
  - [major] No briefcase icon + title + subtitle landing state for the customize section
  - [major] No "Connect your apps" CTA card linking to connectors
  - [major] No "Create new skills" CTA card linking to skills
- Visual gaps:
  - Claude uses a dark sidebar with Skills and Connectors as top-level nav items; AGI has no equivalent nav grouping
  - Claude's landing page has a centered briefcase icon illustration; no equivalent empty state in AGI
  - The two rounded CTA cards with icon + title + subtitle pattern is not replicated anywhere

---

## IMG: 117_claude-max20x_customize_skills_detail.png

- Feature: Skills detail view with three-column layout: left sidebar (Customize nav), middle column (Skills list with search, personal skills dropdown with file tree: SKILL.md, README.md, WARNING.md, and example skills), right column (skill detail panel showing humanizer skill with metadata, description, allowed tools, and rendered markdown body)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/117_claude-max20x_customize_skills_detail.png
- Implementation status: partial
- Primary files:
  - `apps/web/app/skills/page.tsx` (Skills grid with prompts/agents tabs)
  - `apps/web/app/api/skills/route.ts` (Skills list API)
  - `apps/web/app/api/skills/[name]/route.ts` (Skill body API)
- API endpoints:
  - GET `/api/skills` (list metadata)
  - GET `/api/skills/[name]` (fetch body)
- Data flow:
  - Claude: Three-panel layout with file-tree based skill browser, metadata header (Added by, Last updated, Trigger), allowed tools list, and rendered markdown body
  - AGI: Skills page is a flat grid of hardcoded PromptItem/AgentItem cards with tabs (prompts/agents)
  - AGI API loads skills from filesystem layers via `@agiworkforce/skills` package but the UI does not consume this API
  - AGI skills page uses hardcoded arrays (PROMPTS: 11 items, AGENTS: 45 items) rather than fetching from API
- Flaws:
  - [critical] Skills page uses hardcoded static arrays instead of fetching from `/api/skills` endpoint; API exists but is disconnected from UI @ `apps/web/app/skills/page.tsx:52-515`
  - [critical] No skill detail panel — Claude shows full skill body rendered as markdown with metadata header; AGI only shows card grid with no drill-down
  - [major] No three-column layout (nav + list + detail) for skills browsing
  - [major] No file-tree view showing skill files (SKILL.md, README.md, WARNING.md)
  - [major] No metadata header showing "Added by", "Last updated", "Trigger" fields
  - [major] No "Allowed tools" display (Read, Write, Edit, Grep, Glob, AskUserQuestion)
  - [major] No personal skills vs built-in skills distinction in UI (Claude shows "Personal skills" dropdown)
  - [minor] No search within skills list panel (Claude shows search icon in skills column header)
  - [minor] No toggle switch for enabling/disabling individual skills (Claude shows toggle in detail header)
- Visual gaps:
  - Claude's skill list shows a collapsible tree with folder structure; AGI shows a flat card grid
  - Claude's detail panel renders the skill markdown body with proper formatting; no equivalent in AGI
  - Claude shows pill-style "Allowed tools" list; not present in AGI
  - Claude shows "Slash command + auto" trigger badge; AGI shows trigger as small monospace text on cards

---

## IMG: 118_claude-max20x_customize_skills_code-view.png

- Feature: Skills code view showing the raw markdown/YAML source of a skill (humanizer) with syntax highlighting in a code panel overlay within the detail column
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/118_claude-max20x_customize_skills_code-view.png
- Implementation status: missing
- Primary files:
  - `apps/web/app/api/skills/[name]/route.ts` (returns raw body text)
- API endpoints:
  - GET `/api/skills/[name]` (could serve raw body)
- Data flow:
  - Claude: Shows raw skill source with YAML frontmatter and markdown body in a code viewer overlay
  - AGI: No code view exists for skills; API can return body text but no UI renders it
- Flaws:
  - [critical] No skill code/source view at all — Claude lets users inspect and understand the raw skill definition; AGI has zero visibility into skill internals
  - [major] No syntax-highlighted code panel for viewing YAML frontmatter + markdown content
  - [minor] No toggle between rendered view and code view (Claude shows this as a code icon button in the detail header)
- Visual gaps:
  - Claude's code view shows a dark-themed code block with syntax coloring; no equivalent in AGI
  - Line numbers visible in Claude's code view; missing
  - The code panel appears as an overlay/modal over the detail area; no such pattern exists

---

## IMG: 119_claude-max20x_customize_skills_add-menu.png

- Feature: Skills add menu dropdown showing two options: "Browse skills" and a second option (appears to be "Create skill" or similar), displayed as a floating menu from a "+" button in the skills column header
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/119_claude-max20x_customize_skills_add-menu.png
- Implementation status: partial
- Primary files:
  - `apps/web/app/skills/page.tsx` (has "Add skill" button but no dropdown menu)
- API endpoints: N/A
- Data flow:
  - Claude: "+" button opens a dropdown with options to browse existing skills or create a new one
  - AGI: "Add skill" button exists in skills page header but is non-functional (no onClick handler, no dropdown menu)
- Flaws:
  - [major] "Add skill" button exists but has no functionality — no onClick handler, no dropdown menu @ `apps/web/app/skills/page.tsx:622-628`
  - [major] No "Browse skills" option to discover community/marketplace skills
  - [major] No "Create skill" flow to author new skills through the UI
- Visual gaps:
  - Claude shows a compact dropdown menu with two options and icons; AGI has a flat button with no menu
  - The "+" icon positioning matches Claude but the interaction is missing

---

## IMG: 21_customize-claude-landing-page.png

- Feature: Customize Claude landing page (earlier version, March 2026) with three CTA cards: "Connect your apps", "Create new skills", "Browse plugins" plus a "Personal plugins" sidebar section showing plugin categories (Legal, Slack by Salesforce, Common Room, Brand Voice, Apollo, Product Management, Productivity, Enterprise Search, Sales, Finance, Data, Marketing, Design, Engineering, Operations, Customer Support)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/21_customize-claude-landing-page.png
- Implementation status: missing
- Primary files: None — no customize hub or plugins system exists
- API endpoints: N/A
- Data flow:
  - Claude: Full customize hub with three CTA cards and a sidebar listing personal plugins by category
  - AGI: No "Browse plugins" concept; no personal plugins sidebar; no plugin categories
  - The "Personal plugins" sidebar lists 16 domain categories, each presumably a plugin; AGI has no equivalent
- Flaws:
  - [critical] No "Browse plugins" CTA or plugin browsing system — Claude's third customize CTA card is entirely absent
  - [critical] No "Personal plugins" sidebar with domain categories — Claude shows a full plugin taxonomy (Legal, Sales, Finance, etc.); AGI has nothing
  - [major] No plugin management system at all — `/features/plugins/page.tsx` just redirects to `/desktop`
  - [major] No "+" button to add personal plugins (Claude shows "+" icon next to "Personal plugins" header)
- Visual gaps:
  - Claude shows three CTA cards (Connect apps, Create skills, Browse plugins); AGI has zero
  - Personal plugins sidebar with 16 categories is a core discovery feature in Claude; entirely absent
  - Plugin categories map to business domains (Legal, Marketing, Engineering, etc.); AGI's marketplace-employees.ts has similar categories but no plugin UI

---

## IMG: 22_skill-detail-view_humanizer.png

- Feature: Full skill detail view for "humanizer" skill with three-column layout showing file tree (SKILL.md, README.md, WARNING.md), example skills list (algorithmic-art, brand-guidelines, canvas-design, doc-coachtrong, internal-comms, mcp-builder, skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder), and full detail panel with metadata + allowed tools + rendered markdown
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/22_skill-detail-view_humanizer.png
- Implementation status: partial
- Primary files:
  - `apps/web/app/skills/page.tsx`
  - `apps/web/app/api/skills/route.ts`
  - `apps/web/app/api/skills/[name]/route.ts`
- API endpoints:
  - GET `/api/skills`
  - GET `/api/skills/[name]`
- Data flow:
  - Claude: Shows "Examples" section listing 10 built-in skills by name; file tree shows individual skill files; detail panel shows full skill spec
  - AGI: Has 45 hardcoded agent items but no file-level browsing, no examples section, no detail panel
  - The skill list includes names like "algorithmic-art", "mcp-builder", "skill-creator" — these are Claude-specific skills; AGI's equivalent would be the AGENTS array
- Flaws:
  - [critical] No skill detail view — same as IMG 117 analysis. The three-column layout with file tree + example list + detail panel is completely absent
  - [major] No "Examples" section showing curated skill templates that users can learn from
  - [major] No file-level browsing (SKILL.md, README.md, WARNING.md per skill)
  - [major] Personal plugins sidebar visible with all 16 categories (Legal through Customer Support); AGI has no plugin sidebar
  - [minor] No "User" vs "User or Claude" distinction for "Added by" / "Invoked by" metadata fields
- Visual gaps:
  - Three-column layout with proper spacing and scroll behavior per column; AGI is a single-column grid
  - The file tree shows markdown files per skill with disclosure triangles; no equivalent
  - Skill detail panel shows "Allowed tools" as comma-separated list; missing

---

## IMG: 036-customize-home.png

- Feature: Customize Claude landing hub (May 2026 version, very similar to IMG 21) with sidebar nav (Skills, Connectors), personal plugins list (16 categories), and three center CTA cards
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/036-customize-home.png
- Implementation status: missing
- Primary files: None
- API endpoints: N/A
- Data flow:
  - Same as IMG 21 and IMG 116 analysis — the unified Customize hub with three CTA cards and personal plugins sidebar does not exist in AGI
- Flaws:
  - [critical] Same as IMG 116 — no unified Customize hub page (duplicate confirmation across three time-stamped screenshots: March, May 13, May 15 — this is a stable, canonical Claude feature, not experimental)
  - [major] Personal plugins sidebar with "+" button and 16 domain categories absent
  - [major] "Browse plugins" CTA card absent (third card shown in this and IMG 21, not shown in May 15 Max version which only has two)
- Visual gaps:
  - Consistent dark theme with proper sidebar/content split
  - The layout closely matches IMG 21 and confirms this is a production feature, not a beta experiment

---

## IMG: 037-customize-skills.png

- Feature: Skills list with detail panel showing humanizer skill, three-column layout, built-in skills section showing additional skills (schedule, setup-cowork, context) below the personal skills tree
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/037-customize-skills.png
- Implementation status: partial
- Primary files:
  - `apps/web/app/skills/page.tsx`
  - `apps/web/app/api/skills/route.ts`
- API endpoints:
  - GET `/api/skills`
  - GET `/api/skills/[name]`
- Data flow:
  - Claude: Shows a "Built-in skills" collapsible section below "Personal skills" in the skills column, listing system skills like schedule, setup-cowork, context
  - AGI: Has prompts tab (11 items) and agents tab (45 items) but no distinction between personal/built-in, no collapsible sections
  - The API supports `source` field on skills (from SkillLayer.source) which could drive personal vs built-in distinction, but the UI ignores it
- Flaws:
  - [critical] No separation between personal skills and built-in skills — Claude clearly separates these with collapsible sections; AGI lumps everything into a flat grid
  - [major] Same three-column layout gap as IMG 117 and IMG 22
  - [major] The skills API returns a `source` field but the UI does not use it to distinguish personal from built-in
  - [minor] Skill detail panel identical to previous analysis — missing metadata header, allowed tools, markdown body rendering
- Visual gaps:
  - "Built-in skills" section with different styling/grouping; not present
  - Collapsible tree sections with disclosure triangles; flat grid instead

---

## IMG: 038-customize-connectors.png

- Feature: Connectors detail view with three-column layout: left sidebar (Customize nav), middle column (Connectors list organized by Web/Desktop/Not connected sections with items like Gmail, Vercel, Xcode, Aptly, Claude in Chrome, Context7, Control your Mac, Excel, Filesystem, Read and Write Apple Notes, Airtable, Desktop Commander, Google Calendar, Google Drive, Jira, Slack, Tableau MCP Server), right column (connector detail panel for Gmail showing description, tool permissions with Read-only tools and Write/delete tools, per-tool toggle switches, and "Always show"/"Needs approval" categories)
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/038-customize-connectors.png
- Implementation status: partial
- Primary files:
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx` (card grid, no detail panel)
  - `apps/web/app/settings/connections/page.tsx` (waitlisted simple list)
  - `apps/web/app/api/connectors/route.ts`
- API endpoints:
  - GET `/api/connectors`
  - POST `/api/connectors`
  - DELETE `/api/connectors`
- Data flow:
  - Claude: Three-column layout with connector list organized by connection status (Web/Desktop/Not connected) and a full detail panel showing per-tool permissions (Read-only vs Write/delete) with individual toggle switches and approval modes
  - AGI ConnectorsPage: Shows card grid with Connect/Disconnect buttons, category filters, and status filters but NO detail panel and NO per-tool permission controls
  - AGI settings/connections: Shows a simple waitlisted list with 6 connectors (Google Drive, GitHub, Slack, Gmail, Google Calendar, Notion) — all disabled
  - Two separate connector UIs exist: `/connectors` (marketing/feature page) and `/settings/connections` (settings page) — neither matches Claude's detail view
- Flaws:
  - [critical] No per-tool permission management for connectors — Claude shows granular Read-only/Write-delete tool categories with individual toggle switches and approval modes ("Always show" vs "Needs approval"); AGI has no tool-level permission UI anywhere
  - [critical] No connector detail panel — Claude shows a full right-column detail view with description, tool permissions, and per-action controls; AGI only has Connect/Disconnect card actions
  - [major] Two disconnected connector UIs: `/connectors` page (ConnectorsPage.tsx) and `/settings/connections` (ConnectionsSettingsPage) serve different purposes but neither implements the Claude detail view pattern
  - [major] No "Web" / "Desktop" / "Not connected" connector grouping — Claude groups by connection type; AGI groups by product category (Productivity, Developer, CRM, etc.)
  - [major] No "Disconnect" button in the detail panel with proper confirmation (Claude shows it in header)
  - [minor] ConnectorsPage uses emojis as connector icons (iconEmoji field) while Claude uses proper brand logos @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:71`
  - [minor] Connector logos mapped in `connector-logos.ts` reference external CDN URLs (Wikipedia, GitHub CDN, Google Static); may break if CDNs change or block hotlinking
- Visual gaps:
  - Claude shows a clean detail panel with clear tool permission sections, toggle switches per tool, and "Always show" / "Needs approval" labels
  - AGI shows a flat card grid with emoji-based icons and simple Connect buttons
  - Per-tool permission toggles (eye icon for enabling/disabling individual tools) are a core Claude safety feature not replicated in AGI

---

## IMG: 042-customize-plugin-menu.png

- Feature: Plugin context menu dropdown from the Customize sidebar, showing three options overlaid on the Connectors page: "Browse plugins", "Skills", "Connectors". The dropdown also shows a connector list in the background (Slack, Box, Atlassian Rovo, Microsoft 365, DocuSign, Google Calendar, Gmail) with Connect/Install actions
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/042-customize-plugin-menu.png
- Implementation status: missing
- Primary files:
  - `apps/web/app/features/plugins/page.tsx` (redirects to `/desktop`)
- API endpoints: N/A
- Data flow:
  - Claude: Dropdown menu from sidebar offers navigation between Browse plugins, Skills, and Connectors within the Customize section
  - AGI: `/features/plugins/page.tsx` redirects to `/desktop`; no plugin browsing, no plugin menu, no plugin system
  - The connector list in the background shows Install/Connect buttons per connector; AGI ConnectorsPage has similar Connect buttons but no Install distinction
- Flaws:
  - [critical] No plugin system at all — "Browse plugins", "Create plugin" options shown in Claude's menu have no AGI equivalent; the entire plugins feature redirects to desktop marketing page
  - [critical] No navigation dropdown menu within the Customize section — Claude shows a context menu allowing quick switching between plugins/skills/connectors; AGI has no such hub navigation
  - [major] No "Install" vs "Connect" distinction for connectors — Claude distinguishes between connectors that need OAuth connection and those that need installation; AGI treats all as "Connect"
  - [minor] Connector list in background shows specific integrations (Box, Atlassian Rovo, Microsoft 365, DocuSign) not present in AGI's connector catalog
- Visual gaps:
  - Claude's dropdown menu floats over the page content with shadow and border; no equivalent UI pattern
  - "Install" and "Connect" buttons have different styling in Claude; AGI uses a single "Connect" button style
  - The sidebar highlight shows "Connectors" is active while menu is open; no active-state sidebar in AGI

---

## Summary of Cross-Cutting Gaps

### Missing Features (Critical)

1. **Unified Customize Hub** — No `/customize` page aggregating Skills, Connectors, and Plugins with CTA cards. Confirmed absent across all three date snapshots (March 28, May 13, May 15).

2. **Plugin System** — No plugin browsing, creation, management, or personal plugins sidebar. The `/features/plugins/page.tsx` redirects to `/desktop`. The 16-domain personal plugins list (Legal through Customer Support) visible in Claude has no AGI equivalent.

3. **Skill Detail Panel** — No three-column layout with file tree + skill list + detail panel. No skill body rendering, no metadata header, no allowed tools display, no code view toggle.

4. **Per-Tool Permission Management** — No granular Read-only / Write-delete tool permission toggles for connectors. This is a core Claude safety/trust feature for MCP tools.

5. **Skills Fetched from API** — The Skills page uses hardcoded arrays (56 total: 11 prompts + 45 agents) instead of consuming the existing `/api/skills` endpoint.

### Architectural Issues (Major)

6. **Dual Connector UIs** — `/connectors` (ConnectorsPage) and `/settings/connections` (ConnectionsSettingsPage) serve overlapping purposes with different implementations and data models. Settings version is permanently waitlisted with disabled buttons.

7. **No Skill CRUD** — "Add skill" button is non-functional. No create, edit, delete, enable/disable operations for skills in the UI.

8. **No Personal vs Built-in Distinction** — Skills API returns a `source` field but the UI does not differentiate personal from built-in skills.

### Files Referenced

| File | Role |
|------|------|
| `apps/web/app/skills/page.tsx` | Skills grid (hardcoded data) |
| `apps/web/app/connectors/page.tsx` | Connectors route wrapper |
| `apps/web/features/connectors/pages/ConnectorsPage.tsx` | Connector card grid + API integration |
| `apps/web/app/settings/connections/page.tsx` | Settings connector list (waitlisted) |
| `apps/web/app/settings/capabilities/page.tsx` | Capabilities tier table |
| `apps/web/app/settings/layout.tsx` | Settings sidebar nav |
| `apps/web/features/settings/pages/SettingsPage.tsx` | Tabbed settings (no customize) |
| `apps/web/app/api/skills/route.ts` | Skills list API |
| `apps/web/app/api/skills/[name]/route.ts` | Skill body API |
| `apps/web/app/api/connectors/route.ts` | Connectors CRUD API |
| `apps/web/app/features/plugins/page.tsx` | Redirects to /desktop |
| `apps/web/app/connectors/mcp-directory/page.tsx` | MCP directory (static) |
| `apps/web/features/connectors/config/connector-logos.ts` | Connector logo URLs |
| `apps/web/data/marketplace-employees.ts` | AI employee catalog (has categories but no plugin UI) |

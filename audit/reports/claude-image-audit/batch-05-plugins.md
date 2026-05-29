# Batch 05 — Plugins Submenu and Browse

Audit date: 2026-05-24
Auditor: Claude Opus 4.7 (automated)
Reference surface: Claude Desktop (Cowork mode), captured 2026-05-13
AGI web app root: `apps/web/`

---

## IMG: 006-cowork-plugins-submenu-categories.png
- Feature: Composer "+" overflow menu shows a "Plugins" submenu item that flies out to reveal category tabs: Legal, Slack by Salesforce, Common Room, Brand Voice, Apollo, Product Management, Productivity, Enterprise Search, Sales, Finance. Each category has a chevron arrow indicating a nested sub-menu of skills.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/006-cowork-plugins-submenu-categories.png
- Implementation status: missing
- Primary files:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`
- API endpoints: none for plugins
- Data flow:
  - Claude: User clicks "+" -> overflow menu shows "Add files or photos", "Skills", "Connectors", "Plugins" items -> hovering/clicking "Plugins" opens a fly-out submenu listing plugin categories (Legal, Slack by Salesforce, Common Room, etc.)
  - AGI: User clicks "+" -> overflow menu shows Focus Mode, Agent Mode, Project Context, Skills (link to /skills page), Response Style, Tools sections -> no "Plugins" item exists, no "Connectors" item exists, no fly-out submenu exists
- Flaws:
  - [critical] No "Plugins" menu item in the composer overflow menu. The entire plugin system as a composer-level concept is absent. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`:710-872
  - [critical] No "Connectors" menu item in the composer overflow menu. Claude shows connectors as a direct entry point from the composer. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`:710-872
  - [major] No "Add files or photos" labeled item. AGI has a separate paperclip button but not a labeled menu entry within the "+" overflow. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`:876-887
  - [major] No fly-out submenu UX pattern. Claude's overflow menu supports nested fly-out submenus with category lists; AGI's overflow uses flat inline sections with no nesting. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`:710-872
  - [major] No plugin category taxonomy. Claude organizes plugins by domain (Legal, Finance, Sales, etc.); AGI has no equivalent categorization scheme for plugin-like entities at the composer level. No data model exists.
- Visual gaps:
  - Claude's "+" menu is compact with 4 entries (files, skills, connectors, plugins) + nested fly-out; AGI's "+" menu is a tall vertically-scrolling panel with 6 inline sections
  - Claude's fly-out submenu appears to the right of the main popover; AGI has no secondary popover
  - Claude's plugin icons use distinctive brand logos (Slack, Apollo, etc.); AGI has no plugin identity system

---

## IMG: 007-cowork-plugin-category-legal-workflows.png
- Feature: Hovering the "Legal" plugin category in the fly-out submenu reveals a secondary fly-out listing individual legal skills: brief, compliance-check, legal-response, legal-risk-assessment, meeting-briefing, review-contract, signature-request, triage-nda, vendor-check.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/007-cowork-plugin-category-legal-workflows.png
- Implementation status: missing
- Primary files:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`
- API endpoints: none
- Data flow:
  - Claude: "Plugins" fly-out -> hover "Legal" category -> secondary fly-out lists 9 legal skills (brief, compliance-check, legal-response, etc.) -> user clicks a skill name to insert it as a slash command
  - AGI: No plugin submenu exists. Slash commands are limited to `/search`, `/think`, `/image`, `/doc`, `/code` (5 built-in) plus custom commands from settings store. No domain-specific skill sets.
- Flaws:
  - [critical] No per-plugin skill listing. Claude associates each plugin with named skills (e.g., Legal plugin has brief, compliance-check, etc.). AGI has no concept of plugin-owned skills. @ `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`:16-22
  - [major] No domain-specific slash commands. Claude's Legal plugin provides 9 legal slash commands; AGI has only 5 generic built-in commands. The SkillCategories in `intelligent-agent-router.ts` define domain categories but they are not exposed as slash commands.
  - [major] No third-level nested fly-out. Claude implements a 3-level deep popover chain (+ menu -> plugins fly-out -> skill list fly-out). AGI has only a 1-level popover (+ menu).
- Visual gaps:
  - Claude's skill list items are compact single-line entries; no equivalent UI exists
  - Missing category-to-skill drill-down interaction pattern

---

## IMG: 008-cowork-plugin-selected-inline-slash-command.png
- Feature: After selecting "brief" from the Legal plugin's skill list, the composer shows "brief" as a slash-command token rendered inline in the text area with a trailing "/" indicator. Below the text area, contextual buttons appear: "Add files, connectors, and more /", "Work in a project", "Ask", with model selector "Opus 4.7".
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/008-cowork-plugin-selected-inline-slash-command.png
- Implementation status: partial
- Primary files:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`
- API endpoints: none
- Data flow:
  - Claude: Selecting a plugin skill inserts it as a styled inline token in the textarea -> the token has a distinct visual treatment (colored background) -> below the textarea, a contextual action bar shows file/connector/project shortcuts
  - AGI: Selecting a slash command from the existing menu clears the message and adds a tool to selectedTools state -> tool displays as a chip above the composer, not inline in the textarea -> no contextual action bar below the textarea
- Flaws:
  - [major] Slash command selection does not produce an inline token in the textarea. AGI clears the message and toggles a tool chip instead. Claude renders the command as a styled token within the text flow. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`:422-435
  - [major] No contextual action bar below the textarea. Claude shows "Add files, connectors, and more /", "Work in a project", "Ask" as inline buttons beneath the input. AGI shows a ComposerFooter with "Cmd+Enter to send" hint and model selector, but no actionable file/connector shortcuts. @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
  - [minor] Tool chip above composer vs inline token. Different visual treatment of selected capabilities — AGI uses removable chips above the input area, Claude uses inline tokens. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`:586-611
- Visual gaps:
  - Claude's inline token has a colored background pill directly in the textarea text flow
  - Claude's sub-input action bar provides direct shortcuts to attach files and connectors
  - Claude's "/" indicator after the token signals the user can chain more commands

---

## IMG: 039-customize-plugin-legal.png
- Feature: Full-page "Customize" view for the "Legal" plugin. Shows plugin metadata (Source: Marketplace [Anthropic & Partners], Version: 1.2.0, Author: Anthropic, Last updated: 12 hours ago), a description paragraph, a Skills card grid with 6 visible skill cards (brief, compliance-check, legal-response, legal-risk-assessment, meeting-briefing, review-contract), and a "Try asking..." section with sample prompts. Left sidebar shows a tree: Skills, Connectors, Personal plugins list (Legal, Slack by salesforce, Common room, Brand voice, Apollo, Product management, Productivity, Enterprise search, Sales, Finance, Data, Marketing, Design, Engineering, Operations, Customer support).
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/039-customize-plugin-legal.png
- Implementation status: missing
- Primary files:
  - `apps/web/app/skills/page.tsx` (closest equivalent)
  - `apps/web/app/features/plugins/page.tsx` (redirects to /desktop)
  - `apps/web/data/marketplace-employees.ts`
  - `apps/web/app/api/marketplace/route.ts`
- API endpoints:
  - `GET /api/marketplace` — returns AI employees (not plugins)
  - `GET /api/skills` — returns user-authored skills from filesystem layers
- Data flow:
  - Claude: Settings -> Customize -> left sidebar lists Skills/Connectors/Personal plugins -> selecting "Legal" shows plugin detail page with metadata, version info, skill cards with descriptions, and sample prompts
  - AGI: `/app/features/plugins/page.tsx` redirects to `/desktop`. `/app/skills/page.tsx` shows a flat grid of "prompts" and "agents" tabs with hardcoded data. No plugin detail page exists. No plugin versioning, authoring info, or marketplace sourcing.
- Flaws:
  - [critical] No plugin detail/customize page. The entire "Customize" view showing plugin metadata, version info, skill cards, and try-asking prompts does not exist. `/app/features/plugins/page.tsx` redirects to `/desktop`. @ `apps/web/app/features/plugins/page.tsx`:1-6
  - [critical] No plugin entity data model. Claude's plugins have structured metadata (source, version, author, lastUpdated, description, associated skills). AGI has no equivalent data type. The closest entities are `AI_EMPLOYEES` in marketplace-employees.ts and `SkillCategories` in intelligent-agent-router.ts, but neither represents a plugin. @ `apps/web/data/marketplace-employees.ts`:1-16
  - [major] No left sidebar navigation tree for Skills/Connectors/Plugins. Claude shows a hierarchical tree with expandable nodes (Legal > Skills, Legal > Connectors). AGI's settings page and skills page have flat layouts with no tree navigation.
  - [major] No skill cards with descriptions inside a plugin context. Claude's skill cards show name, description paragraph, and a slash-command tag. AGI's `/skills` page shows generic SkillCard components that are not grouped by plugin.
  - [major] No "Try asking..." section with sample prompts scoped to a specific plugin. Claude provides contextual prompt suggestions tied to the Legal plugin. AGI has no equivalent.
- Visual gaps:
  - No plugin header with Update/Customize toggle buttons
  - No version/author/last-updated metadata row
  - No "See all" link for skills section
  - No skill card grid with truncated descriptions and command labels
  - No left sidebar tree with plugin/skills/connectors hierarchy

---

## IMG: 040-customize-plugin-legal-skills.png
- Feature: "Customize" view drilled into Legal > Skills. Left sidebar shows the tree expanded: Legal > Skills (highlighted, with skill sub-items: brief, compliance-check, legal-response, legal-risk-assessment, meeting-briefing, review-contract, signature-request, triage-nda, vendor-check). Right panel shows detail for "brief" skill: Added by Plugin, Last operated May 13, 2026, Trigger: Slash command + auto. Below is a rendered markdown body showing "/brief -- Legal Team Briefing" with invocation examples (/brief daily, /brief topic [query], /brief incident [topic]) and modes documentation.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/040-customize-plugin-legal-skills.png
- Implementation status: missing
- Primary files:
  - `apps/web/features/chat/components/SkillsMenu.tsx`
  - `apps/web/app/api/skills/route.ts`
  - `apps/web/app/api/skills/[name]/route.ts`
- API endpoints:
  - `GET /api/skills` — lists metadata (name, description, location, source)
  - `GET /api/skills/[name]` — returns body for a named skill
- Data flow:
  - Claude: Customize -> Legal -> Skills -> select "brief" -> shows skill metadata (Added by, Last operated, Trigger type) + rendered markdown body with invocation syntax, modes, and documentation
  - AGI: `SkillsMenu` component fetches `/api/skills` for listing and `/api/skills/[name]` for body on expand. But this is a floating menu inside the composer, not a full-page customize view. No metadata fields (Added by, Last operated, Trigger type) are surfaced. No markdown rendering of skill bodies on a detail page. The API exists and works but the UI is only a compact dropdown, not a settings-style detail view.
- Flaws:
  - [critical] No skill detail page with metadata and rendered documentation. The SkillsMenu shows name/description in a floating listbox with a collapsed body preview (`<pre>` tag), not a full-page detail view with metadata, rendered markdown, and invocation examples. @ `apps/web/features/chat/components/SkillsMenu.tsx`:136-178
  - [major] No skill metadata display (Added by, Last operated, Trigger type). The `/api/skills` response includes `source` and `location` but not "Added by Plugin", last-operation timestamp, or trigger mechanism. @ `apps/web/app/api/skills/route.ts`:87-98
  - [major] No markdown rendering of skill body. AGI displays skill body in a `<pre>` block with monospace font; Claude renders it as styled markdown with headers, code blocks, and formatted invocation examples. @ `apps/web/features/chat/components/SkillsMenu.tsx`:169
  - [major] No left sidebar tree with skill sub-items. Claude's sidebar shows each skill as a navigable tree node under its parent plugin. AGI has no equivalent hierarchy.
  - [minor] Eye/copy icons for skill body (visible in Claude's UI) are missing.
- Visual gaps:
  - No skill detail panel with Edit button in the header
  - No "Added by" / "Last operated" / "Trigger" metadata row
  - No rendered markdown body with styled headings and code blocks
  - No left sidebar tree with individual skill items as sub-nodes

---

## IMG: 041-customize-plugin-legal-connectors.png
- Feature: "Customize" view drilled into Legal > Connectors. Shows a "Connectors" list panel with 8 items: Slack (Connect), Box (Install), Egnyte (Install), Atlassian Rovo (Install), Microsoft 365 (Install), Docusign (Install), Google Calendar (Connect), Gmail. Right panel shows a "You are not connected to Slack yet." message with a Slack icon and a "Connect" button. The left sidebar tree shows Legal > Skills / Connectors (highlighted).
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/041-customize-plugin-legal-connectors.png
- Implementation status: partial
- Primary files:
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx`
  - `apps/web/app/connectors/page.tsx`
- API endpoints:
  - `GET /api/connectors` — fetches connected connectors
  - `POST /api/connectors` — connects a connector
  - `DELETE /api/connectors?connectorId=` — disconnects a connector
- Data flow:
  - Claude: Customize -> Legal -> Connectors -> shows a list of connectors relevant to the Legal plugin with Connect/Install buttons -> selecting a connector shows a detail panel with connection status and Connect button
  - AGI: `/connectors` page shows a standalone full-page grid of all 30+ connectors organized by category (Productivity, Developer, CRM, etc.) with Connect/Enable buttons -> no connector scoping by plugin -> no detail panel on selection, just inline card actions -> connectors are not associated with any plugin entity
- Flaws:
  - [critical] No plugin-scoped connector listing. Claude shows connectors scoped to the Legal plugin (Slack, Box, Egnyte, etc. relevant to legal work). AGI's ConnectorsPage shows all connectors globally with no plugin association. @ `apps/web/features/connectors/pages/ConnectorsPage.tsx`:60-465
  - [major] No connector detail panel. Claude shows a right-side detail panel with connection status ("You are not connected to Slack yet") and a prominent Connect button. AGI's ConnectorCard handles connect/disconnect inline on the card itself. @ `apps/web/features/connectors/pages/ConnectorsPage.tsx`:699-834
  - [major] Missing connectors. Claude shows Box, Egnyte, Atlassian Rovo, Docusign as installable connectors. AGI's CONNECTORS array does not include Box, Egnyte, Atlassian Rovo, or Docusign. @ `apps/web/features/connectors/pages/ConnectorsPage.tsx`:60-465
  - [major] No "Customize" navigation integration. Claude's connectors are accessed through the Customize > Plugin > Connectors tree. AGI's connectors are on a standalone `/connectors` route with no parent plugin context.
  - [minor] Connect vs Install distinction. Claude differentiates "Connect" (OAuth-based, e.g., Slack, Google Calendar) from "Install" (marketplace install, e.g., Box, Egnyte). AGI uses "Connect" for OAuth and "Enable" for exclusive tools, with no "Install" concept.
- Visual gaps:
  - No split-pane layout (connector list on left, detail on right)
  - No Slack brand icon with "You are not connected" empty state
  - No connector list with Connect/Install differentiation per item
  - No three-dot menu button on the connectors panel header

---

## IMG: 043-browse-plugins-overlay.png
- Feature: A "Directory" modal overlay showing a plugin browsing interface. Tabs at top: Skills / Connectors / Plugins (Plugins selected). Header: "Anthropic & Partners". Search bar at top. Grid of plugin cards organized as 2-column layout: Productivity, Design, Marketing, Engineering, Data, Finance, Product Management, Operations, Sales, Legal. Each card shows: name, author (Anthropic), download count (e.g., 1.7M), description paragraph, and an install/info icon.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/043-browse-plugins-overlay.png
- Implementation status: missing
- Primary files:
  - `apps/web/app/features/plugins/page.tsx` (redirects to /desktop)
  - `apps/web/app/skills/page.tsx` (closest UI but not a modal)
  - `apps/web/data/marketplace-employees.ts`
  - `apps/web/app/api/marketplace/route.ts`
- API endpoints:
  - `GET /api/marketplace` — serves AI employee catalog, not plugin directory
- Data flow:
  - Claude: Customize -> Directory button (or browse plugins) -> modal overlay -> tabs (Skills / Connectors / Plugins) -> shows a grid of installable plugins with metadata (author, download count, description) -> Filter by / Sort by controls -> clicking a plugin installs it as a Personal Plugin
  - AGI: No plugin directory modal exists. `/features/plugins/page.tsx` redirects to `/desktop`. The closest equivalent is `/skills` page which shows prompts/agents in a full-page layout (not a modal). `/api/marketplace` serves "AI employees" not plugins. No install/download count mechanism. No modal overlay UX for browsing.
- Flaws:
  - [critical] No plugin directory modal/overlay. The entire "Directory" browsing experience -- a modal overlay with tabs, search, filter, sort, and a grid of installable plugins -- does not exist. @ `apps/web/app/features/plugins/page.tsx`:1-6
  - [critical] No plugin installation mechanism. Claude's directory allows one-click plugin installation with download tracking. AGI has no install/uninstall flow for plugins.
  - [critical] No plugin data model with author, download count, version, and categorization. The closest data structure is `AI_EMPLOYEES` in `marketplace-employees.ts` but these are "employees" with different schema (role, fitLevel, skills array, etc.), not plugins.
  - [major] No tabbed directory with Skills/Connectors/Plugins tabs. Claude's directory modal unifies all three entity types under a single searchable overlay. AGI separates skills (`/skills`), connectors (`/connectors`), and has no plugin surface.
  - [major] No Filter by / Sort by controls for the directory. Claude provides dropdown filters; AGI's `/skills` page has only a search input.
  - [major] No modal overlay UX pattern for directory browsing. Claude uses a dialog-style modal; AGI uses full-page routes.
- Visual gaps:
  - No modal overlay with close button
  - No tri-tab (Skills / Connectors / Plugins) navigation at modal top
  - No "Anthropic & Partners" publisher label
  - No plugin cards with download count badges
  - No 2-column card grid with info/install icons
  - No search bar within the modal
  - No Filter by / Sort by dropdowns

---

## Cross-cutting findings

### Critical gaps (7)
1. **No plugin entity or data model.** Claude's plugin system is a first-class entity with metadata (name, author, version, source, download count), associated skills, and associated connectors. AGI has no equivalent. The closest analogs (AI employees, SkillCategories) serve different purposes with different schemas.
2. **No plugin submenu in the composer.** The composer "+" overflow menu has no "Plugins" entry and no fly-out submenu navigation pattern.
3. **No plugin detail/customize page.** No settings-style page to view plugin info, browse its skills, manage its connectors, or see sample prompts.
4. **No plugin directory modal.** No browsable marketplace overlay for discovering and installing plugins.
5. **No plugin installation/uninstall flow.** No mechanism to add a plugin from a directory and have it appear as a "Personal Plugin" in the sidebar.
6. **No plugin-scoped connector listing.** Connectors are global entities, not associated with any parent plugin.
7. **No skill detail page with rendered documentation.** Skills exist as data (`/api/skills`) but have no full-page detail view with metadata, markdown rendering, or invocation examples.

### Major gaps (9)
1. No fly-out submenu UX pattern in the composer overflow
2. No per-plugin skill listing with domain-specific slash commands
3. No left sidebar tree navigation (Skills / Connectors / Plugin hierarchy)
4. No "Add files or photos" labeled menu entry in overflow
5. No contextual action bar below the textarea
6. Missing connectors from Claude's reference set (Box, Egnyte, Atlassian Rovo, Docusign)
7. No tabbed directory unifying Skills + Connectors + Plugins
8. No Filter by / Sort by controls for directory browsing
9. No skill metadata display (Added by, Last operated, Trigger type)

### Architecture notes
- AGI's existing `/api/skills` and `/api/marketplace` routes could serve as backend foundations, but they need schema changes to support plugin associations.
- The `SkillCategories` taxonomy in `intelligent-agent-router.ts` provides category groupings but is not exposed to users as navigable plugin categories.
- The `ConnectorsPage` is well-built but isolated; it needs plugin association to match Claude's model.
- The `SkillsMenu` component demonstrates progressive body loading but needs elevation from a floating menu to a full-page detail view.
- The composer overflow menu architecture in `ChatComposerNew.tsx` would need a nested fly-out popover system to support multi-level plugin navigation.

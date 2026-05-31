# Batch 06 — Directory Index Pages Audit

Audited: 2026-05-24
Reference: Claude Desktop (Max 20x + Free) — 6 screenshots
Target: AGI web app (`apps/web`)

---

## IMG: 120_claude-max20x_directory_skills.png

- **Feature:** Unified Directory modal — Skills tab. Shows a searchable, filterable list of slash-command skills (e.g., `/canvas-design`, `/web-artifacts-builder`, `/mcp-builder`). Each card displays publisher (Anthropic), download count, and a brief description. Sidebar tabs: Skills | Connectors | Plugins. Filter chips: "Anthropic & Partners". Filter by / Sort by dropdowns. Presented as a centered modal overlay with `X` close button.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/120_claude-max20x_directory_skills.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/skills/page.tsx` (full-page, not a modal)
  - `apps/web/app/ai-skills/page.tsx` (redirect to `/skills?tab=agents`)
  - `apps/web/features/chat/components/SkillsMenu.tsx` (in-chat skill picker)
  - `apps/web/app/api/skills/route.ts`
  - `apps/web/app/api/skills/[name]/route.ts`
- **API endpoints:**
  - `GET /api/skills` — list metadata
  - `GET /api/skills/[name]` — fetch body
- **Data flow:**
  1. User navigates to `/skills` (full page) or triggers `SkillsMenu` from chat composer.
  2. `/skills` page renders hardcoded `PROMPTS[]` and `AGENTS[]` arrays (44 + 11 items) with two tabs.
  3. `SkillsMenu` fetches `/api/skills` which reads from `SKILLS_LAYERS` env var via `@agiworkforce/skills` package.
  4. Skills API returns `{name, description, location, source}` metadata; body is loaded lazily.
  5. No download-count metadata, no publisher attribution, no `Anthropic & Partners` badge.
  6. No unified Directory modal; no sidebar with Skills | Connectors | Plugins tabs.
- **Flaws:**
  - [critical] No unified Directory modal — Claude has a single `Directory` overlay with 3 tabs (Skills, Connectors, Plugins); AGI has 3 separate full-page routes (`/skills`, `/connectors`, `/desktop`) with no shared container or tab navigation @ `apps/web/app/skills/page.tsx`, `apps/web/app/connectors/page.tsx`
  - [critical] Skills page uses hardcoded static arrays (`PROMPTS[]`, `AGENTS[]`) instead of fetching from the skills API or any dynamic source — no download counts, no publisher field, no extensibility @ `apps/web/app/skills/page.tsx:52-515`
  - [major] Missing `Filter by` and `Sort by` dropdowns — Claude has both; AGI has only a search input and tab toggle @ `apps/web/app/skills/page.tsx:652-662`
  - [major] No `Anthropic & Partners` or equivalent publisher filter chip @ `apps/web/app/skills/page.tsx`
  - [major] No `+` button per-skill card for one-click add; Claude shows a `+` icon on each card for quick install @ `apps/web/app/skills/page.tsx:531-558`
  - [minor] Two separate data sources for skills: hardcoded arrays on `/skills` page vs. dynamic `@agiworkforce/skills` package on `/api/skills` — consumer confusion, catalog drift @ `apps/web/app/skills/page.tsx`, `apps/web/app/api/skills/route.ts`
  - [minor] SkillsMenu (chat-side) shows `~/.claude/skills/` in its empty state, which is Anthropic-specific, not AGI-branded @ `apps/web/features/chat/components/SkillsMenu.tsx:109`
- **Visual gaps:**
  - Claude uses a floating modal overlay; AGI uses a full-page layout with header/border-b
  - Claude skill cards show publisher name + download icon + count; AGI cards show trigger prefix + Lucide icon
  - Claude has 2-column card grid inside modal; AGI has 3-column full-page grid
  - No close button (`X`) or overlay backdrop
  - No gear icon on installed/managed skills

---

## IMG: 121_claude-max20x_directory_connectors.png

- **Feature:** Unified Directory modal — Connectors tab. Shows third-party integrations (Ironclad Contracts, NetDocuments, Google Drive, Gmail, Canva, Figma, Microsoft 365, Google Calendar, Atlassian Rovo, Notion, Shopify, CoCounsel Legal). Each connector has its official logo, a popularity badge ("Most popular", "#2 popular", "New", "Trending"), a description, and a `+` button. Two-column grid inside modal. "Anthropic & Partners" filter chip with Filter by / Sort by dropdowns.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/121_claude-max20x_directory_connectors.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/connectors/page.tsx` (route wrapper)
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx` (main component)
  - `apps/web/features/connectors/config/connector-logos.ts`
  - `apps/web/app/api/connectors/route.ts`
- **API endpoints:**
  - `GET /api/connectors` — list user's connected services (from Supabase `user_connectors` table)
  - `POST /api/connectors` — save new connection
  - `DELETE /api/connectors?connectorId=X` — soft-delete
- **Data flow:**
  1. Route `/connectors` renders `<ConnectorsPage>` in Suspense boundary.
  2. Component renders hardcoded `CONNECTORS[]` array (31 items) with category filters + status filter + search.
  3. On mount, fetches `GET /api/connectors` to get user's connected set from Supabase.
  4. `getScopedClient()` uses Bearer JWT for RLS or falls back to service-role with `user_id` filter.
  5. Connect/disconnect uses optimistic updates with POST/DELETE to `/api/connectors`.
  6. Connector logos loaded from external URLs (Wikipedia, gstatic, brand CDNs) via `connector-logos.ts`, falling back to gradient+emoji.
- **Flaws:**
  - [critical] Not in a unified Directory modal — it is a standalone full page at `/connectors` with its own header, not a tab inside a shared Directory shell @ `apps/web/app/connectors/page.tsx`
  - [major] Missing popularity/ranking badges — Claude shows "Most popular", "#2 popular", "New", "Trending"; AGI shows only "Phase N" badges for coming-soon connectors and "EXCLUSIVE" for AGI-only @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:720-738`
  - [major] No `Filter by` / `Sort by` dropdowns — AGI has category tabs and status tri-state but no sort control @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:1019-1068`
  - [major] Connector logos rely on external hotlinked URLs (Wikipedia, gstatic, Atlassian CDN, brand favicons) that can break without notice; Claude uses bundled/self-hosted assets @ `apps/web/features/connectors/config/connector-logos.ts:18-188`
  - [major] Missing `x-csrf-token` header in frontend fetch calls -- `handleConnect()` and `handleDisconnect()` use plain `fetch()` without sending the `x-csrf-token` header that `requireCsrfToken()` reads (lib/csrf.ts:60,398). Other pages (AIConfiguration, UserSettings, schedule-store, team-store) all call `getCsrfToken()` and explicitly set `'x-csrf-token': csrfToken`. ConnectorsPage uses cookie auth (no Bearer JWT), so the Bearer-bypass path does not apply, and all POST/DELETE mutations will 403 with `CSRF_VALIDATION_FAILED` in production @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:921-957` vs `apps/web/app/api/connectors/route.ts:111-112`
  - [minor] `AddCustomConnectorDialog` calls `POST /api/connectors/mcp` which does not exist (the actual MCP route is at `POST /api/mcp`), silently falls back to opening external URL @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:511`
  - [cosmetic] Roadmap callout condition `(activeCategory === 'All' || activeCategory !== 'Exclusive')` is redundantly written — it correctly hides only for Exclusive (verified by unit test at line 301-309 of ConnectorsPage.test.tsx) but the `|| activeCategory !== 'Exclusive'` already subsumes the `=== 'All'` case; a simpler `activeCategory !== 'Exclusive'` is equivalent @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:1162`
  - [cosmetic] Hardcoded color `#0f0e0d` in `AddCustomConnectorDialog` violates no-hardcoded-colors feedback rule @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:539`
- **Visual gaps:**
  - Claude uses 2-column card grid inside modal; AGI uses 4-column full-page grid
  - Claude connector cards show logo + name + popularity on one line, description below, and `+` button; AGI cards have a larger layout with icon, name, action count, description, and full Connect/Enable button
  - No "Anthropic & Partners" filter chip equivalent
  - Missing close button / overlay backdrop (not a modal)
  - Gmail in Claude shows a gear icon (settings) instead of `+` (already configured); AGI has no per-connector settings entry point

---

## IMG: 122_claude-max20x_directory_plugins.png

- **Feature:** Unified Directory modal — Plugins tab. Shows MCP plugins (Productivity, Design, Marketing, Engineering, Finance, Data, Product management, Operations, Sales, Legal). Each plugin has an icon, name, publisher (Anthropic), download count, and description. Info banner: "Plugins can be browsed, but are only available for use in the desktop app. Download Claude for Desktop". "Anthropic & Partners" filter chip.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/122_claude-max20x_directory_plugins.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/app/features/plugins/page.tsx` (redirect to `/desktop`)
  - `apps/web/app/desktop/page.tsx` (marketing landing page, not a plugins directory)
- **API endpoints:** None
- **Data flow:**
  1. `/features/plugins` redirects to `/desktop` which is a marketing landing page for the desktop app.
  2. No plugins catalog, no MCP plugin browsing, no install/download tracking.
  3. No equivalent of Claude's "browse-only" plugins directory for web users.
  4. The MCP API at `/api/mcp` handles connecting to remote MCP servers but has no catalog/directory browsing capability.
- **Flaws:**
  - [critical] No plugins directory exists — Claude has a full browsable catalog of MCP plugins with categories, download counts, and publisher info; AGI redirects `/features/plugins` to a marketing page with no plugin listing @ `apps/web/app/features/plugins/page.tsx:4`
  - [critical] No data model for plugins catalog — no API endpoint, no database table, no hardcoded array of plugins; the concept of "plugins" is absent from the web surface @ `apps/web/app/api/`
  - [major] Missing info banner about desktop-only availability — Claude clearly states "Plugins can be browsed, but are only available for use in the desktop app"; AGI provides no equivalent affordance @ N/A
  - [major] No "Download [App] for Desktop" CTA from the directory context — users who discover plugins need a clear path to the native app @ N/A
- **Visual gaps:**
  - Entire plugins tab is missing from web app
  - No plugin cards with category icons, download counts, or publisher names
  - No "Anthropic & Partners" filter chip
  - No plugin-specific search/filter/sort controls

---

## IMG: 044_claude-free_directory_connectors.png

- **Feature:** Same Directory modal — Connectors tab, but viewed on Claude Free tier (light theme). Identical layout to Max 20x version: Ironclad Contracts (New), NetDocuments (New), Google Drive (Most popular), Gmail (#2 popular), Canva (#4 popular), Figma (#5 popular), Microsoft 365 (#8 popular), Google Calendar (#3 popular), Atlassian Rovo (#7 popular), Notion (#6 popular). Light-mode styling with white background, subtle gray borders, official connector logos.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/044_claude-free_directory_connectors.png`
- **Implementation status:** partial (same as IMG 121)
- **Primary files:** Same as IMG 121
- **API endpoints:** Same as IMG 121
- **Data flow:** Same as IMG 121
- **Flaws:**
  - All flaws from IMG 121 apply identically.
  - [major] Light theme rendering — AGI's ConnectorsPage uses dark-mode-assumed colors (e.g., `bg-black/20`, `border-white/[0.06]`, `bg-white/[0.02]`) that may not adapt properly to light theme via Tailwind dark-mode toggle @ `apps/web/features/connectors/pages/ConnectorsPage.tsx:992`
  - [minor] Claude Free shows the same connectors as Max 20x with no tier gating visible in the directory UI; AGI has no tier-aware connector display @ `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **Visual gaps:**
  - Claude Free uses a clean white/light-gray modal; AGI has no light-mode variant tested for the connectors page
  - Official logos in Claude appear crisp and consistent; AGI's external-URL logos may render differently or fail in light mode due to transparent SVGs on white backgrounds
  - Claude Free connector cards have the exact same layout as Max — no tier-based feature gating visible

---

## IMG: 045_claude-free_directory_skills.png

- **Feature:** Same Directory modal — Skills tab on Claude Free tier (light theme). Identical skill cards as Max 20x version: `/skill-creator`, `/canvas-design`, `/web-artifacts-builder`, `/mcp-builder`, `/theme-factory`, `/brand-guidelines`, `/doc-coauthoring`, `/internal-comms`, `/algorithmic-art`, `/slack-gif-creator`. Light-mode styling. Each card shows name, publisher, download count, `+` button.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/045_claude-free_directory_skills.png`
- **Implementation status:** partial (same as IMG 120)
- **Primary files:** Same as IMG 120
- **API endpoints:** Same as IMG 120
- **Data flow:** Same as IMG 120
- **Flaws:**
  - All flaws from IMG 120 apply identically.
  - [major] Light theme rendering — `/skills` page uses dark-mode-assumed colors (`bg-black/20`, `border-white/[0.06]`, etc.) that may not properly adapt to light mode @ `apps/web/app/skills/page.tsx:613`
  - [minor] `/skill-creator` in Claude has a gear icon (indicating already installed/managed); AGI has no installed-state indicator on skill cards @ `apps/web/app/skills/page.tsx:531-558`
- **Visual gaps:**
  - Claude Free light theme: white background, warm gray text, clean card borders; AGI's dark-mode-first CSS classes produce incorrect contrast in light mode
  - Skill cards in Claude show 2 per row in modal width; AGI shows 3 per row on full page

---

## IMG: 046_claude-free_directory_plugins.png

- **Feature:** Same Directory modal — Plugins tab on Claude Free tier (light theme). Identical plugin cards: Productivity, Design, Marketing, Engineering, Data, Finance, Product management, Operations. Info banner: "Plugins can be browsed, but are only available for use in the desktop app. Download Claude for Desktop." Light-mode styling.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/046_claude-free_directory_plugins.png`
- **Implementation status:** missing (same as IMG 122)
- **Primary files:** Same as IMG 122
- **API endpoints:** None
- **Data flow:** Same as IMG 122
- **Flaws:**
  - All flaws from IMG 122 apply identically.
  - [major] No light-theme consideration since the entire feature is missing @ N/A
- **Visual gaps:**
  - Entire plugins tab is missing; no light-mode variant to audit

---

## Summary of Cross-Cutting Gaps

### Architecture Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| No unified Directory modal | Critical | Claude has a single `Directory` overlay with 3 tabs (Skills, Connectors, Plugins). AGI has 3 separate pages with no shared shell or cross-navigation. |
| No plugins catalog | Critical | The entire plugins/MCP-plugins browsing concept is absent. `/features/plugins` redirects to a marketing page. |
| Skills use hardcoded data | Critical | `/skills` page has 55 hardcoded items; does not use the dynamic `@agiworkforce/skills` package or `/api/skills` endpoint. |
| `x-csrf-token` header missing on connect/disconnect | Major | Frontend `handleConnect()`/`handleDisconnect()` in `ConnectorsPage` do not call `getCsrfToken()` or set the `x-csrf-token` header; backend `requireCsrfToken()` checks this header. Other pages do set it. All cookie-auth POST/DELETE mutations will 403. |
| MCP endpoint mismatch | Minor | `AddCustomConnectorDialog` posts to `/api/connectors/mcp` (does not exist); actual MCP route is `/api/mcp`. |

### Visual/UX Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| No popularity/ranking badges | Major | Claude shows "Most popular", "#N popular", "New", "Trending" on connectors; AGI has none. |
| No Filter by / Sort by controls | Major | Both Skills and Connectors pages lack sort/filter dropdowns present in Claude. |
| No per-card `+` button | Major | Claude cards have a `+` icon for quick install; AGI uses full-width Connect buttons. |
| Dark-mode-only styling | Major | Multiple pages use `bg-black/20`, `border-white/[0.06]`, `bg-white/[0.02]` which are dark-mode-assumed and may not render correctly in light mode. |
| External logo hotlinking | Major | Connector logos fetched from Wikipedia, gstatic, Atlassian CDN, brand favicons — fragile, no caching, potential CORS/availability issues. |
| Hardcoded colors | Cosmetic | `#0f0e0d` in AddCustomConnectorDialog, `#09090b` / `#edebe8` / `#888480` / `#555150` / `#c8892a` / `#d49a3a` in MCP Directory page violate no-hardcoded-colors rule. |

### Files Requiring Attention

1. `apps/web/features/connectors/pages/ConnectorsPage.tsx` — CSRF token gap, external logos, dark-mode assumptions
2. `apps/web/app/skills/page.tsx` — hardcoded arrays, no API integration, no publisher/download data
3. `apps/web/app/connectors/mcp-directory/page.tsx` — hardcoded hex colors, dark-mode only
4. `apps/web/app/features/plugins/page.tsx` — redirect stub, no actual plugins directory
5. `apps/web/features/connectors/config/connector-logos.ts` — external URL fragility
6. `apps/web/features/chat/components/SkillsMenu.tsx` — references `~/.claude/skills/` (Anthropic branding)

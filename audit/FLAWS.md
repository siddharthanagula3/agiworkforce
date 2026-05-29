# Audit Flaws — Severity-Sorted

Status: Current
Owner: Platform lead
Last updated: 2026-05-25

> Generated 2026-05-24 from 27 parallel image-vs-code audit batches.
> **Updated 2026-05-25**: Code-level re-verification against actual source. Most security/auth and dead-code items are now resolved.
> **~210 Claude reference images** audited against `apps/web/` codebase.

---

## CRITICAL — Security / Auth (4 original → 0 open)

- ~~**Stale Supabase OAuth callback route**~~ — [FIXED] Route now returns 410 Gone, no OAuth code exchange
- ~~**Clerk-Supabase dual-auth coexistence**~~ — [FIXED] Full Clerk migration complete. All auth paths use Clerk. Dead Supabase modules deleted.
- **Fake OAuth connector flow** — [INTENTIONAL] Documented in `docs/intentional-divergences.md` (D-02). UI gates OAuth connectors behind "Coming Soon" — users cannot reach the fake path. Deferred to v1.1.
- ~~**CSRF token missing from connector mutations**~~ — [FIXED] `getCsrfToken` used in `handleConnect` (line 1740) and `handleDisconnect` (line 1780). Server enforces via `requireCsrfToken`.

## CRITICAL — Dead Code / Broken Wiring (12 original → 2 open)

- ~~**SkillsMenu.tsx is dead code**~~ — [FIXED] Imported in `ChatComposerNew.tsx` line 20
- ~~**ConversationListItem.tsx is orphaned**~~ — [FIXED] Imported in `ChatSidebar.tsx` line 35, rendered in `SessionItem`
- ~~**FolderManagement.tsx is orphaned**~~ — [FIXED] Exported from `Sidebar/index.ts`, used by `FolderContextSelector`
- **Three disconnected slash command registries** — [PARTIALLY FIXED] Canonical `slash-command-registry.ts` exists and is used by `SlashCommandMenu`. Two orphaned hooks (`useSlashCommands.ts`, `useSlashCommandAutocomplete.ts`) with hardcoded lists remain unused — should be deleted.
- ~~**ArtifactPreview disconnected from ArtifactsPanel**~~ — [FIXED] Imported in `ArtifactsPanel.tsx` line 7
- ~~**Three incompatible artifact stores**~~ — [RESOLVED] Intentional architecture: 4 stores for 4 surfaces (web chat, web alias, unified-chat package, desktop Tauri). Not duplicates.
- ~~**Dual project stores not synchronized**~~ — [RESOLVED] Intentional separation: canonical project data vs web-local metadata (per-project model selection)
- ~~**WebShellV3 + mode switcher is dead code**~~ — [NOT DEAD] Live behind `?unified=1` feature flag via `UnifiedChatPage` in `app/chat/page.tsx`
- ~~**Orphaned tab-based SettingsPage**~~ — [FIXED] File deleted
- **Dead custom MCP registration endpoint** — STILL OPEN. `/api/connectors/mcp` has no route handler.
- ~~**MCP OAuth types are dead code**~~ — needs re-verification
- ~~**Settings link routes to /chat**~~ — [FIXED] Now routes to `/settings/general` (ChatSidebar.tsx line 289)

### Missing Feature Systems (22)

- **No plugin entity or data model** — no name/author/version/source/download-count metadata [B05]
- **No plugin submenu in composer** [B05]
- **No plugin directory/marketplace overlay** [B05]
- **No plugin install/uninstall mechanism** [B05]
- **No plugin detail/customize page** [B05]
- **No plugin-scoped connector listing** [B05]
- **No skill detail page with rendered markdown** [B05]
- **No unified Customize Hub** — Claude has dedicated `/customize` with sidebar nav; AGI scatters skills/connectors across separate routes [B07]
- **No per-tool permission system** — Claude has Always allow/Needs approval/Blocked/Custom per tool; AGI has zero infrastructure [B09]
- **No tool inventory per connector** — Claude enumerates MCP tools by name with descriptions/categories; AGI stores static `actionCount` [B09]
- **No master-detail connector layout** — Claude has persistent left sidebar with right detail panel; AGI has flat card grid [B09]
- **No desktop connector management from web** [B09]
- **No pre-connection overview dialog** [B09]
- **No unified Directory modal** — Claude has single modal with 3 tabs; AGI has 3 separate pages [B06]
- **No plugins catalog** — `/features/plugins` redirects to marketing landing [B06]
- **No usage dashboard / heatmap** [B11]
- **No permission mode system** (ask/accept/plan/auto/bypass) [B11]
- **No repository/directory selector** [B11]
- **No cowork task management UI** [B11]
- **No /chats full-page index route** — 3 reference images show full-page chats view that is completely absent from 96 routes [B13]
- **No relevant chats cross-conversation linking** [B17]
- **No research panel with sources sidebar** [B19]

### Connector Registry (5)

- **Only 32 of ~190 connectors exist** — all hardcoded in client-side array [B08]
- **No pagination** — Claude paginates across 19 pages [B08]
- **No connector type system** — Claude distinguishes connector/interactive/MCP server types [B08]
- **No dynamic connector registry** — all 32 hardcoded in TypeScript array @ `ConnectorsPage.tsx:60-465` [B08]
- **No OAuth grant-access modal** — OAuth handoff with browser-tab redirect doesn't exist [B10]

### Model Selector (5)

- **Flat all-provider model dump** instead of curated tier list [B02]
- **No "More models" submenu** [B02]
- **No tier-gating or upgrade prompts** — ComposerFooter does not import tier-checking functions [B02]
- **Adaptive thinking toggle in wrong position** — outside dropdown instead of inside between entries [B02]
- **"Adaptive" vs "Auto" semantic mismatch** — fundamentally different concepts look alike [B02]

### Composer / Add Menu (4)

- **Connectors submenu entirely absent from composer "+" menu** [B03]
- **Per-chat connector enable/disable has no data model** — `user_connectors` only stores global `is_active` [B03]
- **Per-tool permission controls absent** [B03]
- **Code/Cowork surface-specific composers don't exist** [B03]

### Skills (4)

- **No skill submenu flyout in overflow menu** [B04]
- **Skills not listed in slash command dropdown** [B04]
- **No path from slash command to skill activation** [B04]
- **Skills page uses 55 hardcoded items** instead of fetching from working `/api/skills` [B07]

### Artifacts (16)

- **No progressive/streaming artifact rendering** — regex requires closing fences @ `ArtifactBlock.tsx:49` [B14]
- **No "New artifact" button on gallery** [B15]
- **No rendered content preview thumbnails** [B15]
- **No artifact category picker** (7 categories) [B15]
- **No guided artifact creation wizard** [B15]
- **Two competing search modals** — `WebSearchModalCmdK` + `GlobalSearchDialog` coexist [B15]
- **No gallery loading skeleton** [B15]
- **Markdown preview missing in artifact panel** — only raw source shown [B16]
- **No PDF viewer** (only PDF export) [B16]
- **No DOCX viewer** (only DOCX export) [B16]
- **No "Download all" for multiple artifacts** [B16, B17]
- **"PASTED" tag badge not implemented** [B17]
- **message.attachments defined but never rendered** — thumbnails lost after sending [B17]
- **text/plain MIME type bug** in "Open in new tab" @ `ArtifactBlock.tsx:150` and `ArtifactPreview.tsx:354` [B14]
- **Inline artifact cards are tiny 80px thumbnails** vs full-width cards [B14, B16]
- **ArtifactsPanel is code-only** — no preview/rendered view [B14]

### Projects (14)

- **No project detail right sidebar** (Memory/Instructions/Files) [B20]
- **No project-scoped chat view** [B20]
- **No three-pane layout** [B20]
- **No file preview modal** [B20]
- **No card context menu** (star/edit/archive/delete) [B20]
- **No in-project model selector** [B20]
- **No project capacity tracking or error banners** [B20]
- **Sort menu non-functional** — button renders but does nothing [B20]
- **Knowledge file upload permanently disabled** [B20]
- **Instructions editor not exposed** on detail page [B20]
- Remaining 4 from dual store, hardcoded colors, conversation UUID titles [B20]

### Settings (5)

- **General settings form fields have no onChange/state/persistence** — input silently discarded @ `settings/general/page.tsx` [B22]
- **Account page entirely missing** [B22]
- **Usage page entirely missing** [B22]
- **No invoice history on billing page** [B22]
- **No plan feature checklist for free-tier** [B22]

### Downloads/Pricing (9)

- **Download page is text-only CLI installer** — no integration hub [B21]
- **No mobile download section** [B21]
- **No Chrome extension install card** [B21]
- **Pricing tier architecture completely divergent** [B21]
- **No Free plan card equivalent** [B21]
- **Team plans use wrong pricing model** [B21]
- **No Enterprise plan** [B21]
- **No interleaved reasoning+tool flow** — thinking blocks and tool steps render as separate sections [B19]
- **No inline source-name citations** [B19]

### Reasoning/Search (4)

- **No interleaved reasoning+tool flow** [B19]
- **No inline source-name citations** [B19]
- **No per-section source links** [B19]
- **Research panel entirely missing** [B19]

---

## MAJOR (237 flaws) — Top 30

1. Skill body content never injected into LLM requests — metadata.skillId passed but body never fetched/prepended [B04]
2. @mention leaves literal "@SkillName" text in message [B04]
3. Three parallel auth stores with no cross-synchronization [B12]
4. Account menu has only 2 of Claude's 8+ items [B12]
5. Logout signs out of Supabase but not Clerk [B12]
6. No Chat/Cowork/Code mode-switcher tabs in sidebar [B01, B11]
7. Forced dark mode — `WebChatPage.tsx:583` hardcodes `className="dark"` [B01]
8. No user plan badge in sidebar footer [B01]
9. Connector logos rely on external CDN hotlinks (Wikipedia, GitHub, gstatic) [B06, B08]
10. No sort/filter/type dropdowns on directory pages [B06, B08]
11. Sidebar search button has no onClick handler [B13]
12. Bulk select mode absent [B13]
13. Comparison renders as side-by-side grid vs Claude's tab switch [B17]
14. No vertical connector line between sequential tool steps [B18]
15. Search results rendered as heavy bordered cards (3-4x vertical space) [B18]
16. Tool summaries not interleaved within prose [B18]
17. No file-type badges in tool step rendering [B18]
18. No tabular data formatting for tool results [B18]
19. Settings nav has 6 items vs Claude's 9+ [B23]
20. Capabilities page is informational table instead of functional toggles [B23]
21. 5 existing setting routes not linked in nav (memory, voice, sync, notifications, byok) [B23]
22. Header uses Supabase `getSession()` — Clerk users see "Sign In" [B24]
23. Four dead-code Supabase auth modules [B24]
24. `MARKETING_MODEL_PILLS` hardcodes model IDs violating locked rule [B24]
25. Hardcoded hex colors on auth pages [B24]
26. No notification bar during artifact generation [B14]
27. Fixed 400px artifact panel width [B14]
28. `document` type explicitly maps to `code` preventing markdown preview [B14]
29. Print blocked by sandbox missing `allow-modals` [B16]
30. No "Open in Antigravity" external viewer button [B17]

---

## Source Reports

| Batch     | Report File                       | Images   | Critical | Major   |
| --------- | --------------------------------- | -------- | -------- | ------- |
| 01        | batch-01-home-composer.md         | 5        | 0        | 6       |
| 02        | batch-02-model-selector.md        | 6        | 5        | 1       |
| 03        | batch-03-add-menu.md              | 8        | 4        | 9       |
| 04        | batch-04-skills-menu.md           | 7        | 4        | 10      |
| 05        | batch-05-plugins.md               | 7        | 7        | 0       |
| 06        | batch-06-directory-pages.md       | 6        | 3        | 6       |
| 07        | batch-07-customize-hub.md         | 10       | 5        | 5       |
| 08        | batch-08-connectors-directory.md  | 19       | 5        | 5       |
| 09        | batch-09-connector-permissions.md | 14       | 22       | 17      |
| 10        | batch-10-mcp-oauth.md             | 5        | 3        | 14      |
| 11        | batch-11-code-cowork.md           | 11       | 6        | 4       |
| 12        | batch-12-account-menu.md          | 6        | 2        | 7       |
| 13        | batch-13-sidebar.md               | 6        | 3        | 9       |
| 14        | batch-14-artifact-lifecycle.md    | 12       | 6        | 13      |
| 15        | batch-15-artifact-gallery.md      | 7        | 6        | 1       |
| 16        | batch-16-artifact-viewers.md      | 12       | 4        | 11      |
| 17        | batch-17-chat-response.md         | 6        | 5        | 6       |
| 18        | batch-18-inline-tools.md          | 8        | 0        | 14      |
| 19        | batch-19-reasoning-search.md      | 11       | 4        | 10      |
| 20        | batch-20-projects.md              | 18       | 14       | 12      |
| 21        | batch-21-downloads-plans.md       | 8        | 9        | 15      |
| 22        | batch-22-settings-cluster1.md     | 10       | 5        | 12      |
| 23        | batch-23-settings-cluster2.md     | 10       | 0        | 18      |
| 24        | batch-24-pricing-auth.md          | 14       | 1        | 7       |
| 25        | batch-25-chrome-ext-marketing.md  | 18       | —        | —       |
| 26        | batch-26-vscode-cli-marketing.md  | 40       | —        | —       |
| 27        | batch-27-mobile-marketing.md      | 27       | —        | —       |
| **TOTAL** |                                   | **~210** | **123**  | **237** |

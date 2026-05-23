# R26-PARITY Lane W2b — Claude Desktop Max-20x Parity Audit

**Date:** 2026-05-22  
**Auditor:** Desktop Engineer (claude-sonnet-4-6)  
**Screenshots corpus:** 65 images at `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/`  
**Our source base:** `apps/desktop/src/` (v3 shell + chat features)  
**Reference locks:** `docs/locks/v1-local-only-cloud-waitlist-2026-05-18.md`

---

## 1. Inventory Table

| #    | Screenshot                                                      | Feature Area                                         | Notes                                                                                                                              |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 100  | `100_claude-max20x_home_composer.png`                           | Home / composer                                      | Main chat mode, sidebar, recent chats                                                                                              |
| 101  | `101_claude-max20x_model-selector_opus-enabled.png`             | Model selector — primary 3                           | Opus 4.7 / Sonnet 4.6 / Haiku 4.5 + Adaptive thinking toggle                                                                       |
| 102  | `102_claude-max20x_model-selector_more-models.png`              | Model selector — more models flyout                  | Older Claude models (Opus 4.6, Opus 3, Sonnet 4.5)                                                                                 |
| 103  | `103_claude-max20x_add-menu_tools-connectors.png`               | Composer add-menu (Chat mode)                        | Files, project, GitHub, Skills, Connectors, Plugins, Research, Web search, Style                                                   |
| 104  | `104_claude-max20x_connectors-submenu_connected.png`            | Connectors submenu                                   | Gmail, Vercel, Apify, Claude in Chrome, Context7, Control Mac + Tool access row                                                    |
| 105  | `105_claude-max20x_skills-submenu_installed.png`                | Skills submenu                                       | algorithmic-art, brand-guidelines, canvas-design, doc-coauthoring, etc.; + Manage skills / Add skill                               |
| 106  | `106_claude-max20x_design_research-preview.png`                 | Claude Design (Anthropic Labs product — NOT desktop) | Prototype/slide/template creator; out of scope for desktop                                                                         |
| 108  | `108_claude-max20x_code_home.png`                               | Claude Code ("Cowork") mode home                     | Usage heatmap, stats (sessions/tokens/streak), model selector, repo/branch/worktree context chips                                  |
| 109  | `109_claude-max20x_code_sidebar-more-menu.png`                  | Cowork sidebar "more" menu                           | Customize sidebar, plus session items                                                                                              |
| 110  | `110_claude-max20x_code_permission-mode-menu.png`               | Permission mode picker                               | Ask permissions / Accept edits / Plan mode / Auto mode / Bypass permissions (5 levels)                                             |
| 111  | `111_claude-max20x_code_model-effort-menu.png`                  | Code mode model+effort picker                        | Models (Opus 4.7 / 4.7 1M / Sonnet 4.6 / Haiku 4.5 / Opus 4.6 Legacy) × Effort (Low/Medium/High/Extra high/Max) + Fast mode        |
| 112  | `112_claude-max20x_code_usage-popover.png`                      | Usage popover (Code mode)                            | Plan usage: 5-hour limit %, weekly all-models %, weekly Claude Design %, Sonnet only %                                             |
| 113  | `113_claude-max20x_code_repo-selector.png`                      | Repo selector (Code mode)                            | Recent repos: agiworkforce, cli, claw-code, src, homebrew-tap + Open folder…                                                       |
| 114  | `114_claude-max20x_code_add-menu.png`                           | Code mode add-menu                                   | Add files/photos, Add folder, Import GitHub issue, Slash commands, Connectors, Plugins                                             |
| 115  | `115_claude-max20x_code_connectors-submenu.png`                 | Code mode connectors submenu                         | Gmail, Vercel, Apify, Claude in Chrome, Context7, Control Mac, Excel (Anthropic), Filesystem, Apple Notes                          |
| 116  | `116_claude-max20x_customize_home.png`                          | Customize hub empty state                            | Full-page "Customize Claude" with Connect your apps / Create new skills CTAs                                                       |
| 117  | `117_claude-max20x_customize_skills_detail.png`                 | Customize > Skills — skill detail                    | Three-pane: list / description+YAML / right meta; humanizer example                                                                |
| 118  | `118_claude-max20x_customize_skills_code-view.png`              | Customize > Skills — code view                       | Raw YAML of skill system prompt                                                                                                    |
| 119  | `119_claude-max20x_customize_skills_add-menu.png`               | Customize > Skills — Browse/Create                   | Browse skills / Create skill dropdown                                                                                              |
| 120  | `120_claude-max20x_directory_skills.png`                        | Skills directory modal                               | Grid of Anthropic & Partners skills with install count; search + filter + sort                                                     |
| 121  | `121_claude-max20x_directory_connectors.png`                    | Connectors directory modal                           | Google Drive / Gmail / Canva / Figma / M365 / Google Calendar / Atlassian / Notion / Shopify / CoCounsel Legal                     |
| 122  | `122_claude-max20x_directory_plugins.png`                       | Plugins directory modal                              | Note: "Plugins can be browsed but only available for use in the desktop app"                                                       |
| 123  | `123_claude-max20x_customize_connectors_github-detail.png`      | Connectors — GitHub detail                           | Web-connected list + GitHub/Gmail/Vercel/Xcode; detail: Chat/Projects/Claude Code use cases                                        |
| 124  | `124_claude-max20x_customize_connectors_gmail-permissions.png`  | Connectors — Gmail tool permissions                  | Read-only 3 tools / Write/delete 9 tools; per-tool Allow/Needs approval toggle                                                     |
| 125  | `125_claude-max20x_customize_connectors_vercel-permissions.png` | Connectors — Vercel tool permissions                 | Read-only 13 tools / per-tool Allow/Ask/Never; Custom grouping                                                                     |
| 126  | `126_claude-max20x_customize_connectors_add-menu.png`           | Connectors — add menu                                | Browse connectors / Add custom connector                                                                                           |
| 127  | `127_claude-max20x_custom-remote-mcp-connector-modal.png`       | Add custom MCP connector modal                       | Name + Remote MCP server URL + Advanced settings; Beta badge                                                                       |
| 128  | `128_claude-max20x_account-menu.png`                            | Account menu                                         | Settings / Language / Get help / View all plans / Get apps and extensions / Gift Claude / Learn more / Log out                     |
| 141  | `141_claude-max20x_artifact_prompt-ready.png`                   | Artifact creation — empty state                      | Sidebar icons, home screen composer with artifact prompt pre-filled                                                                |
| 142  | `142_claude-max20x_artifact_generating.png`                     | Artifact — generating state                          | Thinking pill "Architecting…" + loading; "Want to be notified?" banner + Notify CTA                                                |
| 143  | `143_claude-max20x_artifact_result-inline-widget.png`           | Artifact — inline interactive widget                 | Split left (chat + notes) / right (live KPI widget with delta coloring)                                                            |
| 144  | `144_claude-max20x_artifact_widget-interacted-last-month.png`   | Artifact — widget state toggled                      | Same widget with "Last month" active                                                                                               |
| 145  | `145_claude-max20x_downloads_apps_top.png`                      | Downloads page — Microsoft Office section            | Excel/PowerPoint/Word Install links; Desktop app Open; Claude Code terminal/VSCode/Desktop/JetBrains                               |
| 146  | `146_claude-max20x_downloads_mobile-chrome.png`                 | Downloads page — Mobile + Chrome                     | iOS/Android Download; Chrome Install                                                                                               |
| 147  | `147_claude-max20x_upgrade-plans_individual.png`                | Upgrade plans — Individual                           | Pro $17/mo yearly (downgrade); Max from $100/mo (Adjust usage) + feature list                                                      |
| 148  | `148_claude-max20x_upgrade-plans_team-enterprise.png`           | Upgrade plans — Team & Enterprise                    | Team $20/$100 per seat; Enterprise $20/seat + API rates + full feature matrix                                                      |
| 149  | `149_claude-max20x_artifacts_my-empty-or-loading.png`           | Artifacts gallery — initial/loading                  | Grid of artifact thumbnails (small)                                                                                                |
| 149b | `149b_claude-max20x_artifacts_grid-loaded.png`                  | Artifacts gallery — loaded                           | Same grid with titles and "New artifact" CTA                                                                                       |
| 150  | `150_claude-max20x_chats_recents.png`                           | Chats index — recent list                            | Scrollable list with timestamps; Select chats / New chat buttons; search bar                                                       |
| 151  | `151_claude-max20x_global-search-modal.png`                     | Global search modal                                  | Projects first (JOB / research / claude Prompt) then chats with icons; keyboard hints                                              |
| 152  | `152_claude-max20x_sidebar-more-menu.png`                       | Sidebar expand menu                                  | Artifacts / Customize sidebar only                                                                                                 |
| 153  | `153_claude-max20x_chats_bulk-select-mode.png`                  | Chats — bulk select mode                             | Checkboxes + Select all / Move to project / Delete / Cancel actions; visible via Chrome/web                                        |
| 154  | `154_claude-max20x_new-artifact_category-picker.png`            | New artifact — category picker                       | Apps and websites / Documents and templates / Games / Productivity tools / Creative projects / Quiz or survey / Start from scratch |
| 155  | `155_claude-max20x_new-artifact_start-from-scratch-chat.png`    | Artifact wizard — question step                      | "What do you want to create?" 5-option list; "Or reply directly…" composer                                                         |
| 156  | `156_claude-max20x_artifact_viewer_split-pane.png`              | Artifact viewer — split pane                         | Left: chat with deep research artifact; right: rendered doc "The Anthropic / Claude Suite…"                                        |
| 157  | `157_claude-max20x_artifact_copy-export-menu.png`               | Artifact — copy/export menu                          | Same split pane + top-right "Download as / Copy" menu                                                                              |
| 158  | `158_claude-max20x_research-panel_sources-trace.png`            | Research panel — sources trace                       | Artifact with right sidebar showing GitHub repo + research-report citations                                                        |
| 159  | `159_claude-max20x_project-create-form.png`                     | Project create form                                  | "Create a personal project" — Name + Description fields; white light theme                                                         |
| 160  | `160_claude-max20x_example-project_overview.png`                | Project overview page                                | Title / description / composer + right panel: Add context / Memory / Files list                                                    |
| 161  | `161_claude-max20x_project-file-preview-modal.png`              | Project — file preview modal                         | Inline file viewer for claude-prompting-guide.md                                                                                   |
| 162  | `162_claude-max20x_project-options-menu.png`                    | Project cards — options menu                         | Star / Edit details / Archive / Delete                                                                                             |
| 163  | `163_claude-max20x_project-edit-details-modal.png`              | Project edit details modal                           | Name + Description form                                                                                                            |
| 164  | `164_claude-max20x_project-composer-add-menu.png`               | Project composer add-menu                            | Files/photos / Take screenshot / Add from GitHub / Skills / Connectors / Research / Web search / Style                             |
| 165  | `165_claude-max20x_project-connectors-submenu.png`              | Project connectors submenu                           | Same connected connectors (Gmail/Vercel toggles) + Tool access flyout                                                              |
| 166  | `166_claude-max20x_project-model-selector.png`                  | Project model selector                               | Opus 4.7 / Sonnet 4.6 / Haiku 4.5 + Adaptive thinking toggle + More models                                                         |
| 167  | `167_claude-max20x_project-chat-composer-ready.png`             | Project chat composer                                | Within project context; typed query visible                                                                                        |
| 168  | `168_claude-max20x_project-chat_response-loading.png`           | Project chat — loading state                         | Loading animation + "Want to be notified?" banner                                                                                  |
| 169  | `169_claude-max20x_project-chat_completed-response.png`         | Project chat — completed response                    | Full reply + copy/thumbs/regenerate action row                                                                                     |
| 170  | `170_claude-max20x_project-chat_reasoning-expanded.png`         | Project chat — reasoning expanded                    | Extended thinking visible (collapsed expandable)                                                                                   |
| 171  | `171_claude-max20x_project-return-loading-skeleton.png`         | Project return — loading skeleton                    | Skeleton lines over previously-loaded chat list                                                                                    |
| 172  | `172_claude-max20x_project-after-chat-no-chat-list.png`         | Project — post-first-chat                            | Single chat in list; right panel: Memory (only you) + Files                                                                        |
| 173  | `173_claude-max20x_chats-index_recent-project-chat.png`         | Chats index — project badge                          | Chat entries show parent project name as secondary label                                                                           |
| 174  | `174_claude-max20x_projects-index_cards-sort-search.png`        | Projects index — cards + sort/search                 | Card grid with name / description / last-updated; Sort by / Search bar; New project CTA                                            |
| 175  | `175_claude-max20x_projects-sort-menu.png`                      | Projects sort menu                                   | Recent / Created / Alphabetical                                                                                                    |
| 176  | `176_claude-max20x_expanded-sidebar_projects.png`               | Projects index (in sidebar mode)                     | Same card grid accessible via Projects nav item                                                                                    |

---

## 2. Parity Scorecard

| Feature                                               | Claude Max has it   | We have it                                                                                 | Parity level                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Model selector — primary 3**                        | Yes (101)           | Yes — `ModelPopover.tsx` with catalog helpers                                              | FULL                                                                                                                                                                                                                                         |
| **Model selector — adaptive thinking toggle**         | Yes (101, 166)      | Yes — `ModelPopover.tsx` IosToggle + `thinkingEnabled` store                               | FULL                                                                                                                                                                                                                                         |
| **Model selector — more models flyout**               | Yes (102)           | Yes — `MORE_GROUPS` with older Anthropic + other providers                                 | PARTIAL — we show older Anthropic + 5 other providers; Claude shows 3 legacy models (Opus 4.6, Opus 3, Sonnet 4.5) specifically; our "legacy" slot resolves via task-based catalog helpers which may not surface these exact legacy variants |
| **Composer add-menu (Chat)**                          | Yes (103)           | Yes — `PlusMenu.tsx`                                                                       | PARTIAL — we have Files/GitHub/Skills/Connectors/Plugins/Research/Web search/Style; missing: "Add to project" as a top-level item (we route through connectors sub)                                                                          |
| **Connectors submenu**                                | Yes (104, 115, 165) | Yes — `PlusMenu.tsx` connectors flyout + `ConnectorsView.tsx`                              | PARTIAL — our PlusMenu uses static placeholder list (`CONNECTORS.connected`); not wired to live `connectorsStore`                                                                                                                            |
| **Skills submenu (in composer)**                      | Yes (105)           | Yes — `PlusMenu.tsx` SKILLS_LIST flyout                                                    | PARTIAL — static placeholder (`SKILLS_LIST = [translate, summarize, proofread, explain]`); not pulled from `skillMarketplaceStore`                                                                                                           |
| **Customize hub — Skills tab**                        | Yes (116–119)       | Yes — `CustomizeHub.tsx` + `SkillsView.tsx`                                                | PARTIAL — skill detail, search, enable/disable present; missing: "Browse skills" directory modal (120), inline code/YAML view is stub, no "Create skill" flow                                                                                |
| **Skills directory modal**                            | Yes (120)           | No                                                                                         | MISSING                                                                                                                                                                                                                                      |
| **Connectors directory modal**                        | Yes (121)           | No                                                                                         | MISSING                                                                                                                                                                                                                                      |
| **Plugins directory modal**                           | Yes (122)           | Partial — `PluginMarketplace.tsx` exists                                                   | PARTIAL — desktop note "plugins browsable but only usable in desktop app" suggests we need same caveat copy                                                                                                                                  |
| **Connector per-tool permission controls**            | Yes (124, 125)      | Yes — `ConnectorsView.tsx` per-tool Allow/Ask/Never cycle                                  | FULL                                                                                                                                                                                                                                         |
| **Add custom (remote) MCP connector**                 | Yes (127)           | Yes — `MCPConfigEditor.tsx`, `MCPCredentialManager.tsx`                                    | FULL — we have full MCP server management; may differ in surface (settings vs customize hub)                                                                                                                                                 |
| **Code/Cowork mode home — usage heatmap + stats**     | Yes (108)           | Yes — `CodeModeHome.tsx` with hardcoded fixture stats                                      | PARTIAL — heatmap and stats present but stats are static fixture; not reading from real usage store                                                                                                                                          |
| **Code/Cowork mode — permission mode picker**         | Yes (110)           | No dedicated UI found                                                                      | MISSING — no `PermissionModeMenu` or equivalent in `features/v3` or `features/cowork`                                                                                                                                                        |
| **Code/Cowork mode — model+effort matrix**            | Yes (111)           | No                                                                                         | MISSING — our `ModelPopover` covers models but no effort level (Low/Medium/High/Extra high/Max)                                                                                                                                              |
| **Code/Cowork mode — usage popover**                  | Yes (112)           | No dedicated usage popover                                                                 | MISSING — no plan-usage breakdown popover in the Code/Cowork composer area                                                                                                                                                                   |
| **Code/Cowork mode — repo selector**                  | Yes (113)           | Yes — `CodeModeHome.tsx` shows context chips (Local/repo/branch/worktree)                  | PARTIAL — chips present but no dedicated repo selector dropdown with recent repos list                                                                                                                                                       |
| **Global search modal (⌘K)**                          | Yes (151)           | Yes — `SearchModalCmdK.tsx`                                                                | PARTIAL — we search Chats / Projects / Skills / Connectors / Settings; Claude's modal shows Projects first with member name; we're missing the "Projects listed above Chats" ordering and member name attribution                            |
| **Chats index — search + Select chats (bulk)**        | Yes (150, 153)      | No bulk-select found in v3 Chats view                                                      | MISSING — no "Select chats" / bulk delete / move-to-project in our chats index                                                                                                                                                               |
| **Artifacts gallery — grid view**                     | Yes (149, 149b)     | Yes — `ArtifactsGallery.tsx`                                                               | PARTIAL — grid exists; we need to verify "New artifact" CTA and category-picker wizard                                                                                                                                                       |
| **New artifact — category picker wizard**             | Yes (154, 155)      | Not found in v3 path                                                                       | MISSING — no `ArtifactCategoryPicker` in `features/v3` or `features/artifacts`; `ArtifactsGallery.tsx` exists but wizard is absent                                                                                                           |
| **Artifact split-pane viewer**                        | Yes (156, 157)      | Yes — `ArtifactWorkspace.tsx`, `ArtifactPanel.tsx`                                         | PARTIAL — split pane exists; copy/export menu needs verification against screenshot 157                                                                                                                                                      |
| **Artifact — "Notify me when done" banner**           | Yes (142, 168)      | No                                                                                         | MISSING — no notification-opt-in banner during long-running generation                                                                                                                                                                       |
| **Research panel — sources trace sidebar**            | Yes (158)           | Yes — `ResearchPanel.tsx`, `ResearchSourceCard.tsx`, `SourceCard.tsx`                      | PARTIAL — components exist; sources sidebar inside split pane needs live verification                                                                                                                                                        |
| **Projects — create form**                            | Yes (159)           | Yes — `ProjectsView.tsx` → project create                                                  | PARTIAL — our form may ask "What are you working on?" (name + description); Claude's is "Create a personal project" with identical fields                                                                                                    |
| **Projects — overview (files + memory + composer)**   | Yes (160)           | Yes — `chat/ProjectsView.tsx`, `ProjectSettingsDialog.tsx`, `ProjectEditDetailsDialog.tsx` | PARTIAL — Memory section is in sidebar but "Project memory will show here after a few chats" is the same placeholder; file list present                                                                                                      |
| **Projects — file preview modal**                     | Yes (161)           | Unknown — no `ProjectFilePreviewModal` found                                               | MISSING (likely)                                                                                                                                                                                                                             |
| **Projects — options menu (Star/Archive)**            | Yes (162)           | Yes — `ProjectEditDetailsDialog.tsx` + context menu in `CoworkProjects.tsx`                | PARTIAL — Star + Edit details confirmed; Archive action status unknown                                                                                                                                                                       |
| **Projects — per-project model selector**             | Yes (166)           | Yes — project composer uses same `ModelPopover`                                            | FULL                                                                                                                                                                                                                                         |
| **Extended thinking visible (reasoning bubble)**      | Yes (170)           | Yes — `ThinkingPill.tsx`                                                                   | FULL                                                                                                                                                                                                                                         |
| **Chat response actions (copy/thumb/regenerate)**     | Yes (169)           | Yes — `ResponseActionRow.tsx`                                                              | FULL                                                                                                                                                                                                                                         |
| **Chats index — project badge on chat items**         | Yes (173)           | Unknown                                                                                    | NEEDS_CHECK                                                                                                                                                                                                                                  |
| **Projects index — sort menu (Recent/Created/Alpha)** | Yes (175)           | Unknown                                                                                    | NEEDS_CHECK                                                                                                                                                                                                                                  |
| **Account menu**                                      | Yes (128)           | Yes — `AccountMenu.tsx`                                                                    | PARTIAL — we have Settings/Language/Log out; missing: "Get apps and extensions", "Gift Claude", "View all plans", "Learn more"                                                                                                               |
| **Upgrade/plans page**                                | Yes (147, 148)      | Yes — `Pricing.tsx` in v3                                                                  | PARTIAL — we have pricing view but v1 lock means cloud billing is waitlist-gated; our Pricing.tsx must reflect local-only tiers not Anthropic's cloud Pro/Max/Team/Enterprise                                                                |

---

## 3. User-Flow Reality Check

For each Max-plan Claude feature, this section traces the code paths to answer:
_"If a user opens AGI Workforce.app and tries this advanced feature today, what would they actually see?"_

Evidence is cited to `apps/desktop/src/` and `apps/desktop/src-tauri/src/` line numbers.

---

### 3a. Skills System — Are the 140 skills wired at runtime?

**What Claude shows:** screenshot `105` — a Skills submenu inside the composer with real installed skills (algorithmic-art, brand-guidelines, canvas-design, doc-coauthoring, etc.) that the user can toggle on for the session. Screenshot `117–120` show a three-pane skill editor with live YAML and a Skills Directory modal.

**What we have in code:**

- `useSkillMarketplaceStore` (`stores/skillMarketplaceStore.ts`) calls real Tauri IPC: `invoke('skill_list')`, `invoke('skill_invoke', ...)`, `invoke('skill_match_for_message', ...)`. The store is live, not stubbed.
- `SkillsView.tsx` reads from this store correctly.
- `features/chat/index.tsx:1056-1072` extracts `@skill-id` mentions from user input and injects skill system prompts into `mergedCustomInstructions` before the provider request. `autoInjectSkills` is also passed at line 1160.
- BUT: `toggleSkillActive(name)` in `skillMarketplaceStore.ts` is **frontend-only in-memory state** — there is no Tauri persist call. The active state resets on app restart.
- CRITICAL BUG: `PlusMenu.tsx:30-35` — the Skills flyout in the composer uses a **hardcoded static array** (`SKILLS_LIST = [{id:'translate',...}, {id:'summarize',...}, ...]`). It does NOT read from `useSkillMarketplaceStore`. A user clicking the `+` menu in the chat composer sees 4 static dummy skills, not their real installed skills.
- There is NO `SkillsDirectory` modal component — the Browse/Install flow (screenshot `120`) is missing entirely.
- Code view in `SkillsView.tsx` shows a stub table of `[name, description, source, context_mode]` key-value pairs, not the raw YAML Claude displays (screenshot `118`).

**User flow verdict:** BROKEN. A user who installs a skill via the Customize hub can `@mention` it and it works. But the `+` menu shortcut in the composer shows wrong (hardcoded) skills. Skill active-state does not persist across restarts. Raw YAML editor is unavailable. The 140-employee pattern referenced in `memory/reference/patterns/skills-140-employees.md` describes an aspirational Tauri IPC architecture that is partially wired (invoke calls exist) but the UX surface is not complete.

---

### 3b. Memory — Does long-term memory actually persist and inject?

**What Claude shows:** Claude has a persistent memory that the model populates autonomously across conversations. No desktop-specific memory panel visible in the 65 screenshots (memory lives in profile settings, not the composer).

**What we have in code:**

- `MemoryPanel.tsx` stores entries in `localStorage['agi-memory-panel-settings']` via `readMemoryPanelSettings()` / `saveMemoryPanelSettings()`.
- `features/chat/index.tsx:1012-1024`: `readMemoryPanelSettings()` IS consumed on every message send. When `isEnabled && autoInject`, it calls `buildMemoryContext(useMemoryStore.getState().memories, maxTokens)` and prepends the result to `mergedCustomInstructions`. The injection path is real and wired.
- `memoryStore.ts` uses Zustand `persist` middleware — entries survive app restart.
- Memory entries are user-managed (added manually in the panel), not auto-populated by the model on conversation end. Claude's memory is AI-written; ours is user-written.
- Long-term memory persistence: CONFIRMED WORKING (localStorage + Zustand persist).
- Conversation-level memory injection: CONFIRMED WORKING (injected into system instructions on every send).

**User flow verdict:** WORKS but the UX is different from Claude. Memory persists and injects correctly. Gap: users must manually add memories; Claude auto-populates them from conversation. The user-facing control panel exists and functions.

---

### 3c. Multi-tab / Parallel Sessions — Real parallelism or UI illusion?

**What Claude shows:** screenshot `150` shows a chats list sidebar allowing navigation between conversations. Claude allows sending to one conversation while another is streaming in a separate tab.

**What we have in code:**

- `chatStore.ts` supports multiple `conversations[]` and `activeConversationId` — navigation between conversations works.
- `chatExecutionStore.ts:18-20`: `isLoading`, `isStreaming`, `currentStreamingMessageId` are **single global booleans**, not per-conversation state.
- Consequence: if conversation A is streaming, switching to conversation B and sending sets `isLoading = true` in the same global store — both conversations share the loading gate. The Tauri backend `chat_send_message` IPC call is not guarded by this flag (it's async), but the frontend UI disables the send button globally while any stream is active.
- `chatStore.ts:535-536`: `setActiveConversation` simply switches `activeConversationId` — does NOT pause or stop the existing stream. So streaming from conversation A continues in the background when you switch to B.
- There is no tab UI (no pinned-tab strip like browsers). Conversations switch via the sidebar list, but there is no visual indicator that a background conversation is still streaming.

**User flow verdict:** ILLUSION. Multiple conversations can exist simultaneously in the data model, and a background stream continues. However: (1) the send button is globally disabled while any stream is active, preventing true parallel dispatch from the UI; (2) no tab/badge UI surfaces that background streaming is occurring; (3) there is no way to start a new message in conversation B while A is streaming without waiting. It is "fake multi-tab" from the user's perspective.

---

### 3d. Plan Mode / Deep Research — Distinct dispatch or same as chat?

**What Claude shows:** screenshot `110` shows a 5-level permission mode picker (Ask / Accept edits / Plan mode / Auto mode / Bypass). Screenshot `156` shows a deep research artifact with a multi-section structured report. The research flow uses a distinct artifact panel.

**What we have in code:**

- `features/chat/index.tsx:921-968`: `focusMode === 'deep-research'` triggers a distinct branch. A `researchTaskId` is generated, an initial 5-step `ResearchTask` is created in `useExecutionStore`, and `taskMetadata` is set with a `type: 'deep-research-task'` marker. The `researchTaskId` is forwarded to `chat_send_message` at line 1162.
- `ResearchPanel.tsx` has `ResearchModeId = 'quick' | 'standard' | 'deep' | 'exhaustive'` with real Tauri IPC — not mock.
- Plan mode: `settingsStore.ts:1038,1263,1361` calls `invoke('set_agent_mode', { mode })` — this is real Tauri IPC. Agent mode enum includes `'plan'`.
- Permission mode picker (screenshot `110`): this is a Claude Code feature. Our `CoworkHome.tsx` does NOT render a permission-mode picker. The 5 levels (Ask/Accept edits/Plan/Auto/Bypass) are absent from our UI.
- Effort picker (screenshot `111` — Low/Medium/High/Extra high/Max): absent from our UI.
- Usage popover (screenshot `112` showing plan usage %): absent from our UI.

**User flow verdict:** PARTIAL. Deep research dispatches a distinct path that is real (IPC + research task tracking). Plan mode IPC exists (`set_agent_mode`). But the UX controls (permission-mode picker, effort picker, usage popover) shown in screenshots `110–112` are absent. A user cannot select "Plan mode" or adjust effort level from any visible UI element.

---

### 3e. Agent / Subagent UI — Wired to Tauri dispatch logic?

**What Claude shows:** Claude Code/Cowork mode (screenshot `108`) shows a full usage heatmap with real stats, a repo/branch/worktree context, and session management. Screenshots `109–115` show the complete Code mode UX including permission levels, model+effort, and connectors.

**What we have in code:**

- `CoworkHome.tsx:80-106`: calls `useAgentTaskStore` → `submitGoal` → `invoke('agi_submit_goal', ...)` or `invoke('agi_submit_goal_swarm', ...)`. The Rust `SwarmOrchestrator` and `AgentSpawner` exist (`src-tauri/src/core/swarm/`). The dispatch path is REAL.
- `agentStore.ts:227,247,267`: `pause_agent`, `resume_agent`, `orchestrator_cancel_agent` IPC calls exist.
- BUT: `CodeModeHome.tsx` (shown when mode = 'code') has hardcoded fixture stats:
  - `STATS_ALL = { sessions: '612', messages: '697,587', tokens: '134.6M', activeDays: '70', ... }` — not real usage data.
  - Heatmap uses `Math.random()` — not real activity data.
- No permission-mode picker, no effort picker, no usage popover in Code mode.
- No repo/branch/worktree context UI (screenshot `113` — repo selector is absent from our Code mode).
- `DesktopShellV3.tsx` has `mode === 'code'` rendering the code home but the comment says "peer engineers wire their components" — it is a placeholder shell.

**User flow verdict:** MIXED. The agent goal submission and swarm orchestration are real and fire real Tauri IPC. But the Code mode UI surface is a placeholder: stats are fixtures, heatmap is random, no permission/effort controls, no repo context selector. A user entering Code mode sees convincing-looking but fake data, with no way to configure the 5-level permission system Claude exposes.

---

### 3f. Reasoning Controls — Do budgets reach the provider?

**What Claude shows:** screenshot `101` shows the model selector with an "Adaptive thinking" toggle for Opus 4.7. Screenshot `111` shows a 5-level effort picker (Low / Medium / High / Extra high / Max) for Code mode.

**What we have in code:**

- `ModelPopover.tsx`: `thinkingEnabled` and `toggleThinking` come from `useChatModelStore` (from `@agiworkforce/unified-chat` package) — NOT from `useThinkingStore`.
- `modelStore.ts:245-248,556,565,575`: `thinkingModeEnabled`, `thinkingBudget`, `perTurnAdaptiveThinking` live in `useModelStore`.
- `features/chat/index.tsx:1145-1153`: These values ARE read directly from `useModelStore.getState()` and forwarded to `chat_send_message` as `thinkingMode`, `enableThinking`, and `thinkingBudget`. The path is real.
- `useThinkingStore` (`stores/settings/thinking.ts`) is a parallel store with its own Tauri IPC (`thinking_toggle`, `thinking_set_budget`). It is subscribed in `stateBridge.ts` (bridge #4: `thinkingStore.ts → AppState.settings.showThinking`). However, whether `useThinkingStore` and `useModelStore` are kept in sync is not confirmed — there are two toggle sources.
- Effort picker (Low/Medium/High/Extra high/Max from screenshot `111`): NOT present in our UI. There is no effort level selector anywhere in the frontend.
- `perTurnAdaptiveThinking` clears after each send at line 1183 — correct behavior.

**User flow verdict:** WORKS for the thinking toggle. The budget is real and flows to the provider. Gap: only a binary on/off toggle is exposed; Claude exposes 5 effort levels in Code mode. The dual-store situation (`useModelStore` vs `useThinkingStore`) is a latent sync bug risk but does not break the current flow because `chat/index.tsx` reads exclusively from `useModelStore`.

---

### 3g. Summary — Flows that are BROKEN or INCOHERENT today

| Flow                                      | Status          | Root cause                                                                                |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| Skills via `+` menu in composer           | **BROKEN**      | `PlusMenu.tsx:30-35` hardcoded static array, never reads `skillMarketplaceStore`          |
| Skill active-state persistence            | **BROKEN**      | `toggleSkillActive` is in-memory only; resets on restart                                  |
| Skills directory / Browse / YAML editor   | **MISSING**     | No directory modal component; code view stub only                                         |
| Connectors via `+` menu                   | **STALE**       | `PlusMenu.tsx:37-43` hardcoded `{gdrive, github, notion}` — never reads `connectorsStore` |
| Multi-tab parallel sends                  | **UI ILLUSION** | Global `isLoading` in `chatExecutionStore` blocks parallel send; no visual tab/badge      |
| Permission mode picker (Plan/Auto/Bypass) | **MISSING**     | No UI component; IPC exists but no trigger                                                |
| Effort level picker (5 levels)            | **MISSING**     | No UI component                                                                           |
| Code mode stats / heatmap                 | **MOCK DATA**   | `CodeModeHome.tsx` fixtures + `Math.random()` heatmap                                     |
| Code mode repo/branch selector            | **MISSING**     | No UI component                                                                           |
| Code mode usage popover                   | **MISSING**     | No UI component                                                                           |
| Memory auto-population by AI              | **MISSING**     | User must manually add; Claude auto-writes memories                                       |

---

## 4. Where We Are Ahead

**AGI desktop has features Claude Max does not expose in its desktop UI:**

| Our feature                           | Location                                                                                              | Advantage                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-provider model catalog**      | `ModelPopover.tsx` MORE_GROUPS — OpenAI, Google, xAI, Moonshot, Qwen                                  | Claude locks to Anthropic models only (+ limited legacy). We surface 10+ providers in the same popover.                                     |
| **MCP server management (full UI)**   | `features/mcp/` — MCPServerManager, MCPConfigEditor, MCPBundleBrowser, MCPLogsViewer, MCPToolExplorer | Claude shows only "Add custom connector" as a beta modal (127); we have full server browser, log viewer, tool explorer, credential manager. |
| **Agent task orchestration**          | `features/agi/` — AgentTaskCreator, AgentTaskMonitor, AgentTaskPanel, IterationProgressPanel          | No equivalent visible in Max-20x screenshots.                                                                                               |
| **Computer-use host UI**              | `features/computer-use/`                                                                              | Not visible in Max-20x desktop screenshots (may be hidden behind a flag).                                                                   |
| **Multi-agent collaboration panel**   | `features/agent-collaboration/AgentCollaborationPanel.tsx`                                            | Not present in Claude desktop.                                                                                                              |
| **Voice mode**                        | `features/voice/` — VoiceMode, VoiceMicButton, VoiceInputOverlay                                      | Not surfaced in any Max-20x screenshot.                                                                                                     |
| **Analytics / cost dashboard**        | `features/analytics/` — CostDashboard, UsageDashboard                                                 | Claude shows aggregate usage popover only; we have dedicated dashboards.                                                                    |
| **Memory manager with browser modal** | `features/memory/` — MemoryBrowserModal, MemoryManager, MemorySearch, MemoryImport                    | Claude projects show "Project memory will show after a few chats" placeholder; we have full browse/search/import.                           |

---

## 5. Recommendations

### P0 — Blocking for v1 launch quality

**R26-PARITY-DESKTOP-MAX-01 (P0) — Wire live Skills store into PlusMenu skills flyout**  
`apps/desktop/src/features/v3/PlusMenu.tsx:30-35`  
The skills flyout uses `SKILLS_LIST = [translate, summarize, proofread, explain]` — a hardcoded static array. Claude's skills submenu (105) shows actual installed skills from the user's library. The `skillMarketplaceStore` is already used in `SkillsView.tsx`; `PlusMenu` should read from the same store.

**R26-PARITY-DESKTOP-MAX-02 (P0) — Wire live Connectors store into PlusMenu connectors flyout**  
`apps/desktop/src/features/v3/PlusMenu.tsx:37-43`  
Same pattern: `CONNECTORS.connected` is static. `connectorsStore.connectedIds` is live in `ConnectorsView.tsx`; the flyout should match.

**R26-PARITY-DESKTOP-MAX-03 (P0) — "Notify me when done" banner during generation**  
No component found. Claude shows this banner during artifact generation (142) and project chat loading (168) — a native macOS notification opt-in. Needed for long-running Opus 4.7 agentic tasks. Add a `NotifyWhenDoneBar` component wired to the Tauri notification API.  
Source gap: no equivalent in `features/v3/` or `packages/chat/`.

**R26-PARITY-DESKTOP-MAX-04 (P0) — Artifact creation wizard (category picker)**  
Screenshots 154–155 show a 7-category picker + guided question flow when creating a new artifact. We have `ArtifactsGallery.tsx` but no equivalent wizard entry point. The "New artifact" button likely needs to launch this flow. Parity requires implementing an `ArtifactCreationWizard` component.

---

### P1 — Material parity gaps for post-launch sprint

**R26-PARITY-DESKTOP-MAX-05 (P1) — Code/Cowork mode effort-level picker**  
Screenshot 111 shows a model × effort matrix (Low/Medium/High/Extra high/Max) with a "Fast mode" toggle at the bottom. This is exposed in the Code mode composer. We have no `EffortPicker` component. Needed for the Cowork/Code tab to be credible for power users.

**R26-PARITY-DESKTOP-MAX-06 (P1) — Code/Cowork mode permission-mode menu**  
Screenshot 110 shows 5 levels: Ask permissions / Accept edits / Plan mode / Auto mode / Bypass permissions. These map directly to Claude Code's `--permission-mode` flag. We have no UI for this. The Cowork tab is incomplete without it.

**R26-PARITY-DESKTOP-MAX-07 (P1) — Code/Cowork mode usage popover**  
Screenshot 112 shows per-limit breakdowns (5-hour limit %, weekly all-models %, per-product %). Our CodeModeHome has static fixture stats. A real usage popover wired to the Rust usage-tracking IPC is needed.

**R26-PARITY-DESKTOP-MAX-08 (P1) — Code/Cowork mode repo selector dropdown**  
Screenshot 113 shows a dropdown listing recent repos with an "Open folder…" option. We have context chips but no dropdown. The Rust backend already resolves workspace paths; a `RepoSelectorDropdown` component needs to be wired to the Tauri `get_recent_workspaces` IPC command.

**R26-PARITY-DESKTOP-MAX-09 (P1) — Skills directory modal**  
Screenshot 120 shows a full-screen directory modal accessible from Customize > Skills > Browse. We have `SkillsView.tsx` with a left-pane list but no directory overlay. Claude's directory has search + filter + sort + install-count badges across Anthropic & Partners skills.

**R26-PARITY-DESKTOP-MAX-10 (P1) — Connectors directory modal**  
Screenshot 121 shows a full-screen directory modal with top-8 connectors ranked by popularity (Google Drive #1, Gmail #2, etc.). We have `ConnectorsView.tsx` with connected + available grids but no dedicated directory modal. Should share the same modal shell as the Skills directory.

**R26-PARITY-DESKTOP-MAX-11 (P1) — Chats index bulk-select mode**  
Screenshots 150+153 show a "Select chats" button that enters a bulk-select mode with Select all / Move to project / Delete / Cancel actions. Our chats index has no bulk operations. Needed for users managing many conversations.

**R26-PARITY-DESKTOP-MAX-12 (P1) — Global search: Projects shown first, with member attribution**  
Screenshot 151 shows Projects listed above Chats in the search results, with member names (e.g., "Siddhartha Nagula") as secondary text. Our `SearchModalCmdK.tsx` result ordering is Chats / Projects / Skills / Connectors / Settings. Reorder to Projects first; add member attribution subtitle.

---

### P2 — Polish / completeness

**R26-PARITY-DESKTOP-MAX-13 (P2) — Account menu: Add "Get apps and extensions" + "Gift Claude" equivalents**  
Screenshot 128 shows 8 items in the account menu. Our `AccountMenu.tsx` likely has fewer. The "Get apps and extensions" equivalent should deep-link to our downloads page (which we already have at 145/146). "Gift Claude" is a monetization surface — v1 can substitute a placeholder or omit with a comment.

**R26-PARITY-DESKTOP-MAX-14 (P2) — Skills view: inline code/YAML view**  
Screenshot 118 shows a raw YAML view of the skill's system prompt accessible via a "Code view" toggle in the skill detail. Our `SkillsView.tsx` shows the metadata pane but no code/YAML toggle. Low effort to add; improves power-user trust.

**R26-PARITY-DESKTOP-MAX-15 (P2) — Skills view: "Create skill" flow**  
Screenshot 119 shows a Browse/Create split-button at the top of Customize > Skills. We have an "Add skill" button in the left pane footer but no creation wizard. Add a minimal create-skill modal (name + description + system prompt textarea).

**R26-PARITY-DESKTOP-MAX-16 (P2) — Projects file preview modal**  
Screenshot 161 shows files in a project previewed in an inline modal (not a new page). We have project file listing but no confirmed file preview modal component. Add `ProjectFilePreviewModal` to the project overview.

**R26-PARITY-DESKTOP-MAX-17 (P2) — Projects: Star + Archive actions**  
Screenshot 162 shows Star / Edit details / Archive / Delete in the project options menu. Confirm Archive is implemented; Star (favorite) is not confirmed in our source. Add both to the `CoworkProjects.tsx` context menu.

**R26-PARITY-DESKTOP-MAX-18 (P2) — Chat list: Project badge on chat items**  
Screenshot 173 shows chat list items with the parent project name as a secondary label. Our chats index should show project association per item. This is a data + UI change: the chat store needs to expose `projectId`→`projectName` and the list item needs a badge.

**R26-PARITY-DESKTOP-MAX-19 (P2) — Pricing page: Align to our tier structure (v1 lock)**  
Screenshots 147–148 show Anthropic's Pro/Max/Team/Enterprise tiers. Our `Pricing.tsx` must NOT mirror this — per lock `v1-local-only-cloud-waitlist-2026-05-18.md`, v1 is local-only with cloud on a waitlist. The pricing page should show: Local / BYOK / Hobby (waitlist) / Pro (waitlist) — not Anthropic's cloud pricing. Verify `Pricing.tsx` reflects this.

---

## Appendix — Source citations

| Component          | Path                                                       |
| ------------------ | ---------------------------------------------------------- |
| ModelPopover       | `apps/desktop/src/features/v3/ModelPopover.tsx`            |
| PlusMenu           | `apps/desktop/src/features/v3/PlusMenu.tsx`                |
| SkillsView         | `apps/desktop/src/features/v3/SkillsView.tsx`              |
| ConnectorsView     | `apps/desktop/src/features/v3/ConnectorsView.tsx`          |
| CustomizeHub       | `apps/desktop/src/features/v3/CustomizeHub.tsx`            |
| SearchModalCmdK    | `apps/desktop/src/features/v3/SearchModalCmdK.tsx`         |
| DesktopShellV3     | `apps/desktop/src/features/v3/DesktopShellV3.tsx`          |
| CodeModeHome       | `apps/desktop/src/features/v3/CodeModeHome.tsx`            |
| CoworkHome         | `apps/desktop/src/features/v3/CoworkHome.tsx`              |
| ArtifactsGallery   | `apps/desktop/src/features/artifacts/ArtifactsGallery.tsx` |
| ArtifactPanel      | `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`    |
| ArtifactWorkspace  | `apps/desktop/src/features/v3/ArtifactWorkspace.tsx`       |
| ResearchPanel      | `apps/desktop/src/features/research/ResearchPanel.tsx`     |
| MemoryBrowserModal | `apps/desktop/src/features/memory/MemoryBrowserModal.tsx`  |
| MCPServerManager   | `apps/desktop/src/features/mcp/MCPServerManager.tsx`       |
| ProjectsView       | `apps/desktop/src/features/chat/ProjectsView.tsx`          |
| Pricing            | `apps/desktop/src/features/v3/Pricing.tsx`                 |
| ThinkingPill       | `apps/desktop/src/features/v3/ThinkingPill.tsx`            |
| AccountMenu        | `apps/desktop/src/features/v3/AccountMenu.tsx`             |

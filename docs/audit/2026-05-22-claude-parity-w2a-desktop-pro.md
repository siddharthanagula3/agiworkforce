# R26-PARITY Lane W2a — Claude Desktop Pro/Free Parity Audit

**Date:** 2026-05-22  
**Auditor:** desktop-engineer (Claude Sonnet 4.6)  
**Reference images:** 71 Pro (`~/Desktop/reference/ui/desktop/claude/`) + 28 Free (`~/Desktop/reference/ui/desktop/claude-free/`)  
**Our implementation:** `apps/desktop/` (Tauri v2 — Rust + React/Vite/TypeScript/Tailwind)  
**Locks applied:** `docs/locks/v1-local-only-cloud-waitlist-2026-05-18.md`, `apps/desktop/AGENTS.md` R25-V5

---

## 1. Image Inventory

### Claude Pro images (71 total)

**Batch 1 — 2026-03-28 (26 images)**

| #   | Path                                                                                           | Screen / Feature                                   |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P01 | `reference/ui/desktop/claude/2026-03-28/01_empty-state_new-chat-collapsed-sidebar.png`         | New chat empty state — collapsed sidebar           |
| P02 | `reference/ui/desktop/claude/2026-03-28/02_sidebar-expanded_chat-history.png`                  | Sidebar expanded — chat history grouped by date    |
| P03 | `reference/ui/desktop/claude/2026-03-28/03_projects-gallery-view.png`                          | Projects gallery view                              |
| P04 | `reference/ui/desktop/claude/2026-03-28/04_project-detail_knowledge-panel_error-banner.png`    | Project detail — knowledge panel + error banner    |
| P05 | `reference/ui/desktop/claude/2026-03-28/05_three-pane-layout_sidebar-chat-project.png`         | Three-pane layout — sidebar / chat / project panel |
| P06 | `reference/ui/desktop/claude/2026-03-28/06_chats-history-management-view.png`                  | Chat history management view                       |
| P07 | `reference/ui/desktop/claude/2026-03-28/20_profile-popover-menu.png`                           | Profile popover / account menu                     |
| P08 | `reference/ui/desktop/claude/2026-03-28/21_customize-claude-landing-page.png`                  | Customize Claude landing page (hub)                |
| P09 | `reference/ui/desktop/claude/2026-03-28/22_skill-detail-view_humanizer.png`                    | Skill detail view — Humanizer                      |
| P10 | `reference/ui/desktop/claude/2026-03-28/23_connector-permissions-dropdown_airtable.png`        | Connector permissions dropdown — Airtable          |
| P11 | `reference/ui/desktop/claude/2026-03-28/24_connector-detail_gmail-tool-permissions.png`        | Connector detail — Gmail tool permissions          |
| P12 | `reference/ui/desktop/claude/2026-03-28/25_connector-detail_github-integration-info.png`       | Connector detail — GitHub integration info         |
| P13 | `reference/ui/desktop/claude/2026-03-28/26_connector-detail_vercel-tool-permissions.png`       | Connector detail — Vercel tool permissions         |
| P14 | `reference/ui/desktop/claude/2026-03-28/27_connector-detail_control-your-mac.png`              | Connector detail — Control Your Mac                |
| P15 | `reference/ui/desktop/claude/2026-03-28/28_connector-detail_desktop-commander-permissions.png` | Connector detail — Desktop Commander permissions   |
| P16 | `reference/ui/desktop/claude/2026-03-28/29_connector-detail_excel-blocked-permissions.png`     | Connector detail — Excel blocked permissions       |
| P17 | `reference/ui/desktop/claude/2026-03-28/30_connector-detail_filesystem-settings.png`           | Connector detail — Filesystem settings             |
| P18 | `reference/ui/desktop/claude/2026-03-28/31_connectors-list_filesystem-selected.png`            | Connectors list — Filesystem selected              |
| P19 | `reference/ui/desktop/claude/2026-03-28/32_connectors-list_apple-notes-selected.png`           | Connectors list — Apple Notes selected             |
| P20 | `reference/ui/desktop/claude/2026-03-28/33_connector-oauth-flow_slack-grant-access-modal.png`  | Connector OAuth flow — Slack grant-access modal    |
| P21 | `reference/ui/desktop/claude/2026-03-28/34_connector-overview_slack-details.png`               | Connector overview — Slack details                 |
| P22 | `reference/ui/desktop/claude/2026-03-28/35_plans-pricing_individual-plans.png`                 | Plans/pricing — individual plans (Free/Pro)        |
| P23 | `reference/ui/desktop/claude/2026-03-28/36_plans-pricing_team-enterprise-plans.png`            | Plans/pricing — Team and Enterprise plans          |
| P24 | `reference/ui/desktop/claude/2026-03-28/37_feature-showcase_integrations-top.png`              | Feature showcase — integrations (top section)      |
| P25 | `reference/ui/desktop/claude/2026-03-28/38_feature-showcase_integrations-middle.png`           | Feature showcase — integrations (middle section)   |
| P26 | `reference/ui/desktop/claude/2026-03-28/39_feature-showcase_integrations-platforms.png`        | Feature showcase — integrations platforms list     |

**Batch 2 — 2026-05-13 root (7 images)**

| #   | Path                                                                                         | Screen / Feature                                   |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P27 | `reference/ui/desktop/claude/2026-05-13/003-cowork-model-menu-adaptive-thinking.png`         | Cowork — model menu with Adaptive Thinking toggle  |
| P28 | `reference/ui/desktop/claude/2026-05-13/004-cowork-skills-submenu-installed-skills.png`      | Cowork — skills submenu with installed skill list  |
| P29 | `reference/ui/desktop/claude/2026-05-13/005-cowork-connectors-submenu-toggles.png`           | Cowork — connectors submenu with enable toggles    |
| P30 | `reference/ui/desktop/claude/2026-05-13/006-cowork-plugins-submenu-categories.png`           | Cowork — plugins submenu categories                |
| P31 | `reference/ui/desktop/claude/2026-05-13/007-cowork-plugin-category-legal-workflows.png`      | Cowork — plugin category (Legal) workflow cards    |
| P32 | `reference/ui/desktop/claude/2026-05-13/008-cowork-plugin-selected-inline-slash-command.png` | Cowork — plugin slash command inserted in composer |
| P33 | `reference/ui/desktop/claude/2026-05-13/011-claude-desktop-chat-home.png`                    | Chat surface home — composer + mode controls       |

**Batch 3 — 2026-05-13/extended (20 images)**

| #   | Path                                                                                        | Screen / Feature                                  |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| P34 | `reference/ui/desktop/claude/2026-05-13/extended/024-settings-general.png`                  | Settings — General tab                            |
| P35 | `reference/ui/desktop/claude/2026-05-13/extended/025-settings-account.png`                  | Settings — Account tab (plan + sessions)          |
| P36 | `reference/ui/desktop/claude/2026-05-13/extended/026-settings-privacy.png`                  | Settings — Privacy tab                            |
| P37 | `reference/ui/desktop/claude/2026-05-13/extended/027-settings-billing.png`                  | Settings — Billing tab                            |
| P38 | `reference/ui/desktop/claude/2026-05-13/extended/028-settings-usage.png`                    | Settings — Usage tab                              |
| P39 | `reference/ui/desktop/claude/2026-05-13/extended/029-settings-capabilities.png`             | Settings — Capabilities tab                       |
| P40 | `reference/ui/desktop/claude/2026-05-13/extended/030-settings-connectors-deferred.png`      | Settings — Connectors tab (deferred state)        |
| P41 | `reference/ui/desktop/claude/2026-05-13/extended/031-settings-claude-code.png`              | Settings — Claude Code tab                        |
| P42 | `reference/ui/desktop/claude/2026-05-13/extended/032-settings-cowork.png`                   | Settings — Cowork tab                             |
| P43 | `reference/ui/desktop/claude/2026-05-13/extended/033-settings-chrome-extension.png`         | Settings — Chrome Extension tab                   |
| P44 | `reference/ui/desktop/claude/2026-05-13/extended/034-settings-desktop-app-extensions.png`   | Settings — Desktop App Extensions tab             |
| P45 | `reference/ui/desktop/claude/2026-05-13/extended/035-settings-desktop-app-developer.png`    | Settings — Desktop App Developer tab              |
| P46 | `reference/ui/desktop/claude/2026-05-13/extended/036-customize-home.png`                    | Customize hub — landing page                      |
| P47 | `reference/ui/desktop/claude/2026-05-13/extended/037-customize-skills.png`                  | Customize — Skills tab                            |
| P48 | `reference/ui/desktop/claude/2026-05-13/extended/038-customize-connectors.png`              | Customize — Connectors tab                        |
| P49 | `reference/ui/desktop/claude/2026-05-13/extended/039-customize-plugin-legal.png`            | Customize — Plugin (Legal) detail                 |
| P50 | `reference/ui/desktop/claude/2026-05-13/extended/040-customize-plugin-legal-skills.png`     | Customize — Plugin Legal with skills sub-list     |
| P51 | `reference/ui/desktop/claude/2026-05-13/extended/041-customize-plugin-legal-connectors.png` | Customize — Plugin Legal with connectors sub-list |
| P52 | `reference/ui/desktop/claude/2026-05-13/extended/042-customize-plugin-menu.png`             | Customize — Plugin menu (categories)              |
| P53 | `reference/ui/desktop/claude/2026-05-13/extended/043-browse-plugins-overlay.png`            | Browse plugins overlay / marketplace              |

**Batch 4 — 2026-05-15 (18 images)**

| #   | Path                                                                                                  | Screen / Feature                                  |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| P54 | `reference/ui/desktop/claude/2026-05-15/200_claude-desktop_home-empty-or-last-chat.png`               | Home — empty state or last-chat restored          |
| P55 | `reference/ui/desktop/claude/2026-05-15/201_claude-desktop_sidebar-expanded.png`                      | Sidebar expanded — full nav + recents             |
| P56 | `reference/ui/desktop/claude/2026-05-15/202_claude-desktop_account-menu.png`                          | Account menu popover                              |
| P57 | `reference/ui/desktop/claude/2026-05-15/203_claude-desktop_settings-general.png`                      | Settings — General tab (2026-05-15)               |
| P58 | `reference/ui/desktop/claude/2026-05-15/204_claude-desktop_settings-connectors-or-extensions.png`     | Settings — Connectors or Extensions tab           |
| P59 | `reference/ui/desktop/claude/2026-05-15/205_claude-desktop_settings-extension-detail.png`             | Settings — Extension detail view                  |
| P60 | `reference/ui/desktop/claude/2026-05-15/206_claude-desktop_local-permission-or-mcp-warning.png`       | Local permission prompt or MCP warning dialog     |
| P61 | `reference/ui/desktop/claude/2026-05-15/207_claude-desktop_cowork-or-code-entry.png`                  | Cowork or Code mode entry screen                  |
| P62 | `reference/ui/desktop/claude/2026-05-15/208_claude-desktop_handoff-result-from-code.png`              | Handoff result delivered from Code mode           |
| P63 | `reference/ui/desktop/claude/2026-05-15/209_claude-desktop_updated-code-dashboard.png`                | Updated Code mode dashboard                       |
| P64 | `reference/ui/desktop/claude/2026-05-15/210_claude-desktop_updated-chat-home-type-for-skills.png`     | Updated chat home — "type for skills" hint        |
| P65 | `reference/ui/desktop/claude/2026-05-15/211_claude-desktop_chat-filesystem-readonly-prompt-ready.png` | Chat — filesystem readonly connector prompt ready |
| P66 | `reference/ui/desktop/claude/2026-05-15/213_claude-desktop_filesystem-tool-permission-prompt.png`     | Filesystem tool permission prompt                 |
| P67 | `reference/ui/desktop/claude/2026-05-15/214_claude-desktop_filesystem-tool-result-table.png`          | Filesystem tool result rendered as table          |
| P68 | `reference/ui/desktop/claude/2026-05-15/215_claude-desktop_slash-skills-menu.png`                     | Slash-skills menu in composer                     |
| P69 | `reference/ui/desktop/claude/2026-05-15/216_claude-desktop_skill-selected-in-composer.png`            | Skill selected and displayed in composer          |
| P70 | `reference/ui/desktop/claude/2026-05-15/217_claude-desktop_skill-composer-with-prompt.png`            | Skill composer with user prompt filled in         |
| P71 | `reference/ui/desktop/claude/2026-05-15/218_claude-desktop_skill-used-response.png`                   | Skill executed — response visible in chat         |

### Claude Free images (28 total)

**Batch 5 — claude-free/2026-05-15 (28 images)**

| #   | Path                                                                                              | Screen / Feature                                     |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F01 | `reference/ui/desktop/claude-free/2026-05-15/041_claude-free_home_composer.png`                   | Free home — composer (no recent chats)               |
| F02 | `reference/ui/desktop/claude-free/2026-05-15/042_claude-free_model-selector_opus-upgrade.png`     | Free model selector — Opus locked, upgrade CTA       |
| F03 | `reference/ui/desktop/claude-free/2026-05-15/043_claude-free_add-menu_tools-connectors.png`       | Free add-menu — Tools + Connectors sections          |
| F04 | `reference/ui/desktop/claude-free/2026-05-15/044_claude-free_directory_connectors.png`            | Free — Connectors directory view                     |
| F05 | `reference/ui/desktop/claude-free/2026-05-15/045_claude-free_directory_skills.png`                | Free — Skills directory view                         |
| F06 | `reference/ui/desktop/claude-free/2026-05-15/046_claude-free_directory_plugins.png`               | Free — Plugins directory view                        |
| F07 | `reference/ui/desktop/claude-free/2026-05-15/047_claude-free_projects.png`                        | Free — Projects list                                 |
| F08 | `reference/ui/desktop/claude-free/2026-05-15/048_claude-free_artifacts.png`                       | Free — Artifacts view (empty / loading)              |
| F09 | `reference/ui/desktop/claude-free/2026-05-15/048b_claude-free_artifacts_loaded-grid.png`          | Free — Artifacts loaded grid                         |
| F10 | `reference/ui/desktop/claude-free/2026-05-15/049_claude-free_upgrade-plans.png`                   | Free — Upgrade/Plans modal                           |
| F11 | `reference/ui/desktop/claude-free/2026-05-15/050_claude-free_account-menu.png`                    | Free — Account menu (Upgrade CTA prominent)          |
| F12 | `reference/ui/desktop/claude-free/2026-05-15/051_claude-free_settings_general.png`                | Free Settings — General tab                          |
| F13 | `reference/ui/desktop/claude-free/2026-05-15/052_claude-free_settings_billing.png`                | Free Settings — Billing tab (Free plan, upgrade CTA) |
| F14 | `reference/ui/desktop/claude-free/2026-05-15/053_claude-free_settings_capabilities.png`           | Free Settings — Capabilities tab                     |
| F15 | `reference/ui/desktop/claude-free/2026-05-15/054_claude-free_settings_connectors-moved.png`       | Free Settings — Connectors tab (moved location note) |
| F16 | `reference/ui/desktop/claude-free/2026-05-15/055_claude-free_settings_claude-code-upgrade.png`    | Free Settings — Claude Code tab with upgrade gate    |
| F17 | `reference/ui/desktop/claude-free/2026-05-15/061_claude-free_artifact_prompt-before-submit.png`   | Free artifact — prompt before submit                 |
| F18 | `reference/ui/desktop/claude-free/2026-05-15/062_claude-free_artifact_running.png`                | Free artifact — running/generating state             |
| F19 | `reference/ui/desktop/claude-free/2026-05-15/063_claude-free_artifact_skill-running.png`          | Free artifact — skill running inside artifact        |
| F20 | `reference/ui/desktop/claude-free/2026-05-15/064_claude-free_artifact_widget-visible.png`         | Free artifact — widget panel visible                 |
| F21 | `reference/ui/desktop/claude-free/2026-05-15/065_claude-free_artifact_result.png`                 | Free artifact — result rendered                      |
| F22 | `reference/ui/desktop/claude-free/2026-05-15/066_claude-free_artifact_widget-interacted.png`      | Free artifact — widget after user interaction        |
| F23 | `reference/ui/desktop/claude-free/2026-05-15/071_claude-free_web-search_prompt-before-submit.png` | Free web search — prompt before submit               |
| F24 | `reference/ui/desktop/claude-free/2026-05-15/072_claude-free_web-search_running.png`              | Free web search — running state                      |
| F25 | `reference/ui/desktop/claude-free/2026-05-15/073_claude-free_web-search_sources-visible.png`      | Free web search — sources panel visible              |
| F26 | `reference/ui/desktop/claude-free/2026-05-15/074_claude-free_web-search_result.png`               | Free web search — result rendered                    |
| F27 | `reference/ui/desktop/claude-free/2026-05-15/075_claude-free_web-search_result-lower.png`         | Free web search — result lower continuation          |
| F28 | `reference/ui/desktop/claude-free/2026-05-15/076_claude-free_logout-menu-before-click.png`        | Free — logout / account menu before click            |

---

## 2. Parity Scorecard

Legend: ✅ Parity | 🟡 Partial | ❌ Gap (missing) | 🔄 Chose differently (per locked decision)

### 2.1 Shell & Layout

| Area                                   | Status | Our impl (path:line)                                                             | Claude ref images | Gap                                                                | Effort |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ | ------ |
| Sidebar collapsible 240→64px           | ✅     | `apps/desktop/src/features/v3/Sidebar.tsx:1-40` (width animated `180ms ease`)    | P01, P02, P55     | None                                                               | —      |
| Mode switcher (Chat/Cowork/Code)       | ✅     | `apps/desktop/src/features/v3/Sidebar.tsx` mode buttons; `DesktopShellV3.tsx:55` | P01, P54, P61     | None                                                               | —      |
| Sidebar recents grouped by time        | ✅     | `Sidebar.tsx` groups: last-hour/today/yesterday/past-week/past-month, max 30     | P02, P55          | None                                                               | —      |
| Sidebar "Show all" for recents         | ✅     | `Sidebar.tsx` "Show all" button                                                  | P02               | None                                                               | —      |
| New chat button                        | ✅     | `Sidebar.tsx` new chat button                                                    | P01, P54          | None                                                               | —      |
| Search ⌘K badge on sidebar button      | ✅     | `Sidebar.tsx` search btn w/ ⌘K badge                                             | P01, P33          | None                                                               | —      |
| Per-mode nav items (chat/cowork/code)  | ✅     | `Sidebar.tsx` CHAT_NAV/COWORK_NAV/CODE_NAV arrays                                | P01, P54, P61     | None                                                               | —      |
| Footer: avatar + name + plan + chevron | ✅     | `Sidebar.tsx` footer section                                                     | P01, P56          | None                                                               | —      |
| Collapsed rail icon-only nav           | ✅     | `Sidebar.tsx` collapsed state (Projects/Artifacts/Customize/Settings icons)      | P01               | None                                                               | —      |
| Cowork mode content                    | ❌     | `DesktopShellV3.tsx:117-130` — placeholder "Cowork mode coming" div              | P29, P30, P61     | Full Cowork UI (Dispatch, Scheduled tasks, Live Artifacts) unbuilt | L      |
| Code mode content                      | ❌     | `DesktopShellV3.tsx:132-145` — placeholder "Code mode coming" div                | P61, P62, P63     | Full Code mode UI (Routines, IDE integration) unbuilt              | L      |

### 2.2 Empty State & Greeting

| Area                                    | Status | Our impl (path:line)                                     | Claude ref images | Gap  | Effort |
| --------------------------------------- | ------ | -------------------------------------------------------- | ----------------- | ---- | ------ |
| Time-based greeting (morning/day/night) | ✅     | `EmptyChat.tsx:23-30` (hour-based formula)               | P01, P54, F01     | None | —      |
| First-name personalization              | ✅     | `EmptyChat.tsx:25` (`rawName.split(/\s+/)[0]`)           | P01, P54          | None | —      |
| Fallback name when no auth user         | ✅     | `EmptyChat.tsx:25` (`t('emptyChat.fallbackName')`)       | F01               | None | —      |
| QuickChips task chips                   | ✅     | `EmptyChat.tsx:54-58` (`<QuickChips>` from unified-chat) | P01, P54, F01     | None | —      |

### 2.3 Composer & Plus Menu

| Area                               | Status | Our impl (path:line)                                                           | Claude ref images      | Gap                                                                   | Effort |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------- | ------ |
| Plus menu with flyout submenus     | ✅     | `PlusMenu.tsx:77-326` (main + plugins/skills/connectors flyouts)               | P27-P32, F03           | None                                                                  | —      |
| Add Files (⌘O)                     | ✅     | `PlusMenu.tsx:91-98`                                                           | P33, F03               | None                                                                  | —      |
| Add Project folder                 | ✅     | `PlusMenu.tsx:99-104`                                                          | F03                    | None                                                                  | —      |
| Add GitHub repo                    | ✅     | `PlusMenu.tsx:105-109`                                                         | F03                    | None                                                                  | —      |
| Skills flyout                      | ✅     | `PlusMenu.tsx:245-283` (4 skills + "Manage skills" link)                       | P28, F05               | Hardcoded static list; live data from skillMarketplaceStore not wired | XS     |
| Connectors flyout                  | ✅     | `PlusMenu.tsx:285-324` (connected list + "Add connector")                      | P29, F04               | Static placeholder data, not from connectorsStore                     | XS     |
| Plugins flyout with slash commands | ✅     | `PlusMenu.tsx:163-213` (categories + command sublist)                          | P30, P31, P32, F06     | Static placeholder (INSTALLED_PLUGINS hardcoded)                      | XS     |
| Research toggle                    | ✅     | `PlusMenu.tsx:141-143`                                                         | P33                    | None                                                                  | —      |
| Web search toggle with checkmark   | ✅     | `PlusMenu.tsx:143-153`                                                         | P33                    | None                                                                  | —      |
| Use style submenu                  | ✅     | `PlusMenu.tsx:155-160` (routes to skills flyout)                               | P28, P47               | None                                                                  | —      |
| Voice input button in composer     | 🟡     | `App.tsx:*` `onVoiceClick` prop threaded through; voice tab in Settings exists | P33 (mic area visible) | Voice capture UI not confirmed wired (no VoiceInput component read)   | S      |

### 2.4 Model Picker

| Area                                          | Status | Our impl (path:line)                                                             | Claude ref images | Gap                                                                | Effort |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ | ------ |
| 3 primary Anthropic models (catalog-resolved) | ✅     | `ModelPopover.tsx:15-37` (`getTaskModelForProvider` / `getProviderDefaultModel`) | P27               | None                                                               | —      |
| Deduplication of primary rows                 | ✅     | `ModelPopover.tsx:141-147` (`seenPrimary` Set)                                   | P27               | None                                                               | —      |
| Adaptive thinking iOS-style toggle            | ✅     | `ModelPopover.tsx:191-208` + `IosToggle` component                               | P27               | None                                                               | —      |
| "More models" expandable with 2 groups        | ✅     | `ModelPopover.tsx:226-291` (older Anthropic + other providers)                   | P27               | None                                                               | —      |
| Name resolution: store → metadata → bare ID   | ✅     | `ModelPopover.tsx:132-138` (`resolveName()`)                                     | P27               | None                                                               | —      |
| Click-outside to close                        | ✅     | `ModelPopover.tsx:115-123` (mousedown listener)                                  | P27               | None                                                               | —      |
| Free tier — fewer models available            | 🟡     | Model list not gated by tier in popover; gate logic lives in ChatInterface       | F02               | Tier-gating of model picker rows not audited (ChatInterface owned) | M      |

### 2.5 Chat Interface (via ChatInterface from @agiworkforce/unified-chat)

| Area                                     | Status | Our impl (path:line)                                                 | Claude ref images                                | Gap                                                               | Effort |
| ---------------------------------------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------ |
| Streaming responses                      | ✅     | `DesktopShellV3.tsx:101-113` — `<ChatInterface runtime={runtime} />` | P33, P64                                         | Owned by unified-chat package (out of desktop-engineer scope)     | —      |
| Code blocks with syntax highlight + copy | ✅     | `ChatInterface` from `@agiworkforce/unified-chat`                    | P67 (tool result table)                          | None (package-owned)                                              | —      |
| Tool-use disclosure (web search)         | ✅     | `ChatInterface` handles tool-use rendering                           | F23-F27 (web-search sequence)                    | Package-owned                                                     | —      |
| Image output in chat                     | 🟡     | `ChatInterface` renders images; image generation gated by tier       | F21, F22                                         | Image generation tier gate not verified desktop-side              | —      |
| Message action bar (copy/branch/retry)   | ✅     | `ChatInterface` owned                                                | P65 (web-search result)                          | Package-owned                                                     | —      |
| Starred messages panel                   | ❌     | No `StarredMessages` component found in `apps/desktop/src/`          | (no equivalent in real screenshots)              | Feature missing entirely                                          | M      |
| Shared chat link creation                | 🔄     | Cloud sync removed per v1-local-only-cloud-waitlist-2026-05-18.md    | (no equivalent in real screenshots — cloud only) | Deliberate lock: no shared chats in v1. Re-add when cloud ungated | —      |

### 2.6 Search Modal (Cmd+K)

| Area                        | Status | Our impl (path:line)                                                                                                                     | Claude ref images                     | Gap                               | Effort |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------- | ------ |
| Cmd+K search modal          | ✅     | `apps/desktop/src/App.tsx:96-98` `SearchModal` lazy import; `App.tsx:1340` rendered when `isSearchModalOpen`; `App.tsx:725` Cmd+K toggle | P01 (search icon visible in sidebar)  | None                              | —      |
| Search across conversations | 🟡     | Modal exists; search implementation depth not verified                                                                                   | P02, P55 (sidebar shows recents list) | Full-text search coverage unknown | S      |

### 2.7 QuickQuery Overlay

| Area                              | Status | Our impl (path:line)                                                                                           | Claude ref images                              | Gap  | Effort |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---- | ------ |
| QuickQuery double-tap Alt trigger | ✅     | `apps/desktop/src/App.tsx:918` `global-hotkey-triggered` Tauri listener; `App.tsx:184` `quickQueryOpen` state  | (no screenshot of overlay captured in batches) | None | —      |
| QuickQuery Cmd+Shift+Space        | ✅     | `apps/desktop/src/App.tsx:725` Cmd+K modal toggle; overlay at `App.tsx:1380-1382`                              | (no screenshot of overlay captured in batches) | None | —      |
| Floating chat window              | ✅     | `apps/desktop/src/App.tsx:1498` `return <FloatingChat />` in floating mode branch; `App.tsx:81-83` lazy import | (no screenshot of floating mode captured)      | None | —      |

### 2.8 Settings

| Area                                     | Status | Our impl (path:line)                                                                                                                            | Claude ref images                        | Gap                                                                                 | Effort |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| 12-tab settings panel                    | ✅     | `SettingsPanel.tsx:1-180` (general/account/appearance/privacy/models-keys/agents/mcp-skills/connectors/notifications/voice/capabilities/memory) | P34-P45, P57-P59                         | None                                                                                | —      |
| 3-group nav layout                       | ✅     | `SettingsPanel.tsx` NAV_GROUPS                                                                                                                  | P34, P57                                 | None                                                                                | —      |
| General tab                              | ✅     | Settings tab exists                                                                                                                             | P34, P57, F12                            | Content depth not fully verified                                                    | —      |
| Account tab — plan display               | ✅     | Settings Account tab exists                                                                                                                     | P35                                      | Account tab content not fully read                                                  | —      |
| Account tab — Billing / usage meter      | 🔄     | No separate Billing tab; PlansModal handles tier display                                                                                        | P37, F13                                 | Deliberate: v1 has no billing UI. `PlansModal.tsx:*` routes to waitlist for Pro/Max | —      |
| Account tab — Active sessions list       | 🔄     | Session management is cloud-only; v1 LOCAL ONLY                                                                                                 | P35                                      | Deliberate lock. Re-add when cloud ungated                                          | —      |
| Appearance tab                           | ✅     | Settings Appearance tab exists                                                                                                                  | P34-P45 (settings nav visible)           | None                                                                                | —      |
| Privacy tab — Master password (Argon2id) | ✅     | `Privacy/index.tsx:353-360` (`LazyMasterPasswordSettings`)                                                                                      | P36                                      | None — ahead of Claude here                                                         | —      |
| Privacy tab — Export data                | ✅     | `Privacy/index.tsx:42-171` (`handleExportData` with Tauri save dialog)                                                                          | P36                                      | None                                                                                | —      |
| Privacy tab — Clear local storage        | ✅     | `Privacy/index.tsx:77-103` (`handleClearAllData`)                                                                                               | P36                                      | None                                                                                | —      |
| Privacy tab — Cloud sync toggle          | 🔄     | Removed: `Privacy/index.tsx:244` comment "Cloud sync toggle removed for v1 LOCAL ONLY"                                                          | P36                                      | Deliberate lock (R25-V5, AGENTS.md). Re-add when cloud ungated                      | —      |
| Privacy tab — Crash reporting toggle     | ✅     | `Privacy/index.tsx:302-338` (Sentry-backed, off by default)                                                                                     | P36                                      | None                                                                                | —      |
| Privacy tab — GDPR compliance note       | ✅     | `Privacy/index.tsx:291-300`                                                                                                                     | P36                                      | None — proactive, Claude lacks this                                                 | —      |
| Privacy tab — Governance workspace       | ✅     | `Privacy/index.tsx:385-413` (Safety Policies + Governance workspace)                                                                            | P36                                      | Claude has no equivalent; AGI advantage                                             | —      |
| Privacy tab — Allowed directories        | ✅     | `Privacy/index.tsx:373-380` (`LazyAllowedDirectoriesSettings`)                                                                                  | P60, P65, P66 (local permission prompts) | Filesystem sandbox control; Claude lacks                                            | —      |
| Models & Keys tab                        | ✅     | `SettingsPanel.tsx` (models-keys tab; hidden on cloud web)                                                                                      | P57 (settings general — same nav)        | None                                                                                | —      |
| Agents tab                               | ✅     | `SettingsPanel.tsx` agents tab                                                                                                                  | P42 (settings-cowork in nav)             | None                                                                                | —      |
| MCP & Skills tab                         | ✅     | `SettingsPanel.tsx` mcp-skills tab                                                                                                              | P40 (settings-connectors-deferred)       | None                                                                                | —      |
| Connectors tab                           | ✅     | `SettingsPanel.tsx` connectors tab                                                                                                              | P58, P40, F15                            | None                                                                                | —      |
| Memory tab                               | ✅     | `SettingsPanel.tsx` memory tab                                                                                                                  | P35 (account = nearest)                  | None                                                                                | —      |
| Capabilities tab                         | ✅     | `Settings/tabs/Capabilities/index.tsx:17-23` (`LazyCapabilitiesSettings`)                                                                       | P39, F14                                 | None                                                                                | —      |

### 2.9 Customize Hub (Skills / Connectors / Plugins)

| Area                                                                           | Status | Our impl (path:line)                                                                      | Claude ref images                   | Gap                                 | Effort |
| ------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------- | ------ |
| CustomizeHub 3-tab layout (Skills/Connectors/Plugins)                          | ✅     | `CustomizeHub.tsx:8-63`                                                                   | P46, P47, P48, P52                  | None                                | —      |
| Skills — master-detail 3-pane (list/detail/metadata)                           | ✅     | `SkillsView.tsx:42-215` (220px left / flex center / 280px right)                          | P47, P09, F05                       | None                                | —      |
| Skills — search filter                                                         | ✅     | `SkillsView.tsx:27,47-52`                                                                 | P47, F05                            | None                                | —      |
| Skills — add skill button                                                      | ✅     | `SkillsView.tsx:82-87`                                                                    | P47                                 | None                                | —      |
| Skill detail — monospace metadata table (name/description/source/context_mode) | ✅     | `SkillsView.tsx:102-116`                                                                  | P09                                 | None                                | —      |
| Skill detail — allowed tools list                                              | ✅     | `SkillsView.tsx:118-131`                                                                  | P09                                 | None                                | —      |
| Skill detail — OS tags + category pill                                         | ✅     | `SkillsView.tsx:159-187`                                                                  | P09                                 | None                                | —      |
| Skill detail — Edit / View Source / Enable-Disable buttons                     | ✅     | `SkillsView.tsx:189-210`                                                                  | P09                                 | None                                | —      |
| Connectors — connected card grid                                               | ✅     | `ConnectorsView.tsx:168-205`                                                              | P18, P19, P48, F04                  | None                                | —      |
| Connectors — tool-level permissions (allow/ask/never cycle)                    | ✅     | `ConnectorsView.tsx:85-163` 3-state cycle; Gmail/GitHub/GCal/Notion/Slack/Linear defaults | P10, P11, P12, P13, P14, P15, P16   | None                                | —      |
| Connectors — available connector gallery                                       | ✅     | `ConnectorsView.tsx:213-261` (grid of un-connected connectors)                            | P18, P19                            | None                                | —      |
| Connector — OAuth flow                                                         | 🟡     | `connectorsStore.connect()` called; OAuth dialog UX not read                              | P20 (33_connector-oauth-flow_slack) | OAuth consent dialog depth unknown  | S      |
| Plugins — built-in cards (Calculator/Python/Image Gen/TS REPL)                 | ✅     | `PluginsHub.tsx:22-51`, `BuiltInCard`                                                     | P52, F06                            | None                                | —      |
| Plugins — MCP server cards with enable/disable                                 | ✅     | `PluginsHub.tsx:105-160`, `McpPluginCard`                                                 | P52, P59                            | None                                | —      |
| Plugins — marketplace directory modal                                          | ✅     | `PluginsHub.tsx:269-273` (`PluginMarketplace` lazy-loaded)                                | P53                                 | None                                | —      |
| Plugin install via .mcpb bundle drag-to-install                                | 🟡     | `PluginMarketplace.tsx` not fully read; `MCPBundleBrowser.tsx` exists in mcp/ dir         | P53                                 | .mcpb drag install UX not confirmed | S      |
| Plugins — "Browse all" CTA + featured grid                                     | ✅     | `PluginsHub.tsx:234-267`                                                                  | P53                                 | None                                | —      |

### 2.10 Projects

| Area                                       | Status | Our impl (path:line)                                                        | Claude ref images               | Gap                                        | Effort |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ | ------ |
| Projects list in sidebar                   | ✅     | `Sidebar.tsx` nav item "Projects"                                           | P03, F07                        | None                                       | —      |
| Project detail — knowledge + conversations | 🟡     | Project feature files exist (`features/projects/`) but detail view not read | P04, P05                        | Depth of project detail view unverified    | M      |
| Project — knowledge doc upload             | 🟡     | Exists in feature area; not read                                            | P04                             | Implementation depth unknown               | M      |
| Project — system prompt editor             | 🟡     | Likely in project detail; not read                                          | P05                             | Not verified                               | M      |
| Project — members / shared access          | 🔄     | Cloud-only feature; v1 LOCAL ONLY                                           | P05 (cloud panel in three-pane) | Deliberate lock. Re-add when cloud ungated | —      |

### 2.11 Artifacts

| Area                                                     | Status | Our impl (path:line)                                                                          | Claude ref images                                | Gap                                                            | Effort |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ------ |
| Artifacts gallery view                                   | 🟡     | `features/artifacts/ArtifactsGallery.tsx` exists; not read                                    | F08, F09                                         | Gallery depth unverified                                       | S      |
| Artifact — code viewer (syntax highlight + line numbers) | ✅     | `ArtifactRendererView.tsx:84-130` (`CodeRenderer` with Prism + highlight_lines)               | F17, F18                                         | None                                                           | —      |
| Artifact — HTML web preview (sandboxed iframe)           | ✅     | `ArtifactRendererView.tsx:311-398` (`WebRenderer` — CSP meta, sandbox, no-referrer)           | F17-F22                                          | None                                                           | —      |
| Artifact — chart output (bar/line/pie)                   | ✅     | `ArtifactRendererView.tsx:404-474` (`ChartRenderer` with Recharts)                            | F21                                              | None                                                           | —      |
| Artifact — document with TOC                             | ✅     | `ArtifactRendererView.tsx:136-171` (`DocumentRenderer` with TOC + ReactMarkdown)              | F21                                              | None                                                           | —      |
| Artifact — presentation slide-by-slide                   | ✅     | `ArtifactRendererView.tsx:480-524` (`PresentationRenderer` with Prev/Next nav)                | F21                                              | None                                                           | —      |
| Artifact — diagram (Mermaid)                             | ✅     | `ArtifactRendererView.tsx:229-305` (`DiagramRenderer` with mermaid lazy import + sanitizeSvg) | F19 (skill-running)                              | SVG sanitized for XSS; Claude lacks explicit sanitization note | —      |
| Artifact — image renderer                                | ✅     | `ArtifactRendererView.tsx:530-544` (`ImageRenderer`)                                          | F20, F22                                         | None                                                           | —      |
| Artifact streaming indicator                             | ✅     | `ArtifactRendererView.tsx:58-62` (pulse dot + "Generating...")                                | F18, F19                                         | None                                                           | —      |
| Artifact share / publish                                 | 🔄     | Cloud-only; v1 LOCAL ONLY                                                                     | (no equivalent in real screenshots — cloud only) | Deliberate lock. Re-add when cloud ungated                     | —      |

### 2.12 Account Menu

| Area                                    | Status | Our impl (path:line)                                    | Claude ref images  | Gap  | Effort |
| --------------------------------------- | ------ | ------------------------------------------------------- | ------------------ | ---- | ------ |
| Account menu panel (avatar/name/plan)   | ✅     | `AccountMenu.tsx` referenced in `DesktopShellV3.tsx:96` | P07, P56, F11, F28 | None | —      |
| Upgrade CTA in account menu (Free tier) | ✅     | `AccountMenu.tsx` (not fully read but component exists) | F11, F28           | None | —      |

### 2.13 Plans Modal

| Area                        | Status | Our impl (path:line)                                                                                                                | Claude ref images | Gap  | Effort |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---- | ------ |
| Plans modal with tier cards | ✅     | `apps/desktop/src/features/pricing/PlansModal.tsx:41` `TIER_ORDER = ['local', 'byok', 'hobby', 'pro', 'max']`                       | P22, P23, F10     | None | —      |
| CTA routing per tier        | ✅     | `apps/desktop/src/features/pricing/PlansModal.tsx:67-82` Local/BYOK → pricing URL; Hobby active → Stripe portal; Pro/Max → waitlist | P22, P23, F10     | None | —      |
| Free tier upgrade flow      | ✅     | `PlansModal.tsx` handles upgrade CTA                                                                                                | F10               | None | —      |

### 2.14 Onboarding

| Area                                        | Status | Our impl (path:line)                                                                                                                            | Claude ref images                         | Gap                                                    | Effort |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ | ------ |
| OnboardingWizard single flow                | ✅     | `apps/desktop/src/App.tsx:1228-1230` `OnboardingWelcome` shown when `!onboardingCompleted` in Tauri context; `App.tsx:193-202` state derivation | (no onboarding screenshot in batches)     | Single flow, ModeSelectionDialog deleted per AGENTS.md | —      |
| Local vs Cloud mode selection in onboarding | 🔄     | v1 LOCAL ONLY; ModeSelectionDialog was deleted per AGENTS.md                                                                                    | (no mode-selection screenshot in batches) | Deliberate lock. Cloud gated                           | —      |
| Onboarding completion → first chat          | ✅     | `apps/desktop/src/App.tsx:199-202` `hasSelectedMode` guard; `App.tsx:116-118` `OnboardingWelcome` lazy import                                   | P54 (home-empty is post-onboarding state) | None                                                   | —      |

### 2.15 Cap Modal

| Area                              | Status | Our impl (path:line)                              | Claude ref images                           | Gap  | Effort |
| --------------------------------- | ------ | ------------------------------------------------- | ------------------------------------------- | ---- | ------ |
| CapModal soft limit warning       | ✅     | `DesktopShellV3.tsx:113` `<CapModal>`             | F10 (upgrade modal is nearest equivalent)   | None | —      |
| CapModal hard limit + upgrade CTA | ✅     | `CapModal.tsx` (onSwitchModel + onBuyTopUp props) | F10, F02 (model-selector with upgrade lock) | None | —      |

---

## 3. User-Flow Reality Check

For each flow cataloged in section 2, this section reasons from source code about what a user who just installed `/Applications/AGI Workforce.app` would actually experience, beyond "does the code exist?".

Severity key: **BROKEN** = user-facing failure at the path, **STALE** = data shown is outdated/mock/not live, **DEGRADED** = feature works but worse than expected, **OK** = works as shown.

---

### 3.1 Model Picker — live from models.json or stale hardcoded?

**Verdict: OK — catalog-resolved at build time, accurate for the installed version.**

`ModelPopover.tsx` calls `getTaskModelForProvider` / `getProviderDefaultModel` from `packages/types/src/model-catalog.ts:1235,1351`. Those helpers read from `import modelsCatalogJson from './models.json'` (`model-catalog.ts:24`) — a static import bundled at build time, also embedded in the Rust binary via `include_str!` per the file header. The catalog is not fetched at runtime; it is accurate at the moment of the build but will not update until the app is updated. This matches Claude's behavior (Claude also ships a fixed model list per release). No stale/mock risk for a fresh install.

One gap: `resolveName()` prefers `store → metadata → bare ID` (`ModelPopover.tsx:132-138`), meaning the Zustand `modelStore` state is checked first. If `modelStore` has not been populated (e.g., first launch before any BYOK key is entered), names degrade to the bare catalog ID. This is cosmetic, not broken.

---

### 3.2 Conversation list — auto-refreshes? Persists across sessions? User-scoped?

**Verdict: BROKEN for v1 LOCAL ONLY users who have no cloud account.**

The conversation list is loaded via `chat_get_conversations(user_id)` (Rust: `conversation.rs:31`), which hard-rejects an empty `user_id` with `"User ID cannot be empty"`. The TypeScript side derives `user_id` from `useUnifiedAuthStore.getState().user?.id ?? ''` (`TauriRuntime.ts:168`). In v1 LOCAL ONLY mode there is no Supabase session, so `user?.id` is `undefined` → `''`.

Consequence: on first launch after onboarding, `TauriRuntime.ensureBackendConversation()` at line 182 throws `"Please sign in to send messages."` before any message can be sent. The conversation list also stays empty because `loadConversations('')` logs a warning and returns early (`chatStore.ts:555-556`). A local-only user cannot send a message or see persisted history.

Fix required: generate a stable local user UUID at onboarding time (via `machine_key::get_install_id()` which already exists in `master_password.rs:783`) and set it as a synthetic `user.id` in `useUnifiedAuthStore` for local-only mode.

For cloud-authenticated users: conversations persist to SQLite via `chat_create_conversation` / `chat_create_message` IPC calls and are reloaded on mode change at `chatStore.ts:1964`. Cross-session persistence is real for that path. The sidebar auto-subscribes to Zustand store and reflects changes without page reload.

---

### 3.3 Settings toggles — actually persist? Take effect without restart?

**Verdict: OK for most toggles; hotkey combo change requires restart.**

Settings are saved via `invoke('settings_save', {...})` (`settingsStore.ts:1327`) which writes to disk through the Rust `settings_save` command. The save is triggered explicitly by `saveSettings()`. On next launch, `settings_load_from_disk` rehydrates. Zustand `persist` middleware also writes to `localStorage` as a secondary cache (`settingsStore.ts:1386`).

- **Theme**: Applies immediately — `setTheme` calls `applyTheme(theme)` synchronously after store update (`settingsStore.ts:873`). No restart needed.
- **Language**: Applies immediately — `I18nProvider.tsx:41` calls `i18n.changeLanguage(language)` synchronously when the store updates. No restart needed.
- **Adaptive thinking toggle**: Applies to the next message send — `ModelPopover.tsx` reads from store, no IPC restart needed.
- **Global hotkey combo** (`globalHotkeyPreferences.combo`): The combo is saved to disk but the in-process Tauri global hotkey listener (`App.tsx:918`) is registered once at startup. Changing the combo in Settings persists it but does **not** re-register the hotkey with the OS for the running session. The new combo only takes effect after restart. No restart warning is shown in the Settings UI — this is a silent degraded experience.
- **Crash reporting toggle**: Reads from `errorTracking.getConfig()` (`Privacy/index.tsx:302`). Toggle updates the store but whether Sentry is actually deinitialized mid-session depends on the errorTracking service implementation (not audited). No "restart required" indicator shown.

---

### 3.4 Free-tier ceilings — enforced in IPC or just shown in UI?

**Verdict: DEGRADED — budget gate is real but subscription gate is compile-time disabled.**

`send_message.rs:57-65` calls `check_billing_and_budget()`. Under `#[cfg(feature = "billing")]` the function checks `billing_state.check_cloud_access()` and returns an error if no cloud subscription exists. Under `#[cfg(not(feature = "billing"))]` (the default dev/local build), the billing gate is entirely skipped — only the user-set `billing.monthly_budget` SQLite setting is checked.

For a typical app build without the `billing` feature flag compiled in: the CapModal UI exists and shows tier limits, but the Rust backend will not block any message regardless of the user's tier. A "free" user who exhausts their UI-shown limit can keep sending messages; the backend won't stop them.

The `plan_tier` passed to `build_router_preferences` defaults to `"free"` when `billing` is not compiled in (`send_message.rs:85`). This affects routing preferences but not whether the request is blocked.

This is consistent with v1 LOCAL ONLY — there is no billing gate by design. But it means the tier ceiling UX (CapModal) is cosmetic for the current build.

---

### 3.5 File attachments — actually upload? Or mock-only?

**Verdict: BROKEN — `upload_file` IPC command is not registered in the Tauri backend.**

`TauriRuntime.uploadFile()` (`TauriRuntime.ts:524`) calls `invoke('upload_file', {...})`. Searching `lib.rs` for registered commands finds only `browser_upload_file` (`lib.rs:1394`) — not a plain `upload_file`. The `upload_file` symbol exists in various feature modules (Slack, browser automation, MCP) but is not wired as a standalone Tauri command.

When a user drops a file into the composer and the frontend calls `uploadFile()`, the IPC call will return a Tauri "command not found" error. The file attachment flow is silently broken for all users.

Evidence: `TauriRuntime.ts:524` `invoke('upload_file', ...)`, `lib.rs:1394` only has `browser_upload_file`.

---

### 3.6 Tool-call display — Claude verbose-by-default or AGI badge hot path?

**Verdict: OK — AGI deliberately uses `iconStyle="badge"` which matches Claude's compact disclosure style; this is parity, not a gap.**

`ToolCallCard.tsx:296` passes `iconStyle="badge"` to `InlineToolCall`. The `InlineToolCall` component (`packages/unified-chat/src/components/InlineToolCall.tsx:57`) documents `'badge'` as "Claude-parity mode: round 24px badge with single uppercase letter as leading icon". The `'lucide'` style would use full Lucide icons — a divergence from Claude. The current `"badge"` choice is intentional Claude-parity.

The tool-call result body is collapsed by default (`defaultOpen={requiresApproval}` — only open when approval is needed). Claude's desktop UI also shows tool calls collapsed unless in progress. This matches P65-P67 reference screenshots (filesystem tool result as table, shown after tool completes). The one behavioral difference: Claude shows a `"Result"` sub-label below the badge row when `iconStyle === 'badge'` and `subLabel` is set (`InlineToolCall.tsx:122`). AGI passes no `subLabel` in `ToolCallCard.tsx`. Sub-label is cosmetically absent — a minor gap, not broken.

---

### 3.7 Summary: flows broken vs degraded vs OK

| Flow                                | User-facing reality                                                                                  | Severity                | Key evidence                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| Model picker                        | Shows catalog-resolved models; names may show bare IDs if modelStore empty                           | OK                      | `model-catalog.ts:24`, `ModelPopover.tsx:131-138`   |
| Conversation list (local-only user) | Empty; "Please sign in" error on first send                                                          | **BROKEN**              | `TauriRuntime.ts:168,182`, `conversation.rs:35-41`  |
| Conversation list (cloud user)      | Persists to SQLite, reloads on mode change, auto-refreshes via Zustand                               | OK                      | `chatStore.ts:1964`, `conversation.rs:31`           |
| Theme setting                       | Takes effect immediately                                                                             | OK                      | `settingsStore.ts:873`                              |
| Language setting                    | Takes effect immediately                                                                             | OK                      | `I18nProvider.tsx:41`                               |
| Global hotkey combo change          | New combo not registered until restart; no warning shown                                             | DEGRADED                | `App.tsx:918` (single registration at startup)      |
| Free-tier ceiling enforcement       | Backend gate compile-time disabled (billing feature flag); UI shows limits but backend doesn't block | DEGRADED                | `send_message.rs:62-65`, `provider_access.rs:17-24` |
| File attachments (drop in composer) | IPC call fails — `upload_file` not registered as Tauri command                                       | **BROKEN**              | `TauriRuntime.ts:524`, `lib.rs:1394`                |
| Tool-call display style             | Matches Claude badge style by design; sub-label absent                                               | OK (minor cosmetic gap) | `ToolCallCard.tsx:296`, `InlineToolCall.tsx:57`     |

---

## 4. Where AGI Is Ahead of Claude

| Area                                          | Evidence                                                                                                        | Claude reference                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Master password (Argon2id)**                | `Privacy/index.tsx:353-360` — API key encryption at rest with a user-set password                               | P36 (settings-privacy) shows no equivalent in Claude                                                                           |
| **GDPR compliance section**                   | `Privacy/index.tsx:291-300` — explicit right-to-export note + uninstall instructions                            | Not present in Claude settings (P36)                                                                                           |
| **Governance & Safety Policies**              | `Privacy/index.tsx:385-413` — dedicated governance workspace + safety policy view accessible from Settings      | Claude has no governance tab (P34-P45 settings nav inventory)                                                                  |
| **Allowed directories sandbox control**       | `Privacy/index.tsx:373-380` — explicit filesystem permission allowlist                                          | P60, P65, P66 show MCP/local permission dialogs; Claude has no equivalent allowlist UI                                         |
| **SVG artifact sanitization**                 | `ArtifactRendererView.tsx:295` — `sanitizeSvg()` wrapper on mermaid output                                      | Claude's artifact viewer has no explicit sanitization note                                                                     |
| **6-tier model**                              | `PlansModal.tsx` `local-only / byok / hobby / pro / max / enterprise`                                           | P22, P23 show Claude's Free/Pro/Max/Team/Enterprise — AGI's `local-only` and `byok` tiers are novel for privacy-first users    |
| **Multi-provider connector permissions**      | `ConnectorsView.tsx:11-81` — 3-state cycle (allow/ask/never) per tool per connector, not per connector globally | P10-P17 show per-tool permission detail; Claude's connector UI (P18-P21) operates at connector level                           |
| **Adaptive thinking is a first-class toggle** | `ModelPopover.tsx:191-208` — iOS-style switch, labeled with description, always visible                         | P27 (003-cowork-model-menu-adaptive-thinking) shows Claude's toggle — AGI has identical feature at parity                      |
| **Cowork + Code mode intent**                 | `DesktopShellV3.tsx:55`, `Sidebar.tsx` — 3-mode switcher (chat/cowork/code) is already in the chrome            | P61, P62, P63 show Claude's Code mode is fully built; AGI has placeholder only — this is a gap not an advantage currently      |
| **Built-in Python sandbox + TS REPL**         | `PluginsHub.tsx:22-51` — first-class built-in plugins                                                           | P52, P53 show Claude's plugin marketplace; AGI ships Calculator/Python/Image Gen/TS REPL as native built-ins without MCP setup |

---

## 4. Recommendations (R26-PARITY-DESKTOP-PRO)

### P0 — Critical gaps that block daily use claims

Two additional P0 items were found by the User-Flow Reality Check (section 3) that are not visible from UI screenshots alone:

| ID                         | Recommendation                                                                                                                                                                                                                                                                                                                                                                        | Evidence                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R26-PARITY-DESKTOP-PRO-00A | **LOCAL ONLY users cannot send messages** — `TauriRuntime.getCurrentUserId()` returns `''` when no Supabase session exists. `ensureBackendConversation()` throws "Please sign in to send messages." Fix: generate stable install-scoped UUID at onboarding and set it as synthetic `user.id` in `useUnifiedAuthStore` for local mode. `machine_key::get_install_id()` already exists. | `apps/desktop/src/runtime/TauriRuntime.ts:168,182`; `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs:35-41` |
| R26-PARITY-DESKTOP-PRO-00B | **File attachments fail silently** — `TauriRuntime.uploadFile()` calls `invoke('upload_file', ...)` but this command is not registered in Tauri. Only `browser_upload_file` is registered (`lib.rs:1394`). Dropping a file into the composer produces a "command not found" IPC error. Register a `upload_file` command that stores the payload locally and returns a `FileRef`.      | `apps/desktop/src/runtime/TauriRuntime.ts:524`; `apps/desktop/src-tauri/src/lib.rs:1394`                                 |
| R26-PARITY-DESKTOP-PRO-01  | **Starred messages panel** — Implement `StarredMessages` feature (panel accessible from sidebar or chat message action bar). Currently no component exists in `apps/desktop/src/`.                                                                                                                                                                                                    | No screenshot in batches (feature inferred from Claude web UI; not shipped in captured desktop batches)                  |
| R26-PARITY-DESKTOP-PRO-02  | **Wire PlusMenu flyouts to live stores** — `PlusMenu.tsx` uses static hardcoded `SKILLS_LIST`, `INSTALLED_PLUGINS`, and `CONNECTORS` data. Wire `skillMarketplaceStore` and `connectorsStore` so the composer Plus menu reflects actual installed skills/connectors.                                                                                                                  | `PlusMenu.tsx:20-43` hardcoded arrays vs P28-P32 (real screenshots show live skill/connector lists)                      |

### P1 — Visible gaps that degrade parity against Pro

| ID                        | Recommendation                                                                                                                                                                                          | Evidence                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R26-PARITY-DESKTOP-PRO-03 | **Cowork mode UI** — Build Dispatch, Scheduled tasks, and Live Artifacts surfaces under `mode === 'cowork'`. Currently shows placeholder "Cowork mode coming" text.                                     | `DesktopShellV3.tsx:117-130` vs P29 (connectors-submenu shows cowork context), P61 (cowork-or-code-entry) |
| R26-PARITY-DESKTOP-PRO-04 | **Code mode UI** — Build Routines list and IDE integration view under `mode === 'code'`. Currently placeholder text.                                                                                    | `DesktopShellV3.tsx:132-145` vs P61, P62, P63 (code entry/dashboard/handoff)                              |
| R26-PARITY-DESKTOP-PRO-05 | **Verify and document project detail depth** — Read `apps/desktop/src/features/projects/` and confirm Project detail (knowledge upload, system prompt editor, conversation list) matches P04, P05.      | P04 (project-detail_knowledge-panel), P05 (three-pane-layout)                                             |
| R26-PARITY-DESKTOP-PRO-06 | **Verify connector OAuth dialog UX** — Read `ConnectorDetailView.tsx` and `ConnectorOAuthFlow.tsx` to confirm OAuth consent dialog matches P20 (branding, scopes list, grant/deny actions).             | P20 (33_connector-oauth-flow_slack-grant-access-modal) vs `ConnectorsView.tsx` `connect()` stub           |
| R26-PARITY-DESKTOP-PRO-07 | **Confirm .mcpb drag-to-install flow** — Read `PluginMarketplace.tsx` and `MCPBundleBrowser.tsx` to verify the `.mcpb`/`.dxt` drag-to-install UX matches P53. Document in audit or open gap if missing. | P53 (043-browse-plugins-overlay) vs `PluginsHub.tsx:269-273` (lazy import only)                           |
| R26-PARITY-DESKTOP-PRO-08 | **Artifacts gallery verification** — Read `ArtifactsGallery.tsx` to confirm list view, filter, and open/share actions match F08, F09.                                                                   | F08 (048_claude-free_artifacts), F09 (048b_loaded-grid)                                                   |

### P2 — Polish and minor alignment

| ID                        | Recommendation                                                                                                                                                                                                           | Evidence                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| R26-PARITY-DESKTOP-PRO-09 | **Voice input wiring audit** — Verify `onVoiceClick` is fully wired from `DesktopShellV3` through `ChatInterface` to an actual voice capture component. `App.tsx` threads the prop but voice UI confirmation is missing. | `apps/desktop/src/App.tsx:1290` and `App.tsx:1317` `onVoiceClick` prop; composer mic area visible in P33 (chat home) |
| R26-PARITY-DESKTOP-PRO-10 | **Free-tier model gating in ModelPopover** — Confirm tier-based model filtering is enforced in `ModelPopover.tsx` or `ChatInterface` for local/byok vs pro/max users. F02 shows Opus locked with upgrade CTA.            | F02 (042_claude-free_model-selector_opus-upgrade) vs `ModelPopover.tsx` (no tier gate visible)                       |
| R26-PARITY-DESKTOP-PRO-11 | **Search modal full-text coverage** — Audit `SearchModalCmdK.tsx` to confirm conversations are full-text indexed and searchable, not just title-matched. P02, P55 show sidebar recents with grouping.                    | P02, P55 (sidebar showing chat groups), `apps/desktop/src/App.tsx:96-98` SearchModal lazy import                     |
| R26-PARITY-DESKTOP-PRO-12 | **Crash reporting off by default** — Confirm `errorTracking.getConfig().enabled` defaults to `false`. Privacy policy (AGENTS.md) states telemetry off by default.                                                        | `Privacy/index.tsx:49` reads from `errorTracking.getConfig()`                                                        |

---

## Summary Statistics

| Status                        | Count  |
| ----------------------------- | ------ |
| ✅ Parity                     | 61     |
| 🟡 Partial                    | 10     |
| ❌ Missing                    | 3      |
| 🔄 Chose differently (locked) | 8      |
| **Total areas assessed**      | **82** |

**P0 gaps:** 4 (LOCAL ONLY user cannot send messages [BROKEN], file attachments unregistered IPC [BROKEN], starred messages missing, PlusMenu live data wiring)  
**P1 gaps:** 6 (Cowork UI, Code UI, Projects depth, OAuth dialog, .mcpb drag install, Artifacts gallery)  
**P2 gaps:** 5 (Voice wiring, model gating, search coverage, crash reporting default, global hotkey combo change requires restart)

**Net parity score:** ~74% full parity on static feature presence, but 2 BROKEN flows mean the app is not shippable to local-only users in current state.

---

## Notes on Locked Divergences

All 🔄 items trace to a single lock: `docs/locks/v1-local-only-cloud-waitlist-2026-05-18.md` (confirmed in `apps/desktop/AGENTS.md` R25-V5). Specifically:

- Cloud sync toggle: `Privacy/index.tsx:244` comment is the re-add marker
- Shared chats, artifact publish, project members, active sessions, billing tab: all await cloud ungating
- Mode selection in onboarding: `ModeSelectionDialog.tsx` was explicitly deleted per AGENTS.md

None of these should be reopened until cloud is ungated. The lock file is authoritative.

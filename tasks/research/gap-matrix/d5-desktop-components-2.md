# GAP-D5 — Desktop Components 151..300 (alphabetical) — Missing vs Claude

> **Scope.** `apps/desktop/src/components/{Marketplace,MCP,Media,Memory,MemoryPanel,Messaging,Mobile,Notifications,OfflineIndicator,Onboarding,Outcomes,Overlay,Planning,Pricing,Productivity,QuickQuery,Reminders,Research,ResourceMonitor,ROIDashboard,Scheduler,Schedules,ScreenCapture,Settings/A..M(ModelCard)}` — 150 files / ≈ 39,227 LOC.
> **Method.** I read the canonical Claude reference doc (`anthropic-claude-suite-may-2026.md`), the three desktop UI deep-dives (`ui-02-claude-desktop.md`, `ui-03-claude-artifacts.md`, `ui-04-claude-connectors.md`), one CLI deep-dive (`m5-screens-trio.md`), and the C-component reference (`deep/c1-components-chunk-1.md`) for primitives Claude Code uses. I then sampled every directory in scope plus high-signal Settings panels. Citations are absolute file:line.
> **Output rule.** Only what's missing or partial. Each finding has a citation (or `MISSING` when the surface does not exist), a Claude-side anchor, and a desktop-effort estimate (S = 1–2 d, M = 3–5 d, L = 1–2 wk, XL = 3+ wk).

---

## 1. MISSING — Outright surface gaps

These are first-class Claude Desktop / Cowork / Code-tab capabilities for which my scope shows **no analogous component**. Each one would be a new top-level addition.

### 1.1 Cowork tab — autonomous task surface (XL)

**Claude has** a dedicated "Cowork" tab with its own onboarding wizard (5 steps), Tasks list, in-progress activity feed with Pause / Stop / Steer buttons, network-egress allowlist editor, sandbox toggles, file-mount config, schedule, Dispatch toggle, and Computer Use toggle (`anthropic-claude-suite-may-2026.md:158-213` §3). Tasks survive app restart; VM status pill ("Running / Paused / Stopped") sits in the Cowork sidebar.
**We have** `Onboarding/OnboardingWizard.tsx:1-68` — a single-screen Cloud-vs-Local picker. No Cowork tab, no autonomous-task list view, no VM status indicator, no allowlist editor, no Pause/Steer pattern. `Planning/PlanPreview.tsx:1-60` is the closest analog but it generates a one-shot plan list, not a long-running task workspace.
**Gap surface area.** A `Cowork/` directory at minimum: `CoworkOnboardingWizard.tsx` (5-step), `TasksList.tsx`, `TaskCard.tsx` with status pill (Running / Awaiting approval / Completed / Failed), `TaskActivityFeed.tsx` (live tool-call cards), `SteerInlineComment.tsx`, `EgressAllowlistEditor.tsx`, `FileMountConfig.tsx`, `VmStatusPill.tsx`, `DispatchToggle.tsx`. **XL.**

### 1.2 Memory IMPORT-FROM-OTHER-AI flow does not match Claude (S–M)

**Claude has** Settings → Capabilities → "Import memory from other AI providers" with a `[Start import]` button that gives the user a ready-to-paste prompt to fetch memory from ChatGPT/Gemini/Grok at `claude.com/import-memory`, then Anthropic ingests it server-side (`anthropic-claude-suite-may-2026.md:83`).
**We have** `Memory/MemoryImport.tsx:1-70` — local file-based import (upload `memories.json`, paste plain text). No cross-provider prompt-vending UX, no "we'll generate a prompt for you to paste at the other provider" flow.
**Gap.** Add a `MemoryProviderImportPrompt.tsx` panel that emits a tailored prompt per source provider, embeds it in copy-to-clipboard chip, and accepts the JSON paste-back. **S.**

### 1.3 Persistent Memory **edit-in-place** (S)

**Claude has** Settings → Capabilities showing the actual remembered text in a card with "Updated 11 hours ago from your chats", and the `04_project-detail` shot proves Memory shows real facts ("Siddhartha is the solo founder of AGI AUTOMATION LLC…") with `Only you` privacy chip + paperclip icon (`ui-02-claude-desktop.md:55-61, 132-137`). Edit/delete UX: per-row delete, plus "Reset memory" (irreversible). Pause-but-not-erase is a separate state.
**We have** `Memory/MemoryCard.tsx:1-40` (memory chip + delete + expand) and `Memory/MemoryViewer.tsx:1-30` — present but no per-fact inline edit, no auto-injection preview, no "synthesized profile vs raw transcript" distinction. `MemoryPanel.tsx:36-75` exposes a `maxTokens` slider but no fact-level edit.
**Gap.** Add inline edit affordance to `MemoryCard.tsx`; add "Auto-inject preview" in `MemoryPanel.tsx` that shows the exact tokens that would be injected next turn. **S.**

### 1.4 Project-scoped Memory (M)

**Claude has** a dedicated Project Memory section in the project detail right pane (`ui-02-claude-desktop.md:55-61`). Memory is per-account global by default but Cowork projects get project-scoped memory layered on top (`anthropic-claude-suite-may-2026.md:83`).
**We have** `Memory/*` is global only; no per-project scoping in any of the 13 Memory files.
**Gap.** Add `projectId` axis to `memoryStore`; ship `Memory/ProjectMemoryPanel.tsx` and project-scoped CRUD. **M.**

### 1.5 Connector Directory (modal-not-route, ~190 entries) (L)

**Claude has** a modal-overlay Connectors directory (`Customize → Connectors → Browse`) with ~190 entries across 19 scroll pages, search input, three pill dropdowns (`Sort` / `Type` / `Categories`), per-card brand logo + name + 5 chip-badge taxonomy (`Popular`/`Trending`/`New`/`Beta`/`Limited`/`Interactive`), and the `+`/`✓` install-state glyphs (`ui-04-claude-connectors.md:11-65`).
**We have** `MCP/MCPServerBrowser.tsx:1-80` and `MCP/MCPBundleBrowser.tsx:1-60` are list-style server panels; categories exist but there's **no five-chip badge taxonomy**, **no Sort/Type/Categories triple-dropdown**, **no modal-overlay summon from Customize**, **no `(By Anthropic)`-style first-party suffix**, **no install-status `+`/`✓` glyphs**, **no Trust statement at modal header**. `MCP/MCPServerCard.tsx` is closer to the right card layout but lives inline, not in a modal.
**Gap.** New `MCP/ConnectorDirectoryModal.tsx` summoned from a `Customize` destination; add `Sort`/`Type`/`Categories` filters to `mcpStore`; extend chip taxonomy in `MCPServerCard.tsx`. **L.**

### 1.6 Per-tool 3-glyph permission grid (M)

**Claude has** the gold-standard permission UX: per-connector `Read-only / Write-delete / Interactive / Other` groups, each with a per-group `Always allow / Needs approval / Blocked / Custom` dropdown, plus three per-tool glyphs (✓ green / ⏰ amber / 🚫 red) for individual override (`ui-04-claude-connectors.md:120-165`).
**We have** `Settings/AutomationPermissionsSettings.tsx:22-50` is single-row Allow/Deny per OS-level capability; `MCP/MCPCredentialManager.tsx:33-91` is per-connector OAuth state, not per-tool. Nothing implements the **per-tool 3-glyph** override pattern, nor the **4-state per-group dropdown** with `Custom`. `Settings/MCPToolsSettings.tsx` lists tools but no permission row.
**Gap.** New `Settings/ConnectorPermissionsEditor.tsx` with the three-tier (master toggle → category dropdown → per-tool icons). **M.**

### 1.7 Pre-connect transparency page (S)

**Claude has** a per-connector pre-connect detail page that shows: hero + `[Connect]`, two example use-case cards, full description, "Developed by [Vendor] ↗" attribution link, trust disclaimer ("Only use connectors from developers you trust…"), and a tools chip-strip listing every API call (e.g., `slack_send_message`, `slack_search_users`) before consent (`ui-02-claude-desktop.md:250-260`, `ui-04-claude-connectors.md:69-94`).
**We have** `MCP/MCPServerCard.tsx` and `MCP/MCPServerBrowser.tsx` ServerDetailsDialog at lines 42-100 show a server's tools chip list and rating but **no use-case cards, no developer-attribution link with `↗` arrow, no trust disclaimer**.
**Gap.** Add `MCP/ConnectorPreConnectPage.tsx` as standard between directory and OAuth handshake. **S.**

### 1.8 Filesystem-class connector "Allowed Directories (Required)" form (S, partially exists)

**Claude has** a canonical structured-config template: `Allowed Directories (Required)` with row-per-folder + browse + `×` remove + `+ Add directory` + `Save` (sage green), with **Save being prominently flush-right and primary** (`ui-04-claude-connectors.md:97-99`).
**We have** `Settings/AllowedDirectoriesSettings.tsx:23-50` is functionally close — manual path input + add/remove + browse — but lives in Settings, not as the connector's own config sub-page; no per-connector binding; no shared template.
**Gap.** Promote `AllowedDirectoriesSettings` into a reusable `Settings/ConnectorConfigForm.tsx` template usable by any connector that needs structured config. **S.**

### 1.9 Drag-zone for `.MCPB` / `.DXT` install (S)

**Claude has** a dashed-border drop-zone "📍 Drag .MCPB or .DXT files here to install" + `[Browse extensions]` button + bundle install via packaged file format (`ui-02-claude-desktop.md:178-184`).
**We have** `MCP/MCPBundleBrowser.tsx:1-60` is a one-click marketplace install flow; **no drag-zone for raw `.mcpb`/`.dxt` files**, **no `[Advanced settings]` footer link**.
**Gap.** Add `Settings/ExtensionsSettings.tsx` drop-zone (we have ExtensionsSettings.tsx:1-50, no drop-zone); accept the `.mcpb`/`.dxt` MIME types, bridge to existing install pipeline. **S.**

### 1.10 Live-status `running` pill on MCP servers (S)

**Claude has** a green `running` pill next to each MCP server in `Settings → Developer → MCP servers` with `[View Logs]` (`ui-02-claude-desktop.md:189-195`).
**We have** `MCP/MCPLogsViewer.tsx:1-60` ships a logs viewer but `MCPServerSettings.tsx:96-100` only shows running state on **our own** AGI MCP server (the one we expose), not on each remote MCP server we consume.
**Gap.** Add a per-server `running` pill in `MCP/MCPServerManager.tsx` and `MCPConnectionStatus.tsx`. **S.**

### 1.11 Custom Skills authoring view (M)

**Claude has** a Customize → Skills middle column with selected-skill child files (SKILL.md, README.md, plus assets), then a right pane with `Added by User`, `Last updated Mar 18 2026`, `Invoked by User or Claude`, **enable toggle**, description prose, **Allowed tools chip strip** (`Read, Write, Edit, Grep, Glob, AskUserQuestion`), and Markdown body (`ui-02-claude-desktop.md:206-209`).
**We have** `Settings/SkillsPluginsSettings.tsx:1-50` lists installed plugins + project skills/agents/commands but **no per-skill child-file tree, no allowed-tools chip strip, no enable toggle inline with header, no `Invoked by User or Claude` capability label**. There's no skill detail view at all.
**Gap.** Add `Settings/SkillDetailView.tsx` matching Claude's right-pane (header + chips + Markdown body). **M.**

### 1.12 Voice-mode quick-launch button + voice picker (S, voice exists)

**Claude has** a sound-wave icon in composer (lower-right) for voice mode, plus a profile-popover language sub-menu (`ui-02-claude-desktop.md:39-41, 268-275`). Multiple voices on mobile.
**We have** `Settings/VoiceSettings` is referenced from `GeneralSettings.tsx:14` but is outside scope; in scope `QuickQuery/index.tsx:14-20` imports a `Mic` icon — voice in QuickQuery only. **No multiple-voice picker**, **no global voice quick-launch**.
**Gap.** Add voice-picker dropdown to VoiceSettings (out-of-scope file); add sound-wave icon to QuickQuery. **S in scope** (only the QuickQuery side).

### 1.13 Quick-access global hotkey UX matches Claude only loosely (S)

**Claude has** Settings → Desktop app → General with a `Quick access shortcut` dropdown (current "Tap Option twice"), `Voice shortcut` dropdown, `Menu bar` toggle, `Keep computer awake` toggle (`ui-02-claude-desktop.md:170-176`).
**We have** `Settings/GeneralSettings.tsx:30-40` accepts `resolvedGlobalHotkeyPreferences` as a prop with hotkey enabled + combo + change handler. **Missing**: "Tap Option twice" double-tap pattern (it's combo-only), **Voice shortcut** dropdown, **Menu bar toggle**, **Keep computer awake** toggle.
**Gap.** Add 3 fields to `GeneralSettings.tsx`. **S.**

### 1.14 "Idle / sleep prevention" toggle (S)

**Claude has** "Keep your computer awake while Claude works" toggle in Cowork onboarding step 4 (`anthropic-claude-suite-may-2026.md:162`) and Settings → Desktop app → General `Keep computer awake` toggle (`ui-02-claude-desktop.md:175-176`).
**We have** No equivalent in `GeneralSettings.tsx:1-40`, `ScheduledTasksPanel.tsx:1-50`, or anywhere in scope.
**Gap.** Add `Keep computer awake while running scheduled task` to `GeneralSettings.tsx` (or `ScheduledTasksPanel.tsx`) wired to `tauri-plugin-prevent-default` or equivalent. **S.**

### 1.15 Tab-status / haiku title ("Golden hour thinking" daypart rotation) (S, polish)

**Claude has** an animated terminal/window title that rotates by daypart ("Golden hour thinking") + a one-shot Haiku-extracted tab title per session (`ui-02-claude-desktop.md:43-45`, `m5-screens-trio.md:128`).
**We have** No daypart-rotating title. `OfflineIndicator.tsx` is the only top-shell-status component in scope; nothing animates page title.
**Gap.** Add `Layout/AnimatedAppTitle.tsx` with daypart rotation (Tauri title API) + per-conversation Haiku title generator wired to chatStore. **S.**

### 1.16 Audit logs / Compliance API hook (M, enterprise)

**Claude has** Audit Logs / Compliance API on Enterprise (`anthropic-claude-suite-may-2026.md:537`). Users see Active sessions table with Device | Location | Created | Updated | `⋮` (`ui-02-claude-desktop.md:115-118`).
**We have** `Settings/AccountSettings.tsx:1-60` shows account info + plan but **no Active sessions table**, no per-session revoke. `AnalyticsSettings.tsx:7-40` is privacy-consent only.
**Gap.** Add `Settings/ActiveSessionsTable.tsx` with revoke per-row. **M.**

### 1.17 Style picker ("Normal / Concise / Explanatory / Formal / custom") (S)

**Claude has** a style-picker chip next to the model picker in every chat composer, with 4 built-ins + user-authored Styles (`anthropic-claude-suite-may-2026.md:40`).
**We have** `Settings/PersonalizationSettings.tsx` exists but is out of scope (entry > 300). In scope: `CustomInstructionsSettings.tsx:18-50` is global instructions only — **no Styles concept** (no per-style template, no quick-pick chip).
**Gap.** Define Style schema; ship `Settings/StylesSettings.tsx` (out of scope) + composer chip. **S.**

### 1.18 Connector "Tool access" mode dropdown (S)

**Claude has** Settings → Capabilities → `Tool access mode` radio: `Load tools when needed` (default — chats compact less) vs `Tools already loaded` (chats compact more often) (`ui-02-claude-desktop.md:138-141`).
**We have** Nothing parallel in `Settings/MCPToolsSettings.tsx:1-50`, `Settings/AgentsSettings.tsx:1-50`, or `FeaturesPrivacySettings.tsx:1-40`.
**Gap.** Add a single radio group to `Settings/MCPToolsSettings.tsx`. **S.**

### 1.19 "Active sessions" cross-device list (S)

**Claude has** Settings → Account → Active sessions table showing Mobile Safari (iOS), Chrome (Mac), Claude (iOS), Claude Desktop (Mac OS X — tagged `Current`) with `⋮` per-row to revoke (`ui-02-claude-desktop.md:115-118`).
**We have** `Mobile/QRPairingCard.tsx:1-50` + `Mobile/MobileCompanionPanel.tsx:1-50` show one paired peer; nothing surfaces a multi-device list.
**Gap.** Add `Settings/ActiveSessionsList.tsx` reading from auth store. **S.**

### 1.20 Custom-skill drop-zone parity (S)

**Claude has** install-from-folder/file pattern carried across `.MCPB`/`.DXT` extensions and Skills (`Customize → Skills` middle column accepts user-authored).
**We have** `Settings/SkillsPluginsSettings.tsx:1-50` lists plugins; **no drop-zone for `.skill` zip / `SKILL.md` folder upload**.
**Gap.** Add drop-zone in `SkillsPluginsSettings.tsx`. **S.**

### 1.21 Notification preferences / "Response completions" toggle (S)

**Claude has** Settings → General → Notifications: `Response completions` toggle (ON) — "Get notified when Claude has finished a response. Most useful for long-running tasks like tool calls and Research." (`ui-02-claude-desktop.md:108-110`).
**We have** `Notifications/NotificationCenter.tsx:1-60` is an in-app feed; `Settings/NotificationsSettings.tsx` is out of scope. In scope, no `Response completions` system-notification toggle.
**Gap.** Add toggle to NotificationCenter footer (or call out to NotificationsSettings). **S.**

### 1.22 Plan-mode UI integration (M, partial)

**Claude has** Plan mode triggered by `Shift+Tab` (twice), `/plan`, or `claude --plan-mode`. Plan output is markdown saved to `~/.claude/plans/`. `Ctrl+G` opens in `$EDITOR`. Plans are versioned and can be re-run via `/plan open` (`anthropic-claude-suite-may-2026.md:303-304`).
**We have** `Planning/PlanPreview.tsx:1-60` is a one-shot plan-preview modal, no save-to-disk, no plan history list, no re-run, no edit-in-external-editor.
**Gap.** Add `Planning/PlanLibrary.tsx` (saved plans), persist to `~/.agiworkforce/plans/`, support re-run. **M.**

### 1.23 Background-tasks / Bashes dialog (S)

**Claude has** a Background-tasks list dialog (`m5-screens-trio.md:122` — `showBashesDialog`) showing in-flight bash commands and their statuses.
**We have** Nothing in scope; `Scheduler/ScheduledTasksPanel.tsx:1-50` is **scheduled** tasks (cron-like), not in-flight background bashes.
**Gap.** Add `Scheduler/BackgroundBashesDialog.tsx`. **S.**

### 1.24 Hooks editor / `.claude/hooks.json` UX (M)

**Claude has** `/hooks` interactive editor for command hooks (12 events × 4 handler types: command/HTTP/prompt/agent), with `~/.claude/settings.json` JSON-edit fallback for prompt/agent hooks (`anthropic-claude-suite-may-2026.md:274-294`).
**We have** No hooks editor in scope. `Settings/DotfileSettings.tsx:1-50` edits a flat config but no hook lifecycle picker, no event/handler-type matrix.
**Gap.** Add `Settings/HooksEditor.tsx` matching Claude's 12-event matrix. **M.**

### 1.25 `Show more` long-list collapsing + scroll-to-bottom chevron (S, polish)

**Claude has** `Show more` link on long bullet lists in reasoning blocks (`ui-03-claude-artifacts.md:155-160`) and floating "scroll to bottom" chevron when user scrolls up during streaming.
**We have** `Research/ResearchProgress.tsx:1-40` and `Research/ResearchPanel.tsx:1-60` use `react-markdown` but no `Show more` collapse on long lists; no floating scroll-to-bottom chevron in any of the 10 Research panels.
**Gap.** Add `<ShowMoreList>` primitive + scroll-to-bottom chevron. **S.**

---

## 2. PARTIAL — present but materially behind Claude

### 2.1 OnboardingWizard (S–M)

**File.** `Onboarding/OnboardingWizard.tsx:75-80` — single-screen Cloud-vs-Local picker.
**Claude has** Cowork-onboarding 5-step wizard (folder picker, Connectors, Computer Use consent, keep-awake toggle, tasks list) (`anthropic-claude-suite-may-2026.md:160-163`); plus the Customize landing page as the "next-step for already-signed-in users" (`ui-02-claude-desktop.md:201-205`).
**Missing.** Step 2 (suggested connectors), step 3 (Computer Use per-app consent gate), step 4 (keep-awake), step 5 (tasks list — empty state). Also no **mode selection per-conversation** (BYOK vs Local per-thread isolation) — our thesis differentiator.
**Effort.** **M.**

### 2.2 NotificationCenter (S)

**File.** `Notifications/NotificationCenter.tsx:7-50` — Bell/BellOff/Check icons, tabs, popover, multi-priority types.
**Claude has** notifications fired specifically for: (a) Cowork task completes/fails/needs approval (Pro/Max), (b) Dispatch session result, (c) Claude Code Remote Control "needs review", (d) scheduled Cowork task ready. Each carries task name, status, deep-link to conversation (`anthropic-claude-suite-may-2026.md:380-382`).
**Missing.** Deep-link target to conversation from notification; no `task-completed`/`approval-needed`/`dispatch-result` typed slots. The current store has `Notification` type but no Cowork-specific channels.
**Effort.** **S.**

### 2.3 Scheduler / Schedules (S)

**Files.** `Scheduler/ScheduledTasksPanel.tsx:1-50`, `Scheduler/CreateTaskModal.tsx`, `Schedules/ScheduleEditor.tsx:1-50`.
**Claude has** Cowork schedules: daily/weekly/monthly recurring config shipped Mar 2026 (`anthropic-claude-suite-may-2026.md:185`); push notifications when scheduled task ready (`anthropic-claude-suite-may-2026.md:380-382`).
**We have** EXAMPLE_TASKS bundled (Daily news, Weekly productivity, Morning briefing — `ScheduledTasksPanel.tsx:22-41`) and full Daily/Weekly/Monthly/Custom (cron) frequencies (`ScheduleEditor.tsx:29-34`). **Behind on**: no link to a Cowork task (we only schedule a chat prompt, not an autonomous Cowork run); no awake-required precondition; no "next run in N hours" relative footer; no "schedule from chat" affordance.
**Effort.** **S.**

### 2.4 ResearchPanel + DeepResearchPage (S–M)

**Files.** `Research/ResearchPanel.tsx:1-60`, `Research/DeepResearchPage.tsx:1-50`, `Research/ResearchProgress.tsx:1-40`, `Research/SourceCard.tsx:1-40`.
**Claude has** Research mode in `+` menu, with web-search results rendered as a **single grouped card** with favicon + title + domain rows (no per-result expansion), `N results` count top-right, and citation pills tied back into prose (`ui-03-claude-artifacts.md:103-122`). Reasoning blocks expanded by default with clock-icon header + `Show more` (`ui-03-claude-artifacts.md:163-179`).
**We have** SourceCard with status pills + collapse, ResearchProgress phases, Quick/Standard/Deep/Exhaustive modes (`ResearchPanel.tsx:58`). **Behind on**: per-result single-line card layout (we use multi-line CardContent), citation pills tied to prose paragraphs in the synthesis, `Show more` long-list collapsing.
**Effort.** **S.**

### 2.5 QuickQuery overlay (S)

**File.** `QuickQuery/index.tsx:1-50` — Cmd+Shift+Space Spotlight-style overlay with model selector, mic icon, recent conversations.
**Claude has** Quick access shortcut "Tap Option twice" (default) summons quick-entry; menu-bar entry; system-tray; deep-link `claude://` (`ui-02-claude-desktop.md:147-148, 173`).
**We have** the spotlight overlay itself; **behind on**: the **double-tap modifier** activation pattern (we appear to use combo-only); deep-link `agi://` URI scheme (likely already exists but I didn't see a registration in scope); menu-bar quick-entry component.
**Effort.** **S.**

### 2.6 PlansModal / Pricing (S, content)

**Files.** `Pricing/PlansModal.tsx:1-50`, `Pricing/PlanCard.tsx:1-40`.
**Claude has** Plans page with `Individual` / `Team and Enterprise` tab toggle, **billing toggle Monthly | Yearly · Save 17%**, three cards (Max, Pro, Free) with feature checklists (`ui-02-claude-desktop.md:283-298`). Footer: `*Usage limits apply. Prices shown don't include applicable tax.`
**We have** `TIER_ORDER: ['local', 'byok', 'hobby', 'pro', 'max']` (`PlansModal.tsx:35`) — five tiers, **but**: no `Individual` / `Team` tab toggle; no annual-vs-monthly toggle; no `Save 17%` chip; no per-tier feature checklist matching the gold-standard; per-card formatting differs (verified by `PlanCard.tsx:17-40` TIER_CONTENT shape).
**Effort.** **S.**

### 2.7 ROIDashboard / OutcomesDashboard (S, polish)

**Files.** `ROIDashboard/components/RealtimeROIDashboard.tsx:1-60`, `Outcomes/OutcomesDashboard.tsx:1-50`.
**Claude has** Settings → Usage with: 5-hour-window usage bar, weekly all-model usage bar (Pro/Max/Team), separate Sonnet weekly bar (Max/Team Premium), Claude Code usage rollup (`anthropic-claude-suite-may-2026.md:55`).
**We have** today/week/month/all PeriodStats with employee/automation/cost/time-saved KPIs. **Behind on**: 5-hour rolling-window usage bar (Anthropic's signature surface); per-model weekly cap visualization; separate-bar pattern for Sonnet vs Opus.
**Effort.** **S.**

### 2.8 MarketplacePage (S, content)

**Files.** `Marketplace/MarketplacePage.tsx:1-60`, `Marketplace/components/WorkflowCard.tsx:1-60`.
**Claude has** the Plugin Marketplace UX: `claude plugin marketplace add <repo>` plus directory site reporting **4,200+ skills, 770+ MCP servers, 2,500+ marketplaces** (May 7 2026 snapshot) (`anthropic-claude-suite-may-2026.md:323-325`).
**We have** Discover / My-Workflows / My-Clones / Favorites / Publish tabs for our `published_workflows` table; **behind on**: no plugin-marketplace addition flow (`/plugin marketplace add <repo>` analog); no per-skill marketplace registry equivalent; no `(By Anthropic)`-style first-party suffix.
**Effort.** **S.**

### 2.9 Mobile Companion (S)

**Files.** `Mobile/QRPairingCard.tsx:1-50`, `Mobile/RemoteApprovalCard.tsx:1-50`, `Mobile/MobileCompanionPanel.tsx:1-50`.
**Claude has** Dispatch — phone↔desktop persistent thread for Cowork, paired via QR in the Cowork sidebar with access-level pick (files only / browser / full computer use) and 30-minute approval re-prompt (`anthropic-claude-suite-may-2026.md:383-386`). Dispatch is a _single-thread persistent conversation_ on phone executing on desktop.
**We have** QRPairingCard (with `qrcode` lib lines 1-3, status states) + RemoteApprovalCard with 30s auto-deny (`RemoteApprovalCard.tsx:11`, AUTO_DENY_SECONDS = 30). **Behind on**: 30-minute approval re-prompt for Dispatch sessions (we use 30s blanket); no access-level pick at pairing time (files-only / browser / full); no live tool-call feed mirrored to phone.
**Effort.** **S.**

### 2.10 Computer Use settings (S–M)

**File.** `Settings/ComputerUseSettings.tsx:1-50`.
**Claude has** Per-app permissions with **denied-apps** default-block list (banking, crypto, healthcare), `Allow Claude to use [App]` per-app prompts, "Unhide apps when Claude finishes" toggle (`anthropic-claude-suite-may-2026.md:130-131, 568-569`). Server-side prompt-injection scan on screenshots + 30-min Dispatch re-prompt.
**We have** Allowed/Denied apps + hide-apps-on-task toggle + per-app permission registry (status: allowed/denied/ask_every_time) — the Stream 1 design. **Behind on**: explicit pre-shipped denied list of sensitive apps (banking/crypto/healthcare) — only manual entry; no on-screen prompt-injection probe stub; no Dispatch 30-min re-prompt token integration with `Mobile/RemoteApprovalCard.tsx`.
**Effort.** **S.**

### 2.11 OAuthCredentialsPanel + MCPCredentialManager (S)

**Files.** `Settings/OAuthCredentialsPanel.tsx` (out of scope, lookup only), `MCP/MCPCredentialManager.tsx:33-100`.
**Claude has** scope-tag chips on Claude Code auth tokens (e.g., `user:file_upload`, `user:inference`, `user:profile` in monospace pills, with trash icon to revoke per-row) (`ui-02-claude-desktop.md:166-168`).
**We have** OAUTH_PROVIDERS hard-coded to GitHub/Drive/Slack only (`MCPCredentialManager.tsx:33-52`). **Behind on**: scope-tag chips per token; trash-revoke per-row; missing major providers (Notion, Asana, Atlassian, Stripe, Vercel, Cloudflare, Linear, etc.) listed in Anthropic's 200+ directory.
**Effort.** **S.**

### 2.12 KeybindingsSettings (S, polish)

**File.** `Settings/KeybindingsSettings.tsx:1-50`.
**Claude has** comprehensive keybindings via `~/.claude/keybindings.json` overrides, `formatComboDisplay` and per-action keymap with capture-via-keydown (we already have this). `useKeybinding(action, fn, scope)` is the universal primitive in Claude Code (`deep/c1-components-chunk-1.md:6`).
**We have** parseCombo / serializeCombo / DEFAULT_SHORTCUTS / category-grouped + conflict detection + reset-to-defaults — **strong parity here**. **Behind on**: per-shortcut "scope" (Confirmation / Settings / Chat) like Claude's `useKeybinding` second arg; "Tap Option twice" double-tap pattern as a special combo type; vim-mode keymap layer (from `misc2-keybindings-vim-voice-types.md`).
**Effort.** **S.**

### 2.13 ScreenCaptureButton + RegionSelector + WindowSelector (S, polish)

**Files.** `ScreenCapture/ScreenCaptureButton.tsx:1-60`, `RegionSelector.tsx`, `WindowSelector.tsx`, `OCRViewer.tsx`.
**Claude has** Computer Use screenshot tool + OCR extraction; screenshots up to 2576 px on the long edge for Opus 4.7 (`anthropic-claude-suite-may-2026.md:560`). Server-side prompt-injection probe on OCR'd content.
**We have** Mac native picker via `useNativeDesktopPicker` (`ScreenCaptureButton.tsx:50`); region/window selector. **Behind on**: pre-OCR injection-probe disclosure to user; explicit max-resolution checks at 2576 px; "redact sensitive area" pre-send overlay.
**Effort.** **S.**

### 2.14 InstructionFilesSettings — instructional-file aggregator (S)

**File.** `Settings/InstructionFilesSettings.tsx:22-30`.
**Claude has** auto-discovery of `~/.claude/CLAUDE.md` (user), `.claude/CLAUDE.md` (project), `./CLAUDE.md` (current dir) (`anthropic-claude-suite-may-2026.md:312`).
**We have** A 7-pattern detection table (`CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`) — actually broader than Claude. **Strong parity / overshoot.** Behind on: priority-based merge ordering (we have priority numbers but no merge UX); no per-file "imported into context" indicator.
**Effort.** **S.**

### 2.15 CustomModelsSettings (S, content)

**File.** `Settings/CustomModelsSettings.tsx:40-50`.
**Claude has** Anthropic-only models (Opus/Sonnet/Haiku) — N/A for us.
**We have** PROVIDER_PRESETS for Ollama/LM Studio/vLLM/Groq/OpenRouter/Together/Fireworks/Mistral/DeepSeek/NVIDIA NIM. **Strong differentiator.** Behind on: provider-specific OAuth (vs API-key only); per-provider catalog refresh; cost-per-1M-tokens table — we have CostEstimator separately.
**Effort.** **S.**

### 2.16 MasterPasswordSettings (M, security parity)

**File.** `Settings/MasterPasswordSettings.tsx:1-50`.
**Claude has** Anthropic stores OAuth tokens in OS keychain (CLI), or in their cloud (web/mobile). No "master password" concept — they rely on OS keychain.
**We have** Master password gates the credential vault (status / setup / unlock / change / migration views). **Stronger than Claude on local-mode** but **behind on**: zero-knowledge key derivation export; recovery code generation; bio-unlock parity.
**Effort.** **M.**

### 2.17 ProductivityWorkspace + MessagingIntegrations (S–M, MCP-able)

**Files.** `Productivity/ProductivityWorkspace.tsx:1-50`, `Messaging/MessagingIntegrations.tsx:1-50`.
**Claude has** these are **connectors** (Notion, Asana, Slack, Gmail, Calendar) routed through MCP; no dedicated "Productivity" tab — they live in the Customize → Connectors panel (`anthropic-claude-suite-may-2026.md:73-75`).
**We have** dedicated Notion/Trello/Asana picker in `ProductivityWorkspace.tsx:29-33` and Slack/WhatsApp/Teams in `MessagingIntegrations.tsx:11-41`. **Different model** — we route via direct API rather than MCP. Behind on Claude's pattern: connectors marked **Interactive** rendering live UI in chat (MCP Apps spec, Jan 26 2026 launch partners include Asana, Slack — `anthropic-claude-suite-may-2026.md:75`); we have `MCP/MCPAppRenderer.tsx` etc. but not yet wired to Productivity / Messaging.
**Effort.** **S–M.**

### 2.18 ResourceMonitor (S, polish)

**File.** `ResourceMonitor/index.tsx:1-50`.
**Claude has** none directly — Anthropic does not surface VM/CPU/RAM in-app (community reports VM ~2 vCPU / 1.8–2 GB but no UI exists — `anthropic-claude-suite-may-2026.md:189-191`).
**We have** CPU / Memory / Network / Storage gauges + available-tools list. **Strong overshoot.** No gap.
**Effort.** **None.**

### 2.19 ROIDashboard (S, novel)

**File.** `ROIDashboard/components/RealtimeROIDashboard.tsx:1-60`.
**Claude has** Settings → Usage limit bars only — no ROI / time-saved framing.
**We have** today/week/month/all + per-employee performance + total time/cost saved. **Strong overshoot — novel surface.** No gap on the Claude axis.
**Effort.** **None.**

### 2.20 OfflineIndicator (S, polish)

**File.** `OfflineIndicator.tsx`.
**Claude has** explicit offline behavior on mobile: "No offline. Cached chat history viewable; all sends require network" (`anthropic-claude-suite-may-2026.md:388`). Desktop has no special offline UX captured.
**We have** A network-aware indicator. **Strong parity.** No gap.
**Effort.** **None.**

### 2.21 Memory Importance Indicator + Search (S, polish)

**Files.** `Memory/MemoryImportanceIndicator.tsx`, `Memory/MemorySearch.tsx`, `Memory/MemoryBadge.tsx`.
**Claude has** No public per-fact importance score — Memory is a synthesized profile (`anthropic-claude-suite-may-2026.md:675`).
**We have** Per-memory star-importance + topic-search + category-filter — **richer than Claude.** Behind on: "Used in last N conversations" inference signal; auto-decay on unused memory.
**Effort.** **S.**

### 2.22 NotificationCenter Cowork-aware deep-links (S)

**File.** `Notifications/NotificationCenter.tsx:1-60`.
**Claude has** notifications carry deep-link `claude://` + task name (`anthropic-claude-suite-may-2026.md:381`).
**We have** Bell+priority types but no `agi://` deep-link resolver wired in scope.
**Effort.** **S.**

---

## 3. Per-axis percentage estimate (approximate, for scope 151..300)

I rate each Claude Desktop axis we'd be measured on (0% = nothing in scope, 100% = parity or overshoot in scope). Numbers are intentionally calibrated to _this specific 150-file slice_, not the whole desktop app.

| Axis                                         | %         | Notes                                                                                                                                              |
| -------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cowork tab (autonomous tasks)                | **5%**    | `Planning/PlanPreview.tsx` is a one-shot preview only; no Tasks list, no VM status, no allowlist editor.                                           |
| Cowork onboarding                            | **20%**   | `OnboardingWizard.tsx` covers mode pick + BYOK paste + Ollama probe — but missing 4 of 5 Cowork-specific steps.                                    |
| Connector directory (modal-not-route)        | **35%**   | `MCPServerBrowser.tsx`/`MCPBundleBrowser.tsx` render lists but lack 5-chip taxonomy, three-pill filters, modal overlay summon.                     |
| Per-tool 3-glyph permission grid             | **10%**   | `AutomationPermissionsSettings` is OS-level, not per-tool. No category/per-tool override matrix.                                                   |
| Pre-connect transparency page                | **30%**   | `MCPServerBrowser` ServerDetailsDialog has rating/tools but no use-case cards / vendor link / trust disclaimer.                                    |
| Memory (account / project / import)          | **70%**   | 13 Memory files cover global Memory CRUD, badges, search, importance, viewer, save-button. Missing: project-scope, cross-AI prompt-vending import. |
| Skills authoring view                        | **40%**   | `SkillsPluginsSettings.tsx` lists installed; no per-skill detail right-pane with allowed-tools chip strip + Markdown body.                         |
| Hooks editor                                 | **0%**    | No hooks-editor in scope.                                                                                                                          |
| Plan mode UI                                 | **30%**   | `PlanPreview.tsx` is single-shot; no library, no version history, no editor integration.                                                           |
| Computer Use settings                        | **80%**   | Allowed/denied + hide-on-task + model picker — strong; miss default-deny app list, prompt-injection probe stub.                                    |
| Schedules / Cowork schedule                  | **70%**   | Daily/Weekly/Monthly/Custom present; missing schedule-from-chat, awake-required precondition, Cowork link.                                         |
| Notification preferences                     | **40%**   | NotificationCenter has tabs/priority but no Response-completions toggle, no Cowork-typed channels, no `agi://` deep-link.                          |
| Quick-access global hotkey                   | **70%**   | Combo capture + hotkey enabled toggle; missing double-tap "Tap Option twice" pattern + Voice shortcut + Menu-bar toggle.                           |
| Active sessions list                         | **0%**    | None in scope.                                                                                                                                     |
| Style picker                                 | **0%**    | None in scope (CustomInstructionsSettings is global instructions only).                                                                            |
| Tool-access mode (Load on demand vs preload) | **0%**    | No analog.                                                                                                                                         |
| Marketplace (Plugins/Skills/Workflows)       | **55%**   | `MarketplacePage.tsx` ships Workflows; no plugin/skill marketplace add-from-repo flow.                                                             |
| Pricing modal                                | **70%**   | 5 tiers shipped; missing Monthly/Yearly toggle + Individual/Team tab + Save 17% chip.                                                              |
| Mobile Dispatch                              | **75%**   | QR + RemoteApprovalCard + MobileCompanionPanel — strong. Missing access-level pick at pairing + 30-min re-prompt + live feed mirror.               |
| Voice mode polish                            | **30%**   | Mic-icon-only in QuickQuery; no multi-voice picker; no global hotkey for voice.                                                                    |
| Dotfile / config editor                      | **80%**   | `DotfileSettings.tsx` config-editor present; missing per-file priority merge UX + "imported" badge.                                                |
| Master password / vault                      | **110%**  | Stronger than Claude — we have MasterPasswordSettings; Claude relies on OS keychain only.                                                          |
| Resource monitor                             | **120%**  | Stronger than Claude — we ship CPU/RAM/Network/Storage gauges + available tools; Claude has none.                                                  |
| ROI / Outcomes                               | **120%**  | Stronger than Claude — novel surfaces; Claude has only Usage bars.                                                                                 |
| Allowed directories                          | **90%**   | `AllowedDirectoriesSettings.tsx` matches Claude's Filesystem-connector pattern. Missing per-connector binding and reusable template.               |
| Per-MCP `running` pill                       | **30%**   | Logs viewer + connection status exist, but per-server `running` pill on each managed server is missing.                                            |
| Drag-zone for `.MCPB`/`.DXT`                 | **0%**    | Not in `ExtensionsSettings.tsx` even though we have `MCPBundleBrowser`.                                                                            |
| **Composite (this scope only)**              | **≈ 47%** | Anchored on the gold-standard Claude Desktop / Cowork surfaces.                                                                                    |

---

## 4. Highest-leverage builds (sorted by ROI within scope)

1. **Cowork tab + Tasks list + VM status pill (XL).** Single biggest gap. Owns axis 1.1, 1.4, 1.14, 1.23, 2.3, 2.10. Without it our "differentiator #1: multi-provider in one UI" gets out-positioned by Anthropic's Cowork autonomy.
2. **Per-tool 3-glyph permission grid (M).** Unique gold-standard UX. Lifts axes 1.6, 1.7, 1.18 simultaneously. Pairs with ConnectorPermissionsEditor.tsx new file.
3. **Hooks editor (M).** New `Settings/HooksEditor.tsx`. Closes 1.24 and unlocks settings.json hook authoring without forcing JSON edit.
4. **Connector directory modal + 5-chip taxonomy (L).** Lifts axes 1.5 + 2.8. Reuse `MCP/MCPServerCard.tsx` as base; new `MCP/ConnectorDirectoryModal.tsx`.
5. **Active sessions list (S).** Fast win. New `Settings/ActiveSessionsList.tsx` reading from auth store. Closes 1.16, 1.19.
6. **Pre-connect transparency page (S).** Trust-aware; cheap differentiator. Closes 1.7.
7. **Memory project-scope + cross-AI import prompt-vendor (S+M).** Closes 1.2, 1.4. Upgrade memoryStore key shape; new MemoryProviderImportPrompt.
8. **Per-MCP `running` pill (S).** Closes 1.10. Tiny LOC, big UX.
9. **PlansModal Monthly/Yearly toggle + Save 17% chip + Individual/Team tab (S).** Closes 2.6.
10. **Drag-zone for `.MCPB`/`.DXT` in ExtensionsSettings (S).** Closes 1.9.

---

## 5. Total effort estimate

- **MISSING (1.1–1.26):** 1×XL, 0×L (1.5 covered separately), 4×M, 21×S → ≈ 7–10 weeks of focused desktop-frontend work for the missing surfaces.
- **PARTIAL (2.1–2.22):** 4×M, 17×S, 3 already overshoot → ≈ 4–6 weeks to hit parity on partials.
- **Combined, this slice:** ≈ **11–16 weeks** to reach Claude Desktop / Cowork parity within entries 151..300. Can parallelize if the Cowork tab (XL) is split into a 4-person team.

---

## 6. Notes / caveats

- **OnboardingWizard** has been deliberately consolidated (`OnboardingWelcome.tsx:1-7` re-exports it). Don't reintroduce a multi-step wizard for general onboarding — but DO add a separate `Cowork/CoworkOnboardingWizard.tsx`.
- **MarketplacePage** is _workflows_, not plugins/skills. They could share a tab; budget extra for the IA refactor.
- **Settings/SettingsPanel** is the orchestration host (out of scope, entry > 300) — every new Settings panel I propose adds a tab there.
- The `Pricing/PlansModal.tsx:35` `TIER_ORDER` already includes `local` ahead of `byok`, which is the correct order for a Local-mode-first launch — the current pricing label/toggle UX is the only gap.
- `MasterPasswordSettings`, `ResourceMonitor`, `ROIDashboard`, `OutcomesDashboard`, `MessagingIntegrations`, `ProductivityWorkforce` are surfaces **Claude does not ship at all**. Don't regress these — they're our differentiation surface.
- **`models.json` rule (LOCKED)** still applies — every new component above must read model IDs from the catalog, not hardcode (`CLAUDE.md` rule #1). The two `Settings/CustomModelsSettings.tsx` and `Settings/ComputerUseSettings.tsx` panels already follow this; new panels should match.

---

_End of GAP-D5 — Desktop Components 151..300._

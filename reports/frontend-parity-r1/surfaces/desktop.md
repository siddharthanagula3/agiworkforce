# desktop current state

**Frontend tree root**: `apps/desktop/src/`
**Approximate component count / file count**: ~1,024 .ts/.tsx files; 97 component subdirs; 84 stores; 55 hooks; 12 i18n locales

---

## Per-category inventory

#### 1. APP SHELL

HAS:

- Left sidebar with collapsed/expanded states — `UnifiedAgenticChat/Sidebar.tsx`
- Title bar (traffic lights + drag region) — `Layout/TitleBar.tsx`
- Status bar (provider, model, token usage, online/offline) — `Layout/StatusBar.tsx`
- Budget status widget in status bar — `Layout/BudgetStatusWidget.tsx`
- User profile popover pinned to sidebar footer — `Layout/UserProfile.tsx`
- Window manager with popout/mini-window support — `hooks/useWindowManager.ts` + `windowStore.ts`
- Floating chat overlay (separate mini window) — `components/FloatingChat/index.tsx`
- Quick-query overlay — `components/QuickQuery/`
- Offline indicator banner — `components/OfflineIndicator.tsx`
- Status banner (degraded-state) — `components/StatusBanner.tsx`
- Error toast container — `components/Errors/ErrorToast`
- Tauri v2 native window chrome (macOS/Windows/Linux)

PARTIAL:

- Multi-window support exists via `useWindowManager` but no tab-per-conversation pattern (single-window active chat)
- No native macOS traffic-light integration in sidebar (sidebar collapsed state uses icon-only, not popover tabs)

#### 2. ONBOARDING / AUTH

HAS:

- Single onboarding flow — `OnboardingWizard.tsx` (mode + API key entry combined)
- Welcome screen — `OnboardingWelcome.tsx`
- Auth form (email/password + OAuth) — `Auth/AuthForm.tsx`
- Auth page wrapper — `Auth/AuthPage.tsx`
- Supabase OAuth via `services/supabaseAuth.ts`
- Deep-link handling for OAuth browser redirect — `hooks/useDeepLink.ts`
- Session persistence/restore — `hooks/useSessionPersistence.ts`
- Auth state machine — `stores/authOrchestrator.ts`

PARTIAL:

- No device-flow (browser fallback for CLI-style auth) — Auth flow requires a webview
- Post-signin permissions overview (automation, computer use) surfaced via `AutomationPermissionsModal` but not wired into onboarding sequence

#### 3. EMPTY STATE

HAS:

- `AdvancedEmptyState.tsx` and `SimpleEmptyState.tsx` in `UnifiedAgenticChat/`
- `BrandedGreeting.tsx` — animated welcome with brand name
- `QuickStartPills.tsx` — suggested prompt chips
- `PromptSuggestions.tsx` / `PromptSuggestionsDropdown.tsx`
- Generic `ui/EmptyState.tsx` primitive reused across galleries

PARTIAL:

- Empty state copy framing is productivity-first ("What can I help with?") per product strategy, but `BrandedGreeting.tsx` content needs to be verified matches locked tagline — not audited at code level here
- No illustration assets wired in (Lucide icons used instead, which is correct per design-tokens policy)
- Model badge placement in empty state not confirmed present

#### 4. COMPOSER

HAS:

- Multi-line text input — `ChatInputArea.tsx`
- Attachment menu (PlusMenu popover) with: file picker (Tauri dialog), folder selection, screen capture, web search toggle, prompt stash, tools panel — `PlusMenu.tsx`
- ScreenCapture via Tauri — `ScreenCapture/ScreenCaptureButton.tsx`
- Model selector button — `QuickModelSelector.tsx`, `ModelSelectorButton.tsx`
- Voice input button — `VoiceInputButton.tsx` (in composer)
- Voice recording overlay — `Voice/VoiceInputOverlay.tsx`
- Voice hotkey hook — `hooks/useVoiceHotkey.ts`
- Whisper transcription — `hooks/useVoiceTranscription.ts`
- Slash command palette — `SlashCommandMenu.tsx` + `hooks/useSlashCommands.ts` + `useSlashCommandAutocomplete.ts`
- File mention picker (`@file`) — `FileMentionPicker.tsx`
- Skill mention picker — `SkillMentionPicker.tsx`
- Send / stop buttons — `SendButton.tsx`
- Token counter — `TokenCounter.tsx`
- Input toolbar with tool toggles — `ChatInputToolbar.tsx` / `InputToolbar.tsx`
- Incognito (temp chat) toggle — `IncognitoToggle.tsx`
- Focus selector (mode switcher) — `FocusSelector.tsx`
- Drag-and-drop overlay — `DragDropOverlay.tsx` / `DragOverlay.tsx`
- Prompt stash (save/load prompts) — `PromptStash.tsx` + `promptStashStore.ts`
- Speed/quality selector — `SpeedQualitySelector.tsx`
- Agent mode switcher — `AgentModeSwitcher.tsx`

PARTIAL:

- No cloud-drives (Google Drive, OneDrive) attachment option — only local filesystem + folder
- No "notebook" attachment type
- No @-mention for people/teammates (only @file, @skill)
- Citations toggle not present in composer (citations rendered in output only)
- Voice has no pause/resume in recording — push-to-talk hotkey only; no record lifecycle modal

#### 5. CHAT / MESSAGES

HAS:

- User message bubble — `MessageBubble/MessageBubble.tsx` + `MessageContent.tsx`
- Assistant message bubble with streaming — `ChatStream.tsx`
- Thinking/reasoning blocks (collapsed/expanded, auto-collapse after stream) — `ThinkingBlock.tsx` + `ReasoningAccordion.tsx` (with clock/duration display)
- Inline tool-use rendering with expandable card — `ToolCallCard.tsx` (in `MessageBubble/` and top-level)
- Inline search results — `InlineSearchResults.tsx`
- Source pill row and sources footer — `SourcePillRow.tsx`, `SourcesFooter.tsx`, `CitationBadge.tsx`
- Message attachments inline — `MessageAttachments.tsx`
- Message actions: copy, bookmark, regenerate (RotateCw), edit, delete, react (emoji), fork (GitFork), TTS (Volume2), save-to-memory — `MessageActions.tsx`
- Reaction picker — `useMessageReactions.ts`
- Editable message — `EditableMessage.tsx`
- Branch navigator — `BranchNavigator.tsx`
- Checkpoint manager — `CheckpointManager.tsx`
- Rewind timeline — `RewindTimeline.tsx`
- Inline tool results (20+ types): terminal, git, code diff, media gen, database, agent card, artifact card, screenshot, voice, computer use, memory, schedule, skill, search, doc, vision, LSP, marketplace, swarm, todo — `InlineToolResults/`
- Inline panels (browser, code, database, image, terminal) — `InlinePanels/`
- Approval request card — `Cards/ApprovalRequestCard.tsx`
- Computer use action card — `Cards/ComputerUseActionCard.tsx`
- File operation card, screenshot card, terminal command card — `Cards/`
- Pending messages bubbles — `PendingMessagesBubbles.tsx`
- Scroll-to-bottom (implemented in `ChatStream.tsx` scroll listener)
- Inline suggestion (autocomplete) — `InlineSuggestion.tsx`
- Follow-up suggestions — `MessageBubble/FollowUpSuggestions.tsx`
- Agentic loop status bar — `AgenticLoopStatusBar.tsx`
- Agent progress footer — `AgentProgressFooter.tsx`
- Message runtime activity — `MessageRuntimeActivity.tsx`

PARTIAL:

- No A/B comparison side-by-side layout (ModelComparison exists in Settings for model eval, not in chat flow)
- No inline web search results with favicons (source pills exist but no favicon rendering confirmed)
- Scroll-to-bottom FAB (floating action button) not a standalone component — inline in `ChatStream.tsx`

#### 6. ARTIFACTS / SIDEBAR

HAS:

- Artifact panel — `Artifacts/ArtifactPanel.tsx`
- Artifact renderer view — `Artifacts/ArtifactRendererView.tsx`
- Artifact toolbar — `Artifacts/ArtifactToolbar.tsx`
- Artifact gallery — `Artifacts/ArtifactsGallery.tsx`
- Artifact category filter — `Artifacts/ArtifactCategoryFilter.tsx`
- Version history — `Artifacts/ArtifactVersionHistory.tsx` + `VersionHistoryDialog.tsx`
- Share artifact dialog — `Artifacts/ShareArtifactDialog.tsx`
- Inline artifact editor — `Artifacts/InlineArtifactEditor.tsx`
- Artifact types: HTML (`HtmlArtifact.tsx`), Markdown (`MarkdownArtifact.tsx`), code (`CodeArtifact.tsx`), chart (`ChartArtifact.tsx`), SVG (`SvgArtifact.tsx`), Mermaid (`MermaidArtifact.tsx`), table (`TableArtifact.tsx`), spreadsheet (`SpreadsheetArtifact.tsx`), presentation (`PresentationArtifact.tsx`), React preview (`ReactPreview.tsx`)
- Artifact renderer (unified) — `UnifiedAgenticChat/ArtifactRenderer.tsx`
- Artifacts view (gallery in chat context) — `ArtifactsView.tsx`
- Dynamic sidecar panel — `DynamicSidecar.tsx`
- Sidecar sub-panels: code canvas, terminal view, diff viewer — `Sidecar/`
- Inline artifact card in tool results — `InlineToolResults/InlineArtifactCard.tsx`

PARTIAL:

- Split-pane vs popout not confirmed — `ArtifactPanel` may be sidebar-only; popout state not verified
- No "Download all artifacts" multi-card UI confirmed
- Dark-mode artifact preview not confirmed (theme tokens applied globally)

#### 7. PROJECTS / SPACES

HAS:

- Projects view — `UnifiedAgenticChat/ProjectsView.tsx`
- Project settings dialog — `UnifiedAgenticChat/ProjectSettingsDialog.tsx`
- Project store — `stores/projectStore.ts`
- Project memory store — `stores/projectMemoryStore.ts`
- Folder selector (maps to project workspace root) — `FolderSelector.tsx`
- Tasks view — `TasksView.tsx`

PARTIAL:

- No gallery grid view for projects (ProjectsView exists but layout not confirmed as card grid)
- No "Sources / Knowledge" tab within a project detail view — knowledge base under `features/experimental/KnowledgeBaseViewer/`
- Project-level system prompt: present via `CustomInstructions` settings but not surfaced in project detail view tab
- No project creation modal with presets

#### 8. CONNECTORS / TOOLS / SKILLS

HAS:

- Connector gallery — `Connectors/ConnectorGallery.tsx` + `ConnectorsGallery.tsx`
- Connector card — `Connectors/ConnectorCard.tsx` + `OAuthConnectorCard.tsx`
- Connector detail view — `Connectors/ConnectorDetailView.tsx`
- OAuth flow — `Connectors/ConnectorOAuthFlow.tsx`
- API key dialog — `Connectors/ConnectorApiKeyDialog.tsx`
- Connector health dashboard — `Connectors/ConnectorHealthDashboard.tsx`
- Skill marketplace — `SkillMarketplace/SkillMarketplace.tsx` with `SkillCard.tsx`, `SkillCategoryFilter.tsx`, `SkillSearchBar.tsx`
- Skill mention in composer — `SkillMentionPicker.tsx`
- Skills/plugins settings — `Settings/SkillsPluginsSettings.tsx`
- MCP: full suite — `MCP/MCPServerManager.tsx`, `MCPToolBrowser.tsx`, `MCPToolExplorer.tsx`, `MCPAppGallery.tsx`, `MCPBundleBrowser.tsx`, `MCPServerCard.tsx`, `MCPConfigEditor.tsx`, `MCPLogsViewer.tsx`, `MCPConnectionStatus.tsx`, `MCPCredentialManager.tsx`, `MCPWorkspace.tsx`
- Connector discovery bar — `ConnectorDiscoveryBar.tsx`
- Tools panel — `components/Tools/ToolsPanel.tsx`
- Marketplace (workflows/agents) — `Marketplace/`

PARTIAL:

- Per-permission toggles in connector detail not confirmed (UI exists but toggle granularity unknown)
- Slash-command for installed skills exists (`SkillMentionPicker`) but full inline invocation flow not confirmed
- No sidebar submenu for connector/plugin toggles (settings-based only)

#### 9. SETTINGS

HAS (left-nav tabs via `Settings/tabs/`):

- General — `tabs/General/`
- Account — `tabs/Account/`
- Appearance — `tabs/Appearance/` (theme presets: 15 presets including catppuccin, dracula, nord, tokyo-night, rose-pine, solarized, etc.; custom theme editor; font selector; dyslexic font toggle)
- Privacy — `tabs/Privacy/` + `FeaturesPrivacySettings.tsx`
- Capabilities — `CapabilitiesSettings.tsx`
- Connectors — `tabs/Connectors/`
- General — `GeneralSettings.tsx`
- Models/Keys — `tabs/ModelsKeys/`
- Notifications — `NotificationsSettings.tsx`
- MCP Servers — `MCPServerSettings.tsx` + `MCPToolsSettings.tsx`
- Voice — `tabs/Voice/` + `VoiceSettings.tsx` + `VoicePersonaSelector.tsx`
- Agents — `tabs/Agents/` + `AgentsSettings.tsx` + `CustomAgentsList.tsx` + `CustomAgentEditor.tsx`
- Personalization — `PersonalizationSettings.tsx`
- Custom Instructions — `CustomInstructionsSettings.tsx`
- Computer Use — `ComputerUseSettings.tsx`
- Automation Permissions — `AutomationPermissionsSettings.tsx`
- Keybindings — `KeybindingsSettings.tsx`
- Extensions — `ExtensionsSettings.tsx`
- Usage / Billing — `UsageDashboard.tsx` + `UsageProgressBars.tsx` + `CostEstimator.tsx`
- Cache Management — `CacheManagement.tsx`
- Research — `ResearchSettings.tsx`
- Task Routing — `TaskRoutingSettings.tsx`
- Custom Models — `CustomModelsSettings.tsx`
- Agent Execution — `AgentExecutionSettings.tsx`
- Dotfile — `DotfileSettings.tsx`
- Master Password / Vault — `MasterPasswordSettings.tsx`
- Model Comparison — `ModelComparison.tsx`
- Theme Editor — `ThemeEditorDialog.tsx`
- Favorite Models — `FavoriteModelsSelector.tsx`
- Analytics — `AnalyticsSettings.tsx`
- Team Account — `TeamAccountSettings.tsx`

PARTIAL:

- No dedicated "Git" or "Worktrees" or "Environments" settings tab (git is surfaced via `useGit.ts` hook in chat context, not a settings section)
- No "Archived conversations" settings tab (archiving may be in chat sidebar)
- Developer tab not confirmed as a labeled section

#### 10. PROFILE / USER POPOVER

HAS:

- User popover — `Layout/UserProfile.tsx` (Radix Popover)
- Account info row: avatar (image or initials fallback), display name, email
- Plan/tier badge — `planDisplayName` from `useAccountStore`; loading spinner during tier fetch
- Settings link — opens `SettingsPanel` via `useSettingsDialogStore`
- Keyboard shortcuts link — `openShortcuts` action
- Theme toggle (light/dark/system) — inline radio in popover
- Language picker (12 locales) — inline select in popover
- Log out action
- Connectors link (`Plug` icon)

PARTIAL:

- No explicit "Upgrade" CTA in popover (PlansModal is triggered elsewhere in app)
- No Zoom/font size controls in popover (font settings are in Appearance settings)

#### 11. MODEL / MODE FEATURES

HAS:

- Model selector — `QuickModelSelector.tsx` / `ModelSelectorButton.tsx` / `Settings/ModelSelector.tsx`
- Model tier selector — `ModelTierSelector.tsx`
- Speed/quality selector — `SpeedQualitySelector.tsx`
- Agent mode switcher — `AgentModeSwitcher.tsx`
- Reasoning accordion (with duration/clock display) — `ReasoningAccordion.tsx`
- Thinking block (auto-collapse post-stream) — `ThinkingBlock.tsx`
- Focus selector — `FocusSelector.tsx`
- Quick answer toggle — `QuickAnswerToggle.tsx`
- Active mode tags — `ActiveModeTags.tsx`
- Plan mode — store/types reference in `chat/types.ts` and `constants/planModels.ts`
- Auto-routing / task routing — `Settings/TaskRoutingSettings.tsx` + store
- Model capabilities detection — `hooks/useModelCapabilities.ts`
- Model store — `stores/modelStore.ts`
- Custom models settings — `CustomModelsSettings.tsx`
- Favorite models — `FavoriteModelsSelector.tsx`

PARTIAL:

- No explicit reasoning effort selector (low/med/high) as a UI widget — `SpeedQualitySelector` may serve this role but is not labeled "reasoning effort"
- No "per-mode model changed" banner confirmed (banner infrastructure exists via `StatusBanner`)
- No region/routing toggle in UI (routing is configured in TaskRoutingSettings but no runtime US-only toggle visible in chat)

#### 12. PRICING / UPGRADE

HAS:

- Plans modal — `Pricing/PlansModal.tsx`
- Plan card — `Pricing/PlanCard.tsx`
- Subscription gate — `Subscription/SubscriptionGate.tsx`
- Subscription lock dialog — `Subscription/SubscriptionLockDialog.tsx`
- Usage limit banner — `UnifiedAgenticChat/UsageLimitBanner.tsx`
- Billing store — `stores/billing/subscriptionSlice.ts` + `billingUsage.ts`
- Tier bridge hook — `hooks/useTierBridge.ts`
- Credit refresh hook — `hooks/useCreditRefresh.ts`
- Usage dashboard — `Settings/UsageDashboard.tsx` + `UsageProgressBars.tsx`
- Budget tracker — `UnifiedAgenticChat/BudgetTracker.tsx`
- Budget alerts panel — `BudgetAlertsPanel.tsx`
- Cost estimator — `Settings/CostEstimator.tsx`
- Pricing constants — `constants/pricing.ts`

PARTIAL:

- No individual vs team/enterprise tab in PlansModal confirmed (single plans comparison)
- No "weekly limit countdown" UI component (usage limit banner exists but weekly countdown clock not confirmed)
- No inline "auto-refill credits" toggle (billing is subscription-based, not credit-based on desktop)

#### 13. ADMIN / ENTERPRISE

HAS:

- Team settings — `Teams/TeamSettings.tsx`
- Team dashboard — `Teams/TeamDashboard.tsx`
- Team member list — `Teams/TeamMemberList.tsx`
- Team activity log — `Teams/TeamActivityLog.tsx`
- Team invitation — `Teams/TeamInvitation.tsx`
- Team account settings — `Settings/TeamAccountSettings.tsx`
- Team store — `stores/teamStore.ts`
- Governance store — `stores/governanceStore.ts`

PARTIAL:

- No SSO setup UI (enterprise SSO surfaced via Supabase Auth, no dedicated settings panel)
- No seat management / license count UI
- No organization-wide model availability controls (model settings are per-user, not per-org)
- Audit log is team activity log only, not a full security audit log

#### 14. MOBILE / COMPACT MODE

HAS:

- Floating chat (compact overlay window) — `components/FloatingChat/index.tsx`
- Quick query overlay — `components/QuickQuery/`
- Responsive container primitive — `ui/ResponsiveContainer.tsx`
- Mobile companion panel (experimental) — `features/experimental/MobileCompanionPanel.tsx`
- Window manager with size tracking — `hooks/useWindowManager.ts`

PARTIAL:

- Floating chat is a Tauri popout window, not a narrow-width responsive layout
- No bottom-sheet model picker (desktop uses popover)
- No full-screen modal pattern for narrow width
- No edge-swipe navigation (desktop-native window chrome)
- Compact mode = popout window only; no responsive collapse of composer

#### 15. AGENTIC / COMPUTER USE

HAS:

- Computer use monitor — `ComputerUse/ComputerUseMonitor.tsx` (active/inactive status, start/stop)
- Screen preview — `ComputerUse/ScreenPreview.tsx`
- Action log — `ComputerUse/ActionLog.tsx`
- Computer use app permission dialog — `ComputerUse/ComputerUseAppPermissionDialog.tsx`
- Computer use consent dialog — `Settings/ComputerUseConsentDialog.tsx`
- Computer use settings — `Settings/ComputerUseSettings.tsx`
- Computer use store — `stores/computerUseStore.ts`
- Approval request card — `UnifiedAgenticChat/Cards/ApprovalRequestCard.tsx`
- Message approvals — `UnifiedAgenticChat/MessageApprovals.tsx`
- Risk confirmation dialog — `UnifiedAgenticChat/RiskConfirmationDialog.tsx`
- Execution sidecar — `ExecutionSidecar/ExecutionSidecar.tsx` + `ExecutionSidecarScreenView.tsx`
- Agentic loop status bar — `AgenticLoopStatusBar.tsx`
- Agent step timeline — `AgentStepTimeline.tsx`
- Subtask timeline — `SubtaskTimeline.tsx`
- Task phase section / timeline — `TaskPhaseSection.tsx`, `TaskPhaseTimeline.tsx`
- Agent task monitor — `AGI/AgentTaskMonitor.tsx`
- Agent task panel — `AGI/AgentTaskPanel.tsx`
- Iteration progress panel — `AGI/IterationProgressPanel.tsx`
- Reflection panel — `Execution/ReflectionPanel.tsx`
- Timeout warning dialog — `Execution/TimeoutWarningDialog.tsx`
- Automation permissions modal — `Settings/AutomationPermissionsModal.tsx`

PARTIAL:

- No explicit "Ask vs Act" mode toggle visible in composer (agentic mode is set via `AgentModeSwitcher`)
- No bypass-permissions warning banner distinct from `RiskConfirmationDialog`
- Sandbox/permissions mode cycle (shift-tab equivalent) not confirmed as a keyboard shortcut

#### 16. BROWSER EXTENSION UX

N/A: Desktop surface does not render the browser extension UI. The extension (MV3, `apps/extension/`) is a separate surface. Desktop exposes a bridge on port 8787 for the extension to communicate with it, but no in-desktop rendering of extension UX exists.

#### 17. VSCODE EXTENSION UX

N/A: Desktop surface does not render VS Code extension UI. The VS Code extension (`apps/extension-vscode/`) is a separate surface. Desktop bridge on port 8787 also handles VS Code extension communication, but VS Code chat UX is not rendered inside the desktop app.

#### 18. CLI / TUI UX

N/A: CLI/TUI (`apps/cli/`) is a fully separate Rust surface (Ratatui). The desktop app has no CLI or TUI rendering. Desktop does expose terminal execution via `Execution/InteractiveTerminal.tsx` and `Execution/TerminalPanel.tsx` (embedded terminal in sidecar), but these are agentic execution panels, not the CLI TUI.

---

## Component reuse opportunities

**Currently consumed from shared packages:**

- `@agiworkforce/unified-chat` — `ChatInterface` is the active chat entry point (lazy-imported in `App.tsx:80-84`); `UnifiedAgenticChat` components (CommandPalette, SearchModal) also imported from desktop-local `components/UnifiedAgenticChat/` but the package version is the canonical source
- `packages/design-tokens` — CSS custom properties for teal `#21808d` / terracotta `#da7756` palette applied via Tailwind config
- Lucide icons — single icon system throughout (no Heroicons, no FontAwesome)
- Radix UI primitives — Popover, Dialog, Tooltip etc. used via `components/ui/` wrappers

**One-off implementations that should migrate to shared packages:**

- `UnifiedAgenticChat/ThinkingBlock.tsx` and `ReasoningAccordion.tsx` — these duplicate functionality that `packages/unified-chat` should own; web surface likely has its own copy
- `UnifiedAgenticChat/ToolCallCard.tsx` + `InlineToolResults/*` — 20+ inline result renderers are desktop-only; mobile and web likely have gaps here
- `UnifiedAgenticChat/BranchNavigator.tsx` / `CheckpointManager.tsx` — agentic branching is desktop-specific; no shared package equivalent
- `ScreenCapture/` — Tauri-specific; acceptable as desktop-only
- `Voice/VoiceInputOverlay.tsx` — voice input overlay is desktop-specific (Tauri hotkey integration); Wispr-Flow pattern should eventually land in `packages/unified-chat` for web parity

---

## Known gaps the surface owner already knows about

1. **UnifiedAgenticChat partial-dead imports** — `App.tsx:26,90,95` still import `CommandPalette` and `SearchModal` from `components/UnifiedAgenticChat/`; the `ChatInterface` from `packages/unified-chat` is live but the dead-code boundary is not clean.
2. **Dispatch HMAC** — desktop has zero implementation of `dispatchHmac`/`dispatchSalt`; unsigned-message transitional path expires 2026-06-05 (per FINAL_AUDIT §B).
3. **Ghost model** — `claude-opus-4-6-mini` appears in TUI components at `chatwidget.rs:412` and related files; this is CLI-side but affects model catalog trust.
4. **No A/B comparison layout in chat** — `ModelComparison.tsx` lives in Settings for side-by-side eval, not in the live chat thread.
5. **Cloud drives / notebook attachments missing** — `PlusMenu` supports local files, folder, screenshot, web search, and prompt stash, but no Google Drive, OneDrive, or notebook attachment types that competitors surface in their composer attach menus.

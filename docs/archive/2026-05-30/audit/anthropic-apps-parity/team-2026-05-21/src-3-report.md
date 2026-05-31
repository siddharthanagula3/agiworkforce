# src-3 Report — apps/desktop Frontend Parity Audit

Audited surface: `apps/desktop` (Tauri v2 + React 19 + Vite). Read-only audit performed 2026-05-21.

## Audit context

- Tauri v2 native shell. Renderer = React 19.2.5 + Vite 7, framer-motion 12, lucide-react icons, tailwind v4, radix-ui, sonner, zustand v5.
- `DESKTOP_CHAT_V3` feature flag (`apps/desktop/src/services/featureFlags.ts:205-211`) is default-on (`enabled: true, enabledForAll: true`) and gated only by an emergency local-override kill-switch. Consumed at `apps/desktop/src/App.tsx:1052`.
- Two parallel chat shells coexist:
  - **Legacy/v2 shell**: rich `apps/desktop/src/features/chat/*` (122 files) — `ChatInputArea`, `ChatStream`, `MessageBubble`, `Sidebar`, etc., wired via Tauri IPC, full feature surface.
  - **v3 shell**: `apps/desktop/src/features/v3/DesktopShellV3.tsx` (149 lines) mounts `ChatInterface` from `@agiworkforce/unified-chat`, with a v3-specific `Sidebar`, `Composer`, `EmptyChat`, `CapModal`, `AccountMenu`, `PlusMenu`, `ModelPopover`. Cowork and Code modes are placeholder text ("coming") at `DesktopShellV3.tsx:117-145`.
- Tauri IPC paths observed: `file_read`, screen-capture, computer-use/browser session start/stop, MCP OAuth callbacks (CONNECTORS `mcp__claude-in-chrome__file_upload`-style ID prefixes for badges).
- State management: rich Zustand store layer — `unifiedChatStore`, `chatStore`, `modelStore`, `artifactStore`, `connectorsStore`, `billingUsageStore`, `appModeStore`, `settingsStore`, `projectStore`, `computerUseStore`, `browserStore`, `voiceInputStore`, `mcpAppStore`, `executionStore`, etc.

---

## Composer

**Evidence ref:** `apps/desktop/src/features/chat/ChatInputArea.tsx:109-1521` (legacy v2, 1521 lines); `apps/desktop/src/features/v3/Composer.tsx:42-304` (v3 standalone, 304 lines); `apps/desktop/src/features/chat/PlusMenu.tsx:43-80`; `apps/desktop/src/features/v3/PlusMenu.tsx:54-80`.

**Current state:** Two production-ready composers. Legacy `ChatInputArea` is feature-rich: drag-drop attachments (`useAttachments`/`useDragAndDrop`), pasted-file detection, slash-command autocomplete (`SlashCommandMenu`), `@mention` skill picker (`SkillMentionPicker`), `@file:` file-context picker (`FileMentionPicker`), inline AI prompt completion (`useApiPromptCompletion`, Tab-to-accept), voice transcription (`useVoiceTranscription`, Wispr-style `voiceInputStore`), focus-mode buttons, intent classification with auto-tags, attachments preview row, model selector button, send/stop. The v3 `Composer` is simpler: textarea + Plus + Mic + ModelPopover pill + Send/Stop, with PlusMenu sub-panels for plugins/skills/connectors/web-search.

**Gap delta:** No gap visible vs Claude desktop composer surface from source side alone — both shells have the core "type, paste, attach, mic, send" loop. Cross-validation by lead needed for: (a) whether Claude desktop composer has a dedicated "research/extended thinking" toggle separate from model selection (the legacy has `FocusModeButtons`; v3 only shows Adaptive/Standard read-only HUD at `Composer.tsx:215-225`); (b) whether Claude shows an inline progressive completion suggestion (we do via `inlineSuggestion`/Tab accept at `ChatInputArea.tsx:1104-1115`).

**Severity:** P2 — polish if anything; functional parity exists.

**Hours:** 0 (no work required from source-side gap audit; lead must reconcile against image evidence).

---

## Sidebar / History / Projects

**Evidence ref:** `apps/desktop/src/features/chat/Sidebar.tsx:1-1424` (legacy, 1424 lines); `apps/desktop/src/features/v3/Sidebar.tsx:130-604` (v3, 240/64px collapsible rail); `apps/desktop/src/features/chat/ProjectsView.tsx:55-200`.

**Current state:** Legacy sidebar groups conversations into Today/Yesterday/ThisWeek/Last7Days/Last30Days/Older with pin/archive/share/transfer/fork-to-BYOK/export-md/export-pdf per-item actions, search input, archive toggle, custom-instructions affordance per conversation, drag-resize handle (`ResizeHandle`), and incognito toggle. v3 sidebar has a mode switcher (chat/cowork/code), per-mode nav rail (Projects/Artifacts/Customize for chat; Projects/Scheduled/LiveArtifacts/Dispatch for cowork; Routines for code), recents grouping (LastHour/Today/Yesterday/PastWeek/PastMonth), and a footer account button. `ProjectsView` is a separate full-page panel with grid/list of projects, create-dialog, archive, search, conversations + files per project.

**Gap delta:** Legacy sidebar likely over-shoots Claude's parity (multiple per-row actions: share, transfer, fork-to-BYOK, MD export, PDF export). The v3 sidebar mode-switcher (chat/cowork/code) is an AGI-only concept — Claude desktop has no "cowork" or "code" top-level mode. Possible gap: Claude's sidebar has a dedicated "Recent / Starred / Projects" segmented section and a sticky "New chat" up top; v3 has these but order/labels are different.

**Severity:** P2 — visual labeling/order only.

**Hours:** 4 (small label and ordering adjustments to match Claude's visual hierarchy).

---

## Model picker

**Evidence ref:** `apps/desktop/src/features/chat/ModelSelectorButton.tsx:34-107`; `apps/desktop/src/features/chat/QuickModelSelector.tsx`; `apps/desktop/src/features/v3/ModelPopover.tsx`; `apps/desktop/src/features/settings/ModelSelector.tsx`; `apps/desktop/src/features/settings/CustomModelsSettings.tsx`; `apps/desktop/src/features/settings/FavoriteModelsSelector.tsx`.

**Current state:** Composer-mounted picker is a Popover-driven button (`ModelSelectorButton.tsx:62-104`) showing model name, thinking-mode badge (Brain icon), capability flags (EyeOff for no-vision, Wrench for no-tools, amber Wrench for tool fallback). In Simple Mode it collapses to a static "Auto" pill (`ModelSelectorButton.tsx:45-52`). `QuickModelSelector` renders the popover content. Settings panel has a deeper `ModelComparison`, `ModelCard`, `CapabilitiesSettings`, custom-model editor, and a `FavoriteModelsSelector`. Multi-tier capability indicators are richer than Claude's 1-line model name.

**Gap delta:** Claude desktop's model selector is typically a single dropdown listing "Sonnet / Opus / Haiku" with very minimal capability badges, no vision/tools indicators visible. AGI desktop's picker shows more provider/capability metadata than Claude. No missing-feature gap; possible inverse gap (Claude lacks our richness). Cross-validation by lead needed.

**Severity:** P2.

**Hours:** 0.

---

## Tool-call rendering

**Evidence ref:** `apps/desktop/src/features/chat/ToolCallCard.tsx:1-60`; `apps/desktop/src/features/chat/MessageBubble/ToolCallCard.tsx`; `apps/desktop/src/features/chat/InlineToolResults/` (24 inline renderers: `InlineAgentCard`, `InlineAPIResponse`, `InlineArtifactCard`, `InlineCodeDiff`, `InlineComputerUseResult`, `InlineDatabaseResults`, `InlineDirectoryList`, `InlineDocumentGeneration`, `InlineDocumentRead`, `InlineDocumentSearch`, `InlineGitHub`, `InlineGitResult`, `InlineLSPResult`, `InlineMarketplaceCard`, `InlineMediaGeneration`, `InlineMemoryCard`, `InlineScheduleCard`, `InlineScreenshot`, `InlineSearchResults`, `InlineSkillCard`, `InlineSwarmProgress`, `InlineTerminalOutput`, `InlineVisionResult`, `InlineVoiceResult`, `QuestionPrompt`, `TodoList`); `apps/desktop/src/features/chat/Sidecar/` (`ActiveOperationsSection`, `CodeCanvas`, `DiffViewer`, `TerminalView`); `apps/desktop/src/features/chat/Cards/ActiveToolStreams.tsx`; `apps/desktop/src/features/chat/Cards/ApprovalRequestCard.tsx`; `apps/desktop/src/features/chat/ChatStream.tsx:722-732`.

**Current state:** A very rich tool-call rendering subsystem: per-tool inline renderers (24), per-tool source badges (MCP / browser / general via `ToolCallCard.tsx:20-60`), an `ActiveToolStreams` ticker showing up-to-3 concurrent running tools (`ChatStream.tsx:723-724`), pending/running/complete/error states with elapsed timer, and approval card UI for risky tool use (`Cards/ApprovalRequestCard`). `MessageRuntimeActivity` decorators stamp running tool state directly on the message bubble.

**Gap delta:** No gap visible vs Claude — depth here exceeds typical Claude desktop tool-call rendering (Claude collapses to a single "Used tool X" line). Possible inverse gap (we render more). Cross-validation needed for whether Claude desktop shows progress for long-running tools.

**Severity:** P2.

**Hours:** 0.

---

## Artifacts

**Evidence ref:** `apps/desktop/src/features/artifacts/ArtifactPanel.tsx:70-200` (panel w/ Preview/Code/Versions inner tabs); `apps/desktop/src/features/artifacts/ArtifactsGallery.tsx:41-200`; `apps/desktop/src/features/artifacts/ArtifactRendererView.tsx`; `apps/desktop/src/features/artifacts/ArtifactVersionHistory.tsx`; `apps/desktop/src/features/artifacts/InlineArtifactEditor.tsx`; `apps/desktop/src/features/artifacts/ShareArtifactDialog.tsx`; `apps/desktop/src/features/chat/artifact-components/` (in chat feature: `ChartArtifact`, `CodeArtifact`, `HtmlArtifact`, `MarkdownArtifact`, `MermaidArtifact`, `SvgArtifact`, `TableArtifact`); `apps/desktop/src/features/v3/ArtifactWorkspace.tsx`; `apps/desktop/src/features/v3/CoworkArtifacts.tsx`; `apps/desktop/src/features/v3/InlineArtifactChip.tsx`.

**Current state:** Multi-renderer pipeline supporting Chart/Code/HTML/Markdown/Mermaid/SVG/Table artifact types. Side `ArtifactPanel` with version history dropdown, pin/archive/delete dropdown, share dialog, expand-to-fullscreen, copy/download/refresh, and an `InlineArtifactEditor`. `ArtifactsGallery` is a full-page Your-Artifacts + Inspiration view with category filter, search, and a hardcoded `INSPIRATION_ITEMS` set (React Dashboard, Data Analysis Report, API Docs, SVG Logo, Python ETL, ER Diagram, etc.) at `ArtifactsGallery.tsx:41-80`.

**Gap delta:** Claude.ai has a single tab-style artifact panel (Preview / Code) without a separate Gallery or "Inspiration" tab inside the chat surface. The AGI Inspiration list is closer to a marketing/quick-start affordance. Possible Claude feature we lack: Claude artifacts can be "remixed" with a single button — we have `Pencil` for edit but no "remix in new conversation" affordance visible. Streaming-artifact indicators (Loader2 + "isStreaming" pill) appear present in `ArtifactPanel`.

**Severity:** P1 — minor visual/feature: remix affordance is a fast follow.

**Hours:** 3 (add "Remix in new conversation" action to artifact panel header + wire into chat creation flow).

---

## Computer-use

**Evidence ref:** `apps/desktop/src/features/computer-use/ComputerUseMonitor.tsx:14-117`; `apps/desktop/src/features/computer-use/ScreenPreview.tsx`; `apps/desktop/src/features/computer-use/ActionLog.tsx`; `apps/desktop/src/features/computer-use/ComputerUseAppPermissionDialog.tsx`; `apps/desktop/src/features/settings/ComputerUseConsentDialog.tsx`; `apps/desktop/src/features/settings/ComputerUseSettings.tsx`; `apps/desktop/src/stores/computerUseStore.ts`.

**Current state:** Two-pane monitor (Screen Preview 60% top, Action Log 40% bottom), Start/Stop session button with Active/Inactive pill, session ID display, error banner, Tauri-event subscription via `subscribeToComputerUseEvents`. App-permission dialog and consent dialog cover platform permission flow. The store provides `startSession`/`stopSession`/`clearLog` actions.

**Gap delta:** Claude has computer-use in beta (Mac/Windows desktop) as an inline chat-driven action runner with screenshot + action trail. Our `ComputerUseMonitor` is a _separate_ full-pane view, not inline within the chat. Claude shows the actions live in-stream and a thumbnail of the screen capture; we have inline result via `InlineComputerUseResult` (`InlineToolResults/InlineComputerUseResult.tsx`) but not the same composition. Real-time streaming via screen-preview component is present.

**Severity:** P1 — UX divergence rather than missing feature.

**Hours:** 6 (compose `ScreenPreview` + `ActionLog` inline inside chat sidecar when computer-use session is active; cap as opt-in).

---

## Browser automation

**Evidence ref:** `apps/desktop/src/features/browser/BrowserViewer.tsx:26-200`; `apps/desktop/src/features/browser/BrowserActionLog.tsx`; `apps/desktop/src/features/browser/BrowserDebugTabs.tsx`; `apps/desktop/src/features/browser/BrowserReplayViewer.tsx`; `apps/desktop/src/features/browser/BrowserVisualization.tsx`; `apps/desktop/src/stores/browserStore.ts`.

**Current state:** Fully-fledged browser viewer with URL bar, back/forward/reload, navigate, screenshot streaming, highlight-element overlay, zoom/pan controls, fullscreen toggle, replay viewer, and debug-tabs panel. Hooked into `useBrowserStore` for sessions, tabs, screenshots, and navigation.

**Gap delta:** Claude does not ship a built-in browser automation viewer at desktop parity — this is an AGI-unique surface. No parity gap; possible cross-validation needed against the May-20 audit's positioning of browser-automation as a "Computer Use" sub-mode.

**Severity:** P2.

**Hours:** 0.

---

## Settings

**Evidence ref:** `apps/desktop/src/features/settings/SettingsPanel.tsx:60-130` (11-tab dialog); `apps/desktop/src/features/settings/tabs/{General,Account,Appearance,Privacy,ModelsKeys,Agents,McpSkills,Connectors,Notifications,Voice,Capabilities}/`; `apps/desktop/src/features/settings/ThemeEditorDialog.tsx`; `apps/desktop/src/features/settings/AllowedDirectoriesSettings.tsx`; `apps/desktop/src/features/settings/AutomationPermissionsSettings.tsx`; `apps/desktop/src/features/settings/KeybindingsSettings.tsx`; `apps/desktop/src/features/settings/MasterPasswordSettings.tsx`; `apps/desktop/src/features/settings/UsageDashboard.tsx`; `apps/desktop/src/features/settings/CacheManagement.tsx`.

**Current state:** Three nav groups (`SettingsPanel.tsx:96-108`) — main (general/account/appearance/privacy/models-keys), Customize (agents/mcp-skills/connectors/capabilities), Desktop app (notifications/voice). Web-build hides `models-keys` and `voice` (`SettingsPanel.tsx:91-94`). Each tab is a self-contained component (52 files in `features/settings/`). Custom-agent editor, voice persona selector, theme editor, font selector, master-password vault, dotfile imports, MCP server settings, OAuth credentials panel, usage dashboard with cost estimator and budget tracker, cache management, allowed-directories list. Very wide settings surface.

**Gap delta:** Claude.ai/Claude desktop's settings have ~7 panes (Account, Appearance, Profile, Feature Preview, Privacy & Controls, Subscription, Notifications). AGI has substantially more (Models & Keys, Agents, MCP & Skills, Capabilities, Voice — desktop-only). Possible _missing_ on AGI side: a dedicated "Feature Preview" / "Labs" toggle pane to expose feature-flag overrides (only available via runtime API today at `featureFlags.ts:75-160`). Cross-validation by lead needed for Claude's specific Account → Profile fields (display name, avatar upload).

**Severity:** P1 — missing user-facing labs toggles is a discoverability gap.

**Hours:** 4 (add `Labs` tab listing user-toggleable feature flags via local-override API).

---

## Onboarding

**Evidence ref:** `apps/desktop/src/features/onboarding/OnboardingWizard.tsx:78-200` (single-step mode selection); `apps/desktop/src/features/onboarding/OnboardingWelcome.tsx`; `apps/desktop/src/features/onboarding/README.md`.

**Current state:** Single-step wizard replacing prior 6-step flow. Two choices: Cloud Managed (waitlist) vs Local Mode with inline API-key paste field that auto-detects provider via prefix (`detectProvider` at `OnboardingWizard.tsx:43-72`: handles `sk-ant-`, `AIza`, `xai-`, `pplx-`, `sk-or-`, generic `sk-`). Ollama auto-detection on mount via `OllamaClient.isReadyForUse()`. Persisted via `useSimpleModeStore.completeOnboarding`.

**Gap delta:** Claude desktop onboarding is auth-only (sign in via OAuth → land in chat). AGI onboarding correctly diverges because v1 is local-only/BYOK/Waitlist (see locks/v1-local-only-cloud-waitlist-2026-05-18.md). No gap. Possible polish: Claude's auth flow has a "Continue with Google" + "Continue with Apple" + email magic link. AGI flow lands on choice screen before sign-in — different IA.

**Severity:** P2.

**Hours:** 0.

---

## Billing / Subscription / Pricing

**Evidence ref:** `apps/desktop/src/features/subscription/SubscriptionGate.tsx:1-105` (full-screen lock); `apps/desktop/src/features/subscription/SubscriptionLockDialog.tsx`; `apps/desktop/src/features/pricing/PlansModal.tsx`; `apps/desktop/src/features/pricing/PlanCard.tsx`; `apps/desktop/src/features/v3/Pricing.tsx:1-200` (5 tiers: free/hobby/pro/pro_plus/max); `apps/desktop/src/features/v3/CapBanner.tsx` (soft-cap, 70% threshold); `apps/desktop/src/features/v3/CapModal.tsx` (hard-stop 100%); `apps/desktop/src/features/v3/CancelFlow.tsx`; `apps/desktop/src/features/v3/DowngradeFlow.tsx`; `apps/desktop/src/features/v3/PauseFlow.tsx`; `apps/desktop/src/features/v3/SpendStackImporter.tsx`; `apps/desktop/src/features/settings/UsageDashboard.tsx`; `apps/desktop/src/features/settings/UsageProgressBars.tsx`; `apps/desktop/src/features/settings/CostEstimator.tsx`; `apps/desktop/src/stores/billingUsage.ts`; `apps/desktop/src/stores/billing/{analyticsSlice,budgetSlice,costSlice,subscriptionSlice,usageSlice}.ts`.

**Current state:** Comprehensive billing UX. Pricing page lists 5 tiers (Free/Hobby/Pro/Pro+/Max) with per-modality caps (opus/sonnet/voice/image/video/computer at `v3/Pricing.tsx:42-78`), Stripe checkout flow via `openCheckout`. Soft-cap banner at 70%, hard-stop modal at 100%, "buy a top-up pack" hook. Pause/Cancel/Downgrade flows separate from billing settings. SubscriptionGate is a full-screen lock with upgrade CTA, past-due variant, sign-in fallback. UsageDashboard shows budget tracker, cost estimator, progress bars.

**Gap delta:** Per locks/v1-local-only-cloud-waitlist-2026-05-18.md, cloud is waitlist-gated for v1 → so billing UI should not be visible in v1 builds. Pricing surface, plan cards, Stripe checkout, top-up, downgrade-flow, cancel-flow are all present and may need to be feature-flagged off for v1. Claude desktop billing is a single Settings → Subscription pane (Free/Pro/Max/Team/Enterprise) with view-plan + manage-subscription CTAs — no in-app upgrade flow.

**Severity:** P0 — v1 lock contradicts visible billing UX. Either remove from v1 build path or gate behind `cloud_waitlist_disabled` flag.

**Hours:** 8 (audit and feature-flag-gate all billing-related entry points; remove Pricing route from default nav in v1 builds; preserve code behind a `BILLING_V1` flag).

---

## Connectors

**Evidence ref:** `apps/desktop/src/features/connectors/ConnectorGallery.tsx:45-200`; `apps/desktop/src/features/connectors/ConnectorCard.tsx`; `apps/desktop/src/features/connectors/connectorDefinitions.ts`; `apps/desktop/src/features/connectors/ConnectorDetailView.tsx`; `apps/desktop/src/features/connectors/ConnectorHealthDashboard.tsx`; `apps/desktop/src/features/connectors/ConnectorOAuthFlow.tsx`; `apps/desktop/src/features/connectors/ConnectorApiKeyDialog.tsx`; `apps/desktop/src/features/connectors/CustomRemoteMcpConnectorDialog.tsx`; `apps/desktop/src/features/connectors/OAuthConnectorCard.tsx`.

**Current state:** Gallery with Featured/All tabs, status filter (all/connected/available), category filter (Productivity/Development/Communication/Analytics), search, custom remote-MCP connector dialog, OAuth flow dialog, API-key dialog, health dashboard. Hooked into `useConnectorsStore` and `McpClient`.

**Gap delta:** Claude desktop's connectors are an Apps & Integrations panel via Settings — gallery-style with the same featured/all split. Parity looks close. Possible inverse gap: AGI's "Custom remote-MCP connector" affordance may not exist on Claude. No missing-feature gap from source side.

**Severity:** P2.

**Hours:** 0.

---

## Search / Cmd+K

**Evidence ref:** `apps/desktop/src/features/chat/SearchModal.tsx:71-200`; `apps/desktop/src/features/v3/SearchModalCmdK.tsx`; `apps/desktop/src/features/chat/CommandPalette.tsx`; `apps/desktop/src/hooks/useSearchModal.ts`.

**Current state:** Spotlight-style unified search modal at Cmd+K covering chats, projects, artifacts, with type icons, timestamps, project attribution, filter tabs (all/chats/projects), client-side fuzzy filtering, keyboard navigation. `CommandPalette` (legacy) provides command-mode (different from search). v3 has `SearchModalCmdK` mounted from v3 Sidebar (`v3/Sidebar.tsx:86-90` fires synthetic `Cmd+K` keydown).

**Gap delta:** Claude desktop Cmd+K typically opens a chat-only search (no projects or artifacts filter). AGI's unified search is richer. Inverse gap. No missing feature.

**Severity:** P2.

**Hours:** 0.

---

## Attachments / multi-modal

**Evidence ref:** `apps/desktop/src/features/chat/AttachmentPreview.tsx`; `apps/desktop/src/features/chat/hooks/useAttachments.ts`; `apps/desktop/src/features/chat/hooks/useDragAndDrop.ts`; `apps/desktop/src/features/chat/DragOverlay.tsx`; `apps/desktop/src/features/chat/AudioPreview.tsx`; `apps/desktop/src/features/chat/ImageLightbox.tsx`; `apps/desktop/src/features/screen-capture/ScreenCaptureButton.tsx` (referenced from PlusMenu); `apps/desktop/src/features/file-upload/` (8 files); `apps/desktop/src/features/vision/` (vision panel); `apps/desktop/src/features/images/`; `apps/desktop/src/features/media/`; `apps/desktop/src/features/chat/ChatInputArea.tsx:1244-1253` (accept= images/audio/text/PDF/JSON/MD/code).

**Current state:** Drag-drop overlay, paste-from-clipboard, file picker, screen capture, audio recording preview, image lightbox. File-input `accept` attribute lists every supported MIME (images/audio/text/PDF/MD/code). Vision capabilities surfaced via `useModelCapabilities` and `capabilities.supportsVision` → `EyeOff` indicator when unsupported.

**Gap delta:** No gap visible. Claude desktop supports image/PDF/text drop with similar UX. Audio attachments via clipboard are AGI-specific.

**Severity:** P2.

**Hours:** 0.

---

## Voice

**Evidence ref:** `apps/desktop/src/features/chat/VoiceInputButton.tsx`; `apps/desktop/src/features/chat/VoiceRecordingStatus.tsx`; `apps/desktop/src/features/voice/` (6 files); `apps/desktop/src/features/chat/ChatInputArea.tsx:253-308` (Wispr-style flow); `apps/desktop/src/features/settings/VoiceSettings.tsx`; `apps/desktop/src/features/settings/VoicePersonaSelector.tsx`; `apps/desktop/src/hooks/useVoiceTranscription.ts`; `apps/desktop/src/hooks/useTTS.ts`; `apps/desktop/src/stores/voiceInputStore.ts`; `apps/desktop/src/features/v3/MicSettings.tsx`.

**Current state:** Voice input button with recording-state pill, transcription via `useVoiceTranscription` (local whisper or cloud), voice-command detection (`detectVoiceCommand`), TTS on message via `useTTS` (Volume2 icon in MessageActions). Wispr-style global voice store appends transcripts to composer. Voice persona selector and mic settings panel.

**Gap delta:** Claude has voice input on mobile but not on desktop today. Inverse gap. No source-side gap. Possible polish: Claude mobile Voice Mode has a "tap to talk hands-free" full-screen ambient mode — desktop has push-to-talk only.

**Severity:** P2.

**Hours:** 0.

---

## Slash commands

**Evidence ref:** `apps/desktop/src/features/chat/SlashCommandMenu.tsx:25-100`; `apps/desktop/src/hooks/useSlashCommands.ts`; `apps/desktop/src/hooks/useSlashCommandAutocomplete.ts`; `apps/desktop/src/features/chat/CommandSuggestion.tsx`; `apps/desktop/src/features/chat/ChatInputArea.tsx:1081-1102` (arrow nav).

**Current state:** Autocomplete dropdown with arrow-key nav, Escape to close. Suggestions emitted by `useSlashCommandAutocomplete`. Each suggestion has icon + label + description.

**Gap delta:** Claude desktop does not expose a slash-command palette in the composer. Inverse gap.

**Severity:** P2.

**Hours:** 0.

---

## Memory

**Evidence ref:** `apps/desktop/src/features/memory/` (15 files including `SaveToMemoryButton`); `apps/desktop/src/features/memory-panel/`; `apps/desktop/src/features/chat/MessageBubble/MessageActions.tsx:25` (SaveToMemoryButton).

**Current state:** Inline "Save to Memory" action button on every message in `MessageActions`. Separate `memory` and `memory-panel` features with 15 component files. Memory store hooked to chat actions.

**Gap delta:** Claude desktop ships a "memory" surface in beta (per-conversation memory + global Profile fields). AGI's looks closer to a "save snippet" model. Cross-validation needed by lead.

**Severity:** P2.

**Hours:** 0.

---

## Keyboard shortcuts

**Evidence ref:** `apps/desktop/src/features/chat/KeyboardShortcutsDialog.tsx:24-55` (3 groups, ~16 shortcuts); `apps/desktop/src/features/chat/KeyboardShortcutsOverlay.tsx`; `apps/desktop/src/features/settings/KeybindingsSettings.tsx`.

**Current state:** Dialog enumerates General (Cmd+K, Cmd+Shift+S, Cmd+Shift+O, Cmd+Shift+T, Esc, Cmd+/), Chat (Cmd+Enter, Cmd+F, Alt+P, Shift+Enter, J/↓, K/↑), and Code Editor (Cmd+S, Cmd+Z, Cmd+Shift+Z) shortcuts. Mac vs Windows key glyph swap. Customizable keybindings via `KeybindingsSettings`.

**Gap delta:** Claude desktop's shortcut surface is smaller — typically just Cmd+K + Cmd+Shift+O. Inverse gap. No missing feature. Possible polish: Claude shows the shortcut hint inside the Cmd+K modal itself ("⌘K" mnemonic); we show it in the sidebar (`v3/Sidebar.tsx:344-354`).

**Severity:** P2.

**Hours:** 0.

---

## Thinking / reasoning visualization

**Evidence ref:** `apps/desktop/src/features/chat/ThinkingBlock.tsx:13-60`; `apps/desktop/src/features/chat/ReasoningAccordion.tsx:44-200`; `apps/desktop/src/features/chat/MessageBubble/ThinkingMessageBlock.tsx`; `apps/desktop/src/features/chat/StatusTrail.tsx:7-100`; `apps/desktop/src/features/chat/ChatStream.tsx:741-815` (thinking spinner with sparkle icon).

**Current state:** Auto-collapse-when-streaming-finishes thinking block with single-line preview; richer `ReasoningAccordion` with duration formatting (e.g. "12s", "2m 13s"), step counter, thinking-pattern label, live elapsed timer, syntax-highlighted block expansion. StatusTrail renders inline `thinking → searching → coding → running → completed` chips.

**Gap delta:** No gap. Claude shows a similar "Thinking..." block with auto-collapse — Anthropic's design is the canonical pattern we appear to track. Inverse gap on richness (we expose duration/steps; Claude shows just "Thinking" text).

**Severity:** P2.

**Hours:** 0.

---

## Empty state / quick-start

**Evidence ref:** `apps/desktop/src/features/chat/SimpleEmptyState.tsx`; `apps/desktop/src/features/chat/AdvancedEmptyState.tsx`; `apps/desktop/src/features/chat/QuickStartPills.tsx`; `apps/desktop/src/features/chat/BrandedGreeting.tsx`; `apps/desktop/src/features/v3/EmptyChat.tsx:18-60` (greeting formula + QuickChips).

**Current state:** Greeting varies by hour (`EmptyChat.tsx:23-30`): "Good morning, {name}" / "What can I help with, {name}?" / "It's late-night, {name}". Quick-chip prompts (`ChipType`: code, write, research, image, video, computer, learn, life, web). Legacy has Simple vs Advanced empty-state variants.

**Gap delta:** Claude desktop empty state is "How can I help you today, {name}?" + four prompt chips (Write, Code, Brainstorm, Learn). Greeting time-variant on AGI is richer than Claude's static prompt. The chip taxonomy on AGI is broader (9 chips vs Claude's 4); cross-validation needed.

**Severity:** P2.

**Hours:** 0.

---

## Approvals / risk confirmation

**Evidence ref:** `apps/desktop/src/features/chat/Cards/ApprovalRequestCard.tsx`; `apps/desktop/src/features/chat/MessageApprovals.tsx`; `apps/desktop/src/features/chat/RiskConfirmationDialog.tsx`; `apps/desktop/src/features/chat/useMessageRuntimeActivity.ts` (`useUnassignedApprovals`).

**Current state:** Approval card UI for risky tool calls (file write, shell exec, etc.), inline + dialog variants. Wired into message runtime.

**Gap delta:** Claude desktop has approval flow for Computer Use actions (per-action confirm or batch-approve). AGI surface looks similar. No source-side gap.

**Severity:** P2.

**Hours:** 0.

---

## Cross-cutting concerns

- **Two-shell drift risk:** v3 shell at `features/v3/` reimplements Composer, Sidebar, PlusMenu, ModelPopover separately from `features/chat/`. With `DESKTOP_CHAT_V3` default-on, the legacy `ChatInputArea` (1521 lines) appears dead-code at runtime but is still imported in App.tsx (line 1052 reads the flag). Need lead reconciliation on whether legacy chat shell should be removed in v1 or kept as fallback.
- **Cloud Web build (`build:cloud`)** hides Models & Keys and Voice tabs (`SettingsPanel.tsx:91-94`) but billing/pricing surfaces appear visible — see Billing section above.
- **Tauri IPC coverage:** Composer reads files via `file_read`; computer-use start/stop via `useComputerUseStore.startSession/stopSession`; browser session/screenshot via `useBrowserStore`; OAuth callbacks dispatched as Custom DOM events from native side (`ConnectorGallery.tsx:84-100`). Solid IPC bridge layer.

---

## Summary of severities + hours

| Feature                            | Severity | Hours |
| ---------------------------------- | -------- | ----- |
| Composer                           | P2       | 0     |
| Sidebar / history / projects       | P2       | 4     |
| Model picker                       | P2       | 0     |
| Tool-call rendering                | P2       | 0     |
| Artifacts                          | P1       | 3     |
| Computer-use                       | P1       | 6     |
| Browser automation                 | P2       | 0     |
| Settings                           | P1       | 4     |
| Onboarding                         | P2       | 0     |
| **Billing / subscription**         | **P0**   | **8** |
| Connectors                         | P2       | 0     |
| Search / Cmd+K                     | P2       | 0     |
| Attachments / multi-modal          | P2       | 0     |
| Voice                              | P2       | 0     |
| Slash commands                     | P2       | 0     |
| Memory                             | P2       | 0     |
| Keyboard shortcuts                 | P2       | 0     |
| Thinking / reasoning visualization | P2       | 0     |
| Empty state                        | P2       | 0     |
| Approvals                          | P2       | 0     |

**Subtotal: 25 hours.** Source-side conclusion is that desktop **over-shoots** Claude desktop parity in nearly every feature area — most "gap delta" entries are inverse (we have more). The single real source-side P0 is the visible billing/pricing/checkout UX that contradicts the v1 local-only/waitlist lock. Lead cross-validation against image evidence is required to confirm whether AGI's additional surface area (slash commands, voice on desktop, browser viewer, cowork/code modes) is intentional or accidental scope creep relative to the v1 Claude-parity bar.

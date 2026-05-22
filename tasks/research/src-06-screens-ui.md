# Claude Code reference: Screens, Components, Ink, Themes, Keybindings, Vim, Voice, Launchers

Reference root: `~/Desktop/reference/src/`. All paths below are relative to that root unless prefixed with `/`. Citations are `file:line`. The CLI is a single Ink (React-for-CLI) tree, mounted via a managed `Root` (`ink/root.ts`) created in `main.tsx:2229`. There are only **3 top-level screen modules** under `screens/`; everything else is a component, a launcher dialog, or a sub-pane of one of those screens. The codebase relies heavily on context-scoped keybindings, hot-reloading user keybindings, theme tokens, and a state-machine-driven vim mode.

---

## 1. Screens Inventory

### 1.1 Top-level `screens/` directory (only 3 files)

`ls ~/Desktop/reference/src/screens/` confirms exactly three files:

| Screen                 | File                                         | Size   | Purpose                                                                                                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REPL**               | `screens/REPL.tsx` (5005 LOC)                | 895 KB | The chat / agent loop UI: messages, prompt input, status line, tool-use stream, permission prompts, dispatch panels, multi-mode (Chat / Bash / Memory / Plan / Auto). All keybindings, model picker mounting, queue handling, and IDE integration converge here. Imported lazily by `replLauncher.tsx:18`. |
| **Doctor**             | `screens/Doctor.tsx` (1300+ LOC)             | 73 KB  | Diagnostics screen for the `claude doctor` subcommand: env validation, dist-tag freshness, sandbox doctor, plugin errors, settings validation, version-lock state, agent dirs, GCS/npm dist tags. `Doctor.tsx:30-56` defines `Props.onDone` and `AgentInfo`/`VersionLockInfo` types.                       |
| **ResumeConversation** | `screens/ResumeConversation.tsx` (1000+ LOC) | 59 KB  | Interactive session picker (powers `claude resume` and `claude resume <pr-url>`). Loads project log files progressively, lets user pick a session, then mounts `REPL` directly (`ResumeConversation.tsx:35`). Knows about cross-project resume + worktrees + agent restoration.                            |

### 1.2 Mode picker — there is no separate "Login" screen

Login is part of `Onboarding`, not its own screen. `components/Onboarding.tsx:22` declares `StepId = 'preflight' | 'theme' | 'oauth' | 'api-key' | 'security' | 'terminal-setup'` — onboarding is a _single_ component that flips between these as `currentStepIndex` (`Onboarding.tsx:33`) advances.

### 1.3 Modal/dialog "screens" — these are full-screen takeovers but live in `components/`

Counted from `dialogLaunchers.tsx` and direct grep, the launcher API drives these:

| Dialog (full takeover)             | Component file                                  | Launcher                                                               |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| **Onboarding**                     | `components/Onboarding.tsx:30`                  | `interactiveHelpers.tsx:117`                                           |
| **Trust** (workspace trust)        | `components/TrustDialog/TrustDialog.tsx`        | `interactiveHelpers.tsx:139`                                           |
| **ApproveApiKey**                  | `components/ApproveApiKey.tsx`                  | `interactiveHelpers.tsx:213`                                           |
| **ClaudeMdExternalIncludesDialog** | `components/ClaudeMdExternalIncludesDialog.tsx` | `interactiveHelpers.tsx:169`                                           |
| **BypassPermissionsModeDialog**    | `components/BypassPermissionsModeDialog.tsx`    | `interactiveHelpers.tsx:222`                                           |
| **AutoModeOptInDialog**            | `components/AutoModeOptInDialog.tsx`            | `interactiveHelpers.tsx:233`                                           |
| **DevChannelsDialog**              | `components/DevChannelsDialog.tsx`              | `interactiveHelpers.tsx:276`                                           |
| **GroveDialog**                    | `components/grove/Grove.tsx`                    | `interactiveHelpers.tsx:195`                                           |
| **ClaudeInChromeOnboarding**       | `components/ClaudeInChromeOnboarding.tsx`       | `interactiveHelpers.tsx:295`                                           |
| **SnapshotUpdateDialog**           | `components/agents/SnapshotUpdateDialog.tsx`    | `dialogLaunchers.tsx:29`                                               |
| **InvalidSettingsDialog**          | `components/InvalidSettingsDialog.tsx`          | `dialogLaunchers.tsx:44`                                               |
| **AssistantSessionChooser**        | `assistant/AssistantSessionChooser.tsx`         | `dialogLaunchers.tsx:58`                                               |
| **NewInstallWizard** (assistant)   | `commands/assistant/assistant.ts`               | `dialogLaunchers.tsx:73`                                               |
| **TeleportResumeWrapper**          | `components/TeleportResumeWrapper.tsx`          | `dialogLaunchers.tsx:91`                                               |
| **TeleportRepoMismatchDialog**     | `components/TeleportRepoMismatchDialog.tsx`     | `dialogLaunchers.tsx:102`                                              |
| **ResumeConversation**             | `screens/ResumeConversation.tsx`                | `dialogLaunchers.tsx:117` (uses `renderAndRun`, NOT `showSetupDialog`) |

### 1.4 Routing model

Routing is **not URL-based**. Three primitives in `interactiveHelpers.tsx`:

1. `showDialog<T>(root, renderer)` (line 39) — render a one-off Promise-resolving JSX tree.
2. `showSetupDialog<T>` (line 86) — same but wraps in `<AppStateProvider><KeybindingSetup>`.
3. `renderAndRun(root, element)` (line 98) — render the _long-running_ tree (the REPL, Resume, etc.), call `startDeferredPrefetches()`, and `await root.waitUntilExit()`.

`main.tsx` is a `commander`-driven CLI dispatcher. It creates ONE Ink `root` (`main.tsx:2229`) and sequentially:

1. Calls `showSetupScreens()` (`main.tsx:2241`) which flips through Onboarding → Trust → ApproveApiKey → ClaudeMdExternalIncludes → Grove → Bypass → AutoMode → DevChannels → ChromeOnboarding.
2. Then for each subcommand, calls one of the launchers — `launchRepl` (8 call sites: `main.tsx:3134, 3176, 3242, 3338, 3487, 3733, 3798`), `launchResumeChooser` (`main.tsx:3749`), `launchAssistantInstallWizard` (`main.tsx:3280`), `launchAssistantSessionChooser` (`main.tsx:3298`).

Inside the REPL, navigation is _modal overlays managed by `useState` flags_, not screen transitions. The active "view" inside REPL is decided by checks like `screen === 'transcript'` (a `Screen` type defined in REPL.tsx around the props), `appState.modelPickerOpen`, `appState.fastModePickerOpen`, etc.

---

## 2. Components Inventory

`ls components/` returns 144 entries (file count). Below is the inventory broken into thematic groups. One-line purpose for each.

### 2.1 Foundational / app shell

| File                                             | Purpose                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `App.tsx:19`                                     | Root provider: wraps in FpsMetricsProvider → StatsProvider → AppStateProvider.                                                           |
| `BaseTextInput.tsx`                              | The actual cursor-aware text input (used by both `TextInput` and `VimTextInput`).                                                        |
| `TextInput.tsx`                                  | Plain text input wrapper.                                                                                                                |
| `VimTextInput.tsx:13`                            | Vim-mode-aware input wrapper using `useVimInput`.                                                                                        |
| `Spinner.tsx` + `Spinner/`                       | The animated thinking indicator (FlashingChar, GlimmerMessage, SpinnerAnimationRow, SpinnerGlyph, ShimmerChar).                          |
| `Markdown.tsx` (`Markdown.tsx:31`)               | Markdown renderer with marked, GFM, code highlighting; includes a fast path `hasMarkdownSyntax` regex that skips parsing for plain text. |
| `MarkdownTable.tsx` (47 KB)                      | Tables for markdown rendering.                                                                                                           |
| `HighlightedCode.tsx` (`HighlightedCode.tsx:18`) | Code-block syntax highlighting via Rust NAPI (`ColorFile`); fallback at `HighlightedCode/Fallback.tsx`.                                  |
| `StructuredDiff.tsx:95`                          | Diff rendering with WeakMap caching of NAPI output (gutter+content split). Uses `<NoSelect>` for gutter, `<RawAnsi>` for content.        |
| `StructuredDiffList.tsx`                         | List variant for multi-hunk diffs.                                                                                                       |
| `StructuredDiff/colorDiff.ts`                    | NAPI bindings for color diff.                                                                                                            |
| `StructuredDiff/Fallback.tsx`                    | Plain JS fallback when NAPI module missing.                                                                                              |

### 2.2 Chat / message UI

| File                                                              | Purpose                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Message.tsx:32` (626 LOC)                                        | Message dispatcher — picks one of `messages/*Message.tsx` based on type.                 |
| `MessageRow.tsx:50` (382 LOC)                                     | Per-row wrapper: handles continuation, `OffscreenFreeze`, hasContentAfter scan, lookups. |
| `Messages.tsx` (833 LOC)                                          | The full message list inside REPL.                                                       |
| `MessageSelector.tsx` (115 KB)                                    | The "rewind to message N" dialog. Big file.                                              |
| `MessageModel.tsx`                                                | Renders model badge per assistant message.                                               |
| `MessageResponse.tsx`                                             | Text + thinking response rendering.                                                      |
| `MessageTimestamp.tsx`                                            | Per-message timestamp.                                                                   |
| `messages/AssistantTextMessage.tsx`                               | Text bubble.                                                                             |
| `messages/AssistantToolUseMessage.tsx`                            | Tool-call bubble.                                                                        |
| `messages/AssistantThinkingMessage.tsx`                           | Thinking expand/collapse.                                                                |
| `messages/AssistantRedactedThinkingMessage.tsx`                   | Redacted thinking placeholder.                                                           |
| `messages/UserTextMessage.tsx`                                    | User text bubble.                                                                        |
| `messages/UserBashInputMessage.tsx` + `UserBashOutputMessage.tsx` | `!`-prefixed bash mode.                                                                  |
| `messages/UserCommandMessage.tsx`                                 | Slash-command echo.                                                                      |
| `messages/UserMemoryInputMessage.tsx`                             | `#`-prefixed memory append.                                                              |
| `messages/UserPlanMessage.tsx`                                    | Plan-mode message.                                                                       |
| `messages/UserResourceUpdateMessage.tsx`                          | MCP resource update.                                                                     |
| `messages/UserAgentNotificationMessage.tsx`                       | Sub-agent → main-thread notification.                                                    |
| `messages/UserChannelMessage.tsx`                                 | Channel msg (Kairos).                                                                    |
| `messages/UserImageMessage.tsx`                                   | Image attachment.                                                                        |
| `messages/UserToolResultMessage/`                                 | Tool-result rendering (split into multiple files).                                       |
| `messages/UserPromptMessage.tsx`                                  | The "you said:" header.                                                                  |
| `messages/UserTeammateMessage.tsx`                                | Teammate chat message (swarm).                                                           |
| `messages/UserLocalCommandOutputMessage.tsx`                      | `!cmd` output.                                                                           |
| `messages/SystemTextMessage.tsx`                                  | System banner.                                                                           |
| `messages/SystemAPIErrorMessage.tsx`                              | API error display.                                                                       |
| `messages/HookProgressMessage.tsx`                                | Pre/post hook progress.                                                                  |
| `messages/AdvisorMessage.tsx`                                     | Inline advisor block.                                                                    |
| `messages/AttachmentMessage.tsx`                                  | File attachment preview.                                                                 |
| `messages/CompactBoundaryMessage.tsx`                             | Boundary marker after `/compact`.                                                        |
| `messages/CollapsedReadSearchContent.tsx`                         | Collapsed group of repeated read/search tool calls.                                      |
| `messages/GroupedToolUseContent.tsx`                              | Multi-tool-use grouping.                                                                 |
| `messages/HighlightedThinkingText.tsx`                            | Highlighted thinking lines.                                                              |
| `messages/PlanApprovalMessage.tsx`                                | Plan approve/reject button row.                                                          |
| `messages/RateLimitMessage.tsx`                                   | Rate-limit notification with options.                                                    |
| `messages/ShutdownMessage.tsx`                                    | Goodbye banner.                                                                          |
| `messages/TaskAssignmentMessage.tsx`                              | Sub-agent task assignment.                                                               |
| `messages/teamMemCollapsed.tsx` + `teamMemSaved.ts`               | Team memory blob rendering.                                                              |
| `messages/nullRenderingAttachments.ts`                            | Predicate to skip empty attachments.                                                     |
| `messageActions.tsx` (54 KB)                                      | Message-action bar (copy, edit, retry, branch).                                          |
| `VirtualMessageList.tsx`                                          | Virtualised message list with sticky-prompt tracking.                                    |

### 2.3 Composer ("PromptInput") — _the_ composer

`components/PromptInput/PromptInput.tsx:54-120` is the composer, 2338 LOC. Imports show what fields it manages:

- `PromptInputFooter.tsx`, `PromptInputFooterLeftSide.tsx`, `PromptInputFooterSuggestions.tsx` — three-piece footer with shortcut hints, suggestions, model badge.
- `PromptInputModeIndicator.tsx` — leading char prefix indicator (`!` bash, `#` memory, `>` plan, `*` think).
- `PromptInputQueuedCommands.tsx` — queued message preview when streaming.
- `PromptInputStashNotice.tsx` — "stashed" banner after `ctrl+s`.
- `PromptInputHelpMenu.tsx` — `?`-triggered help inline.
- `Notifications.tsx` (footer notifications, `FOOTER_TEMPORARY_STATUS_TIMEOUT`).
- `IssueFlagBanner.tsx`, `SandboxPromptFooterHint.tsx`, `ShimmeredInput.tsx`.
- `VoiceIndicator.tsx` — push-to-talk visual.
- `inputModes.ts` (`getModeFromInput`/`getValueFromInput`) — parses leading prefix into `PromptInputMode`.
- `inputPaste.ts` — paste handling (large blocks → `pasted_text_ref`).
- `usePromptInputPlaceholder.ts` — rotating placeholder text.
- `useMaybeTruncateInput.ts` — width-aware truncation.
- `useShowFastIconHint.ts`, `useSwarmBanner.ts` — derived banners.
- `HistorySearchInput.tsx` — sub-input shown during ctrl+r history search.

`PromptInput.tsx` directly mounts: `BridgeDialog`, `ConfigurableShortcutHint`, `EffortIndicator`, `FastIcon`, `GlobalSearchDialog`, `HistorySearchDialog`, `ModelPicker`, `QuickOpenDialog`, `TextInput`, `VimTextInput`, `ThinkingToggle`, `BackgroundTasksDialog`, `TeamsDialog`, `Notifications`, `AutoModeOptInDialog`. So the composer is _the_ spawn point for almost every overlay dialog.

### 2.4 Status / chrome / footer

| File                                       | Purpose                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatusLine.tsx:36`                        | The full-width status line: model, permission mode, cwd, output_style, cost, context %, rate limits, sessionTitle, vim mode. Driven by user-configurable `statusLine` settings. |
| `StatusNotices.tsx`                        | Above-status banners (DevChannels, Mac+VS Code, etc).                                                                                                                           |
| `IdeStatusIndicator.tsx`                   | "Connected to VS Code" badge.                                                                                                                                                   |
| `MemoryUsageIndicator.tsx`                 | `~/.claude` memory file count.                                                                                                                                                  |
| `TaskListV2.tsx`                           | TODO/task list panel (toggled with `ctrl+t`).                                                                                                                                   |
| `BashModeProgress.tsx`                     | Bash command progress bar.                                                                                                                                                      |
| `Stats.tsx`                                | FPS/perf overlay (`-DEV` builds).                                                                                                                                               |
| `DevBar.tsx`                               | Dev-only debug bar.                                                                                                                                                             |
| `TokenWarning.tsx`                         | Approaching context-window warning.                                                                                                                                             |
| `CompactSummary.tsx`                       | After-compact summary.                                                                                                                                                          |
| `EffortCallout.tsx` + `EffortIndicator.ts` | "thinking effort" pill.                                                                                                                                                         |
| `FastIcon.tsx`                             | Fast-mode lightning icon.                                                                                                                                                       |
| `FilePathLink.tsx`                         | Clickable file:line link (uses OSC 8 hyperlinks).                                                                                                                               |
| `ClickableImageRef.tsx`                    | Click-to-open image ref.                                                                                                                                                        |
| `ContextSuggestions.tsx`                   | Tab-complete suggestions.                                                                                                                                                       |
| `ContextVisualization.tsx` (76 KB)         | Context window pie chart (`/context`).                                                                                                                                          |
| `CtrlOToExpand.tsx`                        | "Press ctrl+o to expand" pill.                                                                                                                                                  |
| `FullscreenLayout.tsx:30` (84 KB)          | The big container: scrollable ScrollBox + bottom slot + sticky pill + modal pane + bottomFloat. Defines `ScrollChromeContext`, MODAL_TRANSCRIPT_PEEK.                           |
| `OffscreenFreeze.tsx`                      | Skip rendering when scrolled off-screen.                                                                                                                                        |
| `ScrollKeybindingHandler.tsx`              | All scroll keybindings (pageup/down, ctrl+home/end, wheelup/down).                                                                                                              |

### 2.5 Pickers and selectors

| File                                                                                                                                    | Purpose                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModelPicker.tsx:39` (54 KB)                                                                                                            | Model picker dialog. Drives `effort` (low/med/high/max), `fastMode` toggle, persistence skip. Mounts `Select`, `Pane`, `Byline`, `KeyboardShortcutHint`.                                 |
| `ThemePicker.tsx:30`                                                                                                                    | Theme picker. Lists `THEME_NAMES` + 'auto'. Live-previews via `usePreviewTheme` (`ThemeProvider.tsx:147`). Toggles syntax highlighting with `ctrl+t` (`ThemePicker.tsx:76`).             |
| `OutputStylePicker.tsx`                                                                                                                 | Output style picker (custom markdown styles from `~/.claude/output-styles/`).                                                                                                            |
| `LanguagePicker.tsx`                                                                                                                    | Language preference picker.                                                                                                                                                              |
| `LogSelector.tsx` (200 KB)                                                                                                              | The biggest single file — session-log picker with full thumbnail render.                                                                                                                 |
| `SessionPreview.tsx`                                                                                                                    | Hover preview in resume picker.                                                                                                                                                          |
| `MessageSelector.tsx`                                                                                                                   | "Rewind to message N" dialog.                                                                                                                                                            |
| `Feedback.tsx` (87 KB)                                                                                                                  | Feedback survey dialog.                                                                                                                                                                  |
| `CustomSelect/select.tsx:11` + `SelectMulti.tsx` + `select-input-option.tsx` + `select-option.tsx`                                      | The headless Select primitive used by every picker. Supports input-mode options (`type:'input'`, `select.tsx:36-69`), per-option keyboard shortcuts, `j/k`/`ctrl+n`/`ctrl+p` navigation. |
| `CustomSelect/use-select-state.ts` + `use-multi-select-state.ts` + `use-select-navigation.ts` + `use-select-input.ts` + `option-map.ts` | Select state machine.                                                                                                                                                                    |
| `ui/TreeSelect.tsx`                                                                                                                     | Tree-select for hierarchical data.                                                                                                                                                       |
| `ui/OrderedList.tsx` + `OrderedListItem.tsx`                                                                                            | Ordered list primitive.                                                                                                                                                                  |

### 2.6 Permissions

`permissions/` (32 entries):

- `PermissionRequest.tsx` — root permission request dispatcher.
- `PermissionDialog.tsx` — full-screen permission UI.
- `PermissionPrompt.tsx`, `PermissionExplanation.tsx`, `PermissionRequestTitle.tsx`, `PermissionRuleExplanation.tsx`, `PermissionDecisionDebugInfo.tsx`.
- Tool-specific: `BashPermissionRequest/`, `FileEditPermissionRequest/`, `FileWritePermissionRequest/`, `FilesystemPermissionRequest/`, `WebFetchPermissionRequest/`, `NotebookEditPermissionRequest/`, `SedEditPermissionRequest/`, `PowerShellPermissionRequest/`, `ComputerUseApproval/`, `EnterPlanModePermissionRequest/`, `ExitPlanModePermissionRequest/`, `SkillPermissionRequest/`, `AskUserQuestionPermissionRequest/`, `FilePermissionDialog/`, `SandboxPermissionRequest.tsx`, `FallbackPermissionRequest.tsx`.
- Worker / swarm: `WorkerBadge.tsx`, `WorkerPendingPermission.tsx`, `useShellPermissionFeedback.ts`, `shellPermissionHelpers.tsx`, `hooks.ts`, `utils.ts`, `rules/`.

### 2.7 Settings / config / status

`Settings/Settings.tsx:22` is a Tabs-driven dialog with tabs `'Status' | 'Config' | 'Usage' | 'Gates'` (line 20). Tabs defined in `design-system/Tabs.tsx`. Sub-files:

- `Settings/Status.tsx` — diagnostics + version + auth state.
- `Settings/Config.tsx` — config editor.
- `Settings/Usage.tsx` — usage / billing / rate-limit panel.

### 2.8 Help

`HelpV2/HelpV2.tsx:20` — Tabs-driven help dialog. `HelpV2/Commands.tsx` — slash-command list. `HelpV2/General.tsx` — general help.

### 2.9 MCP

`mcp/MCPListPanel.tsx`, `mcp/MCPSettings.tsx`, `mcp/MCPStdioServerMenu.tsx`, `mcp/MCPRemoteServerMenu.tsx`, `mcp/MCPAgentServerMenu.tsx`, `mcp/MCPToolListView.tsx`, `mcp/MCPToolDetailView.tsx`, `mcp/CapabilitiesSection.tsx`, `mcp/ElicitationDialog.tsx`, `mcp/MCPReconnect.tsx`, `mcp/McpParsingWarnings.tsx`, `mcp/utils/`, plus standalone `MCPServerApprovalDialog.tsx`, `MCPServerDesktopImportDialog.tsx`, `MCPServerMultiselectDialog.tsx`, `MCPServerDialogCopy.tsx`.

### 2.10 Diff dialogs

`diff/DiffDialog.tsx`, `diff/DiffDetailView.tsx`, `diff/DiffFileList.tsx`, plus the bigger `FileEditToolDiff.tsx`.

### 2.11 Agents / sub-agents / tasks

`agents/AgentEditor.tsx`, `agents/AgentDetail.tsx`, `agents/AgentsList.tsx`, `agents/AgentsMenu.tsx`, `agents/AgentNavigationFooter.tsx`, `agents/ColorPicker.tsx`, `agents/ToolSelector.tsx`, `agents/ModelSelector.tsx`, `agents/generateAgent.ts`, `agents/agentFileUtils.ts`, `agents/validateAgent.ts`, `agents/utils.ts`, `agents/types.ts`, `agents/new-agent-creation/`. Tasks: `tasks/BackgroundTasksDialog.tsx`, `tasks/BackgroundTaskStatus.tsx`, `tasks/AsyncAgentDetailDialog.tsx`, `tasks/InProcessTeammateDetailDialog.tsx`, `tasks/ShellDetailDialog.tsx`, `tasks/ShellProgress.tsx`, `tasks/RemoteSessionDetailDialog.tsx`, `tasks/RemoteSessionProgress.tsx`, `tasks/DreamDetailDialog.tsx`, `tasks/renderToolActivity.tsx`, `tasks/taskStatusUtils.tsx`, `tasks/BackgroundTask.tsx`. `CoordinatorAgentStatus.tsx` (36 KB) is the swarm status panel.

### 2.12 Skills, hooks, sandbox, memory, teams, grove, Logo

- `skills/SkillsMenu.tsx` — `/skills` menu.
- `hooks/HooksConfigMenu.tsx`, `hooks/PromptDialog.tsx`, `hooks/SelectEventMode.tsx`, `hooks/SelectHookMode.tsx`, `hooks/SelectMatcherMode.tsx`, `hooks/ViewHookMode.tsx`.
- `sandbox/SandboxSettings.tsx`, `sandbox/SandboxConfigTab.tsx`, `sandbox/SandboxDependenciesTab.tsx`, `sandbox/SandboxDoctorSection.tsx`, `sandbox/SandboxOverridesTab.tsx`, `SandboxViolationExpandedView.tsx`.
- `memory/MemoryFileSelector.tsx`, `memory/MemoryUpdateNotification.tsx`.
- `teams/TeamsDialog.tsx`, `teams/TeamStatus.tsx`.
- `grove/Grove.tsx`.
- `LogoV2/LogoV2.tsx`, `LogoV2/AnimatedAsterisk.tsx`, `LogoV2/AnimatedClawd.tsx`, `LogoV2/Clawd.tsx`, `LogoV2/CondensedLogo.tsx`, `LogoV2/EmergencyTip.tsx`, `LogoV2/Feed.tsx`, `LogoV2/FeedColumn.tsx`, `LogoV2/feedConfigs.tsx`, `LogoV2/WelcomeV2.tsx`, `LogoV2/Opus1mMergeNotice.tsx`, `LogoV2/GuestPassesUpsell.tsx`, `LogoV2/OverageCreditUpsell.tsx`, `LogoV2/VoiceModeNotice.tsx`, `LogoV2/ChannelsNotice.tsx`.

### 2.13 Design system (`components/design-system/`)

`Byline.tsx`, `color.ts`, `Dialog.tsx`, `Divider.tsx`, `FuzzyPicker.tsx`, `KeyboardShortcutHint.tsx`, `ListItem.tsx`, `LoadingState.tsx`, `Pane.tsx`, `ProgressBar.tsx`, `Ratchet.tsx`, `StatusIcon.tsx`, `Tabs.tsx`, `ThemedBox.tsx`, `ThemedText.tsx`, `ThemeProvider.tsx`. Re-exported from `ink.ts:33-44` so callers do `import { Box, Text, useTheme } from '../ink.js'` and get the theme-aware variants.

### 2.14 Other significant components

- `AutoUpdater.tsx` (30 KB), `NativeAutoUpdater.tsx` (26 KB), `PackageManagerAutoUpdater.tsx`, `AutoUpdaterWrapper.tsx` — update flow.
- `Feedback.tsx` (87 KB) + `FeedbackSurvey/*` — surveys + transcript-share + post-compact / memory / generic surveys.
- `BridgeDialog.tsx` (34 KB) — assistant bridge attach UI.
- `RemoteCallout.tsx`, `RemoteEnvironmentDialog.tsx`, `ShowInIDEPrompt.tsx`, `IdleReturnDialog.tsx`, `IdeOnboardingDialog.tsx`, `IdeAutoConnectDialog.tsx`, `KeybindingWarnings.tsx`, `ManagedSettingsSecurityDialog/`, `LspRecommendation/LspRecommendationMenu.tsx`, `ClaudeCodeHint/PluginHintMenu.tsx`, `DesktopUpsell/DesktopUpsellStartup.tsx`, `DesktopHandoff.tsx`, `DiagnosticsDisplay.tsx`, `ExitFlow.tsx`, `ExportDialog.tsx`, `GlobalSearchDialog.tsx` (44 KB), `HistorySearchDialog.tsx`, `QuickOpenDialog.tsx`, `Passes/Passes.tsx`, `PrBadge.tsx`, `PressEnterToContinue.tsx`, `SearchBox.tsx`, `SessionBackgroundHint.tsx`, `SkillImprovementSurvey.tsx`, `TagTabs.tsx`, `TeammateViewHeader.tsx`, `TeleportError.tsx`, `TeleportProgress.tsx`, `TeleportStash.tsx`, `ThinkingToggle.tsx`, `ToolUseLoader.tsx`, `ValidationErrorsList.tsx`, `WorkflowMultiselectDialog.tsx`, `WorktreeExitDialog.tsx`, `wizard/{useWizard,WizardDialogLayout,WizardNavigationFooter,WizardProvider}`, `shell/{ExpandShellOutputContext,OutputLine,ShellProgressMessage,ShellTimeDisplay}`, `SentryErrorBoundary.ts`, `FallbackToolUseErrorMessage.tsx`, `FallbackToolUseRejectedMessage.tsx`, `FileEditToolUpdatedMessage.tsx`, `FileEditToolUseRejectedMessage.tsx`, `NotebookEditToolUseRejectedMessage.tsx`, `InterruptedByUser.tsx`, `AwsAuthStatusBox.tsx`, `ChannelDowngradeDialog.tsx`, `CostThresholdDialog.tsx`, `AdvisorMessage` (in messages), `AgentProgressLine.tsx`.

### 2.15 Composer keys & message-bubble variants (specific answers)

- **Composer fields handled** (from `PromptInput.tsx` imports): value, mode (`PromptInputMode = chat|bash|memory|plan`), cursor offset, vim mode, queued commands, suggestions, history, paste content (`PastedContent`), images (`ImageDimensions`), permission mode, fastMode, effort level, model, theme, IDE selection, mcp servers, agent context, channels, sticky prompts, file references, voice transcript.
- **Message-bubble variants**: assistant/text, assistant/tool-use, assistant/thinking (incl. redacted), user/text, user/bash-input, user/bash-output, user/command, user/memory, user/plan, user/image, user/teammate, user/channel, user/local-command-output, user/agent-notification, user/resource-update, user/prompt, user/tool-result, system/text, system/api-error, attachment, advisor, plan-approval, rate-limit, shutdown, hook-progress, task-assignment, compact-boundary, collapsed-read-search, grouped-tool-use. ~30 distinct variants.
- **Diff/code-block components**: `StructuredDiff.tsx`, `StructuredDiffList.tsx`, `StructuredDiff/Fallback.tsx`, `FileEditToolDiff.tsx`, `HighlightedCode.tsx`, `HighlightedCode/Fallback.tsx`, `Markdown.tsx` (calls into Highlighted), `MarkdownTable.tsx`. Diff renders as two RawAnsi columns (gutter + content) for selection support, cached in `WeakMap<StructuredPatchHunk, Map<string, CachedRender>>` (`StructuredDiff.tsx:41`).
- **Status bar**: `StatusLine.tsx:30` (`statusLineShouldDisplay`) + `StatusNotices.tsx`. The status line is a **user-scriptable command** — `executeStatusLineCommand` is invoked with the full hook input (`StatusLine.tsx:36-100`), so users can provide their own status-line script.

---

## 3. Ink

### 3.1 What's in `ink/` and `ink.ts`

`ink.ts` (85 lines) is the public re-export façade. It wraps Ink's render with the theme provider so every call site automatically gets a `ThemeContext`:

- `withTheme(node)` (`ink.ts:14`) wraps in `ThemeProvider`.
- `render(node, options)` (`ink.ts:18`) and `createRoot(options)` (`ink.ts:25`) re-export Ink's APIs through the wrapper.
- It re-exports the _design-system_ variants (`ThemedBox`, `ThemedText`) under the names `Box`/`Text` (`ink.ts:35-37`) so `import { Box, Text } from '../ink.js'` always returns themed components, and the _raw_ Ink primitives as `BaseBox`/`BaseText` (`ink.ts:47, 62`).
- Other re-exports: `Ansi` (`ink/Ansi.tsx`), `Button` (`ink/components/Button.tsx`), `Link`, `Newline`, `NoSelect`, `RawAnsi`, `Spacer`, all hooks (`useInput`, `useApp`, `useStdin`, `useSelection`, `useTabStatus`, `useTerminalFocus`, `useTerminalTitle`, `useTerminalViewport`, `useAnimationFrame`, `useAnimationTimer`/`useInterval`), `FocusManager`, `EventEmitter`, `Event`, `InputEvent`, `ClickEvent`, `TerminalFocusEvent`, `measureElement`, `wrapText`.

`ink/` is a **vendored, modified Ink** (this is _not_ the npm `ink` package). Key files:

| File                                                                                                                                                                                                                               | Purpose                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ink/ink.tsx` (251 KB)                                                                                                                                                                                                             | The main Ink class — render loop, stdin handling, console patching.                                                                                                                                                                                                                                                                                       |
| `ink/root.ts`                                                                                                                                                                                                                      | Managed `Root` API (createRoot/renderSync/render).                                                                                                                                                                                                                                                                                                        |
| `ink/reconciler.ts`                                                                                                                                                                                                                | React reconciler binding.                                                                                                                                                                                                                                                                                                                                 |
| `ink/render-to-screen.ts` + `render-node-to-output.ts` (63 KB)                                                                                                                                                                     | Tree → ANSI string.                                                                                                                                                                                                                                                                                                                                       |
| `ink/screen.ts` (49 KB)                                                                                                                                                                                                            | Screen buffer with diffing.                                                                                                                                                                                                                                                                                                                               |
| `ink/output.ts` (26 KB)                                                                                                                                                                                                            | Output stream / log-update.                                                                                                                                                                                                                                                                                                                               |
| `ink/log-update.ts` (27 KB)                                                                                                                                                                                                        | The log-update mechanism (incremental rerender).                                                                                                                                                                                                                                                                                                          |
| `ink/dom.ts`                                                                                                                                                                                                                       | DOMElement types.                                                                                                                                                                                                                                                                                                                                         |
| `ink/parse-keypress.ts` (23 KB)                                                                                                                                                                                                    | Keypress parser (vt sequences, csi-u, kitty protocol).                                                                                                                                                                                                                                                                                                    |
| `ink/styles.ts` (20 KB)                                                                                                                                                                                                            | Style flattening.                                                                                                                                                                                                                                                                                                                                         |
| `ink/selection.ts` (35 KB)                                                                                                                                                                                                         | Mouse selection / clipboard.                                                                                                                                                                                                                                                                                                                              |
| `ink/searchHighlight.ts`                                                                                                                                                                                                           | Search highlight overlay.                                                                                                                                                                                                                                                                                                                                 |
| `ink/terminal.ts` + `terminal-querier.ts` + `terminal-focus-state.ts`                                                                                                                                                              | Terminal capabilities (kitty, sync output, etc).                                                                                                                                                                                                                                                                                                          |
| `ink/optimizer.ts`                                                                                                                                                                                                                 | Frame optimizer.                                                                                                                                                                                                                                                                                                                                          |
| `ink/render-border.ts`                                                                                                                                                                                                             | Box border rendering.                                                                                                                                                                                                                                                                                                                                     |
| `ink/wrap-text.ts` + `wrapAnsi.ts` + `tabstops.ts` + `stringWidth.ts` + `widest-line.ts` + `bidi.ts` + `node-cache.ts` + `line-width-cache.ts` + `measure-element.ts` + `measure-text.ts` + `squash-text-nodes.ts` + `colorize.ts` | Layout / text utilities.                                                                                                                                                                                                                                                                                                                                  |
| `ink/clearTerminal.ts` + `frame.ts` + `focus.ts` + `get-max-width.ts` + `hit-test.ts` + `instances.ts` + `renderer.ts` + `supports-hyperlinks.ts` + `useTerminalNotification.ts` + `warn.ts` + `constants.ts`                      | Misc.                                                                                                                                                                                                                                                                                                                                                     |
| `ink/components/`                                                                                                                                                                                                                  | Custom Ink primitives: `App.tsx`, `AppContext.ts`, `AlternateScreen.tsx`, `Box.tsx`, `Button.tsx`, `ScrollBox.tsx`, `Text.tsx`, `Spacer.tsx`, `Newline.tsx`, `Link.tsx`, `RawAnsi.tsx`, `NoSelect.tsx`, `ErrorOverview.tsx`, `ClockContext.tsx`, `CursorDeclarationContext.ts`, `StdinContext.ts`, `TerminalFocusContext.tsx`, `TerminalSizeContext.tsx`. |
| `ink/hooks/`                                                                                                                                                                                                                       | `use-app.ts`, `use-input.ts`, `use-stdin.ts`, `use-animation-frame.ts`, `use-interval.ts`, `use-selection.ts`, `use-search-highlight.ts`, `use-tab-status.ts`, `use-terminal-focus.ts`, `use-terminal-title.ts`, `use-terminal-viewport.ts`, `use-declared-cursor.ts`.                                                                                    |
| `ink/events/`                                                                                                                                                                                                                      | Custom event system: `dispatcher.ts`, `emitter.ts`, `event.ts`, `event-handlers.ts`, `click-event.ts`, `focus-event.ts`, `input-event.ts`, `keyboard-event.ts`, `terminal-event.ts`, `terminal-focus-event.ts`.                                                                                                                                           |
| `ink/layout/`                                                                                                                                                                                                                      | `engine.ts`, `geometry.ts`, `node.ts`, `yoga.ts` — Yoga layout binding.                                                                                                                                                                                                                                                                                   |
| `ink/termio/`                                                                                                                                                                                                                      | Terminal I/O parser: `ansi.ts`, `csi.ts`, `dec.ts`, `esc.ts`, `osc.ts`, `parser.ts`, `sgr.ts`, `tokenize.ts`, `types.ts`.                                                                                                                                                                                                                                 |
| `ink/termio.ts`                                                                                                                                                                                                                    | Top-level termio export.                                                                                                                                                                                                                                                                                                                                  |

### 3.2 Mounting

`main.tsx:2227-2229` calls `createRoot(ctx.renderOptions)` once. `ctx` comes from `getRenderContext(exitOnCtrlC)` (`interactiveHelpers.tsx:299`), which builds:

- Base options from `getBaseRenderOptions(exitOnCtrlC)`.
- An `FpsTracker` instance with `onFrame` callback that observes `frame_duration_ms`, optionally appends per-frame timing JSONL when `CLAUDE_CODE_FRAME_TIMING_LOG` is set, and logs `tengu_flicker` events (skipped when terminal supports DEC 2026 synchronized output, `interactiveHelpers.tsx:345`).

The single root is then reused across all subcommands. Theme wrapping happens in `ink.ts:18-23, 25-31` — `createRoot()` returns `{...root, render: node => root.render(withTheme(node))}` so every render is automatically wrapped.

---

## 4. Output Styles & Themes

### 4.1 Theme system (real, structured)

`utils/theme.ts:91` defines `THEME_NAMES = ['dark', 'light', 'light-daltonized', 'dark-daltonized', 'light-ansi', 'dark-ansi']` (6 themes). `THEME_SETTINGS = ['auto', ...THEME_NAMES]` adds `'auto'` (`theme.ts:103`). The `Theme` type (`theme.ts:4-89`) is a _flat token bag_ with ~70 named slots covering: brand color (`claude`, `claudeShimmer`), semantic (`success`/`error`/`warning`/`merged`), diff (`diffAdded`, `diffRemoved`, dimmed and word variants), agent colors (`{red,blue,green,yellow,purple,orange,pink,cyan}_FOR_SUBAGENTS_ONLY`), backgrounds (`background`, `userMessageBackground`, `selectionBg`, `bashMessageBackgroundColor`, `memoryBackgroundColor`, `messageActionsBackground`), permissions (`permission`, `autoAccept`, `bashBorder`, `planMode`, `ide`, `promptBorder`), brief mode (`briefLabelYou`, `briefLabelClaude`), rate-limit fill/empty, fast-mode, rainbow (`rainbow_red...violet` plus `_shimmer` variants), and Clawd mascot (`clawd_body`, `clawd_background`).

Light theme starts at `theme.ts:115` (`lightTheme: Theme`).

### 4.2 Theme provider

`components/design-system/ThemeProvider.tsx:43` is the React context. Stored config: `themeSetting` (from `getGlobalConfig().theme`, `ThemeProvider.tsx:35`). Resolution: `'auto'` → `getSystemThemeName()` (OSC 11 query, watched live via `utils/systemThemeWatcher.js`, lines 64-80). Preview: `setPreviewTheme` allows a `usePreviewTheme()` consumer (`ThemePicker`) to live-preview without committing — `savePreview()` commits, `cancelPreview()` reverts.

### 4.3 User customization path for OUTPUT styles (not themes)

`outputStyles/loadOutputStylesDir.ts:26` defines `getOutputStyleDirStyles(cwd)` (memoized). It loads markdown files from:

- Project: `<cwd>/.claude/output-styles/*.md` (and parent dirs upward via `loadMarkdownFilesForSubdir` traversal).
- User: `~/.claude/output-styles/*.md`.

Project styles **override** user styles. Each `.md` file:

- filename → style name (`.md` stripped).
- frontmatter `name` → display name (else filename stem).
- frontmatter `description` → description (or extracted from markdown).
- frontmatter `keep-coding-instructions` (bool/string) → flag.
- file content (after frontmatter) → the system-prompt text.
- Warns if `force-for-plugin` is set on a non-plugin style (`loadOutputStylesDir.ts:65-70`).

`outputStyles/loadOutputStylesDir.ts:94` also exports `clearOutputStyleCaches()` to clear the memoize cache.

The OutputStylePicker UI is `components/OutputStylePicker.tsx`. Default style name is `DEFAULT_OUTPUT_STYLE_NAME` (`constants/outputStyles.ts`).

### 4.4 Per-output-type styling

There is no per-output-type "style override" file — styling is hardcoded into the renderers:

- Markdown: `Markdown.tsx:6` imports `useTheme()`, then routes through `marked` + `formatToken` (`utils/markdown.ts`) which reads theme tokens via `chalk` instances.
- Code: `HighlightedCode.tsx:5` uses `useTheme` + `expectColorFile()` (NAPI Rust syntect-bound).
- Diff: `StructuredDiff.tsx:107` uses `useTheme()` and `getSyntaxTheme(theme)` from `StructuredDiff/colorDiff.ts`.
- Errors: routed through `useTheme()` `error` token (e.g., `interactiveHelpers.tsx:75` `<Text color="error">`). The "color" prop on `ThemedText` accepts theme-token names directly.

So the theme is the _single point_ of styling. There's no separate style sheet per output type.

---

## 5. Keybindings

### 5.1 File format and structure

`keybindings/defaultBindings.ts:32-340` defines a `KeybindingBlock[]`. Each block has `context: string` and `bindings: Record<keystrokeStr, action>`. Default file is TS (compiled from defaults), user file is JSON.

### 5.2 User overrides

`keybindings/loadUserBindings.ts:115` `getKeybindingsPath()` returns `${getClaudeConfigHomeDir()}/keybindings.json` — i.e., `~/.claude/keybindings.json`. Format: `{ "bindings": [ <KeybindingBlock>, ... ] }` (validated at `loadUserBindings.ts:148-189`). User keybindings are _appended_ after defaults (`loadUserBindings.ts:197`), so last-wins overrides natively. **Customization is gated** to Anthropic employees via `tengu_keybinding_customization_release` GrowthBook flag (`loadUserBindings.ts:41-46`); external users always get defaults.

A `chokidar` file watcher (`loadUserBindings.ts:386-396`) re-loads on change with 500ms stability threshold and emits `keybindingsChanged` signal — the `KeybindingProvider` subscribes to this and updates without restart (full hot-reload).

### 5.3 Chord support

YES, multi-key chords are first-class. `keybindings/parser.ts:80` `parseChord(input)` splits on whitespace; `parseKeystroke(part)` parses a single key. `keybindings/resolver.ts:166` `resolveKeyWithChordState()` returns `{ type: 'chord_started', pending }` while waiting for the second key, `{ type: 'match' }` on completion, `{ type: 'chord_cancelled' }` on escape or unmatched continuation. `useKeybinding.ts:74-86` handles the four cases. Default chord example: `'ctrl+x ctrl+k': 'chat:killAgents'` (`defaultBindings.ts:67`), `'ctrl+x ctrl+e': 'chat:externalEditor'` (`defaultBindings.ts:83`).

### 5.4 Per-screen vs Global

Bindings are scoped by `context`. Default contexts (from `defaultBindings.ts`): `'Global'`, `'Chat'`, `'Autocomplete'`, `'Settings'`, `'Confirmation'`, `'Tabs'`, `'Transcript'`, `'HistorySearch'`, `'Task'`, `'ThemePicker'`, `'Scroll'`, `'Help'`, `'Attachments'`, `'Footer'`, `'MessageSelector'`, `'MessageActions'`, `'DiffDialog'`, `'ModelPicker'`, `'Select'`, `'Plugin'`. Components register via `useRegisterKeybindingContext("ContextName")` (`KeybindingContext.tsx`), and the resolver checks active contexts in priority order then `'Global'` (`useKeybinding.ts:53-60`).

### 5.5 Common bindings (verified)

From `defaultBindings.ts`:

- **Global**: `ctrl+c → app:interrupt`, `ctrl+d → app:exit`, `ctrl+l → app:redraw`, `ctrl+t → app:toggleTodos`, `ctrl+o → app:toggleTranscript`, `ctrl+shift+b → app:toggleBrief` (Kairos), `ctrl+shift+o → app:toggleTeammatePreview`, `ctrl+r → history:search`, `ctrl+shift+f / cmd+shift+f → app:globalSearch`, `ctrl+shift+p / cmd+shift+p → app:quickOpen`, `meta+j → app:toggleTerminal`. ctrl+c/ctrl+d are reserved (cannot be rebound — `defaultBindings.ts:38`).
- **Chat**: `escape → chat:cancel`, `ctrl+x ctrl+k → chat:killAgents`, `shift+tab → chat:cycleMode` (or `meta+m` on Win without VT), `meta+p → chat:modelPicker`, `meta+o → chat:fastMode`, `meta+t → chat:thinkingToggle`, `enter → chat:submit`, `up/down → history:previous/next`, `ctrl+_` and `ctrl+shift+- → chat:undo`, `ctrl+x ctrl+e` and `ctrl+g → chat:externalEditor`, `ctrl+s → chat:stash`, `ctrl+v` (or `alt+v` on Windows) → `chat:imagePaste`, `shift+up → chat:messageActions`, `space → voice:pushToTalk` (when VOICE_MODE feature gated on).
- **Settings**: `escape → confirm:no`, `j/k`/`up/down`/`ctrl+n`/`ctrl+p → select:next/previous`, `space → select:accept`, `enter → settings:close`, `/ → settings:search`, `r → settings:retry`.
- **Confirmation**: `y/enter → confirm:yes`, `n/escape → confirm:no`, `tab → confirm:nextField`, `space → confirm:toggle`, `shift+tab → confirm:cycleMode`, `ctrl+e → confirm:toggleExplanation`, `ctrl+d → permission:toggleDebug`.
- **Transcript**: `ctrl+e → transcript:toggleShowAll`, `ctrl+c/escape/q → transcript:exit`.
- **HistorySearch**: `ctrl+r → historySearch:next`, `escape/tab → historySearch:accept`, `ctrl+c → historySearch:cancel`, `enter → historySearch:execute`.
- **Scroll**: `pageup/pagedown → scroll:pageUp/pageDown`, `wheelup/wheeldown → scroll:lineUp/lineDown`, `ctrl+home/ctrl+end → scroll:top/bottom`, `ctrl+shift+c / cmd+c → selection:copy`.
- **Tabs**: `tab → tabs:next`, `shift+tab → tabs:previous`, `right/left → tabs:next/previous`.
- **Task**: `ctrl+b → task:background`.
- **ModelPicker**: `left/right → modelPicker:decreaseEffort/increaseEffort`.
- **Footer**: arrow nav, `enter → footer:openSelected`, `escape → footer:clearSelection`.

The reserved-shortcut list lives in `keybindings/reservedShortcuts.ts` (3.6 KB).

### 5.6 Display formatting

`keybindings/parser.ts:157` `keystrokeToDisplayString(ks, platform)` shows `opt` on macOS but `alt` elsewhere; `cmd` on macOS, `super` elsewhere. Aliases: `ctrl|control`, `alt|opt|option`, `meta`, `cmd|command|super|win`.

### 5.7 Other keybindings files

- `keybindings/match.ts` — `getKeyName(input, key)` and `matchesBinding`.
- `keybindings/schema.ts` — JSON schema for user file.
- `keybindings/validate.ts` (14 KB) — duplicate detection + validation warnings.
- `keybindings/template.ts` — generates the default user file template.
- `keybindings/shortcutFormat.ts` — `getShortcutDisplay()`.
- `keybindings/useShortcutDisplay.ts` — React hook for inline shortcut hints.
- `keybindings/KeybindingContext.tsx` (26 KB) — the React context (active contexts, pending chord, registered handlers).
- `keybindings/KeybindingProviderSetup.tsx` (41 KB) — the provider wrapper.
- `keybindings/types.ts` — core `KeybindingBlock`, `ParsedBinding`, `Chord`, `ParsedKeystroke`, `KeybindingContextName`.

---

## 6. Vim Mode

### 6.1 Implementation: pure state machine

`vim/types.ts:49-86` defines the state machine with TypeScript discriminated unions. `VimState = INSERT | NORMAL`. `INSERT` tracks `insertedText` for dot-repeat. `NORMAL` carries a `CommandState` parser:

```
idle ─► count (digit prefix)
     ─► operator (d/c/y) ─► motion / count / textObj / find / G / g
     ─► find (f/F/t/T) ─► <char>
     ─► g ─► j/k/g
     ─► replace (r) ─► <char>
     ─► indent (>/<) ─► >/<
```

`vim/transitions.ts:59` `transition(state, input, ctx)` is the top-level dispatch; `vim/transitions.ts:64-87` switch on `state.type` and call sub-functions `fromIdle`, `fromCount`, `fromOperator`, `fromOperatorCount`, `fromOperatorFind`, `fromOperatorTextObj`, `fromFind`, `fromG`, `fromOperatorG`, `fromReplace`, `fromIndent`. Persistent state (`PersistentState` in `types.ts:81-86`) carries `lastChange` (RecordedChange union for dot-repeat — `types.ts:92-119`), `lastFind`, register, registerIsLinewise.

### 6.2 Commands supported

From `transitions.ts:98-200` (handleNormalInput) and key sets in `types.ts:125-180`:

- **Operators**: `d` (delete), `c` (change), `y` (yank).
- **Motions** (`SIMPLE_MOTIONS`): `h l j k`, `w b e W B E`, `0 ^ $`.
- **Find**: `f F t T` plus `; ,` (repeat-find, including reverse).
- **Text objects**: `i`/`a` scopes, types `w W " ' \` ( ) b [ ] { } B < >`.
- **Mode entry**: `i I a A o O`.
- **Line ops**: `dd cc yy D C Y`.
- **Goto**: `G`, `gg`, `gj gk` (visual-line).
- **Edit**: `x` (delete char), `J` (join), `~` (toggleCase), `r<char>` (replace), `>>` `<<` (indent).
- **Paste**: `p P`.
- **Repeat / undo**: `.` (dotRepeat), `u` (undo).
- **Counts**: digits 1-9 prefix, capped at `MAX_VIM_COUNT = 10000` (`types.ts:182`).

`vim/operators.ts` (16 KB) is the largest vim file with the actual edit implementations: `executeOperatorMotion`, `executeOperatorTextObj`, `executeOperatorFind`, `executeOperatorG`, `executeOperatorGg`, `executeIndent`, `executeJoin`, `executeLineOp`, `executeOpenLine`, `executePaste`, `executeReplace`, `executeToggleCase`, `executeX`, plus the `OperatorContext` type. `vim/motions.ts` provides `resolveMotion`. `vim/textObjects.ts` provides text-object boundary computation.

### 6.3 Activation scope

Vim is **composer-only** — it's used by `VimTextInput.tsx:13`, which is one of two text inputs the prompt may switch between (`PromptInput.tsx` decides via `isVimModeEnabled()` in `PromptInput/utils.ts`). Triggered when `editorMode: 'vim'` in user config. `useVimInput` (`hooks/useVimInput.ts`) is the bridge — converts ink keypresses → vim transitions. The status line shows the current mode via `vimMode?: VimMode` (`StatusLine.tsx:36`).

---

## 7. Voice Input

### 7.1 The `voice/` directory

ONLY `voice/voiceModeEnabled.ts` lives here (54 lines). It exposes:

- `isVoiceGrowthBookEnabled()` (`voiceModeEnabled.ts:16`) — checks `feature('VOICE_MODE')` build-time flag and `tengu_amber_quartz_disabled` runtime kill-switch.
- `hasVoiceAuth()` (`voiceModeEnabled.ts:32`) — voice REQUIRES Anthropic OAuth (not API keys, not Bedrock/Vertex/Foundry); calls `getClaudeAIOAuthTokens()`.
- `isVoiceModeEnabled()` (`voiceModeEnabled.ts:52`) — both checks combined; for command-time paths.

### 7.2 Real voice pipeline

The actual implementation lives in `services/`, `hooks/`, `commands/`, `context/`:

- `services/voice.ts` (large) — audio capture: lazy-loaded native `audio-capture-napi` (`voice.ts:24-36`, ~1s warm dlopen) for in-process mic on macOS/Linux/Windows; SoX `rec` or ALSA `arecord` fallback on Linux. Sample rate 16000, mono. SoX silence detection: 2s threshold, 3% silence floor. `arecord` is probed via 150ms spawn race because PATH presence ≠ device-open success on WSL1.
- `services/voiceStreamSTT.ts` — STT WebSocket client (the cloud streaming path).
- `services/voiceKeyterms.ts` — keyterm bias.
- `context/voice.tsx` — React context (`useVoiceState`, `useGetVoiceState`, `useSetVoiceState`).
- `hooks/useVoice.ts` — the core voice hook: starts/stops the recorder, emits transcripts.
- `hooks/useVoiceIntegration.tsx:62-100` — push-to-talk integration: detects `space` (or user-customized `voice:pushToTalk` key) **held** for ≥5 rapid keys (HOLD_THRESHOLD), with a 2s modifier-first-press fallback (MODIFIER_FIRST_PRESS_FALLBACK_MS), 120ms RAPID_KEY_GAP_MS.
- `hooks/useVoiceEnabled.ts` — react-render-friendly memoized check.
- `commands/voice/voice.ts` — the `/voice` slash command (toggle, settings, info).
- `components/PromptInput/VoiceIndicator.tsx` — visual indicator.
- `components/LogoV2/VoiceModeNotice.tsx` — startup notice when voice is available.

### 7.3 Push-to-talk vs continuous

**Push-to-talk only**, hold-to-talk specifically. `voice:pushToTalk` is the action (`defaultBindings.ts:96`, default key `space` while in `Chat` context). Implementation requires HOLD detection (5 rapid presses) for bare keys to disambiguate normal typing; modifier combos (e.g., `ctrl+space`) activate on first press.

### 7.4 Voice settings

- Provider: backend voice_stream endpoint on `claude.ai` (Anthropic-OAuth-only — no BYOK voice).
- Language: configurable in voice settings (`commands/voice/`). Keyterms via `services/voiceKeyterms.ts`.
- Kill-switch: `tengu_amber_quartz_disabled` GrowthBook gate.
- Build-time flag: `feature('VOICE_MODE')` — voice can be entirely DCE'd from external builds.

---

## 8. Launchers

### 8.1 `replLauncher.tsx` (22 lines)

`replLauncher.tsx:12` exports `launchRepl(root, appProps, replProps, renderAndRun)`:

- Dynamically imports `components/App.js` and `screens/REPL.js` (lazy-loaded for startup-time win).
- Wraps `<App {...appProps}><REPL {...replProps}/></App>`.
- Calls caller-provided `renderAndRun`. Caller threads through `interactiveHelpers.tsx:98` `renderAndRun()`.

`AppWrapperProps` (`replLauncher.tsx:7`): `getFpsMetrics`, `stats`, `initialState`. The split-out exists so import time of `REPL.tsx` (5005 LOC, 895KB) is _deferred until after_ `showSetupScreens()` finishes.

### 8.2 `dialogLaunchers.tsx` (132 lines, 7 launchers)

Each launcher is a thin `async function` that:

1. Dynamically imports its component (lazy DCE).
2. Calls `showSetupDialog(root, done => <Dialog onComplete={done} ... />)` (one exception: `launchResumeChooser` uses `renderAndRun` because Resume is a long-running screen, not a one-shot dialog).

The seven launchers (named with origin line in `main.tsx` from comments):

1. `launchSnapshotUpdateDialog` — site ~3173, returns `'merge'|'keep'|'replace'`.
2. `launchInvalidSettingsDialog` — site ~3250, settings validation errors. `onContinue` resolves; `onExit` is passed through.
3. `launchAssistantSessionChooser` — site ~4229, picks a bridge session by id.
4. `launchAssistantInstallWizard` — when `claude assistant` finds zero sessions; rejects on install failure (uses `Promise.race`).
5. `launchTeleportResumeWrapper` — site ~4549, interactive teleport session picker.
6. `launchTeleportRepoMismatchDialog` — site ~4597, picks local checkout for target repo.
7. `launchResumeChooser` — site ~4903, mounts `<App><KeybindingSetup><ResumeConversation>`. **Uses `renderAndRun`, not `showSetupDialog`** (`dialogLaunchers.tsx:127`). Preserves `Promise.all` parallelism between worktree-paths fetch and dynamic imports (`dialogLaunchers.tsx:122-126`).

### 8.3 `interactiveHelpers.tsx` (365 lines)

Helper API for all interactive flows:

- `completeOnboarding()` (line 32) — set `hasCompletedOnboarding=true` + `lastOnboardingVersion`.
- `showDialog<T>` (line 39) — base primitive.
- `exitWithError(root, message, beforeExit?)` (line 52) — render error then unmount and `process.exit(1)`. Necessary because `console.error` is swallowed by Ink's `patchConsole`.
- `exitWithMessage(root, message, options)` (line 65) — color/exitCode/beforeExit.
- `showSetupDialog<T>` (line 86) — `showDialog` + `<AppStateProvider><KeybindingSetup>`.
- `renderAndRun(root, element)` (line 98) — render + `startDeferredPrefetches()` + `await waitUntilExit()` + `gracefulShutdown(0)`.
- `showSetupScreens(root, permissionMode, allowDangerouslySkipPermissions, commands?, claudeInChrome?, devChannels?)` (line 104) — the boot orchestrator. Sequence:
  1. Check `process.env.IS_DEMO` and `production==='test'` to short-circuit.
  2. If no theme or no `hasCompletedOnboarding`: show `Onboarding` (line 117).
  3. Unless `CLAUBBIT` env or already accepted: show `TrustDialog` (line 139).
  4. After trust: signal `setSessionTrustAccepted(true)`, reset+init GrowthBook, prefetch system context, handle MCP server approvals.
  5. Show `ClaudeMdExternalIncludesDialog` if external `@includes` present (line 169).
  6. Apply env vars + init OTel (`initializeTelemetryAfterTrust`).
  7. Show `GroveDialog` if qualified (line 195).
  8. Show `ApproveApiKey` if `ANTHROPIC_API_KEY` env is new (line 213).
  9. Show `BypassPermissionsModeDialog` if bypass permission mode requested (line 222).
  10. Show `AutoModeOptInDialog` if `TRANSCRIPT_CLASSIFIER` flag and auto mode (line 233).
  11. Show `DevChannelsDialog` if `KAIROS`/`KAIROS_CHANNELS` and dev channels passed via CLI (line 276).
  12. Show `ClaudeInChromeOnboarding` if first-time chrome user (line 295).
- `getRenderContext(exitOnCtrlC)` (line 299) — assembles `{renderOptions, getFpsMetrics, stats}`. Wires `FpsTracker`, optional `CLAUDE_CODE_FRAME_TIMING_LOG` JSONL writer, flicker analytics with synchronized-output skip.

---

## 9. Cross-References

### 9.1 Which screens call which components?

- **REPL** (`screens/REPL.tsx`) is the heaviest consumer. Direct imports include: `Messages`, `TaskListV2`, `TeammateViewHeader`, `MessageSelector`, `PromptInput`, `PromptInputQueuedCommands`, `PermissionRequest`, `SkillImprovementSurvey`, `Spinner`/`SpinnerWithVerb`/`BriefIdleStatus`, `CostThresholdDialog`, `IdleReturnDialog`, `WorkerPendingPermission`, `ElicitationDialog`, `PromptDialog`, `KeybindingSetup`, `GlobalKeybindingHandlers`, `CommandKeybindingHandlers`, `CancelRequestHandler`, plus `VoiceKeybindingHandler` (conditional). Indirect: nearly every dialog under `components/` is mounted at some path (e.g., from `PromptInput`).
- **ResumeConversation** (`screens/ResumeConversation.tsx`) imports `LogSelector`, `Spinner`, `REPL` itself (mounted post-selection at line 35). Uses `useKeybinding`.
- **Doctor** (`screens/Doctor.tsx`) imports `KeybindingWarnings`, `McpParsingWarnings`, `Pane`, `PressEnterToContinue`, `SandboxDoctorSection`, `ValidationErrorsList`. No further screens.

### 9.2 Which screens hook into `services/`, `bridge/`, `commands/`, `tools/`?

- **REPL** consumes everything: `services/analytics`, `services/notifier`, `services/preventSleep`, `services/mcp`, `services/PromptSuggestion`, `services/claudeAiLimits`, `services/compact`, plus `commands.ts`, `commands/fast/fast`, `commands/review/ultrareviewEnabled`, `commands/terminalSetup/terminalSetup`. Tools: `tools.ts`, `tools/AgentTool/*`, `tools/WebFetchTool/prompt`, `tools/SleepTool/prompt`, `tools/BashTool/bashPermissions`. Bridge: `useReplBridge`, `useDirectConnect`, `useSSHSession`, `useRemoteSession`. Tasks: `tasks/InProcessTeammateTask`, `tasks/LocalAgentTask`, `tasks/RemoteAgentTask`.
- **ResumeConversation** uses `services/analytics`, `services/mcp/types`, `tools/AgentTool/loadAgentsDir`, plus `utils/conversationRecovery`, `utils/sessionStorage`, `utils/sessionRestore`, `utils/agenticSessionSearch`, `utils/asciicast`.
- **Doctor** uses `utils/doctorContextWarnings`, `utils/doctorDiagnostic`, `utils/autoUpdater`, `utils/nativeInstaller/pidLock`, `utils/settings/settings`, `utils/shell/outputLimits`, `utils/task/outputFormatting`, `utils/xdg`. No bridge, no commands, no tools.

### 9.3 Which dialogs hook into config / state?

- `ApproveApiKey` ↔ `utils/config.ts` via `getCustomApiKeyStatus` + `saveGlobalConfig`.
- `Onboarding` ↔ `state/AppState`, `useTheme`, `getGlobalConfig`, `saveGlobalConfig`.
- `TrustDialog` ↔ `services/mcpServerApproval`, `utils/config` (sets trust state).
- `KeybindingProviderSetup` ↔ subscribes to `loadUserBindings`'s `keybindingsChanged` signal.
- All pickers (`ModelPicker`, `ThemePicker`, `OutputStylePicker`) flow through `useSetAppState` to update global app state and call `updateSettingsForSource()` to persist.

---

## 10. Open Questions

1. **Where is the actual `Screen` type defined inside `REPL.tsx`?** The file is 5005 LOC. `MessageRow.tsx:5` imports `type { Screen } from '../screens/REPL.js'`, confirming a `Screen` enum is exported. The values likely include `'transcript' | 'prompt' | ...` but I did not chase them down — needs a `grep -n "^export type Screen\|export type Screen ="` inside REPL.tsx. This matters for the gap analysis because it defines the _internal_ states the REPL flips between (vs. our Rust TUI's pages model).

2. **What exactly is `KeybindingProviderSetup` doing in 41 KB?** It's larger than the rest of `keybindings/` combined. From `loadUserBindings.ts:386-416` we know it subscribes to chokidar reloads, but `KeybindingProviderSetup.tsx` likely also handles: (a) ChordInterceptor for the pending-chord delay/timeout, (b) reserved-key validation with user-visible warnings, (c) per-context activation registration via `useRegisterKeybindingContext`. Worth a deeper read for our Ratatui equivalent.

3. **How is voice-mode's hold-to-talk implemented at the keystroke level?** `useVoiceIntegration.tsx:39-45` mentions `RAPID_KEY_GAP_MS = 120` with a 5-keypress threshold, but this seems to assume terminal auto-repeat fires on hold. Some terminals send key-release events via the kitty keyboard protocol — does the implementation detect kitty-protocol release events when available, or is it strictly auto-repeat-based? The latter degrades on Windows Terminal without VT mode and on `tmux` (no kitty passthrough). For our Rust CLI we need to know whether to require kitty protocol or accept a 600ms-fallback equivalent.

4. **Is there a unified "screen registry" or is screen-flow really just `main.tsx` + `commander`?** Confirmed by inspection: the routing is _imperative_ (commander handlers call launchers). There is no router, no URL, no central registry. This is intentional (each launcher dynamic-imports its components for cold-start TTFT), but it means the screen graph is implicit — Anthropic apparently treats "screen" as a pattern, not a primitive. For our Rust TUI we should consider whether to mirror this (each command owns its UI) or extract a screen registry.

5. **Themes are a flat ~70-token bag — is there any composition/inheritance?** `theme.ts:115` shows `lightTheme: Theme` as a plain object literal. There's no theme inheritance ("dark-daltonized extends dark") I could find. The 6 themes are likely 6 hand-tuned literals. For agiworkforce CLI we should decide: copy this pattern (cheap, audit-friendly, no surprises) or build a token system.

6. **Where exactly does `voice:pushToTalk` get registered if user null-unbinds it?** `defaultBindings.ts:91-96` notes that `space → voice:pushToTalk` is registered "so getShortcutDisplay finds it without hitting the fallback analytics log" but warns that null-unbinding `space` "swallows the event (space dead for typing)". This is a known footgun; users must use `/voice` to disable rather than null-unbind. Worth documenting if we copy.

7. **Is the `ScrollKeybindingHandler` keybinding fall-through documented anywhere?** `useKeybinding.ts:113-122` mentions the convention that returning `false` means "not consumed, propagate to next handler", with `ScrollKeybindingHandler:573` cited in a comment as an example. Multiple handlers per key per context = layered behaviour; understanding this is essential for getting permission-prompt + scroll keys right at the same time in our TUI.

---

## Notes on coverage and limits

I read the launchers (`replLauncher.tsx`, `dialogLaunchers.tsx`, `interactiveHelpers.tsx`, `ink.ts`) **in full**. I read `defaultBindings.ts`, `parser.ts`, `loadUserBindings.ts`, `resolver.ts`, `useKeybinding.ts` in full. I read `vim/types.ts` and `vim/transitions.ts` in full. Voice: I read `voice/voiceModeEnabled.ts` in full plus the imports to validate the integration shape. Themes: read enough of `utils/theme.ts` and `ThemeProvider.tsx` to enumerate. For the 144 components, I cataloged each by name and grouped by purpose, citing entry-points. The five biggest files (`REPL.tsx` 5005, `LogSelector.tsx` 200K, `Messages.tsx` 833, `Feedback.tsx` 87K, `ContextVisualization.tsx` 76K) were skimmed at the imports/types layer only.

Anywhere I cite a component without `:line`, the citation is the file path; with `:line` the claim is anchored to that source line.

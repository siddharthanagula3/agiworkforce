# C3 — components/ chunk 3 (entries 196..292)

> **Scope.** 97 files from `~/Desktop/reference/src/components/...` produced by `find … -type f | sort | sed -n '196,292p'`. Covers the latter half of `messages/` (specifically the `User*Message` family + the `UserToolResultMessage/` subtree), the standalone `MessageSelector/MessageTimestamp/ModelPicker/NativeAutoUpdater/Onboarding/Outputting/Updater/Passes/PrBadge/PressEnterToContinue` files, the entire `permissions/` tree (per-tool dialogs + rules subdirectory + hooks/utils/explanation), and the first ten `PromptInput/*` modules.
> **Method.** Files are React Compiler outputs (Ink/CLI rendering); compiled `_c(...)` blocks were skipped — semantics were read from props/types/return JSX. Source-map base64 confirms originals where they remain inline.

---

## 1. Inventory by feature group

### 1.1 messages/User\*Message — XML-tagged user-side rendering

The CLI represents user-side payloads not as plain text but as **XML envelopes** that the renderer dispatches on. Each `User*Message` component is a leaf renderer; `UserTextMessage.tsx` is the dispatcher.

- `messages/UserTextMessage.tsx:38-79` — Top-level dispatcher. Inspects `param.text`, calls `extractTag(...)`, and routes to one of: `UserPlanMessage`, `UserBashOutputMessage`, `UserLocalCommandOutputMessage`, `MessageResponse(<InterruptedByUser/>)` (for `INTERRUPT_MESSAGE` / `INTERRUPT_MESSAGE_FOR_TOOL_USE`), `UserGitHubWebhookMessage` (gated `feature('KAIROS_GITHUB_WEBHOOKS')`), `UserBashInputMessage`, `UserCommandMessage`, `UserMemoryInputMessage`, `UserTeammateMessage` (gated `isAgentSwarmsEnabled()`), `UserAgentNotificationMessage`, `UserResourceUpdateMessage`, `UserForkBoilerplateMessage` (gated `feature('FORK_SUBAGENT')`), `UserCrossSessionMessage` (gated `feature('UDS_INBOX')`), `UserChannelMessage` (gated `feature('KAIROS') || feature('KAIROS_CHANNELS')`), or fallback `UserPromptMessage`. Filters out `<tick>` and `<local-command-caveat>` tags entirely.
- `messages/UserPromptMessage.tsx:31-79` — Plain user prompt. Hard-caps display at 10,000 chars (`MAX_DISPLAY_CHARS=28`) with head/tail slicing (`TRUNCATE_HEAD_CHARS=2_500`, `TRUNCATE_TAIL_CHARS=2_500`) — `cat 11k-line-file | claude` would otherwise re-wrap on every Ink frame, causing 500ms+ keystroke latency. Hooks (`useAppState`, `useMemo`) are conditional on `feature('KAIROS')||feature('KAIROS_BRIEF')` so external builds skip the per-message store subscription. Renders via `HighlightedThinkingText` with optional brief layout + timestamp; `MessageActionsSelectedContext` toggles a "messageActionsBackground" highlight when selected.
- `messages/UserPlanMessage.tsx:9-41` — Boxed "Plan to implement" panel with `borderStyle="round" borderColor="planMode"`, renders body via `<Markdown>`.
- `messages/UserBashInputMessage.tsx` — Extracts `<bash-input>`, renders with `! ` prefix in `bashBorder` color on `bashMessageBackgroundColor`.
- `messages/UserBashOutputMessage.tsx` — Unwraps `<bash-stdout>` then optional inner `<persisted-output>`, plus `<bash-stderr>`, delegates to `BashToolResultMessage`.
- `messages/UserLocalCommandOutputMessage.tsx` — Extracts `<local-command-stdout>`/`<local-command-stderr>`, renders inside `IndentedContent` with a `⏿` corner glyph; if content starts with `DIAMOND_OPEN/DIAMOND_FILLED`, switches to `CloudLaunchContent` which parses a header line `"label · suffix"` and renders bold label + dim suffix above the rest.
- `messages/UserCommandMessage.tsx:12-107` — Extracts `<command-message>` + `<command-args>` + `<skill-format>`. Skill format → `Skill(name)`; otherwise renders `▶ /command args` with `figures.pointer` and `userMessageBackground`.
- `messages/UserMemoryInputMessage.tsx` — `<user-memory-input>` block. Renders a `#` glyph in `remember` color on `memoryBackgroundColor`, plus a `MessageResponse` line with a randomly-sampled saving message (`['Got it.', 'Good to know.', 'Noted.']`).
- `messages/UserAgentNotificationMessage.tsx` — Extracts `<summary>` + `<status>` from `<task-notification>`. Maps status → color: `completed→success, failed→error, killed→warning, default→text`. Shows a colored `BLACK_CIRCLE` + summary on one line.
- `messages/UserChannelMessage.tsx` — Inbound MCP channel-pushed message. Regex parses `<channel source="..." user="..." chat_id="...">body</channel>`, strips the longest plugin scope from server name (`plugin:slack-channel:slack` → `slack`), truncates body to 60 chars, renders `→ {server·user}: {truncated}`.
- `messages/UserImageMessage.tsx` — `[Image #N]` chip. If terminal supports hyperlinks (`supportsHyperlinks()`) and `getStoredImagePath(imageId)` returns a path, renders as a `<Link url={pathToFileURL(...).href}>`. Wraps in `MessageResponse` when continuing a turn, `<Box marginTop={1}>` when starting a new turn.
- `messages/UserResourceUpdateMessage.tsx` — Parses `<mcp-resource-update server="..." uri="...">` and `<mcp-polling-update type="tool" server="..." tool="...">`. URI formatter: `file://` URIs collapse to basename; long URIs truncated to 39 chars + `…`. Renders `↻ {server}: {uri/tool} · {reason}` with success/dim/suggestion colors.
- `messages/UserTeammateMessage.tsx:55-141` — Multi-message envelope. Parses `<teammate-message teammate_id="alice" color="red" summary="...">…</teammate-message>` with global RegExp matchAll. Pre-filters approved-shutdown lifecycle messages and `teammate_terminated` JSON. For each surviving message tries in order: `tryRenderPlanApprovalMessage`, `tryRenderShutdownMessage`, `tryRenderTaskAssignmentMessage`. Special-cases `idle_notification` (hidden) and `task_completed` (renders `✓ Completed task #{id} ({subject})`). Default `TeammateMessageContent` shows `@{name}▸` with optional summary + body in transcript mode.
- `messages/teamMemSaved.ts` — Tiny pure helper. Returns `{ segment: "N team memory|memories", count }` for the memory-saved UI when `message.teamCount > 0`. Comment notes: "Plain function (not React) so the React Compiler won't hoist the teamCount property access for memoization." Only loaded when `feature('TEAMMEM')`.

### 1.2 messages/UserToolResultMessage/ — tool-result branching

- `UserToolResultMessage.tsx:23-104` — Looks up the `Tool` and `ToolUse` via `useGetToolFromMessages` (memoized `lookups.toolUseByToolUseID.get`). Branches: `CANCEL_MESSAGE` → `UserToolCanceledMessage`; `REJECT_MESSAGE` or `INTERRUPT_MESSAGE_FOR_TOOL_USE` → `UserToolRejectMessage`; `param.is_error` → `UserToolErrorMessage`; default → `UserToolSuccessMessage`.
- `UserToolErrorMessage.tsx:23-101` — More branches: `INTERRUPT_MESSAGE_FOR_TOOL_USE` → InterruptedByUser; `PLAN_REJECTION_PREFIX` → `RejectedPlanMessage` (with extracted plan); `REJECT_MESSAGE_WITH_REASON_PREFIX` → `RejectedToolUseMessage`; `feature('TRANSCRIPT_CLASSIFIER')` + `isClassifierDenial(...)` → "Denied by auto mode classifier ⋅ /feedback if incorrect"; otherwise `tool.renderToolUseErrorMessage(...) ?? <FallbackToolUseErrorMessage>`.
- `UserToolSuccessMessage.tsx:25-103` — Calls `tool.outputSchema?.safeParse(message.toolUseResult)` to defend against corrupt resumed transcripts (issue #39817). Calls `tool.renderToolResultMessage(toolResult, filterToolProgressMessages(...), { style, theme, tools, verbose, isTranscriptMode, isBriefOnly, input })`. Tools that return `''` from `userFacingName(undefined)` opt out of tool chrome → skip the width constraint so MarkdownTable's SAFETY_MARGIN=4 holds. Captures `getClassifierApproval(toolUseID)` + `getYoloClassifierApproval(toolUseID)` once on mount via `useState` lazy initializer, then deletes from Map (linear-growth prevention). Renders auto-approved chip + `HookProgressMessage hookEvent="PostToolUse"` inside `SentryErrorBoundary`.
- `UserToolRejectMessage.tsx:21-94` — Calls `tool.renderToolUseRejectedMessage(parsedInput.data, { columns, messages: [], tools, verbose, progressMessagesForMessage, style, theme, isTranscriptMode })`; falls through to `FallbackToolUseRejectedMessage` if either tool or schema is missing.
- `UserToolCanceledMessage.tsx` — Single `<MessageResponse height={1}><InterruptedByUser/></MessageResponse>`.
- `RejectedToolUseMessage.tsx` — Single dim-color "Tool use rejected".
- `RejectedPlanMessage.tsx:9-30` — "User rejected Claude's plan:" header + `<Box borderStyle="round" borderColor="planMode" paddingX={1} overflow="hidden"><Markdown>{plan}</Markdown></Box>`. The `overflow="hidden"` is documented to be required for Windows Terminal.
- `utils.tsx (useGetToolFromMessages)` — Memoized hook, returns `{tool, toolUse} | null`.

### 1.3 Standalone components

- `MessageSelector.tsx:46-200+` — Big modal (830 lines) for /restore. Filters `messages` to user-selectable, appends a synthetic "current prompt" sentinel UUID, defaults visible window of 7 (`MAX_VISIBLE_MESSAGES=7`). Uses `Select` with `OptionWithDescription`. Supports `RestoreOption = 'both' | 'conversation' | 'code' | 'summarize' | 'summarize_up_to' | 'nevermind'` — `summarize`/`summarize_up_to` are _input-type_ options (inline text capture). Handles file-history diff stats via `fileHistoryGetDiffStats` for code-restore previews.
- `MessageTimestamp.tsx:10-58` — Only renders in transcript mode for assistant messages with text content. Format: `hour:minute am/pm` via `toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12:true})`. Box `minWidth` is computed from `stringWidth(formattedTimestamp)` so the gutter is exact-width.
- `ModelPicker.tsx:39-200+` — Settings dialog. 447 lines. Persists effort + model selections with `effortLevelToSymbol` indicator. Skips settings write when `skipSettingsWrite` (used by the assistant-installer wizard so project-scoped choices don't leak into `~/.claude/settings.json`). Cycles effort with two keybindings: `modelPicker:decreaseEffort`/`modelPicker:increaseEffort`. Default-effort logic: when `hasToggledEffort` is false AND `effortValue===undefined`, refocusing onto a different model auto-applies its default effort. Special "Current model" entry pinned to bottom if `initial` isn't in the catalog. Visible-count clamped to 10.
- `NativeAutoUpdater.tsx:51-191` — Polls every 30 minutes via `useInterval(checkForUpdates, 30*60*1000)`. Categorizes errors via `getErrorType(errorMessage)` → `timeout|checksum_mismatch|not_found|permission_denied|disk_full|npm_error|network_error|unknown`. `isUpdatingRef` guard prevents repeated downloads on remount (upstream issue #22413 — the previous `isUpdating` dep caused callback identity to change and re-trigger the initial-check effect). Surfaces "Known issue: {maxVersionIssue}" warning with `claude rollback --safe` hint (Ant-only build).
- `NotebookEditToolUseRejectedMessage.tsx` — Renders `User rejected {edit_mode} cell in {basename(notebook_path)} at cell {cell_id}` with HighlightedCode preview when not delete.
- `OffscreenFreeze.tsx:23-43` — Visibility-based render bailout. Marked `'use no memo'` (React Compiler must NOT memoize it because reading `cached.current` in the return is the freeze mechanism). Children that scroll into terminal scrollback (`!isVisible`) freeze to their last cached element ref so `log-update.ts` doesn't reset the whole terminal on every spinner tick. Honors `InVirtualListContext` — when in a `ScrollBox` virtual list there's no terminal scrollback, so freezing is disabled (and would block click-to-expand because viewport visibility ≠ scroll position).
- `Onboarding.tsx:30-243` — Wizard with stepIDs `'preflight' | 'theme' | 'oauth' | 'api-key' | 'security' | 'terminal-setup'`. Exits via `useExitOnCtrlCDWithKeybindings`. Logs `tengu_began_setup` and `tengu_onboarding_step` per step. Security step uses `OrderedList` with two locked items: "Claude can make mistakes" + "Due to prompt injection risks, only use it with code you trust" (link to `https://code.claude.com/docs/en/security`). Notes `OrderedList misnumbers items when rendering conditionally` — items must be unconditional siblings.
- `OutputStylePicker.tsx:28-110` — Loads `getAllOutputStyles(getCwd())` async, falling back to `OUTPUT_STYLE_CONFIG` on error. Default label: "Default", default description: "Claude completes coding tasks efficiently and provides concise responses". Wraps `Select` in `Dialog` with title "Preferred output style", `visibleOptionCount=10`. Hides input guide and border when `isStandaloneCommand`.
- `PackageManagerAutoUpdater.tsx:20-103` — 30-min poll. Detects `homebrew/winget/apk/unknown` via `getPackageManager()`. Caps update at `maxVersion` if current version > maxVersion. If update available, prints colored hint: `Update available! Run: brew upgrade claude-code` (or `winget upgrade Anthropic.ClaudeCode` / `apk upgrade claude-code` / generic).
- `Passes/Passes.tsx:25-100+` — `/guest-passes` dialog. Uses `getCachedOrFetchPassesEligibility` to gate. Shows pass statuses (1..N, `isAvailable` based on absence of redemption). Enter-to-copy referral link via `setClipboard`. Logs `tengu_guest_passes_link_copied`.
- `PrBadge.tsx:11-96` — Renders `PR #{number}` as a hyperlink; color follows review state via `getPrStatusColor(state)`: `approved→success, changes_requested→error, pending→warning, merged→merged, default→undefined`. Uses `<Link url={url} fallback={label}>` so terminals without OSC-8 still see the bare `#{number}`.
- `PressEnterToContinue.tsx:4-14` — Single static "Press **Enter** to continue…" line in `permission` color.

### 1.4 permissions/ — the safety layer

This is the biggest cluster (40 files, ~6,000 LOC). Architecture: a _core_ of `PermissionDialog` + `PermissionPrompt` + `PermissionRequest` types + per-tool wrappers + `rules/` subdirectory for the `/permissions` settings UI.

#### Core primitives

- `PermissionDialog.tsx:17-71` — The chrome. `borderStyle="round"`, `borderLeft|Right|Bottom={false}` (top-only border), `marginTop={1}`. Two children: `<PermissionRequestTitle title subtitle color={titleColor} workerBadge>` + the body in `<Box flexDirection="column" paddingX={innerPaddingX}>`. Default `color="permission"`, default `innerPaddingX=1`. Optional `titleRight` slot for kbd-shortcut hints etc.
- `PermissionRequestTitle.tsx:12-65` — Title + optional `· @{workerName}` dim badge + optional subtitle (truncate-start when string, raw ReactNode otherwise). Default `color="permission"`.
- `PermissionRequest.tsx` (216 LOC) — The orchestrator type / dispatcher (not fully read; named `Props = { toolUseConfirm, ..., onDone, onReject }` is the canonical request shape per consumer files).
- `PermissionPrompt.tsx:45-200+` — Shared "Do you want to proceed?" + `Select` block. Each option may carry `feedbackConfig: { type: 'accept'|'reject', placeholder? }` — Tab toggles into an `input`-type select option that captures freeform text. Defaults: `accept→'tell Claude what to do next'`, `reject→'tell Claude what to do differently'`. Logs `tengu_{accept|reject}_feedback_mode_{entered|collapsed}`. Tracks `acceptFeedbackModeEntered` / `rejectFeedbackModeEntered` (sticky) so completion analytics can mark `has_instructions=true` even after collapsing.
- `PermissionExplanation.tsx:11-271` — Lazy LLM-backed risk explainer. `usePermissionExplainerUI` returns `{visible, enabled, promise}`. Bound to `confirm:toggleExplanation` keybinding (typically Ctrl+E). Promise is created **only on first toggle** (`!promise`) so users who never invoke it pay zero tokens. `ExplanationResult` uses React 19's `use(promise)` to suspend; risk levels `LOW→success "Low risk"`, `MEDIUM→warning "Med risk"`, `HIGH→error "High risk"`. ShimmerLoadingText animates "Loading explanation…" via `useShimmerAnimation`.
- `PermissionRuleExplanation.tsx:21-120` — Per-decision-reason renderer. Reasons: `classifier` (auto-mode → red, others bold-classifier text), `rule` (with optional "/permissions to update rules" hint, suppressed for `policySettings` source), `hook` (with `/hooks to update`), `safetyCheck`/`other`/`workingDir` (`/permissions` hint only on `workingDir`). Auto mode + hook → warning color override.
- `PermissionDecisionDebugInfo.tsx:1-200+` — Hidden debug UI keyed off Ctrl+D. Renders `decisionReasonDisplayString(decisionReason)` for every reason type including the recursive `subcommandResults` map (each subcommand → tick/cross + reason).
- `PermissionPrompt`, `PermissionDialog`, `PermissionExplanation`, `PermissionRuleExplanation`, `PermissionRequestTitle` — these five are the "primitives" every per-tool dialog composes.

#### Hooks + utils

- `permissions/hooks.ts:31-208` — `usePermissionRequestLogging(toolUseConfirm, unaryEvent)` is the analytics hook. Logs `tengu_tool_use_show_permission_request` once per dialog instance — guarded by a `useRef<string|null>(loggedToolUseID)` to prevent re-fire loops (without it, parent re-renders triggered ~500 MB/min RegExp allocs). Increments `attribution.permissionPromptCount`. Ant-only paths log `tengu_internal_tool_use_permission_request_no_always_allow` for BashTool when no `addRules` suggestion exists, and `tengu_internal_bash_tool_use_permission_request` with full parsed parts. Calls `logUnaryEvent` with `event:'response'`.
- `permissions/utils.ts:1-25` — Tiny `logUnaryPermissionEvent(completion_type, toolUseConfirm, event, hasFeedback?)`.
- `permissions/useShellPermissionFeedback.ts` — Wraps the dual feedback-mode state for Bash/PowerShell prompts.
- `permissions/shellPermissionHelpers.tsx` — Helpers shared between BashPermissionRequest and PowerShellPermissionRequest.

#### Per-tool dialogs

- `BashPermissionRequest/BashPermissionRequest.tsx:71-200+` — Branches into `SedEditPermissionRequest` if `parseSedEditCommand(command)` matches; else `BashPermissionRequestInner`. Inner renders a 20fps `ClassifierCheckingSubtitle` shimmer while auto-approval classifier runs. Heavy use of `getCompoundCommandPrefixesStatic` for "don't ask again for `git push:*`" rules. `getDestructiveCommandWarning` hooks (gated `tengu_destructive_command_warning` GrowthBook).
- `BashPermissionRequest/bashToolUseOptions.tsx:1-146` — Builds the option array for the prompt.
- `PowerShellPermissionRequest/PowerShellPermissionRequest.tsx:22-200+` — Mirrors Bash but for PowerShell. Uses `parsedPrefix` from `getCompoundCommandPrefixesStatic` (sets `editablePrefix` to `"{prefix}:*"`, defaults to raw command for single-line unless multiline detected by `\n` — multiline → undefined → "don't ask again" hidden because settings-corpus shows 14 multiline rules with zero matching twice).
- `SedEditPermissionRequest/SedEditPermissionRequest.tsx:21-100+` — Special-case for `sed -i ... file` where the command is effectively a file edit. Reads existing file via `getFsImplementation().readFile`, applies sed substitution preview, then renders via `FilePermissionDialog`.
- `FileEditPermissionRequest/FileEditPermissionRequest.tsx:28-200+` — Wraps `FilePermissionDialog` with `FileEditToolDiff` content; `ideDiffSupport` lets the user open the diff in their IDE and apply modifications back to `old_string/new_string/replace_all`.
- `FileWritePermissionRequest/FileWritePermissionRequest.tsx:38-160` — Detects whether the file exists (`readFileSync` → ENOENT means new file). Title becomes "Overwrite file" or "Create file". `FileWriteToolDiff` is the body. `ideDiffSupport.applyChanges` writes back into `input.content`.
- `FileWritePermissionRequest/FileWriteToolDiff.tsx:1-88` — Rendered diff for new/overwritten files.
- `NotebookEditPermissionRequest/NotebookEditPermissionRequest.tsx:12-165` — Three operations (`insert this cell into / delete this cell from / make this edit to`). Cell language is `'markdown'|'python'`. `NotebookEditToolDiff.tsx:1-234` highlights the cell source.
- `FilesystemPermissionRequest/FilesystemPermissionRequest.tsx:19-114` — Generic file-tool dispatcher. Calls `tool.getPath(input)` to resolve the path; if missing, falls back to `FallbackPermissionRequest`. `tool.isReadOnly(input)` decides "Read"/"Edit" title.
- `WebFetchPermissionRequest/WebFetchPermissionRequest.tsx:29-200+` — `inputToPermissionRuleContent` extracts `domain:hostname` so "don't ask again for `{hostname}`" persists as a domain rule.
- `SkillPermissionRequest/SkillPermissionRequest.tsx:18-200+` — Three "yes" variants: `yes`, `yes-exact` (don't ask for `{skill}` in `{cwd}`), `yes-prefix` (don't ask for `{commandPrefix}:*`). `shouldShowAlwaysAllowOptions()` gates the latter two.
- `EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.tsx:11-121` — Two options: "Yes, enter plan mode" / "No, start implementing now". Calls `handlePlanModeTransition(currentMode, 'plan')` + `toolUseConfirm.onAllow({}, [{type:'setMode', mode:'plan', destination:'session'}])`. Body lists what plan mode does: "Explore … · Identify patterns · Design strategy · Present a plan". Logs `tengu_plan_enter` with `interviewPhaseEnabled` flag.
- `ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx` (767 LOC, partly read) — Far more complex: response values are `'yes-bypass-permissions' | 'yes-accept-edits' | 'yes-accept-edits-keep-context' | 'yes-default-keep-context' | 'yes-resume-auto-mode' | 'yes-auto-clear-context' | 'ultraplan' | 'no'`. Builds permission-update rules from `AllowedPrompt[]` (each becomes an `addRules` entry with `createPromptRuleContent(p.prompt)`), gated on `isClassifierPermissionsEnabled()`. `autoNameSessionFromPlan` fires-and-forgets a `generateSessionName` Haiku call (head-slice 1000 chars; plans are front-loaded so unlike conversations don't tail-slice).
- `ComputerUseApproval/ComputerUseApproval.tsx:30-200+` — Two-panel dispatcher. `request.tccState` present → `ComputerUseTccPanel` shows "Open System Settings → Accessibility / Screen Recording / Try again" with `execFileNoThrow('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'])`. Otherwise `ComputerUseAppListPanel` for the per-app allowlist. `DENY_ALL_RESPONSE` is the cancel default. `getSentinelCategory` is imported from `@ant/computer-use-mcp/sentinelApps` (Ant-only build).
- `AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx:30-200+` — Wraps the body in `<Suspense>` so syntax-highlight (`getCliHighlightPromise`) can stream in. Disabled when `settings.syntaxHighlightingDisabled`. `MIN_CONTENT_HEIGHT=12, MIN_CONTENT_WIDTH=40, CONTENT_CHROME_OVERHEAD=15`. Body computes per-question max preview height/width based on terminal rows. Companion files: `QuestionView.tsx:43-200+` (per-question render with isOtherFocused for free-text "other" entries), `PreviewBox.tsx`, `PreviewQuestionView.tsx`, `QuestionNavigationBar.tsx`, `SubmitQuestionsView.tsx`, `use-multiple-choice-state.ts`.
- `FallbackPermissionRequest.tsx:16-200+` — Generic fallback. Strips `(MCP)` suffix from `userFacingName`. Three options: `yes`, `yes-dont-ask-again` (adds `addRules` with destination `'localSettings'`), `no`. All three branches log a unary event with `language_name:'none'` and call `toolUseConfirm.onAllow|onReject` accordingly.
- `SandboxPermissionRequest.tsx:15-100+` — Two/three options keyed off `host`: yes / yes-dont-ask-again-for-`{host}` / no. `shouldAllowManagedSandboxDomainsOnly()` hides the persistence option in managed builds.
- `FilePermissionDialog/FilePermissionDialog.tsx:48-110` — Composable file dialog used by FileEdit / FileWrite / NotebookEdit / Sed / Filesystem. Threads `useFilePermissionDialog` (state hook), `permissionOptions.tsx` (option builder), `usePermissionHandler.ts` (selection handler), `ideDiffConfig.ts` (helper to package single edits as `FileEdit[]` for IDE round-trip).
- `WorkerBadge.tsx:15-48` — `● @{name}` colored chip; color from `toInkColor(color)` mapping.
- `WorkerPendingPermission.tsx:16-104` — Worker-side "Waiting for team lead approval" panel with spinner + tool name + action description + "Permission request sent to team `{teamName}` leader" line. Wrapped in `borderColor="warning" borderStyle="round"`.

#### permissions/rules/ — `/permissions` settings UI

- `AddPermissionRules.tsx:18-130` — Add a rule and choose destination (localSettings / projectSettings / userSettings). Each option shows the actual save path via `getRelativeSettingsFilePathForSource`. After adding, runs `detectUnreachableRules(updatedContext, {sandboxAutoAllowEnabled})` to warn the user about shadowed entries.
- `AddWorkspaceDirectory.tsx:21-100+` — Add a workspace dir. Two paths: input form with `getDirectoryCompletions` autocomplete via `useDebounceCallback`; OR if `directoryPath` prop is preset, three-option `RememberDirectoryOption = 'yes-session' | 'yes-remember' | 'no'`.
- `RemoveWorkspaceDirectory.tsx:16-100` — Confirm dialog. On yes, applies `applyPermissionUpdate({type:'removeDirectories', directories:[directoryPath], destination:'session'})`.
- `WorkspaceTab.tsx:25-100+` — Workspace tab in `/permissions`. Lists `additionalWorkingDirectories` from `ToolPermissionContext` plus an `Add directory…` row.
- `RecentDenialsTab.tsx:19-100+` — Lists `getAutoModeDenials()` so the user can post-hoc approve/retry. Maintains `approved: Set<number>` + `retry: Set<number>` and emits `onStateChange` so parent can act on tab exit.
- `PermissionRuleList.tsx:1-100+` (1178 LOC) — The main `/permissions` Pane. Tabs: `'recent' | 'allow' | 'ask' | 'deny' | 'workspace'`. Includes `RuleSourceText` (e.g., "From user settings"), `RuleDetails` (per-rule details + delete confirmation, useKeybinding `'confirm:no'` for cancel). Uses `Tab/Tabs/useTabHeaderFocus/useTabsWidth` from design-system + `SearchBox` + `useSearchInput`. Composes Add/Remove rule + workspace forms.
- `PermissionRuleInput.tsx:19-100+` — TextInput for adding a rule like `Bash(ls:*)` or `WebFetch(domain:example.com)`. Validates via `permissionRuleValueFromString(trimmedValue)`.
- `PermissionRuleDescription.tsx:9-75` — Subtitle renderer per rule. BashTool with `:*` suffix → "Any Bash command starting with **{prefix}**"; with content → "The Bash command **{full}**"; empty → "Any Bash command". Other tools with empty content → "Any use of the **{toolName}** tool".

### 1.5 PromptInput/ subset (10 files)

- `PromptInput.tsx` (2,338 LOC; only top imports read) — Top of the input loop. Imports indicate it composes: `useMaybeTruncateInput`, `usePromptInputPlaceholder`, `useArrowKeyHistory`, `useDoublePress`, `useHistorySearch`, `useInputBuffer`, `useTypeahead`, `usePromptSuggestion`, `useIdeAtMentioned`, `BridgeDialog`, `GlobalSearchDialog`, `HistorySearchDialog`, `ModelPicker`, `QuickOpenDialog`, `BackgroundTasksDialog`, `TeamsDialog`, `AutoModeOptInDialog`, `FastModePicker`. Embeds `Notifications`, `PromptInputFooter`, `PromptInputModeIndicator`, `PromptInputQueuedCommands`, `PromptInputStashNotice`. Tracks suggestion type detection via `findSlashCommandPositions`, `findSlackChannelPositions` (with `subscribeKnownChannels`), `findThinkingTriggerPositions`, `findUltraplanTriggerPositions`, `findUltrareviewTriggerPositions`, `findBuddyTriggerPositions`, `findBtwTriggerPositions`, `findTokenBudgetPositions`. Uses `companionReservedColumns` for the buddy sprite.
- `PromptInputFooter.tsx:63-150+` — Composes `PromptInputFooterLeftSide` + `Notifications` + `BridgeStatusIndicator`. Drops `StatusLine` first when fullscreen rows < 24 (`isShort`). Suggestions visible → render `PromptInputFooterSuggestions` instead of footer; help open → render `PromptInputHelpMenu`.
- `PromptInputFooterLeftSide.tsx:1-110` — Renders permission mode indicator (`permissionModeSymbol/Title`), VimMode text, voice warmup hint, agent-task counter via `useCoordinatorTaskCount`/`getVisibleAgentTasks`, PR badge via `usePrStatus`/`PrBadge`. ProactiveCountdown ticks every second showing "next tick in `{remainingSeconds}s`".
- `PromptInputFooterSuggestions.tsx:1-100+` — Suggestion overlay. Up to 5 items (`OVERLAY_MAX_ITEMS=5`). Icons: `+` for files, `◇` for MCP resources, `*` for agents. File paths get `truncatePathMiddle`; MCP resources get `truncateToWidth(text, 30)`. `isUnifiedSuggestion(itemId)` check based on prefix.
- `PromptInputHelpMenu.tsx:22-100+` — `?` menu. Reads keybindings via `useShortcutDisplay(action, context, fallback)` for: `app:toggleTranscript`, `app:toggleTodos`, `chat:undo`, `chat:stash`, `chat:cycleMode`, `chat:modelPicker`, `chat:fastMode`, `chat:externalEditor`, etc. Displays as `ctrl + o` (formats via `formatShortcut`).
- `PromptInputModeIndicator.tsx:44-92` — Renders `❯ ` (prompt char), `! ` (bash mode), or teammate-colored `❯` when `viewingAgentName` set. `getTeammateColor()` mapped through `AGENT_COLOR_TO_THEME_COLOR` (gated `isAgentSwarmsEnabled()`).
- `PromptInputQueuedCommands.tsx:30-117` — Caps task notifications at `MAX_VISIBLE_NOTIFICATIONS=3`, then injects a synthetic "+{n} more tasks completed" overflow message. Filters out `idle_notification` JSON commands silently. Wraps each queued command in `<Message>` via `normalizeMessages`. `bash` mode gets `<bash-input>{cmd}</bash-input>` re-wrapping. Hidden when `viewingAgentTaskId` is set (so leader's queue isn't shown while inspecting a teammate). Memoized to avoid UUID churn.
- `Notifications.tsx:55-100+` — Bottom-right slot. Composes `TokenWarning`, `IdeStatusIndicator`, `MemoryUsageIndicator`, `AutoUpdaterWrapper`, `SandboxPromptFooterHint`, lazy-loaded `VoiceIndicator` (gated `feature('VOICE_MODE')`). Reads `tokenCountFromLastAPIResponse(getMessagesAfterCompactBoundary(messages))`. Shows compact-suggestion message when `calculateTokenWarningState(...).isAboveWarningThreshold`.
- `HistorySearchInput.tsx:11-50` — Ctrl+R-style reverse search. Two states: `historyFailedMatch` toggles label between `search prompts:` and `no matching prompt:`. Cursor forced to `value.length` since arrow keys cancel search.
- `inputModes.ts:1-33` — `prependModeCharacterToInput(input, mode)` adds `!` prefix for bash, no-op otherwise. `getModeFromInput`/`getValueFromInput` round-trip the prefix. `isInputModeCharacter('!')`.
- `inputPaste.ts:1-90` — Paste truncation. `TRUNCATION_THRESHOLD=10000`, keeps `PREVIEW_LENGTH=1000` (split 500/500 head/tail). Replaces middle with `[...Truncated text #{id} +{numLines} lines...]` and stores the elided content in `pastedContents` keyed by next available numeric id.
- `IssueFlagBanner.tsx:1-12` — Returns `null` in external builds; the source-map shows the Ant-only version (`/issue` prompt with FLAG_ICON).

---

## 2. Cross-references

| Concept                       | Owners                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `<...>` XML tag dispatch      | `messages/UserTextMessage.tsx:38-79` ↔ `constants/xml.ts` (TICK_TAG, COMMAND_MESSAGE_TAG, TEAMMATE_MESSAGE_TAG, TASK_NOTIFICATION_TAG) ↔ each `User*Message`                                                                                                                                               |
| Tool-result rendering         | `UserToolResultMessage.tsx` ↔ `tools/{Bash,FileEdit,FileWrite,Notebook,WebFetch,Skill,...}Tool/*` (`renderToolResultMessage`, `renderToolUseRejectedMessage`, `renderToolUseErrorMessage`)                                                                                                                 |
| Permission decision chain     | `permissions/PermissionRequest.tsx` (entry point) → `permissions/hooks.ts:usePermissionRequestLogging` → per-tool `*PermissionRequest.tsx` → `PermissionDialog` + `PermissionPrompt` + `PermissionRuleExplanation` → `toolUseConfirm.onAllow                                                               | onReject` callbacks |
| Rule storage                  | `permissions/rules/AddPermissionRules.tsx` ↔ `utils/permissions/PermissionUpdate.ts` (`applyPermissionUpdate`, `persistPermissionUpdate`) ↔ `utils/permissions/shadowedRuleDetection.ts` (`detectUnreachableRules`)                                                                                        |
| Brief layout opt-in           | `UserPromptMessage.tsx`, `UserToolSuccessMessage.tsx`, `PromptInputQueuedCommands.tsx` all conditionally subscribe to `useAppState(s=>s.isBriefOnly)` only when `feature('KAIROS')                                                                                                                         |                     | feature('KAIROS_BRIEF')` (compile-time gate avoids per-message useSyncExternalStore in external builds) |
| Classifier approval lifecycle | `UserToolSuccessMessage.tsx` captures via `getClassifierApproval(toolUseID)`/`getYoloClassifierApproval(toolUseID)` then `deleteClassifierApproval(toolUseID)` to prevent linear Map growth ↔ `bashClassifier.ts:isClassifierPermissionsEnabled` ↔ feature-gated `BASH_CLASSIFIER`/`TRANSCRIPT_CLASSIFIER` |
| Auto-naming sessions          | `ExitPlanModePermissionRequest.tsx:autoNameSessionFromPlan` ↔ `commands/rename/generateSessionName.js` ↔ `utils/sessionStorage:saveCustomTitle/saveAgentName`                                                                                                                                              |
| Worker swarm                  | `WorkerBadge.tsx` + `WorkerPendingPermission.tsx` + `UserTeammateMessage.tsx` ↔ `agentSwarmsEnabled()` ↔ `tools/AgentTool/agentColorManager.AGENT_COLOR_TO_THEME_COLOR`                                                                                                                                    |
| IDE diff round-trip           | `FilePermissionDialog/ideDiffConfig.ts` ↔ `useDiffInIDE` hook ↔ each tool's `IDEDiffSupport<T>` (`getConfig` + `applyChanges`)                                                                                                                                                                             |
| Suggestion overlay            | `PromptInput.tsx`'s `findSlashCommandPositions/findSlackChannelPositions/findThinkingTriggerPositions` ↔ `PromptInputFooterSuggestions.tsx:OVERLAY_MAX_ITEMS=5` ↔ `useSetPromptOverlay` portal context                                                                                                     |
| Error categorization          | `NativeAutoUpdater.tsx:getErrorType` mirrors `PackageManagerAutoUpdater.tsx`'s simpler check; both gate on `isAutoUpdaterDisabled()`                                                                                                                                                                       |

---

## 3. Inventory cross-ref

The Anthropic Suite inventory at `/Users/siddhartha/Desktop/agiworkforce/tasks/research/anthropic-claude-suite-may-2026.md` calls out six features that this chunk implements end-to-end:

1. **§1.5 Skills** — `permissions/SkillPermissionRequest/SkillPermissionRequest.tsx` (skill prompt with `yes-exact` / `yes-prefix` rules) + `messages/UserCommandMessage.tsx` (renders `Skill(name)` when `<skill-format>` tag present).
2. **§1.6 Memory** — `messages/UserMemoryInputMessage.tsx` (`#` glyph + saving message) + `messages/teamMemSaved.ts` (`feature('TEAMMEM')`-gated team-memory count).
3. **§3.2 Approval prompt UX** — every `permissions/*PermissionRequest.tsx` is one of the documented variants (read-only file, write file, shell command, always-allow, app access). `PermissionPrompt`'s feedback-mode toggle is the implementation of "tell Claude what to do differently".
4. **§4 Computer Use** — `permissions/ComputerUseApproval/ComputerUseApproval.tsx` is the macOS TCC + per-app allowlist UI. Maps onto the inventory's "Per-app permissions, Denied apps list" line.
5. **§5 Plan Mode** — `permissions/EnterPlanModePermissionRequest` + `permissions/ExitPlanModePermissionRequest` + `messages/UserPlanMessage.tsx` + `messages/UserToolResultMessage/RejectedPlanMessage.tsx`. The 8-value `ResponseValue` enum in ExitPlanMode (bypass / accept-edits / keep-context / resume-auto-mode / clear-context / ultraplan / no) is the mechanism behind "context recovery on plan acceptance".
6. **§5 Connectors / MCP Apps** — `messages/UserResourceUpdateMessage.tsx` (mcp-resource-update + mcp-polling-update) + `messages/UserChannelMessage.tsx` (inbound MCP server push). Handles the "Interactive" + push-update pattern from the spec.

Other touchpoints worth noting for v1 planning:

- The `MessageSelector` /restore + summarize-from-here flow has no equivalent in the Anthropic public surface — it is a Claude Code CLI-specific affordance and can be lifted as a differentiator.
- The `OffscreenFreeze` pattern for spinner-stable scrollback is a TUI-only consideration; web/desktop equivalents already get this for free via virtualized lists.
- `MessageTimestamp` only renders in transcript mode — not on every message — which matches Claude.ai chat (timestamps appear on hover, not inline).

---

## 4. Patterns to lift

Top architectural patterns worth cloning into AGI Workforce TS code (`packages/chat`, `apps/desktop/src/components/Chat/messages/*`, `apps/web/features/chat/components/messages/*`):

**P-1. XML-tagged user-message dispatcher.** The `UserTextMessage` switch over `extractTag(text, ...)` cleanly separates "what is this" from "how do I render it." Today AGI Workforce's `MessageBubble` mixes both. Lifting this gives us per-tag plug-points for memory, command, plan, channel, teammate, and resource-update messages without a giant switch in MessageBubble.

**P-2. Permission Dialog primitive composition.** `PermissionDialog` (chrome) + `PermissionPrompt` (option select with feedback toggle) + `PermissionRuleExplanation` (decision-reason text) + `PermissionExplanation` (lazy LLM risk explainer) is a tight 4-piece kit. The lazy explainer pattern (`use(promise)` + `Suspense`, promise created only on first toggle) is directly portable to web — saves user tokens and explainer-generation cost when not needed.

**P-3. "Always-allow" + classifier-approval pipeline.** The combination of (a) `getClassifierApproval(toolUseID)` captured-once-then-deleted Map, (b) feature-gated `BASH_CLASSIFIER` / `TRANSCRIPT_CLASSIFIER` shimmer subtitle, and (c) feedback-mode toggle on accept and reject is the gold standard for tool-call gating. It's also the answer to our open Wave-2 question on "how to surface auto-routing decisions" — the same `PermissionRuleExplanation` shape (Reason + ConfigPath dim) translates cleanly to "Routed to Pool A because: …" pills.

**P-4. Performance-first message rendering.** Three patterns worth adopting wholesale: (a) the 10k-char head/tail truncation in `UserPromptMessage` to avoid wrap re-flow on giant pasted prompts, (b) `OffscreenFreeze` for scrollback content (in our React-DOM context this maps to `IntersectionObserver` + `useDeferredValue`), and (c) the `'use no memo'` directive paired with `useRef` cache so React Compiler doesn't break the freeze. Our `MessageList` already memoizes per-message but doesn't freeze offscreen — this is a quick win for streaming chat performance on long sessions.

---

## 5. File path

Written to: `/Users/siddhartha/Desktop/agiworkforce/tasks/research/deep/c3-components-chunk-3.md`

97 files in scope (`find ~/Desktop/reference/src/components -type f | sort | sed -n '196,292p'`):

```
~/Desktop/reference/src/components/messages/teamMemSaved.ts
~/Desktop/reference/src/components/messages/UserAgentNotificationMessage.tsx
~/Desktop/reference/src/components/messages/UserBashInputMessage.tsx
~/Desktop/reference/src/components/messages/UserBashOutputMessage.tsx
~/Desktop/reference/src/components/messages/UserChannelMessage.tsx
~/Desktop/reference/src/components/messages/UserCommandMessage.tsx
~/Desktop/reference/src/components/messages/UserImageMessage.tsx
~/Desktop/reference/src/components/messages/UserLocalCommandOutputMessage.tsx
~/Desktop/reference/src/components/messages/UserMemoryInputMessage.tsx
~/Desktop/reference/src/components/messages/UserPlanMessage.tsx
~/Desktop/reference/src/components/messages/UserPromptMessage.tsx
~/Desktop/reference/src/components/messages/UserResourceUpdateMessage.tsx
~/Desktop/reference/src/components/messages/UserTeammateMessage.tsx
~/Desktop/reference/src/components/messages/UserTextMessage.tsx
~/Desktop/reference/src/components/messages/UserToolResultMessage/{RejectedPlanMessage,RejectedToolUseMessage,UserToolCanceledMessage,UserToolErrorMessage,UserToolRejectMessage,UserToolResultMessage,UserToolSuccessMessage,utils}.tsx
~/Desktop/reference/src/components/{MessageSelector,MessageTimestamp,ModelPicker,NativeAutoUpdater,NotebookEditToolUseRejectedMessage,OffscreenFreeze,Onboarding,OutputStylePicker,PackageManagerAutoUpdater}.tsx
~/Desktop/reference/src/components/Passes/Passes.tsx
~/Desktop/reference/src/components/permissions/AskUserQuestionPermissionRequest/{AskUserQuestionPermissionRequest,PreviewBox,PreviewQuestionView,QuestionNavigationBar,QuestionView,SubmitQuestionsView}.tsx
~/Desktop/reference/src/components/permissions/AskUserQuestionPermissionRequest/use-multiple-choice-state.ts
~/Desktop/reference/src/components/permissions/BashPermissionRequest/{BashPermissionRequest,bashToolUseOptions}.tsx
~/Desktop/reference/src/components/permissions/ComputerUseApproval/ComputerUseApproval.tsx
~/Desktop/reference/src/components/permissions/EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.tsx
~/Desktop/reference/src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx
~/Desktop/reference/src/components/permissions/FallbackPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/FileEditPermissionRequest/FileEditPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/FilePermissionDialog/{FilePermissionDialog,permissionOptions}.tsx
~/Desktop/reference/src/components/permissions/FilePermissionDialog/{ideDiffConfig,useFilePermissionDialog,usePermissionHandler}.ts
~/Desktop/reference/src/components/permissions/FilesystemPermissionRequest/FilesystemPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/FileWritePermissionRequest/{FileWritePermissionRequest,FileWriteToolDiff}.tsx
~/Desktop/reference/src/components/permissions/hooks.ts
~/Desktop/reference/src/components/permissions/NotebookEditPermissionRequest/{NotebookEditPermissionRequest,NotebookEditToolDiff}.tsx
~/Desktop/reference/src/components/permissions/{PermissionDecisionDebugInfo,PermissionDialog,PermissionExplanation,PermissionPrompt,PermissionRequest,PermissionRequestTitle,PermissionRuleExplanation}.tsx
~/Desktop/reference/src/components/permissions/PowerShellPermissionRequest/{PowerShellPermissionRequest,powershellToolUseOptions}.tsx
~/Desktop/reference/src/components/permissions/rules/{AddPermissionRules,AddWorkspaceDirectory,PermissionRuleDescription,PermissionRuleInput,PermissionRuleList,RecentDenialsTab,RemoveWorkspaceDirectory,WorkspaceTab}.tsx
~/Desktop/reference/src/components/permissions/SandboxPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/SedEditPermissionRequest/SedEditPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/shellPermissionHelpers.tsx
~/Desktop/reference/src/components/permissions/SkillPermissionRequest/SkillPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/{useShellPermissionFeedback,utils}.ts
~/Desktop/reference/src/components/permissions/WebFetchPermissionRequest/WebFetchPermissionRequest.tsx
~/Desktop/reference/src/components/permissions/{WorkerBadge,WorkerPendingPermission}.tsx
~/Desktop/reference/src/components/{PrBadge,PressEnterToContinue}.tsx
~/Desktop/reference/src/components/PromptInput/{HistorySearchInput,IssueFlagBanner,Notifications,PromptInput,PromptInputFooter,PromptInputFooterLeftSide,PromptInputFooterSuggestions,PromptInputHelpMenu,PromptInputModeIndicator,PromptInputQueuedCommands}.tsx
~/Desktop/reference/src/components/PromptInput/{inputModes,inputPaste}.ts
```

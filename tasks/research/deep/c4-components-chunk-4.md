# C4 — Components Chunk 4 (entries 293..389)

> Reference path: `~/Desktop/reference/src/components/`
> Total component files: **389**. This chunk covers **97 files** (293..389) alphabetically.
> All citations point to `~/Desktop/reference/src/components/<path>:<line>` or as noted.
> Build target: TUI (Ink). Files marked compiled-output have a sourceMappingURL data block whose `sourcesContent` field carries the original `.tsx` source.

---

## 0. Inventory cross-ref (97 files in scope)

PromptInput subdir (9): `PromptInputStashNotice.tsx`, `SandboxPromptFooterHint.tsx`, `ShimmeredInput.tsx`, `useMaybeTruncateInput.ts`, `usePromptInputPlaceholder.ts`, `useShowFastIconHint.ts`, `useSwarmBanner.ts`, `utils.ts`, `VoiceIndicator.tsx`.

Top-level dialogs/panels: `QuickOpenDialog.tsx`, `RemoteCallout.tsx`, `RemoteEnvironmentDialog.tsx`, `ResumeTask.tsx`, `SandboxViolationExpandedView.tsx`, `ScrollKeybindingHandler.tsx`, `SearchBox.tsx`, `SentryErrorBoundary.ts`, `SessionBackgroundHint.tsx`, `SessionPreview.tsx`, `ShowInIDEPrompt.tsx`, `SkillImprovementSurvey.tsx`, `Spinner.tsx`, `Stats.tsx`, `StatusLine.tsx`, `StatusNotices.tsx`, `StructuredDiff.tsx`, `StructuredDiffList.tsx`, `TagTabs.tsx`, `TaskListV2.tsx`, `TeammateViewHeader.tsx`, `TeleportError.tsx`, `TeleportProgress.tsx`, `TeleportRepoMismatchDialog.tsx`, `TeleportResumeWrapper.tsx`, `TeleportStash.tsx`, `TextInput.tsx`, `ThemePicker.tsx`, `ThinkingToggle.tsx`, `TokenWarning.tsx`, `ToolUseLoader.tsx`, `ValidationErrorsList.tsx`, `VimTextInput.tsx`, `VirtualMessageList.tsx`, `WorkflowMultiselectDialog.tsx`, `WorktreeExitDialog.tsx`.

`sandbox/` (5): `SandboxConfigTab.tsx`, `SandboxDependenciesTab.tsx`, `SandboxDoctorSection.tsx`, `SandboxOverridesTab.tsx`, `SandboxSettings.tsx`.

`Settings/` (4): `Config.tsx`, `Settings.tsx`, `Status.tsx`, `Usage.tsx`.

`shell/` (4): `ExpandShellOutputContext.tsx`, `OutputLine.tsx`, `ShellProgressMessage.tsx`, `ShellTimeDisplay.tsx`.

`skills/` (1): `SkillsMenu.tsx`.

`Spinner/` (12): `FlashingChar.tsx`, `GlimmerMessage.tsx`, `index.ts`, `ShimmerChar.tsx`, `SpinnerAnimationRow.tsx`, `SpinnerGlyph.tsx`, `teammateSelectHint.ts`, `TeammateSpinnerLine.tsx`, `TeammateSpinnerTree.tsx`, `useShimmerAnimation.ts`, `useStalledAnimation.ts`, `utils.ts`.

`StructuredDiff/` (2): `colorDiff.ts`, `Fallback.tsx`.

`tasks/` (10): `AsyncAgentDetailDialog.tsx`, `BackgroundTask.tsx`, `BackgroundTasksDialog.tsx`, `BackgroundTaskStatus.tsx`, `DreamDetailDialog.tsx`, `InProcessTeammateDetailDialog.tsx`, `RemoteSessionDetailDialog.tsx`, `RemoteSessionProgress.tsx`, `renderToolActivity.tsx`, `ShellDetailDialog.tsx`, `ShellProgress.tsx`, `taskStatusUtils.tsx`.

`teams/` (2): `TeamsDialog.tsx`, `TeamStatus.tsx`.

`TrustDialog/` (2): `TrustDialog.tsx`, `utils.ts`.

`ui/` (3): `OrderedList.tsx`, `OrderedListItem.tsx`, `TreeSelect.tsx`.

`wizard/` (5): `index.ts`, `useWizard.ts`, `WizardDialogLayout.tsx`, `WizardNavigationFooter.tsx`, `WizardProvider.tsx`.

---

## 1. PromptInput subdir — composer affordances

### 1.1 `PromptInput/PromptInputStashNotice.tsx:8-23`

- Component `PromptInputStashNotice({ hasStash })`. Returns `null` unless `hasStash`. Renders `figures.pointerSmall + " Stashed (auto-restores after submit)"` in a dim text. Pure presentational hint that the user has stash data buffered (e.g. while reviewing a tool prompt).

### 1.2 `PromptInput/SandboxPromptFooterHint.tsx:7-63`

- `SandboxPromptFooterHint()` subscribes to `SandboxManager.getSandboxViolationStore()`, accumulates a transient `recentViolationCount` and resets it after 5000 ms. When `SandboxManager.isSandboxingEnabled()` is false or count is 0, it renders nothing. Otherwise emits "⧈ Sandbox blocked N operation(s) · {ctrl+o} for details · /sandbox to disable".
- Pulls a configurable shortcut display via `useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o')`. Pattern: a transient toast bound to a Zustand-style external store (subscribe→snapshot).

### 1.3 `PromptInput/ShimmeredInput.tsx:15-138`

- `HighlightedInput({ text, highlights })` — splits text by `segmentTextByHighlights`, builds line groups across `\n`, runs an `ShimmerChar` glimmer when any highlight has `shimmerColor`. Animation uses `useAnimationFrame(50)` only when there is shimmer content; otherwise `null` (unsubscribe) to avoid re-renders.
- Sweep window: `lo = min start across shimmer highlights − 10; cycleLength = (hi − lo) + 20`. So the shimmer index loops over a tight window even when the prompt is huge.
- Pattern to lift: animation budget gating ("if no shimmer, pass `null` to `useAnimationFrame` to stop all ticks").

### 1.4 `PromptInput/useMaybeTruncateInput.ts:13-58`

- `useMaybeTruncateInput({ input, pastedContents, onInputChange, setCursorOffset, setPastedContents })`. Once-per-input guard via `useState(false)` flag. If input ≤ 10000 chars, no-op. Otherwise calls `maybeTruncateInput()` and sets `pastedContents` map plus a fresh cursor offset. Resets flag when `input === ''`. Pattern: idempotent post-paste cleanup.

### 1.5 `PromptInput/usePromptInputPlaceholder.ts:25-76`

- Decides composer placeholder: when input non-empty → none. When `viewingAgentName` set → `Message @{name}…` (truncated to 20 chars). Otherwise shows `Press up to edit queued messages` if queue hint count below 3, or an example command from `getExampleCommandFromCache()` for first-time users with `promptSuggestionEnabled`.
- Conditional `require('../../proactive/index.js')` gated by `feature('PROACTIVE') || feature('KAIROS')` for dead-code elimination at bundle time. `usePromptInputPlaceholder.ts:11-14`.

### 1.6 `PromptInput/useShowFastIconHint.ts:5-31`

- Module-level `hasShownThisSession` flag (true session-singleton). When `showFastIcon` flips true, hint shows for 5000 ms then auto-dismisses.

### 1.7 `PromptInput/useSwarmBanner.ts:44-146`

- Returns `{ text, bgColor }` for a banner shown above the prompt indicating swarm context: teammate vs leader vs standalone vs `--agent` CLI flag.
- Logic decisions: `isTeammate() && !isInProcessTeammate()` → `@agentName`; if leader has teammates, choose between `tmux -L … attach` hint (when external) and `@viewedTeammate.identity.agentName` (when in-tmux/in-process); reverse-lookup for `named_agent` active task; falls through to standalone-agent + `--agent` CLI.
- Helper `toThemeColor()` whitelists known `AgentColorName` values via `AGENT_COLOR_TO_THEME_COLOR`.

### 1.8 `PromptInput/utils.ts:12-60`

- `isVimModeEnabled()` reads `getGlobalConfig().editorMode === 'vim'`.
- `getNewlineInstructions()` — terminal-specific text: `'shift + ⏎ for newline'` for Apple Terminal on darwin or when iTerm2/VSCode have the binding installed; otherwise `'\\⏎'` if user has used backslash, else longer help.
- `isNonSpacePrintable(input, key)` — true for typeable text, false for any modifier/nav/escape keystroke. Used to gate the "lazy space after image pill" insertion.

### 1.9 `PromptInput/VoiceIndicator.tsx:24-136`

- `VoiceIndicator({ voiceState })` gates on `feature('VOICE_MODE')`. Switch case: `recording` → "listening…" dim; `processing` → `<ProcessingShimmer/>` (RGB interpolated between `{r:153,g:153,b:153}` and `{r:185,g:185,b:185}` at 2 s period); `idle` → `null`.
- Notable: `VoiceWarmupHint()` is intentionally static ("keep holding…") — comment at `VoiceIndicator.tsx:74-77` explains that the warmup window is too short for an animation to register and would race with auto-repeat space keys.
- `ProcessingShimmer` honours `prefersReducedMotion`.

---

## 2. Top-level dialogs and overlays

### 2.1 `QuickOpenDialog.tsx:28-225`

- Ctrl+Shift+P / Cmd+Shift+P fuzzy file finder. Registers as overlay (`useRegisterOverlay('quick-open')`).
- Adapts layout to terminal width: side-by-side (`columns ≥ 120`) vs bottom preview (`columns < 120`); preview line cap differs accordingly (`VISIBLE_RESULTS - 1` vs `PREVIEW_LINES = 20`).
- Generation counter `queryGenRef` invalidates stale results when typing faster than `generateFileSuggestions()` resolves. Empty query short-circuits to empty state (avoids raw `readdir(cwd)` noise that the @-mention path normally returns).
- Filters out directory entries (`!p.endsWith(path.sep)`), normalises path separators to `/` so `truncatePathMiddle()` works on Windows.
- Tab handler inserts `@path ` (mention); Shift+Tab inserts `path ` (raw insert). Enter opens file via `openFileInExternalEditor()`. Logs both with `tengu_quick_open_select` / `tengu_quick_open_insert` analytics events.

### 2.2 `RemoteCallout.tsx:13-75` + `shouldShowRemoteCallout()`

- One-shot first-run dialog that enables the desktop bridge. On mount it permanently writes `remoteDialogSeen: true` to global config — pure side-effect-once-on-mount pattern.
- Choices: `Enable Remote Control for this session` (opens secure connection to claude.ai) or `Never mind`. `RemoteCallout.tsx:35-43`.
- Helper `shouldShowRemoteCallout()` gates on (a) not seen before, (b) `isBridgeEnabled()`, (c) `getClaudeAIOAuthTokens()?.accessToken`.

### 2.3 `RemoteEnvironmentDialog.tsx:26-80+`

- "Select Remote Environment" dialog. Loads `getEnvironmentSelectionInfo()` via mount effect with cancellation flag, error captured into local state. Updates settings via `updateSettingsForSource()` once user picks. Has `LoadingState` import from design-system.

### 2.4 `ResumeTask.tsx:25-80+`

- Wrapped by `TeleportResumeWrapper`. Calls `fetchCodeSessionsFromSessionsAPI()`, filters by current repo via `detectCurrentRepository()`, sorts by `updated_at` desc.
- Error classification helper `determineErrorType(errorMessage)` returns `'network'|'auth'|'api'|'other'`.
- Displays sessions in a Select with header + status info; integrates `TeleportError` for retry flow.

### 2.5 `ScrollKeybindingHandler.tsx:13-120+`

- Owns wheel-scroll math for the transcript pane. Critical empirical constants:
  - `WHEEL_ACCEL_WINDOW_MS = 40`, `WHEEL_ACCEL_STEP = 0.3`, `WHEEL_ACCEL_MAX = 6` for native terminals (linear ramp).
  - `WHEEL_BOUNCE_GAP_MAX_MS = 200`, `WHEEL_MODE_STEP = 15`, `WHEEL_MODE_CAP = 15`, `WHEEL_MODE_RAMP = 3` for confirmed mouse-wheel (after a flip-back encoder bounce). `WHEEL_MODE_IDLE_DISENGAGE_MS = 1500`.
  - xterm.js path: exponential decay with `WHEEL_DECAY_HALFLIFE_MS = 150`, `WHEEL_DECAY_STEP = 5`, gap-dependent caps (`SLOW = 3`, `FAST = 6`), `WHEEL_BURST_MS = 5`, `WHEEL_DECAY_IDLE_MS = 500`.
- Modal pager keys (`g/G/ctrl+u/d/b/f`) are gated by `isModal=true` to avoid stealing keys from text input.
- Helper `shouldClearSelectionOnKey(key)` (line 115) — bare arrows clear selection; shift/meta/super + nav preserve it; wheel never clears.

### 2.6 `SearchBox.tsx:14-71`

- Reusable input box used by Resume / fuzzy / settings search. Props: `query, placeholder, isFocused, isTerminalFocused, prefix='⌕', width, cursorOffset, borderless`. Renders inverse-cursor block when focused + terminal-focused; falls back to dim text when blurred.

### 2.7 `SentryErrorBoundary.ts:11-28`

- Class boundary. `getDerivedStateFromError()` returns `{hasError:true}`. Render: when `hasError`, renders `null` (silent). Used to guarantee crashes in the UI tree do not kill the parent app.

### 2.8 `SessionBackgroundHint.tsx:27-80+`

- Double-press Ctrl+B handler (`useDoublePress`) — first press shows hint, second within 800 ms backgrounds the session via `onBackgroundSession`.
- Branches on `hasForegroundTasks(state)`: if foreground tasks (bash/agent) exist, Ctrl+B backgrounds them via `backgroundAll()` instead of the session, and writes `hasUsedBackgroundTask: true` once.
- Gated by `isEnvTruthy('false')` placeholder (visibly a bun:bundle compile-time flag stub) and `isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)` opt-out.

### 2.9 `SessionPreview.tsx:20-100+`

- Used in resume picker to render a thumbnail of an old session's transcript. If `isLiteLog(log)` (catalog stub), it lazy-loads the full log via `loadFullLog()` and shows a `LoadingState` while pending. Then renders `<Messages>` over `displayLog` with the full base tool set.
- Keybindings: `confirm:no` → `onExit`; `confirm:yes` → `onSelect(fullLog ?? log)`. Two `useKeybinding` calls scoped to the `Confirmation` context.

### 2.10 `ShowInIDEPrompt.tsx:25-80+`

- Permission prompt shown once an external IDE has opened the diff for review. `ShowInIDEPrompt({filePath, input, onChange, options, ideName, symlinkTarget, …})`.
- Symlink-out warning: when `relative(getCwd(), symlinkTarget).startsWith('..')`, renders a yellow notice that the operation modifies a path outside the working dir via a symlink.
- For VSCode-family terminals (`isSupportedVSCodeTerminal()`) shows a dim "Save file to continue…" hint.

### 2.11 `SkillImprovementSurvey.tsx:17-80+`

- Two-component split: outer `SkillImprovementSurvey` early-returns null when closed or input invalid; inner `SkillImprovementSurveyView` watches for the `0/1` digit press, normalised through `normalizeFullWidthDigits`, and submits `'good'` / `'dismissed'` to `onSelect`. `VALID_INPUTS = ['0','1']`.

### 2.12 `Spinner.tsx:62-120+`

- `SpinnerWithVerb` wraps `BriefSpinner` (when `isBriefOnly && !viewingAgentTaskId`) vs `SpinnerWithVerbInner` to keep the Rules-of-Hooks happy.
- `SpinnerWithVerbInner` orchestrates: `tasks` map, `viewingAgentTaskId`, `expandedView` (`'tasks'`|`'teammates'`), `selectedIPAgentIndex`, `viewSelectionMode`, foregrounded teammate, and pushes the actual 50 ms animation work into `SpinnerAnimationRow`. Comment at `Spinner.tsx:101-104` is explicit: parent only re-renders on prop/app-state change (~25×/turn vs ~383×).
- Dynamic `require()` for teammate components (in spinner index re-export, line 9 of `Spinner/index.ts`) for dead-code elimination.

### 2.13 `Stats.tsx:1-80+`

- `/stats` viewer. Three async loaders for ranges `7d`/`30d`/`all` via `aggregateClaudeCodeStatsForRange()` (Promise that never rejects). Tabs (`Tab`/`Tabs`) for date ranges, ASCII charts via `asciichart`, heatmap via `generateHeatmap()`. Includes `copyAnsiToClipboard()` action. Custom `formatPeakDay()` formats date as "Mar 17".

### 2.14 `StatusLine.tsx:30-80+`

- Builds the status-line input from app state:
  - `feature('KAIROS') && getKairosActive()` → hide (assistant mode).
  - `buildStatusLineCommandInput(...)` constructs the JSON input the user-defined statusline script consumes, including model id+display, workspace dirs, version macro, `output_style`, current usage, context window, rate-limits (5h, 7d, …), session id+name, vim mode, etc.
- `executeStatusLineCommand()` and `createBaseHookInput()` are the integration points (utils/hooks.ts).

### 2.15 `StatusNotices.tsx:18-54`

- Renders a stack of context-driven notices computed by `getActiveNotices({config, agentDefinitions, memoryFiles})`. `memoryFiles` come from `getMemoryFiles()` consumed via `use()` (React 19 promise unwrap). Comment makes a clear separation: "negative" notices stay here, "neutral/positive" status moved to `Settings/Status.tsx`.

### 2.16 `StructuredDiff.tsx:11-80` (+ `StructuredDiff/Fallback.tsx`, `StructuredDiff/colorDiff.ts`, `StructuredDiffList.tsx`)

- `<StructuredDiff>` is a memoised wrapper around the native `color-diff-napi` module's `ColorDiff`/`ColorFile`. A module-level `RENDER_CACHE = WeakMap<patch, Map<key, CachedRender>>` keys on `theme|width|dim|gutterWidth|firstLine|filePath` so remount only re-uses pre-split gutter and content slices (RawAnsi columns).
- `computeGutterWidth(patch)` (`StructuredDiff.tsx:46-49`) = max line number digits + 3 (marker + 2 padding spaces). Defensive: gutter is suppressed if it eats the whole render width.
- `colorDiff.ts:18-37` exposes `getColorModuleUnavailableReason()` (only `'env'` for `CLAUDE_CODE_SYNTAX_HIGHLIGHT` falsy) and gated accessors `expectColorDiff()`, `expectColorFile()`, `getSyntaxTheme(themeName)`.
- `Fallback.tsx:81-100` — `StructuredDiffFallback` renders word-level `diffWordsWithSpace` highlighting when the NAPI module is missing. `CHANGE_THRESHOLD = 0.4` decides when to fall back from word-level to full-line diff.
- `StructuredDiffList.tsx:16-29` — a thin wrapper that maps hunks and intersperses dim `...` ellipsis separators using `intersperse()` from utils.

### 2.17 `TagTabs.tsx:1-80+`

- Horizontal tab bar for tag filters in resume / search. Dynamically truncates each tag to fit, given a window centered on `selectedIndex`, with a left-arrow overflow indicator. Computes `LEFT_ARROW_WIDTH`/`RIGHT_HINT_WIDTH_*` from string widths to keep the layout deterministic.

### 2.18 `TaskListV2.tsx:30-100+`

- TodoV2 task list footer. Behaviour:
  - 30 s `RECENT_COMPLETED_TTL_MS` window so completed tasks fade after a short delay.
  - Tracks `previousCompletedIdsRef` and `completionTimestampsRef` to time fades.
  - `useEffect([tasks])` schedules a `setTimeout` aligned to the earliest expiring completion timestamp — single timer, recomputed only when `tasks` changes.
  - Per-teammate colours derived from `AGENT_COLOR_TO_THEME_COLOR` for swarms.
  - `maxDisplay = rows ≤ 10 ? 0 : min(10, max(3, rows-14))` adapts to terminal height.

### 2.19 `TeammateViewHeader.tsx:14-60`

- Heads the transcript while viewing a teammate. "Viewing @{agentName} · Esc return". `OffscreenFreeze` keeps it stable on partial re-renders.

### 2.20 `TeleportError.tsx:21-60+`

- Sequencer for two error types: `'needsLogin'` and `'needsGitStash'`. Module-level singleton `EMPTY_ERRORS_TO_IGNORE` keeps default-prop identity stable so the mount effect doesn't re-fire (comment at `TeleportError.tsx:16-20`). Renders `ConsoleOAuthFlow` for login and `TeleportStash` for the stash branch.

### 2.21 `TeleportProgress.tsx:7-60+`

- 4-step progress: `validating`, `fetching_logs`, `fetching_branch`, `checking_out`. Uses `useAnimationFrame(100)` to drive a 4-frame `◐◓◑◒` spinner. Pure UI.

### 2.22 `TeleportRepoMismatchDialog.tsx:15-60+`

- Resolves "this repo lives at multiple paths" by validating each path against the target repo via `validateRepoAtPath()`. Removes invalidated paths from local mapping (`removePathFromRepo`) so future runs converge.

### 2.23 `TeleportResumeWrapper.tsx:23-60+`

- Top-level orchestrator. Logs `tengu_teleport_started` once on mount with a `source` enum. Delegates to the `useTeleportResume(source)` hook for state.

### 2.24 `TeleportStash.tsx:14-60`

- Loads `getFileStatus()` (tracked + untracked) on mount. Stash flow runs `stashToCleanState('Teleport auto-stash')` and reports up via `onStashAndContinue` / sets a local error message. Loading + stashing flags are tracked separately so the button can show its own spinner.

### 2.25 `TextInput.tsx:37-60+`

- Cursor inversion is conditioned on terminal focus; voice-mode adds a mini waveform cursor with: 8 block characters (`' ▁…█'`), `SMOOTH = 0.7` EMA, `LEVEL_BOOST = 1.8`, `SILENCE_THRESHOLD = 0.15`. Animation only runs when `voiceState === 'recording' && !reducedMotion`.
- `useClipboardImageHint(isTerminalFocused, !!props.onImagePaste)` toggles a paste-image hint on terminal regain.

### 2.26 `ThemePicker.tsx:30-60+`

- Live preview via `usePreviewTheme()`. Shows a small `<StructuredDiff>` rendered with `getSyntaxTheme(themeName)` so the user sees real diff colours per theme. `onCancel` distinct from `skipExitHandling` for onboarding contexts.

### 2.27 `ThinkingToggle.tsx:18-60`

- Two-option select (`Enabled`/`Disabled`), with a `confirmationPending` two-step flow when toggled mid-conversation (`isMidConversation`). `Pane` + `Byline` design-system primitives wrap it.

### 2.28 `TokenWarning.tsx:21-60+`

- Inner `CollapseLabel` subscribes to the live context-collapse stats store via `useSyncExternalStore(subscribe, () => snapshot string)`. The snapshot is a `|`-joined string of `collapsedSpans|stagedSpans|errors|emptySpawns|idleWarn` (cheap to compare), then split back to numbers. Shows error count or idle warnings prominently.

### 2.29 `ToolUseLoader.tsx:11-41`

- Tiny status indicator (`●` or space) blinking for an in-flight tool. Comment `ToolUseLoader.tsx:18-26` warns about a chalk SGR-22 reset bug: putting `<dim>` and `<bold>` adjacently makes both reset together on `\x1b[22m`, so the sibling tool-name flickers along with the loader unless they're spaced apart.

### 2.30 `TrustDialog/TrustDialog.tsx:23-60+`

- Pre-flight gate when entering an untrusted directory. Computes:
  - `getMcpConfigsByScope('project')` to decide if MCP servers exist.
  - `getHooksSources()` → `.claude/settings.json` and/or `.claude/settings.local.json` (from `TrustDialog/utils.ts:29-43`).
  - `getBashPermissionSources()` (`utils.ts:58-72`) checks `BASH_TOOL_NAME` allow rules.
  - Other sources via `getApiKeyHelperSources`, `getAwsCommandsSources`, `getDangerousEnvVarsSources`, `getGcpCommandsSources`, `getOtelHeadersHelperSources`.
- Memoises through `react.memo_cache_sentinel` — each call site is a single-shot effect.

### 2.31 `ValidationErrorsList.tsx:1-60`

- Builds a nested `TreeNode` of validation errors using `lodash.setWith()` (avoids automatic array creation) and pretty-prints invalid leaf values inline (`"oldName"` / `null` / `undefined` / typed as String). Used for surfacing schema errors in settings.

### 2.32 `VimTextInput.tsx:13-60+`

- Wraps `BaseTextInput` with `useVimInput` hook bindings. Cursor uses `chalk.inverse` only when `isTerminalFocused`, otherwise identity. Honours props `onHistoryReset`, `onClearInput`, `onSubmit`, `onExit`, `onUndo`, `mask`, `multiline`, `disableCursorMovementForUpDownKeys`, `disableEscapeDoublePress`, etc.

### 2.33 `VirtualMessageList.tsx:1-80`

- Owns transcript scroll virtualisation. Caches `extractSearchText` results per message in a `WeakMap` (`fallbackLowerCache`, line 24) and exposes a `JumpHandle` imperative API: `jumpToIndex`, `setSearchQuery`, `nextMatch`/`prevMatch`, `setAnchor`, `warmSearchIndex` (returns elapsed ms), `disarmSearch`. Comments call out that `renderableMessages` indices are local — REPL must go through this handle. `STICKY_TEXT_CAP = 500` bounds prop size for huge piped prompts.

### 2.34 `WorkflowMultiselectDialog.tsx:17-60`

- Two-option multiselect for `@Claude Code` / `Claude Code Review` GitHub App workflows. Uses `SelectMulti` design-system primitive. Empty-submission path sets a local error rather than dispatching `onSubmit([])`.

### 2.35 `WorktreeExitDialog.tsx:29-60+`

- On mount, runs `git status --porcelain` and `git rev-list --count {originalHeadCommit}..HEAD` to count uncommitted changes and ahead-commits. If both are zero → silently calls `cleanupWorktree()` and `process.chdir(worktreeSession.originalCwd)`. Otherwise prompts `Keep` / `Remove`. Lazy `require('../utils/sessionStorage.js')` (`recordWorktreeExit`, line 17-22) breaks an import cycle.

---

## 3. `sandbox/` — sandbox configuration UI

### 3.1 `sandbox/SandboxConfigTab.tsx:5-44`

- Renders the read-only sandbox snapshot: excluded commands, fs read/write restrictions, network restrictions (with `(Managed)` suffix when `shouldAllowManagedSandboxDomainsOnly()`), allowed unix sockets, and a Linux glob-pattern warning showing only the first 3 unsupported patterns plus "(N more)".

### 3.2 `sandbox/SandboxDependenciesTab.tsx:9-104`

- Branch on platform: macOS shows "seatbelt: built-in (macOS)" plus only the ripgrep dependency; Linux/WSL shows ripgrep + bubblewrap + socat + seccomp filter rows. Install hints (`brew install ripgrep` vs `apt install ripgrep`, etc.) are platform-aware.
- "Other errors" filter excludes `ripgrep`, `bwrap`, `socat` to surface unknown errors verbatim instead of swallowing them (`SandboxDependenciesTab.tsx:53`).
- Seccomp install hint is multi-line: `npm install -g @anthropic-ai/sandbox-runtime` or copy `vendor/seccomp/*` and set `sandbox.seccomp.bpfPath` + `applyPath`.

### 3.3 `sandbox/SandboxDoctorSection.tsx:5-39`

- Top-line summary for `/doctor`. Returns null on unsupported platform / not enabled. Otherwise renders error/warning lines using `└` tree characters and a closing "└ Run /sandbox for install instructions" line when there are hard errors.

### 3.4 `sandbox/SandboxOverridesTab.tsx:14-191`

- `SandboxOverridesTab` decides which UI to render: not-enabled, locked-by-policy (read-only), or interactive. Splits the interactive part into `OverridesSelect` (line 63) so `useTabHeaderFocus()` only mounts when the Select is rendered (comment line 60-62 explains the hooks-leakage fix).
- Two modes: `'open'` (allow unsandboxed fallback) and `'closed'` (strict). Confirmation message uses checkmark and circle Unicode.

### 3.5 `sandbox/SandboxSettings.tsx:22-200`

- Top-level shell over `<Pane>` + `<Tabs>` + 3 tabs (`Mode`, `Overrides`, `Config`). `SandboxModeTab` exposes the 3-mode select: `auto-allow` / `regular` / `disabled`. Calls `setSandboxSettings({ enabled, autoAllowBashIfSandboxed })`.
- `useKeybindings` registered with `context: 'Settings'` (line 165-168). The `Suspense` boundary around `Config` mirrors `Settings.tsx`.

### 3.6 `SandboxViolationExpandedView.tsx:1-99`

- Inline `formatTime(date)` with documented motivation: avoids pulling in date-fns 39 MB for one call (`SandboxViolationExpandedView.tsx:8-11`).
- Subscribes to `SandboxManager.getSandboxViolationStore()`, keeps last 10 events, returns `null` on Linux (`getPlatform() === 'linux'`) or when sandboxing not enabled. Renders "⧈ Sandbox blocked N total operation(s)" + per-row dim time prefix + "showing last X of N" tail.

---

## 4. `Settings/` — `/settings` (`/status`) shell

### 4.1 `Settings/Settings.tsx:22-200`

- Composes `<Pane color="permission"><Tabs>` with three tabs: Status, Config, Usage (a hidden `Gates` tab is preserved for future). Lazy `<Suspense fallback={null}>` around `Config`.
- Owns `tabsHidden` (full-screen child takes over) and per-tab "owns Esc" booleans (`configOwnsEsc`, `gatesOwnsEsc`) to prevent the parent Esc handler from intercepting when a child has a search-mode active.
- Adapts pane height: in-modal uses `rows + 1`, otherwise `Math.max(15, Math.min(Math.floor(rows*0.8), 30))`.

### 4.2 `Settings/Config.tsx:85-120+`

- Massive (~1000 LOC) settings panel. Setting types: `boolean`, `enum`, `managedEnum`. Sub-menus: `Theme`, `Model`, `TeammateModel`, `ExternalIncludes`, `OutputStyle`, `ChannelDowngrade`, `Language`, `EnableAutoUpdates`.
- Pulls multi-source state: `getInitialSettings()`, `getCurrentProjectConfig()`, `getGlobalConfig()`, fast-mode flags, plan-tier transition logic (`transitionPlanAutoMode`).
- `paneCap = contentHeight ?? min(floor(rows*0.8), 30); maxVisible = max(5, paneCap-10)` — reserves 10 rows for chrome.

### 4.3 `Settings/Status.tsx:1-100+`

- `Status` builds two property sections via `buildPrimarySection()` (Version, Session name+ID, cwd, account, API provider) and `buildSecondarySection()` (Model, IDE, MCP, Sandbox, Setting sources). `buildDiagnostics()` returns installation + health + memory diagnostics; passed in via a Promise consumed with `use()` so the parent decides when to start the work.
- `PropertyValue` (`Status.tsx:57-100`) handles arrays as comma-separated wrapping flex rows and scalars as `<Text>`.

### 4.4 `Settings/Usage.tsx:1-100+`

- Two-tier rate-limit display via `LimitBar`. When `maxWidth ≥ 62`, splits into [bold title, ProgressBar(50w) + N% used, dim subtext]. Subtext composition: `extraSubtext · Resets {formatResetText(...)}`. Includes Stripe-style overage upsell when `isEligibleForOverageCreditGrant()`.

---

## 5. `shell/` — bash output rendering

### 5.1 `shell/ExpandShellOutputContext.tsx:12-35`

- Pure boolean React context (`createContext(false)`). `<ExpandShellOutputProvider>` flips it true. Used to auto-expand the most recent user `!`-prefixed bash command output.

### 5.2 `shell/OutputLine.tsx:12-80+`

- Helpers: `tryFormatJson(line)` round-trips JSON and bails on precision loss (large integer detection), capped by `MAX_JSON_FORMAT_LENGTH = 10_000`.
- `linkifyUrlsInText(content)` matches `https?:\/\/[^\s"'<>\\]+` and rewrites with `createHyperlink`. URL pattern intentionally excludes JSON-structural chars.
- `OutputLine({content, verbose, isError, isWarning, linkifyUrls})` strips underline ANSI (workaround for some emulators), branches on `verbose || expandShellOutput` to show full vs `renderTruncatedContent(formatted, columns, inVirtualList)`.

### 5.3 `shell/ShellProgressMessage.tsx:19-80+`

- Streaming bash output: shows last 5 stripped lines while running, suffix `+N lines` (or `~N lines` if total bytes known). Wraps with `<OffscreenFreeze>` so the spinner above doesn't trigger constant re-renders of the running tail.

### 5.4 `shell/ShellTimeDisplay.tsx:9-73`

- Three branches: only timeout → `(timeout 1m)`, only elapsed → `(2m 30s)`, both → `(2m 30s · timeout 5m)`. Uses `formatDuration(ms, {hideTrailingZeros})`.

---

## 6. `skills/SkillsMenu.tsx:1-120+`

- Catalog browser (UI for `claude.ai → Customize → Skills`). Groups skills by source: `policySettings`, `userSettings`, `projectSettings`, `localSettings`, `flagSettings`, `plugin`, `mcp`. Sorts within group via `_temp2`.
- `getSourceTitle()` / `getSourceSubtitle()`: MCP source extracts unique server names from `<server>:<skill>` ID pattern; file-based sources show paths from `getSkillsPath(source, 'skills')` plus a fallback `…/commands` directory if any `loadedFrom === 'commands_DEPRECATED'`. Token estimate via `estimateSkillFrontmatterTokens()`.
- Empty-state hint: "Create skills in `.claude/skills/` or `~/.claude/skills/`".

---

## 7. `Spinner/` — spinner subdir

### 7.1 `Spinner/index.ts:1-11`

- Re-exports `FlashingChar`, `GlimmerMessage`, `ShimmerChar`, `SpinnerGlyph`, `SpinnerMode`, `useShimmerAnimation`, `useStalledAnimation`, `getDefaultCharacters`, `interpolateColor`. Comment line 9-10 explains teammate components are intentionally excluded — must be loaded via `require()` for dead-code elimination.

### 7.2 `Spinner/utils.ts:4-85`

- `getDefaultCharacters()` is platform/term-aware: Ghostty uses `*` instead of `✽` (line 6) for offset-bug, darwin uses `✽`, Linux uses `*`.
- `interpolateColor(color1, color2, t)` rounds linear-interpolated `r,g,b`. `toRGBColor({r,g,b})` returns `'rgb(R,G,B)'` for ink Text colour.
- `hueToRgb(hue)` with locked `s=0.7, l=0.6` for the voice-mode waveform palette.
- `RGB_CACHE = new Map<string, RGB|null>()` memoises `parseRGB` for theme strings — important since the spinner uses these every frame.

### 7.3 `Spinner/FlashingChar.tsx:12-60`

- Smoothly interpolates between `messageColor` and `shimmerColor` at `flashOpacity` percent if both have RGB values; falls back to a binary swap (`shouldUseShimmer = flashOpacity > 0.5`) for ANSI themes. Single-character output only.

### 7.4 `Spinner/GlimmerMessage.tsx:23-80+`

- Per-character glimmer effect for the verb message. Uses `getGraphemeSegmenter()` (Intl) so emoji and combining marks count as one segment. Caches the segmentation by message identity. `messageWidth` cached too. Handles `stalledIntensity` interpolation toward `ERROR_RED = {r:171, g:43, b:63}`.

### 7.5 `Spinner/ShimmerChar.tsx:12-35`

- Per-char colour pick: highlighted (index === glimmerIndex) or near (Math.abs(index − glimmerIndex) === 1) shows `shimmerColor`, otherwise `messageColor`. Used by the shimmered prompt + verb.

### 7.6 `Spinner/SpinnerAnimationRow.tsx:1-80+`

- Owns the actual `useAnimationFrame(50)` clock. Constants: `SEP_WIDTH = stringWidth(' · ')`, `THINKING_BARE_WIDTH = stringWidth('thinking')`, `SHOW_TOKENS_AFTER_MS = 30_000`, thinking shimmer colours `THINKING_INACTIVE = 153/153/153` → `THINKING_INACTIVE_SHIMMER = 185/185/185`, `THINKING_DELAY_MS = 3000`, `THINKING_GLOW_PERIOD_S = 2`.
- The header comment (line 71-79) explicitly documents the parent/child split for animation budget: parent re-renders ~25×/turn vs ~383×/turn before the split.

### 7.7 `Spinner/SpinnerGlyph.tsx:22-80`

- Frame index → character from `SPINNER_FRAMES = [...DEFAULT_CHARACTERS, ...reversed]` (palindrome animation). Reduced-motion mode shows a slowly flashing `●` on a 2-second cycle (`Math.floor(time / (2000/2)) % 2 === 1` is dim).
- Stalled state interpolates toward `ERROR_RED` with the same RGB colour-blend strategy as `FlashingChar`.

### 7.8 `Spinner/teammateSelectHint.ts:1`

- Constant: `TEAMMATE_SELECT_HINT = 'shift + ↑/↓ to select'` (single line).

### 7.9 `Spinner/TeammateSpinnerLine.tsx:1-80`

- One row per running teammate. Picks a stable `randomVerb` via `useState(() => teammate.spinnerVerb ?? sample(getSpinnerVerbs()))`. `getMessagePreview()` (line 29-71) walks recent messages backward, collecting up to 3 lines: tool calls render as "Using {name}…" with a fallback to the first non-empty `description|prompt|command|query|pattern` from input; text blocks are split and reversed so the most recent line lands first in display.

### 7.10 `Spinner/TeammateSpinnerTree.tsx:21-80+`

- Renders the leader + teammate tree when `expandedView === 'teammates'`. Selected teammate index goes from `-1` (leader) up through the teammates array. Box drawing characters: `╒═` for the highlighted leader, `┌─` otherwise; `figures.pointer` for selected, space for non-selected. Pulls `getRunningTeammatesSorted(tasks)` for stable order.

### 7.11 `Spinner/useShimmerAnimation.ts:6-31`

- `useAnimationFrame(isStalled ? null : (mode === 'requesting' ? 50 : 200))` — different speeds for `requesting` vs other modes.
- Cycle window is `messageWidth + 20`. `requesting` mode runs forward, others run backward (return `messageWidth + 10 - (cyclePosition % cycleLength)`).

### 7.12 `Spinner/useStalledAnimation.ts:6-75`

- Stall transitions to red after 3 s without new tokens, fading over 2 s (intensity ramps `min((dt-3000)/2000, 1)`). Smooths via `current += diff * 0.1` per 50 ms tick. Reduces motion mode skips smoothing. `hasActiveTools=true` resets the timer.

---

## 8. `tasks/` — background-task UI

### 8.1 `tasks/AsyncAgentDetailDialog.tsx:25-80`

- Renders detail for a `LocalAgentTask`. Pulls full tools list via `getTools(getEmptyToolPermissionContext())`. Shows elapsed time, recent tool activity via `renderToolActivity()`. Key handlers: space = done, left arrow = back (if `onBack`), `x` = kill (only when running).
- Embeds `<UserPlanMessage>` and `extractTag(...)` to pull `<plan>` content from messages.

### 8.2 `tasks/BackgroundTask.tsx:17-80+`

- Renders a list-row representation per task type: `local_bash` (truncated command + `<ShellProgress>`), `remote_agent` (with optional `<RemoteSessionProgress>` for remote review). Activity width capped via `maxActivityWidth ?? 40`.

### 8.3 `tasks/BackgroundTasksDialog.tsx:1-100+`

- Master / detail view manager (state shape: `{mode:'list'} | {mode:'detail', itemId}`). Aggregates 8 task types: `local_bash`, `remote_agent`, `local_agent`, `in_process_teammate`, `local_workflow`, `monitor_mcp`, `dream`, `leader`. Switches detail child by type.
- Handles ultraplan stop via `stopUltraplan()` and Cancel-overlay registration.

### 8.4 `tasks/BackgroundTaskStatus.tsx:25-80+`

- Footer pill row showing main + teammates with horizontal scroll via `calculateHorizontalScrollWindow()`. Pill labels via `getPillLabel()` and CTA detection via `pillNeedsCta()`. Hides when `shouldHideTasksFooter(tasks, showSpinnerTree)`.

### 8.5 `tasks/DreamDetailDialog.tsx:22-80`

- Shows last 6 turns of a dream task (`VISIBLE_TURNS = 6`). Earlier turns collapse to a count.
- Standard task-detail key handlers: space=done, left=back, x=kill.

### 8.6 `tasks/InProcessTeammateDetailDialog.tsx:25-80`

- Adds an `f` (foreground) handler on top of the standard detail handlers: when running and `onForeground` provided, switches the transcript view to that teammate.
- Pulls active activity via `renderToolActivity()` + `describeTeammateActivity()`.

### 8.7 `tasks/RemoteSessionDetailDialog.tsx:1-60`

- Compact one-line summary helper `formatToolUseSummary(name, input)` (line 44-60+) collapses multi-line tool inputs to one line with whitespace squashed; special-cases `EXIT_PLAN_MODE_V2_TOOL_NAME` → "Review the plan in Claude Code on the web", and `ASK_USER_QUESTION_TOOL_NAME` → first question text (with `header` fallback).
- Uses `Message` component to render selected SDK messages, `getRemoteTaskSessionUrl()` for an external link, `teleportResumeCodeSession()` to resume.

### 8.8 `tasks/RemoteSessionProgress.tsx:1-60`

- `formatReviewStageCounts(stage, found, verified, refuted)` (line 22-38) is the canonical formatter shared with `RemoteSessionDetailDialog` so they cannot drift. Stages: `finding`, `verifying`, `synthesizing`. Refuted is hidden when 0; synthesizing always shows "deduping".
- `RainbowText` (line 43+) per-character gradient via `getRainbowColor(i + phase)` driven by `useAnimationFrame` ticks.

### 8.9 `tasks/renderToolActivity.tsx:7-32`

- Generic renderer: looks up tool by name, runs `tool.inputSchema.safeParse(activity.input)`, calls `tool.userFacingName(parsedInput)` and `tool.renderToolUseMessage(parsedInput, {theme, verbose:false})`. Falls back to raw tool name on any error. Excellent example of a "tool-aware activity adapter" pattern.

### 8.10 `tasks/ShellDetailDialog.tsx:23-60`

- Module-level constant `SHELL_DETAIL_TAIL_BYTES = 8192`. Async `getTaskOutput(shell)` reads the tail of `getTaskOutputPath(shell.id)` via `tailFile`. Uses `useDeferredValue` to keep the dialog responsive while the file read finishes.

### 8.11 `tasks/ShellProgress.tsx:13-60`

- `TaskStatusText({status, label, suffix})` renders `(displayLabel{suffix})` with semantic colour: `completed`→`success`, `failed`→`error`, `killed`→`warning`. `ShellProgress({shell})` switches on `shell.status` and emits a static `<TaskStatusText>` for completed/failed/killed (each cached behind a `react.memo_cache_sentinel`).

### 8.12 `tasks/taskStatusUtils.tsx:1-106`

- The shared status helpers consumed across all task detail dialogs:
  - `isTerminalStatus(s)` — `completed|failed|killed`.
  - `getTaskStatusIcon(status, opts)` — figures.cross for error, questionMarkPrefix for awaiting approval, warning for shutdown, ellipsis for running+idle, play for running, tick for completed, etc.
  - `getTaskStatusColor(status, opts)` — semantic colour names (`'success'|'error'|'warning'|'background'`).
  - `describeTeammateActivity(t)` — `stopping → awaiting approval → idle → summarizeRecentActivities(...) → lastActivity.activityDescription → 'working'` priority chain.
  - `shouldHideTasksFooter(tasks, showSpinnerTree)` — true only when spinner-tree is active and every visible background task is an in-process teammate.

---

## 9. `teams/` — team UI

### 9.1 `teams/TeamsDialog.tsx:48-60+`

- Two-level dialog (`{type:'teammateList', teamName}` ↔ `{type:'teammateDetail', teamName, memberName}`). Talks to `getTeammateStatuses()`, `getTeammateMailbox` writers (`createModeSetRequestMessage`, `sendShutdownRequestToMailbox`, `writeToMailbox`), `setMemberMode`, `setMultipleMemberModes`, `unassignTeammateTasks`, plus pane visibility toggles (`addHiddenPaneId`/`removeHiddenPaneId`).
- `useRegisterOverlay('teams-dialog')` so the cancel handler doesn't intercept Esc.

### 9.2 `teams/TeamStatus.tsx:14-60`

- Compact status pill: `{N} teammates` count from `Object.values(teamContext.teammates).filter(...).length`. When focused/selected and `showHint` is true, appends "Enter to view".

---

## 10. `TrustDialog/` — pre-flight gate

### 10.1 `TrustDialog/utils.ts:8-80+`

- `hasHooks(settings)` returns true if any of `statusLine`, `fileSuggestion`, or any non-empty `hooks[*]` array. `disableAllHooks` short-circuits to false.
- `getHooksSources()` / `getBashPermissionSources()` enumerate `.claude/settings.json` and `.claude/settings.local.json` only.
- Several `getXxxSources()` helpers (`getApiKeyHelperSources`, `getAwsCommandsSources`, `getDangerousEnvVarsSources`, `getGcpCommandsSources`, `getOtelHeadersHelperSources`) feed the dialog's risk inventory.
- `formatListWithAnd(items, limit)` renders user-facing source lists with proper "X, Y, and Z" punctuation.

### 10.2 `TrustDialog/TrustDialog.tsx:23-80+`

- Wraps `<PermissionDialog>` with options `[Trust this folder, Don't trust]`. On accept, calls `setSessionTrustAccepted(true)` + `saveCurrentProjectConfig({trusted:true})`. On deny, runs `gracefulShutdownSync()`. Logs `tengu_trust_dialog_*` events for analytics.

---

## 11. `ui/` — generic primitives

### 11.1 `ui/OrderedList.tsx:5-71` + `OrderedListItem.tsx:4-44`

- Nested-numbered list. `OrderedListContext.marker` accumulates parent prefix; each child receives a padded marker `String(index+1).padStart(maxMarkerWidth) + '.'` joined to `parentMarker`. So a top-level "1.2." renders correctly when the inner list has its own `<OrderedList>`.
- `OrderedListComponent.Item = OrderedListItem` allows `<OrderedList.Item>` JSX usage.
- `OrderedListItem` renders `<Box gap=1><Text dimColor>{marker}</Text><Box flexDirection="column">{children}</Box></Box>`.

### 11.2 `ui/TreeSelect.tsx:6-80`

- Generic `TreeNode<T> = { id, value, label, description?, dimDescription?, children?, metadata? }`. Props: `nodes`, `onSelect`, `onCancel`, `onFocus`, `focusNodeId`, `visibleOptionCount`, `layout: 'compact'|'expanded'|'compact-vertical'`, `isDisabled`, `hideIndexes`, `isNodeExpanded(nodeId)`, `onExpand`, `onCollapse`. Internally flattens via `FlattenedNode<T>` ({node, depth, isExpanded, hasChildren, parentId}).

---

## 12. `wizard/` — multi-step wizard primitives

### 12.1 `wizard/index.ts:1-9`

- Public surface: `WizardContextValue`, `WizardProviderProps`, `WizardStepComponent`, `useWizard`, `WizardDialogLayout`, `WizardNavigationFooter`, `WizardProvider`.

### 12.2 `wizard/useWizard.ts:5-13`

- Canonical "throwing context hook" — throws "useWizard must be used within a WizardProvider" if context is null. Generic over `T` for typed data shape.

### 12.3 `wizard/WizardDialogLayout.tsx:14-60`

- Wraps a `<Dialog>` with auto-generated step suffix `(N/M)` when `showStepCounter !== false`. `onCancel` wires to `goBack` from the wizard context. Pairs with `<WizardNavigationFooter>` for the bottom shortcut row.

### 12.4 `wizard/WizardNavigationFooter.tsx:10-23`

- Default shortcut hints: `↑↓ navigate`, `Enter select`, `Esc go back` via `ConfigurableShortcutHint`. Replaces with `Press {ctrl-c-keyName} again to exit` when `useExitOnCtrlCDWithKeybindings()` reports a pending exit.

### 12.5 `wizard/WizardProvider.tsx:9-80+`

- Tracks `currentStepIndex`, `wizardData`, `isCompleted`, `navigationHistory`. Uses `useExitOnCtrlCDWithKeybindings()` so wizards integrate with the global double-Ctrl-C exit pattern. `useEffect` on `isCompleted` flushes `wizardData` to `onComplete()` and clears history. Step transitions push current index into `navigationHistory` only when there is already history (skips initial-from-zero pushes).

---

## 13. Cross-references

- `Spinner.tsx` consumes `Spinner/SpinnerAnimationRow.tsx`, `Spinner/index.ts` re-exports (excluding teammate components for tree-shaking — `Spinner/index.ts:9-10`).
- `TeammateSpinnerLine.tsx` reads `getSpinnerVerbs()` from `constants/spinnerVerbs.js` and shares `TEAMMATE_SELECT_HINT` from `Spinner/teammateSelectHint.ts` with `TeammateSpinnerTree.tsx`.
- `BackgroundTasksDialog.tsx` orchestrates 7 detail-dialog children (`AsyncAgentDetailDialog`, `BackgroundTask`, `DreamDetailDialog`, `InProcessTeammateDetailDialog`, `RemoteSessionDetailDialog`, `ShellDetailDialog`).
- `tasks/RemoteSessionProgress.tsx` exports `formatReviewStageCounts` so `tasks/RemoteSessionDetailDialog.tsx` can mirror identical text — explicit anti-drift comment at `RemoteSessionProgress.tsx:13-21`.
- `Settings/Settings.tsx` uses `Pane`/`Tabs`/`Tab` from `design-system/`; `Settings/Status.tsx` uses `ConfigurableShortcutHint`.
- `sandbox/SandboxSettings.tsx` composes the 3 sandbox sub-tabs (`SandboxConfigTab`, `SandboxOverridesTab`, `SandboxDependenciesTab`) and `SandboxModeTab` (defined inline in `SandboxSettings.tsx`).
- `StructuredDiff.tsx` uses NAPI `color-diff-napi` via `expectColorDiff()` (`StructuredDiff/colorDiff.ts:25-27`); `StructuredDiff/Fallback.tsx` is the no-NAPI path.
- `StructuredDiffList.tsx` calls `intersperse()` from `utils/array.js` to insert dim `...` ellipsis nodes between hunks.
- `ScrollKeybindingHandler.tsx` exposes `shouldClearSelectionOnKey(key)` consumed by selection logic.
- `VirtualMessageList.tsx` exposes `JumpHandle` consumed by REPL search/n/N flows.
- `wizard/*` family is consumed by onboarding (`OnboardingWizard.tsx` outside this chunk).

---

## 14. Patterns to lift (for AGI Workforce)

1. **Module-level WeakMap caching keyed by an immutable patch / message identity** (`StructuredDiff.tsx:41`, `VirtualMessageList.tsx:24`). Survives unmount/remount cycles where React's `memo` cache is lost. We can mirror this for diff-rendering and search-text extraction across our 6 surfaces.
2. **Animation-budget gating: pass `null` to `useAnimationFrame` when no work is needed** (`useShimmerAnimation.ts:17`, `Spinner.tsx:101-104`, `ShimmeredInput.tsx:105`). Prevents wasted ticks. Especially relevant in our React Native (Mobile) and web `apps/web/features/chat/` paths where 50 ms paints kill battery.
3. **Imperative-handle for transcript navigation** (`VirtualMessageList.tsx:48-68`) — exposing `jumpToIndex`, `setSearchQuery`, `nextMatch`, `prevMatch`, `setAnchor`, `warmSearchIndex(): Promise<number>`, `disarmSearch`. Cleaner than threading 7 callbacks. Apply to our `apps/web/features/chat/` virtualised transcript.
4. **Anti-drift formatters between detail dialogs and pill rows** (`RemoteSessionProgress.formatReviewStageCounts`, `taskStatusUtils.{getTaskStatusIcon,getTaskStatusColor,describeTeammateActivity}`). Single canonical helper per formatter, called from every render site. Eliminates entire classes of UI inconsistency bugs that have hit our Wave 2 desktop/web parity.
5. **Lazy-loading via `feature()` + conditional `require()`** (`Spinner/index.ts:9-10`, `Spinner.tsx`'s teammate paths, `usePromptInputPlaceholder.ts:11-14`). bun:bundle's `feature()` returns a compile-time constant, so the `require()` is dead-code-eliminated when the flag is off. We can match this in our Tauri build to ship smaller bundles per surface tier (Local-only, BYOK, Pro+).
6. **Tier-1 / tier-2 props split for hot animation paths** (`Spinner.tsx` ↔ `Spinner/SpinnerAnimationRow.tsx`). Parent absorbs prop/state changes and only re-renders on actual deltas; child owns the 50 ms clock and reads refs the parent supplies. Documented re-render reduction from ~383×/turn to ~25×/turn (`SpinnerAnimationRow.tsx:71-79`). Our `apps/desktop/src/` chat will benefit from the same split between `ChatInterface` and a dedicated animation row.

---

## 15. Notes on file shapes encountered

- ~86 of the 97 files are compiled `.tsx` with `react/compiler-runtime` `_c(N)` cache slots and base64-embedded source maps; original source recoverable from each `sourceMappingURL` data block.
- The remainder are pure `.ts` or hand-written `.tsx` (e.g. `useMaybeTruncateInput.ts`, `useSwarmBanner.ts`, `Spinner/utils.ts`, `taskStatusUtils.tsx`, `WorktreeExitDialog.tsx`, `wizard/useWizard.ts`).
- Files that exceeded the 25 k-token read cap and were sampled at the top + targeted: `ScrollKeybindingHandler.tsx`, `RemoteEnvironmentDialog.tsx`, `ResumeTask.tsx`, `StructuredDiff/Fallback.tsx`.

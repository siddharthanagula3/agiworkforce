# M5 — Top-Level Screens Trio Deep-Dive

> Agent M5 of 30. Scope: `~/Desktop/reference/src/screens/REPL.tsx`, `Doctor.tsx`, `ResumeConversation.tsx`. All citations are absolute file:line in `~/Desktop/reference/src/`.

---

## Part A — `screens/REPL.tsx` (5,005 LOC)

`REPL` is the single React component that owns the entire interactive Claude Code session. It is the parent of every dialog, every keybinding handler, every streaming subscription, and every persisted-state restorer. It mounts directly under `KeybindingSetup` and `<AlternateScreen>` and is where the chat composer (`PromptInput`), the message renderer (`Messages`), and the FullscreenLayout meet. Everything else in the CLI either feeds messages into it (resume, hooks, scheduled tasks, dispatch) or pulls data out of it (transcript export, bridge replication).

### A.1 Module-level utilities & constants (REPL.tsx:1–525)

- `EMPTY_MCP_CLIENTS` (294) — stable empty array; identity-stable so `useEffect` deps don't churn in remote mode.
- `HISTORY_STUB` (298) — stable stub for `useAssistantHistory` non-KAIROS branch.
- `RECENT_SCROLL_REPIN_WINDOW_MS = 3000` (305) — keystroke-after-scroll grace window before re-pinning to bottom.
- `median` helper (311) — used to compute P50 TTFT and OTPS for the per-turn API metrics row (ant-only).
- Conditional imports for OPT-IN feature builds:
  - `useVoiceIntegration` / `VoiceKeybindingHandler` gated by `feature('VOICE_MODE')` (98–103).
  - `useFrustrationDetection` gated by `"external" === 'ant'` (107–110); zero-cost branch in external builds.
  - `getCoordinatorUserContext` gated by `feature('COORDINATOR_MODE')` (115–119).
  - `proactiveModule` (loop / KAIROS) (194–199).
  - `useScheduledTasks` (199) — `feature('AGENT_TRIGGERS')`.
  - `WebBrowserPanelModule` (272) — `feature('WEB_BROWSER_TOOL')`.
  - `AntModelSwitchCallout`, `UndercoverAutoCallout` (221–223).
- `TranscriptModeFooter` (321–362) — 1-line footer for transcript mode showing "Showing detailed transcript · ⌃o to toggle · ⌃e to show all" or search badge `current/count`.
- `TranscriptSearchBar` (368–472) — `less`-style `/` bar. Reads via `useSearchInput`. Drives `jumpRef.current.setSearchQuery`, `setHighlight`. Has a 20ms warm-index threshold below which the "indexed in Xms" badge is suppressed (424).
- `AnimatedTerminalTitle` (484–525) — leaf component that owns the 960ms title-frame ticker so the rest of REPL doesn't re-render once a second; sets `useTerminalTitle`.

### A.2 Props on `REPL` (526–571)

```ts
type Props = {
  commands: Command[];
  debug: boolean;
  initialTools: Tool[];
  initialMessages?: MessageType[];
  pendingHookMessages?: Promise<HookResultMessage[]>;
  initialFileHistorySnapshots?: FileHistorySnapshot[];
  initialContentReplacements?: ContentReplacementRecord[];
  initialAgentName?: string;
  initialAgentColor?: AgentColorName;
  mcpClients?: MCPServerConnection[];
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>;
  autoConnectIdeFlag?: boolean;
  strictMcpConfig?: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  onBeforeQuery?: (input, newMessages) => Promise<boolean>;
  onTurnComplete?: (messages) => void | Promise<void>;
  disabled?: boolean;
  mainThreadAgentDefinition?: AgentDefinition;
  disableSlashCommands?: boolean;
  taskListId?: string;
  remoteSessionConfig?: RemoteSessionConfig;
  directConnectConfig?: DirectConnectConfig;
  sshSession?: SSHSession;
  thinkingConfig: ThinkingConfig;
};
```

### A.3 Exported `Screen` type (REPL.tsx:571)

```ts
export type Screen = 'prompt' | 'transcript';
```

Only two values. Transcript-mode is the alt-screen `less`-style modal that ctrl+o toggles. Everything else (`/help`, `/config`, `/diff`, `/mcp`, `/plugin`, dialogs, message-selector, etc.) is a `toolJSX` or a `focusedInputDialog`, not a Screen.

### A.4 Top-level state — `useState` (~80 entries; sampled exhaustively)

Cited exhaustively from 600–1500.

| State / setter                                            | Line      | Purpose                                                                                                                                                  |
| --------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mainThreadAgentDefinition` (state)                       | 617       | Allows `/resume` to swap the agent mid-session                                                                                                           |
| `localCommands`                                           | 681       | Hot-reloadable when skill files change (`useSkillsChange`)                                                                                               |
| `dynamicMcpConfig`                                        | 699       | Mutable map of MCP server configs                                                                                                                        |
| `screen: Screen`                                          | 703       | `'prompt' \| 'transcript'` — toggled by ctrl+o                                                                                                           |
| `showAllInTranscript`                                     | 704       | Transcript ctrl+e expands collapsed messages                                                                                                             |
| `dumpMode`                                                | 709       | `[` in transcript mode → flatten to scrollback                                                                                                           |
| `editorStatus`                                            | 712       | `v` in transcript mode → render to tmpfile + open in `$VISUAL/$EDITOR`; status string                                                                    |
| `ideSelection`                                            | 730       | IDE-pushed text selection from VS Code/JetBrains                                                                                                         |
| `ideToInstallExtension`                                   | 731       | Triggers `IdeOnboardingDialog`                                                                                                                           |
| `ideInstallationStatus`                                   | 732       |                                                                                                                                                          |
| `showIdeOnboarding`                                       | 733       |                                                                                                                                                          |
| `showModelSwitchCallout`                                  | 735       | ant-only                                                                                                                                                 |
| `showEffortCallout`                                       | 741       | One-time effort callout for Opus 4.6 users                                                                                                               |
| `showDesktopUpsellStartup`                                | 743       | "Try the Desktop app" — max 3 launches                                                                                                                   |
| `showUndercoverCallout`                                   | 1013      | ant-only                                                                                                                                                 |
| `toolJSX`                                                 | 1032      | `{ jsx, shouldHidePromptInput, shouldContinueAnimation, showSpinner, isLocalJSXCommand, isImmediate }` — overlay rendered by tools or local-JSX commands |
| `toolUseConfirmQueue: ToolUseConfirm[]`                   | 1101      | Permission requests waiting for human approval                                                                                                           |
| `permissionStickyFooter`                                  | 1105      | ExitPlanModePermissionRequest's response options pinned in fullscreen `bottom` slot                                                                      |
| `sandboxPermissionRequestQueue`                           | 1106      | Network-egress prompts                                                                                                                                   |
| `promptQueue`                                             | 1110      | Hook-driven prompt requests (`requestPrompt`)                                                                                                            |
| `messages` (via wrapped `setMessages`)                    | 1182      | The conversation. `messagesRef` mirror at 1183                                                                                                           |
| `cursor: MessageActionsState \| null`                     | 1250      | MessageActions cursor (j/k navigation past messages)                                                                                                     |
| `frozenTranscriptState`                                   | 1325      | Captures lengths on transcript enter                                                                                                                     |
| `inputValue`                                              | 1331      | Composer text (init from `consumeEarlyInput()`)                                                                                                          |
| `inputMode: PromptInputMode`                              | 1372      | `'prompt' \| 'bash'` (per `types/textInputTypes.ts:265–267`)                                                                                             |
| `stashedPrompt`                                           | 1373      | Shift+Esc stashes the partially-typed prompt during a slash command run                                                                                  |
| `inProgressToolUseIDs: Set<string>`                       | 1385      |                                                                                                                                                          |
| `pastedContents: Record<number, PastedContent>`           | 1423      | Image / pasted-text refs by id                                                                                                                           |
| `submitCount`                                             | 1424      |                                                                                                                                                          |
| `streamingText`                                           | 1461      | Live typewriter render of the current assistant turn                                                                                                     |
| `streamingToolUses: StreamingToolUse[]`                   | 849       | Active tool calls (not yet committed)                                                                                                                    |
| `streamingThinking: StreamingThinking \| null`            | 850       | Extended-thinking blob with auto-hide after 30s post-stream                                                                                              |
| `streamMode: SpinnerMode`                                 | 838       | `'requesting' \| 'responding' \| 'tool-use'` etc. (mirrored to ref `streamModeRef`)                                                                      |
| `abortController`                                         | 865       | Active query controller (mirrored to `abortControllerRef`)                                                                                               |
| `isExternalLoading` (raw + wrapper)                       | 911, 960  | Loading state for remote/SSH/direct-connect/backgrounded sessions                                                                                        |
| `userInputOnProcessing`                                   | 920       | The submitted prompt text shown as a placeholder until the real user message lands                                                                       |
| `lastQueryCompletionTime`                                 | 1474      | Drives idle-notification timer                                                                                                                           |
| `spinnerMessage` / `spinnerColor` / `spinnerShimmerColor` | 1475–1477 | Compaction / hook-progress overrides                                                                                                                     |
| `isMessageSelectorVisible`                                | 1478      |                                                                                                                                                          |
| `messageSelectorPreselect`                                | 1479      |                                                                                                                                                          |
| `showCostDialog`                                          | 1480      | $5 threshold dialog                                                                                                                                      |
| `conversationId`                                          | 1481      | Fresh UUID on `/clear`, `/resume`, compact, fork — used as React key root for memoized rows                                                              |
| `idleReturnPending`                                       | 1484      | "75-min idle, ≥100k input tokens" intervention                                                                                                           |
| `[contentReplacementStateRef]`                            | 1503      | Per-turn tool-result-budget tracker                                                                                                                      |
| `haveShownCostDialog`                                     | 1506      |                                                                                                                                                          |
| `vimMode`                                                 | 1507      |                                                                                                                                                          |
| `showBashesDialog`                                        | 1508      | Background-tasks list                                                                                                                                    |
| `isSearchingHistory`                                      | 1509      |                                                                                                                                                          |
| `isHelpOpen`                                              | 1510      |                                                                                                                                                          |
| `autoUpdaterResult`                                       | 983       | Notification source for auto-update results                                                                                                              |
| `searchOpen`                                              | 4204      | Transcript `/` search active                                                                                                                             |
| `searchQuery`                                             | 4205      |                                                                                                                                                          |
| `searchCount`                                             | 4206      |                                                                                                                                                          |
| `searchCurrent`                                           | 4207      |                                                                                                                                                          |
| `remountKey`                                              | 4122      | Force MCPConnectionManager remount on SIGCONT                                                                                                            |
| `exitFlow`                                                | 2007      | ExitFlow JSX (worktree-aware)                                                                                                                            |
| `isExiting`                                               | 2008      |                                                                                                                                                          |
| `autoRunIssueReason`                                      | 2000      | "Auto-file `/issue` after a `bad` survey?"                                                                                                               |
| `haikuTitle`                                              | 1129      | One-shot Haiku-extracted tab title                                                                                                                       |
| `idleReturnPending`                                       | 1484      |                                                                                                                                                          |
| `permissionStickyFooter`                                  | 1105      |                                                                                                                                                          |

Refs (~30 — the core ones):

- `messagesRef` (1183) — synchronous mirror of `messages`. `setMessages` wrapper at 1198 writes ref before scheduling React state.
- `abortControllerRef` (868), `restoreMessageSyncRef` (877), `sendBridgeResultRef` (873).
- `scrollRef: ScrollBoxHandle` (881), `modalScrollRef` (888), `lastUserScrollTsRef` (895).
- `queryGuard: QueryGuard` (900) — synchronous state machine `idle ↔ dispatching ↔ running` replacing the old `isLoading`/`isQueryRunning` desync. `useSyncExternalStore` subscription at 904.
- `loadingStartTimeRef`, `totalPausedMsRef`, `pauseStartTimeRef` (932–934) — wall-clock for spinner elapsed time, with explicit pause/resume tracking when permission dialogs are open (2076–2088).
- `responseLengthRef` (1427), `apiMetricsRef` (1430) — drive the ant-only TTFT/OTPS metrics row written via `createApiMetricsMessage` (2832–2845).
- `userInputBaselineRef` (924), `userMessagePendingRef` (929) — placeholder bookkeeping.
- `tipPickedThisTurnRef` (1530) — guard so `pickNewSpinnerTip` runs once per turn.
- `swarmStartTimeRef`, `swarmBudgetInfoRef` (967–972) — defer the per-turn duration message until all swarm teammates finish.
- `bashTools: Set<string>` (1956) + `bashToolsProcessedIdx` (1957) — feed tip selection.
- `discoveredSkillNamesRef`, `loadedNestedMemoryPathsRef` (1963, 1967) — session-scoped dedup that survives `getToolUseContext` rebuilds.
- `localJSXCommandRef` (1043) — stops tool calls from clobbering `/btw`-style immediate dialogs.
- `editorGenRef`, `editorTimerRef`, `editorRenderingRef` (717–719) — generation guard for async transcript-export.
- `idleHintShownRef` (1188) — analytics dedup for the willow hint.
- `safeYoloMessageShownRef` (1614) — debounce auto-mode warning.
- `worktreeTipShownRef` (1643) — one-shot sparse-paths tip.
- `prevColsRef` (4253) — debounce search-cache reset on resize.
- `prevDialogRef` (2099) — re-pin scroll on dialog appear/dismiss.
- `focusedInputDialogRef` (976) — read in timer callbacks to avoid stale-closure dialog state.

### A.5 `useEffect` hooks — every observable side-effect

Sampled exhaustively. Effects are intentionally short, dep-list-pure, and almost always paired with a ref so timer callbacks read fresh values.

1. **REPL mount/unmount log** (611–614).
2. **Bootstrap retained local-agent disk read** (648–671) — UUID-merge live + sidechain JSONL.
3. **Auto-hide streamingThinking after 30s** (853–864).
4. **Plugin startup checks (post-trust-dialog)** (797–800).
5. **Auto-updater notifications** (984–994).
6. **tmux mouse-off hint** (999–1012).
7. **Undercover auto-enable callout** (1014–1031).
8. **Push session activity to PID file** (1160–1167).
9. **Tab-status OSC 21337 (`useTabStatus`)** (1175).
10. **`registerLeaderToolUseConfirmQueue` / unregister** (1178–1181).
11. **Prevent macOS sleep while loading** (1149–1154).
12. **Restore read-file-state on initialMessages mount** (1982–1993).
13. **Auto-mode warning debouncer** (1615–1639).
14. **Worktree-creation-slow tip** (1644–1652).
15. **`messages` cost-threshold check** (2203–2215).
16. **Sandbox unavailable notification** (2317–2336).
17. **Pause/resume timing on dialog open** (2076–2088).
18. **Scroll-pin on permission-dialog appear/dismiss** (`useLayoutEffect`) (2099–2105).
19. **Show cost dialog after $5** (already noted).
20. **Idle notification timer** (3909–3941).
21. **Idle willow hint timer** (3946–3992).
22. **Suspend / SIGCONT remount key bump** (4123–4139).
23. **Transcript exit cleanup** (4343–4361).
24. **Search resize abort** (4253–4266).
25. **`useEffect` for `clearHighlight` on screen change** (4355–4361).
26. **Show-cost on threshold** (2203–2215).
27. **Initial onInit (memory files)** (4107–4116).
28. **Setup `Screen`-aware SearchHighlight** (4355–4361).
29. **Track prompt-queue analytics** (3846–3857).
30. **Abort active controller on `priority='now'` queued cmd** (4100–4104).
31. **Initial-message processor** (3029–3141) — async loop that consumes `appState.initialMessage` (set by CLI args, plan-mode-exit, etc.), clears context if requested, builds permission updates, and routes through `onSubmit` (string content) or direct `onQuery` (image / plan content).
32. **Background-task pause/resume timing** (already noted).
33. **`useTeammateViewAutoExit`** (4391).

### A.6 Keybinding wiring

REPL mounts a stack of `*KeybindingHandler` components inside `<KeybindingSetup>` — they don't render visible UI; they call `useKeybinding(action, fn, scope)` inside, which reads `~/.claude/keybindings.json` overrides via `useKeybinding.ts`.

- `<GlobalKeybindingHandlers ...globalKeybindingProps>` (4408, 4550) — owns `app:toggleTranscript` (ctrl+o), `transcript:toggleShowAll` (ctrl+e), `transcript:exit` (q / esc / ctrl+c — three bindings), and the page-up "enter transcript" trigger via `setScreen`.
- `<CommandKeybindingHandlers onSubmit={onSubmit} />` (4410, 4552) — slash commands flagged with `keybinding`, e.g. `/btw` (ctrl+r), `/issue` (ctrl+f), and the `confirm:cycleMode` (Shift+Tab) handler that fires on the prompt to call `cyclePermissionMode` (PromptInput.tsx:1520).
- `<VoiceKeybindingHandler ...>` (4409, 4551) — push-to-talk + voice-anchor reset.
- `<ScrollKeybindingHandler scrollRef={scrollRef} ...>` (4416, 4561) — `g`, `G`, `j`, `k`, ctrl+u, ctrl+d, PgUp/PgDn, mouse wheel. Mounts BEFORE `CancelRequestHandler` so ctrl+c-with-selection copies instead of cancelling.
- `<MessageActionsKeybindings handlers={messageActionHandlers} />` (4562) — the `cursor`-mode j/k that lets a user navigate past assistant messages to **edit** an old user message in-place. Caps at `useMessageActions` (3788–3791).
- `<CancelRequestHandler {...cancelRequestProps}>` (4428, 4563) — owns ctrl+c (active task → onCancel; idle → exit-flow), Esc (interrupt streaming, open MessageSelector after second tap), MessageSelector toggle.

The transcript modal also has bare-letter useInput handlers (4212–4240 for `/`/`n`/`N`; 4270–4329 for `q`, `[`, `v`).

### A.7 Mode handling — Plan / Auto-Mode / Sandbox / Default cycling (Shift+Tab)

The mode lives in `appState.toolPermissionContext.mode` — pulled at REPL.tsx:618 (`toolPermissionContext = useAppState(s => s.toolPermissionContext)`). It is cycled via `cyclePermissionMode` (`utils/permissions/getNextPermissionMode.ts:88–101`). The cycle order in `getNextPermissionMode` (lines 34–79):

- **Default** → `acceptEdits` (external) **or** `bypassPermissions` / `auto` (ant)
- **acceptEdits** → `plan`
- **plan** → `bypassPermissions` (if available) → `auto` (if classifier flag) → `default`
- **bypassPermissions** → `auto` (if classifier flag) → `default`
- **auto** (TRANSCRIPT_CLASSIFIER) → `default`

Auto-mode entry side-effects (REPL.tsx:1614–1639): when transitioning into `auto`, `safeYoloMessageShownRef` debounces an 800ms-delayed `AUTO_MODE_DESCRIPTION` system-warning message, capped at 3 total appearances per global config (`autoPermissionsNotificationCount`).

Plan-mode exit (initialMessage flow, 3036–3082) clears the conversation if `clearContext: true`, preserves the plan slug across the `regenerateSessionId()` boundary, applies permission updates from `buildPermissionUpdates`, and (for `auto`) calls `stripDangerousPermissionsForAutoMode` to remove rules incompatible with the classifier.

The Sandbox dimension is orthogonal to the four-mode cycle: `SandboxManager.initialize(sandboxAskCallback)` (2337–2344) is called once at mount; `sandboxAskCallback` (2216–2310) handles network-egress prompts via `setSandboxPermissionRequestQueue` and bridges to claude.ai if `feature('BRIDGE_MODE')` is on. Mid-session sandbox unavailability is a one-shot notification (2317–2336).

### A.8 Composer (`PromptInput`) integration

Mounted at 4903 with ~40 props. The major ones:

- `getToolUseContext` — same factory used by `onQuery`; PromptInput uses it for slash-command introspection.
- `toolPermissionContext`, `setToolPermissionContext` — Shift+Tab mutates this.
- `commands` — merged from project skills + plugins + MCP (REPL.tsx:832–835).
- `agents={agentDefinitions.activeAgents}` — for `@agent-name` mentions.
- `isLoading`, `submitCount`, `mcpClients`, `pastedContents`, `setPastedContents`, `vimMode`, `showBashesDialog`, `setShowBashesDialog`.
- `onSubmit={onSubmit}` (the 393-LOC submit handler, 3142–3545) and `onAgentSubmit={onAgentSubmit}` (used when `viewedAgentTask` is set).
- `helpOpen`, `setHelpOpen` — `?` toggles in-prompt help.
- `voiceInterimRange` and `insertTextRef` (VOICE_MODE).
- `stashedPrompt` / `setStashedPrompt` — shift+esc stash/restore.
- `onShowMessageSelector={handleShowMessageSelector}`.
- `onMessageActionsEnter={enterMessageActions}` — Up arrow at start of empty composer in fullscreen mode.

`PromptInput.tsx:54-70` confirms it imports `BaseTextInputProps`, `PromptInputMode`, `VimMode`, `PromptInputHelpers`, plus its own subcomponents `PromptInputFooter`, `PromptInputModeIndicator`, `PromptInputQueuedCommands`, `PromptInputStashNotice`. Submit binding is `Cmd/Ctrl+Enter` (with multiline edit on plain Enter) and the `confirm:cycleMode` keybinding (Shift+Tab) fires `cyclePermissionMode` at line 1520.

### A.9 Streaming subscription — how chunks render

The data flow per turn (REPL.tsx:2584–2660 + 2661–2854):

1. `onSubmit` → `handlePromptSubmit` → `onQuery` (2855–3024).
2. `onQuery` calls `queryGuard.tryStart()`; if a query is already running, it `enqueue`s the prompt for the queue processor (2870–2886).
3. After hooks (`mrOnBeforeQuery`, `awaitPendingHooks`), `onQueryImpl` (2661) builds `toolUseContext` and computes the system prompt (`getSystemPrompt`+`getUserContext`+`getSystemContext`).
4. Then it iterates `for await (const event of query({...}))` (2793) and calls `onQueryEvent(event)` for each one.
5. `onQueryEvent` (2584) delegates to `handleMessageFromStream` from `utils/messages.ts`, passing five callbacks:
   - `setMessages` updater that handles the **compact-boundary** branch (2586–2607) — fullscreen keeps pre-compact messages capped at one compact-interval; non-fullscreen `setMessages(() => [newMessage])` wipes;
   - **Ephemeral progress merge** branch (2608–2628) — replaces the prior `progress` of the same `parentToolUseID + data.type` instead of appending. Sleep/Bash emit per-second ticks; without merge, transcripts hit 120MB.
   - `setResponseLength(length => length + newContent.length)` for streaming deltas (2641–2660) — also patches the latest `apiMetricsRef` entry's `lastTokenTime` and `endResponseLength` so OTPS includes subagent processing.
   - `setStreamMode`, `setStreamingToolUses`, **tombstone removal** (`setMessages(filter)` + `removeTranscriptMessage(uuid)`), `setStreamingThinking`, push API metrics on TTFT, and `onStreamingText` (typewriter buffer, line-by-line via `streamingText.lastIndexOf('\n')` at 1473).
6. After the `for await` loop ends, `onQueryImpl` writes the per-turn API-metrics row (ant-only, 2814–2845), calls `resetLoadingState`, then `onTurnComplete?.()`.
7. The `finally` block in `onQuery` (2919–3022) is the canonical one-place-to-clean-up: `queryGuard.end(generation)`, `resetLoadingState`, `mrOnTurnComplete`, `sendBridgeResultRef.current()`, ant-only Tungsten panel auto-hide, swarm-deferred turn-duration message, and the **auto-restore** logic (3010–3022) that rewinds the conversation when ESC was pressed before any meaningful response landed.

Streaming text rendering specifically: `setStreamingText(buffer)` per delta. Ink's 16ms render throttle batches updates. `visibleStreamingText` (1473) trims to the last newline so the in-progress source line is hidden until the line is complete. `showStreamingText` is gated by `prefersReducedMotion` and `hasCursorUpViewportYankBug()` (1463–1467).

Bypass logic: `usesSyncMessages = showStreamingText || !isLoading` (4506) — when streaming is visible, displayed messages skip the deferred snapshot so the final assistant message lands in the same frame `streamingText` clears.

### A.10 Status bar contents

There is no single "status bar" component — status is split across:

- The **terminal title** (set by `<AnimatedTerminalTitle>` 4407, 4549) — animated `⠂/⠐/✳` prefix while `titleIsAnimating`.
- The **terminal tab status** (`useTabStatus(showStatusInTerminalTab ? sessionStatus : null)` 1175) — OSC 21337, ant-only by default.
- The **bottom slot inside `<FullscreenLayout>` `bottom={...}`** (4590–4995) — contains the permission sticky footer, immediate local-JSX commands (e.g. `/btw`), the TaskList (`tasksV2`), all dialogs, the `IssueFlagBanner`, the `FeedbackSurvey`, the `PromptInput`, the `SessionBackgroundHint`, and the `MessageActionsBar`.
- The **spinner row** (`<SpinnerWithVerb>` 4587) — driven by `streamMode`, `spinnerTip`, `responseLengthRef`, `apiMetricsRef`, `loadingStartTimeRef`, `totalPausedMsRef`, `pauseStartTimeRef`, `stopHookSpinnerSuffix`, `spinnerColor`, `spinnerShimmerColor`, `inProgressToolUseIDs`. Hidden when streaming text is visible (via `showSpinner` at 1672–1685) or only Sleep tool is in progress.
- The **`stopHookSpinnerSuffix`** (4142–4181) — derived from `messages` filtering for `hook_progress` events with `Stop` / `SubagentStop` and computes `running stop hook 'cmd'… 2/3`.

### A.11 Sidebar / split panes / fullscreen layout

Layout is centralized in `<FullscreenLayout>` (REPL.tsx:4565). It accepts:

- `scrollRef` — outer scroll container.
- `overlay={toolPermissionOverlay}` — slides in over the scroll area.
- `bottomFloat={<CompanionFloatingBubble />}` — Buddy mode sprite (4565).
- `modal={centeredModal}` — local-jsx slash commands rendered as a modal pane (4540–4541).
- `modalScrollRef` — inner ScrollBox for tall content like `/status`.
- `dividerYRef`, `hidePill`, `hideSticky`, `newMessageCount`, `onPillClick` — the unseen-divider pill that appears when scrolled away.
- `scrollable={...}` — `TeammateViewHeader`, `Messages`, `AwsAuthStatusBox`, optional placeholder `UserTextMessage`, optional `toolJSX`, ant-only `<TungstenLiveMonitor>`, optional `<WebBrowserPanelModule.WebBrowserPanel>`, spacer `<Box flexGrow={1}>`, `SpinnerWithVerb` or `BriefIdleStatus`, optional `PromptInputQueuedCommands`.
- `bottom={...}` — the chrome row, with optional `CompanionSprite` flanking.

There is **no traditional sidebar** in REPL. Sessions are managed through `/resume` (`ResumeConversation`), `/agents`, `&` background detach, and the swarm `viewingAgentTaskId` (with `<TeammateViewHeader>`).

### A.12 Auto-mode classifier integration

Auto-mode is gated by `feature('TRANSCRIPT_CLASSIFIER')`. Three integration points in REPL:

1. **Cycle entry** (already covered) — `getNextPermissionMode` returns `'auto'` only when `canCycleToAuto(toolPermissionContext)` plus the feature flag.
2. **Killswitch check on every turn** (2768–2772) — `feature('TRANSCRIPT_CLASSIFIER') ? checkAndDisableAutoModeIfNeeded(toolPermissionContext, setAppState, store.getState().fastMode) : undefined`. The kickoff hook `useKickOffCheckAndDisableAutoModeIfNeeded` runs at mount (697–698).
3. **Strip-dangerous-permissions on plan-mode → auto entry** (3071–3077) — when leaving plan with `mode === 'auto'`, `stripDangerousPermissionsForAutoMode` removes rules that don't fit the classifier model (e.g. arbitrary always-allow Bash patterns).

The classifier itself is invoked deep inside `query.ts` and `tools/BashTool/bashPermissions.ts` — not in REPL — but REPL surfaces classifier elapsed time via `getTurnClassifierDurationMs()` and emits an api-metrics row including `classifierDurationMs`/`classifierCount` (2843–2844).

### A.13 Plan mode UI — proposal display, approve/edit/reject controls

Plan mode is the one mode whose UI is non-trivial. The flow:

1. While in `plan` mode, `Edit`/`Write`/`Bash`/`NotebookEdit` are filtered out by `mergeAndFilterTools` (REPL.tsx:2407, called inside `getToolUseContext`'s `computeTools`).
2. The model issues the `ExitPlanMode` tool with a markdown plan body.
3. `<ExitPlanModePermissionRequest>` (imported from `components/permissions/ExitPlanModePermissionRequest`) renders inside the **`toolUseConfirmQueue`** path (4519). It calls `setStickyFooter` so its options ("Yes, run it / Yes, but with edits / No, keep planning") stay visible while the user scrolls a long plan in fullscreen mode (4519, 1105).
4. When approved, `buildPermissionUpdates` (used at 3068) translates the chosen verdict into `applyPermissionUpdates` calls.
5. **`Ctrl+G`** in the plan-mode permission dialog opens the plan file in `$EDITOR` for direct edits — wired in `PromptInput.tsx` and `ExitPlanModePermissionRequest`. Plans are saved with version numbers in `~/.claude/plans/<slug>` and can be re-opened via `/plan open`.
6. `copyPlanForFork` / `copyPlanForResume` (REPL.tsx:1793–1797) duplicate the plan's slug+content when forking or resuming so two sessions don't clobber the same plan file.
7. Plan-mode-exit-with-clear (`initialMsg.clearContext`) resets the conversation, regenerates the session ID, and re-applies the plan slug to the new session (3036–3061).
8. ant-only "ultraplan" mode adds two more dialogs: `UltraplanChoiceDialog` (4850) and `UltraplanLaunchDialog` (4852) — both rendered in `focusedInputDialog` slots.

### A.14 Worktree switching UI

Worktree state lives in `getCurrentWorktreeSession()` (`utils/worktree.ts`). REPL touches it in three places:

- **Resume restore** — `restoreWorktreeForResume(log.worktreeSession)` (1879) calls a chdir (skipped for fork — forks materialize their own file via `recordTranscript`). `exitRestoredWorktree` (1878) clears any prior worktree before entering the resumed one.
- **Worktree-creation-slow tip** (1644–1652) — if `wt.creationDurationMs > 15000` and `!usedSparsePaths`, push a one-shot system message recommending `worktree.sparsePaths` in `.claude/settings.json`.
- **Exit flow** (3622–3651) — `getCurrentWorktreeSession() !== null` triggers `<ExitFlow showWorktree>` instead of plain exit. ExitFlow lets the user choose: "Keep worktree", "Discard branch", "Open PR".

Branch switching mid-session uses `/branch`, which calls `resume(forkLog)` with `entrypoint='fork'`. The fork branch (1886–1892) skips `exitRestoredWorktree` and `restoreWorktreeForResume` because the user is staying in the current worktree; instead it re-persists `currentSessionWorktree` via `saveWorktreeState`.

The terminal title carries the worktree session name (set via `updateSessionName` 1823 and `getCurrentSessionTitle(getSessionId())` at 1128).

### A.15 `--print` headless path: how is REPL bypassed?

`main.tsx:797–800` checks `cliArgs.includes('-p') || cliArgs.includes('--print')` early, sets `isInteractiveSession` false. When the flag is set, the entry point at `main.tsx:2826–2829` calls `runHeadless(...)` from `cli/print.ts:455` instead of `render(<REPL .../>)`. REPL is never mounted; `runHeadless` runs the same `query({...})` async iterator and writes results to stdout in `text` / `json` / `stream-json` format. Other relevant flags (`main.tsx:976–1000`):

- `--input-format` `text|stream-json` (stdin streaming variants for SDK).
- `--output-format` `text|json|stream-json`.
- `--include-hook-events`, `--include-partial-messages` (stream-json only).
- `--max-turns`, `--max-budget-usd`, `--fallback-model` (print-only).
- `--no-session-persistence`, `--resume-session-at <message-id>`, `--rewind-files <user-message-id>`, `--workload <tag>`, `--enable-auth-status`.
- `--permission-prompt-tool <tool>` — MCP tool used as the headless approval surface.
- `--bare` — disables hooks, LSP, plugin sync, attribution, auto-memory, background prefetches.

`cli/print.ts:976` defines `runHeadlessStreaming` for the streaming-input variant.

### A.16 Cross-references

- **`commands/`** — `commands.ts` exports `Command`, `CommandResultDisplay`, `ResumeEntrypoint`, `getCommandName`, `isCommandEnabled`, `REMOTE_SAFE_COMMANDS`. Loaded at REPL.tsx:50, 280. Specific commands wired:
  - `commands/exit/index.js` (206) — ExitFlow.
  - `commands/clear/conversation.js` (3043, 4783) — `/clear`, idle-return clear action.
- **`tools/`** — `getTools` (165, 696), `assembleToolPool` (165, 2406), `mergeAndFilterTools` (150), `WEB_FETCH_TOOL_NAME` (127), `SLEEP_TOOL_NAME` (128), `clearSpeculativeChecks` (129), `tools/AgentTool/loadAgentsDir.js`, `tools/AgentTool/agentToolUtils.js`, `tools/AgentTool/resumeAgent.js`, `tools/AgentTool/agentColorManager.js`, `tools/TungstenTool/TungstenLiveMonitor.js`, `tools/WebBrowserTool/WebBrowserPanel.js`.
- **`services/`** — `services/notifier.js` (sendNotification, 27), `services/preventSleep.js` (28), `services/diagnosticTracking.js` (214), `services/PromptSuggestion/speculation.js` (215), `services/mcp/MCPConnectionManager.js` (227), `services/compact/microCompact.js` (178), `services/compact/postCompactCleanup.js` (179), `services/compact/compact.js` (181), `services/contextCollapse/index.js` (3686), `services/analytics/index.js`, `services/tips/tipScheduler.js` (237).
- **`bridge/`** — implicit via `useReplBridge` (49, 3833) which reads `appState.replBridgePermissionCallbacks` (2271) and bridges sandbox / permission requests to claude.ai's mobile + web clients.
- **`hooks/`** — 50+ hooks. Key REPL-level ones: `useReplBridge`, `useRemoteSession`, `useDirectConnect`, `useSSHSession`, `useSwarmInitialization`, `useTeammateViewAutoExit`, `useCanUseTool`, `useQueueProcessor`, `useMailboxBridge`, `useInboxPoller`, `useSessionBackgrounding`, `useBackgroundTaskNavigation`, `useMessageActions`, `useDeferredHookMessages`, `useFileHistorySnapshotInit`, `useApiKeyVerification`, `useScheduledTasks`, `useProactive`, `useTaskListWatcher`, `useMoreRight`, `useFeedbackSurvey`, `useMemorySurvey`, `usePostCompactSurvey`, `useFrustrationDetection`, `useSkillImprovementSurvey`, `useIssueFlagBanner`, `useIDEIntegration`, `useIdeSelection`, `useIdeLogging`, `useShortcutDisplay`.

---

## Part B — `screens/Doctor.tsx` (574 LOC) — `claude doctor` checks

Doctor is much smaller. It renders a single `<Pane>` with a fixed sequence of diagnostic blocks. The async diagnostic fetch runs in a single `useEffect` (164–221) and pushes results into `setDiagnostic`, `setAgentInfo`, `setContextWarnings`, `setVersionLockInfo`. PressEnter dismisses with `handleDismiss` (Doctor.tsx:223–234).

### Diagnostics that ship today (in order of render):

1. **Diagnostics block** (`getDoctorDiagnostic()` at `utils/doctorDiagnostic.ts`):
   - `installationType` + `version` (Doctor.tsx:275).
   - `packageManager` (284) — npm / brew / native.
   - `installationPath` (292).
   - `invokedBinary` (300) — the `argv[0]` resolution.
   - `configInstallMethod` (308) — install method recorded in config.
   - `ripgrepStatus` (314–323) — embedded / vendor / system path; prints `Search: OK (bundled)` or `Search: Not working (system)`.
   - `recommendation` (327) — first-line warning, second-line dim hint.
   - `multipleInstallations` (335) — list of all detected installs by type+path; prints "Warning: Multiple installations found".
   - `warnings[]` (343) — generic Issue/Fix pairs.

2. **Invalid Settings block** (351) — uses `useSettingsErrors()` filtered to exclude MCP-specific errors (`errorsExcludingMcp`); rendered via `<ValidationErrorsList>`.

3. **Updates block** (374–419):
   - `Auto-updates: Managed by package manager` or `diagnostic.autoUpdates`.
   - `Update permissions: Yes` / `No (requires sudo)`.
   - `Auto-update channel: <stable|latest|beta>` (from `getInitialSettings()?.autoUpdatesChannel`).
   - **`<DistTagsDisplay>`** (57–98, suspended at 407) — async `getGcsDistTags` (native install) or `getNpmDistTags` (npm install). Prints `Stable version: X.Y.Z` and `Latest version: X.Y.Z`.

4. **`<SandboxDoctorSection>`** (426) — bubblewrap (Linux), Seatbelt (macOS), Landlock detection. Imports from `components/sandbox/SandboxDoctorSection.js`.

5. **`<McpParsingWarnings>`** (427) — surfaces `mcpErrorMetadata` validation errors.

6. **`<KeybindingWarnings>`** (428) — `~/.claude/keybindings.json` parse errors and conflicts.

7. **Environment Variables block** (429, 543–562) — validates these env vars via `validateBoundedIntEnvVar`:
   - `BASH_MAX_OUTPUT_LENGTH` (default `BASH_MAX_OUTPUT_DEFAULT`, max `BASH_MAX_OUTPUT_UPPER_LIMIT`).
   - `TASK_MAX_OUTPUT_LENGTH` (default `TASK_MAX_OUTPUT_DEFAULT`, max `TASK_MAX_OUTPUT_UPPER_LIMIT`).
   - `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (default + upper from `getModelMaxOutputTokens('claude-opus-4-6')`).
     Renders `Validation: <name>: <message>` with color `warning` for `capped` and `error` for invalid.

8. **Version Locks block** (442) — when `isPidBasedLockingEnabled()`. Lists each lock by `version`, `pid`, and `(running)` / `(stale)`. Cleans up stale locks on mount via `cleanupStaleLocks(locksDir)` and prints `└ Cleaned N stale lock(s)` if any.

9. **Agent Parse Errors block** (450) — `agentInfo.failedFiles[]` with `path: error`.

10. **Plugin Errors block** (458) — from `appState.plugins.errors[]`. Each with `source`, `[plugin]`, message via `getPluginErrorMessage`.

11. **Unreachable Permission Rules block** (466) — from `contextWarnings.unreachableRulesWarning` (computed by `checkContextWarnings`, `utils/doctorContextWarnings.ts:23`).

12. **Context Usage Warnings block** (474):
    - `claudeMdWarning` — total CLAUDE.md token spend exceeds threshold; lists files.
    - `agentWarning` — agent-prompt token spend; lists top contributors.
    - `mcpWarning` — MCP server prompt-token spend; lists servers.

13. **`<PressEnterToContinue>`** (482) — keybindings hook (`confirm:yes` / `confirm:no` both → `handleDismiss`, 237–245).

When called, `handleDismiss` calls `onDone("Claude Code diagnostics dismissed", { display: "system" })` (224–234), so the slash-command framework persists the doctor invocation as a user-visible system message.

The `agentInfo` block (167–209) collects `userAgentsDir = ~/.claude/agents` and `projectAgentsDir = .claude/agents`, checks both for `pathExists`, and lists `activeAgents` with their source (`SettingSource | 'built-in' | 'plugin'`). It is the data that feeds the Agent Parse Errors block.

---

## Part C — `screens/ResumeConversation.tsx` (398 LOC)

This is the picker shown by `claude --resume` (or `claude -r`). It renders one of four states sequentially: `Loading conversations…` spinner, `Resuming conversation…` spinner, `<NoConversationsMessage>`, or `<LogSelector>`. After a session is selected and `loadConversationForResume` returns, it switches to `<REPL>` with `initialMessages`, `initialFileHistorySnapshots`, `initialContentReplacements`, `initialAgentName/Color`, and `mainThreadAgentDefinition`.

### C.1 Search box behavior

`<LogSelector>` (`components/LogSelector.tsx`) receives:

- `logs` — filtered list (excludes sidechain + optionally PR-filtered, ResumeConversation.tsx:109–124).
- `maxHeight={rows}` — terminal height.
- `initialSearchQuery` (passed from CLI flag `--resume <text>` — value can be a search term).
- `showAllProjects` + `onToggleAllProjects` — toggle global vs same-repo scope.
- `onLoadMore` — paginated load via `enrichLogs` (137–155).
- `onAgenticSearch={agenticSessionSearch}` — the **Haiku-classifier-based semantic search** for matching session intent against descriptions, per `utils/agenticSessionSearch.ts:146`.
- `onLogsChanged` — re-runs `loadLogs(showAllProjects)` after `/rename` updates titles.

### C.2 PR-URL paste pattern

`parsePrIdentifier(value)` (ResumeConversation.tsx:36–46) accepts:

1. A direct integer like `1234`.
2. A GitHub PR URL — `value.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)`.

Returns the PR number or null. The picker is filtered by `filterByPr` prop (109–124) which can be `true` (show only PR-linked sessions), a number, or a URL string.

This connects with the CLI flag `--from-pr [value]` (`main.tsx:991`) — paste a PR URL or number, the picker filters to that PR's session(s).

### C.3 Fork-vs-continue selection

The CLI flag is `--fork-session` (`main.tsx:988`). When set, `forkSession` prop is true, and three branches diverge in `onSelect` (ResumeConversation.tsx:178–292):

- **Continue path** (220–224): `switchSession(asSessionId(result_3.sessionId), …)`, `renameRecordingForSession`, `resetSessionFilePointer`, `restoreCostStateForSession`. The session keeps its original UUID.
- **Fork path** (225–227): skips `switchSession`, calls `recordContentReplacement(result_3.contentReplacements)` instead so the new session has its own tool-result-replacement entries. A fresh session ID is generated by `regenerateSessionId()` upstream.
- **Worktree restore** (258–263) — only on continue (`!forkSession`); fork stays in the current worktree.

The agent definition is restored via `restoreAgentFromSession(result_3.agentSetting, mainThreadAgentDefinition, agentDefinitions)` (228–234), and the standalone-agent context (`agentName`, `agentColor`) via `computeStandaloneAgentContext` (246–252).

After all of this, ResumeConversation calls `setResumeData({...})` (276–283), which on next render switches to `<REPL initialMessages={resumeData.messages} ...>` (296–297).

### C.4 Cross-project resume

`checkCrossProjectResume(log_0, showAllProjects, worktreePaths)` (`utils/crossProjectResume.ts`, called at ResumeConversation.tsx:181). When the selected session is from a different repo:

1. Computes the canonical resume command (e.g. `cd /path/to/project && claude -r <sessionId>`).
2. Copies it to the system clipboard via `setClipboard` (OSC 52) (184–185).
3. Sets `crossProjectCommand` state, which flips the screen to `<CrossProjectMessage>` (340–391), printing:
   ```
   This conversation is from a different directory.
   To resume, run:
     <command>
   (Command copied to clipboard)
   ```
4. The component auto-exits via `process.exit(0)` after 100ms (392–397).

If the cross-project session is in a worktree of the same repo (`isSameRepoWorktree`), the resume continues inline.

### C.5 Checkpoint restoration UI

There is no dedicated "checkpoint" screen — checkpoints are implicit in the resume flow:

- `loadConversationForResume(log_0, undefined)` (191) reads the JSONL log, deserializes messages with `deserializeMessages` (filters unresolved tool_uses, adds synthetic-assistant if needed).
- `result_3.fileHistorySnapshots` (276–279) carries the file-history snapshots — these are the per-edit code rollbacks accessible via `/rewind` once back in REPL.
- `result_3.contentReplacements` carries tool-result replacements — needed so the resumed session sees the same large tool outputs without re-fetching.
- ant-only `feature('CONTEXT_COLLAPSE')` (264–269) restores collapse-snapshot state via `services/contextCollapse/persist.js`'s `restoreFromEntries`.
- `restoreSessionMetadata(forkSession ? {...result_3, worktreeSession: undefined} : result_3)` (254–257) replays the session's metadata into bootstrap state.

When `--rewind-files <user-message-id>` is passed in print mode (`main.tsx:991`), it bypasses the picker entirely: it loads the session, restores files to that point in `fileHistory`, and exits — see `cli/print.ts` for the actual entry.

---

## Part D — Architecture takeaways for `apps/cli/` (Ratatui port)

**Top 7 architectural findings:**

1. **`QueryGuard` synchronous state machine.** REPL replaced a buggy `isLoading + isQueryRunning` pair with a `subscribe`/`getSnapshot` external store, making "is a turn in flight" the single fixed point that drives spinner, prompt-disable, queue-processor, and the auto-restore guard. Our Rust port should mirror this with a single `Mutex<QueryState>` enum + `tokio::sync::watch::Sender` so PromptInput and the spinner share a synchronous truth.

2. **Ref-mirror pattern for state read inside callbacks.** Every state we read inside async callbacks has a ref mirror that's written eagerly inside the wrapper setter (`setMessages`, `setInputValue`, `setUserInputOnProcessing`). This decouples async closure freshness from React's render cycle. In Rust this maps cleanly to `Arc<RwLock<T>>` for the canonical value plus channel notifications for the UI.

3. **Streaming events have five distinct render paths.** Compact-boundary, ephemeral-progress merge, tombstone removal, normal append, and streaming-text typewriter — `handleMessageFromStream` dispatches all five via callbacks. A naive "append every chunk" turns transcripts into 120MB logs. Our renderer must implement progress-merge for `parentToolUseID + data.type` keys.

4. **Permission cycle is a finite state machine, not a list.** `getNextPermissionMode` is a `match` with side conditions (`canCycleToAuto`, `isBypassPermissionsModeAvailable`). Strip-dangerous-permissions on entering auto, restore plan slug on exit, debounced 800ms warning, capped at 3 lifetime appearances. This is far more than the 4-state cycle most clones implement.

5. **Idle-state intervention as a fully-instrumented funnel.** The 75-min/100k-token idle hint is wired with `tengu_willow_mode` GrowthBook flag (off/hint/dialog), variant capture in `idleHintShownRef` for paired `hint_shown`/`hint_converted` analytics, persistent dismissal flag, env-var overrides — a real product feature not a quick warning.

6. **FullscreenLayout is a 5-slot grid, not a sidebar layout.** `scrollable` (transcript), `bottom` (composer + dialogs + spinner), `overlay` (permission requests), `bottomFloat` (Buddy bubble), `modal` (centered local-jsx commands). Plus `sticky` (unseen-divider pill) tracked independently. No Claude Code "sidebar" exists — sessions are pickable via `/resume` only.

7. **Resume flow has three modes with cross-project escape.** Fork (new ID, no worktree restore, copy contentReplacements), continue-same-repo, continue-cross-project (auto-copies command to clipboard + exits). Worktree state is per-session and round-trips through JSONL. This is the only safe way to support "resume in another project" without leaking permission rules across projects.

**Top 4 things our `apps/cli/` Ratatui TUI is missing:**

1. **Plan-mode dialog with sticky footer + `Ctrl+G` editor handoff.** Our CLI has `update_plan` per the audit, but no `<ExitPlanModePermissionRequest>` analog with a scrollable plan body and sticky approve/edit/reject footer. Reference: `components/permissions/ExitPlanModePermissionRequest`. The plan slug + version-numbered file persistence (REPL.tsx:1793–1797) is also absent.

2. **Auto-mode classifier surface.** Our CLI never enters `auto` mode. Missing pieces: `cyclePermissionMode` cycle entry, `canCycleToAuto` capability check, `stripDangerousPermissionsForAutoMode`, the 800ms debounce + 3-lifetime cap warning, the per-turn `classifierDurationMs`/`classifierCount` row in api-metrics, and the GrowthBook killswitch (`checkAndDisableAutoModeIfNeeded` REPL.tsx:2768).

3. **PR-URL paste in resume picker + cross-project clipboard escape.** `parsePrIdentifier` accepts both an integer and a GitHub PR URL; `LogSelector` filters by PR. Cross-project sessions auto-copy `cd /path && claude -r <id>` to clipboard via OSC 52 and exit cleanly (ResumeConversation.tsx:181–187). Our Ratatui resume picker has neither feature.

4. **Streaming five-branch dispatch + ephemeral-progress merge.** Our renderer treats every chunk as an append. Without merge for `parentToolUseID+data.type` (REPL.tsx:2608–2628), Sleep/Bash one-second-tick tools blow up the transcript. Without compact-boundary fullscreen-keep (REPL.tsx:2594–2607), `/compact` wipes scrollback. Without tombstone-removal we accumulate replaced messages forever.

# T1 — AgentTool, /insights, ManagePlugins UI deep dive

> Scope: every file in `~/Desktop/reference/src/tools/AgentTool/` (15 .ts/.tsx + 6 built-ins), `commands/insights.ts` (3,200 LOC), `commands/plugin/ManagePlugins.tsx` (2,214 LOC). All citations are file:line.
>
> Adjacent files I had to read to make sense of the scope: `tasks/LocalAgentTask/LocalAgentTask.tsx`, `tasks/RemoteAgentTask/RemoteAgentTask.tsx`, `tasks/InProcessTeammateTask/InProcessTeammateTask.tsx`, `tools/SendMessageTool/SendMessageTool.ts`, `utils/worktree.ts`. The orientation doc said "RemoteAgentTask 126 KB" lives under `AgentTool/` — that file is actually `~/Desktop/reference/src/tools/AgentTool/UI.tsx` (125,359 bytes; 871 wrapped LOC of compiled-from-React-compiler-runtime JSX). The real `RemoteAgentTask.tsx` lives under `tasks/`.

---

## 1. `AgentTool.tsx` — wire name, schema, dispatch

### 1.1 Wire name + aliases (`constants.ts`)

`AgentTool/constants.ts:1-3`:

```ts
export const AGENT_TOOL_NAME = 'Agent';
export const LEGACY_AGENT_TOOL_NAME = 'Task'; // alias kept for permission rules, hooks, resumed sessions
export const VERIFICATION_AGENT_TYPE = 'verification';
```

The tool is registered as `Agent` but accepts `Task` as an alias (`AgentTool.tsx:228 aliases: [LEGACY_AGENT_TOOL_NAME]`). Permission rules, hooks, and saved sessions written under the `Task` name continue to resolve. `tengu_auto_mode_decision` analytics events log under `LEGACY_AGENT_TOOL_NAME` for continuity (`agentToolUtils.ts:436`).

`ONE_SHOT_BUILTIN_AGENT_TYPES` at `constants.ts:9-12` is `Set(['Explore', 'Plan'])`. Agents in that set are run-once: the parent never `SendMessage`s back to continue them, so the result trailer (`agentId: <id> · <usage>`) is suppressed at `AgentTool.tsx:1356-1361`. Comment cites ~135 chars × 34M Explore runs/week ≈ 1-2 Gtok/week saved.

### 1.2 Input schema (`AgentTool.tsx:82-138`)

Base schema has 5 fields: `description` (3-5 word string), `prompt` (the directive), `subagent_type` (optional — name of the agent definition; absent triggers the fork path under the `FORK_SUBAGENT` GrowthBook gate), `model` (`'sonnet'|'opus'|'haiku'`, optional override), `run_in_background` (boolean).

`fullInputSchema` at `:91-102` extends with multi-agent params (`name`, `team_name`, `mode`) plus `isolation` (`'worktree'` always; `'remote'` only when `USER_TYPE === 'ant'`) and `cwd` (only on `KAIROS` builds). The dead-code-elimination guard `"external" === 'ant'` at `:99` is why ant-only branches compile out of public binaries.

The schema is _swapped_ at runtime (`:110-125`): if background tasks disabled or fork experiment enabled, `run_in_background` is `.omit()`-ed so the model never sees it. Comment at `:115-121` notes this `feature(KAIROS)`/lazy-schema pattern is acceptable here because divergence window is "one session per gate flip" and worst case is a no-op param.

### 1.3 Output schema (`AgentTool.tsx:141-191`)

Discriminated union on `status`:

| `status`             | Origin                                                                       | Result                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'completed'`        | sync agent finished                                                          | `agentToolResultSchema` + `prompt`                                                                                                                                            |
| `'async_launched'`   | `run_in_background:true` or auto-background or coordinator/fork forced async | `agentId`, `description`, `prompt`, `outputFile`, `canReadOutputFile`                                                                                                         |
| `'teammate_spawned'` | `name + team_name` set, swarms enabled                                       | `teammate_id`, `agent_id`, `tmux_session_name`, `tmux_window_name`, `tmux_pane_id`, `team_name`, `is_splitpane`, `plan_mode_required`, `agent_type`, `model`, `name`, `color` |
| `'remote_launched'`  | `isolation: 'remote'` (ant)                                                  | `taskId`, `sessionUrl`, `description`, `prompt`, `outputFile`                                                                                                                 |

`teammate_spawned` and `remote_launched` are explicitly excluded from the _exported_ `outputSchema` to enable dead-code elimination for external builds (`:160-176`, `:181-191`).

### 1.4 Dispatch (`AgentTool.tsx:239-1262`)

The `call()` body branches in this order (top to bottom):

1. **Team name + name → spawnTeammate.** `:284-316`. Calls `spawnTeammate({name, prompt, description, team_name, use_splitpane:true, plan_mode_required:spawnMode==='plan', model, agent_type:subagent_type})` → tmux/iTerm window. Color is set on the agent definition before spawn so the grouped UI renders correctly.
2. **Fork path resolution.** `:318-323` — `subagent_type` undefined plus `isForkSubagentEnabled()` → `selectedAgent = FORK_AGENT`. Otherwise `subagent_type ?? GENERAL_PURPOSE_AGENT.agentType`.
3. **Recursive fork guard.** `:332-334` — checks `toolUseContext.options.querySource === 'agent:builtin:fork'` (compaction-resistant) plus `isInForkChild(toolUseContext.messages)` (XML-tag scan fallback).
4. **MCP-server gating.** `:367-410` — if agent declares `requiredMcpServers`, wait up to 30s with 500ms polls for pending servers, then verify availability via `mcp__<server>__<tool>` name pattern. Failure throws.
5. **Color assignment.** `:412-415`.
6. **Remote isolation.** `:435-482` — ant-only. `checkRemoteAgentEligibility()`, `teleportToRemote()`, then `registerRemoteAgentTask()` returns `{taskId, sessionId}`.
7. **System prompt + prompt messages.** `:483-541`. Fork path uses `toolUseContext.renderedSystemPrompt` (parent's exact bytes for cache identity) or recomputes via `buildEffectiveSystemPrompt()`. Normal path runs `selectedAgent.getSystemPrompt({toolUseContext})` then `enhanceSystemPromptWithEnvDetails()`.
8. **Async/sync decision.** `:557-567`. Forced async when: `run_in_background`, `selectedAgent.background:true`, coordinator mode, fork experiment, KAIROS mode, or proactive module active. Disabled by `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`.
9. **Worktree isolation.** `:580-602`. `createAgentWorktree(slug=agent-${earlyAgentId.slice(0,8)})`. If fork + worktree, append a `buildWorktreeNotice` user message.
10. **Async launch.** `:686-764`. `registerAsyncAgent()` returns `{agentId, abortController}`. Name → `agentNameRegistry` map (`:703-712`). `runAsyncAgentLifecycle()` runs in detached `runWithAgentContext()` so the parent's main-loop turn returns immediately with `{status:'async_launched', agentId, outputFile}`.
11. **Sync execution.** `:765-1262`. Runs `runAgent()`'s async iterator, races each `next()` against a "background signal" promise (so the user can press a key to background a long-running sync agent mid-flight). When backgrounded, the iterator is `.return()`-ed with a 1s timeout (`:918`) so MCP cleanup runs but doesn't hang the transition; a fresh `runAgent()` is spawned with the same `agentId`. After sync finalize, `classifyHandoffIfNeeded()` runs (`:1236-1252`) under the `TRANSCRIPT_CLASSIFIER` flag — auto-mode subagent output is gated by a YOLO classifier API call.

`mapToolResultToToolResultBlockParam()` at `:1298-1378` is where the four status types render their tool_result text. The async-launch hint instructs the parent: "Briefly tell the user what you launched and end your response. Do not generate any other text — agent results will arrive in a subsequent message" (`:1329`).

---

## 2. `runAgent.ts` — generator pattern (973 LOC)

`runAgent` is an `async function* runAgent(...)` (`:248-860`). It yields `Message` events drawn from the inner `query()` (`:748`) and is the only entry point that subagents (sync, async, fork, resume) use to actually execute.

### 2.1 Cache-safe params + summarization fork

`onCacheSafeParams` callback at `:721-730` receives `{systemPrompt, userContext, systemContext, toolUseContext, forkContextMessages}` after the agent's prefix is fully assembled. Background summarization (see `agentToolUtils.ts:543-552`) uses these to fork a _separate_ conversation that shares the worker's prompt cache; without sharing, summarization would double the per-agent prompt cost.

### 2.2 Slim subagent context

- `omitClaudeMd` at `:390-398` — `tengu_slim_subagent_claudemd` defaults true; Explore/Plan get a `userContext` with `claudeMd` stripped. Comment cites "~5-15 Gtok/week across 34M+ Explore spawns."
- `gitStatus` removal at `:404-410` — Explore/Plan never get the parent's `gitStatus` either ("up to 40KB, explicitly labeled stale"), saving "~1-3 Gtok/week fleet-wide."
- The whole `agentGetAppState` shim at `:416-498` overrides permission mode (only when parent isn't `bypassPermissions`/`acceptEdits`/`auto`), sets `shouldAvoidPermissionPrompts` for async agents that can't show UI, and sets `awaitAutomatedChecksBeforeDialog` for `bubble`-mode agents.

### 2.3 Tool resolution

`useExactTools` flag at `:500-502` — fork path skips `resolveAgentTools()` and uses `availableTools` raw (parent's exact tool array). Critical for prompt-cache hits: `resolveAgentTools` would re-filter through the worker's permission mode, producing different tool-def JSON.

### 2.4 Per-agent MCP servers

`initializeAgentMcpServers()` at `:95-218`. Two spec forms (`:140-170`):

- **Reference by name**: `'slack'` → `getMcpConfigByName('slack')` → reuses the parent's memoized client.
- **Inline definition**: `{[name]: McpServerConfig}` → creates a new dynamic client (`scope: 'dynamic'`).

Cleanup (`:197-210`) only tears down newly-created clients, not shared ones. There's also a plugin-only-policy guard at `:115-127`: when MCP is locked to plugin-only, user agents can't add their own MCP servers (but plugin/built-in/policy agents can).

### 2.5 Skill preloading

`:577-646`. `agent.skills` list is resolved via `resolveSkillName()` (`:945-973`) with three strategies: exact, `pluginPrefix:skillName`, and `:skillName` suffix scan. Each loaded skill is added as a meta `createUserMessage` (`:639-644`) with `formatSkillLoadingMetadata` so the UI shows "loading skill X."

### 2.6 Hooks + transcript persistence

- `executeSubagentStartHooks()` at `:532-555`. Returns additional contexts which become a hook-attachment user message.
- `registerFrontmatterHooks()` at `:567-575` — `Stop` hooks become `SubagentStop` for subagents (the `isAgent=true` arg). Plugin-only-policy guard (`:564-566`) blocks user-agent hook registration when locked.
- `recordSidechainTranscript()` at `:735-737, 793-800` — every yielded message is persisted incrementally to `subagents/<sessionId>/<agentId>.jsonl` so resume can reconstruct.
- `writeAgentMetadata()` at `:738-742` — writes `{agentType, worktreePath?, description?}` so resume knows which agent definition to rehydrate.

### 2.7 Cleanup `finally`

`:816-859`. MCP cleanup, session-hook clear, prompt-cache-break-detection cleanup, file-state-cache `.clear()`, perfetto unregister, transcript-subdir clear, `AppState.todos[agentId]` deletion (without this every TodoWrite-using subagent leaks a key forever — "Whale sessions spawn hundreds of agents"), and `killShellTasksForAgent()` to reap PPID=1 zombie shells from `run_in_background` bash.

---

## 3. `LocalAgentTask` — in-process subagent (682 LOC)

`tasks/LocalAgentTask/LocalAgentTask.tsx` (cited because the orientation said "LocalAgentTask.ts" lives in scope but it actually lives one directory up). Exports the lifecycle plumbing AgentTool calls into.

### 3.1 Progress tracker

`createProgressTracker()` at `:50-56` returns `{tokenCount:0, toolUseCount:0, lastActivity:undefined}`. `updateProgressFromMessage()` at `:68-95` walks `message.content` for `tool_use`/`tool_result` blocks and increments. `createActivityDescriptionResolver()` at `:110-147` looks up the tool's `getActivityDescription()` so the UI can show "Reading file.ts" instead of "FileRead{...}".

### 3.2 Task registration

- `registerAsyncAgent()` at `:466-524` — creates `LocalAgentTaskState` with `status:'running'`, `messages:[]`, `pendingMessages:[]`, `retain:false`, `isBackgrounded:false`, `abortController:new`. Stored in `appState.tasks[agentId]`.
- `registerAgentForeground()` at `:526-589` — same but with `autoBackgroundMs` timer that flips the task to async if no completion event arrives. Returns `{taskId, backgroundSignal: Promise<void>, cancelAutoBackground}`.

### 3.3 Notifications

`enqueueAgentNotification()` at `:197-279`. Builds a `<task-notification>` XML payload (`status`, `description`, `summary`, `usage`, `worktreePath`, `worktreeBranch`) plus a `finalMessage` and writes it to the message queue manager. The parent's main loop sees this on its next API turn as a synthetic user message.

### 3.4 Mailbox / pending messages

`queuePendingMessage()` at `:162-173` and `drainPendingMessages()` at `:181-195`. When `SendMessage` targets a still-running agent, the message is appended to `task.pendingMessages`. `runAgent` drains these between tool-use rounds.

### 3.5 Kill paths

`killAsyncAgent()` at `:281-307` aborts the controller, sets `status:'killed'`, suppresses double-kill via terminal-status check, and broadcasts `tengu_agent_tool_terminated` analytics. `killAllRunningAgentTasks()` at `:309-321` is the panic button (used on session shutdown / TaskStop tool / `chat:killAgents` event).

---

## 4. `tasks/RemoteAgentTask/RemoteAgentTask.tsx` — Cloud Runtime client (855 LOC)

The 126 KB file the orientation pointed to under `AgentTool/` is `AgentTool/UI.tsx`; the actual cloud-runtime client lives at `tasks/RemoteAgentTask/RemoteAgentTask.tsx`.

### 4.1 Task type registry

`REMOTE_TASK_TYPES = ['remote-agent', 'ultraplan', 'ultrareview', 'autofix-pr', 'background-pr']` at `:60`. Each type can register a `RemoteTaskCompletionChecker` (`registerCompletionChecker()` at `:84-86`); these get called on every poll tick and return `string|null` (non-null = complete). Used for PR-tracking remote agents that need to poll GitHub Checks.

### 4.2 Registration

`registerRemoteAgentTask()` at `:386-466`. Steps:

1. Generate task ID (`generateTaskId('remote_agent')`).
2. `initTaskOutput(taskId)` — write the empty output file so readers don't 404.
3. Create `RemoteAgentTaskState` with `status:'running'`, `sessionId`, `command`, `title`, `todoList:[]`, `log:[]`, `pollStartedAt:Date.now()`, plus optional `isUltraplan`/`isRemoteReview`/`isLongRunning`/`remoteTaskMetadata`.
4. `registerTask()` adds to AppState.
5. `persistRemoteAgentMetadata()` writes a sidecar to `~/.claude/projects/<project>/remote-agents/<taskId>.json` so `--resume` can reattach to live remote sessions.
6. `startRemoteSessionPolling()` returns a `stopPolling` cleanup.

### 4.3 Polling + result streaming

The polling loop uses `pollRemoteSessionEvents()` (from `utils/teleport.ts`). On each tick it fetches new SDK events from CCR (the cloud runtime), appends them via `appendTaskOutput()`, and updates `task.todoList` from `<task-notification>` and `<remote-review-progress>` XML tags it parses out (the `XML_TAG` constants are imported from `constants/xml.js:3` — `OUTPUT_FILE_TAG`, `REMOTE_REVIEW_PROGRESS_TAG`, `STATUS_TAG`, `SUMMARY_TAG`, `TASK_ID_TAG`, `TASK_NOTIFICATION_TAG`, `TASK_TYPE_TAG`, `TOOL_USE_ID_TAG`, `ULTRAPLAN_TAG`).

### 4.4 Restore on `--resume`

`restoreRemoteAgentTasks()` at `:477-506`. Reads `listRemoteAgentMetadata()` from sidecars, `fetchSession(sessionId)` against CCR. If 404 → drop the sidecar; if auth-error → keep, treat as recoverable; otherwise rebuild `RemoteAgentTaskState` and restart polling.

### 4.5 Special `ultraplan` flow

`extractPlanFromLog()` at `:208-223` and `enqueueUltraplanFailureNotification()` at `:225-240` handle the case where the user typed `/ultraplan` (a remote-only command that uses CCR with ExitPlanModeScanner). The TODO at `:459` says "fold ExitPlanModeScanner into this poller, drop startDetachedPoll" — so the architecture is mid-migration.

---

## 5. `InProcessTeammateTask` — separate-process via tmux/iTerm2

`tasks/InProcessTeammateTask/InProcessTeammateTask.tsx:1-30` defines the `Task` interface implementation. Exports `requestTeammateShutdown()`, `appendTeammateMessage()`, `injectUserMessageToTeammate()`, `findTeammateTaskByAgentId()`, `getAllInProcessTeammateTasks()`, `getRunningTeammatesSorted()`.

### 5.1 Pane backends

Three backends in `utils/swarm/backends/`:

- **`TmuxBackend`** at `TmuxBackend.ts:104` — `tmux new-window` (`:529`), `tmux split-window` (`:572,603,675`). Used when running inside a tmux session.
- **`ITermBackend`** at `ITermBackend.ts:79` — uses iTerm2's `it2 split` CLI. Many methods are no-ops because iTerm2 handles tab colors / titles / pane balancing automatically (`:267-311`).
- **`InProcessBackend`** at `InProcessBackend.ts` — same Node process, separated by AsyncLocalStorage. Used when neither tmux nor iTerm2 are present.

`detection.ts` picks a backend by env. Each spawns a sibling `claude` process with `CLAUDE_CODE_AGENT_NAME=<name>`, `CLAUDE_CODE_TEAM_NAME=<team>`, and the spawn-mode env var. The teammate's keystrokes go to its own pane; the leader controls via `tmux send-keys` (`TmuxBackend.ts`) or AppleScript→iTerm.

### 5.2 Task state + plan-mode approval

`InProcessTeammateTaskState` carries `shutdownRequested`, `pendingPlanApproval`, `messages`, `agentName`, `teamName`. `requestTeammateShutdown()` flips a flag the teammate's main loop reads on the next user-prompt boundary. Plan approval is implemented as a `plan_approval_response` structured message in `SendMessageTool` (`SendMessageTool.ts:888-908`).

---

## 6. Built-in agents

`built-in/` directory has 6 files. `builtInAgents.ts:22-72` decides which to register:

| Agent                 | `agentType`                    | `tools` / `disallowedTools`                                                               | `model`                                                 | `permissionMode` | `omitClaudeMd` | Notes                                                                                                                                                                               |
| --------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **general-purpose**   | `'general-purpose'`            | `['*']`                                                                                   | (default subagent model)                                | —                | false          | Default fallback. `generalPurposeAgent.ts:25-34`.                                                                                                                                   |
| **Explore**           | `'Explore'`                    | disallowed: `[Agent, ExitPlanMode, FileEdit, FileWrite, NotebookEdit]`                    | `process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku'` | (inherits)       | true           | Read-only. `exploreAgent.ts:64-83`. Hard prompt block `:24-58` enumerates all forbidden ops including `tmp` writes.                                                                 |
| **Plan**              | `'Plan'`                       | disallowed: `[Agent, ExitPlanMode, FileEdit, FileWrite, NotebookEdit]`                    | `'inherit'`                                             | (inherits)       | true           | `planAgent.ts:73-92`. Uses `EXPLORE_AGENT.tools`. Required "Critical Files" section in output.                                                                                      |
| **verification**      | `'verification'`               | disallowed: `[Agent, ExitPlanMode, FileEdit, FileWrite, NotebookEdit]`                    | `'inherit'`                                             | (inherits)       | —              | `background:true`, `color:'red'`, `criticalSystemReminder_EXPERIMENTAL` set. `verificationAgent.ts:134-152`. PASS/FAIL/PARTIAL contract enforced; classifier-friendly verdict line. |
| **claude-code-guide** | `CLAUDE_CODE_GUIDE_AGENT_TYPE` | tools `[Bash,FileRead,WebFetch,WebSearch]` (or Glob/Grep instead of Bash on non-embedded) | `'haiku'`                                               | `'dontAsk'`      | —              | `claudeCodeGuideAgent.ts:98-205`. Dynamically loads user's MCP servers + custom skills + agents into the prompt.                                                                    |
| **statusline-setup**  | `'statusline-setup'`           | `['Read', 'Edit']`                                                                        | `'sonnet'`                                              | —                | —              | `color:'orange'`. `statuslineSetup.ts:134-144`.                                                                                                                                     |

Activation logic at `builtInAgents.ts:22-72`:

- `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` + non-interactive → `[]`.
- `COORDINATOR_MODE=1` + GrowthBook flag → returns `getCoordinatorAgents()` instead.
- Always: `[GENERAL_PURPOSE_AGENT, STATUSLINE_SETUP_AGENT]`.
- - `EXPLORE_AGENT, PLAN_AGENT` if `BUILTIN_EXPLORE_PLAN_AGENTS` feature flag and `tengu_amber_stoat` GB flag.
- - `CLAUDE_CODE_GUIDE_AGENT` if entrypoint is not SDK (`CLAUDE_CODE_ENTRYPOINT !== 'sdk-ts'/'sdk-py'/'sdk-cli'`).
- - `VERIFICATION_AGENT` if `VERIFICATION_AGENT` feature flag and `tengu_hive_evidence` GB flag.

`FORK_AGENT` (`forkSubagent.ts:60-71`) is a _synthetic_ built-in — never registered, only constructed at fork-call time. `agentType:'fork'`, `tools:['*']`, `maxTurns:200`, `model:'inherit'`, `permissionMode:'bubble'`, `getSystemPrompt:()=>''` (replaced with parent's rendered bytes).

---

## 7. Custom agent loader (`loadAgentsDir.ts` 755 LOC)

### 7.1 File format

Markdown with YAML frontmatter (`parseAgentFromMarkdown` at `:541-755`). Required: `name`, `description`. Optional: `tools` (CSV/list), `disallowedTools`, `skills` (CSV preloaded skill names), `mcpServers` (string ref or inline `{name: McpServerConfig}`), `hooks` (full HooksSettings), `color` (one of 8 — `agentColorManager.ts:14-23`), `model` (string, `'inherit'` allowed), `effort` (`EFFORT_LEVELS` enum or int), `permissionMode` (`PERMISSION_MODES` enum), `maxTurns` (positive int), `background` (`'true'|true`), `memory` (`'user'|'project'|'local'`), `isolation` (`'worktree'|'remote'`-on-ant), `initialPrompt`. The file body becomes the system prompt (`:713 systemPrompt = content.trim()`).

JSON variant via `parseAgentFromJson()` at `:445-516` — same fields plus `prompt` instead of body.

### 7.2 Discovery paths

`loadMarkdownFilesForSubdir('agents', cwd)` (called at `:308`) walks:

- `<gitRoot>/.claude/agents/` → source `'projectSettings'`.
- `<cwd>/.claude/agents/` → source `'localSettings'`.
- `~/.claude/agents/` → source `'userSettings'` (but `getCanonicalGitRoot` handles git worktrees specially — when worktree has no `.claude/agents`, it falls back to the main repo's at `markdownConfigLoader.ts:312-326`).
- `<managedDir>/.claude/agents/` → source `'policySettings'` (admin-locked).
- Plugin agents loaded separately by `loadPluginAgents()` — source `'plugin'`.
- Built-in agents added last.

### 7.3 Override precedence

`getActiveAgentsFromList()` at `:193-221` walks groups in this order:

```
[builtIn, plugin, user, project, flag, managed]
```

and writes each into a `Map<agentType, AgentDefinition>`, last-write-wins. So `managed` overrides `user`, `user` overrides `built-in`. The `resolveAgentOverrides()` helper in `agentDisplay.ts:46-72` annotates a "secondary" list with `overriddenBy:source` so the `/agents` UI can show "X (overridden by managed)".

### 7.4 Memory + snapshot

If `memory: user|project|local`, the agent's system prompt is concatenated with `loadAgentMemoryPrompt(agentType, scope)` (`:726-732`). That helper (`agentMemory.ts:138-177`) writes a `MEMORY.md` skeleton under `~/.claude/agent-memory/<agentType>/` (user) or `.claude/agent-memory/<agentType>/` (project) or `.claude/agent-memory-local/<agentType>/` (local, never committed) and then injects a `buildMemoryPrompt` block. The `CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES` env can append cowork-specific rules.

`agentMemorySnapshot.ts:98-186` implements an init/upgrade flow: if a project ships a snapshot at `.claude/agent-memory-snapshots/<agentType>/snapshot.json`, the user's local memory is initialized from it on first use; subsequent newer snapshots prompt the user to merge. Tracked via `.snapshot-synced.json` sidecar.

### 7.5 Memory tool injection

`isAutoMemoryEnabled()` + memory scope set → `parseAgentFromMarkdown` at `:663-674` (and `parseAgentFromJson` at `:456-467`) injects `Write/Edit/Read` into the agent's allowlist if not already present, so the agent can actually write to its memory dir.

---

## 8. Worktree isolation (`utils/worktree.ts` 1519 LOC)

### 8.1 Slug validation

`validateWorktreeSlug()` at `:66-87`. Constants: `MAX_WORKTREE_SLUG_LENGTH = 64` (`:49`), `VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/` (`:48`). Each `/`-separated segment is validated; `.` and `..` rejected outright. So `agent-12abcdef` works, `agent-12abcdef/sub` works (treated as nested), but `../foo` errors.

### 8.2 Creation

`createAgentWorktree(slug)` at `:902-952`. Slug from AgentTool is `agent-${earlyAgentId.slice(0, 8)}` (`AgentTool.tsx:591`). Path is `<gitRoot>/.claude/worktrees/<slug>/`. Two paths:

- **Hook-based** (`hasWorktreeCreateHook()`) — calls user's `WorktreeCreate` hook handler. Returns `{worktreePath, hookBased:true}`. Used to support non-git VCS like Sapling, Jujutsu.
- **`git worktree add -B <branch> <path> HEAD`** — branch name is `worktreeBranchName(slug)` = e.g. `claude/agents/agent-12abcdef`. After creation, `performPostCreationSetup()` symlinks `node_modules`, `.venv`, etc. so the worktree shares heavy dependencies.

The mtime touch at `:946-947` is critical: cleanup uses mtime to detect stale agent worktrees, so resuming an old worktree must bump it.

### 8.3 GC

`cleanupStaleAgentWorktrees(cutoffDate)` at `:1058-1136`. Comment at `1034` says "the 30-day sweep still cleans up worktrees leaked by older builds." Walks `.claude/worktrees/`, filters by `EPHEMERAL_WORKTREE_PATTERNS` regex, removes any that are (a) older than cutoff, (b) clean working tree (`git status --porcelain` empty), (c) no unpushed commits (`rev-list --max-count=1 HEAD --not --remotes`). Bonus: runs `git worktree prune` if it removed anything.

### 8.4 Change detection

`hasWorktreeChanges()` at `:1144-1180`. `git status --porcelain` plus `git rev-list <headCommit>..HEAD` (commits made on the worktree branch since spawn). Fail-closed: any non-zero exit → `true` (preserve the worktree).

`AgentTool.tsx:644-685` uses this in `cleanupWorktreeIfNeeded()`: if changes exist, return `{worktreePath, worktreeBranch}` (kept; user can examine/merge); if clean, `removeAgentWorktree()` and clear from metadata so resume doesn't try a deleted dir.

---

## 9. SendMessage / mailbox / agentNameRegistry / UDS / Remote Control bridge

### 9.1 SendMessage tool input

`SendMessageTool.ts:67-87`. Input: `to` (recipient), `summary` (5-10 word preview), `message` (string OR structured). Recipient can be:

- Teammate name (string).
- `'*'` for team broadcast.
- `'uds:<socket-path>'` for a local Unix-domain peer (`UDS_INBOX` flag).
- `'bridge:<session-id>'` for a Remote Control peer (typically the desktop app talking to the CLI).

### 9.2 Routing order (`SendMessageTool.ts:686-915`)

Priority:

1. **Bridge target** — Remote Control session via `getReplBridgeHandle()`.
2. **UDS target** — `sendToUdsSocket()`.
3. **agentNameRegistry lookup** (`:802-805`) — `appState.agentNameRegistry.get(input.to)` returns the agent ID for a named subagent. If found and task is running → `queuePendingMessage` (mailbox). If task stopped → `resumeAgentBackground()`. If task evicted from state → resume from disk transcript.
4. **Team broadcast** — `'*'` → `handleBroadcast()` writes to every team member's mailbox file.
5. **Team peer** — `handleMessage()` writes a single mailbox entry.
6. **Structured messages** — `shutdown_request`, `shutdown_response`, `plan_approval_response`. Cannot broadcast (`:884`).

### 9.3 agentNameRegistry

`AppStateStore.ts:163` declares `agentNameRegistry: Map<string, AgentId>` (init at `:471 new Map()`). `AgentTool.tsx:703-712` populates it on async-launch when the parent passed `name` in the input. So the parent can later do `SendMessage({to: 'audit', message: 'how far?'})` and route to the still-running fork named `audit`.

### 9.4 Mailbox

`utils/teammateMailbox.ts` (referenced at `SendMessageTool.ts:39`) writes to `~/.claude/teams/<team>/mailboxes/<recipient>.jsonl`. The recipient's main loop drains its mailbox between user-prompt rounds and surfaces inbound messages as system reminders.

---

## 10. Concurrency + parallel execution

There is **no hard concurrency limit** baked into AgentTool. The relevant prose lives in the prompt itself (`prompt.ts:271`):

> "If the user specifies that they want you to run agents 'in parallel', you MUST send a single message with multiple AGENT_TOOL_NAME tool use content blocks."

The tool sets `isConcurrencySafe()` → `true` (`AgentTool.tsx:1273-1275`) so the runtime allows multiple tool_use blocks for `Agent` to fire concurrently in one turn. Each spawn registers its own `LocalAgentTask` (`registerAsyncAgent`) or `LocalAgentTask + AbortController` (sync). Memory/CPU/MCP-connection pressure is the only real backpressure.

Auto-background timeout at `AgentTool.tsx:72-77` — `getAutoBackgroundMs()` returns `120_000` ms (2 min) when `CLAUDE_AUTO_BACKGROUND_TASKS=1` or `tengu_auto_background_agents` GB flag is true; 0 otherwise. So sync agents that take > 2 min auto-flip to async without user intervention.

The Pro-tier subscription check at `prompt.ts:246-249` removes the "launch multiple concurrently" hint from Pro users — _not_ a limit, just a UI nudge ("Launch multiple agents concurrently whenever possible, to maximize performance").

---

## 11. `commands/insights.ts` — `/insights` Year-in-Review (3,200 LOC)

### 11.1 Slash command shape

`insights.ts:3039-3182`:

```
{ type: 'prompt', name: 'insights',
  description: 'Generate a report analyzing your Claude Code sessions',
  source: 'builtin', getPromptForCommand(args) … }
```

Returns a `text` content block telling Claude to print a fixed `<message>` block with the report URL. So the command is _self-completing_ — it generates an HTML file, optionally uploads it to S3, and feeds the parent Claude a precomputed summary message.

### 11.2 Pipeline (six phases)

1. **Optional remote collection** (`:2807-2812`) — ant-only `--homespaces` flag scps `~/.claude/projects/*.jsonl` from running Coder workspaces.
2. **Lite scan** (`:2815-2816`) — `scanAllSessions()` returns filesystem metadata only (path + mtime + size).
3. **SessionMeta loading** (`:2820-2840`) — `loadCachedSessionMeta()` reads from disk in batches of 50; uncached up to 200 sessions go to phase 4. Cache lives at `~/.claude/usage-data/session-meta/<sessionId>.json`.
4. **Full log parsing** (`:2864-2889`) — `loadAllLogsFromSessionFile()` parses JSONL. Filters out meta-sessions (sessions whose first 5 user messages contain `'RESPOND WITH ONLY A VALID JSON OBJECT'` or `'record_facets'` — the facet-extraction subagents themselves get logged as sessions). `logToSessionMeta()` extracts tool counts, languages from extensions (`EXTENSION_TO_LANGUAGE` at `:332-349`), interruptions, response times, lines added/removed, MCP usage, web search/fetch usage, multi-clauding timestamps.
5. **Branch dedup** (`:2891-2912`) — sessions with multiple branches keep the one with highest `user_message_count` (then highest duration). `deduplicateSessionBranches()` is also exported at `:812` for testing.
6. **Facet extraction** (`:2929-2971`) — for substantive sessions (`> 2 user msgs`, `> 1 min`), a parallel batch of 50 calls fires `extractFacetsFromAPI()` (`:1001-1059`) which uses `queryWithModel()` with `getAnalysisModel()` (Opus) and the `FACET_EXTRACTION_PROMPT` at `:430` to extract `{underlying_goal, goal_categories, outcome, user_satisfaction_counts, claude_helpfulness, session_type, friction_counts, friction_detail, primary_success, brief_summary, user_instructions_to_claude}` per session.

### 11.3 Aggregation

`aggregateData()` at `:1145-1323`. Crunches per-session tool counts, languages, goal categories, outcomes, satisfaction, friction, success factors, response times (computes median + avg), days active, messages-per-day, and `multi_clauding` stats.

### 11.4 Multi-clauding detection

`detectMultiClauding()` at `:1062-1143`. Sliding 30-min window across all user-message timestamps from all sessions. For each message, check if the same `sessionId` appeared _earlier_ in the window with a _different_ sessionId between — pattern `s1 → s2 → s1` within 30 minutes = multi-clauding event. Returns `{overlap_events, sessions_involved, user_messages_during}`.

### 11.5 Parallel insight generation

`generateParallelInsights()` at `:1612-1804`. Six (or eight on ant) sections kicked off via `Promise.all`:

- `project_areas` — 4-5 areas with session_count + description.
- `interaction_style` — 2-3 paragraphs in second person.
- `what_works` — 3 impressive_workflows.
- `friction_analysis` — 3 categories × 2 examples.
- `suggestions` — `claude_md_additions`, `features_to_try` (drawn from a hard-coded reference at `:1396-1415` with MCP/Skills/Hooks/Headless/Task-Agents), `usage_patterns`.
- `on_the_horizon` — 3 ambitious workflow opportunities.
- (ant-only) `cc_team_improvements`, `model_behavior_improvements`.
- `fun_ending` — a memorable qualitative moment.

Then a _second_ `at_a_glance` pass synthesizes all sections into a 4-bullet header. `INSIGHT_SECTIONS[i].maxTokens` is `8192` for every section.

### 11.6 HTML output + upload

The HTML report (path returned at `htmlPath`, full content rendered in code I didn't fully read) is written via `escapeXmlAttr` (`:38`) and saved under `~/.claude/usage-data/`. Ant only: `execFileSync('ff', ['cp', htmlPath, s3Path])` uploads to `s3://anthropic-serve/atamkin/cc-user-reports/` so users can share. External users see a `file://` URL.

---

## 12. `commands/plugin/ManagePlugins.tsx` — `/plugins` interactive UI (2,214 LOC)

### 12.1 View states

`ViewState` at `:78-105`:

- `'plugin-list'` — paginated browse view.
- `'plugin-details'` — per-plugin detail page.
- `'configuring'` / `'configuring-options'` / `'plugin-options'` — interactive option-collection wizards.
- `'confirm-project-uninstall'` — special dialog when uninstalling a project-scope plugin.
- `'confirm-data-cleanup'` — when a plugin has persistent data in `${CLAUDE_PLUGIN_DATA}` and is being last-scope uninstalled.
- `'flagged-detail'` / `'failed-plugin-details'` — error/security view for flagged or failed plugins.
- `'mcp-detail'` / `'mcp-tools'` / `'mcp-tool-detail'` — MCP-server inspection sub-views.

### 12.2 Six scope groups

`getScopeLabel()` at `:2158-2179`:
| Scope | Source |
|---|---|
| `flagged` | Plugins quarantined by security review. |
| `project` | `.claude/settings.json` in repo (shared with team). |
| `local` | `.claude/settings.local.json` (machine-only, gitignored). |
| `user` | `~/.claude/settings.json`. |
| `enterprise` | Enterprise-policy-managed. |
| `managed` | Org-admin-managed. |
| `builtin` | Shipped with Claude Code. |
| `dynamic` | Plugin loaded at runtime (renamed to `Built-in` in display). |

### 12.3 Single-plugin operations

`handleSingleOperation()` at `:998-1141` (4 ops × guards):

| Op          | Built-in allowed? | Managed allowed?                         | Notes                                                                                                                              |
| ----------- | ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `enable`    | yes               | no — managed plugins controlled by admin | Calls `enablePluginOp(pluginId)`                                                                                                   |
| `disable`   | yes               | no                                       | Returns `reverseDependents` so UI can warn                                                                                         |
| `uninstall` | **no**            | **no**                                   | Branches: project-scope → confirm dialog; data-dir nonempty + last scope → `confirm-data-cleanup` dialog; else `uninstallPluginOp` |
| `update`    | **no**            | yes (only op managed plugins permit)     | If `alreadyUpToDate`, exits early with success message                                                                             |

After mutation: `clearAllCaches()` (`:1105`), check if plugin is enabled-after, if so jump to `plugin-options` view to prompt for `manifest.userConfig` + channel `userConfig` fields. Final message: `✓ ${operationName} ${name}${depWarn}. Run /reload-plugins to apply.`

### 12.4 Toggle (Space key)

`handleToggle()` at `:1158-1224` is the toggle for the list view's `Space` key. Optimistic UI: pendingToggle map tracks "will-enable"/"will-disable" so user sees instant feedback. Mutation runs in a fire-and-forget IIFE; on cancel (toggle again before reload), it reverses by calling the opposite `enablePluginOp`/`disablePluginOp`.

### 12.5 MCP integration

The view has dedicated nested views (`mcp-detail`, `mcp-tools`, `mcp-tool-detail`) reusing `MCPRemoteServerMenu`, `MCPStdioServerMenu`, `MCPToolDetailView`, `MCPToolListView` from `components/mcp/`. So `/plugins` is also a one-stop shop for MCP server inspection — toggle, tool list, and per-tool detail.

### 12.6 .mcpb support

`mcpbHandler.ts` (`:36`) loads `.mcpb` files (Desktop Extensions). `loadMcpbFile()` extracts the manifest; `McpbNeedsConfigResult` flags when user-config is required. This path is shared with the Desktop app.

### 12.7 Plugin discovery

`loadAllPlugins()` (`:40`), `getMarketplace()` (`:35`), `loadInstalledPluginsV2()` (`:34`). Marketplaces are GitHub repos with `.claude-plugin/marketplace.json`; installed-plugins state lives in `~/.claude/installed-plugins-v2.json`. `getFlaggedPlugins()` at `:38` reads the security-flagged list (e.g. plugins that tried to inject prompts via skill descriptions).

---

## Cross-cutting prompts (`prompt.ts` 287 LOC)

`getPrompt()` at `:66-287` builds the AGENT tool's description shown to the model. Three significant forks:

1. **Static-list-vs-attachment.** `shouldInjectAgentListInMessages()` at `:59-64` checks `tengu_agent_list_attach` GB flag. When true, the agent list is injected as an `agent_listing_delta` _attachment message_ (not in the tool description) so MCP/plugin async load doesn't bust the tools-block prompt cache. Comment at `:53-55`: "The dynamic agent list was ~10.2% of fleet cache_creation tokens."
2. **Coordinator vs non-coordinator.** Coordinator gets a slim prompt (`:216-218`); the coordinator system prompt covers usage notes elsewhere.
3. **Fork-vs-fresh.** Under `FORK_SUBAGENT` flag, prompt acquires a "When to fork" section (`:80-97`) with rules: don't peek at output_file mid-flight, don't race / fabricate fork results, fork prompts are _directives_ not briefings. Replaces the "writing the prompt" / examples sections accordingly.

Concurrency note: the line `Launch multiple agents concurrently whenever possible…` at `:248` only renders when `getSubscriptionType() !== 'pro'` AND list is _not_ via attachment.

---

## Top 7 findings

1. **Wire name has dual identity (`Agent` + `Task` alias).** `constants.ts:1-3`. Critical for backward compat: hooks, permission rules, sessions written under `Task` keep working. Analytics intentionally log under the legacy name (`agentToolUtils.ts:436`).
2. **Fork subagent shares prompt cache via byte-identical prefix.** `forkSubagent.ts:107-169` builds the child's first user message with placeholder `tool_result`s identical across all forks; only the per-child directive text differs. `useExactTools` (`runAgent.ts:500-502, 668-694`) preserves the parent's tool array and `thinkingConfig`. Without this the cache hit rate would collapse.
3. **Worktree isolation has 30-day GC + slug validation + symlink optimization.** `utils/worktree.ts:902-1136`. Slug regex rejects `..`, length-capped at 64. Stale GC requires clean tree + no unpushed commits. `performPostCreationSetup` symlinks `node_modules`/`.venv` so worktrees don't blow up disk.
4. **Async-launch is the default in modern modes.** Coordinator, fork, KAIROS, and proactive modes all force async (`AgentTool.tsx:557-567`). Plus there's a 2-minute auto-background timer for sync agents (`:72-77`). The whole tool is moving toward an "agents always run in background, parent gets notified" model.
5. **Per-agent MCP servers via two specs.** `runAgent.ts:140-170`. `'serverName'` reuses memoized parent client; `{name: McpServerConfig}` creates new client cleaned up on agent exit. Plugin-only-policy gate (`runAgent.ts:115-127`) lets admin lock MCP to plugin-trusted agents only.
6. **`agentNameRegistry` is the lookup that makes named subagents persistent.** `AgentTool.tsx:703-712, AppStateStore.ts:163`. Lets `SendMessage({to:'audit'})` route to a still-running fork without exposing internal IDs to the model. Resume falls through three layers: live task → stopped task → disk transcript (`SendMessageTool.ts:802-873`).
7. **Subagent token-cost optimizations are documented in inline comments with telemetry.** Examples: omitClaudeMd "saves ~5-15 Gtok/week × 34M Explore spawns" (`runAgent.ts:387-388`); One-shot built-in trailer suppression "1-2 Gtok/week" (`AgentTool.tsx:1352-1354`); attachment-vs-inline agent list "10.2% of fleet cache_creation" (`prompt.ts:53-55`). These are real product-level metrics, not just theoretical optimizations.

## Top 5 to-port items

1. **Built-in agents catalog (Explore + Plan + Verification + general-purpose) with read-only contracts and PASS/FAIL/PARTIAL verdict for verification.** This is the most readily-portable and high-value. Each is ~50-150 LOC of system prompt + 5-line definition. Prompts are excellent spec for our verification agent and our explore-codebase agent.
2. **Markdown+YAML agent loader with `.claude/agents/` discovery + override hierarchy.** `loadAgentsDir.ts` is 755 LOC but the file format is simple, and we need this for parity with Claude Code. Adopt: source enum, override precedence (`builtin → plugin → user → project → flag → managed`, last write wins), hot-reload on `clearAgentDefinitionsCache()`, plus the YAML schema.
3. **Worktree isolation as a first-class agent feature.** `utils/worktree.ts:902-952` shows the right ergonomics: optional `isolation: 'worktree'` flag → automatic worktree created → if no diff, removed; if diff, retained. This belongs on the `apps/cli` exec-policy track. We already have `git2`/`gix` deps — porting `validateWorktreeSlug` + `cleanupStaleAgentWorktrees` is a half-day of Rust.
4. **`agentNameRegistry` + SendMessage routing.** Our existing CLI has subagents but no name-routing — you can't easily continue a stopped subagent or send a message to a still-running one. The five-layer fallback (live → stopped → disk transcript) is exactly the UX we want for the multi-provider differentiator.
5. **Auto-background after N seconds.** The 2-minute auto-flip-to-async pattern (`AgentTool.tsx:72-77`) is a UX win we don't ship today. Combined with `outputFile` and progress notifications, sync agents become "background by default after 2 min" without any user-visible mode change.

## Items intentionally not ported

- `RemoteAgentTask` cloud-runtime client. Anthropic-specific; we run our own Cloud Runtime fork later if at all.
- `ultraplan` / `ultrareview` flows. Ant-only, depend on CCR.
- `coordinator` mode (`builtInAgents.ts:35-43`). Anthropic-internal A/B test.
- The `/insights` HTML upload to S3 (`insights.ts:3076-3098`). Would need our own bucket and we can ship a local-file-only version first.
- The `proactive`/`KAIROS` modes — Anthropic experimental ambient-agent flags.

## Files cited

- `~/Desktop/reference/src/tools/AgentTool/AgentTool.tsx` — entry point, dispatch, schemas, async/sync execution.
- `~/Desktop/reference/src/tools/AgentTool/runAgent.ts` — generator, MCP, hooks, skills, transcript.
- `~/Desktop/reference/src/tools/AgentTool/resumeAgent.ts` — resume logic for SendMessage to stopped agents.
- `~/Desktop/reference/src/tools/AgentTool/forkSubagent.ts` — fork synthetic agent + cache-identical message construction.
- `~/Desktop/reference/src/tools/AgentTool/loadAgentsDir.ts` — markdown/JSON loader, schema, override hierarchy.
- `~/Desktop/reference/src/tools/AgentTool/prompt.ts` — tool description, fork section, examples.
- `~/Desktop/reference/src/tools/AgentTool/agentToolUtils.ts` — resolve tools, finalize, runAsyncAgentLifecycle, classifier.
- `~/Desktop/reference/src/tools/AgentTool/agentMemory.ts` + `agentMemorySnapshot.ts` — persistent memory + snapshots.
- `~/Desktop/reference/src/tools/AgentTool/agentColorManager.ts` — 8-color palette with theme mapping.
- `~/Desktop/reference/src/tools/AgentTool/agentDisplay.ts` — source groups, override annotation.
- `~/Desktop/reference/src/tools/AgentTool/builtInAgents.ts` — registration + feature flags.
- `~/Desktop/reference/src/tools/AgentTool/built-in/{generalPurposeAgent,exploreAgent,planAgent,verificationAgent,claudeCodeGuideAgent,statuslineSetup}.ts` — six built-ins.
- `~/Desktop/reference/src/tools/AgentTool/constants.ts` — wire names, ONE_SHOT set.
- `~/Desktop/reference/src/tools/AgentTool/UI.tsx` — Ink/React rendering (125 KB; the file orientation thought was RemoteAgentTask).
- `~/Desktop/reference/src/tasks/LocalAgentTask/LocalAgentTask.tsx` — task lifecycle, mailbox, kill paths.
- `~/Desktop/reference/src/tasks/RemoteAgentTask/RemoteAgentTask.tsx` — actual CCR client.
- `~/Desktop/reference/src/tasks/InProcessTeammateTask/InProcessTeammateTask.tsx` — pane-backed peer.
- `~/Desktop/reference/src/tools/SendMessageTool/SendMessageTool.ts` — routing across registry/UDS/bridge/team.
- `~/Desktop/reference/src/utils/worktree.ts` — slug validation, GC, change detection.
- `~/Desktop/reference/src/utils/swarm/backends/{TmuxBackend,ITermBackend,InProcessBackend}.ts` — pane providers.
- `~/Desktop/reference/src/state/AppStateStore.ts:163,471` — `agentNameRegistry` declaration.
- `~/Desktop/reference/src/commands/insights.ts` — `/insights` Year-in-Review.
- `~/Desktop/reference/src/commands/plugin/ManagePlugins.tsx` — `/plugins` interactive UI.

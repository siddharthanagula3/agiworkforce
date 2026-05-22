# Claude Code Agent-Loop Core (`~/Desktop/reference/src/`)

Research pass 01/18. **Scope:** entry/boot, Tool/Task system, the QueryEngine (LLM
routing core), context, history, cost, dialog launchers. All citations are
absolute paths to `~/Desktop/reference/src/`.

This is the strategically most important pass: it establishes the contract
between user prompt → system prompt → LLM stream → tool execution → state
update → next iteration that our `apps/cli` agent loop must match (with
multi-provider extensions).

---

## 0. Summary of architecture

There is no "agent class" in Claude Code. The agent is **`async function*
queryLoop` in `query.ts`**, a single `while(true)` async generator that
streams `SDKMessage`s. `QueryEngine` (in `QueryEngine.ts`) wraps it as a
session object with a stable `submitMessage()` API for the SDK and headless
print path. The REPL has a parallel React/Ink wrapper around the same
underlying `query()`. There is no provider abstraction at this layer —
everything goes through `deps.callModel = queryModelWithStreaming` from
`services/api/claude.js` (Anthropic-only). The "Tool" interface is a 696-LOC
TypeScript discriminated record with permission + UI hooks baked in, registered
via a single `getAllBaseTools()` array in `tools.ts`. "Tasks" are not subagents —
they're **side-channel work units** (LocalShellTask = `claude ps` background
bash, LocalAgentTask = subagent, RemoteAgentTask = Dispatch, DreamTask = sleep).

---

## 1. Entry & Boot

### 1.1 `cli.tsx` — the bootstrap layer (303 LOC)

`/Users/siddhartha/Desktop/reference/src/entrypoints/cli.tsx:33-300` is the
**fast-path router**. It checks `process.argv` against ~12 flag patterns
(`--version`, `--dump-system-prompt`, `--claude-in-chrome-mcp`, `--daemon-worker`,
`remote-control`, `daemon`, `ps`/`logs`/`attach`/`kill`, `new`/`list`/`reply`
templates, `environment-runner`, `self-hosted-runner`, `--worktree --tmux`).
Each fast-path uses `await import(...)` to keep the version flag at zero module
cost. Only after all fast paths miss does it import `'../main.js'` and call
`cliMain()` (`cli.tsx:295-298`). Last line: `void main()` (`cli.tsx:300`) —
top-level side-effect entry.

Architectural takeaway: **fast-path subcommands bypass the full module graph
entirely.** Our Rust CLI similarly has subcommands (`agiworkforce ps`,
`agiworkforce mcp`) but they currently load all crates because cargo links
statically. Lazy initialization is the analog.

### 1.2 `bootstrap/state.ts` — global session state (1,200 LOC, 56k bytes)

Single file holding:

- `getSessionId() / switchSession()` (`bootstrap/state.ts:431-490`) —
  subscriptable session identity.
- Cost counters (`addToTotalCostState`, `getTotalCostUSD`, `getModelUsage`),
  duration counters, OpenTelemetry hooks (`AttributedCounter`).
- `getProjectRoot()` / `setProjectRoot()` / `getOriginalCwd()` /
  `setOriginalCwd()`.
- `getStatsStore`, channel allowlist, Claude.md cache, sdk betas.

This is essentially a **process-wide singleton bag**. Our Rust analog is the
`ChatWidgetState` + `auth::Profile` + `models::Models` static-lazy registries —
much more fragmented. Claude Code centralizes intentionally; coupling cost
because every test that touches session ID has to reset state, but reads stay
zero-cost (no DI threading).

### 1.3 `entrypoints/init.ts` — process-level init (370 LOC)

`init = memoize(async () => ...)` (`entrypoints/init.ts:57-238`). Order:
`enableConfigs()` → `applySafeConfigEnvironmentVariables()` →
`applyExtraCACertsFromConfig()` → `setupGracefulShutdown()` → 1P event logging
init → OAuth account info → JetBrains detection → repo detection → remote
managed settings + policy limits promises → mTLS → proxy/HTTP agents →
`preconnectAnthropicApi()` (TCP+TLS warmup) → CCR upstream proxy → Windows
shell setup → cleanup registrations (LSP, swarm teams) → scratchpad dir →
done.

Notable: **single `await` order**, single error catch for `ConfigParseError`
showing an Ink dialog. Memoization via `lodash-es/memoize` ensures multiple
entry paths (REPL, SDK, mcp subcommand) re-use the same init.

### 1.4 `setup.ts` — per-session setup (477 LOC)

`setup(cwd, permissionMode, allowDangerouslySkipPermissions, worktreeEnabled,
worktreeName, tmuxEnabled, customSessionId, worktreePRNumber,
messagingSocketPath)` (`setup.ts:56-477`). Distinct from `init()`: this runs
**after** the user picks a session and CWD. Sequence:

1. Node version gate ≥18 (`setup.ts:70-79`).
2. Custom session ID switch.
3. UDS messaging server start (`setup.ts:95-101`) — `feature('UDS_INBOX')`.
4. iTerm2 / Terminal.app backup restore (`setup.ts:115-157`).
5. `setCwd(cwd)` — must precede everything cwd-dependent (`setup.ts:161`).
6. `captureHooksConfigSnapshot()` — locks settings.json hook config so a
   mid-session edit can't smuggle in a new hook.
7. Worktree creation if `--worktree` (`setup.ts:176-285`).
8. Background jobs: `initSessionMemory`, context-collapse init, version-lock.
9. Plugin prefetch (skipped under `--bare` or sync-install).
10. Apple terminal trust gates, GitHub repo path mapping, telemetry init.

The `feature(...)` calls are `bun:bundle` build-time gates — they tree-shake
strings out of external builds. Critical for the proprietary internal tool
distinction.

### 1.5 `replLauncher.tsx` — REPL bootstrap (22 LOC, ~3.5K bytes)

```typescript
export async function launchRepl(root, appProps, replProps, renderAndRun) {
  const { App } = await import('./components/App.js')
  const { REPL } = await import('./screens/REPL.js')
  await renderAndRun(root, <App {...appProps}><REPL {...replProps} /></App>)
}
```

Pure dynamic-import shell. The actual REPL (`screens/REPL.js`) is enormous and
was deliberately extracted from `main.tsx` for startup-perf reasons (see the
sibling PR comment in `dialogLaunchers.tsx:1-9`). `main.tsx:3134, 3176, 3242,
3338, 3487` call `launchRepl(...)` from different code paths (resume,
direct-connect, SSH, default REPL, teleport).

### 1.6 `interactiveHelpers.tsx` — dialog/setup orchestration (1,300+ LOC)

Holds:

- `showDialog<T>(root, renderer)` — Promise wrapper around Ink rendering
  (`interactiveHelpers.tsx:39-44`).
- `exitWithError`/`exitWithMessage` — render error then unmount (`:52-80`).
- `showSetupDialog<T>` — shorthand wrapping in `<AppStateProvider>` +
  `<KeybindingSetup>` (`:86-92`).
- `renderAndRun` — render, kick off prefetches, wait until exit, graceful
  shutdown (`:98-103`).
- `showSetupScreens(...)` — onboarding wizard, trust dialog, Grove dialog,
  external-CLAUDE.md approval, MCP server approvals (`:104-200+`).

This is the **interactive-mode glue**. Headless / SDK paths (QueryEngine.ask)
skip all of it.

### 1.7 `main.tsx` — the main command (4,683 LOC, 803 KB)

A single megafile. Structure (per grep of imports + offsets):

- `:585` `export async function main()` — body of the default `claude` command.
- `:797-851` parse `-p`/`--print`, `--init-only`, settings flags before
  `init()`.
- `:911-916` `await init()`.
- `:907` `program.hook('preAction', ...)` — Commander.js preAction hook for
  uniform enableConfigs.
- `:968-1011` `program.name('claude').description(...)` — option declarations.
- `:1006-...` main `.action(async (prompt, options) => { ... })` is the giant
  dispatcher: print mode (`-p`), resume, direct-connect, SSH, teleport,
  default REPL, etc.
- `:1925-1935` `setupPromise = setup(...)` paralleled with command/agent
  loading.
- `:2229` `root = await createRoot(ctx.renderOptions)` — Ink root.
- `:3044+` initial state computation.
- `:3134` `await launchRepl(root, appProps, replProps, renderAndRun)` — the
  default branch.

The fact that `main.tsx` is 4,683 lines and is **still being actively
extracted** (see comments: `dialogLaunchers.tsx:1-9`, "Part of the main.tsx
React/JSX extraction effort. See sibling PRs perf/extract-interactive-helpers
and perf/launch-repl") tells us the team treats startup performance as a P0
concern. Every dynamic `import()` is a deliberate latency choice.

---

## 2. Tool System (`Tool.ts` + `tools.ts` + `tools/*`)

### 2.1 `Tool.ts` — the interface (792 LOC)

The `Tool<Input, Output, P>` type (`Tool.ts:362-695`) is a **discriminated
record with ~30 fields**, not a base class. Required:

- `name: string` (`:456`).
- `inputSchema: Input` — Zod schema (`:394`).
- `call(args, context, canUseTool, parentMessage, onProgress?) =>
 Promise<ToolResult<Output>>` (`:379-385`).
- `description(input, options) => Promise<string>` (`:386-393`).
- `prompt(options) => Promise<string>` — system-prompt fragment for the tool
  (`:518-523`).
- `isConcurrencySafe(input)` (`:402`).
- `isEnabled()` (`:403`).
- `isReadOnly(input)` (`:404`).
- `userFacingName(input)` (`:524`).
- `checkPermissions(input, context) => Promise<PermissionResult>` (`:500-503`).
- `toAutoClassifierInput(input)` — input fed to security classifier (`:556`).
- `mapToolResultToToolResultBlockParam(content, toolUseID)` — Anthropic SDK
  shape (`:557-560`).
- `renderToolUseMessage(input, options)` — Ink JSX for the tool call (`:605`).
- `maxResultSizeChars: number` — disk-persistence cutoff (`:466`).

Optional:

- `inputJSONSchema?: ToolInputJSONSchema` — alternate JSON Schema (used for
  MCP tools that don't roundtrip through Zod) (`:397`).
- `outputSchema?: z.ZodType<unknown>` — for the SyntheticOutputTool / MCP
  structured output (`:400`).
- `aliases?: string[]` — for renames (`:371`).
- `searchHint?: string` — for ToolSearchTool keyword match (`:378`).
- `inputsEquivalent?(a, b)` — dedup compare (`:401`).
- `isDestructive?(input)` (`:406`).
- `interruptBehavior?(): 'cancel' | 'block'` — what to do when user submits
  mid-tool-run (`:416`).
- `isSearchOrReadCommand?(input): { isSearch, isRead, isList? }` — UI
  collapsing (`:429-433`).
- `isOpenWorld?`, `requiresUserInteraction?`, `isMcp?`, `isLsp?`,
  `shouldDefer?`, `alwaysLoad?`, `mcpInfo?`, `strict?` (`:434-472`).
- `validateInput?(input, ctx) => Promise<ValidationResult>` (`:489-492`).
- `backfillObservableInput?(input)` — observability patch before hooks
  (`:481`).
- `getPath?(input)`, `getActivityDescription?`, `getToolUseSummary?`,
  `extractSearchText?`, `isResultTruncated?`, `renderToolUseTag?`,
  `renderToolUseProgressMessage?`, `renderToolUseQueuedMessage?`,
  `renderToolUseRejectedMessage?`, `renderToolUseErrorMessage?`,
  `renderGroupedToolUse?`, `renderToolResultMessage?` (`:506-694`).
- `preparePermissionMatcher?(input)` — closure for hook `if` patterns
  (`:514-516`).
- `isTransparentWrapper?()`, `userFacingNameBackgroundColor?` (`:525-533`).

`buildTool(def)` (`Tool.ts:783-792`) fills defaults from `TOOL_DEFAULTS`
(`:757-769`):

- `isEnabled: () => true`
- `isConcurrencySafe: () => false`
- `isReadOnly: () => false`
- `isDestructive: () => false`
- `checkPermissions: () => ({ behavior: 'allow', updatedInput: input })`
- `toAutoClassifierInput: () => ''`
- `userFacingName: () => name`

The `Tools = readonly Tool[]` alias (`:701`) flags every tool-set assembly
site.

**Architectural surprises:**

1. **Tool exposes Ink JSX renderers.** Tools own their UI — there is no
   separation between "tool logic" and "tool view". This is great for cohesion
   but couples logic to the React/Ink tree. Our Rust CLI separates tools from
   TUI render; the cost is duplicated tool-state in the TUI layer.
2. **Tool exposes per-tool permission matcher prep.** `preparePermissionMatcher`
   lets BashTool parse `Bash(git *)` patterns once and return a closure. This
   is a substantial perf optimization for permission rules.
3. **Tool exposes `toAutoClassifierInput`.** Auto-mode security classifier
   sees a _different_ representation of the input than Claude does — `''`
   means "skip this tool in classifier." Subtle and powerful.
4. **`extractSearchText` for transcript indexing.** Tools opt-in to what
   gets searched in scrollback. Drift between rendering and indexing is caught
   by a snapshot test (`renderFidelity.test.tsx`).
5. **`backfillObservableInput`** mutates a _copy_ of input before observers
   see it. The original input flows back to the API to preserve prompt-cache
   byte-for-byte. This is the level of detail Claude Code engineers think at.

### 2.2 `ToolUseContext` — what tools receive (`Tool.ts:158-300`)

Heavyweight: 60+ fields. Highlights:

- `options.commands`, `options.tools`, `options.thinkingConfig`,
  `options.mcpClients`, `options.agentDefinitions`, `options.maxBudgetUsd`,
  `options.customSystemPrompt`, `options.appendSystemPrompt`,
  `options.querySource`, `options.refreshTools()`.
- `abortController: AbortController` — _the_ cancellation signal threaded
  everywhere.
- `readFileState: FileStateCache` — LRU of read files (used to detect
  external mtime changes).
- `getAppState() / setAppState(f)` — Zustand-style store accessor.
- `setAppStateForTasks?` — root store handle for background tasks (won't be
  no-op'd in subagents).
- `handleElicitation?` — MCP `-32042` URL elicitation prompt.
- `setToolJSX?`, `addNotification?`, `appendSystemMessage?` — interactive
  affordances; absent in headless.
- `nestedMemoryAttachmentTriggers`, `loadedNestedMemoryPaths`,
  `dynamicSkillDirTriggers`, `discoveredSkillNames` — turn-scoped sets used
  to dedup memory/skill attachments.
- `agentId`, `agentType` — set only for subagents (`AgentTool`).
- `requireCanUseTool` — speculation force-flag.
- `messages: Message[]` — current message array (mutated cross-iteration).
- `fileReadingLimits`, `globLimits`.
- `toolDecisions?: Map` — accept/reject decision history.
- `queryTracking?` — chainId + depth, for analytics.
- `requestPrompt?` — interactive `<AskUserQuestionTool>` callback.
- `contentReplacementState?` — per-thread tool-result budget state.
- `renderedSystemPrompt?` — frozen system prompt for fork/cache stability.

This is a **kitchen-sink struct** — but it consolidates everything tools need
behind one type, so adding a new field doesn't require changing hundreds of
call sites. Our Rust analog should think hard about this trade-off.

### 2.3 `tools.ts` — the registry (389 LOC)

`getAllBaseTools()` (`tools.ts:193-251`) returns a **single inline array** with
~50 tools:

```typescript
return [
  AgentTool,
  TaskOutputTool,
  BashTool,
  ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
  ExitPlanModeV2Tool,
  FileReadTool,
  FileEditTool,
  FileWriteTool,
  NotebookEditTool,
  WebFetchTool,
  TodoWriteTool,
  WebSearchTool,
  TaskStopTool,
  AskUserQuestionTool,
  SkillTool,
  EnterPlanModeTool,
  ...(process.env.USER_TYPE === 'ant' ? [ConfigTool] : []),
  ...(process.env.USER_TYPE === 'ant' ? [TungstenTool] : []),
  ...(SuggestBackgroundPRTool ? [SuggestBackgroundPRTool] : []),
  ...(WebBrowserTool ? [WebBrowserTool] : []),
  ...(isTodoV2Enabled() ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool] : []),
  // ... feature-flag-gated additions ...
];
```

Conditional inclusion via `process.env.USER_TYPE === 'ant'`, `feature('...')`
(bun:bundle build-time), `isTodoV2Enabled()` (statsig). The pattern:
**spread-with-truthy-guard `...(cond ? [Tool] : [])`** — tree-shakable, simple.

`getTools(permissionContext)` (`:271-327`): applies `CLAUDE_CODE_SIMPLE` mode
(only Bash/Read/Edit), filter by deny rules, hide REPL_ONLY_TOOLS when REPL
is enabled, then `tool.isEnabled()` filter.

`assembleToolPool(permissionContext, mcpTools)` (`:345-367`): merges built-in

- MCP tools, dedup by name (built-ins win), **sorts each partition
  separately** for prompt-cache stability (built-ins as a contiguous prefix,
  MCP after — server's cache breakpoint is after the last built-in).

`filterToolsByDenyRules` (`:262-269`): filters tools based on
`alwaysDenyRules` matching tool name with no `ruleContent` (blanket deny).
MCP server-prefix rules like `mcp__server` strip all that server's tools at
prompt-build time, not just at call time.

**Architectural surprise:** tools.ts is **NOT a Map or class** — it's a flat
array. The lookup is `tools.find(t => toolMatchesName(t, name))`. With ~50
tools that's negligible. Concept simplicity wins over Map perf.

### 2.4 Built-in vs custom (MCP) boundary

The boundary is invisible at the `Tool` interface level — MCP tools satisfy
the same `Tool` shape. The signal is `isMcp?: boolean` and `mcpInfo?: { serverName, toolName }`.
MCP tools are constructed once per MCP server connection in
`services/mcp/client.ts`. They flow into `appState.mcp.tools` and are
re-injected on each query iteration via `assembleToolPool` /
`refreshTools()`.

### 2.5 Schemas — Zod throughout

Every built-in tool uses Zod (`zod/v4`) — `Tool.ts:10` confirms.
`AnyObject = z.ZodType<{[key: string]: unknown}>` is the schema constraint
(`:343`). MCP tools (which receive JSON Schema from the wire) skip Zod and use
`inputJSONSchema?: ToolInputJSONSchema` directly (`:396-397`).

### 2.6 Permission integration

Tools have a `checkPermissions` method (`Tool.ts:500-503`) that returns a
`PermissionResult` (allow / deny / ask). The general permission system in
`utils/permissions/permissions.ts` runs first; if it doesn't decide, the tool's
own logic runs. **`canUseTool` is threaded down through `ToolUseContext` and
called by `runTools` for each tool call** before execution.

---

## 3. Task System (`Task.ts` + `tasks.ts` + `tasks/*`)

### 3.1 `Task.ts` — the task data model (125 LOC)

`TaskType` (`Task.ts:6-13`):

```typescript
type TaskType =
  | 'local_bash' // background bash via `claude ps`
  | 'local_agent' // subagent (AgentTool)
  | 'remote_agent' // Dispatch
  | 'in_process_teammate' // swarm
  | 'local_workflow' // WorkflowTool
  | 'monitor_mcp' // MonitorTool
  | 'dream'; // SleepTool
```

`TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'`
(`Task.ts:15-20`). `isTerminalTaskStatus` predicate at `:27-29`.

`Task` interface (`Task.ts:72-76`):

```typescript
type Task = {
  name: string;
  type: TaskType;
  kill(taskId: string, setAppState: SetAppState): Promise<void>;
};
```

That's it — **only `kill` is polymorphic**. The comment at `:70-71` is
explicit:

> What getTaskByType dispatches for: kill. spawn/render were never called
> polymorphically (removed in #22546). All six kill implementations use only
> setAppState — getAppState/abortController were dead weight.

`TaskStateBase` (`Task.ts:45-57`): `id`, `type`, `status`, `description`,
`toolUseId`, `startTime`, `endTime`, `totalPausedMs`, `outputFile`,
`outputOffset`, `notified`. Each task type extends with its own fields in
`tasks/{Type}/types.ts` (e.g. `LocalShellTask` adds `command`, `pid`).

`generateTaskId(type)` (`Task.ts:98-106`): random 8-char base36 ID with a
type-prefix letter (b/a/r/t/w/m/d). 36^8 ≈ 2.8 trillion — defends against
brute-force symlink attacks on `outputFile`.

### 3.2 `tasks.ts` — registry (39 LOC)

`getAllTasks()` returns `[LocalShellTask, LocalAgentTask, RemoteAgentTask,
DreamTask, ...feature('WORKFLOW_SCRIPTS') ? [LocalWorkflowTask] : [],
...feature('MONITOR_TOOL') ? [MonitorMcpTask] : []]`. `getTaskByType(type)`
finds by `type` field. Mirrors `tools.ts` pattern exactly.

### 3.3 `tasks/` directory

Each task type has its own dir with `<Type>Task.tsx` (or `.ts`). Sizes (from
`ls -la`):

- `LocalShellTask.tsx` — **66,306 bytes** (~2,000 LOC). Background bash
  process via UDS messaging. Plus `guards.ts`, `killShellTasks.ts`.
- `LocalAgentTask.tsx` — **82,910 bytes** (~2,500 LOC). Subagent =
  recursively running `query()` with a different system prompt + tool subset.
- `RemoteAgentTask.tsx` — **126,389 bytes** (~3,800 LOC). Anthropic Dispatch.
  The largest of the four.
- `LocalMainSessionTask.ts` — **15,136 bytes**. Top-level user session
  (record-keeping wrapper).
- `InProcessTeammateTask.tsx` — **16,381 bytes** + `types.ts`. Swarm
  in-process teammates.
- `DreamTask.ts` — 4,988 bytes. Sleep/proactive.
- `pillLabel.ts`, `stopTask.ts`, `types.ts`.

**Subtask / child-task model:** Subagents are spawned via `AgentTool` which
internally creates a `LocalAgentTask` and calls `query()` recursively with a
new `ToolUseContext` (containing `agentId` from `createSubagentContext`).
Subagent results bubble back via `attachment` messages to the parent's
queryLoop.

### 3.4 Task ops

There is no central `tasks.ts` for `spawn/run/abort/persist`. Each
TaskType embeds its own spawn (called from a tool — `AgentTool.call()` for
agents, `BashTool.call()` for shell-with-`run_in_background:true`). Lifecycle
state lives in `appState.tasks` (a Map keyed by task ID). Persistence: each
task writes to `outputFile` (an append-only log on disk, located at
`getTaskOutputPath(id)`). The TUI's `claude ps` reads `~/.claude/sessions/`
for live-task discovery.

Stop: `stopTask.ts` is the cross-type stop entry (handles "stop signal" path
for `TaskStopTool`).

---

## 4. Query Engine (the core) — `QueryEngine.ts` + `query.ts`

This is the heart of the agent. **Read this section carefully.**

### 4.1 `QueryEngine.ts` — session wrapper (1,295 LOC)

`QueryEngineConfig` (`QueryEngine.ts:130-173`): immutable inputs to a
conversation. `cwd`, `tools`, `commands`, `mcpClients`, `agents`,
`canUseTool`, app-state get/set, `initialMessages?`, `readFileCache`,
`customSystemPrompt?`, `appendSystemPrompt?`, `userSpecifiedModel?`,
`fallbackModel?`, `thinkingConfig?`, `maxTurns?`, `maxBudgetUsd?`,
`taskBudget?`, `jsonSchema?`, `verbose?`, `replayUserMessages?`,
`handleElicitation?`, `includePartialMessages?`, `setSDKStatus?`,
`abortController?`, `orphanedPermission?`, `snipReplay?`.

`class QueryEngine` (`:184-1177`):

Fields (private):

- `config: QueryEngineConfig`
- `mutableMessages: Message[]` — **the conversation history**, mutated
  across turns
- `abortController: AbortController`
- `permissionDenials: SDKPermissionDenial[]`
- `totalUsage: NonNullableUsage` — accumulated token usage
- `hasHandledOrphanedPermission = false`
- `readFileState: FileStateCache`
- `discoveredSkillNames = new Set<string>()` — turn-scoped, cleared per turn
- `loadedNestedMemoryPaths = new Set<string>()`

Methods:

- `submitMessage(prompt, options?)` (`:209-1156`) — the public entry point.
  Returns `AsyncGenerator<SDKMessage>`. **A single call = a full agentic
  turn** (potentially many model iterations until `needsFollowUp = false`).
- `interrupt()` (`:1158-1160`) — `abortController.abort()`.
- `getMessages()`, `getReadFileState()`, `getSessionId()`, `setModel(model)`.

`ask({...})` (`:1186-1295`) — one-shot wrapper that constructs a QueryEngine,
calls `submitMessage`, returns the generator.

### 4.2 `submitMessage` flow (≈950 LOC)

In order (line numbers from `QueryEngine.ts`):

1. Destructure config, clear `discoveredSkillNames`, `setCwd(cwd)`,
   `persistSession` flag (`:213-242`).
2. **Wrap `canUseTool`** to intercept denials and append to
   `permissionDenials[]` (`:244-271`).
3. `initialMainLoopModel = userSpecifiedModel ? parseUserSpecifiedModel(...)
: getMainLoopModel()` (`:274-276`).
4. Resolve `thinkingConfig` (`:278-282`).
5. **`fetchSystemPromptParts({ tools, mainLoopModel, ... })`** (`:288-300`)
   → `{ defaultSystemPrompt, userContext, systemContext }`. This fetches +
   composes everything.
6. Inject memory-mechanics prompt if custom-system-prompt + auto-mem override
   (`:316-319`).
7. **Compose final system prompt** (`:321-325`): `customPrompt ?? default`,
   then `memoryMechanicsPrompt`, then `appendSystemPrompt`. `asSystemPrompt`
   typebrand.
8. Register structured-output enforcement hook if `jsonSchema` +
   `SyntheticOutputTool` present (`:328-333`).
9. **Build `processUserInputContext: ProcessUserInputContext`**
   (`:335-395`): contains messages, setMessages, options, abortController,
   readFileState, all the dedup sets, file-history/attribution updaters.
10. Handle orphaned permission (only once per engine lifetime) (`:398-408`).
11. **`processUserInput({ input, mode: 'prompt', context, messages, uuid,
isMeta, querySource: 'sdk' })`** (`:410-428`) → expands slash commands,
    parses image/file attachments, runs pre-prompt hooks. Returns
    `{ messages, shouldQuery, allowedTools, model, resultText }`.
12. Push user messages, persist transcript (`:431-463`).
13. Update `toolPermissionContext.alwaysAllowRules.command` from
    `allowedTools` (`:477-486`).
14. Recreate `processUserInputContext` post-slash-command (model may have
    changed) (`:492-527`).
15. Load skills + plugins (cache-only) (`:534-538`).
16. **`yield buildSystemInitMessage({ tools, mcpClients, model,
permissionMode, commands, agents, skills, plugins, fastMode })`** —
    first SDK message (`:540-551`).
17. If `!shouldQuery` (slash command produced its own output), yield the
    output messages, persist, yield `result` with `subtype: 'success'`,
    return (`:556-639`).
18. File-history snapshot before query (`:641-655`).
19. Init turn counters: `currentMessageUsage = EMPTY_USAGE`, `turnCount = 1`,
    `lastStopReason = null`, `errorLogWatermark`, `initialStructuredOutputCalls`
    (`:658-673`).
20. **Main loop:** `for await (const message of query({...}))` (`:675-1049`).
    - Push to `messages` and `mutableMessages` based on type.
    - Persist transcript (fire-and-forget for assistant; await for others).
    - On stream events: update `currentMessageUsage`, capture
      `lastStopReason`, accumulate to `totalUsage` on `message_stop`.
    - On `attachment.max_turns_reached`: yield `result` with
      `subtype: 'error_max_turns'`, return.
    - On `system.compact_boundary`: splice `mutableMessages` and `messages`
      to drop pre-boundary entries (release for GC).
    - On `system.api_error`: yield `system.api_retry` SDK event with retry
      metadata.
    - Per-message: check `getTotalCost() >= maxBudgetUsd` →
      `error_max_budget_usd`.
    - On user message + jsonSchema: count
      `SYNTHETIC_OUTPUT_TOOL_NAME` calls; if exceeded →
      `error_max_structured_output_retries`.
21. After loop ends, find the last assistant/user message (`:1058-1060`).
22. **`isResultSuccessful(result, lastStopReason)`** check
    (`:1082-1118`) — if not successful, yield `result` with
    `subtype: 'error_during_execution'` + `[ede_diagnostic] ...` errors.
23. Else yield `result` with `subtype: 'success'`,
    `result: textResult ?? ''`, all usage/cost fields, `structured_output`
    (`:1135-1155`).

### 4.3 `query.ts` — the agentic loop (1,729 LOC)

`query(params)` is a thin wrapper that delegates to `queryLoop` and post-runs
`notifyCommandLifecycle('completed')` for any consumed queue entries
(`query.ts:219-239`).

**`queryLoop`** (`:241-1729`) is the agent. State machine pattern:
`State` (`:204-217`):

```typescript
type State = {
  messages: Message[];
  toolUseContext: ToolUseContext;
  autoCompactTracking: AutoCompactTrackingState | undefined;
  maxOutputTokensRecoveryCount: number;
  hasAttemptedReactiveCompact: boolean;
  maxOutputTokensOverride: number | undefined;
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined;
  stopHookActive: boolean | undefined;
  turnCount: number;
  transition: Continue | undefined;
};
```

Each iteration:

#### A. Per-iteration setup (`:307-355`)

- Destructure `state` at top (`:308-322`).
- Skill-discovery prefetch starts (`:331-335`).
- Yield `{ type: 'stream_request_start' }` (`:337`).
- Update `queryTracking` — chainId + depth (`:347-355`).

#### B. Pre-API context prep (`:365-548`)

- **Compact-boundary trim** — `getMessagesAfterCompactBoundary(messages)`
  (`:365`).
- **Tool-result budget** — `applyToolResultBudget` enforces aggregate cap on
  tool result sizes (`:379-394`); persists records for resumeable querySources.
- **Snip compaction** — `snipModule!.snipCompactIfNeeded(messagesForQuery)`
  if `feature('HISTORY_SNIP')` (`:401-410`).
- **Microcompact** — `deps.microcompact(...)` (`:414-426`). Cached
  microcompact defers boundary message until after API response so it can
  use actual cache_deleted_input_tokens.
- **Context collapse** — `contextCollapse.applyCollapsesIfNeeded(...)`
  (`:440-447`). Read-time projection of full history; turns full message
  arrays into summaries when needed.
- **Compose `fullSystemPrompt = appendSystemContext(systemPrompt,
systemContext)`** (`:449-451`).
- **Auto-compact** — `deps.autocompact(...)` (`:454-543`). If it fires,
  `messagesForQuery = postCompactMessages` and tracking is updated.
- Update `toolUseContext.messages = messagesForQuery` (`:546-549`).

#### C. Pre-API streaming-tool-executor + model selection (`:551-580`)

- Init `assistantMessages: []`, `toolResults: []`, `toolUseBlocks: []`,
  `needsFollowUp = false`.
- Create `streamingToolExecutor` if statsig gate
  `tengu_streaming_tool_execution2` is on.
- `currentModel = getRuntimeMainLoopModel({ permissionMode, mainLoopModel,
exceeds200kTokens: planMode && doesMostRecentAssistantMessageExceed200k })`
  (`:572-578`).

#### D. Hard blocking-limit check (`:592-648`)

If not in compact and not handled by reactive-compact / context-collapse /
session_memory, calculate token warning state, and if at blocking limit yield
synthetic `PROMPT_TOO_LONG_ERROR_MESSAGE` and return `{ reason: 'blocking_limit' }`.

#### E. The model-call loop (`:650-954`)

```
let attemptWithFallback = true
while (attemptWithFallback) {
  attemptWithFallback = false
  try {
    for await (const message of deps.callModel({
      messages: prependUserContext(messagesForQuery, userContext),
      systemPrompt: fullSystemPrompt,
      thinkingConfig,
      tools,
      signal: abortController.signal,
      options: {
        getToolPermissionContext: async () => appState.toolPermissionContext,
        model: currentModel,
        fastMode,
        toolChoice: undefined,
        isNonInteractiveSession,
        fallbackModel,
        onStreamingFallback: () => { streamingFallbackOccured = true },
        querySource,
        agents,
        allowedAgentTypes,
        hasAppendSystemPrompt,
        maxOutputTokensOverride,
        fetchOverride: dumpPromptsFetch,
        mcpTools,
        hasPendingMcpServers,
        queryTracking,
        effortValue, advisorModel, skipCacheWrite,
        agentId, addNotification,
        taskBudget: { total, remaining: taskBudgetRemaining }
      }
    })) {
      // streaming-fallback: discard partial messages (tombstone), reset
      if (streamingFallbackOccured) { ...orphan tombstones, reset state... }

      // backfillObservableInput on a clone before yield
      // ...

      // Withhold recoverable errors (PTL, max_output_tokens, media-size)
      let withheld = false
      if (collapse.isWithheldPromptTooLong(message)) withheld = true
      if (reactiveCompact.isWithheldPromptTooLong(message)) withheld = true
      if (mediaRecoveryEnabled && reactiveCompact.isWithheldMediaSizeError(message)) withheld = true
      if (isWithheldMaxOutputTokens(message)) withheld = true

      if (!withheld) yield yieldMessage

      if (message.type === 'assistant') {
        assistantMessages.push(message)
        const msgToolUseBlocks = message.message.content.filter(c => c.type === 'tool_use')
        if (msgToolUseBlocks.length > 0) {
          toolUseBlocks.push(...msgToolUseBlocks)
          needsFollowUp = true
        }
        // Streaming tool executor: schedule each tool_use as soon as it arrives
        if (streamingToolExecutor && !aborted) {
          for (const toolBlock of msgToolUseBlocks) streamingToolExecutor.addTool(toolBlock, message)
        }
      }

      // Drain any completed streaming-tool results
      if (streamingToolExecutor && !aborted) {
        for (const result of streamingToolExecutor.getCompletedResults()) {
          if (result.message) {
            yield result.message
            toolResults.push(...normalizeMessagesForAPI([result.message], tools).filter(_ => _.type === 'user'))
          }
        }
      }
    }
    // Yield deferred microcompact boundary using actual cache_deleted_input_tokens
  } catch (innerError) {
    if (innerError instanceof FallbackTriggeredError && fallbackModel) {
      currentModel = fallbackModel
      attemptWithFallback = true
      // tombstone orphans, reset state, strip signature blocks (ant), retry
      continue
    }
    throw innerError
  }
}
```

This is the **streaming protocol**:

- Stream `message_start` → text deltas → tool_use_start → tool_use_input
  deltas → tool_use_stop → text/thinking blocks → message_delta (carries
  stop_reason) → message_stop. Each becomes a `Message | StreamEvent`.
- The query loop _yields_ these to consumers (QueryEngine or REPL hooks).
- **Tool execution can happen DURING streaming** if the streaming tool
  executor is enabled (statsig gate). Otherwise tools run after stream completes.

#### F. Outer error handling (`:955-997`)

Catches model/runtime errors that escaped:

- ImageSizeError / ImageResizeError → yield error message, return
  `{ reason: 'image_error' }`.
- Other errors → yield missing tool_result blocks with the error,
  yield API error message, return `{ reason: 'model_error', error }`.

#### G. Post-sampling hooks (`:999-1009`)

`executePostSamplingHooks(...)` — fire-and-forget user-defined hooks after
the model response.

#### H. Abort handling (`:1011-1052`)

If `abortController.signal.aborted`:

- Drain `streamingToolExecutor.getRemainingResults()` (synthetic
  tool_results for queued tools) OR yield `yieldMissingToolResultBlocks`.
- Computer-use cleanup (`feature('CHICAGO_MCP')`).
- Yield `createUserInterruptionMessage({ toolUse: false })` (unless reason ===
  'interrupt').
- Return `{ reason: 'aborted_streaming' }`.

#### I. The "no follow-up" branch — agent-loop terminator (`:1062-1358`)

If `!needsFollowUp` (no tool calls in this assistant turn), this is where the
agent **decides whether to stop**:

1. **Withheld 413 (prompt too long)**: try collapse drain
   (`contextCollapse.recoverFromOverflow`), then reactive compact
   (`reactiveCompact.tryReactiveCompact`). On success: replace messages,
   continue loop. On failure: yield error, return `{ reason: 'prompt_too_long' }`.
2. **Withheld media-size**: same recovery path, return `{ reason: 'image_error' }`.
3. **Withheld max_output_tokens**: escalate from 8k to 64k cap; if still
   exceeded, inject a recovery user message ("Resume directly — no apology")
   up to `MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3`; then surface the error.
4. **API errors that aren't recoverable**: skip stop hooks (avoid death
   spiral) → return `{ reason: 'completed' }`.
5. **`yield* handleStopHooks(...)`** (`query/stopHooks.ts` — 17,290 LOC). Stop
   hooks can:
   - Inject blocking errors → continue loop with new state.
   - Prevent continuation → return `{ reason: 'stop_hook_prevented' }`.
6. **Token-budget continuation** (`feature('TOKEN_BUDGET')`): if turn has
   used <90% of budget and isn't diminishing, inject a nudge message
   ("Continue your work...") and continue. Else stop.
7. Return `{ reason: 'completed' }`.

#### J. The "follow-up needed" branch — tool-execution + recurse (`:1360-1727`)

1. **Run tools**:
   - `streamingToolExecutor.getRemainingResults()` if streaming, OR
   - `runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)`
     from `services/tools/toolOrchestration.js` (`:1380-1408`).
   - Each result is yielded; user-message tool_results are pushed to
     `toolResults`.
   - Hook stop signal: `update.message.attachment.type ===
'hook_stopped_continuation'` → `shouldPreventContinuation = true`.
2. **Tool-use summary** for mobile UI: kicks off `generateToolUseSummary` via
   Haiku in parallel; promise passed to next iteration to be yielded next
   turn (`:1411-1482`).
3. **Abort during tools**: same cleanup pattern as above, `:1485-1516`.
4. **Hook prevent-continuation**: return `{ reason: 'hook_stopped' }` (`:1518-1521`).
5. **Increment auto-compact tracking turn counter** (`:1523-1533`).
6. **Drain pending notifications + queued commands** from message-queue
   manager (`:1565-1590`). Slash commands stay queued for post-turn.
7. **Memory prefetch consume** if settled (`:1599-1614`).
8. **Skill-discovery prefetch inject** (`:1620-1628`).
9. **Notify lifecycle for consumed queue entries** (`:1632-1643`).
10. **Refresh tools** between turns (newly-connected MCP servers)
    (`:1660-1671`).
11. **Max-turns check** (`:1705-1712`): if `nextTurnCount > maxTurns`, yield
    `max_turns_reached` attachment and return `{ reason: 'max_turns' }`.
12. **Build `next: State`** with `messages = [...messagesForQuery,
...assistantMessages, ...toolResults]`, `turnCount: nextTurnCount`,
    `transition: { reason: 'next_turn' }`, **continue loop** (`:1715-1727`).

### 4.4 Stop conditions inventory

The `Terminal` return type (defined in `query/transitions.ts`, not read but
referenced) covers:

- `{ reason: 'completed' }` — natural end (no tool calls or stop_reason).
- `{ reason: 'stop_hook_prevented' }` — user hook said stop.
- `{ reason: 'hook_stopped' }` — pre-tool-use hook said stop.
- `{ reason: 'max_turns', turnCount }` — hit `maxTurns` limit.
- `{ reason: 'aborted_streaming' }` — user interrupted during stream.
- `{ reason: 'aborted_tools' }` — user interrupted during tool exec.
- `{ reason: 'blocking_limit' }` — hard token block.
- `{ reason: 'prompt_too_long' }` — could not recover from 413.
- `{ reason: 'image_error' }` — image validation failure.
- `{ reason: 'model_error', error }` — API/runtime exception.

### 4.5 Retry semantics

There are **three retry layers**:

1. **Streaming fallback** — inside `services/api/withRetry.ts` (referenced
   via `FallbackTriggeredError` at `query.ts:7, 894`). When the primary
   model is overloaded, claude.js throws this error; queryLoop catches it,
   tombstones partial messages, switches `currentModel = fallbackModel`,
   retries the **same iteration**.

2. **Auto-compact / reactive-compact / context-collapse** — context-recovery
   loops (described above). These don't retry the _same_ call; they edit
   history and continue.

3. **Max-output-tokens recovery** — escalate cap to 64k, then inject
   continuation user message up to 3 times (`MAX_OUTPUT_TOKENS_RECOVERY_LIMIT
= 3` at `query.ts:164`).

The Anthropic SDK itself has its own HTTP-level retries inside
`@anthropic-ai/sdk` — query.ts trusts those and only handles
application-level retries.

### 4.6 Provider abstraction — there is **none**

`deps.callModel = queryModelWithStreaming` from
`services/api/claude.js` (`query/deps.ts:23, 35`). Hardcoded to Anthropic.
The flexibility comes from:

- `currentModel: string` — which Anthropic model to use.
- `fallbackModel: string` — which to switch to on overload.
- Bedrock/Vertex are handled INSIDE `claude.js` based on env vars.

This is the single biggest architectural delta from our `apps/cli/`. \*\*We
have a real provider trait (`apps/cli/src/provider.rs`) and 12 named providers

- Custom in `apps/cli/src/models.rs`.\*\* Claude Code does not — its competitive
  floor is "best agentic loop on Anthropic", not "any provider". Their design
  cost is ~zero everywhere; ours is mid-stream provider switching, schema
  normalization, etc.

### 4.7 System prompt construction

Composed by `fetchSystemPromptParts` (in `utils/queryContext.js`, not
in scope) into three pieces:

- `defaultSystemPrompt: string[]` — array of sections (split for prompt
  caching).
- `userContext: { [k: string]: string }` — Claude.md, current date,
  coordinator user context.
- `systemContext: { [k: string]: string }` — git status, cache breaker.

Then `QueryEngine` composes:

```typescript
systemPrompt = asSystemPrompt([
  ...(customPrompt !== undefined ? [customPrompt] : defaultSystemPrompt),
  ...(memoryMechanicsPrompt ? [memoryMechanicsPrompt] : []),
  ...(appendSystemPrompt ? [appendSystemPrompt] : []),
]);
```

Then `query.ts:449-451`:

```typescript
const fullSystemPrompt = asSystemPrompt(appendSystemContext(systemPrompt, systemContext));
```

`prependUserContext(messages, userContext)` (`query.ts:660`) — `userContext`
goes into the _first user message_ as a prefix, NOT into the system prompt.
That's how Claude.md and the current date are surfaced to the model.

### 4.8 Streaming events emitted

From `query.ts` and `claude.ts`:

- `stream_request_start` — fired once per iteration.
- `stream_event` (with sub-types `message_start`, `message_delta`,
  `message_stop`, `content_block_start`, `content_block_delta`,
  `content_block_stop`).
- `assistant` Message — full assistant response with content blocks.
- `user` Message — user-side tool results, interruptions, queued commands.
- `progress` Message — tool progress updates (per-tool format).
- `attachment` Message — for max_turns_reached, structured_output,
  edited_text_file, queued_command, hook_stopped_continuation.
- `system` Message — compact_boundary, api_error, snip_boundary,
  microcompact_boundary, local_command output.
- `tombstone` Message — control signal to remove a previously-yielded message
  (used after streaming-fallback).
- `tool_use_summary` — Haiku-generated tool batch summary for mobile UI.

---

## 5. Context & History

### 5.1 `context.ts` — system + user context (189 LOC)

Two memoized async getters:

`getSystemContext()` (`context.ts:116-150`):

- `gitStatus` (skipped under CLAUDE_CODE_REMOTE or settings).
- `cacheBreaker: '[CACHE_BREAKER: ...]'` (ant-only debug feature).

`getUserContext()` (`:155-189`):

- `claudeMd` — concatenated Claude.md files (recursive walk).
- `currentDate: 'Today\'s date is YYYY-MM-DD.'`.

Both are `memoize`d for the duration of a conversation. Cleared by
`setSystemPromptInjection(value)` (cache-breaking).

`getGitStatus()` (`:36-111`) runs in parallel: `getBranch`, `getDefaultBranch`,
`git status --short`, `git log --oneline -n 5`, `git config user.name`. All
truncated to 2k chars.

### 5.2 `context/` directory — React contexts (10 files)

These are **runtime React contexts**, not message context:

- `notifications.tsx` (33k) — toast/OS notification system.
- `stats.tsx` (22k) — performance metrics store.
- `overlayContext.tsx` (14k) — modal/popup overlay manager.
- `promptOverlayContext.tsx` (12k) — slash-command popover.
- `mailbox.tsx` (3.4k) — UDS messaging queue UI.
- `modalContext.tsx` (6.2k) — full-screen modal manager.
- `QueuedMessageContext.tsx` (5.6k) — queued user messages display.
- `voice.tsx` (8.7k) — voice-input mode.
- `fpsMetrics.tsx` (3.1k) — FPS tracker.

These are React-Ink-only — headless/SDK never touches them.

### 5.3 `history.ts` — prompt history (464 LOC)

This is **shell-style up-arrow history**, not conversation history.
`history.jsonl` lives in `~/.claude/`, append-only, lockfile-protected.
Key functions:

- `addToHistory(command)` (`:411-434`) — append entry, fire-and-forget flush.
- `getHistory()` (`:190-217`) — async generator yielding most recent 100
  entries from current project, current-session-first then other-sessions.
- `getTimestampedHistory()` (`:162-180`) — for ctrl+r picker; deduped by
  display text.
- `removeLastFromHistory()` (`:453-464`) — undo for auto-restore-on-interrupt.
- `expandPastedTextRefs(input, pastedContents)` — replace `[Pasted text #N]`
  placeholders with actual content.

Pasted content >1024 chars is content-hashed and stored in the paste-store
(separate from history.jsonl).

**Conversation history is separate** — it lives in `mutableMessages` (in
QueryEngine) and is persisted via `recordTranscript` (in `utils/sessionStorage`).

---

## 6. Cost Tracking

### 6.1 `cost-tracker.ts` (323 LOC)

Re-exports getters from `bootstrap/state.js` (`:49-69`).

`addToTotalSessionCost(cost, usage, model)` (`:278-322`):

1. Update per-model usage map.
2. Add to global cost state.
3. Increment OpenTelemetry counters: `getCostCounter().add(cost, attrs)`,
   `getTokenCounter().add(input/output/cacheRead/cacheCreation, attrs)`.
4. **Recursively process advisor usage** (`getAdvisorUsage(usage)`) — server-side
   advisor tool charges separately, billed to its own model.

`formatTotalCost()` (`:228-244`): chalk.dim multi-line output:

```
Total cost:            $X.XX
Total duration (API):  Xms
Total duration (wall): Xms
Total code changes:    X lines added, Y lines removed
Usage by model:
  claude-opus-4-7:  X input, Y output, Z cache read, W cache write ($A.AB)
```

`saveCurrentSessionCosts(fpsMetrics?)` (`:143-175`): persist to
`projectConfig.lastCost`, `lastAPIDuration`, `lastModelUsage`, etc. so
`--resume` can restore.

`restoreCostStateForSession(sessionId)` (`:130-137`): only restores if the
saved sessionId matches.

### 6.2 `costHook.ts` (22 LOC)

```typescript
export function useCostSummary(getFpsMetrics?: () => FpsMetrics | undefined): void {
  useEffect(() => {
    const f = () => {
      if (hasConsoleBillingAccess()) {
        process.stdout.write('\n' + formatTotalCost() + '\n');
      }
      saveCurrentSessionCosts(getFpsMetrics?.());
    };
    process.on('exit', f);
    return () => process.off('exit', f);
  }, []);
}
```

Tiny hook for the REPL `<App>` to print final cost on exit.

### 6.3 Per-message vs per-tool cost

Cost is tracked **per model**, not per tool. Tool cost is bundled into the
assistant message that called the tool (the input tokens for the tool_result

- the output tokens for the next assistant turn). Tool _duration_ is tracked
  separately via `getTotalToolDuration` / `addToToolDuration`. There is no
  "this tool cost X" surfacing.

---

## 7. Dialog Launchers (`dialogLaunchers.tsx`, 132 LOC)

Pattern: each launcher dynamically imports its component and wires the
`done` callback. Site comments map to the `main.tsx` line where the original
inline call was. The seven launchers:

1. `launchSnapshotUpdateDialog` (`:29-38`) — agent memory snapshot
   merge/keep/replace.
2. `launchInvalidSettingsDialog` (`:44-52`) — settings.json validation
   errors.
3. `launchAssistantSessionChooser` (`:58-65`) — pick a bridge session.
4. `launchAssistantInstallWizard` (`:73-85`) — `claude assistant` first-run
   wizard (NewInstallWizard).
5. `launchTeleportResumeWrapper` (`:91-96`) — interactive teleport session
   picker.
6. `launchTeleportRepoMismatchDialog` (`:102-110`) — pick local checkout of
   target repo.
7. `launchResumeChooser` (`:117-132`) — `--resume` interactive picker
   (special: uses `renderAndRun`, not `showSetupDialog`).

What dialogs Claude Code surfaces (these + onboarding + trust + Grove + MCP
approvals + ClaudeMd-external-includes from `interactiveHelpers.tsx`):

- Onboarding wizard (theme, hasCompletedOnboarding).
- TrustDialog (workspace trust; CLAUDE.md external includes).
- GroveDialog (subscription onboarding for ant users).
- McpJsonServerApprovals (project-level MCP server approval).
- SnapshotUpdateDialog (agent-memory).
- InvalidSettingsDialog.
- AssistantSessionChooser / AssistantInstallWizard.
- TeleportResumeWrapper / TeleportRepoMismatchDialog.
- ResumeConversation (session picker).

There is no "model picker" dialog (it's a slash command + completion).
No "login" dialog (it's a separate `claude /login` slash command).
No "permission prompt" dialog (it's an in-line Ink prompt rendered by the
tool's `renderToolUseMessage` flow + `canUseTool`'s `requestPrompt`
callback).

---

## 8. Cross-References — the Call Graph

```
process entry: cli.tsx:300 `void main()`
  → main(): fast-path subcommands OR full CLI
    → import('../main.js').main()
      → init() [entrypoints/init.ts]  // process-level setup, memoized
      → applySafeConfigEnvironmentVariables()
      → program.parseAsync(argv)  // commander.js
        → action handler in main.tsx (~line 1006)
          → setup(cwd, ...) [setup.ts]  // session-level setup
          → root = createRoot(renderOptions)
          → For each branch:
            print mode (-p): runPrintMode → ask({...}) → QueryEngine.submitMessage()
            REPL: launchRepl(root, appProps, replProps, renderAndRun)
              → import('./components/App.js').App + import('./screens/REPL.js').REPL
              → renderAndRun(root, <App><REPL/></App>)
                → root.render(...); startDeferredPrefetches(); waitUntilExit; gracefulShutdown
                → REPL component renders chat UI, on-submit calls QueryEngine.submitMessage()
                  → submitMessage(prompt) AsyncGenerator<SDKMessage>
                    → fetchSystemPromptParts(...)  [utils/queryContext]
                    → processUserInput(...)  [utils/processUserInput]
                    → query({messages, systemPrompt, userContext, systemContext, canUseTool, toolUseContext, ...})  [query.ts]
                      → queryLoop:
                        while (true):
                          # context prep
                          applyToolResultBudget; snipCompact; microcompact; contextCollapse; autoCompactIfNeeded
                          # model call
                          for await (msg of deps.callModel({...}))  [services/api/claude.js queryModelWithStreaming]
                            yield msg (with backfillObservableInput on a clone)
                            collect tool_use blocks; streamingToolExecutor.addTool
                          # if no follow-up:
                            handleStopHooks; check token budget; return Terminal
                          # if follow-up:
                            runTools(toolUseBlocks, ..., canUseTool, ctx)  [services/tools/toolOrchestration]
                              for each tool_use:
                                tool = findToolByName(tools, name)
                                tool.checkPermissions; canUseTool; tool.call(args, ctx, canUseTool, parentMessage, onProgress)
                              yield tool_result Message
                            executePostSamplingHooks; queued-command drain; refresh tools
                            state = next; continue
```

**The agent's ONLY decision point is "did the assistant emit a tool_use
block?"** That's the entire loop condition. Everything else is recovery and
state mgmt.

### 8.1 Where subagents are spawned

Not directly in any of the files in scope. The path is:

- An assistant message contains a tool_use for `AgentTool` (or `TaskCreateTool`
  in v2).
- `runTools` finds AgentTool by name and calls `AgentTool.call(args, ctx,
canUseTool, parentMsg, onProgress)`.
- AgentTool's `call` is in `tools/AgentTool/AgentTool.tsx` — it creates a
  `LocalAgentTask` (in `tasks/LocalAgentTask/`), constructs a _new_
  `ToolUseContext` via `createSubagentContext` (with `agentId`, `setAppState`
  becoming a no-op for the parent), recursively calls `query({...})` with
  the subagent's system prompt + tool subset, streams the result, returns it
  as a tool_result attachment.

So the recursion is `query → AgentTool → query`. Same loop, different
context.

---

## 9. Comparison Hooks vs `apps/cli/src/`

Sketching the obvious gaps without trying to map fully (other research passes
will go deeper):

1. **No `QueryEngine` analog.** Our `apps/cli/src/agent.rs` (per `ls`) is the
   nearest, but the loop driving model→tools→model lives in `apps/cli/src/repl.rs`
   and `apps/cli/src/subagent.rs`. There's no single async-stream
   abstraction. We should consider a `QueryEngine` Rust struct with
   `submit_message` returning a stream of `SdkMessage`.

2. **Tool interface is much smaller in our CLI.** Claude Code's `Tool` has
   ~30 methods (with defaults via `buildTool`). Ours probably has 4-6
   (per `apps/cli/src/tools.rs`). Missing: `checkPermissions`,
   `validateInput`, `isConcurrencySafe`, `interruptBehavior`,
   `backfillObservableInput`, `toAutoClassifierInput`,
   `preparePermissionMatcher`, the entire UI-rendering layer. Several of
   these are P1 features for parity (permissions plumbing, classifier
   integration).

3. **No "streaming tool executor".** Tools wait for the full assistant
   response before running. Claude Code starts tools as soon as their
   tool_use block streams in, parallelizing tool execution with the rest of
   the assistant message. Big latency win for batches of independent reads.

4. **No `auto-compact` / `microcompact` / `snip` / `context-collapse`.**
   Our `apps/cli/src/compaction.rs` (per `ls`) has _some_ compaction. Claude
   Code has **four layered strategies** with cache-aware ordering. Likely
   the single biggest agent-quality gap.

5. **No `task_budget` or `maxBudgetUsd`.** Our CLI doesn't have a USD
   budget limit per query. Claude Code has both `maxBudgetUsd` (queryEngine
   config) and `task_budget` (server-side beta `task-budgets-2026-03-13`).

6. **No reactive recovery from PTL / max_output_tokens / media-size**.
   Errors from the API likely surface to the user. Claude Code recovers
   automatically up to N attempts.

7. **Stop hooks are first-class.** `query/stopHooks.ts` is 17,290 LOC.
   Our `apps/cli/src/hooks.rs` (per memory: 22 canonical event names) is
   smaller. Stop hooks cover task-completed, teammate-idle, dream, prompt
   suggestion, extract-memories, template job classification.

8. **`processUserInput` does massive work.** Slash-command expansion, image
   parsing, paste resolution, file attachments, queued commands. Our
   `apps/cli/src/command_registry.rs` handles slash commands but not the
   broader pre-prompt pipeline.

9. **Cost accounting is per-model + per-advisor recursive.** Our
   `apps/cli/src/cost_tracker` (if exists) likely aggregates. We need
   per-model granularity for multi-provider.

10. **Streaming events are `Message | StreamEvent | TombstoneMessage |
ToolUseSummaryMessage | RequestStartEvent`.** Five-arm union. Our SDK
    events (per `apps/cli/src/sdk_io/`) are narrower. The `tombstone`
    message (control signal to remove a previously-yielded message) is
    something we don't have — but we _will_ need it the moment we add
    streaming-fallback retries.

---

## 10. Open Questions

1. **What does `services/tools/toolOrchestration.runTools` actually do?**
   It's the heart of tool execution and we only saw it referenced from
   `query.ts:1382`. Specifically: how does it parallelize, how does
   `canUseTool` interact with `tool.checkPermissions`, what's the per-tool
   timeout? **Read next: `~/Desktop/reference/src/services/tools/toolOrchestration.ts`,
   `services/tools/StreamingToolExecutor.ts`.**

2. **What's in `processUserInput`?** Slash command expansion, file/image
   attach, paste resolution. The orchestration of this is unclear from
   QueryEngine alone. **Read next:
   `~/Desktop/reference/src/utils/processUserInput/processUserInput.ts`.**

3. **What's in `services/api/claude.js`?** This is the actual Anthropic SDK
   wrapper — the streaming protocol implementation. How does
   `FallbackTriggeredError` work? How does `queryModelWithStreaming`
   compose retries with the SDK's? How does `effortValue`,
   `advisorModel`, `taskBudget` reach the wire? **Read next:
   `~/Desktop/reference/src/services/api/claude.ts` + `withRetry.ts` +
   `errors.ts`.**

4. **What's in `services/compact/autoCompact.ts` and friends?** Four
   compaction strategies layered on top of each other. The
   trigger-thresholds, the cache-stability rules, and the recovery
   semantics need a dedicated pass. **Read next:
   `services/compact/{autoCompact,microCompact,reactiveCompact,snipCompact}.ts`,
   `services/compact/compact.ts`, `services/contextCollapse/*`.**

5. **How does `AgentTool` actually spawn a subagent?** We know it does, but
   the `createSubagentContext` ⇒ recursive `query()` ⇒ result-stream-back
   contract is the multi-agent pattern we need to mirror. **Read next:
   `tools/AgentTool/AgentTool.tsx`, `tools/AgentTool/agentMemory.ts`,
   `utils/forkedAgent.ts`, `tasks/LocalAgentTask/LocalAgentTask.tsx`.**

6. **What instrumentation would help us learn more?** Primarily: a synthetic
   test that runs `ask({ prompt: "do X with three tools" })` against
   pre-recorded model responses (VCR-style) and prints every yielded
   `SDKMessage` plus the State transitions. This would make the loop
   observable without running real API calls. We should write this
   harness for our own CLI before porting features.

7. **How do query chain IDs / depths feed analytics?**
   `queryTracking = { chainId, depth }` is incremented at every recursive
   `query()` call. Where is this consumed? Search hits: `tengu_skill_tool_invocation`,
   `tengu_query_error`, `tengu_post_autocompact_turn`, `tengu_streaming_tool_execution_used`.
   So it's pure observability — chain dashboards. We don't need this for
   correctness but it's nice for production debugging.

8. **What's the relationship between `mutableMessages` (in QueryEngine) and
   `messages` (per-iteration local in queryLoop)?** Both are mutated. There
   are subtle differences: `messages` is the iteration-snapshot (passed into
   the next `query()` call), `mutableMessages` is the engine-lifetime
   accumulator. The engine pushes to `mutableMessages` from each yielded
   message; `query.ts` pushes to a _different_ local `messages` array
   inside its loop body. Resolving the exact propagation is important for
   any state-machine refactor.

9. **`snipReplay` injection pattern**: QueryEngine's `snipReplay` callback
   (called inside `submitMessage`) receives a yielded boundary and the store,
   and returns a result with new messages. The pattern is "dependency
   injection at the message-handling boundary" — a good model for our Rust
   loop where extension features live in separate crates.

10. **Tool input mutation contract**: `backfillObservableInput` mutates a
    _copy_ before observers (SDK stream, transcript, canUseTool, hooks); the
    original is preserved for the API. This is a subtle but important
    invariant. Our Rust tools should expose a similar `observable_input()`
    method without mutating the API-bound input.

---

## End of pass

Total reading: 12,200+ LOC across the listed files; 30+ cross-reference
points; 10 open questions for follow-up passes. The single most important
finding for our `apps/cli`: **the agent loop is a `while(true)` async
generator with a State struct, not a class hierarchy.** Everything else
flows from that decision.

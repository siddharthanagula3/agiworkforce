# Claude Code reference — Coordinator + Subagent architecture

> Source: `~/Desktop/reference/src/` (Claude Code TS bundle, snapshot 2026-03-31).
> Investigation date: 2026-05-08. All `:N` line numbers reference the snapshotted files.

This pass answers: where the subagent system actually lives, how parallel work is dispatched, how worktree isolation is built on top of `git worktree`, how teams/teammates/coordinator differ, and how the four background-task tools (`TaskGet`/`TaskList`/`TaskOutput`/`TaskStop`) plug into one `tasks` map keyed by typed task IDs.

---

## 1. Discovery — where the subagent system lives

The directories the prompt suggested (`coordinator/`, `query/`, `native-ts/`) turn out to be misleading on their own — the heart of the subagent system is in `tools/AgentTool/` and `tasks/` (`LocalAgentTask`, `RemoteAgentTask`, `InProcessTeammateTask`). The `coordinator/` directory holds _only_ mode-switching glue; `query/` is a small reducer-decomposition for the main `query.ts` loop; `native-ts/` is unrelated (pure-TS ports of native modules).

**Subagent entry point:** `~/Desktop/reference/src/tools/AgentTool/AgentTool.tsx:196` — `export const AgentTool = buildTool({ … name: AGENT_TOOL_NAME … })`. The constant resolves to `'Agent'` with a legacy alias `'Task'` (`tools/AgentTool/constants.ts:1-3`). All subagent spawns flow through the `call()` method at line 239.

**Per-file map of `tools/AgentTool/`:**

| File                                        | Purpose                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------- |
| `AgentTool.tsx` (1397 LOC)                  | The Zod-typed tool wrapper. `inputSchema`/`outputSchema` (lines 82-155), `call()` dispatch (line 239), sync vs async fork (`shouldRunAsync` at line 567), worktree setup (line 590), team-spawn shortcut to `spawnTeammate` (line 290).                                                   |
| `runAgent.ts` (815 LOC)                     | The actual generator that runs a subagent's query loop. `export async function* runAgent(...)` at line 248. Constructs `subagentContext` from parent, registers MCP servers, frontmatter hooks, skills, then yields `Message`s back to the caller.                                        |
| `loadAgentsDir.ts`                          | Loads agent markdown files from `.claude/agents/` (project) and `~/.claude/agents/` (user). Frontmatter Zod schema at line 73 (`AgentJsonSchema`). Type tower `BaseAgentDefinition` → `BuiltInAgentDefinition` / `CustomAgentDefinition` / `PluginAgentDefinition` (lines 106-165).       |
| `built-in/generalPurposeAgent.ts`           | Default subagent: `agentType: 'general-purpose'`, `tools: ['*']`.                                                                                                                                                                                                                         |
| `built-in/exploreAgent.ts`                  | Read-only fast searcher. `disallowedTools: [Agent, ExitPlanMode, Edit, Write, NotebookEdit]`, `model: 'haiku'` for external users.                                                                                                                                                        |
| `built-in/planAgent.ts`                     | Read-only architect. Same disallowed list as Explore, `model: 'inherit'`.                                                                                                                                                                                                                 |
| `built-in/verificationAgent.ts`             | Gated by `tengu_hive_evidence` GrowthBook flag.                                                                                                                                                                                                                                           |
| `built-in/claudeCodeGuideAgent.ts`          | Help/Q&A agent for non-SDK entrypoints.                                                                                                                                                                                                                                                   |
| `built-in/statuslineSetup.ts`               | Wizard that configures the user's status line.                                                                                                                                                                                                                                            |
| `builtInAgents.ts`                          | Registry. `getBuiltInAgents()` returns `[GENERAL_PURPOSE, STATUSLINE_SETUP]` plus optional Explore/Plan/CodeGuide/Verification depending on flags (lines 22-72). When `CLAUDE_CODE_COORDINATOR_MODE=1`, returns `getCoordinatorAgents()` from `coordinator/workerAgent.js` (lines 35-42). |
| `forkSubagent.ts`                           | Implicit-fork variant — child inherits the parent's full conversation context and system prompt. Triggered by _omitting_ `subagent_type` when the `FORK_SUBAGENT` feature is on (`isForkSubagentEnabled()` at line 32).                                                                   |
| `resumeAgent.ts`                            | Resume a backgrounded async agent's session (--resume / SendMessage).                                                                                                                                                                                                                     |
| `agentToolUtils.ts`                         | `runAsyncAgentLifecycle`, `agentToolResultSchema`, classification helpers.                                                                                                                                                                                                                |
| `agentMemory.ts` / `agentMemorySnapshot.ts` | Per-agent persistent memory (`memory: 'user'                                                                                                                                                                                                                                              | 'project' | 'local'` frontmatter). |
| `agentColorManager.ts`                      | UI color assignment for grouped agent panel.                                                                                                                                                                                                                                              |
| `prompt.ts`                                 | The system-prompt template injected as the **caller's** description of the Agent tool.                                                                                                                                                                                                    |
| `UI.tsx` (125 KB)                           | Ink components for the live agent panel.                                                                                                                                                                                                                                                  |

**Coordinator directory (tiny):** `~/Desktop/reference/src/coordinator/coordinatorMode.ts` (the only file). Defines `isCoordinatorMode()` (env-gated by `CLAUDE_CODE_COORDINATOR_MODE`), `matchSessionMode()` (resume-time mode-flip), `getCoordinatorUserContext()` (worker-tools advert), and `getCoordinatorSystemPrompt()` (the LARGE worker-orchestration prompt at lines 116-368). The companion `coordinator/workerAgent.js` is **referenced via lazy require** from `builtInAgents.ts:39` but is not present in the bundled snapshot — it's plausibly stripped during `feature('COORDINATOR_MODE')` dead-code elimination.

**Query directory:** four small modules with one job each:

- `config.ts` — `QueryConfig` snapshot (sessionId + 4 runtime gates) created once per `query()` invocation.
- `deps.ts` — `QueryDeps` injection seam for `callModel` / `microcompact` / `autocompact` / `uuid` so tests don't have to spy individual modules.
- `tokenBudget.ts` — `BudgetTracker` + `checkTokenBudget()` deciding `continue` (with nudge message) vs `stop`.
- `stopHooks.ts` — `handleStopHooks`, `executeTaskCompletedHooks`, `executeTeammateIdleHooks`. The longest of the four (482 LOC) — bridges turn-completion to extract-memories / auto-dream / template-job classifier.

`query/` is a slice of `query.ts` extracted to make a future "step extraction" tractable (the comment at `config.ts:11` calls this out explicitly). `query.ts` (68K) and `QueryEngine.ts` (46K) at the repo root remain the main loops; the `query/` subdirectory is _helper code they call into_, not a replacement.

**`native-ts/`** is unrelated to subagents — it ships pure-TS replacements for compiled native modules (`color-diff/index.ts`: 30K port of vendor color-diff; `file-index/index.ts`: 12K port of a Rust NAPI module; `yoga-layout/index.ts`: 83K port of Meta's flexbox engine for the Ink TUI).

---

## 2. Subagent Invocation

**Tool name:** `'Agent'` (legacy alias `'Task'` for back-compat with old transcripts and permission rules — `constants.ts:1-3`).

**Input schema (`AgentTool.tsx:82-138`):**

```ts
{
  description: string,                                  // 3-5 word task title
  prompt: string,                                       // the actual task
  subagent_type?: string,                               // e.g. 'Explore', 'general-purpose', custom name
  model?: 'sonnet' | 'opus' | 'haiku',                  // override agent.frontmatter.model
  run_in_background?: boolean,                          // async — caller gets <task-notification> back
  // Multi-agent params (gated by isAgentSwarmsEnabled()):
  name?: string,                                        // makes the spawn addressable via SendMessage
  team_name?: string,                                   // join an existing team
  mode?: 'plan' | 'auto' | 'acceptEdits' | …,           // permission mode for spawned teammate
  isolation?: 'worktree' | 'remote',                    // git-worktree-isolated or CCR-remote (ant-only)
  cwd?: string,                                         // explicit cwd override (mutually-excl. with worktree)
}
```

`isolation: 'remote'` is gated to ant-internal builds (`AgentTool.tsx:99`); external users only see `'worktree'`.

**Built-in agent registry:** `builtInAgents.ts:22-72`. Order, with gates:

1. `GENERAL_PURPOSE_AGENT` — always.
2. `STATUSLINE_SETUP_AGENT` — always.
3. `EXPLORE_AGENT` + `PLAN_AGENT` — gated by `BUILTIN_EXPLORE_PLAN_AGENTS` feature × `tengu_amber_stoat` GrowthBook flag (default true for Bedrock/Vertex).
4. `CLAUDE_CODE_GUIDE_AGENT` — only when `CLAUDE_CODE_ENTRYPOINT` is _not_ `sdk-ts`/`sdk-py`/`sdk-cli`.
5. `VERIFICATION_AGENT` — gated by `VERIFICATION_AGENT` feature × `tengu_hive_evidence` flag.
6. **Coordinator mode replaces all the above** with `getCoordinatorAgents()` (a single `worker` agent type) when `CLAUDE_CODE_COORDINATOR_MODE=1`.

**Custom agents** are loaded from disk by `loadAgentsDir.ts:308` calling `loadMarkdownFilesForSubdir('agents', cwd)` which scans `~/.claude/agents/`, `<project>/.claude/agents/`, and policy/managed dirs (`components/agents/agentFileUtils.ts:65-82`). File format is markdown with YAML frontmatter — required `name` + `description` (`loadAgentsDir.ts:404-412`), optional `tools`, `disallowedTools`, `model`, `effort`, `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills`, `initialPrompt`, `memory`, `background`, `isolation`. Body of the markdown is the system prompt (or `prompt:` in JSON form). Plugin agents come from `loadPluginAgents.ts` (subset of fields; admin-trusted).

**Tool registration:** `tools.ts:195` — `AgentTool` is unconditionally in the tool pool (not gated). Aliases let it satisfy old `Task(...)` permission rules.

---

## 3. Coordinator role

The "coordinator" in this codebase is **not a separate process** — it's the **main REPL session** when a single env var is set. `coordinatorMode.ts:36-41`:

```ts
export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE);
  }
  return false;
}
```

When on, `getCoordinatorSystemPrompt()` (lines 111-368) prepends a 250-line orchestration prompt that:

- Forces all subagent spawns to run async (`AgentTool.tsx:567`'s `shouldRunAsync` includes `isCoordinator` as an OR-term).
- Restricts the coordinator's tool set to `Agent` / `SendMessage` / `TaskStop` plus optional GitHub PR subscriptions; explicitly forbids it from running implementation work itself.
- Tells the coordinator that worker results arrive as user-role messages wrapped in `<task-notification>` XML (lines 142-165) — same wire shape as TaskOutput.

**Concurrency model.** There is no central concurrency limiter. Workers run in parallel because:

1. Async subagents are launched fire-and-forget via `void runWithAgentContext(...)` (`AgentTool.tsx:733`) — the coordinator's loop continues immediately.
2. Each async worker registers a task in `appState.tasks` (a flat object keyed by `taskId`) via `registerAsyncAgent` from `LocalAgentTask.tsx`.
3. Completion is announced by enqueuing a `<task-notification>` user-role message into the coordinator's input queue (`enqueueAgentNotification` — `LocalAgentTask.tsx:197+`).

Throttling is left to the model: the coordinator prompt explicitly tells the model "Read-only tasks (research) — run in parallel freely. Write-heavy tasks (implementation) — one at a time per set of files" (`coordinatorMode.ts:215-217`). Nothing in the runtime enforces it.

**Routing.** `subagent_type: 'worker'` is the only type the coordinator addresses; the model picks who to send what based on the prompt text. There is no graph/router/heuristic that maps task descriptions to agent types — the LLM does that.

**Background-mode execution.** `AgentTool.tsx:686-764` is the async branch:

```ts
const agentBackgroundTask = registerAsyncAgent({ agentId, description, prompt, selectedAgent, … })

void runWithAgentContext(asyncAgentContext, () =>
  wrapWithCwd(() => runAsyncAgentLifecycle({
    taskId, abortController,
    makeStream: onCacheSafeParams => runAgent({ …, override: { agentId, abortController } }),
    metadata, description, …
  }))
)

return {
  data: { isAsync: true, status: 'async_launched', agentId, description, prompt,
          outputFile: getTaskOutputPath(agentBackgroundTask.agentId), canReadOutputFile }
}
```

The async tool result returns _immediately_ with the agentId and the path of a JSONL transcript symlink (created by `initTaskOutputAsSymlink` in `LocalAgentTask.tsx:19`). The agent's actual messages are streamed to that file, plus delivered to the coordinator as `<task-notification>` on completion.

**Result collection.** Sync mode: `runAgent` is an `async function*` and the parent's tool-call loop awaits all yielded messages, picking the last assistant-text block as the tool result (`agentToolUtils.ts:finalizeAgentTool`). Async mode: nothing comes back through the tool-result block — it's a fire-and-forget; the result is delivered as a follow-up user-role message containing `<task-notification>…<result>…</result></task-notification>` (`coordinatorMode.ts:148-164`).

**Inter-agent comms.**

- **SendMessage tool** (`tools/SendMessageTool/SendMessageTool.ts`): writes to a file-based mailbox (`writeToMailbox` from `utils/teammateMailbox`). `to:` accepts a teammate name, `"*"` for broadcast, or with the `UDS_INBOX` feature flag, `"uds:/path"` for a local Unix-socket peer or `"bridge:session_…"` for a remote-control peer. The recipient drains its inbox at tool-round boundaries. Structured `shutdown_request` / `shutdown_response` / `plan_approval_response` messages have a typed wire format (`SendMessageTool.ts:46-65`).
- **agentNameRegistry** (`AgentTool.tsx:703-712`): a `Map<name, AgentId>` on AppState that maps the `name:` parameter from spawn to the live `agentId` for SendMessage routing.
- **Mailbox files** live under the team's directory (`utils/swarm/teamHelpers.ts`), so cross-process tmux teammates and same-process in-process teammates use the same protocol.

---

## 4. Worktree Isolation

Implementation: `~/Desktop/reference/src/utils/worktree.ts:902-952` (`createAgentWorktree`).

**Slug:** `agent-<8 hex from agentId>` (`AgentTool.tsx:591`). Validated via `validateWorktreeSlug` (lines 66-87) — rejects path traversal segments, `.` / `..`, leading/trailing `/`, and anything outside `[a-zA-Z0-9._-]` per segment.

**Path:** `<gitRoot>/.claude/worktrees/<slug>` (`worktreesDir`, line 204).

**Branch:** `worktree-<slug>` (`worktreeBranchName`, line 221). Forward-slashes in slugs are flattened to `+` (line 217) to dodge git ref D/F conflicts.

**Creation flow:**

1. If a `WorktreeCreate` user hook is configured, delegate to it (custom VCS support, line 911-919).
2. Otherwise: `findCanonicalGitRoot(getCwd())` — _canonical_, not the local-resolved root, so subagents spawned inside a session worktree still land in the main repo's `.claude/worktrees/` (line 925).
3. Read existing `.git` HEAD via `readWorktreeHeadSha` — fast-resume if the worktree already exists (line 247).
4. Otherwise: `git fetch origin <default-branch>` (skipped if `origin/<branch>` already resolves locally, line 280-303); `git worktree add -B <branch> <path> <baseBranch>`.
5. `performPostCreationSetup`: copies `.claude/settings.local.json` into the worktree, configures `core.hooksPath` to point at the main repo's `.husky` / `.git/hooks` so hooks survive, optionally symlinks `node_modules` etc. via `settings.worktree.symlinkDirectories`, copies `.worktreeinclude` files (gitignored files explicitly listed, e.g. local `.env`), installs the commit-attribution hook.
6. `utimes` bumps mtime so the 30-day stale-cleanup doesn't reap a fast-resumed worktree.

**Filesystem boundaries.** The agent runs with `cwd` set to the worktree path (`runWithCwdOverride(worktreeInfo.worktreePath, …)` at `AgentTool.tsx:641`). All filesystem tools (`Read`, `Edit`, `Write`, `Bash`, `Grep`, etc.) operate on whatever `getCwd()` returns inside that scope. The agent can read/write anywhere in the worktree — the worktree itself is the boundary. There's **no chroot/sandbox** on top; the only guarantee is "the agent's edits land in a separate branch that we can later diff and discard". `additionalWorkingDirectories` (other allow-listed roots) are still honored.

**Cleanup.** `cleanupWorktreeIfNeeded` (`AgentTool.tsx:644-685`):

1. If the worktree has uncommitted changes or new commits since `headCommit` (`hasWorktreeChanges`, `worktree.ts:1144-1173`), keep it — the user can inspect / merge later.
2. Otherwise: `git worktree remove --force <path>`, `git branch -D worktree-<slug>`.
3. The metadata file is updated to clear `worktreePath` so `--resume` doesn't try to use a deleted dir.

**Periodic GC.** `cleanupStaleAgentWorktrees(cutoffDate)` (`worktree.ts:1058-1136`): scans `.claude/worktrees/`, only touches slugs matching `EPHEMERAL_WORKTREE_PATTERNS` (e.g. `^agent-a[0-9a-f]{7}$`), confirms `git status --porcelain -uno` is clean and `rev-list HEAD --not --remotes` is empty (every commit is reachable from a remote — no unpushed work), then removes. Default cutoff is 30 days, called from session-end and a periodic timer.

---

## 5. Team / Supervisor model

There IS an explicit Team concept, _separate_ from coordinator mode. Definition in `utils/swarm/teamHelpers.ts` (`TeamFile` type) — referenced from `tools/TeamCreateTool/TeamCreateTool.ts:18`. Persisted as `<team-config-dir>/<sanitized-name>.json` containing:

```ts
type TeamFile = {
  name: string;
  description?: string;
  createdAt: number;
  leadAgentId: string; // 'team-lead@<teamName>' deterministic
  leadSessionId: string; // session that owns the team
  members: Array<{
    agentId: string;
    name: string;
    agentType: string;
    model: string;
    joinedAt: number;
    tmuxPaneId: string; // empty when in-process
    cwd: string;
    subscriptions: string[];
  }>;
};
```

**`TeamCreateTool` (`name: 'TeamCreate'`)** — gated by `isAgentSwarmsEnabled()` (`TeamCreateTool.ts:88`). Restricts to **one team per leader** (`TeamCreateTool.ts:136-139`); enforces unique team names; resets the task list directory for the team (Team = Project = TaskList for task-numbering purposes — line 184); registers session-end cleanup (line 180). The new team always seeds a `team-lead` member with a deterministic agent ID `formatAgentId('team-lead', teamName)`.

**`TeamDeleteTool`** — companion delete operation (`tools/TeamDeleteTool/TeamDeleteTool.ts`).

**Spawning teammates** is a separate path from spawning a subagent. When `AgentTool` is called with both `name` and `team_name` set (`AgentTool.tsx:284`), it routes to `spawnTeammate` from `tools/shared/spawnMultiAgent.ts`. Teammates run in **separate processes** (tmux panes, iTerm2 splits, or a plain background subprocess depending on backend) — they share the team's mailbox but have their own session, transcript, and AppState. Subagents (`AgentTool` without `name+team_name`) run in the **same process**.

**In-process teammate** (`tasks/InProcessTeammateTask/InProcessTeammateTask.tsx`) — the lighter variant: a teammate that runs as a co-routine inside the leader's process (typed task `'in_process_teammate'`, prefix `t`). Used when tmux/iTerm2 isn't available. Constraint: in-process teammates **cannot** spawn background agents (`AgentTool.tsx:278-280`) because their lifecycle is tied to the leader's process.

**Supervisor / lead.** There is no special "supervisor" agent type. Hierarchy is convention:

- **Coordinator mode** = main session whose system prompt forbids non-orchestration tools.
- **Team lead** = the session that called `TeamCreate` (`isTeamLead()` from `utils/teammate.ts`).
- A team has one lead and N members. Members can SendMessage to each other but cannot create sub-teams (`AgentTool.tsx:272-274`: "Teammates cannot spawn other teammates — the team roster is flat").

**Cross-team / remote messaging.**

- `SendMessage` with `to: "uds:/path"` (`UDS_INBOX` feature) writes to a different Claude session's Unix-domain-socket inbox on the same machine (`SendMessageTool.ts:71-76`).
- `SendMessage` with `to: "bridge:session_…"` routes through the Remote Control bridge (`bridge/replBridgeHandle.ts`) to a session on another machine.
- `RemoteTriggerTool` (`tools/RemoteTriggerTool/RemoteTriggerTool.ts`, gated by `AGENT_TRIGGERS_REMOTE` feature) is a separate tool for setting up GitHub webhook / scheduled-cron triggers that wake an agent.
- `ListPeers` is mentioned in the SendMessage prompt (`SendMessageTool/prompt.ts:13`) for peer discovery.

---

## 6. Background tasks (TaskGet, TaskList, TaskOutput, TaskStop)

**Tracking storage:** all background tasks live in `appState.tasks: Record<string, TaskState>` — a single in-memory map on the React-style AppState. They are NOT persisted across sessions in a database; instead the agent's transcript JSONL on disk (`getTaskOutputPath(taskId)`) is the persistence layer, and on `--resume` the task list is reconstructed from the transcript catalog.

**Typed task IDs** (`Task.ts:78-106`): `TaskType` is a string-literal union, each with a single-char prefix:

| Prefix | Type                  | Lives in                                     |
| ------ | --------------------- | -------------------------------------------- |
| `b`    | `local_bash`          | `tasks/LocalShellTask/`                      |
| `a`    | `local_agent`         | `tasks/LocalAgentTask/`                      |
| `r`    | `remote_agent`        | `tasks/RemoteAgentTask/`                     |
| `t`    | `in_process_teammate` | `tasks/InProcessTeammateTask/`               |
| `w`    | `local_workflow`      | (workflow runs)                              |
| `m`    | `monitor_mcp`         | (long-poll MCP monitors)                     |
| `d`    | `dream`               | (background dream/extract-memories sessions) |

`generateTaskId(type)` (line 98) generates `<prefix><8 chars from base36>` — 36⁸ ≈ 2.8 trillion combinations.

**Task lifecycle:** `pending → running → completed | failed | killed` (`Task.ts:15-21`). `isTerminalTaskStatus` predicate at line 27. Transitions:

1. `registerTask` / `registerAsyncAgent` creates the entry in `pending` state, immediately flips to `running` once the runtime starts.
2. `updateTaskState<T>(taskId, setAppState, fn)` (`utils/task/framework.ts`) for incremental updates — used for progress (token count, last activity) and stream-message append.
3. `completeAsyncAgent` / `failAsyncAgent` / `killAsyncAgent` (`LocalAgentTask.tsx`) flip to terminal state and enqueue the `<task-notification>` user-role message into the parent's input queue.
4. `evictAfter` deadline + `PANEL_GRACE_MS` (`LocalAgentTask.tsx:20`) controls when the UI panel hides + the task entry is GC'd.

**Per-tool wiring:**

- **`TaskGet`** (`tools/TaskGetTool/TaskGetTool.ts`) — reads from `getTask(taskListId, taskId)` in `utils/tasks` (the **TodoV2** task store, gated by `isTodoV2Enabled()`). This is actually a task-LIST tool for the durable v2 task tracker (not background runs). Returns subject/description/status/blocks/blockedBy.
- **`TaskList`** (`tools/TaskListTool/TaskListTool.ts`) — same TodoV2 store. `listTasks(taskListId)` returns the team's full TODO list, filtered by `_internal` metadata.
- **`TaskOutput`** (`tools/TaskOutputTool/TaskOutputTool.tsx`) — reads from `appState.tasks[task_id]` (the _runtime_ task map, not TodoV2). Supports blocking (`block: true`, `timeout: 30s` default, max 600s — line 33) for "wait for completion" semantics. Output formatting is per-task-type: bash gets stdout+stderr, local_agent gets the clean final-answer-only text (extracted via `extractTextContent`, line 98), remote_agent passes through. The disk JSONL transcript is a _symlink_ to the agent session transcript; in-memory `task.result` is preferred when populated (line 91-105).
- **`TaskStop`** (`tools/TaskStopTool/TaskStopTool.ts`) — accepts `task_id` (or deprecated `shell_id` — KillShell alias). Validates status is `running` (line 82-88), then calls `stopTask` from `tasks/stopTask.ts` which dispatches on `task.type` to the right killer (each TaskType has its own `kill(taskId, setAppState)` implementation per `Task` interface line 72-76).

**Output streaming.** Buffered + line-incremental:

- The async agent's `runAgent` generator yields `Message` objects per turn. `runAsyncAgentLifecycle` (in `agentToolUtils.ts`) consumes them, calling `updateProgressFromMessage` to track token/tool counts (`LocalAgentTask.tsx:68-96`) and writing each yielded message to the JSONL transcript.
- Bash tasks stream via `LocalShellTask`'s `taskOutput.getStdout()` / `getStderr()` (`TaskOutputTool.tsx:65-69`).
- `TaskOutput` blocks on a polling sleep loop with `task.status` checks — it is NOT a real-time push; it polls until `isTerminalTaskStatus` or `timeout` fires.

---

## 7. Query directory revisited

After reading the four files, `query/` is a **partial decomposition** of the monolithic `query.ts` into immutable inputs and side-effecting outputs:

- `config.ts` — pure data: gates + sessionId. Used by `query.ts` to avoid re-reading env/Statsig per turn.
- `deps.ts` — DI for tests. `productionDeps()` returns the live functions; tests pass fakes.
- `tokenBudget.ts` — pure decision function. `checkTokenBudget` takes (tracker, agentId, budget, globalTurnTokens) and returns `{action: 'continue', nudgeMessage, ...}` or `{action: 'stop', ...}`. Used to keep agentic loops going past completion-threshold while the model is still making progress.
- `stopHooks.ts` — the only impure one: dispatches `Stop`/`SubagentStop`/`TaskCompleted`/`TeammateIdle` user-defined hooks plus auto-dream / extract-memories / template-job classifier. Routes the hook's `additionalContexts` back into the message stream.

Relationship to root-level files:

- `query.ts` (68K) — the main turn loop; orchestrates tools, model calls, microcompact, autocompact, and ALL hook events. Imports from `query/` for tokenBudget + stopHooks + config + deps.
- `QueryEngine.ts` (46K) — the SDK-facing wrapper. Spins up an iterator that adapts `query.ts` events into the SDK's stream protocol (used by `apps/cli` SDK consumers).
- `Tool.ts` (29K) — the `buildTool` / `ToolDef` contract every tool implements (`AgentTool` at the top level, all 30+ built-in tools, all MCP tools).

There is no provider-routing or tool-use-loop in `query/` per se — that all lives in `query.ts` itself. `query/` is just "things that are stateless or pure enough to extract".

---

## 8. Cross-references

| Surface       | File                                                                         | Purpose                                                           |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Tool          | `tools/AgentTool/AgentTool.tsx`                                              | Spawn                                                             |
| Tool          | `tools/SendMessageTool/SendMessageTool.ts`                                   | Message routing                                                   |
| Tool          | `tools/TeamCreateTool/TeamCreateTool.ts`                                     | Team init                                                         |
| Tool          | `tools/TeamDeleteTool/TeamDeleteTool.ts`                                     | Team teardown                                                     |
| Tool          | `tools/TaskCreateTool/TaskCreateTool.ts`                                     | TodoV2 task create                                                |
| Tool          | `tools/TaskGetTool/TaskGetTool.ts`                                           | TodoV2 read                                                       |
| Tool          | `tools/TaskListTool/TaskListTool.ts`                                         | TodoV2 list                                                       |
| Tool          | `tools/TaskUpdateTool/TaskUpdateTool.ts`                                     | TodoV2 update                                                     |
| Tool          | `tools/TaskOutputTool/TaskOutputTool.tsx`                                    | Background runtime task read                                      |
| Tool          | `tools/TaskStopTool/TaskStopTool.ts`                                         | Background runtime kill                                           |
| Tool          | `tools/RemoteTriggerTool/RemoteTriggerTool.ts`                               | Webhook/cron triggers                                             |
| Tool          | `tools/EnterWorktreeTool/EnterWorktreeTool.ts`                               | Session worktree (user-driven)                                    |
| Tool          | `tools/ExitWorktreeTool/ExitWorktreeTool.ts`                                 | Session worktree teardown                                         |
| Tool          | `tools/TodoWriteTool/TodoWriteTool.ts`                                       | Legacy todo writer                                                |
| Slash command | `commands/agents/index.ts` + `agents.tsx`                                    | `/agents` opens `AgentsMenu` Ink screen                           |
| UI            | `components/agents/AgentsMenu.tsx` (referenced from agents.tsx)              | List/edit/create agents                                           |
| UI            | `components/agents/agentFileUtils.ts`                                        | Resolves `~/.claude/agents/`, `<cwd>/.claude/agents/`, policy dir |
| UI            | `components/agents/new-agent-creation/wizard-steps/LocationStep.tsx`         | New-agent UI scope picker (project / personal)                    |
| Screen        | `screens/REPL.tsx` + `screens/ResumeConversation.tsx` + `screens/Doctor.tsx` | Three top-level Ink screens — no dedicated team/agent screen      |

Tool-pool assembly: `tools.ts:195-300` — `AgentTool`, `TaskOutputTool`, `TaskStopTool` are unconditional; `TaskCreateTool`/`TaskGetTool`/`TaskUpdateTool`/`TaskListTool` gated by `isTodoV2Enabled()`; `SendMessageTool` always; `TeamCreateTool`/`TeamDeleteTool` gated by `isAgentSwarmsEnabled()`; `RemoteTriggerTool` gated by `AGENT_TRIGGERS_REMOTE` feature.

---

## 9. To ship subagents in `apps/cli/`

The minimum-viable port from this reference, in priority order:

1. **`buildTool` contract.** `apps/cli/src/tools.rs` already has a Tool trait — add an `Agent` tool whose Zod-equivalent input schema mirrors `AgentTool.tsx:82-138`. Keep the legacy `Task` alias for spec compat.
2. **AgentDefinition + frontmatter loader.** Mirror `loadAgentsDir.ts` — markdown files in `~/.agiworkforce/agents/` and `<project>/.agiworkforce/agents/` with YAML frontmatter (name, description, tools, model, permissionMode, isolation, hooks, skills, mcpServers, maxTurns).
3. **Built-in agent registry.** Start with `general-purpose` only; add `Explore` and `Plan` once the model-routing layer can pick fast/cheap models (Haiku-tier).
4. **`runAgent` generator equivalent.** Refactor the main turn loop to be invocable as a child loop with: separate AbortController, separate AppState slice (sync agents share parent's, async get a fresh one), separate transcript directory (`~/.agiworkforce/sessions/<parent-id>/subagents/<agent-id>.jsonl`).
5. **`appState.tasks` map + typed task IDs.** Use the same prefix scheme so we can ship `TaskGet`/`TaskList`/`TaskOutput`/`TaskStop` as one cluster. Lifecycle states match the Claude Code list.
6. **`run_in_background` async path.** `<task-notification>` XML on completion + immediate `async_launched` tool result with output-file path.
7. **`SendMessage` + `agentNameRegistry`** for inter-subagent messaging within one session.
8. **Worktree isolation.** Direct port of `utils/worktree.ts` — `validateWorktreeSlug`, `git worktree add -B`, `core.hooksPath` propagation, ephemeral GC. Note: ours can drop the iTerm2/tmux fast-path code initially.
9. **Coordinator mode** can wait until the simpler subagent flow is working — it's just a different system prompt + a tool-restriction policy on the parent.
10. **Teams + tmux teammates** are a follow-up; they need a separate-process backend (UDS mailbox + team file on disk) and the iTerm2/tmux backend abstraction in `utils/swarm/backends/`. For an MVP, in-process teammates only.

Two non-obvious gotchas worth surfacing for `apps/cli/`:

- The "fork subagent" path (`forkSubagent.ts`) is a _cache-engineering_ trick: the child gets the parent's exact tool array bytes so the API prompt-cache hits the parent's prefix. Implementing it requires byte-stable tool serialization across permission-mode changes — easy to break.
- The MCP-per-agent feature (`runAgent.ts:95-218`) lets each agent connect to its own MCP servers (additive to parent's). Cleanup-on-finish only applies to _inline-defined_ servers, not name-referenced ones (which are memoized).

---

## Open questions

1. **`coordinator/workerAgent.js` is referenced but not in the bundle.** `builtInAgents.ts:39` requires it lazily under `feature('COORDINATOR_MODE')`. Its absence in the snapshot is likely tree-shaking, but we don't know what `getCoordinatorAgents()` returns beyond "a worker agent type". Need to inspect a build with `feature('COORDINATOR_MODE')` enabled to recover that registry.
2. **Concurrency back-pressure under load.** No central limiter, no queue — what happens if a coordinator launches 50 async agents? Memory and Anthropic-API rate limits will bite, but the code paths don't show any throttle. Worth asking: does the model self-limit, or does Claude Code rely on the API to 429?
3. **`backgroundPromise` race semantics in sync agents.** `AgentTool.tsx:813-832` — every iteration of the agent's loop registers `.then(...)` on the same `registration.backgroundSignal` promise. The comment says "Create the background race promise once outside the loop — otherwise each iteration adds a new .then() reaction" — but the code creates `backgroundPromise` once. Is this a fix-after-bug comment, or is the still-running concern? Need to trace the loop.
4. **Worktree cleanup vs. unpushed commits.** `cleanupStaleAgentWorktrees` skips worktrees with `rev-list HEAD --not --remotes` non-empty (any unpushed commit). For local-only repos with no remote, _every_ commit is unpushed → cleanup is permanently disabled. Is that intentional? Or is local-only Claude Code use leaking worktrees forever?
5. **`isolation: 'remote'` (CCR — Claude Cloud Runtime?).** Ant-only feature, gated at `AgentTool.tsx:99`. The `RemoteAgentTask.tsx` is 126 KB but we didn't read it for this pass — it likely embeds the cloud-runtime client. Worth a follow-up if/when AGI Workforce ships a cloud variant.
6. **`UDS_INBOX` cross-session messaging.** Mentioned in `SendMessageTool.ts:73` but the actual socket-listener code lives outside this pass's scope. Where does each Claude session start its inbox listener and on which path? Likely `bootstrap/state.ts` or `bridge/sessionRunner.ts` — needs cross-reference with the bridge research stream.
7. **Agent-MCP cleanup ordering.** `runAgent.ts:197-210` cleans up _newly-created_ clients only. If two concurrent agents both reference the same MCP server by name, refcounting is implicit (memoized in `connectToServer`). Confirm there's no double-close on session end.

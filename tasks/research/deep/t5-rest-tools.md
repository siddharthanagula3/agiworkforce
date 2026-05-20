# T5 — Rest of `tools/` + `native-ts/` (Plan/Worktree/Cron/Trigger/Team/SendMessage/Todo/Task/Sleep/Synthetic/REPL/Yoga)

> Agent T5 of 30. Scope: 21 tool subdirectories under `~/Desktop/reference/src/tools/` plus all three subtrees of `~/Desktop/reference/src/native-ts/` (yoga-layout, color-diff, file-index). Every claim cites file:line. References are anchored under `~/Desktop/reference/src/`.

---

## 1. Plan-mode lifecycle: `EnterPlanMode` → `ExitPlanMode` (`tools/EnterPlanModeTool/*`, `tools/ExitPlanModeTool/*`)

The plan-mode pair is the **most architecturally interesting** pair in the rest-of-tools set: it implements a model-driven state transition that flips the _whole_ permission system out of the read/write happy-path into a read-only exploration phase, then back out via an explicit user-approval gate. Three reasons this matters for AGI Workforce:

1. We already have CLI plan-mode plumbing (`memory/MEMORY.md` notes legacy `plan_mode` deleted at `tools.rs:193`, `update_plan` retained), but no model-callable EnterPlanMode/ExitPlanMode tool yet.
2. The two tools coordinate via `setNeedsPlanModeExitAttachment()` to inject "the plan was approved, here is its content, now write code" attachments into the next user turn — that is the entire mechanism by which a plan becomes implementation guidance.
3. Both tools have a `--channels` kill-switch (`getAllowedChannels().length > 0` in EnterPlanMode `EnterPlanModeTool.ts:60-65`, ExitPlanMode `ExitPlanModeV2Tool.ts:171-176`) that disables the pair in non-TUI Telegram/Discord modes, because the approval dialog needs the terminal — a clean precedent for surface-aware tool gating.

### EnterPlanMode (4 files, 17 KB)

`EnterPlanModeTool/EnterPlanModeTool.ts:36-126` builds via `buildTool()` with: `name = ENTER_PLAN_MODE_TOOL_NAME` (= `'EnterPlanMode'` per `constants.ts:1`); empty `inputSchema` (`EnterPlanModeTool.ts:21-25` — the tool takes no arguments — entering plan mode is a binary state flip); `shouldDefer: true` (`EnterPlanModeTool.ts:55` — surfaced via the deferred-tool announcement, not inline schema); `userFacingName() = ''` (`EnterPlanModeTool.ts:52-54` — empty so it doesn't show as a command name in the TUI); `isReadOnly() = true` (`EnterPlanModeTool.ts:71-73` — marker for permission gates); `isConcurrencySafe() = true`.

`call()` at `EnterPlanModeTool.ts:77-102` rejects agent contexts (`if (context.agentId) throw new Error(...)` — only the main session may enter plan mode, agents inherit), calls `handlePlanModeTransition()` from `bootstrap/state.js`, then mutates `toolPermissionContext` via `applyPermissionUpdate()` with `{ type: 'setMode', mode: 'plan', destination: 'session' }`. The destination is `'session'` so the plan mode lasts only this REPL session — exit & restart starts in default mode.

**The crucial post-call instruction injection** is at `EnterPlanModeTool.ts:103-125`: `mapToolResultToToolResultBlockParam()` returns either an interview-phase string (only the plan file is writable) or a 6-step explore-design workflow (`EnterPlanModeTool.ts:108-118`): "1. Thoroughly explore the codebase ... 6. When ready, use ExitPlanMode to present your plan for approval. Remember: DO NOT write or edit any files yet." This _is_ how the model gets oriented — the system-prompt-section trick at `clearSystemPromptSections()` only happens on Worktree changes, but plan mode just rewrites the result text every call.

The prompt at `EnterPlanModeTool/prompt.ts:1-170` is the most detailed prompt I've seen in the rest-of-tools set: 7 trigger conditions (new feature, multiple approaches, code modifications, architectural decisions, multi-file changes, unclear requirements, user preferences matter — `prompt.ts:25-55`), 4 skip conditions (`prompt.ts:57-63`), and dual prompts (`getEnterPlanModeToolPromptExternal` vs `getEnterPlanModeToolPromptAnt`) gated by `process.env.USER_TYPE === 'ant'` at `prompt.ts:166-170`. The Ant version is more conservative ("genuinely unclear", "high-impact restructuring") — Anthropic engineers triggered plan mode too aggressively without it.

UI at `EnterPlanModeTool/UI.tsx:9-32`: `renderToolResultMessage` shows a black-circle bullet with `getModeColor('plan')` and "Entered plan mode"; rejection shows "User declined to enter plan mode". Empty render for tool-use itself — the prompt suffices.

### ExitPlanMode (4 files, 35 KB)

`ExitPlanModeTool/ExitPlanModeV2Tool.ts:147-493` is **17 KB of state-machine code** vs EnterPlanMode's 4 KB. The complexity is in three orthogonal concerns:

1. **Teammate vs main-session split** (`ExitPlanModeV2Tool.ts:185-220`): teammates (where `isTeammate() === true`) skip the local `requiresUserInteraction()` and `validateInput` mode check; their plan goes via mailbox to the team lead at `ExitPlanModeV2Tool.ts:264-313` if `isPlanModeRequired()`, otherwise they exit locally. Non-teammates require local user confirmation via `behavior: 'ask'` at `ExitPlanModeV2Tool.ts:233-238`.

2. **CCR-edited plans** (`ExitPlanModeV2Tool.ts:252-261`): the schema accepts `allowedPrompts` for prompt-based Bash permissions but the `_sdkInputSchema` (`ExitPlanModeV2Tool.ts:97-108`) extends it with `plan` and `planFilePath` — these are injected by `normalizeToolInput` from disk, but CCR (Claude Code Remote, the web UI) can full-replace `finalInput` with an edited plan. The `inputPlan` is conditionally re-written to disk at `ExitPlanModeV2Tool.ts:258-260`: `await writeFile(filePath, inputPlan, 'utf-8')` and `void persistFileSnapshotIfRemote()` re-snapshots after the edit.

3. **Auto-mode gate-off fallback** (`ExitPlanModeV2Tool.ts:328-355`): if `prePlanMode === 'auto'` but the auto-mode gate is now off (circuit breaker tripped or settings disable), restore to `'default'` instead. Without this, ExitPlanMode would bypass the circuit breaker by calling `setAutoModeActive(true)` directly. A user notification fires at `ExitPlanModeV2Tool.ts:347-355` with priority `'immediate'` and 10-second timeout.

The mode-restore at `ExitPlanModeV2Tool.ts:357-403` is intricate: read `prevMode = prePlanMode ?? 'default'`, optionally clamp from `'auto'` → `'default'` per gate, set `setHasExitedPlanMode(true)` (one-shot session flag) and `setNeedsPlanModeExitAttachment(true)` (the trigger for the next user-turn injection), capture `autoWasUsedDuringPlan` from `isAutoModeActive()` to detect if auto was active _during_ plan mode (so the auto-mode-exit attachment fires too), restore stripped dangerous-permission rules if returning to non-auto.

`mapToolResultToToolResultBlockParam` at `ExitPlanModeV2Tool.ts:419-492` produces three different outputs: (a) awaiting-leader-approval banner with request ID for teammates, (b) "User has approved the plan ... respond with 'ok'" for agent contexts, (c) full plan text echo with `planLabel = 'Approved Plan' | 'Approved Plan (edited by user)'` for the main thread — the comment at `:474-475` flags that this _must_ always include the plan because `extractApprovedPlan()` in the Ultraplan CCR flow parses tool_result to retrieve it for the local CLI.

UI at `ExitPlanModeTool/UI.tsx:17-66` renders three states: empty plan (just "Exited plan mode"), awaiting-leader-approval ("Plan submitted for team lead approval / Waiting for team lead to review and approve..."), and the standard "User approved Claude's plan" with the plan saved-to path and the plan body rendered as markdown. Rejection at `:68-81` falls through to a `<RejectedPlanMessage>` that shows the plan that was rejected.

**Port priority for AGI Workforce CLI: HIGH.** The CLI doesn't have a model-callable Enter/Exit pair yet — only `update_plan` exists. We should port both tools, drop the teammate complexity (we don't have agent swarms in CLI yet), keep the auto-mode-gate fallback semantics, and reuse the `setNeedsPlanModeExitAttachment` injection trick.

---

## 2. Worktree lifecycle: `EnterWorktree` → `ExitWorktree` (`tools/EnterWorktreeTool/*`, `tools/ExitWorktreeTool/*`)

This pair is **the strongest single-feature gap** vs Anthropic's tooling: AGI Workforce CLI has no model-callable worktree creation. Anthropic's pair handles git worktree creation, mid-session cwd flips, system-prompt cache invalidation, hook-based VCS-agnostic isolation, and on-exit branch cleanup with explicit "discard changes" gating.

### EnterWorktree (4 files, 13 KB)

`EnterWorktreeTool/EnterWorktreeTool.ts:52-127` builds with `name = 'EnterWorktree'` (`constants.ts:1`), `userFacingName = 'Creating worktree'`, `shouldDefer: true`. Schema accepts an optional `name` (`EnterWorktreeTool.ts:24-37`) validated via `validateWorktreeSlug()` — the description literally specifies "Each '/'-separated segment may contain only letters, digits, dots, underscores, and dashes; max 64 chars total". A random name (`getPlanSlug()` from `utils/plans.js`) is generated if omitted.

The `call()` at `EnterWorktreeTool.ts:77-119` is a sequence of side effects worth tracing:

1. Reject if already in a worktree session (`getCurrentWorktreeSession()` truthy → throw at `:79-81`).
2. **Resolve to main repo root before creating** (`:84-88`): `findCanonicalGitRoot(getCwd())` then `process.chdir(mainRepoRoot)` and `setCwd(mainRepoRoot)`. This is essential — `git worktree add` from inside a worktree fails with "fatal: '...' is already checked out".
3. Create worktree via `createWorktreeForSession(getSessionId(), slug)` (`:92`).
4. Switch cwd to the worktree path (`:94-95`).
5. `setOriginalCwd(getCwd())` — note: this stores the _worktree_ path as original, intentional per the comment in ExitWorktree.
6. `saveWorktreeState(worktreeSession)` — persists to session storage.
7. `clearSystemPromptSections()` — invalidates `env_info_simple` cache so it recomputes with worktree context (`:99`).
8. `clearMemoryFileCaches()` — `CLAUDE.md`/`AGENTS.md` may have moved.
9. `getPlansDirectory.cache.clear?.()` — plans dir is now under the worktree.

Output message: `"Created worktree at ${worktreeSession.worktreePath}${branchInfo}. The session is now working in the worktree. Use ExitWorktree to leave mid-session, or exit the session to be prompted."` — explicit teaching of the `Exit` companion.

The prompt at `EnterWorktreeTool/prompt.ts:1-30` is conservative: "Use this tool ONLY when the user explicitly asks to work in a worktree" with literal trigger words listed. There's a clean fallback to `WorktreeCreate/WorktreeRemove` hooks for non-git VCS-agnostic isolation (`prompt.ts:16, :22-23`) — that's the same hook protocol used by the `Setup`/`SessionStart` events, but scoped to worktree CRUD specifically.

UI at `EnterWorktreeTool/UI.tsx:7-19`: shows "Creating worktree..." for tool use; on success, "Switched to worktree on branch <branch>" with the path dim-color below.

### ExitWorktree (4 files, 21 KB)

`ExitWorktreeTool/ExitWorktreeTool.ts:148-329` is **the most defensive tool** in the rest-of-tools set. Three guard layers:

1. **Scope guard** (`:174-188`): refuses to operate if `getCurrentWorktreeSession()` is null. This check is exclusively for worktrees created by `createWorktreeForSession()` _in this session_ — externally-created worktrees, or ones from a previous session, are explicitly out of scope. The error message at `:184-186` is unusually long because the prompt teaches the model to expect a no-op rather than retry: "No-op: there is no active EnterWorktree session to exit. ... No filesystem changes were made."

2. **Change-detection guard** (`:190-220`): if `action: 'remove'` and `discard_changes: false`, calls `countWorktreeChanges()` (`:79-113`) — runs `git status --porcelain` and `git rev-list --count ${originalHeadCommit}..HEAD`. The function returns null if either git call fails (lock file, corrupt index, bad ref) or if `originalHeadCommit` is undefined while git status succeeded — that's the "hook-based-worktree-wrapping-git" case where we know it's git but lack a baseline. **Null is treated as fail-closed** (`:195-200`): refuse to remove without explicit confirmation. This is the single most carefully-commented function in the rest-of-tools set.

3. **Race guard in `call()`** (`:228-233`): re-fetch `currentWorktreeSession` at execution time and throw if null. The comment at `:230-232` explains: "validateInput guards this, but the session is module-level mutable state — defend against a race between validation and execution."

The "keep" path (`:261-284`) calls `keepWorktree()` then `restoreSessionToOriginalCwd()`. The "remove" path (`:286-321`) optionally kills any tmux session via `killTmuxSession()`, calls `cleanupWorktree()`, and reports discarded files/commits. A subtle correctness point at `:255-259`: re-counts at execution time for accurate analytics — the validation-time counts are stale by the time we reach `call()`.

`restoreSessionToOriginalCwd()` at `:122-146` is the most stateful function: `setCwd(originalCwd)`, `setOriginalCwd(originalCwd)` (note: EnterWorktree set this to the _worktree_ path, intentional — see state.ts comment), `setProjectRoot(originalCwd)` only if `projectRootIsWorktree` (true when `--worktree` was the startup mode), `updateHooksConfigSnapshot()` symmetric with setup.ts:235/239, `saveWorktreeState(null)`, and the same three cache-clearing calls as EnterWorktree. The comment at `:130-133` is an architectural note: "EnterWorktree sets originalCwd to the worktree path (intentional — see state.ts getProjectRoot comment). Reset to the real original."

UI at `ExitWorktreeTool/UI.tsx:7-24`: shows "Exiting worktree..."; on success, "Kept worktree" or "Removed worktree" with branch in bold and "Returned to <originalCwd>" dim. The action label is computed at `:13`.

**Port priority for AGI Workforce CLI: HIGH.** Worktree management is in the codex-cli reference pile but not yet in our CLI. The defensive `countWorktreeChanges` returns-null-fail-closed pattern, the cwd → setOriginalCwd asymmetry, and the system-prompt cache invalidation are all hard-won correctness. The hook escape hatch (`WorktreeCreate`/`WorktreeRemove`) lets users wire in non-git VCS support — that's the same general pattern as `Setup`/`SessionStart` hooks elsewhere.

---

## 3. ScheduleCronTool — recurring + one-shot scheduling (`tools/ScheduleCronTool/*`, 5 files, 27 KB)

Three sibling tools in one directory: `CronCreateTool`, `CronDeleteTool`, `CronListTool`. They share `prompt.ts` (gating + descriptions) and `UI.tsx`. All three are gated by `isKairosCronEnabled()` (`prompt.ts:36-45`): combination of build-time `feature('AGENT_TRIGGERS')`, runtime GrowthBook `tengu_kairos_cron` (5-minute cache refresh), and `CLAUDE_CODE_DISABLE_CRON` env override. The default is `true` because `/loop` is GA — flipping the GB flag to `false` is now purely a fleet-wide kill switch (the comment at `prompt.ts:30-33` notes it stops already-running schedulers on next isKilled poll).

### CronCreate (`CronCreateTool.ts:56-157`)

`MAX_JOBS = 50` cap (`:25`). Schema:

- `cron`: standard 5-field cron in local time, "M H DoM Mon DoW" — explicit "(e.g. \"_/5 _ \* \* _\" = every 5 minutes, \"30 14 28 2 _\" = Feb 28 at 2:30pm local once)" in the description (`:31-33`).
- `prompt`: the prompt to enqueue at fire time (`:34`).
- `recurring`: defaults to `true` — `false` = one-shot, auto-delete after firing (`:35-37`).
- `durable`: defaults to `false` — `true` persists to `.claude/scheduled_tasks.json`, surviving restarts (`:38-40`).

Validation (`:82-115`):

1. `parseCronExpression()` rejects malformed input.
2. `nextCronRunMs()` returns null if the expression matches no calendar date in the next year — refused.
3. `tasks.length >= MAX_JOBS` → refuse with "Cancel one first."
4. **Teammates cannot create durable crons** (`:107-113`): "teammates do not persist across sessions" so a durable teammate cron would orphan on restart with `agentId` pointing to a nonexistent teammate.

`call()` at `:117-142`: kill switch forces `effectiveDurable = durable && isDurableCronEnabled()` (note `isDurableCronEnabled()` at `prompt.ts:56-62` is _narrower_ than the master gate — flipping it off forces `durable: false` at call site without disabling the whole scheduler). `addCronTask()` returns the job ID. `setScheduledTasksEnabled(true)` enables the polling loop (the comment at `:128-132` notes the `useScheduledTasks` hook polls this flag and starts watching on the next tick).

The result message at `:143-154` differentiates: recurring jobs report "Auto-expires after ${DEFAULT_MAX_AGE_DAYS} days" (`DEFAULT_MAX_AGE_DAYS` comes from `DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs / (24*60*60*1000)` at `prompt.ts:8-9`); one-shot reports "fire once then auto-delete".

### CronDelete (`CronDeleteTool.ts:35-95`)

Trivial schema (`id` only). Validation includes a permission check: **teammates may only delete their own crons** (`:73-79`): `if (ctx && task.agentId !== ctx.agentId)` → refuse "owned by another agent".

### CronList (`CronListTool.ts:37-97`)

Empty input. `isReadOnly() = true`, `isConcurrencySafe() = true`. Filters: teammates see only their own crons; the team lead (no `getTeammateContext()`) sees all (`:65-69`). Output formats each job as `${id} — ${humanSchedule} (recurring|one-shot)${[session-only]}: ${truncated prompt}`.

### The cron prompt (`ScheduleCronTool/prompt.ts:74-120`)

This prompt has the most thoughtful jitter advice I've seen in any tool. Three paragraphs:

1. One-shot mechanics with concrete examples ("remind me at 2:30pm today" → `"30 14 <today_dom> <today_month> *", recurring: false`).
2. Recurring mechanics (`*/5 * * * *`, `0 9 * * 1-5`).
3. **"Avoid the :00 and :30 minute marks when the task allows it"** (`prompt.ts:103-110`): "Every user who asks for '9am' gets `0 9`, and every user who asks for 'hourly' gets `0 *` — which means requests from across the planet land on the API at the same instant." Explicit guidance: "every morning around 9" → "57 8 \* \* _" or "3 9 _ \* _", "hourly" → "7 _ \* \* \*".

Runtime behavior at `prompt.ts:114-118`: "Jobs only fire while the REPL is idle (not mid-query)." The scheduler adds deterministic jitter — recurring up to 10% late (max 15min); one-shot at :00/:30 fire up to 90s early. Recurring tasks auto-expire after `DEFAULT_MAX_AGE_DAYS` (28 days at default config).

UI at `UI.tsx:11-57` is minimal: simple `MessageResponse` with the job ID bold and human schedule dim. Nothing fancy — the model gets explicit feedback that scheduling worked.

**Port priority for AGI Workforce CLI: MEDIUM-HIGH.** Our CLI has hooks but no scheduler. The dual-gate (master kill-switch + narrower durability flag), the teammate-ownership semantics, and the cross-fleet jitter rationale are gold. We'd lose the GrowthBook coupling and just keep the env-var override.

---

## 4. RemoteTriggerTool — remote agent triggers via CCR API (`tools/RemoteTriggerTool/*`, 3 files, 9 KB)

`RemoteTriggerTool/RemoteTriggerTool.ts:46-161`. Wraps the claude.ai CCR (Claude Cloud Runner) `/v1/code/triggers` REST API for managing scheduled remote agents (Claude Code on the cloud, not local). Five actions: `list`, `get`, `create`, `update`, `run` (`:20`).

Auth flow (`:79-89`): `checkAndRefreshOAuthTokenIfNeeded()` to refresh if expired, `getClaudeAIOAuthTokens()?.accessToken` — throws "Not authenticated with a claude.ai account. Run /login and try again." if missing. `getOrganizationUUID()` for the workspace.

URL construction (`:91-98`): `${getOauthConfig().BASE_API_URL}/v1/code/triggers` plus the action-specific suffix. Headers include `'anthropic-version': '2023-06-01'` and `'anthropic-beta': 'ccr-triggers-2026-01-30'` (`:44, :96`) — that beta header dates the feature.

Action dispatch (`:104-133`): switch on action, build method/url/data. `validateStatus: () => true` (`:142`) — let the model see HTTP error responses rather than throwing. Result is `HTTP ${status}\n${json}` (`:152-158`) — opaque pass-through to the model.

`isEnabled()` at `:57-62` requires both `tengu_surreal_dali` GrowthBook flag AND `isPolicyAllowed('allow_remote_sessions')` — double gate.

The prompt at `prompt.ts:6-15` is short: "Call the claude.ai remote-trigger API. Use this instead of curl — the OAuth token is added automatically in-process and never exposed." It explicitly steers Claude away from shell-based curl, which would expose the token to the shell process.

UI at `UI.tsx:6-16`: "list/get/create/update/run [trigger_id]" for tool use; result shows "HTTP {status} ({lines} lines)".

**Port priority for AGI Workforce CLI: LOW (for now).** This presupposes a CCR-equivalent backend. We don't have one. Deferred until we ship our own remote-agent runner — at which point the auth-in-process pattern (token never reaches the shell) is the principle to copy.

---

## 5. Team concept: `TeamCreate`, `TeamDelete`, `SendMessage` (`tools/TeamCreateTool/*`, `tools/TeamDeleteTool/*`, `tools/SendMessageTool/*`, 4+4+4 files)

The team concept is **explicit** in the codebase: a Team has a name, a leader, members, mailboxes, and a 1:1-correspondence task list. This is far more than "spawn parallel subagents" — it's a persistent multi-agent unit with disk-backed state.

### TeamCreate (`TeamCreateTool.ts:74-240`)

Schema (`:37-49`): `team_name` (required), `description` (optional), `agent_type` (optional, defaults to `TEAM_LEAD_NAME`).

Key invariant at `:133-141`: **one team per leader**. If `appState.teamContext?.teamName` is already set, throw — "A leader can only manage one team at a time. Use TeamDelete to end the current team before creating a new one."

Name conflict resolution (`:64-72, :143`): if a team file already exists at `getTeamFilePath(name)`, generate a fresh `generateWordSlug()` rather than fail. Lead model resolution (`:149-153`) parses the leader's current model from AppState (handles session model, settings, CLI override).

The TeamFile schema at `:157-175` includes:

- `name`, `description`, `createdAt`, `leadAgentId`, `leadSessionId` (for team discovery — actual session ID, not derived).
- `members[]`: each with `agentId` (deterministic = `formatAgentId(name, teamName)`), `name` (human-readable), `agentType`, `model`, `joinedAt`, `tmuxPaneId`, `cwd`, `subscriptions`.

After write, three more side effects:

1. `registerTeamForSessionCleanup()` (`:180-181`): track for session-end cleanup. Comment at `:178-179` flags "teams were left on disk forever unless explicitly TeamDelete'd (gh-32730)".
2. `resetTaskList()` + `ensureTasksDir()` (`:184-186`): **Team = TaskList** (the prompt at `prompt.ts:24` says "Teams have a 1:1 correspondence with task lists"). Task numbering starts fresh at 1 for each new swarm.
3. `setLeaderTeamName(sanitizeName(finalTeamName))` (`:189-191`): without this, the leader falls through to `getSessionId()` and writes tasks to a different directory than tmux/iTerm2 teammates expect.

`appState.teamContext` is set with the lead as the only initial teammate, with a `color` from `assignTeammateColor(leadAgentId)` (`:204`).

A subtle non-mutation at `:223-228`: **the team lead does not get `CLAUDE_CODE_AGENT_ID` set** in process.env. Three reasons in the comment: (1) the lead is not a "teammate" — `isTeammate()` should return false; (2) their ID is deterministic and derivable; (3) setting it would break inbox polling because `isTeammate()` is the gate for switching to teammate mode.

### TeamDelete (`TeamDeleteTool.ts:32-139`)

Empty input. Reads the current team from `appState.teamContext?.teamName`, then guards on **active members** at `:80-99`: filter out the lead, filter out members with `isActive === false` (idle/dead). If any active members remain, refuse: "Cannot cleanup team with N active member(s): ${names}. Use requestShutdown to gracefully terminate teammates first."

If clear, `cleanupTeamDirectories()` removes both `~/.claude/teams/{name}/` and `~/.claude/tasks/{name}/` (`:101`); `unregisterTeamForSessionCleanup()` (`:102-103`); `clearTeammateColors()`; `clearLeaderTeamName()` so `getTaskListId()` falls back to session ID. App state's `teamContext` and `inbox.messages` are both cleared (`:117-124`).

Both tools are gated by `isAgentSwarmsEnabled()` at `TeamCreateTool.ts:88-90` and `TeamDeleteTool.ts:46-48`.

### SendMessage (`SendMessageTool.ts:520-917`, 27 KB)

The biggest tool in the rest-of-tools set. Five message types via `StructuredMessage` discriminated union at `:46-65`:

- Plain `string`
- `shutdown_request` with optional `reason`
- `shutdown_response` with `request_id`, `approve`, `reason`
- `plan_approval_response` with `request_id`, `approve`, `feedback`

The `to` field is documented as `'researcher' | '*' | 'uds:<path>' | 'bridge:<session>'` (`:73-74`) — bridge addresses are gated by `feature('UDS_INBOX')`, which is the cross-machine Remote Control feature.

**Routing logic** (`:741-913`) in priority order:

1. **UDS/bridge cross-session** (`:742-797`): if `addr.scheme === 'bridge'`, re-check the bridge handle (the original `validateInput` check is stale after `checkPermissions` may have blocked for minutes), then `postInterClaudeMessage()`. If `addr.scheme === 'uds'`, `sendToUdsSocket()`. The cross-machine bridge has a `behavior: 'ask'` at `:587-600` with `decisionReason.type = 'safetyCheck'` and `classifierApprovable: false` — **bypass-immune**, even auto-mode allowlist + classifier cannot consent. Comment at `:593-598`: "Cross-machine prompt injection must stay bypass-immune."

2. **In-process subagent direct routing** (`:802-874`): if there's a registered agent name or a format-matching raw `agentId`, route to that subagent's task. If running, `queuePendingMessage()`. If stopped, **auto-resume from disk transcript** via `resumeAgentBackground()` (`:822-844`). If task evicted from state but agentId is registered, also try to resume from transcript (`:846-872`).

3. **Plain string** → `handleMessage()` (`:149-189`) writes to recipient's mailbox via `writeToMailbox()` with `from`, `text`, `summary`, timestamp, and sender color. The mailbox file is the cross-process IPC.

4. **Broadcast** (`:191-266`) → write to every team member's mailbox except the sender's.

5. **Structured messages** dispatch to handlers:
   - `shutdown_request` → `handleShutdownRequest()` (`:268-303`): generates `requestId`, writes to target's mailbox.
   - `shutdown_response` (`:305-432`): if approve, write to lead's mailbox AND **abort own task** via `task.abortController.abort()`. For non-`in-process` backends, schedule `gracefulShutdown(0, 'other')` via `setImmediate`. If reject, just message back with the reason.
   - `plan_approval_response` (`:434-518`): leader-only (`if (!isTeamLead(...)) throw`), inherits the leader's permission mode (clamped to `'default'` if leader is in `'plan'` mode at `:448-449`).

The prompt at `SendMessageTool/prompt.ts:5-49` is unusually pragmatic: "Your plain text output is NOT visible to other agents — to communicate, you MUST call this tool. Messages from teammates are delivered automatically; you don't check an inbox. Refer to teammates by name, never by UUID. When relaying, don't quote the original — it's already rendered to the user." That last line addresses the LLM's natural tendency to echo received messages back into the user's display.

UI at `SendMessageTool/UI.tsx` (4.6 KB — not paginated above; presumed to render the routing/sender/target/summary).

**Port priority for AGI Workforce CLI: MEDIUM (TeamCreate/TeamDelete) + HIGH (SendMessage simple paths) + DEFER (UDS/bridge cross-session).** The Team concept is more than we need at v1 (we only ship a single-agent CLI), but SendMessage's plain-text/broadcast paths plus `auto-resume` semantics for stopped subagents are valuable for the in-process subagent case we _are_ shipping.

---

## 6. TodoWrite (V1) vs Task* (V2): two checklist generations (`tools/TodoWriteTool/*`3 files,`tools/TaskCreateTool/_ TaskUpdateTool/_ TaskListTool/_ TaskGetTool/_ TaskOutputTool/_ TaskStopTool/_`, 17 files total)

Anthropic shipped two parallel checklist systems and never deleted the V1. **They are mutually exclusive at runtime** via `isTodoV2Enabled()` — TodoWrite is `isEnabled() = !isTodoV2Enabled()` (`TodoWriteTool.ts:52-54`); Task\* tools are `isEnabled() = isTodoV2Enabled()` (`TaskCreateTool.ts:68-70`, etc.). This is rare — most tool deprecations cut over.

### V1: TodoWriteTool (`TodoWriteTool.ts:31-115`)

Single batch-write tool. Schema (`:13-17`): `todos: TodoListSchema()` — the entire updated list goes in. Output (`:20-26`): `oldTodos`, `newTodos`, `verificationNudgeNeeded`.

Behavior (`:65-103`): the call replaces the per-`todoKey` (= `agentId ?? sessionId`) todos atomically. **Special case**: if `allDone === true`, set `newTodos = []` (empty list) — clears the displayed checklist.

The **verification nudge** at `:78-86` is structural: if (a) `VERIFICATION_AGENT` feature flag, (b) `tengu_hive_evidence` GB, (c) main thread (not subagent), (d) `allDone`, (e) `todos.length >= 3`, (f) no todo content matched `/verif/i`, set `verificationNudgeNeeded = true`. The nudge text at `:104-114` injects: "Before writing your final summary, spawn the verification agent (subagent_type=\"${VERIFICATION_AGENT_TYPE}\"). You cannot self-assign PARTIAL by listing caveats in your summary — only the verifier issues a verdict."

The prompt at `TodoWriteTool/prompt.ts:3-181` is the longest single tool prompt in the rest-of-tools set: 4 detailed examples of when to use, 4 detailed examples of when NOT to, status workflow, completion requirements with explicit "Never mark a task as completed if: Tests are failing / Implementation is partial / You encountered unresolved errors / You couldn't find necessary files or dependencies."

### V2: Task family (6 tools)

Per-task CRUD + lifecycle:

- **TaskCreateTool** (`TaskCreateTool.ts:48-138`): single-task create. Hooks fire at `:93-108` — `executeTaskCreatedHooks()` is an async generator yielding hook results; if any has `blockingError`, **delete the just-created task** at `:111-112` and throw. The auto-expand at `:116-119` sets `appState.expandedView = 'tasks'`.

- **TaskUpdateTool** (`TaskUpdateTool.ts:88-406`, 12 KB): the most complex of the V2 family. Schema accepts `taskId`, `subject`, `description`, `activeForm`, `status` (extended to allow `'deleted'`), `addBlocks`, `addBlockedBy`, `owner`, `metadata`. Logic at `:160-211`: per-field diff detection — only push to `updatedFields` and update if value differs from existing.
  - **Auto-set owner** at `:188-199`: if a teammate marks `in_progress` without explicit owner, infer from `getAgentName()`. This makes TaskList show activity status correctly.
  - **Metadata merging** at `:200-211`: existing metadata is shallow-merged; `null` keys delete (rare and useful).
  - **Status transitions** at `:212-269`: `'deleted'` short-circuits to `deleteTask()` and returns; other transitions run `executeTaskCompletedHooks()` if going to `completed` and abort if any hook returns `blockingError`.
  - **Owner notification** at `:277-298`: if `updates.owner` set, write a structured `task_assignment` JSON to the new owner's mailbox.
  - **Block/blockedBy** at `:301-323`: only add new entries (filter out existing).

- **TaskListTool** (`TaskListTool.ts:33-117`): empty input, returns array. Filters out tasks with `metadata._internal`. **Critical**: `blockedBy` is filtered to only show open (not-completed) blockers (`:73-83`). Output format: `#${id} [${status}] ${subject}${owner}${blocked}`.

- **TaskGetTool** (`TaskGetTool.ts:38-128`): single fetch by ID. Nullable result schema. Output includes `blocks` and `blockedBy` arrays alongside the basics.

- **TaskOutputTool** (`TaskOutputTool.tsx:144-352`, 66 KB inc. UI): retrieves output from a _running or completed_ background task. **Aliases for backward compat**: `'AgentOutputTool'`, `'BashOutputTool'` (`:150`). Three task types: `local_bash` (LocalShellTaskState), `local_agent` (LocalAgentTaskState), `remote_agent` (RemoteAgentTaskState). Schema includes `block: boolean` (default true — wait for completion) and `timeout: 30s default, max 600s`. **Description marks itself deprecated** (`:158`): "[Deprecated] — prefer Read on the task output file path". The UI components at `:353-onward` render bash output via `BashToolResultMessage`, agent output via `AgentResponseDisplay`, remote-agent output via plain text.

- **TaskStopTool** (`TaskStopTool.ts:39-131`): kills a running background task. **Aliased to `'KillShell'`** for backward compat with deprecated KillShell tool. Schema accepts both `task_id` and the deprecated `shell_id`. Validates task is running (`:74-89`), refuses if it's already completed/failed/stopped. Calls `stopTask()` from `tasks/stopTask.js`.

The TaskUpdate prompt at `TaskUpdateTool/prompt.ts:1-77` is shorter than TodoWrite's because it's per-task, but includes JSON examples for marking in-progress/completed/deleted/owner-claim/dependency-setup.

**Port priority for AGI Workforce CLI: MEDIUM-HIGH for V2, LOW for V1.** V2's per-task model + the `_internal` metadata filter + the `blockedBy`-only-shows-open semantic + hook integration is the better foundation. V1 is fine for non-agent-swarm use cases but the deprecation path is clear: ship V2.

---

## 7. SleepTool — model-callable wait (`tools/SleepTool/prompt.ts`, 1 file, 0.8 KB)

Just a prompt — the actual implementation lives elsewhere. `SLEEP_TOOL_NAME = 'Sleep'` (`prompt.ts:3`), `DESCRIPTION = 'Wait for a specified duration'` (`prompt.ts:5`).

The prompt at `prompt.ts:7-17` has four nuggets:

1. "The user can interrupt the sleep at any time."
2. **Tick prompts**: "You may receive `<${TICK_TAG}>` prompts — these are periodic check-ins. Look for useful work to do before sleeping." Tick prompts come from the cron scheduler at fire time — the design lets the model decide whether to actually sleep through them or use the wake-up to do something.
3. "You can call this concurrently with other tools — it won't interfere with them." This is the only tool I've seen explicitly documented as concurrency-safe-and-idle.
4. **Cost trade-off**: "Each wake-up costs an API call, but the prompt cache expires after 5 minutes of inactivity — balance accordingly." This teaches the model the cache-eviction window.

Final line: "Prefer this over `Bash(sleep ...)` — it doesn't hold a shell process."

**Port priority for AGI Workforce CLI: HIGH if we ship the cron scheduler.** Sleep is the natural pairing with cron — without it, the model spawns shell sleeps that hold processes. The tick-prompt protocol is also clean; we'd implement it as periodic notifications during a Sleep call.

---

## 8. SyntheticOutputTool — LLM-as-validator final-output (`tools/SyntheticOutputTool/SyntheticOutputTool.ts`, 1 file, 5.5 KB)

`SYNTHETIC_OUTPUT_TOOL_NAME = 'StructuredOutput'` (`SyntheticOutputTool.ts:20`) — the rare case where the file/dir name and the tool name disagree (file says "Synthetic", model sees "Structured").

`isSyntheticOutputToolEnabled()` at `:22-26` requires `isNonInteractiveSession === true` — only the SDK/CLI non-interactive path. Built-in `inputSchema` is `z.object({}).passthrough()` (`:11`) because the schema is **dynamically provided per call** via `createSyntheticOutputTool(jsonSchema)` (`:116-125`).

The factory at `:127-163` uses `Ajv` with `allErrors: true` to compile an arbitrary JSON Schema, then wraps the base tool with: (a) `inputJSONSchema = jsonSchema as ToolInputJSONSchema` so the SDK exposes it to the model, (b) a custom `call()` at `:142-157` that re-validates the input via `validateSchema()` and throws a `TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` (yes, that's the real type name) with detailed Ajv error paths if the input doesn't match.

**Caching at `:107-110`**: `WeakMap<object, CreateResult>` — workflow scripts call `agent({schema: BUGS_SCHEMA})` 30-80 times per run with the same schema _reference_. Without caching, each call does `new Ajv() + validateSchema() + compile()` (~1.4ms of JIT codegen). The comment claims 80-call workflows go from ~110ms to ~4ms Ajv overhead with the WeakMap.

The prompt at `:50-52` is one sentence: "Use this tool to return your final response in the requested structured format. You MUST call this tool exactly once at the end of your response to provide the structured output."

Behaviorally, this is **the standard "structured output" pattern** done as a tool: instead of a JSON-mode toggle, every non-interactive session that requests structured output ends with the model calling `StructuredOutput` exactly once.

**Port priority for AGI Workforce CLI: HIGH for SDK use cases.** Our Rust CLI doesn't have an SDK like Python/TypeScript, but the TypeScript packages do. This is a clean pattern for `agentic-loop` and verifier subagents. The WeakMap caching is the implementation detail to copy verbatim.

---

## 9. REPLTool aggregator — primitives hidden behind a REPL (`tools/REPLTool/constants.ts`, `tools/REPLTool/primitiveTools.ts`, 2 files, 3.3 KB)

Not a tool itself — these files **define which primitive tools are hidden** when REPL mode is on, plus the lazy getter that returns the primitive tools in the order the REPL VM expects.

`REPL_TOOL_NAME = 'REPL'` (`constants.ts:11`).

`isReplModeEnabled()` at `constants.ts:23-30`: respects `CLAUDE_CODE_REPL=0` (false), `CLAUDE_REPL_MODE=1` (true), and otherwise defaults true for `USER_TYPE === 'ant' && CLAUDE_CODE_ENTRYPOINT === 'cli'` — REPL mode is **default-on for Anthropic engineers in the interactive CLI** (the comment at `:18-22` says "SDK consumers script direct tool calls (Bash, Read, etc.) and REPL mode hides those tools. USER_TYPE is a build-time --define, so the ant-native binary would otherwise force REPL mode on every SDK subprocess regardless of the env the caller passes.").

`REPL_ONLY_TOOLS` at `constants.ts:37-46` is a `Set` of 8 tool names: `FileRead`, `FileWrite`, `FileEdit`, `Glob`, `Grep`, `Bash`, `NotebookEdit`, `Agent`. These get hidden from the model when REPL is on, forcing it to call them through the REPL execution context (so the REPL can batch / classify / log them differently).

`getReplPrimitiveTools()` at `primitiveTools.ts:28-39` is a lazy getter (per the comment at `:21-25`, top-level const hits TDZ via the import chain). Returns the 8 actual `Tool` instances. **Referenced directly rather than via `getAllBaseTools()`** (`:25-26`) because that excludes Glob/Grep when `hasEmbeddedSearchTools()` is true — REPL needs them regardless.

**Port priority for AGI Workforce CLI: LOW.** Our CLI is Rust-based and doesn't run a REPL VM with `vm.runInContext`-style execution. The pattern of "hide primitives behind a single batch-execution gate" is interesting for SDK use cases, but doesn't translate to our architecture.

---

## 10. yoga-layout/index.ts (2,578 LOC) — Pure TypeScript Yoga port (`native-ts/yoga-layout/index.ts` + `enums.ts`)

**The big one.** 83 KB of TypeScript reimplementing Meta's Yoga flexbox engine. The header comment at `index.ts:1-39` is the most useful single block — it documents what's in (and out of) the port:

In:

- `flex-direction` (row/column + reverse)
- `flex-grow`/`flex-shrink`/`flex-basis`
- `align-items`/`align-self` (stretch, flex-start, center, flex-end, baseline)
- `justify-content` (all six values)
- `margin`/`padding`/`border`/`gap`
- `width`/`height`/`min`/`max` (point, percent, auto)
- `position: relative | absolute`
- `display: flex | none | contents`
- Measure functions for text nodes
- Multi-pass flex clamping when children hit min/max
- `margin: auto` (main + cross axis, overrides justify/align)
- `flex-wrap: wrap | wrap-reverse` + `align-content`
- `display: contents` (children lifted to grandparent, box removed)

Out:

- `aspect-ratio`
- `box-sizing: content-box`
- RTL direction (Ink always passes `Direction.LTR`)

The enums at `enums.ts:1-135` are kept as **`const` objects, not TS enums** ("per repo convention"). Values match upstream exactly so callers don't change. 16 enums total: `Align`, `BoxSizing`, `Dimension`, `Direction`, `Display`, `Edge`, `Errata`, `ExperimentalFeature`, `FlexDirection`, `Gutter`, `Justify`, `MeasureMode`, `Overflow`, `PositionType`, `Unit`, `Wrap`.

### Architecture

The single 2,578-line file contains:

- **Style**, **Layout**, **Value** types (`index.ts:120-165`).
- `defaultStyle()` factory (`:167-194`).
- Edge resolution (`:204-307`) — yoga's 9-edge model (Left, Top, Right, Bottom, Start, End, Horizontal, Vertical, All) collapsed to 4 physical edges, with precedence: specific > horizontal/vertical > all.
- `resolveEdges4Into()` at `:269-307` is the **hot-path optimization**: resolves all 4 physical edges in one pass, writing into a pre-allocated 4-array. Hoists the shared fallback lookups once.
- `class Node` (`:403-onward`, ~1,800 lines): the core type. ~80 setter/getter methods, mostly simple delegates to `style.*` with `markDirty()` calls. Plus the heavy machinery: `computeFlexBasis`, `layoutNode`, `calculateLayout`, baseline alignment, pixel-grid rounding.

### Performance optimizations

Five distinct caching layers, all benchmarked:

1. **Per-node fast-path flags** (`:421-433`): `_hasAutoMargin`, `_hasPosition`, `_hasPadding`, `_hasBorder`, `_hasMargin` — booleans maintained by style setters that let layoutNode skip resolveEdge calls when the array is all-Undefined. Comment at `:421-431`: "1000-node bench, ~67% of those calls operate on all-undefined edge arrays (most nodes have no border; only cols have padding; only leaf cells have margin) — a single-branch skip beats ~20 property reads + ~15 compares + 4 writes of zeros."

2. **Dirty-flag layout cache, two slots** (`:434-466`): `_hasL` + `_hasM` for layout vs measure, each storing 8 inputs (aW, aH, wM, hM, oW, oH, fW, fH) and 2 outputs (w, h). Two slots because each node typically sees a measure call followed by a layout call with different inputs — single slot thrashes. Re-layout bench (dirty one leaf, recompute root) went 2.7× → 1.1× with this.

3. **Cached computeFlexBasis** (`:468-486`): for clean children, basis only depends on container's inner dimensions. The cache is generation-gated (`_fbGen`) instead of `isDirty_`: fresh-mounted items in a virtual scroll have isDirty=true on first compute (cache miss is correct) but stay isDirty until the next markDirty cycle. Generation gating lets fresh mounts cache-hit after first compute: 105k visits → ~10k.

4. **Multi-entry layout cache, 4 slots** (`:486-496`): packed `Float64Array`s `_cIn` (8 × 4 entries) and `_cOut` (2 × 4 entries) to avoid per-entry object allocs. Upstream yoga uses 16 slots; 4 covers Ink's dirty-chain depth.

5. **Pixel-grid rounding** at `:2435-2506` matches upstream `YGRoundValueToPixelGrid`: text nodes (with `measureFunc`) floor positions so wrapped text never starts past its allocated column; widths use ceil-if-fractional to avoid clipping the last glyph; non-text nodes use standard round. Comment at `:2451-2456`: "Without this, justify center/space-evenly positions are off-by-one vs WASM and flex-shrink overflow places siblings at the wrong column."

### Correctness annotations

The file is heavily commented with bug-hunt history. A few highlights:

- **Infinity dimensions** at `:2511-2526`: `parseDimension` treats `NaN`/`±Infinity` as undefined because Ink passes `height={Infinity}` (e.g., LogSelector maxHeight default) and expects "unconstrained." Storing it as a literal point value would make node height Infinity and break all downstream layout.
- **zeroLayoutRecursive on hide/unhide** at `:2386-2404`: when a node hides, its children get zeroed — but without invalidating their `_hasL` cache, on unhide they restore stale layout from the cache and grandchildren stay invisible. The fix: `c.isDirty_ = true; c._hasL = false; c._hasM = false`.
- **display: contents** (`:2419-2426`): nested `display:contents` lifts all the way up through `collectLayoutChildren` recursion. The contents node's own margin/padding/position/dimensions are ignored.
- **calculateBaseline** (`:2304-2321`): leaf nodes use their own height; containers recurse into the first baseline-aligned child on the first line, returning `child.baseline + child.top`. Per CSS Flexbox §8.5.

### Public API (`:2548-2578`)

Mirrors `yoga-layout/load`:

```ts
type Yoga = {
  Config: { create(): Config; destroy(c: Config): void }
  Node:   { create(c?: Config): Node; createDefault(): Node; createWithConfig(c: Config): Node; destroy(n: Node): void }
}
loadYoga(): Promise<Yoga>           // Returns the singleton
export default YOGA_INSTANCE        // Default export same singleton
```

`destroy()` is a no-op for both Config and Node — JS GC handles it. `_yogaLiveNodes` (`:514`) is decremented in `free()` for leak-detection telemetry.

**Port priority for AGI Workforce CLI: HIGH if we ship a Rust TUI.** This is the single most valuable piece of code in the entire reference dump for terminal UI. Our Ratatui TUI in `apps/cli/src/tui` does not currently use a flexbox engine — it composes via Ratatui's constraint API. Porting yoga to Rust (or wrapping the WASM yoga build) would let us match Ink's layout fidelity. The native-ts port is the **algorithm reference** — we don't need to reimplement the cache machinery on day one, but the edge-resolution + flex-basis-clamping logic is the load-bearing math.

---

## 11. native-ts/color-diff (1 file, 30 KB) and native-ts/file-index (1 file, 12 KB)

Both are pure-TypeScript ports of native Rust NAPI modules.

### color-diff (`native-ts/color-diff/index.ts:1-onward`)

Header comment at `:1-18`: "Pure TypeScript port of vendor/color-diff-src. The Rust version uses syntect+bat for syntax highlighting and the similar crate for word diffing. This port uses highlight.js (already a dep via cli-highlight) and the diff npm package's diffArrays. API matches vendor/color-diff-src/index.d.ts exactly so callers don't change."

Two acknowledged semantic differences from native:

1. **Syntax highlighting**: highlight.js's grammar has gaps — plain identifiers and operators like `=` `:` aren't scoped, so they render in default fg instead of white/pink. Output structure (line numbers, markers, backgrounds, word-diff) is identical.
2. **`BAT_THEME` env support is a stub**: `getSyntaxTheme` always returns the default for the given Claude theme.

**Lazy hljs require** at `:25-43`: highlight.js's full bundle registers 190+ language grammars at require time (~50MB, 100-200ms on macOS, several× on Windows). Top-level import would force every importer to pay that cost at module-eval. The lazy `cachedHljs` memoization gates loading to first call. PR #24150 reference indicates Windows CI was hitting GC-pause territory before this fix.

Also exports `Hunk`, `SyntaxTheme`, `NativeModule` types. Internals: `Color`, `Style`, `Block`, `ColorMode` (truecolor/256/ansi). `RESET = '\x1b[0m'`.

### file-index (`native-ts/file-index/index.ts:1-onward`)

Header at `:1-16`: "Pure-TypeScript port of vendor/file-index-src (Rust NAPI module). The native module wraps nucleo (https://github.com/helix-editor/nucleo) for high-performance fuzzy file searching. Score semantics: lower = better. ... Paths containing 'test' get a 1.05× penalty (capped at 1.0) so non-test files rank slightly higher."

**fzf-v2/nucleo bonuses** at `:24-30`: `SCORE_MATCH=16`, `BONUS_BOUNDARY=8`, `BONUS_CAMEL=6`, `BONUS_CONSECUTIVE=4`, `BONUS_FIRST_CHAR=8`, `PENALTY_GAP_START=3`, `PENALTY_GAP_EXTENSION=1`. Identical to fzf's published constants.

**Async incremental indexing** at `:83-onward` (`loadFromFileListAsync`): yields to event loop every ~8-12k paths so 270k+ file indexes don't block the main thread for >10ms. Returns `{ queryable, done }` — `queryable` resolves as soon as the first chunk is indexed (~5-10ms for 270k paths) so search returns partial results immediately while build continues. `CHUNK_MS = 4` (`:38-39`).

Internal storage: `paths: string[]`, `lowerPaths: string[]`, `charBits: Int32Array` (bitmap of which characters exist in each path for fast skip), `pathLens: Uint16Array`, `topLevelCache: SearchResult[]` for empty-query case. `MAX_QUERY_LEN = 64`. Single reusable `posBuf = new Int32Array(MAX_QUERY_LEN)` at `:41` to record needle char positions during indexOf scan.

**Port priority for AGI Workforce CLI: LOW.** Our Rust CLI uses the actual native crates (`nucleo` directly via Cargo). These ports exist for the bun-bundle TS distribution path, which is Anthropic's primary distribution form. We don't need them.

---

## 12. tools/shared (2 files, 44 KB)

`gitOperationTracking.ts` (9.5 KB): shell-agnostic git operation tracking for usage metrics. Detects `git commit`, `git push`, `gh pr create`, `glab mr create`, and curl-based PR creation in command strings via regex. Increments OTLP counters and fires analytics events. The `gitCmdRe()` helper at `:23-27` builds a regex tolerant of git's global options (`-c key=val`, `-C path`, `--git-dir=path`) between `git` and the subcommand — common when the model retries with `git -c commit.gpgsign=false commit` after signing failures.

The PR action regexes at `:45-52` cover six gh CLI verbs: `created`, `edited`, `merged`, `commented`, `closed`, `ready`. `parsePrUrl()` at `:58-69` extracts `prNumber`, `prUrl`, `prRepository` from any `https://github.com/owner/repo/pull/N` URL. `parseGitPushBranch()` at `:93-98` handles three line shapes from git push: `[new branch]`, `abc..def  branch -> branch`, `+ abc...def  branch -> branch (forced update)`.

`spawnMultiAgent.ts` (35.5 KB): shared spawn module for teammate creation. Extracted from TeammateTool to allow reuse by AgentTool. `resolveTeammateModel()` at `:93-101` handles the `'inherit'` alias from agent frontmatter (substitutes leader's model — without this, the literal string `'inherit'` was passed to `--model` flag, producing "It may not exist or you may not have access" per the gh-31069 comment).

Supports tmux backend, in-process backend, and a fallback chain via `detectAndGetBackend`. The `SpawnOutput` and `SpawnTeammateConfig` types at `:107-136` are the shared contract — every teammate spawn gets `agent_id`, `tmux_session_name`, `tmux_window_name`, `tmux_pane_id`, plus optional `team_name`, `is_splitpane`, `plan_mode_required`. `invokingRequestId` (`:131-135`) threads the request*id of the spawning API call through to `TeammateAgentContext` for lineage tracing on `tengu_api*\*` events.

---

## 13. tools/testing/TestingPermissionTool.tsx (1 file, 7.3 KB)

Test-only fixture — `isEnabled()` returns `"production" === 'test'` (`TestingPermissionTool.tsx:28`) which is always `false` in production builds. Always asks for permission via `behavior: 'ask'` with message `"Run test?"` (`:38-42`). Used for end-to-end testing of the permission dialog flow.

This is the simplest tool in the rest-of-tools set and the only one whose entire purpose is to fail closed.

---

## Cross-cutting findings

1. **Three-layer feature gating is consistent**: `feature(BUILD_FLAG)` for dead-code elimination + `getFeatureValue_*` for runtime GrowthBook + env override. Used in cron, RemoteTrigger, TodoWrite (V1 vs V2), SyntheticOutput, and the bridge feature.
2. **Mailbox is the IPC abstraction**: every cross-agent message — TeamCreate's task assignments, ExitPlanMode's leader-approval requests, SendMessage's plain text and structured types, TaskUpdate's owner notifications — writes to a per-recipient mailbox file. The schema is consistent: `from`, `text`, `summary?`, `timestamp`, `color?`. This is the disk-backed actor model.
3. **`shouldDefer: true` everywhere**: every tool in the rest-of-tools set sets this. The deferred-tool list is the announcement mechanism — these tools don't ship their schemas inline, instead the deferred list tells the model their names + descriptions, and the model fetches schemas only on first call. This is the same pattern as `ToolSearch` does for me.
4. **System-prompt cache invalidation is load-bearing**: EnterWorktree's `clearSystemPromptSections()` (`EnterWorktreeTool.ts:99`) and `clearMemoryFileCaches()` (`:101`) are not optional — without them, the system prompt's `env_info_simple` block stays stale and the model sees the wrong cwd/git state.
5. **Defensive null-fallback patterns**: ExitWorktree's `countWorktreeChanges` returning null on git failure, and the caller treating null as fail-closed at `ExitWorktreeTool.ts:195-200` — the comment at `:67-78` calls this "fail-closed (null is unknown, assume unsafe)" and the principle generalizes.
6. **One-team-per-leader, one-task-list-per-team**: TeamCreate enforces 1:1 between teams and task lists at `TeamCreateTool.ts:184-191`. Mixing tasks across teams was rejected as a design choice — `setLeaderTeamName(sanitizeName(finalTeamName))` makes `getTaskListId()` return the team name for the leader, so the leader and tmux teammates write to the same disk dir.
7. **The two checklist generations coexist**: TodoWriteTool (V1) and Task\* (V2) are mutually exclusive at runtime via `isTodoV2Enabled()`. V2 is the future; V1 stays for sessions/users that haven't migrated.
8. **Cross-machine bridge is bypass-immune**: SendMessage's bridge-target `decisionReason.type = 'safetyCheck'` with `classifierApprovable: false` is the rare "user must explicitly consent, no bypass" path. Cross-machine prompt injection cannot be auto-approved.

---

## Top-priority ports for AGI Workforce CLI

In rough order of value:

1. **EnterPlanMode + ExitPlanMode pair** — model-callable plan mode with disk-backed plan file, user-approval gate, post-approval attachment injection. Drop teammate complexity for v1.
2. **EnterWorktree + ExitWorktree pair** — git worktree lifecycle with system-prompt cache invalidation, fail-closed change detection, hook escape hatch for non-git VCS.
3. **yoga-layout port** — if we ship a Ratatui TUI with flex layout, this is the algorithm reference. Either rewrite into Rust or wrap WASM yoga.
4. **ScheduleCron + Sleep pair** — `tengu_kairos_cron`-equivalent scheduler with the off-minute jitter advice baked into the prompt. Sleep is the natural pairing for in-session waits.
5. **Task\* (V2) family** — per-task CRUD with hooks, owner notifications, blockedBy semantics, the `_internal` metadata filter, deletion-via-status-deleted, and the verification-agent nudge structure.
6. **SyntheticOutput pattern** — for SDK structured output. The WeakMap caching of compiled Ajv validators is the perf detail to copy.

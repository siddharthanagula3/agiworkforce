# Skills, Assistant, Buddy, Tasks — Reference Source Audit

Scope: `~/Desktop/reference/src/{skills,assistant,buddy,tasks}/` plus the surrounding cross-references (`Task.ts`, `tasks.ts`, `commands/{skills,tasks}/`, `tools/SkillTool/`, `tools/Task{Create,Update,Get,List,Stop,Output}Tool/`). All paths in this report are absolute under `~/Desktop/reference/src/` unless noted; line numbers reference the file as it exists on disk.

---

## 1. Skills System

### 1.1 Directory contents

```
skills/
  bundled/                    # 17 bundled skills (one per .ts module + index.ts)
  bundledSkills.ts            # registerBundledSkill() + safe file extraction
  loadSkillsDir.ts            # disk loader, deduper, conditional/dynamic discovery
  mcpSkillBuilders.ts         # leaf module that breaks an import cycle for MCP skills
```

### 1.2 File format

Skills on disk are **markdown files with YAML frontmatter** in the directory format `<skill-name>/SKILL.md`. Single `.md` files are explicitly **not** supported in `/skills/` directories (`loadSkillsDir.ts:425-428`); the legacy `/commands/` path supports both.

The full union of recognised frontmatter keys is declared in `utils/frontmatterParser.ts:10-59`:

| Key                        | Purpose                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `description`              | One-liner shown in the SkillTool listing. Falls back to first paragraph of body via `extractDescriptionFromMarkdown` (`loadSkillsDir.ts:213`).                |
| `when_to_use`              | Trigger hint surfaced to the model (`loadSkillsDir.ts:252`).                                                                                                  |
| `model`                    | Model alias (`'haiku'                                                                                                                                         | 'sonnet' | 'opus'`) or `'inherit'` (`loadSkillsDir.ts:221-226`). |
| `allowed-tools`            | Tools the skill is permitted to call (`loadSkillsDir.ts:242`).                                                                                                |
| `argument-hint`            | Display hint for slash-command args (`loadSkillsDir.ts:246`).                                                                                                 |
| `arguments`                | Named arg list parsed by `parseArgumentNames` (`loadSkillsDir.ts:250`).                                                                                       |
| `version`                  | Free-form version string (`loadSkillsDir.ts:253`).                                                                                                            |
| `disable-model-invocation` | Boolean — hides skill from Skill tool, leaving only user `/name` invocation (`loadSkillsDir.ts:255`).                                                         |
| `user-invocable`           | Boolean — `true` exposes `/skill-name`, `false` makes it model-only. Default differs by source (`loadSkillsDir.ts:216-219` and `frontmatterParser.ts:29-32`). |
| `hooks`                    | Inline hook config validated via `HooksSchema` (`loadSkillsDir.ts:142-152`).                                                                                  |
| `context`                  | `'inline'` (default — expand into the current conversation) or `'fork'` (run in a sub-agent). `loadSkillsDir.ts:260`.                                         |
| `agent`                    | When `context: fork`, the agent type to spawn (`loadSkillsDir.ts:261`).                                                                                       |
| `effort`                   | `low                                                                                                                                                          | medium   | high                                                  | max` or integer; thinking-effort knob (`loadSkillsDir.ts:228-235`). |
| `paths`                    | Comma- or YAML-list glob patterns; activates skill conditionally when matching files are touched (`loadSkillsDir.ts:159-178`).                                |
| `shell`                    | `'bash'` (default) or `'powershell'` for `!`...`` blocks in body (`loadSkillsDir.ts:263`).                                                                    |

There are **no required fields** at parse time — `parseSkillFrontmatterFields` (`loadSkillsDir.ts:185-265`) tolerates missing description/whenToUse and synthesizes a description from the markdown body.

### 1.3 Skill body

The body is treated as a **prompt template**. On invocation it is materialised by `getPromptForCommand` (`loadSkillsDir.ts:344-399`):

1. Prefixed with `Base directory for this skill: <dir>\n\n` so the model can `Read`/`Grep` sibling files.
2. `${CLAUDE_SKILL_DIR}` and `${CLAUDE_SESSION_ID}` are interpolated.
3. `argumentSubstitution.substituteArguments` injects positional/named args.
4. **Inline shell substitution** runs unless the skill came from MCP (security gate at `loadSkillsDir.ts:374-396`): `!`...``and ```` ```! ```` blocks execute via`executeShellCommandsInPrompt`, with the skill's `allowed-tools` injected as auto-allow rules.

The body is therefore **a prompt-with-templating, not behaviour code**. Tools-allowed list is a separate frontmatter field. There is no compiled "behavior" — execution semantics emerge entirely from how the model uses tools after the prompt expands.

### 1.4 Loader / discovery

The orchestrator is the memoised `getSkillDirCommands(cwd)` (`loadSkillsDir.ts:638-804`). It dispatches **five** parallel reads, each producing `SkillWithPath` records:

```
managedSkills        ← <managed>/.claude/skills        (policySettings)
userSkills           ← ~/.claude/skills                (userSettings)     loadSkillsDir.ts:640
projectSkillsNested  ← <cwd-up-to-home>/.claude/skills (projectSettings)  loadSkillsDir.ts:642
additionalSkillsNested ← --add-dir/.claude/skills      (projectSettings)
legacyCommands       ← /commands/ tree                 (deprecated)       loadSkillsDir.ts:566
```

`getSkillsPath(source, dir)` (`loadSkillsDir.ts:78-94`) is the canonical mapper — confirms paths exactly.

After collection, dedup is performed by `realpath` identity to handle symlinks and overlapping parents (`loadSkillsDir.ts:117-124, 728-763`). Skills with `paths` frontmatter are siphoned into a `conditionalSkills` map (`loadSkillsDir.ts:771-790`) and later activated via `activateConditionalSkillsForPaths` (`loadSkillsDir.ts:997-1058`) when the model touches a matching file (gitignore-style `ignore` lib).

`--bare` mode skips auto-discovery (`loadSkillsDir.ts:658-675`); explicit `--add-dir` paths still load. Two env switches gate further: `CLAUDE_CODE_DISABLE_POLICY_SKILLS` (`loadSkillsDir.ts:686`) and a settings-source lockdown (`isRestrictedToPluginOnly('skills')`).

Dynamic discovery: `discoverSkillDirsForPaths` (`loadSkillsDir.ts:861-915`) walks **up** from any file path the model touches toward `cwd` (exclusive), looking for `<dir>/.claude/skills`. Newly-found dirs are loaded by `addSkillDirectories` (`loadSkillsDir.ts:923-975`), which fires a `skillsLoaded` signal so command caches clear.

### 1.5 Discovery paths (concrete answer)

- `~/.claude/skills/` (user) — `getClaudeConfigHomeDir() + 'skills'` at `loadSkillsDir.ts:640`.
- `<cwd>/.claude/skills/` and every parent dir up to home (project) — `getProjectDirsUpToHome('skills', cwd)` at `loadSkillsDir.ts:642`.
- `<managed>/.claude/skills/` (org policy) — `getManagedFilePath() + '.claude/skills'` at `loadSkillsDir.ts:641`.
- `<add-dir>/.claude/skills/` (--add-dir) — `loadSkillsDir.ts:702`.
- Plugin-namespaced paths come through the plugin loader (not in this directory) but the source enum exists at `loadSkillsDir.ts:67-73`: `LoadedFrom = 'commands_DEPRECATED' | 'skills' | 'plugin' | 'managed' | 'bundled' | 'mcp'`.

### 1.6 Triggering — model decides via Skill tool

The `SkillTool` (`tools/SkillTool/SkillTool.ts:331-869`) is what the model calls. Discovery is **listing-driven, model-decided**: every available skill's name + truncated description appears in a system-reminder appended via `tools/SkillTool/prompt.ts:173-196` (the prompt explicitly tells the model: _"Available skills are listed in system-reminder messages in the conversation… When a skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response"_). There is **no harness-side regex** dispatch — the model alone decides.

The harness can also auto-activate path-conditional skills: when the model touches a file matching a skill's `paths` glob, the skill is moved from `conditionalSkills` into `dynamicSkills` (`loadSkillsDir.ts:1029-1041`) so it appears in the next turn's listing.

### 1.7 Composition

SkillTool is **idempotent within a session** (the model sees `<command-name>` system reminders and is told _"Do not invoke a skill that is already running"_ — `prompt.ts:192`). But there is no hard re-entrancy guard — a skill can call SkillTool inside a forked agent (`SkillTool.ts:162-164` distinguishes nested vs claude-proactive trigger). For `context: fork`, `executeForkedSkill` (`SkillTool.ts:122-289`) spawns a sub-agent via `runAgent`, with its own `agentId`, token budget, and message stream piped back through `onProgress` for UI rendering.

### 1.8 Plugin-namespaced skills (`plugin:skill`)

Yes — skills loaded from a plugin source carry `pluginInfo` and are included in `getAllCommands` (`SkillTool.ts:81-94`). Namespace formation is generic via `buildNamespace` (`loadSkillsDir.ts:523-534`), which joins parent path components with `:` so `<base>/foo/bar/SKILL.md` becomes `foo:bar`. Telemetry treats third-party plugins as `'third-party'` and official-marketplace plugins by repository name (`SkillTool.ts:935-942`).

### 1.9 Execution model

Two modes:

- **Inline (default)** — `SkillTool.ts:633-841`. The skill prompt is processed via `processPromptSlashCommand`, expanded into the conversation as `newMessages`, and a `contextModifier` injects `allowedTools`/`model`/`effort` into the running tool-use context.
- **Fork** — `SkillTool.ts:622-632 → executeForkedSkill`. Runs the skill body in a sub-agent isolated from the parent conversation; result is returned as a tool_result string.

### 1.10 Built-in (bundled) skills

Compiled into the binary via `registerBundledSkill` (`bundledSkills.ts:53-100`). Initialised at startup by `initBundledSkills()` (`skills/bundled/index.ts:24-79`):

| Always-on                       | Feature-gated                                           |
| ------------------------------- | ------------------------------------------------------- |
| `update-config`                 | `dream` (KAIROS / KAIROS_DREAM)                         |
| `keybindings-help`              | `hunter` (REVIEW_ARTIFACT)                              |
| `verify`                        | `loop` (AGENT_TRIGGERS)                                 |
| `debug`                         | `schedule` (AGENT_TRIGGERS_REMOTE)                      |
| `lorem-ipsum`                   | `claude-api` (BUILDING_CLAUDE_APPS)                     |
| `skillify`                      | `claude-in-chrome` (`shouldAutoEnableClaudeInChrome()`) |
| `remember` (USER_TYPE=ant only) | `runSkillGenerator` (RUN_SKILL_GENERATOR)               |
| `simplify`                      |                                                         |
| `batch`                         |                                                         |
| `stuck`                         |                                                         |

Confirmed names from the registration calls:

- `simplify` → `bundled/simplify.ts:57`
- `update-config` → `bundled/updateConfig.ts:447`
- `keybindings-help` → `bundled/keybindings.ts:294`
- `lorem-ipsum` → `bundled/loremIpsum.ts:240`
- `claude-api` → `bundled/claudeApi.ts:182`
- `claude-in-chrome` → `bundled/claudeInChrome.ts:18`
- `loop` → `bundled/loop.ts:76`
- `schedule` → `bundled/scheduleRemoteAgents.ts:326`
- `remember` → `bundled/remember.ts:65`
- `batch` → `bundled/batch.ts:102`
- `debug` → `bundled/debug.ts:14`
- `stuck` → `bundled/stuck.ts:67`
- `verify` → `bundled/verify.ts:18`
- `skillify` → `bundled/skillify.ts:164`

`skillify` is a meta-skill — _"Capture this session's repeatable process into a skill"_ (`bundled/skillify.ts:164-167`). Together with the `runSkillGenerator` feature flag, this is a **skill-authoring loop built into the harness**.

---

## 2. Assistant Directory

### 2.1 Contents

Single file: `assistant/sessionHistory.ts` (88 LOC).

### 2.2 What "assistant" is

**Not** a UI persona, memory subsystem, or agent class. It is a thin **HTTP client for Anthropic's hosted session-events API** (`assistant/sessionHistory.ts:31-87`). The base URL is `${BASE_API_URL}/v1/sessions/<session_id>/events` (line 36), authenticated with OAuth and the `anthropic-beta: ccr-byoc-2025-07-29` header (line 39). It returns `SDKMessage[]` pages of past session events, paginated by `before_id`/`anchor_to_latest`, with constants `HISTORY_PAGE_SIZE = 100`.

The label "assistant" comes from Anthropic's **server-side worker type**: `bridge/initReplBridge.ts:480-484` does `require('../assistant/index.js')` to call `isAssistantMode()`, and if true sets `workerType = 'claude_code_assistant'`. The `assistant/index.js` module is **not present in this snapshot** — it is referenced via runtime-resolved `require`, which suggests it is excluded from the open distribution (likely Anthropic-internal). Only the lone `sessionHistory.ts` ships.

### 2.3 Per-file purpose

- `sessionHistory.ts` — auth context builder (`createHistoryAuthCtx`, `:31-43`), latest-page fetch (`fetchLatestEvents`, `:73-78`), older-page fetch (`fetchOlderEvents`, `:81-87`). Used by `hooks/useAssistantHistory.ts:9-15` to back the REPL viewer-mode scrollback.

### 2.4 Integration

Strictly read-only paging of remote session events. No system-prompt injection, no tool registration, no personality config. The `useAssistantHistory` hook is gated on `viewerOnly` (`hooks/useAssistantHistory.ts:23`) — i.e., it activates when the CLI is opened as a session viewer for an existing remote session, not the normal authoring flow.

### 2.5 Personality / character

None. `assistant/` ≠ persona configuration.

---

## 3. Buddy Directory

### 3.1 Contents

```
buddy/
  companion.ts            3.7 KB   bones generation (rarity, species, eyes, hat, stats)
  CompanionSprite.tsx    45.9 KB   ASCII-art animated sprite with speech bubble
  prompt.ts               1.5 KB   companion intro attachment for the model
  sprites.ts              9.8 KB   per-species ASCII frames
  types.ts                3.8 KB   16 species, 5 stats, rarity table
  useBuddyNotification.tsx 9.8 KB  /buddy teaser hook + trigger detection
```

### 3.2 What "buddy" is

A **virtual-pet easter-egg companion** that lives next to the prompt input. Confirmed from:

- `prompt.ts:8-12` — _"A small ${species} named ${name} sits beside the user's input box and occasionally comments in a speech bubble."_
- `types.ts:54-73` — 18 species: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk.
- Rarity tiers: common 60%, uncommon 25%, rare 10%, epic 4%, legendary 1% (`types.ts:126-132`).
- Stat names: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK (`types.ts:91-97`).
- Hatching: `companion.ts:127-133` — bones regenerated from `hash(userId)` at every read so users can't edit config to fake a legendary; soul (name + personality) persists.

### 3.3 Per-file purpose

- `types.ts` — pure data types (rarity table, species list, hat list, eye glyphs `· ✦ × ◉ @ °`, rarity colours). Notable: species names are runtime-constructed via `String.fromCharCode` (`types.ts:14-52`) because _"One species name collides with a model-codename canary in excluded-strings.txt"_ — a build-output gate that greps for canaries. Clever defence against test bleed-through.
- `companion.ts` — Mulberry32 PRNG (`:16-25`), deterministic stat rolls bounded by rarity floors (`:53-82`), `roll(userId)` cached (`:106-113`), `getCompanion()` merges stored soul with regenerated bones (`:127-133`).
- `prompt.ts` — `companionIntroText(name, species)` returns the system-prompt blurb that tells the _real_ assistant to _"stay out of the way: respond in ONE line or less"_ when the user addresses the companion by name (`:11-12`). `getCompanionIntroAttachment` builds a one-shot `companion_intro` Message attachment, deduped per session (`:22-36`).
- `sprites.ts` — 5×12 ASCII frames per species, multiple frames for idle fidget (`:26-65`).
- `CompanionSprite.tsx` — Ink/React renderer; 500 ms tick, 20-tick speech-bubble window with 6-tick fade, idle sequence `[0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` (rare blink + fidget), `/buddy pet` triggers a 2.5 s heart burst (`:16-27`).
- `useBuddyNotification.tsx` — teaser window April 1–7, 2026 (`:13-16`); rainbow `/buddy` notification on startup (`:60-65`); `findBuddyTriggerPositions` regex `/\/buddy\b/g` for input highlighting (`:79-97`). Notable hard-coded gate `if ("external" === 'ant') return true` (`:14`) — this is `process.env.USER_TYPE` after Bun substitution; effectively "always live for Anthropic-internal users".

### 3.4 Relation to skills/assistant/agents

**None.** Buddy is a UI-only ornament. It generates a single attachment that becomes part of the system prompt to _suppress_ model engagement when addressed. There is no buddy-as-agent. It does not register tools, skills, or hooks. It uses `getCompanion()` from `companion.ts` and the `BUDDY` feature flag to gate visibility — every entry point checks `feature('BUDDY')` before doing anything.

### 3.5 Speculative codename

"Buddy" is the launch codename; "companion" is the in-code noun. The `/buddy` slash command (regex `\/buddy\b`) hatches a new pet. Tagline-internal: the teaser ran April 1–7, 2026 and the dispatch comment says _"24h rolling wave across timezones"_ — a soft-launch easter egg, not a feature like always-on pair-programmer mode. No companion-driven tool calls or continuous monitoring.

---

## 4. Tasks Directory

### 4.1 Two kinds of "task" — disambiguated

This codebase has **two unrelated task systems** that share a directory name:

1. **`tasks/` (this directory) — Background Task framework.** Long-running background jobs the harness manages (bash, agent, remote agent, dream consolidation, in-process teammate, workflow, MCP monitor). Mirrors `tools.ts` / `getAllTasks()` pattern. State persists on disk under `getTaskOutputPath(id)` (`Task.ts:121`). Lifecycle is managed by `Task.ts` (root) + `tasks.ts` (root) + the per-type subdirs in `tasks/`.
2. **`utils/tasks.ts` (NOT this dir) — Todo-list "tasks" surfaced by Task{Create,Update,List,Get}Tool.** A user-visible TODO list with status (pending/in_progress/completed), blocking dependencies, owner assignment for swarms, etc. Persisted as one JSON file per task at `<config-home>/tasks/<sanitized-list-id>/<id>.json` (`utils/tasks.ts:221-230`). Each task list is identified by `getTaskListId()` — env-set ID > teammate team name > leader team name > session ID (`utils/tasks.ts:199-210`).

The directory `tasks/` is system #1 only.

### 4.2 Per-subfolder purpose (`tasks/`)

```
tasks/
  DreamTask/                 dream consolidation (auto-memory subagent) — registered when KAIROS feature flag is on
  InProcessTeammateTask/     a teammate agent running in-process (swarm member); identity, mailbox, plan-mode tracking
  LocalAgentTask/            a forked sub-agent run via AgentTool — 2.7K LOC, the workhorse
  LocalShellTask/            backgrounded bash (Ctrl+B-twice) + Monitor MCP variant — guards.ts, killShellTasks.ts, LocalShellTask.tsx
  RemoteAgentTask/           Remote-Agent (Cloud Sessions) tasks; ultraplan support; 4.2K LOC
  LocalMainSessionTask.ts    main REPL query backgrounded as a Task (Ctrl+B-twice on the REPL itself)
  pillLabel.ts               compact footer-pill labelling for n×kind tasks ("1 shell, 2 monitors", "◇ ultraplan ready")
  stopTask.ts                shared stop logic used by TaskStopTool + SDK control request
  types.ts                   TaskState union, isBackgroundTask discriminator
```

### 4.3 Persistence (`tasks/` background framework)

Per-task transcript output is written to `getTaskOutputPath(id)` (`Task.ts:121`) — disk-backed log files. Task IDs are 8-char base36 strings prefixed by type letter: `b` bash, `a` local agent, `r` remote agent, `t` teammate, `w` workflow, `m` monitor, `d` dream, `s` main-session (`Task.ts:79-87`, `LocalMainSessionTask.ts:73-80`). State lives in `AppState.tasks[id]` (in-memory React state) and is serialised back to the SDK via `emitTaskTerminatedSdk` (`tasks/stopTask.ts:7`).

### 4.4 Persistence (Todo-list — `utils/tasks.ts`)

- Path: `<getClaudeConfigHomeDir()>/tasks/<sanitized-listId>/<id>.json` (`utils/tasks.ts:221-230`).
- Schema: `{ id, subject, description, activeForm?, owner?, status, blocks[], blockedBy[], metadata? }` (`utils/tasks.ts:76-89`).
- Concurrency: `proper-lockfile` based, `retries=30, minTimeout=5, maxTimeout=100` ≈ 2.6 s budget for ~10-way swarm contention (`utils/tasks.ts:102-108`).
- High-water mark: `.highwatermark` file (`utils/tasks.ts:91-131`) prevents ID reuse after a `resetTaskList`.

### 4.5 Per-tool component

The four CRUD tools are registered conditionally on `isTodoV2Enabled()` (`tools.ts: TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool`):

- **TaskCreate** (`tools/TaskCreateTool/TaskCreateTool.ts:48-138`) — input `{subject, description, activeForm?, metadata?}` → calls `createTask` + `executeTaskCreatedHooks`.
- **TaskGet** (`tools/TaskGetTool/TaskGetTool.ts:38-128`) — read-only, returns full record.
- **TaskList** (`tools/TaskListTool/TaskListTool.ts:33-116`) — read-only summary; renders one line per task with `[status]`, owner, blocked-by.
- **TaskUpdate** (`tools/TaskUpdateTool/TaskUpdateTool.ts:88-406`) — supports status, owner reassignment, `addBlocks`/`addBlockedBy`, `metadata` (null deletes a key); auto-sets owner when teammates start work; runs TaskCompleted hooks; emits a "verification nudge" if 3+ tasks closed without a verify subject (`:333-348`).
- **TaskStop** (referenced via `tasks/stopTask.ts:1-100`) and **TaskOutput** (path-only mention) handle the _background_ framework, not the todo list — different system.

### 4.6 Task UI rendering

- **Todo-list**: `commands/tasks/tasks.tsx:5-7` invokes `<BackgroundTasksDialog>` from `components/tasks/`. TaskListTool result is plain text bullets (`TaskListTool.ts:101-108`).
- **Background framework**: footer pill via `tasks/pillLabel.ts:10-67` ("1 shell, 2 monitors", "◇ ultraplan ready" with diamond figures), expanded via Shift+Down dialog. The `tasks` command shows the **background tasks dialog**, not the todo-list — `commands/tasks/index.ts:7` aliases it to `bashes`.

### 4.7 Background tasks (separate sub-folder vs interleaved)

**Separate sub-folder per task type** — every `TaskType` has its own subdir under `tasks/` with a state-typed `.tsx` (most are `.tsx` because they ship Ink renderers for the Shift+Down dialog: `LocalAgentTask.tsx` 82.9 KB, `RemoteAgentTask.tsx` 126.4 KB, `LocalShellTask.tsx` 66.3 KB). The `tasks.ts` (root) registry composes them via `getAllTasks()` with conditional `WORKFLOW_SCRIPTS` and `MONITOR_TOOL` features.

---

## 5. Cross-References

### 5.1 Dependency graph

```
                          ┌─────────────────────────────────────────┐
                          │       SkillTool (tools/SkillTool/)      │
                          │  reads getCommands(cwd) which composes: │
                          └─────────────────────────────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────────┐
                ▼                      ▼                          ▼
   getSkillDirCommands()      getBundledSkills()            MCP skills (in AppState.mcp.commands)
   (skills/loadSkillsDir.ts)  (skills/bundledSkills.ts)
                │
   ┌────────────┴─────────────┐
   ▼                          ▼
   /skills/ markdown          /commands/ legacy tree
   (managed/user/project/     (commands_DEPRECATED loadedFrom)
   add-dir + dynamic walk)

   ── independent ──

   tasks/ (background framework)         utils/tasks.ts (todo-list)
   ────────────────────────              ─────────────────────────
   Task.ts, tasks.ts (root)              TaskCreate/Get/Update/List tools
       │                                       │
   AppState.tasks[id]                    ~/.claude/tasks/<list-id>/*.json
   getTaskOutputPath(id) on disk
       │
   used by AgentTool, monitor MCP,
   bash backgrounding, dream agent

   ── unrelated to either of the above ──

   assistant/ (one HTTP client file)     buddy/ (virtual pet)
   ─────────────────────────             ────────────────────
   useAssistantHistory hook              CompanionSprite Ink UI
   ↓                                     (gated on feature('BUDDY'))
   GET /v1/sessions/<id>/events
```

### 5.2 Are skills tools or "soft tools"?

**Soft tools.** Skills are not registered as tools. The model exposes one _real_ tool — `Skill` (`tools/SkillTool/constants.ts:1` — `SKILL_TOOL_NAME = 'Skill'`) — and inside it the model passes a `skill: <name>` argument that _expands into prompt content_ (inline) or _spawns a sub-agent that runs the prompt_ (fork). The skill itself is markdown + frontmatter, not executable code. Tools-allowed lists are advisory permission grants applied via `contextModifier` (`SkillTool.ts:775-804`).

### 5.3 Slash commands

- `/skills` — `commands/skills/index.ts` registers a `local-jsx` command that opens `<SkillsMenu>` (`commands/skills/skills.tsx:5-7`). Browser/picker UI for the skills you have.
- `/tasks` (alias `/bashes`) — `commands/tasks/index.ts` opens `<BackgroundTasksDialog>` (`commands/tasks/tasks.tsx:5-7`). Manages **background framework** tasks, NOT the todo list.
- `/buddy` — referenced by `findBuddyTriggerPositions` (`buddy/useBuddyNotification.tsx:79-97`) but its registration lives outside the buddy/ directory — gated on the BUDDY feature.
- No `/assistant` slash command. Assistant is not a user-facing concept.

### 5.4 Skill tool exposure

Yes — `SkillTool` is a registered Tool with `SKILL_TOOL_NAME = 'Skill'`. Its prompt (`tools/SkillTool/prompt.ts:174-195`) is what tells the model how to discover and invoke skills. `SkillTool.toAutoClassifierInput` (`SkillTool.ts:352`) returns just the skill name for Skill-Coach classification — so the model's invocation of `pdf` doesn't trigger a "you should have used pdf" nudge.

### 5.5 Permissions model

SkillTool has its own deny/allow rule space (`SkillTool.ts:469-486` deny, `:506-523` allow), with `:*` prefix wildcards (`review:*` matches `review-pr 123`). Skills with only "safe" properties auto-allow without prompting (`SkillTool.ts:529-538, 875-908` — the SAFE_SKILL_PROPERTIES allowlist defaults _new_ future fields to require permission until reviewed).

---

## 6. Comparison Hooks (AGI Workforce relevance)

### 6.1 To match Anthropic's Skills surface in `apps/cli/`

At minimum:

1. **A `Skill` tool** that takes `{skill, args}` and either expands prompt text inline or spawns a sub-agent. Today `apps/cli/src/skills/` (per memory) is "ungated" but unshipped — verify implementation exists, then port the prompt-expansion + tool injection + path-conditional activation logic.
2. **Frontmatter parser** with the 14-field schema documented above (`description`, `when_to_use`, `model`, `allowed-tools`, `argument-hint`, `arguments`, `version`, `disable-model-invocation`, `user-invocable`, `hooks`, `context`, `agent`, `effort`, `paths`, `shell`).
3. **Discovery walker** for `~/.agiworkforce/skills/`, `<cwd>/.claude/skills/` (or our equivalent), plus `--add-dir`. Realpath dedup, gitignore filtering for nested skills, conditional `paths` activation when files match.
4. **Prompt-time interpolation**: `${SKILL_DIR}`, `${SESSION_ID}`, positional/named args, `!`...`` shell substitution gated to non-MCP sources.
5. **Bundled skills registry** mirroring `simplify`, `verify`, `update-config`, `keybindings-help` as our equivalents.
6. **Listing budget**: 1% of context window, never truncate bundled skill descriptions, character-budget the rest (`commands.ts → SKILL_BUDGET_CONTEXT_PERCENT = 0.01`).
7. **Skill-tool deduplication**: model gets a system-reminder per turn with active skills; if the model invokes a skill that's already injected, refuse to re-invoke.
8. **Plugin support**: namespaced by parent path components joined with `:`. We'd need a plugin loader before this matters.
9. **Two execution modes**: inline (default) + fork (`context: fork` runs a sub-agent — leverage our existing AgentTool path).
10. **`disable-model-invocation` gate**: lets users ship `/cmd` slash commands without the model auto-firing them.

A V1 scope without `paths`, `hooks`, `effort`, `fork` mode is feasible — those add ~30% complexity and aren't required to ship a "we have skills too" claim.

### 6.2 Should we copy buddy?

No. Buddy is a marketing easter egg that specifically launched on April 1, 2026 (`useBuddyNotification.tsx:15`) — intentionally Aprily. Imitating it would look derivative; building our own ornament (or skipping) is the better call. The interesting _technical_ idea — using a per-session attachment to _suppress_ model output when a UI element is being addressed (`buddy/prompt.ts:11-12`) — is reusable for any avatar/persona surface we add later, but doesn't justify shipping a duck.

---

## 7. Open Questions

1. **Where is `assistant/index.js`?** `bridge/initReplBridge.ts:480` requires it but it does not exist in this snapshot. Either it ships only in Anthropic's internal build (USER_TYPE='ant'), or it is generated at bundle time. Without it, `isAssistantMode()` is unresolvable. If we mirror this surface we need to know what `claude_code_assistant` worker mode actually does — possibly Anthropic's hosted Cloud Sessions agent runner. The `ant-trace` and `bridge/` directories are likely where to look next. **Action**: search remaining `ant-`-prefixed dirs and `bridge/` thoroughly.
2. **Two `tasks` systems with the same name** — TaskCreate/List/Update/Get tools (todo list, persisted in `~/.claude/tasks/`) vs the `tasks/` dir (background framework, in-memory + per-task output files). The naming collision is a known pain point: the `/tasks` slash command opens the _background_ dialog, not the _todo_ list. Did Anthropic ever consolidate? The `pendingTaskListIdBeforeRespawn` etc fields suggest an in-progress migration. **Action**: check if `TodoWrite` (V1) is still hot-pathed.
3. **Who decides which conditional skills activate?** `activateConditionalSkillsForPaths` only fires when the model touches a matching file via Read/Write/Edit (`loadSkillsDir.ts:1029`). What about Glob/Grep results? The skill is silently inactive even though the model has just listed 100 matching paths. This may be deliberate (avoid false positives) but worth confirming.
4. **MCP skill security model** — `mcpSkillBuilders.ts` indirection is purely a Bun-bundling workaround for a literal vs variable dynamic-import asymmetry. The comment at `mcpSkillBuilders.ts:9-21` is the most useful documentation of why our own bundling story for plugins/skills will be non-trivial. We need to plan for: (a) cycle-safe registration, (b) shell-substitution disabled for remote sources (`loadSkillsDir.ts:374-396`), (c) the `_canonical_` prefix carve-out for ant-only experimental remote skill catalogs (`SkillTool.ts:600-613`).
5. **Is there a "skill marketplace"?** `isOfficialMarketplaceName(parsePluginIdentifier(repository).marketplace)` (`SkillTool.ts:935-942`) suggests yes — a curated marketplace name registry. If we ship plugins at all we need to decide if we maintain a similar trust list.
6. **`feature('RUN_SKILL_GENERATOR')` + `skillify`** — there's a built-in tool that captures a session's repeatable steps into a skill. This is exactly the kind of differentiator we could match relatively cheaply (it's just prompt + Write tool calls — body at `bundled/skillify.ts`). Worth a closer read in a follow-up pass.
7. **Worktree/agent identity in tasks.ts** — `LocalMainSessionTask.ts` uses `'s'` prefix for IDs but `Task.ts:79-87` only declares 7 prefixes. The `'s'` is hand-rolled in `LocalMainSessionTask.ts:75-80`. Suggests organic growth — collisions theoretically possible.
8. **`feature('BUDDY')` external check** at `useBuddyNotification.tsx:14` — `if ("external" === 'ant') return true`. This is a Bun-substituted constant; the literal `"external"` is replaced at build time with `process.env.USER_TYPE`. Worth verifying the substitution mechanic before relying on it for our own feature flags.

---

## 8. Most-Useful File Paths

For future investigation by us or another teammate:

- Skill loader entry point: `~/Desktop/reference/src/skills/loadSkillsDir.ts:638-804` (`getSkillDirCommands`).
- Skill frontmatter schema: `~/Desktop/reference/src/utils/frontmatterParser.ts:10-59`.
- Skill tool definition: `~/Desktop/reference/src/tools/SkillTool/SkillTool.ts:331-869`.
- Skill tool prompt: `~/Desktop/reference/src/tools/SkillTool/prompt.ts:173-196`.
- Bundled skill harness: `~/Desktop/reference/src/skills/bundledSkills.ts:53-100`.
- Bundled skill init: `~/Desktop/reference/src/skills/bundled/index.ts:24-79`.
- Background task framework root: `~/Desktop/reference/src/Task.ts` + `~/Desktop/reference/src/tasks.ts`.
- Todo-list persistence: `~/Desktop/reference/src/utils/tasks.ts:191-241`.
- TaskCreate/Update/List/Get tool definitions: `~/Desktop/reference/src/tools/Task{Create,Update,List,Get}Tool/`.
- Assistant HTTP client: `~/Desktop/reference/src/assistant/sessionHistory.ts`.
- Assistant mode worker switch: `~/Desktop/reference/src/bridge/initReplBridge.ts:480-484`.
- Buddy entrypoint: `~/Desktop/reference/src/buddy/{prompt.ts,companion.ts,types.ts}`.
- Buddy feature gates: `~/Desktop/reference/src/buddy/useBuddyNotification.tsx:12-21`.

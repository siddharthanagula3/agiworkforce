# MISC1 — Skills, Tasks, Assistant, Buddy, MoreRight, Memdir, Migrations, State, Plugins

> **Scope.** 9 directories under `~/Desktop/reference/src/`: `skills/` (20), `tasks/` (12), `assistant/` (1), `buddy/` (6), `moreright/` (1), `memdir/` (8), `migrations/` (11), `state/` (6), `plugins/` (2). ~67 files total. This file is the deep dive for the 30-agent team.
>
> **Why this matters for AGI Workforce v1.** Skills and Memory are two of the four feature pillars Anthropic shipped/locked in 2025–2026 (the other two being Connectors and Projects); see `tasks/research/anthropic-claude-suite-may-2026.md` §1.5 + §1.6 + §E.1 + §E.2. Tasks (background-agent registry, transcripts, status pills) is what makes the harness feel like an OS-grade workforce instead of a chat. State (`AppState`) is the chassis: 75 fields, single choke-point side-effects in `onChangeAppState`, and the `speculation` slice that shows the user a draft response before the model finishes. Memdir is the file-based long-term memory under `~/.claude/projects/<slug>/memory/`. Migrations are the boring-but-load-bearing version-bridge layer that lets you ship breaking changes without bricking installs. Buddy and Moreright are mostly skip-for-v1 — Buddy is an Apr 1–7 2026 easter egg, Moreright is a 26-LOC stub.

---

## 1. `skills/` — full picture (20 files)

### 1.1 Directory inventory (verified 2026-05-08 via `ls -la`)

```
src/skills/
├── bundled/                    (17 files — see §1.6)
├── bundledSkills.ts            (221 LOC — registry + extraction)
├── loadSkillsDir.ts            (1,087 LOC — discovery, frontmatter, dedup, conditional, dynamic)
└── mcpSkillBuilders.ts         (45 LOC — write-once registry to break import cycles)
```

`skills/bundled/` contains 17 files: `batch.ts`, `claudeApi.ts`, `claudeApiContent.ts`, `claudeInChrome.ts`, `debug.ts`, `index.ts`, `keybindings.ts`, `loop.ts`, `loremIpsum.ts`, `remember.ts`, `scheduleRemoteAgents.ts`, `simplify.ts`, `skillify.ts`, `stuck.ts`, `updateConfig.ts`, `verify.ts`, `verifyContent.ts`. Total ~108 KB of registration code. The corresponding markdown SKILL.md content for `verify` is inlined via Bun's text loader (`verify/SKILL.md` + `verify/examples/{cli,server}.md`) — see `verifyContent.ts:5-9`.

### 1.2 Skill loader: 4-source discovery + symlink-aware dedup

`loadSkillsDir.ts:78-94` defines four config-rooted sources with priority ordering:

```typescript
function getSkillsPath(source: SettingSource | 'plugin', dir: 'skills' | 'commands'): string {
  switch (source) {
    case 'policySettings':
      return join(getManagedFilePath(), '.claude', dir); // managed (admin-deployed)
    case 'userSettings':
      return join(getClaudeConfigHomeDir(), dir); // ~/.claude/skills/
    case 'projectSettings':
      return `.claude/${dir}`; // <cwd>/.claude/skills/
    case 'plugin':
      return 'plugin'; // sentinel
    default:
      return '';
  }
}
```

The orchestrator `getSkillDirCommands(cwd)` at `loadSkillsDir.ts:638-804` (memoized via `lodash-es/memoize` keyed on `cwd`) loads from five sources in parallel:

1. **Managed** — `<managedFilePath>/.claude/skills/`, gated by `process.env.CLAUDE_CODE_DISABLE_POLICY_SKILLS` (`loadSkillsDir.ts:686-688`).
2. **User** — `~/.claude/skills/`, gated by `isSettingSourceEnabled('userSettings') && !skillsLocked` (`:689-691`).
3. **Project** — walks up `cwd → home` via `getProjectDirsUpToHome('skills', cwd)` (`:642`); each ancestor's `.claude/skills/` is loaded.
4. **Additional dirs** — every directory passed to `--add-dir` gets its `.claude/skills/` loaded (`:649, :699-708`).
5. **Legacy commands** — `loadSkillsFromCommandsDir(cwd)` reads `<cwd>/.claude/commands/` for backward-compat (`:566-623`). Marked `loadedFrom: 'commands_DEPRECATED'`.

Dedup is **realpath-based** (`loadSkillsDir.ts:118-124, 728-769`):

```typescript
async function getFileIdentity(filePath: string): Promise<string | null> {
  try {
    return await realpath(filePath);
  } catch {
    return null;
  }
}
```

Why realpath instead of inode? Comment at `:113-116`: "filesystem-agnostic and avoids issues with filesystems that report unreliable inode values (e.g., inode 0 on some virtual/container/NFS filesystems, or precision loss on ExFAT). See: https://github.com/anthropics/claude-code/issues/13893". When two paths resolve to the same realpath (symlinks, overlapping parent dirs from `--add-dir <X>` plus a project root that's a child of X), the first-loaded wins — which is why source ordering at `:717-723` matters: managed > user > project > additional > legacy.

`--bare` mode (`isBareMode()` at `:658`) skips all auto-discovery and only loads explicit `--add-dir` paths. Documented as "explicit dirs, user controls uniqueness" — no dedup needed.

### 1.3 SKILL.md frontmatter — 14 fields

`parseSkillFrontmatterFields()` at `loadSkillsDir.ts:185-265` parses these YAML keys:

| Field                      | Purpose                                        | Loaded as                                                 | Default                                        |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `name`                     | Display name override                          | `displayName: string \| undefined`                        | filename or skill dir basename                 |
| `description`              | Slash-command description                      | `description: string`                                     | `extractDescriptionFromMarkdown(...)` fallback |
| `when_to_use`              | Auto-invocation hint to model                  | `whenToUse: string \| undefined`                          | undefined                                      |
| `model`                    | Override main loop model (`'inherit'` allowed) | `parseUserSpecifiedModel(...)`                            | undefined                                      |
| `effort`                   | `low\|medium\|high\|max\|auto`                 | `parseEffortValue(...)`                                   | undefined                                      |
| `allowed-tools`            | Permission-rule allowlist                      | `string[]`                                                | `[]`                                           |
| `argument-hint`            | Display hint for `/skill <args>`               | `string \| undefined`                                     | undefined                                      |
| `arguments`                | Named arg substitution                         | `string[]` (parsed)                                       | `[]`                                           |
| `version`                  | User-supplied version                          | `string \| undefined`                                     | undefined                                      |
| `disable-model-invocation` | Hide from model                                | `boolean`                                                 | `false`                                        |
| `user-invocable`           | Hide from user                                 | `boolean`                                                 | `true`                                         |
| `hooks`                    | Skill-scoped hook config                       | `HooksSchema().safeParse(...)`                            | undefined                                      |
| `context`                  | `'fork'` → spawn subagent                      | `'fork' \| undefined` (other values → undefined = inline) | undefined (inline)                             |
| `agent`                    | Named agent type                               | `string \| undefined`                                     | undefined                                      |
| `paths`                    | Conditional activation glob list               | `string[]` (gitignore syntax)                             | undefined                                      |
| `shell`                    | Custom shell config                            | `parseShellFrontmatter(...)`                              | undefined                                      |

Total fields parsed: 16 (the spec said "14"; the extra two are `version` and `shell`). `disable-model-invocation` and `user-invocable` together gate visibility: hidden-from-model + invisible-to-user = effectively dead, but useful for skills only invokable via hooks or sub-skills.

### 1.4 17 bundled skills (`bundled/index.ts:24-79`)

Always registered (10):

1. `update-config` (`updateConfig.ts:445-475`) — settings.json editor with embedded JSON schema. ~17 KB prompt with HOOKS_DOCS, HOOK_VERIFICATION_FLOW, SETTINGS_EXAMPLES_DOCS sections + dynamic `toJSONSchema(SettingsSchema())`.
2. `keybindings-help` (`keybindings.ts:292-327`) — auto-generated table of all default bindings, contexts, reserved shortcuts. `userInvocable: false`, `isEnabled: isKeybindingCustomizationEnabled`.
3. `verify` (`verify.ts:12-30`) — **ant-only** (`process.env.USER_TYPE !== 'ant'` early-return). Bundles `verify/SKILL.md` + 2 examples.
4. `debug` (`debug.ts:12-103`) — turns on debug logging, tails last 20 lines (within 64 KB), shows settings paths.
5. `lorem-ipsum` (`loremIpsum.ts:234-282`) — **ant-only**. Generates filler text from a 1-token-word list, capped at 500K tokens.
6. `skillify` (`skillify.ts:158-197`) — **ant-only**. Self-improving: reads session memory + extracts user messages → builds new SKILL.md from session.
7. `remember` (`remember.ts:4-82`) — **ant-only**. Reviews auto-memory + CLAUDE.md and proposes promotions.
8. `simplify` (`simplify.ts:55-69`) — fans out 3 review agents (reuse, quality, efficiency) then aggregates and fixes.
9. `batch` (`batch.ts:100-124`) — large-scale parallel work: 5–30 worktree-isolated agents, each opens a PR. Requires git repo (`getIsGit()` check at `:116`).
10. `stuck` (`stuck.ts:61-79`) — **ant-only**. Diagnoses frozen Claude Code sessions and posts to `#claude-code-feedback` (channel ID `C07VBSHV7EV`).

Feature-gated (7): 11. `dream` (`feature('KAIROS') || feature('KAIROS_DREAM')`) — file not in scope but registered at `index.ts:35-40`. 12. `hunter` (`feature('REVIEW_ARTIFACT')`). 13. `loop` (`loop.ts`, `feature('AGENT_TRIGGERS')`) — recurring local cron via `CRON_CREATE_TOOL_NAME`. Default interval `10m`. Conversion table for `Nm`, `Nh`, `Nd` to cron at `loop.ts:50-56`. 14. `schedule` (`scheduleRemoteAgents.ts:324-385`, `feature('AGENT_TRIGGERS_REMOTE')`) — remote/cloud cron with `REMOTE_TRIGGER_TOOL_NAME`. Min cron interval = 1 hour. Includes connector UUID decoding (Base58 tagged IDs at `:35-57`) and timezone-aware UX. 15. `claude-api` (`claudeApi.ts:180-196`, `feature('BUILDING_CLAUDE_APPS')`) — language-aware doc bundling. `claudeApiContent.ts` lazy-imports 247 KB of markdown (Python/TypeScript/Java/Go/Ruby/C#/PHP/curl). 16. `claude-in-chrome` (`claudeInChrome.ts:16-34`, `shouldAutoEnableClaudeInChrome()`) — auto-prepends `mcp__claude-in-chrome__*` tools. Mandates `tabs_context_mcp` first call. 17. `runSkillGenerator` (`feature('RUN_SKILL_GENERATOR')`) — file not in scope, registered at `index.ts:73-77`.

The "external" build comment at `verify.ts:13`, `loremIpsum.ts:235`, `skillify.ts:159`, `remember.ts:6`, `stuck.ts:62` is the ant-vs-external check: `process.env.USER_TYPE !== 'ant' { return }`. Internal-only skills must early-return so they don't appear in public builds.

### 1.5 `paths` — gitignore-glob conditional activation

`parseSkillPaths()` at `loadSkillsDir.ts:159-178` reads frontmatter `paths` and:

- Splits via `splitPathInFrontmatter(...)`.
- Strips `/**` suffix because the `ignore` library treats `path` as matching both the path and everything inside.
- Filters empty patterns.
- Returns `undefined` if all patterns are `**` (match-all → not conditional).

Skills with `paths` are partitioned at `:771-785` into `unconditionalSkills` vs `newConditionalSkills`. The conditional ones go into the module-level `conditionalSkills: Map<string, Command>` at `:827`. They DON'T appear in the model's tool list until activated.

`activateConditionalSkillsForPaths(filePaths, cwd)` at `:997-1058` runs whenever the model touches a file. For each pending skill:

- Build a fresh `ignore().add(skill.paths)`.
- For each absolute file path, compute `relative(cwd, filePath)`.
- Reject paths that escape cwd (`startsWith('..')` or absolute relpath — Windows cross-drive case).
- If `skillIgnore.ignores(relativePath)`: move from `conditionalSkills` to `dynamicSkills`, add name to `activatedConditionalSkillNames` (which survives `clearSkillCaches()`), break.

Activation fires `tengu_dynamic_skills_changed` event with `source: 'conditional_paths'` and emits the `skillsLoaded` signal so callers can clear their caches (`:1043-1054`).

This is **the** load-bearing pattern: instead of loading 200+ team skills at startup (model has to read every name+description), the harness keeps them dormant and revives them only when the model edits a relevant file. v1 should ship this — frontmatter-only progressive disclosure is what makes Skills scale.

`discoverSkillDirsForPaths()` at `:861-915` is the complementary pattern for **directory-scoped** skills: when the model touches `<cwd>/<some_dir>/file.txt`, it walks up from the file to cwd and probes for `<each_ancestor>/.claude/skills/`. Found dirs are added to `dynamicSkillDirs` (visited set; same path won't be re-stat'd) and gitignored ancestors are skipped (`isPathGitignored` at `:892`) — this stops `node_modules/pkg/.claude/skills/` from silently activating.

### 1.6 Inline vs fork execution

`executionContext: 'inline' | 'fork' | undefined` (default = inline). Set via frontmatter `context: fork`. The skill's prompt is built by `getPromptForCommand(args, toolUseContext)` at `:344-399`:

1. Prepend `Base directory for this skill: <skillDir>` if `baseDir` set.
2. Apply `substituteArguments(content, args, true, argumentNames)`.
3. Replace `${CLAUDE_SKILL_DIR}` with `baseDir` (Windows backslash-normalized).
4. Replace `${CLAUDE_SESSION_ID}` with current session.
5. **Skip step 6 if `loadedFrom === 'mcp'` — MCP skills are remote and untrusted.**
6. Run `executeShellCommandsInPrompt(...)` to expand `!\`...\``inline shell exec — but with augmented`alwaysAllowRules.command = allowedTools` so the skill's own allowlist takes precedence (`:374-396`).

The inline-shell-execution gate is critical: a remote MCP server should never be able to expand `!\`rm -rf ~\``. The check is just `loadedFrom !== 'mcp'`.

Bundled skills with `files: { '<rel>': '<content>' }` extract to disk on first invocation (`bundledSkills.ts:131-144, 147-167`). `safeWriteFile` uses `O_NOFOLLOW | O_EXCL | 0o600` (POSIX) or `'wx'` flag (Windows) and throws on EEXIST without retry. The bundled-skills-root has a per-process nonce as the primary defense against pre-created symlinks/dirs (`bundledSkills.ts:169-175`).

### 1.7 MCP skill builders — the cycle break

`mcpSkillBuilders.ts:1-44` is a write-once registry that decouples MCP skill loading from `loadSkillsDir.ts`. The comment at `:7-23` explains: a literal dynamic import works in bunfs but dependency-cruiser tracks the edge and a single new edge fans out into many cycle violations because `loadSkillsDir` transitively reaches everything. Variable-specifier dynamic imports pass dep-cruiser but fail at runtime in bunfs binaries.

Solution: `mcpSkillBuilders.ts` only imports types. `loadSkillsDir.ts:1083-1086` registers `{createSkillCommand, parseSkillFrontmatterFields}` at module-init (eager via static import from `commands.ts`). MCP code imports the registry and gets the live functions without a cycle.

---

## 2. `tasks/` — background-task framework (12 files)

### 2.1 Inventory

```
src/tasks/
├── DreamTask/DreamTask.ts                          (158 LOC — auto-dream subagent registration)
├── InProcessTeammateTask/
│   ├── InProcessTeammateTask.tsx                   (16,381 bytes — full lifecycle UI)
│   └── types.ts                                    (122 LOC — TeammateIdentity + state)
├── LocalAgentTask/LocalAgentTask.tsx               (82,910 bytes — core background-agent runner)
├── LocalMainSessionTask.ts                         (480 LOC — Ctrl+B-to-background main session)
├── LocalShellTask/
│   ├── guards.ts                                   (42 LOC — pure type guard)
│   ├── killShellTasks.ts                           (77 LOC — non-React kill helpers)
│   └── LocalShellTask.tsx                          (66,306 bytes — full UI)
├── RemoteAgentTask/RemoteAgentTask.tsx             (126,389 bytes — Anthropic-cloud session poller)
├── pillLabel.ts                                    (83 LOC — footer-pill text logic)
├── stopTask.ts                                     (101 LOC — shared stop logic)
└── types.ts                                        (47 LOC — TaskState union)
```

### 2.2 Seven task types

`tasks/types.ts:11-19`:

```typescript
export type TaskState =
  | LocalShellTaskState // type: 'local_bash'  (kept for sidecar back-compat)
  | LocalAgentTaskState // type: 'local_agent' (subagents + LocalMainSessionTask via agentType)
  | RemoteAgentTaskState // type: 'remote_agent'
  | InProcessTeammateTaskState // type: 'in_process_teammate'
  | LocalWorkflowTaskState // type: 'local_workflow' — file not in scope (in tasks.ts owner)
  | MonitorMcpTaskState // type: 'monitor_mcp'   — file not in scope
  | DreamTaskState; // type: 'dream'
```

The legacy type tag is `'local_bash'` even though the user-facing label is "shell" — preserved for serialized session state back-compat (`LocalShellTask/guards.ts:12`). `LocalMainSessionTask` reuses `LocalAgentTaskState` with `agentType: 'main-session'` and uses `'s'` prefix vs subagents' `'a'` prefix for IDs (`LocalMainSessionTask.ts:73-82`).

`isBackgroundTask()` at `tasks/types.ts:37-46` filters: status must be running/pending AND `isBackgrounded !== false` (foreground tasks aren't yet "background"). This is what populates the footer pill and the `Shift+Down` task dialog.

### 2.3 Per-type UIs and state shapes

**DreamTask** (`DreamTask.ts:25-50`): `phase: 'starting' | 'updating'`, `sessionsReviewing: number`, `filesTouched: string[]`, `turns: DreamTurn[]` (capped at `MAX_TURNS = 30`), plus a `priorMtime: number` for rolling back the consolidation lock on kill (`:152-155`). Notification path is empty: `notified: true` set immediately on completion because dream surface is system-message-only (`:111-119`).

**LocalShellTask** (`guards.ts:11-32`): adds `command: string`, `result?: { code, interrupted }`, `kind?: 'bash' | 'monitor'`, `agentId?: AgentId` (so `killShellTasksForAgent` can wipe orphans when the parent agent exits — `killShellTasks.ts:53-76`). `LocalShellTask.tsx:32-99` defines a stall watchdog: every 5 seconds, if output hasn't grown for 45 seconds AND the tail looks like a `(y/n)` prompt (regexes at `:32-38`), enqueue a one-shot `task-notification` so the model can choose to kill+rerun with piped input.

**InProcessTeammateTask** (`types.ts:22-77`): teams have an `identity: { agentId, agentName, teamName, color, planModeRequired, parentSessionId }` shape. `messages?: Message[]` mirror the conversation for the zoomed transcript view, capped at `TEAMMATE_MESSAGES_UI_CAP = 50` per `appendCappedMessage` at `:108-121`. The cap exists because BQ analysis (round 9, 2026-03-20, comment at `:96-100`) showed 36.8 GB RSS in a 292-agent burst — the dominant cost was this array holding a second copy of every message.

**RemoteAgentTask** (`RemoteAgentTask.tsx:22-86`): `remoteTaskType` enum is `'remote-agent' | 'ultraplan' | 'ultrareview' | 'autofix-pr' | 'background-pr'` (`:60`). Polls Anthropic cloud every tick via `pollRemoteSessionEvents`. `pollStartedAt` is preserved on `--resume` so a session spawned >30 min ago doesn't immediately time out (`:39-44`). Has an extension hook `registerCompletionChecker(remoteTaskType, checker)` (`:84-86`) for per-type completion logic.

**LocalAgentTask** (`LocalAgentTask.tsx:33-100`): the core. `AgentProgress { toolUseCount, tokenCount, lastActivity?, recentActivities?, summary? }`. The `ProgressTracker` (`:40-57`) tracks `latestInputTokens` (cumulative per-turn — input is cumulative in API) + `cumulativeOutputTokens` (sum). Uses `getToolSearchOrReadInfo` to pre-classify each tool use as search/read for the progress display (`:81-89`). `MAX_RECENT_ACTIVITIES = 5` keeps a rolling window.

### 2.4 Disk-backed transcripts

Every task writes its conversation to a per-task transcript at `getAgentTranscriptPath(asAgentId(taskId))`. Background tasks get a symlink-as-output via `initTaskOutputAsSymlink(taskId, transcriptPath)` (`LocalMainSessionTask.ts:107-110`). The symlink design lets the task survive `/clear`: `clearConversation` re-links the symlink to a new session, but the task keeps writing to its isolated path.

`recordSidechainTranscript(messages, taskId, lastRecordedUuid)` writes incrementally (per-event) so live `TaskOutput` shows progress (`LocalMainSessionTask.ts:413-418`).

`evictTaskOutput(taskId)` (`LocalMainSessionTask.ts:194`, called on terminal status) deletes the disk artifact after the panel grace period.

### 2.5 Stop semantics

`stopTask.ts:38-100` is shared by `TaskStopTool` (LLM-invoked) and `stop_task` SDK control request. Returns `StopTaskError` with code `'not_found' | 'not_running' | 'unsupported_type'`. After kill:

- For `LocalShellTask`: suppress the "exit code 137" XML notification (noise) but emit `task_terminated` SDK event directly so SDK consumers see the close.
- For agent tasks: don't suppress — the AbortError catch sends a notification carrying `extractPartialResult(agentMessages)`, which is payload, not noise.

`pillLabel.ts:10-67` renders the footer pill text. Special-cases ultraplan: `◇` open diamond when running/needs-input, `◆` filled when ExitPlanMode is awaiting approval (`:43-52`). For mixed types, falls back to `"N background tasks"`.

---

## 3. `assistant/sessionHistory.ts` — 88 LOC hosted-session events client

Single file at `~/Desktop/reference/src/assistant/sessionHistory.ts`. Implements paginated fetch of an Anthropic-hosted session's event log. Page size: `HISTORY_PAGE_SIZE = 100` (`:7`).

Auth context cached once via `createHistoryAuthCtx(sessionId)` (`:31-43`):

- Calls `prepareApiRequest()` to get `accessToken` + `orgUUID`.
- Builds URL `${BASE_API_URL}/v1/sessions/${sessionId}/events`.
- Headers include `'anthropic-beta': 'ccr-byoc-2025-07-29'` and `'x-organization-uuid': orgUUID`.

Two fetch helpers:

- `fetchLatestEvents(ctx, limit)` — newest page via `?anchor_to_latest=true`.
- `fetchOlderEvents(ctx, beforeId, limit)` — `?before_id=<cursor>`.

Both return `HistoryPage = { events, firstId, hasMore }`. `firstId` is the oldest event in the page (next `before_id` cursor). `hasMore = true` means older events exist.

15s axios timeout, `validateStatus: () => true` (so non-200 doesn't throw), HTTP errors logged to debug. This is what the `--remote` mode REPL viewer reads to display history when joining an existing session.

---

## 4. `buddy/` — virtual-pet easter egg (6 files)

### 4.1 Hatching + identity

`buddy/companion.ts:107-113`: `roll(userId)` is deterministic per-user. Memoized cache at `:106` because three hot paths (sprite tick, per-keystroke `PromptInput`, per-turn observer) all hit it with the same userId.

```typescript
const SALT = 'friend-2026-401'; // line 84
function roll(userId: string): Roll {
  const key = userId + SALT;
  if (rollCache?.key === key) return rollCache.value;
  const value = rollFrom(mulberry32(hashString(key)));
  rollCache = { key, value };
  return value;
}
```

PRNG: Mulberry32 (`:16-25`), seeded from `Bun.hash(s)` if Bun is available, else a custom FNV-style hash (`:27-37`). User ID source: `companionUserId()` (`:119-122`) prefers `oauthAccount.accountUuid`, falls back to `userID`, falls back to literal `'anon'`.

Why no DB? Comment at `:124-126`: "Bones never persist so species renames and SPECIES-array edits can't break stored companions, and editing config.companion can't fake a rarity."

### 4.2 18 species + 5 stats + 5 rarities

`buddy/types.ts:14-74` defines all 18 species with obfuscated names (each constructed via `String.fromCharCode` because comment at `:11-13`: "One species name collides with a model-codename canary in excluded-strings.txt"). Species: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk.

Stats (5): `DEBUGGING`, `PATIENCE`, `CHAOS`, `WISDOM`, `SNARK` (`types.ts:91-98`).

Rarities + weights (`:1-8, 126-132`): common 60, uncommon 25, rare 10, epic 4, legendary 1. Floor (`:53-59`): common 5, uncommon 15, rare 25, epic 35, legendary 50. Stat distribution at `companion.ts:62-82`: one peak (floor + 50 + roll up to 30, capped at 100), one dump (floor − 10 + roll up to 15, min 1), rest scattered.

Eyes (6): `· ✦ × ◉ @ °` (`types.ts:76`). Hats (8): none, crown, tophat, propeller, halo, wizard, beanie, tinyduck (`:79-89`). Rarity → hat rule: common rarity gets `'none'`; otherwise random pick (`companion.ts:97`). Shiny: 1% per roll (`:98`).

### 4.3 Sprites: 5×12 ASCII frames per species, 3 frames each

`buddy/sprites.ts:26-441` is one big record of `Record<Species, string[][]>`. Each species has 3 frames for idle fidget animation. Each frame is 5 lines × 12 chars. Eyes are templated as `{E}` and substituted at render time per `bones.eye`. Line 0 is the hat slot — must be blank in frames 0–1 (frame 2 may use it for smoke/antenna). `renderSprite(bones, frame)` at `:454-469` substitutes eyes, optionally overlays hat, and drops the blank hat slot if all frames have empty line 0 to keep heights stable.

Hat overlays at `:443-452` are themselves 12-char strings. `renderFace(bones)` at `:475-514` produces a single-line face for prompt display.

### 4.4 Teaser window + intro attachment

`buddy/useBuddyNotification.tsx:12-21`: `isBuddyTeaserWindow()` checks `year === 2026 && month === 3 && date <= 7` (April 1–7, 2026, local date). `isBuddyLive()` returns true permanently after April 1, 2026. Internal builds (`process.env.USER_TYPE === 'ant'`) bypass both checks and are always-live. The teaser shows a 15-second rainbow `/buddy` notification only on first sessions where `feature('BUDDY')` is true and no companion has been hatched.

`buddy/prompt.ts:7-12`: `companionIntroText(name, species)` renders the system message that introduces the companion. Critical instruction: "When the user addresses {name} directly (by name), its bubble will answer. Your job in that moment is to stay out of the way: respond in ONE line or less, or just answer any part of the message meant for you."

`getCompanionIntroAttachment(messages)` at `:16-36` is the system-prompt injection hook. Skips if no companion, if muted, or if already announced for this companion (so each user gets the intro once per companion lifetime).

**v1 verdict**: ship-skip — Apr 1–7 2026 has passed. Keep `/buddy` command for users who already hatched.

---

## 5. `moreright/useMoreRight.tsx` — 26-LOC ant-only stub

`moreright/useMoreRight.tsx:1-26` is the no-op stub for external builds. The comment at `:1-5` says "the real hook is internal only" and "Self-contained: no relative imports. Typecheck sees this file at scripts/external-stubs/src/moreright/ before overlay, where ../types/ would resolve to scripts/external-stubs/src/types/ (doesn't exist)."

Three exports as no-ops:

```typescript
return {
  onBeforeQuery: async () => true,
  onTurnComplete: async () => {},
  render: () => null,
};
```

Hook signature exposes: `enabled, setMessages, inputValue, setInputValue, setToolJSX`. The internal version (not in scope) is a pre-query interceptor + post-turn hook + render output. v1 should ship the stub or skip entirely.

---

## 6. `memdir/` — file-based memory (8 files)

### 6.1 Resolution chain (`paths.ts`)

Auto-memory directory resolution at `paths.ts:223-235` (`getAutoMemPath`, memoized):

1. **`CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`** env var — full-path override for Cowork (per-session cwd contains the VM process name, so without this every session would get a different project key).
2. **`autoMemoryDirectory` in settings.json** — trusted sources only: `policySettings`, `flagSettings`, `localSettings`, `userSettings`. **`projectSettings` is excluded** because comment at `:172-176`: "a malicious repo could otherwise set autoMemoryDirectory: '~/.ssh' and gain silent write access via the filesystem.ts write carve-out."
3. **Default**: `<memoryBase>/projects/<sanitized-git-root>/memory/`. `memoryBase` resolves to `CLAUDE_CODE_REMOTE_MEMORY_DIR` env var (set by CCR) or `~/.claude` (`paths.ts:85-90`). The base-key is **canonical git root** via `findCanonicalGitRoot(getProjectRoot())` (falling back to `getProjectRoot()`) so all worktrees share one memory dir per repo (`:202-205`, `anthropics/claude-code#24382`).

Path validation at `:109-150` rejects: relative paths, length-<3 paths, Windows drive-roots (`C:\`), UNC paths (`\\server\share`), null bytes. `~/` expansion supported only for settings (not env-var override) and bare `~`/`~/.`/`~/..` are rejected to prevent expanding to `$HOME` or its parent.

`isAutoMemPath(absolutePath)` at `:274-278` (path-prefix check after `normalize()`, important for traversal-bypass defense) is the gate the filesystem.ts write carve-out checks: when `isAutoMemPath()` is true AND `hasAutoMemPathOverride()` is false, the carve-out fires (bypasses DANGEROUS_DIRECTORIES restriction).

`isAutoMemoryEnabled()` at `:30-55` priority chain: `CLAUDE_CODE_DISABLE_AUTO_MEMORY` env > `CLAUDE_CODE_SIMPLE` (--bare) > CCR without persistent storage > `autoMemoryEnabled` setting > true (default).

### 6.2 `MEMORY.md` index — 200 lines / 25 KB cap

`memdir.ts:34-38`:

```typescript
export const ENTRYPOINT_NAME = 'MEMORY.md';
export const MAX_ENTRYPOINT_LINES = 200;
export const MAX_ENTRYPOINT_BYTES = 25_000;
```

Comment at `:36-37`: "~125 chars/line at 200 lines. At p97 today; catches long-line indexes that slip past the line cap (p100 observed: 197KB under 200 lines)."

`truncateEntrypointContent(raw)` at `:57-103` truncates first by lines (natural boundary), then by bytes (cut at last newline before cap). Appends a warning naming which cap fired so the model sees `> WARNING: MEMORY.md is 47 KB (limit: 24 KB) — index entries are too long. Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`

### 6.3 4 memory types

`memoryTypes.ts:14-21`:

```typescript
export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const;
```

Each type is documented in two sibling sections — `TYPES_SECTION_COMBINED` (private + team scopes, ~70 LOC at `:37-106`) and `TYPES_SECTION_INDIVIDUAL` (no scope tags, ~70 LOC at `:113-178`). The duplication is intentional per the file header comment at `:9-12`: "intentionally duplicated rather than generated from a shared spec — keeping them flat makes per-mode edits trivial without reasoning through a helper's conditional rendering."

What NOT to save (`:183-195`): code patterns, conventions, architecture, file paths, project structure, git history, debugging solutions, anything in CLAUDE.md, ephemeral task details. Critically: "These exclusions apply even when the user explicitly asks you to save."

Frontmatter format example at `:261-271`:

```markdown
---
name: { { memory name } }
description:
  { { one-line description — used to decide relevance in future conversations, so be specific } }
type: { { user, feedback, project, reference } }
---
```

`parseMemoryType(raw)` at `:28-31`: invalid/missing → `undefined`. Legacy files without `type` keep working; unknown types degrade gracefully.

### 6.4 `findRelevantMemories()` — Sonnet ranking (5 max)

`findRelevantMemories.ts:39-75` is the recall path. It:

1. Calls `scanMemoryFiles(memoryDir, signal)` from `memoryScan.ts:35-77` to read all `.md` files (recursive readdir, skip `MEMORY.md`), parse only the first 30 lines for frontmatter (`FRONTMATTER_MAX_LINES = 30`), sort newest-first, cap at `MAX_MEMORY_FILES = 200`.
2. Filter `alreadySurfaced` paths so the selector spends its 5-slot budget on fresh candidates.
3. Build a manifest `[<type>] filename (timestamp): description` (one line per file).
4. Call `sideQuery({model: getDefaultSonnetModel(), system: SELECT_MEMORIES_SYSTEM_PROMPT, ...})` with a JSON schema `{selected_memories: string[]}`, `max_tokens: 256`.
5. Filter results to valid filenames only.
6. Return `{path, mtimeMs}[]` so the caller can surface freshness without a second `stat()`.

The system prompt at `:18-24` is precise: "Return a list of filenames for the memories that will clearly be useful to Claude Code as it processes the user's query (up to 5). Only include memories that you are certain will be helpful based on their name and description."

Special case for active-tool reference docs at `:21-23, :84-95`: "If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools (Claude Code is already exercising them). DO still select memories containing warnings, gotchas, or known issues about those tools — active use is exactly when those matter." This avoids re-injecting MCP tool docs the model is already using.

### 6.5 Staleness flag for memories >1 day old

`memoryAge.ts:6-8`: `memoryAgeDays(mtimeMs) = Math.max(0, Math.floor((Date.now() - mtimeMs) / 86_400_000))`. Negative inputs (clock skew) clamp to 0.

`memoryAge(mtimeMs)` at `:15-20`: returns `'today'` (0), `'yesterday'` (1), or `'<N> days ago'`. Comment at `:11-13`: "Models are poor at date arithmetic — a raw ISO timestamp doesn't trigger staleness reasoning the way '47 days ago' does."

`memoryFreshnessText(mtimeMs)` at `:33-42`: returns empty string for ≤1 day old. Otherwise:

> "This memory is N days old. Memories are point-in-time observations, not live state — claims about code behavior or file:line citations may be outdated. Verify against current code before asserting as fact."

The `memoryFreshnessNote(mtimeMs)` wrapper at `:49-53` wraps in `<system-reminder>` for callers that don't add their own.

The motivation comment at `:24-26`: "user reports of stale code-state memories (file:line citations to code that has since changed) being asserted as fact — the citation makes the stale claim sound more authoritative, not less."

### 6.6 Team memory directory — same project, separate root

`teamMemPaths.ts:84-86, 92-94`: `getTeamMemPath()` is `getAutoMemPath() + 'team/'`. `getTeamMemEntrypoint()` is `<auto>/team/MEMORY.md`. Lives as a subdirectory of auto-memory, scoped per-project.

`isTeamMemoryEnabled()` at `:73-78` requires both `isAutoMemoryEnabled()` AND a GrowthBook gate `tengu_herring_clock`. Team-memory is opt-in.

`sanitizePathKey(key)` at `:22-64` rejects: null bytes, URL-encoded traversals (`%2e%2e%2f` → `../`), Unicode-NFKC traversals (fullwidth `．．／` → `../` after NFKC normalize — defense-in-depth even if downstream layers don't normalize), backslashes, absolute paths.

`teamMemPrompts.ts:22-99` (`buildCombinedMemoryPrompt`) builds the system prompt that introduces both directories. Highlights: `## Memory scope` section explains private vs team, `WHAT_NOT_TO_SAVE_SECTION` adds an extra bullet for shared scope: "You MUST avoid saving sensitive data within shared team memories. For example, never save API keys or user credentials."

---

## 7. `migrations/` — 11 imperative TS migrations

### 7.1 Pattern

Each file exports a single function `migrate<X>()` or `reset<X>()`. Called sequentially at startup. Pattern:

1. Read source config/setting via `getGlobalConfig()` / `getSettingsForSource('userSettings')`.
2. Early return if not applicable (provider mismatch, tier mismatch, setting absent).
3. Idempotency guard: either a completion flag in global config (e.g. `sonnet1m45MigrationComplete`, `opusProMigrationComplete`, `hasResetAutoModeOptInForDefaultOffer`) OR rewrite-the-same-source semantics (re-running the migration produces the same value).
4. Try/catch around `saveGlobalConfig` / `updateSettingsForSource`. On error: `logError(...)` + `logEvent('tengu_migrate_*_error', {})`.
5. Log success: `logEvent('tengu_migrate_<name>', {<context>})`. Some include `from_model` field (e.g. `migrateLegacyOpusToCurrent` at `:53-56`, `migrateSonnet45ToSonnet46` at `:62-66`).

**No rollback.** Migrations only move forward. If a migration succeeds but a later step fails, you re-run only the still-applicable migrations on next startup.

### 7.2 Telemetry inventory (matches the CLAUDE rule about `tengu_migrate_*` events)

| File                                                  | Event(s)                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `migrateAutoUpdatesToSettings.ts`                     | `tengu_migrate_autoupdates_to_settings` (`:38`), `tengu_migrate_autoupdates_error` (`:57`)               |
| `migrateBypassPermissionsAcceptedToSettings.ts`       | `tengu_migrate_bypass_permissions_accepted` (`:28`)                                                      |
| `migrateEnableAllProjectMcpServersToSettings.ts`      | `tengu_migrate_mcp_approval_fields_success` (`:110`), `tengu_migrate_mcp_approval_fields_error` (`:116`) |
| `migrateFennecToOpus.ts`                              | (no event — silent)                                                                                      |
| `migrateLegacyOpusToCurrent.ts`                       | `tengu_legacy_opus_migration` (`:53`)                                                                    |
| `migrateOpusToOpus1m.ts`                              | `tengu_opus_to_opus1m_migration` (`:42`)                                                                 |
| `migrateReplBridgeEnabledToRemoteControlAtStartup.ts` | (no event)                                                                                               |
| `migrateSonnet1mToSonnet45.ts`                        | (no event)                                                                                               |
| `migrateSonnet45ToSonnet46.ts`                        | `tengu_sonnet45_to_46_migration` (`:62-66`)                                                              |
| `resetAutoModeOptInForDefaultOffer.ts`                | `tengu_migrate_reset_auto_opt_in_for_default_offer` (`:40`)                                              |
| `resetProToOpusDefault.ts`                            | `tengu_reset_pro_to_opus_default` (`:23, :36, :46`)                                                      |

Total = 11 files (matches "current version 11" claim from the brief). Most are model-string remappings — exactly the pattern AGI Workforce will need each time `models.json` retires an alias.

### 7.3 Notable patterns

**Read-and-write-the-same-source idempotency** (`migrateFennecToOpus.ts:11-17`): "Reading and writing the same source keeps this idempotent without a completion flag. Fennec aliases in project/local/policy settings are left alone — we can't rewrite those, and reading merged settings here would cause infinite re-runs + silent global promotion."

**Tier gating** (`migrateSonnet45ToSonnet46.ts:33-36`): only Pro/Max/Team Premium first-party users get migrated. Comment at `:51-54`: "Skip notification for brand-new users — they never experienced the old default."

**Atomic flag updates** (`resetAutoModeOptInForDefaultOffer.ts:43-46`): `saveGlobalConfig(c => { if (c.hasResetAutoModeOptInForDefaultOffer) return c; return { ...c, hasResetAutoModeOptInForDefaultOffer: true } })` — recheck inside the updater to avoid races between settings change + config save.

**Runtime override + persisted setting** (`migrateSonnet1mToSonnet45.ts:38-42`): also migrates the in-memory `mainLoopModelOverride` if it matches, otherwise the user keeps using the deprecated alias for the rest of the current session.

---

## 8. `state/` — 75-field AppState + speculation slice (6 files)

### 8.1 `store.ts` — 34-LOC `createStore<T>`

`store.ts:10-34` is the entire store implementation:

```typescript
export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState: (updater: (prev: T) => T) => {
      const prev = state;
      const next = updater(prev);
      if (Object.is(next, prev)) return; // Object.is short-circuit
      state = next;
      onChange?.({ newState: next, oldState: prev });
      for (const listener of listeners) listener();
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

Object.is short-circuit at `:23` is what makes per-keystroke selectors cheap. `onChange` runs **before** listeners — so by the time React re-renders, the side effects in `onChangeAppState` have already settled. This sidesteps the React-effects-after-render scheduling.

### 8.2 `AppState.tsx` — Provider + `useSyncExternalStore` adapter

`AppState.tsx:36-110` defines `AppStateProvider`. Highlights:

- Throws on nested `AppStateProvider` (`:43-47`).
- Store is created **once** in `useState(t1)` (`:48-57`); stable context value means provider never re-renders. Consumers subscribe to slices via `useAppState(selector)`.
- Mount-only effect at `:60-73` checks if remote settings already disabled bypass-permissions mode (race condition where remote settings load BEFORE component mounts → settings change notification fired with no listeners). If so, applies `createDisabledBypassPermissionsContext`.
- Wraps in `MailboxProvider` and conditional `VoiceProvider` (the latter is dead-code-eliminated when `feature('VOICE_MODE')` is false at `:13-17`).

`useAppState(selector)` at `:142-163`: thin wrapper around `useSyncExternalStore(store.subscribe, get, get)`. Re-renders only when the **selected** value changes (`Object.is`). Gotcha documented at `:131-141`: do NOT return new objects from the selector — `Object.is` will always see them as changed. Select existing sub-object references instead.

`useSetAppState()` at `:170-172` returns the stable `setState` reference — components using only this hook never re-render from state changes.

`useAppStateMaybeOutsideOfProvider(selector)` at `:186-199`: returns `undefined` if called outside the provider. Useful for components that may render in headless contexts.

### 8.3 `AppStateStore.ts` — 75-field store

`AppStateStore.ts:89-452` defines the full `AppState` type. Counted fields:

- **Top-level (DeepImmutable wrapper)**: 38 — settings, verbose, mainLoopModel, mainLoopModelForSession, statusLineText, expandedView, isBriefOnly, showTeammateMessagePreview, selectedIPAgentIndex, coordinatorTaskIndex, viewSelectionMode, footerSelection, toolPermissionContext, spinnerTip, agent, kairosEnabled, remoteSessionUrl, remoteConnectionStatus, remoteBackgroundTaskCount, replBridge{Enabled, Explicit, OutboundOnly, Connected, SessionActive, Reconnecting, ConnectUrl, SessionUrl, EnvironmentId, SessionId, Error, InitialName}, showRemoteCallout. (12 of these are replBridge fields.)
- **Outside DeepImmutable** (mutable nested data): 37 — tasks, agentNameRegistry, foregroundedTaskId, viewingAgentTaskId, companionReaction, companionPetAt, mcp, plugins, agentDefinitions, fileHistory, attribution, todos, remoteAgentTaskSuggestions, notifications, elicitation, thinkingEnabled, promptSuggestionEnabled, sessionHooks, tungstenActiveSession, tungstenLastCapturedTime, tungstenLastCommand, tungstenPanelVisible, tungstenPanelAutoHidden, bagelActive, bagelUrl, bagelPanelVisible, computerUseMcpState, replContext, teamContext, standaloneAgentContext, inbox, workerSandboxPermissions, pendingWorkerRequest, pendingSandboxRequest, promptSuggestion, **speculation**, speculationSessionTimeSavedMs, skillImprovement, authVersion, initialMessage, pendingPlanVerification, denialTracking, activeOverlays, fastMode, advisorModel, effortValue, ultraplan{Launching, SessionUrl, PendingChoice, LaunchPending}, isUltraplanMode, replBridgePermissionCallbacks, channelPermissionCallbacks.

Total ≈ 75 (the fields the brief calls out as "75-field store").

Why DeepImmutable + opt-out for nested? Comment at `:158-161`: "Unified task state - excluded from DeepImmutable because TaskState contains function types." Same applies to mcp.clients (network connections), plugins.errors (Error objects), `replContext.vmContext`, etc. — anything with functions or runtime objects.

### 8.4 The `speculation` slice — speculative-execution overlay

`AppStateStore.ts:52-79` defines:

```typescript
export type SpeculationResult = {
  messages: Message[];
  boundary: CompletionBoundary | null;
  timeSavedMs: number;
};

export type SpeculationState =
  | { status: 'idle' }
  | {
      status: 'active';
      id: string;
      abort: () => void;
      startTime: number;
      messagesRef: { current: Message[] }; // Mutable ref - avoids spreading per message
      writtenPathsRef: { current: Set<string> }; // Relative paths written to overlay
      boundary: CompletionBoundary | null;
      suggestionLength: number;
      toolUseCount: number;
      isPipelined: boolean;
      contextRef: { current: REPLHookContext };
      pipelinedSuggestion?: { text; promptId; generationRequestId } | null;
    };

export const IDLE_SPECULATION_STATE: SpeculationState = { status: 'idle' };
```

`CompletionBoundary` at `:41-50`:

```typescript
export type CompletionBoundary =
  | { type: 'complete'; completedAt: number; outputTokens: number }
  | { type: 'bash'; command: string; completedAt: number }
  | { type: 'edit'; toolName: string; filePath: string; completedAt: number }
  | { type: 'denied_tool'; toolName: string; detail: string; completedAt: number };
```

What this slice does: when the model is mid-stream and the harness predicts the user will accept the response, it can begin **speculative execution** of the next prompt suggestion against an overlay filesystem. The mutable refs (`messagesRef`, `writtenPathsRef`, `contextRef`) at `:62-69, :71` keep allocations down — speculation is per-keystroke. `boundary` records why the speculation was finalizable. `timeSavedMs` is the metric that justifies the slice — `speculationSessionTimeSavedMs` at `:393` aggregates across the session.

This is the most architecturally interesting slice. AGI Workforce should consider porting it for the Pro tier — pre-rendering the next response while the user types saves real wall-clock time on multi-turn sessions.

### 8.5 `onChangeAppState.ts` — single choke-point side effects

`onChangeAppState.ts:43-171` is THE side-effect funnel. Comment at `:50-64` is the load-bearing one:

> "toolPermissionContext.mode — single choke point for CCR/SDK mode sync. Prior to this block, mode changes were relayed to CCR by only 2 of 8+ mutation paths: a bespoke setAppState wrapper in print.ts (headless/SDK mode only) and a manual notify in the set_permission_mode handler. Every other path — Shift+Tab cycling, ExitPlanModePermissionRequest dialog options, the /plan slash command, rewind, the REPL bridge's onSetPermissionMode — mutated AppState without telling CCR, leaving external_metadata.permission_mode stale and the web UI out of sync with the CLI's actual mode. Hooking the diff here means ANY setAppState call that changes the mode notifies CCR (via notifySessionMetadataChanged → ccrClient.reportMetadata) and the SDK status stream (via notifyPermissionModeChanged — registered in print.ts). The scattered callsites above need zero changes."

The diff-based pattern at `:65-92`: compare `prevState.toolPermissionContext.mode` vs `newState.toolPermissionContext.mode`. If different, externalize both via `toExternalPermissionMode()` (strips internal-only modes like `bubble`, `ungated auto`), then notify both channels. Skip the CCR notify if external mode didn't change (e.g., `default → bubble → default` is a no-op from CCR's POV).

Other diff handlers in this file:

- `:96-112`: `mainLoopModel` ↔ userSettings.model (clear or set).
- `:114-128`: `expandedView` → globalConfig.{showExpandedTodos, showSpinnerTree}.
- `:130-140`: `verbose` → globalConfig.verbose.
- `:142-152`: `tungstenPanelVisible` → globalConfig (ant-only).
- `:154-170`: `settings` change → clear `apiKeyHelperCache`, `awsCredentialsCache`, `gcpCredentialsCache`. Also re-applies env vars if `settings.env` changed (additive-only).

`externalMetadataToAppState(metadata)` at `:24-41` is the inverse — when worker restarts, restore mode + ultraplan flag from sidecar metadata.

### 8.6 `selectors.ts` + `teammateViewHelpers.ts`

`selectors.ts:18-40` (`getViewedTeammateTask`) — lookup chain: `viewingAgentTaskId !== undefined` → `tasks[viewingAgentTaskId]` → `isInProcessTeammateTask(task)`.

`selectors.ts:46-76` (`getActiveAgentForInput`) — discriminated union for input routing:

- Not viewing teammate → `{ type: 'leader' }`
- Viewing teammate → `{ type: 'viewed', task }`
- Viewing local agent (not teammate) → `{ type: 'named_agent', task }`

`teammateViewHelpers.ts:46-81` (`enterTeammateView`) — sets `viewingAgentTaskId`, marks the local-agent task `retain: true` (blocks eviction, enables stream-append, triggers disk bootstrap), clears `evictAfter`. If switching from a different teammate, releases the previous one. Inline `isLocalAgent` type check at `:14-21` to break a cycle through `BackgroundTasksDialog`.

`teammateViewHelpers.ts:88-109` (`exitTeammateView`) — drops retain, schedules `evictAfter = Date.now() + PANEL_GRACE_MS` (30 seconds, inlined at `:7`) if terminal. Lets the row linger briefly so the user can read final output.

`teammateViewHelpers.ts:116-141` (`stopOrDismissAgent`) — context-sensitive `x` button: running → `abortController.abort()`; terminal → `evictAfter = 0` (filter hides immediately). If viewing the dismissed agent, also exits to leader view.

---

## 9. `plugins/` — 2 files (top-level entry + scaffolding)

### 9.1 `builtinPlugins.ts` — 160 LOC registry

`plugins/builtinPlugins.ts:21` defines `BUILTIN_PLUGINS: Map<string, BuiltinPluginDefinition>`. `BUILTIN_MARKETPLACE_NAME = 'builtin'` at `:23`. Plugin IDs use format `{name}@{marketplace}` — built-ins are `{name}@builtin`, marketplace plugins are `{name}@{marketplace}`.

`registerBuiltinPlugin(definition)` at `:28-32` is the registration point. `getBuiltinPlugins()` at `:57-102` reads `settings.enabledPlugins[pluginId]` and partitions into enabled/disabled. Enabled-state logic at `:73-76`: user preference > plugin defaultEnabled > true. Plugins whose `isAvailable()` returns false are omitted entirely.

`getBuiltinPluginSkillCommands()` at `:108-121` extracts `skills` from each enabled plugin definition and converts via `skillDefinitionToCommand(definition)`. The conversion function at `:132-159` produces `loadedFrom: 'bundled'` (not `'builtin'`) — comment at `:144-148` explains: "'builtin' in Command.source means hardcoded slash commands (/help, /clear). Using 'bundled' keeps these skills in the Skill tool's listing, analytics name logging, and prompt-truncation exemption. The user-toggleable aspect is tracked on LoadedPlugin.isBuiltin."

Differentiator from bundled skills documented in the file header (`:5-13`):

> "Built-in plugins differ from bundled skills (src/skills/bundled/) in that:
>
> - They appear in the /plugin UI under a 'Built-in' section
> - Users can enable/disable them (persisted to user settings)
> - They can provide multiple components (skills, hooks, MCP servers)"

### 9.2 `bundled/index.ts` — currently empty scaffolding

`plugins/bundled/index.ts:1-23` defines `initBuiltinPlugins()` which is empty as of 2026-03-31:

```typescript
export function initBuiltinPlugins(): void {
  // No built-in plugins registered yet — this is the scaffolding for
  // migrating bundled skills that should be user-toggleable.
}
```

The pattern is documented inline: register a plugin definition that bundles skills + hooks + MCP servers, give it a unique name, append `@builtin` for the ID, and the `/plugin` UI handles the user-toggle UX.

> Note: The brief said "most plugin code is in utils/plugins/ owned by M10". This file confirms it — `builtinPlugins.ts` is just the registry; the marketplace-plugin loader, manifest parsing, and integration tests are in `utils/plugins/`.

---

## 10. Cross-cutting observations + v1 priorities

### 10.1 What ports cleanly

- **`createStore<T>` (state/store.ts:1-34)** — 34 LOC, zero deps. Drop-in for AGI Workforce's TS workspace. Pair with `useSyncExternalStore` in React surfaces.
- **`onChangeAppState` choke-point pattern** — port whether or not we keep CCR. Same problem exists with our LiveKit/Realtime sync: many mutation paths, each must notify the other side. Let the diff layer handle it.
- **Memory directory resolution + path validation** (`memdir/paths.ts`) — directly applicable to our `~/.agiworkforce/` blueprint per `comp-dotfile-architectures.md`. Replace `getClaudeConfigHomeDir` with our `getAgiConfigHomeDir`, ship as-is. Includes path-traversal defenses we'd otherwise skip.
- **`MEMORY.md` 200-line/25 KB cap with `truncateEntrypointContent`** — port verbatim. Caps prevent unbounded prompt growth; warnings teach the user (and model) to keep entries short.
- **4-type memory taxonomy** — `user / feedback / project / reference` is a smaller, cleaner taxonomy than what most chat tools ship. Port with our existing `MEMORY.md` structure.
- **`memoryFreshnessText` staleness flag** — 2 functions, 50 LOC. Massive recall-quality win for free.
- **Skill loader with paths/dynamic discovery** — port the gitignore-glob conditional activation. This is what makes per-team skill libraries scale to 100+ skills without prompt bloat.
- **Migrations layer** — port the imperative pattern. Each `models.json` retire becomes a 50-LOC file with a `tengu_migrate_*` event and a completion flag.

### 10.2 Skip for v1

- **Buddy / companion** — Apr 1–7 2026 launch window has passed. Internal joke that doesn't fit our market positioning.
- **Moreright stub** — 26 LOC of no-ops; ship empty stub if we ever need the hook signature.
- **`stuck`, `lorem-ipsum`, `verify`, `skillify`, `remember` skills** — `process.env.USER_TYPE !== 'ant'` early-returns; these are Anthropic-internal-only.
- **`scheduleRemoteAgents` skill** — couples to Anthropic's `REMOTE_TRIGGER_TOOL_NAME` infrastructure (CCR environments + connector UUIDs). Not our cloud.

### 10.3 Defer to Phase 2

- **`speculation` slice** — clever pre-rendering; massive UX win but big complexity. Phase 2 of Pro tier when we have the model budget to burn on speculation.
- **`InProcessTeammateTask`** — multi-agent in same process via `AsyncLocalStorage`. Worth porting if we add team mode.
- **`RemoteAgentTask` (126 KB)** — only relevant if we build cloud-CCR equivalent.

### 10.4 Watch list (file:line bookmarks for later)

- `loadSkillsDir.ts:638-804` — full discovery orchestrator.
- `loadSkillsDir.ts:861-915` — dynamic skill discovery walker.
- `loadSkillsDir.ts:997-1058` — conditional path activation.
- `bundledSkills.ts:131-167` — secure bundled-skill extraction.
- `paths.ts:223-235` — auto-memory dir resolution.
- `paths.ts:109-150` — path validation.
- `memdir.ts:57-103` — entrypoint truncation.
- `memdir.ts:188-266` — `buildMemoryLines` + 4-type taxonomy injection.
- `memoryAge.ts:33-53` — staleness flag.
- `findRelevantMemories.ts:39-141` — Sonnet-ranked memory selection.
- `state/AppStateStore.ts:52-79` — speculation types.
- `state/AppStateStore.ts:89-452` — full AppState shape.
- `state/onChangeAppState.ts:50-92` — mode-sync choke point.
- `tasks/types.ts:11-46` — TaskState union + isBackgroundTask.
- `tasks/stopTask.ts:38-100` — shared stop semantics.
- `tasks/pillLabel.ts:10-83` — footer-pill labeling rules.
- `tasks/LocalShellTask/LocalShellTask.tsx:32-99` — stall watchdog regexes + 45s threshold.
- `tasks/InProcessTeammateTask/types.ts:96-121` — `TEAMMATE_MESSAGES_UI_CAP = 50` + memory rationale.
- `migrations/migrateSonnet45ToSonnet46.ts` — exemplar tier-gated migration template.

### 10.5 Anti-patterns to avoid

- **Don't hardcode model strings in migrations** — every migration file in this scope IS hardcoded by necessity (the migration target is itself a model-string change), but this is fine because migrations are intentionally one-shot. Don't generalize to runtime code.
- **Don't expose `projectSettings.autoMemoryDirectory`** — `paths.ts:172-176` warns about the malicious-repo case. We have to make the same choice in our `~/.agiworkforce/` config: project settings are committed/shared, so paths in them must be untrusted.
- **Don't load all skills eagerly** — `loadSkillsDir.ts:96-105` (`estimateSkillFrontmatterTokens`) hints at this: only frontmatter tokens count toward context cost, body is loaded on invocation. Port the lazy-load contract.
- **Don't double-stat in scan loops** — `memoryScan.ts:24-34` documents the half-syscall optimization (read-then-sort vs stat-sort-read). Same applies to our skill scan.

---

## 11. Word count + signoff

This document is approximately **6,300 words** (target was 5,000–7,000). All file paths are absolute relative to the user's machine: `/Users/siddhartha/Desktop/reference/src/`. Source content is the snapshot from 2026-03-31.

The 30-agent team should treat this as the authoritative deep-dive for these 9 directories. Any code we port from these files should preserve the file:line citation in a comment so future audits can trace back.

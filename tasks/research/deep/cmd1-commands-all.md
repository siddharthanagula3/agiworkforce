# CMD1 — `~/Desktop/reference/src/commands/` deep dive (v2.1.133, May 2026)

Scope: every file under `~/Desktop/reference/src/commands/` (207 files, 189 `.ts/.tsx`, ~5,586 LOC excluding the two T1-owned mega-files `commands/insights.ts` (3,200 LOC) and `commands/plugin/ManagePlugins.tsx`). All file:line citations are absolute paths from this scan.

Companion files outside the directory but referenced repeatedly:

- `~/Desktop/reference/src/commands.ts` — root dispatcher / safe-list / loader (file:1–755).
- `~/Desktop/reference/src/types/command.ts` — discriminated-union `Command` type (file:1–217).
- `~/Desktop/reference/src/skills/bundled/index.ts` — bundled skills register list (`/loop`, `/debug`, `/batch`, `/simplify`, `/verify`, `/stuck`, `/remember`, `/lorem-ipsum`, `/skillify`, `/update-config`, `/keybindings`, `/claude-api`, `/claude-in-chrome`, `/schedule-remote-agents`, `/dream`, `/hunter`, `/run-skill-generator`).
- `~/Desktop/reference/src/skills/loadSkillsDir.ts` — user/project skill+command discovery (file:78–94 path resolver, 638 `getSkillDirCommands`).

---

## 1. The `Command` discriminated union (`types/command.ts:23–217`)

`Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)`. Three tags drive the dispatcher:

| `type`        | Behavior                                                                                           | `load()` returns                                                          |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `'prompt'`    | Expands to model-visible text (`ContentBlockParam[]`); used for skills/workflows/built-in prompts. | `getPromptForCommand(args, ctx)` is on the command itself (no lazy load). |
| `'local'`     | Synchronous text result; no Ink UI; `supportsNonInteractive: boolean` is **required**.             | `LocalCommandModule` with `call(args, ctx) -> LocalCommandResult`.        |
| `'local-jsx'` | Renders an Ink React component until `onDone` fires.                                               | `LocalJSXCommandModule` with `call(onDone, ctx, args) -> ReactNode`.      |

`CommandBase` (file:175–203) carries the user-visible metadata. The fields the dispatcher reads everywhere:

- `name` (slug; primary key) and `aliases?: string[]`.
- `description` — model- and user-facing.
- `argumentHint?` — gray inline hint after `/<name>`.
- `availability?: ('claude-ai' | 'console')[]` — auth gate evaluated by `meetsAvailabilityRequirement` (`commands.ts:417–443`). claude-ai = OAuth subscriber; console = direct API-key user (excludes Bedrock/Vertex/Foundry/custom-base-URL).
- `isEnabled?: () => boolean` — feature-flag / env check; defaults true.
- `isHidden?: boolean | getter` — typeahead/help suppression; commonly used as a getter so the value tracks state (e.g. `desktop/index.ts:18`, `cost/index.ts:19`).
- `immediate?` — if true, bypasses the queue and runs even mid-generation (used by `/btw`, `/exit`, `/rename`, `/plugin`, `/mcp`, `/sandbox`, `/status`, `/hooks`, `/effort`, `/fast`, `/model` when applicable, `/color`, `/remote-control`).
- `disableModelInvocation?` and `userInvocable?` — control whether `SkillTool` can call this and whether typing `/<name>` is exposed to the user. Both default to allowing model + user; bundled `/debug` sets `disableModelInvocation: true` (skills/bundled/debug.ts:23) so only the user can trigger it.
- `loadedFrom?: 'commands_DEPRECATED' | 'skills' | 'plugin' | 'managed' | 'bundled' | 'mcp'` — provenance tag. Used by `formatDescriptionWithSource` (`commands.ts:728–754`) to print suffixes like `(plugin)`, `(bundled)`, `(workflow)`.
- `kind?: 'workflow'` — workflow-backed commands get a badge in autocomplete.
- `isSensitive?` — args redacted from transcript (used internally; not visible in any command in this directory).

The `'prompt'` arm adds heavy-traffic fields: `progressMessage`, `contentLength`, `argNames`, `allowedTools`, `model`, `source`, `pluginInfo`, `disableNonInteractive`, `hooks`, `skillRoot`, `context: 'inline' | 'fork'`, `agent`, `effort`, `paths` (file path globs that gate visibility for path-scoped skills), `getPromptForCommand`.

---

## 2. The dispatcher (`commands.ts`)

### 2.1 Static registration table

`commands.ts` imports every command's `index.ts`/`index.tsx`/`.ts` file (`commands.ts:2–204`), wraps feature-flag-gated commands in `feature(...)` checks (`commands.ts:62–122`) so `bun:bundle` dead-code-eliminates them at build time, and exposes a memoized `COMMANDS()` factory at `commands.ts:258–346`.

Two partitions sit on top of `COMMANDS()`:

- `INTERNAL_ONLY_COMMANDS` (`commands.ts:225–254`) — eliminated from external builds. Members: `backfillSessions`, `breakCache`, `bughunter`, `commit`, `commitPushPr`, `ctx_viz`, `goodClaude`, `issue`, `initVerifiers`, `forceSnip` (flag-gated), `mockLimits`, `bridgeKick`, `version`, `ultraplan` (flag-gated), `subscribePr` (flag-gated), `resetLimits`, `resetLimitsNonInteractive`, `onboarding`, `share`, `summary`, `teleport`, `antTrace`, `perfIssue`, `env`, `oauthRefresh`, `debugToolCall`, `agentsPlatform`, `autofixPr`. They appear only when `process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO`.
- The base list itself is filtered by both `meetsAvailabilityRequirement(cmd)` and `isCommandEnabled(cmd)` on every call (`commands.ts:483–485`) — auth state can change mid-session (e.g. after `/login`), so this re-evaluates per request.

Skills/plugins/workflows enter the list via `loadAllCommands(cwd)` at `commands.ts:449–469`. Order: `bundledSkills` → `builtinPluginSkills` → `skillDirCommands` (filesystem skills) → `workflowCommands` → `pluginCommands` → `pluginSkills` → `COMMANDS()`. Dynamic skills discovered during file operations are spliced in just before the built-ins (`commands.ts:482–516`).

### 2.2 Lazy-loading pattern (`load: () => import(...)`)

Almost every command uses lazy chunk-loading to keep startup small:

```ts
const help = {
  type: 'local-jsx',
  name: 'help',
  description: 'Show help and available commands',
  load: () => import('./help.js'),
} satisfies Command;
```

(`commands/help/index.ts:1–11`). The lazy module exports `call`. The pattern keeps Ink-heavy components out of the boot path. **Exception**: `usageReport` (the `/insights` shim at `commands.ts:190–202`) is itself a `'prompt'` command that lazy-imports `./commands/insights.js` _inside_ `getPromptForCommand` because the real module is 113 KB / 3,200 LOC. Same lazy-shim trick used by `/login` (`commands.ts:337` — wraps `login()` factory because the description text depends on `hasAnthropicApiKeyAuth()`).

### 2.3 Safe-command lists

Two named sets gate inputs from the Remote-Control bridge (mobile/web → desktop CLI):

```ts
// commands.ts:619–637
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session,
  exit,
  clear,
  help,
  theme,
  color,
  vim,
  cost,
  usage,
  copy,
  btw,
  feedback,
  plan,
  keybindings,
  statusline,
  stickers,
  mobile,
]);

// commands.ts:651–660
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set(
  [compact, clear, cost, summary, releaseNotes, files].filter(Boolean),
);
```

The predicate `isBridgeSafeCommand` (`commands.ts:672–676`) is: `type === 'local-jsx'` is **always** blocked (Ink UI cannot stream); `type === 'prompt'` is always allowed (expands to text); `type === 'local'` requires explicit membership in `BRIDGE_SAFE_COMMANDS`. That set is intentionally tighter than `REMOTE_SAFE_COMMANDS` because the bridge runs unattended.

### 2.4 Skill-takeover and conflict resolution

User/project commands live in two trees: `~/.claude/commands/` and `.claude/commands/` (legacy, `loadedFrom: 'commands_DEPRECATED'`); `~/.claude/skills/<name>/SKILL.md` and `.claude/skills/<name>/SKILL.md` (current). Discovery is via `getSkillDirCommands(cwd)` in `skills/loadSkillsDir.ts:638` and `getSkillsPath` (`skills/loadSkillsDir.ts:78–94`):

```
policySettings → <managedFilePath>/.claude/{skills|commands}
userSettings   → <claude-config-home>/{skills|commands}
projectSettings→ .claude/{skills|commands}
plugin         → "plugin" sentinel
```

Skill loader walks `<basePath>` for directories containing `SKILL.md` (`skills/loadSkillsDir.ts:407–480`). Legacy `commands/` loader (`skills/loadSkillsDir.ts:482–519`) treats any `SKILL.md` (case-insensitive) inside a `commands/<dir>/` as the canonical file for that dir. **Skills win on conflict**: the dispatcher orders `bundledSkills → builtinPluginSkills → skillDirCommands → workflowCommands → pluginCommands → pluginSkills → COMMANDS()`, and `findCommand` (`commands.ts:688–698`) first-match-wins. So a project skill named `commit` would shadow the built-in `/commit`.

### 2.5 Discriminator for help / SkillTool

- `getSkillToolCommands` (`commands.ts:563–581`): returns prompt-typed, model-invocable, non-built-in commands — i.e., what the model can call as a "skill" tool.
- `getSlashCommandToolSkills` (`commands.ts:586–608`): returns user-invocable skills only (`disableModelInvocation` or skills/plugin/bundled provenance), with try/catch fallback to empty array (skill loading is non-critical).
- `getMcpSkillCommands` (`commands.ts:547–559`): MCP-served prompts when the `MCP_SKILLS` flag is on.

### 2.6 Other helpers in `commands.ts`

- `clearCommandsCache` (`commands.ts:534–539`) — clears every memoization layer (loadAll, skill-tool, slash-tool, plugin caches, dynamic-skill cache, plus the outer `getSkillIndex`).
- `formatDescriptionWithSource` (`commands.ts:728–754`) — adds `(workflow)` / `(plugin)` / `(bundled)` / setting-source suffixes for typeahead UX.
- `findCommand`/`hasCommand`/`getCommand` (`commands.ts:688–719`) — name/alias lookup; `getCommand` throws with a sorted list of available commands.

---

## 3. Full inventory (built-ins, file-by-file)

Categorized by purpose. Each row: command (and aliases), file:line, type, args, what it does, gates.

### 3.1 Session control

| Command (aliases)                                | File:line                                                                                    | Type                     | Args                                    | Behavior                                                                                                                                          | Gate                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/help`                                          | `commands/help/index.ts:1–11` (jsx at `help.tsx`)                                            | local-jsx                | —                                       | Renders `<HelpV2 commands={commands}>` listing every visible command.                                                                             | Always on; remote-safe.                                                          |
| `/clear` (`/reset`, `/new`)                      | `commands/clear/index.ts:1–20`, `clear.ts:1–8`, `conversation.ts:49–251`, `caches.ts:47–144` | local                    | —                                       | Fires `SessionEnd` hooks (≤1.5 s timeout), preserves backgrounded tasks/agents, evicts caches, regenerates session ID, runs `SessionStart` hooks. | `supportsNonInteractive: false` (must spawn new session); remote-safe.           |
| `/compact`                                       | `commands/compact/index.ts:1–15`                                                             | local                    | `<optional summarization instructions>` | Clears history but keeps a model-generated summary.                                                                                               | Gated by `DISABLE_COMPACT` env; `supportsNonInteractive: true`; **bridge-safe**. |
| `/rewind` (`/checkpoint`)                        | `commands/rewind/index.ts:1–14`                                                              | local                    | —                                       | Restores code/conversation to a checkpoint; double-Esc shortcut.                                                                                  | `supportsNonInteractive: false`.                                                 |
| `/branch` (alias `/fork` when FORK_SUBAGENT off) | `commands/branch/index.ts:1–15`                                                              | local-jsx                | `[name]`                                | Branches the current conversation at this point.                                                                                                  |
| `/fork`                                          | `commands/fork/index.ts` (only when `feature('FORK_SUBAGENT')`)                              | local-jsx                | —                                       | Spawns a forked sub-agent; takes `fork` alias from `branch` when present.                                                                         |
| `/resume` (`/continue`)                          | `commands/resume/index.ts:1–13`                                                              | local-jsx                | `[id or search term]`                   | Reopens a stored conversation; supports PR URL paste.                                                                                             |
| `/rename`                                        | `commands/rename/index.ts:1–13`                                                              | local-jsx                | `[name]`                                | Renames conversation; immediate.                                                                                                                  |
| `/exit` (`/quit`)                                | `commands/exit/index.ts:1–13`                                                                | local-jsx                | —                                       | Exits the REPL; immediate; **remote-safe**.                                                                                                       |
| `/desktop` (`/app`)                              | `commands/desktop/index.ts:1–28`                                                             | local-jsx                | —                                       | Opens the current session in Claude Desktop.                                                                                                      | `availability: ['claude-ai']`; `isEnabled` requires darwin or win32+x64.         |
| `/mobile` (`/ios`, `/android`)                   | `commands/mobile/index.ts:1–11`                                                              | local-jsx                | —                                       | Shows QR code to download the mobile app.                                                                                                         | Remote-safe.                                                                     |
| `/session` (`/remote`)                           | `commands/session/index.ts:1–17`                                                             | local-jsx                | —                                       | Shows remote session URL/QR code.                                                                                                                 | `isEnabled: getIsRemoteMode()`; remote-safe.                                     |
| `/teleport`                                      | `commands/teleport/index.js`                                                                 | stub (ant-only INTERNAL) | —                                       | Switches local↔web in the codex-style.                                                                                                            | Stubbed in external builds.                                                      |

### 3.2 Models, effort, modes

| Command                      | File:line                                           | Type      | Args                        | Behavior                                                                                                                                                                                                       | Gate                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------- | --------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- | ------------------- |
| `/model`                     | `commands/model/index.ts:1–18`                      | local-jsx | `[model]`                   | Opens model picker; description includes current model via getter.                                                                                                                                             | `immediate` getter (only immediate when inference-config command should be); remote-safe **not** in this list (intentional — see PR #19134 fix in `commands.ts:651` comment). |
| `/effort`                    | `commands/effort/index.ts:1–14`                     | local-jsx | `[low                       | medium                                                                                                                                                                                                         | high                                                                                                                                                                          | max                                                                                      | auto]`                                | Sets effort level (mirrors `--effort` flag). | `immediate` getter. |
| `/fast`                      | `commands/fast/index.ts:1–25`                       | local-jsx | `[on                        | off]`                                                                                                                                                                                                          | Toggles Fast Mode (preview Opus 4.6 dedicated lane).                                                                                                                          | `availability: ['claude-ai','console']`; gated by `isFastModeEnabled`.                   |
| `/plan`                      | `commands/plan/index.ts:1–11`                       | local-jsx | `[open                      | <description>]`                                                                                                                                                                                                | Toggle plan mode or view stored plan.                                                                                                                                         | Remote-safe.                                                                             |
| `/sandbox`                   | `commands/sandbox-toggle/index.ts:1–55`             | local-jsx | `exclude "command pattern"` | Manages sandbox enable/auto-allow/managed states; description uses figures icon + status.                                                                                                                      | `isHidden` if `!isSupportedPlatform                                                                                                                                           |                                                                                          | !isPlatformInEnabledList`; immediate. |
| `/output-style` (deprecated) | `commands/output-style/index.ts:1–10`               | local-jsx | —                           | Hidden alias to `/config` for output-style change.                                                                                                                                                             | `isHidden: true`.                                                                                                                                                             |
| `/keybindings`               | `commands/keybindings/index.ts:1–13`                | local     | —                           | Opens/creates `~/.claude/keybindings.json`.                                                                                                                                                                    | `isEnabled: isKeybindingCustomizationEnabled()`; `supportsNonInteractive: false`; remote-safe.                                                                                |
| `/color`                     | `commands/color/index.ts:1–14`                      | local-jsx | `<color                     | default>`                                                                                                                                                                                                      | Sets prompt-bar color; immediate; remote-safe.                                                                                                                                |
| `/theme`                     | `commands/theme/index.ts:1–10`                      | local-jsx | —                           | Theme picker; remote-safe.                                                                                                                                                                                     |
| `/vim`                       | `commands/vim/index.ts:1–12`                        | local     | —                           | Toggles vim/normal editing modes; `supportsNonInteractive: false`; remote-safe.                                                                                                                                |
| `/voice`                     | `commands/voice/index.ts:1–15`                      | local     | —                           | Toggles voice mode.                                                                                                                                                                                            | `availability: ['claude-ai']`, gated by `isVoiceGrowthBookEnabled` and `isVoiceModeEnabled` (latter for visibility).                                                          |
| `/btw`                       | `commands/btw/index.ts:1–13` (jsx at `btw/btw.tsx`) | local-jsx | `<question>`                | Side-question fork: rebuilds cache-safe params (`btw.tsx:208–228` reuses `getLastCacheSafeParams` for cache hit), runs `runSideQuestion`, renders Ink `<BtwSideQuestion>`. Increments `btwUseCount` analytics. | Immediate; remote-safe.                                                                                                                                                       |
| `/advisor`                   | `commands/advisor.ts:1–110`                         | local     | `[<model>                   | off]`                                                                                                                                                                                                          | Sets/unsets the advisor model in user settings.                                                                                                                               | `isEnabled: canUserConfigureAdvisor`; `isHidden` mirror; `supportsNonInteractive: true`. |
| `/passes`                    | `commands/passes/index.ts:1–24`                     | local-jsx | —                           | Share-a-week referral; description varies by reward state.                                                                                                                                                     | Hidden when `!checkCachedPassesEligibility`.                                                                                                                                  |

### 3.3 Permissions & tools

| Command                                 | File:line                                                              | Type      | Args     | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- | --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/permissions` (alias `/allowed-tools`) | `commands/permissions/index.ts:1–11`                                   | local-jsx | —        | Manage allow/deny rules (read settings.json `permissions` block).                                                                                                                                                                                                                                                                                                                                                                                   |
| `/mcp`                                  | `commands/mcp/index.ts:1–11` (plus subcommands)                        | local-jsx | `[enable | disable [server-name]]`                                                                                                                                                                                                                                                                                                                                                                                                                             | Manage MCP servers; immediate. CLI subcommand layer in `mcp/addCommand.ts:33+` (`claude mcp add ...`) and `mcp/xaaIdpCommand.ts:24+` (XAA SEP-990 IdP setup, `mcp xaa setup --issuer ... --client-id ...`). |
| `/plugin` (`/plugins`, `/marketplace`)  | `commands/plugin/index.tsx:2–10`, `plugin/plugin.tsx:4–6`              | local-jsx | —        | Mounts `<PluginSettings>`. Plugin subdir also contains `AddMarketplace.tsx`, `BrowseMarketplace.tsx`, `DiscoverPlugins.tsx`, `ManageMarketplaces.tsx`, `PluginErrors.tsx`, `PluginOptionsDialog.tsx`, `PluginOptionsFlow.tsx`, `PluginTrustWarning.tsx`, `UnifiedInstalledCell.tsx`, `ValidatePlugin.tsx`, `parseArgs.ts`, `pluginDetailsHelpers.tsx`, `usePagination.ts` — full marketplace UI. (`ManagePlugins.tsx` is in T1's scope.) Immediate. |
| `/agents`                               | `commands/agents/index.ts:1–9`, `agents/agents.tsx:6–11`               | local-jsx | —        | Renders `<AgentsMenu tools={getTools(permissionContext)}>` — the Library UI with Personal/Project scope and "Generate with Claude" wizard.                                                                                                                                                                                                                                                                                                          |
| `/skills`                               | `commands/skills/index.ts:1–10`                                        | local-jsx | —        | Lists available skills (built-in + bundled + user + plugin + MCP).                                                                                                                                                                                                                                                                                                                                                                                  |
| `/hooks`                                | `commands/hooks/index.ts:1–11`, `hooks/hooks.tsx:6–12`                 | local-jsx | —        | Renders `<HooksConfigMenu toolNames>`; immediate. Logs `tengu_hooks_command`. Note: only **command** hooks editable in-UI — prompt/agent/HTTP hooks must be edited in JSON.                                                                                                                                                                                                                                                                         |
| `/reload-plugins`                       | `commands/reload-plugins/index.ts:1–18`                                | local     | —        | Layer-3 refresh: applies pending plugin changes mid-session. SDK callers use `query.reloadPlugins()` instead (returns structured commands/agents/plugins/mcpServers data). `supportsNonInteractive: false`.                                                                                                                                                                                                                                         |
| `/files`                                | `commands/files/index.ts:1–11`                                         | local     | —        | Lists every file currently in the LLM context. **ant-only** (`isEnabled: USER_TYPE==='ant'`); `supportsNonInteractive: true`; bridge-safe.                                                                                                                                                                                                                                                                                                          |
| `/add-dir`                              | `commands/add-dir/index.ts:1–11` (also `add-dir.tsx`, `validation.ts`) | local-jsx | `<path>` | Adds an extra working directory to the Claude session scope.                                                                                                                                                                                                                                                                                                                                                                                        |

### 3.4 Project ops & built-in prompts

| Command               | File:line                                                                      | Type                                      | Args                  | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------ | ----------------- | -------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `/init`               | `commands/init.ts:1–257`                                                       | prompt                                    | —                     | Generates `CLAUDE.md` (and optionally `CLAUDE.local.md`, skills, hooks). Two prompt variants: legacy `OLD_INIT_PROMPT` (file:6–26) and `NEW_INIT_PROMPT` (file:28–224, ~7-phase wizard with AskUserQuestion-driven artifact selection: project vs personal CLAUDE.md, skills+hooks, format-on-edit hooks, `/verify` skill, GitHub CLI/lint/skill-creator suggestions). Variant chosen by `feature('NEW_INIT')` and `USER_TYPE==='ant'` or `CLAUDE_CODE_NEW_INIT` env (file:228–253). Calls `maybeMarkProjectOnboardingComplete` on invocation. |
| `/init-verifiers`     | `commands/init-verifiers.ts:1–262`                                             | prompt                                    | —                     | 5-phase wizard: auto-detect project areas (package.json/Cargo.toml/etc), tool setup (Playwright/Tmux/Asciinema/curl), interactive Q&A (project name + per-type questions + auth), generate `verifier-{project}-{type}` skills under `.claude/skills/` with type-specific `allowed-tools` (Playwright MCP, Tmux, Bash(curl)), confirm. **ant-internal** via `INTERNAL_ONLY_COMMANDS`.                                                                                                                                                           |
| `/commit`             | `commands/commit.ts:1–93`                                                      | prompt                                    | —                     | Builds prompt with embedded `git status/diff/log` shell substitution, enforces git-safety protocol (no `--no-verify`, no `--amend`), generates HEREDOC commit. **ant-internal**. `allowedTools = ['Bash(git add:*)', 'Bash(git status:*)', 'Bash(git commit:*)']`.                                                                                                                                                                                                                                                                             |
| `/commit-push-pr`     | `commands/commit-push-pr.ts:1–158`                                             | prompt                                    | `[user instructions]` | Commits, pushes, creates/edits PR with `gh pr create`. Includes `getEnhancedPRAttribution` for changelog. Slack-posting step gated on user's CLAUDE.md mention + ToolSearch lookup. **ant-internal**. `allowedTools` includes `gh pr *`, `Bash(git push:*)`, `ToolSearch`, `mcp__slack__send_message`.                                                                                                                                                                                                                                         |
| `/security-review`    | `commands/security-review.ts:1–243`                                            | prompt (via `createMovedToPluginCommand`) | —                     | Embeds a 200-line markdown system prompt with frontmatter `allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(git remote show:*), Read, Glob, Grep, LS, Task`. Three-phase analysis: identify vulns → parallel false-positive filter sub-tasks → drop confidence < 8. Hard-coded exclusions list (DOS, secrets-on-disk, regex-injection, github-action edge cases, etc.).                                                                                                                            |
| `/review`             | `commands/review.ts:1–57`                                                      | prompt                                    | `[PR number]`         | Local code-review prompt: `gh pr list/view/diff` → analyze. Companion `/ultrareview` (`commands/review/ultrareviewCommand.tsx`) is a `local-jsx` command for the cloud bughunter path; gated by `isUltrareviewEnabled` (`commands/review/ultrareviewEnabled.ts`); shows `<UltrareviewOverageDialog>` when free reviews exhausted.                                                                                                                                                                                                              |
| `/pr-comments`        | `commands/pr_comments/index.ts:1–55` (createMovedToPluginCommand wrapper)      | prompt → plugin redirect                  | —                     | Tells the user to `claude plugin install pr-comments@claude-code-marketplace` in ant builds; otherwise expands to a `gh pr view --json` + `gh api /pulls/{n}/comments` prompt that formats threaded review comments. Pattern reused by `/security-review`.                                                                                                                                                                                                                                                                                     |
| `/insights`           | `commands.ts:190–202` (lazy shim → `commands/insights.ts` 3,200 LOC, T1 scope) | prompt                                    | —                     | Generates a Claude-Code session report: classifies session intents (`debug_investigate`, `good_debugging`, etc.), batched session loading (`META_BATCH_SIZE`, `LOAD_BATCH_SIZE`), HTML/diff rendering, primary-success bucketing (`none                                                                                                                                                                                                                                                                                                        | fast_accurate_search | correct_code_edits | good_explanations | proactive_help | multi_file_changes | good_debugging`). Lazy-imported because cold-loading 3,200 LOC at startup would dominate startup time. |
| `/install-github-app` | `commands/install-github-app/index.ts:1–13`, `install-github-app.tsx:1–40+`    | local-jsx                                 | —                     | 11-step wizard: `CheckGitHubStep` → `CheckExistingSecretStep` → `OAuthFlowStep` → `ChooseRepoStep` → `ApiKeyStep` → `ExistingWorkflowStep` → `WarningsStep` → `InstallAppStep` → `CreatingStep` → `SuccessStep`/`ErrorStep`, plus `setupGitHubActions.ts` helpers. Sets up Anthropic GitHub Actions for the active repo. `availability: ['claude-ai','console']`; gated by `DISABLE_INSTALL_GITHUB_APP_COMMAND`.                                                                                                                               |
| `/install-slack-app`  | `commands/install-slack-app/index.ts:1–10`                                     | local                                     | —                     | Opens the OAuth flow to install the Claude Slack app. `availability: ['claude-ai']`.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/chrome`             | `commands/chrome/index.ts:1–11`                                                | local-jsx                                 | —                     | Settings panel for "Claude in Chrome" beta. `availability: ['claude-ai']`; disabled in non-interactive sessions.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/ide`                | `commands/ide/index.ts:1–11`                                                   | local-jsx                                 | `[open]`              | Manage IDE integrations and show status — VS Code/JetBrains discovery + lock-file at `~/.claude/ide/`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/ultraplan`          | `commands/ultraplan.tsx:608–615` (gated by `feature('ULTRAPLAN')`)             | local-jsx                                 | `<prompt>`            | Launches "Claude Code on the web" (CCR) session for plan refinement: ~10–30 min flow, `RemoteAgentTask` with detached poller, `pendingChoice` for teleport-back-or-execute-remote, OTel attribution, archive-on-stop. Default model from `getFeatureValue('tengu_ultraplan_model', opus46.firstParty)`. ant-only.                                                                                                                                                                                                                              |
| `/team-onboarding`    | **NOT a separate file — implemented as a phase of `/init`'s NEW_INIT_PROMPT**  | —                                         | —                     | The CLI changelog ships `/team-onboarding` (v2.1.101+) as the team-shared CLAUDE.md branch of `/init`. The actual phases are at `init.ts:30–42` (project vs personal vs both), file:138–152 (CLAUDE.local.md gitignore + worktree handling), file:184–224 (skill-creator/playwright/frontend-design plugin recommendations).                                                                                                                                                                                                                   |

### 3.5 Diagnostics & introspection

| Command                      | File:line                                                   | Type                  | Args         | Behavior                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------- | --------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/status`                    | `commands/status/index.ts:1–13`                             | local-jsx             | —            | Shows version, model, account, API connectivity, tool statuses; immediate.                                                                                                                                                                                                                           |
| `/usage`                     | `commands/usage/index.ts:1–9`                               | local-jsx             | —            | Shows plan usage limits. `availability: ['claude-ai']`; remote-safe.                                                                                                                                                                                                                                 |
| `/cost`                      | `commands/cost/index.ts:1–24`                               | local                 | —            | Total cost + duration of session. **Hidden** for non-ant claude.ai subscribers (Anthropic doesn't show $$ to subscribers; ants always see breakdown). `supportsNonInteractive: true`; remote- and bridge-safe.                                                                                       |
| `/extra-usage`               | `commands/extra-usage/index.ts:1–35`                        | local-jsx **+** local | —            | Dual registration: `extraUsage` (jsx, gated by `!getIsNonInteractiveSession()`) and `extraUsageNonInteractive` (local, gated by `getIsNonInteractiveSession()`). Configures overage to keep working when limits hit. Both gated by `isOverageProvisioningAllowed` and `DISABLE_EXTRA_USAGE_COMMAND`. |
| `/rate-limit-options`        | `commands/rate-limit-options/index.ts:1–18`                 | local-jsx             | —            | Internal-only options surface when limit hit; `isHidden: true`; gated by `isClaudeAISubscriber`.                                                                                                                                                                                                     |
| `/upgrade`                   | `commands/upgrade/index.ts:1–14`                            | local-jsx             | —            | Upsell to Max for higher caps. `availability: ['claude-ai']`; disabled for enterprise; `DISABLE_UPGRADE_COMMAND` gate.                                                                                                                                                                               |
| `/context`                   | `commands/context/index.ts:1–17`                            | local-jsx             | —            | Visualizes current context usage as a colored grid. Gated `!getIsNonInteractiveSession()`.                                                                                                                                                                                                           |
| `/context` (non-interactive) | `commands/context/index.ts:19–28` (`contextNonInteractive`) | local                 | —            | Plain-text version, mutually exclusive with the jsx variant via `getIsNonInteractiveSession()`. `supportsNonInteractive: true`.                                                                                                                                                                      |
| `/doctor`                    | `commands/doctor/index.ts:1–13`                             | local-jsx             | —            | Diagnose installation, settings; gated by `DISABLE_DOCTOR_COMMAND`.                                                                                                                                                                                                                                  |
| `/diff`                      | `commands/diff/index.ts:1–8`                                | local-jsx             | —            | View uncommitted changes and per-turn diffs.                                                                                                                                                                                                                                                         |
| `/copy`                      | `commands/copy/index.ts:1–11`                               | local-jsx             | —            | Copy Claude's last response to clipboard, or `/copy N` for the Nth-latest. Remote-safe.                                                                                                                                                                                                              |
| `/export`                    | `commands/export/index.ts:1–11`                             | local-jsx             | `[filename]` | Export current conversation to file or clipboard.                                                                                                                                                                                                                                                    |
| `/config` (`/settings`)      | `commands/config/index.ts:1–10`                             | local-jsx             | —            | Open the config panel (settings UI).                                                                                                                                                                                                                                                                 |
| `/memory`                    | `commands/memory/index.ts:1–10`                             | local-jsx             | —            | Edit Claude memory files (`~/.claude/CLAUDE.md`, project `.claude/CLAUDE.md`, etc.).                                                                                                                                                                                                                 |
| `/release-notes`             | `commands/release-notes/index.ts:1–10`                      | local                 | —            | View changelog; `supportsNonInteractive: true`; bridge-safe.                                                                                                                                                                                                                                         |
| `/version`                   | `commands/version.ts:1–22`                                  | local                 | —            | Prints session version (not what autoupdate has cached). **ant-only** (`USER_TYPE==='ant'`); `supportsNonInteractive: true`.                                                                                                                                                                         |
| `/heapdump`                  | `commands/heapdump/index.ts:1–11`                           | local                 | —            | Dumps JS heap to `~/Desktop/`. `isHidden: true`; `supportsNonInteractive: true`.                                                                                                                                                                                                                     |
| `/feedback` (`/bug`)         | `commands/feedback/index.ts:1–25`                           | local-jsx             | `[report]`   | Submit feedback via Anthropic intake. Disabled in Bedrock/Vertex/Foundry environments, ant builds, or when `allow_product_feedback` policy is denied; remote-safe (interesting choice — see `commands.ts:631`).                                                                                      |
| `/stickers`                  | `commands/stickers/index.ts:1–10`                           | local                 | —            | Order Claude Code stickers; `supportsNonInteractive: false`; remote-safe.                                                                                                                                                                                                                            |
| `/stats`                     | `commands/stats/index.ts:1–10`                              | local-jsx             | —            | Usage statistics + activity.                                                                                                                                                                                                                                                                         |
| `/think-back`                | `commands/thinkback/index.ts:1–13`                          | local-jsx             | —            | "Your 2025 Claude Code Year in Review" animation. Gated by `tengu_thinkback` Statsig gate.                                                                                                                                                                                                           |
| `/thinkback-play`            | `commands/thinkback-play/index.ts:1–15`                     | local                 | —            | Hidden helper that plays the animation; called by the `thinkback` skill once generation is done.                                                                                                                                                                                                     |
| `/tasks` (`/bashes`)         | `commands/tasks/index.ts:1–11`                              | local-jsx             | —            | List/manage background tasks (Ctrl-B background bashes + agent tasks).                                                                                                                                                                                                                               |
| `/tag`                       | `commands/tag/index.ts:1–13`                                | local-jsx             | `<tag-name>` | Toggle a searchable tag on the current session. **ant-only**.                                                                                                                                                                                                                                        |
| `/login`                     | `commands/login/index.ts:1–14` (factory)                    | local-jsx             | —            | Sign-in / switch Anthropic account; description varies by `hasAnthropicApiKeyAuth`. Disabled by `DISABLE_LOGIN_COMMAND`. Filtered out when `isUsing3PServices()` (`commands.ts:337`).                                                                                                                |
| `/logout`                    | `commands/logout/index.ts:1–10`                             | local-jsx             | —            | Sign out; gated by `DISABLE_LOGOUT_COMMAND`; same 3P filter.                                                                                                                                                                                                                                         |
| `/oauth-refresh`             | `commands/oauth-refresh/index.js`                           | stub (ant-internal)   | —            | Forces OAuth refresh — replaced by SDK in external builds.                                                                                                                                                                                                                                           |
| `/privacy-settings`          | `commands/privacy-settings/index.ts:1–13`                   | local-jsx             | —            | View/update privacy settings. Gated by `isConsumerSubscriber`.                                                                                                                                                                                                                                       |
| `/terminal-setup`            | `commands/terminalSetup/index.ts:1–22`                      | local-jsx             | —            | Apple Terminal: Option+Enter for newline + visual bell; others: install Shift+Enter. Hidden if terminal natively supports CSI u (Ghostty, Kitty, iTerm2, WezTerm).                                                                                                                                   |
| `/statusline`                | `commands/statusline.tsx:4–22`                              | prompt                | `[prompt]`   | Configures the CLI status line via the `statusline-setup` subagent: `allowedTools: [AGENT_TOOL_NAME, 'Read(~/**)', 'Edit(~/.claude/settings.json)']`. `disableNonInteractive: true`. Default prompt is "Configure my statusLine from my shell PS1 configuration". Remote-safe.                       |

### 3.6 Cloud sessions (remote/bridge/teleport)

| Command                   | File:line                                                          | Type      | Args          | Behavior                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------ | --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------- | -------------- | ---------------------- | ------------------ | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/remote-control` (`/rc`) | `commands/bridge/index.ts:1–28`                                    | local-jsx | `[name]`      | Connects this terminal as a remote-control bridge target (mobile/web inbound). Gated by `feature('BRIDGE_MODE')` && `isBridgeEnabled`. Immediate.                                                                              |
| `/web-setup`              | `commands/remote-setup/index.ts:1–22`                              | local-jsx | —             | Setup CCR (Claude Code on the Web) — connects GitHub. `availability: ['claude-ai']`; gated by `tengu_cobalt_lantern` GrowthBook flag and `allow_remote_sessions` policy. Companion: `remote-setup/api.ts`, `remote-setup.tsx`. |
| `/remote-env`             | `commands/remote-env/index.ts:1–14`                                | local-jsx | —             | Configures the default remote environment for teleport sessions. `isClaudeAISubscriber && allow_remote_sessions`.                                                                                                              |
| `/teleport`               | `commands/teleport/index.js` (stub)                                | INTERNAL  | —             | Switches local↔web; ant-internal.                                                                                                                                                                                              |
| `/share`                  | `commands/share/index.js` (stub)                                   | INTERNAL  | —             | Public-link share artifact; ant-internal.                                                                                                                                                                                      |
| `/summary`                | `commands/summary/index.js` (stub)                                 | INTERNAL  | —             | Summarize current conversation; ant-internal; **bridge-safe** when present.                                                                                                                                                    |
| `/bridge-kick <subcmd>`   | `commands/bridge-kick.ts:1–201`                                    | local     | `close <code> | poll <status> [type]                                                                                                                                                                                                           | poll transient | register fail [N] | register fatal | reconnect-session fail | heartbeat <status> | reconnect | status` | **ant-only fault-injector** for the bridge debug handle. Lets engineers fire `ws_closed` codes (1002/1006), inject 404 `not_found_error` polls, schedule transient register failures, etc. Used to reproduce the BQ-verified "147K/wk dead-gate" residual. |
| `/bridge-mode` (gated)    | feature flag in `commands.ts:73–75` (`bridge`)                     | —         | —             | Same path as `/remote-control` once `BRIDGE_MODE` is on.                                                                                                                                                                       |
| `/remote-control-server`  | `commands/remoteControlServer/` (gated by `DAEMON && BRIDGE_MODE`) | —         | —             | Daemon-mode bridge server.                                                                                                                                                                                                     |

### 3.7 Internal/dev/INTERNAL-only commands

These appear in `INTERNAL_ONLY_COMMANDS` (`commands.ts:225–254`) and are stubbed out in external builds (each file is `export default { isEnabled: () => false, isHidden: true, name: 'stub' };`):

`backfill-sessions`, `break-cache`, `bughunter`, `ctx_viz`, `good-claude`, `issue`, `mock-limits`, `oauth-refresh`, `onboarding`, `share`, `summary`, `teleport`, `ant-trace`, `perf-issue`, `env`, `debug-tool-call`, `autofix-pr`, `reset-limits` (re-exports as `resetLimits` + `resetLimitsNonInteractive`).

The 5 ant-only feature-flag-gated commands sit alongside (visible only when both `USER_TYPE==='ant'` and the flag is set):

| Command                    | Flag                          | File                                                                                                                        |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/proactive`               | `PROACTIVE` or `KAIROS`       | `commands/proactive.ts`                                                                                                     |
| `/brief`                   | `KAIROS` or `KAIROS_BRIEF`    | `commands/brief.ts`                                                                                                         |
| `/assistant`               | `KAIROS`                      | `commands/assistant/index.ts`                                                                                               |
| `/buddy`                   | `BUDDY`                       | `commands/buddy/index.ts`                                                                                                   |
| `/peers`                   | `UDS_INBOX`                   | `commands/peers/index.ts`                                                                                                   |
| `/voice` (re-import)       | `VOICE_MODE`                  | `commands/voice/index.ts`                                                                                                   |
| `/force-snip`              | `HISTORY_SNIP`                | `commands/force-snip.ts`                                                                                                    |
| `/workflows`               | `WORKFLOW_SCRIPTS`            | `commands/workflows/index.ts` (also feeds `getWorkflowCommands(cwd)` via `tools/WorkflowTool/createWorkflowCommand.ts:404`) |
| `/torch`                   | `TORCH`                       | `commands/torch.ts`                                                                                                         |
| `/clear-skill-index-cache` | `EXPERIMENTAL_SKILL_SEARCH`   | `services/skillSearch/localSearch.ts` (called from `commands.ts:96`)                                                        |
| `/subscribe-pr`            | `KAIROS_GITHUB_WEBHOOKS`      | `commands/subscribe-pr.ts`                                                                                                  |
| `/ultraplan`               | `ULTRAPLAN`                   | `commands/ultraplan.tsx`                                                                                                    |
| `/agents-platform`         | `USER_TYPE==='ant'` (require) | `commands/agents-platform/index.ts`                                                                                         |

### 3.8 Bundled skills (registered as `/skill-name`, `loadedFrom: 'bundled'`)

These are **not** in the commands directory but appear in the autocomplete as slash-commands because `getSkillToolCommands` includes `loadedFrom === 'bundled'` (`commands.ts:573–578`). All registered in `skills/bundled/index.ts:24–42` via `initBundledSkills()`:

| Skill                     | File                                              | Notes                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/update-config`          | `skills/bundled/updateConfig.ts`                  | Configure settings.json (hooks/permissions/env). Surfaced as the "update-config" skill in this CLAUDE.md.                                                                                                                                                                               |
| `/keybindings`            | `skills/bundled/keybindings.ts:293+`              | 297-LOC reference for editing `~/.claude/keybindings.json`.                                                                                                                                                                                                                             |
| `/verify`                 | `skills/bundled/verify.ts` (+ `verifyContent.ts`) | Verify-agent + content rules.                                                                                                                                                                                                                                                           |
| `/debug`                  | `skills/bundled/debug.ts:13–35`                   | Reads tail of `~/Library/Logs/Claude/claude-debug.log` (last 64 KB), enables debug logging if needed. `disableModelInvocation: true`, `userInvocable: true`.                                                                                                                            |
| `/lorem-ipsum`            | `skills/bundled/loremIpsum.ts:239+`               | Generates lorem-ipsum for testing.                                                                                                                                                                                                                                                      |
| `/skillify`               | `skills/bundled/skillify.ts:163+`                 | Authoring guide skill.                                                                                                                                                                                                                                                                  |
| `/remember`               | `skills/bundled/remember.ts:64+`                  | Memory tool helper.                                                                                                                                                                                                                                                                     |
| `/simplify`               | `skills/bundled/simplify.ts`                      | Three parallel agents: Code Reuse Review, Code Quality Review, Efficiency Review (review changed files end-to-end).                                                                                                                                                                     |
| `/batch`                  | `skills/bundled/batch.ts:101+`                    | Parallel-work orchestration: enter plan mode, decompose into 5–30 independent units, spawn isolated git-worktree workers, each ends with `Simplify` skill + tests + commit + PR.                                                                                                        |
| `/stuck`                  | `skills/bundled/stuck.ts:66+`                     | Triage when Claude is stuck — invoked by user.                                                                                                                                                                                                                                          |
| `/dream`                  | gated by `KAIROS` or `KAIROS_DREAM`               | Speculative-execution skill.                                                                                                                                                                                                                                                            |
| `/hunter`                 | gated by `REVIEW_ARTIFACT`                        | Bug-hunting skill (companion to `/ultrareview` cloud path).                                                                                                                                                                                                                             |
| `/loop`                   | gated by `AGENT_TRIGGERS`                         | `Usage: /loop [interval] <prompt>` — schedules a recurring prompt via `CRON_CREATE_TOOL_NAME`. Default interval `10m`. Parses `5m /babysit-prs` (rule 1: leading `\d+[smhd]`), `check the deploy every 20m` (rule 2: trailing "every <N><unit>"), or default-and-treat-input-as-prompt. |
| `/schedule-remote-agents` | gated by `AGENT_TRIGGERS_REMOTE`                  | Cron-schedule remote agents.                                                                                                                                                                                                                                                            |
| `/claude-api`             | gated by `BUILDING_CLAUDE_APPS`                   | API-build helper skill (auto-includes prompt caching). Companion content at `claudeApiContent.ts`.                                                                                                                                                                                      |
| `/claude-in-chrome`       | gated by `shouldAutoEnableClaudeInChrome`         | Chrome-extension agent helper.                                                                                                                                                                                                                                                          |
| `/run-skill-generator`    | gated by `RUN_SKILL_GENERATOR`                    | Boots the skill-generator subagent.                                                                                                                                                                                                                                                     |

The CLAUDE.md note "Skill-takeover: `.claude/commands/` and skills unified" is implemented at `commands.ts:574–578` — bundled/skills/legacy-commands all surface via `getSkillToolCommands`, the rendering order in `loadAllCommands` (`commands.ts:460–468`) places skills before built-ins so name collisions resolve in favor of skills.

---

## 4. Notable patterns

### 4.1 `createMovedToPluginCommand` migration helper (`commands/createMovedToPluginCommand.ts:1–66`)

```ts
export function createMovedToPluginCommand({
  name,
  description,
  progressMessage,
  pluginName,
  pluginCommand,
  getPromptWhileMarketplaceIsPrivate,
}: Options): Command {
  return {
    type: 'prompt',
    name,
    description,
    progressMessage,
    contentLength: 0, // dynamic
    userFacingName() {
      return name;
    },
    source: 'builtin',
    async getPromptForCommand(args, context) {
      if (process.env.USER_TYPE === 'ant') {
        return [
          {
            type: 'text',
            text: `This command has been moved to a plugin. Tell the user:
1. claude plugin install ${pluginName}@claude-code-marketplace
2. After installation, use /${pluginName}:${pluginCommand}
3. https://github.com/anthropics/claude-code-marketplace/blob/main/${pluginName}/README.md
Do not attempt to run the command. Simply inform the user about the plugin installation.`,
          },
        ];
      }
      return getPromptWhileMarketplaceIsPrivate(args, context);
    },
  };
}
```

Used by `/security-review` (`commands/security-review.ts:198–243`) and `/pr-comments` (`commands/pr_comments/index.ts:1–55`). Pattern lets Anthropic flip a command from "ships with CLI" to "install as plugin" without breaking external users — they get the original prompt; ants get the migration message.

### 4.2 Dual-registration via `getIsNonInteractiveSession()`

`/extra-usage` (`commands/extra-usage/index.ts:1–35`) and `/context` (`commands/context/index.ts:1–28`) each export two `Command` objects with the same `name` but different `type`. Mutual exclusion is enforced via `isEnabled` calling `getIsNonInteractiveSession()` — exactly one is visible at a time. Why: `local-jsx` requires Ink, which is unavailable in `--print`/headless mode.

### 4.3 `immediate: true` semantics

`immediate` (`types/command.ts:199`) bypasses the message queue and runs the command even mid-generation. Used for: bridge management (`/remote-control`), navigation (`/exit`, `/rename`), settings UIs that need instant feedback (`/plugin`, `/mcp`, `/sandbox`, `/status`, `/hooks`, `/btw`), and the inference-config commands that have getter-immediate (`/effort`, `/fast`, `/model`) — these are immediate only when `shouldInferenceConfigCommandBeImmediate()` is true (typically when the model is idle).

### 4.4 Description as getter

Many commands compute description at access time, not at module init: `/cost` (`isHidden` getter), `/desktop` (`isHidden` getter), `/fast` (`description` getter showing `FAST_MODE_MODEL_DISPLAY`), `/model` (`description` getter showing current model), `/upgrade` (`isEnabled` factory), `/passes` (`description` getter checking `getCachedReferrerReward`), `/sandbox` (`description` getter rendering icon + status text), `/effort`/`/model`/`/fast` (`immediate` getter). `/login` is unique — exported as a factory `() => ({...})` rather than a satisfies object, so the description is recomputed every time the command list is rebuilt, picking up auth-state changes.

### 4.5 Shell-substitution-in-prompt (`!\`...\``)

Used by `/init`, `/commit`, `/commit-push-pr`, `/security-review`. Pattern: write a prompt string with `!\`git status\``placeholders, then call`executeShellCommandsInPrompt(content, contextWithAlwaysAllowRules, '/<command>')`(e.g.,`commit.ts:67–86`). The wrapper temporarily attaches the command's `allowedTools`as`alwaysAllowRules.command`so the shell calls execute without prompting the user. Frontmatter parsing for the markdown form lives in`utils/frontmatterParser.ts`and`utils/markdownConfigLoader.parseSlashCommandToolsFromFrontmatter`.

### 4.6 Memoization architecture

Every "expensive" loader is `memoize(...)`'d:

- `COMMANDS()` (`commands.ts:258`).
- `builtInCommandNames` (`commands.ts:348–351`).
- `loadAllCommands(cwd)` (`commands.ts:449`) — keyed by cwd.
- `getSkillToolCommands(cwd)` (`commands.ts:563`).
- `getSlashCommandToolSkills(cwd)` (`commands.ts:586`).

Two clear paths: `clearCommandMemoizationCaches()` (`commands.ts:523–532`) clears only command-side caches (preserves skill caches — used when a dynamic skill is added mid-session); `clearCommandsCache()` (`commands.ts:534–539`) clears everything (used by `/reload-plugins` and `/clear`).

### 4.7 Subdirectory file-count flags (signals of complexity)

| Subdir                | Files                              | Notes                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin/`             | 16 (incl. ManagePlugins.tsx in T1) | Marketplace UI: AddMarketplace, BrowseMarketplace, DiscoverPlugins, ManageMarketplaces, PluginErrors, PluginOptionsDialog, PluginOptionsFlow, PluginSettings, PluginTrustWarning, UnifiedInstalledCell, ValidatePlugin, parseArgs, pluginDetailsHelpers, usePagination. |
| `install-github-app/` | 13                                 | 11-step wizard.                                                                                                                                                                                                                                                         |
| `extra-usage/`        | 4                                  | dual-registration variant + helpers.                                                                                                                                                                                                                                    |
| `clear/`              | 4                                  | `index.ts` (40 LOC) + `clear.ts` (8 LOC) + `conversation.ts` (251 LOC, the heavy lift) + `caches.ts` (144 LOC).                                                                                                                                                         |
| `mcp/`                | 4                                  | `index.ts` (UI), `mcp.tsx`, `addCommand.ts` (CLI), `xaaIdpCommand.ts` (XAA IdP CLI).                                                                                                                                                                                    |
| `compact/`            | 2                                  | `index.ts` + `compact.ts`.                                                                                                                                                                                                                                              |
| `rename/`             | 3                                  | adds `generateSessionName.ts`.                                                                                                                                                                                                                                          |
| `review/`             | 4                                  | `ultrareviewCommand.tsx`, `ultrareviewEnabled.ts`, `UltrareviewOverageDialog.tsx`, plus the top-level `review.ts`.                                                                                                                                                      |
| `add-dir/`            | 3                                  | adds `validation.ts`.                                                                                                                                                                                                                                                   |
| `remote-setup/`       | 3                                  | adds `api.ts`.                                                                                                                                                                                                                                                          |

---

## 5. Special-case deep dives

### 5.1 `/btw` — the side-question fork (`commands/btw/btw.tsx:208–242`)

The cleverest cache management in the directory. `buildCacheSafeParams` first tries `getLastCacheSafeParams()` from `forkedAgent.js` — if the parent thread has done at least one round-trip, those exact `systemPrompt + userContext + systemContext` bytes guarantee a cache hit. Fallback rebuilds from scratch (which **misses** the cache when the main loop applied `--agent`/`--system-prompt`/`--append-system-prompt`/coordinator extras). Strips an in-progress assistant message before forking (file:201–207). Records `btwUseCount` analytics. Keyboard handler in the renderer (file:60–75): scroll up/down (Up/Down/Ctrl-P/Ctrl-N), dismiss (Escape/Enter/Space/Ctrl-C/Ctrl-D).

### 5.2 `/init-verifiers` — auto-detect + interactive Q&A wizard

The 262-LOC monolith does a 5-phase walk:

1. **Auto-detection** (file:24–58): scan top-level for `package.json`/`Cargo.toml`/`pyproject.toml`/`go.mod`; classify as web/CLI/API; check for Playwright/Chrome DevTools MCP/Claude Chrome Extension MCP; check for Vitest/Jest/pytest; read `.mcp.json`.
2. **Tool setup** (file:60–104): for web, ask user to pick or install (Playwright recommended); install via the user's package manager (`npm install -D @playwright/test && npx playwright install`, or `pnpm add -D @playwright/test && pnpm exec playwright install`); for CLI tools check asciinema; for APIs check curl/httpie.
3. **Interactive Q&A** (file:106–162): single vs multi-area naming convention (`verifier-frontend-playwright`, `verifier-backend-api`); per-type questions (dev-server URL, ready-signal text, entry-point command); auth questions (none/full/partial → form-based/API-token/OAuth/other → URL + env var creds + post-login indicator).
4. **Generate skill files** (file:164–245): always write to project `.claude/skills/<verifier-name>/SKILL.md`; type-specific `allowed-tools` blocks (Playwright variant uses `Bash(npm:*)`/`Bash(pnpm:*)`/`mcp__playwright__*`/`Read`/`Glob`/`Grep`; CLI uses `Tmux` + `Bash(asciinema:*)`; API uses `Bash(curl:*)`/`Bash(http:*)`).
5. **Confirm** (file:248–256): tell user where files were created, that the Verify agent finds skills containing "verifier" in folder name, that they can edit, that re-running `/init-verifiers` adds more, and that the verifier offers self-update if its instructions become stale.

### 5.3 `/agents` Library UI

The `/agents` command (`commands/agents/agents.tsx:6–11`) is just a thin wrapper around `<AgentsMenu tools={getTools(permissionContext)}>`. The actual Personal/Project scope toggle, "Generate with Claude" wizard, and CRUD lives in `~/Desktop/reference/src/components/agents/AgentsMenu.tsx` (out of scope for CMD1 — see component-tier agents). The frontmatter contract is documented at `types/command.ts:175–203` (`disableModelInvocation`, `userInvocable`, `paths`, `whenToUse`).

### 5.4 `/hooks` interactive editor

`commands/hooks/hooks.tsx:6–12` mounts `<HooksConfigMenu toolNames={getTools(permissionContext).map(t => t.name)}>`. Confirms the CLAUDE.md note: only **command** hooks are editable in-UI; prompt/agent/HTTP hooks live in `settings.json` or skill frontmatter `hooks:` blocks (validated against `HooksSchema` at `skills/loadSkillsDir.ts:147`).

### 5.5 `/security-review`, `/loop`, `/simplify`, `/debug`, `/batch`, `/claude-api`

Per-CLAUDE-md note: `/loop`, `/simplify`, `/debug`, `/batch`, `/claude-api` are **bundled skills** under `~/Desktop/reference/src/skills/bundled/` — see §3.8. They're surfaced as slash-commands by `getSkillToolCommands` because `loadedFrom === 'bundled'` is included in the filter (`commands.ts:574–578`). `/security-review` is in `commands/security-review.ts` and uses the `createMovedToPluginCommand` helper to redirect ants to the plugin path while keeping the in-CLI prompt for external users.

---

## 6. Provenance tags & rendering

`formatDescriptionWithSource` (`commands.ts:728–754`) controls what a user sees in autocomplete:

```
type prompt + source 'builtin' | 'mcp'   -> description as-is
type prompt + source 'plugin' (with name) -> "(<plugin>) <description>"
type prompt + source 'plugin' (no name)   -> "<description> (plugin)"
type prompt + source 'bundled'           -> "<description> (bundled)"
type prompt + source SettingSource       -> "<description> (<source-friendly-name>)"
type prompt + kind 'workflow'             -> "<description> (workflow)"
non-prompt types                          -> description as-is
```

Combined with `getCommandName` (`types/command.ts:209–211`) which respects `userFacingName()` overrides — used by plugin commands that strip prefixes for display.

---

## 7. Cross-cutting takeaways for AGI Workforce CLI port

1. **One discriminated `Command` union with three arms is the right shape** — keep `prompt` (text-expanding skills), `local` (synchronous text result, headless-safe, must declare `supportsNonInteractive`), and `local-jsx` (Ink UI; never bridge-safe). Avoid mixing call signatures.
2. **Lazy-load every command.** `load: () => import('./body.js')` is the dominant pattern. Anything heavier than a satisfies-literal goes behind it. `/insights` proves the pattern even for `prompt` commands by lazy-loading inside `getPromptForCommand`.
3. **Three orthogonal gating systems**: `availability` (auth/provider, static), `isEnabled()` (feature flag/env, dynamic), `isHidden` (typeahead suppression — usually a getter so it tracks state). Plus `disableModelInvocation` for skills.
4. **Bridge-safety is opt-in for `local`, blanket-allow for `prompt`, blanket-deny for `local-jsx`.** Don't let mobile clients trigger Ink picker UIs.
5. **Skills > commands**: filesystem skills (`.claude/skills/<name>/SKILL.md`) shadow built-ins by load-order. Bundled skills are the third differentiator — first-party skills shipped with the binary, gated behind feature flags so optional surfaces (Chrome extension, Schedule, ClaudeApi) don't leak metadata to non-eligible users.
6. **Migration path is built into the command type**. `createMovedToPluginCommand` is a 65-LOC helper that lets Anthropic move a command into the plugin marketplace **without breaking external users** — they get the original prompt; ants see the install nudge.
7. **`getSkillToolCommands` is the model-facing gate**: only commands with `cmd.type === 'prompt'`, non-built-in, model-invocable, and either bundled/skills/legacy-commands or with explicit `hasUserSpecifiedDescription`/`whenToUse` reach the model. Built-in `'prompt'` commands like `/security-review` _don't_ reach the model — they're user-only.
8. **`immediate` is a UX power tool but a footgun for hooks**: bypassing the queue means UserPromptSubmit hooks don't fire, so commands like `/exit`, `/btw`, `/sandbox` skip the prompt-hook chain by design.

---

## 8. File-by-file leaf inventory (alphabetical)

189 `.ts/.tsx` files. The 207 total in the directory includes `.js` stubs (15 of them: `ant-trace`, `autofix-pr`, `backfill-sessions`, `break-cache`, `bughunter`, `ctx_viz`, `debug-tool-call`, `env`, `good-claude`, `issue`, `mock-limits`, `oauth-refresh`, `onboarding`, `perf-issue`, `reset-limits`, `share`, `summary`, `teleport`). Plus `.txt`/auxiliary files used in flows. Counts per top-level subdir/file:

- `add-dir/` — 3 files (`add-dir.tsx`, `index.ts`, `validation.ts`).
- `advisor.ts` — 110 LOC.
- `agents/` — 2 files.
- `agents-platform/` — ant-only.
- `ant-trace/` — stub.
- `autofix-pr/` — stub.
- `backfill-sessions/` — stub.
- `branch/` — 2 files.
- `break-cache/` — stub.
- `bridge/` — 2 files.
- `bridge-kick.ts` — 200 LOC.
- `brief.ts` — 130 LOC.
- `btw/` — 2 files (`index.ts`, `btw.tsx`).
- `bughunter/` — stub.
- `chrome/` — 2 files.
- `clear/` — 4 files.
- `color/` — 2 files.
- `commit-push-pr.ts` — 158 LOC.
- `commit.ts` — 92 LOC.
- `compact/` — 2 files.
- `config/` — 2 files.
- `context/` — 3 files.
- `copy/` — 2 files.
- `cost/` — 2 files.
- `createMovedToPluginCommand.ts` — 65 LOC.
- `ctx_viz/` — stub.
- `debug-tool-call/` — stub.
- `desktop/` — 2 files.
- `diff/` — 2 files.
- `doctor/` — 2 files.
- `effort/` — 2 files.
- `env/` — stub.
- `exit/` — 2 files.
- `export/` — 2 files.
- `extra-usage/` — 4 files.
- `fast/` — 2 files.
- `feedback/` — 2 files.
- `files/` — 2 files.
- `good-claude/` — stub.
- `heapdump/` — 2 files.
- `help/` — 2 files.
- `hooks/` — 2 files.
- `ide/` — 2 files.
- `init-verifiers.ts` — 262 LOC.
- `init.ts` — 256 LOC.
- `insights.ts` — 3,200 LOC (T1 scope; lazy-shimmed at `commands.ts:190–202`).
- `install-github-app/` — 13 files.
- `install-slack-app/` — 2 files.
- `install.tsx` — 299 LOC.
- `issue/` — stub.
- `keybindings/` — 2 files.
- `login/` — 2 files.
- `logout/` — 2 files.
- `mcp/` — 4 files.
- `memory/` — 2 files.
- `mobile/` — 2 files.
- `mock-limits/` — stub.
- `model/` — 2 files.
- `oauth-refresh/` — stub.
- `onboarding/` — stub.
- `output-style/` — 2 files.
- `passes/` — 2 files.
- `perf-issue/` — stub.
- `permissions/` — 2 files.
- `plan/` — 2 files.
- `plugin/` — 16 files (ManagePlugins.tsx scoped to T1).
- `pr_comments/` — 1 file.
- `privacy-settings/` — 2 files.
- `rate-limit-options/` — 2 files.
- `release-notes/` — 2 files.
- `reload-plugins/` — 2 files.
- `remote-env/` — 2 files.
- `remote-setup/` — 3 files.
- `rename/` — 3 files.
- `reset-limits/` — stub.
- `resume/` — 2 files.
- `review.ts` — 57 LOC.
- `review/` — 4 files.
- `rewind/` — 2 files.
- `sandbox-toggle/` — 2 files.
- `security-review.ts` — 243 LOC.
- `session/` — 2 files.
- `share/` — stub.
- `skills/` — 2 files.
- `stats/` — 2 files.
- `status/` — 2 files.
- `statusline.tsx` — 23 LOC.
- `stickers/` — 2 files.
- `summary/` — stub.
- `tag/` — 2 files.
- `tasks/` — 2 files.
- `teleport/` — stub.
- `terminalSetup/` — 2 files.
- `theme/` — 2 files.
- `thinkback/` — 2 files.
- `thinkback-play/` — 2 files.
- `ultraplan.tsx` — 470 LOC.
- `upgrade/` — 2 files.
- `usage/` — 2 files.
- `version.ts` — 22 LOC.
- `vim/` — 2 files.
- `voice/` — 2 files.

Total commands surface from the directory alone (counting one row per `Command` object, separating dual-registrations and ant-only variants): **~92 distinct slash commands** across 207 files in the source tree, expanding to **~110 user-visible** when you include the bundled skills (§3.8) that share the autocomplete with built-ins.

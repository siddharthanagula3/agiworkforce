# Claude Code — Slash Commands Surface (research-02)

**Sources read:** `~/Desktop/reference/src/commands.ts` (755 lines, top-level registry), `~/Desktop/reference/src/commands/` (101 directory entries — 85 dirs + 15 top-level `.ts/.tsx` files + 1 `.DS_Store`), `~/Desktop/reference/src/types/command.ts`, `~/Desktop/reference/src/skills/loadSkillsDir.ts`, `~/Desktop/reference/src/utils/slashCommandParsing.ts`, `~/Desktop/reference/src/utils/processUserInput/processSlashCommand.tsx`, plus targeted reads of every per-command `index.ts` and selected impl files.

**One-line answer:** Claude Code exposes **~60 builtin slash commands** in the public/external build (the list is gated by `USER_TYPE`, feature flags, auth provider, and platform). The full enumerated set including `USER_TYPE === 'ant'` internal-only commands is **~78 builtin entries**, plus user/project skills and plugin/MCP commands loaded dynamically.

---

## 1. Inventory Table

Each row is **one builtin Command object** registered in `commands.ts`. Type column maps to the discriminated union in `types/command.ts:205-206` (`PromptCommand | LocalCommand | LocalJSXCommand`). "Visibility" captures `isHidden` + `isEnabled` + `availability` gates.

### A. Always-on builtins

| #   | Name                 | Aliases                                     | Type          | Source file                                                | Purpose                                                                                 | Args / hint                           | Visibility                                              |
| --- | -------------------- | ------------------------------------------- | ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| 1   | `add-dir`            | —                                           | local-jsx     | `commands/add-dir/index.ts:3-9`                            | Add a working directory to session                                                      | `<path>`                              | always                                                  |
| 2   | `agents`             | —                                           | local-jsx     | `commands/agents/index.ts:3-9`                             | Manage agent configurations (renders `AgentsMenu`)                                      | none                                  | always                                                  |
| 3   | `branch`             | `fork` (only when `FORK_SUBAGENT` flag off) | local-jsx     | `commands/branch/index.ts:4-12`                            | Create a branch of the current conversation                                             | `[name]`                              | always                                                  |
| 4   | `btw`                | —                                           | local-jsx     | `commands/btw/index.ts:3-12`                               | Side-question without interrupting main chat (immediate=true)                           | `<question>`                          | always                                                  |
| 5   | `chrome`             | —                                           | local-jsx     | `commands/chrome/index.ts:4-11`                            | Claude in Chrome (Beta) settings                                                        | none                                  | claude.ai only, non-headless                            |
| 6   | `clear`              | `reset`, `new`                              | local         | `commands/clear/index.ts:10-17`                            | Clear conversation history + free context                                               | none                                  | always                                                  |
| 7   | `color`              | —                                           | local-jsx     | `commands/color/index.ts:7-16`                             | Set prompt-bar color for session (immediate)                                            | `<color\|default>`                    | always                                                  |
| 8   | `compact`            | —                                           | local         | `commands/compact/index.ts:4-13`                           | Clear history but keep AI summary                                                       | `<custom summarization instructions>` | gated by `DISABLE_COMPACT` env                          |
| 9   | `config`             | `settings`                                  | local-jsx     | `commands/config/index.ts:3-11`                            | Open config panel                                                                       | none                                  | always                                                  |
| 10  | `context`            | —                                           | local-jsx     | `commands/context/index.ts:4-10`                           | Visualize context-window usage as a colored grid                                        | none                                  | interactive only                                        |
| 11  | `context` (NI)       | —                                           | local         | `commands/context/index.ts:12-24`                          | Same data, headless variant                                                             | none                                  | non-interactive only                                    |
| 12  | `copy`               | —                                           | local-jsx     | `commands/copy/index.ts:7-13`                              | Copy last response (or `/copy N` for Nth-latest)                                        | `[N]`                                 | always                                                  |
| 13  | `cost`               | —                                           | (see cost.ts) | `commands/cost/cost.ts:6-24`                               | Show session cost / subscription status                                                 | none                                  | always                                                  |
| 14  | `desktop`            | `app`                                       | local-jsx     | `commands/desktop/index.ts:13-25`                          | Continue session in Claude Desktop                                                      | none                                  | claude.ai + macOS/Windows-x64                           |
| 15  | `diff`               | —                                           | local-jsx     | `commands/diff/index.ts:3-8`                               | View uncommitted changes + per-turn diffs                                               | none                                  | always                                                  |
| 16  | `doctor`             | —                                           | local-jsx     | `commands/doctor/index.ts:4-10`                            | Diagnose installation + settings                                                        | none                                  | gated by `DISABLE_DOCTOR_COMMAND`                       |
| 17  | `effort`             | —                                           | local-jsx     | `commands/effort/index.ts:4-13`                            | Set effort level for model                                                              | `[low\|medium\|high\|max\|auto]`      | always (immediate when applicable)                      |
| 18  | `exit`               | `quit`                                      | local-jsx     | `commands/exit/index.ts:3-12`                              | Exit the REPL (immediate)                                                               | none                                  | always                                                  |
| 19  | `export`             | —                                           | local-jsx     | `commands/export/index.ts:3-9`                             | Export current conversation to file/clipboard                                           | `[filename]`                          | always                                                  |
| 20  | `fast`               | —                                           | local-jsx     | `commands/fast/index.ts:8-26`                              | Toggle fast mode (Haiku-only, immediate)                                                | `[on\|off]`                           | claude.ai+console; hidden if not enabled                |
| 21  | `feedback`           | `bug`                                       | local-jsx     | `commands/feedback/index.ts:6-26`                          | Submit feedback                                                                         | `[report]`                            | gated by Bedrock/Vertex/Foundry/policy/etc              |
| 22  | `help`               | —                                           | local-jsx     | `commands/help/index.ts:3-9` + `help/help.tsx:4-9`         | Show help and available commands (renders `HelpV2`)                                     | none                                  | always                                                  |
| 23  | `hooks`              | —                                           | local-jsx     | `commands/hooks/index.ts:4-11`                             | View hook configurations (immediate)                                                    | none                                  | always                                                  |
| 24  | `ide`                | —                                           | local-jsx     | `commands/ide/index.ts:3-9`                                | Manage IDE integrations + show status                                                   | `[open]`                              | always                                                  |
| 25  | `init`               | —                                           | prompt        | `commands/init.ts:226-256`                                 | Initialize CLAUDE.md + optional skills/hooks                                            | none                                  | always (text differs under `NEW_INIT` flag)             |
| 26  | `keybindings`        | —                                           | local         | `commands/keybindings/index.ts:4-12`                       | Open / create keybindings JSON                                                          | none                                  | gated by feature flag                                   |
| 27  | `install-github-app` | —                                           | local-jsx     | `commands/install-github-app/index.ts:4-12`                | Set up Claude GitHub Actions                                                            | none                                  | claude.ai+console                                       |
| 28  | `install-slack-app`  | —                                           | local         | `commands/install-slack-app/index.ts:3-11`                 | Install Claude Slack app                                                                | none                                  | claude.ai                                               |
| 29  | `mcp`                | —                                           | local-jsx     | `commands/mcp/index.ts:3-11`                               | Manage MCP servers (immediate)                                                          | `[enable\|disable [server]]`          | always                                                  |
| 30  | `memory`             | —                                           | local-jsx     | `commands/memory/index.ts:3-9`                             | Edit Claude memory files (renders `MemoryFileSelector`)                                 | none                                  | always                                                  |
| 31  | `mobile`             | `ios`, `android`                            | local-jsx     | `commands/mobile/index.ts:3-10`                            | Show QR code to download mobile app                                                     | none                                  | always                                                  |
| 32  | `model`              | —                                           | local-jsx     | `commands/model/index.ts:5-16`                             | Pick AI model (immediate); description is dynamic                                       | `[model]`                             | always                                                  |
| 33  | `output-style`       | —                                           | local-jsx     | `commands/output-style/index.ts:3-10`                      | Deprecated; redirects to `/config`                                                      | none                                  | hidden                                                  |
| 34  | `passes`             | —                                           | local-jsx     | `commands/passes/index.ts:7-22`                            | Share a free week with friends (referral)                                               | none                                  | hidden unless eligible                                  |
| 35  | `permissions`        | `allowed-tools`                             | local-jsx     | `commands/permissions/index.ts:3-11`                       | Manage allow/deny tool rules                                                            | none                                  | always                                                  |
| 36  | `plan`               | —                                           | local-jsx     | `commands/plan/index.ts:3-10`                              | Enable plan mode / view session plan                                                    | `[open\|<description>]`               | always                                                  |
| 37  | `plugin`             | `plugins`, `marketplace`                    | local-jsx     | `commands/plugin/index.tsx:2-10`                           | Manage Claude Code plugins (immediate)                                                  | none                                  | always                                                  |
| 38  | `pr-comments`        | —                                           | prompt        | `commands/pr_comments/index.ts:3-50`                       | Get GitHub PR comments (delegates to plugin in public marketplace)                      | `[args]`                              | always (moved-to-plugin pattern)                        |
| 39  | `privacy-settings`   | —                                           | local-jsx     | `commands/privacy-settings/index.ts:4-13`                  | View/update privacy settings                                                            | none                                  | consumer subscribers                                    |
| 40  | `rate-limit-options` | —                                           | local-jsx     | `commands/rate-limit-options/index.ts:4-19`                | Internal rate-limit dialog                                                              | none                                  | hidden, claude.ai only                                  |
| 41  | `release-notes`      | —                                           | local         | `commands/release-notes/index.ts:3-9`                      | View release notes (NI-capable)                                                         | none                                  | always                                                  |
| 42  | `reload-plugins`     | —                                           | local         | `commands/reload-plugins/index.ts:7-16`                    | Activate pending plugin changes                                                         | none                                  | always                                                  |
| 43  | `remote-control`     | `rc`                                        | local-jsx     | `commands/bridge/index.ts:12-24`                           | Connect terminal for remote sessions                                                    | `[name]`                              | feature `BRIDGE_MODE`                                   |
| 44  | `remote-env`         | —                                           | local-jsx     | `commands/remote-env/index.ts:5-15`                        | Configure default remote env for teleport                                               | none                                  | claude.ai + remote-sessions policy                      |
| 45  | `rename`             | —                                           | local-jsx     | `commands/rename/index.ts:3-11`                            | Rename current conversation (immediate)                                                 | `[name]`                              | always                                                  |
| 46  | `resume`             | `continue`                                  | local-jsx     | `commands/resume/index.ts:3-12`                            | Resume a previous conversation                                                          | `[id\|term]`                          | always                                                  |
| 47  | `review`             | —                                           | prompt        | `commands/review.ts:33-43`                                 | Review a PR (local prompt)                                                              | `[PR#]`                               | always                                                  |
| 48  | `ultrareview`        | —                                           | local-jsx     | `commands/review.ts:48-54`                                 | Remote bughunter review (~10–20 min, billing-gated)                                     | `[PR#]`                               | feature-flag                                            |
| 49  | `rewind`             | `checkpoint`                                | local         | `commands/rewind/index.ts:4-12`                            | Restore code/conversation to a previous point                                           | none                                  | always                                                  |
| 50  | `sandbox`            | —                                           | local-jsx     | `commands/sandbox-toggle/index.ts:5-49`                    | Toggle macOS Seatbelt / Linux bwrap sandbox (immediate)                                 | `exclude "command pattern"`           | platform-gated                                          |
| 51  | `session`            | `remote`                                    | local-jsx     | `commands/session/index.ts:4-15`                           | Show remote session URL+QR                                                              | none                                  | hidden unless remote mode                               |
| 52  | `security-review`    | —                                           | prompt        | `commands/security-review.ts:198-243`                      | Security review of pending changes (moved-to-plugin)                                    | none                                  | always                                                  |
| 53  | `skills`             | —                                           | local-jsx     | `commands/skills/index.ts:3-9`                             | List available skills (renders `SkillsMenu`)                                            | none                                  | always                                                  |
| 54  | `stats`              | —                                           | local-jsx     | `commands/stats/index.ts:3-9`                              | Show usage statistics + activity                                                        | none                                  | always                                                  |
| 55  | `status`             | —                                           | local-jsx     | `commands/status/index.ts:3-10`                            | Show version, model, account, API connectivity, tool statuses (immediate)               | none                                  | always                                                  |
| 56  | `statusline`         | —                                           | prompt        | `commands/statusline.tsx:4-22`                             | Configure status-line UI (delegates to subagent)                                        | `<prompt>`                            | always                                                  |
| 57  | `stickers`           | —                                           | local         | `commands/stickers/index.ts:3-9`                           | Order stickers                                                                          | none                                  | always                                                  |
| 58  | `tag`                | —                                           | local-jsx     | `commands/tag/index.ts:3-11`                               | Toggle searchable tag on session                                                        | `<tag>`                               | ant-only                                                |
| 59  | `tasks`              | `bashes`                                    | local-jsx     | `commands/tasks/index.ts:3-9`                              | List/manage background tasks                                                            | none                                  | always                                                  |
| 60  | `terminal-setup`     | —                                           | local-jsx     | `commands/terminalSetup/index.ts:12-22`                    | Install Shift+Enter (or Option+Enter on Apple Terminal) keybinding                      | none                                  | hidden on natively-supported terminals                  |
| 61  | `theme`              | —                                           | local-jsx     | `commands/theme/index.ts:3-9`                              | Change theme                                                                            | none                                  | always                                                  |
| 62  | `think-back`         | —                                           | local-jsx     | `commands/thinkback/index.ts:4-11`                         | "2025 Claude Code Year in Review" easter egg                                            | none                                  | feature gate                                            |
| 63  | `thinkback-play`     | —                                           | local         | `commands/thinkback-play/index.ts:6-15`                    | Hidden: plays the thinkback animation                                                   | none                                  | hidden                                                  |
| 64  | `upgrade`            | —                                           | local-jsx     | `commands/upgrade/index.ts:5-14`                           | Upgrade to Max                                                                          | none                                  | claude.ai non-enterprise                                |
| 65  | `extra-usage`        | —                                           | local-jsx     | `commands/extra-usage/index.ts:13-19`                      | Configure overage to keep working past limits                                           | none                                  | overage-allowed accounts                                |
| 66  | `extra-usage` (NI)   | —                                           | local         | `commands/extra-usage/index.ts:21-31`                      | Headless variant of extra-usage                                                         | none                                  | non-interactive only                                    |
| 67  | `rate-limit-options` | —                                           | local-jsx     | `commands/rate-limit-options/index.ts`                     | (already counted as #40)                                                                | —                                     | —                                                       |
| 68  | `usage`              | —                                           | local-jsx     | `commands/usage/index.ts:3-9`                              | Show plan usage limits                                                                  | none                                  | claude.ai                                               |
| 69  | `insights`           | —                                           | prompt        | `commands.ts:190-202` (lazy shim) → `commands/insights.ts` | Generate analytical report of sessions (Opus, ~3200-line module deferred until invoked) | none                                  | always                                                  |
| 70  | `vim`                | —                                           | local         | `commands/vim/index.ts:3-9`                                | Toggle Vim/Normal editing modes                                                         | none                                  | always                                                  |
| 71  | `login`              | —                                           | local-jsx     | `commands/login/index.ts:5-14`                             | Sign in / switch Anthropic account                                                      | none                                  | hidden if 3P services; gated by `DISABLE_LOGIN_COMMAND` |
| 72  | `logout`             | —                                           | local-jsx     | `commands/logout/index.ts:5-10`                            | Sign out                                                                                | none                                  | hidden if 3P services                                   |
| 73  | `advisor`            | —                                           | local         | `commands/advisor.ts:96-107`                               | Configure advisor (second-opinion) model                                                | `[<model>\|off]`                      | hidden unless eligible                                  |
| 74  | `voice`              | —                                           | local         | `commands/voice/index.ts:7-20`                             | Toggle voice mode                                                                       | none                                  | feature `VOICE_MODE`, claude.ai                         |
| 75  | `web-setup`          | —                                           | local-jsx     | `commands/remote-setup/index.ts:5-20`                      | Setup Claude Code on the web (CCR)                                                      | none                                  | feature `CCR_REMOTE_SETUP` + GH+policy                  |
| 76  | `brief`              | —                                           | local-jsx     | `commands/brief.ts:47-?`                                   | Toggle brief-only mode (Kairos surface)                                                 | none                                  | feature `KAIROS`/`KAIROS_BRIEF`                         |

### B. Internal-only (`USER_TYPE === 'ant'`, in `INTERNAL_ONLY_COMMANDS` array `commands.ts:225-254`)

These exist as full source files when present, but are **stubs** in the public `node_modules` snapshot under `~/Desktop/reference` (`export default { isEnabled: () => false, isHidden: true, name: 'stub' }`). Only `commit*`, `bridge-kick`, `version`, and `init-verifiers` ship full source in the snapshot. Listed here for completeness because the registry array references them.

| #   | Name                  | Type          | File                                          | Purpose                                                                    | State in snapshot       |
| --- | --------------------- | ------------- | --------------------------------------------- | -------------------------------------------------------------------------- | ----------------------- |
| 77  | `backfill-sessions`   | —             | `commands/backfill-sessions/index.js`         | (ant-only)                                                                 | stub                    |
| 78  | `break-cache`         | —             | `commands/break-cache/index.js`               | (ant-only)                                                                 | stub                    |
| 79  | `bughunter`           | —             | `commands/bughunter/index.js`                 | (ant-only)                                                                 | stub                    |
| 80  | `commit`              | prompt        | `commands/commit.ts:57-92`                    | Single-message git commit with attribution + safety protocol               | full source             |
| 81  | `commit-push-pr`      | prompt        | `commands/commit-push-pr.ts:108-158`          | Commit + push + PR + optional Slack                                        | full source             |
| 82  | `ctx_viz`             | —             | `commands/ctx_viz/index.js`                   | (ant-only)                                                                 | stub                    |
| 83  | `good-claude`         | —             | `commands/good-claude/index.js`               | (ant-only)                                                                 | stub                    |
| 84  | `issue`               | —             | `commands/issue/index.js`                     | (ant-only)                                                                 | stub                    |
| 85  | `init-verifiers`      | prompt        | `commands/init-verifiers.ts:3-262`            | Create verifier skills (Playwright/Tmux/HTTP) for `Verify` agent           | full source             |
| 86  | `force-snip`          | —             | `commands/force-snip.js`                      | feature `HISTORY_SNIP` (ant)                                               | not present             |
| 87  | `mock-limits`         | —             | `commands/mock-limits/index.js`               | (ant-only)                                                                 | stub                    |
| 88  | `bridge-kick`         | local         | `commands/bridge-kick.ts:191-200`             | Inject bridge-failure states for manual recovery testing (10+ subcommands) | full source             |
| 89  | `version`             | local         | `commands/version.ts:12-22`                   | Print build version                                                        | full source             |
| 90  | `ultraplan`           | —             | `commands/ultraplan.tsx`                      | feature `ULTRAPLAN` — multi-agent CCR planning                             | partial source          |
| 91  | `subscribe-pr`        | —             | `commands/subscribe-pr.js`                    | feature `KAIROS_GITHUB_WEBHOOKS`                                           | not present             |
| 92  | `reset-limits` (+ NI) | local + local | `commands/reset-limits/index.js`              | (ant-only)                                                                 | stub (both names)       |
| 93  | `onboarding`          | —             | `commands/onboarding/index.js`                | (ant-only)                                                                 | stub                    |
| 94  | `share`               | —             | `commands/share/index.js`                     | (ant-only)                                                                 | stub                    |
| 95  | `summary`             | —             | `commands/summary/index.js`                   | (ant-only)                                                                 | stub                    |
| 96  | `teleport`            | —             | `commands/teleport/index.js`                  | (ant-only)                                                                 | stub                    |
| 97  | `ant-trace`           | —             | `commands/ant-trace/index.js`                 | (ant-only)                                                                 | stub                    |
| 98  | `perf-issue`          | —             | `commands/perf-issue/index.js`                | (ant-only)                                                                 | stub                    |
| 99  | `env`                 | —             | `commands/env/index.js`                       | (ant-only)                                                                 | stub                    |
| 100 | `oauth-refresh`       | —             | `commands/oauth-refresh/index.js`             | (ant-only)                                                                 | stub                    |
| 101 | `debug-tool-call`     | —             | `commands/debug-tool-call/index.js`           | (ant-only)                                                                 | stub                    |
| 102 | `agents-platform`     | —             | `commands/agents-platform/index.js` (require) | feature ant-only                                                           | not present in snapshot |
| 103 | `autofix-pr`          | —             | `commands/autofix-pr/index.js`                | (ant-only)                                                                 | stub                    |

### C. Feature-flag-only (require()'d at module load)

`commands.ts:62-122` lazily requires these via `feature(...)`; they appear in `COMMANDS()` only when the flag is on:

- `proactive` — `feature('PROACTIVE')` or `feature('KAIROS')` (`commands.ts:62-65`)
- `assistantCommand` — `feature('KAIROS')` (`commands.ts:70-72`)
- `bridge` — already counted as `remote-control` (`commands.ts:73-75`)
- `remoteControlServerCommand` — `feature('DAEMON')` + `feature('BRIDGE_MODE')` (`commands.ts:76-79`)
- `voiceCommand` — already counted as `voice` (`commands.ts:80-82`)
- `forceSnip` — `feature('HISTORY_SNIP')`
- `workflowsCmd` — `feature('WORKFLOW_SCRIPTS')`
- `webCmd` — already counted as `web-setup`
- `subscribePr` — `feature('KAIROS_GITHUB_WEBHOOKS')`
- `ultraplan` — `feature('ULTRAPLAN')`
- `torch` — `feature('TORCH')`
- `peersCmd` — `feature('UDS_INBOX')`
- `forkCmd` — `feature('FORK_SUBAGENT')` (when on, branch loses `fork` alias — see `branch/index.ts:8`)
- `buddy` — `feature('BUDDY')`

### D. Categorization

- **Meta:** `help`, `clear`, `compact`, `exit`, `release-notes`, `version`, `doctor`, `status`, `stats`, `usage`, `cost`, `extra-usage`, `rate-limit-options`, `passes`, `upgrade`, `feedback`, `stickers`, `think-back`, `thinkback-play`.
- **Config:** `model`, `effort`, `fast`, `theme`, `color`, `vim`, `keybindings`, `terminal-setup`, `config`/`settings`, `output-style` (deprecated), `permissions`/`allowed-tools`, `hooks`, `mcp`, `agents`, `plugin`/`marketplace`, `reload-plugins`, `privacy-settings`, `sandbox`, `tag`, `rename`, `advisor`, `add-dir`, `remote-env`, `statusline`.
- **Workflow:** `init`, `init-verifiers`, `commit`, `commit-push-pr`, `review`, `ultrareview`, `security-review`, `pr-comments`, `plan`, `branch`/`fork`, `rewind`/`checkpoint`, `resume`/`continue`, `tasks`/`bashes`, `export`, `copy`, `diff`, `files`, `context`, `insights`, `memory`, `skills`, `btw`, `brief`.
- **Surface launchers:** `mobile`/`ios`/`android`, `desktop`/`app`, `chrome`, `ide`, `web-setup`, `voice`, `remote-control`/`rc`, `session`/`remote`, `install-github-app`, `install-slack-app`.
- **Auth:** `login`, `logout`.
- **Debug / hidden / dev:** `heapdump` (hidden), `bridge-kick` (ant), `mock-limits` (ant), `reset-limits` (ant), `backfill-sessions` (ant), `ant-trace` (ant), `perf-issue` (ant), `debug-tool-call` (ant), `oauth-refresh` (ant), `env` (ant), `ctx_viz` (ant), `good-claude` (ant), `issue` (ant), `bughunter` (ant), `share` (ant), `summary` (ant), `onboarding` (ant), `teleport` (ant), `agents-platform` (ant), `autofix-pr` (ant), `force-snip` (ant), `subscribe-pr` (ant).

### E. Slash-prompt vs CLI subcommand

Slash commands are **prompt-time only.** The Bash CLI binary surfaces a different set of subcommands (`claude install`, `claude plugin install`, `claude attach`, `claude --bg`, `claude --remote`, `--demo`, etc.) parsed elsewhere — see `apps/cli/`-style entrypoints in `~/Desktop/reference/src/cli/`. Slash commands run **inside** an active REPL via `processSlashCommand`. Some commands have non-interactive variants (`context`, `extra-usage`) registered as a _separate_ `Command` with `supportsNonInteractive: true` and a `local` (not `local-jsx`) type, switched via `getIsNonInteractiveSession()` (e.g. `commands/context/index.ts:12-24`).

---

## 2. Registration & Dispatch

### `commands.ts` registry pattern

- **Static `import` block** at the top (`commands.ts:2-58`) for every always-on command.
- **Conditional `require()` block** (`commands.ts:62-122`) for feature-flagged commands (returns `null` when flag off).
- **`COMMANDS = memoize((): Command[] => [...])`** — array literal at `commands.ts:258-346`, including spread operators that drop unset entries (e.g. `...(webCmd ? [webCmd] : [])`). Memoized but reads runtime state, so it's only safe to call after config is loaded.
- **`INTERNAL_ONLY_COMMANDS`** array (`commands.ts:225-254`) is concatenated when `USER_TYPE === 'ant' && !IS_DEMO` (line 343).
- **`getCommands(cwd)`** (`commands.ts:476-517`) is the public entry. It awaits `loadAllCommands(cwd)` (`449-469`) which fans out to skills/plugin/workflow loaders in parallel, then concatenates: `[...bundledSkills, ...builtinPluginSkills, ...skillDirCommands, ...workflowCommands, ...pluginCommands, ...pluginSkills, ...COMMANDS()]`. Then filters by `meetsAvailabilityRequirement()` + `isCommandEnabled()`, then injects dynamic skills.
- **Lookup helpers:** `findCommand`/`hasCommand`/`getCommand` at `commands.ts:688-719` walk the array linearly checking `name` + `userFacingName()` + `aliases`. Throws `ReferenceError` listing every available command on miss.

### Per-command file shape

The conventional pattern: `commands/<name>/index.ts` exports a default `Command` object with `type`, `name`, `description`, optional `aliases`, optional `argumentHint`, optional `isEnabled`/`isHidden`/`availability`/`immediate`, and a **`load: () => import('./<name>.js')`** lazy import. The implementation file (`<name>.tsx` for JSX, `<name>.ts` for plain) exports `call: LocalCommandCall` or `call: LocalJSXCommandCall`.

For `prompt` commands, the index file exports the full Command directly (no lazy load), and provides `getPromptForCommand(args, context)` which returns `ContentBlockParam[]`. See `commands/commit.ts:57-90` for a clean example.

### User-input → command routing

1. **`parseSlashCommand`** (`utils/slashCommandParsing.ts:25-60`) splits trimmed input starting with `/`. First word becomes `commandName`; if second word is `(MCP)`, the name is appended with the marker and `isMcp` set true. Remaining words become `args`.
2. **`processSlashCommand`** (`utils/processUserInput/processSlashCommand.tsx:309-?`) calls `parseSlashCommand`, then `hasCommand(commandName, context.options.commands)`. On miss, it `stat()`s `/${commandName}` to disambiguate file paths, then either logs `tengu_input_slash_invalid` ("Unknown skill: …") or treats as a regular text prompt.
3. On hit, `getMessagesForSlashCommand` (referenced at line 395) dispatches by `cmd.type`:
   - `prompt` → `await cmd.getPromptForCommand(args, ctx)`, splices result blocks into the message stream, then triggers a model query.
   - `local` → `await (await cmd.load()).call(args, ctx)` returns `LocalCommandResult` (text/compact/skip).
   - `local-jsx` → `await (await cmd.load()).call(onDone, ctx, args)` returns a React node rendered as Ink UI overlay.
4. The user-typed string is _also_ stored into the message stream as a synthetic user message (for transcript), and the result is wrapped in `<local-command-stdout>...</local-command-stdout>` (`processSlashCommand.tsx:286-288`) so the model sees it but the UI knows it was a tool result.

---

## 3. Argument Parsing

- **No structured arg parsing.** `args` is a single trimmed string passed verbatim to the handler. Each command does its own splitting (e.g. `bridge-kick.ts:61` does `args.trim().split(/\s+/)`; `advisor.ts:17` does `args.trim().toLowerCase()`).
- **`argumentHint`** (`types/command.ts:186`) is a free-text string shown grayed out after the command name in autocomplete (e.g. `[name]`, `<path>`, `[low|medium|high|max|auto]`). Not parsed — purely UI hint.
- **`argNames` + `argumentSubstitution.ts`** is the structured path **for skills**, not builtin commands. Skills declare `arguments: ['foo', 'bar']` in frontmatter and use `$1`, `$ARGUMENTS`, `${foo}` placeholders inside markdown body. `substituteArguments(content, args, true, argNames)` at `loadSkillsDir.ts:349-354` performs the substitution.
- **No `--flag` parsing.** Skills can declare `--name=value` style via `parseArgumentNames` but builtin commands do their own flag scraping (e.g. `compact` checks if first token is a quote-quoted instruction).
- **Help text** is _not_ auto-generated from command metadata. The `HelpV2` component (`components/HelpV2/Commands.tsx:4,41`) iterates the command list, calls `formatDescriptionWithSource(cmd)` (`commands.ts:728-754`), and prints `name (aliases) — description` rows. `argumentHint` renders in the typeahead, not in `/help`.
- **Autocomplete** is in `commands.ts:348-351` — `builtInCommandNames()` is a memoized `Set<string>` of every name + alias, used by the typeahead UI to filter as the user types `/`.

---

## 4. Custom Commands (User-defined Skills)

### File format

Skills are markdown files with YAML frontmatter:

```yaml
---
name: my-skill
description: When and what to invoke
allowed-tools: Bash(git:*), Read, Edit
argument-hint: <pr-number>
arguments: [pr]
when_to_use: |
  When the user wants…
disable-model-invocation: false
user-invocable: true
model: opus|sonnet|haiku|inherit
context: inline|fork
agent: general-purpose
effort: high
hooks: { ... }
paths: ['src/**', 'tests/**']
shell: { ... }
version: 1.0.0
---
# Skill body markdown — inline `!` ``…`` lets you embed shell output;
# ${CLAUDE_SKILL_DIR} and ${CLAUDE_SESSION_ID} are substituted at runtime;
# $1/$ARGUMENTS/${name} are user-arg substitution.
```

The full frontmatter parser is at `skills/loadSkillsDir.ts:185-265` (`parseSkillFrontmatterFields`).

### Discovery paths (priority order)

`loadSkillsDir.ts:638-714` (`getSkillDirCommands`) loads in parallel from:

1. **`policySettings`** — `<managed-path>/.claude/skills/` (admin-managed, gated by `CLAUDE_CODE_DISABLE_POLICY_SKILLS`).
2. **`userSettings`** — `~/.claude/skills/` (or `$CLAUDE_CONFIG_DIR/skills/`; resolved by `getClaudeConfigHomeDir()`).
3. **`projectSettings`** — `.claude/skills/` walking _up_ from CWD to home (`getProjectDirsUpToHome('skills', cwd)`), so subdirectory skills override parent-directory skills.
4. **Additional dirs** (`--add-dir <path>`) — `<path>/.claude/skills/` for each.
5. **Legacy `commands/`** — same walk pattern but for `~/.claude/commands/` and `.claude/commands/` (`loadSkillsFromCommandsDir`, `loadSkillsDir.ts:566-623`). Marked `loadedFrom: 'commands_DEPRECATED'`. Supports both directory format (`SKILL.md`) and single `.md` file format. Default `user-invocable: true`.
6. **`bundled` skills** — shipped inside the binary via `skills/bundledSkills.ts` (`getBundledSkills()`).
7. **MCP skills** — registered at session start via `registerMCPSkillBuilders` (`mcpSkillBuilders.ts`). MCP skills are remote/untrusted; `loadSkillsDir.ts:374` _blocks_ shell-injection (`!\`…\``) execution from their bodies.
8. **Plugin skills** — see `utils/plugins/loadPluginCommands.ts` and `utils/plugins/loadPluginSkills`. Plugin commands prefix-namespace as `<plugin>:<command>`.

`/skills/` directories require _directory format_ (`<skill-name>/SKILL.md`); single `.md` files at top level are silently skipped (`loadSkillsDir.ts:425-427`). `/commands/` accepts both formats — see `transformSkillFiles` (`loadSkillsDir.ts:493-521`).

### Loading

- **Lazy** — at first `getCommands()` call. Memoized by cwd (`loadAllCommands` at `commands.ts:449`). Cleared by `clearCommandsCache()` after `/login`, `/reload-plugins`, etc.
- **Symlink-aware deduplication** — uses `realpath()` per file (`loadSkillsDir.ts:118-124`), keeps the first-seen source so policy beats user beats project.
- **Conditional skills** — `paths: ['src/**']` frontmatter makes a skill only visible _after_ the model touches a matching file. Stored in `conditionalSkills` map at `loadSkillsDir.ts:788-790`, activated by `getDynamicSkills()` and merged into the command list via `commands.ts:480-516`.

### Plugin commands path

Plugins are a separate path: `utils/plugins/loadPluginCommands.ts` walks plugin manifests, runs `walkPluginMarkdown.ts`, parses the same frontmatter shape, marks `source: 'plugin'`, and prefixes the command name with `<plugin-name>:`. Plugins can ship with their own MCP servers, hooks, agents, output-styles too — separate loaders (`loadPluginAgents.ts`, `loadPluginHooks.ts`, etc.).

---

## 5. Output Rendering

The `Command.type` discriminator chooses the renderer:

- **`prompt`** — Returns `ContentBlockParam[]` from `getPromptForCommand`. Inserted as a synthetic user message and immediately re-queried (model runs). Bash interpolation `!\`…\``is pre-executed by`executeShellCommandsInPrompt` *before* sending to the model (`commit.ts:67-86`). Tool allowlist for the turn is set via `toolPermissionContext.alwaysAllowRules.command` (commit.ts:73-83).
- **`local`** — Returns `LocalCommandResult = { type: 'text'; value: string } | { type: 'compact'; ... } | { type: 'skip' }` (`types/command.ts:16-23`). Plain text wrapped in `<local-command-stdout>` and shown in transcript without a model round-trip.
- **`local-jsx`** — Returns a React node (Ink). Rendered as a _modal overlay_ over the chat. `onDone(result?, options?)` is called when the dialog closes; `result` becomes the transcript message, `options.display` chooses `'skip'|'system'|'user'`, `options.shouldQuery` triggers a follow-up model call, `options.metaMessages` injects hidden meta messages, `options.nextInput`/`submitNextInput` chains to a follow-up command (`types/command.ts:117-126`).

The two output paths feeding the conversation history vs stdout:

- **JSX commands** can flow either way. Most pop a dialog and call `onDone()` with no args (skip transcript), but `/commit` etc emit text via `onDone(result, { display: 'system' })`.
- **Prompt commands** _always_ feed the transcript and trigger a model query.
- **`isSensitive: true`** redacts args from history (`types/command.ts:200`).

`BRIDGE_SAFE_COMMANDS` (`commands.ts:651-660`) is a hand-curated allowlist of `local` commands (`compact`, `clear`, `cost`, `summary`, `releaseNotes`, `files`) that are safe to run when the inbound came from mobile/web bridge. `local-jsx` commands are blocked by type from bridge inbound; `prompt` commands are allowed by type.

`REMOTE_SAFE_COMMANDS` (`commands.ts:619-637`) is a similar set for `--remote` mode (CCR pre-init): `session`, `exit`, `clear`, `help`, `theme`, `color`, `vim`, `cost`, `usage`, `copy`, `btw`, `feedback`, `plan`, `keybindings`, `statusline`, `stickers`, `mobile`.

---

## 6. High-Value Command Deep-Dives

- **`/help`** (`commands/help/help.tsx:4-9`) — renders `<HelpV2 commands={commands} onClose={onDone} />`. Iterates the command array via `formatDescriptionWithSource(cmd)` and shows source annotations like `(plugin)`, `(workflow)`, `(bundled)`, plus aliases. Two tabs: "Commands" and "General".
- **`/init`** (`commands/init.ts:226-256`) — _prompt_ type. Returns either an old short prompt or the **245-line `NEW_INIT_PROMPT`** (init.ts:28-224) when `feature('NEW_INIT')` + `USER_TYPE === 'ant'` or `CLAUDE_CODE_NEW_INIT` env. The new flow is an 8-phase orchestration: ask what to set up (project / personal / both + skills+hooks); subagent surveys codebase; gap-fill via `AskUserQuestion`; write `CLAUDE.md`; write `CLAUDE.local.md` + add to `.gitignore`; create `.claude/skills/<name>/SKILL.md`; suggest hooks (loads the `update-config` skill); recap + suggest plugin installs (`/plugin install frontend-design@claude-plugins-official`, `/plugin install playwright@…`, `/plugin install skill-creator@…`).
- **`/clear`** (`commands/clear/conversation.ts:49-251`) — `setMessages(() => [])` plus regenerates session ID, runs SessionEnd hooks, evicts cache via `tengu_cache_eviction_hint`, clears file-state cache, clears MCP state (preserving `pluginReconnectKey`), partitions tasks (kill foreground, preserve backgrounded), resets attribution + standalone-agent-context + fileHistory, clears plan slugs and session metadata, re-fires SessionStart hooks. Background tasks (`Ctrl+B`) are preserved across clears.
- **`/model`** (`commands/model/index.ts:5-16`) — local-jsx, dynamic description (`renderModelName(getMainLoopModel())`), `immediate: true` so it bypasses the queue when configurable. Loads `model.tsx` (model picker UI).
- **`/agents`** (`commands/agents/agents.tsx:6-11`) — local-jsx. Renders `<AgentsMenu tools={tools} onExit={onDone} />` with the resolved tool set from `getTools(permissionContext)`.
- **`/login`** (`commands/login/login.tsx:19-58`) — local-jsx. On success: resets cost state, refreshes remotely-managed settings + policy limits + user cache + GrowthBook, clears stale trusted-device token, re-enrolls via `enrollTrustedDevice()`, resets bypass-permissions killswitch, increments `authVersion` to bust auth-dependent hooks. Strips signature-bearing message blocks (`thinking`, `connector_text`) because they're bound to the prior API key.
- **`/permissions`** (`commands/permissions/permissions.tsx:5-9`) — local-jsx. Renders `<PermissionRuleList onExit={onDone} onRetryDenials={…}/>`. On retry, prepends a `createPermissionRetryMessage(commands)` to the message stream (so a denied tool call can be replayed after rule edit).
- **`/plan`** (`commands/plan/plan.tsx:64-?`) — local-jsx. If not in plan mode, transitions current mode → `plan` via `handlePlanModeTransition`, applies a `setMode` permission update, prepares the context via `prepareContextForPlanMode`. Args of `open` opens the plan file in `$EDITOR`/`$VISUAL`. Other args become a plan description.
- **`/memory`** (`commands/memory/memory.tsx:14-?`) — local-jsx. Renders `MemoryFileSelector`. After selection, opens chosen file in `$EDITOR`/`$VISUAL` via `editFileInEditor(path)`. Files include all `CLAUDE.md` / `CLAUDE.local.md` upward from cwd plus `~/.claude/CLAUDE.md`, surfaced by `getMemoryFiles()`.
- **`/skills`** (`commands/skills/skills.tsx:5-7`) — local-jsx. Renders `<SkillsMenu commands={context.options.commands} />` listing all loaded skills (bundled + user + project + plugin + MCP).
- **`/mcp`** (`commands/mcp/index.ts:3-11`) — local-jsx, `immediate: true`. `argumentHint: '[enable|disable [server-name]]'`. Renders the MCP-server admin panel.
- **`/export`** (`commands/export/index.ts:3-9`) — local-jsx. `argumentHint: '[filename]'`. Saves transcript to file or clipboard.
- **`/share`** — _stub in public build_ (`commands/share/index.js:1`). Internal-only.
- **`/resume`** (`commands/resume/index.ts:3-10`) — local-jsx. `aliases: ['continue']`. `argumentHint: '[conversation id or search term]'`. UI picker by id/title/search.
- **No standalone `/connectors`** — connectors are managed inside `/mcp` and `/config`.

---

## 7. Surprising / Distinctive Commands

- **`/btw`** (`commands/btw/index.ts:3-12`) — "Ask a quick side question without interrupting the main conversation." `immediate: true`. The side-thread does not pollute the main conversation context.
- **`/insights`** (`commands.ts:190-202`) — Lazy-shimmed because the implementation is a 113KB / ~3200-line module (heavy diff/HTML rendering). Opens an analytical Year-in-Review-like report of all your sessions. Uses Opus.
- **`/think-back`** (`commands/thinkback/index.ts:4-11`) — "Your 2025 Claude Code Year in Review." Statsig feature-gated. Has a hidden `/thinkback-play` companion command (`thinkback-play/index.ts:6-15`) that the skill itself invokes after generation completes — _commands invoking commands_.
- **`/init-verifiers`** (`commands/init-verifiers.ts:3-262`) — 260-line prompt that auto-detects project type (Playwright vs CLI vs API) and creates `verifier-*` skills the `Verify` agent picks up by folder-name convention.
- **`/passes`** (`commands/passes/index.ts:7-22`) — referral-code system. Visibility + description are dynamic based on cached referrer reward.
- **`/advisor`** (`commands/advisor.ts:96-107`) — second-opinion model. Runs a different model alongside the main loop.
- **`/sandbox`** (`commands/sandbox-toggle/index.ts:5-49`) — toggles macOS Seatbelt / Linux bwrap with autoallow-bash-if-sandboxed semantics. Description renders live status icons (✓/⚠/○).
- **`/bridge-kick`** (`commands/bridge-kick.ts:51-189`) — ant-only chaos-engineering tool with 10 subcommands (`close`, `poll`, `register`, `reconnect-session`, `heartbeat`, `reconnect`, `status`) for injecting bridge failures and verifying recovery.
- **`/desktop`** + **`/mobile`** + **`/chrome`** + **`/web-setup`** + **`/voice`** + **`/remote-control`** — six surface launchers from inside the CLI. CLI is a hub.
- **`/remote-control` aka `/rc`** (`commands/bridge/index.ts:12-24`) — the two-letter alias for the remote-control bridge, bound to `BRIDGE_MODE` feature flag.
- **`/extra-usage`** (`commands/extra-usage/index.ts`) — runs in interactive _and_ non-interactive mode through _two registered Command objects_ with the same name, switched by `getIsNonInteractiveSession()`. This is a pattern AGI Workforce can copy if we want a single command name to ship both modes.
- **`/ultrareview`** (`commands/review.ts:48-54`) — paid remote bug-hunter run on Claude Code on the web (CCR). 10–20 minute background run, billed as Extra Usage. Local CLI shows an overage-confirmation dialog.
- **`/commit-push-pr`** (`commands/commit-push-pr.ts:108-158`) — combines commit + push + PR + optional Slack post. Reads `SAFEUSER` env for branch-name prefix. Allows `mcp__slack__send_message` and `mcp__claude_ai_Slack__slack_send_message` in the prompt's tool allowlist.
- **`createMovedToPluginCommand`** (`commands/createMovedToPluginCommand.ts:22-65`) — an in-tree "redirect to plugin" wrapper. When `USER_TYPE === 'ant'`, the command tells the user to install a plugin and _exits without executing_. When external, falls back to the legacy in-tree prompt. Used by `/security-review` and `/pr-comments`.
- **Aliases that disappear under feature flags** — `branch/index.ts:8` drops `fork` alias when `feature('FORK_SUBAGENT')` is on (because `/fork` then exists as a separate command).

---

## 8. Cross-References

(commands → other systems they reach into)

- **`tools/`:** every `prompt` command sets `allowedTools: [...]` (e.g. `commit.ts:6-10`, `commit-push-pr.ts:10-24`, `security-review.ts:7`). `agents.tsx:7-9` calls `getTools(permissionContext)`. `statusline.tsx:12` references `AGENT_TOOL_NAME`.
- **`services/`:** `cost/cost.ts:3` reads `currentLimits` from `services/claudeAiLimits.js`. `clear/conversation.ts:14-16` calls `services/analytics`. `commands.ts:529-531` clears `services/skillSearch/localSearch.js` cache. `passes/index.ts:3-5` reads `services/api/referral.js`.
- **`bridge/`:** `bridge/index.ts:2` reads `bridge/bridgeEnabled`; `bridge-kick.ts:1` uses `bridge/bridgeDebug`; `login.tsx:4` calls `bridge/trustedDevice`.
- **`memdir/`:** memory command (`commands/memory/memory.tsx`) imports from `utils/claudemd.js` for memory-file discovery; not directly from the `memdir/` directory in the repo. The `memdir/` directory holds memory deduplication / compaction utilities consumed by the runtime, not by slash commands directly.
- **`skills/`:** `commands.ts:156-167` imports `getSkillDirCommands`, `clearSkillCaches`, `getDynamicSkills`, `getBundledSkills`. The skill loader at `skills/loadSkillsDir.ts:638-714` is what merges user skills into `getCommands()`.

---

## 9. Open Questions

1. **What is the _true_ count of public-build slash commands?** The registry includes ~76 always-on entries plus ~24 ant-only. Some ship as stubs (`stub` name, `isHidden: true`, `isEnabled: () => false`) — verifiable by running the binary, but the snapshot makes the static count fuzzy. Precise enumeration requires running `claude --print-commands` (no such flag in source) or filtering `getCommands()` at runtime with `USER_TYPE` unset.
2. **`force-snip`, `subscribe-pr`, `agents-platform`** — referenced by `commands.ts:84-103` via `require('./commands/.../index.js')` but those `.js` files do not exist in the snapshot. Are they generated at build time, or removed from the public bundle entirely?
3. **`/insights`** lazy-shim says the module is 113KB / 3200 lines and _includes diffLines and HTML rendering_. What does the report look like, and does it ship in the public binary or only ant builds? `commands/insights.ts` is present in the snapshot but the rendering layer it calls is unread.
4. **Skill `paths:` activation** — when does a path-conditional skill _become_ visible after the model "touches" a matching file? `getDynamicSkills` is called from `getCommands` (`commands.ts:480`) but the trigger that adds a skill name to `activatedConditionalSkillNames` is in a separate file (likely `services/skillSearch/` or a tool-event hook) — not traced in this pass.
5. **Plugin command namespacing** — `formatDescriptionWithSource` (`commands.ts:728-754`) shows plugins as `(plugin-name) description`, but the `<plugin>:<command>` name prefix and the `userFacingName()` override interaction wasn't fully traced (plugin index.tsx is mostly minified in the snapshot).
6. **BRIDGE-mode arrow direction** — `BRIDGE_SAFE_COMMANDS` is a manual allowlist for `local` commands, but `prompt` commands are blanket-allowed by type. Does the bridge actually push every prompt command's pre-executed shell commands through? `commit.ts` runs `executeShellCommandsInPrompt` for `git status`/`git diff` _before_ the model sees them — does the bridge handle that?
7. **Commands invoking commands** — `/think-back` triggers a hidden `/thinkback-play` command _after_ generation. Is this a general pattern, and how does the second command get queued? Looks like `LocalJSXCommandOnDone.options.nextInput` + `submitNextInput` (`types/command.ts:124-125`) — but no example in the snapshot of a builtin actually using these fields.
8. **`USER_TYPE === 'ant' && !IS_DEMO`** gate — adds `INTERNAL_ONLY_COMMANDS` to the registry (`commands.ts:343-345`). Why the `!IS_DEMO` exception? Suggests demo builds run with USER_TYPE=ant but want to hide the chaos-engineering surface.
9. **`/output-style`** is marked deprecated and hidden (`output-style/index.ts:6-8`) but still ships as a stub. Why ship at all instead of deleting?
10. **Are skill `effort:` and `model:` overrides scoped to the skill turn only**, or do they bleed into the rest of the conversation? The handler builds a temporary `toolPermissionContext` for `allowedTools` (`loadSkillsDir.ts:381-391`), suggesting one-shot scope, but `effort` is read into the Command itself (`createSkillCommand` `effort` field at `loadSkillsDir.ts:332`).

---

## 10. Implications for AGI Workforce

(Out of strict scope per prompt, but flagged as obvious gaps for the gap-analysis caller.)

- Our CLI ships **22 subcommands**; Claude Code's slash-command surface alone is **~60 visible builtins** plus dynamic skills and plugins. The headline gap is the _plugin marketplace_ and the _user-skill loader_ — we have neither.
- Three patterns to copy directly: (a) the _interactive vs non-interactive_ dual registration (`extra-usage`, `context`); (b) `argumentHint` for typeahead UX; (c) feature-flagged `require()` so we can ship nightly experiments without bloating the main build.
- `createMovedToPluginCommand` is the canonical migration path — we should adopt it before splitting our CLI's monolithic command set.
- The `prompt` command type is the _cheapest_ feature path: write a markdown body, point it at a tool allowlist, ship. We currently hand-implement every CLI subcommand in Rust.
- `BRIDGE_SAFE_COMMANDS` / `REMOTE_SAFE_COMMANDS` allowlists are how Claude Code keeps mobile-bridge-driven slash commands from spawning local Ink dialogs. We should expect the same problem when the AGI Workforce mobile dispatch reaches across to desktop — desktop needs a parallel allowlist.

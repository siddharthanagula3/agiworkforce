# M6 — Entry, Bootstrap, Context (Claude Code Reference Suite, May 2026)

> Deep-dive #6 of the 30-agent reference audit. Scope: how the `claude` Node CLI boots — argv intake, commander dispatch, environment setup, migrations, telemetry, MCP/auth pre-fetch, settings, plugin/skill prefetch, trust dialog, and finally REPL/headless/SDK/SSH/connect/assistant launch. Files cited at file:line throughout. Source tree pinned to `~/Desktop/reference/src/` (Mar 31 2026 snapshot, mostly compiled+formatted JS reproduced as `.tsx`/`.ts`).
>
> Files inventoried in full: `main.tsx` (4683 LOC), `setup.ts` (477 LOC), `context.ts` (189 LOC, root), `bootstrap/state.ts` (~56K bytes; field-level summary cited), `context/{fpsMetrics,mailbox,modalContext,notifications,overlayContext,promptOverlayContext,QueuedMessageContext,stats,voice}.tsx` (9 files), `entrypoints/{cli.tsx,init.ts,mcp.ts,sandboxTypes.ts,agentSdkTypes.ts}` plus `entrypoints/sdk/{coreTypes,coreSchemas,controlSchemas}.ts` (8 files total).

---

## 1. Boot phases — `main.tsx` end-to-end timeline

`main.tsx` is the single big module the `claude` binary ultimately evaluates after `entrypoints/cli.tsx` decides "no fast-path applies, load the heavy module." It interleaves three concerns:

1. **Top-level side effects** that fire at module evaluation.
2. **`main()`** (line 585) — argv pre-processing, side-effect rewrites, dispatch to `run()`.
3. **`run()`** (line 884) — commander tree construction, `preAction` hook, default action handler that produces every interactive variant.

### 1.1 Pre-imports (module top, lines 1–27)

The first three statements in `main.tsx` fire _before_ any other module loads:

| Step                                  | What                                                                 | Where            | Why before imports                                                                            |
| ------------------------------------- | -------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `profileCheckpoint('main_tsx_entry')` | Marks T0 for the startup profiler                                    | `main.tsx:9–12`  | Anchors all later checkpoints.                                                                |
| `startMdmRawRead()`                   | Spawns macOS `plutil` / Windows `reg query` for MDM-managed settings | `main.tsx:13–16` | Subprocess parallelizes with the ~135 ms of imports below.                                    |
| `startKeychainPrefetch()`             | Spawns macOS Keychain reads (OAuth + legacy API key)                 | `main.tsx:17–20` | Otherwise serialized inside `applySafeConfigEnvironmentVariables()`, costing ~65 ms on macOS. |

The comment at `main.tsx:1-8` explicitly names this trio as the only pre-import side effects: _"these subprocesses run in parallel with the remaining ~135 ms of imports below."_

### 1.2 Imports + module-level wiring (lines 21–209)

`main.tsx` pulls in commander, chalk, React, lodash partials, plus 130+ project-internal modules. Several feature-gated `require(...)` calls (`coordinatorModeModule`, `assistantModule`, `kairosGate`, `autoModeStateModule`) are conditionally bound so they DCE-out of external builds (`main.tsx:74–82`, `:170–172`). Eight pre-baked migration modules (`migrateAutoUpdatesToSettings`, `migrateBypassPermissionsAcceptedToSettings`, etc.) are imported at the top so the sync `runMigrations()` (§3) doesn't pay an `await import()` round-trip.

The module also defines two top-level "pending" structs that are later mutated in `main()` once argv has been parsed:

- `_pendingConnect` (`main.tsx:548–552`) — `cc://` / `cc+unix://` direct-connect target, gated on `feature('DIRECT_CONNECT')`.
- `_pendingAssistantChat` (`main.tsx:559–562`) — `claude assistant [sessionId]` chat-as-viewer mode, gated on `feature('KAIROS')`.
- `_pendingSSH` (`main.tsx:577–584`) — `claude ssh <host> [dir]`, gated on `feature('SSH_REMOTE')`.

`profileCheckpoint('main_tsx_imports_loaded')` lands at line 209.

A debugger-detection guard at `main.tsx:266–271` calls `process.exit(1)` if the Node inspector is attached and the build is `"external"` (i.e., shipped) — defense-in-depth against attaching a debugger to a running release-channel `claude` process.

### 1.3 `main()` (lines 585–856)

The order matters; almost every sub-step exists because of a real bug or environmental quirk.

1. **`process.env.NoDefaultCurrentDirectoryInExePath = '1'`** (`:591`) — security: stops Windows from picking up `cmd.exe` from `cwd` (PATH-hijack mitigation), set before _any_ command exec.
2. **`initializeWarningHandler()`** (`:594`) — installs a `process.on('warning')` handler so deprecation warnings are routed, not lost.
3. **`process.on('exit', resetCursor)`** (`:595–597`) — guarantees `\x1B[?25h` is emitted even on hard exits.
4. **`process.on('SIGINT', ...)`** (`:598–606`) — eats SIGINT in interactive mode (`process.exit(0)`); in `-p`/`--print` mode, defers to `print.ts`'s own SIGINT handler.
5. **`cc://` / `cc+unix://` URL rewrite** (`:612–642`, gated `DIRECT_CONNECT`) — finds a `cc://` arg, parses it via `parseConnectUrl`, stashes serverUrl + authToken on `_pendingConnect`, strips the URL from `argv`, optionally rewrites to the internal `open` subcommand for headless mode.
6. **`--handle-uri` deep-link handler** (`:647–660`) — bails out before commander, calling `handleDeepLinkUri(uri)` and `process.exit(...)`.
7. **macOS `claude://` URL handler** (`:666–676`) — checks `__CFBundleIdentifier === 'com.anthropic.claude-code-url-handler'` to detect that LaunchServices opened the bundle in URL-handler mode; runs `handleUrlSchemeLaunch()` and exits.
8. **`claude assistant [sessionId]` argv-shaping** (`:685–700`, gated `KAIROS`) — strips the `assistant` keyword (and optional sessionId) so the _default_ command handles the launch (full TUI), with `_pendingAssistantChat` populated.
9. **`claude ssh <host> [dir]` argv-shaping** (`:706–795`, gated `SSH_REMOTE`) — does the same for `ssh`, including manual extraction of `--permission-mode`, `--dangerously-skip-permissions`, `--local`, and forwarded session flags (`-c`, `--continue`, `--resume <uuid>`, `--model <m>`). Refuses to run with `-p`/`--print` (line 786).
10. **Print/non-interactive detection** (`:800–815`) — checks for `-p`, `--print`, `--init-only`, `--sdk-url*`, or non-TTY stdout to set the `isNonInteractive` flag _before_ commander parses, because `init()` reads it. `setIsInteractive` and `initializeEntrypoint(isNonInteractive)` (`:517–540`) classify the entrypoint as one of `mcp`, `claude-code-github-action`, `sdk-cli`, or `cli`. The `clientType` IIFE (`:818–833`) then narrows it further to `github-action`, `sdk-typescript`, `sdk-python`, `claude-vscode`, `local-agent`, `claude-desktop`, `remote`, or `cli`.
11. **Question-preview format** (`:835–843`) — defaults to `markdown` for non-SDK clients.
12. **Bridge tagging** (`:846–848`) — if `CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge'`, calls `setSessionSource('remote-control')`.
13. **`eagerLoadSettings()`** (`:852`, defined `:502–516`) — parses `--settings <file-or-json>` and `--setting-sources <sources>` _before_ `init()` so cache resets and the right setting sources are loaded from t0.
14. **`run()`** is awaited (`:854`).

### 1.4 `run()` (lines 884–4513)

`run()` is monolithic and contains the entire commander tree. The shape:

```
preAction hook (init, MDM await, sinks, --plugin-dir wiring, runMigrations(), loadRemoteManagedSettings, loadPolicyLimits)
  └── program.name('claude').argument('[prompt]').helpOption(...).options(...).action(default-action)
       └── 60+ chained .option(...) calls (see §3)
       └── monolithic action handler (lines 1006–3807)
  └── if isPrintMode and not cc://: short-circuit and parse, return.
  └── otherwise, register all subcommands (mcp, plugin, server, ssh, open, auth, agents, auto-mode, ...)
  └── program.parseAsync(process.argv)
  └── profileReport() and return
```

Two key performance shortcuts:

- **`--version` fast-path** lives in `entrypoints/cli.tsx:36–42` (returns inline before any `import`). The full commander tree's `.version()` still exists at `main.tsx:3808` for the `claude --version` typed _with other flags_ case.
- **Print-mode subcommand skip** (`main.tsx:3875–3890`) — skips registering 50+ subcommands (mcp, auth, plugin, marketplace, doctor, update, install, log/error/export, task, completion, etc.) when `-p`/`--print` is in argv (and no `cc://` URL), saving ~65 ms.

---

## 2. Migration runner

`runMigrations()` (`main.tsx:326–352`) is sync, fired by the `preAction` hook (`main.tsx:950`), and gated by:

```
if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) { ... }
```

`CURRENT_MIGRATION_VERSION = 11` (`main.tsx:325`). The body invokes nine sync migrations on a cold cache:

1. `migrateAutoUpdatesToSettings()`
2. `migrateBypassPermissionsAcceptedToSettings()`
3. `migrateEnableAllProjectMcpServersToSettings()`
4. `resetProToOpusDefault()`
5. `migrateSonnet1mToSonnet45()`
6. `migrateLegacyOpusToCurrent()`
7. `migrateSonnet45ToSonnet46()`
8. `migrateOpusToOpus1m()`
9. `migrateReplBridgeEnabledToRemoteControlAtStartup()`

Conditionally:

- `feature('TRANSCRIPT_CLASSIFIER')` → `resetAutoModeOptInForDefaultOffer()`
- `"external" === 'ant'` → `migrateFennecToOpus()`

Then it CAS-updates `migrationVersion` to `CURRENT_MIGRATION_VERSION` (`:343–346`) so the whole block becomes a no-op next boot. After that, `migrateChangelogFromConfig()` is fire-and-forgotten (`:349–351`) — async migration that retries every boot until it lands.

Every model-string migration name confirms the rule: **never hardcode model IDs anywhere except a migration that bumps `CURRENT_MIGRATION_VERSION`**. This is exactly the pattern AGI Workforce committed to in `memory/rule-models-json.md`.

---

## 3. Commander subcommand tree (full enumeration)

The default action and 11 top-level subcommands plus dozens of nested ones live under `program`. Each one hides behind `feature(...)` gates that DCE in external builds.

### 3.1 Default command — `claude [prompt]` (the chat REPL)

Defined `main.tsx:968–3808`. Argument: `[prompt]` (string). Flags listed in §4 below. Action handler (`:1006–3807`) is described in §5.

### 3.2 `claude mcp ...` — MCP server management

Subcommands at `main.tsx:3892–3958`:

- `mcp serve` (`:3895–3909`) — starts the stdio MCP server defined in `entrypoints/mcp.ts`.
- `mcp add ...` — registered via `registerMcpAddCommand(mcp)` (`:3912`).
- `mcp xaa-idp ...` — registered via `registerMcpXaaIdpCommand(mcp)` if `isXaaEnabled()` (`:3913–3914`).
- `mcp remove <name>`, `mcp list`, `mcp get <name>`, `mcp add-json <name> <json>`, `mcp add-from-claude-desktop`, `mcp reset-project-choices`.

### 3.3 `claude server` — direct-connect HTTP/UDS server (`feature('DIRECT_CONNECT')`)

`main.tsx:3962–4044`. Flags: `--port`, `--host`, `--auth-token`, `--unix`, `--workspace`, `--idle-timeout`, `--max-sessions`. Calls into `server/server.js`, `server/sessionManager.js`, `server/backends/dangerousBackend.js`. Auto-generates an `sk-ant-cc-...` bearer token if `--auth-token` is omitted.

### 3.4 `claude ssh <host> [dir]` — SSH-backed REPL (`feature('SSH_REMOTE')`)

`main.tsx:4046–4057`. The action body is a stub: real argv-shaping happens at `main.tsx:706–795` (so the _default_ action runs the REPL connected to `_pendingSSH`).

### 3.5 `claude open <cc-url>` — internal headless connect

`main.tsx:4059–4096`. Flags: `-p, --print [prompt]`, `--output-format text|json|stream-json`. Calls `runConnectHeadless(...)`.

### 3.6 `claude auth ...`

`main.tsx:4098–4136`:

- `auth login` (`:4101–4121`) — flags `--email`, `--sso`, `--console`, `--claudeai`. See §6.
- `auth status` (`:4122–4130`) — `--json` (default) / `--text`.
- `auth logout` (`:4131–4135`).

### 3.7 `claude plugin ...` (alias `claude plugins ...`)

`main.tsx:4148–4263`. All commands accept `--cowork` (hidden). Subtree:

- `plugin validate <path>`
- `plugin list` (`--json`, `--available`)
- `plugin marketplace add <source>` (`--sparse <paths...>`, `--scope`)
- `plugin marketplace list` (`--json`)
- `plugin marketplace remove <name>` (alias `rm`)
- `plugin marketplace update [name]`
- `plugin install <plugin>` (alias `i`) (`-s, --scope user|project|local`)
- `plugin uninstall <plugin>` (aliases `remove`, `rm`) (`--keep-data`)
- `plugin enable <plugin>`
- `plugin disable [plugin]` (`-a, --all`)
- `plugin update <plugin>`

### 3.8 Other top-level commands

- `claude setup-token` (`:4267–4275`) — sets up long-lived CC token under a Claude subscription.
- `claude agents` (`:4278–4288`) — lists configured agents (`--setting-sources`).
- `claude auto-mode defaults|config|critique` (`:4289–4321`).
- `claude remote-control` (alias `rc`) (`:4323–4334`, gated `BRIDGE_MODE`) — auth dispatcher; the heavy path lives in `entrypoints/cli.tsx:112–162`.
- `claude assistant [sessionId]` (`:4335–4344`, gated `KAIROS`) — stub; real path is the default-command branch driven by `_pendingAssistantChat`.
- `claude doctor` (`:4346–4356`).
- `claude update` (alias `upgrade`) (`:4362–4369`).
- `claude up` (`:4371–4380`, ant-only).
- `claude rollback [target]` (`:4382–4393`, ant-only) — `-l`, `--dry-run`, `--safe`.
- `claude install [target]` (`:4395–4410`) — `--force`.
- `claude log [number|sessionId]` / `claude error [number]` / `claude export <source> <outputFile>` (`:4411–4439`, ant-only).
- `claude task create|list|get|update|dir` (`:4440–4490`, ant-only).
- `claude completion <shell>` (`:4492–4501`) — `--output <file>`.

### 3.9 `preAction` hook — single shared bootstrap

`main.tsx:907–967`. For _every_ command (including subcommands), the hook:

1. Awaits `ensureMdmSettingsLoaded()` and `ensureKeychainPrefetchCompleted()` (the subprocess fan-out from §1.1).
2. Awaits `init()` from `entrypoints/init.ts:57–238` — see §7.
3. Sets `process.title = 'claude'` (terminal tab title; honored by Windows console title and POSIX shell-integrated terminals) unless `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` is truthy.
4. Re-attaches `initSinks()` defensively because subcommands like `doctor`, `mcp serve`, `plugin list` would otherwise drop queued events on early `process.exit()`.
5. Wires `--plugin-dir` from the _top-level_ program option to `setInlinePlugins(...)` (see comment `:937–949` for the bug that motivated the fix — gh-33508).
6. Calls `runMigrations()` (§2).
7. Fires `loadRemoteManagedSettings()` and `loadPolicyLimits()` non-blockingly (managed-Enterprise customers).
8. Optionally kicks `uploadUserSettingsInBackground()` (`feature('UPLOAD_USER_SETTINGS')`).

---

## 4. Default-command flag inventory (cited per flag)

The default command's `.option(...) / .addOption(...)` chain is one giant pipeline (`main.tsx:968–1006`). Below is the full list with file:line where it lands inside the action handler.

| Flag                                                                                                                                           | Type                                    | Defined at                                  | Lands in action at                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| `-d, --debug [filter]`                                                                                                                         | bool/string                             | `:971–976`                                  | `:1090–1107` (extracted)                   |
| `-d2e, --debug-to-stderr`                                                                                                                      | bool (hidden)                           | `:976`                                      | `:1091`                                    |
| `--debug-file <path>`                                                                                                                          | bool                                    | `:976`                                      | – (read by `debug.ts`)                     |
| `--verbose`                                                                                                                                    | bool                                    | `:976`                                      | `:1127`                                    |
| `-p, --print`                                                                                                                                  | bool                                    | `:976`                                      | `:803, 1128, 1949`                         |
| `--bare`                                                                                                                                       | bool (sets `CLAUDE_CODE_SIMPLE=1`)      | `:976` (also `entrypoints/cli.tsx:283–285`) | `:1012–1016`                               |
| `--init`                                                                                                                                       | hidden                                  | `:976`                                      | `:1129`                                    |
| `--init-only`                                                                                                                                  | hidden                                  | `:976`                                      | `:801, 1130`                               |
| `--maintenance`                                                                                                                                | hidden                                  | `:976`                                      | `:1131`                                    |
| `--output-format <text\|json\|stream-json>`                                                                                                    | enum                                    | `:976`                                      | `:1125`                                    |
| `--json-schema <schema>`                                                                                                                       | string                                  | `:976`                                      | `:1879–1900`                               |
| `--include-hook-events`                                                                                                                        | bool                                    | `:976`                                      | `:1105, 1231`                              |
| `--include-partial-messages`                                                                                                                   | bool                                    | `:976`                                      | `:1106, 1226`                              |
| `--input-format <text\|stream-json>`                                                                                                           | enum                                    | `:976`                                      | `:1126, 1818–1844`                         |
| `--mcp-debug`                                                                                                                                  | deprecated alias for `--debug`          | `:976`                                      | –                                          |
| `--dangerously-skip-permissions`                                                                                                               | bool                                    | `:976`                                      | `:1093, 1389–1395`                         |
| `--allow-dangerously-skip-permissions`                                                                                                         | bool                                    | `:976`                                      | `:1094, 1747`                              |
| `--thinking <enabled\|adaptive\|disabled>`                                                                                                     | enum (hidden)                           | `:976`                                      | `:2462–2472`                               |
| `--max-thinking-tokens <n>`                                                                                                                    | deprecated, hidden                      | `:976`                                      | `:2473–2487`                               |
| `--max-turns <n>`                                                                                                                              | int (hidden)                            | `:976`                                      | `:2838`                                    |
| `--max-budget-usd <n>`                                                                                                                         | float                                   | `:976–981`                                  | `:2839`                                    |
| `--task-budget <tokens>`                                                                                                                       | int (hidden)                            | `:982–988`                                  | `:2840–2843`                               |
| `--replay-user-messages`                                                                                                                       | bool                                    | `:988`                                      | `:1839, 1944`                              |
| `--enable-auth-status`                                                                                                                         | bool (hidden)                           | `:988`                                      | `:2854`                                    |
| `--allowed-tools <tools...>` (also `--allowedTools`)                                                                                           | string[]                                | `:988`                                      | `:1096, 1748`                              |
| `--tools <tools...>`                                                                                                                           | string[]                                | `:988`                                      | `:1095, 1750`                              |
| `--disallowed-tools <tools...>` (also `--disallowedTools`)                                                                                     | string[]                                | `:988`                                      | `:1097, 1749`                              |
| `--mcp-config <configs...>`                                                                                                                    | string[]                                | `:988`                                      | `:1098, 1413–1523`                         |
| `--permission-prompt-tool <tool>`                                                                                                              | string (hidden)                         | `:988`                                      | `:2835`                                    |
| `--system-prompt <prompt>`                                                                                                                     | string                                  | `:988`                                      | `:1343–1361`                               |
| `--system-prompt-file <file>`                                                                                                                  | string (hidden)                         | `:988`                                      | `:1344–1361`                               |
| `--append-system-prompt <prompt>`                                                                                                              | string                                  | `:988`                                      | `:1364–1382`                               |
| `--append-system-prompt-file <file>`                                                                                                           | string (hidden)                         | `:988`                                      | `:1365–1382`                               |
| `--permission-mode <mode>`                                                                                                                     | enum (`PERMISSION_MODES`)               | `:988`                                      | `:1099, 1389–1411`                         |
| `-c, --continue`                                                                                                                               | bool                                    | `:988`                                      | `:2830, 3101–3155`                         |
| `-r, --resume [value]`                                                                                                                         | string\|bool                            | `:988`                                      | `:2831, 3355–3705`                         |
| `--fork-session`                                                                                                                               | bool                                    | `:988`                                      | `:1281, 2851, 3120`                        |
| `--prefill <text>`                                                                                                                             | string (hidden)                         | `:988`                                      | `:1108–1110`                               |
| `--deep-link-origin`                                                                                                                           | bool (hidden)                           | `:988`                                      | `:3782–3792`                               |
| `--deep-link-repo <slug>`                                                                                                                      | string (hidden)                         | `:988`                                      | `:3791`                                    |
| `--deep-link-last-fetch <ms>`                                                                                                                  | int (hidden)                            | `:988–991`                                  | `:3791`                                    |
| `--from-pr [value]`                                                                                                                            | string\|bool                            | `:991`                                      | `:3370–3381`                               |
| `--no-session-persistence`                                                                                                                     | bool                                    | `:991`                                      | `:1855–1859`                               |
| `--resume-session-at <message id>`                                                                                                             | string (hidden)                         | `:991`                                      | `:2852`                                    |
| `--rewind-files <user-message-id>`                                                                                                             | string (hidden)                         | `:991`                                      | `:2853`                                    |
| `--model <model>`                                                                                                                              | string                                  | `:993`                                      | `:2012, 2019`                              |
| `--effort <low\|medium\|high\|max>`                                                                                                            | enum                                    | `:993–1000`                                 | `:3024`                                    |
| `--agent <agent>`                                                                                                                              | string                                  | `:1000`                                     | `:1115, 2055`                              |
| `--betas <betas...>`                                                                                                                           | string[]                                | `:1000`                                     | `:1102, getSdkBetas()`                     |
| `--fallback-model <model>`                                                                                                                     | string                                  | `:1000`                                     | `:1101, 1336–1340, 2020`                   |
| `--workload <tag>`                                                                                                                             | string (hidden)                         | `:1000`                                     | `:2856`                                    |
| `--settings <file-or-json>`                                                                                                                    | string                                  | `:1000`                                     | `:505, eagerLoadSettings()`                |
| `--add-dir <directories...>`                                                                                                                   | string[]                                | `:1000`                                     | `:1100, 1633, 1753`                        |
| `--ide`                                                                                                                                        | bool                                    | `:1000`                                     | `:1103, 3076`                              |
| `--strict-mcp-config`                                                                                                                          | bool                                    | `:1000`                                     | `:1580–1595, 1809`                         |
| `--session-id <uuid>`                                                                                                                          | string                                  | `:1000`                                     | `:1104, 1276–1302`                         |
| `-n, --name <name>`                                                                                                                            | string                                  | `:1000`                                     | `:1996–1998`                               |
| `--agents <json>`                                                                                                                              | string                                  | `:1000`                                     | `:1114, 2033–2052`                         |
| `--setting-sources <sources>`                                                                                                                  | string                                  | `:1000`                                     | `:511–514`                                 |
| `--plugin-dir <path>`                                                                                                                          | string[] (collected)                    | `:1006`                                     | `preAction:945–949`                        |
| `--disable-slash-commands`                                                                                                                     | bool                                    | `:1006`                                     | `:1134, 3078`                              |
| `--chrome` / `--no-chrome`                                                                                                                     | bool                                    | `:1006`                                     | `:1525–1577, 1530 (setChromeFlagOverride)` |
| `--file <specs...>`                                                                                                                            | string[]                                | `:1006`                                     | `:1304–1331, 3707–3718`                    |
| `-w, --worktree [name]`                                                                                                                        | string\|bool                            | `:3811`                                     | `:1146–1162, 1927`                         |
| `--tmux`                                                                                                                                       | bool                                    | `:3812`                                     | `:1164–1182`                               |
| `--advisor <model>`                                                                                                                            | string (hidden, gated)                  | `:3814`                                     | `:2117–2138`                               |
| `--enable-auto-mode`                                                                                                                           | hidden, gated `TRANSCRIPT_CLASSIFIER`   | `:3830`                                     | `:1407–1411`                               |
| `--proactive`                                                                                                                                  | bool, gated `PROACTIVE\|KAIROS`         | `:3833`                                     | `:1867, 2197–2205`                         |
| `--messaging-socket-path <path>`                                                                                                               | string, gated `UDS_INBOX`               | `:3836`                                     | `:1910–1912`                               |
| `--brief`                                                                                                                                      | bool, gated `KAIROS\|KAIROS_BRIEF`      | `:3839`                                     | `:1080, 4622–4651`                         |
| `--assistant`                                                                                                                                  | hidden, gated `KAIROS`                  | `:3842`                                     | `:1050–1057, 1086`                         |
| `--channels <servers...>`                                                                                                                      | hidden, gated `KAIROS\|KAIROS_CHANNELS` | `:3845`                                     | `:1641–1719`                               |
| `--dangerously-load-development-channels <servers...>`                                                                                         | hidden                                  | `:3846`                                     | `:1697–1701`                               |
| `--agent-id`, `--agent-name`, `--team-name`, `--agent-color`, `--plan-mode-required`, `--parent-session-id`, `--teammate-mode`, `--agent-type` | hidden                                  | `:3851–3858`                                | `:1187–1218, 4667–4682`                    |
| `--sdk-url <url>`                                                                                                                              | hidden                                  | `:3861`                                     | `:1221–1252, 1830`                         |
| `--teleport [session]`                                                                                                                         | hidden                                  | `:3864`                                     | `:1255, 3355`                              |
| `--remote [description]`                                                                                                                       | hidden                                  | `:3865`                                     | `:1259–1263, 3355`                         |
| `--remote-control [name]` / `--rc [name]`                                                                                                      | hidden, gated `BRIDGE_MODE`             | `:3867–3868`                                | `:1265–1274, 2246–2255`                    |
| `--hard-fail`                                                                                                                                  | hidden, gated `HARD_FAIL`               | `:3871`                                     | – (read inside `logError`)                 |

**Plan-mode handling.** Reference does not surface a `--plan-mode` flag; plan mode is selected via `--permission-mode plan` (member of `PERMISSION_MODES` set imported from `utils/permissions/PermissionMode.js`, line `:120`) or the slash command `/plan`. Mid-session plan-mode entry/exit is tracked on `bootstrap/state.ts` via `hasExitedPlanMode` and `needsPlanModeExitAttachment` fields (`bootstrap/state.ts:156–159`).

---

## 5. Default-action handler walkthrough (lines 1006–3807)

Phases of the action handler in execution order:

1. **`--bare` switch** sets `CLAUDE_CODE_SIMPLE=1` (`:1012–1016`). Note this is _also_ set in `entrypoints/cli.tsx:283–285` to fire at module-eval time before commander construction; the default-action site is the second-pass insurance.
2. **"code" prompt suppression** (`:1019–1024`) — `claude code` is treated as `claude` with no prompt + a yellow tip.
3. **Single-word telemetry** (`:1027–1031`).
4. **Kairos / assistant-mode bootstrap** (`:1048–1089`) — refuses to activate if trust is not yet accepted; pre-seeds an in-process team via `assistantModule.initializeAssistantTeam()`.
5. **Options destructure** (`:1090–1107`).
6. **`--prefill` early-input seed** (`:1108–1110`) — calls `seedEarlyInput(options.prefill)` so the prompt input renders pre-populated.
7. **File-download promise prep** (`:1112–1113`).
8. **Worktree resolution** (`:1147–1182`) — extracts `--worktree`, `--tmux`, supports PR-reference parsing via `parsePRReference()`. Errors out early on non-Windows mismatches.
9. **Teammate identity options** (`:1187–1218`) — gates on `isAgentSwarmsEnabled()`, calls `setDynamicTeamContext(...)` and `setCliTeammateModeOverride(...)`.
10. **SDK URL + format auto-set** (`:1221–1252`) — `--sdk-url` implies `stream-json` in/out and `--print` and verbose unless overridden.
11. **`--teleport` and `--remote`** (`:1255–1263`) extracted.
12. **`--remote-control` / `--rc`** (`:1265–1274`) — entitlement is _not_ resolved yet; deferred to after `showSetupScreens` so trust + GrowthBook auth headers are present (`:2246–2255`).
13. **`--session-id` validation** (`:1276–1302`).
14. **`--file` resource downloads** (`:1304–1331`) — kicks `downloadSessionFiles(...)` early so it overlaps with the rest of startup; awaited at `:3707–3718` before REPL renders.
15. **Fallback-model self-equality check** (`:1336–1340`).
16. **System-prompt file loading** (`:1343–1361`).
17. **Append-system-prompt file loading** (`:1364–1382`).
18. **Permission-mode resolution** (`:1389–1411`) — `initialPermissionModeFromCLI(...)` returns `{mode, notification}` and may set `setSessionBypassPermissionsMode`.
19. **MCP-config parsing** (`:1413–1523`) — supports both JSON-string and file-path `--mcp-config` entries; rejects reserved server names (`claude_in_chrome`, `computer_use`); enforces enterprise allow/deny via `filterMcpServersByPolicy`.
20. **Claude-in-Chrome MCP setup** (`:1525–1577`) — explicit `--chrome`/`--no-chrome`, plus auto-enable.
21. **Computer-Use MCP setup** (`:1608–1630`) — `feature('CHICAGO_MCP') && macOS && interactive`.
22. **`--add-dir` directories** (`:1633`) propagated to `setAdditionalDirectoriesForClaudeMd(...)`.
23. **`--channels` parsing** (`:1641–1719`).
24. **SendUserMessage tool opt-in** (`:1728–1742`, gated `KAIROS|KAIROS_BRIEF`).
25. **`initializeToolPermissionContext(...)`** (`:1747–1771`) — produces `toolPermissionContext`, `warnings`, `dangerousPermissions`, `overlyBroadBashPermissions`.
26. **`assertMinVersion()`** fired non-blockingly (`:1778`).
27. **claude.ai MCP-config fetch promise** (`:1784–1797`) — interactive uses two-phase loading inside `useManageMCPConnections`; here it's only kicked for `-p`.
28. **MCP-config file load promise** (`:1803–1814`).
29. **Stream-json input/output validation** (`:1818–1859`).
30. **`getInputPrompt(...)`** (`:1861, defined :857–883`) — pulls non-TTY stdin, with a 3 s warning timeout.
31. **`maybeActivateProactive(options)`** (`:1867`) so SleepTool's `isEnabled()` lights up before `getTools(...)` reads it.
32. **`getTools(toolPermissionContext)`** (`:1868`) and SyntheticOutputTool wiring for `--json-schema` (`:1879–1900`).
33. **`setup()`** dynamically imported and awaited (`:1907–1934`) — see §8. Parallel with `getCommands(preSetupCwd)` and `getAgentDefinitionsWithOverrides(preSetupCwd)`. `initBuiltinPlugins()` and `initBundledSkills()` run inline before the parallel kick (`:1923–1926`) because they're in-memory and `getCommands()` was racing to a memoized empty list.
34. **For non-interactive mode:** `applyConfigEnvironmentVariables()` and prefetches of `getSystemContext()`, `getUserContext()`, and `ensureModelStringsInitialized()` (`:1952–1990`).
35. **`--name` cache-only** (`:1996–1998`).
36. **GrowthBook eager init for ant model aliases** (`:2012–2015`).
37. **Effective-model resolution** (`:2017–2024`).
38. **Commands + agents Promise.all join** (`:2029`).
39. **`--agents` JSON parse + merge** (`:2033–2052`).
40. **Agent setting → main-thread agent** (`:2055–2089`). `saveAgentSetting(mainThreadAgentDefinition.agentType)` persists it for resume display.
41. **`setMainLoopModelOverride(effectiveModel)` and `setInitialMainLoopModel(...)`** (`:2111–2114`).
42. **Advisor model parsing** (`:2117–2138`).
43. **Proactive / Brief activation prompts** (`:2197–2205`) appended to system prompt.
44. **Ink root creation + `showSetupScreens(...)`** (`:2218–2305`) — runs only in interactive mode. Logs `tengu_timer.event=startup`. Resolves `--remote-control` entitlement now that trust + GrowthBook are loaded. Validates `forceLoginOrgUUID` if set (`:2302–2305`).
45. **Early bail on graceful shutdown** (`:2312–2315`).
46. **`initializeLspServerManager()`** (`:2321`) — deferred until after trust to keep plugin-LSP code from running in untrusted dirs.
47. **Settings-validation dialog** for non-MCP errors (`:2325–2336`).
48. **Bootstrap-data prefetches** (`:2338–2375`) — quota, passes eligibility, fast-mode status, plus `fetchBootstrapData()`.
49. **MCP config resolve + dynamic merge** (`:2380–2402`) and SDK-vs-regular split.
50. **MCP prefetch promises** (`:2408–2430`) — interactive mode only; `-p` path connects per-server below.
51. **SessionStart hooks promise** (`:2437–2440`) — skipped on `initOnly|init|maintenance|isNonInteractiveSession|continue|resume` to avoid double-firing.
52. **`tengu_init` event** with full state (`:2496–2519`).
53. **Concurrent-session registration** (`:2530–2542`).
54. **Versioned plugins migration + GC** (`:2544–...`).
55. **Headless branch** (`:~2680–2861`) — `print` mode: pushes per-server MCP results into `headlessStore`, awaits all configs + `claudeai` (with 5 s timeout), then dynamically imports `cli/print.js#runHeadless` and dispatches.
56. **Interactive branch dispatch** (`:3092–3807`). Six sub-branches based on flags:
    1. **`options.continue`** (`:3101–3155`) — clears session caches, loads via `loadConversationForResume(undefined, undefined)`, processes via `processResumedConversation`, calls `launchRepl`.
    2. **`feature('DIRECT_CONNECT') && _pendingConnect.url`** (`:3156–3192`) — calls `createDirectConnectSession(...)`, then `launchRepl` with a `Connected to server at ...` system message.
    3. **`feature('SSH_REMOTE') && _pendingSSH.host`** (`:3193–3258`) — `createSSHSession(...)` (or `createLocalSSHSession` for `--local`), shows progress, then `launchRepl` with an SSH info message.
    4. **`feature('KAIROS') && _pendingAssistantChat`** (`:3259–3354`) — discovers sessions or uses provided sessionId, builds `RemoteSessionConfig`, `launchRepl` in viewer mode.
    5. **`options.resume || options.fromPr || teleport || remote !== null`** (`:3355–3705`) — resume picker / direct UUID / from-PR / teleport / remote.
    6. **Default fresh REPL** (`:3760–3807`) — passes `pendingHookMessages` so the REPL can render before `SessionStart` hooks finish; logs deep-link banners; calls `launchRepl(root, {...}, sessionConfig, renderAndRun)`.

The handler closes with `.version(\`${MACRO.VERSION} (Claude Code)\`, '-v, --version', 'Output the version number')` (`:3808`) — the *only* place the version banner is wired into commander. The version banner shown in the REPL header is rendered by Ink components reading `MACRO.VERSION` directly.

---

## 6. Login routing — `claudeai` vs `console` and `forceLoginMethod`

`auth login` (commander) → `cli/handlers/auth.ts:authLogin(...)`. The decision tree at `auth.ts:123–136`:

```
if (--console && --claudeai) -> error
const loginWithClaudeAi = settings.forceLoginMethod
  ? settings.forceLoginMethod === 'claudeai'
  : !useConsole
const orgUUID = settings.forceLoginOrgUUID
```

So:

- **Without** `forceLoginMethod` set: `--console` selects Console; default (no flag) and `--claudeai` select claude.ai (subscription).
- **With** `forceLoginMethod`: enterprise hard-coded to either `claudeai` or `console`. The CLI flags become advisory.
- `forceLoginOrgUUID` post-login validation runs at `main.tsx:2302–2305` via `validateForceLoginOrg()` — kicks the user out if their token's org doesn't match.

There's also a fast-path for `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` + `CLAUDE_CODE_OAUTH_SCOPES` (`auth.ts:140–169`) that skips the browser OAuth dance entirely.

---

## 7. `entrypoints/init.ts` — pre-trust environment build-out

`init()` is memoized (`init.ts:57`) so subcommand `preAction` hooks plus the default-action handler can each call it. It does, in order:

1. **`enableConfigs()`** (`:65`) — switches the config system on and validates JSON.
2. **`applySafeConfigEnvironmentVariables()`** (`:74`) — applies only env vars known to be safe pre-trust (no `LD_PRELOAD`, no `PATH`, no `GIT_DIR`).
3. **`applyExtraCACertsFromConfig()`** (`:79`) — applies `NODE_EXTRA_CA_CERTS` from settings before the first TLS handshake (Bun caches the trust store at boot).
4. **`setupGracefulShutdown()`** (`:87`).
5. **1P event logging** (`:94–106`) — dynamically imports `analytics/firstPartyEventLogger.js` and `growthbook.js` to defer ~400 KB of OpenTelemetry. Reinitializes the logger provider when GrowthBook config changes.
6. **`populateOAuthAccountInfoIfNeeded()`** (`:110`) — only relevant when login happened via the VS Code extension.
7. **`initJetBrainsDetection()`** + **`detectCurrentRepository()`** (`:114, :118`).
8. **Remote managed settings + policy limits loading promises** (`:123–128`) — initialized early so callers can `await` them in plugin hooks.
9. **`recordFirstStartTime()`** (`:132`).
10. **`configureGlobalMTLS()`** (`:137`) and **`configureGlobalAgents()`** (`:146`) for proxy / mTLS / Bedrock / Vertex.
11. **`preconnectAnthropicApi()`** (`:159`) — TCP+TLS handshake is overlapped with the next ~100 ms of work.
12. **CCR upstream-proxy init** (`:167–183`) — gated on `CLAUDE_CODE_REMOTE`.
13. **`setShellIfWindows()`** (`:186`) — locks shell to `cmd.exe` for git-bash compatibility.
14. **`registerCleanup(shutdownLspServerManager)`** + team cleanup (`:189, 195–200`).
15. **`ensureScratchpadDir()`** (`:203–208`) if scratchpad is enabled.

Errors fall into the `ConfigParseError` branch (`:216–232`) which dynamically imports `components/InvalidConfigDialog.js` to show an Ink-based error dialog (or `process.stderr` + `gracefulShutdownSync(1)` if non-interactive).

`initializeTelemetryAfterTrust()` (`:247–286`) is the post-trust entry point; it awaits remote managed settings (with timeout) before re-applying env vars and initializing the OTLP meter.

---

## 8. `setup.ts` — post-trust per-session bootstrap

`setup(cwd, permissionMode, allowDangerouslySkipPermissions, worktreeEnabled, worktreeName, tmuxEnabled, customSessionId?, worktreePRNumber?, messagingSocketPath?)` (`setup.ts:56–477`) runs _after_ the `preAction` hook + `init()` and shoulders the heavy lifting:

1. **Node 18+ guard** (`:69–79`).
2. **`switchSession(asSessionId(customSessionId))`** if `--session-id` (`:82–84`).
3. **UDS messaging server** for swarm (`:89–101`, gated `feature('UDS_INBOX')`, skipped under `--bare` unless `--messaging-socket-path` was passed).
4. **Teammate-mode snapshot** (`:104–110`) for `isAgentSwarmsEnabled()`.
5. **iTerm2/Terminal.app backup restoration** (`:115–157`) — only in interactive mode.
6. **`setCwd(cwd)`** (`:161`) before _any_ code that reads cwd.
7. **`captureHooksConfigSnapshot()`** + `initializeFileChangedWatcher(cwd)` (`:166, 172`).
8. **Worktree creation** (`:176–285`) — refuses non-git without a `WorktreeCreate` hook; resolves to canonical git root; generates tmux session name; calls `createWorktreeForSession(...)` → `createTmuxSessionForWorktree(...)`; `process.chdir(worktreeSession.worktreePath)`; refreshes hooks snapshot.
9. **Critical pre-render registrations** (`:293–304`) — `initSessionMemory()`, `initContextCollapse()` (gated `feature('CONTEXT_COLLAPSE')`), `lockCurrentVersion()`.
10. **Plugin/skill prefetches** (`:306–331`) — `getCommands(getProjectRoot())`, `loadPluginHooks()` + `setupPluginHookHotReload()`. Skipped under `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` and `--bare`.
11. **Ant-only background work** (`:336–369`): commit-attribution prime; attribution hooks register; session-file-access hooks; team-memory watcher.
12. **`initSinks()`** (`:371`) and **`logEvent('tengu_started', {})`** (`:378`) — earliest reliable "process started" beacon, _before_ any IO that could throw.
13. **`prefetchApiKeyFromApiKeyHelperIfSafe(...)`** (`:380`) — only fires if trust already confirmed.
14. **Logo v2 release notes prefetch** (`:386–393`) — sync, awaited only for interactive.
15. **Sandbox bypass guards** (`:396–442`) — refuses `bypassPermissions` mode if running as root non-sandboxed; for ants, requires Docker/bubblewrap/IS_SANDBOX with no internet (with explicit exemptions for `CLAUDE_CODE_ENTRYPOINT === 'local-agent' || 'claude-desktop'`).
16. **`tengu_exit` last-session beacon** (`:449–476`) — logs cost/duration/lines/tokens/FPS metrics from the _previous_ session's `lastCost` field on the project config, without clearing them (resume needs them).

---

## 9. `context.ts` (root) — system + user prompt context

189 LOC. Two memoized async getters:

- **`getSystemContext()`** (`:116–150`) returns `{gitStatus?, cacheBreaker?}`.
- **`getUserContext()`** (`:155–189`) returns `{claudeMd?, currentDate}`.

Both are memoized with `lodash-es/memoize`. The `cacheBreaker` field is ant-only ephemeral: `getSystemPromptInjection()`/`setSystemPromptInjection()` (`:23–34`) clear both caches when set. `--bare` skips CLAUDE.md auto-discovery unless `--add-dir` was passed (per the comment at `:163–168`).

`getGitStatus()` (`:36–111`) — memoized; runs `git status --short` (truncated to 2000 chars), `git log --oneline -n 5`, `git config user.name`. Skipped under `CLAUDE_CODE_REMOTE` or when `shouldIncludeGitInstructions()` returns false.

---

## 10. `context/` (subdir) — React contexts

Nine providers, each a thin `createContext + Provider + use*` shape. Tree wrapping is established by `interactiveHelpers.tsx#renderAndRun` (not in this M6 scope); the providers themselves are independent.

| File                                  | Purpose                                                                                                                                                | Key context                                                      | Hook                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `fpsMetrics.tsx` (88 LOC)             | FPS metrics getter for status bar                                                                                                                      | `FpsMetricsContext`                                              | `useFpsMetrics()`                                                                                                |
| `mailbox.tsx` (~100 LOC)              | Inter-agent message queue                                                                                                                              | `MailboxContext`                                                 | `useMailbox()`                                                                                                   |
| `modalContext.tsx` (~190 LOC)         | Modal slot dimensions + scrollRef                                                                                                                      | `ModalContext`                                                   | `useIsInsideModal()`, `useModalOrTerminalSize()`, `useModalScrollRef()`                                          |
| `notifications.tsx` (~700 LOC)        | Toast queue with priorities (`low`, `medium`, `high`, `immediate`) and `fold(accumulator, incoming)` merging; default 8000 ms timeout                  | n/a (uses `AppStateStore`)                                       | `useNotifications()`                                                                                             |
| `overlayContext.tsx` (~440 LOC)       | Tracks active overlays so `Esc` doesn't cancel queries while a `Select` is open                                                                        | n/a (uses `AppStateStore.activeOverlays`)                        | `useRegisterOverlay(id, enabled)`, `useIsOverlayActive()`                                                        |
| `promptOverlayContext.tsx` (~330 LOC) | Floats slash-command suggestion data + arbitrary `ReactNode` dialogs above the prompt without being clipped by `FullscreenLayout`'s `overflowY:hidden` | `DataContext`, `SetContext`, `DialogContext`, `SetDialogContext` | `usePromptOverlay()`, `usePromptOverlayDialog()`, `useSetPromptOverlay(data)`, `useSetPromptOverlayDialog(node)` |
| `QueuedMessageContext.tsx` (~90 LOC)  | Marks a message subtree as queued (PaddingX=2, isFirst flag)                                                                                           | `QueuedMessageContext`                                           | `useQueuedMessage()`                                                                                             |
| `stats.tsx` (~640 LOC)                | Per-session stats store with reservoir-sampled histograms (size 1024) and percentile computation                                                       | `StatsContext`                                                   | `useStats()`                                                                                                     |
| `voice.tsx` (~265 LOC)                | External-store voice mode (`idle`/`recording`/`processing`, audio levels, error string, warming-up flag)                                               | `VoiceContext`                                                   | `useVoiceState(selector)`, `useSetVoiceState()`, `useVoiceStore()`                                               |

Contexts are intentionally split for re-render isolation: `promptOverlayContext` exposes data + setter contexts separately so writers never re-render on their own writes (`promptOverlayContext.tsx:21–22`); same for `voice.tsx` which uses `useSyncExternalStore` for fine-grained selector subscriptions.

---

## 11. `bootstrap/state.ts` — global mutable singleton

56 KB. The shape is one giant `State` interface (`bootstrap/state.ts:45–...`) with ~80 fields; representative subsets:

- **Session identity:** `sessionId`, `parentSessionId`, `originalCwd`, `projectRoot` (stable, set once at startup; _not_ updated by `EnterWorktreeTool`), `cwd`, `clientType`, `sessionSource`.
- **Telemetry:** `meter`, `sessionCounter`, `locCounter`, `prCounter`, `commitCounter`, `costCounter`, `tokenCounter`, `codeEditToolDecisionCounter`, `activeTimeCounter`, `loggerProvider`, `eventLogger`, `meterProvider`, `tracerProvider`.
- **Cost/usage rollups:** `totalCostUSD`, `totalAPIDuration`, `totalAPIDurationWithoutRetries`, `totalToolDuration`, `turnHookDurationMs`, `turnToolDurationMs`, `turnClassifierDurationMs`, `turnToolCount`, `turnHookCount`, `turnClassifierCount`, `totalLinesAdded`, `totalLinesRemoved`, `modelUsage`, `hasUnknownModelCost`.
- **Models:** `mainLoopModelOverride`, `initialMainLoopModel`, `modelStrings`.
- **Modes:** `isInteractive`, `kairosActive`, `strictToolResultPairing`, `userMsgOptIn`, `sdkAgentProgressSummariesEnabled`.
- **Settings access:** `flagSettingsPath`, `flagSettingsInline`, `allowedSettingSources`.
- **Auth from FDs:** `sessionIngressToken`, `oauthTokenFromFd`, `apiKeyFromFd`.
- **Plugins/chrome/cowork:** `inlinePlugins`, `chromeFlagOverride`, `useCoworkPlugins`.
- **Plan-mode + auto-mode tracking:** `hasExitedPlanMode`, `needsPlanModeExitAttachment`, `needsAutoModeExitAttachment`, `lspRecommendationShownThisSession`.
- **Hooks:** `registeredHooks` (SDK callbacks + plugin native hooks).
- **CLAUDE.md cache:** `cachedClaudeMdContent` (broken cycle: yoloClassifier → claudemd → filesystem → permissions).
- **Teleport reliability:** `teleportedSessionInfo`.
- **Skills preservation across compaction:** `invokedSkills` (Map keyed by `${agentId ?? ''}:${skillName}`).
- **Sessions registry:** `sessionCreatedTeams`, `sessionTrustAccepted`, `sessionPersistenceDisabled`, `sessionBypassPermissionsMode`, `scheduledTasksEnabled`, `sessionCronTasks`.
- **Speculative state:** `speculation`, `speculationSessionTimeSavedMs`.
- **SDK init cache:** `initJsonSchema` (for structured output replay).

Setters are exported as named functions (`switchSession`, `setOriginalCwd`, `setProjectRoot`, `setSessionPersistenceDisabled`, `setMainLoopModelOverride`, `setInitialMainLoopModel`, `setKairosActive`, `setUserMsgOptIn`, `setMainThreadAgentType`, `setIsRemoteMode`, `setDirectConnectServerUrl`, `setClientType`, `setSessionBypassPermissionsMode`, `setQuestionPreviewFormat`, `setSessionSource`, `setAllowedSettingSources`, `setFlagSettingsPath`, `setInlinePlugins`, `setChromeFlagOverride`, `setSdkBetas`, `setAllowedChannels`, `setCwdState`, `setAdditionalDirectoriesForClaudeMd`, etc.). The module is a leaf of the import DAG (only re-exports and primitives), so `resetStateForTests()` can reset everything between tests without risking circular imports.

---

## 12. `entrypoints/` — entry shapes

| File                    | LOC  | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.tsx`               | 302  | Bootstrap entry: fast-path for `--version`, `--dump-system-prompt`, `--claude-in-chrome-mcp`, `--chrome-native-host`, `--computer-use-mcp`, `--daemon-worker`, `daemon`, `remote-control`/`rc`/`remote`/`sync`/`bridge`, `ps`/`logs`/`attach`/`kill`/`--bg`/`--background`, `new`/`list`/`reply` (templates), `environment-runner`, `self-hosted-runner`, `--worktree` + `--tmux`, `--update`/`--upgrade` redirect, `--bare` env flip. Otherwise dynamically imports `../main.js#main` and runs it. |
| `init.ts`               | 340  | The pre-trust `init()` covered in §7 plus `initializeTelemetryAfterTrust()` and `setMeterState()`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `mcp.ts`                | 196  | Minimal stdio MCP server: name `claude/tengu`, version `MACRO.VERSION`, exposes `getTools(...)` translated through `zodToJsonSchema(...)`, dispatches `CallToolRequestSchema` against `findToolByName`. Validates with zod, calls `tool.call(...)`, returns `CallToolResult`. Error path returns `isError: true` with concatenated `getErrorParts(error)`. Used by `claude mcp serve`.                                                                                                              |
| `sandboxTypes.ts`       | 156  | Zod-schema definitions for Sandbox (network, filesystem, ignore-violations, autoAllowBashIfSandboxed, ripgrep config). Single source of truth for both SDK and settings validation. Note: `enabledPlatforms` is undocumented and read via `.passthrough()`.                                                                                                                                                                                                                                         |
| `agentSdkTypes.ts`      | 443  | Aggregator: re-exports from `sdk/coreTypes`, `sdk/runtimeTypes`, `sdk/settingsTypes.generated`, `sdk/toolTypes`, `sdk/controlTypes`. Public SDK surface. Defines `tool(...)`, `createSdkMcpServer(...)`, etc. (all stubs that throw "not implemented" — actual SDK is a separate package).                                                                                                                                                                                                          |
| `sdk/coreTypes.ts`      | 62   | Common serializable SDK types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sdk/coreSchemas.ts`    | 1889 | Zod schemas for every SDK message/event the harness consumes.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `sdk/controlSchemas.ts` | 663  | Control-plane schemas (`SDKControlRequest`, `SDKControlResponse`) for the bridge subpath.                                                                                                                                                                                                                                                                                                                                                                                                           |

The shapes available via `entrypoints/`:

1. **REPL** — `claude` (no flag) → default action → interactive Ink TUI.
2. **Headless `-p`/`--print`** — same default action, branches to `runHeadless` from `cli/print.js`.
3. **SDK-CLI** — `--sdk-url` → forces stream-json + `--print`, dispatches `runHeadless` with WebSocket transport.
4. **MCP server** — `claude mcp serve` → `entrypoints/mcp.ts#startMCPServer`.
5. **Direct-connect (cc:// URL)** — argv rewriter at `main.tsx:612–642` populates `_pendingConnect`, default action launches `createDirectConnectSession + launchRepl`. Headless variant rewrites to `claude open <url>`.
6. **SSH-remote** — `claude ssh <host> [dir]` → `_pendingSSH` populated → `createSSHSession + launchRepl`. `--local` exercises the proxy/auth plumbing without an actual remote host.
7. **Assistant viewer** — `claude assistant [sessionId]` → `_pendingAssistantChat` → `discoverAssistantSessions` → `createRemoteSessionConfig + launchRepl` in viewer mode.
8. **Daemon worker / supervisor** — `claude --daemon-worker=<kind>` (lean spawn) and `claude daemon [subcommand]` (long-running supervisor) live entirely in `cli.tsx:100–179`.

---

## 13. Version banner + update check

`MACRO.VERSION` is a build-time inlined macro (e.g. `2.1.133`). Surfaces:

- Fast-path `claude --version` → `entrypoints/cli.tsx:36–42` prints `${MACRO.VERSION} (Claude Code)`.
- Default-command `.version()` registration at `main.tsx:3808`.
- Inside `setup.ts`, `lockCurrentVersion()` (`:303`) prevents the binary's directory from being deleted by other sibling processes.
- `assertMinVersion()` (imported `main.tsx:103`, fired non-blockingly at `:1778`) — pulls the policy-managed minimum from remote settings and fails with an upgrade prompt if the local install is older.
- Update check + auto-update channel are surfaced via `claude doctor` (`main.tsx:4346`), `claude update`/`upgrade` (`main.tsx:4362`), and `claude install [target]` (`main.tsx:4395`). The Ink-based REPL header reads `MACRO.VERSION` directly for its banner.
- `migrateChangelogFromConfig()` (`main.tsx:349–351`) and `checkForReleaseNotes(globalConfig.lastReleaseNotesSeen)` in `setup.ts:387–393` drive the "What's new" banner that appears when a new version was just installed; `getRecentActivity()` (`setup.ts:391`) is awaited to ensure the Logo v2 has data before render.

---

## 14. Cross-references for AGI Workforce parity

- `apps/cli/src/main.rs` is 2375 LOC and uses `clap::Subcommand`. Its top-level structure (`#[command(...)]` at line 84, `Subcommand` enums starting at line 453) is small relative to the reference: ~10 subcommands vs. ~50+. Notable Rust handlers: `handle_session_action(action: SessionAction)` (`main.rs:733`), `run_oneshot(...)` (`main.rs:2166`), `resolve_oneshot_output_mode(...)` (`main.rs:419`), `build_final_prompt(...)` (`main.rs:2003`).
- `apps/cli/src/init.rs`, `apps/cli/src/onboarding.rs`, and `apps/cli/src/oauth.rs` are present but light compared to the reference's pre-trust `init.ts` + `setup.ts` + `interactiveHelpers#showSetupScreens` triad.

---

## 15. Inventory verification table

| Reference flag/handler                                 | Ref file:line                                               | apps/cli equivalent?                                       |
| ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `--continue`                                           | `main.tsx:988`, `:2830`, `:3101–3155`                       | partial — `SessionAction::Resume{ latest }` (main.rs ~696) |
| `--resume`                                             | `main.tsx:988`, `:3355–3705`                                | partial — `SessionAction::Resume{ reference }`             |
| `--print` (`-p`)                                       | `main.tsx:976`, `:800`                                      | yes — `--exec`/`-p` style oneshot                          |
| `--system-prompt`                                      | `main.tsx:988`                                              | partial — passes to LLM but no `--system-prompt-file`      |
| `--max-turns`                                          | `main.tsx:976`                                              | unknown — needs check                                      |
| `--allowed-tools`                                      | `main.tsx:988`, `:1748`                                     | unknown                                                    |
| `--permission-mode`                                    | `main.tsx:988`, `:1389–1411`                                | unknown — `permissions.rs` exists                          |
| `--dangerously-skip-permissions`                       | `main.tsx:976`, `:2253`                                     | unknown                                                    |
| `--add-dir`                                            | `main.tsx:1000`, `:1633`                                    | unknown                                                    |
| `--worktree`                                           | `main.tsx:3811`, `:1146–1182`                               | partial — `apps/cli` ships limited worktree commands       |
| `--plan-mode`                                          | n/a (uses `--permission-mode plan`)                         | `plan_mode.rs` exists                                      |
| `--enable-auto-mode`                                   | `main.tsx:3830`                                             | n/a                                                        |
| `--mcp-config`                                         | `main.tsx:988`, `:1413–1523`                                | partial — `mcp/` dir exists                                |
| `--ide`                                                | `main.tsx:1000`                                             | n/a                                                        |
| `--agents`                                             | `main.tsx:1000`, `:2033–2052`                               | partial — `agents.rs`                                      |
| `--plugin-dir`                                         | `main.tsx:1006`                                             | partial — `plugins.rs`                                     |
| `--plugin-url`                                         | n/a in this snapshot (added May 2026)                       | n/a                                                        |
| `forceLoginMethod` claudeai/console routing            | `cli/handlers/auth.ts:131–136`                              | n/a — single OAuth path in `oauth.rs`                      |
| Migration runner with `CURRENT_MIGRATION_VERSION` gate | `main.tsx:325–352`                                          | n/a — no migration system at boot                          |
| Deferred subcommand registration in print mode         | `main.tsx:3875–3890`                                        | n/a                                                        |
| Trust dialog + `validateForceLoginOrg()`               | `main.tsx:2218–2305`                                        | n/a — `onboarding.rs` is the only equivalent               |
| Pre-trust + post-trust split                           | `init.ts` vs `setup.ts` + `initializeTelemetryAfterTrust()` | n/a — single `init.rs`                                     |
| MDM + Keychain prefetch before imports                 | `main.tsx:13–20`                                            | n/a                                                        |
| UDS messaging socket                                   | `setup.ts:89–101` (gated `UDS_INBOX`)                       | n/a                                                        |
| Worktree creation pipeline                             | `setup.ts:176–285`                                          | partial                                                    |
| Concurrent-sessions registry                           | `main.tsx:2530–2542`                                        | n/a                                                        |

**Scope-relevant gaps for `apps/cli/src/main.rs`** are summarized in the 350-word return-message below.

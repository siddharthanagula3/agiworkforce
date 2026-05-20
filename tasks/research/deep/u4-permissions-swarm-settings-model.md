# U4 Deep Dive — `utils/permissions/`, `utils/swarm/`, `utils/settings/`, `utils/model/`

> **Scope:** All 24 files in `~/Desktop/reference/src/utils/permissions/`, all 22 files in `~/Desktop/reference/src/utils/swarm/` (including the 9-file `backends/` subtree), all 19 files in `~/Desktop/reference/src/utils/settings/` (including the 3-file `mdm/` subtree), and all 16 files in `~/Desktop/reference/src/utils/model/`. All citations are absolute `/Users/siddhartha/Desktop/reference/src/...:line`.

---

## A. `utils/permissions/` (24 files, ~5,400 LOC)

### A.1 `pathValidation.ts` — path-traversal defense and TOCTOU armor

`pathValidation.ts:373-485` (`validatePath`) is the single entry point that every file-operation tool routes through. The defense pipeline runs in **strict order**:

1. **Strip surrounding quotes**, then `expandTilde()` (`pathValidation.ts:80-89`) — only the bare `~`/`~/` form expands; other forms (`~root`, `~+`, `~-`, `~N`) are kept literal so the next guard catches them.
2. **UNC block** (`pathValidation.ts:382-392`) via `containsVulnerableUncPath` — rejects `\\server\share`, `//server/share`, `\\.\…`, `\\?\…` to prevent credential leak via SMB or path-prefix bypass.
3. **Tilde-variant block** (`pathValidation.ts:401-411`) — explicitly rejects `~user`, `~+`, `~-`, `~N`. The author's TOCTOU note: "we validate `/cwd/~root/...` but bash reads `/var/root/...`". This is a documented attack vector closed at validation time.
4. **Shell-expansion block** (`pathValidation.ts:423-436`) — any `$`, `%`, or leading `=` rejected. Covers `$VAR`, `${VAR}`, `$(cmd)`, `%TEMP%`, Zsh `=cmd`. Comment is explicit: "preserved as literal strings during validation but expanded by the shell during execution, creating a TOCTOU vulnerability."
5. **Glob block in writes** (`pathValidation.ts:443-454`) — `*?[]{}` rejected for `write`/`create`. For `read`, falls through to `validateGlobPattern` (`pathValidation.ts:269-316`) which re-validates the glob's base directory.
6. **Resolve to absolute** (`pathValidation.ts:466-472`) via `safeResolvePath`, returning `{resolvedPath, isCanonical}`. When `isCanonical`, downstream calls reuse it as `precomputedPathsToCheck` to skip 5 redundant syscalls.

**Null-byte defense:** Not present in `pathValidation.ts` itself — this is a Node.js-layer concern. JavaScript's `fs.*` APIs throw `ERR_INVALID_ARG_VALUE` when paths contain `\0` so the null-byte attack surface is closed at the FS bridge, not in user-space. However, the related ADS check at `filesystem.ts:540-551` blocks `:`-delimited NTFS Alternate Data Streams which is the closest analog on Windows.

**Dangerous-removal predicate** at `pathValidation.ts:331-367` (`isDangerousRemovalPath`) blocks `rm /`, `rm /*`, `rm ~`, `rm /usr`, `rm /tmp`, drive roots `C:\`, `D:\`, drive children `C:\Windows`. Used by Bash classifier.

### A.2 Permission decision shape (`PermissionResult.ts`, `PermissionRule.ts`, `PermissionMode.ts`)

Decision union (`PermissionResult.ts:1-21`) — re-exports from `types/permissions.ts`:

- `allow` decision: `{behavior:'allow', updatedInput, decisionReason, updatedPermissions?}`
- `deny`: `{behavior:'deny', message, decisionReason, interrupt?}`
- `ask`: `{behavior:'ask', message, decisionReason, suggestions?}`
- A fourth internal value `passthrough` (`permissions.ts:1114-1117`) is used by tools that defer to the framework; converted to `ask` at the end of the pipeline (`permissions.ts:1300-1310`).

`PermissionRule.ts:25-40` defines:

- `permissionBehaviorSchema = z.enum(['allow','deny','ask'])`
- `permissionRuleValueSchema = z.object({toolName, ruleContent: z.string().optional()})`

Modes (`PermissionMode.ts:42-91`): `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk` — and `auto` is gated behind `feature('TRANSCRIPT_CLASSIFIER')` so the external build never sees it. Cycle order is computed in `getNextPermissionMode.ts:34-79`: `default → acceptEdits → plan → (bypass | auto | default) → …`. Ant users skip acceptEdits/plan since auto mode replaces them.

### A.3 Settings hierarchy & deny→ask→allow precedence

The hierarchy lives in two layers — **settings sources** and **rule precedence within sources**.

**Settings source order** (`settings/constants.ts:7-23`):

```
userSettings → projectSettings → localSettings → flagSettings → policySettings
```

"later sources override earlier" — but for permission **rule evaluation** the rules from all sources are flattened into a single context and evaluated by precedence.

**Permission rule precedence** (`permissions.ts:1158-1318`, `hasPermissionsToUseToolInner`) runs in this exact sequence:

1. **Step 1a (`permissions.ts:1171-1181`)** — entire-tool `deny` rule (`getDenyRuleForTool`) → immediate `deny`.
2. **Step 1b (`permissions.ts:1184-1206`)** — entire-tool `ask` rule (`getAskRuleForTool`) → `ask` UNLESS Bash sandbox auto-allow applies.
3. **Step 1c (`permissions.ts:1208-1223`)** — tool's own `checkPermissions()` runs (e.g. `Bash` checks subcommand-level rules).
4. **Step 1d (`permissions.ts:1226-1228`)** — tool-level `deny` from step 1c → respected even in bypass mode.
5. **Step 1e (`permissions.ts:1230-1236`)** — `tool.requiresUserInteraction()` — tools that always need user are bypass-immune.
6. **Step 1f (`permissions.ts:1244-1250`)** — content-specific `ask` rule → respected even in bypass mode.
7. **Step 1g (`permissions.ts:1255-1260`)** — `safetyCheck` from `checkPathSafetyForAutoEdit` → bypass-immune. Covers `.git/`, `.claude/`, `.vscode/`, shell configs.
8. **Step 2a (`permissions.ts:1262-1281`)** — bypass mode (or plan mode entered from bypass) → `allow`. Note: only steps 1a,1d,1f,1g remain ahead of bypass.
9. **Step 2b (`permissions.ts:1283-1297`)** — entire-tool `allow` rule → `allow`.
10. **Step 3 (`permissions.ts:1299-1310`)** — convert `passthrough` to `ask` and surface to user.

So deny **always** wins, but only steps 1a,1d,1f,1g can stop a bypass-mode user. Then the auto-mode classifier runs as a separate layer in `permissions.ts:473-956` (the outer `hasPermissionsToUseTool`), which can convert an `ask` into either `allow` (classifier approves) or `deny` (classifier blocks). The classifier runs only when mode === `auto` (or plan-with-auto-active) AND the result was `ask`.

### A.4 `additionalDirectories` setting handling

The setting schema is at `settings/types.ts:79-83`: `permissions.additionalDirectories: z.array(z.string()).optional()`. The runtime path is `PermissionUpdate.ts:122-137` (`addDirectories` case in `applyPermissionUpdate`) — directories are stored in `context.additionalWorkingDirectories` as a `Map<string, {path, source}>` keyed by path string. Persistence path is `PermissionUpdate.ts:244-266` (`addDirectories` case in `persistPermissionUpdate`) — reads `existingSettings.permissions.additionalDirectories`, dedupes new entries, writes via `updateSettingsForSource`.

Working-dir matching (`filesystem.ts:683-707`, `pathInAllowedWorkingPath`):

1. Load `originalCwd` plus all `additionalWorkingDirectories.keys()` (`filesystem.ts:667-674`, `allWorkingDirectories`).
2. For each working directory, resolve via `getResolvedWorkingDirPaths` (memoized — `filesystem.ts:681`) so symlink targets match.
3. Every resolved input path must fall under at least one resolved working directory.

`pathInWorkingPath` (`filesystem.ts:709-744`) applies macOS-specific normalisation (`/var → /private/var`, `/tmp → /private/tmp`), case-insensitive comparison (so `.cLauDe/CoMmAnDs` doesn't bypass), then uses `relativePath` and rejects relative paths that include `..` traversal.

### A.5 Other key permission files

- `permissionRuleParser.ts:55-79` — `escapeRuleContent`/`unescapeRuleContent` handle `\\` then `(`, `)` so `Bash(python -c "print(1)")` round-trips as `Bash(python -c "print\\(1\\)")`. `permissionRuleValueFromString` finds the **first unescaped** `(` and the **last unescaped** `)` to extract `ruleContent`.
- `permissionsLoader.ts:31-44` — `shouldAllowManagedPermissionRulesOnly` and `shouldShowAlwaysAllowOptions` honour the `policySettings.allowManagedPermissionRulesOnly` flag. When set, only managed rules are loaded (`permissionsLoader.ts:120-133`).
- `shadowedRuleDetection.ts:111-184` — detects unreachable `allow` rules shadowed by tool-wide `deny` (`Bash` deny + `Bash(ls:*)` allow) or `ask` (`Bash` ask + `Bash(ls:*)` allow). Bash sandbox-auto-allow exception: only personal-source ask rules are exempted; shared-source ask rules always warn (`shadowedRuleDetection.ts:135-144`).
- `bashClassifier.ts` is a STUB for external builds (`bashClassifier.ts:1-62`) — the AI-based Bash classifier is ant-only.
- `dangerousPatterns.ts:18-80` — `CROSS_PLATFORM_CODE_EXEC` lists 14 entry points (`python`, `node`, `npx`, `bash`, `ssh`, etc.) and `DANGEROUS_BASH_PATTERNS` extends with `zsh`, `eval`, `exec`, `xargs`, `sudo`. Auto-mode entry strips overly broad allow rules matching these patterns.
- `denialTracking.ts:12-15` — `DENIAL_LIMITS = {maxConsecutive: 3, maxTotal: 20}`. After 3 consecutive auto-mode classifier denials or 20 total, the system falls back to interactive prompting.
- `bypassPermissionsKillswitch.ts:19-46` — server-side circuit breaker via `shouldDisableBypassPermissions()` Statsig gate; bypass mode can be remotely revoked.
- `classifierDecision.ts:56-98` — `SAFE_YOLO_ALLOWLISTED_TOOLS` set: `Read`, `Grep`, `Glob`, `LSP`, `ToolSearch`, `ListMcpResources`, `ReadMcpResource`, `TodoWrite`, all Task\* metadata tools, `AskUserQuestion`, `Enter/ExitPlanMode`, `TeamCreate`/`TeamDelete`/`SendMessage`, `Sleep`, `YoloClassifier`. Plus ant-only: `TerminalCapture`, `OverflowTest`, `VerifyPlanExecution`.
- `permissionExplainer.ts:43-88` — uses `sideQuery` (Haiku-class side call) with forced tool-choice to produce `{explanation, reasoning, risk, riskLevel}` JSON for the permission dialog.
- `filesystem.ts:57-79` — `DANGEROUS_FILES = ['.gitconfig', '.gitmodules', '.bashrc', '.bash_profile', '.zshrc', '.zprofile', '.profile', '.ripgreprc', '.mcp.json', '.claude.json']` and `DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea', '.claude']`.
- `filesystem.ts:537-602` — `hasSuspiciousWindowsPathPattern` blocks NTFS ADS `:`, 8.3 short names `~\d`, long-path prefixes `\\?\…`, trailing dots/spaces, DOS device names `CON|PRN|AUX|NUL|COMn|LPTn`, three-or-more-dots traversal, and UNC. Critically: checked **on all platforms** because NTFS can be mounted on Linux/macOS via ntfs-3g.
- `filesystem.ts:1479-1605` — `checkEditableInternalPath` carve-outs for `isSessionPlanFile`, `isScratchpadPath`, the templates job-dir (gated on `feature('TEMPLATES')` with hijack guard ensuring jobDir resolves under `~/.claude/jobs/`), `isAgentMemoryPath`, `isAutoMemPath`, and the per-project `.claude/launch.json` for desktop preview.
- `filesystem.ts:1611-1777` — `checkReadableInternalPath` carve-outs for session memory, project dir, plan files, `getToolResultsDir`, scratchpad, project temp dir, agent memory, auto-mem, `~/.claude/tasks/`, `~/.claude/teams/`, and the `getBundledSkillsRoot()` which uses a per-process random nonce for security (`filesystem.ts:352-370`).

---

## B. `utils/swarm/` (22 files, ~6,500 LOC including UI)

### B.1 `teamHelpers.ts` — TeamFile schema & persistence

`teamHelpers.ts:64-90` defines the `TeamFile` shape stored at `~/.claude/teams/{sanitized-team-name}/config.json`:

```ts
type TeamFile = {
  name: string;
  description?: string;
  createdAt: number;
  leadAgentId: string;
  leadSessionId?: string;
  hiddenPaneIds?: string[];
  teamAllowedPaths?: TeamAllowedPath[];
  members: Array<{
    agentId;
    name;
    agentType?;
    model?;
    prompt?;
    color?;
    planModeRequired?;
    joinedAt;
    tmuxPaneId;
    cwd;
    worktreePath?;
    sessionId?;
    subscriptions: string[];
    backendType?;
    isActive?;
    mode?: PermissionMode;
  }>;
};
```

**Persistence:** sync `readTeamFile`/`writeTeamFile` (`teamHelpers.ts:131-170`) for React render paths; async variants (`readTeamFileAsync`/`writeTeamFileAsync`) for tool handlers. Path sanitisation: `sanitizeName` (`teamHelpers.ts:100-102`) replaces non-alphanumerics with `-` and lowercases. Agent-name sanitisation (`teamHelpers.ts:108-110`) replaces `@` with `-` to keep the `agentName@teamName` agent-ID grammar unambiguous.

**Cleanup:** `cleanupSessionTeams` (`teamHelpers.ts:576-590`) registered with graceful shutdown; for each session-created team, kills orphaned panes via dynamic-imported backend registry, then `cleanupTeamDirectories` (`teamHelpers.ts:641-683`) destroys git worktrees with `git worktree remove --force` (falling back to `rm -rf`) and removes `~/.claude/teams/{name}/` and `~/.claude/tasks/{name}/`.

`teamAllowedPaths` (`teamHelpers.ts:57-62`) records team-wide path allowlists `{path, toolName, addedBy, addedAt}` so a teammate joining the team auto-grants `Edit` permission for shared dirs without asking the leader for each member.

### B.2 SendMessage routing — agentNameRegistry, file mailboxes, UDS, cross-machine bridge

The `SendMessageTool` (`tools/SendMessageTool/SendMessageTool.ts`) is the unified routing front-end. Routing decisions:

1. **Bridge (cross-machine)** — `parseAddress(input.to).scheme === 'bridge'` (`SendMessageTool.ts:586-602`). Behaviour: `ask` permission with `safetyCheck`/`classifierApprovable: false` so it's bypass-immune. The destination is a `session_…` ID for a Remote Control peer. Uses `postInterClaudeMessage` (`SendMessageTool.ts:758-773`) which routes through Anthropic's servers. Structured messages are rejected — only plain text (`SendMessageTool.ts:631-655`).
2. **UDS (unix domain socket, local cross-session)** — `parseAddress(input.to).scheme === 'uds'` (`SendMessageTool.ts:775-797`). Calls `sendToUdsSocket(addr.target, input.message)` — local IPC, no permission check.
3. **agentNameRegistry (in-process subagent)** — `appState.agentNameRegistry.get(input.to)` (`SendMessageTool.ts:802-840`). If the recipient is an in-process subagent task: running tasks get `queuePendingMessage` (delivered at next tool round); stopped tasks auto-resume via `resumeAgentBackground`.
4. **File mailbox (tmux/iTerm2 teammates)** — falls through to `writeToMailbox` (in `utils/teammateMailbox.ts`) which writes a JSON message to `~/.claude/teams/{team}/mailbox/{recipient}/`.
5. **Broadcast (`*`)** — `handleBroadcast` (`SendMessageTool.ts:191-…`) writes to every teammate's mailbox; rejects structured messages (`SendMessageTool.ts:678-684`).

The `to` field rejects `@` since "there is only one team per session" (`SendMessageTool.ts:623-630`). All structured messages (`shutdown_request`, `shutdown_response`, `plan_approval_response`) are local-only.

### B.3 Lead/membership semantics & nesting prohibition

- The constant `TEAM_LEAD_NAME = 'team-lead'` (`swarm/constants.ts:1`).
- Teammate identity comes from `dynamicTeamContext` set in `main.tsx` from CLI args (`reconnection.ts:23-66`). Resumed sessions reconstruct via `initializeTeammateContextFromSession` (`reconnection.ts:75-118`).
- **Nesting prohibition:** teammates do NOT register a Stop hook to spawn further teams. The Stop hook a teammate registers (`teammateInit.ts:97-128`) only sends an idle notification to the leader. Furthermore, `teamHelpers.ts:401` early-returns from `syncTeammateMode` when `!isTeammate()` — teammates can update their own mode in the team file, but spawning a fresh team while running as a teammate would create a `dynamicTeamContext` collision. The architecture is single-level by construction: there is no `teammateOfTeammate` field in `TeamFile`.
- `setMemberMode` (`teamHelpers.ts:357-389`) and `setMultipleMemberModes` (`teamHelpers.ts:415-445`) provide atomic-update helpers so multi-mode-change UIs from the leader do not race.
- `setMemberActive` (`teamHelpers.ts:454-485`) is async and writes the `isActive` flag for idle/active state surfaced in the leader's TeamsDialog UI.

### B.4 Cross-team message routing

There is **no cross-team routing** in this snapshot. The `to` field rejects `@`, all routes use `getTeamName()` from the current context, and the file-mailbox base is `getTeamDir(teamName)`. The bridge-scheme is the only path that escapes the team boundary, and that travels through Anthropic's servers as a cross-session remote-control message — it is not "team B's teammate X". The architecture intentionally constrains the swarm graph to exactly one team per process.

### B.5 Permission sync (`permissionSync.ts`)

When a worker hits `ask`, it can forward the request to the leader. The schema (`permissionSync.ts:49-86`, `SwarmPermissionRequestSchema`):

```
~/.claude/teams/{team}/permissions/pending/{requestId}.json
~/.claude/teams/{team}/permissions/resolved/{requestId}.json
```

Uses `proper-lockfile`-style `lockfile.lock` (`permissionSync.ts:228-249`) on a `.lock` sentinel inside the pending dir for atomic writes. The leader polls pending, displays the request, writes the resolution to `resolved/`, and the worker polls `resolved/{id}.json`.

`permissionSync.ts:36-44` plus `teammateMailbox` integration — writes a `permission_request` notification to the leader's mailbox so the leader's UI shows the pending dialog without polling.

### B.6 Backends (`swarm/backends/`)

Nine files — `detection.ts`, `InProcessBackend.ts`, `it2Setup.ts`, `ITermBackend.ts`, `PaneBackendExecutor.ts`, `registry.ts`, `teammateModeSnapshot.ts`, `TmuxBackend.ts`, `types.ts`. Each backend implements `PaneBackend` interface (`backends/types.ts`): `createTeammatePaneInSwarmView`, `enablePaneBorderStatus`, `sendCommandToPane`, `killPane`. The registry detects environment (`detection.ts:128` LOC) and picks: `InProcessBackend` (no panes) → `ITermBackend` (iTerm2 native) → `TmuxBackend` (tmux). `PaneBackendExecutor` is the cross-pane executor; `it2Setup.ts` and `It2SetupPrompt.tsx` (379 lines) handle iTerm2 first-run integration.

`spawnUtils.ts:96-128` lists the env vars forwarded to spawned teammates: provider selection (`CLAUDE_CODE_USE_BEDROCK`, `_VERTEX`, `_FOUNDRY`), `ANTHROPIC_BASE_URL`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_REMOTE` markers, plus a complete proxy-passthrough chain (`HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`, `NO_PROXY`, `no_proxy`, `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`).

`buildInheritedCliFlags` (`spawnUtils.ts:38-89`) propagates `--dangerously-skip-permissions`, `--permission-mode acceptEdits`, `--model`, `--settings`, `--plugin-dir`, `--teammate-mode`, `--chrome`/`--no-chrome` — but **NOT** when `planModeRequired: true`, in which case bypass is intentionally suppressed for safety.

---

## C. `utils/settings/` (19 files, ~7,000 LOC)

### C.1 Load order & merge strategy

`settings.ts:645-796` (`loadSettingsFromDisk`) builds the effective settings via lodash `mergeWith` over a base layer plus all enabled sources:

```
pluginSettingsBase  (lowest)
  → userSettings
  → projectSettings
  → localSettings
  → flagSettings
  → policySettings  (highest, "first source wins")
```

Plugin settings come from `getPluginSettingsBase()` (`settingsCache.ts:66-80`), which only contains allowlisted keys. Each subsequent source's values **override** earlier ones. Arrays merge via `mergeArrays` (`settings.ts:529-531`) — concatenate then `uniq()` dedupe.

`policySettings` is special: "first source wins" inside it. Priority order (`settings.ts:677-738`):

1. Remote (synced enterprise settings via `getRemoteManagedSettingsSyncFromCache`)
2. Admin-only MDM (HKLM on Windows, macOS plist via `getMdmSettings`)
3. File-based managed-settings (`/Library/Application Support/ClaudeCode/managed-settings.json` on macOS, `C:\Program Files\ClaudeCode\managed-settings.json` on Windows, `/etc/claude-code/managed-settings.json` on Linux — `settings/managedPath.ts:8-25`) plus drop-ins under `managed-settings.d/*.json` sorted alphabetically (`settings.ts:74-121`)
4. HKCU (Windows user-writable, lowest)

`updateSettingsForSource` (`settings.ts:416-524`) writes via `writeFileSyncAndFlush_DEPRECATED` after marking `markInternalWrite(filePath)` so the chokidar watcher in `changeDetector.ts` ignores its own echoes (`internalWrites.ts:17-32`, 5-second window via `INTERNAL_WRITE_WINDOW_MS`).

### C.2 Settings keys (the §5.10 inventory, fully cited)

Every key the doc says exists is defined in `settings/types.ts`. Citations are the schema-line numbers in that file (1148 lines).

| Inventory key                                                 | Where                                     | Notes                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------- |
| `model`                                                       | `types.ts:375-378`                        | Override default model                                                                         |
| `availableModels`                                             | `types.ts:380-390`                        | Enterprise allowlist; family aliases + version prefixes + full IDs                             |
| `modelOverrides`                                              | `types.ts:391-398`                        | Map canonical → provider ID; e.g. Bedrock ARN                                                  |
| `apiKeyHelper`                                                | `types.ts:262-265`                        | Path to script that outputs API key                                                            |
| `awsCredentialExport` / `awsAuthRefresh` / `gcpAuthRefresh`   | `types.ts:266-279`                        | 3P auth scripts                                                                                |
| `xaaIdp`                                                      | `types.ts:283-310`                        | XAA SEP-990 IdP (gated by `CLAUDE_CODE_ENABLE_XAA`)                                            |
| `env`                                                         | `types.ts:333-335`                        | `Record<string, string>` (z.coerce.string for back-compat)                                     |
| `attribution.{commit,pr}`                                     | `types.ts:336-358`                        | Commit/PR attribution text                                                                     |
| `includeCoAuthoredBy`                                         | `types.ts:359-365`                        | Deprecated, use `attribution`                                                                  |
| `includeGitInstructions`                                      | `types.ts:366-371`                        | Default true                                                                                   |
| `permissions.allow`                                           | `types.ts:45-48` (in `PermissionsSchema`) | Array of rule strings                                                                          |
| `permissions.deny`                                            | `types.ts:49-52`                          | Array of rule strings                                                                          |
| `permissions.ask`                                             | `types.ts:53-58`                          | Array of rule strings                                                                          |
| `permissions.defaultMode`                                     | `types.ts:59-66`                          | Enum gated on `TRANSCRIPT_CLASSIFIER` (includes `auto`)                                        |
| `permissions.disableBypassPermissionsMode`                    | `types.ts:67-70`                          | Literal `"disable"`                                                                            |
| `permissions.disableAutoMode`                                 | `types.ts:71-78`                          | TRANSCRIPT_CLASSIFIER-only; literal `"disable"`                                                |
| `permissions.additionalDirectories`                           | `types.ts:79-83`                          | `array(string)`                                                                                |
| `enableAllProjectMcpServers`                                  | `types.ts:399-405`                        | bool                                                                                           |
| `enabledMcpjsonServers` / `disabledMcpjsonServers`            | `types.ts:407-415`                        | per-project MCP list                                                                           |
| `allowedMcpServers` / `deniedMcpServers`                      | `types.ts:417-434`                        | enterprise allow/deny — denylist takes precedence                                              |
| `hooks`                                                       | `types.ts:435-437`                        | `HooksSchema`                                                                                  |
| `worktree.symlinkDirectories` / `worktree.sparsePaths`        | `types.ts:438-457`                        | git-worktree config                                                                            |
| `disableAllHooks`                                             | `types.ts:459-462`                        | bool                                                                                           |
| `defaultShell`                                                | `types.ts:463-470`                        | enum `bash                                                                                     | powershell`                               |
| `allowManagedHooksOnly`                                       | `types.ts:471-478`                        | only managed hooks run                                                                         |
| `allowedHttpHookUrls`                                         | `types.ts:479-489`                        | URL pattern allowlist                                                                          |
| `httpHookAllowedEnvVars`                                      | `types.ts:490-499`                        | env-var allowlist for HTTP hook headers                                                        |
| `allowManagedPermissionRulesOnly`                             | `types.ts:500-507`                        | only managed permission rules respected                                                        |
| `allowManagedMcpServersOnly`                                  | `types.ts:508-516`                        | only managed allowedMcpServers                                                                 |
| `strictPluginOnlyCustomization`                               | `types.ts:517-548`                        | `boolean                                                                                       | array(['skills','agents','hooks','mcp'])` |
| `statusLine`                                                  | `types.ts:549-557`                        | `{type:'command', command, padding?}`                                                          |
| `enabledPlugins`                                              | `types.ts:558-567`                        | `Record<string, array                                                                          | bool>` plugin@marketplace                 |
| `extraKnownMarketplaces`                                      | `types.ts:568-600`                        | record with refinement: settings-sourced name must equal key                                   |
| `strictKnownMarketplaces`                                     | `types.ts:601-612`                        | enterprise allowlist of marketplace sources                                                    |
| `blockedMarketplaces`                                         | `types.ts:613-622`                        | enterprise blocklist                                                                           |
| `forceLoginMethod`                                            | `types.ts:623-629`                        | enum `claudeai                                                                                 | console`                                  |
| `forceLoginOrgUUID`                                           | `types.ts:630-633`                        | string                                                                                         |
| `otelHeadersHelper`                                           | `types.ts:635-638`                        | OTel headers script path                                                                       |
| `outputStyle`                                                 | `types.ts:639-642`                        | string (default/explanatory/learning/custom)                                                   |
| `language`                                                    | `types.ts:643-648`                        | preferred language                                                                             |
| `skipWebFetchPreflight`                                       | `types.ts:649-654`                        | enterprise bypass for restrictive nets                                                         |
| `sandbox`                                                     | `types.ts:655`                            | `SandboxSettingsSchema` (defined in entrypoints)                                               |
| `feedbackSurveyRate`                                          | `types.ts:656-663`                        | 0..1 probability                                                                               |
| `spinnerTipsEnabled` / `spinnerVerbs` / `spinnerTipsOverride` | `types.ts:664-685`                        | UI customisation                                                                               |
| `syntaxHighlightingDisabled`                                  | `types.ts:686-689`                        | bool                                                                                           |
| `terminalTitleFromRename`                                     | `types.ts:690-695`                        | bool                                                                                           |
| `alwaysThinkingEnabled`                                       | `types.ts:696-702`                        | thinking gate                                                                                  |
| `effortLevel`                                                 | `types.ts:703-711`                        | enum `low                                                                                      | medium                                    | high` (`max` only for ant) |
| `advisorModel`                                                | `types.ts:712-715`                        | server-side advisor                                                                            |
| `fastMode`                                                    | `types.ts:716-721`                        | bool                                                                                           |
| `fastModePerSessionOptIn`                                     | `types.ts:722-727`                        | session-only                                                                                   |
| `promptSuggestionEnabled`                                     | `types.ts:728-734`                        | bool                                                                                           |
| `showClearContextOnPlanAccept`                                | `types.ts:735-740`                        | bool                                                                                           |
| `agent`                                                       | `types.ts:741-747`                        | named agent for main thread                                                                    |
| `companyAnnouncements`                                        | `types.ts:748-753`                        | startup banner                                                                                 |
| `pluginConfigs`                                               | `types.ts:754-794`                        | per-plugin MCP server configs                                                                  |
| `remote.defaultEnvironmentId`                                 | `types.ts:795-803`                        | remote sessions                                                                                |
| `autoUpdatesChannel`                                          | `types.ts:804-807`                        | enum `latest                                                                                   | stable`                                   |
| `disableDeepLinkRegistration`                                 | `types.ts:809-816`                        | LODESTONE-gated; `claude-cli://`                                                               |
| `minimumVersion`                                              | `types.ts:818-823`                        | downgrade prevention                                                                           |
| `plansDirectory`                                              | `types.ts:824-830`                        | custom plans dir                                                                               |
| `classifierPermissionsEnabled`                                | `types.ts:833-839`                        | ant-only                                                                                       |
| `minSleepDurationMs` / `maxSleepDurationMs`                   | `types.ts:843-862`                        | PROACTIVE/KAIROS-gated                                                                         |
| `voiceEnabled`                                                | `types.ts:866-870`                        | VOICE_MODE-gated                                                                               |
| `assistant` / `assistantName`                                 | `types.ts:874-887`                        | KAIROS-gated                                                                                   |
| `channelsEnabled` / `allowedChannelPlugins`                   | `types.ts:896-921`                        | Teams/Enterprise inbound MCP channel push                                                      |
| `defaultView`                                                 | `types.ts:924-930`                        | KAIROS-gated `chat                                                                             | transcript`                               |
| `prefersReducedMotion`                                        | `types.ts:932-937`                        | a11y                                                                                           |
| `autoMemoryEnabled` / `autoMemoryDirectory`                   | `types.ts:938-949`                        | per-project memory                                                                             |
| `autoDreamEnabled`                                            | `types.ts:950-955`                        | background memory consolidation                                                                |
| `showThinkingSummaries`                                       | `types.ts:956-961`                        | ctrl+o                                                                                         |
| `skipDangerousModePermissionPrompt`                           | `types.ts:962-967`                        | bypass-dialog accepted (excluded from `projectSettings` for RCE safety: `settings.ts:882-889`) |
| `skipAutoPermissionPrompt`                                    | `types.ts:970-975`                        | auto-mode accepted (same RCE exclusion: `settings.ts:896-911`)                                 |
| `useAutoModeDuringPlan`                                       | `types.ts:976-981`                        | default true; project-source excluded                                                          |
| `autoMode.{allow,soft_deny,deny?,environment}`                | `types.ts:982-1007`                       | classifier customisation; project-source excluded                                              |
| `disableAutoMode`                                             | `types.ts:1009-1012`                      | top-level literal `"disable"`                                                                  |
| `sshConfigs`                                                  | `types.ts:1013-1052`                      | SSH connection profiles                                                                        |
| `claudeMdExcludes`                                            | `types.ts:1053-1061`                      | glob patterns for CLAUDE.md exclusion                                                          |
| `pluginTrustMessage`                                          | `types.ts:1062-1070`                      | policy-only                                                                                    |

The schema closes with `.passthrough()` (`types.ts:1071-1073`) so unknown keys survive a write-modify-write cycle even when validation rejects new fields. Documented at `types.ts:212-241` (BACKWARD COMPATIBILITY NOTICE) — the contract is "removing fields breaks users". `worktree.baseRef`, `sandbox.bwrapPath`, `sandbox.socatPath` are absorbed into `sandbox` via `SandboxSettingsSchema` (imported from `entrypoints/sandboxTypes`, not in this file).

### C.3 `parentSettingsBehavior` — NOT PRESENT

A grep across `~/Desktop/reference/src/` finds `parentSettingsBehavior` only in the §5.10 inventory text — there is no schema field, no merge code, no enum. **The `first-wins | merge` toggle the inventory describes is not in this snapshot.** It may be an undocumented internal flag, an upcoming feature, or unique to a build variant the snapshot doesn't include.

The `first-wins` semantics that **does** exist applies only to `policySettings` (`settings.ts:677-738`) — the four policy sources (remote → MDM → file → HKCU) use first-wins, while everything else uses lodash `mergeWith` last-wins.

### C.4 Hot-reload (chokidar)

`changeDetector.ts:103-146` uses chokidar with `awaitWriteFinish: {stabilityThreshold: 1000ms, pollInterval: 500ms}` and `atomic: true`. Watches the directory containing each settings file (depth 0), filtered to known settings filenames plus `*.json` inside `managed-settings.d/`. Internal writes are filtered via `consumeInternalWrite` (`internalWrites.ts:26-33`, 5-second window). Deletion has a grace period (`changeDetector.ts:62-63`, ~1.7s) to handle delete-and-recreate atomic rewrites.

MDM polling runs every 30 minutes (`changeDetector.ts:51`) since registry/plist changes can't be filesystem-watched. `applySettingsChange.ts:33-92` handles the React-state propagation: re-reads merged settings, reloads permission rules from disk via `loadAllPermissionRulesFromDisk` + `syncPermissionRulesFromDisk`, re-applies hooks snapshot, strips overly-broad Bash rules (ant-only), re-checks bypass-disabled and plan/auto transition.

### C.5 Schema validation (Zod)

`SettingsSchema` (`types.ts:255-1073`) is a 818-LOC `z.object().passthrough()`. Per-rule validation runs in `validatePermissionRule` (`permissionValidation.ts:58-239`):

- empty rule → error
- mismatched parens (escape-aware) → error
- empty `()` → error
- MCP rules: must not have `()`; format is `mcp__server`, `mcp__server__*`, or `mcp__server__tool`
- non-MCP: tool name must start uppercase
- Bash rules: `:*` must be at the end; legacy prefix syntax preserved
- File-pattern rules: reject `:*`, warn on misplaced wildcards
- WebSearch: no wildcards
- WebFetch: must use `domain:` prefix, no URLs

`filterInvalidPermissionRules` (`validation.ts:223-265`) drops rule strings that fail validation **before** schema validation — one bad rule does not poison the whole settings file. `formatZodError` (`validation.ts:97-173`) maps Zod issues to `{file, path, message, expected, invalidValue, suggestion, docLink}` with type-narrowing helpers per Zod v4 issue codes. `getValidationTip` (`validationTips.ts:140-164`) provides path-aware suggestions; `validateEditTool.ts:14-45` runs as a pre-write gate so `Edit` on `settings.json` rejects edits that would break schema validity (only when the _before_ version was already valid).

`validateSettingsFileContent` (`validation.ts:179-217`) uses `.strict()` schema (catches unrecognized keys) for edit-time validation — different from `parseSettingsFileUncached` (`settings.ts:201-231`) which uses `.passthrough()` for runtime read. Two layers: write-time strict, read-time permissive.

---

## D. `utils/model/` (16 files, ~2,800 LOC)

### D.1 Model selection logic & fallback chains

`getMainLoopModel` (`model/model.ts:92-98`) → `getUserSpecifiedModelSetting` (`model.ts:61-78`) priority:

1. `getMainLoopModelOverride()` from session state (`/model` or `/config`)
2. `process.env.ANTHROPIC_MODEL`
3. `settings.model`
4. fall through to `getDefaultMainLoopModel` (`model.ts:206-208`) → `getDefaultMainLoopModelSetting` (`model.ts:178-200`):
   - ant: `getAntModelOverrideConfig()?.defaultModel ?? Opus + '[1m]'`
   - Max / Team Premium: Opus (with optional `[1m]` if `isOpus1mMergeEnabled`)
   - Pro / Team Standard / Enterprise / PAYG: Sonnet 4.6

`isModelAllowed` (`modelAllowlist.ts:100-170`) gates user-specified models via `availableModels`:

- empty array → blocks all
- absent → allows all
- entries are family aliases (`opus`, `sonnet`, `haiku`), version prefixes (`opus-4-5`, `claude-opus-4-5`), or full IDs
- "narrowing": when both `opus` and `opus-4-5` are present, `opus` is treated as wildcard-disabled; only `opus-4-5` matches

3P fallback (`validateModel.ts:144-159`):

- `claude-opus-4-6` → `claude-opus-4-1` (`opus41`)
- `claude-sonnet-4-6` → `claude-sonnet-4-5` (`sonnet45`)
- `claude-sonnet-4-5` → `claude-sonnet-4-0` (`sonnet40`)

When validating, `validateModel.ts:55-82` makes a real `sideQuery` with `max_tokens:1` to confirm the model exists at the API. Cached on success.

### D.2 `/effort` and `/fast` code paths

`/effort` levels (`utils/effort.ts:67-79`, `convertEffortValueToLevel`): `low | medium | high` for external, plus `max` for ant. Numeric values are bucketed. The setting is at `settings/types.ts:703-711` (`effortLevel`).

`getDisplayedEffortLevel` (`effort.ts:174-…`) is the single source of truth for the status-bar display. The level is propagated:

- `/effort` slash command writes `userSettings.effortLevel` (or session-only via temporal flag)
- `applySettingsChange.ts:74-89` re-syncs `effortValue` into AppState only when the _setting_ changed (so a `--effort` CLI flag isn't clobbered by an unrelated settings churn)

`/fast` ↔ `fastMode` (`utils/fastMode.ts`, `settings/types.ts:716-727`). Two booleans:

- `fastMode`: persisted; default off
- `fastModePerSessionOptIn`: when true, fastMode does not persist across sessions

`getOpus46PricingSuffix` (`model.ts:307-311`) appends a `LIGHTNING_BOLT` and pricing string when fastMode is on, surfaced in the model picker description.

### D.3 1M-context model gating

`check1mAccess.ts:46-72`:

- `is1mContextDisabled()` — kill switch
- subscribers: gated on `isExtraUsageEnabled()` — i.e. extra-usage credits are provisioned
- non-subscribers (PAYG) — always have access

The subscriber gate consults `getGlobalConfig().cachedExtraUsageDisabledReason` against the OverageDisabledReason enum (`check1mAccess.ts:11-43`):

- `null` → enabled
- `out_of_credits` → still counts as enabled (depleted but provisioned)
- `overage_not_provisioned`, `org_level_disabled`, `org_level_disabled_until`, `seat_tier_level_disabled`, `member_level_disabled`, `seat_tier_zero_credit_limit`, `group_zero_credit_limit`, `member_zero_credit_limit`, `org_service_level_disabled`, `org_service_zero_credit_limit`, `no_limits_configured` → disabled

`contextWindowUpgradeCheck.ts:9-30` (`getAvailableUpgrade`) returns the upgrade alias (`opus[1m]` or `sonnet[1m]`) and surfaces a tip in the warning footer.

### D.4 **Hardcoded model IDs — flagged for our locked rule**

This is the critical audit. The locked rule says "NEVER hardcode model IDs. Read from `models.json`." Reference repo violates this in 7+ files:

- **`model/configs.ts:9-99`** — every Anthropic model ID is hardcoded as a TypeScript const (`CLAUDE_3_7_SONNET_CONFIG`, `CLAUDE_OPUS_4_6_CONFIG`, etc.) with all four provider variants (firstParty/bedrock/vertex/foundry). 11 separate model configs covering Haiku 3.5, Haiku 4.5, Sonnet 3.5/3.7/4/4.5/4.6, Opus 4/4.1/4.5/4.6.
- **`model/aliases.ts:1-9`** — hardcodes alias strings: `sonnet`, `opus`, `haiku`, `best`, `sonnet[1m]`, `opus[1m]`, `opusplan`.
- **`model/deprecation.ts:33-61`** — hardcodes deprecation table: `claude-3-opus` (Jan 5, 2026), `claude-3-7-sonnet` (Feb 19 2026 / Apr 28 2026 / May 11 2026), `claude-3-5-haiku` (Feb 19 2026).
- **`model/model.ts:218-269`** — `firstPartyNameToCanonical` literally string-matches on `claude-opus-4-6`, `claude-opus-4-5`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-3-7-sonnet`, etc. — 12 hardcoded substrings.
- **`model/model.ts:286-296`** — display strings hardcode `Opus 4.6` and `Sonnet 4.6` in user-facing copy.
- **`model/modelOptions.ts:392-415`** — feature-detection by string-match: `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-3-7-sonnet`, `claude-3-5-sonnet`, `claude-opus-4`, `claude-haiku`.
- **`model/validateModel.ts:144-159`** — fallback mapping `opus-4-6 → opus41`, `sonnet-4-6 → sonnet45`, `sonnet-4-5 → sonnet40` is hardcoded.
- **`model/bedrock.ts:179, 216-220, 244-246`** — Bedrock-specific ID strings inline.
- **`swarm/teammateModel.ts:1-10`** — imports `CLAUDE_OPUS_4_6_CONFIG` and uses it as the hardcoded teammate fallback.

**Policy implication for our port:** every one of these constants must read from `models.json` via the `apps/cli/src/models.rs` pattern (12 named providers + Custom registry, per MEMORY.md). The reference repo's strategy of "@[MODEL LAUNCH]" comments scattered across 9 files is exactly what the rule prohibits — adding a model means edits to `configs.ts`, `aliases.ts`, `deprecation.ts`, `model.ts` (canonical+display), `modelOptions.ts`, `validateModel.ts`, and update `scripts/excluded-strings.txt` (per `model.ts:1-7`'s comment) to scrub codenames from external builds.

The reference repo gets away with it because it ships a single Anthropic-native client. AGI Workforce's 10+ provider promise turns each of these hardcoded points into a multi-provider drift surface; centralizing on `models.json` is non-negotiable.

### D.5 Other model files

- **`model/modelStrings.ts:33-115`** — Bedrock inference profile lookup. Iterates user's profile list, finds substring match for each canonical first-party ID, falls back to hardcoded bedrock variant from `configs.ts`. Layer on top: `applyModelOverrides` reads `settings.modelOverrides` (`types.ts:391-398`) and overrides per canonical ID — typically used to point at a Bedrock ARN.
- **`model/modelCapabilities.ts:30-118`** — caches `/v1/models` API response at `~/.claude/cache/model-capabilities.json` (mode 0600). Eligibility: ant + firstParty + first-party base URL. Used to discover `max_input_tokens`/`max_tokens` per model so the UI doesn't hardcode context windows.
- **`model/modelSupportOverrides.ts:11-50`** — 3P capability overrides via `ANTHROPIC_DEFAULT_OPUS_MODEL` + `ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES` (CSV: `effort,max_effort,thinking,adaptive_thinking,interleaved_thinking`). Allows enterprise to override capability flags per model.
- **`model/agent.ts:25-95`** — agent (subagent) model resolution. Default `'inherit'` so subagents take parent's model. Bedrock prefix inheritance: parent `eu.anthropic.claude-opus-4-6` → subagent gets `eu.` prefix on alias-resolved models so IAM permissions to specific cross-region inference profiles still work. `aliasMatchesParentTier` (`agent.ts:110-122`) — bare alias matching parent tier inherits the _exact_ parent model string (Vertex user on Opus 4.6 spawning `model: opus` subagent gets Opus 4.6, not Opus default — anthropics/claude-code#30815).
- **`model/providers.ts:1-40`** — `APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'`. `getAPIProvider` reads `CLAUDE_CODE_USE_BEDROCK`/`_VERTEX`/`_FOUNDRY` env vars. `isFirstPartyAnthropicBaseUrl` checks `ANTHROPIC_BASE_URL` against `api.anthropic.com` (plus `api-staging.anthropic.com` for ant) — 3P custom endpoints fail this check.

---

## E. Cross-cutting threats and observations

**Bypass-immunity hierarchy.** Five guards survive `bypassPermissions` mode: tool-level `deny` rules (1a/1d), tool's own `requiresUserInteraction` (1e), content-specific `ask` rules with `decisionReason.type === 'rule'` (1f), `safetyCheck` paths (1g — `.git`, `.claude`, `.vscode`, shell configs, sensitive files), and the cross-machine `bridge:` SendMessage scheme (`SendMessageTool.ts:586-602`, classifier-non-approvable safetyCheck). The author's comment at `permissions.ts:1252-1260` is explicit: "Safety checks are bypass-immune."

**Auto-mode classifier failure modes.** Three distinct fall-throughs (`permissions.ts:822-876`):

1. `transcriptTooLong` → fall back to manual prompt
2. `unavailable` AND `tengu_iron_gate_closed` flag is true → fail-closed deny
3. `unavailable` AND flag is false → fail-open, fall through to normal handling

The `iron_gate` GrowthBook flag (cached 30 min) lets Anthropic remotely toggle fail-open vs fail-closed.

**Internal-paths carve-outs are extensive.** `checkEditableInternalPath` (`filesystem.ts:1479-1605`) and `checkReadableInternalPath` (`filesystem.ts:1611-1777`) carve out plan files, scratchpad, agent memory, auto-mem, project-temp, tool results, tasks dir, teams dir, and bundled-skills extraction root. The bundled-skills root uses a per-process random nonce (`filesystem.ts:352-370`) to prevent local-attacker squatting on `/tmp` (sticky bit prevents deletion, not creation).

**Cross-team and cross-machine routing through Anthropic's servers.** SendMessageTool's `bridge:` scheme is the only path that escapes the single-team-per-process boundary, and it travels through Anthropic-hosted servers. This is treated as cross-machine prompt injection and is bypass-immune by design (`SendMessageTool.ts:590-599`).

**The `parentSettingsBehavior` mystery.** The §5.10 inventory mentions it, but no code in this snapshot implements it. Either it's documented from a future build, an undocumented internal feature, or the inventory is aspirational. The current implementation is straight lodash `mergeWith` (last-wins) for non-policy sources, "first-source-wins" for policy.

**Schema permissiveness as ABI guarantee.** Top-level `.passthrough()` (`types.ts:1071-1073`) means unknown keys survive. Nested `.passthrough()` on `permissions` (`types.ts:84`) means future permission fields survive. Combined with `filterInvalidPermissionRules` (`validation.ts:223-265`) — one bad rule is dropped, the rest survive — this is a deliberate forward-compat design: an old client never wipes a newer client's settings file.

---

## F. Top porting priorities for AGI Workforce

1. **`pathValidation.ts` and `filesystem.ts:537-1777`** — the path-traversal/UNC/ADS/8.3/tilde-variant defenses are deep, well-commented, and address several real CVE classes. Port verbatim and add Rust-side null-byte rejection (Node already throws for `\0` paths but our Rust `apps/cli` must enforce it explicitly).
2. **Permission rule precedence (`permissions.ts:1158-1318`)** — the deny→ask→safetyCheck→bypass→allow ordering is non-obvious and small reorderings introduce real bypasses. Encode as a single state machine in Rust.
3. **`models.json` as single-source-of-truth** — replace every ID hardcode in `model/{configs,aliases,deprecation,model,modelOptions,validateModel,bedrock,swarm/teammateModel}.ts` with `apps/cli/src/models.rs`-style JSON-driven registry. Already part of our locked rule but the reference repo shows exactly how many points must be touched (~9 source files, ~150 hardcoded strings, plus `excluded-strings.txt` scrubbing).
4. **Hot-reload via chokidar (`changeDetector.ts`)** — adapt the `awaitWriteFinish` semantics, internal-write echo suppression, and 30-minute MDM poll cadence directly. The deletion grace-period (~1.7s) for atomic-rewrite delete-and-recreate is a subtle correctness fix our `apps/cli` `~/.agiworkforce/settings.json` watcher should mirror.

This U4 deliverable in totality covers ~22,000 LOC of read-and-cited reference code across 81 files (24+22+19+16). Every section above cites a file:line that can be consulted in `~/Desktop/reference/src/utils/`.

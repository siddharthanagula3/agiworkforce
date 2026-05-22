# `~/Desktop/reference/src/tools/` — Tool Registry Inventory

Snapshot date: 2026-05-08. Reference root: `/Users/siddhartha/Desktop/reference/src/tools/` (43 children: 41 tool dirs, `shared/` + `testing/` helpers, plus `utils.ts`).

All tools share a single contract defined in `src/Tool.ts`: a `buildTool({...})` factory taking `name`, `searchHint`, `inputSchema` (Zod v4 lazy schema), `outputSchema`, `prompt`, `validateInput`, `checkPermissions`, `call`, plus optional `isReadOnly`, `isConcurrencySafe`, `isMcp`, `isOpenWorld`, `isLsp`, `isEnabled`, `userFacingName`, `searchHint`, `aliases`, and renderer hooks (`renderToolUseMessage`, `renderToolResultMessage`, `renderToolUseProgressMessage`, `renderToolUseRejectedMessage`, `renderToolUseErrorMessage`). Every Zod schema is wrapped in `lazySchema()` for cold-start cost; outputs are explicitly typed and `mapToolResultToToolResultBlockParam` produces the API-facing `tool_result` block.

## 1. Inventory Table

| #   | Wire name (`name:`)                | Path                                              | Category      | Read-only                               | Defer                        | One-line                                                                                                                                   | Schema highlights                                                                                                                                                             |
| --- | ---------------------------------- | ------------------------------------------------- | ------------- | --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | -------- | ------------------------------------- |
| 1   | `Read`                             | `FileReadTool/FileReadTool.ts:337`                | file-system   | yes (`isReadOnly() {return true}` :376) | —                            | Read text/image/PDF/notebook by absolute path with offset/limit                                                                            | `file_path:string`, optional `offset:int>=0`, `limit:int>0`, `pages:string` (`"1-5"`) :228-241                                                                                |
| 2   | `Edit`                             | `FileEditTool/FileEditTool.ts:86`                 | file-system   | no                                      | —                            | Single in-place string substitution with read-stamp guard                                                                                  | `file_path`, `old_string`, `new_string`, `replace_all:bool=false` :7-18 (types.ts)                                                                                            |
| 3   | `Write`                            | `FileWriteTool/FileWriteTool.ts:94`               | file-system   | no                                      | —                            | Full-file overwrite or create                                                                                                              | `file_path:absolute`, `content:string` :57-65                                                                                                                                 |
| 4   | `Glob`                             | `GlobTool/GlobTool.ts:57`                         | file-system   | yes :79                                 | —                            | Glob match + mtime sort, capped 100                                                                                                        | `pattern:string`, optional `path:string` :27-35                                                                                                                               |
| 5   | `Grep`                             | `GrepTool/GrepTool.ts:160`                        | file-system   | yes :186                                | —                            | ripgrep wrapper with three output modes                                                                                                    | `pattern`, `path?`, `glob?`, `type?`, `output_mode?` (`content`/`files_with_matches`/`count`), `-A/-B/-C/-n/-i`, `multiline?`, `head_limit?`, `offset?` :33-89                |
| 6   | `NotebookEdit`                     | `NotebookEditTool/NotebookEditTool.ts:90`         | file-system   | no                                      | yes (`shouldDefer:true` :94) | Replace/insert/delete single cell in `.ipynb`                                                                                              | `notebook_path`, `cell_id?`, `new_source`, `cell_type?` (code/markdown), `edit_mode?` (replace/insert/delete) :30-56                                                          |
| 7   | `Bash`                             | `BashTool/BashTool.tsx` (export from .tsx)        | shell         | no                                      | —                            | Shell command with sandbox, optional auto-background                                                                                       | `command:string`, `description?:string`, `timeout?:int<getMaxTimeoutMs()`, `run_in_background?:bool`, `dangerouslyDisableSandbox?:bool` :227-247                              |
| 8   | `PowerShell`                       | `PowerShellTool/PowerShellTool.tsx`               | shell         | no                                      | —                            | Windows-native PS equivalent of Bash                                                                                                       | Same as Bash + uses `getCachedPowerShellPath()` (line 30)                                                                                                                     |
| 9   | `WebFetch`                         | `WebFetchTool/WebFetchTool.ts:66`                 | web           | yes :98                                 | yes :71                      | URL → markdown, then prompt-summarize                                                                                                      | `url:url`, `prompt:string` :24-29                                                                                                                                             |
| 10  | `WebSearch`                        | `WebSearchTool/WebSearchTool.ts:152`              | web           | yes :203                                | yes :156                     | Anthropic server-side tool; max_uses 8                                                                                                     | `query:string(min 2)`, `allowed_domains?:string[]`, `blocked_domains?:string[]` :25-36                                                                                        |
| 11  | `Agent` (alias `Task`)             | `AgentTool/AgentTool.tsx:196`                     | agent-spawn   | no                                      | —                            | Spawn sub-agent (sync/async/teammate/worktree/remote)                                                                                      | `description`, `prompt`, `subagent_type?`, `model?` (sonnet/opus/haiku), `run_in_background?`, `name?`, `team_name?`, `mode?`, `isolation?` (worktree/remote), `cwd?` :82-101 |
| 12  | `TodoWrite`                        | `TodoWriteTool/TodoWriteTool.ts:31`               | task          | no                                      | yes :51                      | V1 todo checklist (TodoListSchema)                                                                                                         | `todos:Todo[]` :13-17                                                                                                                                                         |
| 13  | `TaskCreate`                       | `TaskCreateTool/TaskCreateTool.ts:48`             | task (V2)     | no                                      | yes :67                      | Create persistent task                                                                                                                     | `subject`, `description`, `activeForm?`, `metadata?` :18-32                                                                                                                   |
| 14  | `TaskList`                         | `TaskListTool/TaskListTool.ts:33`                 | task (V2)     | yes :60                                 | yes :52                      | List tasks (filter `_internal`)                                                                                                            | `{}` :13                                                                                                                                                                      |
| 15  | `TaskGet`                          | `TaskGetTool/TaskGetTool.ts:38`                   | task (V2)     | yes :64                                 | yes :57                      | Retrieve task by ID                                                                                                                        | `taskId:string` :14-17                                                                                                                                                        |
| 16  | `TaskUpdate`                       | `TaskUpdateTool/TaskUpdateTool.ts:88`             | task (V2)     | no                                      | yes :107                     | Update fields, status (incl. `deleted`), blockers                                                                                          | `taskId`, optional `subject/description/activeForm/status/owner/addBlocks/addBlockedBy/metadata` :37-65                                                                       |
| 17  | `TaskOutput`                       | `TaskOutputTool/TaskOutputTool.tsx:?`             | task          | yes                                     | —                            | Read background task stdout/stderr/result; optional wait                                                                                   | `task_id`, `block?:bool=true`, `timeout?:int<=600000ms` :30-34                                                                                                                |
| 18  | `TaskStop` (alias `KillShell`)     | `TaskStopTool/TaskStopTool.ts:39`                 | task          | no                                      | yes :53                      | Stop a running background task                                                                                                             | `task_id?` or legacy `shell_id?` :11-19                                                                                                                                       |
| 19  | `EnterPlanMode`                    | `EnterPlanModeTool/EnterPlanModeTool.ts:36`       | plan          | yes :71                                 | yes :55                      | Switch context to plan mode                                                                                                                | `{}` :22-25                                                                                                                                                                   |
| 20  | `ExitPlanMode` (V2)                | `ExitPlanModeTool/ExitPlanModeV2Tool.ts:147`      | plan          | no :183                                 | yes :166                     | Present plan + permission prompts                                                                                                          | `allowedPrompts?:Array<{tool:'Bash', prompt:string}>` (passthrough) :77-89                                                                                                    |
| 21  | `EnterWorktree`                    | `EnterWorktreeTool/EnterWorktreeTool.ts:52`       | worktree      | no                                      | yes :71                      | Create + cd into git worktree                                                                                                              | `name?` (validateWorktreeSlug, ≤64 chars) :23-39                                                                                                                              |
| 22  | `ExitWorktree`                     | `ExitWorktreeTool/ExitWorktreeTool.ts`            | worktree      | no                                      | yes                          | Leave worktree (`keep` / `remove`)                                                                                                         | `action:'keep'                                                                                                                                                                | 'remove'`, `discard_changes?:bool` :30-43 |
| 23  | `TeamCreate`                       | `TeamCreateTool/TeamCreateTool.ts:74`             | agent-spawn   | no                                      | yes :78                      | Spin up swarm team                                                                                                                         | `team_name`, `description?`, `agent_type?` :37-49                                                                                                                             |
| 24  | `TeamDelete`                       | `TeamDeleteTool/TeamDeleteTool.ts:32`             | agent-spawn   | no                                      | yes :36                      | Disband team + cleanup                                                                                                                     | `{}` :21                                                                                                                                                                      |
| 25  | `SendMessage`                      | `SendMessageTool/SendMessageTool.ts`              | agent-mailbox | no                                      | —                            | Inter-agent mailbox + structured shutdown/plan-approval                                                                                    | `to:string` (name/`*`/`uds:`/`bridge:`), `summary?`, `message:string                                                                                                          | StructuredMessage` :67-87                 |
| 26  | `MCPTool` (factory)                | `MCPTool/MCPTool.ts:27`                           | mcp-bridge    | factory                                 | factory                      | Generic MCP-tool stub overridden per server in `mcpClient.ts`                                                                              | `z.object({}).passthrough()` :14                                                                                                                                              |
| 27  | `ListMcpResourcesTool`             | `ListMcpResourcesTool/ListMcpResourcesTool.ts:40` | mcp           | yes :44                                 | yes :50                      | List resources from connected MCP servers                                                                                                  | `server?:string` :15-22                                                                                                                                                       |
| 28  | `ReadMcpResourceTool`              | `ReadMcpResourceTool/ReadMcpResourceTool.ts:49`   | mcp           | yes :53                                 | yes :59                      | Read a specific resource URI                                                                                                               | `server`, `uri` :22-27                                                                                                                                                        |
| 29  | `mcp__<server>__authenticate`      | `McpAuthTool/McpAuthTool.ts:49`                   | mcp-auth      | no                                      | —                            | Pseudo-tool that kicks OAuth on unauthed server                                                                                            | `{}` :23                                                                                                                                                                      |
| 30  | `LSP`                              | `LSPTool/LSPTool.ts:127`                          | code-intel    | yes :149                                | yes :136                     | LSP ops (definition, refs, hover, symbols, call hierarchy)                                                                                 | `operation:enum`, `filePath`, `line:int>0`, `character:int>0` :60-86                                                                                                          |
| 31  | `Skill`                            | `SkillTool/SkillTool.ts:?`                        | skill         | varies                                  | —                            | Run a skill in a forked sub-agent                                                                                                          | `command:string` (skill name+args, see prompt)                                                                                                                                |
| 32  | `Config`                           | `ConfigTool/ConfigTool.ts:67`                     | config        | get-only :91                            | yes :86                      | Get/set settings (theme, model, modes…)                                                                                                    | `setting:string`, `value?:string                                                                                                                                              | bool                                      | number` :37-48 |
| 33  | `ToolSearch`                       | `ToolSearchTool/ToolSearchTool.ts:304`            | meta-tool     | yes :311                                | —                            | Search/load deferred tools by `select:` or keywords                                                                                        | `query:string`, `max_results?:number=5` :21-33                                                                                                                                |
| 34  | `AskUserQuestion`                  | `AskUserQuestionTool/AskUserQuestionTool.tsx:109` | interactive   | yes :inferred                           | yes :113                     | 1-4 multiple-choice questions, 2-4 options each, optional preview                                                                          | nested `questions:Question[]` with `question/header/options/multiSelect` + `answers/annotations/metadata` :62-67                                                              |
| 35  | `SendUserMessage` (legacy `Brief`) | `BriefTool/BriefTool.ts:136`                      | interactive   | no                                      | gated                        | Push a markdown message to the user (Kairos brief mode)                                                                                    | `message`, `attachments?:string[]`, `status:'normal'                                                                                                                          | 'proactive'` :20-37                       |
| 36  | `Sleep`                            | `SleepTool/prompt.ts:3`                           | misc          | yes (impl elsewhere)                    | —                            | Idle wait; cheaper than `Bash(sleep)`                                                                                                      | (impl in shell loop, prompt-only file here)                                                                                                                                   |
| 37  | `RemoteTrigger`                    | `RemoteTriggerTool/RemoteTriggerTool.ts:46`       | remote        | conditional :66                         | yes :50                      | CRUD/run remote `code/triggers` via OAuth                                                                                                  | `action:'list'                                                                                                                                                                | 'get'                                     | 'create'       | 'update' | 'run'`, `trigger_id?`, `body?` :19-30 |
| 38  | `CronCreate`                       | `ScheduleCronTool/CronCreateTool.ts:56`           | scheduling    | no                                      | yes :60                      | Schedule recurring/one-shot prompt                                                                                                         | `cron:string`, `prompt`, `recurring?`, `durable?` :28-41                                                                                                                      |
| 39  | `CronDelete`                       | `ScheduleCronTool/CronDeleteTool.ts`              | scheduling    | no                                      | yes                          | Delete a cron job                                                                                                                          | `id:string`                                                                                                                                                                   |
| 40  | `CronList`                         | `ScheduleCronTool/CronListTool.ts`                | scheduling    | yes                                     | yes                          | List cron jobs                                                                                                                             | `{}`                                                                                                                                                                          |
| 41  | `StructuredOutput`                 | `SyntheticOutputTool/SyntheticOutputTool.ts:28`   | output        | yes :38                                 | —                            | Final structured-JSON output for non-interactive SDK                                                                                       | passthrough; per-call schema is Ajv-compiled from `inputJSONSchema` :130-160                                                                                                  |
| 42  | `REPL`                             | `REPLTool/primitiveTools.ts:28`                   | meta-tool     | n/a                                     | —                            | Aggregator that re-exports primitive tools (Read/Write/Edit/Glob/Grep/Bash/NotebookEdit/Agent) when REPL mode is on; not a standalone tool | n/a                                                                                                                                                                           |
| 43  | `TestingPermissionTool`            | `testing/TestingPermissionTool.tsx`               | dev-only      | n/a                                     | n/a                          | Test fixture for permission flows                                                                                                          | n/a                                                                                                                                                                           |

Helper directories: `AgentTool/built-in/` (`generalPurposeAgent`, `planAgent`, `verificationAgent`, `exploreAgent`, `claudeCodeGuideAgent`, `statuslineSetup`) — these are agent-definitions consumed by `AgentTool`, not separate tools. `shared/` carries `gitOperationTracking` and `spawnMultiAgent` cross-tool utilities.

**Total: ~41 distinct tool registrations** (treating `MCPTool` as one factory, `mcp__<server>__authenticate` as one factory pattern, the three `Cron*` as separate, and excluding the REPL aggregator + testing fixture). With per-server MCP tools layered in at runtime, the live registry can grow to several hundred.

### Comparison with our `apps/cli/src/tools.rs`

Our CLI ships **18 tool kinds** per the dispatch table in `apps/cli/src/tools.rs:174-196`:
`read_file`, `write_file`, `run_command`, `search_files`, `list_directory`, `edit_file`, `web_search`, `web_fetch`, `apply_patch`, `grep_files`, `tool_search`, `glob`, `batch`, `multiedit`, `todo_read`, `todo_write`, `ask_user`, `read_many_files`.

**Gaps vs reference (high signal):**

1. No `NotebookEdit` (Jupyter) equivalent.
2. No `Agent` / sub-agent spawn tool — we lack delegation.
3. No `TaskCreate/List/Get/Update/Output/Stop` (V2 tasks). Only flat `todo_read/todo_write` (V1 parity).
4. No `EnterPlanMode/ExitPlanMode` — we have an internal plan flag but no explicit transition tool.
5. No `EnterWorktree/ExitWorktree`, no `TeamCreate/Delete`, no `SendMessage`.
6. No first-class `MCPTool` factory + `ListMcpResources/ReadMcpResource/McpAuth`. (We import MCP elsewhere; tools are not registered through this surface.)
7. No `LSP` tool (definitions/references/hover/call hierarchy).
8. No `Skill`, no `Config`, no `Sleep`, no `Brief/SendUserMessage`, no `RemoteTrigger`, no `Cron*`, no `StructuredOutput`.
9. No `AskUserQuestion` parity — our `ask_user` is a free-text question, not a 1-4 multi-choice schema.

Our CLI extras: `apply_patch`, `multiedit`, `batch`, `read_many_files` — features that reference does not expose as standalone tools (it has them via `Bash` patches, `Edit` repeats, parallel `Bash`, and per-file `Read`).

## 2. File-System Deep Dive

### `Read` (FileReadTool) — `FileReadTool.ts`

- **Schema** (`:228-241`): `file_path` (absolute), optional `offset` (1-indexed line), `limit` (positive int), `pages` (PDF range string like `"1-5"`).
- **Output discriminated union** (`:248-331`): `text` / `image` / `notebook` / `pdf` / `parts` (extracted PDF pages dir) / `file_unchanged` (dedup stub).
- **Supported file types**:
  - Notebook (`.ipynb`) → returns cells JSON, validates token budget (`:822-862`).
  - Images (`png/jpg/jpeg/gif/webp`, set at `:188`) → token-budget compression via `readImageWithTokenBudget` (`:1097-1183`); base64 + dims metadata.
  - PDFs (`pdf`) → if `pages` set, extract via poppler; else inline up to `PDF_AT_MENTION_INLINE_THRESHOLD`; else extract pages. Throws if `!isPDFSupported()` (model gate) (`:894-1017`).
  - Text → `readFileInRange` reads only requested window (`:1019-1085`); appends `CYBER_RISK_MITIGATION_REMINDER` for non-exempt models (`:729-738`).
- **Edge cases enforced in `validateInput` (`:418-495`)**:
  - PDF range parser refusal + `PDF_MAX_PAGES_PER_READ` cap.
  - Permission deny rule via `matchingRuleForInput`.
  - UNC path short-circuit (NTLM credential leak guard) `:464-467`.
  - Binary-extension rejection (except PDF/image/SVG) `:471-482`.
  - `BLOCKED_DEVICE_PATHS` set (`/dev/zero`, `/dev/random`, `/proc/*/fd/0..2`, etc.) blocks hangs `:98-128`.
  - macOS screenshot thin-space alternate path retry `:147-159, 614-637`.
  - Similar-file suggestion + cwd suggestion on ENOENT `:638-647`.
- **Atomicity / dedup**: `readFileState` map keys mtime+offset+limit; if unchanged returns `file_unchanged` stub (`:524-572`). Killswitch: `tengu_read_dedup_killswitch`.
- **Skill discovery side effect**: `discoverSkillDirsForPaths` + `activateConditionalSkillsForPaths` fire on every read (`:577-591`).

### `Edit` (FileEditTool) — `FileEditTool.ts`

- **Schema** (`types.ts:6-19`): `file_path`, `old_string`, `new_string`, `replace_all:bool=false`.
- **Validation** (`:137-362`):
  - team-mem secret guard `:144-147`.
  - `old_string === new_string` rejected `:148-156`.
  - Permission deny check.
  - UNC short-circuit.
  - File size cap `MAX_EDIT_FILE_SIZE = 1 GiB` `:84, :187-200`.
  - **Read-before-edit invariant** `:275-287` — looks up `readFileState`, refuses if absent or partial.
  - Mtime check vs read timestamp; falls back to content compare on Windows (`:289-310`).
  - Notebook (.ipynb) gets redirected to `NotebookEditTool` `:266-273`.
  - Quote-style normalization via `findActualString` to handle smart quotes `:316-326, :471-479`.
  - `actualOldString` match-count → if >1 and `replace_all` not set, rejects `:329-342`.
  - Settings-file edit lint via `validateInputForSettingsFileEdit` `:346-358`.
- **Atomicity** (`:387-573`): mkdir parent → optional pre-edit history backup (idempotent, content-hashed) → second read inside critical section → recheck mtime → write via `writeTextContent` preserving encoding/line-endings → notify LSP `didChange` + `didSave` → notify VSCode → update `readFileState` to invalidate stale rebases.
- Output schema includes `structuredPatch` hunks + optional `gitDiff` (when `CLAUDE_CODE_REMOTE` + `tengu_quartz_lantern` enabled).

### `Write` (FileWriteTool) — `FileWriteTool.ts:94`

- **Schema** `:57-65`: `file_path` (absolute), `content`.
- Same read-before-write invariant `:198-219`. Same mtime/secret guards. Same UNC short-circuit.
- **Overwrite semantics**: full content replacement (`:300-305`) — line endings always written as `LF`, regardless of file's existing endings; comment at `:300-304` calls out that previously preserving CRLF "silently corrupted" bash scripts on Linux.
- **Directory creation**: `await getFsImplementation().mkdir(dir)` ensures parents before write `:254`.
- Distinct outputs `create` vs `update` with structured patch when updating `:359-413`.

### `Glob` — `GlobTool.ts:57`

- **Schema** `:27-36`: `pattern`, optional `path` (defaults to cwd).
- Uses `glob()` from `utils/glob.ts` (the project's wrapper). Cap `globLimits?.maxResults ?? 100` `:157`.
- **Sorting**: results from inner glob already mtime-ordered; tool then `toRelativePath`s them. Truncation flagged.
- Output: `{durationMs, numFiles, filenames, truncated}`.

### `Grep` — `GrepTool.ts:160`

- **Schema** `:33-89`: `pattern` (regex), `path?`, `glob?` (`*.js`, `*.{ts,tsx}` braces split-aware), `output_mode?` (`content|files_with_matches|count`), `-A/-B/-C/context` (only with `output_mode=content`), `-n` (line numbers, default true), `-i` (case-insensitive), `type` (rg `--type js/py/...`), `head_limit` (default 250, `0`=unlimited), `offset`, `multiline` (rg `-U --multiline-dotall`).
- **Regex flavor**: PCRE2-via-ripgrep. `pattern` starting with `-` is escaped via `-e` `:380-384`.
- **VCS exclusion**: `.git/.svn/.hg/.bzr/.jj/.sl` auto-excluded `:96-101`. Also pulls user-deny patterns + plugin orphan exclusions `:412-434`.
- **Multiline**: opt-in flag → adds `-U --multiline-dotall` to rg.
- **Output**: trims to relative paths to save tokens; sorted by mtime (file-list mode); applies `head_limit` after relativization where possible.

### `LS` / `Tree`?

No dedicated `LS` or `Tree` tool in reference. Listing is done either via `Bash(ls/tree/du)` (which is recognised as `BASH_LIST_COMMANDS` for collapsible UI rendering at `BashTool.tsx:69-72`) or via `Glob`. Our CLI's `list_directory` is an extra surface reference doesn't expose as a standalone tool.

## 3. Shell Tool

### `Bash` — `BashTool/BashTool.tsx:227-247`

- **Input schema** (`fullInputSchema`): `command:string`, `timeout?:number` (capped to `getMaxTimeoutMs()`), `description?` (with strict prose guidance about active voice, banned words "complex"/"risk"), `run_in_background?:bool`, `dangerouslyDisableSandbox?:bool`. Internal-only `_simulatedSedEdit` is _omitted_ from model-facing schema (`:249-258`) so the model can't pair an innocent command with an arbitrary file write.
- **Schema gate**: When `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` env is set, `run_in_background` is omitted at module load `:223-258`.
- **Sandbox** (`shouldUseSandbox.ts`): `SandboxManager.isSandboxingEnabled()` master gate + `dangerouslyDisableSandbox` only honoured when policy allows unsandboxed (`:130-152`). Sandbox excluded commands honour user-`settings.sandbox.excludedCommands` and growthbook `tengu_sandbox_disabled_commands` (commands + substrings). NOT a security boundary — only convenience. Compound commands are split via `splitCommand_DEPRECATED` (operators `&&`, `;`, `|`).
- **Working dir**: Tracked in `Shell.exec()` (`utils/Shell.ts`) with cwd persistence per shell session. `resetCwdIfOutsideProject` (utils.ts) keeps shell from drifting out of project root.
- **Auto-background**: `ASSISTANT_BLOCKING_BUDGET_MS = 15_000` (`BashTool.tsx:56`) — if run >15s in assistant mode and not in `DISALLOWED_AUTO_BACKGROUND_COMMANDS` (only `sleep`), auto-promote to background. `COMMON_BACKGROUND_COMMANDS` (npm, yarn, pnpm, node, python, cargo, docker, vite, etc.) preferred for auto-bg `:265`.
- **Sleep gate**: `detectBlockedSleepPattern` returns hint pointing at `Monitor` for naive `sleep N`-leading commands.
- **Output schema** (`:279-294`): `stdout`, `stderr`, `interrupted`, `isImage?`, `backgroundTaskId?`, `backgroundedByUser?`, `assistantAutoBackgrounded?`, `dangerouslyDisableSandbox?`, `returnCodeInterpretation?`, `noOutputExpected?`, `structuredContent?`, `persistedOutputPath?`, `persistedOutputSize?`. Large outputs persist to disk at `getToolResultPath()` and only a `PREVIEW_SIZE_BYTES` preview is sent inline.
- **Result rendering**: streaming progress via `BashProgress` events; `BashToolResultMessage.tsx` is the JSX renderer.

### Background-process management

- `LocalShellTask` (`tasks/LocalShellTask`) tracks foreground/background processes; `registerForeground/unregisterForeground/backgroundExistingForegroundTask` in BashTool (`:14`).
- `TaskList` (V2) shows tasks with status; `TaskOutput` reads stdout/stderr from a `TaskOutput` stream-buffer; `TaskStop` (alias `KillShell`) terminates by `task_id`.
- `AgentTool` and `BashTool` share the same task framework — `Agent(run_in_background=true)` produces tasks that `TaskList/TaskOutput/TaskStop` operate on.

### `PowerShell` — `PowerShellTool/PowerShellTool.tsx`

- Mirrors Bash with PS-specific semantics: `select-string` ↔ grep, `get-childitem` ↔ ls/find, `get-content` ↔ cat. Shares `shouldUseSandbox` import (`PowerShellTool.tsx:36`) so the sandbox decision is a single source of truth across both shell tools.
- `detectBlockedSleepPattern` recognises `Start-Sleep`, `sleep` (alias), `Start-Sleep -Seconds`/`-s` (line 189-200).

## 4. Web Tools

### `WebFetch` — `WebFetchTool.ts:66`

- **Schema** `:24-29`: `url:url`, `prompt:string`.
- **Permissions** `:104-179`: pre-approved hosts list (`isPreapprovedHost`); deny → ask → allow rule precedence keyed by `domain:<hostname>` rule content. Default: ask.
- **Redirects** `:217-249`: cross-host redirect short-circuited — returns guidance asking the model to call again with redirect URL (so each hostname re-checks permissions). Recognises 301/308/307/302.
- **Caching**: not implemented in tool itself; underlying `getURLMarkdownContent` does fetch-only with persisted-binary side-channel (`:281-285`) saving non-text bodies (PDFs etc.) to disk and emitting a path hint.
- **Pipeline**: HTML → markdown → if pre-approved+markdown+small return verbatim; else `applyPromptToMarkdown` (Haiku-summary).
- Auth guidance baked into prompt: "WebFetch WILL FAIL for authenticated or private URLs" `:188`.

### `WebSearch` — `WebSearchTool.ts:152`

- **Schema** `:25-37`: `query` (min length 2), optional `allowed_domains?:string[]`, `blocked_domains?:string[]` (mutually exclusive at `validateInput :244-251`).
- **Provider**: Anthropic server-side `web_search_20250305` via `BetaWebSearchTool20250305` `:76-84`. `max_uses: 8` is hardcoded.
- **`isEnabled`** `:168-193`: only `firstParty`, `vertex` (Claude 4.x family), or `foundry` providers; otherwise hidden — Bedrock isn't supported.
- **Streaming**: relays `query_update` and `search_results_received` progress events while consuming the SSE stream.
- Result shape: `query`, `results: (SearchResult | string)[]`, `durationSeconds` — strings are interleaved text/citation blocks; objects carry titles+URLs.

## 5. Browser / Computer-Use

The reference `tools/` dir does **not** ship a dedicated browser or computer-use tool. Browser-style operations come in via two paths:

1. **MCP**: `claude-in-chrome` is a _user-installed_ MCP server (referenced in this conversation's MCP server instructions). Its tools (`mcp__claude-in-chrome__navigate`, `tabs_context_mcp`, `read_page`, `javascript_tool`, etc.) are discovered at runtime via `MCPTool` factory. So Chrome/browser is treated as a deferred MCP integration, not a built-in tool.
2. **Computer-use**: same — `mcp__computer-use__*` (screenshot, left_click, type, scroll, key, double_click, etc.) are MCP-loaded.

The reference repo does have an internal `BrowserTool` package (referenced from the codebase memory: `packages/browser-tool/`), but that lives outside `src/tools/` — it's a Tauri/Playwright-driver shipped via a different surface.

## 6. MCP Integration

- **Entry**: `MCPTool/MCPTool.ts` is a stub-tool that gets cloned per real MCP tool inside `src/services/mcp/mcpClient.ts` (the comments at lines 30-50 say "Overridden in mcpClient.ts"). The stub keeps `isMcp:true`, `inputSchema = z.object({}).passthrough()`, `outputSchema = z.string()`, and a `passthrough` permission default.
- **Naming convention** (used everywhere — see `ToolSearchTool.ts:139-145`): `mcp__<serverName>__<actionName>`. Underscore-separated. Single underscores inside server/action names are normalized to spaces during search-relevance scoring.
- **Auth flow**: `McpAuthTool/McpAuthTool.ts:49` — `createMcpAuthTool(serverName, config)` returns a Tool whose `name = mcp__<server>__authenticate`. On call it kicks `performMCPOAuthFlow(skipBrowserOpen:true)`, returns the auth URL inside the tool result, and a background promise reconnects + swaps real tools into `appState.mcp.tools` when the OAuth callback fires.
- **Resource APIs**: `ListMcpResourcesTool` walks all connected clients (or a server filter); `ReadMcpResourceTool` does an actual `resources/read` request. Binary blobs are decoded to disk via `persistBinaryContent` and replaced with a text-summary placeholder pointing at the saved path — this prevents base64 from being stringified into context (`ReadMcpResourceTool.ts:104-138`).
- **Dynamic loading**: `ToolSearchTool` is the gateway — until a deferred MCP tool is loaded via `select:mcp__server__action`, the model cannot call it. Client-side cache is invalidated via `getDeferredToolsCacheKey` whenever the deferred set changes (`:91-100`).

## 7. Memory / Task / Agent / Plan Tools

- **Memory**: There's no dedicated `MemoryRead`/`MemoryWrite` tool in `tools/`. Memory is implemented via the _file-system tools_ + memdir conventions (`utils/memoryFileDetection.ts:isAutoMemFile`, `memdir/memoryAge.ts:memoryFreshnessNote`). `FileReadTool` injects a "file freshness" note for auto-memory files at `:749-753`. The Skills system (`SkillTool`) consults `~/.claude/skills/...`. Updating skills/memory uses `Edit`/`Write`. Hence: memdir is a _protocol_ over `Read/Edit/Write`, not its own tool.

- **TodoWrite (V1)** — `TodoWriteTool.ts:31`. Deferred tool. Single param `todos: TodoListSchema`. Stores under `appState.todos[agentId or sessionId]`. Includes a "verification nudge" when 3+ todos all complete and none mention `verif` (`:77-86`). Tool result encourages continuing to use the todo list.

- **TaskCreate/List/Get/Update/Output/Stop (V2)** — these are gated by `isTodoV2Enabled()`. They model tasks as filesystem-backed records under a task-list ID per session/team. `TaskCreate` runs hook `executeTaskCreatedHooks` and rolls back on blocking error (`TaskCreateTool.ts:91-113`). `TaskUpdate` supports `status:'deleted'` as a terminal action and runs `executeTaskCompletedHooks` on completion (`:212-269`). It auto-assigns `owner` to active teammate when transitioning to `in_progress` without one (`:184-199`). Same verification nudge shows when all 3+ tasks complete with no verif step (`:332-349`).

- **Agent / Task / Dispatch** — `AgentTool/AgentTool.tsx:196` is the single sub-agent spawn surface. Modes:
  - **Sync sub-agent**: default; runs in-process and returns final answer.
  - **Async** (`run_in_background:true`): becomes a `LocalAgentTask` with `status:async_launched`, returns `outputFile` path. Auto-background can fire after `getAutoBackgroundMs() = 120_000` if `CLAUDE_AUTO_BACKGROUND_TASKS` env or `tengu_auto_background_agents` GB is on.
  - **Teammate** (`team_name + name` set): calls `spawnTeammate` (multi-agent swarm).
  - **Worktree isolation**: `isolation:'worktree'` creates a temporary git worktree.
  - **Remote isolation**: `isolation:'remote'` (Anthropic-internal) launches CCR-remote; always background.
  - **Fork sub-agent**: when `subagent_type` omitted and `isForkSubagentEnabled()` is on, runs as `FORK_AGENT` — guarded against recursive forks.
  - Built-in agents: `built-in/{generalPurposeAgent, planAgent, verificationAgent, exploreAgent, claudeCodeGuideAgent, statuslineSetup}`.

- **Plan / update_plan / ExitPlanMode** — `EnterPlanModeTool.ts:36` flips `toolPermissionContext.mode='plan'` (`:81-95`). `ExitPlanModeV2Tool.ts:147` writes `plan` to disk via `writeFile` then transitions back to `prePlanMode` (or `default`); for teammates with `isPlanModeRequired()`, sends `plan_approval_request` to mailbox and awaits leader. Both tools are disabled when `--channels` is active (`:60-65`, `:171-176`).

## 8. Validation & Permissions

- **Schema**: every tool uses **Zod v4** (`zod/v4`) wrapped in `lazySchema()` (`utils/lazySchema.ts`) for cheap cold-start. All schemas are `z.strictObject` (rejects extra keys) except MCP/StructuredOutput which deliberately use `passthrough` for dynamic shapes. A handful sit on top of helpers `semanticBoolean`/`semanticNumber` that pre-process model-friendly types ("true"/`true`/`1`).
- **Validation entry-points**: `validateInput()` runs first (sync or async; can return `{result:false, message, errorCode, behavior?:'ask', meta?}`), then `checkPermissions()` returns a `PermissionDecision` (`allow`/`deny`/`ask`/`passthrough`). `backfillObservableInput` normalises paths (`expandPath`) before hooks see them so allowlists can't be bypassed via `~` (`FileReadTool.ts:388-394`, `FileEditTool.ts:115-121`, `FileWriteTool.ts:125-131`).
- **Permission stores**: filesystem rules via `checkReadPermissionForTool` / `checkWritePermissionForTool` (`utils/permissions/filesystem.ts`); generic content-based rules via `getRuleByContentsForTool` (used by `WebFetchTool.ts:127`). Three precedence tiers: **deny** > **ask** > **allow**, all keyed per-tool.
- **Rule kinds**: `domain:<host>` (web), bash-pattern matching (`bashPermissionRule` with prefix/exact/wildcard), wildcard path patterns (`matchWildcardPattern`), agent-name allowlists for `Agent(name)`.
- **Always-allow lists** sit in `appState.toolPermissionContext.alwaysAllowRules` (set via the user pressing "Yes, always" in the permission UI). `applyPermissionUpdate` mutates it (`utils/permissions/PermissionUpdate.ts`).
- **Mode metadata**: `isReadOnly`, `isConcurrencySafe`, `isOpenWorld` are tool-level booleans surfaced through Tool defaults at `Tool.ts` (e.g. default `isReadOnly=false`). `isMcp:true` and `isLsp:true` mark the bridge categories.
- **Sandboxed marker**: not a per-tool flag. It lives on the call: `Bash`/`PowerShell` consult `shouldUseSandbox(input)` per invocation; the rest of the tools never enter the sandbox runtime.

## 9. Tool Result Rendering

- **Per-tool components**: every tool exports `renderToolUseMessage`, `renderToolResultMessage`, `renderToolUseProgressMessage`, `renderToolUseRejectedMessage`, `renderToolUseErrorMessage` from its own `UI.tsx`. So yes — each tool emits a _custom_ JSX result block. Examples: `BashTool/BashToolResultMessage.tsx`, `AgentTool/UI.tsx` (groups multiple sub-agent invocations with shared color), `FileEditTool/UI.tsx` shows hunk diffs, `GlobTool/UI.tsx` reuses `GrepTool/UI.tsx`'s `SearchResultSummary` (per `extractSearchText` comment at `GlobTool.ts:151`).
- **Streaming**: tools that produce incremental output set `Progress = ...` and accept `onProgress` in `call()`. Examples: `BashTool` (BashProgress), `AgentTool` (AgentToolProgress + ShellProgress forwarded from sub-shell), `WebSearchTool` (WebSearchProgress with `query_update`/`search_results_received`), `MCPTool` (MCPProgress), `SkillTool`, `TaskOutputTool`. `renderToolUseProgressMessage` consumes the latest progress payload.
- **Result schemas**: typed via Zod `outputSchema` per tool. The framework calls `mapToolResultToToolResultBlockParam(data, toolUseID)` to convert the typed output into Anthropic API `ToolResultBlockParam` (text or content-array). Large outputs persist to disk and only a preview is inlined (`BashTool` → `buildLargeToolResultMessage`).
- **Rejected/error rendering**: each tool also renders `renderToolUseRejectedMessage` (user denied permission) and `renderToolUseErrorMessage` (validateInput or call threw) so error UX is per-tool.

## 10. Cross-References

- **`services/`**:
  - `services/lsp/manager.ts`, `LSPDiagnosticRegistry.ts` — used by `LSPTool` and side-effect-notified by `FileEditTool`/`FileWriteTool` (`didChange/didSave`).
  - `services/mcp/{client.ts, mcpStringUtils.ts, auth.ts, vscodeSdkMcp.ts}` — backbone of the four MCP tools.
  - `services/lsp/manager.ts:notifyVscodeFileUpdated` invoked from `FileEditTool` and `FileWriteTool` after writes.
  - `services/AgentSummary/agentSummary.ts` — used by `AgentTool` for sub-agent SDK summary streaming.
  - `services/api/claude.ts:queryModelWithStreaming` — used by `WebSearchTool` for the relayed Claude call.
  - `services/teamMemorySync/teamMemSecretGuard.ts` — `checkTeamMemSecrets` blocks both `Edit` and `Write`.
  - `services/policyLimits/index.ts:isPolicyAllowed` — gates `RemoteTriggerTool`.
  - `services/skillSearch/*` — used (gated by `EXPERIMENTAL_SKILL_SEARCH`) inside `SkillTool`.
  - `services/diagnosticTracking.ts` — `diagnosticTracker.beforeFileEdited` runs for `Edit` and `Write`.
- **`bridge/`**:
  - `bridge/replBridgeHandle.ts:getReplBridgeHandle` — used by `SendMessageTool` (cross-process bridge for `bridge:` recipients).
- **`memdir/`**:
  - `memdir/memoryAge.ts:memoryFreshnessNote` — invoked by `FileReadTool` to prefix auto-mem files with a stale-warning note (`:749-753`).
- **`remote/`** doesn't exist in `src/`; the equivalents are:
  - `tasks/RemoteAgentTask/RemoteAgentTask.ts` — used by `AgentTool` when `isolation:'remote'`.
  - `services/oauth/client.ts` + `utils/auth.ts` — used by `RemoteTriggerTool`.
- **`tasks/`** is the runtime substrate for _all_ long-running tools:
  - `LocalShellTask/LocalShellTask.ts` — used by `BashTool`, `PowerShellTool`.
  - `LocalAgentTask/LocalAgentTask.ts` — used by `AgentTool` (sync + async).
  - `RemoteAgentTask/RemoteAgentTask.ts` — `AgentTool` remote isolation, `RemoteTriggerTool`.
  - `stopTask.ts` — used by `TaskStopTool`.

## 11. Open Questions

1. **Is `Skill` worth porting?** It depends on a skills directory protocol (`~/.claude/skills/...`) plus `EXPERIMENTAL_SKILL_SEARCH` gate. Our roadmap already calls out a Skills system in `packages/skills/`; the question is whether to expose it as a _tool_ (so the model can invoke skills mid-conversation) vs. only as system-prompt-time injection. The reference treats it as a tool that forks a sub-agent — that's a non-trivial architectural decision.
2. **MCPTool factory pattern in Rust.** The reference mints one `Tool` per MCP-server-action at server-connect time (in `mcpClient.ts`). Our CLI has MCP infrastructure (`packages/mcp/`) but does not register one tool per MCP action through the registry surface in `apps/cli/src/tools.rs`. How does our model see and call MCP tools today, and does it have to go through `tool_search`? File hadn't surfaced in this scan.
3. **Plan-mode tool surface vs. flag.** Reference exposes `EnterPlanMode/ExitPlanMode` as tools the model calls explicitly with permission-prompted allow-lists. Our CLI seems to handle plan mode via `--plan`/policy. Open: do we want the model to be able to _enter plan mode mid-conversation_ on its own, or is that always user-initiated?
4. **Background-task framework.** The reference Bash auto-backgrounds at 15s in assistant mode; we'd need parity in Rust with `LocalShellTask`-equivalent. Tied to whether we ship the V2 task tools (`TaskCreate/List/Get/Update/Output/Stop`).
5. **AskUserQuestion vs. our `ask_user`.** Reference enforces 1-4 multi-choice schema with previews and annotations; our `ask_user` likely takes a free-text question. Worth upgrading the schema for richer interaction; Brief/SendUserMessage is also missing.
6. **Cyber-risk reminder gate.** Reference appends a `system-reminder` to file contents for non-exempt models (`FileReadTool.ts:729-738`) — a soft-policy nudge. Does our adapter layer have anything analogous? If we ship cross-provider, this is a Claude-only nudge that might surface as Anthropic-only behaviour.
7. **PDF/image/notebook coverage.** Reference's `Read` natively handles all four. Our `read_file` semantics weren't visible — does it short-circuit on `.ipynb`, image extensions, or PDFs and route to specialised paths? If not, we have a major gap for any user pasting an iPython notebook.
8. **LSP integration story.** Reference has a fully-fledged LSP tool with 9 operations (definition, references, hover, document symbols, workspace symbols, implementation, prepareCallHierarchy, incomingCalls, outgoingCalls). We do not. Question: do we integrate via the desktop's LSP service or via an in-CLI server manager?
9. **`ToolSearch` deferred-tool model.** Reference defers all MCP tools (and a subset of others marked `shouldDefer:true`) and forces the model to load via `ToolSearch select:` — to keep the system prompt small. Our CLI exposes 18 tools always-on. As we scale into 50+ tools (skills + MCP), do we adopt the same deferred + search pattern?

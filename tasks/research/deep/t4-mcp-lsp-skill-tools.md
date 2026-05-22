# T4 — MCP + LSP + Skill + Meta Tools (deep dive)

> Scope: 36 source files across `~/Desktop/reference/src/tools/{MCPTool,ListMcpResourcesTool,ReadMcpResourceTool,McpAuthTool,LSPTool,SkillTool,ToolSearchTool,ConfigTool,AskUserQuestionTool,BriefTool}/`. Cited file:line throughout. Phase-1 implementation reference for the AGI Workforce v1 tool surface.

---

## 0. Reading the Tool framework

Every tool in scope is built via `buildTool(...)` from `src/Tool.ts` — a single declarative object satisfying `ToolDef<InputSchema, Output, Progress?>`. Common keys are: `name`, `searchHint` (optional, ranks higher than description in ToolSearch), `inputSchema`, `outputSchema`, `description()`, `prompt()`, `call()`, `isEnabled()`, `isReadOnly()`, `isConcurrencySafe()`, `toAutoClassifierInput()`, `checkPermissions()`, `validateInput()`, `mapToolResultToToolResultBlockParam()`, `userFacingName()`, plus a render quartet (`renderToolUseMessage`, `renderToolUseProgressMessage`, `renderToolResultMessage`, `renderToolUseRejectedMessage`/`renderToolUseErrorMessage`). Three flags drive the deferred-loading machinery: `shouldDefer: true` (omit schema until ToolSearch fetches it), `isMcp: true` (always deferred — see §1), and `alwaysLoad: true` (force into the initial prompt regardless). The tool registry is `src/Tool.ts:findToolByName(tools, name)` (used by `ToolSearchTool.ts:11` for `select:` lookup). Permission gates return `{ behavior: 'allow' | 'deny' | 'ask' | 'passthrough' }` from `checkPermissions()`.

---

## 1. MCPTool — the shape-shifting MCP wrapper

`MCPTool` (`MCPTool.ts:27-77`) is a **factory template, not a real tool**. It is registered once with placeholder `name: 'mcp'`, empty `description`/`prompt`, `isMcp: true` (`MCPTool.ts:28`), `isOpenWorld: false`, and a `call()` stub that returns empty (`MCPTool.ts:51-55`). The comment at `MCPTool.ts:29, 33, 36, 40, 50, 63` makes the contract explicit: every concrete field is **overridden in `mcpClient.ts`** when an MCP server connects.

**Naming convention.** The wrapper helper `buildMcpToolName(serverName, toolName)` (used at `McpAuthTool.ts:9-12` and produces strings like `mcp__<server>__<action>`) is the namespace pattern. `getMcpPrefix(serverName)` (`McpAuthTool.ts:11`) yields `mcp__<server>__` for prefix-based replacement of a server's tools when re-auth happens (`McpAuthTool.ts:140-161`).

**Result handling.** `inputSchema` is `z.object({}).passthrough()` (`MCPTool.ts:14`) — accept any JSON the MCP server defines. `outputSchema` is a string (`MCPTool.ts:17-19`); the per-server `mapToolResultToToolResultBlockParam` (`MCPTool.ts:70-76`) wraps content into a standard `tool_result` block. `maxResultSizeChars: 100_000` cap (`MCPTool.ts:35`).

**Output collapsing for chat UI.** `MCPTool/classifyForCollapse.ts` is a 605-line allowlist that classifies any incoming tool name as `{ isSearch, isRead }` for UI collapsing (`classifyForCollapse.ts:595-604`). Names normalize via camelCase→snake_case + dash→underscore (`classifyForCollapse.ts:588-593`). The lists cover Slack, GitHub, Linear, Datadog, Sentry, Notion, Gmail, GDrive, GCal, Atlassian/Jira, Asana, Filesystem, MCP-Memory, Postgres/SQLite, Git, Grafana, PagerDuty, Supabase, Stripe, PubMed, BigQuery, Firecrawl, Exa, Perplexity, Tavily, Obsidian, Figma, Playwright, Puppeteer, MongoDB, Neo4j, Elasticsearch, Airtable, Todoist, AWS, Kubernetes — ~140 SEARCH names + ~250 READ names. Unknown tools never collapse (`classifyForCollapse.ts:11`, conservative).

**Result rendering** (`MCPTool/UI.tsx`, 402 lines). Three strategies in `MCPTextOutput` (`UI.tsx:159-251`): (1) detect `{"messages":"line1\nline2..."}` JSON-wrapped dominant-text payloads and unwrap with `OutputLine`, (2) flatten small JSON objects (≤12 keys, ≤5KB) into aligned `key: value` pairs, (3) fall through to `OutputLine`. Threshold: `MCP_OUTPUT_WARNING_THRESHOLD_TOKENS = 10_000` (`UI.tsx:21`) prepends a "Large MCP response" warning. `MAX_INPUT_VALUE_CHARS = 80` (`UI.tsx:26`) truncates inline arg display in non-verbose mode. Slack `send_message` calls get a special compact "Sent a message to #channel" rendering (`UI.tsx:99-107`).

**Progress.** `renderToolUseProgressMessage` (`UI.tsx:57-89`) consumes `MCPProgress` events with `{progress, total, progressMessage}` and renders an Ink `ProgressBar` when `total > 0`, else a spinner. MCP servers stream progress via the SDK's standard `notifications/progress` mechanism.

**Permission category.** Default `passthrough` (`MCPTool.ts:56-61`); the per-tool override decides via the host's MCP permission rules (the `mcp__<server>__<tool>` rule names in settings).

---

## 2. ListMcpResourcesTool

`ListMcpResourcesTool.ts:51` constant `LIST_MCP_RESOURCES_TOOL_NAME = 'ListMcpResourcesTool'` (`prompt.ts:1`). Marked `shouldDefer: true` (`ListMcpResourcesTool.ts:50`) so it loads via ToolSearch, `isReadOnly: true` and `isConcurrencySafe: true` (`ListMcpResourcesTool.ts:41-46`).

**Input schema.** `{ server?: string }` — optional name filter (`ListMcpResourcesTool.ts:15-22`). **Output schema.** `Array<{ uri, name, mimeType?, description?, server }>` (`ListMcpResourcesTool.ts:25-35`). The per-resource `server` field is added by this tool, not present in raw MCP `resources/list`.

**Behavior** (`ListMcpResourcesTool.ts:66-101`): iterates `mcpClients`, calls `ensureConnectedClient` then `fetchResourcesForClient` (LRU-cached per server, invalidated on `onclose` and `resources/list_changed` per the comment at `:79-82`). Per-server failures are isolated (`:90-93`) — one bad server doesn't sink the rest. Final `data` is the flattened array.

**Result block.** When no resources, returns explicit `"No resources found. MCP servers may still provide tools..."` to prevent the model from inferring brokenness (`ListMcpResourcesTool.ts:108-115`).

**Render.** `prompt.ts` has both `DESCRIPTION` and `PROMPT` (slight wording variants — DESCRIPTION includes usage examples). `UI.tsx:9-13` renders `Read MCP resources from server "X"` or `List all MCP resources`. JSON pretty-printed via `OutputLine` for the result.

---

## 3. ReadMcpResourceTool

`ReadMcpResourceTool.ts:60` name `'ReadMcpResourceTool'`. Same defer/readonly/concurrency profile as List. Input: `{ server: string, uri: string }` (required both, `ReadMcpResourceTool.ts:23-27`). Output: `{ contents: Array<{ uri, mimeType?, text?, blobSavedTo? }> }` (`ReadMcpResourceTool.ts:30-44`).

**Notable architectural choice — binary blob persistence.** The MCP `ReadResourceResult` may return `{ blob: base64 }`. `ReadMcpResourceTool.ts:106-138` intercepts every blob: decodes base64, calls `persistBinaryContent(buffer, mimeType, persistId)` to write raw bytes to disk with a mime-derived extension, then replaces the blob in the response with `{ blobSavedTo: filepath, text: getBinaryBlobSavedMessage(...) }`. Without this, the base64 would be stringified into the agent context (token blow-up + non-grokkable). `persistId = "mcp-resource-${Date.now()}-${i}-${random6}"` (`ReadMcpResourceTool.ts:114`).

**Capability gates.** `ReadMcpResourceTool.ts:90-92` rejects with `"Server X does not support resources"` if `client.capabilities.resources` is unset — matches the MCP capabilities handshake. Connection-required check at `:86-88`.

---

## 4. McpAuthTool — pseudo-tool for unauthenticated servers

This is **only ~216 LOC** but architecturally critical (`McpAuthTool.ts:1-216`). It synthesizes a fake tool whenever an MCP server is registered but not authenticated (HTTP 401 / `UnauthorizedError`). Registration happens via `createMcpAuthTool(serverName, config)` (`:49`).

**Tool name.** `buildMcpToolName(serverName, 'authenticate')` → `mcp__<server>__authenticate` (`:63`). Description tells the model this server is "installed but requires authentication" and instructs it to call this tool to start OAuth (`:57-60`).

**OAuth flow.** Detects transport: `'claudeai-proxy'` returns `unsupported` with instruction to use `/mcp` (`:89-95`). Other-than-sse/http also unsupported (`:101-108`). For sse|http, kicks off `performMCPOAuthFlow(server, config, urlCallback, abortSignal, { skipBrowserOpen: true })` (`:126-132`). It returns the URL **immediately** via `Promise.race(urlPromise, oauthPromise.then(()=>null))` (`:174-181`). Background continuation waits for the OAuth callback, then `clearMcpAuthCache()` + `reconnectMcpServerImpl(server, config)`, and via `setAppState` swaps the pseudo-tool out and the real tools in using prefix-based replacement against `getMcpPrefix(serverName)` (`:140-161`). The whole pseudo-tool removes itself once auth completes — exactly the pattern AGI Workforce should mirror.

**Permission.** `checkPermissions` always returns `allow` (`:82-84`) — the user already approved by clicking "Add MCP server".

**Output.** `{ status: 'auth_url' | 'unsupported' | 'error', message, authUrl? }` (`:26-30`). `mapToolResult...` flattens `data.message` into the tool_result content block (`:207-213`).

---

## 5. LSPTool — the killer feature we don't have

`LSPTool.ts` (861 lines), **`LSP_TOOL_NAME = 'LSP'`** (`prompt.ts:1`). Wraps an LSP server manager (`services/lsp/manager.ts`, not in scope) with **9 operations** behind a single tool, dispatching by an `operation` discriminator. `searchHint: 'code intelligence (definitions, references, symbols, hover)'` (`LSPTool.ts:129`). `isLsp: true`, `isReadOnly: true`, `isConcurrencySafe: true`, `shouldDefer: true`, `isEnabled: () => isLspConnected()` (`LSPTool.ts:131-151`).

### 5.1 The 9 operations and LSP method mapping

From `getMethodAndParams` (`LSPTool.ts:427-513`):

| Operation              | LSP method                                      | Params                                                            |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `goToDefinition`       | `textDocument/definition`                       | `{textDocument:{uri},position}`                                   |
| `findReferences`       | `textDocument/references`                       | `{textDocument:{uri},position,context:{includeDeclaration:true}}` |
| `hover`                | `textDocument/hover`                            | `{textDocument:{uri},position}`                                   |
| `documentSymbol`       | `textDocument/documentSymbol`                   | `{textDocument:{uri}}`                                            |
| `workspaceSymbol`      | `workspace/symbol`                              | `{query:''}` (empty = all)                                        |
| `goToImplementation`   | `textDocument/implementation`                   | `{textDocument:{uri},position}`                                   |
| `prepareCallHierarchy` | `textDocument/prepareCallHierarchy`             | `{textDocument:{uri},position}`                                   |
| `incomingCalls`        | (1) prepare → (2) `callHierarchy/incomingCalls` | `{item: callItems[0]}`                                            |
| `outgoingCalls`        | (1) prepare → (2) `callHierarchy/outgoingCalls` | `{item: callItems[0]}`                                            |

Position is converted from 1-based (user-friendly) to 0-based (LSP wire) at `LSPTool.ts:432-436`. Two-step `incomingCalls`/`outgoingCalls` orchestrated at `LSPTool.ts:302-334`.

### 5.2 Schemas

`LSPTool.ts:59-86` declares a flat `inputSchema` with all four fields (operation/filePath/line/character) — this is the wire schema. `schemas.ts:8-191` declares a **discriminated union** of 9 strict objects (one per operation, all currently with the same shape, but explicit so future per-op fields are typesafe). `validateInput` (`LSPTool.ts:155-209`) does a discriminated-union parse first, then `fs.stat` check (`is regular file`, ENOENT → errorCode 1, EACCES etc → errorCode 4, non-file → errorCode 2). UNC/Windows paths bypass stat to avoid NTLM credential leaks (`LSPTool.ts:170-173`) — security hardening worth porting.

### 5.3 Output formatting

`LSPTool.ts:89-122` — `{operation, result: string, filePath, resultCount?, fileCount?}`. The `result` is rendered text (not raw JSON) because LSP results are heterogeneous; `formatters.ts` (430+ lines) has 8 specialized formatters covering `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls` — paths grouped by file, locations 1-based, relative paths preferred when shorter, Windows separator normalization (`formatters.ts:24-72`). `goToDefinition` and `goToImplementation` share the same formatter (`LSPTool.ts:780`).

### 5.4 .gitignore filtering

`filterGitIgnoredLocations` (`LSPTool.ts:556-611`) batches paths through `git check-ignore` (50 per call, 5s timeout) and drops any URI that's gitignored. Applied to `findReferences`, `goToDefinition`, `goToImplementation`, `workspaceSymbol`. Without this, `findReferences` on a popular symbol returns hundreds of `node_modules/` hits.

### 5.5 File-open lifecycle

LSP servers usually require `textDocument/didOpen` before any operation. `LSPTool.ts:261-278` checks `manager.isFileOpen(absolutePath)`, otherwise opens with size guard `MAX_LSP_FILE_SIZE_BYTES = 10_000_000` (`LSPTool.ts:53`) — files >10MB return a graceful "File too large" instead of stalling the LSP process.

### 5.6 Symbol-context-at-position

`symbolContext.ts:21-90` extracts the word at a `(line, character)` position by reading **only the first 64KB** of the file synchronously (`MAX_READ_BYTES = 64 * 1024`). Regex covers normal identifiers + Rust lifetimes (`'a`) + Rust macros (`name!`) + operators. Used by `renderToolUseMessage` to show `LSP goToDefinition: foo at file.ts:12:5` instead of raw position numbers. Truncated to 30 chars.

### 5.7 Permission

`checkReadPermissionForTool` (`LSPTool.ts:210-217`) — same gate as `Read` tool. LSP is purely read access.

### 5.8 UI

`LSPTool/UI.tsx` (227 lines). `OPERATION_LABELS` (`UI.tsx:14-56`) drives plurals — `findReferences` → "1 reference"/"5 references". Result summary collapsible via `CtrlOToExpand`. Progress is null (LSP responses are fast).

---

## 6. SkillTool — model-driven slash-command invocation

`SKILL_TOOL_NAME = 'Skill'` (`constants.ts:1`). `searchHint: 'invoke a slash-command skill'` (`SkillTool.ts:333`). Inline-loaded (not deferred — see §10).

### 6.1 Args schema

```ts
{ skill: string, args?: string }
```

Defined at `SkillTool.ts:291-298`. `skill` is the bare skill name ("commit", "review-pr", "ms-office-suite:pdf"), optional leading slash tolerated (`SkillTool.ts:367-372`). Output schema is a `z.union` of two shapes: `inlineOutputSchema` (`SkillTool.ts:303-312`) and `forkedOutputSchema` (`SkillTool.ts:315-323`) — see §6.4.

### 6.2 The system-reminder skill list

This is the master discovery mechanism. `SkillTool/prompt.ts:formatCommandsWithinBudget()` (`prompt.ts:70-171`) emits a `- name: description - whenToUse` line per skill, total budgeted at **1% of context window** (`SKILL_BUDGET_CONTEXT_PERCENT = 0.01` × `CHARS_PER_TOKEN = 4` → default 8KB, `prompt.ts:21-23`). Per-entry hard cap `MAX_LISTING_DESC_CHARS = 250` (`prompt.ts:29`). Bundled skills are never truncated; non-bundled get description-trimmed first, then names-only as last resort. `formatCommandsWithinBudget` is invoked from the system prompt building path (not in scope), and the result appears as a `<system-reminder>` block at session start ("The following skills are available...") — exactly the format we saw in our own conversation.

`getPrompt` (`prompt.ts:173-196`) is the tool prompt itself: "Execute a skill within the main conversation" + "Available skills are listed in system-reminder messages" + the BLOCKING REQUIREMENT to invoke before responding. **Mirrors verbatim the behavior the agent SDK demands of us.**

### 6.3 Invocation flow

`SkillTool.ts:580-841` — happy-path:

1. Strip leading `/` (`:597-599`).
2. Branch for `_canonical_<slug>` remote skills (ant-only experimental — see §6.5).
3. `getAllCommands(context)` merges local + bundled + plugin skills + MCP-prompt skills (`SkillTool.ts:81-94`); MCP plain prompts are filtered out — only those with `loadedFrom === 'mcp'` and `type === 'prompt'` register as skills. Skills win on conflict.
4. `recordSkillUsage` (ranking telemetry, `:619`).
5. Branch for `command.context === 'fork'` → `executeForkedSkill` (§6.4).
6. Otherwise: `processPromptSlashCommand(commandName, args, commands, context)` expands `!command` substitutions and `$ARGUMENTS` interpolation (`:635-643`). The expanded `messages` are tagged with `toolUseID` and returned via `newMessages` (`:735-755`) — they get injected as if the user typed them.
7. Returns a `contextModifier` closure (`:775-839`) that on each subsequent call augments `toolPermissionContext.alwaysAllowRules.command` with the skill's `allowedTools` (so a `commit` skill that needs `Bash(git)` doesn't re-prompt mid-execution), and overrides `mainLoopModel` if the skill specifies one (preserving any `[1m]` long-context suffix via `resolveSkillModelOverride`).

### 6.4 Forked execution mode

If a skill's frontmatter has `context: 'fork'`, `executeForkedSkill` (`SkillTool.ts:122-289`) runs the skill in a sub-agent with its own context window (via `runAgent` from `AgentTool/runAgent.js`, `SkillTool.ts:223-261`). `agentDefinition` carries the skill's `effort` setting if set. Progress is streamed back as `{type: 'skill_progress', message, prompt, agentId}` so the parent's progress UI animates. On completion `extractResultText` summarizes and the result is returned with `status: 'forked'`.

### 6.5 Remote canonical skills (experimental, ant-only)

`feature('EXPERIMENTAL_SKILL_SEARCH') && process.env.USER_TYPE === 'ant'` (`SkillTool.ts:378-380`). Skill names like `_canonical_<slug>` are intercepted before the local registry and loaded from AKI/GCS/HTTPS/S3 via `loadRemoteSkill(slug, url)` (`SkillTool.ts:991`). Cache hit/miss + latency telemetered (`:1014-1022`). The SKILL.md frontmatter is stripped (`parseFrontmatter`), `${CLAUDE_SKILL_DIR}` and `${CLAUDE_SESSION_ID}` are interpolated (`:1077-1081`), and the result is registered with `addInvokedSkill` so it survives auto-compaction. Then injected as a **meta user message** wrapping the SKILL.md content (`:1101-1107`). Remote skills are declarative-only — no `!command`/`$ARGUMENTS` expansion.

### 6.6 Permissions

`checkPermissions` (`SkillTool.ts:432-578`) checks deny rules first (rule content matches via exact or `prefix:*`), then allow rules, then auto-allows skills with only "safe properties" (an allowlist of 30 keys at `SkillTool.ts:875-908` — anything else triggers ask). The fallback offer suggests both `commandName` and `commandName:*` rule additions to `localSettings`, so a "Always allow review-pr with any args" choice writes the right rule.

### 6.7 Telemetry

The skill telemetry surface is heavy (`SkillTool.ts:152-203, 675-726, 1029-1057`). Every invocation logs `tengu_skill_tool_invocation` with `command_name`, `_PROTO_skill_name` (privileged BQ column), `execution_context: 'inline'|'fork'|'remote'`, `invocation_trigger: 'claude-proactive'|'nested-skill'`, `query_depth`, `parent_agent_id`, `was_discovered`, plus plugin/marketplace fields if applicable. **The presence of `nested-skill` invocation_trigger means skills can call other skills** — important for "skill marketplaces" composition.

### 6.8 UI

`SkillTool/UI.tsx:20-46` shows "Successfully loaded skill" with optional tool/model annotation via `Byline`. Rejected/error states render the same progress-message stack so the user sees what executed before the rejection.

---

## 7. ToolSearchTool — deferred-loading dispatcher

`TOOL_SEARCH_TOOL_NAME = 'ToolSearch'` (`constants.ts:1`). The most architecturally important tool we lack. **It is what enables 200+ tool ecosystems without poisoning every prompt.**

### 7.1 What gets deferred (`isDeferredTool`, `prompt.ts:62-108`)

In order:

1. `tool.alwaysLoad === true` → never deferred (MCP tools opt out via `_meta['anthropic/alwaysLoad']`).
2. `tool.isMcp === true` → always deferred.
3. ToolSearch itself → never deferred (otherwise infinite loop).
4. AgentTool with `feature('FORK_SUBAGENT')` → never deferred.
5. BriefTool when KAIROS active → never deferred (it's the primary user-output channel).
6. SendUserFileTool when KAIROS + replBridge → never deferred.
7. Otherwise: `tool.shouldDefer === true`.

Tools in scope marked `shouldDefer: true`: `ListMcpResourcesTool`, `ReadMcpResourceTool`, `LSPTool`, `ConfigTool`, `AskUserQuestionTool`. (SkillTool is **not** deferred — model needs the skill list at session start.)

### 7.2 Initial vs fetched

At startup, deferred tools appear by name only inside a `<system-reminder>` block (`prompt.ts:35-42`, the variant is gated by `tengu_glacier_2xr` GrowthBook flag — pre-gate behavior was a separate `<available-deferred-tools>` block). Until ToolSearch fetches the schema, **the model knows the tool exists but cannot call it** — there's no parameter schema. The host detects an attempted call by name and rejects.

### 7.3 The `select:` direct-fetch syntax

Input schema `{ query: string, max_results?: number=5 }` (`ToolSearchTool.ts:21-34`). The query parser (`ToolSearchTool.ts:363-406`):

- `select:Read,Edit,Grep` → comma-split, find each by exact name, return found.
- Missing names are reported via `logForDebugging`; partial select still returns found ones.
- `select:` matches against `deferredTools` first, falls back to the full `tools` (so selecting an already-loaded tool is a harmless no-op — handles model retries).

### 7.4 Keyword search scoring

`searchToolsWithKeywords` (`ToolSearchTool.ts:186-302`):

1. **Fast path** — bare-name exact match wins immediately.
2. **MCP prefix** — `mcp__server` matches all that-server tools by prefix.
3. Split into **required** (`+slack`) and **optional** terms (`ToolSearchTool.ts:218-229`). Required terms must match in name OR description OR searchHint to be a candidate.
4. Score per tool per term:
   - Exact part match in name → 12 (MCP) / 10 (regular)
   - Substring part match → 6 / 5
   - Full-name fallback → 3
   - `searchHint` regex match → 4 (curated phrase, more signal than auto-generated description)
   - Description regex match → 2

Word-boundary regexes pre-compiled per search (`ToolSearchTool.ts:167-175`) so we don't re-compile per tool. Tool descriptions are memoized via lodash `memoize` keyed on tool name (`ToolSearchTool.ts:65-86`); cache is invalidated when the deferred-tool set changes (e.g., MCP server connect/disconnect, `ToolSearchTool.ts:91-99`).

Output is **top-N tool names sorted by score**. `parseToolName` (`ToolSearchTool.ts:132-161`) splits MCP `mcp__server__action` into `[server, action]` parts plus underscore-split, and CamelCase regular tools into space-separated words.

### 7.5 Result encoding

`mapToolResultToToolResultBlockParam` (`ToolSearchTool.ts:444-470`) emits a `tool_result` whose content is an **array of `tool_reference` blocks**:

```
[{ type: 'tool_reference', tool_name: 'Read' }, { type: 'tool_reference', tool_name: 'Edit' }]
```

The host's tool-loading layer (not in scope) detects `tool_reference` and inlines the schema into a `<functions>` block in the next prompt — that's why the system reminder we received says "their schemas are NOT loaded — calling them directly will fail with InputValidationError". On no matches, returns text "No matching deferred tools found", optionally with a "MCP servers still connecting: X, Y" hint pulled from `appState.mcp.clients` filtered to `type === 'pending'` (`ToolSearchTool.ts:335-339, 449-454`).

### 7.6 Telemetry

`tengu_tool_search_outcome` event (`ToolSearchTool.ts:346-355`) carries `query`, `queryType: 'select'|'keyword'`, `matchCount`, `totalDeferredTools`, `maxResults`, `hasMatches`. Useful for tuning the deferral threshold.

---

## 8. ConfigTool — settings.json read/write

`CONFIG_TOOL_NAME = 'Config'` (`constants.ts:1`). `searchHint: 'get or set Claude Code settings (theme, model)'` (`ConfigTool.ts:69`). `shouldDefer: true`. `isReadOnly: input => input.value === undefined` (`ConfigTool.ts:90-92`) — read is auto-allowed (`:99-101`), writes ask for permission with `Set X to Y` (`:103-106`).

### 8.1 Input/output

```ts
{ setting: string, value?: string|boolean|number }
```

Setting key supports dotted paths like `"permissions.defaultMode"` (`ConfigTool.ts:39-46`). Output: `{ success, operation: 'get'|'set', setting, value?, previousValue?, newValue?, error? }` (`:51-61`).

### 8.2 Settings registry

`supportedSettings.ts:29-186` is the canonical config surface:

- Per-key: `source: 'global' | 'settings'` (global = `~/.claude.json`, settings = `settings.json`), `type: 'boolean' | 'string'`, `description`, optional `path`, `options`/`getOptions`, `appStateKey` (for immediate-effect UI sync), `validateOnWrite` (async — e.g., `validateModel` calls API to confirm), `formatOnRead`.
- 18 always-on settings: `theme`, `editorMode`, `verbose`, `preferredNotifChannel`, `autoCompactEnabled`, `autoMemoryEnabled`, `autoDreamEnabled`, `fileCheckpointingEnabled`, `showTurnDuration`, `terminalProgressBarEnabled`, `todoFeatureEnabled`, `model`, `alwaysThinkingEnabled`, `permissions.defaultMode`, `language`, `teammateMode`.
- Conditional: `classifierPermissionsEnabled` (ant-only), `voiceEnabled` (`feature('VOICE_MODE')`), `remoteControlAtStartup` (`feature('BRIDGE_MODE')`), `taskCompleteNotifEnabled`/`inputNeededNotifEnabled`/`agentPushNotifEnabled` (`feature('KAIROS')`).

### 8.3 Model special-casing

`generatePrompt` (`prompt.ts:14-77`) auto-generates the docs section by iterating `SUPPORTED_SETTINGS`, with a separate `## Model` section listing options pulled from `getModelOptions()` (`prompt.ts:79-93`). This is how the model learns the legal model values dynamically.

### 8.4 Write path

`call()` (`ConfigTool.ts:111-411`) — sequence: support check → GET branch (early return) → SET coercion (`"true"`→`true`, etc.) → options validation → `validateOnWrite` async hook → voice-mode pre-flight (mic permission, Anthropic auth, recording deps) → write. Two write backends: `saveGlobalConfig(prev => next)` for `'global'` source (`:326-329`), or `updateSettingsForSource('userSettings', buildNestedObject(path, value))` for `'settings'` source (`:331-343`). Both notify subscribers via `settingsChangeDetector.notifyChange('userSettings')` (`:348-353`) and sync `AppState[appStateKey]` for immediate UI effect (`:356-362`).

### 8.5 Special-value handling

`remoteControlAtStartup = "default"` deletes the key so it falls back to platform-aware default (`ConfigTool.ts:151-180`). Useful pattern for "reset to default" via tool API.

---

## 9. AskUserQuestionTool — multi-choice with previews

`ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'` (`prompt.ts:3`). `searchHint: 'prompt the user with a multiple-choice question'` (`AskUserQuestionTool.tsx:111`). `shouldDefer: true`, `isReadOnly: true`, `requiresUserInteraction: true` (`:155-156`).

### 9.1 Schema

```ts
{
  questions: Array<{
    question: string,
    header: string,        // chip label, max 12 chars (ASK_USER_QUESTION_TOOL_CHIP_WIDTH = 12)
    options: Array<{
      label: string,        // 1-5 words
      description: string,  // explanation
      preview?: string      // markdown OR HTML fragment, single-select only
    }>,                     // 2-4 options (auto "Other" appended)
    multiSelect?: boolean
  }>,                       // 1-4 questions
  answers?: Record<string, string>,
  annotations?: Record<string, { preview?, notes? }>,
  metadata?: { source?: string }
}
```

`AskUserQuestionTool.tsx:14-67` — uniqueness refinement at `:32-54` enforces distinct question texts AND distinct labels within each question. Preview format is per-host: `getQuestionPreviewFormat()` returns `'markdown'` | `'html'` | `undefined` (`:118-124`); when HTML, `validateHtmlPreview` rejects full documents (`<html>`, `<body>`, `<!DOCTYPE>`), `<script>`, `<style>` tags, and raw text without any HTML markers (`:251-265`).

### 9.2 Render

When any option has a `preview`, the UI switches to a side-by-side layout (vertical option list left, preview right — `prompt.ts:11-19`). Preview mode is single-select only (multiSelect + preview → schema rejection, per `prompt.ts:19, 28`).

### 9.3 Output round-trip

Output is `{ questions, answers: Record<question, answer>, annotations? }` (`:69-74`). Multi-select answers are comma-separated within the answer string. The result block content is `User has answered your questions: "Q1"="A1" selected preview:..., "Q2"="A2" user notes: ..." (`:226-243`) so the main loop sees both selections AND any free-text notes.

### 9.4 KAIROS-channels gate

When `getAllowedChannels().length > 0` (running on Telegram/Discord), `isEnabled` returns false (`:135-145`). The multi-choice TUI dialog would hang with no keyboard. Channel relay already skips `requiresUserInteraction()` tools, so there's no fallback.

### 9.5 Permission

Always `behavior: 'ask'` with message `"Answer questions?"` — the question dialog itself is the interaction (`:182-188`). The `permissions` framework treats the user's answer in the dialog as the permission grant.

### 9.6 Plan-mode integration

`prompt.ts:43`: in plan mode, use this tool BEFORE finalizing the plan. NEVER ask "is the plan ready?" — that's `ExitPlanModeTool`'s job. Don't reference "the plan" in questions (user can't see it). Strong contract.

---

## 10. BriefTool — the user-output channel

`BRIEF_TOOL_NAME = 'SendUserMessage'`, `LEGACY_BRIEF_TOOL_NAME = 'Brief'` (`prompt.ts:1-2`). `aliases: [LEGACY_BRIEF_TOOL_NAME]` (`BriefTool.ts:138`). `searchHint: 'send a message to the user — your primary visible output channel'` (`:139-140`). **Not deferred** when active (`prompt.ts:88-94` — KAIROS bypass). `isReadOnly: true`, `isConcurrencySafe: true`.

### 10.1 What's a brief?

Per `prompt.ts:6-22`: in KAIROS/Brief mode, **the message inside this tool is the only thing the user actually reads**. Plain text outside the tool is hidden in a "detail view" most users never expand. The failure mode: real answer in plain text, `SendUserMessage` says "done!" → user sees only "done!". So every reply, even "hi"/"thanks", goes through this tool. Long-running work uses ack → checkpoint → result pattern.

### 10.2 Input

```ts
{
  message: string,                  // markdown supported
  attachments?: string[],           // file paths, abs or cwd-relative
  status: 'normal' | 'proactive'    // 'proactive' = surfaced unprompted (task done while user away)
}
```

`BriefTool.ts:21-37`. The `status` distinction is load-bearing for downstream routing (push notifications, bridge UI).

### 10.3 Lifecycle

`call()` (`BriefTool.ts:186-203`):

1. `sentAt = new Date().toISOString()` captured at execution time.
2. `tengu_brief_send` event with `proactive` and `attachment_count`.
3. If no attachments → return `{message, sentAt}`.
4. With attachments: `resolveAttachments(paths, {replBridgeEnabled, signal})` (`attachments.ts:63-110`).

`resolveAttachments` stats files serially, then in `feature('BRIDGE_MODE')` builds, uploads each to `/api/oauth/file_upload` via `uploadBriefAttachment` (`upload.ts:92-174`). The endpoint requires bearer token from `getBridgeAccessToken()`. Image MIME (`.png/.jpg/.jpeg/.gif/.webp`) → `image/*` (transcoder writes preview/thumbnail); everything else → `application/octet-stream`. Manual multipart body. `MAX_UPLOAD_BYTES = 30MB`. Failure → debug log + return undefined → attachment still carries `{path, size, isImage}` for local rendering (graceful degradation).

### 10.4 Two-mode entitlement / activation

Critical separation (`BriefTool.ts:88-134`):

- `isBriefEntitled()` = build-time `KAIROS|KAIROS_BRIEF` AND runtime (`getKairosActive()` OR env `CLAUDE_CODE_BRIEF` truthy OR GrowthBook `tengu_kairos_brief` true).
- `isBriefEnabled()` = entitlement AND `getKairosActive() || getUserMsgOptIn()` (opt-in via `--brief` CLI flag, `defaultView: 'chat'` setting, `/brief` slash command, `--tools` SDK list, env var).

The kill-switch design: flipping `tengu_kairos_brief` GB flag off mid-session disables Brief on the next 5-min refresh even for opted-in users.

### 10.5 UI

`UI.tsx:15-67` — three render modes:

- **transcript mode** (Ctrl+O): black-circle gutter + Markdown body + attachment list.
- **brief-only mode**: "Claude {timestamp}" label + 2-col indent + Markdown body, mirroring "You" label for user prompts.
- **default**: empty 2-col gutter (matches AssistantTextMessage spacing) + Markdown body, no tool chrome.

`AttachmentList` (`UI.tsx:72-100`) shows one row per attachment: pointer-small + `[image]` or `[file]` + display path + size.

### 10.6 Required system-prompt section

`BRIEF_PROACTIVE_SECTION` (`prompt.ts:12-22`) is the "## Talking to the user" doc that gets injected into the system prompt whenever Brief is active. Without this the model defaults back to plain text and the user sees "done!" with the real answer hidden.

---

## 11. Per-tool input/output/permission summary

| Tool                 | Input fields                                          | Output                                                         | Permission default     | Defer?         | Read-only?  |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------- | ---------------------- | -------------- | ----------- |
| MCPTool (template)   | `{}` passthrough                                      | `string`                                                       | passthrough            | always         | per-tool    |
| ListMcpResourcesTool | `{server?}`                                           | `Resource[]`                                                   | (read)                 | yes            | yes         |
| ReadMcpResourceTool  | `{server, uri}`                                       | `{contents}`                                                   | (read)                 | yes            | yes         |
| McpAuthTool          | `{}`                                                  | `{status, message, authUrl?}`                                  | allow                  | (n/a — pseudo) | no          |
| LSPTool              | `{operation, filePath, line, character}`              | `{operation, result, filePath, resultCount?, fileCount?}`      | read-FS check          | yes            | yes         |
| SkillTool            | `{skill, args?}`                                      | inline OR forked union                                         | rule-based / ask       | NO             | varies      |
| ToolSearchTool       | `{query, max_results?}`                               | `{matches, query, total_deferred_tools, pending_mcp_servers?}` | (always allow)         | NO             | yes         |
| ConfigTool           | `{setting, value?}`                                   | `{success, operation, ...}`                                    | read=allow / write=ask | yes            | conditional |
| AskUserQuestionTool  | `{questions[1-4], answers?, annotations?, metadata?}` | `{questions, answers, annotations?}`                           | ask                    | yes            | yes         |
| BriefTool            | `{message, attachments?, status}`                     | `{message, attachments?, sentAt?}`                             | (no gate)              | NO when KAIROS | yes         |

---

## 12. ToolSearch deferred-tool list — what's in vs out at startup

Concrete rules from `prompt.ts:62-108`:

**Always loaded (never deferred):**

- ToolSearch itself.
- Every MCP tool with `_meta['anthropic/alwaysLoad'] = true` (server opts in).
- AgentTool when `feature('FORK_SUBAGENT') && isForkSubagentEnabled()`.
- BriefTool when `feature('KAIROS') || feature('KAIROS_BRIEF')` and active.
- SendUserFileTool when KAIROS + replBridgeActive.
- All built-ins not marked `shouldDefer: true` (Read, Write, Edit, Bash, Grep, Glob, etc.).

**Always deferred:**

- Every MCP tool by default (`isMcp: true && !alwaysLoad`).
- Tools with `shouldDefer: true`: ListMcpResourcesTool, ReadMcpResourceTool, LSPTool, ConfigTool, AskUserQuestionTool, plus any SDK-registered tool that opts in.

**When fetched:** model sees the deferred-tool name in a `<system-reminder>`/`<available-deferred-tools>` block and must call `ToolSearch({query: 'select:Name'})` (or keyword search) to receive the full schema as a `tool_reference` block, which the host expands into a `<functions>` definition for the next turn. This matches the system reminder we received in the conversation header — the deferred-tool list is exactly what would let us load Slack/Gmail/Vercel/Stripe MCP tools on demand without burning 50K tokens of schema upfront.

---

## 13. Findings — what AGI Workforce is missing

1. **ToolSearch + the deferred-loading pattern.** Without this, the only way to grow the tool surface is to hardcode every MCP tool into the system prompt, which scales poorly. ToolSearch is the entire reason 770+ MCP servers are practical.
2. **LSP + LSPTool with 9 operations.** Cursor/Codeium have this; we have nothing. `findReferences` + `goToDefinition` + `incomingCalls` make the agent dramatically more competent on real codebases. Two-step call hierarchy + .gitignore filter + size cap + position-symbol extraction are non-obvious bits to port correctly.
3. **AskUserQuestionTool.** Multi-choice prompts with previews + annotations are the right primitive for "should I use library A or B?" decisions. Sketching previews server-side and letting the user pick visually beats free-text Q&A. We currently lean on plain-text questions which the model often skips.
4. **SkillTool + system-reminder skill list.** The `<system-reminder>`-emitted skill catalog with budget-aware truncation (1% of context window) is the discovery layer that makes 100+ skills usable.
5. **ConfigTool.** Letting the model toggle `permissions.defaultMode`, `model`, `theme`, `editorMode` etc. via tool call (with read-auto-allow/write-ask) closes the "I'd love to enable X but the user has to do it manually" loop.
6. **McpAuthTool's pseudo-tool pattern.** When MCP server returns 401, replace its real tools with a single `mcp__<server>__authenticate` pseudo-tool so the model can surface the auth URL to the user instead of failing silently. Prefix-based replacement on reconnect (`getMcpPrefix(server)`) is the elegant primitive.
7. **MCPTool/classifyForCollapse.** 600 lines of curated allowlist names that determines whether tool calls collapse in chat UI. Trivial to port, dramatic UX impact when chat is dominated by 50 GitHub `list_*` calls.
8. **BriefTool's text-visibility contract** is over-engineered for our case (the KAIROS/Brief mode is a separate UX pivot Anthropic is testing) but the **`status: 'normal' | 'proactive'`** distinction + attachment upload pattern + sentAt timestamp are still useful for any future "agent finishes work overnight" flow.

---

## 14. Notable patterns to reuse

- **`shouldDefer: true` + ToolSearch** is the right way to keep the initial system prompt small while supporting infinite tool expansion.
- **`searchHint` strings** rank higher than auto-generated descriptions in keyword search. Curate one per tool.
- **Discriminated-union schema with a wire-flat fallback** (LSP) is the cleanest way to model "many ops behind one tool" while keeping per-op type safety.
- **Per-tool `toAutoClassifierInput(input)`** returns the smallest meaningful string fingerprint — used for the auto-mode safety classifier and the skill-coach false-positive guard.
- **`requiresUserInteraction(): true`** is the clean opt-out from any non-interactive (channels, headless) execution mode.
- **`alwaysLoad: true` via `_meta['anthropic/alwaysLoad']`** lets remote MCP servers force their tools into the initial prompt — useful for "this server is always relevant" cases (e.g., a project-pinned MCP server).

---

## 15. Files cited (absolute paths)

- `/Users/siddhartha/Desktop/reference/src/tools/MCPTool/MCPTool.ts`
- `/Users/siddhartha/Desktop/reference/src/tools/MCPTool/prompt.ts`
- `/Users/siddhartha/Desktop/reference/src/tools/MCPTool/classifyForCollapse.ts`
- `/Users/siddhartha/Desktop/reference/src/tools/MCPTool/UI.tsx`
- `/Users/siddhartha/Desktop/reference/src/tools/ListMcpResourcesTool/{ListMcpResourcesTool.ts, prompt.ts, UI.tsx}`
- `/Users/siddhartha/Desktop/reference/src/tools/ReadMcpResourceTool/{ReadMcpResourceTool.ts, prompt.ts, UI.tsx}`
- `/Users/siddhartha/Desktop/reference/src/tools/McpAuthTool/McpAuthTool.ts`
- `/Users/siddhartha/Desktop/reference/src/tools/LSPTool/{LSPTool.ts, prompt.ts, schemas.ts, formatters.ts, symbolContext.ts, UI.tsx}`
- `/Users/siddhartha/Desktop/reference/src/tools/SkillTool/{SkillTool.ts, prompt.ts, constants.ts, UI.tsx}`
- `/Users/siddhartha/Desktop/reference/src/tools/ToolSearchTool/{ToolSearchTool.ts, prompt.ts, constants.ts}`
- `/Users/siddhartha/Desktop/reference/src/tools/ConfigTool/{ConfigTool.ts, prompt.ts, supportedSettings.ts, constants.ts, UI.tsx}`
- `/Users/siddhartha/Desktop/reference/src/tools/AskUserQuestionTool/{AskUserQuestionTool.tsx, prompt.ts}`
- `/Users/siddhartha/Desktop/reference/src/tools/BriefTool/{BriefTool.ts, prompt.ts, attachments.ts, upload.ts, UI.tsx}`

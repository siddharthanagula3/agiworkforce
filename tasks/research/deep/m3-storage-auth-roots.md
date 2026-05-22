# M3 — Storage, Auth & Root Files (Deep Read)

Subagent: M3 of 30. Files in scope, all read in full from `~/Desktop/reference/src/`:

| File                                                         |   LOC | Role                                                                      |
| ------------------------------------------------------------ | ----: | ------------------------------------------------------------------------- |
| `utils/sessionStorage.ts`                                    | 5,105 | Per-project JSONL transcripts, resume, metadata sidecars                  |
| `utils/auth.ts`                                              | 2,002 | OAuth 2.0 + PKCE, key resolution, 3P (Bedrock/Vertex/Foundry) credentials |
| `services/oauth/{index,client,auth-code-listener,crypto}.ts` |   998 | OAuth flow internals (cited as supporting reference)                      |
| `Tool.ts`                                                    |   792 | Canonical `Tool<Input,Output,P>` interface + `ToolUseContext`             |
| `tools.ts`                                                   |   389 | Tool registry, presets, deny-rule filtering, MCP merge                    |
| `Task.ts`                                                    |   125 | Task type/state machine + `generateTaskId` (~2.8T-combo crypto IDs)       |
| `tasks.ts`                                                   |    39 | Task registry (`getAllTasks`/`getTaskByType`)                             |
| `query.ts`                                                   | 1,729 | The agent loop — streaming, tool-use, compact recovery                    |
| `QueryEngine.ts`                                             | 1,295 | Per-conversation lifecycle wrapper around `query()`                       |
| `history.ts`                                                 |   464 | `~/.claude/history.jsonl` — Up-arrow/ctrl+r prompt history                |
| `commands.ts`                                                |   754 | Slash-command registry + remote-bridge gating                             |
| `cost-tracker.ts`                                            |   323 | Per-model `ModelUsage`, persists to project config                        |
| `costHook.ts`                                                |    22 | `useCostSummary` React hook (process exit)                                |

This report is organised by the inventory cross-refs the M3 brief enumerates. Cite-level (`file:line`) references are inlined.

---

## 1. `~/.claude/projects/` disk layout (sessionStorage.ts 5,105 LOC)

### 1.1 Path scheme

`getProjectsDir()` (`sessionStorage.ts:198-200`) returns `${getClaudeConfigHomeDir()}/projects`. Per-project sub-dir is `getProjectDir(cwd)` (`:436-438`) which `memoize(...)`'s `join(getProjectsDir(), sanitizePath(cwd))`. `sanitizePath` (referenced from `./path.js`) replaces `/` with `-` and strips other unsafe characters — that is the dotted-style directory name surfaced everywhere in claude-code docs (e.g. `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/`). `getTranscriptPath()` (`:202-205`) yields `${projectDir}/${sessionId}.jsonl` — **one JSONL file per session**, named by UUID, mode 0o600 (`:642`, `:1608`, `:1660`, `:1696`).

The session file is **created lazily** — `Project.materializeSessionFile()` (`:976-991`) only runs on the first `user`/`assistant` message. Until then, all entries (start-up metadata such as `agent-setting`, `mode`, `--name` title) are buffered into `pendingEntries` (`:552`, `:1138-1141`). This is what prevents orphan metadata-only files at startup if the user quits before sending the first prompt.

### 1.2 Subagent + remote-agent sidecars

Subagent transcripts go to a **per-agent file in a session subdirectory**: `${projectDir}/${sessionId}/subagents/agent-${agentId}.jsonl` (`:247-258`). An optional grouping subdir (e.g. workflow run id) is honored via `agentTranscriptSubdirs` map (`:234-241`). Each agent file gets a sibling `.meta.json` that records `agentType`, `worktreePath`, `description` (`:264-303`). The sidecar pattern means:

- Sub-agents persist independently from the main thread.
- The main JSONL never bloats with agent sidechains.
- Resume of a subagent (AgentTool) reads exactly one file.
- Schema changes to subagent metadata don't require migrating the main JSONL.

Remote agents (CCR-style) get yet another sidecar: `${projectDir}/${sessionId}/remote-agents/remote-agent-${taskId}.meta.json` (`:320-329`). `RemoteAgentMetadata` (`:305-318`) carries `taskId`, `remoteTaskType`, `sessionId` (CCR session id, used to fetch live status on resume), `title`, `command`, `spawnedAt`. `listRemoteAgentMetadata()` (`:373-399`) scans the directory on resume to reconnect to still-running CCR sessions; partial writes from crashed fire-and-forget persists are skipped without taking down restore.

### 1.3 JSONL — append-only, no compression

The format is plain newline-delimited JSON (`jsonStringify(entry) + '\n'`, `:656`, `:1607`). **No compression** is used anywhere, even for session files that grow to multiple GB (the 50 MB constants at `:123, :229, :927, :3576` document the inc-3930 incident where a session file blew past GB). `MAX_TOMBSTONE_REWRITE_BYTES = 50 * 1024 * 1024` (`:123`) and `MAX_TRANSCRIPT_READ_BYTES = 50 * 1024 * 1024` (`:229`) are protective ceilings rather than format guarantees.

### 1.4 Entry types

`Entry` is the union of every JSONL line. From the type imports (`:46-56`) and the `appendEntry` switch (`:1158-1264`) I count these top-level entry types:

| Type                                                                            | Purpose                                                       | Re-appended?         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------- |
| `user`, `assistant`, `attachment`, `system` (`isTranscriptMessage`, `:139-146`) | Conversation messages                                         | No (inline only)     |
| `summary`                                                                       | Auto-summary keyed by leafUuid                                | No                   |
| `custom-title`                                                                  | `/rename` user title                                          | **Yes** (`:776-782`) |
| `ai-title`                                                                      | AI-generated title; never re-appended (`:2667-2673`)          | No                   |
| `task-summary`                                                                  | `claude ps` rolling snapshot (`:2681-2688`)                   | No                   |
| `last-prompt`                                                                   | Tail-readable user-facing prompt (`:768-773`)                 | **Yes**              |
| `tag`                                                                           | `/tag` (`:2690-2699`)                                         | **Yes**              |
| `agent-name`, `agent-color`                                                     | UI-shown agent identity                                       | **Yes**              |
| `agent-setting`                                                                 | `--agent` CLI flag (`:2861-2863`)                             | **Yes**              |
| `mode`                                                                          | `coordinator`/`normal`                                        | **Yes**              |
| `worktree-state`                                                                | `EnterWorktree`/`ExitWorktree` (`:2889-2925`)                 | **Yes**              |
| `pr-link`                                                                       | `linkSessionToPR` (`:2705-2729`)                              | **Yes**              |
| `file-history-snapshot`                                                         | Per-`messageId` checkpointed file state (`:1085-1099`)        | No                   |
| `attribution-snapshot`                                                          | Per-`messageId` git attribution snapshot (`:1107-1111`)       | No                   |
| `content-replacement`                                                           | Tool-result-budget records (`:1113-1126`)                     | No                   |
| `queue-operation`                                                               | Bridge-mode queued commands (`:1101-1105`)                    | No                   |
| `speculation-accept`                                                            | Speculation-accept entries (`:1192-1194`)                     | No                   |
| `marble-origami-commit`                                                         | Context-collapse commits (HISTORY_SNIP feature, `:1208-1212`) | No                   |
| `marble-origami-snapshot`                                                       | Context-collapse snapshots, last-wins (`:1213-1215`)          | No                   |
| Legacy `progress`                                                               | Pre-PR-#24099, bridged on load (`:158-178`, `:3623-3645`)     | No                   |

The metadata that **is** re-appended is the load-bearing innovation: `reAppendSessionMetadata()` (`:721-839`) is invoked from compaction and from the cleanup handler so that the last 64 KB of the file (the "tail window") always contains the user-visible session-name fields. Without this, reading the lite metadata for the resume picker would have to scan multi-GB files.

### 1.5 Concurrency controls

The `Project` class (`:532-1384`) is the single writer per process. Notable mechanics:

- `writeQueues: Map<filePath, [{entry,resolve}]>` (`:561-564`) — per-file enqueue
- `FLUSH_INTERVAL_MS = 100` default (`:567`); set to `10` (`REMOTE_FLUSH_INTERVAL_MS`, `:530`) when a remote ingress URL or CCR v2 internal-event writer is registered (`:1350, :1360`).
- `MAX_CHUNK_BYTES = 100 MB` (`:568`) — drains in chunks, flushing partials so 200 MB of buffered writes don't get serialized as a single fs call.
- `pendingWriteCount` + `flushResolvers` (`:557-595`) — `flush()` (`:841-861`) waits on all in-flight writes, then drains remaining queues, then resolves any waiters.
- `removeMessageByUuid` (`:871-951`) — fast tail path: read last 64 KB, byte-search for `"uuid":"<target>"`, ftruncate at line start, re-write trailing bytes. Slow path only triggers if target was pushed out of the tail (>50 MB ceiling, `:927`). This is the tombstone path for orphaned-stream messages.

### 1.6 `loadTranscriptFile` (the resume path)

`loadTranscriptFile(filePath, opts)` (`:3472-3813`) is the canonical reader. Returns 17 keyed maps (every metadata category) plus `messages: Map<UUID, TranscriptMessage>` and `leafUuids: Set<UUID>`.

Optimisations:

1. **Pre-compaction skip (`:3536-3556`)**: if file size > `SKIP_PRECOMPACT_THRESHOLD`, call `readTranscriptForLoad` (in `sessionStoragePortable.ts`) which excises pre-boundary bytes at the fd level. Pre-boundary metadata (e.g. `agent-setting` written before compaction) is recovered by `scanPreBoundaryMetadata` — a cheap byte-level forward scan.
2. **`walkChainBeforeParse` (`:3306, :3572-3579`)**: byte-level pre-filter that excises dead fork branches before `parseJSONL`. Comment shows a concrete benefit: `41 MB, 99% dead: parseJSONL 56 ms → 3.9 ms (-93%)`.
3. **Progress bridging (`:3623-3645`)**: legacy progress entries — removed from `Entry` in PR #24099 — are mapped `progressUuid → parentUuid` and any subsequent message whose `parentUuid` lands in the bridge is rewritten. This is migration handling at the **read path** without touching disk.
4. **Snip removals (`:1982-2039`)**: snip metadata records `removedUuids[]`; on resume, those entries are deleted from the messages map and surviving children's `parentUuid` fields are walked back to the nearest non-removed ancestor with path compression.
5. **Preserved-segment relinks (`:1839-1956`)**: compact boundaries with preservedSegment metadata splice the kept-segment back in, zero stale `usage.input_tokens` so `--resume` doesn't immediately autocompact-spiral.
6. **Cycle detection**: `buildConversationChain` (`:2069-2094`) and the leaf walker (`:3768-3786`) both detect cycles, log `tengu_chain_parent_cycle`, and return partial transcript instead of hanging.

### 1.7 Lite metadata reader for the picker

`readLiteMetadata` (`:4739-4813`) reads only **head 64 KB and tail 64 KB** of each session file via `readHeadAndTail` (`sessionStoragePortable.ts`). Extracts:

- Head: `cwd` (`projectPath`), `teamName`, `agentSetting`, `isSidechain` flag, fallback `firstPrompt` from message content, `gitBranch`.
- Tail: `customTitle` (preferred over `aiTitle`), `summary`, `tag`, `prNumber/prUrl/prRepository`, latest `gitBranch`, **and `lastPrompt`** (the authoritative pre-filtered title text written by `extractFirstPrompt`).

The crucial property: **a 4 GB session file's resume-picker entry costs 128 KB of disk reads** thanks to head+tail-only reads and the unconditional re-append of mutable metadata.

### 1.8 Sidechain (subagent) write rules

The dedup logic in `appendEntry` (`:1224-1262`) has a load-bearing exception: **agent sidechain entries bypass the main-session UUID dedup set** (`:1242-1244`). This handles AgentTool fork inheritance — parent messages share UUIDs with the main transcript, but the sidechain file needs a complete copy. Without this, a resumed fork loaded a 10 KB file instead of the full 85 KB inherited context (per the inline comment).

### 1.9 Migration handling — read-path only

Notable: there is **no batch migrator**. Schema evolution is handled with three patterns:

- Read-path bridging (`isLegacyProgressEntry` → `progressBridge`).
- Field-level fallbacks (`firstPrompt` falls through `lastPrompt → head scan → content prefix → text prefix`, `:4760-4765`).
- New entry types are additive (e.g. `ai-title` was added without touching `custom-title`, with a documented preference order at `:2641-2666`).

This is consistent with the SSOT pattern: never rewrite a session file in-place; new code reads old shapes.

### 1.10 Cleanup

`shouldSkipPersistence` (`:960-970`) checks `cleanupPeriodDays === 0`. The actual cleanup-job is in `commands/cleanup` (out of scope), but this gate is called per-write (`:1129-1131`, `:980`) so a stale `cleanupPeriodDays:0` setting completely disables persistence. The same gate also covers `--no-session-persistence`, `NODE_ENV=test`, and `CLAUDE_CODE_SKIP_PROMPT_HISTORY` (set by the Tungsten tmux tool).

### 1.11 CCR v2 / remote ingress

There are two orthogonal remote paths: v1 Session Ingress (`persistToRemote` → `sessionIngress.appendSessionLog`, `:1325-1342`) and **CCR v2 internal events** (`:498-528, :1308-1322`). The latter registers a `setInternalEventWriter` so transcripts are streamed as worker-internal events instead of session-ingress posts. `hydrateFromCCRv2InternalEvents` (`:1632-1723`) fetches foreground + per-agent events and writes them to local JSONL, grouped by `agent_id`. Failures are silent; epoch-mismatch is re-thrown so the worker doesn't race against `gracefulShutdown`.

### 1.12 Session listing — `loadAllProjectsMessageLogsProgressive`

(`:4018-4049`) Two-stage:

1. Stat-only logs from each project dir (`getSessionFilesLite`).
2. Enrich the first N (`INITIAL_ENRICH_COUNT`, default elsewhere) via `readLiteMetadata`. The remainder is returned as `allStatLogs` for caller-driven progressive enrichment.

`loadSameRepoMessageLogsProgressive` (`:4086-4108`) does the same but scoped to git worktrees of the current repo (via `getWorktreePaths`).

---

## 2. `auth.ts` (2,002 LOC) — OAuth, PKCE, multi-org, BYOK

### 2.1 Auth source resolution order

`isAnthropicAuthEnabled()` (`:100-149`) and `getAuthTokenSource()` (`:153-206`) together encode the priority chain. The brief asks for OAuth flow + multi-org + `console.anthropic.com` vs `claude.ai` + `forceLoginMethod` — answered in §2.4. First the resolution chain:

- `--bare` mode (`isBareMode()`): API key only — apiKeyHelper from `--settings`, never OAuth, never keychain.
- `ANTHROPIC_UNIX_SOCKET` (`:111-113`): `claude ssh` remote — auth lives on the local proxy; the placeholder token's source is forced to `CLAUDE_CODE_OAUTH_TOKEN`.
- 3P (Bedrock/Vertex/Foundry) env vars: disable Anthropic auth.
- `ANTHROPIC_AUTH_TOKEN` env (`:164-166`): unmanaged contexts only (CCR/CCD use `isManagedOAuthContext` to ignore).
- `CLAUDE_CODE_OAUTH_TOKEN` env (`:168-170`): direct token bypass (inference-only scope, `:1264-1271`).
- `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (`:172-191`): subprocess pipe with CCR disk fallback. Two distinct sources so the org-mismatch error message can disambiguate (`:1949-1991`).
- `apiKeyHelper` (`:194-198`): SWR-cached external command.
- `getClaudeAIOAuthTokens()` (`:1255-1300`): the canonical OAuth token from secure storage (keychain on macOS, `~/.claude/.credentials.json` elsewhere).

### 2.2 OAuth 2.0 with PKCE

The client implementation is in `services/oauth/` — referenced here for completeness because the brief asks about it.

- **Code verifier** = `base64url(randomBytes(32))` (`oauth/crypto.ts:11-13`).
- **Code challenge** = `base64url(sha256(verifier))` (S256, `oauth/crypto.ts:15-19`).
- **State** = `base64url(randomBytes(32))` (`oauth/crypto.ts:21-23`).
- **Local callback listener** (`oauth/auth-code-listener.ts:18-100`) is a `http.createServer()` bound to `localhost` on an OS-assigned port (`port?? 0`). Path is `/callback?code=...&state=...`. CSRF-protected by the `expectedState` field (`:23, :63-71`). On success, redirects the browser to `CLAUDEAI_SUCCESS_URL` or `CONSOLE_SUCCESS_URL` based on granted scopes.
- **Two URL forms** are issued (`oauth/index.ts:69-70`):
  - `automaticFlowUrl` (`redirect_uri=http://localhost:${port}/callback`)
  - `manualFlowUrl` (`redirect_uri=${MANUAL_REDIRECT_URL}`) — for environments without a browser; user pastes the code.
    Both URLs are shown to the user; whichever one resolves first wins (`oauth/index.ts:73-86`).
- **Token exchange** (`oauth/client.ts:107-144`): POST to `TOKEN_URL` with `grant_type=authorization_code`, `code`, `redirect_uri` (matching whichever URL produced the code), `client_id`, `code_verifier`, `state`. 15 s timeout, 401 → "Invalid authorization code" friendly message.
- **`expiresIn` override** (`oauth/index.ts:36-37`, `client.ts:113`) — caller can request a longer-lived token (e.g. inference-only setup-token).
- **Profile fetch** post-exchange (`oauth/client.ts:106-108` referenced at `oauth/index.ts:106`) populates `subscriptionType`/`rateLimitTier` and `tokenAccount` (uuid, email, organizationUuid).

### 2.3 Refresh-token flow

`refreshOAuthToken(refreshToken)` (`oauth/client.ts:146-200+`) POSTs `grant_type=refresh_token`, `client_id`, `scope` (defaulting to `CLAUDE_AI_OAUTH_SCOPES` so existing tokens can expand to scopes added later — backend `ALLOWED_SCOPE_EXPANSIONS`). The new `refresh_token` defaults to the existing one if the server omits it.

`checkAndRefreshOAuthTokenIfNeeded(retryCount=0, force=false)` (`auth.ts:1427-1562`) is the entry point used everywhere. Mechanics:

- **Inflight dedup** (`:1424-1444`): non-retry, non-force calls share one promise.
- **Disk-mtime invalidation** (`:1313-1336`): another CC instance may write fresh tokens; `invalidateOAuthCacheIfDiskChanged` checks `~/.claude/.credentials.json` mtime and clears caches when it changes — fixes inc-3930-class /login regress.
- **File lock** (`:1485-1516`): `lockfile.lock(claudeDir)` with up to 5 retries, jittered 1-2 s waits. `ELOCKED` → other process is refreshing; we retry.
- **Race resolution** (`:1518-1528`): after acquiring the lock, re-check expiration; another tab may have refreshed.
- **401 handler** (`:1360-1392`): `handleOAuth401Error(failedAccessToken)` is called by request layers when the API rejects a token. Compares the failed token with what's now in keychain — if different, another tab fixed it; otherwise force-refresh (`force=true`, bypassing local expiration check).
- **In-flight 401 dedup** (`:1338-1343, :1361-1371`): `pending401Handlers` Map prevents duplicate keychain reads when N proxy connectors all hit 401 simultaneously (the inc-#20930 issue).

### 2.4 `console.anthropic.com` vs `claude.ai` and `forceLoginMethod`

`buildAuthUrl` (`oauth/client.ts:46-105`) selects the auth URL base via `loginWithClaudeAi`:

- `loginWithClaudeAi:true` → `CLAUDE_AI_AUTHORIZE_URL` (https://claude.ai/...)
- otherwise → `CONSOLE_AUTHORIZE_URL` (https://console.anthropic.com/...)

The choice is exposed to the user via the `forceLoginMethod` setting (mentioned in inventory §5.10). The `loginMethod` query param (`oauth/client.ts:101-102`) is forwarded to the IDP — values `'sso' | 'magic_link' | 'google'`. `loginHint` (`:96-97`) is the email pre-fill.

Result-side: `shouldUseClaudeAIAuth(scopes)` (`oauth/client.ts:38-40`) checks for the `CLAUDE_AI_INFERENCE_SCOPE` in granted scopes — that's how downstream code distinguishes Claude.ai subscribers from console API customers (`auth.ts:1564-1570`, `is1PApiCustomer` `:1586-1609`).

### 2.5 Multi-org via `forceLoginOrgUUID`

`validateForceLoginOrg()` (`auth.ts:1923-2000`) implements managed-settings-driven org pinning. Behavior:

1. Skip when `ANTHROPIC_UNIX_SOCKET` is set (proxy already validated upstream).
2. Skip when no `forceLoginOrgUUID` in policy settings.
3. Fresh refresh first (`checkAndRefreshOAuthTokenIfNeeded()`).
4. **Always fetch the authoritative org UUID from the profile endpoint** — even keychain-sourced tokens are server-verified because the cached UUID in `~/.claude.json` is user-writable (`:1950-1957`).
5. **Fail-closed**: if profile fetch fails (network, no `user:profile` scope), validation fails with a guided error message pointing the user to `claude auth login` for full-scope tokens.
6. Distinct error messages for env-var tokens (tells user to unset the env var) vs keychain tokens (tells user to re-login).

Setup-token tokens (no `user:profile` scope) are explicitly called out — see `hasProfileScope` (`:1580-1584`).

### 2.6 Token persistence and `getClaudeAIOAuthTokens`

`saveOAuthTokensIfNeeded(tokens)` (`:1194-1253`) writes only `claude.ai`-scoped tokens with refreshToken + expiresAt to `getSecureStorage()`. The fallback for `subscriptionType`/`rateLimitTier` (`:1224-1228`) is **load-bearing**: profile fetch swallows transient errors and returns `null`, so the current `null` value must NOT clobber a previously-stored valid subscription. Pattern: `tokens.subscriptionType ?? existingOauth?.subscriptionType ?? null`.

Read path (`getClaudeAIOAuthTokens`, `:1255-1300`) is `memoize(...)`. Sync; the async sibling `getClaudeAIOAuthTokensAsync` (`:1399-1422`) avoids the keychain blocking call (~100 ms) when used in render hot paths.

`saveApiKey(apiKey)` (`:1094-1160`) on macOS uses `security -i` (interactive mode) with a hex-encoded password (`:1110-1117`) — credentials never appear in the process command-line argv. Falls back to writing `primaryApiKey` to global config on non-darwin or keychain failure. Stores the normalized key in `customApiKeyResponses.approved` so subsequent uses don't re-prompt.

### 2.7 3P credential flows (Bedrock, Vertex, Foundry)

Three parallel external-command paths:

- **AWS** (`refreshAwsAuth`, `:650-699`): runs `awsAuthRefresh`, streams stdout/stderr in real time via `AwsAuthStatusManager` for UI display. 3-min timeout. `runAwsAuthRefresh` (`:612-644`) skips the refresh if `aws sts get-caller-identity` already succeeds.
- **GCP** (`refreshGcpAuth`, `:917-967`): same pattern. `checkGcpCredentialsValid` (`:847-866`) does a 5 s probe via `GoogleAuth().getClient().getAccessToken()`; the timeout matters because outside GCP, google-auth-library falls through to the metadata server which hangs ~12 s.
- Both `prefetchAwsCredentialsAndBedRockInfoIfSafe()` (`:1023-1048`) and `prefetchGcpCredentialsIfSafe()` (`:994-1014`) are gated on `checkHasTrustDialogAccepted()` so a malicious project can't auto-execute creds-fetching commands by sitting in `projectSettings`.

### 2.8 `apiKeyHelper` (BYOK external command)

`getApiKeyFromApiKeyHelper(isNonInteractiveSession)` (`:469-499`) is a Stale-While-Revalidate cache:

- Hot hit: return cached.
- Stale: return stale + spawn background refresh.
- Cold: deduplicate inflight calls.
- `clearApiKeyHelperCache()` (`:585-589`) bumps `_apiKeyHelperEpoch` so orphaned in-flight refreshes from a previous epoch can't clobber state on a settings change.

`_executeApiKeyHelper` (`:538-574`) shells out via `execa(cmd, {shell:true, timeout: 10*60*1000, reject:false})`. **Trust check** (`:546-555`): if the helper is from `projectSettings`/`localSettings`, it must NOT execute before workspace trust is confirmed; otherwise a malicious `.claude/settings.local.json` could exfil creds.

Failure mode: stale-but-working cache survives transient errors (`:524-527`). Cold/repeated failure caches the `' '` (single space) sentinel (`:528-530`) so callers don't fall back to OAuth — apiKeyHelper, when configured, is authoritative.

### 2.9 Subscription tiers

`getSubscriptionType()` (`:1662-1677`) returns `'enterprise' | 'team' | 'max' | 'pro' | null`. Helpers: `isMaxSubscriber` `:1679-1681`, `isProSubscriber` `:1698-1700`, `isTeamPremiumSubscriber` (`:1687-1692` — combines `team` + `default_claude_max_5x` rate-limit tier). `hasOpusAccess` (`:1647-1660`) treats `null` as "in doubt, allow" so external API users keep Opus.

`isOverageProvisioningAllowed()` (`:1623-1643`) gates extra-usage purchases on `billingType` ∈ {`stripe_subscription`, `stripe_subscription_contracted`, `apple_subscription`, `google_play_subscription`} — the latter two unlock the **mobile in-app purchase** path.

---

## 3. `Tool.ts` — canonical tool interface (792 LOC)

Comparing field-by-field to `apps/cli/src/tools.rs` (3,109 LOC, in the AGI Workforce repo):

### 3.1 Required fields on `Tool<Input, Output, P>`

`Tool.ts:362-695`:

| Field                                                     | Type                          | Notes                                                                                                              |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `name`                                                    | readonly string               |                                                                                                                    |
| `inputSchema`                                             | readonly `Input` (Zod schema) | Models compile this to JSON Schema                                                                                 |
| `maxResultSizeChars`                                      | number                        | `Infinity` for self-bounded tools (Read) — beyond this, result is persisted to disk and Claude gets a preview path |
| `call(args, ctx, canUseTool, parentMessage, onProgress?)` | function                      | Returns `ToolResult<Output>`                                                                                       |
| `description(input, options)`                             | async function                | Per-call description string                                                                                        |
| `prompt(options)`                                         | async function                | Per-tool system prompt — receives `agents`, `tools`, permission context                                            |
| `userFacingName(input)`                                   | function                      | Display name                                                                                                       |
| `isConcurrencySafe(input)`                                | bool                          | Default `false` (assume not safe)                                                                                  |
| `isEnabled()`                                             | bool                          | Default `true`                                                                                                     |
| `isReadOnly(input)`                                       | bool                          | Default `false` (assume writes)                                                                                    |
| `isDestructive(input)`                                    | bool                          | Default `false`                                                                                                    |
| `checkPermissions(input, ctx)`                            | `Promise<PermissionResult>`   | Default allow                                                                                                      |
| `toAutoClassifierInput(input)`                            | unknown                       | Compact representation for the auto-mode security classifier; `''` to skip                                         |
| `mapToolResultToToolResultBlockParam(content, toolUseId)` | function                      | API-bound result serialization                                                                                     |
| `renderToolUseMessage(input, options)`                    | React.ReactNode               | Streaming-safe (input is `Partial<>`)                                                                              |

### 3.2 Optional fields (heavily used)

| Field                                                                                                                                                                                                                                  | Purpose                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `aliases` (`:368-371`)                                                                                                                                                                                                                 | Backwards-compatibility for renamed tools                                                            |
| `searchHint` (`:373-378`)                                                                                                                                                                                                              | One-line keyword-match phrase for `ToolSearch` (deferred-loading optimization)                       |
| `inputJSONSchema` (`:393-397`)                                                                                                                                                                                                         | MCP tools that pass JSON Schema directly                                                             |
| `outputSchema` (`:398-400`)                                                                                                                                                                                                            | Zod output schema (optional today, marked TODO to make required)                                     |
| `inputsEquivalent(a, b)`                                                                                                                                                                                                               | For dedup — same call detected even when input objects differ syntactically                          |
| `interruptBehavior(): 'cancel'                                                                                                                                                                                                         | 'block'` (`:407-416`)                                                                                | What happens when the user submits during the run |
| `isSearchOrReadCommand(input)` (`:417-433`)                                                                                                                                                                                            | Returns `{isSearch, isRead, isList}` for compact UI rendering                                        |
| `isOpenWorld(input)`, `requiresUserInteraction()`, `isMcp`, `isLsp`                                                                                                                                                                    | Capability flags                                                                                     |
| `shouldDefer` (`:438-442`)                                                                                                                                                                                                             | Sent with `defer_loading:true`; requires ToolSearch                                                  |
| `alwaysLoad` (`:443-449`)                                                                                                                                                                                                              | Never deferred; via MCP `_meta['anthropic/alwaysLoad']`                                              |
| `mcpInfo` (`:450-455`)                                                                                                                                                                                                                 | `{serverName, toolName}` — unnormalized origin for MCP tools                                         |
| `strict` (`:466-472`)                                                                                                                                                                                                                  | API-strict mode (gated on `tengu_tool_pear`)                                                         |
| `backfillObservableInput(input)` (`:474-481`)                                                                                                                                                                                          | Mutates a clone before observers see it; original (cache-bound) input untouched                      |
| `validateInput`, `preparePermissionMatcher`, `getPath`                                                                                                                                                                                 | Tool-specific gates                                                                                  |
| `userFacingNameBackgroundColor`, `getToolUseSummary`, `getActivityDescription`                                                                                                                                                         | UI sugar                                                                                             |
| `isTransparentWrapper()` (`:528-533`)                                                                                                                                                                                                  | REPL etc. — wrapper renders nothing; inner calls render natively                                     |
| `extractSearchText(out)` (`:580-599`)                                                                                                                                                                                                  | Transcript-search index source-of-truth, must match `renderToolResultMessage` text or counts diverge |
| Render variants: `renderToolResultMessage`, `renderToolUseProgressMessage`, `renderToolUseQueuedMessage`, `renderToolUseRejectedMessage`, `renderToolUseErrorMessage`, `renderGroupedToolUse`, `renderToolUseTag`, `isResultTruncated` | All optional with documented fallbacks                                                               |
| `mapToolResultToToolResultBlockParam`                                                                                                                                                                                                  | The API serialization (required)                                                                     |

### 3.3 `ToolUseContext` (the per-call context)

`Tool.ts:158-300`, ~50 fields. Highlights relevant for the AGI CLI:

- `options.tools`, `options.commands`, `options.mcpClients`, `options.mcpResources`, `options.agentDefinitions`, `options.thinkingConfig`, `options.maxBudgetUsd`, `options.querySource`, `options.refreshTools` (mid-query MCP reconnect).
- Hooks UI: `setToolJSX`, `addNotification`, `appendSystemMessage`, `sendOSNotification` (iTerm2/Kitty/Ghostty/bell), `setStreamMode`, `setHasInterruptibleToolInProgress`.
- Caches: `readFileState`, `nestedMemoryAttachmentTriggers`, `loadedNestedMemoryPaths`, `dynamicSkillDirTriggers`, `discoveredSkillNames`.
- Concurrency: `setInProgressToolUseIDs`, `agentId`, `agentType`, `requireCanUseTool` (overrides hook auto-approval — used by speculation file-path rewriting).
- Recovery state: `localDenialTracking` (for async subagents whose `setAppState` is no-op), `contentReplacementState` (per-thread tool-result budget), `criticalSystemReminder_EXPERIMENTAL`, `preserveToolUseResults` (in-process teammates).
- `requestPrompt(sourceName, summary)` (`:267-273`) — interactive prompts; only set in REPL contexts.
- `renderedSystemPrompt` (`:294-299`) — cached per-turn so `forkSubagent` can share the parent's prompt cache (re-rendering at fork-spawn diverges due to GrowthBook cold→warm).

### 3.4 `buildTool(def)` — defaults factory (`:756-792`)

`TOOL_DEFAULTS` fills in fail-closed defaults: `isConcurrencySafe → false`, `isReadOnly → false`, `isDestructive → false`, `checkPermissions → allow` (defers to general permissions), `toAutoClassifierInput → ''` (skip — security-relevant tools must override), `userFacingName → name`. Type-level spread (`BuiltTool<D>`) preserves arity and literal types.

### 3.5 `Tools = readonly Tool[]` collection (`:697-701`)

Used everywhere a tool array flows; forces immutability and makes call-sites grep-friendly.

### 3.6 Key gap vs apps/cli

The reference `Tool` interface bundles **rendering, permissions, classifier serialization, deferred-loading metadata, and observability hooks** alongside execution. The Rust `tools.rs` (3,109 LOC) is invoke-shaped — it doesn't have:

- A typed `searchHint`/`shouldDefer`/`alwaysLoad` triad for tool-search.
- `extractSearchText` for transcript indexing.
- `backfillObservableInput` for legacy/derived field migration without busting prompt caching.
- `interruptBehavior()` on a per-tool basis.
- `toAutoClassifierInput` — auto-mode security classifier feature.
- `inputsEquivalent` for dedup.
- `renderGroupedToolUse` for multi-instance compaction.

These would all need to be added (or explicitly chosen against) to reach feature parity for "auto-mode" / large tool sets.

---

## 4. `tools.ts` — registry pattern (389 LOC)

`getAllBaseTools()` (`tools.ts:193-251`) is the **single source of truth for what tools could be available in the current environment** — feature-flag gates via `feature(...)`, env var gates via `process.env.USER_TYPE === 'ant'`, gate-and-include patterns. Inline comment notes this MUST stay in sync with `https://console.statsig.com/.../claude_code_global_system_caching` to share the system prompt prompt-cache across users.

Categories of tools (read off the imports + array):

- **File ops**: `FileReadTool`, `FileEditTool`, `FileWriteTool`, `NotebookEditTool`.
- **Shell/code**: `BashTool`, `PowerShellTool` (Windows-gated, lazy required), `REPLTool` (ant-only, `:16-19`), `LSPTool` (env-gated, `:224`).
- **Search**: `GlobTool`, `GrepTool` — but skipped entirely if `hasEmbeddedSearchTools()` (ant builds use bun-embedded bfs/ugrep aliased into `find`/`grep` shell, `:198-201`).
- **Web**: `WebFetchTool`, `WebSearchTool`, `WebBrowserTool` (gated).
- **Agentic loop**: `AgentTool` (subagent), `TaskOutputTool`, `TaskStopTool`, `EnterPlanModeTool`, `ExitPlanModeV2Tool`.
- **Skills**: `SkillTool`.
- **Worktrees**: `EnterWorktreeTool`, `ExitWorktreeTool` (gated on `isWorktreeModeEnabled()`).
- **Tasks v2** (gated on `isTodoV2Enabled()`): `TaskCreateTool`, `TaskGetTool`, `TaskUpdateTool`, `TaskListTool`. (Replaces `TodoWriteTool`.)
- **Briefs / push notifications** (KAIROS): `BriefTool`, `SendUserFileTool`, `PushNotificationTool`, `SubscribePRTool`.
- **Workflows / cron / monitor / sleep / proactive**: `WorkflowTool`, cron triple, `SleepTool`, `MonitorTool`.
- **MCP**: `ListMcpResourcesTool`, `ReadMcpResourceTool`.
- **Tool search**: `ToolSearchTool` (when `isToolSearchEnabledOptimistic()`, `:249`).
- **Coordinator/teams**: `getTeamCreateTool()`, `getTeamDeleteTool()`, `getSendMessageTool()` (lazy `require` to break circular deps, `:62-72`), `ListPeersTool`, `TungstenTool`, `ConfigTool` (ant-only).
- **Plan verification**: `VerifyPlanExecutionTool` (env-gated `CLAUDE_CODE_VERIFY_PLAN`).
- **Tests**: `TestingPermissionTool`, `OverflowTestTool`, `CtxInspectTool`, `TerminalCaptureTool`, `SnipTool` (HISTORY_SNIP), `RemoteTriggerTool`.

Two specialised assemblers downstream:

- `getTools(permissionContext)` (`:271-327`): filters by deny rules, applies REPL hiding (when REPLTool is enabled, primitives like Bash/Read/Edit are removed because REPL wraps them), filters by `isEnabled()`. Has a `CLAUDE_CODE_SIMPLE` mode that returns just `[BashTool, FileReadTool, FileEditTool]` (+ coordinator tools when active).
- `assembleToolPool(permissionContext, mcpTools)` (`:345-367`): the **one place** that combines built-in + MCP. Two-phase sort + uniqBy ensures built-ins are a contiguous prefix so the global cache breakpoint (which is placed by the server after the last prefix-matched built-in) doesn't get invalidated by MCP-tool insertions. **This is a non-obvious correctness constraint we'd need to copy if we want shared system-prompt caching at the gateway.**

`filterToolsByDenyRules(tools, ctx)` (`:262-269`) uses the same matcher as the runtime permission check (step 1a) so MCP server-prefix rules like `mcp__server` strip every tool from that server before the model sees them.

`TOOL_PRESETS = ['default']` (`:161-163`) — only one preset shipped today.

---

## 5. `Task.ts` + `tasks.ts` — Task data structure & lifecycle

### 5.1 Types

`Task.ts`:

```ts
TaskType =
  'local_bash' |
  'local_agent' |
  'remote_agent' |
  'in_process_teammate' |
  'local_workflow' |
  'monitor_mcp' |
  'dream'; // :6-13
TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'; // :15-20
isTerminalTaskStatus(status); // :27-29
```

`isTerminalTaskStatus` (`:27-29`) gates against injecting messages into dead teammates, evicting finished tasks, and orphan-cleanup paths.

### 5.2 Task ID generation

`generateTaskId(type)` (`:98-106`):

- One-letter prefix per type from `TASK_ID_PREFIXES` (`:79-87`) — `b`/`a`/`r`/`t`/`w`/`m`/`d`.
- 8 chars from `randomBytes(8)` mod 36 over `'0123456789abcdefghijklmnopqrstuvwxyz'` (no uppercase — case-insensitive-safe, comment notes "36^8 ≈ 2.8 trillion combinations, sufficient to resist brute-force symlink attacks", `:94-96`).

This pattern matters because task-output files are referenced by id (`getTaskOutputPath(id)` from `utils/task/diskOutput.js`).

### 5.3 `Task` polymorphic interface (`:72-76`)

```ts
type Task = { name: string; type: TaskType; kill(taskId, setAppState): Promise<void> };
```

Comment confirms only `kill` is dispatched polymorphically anymore (`:69-71`); spawn/render were never polymorphic and were removed in #22546. Spawn/kill calls use `getTaskByType(type)?.kill(...)`.

### 5.4 `TaskStateBase` (the JSONL/AppState shape, `:44-57`)

```ts
{ id, type, status, description, toolUseId?, startTime, endTime?, totalPausedMs?, outputFile, outputOffset, notified }
```

`outputFile` + `outputOffset` is a **streaming append pattern** — tasks write to disk and the UI tails from `outputOffset` so a teammate's transcript is always paginated, never fully buffered in memory.

### 5.5 `tasks.ts` — registry (39 LOC)

Mirrors the tools.ts pattern:

```ts
getAllTasks() = [LocalShellTask, LocalAgentTask, RemoteAgentTask, DreamTask,
                 ...LocalWorkflowTask?, ...MonitorMcpTask?]                    // :22-32
getTaskByType(type)                                                            // :37-39
```

Two tasks gated on `feature(...)`: `LocalWorkflowTask` (WORKFLOW_SCRIPTS) and `MonitorMcpTask` (MONITOR_TOOL).

### 5.6 Lifecycle persistence

Task state lives in `AppState` (typing only, the actual store), not in the session JSONL. This is the **separation-of-concerns** insight: long-running tasks are AppState-resident; the JSONL records only the user/assistant/tool turn that spawned them. `getTaskOutputPath(id)` (`Task.ts:4`, imported) lives outside the session dir so killing a session doesn't delete task output.

---

## 6. `query.ts` + `QueryEngine.ts` — the agent loop

### 6.1 Entry point

`query(params: QueryParams)` (`query.ts:219-239`) is an `AsyncGenerator<StreamEvent | RequestStartEvent | Message | TombstoneMessage | ToolUseSummaryMessage, Terminal>`. It delegates to `queryLoop` (`:241-1729`) and emits "consumed" lifecycle events for slash-commands consumed mid-turn (`:228-238`).

### 6.2 Loop iteration

The state machine is a single `while (true)` (`:307`) that destructures a `State` object (`:204-217`) at the top of each iteration. `State` carries `messages`, `toolUseContext`, `autoCompactTracking`, `maxOutputTokensRecoveryCount`, `hasAttemptedReactiveCompact`, `maxOutputTokensOverride`, `pendingToolUseSummary`, `stopHookActive`, `turnCount`, and the previous-iteration `transition` (used by tests).

Phase order per iteration (the reason the file is 1,729 LOC):

1. **Skill discovery prefetch** (`:331-335`).
2. **Tool result budget** — `applyToolResultBudget` (`:379-394`), persists records to sidechain or session via `recordContentReplacement`.
3. **History snip** (`:401-410`, HISTORY_SNIP feature) — removes middle ranges, `snipTokensFreed` plumbed to autocompact.
4. **Microcompact** (`:413-426`) — cache-edit microcompact has deferred boundary message using actual `cache_deleted_input_tokens`.
5. **Context collapse** (`:440-447`) — projects the collapsed view; commit log replayed via `projectView()` on every turn.
6. **Autocompact** (`:453-468`) — full summary-rebuild.
7. **Blocking-limit gate** (`:614-648`) — only when auto-compact disabled; skipped if a recovery path (collapse, reactive-compact, media-recovery) owns recovery.
8. **API streaming** (`:653-893`) — `deps.callModel(...)` returns an async iterable of messages. Per message: backfill observable input (`:746-787`), withhold recoverable errors (`:788-822`), push to `streamingToolExecutor` if enabled (`:836-844`).
9. **Streaming fallback** (`:712-741`) — tombstone partial messages, reset executor.
10. **FallbackTriggeredError** (`:893-953`) — switch model, strip thinking signatures (model-bound), retry.
11. **Post-sampling hooks** (`:999-1009`).
12. **Abort handling** (`:1015-1052`).
13. **No-tool-uses path** (`:1062-1357`): PTL recovery via collapse-drain → reactive-compact, media-error recovery, max_output_tokens escalating retry (`:1188-1256`, capped at `MAX_OUTPUT_TOKENS_RECOVERY_LIMIT=3`), stop-hook handling, token-budget continuation.
14. **Tool execution** (`:1366-1408`) — `streamingToolExecutor.getRemainingResults()` OR `runTools(toolUseBlocks, assistantMessages, canUseTool, ctx)`.
15. **Tool-use summary** (`:1411-1482`) — fire-off Haiku-generated summary that yields next iteration.
16. **Mid-turn drain of queued commands/notifications** (`:1565-1590`).
17. **Memory + skill prefetch consume** (`:1599-1628`).
18. **Refresh tools** mid-turn for newly-connected MCP servers (`:1660-1671`).
19. **Periodic task summary** for `claude ps` (`:1685-1702`, BG_SESSIONS).
20. **Max-turns gate** (`:1704-1712`).
21. **Loop continue** with assembled next-turn `State` (`:1715-1727`).

### 6.3 System prompt construction

`QueryEngine.submitMessage` (`QueryEngine.ts:209-1156`) builds the full prompt:

```ts
fetchSystemPromptParts({ tools, mainLoopModel, additionalWorkingDirectories, mcpClients, customSystemPrompt })
  → { defaultSystemPrompt, userContext: baseUserContext, systemContext }
```

`systemPrompt = asSystemPrompt([
  ...(customPrompt !== undefined ? [customPrompt] : defaultSystemPrompt),
  ...(memoryMechanicsPrompt ? [memoryMechanicsPrompt] : []),
  ...(appendSystemPrompt ? [appendSystemPrompt] : []),
])` (`QueryEngine.ts:321-325`).

Memory-mechanics injection (`:316-319`) only fires when **both** `customPrompt !== undefined` AND `hasAutoMemPathOverride()` is set — explicit caller opt-in.

### 6.4 Cancellation

`AbortController` is the universal cancellation primitive. Threaded through every layer via `toolUseContext.abortController`. `query.ts:1015-1052` is the abort handler — drains `streamingToolExecutor` for synthetic tool_results, runs `chicago MCP cleanup` (auto-unhide + lock release for computer-use), and emits an interruption message unless the abort was a "submit-interrupt" (the queued user message provides context).

`QueryEngine.interrupt()` (`QueryEngine.ts:1158-1160`) just calls `this.abortController.abort()`.

### 6.5 Streaming tool execution (`StreamingToolExecutor`)

When `config.gates.streamingToolExecution` is on (`:561-568`), tools begin executing as soon as their `tool_use` block streams in — overlapping with the rest of the model's response. The aborted-mid-tool path (`:1015-1023`) consumes `getRemainingResults()` so synthetic tool_results are emitted for queued/in-progress tools (preserves the API constraint that every tool_use has a matching tool_result).

### 6.6 Per-conversation `QueryEngine` class

`QueryEngine.ts:184-1177`:

- Constructor takes `QueryEngineConfig` — `cwd`, `tools`, `commands`, `mcpClients`, `agents`, `canUseTool`, `getAppState`, `setAppState`, `initialMessages`, `readFileCache`, custom/append system prompt, `userSpecifiedModel`, `fallbackModel`, `thinkingConfig`, `maxTurns`, `maxBudgetUsd`, `taskBudget`, `jsonSchema`, `replayUserMessages`, `handleElicitation`, `setSDKStatus`, `abortController`, `orphanedPermission`, `snipReplay`.
- Stateful per-conversation: `mutableMessages`, `permissionDenials[]`, `totalUsage`, `discoveredSkillNames`, `loadedNestedMemoryPaths`.
- `submitMessage(prompt, options)` (`:209-1156`) — one turn:
  1. Build system prompt parts.
  2. `processUserInput` to handle slash commands, expand pasted text refs, check for non-query short-circuits.
  3. Push user input to `mutableMessages`, `recordTranscript(messages)` BEFORE entering the query loop — so a kill-mid-request still leaves a resumable transcript (`:436-449`).
  4. Yield `system` init message via `buildSystemInitMessage`.
  5. If `!shouldQuery` (a non-querying slash command), yield local-command output and `result` then return.
  6. File-history snapshots (`:641-654`) for each user message, gated on `fileHistoryEnabled() && persistSession`.
  7. The big `for await ... of query(...)` loop (`:675-1049`) — handles `compact_boundary` flushes (`:701-715`), `progress` recording (`:771-783`), `attachment` recording, structured-output capture, `max_turns_reached` short-circuit, `max_budget_usd` short-circuit, snip replay (`:897-915`), `compact_boundary` GC (releases pre-compaction messages, `:922-933`).
  8. Result message — extracts text from last assistant or last user-with-tool_result (`:1058-1117`); diagnostic prefix `[ede_diagnostic] ...` for `error_during_execution` so debugging stays specific.

- `interrupt()` / `getMessages()` / `getReadFileState()` / `getSessionId()` / `setModel()` (`:1158-1176`).

- The `ask()` convenience wrapper (`:1186-1295`) creates a single-shot QueryEngine with `snipReplay` injected when HISTORY_SNIP is enabled (`:1276-1284`) — this is how feature-gated strings stay outside `QueryEngine.ts` itself.

---

## 7. `history.ts` — Up-arrow / ctrl+r prompt history (464 LOC)

### 7.1 Format

JSONL at `~/.claude/history.jsonl` (single global file, **shared across all projects**, `:115`). Mode 0o600, `appendFile` mode 0o600, file-locked (`utils/lockfile`) with stale=10 s, retries=3, minTimeout=50 ms (`:308-314`). Locked because multiple `claude` processes can be writing simultaneously.

`LogEntry` shape (`:219-225`):

```ts
{ display, pastedContents: Record<number, StoredPastedContent>, timestamp, project, sessionId? }
```

### 7.2 Pasted content handling

Two storage modes (`:25-32`):

- **Inline** for `content.length <= 1024` (`MAX_PASTED_CONTENT_LENGTH`, `:20`).
- **Hash reference** otherwise — `hashPastedText(content)` and fire-and-forget `storePastedText(hash, content)` to a separate paste-store (`:381-393`). Reads back via `retrievePastedText(hash)` (`:230-260`).

References in display text are formatted as `[Pasted text #1 +10 lines]` or `[Image #2]` (`:43-60`). `parseReferences(input)` (`:62-75`) finds all refs; `expandPastedTextRefs(input, pastedContents)` (`:81-100`) inlines them at their original offsets (reverse iteration so earlier offsets stay valid). Image refs are left as-is — they become content blocks, not inlined text.

### 7.3 Reading

`readLinesReverse(historyPath)` (`utils/fsOperations`) — newest-first, append-only-friendly. `makeLogEntryReader()` (`:106-143`) starts with in-memory `pendingEntries` then `readLinesReverse`, applying `skippedTimestamps` filter for current-session removed entries.

`getHistory()` (`:190-217`) — current-project history, with current session's entries first (so concurrent sessions don't interleave their up-arrow lists). Capped at `MAX_HISTORY_ITEMS = 100` (`:19`).

`getTimestampedHistory()` (`:162-180`) — for ctrl+r picker; deduped by display text, lazy `resolve()` for paste contents (picker only reads display+timestamp).

### 7.4 Concurrency / cleanup

- `pendingEntries` buffer + `currentFlushPromise`. `flushPromptHistory(retries)` retries up to 5× with 500 ms backoff (`:329-353`).
- `registerCleanup` on first use (`:418-431`) — at process exit, awaits in-flight flush then runs final flush.
- `removeLastFromHistory()` (`:453-464`) — Esc-undo path. Pops from pending buffer if still there; otherwise adds the timestamp to `skippedTimestamps` so reads filter it. One-shot: clears `lastAddedEntry` so a second Esc is no-op.

### 7.5 Tungsten tmux sessions skip

`isEnvTruthy(process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY)` (`:413-415`) — set by `tmuxSocket.ts` for verification/test sessions so they don't pollute the user's real history.

---

## 8. `cost-tracker.ts` + `costHook.ts`

### 8.1 Cost computation

`addToTotalSessionCost(cost, usage, model)` (`cost-tracker.ts:278-323`) is the entry point invoked per assistant message. Side effects:

1. Update per-model `ModelUsage` map via `addToTotalModelUsage` (`:250-276`) — tracks `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `webSearchRequests`, `costUSD`, `contextWindow`, `maxOutputTokens`.
2. `addToTotalCostState(cost, modelUsage, model)` updates the bootstrap-state aggregate.
3. OpenTelemetry: `getCostCounter().add(cost, attrs)`, `getTokenCounter().add(...)` for input/output/cacheRead/cacheCreation. `attrs` includes `{model, speed: 'fast'}` when fast-mode + speed=='fast' (`:286-289`).
4. **Advisor recursion** (`:303-321`) — `getAdvisorUsage(usage)` returns advisor-tool inferences (e.g. tool-output advisor); each one has its own model and gets its own `addToTotalSessionCost(...)` call recursively.

`calculateUSDCost(model, usage)` (imported from `utils/modelCost`) reads the per-model price book; for unknown models, `setHasUnknownModelCost()` is set and the warning surfaces in `formatTotalCost` (`:228-244`).

### 8.2 Persistence

Cost state is persisted to **project config** (not session JSONL): `saveCurrentSessionCosts(fpsMetrics?)` (`:143-175`) writes `lastCost`, `lastAPIDuration`, `lastAPIDurationWithoutRetries`, `lastToolDuration`, `lastDuration`, `lastLinesAdded`/`Removed`, `lastTotalInputTokens`/`Output`/`CacheRead`/`CacheCreation`, `lastTotalWebSearchRequests`, `lastFpsAverage`/`Low1Pct`, `lastModelUsage` (per-model), `lastSessionId`. Keyed-by-session: `getStoredSessionCosts(sessionId)` (`:87-123`) only returns data when `projectConfig.lastSessionId === sessionId`. **One slot per project**, single most-recent session.

`restoreCostStateForSession(sessionId)` (`:130-137`) is what `--resume` calls so accumulated costs survive a session restart.

### 8.3 UI surfacing

`formatTotalCost()` (`:228-244`) is the chalk-dimmed multi-line block: `Total cost / Total duration (API,wall) / Total code changes / Usage by model`.

`formatModelUsage()` (`:181-226`) accumulates by canonical model name (so `claude-opus-4-7` and `claude-opus-4-7-20250229` aggregate into "Opus 4.7"), prints `inputs/outputs/cache read/cache write/web search ($cost)`.

`costHook.ts:6-22` is the React `useCostSummary(getFpsMetrics?)` hook that:

- Registers `process.on('exit', f)`.
- On exit: writes `formatTotalCost()` to stdout if `hasConsoleBillingAccess()`.
- Calls `saveCurrentSessionCosts(getFpsMetrics?.())`.

Tiny file (22 LOC) but it's the only hook that re-runs the persistence-on-exit path; QueryEngine-level cost flushing is via `enrichLogs` and other read paths.

---

## 9. `commands.ts` — slash-command registry (754 LOC)

### 9.1 Top-level imports

90+ command modules. Categorisation:

- **Session control**: `clear`, `compact`, `resume`, `rewind`, `share`, `summary`, `rename`, `tag`, `exit`, `desktop`, `chrome`, `mobile`.
- **Permissions/plan**: `permissions`, `plan`, `sandbox-toggle`, `effort`, `fast`, `passes`, `output-style`.
- **Account / auth**: `login`, `logout`, `oauth-refresh` (internal-only), `usage`, `extra-usage`, `rate-limit-options`, `cost`, `stats`, `privacy-settings`.
- **Init / setup**: `init`, `init-verifiers` (internal-only), `terminalSetup`, `keybindings`, `theme`, `color`, `vim`, `statusline`, `add-dir`.
- **Plugins / skills / agents**: `plugin`, `reload-plugins`, `skills`, `agents`, `agents-platform` (ant-only), `hooks`, `mcp`, `memory`.
- **Git / IDE**: `commit`, `commit-push-pr`, `branch`, `diff`, `pr_comments`, `ide`, `install-github-app`, `install-slack-app`, `files`.
- **Review / autofix**: `review`, `ultrareview`, `security-review`, `bughunter`, `autofix-pr`, `feedback`, `issue`, `release-notes`.
- **Ant-only / experimental**: `assistant` (KAIROS), `bridge` (BRIDGE_MODE), `remoteControlServer` (DAEMON+BRIDGE_MODE), `voice` (VOICE_MODE), `force-snip` (HISTORY_SNIP), `workflows` (WORKFLOW_SCRIPTS), `web` (CCR_REMOTE_SETUP), `subscribe-pr` (KAIROS_GITHUB_WEBHOOKS), `ultraplan` (ULTRAPLAN), `torch` (TORCH), `peers` (UDS_INBOX), `fork` (FORK_SUBAGENT), `buddy` (BUDDY), `proactive` (PROACTIVE/KAIROS), `brief` (KAIROS/KAIROS_BRIEF).
- **Diagnostic**: `doctor`, `heapdump`, `ant-trace`, `perf-issue`, `ctx_viz`, `context`, `mock-limits`, `bridge-kick`, `version`, `debug-tool-call`, `backfill-sessions`, `break-cache`, `good-claude`, `btw`, `stickers`, `advisor`, `thinkback`, `thinkback-play`.
- **Lazy**: `usageReport` (named `insights`, `:190-202`) — defers the 113 KB `commands/insights.js` until the slash command is actually invoked.

### 9.2 Memoization pattern

`COMMANDS = memoize(() => [...])` (`:258-346`) — declared as a function so we don't run it until `getCommands` is called (commands read from config at module init time, which would be too early).

`loadAllCommands(cwd)` (`:449-469`) is also memoized — it concurrently fetches `getSkills(cwd)` (`:353-398`), `getPluginCommands()`, `getWorkflowCommands(cwd)`. Returns commands in **strict order**: `bundledSkills, builtinPluginSkills, skillDirCommands, workflowCommands, pluginCommands, pluginSkills, COMMANDS()` (so user skills shadow built-ins by name). `getCommands(cwd)` (`:476-517`) re-applies `meetsAvailabilityRequirement` and `isCommandEnabled` per call (auth state can change mid-session via `/login`).

### 9.3 `meetsAvailabilityRequirement(cmd)` (`:417-443`)

Per-command `availability: ('claude-ai' | 'console')[]` — used to gate provider-specific commands. Universal when omitted. Console = direct 1P API customer (not 3P, not claude.ai, not gateway).

### 9.4 Bridge-mode safety

`REMOTE_SAFE_COMMANDS: Set<Command>` (`:619-637`) — commands that are safe in `--remote` (only affect local TUI state, no filesystem/git/shell/IDE/MCP dependency). Used to pre-filter before REPL renders, to prevent local-only commands appearing during the race with CCR init.

`BRIDGE_SAFE_COMMANDS: Set<Command>` (`:651-660`) — explicit allowlist of `local`-type commands that are safe to execute when input arrives over the Remote Control bridge (mobile/web client). PR #19134 originally blanket-blocked all slash commands from bridge inbound (the `/model` from iOS popping the local Ink picker bug); this allowlist is the relaxed replacement.

`isBridgeSafeCommand(cmd)` (`:672-676`): `local-jsx` always blocked (Ink UI), `prompt` always allowed (text expansion), `local` requires explicit opt-in.

### 9.5 Skills

Two distinct accessors:

- `getSkillToolCommands(cwd)` (`:563-581`) — for `SkillTool`: shows ALL prompt-based commands the model can invoke (skills + commands).
- `getSlashCommandToolSkills(cwd)` (`:586-608`) — for the slash-command tool: only commands explicitly identified as skills (`loadedFrom='skills'|'plugin'|'bundled'` or `disableModelInvocation`).

Both memoized; both cleared via `clearCommandsCache()` (`:534-539`).

`getMcpSkillCommands(mcpCommands)` (`:547-559`) — filters MCP-provided prompt-type, model-invocable, non-disabled commands. Gated on `feature('MCP_SKILLS')`.

### 9.6 Internal-only commands

`INTERNAL_ONLY_COMMANDS` (`:225-254`) is a list of 23 commands eliminated from external builds. Conditionally appended to `COMMANDS` only when `process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO` (`:343-345`).

---

## 10. Inventory cross-refs

### 10.1 Session resume `--resume` (inventory §5.15)

- `--continue` resumes the latest session in cwd (uses `getLastSessionLog(sessionId)` at `:3869-3932`, primes `getSessionMessages` cache to skip a second full file read on REPL mount).
- `--resume` opens a search box (paste a PR URL to find the matching session) — uses `searchSessionsByCustomTitle` (`:3065`) and `loadAllProjectsMessageLogsProgressive`.
- Resume path: `switchSession(asSessionId(...))` → `resetSessionFilePointer()` → `restoreSessionMetadata({...})` → `adoptResumedSessionFile()` (`:1530-1534` — sets `project.sessionFile = getTranscriptPath()`, `reAppendSessionMetadata(true)`).
- Cost restore: `restoreCostStateForSession(sessionId)` (`cost-tracker.ts:130-137`).
- Loading: `loadTranscriptFile(filePath, opts)` (`:3472`) returns the full message map + 16 metadata maps + leafUuids; `buildConversationChain(messages, leafMessage)` walks parent links from the latest leaf.

### 10.2 Checkpoints + `/rewind`

- `file-history-snapshot` entries (`recordFileHistorySnapshot`, `:1085-1099`) are written per-message by `fileHistoryMakeSnapshot` for each `selectableUserMessages` (`QueryEngine.ts:641-654`).
- `/rewind` uses these snapshots (out of scope) to restore code; the conversation transcript is restored by tombstoning messages after a chosen point (`removeTranscriptMessage(uuid)`, `:1472-1474` → `Project.removeMessageByUuid(uuid)` at `:871-951`).
- Double-Esc keybinding behavior: `clearPendingHistoryEntries`, `removeLastFromHistory` (`history.ts:436-464`).

### 10.3 `/fork`

- New session ID, copy current `mutableMessages` chain into a fresh session file. The fork command (`commands/fork`) is FORK_SUBAGENT-gated (`commands.ts:113-117`).
- `recordSidechainTranscript(messages, agentId, startingParentUuid)` (`:1451-1462`) is the underlying primitive — fork inherits the parent chain via `startingParentUuid`.
- The sidechain dedup bypass (`:1242-1244`) is what makes fork inheritance work without losing parent messages on persist.

### 10.4 `/continue`

- Resume the latest session in cwd: `getLastSessionLog(sessionId)` + `adoptResumedSessionFile()`. The CLI flag `--continue` is implemented via the same path as the slash command.

### 10.5 `--print` (`-p`)

- Headless / non-interactive mode. `QueryEngine.submitMessage()` is called via `print.ts` → `ask()` (`QueryEngine.ts:1186-1295`).
- Bare-mode handling: `isBareMode()` is checked in `appendEntry`, `materializeSessionFile`, `getAuthTokenSource`, `getAnthropicApiKeyWithSource`. In bare mode, no transcripts are persisted, no keychain reads, only `--settings` flag-sourced apiKeyHelper.
- `getCommandsByMaxPriority('next')` for queued commands (`query.ts:1570-1578`).

### 10.6 OAuth scopes

- `ALL_OAUTH_SCOPES` (referenced from `constants/oauth.js`) is the default for non-inference-only logins.
- `CLAUDE_AI_INFERENCE_SCOPE` is the marker scope; `shouldUseClaudeAIAuth(scopes)` checks for it (`oauth/client.ts:38-40`).
- `CLAUDE_AI_PROFILE_SCOPE` (referenced in `auth.ts:7, :1582`) — required for `/api/oauth/profile` calls; setup-tokens lack this scope, so `validateForceLoginOrg` fails with a guided message.
- Scope expansion on refresh (`auth.ts:1531-1538`): refresh requests omit explicit scopes for Claude.ai users to allow expansion, sends explicit scopes for non-Claude.ai (so console tokens don't pick up consumer-only scopes).

---

## 11. Architectural patterns relevant to AGI Workforce

1. **Per-session JSONL is the right primitive** for an offline-first, append-only conversation store. Compression is **not** done — the engineering trade-off is that a 4 GB session file's read costs are amortised by head/tail-only metadata reads + walk-chain-before-parse byte-level pre-filtering. The session file is also the **sync primitive** for the "Cross-device" feature mentioned in inventory §2.6 (mobile/desktop transcripts unify because both write to and read from compatible JSONL).
2. **Sidecar metadata files** (`.meta.json` for subagents, `remote-agent-*.meta.json` for CCR sessions) avoid versioning the JSONL whenever a new capability ships.
3. **Tail re-append for mutable metadata** (`reAppendSessionMetadata`) is what makes the resume picker fast.
4. **Read-path migration** (legacy `progress` bridging, fallback `firstPrompt` chain) — never rewrite session files in place.
5. **Lazy session-file materialization** — buffered metadata until first user/assistant message — avoids orphan files at startup.
6. **PKCE + dual-URL OAuth** (automatic + manual paste) gives a single flow that works on headless servers and over SSH; the manual flow uses a publicly-redirected `MANUAL_REDIRECT_URL` page that displays the code for paste.
7. **File-locked OAuth refresh** (`lockfile.lock(claudeDir)`) + disk-mtime invalidation is the only way to handle multiple `claude` processes without double-refresh / token-revocation regress.
8. **In-flight 401 dedup + per-token Map** is necessary when N proxy connectors hit 401 simultaneously.
9. **`Tool` interface includes rendering, classifier serialization, deferred-loading, and dedup metadata** — not just execute/permissions.
10. **`assembleToolPool` cache-stability ordering** (built-ins as contiguous prefix) is a non-obvious correctness constraint for shared-prompt-cache backends.
11. **`Task` type only dispatches `kill`** — spawn/render are concrete per-task; this avoids polymorphism overhead in the steady-state.
12. **Remote-bridge command allowlists** (`REMOTE_SAFE_COMMANDS`, `BRIDGE_SAFE_COMMANDS`) are the right way to safely cross the bridge into mobile.

---

## 12. Concrete gaps for `apps/cli/`

Comparing the reference's storage/auth surface with `apps/cli/src/{auth.rs (1,429 LOC), sessions.rs (870 LOC), oauth.rs (448 LOC), tools.rs (3,109 LOC)}`:

**G-1 — Sessions:** `apps/cli/src/sessions.rs` uses **SQLite (rusqlite)** via `Connection` (`sessions.rs:82, :142`), with `pub fn open_db`, `save_session`, `save_message`, `list_sessions`, `load_session`, `delete_session`, `rename_session`, `archive_session`, `search_sessions`, `search_session_messages`, `fork_session`, `record_tool_call`, `migrate_json_conversations` (`:628`). This is the inverse of the reference design — the reference deliberately avoided a database to get filesystem-grade atomicity (append + ftruncate). For Hobby/Pro launch, the architectural question is: **do we want claude-code-style `~/.agiworkforce/projects/<sanitized-cwd>/<session>.jsonl` for parity with the dotfile blueprint (memory file `comp-dotfile-architectures.md`), or stay on SQLite?** Reference stores subagents/remote agents as sidecar JSONLs; SQLite would need parallel `subagent_messages` and `remote_agents` tables and would lose the "grep ~/.claude/projects/\* for that thing I said" debugging story.

**G-2 — Resume + checkpoints:** Reference has `loadTranscriptFile` returning 17 keyed metadata maps; CLI's `load_session` returns `Vec<Message>` only. To match `--rewind`/checkpoints we'd need `file-history-snapshot` and `attribution-snapshot` row types in the DB and a `Project.removeMessageByUuid` analogue (probably trivial in SQL: `DELETE FROM messages WHERE uuid IN (...)` + clean up dangling parent_uuid pointers). Memory file `dual-store-root-cause.md` already flagged a similar mismatch at the chat-store level.

**G-3 — OAuth multi-org:** `apps/cli/src/auth.rs` (1,429 LOC) and `oauth.rs` (448 LOC) likely cover PKCE (the reference is 23 + 198 + 566 lines, so 448 LOC is plausible). What we need to verify is `forceLoginOrgUUID` enforcement + the always-fetch-from-/api/oauth/profile pattern (`auth.ts:1923-2000`). The reference's lockfile-based refresh-token coordination across processes is the tricky bit; Rust's `fs2`/`fd-lock` would be the equivalent. Without disk-mtime invalidation, multi-terminal users will see /login regress (inc-3930-class).

**G-4 — `apiKeyHelper` (BYOK external command) + trust gating:** The reference's SWR cache + epoch-based clearing (`auth.ts:456-589`) and the `isApiKeyHelperFromProjectOrLocalSettings()` trust check (`:546-555`) are non-trivial. We currently support BYOK env vars + keychain; if we want to match the "user's enterprise has a key-rotating helper script" use-case we need the same SWR + trust-gated semantics. **The trust gating (refusing to execute a project-settings-sourced helper before workspace trust)** is an easy-to-miss security property — without it, a malicious `.agiworkforce/settings.local.json` could exfiltrate creds.

---

## 13. Closing observations

The reference codebase's storage and auth layers are not simple — they encode hundreds of concrete bug fixes, race-condition handlers, and cross-process coordination primitives behind interfaces that look small. Replicating any subset is straightforward only if you take the documented invariants (cache stability, tail metadata window, sidechain dedup bypass, lockfile race handling) at face value. The right strategy for AGI Workforce is **not** to reimplement the full reference surface but to (a) lock the on-disk format to JSONL-with-sidecars so future migration is purely read-path, (b) port the file-locked + disk-mtime-invalidated OAuth refresh because multi-tab regress is the #1 user-visible auth bug, and (c) match the `Tool` interface's rendering+classification+deferred-loading triad before the tool count exceeds ~30 (below which deferred loading is a non-issue, above which token costs blow up).

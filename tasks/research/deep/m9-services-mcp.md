# M9 — `services/mcp/` (Claude Code reference)

> **Scope.** All 23 files at `~/Desktop/reference/src/services/mcp/`, totalling **12,310 LOC**. Two giants — `client.ts` (3,348 LOC) and `auth.ts` (2,465 LOC) — plus `useManageMCPConnections.ts` (1,141), `config.ts` (1,578), `xaa.ts` (511), `xaaIdpLogin.ts` (487), `channelNotification.ts` (316), `elicitationHandler.ts` (313), `types.ts` (258), `channelPermissions.ts` (240), `claudeai.ts` (164), `headersHelper.ts` (138), `SdkControlTransport.ts` (136), `vscodeSdkMcp.ts` (112), `mcpStringUtils.ts` (106), `oauthPort.ts` (78), `channelAllowlist.ts` (76), `MCPConnectionManager.tsx` (72), `officialRegistry.ts` (72), `InProcessTransport.ts` (63), `utils.ts` (575), `envExpansion.ts` (38), `normalization.ts` (23). All cited line numbers are absolute file:line. (Audit-mandate flagged `client.ts` at 3,348 — file actually has **3,348 LOC**; auth.ts mandate said 2,465 — file actually has **2,465 LOC**. Both confirmed by `wc -l`.)

---

## 1. `client.ts` — the per-server MCP client

### 1.1 Transport switching matrix (`connectToServer`, `client.ts:595-1641`)

`connectToServer` is a `lodash.memoize` over `getServerCacheKey(name, serverRef)` (`client.ts:581-586` → `${name}-${jsonStringify(serverRef)}`). It dispatches on `serverRef.type` — **8 transport branches** plus an SDK-only branch handled by `print.ts`:

| `serverRef.type`                          | Transport                                                                                                                               | File:line           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `'sse'`                                   | `SSEClientTransport` w/ `ClaudeAuthProvider` + step-up wrapper                                                                          | `client.ts:619-677` |
| `'sse-ide'`                               | `SSEClientTransport`, no auth (lockfile token TODO)                                                                                     | `client.ts:678-707` |
| `'ws-ide'`                                | `WebSocketTransport` w/ `X-Claude-Code-Ide-Authorization` header (`client.ts:712-714`)                                                  | `client.ts:708-734` |
| `'ws'`                                    | `WebSocketTransport` w/ optional session-ingress JWT                                                                                    | `client.ts:735-783` |
| `'http'`                                  | `StreamableHTTPClientTransport` + `ClaudeAuthProvider` + step-up wrapper. Skips ingress token if OAuth tokens present (`client.ts:812`) | `client.ts:784-865` |
| `'sdk'`                                   | Throws "should be handled in print.ts" — handled separately by `setupSdkMcpClients` (`client.ts:3262-3346`)                             | `client.ts:866-867` |
| `'claudeai-proxy'`                        | `StreamableHTTPClientTransport` against `MCP_PROXY_URL/{server_id}` w/ Bearer token + retry (`client.ts:868-904`)                       | `client.ts:868-904` |
| `'stdio'` (or undef) — `claude-in-chrome` | In-process Chrome MCP server via `createLinkedTransportPair()` (avoids 325 MB subprocess)                                               | `client.ts:905-924` |
| `'stdio'` — `computer-use` (Chicago)      | Same in-process pattern                                                                                                                 | `client.ts:925-943` |
| `'stdio'` (default)                       | `StdioClientTransport` w/ `subprocessEnv()`, `stderr:'pipe'`, optional `CLAUDE_CODE_SHELL_PREFIX` wrap                                  | `client.ts:944-958` |

The **client identifies itself** as `{name:'claude-code', title:'Claude Code', version:MACRO.VERSION, description:"Anthropic's agentic coding tool", websiteUrl:PRODUCT_URL}` with `capabilities:{roots:{}, elicitation:{}}` (`client.ts:985-1002`). The empty `elicitation:{}` is deliberate — sending `{form:{}, url:{}}` breaks Java MCP SDK servers (Spring AI) whose Elicitation class fails on unknown properties (`client.ts:996-998`).

### 1.2 Streamable-HTTP Accept-header guard (`client.ts:466-471, 502-510`)

Servers enforcing the Streamable-HTTP spec reject POSTs without `Accept: application/json, text/event-stream` (HTTP 406). The MCP SDK sets it inside `StreamableHTTPClientTransport.send()` but some runtimes/agents drop it before the wire. `wrapFetchWithTimeout` re-asserts the header at the last hop (`client.ts:507-510`), citing `anthropics/claude-agent-sdk-typescript#202`.

### 1.3 Fresh-timeout wrapper (`client.ts:474-550`)

Without this wrap, a single `AbortSignal.timeout()` created at connect time goes stale after 60s, failing every later request with "The operation timed out." `wrapFetchWithTimeout` makes a fresh `AbortController` + `setTimeout(..., 60_000)` per request, `clearTimeout`s on completion (the audit calls out a Bun-specific 2.4 KB/req lazy-GC issue `client.ts:512-523`). GET requests are excluded — they're long-lived SSE streams (`client.ts:496-500`).

### 1.4 Connection lifecycle (`client.ts:1216-1402`)

After `client.connect(transport)` resolves:

1. **Capabilities** read via `client.getServerCapabilities()`, `getServerVersion()`, `getInstructions()` (`client.ts:1157-1171`). Instructions truncated to `MAX_MCP_DESCRIPTION_LENGTH = 2048` (`client.ts:217-218`) — OpenAPI-generated MCP servers dump 15-60 KB of endpoint docs.
2. **Default elicitation handler** set to `{action:'cancel'}` (`client.ts:1191-1197`) — covers the gap between connect and `registerElicitationHandler` overwriting it in `useManageMCPConnections.ts:331`.
3. **Error handler** (`client.ts:1266-1371`): tracks consecutive terminal errors (`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `EHOSTUNREACH`, `ECONNREFUSED`, `EADDRINUSE`, `Body Timeout Error`, `terminated`, `SSE stream disconnected`, `Failed to reconnect SSE stream`; `client.ts:1249-1263`). After **3** consecutive terminal errors it calls `closeTransportAndRejectPending` (`client.ts:1357-1360`). Special-cases `Maximum reconnection attempts` from the SDK (closes immediately) and HTTP-404 + JSON-RPC `-32001` → session expired.
4. **Close handler** (`client.ts:1374-1402`): clears `connectToServer.cache`, `fetchToolsForClient.cache`, `fetchResourcesForClient.cache`, `fetchCommandsForClient.cache`, optional `fetchMcpSkillsForClient.cache`. Next call reconnects fresh.
5. **Cleanup** (`client.ts:1404-1570`): for stdio, escalates SIGINT (100 ms) → SIGTERM (400 ms) → SIGKILL with 600 ms failsafe — many servers (especially Docker containers) need explicit signals because `StdioClientTransport.close()` only sends an abort signal.

### 1.5 Connection batching + dedup (`client.ts:2218-2402`)

`getMcpToolsCommandsAndResources` partitions configs into local (stdio/sdk) and remote, runs each through `pMap` (replaces the older fixed-batch implementation per the comment at `client.ts:2212-2217` — fixed batches blocked the next batch on the slowest connection). Concurrency: **3** for local, **20** for remote (`client.ts:552-561`, env-overridable via `MCP_SERVER_CONNECTION_BATCH_SIZE` and `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`).

A **15-minute negative cache** (`client.ts:257-316`, file-backed at `~/.claude/mcp-needs-auth-cache.json`) skips repeat connection attempts to remote servers that returned 401. Combined with `hasMcpDiscoveryButNoToken` (`auth.ts:349-363`), this avoids 30+ wasted OAuth round-trips on every CC start when tokens have been cleared.

### 1.6 Tool catalog → Claude tool format (`fetchToolsForClient`, `client.ts:1743-1998`)

LRU-memoized over server name with `MCP_FETCH_CACHE_SIZE = 20` (`client.ts:1726, 1996-1998`). Pipeline:

1. `client.request({method:'tools/list'}, ListToolsResultSchema)` (`client.ts:1752-1755`).
2. `recursivelySanitizeUnicode(result.tools)` strips zero-width/control chars (`client.ts:1758`).
3. For each MCP tool → `Tool` object (`client.ts:1767-1989`):
   - **Name**: `mcp__<normalized-server>__<normalized-tool>` via `buildMcpToolName` (`mcpStringUtils.ts:50-52`). Skipped when `client.config.type === 'sdk' && CLAUDE_AGENT_SDK_MCP_NO_PREFIX` (`client.ts:1761-1763`).
   - **searchHint**: collapses whitespace from `tool._meta['anthropic/searchHint']` (`client.ts:1779-1784`).
   - **alwaysLoad**: from `tool._meta['anthropic/alwaysLoad']` (`client.ts:1785`).
   - **isReadOnly / isConcurrencySafe**: from `tool.annotations.readOnlyHint` (`client.ts:1795-1799`).
   - **isDestructive / isOpenWorld**: from `annotations.destructiveHint` / `openWorldHint` (`client.ts:1804-1809`).
   - **isSearchOrReadCommand**: delegated to `classifyMcpToolForCollapse` (`client.ts:1810-1812`).
   - **checkPermissions**: returns `{behavior:'passthrough', suggestions:[{type:'addRules', rules:[{toolName:fullyQualifiedName}], behavior:'allow', destination:'localSettings'}]}` — every MCP call requires explicit allow (`client.ts:1814-1832`).
   - **call**: routes through `callMCPToolWithUrlElicitationRetry` (`client.ts:1833-1971`), with one auto-retry on `McpSessionExpiredError`. Wraps SDK `Error`/`McpError` in `TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` so error names + JSON-RPC codes survive (`client.ts:1937-1967`).
4. Filter via `isIncludedMcpTool` — `mcp__ide__*` tools whitelisted to `executeCode`, `getDiagnostics` only (`client.ts:567-573`).
5. Chrome and Computer-Use MCP servers get tool overrides via `getClaudeInChromeMCPToolOverrides` / `getComputerUseMCPToolOverrides` (`client.ts:1977-1987`).

### 1.7 Resources, prompts, IDE-RPC

- `fetchResourcesForClient` (`client.ts:2000-2031`): `resources/list` → `ServerResource[]` w/ `server: client.name` annotation. LRU 20.
- `fetchCommandsForClient` (`client.ts:2033-2107`): `prompts/list` → `Command[]` w/ `name: 'mcp__<server>__<prompt>'`, `getPromptForCommand` re-runs `client.getPrompt({name, arguments: zipObject(argNames, argsArray)})` and pipes through `transformResultContent` (`client.ts:2073-2095`). Uses `prompt.name` not `prompt.title` to avoid spaces breaking slash-command parsing (`client.ts:2066-2069`).
- `callIdeRpc` (`client.ts:2116-2128`): typed wrapper for IDE tool RPC.

### 1.8 Tool-result transformation (`transformResultContent`, `client.ts:2478-2591`; `processMCPResult`, `client.ts:2720-2799`)

Switch on `resultContent.type`:

- `'text'` → `{type:'text', text}`.
- `'audio'` → `persistBlobToTextBlock` writes to disk, returns text block w/ filepath (`client.ts:2490-2502`).
- `'image'` → resize/downsample via `maybeResizeAndDownsampleImageBuffer`, base64 source (`client.ts:2503-2523`).
- `'resource'` → text inline; if image blob → resize+inline; else `persistBlobToTextBlock` (`client.ts:2524-2574`).
- `'resource_link'` → `[Resource link: name] uri (description)` (`client.ts:2575-2587`).

`processMCPResult` invokes `transformMCPResult` (`client.ts:2662-2706`, three result shapes — `toolResult` legacy, `structuredContent`, `content[]`), checks `mcpContentNeedsTruncation` (`client.ts:2734`), and either:

- **truncates** (legacy mode, env override, or content contains images), or
- **persists to disk** with `persistToolResult` and emits `getLargeOutputInstructions(filepath, originalSize, formatDescription)` so the model can read the file later (`client.ts:2767-2798`).

### 1.9 URL-elicitation retry (`callMCPToolWithUrlElicitationRetry`, `client.ts:2813-3027`)

When a tool throws `McpError` with code `ErrorCode.UrlElicitationRequired` (= -32042), the error data carries an array of `ElicitRequestURLParams`. The function:

1. Validates each `{mode:'url', url, elicitationId, message}` (`client.ts:2886-2897`).
2. Runs `runElicitationHooks` first — hooks can resolve programmatically (`client.ts:2923-2941`).
3. If no hook handles it: in print/SDK mode delegates to `handleElicitation` callback; in REPL mode pushes onto `state.elicitation.queue` w/ a two-phase consent/waiting flow (`client.ts:2944-2997`).
4. Runs `runElicitationResultHooks` post-response (`client.ts:2999-3022`).
5. Loops back to retry the tool call. Cap: **3** retries (`client.ts:2850`).

### 1.10 Tool execution + timeout + 401 + session-expired (`callMCPTool`, `client.ts:3029-3245`)

- **Timeout**: defaults `MCP_TOOL_TIMEOUT_MS = 100_000_000` (~27.8 hours, `client.ts:209-211`); env-overridable. Implemented as a `Promise.race` against the SDK call because the SDK's internal timeout sometimes doesn't fire if the SSE stream breaks mid-request (`client.ts:3068-3122`).
- **Progress**: forwards `sdkProgress` via `onprogress` callback into `mcp_progress` events (`progress`, `total`, `progressMessage`); also logs "still running (Ns)" every 30s (`client.ts:3055-3066`).
- **isError handling**: extracts text from first content block, throws `McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(errorDetails, telemetryMessage, mcpMeta)` (`client.ts:3124-3149`).
- **401 detection**: `error.code === 401 || error instanceof UnauthorizedError` → `McpAuthError` (`client.ts:3196-3208`).
- **Session expiry**: `isMcpSessionExpiredError(e)` (404 + `-32001`) OR `code === -32000 && message.includes('Connection closed') && config.type === 'http'|'claudeai-proxy'` → `clearServerCache` + `McpSessionExpiredError` (`client.ts:3217-3231`). The retry loop in the tool's `call` handler catches `McpSessionExpiredError` and calls `ensureConnectedClient` to get a fresh session (`client.ts:1911-1922`, `1688-1704`).

### 1.11 SDK MCP servers (`setupSdkMcpClients`, `client.ts:3262-3346`)

For SDK-mode (`type:'sdk'`): creates an `SdkControlClientTransport` per server, connects, fetches tools. Communication is in-process via the control-channel pattern documented in `SdkControlTransport.ts` — the CLI's MCP Client `send()` wraps the JSONRPC message into a control request `{server_name, request_id}`, which goes over stdout to the SDK process; the SDK's StructuredIO routes the response back to the transport which calls `onmessage` (`SdkControlTransport.ts:14-37`).

### 1.12 In-process linked transports (`InProcessTransport.ts`)

`createLinkedTransportPair()` returns two `Transport` instances that pipe `send()` from one side to the other side's `onmessage` via `queueMicrotask` (`InProcessTransport.ts:32-35`). Used for `claude-in-chrome` (avoids 325 MB subprocess) and `computer-use` MCP servers.

### 1.13 Helper: `claude.ai` proxy fetch retry (`createClaudeAiProxyFetch`, `client.ts:372-422`)

For `claudeai-proxy` transport. Attaches `Authorization: Bearer ${OAuthToken}`. On 401, calls `handleOAuth401Error(sentToken)` — only if it returns true (token actually changed) does it retry, otherwise it accepts the 401 to avoid double round-trips for permanently-needs-auth servers.

---

## 2. `auth.ts` — OAuth 2.0 + DCR + paste-callback fallback + XAA

### 2.1 OAuth metadata discovery (`fetchAuthServerMetadata`, `auth.ts:256-311`)

Three-tier fallback:

1. **Configured `authServerMetadataUrl`** (HTTPS-only enforced at line 264) — direct fetch.
2. **RFC 9728 → RFC 8414 chain** via `discoverOAuthServerInfo` (`auth.ts:282-291`): probe `/.well-known/oauth-protected-resource` for `authorization_servers[0]`, then RFC 8414.
3. **Path-aware fallback** via `discoverAuthorizationServerMetadata(url)` — only when URL has a non-`/` path; the SDK's own fallback already strips the path (`auth.ts:302-310`).

### 2.2 Slack-quirk normalizer (`normalizeOAuthErrorBody`, `auth.ts:147-191`)

Slack OAuth returns HTTP 200 for errors with `{error:'invalid_grant'}` body. Without this wrap, the SDK's `executeTokenRequest` skips `parseErrorResponse` and feeds the error to `OAuthTokensSchema.parse()` → opaque ZodError → `request_failed`. The wrap detects 2xx POSTs that match `OAuthErrorResponseSchema` and rewrites them to a 400 Response so SDK's normal error class mapping runs. Also normalizes Slack non-standard codes `invalid_refresh_token`, `expired_refresh_token`, `token_expired` → `invalid_grant` (`auth.ts:147-189`).

### 2.3 OAuth port discovery (`oauthPort.ts`)

- Windows port range `[39152, 49151]`; macOS/Linux `[49152, 65535]` (`oauthPort.ts:9-12`) — Windows reserves the dynamic range above 49151 for the system.
- Random selection up to 100 attempts (`oauthPort.ts:36-77`); fallback fixed port **3118**; env override `MCP_OAUTH_CALLBACK_PORT`.
- `buildRedirectUri(port)` → `http://localhost:${port}/callback` per RFC 8252 §7.3 (loopback redirects match any port; path must match) (`oauthPort.ts:21-25`).

### 2.4 OAuth flow orchestration (`performMCPOAuthFlow`, `auth.ts:847-1342`)

1. **XAA fork** at the top (`auth.ts:871-901`): if `serverConfig.oauth?.xaa` set, dispatches to `performMCPXaaAuth` (no browser if id_token cached). Hard-fails if `CLAUDE_CODE_ENABLE_XAA` env not set — no silent fallback to consent flow.
2. **Pre-flight cache read** (`auth.ts:903-935`): pulls cached `stepUpScope` and `discoveryState.resourceMetadataUrl` BEFORE clearing tokens, then clears, then uses cached values to drive the new flow without an extra probe.
3. **Port + redirect URI** (`auth.ts:959-966`): `oauth.callbackPort` from config or random port.
4. **`ClaudeAuthProvider`** instantiated with `handleRedirection=true` and `onAuthorizationUrl` callback (`auth.ts:968-975`).
5. **Metadata fetch** stored on provider (`auth.ts:978-999`).
6. **State generation** (`provider.state()`) — base64url 32 random bytes (`auth.ts:1473-1480`). Used for OAuth state CSRF check.
7. **HTTP server** on the redirect port (`auth.ts:1099-1196`): handles `/callback` w/ query params `code`, `state`, `error`, `error_description`, `error_uri`. State mismatch → 400 + reject. XSS-sanitized error strings via `xss()` (`auth.ts:1123-1126`).
8. **Paste-callback fallback** (`auth.ts:1056-1097`): when `options.onWaitingForCallback` provided (remote/Codespaces/SSH UX), exposes a `submit(callbackUrl)` function so the user can paste the redirect URL manually. Same state validation. Localhost server still listens too — first to resolve wins.
9. **Server.unref() + 5-min timeout** (`auth.ts:1202-1213`): doesn't pin the event loop; abortSignal from React unmount is the intended lifecycle.
10. **`sdkAuth(provider, {serverUrl, scope, resourceMetadataUrl})`** runs the redirect (`auth.ts:1178-1190`).
11. **Code exchange** with `sdkAuth(provider, {serverUrl, authorizationCode, resourceMetadataUrl})` (`auth.ts:1219-1224`).
12. **Failure attribution telemetry** (`auth.ts:1259-1342`): maps to one of `cancelled | timeout | provider_denied | state_mismatch | port_unavailable | sdk_auth_failed | token_exchange_failed | unknown` (`auth.ts:84-92`). On `invalid_client + Client not found`, clears stored DCR client_id+secret so retry re-registers (`auth.ts:1306-1318`).

### 2.5 `ClaudeAuthProvider` — the `OAuthClientProvider` impl (`auth.ts:1376-2360`)

All OAuth state lives in `getSecureStorage()` → OS keychain on macOS/Windows (file-backed elsewhere). Per-server keying via `getServerKey(name, config)` = `${name}|sha256(json({type,url,headers}))[:16]` (`auth.ts:325-341`).

| Method                               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | File:line   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------- | ----------- |
| `redirectUrl`                        | Returns the loopback `http://localhost:port/callback`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `1409-1411` |
| `clientMetadata`                     | `client_name="Claude Code (<server>)"`, `redirect_uris`, `grant_types:[authorization_code, refresh_token]`, `token_endpoint_auth_method:'none'` (public client). Adds `scope` if metadata declares it.                                                                                                                                                                                                                                                                                                                                                                             | `1417-1437` |
| `clientMetadataUrl`                  | **CIMD (SEP-991)**: URL-based client_id when AS advertises `client_id_metadata_document_supported`. Defaults to `MCP_CLIENT_METADATA_URL`; env override via `MCP_OAUTH_CLIENT_METADATA_URL`.                                                                                                                                                                                                                                                                                                                                                                                       | `1445-1452` |
| `state()`                            | 32-byte base64url, lazy-init per instance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `1473-1480` |
| `clientInformation()`                | Returns stored `{client_id, client_secret}`; falls back to `serverConfig.oauth?.clientId` + secret from `mcpOAuthClientConfig`; undefined → triggers DCR.                                                                                                                                                                                                                                                                                                                                                                                                                          | `1482-1511` |
| `saveClientInformation(...)`         | Persists DCR result into `mcpOAuth[serverKey]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `1513-1538` |
| `tokens()`                           | Returns `OAuthTokens` with `access_token`, `refresh_token`, `expires_in`, `scope`, `token_type:'Bearer'`. **XAA silent path** fires when `oauth.xaa` set + no refresh token + token expiring (`auth.ts:1585-1615`); cached id_token → no browser. **Step-up path** omits refresh_token when `_pendingStepUpScope` present so SDK falls through to PKCE (RFC 6749 §6 forbids refresh-based scope elevation — `auth.ts:1625-1650`). **Proactive refresh** fires when token expires in ≤300s; reuses existing in-flight promise to dedupe concurrent refreshes (`auth.ts:1645-1685`). | `1540-1702` |
| `saveTokens(tokens)`                 | Writes `accessToken`, `refreshToken`, `expiresAt = Date.now() + (expires_in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |             | 3600)\*1000`, `scope`. Clears `\_pendingStepUpScope`. | `1704-1731` |
| `xaaRefresh()`                       | Internal — silent id_token → access_token via `performCrossAppAccess`. Soft-fails to undefined; clears id_token cache on `XaaTokenExchangeError.shouldClearIdToken`. **TODO:** cross-process lockfile (only `_refreshInProgress` dedupes within process).                                                                                                                                                                                                                                                                                                                          | `1751-1850` |
| `redirectToAuthorization(url)`       | Captures `state`, `scope` from URL params, persists `stepUpScope` for transport-attached providers (`!handleRedirection`). Calls `onAuthorizationUrlCallback(url)` then `openBrowser(url)` (unless `skipBrowserOpen`). Validates http/https scheme.                                                                                                                                                                                                                                                                                                                                | `1852-1944` |
| `saveCodeVerifier` / `codeVerifier`  | In-memory PKCE verifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `1946-1958` |
| `invalidateCredentials(scope)`       | Five scopes: `'all'`, `'client'`, `'tokens'`, `'verifier'`, `'discovery'` (`stepUpScope` reset under `discovery`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `1960-1995` |
| `saveDiscoveryState(state)`          | Persists ONLY `authorizationServerUrl` + `resourceMetadataUrl`, **not** the full metadata blob — macOS keychain `security -i` stdin has a 4096-byte line limit; full metadata overflows two-server install (#30337). SDK re-fetches missing metadata on next auth.                                                                                                                                                                                                                                                                                                                 | `1997-2035` |
| `discoveryState()`                   | Returns cached state; falls through to configured `authServerMetadataUrl` if set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `2037-2088` |
| `refreshAuthorization(refreshToken)` | Cross-process lockfile at `~/.claude/mcp-refresh-${sanitizedKey}.lock` w/ 5 retries × ~1.5s jittered backoff (`auth.ts:2090-2175`). Re-reads tokens after acquire — another process may have refreshed. Calls `_doRefresh`.                                                                                                                                                                                                                                                                                                                                                        | `2090-2175` |
| `_doRefresh(refreshToken)`           | 3 attempts. Metadata sourced from in-memory cache → persisted discovery state → full RFC 9728/8414 re-discovery (`auth.ts:2222-2249`). Calls `sdkRefreshAuthorization`. On `InvalidGrantError`: re-checks if another process refreshed (winning if so), else `invalidateCredentials('tokens')`. Retries on timeouts + `ServerError`/`TemporarilyUnavailableError`/`TooManyRequestsError` w/ 1s, 2s, 4s exponential backoff.                                                                                                                                                        | `2177-2360` |

### 2.6 RFC 7009 token revocation (`revokeServerTokens`, `auth.ts:467-618`)

Best-effort. Refresh token revoked first (long-lived → invalidating it cascades on most servers). Auth method picked from metadata: prefers `revocation_endpoint_auth_methods_supported` over `token_endpoint_auth_methods_supported`; chooses `client_secret_basic` unless only `client_secret_post` is supported (`auth.ts:505-517`). RFC 7009 says public clients should use `client_id` in body (no Authorization header), but if the server returns 401 it retries with `Authorization: Bearer <accessToken>` (`auth.ts:434-456`). Local storage is always cleared regardless of server-side success (`auth.ts:575-617`); optional `preserveStepUpState` keeps `stepUpScope`/`discoveryState` for re-auth UX.

### 2.7 Step-up auth detection (`wrapFetchWithStepUpDetection`, `auth.ts:1354-1374`)

Watches every fetch response for HTTP 403 + `WWW-Authenticate: insufficient_scope, scope="..."` and calls `provider.markStepUpPending(scope)`. The provider's `tokens()` then omits `refresh_token` so the SDK skips refresh and falls through to redirect → step-up scope persistence. Without this, the SDK's authInternal sees refresh_token → refreshes (uselessly per RFC 6749 §6) → 'AUTHORIZED' → retry → 403 → aborts with "Server returned 403 after trying upscoping" — never reaching `redirectToAuthorization`. (Tracked at `anthropics/claude-code#28258`.)

### 2.8 Cross-App Access / SEP-990 / XAA (`xaa.ts` + `xaaIdpLogin.ts`)

Two-leg chain that gets an MCP access token without a browser **per server**:

1. **Layer 2**: RFC 8693 token exchange at the IdP — id_token → ID-JAG (`xaa.ts:31-34`):
   - Grant type `urn:ietf:params:oauth:grant-type:token-exchange`
   - Subject token type `urn:ietf:params:oauth:token-type:id_token`
   - Issued token type `urn:ietf:params:oauth:token-type:id-jag`
2. **Layer 2**: RFC 7523 JWT bearer at the AS — ID-JAG → access_token (grant type `urn:ietf:params:oauth:grant-type:jwt-bearer`).
3. **Layer 3**: `performCrossAppAccess(serverUrl, {clientId, clientSecret, idpClientId, idpClientSecret, idpIdToken, idpTokenEndpoint}, serverName)` orchestrates PRM discovery → AS discovery → both legs. Handles RFC 9728 §3.3 resource-mismatch validation (`xaa.ts:152-163`).
4. **Token redaction**: `SENSITIVE_TOKEN_RE` redacts `access_token|refresh_token|id_token|assertion|subject_token|client_secret` from logs (`xaa.ts:91-97`).
5. **`XaaTokenExchangeError.shouldClearIdToken`** — true for 4xx / `invalid_grant` / `invalid_token` (id_token bad → clear); false for 5xx (IdP down → keep). 200 with structurally-invalid body → clear (`xaa.ts:73-83`).

`xaaIdpLogin.ts` runs the **single** authorization_code + PKCE flow at the IdP, caches the id_token in keychain by issuer (`saveIdpIdToken`, `xaaIdpLogin.ts:109-123`); `getCachedIdpIdToken` returns undefined within `ID_TOKEN_EXPIRY_BUFFER_S = 60` of expiry (`xaaIdpLogin.ts:99-107`). One IdP login → N silent MCP server auths.

### 2.9 Manual client-secret entry (`readClientSecret`, `auth.ts:2362-2397`)

Reads from `MCP_CLIENT_SECRET` env var or, in TTY mode, prompts on stderr with raw-mode stdin (no echo). Cancels on Ctrl-C (``).

---

## 3. Configuration layer (`config.ts`, `types.ts`, `envExpansion.ts`)

### 3.1 Config schemas (`types.ts`)

`McpServerConfigSchema` is a Zod discriminated union of **8 variants** (`types.ts:124-135`):

- `McpStdioServerConfigSchema` — `type:'stdio'?`, `command`, `args[]`, `env?` (`types.ts:28-35`).
- `McpSSEServerConfigSchema` — `type:'sse'`, `url`, `headers?`, `headersHelper?`, `oauth?` (`types.ts:58-66`).
- `McpSSEIDEServerConfigSchema` — `type:'sse-ide'`, `url`, `ideName`, `ideRunningInWindows?` (internal, IDE extensions only) (`types.ts:69-76`).
- `McpWebSocketIDEServerConfigSchema` — `type:'ws-ide'`, `url`, `ideName`, `authToken?` (`types.ts:79-87`).
- `McpHTTPServerConfigSchema` — `type:'http'`, `url`, `headers?`, `headersHelper?`, `oauth?` (`types.ts:89-97`).
- `McpWebSocketServerConfigSchema` — `type:'ws'`, `url`, `headers?`, `headersHelper?` (`types.ts:99-106`).
- `McpSdkServerConfigSchema` — `type:'sdk'`, `name` (in-process SDK servers) (`types.ts:108-113`).
- `McpClaudeAIProxyServerConfigSchema` — `type:'claudeai-proxy'`, `url`, `id` (claude.ai org-managed connectors) (`types.ts:115-122`).

`oauth` block (`McpOAuthConfigSchema`, `types.ts:43-56`): `clientId?`, `callbackPort?`, `authServerMetadataUrl?` (HTTPS-enforced), `xaa?` (boolean flag).

`ConfigScopeSchema` is `'local' | 'user' | 'project' | 'dynamic' | 'enterprise' | 'claudeai' | 'managed'` (`types.ts:10-20`).

`MCPServerConnection` is a tagged union: `connected | failed | needs-auth | pending | disabled` (`types.ts:221-226`).

### 3.2 Env expansion (`envExpansion.ts`)

Substitutes `${VAR}` and `${VAR:-default}` in any string, returns `{expanded, missingVars[]}`. Used for command, args, env values, URLs, headers (`config.ts:556-616`).

### 3.3 Multi-source config merge + scope precedence (`getClaudeCodeMcpConfigs`, `config.ts:1071-1251`)

Order of precedence (later wins on key collision): plugin < user < project (approved only) < local. Then dedup by **content signature**:

- `getMcpServerSignature(config)` returns `stdio:${json([command, ...args])}` or `url:${unwrapCcrProxyUrl(url)}` (`config.ts:202-212`).
- `dedupPluginMcpServers`: plugin servers suppressed when their signature collides with a manual server (manual wins) or an earlier-loaded plugin (first wins) (`config.ts:223-266`).
- `dedupClaudeAiMcpServers`: claude.ai connectors suppressed when their URL signature matches an enabled manual server — keys never collide (`slack` vs `claude.ai Slack`) so this is necessary (`config.ts:281-310`).

Enterprise mode: if `getEnterpriseMcpFilePath() = ${managedDir}/managed-mcp.json` exists, it's the **only** source — user/project/local/plugin servers are dropped (`config.ts:1083-1096`).

`isRestrictedToPluginOnly('mcp')` — managed policy can lock MCP to plugin-provided only (`config.ts:1100, 1038`).

### 3.4 Allowlist + denylist policy (`config.ts:336-551`)

Three entry shapes: `{serverName}`, `{serverCommand: string[]}`, `{serverUrl: <wildcard*pattern>}` (`config.ts:336-407`). URL patterns support `*` wildcards via `urlPatternToRegex` (`config.ts:320-326`). Denylist always merged from all sources; allowlist may be policy-only when `allowManagedMcpServersOnly: true` (`config.ts:336-355`). Denylist precedence > allowlist > "no allowlist = allow all".

### 3.5 Per-project approval gate (`getProjectMcpServerStatus`, `utils.ts:351-406`)

Project-scoped (`.mcp.json`) servers default to `'pending'` until user approves. Status = `approved | rejected | pending`. Auto-approve in:

- `--dangerously-skip-permissions` mode + `projectSettings` enabled (NOT counting project's own `sessionBypassPermissionsMode` — that's an RCE class) (`utils.ts:376-391`).
- Non-interactive sessions + `projectSettings` enabled (SDK / `claude -p`) (`utils.ts:393-403`).

### 3.6 .mcp.json atomic write (`writeMcpjsonFile`, `config.ts:88-131`)

Reads existing mode → writes to temp file → fdatasync → chmod → atomic rename. Cleans up temp file on failure.

### 3.7 CCR proxy URL unwrapping (`unwrapCcrProxyUrl`, `config.ts:182-193`)

Remote sessions have claude.ai connectors rewritten through the CCR/session-ingress SHTTP proxy at `/v2/session_ingress/shttp/mcp/` or `/v2/ccr-sessions/`. The original vendor URL is preserved in the `mcp_url=` query param. This unwrap lets dedup match a plugin's raw vendor URL against a connector's rewritten URL.

### 3.8 `claudeai.ts` — Claude.ai-managed MCP servers (org-config)

Fetches `${BASE_API_URL}/v1/mcp_servers?limit=1000` with `anthropic-beta: mcp-servers-2025-12-04`, `Authorization: Bearer ${claudeAiOAuthToken}`. Memoized session-lifetime. Eligibility gates:

- `ENABLE_CLAUDEAI_MCP_SERVERS` env not falsy.
- `getClaudeAIOAuthTokens()` present.
- Tokens carry `user:mcp_servers` scope (checked directly, not via `isClaudeAISubscriber()` — the latter falsely returns false in non-interactive mode w/ `ANTHROPIC_API_KEY`).

Display-name → `claude.ai <DisplayName>` w/ `(2)`, `(3)` suffix on collision (`claudeai.ts:99-119`). All entries get `type:'claudeai-proxy', scope:'claudeai'`.

`markClaudeAiMcpConnected(name)` (`claudeai.ts:154-160`) writes to `globalConfig.claudeAiMcpEverConnected[]` — gates the "N connectors unavailable/need auth" startup notification (a connector that worked yesterday and is now failed is news; one the user has demonstrably ignored is not).

### 3.9 Headers helper (`headersHelper.ts`)

Dynamic header generation for SSE/HTTP/WS configs. `config.headersHelper` is a shell command path. Trust-gate: project/local-scoped headers require `checkHasTrustDialogAccepted()` (workspace trust) unless non-interactive (`headersHelper.ts:42-57`). The helper script gets `CLAUDE_CODE_MCP_SERVER_NAME`, `CLAUDE_CODE_MCP_SERVER_URL` env vars (git-credential-helper style — one helper can serve many servers). 10-second timeout. Output must be a JSON object of string → string. Static headers from `config.headers` are merged with dynamic (dynamic wins) by `getMcpServerHeaders` (`headersHelper.ts:125-138`).

### 3.10 Official MCP registry (`officialRegistry.ts`)

Fire-and-forget GET to `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial` at startup; populates a Set of normalized URLs for `isOfficialMcpUrl(url)` checks. Used for trust-tier UI badges. Gated by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` env var.

---

## 4. UI orchestration layer

### 4.1 `useManageMCPConnections` (`useManageMCPConnections.ts`, 1,141 LOC)

The React hook that drives everything. Phases:

1. **Pending init** (`useManageMCPConnections.ts:772-854`): on session change (`/clear`) and `/reload-plugins` (`pluginReconnectKey` increment), reads `getClaudeCodeMcpConfigs(dynamicMcpConfig)`, disconnects stale plugin clients via `excludeStalePluginClients` (`utils.ts:185-224` — flagged stale if plugin+removed-from-config OR config-hash-changed), seeds new clients as `pending` or `disabled`.
2. **Two-phase load** (`useManageMCPConnections.ts:858-1024`): Claude Code configs first (fast — local file reads), then claude.ai configs (slow — network). Both call `getMcpToolsCommandsAndResources(onConnectionAttempt, ...)`.
3. **Per-connect side effects** (`onConnectionAttempt`, `useManageMCPConnections.ts:310-763`):
   - **Connected**: `registerElicitationHandler(client.client, name, setAppState)`; sets `client.onclose` for **automatic exponential-backoff reconnection** (5 attempts, 1s → 30s cap, `useManageMCPConnections.ts:88-90, 371-465`); registers Channel notification handlers (`KAIROS`/`KAIROS_CHANNELS` feature gate) for `notifications/claude/channel` (inbound message — `useManageMCPConnections.ts:507-532`) and `notifications/claude/channel/permission` (`useManageMCPConnections.ts:540-560`); registers `tools/list_changed`, `prompts/list_changed`, `resources/list_changed` notification handlers — each invalidates the relevant fetch cache and refreshes (`useManageMCPConnections.ts:618-751`).
   - **needs-auth | failed | pending | disabled**: no side effects.
4. **Batched state updates** (`useManageMCPConnections.ts:207-308`): pending updates queued, flushed every 16 ms via `setTimeout` to coalesce burst arrivals — avoids React thrashing when 30+ servers all connect at once.

### 4.2 Reconnect + toggle UI surface (`useManageMCPConnections.ts:1043-1126`)

`reconnectMcpServer(name)`: cancels pending timer, calls `reconnectMcpServerImpl`, dispatches result.

`toggleMcpServer(name)`: persists `setMcpServerEnabled` to disk **before** clearing cache (the `onclose` handler reads disk state). Disconnects + cleanup if currently connected. Re-runs `reconnectMcpServerImpl` when enabling.

### 4.3 React context (`MCPConnectionManager.tsx`)

Thin context provider exposing `useMcpReconnect()` and `useMcpToggleEnabled()` hooks. Wraps `useManageMCPConnections` output (`MCPConnectionManager.tsx:38-72`).

### 4.4 VS Code MCP bridge (`vscodeSdkMcp.ts`)

Special internal SDK MCP server named `claude-vscode`. Sets up bidirectional notification channel:

- **`file_updated`** (`vscodeSdkMcp.ts:39-59`): CC → VSCode notification when files are edited/written, so the extension can refresh its diff UI. Fire-and-forget; failures swallowed with debug log.
- **`log_event`** (`vscodeSdkMcp.ts:71-80`): VSCode → CC, re-emitted as `tengu_vscode_${eventName}` analytics.
- **`experiment_gates`** (`vscodeSdkMcp.ts:83-110`): CC → VSCode at handshake — pushes Statsig/GrowthBook gate values (review-upsell, onboarding, browser support, in-band OAuth, auto-mode tri-state).

`USER_TYPE !== 'ant'` short-circuits this (`vscodeSdkMcp.ts:44`) — internal-only protocol.

---

## 5. Channel notifications (Telegram / iMessage / Discord push)

### 5.1 Schema (`channelNotification.ts`)

- **Inbound**: `notifications/claude/channel` w/ `{content: string, meta?: Record<string,string>}` (`channelNotification.ts:37-47`). Wrapped in `<channel source=name attr1="v1" ...>` XML and enqueued into the prompt queue with `priority: 'next'`, `isMeta: true`, `skipSlashCommands: true` (`useManageMCPConnections.ts:523-531`). SleepTool polls `hasCommandsInQueue()` and wakes within 1s.
- **Inbound permission**: `notifications/claude/channel/permission` w/ `{request_id, behavior: 'allow'|'deny'}` (`channelNotification.ts:64-72`).
- **Outbound permission**: `notifications/claude/channel/permission_request` w/ `{request_id, tool_name, description, input_preview}` (`channelNotification.ts:85-95`). Type-only; CC sends, doesn't validate.

### 5.2 Allowlist (`channelAllowlist.ts`)

`tengu_harbor_ledger` GrowthBook feature carries `[{marketplace, plugin}]`. Plugin-level granularity — if a plugin is approved, all its channel servers are. `--channels server:` entries always fail (schema is plugin-only). `--dangerously-load-development-channels` bypasses both checks. The `tengu_harbor` GrowthBook flag is the master kill switch (default off).

### 5.3 Permission relay (`channelPermissions.ts`)

Mirrors the local `BridgePermissionCallbacks` pattern. When a permission dialog opens AND the channel has declared `capabilities.experimental['claude/channel/permission']`, CC sends the prompt request via the channel and races the human's reply against local UI / bridge / hooks / classifier — first resolver wins.

- **Reply format spec** (`channelPermissions.ts:75`): `/^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i`. 5 lowercase letters from a 25-char alphabet (a-z minus `l`); 25⁵ ≈ 9.8M space.
- **Short ID generation** (`shortRequestId`, `channelPermissions.ts:140-152`): FNV-1a hash → base-25 encode. **Profanity blocklist** (`channelPermissions.ts:85-110`) — re-hashes with salt suffix if generated ID contains substrings like `fuck`, `shit`, `nig`, `kike`, `nazi`, etc. (~13,877/9.8M IDs blocked).
- **Truncate preview** (`truncateForPreview`, `channelPermissions.ts:160-167`): 200-char JSON preview to phone-size. Full input remains in local terminal dialog.
- **Trust model** (`channelPermissions.ts:6-23`): the dialog slows a compromised channel server but doesn't stop one — a malicious channel server can fabricate `{request_id, behavior:'allow'}` without the human seeing the prompt; conversely it could social-engineer over time. Accepted risk: a compromised channel already has unlimited conversation-injection turns.

### 5.4 Gate (`useManageMCPConnections.ts:474-614`)

`gateChannelServer(name, capabilities, pluginSource)` returns one of:

- `{action: 'register'}`
- `{action: 'skip', kind: 'capability' | 'session' | 'disabled' | 'auth' | 'policy' | 'marketplace' | 'allowlist', reason}`

UI surfaces a once-per-kind toast (12s) for non-trivial skip kinds (`useManageMCPConnections.ts:584-611`).

---

## 6. Elicitation (form + URL flows)

### 6.1 `elicitationHandler.ts` (313 LOC)

Two elicitation modes per the MCP spec: `'form'` and `'url'`. The handler is registered ONCE per connect (`useManageMCPConnections.ts:331`) — overwrites the default `cancel` handler from `client.ts:1191-1197`.

Flow per request (`elicitationHandler.ts:69-211`):

1. `runElicitationHooks` — hooks can short-circuit (`elicitationHandler.ts:91-107, 214-257`). `blockingError` → `decline`; `elicitationResponse` → forward.
2. Push event onto `appState.elicitation.queue` w/ `{serverName, requestId, params, signal, waitingState, respond, onWaitingDismiss}` (`elicitationHandler.ts:127-150`).
3. UI dialog calls `respond(ElicitResult)` (or aborts via `signal`).
4. `runElicitationResultHooks` post-process — can override action/content or block (`elicitationHandler.ts:264-313`). Always emits `elicitation_response` notification hook for observability.

URL elicitation has a **two-phase consent/waiting flow**: phase 1 user accepts → URL opens (or callback sent in print/SDK mode) → phase 2 shows waitingState (`actionLabel: 'Skip confirmation'` or `'Retry now'` + cancel button). Server emits `notifications/claude/elicitation/complete` with the same `elicitationId` to mark completion (`elicitationHandler.ts:175-207`).

### 6.2 Print/SDK mode (handleElicitation callback)

`callMCPToolWithUrlElicitationRetry` (`client.ts:2944-2997`) accepts an injected `handleElicitation` callback. In print/SDK mode, this delegates to structuredIO (sends a control request out-of-band); in REPL mode, falls back to the queue.

---

## 7. Helpers

### 7.1 `mcpStringUtils.ts` — naming round-trip

- `getMcpPrefix(server)` = `mcp__<normalized>__` (`mcpStringUtils.ts:39-41`).
- `buildMcpToolName(server, tool)` = `mcp__<normalized-server>__<normalized-tool>` (`mcpStringUtils.ts:50-52`).
- `mcpInfoFromString(s)` = `{serverName, toolName?}` from `mcp__server__tool` (joins on `__` for tools containing `__`, but a server name containing `__` parses incorrectly — known limitation, line 12-17).
- `extractMcpToolDisplayName('github - Add comment (MCP)')` strips suffix and prefix.

### 7.2 `normalization.ts` — server-name normalization

`normalizeNameForMCP(name)` = `name.replace(/[^a-zA-Z0-9_-]/g, '_')` matching API regex `^[a-zA-Z0-9_-]{1,64}$`. For `claude.ai *` prefixed names (`claudeai.ts:100`), additionally collapses runs of `_` and strips leading/trailing — prevents the `__` delimiter from being confused with consecutive underscores in normalized display names (`normalization.ts:17-23`).

### 7.3 `utils.ts` — filter/exclude/scope helpers

- `filterToolsByServer / excludeToolsByServer / filterCommandsByServer / excludeCommandsByServer / filterResourcesByServer / excludeResourcesByServer` — by name prefix.
- `commandBelongsToServer` handles two shapes: `mcp__<server>__<prompt>` (MCP prompts) AND `<server>:<skill>` (MCP skills, matching plugin/nested-dir naming) (`utils.ts:52-62`).
- `filterMcpPromptsByServer` — excludes `loadedFrom === 'mcp'` (those are skills, not prompts) for the `/mcp` capabilities display (`utils.ts:85-94`).
- `hashMcpConfig(config)` — `sha256(jsonStringify(config-without-scope, sortedKeys))[:16]` for stale-detection (`utils.ts:157-169`).
- `excludeStalePluginClients(mcp, configs)` — removes `scope:'dynamic'` clients absent from configs OR any-scope clients whose config hash changed (`utils.ts:185-224`).
- `extractAgentMcpServers(agents)` — agent frontmatter → flat `AgentMcpServerInfo[]` for `/mcp` (`utils.ts:466-553`).
- `getLoggingSafeMcpBaseUrl(config)` — strips query string and trailing slash; query strings can leak access tokens (`utils.ts:561-575`).

---

## 8. Per-tool permission integration

Every MCP tool's `checkPermissions()` returns `{behavior: 'passthrough', suggestions: [{type: 'addRules', rules: [{toolName: fullyQualifiedName}], behavior: 'allow', destination: 'localSettings'}]}` (`client.ts:1814-1832`). This forwards the decision to the global permission system, which renders the local "Allow / Allow always / Deny" dialog using:

- The fully-qualified MCP tool name (`mcp__server__tool`) for matching.
- `ALWAYS_ALLOWED_TOOLS` rules in `localSettings`.
- Per-rule `addRules` allow at session/project/user/local scope.

The auto-mode classifier sees MCP inputs encoded via `mcpToolInputToAutoClassifierInput(input, toolName)` = `key=val key=val ...` joined string (`client.ts:1733-1741`), letting eval scripts mirror production encoding.

---

## 9. Cross-references

- `tools/MCPTool/MCPTool.ts` — base Tool definition that `fetchToolsForClient` spreads into per-tool overrides (`client.ts:54`, used at 1770).
- `tools/MCPTool/classifyForCollapse.ts` — `classifyMcpToolForCollapse(server, tool)` returns whether a tool counts as search/read for UI collapse (`client.ts:126`, used at 1811).
- `tools/McpAuthTool/McpAuthTool.ts` — `createMcpAuthTool(name, config)` synthesized when a server is in `needs-auth` state (`client.ts:55, 2318, 2331`); injects an MCP tool that the model can call to trigger the OAuth flow.
- `tools/ListMcpResourcesTool/ListMcpResourcesTool.ts` and `tools/ReadMcpResourceTool/ReadMcpResourceTool.ts` — added once across all servers when any server has resources (`client.ts:53, 56, 2185-2191, 2360-2364`).
- `commands/mcp/*` — interactive `/mcp` slash command surfaces the data this module produces (clients, capabilities, scopes, errors).

---

## 10. Telemetry events emitted

| Event                                                | Trigger                                      | File:line                                       |
| ---------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `tengu_mcp_server_connection_succeeded`              | Connect success                              | `client.ts:1583-1594`                           |
| `tengu_mcp_server_connection_failed`                 | Connect failure                              | `client.ts:1607-1622`                           |
| `tengu_mcp_server_needs_auth`                        | 401 on connect                               | `client.ts:345-349`                             |
| `tengu_mcp_ide_server_connection_{succeeded,failed}` | IDE-specific                                 | `client.ts:1143, 1201`                          |
| `tengu_mcp_session_expired`                          | 404 + -32001 mid-call                        | `client.ts:3228`                                |
| `tengu_mcp_tool_call_auth_error`                     | 401 mid-call                                 | `client.ts:3203`                                |
| `tengu_mcp_claudeai_proxy_401`                       | claude.ai proxy 401 retry                    | `client.ts:403-406`                             |
| `tengu_mcp_tools_commands_loaded`                    | After all servers                            | `client.ts:2448-2452`                           |
| `tengu_mcp_large_result_handled`                     | Output truncation/persistence                | `client.ts:2742, 2761, 2778, 2786`              |
| `tengu_mcp_oauth_flow_start/_success/_error`         | OAuth flow                                   | `auth.ts:877, 939, 1243, 1321`                  |
| `tengu_mcp_oauth_refresh_success/_failure`           | Refresh outcome                              | `auth.ts:2188-2207`                             |
| `tengu_mcp_elicitation_shown/_response`              | Elicitation lifecycle                        | `elicitationHandler.ts:85, 101, 140`            |
| `tengu_mcp_channel_gate/_message`                    | Channel registration / inbound message       | `useManageMCPConnections.ts:492, 515`           |
| `tengu_mcp_list_changed`                             | tools/prompts/resources changed notification | `useManageMCPConnections.ts:637, 651, 675, 713` |
| `tengu_mcp_servers`                                  | Per-scope counts                             | `useManageMCPConnections.ts:997`                |
| `tengu_claudeai_mcp_eligibility`                     | claude.ai org-config fetch eligibility       | `claudeai.ts:44, 54, 70, 124`                   |
| `tengu_builtin_mcp_toggle`                           | enable/disable built-in (computer-use)       | `config.ts:1572`                                |

---

## 11. Edge cases and bug-fixes encoded as comments

1. **Bun lazy-GC of AbortSignal.timeout** — uses explicit `setTimeout` + `clearTimeout` (`client.ts:512-523`).
2. **CPU profile: 7.2% in spawnSync** for keychain reads — `tokens()` does **not** call `clearKeychainCache()` to avoid 30-40 reads/sec under MCP traffic (`auth.ts:1541-1548`, post-PR #19436).
3. **Slack 200-on-error** — see §2.2.
4. **macOS keychain stdin 4096-byte limit** — discoveryState persists URLs only, not full metadata (`auth.ts:2007-2015`, fix-#30337).
5. **EventSource long-lived stream** — eventSourceInit fetch must NOT use the timeout wrapper (`client.ts:643-672`).
6. **SDK transport doesn't call onclose on terminal failures** — bridged via `closeTransportAndRejectPending` after 3 errors or `Maximum reconnection attempts` substring (`client.ts:1224-1262, 1342-1360`).
7. **fixed-batch blocked next batch** — replaced with `pMap`-based scheduling (`client.ts:2212-2217`).
8. **Java MCP SDK servers (Spring AI) fail on unknown elicitation properties** — declare `elicitation:{}` not `{form:{},url:{}}` (`client.ts:996-998`).
9. **OAuth state mismatch + paste callback** — manual paste validates state too (`auth.ts:1059-1085`).
10. **Slack revocation 401 fallback** — RFC 7009 says client_id in body, but if 401 retry with Bearer (`auth.ts:434-456`).
11. **Claude.ai concurrent-401 stampede** — `createClaudeAiProxyFetch` retries only when `handleOAuth401Error` returns `tokenChanged === true` (`client.ts:402-411`).
12. **`sessionBypassPermissionsMode` from project settings** — RCE class; explicitly NOT trusted to gate auto-approval (`utils.ts:379-385`).

---

# Summary (top 7 findings + top 4 gaps)

## Top 7 findings (Claude Code MCP impl)

1. **Eight transport variants** plus an SDK control channel and an in-process linked-pair pattern. The discriminated-union schema (`McpServerConfigSchema`) covers `stdio | sse | sse-ide | ws | ws-ide | http | sdk | claudeai-proxy`. In-process is used for `claude-in-chrome` (saves ~325 MB) and Chicago `computer-use`. SDK mode is end-to-end different — `setupSdkMcpClients` creates `SdkControlClientTransport` instances that route through stdout control messages.
2. **Memoized `connectToServer`** keyed by `name + JSON.stringify(config)`. `client.onclose` clears the cache (and four LRU fetch caches) so the next call reconnects fresh. `ensureConnectedClient` is the safe re-acquire path.
3. **Production-grade OAuth 2.0**: RFC 9728/8414 discovery, RFC 7009 revocation w/ basic+post auth methods, RFC 7591 DCR, **RFC 9068 CIMD/SEP-991** URL-based client_id, **PKCE**, paste-callback fallback for SSH/Codespaces, cross-process lockfile for refresh, **5-attempt 1s/2s/4s backoff** on transient errors, **invalid_grant cross-process race recovery**, and **SEP-990 XAA** (RFC 8693 + RFC 7523 + ID-JAG token type) for enterprise IdP single-sign-on.
4. **Step-up auth**: detects HTTP 403 + `WWW-Authenticate: insufficient_scope, scope=...` in a fetch wrapper, marks pending on the auth provider, omits `refresh_token` from `tokens()` so the SDK falls through to PKCE redirect (refresh can't elevate scope per RFC 6749 §6).
5. **Tool-name protocol**: `mcp__<normalized-server>__<normalized-tool>` with `mcpInfo: {serverName, toolName}` carried separately for permission checks. Skip-prefix mode for SDK MCP servers via `CLAUDE_AGENT_SDK_MCP_NO_PREFIX`. `_meta` flags surface as `searchHint` (whitespace-collapsed) and `alwaysLoad` (boolean). Tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`, `title`) drive UI rendering and concurrency safety.
6. **Result handling**: large outputs (>token threshold) auto-persist to disk via `persistToolResult` and emit `getLargeOutputInstructions` so the model can read the file; images get image-aware truncation (preserves compression). Audio/blobs persist with auto-extension. Resource links serialize to plain text.
7. **Channel notifications + interactive elicitation**: bidirectional notification protocol enables Telegram/iMessage/Discord-as-MCP-server (`notifications/claude/channel`) including structured permission prompts (`notifications/claude/channel/permission_request` + reply schema `(y|yes|n|no) + 5-letter ID from 25-char alphabet, profanity-blocked`). URL elicitations get two-phase consent/waiting UX; form elicitations queue into `appState.elicitation`.

## Top 4 gaps in our `packages/mcp/` (3 src files, 318 LOC total vs 12,310 LOC reference)

1. **No OAuth at all.** `packages/mcp/src/transport.ts` resolves stdio/sse/streamable-http but supports only static `headers`. There is no `ClaudeAuthProvider`, no DCR, no token storage, no PKCE, no paste-callback, no XAA, no step-up. Roughly **2,500 LOC of `auth.ts` + 1,000 LOC of `xaa*.ts`** must port. Without this, the user can never connect to any remote MCP server that requires OAuth (which is essentially every Claude.ai connector and most production third-party servers — Linear, Notion, GitHub remote, Atlassian, Stripe, Sentry, etc.).
2. **No connection lifecycle / reconnect / cache.** `connectMcpServer` returns a handle and walks away. There is no `onerror` / `onclose` bridge, no terminal-error counter (`ECONNRESET`/`ETIMEDOUT`/etc.), no automatic exponential-backoff reconnection (the reference does 5 attempts × 1s→30s with `MAX_RECONNECT_ATTEMPTS = 5`, `useManageMCPConnections.ts:88-90`), no session-expired retry (404+`-32001`), no in-flight-promise dedup for refresh, no per-server cache key, no `clearServerCache` API. A transient WebSocket drop today bricks the whole catalog.
3. **No notifications support** — none of `tools/list_changed`, `prompts/list_changed`, `resources/list_changed`, or elicitation request handlers are wired. We only call `listTools` once at connect time. The spec REQUIRES dynamic refresh; servers like Linear, Slack, Notion mutate their tool inventories live (e.g., when projects are added). We also lack `roots` and `elicitation` capability declarations on the client init — without them, modern servers refuse to expose certain tool flows.
4. **No multi-source config / dedup / scope / approval gate.** The reference distinguishes `local | user | project | dynamic | enterprise | claudeai | managed`, applies allowlist+denylist policy, content-signature dedup of plugin-vs-manual-vs-claude.ai connectors, atomic `.mcp.json` writes, env-var expansion (`${VAR:-default}`), and `getProjectMcpServerStatus` for project-scoped trust prompts. Our `packages/mcp` accepts a flat `Record<string, McpServerConfig>` with no scope, no validation beyond the bare interface, no env expansion. **Plus** no large-output persistence, no image-resize integration, no Claude tool-format metadata (`searchHint`, `alwaysLoad`, `readOnlyHint`, `destructiveHint`, `openWorldHint`, `mcpInfo` for permissions), no normalization round-trip. Today the model literally cannot tell two MCP tools with the same display name apart for permission rule matching.

File written: `/Users/siddhartha/Desktop/agiworkforce/tasks/research/deep/m9-services-mcp.md`.

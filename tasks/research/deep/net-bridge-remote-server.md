# NET / Bridge / Remote / Server / Upstreamproxy / Coordinator / Query / Native-TS

> Scope: 31 files in `~/Desktop/reference/src/bridge/`, 4 in `remote/`, 2 in `upstreamproxy/`, 3 in `server/`, 4 in `query/`, 1 in `coordinator/`, 2 in `native-ts/{color-diff,file-index}` (yoga-layout owned by T5). Full read.
> Inventory cross-ref: `tasks/research/anthropic-claude-suite-may-2026.md` §3 Cowork, §5 Code-CLI, §6.5 Dispatch, §12 Computer Use.

---

## 1. Executive shape

**Two cores, three transports, four-tier auth, one inbound surface our own CLI does not yet attempt.** This is the outbound-only side of Anthropic's Remote Control / Dispatch / Cowork glue: the CLI initiates and registers as a worker against Anthropic's CCR servers, and `claude.ai/code`, the Claude mobile app, and the desktop Cowork tab become the inbound clients steering it. The protocol assumes a server that:

1. Mints work-secret JWTs (`bridge/types.ts:33-51` `WorkSecret`).
2. Speaks both the legacy v1 work-poll and the v2 `cse_*` SSE+CCR worker protocol (`bridge/sessionIdCompat.ts:38-57`).
3. Implements the CCR upstream-proxy MITM-CONNECT WebSocket protocol (`upstreamproxy/relay.ts:1-455`).
4. Validates X-Trusted-Device-Token, environment_secret, session-ingress JWT, and OAuth bearer separately (`bridge/bridgeApi.ts:76-89`).

That is fundamentally different from our existing Desktop bridge on port 8787, which is a _single_ localhost HTTP server that the Tauri shell exposes and that Claude Code CLI calls into. The reference codebase treats the local CLI as the _worker_, not the _server_. To match Anthropic Dispatch / Cowork / Remote Control parity for the v1 surfaces (Mobile → Desktop, Web → Desktop), we have to flip the assumption: our CLI / Desktop process must be capable of registering itself as a long-lived worker against an authenticated cloud service, polling for work, and accepting permission-prompt round-trips initiated by the cloud. That is the central architectural decision implied by everything in `bridge/`, `remote/`, and `server/`.

---

## 2. Directory map (file-by-file, with line cites for the load-bearing parts)

### 2.1 `bridge/` — outbound CCR worker registration

| File                                      | Lines    | Role                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `bridgeMain.ts`                           | 2,999    | `claude remote-control` subcommand. Standalone bridge: arg parse, gate, register environment, run poll loop, manage sessions. Two entry points: `bridgeMain` (interactive TTY at `:1980-2768`) and `runBridgeHeadless` (daemon worker at `:2810-2965`).                                                                                                                                                                  |
| `replBridge.ts`                           | 2,406    | REPL-side `initBridgeCore` — bootstrap-free. Runs _inside_ the live `claude` REPL process; spins up a v1/v2 transport in the same process so the user's local conversation can be mirrored to claude.ai.                                                                                                                                                                                                                 |
| `remoteBridgeCore.ts`                     | 1,008    | The env-less ("v2 final") implementation: skips the Environments API entirely, calls `POST /v1/code/sessions` then `POST /v1/code/sessions/{id}/bridge`, gets a `worker_jwt`, builds an SSETransport+CCRClient, runs JWT refresh and 401-recovery in-process. (`remoteBridgeCore.ts:140-260`.)                                                                                                                           |
| `initReplBridge.ts`                       | 569      | The bootstrap-aware wrapper around `replBridge.ts`. Owns gate checks, OAuth keychain reads, title derivation, perpetual-mode behavior, GrowthBook checks. (`initReplBridge.ts:110-300`.)                                                                                                                                                                                                                                 |
| `replBridgeTransport.ts`                  | 370      | Transport adapter — `createV1ReplTransport` (HybridTransport: WS + POST) vs `createV2ReplTransport` (SSE + CCRClient). Single switch site for the v1↔v2 choice. (`replBridgeTransport.ts:78-103, 119-370`.)                                                                                                                                                                                                              |
| `bridgeApi.ts`                            | 539      | Environments-API HTTP client: register, poll, ack, stop, archive, reconnect, heartbeat. Exception class `BridgeFatalError` (`:56-66`). All path IDs run through `validateBridgeId` regex `^[a-zA-Z0-9_-]+$` (`:41,48-53`). 401 retry hook injected via `onAuth401` (`:106-139`).                                                                                                                                         |
| `bridgeMessaging.ts`                      | 461      | Pure ingress parser + control-request handler. Extracted so v1 and v2 share echo dedup, control_request handling, BoundedUUIDSet ring, and result-message shaping. (`:132-208, 243-391, 399-461`.)                                                                                                                                                                                                                       |
| `bridgeEnabled.ts`                        | 202      | GrowthBook gates: `tengu_ccr_bridge` (the master entitlement), `tengu_bridge_repl_v2`, `tengu_bridge_repl_v2_cse_shim_enabled`, `CCR_AUTO_CONNECT`, `CCR_MIRROR`. (`:28-148, 185-202`.)                                                                                                                                                                                                                                  |
| `bridgeConfig.ts`                         | 48       | Ant-only env override + default OAuth-config base URL resolution. The CLI ships with no flag for "point at a different cloud" — that's deliberate. (`:18-48`.)                                                                                                                                                                                                                                                           |
| `bridgeUI.ts`                             | 530      | Ratatui-equivalent live status renderer for the standalone bridge: spinner, QR code, multi-session bullets.                                                                                                                                                                                                                                                                                                              |
| `bridgeStatusUtil.ts`                     | 163      | Derived status info (`getBridgeStatus`), URL builders, OSC-8 hyperlink, glimmer/shimmer. Where `?bridge={environmentId}` query is added (`:52-58`).                                                                                                                                                                                                                                                                      |
| `bridgeDebug.ts`                          | 135      | Ant-only fault injection wrapping the `BridgeApiClient` so the `/bridge-kick` REPL slash command can simulate 404, 1006, transient register failures. Zero overhead in external builds. (`:54-135`.)                                                                                                                                                                                                                     |
| `debugUtils.ts`                           | 141      | Secret redaction (16-char + first-8 + last-4 mask) for debug logs (`:19-34`). `describeAxiosError`, `extractHttpStatus`, `extractErrorDetail`, `logBridgeSkip`.                                                                                                                                                                                                                                                          |
| `jwtUtils.ts`                             | 256      | `decodeJwtPayload` / `decodeJwtExpiry` (no signature check, base64url-only). `createTokenRefreshScheduler` — generation-counter pattern to invalidate orphan timers, 5-min buffer, 30-min fallback when expiry is opaque, 3-strike retry on missing OAuth token. (`:88-253`.)                                                                                                                                            |
| `trustedDevice.ts`                        | 210      | The X-Trusted-Device-Token enrollment/persistence layer. Memoized read from `getSecureStorage()` so the macOS `security` subprocess (~40 ms) doesn't burn time on every poll. (`:33-87.`) Enrollment is `POST /api/auth/trusted_devices` with display_name `"Claude Code on {hostname} · {platform}"` (`:142-200`). Server-side gate is `account_session.created_at < 10 min` so enrollment must happen during `/login`. |
| `workSecret.ts`                           | 127      | Decode the `WorkSecret` envelope (base64url JSON, version=1 required, `session_ingress_token` validated non-empty). Build the WS SDK URL (`buildSdkUrl` — `wss://…/v1/session_ingress/ws/{id}` for prod, `ws://…/v2/...` for localhost). Build the CCR v2 session URL. `registerWorker` POST (`:97-127`). `sameSessionId` cross-tag comparison (`:62-73`).                                                               |
| `sessionIdCompat.ts`                      | 57       | The `cse_*` ↔ `session_*` translation. Server-injected via `setCseShimGate` so the SDK bundle stays bootstrap-free. (`:21-57`.)                                                                                                                                                                                                                                                                                          |
| `createSession.ts`                        | 384      | The `POST /v1/sessions`, `GET /v1/sessions/{id}`, `POST /v1/sessions/{id}/archive`, `PATCH /v1/sessions/{id}` HTTP wrappers. Different beta header (`ccr-byoc-2025-07-29`) than the Environments API uses (`environments-2025-11-01` at `bridgeApi.ts:38`). Always sends `x-organization-uuid`. (`createSession.ts:138-145, 213-217, 290-294, 351-355.`)                                                                 |
| `codeSessionApi.ts`                       | 168      | The thin wrappers for the env-less path: `createCodeSession` (`POST /v1/code/sessions`) and `fetchRemoteCredentials` (`POST /v1/code/sessions/{id}/bridge`). Each `/bridge` call bumps `worker_epoch` server-side. (`:26-80, 93-168`.)                                                                                                                                                                                   |
| `sessionRunner.ts`                        | 550      | Spawns the child `claude` process with the right env vars (`CLAUDE_CODE_USE_CCR_V2`, `CLAUDE_CODE_WORKER_EPOCH`, `CLAUDE_CODE_SESSION_ACCESS_TOKEN`). NDJSON parser on child stdout extracts `tool_use`/`text`/`result`/`control_request`/`user` for status display + permission forwarding. Token refresh delivered via stdin `update_environment_variables` message (`:527-542`).                                      |
| `inboundMessages.ts`                      | 80       | Image-block normalization: web/iOS clients send `mediaType` (camelCase) instead of `media_type`; without normalization a single bad message poisons the session (`:45-73`).                                                                                                                                                                                                                                              |
| `inboundAttachments.ts`                   | 175      | `file_uuid` → local download → `@path` ref. Files land in `~/.claude/uploads/{sessionId}/{uuidPrefix}-{safeName}`; 8-char filename sanitization; quoted form `@"…"` so home dirs with spaces work (`:97-133`).                                                                                                                                                                                                           |
| `bridgePointer.ts`                        | 210      | Crash-recovery pointer file at `getProjectsDir()/{sanitized-cwd}/bridge-pointer.json`. 4 h mtime TTL matches server's `BRIDGE_LAST_POLL_TTL`. Worktree-aware fanout for `--continue` (max 50 worktrees, `:129-184`).                                                                                                                                                                                                     |
| `pollConfig.ts`                           | 110      | Schema-validated poll-interval config from `tengu_bridge_poll_interval_config` GrowthBook flag. Two object-level refines forbid the "everything off" config (`:74-91`).                                                                                                                                                                                                                                                  |
| `pollConfigDefaults.ts`                   | 82       | `POLL_INTERVAL_MS_NOT_AT_CAPACITY=2000`, `POLL_INTERVAL_MS_AT_CAPACITY=600_000`, `reclaim_older_than_ms=5000`, `session_keepalive_interval_v2_ms=120_000`. Server contract: `BRIDGE_LAST_POLL_TTL=4 h`.                                                                                                                                                                                                                  |
| `flushGate.ts`                            | 71       | State machine to queue live writes during the initial-history POST so the server sees `[history…, live…]` in order.                                                                                                                                                                                                                                                                                                      |
| `capacityWake.ts`                         | 56       | Two-signal abort merger so at-capacity sleeps wake either on shutdown or on a session ending.                                                                                                                                                                                                                                                                                                                            |
| `replBridgeHandle.ts`                     | 36       | Module-level pointer to the active REPL bridge so non-React callers (slash commands, BriefTool) can reach the handle. Same one-bridge-per-process invariant as `bridgeDebug.ts`.                                                                                                                                                                                                                                         |
| `types.ts`                                | 262      | Discriminated union types. `WorkData` is `{type:'session'\|'healthcheck', id}`. `WorkSecret` carries `session_ingress_token`, `api_base_url`, `sources` (git info), `auth`, optional `claude_code_args`, `mcp_config`, `environment_variables`, and the v2 selector `use_code_sessions`. `BridgeWorkerType = 'claude_code'                                                                                               | 'claude_code_assistant'` is narrow but the wire accepts any string. (`:18-115`.) |
| `bridgePermissionCallbacks.ts`            | 43       | Dependency-inversion shim — anything that exposes `sendRequest`/`sendResponse`/`onResponse` looks like a bridge permission callback.                                                                                                                                                                                                                                                                                     |
| `sessionRunner.ts` PermissionRequest type | `:33-43` | The `control_request` shape: `subtype:'can_use_tool'`, `tool_name`, `input`, `tool_use_id`. The bridge forwards exactly this to the server.                                                                                                                                                                                                                                                                              |

### 2.2 `remote/` — REPL-side viewer/control of a CCR session

| File                        | Lines | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RemoteSessionManager.ts`   | 343   | Manages a _remote_ session — the inverse of the bridge: the local REPL is now an inbound client of a session running in CCR. Uses `SessionsWebSocket` for receive, `sendEventToRemoteSession` HTTP POST for send. Permission-request round trip with cancel support (`:108-280`). The `viewerOnly` flag (`:60`) is the seam used by `claude assistant` — Ctrl+C/Escape do NOT send interrupt to the remote agent; 60 s reconnect timeout disabled; title never updated. |
| `SessionsWebSocket.ts`      | 404   | Connect to `wss://…/v1/sessions/ws/{id}/subscribe?organization_uuid=…`. Auth via `Authorization: Bearer` header on the upgrade (no in-band auth). Reconnect logic: `MAX_RECONNECT_ATTEMPTS=5`, `RECONNECT_DELAY_MS=2000`, plus a _separate_ `MAX_SESSION_NOT_FOUND_RETRIES=3` budget for close code 4001 (transient during compaction). 4003 = unauthorized = permanent. (`:17-300`.)                                                                                   |
| `sdkMessageAdapter.ts`      | 302   | SDKMessage→REPL Message conversion. Most user-typed messages are dropped (the local REPL already added them); only tool-result blocks are converted (`:175-215`). Init/status/compact_boundary become system messages; success-result messages are dropped to reduce noise.                                                                                                                                                                                             |
| `remotePermissionBridge.ts` | 78    | Synthesizes a stand-in `AssistantMessage` and a stub `Tool` so the local REPL's permission UI can render a request for a tool it doesn't actually have loaded (e.g. an MCP tool only the CCR container knows about). Routes to `FallbackPermissionRequest`.                                                                                                                                                                                                             |

### 2.3 `upstreamproxy/` — sandbox-secret CONNECT relay (NOT an LLM proxy)

`upstreamproxy.ts:8-19` declares the design directly: this is a _MITM-credential-injection_ path for tools running inside a CCR session container. The container has `CCR_UPSTREAM_PROXY_ENABLED=1` set by `StartupContext.EnvironmentVariables`; the CLI then:

1. Reads the session token from `/run/ccr/session_token` (`:31, 105-110`).
2. `prctl(PR_SET_DUMPABLE,0)` via libc FFI on Linux to block same-UID ptrace heap-scrape (`:225-252`). This is genuinely useful — a prompt-injected `gdb -p $PPID` can otherwise pull the token out of memory.
3. Downloads the upstream-proxy CA cert from `${baseUrl}/v1/code/upstreamproxy/ca-cert`, concatenates with the system bundle, writes to `~/.ccr/ca-bundle.crt`.
4. Starts the relay: a localhost TCP listener that accepts HTTP CONNECT and tunnels each connection over a single WebSocket frame stream to `${baseUrl}/v1/code/upstreamproxy/ws`.
5. Unlinks `/run/ccr/session_token` _after_ the relay is confirmed listening, so a supervisor restart can retry if step 4 fails.
6. Exposes `HTTPS_PROXY=http://127.0.0.1:{ephemeralPort}`, `SSL_CERT_FILE=~/.ccr/ca-bundle.crt`, plus `NO_PROXY` covering loopback, RFC1918, link-local IMDS range (169.254.0.0/16), Anthropic's own apex (3 forms — `*.`, `.`, no-prefix — to cover Bun/curl/Go vs Python urllib vs apex), GitHub, npm, PyPI, Cargo, Go module proxy.

`relay.ts` then encodes each TCP-byte burst as an `UpstreamProxyChunk { bytes data = 1; }` protobuf — hand-rolled wire format, varint length prefix, tag `0x0a` (`:66-103`). 512 KiB max chunk to fit Envoy's per-request buffer cap (`:51`). Bun branch uses native `globalThis.WebSocket` with `proxy:` option; Node branch uses the `ws` package with `agent` set via `getWebSocketProxyAgent` so the WS upgrade itself flows through the container's egress proxy. The WS upgrade auth header is `Authorization: Bearer {token}`; the in-tunnel CONNECT request carries `Proxy-Authorization: Basic base64(sessionId:token)` (`:160-165`). Two separate auth scopes — gateway proto authn vs MITM tunnel auth.

### 2.4 `server/` — direct-connect client (the missing piece in our 8787 picture)

This is where the reference codebase's lineage matters: the three files here implement the CLI's _client_ side of an alternative direct-connect server (think `claude --server` running in a coworker's tmux). The schema is `connectResponseSchema` (`server/types.ts:5-11`): `{session_id, ws_url, work_dir?}`. `createDirectConnectSession.ts:26-88` POSTs `${serverUrl}/sessions` with `cwd` and optional `dangerously_skip_permissions`. `directConnectManager.ts:40-213` then opens the returned `ws_url`, sends user messages as `{type:'user', message:{role:'user', content:[…]}, parent_tool_use_id:null, session_id:''}` NDJSON frames, and round-trips permission requests via `sendControlResponse`. Crucially, `sendInterrupt` (`:172-186`) creates a `control_request` with `subtype:'interrupt'` — that's the only way the _client_ can tell the _agent_ to stop, and our 8787 bridge has nothing equivalent.

`server/types.ts:13-57` also describes the _server_ side schema (`ServerConfig`, `SessionState`, `SessionInfo`, `SessionIndexEntry`) — i.e., what a long-running `claude server` process would persist to `~/.claude/server-sessions.json`. The reference repo doesn't ship the server itself, only the _client_ shim and the index types. That tells us Anthropic intends a Claude Desktop / Cowork build that runs an embedded server and persists sessions there — but the public CLI doesn't expose it.

### 2.5 `coordinator/coordinatorMode.ts` (369 lines)

Pure env-variable glue: `CLAUDE_CODE_COORDINATOR_MODE=1` flips the system-prompt + Worker-tool list to the coordinator persona. `matchSessionMode` (`:49-78`) is the resume-time auto-flip: if a session was saved in coordinator mode but the env var isn't set, the var gets flipped synchronously and `tengu_coordinator_mode_switched` is logged. Worker tool list at `:88-95` (Async-allowed minus `INTERNAL_WORKER_TOOLS`). The system prompt itself (`getCoordinatorSystemPrompt`, `:111-369`) is a 250-line essay on multi-agent orchestration with `Task`/`SendMessage`/`TaskStop`. **This is the cross-surface integration vector**: when our Mobile/Web client wants to dispatch a multi-agent task to Desktop, the Desktop side needs to know how to flip into coordinator mode and the protocol assumes session-resume restoration of mode. None of our codebase has this today.

### 2.6 `query/` — auxiliary types only

| File             | Lines | Role                                                                                                                                                                                                                                                              |
| ---------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`      | 46    | `QueryConfig` snapshotting — sessionId + GrowthBook gate booleans frozen at query-loop entry.                                                                                                                                                                     |
| `deps.ts`        | 40    | DI container for `query()`: `callModel`, `microcompact`, `autocompact`, `uuid`. Lets tests pass fakes without spyOn-per-module.                                                                                                                                   |
| `stopHooks.ts`   | 473   | Stop / TeammateIdle / TaskCompleted hook execution generator. Triggers `executePromptSuggestion`, `executeExtractMemories`, `executeAutoDream`, `cleanupComputerUseAfterTurn` (CHICAGO_MCP gate). Job-classifier integration (`:108-132`) for template/job state. |
| `tokenBudget.ts` | 93    | Continuation-vs-stop decision based on token budget. `COMPLETION_THRESHOLD=0.9`, `DIMINISHING_THRESHOLD=500`.                                                                                                                                                     |

The relationship to the root `query.ts` is straightforward: `query/` is the _split-out_ per-iteration scaffolding pulled out of the giant `query.ts` so a future `step()` reducer can take `(state, event, config)` as plain data.

### 2.7 `native-ts/{color-diff,file-index}` — Rust→TS ports

| File                  | Lines | Role                                                                                                                                                                                                                                                     |
| --------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color-diff/index.ts` | 1,060 | Port of the Rust syntect+bat+similar diff highlighter. Uses highlight.js (lazy-loaded — full bundle is 50 MB / 100-200 ms eval, so the first call to `hljs()` defers it until first render at `:30-43`). API matches `vendor/color-diff-src/index.d.ts`. |
| `file-index/index.ts` | 374   | Port of the Rust nucleo fuzzy search. Async `loadFromFileList` chunks at ~4 ms time-budget per yield so 270 k-path indexing doesn't block the main thread. Bitmap-based search with Int32Array char bits. (`yoga-layout` is owned by T5.)                |

The pattern matters: Anthropic ships native-TS ports with the _exact_ API signature of the Rust originals so callers do not change. We can use the same lazy-load trick for our own optional native modules.

---

## 3. The three transport stacks

The reference codebase carries three full transport implementations. They co-exist because the rollout is staged.

### 3.1 v1 / HybridTransport (env-based)

This is the "classic" path: `claude remote-control` registers an _environment_ via `POST /v1/environments/bridge`, the server returns `{environment_id, environment_secret}`, and the CLI then enters a poll loop calling `GET /v1/environments/{id}/work/poll`. When work arrives, the response carries a base64url-JSON `WorkSecret` that contains `session_ingress_token` (a JWT) and `api_base_url`. The CLI spawns a child `claude` process with `CLAUDE_CODE_SESSION_ACCESS_TOKEN={ingress}` set; the child uses `HybridTransport` (`replBridgeTransport.ts:78-103`) which is "WebSocket reads + POST writes" against `wss://{host}/v1/session_ingress/ws/{sessionId}` (`workSecret.ts:41-48`).

Heartbeat / lease / acknowledge: `bridgeApi.ts:387-417` (`heartbeatWork` POSTs to `…/work/{id}/heartbeat`; uses SessionIngressAuth so it doesn't hit the `VerifyEnvironmentSecretAuth` DB path). `bridgeApi.ts:249-271` (`acknowledgeWork` after committing to handle work, never before). `bridgeApi.ts:273-299` (`stopWork` with optional `force` flag).

### 3.2 v1 path with CCR v2 transport (mixed)

`bridgeMain.ts:914-961` (the `case 'session':` block): when the work-secret carries `use_code_sessions:true` _or_ `CLAUDE_BRIDGE_USE_CCR_V2=1` is set, the spawn switches: it builds the CCR v2 session URL (`workSecret.ts:81-87`), calls `registerWorker(sdkUrl, ingressToken)` to fetch a `worker_epoch` (`workSecret.ts:97-127`), then spawns the child with both `CLAUDE_CODE_USE_CCR_V2=1` and `CLAUDE_CODE_WORKER_EPOCH={epoch}`. Same env layer, different child transport.

### 3.3 v2 / Env-less (`remoteBridgeCore.ts`)

The big architectural collapse. There is no Environments API at all. The flow is:

1. `POST /v1/code/sessions` (OAuth) → returns `cse_*` session ID. (`codeSessionApi.ts:26-80`.)
2. `POST /v1/code/sessions/{id}/bridge` (OAuth + optional X-Trusted-Device-Token) → `{worker_jwt, expires_in, api_base_url, worker_epoch}`. Each `/bridge` call bumps the epoch — _the call IS the registration_. (`codeSessionApi.ts:93-168`.)
3. Build `createV2ReplTransport` (SSETransport for reads + CCRClient for writes against `…/v1/code/sessions/{id}/worker/*`). (`replBridgeTransport.ts:119-370`.)
4. `createTokenRefreshScheduler` calls `/bridge` again 5 min before `expires_in`; on success it bumps the epoch and the transport is fully rebuilt (because epoch is part of every heartbeat — a JWT-only swap would 409 within 20 s). (`remoteBridgeCore.ts:317-377, 477-527`.)
5. SSE 401 triggers `recoverFromAuthFailure` (OAuth refresh + re-fetch /bridge + rebuild transport, same as proactive refresh but in response to a server-initiated close). (`remoteBridgeCore.ts:530-590`.)

Gating: `tengu_bridge_repl_v2` GrowthBook flag in `bridgeEnabled.ts:126-130`. REPL-only — daemon and `--print` paths stay on the env-based implementation regardless. The server PR cited in `remoteBridgeCore.ts:24` (#293280) added `/bridge` as a direct OAuth→worker_jwt exchange to make the env layer optional.

### 3.4 Telemetry — every transport choice is logged

`tengu_bridge_started`, `tengu_bridge_session_started`, `tengu_bridge_session_done`, `tengu_bridge_heartbeat_mode_entered`, `tengu_bridge_heartbeat_mode_exited`, `tengu_bridge_reconnected`, `tengu_bridge_token_refreshed`, `tengu_bridge_fatal_error`, `tengu_bridge_repl_ws_connected`, `tengu_bridge_repl_ws_closed`, `tengu_bridge_repl_v2_session_created`, `tengu_bridge_repl_connect_timeout`, `tengu_bridge_repl_skipped`, `tengu_bridge_multi_session_denied`, `tengu_bridge_spawn_mode_chosen`, `tengu_bridge_spawn_mode_toggled`, `tengu_coordinator_mode_switched`. The discriminator field `cause` on `ws_connected` is `'initial'|'proactive_refresh'|'auth_401_recovery'`. We have nothing close to this density of telemetry on our 8787 bridge — a parity sprint must include this.

---

## 4. Four-tier auth ladder

Every bridge call uses one of four credential types, often layered:

1. **OAuth Bearer** (`Authorization: Bearer {claude.ai access_token}`). Used for all `/v1/environments/*`, `/v1/sessions/*`, `/v1/code/sessions/*` calls when the _user_ is the actor. `bridgeApi.ts:78` adds `anthropic-version: 2023-06-01` and `anthropic-beta: environments-2025-11-01`. `createSession.ts:140-141` overlays `anthropic-beta: ccr-byoc-2025-07-29` and `x-organization-uuid` for the Sessions API. The override at `bridgeConfig.ts:18-32` allows ant-only `CLAUDE_BRIDGE_OAUTH_TOKEN` injection.

2. **environment_secret** (returned by `registerBridgeEnvironment`, sent as Bearer on subsequent poll/ack calls). Distinct credential class — environment-scoped, not user-scoped, can't refresh, throws `BridgeFatalError` on 401 with no retry. `bridgeApi.ts:212-224` (`pollForWork` uses it directly), `bridgeApi.ts:249-271` (`acknowledgeWork` uses the JWT inside the work secret, not the env secret — different auth scope on the same endpoint).

3. **session_ingress_token (JWT)** — opaque-ish JWT carried inside the `WorkSecret` envelope. Decoded _only_ to read `exp` for refresh scheduling (`jwtUtils.ts:38-49`). Strips `sk-ant-si-` prefix if present (`:22`). Used by `heartbeatWork` (`bridgeApi.ts:387-417`) and by the spawned child's WebSocket. The CCR v2 `worker_jwt` is the same class — different name, same lifecycle.

4. **X-Trusted-Device-Token** — persistent device-bound token (90-day rolling), enrolled once at `/login` via `POST /api/auth/trusted_devices`. Stored in macOS Keychain / equivalent secure storage. Sent on every bridge API call when the `tengu_sessions_elevated_auth_enforcement` GrowthBook gate is on. The two-flag rollout lets the CLI start sending the header before the server enforces it (`trustedDevice.ts:18-31`). Memoized to avoid spawning the macOS `security` subprocess on every poll (`:39-52`). Cleared on `/login` _before_ re-enrollment, with a try/catch fallback to keep login working even when storage is locked (`:72-87`). **Critical: server-side enrollment is gated on `account_session.created_at < 10 min`, so lazy enrollment after 403 is impossible** (`:32-37`).

The four tiers compose: a poll might carry OAuth + Trusted-Device, an ack carries JWT only, a heartbeat carries JWT + Trusted-Device, a register carries OAuth + Trusted-Device. We do NOT have a Trusted-Device equivalent on our 8787 surface; if we want Anthropic-grade theft-of-token resistance we have to add one.

---

## 5. Sessions-as-state-machine — what the spawned child actually negotiates

When `bridgeMain.ts:1026-1061` spawns the child, it passes `--print --sdk-url <ws-or-https> --session-id <id> --input-format stream-json --output-format stream-json --replay-user-messages`. The child establishes the actual transport (the bridge process itself doesn't speak WS — it's the child's job). The bridge process then _only_ parses the child's NDJSON stdout for status display + permission forwarding, and _injects_ token refreshes via stdin `update_environment_variables` messages (`sessionRunner.ts:527-542`). That is a key separation: **the bridge daemon doesn't carry the LLM conversation; it owns lifecycle and credential rotation only**.

Permission round-trip: the child emits `{type:'control_request', request_id:..., request:{subtype:'can_use_tool', tool_name, input, tool_use_id}}` on stdout (`sessionRunner.ts:417-431`). The bridge parses this, and would normally call `api.sendPermissionResponseEvent` (`bridgeApi.ts:419-450`) to round-trip the answer through the server. In `bridgeMain.ts` standalone mode the bridge _does not auto-approve_ (`:2586-2590` literally logs "(not auto-approving)" — the inbound web/mobile client is expected to render the prompt and POST the answer back).

Title derivation: `bridgeMain.ts:1955-1978` (`deriveSessionTitle` collapses whitespace + truncates to 80 cols; `fetchSessionTitle` one-shot GET `/v1/sessions/{id}` with the org-scoped headers because environments-level headers return 404 here — `:1971-1978`). First-user-message fallback at `:1034-1058` PATCHes the title via `updateBridgeSessionTitle` if no server title is set.

Worktree mode: when `spawnMode==='worktree'` and the session isn't the pre-created initial one, `createAgentWorktree` makes a `bridge-{safeId}` worktree, sessions run in isolation, and `removeAgentWorktree` cleans up on session-done. Worktree availability requires either git OR `WorktreeCreate`/`WorktreeRemove` hooks (`bridgeMain.ts:2210-2234`). `w` keypress live-toggles same-dir↔worktree (`:2611-2642`).

Crash recovery: pointer file written immediately after session creation (`bridgeMain.ts:2700-2729`); refreshed hourly so a 5h+ session that crashes still has a fresh mtime. Resume flow: `--continue` reads `bridgePointer.ts:129-184` (worktree-aware fanout) and chains into the same `--session-id` path as explicit resume (`bridgeMain.ts:2149-2175`). Resume then calls `tryReconnectInPlace` (`replBridge.ts:381-419`) which force-stops stale workers and re-queues the session — but only when the just-registered environmentId matches the requested one. Otherwise it falls through to fresh session creation.

Session-not-found 4001 handling: `SessionsWebSocket.ts:258-272` treats it as transient (compaction in flight), retries up to `MAX_SESSION_NOT_FOUND_RETRIES=3` with linear backoff, then bails. 4003 is permanent (unauthorized). Silent 4001 retry is the _only_ code path that survives the in-CCR compaction window.

---

## 6. What's different from our 8787 inbound bridge

Our existing Tauri-side bridge at port 8787 is fundamentally an _inbound_ HTTP server: it hosts a localhost API that the CLI calls into. The reference codebase here does the opposite — the CLI is an _outbound_ worker that registers with a remote server. This has several immediate implications:

| Aspect              | Our 8787 bridge                      | Reference `bridge/`+`remote/`                                                                                                              |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Direction           | Localhost HTTP server, CLI is client | Outbound worker, CLI is client of cloud server                                                                                             |
| Transport           | HTTP/JSON                            | WS/SSE + HTTP, env-secret + JWT + OAuth + device token                                                                                     |
| Discovery           | Hardcoded port                       | `claude.ai/code?bridge={environmentId}` URL or QR code (`bridgeStatusUtil.ts:39-45`)                                                       |
| Multi-session       | Single client                        | Up to 32 concurrent sessions per env (`SPAWN_SESSIONS_DEFAULT=32` at `bridgeMain.ts:83`) with worktree/same-dir/single-session spawn modes |
| Auth on ingress     | None (localhost)                     | 4-tier ladder, with X-Trusted-Device hardening                                                                                             |
| Crash recovery      | None                                 | Pointer file + 4 h TTL + worktree fanout + `--continue`/`--session-id` resume flow                                                         |
| Permission routing  | Direct                               | `control_request` round-trip to remote client, with cancel support                                                                         |
| Heartbeat           | None                                 | Configurable per-work-item heartbeat with auth-failure → reconnect-session re-queue                                                        |
| Token refresh       | None                                 | Generation-counter scheduler with 5-min buffer, OAuth-401 race serialization, both ProactiveRefresh and AuthRecovery paths                 |
| Echo dedup          | None                                 | BoundedUUIDSet (2000-cap) + initialMessageUUIDs unbounded fallback                                                                         |
| File transfer       | Direct                               | `file_uuid` reference + `GET /api/oauth/files/{uuid}/content` resolve to local `~/.claude/uploads/{sid}/` + `@path` injection              |
| Image normalization | None                                 | `mediaType`→`media_type` repair to keep iOS clients from poisoning sessions                                                                |
| Telemetry           | Sparse                               | ~25 named events covering every state transition                                                                                           |

The 8787 bridge handles a _different problem_: it lets a Tauri shell co-located with the CLI talk to it without round-tripping through Anthropic. For Anthropic-Cowork / Anthropic-Dispatch parity, we need _both_: the existing 8787 inbound surface AND a new outbound worker registration capability.

---

## 7. To-port priorities for cross-surface integration

If we are serious about Anthropic-Dispatch / Anthropic-Cowork parity in 21–30 days, the highest-leverage ports — ranked by what they unlock — are:

### 7.1 `createTokenRefreshScheduler` (`jwtUtils.ts:72-253`)

**Why:** Drop-in. Pure TS. No runtime deps beyond `setTimeout`. Generation-counter pattern is the only sane way to build a refresh scheduler that survives both racing OAuth refreshes AND laptop wake-ups. Our packages/api/ has nothing equivalent. Fits directly into our existing `withOAuthRetry`-style retry helpers.

### 7.2 The four-tier auth header builder (`bridgeApi.ts:76-89` + `trustedDevice.ts:33-87`)

**Why:** Even if we don't ship Anthropic-bridge parity for v1, we need our own equivalent header pipeline for our future cloud worker mode. The Trusted-Device pattern (memoized read, two-flag staged rollout, clear-before-enroll) is the load-bearing pattern. Our existing token storage in packages/utils/ has no Keychain integration and no enrollment flow.

### 7.3 The `WorkSecret`/`BridgeConfig` envelope shape + `validateBridgeId` regex (`types.ts:33-115` + `bridgeApi.ts:41-53`)

**Why:** This is the protocol. Even if we run our own server (not Anthropic's), the envelope shape — base64url JSON, version-pinned, JWT-as-token, `claude_code_args`/`mcp_config`/`environment_variables` extension points, plus the `^[a-zA-Z0-9_-]+$` ID validator — is the right starting point for our own outbound worker mode. The regex specifically prevents path traversal in URL segments (`bridgeApi.ts:48-53`).

### 7.4 The `control_request`/`control_response` shape + cancel semantics (`bridgeMessaging.ts:243-391` + `RemoteSessionManager.ts:159-216`)

**Why:** The permission-prompt round-trip is the _most_ user-visible cross-surface integration point. If our Mobile app needs to render an approval prompt on behalf of Desktop, we need exactly this protocol: subtype-discriminated requests (`initialize`, `set_model`, `set_max_thinking_tokens`, `set_permission_mode`, `interrupt`, `can_use_tool`), explicit error responses for unknown subtypes (so the server doesn't hang), and the `control_cancel_request` pathway so the server can withdraw a stale prompt before the user answers it. We have _none_ of this on 8787 today.

### 7.5 (Bonus) `BoundedUUIDSet` + dual-set echo dedup (`bridgeMessaging.ts:429-461` + `replBridge.ts:497+`)

**Why:** O(capacity) memory, O(1) ops, evicts-oldest-on-full. Once we have any cross-process message replay (mobile↔desktop, or web↔CLI via our upcoming cloud relay), we need this. Worth ~50 LOC of straight port.

### 7.6 (Bonus) `flushGate.ts` (71 lines) + `capacityWake.ts` (56 lines)

**Why:** Two tiny abstractions that together solve "queue writes during the initial-history POST so the server sees `[history…, live…]` in order" and "wake the at-capacity sleep when a session ends". They're a model for any future request-coalescing layer we build, and porting both is half a day.

---

## 8. Open risks / cross-surface integration questions

1. **Trusted-Device enrollment must happen at /login**, not lazily. Server gates on `account_session.created_at < 10 min` (`trustedDevice.ts:32-37`). If we add this to our auth flow, we need it at the same moment in the OAuth handshake — not after the first 403.
2. **The CSE*/SESSION* tag duality is real.** Two server endpoints look up by different IDs; both translations need to happen at the bridge boundary, not in higher-level code (`sessionIdCompat.ts:38-57`). We will hit this the moment we run more than one server-side ID generation scheme.
3. **Epoch-bumping is mandatory on every credential refresh.** A naïve "JWT-only swap" 409s within 20 s on the heartbeat (`replBridgeTransport.ts:209-231` + `remoteBridgeCore.ts:469-527`). Our refresh paths must rebuild the entire transport, not just the auth header.
4. **`upstreamproxy/` is sandbox-secret injection, not LLM proxy.** Reading the file casually suggests "this is how the CLI talks to Anthropic"; it is not. It is how _user code running inside a CCR sandbox_ gets credentials injected into outbound HTTPS calls. Misunderstanding this would lead to a massive over-build.
5. **`claude assistant` viewer-only mode is a single boolean** (`RemoteSessionManager.ts:60-62`) but the semantic implications are large: no Ctrl+C interrupt, no 60s reconnect timeout, no title updates. Building a "watch-only" surface (e.g. read-only mobile observer) is straightforward IF we replicate that flag. Without it, defaults will misbehave.
6. **The bridge process explicitly does not auto-approve permission prompts** in standalone mode (`bridgeMain.ts:2586-2590`). Auto-approve is the inbound client's choice. Our 8787 currently has no permission protocol at all; if we add one, the default _must_ be "ask the human".
7. **Cross-process backoff for dead OAuth tokens** uses a content-addressed key (`expiresAt` field, `initReplBridge.ts:175-187`). 3-strike persistent counter. Without this, dead tokens cause permanent 401-loops across CLI invocations. We have no equivalent in our codebase.
8. **HTTPS-only enforcement** (`bridgeMain.ts:2182-2193`): non-localhost HTTP is hard-rejected at startup. Our code should adopt the same posture for cloud-mode endpoints.

---

## 9. Inventory cross-ref to `anthropic-claude-suite-may-2026.md`

- **§3 Cowork.** The reference codebase's `bridge/` outbound-worker pattern is the same shape Cowork uses for desktop ↔ Cowork-VM session steering, but Cowork's VM lives locally (`~/Library/Application Support/Claude/vm_bundles/claudevm.bundle`); the cloud bridge layer here is the _control plane_, not the VM. (`bridgeMain.ts` standalone bridge is the CLI half of that control plane.)
- **§5 Code-CLI / `claude remote-control`.** Implemented end-to-end in this scope: `bridgeMain.ts`, `bridgeApi.ts`, `bridgeUI.ts`, plus the `--continue`/`--session-id` resume in `bridgePointer.ts`. The 22-subcommand CLI surface in our memory is roughly half about this subsystem.
- **§6.5 Dispatch (mobile→desktop).** This is the Mobile-side trigger point for the same protocol — a Dispatch task is just an inbound `control_request`/SDK message stream against a desktop-side bridge. The `viewerOnly` flag in `RemoteSessionManager.ts:60` is the read-only-observer variant.
- **§12 Computer Use.** `query/stopHooks.ts:164-173` shows the post-turn cleanup hook (`cleanupComputerUseAfterTurn`) gated by `feature('CHICAGO_MCP')` — only the main thread does it because the CU lock is process-wide. Computer Use itself isn't in this scope, but the cleanup integration is.

---

## 10. Bottom line

The reference codebase's `bridge/`, `remote/`, `server/`, and `upstreamproxy/` modules together describe a tightly-engineered outbound-worker protocol: the CLI registers with Anthropic's CCR, polls for or accepts work, spawns sessions, round-trips permissions, refreshes credentials, and reconnects across both mobile and web inbound clients. Our existing 8787 bridge solves a different (smaller) problem and gives us no direct purchase on the cross-surface integration story Anthropic ships. The fastest paths to credible parity are: (1) port the JWT refresh scheduler, (2) port the Trusted-Device enrollment + memoized header builder, (3) adopt the WorkSecret envelope shape with strict ID regex, (4) implement the `control_request`/`control_response` permission round-trip with explicit cancel. Those four ports together are roughly 1,500 LOC of straightforward TS, give us the protocol shape, and unlock a 21–30-day plan that doesn't have to invent any wire formats.

Total file scope read: 47 files / ~15,859 source lines.

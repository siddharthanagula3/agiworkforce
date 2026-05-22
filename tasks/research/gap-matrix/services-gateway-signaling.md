# GAP-SERVICES — `services/api-gateway/` + `services/signaling-server/` vs Anthropic CCR + Bridge Protocol

> **Scope.** `services/api-gateway/` (Express v5.2 — entry `src/index.ts:1-186`, 14 route files, 5 middleware, 3 MCP files, 1 WebSocket handler) and `services/signaling-server/` (`src/index.ts:1-1697`, 7 supporting modules, deployed Fly.io). Total: **~5,500 LOC TypeScript across 36 active source files** (plus tests). Out-of-scope: desktop bridge port 8787 (covered by GAP-DESKTOP), web BFF (`apps/web/app/api/`), mobile/CLI clients.
>
> **Reference.** `tasks/research/anthropic-claude-suite-may-2026.md` §3 Cowork, §5 Code-CLI, §6.5 Dispatch; `tasks/research/deep/net-bridge-remote-server.md` (the bridge is OUTBOUND-only worker→CCR; our 8787 is INBOUND — direction inversion); `tasks/research/deep/m9-services-mcp.md` (12,310 LOC reference MCP); `tasks/research/deep/m1-cli-print-launchers.md` (30+ subtype control protocol).
>
> **Method.** Read `index.ts`, `websocket.ts`, every `routes/*.ts`, every `middleware/*.ts`, every `services/*.ts`, the entire signaling-server package, and `mcp/{mcpProxy,mcpRoutes,mcpConfig}.ts` end-to-end. Cross-grepped against the bridge-protocol concepts (`work_secret`, `worker_jwt`, `worker_epoch`, `cse_*`, `session_ingress`, `trusted_device`, `control_request`, `step_up`, `XAA`, `paste-callback`, `flushGate`, `bridgePointer`). Every claim is grep-verified or file:line cited. PARTIAL = behaviour exists but lacks parity. MISSING = grep returned no real implementation.
>
> **Anti-hallucination.** Bridge concepts checked: `register_environment` → 0 hits, `worker_jwt` → 0, `worker_epoch` → 0, `cse_session` → 0, `WorkSecret` → 0, `session_ingress` → 0, `X-Trusted-Device-Token` → 0, `control_request` → 0, `xaa` → 0, `step-up` (RFC 6749 §6 escalation) → 0, `paste-callback` → 0, `bridgePointer`/`flushGate`/`capacityWake` → 0. The 14 active route files implement an entirely different protocol family; the gap is structural.

---

## 1. Executive shape

The reference codebase's `bridge/`+`remote/`+`server/` modules describe an **outbound-only** worker protocol: the CLI initiates, registers with Anthropic's CCR servers, polls for or accepts work, spawns sessions, and streams cross-provider permission round-trips back to inbound web/mobile clients. **Our `services/` codebase implements the inverse**: an **inbound-only** Express/WebSocket pair where the desktop is a long-lived WebSocket client and the gateway dispatches `command` envelopes back over that socket. The signaling-server further implements WebRTC pairing for mobile↔desktop direct-connect.

That is a fundamentally different protocol surface. None of the four bridge transport stacks (v1 HybridTransport, v1+CCRv2 mixed, v2 env-less SSE, paste-callback OAuth) have an analogue in our codebase. The four-tier auth ladder (`OAuth Bearer` + `environment_secret` + `session_ingress JWT` + `X-Trusted-Device-Token`) collapses to a single tier in our codebase (HS256 JWT signed by `JWT_SECRET` at `services/api-gateway/src/middleware/auth.ts:8,86-90`). The 22-event telemetry stream (`tengu_bridge_*`) has no equivalent here.

This document enumerates every category from `net-bridge-remote-server.md` and reports our state. Categories where we ship something adjacent (e.g., MCP proxy, WebSocket auth, kill-switch revocation) are still flagged PARTIAL because they target a different protocol shape.

---

## 2. Have

The legitimate inbound surfaces and adjacent infrastructure that DO ship today:

### 2.1 HTTP + WebSocket front door

- Express v5.2 with helmet/CORS/CSRF/128kb body-cap (`api-gateway/src/index.ts:42-100`); WS mounted at `/ws` with 64KB payload cap (`:165-167`).
- JWT-authenticated WS handshake (HS256, issuer/audience-bound) with `device_pairings` ownership check (`websocket.ts:140-202, 424-504, 446-470`).
- Strict 3-type WS payload allowlist `chat|automation|query` (defends H3, `websocket.ts:154-198`).
- Per-connection sliding-window rate limit + 30s auth timeout + 30s ping/pong + Origin allowlist (`websocket.ts:31, 212-267, 366-395`).
- Pending-command queue for offline desktops, 100-entry cap, 5min TTL (`websocket.ts:34-138, 379-389`).

### 2.2 Auth (single-tier JWT + device-code)

- `POST /api/auth/logout` with `revoked_jwts` writeback (H7, idempotent on dup-key) — `routes/auth.ts:63-109`. `/register` and `/login` retired with 501+`next` (`:51-57`).
- Device-code flow at `routes/deviceAuth.ts:1-256`: `/code` (rejection-sampled 8-char user_code), `/token` (5s poll), `/approve` (Supabase JWT → gateway JWT). 15-min code, 7-day access-token TTL.
- Per-jti revocation cache (5s) + 60s account-status kill-switch, both fail-closed on DB outage (`middleware/auth.ts:14-202`).

### 2.3 Device CRUD + heartbeat

- `POST/GET/DELETE` desktop CRUD + heartbeat at `routes/desktop.ts:156-451`. UUID-validated, 404 for not-found AND not-owned (enumeration prevention).
- Mobile CRUD with `clientId` ownership pre-check (`routes/mobile.ts:138-466`).

### 2.4 Sync (Rust-CloudSyncClient parity)

- `POST /api/sync/batch` (100-item cap, IDOR `user_id` match (M13), device ownership verify (H11)), `GET /updates`, `POST /resolve-conflict`, `GET /status`, device register/unregister, plus legacy `/push|/pull|/clear` — `routes/sync.ts:86-536`.

### 2.5 Mobile↔Desktop pairing relay

- `POST /api/mobile/pairing-code` proxies signaling-server with bearer auth, forwards per-role `pairTokens` (C2 HMAC) — `routes/mobile.ts:245-323`. Pair flow at `routes/pair.ts:83-336`.

### 2.6 Cloud-mode chat (separate from CCR)

- `POST /api/cloud-chat/send` SSE LLM proxy with history hydration, Anthropic/OpenAI/Google upstream, `requireProPlan` gate — `routes/cloudChat.ts:463-618`.
- Conversation CRUD at `routes/cloudChat.ts:250-448`.
- `POST /api/llm/v1/chat/completions` 3-provider fan-out, tier-gated (Hobby economy-only, Free → 403), Anthropic↔OpenAI normalization including SSE conversion — `routes/llm.ts:697-801, 503-600`.
- `POST /api/v1/providers/:providerId/stream` (canonical `StreamChunk` SSE, 30/min, AbortController on close) + catalog/list at `routes/providerStream.ts:152-250`.

### 2.7 Mobile approval relay (PARTIAL — see §3.7)

- `POST /api/agents/{approve,deny}`, `GET /status`, `GET /pending` with `agent_approval_requests` table + WS push — `routes/agents.ts:104-317`.

### 2.8 Server-side MCP proxy

- `McpProxy` stdio+http with sanitized child-env (drops 12 sensitive vars at `mcp/mcpProxy.ts:278-291`). 1MB stdout cap. JSON-Schema arg validation + audit logging — `mcp/mcpRoutes.ts:85-259`.

### 2.9 Signaling-server (WebRTC pairing)

- `POST /pairings` constant-time auth + per-role HMAC `pairTokens` — `signaling-server/index.ts:181-216, 650-811`. Generic 404 (M5 enumeration prevention).
- `/health`, `/live`, `/ready`, `/metrics` (Prom, admin-gated), `/admin/{status,blacklist}` — `:509-642`.
- WS protocol: `register`→`signal{offer|answer|ice|control}`→`heartbeat` (`:843-1084`). SDP/ICE schemas at `:439-492`. Strict 9-action `ALLOWED_CONTROL_ACTIONS` allowlist (`approval_request`, `approval_response`, `sync_request`, `sync_response`, `dispatch_request`, `dispatch_response`, `heartbeat`, `heartbeat_ack`, `cancel`) at `:467-477`.
- Rehydration race-prevention via `pendingRehydrations` map with 10s DB-query timeout (`:1273-1361`). Pending-approvals queue delivered on mobile reconnect (`:1455-1467, 1640-1693`). Per-IP blacklisting + 5-tier rate limiter. Stale-session 5min/24h-long-TTL cleanup. Graceful SIGTERM/SIGINT shutdown.

### 2.10 Adjacent infrastructure

- Provider health-check ping registry (11 providers, 60s cache) — `services/providerHealth.ts:43-100`.
- Approval-routing with priority + escalation timeouts (urgent 1min / normal 2min / solo 5min) — `services/approvalRouting.ts:62-205`.
- Approval-policy classifier (`services/approvalPolicy.ts:1-321`). Tiered rate-limit configs with multi-instance Redis warning (`middleware/rateLimit.ts:26-180`).

---

## 3. Partial

Surfaces where something exists but does NOT match Anthropic CCR / bridge-protocol semantics:

### 3.1 PARTIAL — Cloud Code Runtime register/poll/work (`bridgeApi.ts:212-417` analogues)

We have `POST /api/desktop/register` (`routes/desktop.ts:156-191`) but it writes a row to `desktop_devices` and returns `{desktopId}`. There is no `environment_secret`, no `WorkSecret` JWT envelope, no `acknowledgeWork`, no `pollForWork` long-poll, no `heartbeatWork` with auth-failure → reconnect-session pathway, no `stopWork` with `force` flag, no `archive` lifecycle, no `bridge` epoch refresh. The register response is `{desktopId}` not `{environment_id, environment_secret, expiresAt, ...}`.

**Reference (`bridgeApi.ts:212-417`)**: register returns `environment_id` + `environment_secret` (env-scoped credential class, throws `BridgeFatalError` on 401). The CLI then polls `/v1/environments/{id}/work/poll` carrying environment_secret as Bearer; a poll arrival yields a `WorkSecret` blob containing `session_ingress_token` (JWT, opaque-ish), `api_base_url`, optional `claude_code_args`, `mcp_config`, `environment_variables`, `use_code_sessions:true` selector. The child uses different headers per call: poll → environment_secret; ack → JWT inside WorkSecret; heartbeat → JWT + Trusted-Device.

**Gap.** `register_environment` returns 0 grep hits. `WorkSecret`/`work_secret` returns 0 hits. The four credential classes (OAuth Bearer / environment_secret / session_ingress JWT / X-Trusted-Device-Token) collapse to one (gateway-JWT signed with `JWT_SECRET`). There is no v1 work-poll wire, no v2 `/v1/code/sessions` direct-OAuth path, no SSE+CCRClient pair, no ack/lease/heartbeat cycle.

### 3.2 PARTIAL — Worker epoch bumping (`codeSessionApi.ts:93-168`, `replBridgeTransport.ts:209-231`)

Reference: every `/bridge` call bumps `worker_epoch` server-side. A naïve "JWT-only swap" 409s within 20s on the heartbeat because epoch is part of every wire message. Our refresh paths must rebuild the entire transport, not just the auth header. This invariant is load-bearing.

We do not have epoch semantics anywhere. JWT refresh is implicit (the gateway issues 7-day access tokens at `routes/deviceAuth.ts:29, 146-154`); there is no scheduled refresh, no generation counter, no `recoverFromAuthFailure` 401-handler that re-fetches the bridge, rebuilds the transport, and re-pushes epoch into every send.

**Gap.** `worker_epoch` returns 0 hits. `epoch` shows up only in bcrypt JWT issuance comments. No transport-rebuild semantics — the `WebSocketServer` is process-global and never reconnects with new credentials.

### 3.3 PARTIAL — 4-tier auth ladder

We ship one tier: HS256-signed gateway JWT validated at `middleware/auth.ts:69-202`. It has a per-jti revocation table (H7) and a 60s account-status kill-switch — both real defense-in-depth, but they're enforcing access to OUR Express routes, not authenticating to a remote CCR's `/v1/environments/*`.

**Reference (`bridgeApi.ts:76-89`, `trustedDevice.ts:33-87`)**: Trusted-Device enrollment at `/login` (server-gated on `account_session.created_at < 10 min`); macOS Keychain backend (memoized to avoid spawning `security` subprocess on every poll); two-flag staged rollout (CLI sends header before server enforces); cleared _before_ re-enrolment with try/catch fallback to keep login working when storage is locked. Per-call layering: register carries OAuth + Trusted-Device; ack carries JWT only; heartbeat carries JWT + Trusted-Device; poll carries env_secret + Trusted-Device.

**Gap.** `X-Trusted-Device-Token` returns 0 hits. `OAuth Bearer + environment_secret` separation does not exist — all routes use `authenticateToken` middleware with the gateway JWT.

### 3.4 PARTIAL — Trusted-Device enrollment

`trustedDevice.ts:142-200` describes `POST /api/auth/trusted_devices` with display_name `"Claude Code on {hostname} · {platform}"`. We have **device** registration at `/api/desktop/register`, `/api/mobile/register`, `/api/sync/devices/register` — three different paths, none of which hold a 90-day rolling token, none of which gate on session-age, none of which integrate with macOS Keychain or use a memoized read.

The closest analogue is **device pairing** via `device_pairings` table (`websocket.ts:450-457`, `routes/sync.ts:107-120`) but that's a presence/ownership table, not a credential. Server-side enforcement gating on `account_session.created_at < 10 min` is missing.

### 3.5 PARTIAL — Three transport stacks

- **v1 HybridTransport (WS reads + POST writes)** — does not exist. Our WS at `/ws` is bidirectional message broadcast over a single socket per user.
- **v1+CCRv2 (mixed: spawn child with `CLAUDE_CODE_USE_CCR_V2=1` + `CLAUDE_CODE_WORKER_EPOCH={epoch}`)** — does not exist. We don't spawn worker children; the desktop is a WS client, not a child process of the gateway.
- **v2 env-less SSE+CCRClient (`POST /v1/code/sessions` then `POST /v1/code/sessions/{id}/bridge` → worker_jwt)** — does not exist. We have SSE responses (`routes/llm.ts:432-498`, `routes/cloudChat.ts:529-617`, `routes/providerStream.ts:212-248`) but they are direct LLM-proxy streams, NOT a v2 worker bridge.

The SSE we DO ship at `/api/llm/v1/chat/completions` is OpenAI-compatible chat-completion-style (Anthropic→OpenAI conversion at `routes/llm.ts:503-600`). That is provider-LLM proxying, not a CCR worker bridge — there's no per-session epoch, no session_ingress JWT, no `worker_jwt` refresh, no token-replay against `/v1/code/sessions/{id}/worker/*`.

### 3.6 PARTIAL — control_request / control_response protocol

The 30+ subtype protocol from `print.ts:2813-4029` (`interrupt`, `end_session`, `initialize`, `set_permission_mode`, `set_model`, `set_max_thinking_tokens`, `mcp_status`, `get_context_usage`, `mcp_message`, `rewind_files`, `cancel_async_message`, `seed_read_state`, `mcp_set_servers`, `reload_plugins`, `mcp_reconnect`, `mcp_toggle`, `channel_enable`, `mcp_authenticate`, `mcp_oauth_callback_url`, `claude_authenticate`, `claude_oauth_callback`, `claude_oauth_wait_for_completion`, `mcp_clear_auth`, `apply_flag_settings`, `get_settings`, `stop_task`, `generate_session_title`, `side_question`, `set_proactive`, `remote_control`) does not exist on our wire.

The closest we ship is the WS `command` envelope at `websocket.ts:154-170` with three discriminated subtypes (`chat`, `automation`, `query`). That's a tiny subset and the semantics are different — these messages broadcast to other devices in the same user, not to a child agent process expecting an SDK control protocol.

The mobile↔desktop approval flow at `routes/agents.ts:206-317` does the closest thing: HTTP POST → DB row → WS `agent_approved`/`agent_denied` push → desktop. But it lacks `request_id`-keyed cancel semantics, lacks subtype discrimination, lacks the `permission` round-trip with cancel pathway from `bridgeMessaging.ts:243-391`. No `control_cancel_request` exists — once an approval is queued, it cannot be withdrawn server-side.

**Reference cancel (`RemoteSessionManager.ts:159-216`)**: explicit `subtype:'interrupt'` control_request; the only way the CLIENT can tell the AGENT to stop. We have `cancel` in the signaling-server allowlist (`signaling-server/index.ts:476`) but it's not wired through to either desktop or gateway dispatch.

### 3.7 PARTIAL — Permission round-trip routing

We have approval routing logic (`services/approvalRouting.ts:62-205`) with priority classification (`dangerous` → urgent), escalation timeouts, and team-roster-aware fan-out. That's MORE elaborate than the reference's `bridgeMain.ts:2586-2590` (which only logs "(not auto-approving)" and forwards to the inbound client).

But the wire shape diverges. Reference uses `{type:'control_request', request_id, request:{subtype:'can_use_tool', tool_name, input, tool_use_id}}` (`sessionRunner.ts:33-43, 417-431`). Ours uses `{type:'command', commandType:'agent_approved'|'agent_denied', payload:{requestId, action, reason?}}` (`websocket.ts:60-70`, `routes/agents.ts:235-241, 295-301`). No `tool_use_id` correlation, no `tool_name` carried in the broadcast, no `input` echoed back.

`api.sendPermissionResponseEvent` (`bridgeApi.ts:419-450`) round-trips through the server with auth, mtime-checked. We send via WebSocket broadcast — no server-mediated commit, no idempotency token, no permanent record of the response separate from the table row.

### 3.8 PARTIAL — MCP server hosting

`mcp/mcpProxy.ts:1-600` ships stdio + http only, with sanitized child-env (drops 12 sensitive vars at `:278-291`), `tools/list` JSON-RPC + cache (`:163-190`), `tools/call` with 30s timeout (`:482-565`), 1MB stdout buffer cap (`:319-334`).

Reference (`m9-services-mcp.md` Top 4 gaps): **No OAuth at all** — no `ClaudeAuthProvider` (1,000+ LOC), DCR (RFC 7591), PKCE, paste-callback, XAA (RFC 8693+7523+ID-JAG), step-up (RFC 9728 §3.3), or RFC 7009 revocation. Every Claude.ai connector + every production third-party (Linear, Notion, GitHub remote, Atlassian, Stripe, Sentry) requires OAuth. **No connection lifecycle** — no `onerror`/`onclose` 5-attempt × 1s→30s exponential reconnection (`useManageMCPConnections.ts:88-90`), no 9-error terminal-error counter, no session-expired retry (404+`-32001`). **No notifications** — `tools/list_changed` / `prompts/list_changed` / `resources/list_changed` not wired; we `tools/list` once and cache forever. **No multi-source config / scope / dedup** — single `MCP_CONFIG_PATH`, no `local|user|project|dynamic|enterprise|claudeai|managed` precedence, no env-expansion, no large-output persistence, no Claude tool-format metadata (`searchHint`, `alwaysLoad`, `readOnlyHint`, `destructiveHint`, `openWorldHint`).

Our proxy works for operator-controlled `mcp-servers.json`, not user-controlled marketplace connectors.

### 3.9 PARTIAL — Sandbox credential injection (`upstreamproxy/relay.ts:1-455`)

Reference is a MITM CONNECT relay that injects credentials INTO sandbox containers (read `/run/ccr/session_token`, `prctl(PR_SET_DUMPABLE,0)`, localhost relay over WS, expose `HTTPS_PROXY=http://127.0.0.1:{port}`). Our `mcpProxy.ts:278-297` does the inverse — strips 12 sensitive env vars OUT before spawn. No MITM relay, no protobuf-framed `UpstreamProxyChunk`, no `Proxy-Authorization: Basic base64(sessionId:token)`, no `NO_PROXY` for loopback/RFC1918/IMDS.

### 3.10 PARTIAL — Channel notifications (`m9-services-mcp.md §5`, 316-LOC `channelNotification.ts`)

Reference: bidirectional Telegram/iMessage/Discord-as-MCP-server protocol with `notifications/claude/channel` (inbound msg, `priority:'next'`, `isMeta:true`), `notifications/claude/channel/permission` (inbound), `notifications/claude/channel/permission_request` (outbound). Reply schema `(y|yes|n|no) + 5-letter ID from 25-char alphabet (a-z minus 'l'), profanity-blocked` (`channelPermissions.ts:75-152`). `tengu_harbor_ledger` GrowthBook gate. **Zero** of this exists. Signaling-server's `approval_request`/`approval_response` is desktop↔mobile only, with no 25-char alphabet reply ID convention.

---

## 4. Missing

Categories where there is no implementation at all:

### 4.1 MISSING — Cloud Code Runtime worker model

The fundamental directional inversion: there is no concept of "CLI registers as a worker, server hands work-secret JWTs". Our `desktop_devices` table at `routes/desktop.ts:55-66` stores `{id, user_id, name, platform, version, last_seen_at}` — a presence record, not a worker registry. There is no `claudeId`/`environmentId` discriminator, no `WorkerType` enum (`'claude_code' | 'claude_code_assistant'`), no `claude_code_args` / `mcp_config` / `environment_variables` extension points carried in a register response.

### 4.2 MISSING — `/v1/environments/*` and `/v1/code/sessions/*` REST surfaces

Reference (`bridgeApi.ts:1-539`, `codeSessionApi.ts:1-168`):

- `POST /v1/environments/bridge` (register environment).
- `GET /v1/environments/{id}/work/poll`.
- `POST /v1/environments/{id}/work/{workId}/ack` (with WorkSecret JWT).
- `POST /v1/environments/{id}/work/{workId}/heartbeat`.
- `POST /v1/environments/{id}/work/{workId}/stop` (with optional `force`).
- `POST /v1/environments/{id}/archive`.
- `POST /v1/sessions` + `GET/PATCH /v1/sessions/{id}` (with `anthropic-beta: ccr-byoc-2025-07-29` + `x-organization-uuid`).
- `POST /v1/code/sessions` + `POST /v1/code/sessions/{id}/bridge` (env-less fast path).
- `WS wss://.../v1/sessions/ws/{id}/subscribe?organization_uuid=...` with Bearer-on-upgrade.

None of these routes exist. We have `POST /api/desktop/register` (a row insert), `POST /api/sync/batch` (a sync batch endpoint), `POST /api/cloud-chat/send` (an SSE proxy) — none are wire-compatible with the bridge protocol.

### 4.3 MISSING — Direct-connect session (`server/types.ts`, `directConnectManager.ts`)

The 3-file `server/` lineage describes a CLI-side direct-connect to an alternative server (`claude --server` running in a coworker's tmux). `connectResponseSchema = {session_id, ws_url, work_dir?}`. `POST ${serverUrl}/sessions`. `sendInterrupt` creates `control_request` with `subtype:'interrupt'`.

Nothing in `services/` implements either side of this. We do not host a `/sessions` endpoint, do not return a `ws_url`, do not handle `control_request{subtype:'interrupt'}` over WebSocket. The session_id ↔ ws_url ↔ working-directory triple is missing. `cancel` exists in the signaling-server control allowlist (`index.ts:476`) but it's unrouted at the gateway.

### 4.4 MISSING — JWT refresh scheduler (`jwtUtils.ts:72-253`)

The 256-LOC `createTokenRefreshScheduler`: generation-counter pattern to invalidate orphan timers across laptop wake-ups, 5-min buffer before expiry, 30-min fallback when `exp` is opaque, 3-strike retry on missing OAuth token, in-flight-promise dedup so concurrent refreshes share one round-trip.

We do not have proactive refresh anywhere. `routes/deviceAuth.ts:29, 146-154` issues a fixed-7-day token. There's no `expires_in`-aware scheduler, no `recoverFromAuthFailure`, no retry budget. When the JWT expires the gateway returns 403; the client must redo the device-flow.

### 4.5 MISSING — OAuth metadata discovery + DCR + paste-callback (`auth.ts:256-2360`)

Reference `auth.ts` ships 2,465 LOC of:

- RFC 9728 + RFC 8414 chained metadata discovery (`fetchAuthServerMetadata`).
- RFC 7591 Dynamic Client Registration (DCR).
- RFC 9068 / SEP-991 CIMD (URL-based client_id_metadata_document).
- PKCE state generation (32-byte base64url).
- HTTP server on `OAUTH_CALLBACK_PORT` (Win 39152-49151, \*nix 49152-65535) with `/callback` + XSS-sanitised error messages.
- Paste-callback fallback for SSH/Codespaces: `submit(callbackUrl)` exposed as a function the user can call with a manually-pasted URL.
- Server.unref() to not pin the event loop; abort-signal lifecycle from React unmount.
- 5-min timeout.
- 8 failure-attribution telemetry events.
- `MCP_OAUTH_CALLBACK_PORT` env override + fixed fallback port 3118.
- Slack-quirk normalizer (`normalizeOAuthErrorBody`): wraps 200-OK error responses to look like 400s so the SDK's parser triggers.
- Cross-process refresh lockfile at `~/.claude/mcp-refresh-${sanitizedKey}.lock` with 5 retries × ~1.5s jittered backoff.

We ship none of this. `routes/llm.ts:127-136` reads upstream API keys from `process.env` directly; there is no per-user OAuth token store on the gateway side. The Anthropic API key is a single env var, not user-bound.

### 4.6 MISSING — Step-up auth (`auth.ts:1354-1374`)

`wrapFetchWithStepUpDetection` watches every fetch response for HTTP 403 + `WWW-Authenticate: insufficient_scope, scope="..."` and calls `provider.markStepUpPending(scope)`. The provider's `tokens()` then OMITS `refresh_token` so the SDK falls through to PKCE redirect (refresh can't elevate scope per RFC 6749 §6).

Zero hits for `insufficient_scope`, `step_up`, `WWW-Authenticate`. We don't issue scoped tokens at all (the JWT carries `userId` + `email` only; scopes are implicit).

### 4.7 MISSING — Cross-App Access (XAA, SEP-990)

`xaa.ts:31-163` + `xaaIdpLogin.ts:99-487` ship the two-leg chain:

- RFC 8693 token exchange at IdP: id_token → ID-JAG (`urn:ietf:params:oauth:grant-type:token-exchange`, `urn:ietf:params:oauth:token-type:id-jag`).
- RFC 7523 JWT bearer at AS: ID-JAG → access_token.
- `performCrossAppAccess` orchestrates PRM + AS discovery + both legs.
- Token redaction regex.
- `XaaTokenExchangeError.shouldClearIdToken` — true for 4xx, false for 5xx, 200-with-bad-body → clear.
- Caches id_token per-issuer (`saveIdpIdToken`); single IdP login → N silent MCP server auths.

Zero implementation. Enterprise SSO single-sign-on for MCP servers requires this chain. We cannot issue an MCP access token without a browser per server.

### 4.8 MISSING — Cancel + outbound-only error path (`bridgeMessaging.ts:399-461`)

The "outbound" channel of the bridge has explicit `control_cancel_request` semantics: server can withdraw a stale prompt before the user answers it. We have no equivalent — once an `agent_approval_requests` row is inserted, the only state transitions are `pending→approved` or `pending→denied` (`routes/agents.ts:223-225, 282-285`). There is no programmatic cancel, no TTL-based auto-cancel, no `request_id`-keyed remove-from-queue beyond the manual `DELETE`-row.

For the outbound side, the reference also documents asymmetric error handling: errors flow back over the same outbound channel that initiated the request. Our `errorHandler.ts` is a flat HTTP error handler; SSE error frames go inline with `data: {...}` but don't carry a request_id, so a client cannot correlate which request the error refers to (visible at `routes/providerStream.ts:230-234`).

### 4.9 MISSING — Coordinator mode (`coordinator/coordinatorMode.ts:49-369`)

Reference: `CLAUDE_CODE_COORDINATOR_MODE=1` flips the system prompt + Worker tool list to the coordinator persona (multi-agent orchestration with `Task`/`SendMessage`/`TaskStop`). `matchSessionMode` is the resume-time auto-flip: if a session was saved in coordinator mode but the env var isn't set, it's flipped synchronously and `tengu_coordinator_mode_switched` is logged. Worker tool list at `:88-95` is "Async-allowed minus `INTERNAL_WORKER_TOOLS`".

Zero implementation. Multi-agent dispatch from mobile→desktop cannot be implemented without this — the desktop side needs to know how to flip into coordinator mode and the protocol assumes session-resume restoration of mode.

### 4.10 MISSING — Crash recovery + ordering invariants

`bridgePointer.ts:129-184` (4h-TTL pointer file at `getProjectsDir()/{sanitized-cwd}/bridge-pointer.json`, worktree-aware fanout for `--continue`, max 50 worktrees), `flushGate.ts` (queues live writes during initial-history POST so server sees `[history…, live…]` in order), `capacityWake.ts` (two-signal abort merger waking at-capacity sleeps on shutdown or session-end). None have analogues. Process-restart loses our in-memory queues entirely (websocket clients map; pendingApprovals on signaling-server).

### 4.11 MISSING — Echo dedup, image normalization, file-UUID resolve

- `BoundedUUIDSet` (2000-cap, evict-oldest, `bridgeMessaging.ts:429-461`) prevents loop-amplification when transports are temporarily duplicated. We have NO echo dedup in WS broadcast (`websocket.ts:539-560`) or signaling-server forwarding (`index.ts:1531-1536`).
- `inboundMessages.ts:45-73` repairs `mediaType` (camelCase from web/iOS) → `media_type` so Anthropic/OpenAI/Google don't reject. Our `routes/llm.ts:62-67` accepts content blocks as-is; malformed images cause 400s upstream.
- `inboundAttachments.ts:97-133` resolves `file_uuid` → `GET /api/oauth/files/{uuid}/content` → `~/.claude/uploads/{sessionId}/{prefix}-{safeName}` → `@path` injection. We have no `/api/oauth/files` route, no uploads dir convention, no file_uuid → @path resolver.

### 4.12 MISSING — GrowthBook poll-config + telemetry stream

`pollConfig.ts:74-91` schema-validated defaults (`POLL_INTERVAL_MS_NOT_AT_CAPACITY=2000`, `_AT_CAPACITY=600_000`, `reclaim_older_than_ms=5000`, `session_keepalive_interval_v2_ms=120_000`). We don't poll (WS push), so this is moot — but we also lack GrowthBook integration entirely for transport-tier knobs.

22-event named telemetry from `net-bridge-remote-server.md §3.4` (`tengu_bridge_started`, `tengu_bridge_session_{started,done}`, `tengu_bridge_heartbeat_mode_{entered,exited}`, `tengu_bridge_reconnected`, `tengu_bridge_token_refreshed`, `tengu_bridge_fatal_error`, `tengu_bridge_repl_ws_{connected,closed}`, `tengu_bridge_repl_v2_session_created`, `tengu_bridge_repl_connect_timeout`, `tengu_bridge_repl_skipped`, `tengu_bridge_multi_session_denied`, `tengu_bridge_spawn_mode_{chosen,toggled}`, `tengu_coordinator_mode_switched`) plus 12 MCP-specific events from `m9-services-mcp.md §10`. Zero are emitted; our telemetry is plain pino entries, not a typed event stream.

### 4.13 MISSING — Fault injection, secret redaction, in-process MCP, claude.ai connectors, headersHelper

- `bridgeDebug.ts:54-135` `/bridge-kick` REPL slash-command for chaos-injecting 404/1006/transient-register failures with zero overhead in external builds.
- `debugUtils.ts:19-34` 16-char + first-8/last-4 secret-redaction utility. Our `services/` has 0 grep hits for `redact`/`mask`.
- `InProcessTransport.ts` `createLinkedTransportPair()` for `claude-in-chrome` MCP server (avoids 325 MB subprocess). We always spawn or HTTP-fetch — would OOM if we hosted Chrome MCP.
- `claudeai.ts:1-164` `GET ${BASE_API_URL}/v1/mcp_servers?limit=1000` with `anthropic-beta: mcp-servers-2025-12-04`, `user:mcp_servers` scope, `markClaudeAiMcpConnected(name)` for stable startup-notification gating. Zero implementation — Claude.ai-managed connectors cannot be loaded via our gateway.
- `headersHelper.ts:42-138` dynamic-header generation via shell command path with workspace-trust gate, `CLAUDE_CODE_MCP_SERVER_{NAME,URL}` env vars, 10s timeout, JSON-string-string output. Our `mcpProxy.ts:78-84, 539-541` accepts only static headers.

---

## 5. Per-axis percentage

| Category                                                | Have-%  | Notes                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Code Runtime register/poll/work                   | **5%**  | Have `desktop_devices` row + WS push. Missing register-returns-WorkSecret, poll loop, ack/heartbeat/stop/archive endpoints.                                                                                                                                                                             |
| Worker epoch bumping                                    | **0%**  | No epoch concept; refresh paths absent.                                                                                                                                                                                                                                                                 |
| 4-tier auth ladder                                      | **20%** | Single-tier HS256 JWT + per-jti revocation + kill-switch. Missing env-secret class, session-ingress JWT class, X-Trusted-Device class.                                                                                                                                                                  |
| Trusted-Device enrollment                               | **5%**  | `device_pairings` table exists for ownership; no token, no Keychain integration, no 10-min session-age gate.                                                                                                                                                                                            |
| Three transport stacks (Hybrid / CCR-v2 / env-less SSE) | **15%** | We ship SSE for LLM proxy (`routes/{llm,cloudChat,providerStream}.ts`). Not a v2 worker-bridge SSE; no JWT refresh, no epoch, no SSE+CCR pair.                                                                                                                                                          |
| `control_request` / `control_response` (30+ subtypes)   | **8%**  | 3 of 30+ subtypes covered indirectly via WS `command` envelope (`chat`/`automation`/`query`). No `interrupt`/`set_model`/`set_max_thinking_tokens`/`mcp_*`/`claude_*`/`apply_flag_settings`/etc.                                                                                                        |
| Cancel + outbound error path                            | **5%**  | Approval rows are denied/approved one-shot. No `control_cancel_request`. SSE error frames not request_id-correlated.                                                                                                                                                                                    |
| Sandbox credential injection                            | **0%**  | We sanitize OUT; reference injects IN. No MITM CONNECT relay, no sandbox runtime.                                                                                                                                                                                                                       |
| Direct-connect session (`/sessions` + `ws_url`)         | **5%**  | We host /ws but on a different protocol (per-user broadcast). No `connectResponseSchema`, no `sendInterrupt`.                                                                                                                                                                                           |
| Permission round-trip routing                           | **35%** | Strong escalation logic in `services/approvalRouting.ts` (priority + team fan-out). Wire shape diverges; no `tool_use_id` correlation; broadcast not server-mediated commit.                                                                                                                            |
| MCP server hosting                                      | **15%** | stdio + http transports + `tools/list` cache + 1MB stdout cap. Missing OAuth (RFC 9728/8414/7591/7009/9068, PKCE, paste-callback, XAA), reconnect lifecycle, list_changed notifications, multi-source config + scope, large-output persistence, Claude tool-format metadata, 6 of 8 transport variants. |
| Channel notifications                                   | **0%**  | No `notifications/claude/channel*`. No allowlist gate. No 25-char alphabet reply schema.                                                                                                                                                                                                                |
| JWT refresh scheduler                                   | **0%**  | Fixed 7-day token; no proactive refresh.                                                                                                                                                                                                                                                                |
| OAuth metadata + DCR + paste-callback                   | **0%**  | None implemented; user-side OAuth happens at the desktop, not the gateway.                                                                                                                                                                                                                              |
| Step-up auth                                            | **0%**  | No insufficient_scope handler.                                                                                                                                                                                                                                                                          |
| Cross-App Access (XAA)                                  | **0%**  | No RFC 8693 / RFC 7523 / ID-JAG support.                                                                                                                                                                                                                                                                |
| Coordinator mode                                        | **0%**  | No multi-agent dispatch coordinator.                                                                                                                                                                                                                                                                    |
| Crash recovery + flushGate + capacityWake               | **0%**  | Process-restart loses all in-memory queue state (websocket clients map is recovered on reconnect; pendingApprovals on signaling-server is in-memory only).                                                                                                                                              |
| Echo dedup (`BoundedUUIDSet`)                           | **0%**  | Naive WS broadcast can amplify if a misbehaving peer re-sends.                                                                                                                                                                                                                                          |
| Image normalization (`mediaType→media_type`)            | **0%**  | iOS-style image blocks reach the upstream provider unmodified.                                                                                                                                                                                                                                          |
| File-UUID resolve + uploads dir                         | **0%**  | No /api/oauth/files endpoint, no file_uuid → @path resolution.                                                                                                                                                                                                                                          |
| Telemetry stream (22 + 12 events)                       | **5%**  | Plain `logger.info` calls; no typed event names matching the bridge spec.                                                                                                                                                                                                                               |

---

## 6. Surface percentage

Aggregate across all 22 categories (weighted equally):

- **Mean coverage: ~6.2%.**
- Three categories (permission routing 35%, auth ladder 20%, MCP 15%) carry most of the weight. Without them the average is **~3%**.
- 11 of 22 categories are at **0%**.

**Strict reading of "bridge-protocol parity":** essentially **0%**. The protocol family our `services/` codebase implements is cleanly disjoint from CCR / bridge / remote-control. We ship a credible inbound HTTP+WebSocket+WebRTC-pairing surface for our own desktop and mobile clients, but we have not implemented the outbound-CCR-worker side of any of the four bridge transport stacks.

---

## 7. Effort

To bring **services/api-gateway/** + **services/signaling-server/** to 60%+ parity with the bridge backend would require new code on the order of:

| Item                                                                                   | Estimate (LOC)  | Notes                                                                                       |
| -------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `/v1/environments/*` REST surface (register / poll / ack / heartbeat / stop / archive) | 2,000           | New router + DB schema + JWT mint for env_secret class + WorkSecret envelope.               |
| `/v1/code/sessions/*` env-less fast path                                               | 800             | New router; OAuth → worker_jwt exchange; epoch bumping.                                     |
| `/v1/sessions/ws/{id}/subscribe` WS subprotocol with Bearer-on-upgrade                 | 600             | New WSS endpoint with origin checks + close-code 4001/4003 semantics.                       |
| Trusted-Device enrollment + 90-day rolling table + Keychain client                     | 700             | DB schema (`trusted_devices`), enrollment route, two-flag rollout, memoized header-builder. |
| 30+ subtype `control_request` dispatcher                                               | 1,500           | Wire schema + handler-registry + per-subtype implementations + cancel pathway.              |
| MCP OAuth (DCR + PKCE + paste-callback + XAA + step-up + RFC 7009)                     | 3,500           | Port `auth.ts:1-2360` + `xaa*.ts` + `oauthPort.ts`.                                         |
| MCP transports (sse / sse-ide / ws / ws-ide / sdk / claudeai-proxy / in-process)       | 1,800           | 6 new transport variants + fresh-timeout wrapper.                                           |
| MCP lifecycle (reconnect / cache invalidation / list_changed)                          | 600             | Port `useManageMCPConnections.ts` reconnect loop.                                           |
| Multi-source MCP config + scope + dedup + env expansion + atomic write + headersHelper | 1,200           | Port `config.ts:1-1578` + `headersHelper.ts:1-138`.                                         |
| Channel notifications (3 message types + allowlist + permission relay + reply schema)  | 800             | Port `channelNotification.ts` + `channelPermissions.ts` + `channelAllowlist.ts`.            |
| JWT refresh scheduler + cross-process backoff key                                      | 350             | Port `jwtUtils.ts:72-253`.                                                                  |
| Coordinator mode wiring                                                                | 500             | New mode flag; system-prompt switch; tool-list filter.                                      |
| Telemetry event stream (22 + 12 events)                                                | 400             | Typed event helper + emit sites.                                                            |
| `bridgePointer.ts` + `flushGate.ts` + `capacityWake.ts` analogues                      | 500             | Port crash-recovery + ordering invariants.                                                  |
| Echo dedup (`BoundedUUIDSet`) + image normalization + file-UUID resolve                | 400             | Three small utility ports.                                                                  |
| Sandbox credential injection (MITM CONNECT relay + protobuf framing)                   | 1,500           | Optional; only needed if we host CCR-style sandboxes.                                       |
| **Total**                                                                              | **~17,150 LOC** |                                                                                             |

For comparison, current `services/api-gateway/src/` totals ~5,400 LOC and `services/signaling-server/src/` totals ~3,000 LOC. The gap is **~2× the current codebase**.

Realistic scope for a parity sprint:

- **Tier-1 (must-have for cross-surface integration, ~3,500 LOC, 21–30 days):** JWT refresh scheduler + Trusted-Device enrollment + WorkSecret envelope shape with `validateBridgeId` regex + `control_request`/`control_response` with cancel + echo dedup + image normalization.
- **Tier-2 (MCP modernization, ~5,500 LOC, 30–45 days):** OAuth flow (DCR+PKCE+paste-callback+RFC 7009) + connection lifecycle + list_changed + multi-source config + 4 of 6 missing transports.
- **Tier-3 (CCR worker model, ~4,400 LOC, 45–60 days):** `/v1/environments/*` + `/v1/code/sessions/*` + `/v1/sessions/ws/*` + epoch bumping + `bridgePointer`/`flushGate`/`capacityWake`.
- **Tier-4 (defer):** Sandbox credential injection (1,500 LOC), XAA (500 LOC), step-up (200 LOC), channel notifications (800 LOC) — only needed for enterprise-SSO / Claude.ai-marketplace parity, not for own-desktop/mobile cross-surface integration.

---

## 8. Open risks / cross-surface integration questions

1. **Direction inversion is structural.** Our 8787 inbound bridge solves a different problem from the reference's outbound worker registration. To match Anthropic Dispatch / Cowork / Remote-Control, we have to ship BOTH: keep 8787 inbound, AND add `/v1/code/sessions` outbound on the gateway. Cannot collapse to one.
2. **Our gateway is single-instance-friendly only.** `middleware/rateLimit.ts:117-180` `warnIfMultiInstanceWithoutRedis` already names this. The bridge protocol assumes server-side state survives instance migration (workers may reconnect to a different gateway pod after rolling deploy). That requires a Redis-backed `revoked_jwts`, `pending_approvals`, `pending_commands` cache before paid-tier launch with horizontal scale.
3. **Trusted-Device must enroll at /login.** Server-side gates on `account_session.created_at < 10 min`. Lazy enrollment after 403 is impossible. If we add Trusted-Device, it must happen at the same moment as Supabase's first-session token mint, not on first 403.
4. **Epoch-bumping is mandatory on every credential refresh.** A naïve "JWT-only swap" 409s within 20s on the next heartbeat. Our refresh paths must rebuild the entire transport, not just swap headers.
5. **CSE* ↔ SESSION* tag duality.** `sessionIdCompat.ts:38-57` describes two server endpoints looking up by different IDs; both translations need to happen at the bridge boundary. We don't ship anything like this; the moment we run more than one ID generation scheme, we'll regress.
6. **Permission protocol default must be "ask the human".** Reference's `bridgeMain.ts:2586-2590` literally logs "(not auto-approving)". Our `routes/agents.ts:215, 274` already enforces explicit approve/deny — keep that invariant. New approval surfaces (e.g., a Slack channel responder) must default to deny.
7. **HTTPS-only enforcement.** Reference (`bridgeMain.ts:2182-2193`) hard-rejects non-localhost HTTP at startup. Our gateway accepts both — `index.ts:54` reads `PORT`, no scheme enforcement. Should add a startup check that any non-localhost upstream URL is HTTPS when `NODE_ENV === 'production'`.
8. **`upstreamproxy/` ≠ LLM proxy.** Our `routes/llm.ts` is named "LLM proxy" but it's an OpenAI-compatible chat-completions broker, not the sandbox-credential-injection MITM CONNECT relay the reference's `upstreamproxy/` ships. Naming collision. If we ever build the sandbox runtime, the new code must be named differently.

---

## 9. Bottom line

The reference's `bridge/` + `remote/` + `server/` + `upstreamproxy/` modules describe a tightly-engineered outbound-worker protocol with four-tier auth, three transport stacks, 30+ control subtypes, MCP OAuth at production grade, and channel-notification cross-surface integration. **Our `services/api-gateway/` + `services/signaling-server/` codebase implements a credible but disjoint inbound-only protocol family**: HS256-JWT-authenticated Express + WebSocket for desktop/mobile/web clients, with WebRTC pairing for direct-connect, MCP stdio+http proxy, and SSE LLM provider proxy.

The gap is structural. ~6% mean coverage across 22 categories; 11 categories at 0%. Reaching 60%+ parity is a ~17,000 LOC port — roughly 2× the current `services/` codebase. The fastest paths to credible cross-surface integration (Dispatch / Cowork-style) are Tier-1 (JWT refresh scheduler + Trusted-Device + WorkSecret envelope + `control_request` cancel pathway, ~3,500 LOC, 21–30 days) which unlocks the protocol shape without inventing new wire formats, plus Tier-2 (MCP OAuth modernization, ~5,500 LOC) which unblocks every Claude.ai-marketplace and production third-party MCP server.

Files read in full: 36 source files in `services/api-gateway/src/` + `services/signaling-server/src/`, totalling ~5,500 LOC TypeScript (plus 1,697 LOC `signaling-server/src/index.ts`). Cross-referenced against `tasks/research/deep/{net-bridge-remote-server.md,m9-services-mcp.md,m1-cli-print-launchers.md}` (47 files / ~30,000 LOC reference).

# src-07-networking — Bridge / Remote / UpstreamProxy / Server

Reference root: `~/Desktop/reference/src/`. Total surface area in scope: **39 files / ~14,838 LOC** (per `wc -l`). Everything here is HTTP/WebSocket plumbing on top of a single backend service Anthropic calls **CCR** (Claude Compute / Code Runner). Four directories, four roles:

| Dir              | Files | LOC    | Role                                                                                                                  |
| ---------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `bridge/`        | 31    | 12,388 | Local CLI ↔ CCR backend ↔ claude.ai web UI. The "Remote Control" feature.                                             |
| `remote/`        | 4     | 1,129  | Web/iOS UI side: subscribes to a CCR-hosted agent session by ID.                                                      |
| `upstreamproxy/` | 2     | 740    | Container-side: localhost CONNECT proxy that tunnels curl/gh/python through CCR for MITM injection of vendor secrets. |
| `server/`        | 3     | 358    | CLI as a _direct-connect client_ to a third-party `--server-url` endpoint (no CCR).                                   |

Below: structured findings with file:line citations.

## Bridge

### Q1. What does `bridge/` bridge?

CLI ↔ Anthropic CCR backend ↔ claude.ai/code web UI (and Anthropic Dispatch mobile). Confirmed at `bridge/types.ts:9-11`:

> `'Error: You must be logged in to use Remote Control.\n\n' + BRIDGE_LOGIN_INSTRUCTION`

And `bridge/bridge.tsx:32-34`:

> `When enabled, sets replBridgeEnabled in AppState, which triggers useReplBridge in REPL.tsx to initialize the bridge connection. The bridge registers an environment, creates a session with the current conversation, polls for work, and connects an ingress WebSocket for bidirectional messaging between the CLI and claude.ai.`

The bridge is **not** Chrome-extension-related and **not** a Tauri IPC. It's an outbound network client to Anthropic's hosted "Environments" API.

### Q2. Transport

Three layers stacked:

1. **HTTP (axios)** for environment lifecycle: register / poll / ack / heartbeat / stop / deregister (`bridge/bridgeApi.ts:141-451`).
2. **WebSocket (`ws` / Bun-native)** ingress for SDK message stream (built via `buildSdkUrl` at `bridge/workSecret.ts:41-48`: `wss://api.anthropic.com/v1/session_ingress/ws/{sessionId}` in prod, `ws://localhost/v2/...` in dev).
3. **SSE + HTTP POST batch** for the newer "CCR v2" path: `SSETransport` (reads) + `CCRClient` (writes) — see `bridge/replBridgeTransport.ts:119-368`. Heartbeats/state via PUT `/worker`, events via POST `/worker/events`.

There is also a hidden v1.5: env-less bridge in `bridge/remoteBridgeCore.ts:14-19` collapses register/poll/ack into two calls — `POST /v1/code/sessions` + `POST /v1/code/sessions/{id}/bridge`.

### Q3. Message protocol

JSON SDK-message protocol — not JSON-RPC. Discriminated union on `type`. Type guards at `bridge/bridgeMessaging.ts:36-70`:

- `SDKMessage` (assistant / user / result / system / stream_event / tool_progress / etc.).
- `SDKControlRequest` (`subtype: 'initialize' | 'set_model' | 'set_max_thinking_tokens' | 'set_permission_mode' | 'interrupt' | 'can_use_tool'`) — `bridge/bridgeMessaging.ts:285-384`.
- `SDKControlResponse` mirroring the request with `subtype: 'success' | 'error'` and `request_id`.
- `WorkResponse` envelope from poll: `{ id, type:'work', environment_id, state, data: { type:'session'|'healthcheck', id }, secret, created_at }` — `bridge/types.ts:23-31`.
- `WorkSecret` (base64url JSON, version=1): `{ session_ingress_token, api_base_url, sources, auth, claude_code_args, mcp_config, environment_variables, use_code_sessions }` — `bridge/types.ts:33-51`.
- `PermissionResponseEvent`: `{ type:'control_response', response: { subtype:'success', request_id, response } }` — `bridge/types.ts:124-131`.

CCR v2 also uses an `UpstreamProxyChunk` protobuf (only in the upstreamproxy relay — see below).

### Q4. Port / socket / pipe

**No local TCP/UDS** — bridge is purely outbound to `api.anthropic.com`. There is **no listening port**. Override knobs (ant-only dev): `CLAUDE_BRIDGE_BASE_URL`, `CLAUDE_BRIDGE_OAUTH_TOKEN` — `bridge/bridgeConfig.ts:18-31`.

This is the most important architectural difference from our `apps/desktop/` 8787 native-messaging bridge, which **does** listen.

### Q5. Auth between endpoints

Three-tier auth chain — `bridge/types.ts:127-131` and `bridge/bridgeApi.ts:76-89`:

1. **OAuth Bearer token** (`getClaudeAIOAuthTokens()`) for environment management. Refreshable via `onAuth401` injection; see `withOAuthRetry` at `bridge/bridgeApi.ts:106-139`.
2. **Environment secret** (returned from `POST /v1/environments/bridge`) for poll / heartbeat — separate header.
3. **Session ingress token** (JWT, in WorkSecret `session_ingress_token`) to authenticate WS upgrade and CCR v2 worker endpoints. Decoded at `bridge/jwtUtils.ts`; refresh scheduler keeps it alive.
4. **Trusted device token** (`X-Trusted-Device-Token`) when ELEVATED security tier is enabled — `bridge/bridgeApi.ts:84-87`, `bridge/trustedDevice.ts`.

Required headers (`bridge/bridgeApi.ts:38, :77-83`):

```
Authorization: Bearer <token>
anthropic-version: 2023-06-01
anthropic-beta: environments-2025-11-01    (env API)
anthropic-beta: ccr-byoc-2025-07-29        (sessions API — bridge/createSession.ts:140)
x-environment-runner-version: <version>
```

### Q6. Per-message types

`bridge/bridgeMessaging.ts:285-384` enumerates the server→client `SDKControlRequest` subtypes; `bridge/sessionRunner.ts:32-43` shows the client→server `can_use_tool` permission request:

```typescript
{
  type: 'control_request',
  request_id: string,
  request: {
    subtype: 'can_use_tool',
    tool_name: string,
    input: Record<string, unknown>,
    tool_use_id: string,
  }
}
```

`bridge/createSession.ts:18-23` shows the bulk-event upload envelope: `{ type: 'event', data: <SDKMessage> }`.

## Remote

### Q7. What does `remote/` do?

**Client-side viewer** for an agent session that lives on CCR. The CLI runs _inside_ the agent (via `bridge/`); `remote/` is the _other side_ — REPL/iOS subscribes to receive that session's stream. Confirmed at `remote/SessionsWebSocket.ts:75-81`:

> `WebSocket client for connecting to CCR sessions via /v1/sessions/ws/{id}/subscribe ... Connect to wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...`

This is **not** GitHub-Actions — that lives under `utils/background/remote/`. `remote/` is purely a transport for "hop into someone's running session".

### Q8. Remote agent registration

Out of scope for this directory — registration happens in `bridge/`. `remote/` only consumes the resulting `sessionId`. Configuration shape at `remote/RemoteSessionManager.ts:50-62`:

```typescript
type RemoteSessionConfig = {
  sessionId: string;
  getAccessToken: () => string;
  orgUuid: string;
  hasInitialPrompt?: boolean;
  viewerOnly?: boolean; // ctrl+C does NOT interrupt; pure read-only
};
```

`viewerOnly` is the `claude assistant` mode — `remote/RemoteSessionManager.ts:57-61` and `main.tsx:3260, :4340`.

### Q9. Auth flow

Token passed via `Authorization: Bearer` header on the WS upgrade — `remote/SessionsWebSocket.ts:115-118`. No separate auth message after upgrade (header-only). `getAccessToken` is a thunk so the manager always reads the current token (refresh-aware) — `remote/RemoteSessionManager.ts:52`.

### Q10. Streaming back to local UI

WS frames → `handleMessage` → `convertSDKMessage` (`remote/sdkMessageAdapter.ts:168-278`) → REPL `Message` types. The adapter handles 8 SDK types and routes to assistant / system / stream_event / ignored. Permission requests special-cased at `remote/RemoteSessionManager.ts:189-214` — they spawn a synthetic local `AssistantMessage` (`remote/remotePermissionBridge.ts:12-46`) so the REPL's existing tool-permission UI can render them.

### Q11. Cancellation / timeout

- Interrupt: `RemoteSessionManager.cancelSession()` at `remote/RemoteSessionManager.ts:294-297` sends `control_request` `{ subtype: 'interrupt' }`.
- Per-message timeout at hook level: 60 s default, 180 s during compaction — `hooks/useRemoteSession.ts:36-41`.
- Server-side close codes — `remote/SessionsWebSocket.ts:34-36, :247-272`: `4003` (unauthorized — no reconnect), `4001` (session not found — up to 3 retries during compaction), other → backoff up to 5 attempts (delay 2s).
- 30-s reconnect ping interval — `remote/SessionsWebSocket.ts:19, :301-313`.

### Q12. Storage of remote-task state

`remote/` itself is stateless (just a WS handle and pending-permission map at `RemoteSessionManager.ts:97-98`). Persistent state for _RemoteAgentTask_ lives at `tasks/RemoteAgentTask/RemoteAgentTask.tsx` and `utils/sessionStorage.ts` (`writeRemoteAgentMetadata`). The CCR backend itself stores transcripts; the CLI re-fetches them via `utils/teleport/api.ts` `fetchSession` (`/v1/sessions/{id}`).

## Upstream Proxy

### Q13. What does `upstreamproxy/` proxy?

**Not Anthropic and not OpenAI directly.** It proxies _third-party_ HTTPS traffic from inside a CCR sandbox — curl, gh, kubectl, python — through CCR so the server can MITM inject org-configured secrets (e.g. Datadog API keys). `upstreamproxy/upstreamproxy.ts:6-19`:

> `When running inside a CCR session container with upstreamproxy configured, this module: 1. Reads the session token from /run/ccr/session_token, 2. Sets prctl(PR_SET_DUMPABLE, 0) to block same-UID ptrace ... 4. Starts a local CONNECT→WebSocket relay ... 6. Exposes HTTPS_PROXY / SSL_CERT_FILE env vars`

Anthropic's own API and GitHub are explicitly excluded — `NO_PROXY_LIST` at `upstreamproxy/upstreamproxy.ts:37-63`.

### Q14. Why a proxy?

Cited in `relay.ts:6-13`: cred-injection MITM. CCR org admins configure secrets (Datadog, custom registries); user agent code can call `curl https://api.datadoghq.com/...` and the server adds `DD-API-KEY` without ever exposing the key to the running agent. Full design doc reference: `api-go/ccr/docs/plans/CCR_AUTH_DESIGN.md § "Week-1 pilot scope"` per `upstreamproxy.ts:20`.

This is **not** a BYOK proxy. **Not** caching. **Not** transformation of LLM payloads. It's purely an outbound credential-injection MITM for **non-LLM** traffic.

### Q15. Per-provider upstream endpoints

None — opaque. The proxy is generic CONNECT. The server side terminates TLS and forwards. The client only knows: "anything I CONNECT to via the local relay gets routed through CCR's egress proxy."

### Q16. Header handling

Two auth layers — `upstreamproxy/relay.ts:160-165`:

- **WS upgrade** — `Authorization: Bearer <session_token>` (the session-ingress JWT, `upstreamproxy/relay.ts:165`).
- **Tunneled CONNECT** — `Proxy-Authorization: Basic <base64(sessionId:token)>` written as the first chunk inside the tunnel (`relay.ts:382-384`).

Plus `Content-Type: application/proto` because the tunnel is a stream of `UpstreamProxyChunk` protobuf messages, not JSON (`relay.ts:355-358`).

### Q17. Streaming pass-through

Bidirectional TCP-over-WS. Bytes from CONNECT client get `encodeChunk()`'d (`relay.ts:66-81`) and shipped one chunk per WS frame (max 512 KiB per `MAX_CHUNK_BYTES`, `relay.ts:51`). Server frames `decodeChunk()`'d back to TCP (`relay.ts:87-103, :398-408`). Application-level keepalive: empty chunks every 30 s (`relay.ts:54, :430-434`). Backpressure: Bun is manual (per-socket `writeBuf` queue, `relay.ts:186-225`), Node auto-buffers (`relay.ts:259-264`).

## Server

### Q18. What does `server/` host?

Misleading name. **Not** a server. `server/` is the **client side of a `--server-url` direct-connect mode** — REPL acts as a thin client to a third-party long-running session host (e.g. someone running their own CCR-equivalent or just an SDK runner that exposes WebSocket). Confirmed at `main.tsx:188`: `import { createDirectConnectSession, DirectConnectError } from './server/createDirectConnectSession.js'`.

Actual MCP servers live at `entrypoints/mcp.ts` and `utils/{computerUse,claudeInChrome}/mcpServer.ts` — distinct path.

### Q19. Routes / endpoints exposed

None — `server/` is a _client_. The endpoints it _talks to_ (`server/createDirectConnectSession.ts:49`):

```
POST {serverUrl}/sessions  →  { session_id, ws_url, work_dir? }
ws_url (WebSocket)         →  newline-delimited JSON SDKMessage stream
```

### Q20. Auth model

Optional `Bearer authToken` — `server/createDirectConnectSession.ts:43-45` and `server/directConnectManager.ts:51-58`. No mandatory auth — meant for trusted dev environments / self-hosted servers.

### Q21. Lifecycle

Per-session, ephemeral. Created via `POST /sessions` (`server/createDirectConnectSession.ts:49-58`), held open until WS closes, no persistence (`server/types.ts:46-57` defines a `SessionIndex` schema for a hypothetical _real_ server, but the client doesn't use it).

`server/types.ts:46-50` documents `SessionIndexEntry` ("Persisted to ~/.claude/server-sessions.json so sessions can be resumed across server restarts") — but this is the schema for the **server** end, not implemented in this codebase. Suggests the same team runs the equivalent server somewhere and these types are shared.

## Cross-References

### Q22. Tool integration

- **SendMessageTool** (`tools/SendMessageTool/SendMessageTool.ts:4, :73, :586-646`): supports `bridge:session_<id>` recipient — tool messages routed via `getReplBridgeHandle()` (`bridge/replBridgeHandle.ts`). Cross-machine bridge messages require explicit user consent (`SendMessageTool.ts:594-596`).
- **BriefTool** (`tools/BriefTool/upload.ts:25`): uploads attachments via `bridge/bridgeConfig` (auth + base URL).
- **Bash, WebFetch, WebSearch, computer-use** — **NO** code path through `bridge/` / `remote/` / `server/` / `upstreamproxy/`. Tools execute locally; bridge only mirrors their messages outbound.
- The upstream proxy _transparently_ affects Bash subprocesses (curl/gh) via env-var injection (`upstreamproxy/upstreamproxy.ts:160-198`, registered through `utils/subprocessEnv.ts:80`). The Bash tool itself is unaware.

### Q23. Coordinator integration

Subagent dispatch does **not** route through `remote/`. Local subagents run in-process. Cross-machine "peer messaging" via SendMessageTool's `bridge:` scheme is the closest analogue — but it's user→user, not coordinator→subagent.

`tasks/RemoteAgentTask/RemoteAgentTask.tsx:1-100` is the _cloud-task_ runner: the user spawns `Task(remote_agent)` which posts to `/v1/sessions` and polls; this also doesn't use the `remote/` directory — it lives in `utils/teleport/api.ts`.

### Q24. From `services/`

`services/` (analytics, oauth, mcp, lsp) consumes `bridge/`'s OAuth helpers via `bridge/bridgeConfig` and `bridge/jwtUtils` (`cli/transports/ccrClient.ts:6` imports `decodeJwtExpiry` from `bridge/jwtUtils`). No `services/*` directly imports `remote/` / `server/` / `upstreamproxy/`.

`services/oauth/client.ts` (`getOrganizationUUID`) is consumed by `bridge/createSession.ts:56-57`.

### Q25. From `commands/`

- `commands/bridge/bridge.tsx` — the `/remote-control` slash command (`commands/bridge/bridge.tsx:26-105`).
- `commands/bridge-kick.ts` — debug slash to force a bridge reconnect.
- `commands/ultraplan.tsx:2` imports `REMOTE_CONTROL_DISCONNECTED_MSG`.
- `commands/rename/rename.ts:6` updates session title via `bridge/createSession.ts:updateBridgeSessionTitle` → PATCH `/v1/sessions/{id}`.
- `commands/login/login.tsx:5` and `commands/logout/logout.tsx:2` enroll/clear trusted-device tokens (`bridge/trustedDevice.ts`).
- `/share`, `/resume`, `/push` — there is **no** `/share` or `/push` slash command in this repo (greps return no matches in commands/). `/resume` lives at the program-flag level (`--resume` in main.tsx, `--continue` for bridge resume at `bridge/bridgeMain.ts:2009-2014, :2149-2175`).

## Topology Diagram (Prose)

Three concurrent network paths can be active in one CLI process:

```
┌─────────────── CLI process (your machine) ──────────────────┐
│                                                              │
│  REPL (screens/REPL.tsx)                                     │
│   │                                                          │
│   ├─[useReplBridge]──→ bridge/   ──HTTP+WS──→  Anthropic CCR │
│   │                    "I'm here, give me work"              │
│   │                                                          │
│   ├─[useRemoteSession]──→ remote/  ──WS──→     Anthropic CCR │
│   │                    "subscribe me to session X"           │
│   │                                                          │
│   ├─[useDirectConnect]──→ server/  ──HTTP+WS──→ third-party  │
│   │                    "connect to my SDK runner"            │
│   │                                                          │
│   └─[Tools (Bash/curl/gh)]                                   │
│        │                                                     │
│        ↓ HTTPS_PROXY=127.0.0.1:NNNN                          │
│        upstreamproxy/relay   ──CONNECT-over-WS──→ CCR egress │
│        (only inside CCR containers; not on user laptops)     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Direction matters. `bridge/` is **the CLI presenting itself as a Worker** (Anthropic's term) to the backend — the backend pushes work _to_ the CLI. `remote/` is **the CLI presenting itself as a Subscriber/Viewer** — the backend pushes events _to_ the CLI as a peer of someone else's session. Both share `Anthropic CCR` as the rendezvous, which is why the `SDKMessage` type ladders through both.

`upstreamproxy/` is orthogonal — it exists _only inside_ CCR-hosted containers (`upstreamproxy.ts:85` gates on `CLAUDE_CODE_REMOTE` env var). No code path on a user laptop activates it.

`server/` is for self-hosted SDK runners: the CLI talks to _your_ server, not Anthropic's.

The four directories are stitched together at exactly one place — `screens/REPL.tsx:1389-1411`:

```typescript
const remoteSession = useRemoteSession({ ... })
const directConnect = useDirectConnect({ ... })
```

…and the bridge handle is set globally via `bridge/replBridgeHandle.ts`. There is no combined gateway/router; React hooks fan out into the three transports.

## Comparison Hooks

### Q26. Our 8787 bridge vs Claude Code's bridge

**Our `apps/desktop/`'s 8787 native-messaging bridge** (per `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/MEMORY.md`) is a _local listener_ used by the Chrome extension to talk to the desktop app. **Claude Code's `bridge/` is purely outbound to Anthropic CCR** — it has no listener. The two solve different problems:

- Ours = process-to-process IPC for browser ext ↔ desktop ("local transport").
- Theirs = client-to-cloud sync ("Remote Control": CLI ↔ Anthropic backend ↔ web/iOS).

What theirs does that ours doesn't:

- **Backend-driven work poll loop** with empty-poll batching (`bridge/bridgeApi.ts:74, :228-241`).
- **Session lease + heartbeat** with auto-expiry and explicit reconnect/reclaim (`bridge/types.ts:170-176, :411-417`).
- **OAuth token refresh on 401** + trusted-device token enrollment.
- **Cross-device session mirroring** (CCR mirror mode at `bridge/bridgeEnabled.ts:191-202`) for outbound-only telemetry.
- **Spawn modes** (`single-session`, `worktree`, `same-dir`) for multi-session capacity (`bridge/types.ts:69`).
- **CCR v2 dual-transport** (HybridTransport ⇋ SSE+CCRClient) with seamless mid-session switch (`bridge/replBridgeTransport.ts`).

### Q27. Our absent remote-agent system

To match `remote/`, AGI Workforce would need:

1. A backend that hosts an agent process and publishes its message stream via WS — analogous to CCR session-ingress.
2. A subscribe protocol: `/v1/sessions/ws/{id}/subscribe?organization_uuid=...` (Bearer auth on upgrade).
3. Per-message permission round-trip via `control_request{can_use_tool}` ↔ `control_response{behavior:allow|deny}`.
4. Reconnect strategy with permanent vs transient close codes (`SessionsWebSocket.ts:34-36`).
5. SDK-message → local-Message adapter for rendering (`remote/sdkMessageAdapter.ts:168-278`).
6. Tasking shim — synthetic AssistantMessage + Tool stub for tools the local CLI doesn't have loaded (`remote/remotePermissionBridge.ts:12-78`).

Our `services/signaling-server` (Fly.io WebRTC) is the wrong abstraction — it's peer-discovery for browser↔browser, not server-hosted agent streaming. We'd need a new `services/session-ingress` service.

### Q28. Our absent upstream-proxy

Adopting `upstreamproxy/` for our BYOK story would be a poor fit:

- It's an **outbound credential-injection MITM** for non-LLM traffic (curl/gh/python). Not a BYOK swap on LLM API calls.
- BYOK in our world is about the _user's_ keys being held by the CLI/web, not the _org's_ keys being injected mid-flight by a backend.
- It requires the agent to run in a controlled container where `prctl(PR_SET_DUMPABLE,0)` is meaningful (`upstreamproxy.ts:225-252`).

What _is_ worth borrowing: `packages/llm-normalize` already handles cross-provider quirks. A thin **provider-switching proxy** could front the CLI's HTTP client and rewrite per-provider headers. But the upstream-proxy pattern itself doesn't simplify BYOK — our existing `packages/providers/*` adapters are the right layer.

The CONNECT-over-WS protocol idea (`relay.ts:66-103`) is reusable for tunneling tool sandboxes through cloud — interesting if we ever ship a managed-cloud Hobby tier where user shells need outbound network through our infra.

## Open Questions

1. **Is `bridge/` fully outbound on user laptops too, or does the env-less v2 path (`remoteBridgeCore.ts`) ever expose a local listener?** Spot-checked: no listener — just a different HTTP-call sequence (`POST /v1/code/sessions` + `POST /bridge`). But the file is large and I read only the header block; an embedded server for SSE-back-channel would be inconsistent with the comments but possible. Would need full read of `remoteBridgeCore.ts:1008` lines + `replBridge.ts:2406` lines to fully rule out.

2. **What does `claude assistant` actually do at the network level?** Discovered `viewerOnly: true` in `RemoteSessionConfig` (`remote/RemoteSessionManager.ts:57-61`) and references at `main.tsx:3260-3290, :4340`. Suggests the CLI can attach as a _pure viewer_ to someone else's bridge session — auth model unclear. Is it the same OAuth user, or cross-user with explicit invite? If cross-user, the auth surface is much wider than the current `Authorization: Bearer` header reveals.

3. **How does the bridge resume across machine restarts?** `--continue` reads `bridge/bridgePointer.ts`'s pointer file and `--session-id` triggers `reconnectSession` at `bridge/bridgeApi.ts:358-385`, which "force-stops stale worker instances." This implies the server tracks worker leases by IP/host — but the `BridgeConfig.bridgeId` is a client-generated UUID (`bridge/types.ts:91`). What's the actual identity tied to the lease — bridgeId, environmentId, or server-issued?

4. **Why are there four parallel APIs for "create a session"?** Found:
   - `POST /v1/environments/bridge` (env API, register env) — `bridgeApi.ts:155`
   - `POST /v1/code/sessions` (CCR v2 direct, env-less) — `codeSessionApi.ts:33`
   - `POST /v1/sessions` (creates a session inside an existing env, includes `environment_id`) — `createSession.ts:144`
   - `POST {serverUrl}/sessions` (third-party direct-connect) — `createDirectConnectSession.ts:49`

   Each requires different beta headers (`environments-2025-11-01` vs `ccr-byoc-2025-07-29`) and different ID prefixes (`session_*` vs `cse_*` — see `bridge/sessionIdCompat.ts`). Strong signal that the backend has _not_ converged its API surface even internally. We should not adopt this pattern; we should pick exactly one.

5. **`upstreamproxy/relay.ts:51` caps chunks at 512 KiB ("Envoy per-request buffer cap")** — does this mean the entire CCR backend is gated by Envoy/Istio? If so, our managed-cloud architecture decisions (rate-limits, circuit breakers, per-session memory caps) should align. No code citation supports this beyond a comment. Worth investigating before we lock in our own gateway choice.

6. **Trusted device tokens**: `bridge/trustedDevice.ts` is referenced repeatedly but I didn't read it. The `X-Trusted-Device-Token` header (`bridgeApi.ts:84-87`) gates the ELEVATED security tier — what does enrollment look like, and is it transferable across CLI installations? This affects our own desktop-app "trusted device" UX which currently relies on biometrics + MMKV (per MEMORY.md mobile section).

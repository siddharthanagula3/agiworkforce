# Pairing/Reconnect State Machine Contract

> Canonical reference for the mobile-desktop pairing lifecycle.
> All surfaces and services MUST conform to this state machine.

## Overview

The pairing system connects a mobile device to a desktop instance via a QR code flow,
backed by a WebSocket signaling server and optional WebRTC data channel upgrade.

### Components

| Component                                                                             | Role                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **API Gateway** (`services/api-gateway/src/routes/pair.ts`)                           | JWT-authenticated REST API for initiating/confirming/cancelling pairings     |
| **Signaling Server** (`services/signaling-server/src/index.ts`)                       | WebSocket relay for session management, peer discovery, and WebRTC signaling |
| **Mobile Client** (`apps/mobile/stores/connectionStore.ts`)                           | Zustand store managing connection lifecycle, WebRTC, and control messages    |
| **Desktop Client** (Tauri backend + `connectionStore`)                                | Generates QR codes, scans pairing codes, establishes peer connection         |
| **Shared Types** (`packages/types/src/pairing.ts`, `packages/types/src/signaling.ts`) | Canonical type definitions                                                   |

---

## States

| #   | State               | Description                                                                                                      | Owner                             |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | `unpaired`          | No active pairing session. Default/initial state.                                                                | Mobile + Desktop                  |
| 2   | `pairing_initiated` | Mobile has called `POST /pair/initiate`; pairing code + QR generated. Waiting for desktop scan.                  | API Gateway + Signaling Server    |
| 3   | `pairing_confirmed` | Desktop has called `POST /pair/confirm`; code validated, DB updated. Both sides told to connect to WebSocket.    | API Gateway                       |
| 4   | `registering`       | Client has opened WebSocket and sent `register` message. Waiting for server acknowledgment.                      | Signaling Server                  |
| 5   | `registered`        | Server acknowledged registration. Waiting for peer to join.                                                      | Signaling Server                  |
| 6   | `connected`         | Both peers registered; `peer_ready` exchanged. WebRTC upgrade may begin. Control channel active.                 | Signaling Server + Mobile/Desktop |
| 7   | `heartbeat_missed`  | No heartbeat/pong received within the idle timeout window. Connection presumed unhealthy.                        | Connection Manager                |
| 8   | `reconnecting`      | Client detected disconnect and is attempting to re-register with the same pairing code (if session not expired). | Mobile/Desktop Client             |
| 9   | `expired`           | Session TTL elapsed (default 300s). Server closes sockets and deletes session.                                   | Signaling Server                  |
| 10  | `disconnected`      | Peer left, session terminated, or client explicitly disconnected. Clean teardown.                                | Mobile/Desktop Client             |
| 11  | `error`             | Unrecoverable error (invalid code, rate limited, server unavailable, etc.).                                      | Any                               |

---

## State Transitions

```
                                   +-----------+
                                   |  unpaired |
                                   +-----+-----+
                                         |
                           POST /pair/initiate (mobile)
                                         |
                                         v
                              +-------------------+
                              | pairing_initiated |
                              +--------+----------+
                                       |
                         POST /pair/confirm (desktop)
                                       |
                                       v
                              +-------------------+
                              | pairing_confirmed |
                              +--------+----------+
                                       |
                            WS connect + register msg
                                       |
                                       v
                               +-------------+
                               | registering |
                               +------+------+
                                      |
                          Server sends 'registered'
                                      |
                                      v
                               +------------+
                               | registered |
                               +------+-----+
                                      |
                          Peer joins -> 'peer_ready'
                                      |
                                      v
                               +-----------+
                     +-------->| connected |<---------+
                     |         +-----+-----+          |
                     |               |                |
                reconnect       peer_left /       heartbeat
                 success       socket close        missed
                     |               |                |
                     |               v                |
                     |       +--------------+         |
                     +-------| reconnecting |<--------+
                             +------+-------+
                                    |
                              fails / expired
                                    |
                    +---------------+---------------+
                    v                               v
              +-----------+                  +---------+
              |   error   |                  | expired |
              +-----------+                  +---------+
                    |                              |
                    +------->+--------------+<-----+
                             | disconnected |
                             +--------------+
                                    |
                             user initiates
                              new pairing
                                    |
                                    v
                              +-----------+
                              |  unpaired |
                              +-----------+
```

---

## Transition Table

| From                | To                  | Trigger                                                                      | Guard                                                                       | Side Effects                                                                                       |
| ------------------- | ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `unpaired`          | `pairing_initiated` | Mobile calls `POST /pair/initiate`                                           | User authenticated (JWT)                                                    | Signaling server creates session; DB row inserted with status=`pending`; QR data returned          |
| `pairing_initiated` | `pairing_confirmed` | Desktop calls `POST /pair/confirm` with scanned code                         | Code exists and not expired; desktop belongs to user                        | DB updated to status=`confirmed`; both sides receive signaling URLs                                |
| `pairing_initiated` | `expired`           | TTL elapses (default 300s)                                                   | `session.expiresAt <= Date.now()`                                           | Signaling server cleanup interval deletes session; `session_expired` sent to any connected sockets |
| `pairing_initiated` | `disconnected`      | `DELETE /pair/cancel`                                                        | User authenticated, owns the code                                           | Signaling server session deleted; DB status=`cancelled`                                            |
| `pairing_confirmed` | `registering`       | Client opens WebSocket at `/ws` and sends `{ type: "register", code, role }` | Server not shutting down; IP not blacklisted; connection limit not exceeded | Connection tracked in ConnectionManager                                                            |
| `registering`       | `registered`        | Server validates code, session exists and not expired, role not taken        | `pairingCodeSchema` valid; session in DB or memory; role slot empty         | Server sends `{ type: "registered", expiresAt, peerConnected }`                                    |
| `registering`       | `error`             | Invalid code, expired session, role already taken, rate limited              | Various validation failures                                                 | Server sends `{ type: "error", error: "<code>" }` and closes socket                                |
| `registered`        | `connected`         | Peer registers with complementary role                                       | Both `desktop` and `mobile` slots filled                                    | Server sends `{ type: "peer_ready", role, metadata }` to both peers                                |
| `connected`         | `heartbeat_missed`  | No `pong` received within `CONNECTION_IDLE_TIMEOUT_MS` (300,000ms / 5min)    | `lastActivity + 300s < now`                                                 | ConnectionManager marks connection for cleanup                                                     |
| `connected`         | `disconnected`      | Peer sends `peer_left` or socket closes                                      | Socket close event fired                                                    | Peer notified via `{ type: "peer_left", role }`; WebRTC cleaned up; agents cleared                 |
| `connected`         | `expired`           | Session TTL elapses                                                          | `session.expiresAt <= Date.now()`                                           | Both sockets receive `session_expired` and are closed; session removed from memory                 |
| `connected`         | `reconnecting`      | Socket close detected by client while session not expired                    | `sessionExpiresAt > Date.now()`                                             | Client reconnects WebSocket and re-sends `register` with same code                                 |
| `heartbeat_missed`  | `disconnected`      | Idle connection cleanup fires                                                | Idle time > `CONNECTION_IDLE_TIMEOUT_MS`                                    | Server sends `{ type: "connection_timeout", reason: "idle" }`, closes with code 1000               |
| `heartbeat_missed`  | `connected`         | Client sends any message (activity updated)                                  | Connection still open                                                       | `lastActivity` timestamp refreshed                                                                 |
| `reconnecting`      | `registered`        | Re-register succeeds (session still alive, role slot available)              | Session not expired; role not taken by another socket                       | Normal registration flow resumes                                                                   |
| `reconnecting`      | `expired`           | Session expired during reconnection attempt                                  | `session.expiresAt <= Date.now()`                                           | Client receives `pairing_expired` error                                                            |
| `reconnecting`      | `error`             | Max reconnection attempts exceeded or server unavailable                     | Implementation-defined retry limit                                          | Client sets status to `error` with user-friendly message                                           |
| `error`             | `unpaired`          | User calls `clearError()` or `disconnect()`                                  | None                                                                        | State reset; all resources cleaned up                                                              |
| `expired`           | `unpaired`          | User initiates new pairing                                                   | None                                                                        | Fresh `POST /pair/initiate` call                                                                   |
| `disconnected`      | `unpaired`          | User initiates new pairing                                                   | None                                                                        | Previous state fully cleared                                                                       |

---

## Timeout Values

| Constant                               | Value              | Location                            | Purpose                                                               |
| -------------------------------------- | ------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `DEFAULT_PAIRING_TTL_SECONDS`          | 300s (5 min)       | `signaling-server/src/constants.ts` | Session expiry from creation (initial handshake)                      |
| `SESSION_LONG_TTL_MS`                  | 86,400,000ms (24h) | `signaling-server/src/constants.ts` | Extended TTL applied when both peers connect                          |
| `CONNECTION_IDLE_TIMEOUT_MS`           | 300,000ms (5 min)  | `signaling-server/src/constants.ts` | Idle WebSocket timeout before server-side cleanup                     |
| `STALE_SESSION_HEARTBEAT_THRESHOLD_MS` | 300,000ms (5 min)  | `signaling-server/src/constants.ts` | Session removed if no heartbeat and no participants for this duration |
| `SESSION_CLEANUP_INTERVAL_MS`          | 30,000ms (30s)     | `signaling-server/src/constants.ts` | How often server scans for expired/stale sessions                     |
| `STALE_CONNECTION_CHECK_INTERVAL_MS`   | 60,000ms (1 min)   | `signaling-server/src/constants.ts` | How often ConnectionManager checks for idle sockets                   |
| Heartbeat interval (mobile)            | 25,000ms (25s)     | `connectionStore.ts`                | Mobile sends heartbeat pings at this interval                         |
| Health check interval (companion)      | 30,000ms (30s)     | `companion.ts`                      | Mobile companion health check pings                                   |
| `PENDING_REHYDRATION_TTL_MS`           | 30,000ms (30s)     | `signaling-server/src/constants.ts` | Max wait for DB session rehydration                                   |
| `PENDING_APPROVAL_TTL_MS`              | 600,000ms (10 min) | `signaling-server/src/constants.ts` | Pending approvals expire after this duration                          |
| `MAX_PENDING_APPROVALS_PER_SESSION`    | 50                 | `signaling-server/src/constants.ts` | Max queued approvals per session while mobile is offline              |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS`         | 30,000ms (30s)     | `signaling-server/src/constants.ts` | Hard deadline for graceful server shutdown                            |
| `SHUTDOWN_DRAIN_TIMEOUT_MS`            | 5,000ms (5s)       | `signaling-server/src/constants.ts` | Drain period for in-flight operations during shutdown                 |

---

## Recovery Actions

| Failure State                    | Recovery Action                                                       | Client Behavior                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heartbeat_missed`               | Server closes idle connection after `CONNECTION_IDLE_TIMEOUT_MS`      | Client receives `connection_timeout` message; transitions to `reconnecting` if session not expired                                                                                                                                                                                  |
| `reconnecting` (session alive)   | Client opens new WebSocket, sends `register` with same code + role    | If role slot is empty (previous socket cleaned up), registration succeeds and `peer_ready` fires when peer reconnects. On mobile reconnect, server sends `sync_request` to desktop to push current agent state, and delivers any pending approvals queued while mobile was offline. |
| `reconnecting` (session expired) | Cannot recover; session is gone                                       | Client receives `pairing_expired`; user must scan new QR code                                                                                                                                                                                                                       |
| `error` (rate limited)           | Wait `retryAfter` seconds, then retry                                 | Client shows "Too many attempts" message with countdown                                                                                                                                                                                                                             |
| `error` (server unavailable)     | Exponential backoff retry                                             | Client shows "Unable to reach pairing server"                                                                                                                                                                                                                                       |
| `error` (IP blacklisted)         | Wait for blacklist expiry (`WS_BLACKLIST_DURATION_MS_DEFAULT` = 300s) | Client shows "Temporarily blocked" message                                                                                                                                                                                                                                          |
| `expired`                        | No recovery; generate new pairing code                                | User taps "Pair again" button                                                                                                                                                                                                                                                       |
| `disconnected` (peer left)       | If pairing code still persisted, can attempt reconnect                | Mobile stores `pairingCode` + `desktopName` via Zustand persist for quick re-pair                                                                                                                                                                                                   |
| `disconnected` (approval queued) | Desktop sends approval while mobile is offline                        | Server queues approval (max 50 per session, 10 min TTL). Delivered to mobile on reconnect via `signal` messages. Desktop receives `approval_queued` acknowledgment.                                                                                                                 |

---

## Error Codes

### Signaling Server WebSocket Errors

| Error Code                  | HTTP/WS | Meaning                                                                   | Client Action                                            |
| --------------------------- | ------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `pairing_not_found`         | WS      | Code does not exist in DB                                                 | Show "Invalid code" message; prompt re-scan              |
| `pairing_expired`           | WS      | Session TTL has elapsed                                                   | Show "Code expired" message; prompt new QR               |
| `role_already_connected`    | WS      | Another socket already holds this role in the session                     | Show "Device already connected" message                  |
| `registration_required`     | WS      | Non-register message sent before registering                              | Bug in client; send register first                       |
| `peer_not_connected`        | WS      | Signal sent but peer is not in session                                    | Queue signal or wait for `peer_ready`                    |
| `invalid_json`              | WS      | Malformed JSON received                                                   | Bug in client                                            |
| `message_too_large`         | WS      | Message exceeds `MAX_MESSAGE_SIZE_BYTES` (64KB)                           | Reduce payload size                                      |
| `invalid_signal_payload`    | WS      | SDP/ICE/control payload failed Zod validation                             | Bug in client                                            |
| `rate_limit_exceeded`       | WS      | Too many messages from this IP                                            | Back off; retry after `retryAfter` seconds               |
| `connection_limit_exceeded` | WS      | Too many connections from this IP (max 10)                                | Close unused connections                                 |
| `ip_blacklisted`            | WS      | IP has been blacklisted for repeated violations                           | Wait for blacklist expiry                                |
| `server_shutting_down`      | WS      | Server is in graceful shutdown                                            | Reconnect to a different instance                        |
| `server_overloaded`         | WS      | Too many pending session rehydrations                                     | Retry after brief delay                                  |
| `unsupported_message`       | WS      | Message type not recognized                                               | Update client to latest protocol                         |
| `approval_queued`           | WS      | Desktop sent approval while mobile was offline; queued for delivery       | Desktop can show "Approval sent (mobile offline)" status |
| `sync_request`              | WS      | Server asks desktop to push current agent state to mobile after reconnect | Desktop sends current agent state via control signal     |

### API Gateway HTTP Errors

| Error Code                          | HTTP Status | Meaning                                   | Client Action               |
| ----------------------------------- | ----------- | ----------------------------------------- | --------------------------- |
| `Unauthorized`                      | 401         | Missing or invalid JWT                    | Re-authenticate             |
| `Desktop not found`                 | 404         | Desktop ID not found or not owned by user | Verify desktop registration |
| `Pairing code not found or expired` | 404         | Code does not exist on signaling server   | Re-initiate pairing         |
| `Pairing code has expired`          | 410         | Code existed but TTL elapsed              | Re-initiate pairing         |
| `Signaling server unavailable`      | 503         | Cannot reach signaling server             | Retry with backoff          |
| `Failed to create pairing session`  | 502         | Signaling server returned error           | Retry                       |
| `Failed to verify pairing code`     | 502         | Signaling server lookup failed            | Retry                       |
| `RATE_LIMIT_EXCEEDED`               | 429         | Too many requests in window               | Wait `retryAfter` seconds   |
| `VALIDATION_ERROR`                  | 400         | Request body failed Zod schema validation | Fix request payload         |

### Mobile Client User-Friendly Messages

| Raw Error               | Display Message                                              |
| ----------------------- | ------------------------------------------------------------ |
| `connection_error`      | "Unable to reach the pairing server. Check your connection." |
| `connection_closed`     | "Connection to pairing server lost."                         |
| `invalid_code`          | "Invalid pairing code. Please try again."                    |
| `session_full`          | "This pairing session already has two devices connected."    |
| `rate_limited`          | "Too many attempts. Please wait a moment."                   |
| (session expired event) | "Pairing session expired. Please scan a new QR code."        |

---

## Protocol Sequence (Happy Path)

```
Mobile                    API Gateway               Signaling Server              Desktop
  |                           |                           |                          |
  |-- POST /pair/initiate --->|                           |                          |
  |                           |-- POST /pairings -------->|                          |
  |                           |<-- { code, qrData } -----|                          |
  |<-- { code, qrData } -----|                           |                          |
  |                           |                           |                          |
  |  [display QR code]        |                           |                          |
  |                           |                           |          [scan QR code]  |
  |                           |                           |                          |
  |                           |<------- POST /pair/confirm (code, desktopId) -------|
  |                           |-- GET /pairings/:code --->|                          |
  |                           |<-- { code, expiresAt } ---|                          |
  |                           |<-- 200 { status: confirmed } ----------------------|
  |                           |                           |                          |
  |-- WS connect + register(code, "mobile") ------------>|                          |
  |<-- { type: "registered", peerConnected: false } -----|                          |
  |                           |                           |                          |
  |                           |           WS connect + register(code, "desktop") ---|
  |                           |                           |<-- register ------------|
  |                           |                           |-- registered ---------->|
  |<-- { type: "peer_ready", role: "desktop" } ----------|                          |
  |                           |   { type: "peer_ready", role: "mobile" } ---------->|
  |                           |                           |                          |
  |<======================== WebRTC SDP + ICE exchange =========================>  |
  |<======================== Data Channel established =========================>   |
  |                           |                           |                          |
  |-- control: ping --------->|                           |--- control: pong ------>|
  |<-- control: agents_update |                           |                          |
```

---

## Reconnection Protocol

1. Client detects socket close (event `close` or `error`).
2. Check if `sessionExpiresAt > Date.now()`.
   - **Yes**: Transition to `reconnecting`. Open new WebSocket, send `register` with same code + role.
   - **No**: Transition to `expired`. User must initiate new pairing.
3. On successful re-registration, server sends `registered` with `peerConnected` indicating if peer is still connected.
4. If peer is still connected, `peer_ready` is exchanged and WebRTC renegotiation begins.
5. If peer also disconnected, client waits in `registered` state for peer to reconnect.
6. Mobile persists `pairingCode` and `desktopName` via Zustand `persist` middleware (MMKV storage) to enable automatic reconnection on app restart.

### Session TTL Extension (Wave 3)

When both peers successfully connect (both `desktop` and `mobile` slots filled), the session TTL is automatically extended to `SESSION_LONG_TTL_MS` (24 hours). This prevents the short initial pairing TTL (5 min) from expiring an active session.

### Approval Delivery Resilience (Wave 3)

When the desktop sends a control signal with `action: "approval_request"` while the mobile peer is disconnected:

1. Server queues the approval in memory (max `MAX_PENDING_APPROVALS_PER_SESSION` = 50 per session).
2. Server responds to desktop with `{ type: "approval_queued" }`.
3. Pending approvals expire after `PENDING_APPROVAL_TTL_MS` (10 minutes).
4. When mobile reconnects, all valid pending approvals are delivered as `signal` messages.
5. Server also sends `{ type: "sync_request", reason: "mobile_reconnected" }` to desktop, prompting it to push the current agent state.

### Stale Session Cleanup (Wave 3)

The cleanup interval now also removes stale sessions: sessions with no connected participants AND no heartbeat for longer than `STALE_SESSION_HEARTBEAT_THRESHOLD_MS` (5 minutes) are removed. This prevents orphaned sessions from accumulating in memory after both peers silently disconnect.

---

## Security Considerations

- All API Gateway pairing endpoints require JWT authentication.
- Pairing codes are 8-character cryptographically random base64url strings (`randomBytes(6).toString('base64url').substring(0, 8).toUpperCase()`).
- Signaling server validates code format with `PAIRING_CODE_PATTERN = /^[A-Z0-9]{8}$/` before any DB lookup.
- Rate limits: 10/min for pairing creation/confirmation, 60/min for status polling, 100/min for WebSocket messages per IP.
- IP blacklisting after 5 rate limit violations within a window (`WS_BLACKLIST_THRESHOLD_DEFAULT`).
- WebSocket message size limit: 64KB. SDP size limit: 100KB. Metadata size limit: 4KB with max 20 keys.
- Per-IP connection limit: 10 concurrent WebSocket connections.

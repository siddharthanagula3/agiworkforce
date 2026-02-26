# Section 5 — Services and Browser Extension

> PRD: AGI Workforce
> Last updated: 2026-02-26

---

## 5.1 Overview

AGI Workforce's backend services layer consists of three independently deployable components:

1. **API Gateway** (`services/api-gateway/`) — Express.js service that provides REST + WebSocket APIs for desktop client authentication, device management, cross-device sync, mobile pairing, and credit accounting.
2. **Signaling Server** (`services/signaling-server/`) — Lightweight WebRTC signaling service that brokers peer-to-peer connections between the desktop app and mobile companion app via pairing codes.
3. **Browser Extension** (`apps/extension/`) — Manifest V3 Chromium extension that gives the AI agent the ability to observe and interact with any web page the user has open, bridging the browser into the desktop agent's tool surface.

All three services are designed for independent deployment and horizontal scaling. They share the Supabase PostgreSQL instance as the system of record.

---

## 5.2 API Gateway

### 5.2.1 Stack and Configuration

| Attribute | Value |
|---|---|
| Runtime | Node.js, Express.js, TypeScript |
| Port | 3000 |
| Auth | JWT (HS256, 7-day expiry) |
| Password hashing | bcrypt |
| Database | Supabase (PostgreSQL) |
| Security middleware | Helmet.js |
| Logging | Pino |
| WebSocket | `ws` library |
| Rate limiting | `express-rate-limit` (in-memory; Redis migration documented as TODO for multi-instance) |

**Startup Validation:** The gateway refuses to start if any of the following environment variables are absent: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. A missing value causes a fatal log entry and `process.exit(1)`.

**FR-S01: Environment Guard** — The API Gateway must validate all required environment variables at startup and exit immediately with a descriptive error if any are missing. Partial initialisation must never occur.

### 5.2.2 JWT Token Specification

| Claim | Value |
|---|---|
| `userId` | Supabase user UUID |
| `email` | User email |
| `iss` | `agiworkforce-api-gateway` |
| `aud` | `agiworkforce` |
| Algorithm | HS256 |
| Expiry | 7 days |

**FR-S02: JWT Issuer and Audience Validation** — The auth middleware must validate both `iss` and `aud` claims on every token. Tokens with mismatched claims must be rejected with HTTP 401.

### 5.2.3 Authentication Routes (`/api/auth/`)

| Method | Path | Rate Limit | Auth Required | Purpose |
|---|---|---|---|---|
| POST | `/api/auth/register` | 5 requests / 15 min per IP | None | Register new user: hash password with bcrypt, insert into Supabase, return signed JWT |
| POST | `/api/auth/login` | 5 requests / 15 min per IP | None | Login: constant-time compare, return signed JWT |
| GET | `/api/auth/verify` | — | JWT | Verify token validity; returns `{ userId, email }` |

**FR-S03: Timing Attack Prevention** — The `/api/auth/login` endpoint must perform a bcrypt comparison even when the user does not exist (using a pre-computed dummy hash) so that the response time is not measurably different for existing vs. non-existing users.

**FR-S04: Registration Uniqueness** — If the submitted email already exists in Supabase, the registration endpoint must return HTTP 409 with a generic message. The response must not confirm whether the email address exists in the system to prevent enumeration.

### 5.2.4 Desktop Device Routes (`/api/desktop/`)

All desktop routes require a valid JWT. Device ownership is enforced by matching `userId` from the JWT against the `user_id` column on every query.

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/desktop/register` | 10/min per user | Register a new desktop device: accepts `name`, `platform`, `version`; returns `deviceId` |
| GET | `/api/desktop/` | — | List all registered devices for the authenticated user |
| GET | `/api/desktop/:desktopId/status` | 60/min per user | Return device status; online if `last_seen_at` is within the past 60 seconds |
| POST | `/api/desktop/:desktopId/command` | 30/min per user | Send a command to a device; queued if device is offline |
| POST | `/api/desktop/:desktopId/heartbeat` | 600/min per device | Update `last_seen_at` to current timestamp |
| DELETE | `/api/desktop/:desktopId` | — | Unregister and delete a device record |

**FR-S05: Online Status Detection** — A device is considered `online` if and only if `last_seen_at > NOW() - INTERVAL '60 seconds'`. The status endpoint must return this boolean as the `online` field, not raw timestamp data.

**FR-S06: Offline Command Queuing** — If the target device is offline, the command must be persisted in the command queue with a maximum queue depth of 100 commands per device and a TTL of 5 minutes. When the device reconnects over WebSocket, all queued commands must be flushed in order.

**FR-S07: Device Ownership Enforcement** — Every request to `/api/desktop/:desktopId/*` must verify that the `desktopId` belongs to the JWT's `userId`. A mismatch must return HTTP 403, not HTTP 404, to avoid leaking device existence.

### 5.2.5 Sync Routes (`/api/sync/`)

All sync routes require a valid JWT. Conflict resolution uses last-write-wins semantics based on the `updated_at` timestamp of each item.

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/sync/batch` | 30/min per user | Batch sync: accepts up to 100 items in a single request; returns per-item success/failure |
| GET | `/api/sync/updates` | — | Pull all updates for the user since a provided `since` ISO-8601 timestamp |
| POST | `/api/sync/resolve-conflict` | — | Insert a conflict resolution record (winning version + loser reference) |
| GET | `/api/sync/status` | — | Return sync status: `{ pending_count, last_sync_at }` |
| POST | `/api/sync/devices/register` | — | Upsert a device's sync registration (capabilities, sync schema version) |
| DELETE | `/api/sync/devices/:deviceId` | — | Delete all sync data for a specific device |

**FR-S08: Batch Limit** — The batch sync endpoint must reject payloads containing more than 100 items with HTTP 422 and a descriptive error. Processing must be atomic per item (partial failures are acceptable; the response body indicates per-item status).

**FR-S09: Last-Write-Wins** — When two devices submit conflicting updates for the same item, the item with the later `updated_at` wins. The losing version must be stored in the conflicts table via `/api/sync/resolve-conflict` for audit purposes.

### 5.2.6 Mobile Routes (`/api/mobile/`)

All mobile routes require a valid JWT.

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/mobile/register` | 10/min per user | Register or update a mobile device record (upsert by device fingerprint) |
| POST | `/api/mobile/push-token` | — | Update the push notification token for a registered mobile device |
| POST | `/api/mobile/pairing-code` | 10/min per user | Create a WebRTC pairing code; returns 8-char code and QR payload |
| GET | `/api/mobile/` | — | List all registered mobile devices for the authenticated user |
| DELETE | `/api/mobile/:deviceId` | — | Delete a mobile device record and associated push token |

**FR-S10: Pairing Code Generation** — Pairing codes are generated by the Signaling Server (see §5.3) and stored with a 300s TTL. The `/api/mobile/pairing-code` endpoint proxies the creation request to the Signaling Server and returns the code and QR URI to the client. The QR payload format is `agiw:{CODE}`.

### 5.2.7 Credits Routes (`/api/credits/`)

All credits routes require a valid JWT. Credit state is the authoritative record in Supabase; the gateway is a thin proxy over Supabase RPCs.

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/credits/balance` | 10/min per user | Return current credit balance: `{ monthly_remaining, daily_remaining, topup_balance }` |
| POST | `/api/credits/check` | — | Check if `amount` credits are available; returns `{ available: boolean }` |
| POST | `/api/credits/deduct` | 5/min per user | Deduct credits; requires `idempotency_key`; returns HTTP 402 on insufficient balance |

**FR-S11: Credit Deduction Idempotency** — The deduct endpoint must accept an `idempotency_key` string. If a deduction with the same key has already been processed successfully, the endpoint must return HTTP 200 with the cached result without re-deducting. Keys expire after 24 hours.

**FR-S12: Insufficient Credits Response** — When credits are insufficient, the response must be HTTP 402 with body `{ error: "insufficient_credits", balance: { monthly_remaining, daily_remaining, topup_balance }, required: <amount> }`.

### 5.2.8 Health Endpoint

| Method | Path | Rate Limit | Auth | Purpose |
|---|---|---|---|---|
| GET | `/health` | 100/min per IP | None | Return service health: DB connectivity, uptime, version |

### 5.2.9 WebSocket Server

The WebSocket server runs at `ws://{host}/ws` on the same port as the HTTP server.

**Connection Lifecycle:**

1. Client opens WebSocket connection.
2. Client must send an `auth` message within **30 seconds** or the server closes the connection with code `4001` ("Authentication timeout").
3. On successful auth, the server registers the connection under `userId` + `deviceId`.
4. The connection is ready to send and receive typed messages.

**Auth Message Schema:**

```json
{
  "type": "auth",
  "token": "<JWT>",
  "deviceId": "<UUID>"
}
```

**Message Types:**

| Type | Direction | Purpose |
|---|---|---|
| `auth` | Client → Server | Authenticate the connection (must be first message) |
| `ping` | Client → Server | Keepalive probe |
| `pong` | Server → Client | Response to `ping` |
| `command` | Client → Server | Send a command to a target device by `deviceId` |
| `command` | Server → Client | Deliver a command to the target device (or queue if offline) |
| `sync` | Client → Server | Broadcast a sync event to all of the user's connected devices |
| `sync` | Server → Client | Deliver a sync event (sent to all devices except the sender) |

**Keepalive:** The server sends a `ping` every 30 seconds. If the client does not respond with `pong` within 10 seconds, the connection is terminated.

**Command Delivery:**
- If target device is online (active WebSocket): immediate delivery.
- If target device is offline: command is persisted in the queue (max 100 per device, 5-min TTL).
- On reconnect: server flushes the queue in FIFO order before resuming real-time delivery.

**FR-S13: Auth Timeout** — The WebSocket server must close unauthenticated connections with code `4001` after 30 seconds. This prevents resource exhaustion from idle connections.

**FR-S14: WebSocket Ownership** — A device may only receive commands addressed to its own `deviceId`. The server must not forward a command to a device belonging to a different `userId`.

### 5.2.10 Authentication Middleware

The `authenticate` middleware used by all protected routes:

1. Extracts the JWT from the `Authorization: Bearer <token>` header.
2. Verifies signature with `JWT_SECRET` (HS256).
3. Validates `iss === 'agiworkforce-api-gateway'` and `aud === 'agiworkforce'`.
4. Checks expiry.
5. Performs a **kill switch** check: queries `profiles.account_status` for the `userId`.
   - Result is cached per `userId` for 60 seconds to reduce database load.
   - If `account_status = 'suspended'` → HTTP 403.
   - If `account_status = 'banned'` → HTTP 403.
   - If Supabase returns an error → **fail closed**: HTTP 503 (the request is rejected, not allowed through).
6. Attaches `{ userId, email }` to `req.user`.

**FR-S15: Kill Switch Fail-Closed** — On any Supabase database error during the kill switch check, the middleware must return HTTP 503 and must NOT allow the request to proceed. Availability is sacrificed in favour of security correctness.

**FR-S16: Constant-Time Password Comparison** — Login must use `bcrypt.compare()` and must always run the comparison (using a dummy hash if the user does not exist) so that response time cannot be used to infer account existence.

### 5.2.11 Rate Limiting Notes

Rate limiting is currently implemented with `express-rate-limit` using in-memory storage. This works correctly for single-instance deployment.

**FR-S17: Multi-Instance Rate Limiting** — Before horizontal scaling the API Gateway to more than one instance, the rate limiter store must be migrated to a Redis backend (Upstash or equivalent). This is a documented prerequisite for scaling.

---

## 5.3 Signaling Server

### 5.3.1 Stack and Configuration

| Attribute | Value |
|---|---|
| Runtime | Node.js, Express.js + `ws` |
| Database | Supabase (session persistence) |
| Metrics | Prometheus (`prom-client`) |
| Deploy targets | Fly.io or Railway |
| Max concurrent sessions | 1,000 (rehydrated from Supabase on startup) |

### 5.3.2 Pairing Code Specification

| Property | Value |
|---|---|
| Format | 8-character uppercase alphanumeric |
| Generation | `crypto.randomBytes(6)` → base64url → slice(0,8) → toUpperCase |
| QR payload | `agiw:{CODE}` |
| Default TTL | 300 seconds |
| Maximum TTL | 900 seconds |
| Session cleanup interval | Every 30 seconds |

### 5.3.3 HTTP Endpoints

| Method | Path | Rate Limit | Auth | Purpose |
|---|---|---|---|---|
| POST | `/pairings` | 10/min per IP | None | Create a new pairing session; returns `{ code, qr_data, expires_at }` |
| GET | `/pairings/:code` | 60/min per IP | None | Look up an existing pairing by code; returns session metadata |
| DELETE | `/pairings/:code` | 10/min per IP | None | Delete a pairing session before TTL expiry |
| GET | `/health` | — | None | Full health check including Supabase DB connectivity |
| GET | `/ready` | — | None | Kubernetes/Fly.io readiness probe (returns 200 when server is ready) |
| GET | `/live` | — | None | Kubernetes/Fly.io liveness probe (returns 200 always) |
| GET | `/metrics` | — | Admin token | Prometheus metrics export |
| GET | `/admin/status` | — | Admin token | Server status: active sessions, connected clients, uptime |
| POST | `/admin/blacklist` | — | Admin token | Add an IP address to the connection blacklist |

**FR-S18: Code Uniqueness** — When creating a pairing, the server must verify the generated code does not collide with any active session. If a collision occurs, the server must retry up to 5 times before returning HTTP 503.

**FR-S19: Session Rehydration** — On startup, the server must load all non-expired sessions from Supabase into memory. Sessions already expired must be discarded. This allows the signaling server to restart without disrupting active pairings.

### 5.3.4 WebSocket Protocol

The signaling server WebSocket runs at `ws://{host}/ws`.

**Session Join Flow:**

1. Client (desktop or mobile) opens a WebSocket connection.
2. Client sends a `register` message with `{ code, role, metadata }`.
   - `role` must be `'desktop'` or `'mobile'`.
3. Server validates the code, checks TTL, and sends a `registered` event.
4. When the second peer connects, server sends `peer_ready` to both peers.
5. Peers exchange WebRTC signaling messages.
6. Either peer may send a `terminate` control message to end the session.

**Signal Message Types (Zod-validated):**

| Type | Description | Max Size |
|---|---|---|
| `offer` | WebRTC SDP offer | 100KB |
| `answer` | WebRTC SDP answer | 100KB |
| `ice` | ICE candidate | 64KB |
| `control` | Session control (`terminate`, `ping`) | 1KB |

**Server-to-Client Events:**

| Event | Trigger | Payload |
|---|---|---|
| `registered` | Successful `register` | `{ code, role, session_id }` |
| `peer_ready` | Both peers connected | `{ peer_role, peer_metadata }` |
| `peer_left` | Peer disconnected | `{ role }` |
| `session_expired` | TTL elapsed | `{ code }` |
| `terminated` | Control `terminate` received | `{}` |
| `error` | Protocol violation | `{ message }` |
| `heartbeat_ack` | In response to client `heartbeat` | `{ timestamp }` |

**FR-S20: SDP Size Enforcement** — The server must reject any SDP offer or answer exceeding 100KB with a `4008` close code ("Payload too large"). ICE candidates are capped at 64KB. All other messages are capped at 1KB.

**FR-S21: Session Isolation** — Messages received from one peer must only be forwarded to the peer sharing the same pairing code session. Cross-session message leakage is a critical security defect.

### 5.3.5 Security

**FR-S22: Per-IP Connection Limits** — The signaling server must enforce a maximum number of concurrent WebSocket connections per IP address to prevent resource exhaustion.

**FR-S23: Message Rate Limiting** — Each WebSocket connection is subject to per-connection message rate limiting. Connections exceeding the limit are closed with code `4009` ("Rate limit exceeded").

**FR-S24: IP Blacklisting** — The `/admin/blacklist` endpoint allows operators to block abusive IP addresses. Blacklisted IPs must be rejected at connection time with code `4003` ("Forbidden").

**FR-S25: Expired Session Cleanup** — The server must run a cleanup job every 30 seconds that removes expired sessions from memory and marks them as expired in Supabase. WebSocket connections belonging to expired sessions must be closed with the `session_expired` event.

---

## 5.4 Browser Extension

### 5.4.1 Manifest and Identity

| Property | Value |
|---|---|
| Manifest version | V3 |
| Extension version | 1.1.0 |
| Native messaging host | `com.agiworkforce.browser` |
| Target browsers | Chromium-based (Chrome, Edge, Brave) |

**Declared Permissions:**

| Permission | Justification |
|---|---|
| `activeTab` | Inspect and interact with the currently active tab |
| `tabs` | Query tab metadata for context capture |
| `storage` | Persist extension settings and state |
| `nativeMessaging` | Connect to the Tauri desktop app via native messaging |
| `alarms` | Keep-alive alarm for the service worker |
| `contextMenus` | Right-click context menu actions |
| `sidePanel` | Display the AGI sidebar within the browser |

**Optional Permissions (user-granted):**

| Permission | Use Case |
|---|---|
| `downloads` | Save captured content to disk |
| `bookmarks` | Bookmark management by AI agent |
| `history` | Browser history context for AI |

**Host Permissions:** `<all_urls>` — required for content script injection on any page.

**Keyboard Shortcuts:**

| Shortcut | Action |
|---|---|
| `Cmd+Shift+A` / `Ctrl+Shift+A` | Open extension popup |
| `Cmd+Shift+C` / `Ctrl+Shift+C` | Capture current page |

### 5.4.2 Content Script Capabilities

The content script is injected into every page at `document_idle`. It receives commands from the background service worker and executes them in the page context, returning structured results.

#### Navigation and Query Commands

| Command | Description | Returns |
|---|---|---|
| `GET_TEXT` | Extract text content of a CSS selector | `{ text: string }` |
| `GET_ATTRIBUTE` | Get a named attribute of an element | `{ value: string | null }` |
| `GET_PAGE_INFO` | Full page metadata snapshot | `{ url, title, meta, scrollPosition, viewportSize }` |
| `GET_FORMS` | Extract all forms and their fields | `{ forms: FormDescriptor[] }` |
| `WAIT_FOR_SELECTOR` | Wait until a CSS selector is present in the DOM | `{ found: boolean }` — 30s max timeout |

#### Interaction Commands

| Command | Description | Notes |
|---|---|---|
| `CLICK` | Single click on a CSS selector target | Dispatches `MouseEvent` |
| `DOUBLE_CLICK` | Double click on a CSS selector target | Dispatches two `MouseEvent`s |
| `RIGHT_CLICK` | Right click (context menu trigger) | Dispatches `contextmenu` event |
| `TYPE` | Clear an input field and type text | Dispatches `input` + `change` events after each character |
| `FILL_FORM` | Set multiple form fields by selector map | Dispatches events per field |
| `SUBMIT_FORM` | Submit a form by selector | Calls `form.submit()` or clicks the submit button |
| `SET_ATTRIBUTE` | Set an attribute on an element | Restricted to allowlist (see §5.4.4) |

#### Scripting Command (Sandboxed)

**`EXECUTE_SCRIPT`** — Executes a named DOM operation from a strict allowlist. No arbitrary JavaScript. Dynamic code evaluation via `eval` or `Function` constructors is explicitly prohibited.

Allowed operations:

| Operation | Description |
|---|---|
| `scrollTo` | Scroll to absolute x/y coordinates |
| `scrollBy` | Scroll by relative x/y delta |
| `scrollIntoView` | Scroll a selector into the viewport |
| `getScrollPosition` | Return `{ x, y }` of current scroll position |
| `getViewportSize` | Return `{ width, height }` of the browser viewport |
| `getComputedStyle` | Return computed CSS property for a selector |
| `getBoundingRect` | Return `DOMRect` for a selector |
| `focusElement` | Call `.focus()` on a selector |
| `blurElement` | Call `.blur()` on a selector |

**FR-S26: EXECUTE_SCRIPT Allowlist** — The `EXECUTE_SCRIPT` command must reject any operation name not in the explicit allowlist with an error. The error message must name the rejected operation. Dynamic code evaluation (via `eval` or equivalent constructs) is categorically prohibited and must never be introduced.

#### Compound Commands

| Command | Description |
|---|---|
| `RUN_PAGE_ACTIONS` | Execute a sequence of commands with configurable delays between steps |
| `AUTO_FILL_JOB_APPLICATION` | Platform-aware job application autofill (see §5.4.3) |
| `CAPTURE_ELEMENT` | Screenshot a specific DOM element via canvas |
| `GET_ELEMENT_INFO` | Return full descriptor: tag, id, class, text, attributes, bounding rect |

### 5.4.3 Job Application Autofill System

**FR-S27: Platform Detection** — The autofill system must detect the current platform from the page URL and apply platform-specific field selectors. Supported platforms: Greenhouse (`boards.greenhouse.io`), Workday (`*.myworkdayjobs.com`), Generic (CSS heuristic fallback).

**Autofill Profile Schema:**

| Field | Type | Notes |
|---|---|---|
| `firstName` | string | |
| `lastName` | string | |
| `email` | string | |
| `phone` | string | |
| `location` | string | City, state, country |
| `linkedIn` | string | Full URL |
| `github` | string | Full URL |
| `portfolio` | string | Full URL |
| `currentCompany` | string | |
| `yearsOfExperience` | number | |
| `workAuthorization` | string | E.g., "US Citizen", "Requires Sponsorship" |
| `salary` | string | Expected salary range |
| `resumeText` | string | Plain text resume content |
| `coverLetterText` | string | Plain text cover letter |
| `files` | `{ name: string, data: string }[]` | Base64 data URLs for file uploads |

**Autofill Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `platform` | string | auto-detected | Override platform detection |
| `autoSubmit` | boolean | `false` | Automatically click submit after filling |
| `maxSubmitSteps` | number | 3 | Maximum pages/steps to advance through |

**FR-S28: AutoSubmit Guard** — When `autoSubmit` is `true`, the system must pause and request explicit user confirmation before submitting the final form if `maxSubmitSteps` has been reached. It must never submit more pages than `maxSubmitSteps` without confirmation.

### 5.4.4 Security Constraints

**FR-S29: SET_ATTRIBUTE Allowlist** — The `SET_ATTRIBUTE` command must maintain an explicit allowlist of safe attributes. The following attribute patterns must be blocked regardless of the target element:

- Any attribute beginning with `on` (event handlers: `onclick`, `onerror`, `onload`, etc.)
- `href` on `<script>` elements
- `src` on `<script>` elements
- `action` on `<form>` elements
- `formaction` on any element

Any attempt to set a blocked attribute must return an error without modifying the DOM.

**FR-S30: No Dynamic Code Execution** — The content script must never use dynamic code evaluation mechanisms (`eval`, `setTimeout` with a string argument, `setInterval` with a string argument, or dynamic function construction). All executable logic must be statically defined at load time.

**FR-S31: Closed Shadow DOM for FAB** — The floating action button (FAB) injected into pages must be attached using `attachShadow({ mode: 'closed' })`. The closed mode prevents page JavaScript from accessing or modifying the FAB's internal DOM.

**FR-S32: No Inline Scripts** — The extension must not inject any inline scripts into pages. All extension scripts must be declared in the manifest and loaded from the extension package.

### 5.4.5 Background Service Worker

The background service worker manages the native messaging connection to the Tauri desktop app and coordinates all content script operations.

**Native Messaging:**

- Host: `com.agiworkforce.browser`
- Protocol: Chrome native messaging (length-prefixed JSON)
- Connection: persistent; one connection per browser session

**Auto-Reconnect Policy:**

| Attempt | Delay |
|---|---|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6 | 30s |
| 7 | 30s |
| 8 | 30s |

Reconnection stops permanently on terminal errors: `host_not_found`, `access_denied`. All other errors trigger the backoff sequence.

**FR-S33: Reconnect Ceiling** — Exponential backoff must cap at 30 seconds. After 8 failed attempts, the extension must stop reconnecting and surface a user-visible error in the popup indicating the desktop app is not running.

**Rate Limiter:**

| Property | Value |
|---|---|
| Window | 500ms |
| Max requests | 120 per window |

All messages sent to the content script or native host pass through this rate limiter. Excess messages are queued, not dropped, unless the queue exceeds 1,000 pending items.

**Keep-Alive Alarm:** A Chrome `alarms` alarm fires every 60 seconds to prevent the service worker from being terminated by the browser. The alarm handler sends a no-op ping to maintain the native messaging connection.

**Context Sync Deduplication:**

The service worker syncs page context (URL, title, selected text) to the desktop app when the user changes tabs or makes a selection. Deduplication prevents excessive syncs:

- **Cooldown:** 5 seconds between syncs.
- **Fingerprint:** `hash(url + title + selection)`. Identical fingerprints within the cooldown window are discarded.

**FR-S34: Context Sync Throttle** — The context sync mechanism must not send more than one sync event per 5-second window for identical content. This prevents chat context pollution when the user holds a selection on a static page.

### 5.4.6 UI Injection

**Floating Action Button (FAB):**

- Injected via closed shadow DOM (see FR-S31).
- Displays a connection status dot: green (connected to desktop), amber (connecting/reconnecting), red (desktop not found).
- Click opens the side panel or the extension popup.

**Context Menu Items:**

The extension registers three context menu items that appear on right-click:

| Menu Item | Trigger Condition | Action |
|---|---|---|
| "Capture Element" | Right-click on any element | Runs `CAPTURE_ELEMENT` on the target, sends screenshot to desktop agent |
| "Get Element Info" | Right-click on any element | Runs `GET_ELEMENT_INFO`, sends descriptor to desktop agent |
| "Ask AGI Workforce" | Text is selected | Sends selected text as a new chat message to the desktop app |

---

## 5.5 Cross-Service Communication

### 5.5.1 Desktop to API Gateway

The Tauri desktop app connects to the API Gateway over HTTPS (REST) and WSS (WebSocket). The desktop authenticates using the JWT obtained during device registration (§5.2.3). The WebSocket connection carries real-time commands and sync events.

### 5.5.2 Desktop to Mobile (WebRTC via Signaling Server)

1. Desktop calls `/api/mobile/pairing-code` on the API Gateway.
2. API Gateway proxies to the Signaling Server's `POST /pairings`.
3. Signaling Server returns code + QR payload.
4. User scans QR code with mobile companion app.
5. Both apps connect to the Signaling Server WebSocket and identify by code.
6. Signaling Server brokers SDP offer/answer + ICE candidates.
7. WebRTC P2P connection is established; Signaling Server is no longer in the data path.

### 5.5.3 Browser Extension to Desktop

Communication is over Chrome Native Messaging (`com.agiworkforce.browser`). The Tauri app registers as the native messaging host. The extension service worker maintains a persistent connection and forwards page commands and context syncs bidirectionally.

---

## 5.6 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-S01 | API Gateway REST endpoints must respond within 200ms at P95 (excluding Supabase RPC latency) |
| NFR-S02 | The WebSocket server must support at least 10,000 concurrent connections per instance |
| NFR-S03 | The Signaling Server must handle at least 1,000 concurrent pairing sessions |
| NFR-S04 | Native messaging round-trip (extension to desktop to extension) must complete within 100ms for DOM queries |
| NFR-S05 | The API Gateway kill switch cache must reduce Supabase auth queries by at least 90% under sustained load |
| NFR-S06 | All service endpoints must emit structured JSON logs compatible with Pino's output format |
| NFR-S07 | The Signaling Server must export Prometheus metrics consumable by a standard Grafana dashboard |
| NFR-S08 | Browser extension content scripts must not increase page load time by more than 50ms (measured as Time to Interactive delta) |
| NFR-S09 | The API Gateway must gracefully drain connections on SIGTERM within 10 seconds |
| NFR-S10 | All services must pass Helmet.js default security checks with no exceptions disabled |

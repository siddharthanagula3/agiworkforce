# WebSocket Protocol

Complete WebSocket protocol documentation for AGI Workforce real-time communication.

## Table of Contents

- [Overview](#overview)
- [API Gateway WebSocket](#api-gateway-websocket)
  - [Connection](#connection)
  - [Authentication](#authentication)
  - [Message Types](#message-types)
  - [Command Delivery](#command-delivery)
- [Signaling Server WebSocket](#signaling-server-websocket)
  - [Device Pairing Flow](#device-pairing-flow)
  - [Registration](#registration)
  - [WebRTC Signaling](#webrtc-signaling)
  - [Message Types](#signaling-message-types)
- [Error Handling](#error-handling)
- [Security](#security)

---

## Overview

AGI Workforce uses two WebSocket services for real-time communication:

1. **API Gateway WebSocket** (`ws://localhost:3000/ws`): For desktop-to-server command delivery and synchronization
2. **Signaling Server WebSocket** (`ws://localhost:4000/ws`): For WebRTC peer-to-peer device pairing (desktop-mobile)

---

## API Gateway WebSocket

The API Gateway WebSocket enables real-time command delivery from mobile/web to desktop clients.

### Connection

**Endpoint:** `ws://localhost:3000/ws` (development) or `wss://api.agiworkforce.com/ws` (production)

**Protocol:** RFC 6455 WebSocket

**Message Format:** JSON

**Max Message Size:** 64KB (65,536 bytes)

**Authentication Timeout:** 30 seconds (connection closed if not authenticated)

### Connection Flow

```
1. Client connects to WebSocket endpoint
2. Client sends auth message with JWT token
3. Server validates token and stores authenticated connection
4. Server sends auth_success message
5. Client can send/receive messages
```

### Authentication

All WebSocket connections must authenticate within 30 seconds or be closed.

#### Auth Message (Client → Server)

```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Fields:**

- `type`: Always `"auth"`
- `token`: JWT authentication token (same format as REST API)
- `deviceId`: Optional UUID identifying the device (required for command routing)

#### Auth Success Response (Server → Client)

```json
{
  "type": "auth_success",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Auth Error Response (Server → Client)

```json
{
  "type": "auth_error",
  "error": "Invalid token"
}
```

**Error Reasons:**

- `"Invalid token"`: JWT verification failed
- `"Invalid token payload"`: Token payload doesn't match expected schema
- `"Authentication timeout. Please authenticate within 30 seconds."`: Didn't auth in time

**Connection closes automatically after auth error.**

---

### Message Types

#### Ping/Pong (Keep-Alive)

Desktop clients should send periodic pings to maintain connection.

**Ping (Client → Server):**

```json
{
  "type": "ping"
}
```

**Pong Response (Server → Client):**

```json
{
  "type": "pong",
  "timestamp": 1609459200000
}
```

**Heartbeat Interval:**

- Server sends WebSocket ping frames every 30 seconds
- Client responds with pong frames
- Connection terminated if client doesn't respond

---

#### Command Message (Client → Server)

Send commands to other devices owned by the same user.

```json
{
  "type": "command",
  "payload": {
    "action": "execute_workflow",
    "workflowId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Broadcast Behavior:**

- Sent to all connected devices for the same user (except sender)
- Includes `from` field with sender's device ID

**Received Command (Server → Client):**

```json
{
  "type": "command",
  "payload": {
    "action": "execute_workflow",
    "workflowId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "from": "sender-device-uuid"
}
```

---

#### Sync Message (Client → Server)

Broadcast synchronization data to other devices.

```json
{
  "type": "sync",
  "payload": {
    "entity": "conversation",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "action": "update",
    "data": {
      "title": "Updated Title"
    }
  }
}
```

**Broadcast Behavior:**

- Sent to all connected devices for the same user (except sender)
- Includes `from` field with sender's device ID

**Received Sync (Server → Client):**

```json
{
  "type": "sync",
  "payload": {
    "entity": "conversation",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "action": "update",
    "data": {
      "title": "Updated Title"
    }
  },
  "from": "sender-device-uuid"
}
```

---

### Command Delivery

Desktop clients receive commands through WebSocket connections.

#### Command from API (Server → Desktop)

When a mobile/web client sends a command via REST API (`POST /api/desktop/:desktopId/command`), the server delivers it via WebSocket:

```json
{
  "type": "command",
  "commandId": "550e8400-e29b-41d4-a716-446655440000",
  "commandType": "chat",
  "payload": {
    "message": "Hello, AI!",
    "conversationId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "timestamp": 1609459200000
}
```

**Fields:**

- `type`: Always `"command"`
- `commandId`: Unique UUID for this command
- `commandType`: Type of command (`chat`, `automation`, `query`)
- `payload`: Command-specific data
- `timestamp`: Unix timestamp in milliseconds

#### Offline Command Queueing

If desktop is offline when command is sent:

- Command queued in memory (max 100 per device)
- 5-minute TTL (time-to-live)
- Automatically delivered when desktop reconnects
- Oldest commands dropped if queue exceeds 100

#### Pending Command Flush

When desktop reconnects, server automatically flushes all queued commands:

```
1. Desktop connects and authenticates
2. Server checks for pending commands for this device
3. Server sends all pending commands in order
4. Queue cleared for this device
```

---

### Error Messages

Generic error response format:

```json
{
  "type": "error",
  "error": "Error description"
}
```

**Common Errors:**

- `"Not authenticated"`: Trying to send message before auth
- `"Malformed message"`: Invalid JSON or schema validation failed
- `"Message too large"`: Message exceeds 64KB limit

---

### Connection Lifecycle

```
┌──────────────────────────────────────────────────┐
│ 1. Client connects                               │
│    ws://localhost:3000/ws                        │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 2. Server sets 30-second auth timeout            │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 3. Client sends auth message with JWT            │
│    {"type": "auth", "token": "...", ...}         │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 4. Server validates token                        │
│    - Clears auth timeout                         │
│    - Adds to clients map                         │
│    - Flushes pending commands                    │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 5. Authenticated connection active               │
│    - Send/receive messages                       │
│    - Periodic ping/pong heartbeat                │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 6. Client disconnects                            │
│    - Removed from clients map                    │
│    - Auth timeout cleared                        │
└──────────────────────────────────────────────────┘
```

---

## Signaling Server WebSocket

The Signaling Server WebSocket facilitates WebRTC peer-to-peer connections between desktop and mobile devices.

### Connection

**Endpoint:** `ws://localhost:4000/ws` (development) or `wss://signaling.agiworkforce.com/ws` (production)

**Protocol:** RFC 6455 WebSocket

**Message Format:** JSON

**Max Message Size:** 64KB (65,536 bytes)

### Device Pairing Flow

```
┌─────────────┐                  ┌──────────────┐                  ┌─────────────┐
│   Mobile    │                  │  Signaling   │                  │   Desktop   │
│             │                  │    Server    │                  │             │
└──────┬──────┘                  └──────┬───────┘                  └──────┬──────┘
       │                                │                                 │
       │  1. Request pairing code       │                                 │
       │  POST /pairings                │                                 │
       ├───────────────────────────────>│                                 │
       │                                │                                 │
       │  2. Receive code & WS URL      │                                 │
       │  {"code": "A3B7C9D2", ...}     │                                 │
       │<───────────────────────────────┤                                 │
       │                                │                                 │
       │  3. Display code to user       │                                 │
       │                                │                                 │
       │                                │  4. User enters code            │
       │                                │<────────────────────────────────┤
       │                                │                                 │
       │  5. Connect to WebSocket       │  6. Connect to WebSocket        │
       ├───────────────────────────────>│<────────────────────────────────┤
       │                                │                                 │
       │  7. Register with code         │  8. Register with code          │
       │  {"type": "register", ...}     │  {"type": "register", ...}      │
       ├───────────────────────────────>│<────────────────────────────────┤
       │                                │                                 │
       │  9. Registered                 │  10. Registered                 │
       │  {"type": "registered"}        │   {"type": "registered"}        │
       │<───────────────────────────────┤─────────────────────────────────>│
       │                                │                                 │
       │  11. Peer ready notification   │  12. Peer ready notification    │
       │  {"type": "peer_ready"}        │   {"type": "peer_ready"}        │
       │<───────────────────────────────┤─────────────────────────────────>│
       │                                │                                 │
       │  13. Exchange WebRTC signals (offer, answer, ICE candidates)     │
       │<─────────────────────────────────────────────────────────────────>│
       │                                │                                 │
       │  14. WebRTC connection established (peer-to-peer)                │
       │<═══════════════════════════════════════════════════════════════>│
       │                                │                                 │
```

---

### Registration

Before exchanging WebRTC signals, both peers must register with the signaling server.

#### Register Message (Client → Server)

```json
{
  "type": "register",
  "code": "A3B7C9D2",
  "role": "desktop",
  "metadata": {
    "deviceName": "MacBook Pro",
    "platform": "macos"
  }
}
```

**Fields:**

- `type`: Always `"register"`
- `code`: 8-character pairing code (case-insensitive)
- `role`: Either `"desktop"` or `"mobile"`
- `metadata`: Optional object with device information

**Validation:**

- Code must be exactly 8 characters
- Role must be `"desktop"` or `"mobile"`
- Code must exist in database and not be expired
- Role must not already be connected for this session

#### Registered Response (Server → Client)

```json
{
  "type": "registered",
  "role": "desktop",
  "code": "A3B7C9D2",
  "expiresAt": 1609459500000,
  "peerConnected": true
}
```

**Fields:**

- `type`: Always `"registered"`
- `role`: Confirmed role for this connection
- `code`: Confirmed pairing code
- `expiresAt`: Unix timestamp when session expires
- `peerConnected`: Whether the other peer is already connected

#### Registration Errors

```json
{
  "type": "error",
  "error": "pairing_not_found"
}
```

**Error Codes:**

- `"pairing_not_found"`: Code doesn't exist in database
- `"pairing_expired"`: Session has expired
- `"role_already_connected"`: Another client already registered with this role
- `"registration_required"`: Trying to send message before registering
- `"server_overloaded"`: Too many pending connections

**Connection closes automatically after registration error.**

---

### WebRTC Signaling

After both peers are registered, they exchange WebRTC signals to establish peer-to-peer connection.

#### Peer Ready Notification (Server → Both Clients)

Sent when both desktop and mobile are connected:

```json
{
  "type": "peer_ready",
  "role": "mobile",
  "metadata": {
    "deviceName": "iPhone 15 Pro",
    "platform": "iOS"
  }
}
```

**Each peer receives notification about the other peer.**

---

#### Signal Message (Client → Server → Peer)

Generic signal message for WebRTC negotiation:

```json
{
  "type": "signal",
  "kind": "offer",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- 1234567890 2 IN IP4 127.0.0.1\r\n..."
  }
}
```

**Signal Kinds:**

- `"offer"`: WebRTC offer (SDP)
- `"answer"`: WebRTC answer (SDP)
- `"ice"`: ICE candidate
- `"control"`: Control message

**Signal is forwarded to the peer:**

```json
{
  "type": "signal",
  "from": "desktop",
  "kind": "offer",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- 1234567890 2 IN IP4 127.0.0.1\r\n..."
  }
}
```

---

#### WebRTC Offer (Desktop → Mobile)

Desktop initiates WebRTC connection:

```json
{
  "type": "signal",
  "kind": "offer",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\n..."
  }
}
```

**Payload Validation:**

- `type`: Must be `"offer"`
- `sdp`: Max 100,000 characters (SDPs with many ICE candidates can be large)

---

#### WebRTC Answer (Mobile → Desktop)

Mobile responds with WebRTC answer:

```json
{
  "type": "signal",
  "kind": "answer",
  "payload": {
    "type": "answer",
    "sdp": "v=0\r\no=- 4611731400430051337 2 IN IP4 127.0.0.1\r\ns=-\r\n..."
  }
}
```

**Payload Validation:**

- `type`: Must be `"answer"`
- `sdp`: Max 100,000 characters

---

#### ICE Candidate (Both Directions)

Exchange ICE candidates for NAT traversal:

```json
{
  "type": "signal",
  "kind": "ice",
  "payload": {
    "candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0,
    "usernameFragment": "abcd1234"
  }
}
```

**Payload Validation:**

- `candidate`: Max 500 characters, nullable
- `sdpMid`: Max 50 characters, nullable
- `sdpMLineIndex`: Integer 0-100, nullable
- `usernameFragment`: Max 100 characters, nullable

**All fields optional/nullable as per WebRTC spec.**

---

#### Control Message

Application-specific control messages:

```json
{
  "type": "signal",
  "kind": "control",
  "payload": {
    "action": "pause_sync",
    "data": {
      "reason": "user_request"
    }
  }
}
```

**Payload Validation:**

- `action`: Max 50 characters
- `data`: Optional object
- Total JSON size max 4KB

---

### Signaling Message Types

#### Heartbeat

Keep-alive message:

**Request (Client → Server):**

```json
{
  "type": "heartbeat"
}
```

**Response (Server → Client):**

```json
{
  "type": "heartbeat_ack",
  "timestamp": 1609459200000
}
```

---

#### Peer Left Notification

Sent when the other peer disconnects:

```json
{
  "type": "peer_left",
  "role": "mobile",
  "reason": "error"
}
```

**Reasons:**

- `"error"`: Peer disconnected due to error
- (no reason): Normal disconnect

---

#### Session Expired

Sent when session TTL expires:

```json
{
  "type": "session_expired"
}
```

**Connection closes automatically.**

---

### Signaling Server Connection Lifecycle

```
┌──────────────────────────────────────────────────┐
│ 1. Mobile requests pairing code via HTTP         │
│    POST /pairings                                │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 2. Server generates 8-char code                  │
│    - Stores in database with TTL                 │
│    - Returns code + WebSocket URL                │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 3. Both desktop & mobile connect to WS           │
│    ws://localhost:4000/ws                        │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 4. Both send register message with code          │
│    {"type": "register", "code": "...", ...}      │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 5. Server validates code (DB lookup)             │
│    - Code exists & not expired                   │
│    - Role not already taken                      │
│    - Adds to activeSessions map                  │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 6. Server sends registered + peer_ready          │
│    Both clients notified when both connected     │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 7. Clients exchange WebRTC signals               │
│    offer → answer → ICE candidates               │
│    Server routes signals between peers           │
└────────────────┬─────────────────────────────────┘
                 │
                 v
┌──────────────────────────────────────────────────┐
│ 8. WebRTC peer-to-peer connection established    │
│    Clients can disconnect from signaling server  │
└──────────────────────────────────────────────────┘
```

---

## Error Handling

### WebSocket Error Events

Both servers handle WebSocket errors to prevent unhandled exceptions:

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error.message);
  // Clean up client from connection map
});
```

**Client responsibilities:**

- Implement reconnection logic with exponential backoff
- Handle connection close gracefully
- Re-authenticate after reconnection

---

### Message Validation Errors

**Invalid JSON:**

```json
{
  "type": "error",
  "error": "invalid_json"
}
```

**Schema Validation Failed:**

```json
{
  "type": "error",
  "error": "invalid_signal_payload"
}
```

**Message Too Large:**

```json
{
  "type": "error",
  "error": "message_too_large"
}
```

---

## Security

### API Gateway WebSocket Security

1. **Authentication Required:**
   - All connections must authenticate within 30 seconds
   - JWT token validation using same secret as REST API
   - Connection closed if auth fails or times out

2. **Message Size Limits:**
   - Maximum message size: 64KB
   - Prevents DoS attacks via large payloads

3. **User Isolation:**
   - Commands/sync only broadcast to user's own devices
   - No cross-user message routing

4. **Connection Management:**
   - Periodic ping/pong heartbeat (30 seconds)
   - Automatic cleanup of dead connections
   - Auth timeout cleanup on disconnect

---

### Signaling Server Security

1. **Session Validation:**
   - All pairing codes stored in database
   - TTL enforcement (30-900 seconds, default 300)
   - Atomic code generation with retry (prevents collisions)
   - Unique constraint on code column (database-level protection)

2. **Message Size Limits:**
   - Maximum message size: 64KB
   - Payload validation per signal kind
   - SDP max 100KB, ICE candidate max 500 chars
   - Control payload max 4KB

3. **Rate Limiting (HTTP Endpoints):**
   - POST /pairings: 10/min (prevents code enumeration)
   - GET /pairings/:code: 60/min (read-only)
   - DELETE /pairings/:code: 10/min (destructive)

4. **Session Expiry:**
   - Automatic cleanup every 30 seconds
   - Expired sessions removed from memory
   - Database cleanup via optional cron or lazy deletion

5. **Connection Protection:**
   - Role enforcement (desktop/mobile)
   - Prevents duplicate role connections
   - Server overload protection (max 1000 pending rehydrations)
   - Pending rehydration TTL (30 seconds)

6. **Database Persistence:**
   - Session state persists across server restarts
   - Race condition prevention via pending rehydration map
   - Atomic session creation with retry mechanism

---

## Client Implementation Guidelines

### API Gateway WebSocket Client

```typescript
// 1. Connect
const ws = new WebSocket('ws://localhost:3000/ws');

// 2. Authenticate after connection opens
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: 'auth',
      token: jwtToken,
      deviceId: deviceUUID,
    }),
  );
};

// 3. Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'auth_success':
      console.log('Authenticated as', message.userId);
      break;
    case 'command':
      handleCommand(message);
      break;
    case 'sync':
      handleSync(message);
      break;
    case 'pong':
      console.log('Pong received');
      break;
    case 'error':
      console.error('WebSocket error:', message.error);
      break;
  }
};

// 4. Send periodic pings
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

// 5. Handle disconnection
ws.onclose = () => {
  console.log('Disconnected, reconnecting...');
  setTimeout(reconnect, 1000);
};
```

---

### Signaling Server WebSocket Client

```typescript
// 1. Request pairing code via HTTP
const response = await fetch('http://localhost:4000/pairings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ttlSeconds: 300 }),
});
const { code, wsUrl } = await response.json();

// 2. Connect to WebSocket
const ws = new WebSocket(wsUrl);

// 3. Register with code after connection opens
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: 'register',
      code: code,
      role: 'desktop',
      metadata: {
        deviceName: 'MacBook Pro',
        platform: 'macos',
      },
    }),
  );
};

// 4. Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'registered':
      console.log('Registered with code', message.code);
      if (message.peerConnected) {
        console.log('Peer already connected');
      }
      break;
    case 'peer_ready':
      console.log('Peer ready:', message.role);
      // Start WebRTC negotiation
      createOffer();
      break;
    case 'signal':
      handleSignal(message);
      break;
    case 'peer_left':
      console.log('Peer disconnected');
      break;
    case 'session_expired':
      console.log('Session expired');
      ws.close();
      break;
  }
};

// 5. Send WebRTC signals
function sendSignal(kind, payload) {
  ws.send(
    JSON.stringify({
      type: 'signal',
      kind: kind,
      payload: payload,
    }),
  );
}
```

---

## Debugging Tips

### Enable WebSocket Logging

**API Gateway:**

```bash
# Server logs all WebSocket events
DEBUG=ws:* pnpm dev
```

**Signaling Server:**

```bash
# Server logs registration and signal routing
DEBUG=signaling:* pnpm dev
```

### Browser DevTools

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Click connection to see:
   - Connection headers
   - Messages sent/received
   - Frame timing
   - Close reason

### Common Issues

**Connection Closes Immediately:**

- Check authentication timeout (30 seconds)
- Verify JWT token is valid
- Check server logs for error messages

**Messages Not Routing:**

- Verify device ID is set during auth
- Check user ID matches between devices
- Ensure WebSocket is in OPEN state

**Pairing Fails:**

- Verify code hasn't expired (TTL)
- Check both devices use same code
- Ensure roles are different (one desktop, one mobile)
- Check server logs for validation errors

---

## Performance Considerations

### Connection Scaling

**API Gateway:**

- Single server supports ~10,000 concurrent connections
- Uses WeakMap for client storage (automatic garbage collection)
- Pending command queue limited to 100 per device
- Memory usage: ~1KB per connection + pending commands

**Signaling Server:**

- Ephemeral connections (disconnect after WebRTC established)
- Typical session duration: 10-30 seconds
- Database persistence prevents memory leaks
- Automatic cleanup of expired sessions

### Message Throughput

**API Gateway:**

- Designed for low-frequency messages (commands, sync)
- No message rate limiting on WebSocket (rely on REST API limits)
- Message broadcast O(n) where n = user's connected devices

**Signaling Server:**

- Burst traffic during WebRTC negotiation
- ICE candidates can generate 10-50 messages
- Typical exchange: ~20-100 messages total
- All messages routed 1:1 (no broadcast)

---

## Changelog

### Version 1.0.0 (Current)

- API Gateway WebSocket for command delivery
- Signaling Server for WebRTC pairing
- Offline command queueing
- Database-persisted pairing sessions
- Race condition prevention in session rehydration

---

## Support

For WebSocket protocol support:

- Email: support@agiworkforce.com
- Documentation: https://docs.agiworkforce.com
- GitHub Issues: https://github.com/agiworkforce/agiworkforce/issues

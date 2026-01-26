# API Reference

Complete REST API documentation for AGI Workforce backend services.

## Table of Contents

- [Overview](#overview)
- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication-endpoints)
  - [Desktop Devices](#desktop-devices)
  - [Mobile Devices](#mobile-devices)
  - [Sync](#sync)
  - [Credits](#credits)
  - [Health](#health)

---

## Overview

The AGI Workforce API Gateway provides RESTful endpoints for device management, synchronization, authentication, and credit management. All endpoints use JSON for request and response payloads.

**Technology Stack:**

- Express.js 5.2
- JWT authentication (7-day expiration)
- Zod validation
- Supabase PostgreSQL
- WebSocket support (see [WEBSOCKET_PROTOCOL.md](./WEBSOCKET_PROTOCOL.md))

---

## Base URLs

**Development:**

```
http://localhost:3000
```

**Production:**

```
https://api.agiworkforce.com
```

---

## Authentication

All endpoints (except `/api/auth/*` and `/health`) require JWT authentication.

### Authorization Header

```http
Authorization: Bearer <jwt_token>
```

### Token Structure

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Token Expiration

- **Duration:** 7 days
- **Refresh:** Tokens must be refreshed by re-authenticating before expiration

---

## Rate Limiting

All endpoints implement rate limiting based on user ID (authenticated) or IP address (unauthenticated).

### Rate Limit Headers

Responses include standard rate limit headers (RFC 6585):

```http
RateLimit-Limit: 30
RateLimit-Remaining: 29
RateLimit-Reset: 1609459200
```

### Rate Limit Exceeded Response

**Status Code:** `429 Too Many Requests`

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again after 60 seconds.",
  "retryAfter": 60
}
```

### Rate Limits by Endpoint Category

| Category                | Window | Max Requests |
| ----------------------- | ------ | ------------ |
| Credits - Deduct        | 1 min  | 5            |
| Credits - Balance/Check | 1 min  | 10           |
| Device Registration     | 1 min  | 10           |
| Device Status           | 1 min  | 60           |
| Device Command          | 1 min  | 30           |
| Device List             | 1 min  | 30           |
| Device Delete           | 1 min  | 10           |
| Heartbeat               | 1 min  | 600 (10/sec) |
| Sync - Batch            | 1 min  | 30           |
| Sync - Updates          | 1 min  | 60           |
| Sync - Resolve          | 1 min  | 20           |
| Sync - Status           | 1 min  | 60           |
| Pairing Code            | 1 min  | 10           |
| Health                  | 1 min  | 100          |

---

## Error Handling

### Standard Error Response Format

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Meaning               | Description                             |
| ---- | --------------------- | --------------------------------------- |
| 200  | OK                    | Request succeeded                       |
| 201  | Created               | Resource created successfully           |
| 400  | Bad Request           | Invalid request body or parameters      |
| 401  | Unauthorized          | Missing or invalid authentication token |
| 402  | Payment Required      | Insufficient credits                    |
| 403  | Forbidden             | Token expired or invalid permissions    |
| 404  | Not Found             | Resource not found or not owned by user |
| 429  | Too Many Requests     | Rate limit exceeded                     |
| 500  | Internal Server Error | Server error                            |
| 502  | Bad Gateway           | Upstream service error                  |
| 503  | Service Unavailable   | Service temporarily unavailable         |

### Common Error Codes

| Error Code             | Description                       |
| ---------------------- | --------------------------------- |
| `RATE_LIMIT_EXCEEDED`  | Too many requests                 |
| `INVALID_TOKEN`        | JWT token is invalid              |
| `TOKEN_EXPIRED`        | JWT token has expired             |
| `VALIDATION_ERROR`     | Request validation failed         |
| `INSUFFICIENT_CREDITS` | Not enough credits for operation  |
| `RESOURCE_NOT_FOUND`   | Requested resource does not exist |

---

## API Endpoints

### Authentication Endpoints

#### Register User

Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Validation:**

- `email`: Valid email format
- `password`: Minimum 8 characters

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Errors:**

- `400 Bad Request`: User already exists or validation failed
- `500 Internal Server Error`: Failed to create user

---

#### Login

Authenticate an existing user.

**Endpoint:** `POST /api/auth/login`

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "desktopId": "optional-desktop-uuid"
  }
}
```

**Security Notes:**

- Uses bcrypt for password hashing (10 rounds)
- Implements timing attack prevention (always runs bcrypt.compare)
- Returns generic "Invalid credentials" for both non-existent users and wrong passwords

**Errors:**

- `401 Unauthorized`: Invalid credentials

---

#### Verify Token

Verify JWT token validity.

**Endpoint:** `GET /api/auth/verify`

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "valid": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

**Errors:**

- `401 Unauthorized`: No token provided
- `403 Forbidden`: Invalid or expired token

---

### Desktop Devices

Manage desktop client devices.

#### Register Desktop Device

Register a new desktop client.

**Endpoint:** `POST /api/desktop/register`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "name": "MacBook Pro",
  "platform": "macos",
  "version": "1.0.0"
}
```

**Validation:**

- `name`: 1-100 characters
- `platform`: One of `macos`, `windows`, `linux`
- `version`: Semver format (e.g., `1.0.0`)

**Response:** `200 OK`

```json
{
  "desktopId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Desktop registered successfully"
}
```

**Errors:**

- `400 Bad Request`: Validation failed
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to register device

---

#### Get Desktop Status

Get status of a specific desktop device.

**Endpoint:** `GET /api/desktop/:desktopId/status`

**Rate Limit:** 60 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "MacBook Pro",
  "platform": "macos",
  "version": "1.0.0",
  "online": true,
  "lastSeen": 1609459200000
}
```

**Online Status:**

- Device is considered online if `lastSeen` is within last 60 seconds

**Errors:**

- `400 Bad Request`: Invalid UUID format
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Device not found or not owned by user

---

#### Send Command to Desktop

Send a command to a desktop device (via WebSocket or queue).

**Endpoint:** `POST /api/desktop/:desktopId/command`

**Rate Limit:** 30 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body (Chat Command):**

```json
{
  "type": "chat",
  "payload": {
    "message": "Hello, AI!",
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "model": "claude-3-sonnet",
    "temperature": 0.7
  }
}
```

**Request Body (Automation Command):**

```json
{
  "type": "automation",
  "payload": {
    "action": "run",
    "workflowId": "550e8400-e29b-41d4-a716-446655440000",
    "parameters": {
      "input": "value"
    },
    "timeout": 60000
  }
}
```

**Request Body (Query Command):**

```json
{
  "type": "query",
  "payload": {
    "query": "search term",
    "collection": "documents",
    "limit": 10,
    "offset": 0
  }
}
```

**Validation:**

- Uses discriminated union validation for command types
- Each command type has strict payload validation
- Rejects unexpected fields to prevent injection

**Response:** `200 OK`

```json
{
  "commandId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "delivered",
  "message": "Command delivered to desktop",
  "type": "chat",
  "payload": { ... }
}
```

**Status Values:**

- `delivered`: Command sent via WebSocket to online device
- `queued`: Device offline, command queued (5-minute TTL, max 100 per device)
- `failed`: Failed to deliver or queue command

**Errors:**

- `400 Bad Request`: Invalid UUID or validation failed
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Device not found or not owned by user

---

#### List Desktop Devices

Get all desktop devices for the authenticated user.

**Endpoint:** `GET /api/desktop`

**Rate Limit:** 30 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "desktops": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "MacBook Pro",
      "platform": "macos",
      "version": "1.0.0",
      "online": true,
      "lastSeen": 1609459200000
    }
  ]
}
```

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to list devices

---

#### Update Desktop Heartbeat

Update the last seen timestamp for a desktop device.

**Endpoint:** `POST /api/desktop/:desktopId/heartbeat`

**Rate Limit:** 600 requests per minute (10 per second)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "success": true
}
```

**Usage:**

- Desktop clients should call this endpoint every 30-60 seconds
- Used to determine online/offline status

**Errors:**

- `400 Bad Request`: Invalid UUID format
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Device not found or not owned by user

---

#### Delete Desktop Device

Unregister a desktop device.

**Endpoint:** `DELETE /api/desktop/:desktopId`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Desktop device unregistered"
}
```

**Errors:**

- `400 Bad Request`: Invalid UUID format
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Device not found or not owned by user

---

### Mobile Devices

Manage mobile client devices.

#### Register Mobile Device

Register a new mobile device.

**Endpoint:** `POST /api/mobile/register`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "iOS 17.0",
  "name": "iPhone 15 Pro",
  "pushToken": "ExponentPushToken[...]"
}
```

**Validation:**

- `clientId`: Optional UUID (generated if not provided)
- `platform`: 1-50 characters
- `name`: 1-100 characters
- `pushToken`: Optional, max 500 characters

**Response:** `200 OK`

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Note:** Uses upsert logic - if `clientId` exists, updates the device

**Errors:**

- `400 Bad Request`: Validation failed
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to register device

---

#### Update Push Token

Update push notification token for a mobile device.

**Endpoint:** `POST /api/mobile/push-token`

**Rate Limit:** 30 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "pushToken": "ExponentPushToken[...]"
}
```

**Response:** `200 OK`

```json
{
  "success": true
}
```

**Errors:**

- `400 Bad Request`: Validation failed
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Device not owned by user
- `404 Not Found`: Device not found

---

#### Request Pairing Code

Request a pairing code from the signaling server for device pairing.

**Endpoint:** `POST /api/mobile/pairing-code`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "ttlSeconds": 300
}
```

**Validation:**

- `ttlSeconds`: Optional, 30-900 seconds (default: 300)

**Response:** `200 OK`

```json
{
  "code": "A3B7C9D2",
  "expiresAt": 1609459500000,
  "expiresIn": 300,
  "qrData": "agiw:A3B7C9D2",
  "signaling": {
    "httpUrl": "http://localhost:4000",
    "wsUrl": "ws://localhost:4000/ws"
  }
}
```

**Code Format:**

- 8-character alphanumeric code
- Base64url encoding for high entropy (~48 bits)
- Case-insensitive

**Errors:**

- `400 Bad Request`: Invalid TTL value
- `401 Unauthorized`: Authentication required
- `502 Bad Gateway`: Failed to connect to signaling server
- `503 Service Unavailable`: Signaling server unavailable

---

#### List Mobile Devices

Get all mobile devices for the authenticated user.

**Endpoint:** `GET /api/mobile`

**Rate Limit:** 30 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "devices": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "iPhone 15 Pro",
      "platform": "iOS 17.0",
      "pushToken": "ExponentPushToken[...]",
      "updatedAt": 1609459200000
    }
  ]
}
```

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to list devices

---

#### Delete Mobile Device

Remove a mobile device.

**Endpoint:** `DELETE /api/mobile/:deviceId`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Mobile device removed"
}
```

**Errors:**

- `400 Bad Request`: Invalid UUID format
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Device not found or not owned by user

---

### Sync

Cross-device synchronization endpoints.

#### Batch Sync

Sync a batch of items to the server.

**Endpoint:** `POST /api/sync/batch`

**Rate Limit:** 30 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
X-Device-Id: <device-uuid>
```

**Request Body:**

```json
{
  "items": [
    {
      "id": "item-1",
      "entity_type": "conversation",
      "entity_id": "550e8400-e29b-41d4-a716-446655440000",
      "action": "Create",
      "data": "{\"title\":\"My Conversation\"}",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "retry_count": 0,
      "synced": false
    }
  ],
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Validation:**

- `items`: Max 100 items per batch
- `data`: Max 1MB per item
- `action`: One of `Create`, `Update`, `Delete`

**Response:** `200 OK`

```json
{
  "success": true,
  "synced_ids": ["item-1"],
  "failed_ids": [],
  "conflicts": [],
  "updates": []
}
```

**Conflict Response:**

```json
{
  "success": false,
  "synced_ids": [],
  "failed_ids": ["item-2"],
  "conflicts": [
    {
      "entity_id": "550e8400-e29b-41d4-a716-446655440000",
      "entity_type": "conversation",
      "local_hash": "abc123...",
      "remote_hash": "def456...",
      "remote_data": "{...}",
      "remote_timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "updates": []
}
```

**Conflict Detection:**

- Last-write-wins strategy with timestamp comparison
- Conflicts occur when remote has newer timestamp than local

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to sync data

---

#### Pull Updates

Pull updates from the server since a given timestamp.

**Endpoint:** `GET /api/sync/updates?since=<iso-timestamp>`

**Rate Limit:** 60 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
X-Device-Id: <device-uuid>
```

**Query Parameters:**

- `since`: ISO 8601 timestamp (default: epoch)

**Response:** `200 OK`

```json
[
  {
    "entity_type": "conversation",
    "entity_id": "550e8400-e29b-41d4-a716-446655440000",
    "action": "Update",
    "data": "{\"title\":\"Updated Conversation\"}",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": 1
  }
]
```

**Note:** Excludes updates from the requesting device (via `X-Device-Id` header)

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to pull updates

---

#### Resolve Conflict

Submit a conflict resolution.

**Endpoint:** `POST /api/sync/resolve-conflict`

**Rate Limit:** 20 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
X-Device-Id: <device-uuid>
```

**Request Body:**

```json
{
  "entity_id": "550e8400-e29b-41d4-a716-446655440000",
  "resolution_data": "{\"title\":\"Merged Conversation\"}",
  "version": 2,
  "device_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `200 OK`

```json
{
  "success": true
}
```

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to resolve conflict

---

#### Get Sync Status

Get synchronization status for the authenticated user.

**Endpoint:** `GET /api/sync/status`

**Rate Limit:** 60 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
X-Device-Id: <device-uuid>
```

**Response:** `200 OK`

```json
{
  "is_syncing": false,
  "last_sync": "2024-01-01T00:00:00.000Z",
  "pending_count": 0,
  "failed_count": 0,
  "next_sync": null
}
```

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to get status

---

#### Legacy Endpoints

The API maintains backward compatibility with legacy sync endpoints.

**POST /api/sync/push** - Push sync data (rate limit: 30/min)
**GET /api/sync/pull** - Pull sync data (rate limit: 30/min)
**DELETE /api/sync/clear** - Clear all sync data (rate limit: 30/min)

See implementation for details.

---

### Credits

Manage API usage credits.

#### Get Credit Balance

Get current credit balance for the authenticated user.

**Endpoint:** `GET /api/credits/balance`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "has_credits": true,
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "credits_allocated_cents": 100000,
  "credits_used_cents": 25000,
  "credits_remaining_cents": 75000,
  "daily_limit_cents": 10000,
  "daily_used_cents": 2500,
  "daily_remaining_cents": 7500,
  "period_start": "2024-01-01T00:00:00.000Z",
  "period_end": "2024-02-01T00:00:00.000Z",
  "last_daily_reset_at": "2024-01-15T00:00:00.000Z"
}
```

**No Credits Response:**

```json
{
  "has_credits": false,
  "account_id": null,
  "credits_allocated_cents": 0,
  "credits_used_cents": 0,
  "credits_remaining_cents": 0,
  "daily_limit_cents": 0,
  "daily_used_cents": 0,
  "daily_remaining_cents": 0,
  "period_start": null,
  "period_end": null
}
```

**Errors:**

- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to get balance

---

#### Check Credits Available

Check if user has enough credits for a given amount.

**Endpoint:** `POST /api/credits/check`

**Rate Limit:** 10 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "amount_cents": 1000
}
```

**Response:** `200 OK`

```json
{
  "available": true,
  "requested_cents": 1000
}
```

**Errors:**

- `400 Bad Request`: Invalid amount
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Failed to check credits

---

#### Deduct Credits

Deduct credits from the authenticated user's account.

**Endpoint:** `POST /api/credits/deduct`

**Rate Limit:** 5 requests per minute

**Headers:**

```http
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "amount_cents": 1000,
  "description": "LLM usage: claude-3-sonnet",
  "metadata": {
    "model": "claude-3-sonnet",
    "provider": "anthropic",
    "input_tokens": 100,
    "output_tokens": 200,
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "idempotency_key": "unique-operation-id"
}
```

**Validation:**

- `amount_cents`: Positive integer
- `description`: Optional, max 500 characters
- `metadata`: Optional object with model, provider, token counts
- `idempotency_key`: Optional, max 256 characters (prevents duplicate deductions)

**Response (Success):** `200 OK`

```json
{
  "success": true,
  "remaining_cents": 74000,
  "daily_limit": 10000,
  "daily_used": 3500,
  "daily_remaining": 6500,
  "reset_in_hours": 12
}
```

**Response (Insufficient Credits):** `402 Payment Required`

```json
{
  "success": false,
  "error": "Insufficient credits",
  "code": "INSUFFICIENT_CREDITS",
  "remaining_cents": 500,
  "daily_limit": 10000,
  "daily_used": 9500,
  "daily_remaining": 500,
  "reset_in_hours": 12
}
```

**Idempotency:**

- Duplicate requests with same `idempotency_key` return cached result
- Prevents double-charging on network retries

**Errors:**

- `400 Bad Request`: Validation failed
- `401 Unauthorized`: Authentication required
- `402 Payment Required`: Insufficient credits
- `404 Not Found`: No credit account found
- `500 Internal Server Error`: Failed to deduct credits

---

### Health

Service health check endpoint.

#### Health Check

Get service health status.

**Endpoint:** `GET /health`

**Rate Limit:** 100 requests per minute

**Response:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": 1609459200000
}
```

---

## Security Considerations

### Input Validation

- All endpoints use Zod schemas with `.strict()` to reject unexpected fields
- UUID validation via regex to prevent injection attacks
- Message size limits (1MB for API payloads, 64KB for WebSocket)

### Authentication

- JWT tokens with 7-day expiration
- Timing attack prevention in login (always runs bcrypt.compare)
- User enumeration prevention (same error for non-existent user and wrong password)

### Authorization

- Row Level Security (RLS) on all database tables
- Ownership verification before all operations
- Returns 404 for both "not found" and "not owned" to prevent enumeration

### Rate Limiting

- Per-user rate limiting (not per-IP) for authenticated requests
- Stricter limits on financial operations (credits)
- Progressive limits based on operation sensitivity

### Data Protection

- CORS configured with allowed origins
- Helmet.js security headers
- Content-Type validation
- Request size limits

---

## Examples

### Complete Authentication Flow

```bash
# 1. Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "user": {
#     "id": "550e8400-e29b-41d4-a716-446655440000",
#     "email": "user@example.com"
#   }
# }

# 2. Use token for authenticated requests
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:3000/api/credits/balance \
  -H "Authorization: Bearer $TOKEN"
```

### Desktop Device Registration and Command

```bash
# 1. Register desktop
curl -X POST http://localhost:3000/api/desktop/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MacBook Pro",
    "platform": "macos",
    "version": "1.0.0"
  }'

# Response: { "desktopId": "abc-123-..." }

# 2. Send command
curl -X POST http://localhost:3000/api/desktop/abc-123.../command \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "chat",
    "payload": {
      "message": "Hello, AI!"
    }
  }'
```

### Sync Workflow

```bash
# 1. Push local changes
curl -X POST http://localhost:3000/api/sync/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-Id: device-uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "item-1",
        "entity_type": "conversation",
        "entity_id": "550e8400-e29b-41d4-a716-446655440000",
        "action": "Update",
        "data": "{\"title\":\"My Conversation\"}",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "retry_count": 0,
        "synced": false
      }
    ],
    "device_id": "device-uuid",
    "user_id": "user-uuid",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }'

# 2. Pull remote changes
curl -X GET "http://localhost:3000/api/sync/updates?since=2024-01-01T00:00:00.000Z" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-Id: device-uuid"
```

---

## Changelog

### Version 1.0.0 (Current)

- Initial API release
- Authentication endpoints
- Desktop and mobile device management
- Cross-device sync
- Credit system
- WebSocket support for real-time commands

---

## Support

For API support, please contact:

- Email: support@agiworkforce.com
- Documentation: https://docs.agiworkforce.com
- GitHub Issues: https://github.com/agiworkforce/agiworkforce/issues

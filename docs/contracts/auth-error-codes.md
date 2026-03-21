# Auth/Sync Error Taxonomy

> Canonical reference for all error codes in the API Gateway auth and sync subsystems.
> All client surfaces MUST handle these errors according to this taxonomy.

## Overview

The API Gateway (`services/api-gateway/`) exposes auth and sync endpoints consumed by
Mobile, Desktop, and Web clients. This document enumerates every error code, its HTTP
status, expected client behavior, and retry semantics.

---

## Error Response Format

All errors follow one of two shapes:

### Standard Error

```json
{
  "error": "Human-readable error message"
}
```

### Validation Error (Zod)

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [{ "field": "email", "message": "Invalid email" }]
}
```

### Rate Limit Error

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again after 60 seconds.",
  "retryAfter": 60
}
```

### Development-Only Fields

In `NODE_ENV=development`, error responses may include:

```json
{
  "error": "...",
  "stack": "Error: ... at ...",
  "details": "Internal error message"
}
```

These fields MUST NOT be displayed to users and are stripped in production.

---

## Auth Errors (`/auth/*`)

### POST `/auth/register`

| HTTP Status | Error Message                         | Code               | Cause                                                                  | Client Action                                 | Retryable         |
| ----------- | ------------------------------------- | ------------------ | ---------------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| 400         | `User already exists`                 | --                 | Email already registered                                               | Show "Account exists, please log in"          | No                |
| 400         | `VALIDATION_ERROR`                    | `VALIDATION_ERROR` | Request body fails schema (email invalid, password < 8 or > 128 chars) | Show field-level errors                       | No (fix input)    |
| 429         | `Too many authentication attempts...` | --                 | Rate limit: 5 requests per 15 minutes                                  | Show countdown timer; disable button          | Yes, after 15 min |
| 500         | `Failed to create user`               | --                 | Database insert failed                                                 | Show "Something went wrong, please try again" | Yes, with backoff |

### POST `/auth/login`

| HTTP Status | Error Message                         | Code               | Cause                                         | Client Action                                                   | Retryable            |
| ----------- | ------------------------------------- | ------------------ | --------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| 401         | `Invalid credentials`                 | --                 | Wrong email/password (or user does not exist) | Show "Invalid email or password" (do NOT reveal which is wrong) | No (fix credentials) |
| 400         | `VALIDATION_ERROR`                    | `VALIDATION_ERROR` | Request body fails schema                     | Show field-level errors                                         | No (fix input)       |
| 429         | `Too many authentication attempts...` | --                 | Rate limit: 5 requests per 15 minutes         | Show countdown timer; disable button                            | Yes, after 15 min    |

**Security note**: The login endpoint uses constant-time bcrypt comparison with a dummy hash
when the user does not exist. This prevents timing-based user enumeration. The error message
is intentionally identical for "wrong password" and "user not found."

### GET `/auth/verify`

| HTTP Status | Error Message       | Code | Cause                                                          | Client Action                         | Retryable |
| ----------- | ------------------- | ---- | -------------------------------------------------------------- | ------------------------------------- | --------- |
| 401         | `No token provided` | --   | Missing `Authorization: Bearer <token>` header                 | Redirect to login                     | No        |
| 401         | `Invalid token`     | --   | JWT verification failed (bad signature, wrong issuer/audience) | Clear stored token; redirect to login | No        |

---

## Auth Middleware Errors (Applied to All Authenticated Routes)

The `authenticateToken` middleware runs before all protected endpoints. These errors
can occur on ANY authenticated request:

| HTTP Status | Error Message                                                | Code                     | Cause                                                                                 | Client Action                                | Retryable            |
| ----------- | ------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------- |
| 401         | `No token provided`                                          | --                       | Missing `Authorization` header                                                        | Redirect to login screen                     | No                   |
| 403         | `Token expired`                                              | --                       | JWT `exp` claim is in the past                                                        | Refresh token or re-login                    | No (re-authenticate) |
| 403         | `Invalid token`                                              | --                       | JWT signature verification failed                                                     | Clear stored token; redirect to login        | No                   |
| 403         | `Invalid or expired token`                                   | --                       | Catch-all for Zod parse failure or other JWT errors                                   | Clear stored token; redirect to login        | No                   |
| 403         | `Account <status>. Contact support for assistance.`          | `ACCOUNT_NOT_ACTIVE`     | Account is suspended, banned, or in any non-`active` state                            | Show account status message; link to support | No                   |
| 503         | `Service temporarily unavailable. Please try again shortly.` | `AUTH_CHECK_UNAVAILABLE` | Supabase DB query for account status failed and no cached result exists (fail-closed) | Show retry UI; auto-retry after 5-10 seconds | Yes, with backoff    |

### Account Status Cache

The auth middleware caches account status in memory with a 60-second TTL:

- On cache hit: Use cached status (no DB query).
- On cache miss + DB success: Cache result, proceed.
- On cache miss + DB error: Return 503 (fail-closed). Never allow requests through when status is unknown.
- On cached `active`: Proceed normally.
- On cached non-`active`: Return 403 with status message.

---

## Sync Errors (`/sync/*`)

All sync endpoints require JWT authentication. Auth middleware errors (above) apply
to every endpoint below.

### POST `/sync/batch`

| HTTP Status | Error Message         | Code                  | Cause                                                                        | Client Action                                          | Retryable      |
| ----------- | --------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| 400         | `VALIDATION_ERROR`    | `VALIDATION_ERROR`    | Request body fails schema (items array too large, invalid action enum, etc.) | Fix request; reduce batch size to max 100 items        | No (fix input) |
| 403         | `user_id mismatch`    | --                    | `user_id` in request body does not match JWT's `userId` (IDOR prevention)    | Bug in client; fix user_id to match authenticated user | No             |
| 429         | `RATE_LIMIT_EXCEEDED` | `RATE_LIMIT_EXCEEDED` | Rate limit: 30 requests per minute                                           | Retry after `retryAfter` seconds                       | Yes            |

**Response format (success)**:

```json
{
  "success": true,
  "synced_ids": ["id1", "id2"],
  "failed_ids": [],
  "conflicts": [],
  "updates": []
}
```

**Partial failure**: The batch endpoint processes items individually. Some items may succeed
while others fail. The response always returns 200 with `success: false` if any items failed:

```json
{
  "success": false,
  "synced_ids": ["id1"],
  "failed_ids": ["id3"],
  "conflicts": [
    {
      "entity_id": "entity-1",
      "entity_type": "settings",
      "local_hash": "abc...",
      "remote_hash": "def...",
      "remote_data": "{...}",
      "remote_timestamp": "2026-03-19T..."
    }
  ],
  "updates": []
}
```

**Conflict detection**: When an `Update` action targets an entity where the server has a
newer timestamp, a conflict entry is returned. The client should present the conflict to
the user or auto-resolve using last-write-wins.

### GET `/sync/updates`

| HTTP Status | Error Message            | Code                  | Cause                              | Client Action                    | Retryable |
| ----------- | ------------------------ | --------------------- | ---------------------------------- | -------------------------------- | --------- |
| 429         | `RATE_LIMIT_EXCEEDED`    | `RATE_LIMIT_EXCEEDED` | Rate limit: 60 requests per minute | Retry after `retryAfter` seconds | Yes       |
| 500         | `Failed to pull updates` | --                    | Database query failed              | Retry with exponential backoff   | Yes       |

**Query parameters**:

- `since` (string, optional): ISO 8601 timestamp. Only returns updates after this time. Defaults to epoch.

**Headers**:

- `X-Device-ID` (string, optional): Excludes updates originating from this device.

### POST `/sync/resolve-conflict`

| HTTP Status | Error Message                | Code                  | Cause                              | Client Action                    | Retryable      |
| ----------- | ---------------------------- | --------------------- | ---------------------------------- | -------------------------------- | -------------- |
| 400         | `VALIDATION_ERROR`           | `VALIDATION_ERROR`    | Request body fails schema          | Fix request payload              | No (fix input) |
| 429         | `RATE_LIMIT_EXCEEDED`        | `RATE_LIMIT_EXCEEDED` | Rate limit: 20 requests per minute | Retry after `retryAfter` seconds | Yes            |
| 500         | `Failed to resolve conflict` | --                    | Database insert failed             | Retry with backoff               | Yes            |

### GET `/sync/status`

| HTTP Status | Error Message         | Code                  | Cause                              | Client Action                    | Retryable |
| ----------- | --------------------- | --------------------- | ---------------------------------- | -------------------------------- | --------- |
| 429         | `RATE_LIMIT_EXCEEDED` | `RATE_LIMIT_EXCEEDED` | Rate limit: 60 requests per minute | Retry after `retryAfter` seconds | Yes       |

**Response format**:

```json
{
  "is_syncing": false,
  "last_sync": "2026-03-19T10:30:00Z",
  "pending_count": 5,
  "failed_count": 0,
  "next_sync": null
}
```

### POST `/sync/devices/register`

| HTTP Status | Error Message               | Code                  | Cause                                                   | Client Action                    | Retryable      |
| ----------- | --------------------------- | --------------------- | ------------------------------------------------------- | -------------------------------- | -------------- |
| 400         | `VALIDATION_ERROR`          | `VALIDATION_ERROR`    | Request body fails schema (device_id > 100 chars, etc.) | Fix request payload              | No (fix input) |
| 429         | `RATE_LIMIT_EXCEEDED`       | `RATE_LIMIT_EXCEEDED` | Rate limit: 10 requests per minute                      | Retry after `retryAfter` seconds | Yes            |
| 500         | `Failed to register device` | --                    | Database upsert failed                                  | Retry with backoff               | Yes            |

### DELETE `/sync/devices/:deviceId`

| HTTP Status | Error Message                 | Code                  | Cause                              | Client Action                    | Retryable |
| ----------- | ----------------------------- | --------------------- | ---------------------------------- | -------------------------------- | --------- |
| 400         | `Device ID required`          | --                    | Missing `:deviceId` path parameter | Bug in client                    | No        |
| 429         | `RATE_LIMIT_EXCEEDED`         | `RATE_LIMIT_EXCEEDED` | Rate limit: 10 requests per minute | Retry after `retryAfter` seconds | Yes       |
| 500         | `Failed to unregister device` | --                    | Database delete failed             | Retry with backoff               | Yes       |

---

## Legacy Sync Endpoints

These endpoints exist for backward compatibility and will be deprecated:

### POST `/sync/push`

| HTTP Status | Error Message              | Code                  | Cause                     | Client Action      | Retryable |
| ----------- | -------------------------- | --------------------- | ------------------------- | ------------------ | --------- |
| 400         | `VALIDATION_ERROR`         | `VALIDATION_ERROR`    | Request body fails schema | Fix request        | No        |
| 429         | `RATE_LIMIT_EXCEEDED`      | `RATE_LIMIT_EXCEEDED` | Rate limit: 30/min        | Wait and retry     | Yes       |
| 500         | `Failed to push sync data` | --                    | DB insert failed          | Retry with backoff | Yes       |

### GET `/sync/pull`

| HTTP Status | Error Message              | Code                  | Cause              | Client Action      | Retryable |
| ----------- | -------------------------- | --------------------- | ------------------ | ------------------ | --------- |
| 429         | `RATE_LIMIT_EXCEEDED`      | `RATE_LIMIT_EXCEEDED` | Rate limit: 30/min | Wait and retry     | Yes       |
| 500         | `Failed to pull sync data` | --                    | DB query failed    | Retry with backoff | Yes       |

### DELETE `/sync/clear`

| HTTP Status | Error Message               | Code                  | Cause              | Client Action      | Retryable |
| ----------- | --------------------------- | --------------------- | ------------------ | ------------------ | --------- |
| 429         | `RATE_LIMIT_EXCEEDED`       | `RATE_LIMIT_EXCEEDED` | Rate limit: 30/min | Wait and retry     | Yes       |
| 500         | `Failed to clear sync data` | --                    | DB delete failed   | Retry with backoff | Yes       |

---

## Global Errors (All Routes)

These errors can occur on any endpoint:

| HTTP Status | Error Message                                  | Code                  | Cause                                       | Client Action                         | Retryable         |
| ----------- | ---------------------------------------------- | --------------------- | ------------------------------------------- | ------------------------------------- | ----------------- |
| 404         | `Not Found` / `Route <METHOD> <URL> not found` | --                    | Endpoint does not exist                     | Bug in client; check URL              | No                |
| 500         | `Internal Server Error`                        | --                    | Unhandled exception (non-operational error) | Show generic error; report to support | Yes, with backoff |
| 429         | `RATE_LIMIT_EXCEEDED`                          | `RATE_LIMIT_EXCEEDED` | Any rate limiter triggered                  | Retry after `retryAfter` seconds      | Yes               |

---

## Rate Limit Reference

| Endpoint Category            | Key                     | Window | Max Requests | Use Case                     |
| ---------------------------- | ----------------------- | ------ | ------------ | ---------------------------- |
| Auth (register/login/verify) | (built-in)              | 15 min | 5            | Prevent credential stuffing  |
| Pairing initiate/confirm     | `pairing-code`          | 1 min  | 10           | Prevent code enumeration     |
| Pairing status               | `device-status`         | 1 min  | 60           | Status polling               |
| Device registration          | `device-register`       | 1 min  | 10           | Prevent fake device creation |
| Device deletion              | `device-delete`         | 1 min  | 10           | Destructive operation        |
| Sync batch                   | `sync-batch`            | 1 min  | 30           | Resource-intensive batch ops |
| Sync updates                 | `sync-updates`          | 1 min  | 60           | Polling for changes          |
| Sync resolve-conflict        | `sync-resolve`          | 1 min  | 20           | Rare conflict resolution     |
| Sync status                  | `sync-status`           | 1 min  | 60           | Lightweight status check     |
| Legacy sync ops              | `sync-legacy`           | 1 min  | 30           | Backward compatibility       |
| Credit deduction             | `credits-deduct`        | 1 min  | 5            | Financial operations         |
| Credit balance/check         | `credits-balance/check` | 1 min  | 10           | Balance reads                |
| Heartbeat                    | `heartbeat`             | 1 min  | 600          | Real-time status             |
| Health                       | `health`                | 1 min  | 100          | Monitoring                   |
| Default                      | `default`               | 1 min  | 100          | Unlisted endpoints           |

### Rate Limit Headers

All responses include standard rate limit headers (RFC 6585):

- `RateLimit-Limit`: Maximum requests in window
- `RateLimit-Remaining`: Requests remaining in current window
- `RateLimit-Reset`: Seconds until the window resets

Legacy `X-RateLimit-*` headers are disabled.

### Key Generation

Rate limits are scoped by:

1. **Authenticated requests**: `user:<userId>` (prevents cross-user interference)
2. **Unauthenticated requests**: `ip:<normalized-ip>` (IPv6-normalized)

---

## Retry Semantics

### Retry Strategy by Error Type

| Error Category              | Strategy                       | Initial Delay | Max Retries | Backoff        |
| --------------------------- | ------------------------------ | ------------- | ----------- | -------------- |
| Rate limited (429)          | Fixed delay using `retryAfter` | From response | 3           | None (fixed)   |
| Server error (500)          | Exponential backoff            | 1s            | 5           | 2x with jitter |
| Service unavailable (503)   | Exponential backoff            | 2s            | 5           | 2x with jitter |
| Bad gateway (502)           | Exponential backoff            | 1s            | 3           | 2x with jitter |
| Auth error (401/403)        | No retry                       | --            | 0           | --             |
| Validation error (400)      | No retry                       | --            | 0           | --             |
| Not found (404)             | No retry                       | --            | 0           | --             |
| Conflict (user_id mismatch) | No retry                       | --            | 0           | --             |

### Recommended Backoff Formula

```
delay = min(baseDelay * 2^attempt + random(0, 1000), maxDelay)
```

Where:

- `baseDelay` = 1000ms for most errors, 2000ms for 503
- `maxDelay` = 30000ms (30 seconds)
- `random(0, 1000)` = jitter to prevent thundering herd

### Sync-Specific Retry Behavior

For batch sync failures:

1. Retry only the `failed_ids` items, not the entire batch.
2. Increment `retry_count` on each item (max 100 per schema).
3. After 3 consecutive failures for an item, move to a dead-letter queue (client-side).
4. Conflicts are NOT retried; they require explicit resolution via `POST /sync/resolve-conflict`.

---

## HTTP Status to User-Facing Message Mapping

| HTTP Status                  | User-Facing Message                                                     |
| ---------------------------- | ----------------------------------------------------------------------- |
| 400                          | "Please check your input and try again."                                |
| 401                          | "Your session has expired. Please sign in again."                       |
| 403 (token expired)          | "Your session has expired. Please sign in again."                       |
| 403 (invalid token)          | "Authentication error. Please sign in again."                           |
| 403 (account not active)     | "Your account is currently {status}. Please contact support."           |
| 404                          | "The requested resource was not found."                                 |
| 429                          | "You're making requests too quickly. Please wait {retryAfter} seconds." |
| 500                          | "Something went wrong. Please try again later."                         |
| 502                          | "We're having trouble reaching our servers. Please try again."          |
| 503                          | "The service is temporarily unavailable. Please try again shortly."     |
| 503 (AUTH_CHECK_UNAVAILABLE) | "We're verifying your account. Please try again in a moment."           |

---

## Error Code Registry

For machine-readable error handling, these are the structured error codes used across
auth and sync:

| Code                     | Endpoint(s)      | HTTP Status | Description                                 |
| ------------------------ | ---------------- | ----------- | ------------------------------------------- |
| `VALIDATION_ERROR`       | All              | 400         | Zod schema validation failed                |
| `RATE_LIMIT_EXCEEDED`    | All              | 429         | Rate limit exceeded                         |
| `ACCOUNT_NOT_ACTIVE`     | Auth middleware  | 403         | Account suspended/banned                    |
| `AUTH_CHECK_UNAVAILABLE` | Auth middleware  | 503         | Cannot verify account status (DB down)      |
| `user_id mismatch`       | POST /sync/batch | 403         | IDOR prevention: body user_id != JWT userId |

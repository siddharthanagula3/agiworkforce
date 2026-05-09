# Worker Protocol — Direction-Inversion Layer

> Version: 1.0 (Task 1.7, 2026-05-09)
> Author: services-engineer@agi-foundation-sprint
> Status: Implemented; 30-day backward-compat window with inbound bridge active.

---

## 1. Background

`services/api-gateway/` historically implemented an **inbound-only** protocol:
the desktop holds an open WebSocket to the gateway, and the gateway pushes
`command` envelopes back down. That pattern works for desktop-initiated
conversations but cannot serve Dispatch / Cowork-style flows where a mobile or
web client wants to hand a long-running task to a CLI or desktop worker.

Anthropic's reference implementation (`bridge/`, `remote/`, `server/` in the
reference codebase) goes the other direction: the **worker** (CLI, desktop, or
mobile process) registers with the cloud, polls for work, and the cloud assigns
tasks via JSON-RPC. This document describes the implementation of that
outbound-worker protocol in `services/api-gateway/src/worker/`.

Both directions coexist. The inbound bridge at `/ws` remains live for the
30-day migration window. Clients that have not migrated continue to work.

---

## 2. Architecture

```
Worker (CLI / Desktop / Mobile)
        |
        | POST /v1/environments/bridge   (register — Tier 1 OAuth Bearer)
        v
[api-gateway: registrationRouter]
        |  mints environment_secret (random base64url)
        |  stores worker_registrations row
        |  returns: { environment_id, environment_secret }
        |
        | GET  /v1/environments/:id/work/poll   (long-poll — Tier 2 env_secret)
        v
[api-gateway: assignmentRouter]
        |  holds connection up to 20s; returns immediately if work available
        |  returns: { work_id, work_secret (base64url WorkSecret envelope),
        |             worker_epoch, payload }
        |
        | Worker decodes WorkSecret, extracts session_ingress_token
        |
        | POST /v1/environments/:id/work/:wid/ack   (Tier 3 session_ingress)
        v
[api-gateway: assignmentRouter]
        |
        | [Worker executes the task]
        |
        | POST /v1/environments/:id/work/:wid/heartbeat  (Tier 3+4 every 30s)
        v
[api-gateway: heartbeatRouter]
        |
        | POST /v1/environments/:id/work/:wid/complete   (Tier 3)
        v
[api-gateway: assignmentRouter]
        returns: { completed: true }
```

---

## 3. WorkSecret Envelope

The `WorkSecret` is a version-pinned base64url-encoded JSON blob minted by the
gateway after registration. Workers MUST verify `version === 1` before
accepting a work unit.

```typescript
interface WorkSecret {
  version: 1; // must equal WORK_SECRET_VERSION
  session_ingress_token: string; // opaque JWT used for ack/heartbeat/complete
  api_base_url: string; // base URL for LLM / CCR calls
  claude_code_args?: string[]; // extra CLI args (optional)
  mcp_config?: unknown; // MCP server config blob (optional)
  environment_variables?: Record<string, string>;
  use_code_sessions?: boolean; // v2 path selector
  expires_at: number; // Unix seconds; workers must reject expired secrets
}
```

Codec: `encodeWorkSecret(secret)` → base64url string; `decodeWorkSecret(str)` → validates version, expiry, and non-empty `session_ingress_token`.

---

## 4. Four-Tier Auth Ladder

| Tier                       | Credential                                      | Used for                                       |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| 1 — OAuth Bearer           | `Authorization: Bearer <gateway-jwt>`           | `POST /v1/environments/bridge` (register)      |
| 2 — environment_secret     | `X-Environment-Secret: <secret>`                | Poll, stop, archive, worker-level heartbeat    |
| 3 — session_ingress JWT    | `Authorization: Bearer <session-ingress-token>` | Ack, complete, work-level heartbeat            |
| 4 — X-Trusted-Device-Token | `X-Trusted-Device-Token: <token>`               | Sent alongside Tier 1 / 3 for enrolled devices |

These tiers are NOT interchangeable. A Tier 2 credential cannot ack work (Tier 3 required).

---

## 5. Trusted-Device Enrollment

Enrollment MUST happen at `/login` time. The server gates on
`account_session.created_at < 10 min` — lazy enrollment after a 403 is not
possible. The client memoizes the token so macOS Keychain (`security`
subprocess, ~40 ms per call) is not invoked on every poll.

```
POST /api/auth/trusted_devices
Authorization: Bearer <gateway-jwt>
{
  "display_name": "Claude Code on myhostname · darwin",
  "device_token": "<32-512 char opaque token>"
}
```

The token hash is stored in `worker_registrations.trusted_device_token_hash`.

---

## 6. Worker Epoch Bumping

Every `POST /v1/environments/:id/bridge` call increments `worker_epoch` in the
`worker_registrations` row. A JWT-only credential swap that does NOT also
rebuild the entire transport will 409 within 20 s on the next heartbeat because
the epoch is part of every wire message.

Callers MUST treat a `/bridge` response as a full transport replacement, not
just a header swap. Both refresh paths (OAuth Bearer re-registration and
environment_secret `/bridge` bump) fully rebuild the transport.

---

## 7. Heartbeat Protocol

- Workers send a heartbeat every **30 s** (`HEARTBEAT_INTERVAL_MS`).
- Missed heartbeats > **90 s** (`HEARTBEAT_OFFLINE_THRESHOLD_MS`) mark the
  worker offline.
- A background sweep process (`startHeartbeatSweep()`) runs every 60 s and
  calls `reassignStaleWork()`:
  - Moves stale workers to `status: 'offline'`.
  - Any `work_units` with `status: 'assigned'` belonging to the stale worker
    are reassigned to the next available worker in the same environment, or
    reset to `'pending'` if no alternative exists.
  - Idempotency: both workers may receive the same `work_id`; the second ack
    returns the existing state without double-assignment.

---

## 8. Step-Up Auth

When the gateway returns HTTP 403 with `{ code: 'insufficient_scope' }`, the
caller MUST NOT attempt a token refresh. Per RFC 6749 §6, a refresh token
cannot elevate the scope granted by the original authorization. Instead, the
client must start a fresh PKCE authorization flow targeting the required scope.

```json
{
  "code": "insufficient_scope",
  "required_scope": "dispatch:write",
  "pkce_redirect_url": "https://auth.agiworkforce.com/oauth/authorize?..."
}
```

---

## 9. Backward-Compat Window

The existing inbound WebSocket bridge at `/ws` remains live. New clients
SHOULD prefer the outbound-worker protocol. Old clients continue to work.

Track migration progress via `worker_registrations.worker_type`:

- `cli` + `desktop` + `mobile` rows that never call `/v1/environments/bridge`
  are still on the legacy path.
- Once the table shows zero active legacy clients, the backward-compat comment
  can be removed from this document and the 30-day window considered closed.

---

## 10. Database Tables

### `worker_registrations`

| Column                      | Type        | Description                                      |
| --------------------------- | ----------- | ------------------------------------------------ |
| `id`                        | uuid        | PK                                               |
| `user_id`                   | uuid        | FK auth.users                                    |
| `worker_type`               | text        | cli / desktop / mobile / custom                  |
| `platform`                  | text        | darwin / linux / windows / android / ios         |
| `version`                   | text        | semver                                           |
| `worker_epoch`              | int         | Bumped on every /bridge call                     |
| `environment_id`            | text        | Stable ID returned to the worker at registration |
| `environment_secret_hash`   | text        | SHA-256(secret + JWT_SECRET)                     |
| `trusted_device_token_hash` | text?       | SHA-256(token + JWT_SECRET) or null              |
| `status`                    | text        | available / busy / offline                       |
| `last_heartbeat_at`         | timestamptz | Updated on every heartbeat                       |
| `created_at` / `updated_at` | timestamptz | Audit timestamps                                 |

### `work_units`

| Column                                       | Type        | Description                                          |
| -------------------------------------------- | ----------- | ---------------------------------------------------- |
| `id`                                         | uuid        | PK                                                   |
| `environment_id`                             | text        | FK worker_registrations.environment_id               |
| `worker_id`                                  | uuid?       | FK worker_registrations.id — null when pending       |
| `status`                                     | text        | pending / assigned / completed / failed / reassigned |
| `work_secret_envelope`                       | text        | base64url WorkSecret blob                            |
| `payload`                                    | jsonb       | Work payload + result (merged on complete)           |
| `idempotency_key`                            | text?       | Supplied by assigning client                         |
| `created_at` / `updated_at` / `completed_at` | timestamptz | Lifecycle timestamps                                 |

---

## 11. Files Added

- `services/api-gateway/src/worker/types.ts` — WorkSecret codec, validateBridgeId, interfaces
- `services/api-gateway/src/worker/registration.ts` — registrationRouter
- `services/api-gateway/src/worker/assignment.ts` — assignmentRouter
- `services/api-gateway/src/worker/heartbeat.ts` — heartbeatRouter + background sweep
- `services/api-gateway/src/worker/index.ts` — barrel export
- `services/api-gateway/src/__tests__/worker.test.ts` — 15 test groups
- `docs/architecture/worker-protocol.md` — this document

## 12. Files Modified

- `services/api-gateway/src/index.ts` — mounts registrationRouter, assignmentRouter, heartbeatRouter; calls startHeartbeatSweep()

---

## 13. Known Gaps (deferred)

- **DB migrations**: `worker_registrations` and `work_units` tables must be added to `supabase/migrations/`. Not in scope for Task 1.7 — tracked as a follow-up before paid-tier launch.
- **JSON-RPC over WebSocket**: The `JsonRpcRequest`/`JsonRpcResponse` types in `types.ts` are wired but the full bi-directional WebSocket subprotocol (`/v1/sessions/ws/{id}/subscribe`) is a Phase 2 item.
- **OAuth metadata discovery + DCR**: Full RFC 9728/8414/7591 OAuth stack is Tier-2 parity work (see gap matrix §4.5).
- **`control_request` / `control_response` dispatcher**: 30+ subtypes are a Phase 2 item (gap matrix §3.6).

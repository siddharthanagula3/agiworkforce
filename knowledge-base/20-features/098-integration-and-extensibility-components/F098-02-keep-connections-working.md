---
id: "F098-02"
type: "feature"
title: "Keep connections working"
aliases: ["Token vault", "Token refresh coordinator", "Connector health monitor", "Needs reauthorization", "Reconnect notification"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.04", "S98.05", "S98.10"]
depends_on: ["F098-01", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "SYS-connectors-plugins-and-skills", "surface:web", "surface:cli", "mode:cloud", "table:connector_oauth_grants", "table:connector_call_events", "file:apps/web/lib/connectors/oauth-access.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-02 Keep connections working

Keeps connector sign-ins working after the first connect. Tokens are sealed in the database, refreshed once when several requests need the same expiring token, and reported as needing reconnect when the outside service refuses them. Health and a call ceiling come from a log of recent connector calls.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.04](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9804), [S98.05](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9805), [S98.10](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9810).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Encrypts access and refresh tokens at rest and opens them only when a call needs them. Refreshes a token that is about to expire, using a database row lock and an in-process share so concurrent requests refresh once. Records every connector call and derives a health state, a circuit that pauses a failing connector, and a per-minute call ceiling.

**Why it exists.** Tokens are secrets and they expire. Without a coordinator, two requests refresh at once and one loses its token. Without health, a person cannot tell a dead connector from a slow one (S98.04, S98.05, S98.10).

**Who uses it.** The platform for every connector call; people see its results as 'Needs reconnecting', a Reconnect notice or a paused-connector message.

**Problems it solves**

- Plain-text tokens in the database.
- Double refresh races that revoke a still-good grant.
- A silent dead connector with no explanation.

**Use cases**

- A mailbox token expires overnight; the next chat request refreshes it without the person noticing.
- The vendor revokes access; the person gets a 'Reconnect <name>' notification.
- A connector fails three calls in a row; further calls are paused with a message that names the wait.
- A person opens the connectors list and sees which connectors are not responding.

## 2. User experience

**Where to find it**

- Web: 'Needs reconnecting' under 'Connected account' (ConnectorAccountSummary.tsx:30); notification titled 'Reconnect <name>' targeting Settings, Connectors (oauth-access.ts:39-54); outcome announcer action label 'Reconnect' (features/connectors/components/ConnectorOutcomeAnnouncer.tsx:33).
- CLI: 'agi connectors' shows 'needs reconnecting: open <url>' or 'connected since <date>, <health>' (apps/cli/src/cloud/connectors.rs:176-205).
- Mobile: connect card in chat and connector detail screen (labels unknown).
- Health data: GET /api/connectors/health (app/api/connectors/health/route.ts:17-32) and per-connector 'health' in GET /api/connectors (route.ts:333-360).

**Before you start**

- A connected connector (F098-01).
- CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY set; without it connect is refused (custom-connector-crypto.ts:31-41; oauth/start/route.ts:222-224).

**Screens and controls**

- No dedicated health screen was found; health shows as a state on the connector entry (health values: connected, needs-reauthorization, not-responding, connectable, not-configured, unsupported-here; packages/client/client-runtime/src/connectors/policy.ts:134-145).
- Reconnect link or button starts F098-01 again.

**Journey**

1. 1. Person uses a connector in chat.
2. 2. The server reads the grant and decrypts the token (oauth-access.ts:95-108).
3. 3. If it expires within 60 seconds, one refresh runs under a row lock (oauth-access.ts:35, 116-121, 173-199).
4. 4. On success the new tokens are saved and the call goes ahead.
5. 5. If refresh is refused, the grant is revoked, the person is notified, and tools answer 'reauthorization required' (oauth-access.ts:197, 258-263).
6. 6. The person reconnects from Settings or the link.

**What the person sees and gets**

- Notification 'Reconnect <name>': 'The <name> authorization expired or was revoked, so its tools stop working until you connect it again.' (oauth-access.ts:46-52).
- Paused message: '<name> failed its last N calls, so calls to it are paused for Ns. Nothing was sent.' (health.ts:242).
- Rate message: 'has taken N calls in the last minute, which is this account's ceiling of 60...' (health.ts:253).
- Unreachable message from connectorUnreachableMessage (oauth-access.ts:464).

**Settings**

- CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY (name only).
- Constants: expiry skew 60 s, health window 1 hour, call ceiling 60 per 60 s, failure streak 3, recency 30 min, backoff 2 s doubling to 5 min (oauth-access.ts:35; health.ts:33-38; connector-call-log-service.ts:37-38).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Token sealing with a purpose bound into the authentication tag (custom-connector-crypto.ts:47-58; oauth-store.ts:294-345).
- Decryption failure on read throws ConnectorGrantDecryptionError, which access resolution turns into reauthorization-required with reason 'undecryptable' (oauth-store.ts:441-446, 516-545; oauth-access.ts:98-105).
- One refresh per user, connector and account key inside a process (oauth-access.ts:136-150), plus a database 'for update' row lock across processes (oauth-store.ts:461-490).
- A second waiter that finds a fresh token after the lock returns it without refreshing (oauth-access.ts:210-212).
- A lock wait that is cut returns status 'unreachable' (retry later), not reauthorization (oauth-access.ts:185-191; oauth-store.ts:448-452, 470-480).
- Dead refresh (invalid grant), no refresh token, or rejected discovered grant revokes the row and sends a once-a-day-deduplicated notification (oauth-access.ts:215, 229, 258-263, 39-54).
- Transient failures (5xx, 408, 429, network) give 'unreachable' and keep the grant (oauth-access.ts:166-171, 264-267).
- Health summary: responding, degraded (failure ratio above 0.25), not-responding (3 straight failures within 30 minutes), unknown with no calls (health.ts:42, 128-135).
- Circuit: closed, open, half-open with exponential wait (health.ts:74-78, 165-174); gate refuses a call when open or at 60 calls a minute (health.ts:227-264).
- 'blocked' calls (refused by this platform) never count against the provider (health.ts:84-86).
- Calls are logged to table connector_call_events and metered (health.ts:280-298; db/neon/0223_connector_call_events.sql).

**Incomplete**

- The brief describes states 'healthy, needs reauth, failing'; code has two systems: call-log health (responding, degraded, not-responding, unknown) and the list health that adds needs-reauthorization from grant state (health.ts:42; app/api/connectors/route.ts:341-359). needsReauthorization in the list is true only when there is no refresh token and the access token has expired (oauth-store.ts:575-583).
- The in-process refresh share is per server instance; cross-instance safety relies on the row lock [inferred from oauth-access.ts:37 and oauth-store.ts:461].
- Health is computed from the last 100 log rows within an hour (health.ts:40, 300-310).

**Present but disconnected or switched off**

- Nothing probes a connector on its own; health only changes when calls are made (health.ts:28-32).

**Not available**

- Local mode and apps' own token storage: none; mobile, CLI and VS Code do not hold connector tokens (they call the server).

## 4. Required behaviour

**Established requirements**

- Connector tokens and credentials are stored encrypted and decrypted only for use (S98.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.04)
- A coordinator refreshes expiring tokens once, even when several requests need the token at the same time (S98.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.05)
- A health monitor tracks each connection's state (healthy, needs reauth, failing) (S98.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.10)
- Security behaviour fails closed; a secret is never committed. (source: AGENTS.md section 6)

**Acceptance criteria**

1. A stored token is never readable as plain text in connector_oauth_grants.
2. Ten concurrent requests for an expired token cause one call to the token endpoint.
3. A refresh that the vendor rejects as an invalid grant revokes the grant and creates one notification per connector per day.
4. A 503 from the token endpoint leaves the grant intact and returns 'unreachable'.
5. After three failed calls within 30 minutes the connector reports not-responding and the next call is refused with the paused message.
6. The 61st call in one minute to one connector is refused with the ceiling message.
7. A grant that cannot be decrypted asks for reconnect instead of crashing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because key rotation uses a key ring, an old ciphertext must still open after a new key is added (loadKeyRing, envelope.ts:296).
- [inferred] The hourly health window means a quiet connector reads 'unknown', not 'healthy'.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the brief's three states with the code's names, or expose one combined state.
- [proposed] Add a scheduled probe so a dead connector is found before a person asks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Token vault helpers | `apps/web/lib/custom-connector-crypto.ts` | encryptConnectorToken / decryptConnectorToken with a purpose; availability check. |
| service | Envelope crypto | `apps/web/lib/crypto/envelope.ts` | Key ring loading and sealing (loadKeyRing at line 296). |
| service | Connector secret reseal | `apps/web/lib/crypto/connector-secret-reseal.ts` | Secret purposes and open/reseal after key rotation. |
| service | Access resolver and refresh coordinator | `apps/web/lib/connectors/oauth-access.ts` | resolveConnectorAccessToken, refreshOnce, refreshUnderLock, reconnect notification, revocation. |
| service | Grant store | `apps/web/lib/connectors/oauth-store.ts` | withLockedConnectorOAuthGrant (row lock), decodeGrantRow, updateConnectorOAuthGrantTokens, summaries. |
| service | OAuth client | `apps/web/lib/connectors/oauth-client.ts` | refreshAccessToken and revoke calls to the vendor. |
| service | Discovered grant refresh | `apps/web/lib/connectors/mcp-discovery.ts` | refreshDiscoveredGrant and revokeDiscoveredGrant for directory and custom servers. |
| service | Health and gate | `apps/web/lib/connectors/health.ts` | Summaries, circuit, rate ceiling, meterConnectorCall, readConnectorHealth, readConnectorGate. |
| service | Call log service | `apps/web/lib/services/connector-call-log-service.ts` | recordConnectorCallOutcome, readConnectorCallLog, readConnectorsNotResponding. |
| table | table:connector_call_events | `apps/web/db/neon/0223_connector_call_events.sql` | Per-call outcome, duration, surface; row-level security by user. |
| table | table:connector_oauth_grants | `apps/web/db/neon/0097_connector_oauth_broker.sql` | Encrypted token columns and revoked_at. |
| endpoint | api:GET /api/connectors/health | `apps/web/app/api/connectors/health/route.ts` | Returns health summaries for the signed-in user. |
| endpoint | api:GET /api/connectors | `apps/web/app/api/connectors/route.ts` | Connector list with a health value per entry. |
| service | Shared health ranking | `packages/client/client-runtime/src/connectors/policy.ts` | resolveConnectorHealth ranking used by web and clients. |
| service | Notification service | `apps/web/lib/services/notification-service.ts` | recordNotification for the reconnect notice. |
| service | Tool executor metering | `apps/web/lib/user-connector-tools.ts` | makeUserConnectorExecutor logs outcomes and reads the gate (lines 2737-2780). |
| component | ConnectorOutcomeAnnouncer | `apps/web/features/connectors/components/ConnectorOutcomeAnnouncer.tsx` | Shows connector outcome notices with a Reconnect action. |
| service | CLI connectors client | `apps/cli/src/cloud/connectors.rs` | Shows reconnect and health state in the terminal. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A tool call asks for an access token for a user and connector. | our servers | oauth-access.ts:84-114 |
| Server reads the grant row and decrypts tokens with the key ring. | our servers | oauth-store.ts:492-545 |
| If the access token expires within 60 s, one refresh starts under a row lock in a transaction. | our servers | oauth-access.ts:116-150, 173-199; oauth-store.ts:461-490 |
| The vendor's token endpoint answers; new tokens are sealed and saved, or the grant is revoked. | outside service | oauth-access.ts:248-277 |
| The call outcome is logged to connector_call_events and checked against the circuit and ceiling for later calls. | our servers | health.ts:280-323; user-connector-tools.ts:2745-2775 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sealed access and refresh tokens. | table:connector_oauth_grants | Server only. | Replaced on refresh; cleared on revoke. |
| Call log row (connector id, tool name, outcome succeeded/failed/blocked, duration, surface). | table:connector_call_events | Server only. | Deleted with the user (on delete cascade); other retention not found. |
| Reconnect notification. | notification service store | Server; shown in apps that read notifications. | Deduplicated per connector per day (oauth-access.ts:52). |

**Models and providers.** No model is involved. The outside service's token endpoint is called for refresh.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Runs for the signed-in user who owns the grant; all queries are by user id. |
| Permissions | Call log table uses row-level security by user (0223 migration); org call data is stored with an optional organization id. |
| Subscription | None found in the code for refresh and health themselves; the plan gate applies when a connector is used (see F098-03). |
| Limits and metering | Per-connector ceiling 60 calls per 60 s, circuit after 3 failures, backoff 2 s to 5 min (health.ts:33-38). Each non-blocked call is also recorded as infrastructure cost (health.ts:290-297, recordConnectorCall in lib/services/infrastructure-cost). |
| Feature flags | None specific. The key ring env name is CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY. |
| Model compatibility | Not model dependent. |
| Provider restrictions | Refresh requires the vendor's token endpoint to accept the stored refresh token; behaviour differs per vendor (invalid_grant versus transient). |
| Local mode | Not applicable. These tokens live on our servers; local inference does not use them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | No call history: no health entries; state 'unknown' if only blocked calls. | health.ts:128-130, 88-101 |
| Not connected | status not-connected. | oauth-access.ts:108 |
| Not configured | status not-configured when no provider or endpoint. | oauth-access.ts:91-93 |
| Decrypt failure | reauthorization-required with reason undecryptable. | oauth-access.ts:98-105, 192-194 |
| Timeout | A concurrent refresh holding the lock too long gives 'unreachable' and a warning log. | oauth-access.ts:185-191 |
| Dead grant | Revoked, notification sent, reauthorization-required. | oauth-access.ts:197, 258-263 |
| Transient failure | unreachable; reconnecting is not asked. | oauth-access.ts:64-74, 264-267 |
| Retry | Circuit half-open after the wait lets one call through. | health.ts:165-174 |
| Offline | Treated as transient failure (non-OAuth error type counts as transient). | oauth-access.ts:168-170 |
| Log unreadable | The list falls back to configuration-derived state; the gate returns 'Connector availability could not be checked. Try again.'. | app/api/connectors/route.ts:326-332; user-connector-tools.ts:2776-2786 |
| Accessibility | not handled in the code for health text beyond plain text messages (not audited). | searched health.ts and ConnectorAccountSummary.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/oauth-access.test.ts`: Access resolution and refresh outcomes.
- `apps/web/lib/connectors/__tests__/health.test.ts`: Health summaries, circuit and gate.
- `apps/web/lib/__tests__/custom-connector-crypto.test.ts`: Token sealing and opening.
- `apps/web/lib/connectors/__tests__/oauth-store.test.ts`: Locked reads, decode errors, revoke.
- `apps/web/app/api/connectors/health/route.test.ts`: Health route.
- `apps/web/lib/connectors/__tests__/connector-unreachable-adapters.test.ts`: Unreachable handling in adapters.
- `apps/web/lib/connectors/__tests__/oauth-client.test.ts`: Token endpoint client.

**Test scenarios**

- **Concurrent refresh**
  1. Set a grant to expire in 30 seconds.
  2. Fire 10 chat tool calls at once.
  - Expected: One token endpoint call; all calls succeed.
- **Revoked at vendor**
  1. Revoke the app in the vendor console.
  2. Use the connector in chat.
  - Expected: Tool answers reauthorization required; one 'Reconnect <name>' notification; grant revoked.
- **Failure streak**
  1. Point a connector at a failing endpoint.
  2. Make three calls.
  - Expected: Health not-responding; fourth call refused with 'paused for Ns. Nothing was sent.'
- **Ceiling**
  1. Send 61 calls in a minute to one connector.
  - Expected: The 61st is refused with the ceiling message.
- **Bad ciphertext**
  1. Corrupt access_token_enc on a test row.
  2. Use the connector.
  - Expected: Reconnect requested (undecryptable); no crash.

**Where to look when it fails**

- Log lines: '[connector-oauth] token refresh failed', '...a concurrent refresh held the grant too long', '...stored grant could not be decrypted, asking the user to reconnect'.
- Error names: ConnectorGrantDecryptionError, ConnectorGrantLockTimeoutError, ConnectorUnreachableError.
- Tables: connector_call_events, connector_oauth_grants.revoked_at.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief wording for health states does not match code states.** Affects: Testers and clients reading the brief.. Evidence: health.ts:42 versus area brief S98.10.. Work needed: Update the brief or expose combined state.
- **No active probe; a silent dead connector shows 'unknown' until used.** Affects: All apps showing connector state.. Evidence: health.ts:28-32.. Work needed: Decide whether a scheduled check is wanted.
- **The ceiling and circuit are keyed by connector id, not by account.** Affects: People with several accounts once multi-account works.. Evidence: health.ts:232 filters by connectorId only.. Work needed: Add account to the log and gate if multi-account ships.

**Depends on**

- F098-01
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- SYS-connectors-plugins-and-skills
- surface:web
- surface:cli
- mode:cloud
- table:connector_oauth_grants
- table:connector_call_events
- file:apps/web/lib/connectors/oauth-access.ts

## Unknown

- Retention of connector_call_events beyond user deletion cascade.
- Whether the notification appears in every app (only the web target is named).
- How key rotation is run in production.
- Whether a lock cut can fire under the real database timeout settings (statement timeout value not read).

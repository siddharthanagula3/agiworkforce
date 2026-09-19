# SIEM event schema

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-18

The contract a receiver parses against. Two transports carry the same audit
trail and they do not carry it in the same shape, so each is specified
separately. `apps/web/lib/services/__tests__/audit-streaming-service.test.ts`
pins this document to the code: a field added, renamed or removed there fails
the test until this file matches.

Source of record: `public.enterprise_audit_events`, one row per audited act,
written by `recordAuditEvent` (`apps/web/lib/security-audit.ts`).

## Transport 1: streamed delivery

A signed POST from the platform to the workspace's endpoint, configured in the
console and drained by `drainAuditDestination`
(`apps/web/lib/services/audit-streaming-service.ts`).

### Envelope

| Field            | Type     | Notes                                           |
| ---------------- | -------- | ----------------------------------------------- |
| `schema`         | string   | Always `agiworkforce.enterprise-audit`.         |
| `schemaVersion`  | number   | Currently `1`. Additive changes keep it.        |
| `organizationId` | string   | The workspace every event in the batch is from. |
| `deliveredAt`    | string   | ISO 8601, the same value that is signed.        |
| `events`         | object[] | At most 100 events, oldest first.               |

### Event

Snake_case on this transport, because the rows are streamed as the database
holds them.

| Field             | Type           | Notes                                            |
| ----------------- | -------------- | ------------------------------------------------ |
| `schema_version`  | number         | Repeated per event, see "Why twice" below.       |
| `id`              | string         | UUID. The deduplication key.                     |
| `organization_id` | string         | UUID.                                            |
| `actor_user_id`   | string or null | Null when the platform acted, not a person.      |
| `surface`         | string         | Where the act happened: `web`, `cli`, and so on. |
| `action`          | string         | One of `AuditEventType`, see "Vocabulary".       |
| `resource_type`   | string         | What was acted on.                               |
| `resource_id`     | string or null | The instance, when there is one.                 |
| `outcome`         | string         | `success`, `failure` or `denied`.                |
| `severity`        | string         | `info`, `warning` or `critical`.                 |
| `metadata`        | object or null | Per-action detail, `AuditEventDetail`.           |
| `created_at`      | string         | ISO 8601, UTC.                                   |

**Why twice.** `schemaVersion` is on the envelope and `schema_version` on every
event, because a SIEM commonly splits the batch and stores each event on its
own. A version that lives only on the envelope is lost the moment the record is
separated from it, which is exactly when a field change becomes unreadable.

### Headers and signature

| Header                  | Value                         |
| ----------------------- | ----------------------------- |
| `Content-Type`          | `application/json`            |
| `X-AGI-Audit-Timestamp` | The envelope's `deliveredAt`. |
| `X-AGI-Audit-Signature` | `sha256=<hex>`                |

The signature is `HMAC-SHA256(secret, "<timestamp>.<body>")`. The timestamp is
inside the signed material rather than merely alongside it, so a captured
delivery cannot be replayed later under a fresh header. Reject a timestamp
outside your tolerance. Verify in constant time. The shared secret is shown
once when the destination is saved. Its fingerprint is stored as a hash; the
key needed for delivery is retained only as workspace-bound authenticated
ciphertext.

Header values are asserted printable ASCII before the request is built
(`auditDeliveryHeaders`), so a value carrying a carriage return refuses the
delivery instead of splitting the request at an intermediary.

### Delivery semantics

At least once, never fewer. Deduplicate on the event `id`.

- **Batch:** up to 100 events per POST (`AUDIT_STREAM_BATCH`), oldest first.
- **Body ceiling:** 1000000 bytes (`AUDIT_STREAM_MAX_BODY_BYTES`). A batch that
  would exceed it is shortened, never trimmed of events: the remainder goes in
  the next delivery. A single event larger than the whole ceiling is sent alone
  rather than dropped.
- **Cursor:** `(created_at, id)`, advanced only on a 2xx, and only as far as the
  last event actually sent. Every other answer, including a network failure and
  a timeout, holds it, so the same events are offered again on the next drain.
  Nothing is discarded because delivery failed.
- **Timeout:** 10 seconds per attempt.
- **Backlog:** what a down receiver is holding is reported by
  `auditStreamContinuity` and alerts after 60 minutes behind.
- **Failure ceiling:** after 20 consecutive failures the destination is skipped
  for the run so one dead endpoint cannot starve the others. It is not disabled,
  and its backlog is still retained. Save the destination again to resume.

## Transport 2: JSONL export

`GET /api/settings/organization/audit/export` streams the trail as
`application/x-ndjson`, one event per line, newest first, gated on the
`audit_export` policy resource. Reading the trail is itself recorded as a
`data_exported` event before the stream opens.

The export is camelCase and has no envelope, because each line stands alone.

| Field            | Type           |
| ---------------- | -------------- |
| `id`             | string         |
| `organizationId` | string         |
| `actorUserId`    | string or null |
| `surface`        | string         |
| `action`         | string         |
| `resourceType`   | string         |
| `resourceId`     | string or null |
| `outcome`        | string         |
| `severity`       | string         |
| `metadata`       | object         |
| `createdAt`      | string         |

`metadata` is `{}` rather than null on this transport.

## Vocabulary

`action` is one value of the `AuditEventType` union in
`apps/web/lib/security-audit.ts`, which is the only place the set is declared.
It is not repeated here: a second copy is a second source of truth, and the
values a given workspace has actually produced are what
`/api/settings/organization/audit/facets` returns for it.

`metadata` keys are the optional fields of `AuditEventDetail` in the same file.
Treat both sets as open: a new action or key is an additive change and keeps
`schemaVersion` at 1.

## What is not covered

Per-tool activity is recorded as `tool_executed` on the acts that reach the
audit trail; there is no separate hosted per-tool journal, and this document
does not claim one.

# Domain events

Status: Current
Owner: Platform lead
Last updated: 2026-09-20

Every durable event the product raises, with the module that writes it, what its
payload may carry, who reads it and how long the record is kept. The table is
pinned by `packages/contracts/cloud-contracts/src/__tests__/domain-events.test.ts`
against `DOMAIN_EVENTS`, so an event added to the catalogue without a row here
fails that test rather than going undocumented.

## The name

`<namespace>.<object>.<verb>`, all lower case, with the verb drawn from
`DOMAIN_EVENT_VERBS`. The closed verb set is what makes the convention
checkable: `deleted` and `removed` are the same event and only one of them is a
name. `domainEventName()` is the only way to mint one and throws on anything
else.

## The envelope

`DomainEventEnvelopeSchema` is the stored shape. Beyond the name and the
subject it carries:

- `correlationId` joins the event to the operation that produced it, and
  `causationId` to the event that produced it, so a chain is reconstructable
  from storage alone.
- `retentionClass` and `dataClass` are read from the catalogue by
  `createDomainEventEnvelope()`, never passed in by the producer. A producer
  that chose its own retention would be choosing how long its own mistakes are
  kept.
- `dedupeKey` is what a consumer stores to answer "have I already handled
  this". It defaults to the event id; a producer that may legitimately re-raise
  an event supplies a key of its own so a retry and a re-raise are told apart.

Producers mint envelopes with `createDomainEventEnvelope()`. Nothing else may
build one: the builder is where the catalogue's retention and classification
reach the record.

## Immutability

An event is written once. `domainEventFingerprint()` is a stable serialization
of everything the envelope asserts, insensitive to key order and to absent
optional fields, and `assertDomainEventUnchanged()` is what a store calls on a
second delivery of an id it already holds. An identical fingerprint is a
redelivery to drop; a different one is a producer bug and is refused rather than
silently overwriting what consumers have already read.

## Idempotent consumption

A consumer keeps the `dedupeKey` of everything it has handled and drops a
repeat. The key is stable across redeliveries of the same event, which is what
makes at-least-once delivery safe to build on. `apps/web/lib/server/idempotency.ts`
is the same contract at the HTTP edge.

## Data classification

`dataClass` says what the payload may carry, which is what decides where a copy
of the event may go.

| class      | the payload may carry                                  | a sink must be cleared for      |
| ---------- | ------------------------------------------------------ | ------------------------------- |
| `none`     | identifiers, timestamps and enumerated states          | nothing beyond operational data |
| `account`  | account-level attributes such as plan, credits or role | account data                    |
| `personal` | data identifying a person                              | personal data                   |
| `content`  | text or files a user authored                          | user content                    |

`piiFields` names the envelope and payload keys that identify a person. The
only envelope field that always does is `actor.userId`; a subject id identifies
the object, which for these events is a conversation, a workspace or an audit
record. Anything further is a payload key the event is required to carry and is
named as one.

## Consumers

`DOMAIN_EVENT_CONSUMERS` is the closed set of sinks. A sink not named on an
event must not read it.

| consumer            | what it is                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| `audit-log`         | the tenant-visible audit trail; every consequential event owes it a record |
| `siem-export`       | the enterprise SIEM feed, for security-relevant events                     |
| `product-analytics` | consented product measurement                                              |
| `notifications`     | anything that raises a notification for an account                         |
| `read-model`        | a projection the product reads back                                        |

## Retention

`retentionClass` is the audit vocabulary from `@agiworkforce/types`
(`AUDIT_RETENTION_CLASSES`), not a second one: `operational` is the only class a
retention sweep may shorten, and `AUDIT_RETENTION_RULES` holds the minimum days
for each. A consequential event is never `operational`.

## Version migration

`DOMAIN_EVENT_SCHEMA_VERSION` is the shape stored rows are written against, and
the envelope pins `schemaVersion` to it. A reader that meets a higher version
refuses the row rather than interpreting it, which is why the schema uses a
literal rather than a range.

Raising the version is a two-step change, never a rewrite of stored rows:

1. Add the new field as optional, raise `DOMAIN_EVENT_SCHEMA_VERSION`, and
   widen the envelope's `schemaVersion` to accept both. Producers start writing
   the new version; consumers handle both.
2. Once no row of the old version remains inside the longest retention class in
   use, narrow `schemaVersion` back to a literal and make the field required.

Stored events are immutable, so a migration never backfills them. A field that
old rows cannot supply stays optional for as long as those rows are kept.

## The catalogue

| event                          | concept           | consequential | data class | PII fields                             | retention   | consumers              |
| ------------------------------ | ----------------- | ------------- | ---------- | -------------------------------------- | ----------- | ---------------------- |
| `chat.conversation.created`    | conversation      | no            | content    | `actor.userId`                         | operational | read-model             |
| `chat.conversation.archived`   | conversation      | yes           | none       | none                                   | security    | audit-log              |
| `chat.conversation.deleted`    | conversation      | yes           | none       | none                                   | security    | audit-log              |
| `chat.conversation.restored`   | conversation      | yes           | none       | none                                   | security    | audit-log              |
| `chat.conversation.purged`     | conversation      | yes           | none       | none                                   | compliance  | audit-log              |
| `chat.message.created`         | message           | no            | content    | `actor.userId`                         | operational | read-model             |
| `project.project.created`      | project           | no            | content    | `actor.userId`                         | operational | read-model             |
| `project.project.deleted`      | project           | yes           | none       | none                                   | security    | audit-log              |
| `project.knowledge.created`    | project           | no            | content    | `actor.userId`                         | operational | read-model             |
| `memory.entry.created`         | memory            | no            | content    | `actor.userId`                         | operational | read-model             |
| `memory.entry.deleted`         | memory            | yes           | none       | none                                   | security    | audit-log              |
| `schedule.run.started`         | schedule          | no            | none       | none                                   | operational | read-model             |
| `schedule.run.completed`       | schedule          | no            | none       | none                                   | operational | read-model             |
| `schedule.run.failed`          | schedule          | yes           | none       | none                                   | security    | audit-log              |
| `skill.install.completed`      | skill             | yes           | none       | none                                   | security    | audit-log, siem-export |
| `connector.grant.granted`      | connector         | yes           | none       | none                                   | security    | audit-log, siem-export |
| `connector.grant.revoked`      | connector         | yes           | none       | none                                   | security    | audit-log, siem-export |
| `artifact.version.created`     | artifact          | no            | content    | `actor.userId`                         | operational | read-model             |
| `artifact.share.published`     | artifact          | yes           | none       | none                                   | security    | audit-log, siem-export |
| `workspace.member.granted`     | workspace         | yes           | personal   | `actor.userId`, `payload.memberUserId` | compliance  | audit-log, siem-export |
| `workspace.member.revoked`     | workspace         | yes           | personal   | `actor.userId`, `payload.memberUserId` | compliance  | audit-log, siem-export |
| `workspace.policy.changed`     | workspace         | yes           | none       | none                                   | security    | audit-log, siem-export |
| `billing.subscription.changed` | subscription      | yes           | account    | `actor.userId`                         | compliance  | audit-log              |
| `billing.credits.exceeded`     | credit-bucket     | yes           | account    | `actor.userId`                         | security    | audit-log              |
| `billing.reservation.resolved` | usage-reservation | no            | account    | `actor.userId`                         | operational | read-model             |
| `identity.session.started`     | audit-event       | yes           | personal   | `actor.userId`, `payload.ipAddress`    | compliance  | audit-log, siem-export |
| `identity.session.completed`   | audit-event       | yes           | personal   | `actor.userId`, `payload.ipAddress`    | compliance  | audit-log, siem-export |
| `identity.data.exported`       | audit-event       | yes           | personal   | `actor.userId`, `payload.ipAddress`    | compliance  | audit-log, siem-export |
| `trust.egress.approved`        | audit-event       | yes           | none       | none                                   | security    | audit-log, siem-export |
| `trust.egress.denied`          | audit-event       | yes           | none       | none                                   | security    | audit-log, siem-export |

Owners by namespace are in `DOMAIN_EVENT_OWNERS`: `chat`, `project`, `memory`,
`schedule`, `skill`, `connector`, `artifact` and `workspace` are written by
`apps/web/lib/services`, `billing` by `apps/web/lib/server/payments`, `identity`
by `apps/web/lib/identity` and `trust` by `apps/web/lib/security`. Each is a
path rather than a team name, so a rename fails the test instead of leaving a
reader with a name nobody answers to.

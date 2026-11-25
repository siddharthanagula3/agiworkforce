---
id: "F101-02"
type: "feature"
title: "Shared events, notifications, content blocks, errors and identifiers"
aliases: ["domain events", "audit domain events", "content blocks", "MESSAGE_KINDS", "error taxonomy", "identifier contract", "notification categories", "S101.02", "S101.03", "S101.04", "S101.05", "S101.27"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.02", "S101.03", "S101.04", "S101.05", "S101.27"]
depends_on: ["SYS-observability-and-operations", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "F101-01", "file:packages/contracts/types/src/error-taxonomy.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-02 Shared events, notifications, content blocks, errors and identifiers

One shared vocabulary for durable event names, message content-block kinds, error codes with classes and retry rules, primary-key rules and notification categories. Guards check emitters, block readers, error use and key names. The brief's error-definition cites point to a 31-line file; the real owner is error-taxonomy.ts.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.02](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10102), [S101.03](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10103), [S101.04](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10104), [S101.05](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10105), [S101.27](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10127).

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

**What it does.** Defines names once: domain events as namespace.object.verb (packages/contracts/cloud-contracts/src/domain-events.ts:20-61), message block kinds (packages/contracts/types/src/conversation.ts:15), error classes with a retry flag (packages/contracts/types/src/error-taxonomy.ts:15-58), key rules (packages/contracts/types/src/identifier-contract.json) and notification categories (packages/contracts/types/src/notifications.ts:11).

**Why it exists.** Without one list each app names things its own way, and a new block kind reaches an old build as an empty bubble. The code says a kind added to the list reaches an older build as an unknown block it degrades (packages/contracts/types/src/conversation.ts:9-14).

**Who uses it.** Engineers; the web audit pipeline; Web, Desktop, Mobile, Chrome and VS Code renderers; the Mobile notification feed.

**Problems it solves**

- Two names for the same event (a closed verb list makes synonyms impossible, packages/contracts/cloud-contracts/src/domain-events.ts:10-19)
- Unknown content blocks dropped silently
- A storage outage and a defect arriving as one status (packages/contracts/types/src/error-taxonomy.ts:1-6)
- Primary keys that encode a name, address or file name (packages/contracts/types/src/identifier-contract.ts:1-9)

**Use cases**

- A workspace admin removes a member; the audit event member_removed becomes workspace.member.revoked (apps/web/lib/audit-domain-events.ts:25)
- A model replies with a block an old Chrome build cannot draw; the client lists it among unknownBlocks and degrades it (packages/contracts/types/src/client-capability-manifest.ts:145-164)
- A request fails with a class that says 'not retryable'; the client reads the flag instead of guessing (packages/contracts/types/src/error-taxonomy.ts:87)
- A Mobile user opens the notification feed and each row carries a shared category and severity (packages/contracts/cloud-contracts/src/notifications.ts:9-18)

## 2. User experience

**Where to find it**

- Mobile: the notification feed (apps/mobile/src/features/notifications/accountFeed.ts) and the screen exported as NotificationPreferencesScreen (apps/mobile/src/features/settings/notifications/index.tsx:251). Its visible title was not found
- Every chat surface: message blocks (text, code, tool steps, sources) rendered by each app
- Chrome options page: no labels from this feature

**Before you start**

- Signed-in account for the Mobile account feed (apps/mobile/src/features/notifications/accountFeed.ts:28-40)

**Screens and controls**

- Mobile notification preferences group push switches as chat_replies, tasks, scheduled_tasks, research, code, product_updates, product and usage_resets; these are not the shared categories (apps/mobile/stores/notificationPrefsStore.ts:16-39)
- The account feed files rows under shared categories: general, agent_run, schedule, media, research, connector, device, security, billing (packages/contracts/types/src/notifications.ts:11-21)

**Journey**

1. An event happens on the server (a member removed, a plan changed)
2. The audit record is mapped to a catalogued domain event name and carries domain_event fields (apps/web/lib/audit-domain-events.ts:66-75)
3. A chat turn streams blocks; each client renders the kinds it knows and degrades the others
4. A failure arrives with a code; the class says whether to retry and what to suggest
5. A notification row appears in the Mobile feed with a category, severity and link

**What the person sees and gets**

- Error messages built from class and message key (packages/contracts/types/src/error-taxonomy.ts:137)
- Notification rows with title, message, link and read state (packages/contracts/cloud-contracts/src/notifications.ts:9-18)

**Settings**

- Mobile push switches and quiet hours in apps/mobile/stores/notificationPrefsStore.ts
- Workspace audit streaming is a separate feature, not opened here

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Domain event names must be namespace.object.verb with a closed list of 20 verbs and 11 namespaces (packages/contracts/cloud-contracts/src/domain-events.ts:20-75)
- 15 audit event types map to catalogued event names; unmapped types or wrong outcomes return null (apps/web/lib/audit-domain-events.ts:17-34,48-52)
- check-domain-event-emitters reads the catalog and every module that mints envelopes (scripts/check-domain-event-emitters.mjs:1-8)
- Block kinds are one list; agent events map to a kind or null (packages/contracts/types/src/message-block-kinds.ts:6-36)
- Clients publish renderableBlocks and the server derives unknownBlocks (packages/contracts/types/src/client-capability-manifest.ts:40-59,145-164)
- check-content-blocks has no pending readers and requires reads of MESSAGE_KINDS, renderableBlocks and unknownBlocks (scripts/check-content-blocks.mjs:63,81)
- Error classes (23) carry retryable, providerDetail and suggestedAction; classify and retry functions exist (packages/contracts/types/src/error-taxonomy.ts:15-37,79-87)
- Retry decided by a client: the baseline lists none (scripts/check-error-model.baseline.json:2)
- Identifier contract is data read by a guard over migrations (packages/contracts/types/src/identifier-contract.ts:1-9,53; scripts/check-identifier-discipline.mjs:1-5)
- Mobile consumes NotificationFeedItemSchema and prunes rows (apps/mobile/src/features/notifications/accountFeed.ts:25,40)

**Incomplete**

- The brief cites apps/web/shared/lib/error-utils.ts:56,74,142 as the error definitions, but that file has 31 lines of timeout helpers (apps/web/shared/lib/error-utils.ts:1-31). The cite is stale; the owner is error-taxonomy.ts
- A search of apps and packages found no app code importing describeError, classifyErrorCode or isRetryableErrorCode; only error-taxonomy.ts and its tests use them. How each client maps errors is therefore not established
- Mobile push groups are a separate vocabulary from the shared categories (apps/mobile/stores/notificationPrefsStore.ts:14-16 comment)
- The audit map covers 15 event types; other audit event types emit no domain event [inferred from apps/web/lib/audit-domain-events.ts:17-34]

**Present but disconnected or switched off**

- Platform-specific renderers: the brief marks S101.33 not applicable on every app (doc: area-briefs/101-shared-package-boundaries.md S101.33)

**Not available**

- Per-app error definitions: not shown in the brief or found

## 4. Required behaviour

**Established requirements**

- Streamed and domain events are declared once and parsed through the same schema on every surface. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.02)
- Message content blocks come from one vocabulary that every client renders or degrades explicitly. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.03)
- Error codes, classes and retryability are defined once and every client maps them rather than inferring its own. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.04)
- Resource identifiers follow one contract applied to every primary key; ids are server-minted and clients carry them unchanged. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.05)
- Notifications use one shared category and target vocabulary on server and clients. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.27)
- A catalogued event that nothing emits is a recorded gap until something does. (source: scripts/check-domain-event-emitters.mjs:5-8)

**Acceptance criteria**

1. Minting an event name that breaks namespace.object.verb throws (packages/contracts/cloud-contracts/src/domain-events.ts:55-61)
2. An audit event of an unmapped type or outcome yields no domain event (apps/web/lib/audit-domain-events.ts:50)
3. A module that mints envelopes with a name not in the catalog fails check:domain-event-emitters
4. A client receiving a block kind it does not list renders a degraded block, covered by contentBlockDegradation.test.ts
5. A new error code with no class fails check:error-model
6. A new primary key named email, name, path, position or a provider id fails check:identifier-discipline
7. Mobile notification rows whose category is outside the shared list do not appear

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every client should read the retry flag from the class table, not from its own list [inferred from S101.04 and the error-model guard header scripts/check-error-model.mjs:1-6]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief's S101.04 code cites to error-taxonomy.ts
- [proposed] Add a guard that every app error path goes through describeError or an equivalent shared helper
- [proposed] Map Mobile push groups onto shared categories or document why they differ

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Domain event catalog | `packages/contracts/cloud-contracts/src/domain-events.ts` | Verbs, namespaces, DOMAIN_EVENTS, findDomainEvent, createDomainEventEnvelope |
| service | Audit to domain event map | `apps/web/lib/audit-domain-events.ts` | Maps 15 audit event types to catalogued names and builds envelopes |
| command | check:domain-event-emitters | `scripts/check-domain-event-emitters.mjs` | Checks emitters use catalogued names |
| schema | Message kinds | `packages/contracts/types/src/conversation.ts` | MESSAGE_KINDS block vocabulary and ConversationId brand |
| schema | Agent event to block kind map | `packages/contracts/types/src/message-block-kinds.ts` | messageKindForAgentEvent |
| schema | Client capability manifest | `packages/contracts/types/src/client-capability-manifest.ts` | renderableBlocks and unknownBlocks |
| command | check:content-blocks | `scripts/check-content-blocks.mjs` | Fails a client that restates the block list or ignores unknown kinds |
| component | Content block degradation test subject | `packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts` | Degradation test named by the guard |
| schema | Error taxonomy | `packages/contracts/types/src/error-taxonomy.ts` | Classes, retryable flag, describeError |
| config | Error taxonomy data | `packages/contracts/types/src/error-taxonomy.json` | Which codes belong to which class |
| command | check:error-model | `scripts/check-error-model.mjs` | Every code has one class; no client decides retry itself |
| config | Error model baseline | `scripts/check-error-model.baseline.json` | retryDecidedByClient list (empty) |
| schema | Identifier contract | `packages/contracts/types/src/identifier-contract.ts` | Forbidden key columns and exemptions as data |
| command | check:identifier-discipline | `scripts/check-identifier-discipline.mjs` | Reads every primary key from migrations and applies the rules |
| schema | Notification vocabulary | `packages/contracts/types/src/notifications.ts` | Categories, severities, target kinds |
| store | Mobile notification prefs | `apps/mobile/stores/notificationPrefsStore.ts` | Push preference groups, quiet hours |
| service | Mobile account feed | `apps/mobile/src/features/notifications/accountFeed.ts` | Fetch, validate and page the feed |
| service | Mobile streaming content handling | `apps/mobile/services/streaming.ts` | Reads stream events into blocks (brief cites line 620; not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A security audit event is recorded and mapped to a domain event envelope with a new event id | our servers | apps/web/lib/audit-domain-events.ts:48-64 |
| The audit row gets domain_event, domain_event_id and domain_event_data_class fields | our servers | apps/web/lib/audit-domain-events.ts:66-75 |
| A chat stream emits agent events; each maps to a block kind or none | our servers | packages/contracts/types/src/message-block-kinds.ts:6-36 |
| Each client renders kinds it supports and lists the rest as unknown | device | packages/contracts/types/src/client-capability-manifest.ts:145-164 |
| The Mobile feed is fetched, rows are validated and shown | device and our servers | apps/mobile/src/features/notifications/accountFeed.ts:28-40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audit row with domain event fields | audit store; table not opened for this page | unknown | unknown; retention class is carried on the event (packages/contracts/cloud-contracts/src/domain-events.ts:1-6 imports AUDIT_RETENTION_CLASSES) |
| Mobile push preferences | store:notificationPrefsStore (persisted with MMKV) | a push-preference sync test exists (apps/mobile/__tests__/push-preference-sync.test.ts); direction not opened | on device until cleared |

**Models and providers.** Event, block and error vocabularies are model and provider neutral in the files opened. Error classes hide provider detail or show only name and status (packages/contracts/types/src/error-taxonomy.ts:40-44,129-135).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile feed needs a signed-in account (apps/mobile/src/features/notifications/accountFeed.ts:28-40, via the account API client). The vocabularies need none. |
| Permissions | none found in the code for the vocabularies. |
| Subscription | Error class 'entitlement' signals the plan or seat does not carry a capability (packages/contracts/types/src/error-taxonomy.ts and error-taxonomy.json). Plan rules themselves are in F101-03. |
| Limits and metering | Feed page size 30 on Mobile and cap 100 on the wire (apps/mobile/src/features/notifications/accountFeed.ts:19; packages/contracts/cloud-contracts/src/notifications.ts:5). |
| Feature flags | none found in the code. |
| Model compatibility | Block kinds a model produces are mapped from agent events, not from model names (packages/contracts/types/src/message-block-kinds.ts:6-36). |
| Provider restrictions | none found in the code. |
| Local mode | Domain events come from the web server audit path, so Local chats emit none there [inferred from apps/web/lib/audit-domain-events.ts]. Block and error vocabularies apply to local sessions too, but a Local-mode reading was not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown block kind | Listed under unknownBlocks and degraded | packages/contracts/types/src/client-capability-manifest.ts:145-164 |
| Unknown error code | Classified as 'internal' | packages/contracts/types/src/error-taxonomy.ts:79-81 |
| Unmapped audit type or outcome | No domain event | apps/web/lib/audit-domain-events.ts:50 |
| Event name not in catalog | auditDomainEvent returns null | apps/web/lib/audit-domain-events.ts:51-52 |
| Invalid notification row | Silently filtered out | apps/mobile/src/features/notifications/accountFeed.ts:40 |
| Offline, timeout, accessibility of notification feed | not handled in the code for the vocabularies; screen behaviour not opened | searched packages/contracts/types/src/notifications.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/domain-events.test.ts`: Name convention, one verb per meaning, subjects from concept registry, lookup
- `packages/contracts/types/src/__tests__/error-taxonomy.test.ts`: Error taxonomy
- `packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts`: Degradation of unknown blocks
- `apps/mobile/__tests__/notificationPrefs.test.ts`: Mobile notification preferences
- `scripts/check-domain-event-emitters.test.mjs`: The emitter guard
- `scripts/check-content-blocks.test.mjs`: The content-block guard
- `scripts/check-error-model.test.mjs`: The error-model guard
- `scripts/check-identifier-discipline.test.mjs`: The identifier guard

**Test scenarios**

- **Member removal event**
  1. Remove a workspace member as admin
  2. Read the audit row
  - Expected: The row carries domain_event workspace.member.revoked
- **Unknown block**
  1. Send a block kind not in the client's renderable list
  - Expected: A degraded block appears, not an empty bubble
- **New error code**
  1. Add a code to the registry without a class
  2. Run the error-model guard
  - Expected: Guard fails
- **Bad key name**
  1. Add a migration with primary key named email
  2. Run the identifier guard
  - Expected: Guard fails
- **Mobile feed category**
  1. Open the Mobile notification feed with a mix of categories
  - Expected: Rows show; invalid ones are missing

**Where to look when it fails**

- Guard output from the scripts named above
- audit row fields domain_event and domain_event_id
- Mobile console for feed fetch failures (not opened)

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Client error mapping is not established: no app imports the taxonomy's describe, classify or retry functions** Affects: All apps. Evidence: Search of apps and packages found these names only in packages/contracts/types/src/error-taxonomy.ts and its tests. Work needed: Confirm how each client maps errors, or adopt the helpers
- **Brief cites a 31-line file for error definitions** Affects: Readers of the brief. Evidence: apps/web/shared/lib/error-utils.ts:1-31. Work needed: Correct the brief cites to error-taxonomy.ts
- **Mobile push groups differ from shared notification categories** Affects: Mobile notification preferences versus feed. Evidence: apps/mobile/stores/notificationPrefsStore.ts:14-16. Work needed: Document the mapping or align
- **Invalid feed rows are dropped without a signal** Affects: Mobile. Evidence: apps/mobile/src/features/notifications/accountFeed.ts:40. Work needed: Report dropped rows
- **Only 15 audit types map to domain events** Affects: Consumers of domain events. Evidence: apps/web/lib/audit-domain-events.ts:17-34. Work needed: Decide which other audit types need events

**Depends on**

- SYS-observability-and-operations
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- F101-01
- file:packages/contracts/types/src/error-taxonomy.ts

## Unknown

- Which audit table stores domain_event fields
- Visible title of the Mobile notification preferences screen
- How Web, Desktop, VS Code and Chrome map error codes to text
- Whether the guards pass today; nothing was run
- What apps/mobile/src/features/tasks/runPresentation.ts:1 and apps/mobile/services/streaming.ts:620 (brief cites) do with block kinds; not opened

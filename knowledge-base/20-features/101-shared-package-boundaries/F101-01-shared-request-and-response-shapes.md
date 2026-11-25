---
id: "F101-01"
type: "feature"
title: "Shared request and response shapes"
aliases: ["cloud-contracts", "@agiworkforce/cloud-contracts", "wire contracts", "shared request and response schemas", "golden fixtures", "S101.01", "S101.15", "S101.16", "S101.17", "S101.19", "S101.22", "S101.26", "S101.35"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.01", "S101.15", "S101.16", "S101.17", "S101.19", "S101.22", "S101.26", "S101.35"]
depends_on: ["SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "file:packages/contracts/cloud-contracts/src/index.ts", "file:scripts/check-route-shared-contracts.mjs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-01 Shared request and response shapes

A shared package of zod schemas (packages/contracts/cloud-contracts) names each request and response body once, so the server and the apps read the same shape. Golden JSON examples let the CLI's Rust code check itself against the same data. 141 client-called web routes still have no shared schema and sit on a shrinking baseline list.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.01](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10101), [S101.15](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10115), [S101.16](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10116), [S101.17](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10117), [S101.19](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10119), [S101.22](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10122), [S101.26](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10126), [S101.35](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10135).

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

**What it does.** Declares one schema per wire message (device sign-in, sync of chats, memory and projects, connectors, notifications, managed media, usage and billing figures) in shared packages, and guards that fail the build when a client-called route or a Rust client drifts from them (packages/contracts/cloud-contracts/src/device-authorization.ts:9; scripts/check-route-shared-contracts.mjs:1; scripts/check-cli-wire-parity.mjs:28).

**Why it exists.** Two sides that each write their own copy of a body shape disagree after the first change on either side. The route guard says only a schema both sides import survives such a change (scripts/lib/route-shared-contracts.mjs:1-8). The architecture overview has a 'Shared Contracts' section and says to read from shared contracts instead of surface-local copies (doc: docs/architecture/overview.md:31,108).

**Who uses it.** Engineers who add or change an API field; the web server routes; the Web, Desktop, Mobile, Chrome and VS Code TypeScript clients; the Rust CLI through its own struct mirrors. End users never touch it.

**Problems it solves**

- A server field rename silently breaking a client
- Rust CLI structs that drift from the TypeScript schema (scripts/check-cli-wire-parity.mjs:28)
- Clients that guess at a body that does not match
- New client-called routes shipped without a shared contract (scripts/check-route-shared-contracts.mjs:30-46)

**Use cases**

- An engineer adds a field to a sync schema in packages/contracts/cloud-contracts/src/sync.ts and the CLI parity guard shows which Rust struct must follow
- A new device signs in: the start, token, refresh and approve bodies are all read through device-authorization.ts
- A tester opens a project, the file list or the connector list on Mobile and a mismatched body appears as an error on that screen [inferred]
- The CLI test reads the golden chat, memory, projects, media and /api/me JSON and fails if its structs change the wire form (apps/cli/src/cloud/contract_fixtures.rs:44-95)

## 2. User experience

**Where to find it**

- No screen. The shapes sit under every app. The Web approval page at apps/web/app/auth/device/page.tsx titled 'Connect a device.' is one place a person meets a shape (packages/ui/i18n/locales/en/auth.json, auth:device.title)
- Mobile notification list reads NotificationFeedItemSchema (apps/mobile/src/features/notifications/accountFeed.ts:25)

**Before you start**

- None for a person. An engineer needs the repo and the guard scripts (package.json check:route-shared-contracts, check:cli-wire-parity, check:protocol-types)

**Screens and controls**

- Device approval page: code field labelled 'Device code', button 'Approve device' (packages/ui/i18n/locales/en/auth.json, auth:device.codeLabel and auth:device.approve)
- Other screens that show shapes (projects, files, connectors, usage) were not opened for this page; their labels are unknown

**Journey**

1. An engineer edits a schema in packages/contracts/cloud-contracts/src
2. The server route and each client import the same schema
3. The engineer runs the route guard, CLI wire parity guard and protocol-type check
4. A person then uses the screen; a body that fails the schema surfaces as the screen's error state [inferred]

**What the person sees and gets**

- Guard output lists each client-called route with no shared contract and each stale baseline row (scripts/check-route-shared-contracts.mjs:30-46)
- A mismatched body shows as an error on the screen that read it [inferred]

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Device sign-in schemas exist for start, lookup, token, refresh request, refresh and approve (packages/contracts/cloud-contracts/src/device-authorization.ts:9-83)
- Notification feed schemas exist and Mobile parses each row with them (packages/contracts/cloud-contracts/src/notifications.ts:9-33; apps/mobile/src/features/notifications/accountFeed.ts:25,40)
- Sync, project, memory and artifact-index schemas exist (packages/contracts/cloud-contracts/src/sync.ts:117,315,383; packages/contracts/cloud-contracts/src/artifact-index.ts)
- The bank-accounts link and exchange routes now import their request schemas from cloud-contracts (apps/web/app/api/connectors/bank-accounts/link/route.ts:6-9; apps/web/app/api/connectors/bank-accounts/exchange/route.ts:6-9; packages/contracts/cloud-contracts/src/bank-accounts.ts:13-30)
- The CLI test reads four golden files and round-trips them through its Rust structs (apps/cli/src/cloud/contract_fixtures.rs:44-95)
- check-cli-wire-parity pairs CLI structs for memory, projects and artifacts with TS schemas, marked 'sends' or 'reads' (scripts/check-cli-wire-parity.mjs:28-160)
- check-protocol-types compares Rust and hand-written TS mirrors, including billing catalog and usage history owners (scripts/check-protocol-types.mjs:1-5,218)
- Usage figures are typed in packages/contracts/types/src/account-usage-wire.ts:8-71
- The file model has origins, storage tiers and parse statuses in packages/contracts/types/src/file-reference.ts:40-51, guarded by scripts/check-file-reference-canonical.mjs:1

**Incomplete**

- 141 client-called routes are listed in the baseline as having no shared contract: settings 45, admin 30, developers 8, billing 6, media 6, code 5, skills 5 and smaller families (scripts/config/route-shared-contracts-baseline.json, counted from the file). The brief says 164 (doc: area-briefs/101-shared-package-boundaries.md S101.01); the file is newer and wins
- The device-authorization token, refresh and approve routes import only types from cloud-contracts (apps/web/app/api/auth/device/token/route.ts:6; refresh/route.ts:5; approve/route.ts:5), so whether they parse their own output at runtime is not shown [inferred]
- Usage and billing models live in packages/contracts/types, not cloud-contracts, and are checked against Rust by the protocol check (scripts/check-protocol-types.mjs:218), not by the golden files
- Mobile drops a notification row that fails its schema instead of failing (apps/mobile/src/features/notifications/accountFeed.ts:40)
- parseConnectorPolicy returns null, meaning ungoverned, when the body cannot be read (packages/client/client-runtime/src/connectors/parse.ts:76-81)

**Present but disconnected or switched off**

- The golden file cloud-history-pages.golden.json is not read by the CLI test (apps/cli/src/cloud/contract_fixtures.rs:44-95; packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json). Which test reads it is unknown

**Not available**

- A TypeScript test that reads the cloud-contracts golden files was not found by search; only the CLI Rust test, the CLI skills test and a skills package test reference *.golden.json files (search of apps, packages, scripts)

## 4. Required behaviour

**Established requirements**

- Client-called API routes and every client parse request and response bodies with one shared schema package. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.01)
- Project, file or Library, artifact, memory, connector and usage or billing records each use one shared model on the server and every client. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.15, S101.16, S101.17, S101.19, S101.22, S101.26)
- Wire contracts have shared golden fixtures that the server, the TypeScript clients and Rust are all tested against. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.35)
- A baselined route leaves the list when it imports a shared contract, and the list only shrinks. (source: scripts/check-route-shared-contracts.mjs:3-8)
- Shared contracts are used instead of surface-local copies. (source: (doc: docs/architecture/overview.md:108))

**Acceptance criteria**

1. A client-called route that imports no shared contract and is not in the baseline fails check:route-shared-contracts
2. A baseline route that now imports a shared contract makes the same check fail until it is removed from the list
3. Changing a field in a golden sync fixture makes the CLI test in contract_fixtures.rs fail
4. A device token body with an unknown error name fails DeviceTokenErrorSchema and the client treats it as a failure, not as pending (packages/client/client-runtime/src/deviceAuthorization.ts:96-135)
5. Adding a shared schema field and not updating the matching Rust struct fails check:cli-wire-parity
6. Mobile shows no notification row whose body fails NotificationFeedItemSchema

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plan limits are not part of these shapes; they come from plan code covered by F101-03 [inferred]
- A body that does not match should fail the screen with an error; Mobile and the connector parser currently skip or relax instead (see gaps) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a TypeScript test that parses each cloud-contracts golden file with its schema, so server and TS clients are covered as S101.35 requires
- [proposed] Have the device token, refresh and approve routes parse their output with the shared schema
- [proposed] Report dropped notification rows to telemetry so a schema drift is visible

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Device authorization schemas | `packages/contracts/cloud-contracts/src/device-authorization.ts` | Start, lookup, token, error, refresh and approve bodies for device sign-in |
| schema | Notification feed schemas | `packages/contracts/cloud-contracts/src/notifications.ts` | Feed item, feed response and mark-read bodies |
| schema | Sync schemas | `packages/contracts/cloud-contracts/src/sync.ts` | Conversation, message, memory and project deltas, push and pull bodies, cursors |
| schema | Bank accounts schemas | `packages/contracts/cloud-contracts/src/bank-accounts.ts` | Link and exchange request and response bodies for the bank connector |
| schema | Connector schemas | `packages/contracts/cloud-contracts/src/connectors.ts` | Connector policy, tool grants and connector bodies used by server and clients |
| schema | Account usage wire types | `packages/contracts/types/src/account-usage-wire.ts` | Usage totals, history and limits figures |
| schema | File reference model | `packages/contracts/types/src/file-reference.ts` | One description of a file: origin, storage tier, parse status |
| config | Golden fixtures | `packages/contracts/cloud-contracts/src/__fixtures__` | Five golden JSON files: chat and memory sync, cloud history pages, managed media requests, /api/me response, projects sync |
| test | CLI golden contract test | `apps/cli/src/cloud/contract_fixtures.rs` | Round-trips CLI requests and reads golden responses |
| command | check:route-shared-contracts | `scripts/check-route-shared-contracts.mjs` | Fails a client-called route with no shared contract import |
| config | Route contract baseline | `scripts/config/route-shared-contracts-baseline.json` | The 141 routes allowed to lack a shared contract |
| command | check:cli-wire-parity | `scripts/check-cli-wire-parity.mjs` | Pairs Rust CLI structs with TS schemas and checks sends or reads direction |
| command | check:protocol-types | `scripts/check-protocol-types.mjs` | Cross-language parity for protocol, billing and usage mirrors |
| command | check:file-reference-canonical | `scripts/check-file-reference-canonical.mjs` | Guards the single file description and the single text-size cap |
| endpoint | Device authorization routes | `apps/web/app/api/auth/device/code/route.ts` | Server side of start and lookup; token, refresh and approve routes sit beside it |
| service | Mobile account feed | `apps/mobile/src/features/notifications/accountFeed.ts` | Fetches and parses the notification feed with the shared schema |
| service | Connector response parsers | `packages/client/client-runtime/src/connectors/parse.ts` | Client parsing of connector policy, permissions and OAuth start bodies |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| An engineer changes a schema in cloud-contracts and the route and clients import it | device | packages/contracts/cloud-contracts/src/device-authorization.ts:9; apps/web/app/api/auth/device/code/route.ts:7 |
| The guard scans web, mobile, desktop and extension source for client-called routes and checks each imports a shared contract package | device | scripts/lib/route-shared-contracts.mjs:14-38 |
| At run time a client sends a request and parses the server body with the shared schema (device sign-in example) | device and our servers | packages/client/client-runtime/src/deviceAuthorization.ts:62-135 |
| The CLI Rust code serializes its request structs; the test compares them with the golden JSON | device | apps/cli/src/cloud/contract_fixtures.rs:19-52 |
| Mobile parses each notification row and keeps only the rows that pass | device | apps/mobile/src/features/notifications/accountFeed.ts:25,40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Schemas and golden fixtures (code, not user data) | packages/contracts/cloud-contracts/src | no; shipped with each build | kept in git |
| Route baseline list | scripts/config/route-shared-contracts-baseline.json | no | may only shrink (scripts/check-route-shared-contracts.mjs:3-8) |

**Models and providers.** The schemas carry model and provider names as plain strings or enums owned elsewhere. None of the files opened for this feature choose a model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The schemas need none. The routes that use them need a signed-in account, except device sign-in start and token, which come before sign-in (packages/client/client-runtime/src/deviceAuthorization.ts:62-96). |
| Permissions | none found in the code for the schema package itself; route checks sit in each route. |
| Subscription | none found in the code for the schemas. Usage figures they carry come from the subscription system (SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | Notification feed page cap is 100 (packages/contracts/cloud-contracts/src/notifications.ts:5). SSE-like limits are in F101-04. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | The device approval page says Local Mode remains local and needs no account access (packages/ui/i18n/locales/en/auth.json, auth:device.cloudNoteBody). The CLI test covers only Cloud wire calls (apps/cli/src/cloud/contract_fixtures.rs:1-8). Anything beyond that for Local mode: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unparseable device start body | Client throws 'AGI Cloud returned an invalid device authorization.' | packages/client/client-runtime/src/deviceAuthorization.ts:70-72 |
| Notification row fails schema | Row is dropped without an error | apps/mobile/src/features/notifications/accountFeed.ts:40 |
| Connector policy unreadable | Treated as ungoverned, not denied; server still enforces | packages/client/client-runtime/src/connectors/parse.ts:76-81; scripts/config/workspace-policy-enforcement-baseline.json:9 |
| New route called by a client with no schema | Guard fails the build | scripts/check-route-shared-contracts.mjs:30-38 |
| Route no longer called | Baseline row is stale and must be removed | scripts/check-route-shared-contracts.mjs:40-46 |
| Offline, retry, cancel, timeout, accessibility | not handled in the code for the schema package; screens handle them | packages/contracts/cloud-contracts/src (searched, no such logic) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/device-authorization.test.ts`: Start reply, every refusal name, bearer credential shape
- `packages/contracts/cloud-contracts/src/__tests__/sync.test.ts`: Sync schema behaviour
- `packages/contracts/cloud-contracts/src/__tests__/connectors.test.ts`: Connector schemas
- `packages/contracts/cloud-contracts/src/__tests__/artifact-index.test.ts`: Artifact index schema
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Managed media schemas
- `packages/contracts/cloud-contracts/src/__tests__/me.test.ts`: The /api/me body
- `packages/client/sync/src/__tests__/fixtures.test.ts`: Sync client against its own __fixtures__ (cursor-compare, pull-apply, push-body)
- `scripts/check-route-shared-contracts.test.mjs`: The route contract guard
- `scripts/check-cli-wire-parity.test.mjs`: The CLI wire parity guard
- `scripts/check-protocol-types.test.mjs`: The protocol parity guard
- `apps/cli/src/cloud/contract_fixtures.rs`: CLI requests and responses against golden JSON

**Test scenarios**

- **Route without a contract**
  1. Add a client call to a new /api route in a web feature file
  2. Run the route contract guard
  - Expected: Guard names the route and asks for a shared schema import
- **Golden drift in the CLI**
  1. Change a field name in projects-sync-cas.golden.json
  2. Run the CLI contract_fixtures tests
  - Expected: The CLI test fails at the changed path
- **Device refusal parsing**
  1. Feed the token client a body with an unknown error name
  - Expected: The result is a failure, not pending
- **Bad notification row**
  1. Serve a feed with one row missing its category on Mobile
  - Expected: That row is absent from the list; others show
- **Stale baseline**
  1. Make a baselined route import a shared schema
  2. Run the route guard
  - Expected: Guard asks to remove the baseline row

**Where to look when it fails**

- Guard output from scripts/check-route-shared-contracts.mjs
- Zod issue paths in client console
- CLI test failure text 'differs from the golden request' (apps/cli/src/cloud/contract_fixtures.rs:33)

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **141 client-called routes have no shared schema** Affects: All apps that call settings, admin, developers, billing, media, code and skills routes. Evidence: scripts/config/route-shared-contracts-baseline.json. Work needed: Move each body schema into a shared package and delete the baseline row
- **No TypeScript test reads the cloud-contracts golden files, so S101.35 covers Rust only as far as found** Affects: Server and TS clients. Evidence: Search for *.golden.json found only CLI and skills tests. Work needed: Add parse tests for each golden file with its schema
- **cloud-history-pages golden file has no reader found** Affects: CLI history reads. Evidence: apps/cli/src/cloud/contract_fixtures.rs:44-95. Work needed: Wire it into a test or remove it
- **Usage and billing models are checked by the protocol parity check, not by golden fixtures** Affects: CLI and web usage screens. Evidence: scripts/check-protocol-types.mjs:218. Work needed: Add golden usage fixtures or accept the parity check as the evidence
- **Tolerant parsing: Mobile drops bad feed rows; connector policy parse returns ungoverned** Affects: Mobile notifications; connector policy display on clients. Evidence: apps/mobile/src/features/notifications/accountFeed.ts:40; packages/client/client-runtime/src/connectors/parse.ts:76-81. Work needed: Decide per case whether to fail visibly
- **The brief's count (164) and the repository baseline (141) differ** Affects: Reports that quote the brief. Evidence: scripts/config/route-shared-contracts-baseline.json. Work needed: Update the brief

**Depends on**

- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- file:packages/contracts/cloud-contracts/src/index.ts
- file:scripts/check-route-shared-contracts.mjs

## Unknown

- Whether the device token, refresh and approve routes parse their own output at run time
- Whether any TypeScript test reads the cloud-contracts golden files under another name
- Whether the guards pass today; nothing was run
- What screens show when a project, file or connector body fails its schema; those screens were not opened
- The Chrome and VS Code surfaces' error text for a mismatched body
- Which test reads cloud-history-pages.golden.json

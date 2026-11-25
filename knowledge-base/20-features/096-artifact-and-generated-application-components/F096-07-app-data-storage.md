---
id: "F096-07"
type: "feature"
title: "App data storage"
aliases: ["Artifact data store (S96.17)", "App data storage", "published_artifact_storage", "window.agi.storage", "saved data in published apps", "artifact runtime storage route"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.17"]
depends_on: ["F096-09", "F096-08", "SYS-files-artifacts-and-storage", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-execution-boundaries", "surface:web", "mode:cloud", "table:published_artifact_storage", "table:published_artifacts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-07 App data storage

A published HTML or React app on the web can keep small text key-value data between visits, either private to one signed-in viewer or shared by everyone who can open the app. The server enforces key rules, size limits and who may read or write. Only the web app runs this.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.17](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9617).

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

**What it does.** Gives a published HTML or React app four calls, get, set, delete and list, on window.agi.storage. Each call reaches the server, which saves text rows in the table published_artifact_storage. Personal rows belong to one signed-in viewer. Shared rows are visible to everyone who may open the app (infrastructure/sandbox/index.html:283, apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:78, apps/web/db/neon/0325_published_artifact_storage.sql:3).

**Why it exists.** A generated page has no backend of its own. Without a platform store, a to-do list, a score board or a poll would forget everything on reload. The migration comment says the table holds 'Key-value text a published HTML or React artifact keeps between visits' (apps/web/db/neon/0325_published_artifact_storage.sql:130).

**Who uses it.** Two people. The app author writes code that calls window.agi.storage, usually by asking the assistant to build it. The viewer opens the published link, signs in and sees their saved state next time. The publisher can also inspect and clear the shared data in the Sites page (apps/web/features/sites/components/SiteDataTab.tsx:231).

**Problems it solves**

- Published pages lose state on reload.
- Authors cannot run a database for a small generated app.
- Viewers cannot keep private data in a shared app without it leaking to other viewers.
- One viewer or app cannot fill the database without bound (value and per-scope size limits).

**Use cases**

- A habit tracker app keeps each viewer's checkmarks as personal data.
- A team poll keeps vote counts as shared data.
- A notes app saves a draft as JSON text under one key.
- The owner opens Sites, Data and clears shared data after a bad test.

## 2. User experience

**Where to find it**

- Web only. There is no menu item. The storage is used by the code inside a published HTML or React app opened at /shared-artifact/<token> (apps/web/app/shared-artifact/[token]/page.tsx:62).
- Web, owner view: sidebar entry 'Sites' (apps/web/shared/components/layout/app-nav-items.ts:125), open a site, tab 'Data' (apps/web/features/sites/components/SiteDetail.tsx:280).
- Desktop, mobile, CLI, VS Code and Chrome: no runtime. A published app opens in the system browser, where the web page serves it (doc: docs/product/surface-feature-matrix.md:405-409).

**Before you start**

- The artifact is published and its kind is html or react (apps/web/db/neon/0372_published_site_viewers.sql:72).
- The viewer is signed in. A signed-out viewer gets a banner 'Create an account or sign in to use this app's AI and saved data.' with buttons 'Create an account' and 'Sign in' (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:274).
- The sandbox origin must be configured. The runtime bridge lives in the sandbox page (infrastructure/sandbox/index.html:242, apps/web/lib/artifact-sandbox.ts:158). A known-flaws row says production did not set NEXT_PUBLIC_SANDBOX_ORIGIN when it was written (audit/registers/known-flaws.md:57). Current setting is unknown.
- The viewer can open the app: public, own app, shared with a workspace they can read, or invited by email (apps/web/db/neon/0395_published_artifact_audience_revocation.sql:72).

**Screens and controls**

- No screen for the viewer. The app's own code decides what to show.
- Sites page, Data tab: heading 'Shared data', text 'Saved by the app for every visitor to see.', a size summary, table columns Key, Value, Size, Updated, button 'Clear shared data' (disabled when empty), empty text 'Nothing shared yet.' (apps/web/features/sites/components/SiteDataTab.tsx:241).
- For other app kinds the Data tab says 'Only apps built as HTML or React can save data between visits.' (apps/web/features/sites/components/SiteDataTab.tsx:231).

**Journey**

1. The author publishes an HTML or React artifact (see F096-09).
2. The viewer opens the link and signs in if the app needs saved data.
3. The app calls window.agi.storage.set(name, jsonText, shared). Values must be text, so objects need JSON.stringify (infrastructure/sandbox/index.html:289).
4. The server saves the row and returns the saved key and value.
5. On the next visit the app calls get or list and shows the saved state.
6. The owner may open Sites, Data, and click 'Clear shared data' to remove shared rows.

**What the person sees and gets**

- A call resolves with {key, value, shared}, null for a missing key on get, {key, deleted, shared} on delete, or {keys, prefix, shared} on list (packages/contracts/cloud-contracts/src/artifact-runtime.ts:113).
- Refusals come back as readable messages: 'Keys are 1 to 200 characters with no spaces, slashes or quotes, and values are text.' (400), 'A saved value can be up to 4 MB.' (413), 'This app's shared data is at its 20 MB limit.' or 'Your data in this app is at its 20 MB limit.' (413), 'This app uses connected apps, so it cannot save data that other people can read.' (403), 'This app is no longer available.' (404) (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:60-115).
- Without a sign-in the call fails with "Sign in to use this app's AI and saved data." (apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:57).

**Settings**

- No user setting found in the code for storage.
- Server limits are code constants: per value, per scope, key pattern and list size (packages/contracts/cloud-contracts/src/artifact-runtime.ts:8-11, apps/web/lib/services/artifact-runtime-service.ts:99).
- Rate limit bucket name 'artifact-storage' (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:55); its numbers were not read, unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Route api:POST /api/artifacts/runtime/[token]/storage handles get, set, delete, list with token check, CSRF, active-account check, rate limit, schema check and a runnable-app check (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:46-78).
- Table with key check (1-200 characters, no whitespace, slash, backslash or quotes), a 5 MiB value check, unique index per app, scope and key, and row-level security on all four verbs (apps/web/db/neon/0325_published_artifact_storage.sql:3-20).
- Who may run an app is decided by two database functions. Their latest definition allows public apps, the owner, workspace members for 'organization' apps, and invited emails for 'invited' apps; only html and react kinds (apps/web/db/neon/0395_published_artifact_audience_revocation.sql:72-151).
- Write admission takes an advisory lock, requires read committed isolation, sums existing bytes in the scope and inserts only if the total fits within the scope limit (apps/web/lib/services/artifact-runtime-service.ts:208-258).
- List returns up to 1,000 keys in order, optionally by prefix (apps/web/lib/services/artifact-runtime-service.ts:276-296).
- The sandbox page installs a frozen window.agi object with complete and storage, and posts each call to the parent page, which validates it and forwards to the server (infrastructure/sandbox/index.html:313, apps/web/features/chat/components/SandboxedIframe.tsx:272, apps/web/lib/artifact-sandbox.ts:123).
- Unpublish deletes the rows through a foreign key with on delete cascade (apps/web/db/neon/0325_published_artifact_storage.sql:5).
- Owner data view and clear: api:GET and api:DELETE /api/artifacts/publish/[token]/data (apps/web/app/api/artifacts/publish/[token]/data/route.ts:62-63) with the Sites 'Data' tab.

**Incomplete**

- The refusal of shared writes for connector apps calls the database function app_published_artifact_uses_connectors, which is defined in migration 0391. That file's header says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4, :316). Whether production has it is unknown.
- The migration comment says the allowance is 5 MB per row and 20 MB, but the route enforces a 4 MB value limit from the contract constant while the database check allows 5 MiB (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:85, packages/contracts/cloud-contracts/src/artifact-runtime.ts:10, apps/web/db/neon/0325_published_artifact_storage.sql:17).

**Present but disconnected or switched off**

- If the sandbox origin is not configured the page falls back to an inline frame with no bridge; a request without a host is answered with a message that AI and saved data are not available (apps/web/lib/artifact-sandbox.ts:158, apps/web/features/chat/components/SandboxedIframe.tsx:277-281). Whether the fallback frame installs window.agi at all was not found; unknown.

**Not available**

- Desktop, mobile, CLI, VS Code and Chrome have no storage runtime (doc: docs/product/surface-feature-matrix.md:405-409).
- No per-viewer storage listing for the owner: the owner sees shared rows and only their own personal rows (apps/web/lib/services/published-site-data-service.ts:8-14).
- No binary or object storage; values are text only (packages/contracts/cloud-contracts/src/artifact-runtime.ts:56).

## 4. Required behaviour

**Established requirements**

- Generated apps can persist data in a backend store provided by the platform. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S96.17)
- Only HTML and React apps can use storage; other kinds are refused. (source: S96.17 brief item; apps/web/db/neon/0395_published_artifact_audience_revocation.sql:76)
- Personal data belongs to one signed-in viewer; shared data is visible to everyone who can open the app. (source: apps/web/db/neon/0325_published_artifact_storage.sql:130)
- Shared storage is refused for apps that use connected data when the writer is not the owner. (source: apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:93-105)
- Unpublishing deletes the app's stored rows. (source: apps/web/db/neon/0325_published_artifact_storage.sql:5,130)
- Over-limit writes return a clear 413 message. (source: apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:86-115)

**Acceptance criteria**

1. A signed-in viewer of a public html app can set, get, list and delete a personal key and sees the same value after a reload.
2. A key containing a space, slash, backslash or quote is refused with status 400 and the key message.
3. A value over 4 MB returns 413 'A saved value can be up to 4 MB.' and nothing is saved.
4. A write that would push one scope past 20 MB returns 413 with the 'limit' message; a smaller write in another scope still works.
5. A viewer cannot read another viewer's personal key; both can read the same shared key.
6. A markdown, svg, mermaid, text or code publication returns 404 'This app is no longer available.' from the storage route.
7. After the owner unpublishes the app, its rows no longer exist in published_artifact_storage.
8. A non-owner write with shared=true on an app bound to connected apps returns 403 shared_storage_with_connectors.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Changing the audience from public to workspace or invited should make existing rows unreachable for people who lose access, because every policy calls app_can_run_published_artifact [inferred].
- The 20 MB limit applies per scope (one shared pool plus one pool per viewer), not per app, because the admission query sums bytes by app and scope owner [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the 5 MB wording in the migration comments and brief with the 4 MB enforced value limit.
- [proposed] Add a record of when migration 0391 was applied so the shared-write refusal can be trusted.
- [proposed] Let the owner see per-viewer usage totals without reading private values.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | published_artifact_storage | `apps/web/db/neon/0325_published_artifact_storage.sql` | Key-value rows with scope key, byte count and row-level security. |
| schema | app_runnable_published_artifact / app_can_run_published_artifact | `apps/web/db/neon/0395_published_artifact_audience_revocation.sql` | Latest definition of who may run a published html or react app. |
| endpoint | POST /api/artifacts/runtime/[token]/storage | `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | Single route for get, set, delete, list with checks and refusals. |
| service | artifact-runtime-service storage functions | `apps/web/lib/services/artifact-runtime-service.ts` | read, write (with lock and limit), delete, list queries and readRunnableArtifact. |
| schema | ArtifactStorageRequestSchema and limits | `packages/contracts/cloud-contracts/src/artifact-runtime.ts` | Request and response shapes, key pattern, 4 MB value and 20 MB scope limits. |
| other | window.agi shim | `infrastructure/sandbox/index.html` | Installs the frozen window.agi.storage object inside the sandboxed page. |
| component | SandboxedIframe runtime-request handler | `apps/web/features/chat/components/SandboxedIframe.tsx` | Receives runtime-request messages from the sandbox and answers them. |
| service | artifact-sandbox request parser | `apps/web/lib/artifact-sandbox.ts` | Validates storage operations and the sandbox origin. |
| service | artifactRuntimeClient | `apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts` | Browser fetch with CSRF header, 401 handling and 413 fallback text. |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Builds the host that checks sign-in and calls the client. |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Hosts the frame and shows the sign-in banner. |
| endpoint | GET/DELETE /api/artifacts/publish/[token]/data | `apps/web/app/api/artifacts/publish/[token]/data/route.ts` | Owner reads and clears the app's shared data. |
| service | published-site-data-service | `apps/web/lib/services/published-site-data-service.ts` | Owner-side data summary and clear. |
| component | SiteDataTab | `apps/web/features/sites/components/SiteDataTab.tsx` | Sites page Data tab with table and Clear shared data. |
| config | NEXT_PUBLIC_SANDBOX_ORIGIN | `apps/web/lib/artifact-sandbox.ts` | Names the separate origin that serves the sandbox page (name only). |
| test | storage route and service tests | `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.handler.test.ts` | Handler tests for the route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app code calls window.agi.storage.get, set, delete or list. The sandbox page turns it into a runtime request. | device | infrastructure/sandbox/index.html:283-322 |
| The sandbox page posts the request to the app page. The page checks the origin and shape of the request. | device | apps/web/features/chat/components/SandboxedIframe.tsx:272, apps/web/lib/artifact-sandbox.ts:123 |
| The host checks the viewer is signed in. If not, it shows the sign-in banner and fails the call. | device | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:306 |
| The browser posts to the storage route with a CSRF header. | device and our servers | apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:84 |
| The server checks token format, CSRF, active account, rate limit and the request schema, then finds the runnable app. | our servers | apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:46-67 |
| The server reads, writes, deletes or lists in the database under the viewer's row-level security. Writes take an advisory lock and check the scope total. | our servers | apps/web/lib/services/artifact-runtime-service.ts:192-296 |
| The answer goes back through the page to the sandbox, and the app's promise resolves or rejects. | device and our servers | apps/web/features/chat/components/SandboxedIframe.tsx:288 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Key, text value, byte count, who updated it, timestamps, owner (null for shared) | table published_artifact_storage in our database | Held only on the server; every device of the same viewer reads the same rows after sign-in | Kept until the app deletes the key, the owner clears shared data, the app is unpublished (cascade), or the viewer's profile is removed (cascade on owner_user_id) (apps/web/db/neon/0325_published_artifact_storage.sql:5-6) |
| AI consent flags stored in the browser by the same runtime hook (not storage rows) | browser localStorage key prefix agiworkforce-artifact-ai | No, per browser | Until the person answers again or clears browser data (apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:48-76) |

**Models and providers.** No model or provider takes part in storage calls. Storage is plain database reads and writes. The sibling call window.agi.complete does use a model; see F096-08.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is required even for a public app, because the database functions return nothing when there is no current user (apps/web/db/neon/0395_published_artifact_audience_revocation.sql:72-90). The account must be active (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:54). |
| Permissions | Viewer must be allowed to run the app: public, owner, workspace member for an organization app, or invited email for an invited app. Personal rows are limited to the viewer; shared rows to anyone who can run the app (apps/web/db/neon/0325_published_artifact_storage.sql:70-110). Only the owner may call the data view and clear routes. |
| Subscription | none found in the code. The storage route does not read the plan or entitlement. |
| Limits and metering | Key 1-200 characters; value up to 4 MB enforced by the route; database check at 5 MiB; 20 MB per scope; list returns up to 1,000 keys; request body ceiling is twice the value limit plus 64 KB (packages/contracts/cloud-contracts/src/artifact-runtime.ts:8-13). Rate limit bucket 'artifact-storage' per user. Storage use is not billed or counted as AI usage. |
| Feature flags | No flag on the storage route. The sandbox origin variable decides whether the bridge exists. AGI_ARTIFACT_AI_ENABLED gates AI only, not storage (apps/web/lib/server/artifact-ai-switch.ts:6). |
| Model compatibility | Not applicable. No model is involved. |
| Provider restrictions | none found in the code. |
| Local mode | Publishing is refused for artifacts not made in managed cloud mode, so a Local artifact cannot become a published app that uses this store (packages/platform/artifacts/src/artifacts.ts:267; mobile alert 'Switch to AGI Cloud to publish', apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:300). Storage itself always runs on our servers; no on-device storage version exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed-out viewer | Call fails with a sign-in message and a banner shows 'Create an account' and 'Sign in'. | apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:274; apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:57 |
| Malformed or unknown token, or app unpublished | 404 'This app is no longer available.' | apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:47-68 |
| Value over limit | 413 with the 4 MB message; client falls back to 'That value is too large to save.' if the body is unreadable. | apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:85; apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:26 |
| Two writers race for the last of the allowance | The advisory lock lets only writes that fit succeed. | apps/web/lib/services/artifact-runtime-service.ts:226; apps/web/lib/services/__tests__/artifact-runtime-service.storage.test.ts:66 |
| Non-text value | storage.set rejects with 'storage.set saves text: pass JSON.stringify(value) for other data.' | infrastructure/sandbox/index.html:289-292 |
| More than eight requests pending | A pending limit constant exists in the sandbox page; exact behaviour was not read, unknown. | infrastructure/sandbox/index.html:245 |
| Offline or network failure | not handled in the code beyond the generic message 'The request failed. Try again.'; no queue or retry found. | apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:25 |
| Page changes while a call is pending | The call fails with 'This app changed while the request was pending...' | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:18 |
| Other apps | Desktop, mobile, CLI, VS Code and Chrome do not host the runtime. | docs/product/surface-feature-matrix.md:405-409 |
| Accessibility | The owner Data table has a screen-reader caption 'Shared data entries' and a status role while loading; the app's own content is up to the app. | apps/web/features/sites/components/SiteDataTab.tsx:205-247 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.handler.test.ts`: Malformed token, CSRF, 401, suspended account, unknown op, non-runnable app, value limit, scope limit, personal and shared read and write, delete and list, shared write refusal for connector apps.
- `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.test.ts`: Route-level storage tests (contents not read in detail).
- `apps/web/lib/services/__tests__/artifact-runtime-service.storage.test.ts`: Admission under a race for the last allowance and refusal outside read committed isolation.
- `apps/web/app/api/artifacts/publish/[token]/data/__tests__/route.test.ts`: Owner data view and clear route; mentions the storage table.
- `apps/web/features/sites/services/sites-service.data.test.ts`: Client service for the owner data calls.
- `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.test.tsx`: Runtime host behaviour: sign-in, consent, stale context.
- `apps/web/db/neon/published-artifact-audience-revocation-migration.test.ts`: Migration text for the access functions and storage policies (mentions published_artifact_storage).

**Test scenarios**

- **Personal data stays private**
  1. Publish an html app that stores a key with shared=false.
  2. Sign in as viewer A and set the key.
  3. Sign in as viewer B and get the same key.
  - Expected: Viewer B gets null; viewer A still reads the value.
- **Shared data is common**
  1. Use shared=true from viewer A to set a key.
  2. Read it as viewer B who can open the app.
  - Expected: Viewer B reads A's value.
- **Limits**
  1. Set a 4 MB plus one byte value.
  2. Fill one scope near 20 MB then write again.
  - Expected: 413 'A saved value can be up to 4 MB.' then 413 with the 20 MB scope message.
- **Wrong kind**
  1. Publish a markdown artifact.
  2. Post a storage get to its token.
  - Expected: 404 'This app is no longer available.'
- **Unpublish clears rows**
  1. Save keys in both scopes.
  2. Unpublish from Sites.
  3. Query the table for that app id.
  - Expected: No rows remain.
- **Signed-out viewer**
  1. Open a public app in a private window.
  2. Trigger a save.
  - Expected: Sign-in banner shows and the call fails with the sign-in message.

**Where to look when it fails**

- Error codes in the JSON body: invalid_storage_request, artifact_not_found, storage_value_too_large, storage_limit_reached, shared_storage_with_connectors.
- Error name ArtifactRuntimeSignInRequiredError in the browser console.
- Table published_artifact_storage (value_bytes, scope_key) and the functions app_runnable_published_artifact and app_can_run_published_artifact.
- Server log of 'Artifact storage admission requires read committed isolation' errors.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says 5 MB per value; the route enforces 4 MB while the database allows 5 MiB.** Affects: Web authors and testers. Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:10; apps/web/db/neon/0325_published_artifact_storage.sql:17. Work needed: Pick one number, set the database check and docs to match it.
- **Migration 0391 supplies the function behind the connector-app shared-write refusal and is marked not applied.** Affects: Web viewers of connector-bound apps. Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4,316; apps/web/lib/services/published-artifact-service.ts:631. Work needed: Confirm production state; apply with the approved process or the route may error.
- **Bridge needs a separate sandbox origin; production had none when the audit row was written and the fallback frame has no found bridge.** Affects: All web viewers. Evidence: audit/registers/known-flaws.md:57; apps/web/lib/artifact-sandbox.ts:158. Work needed: Verify live configuration and the fallback path; decide the supported mode.
- **No per-app storage metering or owner view of personal usage.** Affects: Publishers. Evidence: apps/web/lib/services/published-site-data-service.ts:8-14. Work needed: Add counters if the product wants per-app limits.
- **No offline queue or retry for failed saves.** Affects: Viewers on weak networks. Evidence: apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:25. Work needed: Decide whether the app or the platform retries.
- **Brief marks every app n/a; only web runs this, other apps open the browser.** Affects: Desktop, mobile, CLI, VS Code, Chrome. Evidence: docs/product/surface-feature-matrix.md:405-409. Work needed: None unless parity is required; state the browser hand-off in the app UI.

**Depends on**

- F096-09
- F096-08
- SYS-files-artifacts-and-storage
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-execution-boundaries
- surface:web
- mode:cloud
- table:published_artifact_storage
- table:published_artifacts

## Unknown

- Whether the production sandbox origin is configured today.
- Whether migration 0391 is applied in production.
- Numeric values of the 'artifact-storage' rate limit bucket.
- Whether the fallback inline frame exposes window.agi.
- What the pending-request limit of the sandbox page does when exceeded.
- Which test file route.test.ts in the storage tests folder covers, beyond its name.

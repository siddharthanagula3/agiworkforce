---
id: "F028-07"
type: "feature"
title: "AI and saved data inside a published app"
aliases: ["agi.complete and agi.storage", "AI and saved data in published apps", "brokered AI API for apps", "published app runtime", "S28.22", "S28.23", "artifact runtime"]
area: "28 Code Canvas and application preview"
available_on: ["web"]
implementation: {web: "built", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S28.22", "S28.23"]
depends_on: ["surface:web", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-files-artifacts-and-storage", "table:published_artifact_storage", "F028-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-07 AI and saved data inside a published app

A published HTML or React app can call AI and save small text values through helpers the page provides (agi.complete, agi.storage). The app never holds a provider key. Calls go through our servers for a signed-in viewer, who is billed. AI is off unless a server switch is set. Web only.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.22](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2822), [S28.23](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2823).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a published app two helpers: agi.complete(prompt) for an AI answer and agi.storage get/set/delete/list for small text values, private to each viewer or shared by all viewers. The frame relays each call to the web page, which sends it to our servers (infrastructure/sandbox/index.html:255-326, 353-370; apps/web/features/chat/components/SandboxedIframe.tsx:272-304).

**Why it exists.** So an app made in chat can be interactive and remember things without the author putting a provider key or a database into the page. The page text says the helpers work once the app is published and opened by a signed-in viewer (infrastructure/sandbox/index.html:240-241).

**Who uses it.** App authors (the model writes script that calls the helpers) and viewers of the published app. The viewer must be signed in (apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:57).

**Problems it solves**

- Apps need AI without exposing a key in page source.
- Apps need to keep small state between visits.
- The cost of AI calls is attributed to the signed-in viewer and counted against that viewer's plan, not the publisher (apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts:407 title: bills the signed-in viewer for a published app and never its publisher).

**Use cases**

- A published quiz app asks agi.complete to grade a free-text answer.
- A published checklist app saves each viewer's ticks with agi.storage.set(name, JSON.stringify(value)).
- A shared scoreboard app uses agi.storage.set(name, value, true) so every viewer sees the same value.
- The owner tries AI inside the app in their own chat before publishing (apps/web/app/chat/live-artifacts/useLiveArtifactRuntime.ts:1-40).

## 2. User experience

**Where to find it**

- Web only: the published page at /shared-artifact/<token> (apps/web/app/shared-artifact/[token]/page.tsx:73-95).
- Web owner preview in a chat: AI works there, but saved data says 'Saved data works once this app is published. Publish it to use storage.' (apps/web/app/chat/live-artifacts/useLiveArtifactRuntime.ts:21).
- Desktop, Mobile, CLI, VS Code, Chrome: not available. A published app opens in the browser or system browser (doc: docs/product/surface-feature-matrix.md:402-410). The Chrome side panel answers every runtime request with 'AI and saved data are available once this app is published and opened by a signed-in viewer.' (apps/extension/src/features/side-panel/artifactPanel.ts:849-855; apps/extension/_locales/en/messages.json:3359).

**Before you start**

- The app kind is html or react (apps/web/db/neon/0395_published_artifact_audience_revocation.sql:72-83).
- The app is published and the viewer is allowed to open it: public, the owner, a workspace member, or an invited viewer (apps/web/db/neon/0395_published_artifact_audience_revocation.sql:72-108).
- The viewer is signed in. Signed out, the page shows 'Create an account or sign in to use this app's AI and saved data.' with buttons 'Create an account' and 'Sign in' (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:267-289).
- For AI: the server switch AGI_ARTIFACT_AI_ENABLED is on (apps/web/lib/server/artifact-ai-switch.ts:5-8).

**Screens and controls**

- Published page with the app inside a sandboxed frame (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:321-330).
- A permission panel labelled 'AI permission' with buttons 'Allow' and "Don't allow" (apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx:57,133,140).
- After the viewer allows a connected-app set: 'Refresh data' and 'Connected apps' buttons (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:298-318).

**Journey**

1. 1. The author publishes an html or react artifact whose script calls agi.complete or agi.storage (see F028-10).
2. 2. A viewer opens the link and signs in if asked.
3. 3. The app calls a helper. The frame checks that the page enabled the runtime and that fewer than 8 requests are pending, then posts a request to the web page (infrastructure/sandbox/index.html:353-370).
4. 4. For AI, the page asks the viewer once to allow it; the answer is remembered per user, link and exact code (apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:42-80,148-153,316-323).
5. 5. The page posts to our servers with a CSRF token; the server checks the switch, the viewer's plan and limits, picks a model route, and returns text (apps/web/app/api/artifacts/runtime/artifact-completion.ts:112-310).
6. 6. The helper's promise resolves with the text, or rejects with a plain message.

**What the person sees and gets**

- agi.complete resolves to a string; storage.get resolves to the value or null; set resolves to the saved entry; list resolves to keys (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:77-143).
- Failures reject with an error named AgiRuntimeError and a readable message, such as 'Too many requests are waiting. Wait for one to finish first.' (infrastructure/sandbox/index.html:249-253,360-364).
- If AI is off: 'AI in apps is not available yet.' (apps/web/lib/artifact-ai.ts:3).

**Settings**

- Server switch AGI_ARTIFACT_AI_ENABLED (name and purpose only) (apps/web/.env.example:1009-1012).
- No viewer-facing storage or AI setting was found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The frame installs a frozen agi object with complete and storage helpers, and rejects when the runtime is not enabled or 8 requests are pending (infrastructure/sandbox/index.html:255-326,353-370).
- The web page validates each request and relays it to a host; without a host it answers that AI and saved data need a published app (apps/web/lib/artifact-sandbox.ts:123-163; apps/web/features/chat/components/SandboxedIframe.tsx:272-304).
- Storage route supports get, set, delete, list, personal or shared, with CSRF, account-active check, rate limit 'artifact-storage' (120 per minute) and size limits (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:51-143; apps/web/lib/rate-limit.ts:439-443).
- Storage writes use a transaction with an advisory lock so concurrent writes cannot pass the 20 MiB per scope cap (apps/web/lib/services/artifact-runtime-service.ts:215-258).
- Completion runs workspace policy, plan access, content moderation, content-safety preference, secret handling, route choice, model policy and egress gates, a concurrency slot, a usage reservation and a final usage record (apps/web/app/api/artifacts/runtime/artifact-completion.ts:136-310; apps/web/lib/services/artifact-runtime-service.ts:629-765).
- The viewer, not the publisher, is billed (apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts:407).

**Incomplete**

- Per-app AI call and spend caps are written in migration 0391, whose header says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:1-5), yet the service calls reserve_artifact_runtime_usage_microusd (apps/web/lib/services/managed-usage-request-service.ts:804). Whether it is applied in production is unknown.
- The database allows a value up to 5 MiB (apps/web/db/neon/0325_published_artifact_storage.sql:3-18) while the API refuses values above 4 MiB (packages/contracts/cloud-contracts/src/artifact-runtime.ts:10; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:85-91). The API limit is the tighter one.

**Present but disconnected or switched off**

- agi.complete is refused with 403 artifact_ai_off unless AGI_ARTIFACT_AI_ENABLED is 1, true, yes or on; the page also refuses before calling (apps/web/lib/server/artifact-ai-switch.ts:3-8; apps/web/app/api/artifacts/runtime/artifact-completion.ts:116-118; apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:309). The .env.example says it stays off until a security review passes (apps/web/.env.example:1009-1012).
- Connected apps from inside an app are refused with 'Connectors are coming soon.' because the release state is coming_soon (packages/contracts/types/src/connector-release.ts:14,46-48; apps/web/app/api/artifacts/runtime/artifact-completion.ts:121-123). Storage has no such switch (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:51-143).

**Not available**

- Desktop, Mobile, CLI, VS Code and Chrome do not run published apps (doc: docs/product/surface-feature-matrix.md:402-410; apps/extension/src/features/side-panel/artifactPanel.ts:849-855).
- Local mode and own-key mode: no path found. An owner preview requires the app to come from a Cloud chat (apps/web/app/api/artifacts/runtime/artifact-completion.ts:59-68).

## 4. Required behaviour

**Established requirements**

- An app can call AI through a brokered product API instead of embedding keys (brief S28.22, web done; desktop, mobile, chrome missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.22)
- An app can be given persistent storage (brief S28.23, web done; desktop, mobile, chrome missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.23)
- Storage values are at most 4 MiB each and 20 MiB per scope; keys have no spaces, slashes or quotes and are 1 to 200 characters. (source: packages/contracts/cloud-contracts/src/artifact-runtime.ts:8,10,11)
- Shared storage is refused for an app that uses connectors when the viewer is not the owner. (source: apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:94-104)
- Published apps are rendered only on the web page; other surfaces open the browser. (source: doc: docs/product/surface-feature-matrix.md:402-410)

**Acceptance criteria**

1. With the switch off, agi.complete rejects with 'AI in apps is not available yet.' and no model is called.
2. With the switch on and a signed-in viewer on an eligible plan, agi.complete resolves to text and the viewer's usage rises, not the publisher's.
3. A signed-out viewer calling any helper sees the sign-in banner and the call rejects with a sign-in message.
4. storage.set then storage.get of the same key returns the same text for the same viewer; with shared=true a second viewer reads it; with shared=false the second viewer gets null.
5. A value over 4 MiB is refused with 'A saved value can be up to 4 MB.'; a key with a space or slash is refused as invalid.
6. A ninth concurrent helper call rejects with 'Too many requests are waiting. Wait for one to finish first.'
7. Unpublishing the app removes its saved values (table comment) and the link stops running.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the viewer is billed, a free-plan viewer may be refused; the exact plan list is unknown [inferred from evaluateManagedComputeAccess and acquireManagedTurnSlot plan-excluded, apps/web/app/api/artifacts/runtime/artifact-completion.ts:87-92,150-160].
- Local and own-key users cannot use AI inside published apps because the only model route is the managed one [inferred from apps/web/lib/services/artifact-runtime-service.ts:299-330].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the database value check with the 4 MiB API limit so one number is owned in one place.
- [proposed] Record in the repository whether migration 0391 is applied and drop the 'NOT YET APPLIED' header if so.
- [proposed] Show the viewer a meter of their saved data against the 20 MiB cap.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Sandbox frame page | `infrastructure/sandbox/index.html` | Installs agi.complete and agi.storage, limits pending requests to 8, relays requests to the parent and resolves responses |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Validates origin and source of runtime requests, calls the runtime host, posts the response back |
| service | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Parses runtime requests, sandbox origin checks, runtime host type |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Runtime host for the published page: sign-in state, AI consent per revision, calls the client |
| hook | useLiveArtifactRuntime | `apps/web/app/chat/live-artifacts/useLiveArtifactRuntime.ts` | Runtime host for the owner's own app inside a chat; storage unavailable there |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Published page: sandbox frame, sign-in banner, permission panel |
| component | ArtifactConnectorConsent | `apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx` | The 'AI permission' panel with Allow and Don't allow |
| service | artifactRuntimeClient | `apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts` | Posts runtime calls with CSRF and an idempotency key; maps 401 to a sign-in error |
| endpoint | POST complete | `apps/web/app/api/artifacts/runtime/[token]/complete/route.ts` | Published-app AI completion route |
| endpoint | POST storage | `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | Published-app storage route (get, set, delete, list) |
| endpoint | POST connectors | `apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts` | Lists the viewer's connected apps for the consent panel |
| endpoint | POST live complete | `apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/route.ts` | Owner-preview AI completion; requires the app to come from a Cloud chat |
| service | respondToArtifactCompletion | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` | Shared gate chain for AI completion |
| service | artifact-runtime-service | `apps/web/lib/services/artifact-runtime-service.ts` | Runnable-artifact lookup, storage reads and writes, route selection, completion, usage reservation |
| config | artifact-ai-switch | `apps/web/lib/server/artifact-ai-switch.ts` | Reads AGI_ARTIFACT_AI_ENABLED |
| schema | artifact runtime contracts | `packages/contracts/cloud-contracts/src/artifact-runtime.ts` | Request and response schemas, key pattern, size limits, route paths |
| table | published_artifact_storage | `apps/web/db/neon/0325_published_artifact_storage.sql` | Key-value rows, personal or shared, with row-level security |
| schema | audience-aware run check | `apps/web/db/neon/0395_published_artifact_audience_revocation.sql` | Defines which viewers may run an app by token |
| table | managed_usage_requests artifact_subject | `apps/web/db/neon/0391_artifact_runtime_usage_cap.sql` | Per-app attribution and caps for AI calls (header says not yet applied) |
| config | rate limits | `apps/web/lib/rate-limit.ts` | llm-completion 30 per minute, artifact-storage 120 per minute |
| component | Chrome side-panel refusal | `apps/extension/src/features/side-panel/artifactPanel.ts` | Answers runtime requests with an unavailable message |
| test | complete route tests | `apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts` | Gate order, billing the viewer, CSRF, 401, rate limit |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app script calls agi.complete or agi.storage; the frame builds a request and posts it to the parent page. | device | infrastructure/sandbox/index.html:255-326,353-370 |
| The parent checks the frame origin and source window, parses the request, and hands it to the runtime host. | device | apps/web/features/chat/components/SandboxedIframe.tsx:272-304; apps/web/lib/artifact-sandbox.ts:123-163 |
| The host requires a signed-in viewer, asks for AI consent if needed, then posts to our servers with a CSRF token and an idempotency key. | device | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:306-336; apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:43-70,84-109 |
| The server checks CSRF, account active, rate limit and request shape, then loads the runnable app by token under row-level security. | our servers | apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:34-57 |
| For AI: switch, connector gates, workspace policy, plan access, moderation, secret handling, route and policy gates, concurrency slot, usage reservation, model call. | our servers | apps/web/app/api/artifacts/runtime/artifact-completion.ts:112-310 |
| The model call goes to the chosen provider's adapter and the answer text returns. | outside service | apps/web/lib/services/artifact-runtime-service.ts:478-519 |
| For storage: the server reads, upserts under a lock, deletes or lists rows in published_artifact_storage. | our servers | apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:77-143; apps/web/lib/services/artifact-runtime-service.ts:192-297 |
| The response returns to the frame, which resolves or rejects the helper's promise. | device | infrastructure/sandbox/index.html:961-971 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved key-value text, personal (owner_user_id set) or shared (null) | table published_artifact_storage in our database (apps/web/db/neon/0325_published_artifact_storage.sql:3-18) | Server-held; every viewer who can run the app sees shared rows; personal rows only their owner | Kept until the app deletes the key; deleted when the app is unpublished (table comment, apps/web/db/neon/0325_published_artifact_storage.sql) or the profile is deleted (cascade, same file lines 3-18) |
| AI consent answer and allowed tools | Browser localStorage key agiworkforce-artifact-ai:<user>:<token>:<code digest> | No; per browser | Kept until declined or storage cleared; a code change asks again (apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:42-115) |
| Usage reservation and final record for each AI call | managed usage tables, tagged with the app (published:<id>) per the 0391 header | Server only | unknown retention; see apps/web/lib/services/artifact-runtime-service.ts:700-765 |

**Models and providers.** The model route is chosen on the server from the viewer's plan and task type by the managed route admission, not by the app, and the provider key stays on our servers (apps/web/lib/services/artifact-runtime-service.ts:299-330; apps/web/app/api/artifacts/runtime/artifact-completion.ts:211-244). When a run can reach Google user data, only routes that keep inputs out of training are allowed (apps/web/app/api/artifacts/runtime/artifact-completion.ts:205-210).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in viewer required; signed-out calls get a sign-in message (apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:57; apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts:449). |
| Permissions | Who may run an app: public, owner, workspace member or invited viewer, enforced by row-level security (apps/web/db/neon/0395_published_artifact_audience_revocation.sql:72-108). Shared storage is blocked for connector apps for non-owners (apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:94-104). The workspace privacy-mode policy is checked for AI (apps/web/app/api/artifacts/runtime/artifact-completion.ts:136-148). |
| Subscription | AI is checked against the viewer's managed-compute access and plan turn limits (apps/web/app/api/artifacts/runtime/artifact-completion.ts:150-160,79-99). Connector use needs a plan with the artifact_connectors capability; which plans have it: unknown (apps/web/lib/services/artifact-connector-gate.ts:22-31). No plan check found for storage. |
| Limits and metering | Prompt up to 100,000 characters, up to 10 connectors (packages/contracts/cloud-contracts/src/artifact-runtime.ts:3-4). AI route limit 30 per minute per user (apps/web/lib/rate-limit.ts:359-363); storage 120 per minute (apps/web/lib/rate-limit.ts:439-443). Output capped at 4,096 tokens (apps/web/lib/services/artifact-runtime-service.ts:100). Each call reserves and records usage on the viewer (apps/web/lib/services/artifact-runtime-service.ts:629-765). Per-app caps depend on migration 0391, applied state unknown. |
| Feature flags | AGI_ARTIFACT_AI_ENABLED (off unless set) (apps/web/lib/server/artifact-ai-switch.ts:5-8). Connector release state coming_soon (packages/contracts/types/src/connector-release.ts:14). |
| Model compatibility | The app cannot choose a model. Connector runs require a route with function calling (apps/web/lib/services/artifact-runtime-service.ts:299-310). |
| Provider restrictions | Route and egress gates apply per provider (apps/web/app/api/artifacts/runtime/artifact-completion.ts:226-244). Named providers: none found in these files. |
| Local mode | Not available. Local and own-key sessions have no path into published-app AI; the owner preview refuses an app not made in a Cloud chat with 'Only an app made in a Managed Cloud chat can use AI and your connected apps.' (apps/web/app/api/artifacts/runtime/artifact-completion.ts:59-68). Free local inference does not apply here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Banner with 'Create an account' and 'Sign in'; call rejects | apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:267-289; usePublishedArtifactRuntime.ts:311-314 |
| Sign-in state still loading | Rejects 'Wait for your sign-in state before using this app.' | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:310 |
| AI switch off | Rejected before any network call and again on the server with 403 | usePublishedArtifactRuntime.ts:309; artifact-completion.ts:116-118 |
| Viewer declines AI permission | Rejects 'You chose not to let this app use AI.' | usePublishedArtifactRuntime.ts:15,319-321 |
| App code changes while a request is pending | Rejects with 'This app changed while the request was pending...' and the consent is asked again for new code | usePublishedArtifactRuntime.ts:18-19,82-84,318 |
| App reloads with requests pending | Pending calls reject 'The app reloaded before this request finished.' | infrastructure/sandbox/index.html:884-886 and the rejectPendingRuntime call in dispatchRender |
| More than 8 pending | Immediate rejection | infrastructure/sandbox/index.html:360-364 |
| Value too large or storage full | 413 with 'A saved value can be up to 4 MB.' or a limit-reached message by scope | apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:85-91,110-118 |
| Concurrent turn limit or limiter outage | 429, 403 or 503 with no model request sent | apps/web/app/api/artifacts/runtime/artifact-completion.ts:79-99,271-277 |
| Offline, timeout, cancel, retry | Not handled in the code beyond request abort on context change and route maxDuration 300 seconds; no automatic retry found | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:170-186; apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:26 |
| Fallback frame without a sandbox origin | Unknown whether the helpers exist; the fallback uses a different frame (sandbox allow-scripts allow-modals) and no runtime relay was found for it | apps/web/features/chat/components/SandboxedIframe.tsx:425-430 |
| Accessibility | Permission panel has an aria-label 'AI permission'; sign-in banner has role status | ArtifactConnectorConsent.tsx:57; PublishedArtifactView.tsx:269 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts`: Turn slot taken and released, limiter outage refusal, plan ceiling, viewer billed not publisher, signed-out reads nothing, malformed token 404, CSRF refusal, 401, per-user rate limit (from it titles)
- `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.test.ts`: Includes 'names the saved-value limit when a value is just over it'; other titles not read
- `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.handler.test.ts`: Storage route handler; titles not read
- `apps/web/app/api/artifacts/runtime/[token]/connectors/__tests__/route.test.ts`: Connector listing route; titles not read
- `apps/web/lib/services/__tests__/artifact-runtime-service.storage.test.ts`: Storage service; titles not read
- `apps/web/lib/services/__tests__/artifact-runtime-service.billing.test.ts`: Completion billing; titles not read
- `apps/web/lib/services/__tests__/artifact-runtime-service.public-share.test.ts`: Public-share connector rules; titles not read
- `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.test.tsx`: Runtime host hook; titles not read
- `apps/web/lib/__tests__/artifact-sandbox.test.ts`: Sandbox request parsing and origin; titles not read
- `apps/web/lib/services/__tests__/managed-usage-request-service.artifact-cap.test.ts`: Per-app cap reservation call; titles not read
- `apps/web/db/neon/artifact-runtime-usage-cap-migration.test.ts`: Migration 0391 text; titles not read

**Test scenarios**

- **AI switch off**
  1. Leave AGI_ARTIFACT_AI_ENABLED unset on a test environment.
  2. Open a published html app whose button calls agi.complete('hi') while signed in.
  3. Press the button.
  - Expected: The call rejects with 'AI in apps is not available yet.' and no usage is recorded.
- **Viewer is billed**
  1. Turn the switch on.
  2. Publisher publishes an AI app; a different signed-in viewer opens it and allows AI.
  3. Trigger one completion.
  - Expected: Text returns; the viewer's usage rises and the publisher's does not.
- **Private versus shared storage**
  1. Viewer A calls agi.storage.set('k','1') and set('s','2',true).
  2. Viewer B opens the same link and reads both with get.
  - Expected: B gets null for k and '2' for s.
- **Size and key limits**
  1. Call storage.set with a value just over 4 MiB.
  2. Call storage.set with a key containing a space.
  - Expected: First is refused as too large (413); second is refused as invalid (400).
- **Signed out**
  1. Open the link in a private window.
  2. Trigger a helper.
  - Expected: The sign-in banner appears and the call rejects with a sign-in message.
- **Chrome side panel**
  1. In the Chrome extension, have a chat produce an html artifact that calls agi.complete.
  2. Open it in the side panel preview.
  - Expected: The call rejects with the 'available once this app is published' message.

**Where to look when it fails**

- Error codes in JSON responses: artifact_ai_off, artifact_not_found, invalid_prompt, connectors_coming_soon, connectors_not_declared, shared_storage_with_connectors, storage_value_too_large, storage_limit_reached, concurrent_turn_limit_reached, concurrency_limiter_unavailable, model_unavailable (apps/web/app/api/artifacts/runtime/artifact-completion.ts; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts).
- Log line '[artifact-runtime] content safety unread' and '[artifact-runtime] refresh not recorded' (apps/web/app/api/artifacts/runtime/artifact-completion.ts:187,294).
- Table published_artifact_storage for saved rows; managed usage tables for AI usage.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **Desktop, mobile and Chrome cannot run AI or storage in a published app; they open the browser or refuse.** Affects: Desktop, Mobile, Chrome users. Evidence: doc: docs/product/surface-feature-matrix.md:402-410; apps/extension/src/features/side-panel/artifactPanel.ts:849-855. Work needed: Decide whether native surfaces host published apps or keep opening the web page; if they host, add a runtime host per surface.
- **AI inside apps is off by default and tied to a security review.** Affects: All viewers of published apps. Evidence: apps/web/.env.example:1009-1012. Work needed: Finish the review, then set the switch; record the decision.
- **Per-app cap migration 0391 is marked not applied in its own header while code calls it.** Affects: Billing safety for looping apps. Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:1-5; apps/web/lib/services/managed-usage-request-service.ts:804. Work needed: Verify applied state with the migration status command and fix the header.
- **No Local or own-key route for app AI; no user control for network destinations or secrets (brief S28.20, S28.21 missing).** Affects: Local and own-key users. Evidence: apps/web/app/api/artifacts/runtime/artifact-completion.ts:59-68; doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.20-S28.21. Work needed: Product decision on whether app AI may use local models or the user's own key; add an explicit fork with consent if so.
- **Draft line numbers for the frame (index.html:255-326, 353-370) are right, but the draft's 'viewer must be signed in' also depends on the page switch; the 5 MiB database check differs from the 4 MiB API limit.** Affects: Engineers. Evidence: apps/web/db/neon/0325_published_artifact_storage.sql:3-18; packages/contracts/cloud-contracts/src/artifact-runtime.ts:10. Work needed: Pick one limit owner.
- Not built on: Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-files-artifacts-and-storage
- table:published_artifact_storage
- F028-10

## Unknown

- Whether migration 0391 is applied in production.
- Which plans carry the artifact_connectors capability and which plans may use AI in apps.
- Whether the fallback frame (no sandbox origin configured) exposes the agi helpers.
- Retention period of usage records for app AI calls.
- Whether the AGI_ARTIFACT_AI_ENABLED switch is on in production.

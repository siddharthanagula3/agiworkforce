---
id: "F096-08"
type: "feature"
title: "Connected data for apps (services and viewer sign-in)"
aliases: ["Connected-data proxy (S96.18)", "Viewer-authentication bridge (S96.19)", "Connected apps in published apps", "artifact_connectors", "live artifacts connectors", "window.agi.complete with connectors", "artifact runtime completion"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.18", "S96.19"]
depends_on: ["F096-07", "F096-09", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-authentication-and-identity", "surface:web", "mode:cloud", "table:live_artifacts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-08 Connected data for apps (services and viewer sign-in)

A published web app can ask the model to answer a prompt and, if allowed, let the model use the viewer's connected apps through server-held tools, without the page seeing credentials. It exists in the web code but is switched off: connectors are 'coming soon' and AI in apps needs a server flag. The brief calls it missing.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.18](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9618), [S96.19](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9619).

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

**What it does.** Lets a published HTML or React app call window.agi.complete(prompt, {connectors}). The server runs one model completion for the signed-in viewer, optionally with tools from the viewer's own connected apps, and returns text. Credentials stay on the server. The viewer must say Allow before any call (apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:74, apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx:133).

**Why it exists.** The brief wants artifacts to read connected-service data without exposing credentials (S96.18) and a viewer sign-in path to those services (S96.19). The code implements a tool-using completion rather than a raw data proxy [inferred].

**Who uses it.** App authors on a paid plan who build an app that summarises mail, tickets or notes. Viewers who open the app and approve the access. Reviewers who check that public links never reach connected apps.

**Problems it solves**

- A generated page cannot hold secrets, yet needs live data.
- A public link must never let a stranger spend or read someone's connected apps.
- Viewers need to see and limit which tools the app may use.
- Spend by AI calls inside apps must be reserved and counted against the viewer's plan.

**Use cases**

- A published dashboard summarises the viewer's own issue tracker.
- A workspace-shared app drafts text with AI only, with no connectors.
- A viewer declines tools they do not trust and the app still runs without them.
- A publisher tries to share a connector app publicly and is refused.

## 2. User experience

**Where to find it**

- Web only. In the published page at /shared-artifact/<token> an 'AI permission' panel appears when the app first asks for AI (apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx:57).
- Own chat: live artifacts have a separate owner-side route api:GET/POST /api/artifacts/live (apps/web/app/api/artifacts/live/route.ts); its UI labels were not read, unknown.
- Other apps: no runtime; a published app opens in the system browser (doc: docs/product/surface-feature-matrix.md:405-409).

**Before you start**

- Server flag AGI_ARTIFACT_AI_ENABLED is on, else 'AI in apps is not available yet.' (apps/web/lib/server/artifact-ai-switch.ts:6, apps/web/lib/artifact-ai.ts:3).
- For connectors, connectors must be released. The shipped constant is 'coming_soon', so they are refused with 'Connectors are coming soon.' (packages/contracts/types/src/connector-release.ts:14, apps/web/app/api/artifacts/runtime/artifact-completion.ts:122).
- The viewer is signed in and on a plan with the artifact_connectors capability: pro, max, max_15x, team, team_premium or enterprise (packages/contracts/types/src/billing-catalog.ts:341,361).
- The publication is not public: visibility must be workspace or invited (apps/web/db/neon/0383_published_artifact_connector_audience.sql:33).
- The app was published bound to connected apps, otherwise 'This app was not published with connected apps, so it cannot use yours.' (apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:67).

**Screens and controls**

- 'AI permission' panel with, for each connected app, a legend and a tool list with checkboxes, 'Checking your connected apps' while loading, an error line if the list fails, and buttons 'Allow' and "Don't allow" (apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx:57-140).
- After granting, a review control lets the viewer reopen the choice (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:300).
- Sign-in banner 'Create an account or sign in to use this app's AI and saved data.' with 'Create an account' and 'Sign in' (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:274).

**Journey**

1. The publisher shares the app to a workspace or invited people (not public).
2. The viewer opens the link and signs in.
3. The app calls window.agi.complete with optional connector ids.
4. The page asks 'AI permission'; the viewer chooses tools and clicks 'Allow'.
5. The browser posts the prompt to the server with an idempotency key.
6. The server checks switches, plan, policy, moderation and limits, picks a route, runs the model (and tools) and returns text.
7. The app shows the text.

**What the person sees and gets**

- Response is {text} (packages/contracts/cloud-contracts/src/artifact-runtime.ts:32).
- Readable refusals: 'You chose not to let this app use AI.', 'You chose not to let this app use your connected apps.', 'Your connected apps could not be listed for this app.', 'Your plan cannot use connected apps from published apps.', 'Connected apps in published apps are available on <plan labels>.', and the public-share message (apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:15-17, apps/web/lib/services/artifact-connector-gate.ts:26-34).
- Turn limit messages: 429 when all concurrent AI responses are busy, 403 when the plan excludes AI in apps (apps/web/app/api/artifacts/runtime/artifact-completion.ts:60-90).

**Settings**

- Consent is remembered per viewer, link and exact code revision in browser storage, so republished code asks again (apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:79-100).
- Connector tool permissions and approval policy are read per user (apps/web/lib/services/artifact-runtime-service.ts:373-381).
- Server setting names: AGI_ARTIFACT_AI_ENABLED (flag) and the connector release constant.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three routes exist: complete, connectors and storage under api:POST /api/artifacts/runtime/[token]/ (apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:74, connectors/route.ts:47).
- The connectors route lists, per connector, whether it is connected and which tools are available, needing approval or blocked (packages/contracts/cloud-contracts/src/artifact-runtime.ts:44-72; apps/web/lib/services/artifact-runtime-service.ts:432).
- Connector use is refused on public publications by a database function that returns true only when the audience is not public (apps/web/db/neon/0383_published_artifact_connector_audience.sql:33; apps/web/lib/services/published-artifact-service.ts:620).
- Setting visibility to public is refused with a conflict if the app uses connectors (apps/web/app/api/artifacts/publish/[token]/route.ts:176-179).
- Publishing an artifact that has a live binding starts it as 'invited' instead of 'public' (apps/web/lib/services/published-artifact-service.ts:440).
- Completion pipeline: switch check, coarse release check, public-share check, workspace privacy policy, entitlement and managed compute access, connector gate, moderation, content safety, secret handling, route selection, model and provider policy, egress policy, concurrent-turn slot, then the reserved and finalised usage record (apps/web/app/api/artifacts/runtime/artifact-completion.ts:116-285; apps/web/lib/services/artifact-runtime-service.ts:629-760).
- Google data fails closed: a run offered a Google connector tool runs only on a model that keeps inputs out of training (apps/web/lib/services/artifact-runtime-service.ts:665-671).
- Owner-side live artifacts store a binding of connectors and allowed tools (apps/web/lib/services/artifact-runtime-service.ts:948).

**Incomplete**

- Per-app metering of AI calls is coded in managed-usage-request-service with database function reserve_artifact_runtime_usage_microusd, defined in migration 0391 which is marked not applied (apps/web/lib/services/managed-usage-request-service.ts:785-804; apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4).
- The viewer 'sign-in bridge' is only account sign-in to AGI plus Allow; no flow to connect a new service from inside the published page was found. The connectors list reports connected true or false (packages/contracts/cloud-contracts/src/artifact-runtime.ts:63). What the UI shows for connected false was not read, unknown.

**Present but disconnected or switched off**

- Connectors are switched off by the constant CONNECTOR_RELEASE_STATE = 'coming_soon' (packages/contracts/types/src/connector-release.ts:14).
- AI in apps is switched off unless AGI_ARTIFACT_AI_ENABLED is on; its production value is unknown (apps/web/lib/server/artifact-ai-switch.ts:6).

**Not available**

- No credential-free raw data proxy: the page cannot query a connector directly, only through a model completion [inferred].
- Not on desktop, mobile, CLI, VS Code or Chrome (doc: docs/product/surface-feature-matrix.md:405-409).
- Not for public links by design (apps/web/lib/services/published-artifact-service.ts:109).

## 4. Required behaviour

**Established requirements**

- A proxy lets artifacts read connected-service data without exposing credentials. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S96.18)
- A bridge lets a viewer of a shared app sign in to that app's connected services. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S96.19)
- Connector-based apps cannot be shared publicly. (source: apps/web/lib/services/published-artifact-service.ts:109-111)
- Connector runs pass through managed compute access and entitlement checks. (source: apps/web/app/api/artifacts/runtime/artifact-completion.ts:150-170)
- Connectors are not released yet and AI in apps is off by default. (source: packages/contracts/types/src/connector-release.ts:14; apps/web/lib/server/artifact-ai-switch.ts:6)

**Acceptance criteria**

1. With connectors unreleased, a complete call naming one connector returns 403 connectors_coming_soon.
2. With the AI flag off, any complete call returns 403 artifact_ai_off with 'AI in apps is not available yet.'
3. A complete call with connectors on a public publication returns 403 connectors_not_on_public_share.
4. A viewer on a plan without artifact_connectors gets 403 plan_upgrade_required naming the plan labels.
5. A viewer who clicks "Don't allow" gets the declined message and no server call is made.
6. A viewer who is not the owner calling connectors on an app not bound to connected apps gets 403 connectors_not_declared.
7. A completion reserves and then finalises a usage record; a failed run releases the reservation.
8. Republishing changed code asks for AI permission again.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief status 'missing' is out of date for the web platform: routes, tables and UI exist, only switched off [inferred].
- Viewer sign-in to services probably relies on the viewer's own connections made in the connectors page, not on a flow inside the published page [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief status of S96.18 and S96.19 to 'partial, disabled'.
- [proposed] Add an in-page 'Connect this app' link when a connector reports not connected.
- [proposed] Record the live state of the release constant and the AI flag in one status page for testers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/artifacts/runtime/[token]/complete | `apps/web/app/api/artifacts/runtime/[token]/complete/route.ts` | Published-app completion entry with CSRF, rate limit and connector declaration check. |
| endpoint | POST /api/artifacts/runtime/[token]/connectors | `apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts` | Lists connectors and tools for the consent panel after the plan gate. |
| service | artifact-completion pipeline | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` | Shared gates for published and owned apps. |
| service | artifact-runtime-service | `apps/web/lib/services/artifact-runtime-service.ts` | Route selection, connector plan, tool loop, usage reservation, live artifact bindings. |
| service | artifact-connector-gate | `apps/web/lib/services/artifact-connector-gate.ts` | Release, plan and workspace gate for connected apps in artifacts. |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Release state constant, currently coming_soon. |
| config | artifact_connectors capability | `packages/contracts/types/src/billing-catalog.ts` | Plan list allowed to use connected apps in published apps. |
| config | AGI_ARTIFACT_AI_ENABLED | `apps/web/lib/server/artifact-ai-switch.ts` | Server switch for AI in apps. |
| schema | app_published_artifact_allows_connectors | `apps/web/db/neon/0383_published_artifact_connector_audience.sql` | True only for non-public audiences the caller may run. |
| schema | app_published_artifact_uses_connectors and reserve_artifact_runtime_usage_microusd | `apps/web/db/neon/0391_artifact_runtime_usage_cap.sql` | Draft migration: connector-use flag and per-app usage cap. |
| table | live_artifacts | `apps/web/lib/services/artifact-runtime-service.ts` | Owner bindings of an artifact to connectors and allowed tools (migration 0380 named in the 0391 header; file not read). |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Consent flow, stored consent per revision, sign-in need. |
| component | ArtifactConnectorConsent | `apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx` | 'AI permission' panel with tool checkboxes. |
| service | artifactRuntimeClient | `apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts` | Posts complete and connectors calls with an idempotency key. |
| schema | Runtime request and connector schemas | `packages/contracts/cloud-contracts/src/artifact-runtime.ts` | Limits: 100,000 prompt characters, 10 connectors, 200 allowed tools. |
| endpoint | /api/artifacts/live | `apps/web/app/api/artifacts/live/route.ts` | Owner live artifact list and bindings (not read in detail). |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Reserves and finalises metered usage with the artifact subject. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App calls window.agi.complete; the sandbox page relays it to the host. | device | infrastructure/sandbox/index.html:315-321 |
| Host checks sign-in, then shows the 'AI permission' panel or uses stored consent for this exact code revision. | device | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:306-330 |
| Browser fetches connector and tool descriptions for the panel. | our servers | apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:47-80 |
| Browser posts the prompt, connector ids and allowed tools with an idempotency key. | device and our servers | apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:84-110 |
| Server runs the gates: AI flag, connector release, public-share block, workspace policy, plan entitlement, moderation, safety, secret handling. | our servers | apps/web/app/api/artifacts/runtime/artifact-completion.ts:116-195 |
| Server picks a model route allowed for the plan, checks model and egress policy and takes a concurrent-turn slot. | our servers | apps/web/app/api/artifacts/runtime/artifact-completion.ts:213-271 |
| Server reserves usage, runs the completion or tool loop against the model provider, using the viewer's connector tools, then finalises usage. | outside service | apps/web/lib/services/artifact-runtime-service.ts:682-745 |
| Text returns to the page and then to the app. | device and our servers | packages/contracts/cloud-contracts/src/artifact-runtime.ts:32 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt text and returned text | Sent to the model provider; the usage record keeps token counts, cost and reason, not the prompt (apps/web/lib/services/artifact-runtime-service.ts:712-735) | No | Retention at the provider is unknown. |
| Usage reservation and final cost | managed usage requests table (name from 0391 header: managed_usage_requests) | Server only | unknown |
| Consent choice per viewer, link and code digest | browser localStorage key prefix agiworkforce-artifact-ai | No | Until changed or cleared |
| Live artifact binding (connectors, allowed tools, refresh policy) | table live_artifacts | Server only | Removed by removeLiveArtifact (apps/web/lib/services/artifact-runtime-service.ts:1011) |

**Models and providers.** The route is chosen by selectArtifactRuntimeRoute from the viewer's plan and policies (apps/web/lib/services/artifact-runtime-service.ts:299). It uses managed cloud models only; own-key and Local artifacts are refused for the owner-side run with 'Only an app made in a ... chat can use AI and your connected apps.' (apps/web/app/api/artifacts/runtime/artifact-completion.ts:59-67). Which providers are eligible depends on the catalog and is not listed here, unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in, active account (apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:37-41). |
| Permissions | Viewer must be allowed to run the app. For connectors: audience not public; non-owners need the app to be bound to connectors; workspace feature gate applies (apps/web/lib/services/artifact-connector-gate.ts:36). Tools can be blocked or need approval per the viewer's connector permissions. |
| Subscription | Plan capability artifact_connectors: pro, max, max_15x, team, team_premium, enterprise (packages/contracts/types/src/billing-catalog.ts:341-361). Plain AI calls are subject to managed compute access and the plan's turn slots. |
| Limits and metering | Prompt up to 100,000 characters, up to 10 connectors, up to 200 allowed tools (packages/contracts/cloud-contracts/src/artifact-runtime.ts:3-7). Output cap 4,096 tokens (apps/web/lib/services/artifact-runtime-service.ts:101). Usage is reserved with an estimate and finalised with actual cost; lease 300 s with tools, 120 s without. Per-app call and spend caps depend on unapplied migration 0391. Views and per-app AI metering for billing are not shown anywhere found. |
| Feature flags | AGI_ARTIFACT_AI_ENABLED; CONNECTOR_RELEASE_STATE constant. |
| Model compatibility | A route must exist on the plan, else 'No model on your plan can answer this app right now.' (apps/web/lib/services/artifact-runtime-service.ts:132). Tool loop runs only for providers with an adapter (apps/web/lib/services/artifact-runtime-service.ts:716). |
| Provider restrictions | Google connector tools require a model that keeps inputs out of training (apps/web/lib/services/artifact-runtime-service.ts:665-671). |
| Local mode | No Local path. The run is on our servers and Local or own-key origin artifacts are refused for owned runs (apps/web/app/api/artifacts/runtime/artifact-completion.ts:59-67). Publishing from Local is blocked on mobile (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:300). No on-device connector runtime exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors coming soon | 403 connectors_coming_soon on both the complete and connectors routes. | apps/web/app/api/artifacts/runtime/artifact-completion.ts:122; apps/web/lib/services/artifact-connector-gate.ts:20 |
| AI flag off | 403 artifact_ai_off; page also throws the off message before calling. | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:308 |
| Viewer declines | Call rejects with the declined message; choice remembered as no consent. | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:16,318 |
| Connector list fails | Panel shows an error line 'Your connected apps could not be listed for this app.' | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:17 |
| Concurrent limit reached | 429 concurrent_turn_limit_reached; 503 when the limiter is down and nothing was sent. | apps/web/app/api/artifacts/runtime/artifact-completion.ts:60-90 |
| Provider failure mid-run | Reservation is finalised as failed, or as completed for observed cost; release errors are logged. | apps/web/lib/services/artifact-runtime-service.ts:747-775 |
| Retry with same idempotency key | Replayed key is not double reserved (key built from namespace, supplied key and identity). | apps/web/lib/services/artifact-runtime-service.ts:682-690 |
| Cancel | Aborts when the page or sign-in context changes ('This app changed while the request was pending'). | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:18,330 |
| Offline | not handled in the code beyond a generic failure message. | apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:25 |
| Accessibility | Panel has an aria-label 'AI permission' and aria-live polite; loading and error use status and alert roles. | apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx:57-83 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts`: Complete route behaviour.
- `apps/web/app/api/artifacts/runtime/[token]/connectors/__tests__/route.test.ts`: Connectors route behaviour.
- `apps/web/lib/services/__tests__/artifact-runtime-service.connectors.test.ts`: Connector plan and permissions.
- `apps/web/lib/services/__tests__/artifact-runtime-service.public-share.test.ts`: Refusal of connector use on public shares.
- `apps/web/lib/services/__tests__/artifact-runtime-service.google-user-data.test.ts`: Google data model restriction.
- `apps/web/lib/services/__tests__/artifact-runtime-service.billing.test.ts`: Usage reservation and finalising.
- `apps/web/lib/services/__tests__/artifact-runtime-service.live.test.ts`: Live artifact bindings.
- `apps/web/lib/services/__tests__/published-artifact-service.connectors.test.ts`: Connector audience helpers.
- `apps/web/db/neon/published-artifact-connector-audience-migration.test.ts`: Migration 0383 text.
- `apps/web/db/neon/artifact-runtime-usage-cap-migration.test.ts`: Migration 0391 text.
- `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.test.tsx`: Consent and sign-in behaviour of the host.

**Test scenarios**

- **Connectors refused today**
  1. Use a workspace-shared html app on a paid plan.
  2. Call window.agi.complete with one connector id.
  - Expected: 403 connectors_coming_soon 'Connectors are coming soon.' unless the constant was changed.
- **AI flag**
  1. Set AGI_ARTIFACT_AI_ENABLED to a false value.
  2. Call complete without connectors.
  - Expected: 403 artifact_ai_off.
- **Public link**
  1. With connectors released in a test build, publish a bound app as public.
  2. Call connectors route as a viewer.
  - Expected: 403 connectors_not_on_public_share.
- **Plan gate**
  1. Sign in on a plan outside the capability list.
  2. Call the connectors route on an invited app.
  - Expected: 403 plan_upgrade_required.
- **Consent**
  1. Open the app, trigger AI, click "Don't allow".
  - Expected: Call fails with the declined message; no request in the network log.
- **Spend cap**
  1. Loop complete calls with fresh idempotency keys on an app with migration 0391 applied.
  - Expected: ARTIFACT_RUNTIME_LIMIT_REACHED after the ceiling.

**Where to look when it fails**

- Response codes: connectors_coming_soon, artifact_ai_off, connectors_not_on_public_share, connectors_not_declared, connectors_unavailable, plan_upgrade_required, concurrent_turn_limit_reached, concurrency_limiter_unavailable.
- Error names ArtifactRuntimeRouteUnavailableError and ArtifactRuntimeGoogleUserDataRouteError.
- Log text 'Artifact runtime reservation release could not be persisted'.
- Tables managed_usage_requests and live_artifacts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says both items are missing; code shows routes, UI and gates that are switched off.** Affects: Testers and planners of web. Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:47. Work needed: Correct the brief status and decide the release date for the constant.
- **No in-page flow for a viewer to connect a missing service.** Affects: Viewers on web. Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:63. Work needed: Design the sign-in bridge to link the connectors page.
- **Per-app caps rely on migration 0391, marked not applied.** Affects: All web viewers using AI in apps. Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4. Work needed: Confirm and apply under the approved process.
- **Not on desktop, mobile, CLI, VS Code or Chrome.** Affects: Those apps. Evidence: docs/product/surface-feature-matrix.md:405-409. Work needed: Only a browser hand-off exists; add if parity is wanted.
- **No explanation of which providers are eligible for app runs.** Affects: Testers. Evidence: apps/web/lib/services/artifact-runtime-service.ts:299. Work needed: Document the route policy in the model-routing page.

**Depends on**

- F096-07
- F096-09
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-authentication-and-identity
- surface:web
- mode:cloud
- table:live_artifacts

## Unknown

- Production value of AGI_ARTIFACT_AI_ENABLED.
- Whether migration 0391 is applied.
- Which provider and model routes serve app runs for each plan.
- What the consent panel shows when a connector is not connected.
- Details of the owner-side live artifact UI.
- Whether the fallback frame can reach the bridge.
- Rate limit numbers for the 'model-catalog' and 'llm-completion' buckets used here.
- Retention of prompts at model providers.

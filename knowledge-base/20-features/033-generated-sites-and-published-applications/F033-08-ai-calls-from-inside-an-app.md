---
id: "F033-08"
type: "feature"
title: "AI calls from inside an app"
aliases: ["AI in apps", "AI calls from inside an app", "Artifact runtime", "Model-call allowance for generated apps (S33.20)", "Usage and hosting limits (S33.19)", "artifact_runtime_completion", "AGI_ARTIFACT_AI_ENABLED switch"]
area: "33 Generated Sites and published applications"
available_on: ["web"]
implementation: {web: "built", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.20", "S33.19"]
depends_on: ["surface:web", "mode:cloud", "plan:free", "plan:basic", "plan:pro", "plan:team", "plan:enterprise", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-connectors-plugins-and-skills", "F033-02", "F033-03", "table:managed_usage_requests", "table:published_artifact_storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-08 AI calls from inside an app

A published or owned web app (HTML or React) can ask the assistant a question from inside its page. The server checks a switch, the viewer's plan and a per-app ceiling, picks a model, and bills the signed-in viewer, never the publisher. The switch is off by default.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.20](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3320), [S33.19](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3319).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a generated app a safe route to the AI service. The page sends a prompt to the runtime endpoint; the server runs it as managed cloud usage with a per-app call and spend limit and returns text (artifact-completion.ts:280-318).

**Why it exists.** A generated app such as a summarizer or quiz needs a model, but cannot hold an API key. A bridge through the product keeps keys, moderation and billing on the server (docs/security/security.md:1250-1271).

**Who uses it.** A signed-in viewer using a published app, and an owner using an app saved in their own managed chat.

**Problems it solves**

- Apps with working AI without exposing a key.
- One looping app emptying a person's whole five-hour allowance (per-app ceilings, migration 0391 header).
- Publisher being billed for strangers' use: calls bill the viewer (route.test.ts:407).
- Connected-app data leaking through public pages (connectors refused on a public share).

**Use cases**

- A viewer opens a shared 'explain this text' app, signs in and gets answers.
- An owner tries the app they built in a chat before publishing.
- A published app that reads connected apps asks the viewer to approve before it runs.

## 2. User experience

**Where to find it**

- Web published page: /shared-artifact/<token> shows the app in a sandboxed frame (PublishedArtifactView.tsx:249-326).
- Web chat: the artifact preview of an owned HTML or React app uses the live route (apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/route.ts).
- Desktop shows the hosted web app, but the shared desktop frame and the extension refuse runtime requests (docs/security/security.md:1256-1258).
- Mobile, CLI, VS Code, Chrome: none found in the code.

**Before you start**

- Server switch AGI_ARTIFACT_AI_ENABLED on (artifact-ai-switch.ts:5-8).
- A signed-in viewer; a signed-out visitor sees a banner and no request is billed (usePublishedArtifactRuntime.ts:309-334; route.test.ts:419).
- A plan that includes AI responses in apps and managed compute access (artifact-completion.ts:114-127, 183-189).
- The app kind is html or react (PublishedArtifactView.tsx:68).
- For an owned app: it was made in a managed cloud chat (artifact-completion.ts:63-72).

**Screens and controls**

- Banner 'Create an account or sign in to use this app's AI and saved data.' with buttons 'Create an account' and 'Sign in' (PublishedArtifactView.tsx:267-289).
- Consent panel ArtifactConnectorConsent when the app asks for AI or connected apps (PublishedArtifactView.tsx:291-296).
- After consent: buttons 'Refresh data' and 'Connected apps' (PublishedArtifactView.tsx:297-319).
- No owner control for the per-app allowance found in the code.

**Journey**

1. The viewer opens the shared link.
2. The page loads the app in a sandboxed frame with the runtime bridge.
3. The app asks for AI; the page asks the viewer to allow it (consent stored in the browser and bound to the exact code).
4. The page posts the prompt to the runtime complete endpoint with the viewer's session.
5. The server runs the gates in order and, if all pass, returns { text }.
6. The app shows the answer; a refusal shows its message instead.

**What the person sees and gets**

- Success: the app receives the model text.
- Switch off: message 'AI in apps is not available yet.' with code artifact_ai_off, status 403 (artifact-ai.ts:1-3; artifact-completion.ts:114-116).
- Per-app limit: 'This app has used as much AI as one app may in 5 hours. Your other chats and apps are not affected.' status 429, code artifact_runtime_limit_reached (managed-usage-request-service.ts:436-441).
- Concurrency: 429 concurrent_turn_limit_reached; plan excluded: 403 (artifact-completion.ts:88-105).
- Other refusals: content_policy_violation 422, secrets_blocked 403, model_unavailable 503, connectors_not_on_public_share 403.

**Settings**

- Server switch AGI_ARTIFACT_AI_ENABLED, default off.
- Per-plan calls per app: maxArtifactAiCallsPerApp in the billing catalog (billing-catalog.ts:568-719).
- Share of the five-hour budget one app may spend: ARTIFACT_RUNTIME_SHARE_OF_FIVE_HOUR_BUDGET (managed-usage-limits.ts:29).
- Viewer consent is remembered in browser storage key prefix agiworkforce-artifact-ai (usePublishedArtifactRuntime.ts:56-62).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Gate order in respondToArtifactCompletion: switch, connector release, public-share rule, workspace privacy policy, entitlement and managed compute access, moderation, content-safety preference, secret handling, route selection, model policy, egress gate, connector plan, turn slot, then the run (artifact-completion.ts:111-318).
- completeArtifactPrompt re-checks the switch, refuses connectors on a public share, refuses Google user-data tools on a model that may train, reserves usage with the app as subject, runs the call, then settles the reservation (artifact-runtime-service.ts:629-760).
- Per-app ceilings are applied at reservation through reserve_artifact_runtime_usage_microusd (managed-usage-request-service.ts:785-826).
- Output tokens per call are capped at 4,096 (artifact-runtime-service.ts:101).
- Billing identity is the signed-in viewer (route.test.ts:407-428; docs/security/security.md:1252-1254).
- Owned apps use a parallel route with a binding check (live/[artifactId]/complete/route.ts:56-75).

**Incomplete**

- The product shows a limit refusal after the fact; a usage display for the app owner or viewer was not found (S33.19 says limits are shown to the owner).
- The consent line wording needs counsel approval before release (audit/decisions/founder-actions.md:43-48).

**Present but disconnected or switched off**

- Everything is behind AGI_ARTIFACT_AI_ENABLED, off by default, so the call is refused until it is set (artifact-ai-switch.ts:5-8; docs/security/security.md:1271). The founder checklist lists switching it on as a pending action (audit/decisions/founder-actions.md:43-48).
- Connected-app calls are refused while connectors are 'coming soon' (artifact-completion.ts:119-121; route.test.ts:683-701).
- Migration 0391's own header says 'NOT YET APPLIED', but audit/decisions/founder-actions.md:47 states 0380 and 0391 are applied in production. The header is stale or the note is; not verified here.

**Not available**

- Desktop shared frame, Chrome extension: runtime requests are refused by design (docs/security/security.md:1256-1258).
- Mobile, CLI, VS Code: none found in the code.
- Own-key and Local routing for app AI calls: none found; the route is the platform key (artifact-completion.ts:187-196 uses routeKeyAttribution 'platform-key').
- Billing AI to usage credits: refused with artifact_runtime_funding_unsupported (managed-usage-request-service.ts:763-769).
- An owner control to set a per-app allowance: none found in the code.

## 4. Required behaviour

**Established requirements**

- S33.20: generated apps get an allowance of model calls through the product. Brief status: web done; desktop, mobile, CLI, VS Code missing; Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.20)
- S33.19: usage and hosting limits are enforced and shown to the owner. Brief status: VS Code missing, Chrome unverified; other apps not listed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.19)
- Every call bills the signed-in viewer, never the publisher; a signed-out visitor reaches no reservation. (source: docs/security/security.md:1252-1254)
- Each app's calls and spend are capped per viewer under the reservation lock, at the first reservation and at every later provider step. (source: docs/security/security.md:1263-1265)
- The bridge stays behind AGI_ARTIFACT_AI_ENABLED, off by default, until an independent review signs off. (source: docs/security/security.md:1271-1273)
- Security behavior fails closed; Local, BYOK and managed cloud are separate trust boundaries. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With the switch off, a complete request returns 403 with code artifact_ai_off and no reservation is made.
2. A signed-out caller gets 401 and nothing is billed.
3. A viewer of a public app who asks for connected apps gets 403 connectors_not_on_public_share.
4. The call count for one app and viewer inside five hours stops at the plan's per-app count and returns 429 artifact_runtime_limit_reached.
5. The reservation row names the app as published:<id> or owned:<id>.
6. A prompt over the allowed length gets 400 invalid_prompt.
7. A run offered a Google connector tool is refused unless the route keeps inputs out of training.
8. The publisher's usage is unchanged after a viewer runs the app.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The owner should be able to see how much AI an app has used [inferred from S33.19 'shown to the owner'; no such screen found].
- The product should explain on the page when the per-app limit is reached [inferred; the API message exists, the page display not read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A per-app usage panel in the published apps list.
- [proposed] An owner setting to lower the per-app ceiling or turn AI off per app.
- [proposed] Support for the viewer's own key (mode:own-key) as an explicit, consented route.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | artifact-runtime-service | `apps/web/lib/services/artifact-runtime-service.ts` | completeArtifactPrompt (629), route selection (299), tool loop (529), storage helpers; MAX_OUTPUT_TOKENS at 101. |
| service | respondToArtifactCompletion | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` | Ordered gates and refusals shared by both routes (111-318). |
| endpoint | POST /api/artifacts/runtime/[token]/complete | `apps/web/app/api/artifacts/runtime/[token]/complete/route.ts` | Published app completion; CSRF, session, rate limit, schema, readRunnableArtifact. |
| endpoint | POST /api/artifacts/runtime/live/[artifactId]/complete | `apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/route.ts` | Owned app completion; checks managed origin and live binding. |
| config | artifactAiEnabled | `apps/web/lib/server/artifact-ai-switch.ts` | Reads AGI_ARTIFACT_AI_ENABLED; off unless 1, true, yes or on. |
| config | AI-off message and code | `apps/web/lib/artifact-ai.ts` | ARTIFACT_AI_OFF_CODE and message. |
| service | reserveManagedUsageRequest | `apps/web/lib/services/managed-usage-request-service.ts` | Reservation with artifactSubject (755-830), refusal mapping (436), step extension (991). |
| config | getArtifactRuntimeUsageLimits | `apps/web/lib/server/managed-usage-policy.ts` | Per-app call count and share of five-hour budget (184-206). |
| config | Billing catalog per-app calls | `packages/contracts/types/src/billing-catalog.ts` | maxArtifactAiCallsPerApp per plan (530, 568-719); getPlanMaxArtifactAiCallsPerApp (797). |
| config | ARTIFACT_RUNTIME_SHARE_OF_FIVE_HOUR_BUDGET | `packages/contracts/types/src/managed-usage-limits.ts` | Share of the five-hour budget one app may use (line 29). |
| schema | Migration 0391 | `apps/web/db/neon/0391_artifact_runtime_usage_cap.sql` | artifact_subject column and reserve/extend SQL functions. |
| table | managed_usage_requests | `apps/web/db/neon/0391_artifact_runtime_usage_cap.sql` | Holds the reserved rows with artifact_subject. |
| table | published_artifact_storage | `apps/web/db/neon/0325_published_artifact_storage.sql` | App key-value store used by the runtime bridge (storage route). |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Bridge host: consent, sign-in need, switch-off message (309), consent storage. |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Renders the sandboxed app, sign-in banner, consent panel. |
| component | ArtifactConnectorConsent | `apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx` | Consent prompt for AI and connected apps. |
| service | artifactRuntimeClient | `apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts` | Client call to the runtime endpoints. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | publishedArtifactAllowsConnectors, PUBLISHED_TOKEN_REGEX. |
| service | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Passes aiEnabled={artifactAiEnabled()} to the view (line 94). |
| test | Runtime billing tests | `apps/web/lib/services/__tests__/artifact-runtime-service.billing.test.ts` | Switch-off refusal and usage attribution. |
| test | Per-app cap tests | `apps/web/lib/services/__tests__/managed-usage-request-service.artifact-cap.test.ts` | Reservation through the per-app ceiling. |
| test | Complete route tests | `apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts` | Route gates and billing identity. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app inside the sandboxed frame posts a request to the page bridge; the page blocks it if the switch prop is off or the viewer is signed out. | device | apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:309-334 |
| The page sends the prompt to the complete endpoint with the session and CSRF token. | our servers | apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:27-40 |
| The server checks the switch, workspace policy, entitlement, moderation, content safety and secret handling. | our servers | apps/web/app/api/artifacts/runtime/artifact-completion.ts:111-183 |
| The server picks a model route through managed cloud admission, applies the model policy and the egress gate. | our servers | artifact-runtime-service.ts:299-333; artifact-completion.ts:184-216 |
| A turn slot is taken, then usage is reserved with the app as subject; per-app ceilings apply here. | our servers | artifact-completion.ts:272-277; artifact-runtime-service.ts:682-705; managed-usage-request-service.ts:785-826 |
| The model call (or a tool loop with connectors) runs with the platform key; output is capped at 4,096 tokens. | outside service | artifact-runtime-service.ts:101, 489, 564, 579 |
| The reservation is finalized with the observed cost, or released on failure; the text is returned. | our servers | artifact-runtime-service.ts:707-760 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage reservation row with provider, model, estimated and actual cost, artifact_subject. | table managed_usage_requests in the cloud database. | Server only; it feeds the shared usage ledger. | Retention unknown here. |
| App saved data written by the app. | table published_artifact_storage, capped by ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES per scope. | Server only. | Deleted with the publication (foreign key on delete cascade, 0325 line 5) or cleared by the owner (data route DELETE). |
| Viewer's consent to AI. | Browser localStorage key agiworkforce-artifact-ai:<scope>:<key>. | No. | Stays until the viewer revokes or clears storage (usePublishedArtifactRuntime.ts:56-95). |

**Models and providers.** The server chooses the model through the shared managed cloud route admission, not the app or the viewer; the route can need tool calling when connectors are present and must keep inputs out of training for Google user data (artifact-runtime-service.ts:299-333). Calls use the platform key (artifact-completion.ts:187-196). Model identifiers are resolved by the catalog and are not written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is required; signed-out gets 401 (route.test.ts:449) and the page shows a sign-in banner. |
| Permissions | CSRF token, active account and rate limit 'llm-completion' per user (route.ts:33-38). Published apps must be runnable; an owned app must be in the viewer's own chat and made in a managed cloud chat. Connector use on a published app needs the publisher to have bound connectors (route.ts:50-60). Workspace privacy policy can forbid managed AI (artifact-completion.ts:131-143). |
| Subscription | Entitlement is resolved per viewer (resolveEntitlementBundle) and managed compute access is evaluated; plans without AI responses in apps are refused (artifact-completion.ts:103-105, 153-168). Per-app call counts differ by plan in the billing catalog (billing-catalog.ts:568-719): free has a finite count, some tiers are unlimited, enterprise is 'custom'. |
| Limits and metering | Per-app calls and spend per viewer in a rolling five-hour window; spend share is a fraction of the plan's five-hour budget; 4,096 output tokens per call; prompt length cap ARTIFACT_RUNTIME_MAX_PROMPT_CHARS; concurrency slot per plan; the plan's own five-hour and weekly limits still apply; app calls cannot use usage credits (managed-usage-request-service.ts:763-769). |
| Feature flags | AGI_ARTIFACT_AI_ENABLED (server, default off). Connector release switch (connectorsReleased). |
| Model compatibility | Server-chosen. With connectors, a model with function calling is required; for Google data a no-training route is required (artifact-runtime-service.ts:305-313). |
| Provider restrictions | Platform-key managed route only; no provider key from the viewer or publisher is used (artifact-completion.ts:187-196). |
| Local mode | Not available. The call runs on our servers; an owned app must come from a managed cloud chat (artifact-completion.ts:63-72). Local inference is not used by this path [inferred: no local route in the code read]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Switch off | 403 artifact_ai_off 'AI in apps is not available yet.' before any reservation. | artifact-runtime-service.ts:641-643; artifact-runtime-service.billing.test.ts:89-99 |
| Signed out | Banner and no request billed; API answers 401. | usePublishedArtifactRuntime.ts:313; route.test.ts:419-428, 449 |
| Per-app ceiling reached | 429 artifact_runtime_limit_reached; other chats unaffected. | managed-usage-request-service.ts:436-441 |
| Plan five-hour or weekly limit reached | 429 with the rolling window message. | managed-usage-request-service.ts:442-452 |
| Concurrency ceiling or limiter outage | 429 or 503 and no model request is sent. | artifact-completion.ts:88-109 |
| No model route | 503 model_unavailable. | artifact-completion.ts:204-207 |
| Request aborted mid tool loop | No partial result is delivered. | artifact-runtime-service.billing.test.ts:123-138 |
| Provider failure | Reservation released or settled at observed cost; error thrown. | artifact-runtime-service.ts:735-760 |
| Public page asks for connected apps | 403 connectors_not_on_public_share. | artifact-runtime-service.ts:652-662 |
| App changed while pending | Message 'This app changed while the request was pending...'. | usePublishedArtifactRuntime.ts:17-18 |
| Offline or timeout | Server route maxDuration is 300 seconds; client offline handling: not handled in the code that was read. | route.ts:19 |
| Desktop frame or extension | Runtime requests refused. | docs/security/security.md:1256-1258 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/artifact-runtime-service.billing.test.ts`: Switch-off refusal before reservation, subject attribution for published and owned apps, tool-loop cancellation, prompt-injection boundary.
- `apps/web/lib/services/__tests__/artifact-runtime-service.public-share.test.ts`: Connectors refused on a public share, fail-closed visibility read.
- `apps/web/lib/services/__tests__/artifact-runtime-service.google-user-data.test.ts`: Google user-data tools need a no-training model.
- `apps/web/lib/services/__tests__/managed-usage-request-service.artifact-cap.test.ts`: Per-app reservation, refusal wording, credits refused, step re-check, limits from the catalog.
- `apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts`: Route gates, billing identity, concurrency slot, moderation, connectors, switch-off.
- `apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/__tests__/route.test.ts`: Owned-app route (file present; contents not read).
- `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.test.tsx`: Bridge hook behaviour (file present; contents not read).

**Test scenarios**

- **Switch off**
  1. Leave AGI_ARTIFACT_AI_ENABLED unset.
  2. Open a shared HTML app that calls AI while signed in.
  - Expected: The app receives 'AI in apps is not available yet.'; no managed_usage_requests row is added.
- **Viewer billing**
  1. Enable the switch on a test deployment.
  2. Sign in as a viewer different from the publisher.
  3. Run one prompt.
  - Expected: Usage rises for the viewer only; the row's artifact_subject is published:<id>.
- **Per-app ceiling**
  1. With a free-plan viewer, call the app repeatedly in five hours.
  - Expected: After the plan's per-app count, status 429 artifact_runtime_limit_reached, while normal chat still works.
- **Signed out**
  1. Open the link in a private window and trigger AI.
  - Expected: Banner with Create an account and Sign in; no request reaches the server.
- **Public connector refusal**
  1. Publish an app publicly that asks for a connected app.
  - Expected: 403 connectors_not_on_public_share.

**Where to look when it fails**

- Response body error.code values listed above.
- Table managed_usage_requests, column artifact_subject.
- Log line 'Artifact runtime reservation release could not be persisted' (artifact-runtime-service.ts:753-756).
- Log '[artifact-runtime] content safety unread' (artifact-completion.ts:171).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **The whole feature is off by default and not yet released.** Affects: All viewers and owners on web.. Evidence: docs/security/security.md:1271-1273; audit/decisions/founder-actions.md:43-48.. Work needed: Independent review sign-off, counsel approval of the consent line, then set the switch.
- **No owner-facing control or display of the per-app allowance or usage.** Affects: Owners (S33.19).. Evidence: No UI found in the code read; limits appear only as refusals.. Work needed: Show per-app usage and limits in the published apps list.
- **Unavailable on desktop shared frame, Chrome, mobile, CLI and VS Code.** Affects: Those apps.. Evidence: docs/security/security.md:1256-1258; brief S33.20.. Work needed: Decide whether those surfaces should run published apps; if so, add a safe bridge.
- **No Local or own-key route for app AI calls.** Affects: Local-mode and own-key users.. Evidence: artifact-completion.ts:187-196 platform-key only.. Work needed: Define an explicit consented route per trust boundary.
- **Stale migration header says not applied while a founder note says applied in production.** Affects: Engineers deciding whether the cap is live.. Evidence: 0391 header vs founder-actions.md:47.. Work needed: Verify applied state and fix the stale text.
- Not built on: Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- mode:cloud
- plan:free
- plan:basic
- plan:pro
- plan:team
- plan:enterprise
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-connectors-plugins-and-skills
- F033-02
- F033-03
- table:managed_usage_requests
- table:published_artifact_storage

## Unknown

- Whether migration 0391 is applied in every environment (header says no; founder note says yes in production).
- Exact per-plan call counts as the product sells them today; the catalog holds config values that can change.
- Whether the owned-app path in chat is wired to a visible control (the route exists; the chat component was not traced).
- Retention period of managed_usage_requests rows.
- Whether the Chrome extension has any app-AI path (brief says missing; code not searched exhaustively).
- Whether any listed test has passed; no result file was read.

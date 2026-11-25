---
id: "F026-10"
type: "feature"
title: "Connected-data status, refresh, and artifact usage (not built per brief)"
aliases: ["Connected-data status, refresh, and artifact usage", "Live artifacts", "Live updates (connected apps)", "Refresh data", "Connected apps in published apps", "AI permission consent", "S26.33, S26.34, S26.37"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S26.33", "S26.34", "S26.37"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-10 Connected-data status, refresh, and artifact usage (not built per brief)

A web-only 'live artifact' lets an HTML or React artifact read the owner's connected apps, shows 'Updated <time>' or 'Connect <app> to refresh', and has a 'Refresh data' button. It is switched off while connectors are 'coming soon'. No screen shows per-artifact usage; server limits exist but are not shown.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.33](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2633), [S26.34](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2634), [S26.37](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2637).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows which connected apps an artifact reads and whether they are ready, re-loads the artifact's data on demand without asking the assistant to rebuild it, and (server side only) counts and caps the AI calls an artifact makes.

**Why it exists.** The brief requires per-artifact connected-data status, refresh and usage (S26.33, S26.34, S26.37). A live dashboard that reads Gmail or a tracker needs a way to refresh and to know if a connection broke, and an app that loops on AI must not drain the person's allowance (migration header, apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:1-30).

**Who uses it.** Owners of HTML or React artifacts on a plan with connected apps; viewers of published apps who are asked to allow AI and app access.

**Problems it solves**

- Stale dashboards without regenerating them.
- Not knowing a connector is disconnected.
- Runaway AI use by one artifact.

**Use cases**

- A weekly numbers dashboard that refreshes from connected apps when opened.
- Switching an artifact to refresh only when asked.
- Stopping live updates for an artifact.
- A visitor to a published app sees which apps it wants and chooses which tools to allow.

## 2. User experience

**Where to find it**

- Web viewer: when an artifact is live, a strip under the toolbar shows a 'Live' pill (link to the Live artifacts page), text 'Updated <relative time>' or 'Not refreshed yet' or 'Connect <apps> to refresh', a 'Refresh data' button and a 'Live options' menu with 'Refresh when opened' or 'Refresh only when I ask' and 'Stop live updates' (apps/web/app/chat/live-artifacts/LiveArtifactControls.tsx:27-125; ArtifactPreview.tsx:3105).
- Web page 'Live artifacts' (sidebar item 'Live artifacts', route /chat/live-artifacts) lists live artifacts with 'Artifacts that refresh with data from your connected apps.' and 'New live artifact' (apps/web/shared/components/layout/app-nav-items.ts:162-169; apps/web/app/chat/live-artifacts/LiveArtifactsView.tsx:205-264).
- Consent card 'AI permission' (on a published app and on a live artifact): per connected app, checkboxes for each tool, notes 'Not connected. Connect it in Settings, Connectors, to use this part of the app.', 'Blocked in your settings.', buttons 'Allow' and "Don't allow" (apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx).
- Usage: no per-artifact usage screen on any app [searched apps/web, apps/mobile, apps/cli for artifact_subject and artifact usage display; only the server migration, a policy function and tests matched].
- Desktop (Electron) follows web [inferred]. Matrix doc says desktop, mobile, CLI, VS Code and Chrome do not render published apps (doc: docs/product/surface-feature-matrix.md:402-410).

**Before you start**

- Connected apps must be released: the release state constant is 'coming_soon' today (packages/contracts/types/src/connector-release.ts:14), so these flows are refused.
- The AI switch AGI_ARTIFACT_AI_ENABLED must be on (apps/web/lib/server/artifact-ai-switch.ts:5-9).
- A plan with the 'artifact_connectors' capability: pro, max, max_15x, team, team_premium, enterprise (packages/contracts/types/src/billing-catalog.ts:341,361).
- An HTML or React artifact saved in one of the owner's Cloud chats (apps/web/app/api/artifacts/live/[artifactId]/route.ts:41-42,109-110).

**Screens and controls**

- Live strip, Refresh data, Live options menu, confirm 'Stop live updates?'.
- Live artifacts page cards with Open, refresh policy and Stop live updates.
- AI permission consent card.

**Journey**

1. Open a live artifact in the panel; the strip shows when it was last refreshed.
2. If a needed app is not connected, the strip says 'Connect <app> to refresh'.
3. Press 'Refresh data'; the preview frame reloads and the page asks for data again (apps/web/app/chat/live-artifacts/useLiveArtifactRuntime.ts:208-212; ArtifactPreview.tsx:3264).
4. When the page first asks to use AI or apps, the consent card appears; choose Allow or Don't allow.
5. Optional: choose 'Refresh only when I ask' so loading the artifact does not pull data.
6. Stop live updates with confirmation; the artifact stays in its chat.

**What the person sees and gets**

- Strip text, toasts 'The refresh setting could not be saved.' and 'Live updates could not be stopped.', messages 'This artifact refreshes only when you ask. Select Refresh data to load current data.' (useLiveArtifactRuntime.ts:22-23), refusal 'Connectors are coming soon.'.
- No usage figures are shown.

**Settings**

- Refresh policy per artifact: 'on_open' or 'manual' (live-artifact-contract.ts:14-15).
- Connector tool allow list per artifact.
- Settings, Connectors (to connect apps).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Live binding store and routes: read, bind (PUT), change refresh policy (PATCH), remove (DELETE) with audit events (apps/web/app/api/artifacts/live/[artifactId]/route.ts:86-166; apps/web/db/neon/0380_live_artifacts.sql:27).
- Viewer strip and hook with readiness 'ready' or 'needs_connection' and missing connectors (live-artifact-contract.ts:20-21,50-60; LiveArtifactControls.tsx:46-86).
- Consent card shows per app 'connected or not' and per tool availability (ArtifactConnectorConsent.tsx).
- Server completion and connector describe routes with plan, workspace, moderation, content safety, secret handling and managed-usage reservation (apps/web/app/api/artifacts/runtime/artifact-completion.ts:115-200,270-310; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:43-90).

**Incomplete**

- The brief calls S26.33 and S26.34 missing; the code exists but is disabled while connectors are 'coming soon'.
- Status shows only 'ready' or 'needs connection' per binding; there is no per-source unhealthy state beyond 'connected'.
- Per-artifact usage is capped and attributed on the server, but nothing reads it back for display (artifact_subject appears only in the migration, the reservation call and tests).

**Present but disconnected or switched off**

- connectorsReleased() is false, so the connectors and completion routes answer 403 'connectors_coming_soon' (apps/web/lib/services/artifact-connector-gate.ts:20-25; artifact-completion.ts:121-123).
- AI inside artifacts is off unless AGI_ARTIFACT_AI_ENABLED is set (artifact-ai-switch.ts:5-9; artifact-completion.ts:116-118).
- Cloud-document saves hidden until release (ArtifactPreview.tsx:2448,2459; ArtifactPreview.connectorsUnreleased.test.tsx).
- Migration 0391 header says 'NOT YET APPLIED : draft only' while managed-usage-request-service.ts:804 calls the function it creates; applied status is unknown.
- The live binding PUT does not itself check connectorsReleased (route.ts:92-120 shows only origin and runnable checks).

**Not available**

- Mobile, CLI, VS Code, Chrome: no live artifacts, refresh or per-artifact usage (doc: docs/product/surface-feature-matrix.md:402-410; no code found).
- Public share of an artifact that reads connected apps is refused (artifact-connectors route.ts:56-60).

## 4. Required behaviour

**Established requirements**

- S26.33: an artifact that reads connected data shows which sources it uses and whether they are connected or healthy. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.33)
- S26.34: refresh re-pulls the connected data without regenerating the artifact. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.34)
- S26.37: the user can see usage attributable to a specific artifact. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.37)
- Connected apps in artifacts are present on web only; other apps do not render published apps. (source: docs/product/surface-feature-matrix.md:402-410)

**Acceptance criteria**

1. With connectors released and a Pro-or-higher plan, a live artifact shows 'Updated <time>' after Refresh data.
2. If a bound app is disconnected, the strip says 'Connect <app> to refresh' and Refresh does not return that app's data.
3. Choosing 'Refresh only when I ask' stops data loading on open until Refresh data is pressed.
4. While connectors are 'coming soon', the connectors route answers 403 with code connectors_coming_soon.
5. Without the AI switch, completion answers 403 with the artifact-AI-off code.
6. A public link cannot be set on a publication that uses connectors (409 conflict message).
7. Per-artifact usage, when built, equals the sum of that artifact's ledger rows in the account usage numbers.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Per-artifact usage should read the artifact_subject column. [inferred]
- Refresh is a reload of the preview frame, not a model call. [inferred from useLiveArtifactRuntime.ts:208-212 and ArtifactPreview.tsx:3264]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show per-app status icons (connected, expired, blocked) in the strip.
- [proposed] Add an 'Usage' line in the strip using the existing reservation records.
- [proposed] Verify migration 0391 is applied before exposing any usage view.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LiveArtifactControls | `apps/web/app/chat/live-artifacts/LiveArtifactControls.tsx` | Strip with status, Refresh data, options, stop. |
| hook | useLiveArtifactRuntime | `apps/web/app/chat/live-artifacts/useLiveArtifactRuntime.ts` | Binding, consent, refresh key, policy (:56,:208). |
| service | live-artifact-client | `apps/web/app/chat/live-artifacts/live-artifact-client.ts` | Calls the live routes. |
| schema | live-artifact-contract | `apps/web/app/chat/live-artifacts/live-artifact-contract.ts` | Policies, readiness values, paths. |
| screen | LiveArtifactsView | `apps/web/app/chat/live-artifacts/LiveArtifactsView.tsx` | List page. |
| component | ArtifactPreview live mount | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | useLiveArtifactRuntime (:551), strip (:3105), refresh key (:3264). |
| component | ArtifactsPanel liveRuntime | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | liveRuntime only for managed-origin artifacts (:852). |
| component | ArtifactConnectorConsent | `apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx` | Consent card with connection state. |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Runtime for published apps. |
| endpoint | /api/artifacts/live and /api/artifacts/live/[artifactId] | `apps/web/app/api/artifacts/live/[artifactId]/route.ts` | GET, PUT, PATCH, DELETE of the binding. |
| endpoint | POST /api/artifacts/runtime/[token]/connectors | `apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts` | Describes connected apps for a published app. |
| endpoint | /api/artifacts/runtime/live/[artifactId]/connectors and /complete | `apps/web/app/api/artifacts/runtime/live/[artifactId]/connectors/route.ts` | Same for live artifacts. |
| service | artifact-completion | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` | Gates, moderation, turn slot, completion, refresh record (:115-310). |
| service | artifact-connector-gate | `apps/web/lib/services/artifact-connector-gate.ts` | Release and plan gate (:14-45). |
| service | artifact-runtime-service | `apps/web/lib/services/artifact-runtime-service.ts` | Binding persistence and connector description. |
| config | AGI_ARTIFACT_AI_ENABLED | `apps/web/lib/server/artifact-ai-switch.ts` | Environment switch for AI in artifacts. |
| config | connector release state | `packages/contracts/types/src/connector-release.ts` | CONNECTOR_RELEASE_STATE (:14) and connectorsReleased (:46). |
| config | billing capability artifact_connectors | `packages/contracts/types/src/billing-catalog.ts` | Plan list (:361) and label (:419). |
| service | managed-usage-request-service (artifact cap) | `apps/web/lib/services/managed-usage-request-service.ts` | Reserve per-artifact usage (:770-830). |
| config | getArtifactRuntimeUsageLimits | `apps/web/lib/server/managed-usage-policy.ts` | Per-app call and spend ceiling (:194-205). |
| table | live_artifacts | `apps/web/db/neon/0380_live_artifacts.sql` | Binding row (:27). |
| schema | 0391 artifact runtime usage cap | `apps/web/db/neon/0391_artifact_runtime_usage_cap.sql` | artifact_subject column and reservation function; header says not yet applied. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Viewer loads the live binding for the artifact and shows readiness. | device and our servers | useLiveArtifactRuntime.ts:56-110; live route GET (:86-90) |
| When the page asks for AI or apps, the host lists the needed connectors; the server describes them and their connected state, after the release and plan gates. | our servers | [token]/connectors/route.ts:43-90; artifact-connector-gate.ts:14-45 |
| The person allows or declines; the answer and chosen tools are saved on the binding. | device and our servers | ArtifactConnectorConsent.tsx; live route PUT :92-120 |
| Refresh data bumps a key so the preview frame reloads and the page requests data again. | device | useLiveArtifactRuntime.ts:208-212; ArtifactPreview.tsx:3264 |
| Each AI request the page makes goes to the completion route, which applies gates, moderation, content-safety and secret handling, takes a turn slot, reserves managed usage with a per-artifact ceiling and returns text. | our servers | artifact-completion.ts:115-310; managed-usage-request-service.ts:770-830 |
| The model call runs on the managed route chosen by the server for artifact prompts. | outside service | completeArtifactPrompt is called at artifact-completion.ts:278; provider not read. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Live binding (connectors, allowed tools, refresh policy, last refreshed time) | table live_artifacts | Server only | Deleted by 'Stop live updates' (DELETE route). |
| Managed usage reservations with artifact subject 'owned:<id>' or 'published:<id>' | managed_usage_requests (column from 0391) | Server only | Per the usage ledger; retention unknown. |

**Models and providers.** The page's AI calls use a managed route resolved on the server (ArtifactRuntimeRouteUnavailableError, artifact-completion.ts:303-305); the provider is not chosen by the person. Connected-app data passes through connector tools and is visible to the model, as the consent card states.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the account must be active (assertAccountActive in the live and runtime routes). |
| Permissions | Only the owner can bind a live artifact (readOwnedRunnableArtifact). Consent chooses allowed tools; tools blocked or needing approval in settings are shown unavailable. Workspace feature gate 'artifact_connectors' via buildWorkspaceFeatureGateResponse (artifact-connector-gate.ts:44). |
| Subscription | Plan capability 'artifact_connectors' for pro, max, max_15x, team, team_premium and enterprise (billing-catalog.ts:341,361); error 'Connected apps in published apps are available on <plans>.' (artifact-connector-gate.ts:34-41). Managed compute access is also evaluated (artifact-completion.ts:150-160). |
| Limits and metering | Per-artifact AI call ceiling and a share of the five-hour budget from plan catalogs (managed-usage-policy.ts:194-205), enforced by the reservation function in migration 0391 (applied status unknown). Rate limits 'model-catalog' (connectors) and 'llm-completion' (complete) (runtime routes). Up to ten connected apps per request (connectors route message). Calls count toward the plan's usage (consent text). |
| Feature flags | CONNECTOR_RELEASE_STATE (coming_soon) and AGI_ARTIFACT_AI_ENABLED; both off by default. |
| Model compatibility | The artifact page chooses no model; the server picks the route. Not model-selectable by the person. |
| Provider restrictions | Managed Cloud provider routes only; no own-key route for artifact AI found. |
| Local mode | Not available in Local mode: the live PUT refuses artifacts that did not come from managed Cloud (ownedArtifactOriginRefusal at route.ts:109-110) and the panel mounts the live runtime only for managed-origin artifacts (ArtifactsPanel.tsx:852). Nothing runs on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not refreshed yet | Strip says 'Not refreshed yet'. | LiveArtifactControls.tsx:46-48 |
| Needs connection | Strip says 'Connect <apps> to refresh'. | LiveArtifactControls.tsx:88-92 |
| Loading connectors in consent | Spinner 'Checking your connected apps'. | ArtifactConnectorConsent.tsx:74-80 |
| Connectors cannot be listed | Consent shows 'Your connected apps could not be listed for this app.' | useLiveArtifactRuntime.ts:27 |
| Declined | Page gets 'You chose not to let this app use AI.' or the apps message. | useLiveArtifactRuntime.ts:25-26 |
| Artifact changed while pending | 'This artifact changed while the request was pending. Try again.' | useLiveArtifactRuntime.ts:28 |
| Release or AI off | HTTP 403 with code connectors_coming_soon or the AI-off code. | artifact-completion.ts:116-123 |
| Plan too low | 403 'plan_upgrade_required'. | artifact-connector-gate.ts:31-42 |
| Public share with connectors | 403 connectors_not_on_public_share. | [token]/connectors/route.ts:56-60 |
| Usage cap reached | Error code ARTIFACT_RUNTIME_LIMIT_REACHED from the reservation function. | 0391_artifact_runtime_usage_cap.sql:21-24 |
| Offline | Not handled in the code as a distinct state. | useLiveArtifactRuntime.ts |
| Stop live updates | Confirm dialog; artifact stays in chat. | LiveArtifactControls.tsx:62-80 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/live-artifacts/__tests__/LiveArtifactsView.test.tsx`: Live artifacts page.
- `apps/web/app/chat/live-artifacts/__tests__/useLiveArtifactRuntime.test.tsx`: Runtime hook.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.live.test.tsx`: Live strip in the viewer.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.connectorsUnreleased.test.tsx`: Cloud saves hidden while connectors are unreleased.
- `apps/web/app/api/artifacts/live/[artifactId]/__tests__/route.test.ts`: Live route.
- `apps/web/app/api/artifacts/runtime/[token]/connectors/__tests__/route.test.ts`: Published connectors route.
- `apps/web/app/api/artifacts/runtime/live/[artifactId]/connectors/__tests__/route.test.ts`: Live connectors route.
- `apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/__tests__/route.test.ts`: Live completion route.
- `apps/web/lib/services/__tests__/artifact-connector-gate.test.ts`: Gate.
- `apps/web/lib/services/__tests__/artifact-runtime-service.live.test.ts`: Live binding service.
- `apps/web/lib/services/__tests__/managed-usage-request-service.artifact-cap.test.ts`: Per-artifact cap.
- `apps/web/db/neon/artifact-runtime-usage-cap-migration.test.ts`: Migration 0391 text.
- `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.test.tsx`: Published runtime hook.

**Test scenarios**

- **Gate while coming soon**
  1. With the repository default release state, call the live connectors route for an owned HTML artifact.
  - Expected: 403 connectors_coming_soon.
- **Refresh on a released build**
  1. Release connectors in a test build and enable the AI switch.
  2. Bind an artifact to one connected app.
  3. Press Refresh data.
  - Expected: Strip updates to 'Updated just now' and the page shows fresh data.
- **Disconnected app**
  1. Disconnect the app in Settings, Connectors.
  2. Open the live artifact.
  - Expected: Strip says 'Connect <app> to refresh'.
- **Manual policy**
  1. Choose 'Refresh only when I ask'.
  2. Reload the page.
  - Expected: No data loads until Refresh data is pressed; the manual message appears.
- **Usage cap**
  1. Make a page that loops AI calls.
  2. Run it past the plan's per-app call ceiling.
  - Expected: The server refuses further calls; to be verified because migration status is unknown.
- **Per-artifact usage screen**
  1. Look for an Artifact usage screen on web, mobile, CLI.
  - Expected: None exists today; this documents the gap.

**Where to look when it fails**

- Response codes connectors_coming_soon, plan_upgrade_required, connectors_unavailable, artifact_not_found, ARTIFACT_RUNTIME_LIMIT_REACHED.
- Log line '[artifact-runtime] refresh not recorded' (artifact-completion.ts:294).
- Tables live_artifacts, managed_usage_requests; audit event connector_setting_changed (live route :60-70).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Connected apps are switched off by the release state, so S26.33 and S26.34 cannot be used by anyone yet.** Affects: All web users.. Evidence: connector-release.ts:14; artifact-connector-gate.ts:20-25.. Work needed: Release decision by the owner; then live verification.
- **No per-artifact usage display on any app.** Affects: All apps (S26.37).. Evidence: artifact_subject has no reader in app code; only reservation and tests.. Work needed: Add a usage read endpoint and a strip line; confirm migration 0391 is applied.
- **Status is coarse (ready or needs connection), not 'healthy or unhealthy' per source.** Affects: Web.. Evidence: live-artifact-contract.ts:20-21,50-60.. Work needed: Add per-connector state if required.
- **Brief and ledger say missing for items that exist in code.** Affects: Documentation.. Evidence: LiveArtifactControls.tsx.. Work needed: Update ledger notes.
- **Migration 0391 header says not applied.** Affects: Usage limits.. Evidence: 0391 header line 3.. Work needed: Check the migration status table or run db status.
- **Mobile, CLI, VS Code and Chrome have none; the matrix says they do not render published apps.** Affects: Those apps.. Evidence: surface-feature-matrix.md:402-410.. Work needed: Record as not applicable.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-observability-and-operations

## Unknown

- Whether migration 0391 is applied in any environment.
- Whether the 'Live artifacts' sidebar item is visible while connectors are unreleased.
- Which provider and model the managed artifact route uses.
- Whether usage rows can be summed per artifact from existing tables for a future screen.
- Exact retention of live bindings and usage rows.
- Whether any live run has verified refresh.

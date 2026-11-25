---
id: "F102-12"
type: "feature"
title: "Published artifacts and their sandbox"
aliases: ["Published artifacts and their sandbox", "Interactive artifact sandbox (S102.31)", "Generated-application hosting runtime (S102.32)", "published app", "shared artifact page (/shared-artifact/[token])", "artifact runtime", "connected apps in published apps"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.31", "S102.32"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-model-catalog-and-routing", "SYS-authentication-and-identity", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "surface:web", "mode:cloud", "plan:pro", "file:packages/contracts/types/src/artifact-csp.ts", "api:POST /api/artifacts/runtime/[token]/connectors", "api:POST /api/artifacts/runtime/[token]/complete"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-12 Published artifacts and their sandbox

Artifacts made in chat run in a sandboxed frame loaded from a separate origin under a strict content policy. A published artifact gets a public link; its page can ask the viewer to allow AI and connected apps. Connected apps are off today: connectors are marked coming soon.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.31](../../10-requirements/capabilities/102-runtime-inventory.md#s10231), [S102.32](../../10-requirements/capabilities/102-runtime-inventory.md#s10232).

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

**What it does.** Two parts. (1) The sandbox: interactive artifacts (HTML, React and similar) render in an iframe on a separate sandbox origin with a content policy that blocks network calls (packages/contracts/types/src/artifact-csp.ts:17-45; packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx:146-168). (2) Hosting: a published artifact is served at /shared-artifact/[token] and may call runtime routes for AI completions, storage and connected apps (apps/web/app/shared-artifact/[token]/page.tsx; apps/web/app/api/artifacts/runtime).

**Why it exists.** Artifacts run code written by a model, so it must not reach the user's session or the network. Publishing lets a person share a working app by link, like the leaders' artifact sharing (doc: docs/product/requirements.md:189-190).

**Who uses it.** People who create artifacts and people who open shared links, signed in or not.

**Problems it solves**

- Run generated code safely.
- Share an app by link.
- Let a published app use AI and, later, connected apps with the viewer's consent and plan.

**Use cases**

- Open a shared artifact link and use the page.
- A published app asks to use AI; the viewer allows it.
- An owner publishes a dashboard that reads the viewer's connected app, after consent (currently blocked).

## 2. User experience

**Where to find it**

- Web: chat artifact panel (shared UI), published page at /shared-artifact/[token] (apps/web/app/shared-artifact/[token]/page.tsx), titled '<title> - AGI' or 'Published artifact - AGI'.
- Desktop, VS Code, Chrome: artifact panel from the shared unified-chat package (AGENTS.md section 5) [inferred]; the published page is web only.
- Mobile and CLI: have artifact lists or commands (matrix lines 49, 187), but the published page and runtime routes are web.
- Connected apps in artifacts: Present on web and api only (doc: docs/product/surface-feature-matrix.md:81).

**Before you start**

- Viewing a public link needs no sign-in (page.tsx:25-35). Using AI inside the app needs sign-in (usePublishedArtifactRuntime.ts, 'Sign in' action in PublishedArtifactView.tsx:285) and the server switch AGI_ARTIFACT_AI_ENABLED.
- Connected apps: connectors released (currently not), a plan with artifact_connectors, workspace policy, and each connector connected in Settings, Connectors.

**Screens and controls**

- Published page with the artifact in a frame and a report-content link (page.tsx).
- Consent box labelled 'AI permission': text 'This app wants to use AI with your account...' with buttons 'Allow' and "Don't allow" and per-tool checkboxes (ArtifactConnectorConsent.tsx:50-140).
- Unavailable page for a bad or revoked link; invite-only page for invite-only artifacts (page.tsx:76-95).

**Journey**

1. 1. Open /shared-artifact/<token>. 2. The server looks up a public row, then workspace or invited rows (page.tsx:25-45). 3. The page renders the artifact in the sandbox frame (PublishedArtifactView.tsx:321-325). 4. If the app asks for AI, the consent box appears; the choice is remembered per exact revision of the code in the browser (usePublishedArtifactRuntime.ts:37-85). 5. On Allow, the page calls the runtime routes; the server runs the gates and the model call (artifact-completion.ts:112-310). 6. The answer returns to the app.

**What the person sees and gets**

- Refusal texts: 'This app is no longer available.', 'AI in apps is not available yet.', 'Connectors are coming soon.', 'Connected apps in published apps are available on <plans>.', 'This app was not published with connected apps, so it cannot use yours.', 'Remove sensitive credentials before sending.' (several files).
- Client messages: 'You chose not to let this app use AI.', 'You chose not to let this app use your connected apps.' (usePublishedArtifactRuntime.ts:14-18).

**Settings**

- Server: NEXT_PUBLIC_SANDBOX_ORIGIN (empty in .env.example:676), AGI_ARTIFACT_AI_ENABLED (artifact-ai-switch.ts:5-8).
- User: Settings, Connectors; tool approval choices decide which tools an app may use (artifact-completion.ts:259-270).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Sandbox frame in the shared UI: sandbox 'allow-scripts allow-same-origin allow-modals' on a separate origin, a handshake timeout of 3 seconds, and a fallback frame if the origin is missing or fails (ArtifactSandboxFrame.tsx:11, 148, 160-168).
- The origin helper refuses the app's own origin so scripts cannot reach the session (apps/web/lib/artifact-sandbox.ts:150-175; packages/ui/unified-chat/src/lib/artifact-sandbox.ts:209-218).
- Content policy: default none, scripts from four named script hosts plus inline, connect-src none, frame-src self for the renderer and none for the fallback, object and base none (artifact-csp.ts:17-45).
- The renderer page carries the same policy in a meta tag, kept identical by a test (infrastructure/sandbox/index.html:50-58; packages/contracts/types/src/__tests__/artifact-csp.test.ts).
- Published page and routes: connectors, complete, storage under apps/web/app/api/artifacts/runtime/[token]; publish route apps/web/app/api/artifacts/publish/route.ts.
- Gate order for AI completion: AI switch, connectors released, public-share rule, workspace privacy, managed compute access, connector plan gate, moderation, content safety, secret handling, route selection, model policy, egress policy, turn slot (artifact-completion.ts:112-310).

**Incomplete**

- The web published page uses its own SandboxedIframe, whose sandbox attribute is 'allow-scripts allow-same-origin' with no 'allow-modals' on the sandbox-origin path, and 'allow-scripts allow-modals' on the fallback (apps/web/features/chat/components/SandboxedIframe.tsx:399, 427). The brief describes only the shared-UI frame.
- The infrastructure sandbox host also sets a response header policy with a shorter script and style host list than the meta policy (infrastructure/sandbox/vercel.json header; index.html:55-58). Both apply [inferred: the browser enforces both]; whether this difference is intended: unknown.

**Present but disconnected or switched off**

- Connectors are switched off: CONNECTOR_RELEASE_STATE is 'coming_soon' (packages/contracts/types/src/connector-release.ts:14), so the gate returns 403 connectors_coming_soon (artifact-connector-gate.ts:20-25; artifact-completion.ts:121-123).
- AI inside published apps is off unless AGI_ARTIFACT_AI_ENABLED is set to a true spelling (artifact-ai-switch.ts:5-8); the AI-off answer is 403 artifact_ai_off 'AI in apps is not available yet.' (artifact-ai.ts:1-3).
- If NEXT_PUBLIC_SANDBOX_ORIGIN is empty (as in .env.example), the sandbox falls back to an opaque srcDoc frame (artifact-sandbox.ts:158-175).

**Not available**

- Mobile, CLI, VS Code and Chrome have no published-app runtime; connected apps in artifacts exist on web and api only (surface-feature-matrix.md:81).

## 4. Required behaviour

**Established requirements**

- Interactive artifacts run in a sandboxed iframe with a restrictive content policy. Platform status: done. (source: S102.31 (brief item))
- Generated applications are hosted at a public URL with the runtime they need. Platform status: done. (source: S102.32 (brief item))
- The frame uses sandbox allow-scripts, allow-same-origin and allow-modals and loads from a separate sandbox origin. (source: S102.31 Should line; verified at ArtifactSandboxFrame.tsx:148 and artifact-sandbox.ts:158)
- The content policy sets connect-src to none and frame-src to self (for the renderer; none for the same-page fallback). (source: S102.31 Should line; artifact-csp.ts:37, 40)
- The connector route checks connectors are released and the plan allows artifact_connectors; failure codes connectors_coming_soon (403) and plan_upgrade_required (403). (source: S102.32 Should line; apps/web/lib/services/artifact-connector-gate.ts:20-35)
- Three surfaces enforce the artifact policy and must not drift: renderer, web fallback and unified-chat fallback. (source: packages/contracts/types/src/artifact-csp.ts:2-10 (code comment))
- Artifacts need an id, a relationship to the conversation, and live in the web, desktop and mobile artifact model. (source: doc: docs/product/requirements.md:737-741)

**Acceptance criteria**

1. A published artifact's script cannot call fetch or open a connection to any host (connect-src none).
2. The frame cannot read the cookies or storage of the app's own origin; configuring the sandbox origin equal to the app origin makes the app use the opaque fallback.
3. A revoked or malformed link shows the Unavailable page, not a 404 page.
4. A viewer who is not signed in sees the sign-in prompt before the AI consent.
5. With connectors in coming_soon state, a request with connectors returns 403 connectors_coming_soon.
6. With connectors released and a plan below Pro, the same request returns 403 plan_upgrade_required naming the plans.
7. Changing the published code asks for consent again.
8. Public shares cannot use connectors (403 connectors_not_on_public_share).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A script host removed from the contract list must also be removed from the renderer meta tag and the fallbacks (test enforces byte equality) [inferred from the artifact-csp.ts header comment].
- Consent decisions must be per account and per revision [inferred from usePublishedArtifactRuntime.ts:68-85].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the SandboxedIframe sandbox attribute list with the shared-UI frame, or document why they differ.
- [proposed] Add a test that the infrastructure header policy and the meta policy cannot disagree.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactSandboxFrame | `packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx` | Shared sandbox iframe with handshake and fallback (11, 148, 164). |
| component | SandboxedIframe (web) | `apps/web/features/chat/components/SandboxedIframe.tsx` | Web iframe used by the published page (163, 399, 427). |
| service | getSandboxOrigin (web) | `apps/web/lib/artifact-sandbox.ts` | Reads NEXT_PUBLIC_SANDBOX_ORIGIN, refuses own origin (158-175). |
| service | getArtifactSandboxOrigin (shared) | `packages/ui/unified-chat/src/lib/artifact-sandbox.ts` | Same rule for the shared UI; also Tauri and global origins (209-218). |
| schema | Artifact CSP contract | `packages/contracts/types/src/artifact-csp.ts` | The one policy text for renderer and fallbacks (17-45). |
| config | Sandbox renderer page | `infrastructure/sandbox/index.html` | Renderer with the policy in a meta tag (50-58) and a postMessage contract. |
| config | Sandbox host headers | `infrastructure/sandbox/vercel.json` | Response headers including a Content-Security-Policy and frame-ancestors list. |
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Server-rendered public page, token check, public, org or invited lookup. |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Renders the artifact in SandboxedIframe (321-325); aiEnabled prop. |
| component | ArtifactConnectorConsent | `apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx` | The 'AI permission' consent box. |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Runtime calls, consent stored per revision in browser localStorage. |
| endpoint | POST /api/artifacts/runtime/[token]/connectors | `apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts` | Lists connected apps for consent (36-89). |
| endpoint | POST /api/artifacts/runtime/[token]/complete | `apps/web/app/api/artifacts/runtime/[token]/complete/route.ts` | AI completion for a published app (33-86). |
| endpoint | /api/artifacts/runtime/[token]/storage | `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | Key-value storage for a published app. |
| service | respondToArtifactCompletion | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` | The gate sequence and model call (112-310). |
| service | artifactConnectorsGateResponse | `apps/web/lib/services/artifact-connector-gate.ts` | Released and plan checks (14-38). |
| service | artifact-runtime-service | `apps/web/lib/services/artifact-runtime-service.ts` | Reads runnable artifacts, storage, route selection, connector plan, completion (167-780). |
| config | Connector release state | `packages/contracts/types/src/connector-release.ts` | CONNECTOR_RELEASE_STATE = 'coming_soon' (14). |
| config | artifact_connectors capability | `packages/contracts/types/src/billing-catalog.ts` | Plan list PRO_TIERS (341, 361) and label (419). |
| config | AI switch | `apps/web/lib/server/artifact-ai-switch.ts` | AGI_ARTIFACT_AI_ENABLED (5-8). |
| endpoint | POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publishes an artifact and records the audit event (55-125). |
| test | CSP and frame tests | `packages/contracts/types/src/__tests__/artifact-csp.test.ts` | Keeps renderer meta and fallbacks equal; ArtifactSandboxFrame.test.tsx in unified-chat tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A visitor opens /shared-artifact/<token>; the server validates the token and reads a public row, then workspace or invited rows with the cookie user. | our servers | apps/web/app/shared-artifact/[token]/page.tsx:25-45, 66-95 |
| The browser loads the page and creates the sandbox iframe from the sandbox origin, then posts the artifact to it; if the handshake fails within 3 seconds it falls back to a same-page srcDoc frame. | device | ArtifactSandboxFrame.tsx:11, 120-168; SandboxedIframe.tsx:163-200 |
| The sandbox host serves a static renderer with the content policy. | outside service | infrastructure/sandbox/vercel.json (separate host); index.html:50-58 [host is a separate deployment: sandbox.agiworkforce.com per index.html:9] |
| Artifact code asks the parent for runtime work through postMessage; the parent, not the sandbox, calls our API with the viewer's session. | device | apps/web/lib/artifact-sandbox.ts:100-175 (postRuntimeResponseToSandbox); usePublishedArtifactRuntime.ts |
| The server runs the gates (AI switch, connectors released, public-share rule, policy, compute access, plan, moderation, safety, secret handling), picks a model route, checks model and egress policy, takes a turn slot and runs the completion. | our servers | apps/web/app/api/artifacts/runtime/artifact-completion.ts:112-310 |
| The model provider answers; the text returns to the page. | outside service | artifact-completion.ts:279-290; dispatchProviderForSelectedRoute in artifact-runtime-service.ts:53 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published artifact content and token | Server database (table name not opened) | Server | Owner can republish or revoke; quota rule exists (PublishedArtifactQuotaError, publish/route.ts:~100); details unknown |
| Viewer consent for AI and tools | Browser localStorage key 'agiworkforce-artifact-ai:<scope>:<key>' | No; per browser | Forgotten when declined or revision changes (usePublishedArtifactRuntime.ts:53-95) |
| App storage values | Server via storage route (artifact-runtime-service.ts:192-276) | Server | Unknown |
| Audit event share_link_updated | Audit log | Server | Per audit retention (unknown) |

**Models and providers.** The completion picks a managed route by plan and prompt, with 'needsTools' and Google-data flags (artifact-runtime-service.ts:299-430; artifact-completion.ts:213-228). It is always managed (Cloud): privacy check uses mode 'managed' (artifact-completion.ts:137-142). Provider is not fixed in this file.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing a public artifact: none. AI and connectors: signed-in account (getUserScopedDb and assertAccountActive in the routes). |
| Permissions | Per-viewer consent for AI and per-tool choices; workspace privacy and model policies; tool approval settings decide which tools an app may use; CSRF tokens on the runtime routes. |
| Subscription | Connected apps in published apps need a plan in PRO_TIERS (pro, max, max_15x, team, team_premium, enterprise) (billing-catalog.ts:341, 361); refusal 'Connected apps in published apps are available on <plans>.' AI completions need managed compute access and a turn slot; 'Your plan does not include AI responses in apps...' (artifact-completion.ts:84-92). |
| Limits and metering | Rate limits 'llm-completion' (complete) and 'model-catalog' (connectors) per user; turn slot limit per plan; managed usage reservation in completeArtifactPrompt (artifact-runtime-service.ts:629-700); prompt length cap ARTIFACT_RUNTIME_MAX_PROMPT_CHARS; one to ten connectors per request. |
| Feature flags | AGI_ARTIFACT_AI_ENABLED, NEXT_PUBLIC_SANDBOX_ORIGIN, connector release state (code constant), workspace feature gate 'artifact_connectors'. |
| Model compatibility | A route is chosen by plan and prompt; if connectors are used, a model with tool support is required (needsTools: true, artifact-completion.ts:224). |
| Provider restrictions | A run that can reach Google user data, or an artifact from a chat holding it, is kept off models that may train (artifact-completion.ts:205-212). Egress and model policy gates apply. |
| Local mode | Not applicable: the published page and its completions run in AGI Cloud (managed mode check). The sandbox frame itself is rendered on the user's device on every app that shows artifacts, and needs no account for local artifacts [inferred; local provenance exists in mobile, F102-08]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed or revoked link | Unavailable page with an honest message, same for both cases. | page.tsx:66-95 |
| Invite-only artifact | Invite-only page, with sign-in state. | page.tsx:81-88 |
| Sandbox origin missing or equals app origin | Falls back to an opaque srcDoc frame. | artifact-sandbox.ts:158-175 |
| Handshake slow or frame error | After 3 seconds or an error event, degrades to the fallback frame. | ArtifactSandboxFrame.tsx:11, 120-146 |
| Scripts cannot run in the fallback | Shows a status note and invites reading the Source tab. | SandboxedIframe.tsx:~412-425 |
| AI switch off | 403 artifact_ai_off 'AI in apps is not available yet.' | artifact-completion.ts:116-118 |
| Connectors coming soon | 403 connectors_coming_soon. | artifact-connector-gate.ts:20-25 |
| Plan too low | 403 plan_upgrade_required. | artifact-connector-gate.ts:26-36 |
| Connector not connected or tool needs approval | 409 connectors_not_ready with instructions; consent box notes 'Not connected...' or 'Asks before each use, so this app cannot use it.' | artifact-completion.ts:262-270; ArtifactConnectorConsent.tsx:15-23, 118-125 |
| Too many answers running | Turn slot refusal asking to wait. | artifact-completion.ts:84-86 |
| Declined consent | Message 'You chose not to let this app use AI.' | usePublishedArtifactRuntime.ts:14 |
| Republished code | Consent asked again because it is stored per revision. | usePublishedArtifactRuntime.ts:68-72 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/artifact-csp.test.ts`: Policy text; index.html meta tag kept byte-identical (stated in index.html:50-54).
- `packages/ui/unified-chat/src/components/__tests__/ArtifactSandboxFrame.test.tsx`: Shared sandbox frame [inferred from name].
- `packages/ui/unified-chat/src/components/__tests__/ArtifactPreviewScriptsBlocked.test.tsx`: Scripts blocked in preview [inferred from name].
- `apps/web/features/chat/components/SandboxedIframe.test.tsx`: Web iframe [inferred from name].
- `apps/web/features/chat/components/SandboxedIframe.origin.test.tsx`: Origin rules [inferred from name].
- `apps/web/app/shared-artifact/[token]/page.test.tsx`: Shared page [inferred from name].
- `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.test.tsx`: Runtime hook and consent [inferred from name].
- `apps/web/app/api/artifacts/runtime/[token]/connectors/__tests__`: Connectors route [inferred from folder].
- `apps/web/app/api/artifacts/runtime/[token]/storage/__tests__/route.test.ts`: Storage route [inferred from name].
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route [inferred from name].
- `infrastructure/sandbox/configure.test.mjs`: Sandbox deployment configuration [inferred from name].

**Test scenarios**

- **Network blocked**
  1. Publish an artifact whose script calls fetch to an external host.
  2. Open the link.
  - Expected: The request is blocked by the content policy.
- **Own origin refused**
  1. Set NEXT_PUBLIC_SANDBOX_ORIGIN to the app's own origin in a test build.
  - Expected: The app uses the opaque fallback frame, not the same-origin frame.
- **Revoked link**
  1. Revoke a published artifact and open its link.
  - Expected: Unavailable page, no 404 text.
- **AI consent**
  1. Enable AGI_ARTIFACT_AI_ENABLED on a test server.
  2. Open an artifact that asks for AI, signed out, then signed in.
  3. Press Allow, then republish new code.
  - Expected: Sign-in first, consent after, request counted toward plan usage; consent asked again after republish.
- **Connectors blocked**
  1. POST to the connectors route with one connector id.
  - Expected: 403 connectors_coming_soon while the release state is coming_soon.
- **Plan gate**
  1. In a test build with connectors released, call as a free account.
  - Expected: 403 plan_upgrade_required naming Pro and above.

**Where to look when it fails**

- Error codes artifact_not_found, invalid_connectors, connectors_not_on_public_share, connectors_not_declared, connectors_not_ready, connectors_unavailable, model_unavailable, content_policy_violation, secrets_blocked, artifact_ai_off.
- Log '[artifact-runtime] content safety unread'; '[artifact-runtime] refresh not recorded'.
- Client failure reports from the frame (reportClientFailure).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Connected apps in published apps cannot work today because connectors are in 'coming_soon' state, though the brief marks the hosting runtime done.** Affects: Web users who publish apps that need connectors.. Evidence: connector-release.ts:14; artifact-connector-gate.ts:20-25.. Work needed: Release decision, then live verification of consent, gate and tools.
- **AI inside published apps is off unless a server switch is set; production state unknown.** Affects: Viewers of published apps.. Evidence: artifact-ai-switch.ts:5-8.. Work needed: Confirm production value and document.
- **Two different iframe components with different sandbox attribute lists exist; the brief describes one.** Affects: Security review; web published page versus chat panel.. Evidence: ArtifactSandboxFrame.tsx:148 versus SandboxedIframe.tsx:399, 427.. Work needed: Unify or document.
- **Brief pointer 'complete route:202' does not exist; the complete route has 86 lines and the logic is in artifact-completion.ts.** Affects: Brief accuracy.. Evidence: apps/web/app/api/artifacts/runtime/[token]/complete/route.ts (86 lines); artifact-completion.ts.. Work needed: Correct the pointer.
- **The sandbox origin is empty in the example environment; if it is also empty in production, every artifact uses the weaker opaque fallback.** Affects: Web users in production.. Evidence: .env.example:676; artifact-sandbox.ts:158-175.. Work needed: Verify the production setting [unknown].

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-model-catalog-and-routing
- SYS-authentication-and-identity
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- surface:web
- mode:cloud
- plan:pro
- file:packages/contracts/types/src/artifact-csp.ts
- api:POST /api/artifacts/runtime/[token]/connectors
- api:POST /api/artifacts/runtime/[token]/complete

## Unknown

- Which provider and model actually serve published-app completions in production.
- Name of the table holding published artifacts and the publish quota value.
- Whether NEXT_PUBLIC_SANDBOX_ORIGIN and AGI_ARTIFACT_AI_ENABLED are set in production.
- Whether the infrastructure header policy and the meta policy difference is intended.
- Contents of the listed tests (only names and a few comments seen).
- How the Tauri artifact scheme (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs, named in index.html:13) behaves; not opened.

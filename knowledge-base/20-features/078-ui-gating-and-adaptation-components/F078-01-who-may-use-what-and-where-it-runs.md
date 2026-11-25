---
id: "F078-01"
type: "feature"
title: "Who may use what, and where it runs"
aliases: ["Capability resolver", "Capability handshake / effective capability document", "Plan and policy gating", "Processing path (Local / BYOK / Managed Cloud)", "Privacy mode", "US-only routing", "Workspace policy", "Feature availability (brief S78.01, S78.07, S78.09-S78.12, S78.24)"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.01", "S78.07", "S78.09", "S78.10", "S78.11", "S78.12", "S78.24"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "api:GET /api/me", "api:GET /api/me/routing-preferences", "file:packages/contracts/types/src/capability-handshake/evaluator.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-01 Who may use what, and where it runs

Decides whether a feature or model is allowed for this person on this app. The server builds a capability document from model, plan, app and settings layers. Each app reads it. The server checks again on every model route. The person also chooses where a request runs: on the device, with their own key, or on AGI Cloud.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.01](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7801), [S78.07](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7807), [S78.09](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7809), [S78.10](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7810), [S78.11](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7811), [S78.12](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7812), [S78.24](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7824).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Combines four layers (model, tier/plan, surface/app, settings) into one 'granted or denied, and why' answer per capability (packages/contracts/types/src/capability-handshake/types.ts:7-26). The server also enforces plan access, workspace model policy, training opt-out, US-only routing and age eligibility on the request itself (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5330-5351, 5049-5066, 4709-4715). The person picks the processing path (Local, own key, Cloud) in the composer or CLI.

**Why it exists.** A control hidden only in the UI can be bypassed, and a control shown without a server check can promise what the plan does not include. One shared answer keeps six apps saying the same thing, and the server refusal is the real gate (brief S78.07). The AGENTS.md trust rules say Local, own key and Cloud are separate boundaries and nothing may silently cross them (doc: AGENTS.md §6).

**Who uses it.** Every signed-in or signed-out person using any of the six apps. Workspace owners and admins set the policy that binds members. Support and engineers read the denial codes.

**Problems it solves**

- A free or lower plan sees a model it cannot use and gets a late failure.
- A workspace admin switches off a feature or model and members can still reach it from another app.
- A temporary server outage disables features that work on the phone.
- Local data is sent to the cloud without the person choosing it.

**Use cases**

- A Free-plan user opens the model picker on web and sees plan-locked models marked as locked, then the server refuses a forced request with model_not_available and names the required plan.
- A workspace admin blocks a provider; a member's request on any app is refused with a policy reason.
- A user on the CLI starts in Local mode and must run /continue-with-cloud to move the chat to AGI Cloud.
- A person on the Pro-or-higher plan turns on 'Only use AI providers based in the US' in Privacy settings.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app): the model picker in the composer footer (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1212-1227), section 'On this device' for local models (ComposerFooter.tsx:45 region of constants, LOCAL_SECTION_LABEL 'On this device').
- Web Settings: 'Workspace policy' section with rows such as 'Cloud compute', 'Default privacy mode', 'Retention window' (apps/web/features/settings/sections/WorkspacePolicySection.tsx:301-330, 376, 521).
- Web and Mobile Privacy settings: switch labelled 'Only use AI providers based in the US' (apps/web/features/settings/components/UsOnlyRoutingPanel.tsx:20; apps/mobile/src/features/settings/cloud-privacy/UsOnlyRoutingGroup.tsx:30).
- Mobile: model picker rows (apps/mobile/src/features/model-picker/components/ModelRow.tsx) and the Local/Cloud app mode (apps/mobile/src/features/chat/store/appModeStore.ts:5).
- CLI: flags --model and --provider, --auto, and slash commands /privacy-mode local|byok|managed, /continue-with-byok, /continue-with-cloud (apps/cli/src/lib.rs:189-196, 470-480; apps/cli/src/claude_parity.rs:480-517).
- VS Code: model picker quick pick with locked groups (apps/extension-vscode/src/features/model-picker/modelConstants.ts:140-148).
- Web sign-up: terms and age step 'Finishing signing in' (apps/web/app/signup/complete/RecordTermsAcceptance.tsx:60-72); mobile age entry (apps/mobile/src/features/auth/services/ageGate.ts).

**Before you start**

- A signed-in account for any Cloud capability; Local use needs none on mobile and desktop (see access_and_usage).
- Owner or admin role to change Workspace policy (WorkspacePolicySection.tsx:314-319).
- US-only routing needs an eligible plan from the model registry policy (UsOnlyRoutingPanel.tsx:24-33).

**Screens and controls**

- Model picker rows: plan-locked row shows 'Upgrade' or '<Plan> and above' (ComposerFooter.tsx:214, 799-805); environment or coming-soon rows are hard-disabled (ComposerFooter.tsx:657-659, 724).
- Workspace policy toggles and inputs, read-only for non-admins (WorkspacePolicySection.tsx:215).
- US-only switch with a saved/failed status line and Retry on load failure (UsOnlyRoutingPanel.tsx:97-110).
- CLI privacy-mode text output (claude_parity.rs:443-464).

**Journey**

1. 1. The app signs in and fetches the capability document from /api/me with the app name (apps/web/app/api/me/route.ts:287-300, 339-342).
2. 2. Controls read the document; where the document is silent the app uses the shipped platform matrix (packages/ui/unified-chat/src/lib/Capabilities.tsx:25-35).
3. 3. The person opens the model picker; locked models show why (see F078-03).
4. 4. The person picks a model or a path (Local model, a provider key through --provider, or Cloud).
5. 5. On send, the server re-checks plan, workspace policy, region, training opt-out and sends a refusal with a code if blocked (request-processor.ts:5049-5066, 5330-5351).
6. 6. The app shows the refusal reason (see F078-05).

**What the person sees and gets**

- Locked or disabled rows with a reason.
- HTTP 403 model_not_available with requiredTier, or a workspace-policy 403 with code and reason; 503 with Retry-After 30 when the policy cannot be read (request-processor.ts:2965-2976; apps/web/lib/services/model-policy-gate.ts:21-33).
- CLI text: 'Privacy mode was not changed. Local -> Managed Cloud requires an explicit reviewable handoff.' (claude_parity.rs:487-493).

**Settings**

- Workspace policy rows (cloud compute, privacy mode, retention, spend cap, zero data retention, MFA).
- US-only routing preference stored through /api/me/routing-preferences (packages/contracts/cloud-contracts/src/me.ts:35).
- CLI config and flags: --provider, --model, --auto.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capability document with four layers and typed denial reasons is built by the server and sent in /api/me (apps/web/app/api/me/route.ts:287-300; packages/contracts/types/src/capability-handshake/evaluator.ts:79-96).
- Web and Desktop shell provide the document through CapabilityProvider (apps/web/app/ProductRuntimeProviders.tsx:11-13).
- Mobile keeps the document in a device store and uses a remote switch-off list on top; a capability the server does not mention keeps the shipped value (apps/mobile/src/lib/Capabilities.tsx:58-64, 126-134; apps/mobile/src/features/billing/store.ts:101).
- Server refuses a model not in the plan: 403 model_not_available with requiredTier (request-processor.ts:5330-5351).
- Server refuses Deep Research for plans without it: 403 plan_upgrade_required with required_plans (request-processor.ts:1503-1524).
- Workspace model policy is read once and evaluated again on the primary model and fallback candidates; unreadable policy fails closed with 503 (request-processor.ts:4690-4693, 5049-5070).
- Training opt-out read failure routes only to no-training models and logs a warning (request-processor.ts:3615-3631, 4694-4700).
- US-only preference flows into the routing policy (request-processor.ts:4709-4715) and the preference test says it is enforced (apps/web/app/api/me/routing-preferences/__tests__/no-unenforced-control.test.ts:7-20).
- Owner/admin gate on team changes: requireTeamAdminAccess (apps/web/app/api/settings/team/route.ts:139); Workspace policy page is read-only for others (WorkspacePolicySection.tsx:314-319).
- CLI maps plan to a routing bucket (apps/cli/src/tier_cache.rs:244-251) and caches the plan 300 seconds (tier_cache.rs:43).
- CLI explicit path change: /privacy-mode refuses Local to BYOK or Cloud and points to /continue-with-byok or /continue-with-cloud (claude_parity.rs:480-517).
- VS Code resolves plan and capability document and revalidates on signals (apps/extension-vscode/src/integrations/tierResolver.ts:48-54, 73; tierRevalidation.ts:12-18).
- Age gate: minimum age 18 (packages/contracts/types/src/account-eligibility.ts:1); web terms step records acceptance and handles an age refusal from the server (RecordTermsAcceptance.tsx:106-113; apps/web/app/api/terms/accept/route.ts:165); mobile stores a device age verdict and refuses minors (ageGate.ts:128-170).

**Incomplete**

- Environment-gated models: environmentAvailability returns {configured:false} on web, mobile and VS Code, so a model that requires an environment is always locked there (apps/web/features/chat/lib/model-plan-admission.ts:19-21; apps/mobile/src/features/model-picker/service.ts:80; apps/extension-vscode/src/features/model-picker/modelConstants.ts:44).
- The shared platform matrix covers only web, desktop and mobile (packages/contracts/types/src/capabilities.ts:139-143); CLI, VS Code and Chrome use their own plan logic instead of one resolver.
- Role restriction status exists only for web, desktop and mobile in the brief (S78.10); CLI, VS Code and Chrome have no role control found.

**Present but disconnected or switched off**

- Mobile does not fetch the remote capability list unless the app is in Cloud mode, the cloud is unlocked and an account is present (apps/mobile/src/lib/Capabilities.tsx:39-45).
- On mobile, purchase wording depends on NATIVE_PURCHASES_AVAILABLE; when off, plan locks say 'Not included in your plan' (apps/mobile/src/features/model-picker/service.ts:65-72, 193).

**Not available**

- No own-key choice found in the mobile model picker: mobile app mode is only 'local' or 'cloud' (apps/mobile/src/features/chat/store/appModeStore.ts:5). The brief marks mobile processing path done; the own-key leg is unverified.
- No own-key chooser found in the web composer footer; BYOK appears there only as a recovery link and a privacy label (apps/web/features/chat/lib/freeCapacityRecovery.ts:17; ChatComposerNew.tsx:2071).
- Chrome: brief marks processing-path choice not applicable (brief S78.24).

## 4. Required behaviour

**Established requirements**

- One resolver combines model, plan, surface and operator switches and the controls read it. (source: brief S78.01)
- Plan entitlements are checked in the UI and again on the server for every route that runs a model. (source: brief S78.07)
- Workspace policy (feature switches, model policy, retention) restricts members on every surface. (source: brief S78.09)
- Owner and admin controls are withheld from other members and refused server-side. (source: brief S78.10)
- Regional restrictions are enforced and visible to the user. (source: brief S78.11)
- Age or account eligibility is checked at sign-up or first run, with restricted behaviour for ineligible users. (source: brief S78.12)
- The user can choose where a request is processed: local model, own key or managed cloud. (source: brief S78.24)
- Nothing may silently route a Local chat, file or session to own key or Cloud; a Local-to-own-key move is an explicit fork with consent and a visible provider label. (source: doc: AGENTS.md §6)
- Security behaviour fails closed. (source: doc: AGENTS.md §6)

**Acceptance criteria**

1. A model outside the plan is refused by the server with a 403 and code model_not_available that names the plan, even if the request bypasses the UI.
2. A workspace policy that blocks a model refuses the request on each app, and an unreadable policy returns 503 with Retry-After.
3. If the training opt-out cannot be read, only no-training models are used and a warning is logged.
4. A member who is not owner or admin sees the Workspace policy page read-only and the team API refuses their change.
5. Turning on US-only routing is saved, reloads as on, and the chat route receives usOnly in its routing policy.
6. In the CLI, /privacy-mode byok from a Local session changes nothing and tells the person to use /continue-with-byok.
7. A mobile capability the server does not list keeps its shipped value when the server is unreachable.
8. A person under 18 is refused at sign-up or first run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mobile fail-open for unlisted capabilities is safe only because the server still refuses the request [inferred].
- The same plan decision should appear on all six apps because every app fetches /api/me [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the own-key leg to the mobile and web composer path chooser, or record that it is not offered there.
- [proposed] Give CLI, VS Code and Chrome the same capability document reader as web and mobile so one resolver serves all six apps.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Capability layers and document types | `packages/contracts/types/src/capability-handshake/types.ts` | Defines layers model, tier, surface, settings and the document with granted, deniedBy, limits. |
| service | resolveCapabilityDecision | `packages/contracts/types/src/capability-handshake/evaluator.ts` | Turns the document into allowed or denied with a typed reason. |
| config | Platform capability matrix | `packages/contracts/types/src/capabilities.ts` | Static per-app capability defaults for web, desktop, mobile. |
| endpoint | GET /api/me | `apps/web/app/api/me/route.ts` | Returns plan, feature_flags and capability_handshake for the named app. |
| component | CapabilityProvider (shared) | `packages/ui/unified-chat/src/lib/Capabilities.tsx` | React context and useCapability hook for web and desktop. |
| component | Capabilities (mobile) | `apps/mobile/src/lib/Capabilities.tsx` | Mobile hook plus remote switch-off store refreshed on resume. |
| store | Mobile tier store | `apps/mobile/src/features/billing/store.ts` | Holds capabilityDocument and refreshTier. |
| service | chat route request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Server re-check of plan, policy, region, training opt-out, effort and parameters. |
| service | Model policy gate | `apps/web/lib/services/model-policy-gate.ts` | Reads and evaluates workspace model policy; records policy refusals. |
| service | Model plan admission | `apps/web/features/chat/lib/model-plan-admission.ts` | modelLock: tier, environment and coming-soon locks for the picker. |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Admin UI for workspace policy. |
| endpoint | Team settings route | `apps/web/app/api/settings/team/route.ts` | Owner/admin gate through requireTeamAdminAccess. |
| component | UsOnlyRoutingPanel | `apps/web/features/settings/components/UsOnlyRoutingPanel.tsx` | Web US-only provider switch. |
| component | UsOnlyRoutingGroup | `apps/mobile/src/features/settings/cloud-privacy/UsOnlyRoutingGroup.tsx` | Mobile US-only provider switch. |
| endpoint | /api/me/routing-preferences | `apps/web/app/api/me/routing-preferences/route.ts` | Stores routing preferences including us_only. |
| service | CLI tier cache | `apps/cli/src/tier_cache.rs` | Plan cache (300 s) and plan-to-routing-bucket mapping. |
| command | CLI privacy mode and handoff | `apps/cli/src/claude_parity.rs` | /privacy-mode, /continue-with-byok, /continue-with-cloud. |
| service | VS Code tier resolver | `apps/extension-vscode/src/integrations/tierResolver.ts` | Resolves plan and capability document with 300 s cache. |
| service | VS Code model picker constants | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Locks by plan, sign-in or provider key. |
| service | Chrome capability document | `apps/extension/src/features/cloud-bridge/capabilityDocument.ts` | Fetches /api/me for the Chrome extension. |
| service | Mobile age gate | `apps/mobile/src/features/auth/services/ageGate.ts` | Device age verdict, region rule, refusal record. |
| endpoint | POST /api/terms/accept | `apps/web/app/api/terms/accept/route.ts` | Records terms acceptance and refuses ineligible age. |
| schema | Account eligibility | `packages/contracts/types/src/account-eligibility.ts` | Minimum age constant and age verdict helpers. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App fetches /api/me for its surface and stores the capability document. | device and our servers | apps/web/app/api/me/route.ts:287-300; apps/mobile/src/features/billing/store.ts:101 |
| Controls read the document; if it is missing they use the shipped platform matrix. | device | packages/ui/unified-chat/src/lib/Capabilities.tsx:25-35 |
| Person picks a model or path; picker computes locks from plan. | device | apps/web/features/chat/lib/model-plan-admission.ts:34-51 |
| Server reads workspace model policy, training opt-out, US-only and region before routing. | our servers | request-processor.ts:4685-4715 |
| Server checks plan access for the named model and refuses with model_not_available. | our servers | request-processor.ts:5330-5351 |
| Server evaluates workspace policy on the chosen model and fallbacks; refuses with the policy code. | our servers | request-processor.ts:5049-5070; apps/web/lib/services/model-policy-gate.ts:21-33 |
| Provider call is made by the managed route, or by the CLI directly with the person's own key. | outside service | apps/cli/src/models/streaming.rs:~480-510 managed_cloud_spec_for_base; request-processor.ts:5049 |
| CLI moves a Local chat to BYOK or Cloud only through a reviewable draft with secret scan and consent. | device | apps/cli/src/claude_parity.rs:480-517, 520-540 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capability document | Mobile tier store (store:tier store, persisted by the app); VS Code globalState key tierStatus.capabilityDocument; web billing store in memory | Read from the server each refresh; never written back | Mobile clears it on account change (apps/mobile/src/features/billing/store.ts:126-140); VS Code overwrites it on refresh (tierResolver.ts:135-138) |
| Plan cache for CLI | ~/.agiworkforce/cache/tier.toml | No; refetched after 300 seconds | Only tier and timestamp are stored (apps/cli/src/tier_cache.rs:264-275) |
| US-only preference | Server routing preferences | Yes, through /api/me/routing-preferences | unknown |
| Age verdict on mobile | Device storage key age-gate:v1 | unknown | A refusal record is kept and only clearAgeGate lifts it (ageGate.ts:128-140) |

**Models and providers.** Model access is decided by the model registry and plan tier, never by a provider name in the gate. Managed Cloud routes are chosen server side; own-key requests go straight to the provider chosen with --provider on the CLI. Workspace policy can name providers and models (apps/web/lib/services/model-policy-gate.ts). Training opt-out limits routing to providers that keep inputs out of training (request-processor.ts:4696-4698). Local models run through the device runtime.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud capability needs a signed-in account. CLI usage and plan need an AGI credential, otherwise the session runs local or BYOK (apps/cli/src/usage_summary.rs:343-356). Mobile refresh needs an account epoch (Capabilities.tsx:39-45). |
| Permissions | Owner or admin changes workspace policy; others read only (WorkspacePolicySection.tsx:314-319). Server refuses non-admin team changes (team/route.ts:139). |
| Subscription | Plan tier decides model roster and gated features. CLI maps Free, Basic and own-key to the 'free' bucket, Pro and Team to 'pro', Max tiers to 'max' (tier_cache.rs:244-251). US-only needs an eligible plan (UsOnlyRoutingPanel.tsx:24-33). |
| Limits and metering | none found in the code for the gate itself; allowance is covered in F078-04. |
| Feature flags | Server feature_flags in /api/me; remote capability switches are named 'capability.<snake_case>' and read by mobile (apps/mobile/src/lib/Capabilities.tsx:36, 47-49, 81-86). Rollout rings also appear in feature_flags (apps/web/app/api/me/route.ts:278-283). |
| Model compatibility | Model entitlement uses the registry minimum tier per model (request-processor.ts:5335). Auto aliases are admitted by plan (model-plan-admission.ts:25-31). |
| Provider restrictions | Workspace model policy can block provider or model; US-only and zero-data-retention and no-training narrow providers (request-processor.ts:4709-4715). |
| Local mode | Local inference is not gated by plan in the code opened: mobile local models are listed without a plan check (apps/mobile/src/features/model-picker/service.ts:227) and CLI usage says local or BYOK sessions have no account usage (usage_summary.rs:343-356). Whether a sign-in is required for Local on each app is unknown. Mobile does not fetch the remote capability list in Local mode (Capabilities.tsx:39-45). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Capability not mentioned by server (mobile) | Keeps the build value so an unreachable server does not disable working features | apps/mobile/src/lib/Capabilities.tsx:58-64, 126-134 |
| Capability refresh fails (mobile) | Keeps the last answer and logs a warning | apps/mobile/src/lib/Capabilities.tsx:88-92 |
| App returns from background (mobile) | Refreshes capabilities on resume | apps/mobile/src/lib/Capabilities.tsx:118-120 |
| Workspace policy unreadable | Server refuses with 503 and Retry-After 30 | request-processor.ts:4690-4693; model-policy-gate.ts:21-33 |
| Training opt-out unreadable | Treated as opted out, no-training models only, warning logged | request-processor.ts:3615-3631 |
| No no-training model available | Request refused through noTrainingModelUnavailable | request-processor.ts:3670-3671, 4699-4700 |
| US-only preference cannot be loaded | Panel shows the load error text and a Retry action | UsOnlyRoutingPanel.tsx:97-110 |
| Plan tier cache older than 300 s (CLI) | Cache is re-queried | apps/cli/src/tier_cache.rs:43, 343 |
| Offline | not handled in the code for the resolver itself beyond keeping the last answer; web composer shows an offline send reason | ChatComposerNew.tsx:3588-3591 |
| Age refused (mobile) | Refusal record kept; typed higher age does not reopen the app | apps/mobile/src/features/auth/services/ageGate.ts:128-140 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/capability-handshake.test.ts`: The layered capability document and evaluator.
- `packages/contracts/types/src/__tests__/capabilities.test.ts`: Platform capability matrix.
- `apps/mobile/src/lib/Capabilities.test.tsx`: Mobile capability hook and remote switch-off.
- `apps/mobile/__tests__/capability-entitlement-contract.test.ts`: Mobile entitlement contract for capabilities.
- `apps/mobile/__tests__/CapabilityKillSwitchConsumers.test.tsx`: Kill-switch consumers on mobile.
- `apps/web/__tests__/CapabilityProvider.test.tsx`: Web capability provider.
- `apps/web/lib/services/capability-handshake-service.test.ts`: Server capability handshake build.
- `apps/web/lib/services/__tests__/model-policy-gate.test.ts`: Workspace model policy gate.
- `apps/web/lib/services/__tests__/model-policy-evaluator.test.ts`: Policy evaluation rules.
- `apps/web/app/api/me/routing-preferences/__tests__/no-unenforced-control.test.ts`: US-only is enforced and geo_overlay is not shipped as a control.
- `apps/web/features/settings/components/UsOnlyRoutingPanel.test.tsx`: Web US-only panel.
- `apps/mobile/__tests__/UsOnlyRoutingOwnership.test.tsx`: Mobile US-only ownership.
- `apps/web/app/api/settings/team/__tests__/route.authorization.test.ts`: Team route authorization.
- `apps/mobile/__tests__/AgeGateContract.test.tsx`: Mobile age gate.
- `apps/web/features/auth/__tests__/useSignupAgeGate.test.tsx`: Web sign-up age gate.
- `apps/extension-vscode/src/__tests__/tierRevalidation.test.ts`: VS Code plan revalidation signal.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.free-region-fallback.test.ts`: Free-plan region fallback in the chat route.

**Test scenarios**

- **Plan blocks a model on the server**
  1. Sign in on a Free-plan account.
  2. Send a chat request that names a model above the plan, bypassing the picker.
  3. Read the response.
  - Expected: HTTP 403, code model_not_available, message names the plan that includes the model.
- **Workspace policy blocks a provider**
  1. As admin set a model policy that blocks one provider.
  2. As a member send a request on web and CLI that routes to it.
  - Expected: Both are refused with the policy code; a policy refusal is counted as policy_blocked.
- **Unreachable server on mobile**
  1. Open mobile in Cloud mode with a loaded capability list.
  2. Turn the network off and bring the app to the front again.
  3. Use a capability that worked.
  - Expected: The capability stays available; a console warning says the refresh failed.
- **Local to Cloud in the CLI**
  1. Start a Local session.
  2. Run /privacy-mode managed.
  3. Run /continue-with-cloud.
  - Expected: First command changes nothing and names the handoff; the second shows a reviewable draft before anything is sent.
- **US-only switch**
  1. On an eligible plan open Privacy settings.
  2. Turn the switch on, reload.
  3. Send a chat.
  - Expected: Switch stays on; the chat route uses US-only providers.
- **Minor at sign-up**
  1. Enter an age under 18 at sign-up or mobile first run.
  - Expected: Access is refused with the age message; mobile keeps the refusal after a retry with a higher age.

**Where to look when it fails**

- Server log '[model-policy] model refused by workspace policy' with provider, model and code (request-processor.ts:5056-5063).
- Server warnings 'Provider training opt-out unreadable; routing only to models that keep inputs out of training' (request-processor.ts:3619-3622).
- Mobile console '[capabilities] refresh failed (keeping the last answer)' and '[tierStore] refreshTier failed (keeping cached tier)'.
- Error codes model_not_available, plan_upgrade_required, unsupported_parameter.
- Denial counter layer 'policy', reason 'policy_blocked' (model-policy-gate.ts:40-47).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Own-key path is not offered in the mobile picker (modes are local and cloud only) and was not found in the web composer footer.** Affects: Mobile, Web, Desktop users who want their own provider key. Evidence: apps/mobile/src/features/chat/store/appModeStore.ts:5; brief S78.24 marks mobile and desktop done. Work needed: Confirm where own-key is chosen on these apps or add the choice, then correct the brief.
- **Environment-gated models are always locked because environmentAvailability is a stub returning configured:false.** Affects: Web, Desktop, Mobile, VS Code. Evidence: apps/web/features/chat/lib/model-plan-admission.ts:19-21; apps/mobile/src/features/model-picker/service.ts:80. Work needed: Connect the function to real environment detection or remove the lock.
- **No single resolver across all six apps: the matrix has only web, desktop and mobile.** Affects: CLI, VS Code, Chrome. Evidence: packages/contracts/types/src/capabilities.ts:139-143; apps/cli/src/tier_cache.rs:244-251. Work needed: Route the CLI, VS Code and Chrome through the same document reader or document the difference.
- **Chrome requests the capability document with surface=web, not a Chrome surface.** Affects: Chrome. Evidence: apps/extension/src/features/cloud-bridge/capabilityDocument.ts:12-13. Work needed: Check whether the server needs a chrome surface value; unknown.
- **Role restrictions have no implementation found on CLI, VS Code or Chrome.** Affects: CLI, VS Code, Chrome. Evidence: brief S78.10 lists only web, desktop, mobile. Work needed: Decide whether the apps must show role limits or rely on server refusal.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- api:GET /api/me
- api:GET /api/me/routing-preferences
- file:packages/contracts/types/src/capability-handshake/evaluator.ts

## Unknown

- Where own key is chosen on mobile, web and desktop composers.
- Whether Local mode needs a sign-in on each app.
- How long US-only preference and the mobile age verdict are retained or whether the age verdict syncs.
- Whether the Chrome extension needs its own surface name in /api/me.
- What apps/cli/src/lib.rs lines named in the brief (1632, 1638) refer to; those lines are unrelated to path choice in the current file.

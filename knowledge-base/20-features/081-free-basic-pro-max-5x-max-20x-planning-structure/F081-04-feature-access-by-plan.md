---
id: "F081-04"
type: "feature"
title: "Feature access by plan"
aliases: ["Feature access by plan", "Plan capabilities", "BILLING_PLAN_CAPABILITY_TIERS", "Capability matrix", "Plan-specific feature explanations (S81.28)", "Cloud API access", "Cross-platform entitlement sharing (S81.27)", "S81.09 S81.26 S81.27"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S81.09", "S81.26", "S81.27"]
depends_on: ["F081-01", "F081-02", "F081-06", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-connectors-plugins-and-skills", "api:GET /api/me", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-04 Feature access by plan

Plans differ in named capabilities: connectors, Remote Control, Deep Research, AGI Work, image and video generation, Cloud API access, Cloud in CLI and VS Code, team and enterprise controls. One table lists which plans include each. The server checks them. Apps hide or show controls, and a locked feature names the plans that unlock it.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.09](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8109), [S81.26](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8126), [S81.27](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8127).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists 18 capabilities against plan tiers (packages/contracts/types/src/billing-catalog.ts:343-364), builds the upgrade message that names the plans (lines 424-437), and gates managed chat per app surface (apps/web/lib/free-chat-surface-policy.ts:97-122).

**Why it exists.** So plans differ in what they can do and not only in how much, and every app and the server answer the same question the same way.

**Who uses it.** Every Cloud user who meets a locked feature; API key holders; developers using the CLI and VS Code; support.

**Problems it solves**

- A blocked feature that does not say why
- One app showing a feature the server refuses
- API calls from a plan that does not include API access

**Use cases**

- A Free user taps Connectors and is told which plans include it
- A Premium user creates an API key and calls the Cloud API
- A Basic user signs in to the CLI with Cloud and is refused with 'Cloud in the CLI and VS Code' needing Premium or higher
- The same account shows the same plan on web, mobile and CLI

## 2. User experience

**Where to find it**

- Web: pricing table groups 'research', 'tools', 'admin'; upgrade dialog in chat (apps/web/app/pricing/page.tsx:820-860,860-900; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx)
- Web: /upgrade chooser lists features the next plan adds (apps/web/app/upgrade/UpgradeChooser.tsx:61-67)
- Mobile: paywall sheet titled 'Not included in your plan' (store off) or 'Upgrade to <plan>' (apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:129)
- Mobile: plans screen 'Includes' or 'Adds over <plan>' (apps/mobile/src/features/settings/plans/index.tsx:77-93)
- CLI: 'plans' command 'Adds over <plan>:' (apps/cli/src/plans.rs:213-231)
- VS Code: 'Code: Compare Plans' detail line (apps/extension-vscode/src/features/account-auth/planComparison.ts:42-65)
- Chrome: gate message 'Update billing to restore Managed Cloud chat.' and 'View plans' button (apps/extension/_locales/en/messages.json:185,199)
- API: HTTP 403 with code managed_api_plan_required (apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts:62)

**Before you start**

- Signed-in account
- For API access: an API key created on a plan that includes Cloud API access (apps/web/app/api/settings/api-keys/route.ts:23)

**Screens and controls**

- Locked controls with a message such as 'Your plan does not include <feature>. Upgrade to <plans> to use it.' (billing-catalog.ts:424-437)
- Mobile paywall primary button 'View upgrade options' or 'Contact Sales' for Team and Enterprise (PaywallBottomSheet.tsx:150-160)

**Journey**

1. Person uses a feature (for example Remote Control)
2. The server checks the plan against the capability table; the app also hides or locks the control
3. A refusal carries a code and the required plan
4. The app shows the paywall or message and links to plans
5. After upgrade the account endpoint returns the new plan and the same feature opens on every app

**What the person sees and gets**

- Message 'Your plan does not include Connectors. Upgrade to Basic, Premium, Max, Ultra, or Team to use it.' pattern from billingPlanCapabilityUpgradeMessage (billing-catalog.ts:424-437)
- 'Managed API access requires Premium or higher.' (request-surface.ts:62-66)
- 'Managed Cloud chat is not available on this plan.' (request-surface.ts:68-70)
- Card flag kind plan_capability shows no reset time (billing-catalog.ts:869-875,913-921)

**Settings**

- Mobile in-app capability filter IN_APP_CAPABILITIES hides capabilities the phone build does not ship (apps/mobile/src/features/settings/plans/index.tsx:35-55)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capability table: chat, tools, projects, memory, skills, sync on every Cloud plan; Connectors and Remote Control on Basic and above; AGI Work, Deep Research, image generation, Cloud API access, Cloud in CLI and VS Code, Slack app, connected apps in published apps on Premium and above; video generation only Ultra and Enterprise; team admin on Team, Team Premium, Enterprise; SSO, SCIM and admin controls on Enterprise only (billing-catalog.ts:343-364)
- Chat surface gate: web, mobile, desktop and Chrome need managed_chat; CLI and VS Code need developer_surfaces; an API key needs managed_api; an unbound token is refused (free-chat-surface-policy.ts:97-122; request-surface.ts:38-80)
- Surface is decided from signed token claims, not from a header the caller sets (request-surface.ts:20-36; free-chat-surface-policy.ts:60-95)
- Server gates found: video generation route, image generation, Remote Control gate, connector capability, API keys, Slack, team admin, SSO and SCIM access, capability handshake (apps/web/app/api/media/video/generate/route.ts:46; apps/web/lib/feature-flags/remote-control-gate.ts:8; apps/web/lib/connectors/connector-capability.ts:5; apps/web/app/api/settings/api-keys/route.ts:23; apps/web/lib/services/capability-handshake-service.ts:51)
- Every app reads the same plan: web store, mobile tier store from /api/me, CLI tier cache and usage endpoint, VS Code account identity, Chrome managed access (apps/mobile/src/features/billing/store.ts:79-110; apps/cli/src/plans.rs:144; apps/extension-vscode/src/core/commandSetup.ts:2175-2180)
- Plan-added features are computed by billingPlanCapabilitiesAddedOver on web, mobile and VS Code; the CLI uses its own copy checked by a conformance test (billing-catalog.ts:441; apps/cli/src/plans.rs:91,456)
- Seat plans give a per-seat plan to each member (apps/web/lib/services/entitlement-resolution.ts:133-166)

**Incomplete**

- Which plan includes agi_work, deep_research and memory is in the table, but a server call site that checks each of them was not found with a direct grep outside the capability handshake and request processor (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:268; capability-handshake-service.ts:51)
- Chrome explanation copy for features is marked unverified in the brief and was not traced
- Plan copy is filtered through release state, so a capability in the table can be hidden or labelled 'Coming soon' (apps/web/features/billing/lib/plan-capability-release.ts:47-60)

**Present but disconnected or switched off**

- Connectors are in state coming_soon, so pricing and plan views label them 'Coming soon' even though Basic and above include them in the table (packages/contracts/types/src/connector-release.ts:14; apps/web/app/pricing/page.tsx:96-110)
- Only the Web surface is labelled 'Available now'; desktop, CLI, mobile, VS Code and Chrome are labelled 'Coming soon' in pricing (apps/web/lib/surface-status.ts:6-13)
- Mobile hides managed_api, developer_surfaces, Slack, connected apps, team and enterprise controls and gates Remote Control and video generation behind app flags set to false (apps/mobile/src/features/settings/plans/index.tsx:35-55; apps/mobile/lib/v1FeatureFlags.ts:16,28)

**Not available**

- Plan lists for Chrome inside the extension: none found in the code
- Mobile Cloud API access and developer surfaces: not offered in the app

## 4. Required behaviour

**Established requirements**

- Plans differ in feature access, not just usage; differences are listed and each gate is enforced server-side. (source: S81.09 (brief))
- Programmatic and API use is an explicit plan capability: which plans include it, what it consumes, and API calls are gated by it. (source: S81.26 (brief))
- One account plan applies on every signed-in surface; each surface reads the same server-side entitlement and the server enforces it per surface. (source: S81.27 (brief); doc: docs/product/commercial.md 'Plan Presentation And Usage Windows')
- Each plan explains what it adds over the current plan and why a blocked feature needs a given plan. (source: S81.28 (brief))
- Execution boundaries and subscription rules are established from the code; one AGI Subscription system covers all apps. (source: task product context)
- Web search, memory, MCP, sandboxing, code execution, computer use and image generation depend on a provider route or an AGI harness and are never described as intrinsic model capabilities. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Free: Connectors and Remote Control are locked and the message names Basic, Premium, Max, Ultra or Team
2. Basic: Deep Research, image generation and Cloud API access are locked; Premium unlocks them
3. A video generation request on Premium is refused; Ultra succeeds
4. A CLI Cloud request on Basic returns 403 developer_surface_plan_required; on Premium it passes
5. An API key request on Basic returns 403 managed_api_plan_required
6. A token with no bound surface is refused with managed_cloud_surface_unknown
7. After upgrade, web, mobile, CLI, VS Code and Chrome all report the new plan after their next refresh

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A capability present in the table but without a server gate would be hidden only in the UI; each should have a gate test [inferred from the brief's 'enforced server-side' wording]
- The Slack and artifact connector capabilities follow the same table because they call canUseBillingPlanCapability (apps/web/lib/slack/slack-settings.ts; apps/web/lib/services/artifact-connector-gate.ts) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that lists every capability in the table and names the server call site that enforces it
- [proposed] Replace the CLI copy of the capability table by generated output from the TypeScript table
- [proposed] Show a plan list inside the Chrome panel or confirm the link-out is the intended design

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | BILLING_PLAN_CAPABILITY_TIERS and labels | `packages/contracts/types/src/billing-catalog.ts` | Capability table, labels, upgrade message, added-over helper (lines 343-445) |
| service | free-chat-surface-policy | `apps/web/lib/free-chat-surface-policy.ts` | Surface from token claims and the capability each surface needs (lines 60-122) |
| service | request-surface | `apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts` | Refusal bodies and codes for each surface (lines 20-80) |
| service | auth-gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Applies surface refusal after entitlement (lines 77-90, 341-363) |
| service | capability-handshake-service | `apps/web/lib/services/capability-handshake-service.ts` | Grants capabilities in the account response (line 51) |
| endpoint | GET /api/me | `apps/web/app/api/me/route.ts` | Returns plan, effective tier and capability handshake (lines 317-345) |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Video capability gate (line 46) |
| service | remote-control-gate | `apps/web/lib/feature-flags/remote-control-gate.ts` | Remote Control plan gate (line 8) |
| service | connector-capability | `apps/web/lib/connectors/connector-capability.ts` | Connector plan gate (line 5) |
| endpoint | settings/api-keys | `apps/web/app/api/settings/api-keys/route.ts` | API key creation gate (line 23) |
| service | plan-capability-release | `apps/web/features/billing/lib/plan-capability-release.ts` | Hides unreleased capabilities (lines 23-60) |
| config | connector-release | `packages/contracts/types/src/connector-release.ts` | coming_soon state and message (line 14) |
| config | SURFACE_STATUS | `apps/web/lib/surface-status.ts` | Which apps are labelled Available now or Coming soon (line 6) |
| screen | UpgradeChooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | New features of the next plan (lines 61-67) |
| screen | Mobile PlansScreen and PaywallBottomSheet | `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` | Mobile paywall text and plan comparison |
| store | Mobile tier store | `apps/mobile/src/features/billing/store.ts` | Caches plan and granted capabilities (lines 71-110,182-190) |
| command | CLI plans capability table | `apps/cli/src/plans.rs` | Rust copy of capability tiers and labels (lines 91-140) with conformance test (line 456) |
| command | VS Code comparePlans | `apps/extension-vscode/src/features/account-auth/planComparison.ts` | Added-over detail lines |
| component | Chrome side panel billing gate | `apps/extension/src/side_panel.ts` | Blocks chat for a lapsed subscription; upgrade link (lines 13427-13440, 12083) |
| test | auth-gate-free-surfaces test | `apps/web/app/api/llm/v1/chat/completions/__tests__/auth-gate-free-surfaces.test.ts` | Surface rules at the gate |
| test | plan-tier-conformance test | `packages/contracts/types/src/__tests__/plan-tier-conformance.test.ts` | Cross-app plan answers |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Token is verified; its signed claims decide the surface (web, Chrome, mobile, desktop shell, developer, API key). | our servers | apps/web/lib/free-chat-surface-policy.ts:60-95; apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts:20-36 |
| The gate looks up the plan and subscription status; a lapsed paid plan is treated as Free. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:313-352 |
| The needed capability for that surface is checked against the table; a miss returns 403 with a code and the required plan. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts:38-80 |
| Other features check their own capability on their route. | our servers | apps/web/app/api/media/video/generate/route.ts:46; apps/web/app/api/settings/api-keys/route.ts:23 |
| Apps read the granted capability list in the account response and lock controls. | device | apps/mobile/src/features/billing/store.ts:84-110,182-190 |
| The person sees the message and a link to web pricing or the paywall. | device | apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:129-160 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan and granted capabilities cached on the phone | mobile device store tier-store | Refreshed from the account endpoint | Cleared on sign-out (apps/mobile/src/features/billing/store.ts:112-135) |
| Plan cached for the CLI | CLI tier cache file | Refreshed from the server on use | File lifetime not traced (apps/cli/src/plans.rs:144) |
| Capability denials counted for observability | server metrics | Server only | unknown (apps/web/lib/services/entitlement-resolution.ts:221-231 calls recordCapabilityDenial) |

**Models and providers.** The capability table names no model or provider. Plan-gated features that call providers (image, video, research) are routed by the model catalog; access by plan is checked first (SYS-model-catalog-and-routing; SYS-agents-tools-and-automation).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account for every gate; an unbound token or no credential is refused. |
| Permissions | Team admin needs the workspace admin role plus a team plan; SSO and SCIM need Enterprise (apps/web/app/api/settings/team/team-admin-access.ts; apps/web/lib/server/sso/sso-access.ts). |
| Subscription | See the capability table in billing-catalog.ts:343-364. A lapsed subscription is served as Free (auth-gate.ts:341-352). |
| Limits and metering | Capability checks themselves do not meter. Image and video generation have their own usage rules (outside these six features). |
| Feature flags | Connector release state coming_soon; mobile FEATURES flags; surface release labels; server flags per feature (for example the remote control gate). |
| Model compatibility | A capability can be allowed by plan while the chosen model cannot do it; that check is separate (SYS-model-catalog-and-routing). |
| Provider restrictions | None found in the code at the plan layer. Plan access does not depend on a provider. |
| Local mode | No plan capability check runs for Local or own-key use. The catalog marks the local-only and byok tiers as free of charge with no managed capabilities (billing-catalog.ts:166-181,478-482). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Lapsed paid plan | Served as Free with a billing notice header; surfaces apply Free capabilities | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:341-352 |
| Unknown surface | 403 managed_cloud_surface_unknown | apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts:45-52 |
| Capability handshake not received | Mobile treats a capability as requestable until the handshake arrives | apps/mobile/src/features/billing/store.ts:182-190 |
| Feature coming soon | Labelled 'Coming soon' in plan views | apps/web/features/billing/lib/plan-capability-release.ts:47-60 |
| Entitlement lookup fails for a seat holder | The reply throws instead of reporting the member's own free row | apps/web/lib/services/entitlement-resolution.ts:402-410 |
| Offline | Mobile keeps cached plan; others not handled in the code | apps/mobile/src/features/billing/store.ts:117-121 |
| Accessibility | Mobile plan cards have one spoken summary; paywall sheet closes on hardware back | apps/mobile/src/features/settings/plans/index.tsx:118-132; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:107-110 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: Capability tiers: chat tools on Free, images from Premium, video Ultra and Enterprise, Remote Control and connectors paid, plan labels in messages (test titles lines 247-290)
- `apps/web/lib/free-chat-surface-policy.test.ts`: Surface policy; contents not read
- `apps/web/app/api/llm/v1/chat/completions/__tests__/auth-gate-free-surfaces.test.ts`: Free surfaces at the gate; contents not read
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.test.ts`: Gate incl. billing notice header for lapsed plans (lines 298-312)
- `packages/contracts/types/src/__tests__/plan-tier-conformance.test.ts`: Plan answers across apps; contents not read
- `apps/mobile/__tests__/NoPurchasesFeatureGates.test.tsx`: Mobile gates with purchases off; contents not read
- `apps/mobile/__tests__/PaywallBottomSheet.test.tsx`: Paywall sheet; contents not read
- `apps/extension-vscode/src/__tests__/planComparison.test.ts`: VS Code comparison; contents not read
- `apps/web/features/billing/lib/plan-capability-release.test.ts`: Release-state labels; contents not read
- `apps/cli/src/plans.rs`: Remote Control and connectors need paid plan; labels exist for every capability (lines 273-285,445-454)

**Test scenarios**

- **Locked connector message**
  1. Sign in on a Free account
  2. Try to open Connectors
  - Expected: Locked or labelled coming soon; the message names plans that include it
- **API key on Basic**
  1. Create an API key on a Basic test account if allowed
  2. Call the chat endpoint with it
  - Expected: 403 managed_api_plan_required with the Premium requirement
- **Developer surface**
  1. Sign in to the CLI with a Basic account in Cloud mode and run a Cloud turn
  - Expected: 403 developer_surface_plan_required naming the plans that include Cloud in the CLI and VS Code
- **Cross-app plan**
  1. Upgrade a test account to Premium
  2. Refresh web, mobile, CLI plans, VS Code compare
  - Expected: All show Premium as the held plan
- **Video generation**
  1. Request a video on Premium, then on Ultra
  - Expected: Premium refused with a plan message; Ultra accepted

**Where to look when it fails**

- Error codes developer_surface_plan_required, managed_api_plan_required, managed_chat_plan_required, managed_cloud_surface_unknown (request-surface.ts:45-70)
- Capability denial records (entitlement-resolution.ts:221-231)
- GET /api/me capability_handshake field (apps/web/app/api/me/route.ts:287-345)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Mobile: [70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- CLI: [70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- VS Code: [70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Chrome: [70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **Connectors are included on paid plans in the table but are 'coming soon' in the release state, so the plan lists disagree with the capability table** Affects: All apps that list connectors. Evidence: packages/contracts/types/src/connector-release.ts:14; packages/contracts/types/src/billing-catalog.ts:343-353. Work needed: Release the connectors or document the label as the intended presentation
- **Capabilities such as agi_work, deep_research and memory have no direct server gate found by grep** Affects: Premium-only features if the UI is the only guard. Evidence: grep of canUseBillingPlanCapability under apps/web/app/api and apps/web/lib (24 files; none for these). Work needed: Trace each feature's server route and add a gate test
- **CLI keeps its own copy of the capability table and labels** Affects: CLI plan view. Evidence: apps/cli/src/plans.rs:91-140; guarded by conformance test at plans.rs:456. Work needed: Generate the Rust table from the TypeScript source
- **Chrome feature explanations unverified; no plan list in the extension** Affects: Chrome users. Evidence: brief S81.28; apps/extension/src/side_panel.ts:12083. Work needed: Verify and decide design
- **Chrome blocks chat itself for a lapsed plan while the server would serve it as Free** Affects: Chrome users with a lapsed plan. Evidence: apps/extension/src/side_panel.ts:13427-13440; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:341-352. Work needed: Owner decision on the intended behaviour
- **Release labels mark every app except Web 'Coming soon' on pricing** Affects: Visitors reading pricing. Evidence: apps/web/lib/surface-status.ts:6-13. Work needed: Update when apps ship

**Depends on**

- F081-01
- F081-02
- F081-06
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-connectors-plugins-and-skills
- api:GET /api/me
- api:POST /api/llm/v1/chat/completions

## Unknown

- Server call sites for agi_work, deep_research and memory gates
- Whether the capability handshake is the only guard for some features
- Whether plan checks exist for Slack beyond the settings file
- Chrome feature explanation copy
- Production state of the connector release

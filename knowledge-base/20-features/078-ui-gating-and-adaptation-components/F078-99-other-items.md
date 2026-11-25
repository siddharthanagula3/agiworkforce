---
id: "F078-99"
type: "feature"
title: "Other items in UI gating and adaptation components"
aliases: ["Effective-capability inspector", "Capability inspector", "S78.27", "Other items in UI gating and adaptation components"]
area: "78 UI gating and adaptation components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S78.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "F078-08", "api:GET /api/me", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-99 Other items in UI gating and adaptation components

Item S78.27 asks for one view showing what is effectively available to a user on a surface and why anything is not. No such view exists on any app. A founder decision records that neither leader offers one, so it is not built. Only partial neighbours exist: a mobile Capabilities screen, a model catalogue, and a VS Code developer card.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.27](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7827).

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

**What it does.** Nothing today. The requirement describes a single screen that would list every feature, say whether it is available here, and name the reason (plan, workspace policy, surface, device, operator switch). The server already builds the layered data for such a view, the capability document with granted, denied-by and source fields, but no app presents it as a list. (apps/web/app/api/me/route.ts:287-343; apps/cli/src/tier_cache.rs:240-260)

**Why it exists.** It was written as an area requirement to make gating explainable. The owner then decided not to build it because neither ChatGPT nor Claude offers a capability inspector (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-07).

**Who uses it.** Nobody today. Support staff and testers would use it to answer why a control is missing for a person. [inferred]

**Problems it solves**

- Would answer 'why can I not use X here' in one place; today the answer is spread across per-control messages.

**Use cases**

- Not applicable: no screen exists.
- Adjacent today: a person opens the model catalogue on web to see which models their plan admits.
- Adjacent today: a mobile user opens Settings, Capabilities to see what AGI can use with on and off states.
- Adjacent today: a VS Code developer opens Developer diagnostics to see the resolved tier.

## 2. User experience

**Where to find it**

- No inspector on Web, Desktop, Mobile, CLI, VS Code or Chrome.
- Adjacent, web and Desktop: the model catalogue in the composer. (apps/web/features/chat/components/Composer/ModelCatalogue.tsx)
- Adjacent, mobile: Settings, Capabilities, titled 'Capabilities' with the heading 'What AGI can use'. (apps/mobile/src/features/settings/capabilities/index.tsx:337-339)
- Adjacent, VS Code: settings webview, 'Developer diagnostics', 'Resolved entitlement', 'Current resolved tier'; shown only when developer controls are on. (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2060-2073)
- Adjacent, CLI: model list output with 'Locked on your <plan> plan' and 'Temporarily unavailable' groups. (apps/cli/src/provider.rs:240-300)

**Before you start**

- None for the missing feature. Adjacent views need sign-in for plan-specific content.

**Screens and controls**

- none: there is no inspector screen or control.

**Journey**

1. Not applicable. A person who wonders why a control is missing must read the per-control message (for example the mobile unavailable view, the CLI refusal text or the VS Code lock reason).

**What the person sees and gets**

- Per-control denial text instead of a list: mobile 'is unavailable right now' or the denial title and message; CLI '<feature> is not available on your plan.' (apps/mobile/src/lib/capabilities.tsx unavailableCopy; apps/cli/src/tier_cache.rs capability_refusal)

**Settings**

- none

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The server builds a layered capability document (granted list, denied-by layers, sources, limits) and returns it on /api/me for any surface. (apps/web/app/api/me/route.ts:287-343; apps/cli/src/tier_cache.rs:240-290)
- Mobile, VS Code and CLI read the document for individual decisions and can name the denying layer in words (tier, settings, surface, model). (apps/mobile/src/lib/capabilities.tsx; apps/cli/src/tier_cache.rs capability_refusal; apps/extension-vscode/src/integrations/tierResolver.ts accountCapabilityDecision)
- The web model catalogue shows each model's capabilities and whether the plan admits it. (apps/web/features/chat/components/Composer/ModelCatalogue.tsx; audit/checklist/views/legacy/partial/078-ui-gating-and-adaptation-components.md S78.27 row)

**Incomplete**

- Mobile Capabilities screen lists on and off states but, per the audit view, does not read the server capability document or name the blocking layer; this was not re-verified against the current file beyond its title and group names. (audit/checklist/views/legacy/partial/078-ui-gating-and-adaptation-components.md; apps/mobile/src/features/settings/capabilities/index.tsx)
- VS Code diagnostics card shows only the resolved tier and is hidden unless developer controls are on. (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2060-2073)

**Present but disconnected or switched off**

- The server document is complete enough for an inspector, but no app renders it as a list. (apps/web/app/api/me/route.ts:342)

**Not available**

- Effective-capability inspector on Web, Desktop, Mobile, CLI, VS Code and Chrome. (brief S78.27: not applicable anywhere; doc: docs/decisions/2026-09-27-founder-decisions.md lines 187-197)

## 4. Required behaviour

**Established requirements**

- A view shows what is effectively available to this user on this surface and why anything is not. (source: S78.27 (brief 'Should'))
- The capability inspector is not built because neither ChatGPT nor Claude offers one; routing extras follow ChatGPT and Claude. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-07))
- Parity with the leaders is the reference for product calls. (source: doc: AGENTS.md section 10)

**Acceptance criteria**

1. No app presents a screen titled as a capability inspector, and the brief marks the item not applicable on all six apps.
2. Where a gate denies a feature, the per-control message names the reason (plan, pause, device or surface) as the mobile and CLI messages do.
3. If the decision changes, a new inspector lists each capability from the server document with allowed or denied and the denying layer, on each app.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the decision removes the screen, the requirement that denials name their reason is carried by S78.16, S78.18 and S78.19 instead. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep the item marked as decided-not-built and point it to D-2026-09-28-07 so it does not appear as an open gap.
- [proposed] If support needs it, add a read-only diagnostics list inside the existing developer-only surfaces rather than a customer screen.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/me capability handshake | `apps/web/app/api/me/route.ts` | Builds and returns the layered effective-capability document (line 287) and wire form (line 342). |
| schema | CapabilityDocumentWire | `apps/cli/src/tier_cache.rs` | CLI wire type: granted, denied-by, sources and limits. |
| store | useTierStore capabilityDocument | `apps/mobile/src/features/billing/store.ts` | Mobile holder of the document. |
| store | useBillingStore capabilityDocument | `apps/web/shared/stores/web-auth-store.ts` | Web holder of the document. |
| service | accountCapabilityDecision | `apps/extension-vscode/src/integrations/tierResolver.ts` | VS Code decision lookup from the stored document. |
| service | capabilityAllowed | `apps/extension/src/features/cloud-bridge/capabilityDocument.ts` | Chrome decision lookup. |
| screen | Capabilities (mobile) | `apps/mobile/src/features/settings/capabilities/index.tsx` | Adjacent: list of what AGI can use with on and off states. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Adjacent: model capabilities and plan admission. |
| screen | Developer diagnostics card | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Adjacent: resolved tier, developer-only. |
| command | model list with locked and unavailable groups | `apps/cli/src/provider.rs` | Adjacent: CLI list of models by availability. |
| service | capability_refusal | `apps/cli/src/tier_cache.rs` | Per-feature reason text from the denying layer. |
| service | useCapabilityDenialReason | apps/mobile/src/lib/capabilities.tsx (not found) | Per-capability reason on mobile. |
| test | SettingsCapabilityBoundaries test | `apps/web/features/settings/sections/SettingsCapabilityBoundaries.test.tsx` | Web settings capability boundaries (file exists; cases not read). |
| test | GAP-012 settings webview test | `apps/extension-vscode/src/__tests__/GAP-012-settings-webview.webview.test.ts` | Checks the Developer diagnostics card shows 'Resolved entitlement' (line 178). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No inspector flow exists. The capability document is fetched by the apps for per-control decisions (see the live-refresh feature F078-08). | device and our servers | apps/web/app/api/me/route.ts:342; apps/mobile/src/features/billing/store.ts:79-101 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capability document | per app in memory or app storage (see F078-08) | read from server | see F078-08 |

**Models and providers.** The document carries a model layer that can deny a feature for the current model (apps/cli/src/tier_cache.rs capability_refusal). An inspector, if built, would need to show model and provider reasons; none exists.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (no feature). |
| Permissions | none found in the code. |
| Subscription | none found in the code; the document it would show is governed by SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code; nothing runs. The server document is not requested by mobile Local mode (apps/mobile/src/features/billing/store.ts:73). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state of an inspector | not handled in the code: no inspector exists. | No file found by name or text search in apps for a capability inspector screen; decision in docs/decisions/2026-09-27-founder-decisions.md |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/GAP-012-settings-webview.webview.test.ts`: Developer diagnostics card contains 'Resolved entitlement' (adjacent surface only).
- `apps/web/features/settings/sections/SettingsCapabilityBoundaries.test.tsx`: Web settings capability boundaries (adjacent; cases not read).

**Test scenarios**

- **Confirm no inspector on any app**
  1. Open Settings on web, Desktop, mobile, VS Code and Chrome and run the CLI help.
  2. Look for a screen or command that lists feature availability with reasons.
  - Expected: None is found, matching the not-applicable status.
- **Per-control reason on mobile**
  1. Switch a capability off on the server and open the control on mobile in Cloud mode.
  2. Repeat with a plan that does not include the capability.
  - Expected: The first shows 'is unavailable right now' and the pause text; the second shows the plan denial title and message.
- **CLI refusal layer**
  1. On a plan that lacks voice, run the CLI voice command.
  - Expected: Text such as 'Voice is not available on your plan.' (feature name as built in the CLI).

**Where to look when it fails**

- Read the /api/me response, field capability_handshake, to see granted and denied-by for an account.
- Decision text: docs/decisions/2026-09-27-founder-decisions.md, entry D-2026-09-28-07.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief and the audit view disagree: the brief marks S78.27 not applicable everywhere, while the audit view lists web, desktop, mobile and VS Code as partial with a 'ui' gap and CLI and Chrome as missing.** Affects: Planning and status reporting for all apps.. Evidence: audit/checklist/views/legacy/partial/078-ui-gating-and-adaptation-components.md (S78.27 table); docs/decisions/2026-09-27-founder-decisions.md lines 187-197.. Work needed: Owner of the audit register to align the row with the decision (mark decided-not-built or remove it).
- **If the owner reverses the decision, no inspector exists on any app and the document needs a shared rendering component.** Affects: All six apps.. Evidence: No inspector file found; server document already available (apps/web/app/api/me/route.ts:342).. Work needed: A shared list component plus per-app entry points and reason wording for each denying layer.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- F078-08
- api:GET /api/me
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-shared-ui-and-design

## Unknown

- Whether the owner wants the audit register row updated; the brief and the audit view conflict.
- Whether the mobile Capabilities screen uses the server capability document today; only its title and group labels were read, and the audit view says it does not.
- Contents of the web model catalogue's plan admission text beyond what the audit view states.
- Whether any test has been run: none recorded.

---
id: "GAPS-AREA-078"
type: "gap-list"
title: "Gaps: UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 78. UI gating and adaptation components

42 open gaps that touch this area. Area page: [20-features/078-ui-gating-and-adaptation-components](../../20-features/078-ui-gating-and-adaptation-components/README.md).

## GAP-AREA078-LW03

**Mobile treats any capability the server does not mention as allowed. This keeps the app working when the server is unreachable, but a new capability is on by default until the server switches it off.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-078
- Detail: Area 78. UI gating and adaptation components
- Evidence: apps/mobile/src/lib/capabilities.tsx:60-110 (switchedOff only records explicit false flags)

## GAP-F078-01-01

**Own-key path is not offered in the mobile picker (modes are local and cloud only) and was not found in the web composer footer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-01](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)
- Detail: Affects: Mobile, Web, Desktop users who want their own provider key. Work needed: Confirm where own-key is chosen on these apps or add the choice, then correct the brief.
- Evidence: apps/mobile/src/features/chat/store/appModeStore.ts:5; brief S78.24 marks mobile and desktop done

## GAP-F078-01-02

**Environment-gated models are always locked because environmentAvailability is a stub returning configured:false.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-01](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)
- Detail: Affects: Web, Desktop, Mobile, VS Code. Work needed: Connect the function to real environment detection or remove the lock.
- Evidence: apps/web/features/chat/lib/model-plan-admission.ts:19-21; apps/mobile/src/features/model-picker/service.ts:80

## GAP-F078-01-03

**No single resolver across all six apps: the matrix has only web, desktop and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-01](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Route the CLI, VS Code and Chrome through the same document reader or document the difference.
- Evidence: packages/contracts/types/src/capabilities.ts:139-143; apps/cli/src/tier_cache.rs:244-251

## GAP-F078-01-04

**Chrome requests the capability document with surface=web, not a Chrome surface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-01](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)
- Detail: Affects: Chrome. Work needed: Check whether the server needs a chrome surface value; unknown.
- Evidence: apps/extension/src/features/cloud-bridge/capabilityDocument.ts:12-13

## GAP-F078-01-05

**Role restrictions have no implementation found on CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-01](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide whether the apps must show role limits or rely on server refusal.
- Evidence: brief S78.10 lists only web, desktop, mobile

## GAP-F078-02-01

**Server refuses unsupported sampling parameters rather than correcting them; brief says remove or correct.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-02](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)
- Detail: Affects: API callers and any app that sends sampling values. Work needed: Decide strip or refuse and align the brief and apps.
- Evidence: request-processor.ts:5153-5164

## GAP-F078-02-02

**No attachment keep-or-remove choice on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-02](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)
- Detail: Affects: Those four apps. Work needed: Build the choice or accept a block message.
- Evidence: brief S78.25

## GAP-F078-02-03

**Mobile accepted file types do not depend on the selected model, only on destination.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-02](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)
- Detail: Affects: Mobile. Work needed: Add per-model type checks or reword the requirement.
- Evidence: attachmentValidation.ts:154-180

## GAP-F078-02-04

**Media settings and attachment-type gating absent on VS Code; Chrome attachment-type gating absent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-02](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)
- Detail: Affects: VS Code, Chrome. Work needed: Decide if these apps need them.
- Evidence: brief S78.03, S78.06

## GAP-F078-02-05

**Media options by model were not verified in code for mobile, CLI and web video.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-02](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)
- Detail: Affects: Mobile, CLI, Web. Work needed: Read and test those paths.
- Evidence: brief names ChatComposerNew.tsx:4921, videogen.ts:65, image.rs:100; not opened

## GAP-F078-02-NOTBUILT

**Model-matched composer controls: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F078-02](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)
- Requirement items: S78.03, S78.06, S78.25
- Detail: Mobile: S78.25; CLI: S78.25; VS Code: S78.03, S78.06, S78.25; Chrome: S78.03, S78.25

## GAP-F078-03-01

**Environment lock reason is permanent because the availability check is a stub.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-03](../../20-features/078-ui-gating-and-adaptation-components/F078-03-hidden-and-disabled-controls.md)
- Detail: Affects: Web, Mobile, VS Code. Work needed: Wire to real environment status.
- Evidence: model-plan-admission.ts:19-21

## GAP-F078-03-02

**Reason wording is per app, not read from the shared denial catalog everywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-03](../../20-features/078-ui-gating-and-adaptation-components/F078-03-hidden-and-disabled-controls.md)
- Detail: Affects: All six apps. Work needed: Decide the single owner of lock copy.
- Evidence: service.ts:65-72 vs modelConstants.ts:140-165 vs provider.rs:289-299

## GAP-F078-03-03

**Empty-list reason on web was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-03](../../20-features/078-ui-gating-and-adaptation-components/F078-03-hidden-and-disabled-controls.md)
- Detail: Affects: Web, Desktop. Work needed: Check and add a reason.
- Evidence: ComposerFooter.tsx:1199-1206 only shows a locked slot

## GAP-F078-03-04

**Plan-locked web rows are clickable, not disabled; the brief says disabled.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-03](../../20-features/078-ui-gating-and-adaptation-components/F078-03-hidden-and-disabled-controls.md)
- Detail: Affects: Web, Desktop. Work needed: Update the requirement text: locked-but-actionable is the shipped behaviour.
- Evidence: ComposerFooter.tsx:671-674, 736

## GAP-F078-04-01

**Web marks a failed poll stale but no visible stale notice was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-04](../../20-features/078-ui-gating-and-adaptation-components/F078-04-plan-allowance-shown-to-the-user.md)
- Detail: Affects: Web, Desktop. Work needed: Show a stale note or confirm the stale flag is read.
- Evidence: useManagedUsageSummary.ts:46-48

## GAP-F078-04-02

**Chrome and VS Code meters were not opened in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-04](../../20-features/078-ui-gating-and-adaptation-components/F078-04-plan-allowance-shown-to-the-user.md)
- Detail: Affects: Chrome, VS Code. Work needed: Read and test these views.
- Evidence: brief S78.08 only

## GAP-F078-04-03

**Mobile Free-plan view was not checked against the Upgrade-only rule.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-04](../../20-features/078-ui-gating-and-adaptation-components/F078-04-plan-allowance-shown-to-the-user.md)
- Detail: Affects: Mobile. Work needed: Verify.
- Evidence: cloud-usage/index.tsx not fully read

## GAP-F078-05-01

**No single shared wording across server, web, CLI, VS Code and mobile; each app has its own text for the same plan block.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-05](../../20-features/078-ui-gating-and-adaptation-components/F078-05-why-something-is-blocked-and-what-unlocks-it.md)
- Detail: Affects: All six apps. Work needed: Choose reason-codes.ts as the owner and have apps look up wording from it.
- Evidence: request-processor.ts:5342; errors.rs:397-402; cloudUtilityErrorActions.ts:84-88; PaywallBottomSheet.tsx:110-126

## GAP-F078-05-02

**Chrome and Desktop-specific wording not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-05](../../20-features/078-ui-gating-and-adaptation-components/F078-05-why-something-is-blocked-and-what-unlocks-it.md)
- Detail: Affects: Chrome, Desktop. Work needed: Read and test.
- Evidence: brief S78.19 only

## GAP-F078-05-03

**Brief says server returns fixed strings; some server refusals build their message from the model id and plan label.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-05](../../20-features/078-ui-gating-and-adaptation-components/F078-05-why-something-is-blocked-and-what-unlocks-it.md)
- Detail: Affects: API callers. Work needed: Clarify the requirement.
- Evidence: request-processor.ts:5342

## GAP-F078-06-01

**Connector detection and connect-account explanation absent on mobile, CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-06](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)
- Detail: Affects: Those four apps. Work needed: Add the check where connector features exist, or record not applicable.
- Evidence: brief S78.13, S78.20

## GAP-F078-06-02

**Device list failure is shown as 'no desktop paired'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-06](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)
- Detail: Affects: Web. Work needed: Separate error from empty.
- Evidence: use-paired-desktop.ts:70-73

## GAP-F078-06-03

**Brief says the action is hidden or disabled with a reason when no device is paired; code shows a download link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-06](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)
- Detail: Affects: Web. Work needed: Update the requirement.
- Evidence: ContinueOnDesktop.tsx:36-45

## GAP-F078-06-04

**Device detection missing on CLI and VS Code; Chrome continue and device evidence not found in code searched.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-06](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Confirm and implement or mark n/a.
- Evidence: brief S78.14; side_panel.ts search

## GAP-F078-06-05

**Mobile has no continue-on-another-device action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-06](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)
- Detail: Affects: Mobile. Work needed: Decide if needed.
- Evidence: brief S78.23 has no mobile status

## GAP-F078-06-NOTBUILT

**Connections, devices and runtimes: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F078-06](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)
- Requirement items: S78.13, S78.14, S78.15, S78.20, S78.23
- Detail: Mobile: S78.13, S78.20; CLI: S78.13, S78.14, S78.20; VS Code: S78.13, S78.14, S78.20; Chrome: S78.13, S78.14, S78.15, S78.20, S78.23

## GAP-F078-07-01

**Web dictation explains the microphone only after a denial; there is no reason before the browser prompt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-07](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)
- Detail: Affects: Web and Desktop (Desktop shows the web app); all users of dictation.. Work needed: Show a short reason at first use before the request and keep the denial text with a clear way to grant later.
- Evidence: apps/web/features/chat/stores/voice-input-store.ts:268 calls getUserMedia directly; text at :452 is shown after the error; apps/web/features/chat/hooks/use-dictation.ts start has no pre-step.

## GAP-F078-07-02

**Mobile voice requests the microphone from the system with no in-app reason; the reason is only the system usage string and the Permissions screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-07](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)
- Detail: Affects: Mobile (iOS and Android).. Work needed: Add an in-app explanation before the first system request, reusing the registry description.
- Evidence: apps/mobile/src/features/voice/services/voiceInput.ts:216-240; apps/mobile/app.config.js:171.

## GAP-F078-07-03

**Explanation text is a mobile registry only; other apps keep separate copies.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-07](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)
- Detail: Affects: All apps; consistency and translation.. Work needed: Decide a shared owner for permission copy and move each surface to it.
- Evidence: registry.ts (mobile), permissionManager.ts CAPABILITY_LABELS (Desktop), messages.json (Chrome), agentModeConsent.ts literals (VS Code).

## GAP-F078-07-04

**Desktop microphone has no in-app reason dialog; the trusted app origin gets audio through Chromium handlers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-07](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)
- Detail: Affects: Desktop dictation.. Work needed: Decide whether to add an in-app reason before the operating-system prompt; the Settings list already links to the system pane.
- Evidence: apps/desktop/electron/runtime/permissionManager.ts comment on microphone label; apps/desktop/electron/permissionPolicy.ts; apps/desktop/electron/main.ts:844.

## GAP-F078-07-05

**The brief's first-draft claim that mobile Settings lists every permission with a description is true only for eight kinds; location, contacts or other kinds are not in the registry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-07](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)
- Detail: Affects: Mobile.. Work needed: Confirm no other permission is requested by the app and add any that is.
- Evidence: apps/mobile/src/features/settings/permissions/types.ts MobilePermissionKind.

## GAP-F078-07-06

**No test file was found for the Desktop permission dialog text or the Chrome site card copy by name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-07](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)
- Detail: Affects: Desktop and Chrome.. Work needed: Confirm coverage or add tests asserting the reason text appears before the grant.
- Evidence: apps/desktop/electron/__tests__ and apps/extension/__tests__ listings; cases of browser-task-site-grants were not read.

## GAP-F078-08-01

**Web does not refresh the account store on focus or on a timer; only listed events trigger it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-08](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)
- Detail: Affects: Web and Desktop; a plan or operator switch made elsewhere reaches the open window late.. Work needed: Add a refresh on focus and a bounded interval with keep-last-on-error, and confirm it with a test.
- Evidence: apps/web/shared/stores/web-auth-store.ts (no focus or interval); refreshUser callers listed in apps/web (UpgradeWelcome, Billing, composer retry, preferences-client).

## GAP-F078-08-02

**CLI drops to the default after cache expiry when the network fails; it does not keep the last answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-08](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)
- Detail: Affects: CLI users offline or during an outage.. Work needed: Read an expired cache as a fallback on fetch failure and mark it.
- Evidence: apps/cli/src/tier_cache.rs read_fresh_envelope requires a fresh timestamp; resolve_user_tier_for returns an empty result on fetch error.

## GAP-F078-08-03

**Chrome sets the capability document to null when only the account summary request fails, hiding permitted controls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-08](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)
- Detail: Affects: Chrome users during a partial outage.. Work needed: Keep the previous document when the summary fails.
- Evidence: apps/extension/src/side_panel.ts:13322, 13401; capabilityDocument.ts:57-60; capabilityAllowed returns false for a null document.

## GAP-F078-08-04

**Refresh on a connection change (connector connect or disconnect) and a device change (paired desktop) is not established for web, CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-08](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)
- Detail: Affects: All apps for connector and device gates.. Work needed: Read use-paired-desktop.ts and the connector hooks and test the update without a restart.
- Evidence: mobile connector screen calls refreshTier (apps/mobile/src/features/settings/cloud-connectors/index.tsx:529); equivalents elsewhere not read.

## GAP-F078-08-05

**The brief points to ChatComposerNew.tsx:879 and the web billing query as the refresh path; the composer path found is the billing store, and the billing query is used only by pricing and upgrade pages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-08](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)
- Detail: Affects: Documentation accuracy for web.. Work needed: Correct the brief's evidence line.
- Evidence: apps/web/features/billing/hooks/use-billing-queries.ts callers; ChatComposerNew.tsx:1055.

## GAP-F078-08-06

**No test was found that asserts web keeps the last plan after a failed refresh.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-08](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)
- Detail: Affects: Web.. Work needed: Add a store test for failed refresh.
- Evidence: apps/web test listing for useBillingStore (UpgradeChooser, UpgradeOrderScreen, pricing page, UpgradeWelcome tests only).

## GAP-F078-99-01

**The brief and the audit view disagree: the brief marks S78.27 not applicable everywhere, while the audit view lists web, desktop, mobile and VS Code as partial with a 'ui' gap and CLI and Chrome as missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-99](../../20-features/078-ui-gating-and-adaptation-components/F078-99-other-items.md)
- Detail: Affects: Planning and status reporting for all apps.. Work needed: Owner of the audit register to align the row with the decision (mark decided-not-built or remove it).
- Evidence: audit/checklist/views/legacy/partial/078-ui-gating-and-adaptation-components.md (S78.27 table); docs/decisions/2026-09-27-founder-decisions.md lines 187-197.

## GAP-F078-99-02

**If the owner reverses the decision, no inspector exists on any app and the document needs a shared rendering component.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F078-99](../../20-features/078-ui-gating-and-adaptation-components/F078-99-other-items.md)
- Detail: Affects: All six apps.. Work needed: A shared list component plus per-app entry points and reason wording for each denying layer.
- Evidence: No inspector file found; server document already available (apps/web/app/api/me/route.ts:342).

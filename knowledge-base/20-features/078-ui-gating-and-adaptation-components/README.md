---
id: "AREA-078"
type: "area"
title: "UI gating and adaptation components"
features: ["F078-01", "F078-02", "F078-03", "F078-04", "F078-05", "F078-06", "F078-07", "F078-08", "F078-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 78. UI gating and adaptation components

This area decides what a person can see and use right now. It checks the plan, the selected model, the workspace policy, the region, the account and the connected devices, then shows the control, hides it, or shows it disabled with a reason. It also tells the person what would unlock the feature (a plan, a connection, another model, a permission), so a blocked feature is not a dead end. Without it, a free user would see controls that fail, and a model that cannot read a file would silently drop it.

**Who uses it.** Every signed-in user, on every surface, since the checks run for everyone. Paid-plan users see the plan allowance and paid model options. Workspace owners and admins set the policies and role-only controls. Developers and QA use the same code paths; there is no separate admin screen for the gating logic itself. Signed-out or unsupported-region users see the restricted states described in the features below.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F078-01](F078-01-who-may-use-what-and-where-it-runs.md) | Who may use what, and where it runs | built | built | built | built | built | built |
| [F078-02](F078-02-model-matched-composer-controls.md) | Model-matched composer controls | built | built | partly | partly | partly | partly |
| [F078-03](F078-03-hidden-and-disabled-controls.md) | Hidden and disabled controls | built | built | built | built | built | built |
| [F078-04](F078-04-plan-allowance-shown-to-the-user.md) | Plan allowance shown to the user | built | built | built | built | built | built |
| [F078-05](F078-05-why-something-is-blocked-and-what-unlocks-it.md) | Why something is blocked, and what unlocks it | built | built | built | built | built | built |
| [F078-06](F078-06-connections-devices-and-runtimes.md) | Connections, devices and runtimes | built | built | partly | partly | partly | no |
| [F078-07](F078-07-permission-explanations.md) | Permission explanations | built | built | built | built | built | built |
| [F078-08](F078-08-live-refresh-after-a-change.md) | Live refresh after a change | built | built | built | built | built | built |
| [F078-99](F078-99-other-items.md) | Other items in UI gating and adaptation components | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/078-ui-gating-and-adaptation-components.md](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md).

## How this area works in the code

1. **Shared decision rule.** A capability is allowed only if the server granted it and no layer denies it. The rule is a pure function that takes the capability document and returns the decision, the denying layer, the reason and any limits. (`packages/contracts/types/src/capability-handshake/evaluator.ts:85-101 (resolveCapabilityDecision)`, `packages/contracts/types/src/capability-handshake/evaluator.ts:120-140 (resolveCapabilityDocumentDecision, which filters the wire document to known capabilities and layers)`)
2. **Mobile capability document and switches.** Mobile keeps the capability document in device storage, and the remote capability store asks the server for the feature flags. A capability whose flag is false is switched off; a capability the server does not mention stays on. (`apps/mobile/src/features/billing/store.ts:150-180 (persisted tier, billing and capability document fields; resolveMobileCapabilityDecision)`, `apps/mobile/src/lib/capabilities.tsx:60-110 (refresh from /api/me?surface=mobile, keep last answer on error, clear on sign-out)`)
3. **Composer asks the model and plan.** The composer reads the selected model and the plan, and shows, disables or hides each control. The brief lists the composer files; the detailed logic was not opened in this pass. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:255 (per brief, not opened)`, `apps/mobile/src/features/model-picker/components/ModelRow.tsx:166-169 (per brief, not opened)`)
4. **Server turn gate for each model call.** Before a model call, the server reads the plan, the training opt-out, the Google user-data state and the health-space project. It chooses a route; if a read fails, it picks the stricter route and logs a warning. The free plan may be moved to the free trial model. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3600-3660 (training opt-out, free-model promotion, free auto selection)`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1025-1045 (task type for the web runtime and tool-aware task type)`)
5. **Region refusal for free models.** The server checks whether a free model is refused in the caller's region and falls back. The check currently returns false (see things that look wrong). (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2807 (region refusal message)`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3269-3282 (freeModelRefusedInRegion)`)
6. **Sign-up and terms.** On web sign-up, the page posts the terms version and surface to the terms endpoint. A 409 means the terms version is outdated and the user must reload. The mobile age gate stores a verdict on the device. (`apps/web/app/signup/complete/RecordTermsAcceptance.tsx:84-106 (POST /api/terms/accept, outdated and not-applicable handling)`, `apps/mobile/src/features/auth/services/ageGate.ts:120-140 (isAgeGateConfirmed, isMinorMode, confirmAgeGate)`)
7. **Devices.** When no desktop host is present, the web app fetches the list of devices and picks a paired desktop. A failure sets no desktop, so the continue action is not offered. (`apps/web/features/desktop-host/hooks/use-paired-desktop.ts:55-70`)
8. **Plan tier on the CLI.** The CLI maps each plan tier to a managed routing tier. Tiers without developer-surface access fail closed. (`apps/cli/src/tier_cache.rs:240-255 (managed_auto_routing_tier)`)
9. **Extension tier change.** The VS Code extension has a listener that runs when the account tier may have changed, so the UI rechecks. (`apps/extension-vscode/src/integrations/tierRevalidation.ts:10-25 (onAccountTierMayHaveChanged, notifyAccountTierMayHaveChanged)`)

## Files to know

| File | Role |
|---|---|
| `packages/contracts/types/src/capability-handshake/evaluator.ts` | The shared decision rule for every capability (granted and not denied), used by the mobile capability store. |
| apps/mobile/src/lib/capabilities.tsx (not found) | Mobile capability store and provider: fetches switch-offs from the server, keeps the last answer on error, clears on sign-out. |
| `apps/mobile/src/features/billing/store.ts` | Mobile tier and billing store; persists the plan and capability document on device; exposes resolveMobileCapabilityDecision. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Server turn gate: routing, free-model promotion, training opt-out, region refusal, and the messages users see when a route is unavailable. |
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Entry point of the model-call API; the brief places the plan and tier check for the turn here (per brief, not fully opened). |
| `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web composer footer: model-dependent controls and disabled states (per brief, not opened). |
| `apps/web/features/settings/components/UsOnlyRoutingPanel.tsx` | Web panel for the US-only provider setting; reads allowed plans from the model registry policy and saves the setting. |
| `apps/web/app/signup/complete/RecordTermsAcceptance.tsx` | Records the terms acceptance at sign-up and handles the outdated-terms response. |
| `apps/mobile/src/features/auth/services/ageGate.ts` | Mobile age gate: thresholds by region (from the device time zone), verdict record, and minor mode. |
| `apps/web/features/desktop-host/hooks/use-paired-desktop.ts` | Finds a paired desktop for continue-on-another-device when the web app is not running inside the desktop host. |
| `apps/cli/src/tier_cache.rs` | CLI plan-tier cache and its mapping to the managed routing tier. |
| `apps/extension-vscode/src/integrations/tierRevalidation.ts` | VS Code listener that tells the UI to recheck the plan tier after an account change. |

## What is stored

- Mobile plan tier, billing status, capability document, granted capabilities and last-refresh time: Device storage (MMKV, via the mobile tier store partialize list)
- Mobile age-gate record: confirmed flag, minor flag, time confirmed, region code, threshold: Device storage (MMKV, via apps/mobile/src/features/auth/services/ageGate.ts)
- Terms acceptance with its version and surface, and the marketing-email notice version: Server, posted to the terms endpoint (table not opened)
- Provider training opt-out, health-space project and Google user-data state used to choose a route: Server database, read per turn (table not opened)
- Paired desktop list: Server, returned by the devices endpoint (not stored in the browser)
- Managed usage summary and remaining allowance: Server, read by each surface (storage not opened)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Remote feature flags for mobile capabilities**: A capability whose flag is false from the server is switched off on the next refresh; missing flags keep the build default. (apps/mobile/src/lib/capabilities.tsx:60-110 (reads parsed.feature_flags from /api/me?surface=mobile))
- **Plan tier to routing tier**: Sets which model roster each plan gets; tiers without developer-surface access fail closed. (apps/cli/src/tier_cache.rs:240-255)
- **Free model promotion and free trial model**: Moves a free plan's request to the free trial model and applies the free promotion. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3600-3660)
- **Free model region refusal**: Would move a free request off the free model if the region refuses it; currently always false. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3269-3282)
- **US-only provider routing**: Lets the user or workspace restrict routing to US-only providers, for allowed plans only. (apps/web/features/settings/components/UsOnlyRoutingPanel.tsx:25-26 and :91 (body.us_only); PrivacySection.tsx:606)
- **Age threshold by region**: Sets the minimum age per region (18 for the regions in the rule table); the region comes from the device time zone. (apps/mobile/src/features/auth/services/ageGate.ts:17-40 (rules and time zone table) and :120-140)
- **Terms version**: The terms version sent at sign-up; a stale version gets a 409 and the user must reload. (apps/web/app/signup/complete/RecordTermsAcceptance.tsx:84-106 (version from POLICY_LAST_UPDATED.terms))
- **Data region for managed cloud**: Sets the data region and the allowed developer jurisdictions used by routing. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:392 (managedCloudDataRegion, readOrganizationRegion imports); :3277-3282)

## Shared between apps

{"shared":["packages/contracts/types/src/capability-handshake/evaluator.ts: the decision rule for capabilities, used by the mobile capability store.","Model catalog and policy data (modelRegistry policies, for example the US-only allowed plans), read by the web panel and by routing; the brief also lists packages/ai/routing/src/auto.ts for region routing (not opened).","Web composer code is shared by the web app and the desktop app (desktop reuses the web composer per the brief)."],"separate":["Each app has its own gating UI: web components, mobile stores and screens, the CLI in Rust (apps/cli), and the VS Code extension in TypeScript (apps/extension-vscode).","The CLI maps plan tiers to routing tiers in its own Rust code (apps/cli/src/tier_cache.rs), not from the shared evaluator.","Mobile keeps its own capability store (apps/mobile/src/lib/capabilities.tsx) and its own age gate (apps/mobile/src/features/auth/services/ageGate.ts)."]}

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The free-model region check always returns false. Its comment says that while the region checks nothing, this is always false. The brief marks regional restrictions as done (S78.11), so this is a stub on the free plan path. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3269-3282)
- The brief says there is one feature-availability resolver (S78.01). I found a shared decision rule used by mobile, and a separate Rust tier mapping in the CLI. I did not find the web, CLI or VS Code gating going through the shared rule, so the 'one resolver' claim is not confirmed. (packages/contracts/types/src/capability-handshake/evaluator.ts:85; apps/mobile/src/lib/capabilities.tsx:60-110; apps/cli/src/tier_cache.rs:240-255)
- Mobile treats any capability the server does not mention as allowed. This keeps the app working when the server is unreachable, but a new capability is on by default until the server switches it off. (apps/mobile/src/lib/capabilities.tsx:60-110 (switchedOff only records explicit false flags))
- Mobile age check is self-declared. The code comment says nothing in the app verifies the typed age, and the region comes from the device time zone (a guess at the user's country). The brief says the check happens at sign-up or first run on every surface; the web sign-up page I opened records only terms. (apps/mobile/src/features/auth/services/ageGate.ts:17-40 and :120-140; apps/web/app/signup/complete/RecordTermsAcceptance.tsx:84-106)
- Brief item S78.01 cites a web line that is an auth-token helper in WebSettingsModal, not a feature check. (apps/web/features/settings/components/WebSettingsModal.tsx:195-230)

## Not established

- Coverage: I opened about 40 of the roughly 190 code locations the brief lists. The composer, media, CLI, VS Code, usage, workspace policy, role, connector, and code-session files were not read in detail, so their behaviour is taken from the brief's statuses and not confirmed.
- Whether the web, CLI and VS Code gating read the shared evaluator, and whether the server feature_flags are built from policy (the /api/me handler was not opened).
- Exact behaviour of the attachment-preservation choice (S78.25), the connector checklist (apps/web/app/plugins/[id]/ConnectorChecklist.tsx), and the workspace role checks (apps/web/app/api/settings/team/route.ts).
- Storage of the CLI tier cache and of the usage summary; the tables for terms acceptance and training opt-out.
- The brief's VS Code and Chrome 'missing' rows for attachment types and the mobile 'missing' rows for connector detection were not checked against the code; I did not search for a later implementation.
- Processing-path choice on Chrome, which the brief lists as not present for that row; not verified.
- S78.27 (effective-capability inspector) is marked not applicable in the brief; I did not search for one.
- No tests, builds, servers or edits were run, as required. Nothing was tested on localhost in this pass, because this was a read-only code reading.
- Some line numbers in the brief were not reproduced exactly; I cite ranges that contain the behaviour I read.

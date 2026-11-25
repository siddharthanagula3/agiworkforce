---
id: "F078-08"
type: "feature"
title: "Live refresh after a change"
aliases: ["Live updates after a plan, policy, connection, or device change", "S78.28", "Live refresh after a change", "Capability refresh (mobile)", "Tier revalidation (VS Code)", "Tier cache (CLI)", "Billing query refresh (web)", "Account refresh while open (Chrome)"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "api:GET /api/me", "api:GET /api/usage", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-08 Live refresh after a change

After a plan, switch-off or sign-in change, gated controls should update without a restart. Each app refreshes from the account service by its own rule: mobile on resume and Cloud entry, VS Code and CLI on a five-minute cache, Chrome every three minutes while in use, web on specific events. Mobile, VS Code and web keep the last answer on error; CLI and Chrome differ.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.28](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Re-reads the person's plan and the server's list of allowed capabilities, and re-applies it to controls such as voice, file upload, connectors, models and dictation. Web reads /api/me into a billing store; mobile reads /api/me?surface=mobile on resume and on entering Cloud; VS Code marks the cached tier stale on a refused call and re-reads on the next use; the CLI re-reads when its on-disk cache is older than five minutes; Chrome re-reads the capability document every three minutes while the panel is active. (apps/web/shared/stores/web-auth-store.ts; apps/mobile/src/lib/capabilities.tsx; apps/extension-vscode/src/integrations/tierResolver.ts; apps/cli/src/tier_cache.rs; apps/extension/src/side_panel.ts:16157-16203)

**Why it exists.** A person who upgrades, or an operator who switches a feature off for safety, should see the change without reinstalling or restarting, and a network error must not disable a working feature. The brief requires that a server switch-off takes effect on the next refresh with no store release (brief S78.28).

**Who uses it.** Every signed-in user of a managed plan; operators who throw a capability switch; testers checking upgrade and downgrade flows.

**Problems it solves**

- A person pays for a plan and the app still shows locked controls.
- A faulty feature is paused by the operator but stays visible in an installed app until the next store release.
- A short outage makes the app hide features the person has paid for.
- A cached plan outlives a downgrade or a sign-out.

**Use cases**

- Upgrade on the web: the pending-checkout component polls the billing store until the plan shows active, then moves to the confirmation page.
- Operator pauses dictation: the web billing store receives it in disabled features on its next read and the microphone button is disabled with the reason text.
- Mobile app is in the background while a capability is switched off; on return to the foreground the switch is applied.
- VS Code: the token is rejected with 401 or a quota refusal; the cached tier is marked stale and the next use re-reads it.

## 2. User experience

**Where to find it**

- Web: no screen of its own; effects are seen on the chat composer (dictation, image and video menu items), upgrade pages and Settings, Billing. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx; apps/web/features/settings/sections/BillingSection.tsx:660)
- Desktop: same as web inside the Electron window, because the public Desktop shows the hosted web app (doc: AGENTS.md section 5).
- Mobile: no screen of its own; capability-gated controls and Settings, Billing and Capabilities pages refresh. A 'capability.unavailable' view reads 'It's paused while we fix an issue and will come back without an update.' (apps/mobile/src/lib/capabilities.tsx)
- CLI: model picker, voice, skills and plugin commands react to the cached document; no screen. (apps/cli/src/tier_cache.rs capability_refusal)
- VS Code: model picker locks, paywall and settings webview tier pill. (apps/extension-vscode/src/features/model-picker/modelConstants.ts)
- Chrome: side-panel attach menu items and microphone button show or hide. (apps/extension/src/side_panel.ts:15241-15258)

**Before you start**

- A signed-in managed account. Mobile refreshes only in Cloud mode, with Cloud unlocked and an account captured. (apps/mobile/src/lib/capabilities.tsx canRefreshRemoteCapabilities; apps/mobile/src/features/billing/store.ts:73-75)
- CLI needs a login token (environment variable or stored by login) and an allowed API host. (apps/cli/src/tier_cache.rs:60-110)
- Chrome needs a signed-in token; a signed-out panel clears the document. (apps/extension/src/side_panel.ts:13299-13306)

**Screens and controls**

- Web billing refresh buttons in Settings, Billing that call refreshUser. (apps/web/features/settings/sections/BillingSection.tsx:660, 687)
- Web composer notices 'Checking your plan…' and "Couldn't verify your plan. Retrying…". (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2583-2589)
- Mobile CapabilityUnavailable view with a back button. (apps/mobile/src/lib/capabilities.tsx)
- Chrome: gate state of microphone, file, connectors and skills menu items. (apps/extension/src/side_panel.ts:15241-15258)

**Journey**

1. A change happens on the server (plan, operator switch, workspace policy) or on the device (sign in or out).
2. The app's refresh trigger fires: web (sign-in, upgrade screens, composer retry, Billing refresh, pending-checkout polling), mobile (app start, return to foreground, entering Cloud, billing and connector screens), VS Code (stale mark then next read, and a refresh when the extension is first used), CLI (cache older than five minutes or after a 401 to 403), Chrome (on return and every three minutes while active).
3. The app calls the account endpoint (/api/me) and parses the plan, feature flags, disabled features and capability document.
4. Stores update and gated controls re-render.
5. On failure the app keeps what it had (mobile, VS Code, web) or falls back (CLI uses the config default after expiry; Chrome clears the document if the summary request fails).

**What the person sees and gets**

- Web: plan label changes in Billing; composer notices while the plan is being checked.
- Mobile: unavailable copy distinguishes a plan limit from a pause (denial reason versus temporarily_unavailable). (apps/mobile/src/lib/capabilities.tsx useCapabilityDenialReason)
- CLI: messages such as 'Voice is not available on your plan.' built from the cached denial layer. (apps/cli/src/tier_cache.rs capability_refusal)
- VS Code: model rows lock or unlock with a plan lock reason.

**Settings**

- CLI: environment variables for the API base and the login token (names only: AGIWORKFORCE_API_BASE, AGIWORKFORCE_JWT). (apps/cli/src/tier_cache.rs:60-110)
- Mobile: capability switch names derived as 'capability.<snake_case>' feature flags. (apps/mobile/src/lib/capabilities.tsx:35)
- Web: Voice setting dictationEnabled.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: a billing store reads /api/me and keeps the last user, plan and disabled-feature list when a later read fails with an error other than 401; a 401 clears it. (apps/web/shared/stores/web-auth-store.ts refreshUser)
- Web: upgrade and checkout paths force refreshes; the pending-checkout component polls refreshUser on an interval for a window and on window focus. (apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:25-53)
- Web: the useBillingData query has staleTime 0, refetchOnWindowFocus and no-store fetch; it is used by the pricing and upgrade chooser pages. (apps/web/features/billing/hooks/use-billing-queries.ts:80-110; apps/web/app/pricing/page.tsx:274; apps/web/app/upgrade/UpgradeChooser.tsx)
- Mobile: refresh of the plan and capability document at start, on return to foreground, and on entering Cloud mode; failure is logged and the cached tier is kept. (apps/mobile/app/_layout.tsx:633-665; apps/mobile/src/features/billing/store.ts:71-112)
- Mobile: a separate server-switch store marks capabilities off, refreshes on resume, discards an answer if the account changed, and keeps the last answer on error; a capability the server says nothing about stays as shipped. (apps/mobile/src/lib/capabilities.tsx:55-95)
- Mobile: the effective decision prefers the capability document and otherwise the shipped matrix minus switched-off capabilities. (apps/mobile/src/lib/capabilities.tsx useCapability)
- VS Code: tier cache with a five-minute window; 401, 402 and account-token events mark it stale; unreachable account API keeps the cached tier; concurrent reads collapse into one call; a successful identity read records tier and capability document. (apps/extension-vscode/src/integrations/tierResolver.ts; tierRevalidation.ts; apps/extension-vscode/src/utils/api.ts:350,873,1138)
- VS Code: a refresh is started when the extension is first used. (apps/extension-vscode/src/extension.ts:514-517)
- CLI: on-disk tier and capability cache with a five-minute window, written atomically, owner-checked against the token, cleared on a 401; a lower fetched tier does not replace a higher fresh cached tier. (apps/cli/src/tier_cache.rs:36-44, 290-330, 620-690)
- Chrome: the capability document is re-read on return to the panel (at most once a minute), every three minutes while the user is active and not streaming; gates re-apply after each read. (apps/extension/src/side_panel.ts:16157-16203, 13401-13405)
- Desktop: the permissions list refreshes on window focus and on runtime events permission-changed and computer-use-changed. (apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx)

**Incomplete**

- Web: the /api/me billing store is not refreshed on window focus or on a timer by itself; only listed events trigger it, so an operator switch or a plan change made in another window is picked up on the next trigger. (grep of refreshUser callers in apps/web; web-auth-store.ts)
- Web: no cross-window broadcast of a plan change was found. (no BroadcastChannel use found in apps/web)
- CLI: after the cache expires and the network call fails, the stale file is not read and the caller uses the config default, so the last answer is not kept beyond five minutes. (apps/cli/src/tier_cache.rs read_fresh_envelope; resolve_user_tier_for)
- CLI: a plan change inside the five-minute window is not seen until the cache is invalidated by a 401 to 403 or expires. (apps/cli/src/tier_cache.rs:36, status_invalidates_tier)
- Chrome: if the account summary request fails while managed access succeeds, the capability document is set to null and the gated menu items hide, instead of keeping the last answer. (apps/extension/src/side_panel.ts:13322, 13401; apps/extension/src/features/cloud-bridge/capabilityDocument.ts:57-60, 126-140)
- Mobile: capability switches are not refreshed in Local mode by design; the capability document is fetched only in Cloud mode. (apps/mobile/src/lib/capabilities.tsx:41-47)

**Present but disconnected or switched off**

- Web useBillingData is used only on pricing and upgrade pages, not by the composer; composer controls read the billing store instead. (grep of useBillingData callers)

**Not available**

- Connection and device change refresh: web paired-desktop detection hook and connector status queries were not read for this page; refresh on a connector or device change is unknown. (apps/web/features/desktop-host/hooks/use-paired-desktop.ts not opened)
- Policy (workspace administrator) change refresh on CLI, VS Code and Chrome: not established; the capability document's denied-by layers are read only from the tier cache or /api/me. [inferred]

## 4. Required behaviour

**Established requirements**

- Changes are picked up on the next refresh of the capability document (mobile), the tier revalidation (VS Code) or the billing query (web). (source: S78.28 (task first-draft requirement))
- A failed refresh keeps the last answer, so a working feature is not disabled by a network error. (source: S78.28 (task first-draft requirement))
- A server switch-off takes effect on the next refresh with no store release. (source: S78.28 (task first-draft requirement; mobile capabilities.tsx comment and test 'switches a capability off without a new build'))
- After a plan, policy, connection or device change, gated controls update without reinstalling or restarting. (source: S78.28 (brief))
- Every subscription capability on every app connects to one AGI Subscription system. (source: task product context; doc: AGENTS.md section 7 for cost as a design constraint)

**Acceptance criteria**

1. Web: after a successful upgrade, the plan label and the locked controls update within the polling window without a manual reload.
2. Web: with the network blocked during a refresh, the previous plan and controls remain and an error state is recorded, not cleared.
3. Mobile: switch a capability off on the server, background and foreground the app, and the capability's control is gone or shows the paused text without a new build.
4. Mobile: make the server unreachable and resume; every control keeps its previous state.
5. VS Code: after a 401 or quota refusal, the next tier read calls the account API; with the API unreachable, the model picker keeps the cached tier.
6. CLI: change the plan, wait past five minutes or trigger a 401, restart or continue, and the new tier shows; within five minutes the old tier shows.
7. Chrome: with the panel open and active, a capability change shows in the attach menu within the refresh window, and a failed summary request does not hide a permitted feature (target).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should keep its last known tier after cache expiry when the network fails, to match mobile and VS Code. [inferred from the required 'keeps the last answer' line]
- Chrome should keep the last capability document when the account summary request fails. [inferred]
- Web should refresh the billing store when the window regains focus, so a switch-off or plan change made elsewhere is applied without a trigger. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a focus and interval refresh of the web billing store with the same stale-while-failing rule the mobile store uses.
- [proposed] Make the CLI read a stale cache as a fallback when the network call fails, marked as unverified.
- [proposed] Make Chrome keep the previous document when the summary request fails.
- [proposed] Share one refresh policy (triggers, keep-last, owner check) across apps in a contract.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useBillingStore.refreshUser | `apps/web/shared/stores/web-auth-store.ts` | Web account store: reads /api/me, holds plan, feature flags, disabled features and capability document; keeps last value on non-401 error. |
| hook | useBillingData | `apps/web/features/billing/hooks/use-billing-queries.ts` | Web query for /api/usage with staleTime 0 and refetch on focus; used by pricing and upgrade pages. |
| component | PendingCheckoutConfirmation | `apps/web/features/billing/components/PendingCheckoutConfirmation.tsx` | Polls the billing store after checkout until the plan is active. |
| component | BillingSection refresh buttons | `apps/web/features/settings/sections/BillingSection.tsx` | Manual refresh of plan state. |
| component | ChatComposerNew billing policy retry | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Shows 'Checking your plan…' and retries refreshUser when plan state is unknown. |
| hook | useDictation switch-off effects | `apps/web/features/chat/hooks/use-dictation.ts` | Cancels dictation when the server disables it or the setting turns off. |
| endpoint | GET /api/me | `apps/web/app/api/me/route.ts` | Returns plan, feature flags, disabled features and capability handshake for a requested surface. |
| store | useRemoteCapabilityStore and CapabilityProvider | apps/mobile/src/lib/capabilities.tsx (not found) | Mobile server-driven capability switches with refresh on resume and Cloud entry. |
| store | useTierStore.refreshTier | `apps/mobile/src/features/billing/store.ts` | Mobile plan and capability document store; keeps cached tier on error; Cloud mode only. |
| screen | RootLayout refresh effects | `apps/mobile/app/_layout.tsx` | Calls refreshTier at start, on foreground and on Cloud entry. |
| service | tierResolver | `apps/extension-vscode/src/integrations/tierResolver.ts` | VS Code tier cache, TTL, stale mark, revalidation and capability document storage. |
| event | notifyAccountTierMayHaveChanged | `apps/extension-vscode/src/integrations/tierRevalidation.ts` | One-way signal raised by hosted calls on 401, 402 and account-token changes. |
| service | api utilities raising the signal | `apps/extension-vscode/src/utils/api.ts` | Raises the tier-may-have-changed signal at lines 350, 608, 671, 825, 861, 873, 1138, 1160, 1463. |
| service | extension activation refresh | `apps/extension-vscode/src/extension.ts` | Registers the invalidation watcher and refreshes the tier when first used (lines 513-517). |
| config | model picker plan locks | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | VS Code model rows lock or unlock by cached tier. |
| service | tier_cache | `apps/cli/src/tier_cache.rs` | CLI tier and capability cache file with five-minute window, owner check, invalidation, capability refusal text. |
| command | capability gates in CLI commands | `apps/cli/src/lib.rs` | Calls capability_refusal for marketplace, connectors and related commands (lines 2789, 7379, 7530-7620). |
| service | voice and skills gates | `apps/cli/src/voice.rs` | CLI voice gate reading the cached capability document (line 989); skills.rs line 145 does the same for skills. |
| service | fetchAccountSummary | `apps/extension/src/features/cloud-bridge/capabilityDocument.ts` | Chrome fetch of /api/me?surface=web with no-store caching and capability allow helper. |
| service | refreshCloudAccountUI and gates | `apps/extension/src/side_panel.ts` | Chrome refresh loop (lines 16157-16203) and applyCapabilityGates (line 15241). |
| component | DesktopPermissionsSection refresh | `apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx` | Desktop permissions list refresh on focus and runtime events. |
| test | Capabilities tests | `apps/mobile/src/lib/Capabilities.test.tsx` | Mobile refresh behaviour tests. |
| test | tierRevalidation tests | `apps/extension-vscode/src/__tests__/tierRevalidation.test.ts` | VS Code revalidation tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A trigger fires on the device (app resume, window focus on a polling component, stale mark, cache age over five minutes, three-minute timer). | device | apps/mobile/src/lib/capabilities.tsx; PendingCheckoutConfirmation.tsx:25-53; tierResolver.ts:63-80; tier_cache.rs:36; side_panel.ts:16201 |
| The app sends an authenticated GET to /api/me (mobile adds ?surface=mobile, Chrome ?surface=web). | device and our servers | apps/mobile/src/features/billing/store.ts:81; apps/extension/src/features/cloud-bridge/capabilityDocument.ts:18; apps/cli/src/tier_cache.rs resolve_user_tier_for |
| The server builds the plan, feature flags, disabled features and the layered capability document from the account's entitlement and operator switches. | our servers | apps/web/app/api/me/route.ts:228-343 |
| The app parses the response with the shared parser and stores it; controls re-render from the stored document. | device | apps/web/shared/stores/web-auth-store.ts; apps/mobile/src/features/billing/store.ts:79-101; tierResolver.ts recordAccountIdentityTier |
| On error the app keeps or discards its cache by app: web keeps (non-401), mobile keeps, VS Code keeps while signed in, CLI returns the default after expiry, Chrome sets the document to null. | device | web-auth-store.ts; store.ts:106-111; tierResolver.ts:129-145; tier_cache.rs resolve_user_tier_for; side_panel.ts:13322,13401 |
| The server enforces the same entitlement again on each model route regardless of the client's cached view. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3631 (brief S78.07; not re-read for this page) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web plan, feature flags, disabled features, capability document | in-memory zustand store useBillingStore | no; re-read from /api/me | lost on reload; cleared on 401 or sign-out (web-auth-store.ts signOut and _reset) |
| Mobile tier, capability document, last refresh time | store:tierStore (persisted store; partial persistence seen via 'state.capabilityDocument' at store.ts:163) | read from server only | cleared by clearAccountEntitlements on account change (store.ts:128-140) |
| Mobile switched-off capability map | in-memory store useRemoteCapabilityStore | no | cleared on clear() when the account changes |
| VS Code cached tier, freshness stamp, capability document | VS Code global state keys tierStatus.cachedTier, tierStatus.cachedAtMs, tierStatus.capabilityDocument | no | cleared by clearAccountTierCache on sign-out (tierResolver.ts:122-133) |
| CLI tier, capability document, owner hash, timestamp; plan model list | files cache/tier.toml and plan-models.toml under the CLI config directory | no | removed by invalidate_tier_cache on 401 and on tier change; expires after 300 seconds (tier_cache.rs:36, 420-430) |
| Chrome capability document and account identity | in-memory variables in the side panel | no | set to null when signed out (side_panel.ts:13299) |

**Models and providers.** The capability document includes model-related denial layers (tier, settings, surface, model) read by the CLI refusal text (apps/cli/src/tier_cache.rs capability_refusal). Which models a plan lists is read from the hosted list and cached beside the tier (apps/cli/src/tier_cache.rs plan_models cache). No provider is called during a refresh.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for every refresh of a managed plan. Without an account, mobile and CLI do nothing, VS Code falls back to the byok tier label, Chrome clears the document. (apps/mobile/src/features/billing/store.ts:73-75; apps/extension-vscode/src/integrations/tierResolver.ts:215-221; apps/extension/src/side_panel.ts:13299) |
| Permissions | No device permission. CLI allows only agiworkforce.com hosts over HTTPS or loopback for the token. (apps/cli/src/tier_cache.rs:632-660) |
| Subscription | The refresh is how each app learns the plan; the entitlement itself is owned by the account service. (apps/web/app/api/me/route.ts) |
| Limits and metering | none found in the code for the refresh itself. Fetch timeout in the CLI is 3 seconds. (apps/cli/src/tier_cache.rs:44) |
| Feature flags | Operator switches arrive as disabled features (web) and as feature flags named capability.<snake_case> (mobile). Release rings are refreshed on mobile resume. (apps/mobile/src/lib/capabilities.tsx:35; apps/mobile/app/_layout.tsx:641) |
| Model compatibility | none found in the code for the refresh; the model denial layer is part of the document. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode makes no capability or tier request (refreshTier and the capability refresh both return when the mode is not Cloud), and tests assert no contact with Managed Cloud in Local Mode. CLI treats own-key and local sessions as the byok tier with no server tier. VS Code returns the byok label when no tier is cached. Web and Chrome have no Local mode in the files read. (apps/mobile/src/features/billing/store.ts:73; apps/mobile/src/lib/Capabilities.test.tsx:131; apps/cli/src/tier_cache.rs UserTier::Byok; apps/extension-vscode/src/integrations/tierResolver.ts:221) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web composer says 'Checking your plan…' while the plan is unknown; mobile waits for an active refresh before the first request. | ChatComposerNew.tsx:2583-2593; apps/mobile/src/features/billing/store.ts:195-221 |
| Refresh failure | Web sets an error and keeps data; mobile logs and keeps tier; VS Code keeps the cached tier and keeps the stamp stale so the next read retries; CLI returns the default; Chrome shows an unavailable state and schedules a retry, and the capability document becomes null if the summary alone fails. | web-auth-store.ts; store.ts:109-112; tierResolver.ts:88-110; tier_cache.rs; side_panel.ts:13356-13368, 13322 |
| Retry | Web retries from the composer notice; Chrome schedules an account retry using the server's retry-after value; VS Code retries on the next read. | ChatComposerNew.tsx:2587; side_panel.ts:13366-13367; tierResolver.ts:93-110 |
| Account changed during an in-flight refresh | Mobile discards the answer by checking the account epoch and a generation counter; CLI checks the token owner before writing. | apps/mobile/src/lib/capabilities.tsx:61-70; apps/cli/src/tier_cache.rs:120-160 |
| Concurrent refreshes | Web ignores a second call while one runs; mobile skips when one is refreshing; VS Code collapses into one call. | web-auth-store.ts refreshInFlight; store.ts:72; tierResolver.ts:95-97 |
| Offline | All apps keep the screens shown; refresh is retried at the next trigger. | files above [inferred] |
| Downgrade or lower tier from the server | CLI keeps a higher fresh cached tier over a lower fetched one; VS Code and mobile adopt the server value. | apps/cli/src/tier_cache.rs:560-575 |
| Sign-out | Web resets the store; mobile clears entitlements; VS Code clears the cache; Chrome nulls the document; CLI cache is owner-checked and does not apply to another token. | web-auth-store.ts; store.ts:128; tierResolver.ts:122; side_panel.ts:13299; tier_cache.rs |
| Accessibility | not handled in the code as a distinct feature (no announcements for a gate change were found in the files read). | none found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/lib/Capabilities.test.tsx`: Switch name, shipped matrix kept, switch off without build, never enables unsupported, refresh on resume, no change when unreachable, no contact in Local mode, refresh on Cloud entry, discard after account change.
- `apps/mobile/__tests__/CapabilityKillSwitchConsumers.test.tsx`: Mobile consumers of the capability switches (file exists; cases not read).
- `apps/mobile/__tests__/CapabilityAdapter.test.tsx`: Mobile capability adapter (file exists; cases not read).
- `apps/extension-vscode/src/__tests__/tierRevalidation.test.ts`: Five-minute window, keep last tier when unreachable, one call for concurrent reads, stale mark on 401 or quota, identity read recording, re-gating the picker on downgrade.
- `apps/web/app/billing/UpgradeWelcome.test.tsx`: Billing welcome refresh after upgrade (file exists; cases not read).
- `apps/web/app/upgrade/UpgradeChooser.test.tsx`: Upgrade chooser reading billing data (file exists; cases not read).
- `apps/cli/src/tier_cache.rs`: Inline Rust test modules at lines 972 and 1376 (plan conformance and cache tests); individual cases not read.
- `apps/extension/__tests__/options-account-state.test.ts`: Chrome account state in options (file exists; cases not read).
- `apps/extension/__tests__/side-panel-account-clients.test.ts`: Chrome side-panel account clients (file exists; cases not read).

**Test scenarios**

- **Web upgrade is picked up**
  1. On web as a Free user, start an upgrade to a paid plan and complete checkout.
  2. Return to the app and wait on the pending-confirmation page.
  - Expected: The plan shows as active within the polling window and the page moves to the confirmation page without a reload.
- **Operator switch on mobile**
  1. Sign in on mobile in Cloud mode and open a screen that uses a capability.
  2. Switch the capability off on the server.
  3. Send the app to the background and bring it back.
  - Expected: The control disappears or shows the paused text without a new build; the capability returns after the switch is reversed and the app resumes again.
- **Mobile network error**
  1. With a capability switched off, turn on airplane mode.
  2. Resume the app.
  - Expected: Controls keep their previous state; a console warning 'refresh failed (keeping the last answer)' is logged.
- **CLI cache window**
  1. Log in on the CLI and run a command that reads the tier.
  2. Change the plan on the server.
  3. Run the command within five minutes and again after five minutes.
  - Expected: Inside the window the old tier shows; after it the new tier shows. With the network off after expiry the default tier is used (current behaviour).
- **VS Code downgrade**
  1. Open the model picker as a paid user.
  2. Downgrade the account on the server and trigger a refused hosted call.
  3. Open the model picker again.
  - Expected: The picker locks the models the new plan does not admit.
- **Chrome summary failure**
  1. In Chrome, with the microphone control visible, block /api/me but keep the chat route reachable.
  2. Wait for the three-minute refresh.
  - Expected: Current behaviour per code: the document becomes null and gated items hide. Required behaviour: they stay. Record what is seen.

**Where to look when it fails**

- Mobile console: '[capabilities] refresh failed (keeping the last answer)' and '[tierStore] refreshTier failed (keeping cached tier)'.
- Web: logger lines '[BillingQuery] /api/usage returned <status>'; store error text '/api/me returned <status>'.
- CLI: debug line '[tier_cache] tier fetch failed' and the file cache/tier.toml in the CLI config directory.
- VS Code: global state keys tierStatus.cachedTier and tierStatus.cachedAtMs; error code ACCOUNT_AUTH_REQUIRED.
- Chrome: state messages spGateVerifyFailed and retry action; account endpoint response.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Web does not refresh the account store on focus or on a timer; only listed events trigger it.** Affects: Web and Desktop; a plan or operator switch made elsewhere reaches the open window late.. Evidence: apps/web/shared/stores/web-auth-store.ts (no focus or interval); refreshUser callers listed in apps/web (UpgradeWelcome, Billing, composer retry, preferences-client).. Work needed: Add a refresh on focus and a bounded interval with keep-last-on-error, and confirm it with a test.
- **CLI drops to the default after cache expiry when the network fails; it does not keep the last answer.** Affects: CLI users offline or during an outage.. Evidence: apps/cli/src/tier_cache.rs read_fresh_envelope requires a fresh timestamp; resolve_user_tier_for returns an empty result on fetch error.. Work needed: Read an expired cache as a fallback on fetch failure and mark it.
- **Chrome sets the capability document to null when only the account summary request fails, hiding permitted controls.** Affects: Chrome users during a partial outage.. Evidence: apps/extension/src/side_panel.ts:13322, 13401; capabilityDocument.ts:57-60; capabilityAllowed returns false for a null document.. Work needed: Keep the previous document when the summary fails.
- **Refresh on a connection change (connector connect or disconnect) and a device change (paired desktop) is not established for web, CLI, VS Code or Chrome.** Affects: All apps for connector and device gates.. Evidence: mobile connector screen calls refreshTier (apps/mobile/src/features/settings/cloud-connectors/index.tsx:529); equivalents elsewhere not read.. Work needed: Read use-paired-desktop.ts and the connector hooks and test the update without a restart.
- **The brief points to ChatComposerNew.tsx:879 and the web billing query as the refresh path; the composer path found is the billing store, and the billing query is used only by pricing and upgrade pages.** Affects: Documentation accuracy for web.. Evidence: apps/web/features/billing/hooks/use-billing-queries.ts callers; ChatComposerNew.tsx:1055.. Work needed: Correct the brief's evidence line.
- **No test was found that asserts web keeps the last plan after a failed refresh.** Affects: Web.. Evidence: apps/web test listing for useBillingStore (UpgradeChooser, UpgradeOrderScreen, pricing page, UpgradeWelcome tests only).. Work needed: Add a store test for failed refresh.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- mode:own-key
- api:GET /api/me
- api:GET /api/usage
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-observability-and-operations

## Unknown

- How web and Desktop react to a connector or paired-desktop change; use-paired-desktop.ts and the connector hooks were not opened.
- Whether Desktop runs any refresh of its own besides the hosted web app's.
- Whether workspace policy changes reach CLI, VS Code and Chrome before their caches expire.
- Where the mobile tier store persists (storage engine and keys); only the partialize fields were seen.
- Whether the VS Code webview re-renders live on a tier change or only on the next open.
- Cases inside CapabilityKillSwitchConsumers, CapabilityAdapter, the CLI inline tests and the web billing tests were not read.
- Whether any test has been run: no file in the repository was found that records a result.

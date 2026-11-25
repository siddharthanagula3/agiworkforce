---
id: "F005-10"
type: "feature"
title: "Profile, help and upgrade menus"
aliases: ["Account menu", "Profile menu", "User menu", "Help menu / Get help", "Upgrade entry", "Upgrade button", "Paywall bottom sheet", "Billing waitlist"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (2 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.29", "S5.30", "S5.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "table:beta_redemptions", "file:apps/web/lib/server/billing-waitlist-access.ts", "F005-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-10 Profile, help and upgrade menus

The Account menu in the Web and Desktop sidebar shows the signed-in email and offers Workspace, Settings, Get help (help, email support, feedback, shortcuts), Upgrade, Learn more and Log out. Upgrade shows only if a higher plan exists, and paid checkout is held behind a billing waitlist unless opened. Mobile uses a Profile page and an About page.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.29](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s529), [S5.30](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s530), [S5.31](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s531).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (2 of 3) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not stated on this page | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gathers who-am-I, account actions, help and the way to a higher plan into one menu.

**Why it exists.** People need a predictable place for settings, support, legal links, sign-out and upgrading (S5.29, S5.30, S5.31).

**Who uses it.** Signed-in people on every app; free people who may upgrade.

**Problems it solves**

- Finding help, support and feedback.
- Reaching legal and data-rights links after sign in.
- Starting an upgrade.

**Use cases**

- Open Account menu > Get help > Send feedback.
- Open Account menu > Upgrade to see plans, then join the waitlist or pay.
- On a phone, open Profile and tap Log Out.
- Open Learn more > Terms and policies.

## 2. User experience

**Where to find it**

- Web and Desktop: account button in the sidebar footer, and a compact trigger in the collapsed rail (apps/web/shared/components/layout/WebAppShell.tsx:507-557; AccountMenuItems.tsx).
- Mobile: Profile page (apps/mobile/app/(app)/profile/index.tsx) with rows Chats, Messages, Personalization, Memory, Safety & Security, Data Controls, Subscription, Log Out; About page with Support rows 'Help Center' and 'Service Status' (apps/mobile/app/(app)/about.tsx:257-278).
- CLI, VS Code, Chrome: brief says done; VS Code help menu has Documentation, Help center, Keyboard shortcuts, Service status, What’s new, Send feedback (apps/extension-vscode/src/features/help/helpMenu.ts:19-40); VS Code and Chrome show an 'Upgrade' button in the usage banner (extension-vscode webviewContent.ts:3150; Chrome upgrade labels side_panel.ts:736-748). CLI details not opened.

**Before you start**

- Signed in.
- Upgrade: a plan with a higher tier available (hasSelfServeUpgradePath, packages/contracts/types/src/billing-catalog.ts:137-139).

**Screens and controls**

- Menu order: email label, 'Workspace' submenu, 'Settings', 'Get help' submenu ('Get help', 'Email support', 'Send feedback', 'Keyboard shortcuts'), 'Upgrade' (when shown), 'Learn more' submenu (Data use, Data rights, Terms and policies via translation keys navDataUse, navDataRights, navTermsPolicies), 'Log out' (AccountMenuItems.tsx:57-150; labels from packages/ui/i18n/locales/en/common.json:16,89-113).
- Upgrade opens a plan dialog, then either checkout, a confirm dialog for mid-cycle upgrades, or a waitlist dialog (apps/web/features/billing/hooks/useUpgradePlanFlow.ts:60-120).
- Mobile paywall bottom sheet (apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx, not opened).

**Journey**

1. 1. Click the account button.
2. 2. Choose an entry.
3. 3. For Upgrade: pick a plan; if you have an active paid plan, confirm the prorated charge; otherwise start checkout, or join the waitlist or enter an access code.
4. 4. For Log out: signed out and sent to /login.

**What the person sees and gets**

- Toast 'Redirecting to checkout...' during checkout start.
- Waitlist message: 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' (apps/web/lib/server/billing-waitlist-access.ts:9-10).
- Toast 'Please sign in to upgrade.' if no user.

**Settings**

- Settings opens the Settings dialog at the General tab; Workspace opens the Team tab (WebAppShell.tsx:511-512).
- Server settings: AGI_BILLING_WAITLIST_OPEN (name only) and a run-time flag read by readBillingUpgradesOpen.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- One shared AccountMenuItems used by the shell and chat page (AccountMenuItems.tsx:35-41).
- Upgrade item appears only when showUpgrade is true (AccountMenuItems.tsx:118-124).
- Upgrade flow supports mid-cycle confirm and waitlist (useUpgradePlanFlow.ts:90-120).
- Server gate: forced open by env, by run-time flag, or by a row in beta_redemptions (billing-waitlist-access.ts:28-53).
- Help opens the help page for the current path (WebAppShell.tsx:514).

**Incomplete**

- Upgrade is held by owner decision on Web, Desktop, Mobile, VS Code and Chrome (doc: brief S5.31 Unfinished note: owner-held billing waitlist; AGI_BILLING_WAITLIST_OPEN stays unset until the owner opens upgrades).

**Present but disconnected or switched off**

- Mobile: FEATURES.billing is false (apps/mobile/lib/v1FeatureFlags.ts:6).

**Not available**

- Mobile has no in-menu Upgrade row found in the profile page lines searched; it has a 'Subscription' row (profile/index.tsx:221).

## 4. Required behaviour

**Established requirements**

- A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.29)
- A help menu gathers help centre, support contact, feedback and shortcuts in one place. (source: S5.30 Should (same brief))
- A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow. (source: S5.31 Should (same brief))
- Paid upgrades stay behind the billing waitlist until the owner opens them. (source: S5.31 Unfinished note (same brief); code billing-waitlist-access.ts:28-53)

**Acceptance criteria**

1. Menu shows the email of the signed-in person.
2. Get help submenu has four entries.
3. Upgrade is hidden on the top plan and shown below it.
4. With the waitlist closed and no access code, the person sees the waitlist message, not checkout.
5. With a redeemed access code, checkout starts.
6. Log out ends the session and shows /login.
7. Legal links open in a new tab.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mobile Upgrade path is intentionally off while FEATURES.billing is false [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the waitlist state visible in the menu entry label so a person sees why Upgrade leads to a waitlist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | The one account menu |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Builds menu props and renders footer |
| hook | useUpgradePlanFlow | apps/web/features/billing/hooks/useUpgradePlanFlow.ts (not found) (not found) | Upgrade dialogs, checkout, waitlist |
| component | UpgradeWaitlistDialog | `apps/web/features/billing/components/UpgradeWaitlistDialog.tsx` | Waitlist or access code dialog (imported by hook) |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | Gate: env, flag, access code |
| service | billing-upgrade-gate | `apps/web/lib/feature-flags/billing-upgrade-gate.ts` | readBillingUpgradesOpen run-time flag (imported) |
| config | AGI_BILLING_WAITLIST_OPEN | `apps/web/lib/server/billing-waitlist-access.ts` | Environment switch that forces upgrades open |
| table | beta_redemptions | `apps/web/lib/server/billing-waitlist-access.ts` | Records redeemed access codes |
| other | hasSelfServeUpgradePath | `packages/contracts/types/src/billing-catalog.ts` | Decides if Upgrade shows |
| other | menu labels | `packages/ui/i18n/locales/en/common.json` | English menu text |
| screen | Profile | `apps/mobile/app/(app)/profile/index.tsx` | Mobile profile and Log Out |
| screen | About | `apps/mobile/app/(app)/about.tsx` | Mobile help and legal links |
| component | PaywallBottomSheet | `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` | Mobile paywall (not opened) |
| config | FEATURES | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile feature flags, billing false |
| component | showHelpMenu | `apps/extension-vscode/src/features/help/helpMenu.ts` | VS Code help menu |
| component | upgrade-btn | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code Upgrade button in the usage banner |
| test | header upgrade pill test | `apps/web/features/chat/pages/__tests__/WebChatPage.header-upgrade-pill.test.tsx` | Upgrade pill |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Shell reads subscription tier from the billing store and decides showUpgrade | device | WebAppShell.tsx:491, 517 |
| Upgrade opens the plan dialog; a free or non-Stripe case follows waitlist or settings path | device | useUpgradePlanFlow.ts:90-120 |
| Checkout or waitlist call goes to our servers; server checks the gate (env, flag, beta_redemptions) | our servers | billing-waitlist-access.ts:38-53 |
| Stripe checkout is an outside service | outside service | useUpgradePlanFlow.ts:60-80 calls upgradeToBasicPlan etc.; payment page itself not traced |
| Log out clears session and redirects to /login | device and our servers | WebAppShell.tsx:526-529 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Access code redemption | table beta_redemptions | server only | unknown |
| Subscription record | server subscription tables; read through /api/me per a code comment | yes | unknown |

**Models and providers.** No model takes part. The menu does not call a provider. Plan tier controls which models a person may use elsewhere, handled by SYS-subscriptions-entitlements-and-usage.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in required; the email label shows when known. |
| Permissions | Workspace submenu and Team settings depend on workspace role (WorkspaceMenuItems, not read). |
| Subscription | Upgrade shows if a next tier exists; checkout needs waitlist access unless opened (billing-waitlist-access.ts:28-53). |
| Limits and metering | none found in this menu |
| Feature flags | AGI_BILLING_WAITLIST_OPEN env value 1; run-time flag via readBillingUpgradesOpen; mobile FEATURES.billing false. |
| Model compatibility | not applicable |
| Provider restrictions | not applicable |
| Local mode | Menu, help and log out run on the device. Upgrade needs our servers and a signed-in account. Local inference is not tied to payment; whether a Local-only person without sign in can reach this menu was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Footer shows a loading state while auth or billing initialise | WebAppShell.tsx:497-498, 541 |
| billing policy not ready | No 'free' fallback so a payer is not sold an upgrade; 'Billing details are still loading' toast on mid-cycle | WebAppShell.tsx:487-490; useUpgradePlanFlow.ts:97-100 |
| not signed in at upgrade | Toast 'Please sign in to upgrade.' | useUpgradePlanFlow.ts:86-89 |
| waitlist closed | 403 with waitlist message | billing-waitlist-access.ts:56-65 |
| top plan | Upgrade hidden | AccountMenuItems.tsx:118 |
| mobile log out | Confirm alert 'Log out of AGI Cloud on this device?' | profile/index.tsx:118 |
| accessibility | Standard dropdown semantics; not audited further | AccountMenuItems.tsx uses DropdownMenu components from @agiworkforce/ui; no custom aria handling found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/__tests__/account-menu-shortcut-hint.test.ts`: Shortcut hint in the menu
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Shell
- `apps/web/shared/components/layout/__tests__/EmbeddedAccountView.test.tsx`: Account view
- `apps/web/features/chat/pages/__tests__/WebChatPage.header-upgrade-pill.test.tsx`: Upgrade pill in chat
- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: Upgrade path logic

**Test scenarios**

- **Menu contents**
  1. Sign in on Web
  2. Open the account button
  - Expected: Email, Workspace, Settings, Get help, Upgrade (if below top plan), Learn more, Log out
- **Waitlist held**
  1. Free account without access code
  2. Choose Upgrade, pick a plan
  - Expected: Waitlist or access-code dialog, no checkout
- **Access code**
  1. Redeem a code
  2. Choose Upgrade
  - Expected: Checkout starts
- **Top plan**
  1. Sign in with top plan
  - Expected: No Upgrade entry
- **Mobile profile**
  1. Open Profile
  2. Tap Log Out
  - Expected: Confirm alert, then signed out

**Where to look when it fails**

- 403 response with the waitlist code from the checkout route.
- Row in beta_redemptions for the user.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Paid upgrade held by owner decision** Affects: Web, Desktop, Mobile, VS Code, Chrome. Evidence: brief S5.31 Unfinished; billing-waitlist-access.ts:28-53; v1FeatureFlags.ts:6. Work needed: Owner opens upgrades (set env or run-time flag)
- **Mobile Upgrade entry not confirmed in the profile page** Affects: Mobile. Evidence: profile/index.tsx rows read. Work needed: Trace PaywallBottomSheet entry points
- **CLI Upgrade done per brief but not opened here** Affects: CLI. Evidence: brief cites claude_parity.rs:685, which prints model data in the lines read. Work needed: Re-verify

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- table:beta_redemptions
- file:apps/web/lib/server/billing-waitlist-access.ts
- F005-08

## Unknown

- Mobile Upgrade entry points beyond PaywallBottomSheet.
- CLI Upgrade command behaviour.
- Chrome Upgrade flow details.
- Desktop differences from Web (desktop shows hosted web app per AGENTS.md; no separate menu opened).
- Retention of beta_redemptions rows.
- Whether the run-time flag name and defaults were read (billing-upgrade-gate.ts not opened).

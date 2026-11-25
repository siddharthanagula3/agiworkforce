---
id: "GAPS-AREA-003"
type: "gap-list"
title: "Gaps: Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 3. Authentication and onboarding screens

102 open gaps that touch this area. Area page: [20-features/003-authentication-and-onboarding-screens](../../20-features/003-authentication-and-onboarding-screens/README.md).

## CMP-CP5

**Free plan can use the CLI**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md), [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Cloud in the CLI needs Pro or higher, so Free and Basic cannot use it: like Claude, unlike Codex which lets Free and Go… Cloud in the CLI needs Pro or higher, so Free and Basic cannot use it: like Claude, unlike Codex which lets Free and Go in lightly.
- Evidence: apps/cli/src/plans.rs:104-125 (developer_surfaces uses PRO_TIERS)

## CMP-M2

**Verify age with a selfie or ID to restore an account or lift teen limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Age check uses only the phone store age signal; the Age setting just shows the value, with no selfie or ID route.
- Evidence: apps/mobile/src/features/age-assurance/ageAssurance.ts:1; app/(app)/settings/age.tsx

## CMP-M5

**Push approval of a login in the signed-in app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md), [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: No push-to-approve login; two-step sign-in uses codes only.
- Evidence: searched: approve login, login approval, push approve in app, src, services

## CMP-M7

**Sign in with a passkey**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: The sign-in screen has no passkey option. Passkeys can only be listed and removed under Security and login.
- Evidence: searched: passkeySignInEnabled in apps/mobile/src, app (defined only in packages/client/client-runtime/src/authProviders.ts:34, never imported); apps/mobile/src/features/auth/components/MobileSignIn.tsx:46

## CMP-M8

**Text message sign-in code**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Two-step sign-in supports only an authenticator app (with backup codes); no text message, push or WhatsApp code.
- Evidence: apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:250

## CMP-MP1

**Sign-in methods offered**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Microsoft is not in the list the builds set Sign-in offers Google, GitHub, Apple (iPhone only), and email with a code or a password. Microsoft is not in the list the builds set.
- Evidence: apps/mobile/eas.json:85; apps/mobile/eas.json:106; apps/mobile/src/features/auth/services/loginProviders.ts:21; apps/mobile/src/features/auth/components/MobileSignIn.tsx:46

## CMP-MP4

**Security keys and passkeys**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: Security and login lists passkeys and security keys and can remove them; adding one opens the web Security and login lists passkeys and security keys and can remove them; adding one opens the web.
- Evidence: apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:264; apps/mobile/src/features/settings/account-security/index.tsx:638

## CMP-MP5

**Sign in with an emailed secure link**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md), [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md), [F003-03](../../20-features/003-authentication-and-onboarding-screens/F003-03-email-sign-in-by-magic-link.md)
- Detail: Sign-in sends a one-time code to type in the app, not a link Sign-in sends a one-time code to type in the app, not a link.
- Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:210,240

## CMP-V1

**Company sign-in: identity provider, workspace restriction, automation tokens**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: The extension and CLI have no company identity provider sign-in, no workspace-only restriction and no member-created automation tokens.
- Evidence: searched: saml, sso, identity provider, allowed_workspace in apps/extension-vscode/src, apps/cli/src/

## CMP-W13

**Two-step sign-in by push approval**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: No push-approval second factor.
- Evidence: searched: push approval, mfa push, WhatsApp in apps/web/features/settings, apps/web/features/auth

## CMP-W14

**Two-step sign-in by text message or WhatsApp**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Security pane says SMS two-step is not available; authenticator app and backup codes only.
- Evidence: apps/web/features/settings/sections/SecuritySection.tsx:303

## CMP-W15

**Use without signing in**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Detail: Guest chat code exists at /chat (daily message limit) but sits behind the guest.chat flag, which no code enables by default; live value not checked.
- Evidence: apps/web/app/chat/layout.tsx:40-53; apps/web/lib/guest-chat/guest-chat-access.ts:14-34; apps/web/lib/guest-chat/config.ts:3,19

## CMP-W5

**Verify age with a selfie or government ID to restore access**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Age proof is declared age, an on-device check or a platform signal only; no selfie or ID vendor flow.
- Evidence: packages/contracts/cloud-contracts/src/adult-eligibility.ts:11-23; searched: persona, yoti, selfie in apps/web

## CMP-W9

**Report a compromised account and have sessions ended**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Detail: An account-compromise API exists but no screen calls it (dead code).
- Evidence: apps/web/app/api/settings/security/compromise/route.ts:1; searched: compromise in features, shared, unified-chat

## CMP-WP11

**Same-email accounts merge; sign-in methods listed and linkable**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md), [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md), [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Automatic merge on a matching email was not verified Sign-in methods panel lists connected accounts and links more; automatic merge on a matching email was not verified.
- Evidence: apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:25-31; searched: merge, identities in apps/web/features/settings

## CMP-WP12

**Sign in with a passkey on the login screen**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Production setting not visible Passkey sign-in appears on the login screen only when AGI_AUTH_PROVIDERS includes passkey; production setting not visible.
- Evidence: apps/web/features/auth/authProviderConfig.ts:15; packages/client/client-runtime/src/authProviders.ts:35-40

## CMP-WP13

**Sign in with Microsoft**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Shown only when AGI_AUTH_PROVIDERS lists it Supported in code but shown only when AGI_AUTH_PROVIDERS lists it; default is Google and GitHub. Production setting not visible.
- Evidence: packages/client/client-runtime/src/authProviders.ts:1,19; apps/web/features/auth/authProviderConfig.ts:7

## CMP-WP4

**Sign in with Apple**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Shown only when AGI_AUTH_PROVIDERS lists it Supported in code but shown only when AGI_AUTH_PROVIDERS lists it; the default list is Google and GitHub. Production setting not visible.
- Evidence: packages/client/client-runtime/src/authProviders.ts:1,18; apps/web/features/auth/authProviderConfig.ts:7

## CMP-WP8

**Account suspension appeal and data export**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Detail: Data export is not shown as reachable for suspended accounts A suspension appeal page and ticket thread exist; data export is not shown as reachable for suspended accounts.
- Evidence: apps/web/features/auth/SuspensionAppeal.tsx:1; apps/web/app/appeal/page.tsx; apps/web/app/api/user/export/route.ts

## GAP-AREA003-LW03

**The age-gate region rule uses the device time zone, not a verified country or birth date. A traveller or a device with a different time zone gets the wrong threshold.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-003
- Detail: Area 3. Authentication and onboarding screens
- Evidence: apps/mobile/src/features/auth/services/ageGate.ts (detectRegionRule and TIMEZONE_TO_REGION)

## GAP-AREA003-LW05

**Magic-link confirmation (S3.05) has no code in any app; the email factor is a typed code only.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-003
- Detail: Area 3. Authentication and onboarding screens
- Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx (SECOND_FACTOR_KINDS, sendSignInEmailCode)

## GAP-CAP-account-and-sign-in-01

**Passwordless email sign-in: No emailed secure link with cross-device code (S3.05 missing on all six apps). Mobile code step is unverified in the ledger (S3.03, S3.04).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md), [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md), [F003-03](../../20-features/003-authentication-and-onboarding-screens/F003-03-email-sign-in-by-magic-link.md)
- Requirement items: S3.01, S3.03, S3.04, S3.05
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-account-and-sign-in-02

**Email and password sign-in, reset and add password: Mobile reset is unverified in the ledger. Review accounts need password sign-in (owner memory, 2026-11-20); not re-checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-04](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md), [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Requirement items: S3.06, S3.07, S86.02
- Detail: Claude no, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-03

**Social sign-in (Google, Apple, Microsoft, GitHub): Apple (web) and Microsoft not on by default; Microsoft absent on mobile; Android has no Apple. Regional logins such as Kakao (W8) missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Requirement items: S3.08
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-05

**Passkeys for sign-in and as a second step: Mobile passkey sign-in and in-app enrollment missing (S86.03 mobile missing). Production setting for web sign-in not visible.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Requirement items: S3.11, S3.12, S86.03
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-06

**Two-step verification (authenticator, SMS, push) and backup codes: SMS, WhatsApp and push factors missing. The 2026-09-28 decision says authenticator controls may show Temporarily unavailable until the vendor plan is bought; current state in production not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Requirement items: S3.13, S3.14, S3.15, S86.04, S86.05
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-14

**Enterprise single sign-on, domain verification and directory sync: Mobile unverified. Docs wire-or-cut.md line 47 defers first-party SSO runtime as a Phase 3 enterprise decision, while the comparison reads it as built; one of them is stale and was not reconciled.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Requirement items: S3.09, S3.10
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-16

**Age requirement and server-held age decision: Ledger S3.20 is out of date or wrong. Under-18 behavior on web was not tried by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Requirement items: S3.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-17

**Age verification by selfie or ID, and teen experience: A wrongly blocked adult has no appeal path by age proof.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Requirement items: S3.20
- Detail: Claude yes, ChatGPT yes; AGI not built

## GAP-CAP-account-and-sign-in-20

**Change email, name and profile: No username (W16).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Requirement items: S3.21
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-21

**Account recovery, compromised account and bans: Compromise route is dead code; data export not reachable when suspended.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Requirement items: S3.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-22

**Use without an account: Desktop local chat without sign-in marked missing in ledger S3.37; web guest chat off. Owner has not decided on web guest chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Requirement items: S3.37
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-23

**Terminal and editor sign-in (browser, device code, headless): Free and Basic accounts cannot use the CLI Cloud (CP5), matching Claude Code and not Codex.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md), [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Requirement items: S3.01, S86.09
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-26

**Linked sign-in methods, security history and device lock: Same-email merge on web unverified (WP11); security notices missing on CLI, VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md), [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md), [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Requirement items: S3.17, S86.01, S86.11
- Detail: Claude unknown, ChatGPT unknown; AGI built

## GAP-F003-01-01

**Web does not tell a person that no account exists for the typed email; it creates a sign-up instead. The required behaviour says the user is told and offered a choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Web, and Desktop, CLI, VS Code, Chrome which use the web page. Work needed: Decide whether the unified flow satisfies S3.18; if not, add a notice or confirmation before sign-up starts.
- Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx:471-495; apps/web/e2e/auth-flow-states.spec.ts:271; copy at apps/web/lib/auth/error-taxonomy.copy.ts:59-63

## GAP-F003-01-02

**Mobile second-factor sign-in is not finished and is unverified live.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Mobile users with an authenticator or backup codes. Work needed: Enable the factors in the identity dashboard and run a live second-factor sign-in check.
- Evidence: Area brief S3.14 Unfinished; apps/mobile/src/features/auth/components/MobileSignIn.tsx:217-231

## GAP-F003-01-03

**Mobile has no passkey sign-in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Mobile. Work needed: Decide scope; add native passkey sign-in if required.
- Evidence: No passkey code in apps/mobile/src/features/auth/components/MobileSignIn.tsx; passkey code only in settings account-security

## GAP-F003-01-04

**Chrome Terms acceptance is partial.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Chrome. Work needed: Not examined in code: unknown.
- Evidence: Area brief S3.19 status

## GAP-F003-01-05

**The account-status lookup is allowed on failure at the completion page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Web and Desktop. Work needed: Confirm the route gate catches every denied account; consider showing a retry instead.
- Evidence: apps/web/lib/auth/account-lifecycle.ts:40-48

## GAP-F003-01-06

**Brief code references for CLI (lib.rs:3936) and VS Code (commandSetup.ts:1035) point at unrelated code now.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Documentation. Work needed: Replace with apps/cli/src/oauth.rs:491 and apps/extension-vscode/src/core/commandSetup.ts:1221.
- Evidence: apps/cli/src/lib.rs:3900-3990 holds artifact commands

## GAP-F003-01-07

**Desktop passkey and signed-out Local use not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Detail: Affects: Desktop. Work needed: Run on a real Desktop build and record the result.
- Evidence: No passkey code under apps/desktop/electron; apps/desktop/electron/main.ts:760-773 shows the sign-in screen when signed out

## GAP-F003-01-PARTLY

**Sign in to your account: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md)
- Requirement items: S3.18

## GAP-F003-02-01

**Mobile email verification is not confirmed by a run; the brief marks it unverified though code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Detail: Affects: Mobile. Work needed: Drive the Mobile sign-up on a device and record the result.
- Evidence: apps/mobile/src/features/auth/components/MobileSignUp.tsx:164-195; area brief S3.03/S3.04

## GAP-F003-02-02

**Unconfirmed-address and unsent-code messages tell people to contact support with no link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Detail: Affects: Web and apps that open the web page. Work needed: Add a link to the recovery or support page.
- Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx:247-269

## GAP-F003-02-03

**The Mobile sign-up screen has no password step and the way Mobile accounts get a password is not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Detail: Affects: Mobile. Work needed: Confirm intended behaviour and document it.
- Evidence: apps/mobile/src/features/auth/components/MobileSignUp.tsx:90-195

## GAP-F003-02-04

**No test file named for Mobile sign-up found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Detail: Affects: Mobile. Work needed: Add tests for verify and resend.
- Evidence: Search of apps/mobile for MobileSignUp tests returned none

## GAP-F003-02-NOTBUILT

**Create an account and confirm your email: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Requirement items: S3.02, S3.03, S3.04
- Detail: CLI: S3.02, S3.03, S3.04; VS Code: S3.02, S3.03, S3.04; Chrome: S3.02, S3.03, S3.04

## GAP-F003-02-PARTLY

**Create an account and confirm your email: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F003-02](../../20-features/003-authentication-and-onboarding-screens/F003-02-create-an-account-and-confirm-your-email.md)
- Requirement items: S3.03, S3.04

## GAP-F003-03-01

**Magic-link sign-in and its confirmation are not built on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-03](../../20-features/003-authentication-and-onboarding-screens/F003-03-email-sign-in-by-magic-link.md)
- Detail: Affects: All six apps. Work needed: Decide whether to build; if yes, add the strategy to the adapter, a confirmation page, and tests.
- Evidence: Area brief S3.05 statuses; search of code found no link strategy

## GAP-F003-03-02

**Link-themed error copy exists with no flow.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-03](../../20-features/003-authentication-and-onboarding-screens/F003-03-email-sign-in-by-magic-link.md)
- Detail: Affects: Web, Mobile. Work needed: Keep for a future flow or relabel for code expiry.
- Evidence: apps/web/lib/auth/error-taxonomy.copy.ts:33-40

## GAP-F003-03-NOTBUILT

**Email sign-in by magic link: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F003-03](../../20-features/003-authentication-and-onboarding-screens/F003-03-email-sign-in-by-magic-link.md)
- Requirement items: S3.05
- Detail: Web: S3.05; Desktop: S3.05; Mobile: S3.05; CLI: S3.05; VS Code: S3.05; Chrome: S3.05

## GAP-F003-04-01

**Mobile has no native reset code step; the vendor view's behaviour is not visible in this repo.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-04](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md)
- Detail: Affects: Mobile. Work needed: Run the Mobile flow and record whether a reset is offered, or build one.
- Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:779; apps/mobile/app/(auth)/login.tsx:384

## GAP-F003-04-02

**Brief marks Mobile reset unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-04](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md)
- Detail: Affects: Mobile. Work needed: Live check.
- Evidence: Area brief S3.06/S3.07

## GAP-F003-04-03

**Reset wording does not tell the person that a reset code was sent (the code step copy is the sign-in copy).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-04](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md)
- Detail: Affects: Web. Work needed: Add reset-specific heading copy.
- Evidence: apps/web/features/auth/AuthCodeStep.tsx:62-67 (copyFor has no reset case)

## GAP-F003-04-PARTLY

**Password reset: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F003-04](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md)
- Requirement items: S3.06, S3.07

## GAP-F003-05-01

**Mobile cannot link or unlink sign-in methods in the app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Affects: Mobile. Work needed: Decide in-app linking or accept the web handoff.
- Evidence: apps/mobile/src/features/settings/account-security/index.tsx:600-640; area brief S3.17

## GAP-F003-05-02

**Mobile social and enterprise sign-in not verified live.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Affects: Mobile. Work needed: Run each provider on iOS and Android builds.
- Evidence: Area brief S3.08-S3.10

## GAP-F003-05-03

**The verified-domain service named in the brief is not what the sign-in screen uses.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Affects: Web, Desktop. Work needed: Open that file and state whether it feeds the identity service.
- Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx:393-395; brief S3.10 lists apps/web/lib/services/organization-verified-domains.ts

## GAP-F003-05-04

**The draft claim that the last-method rule is not in code is out of date: the server rule exists, but no client-side check blocks the button before the call.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Affects: Web. Work needed: Confirm by test and consider disabling the button.
- Evidence: apps/web/app/api/settings/identities/route.ts:99-101

## GAP-F003-05-05

**Microsoft and Apple buttons depend on configuration, so production state is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Detail: Affects: Web. Work needed: Check the deployed AGI_AUTH_PROVIDERS value.
- Evidence: packages/client/client-runtime/src/authProviders.ts:17

## GAP-F003-05-NOTBUILT

**Social and work sign-in: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Requirement items: S3.17
- Detail: Mobile: S3.17

## GAP-F003-05-PARTLY

**Social and work sign-in: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md)
- Requirement items: S3.08, S3.09, S3.10

## GAP-F003-06-01

**Mobile has no native passkey creation or sign-in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Detail: Affects: Mobile. Work needed: Decide scope and build native flows if required.
- Evidence: apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:262-269; no passkey code in MobileSignIn.tsx

## GAP-F003-06-02

**Desktop passkey enrolment and sign-in unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Detail: Affects: Desktop. Work needed: Test on a Desktop build.
- Evidence: No passkey code under apps/desktop/electron; area brief S3.11/S3.12

## GAP-F003-06-03

**Passkey sign-in on Web depends on a deployment switch whose production value is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Detail: Affects: Web. Work needed: Check deployment configuration.
- Evidence: apps/web/features/auth/authProviderConfig.ts:15-17

## GAP-F003-06-04

**No check was found that removing the last passkey leaves another way to sign in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Detail: Affects: Web, Mobile. Work needed: Verify in the identity service or add a rule.
- Evidence: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:302-316 shows only a warning; the identities route covers linked identities only (apps/web/app/api/settings/identities/route.ts:26-31)

## GAP-F003-06-05

**The brief names AuthMethodPicker.tsx:15 for passkey sign-in, but sign-in itself is the button in AuthEmailStep and the adapter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: apps/web/features/auth/AuthEmailStep.tsx:108-129; apps/web/features/auth/IdentityAuthAdapter.tsx:620-626

## GAP-F003-06-PARTLY

**Passkey sign-in and passkey setup: partly built on Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Desktop, Mobile
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md)
- Requirement items: S3.11, S3.12

## GAP-F003-07-01

**Mobile authenticator/backup-code sign-in is not handled by the app's own screens and has not been live-tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: Mobile users with 2FA.. Work needed: Enable the factors in the identity provider dashboard, then run a live second-factor sign-in on a device; decide whether to build native screens.
- Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:223-230; brief S3.14 Unfinished.

## GAP-F003-07-02

**Enrolment depends on a server switch whose production value is unknown; if off, nobody can enrol.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: Web, desktop, mobile.. Work needed: Confirm the switch value per environment and record it in the owning runbook.
- Evidence: apps/web/lib/authenticator-enrollment.ts:5-16.

## GAP-F003-07-03

**CLI, VS Code and Chrome rely on the web page for the second factor; no in-app test shows this working.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: CLI, VS Code, Chrome.. Work needed: Add a device-sign-in test with a 2FA account on each.
- Evidence: No second-factor code in apps/cli/src, apps/extension-vscode/src, apps/extension/src.

## GAP-F003-07-04

**Recovery is manual and the requester cannot see status.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: Locked-out users on every app.. Work needed: Define a service level and add status feedback (proposal).
- Evidence: apps/web/lib/support/tickets/recovery.ts:129-157.

## GAP-F003-07-PARTLY

**Two-step sign-in and recovery codes: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md)
- Requirement items: S3.14
- Detail: Mobile S3.14: Owner: enable Authenticator and Backup codes in the Clerk Dashboard, then a live second-factor sign-in check; code path (MobileSignIn onNativeFallback) unchanged.

## GAP-F003-08-01

**No binding Terms revision exists, so the re-prompt path is unexercised in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Affects: All apps.. Work needed: Set the constants when a material revision is published; test the date flip.
- Evidence: apps/web/lib/server/terms.ts:20-21 (both null).

## GAP-F003-08-02

**Brief says web and desktop have no age check, but the code has one; brief and code disagree.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Affects: Brief accuracy (web, desktop).. Work needed: Correct the brief status after confirming in a running app.
- Evidence: apps/web/app/login/complete/page.tsx:91-104.

## GAP-F003-08-03

**Brief Unfinished note (patch, TERMS_GATE_EXEMPT_SURFACES) no longer matches code: no such symbol found and GET reports the standing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Affects: Mobile, API.. Work needed: Confirm the patch file is gone or applied and remove the note.
- Evidence: apps/web/app/api/terms/accept/route.ts:198-203; search for TERMS_GATE_EXEMPT_SURFACES found nothing in apps/web.

## GAP-F003-08-04

**VS Code stops sign-in on a Terms refusal instead of waiting like the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Affects: VS Code.. Work needed: Decide the desired behaviour and align.
- Evidence: deviceAuthorization.ts:120-127; deviceAuth.ts:253-256.

## GAP-F003-08-05

**Region age rules are inert (all 18).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Detail: Affects: Mobile.. Work needed: None unless a lower regional limit is wanted; then the account minimum must change too.
- Evidence: ageGate.ts:25-26,69-71.

## GAP-F003-08-NOTBUILT

**Terms acceptance and age check: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Requirement items: S3.20
- Detail: Web: S3.20; Desktop: S3.20; CLI: S3.20; VS Code: S3.20; Chrome: S3.20

## GAP-F003-08-PARTLY

**Terms acceptance and age check: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F003-08](../../20-features/003-authentication-and-onboarding-screens/F003-08-terms-acceptance-and-age-check.md)
- Requirement items: S3.19
- Detail: Chrome S3.19: after Codex commits: apply post-codex/w-auth-S3.19-mobile-terms-acceptance.patch, remove 'mobile' from TERMS_GATE_EXEMPT_SURFACES in auth-gate.ts, and make Codex's GET /api/terms/accept report the standing (readTermsStanding) instead of strict current, or mobile sign-in hard-blocks every revision

## GAP-F003-09-01

**No automatic route from sign-up to /welcome was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Detail: Affects: Web and desktop new users.. Work needed: Find or add the redirect and cover it with a test.
- Evidence: grep for '/welcome' in app, features, lib found only the page, route list and tests.

## GAP-F003-09-02

**Brief says CLI profile and role are done; onboarding.rs has neither.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Detail: Affects: CLI.. Work needed: Add the steps or mark not applicable.
- Evidence: apps/cli/src/onboarding.rs:795-1040 (no name or work step).

## GAP-F003-09-03

**Brief says mobile asks the same questions; mobile has no use case or starter prompts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Detail: Affects: Mobile.. Work needed: Decide whether starters belong on mobile.
- Evidence: apps/mobile/app/(public)/onboarding.tsx:593-660.

## GAP-F003-09-04

**No resumable checklist except VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Detail: Affects: Web, desktop, mobile, CLI, Chrome.. Work needed: Design a shared checklist if wanted.
- Evidence: Brief S3.36; no checklist code found.

## GAP-F003-09-05

**It is not shown that mobile name and work reach replies for local models.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Detail: Affects: Mobile Local mode.. Work needed: Trace the on-device prompt builder.
- Evidence: Only the Cloud gateway path was traced.

## GAP-F003-09-NOTBUILT

**Profile and first-chat setup: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F003-09](../../20-features/003-authentication-and-onboarding-screens/F003-09-profile-and-first-chat-setup.md)
- Requirement items: S3.36
- Detail: Web: S3.36; Desktop: S3.36; Mobile: S3.36; CLI: S3.36; Chrome: S3.36

## GAP-F003-10-01

**No memory or notification choice in the first-run wizard on web, desktop or mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-10](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)
- Detail: Affects: New users on those apps.. Work needed: Add the steps or reword the brief.
- Evidence: OnboardingWizard.tsx has two steps only.

## GAP-F003-10-02

**Recommended apps and recommended plugins are not built, though the brief marks recommended apps done on web and desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-10](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)
- Detail: Affects: Web, desktop, mobile, CLI, VS Code, Chrome.. Work needed: Build or remove from scope.
- Evidence: No recommendation code found in features/connectors or the settings modal.

## GAP-F003-10-03

**Desktop permissions are ask-on-use plus a review page, not a guided setup.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-10](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)
- Detail: Affects: Desktop.. Work needed: Decide whether a first-launch walk-through is required.
- Evidence: DesktopPermissionsSection.tsx:29-30.

## GAP-F003-10-04

**CLI memory 'choice' is a note, not a choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-10](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)
- Detail: Affects: CLI.. Work needed: Add a choice or change the brief.
- Evidence: onboarding.rs:960-968.

## GAP-F003-10-05

**No notification setup on VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-10](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)
- Detail: Affects: VS Code.. Work needed: Decide if needed (the IDE shows its own notifications).
- Evidence: Nothing found in package.json or src.

## GAP-F003-10-NOTBUILT

**Memory, apps, permissions and notifications setup: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F003-10](../../20-features/003-authentication-and-onboarding-screens/F003-10-memory-apps-permissions-and-notifications-setup.md)
- Requirement items: S3.27, S3.28
- Detail: Web: S3.28; Desktop: S3.28; Mobile: S3.27, S3.28; CLI: S3.27, S3.28; VS Code: S3.27, S3.28; Chrome: S3.27, S3.28

## GAP-F003-11-01

**Mobile pairing is built but switched off, so the brief's 'done' is not user-reachable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-11](../../20-features/003-authentication-and-onboarding-screens/F003-11-pair-the-browser-extension-and-the-phone.md)
- Detail: Affects: Mobile.. Work needed: Decide launch timing; update brief wording.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:8-16; settings/remote-control.tsx:131.

## GAP-F003-11-02

**Draft says the code is typed on the phone; the code alone is no longer enough.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-11](../../20-features/003-authentication-and-onboarding-screens/F003-11-pair-the-browser-extension-and-the-phone.md)
- Detail: Affects: Mobile users and docs.. Work needed: Update help text to say scan the QR.
- Evidence: apps/mobile/services/manualPairing.ts:36-37.

## GAP-F003-11-03

**Chrome-to-Desktop pairing has no account requirement to start, only a binding afterwards.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-11](../../20-features/003-authentication-and-onboarding-screens/F003-11-pair-the-browser-extension-and-the-phone.md)
- Detail: Affects: Chrome and Desktop.. Work needed: Confirm this matches 'bound to the signed-in account'.
- Evidence: pairing.ts:271-275 binds only when signed in.

## GAP-F003-11-04

**Live verification of phone pairing across the relay is not recorded in any file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-11](../../20-features/003-authentication-and-onboarding-screens/F003-11-pair-the-browser-extension-and-the-phone.md)
- Detail: Affects: Mobile, Desktop, VS Code.. Work needed: Run the scenario on devices after the flags are on.
- Evidence: No run record found.

## GAP-F003-12-01

**Brief says web guest is missing; the code has a guest chat behind a flag.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Detail: Affects: Web (and Desktop if it loads /chat signed out; unknown).. Work needed: Correct the brief and confirm the flag state in production.
- Evidence: apps/web/app/chat/layout.tsx:41-52.

## GAP-F003-12-02

**No carry-over of guest messages on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Detail: Affects: Web visitors.. Work needed: Decide whether to attach transcripts to the new account.
- Evidence: GuestChat.tsx:71-79.

## GAP-F003-12-03

**No sync of local work to the account on CLI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Detail: Affects: CLI, VS Code.. Work needed: Decide whether local sessions should be importable.
- Evidence: No code found; CLI sync is settings only (lib.rs:982-985).

## GAP-F003-12-04

**Plans and trials are billing features; trial support exists in billing code but is outside onboarding and its enabled plans are unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Detail: Affects: All apps.. Work needed: Billing owner states which plans have trial days; keep out of onboarding.
- Evidence: apps/web/lib/billing/trial-policy.ts; packages/contracts/types/src/billing-catalog.ts:1047.

## GAP-F003-12-05

**Desktop and Chrome have no no-account use found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Detail: Affects: Desktop, Chrome.. Work needed: Decide if Desktop Local use should work without sign-in.
- Evidence: signInScreen.ts for signed-out Desktop windows.

## GAP-F003-12-NOTBUILT

**Guest use, plans and trials: not built on Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Chrome
- Features: [F003-12](../../20-features/003-authentication-and-onboarding-screens/F003-12-guest-use-plans-and-trials.md)
- Requirement items: S3.37
- Detail: Desktop: S3.37; Chrome: S3.37

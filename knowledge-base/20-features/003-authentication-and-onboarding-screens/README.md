---
id: "AREA-003"
type: "area"
title: "Authentication and onboarding screens"
features: ["F003-01", "F003-02", "F003-03", "F003-04", "F003-05", "F003-06", "F003-07", "F003-08", "F003-09", "F003-10", "F003-11", "F003-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 3. Authentication and onboarding screens

This area is how a person gets into their AGI Workforce account and is set up for first use. It covers signing in or creating an account on each app, proving an email address, recovering a lost password or second factor, accepting the Terms and passing an age check, and then the first-run setup (name, role, memory, apps, notifications, device pairing). It matters because nothing else works until a session exists, and the Terms, age and two-step checks decide whether an account may be used at all.

**Who uses it.** Every person before first use: new users creating an account, returning users signing in, users who lost a password or second factor, and users of organizations with enterprise single sign-on (organization sign-in). Workspace admins see the organization side only through the organization-domain check (apps/web/lib/services/organization-verified-domains.ts). Developer-class accounts are refused desktop sign-in grants (apps/web/app/api/auth/desktop/grant/route.ts:19-30 region). Guest use and plan selection are not built (see features 12).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F003-01](F003-01-sign-in-to-your-account.md) | Sign in to your account | built | built | partly | built | built | built |
| [F003-02](F003-02-create-an-account-and-confirm-your-email.md) | Create an account and confirm your email | built | built | partly | no | no | no |
| [F003-03](F003-03-email-sign-in-by-magic-link.md) | Email sign-in by magic link | no | no | no | no | no | no |
| [F003-04](F003-04-password-reset.md) | Password reset | built | built | partly | n/a | n/a | n/a |
| [F003-05](F003-05-social-and-work-sign-in.md) | Social and work sign-in | built | built | partly | n/a | n/a | n/a |
| [F003-06](F003-06-passkey-sign-in-and-passkey-setup.md) | Passkey sign-in and passkey setup | built | partly | partly | n/a | n/a | n/a |
| [F003-07](F003-07-two-step-sign-in-and-recovery-codes.md) | Two-step sign-in and recovery codes | built | built | partly | n/a | n/a | n/a |
| [F003-08](F003-08-terms-acceptance-and-age-check.md) | Terms acceptance and age check | partly | partly | built | no | no | partly |
| [F003-09](F003-09-profile-and-first-chat-setup.md) | Profile and first-chat setup | partly | partly | partly | partly | built | partly |
| [F003-10](F003-10-memory-apps-permissions-and-notifications-setup.md) | Memory, apps, permissions and notifications setup | partly | partly | partly | partly | partly | partly |
| [F003-11](F003-11-pair-the-browser-extension-and-the-phone.md) | Pair the browser extension and the phone | n/a | built | built | n/a | built | built |
| [F003-12](F003-12-guest-use-plans-and-trials.md) | Guest use, plans and trials | partly | no | built | built | built | no |

Requirement items for this area: [10-requirements/capabilities/003-authentication-and-onboarding-screens.md](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md).

## How this area works in the code

1. **Sign-in screen entry.** The person opens the sign-in page on web. The Next.js route renders the auth entry screen. On desktop the system browser can be used instead of the in-app form. (`apps/web/app/login/page.tsx:1-12`, `apps/desktop/electron/browserSignIn.ts:44-46`)
2. **Identity client chooses the next step.** A client hook wraps the Clerk sign-in and sign-up objects. It decides, from the vendor state, whether to ask for a password, a second factor, a code, a new password, or to start enterprise sign-in. Errors are classified into messages or notices. (`apps/web/features/auth/IdentityAuthAdapter.tsx:118-120`, `apps/web/features/auth/IdentityAuthAdapter.tsx:366-434 (resolveSignInState)`, `apps/web/features/auth/IdentityAuthAdapter.tsx:436 (resolveSignUpState)`, `apps/web/lib/auth/error-taxonomy.ts`)
3. **Enterprise and desktop handoff.** Enterprise sign-in on the desktop opens the system browser with a random challenge. The app keeps the verifier in memory for 10 minutes. When the browser finishes, a desktop grant route issues a one-time code tied to the challenge. (`apps/desktop/electron/browserSignIn.ts:14 (pending verifier, 10 minute TTL)`, `apps/desktop/electron/browserSignIn.ts:36-46`, `apps/web/app/api/auth/desktop/grant/route.ts:19-42`)
4. **Second factor and recovery.** When the account has an authenticator, the second factor is challenged before a session is issued. Enrolment writes the authenticator secret and backup codes to the identity provider. Enrolment is refused unless the authenticator path is enabled. (`apps/web/features/auth/IdentityAuthAdapter.tsx:366-400 (second factor branch)`, `apps/web/app/api/settings/2fa/verify/route.ts:43-55`, `apps/web/lib/mfa-policy-gate.ts:60-80`)
5. **Terms and age gate.** After sign-in the completion page checks account access and Terms standing. Accounts with no acceptance are shown the gate. Mobile reads the age-gate state from local storage and blocks routes until confirmed. (`apps/web/app/login/complete/page.tsx:109 (accountAccessForSignIn)`, `apps/web/lib/server/terms.ts:93-124 (termsStandingFor, readTermsStanding)`, `apps/mobile/src/features/auth/services/rootRouting.ts:30-40`, `apps/mobile/src/features/auth/services/ageGate.ts:30-60`)
6. **Account-linking inside settings.** Once signed in, the user can link or unlink sign-in methods and manage passkeys from the security section of settings. (`apps/web/features/settings/sections/SecuritySection.tsx:126`, `apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216`, `apps/web/features/settings/components/Settings/PasskeysPanel.tsx:35`)
7. **Onboarding save.** The wizard collects the preferred name, work description and use case. The name and work description are saved as a general preference namespace and the use case is dropped before saving. (`apps/web/features/onboarding/components/OnboardingWizard.tsx:143-201`, `apps/web/features/onboarding/lib/onboarding-preferences.ts:31-38 (withoutDurableUseCase)`, `apps/web/features/onboarding/lib/onboarding-preferences.ts:58 (completeOnboarding)`)
8. **Device pairing for the phone and extension.** Desktop shows a pairing code or QR. The phone or extension submits it. The desktop dispatcher checks the code and binds the pairing to the account. (`apps/web/features/desktop-host/components/RemoteControlSection.tsx:50`, `apps/desktop/electron/runtime/dispatcher.ts:870 (phone pairing)`, `apps/desktop/electron/runtime/dispatcher.ts:924 (extension pairing)`, `apps/mobile/services/manualPairing.ts:165`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/auth/IdentityAuthAdapter.tsx` | Central client logic for every web sign-in and sign-up step: password, email code, second factor, enterprise SSO, provider return, and error mapping. |
| `apps/web/features/auth/AuthFlow.tsx` | The step-by-step sign-in and sign-up screens that the adapter drives (email step, code step, password step, new password step). |
| `apps/web/app/login/complete/page.tsx` | Post-sign-in gate: account access check and the Terms acceptance screen before the session is used. |
| `apps/web/lib/server/terms.ts` | Terms version constants, standing rules (never accepted, current, notice, superseded) and the server read of an account's standing. |
| `apps/web/app/api/settings/2fa/verify/route.ts` | Server route that enrols an authenticator second factor and registers backup codes with the identity provider. |
| `apps/desktop/electron/browserSignIn.ts` | Desktop side of browser sign-in: builds the challenge, keeps the pending verifier for 10 minutes and opens the system browser. |
| `apps/web/app/api/auth/desktop/grant/route.ts` | Issues the one-time sign-in grant to the desktop after the browser sign-in completes; refuses developer-class accounts. |
| `apps/web/features/onboarding/components/OnboardingWizard.tsx` | The web onboarding wizard for name, work description, use case and first-chat start. |
| `apps/web/features/onboarding/lib/onboarding-preferences.ts` | Saves onboarding answers to the account preference store and drops the one-time use-case answer. |
| `apps/mobile/src/features/auth/services/rootRouting.ts` | Decides where a mobile user goes on launch: auth, onboarding, age gate or the app, based on sign-in, onboarding and age state. |
| `apps/mobile/src/features/auth/services/ageGate.ts` | Mobile age-gate rule: the time-zone based age threshold and the stored confirmation record. |
| `apps/mobile/src/features/auth/store/termsAcceptanceStore.ts` | Mobile Terms state (checking, required, accepting, accepted) read from the Terms API. |
| `apps/web/lib/mfa-policy-gate.ts` | Decides whether an account has a second factor enrolled, with a cache and a fail-closed rule when the identity lookup fails. |

## What is stored

- Sign-in session and identity records (accounts, passwords, passkeys, second factors, social links): The sign-in vendor (Clerk), not the repo. Accessed through the identity provider calls in apps/web/app/api/settings/2fa/verify/route.ts.
- Authenticator secret and backup codes: Sent to the identity provider with registerSecondFactor (apps/web/app/api/settings/2fa/verify/route.ts registerSignInFactor). Enrolment cache of second-factor state in the key-value store (apps/web/lib/mfa-policy-gate.ts).
- Terms acceptance record (version, time, surface): Recorded per account through recordTermsAcceptance in apps/web/lib/server/terms.ts; read by readTermsStanding. Storage table not opened.
- Desktop pending browser sign-in verifier and challenge: Process memory in the desktop main process (apps/desktop/electron/browserSignIn.ts:14). Lost on app restart; expires after 10 minutes.
- Age-gate confirmation record (confirmed, minor flag, time, region, threshold): Device storage on mobile, MMKV key age-gate:v1 (apps/mobile/src/features/auth/services/ageGate.ts).
- Onboarding preferences (preferred name, work description): Account preference store, general namespace (apps/web/features/onboarding/lib/onboarding-preferences.ts). Store backend not opened.
- Mobile Terms state: Client state store (apps/mobile/src/features/auth/store/termsAcceptanceStore.ts). Persistence not verified.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **MIN_REQUIRED_TERMS_VERSION**: Null means no Terms revision is binding. Setting a version makes older accounts re-prompt after the effective date. (apps/web/lib/server/terms.ts:20)
- **MIN_REQUIRED_TERMS_EFFECTIVE_AT**: Date a binding Terms revision starts to block accounts still on an older version. (apps/web/lib/server/terms.ts:21)
- **MATERIAL_TERMS_GRACE_DAYS**: Days between a material Terms change and its binding date (30). (apps/web/lib/server/terms.ts:22)
- **mfaEmailFallback option**: When true, the email code counts as a second factor. Default false, so email is not offered as a second factor. (apps/web/features/auth/IdentityAuthAdapter.tsx (IdentityAuthOptions, policyRef and POLICY_GATED_SECOND_FACTORS))
- **Enterprise SSO strategy**: When the account has an enterprise connection for the address, that connection is used first and personal factors are skipped. (apps/web/features/auth/IdentityAuthAdapter.tsx (ENTERPRISE_SSO_STRATEGY, resolveSignInState))
- **Desktop browser sign-in availability**: If the host bridge does not support browser sign-in, the user is told to update the app. (apps/web/features/auth/IdentityAuthAdapter.tsx (startEnterpriseSso, hostSupportsBrowserSignIn))
- **Age rule by time zone**: Region rule sets the age threshold (18 in Brazil and India, otherwise the account minimum). (apps/mobile/src/features/auth/services/ageGate.ts (TIMEZONE_TO_REGION, detectRegionRule))
- **Developer-class accounts**: Desktop sign-in grant is refused for developer-class accounts. (apps/web/app/api/auth/desktop/grant/route.ts:19-30)
- **Rate limits on second-factor verify and desktop grant**: Requests over the limit are refused. (apps/web/app/api/settings/2fa/verify/route.ts (withRateLimit '2fa-verify'); apps/web/app/api/auth/desktop/grant/route.ts (withRateLimit 'device-link'))

## Shared between apps

Shared: the web auth screens (apps/web/features/auth) are used by the web app and, embedded, by the desktop window (AuthLayout embedded flag in apps/web/app/login/complete/page.tsx). Shared client helpers for sign-in provider names are in packages/client/client-runtime/src/authProviders.ts. Error classification is in apps/web/lib/auth/error-taxonomy.ts. Terms and standing logic are server-side in apps/web/lib/server/terms.ts. Separate per app: mobile uses its own native Clerk integration (apps/mobile/src/integrations/clerk.ts) and its own age gate, Terms store and routing; the CLI has its own Rust OAuth and onboarding (apps/cli/src/oauth.rs, apps/cli/src/onboarding.rs); the VS Code extension has its own device authentication (apps/extension-vscode/src/features/account-auth/deviceAuth.ts); the Chrome extension has its own pairing and side panel (apps/extension/src/side_panel.ts, apps/extension/src/features/native-bridge/pairing.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief's Chrome and API Terms item refers to TERMS_GATE_EXEMPT_SURFACES in auth-gate.ts and a patch file. Neither the constant nor auth-gate.ts appears in the repository source (search found it only in the audit notes). The 'mobile' exemption that item asks to remove cannot be located. (Brief S3.19 (Unfinished line); audit/partial/003-authentication-and-onboarding-screens.md:129-130)
- The brief says the use-case answer should tailor replies. The code deliberately drops it before saving and uses it only for the first-chat starter prompts. This contradicts the S3.23 'Should'. (apps/web/features/onboarding/lib/onboarding-preferences.ts:25-38)
- The age-gate region rule uses the device time zone, not a verified country or birth date. A traveller or a device with a different time zone gets the wrong threshold. (apps/mobile/src/features/auth/services/ageGate.ts (detectRegionRule and TIMEZONE_TO_REGION))
- Mobile Terms state is set through the mobile terms store, but the brief's own unfinished note says mobile sign-in hard-blocks every revision unless the standing check is used. The check in the store reads strict 'current' rather than the standing function. (apps/mobile/src/features/auth/store/termsAcceptanceStore.ts:87 (error text) and apps/web/lib/server/terms.ts:124 (readTermsStanding))
- Magic-link confirmation (S3.05) has no code in any app; the email factor is a typed code only. (apps/web/features/auth/IdentityAuthAdapter.tsx (SECOND_FACTOR_KINDS, sendSignInEmailCode))

## Not established

- Nothing was run. This was a read-only code reading. No tests, builds or servers were started, as the task required.
- The full Terms-acceptance write path (/api/terms/accept), the database table behind recordTermsAcceptance, and whether its GET reports the standing or the strict current version were not opened.
- The mobile sign-in screen (apps/mobile/app/(auth)/login.tsx) and its Clerk integration (apps/mobile/src/integrations/clerk.ts) were listed in the brief but not opened, so mobile social, passkey and reset claims come from the brief only.
- The CLI, VS Code and Chrome sign-in internals (apps/cli/src/oauth.rs, apps/extension-vscode/src/features/account-auth/deviceAuth.ts, apps/extension/src/features/native-bridge/pairing.ts) were not read past their names.
- The organization-domain lookup (apps/web/lib/services/organization-verified-domains.ts) and the desktop browser-sign-in handoff page (apps/web/app/auth/desktop/DesktopSignInHandoff.tsx) were not opened.
- Whether unlinking a sign-in method is blocked when it is the last one, and whether removing a passkey asks for confirmation, were not established.
- The age-gate behaviour on web and desktop (missing per brief) and the guest-to-account sync on mobile (localCloudSyncService.ts) were not verified in code.
- The Clerk Dashboard settings needed for mobile authenticator and backup codes are external and were not checked.
- The 'email verification screen' on mobile (S3.03) is unverified in the brief and was not traced.

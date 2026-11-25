---
id: "F003-02"
type: "feature"
title: "Create an account and confirm your email"
aliases: ["Create account", "Sign up", "Log in or sign up", "Check your inbox", "Confirm your email address", "Email verification", "Verification code", "S3.02", "S3.03", "S3.04"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S3.02", "S3.03", "S3.04"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-api-and-contracts", "F003-01", "F003-04", "file:apps/web/features/auth/AuthCodeStep.tsx", "file:apps/web/features/auth/ConfirmEmailStep.tsx", "file:apps/web/lib/auth/email-confirmation.ts", "store:browser-local-storage-signup-markers"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-02 Create an account and confirm your email

New people create an account by typing an email on the shared Web screen, then prove the address with a six-digit emailed code. The account is not usable until the address is confirmed. A password is asked for after the code when the account needs one. Mobile has its own sign-up screen with a verify step.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.02](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s302), [S3.03](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s303), [S3.04](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s304).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates an AGI account from an email, sends a code to that address, checks the code, and only then opens a session. If creation worked but the address could not be confirmed, the person is told the account exists and to contact support, and is not signed in (apps/web/features/auth/IdentityAuthAdapter.tsx:247-269, 417-434).

**Why it exists.** An unproven email must not own an account or receive a session, and later steps (support replies, recovery) rely on a confirmed address (apps/web/lib/auth/email-confirmation.ts:51-64).

**Who uses it.** New users on any app. CLI, VS Code and Chrome users create the account on the web page those apps open.

**Problems it solves**

- Stops sign-in as an address nobody has proven (IdentityAuthAdapter.tsx:421-427).
- Gives browsers and password managers a standard one-time-code field so the code can be autofilled (apps/web/features/auth/AuthCodeStep.tsx:154).
- Keeps accounts made by older paths with an unconfirmed address from getting in; they are asked for a code at completion (apps/web/app/login/complete/page.tsx:81-87).

**Use cases**

- A person opens /signup, types an email, enters the code from their inbox, sets a password and starts chatting.
- A person whose code expired presses Resend code after the cooldown.
- A Mobile user taps Create an account, verifies the emailed code and continues to Terms.
- A CLI user without an account approves the device on the web page and is first sent through sign-up.

## 2. User experience

**Where to find it**

- Web: /signup shows the same screen as /login, headed Log in or sign up (apps/web/app/signup/page.tsx:1-11; apps/web/features/auth/AuthEmailStep.tsx:94).
- Mobile: Create an account heading, reached by Create an account instead or New to AGI? Create an account (apps/mobile/src/features/auth/components/MobileSignUp.tsx:313; apps/mobile/app/(auth)/login.tsx:413-431).
- Desktop, CLI, VS Code, Chrome: the browser page the app opens (see F003-01).

**Before you start**

- A working email address that can receive a code.
- Web: browser able to reach the identity service.
- The sign-up must need only an email and a password; any other required field makes the page stop with a support message (apps/web/features/auth/IdentityAuthAdapter.tsx:446-449).

**Screens and controls**

- Email step: Email address, Continue, agreement text beside the button (apps/web/features/auth/AuthEmailStep.tsx:141-169).
- Code step: heading Check your inbox, text We sent a code to <email>, field Code (digits only, six), Continue, Resend code or Resend code in <n>s, Edit beside the address (apps/web/features/auth/AuthCodeStep.tsx:32-35, 128-137, 183-198).
- Create a password step after the code: heading Create a password, text You will use it with <email> to log in, rule of at least 8 characters (apps/web/features/auth/AuthNewPasswordStep.tsx:28-47; apps/web/features/auth/authContract.ts:97).
- Confirm your email address page for older unconfirmed accounts, with text that confirming signs the account out everywhere else (AuthCodeStep.tsx:45-52; apps/web/features/auth/ConfirmEmailStep.tsx:17-149).
- Mobile verify step: Verify your email, code field, Verify and continue, resend, Log in instead when the address exists (MobileSignUp.tsx:313, 388, 585-603).

**Journey**

1. Type the email and press Continue.
2. The page finds no account for the address and starts a sign-up with the Terms flag accepted (IdentityAuthAdapter.tsx:479-486).
3. A code is emailed (IdentityAuthAdapter.tsx:451-455).
4. Type or autofill the six digits; the step submits itself when the sixth digit is entered (AuthCodeStep.tsx:117-120).
5. If the account needs a password, the Create a password step appears; submit it (IdentityAuthAdapter.tsx:457-459, 592-602).
6. The session is finalized and the browser goes to /signup/complete, which checks email, age and records Terms (apps/web/app/signup/complete/page.tsx:15-54).
7. Mobile: Continue starts sign-up and sends the code; Verify and continue finishes it and opens the Terms and age checks (MobileSignUp.tsx:90-195).

**What the person sees and gets**

- Wrong code: error against the Code field (error kind code_incorrect, apps/web/lib/auth/error-taxonomy.copy.ts, English text: Check the last code we emailed you and enter its six digits again).
- Account made but address not confirmed: message naming the address and saying contact support, no sign-in (IdentityAuthAdapter.tsx:247-257).
- Code could not be sent: similar message (IdentityAuthAdapter.tsx:259-269).
- Extra required fields: This sign-up also needs <fields>, which this page cannot collect. Contact support (IdentityAuthAdapter.tsx:234-245).
- Resend cooldown of 30 seconds, or the server's wait after a rate limit (apps/web/features/auth/authContract.ts:96; apps/web/features/auth/AuthFlow.tsx:289).

**Settings**

- None for the user. Password length and breach rules are set in the identity service and shown as the rule text (apps/web/features/auth/AuthNewPasswordStep.tsx:40-47).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: sign-up on the shared screen with email code, then password if required (apps/web/features/auth/IdentityAuthAdapter.tsx:436-464; apps/web/features/auth/AuthFlow.tsx:316-333).
- Web: unproven address cannot sign in; a sign-up marked complete with an unverified address removes the unproven session and starts a sign-in code instead (IdentityAuthAdapter.tsx:417-434, 440-444).
- Web: resend, edit address, autofill and auto-submit at six digits (apps/web/features/auth/AuthCodeStep.tsx:104-120, 183-198).
- Web: older accounts with an unconfirmed address get a code step at login completion, and confirming ends other sessions (apps/web/features/auth/ConfirmEmailStep.tsx:61-84).
- Web: a race where the account appears between the two calls is retried as a sign-in once (IdentityAuthAdapter.tsx:488-492).
- Mobile: sign-up with email code verify, resend, and Log in instead when the address exists (apps/mobile/src/features/auth/components/MobileSignUp.tsx:90-195, 585-603).
- Desktop: sign-up happens in the browser page reached from Continue in browser (apps/desktop/electron/browserSignIn.ts:44-47).

**Incomplete**

- Mobile sign-up has no password step in the native screen; password handling for Mobile accounts is not shown in the parts of MobileSignUp.tsx read (lines 56-240, 575-640).
- Mobile resend is wired (MobileSignUp.tsx:146) but its visible label was not confirmed.

**Present but disconnected or switched off**

- Providers other than the defaults for sign-up depend on AGI_AUTH_PROVIDERS (packages/client/client-runtime/src/authProviders.ts:17).

**Not available**

- Authenticator-app codes as a sign-up step; the code step here is email only.
- Sign-up inside CLI, VS Code and Chrome apps themselves (they open the web page).

## 4. Required behaviour

**Established requirements**

- After sign-up the user must confirm their email on a verification screen before the account is usable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.03)
- A code field accepts an emailed or authenticator code with resend and one-time-code autofill and verifies it. (source: S3.04 (same brief))
- A new user can create an account (email or provider) from a sign-up screen, or is handed to one. (source: S3.02 (same brief))
- Adult confirmation and Terms acceptance run after sign-up before use. (source: apps/web/app/signup/complete/page.tsx:28-54 and apps/web/app/login/complete/page.tsx:91-119 (code))

**Acceptance criteria**

1. A new email on /signup receives a code and no session exists before the code is accepted.
2. A wrong code is refused against the Code field and the right code then succeeds.
3. Resend code is disabled for the cooldown and then works.
4. If the code cannot be sent after account creation, the message says the account was created and to contact support, and the person is not signed in.
5. A sign-up that needs a password asks for one after the code.
6. On Mobile the code step shows Verify and continue, and an existing address offers Log in instead.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Six digits is the fixed code length for the web step [inferred from authContract.ts:95; the vendor decides the real length].
- A confirmation path for Mobile exists in code, but the brief calls it unverified until run [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the unconfirmed-address and unsent-code messages a link to the support or recovery page instead of plain text.
- [proposed] Add a Mobile test for the sign-up verify step if none covers it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Sign-up page | `apps/web/app/signup/page.tsx` | Renders the shared entry screen. |
| hook | useIdentityAuthClient (sign-up part) | `apps/web/features/auth/IdentityAuthAdapter.tsx` | startWithEmail, resolveSignUpState, proveAddressBySignIn, submitCode, resendCode, submitNewPassword. |
| component | AuthCodeStep | `apps/web/features/auth/AuthCodeStep.tsx` | Code entry, autofill, auto-submit, resend cooldown. |
| component | AuthNewPasswordStep | `apps/web/features/auth/AuthNewPasswordStep.tsx` | Create a password step. |
| component | ConfirmEmailStep | `apps/web/features/auth/ConfirmEmailStep.tsx` | Code step for accounts with an unconfirmed address, with session cleanup. |
| service | email-confirmation | `apps/web/lib/auth/email-confirmation.ts` | Server read of primary email verification state. |
| screen | SignupCompletePage | `apps/web/app/signup/complete/page.tsx` | Checks email, age, then records Terms. |
| component | RecordTermsAcceptance | `apps/web/app/signup/complete/RecordTermsAcceptance.tsx` | Records Terms acceptance after sign-up (file exists in the folder listing; contents not opened). |
| store | signupAttemptMarkers | `apps/web/app/signup/signupAttemptMarkers.ts` | Browser local-storage markers for Terms, marketing and age choices that survive a provider round trip. |
| config | authContract | `apps/web/features/auth/authContract.ts` | Code length 6, resend cooldown 30 seconds, password minimum 8, step and result types. |
| component | AuthSignupAgreement | `apps/web/features/auth/AuthSignupAgreement.tsx` | Agreement text under the email field (file exists; contents not opened). |
| component | MobileSignUp | `apps/mobile/src/features/auth/components/MobileSignUp.tsx` | Native sign-up with verify step. |
| screen | Mobile LoginScreen | `apps/mobile/app/(auth)/login.tsx` | Switches between sign-in and sign-up, shows data-use notice. |
| service | error taxonomy | `packages/client/client-runtime/src/authErrorTaxonomy.ts` | identifier_exists and code error kinds. |
| test | AuthCodeStep tests | `apps/web/features/auth/__tests__/AuthCodeStep.test.tsx` | Code step tests. |
| test | ConfirmEmailStep tests | `apps/web/features/auth/__tests__/ConfirmEmailStep.test.tsx` | Confirm-email step tests. |
| test | e2e flow states | `apps/web/e2e/auth-flow-states.spec.ts` | Sign-up path browser tests (titles at lines 437-519). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page tries sign-in; on form_identifier_not_found it creates a sign-up with the email and legalAccepted true. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:466-486 |
| The page records a sign-up attempt marker in the browser. | device | apps/web/features/auth/AuthFlow.tsx:57-60; apps/web/app/signup/signupAttemptMarkers.ts:30-47 |
| The identity service emails a code; the person submits it; the service marks the address verified. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:451-455, 506-515 |
| If a password is missing the page submits one to the identity service. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:592-602 |
| The page finalizes the session and navigates to /signup/complete. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:317-324 |
| Our server confirms the primary email is verified, then asks age, then records Terms acceptance. | our servers | apps/web/app/signup/complete/page.tsx:23-54; apps/web/lib/auth/email-confirmation.ts:37-49 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account record and email verification state | Identity vendor service | Read by our server on demand with a timeout (apps/web/lib/auth/email-confirmation.ts:25-35) | Deletion and erasure are handled by the account lifecycle (apps/web/lib/auth/account-lifecycle.ts:13-21); details unknown. |
| Sign-up attempt markers (Terms version, marketing choice, age check) | Browser local storage keys agi.terms-accepted-version, agi.marketing-email-notice-version, agi.age-checked-minimum | No | Cleared when the attempt is cancelled or fails (apps/web/app/signup/signupAttemptMarkers.ts:6-47). |
| Terms acceptance record | Our database through apps/web/lib/server/terms.ts recordTermsAcceptance (table not opened: unknown) | Server-side only | Unknown. |

**Models and providers.** No model or inference provider takes part. Email delivery is done through the identity vendor; the sending provider is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Creates the account. No prior account. |
| Permissions | No role needed. Adult eligibility must be confirmed after sign-up (apps/web/app/signup/complete/page.tsx:28-42). |
| Subscription | none found in the code at sign-up. |
| Limits and metering | Resend cooldown 30 seconds on the client (apps/web/features/auth/authContract.ts:96); server rate-limit waits are shown as a countdown (apps/web/features/auth/AuthFlow.tsx:289). Server numbers are vendor configuration: unknown. |
| Feature flags | None specific to sign-up on Web. Mobile FEATURES.auth (apps/mobile/lib/v1FeatureFlags.ts:8). |
| Model compatibility | none found in the code. |
| Provider restrictions | Identity vendor only. |
| Local mode | Mobile Local Mode needs no account; sign-up is reached only from the Cloud sign-in screen (apps/mobile/app/(auth)/login.tsx:277). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Code wrong | Error against the Code field; the same code is not auto-resubmitted unless changed. | apps/web/features/auth/AuthCodeStep.tsx:104-111 |
| Code expired | code_expired copy tells the person to send a new one. | apps/web/lib/auth/error-taxonomy.copy.ts:23-27 area; packages/client/client-runtime/src/authErrorTaxonomy.ts:64 |
| Resend too soon or rate limited | Button disabled with a countdown; server wait overrides the cooldown. | apps/web/features/auth/AuthCodeStep.tsx:113-115, 184-198 |
| Account created but address cannot be confirmed | Message with the address and contact-support text; no session. | apps/web/features/auth/IdentityAuthAdapter.tsx:247-257, 417-434 |
| Required sign-up field this page cannot collect | Stops with a contact-support message. | apps/web/features/auth/IdentityAuthAdapter.tsx:446-449, 234-245 |
| Account has no email at confirmation | Text that it cannot be used yet; contact support. | apps/web/features/auth/ConfirmEmailStep.tsx:94-105 |
| Ending other sessions fails after confirmation | Shows an error and a Try again button. | apps/web/features/auth/ConfirmEmailStep.tsx:114-131 |
| Address typed twice at the same time (race) | Second call retried as sign-in once. | apps/web/features/auth/IdentityAuthAdapter.tsx:488-492 |
| Offline | network_unreachable with Try again. | packages/client/client-runtime/src/authErrorTaxonomy.ts:179 |
| Back to edit the email | Edit restarts both attempts and clears markers. | apps/web/features/auth/AuthFlow.tsx:175-181; apps/web/features/auth/IdentityAuthAdapter.tsx:669-673 |
| Mobile address already in use | Error plus Log in instead. | apps/mobile/src/features/auth/components/MobileSignUp.tsx:120-124, 585-603 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/auth/__tests__/AuthCodeStep.test.tsx`: Code step (by name; not opened).
- `apps/web/features/auth/__tests__/ConfirmEmailStep.test.tsx`: Confirm-email step (by name).
- `apps/web/features/auth/__tests__/AuthNewPasswordStep.test.tsx`: New password step (by name).
- `apps/web/lib/auth/__tests__/email-confirmation.test.ts`: Email confirmation helper (by name).
- `apps/web/app/signup/page.test.tsx`: Sign-up page (by name).
- `apps/web/app/signup/signupAttemptMarkers.test.ts`: Marker storage (by name).
- `apps/web/e2e/auth-flow-states.spec.ts`: Titles at lines 403-519: code submitted once, autofilled code, sign-up with and without password, wrong sign-up code refused against the code field.
- `apps/mobile/__tests__/MobileAuthContract.test.tsx`: Mobile auth contract (by name; no file named for MobileSignUp found).

**Test scenarios**

- **New address on Web**
  1. Open /signup, type a new email, Continue.
  2. Enter the emailed code.
  3. Enter a password when asked.
  - Expected: Session opens, /signup/complete runs the age and Terms steps, the new chat appears.
- **Wrong then right code**
  1. On the code step type a wrong six digits.
  2. Type the right code.
  - Expected: First attempt shows an error on the Code field; second opens the session.
- **Resend**
  1. On the code step wait for the countdown to end.
  2. Press Resend code.
  - Expected: A fresh code arrives; button shows the countdown again.
- **Unconfirmed legacy account**
  1. Sign in with an account whose address is unverified.
  - Expected: Confirm your email address page, a code is sent, after confirming other sessions end.
- **Mobile sign-up**
  1. Open Cloud sign-in, type a new email, Continue, then Create an account.
  2. Enter the code, press Verify and continue.
  - Expected: Account opens and the Terms review appears.

**Where to look when it fails**

- Log Primary email lookup failed (apps/web/lib/auth/email-confirmation.ts:32).
- Error kinds code_incorrect, code_expired, identifier_exists, rate_limited.
- Browser local-storage keys agi.terms-accepted-version and agi.age-checked-minimum for attempt state.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Mobile email verification is not confirmed by a run; the brief marks it unverified though code exists.** Affects: Mobile. Evidence: apps/mobile/src/features/auth/components/MobileSignUp.tsx:164-195; area brief S3.03/S3.04. Work needed: Drive the Mobile sign-up on a device and record the result.
- **Unconfirmed-address and unsent-code messages tell people to contact support with no link.** Affects: Web and apps that open the web page. Evidence: apps/web/features/auth/IdentityAuthAdapter.tsx:247-269. Work needed: Add a link to the recovery or support page.
- **The Mobile sign-up screen has no password step and the way Mobile accounts get a password is not shown.** Affects: Mobile. Evidence: apps/mobile/src/features/auth/components/MobileSignUp.tsx:90-195. Work needed: Confirm intended behaviour and document it.
- **No test file named for Mobile sign-up found.** Affects: Mobile. Evidence: Search of apps/mobile for MobileSignUp tests returned none. Work needed: Add tests for verify and resend.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-api-and-contracts
- F003-01
- F003-04
- file:apps/web/features/auth/AuthCodeStep.tsx
- file:apps/web/features/auth/ConfirmEmailStep.tsx
- file:apps/web/lib/auth/email-confirmation.ts
- store:browser-local-storage-signup-markers

## Unknown

- Which table stores Terms acceptance (apps/web/lib/server/terms.ts read only for its function list).
- Who sends the verification email.
- Whether Mobile sign-up asks for a password at any step.
- Real code length set by the vendor.
- Contents of tests marked by name only; none were run.

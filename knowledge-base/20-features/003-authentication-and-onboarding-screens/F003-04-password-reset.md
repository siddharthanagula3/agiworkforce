---
id: "F003-04"
type: "feature"
title: "Password reset"
aliases: ["Forgot password", "Password reset", "Reset your password", "Create a new password", "Recover your AGI account", "S3.06", "S3.07"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S3.06", "S3.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-authentication-and-identity", "SYS-security-and-privacy", "F003-01", "F003-02", "file:apps/web/features/auth/AuthNewPasswordStep.tsx", "file:apps/web/features/auth/IdentityAuthAdapter.tsx", "file:apps/mobile/app/(auth)/reset-password.tsx", "table:profiles"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-04 Password reset

A person who forgot a password presses Forgot password? on the password step, receives a code by email, enters it, sets a new password and is signed in. This is built on Web and, through the same page, Desktop. On Mobile the native screen sends people to the vendor screen or to the web recovery page.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.06](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s306), [S3.07](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s307).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sends a reset code to the account's email, verifies it, accepts a new password and finishes sign-in (apps/web/features/auth/IdentityAuthAdapter.tsx:366-375, 519-523, 603-605, 610-618).

**Why it exists.** People forget passwords; without self-service reset they are locked out or need support.

**Who uses it.** Account holders with a password. Locked accounts are also sent to a reset to unlock (apps/web/lib/auth/account-status.ts:27, 74-80).

**Problems it solves**

- Recovery without support for people who still reach their email.
- Unlocking accounts locked by too many failed attempts (apps/web/lib/auth/account-status.ts:74-80).
- A route for people who cannot reach the email: a Can't reach this email? link goes to the account-recovery page (apps/web/features/auth/AuthPasswordStep.tsx:105-111; apps/web/features/auth/authRoutes.ts:83).

**Use cases**

- A user forgets the password, presses Forgot password?, enters the code and picks a new password.
- A locked-out user follows the Reset your password action on the locked notice.
- A Mobile user taps Forgot password or try another way and finishes in the vendor screen or web page.

## 2. User experience

**Where to find it**

- Web: sign in, type email, on Enter your password press Forgot password? (apps/web/features/auth/AuthPasswordStep.tsx:103).
- Desktop: through the browser sign-in, which shows the same web page (see F003-01).
- Mobile: Forgot password or try another way on the password step (apps/mobile/src/features/auth/components/MobileSignIn.tsx:779); or the Recover your AGI account screen with Open Web Account (apps/mobile/app/(auth)/reset-password.tsx:60-86).
- CLI, VS Code, Chrome: not applicable; the browser page is used (doc: area brief S3.06).

**Before you start**

- An account with a password on the typed email.
- Access to that email inbox.

**Screens and controls**

- Password step: Enter your password, Password, Continue, Forgot password?, Can't reach this email? (apps/web/features/auth/AuthPasswordStep.tsx:53-111).
- Code step: Check your inbox, We sent a code to <email>, Code, Resend code (apps/web/features/auth/AuthCodeStep.tsx:32-35).
- New password step: heading for reset, field New password, rule text, Continue (apps/web/features/auth/AuthNewPasswordStep.tsx:28-47).
- Mobile recovery screen: Recover your AGI account, Open Web Account, Lost Your Email or Two-Factor Device?, Back to Sign In (apps/mobile/app/(auth)/reset-password.tsx:60-86).

**Journey**

1. On the password step press Forgot password?; the page asks the identity service to email a reset code (apps/web/features/auth/IdentityAuthAdapter.tsx:610-618).
2. The code step appears; enter the code (IdentityAuthAdapter.tsx:519-523).
3. The new password step appears; type a new password and press Continue (IdentityAuthAdapter.tsx:603-605).
4. The sign-in finishes and the page goes to /login/complete like any sign-in (IdentityAuthAdapter.tsx:308-315).
5. Mobile: choose the options link, then use the vendor screen's reset or Open Web Account and repeat the web steps.

**What the person sees and gets**

- Errors classified by kind: code expired, code incorrect, rate limited with a wait, weak password message from the vendor with suggestions (packages/client/client-runtime/src/authErrorTaxonomy.ts:178-213).
- Field-level error on the new password field when the vendor refuses the password (apps/web/e2e/auth-flow-states.spec.ts:519 title).
- Old paths /auth/reset-password, /auth/update-password and /forgot-password redirect to /login (apps/web/app/auth/reset-password/page.tsx:12-15; apps/web/app/auth/update-password/page.tsx:12-14; apps/web/next.config.ts:157).

**Settings**

- Password minimum of 8 characters shown in the rule text (apps/web/features/auth/authContract.ts:97; apps/web/features/auth/AuthNewPasswordStep.tsx:40-47); the vendor sets the real rules.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: full reset path with code and new password, signing in at the end (apps/web/features/auth/IdentityAuthAdapter.tsx:372-374, 519-523, 548-551, 603-618).
- Web: resend works for the reset step (IdentityAuthAdapter.tsx:548-551).
- Web: locked and recovery-pending accounts are sent to /auth/reset-password which redirects to /login (apps/web/lib/auth/account-status.ts:27, 74-87; apps/web/app/auth/reset-password/page.tsx:12-15).
- Desktop: same web flow in the browser (apps/desktop/electron/browserSignIn.ts:44-47).
- Mobile: a Recover your AGI account screen opens the web sign-in or /recover page (apps/mobile/app/(auth)/reset-password.tsx:20-50); a deep link to auth/reset-password opens that screen (apps/mobile/app/_layout.tsx:935-938).

**Incomplete**

- Mobile: the native screen has no reset code step of its own; it hands off through the vendor's native view (MobileSignIn.tsx:779; apps/mobile/app/(auth)/login.tsx:384). Whether the vendor view offers a reset code is not shown in this repo: unknown.

**Present but disconnected or switched off**

- The old reset-password and update-password pages only redirect; they hold no logic.

**Not available**

- Password reset inside CLI, VS Code and Chrome (they use the web page).

## 4. Required behaviour

**Established requirements**

- From sign-in the user can request a password reset and receives a reset code or link by email. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.06)
- After verifying the reset code the user sets a new password and is signed in. (source: S3.07 (same brief))
- A user who lost password, email or second factor can complete account recovery. (source: S3.16 (same brief; recovery page apps/web/app/recover/page.tsx))

**Acceptance criteria**

1. Forgot password? sends a code to the typed email and shows the code step.
2. A wrong code shows an error against the Code field; a right code shows the new password step.
3. A new password that the vendor refuses is shown against the password field; an accepted one signs the person in.
4. After reset the person passes through /login/complete.
5. A locked account's notice has a Reset your password action.
6. On Mobile the options link reaches a reset path (vendor screen or web page).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The new password step must not be reachable without a verified code [inferred from IdentityAuthAdapter.tsx:519-523 sequence and the vendor status needs_new_password at 372-374].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a native Mobile reset step so Mobile users do not leave the app.
- [proposed] Tell the person on the code step that a reset code, not a sign-in code, was sent.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AuthPasswordStep | `apps/web/features/auth/AuthPasswordStep.tsx` | Forgot password? and Can't reach this email? controls. |
| hook | startPasswordReset, submitCode, submitNewPassword | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Reset code send, verify, new password submit. |
| component | AuthNewPasswordStep | `apps/web/features/auth/AuthNewPasswordStep.tsx` | New password entry. |
| component | AuthCodeStep | `apps/web/features/auth/AuthCodeStep.tsx` | Reset code entry. |
| component | AuthFlow reset wiring | `apps/web/features/auth/AuthFlow.tsx` | Connects onForgotPassword (line 275) and the new password step (lines 316-333). |
| service | account-status | `apps/web/lib/auth/account-status.ts` | Recovery path /auth/reset-password for locked accounts. |
| screen | reset-password redirect | `apps/web/app/auth/reset-password/page.tsx` | Redirects to /login (or the embedded recovery path). |
| screen | update-password redirect | `apps/web/app/auth/update-password/page.tsx` | Redirects to /login. |
| screen | Account recovery page | `apps/web/app/recover/page.tsx` | Lost email or second factor path (not opened beyond the brief). |
| service | error taxonomy | `packages/client/client-runtime/src/authErrorTaxonomy.ts` | Reset error kinds and password strength suggestions. |
| screen | Mobile reset-password screen | `apps/mobile/app/(auth)/reset-password.tsx` | Hands recovery to the web. |
| hook | Mobile deep-link route | `apps/mobile/app/_layout.tsx` | Routes auth/reset-password links to the screen (lines 935-938). |
| component | MobileSignIn options link | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Forgot password or try another way (line 779). |
| test | AuthFlow password tests | `apps/web/features/auth/__tests__/AuthFlow.password.test.tsx` | Password and reset step tests (by name). |
| test | e2e reset | `apps/web/e2e/auth-flow-states.spec.ts` | Forgot password emails a reset code (title at line 353). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page asks the identity service to email a reset code to the signed-in attempt's identifier. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:610-618 |
| The person types the code; the identity service verifies it. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:519-523 |
| The page submits the new password to the identity service, which signs the attempt in. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:603-605 |
| The page navigates to /login/complete where our server runs the access, email, age and Terms checks. | our servers | apps/web/app/login/complete/page.tsx:69-146 |
| Mobile hand-off: the app opens the web sign-in or recovery page in a browser. | device | apps/mobile/app/(auth)/reset-password.tsx:20-37 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Password hash and reset code state | Identity vendor service | No copy in our database found | Vendor controlled: unknown. |
| Locked status | profiles.account_status | Server only | Where it is cleared was not opened: unknown. |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | An existing account with a password. |
| Permissions | No role needed. |
| Subscription | none found in the code. |
| Limits and metering | Resend cooldown 30 seconds; server rate-limit waits shown (apps/web/features/auth/authContract.ts:96; apps/web/features/auth/AuthFlow.tsx:289). |
| Feature flags | None specific. |
| Model compatibility | none found in the code. |
| Provider restrictions | Identity vendor. |
| Local mode | Not applicable on Mobile Local Mode, which needs no account (apps/mobile/app/(auth)/login.tsx:277). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Code wrong or expired | Error on the Code field with resend. | packages/client/client-runtime/src/authErrorTaxonomy.ts:63-64; apps/web/features/auth/AuthCodeStep.tsx:184-198 |
| Password refused by vendor (weak or breached) | Field error with the vendor's suggestions joined into the message. | packages/client/client-runtime/src/authErrorTaxonomy.ts:165-169, 198-203 |
| Rate limited | Notice with a countdown. | apps/web/features/auth/IdentityAuthAdapter.tsx:199-208 |
| Account has only passwordless methods | Goes straight to an emailed code instead of a password step. | apps/web/features/auth/IdentityAuthAdapter.tsx:397-402; apps/web/features/auth/AuthCodeStep.tsx:54-60 |
| Locked account | Notice with Reset your password. | apps/web/lib/auth/account-status.ts:37, 74-80 |
| Cannot reach the email | Link to account recovery. | apps/web/features/auth/AuthPasswordStep.tsx:105-111 |
| Embedded page | The recovery link is hidden when embedded (omitWhenEmbedded). | apps/web/features/auth/AuthPasswordStep.tsx:105-109 |
| Mobile browser fails to open | Alert Could not open account recovery with a web address to visit. | apps/mobile/app/(auth)/reset-password.tsx:32-36 |
| Offline | network_unreachable and Try again. | packages/client/client-runtime/src/authErrorTaxonomy.ts:179 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/auth/__tests__/AuthNewPasswordStep.test.tsx`: New password step (by name).
- `apps/web/features/auth/__tests__/AuthPasswordStep.test.tsx`: Password step (by name).
- `apps/web/features/auth/__tests__/AuthFlow.password.test.tsx`: Password flow (by name).
- `apps/web/e2e/auth-flow-states.spec.ts`: Forgot password emails a reset code (title, line 353); a refused new password is shown against the field (title, line 519).
- `apps/mobile/__tests__/ResetPasswordScreen.test.tsx`: Mobile recovery screen (by name).
- `apps/mobile/__tests__/reset-password-deep-link.test.ts`: Deep link routing (by name).
- `apps/web/lib/auth/account-status.test.ts`: Locked recovery path (by name).

**Test scenarios**

- **Reset on Web**
  1. Open /login, type the email of a password account, Continue.
  2. Press Forgot password?, enter the emailed code.
  3. Type a new valid password, Continue.
  - Expected: Signed in and on the new chat; old password no longer works.
- **Weak new password**
  1. Reach the new password step.
  2. Type a short password.
  - Expected: Error against the password field with the vendor's suggestion; a longer one is accepted.
- **Locked account**
  1. Use an account with status locked, sign in.
  - Expected: Notice This account is locked with Reset your password.
- **Mobile reset**
  1. On Mobile open password step, press Forgot password or try another way.
  2. Open the web recovery from the reset screen.
  - Expected: Browser opens the web sign-in or recovery page; after reset the person can sign in on Mobile.

**Where to look when it fails**

- Error kinds code_incorrect, code_expired, rate_limited, credentials_invalid.
- profiles.account_status values locked and recovery_pending.
- Mobile alert Could not open account recovery.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Mobile has no native reset code step; the vendor view's behaviour is not visible in this repo.** Affects: Mobile. Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:779; apps/mobile/app/(auth)/login.tsx:384. Work needed: Run the Mobile flow and record whether a reset is offered, or build one.
- **Brief marks Mobile reset unverified.** Affects: Mobile. Evidence: Area brief S3.06/S3.07. Work needed: Live check.
- **Reset wording does not tell the person that a reset code was sent (the code step copy is the sign-in copy).** Affects: Web. Evidence: apps/web/features/auth/AuthCodeStep.tsx:62-67 (copyFor has no reset case). Work needed: Add reset-specific heading copy.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-authentication-and-identity
- SYS-security-and-privacy
- F003-01
- F003-02
- file:apps/web/features/auth/AuthNewPasswordStep.tsx
- file:apps/web/features/auth/IdentityAuthAdapter.tsx
- file:apps/mobile/app/(auth)/reset-password.tsx
- table:profiles

## Unknown

- Whether the vendor's native Mobile view offers a reset code.
- Where a locked or recovery-pending status is cleared.
- Whether reset signs out other sessions.
- Tests marked by name only were not opened or run.

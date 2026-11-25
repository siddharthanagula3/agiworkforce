---
id: "PLAN-mobile-003"
type: "test-plan"
title: "Mobile · 3. Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "3"
---
# Mobile · 3. Authentication and onboarding screens

22 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S3.01 Sign-in screen.

- **Expected:** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- **Code:** done. Evidence moved: apps/mobile/app/(auth)/login.tsx:207 (quoted code not found in the file now); apps/mobile/src/integrations/clerk.ts:67 (quoted code not found in the file now)
- **Where to find it:** Menu icon (top left of the chat screen) > Cloud > Log in or sign up (labels found in the code)
- **Needs:** signed out; an email inbox or a Google account
- **Steps:**
  1. Open the menu icon at the top left of the chat screen to open the side drawer.
  2. Tap the Cloud segment of the Local and Cloud switch while signed out.
  3. On the sign-in screen, type your email in the Email address field and tap Continue, or tap Continue with Google.
  4. Finish the sign-in in the browser sheet or on the code or password screen.
  5. Check that the app is now in AGI Cloud with no sign-in prompt left. Compare with Expected.

## S3.02 Create-account screen.

- **Expected:** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- **Code:** done. Evidence moved: apps/mobile/app/(auth)/login.tsx:207 (quoted code not found in the file now); apps/mobile/src/integrations/clerk.ts:67 (quoted code not found in the file now)
- **Where to find it:** Menu icon > Cloud > Log in or sign up > type a new email > Continue (labels found in the code)
- **Needs:** signed out; an email address with no AGI account
- **Steps:**
  1. Open the sign-in screen as in S3.01.
  2. Type an email address that has no AGI account in the Email address field.
  3. Tap Continue. The app moves to the Create an account screen with your email filled in.
  4. Look for the Create an account screen with a Continue button under the email field. Compare with Expected.

## S3.03 Email verification screen.

- **Expected:** After sign-up the user must confirm their email address on a verification screen before the account is usable.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Menu icon > Cloud > Log in or sign up > new email > Continue > Continue (labels found in the code)
- **Needs:** signed out; an email inbox you can read
- **Steps:**
  1. Follow S3.02 with a new email and tap Continue on the Create an account screen.
  2. Look for the Verify your email screen and the line that says Enter the code sent to your email address.
  3. Leave the screen without entering a code, then try to use Cloud chat.
  4. Compare with Expected: the account should not be usable until the email is confirmed.

## S3.04 Verification-code input.

- **Expected:** A code-entry field accepts an emailed or authenticator code (with resend and one-time-code autofill) and verifies it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Menu icon > Cloud > Log in or sign up > new email > Continue > Continue > Verify your email (labels found in the code)
- **Needs:** signed out; an email inbox you can read
- **Steps:**
  1. Reach the Verify your email screen as in S3.03.
  2. Tap the Verification code field and type or autofill the code from the email.
  3. Tap Verify and continue.
  4. If the code is wrong, read the red error text, then tap Send a new code and check that a new email arrives.
  5. With the right code, look for the app moving on to the next screen. Compare with Expected.

## S3.06 Password-reset request.

- **Expected:** From sign-in the user can request a password reset and receives a reset code or link by email.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Menu icon > Cloud > Log in or sign up > your email > Continue > Enter your password > Forgot password or try another way (labels found in the code)
- **Needs:** signed out; an account with a password; an email inbox
- **Steps:**
  1. Type the email of an existing account with a password and tap Continue.
  2. On the Enter your password screen, tap Forgot password or try another way.
  3. The built-in account screen opens. Its wording comes from Clerk, not this repo.
  4. Look for a reset option that sends a code or link to your email. Compare with Expected.

## S3.07 Password-reset completion.

- **Expected:** After verifying the reset code the user sets a new password and is signed in.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Open the password-reset link from your email on this phone > Recover your AGI account > Open Web Account (labels found in the code)
- **Needs:** signed out; a reset link from email on this phone
- **Steps:**
  1. Open the password-reset link from your email on this phone.
  2. The app opens the Recover your AGI account screen.
  3. Tap Open Web Account. The AGI web account opens in the in-app browser.
  4. Look for a new-password step. The app itself has no password field and does not sign you in. Compare with Expected.

## S3.08 Social-provider sign-in choices.

- **Expected:** Sign-in and sign-up offer social providers (e.g. Google, GitHub) that complete sign-in on this surface.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** Menu icon > Cloud > Log in or sign up (labels found in the code)
- **Needs:** signed out; a Google or GitHub account (an outside account)
- **Steps:**
  1. Open the sign-in screen.
  2. Look above the Email address field for Continue with Google and Continue with GitHub. On iPhone builds, Continue with Apple may also show.
  3. Tap Continue with Google and finish in the browser sheet.
  4. Look for the app signed in to AGI Cloud. Compare with Expected.

## S3.09 Enterprise SSO entry.

- **Expected:** A user of an SSO-enabled organization can start enterprise single sign-on from the sign-in screen and land signed in.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** Menu icon > Cloud > Log in or sign up > Email address > Continue (labels found in the code)
- **Needs:** signed out; an account in an SSO organisation
- **Steps:**
  1. Open the sign-in screen.
  2. Type a work email for an organisation that uses single sign-on in the Email address field.
  3. Tap Continue.
  4. Look for a browser sheet opening your organisation's sign-in page. The app has no separate SSO button.
  5. Finish there and check the app is signed in. Compare with Expected.

## S3.10 Organization-domain discovery.

- **Expected:** Entering a work email discovers the organization's sign-in by the email domain and routes the user to it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** no screen of its own. The domain lookup runs on Clerk's side; the app only reads the enterprise_sso answer (apps/mobile/src/features/auth/components/MobileSignIn.tsx:202-203).
- **Needs:** a work email on an SSO domain
- **Steps:**
  1. Type a work email on a company domain that has single sign-on set up, and tap Continue.
  2. Look whether the browser sheet opens the company's sign-in page without asking you for an organisation name.
  3. Compare with Expected: entering the work email should route you to that organisation.

## S3.12 Passkey sign-in.

- **Expected:** A user with a registered passkey can sign in with it instead of a password or code.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** not found in the code. Searched for passkey sign-in: passkeySignInEnabled (packages/client/client-runtime/src/authProviders.ts) is not called by any file in apps/mobile, and the sign-in screen has no passkey button; only the error text in apps/mobile/src/features/auth/components/authErrorMessage.ts:48-49 mentions it.
- **Needs:** a passkey registered on this phone

## S3.14 Multifactor challenge.

- **Expected:** At sign-in an account with MFA is challenged for its second factor (with alternatives such as backup codes) before a session is issued.
- **Code:** partial. Evidence moved: apps/mobile/app/(auth)/login.tsx:207 (quoted code not found in the file now); apps/mobile/src/features/settings/account-security/service.ts:68
- **Known to be unfinished:** Owner: enable Authenticator and Backup codes in the Clerk Dashboard, then a live second-factor sign-in check; code path (MobileSignIn onNativeFallback) unchanged.
- **Where to find it:** Menu icon > Cloud > Log in or sign up > your email > Continue > Enter your password > Continue (labels found in the code)
- **Needs:** an account with two-step sign-in turned on
- **Steps:**
  1. Sign in with an account that has two-step sign-in turned on.
  2. Enter the email, tap Continue, enter the password, and tap Continue.
  3. If the second step is an email code, look for Check your email, type the code, and tap Continue. You can also tap Use an email code instead.
  4. If the second step is not an email code, the built-in account screen opens. Look for More sign-in options and backup codes there.
  5. Compare with Expected.

## S3.16 Account-recovery flow.

- **Expected:** A user who has lost their password, email or second factor can start and complete an account-recovery flow that restores access.
- **Code:** done. Evidence present: apps/mobile/app/(auth)/reset-password.tsx:79
- **Where to find it:** Open the password-reset link from your email on this phone > Recover your AGI account > Lost Your Email or Two-Factor Device? (labels found in the code)
- **Needs:** signed out; a reset link from email on this phone
- **Steps:**
  1. Open the recovery link from your email on this phone while signed out.
  2. Look for the Recover your AGI account screen.
  3. Tap Lost Your Email or Two-Factor Device?. The account recovery page opens in the in-app browser.
  4. Look for the recovery steps on that web page. The app does not restore access itself. Compare with Expected.

## S3.18 Conflicting-account resolution.

- **Expected:** When sign-up or provider sign-in hits an existing account (or sign-in hits none), the user is told and offered the right path (sign in instead, or create).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Menu icon > Cloud > Log in or sign up > type an email > Continue (labels found in the code)
- **Needs:** signed out; one unused email and one email with an account
- **Steps:**
  1. Enter an email that has no AGI account and tap Continue. The app moves to Create an account with the email filled in.
  2. On Create an account, enter an email that already has an account and tap Continue.
  3. Look for the message This email already has an account. and the Log in instead link.
  4. Tap Log in instead and check it returns you to sign in. Compare with Expected.

## S3.19 Terms-acceptance screen.

- **Expected:** Before first use the user reviews and accepts the current Terms (versioned), acceptance is recorded, and a terms change re-prompts.
- **Code:** done. Evidence present: apps/mobile/src/features/auth/store/termsAcceptanceStore.ts:96
- **Where to find it:** Menu icon > Cloud > sign in (S3.01) > Review the Terms for AGI Cloud (labels found in the code)
- **Needs:** a Cloud account whose Terms are not yet accepted
- **Steps:**
  1. Sign in to an AGI Cloud account that has not accepted the current Terms, or one where the Terms version has changed.
  2. Look for the Review the Terms for AGI Cloud screen with the line Version dated and the checkbox.
  3. Tap Read Terms or Read Privacy Policy to open them.
  4. Tick the checkbox and tap Agree and continue.
  5. Look for the app opening AGI Cloud without the screen coming back. Compare with Expected.

## S3.20 Age or eligibility verification where applicable.

- **Expected:** Where age limits apply, the user must confirm age or eligibility before use, and under-age users are blocked or restricted.
- **Code:** done. Evidence moved: apps/mobile/app/(public)/age-gate.tsx:205 (quoted code not found in the file now); apps/mobile/src/features/auth/services/ageGate.ts:138; apps/mobile/src/features/auth/services/rootRouting.ts:25 (quoted code not found in the file now)
- **Where to find it:** First launch > Your age (labels found in the code)
- **Needs:** a fresh install; a throwaway install for the under-age test
- **Steps:**
  1. Use a fresh install, since the age answer stays on the device.
  2. On the Your age screen, type a number in Enter your age and tap Continue.
  3. Do the under-age check last, on a throwaway install: an age under the minimum shows the refusal screen with Continue in Local Mode.
  4. With an adult age, look for the app moving on to onboarding. Compare with Expected.

## S3.21 Profile setup.

- **Expected:** During onboarding the user sets up basic profile details (at least the name the assistant uses) and they are saved to the account.
- **Code:** done. Evidence present: apps/mobile/app/(public)/onboarding.tsx:314
- **Where to find it:** First launch > Start chatting > I understand, continue > What should AGI call you? (labels found in the code)
- **Needs:** a fresh install; no account needed
- **Steps:**
  1. On a fresh install, tap Start chatting on the intro screen.
  2. If the disclosure appears, read it and tap I understand, continue.
  3. On What should AGI call you?, type a name in Your name and tap Continue, or tap Skip for now.
  4. Open Settings and look for the name at the top. Compare with Expected.

## S3.23 Role or use-case selection.

- **Expected:** Onboarding asks the user their role or intended use and uses the answer (e.g. to tailor replies or suggestions).
- **Code:** done. Evidence present: apps/mobile/app/(public)/onboarding.tsx:315
- **Where to find it:** First launch > Start chatting > I understand, continue > What best describes your work? (labels found in the code)
- **Needs:** a fresh install; no account needed
- **Steps:**
  1. On a fresh install, tap Start chatting, then accept the disclosure if it appears.
  2. On What should AGI call you?, type in the What best describes your work? field (placeholder For example, product design).
  3. Tap Continue.
  4. Open Settings and look for the saved work description. Compare with Expected.

## S3.26 Import-from-another-assistant flow.

- **Expected:** The user can bring memories or history over from another assistant (ChatGPT, Claude, Gemini) through a guided import flow.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/memory-import.tsx:116 (quoted code not found in the file now); apps/mobile/src/features/memory/services/memoryImport.ts:58 (quoted code not found in the file now)
- **Where to find it:** Settings > Memory > Import memories icon (top right of the Memory screen) (labels found in the code)
- **Needs:** a text or JSON export from another assistant, or pasted text
- **Steps:**
  1. Open Settings and tap Memory. Memory must be turned on for the import icon to show.
  2. Tap the import icon at the top right of the Memory screen.
  3. Pick a source (ChatGPT, Claude, Gemini, Copilot or Other), then paste memories or tap Choose a text or JSON file.
  4. Tap Preview, then the import button, and look for the Added memories message and Done. Compare with Expected.

## S3.31 Mobile device pairing.

- **Expected:** A phone can be paired with the desktop app by QR or short code, and the pairing is bound to the signed-in account.
- **Code:** done. Evidence present: apps/mobile/services/manualPairing.ts:165; apps/mobile/lib/dispatchHmac.ts:306; apps/mobile/stores/connectionStore.ts:233; apps/mobile/__tests__/connection-control-session.test.ts:188
- **Where to find it:** not found in the code. The pairing screen sits under Settings > Remote control > Connections, but FEATURES.companion is false (apps/mobile/lib/v1FeatureFlags.ts:16), so the row is hidden and the Remote screen shows FeatureUnavailable (apps/mobile/app/(app)/companion/index.tsx:183); the pairing screen cannot be reached in this build.
- **Needs:** a desktop app signed in to Managed Cloud, and a phone

## S3.32 Optional notification setup.

- **Expected:** The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/notifications/index.tsx:309; apps/mobile/services/notifications.ts:121 (quoted code not found in the file now)
- **Where to find it:** Settings > Notifications > Turn on notifications (labels found in the code)
- **Needs:** a phone where notifications are not yet allowed
- **Steps:**
  1. Open Settings and tap Notifications.
  2. Look for the Turn on notifications card: Get alerts when an agent needs approval, finishes or fails.
  3. Tap Turn on notifications and choose Don't Allow in the system prompt.
  4. Look for the card to change to Open Settings, then open the screen again later. Compare with Expected.

## S3.35 First-conversation introduction.

- **Expected:** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- **Code:** done. Evidence present: apps/mobile/app/(public)/onboarding.tsx:569; apps/mobile/app/(public)/onboarding.tsx:256
- **Where to find it:** First launch > Start chatting (labels found in the code)
- **Needs:** a fresh install
- **Steps:**
  1. On a fresh install, read the intro screen notes about settings, local chats and AI mistakes.
  2. Tap Start chatting, then accept the disclosure if it appears.
  3. Fill in or skip What should AGI call you?
  4. On the device step, tap Continue (or Continue without downloading) to reach the chat.
  5. Look for the first chat screen opening. Compare with Expected.

## S3.37 Guest experience and guest-to-account conversion.

- **Expected:** Without an account the user can try the product (guest/local use), and later sign up with their guest work carried over or still available.
- **Code:** done. Evidence moved: apps/mobile/app/(auth)/login.tsx:158 (quoted code not found in the file now); apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts:28 (quoted code not found in the file now)
- **Where to find it:** First launch > Continue without downloading > chat in Local mode; later Settings > Data Controls > Sync to AGI Cloud > Sync Local Chats to Cloud (labels found in the code)
- **Needs:** a fresh install for the guest step; a Cloud account for the sync step
- **Steps:**
  1. On a fresh install, skip sign-in at the device step with Continue without downloading, then send a message in Local mode.
  2. Check that the chat works without an account, and that local chats stay on the device.
  3. Later, sign in (S3.01), then open Settings and tap Data Controls.
  4. Under Sync to AGI Cloud, tap Sync Local Chats to Cloud, read the summary, and confirm.
  5. Compare with Expected: the chosen chat text is copied and the local originals stay on the device.

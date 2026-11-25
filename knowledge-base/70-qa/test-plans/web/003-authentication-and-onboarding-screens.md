---
id: "PLAN-web-003"
type: "test-plan"
title: "Web · 3. Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "3"
---
# Web · 3. Authentication and onboarding screens

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S3.01 Sign-in screen.

- **Expected:** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- **Code:** done. Evidence moved: apps/web/app/login/page.tsx:51 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:429
- **Where to find it:** Signed out: "Log in or sign up" screen > "Email address" > "Continue" (labels found in the code)
- **Needs:** an existing account with a password or email code
- **Steps:**
  1. Sign out, or open the app while signed out.
  2. Type your account email in "Email address".
  3. Click "Continue".
  4. Enter your password (or the emailed code) and click "Continue".
  5. Look for the signed-in chat page, which means the session was issued.

## S3.02 Create-account screen.

- **Expected:** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- **Code:** done. Evidence moved: apps/web/app/signup/page.tsx:43 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:481
- **Where to find it:** Signed out: "Log in or sign up" screen > "Email address" > "Continue" (use an address with no account) (labels found in the code)
- **Needs:** an email address that has no account yet
- **Steps:**
  1. Open the sign-up address (/signup) or sign out.
  2. Type an email address that has no account in "Email address".
  3. Click "Continue".
  4. Follow the next step, which can be "Create a password".
  5. Look for the account being created and the next step (email confirmation).

## S3.03 Email verification screen.

- **Expected:** After sign-up the user must confirm their email address on a verification screen before the account is usable.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthFlow.tsx:291; apps/web/features/auth/IdentityAuthAdapter.tsx:452; apps/web/features/auth/IdentityAuthAdapter.tsx:336 (quoted code not found in the file now)
- **Where to find it:** Signed out: "Log in or sign up" > new "Email address" > "Continue" > "Check your inbox" screen (labels found in the code)
- **Needs:** a new email address you can read
- **Steps:**
  1. Sign up with an email address that has no account.
  2. Look for the "Check your inbox" screen and the "We sent a code to" line with your address.
  3. Open your email and find the code.
  4. Enter it in "Code" and click "Continue".
  5. Check that the account is usable after the code is accepted.

## S3.04 Verification-code input.

- **Expected:** A code-entry field accepts an emailed or authenticator code (with resend and one-time-code autofill) and verifies it.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthCodeStep.tsx:154; apps/web/features/auth/IdentityAuthAdapter.tsx:336 (quoted code not found in the file now)
- **Where to find it:** "Check your inbox" screen > "Code" field (reach it with "Try another way to sign in" > "Email me a code" when a password is offered) (labels found in the code)
- **Needs:** an email account you can read
- **Steps:**
  1. Reach the "Check your inbox" screen.
  2. Type a wrong code in "Code" and click "Continue"; look for the error.
  3. Click "Resend code" and look for the "Resend code in" countdown.
  4. Enter the newest emailed code (autofill from the email app is offered by the field) and click "Continue".
  5. Look for the signed-in result.

## S3.06 Password-reset request.

- **Expected:** From sign-in the user can request a password reset and receives a reset code or link by email.
- **Code:** done. Evidence present: apps/web/features/auth/AuthPasswordStep.tsx:103; apps/web/features/auth/IdentityAuthAdapter.tsx:549
- **Where to find it:** "Log in or sign up" > "Email address" > "Continue" > "Enter your password" > "Forgot password?" (labels found in the code)
- **Needs:** an account with a password and access to its email
- **Steps:**
  1. Type the email of an account that has a password and click "Continue".
  2. On "Enter your password" click "Forgot password?".
  3. Look for the "Check your inbox" screen with the "We sent a code to" line.
  4. Open the email inbox and look for the reset code.

## S3.07 Password-reset completion.

- **Expected:** After verifying the reset code the user sets a new password and is signed in.
- **Code:** done. Evidence present: apps/web/features/auth/AuthNewPasswordStep.tsx:107; apps/web/features/auth/IdentityAuthAdapter.tsx:603
- **Where to find it:** "Forgot password?" > "Check your inbox" > "Code" > "Continue" > "Set a new password" (labels found in the code)
- **Needs:** the reset code from the email
- **Steps:**
  1. Enter the reset code from the email in "Code" and click "Continue".
  2. On "Set a new password" type a new password in "New password".
  3. Read the rule line about minimum length and breach checks.
  4. Click "Continue".
  5. Look for being signed in after the new password is set.

## S3.08 Social-provider sign-in choices.

- **Expected:** Sign-in and sign-up offer social providers (e.g. Google, GitHub) that complete sign-in on this surface.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthProviderButtons.tsx:53; apps/web/features/auth/IdentityAuthAdapter.tsx:441 (quoted code not found in the file now); packages/client/client-runtime/src/authProviders.ts:17
- **Where to find it:** Signed out: "Log in or sign up" screen > "Continue with Google" or "Continue with GitHub" (buttons above the email field) (labels found in the code)
- **Needs:** a Google or GitHub account
- **Steps:**
  1. Sign out and open the sign-in screen.
  2. Look for the provider buttons above "Email address".
  3. Click "Continue with Google" (or GitHub).
  4. Finish the provider sign-in in the provider window.
  5. Look for the signed-in chat page.

## S3.09 Enterprise SSO entry.

- **Expected:** A user of an SSO-enabled organization can start enterprise single sign-on from the sign-in screen and land signed in.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthFlow.tsx:275 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:393; apps/web/features/auth/IdentityAuthAdapter.tsx:299
- **Where to find it:** Signed out: "Log in or sign up" > "Email address" (an organization address) > "Continue" (labels found in the code)
- **Needs:** an account in an SSO-enabled organization
- **Steps:**
  1. Type an email address of an SSO-enabled organization in "Email address".
  2. Click "Continue".
  3. Look for the message "This address belongs to an organization. Taking you to its sign-in".
  4. Finish the organization sign-in in the browser when asked, then look for the signed-in result.

## S3.10 Organization-domain discovery.

- **Expected:** Entering a work email discovers the organization's sign-in by the email domain and routes the user to it.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthFlow.tsx:275 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:393; apps/web/lib/services/organization-verified-domains.ts:7
- **Where to find it:** no screen of its own. The domain check runs on the server (apps/web/lib/services/organization-verified-domains.ts); the screen only shows its result.
- **Needs:** a work email on a verified organization domain
- **Steps:**
  1. Type a work email whose domain belongs to a verified organization.
  2. Click "Continue".
  3. Look for the message "This address belongs to an organization. Taking you to its sign-in" and the redirect to the organization sign-in.

## S3.11 Passkey enrollment.

- **Expected:** A signed-in user can register a passkey for their account and see it listed (with rename/removal).
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:35 (quoted code not found in the file now); apps/web/lib/identity/client.ts:149 (quoted code not found in the file now); apps/web/features/settings/sections/SecuritySection.tsx:246
- **Earlier check in the running app:** UI_ONLY: E013 [UI_ONLY; visible UI]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Security > "Passkeys" > "Add a passkey" (labels found in the code)
- **Needs:** a signed-in account and a browser or device that supports passkeys
- **Steps:**
  1. Sign in, then open Settings.
  2. Click "Security" in the Settings list.
  3. Find the "Passkeys" heading and click "Add a passkey".
  4. Complete the device or browser passkey prompt.
  5. Look for the new passkey listed; click "Rename" or "Remove" on it to check those controls.

## S3.12 Passkey sign-in.

- **Expected:** A user with a registered passkey can sign in with it instead of a password or code.
- **Code:** done. Evidence present: apps/web/features/auth/AuthMethodPicker.tsx:18; apps/web/features/auth/IdentityAuthAdapter.tsx:622
- **Where to find it:** "Log in or sign up" > "Sign in with a passkey or security key" (above the email field); or "Try another way to sign in" > "Use a passkey or security key" (labels found in the code)
- **Needs:** a registered passkey on the account and a device that holds it
- **Steps:**
  1. Sign out and open the sign-in screen.
  2. Click "Sign in with a passkey or security key".
  3. Complete the passkey prompt on the device.
  4. Look for the signed-in result without a password or code.

## S3.13 Multifactor authentication setup.

- **Expected:** A user can enroll an authenticator (QR + setup key, confirm code, backup codes) and from then on sign-in asks for that second factor.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/verify/route.ts:26 (quoted code not found in the file now); apps/web/lib/mfa-policy-gate.ts:79
- **Earlier check in the running app:** UI_ONLY: E013 [UI_ONLY; visible UI]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Security > "Authenticator app" > "Set up authenticator app" (labels found in the code)
- **Needs:** an authenticator app on a phone
- **Steps:**
  1. Open Settings, click "Security", find "Authenticator app".
  2. Click "Set up authenticator app" (or "Enable two-factor" in the confirm step).
  3. Scan the QR code with an authenticator app, or use "Copy key".
  4. Type the 6-digit code in "Enter the 6-digit code from the app" and click "Verify and enable".
  5. Look for "Two-factor authentication is now enabled on your account." Then sign out and check that sign-in asks for a code.

## S3.14 Multifactor challenge.

- **Expected:** At sign-in an account with MFA is challenged for its second factor (with alternatives such as backup codes) before a session is issued.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/verify/route.ts:26 (quoted code not found in the file now); apps/web/lib/mfa-policy-gate.ts:79
- **Where to find it:** Signed out: "Log in or sign up" > "Email address" > "Continue" > password > "Confirm it is you" screen (labels found in the code)
- **Needs:** an account with authenticator two-factor on, and its device
- **Steps:**
  1. Sign in with password on an account that has two-factor on.
  2. Look for the "Confirm it is you" screen.
  3. Enter the code from the authenticator app and click "Continue".
  4. Look for the alternatives such as "Use a backup code" or "Text me a code instead".
  5. Look for "Lost the device with your codes?" as the recovery path.

## S3.15 Recovery-code display and download.

- **Expected:** When MFA is enabled (or codes are regenerated) the user is shown one-time recovery codes once and can copy, print or download them.
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx:448; apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx:530; apps/web/app/api/settings/2fa/backup-codes/route.ts:45 (quoted code not found in the file now)
- **Where to find it:** Settings > Security > "Authenticator app" > "Generate new backup codes" (also shown during "Set up authenticator app") (labels found in the code)
- **Needs:** a signed-in account with two-factor on, or the setup flow
- **Steps:**
  1. Open Settings, click "Security", find "Authenticator app".
  2. Click "Generate new backup codes" and confirm in "Replace your backup codes?".
  3. Look for the "Save your backup codes" section with the codes.
  4. Click "Copy codes", "Download codes" and "Print codes" one at a time and check each result.
  5. Look that the codes are shown only once in this view.

## S3.16 Account-recovery flow.

- **Expected:** A user who has lost their password, email or second factor can start and complete an account-recovery flow that restores access.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthSecondFactorStep.tsx:130 (quoted code not found in the file now); apps/web/features/auth/AuthPasswordStep.tsx:96 (quoted code not found in the file now); apps/web/app/recover/page.tsx:37; apps/web/lib/support/tickets/recovery.ts:69; apps/web/lib/support/tickets/recovery.ts:55; apps/web/lib/support/tickets/recovery.ts:130; apps/web/lib/support/tickets/recovery.ts:148; apps/web/features/admin/components/SupportTicketQueuePanel.tsx:254
- **Where to find it:** "Log in or sign up" > "Email address" > "Continue" > "Enter your password" > "Can’t reach this email?" (or "Confirm it is you" > "Lost the device with your codes?") > "Request recovery" (labels found in the code)
- **Needs:** an email address you can be reached at
- **Steps:**
  1. Reach "Can’t reach this email?" from the password screen.
  2. Look for the "Recover your account" page and pick the reason shown.
  3. Fill in every field and an email address we can reach you at.
  4. Click "Request recovery".
  5. Look for the request-sent confirmation, or the error if a field is missing.

## S3.17 Account-linking flow.

- **Expected:** A signed-in user can link another sign-in method (e.g. Google, GitHub) to the same account and see or unlink linked methods.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/SecuritySection.tsx:126 (quoted code not found in the file now); apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216 (quoted code not found in the file now)
- **Where to find it:** Settings > Security > "Sign-in methods" > "Connect" next to Google or GitHub (labels found in the code)
- **Needs:** a signed-in account and a Google or GitHub account not yet linked
- **Steps:**
  1. Sign in, open Settings, click "Security".
  2. Find the "Sign-in methods" heading.
  3. Click "Connect" next to Google (or GitHub) and finish the provider sign-in.
  4. Look for the row to say "Connected as" with your provider email.
  5. Click "Disconnect" to see the removal step; do not confirm unless the test needs it.

## S3.18 Conflicting-account resolution.

- **Expected:** When sign-up or provider sign-in hits an existing account (or sign-in hits none), the user is told and offered the right path (sign in instead, or create).
- **Code:** done. Evidence moved: apps/web/features/auth/AuthEmailStep.tsx:80 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:301 (quoted code not found in the file now); apps/web/lib/auth/error-taxonomy.ts:54 (quoted code not found in the file now)
- **Where to find it:** "Log in or sign up" > "Email address" > "Continue" (error message appears on the screen) (labels found in the code)
- **Needs:** one account email and one unused email
- **Steps:**
  1. Enter an email address that already has an account and click "Continue".
  2. Look for the message "This email already has an account" and the action "Log in instead".
  3. Enter an email address with no account and click "Continue".
  4. Look for "No account uses this email" and the action "Create an account".

## S3.19 Terms-acceptance screen.

- **Expected:** Before first use the user reviews and accepts the current Terms (versioned), acceptance is recorded, and a terms change re-prompts.
- **Code:** done. Evidence present: apps/web/lib/server/terms.ts:12; apps/web/lib/server/terms.ts:93; apps/web/app/login/complete/page.tsx:109
- **Where to find it:** Finish signing in screen after sign-in or sign-up: "Finish signing in" > checkbox "I agree to the Terms of Service and acknowledge the Privacy Policy." > "Continue" (labels found in the code)
- **Needs:** an account that has not accepted the current Terms
- **Steps:**
  1. Sign in with an account that has not accepted the current Terms, or create a new account.
  2. Look for the "Finish signing in" screen and the line "Review the details below to continue."
  3. Tick the terms checkbox.
  4. Click "Continue".
  5. Look for the sign-in finishing into the app.

## S3.21 Profile setup.

- **Expected:** During onboarding the user sets up basic profile details (at least the name the assistant uses) and they are saved to the account.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:159; apps/web/features/onboarding/components/OnboardingWizard.tsx:89; apps/web/features/onboarding/lib/onboarding-preferences.ts:65
- **Where to find it:** After sign-in with an account that has not finished setup: "What should we call you?" > "Preferred name" > "Continue" (labels found in the code)
- **Needs:** a new account that has not finished onboarding
- **Steps:**
  1. Sign in with a new account.
  2. On "What should we call you?" clear "Preferred name" and type a name.
  3. Click "Continue", then click "Finish" on the next step.
  4. Look for the name being used by the chat (or check the name in Settings > General).

## S3.23 Role or use-case selection.

- **Expected:** Onboarding asks the user their role or intended use and uses the answer (e.g. to tailor replies or suggestions).
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:172; apps/web/features/onboarding/components/OnboardingWizard.tsx:217; apps/web/features/onboarding/lib/onboarding-preferences.ts:65
- **Where to find it:** /welcome after sign-in: step 1 "What best describes your work?" (pick from the list); step 2 "What do you want to do first?" (radio options such as "Write and debug code") (labels found in the code)
- **Needs:** a new account that has not finished onboarding
- **Steps:**
  1. On step 1 open "What best describes your work?" and pick an option (default says "Select one").
  2. Click "Continue".
  3. On step 2 pick "Write and debug code" or another option.
  4. Read "This picks the suggestions below and nothing else".
  5. Look at the starter prompts that change with the choice.

## S3.24 Personalization setup.

- **Expected:** Onboarding lets the user set personalization (name to use, what they do, preferred style) that then shapes replies.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:159; apps/web/features/onboarding/components/OnboardingWizard.tsx:172; apps/web/features/onboarding/components/OnboardingWizard.tsx:45; apps/web/features/onboarding/lib/onboarding-preferences.ts:65
- **Where to find it:** Settings > Personalization > "Response style" (onboarding asks only for name and work, not style) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and click "Personalization".
  2. Change a value under "Response style" or "Response length".
  3. Open a chat and send a short question.
  4. Compare the reply style with the setting you chose.

## S3.26 Import-from-another-assistant flow.

- **Expected:** The user can bring memories or history over from another assistant (ChatGPT, Claude, Gemini) through a guided import flow.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:205 (quoted code not found in the file now); apps/web/features/settings/components/ImportMemoryDialog.tsx:34; apps/web/features/settings/components/ImportMemoryDialog.tsx:81 (quoted code not found in the file now); apps/web/app/api/memory/import/route.ts:192
- **Where to find it:** Settings > Personalization > "Memory" > "Import memory from other AI providers" > "Start import" (labels found in the code)
- **Needs:** text or a file exported from another assistant, and a Cloud account with memory available
- **Steps:**
  1. Open Settings, click "Personalization", scroll to "Memory".
  2. Click "Start import".
  3. Pick a source (ChatGPT, Claude, Gemini, Copilot or Other), then "Paste memories" or "Upload file".
  4. Click "Preview" and select the memories to keep.
  5. Click "Import" with the count and look for "Imported N memories from".

## S3.27 Recommended-app connection flow.

- **Expected:** New users are shown a few recommended apps/connectors (e.g. based on their role) and can connect them in a guided flow.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:309; apps/web/features/settings/components/WebSettingsModal.tsx:337
- **Where to find it:** Settings > "Connectors" > "Suggested for" row (appears only when a work role is saved) (labels found in the code)
- **Needs:** a saved work role and an outside account for the connector
- **Steps:**
  1. Open Settings and click "Connectors".
  2. Look for the "Suggested for" heading with connector buttons.
  3. Click one suggested connector.
  4. Click its connect action and follow the guided flow.
  5. Look for the connector shown as connected.

## S3.32 Optional notification setup.

- **Expected:** The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:2279; apps/web/features/chat/pages/WebChatPage.tsx:7613
- **Where to find it:** Chat page during a long reply: banner "Get notified when the response is ready." with "Enable" and a close control; later change in Settings > Notifications > "Reply ready" (labels found in the code)
- **Needs:** a browser where notification permission is still undecided, and a reply that runs long
- **Steps:**
  1. Send a message that takes a while to answer.
  2. Wait for the banner "Get notified when the response is ready.".
  3. Click "Enable" and look for the browser permission prompt; or click the close control labelled "Dismiss notification prompt".
  4. Open Settings, click "Notifications", and look at "Reply ready" to change it later.

## S3.35 First-conversation introduction.

- **Expected:** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:250; apps/web/features/onboarding/components/OnboardingWizard.tsx:45; apps/web/features/chat/pages/WebChatPage.tsx:1323
- **Where to find it:** /welcome step 2: "What do you want to do first?" > "How this works" > a starter prompt, or "Finish" (labels found in the code)
- **Needs:** a new account that has not finished onboarding
- **Steps:**
  1. As a new account on step 2, click "How this works" and read the points.
  2. Click one starter prompt (or pick a use case and click "Finish").
  3. Look for the chat page opening with the chosen prompt in the message box.
  4. Check that the prompt is not sent until you press send.

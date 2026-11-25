---
id: "PLAN-desktop-003"
type: "test-plan"
title: "Desktop · 3. Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "3"
---
# Desktop · 3. Authentication and onboarding screens

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S3.01 Sign-in screen.

- **Expected:** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- **Code:** done. Evidence moved: apps/web/app/login/page.tsx:51 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:429
- **Where to find it:** Open AGI Desktop > Continue in browser (sign-in screen). On the web, /login > Log in or sign up (labels found in the code)
- **Needs:** an AGI account and a browser on the Mac
- **Steps:**
  1. Open the AGI Desktop app while signed out, so the sign-in screen with the line 'Sign in to' and the button Continue in browser shows.
  2. Click Continue in browser.
  3. In the browser that opens, sign in with your AGI account (email, or a provider).
  4. Return to the Desktop app and wait for the handoff to finish.
  5. Look for a signed-in app: the sign-in screen should be gone. Compare with Expected.

## S3.02 Create-account screen.

- **Expected:** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- **Code:** done. Evidence moved: apps/web/app/signup/page.tsx:43 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:481
- **Where to find it:** Log in or sign up (sign-in screen) > type a new email > Continue (labels found in the code)
- **Needs:** a new email address that has no AGI account
- **Steps:**
  1. On the sign-in screen, find the field labelled Email address.
  2. Type an email address that has no AGI account yet.
  3. Click Continue.
  4. Look for the next step (a code or password step) that a new account goes through. Compare with Expected.

## S3.03 Email verification screen.

- **Expected:** After sign-up the user must confirm their email address on a verification screen before the account is usable.
- **Code:** done. Evidence present: apps/web/features/auth/AuthFlow.tsx:291; apps/web/features/auth/IdentityAuthAdapter.tsx:452
- **Where to find it:** Log in or sign up > new email address > Continue > Confirm your email address (labels found in the code)
- **Needs:** a new email address you can read
- **Steps:**
  1. Sign up with a new email address (see S3.02).
  2. On the next screen, read the heading Confirm your email address.
  3. Open the email inbox and find the message with the code.
  4. Enter the code and confirm, then try to use the app before confirming to see that it is blocked.
  5. Compare with Expected: the account is usable only after the email is confirmed.

## S3.04 Verification-code input.

- **Expected:** A code-entry field accepts an emailed or authenticator code (with resend and one-time-code autofill) and verifies it.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthCodeStep.tsx:154; apps/web/features/auth/IdentityAuthAdapter.tsx:336 (quoted code not found in the file now)
- **Where to find it:** Log in or sign up > email > Continue > Verify this device (code step) (labels found in the code)
- **Needs:** an account whose email you can read
- **Steps:**
  1. Enter an email address of an existing account and click Continue.
  2. On the Verify this device screen, check the inbox for the emailed code.
  3. Type the code into the field labelled Code and click Continue.
  4. Click Resend code and watch for the countdown text Resend code in ... seconds.
  5. Compare with Expected: the code is accepted, and resend works after the countdown.

## S3.06 Password-reset request.

- **Expected:** From sign-in the user can request a password reset and receives a reset code or link by email.
- **Code:** done. Evidence present: apps/web/features/auth/AuthPasswordStep.tsx:103; apps/web/features/auth/IdentityAuthAdapter.tsx:549
- **Where to find it:** Log in or sign up > email > Continue > Forgot password? (labels found in the code)
- **Needs:** an account with a password and an inbox you can read
- **Steps:**
  1. Enter the email of an account that has a password, then click Continue.
  2. On the password screen, click Forgot password?.
  3. Check what message appears and whether a reset email arrives.
  4. Compare with Expected: a reset code or link is sent by email.

## S3.07 Password-reset completion.

- **Expected:** After verifying the reset code the user sets a new password and is signed in.
- **Code:** done. Evidence present: apps/web/features/auth/AuthNewPasswordStep.tsx:107; apps/web/features/auth/IdentityAuthAdapter.tsx:603
- **Where to find it:** Log in or sign up > email > Continue > Forgot password? > emailed code > Continue (new password step) (labels found in the code)
- **Needs:** an account with a password and an inbox you can read
- **Steps:**
  1. Start a reset as in S3.06 and open the reset email.
  2. Enter the code on the reset screen and click Continue.
  3. On the new password screen, type a new password and click Continue.
  4. Compare with Expected: you are signed in with the new password.

## S3.08 Social-provider sign-in choices.

- **Expected:** Sign-in and sign-up offer social providers (e.g. Google, GitHub) that complete sign-in on this surface.
- **Code:** done. Evidence present: apps/desktop/electron/windowPolicy.ts:47
- **Where to find it:** Log in or sign up > Continue with Google (or Continue with GitHub) (labels found in the code)
- **Needs:** an outside account (Google or GitHub)
- **Steps:**
  1. On the sign-in screen, look under the email field for buttons that start with Continue with.
  2. Click Continue with Google (or Continue with GitHub).
  3. Complete the provider's sign-in in the window that opens.
  4. Compare with Expected: the app signs you in and returns you to it.

## S3.09 Enterprise SSO entry.

- **Expected:** A user of an SSO-enabled organization can start enterprise single sign-on from the sign-in screen and land signed in.
- **Code:** done. Evidence moved: apps/desktop/electron/browserSignIn.ts:18 (quoted code not found in the file now); apps/desktop/electron/main.ts:698; apps/web/features/auth/IdentityAuthAdapter.tsx:288; apps/web/app/auth/desktop/DesktopSignInHandoff.tsx:65 (quoted code not found in the file now); apps/web/app/api/auth/desktop/grant/route.ts:19; apps/web/app/api/auth/desktop/redeem/route.ts:38; apps/web/lib/server/desktop-sign-in.ts:56; apps/web/app/auth/desktop/complete/DesktopSignInComplete.tsx:75
- **Where to find it:** Log in or sign up > work email > Continue (web). On AGI Desktop: Continue in browser, then sign in with your organization's single sign-on (labels found in the code)
- **Needs:** an account in an organization that uses single sign-on
- **Steps:**
  1. Enter the work email of an SSO-enabled organization on the Log in or sign up screen.
  2. Click Continue.
  3. Expect to be sent to your organization's sign-in page in the browser; complete it.
  4. Compare with Expected: you land back in the app signed in.

## S3.10 Organization-domain discovery.

- **Expected:** Entering a work email discovers the organization's sign-in by the email domain and routes the user to it.
- **Code:** done. Evidence present: apps/web/features/auth/IdentityAuthAdapter.tsx:288; apps/desktop/electron/browserSignIn.ts:71; apps/web/features/desktop-host/components/DesktopBrowserSignIn.tsx:65
- **Where to find it:** Log in or sign up > type a work email > Continue (labels found in the code)
- **Needs:** a work email of an organization with single sign-on, and a personal email
- **Steps:**
  1. On the Log in or sign up screen, type a work email address of an organization that has its own sign-in.
  2. Click Continue.
  3. Compare with Expected: you are routed to that organization's sign-in page instead of a password screen.
  4. Try a personal address on the same screen and compare: it should show the normal password or code step.

## S3.11 Passkey enrollment.

- **Expected:** A signed-in user can register a passkey for their account and see it listed (with rename/removal).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** electron-build
- **Where to find it:** Settings > Security > Passkeys > Add a passkey (labels found in the code)
- **Needs:** a signed-in account and a Mac or device that supports passkeys
- **Steps:**
  1. Sign in, then open Settings and click Security.
  2. Scroll to the Passkeys section.
  3. Click Add a passkey and complete the system passkey prompt.
  4. Look for the new passkey in the list, with its own rename and remove controls.
  5. Compare with Expected: the passkey is registered and listed.

## S3.12 Passkey sign-in.

- **Expected:** A user with a registered passkey can sign in with it instead of a password or code.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** electron-build
- **Where to find it:** Log in or sign up > Sign in with a passkey or security key (labels found in the code)
- **Needs:** an account with a registered passkey and a passkey-capable device
- **Steps:**
  1. Sign out, then open the sign-in screen.
  2. Type the email of the account that has a passkey, or leave it blank if the button is shown without it.
  3. Click Sign in with a passkey or security key.
  4. Pick the passkey in the system prompt.
  5. Compare with Expected: you are signed in without a password or code.

## S3.13 Multifactor authentication setup.

- **Expected:** A user can enroll an authenticator (QR + setup key, confirm code, backup codes) and from then on sign-in asks for that second factor.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/verify/route.ts:26 (quoted code not found in the file now); apps/web/lib/mfa-policy-gate.ts:79
- **Where to find it:** Settings > Security > Authenticator app > Set up authenticator app (labels found in the code)
- **Needs:** a signed-in account and an authenticator app on a phone
- **Steps:**
  1. Open Settings, click Security, and find the Authenticator app block.
  2. Click Set up authenticator app.
  3. Add the shown key or QR code to an authenticator app on your phone, then type the six-digit code.
  4. Click Enable two-factor to confirm.
  5. Sign out and sign in again: a second-factor step should appear. Compare with Expected.

## S3.14 Multifactor challenge.

- **Expected:** At sign-in an account with MFA is challenged for its second factor (with alternatives such as backup codes) before a session is issued.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/verify/route.ts:26 (quoted code not found in the file now); apps/web/lib/mfa-policy-gate.ts:79
- **Where to find it:** Log in or sign up > email > Continue > password (or code) > Confirm it is you (labels found in the code)
- **Needs:** an account with two-factor on and its authenticator app
- **Steps:**
  1. With two-factor on (S3.13), sign out and sign in with the email and password.
  2. Read the Confirm it is you screen and the factor it asks for.
  3. Click Use a backup code to see the alternative, then go back and use the authenticator code.
  4. Compare with Expected: the session starts only after the second factor.

## S3.15 Recovery-code display and download.

- **Expected:** When MFA is enabled (or codes are regenerated) the user is shown one-time recovery codes once and can copy, print or download them.
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/TwoFactorEnrollment.tsx:448; apps/web/app/api/settings/2fa/backup-codes/route.ts:45 (quoted code not found in the file now)
- **Where to find it:** Settings > Security > Authenticator app > Set up authenticator app (codes appear after the code is accepted) (labels found in the code)
- **Needs:** an account where two-factor is being set up, and an authenticator app
- **Steps:**
  1. Finish the two-factor setup in S3.13 by entering a valid code.
  2. Read the Backup codes list that appears.
  3. Click Copy codes, Download codes or Print codes, and check each result.
  4. Tick I have saved these backup codes somewhere safe and click Done.
  5. Compare with Expected: the codes are shown once and cannot be read again.

## S3.16 Account-recovery flow.

- **Expected:** A user who has lost their password, email or second factor can start and complete an account-recovery flow that restores access.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthSecondFactorStep.tsx:130 (quoted code not found in the file now); apps/web/features/auth/AuthPasswordStep.tsx:96 (quoted code not found in the file now); apps/web/app/recover/page.tsx:37; apps/web/lib/support/tickets/recovery.ts:69; apps/web/lib/support/tickets/recovery.ts:55; apps/web/lib/support/tickets/recovery.ts:130; apps/web/lib/support/tickets/recovery.ts:148; apps/web/features/admin/components/SupportTicketQueuePanel.tsx:254
- **Where to find it:** Log in or sign up > email > Continue > Enter your password > Can’t reach this email? (or Lost the device with your codes? on the Confirm it is you step) (labels found in the code)
- **Needs:** an account you can no longer fully sign in to
- **Steps:**
  1. On the password screen, click Can’t reach this email?.
  2. Choose what you lost from the list (password, email access, or two-factor device and backup codes).
  3. Fill in the text box to describe what happened and submit.
  4. Compare with Expected: you see a confirmation that the request was sent.

## S3.17 Account-linking flow.

- **Expected:** A signed-in user can link another sign-in method (e.g. Google, GitHub) to the same account and see or unlink linked methods.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/SecuritySection.tsx:126 (quoted code not found in the file now); apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216 (quoted code not found in the file now)
- **Where to find it:** Settings > Security > Sign-in methods > Connect (labels found in the code)
- **Needs:** an outside account (Google or GitHub) to link
- **Steps:**
  1. Sign in, open Settings, and click Security.
  2. Find the Sign-in methods block.
  3. Click Connect on a provider such as Google, and finish the outside sign-in.
  4. Check that the row now shows the account and a Disconnect button.
  5. Click Disconnect and confirm, then compare with Expected.

## S3.18 Conflicting-account resolution.

- **Expected:** When sign-up or provider sign-in hits an existing account (or sign-in hits none), the user is told and offered the right path (sign in instead, or create).
- **Code:** done. Evidence moved: apps/web/features/auth/AuthEmailStep.tsx:80 (quoted code not found in the file now); apps/web/features/auth/IdentityAuthAdapter.tsx:301 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/web/features/auth, apps/web/app/login and apps/web/app/signup for already exists, already registered, already linked, no account, not registered, sign in instead and sign up instead; no matching copy was found. The cited lines (AuthEmailStep.tsx:80, IdentityAuthAdapter.tsx:301) hold no such message.
- **Needs:** an existing account and a second email address

## S3.19 Terms-acceptance screen.

- **Expected:** Before first use the user reviews and accepts the current Terms (versioned), acceptance is recorded, and a terms change re-prompts.
- **Code:** done. Evidence present: apps/web/lib/server/terms.ts:12; apps/web/lib/server/terms.ts:93; apps/web/app/login/complete/page.tsx:109
- **Where to find it:** Log in or sign up > new email > Continue (sign-up gate on /signup shows the I agree to the checkbox) (labels found in the code)
- **Needs:** a new email for sign-up; a re-prompt needs a Terms version change, which you cannot cause from the UI
- **Steps:**
  1. Sign up with a new email (S3.02) and reach the sign-up terms gate.
  2. Read the line I agree to the Terms of Service and Privacy Policy.
  3. Check that the continue button stays disabled until the box is ticked.
  4. Tick the box and continue.
  5. For a re-prompt, sign in to an account whose terms need review: the Sign out button on the review screen appears. Compare with Expected.

## S3.21 Profile setup.

- **Expected:** During onboarding the user sets up basic profile details (at least the name the assistant uses) and they are saved to the account.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:159; apps/web/features/onboarding/lib/onboarding-preferences.ts:65
- **Where to find it:** Sign in as a new account > Welcome screen (/welcome) > Preferred name (labels found in the code)
- **Needs:** a new account (first run)
- **Steps:**
  1. Sign in with a new account so the Welcome setup opens.
  2. Type your name in the Preferred name field.
  3. Click Continue, then pick a role and a first use (S3.23).
  4. Open Settings > General and check that the name shows up.
  5. Compare with Expected: the name is saved to the account.

## S3.23 Role or use-case selection.

- **Expected:** Onboarding asks the user their role or intended use and uses the answer (e.g. to tailor replies or suggestions).
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:172; apps/web/features/onboarding/components/OnboardingWizard.tsx:217; apps/web/features/onboarding/lib/onboarding-preferences.ts:65
- **Where to find it:** Sign in as a new account > Welcome screen (/welcome) > What best describes your work? > Continue > What do you want to do first? (labels found in the code)
- **Needs:** a new account (first run)
- **Steps:**
  1. On the Welcome screen, type a name and open the What best describes your work? list.
  2. Pick one role, then click Continue.
  3. On What do you want to do first?, pick one option such as Write and debug code.
  4. Read the starter prompts shown for that option, then click Finish.
  5. Compare with Expected: the first chat reflects the chosen use.

## S3.24 Personalization setup.

- **Expected:** Onboarding lets the user set personalization (name to use, what they do, preferred style) that then shapes replies.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:159; apps/web/features/onboarding/components/OnboardingWizard.tsx:45; apps/web/features/onboarding/lib/onboarding-preferences.ts:65
- **Where to find it:** Settings > Personalization > Response style (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and click Personalization.
  2. Set Response style, Response length and Technical level.
  3. Send a question in a new chat.
  4. Compare the reply with the chosen style and length.

## S3.26 Import-from-another-assistant flow.

- **Expected:** The user can bring memories or history over from another assistant (ChatGPT, Claude, Gemini) through a guided import flow.
- **Code:** done. Evidence moved: apps/web/features/settings/components/ImportMemoryDialog.tsx:34; apps/web/features/settings/components/ImportMemoryDialog.tsx:81 (quoted code not found in the file now); apps/web/app/api/memory/import/route.ts:192
- **Where to find it:** Settings > Personalization > Import memory from other AI providers > Start import (labels found in the code)
- **Needs:** an account on another assistant to copy memories from
- **Steps:**
  1. Open Settings, click Personalization, and find the row Import memory from other AI providers.
  2. Click the import button for that row, then pick a source (ChatGPT, Claude, Gemini, Copilot or Other).
  3. Click Copy prompt and paste the prompt into the other assistant; then paste or upload its answer.
  4. Review the preview list, select items, and click Start import.
  5. Compare with Expected: the chosen memories appear in your saved memories.

## S3.27 Recommended-app connection flow.

- **Expected:** New users are shown a few recommended apps/connectors (e.g. based on their role) and can connect them in a guided flow.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:309; apps/web/features/settings/components/WebSettingsModal.tsx:337
- **Where to find it:** not found in the code. Searched apps/web for recommend (onboarding, connectors, settings, chat); no recommended-app list or guided connector flow was found. WebSettingsModal.tsx lines 309 and 337 only load the Connectors panel through the adapter, with no recommendations.
- **Needs:** a new account

## S3.29 Desktop permission setup.

- **Expected:** The app walks the user through the local permissions it needs (folders, commands, screen control) with guidance, and records the grants.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/ComputerUseSettings.tsx:255; apps/desktop/electron/runtime/systemPermissions.ts:48; apps/web/features/settings/sections/CapabilitiesSection.tsx:213; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:449
- **Where to find it:** Settings > Computer use (AGI Desktop app only) > Allowed apps > Manage (labels found in the code)
- **Needs:** the AGI Desktop app on a Mac
- **Steps:**
  1. In the Desktop app, open Settings and click Computer use.
  2. Read the hint Let AGI see your screen and use the mouse and keyboard in apps you allow.
  3. Look at the Control block with the Any app setting.
  4. Click Manage next to Allowed apps, add an app, and check the list.
  5. When a macOS permission is needed, the Accessibility prompt opens. Compare with Expected: the grants are recorded in the list.

## S3.30 Browser-extension pairing.

- **Expected:** The browser extension can be paired with the desktop app (or account) through a guided code/confirm step, with a way to unpair.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:92; apps/desktop/electron/runtime/dispatcher.ts:3129
- **Where to find it:** Settings > Capabilities > Chrome (labels found in the code)
- **Needs:** Chrome with the AGI extension and the AGI Desktop app on a Mac
- **Steps:**
  1. Open Settings and click Capabilities, then find the Chrome block.
  2. If it says nothing has asked to pair yet, install the extension in Chrome.
  3. In Chrome, open the Extension side panel, choose Connect to Desktop, and type the code the app shows in its dialog.
  4. Check that the block reads Paired and answering.
  5. Click Unpair and confirm Unpair this browser?, then compare with Expected.

## S3.31 Mobile device pairing.

- **Expected:** A phone can be paired with the desktop app by QR or short code, and the pairing is bound to the signed-in account.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/RemoteControlSection.tsx:50 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2659
- **Where to find it:** Settings > Capabilities > Remote Control > Pair a phone (desktop app only, paid plan) (labels found in the code)
- **Needs:** the AGI desktop app on a paid plan, a phone with AGI Mobile signed in to the same account, phone camera for the QR code
- **Steps:**
  1. In the AGI desktop app, open Settings and choose Capabilities.
  2. Scroll to the Remote Control section (the section is hidden in a browser and on a Free plan).
  3. Click Pair a phone. A pairing QR code and a short pairing code appear.
  4. On the phone, open AGI Mobile, go to AGI Code, choose Add device, and scan the QR code (or type the pairing code).
  5. Look at the section: it should show the phone as connected (Connected to <phone name>) with a Disconnect phone button, and the pairing should be tied to the same signed-in account. Compare with Expected.

## S3.32 Optional notification setup.

- **Expected:** The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7613; apps/web/features/chat/pages/WebChatPage.tsx:2279; apps/desktop/electron/permissionPolicy.ts:24
- **Where to find it:** Chat > long-running answer > banner 'Get notified when the response is ready.' > Enable (or the X to dismiss). To change later: Settings > Notifications > Browser notifications (labels found in the code)
- **Needs:** none (a request long enough that the answer is still generating; the banner does not show again once the browser permission is decided or the banner was dismissed)
- **Steps:**
  1. Sign in and start a new chat.
  2. Send a request that takes a while (for example a long answer or an agent work task).
  3. While the response is still generating, look for the banner 'Get notified when the response is ready.' under the top bar of the chat.
  4. Click Enable to get the browser permission prompt, or click the X labelled 'Dismiss notification prompt' to hide it.
  5. Open Settings > Notifications and find Browser notifications to turn it on or off. Compare with Expected: the offer is optional and can be declined and changed later.

## S3.35 First-conversation introduction.

- **Expected:** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:250; apps/web/features/chat/pages/WebChatPage.tsx:1323
- **Where to find it:** Sign in with a new account > welcome screen 'What should we call you?' > Continue > 'What do you want to do first?' > a prompt under 'Start with one of these' (or Skip for now) (labels found in the code)
- **Needs:** a brand-new account that has never finished onboarding
- **Steps:**
  1. Sign in with a brand-new account that has not finished onboarding.
  2. On the screen 'What should we call you?', type a name in Preferred name and click Continue.
  3. On 'What do you want to do first?', read the line 'We will suggest a few prompts to get you started.' and the prompts under 'Start with one of these'.
  4. Click one prompt. The app opens a chat with that prompt placed in the message box (it is filled in, not sent).
  5. Look at the chat: it should show the starter prompt ready to send, leading into a first conversation. Compare with Expected. Clicking Skip for now instead opens the chat without a prompt.

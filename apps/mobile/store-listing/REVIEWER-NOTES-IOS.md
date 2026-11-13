# App Review Notes: AGI for iOS

Status: Current
Owner: Mobile lead
Last updated: 2026-11-11
Applies to: `com.agiworkforce.app`, version 0.0.1

Paste the body of this file into the **App Review Information → Notes** field in
App Store Connect. `store-listing/LISTING-METADATA-IOS.json` points
`app_review_information.notes_file` here.

Every statement below is checked against shipped code in `apps/mobile`. When a
behaviour changes, update this file in the same change, App Review reads it as
a factual claim about the binary.

---

## What the app does

AGI is an AI assistant with two independent modes.

**Local Mode (default, no account).** On supported devices, the app uses
Apple Intelligence on the device without a model download. Other devices use a
quantized open-weight model downloaded on first run and executed through
ExecuTorch or llama.rn. Inference happens entirely on-device; no prompt or
response leaves the phone. Chats are stored in a local SQLite database that is encrypted at rest with
SQLCipher; the key lives in the iOS Keychain.

**AGI Cloud (optional, requires sign-in).** Signing in with an AGI account
enables server-side chat and web search on the Free plan, which is open to
anyone who signs in. Requests go to `https://agiworkforce.com` and
`https://api.agiworkforce.com`. This version sells nothing and has no in-app
purchases; see "Purchases: please read" below.

The two modes never mix silently. Local chats are not uploaded, and switching a
conversation to Cloud is an explicit user action.

## How to review it

Before submission, provide Apple an active AGI Cloud review account through
App Store Connect's secure demo-account fields (email and password; sign-in
needs no one-time code). Do not put its credentials in this repository. The account must remain accessible throughout review and
must be able to exercise Cloud chat and web search. The Cloud entry path asks
for age confirmation before sign-in.
That screen first asks iOS for the age range through Declared Age Range (`expo-age-range`) and falls back to typed age if none is shared.

1. **Local Mode requires no account at all.** Launch the app, tap through
   onboarding, and chat. This exercises the core product. On supported devices, onboarding uses the built-in system model without a
   download. Otherwise it downloads a local model over Wi-Fi; please allow
   that to finish, or use **Continue to Cloud** to skip it.
2. **AGI Cloud sign-up is open self-service.** Sign-in uses Clerk's native
   `AuthView` (an in-app native sheet, not a web browser). Cloud chat and web
   search are available on the free tier after sign-in. Use the review account
   supplied in App Store Connect to test these features without relying on
   email verification during review.

## Why the app asks for each permission

Every permission except notifications is requested **on first use, from a user
action**, never on launch and never on screen mount
(`src/features/settings/permissions/registry.ts`). Notification permission is
requested once, after the user signs in to AGI Cloud, because push delivery is
part of what signing in to Cloud enables (`app/_layout.tsx`,
`services/notifications.ts`).
Declining any one of them leaves the rest of the app fully usable. There is also
a Settings → Permissions screen that shows current status for each.

| Permission                                                 | Where it is used                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera (`NSCameraUsageDescription`)                        | Taking a photo to attach to a chat and scanning documents/text for on-device OCR.                                                                                                                                                                                                            |
| Microphone (`NSMicrophoneUsageDescription`)                | Voice input in the chat composer, and live voice mode in an AGI Cloud chat, which streams the microphone to AGI Cloud over WebRTC for the session (`src/features/voice/services/liveVoiceSession.ts`) and saves the transcript to that chat. Declared as Audio Data in the privacy manifest. |
| Speech Recognition (`NSSpeechRecognitionUsageDescription`) | Transcribing that voice input. Uses the on-device iOS Speech framework via `expo-speech-recognition` (`src/features/voice/services/voiceInput.ts`).                                                                                                                                          |
| Photo Library (`NSPhotoLibraryUsageDescription`)           | Choosing an existing image to attach to a chat.                                                                                                                                                                                                                                              |
| Photo Library Add (`NSPhotoLibraryAddUsageDescription`)    | Saving an image the user chooses to save into the photo library (`services/fileCreation.ts`).                                                                                                                                                                                                |
| Face ID (`NSFaceIDUsageDescription`)                       | Optional app lock, opt-in from Settings → Safety & Security (`src/features/auth/hooks/useBiometricGate.ts`). Off by default.                                                                                                                                                                 |
| Calendar / Reminders                                       | Optional. Calendar is read when the user asks about their schedule, and an event is added only after the user confirms it in a chat. Reminders are only written, when the user creates or confirms one (`src/features/reminders/service.ts`); they are never read.                           |
| Translation (no permission prompt)                         | On-device translation through Apple's Translation framework (`native/ios/AGITranslate.swift`). No text is sent to a server.                                                                                                                                                                  |
| Notifications                                              | Optional; used for model-download, reminder and cloud job completion alerts, and for agent actions waiting on the user's approval.                                                                                                                                                           |

The app does **not** link `expo-location` and requests no location permission.
The app contains no HealthKit code and requests no Health permission, the Apple
Health connector was removed in July 2026.

## Purchases: please read

**This version is free and has no in-app purchases. Nothing is sold in the app
and nothing in the app links to a purchase.**

One build-level value decides it: `src/features/billing/storePurchases.json` sets
`"nativePurchases": false`, and
`src/features/billing/nativePurchaseAvailability.ts` exports it as
`NATIVE_PURCHASES_AVAILABLE`, which every purchase path reads. It is fixed at
build time; no server response or over-the-air update can turn it on. With it
false:

- The app shows no purchase, upgrade, top-up, restore-purchases,
  compare-plans or contact-sales control, and no price.
- The app never opens a StoreKit connection.
  `src/features/billing/useMobileIap.ts` picks an inert implementation at build
  time, and `src/features/billing/mobileIapService.ts` refuses catalog and
  verify calls and never reads the App Store storefront, so the app never calls
  `/api/mobile/iap/*`.
- The purchase client library `expo-iap` (5.8.3, `package.json`) is still linked
  into the binary and its config plugin is still registered in `app.config.js`,
  so the StoreKit framework is present, but nothing calls it.
- On the server, the `/api/mobile/iap/*` routes (owner
  `apps/web/lib/server/mobile-iap-catalog.ts`) stay off unless the deployment
  sets `MOBILE_IAP_ENABLED`. This version never calls them either way.

What you will see under **Settings → Subscription**: a screen titled **Plan**
(`src/features/settings/cloud-billing/index.tsx`, the
`if (!NATIVE_PURCHASES_AVAILABLE)` branch) with:

- **Current plan**, and the renewal or end date if the plan has one.
- **Billing**, as plain text with no link, only for an account that already
  holds a paid plan: **Managed on the web**, **By your organization**, or
  **Managed where you subscribed**. A Free-plan account gets no Billing row.
- **What your plan includes**, which lists the current plan's features only.
- **Usage**, the account's usage, read natively from the usage API.
- **Help with your plan**, which opens the in-app support screen.

How a locked feature is presented: when something is outside the account's
plan, the app says it "isn’t included in your plan" (or that the plan's
allowance is used up for now) and offers **Close**, plus **Choose a standard
model** when the locked item is a model, with no upgrade button, plan comparison
or link
(`src/features/chat/components/PaywallBottomSheet.tsx`). Elsewhere the same rule
holds: a model the plan does not include is not listed in the model picker, and
other plan-locked features are described as not included, never as something to
buy.

Paid plans exist for the AGI Cloud web product. An account that already holds a
paid plan gets that plan's access after signing in here.
The app neither sells nor advertises those plans, names no price, and has no
link to where they are sold.

The review account needs no purchase setup: there are no sandbox purchases to
make, no products to load and nothing to restore.

Before submitting (operator step, not for the reviewer): do not attach in-app
purchase products to this version in App Store Connect. Selling in the app needs
`nativePurchases` set to `true`, a new build and a new review.

## External links

This section identifies website, legal and support destinations in the
current mobile source. `openExternalUrl` (`lib/safeOpenURL.ts`) accepts only
reviewed HTTPS hosts; other link handlers are described separately below.

**A. Account destinations.** These account links render in this version:

| #   | Control                                                                                 | Opens                                                     | Call site                                                       | Who sees it                                                                                                      |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A1  | **Continue** on the "Change your email" alert                                           | `agiworkforce.com/settings/account`                       | `src/features/settings/cloud-account/index.tsx`                 | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens anything. |
| A2  | **Advanced Account Security**, **Add or remove a sign-in method**, **Open Web account** | `agiworkforce.com/settings/security`, `/settings/account` | `src/features/settings/account-security/index.tsx`              | Any signed-in Cloud account. Opens in an in-app Safari sheet.                                                    |
| A3  | **Turn on** in the two-factor banner                                                    | `agiworkforce.com/settings/security`                      | `src/features/settings/account-security/WorkspaceMfaBanner.tsx` | A member of a workspace that requires two-factor authentication. In-app Safari sheet.                            |
| A4  | A security recommendation on the workspace administration screen                        | an `agiworkforce.com/workspace/*` admin page              | `src/features/team/WorkspaceAdministration.tsx`                 | A workspace administrator. In-app Safari sheet.                                                                  |

No link in the app opens a page about pricing, billing, invoices, sales or
upgrades.

**B. Non-billing destinations.** The sign-in and account-creation flows open
Terms, Privacy, data-use and acceptable-use pages on `agiworkforce.com`; the
account Terms confirmation also links to Terms and Privacy
(`app/(auth)/login.tsx`, `src/features/auth/components/MobileSignUp.tsx`).
Settings → Privacy links to Privacy, Data rights requests and Terms
(`src/features/settings/cloud-privacy/index.tsx`). Settings → Personalization links its
custom-instructions helper to the acceptable-use page
(`src/features/settings/personalization/index.tsx`). Password recovery opens
`agiworkforce.com/login`, whose password step offers Forgot password, and
account recovery opens `agiworkforce.com/recover`
(`app/(auth)/reset-password.tsx`). The desktop-pairing safety disclosure opens
`agiworkforce.com/security`
(`src/features/companion/components/PairingRiskDisclosure.tsx`). When the
server refuses a locked or suspended account, the alert's **Open on the web**
opens the reset-password or appeal page (`services/api.ts`), and the updated
Terms notice opens `/terms` (`services/termsNotice.ts`).

**C. Opened in an in-app Safari sheet, not the browser.** These go through
`openInAppBrowser` (`lib/safeOpenURL.ts`), which presents
`SFSafariViewController` as a page sheet rather than leaving the app: Settings →
About opens `agiworkforce.com`, `/privacy`, `/terms`, `/acceptable-use`, `/help`
and `/status` (`app/(app)/about.tsx`); Settings opens the Help Center
(`src/features/settings/index.tsx`); Settings → Permissions opens a help article
(`src/features/settings/permissions/index.tsx`); the first-run disclosure opens
`/privacy` and the India notice at `/privacy/india`
(`src/features/onboarding/components/FirstRunDisclosureModal.tsx`); the cloud
provider consent opens `/privacy` and the provider list at `/subprocessors`
(`src/features/settings/cloud-privacy/NamedProviderConsentModal.tsx`,
`services/providerConsent.ts`); and a notification whose target has no screen in
the app opens its web page (`services/notifications.ts`). A link in assistant
output, and a map place or route card, also opens in the sheet and is never
auto-followed; a non-`http(s)` scheme requires a confirmation alert first
(`src/features/chat/components/MarkdownInline.tsx`,
`src/features/chat/components/InteractiveCardBlock.tsx`).

**D. Not `agiworkforce.com`, or not a web page.** Settings → Connectors
authorizes a connector in an in-app authentication session
(`services/connectors.ts`, `authorizeConnectorInApp`). The Connect GitHub
button in the new cloud code session sheet runs the GitHub App install from the
app (`src/features/cloud-code/githubInstall.ts`). It first opens
`agiworkforce.com/github/connect`, which names the requesting AGI account before
GitHub, and always returns through the verified link
`https://agiworkforce.com/github/installed`: inside an authentication session on
iOS 17.4 and later, as a universal link in Safari on older iOS, and as a verified
App Link from a browser tab on Android. The app then names the GitHub account and
asks before linking it (`app/(app)/github/installed.tsx`). The legal screen
`app/legal/article-50.tsx` opens the EU AI Act text at
`artificialintelligenceact.eu`. A cloud task that asks the user to open a link
shows an **Open link** button for it
(`src/features/tasks/components/CloudRunInputForm.tsx`). The remaining
`Linking.openURL` targets are not web pages: `mailto:` to
`support@agiworkforce.com` (`app/(app)/about.tsx`, `services/contentReport.ts`)
and to the account's own address for the desktop link
(`src/features/companion/components/DesktopSetupChecklistView.tsx`), an
`otpauth:` link to an authenticator app
(`src/features/settings/account-security/TwoFactorSection.tsx`), and the
iOS/Android device-settings intents.

**E. Present in source but not rendered in this version.** These controls
exist in the source for a build that sells through the App Store. None of them
renders while `NATIVE_PURCHASES_AVAILABLE` is `false`:

- `src/features/settings/cloud-billing/index.tsx`: **View invoices**
  (`agiworkforce.com/billing`), **Workspace administration**
  (`agiworkforce.com/settings/team`), **Manage on web** (the subscription-owner
  alert), **Help with a purchase** (`agiworkforce.com/help`), the Terms and
  Privacy links under the purchase list, and the Stripe billing-portal link,
  which is also dead behind `FEATURES.billing === false`. All of them are on the
  purchase screen, which this version never draws: Settings → Subscription
  returns the Plan screen described above first.
- `src/features/chat/components/PaywallBottomSheet.tsx`: **Contact Sales**
  (`agiworkforce.com/contact-sales`). The sheet draws no upgrade, plan or sales
  button while `NATIVE_PURCHASES_AVAILABLE` is `false`.
- `app/(app)/settings/workspace.tsx`: **Create on web** and **Open workspace
  settings on the web** (`agiworkforce.com/settings/team`). Both, like the web
  billing links above, require `useWebBillingLinksAllowed`
  (`src/features/billing/webBillingLinks.ts`) to read a US App Store storefront,
  and this version never reads the storefront.

If any remaining link is a problem under Guideline 3.1.1, please tell us which
one and we will remove or gate it.

## Account deletion

Required by Guideline 5.1.1(v). Deletion is requested in the app and needs no
support ticket.

**Settings → Account → Delete Account** → confirmation alert → identity check →
`DELETE /api/user/delete-account`. Sources:
`src/features/settings/cloud-account/index.tsx` (screen),
`src/features/settings/cloud-account/deleteAccountConfirmation.ts` (the
confirmation text) and `apps/web/app/api/user/delete-account/route.ts` (server).

What the request does:

- It schedules deletion of the AGI Cloud account and its cloud data and returns
  a cancellation deadline 24 hours later. The app shows the deadline and signs
  out. Signing back in before the deadline lets the person cancel it from the
  same screen.
- After the deadline a daily job ends any Stripe billing still live, erases the
  account's data and stored files, and deletes the sign-in identity, so erasure
  can finish later than the deadline. The scheduling receipt says this and does
  not claim that erasure is complete.
- Data under an active legal hold, and the records the privacy policy lists as
  kept after deletion (https://agiworkforce.com/privacy), are kept. The
  confirmation says so before the person confirms.
- On-device Local Mode data is not touched. It is cleared separately from
  Settings → Data Controls, which also offers a full local export (chats,
  memory, settings, installed models) that runs entirely on the device.

A Free-plan account is scheduled straight away. A paid plan does not stop the
deletion either:

- **A paid plan that still renews, bought on the web.** Scheduling the deletion
  also sets the plan not to renew, so no renewal can charge after the account
  is gone. If the person undoes the deletion inside the window, the renewal is
  turned back on.
- **A paid plan that still renews, bought through Apple or Google** (an older
  store purchase; this version sells nothing). We cannot cancel it, so the
  deletion is scheduled and the receipt says that the store keeps billing until
  the person cancels there, with a link to the store's own subscription
  settings.
- **A paid plan already cancelled**: deletion is scheduled straight away.

In every paid case the remaining paid time ends when erasure runs, and the
confirmation and the receipt both say that the unused time is not refunded.

When the server refuses, nothing is scheduled and the app shows the server's
reason:

- **A payment still being collected**: deletion is refused until it is settled.
- **A plan change already scheduled** on a web plan: the message asks the person
  to keep their current plan in Billing first.
- **A plan billed by invoice, or one whose purchase cannot be identified**: the
  message asks the person to contact support.
- **The only owner of a workspace**: the message names the workspace and asks
  for another owner or for the workspace to be deleted first.

## Privacy and data collection

- Local Mode collects no personal data.
- Signing in to AGI Cloud collects, linked to the account and never for
  tracking, the types the privacy manifest declares: email address, name (if
  the sign-in method provides one), user ID, device ID, and the content of
  Cloud chats (text, live-voice audio, attached photos), all for app
  functionality; and product interaction, for analytics, governed by the
  **Product analytics** switch in Settings → Privacy
  (`src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup.tsx`).
- `NSPrivacyTracking` is `false`. The app contains no IDFA/AdSupport code, no
  ad SDK, and no cross-app tracking.
- The privacy manifest is generated from `ios.privacyManifests` in
  `app.config.js`; the submission copy is `store-listing/ios/PrivacyInfo.xcprivacy`.
- Privacy policy: https://agiworkforce.com/privacy

## AI content disclosure

Three separate mechanisms, described exactly so you can check each one:

- **First run** shows a blocking disclosure, "Before you start", before the
  app is usable. It states "You are chatting with an AI, and it can make
  mistakes.", says what Local Mode and AGI Cloud collect, and links to the
  Privacy Policy and the India DPDP notice. **Why we show this** expands the EU
  AI Act Article 50(1) text verbatim
  (`src/features/onboarding/components/FirstRunDisclosureModal.tsx`, copy from
  `composeShortFirstRunDisclosure` in
  `packages/contracts/compliance/src/article50-disclosure.ts`). Acceptance is
  recorded against a hash of the copy (`recordDisclosureAcceptance`).
- **Every completed assistant turn that records its model** carries a
  provenance footer naming its source: "AGI Cloud · <model name>" (or "AGI
  Cloud" alone when the model is not known), or "Local Mode · <model name>" for
  on-device inference. The turn's role label is the model name or "AGI", never a
  person's name (`src/features/chat/components/ProvenanceFooter.tsx`, rendered
  from `getProvenance` in `src/features/chat/components/MessageBubble.tsx`). The
  footer names the system rather than printing the literal words "AI-generated".
- **The Data Controls export** (Settings → Data Controls → Export Local Data)
  wraps each conversation transcript in a machine-readable Article 50(2)
  provenance marker naming the provider and model
  (`buildMarkedTranscript` in `services/dsarExport.ts`). The ordinary conversation export and share
  in the chat screen, PDF, plain text, Markdown, copy-to-clipboard
  (`services/fileCreation.ts`), carries role labels only and does **not** add
  that marker. We state the difference here rather than let the export marking be
  read wider than the code supports.

We do not claim full compliance with India's DPDP Act 2023. The itemised notice
is published at https://agiworkforce.com/privacy/india, consent withdrawal and
the export/delete controls described above are implemented, and the obligations
we have not met, verifiable parental consent under s.9, notice in Eighth
Schedule languages under s.6(4), and India data residency, are listed at
https://agiworkforce.com/trust.

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `Info.plist`. All cryptography is
Apple-provided: TLS via URLSession, the Keychain via `expo-secure-store`,
`SecRandomCopyBytes` via `expo-crypto`, and SQLCipher compiled against Apple
CommonCrypto (`-DSQLCIPHER_CRYPTO_CC`). The app ships no proprietary or
non-standard cipher.

## Contact

- App Review contact: `review@agiworkforce.com`
- User support: `support@agiworkforce.com` / https://agiworkforce.com/support

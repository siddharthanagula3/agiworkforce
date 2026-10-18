# App Review Notes: AGI for iOS

Status: Current
Owner: Mobile lead
Last updated: 2026-10-17
Applies to: `com.agiworkforce.app`, version 0.0.1

Paste only the text between the store-review markers below into **App Review Information → Notes** in App Store Connect. The excerpt is limited to 4,000 UTF-8 bytes. The rest of this canonical file is the operator and source-owner record; do not paste the entire file. `LISTING-METADATA-IOS.json` points here and names the excerpt section.

## Store-ready review notes

<!-- BEGIN STORE REVIEW NOTES -->

AGI Workforce has separate Local and AGI Cloud modes. This is a free-first release: there are no in-app purchases, paid upgrades, credit top-ups or external checkout links. Existing account entitlements and server usage limits remain in effect.

LOCAL REVIEW

1. Launch the app and complete the age and AI disclosures. Choose Local Mode; no account is required.
2. Supported devices can use a system model. Otherwise, download a local model over an internet connection and wait for setup to finish. Model availability depends on the device.
3. Send a Local chat message, then test with airplane mode. Local inference runs on-device and Local messages are not uploaded automatically. Local chats are encrypted on the device.

CLOUD REVIEW

1. Choose Continue to Cloud or switch to AGI Cloud. Confirm age eligibility, sign in and accept the current Terms.
2. Use the review account provided in App Store Connect's secure demo-account fields. Reviewer credentials must be supplied before submission and are not stored in this document. Free Cloud chat and web search require internet and remain subject to usage limits; no upgrade code or test purchase is needed.
3. Send a message and try web search. Cloud messages and selected attachments are sent to AGI Cloud and the model provider serving the request. Switching modes does not upload Local history. A signed-in user can separately confirm Settings > Data Controls > Sync Local Chats to AGI Cloud to copy conversation titles and message text; attachments and memory facts stay on the device.

PERMISSIONS AND SAFETY
Camera and photo access are for attachments and document scanning; microphone/speech access is for voice input. Dictation requires on-device recognition and uploads no microphone audio. For live Cloud voice, AGI Cloud sets up the call, then microphone audio streams directly to OpenAI and the transcript is saved to the Cloud chat. Read aloud uses a device voice in Local Mode; in Cloud mode, selected text goes through AGI Cloud to OpenAI for speech synthesis. Calendar/reminders and biometric app lock are optional. Notifications are requested after Cloud sign-in for task alerts. Permissions can be declined; text chat remains usable. No location, Health or advertising-tracking permission is requested. Use Report on an assistant response to flag harmful AI output.

DELETION AND EXPORT
Settings > Account > Delete Account requests deletion of the Cloud account and its data. Erasure is normally scheduled 24 hours later; sign back in to cancel before erasure begins. Local data is separate: Settings > Storage > Delete all local data removes it after confirmation. Settings > Data Controls > Export Local Data exports on-device information without uploading it.

Privacy: https://agiworkforce.com/privacy
We do not claim full DPDP compliance; open gaps: https://agiworkforce.com/trust
Support: support@agiworkforce.com
iOS translation uses the on-device Apple Translation framework. Encryption is declared exempt in Info.plist (ITSAppUsesNonExemptEncryption=false).
<!-- END STORE REVIEW NOTES -->

## Operator record and source disclosures

The operator record below is checked against source code in `apps/mobile`. When a
behaviour changes, update this file in the same change, App Review reads it as
a source record; the marked excerpt above describes this free-first binary.

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
enables server-side chat, web search, and, on paid plans, image generation.
Requests go to `https://agiworkforce.com` and `https://api.agiworkforce.com`.
Cloud is in public alpha and its Free plan is open to eligible signed-in users,
with no invite code or waitlist. This free-first release offers no in-app
purchases, paid upgrades or credit top-ups. Existing account entitlements are
honored; no upgrade access code or sandbox purchase is needed for this review.

The two modes never mix silently. Local chats are not uploaded, and switching a
conversation to Cloud is an explicit user action.

## How to review it

Before submission, provide Apple an active AGI Cloud review account through
App Store Connect's secure demo-account fields. Do not put its credentials in
this repository. The account must remain accessible throughout review and
must be able to exercise Cloud chat and web search. The Cloud entry path asks
for age confirmation before sign-in.

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

| Permission                                                 | Where it is used                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera (`NSCameraUsageDescription`)                        | Taking a photo to attach to a chat and scanning documents/text for on-device OCR.                                                                                                                                                                                                                                               |
| Microphone (`NSMicrophoneUsageDescription`)                | Voice input in the chat composer, and live voice mode in an AGI Cloud chat, which uses AGI Cloud to set up the session, then streams microphone audio directly to OpenAI over WebRTC (`src/features/voice/services/liveVoiceSession.ts`) and saves the transcript to that chat. Declared as Audio Data in the privacy manifest. |
| Speech Recognition (`NSSpeechRecognitionUsageDescription`) | Transcribing that voice input. Uses the on-device iOS Speech framework via `expo-speech-recognition` (`src/features/voice/services/voiceInput.ts`).                                                                                                                                                                             |
| Photo Library (`NSPhotoLibraryUsageDescription`)           | Choosing an existing image to attach to a chat.                                                                                                                                                                                                                                                                                 |
| Face ID (`NSFaceIDUsageDescription`)                       | Optional app lock, opt-in from Settings → Safety & Security (`src/features/auth/hooks/useBiometricGate.ts`). Off by default.                                                                                                                                                                                                    |
| Calendar / Reminders                                       | Same optional device-context connector, for "what's on my calendar" style questions. Off by default.                                                                                                                                                                                                                            |
| Translation (`NSTranslationUsageDescription`)              | On-device translation through Apple's Translation framework (`native/ios/AGITranslate.swift`). No text is sent to a server.                                                                                                                                                                                                     |
| Notifications                                              | Optional; used for background task and cloud job completion alerts.                                                                                                                                                                                                                                                             |

The app does **not** link `expo-location` and requests no location permission.
The app contains no HealthKit code and requests no Health permission, the Apple
Health connector was removed in July 2026.

## Purchases: please read

**This release does not offer in-app purchases.**

`FEATURES.nativePurchases=false` in `apps/mobile/lib/v1FeatureFlags.ts` prevents
the native store connection from mounting and hides purchase, restore, upgrade,
credit top-up, access-code, waitlist, Contact Sales and plan-comparison controls.
Billing shows the current account plan/status and usage without a checkout.
Existing account entitlements and server limits remain in effect. A server
catalog cannot override the binary gate.

Current release gates: `src/features/settings/cloud-billing/index.tsx:324`
returns the read-only Billing screen; `src/features/settings/plans/index.tsx:65`
limits the direct Plans route to the current account plan.

### Retained paid-release implementation, inactive in this release

The following source inventory and sandbox procedures are for a future release
that explicitly enables native purchases. They are not instructions for this
free-first submission. StoreKit subscriptions and consumable credit top-ups
remain implemented in source; no live product or test-account setup is claimed.

Retained source inventory:

- `expo-iap` 5.8.1 is a dependency (`package.json`) and is registered as a config
  plugin (`app.config.js`), so the StoreKit 2 framework is linked into the app.
- The purchase flow is `src/features/billing/useMobileIap.ts`, rendered by
  `src/features/settings/cloud-billing/index.tsx`.
- Four subscriptions in one subscription group (Basic, Pro, Max 5x, Max 20x,
  each monthly) and four consumable credit top-ups. The products, their group
  and their levels are listed in `docs/runbooks/mobile-store-products.md`.

Future paid-release review procedure:

1. Sign in with the review account supplied in App Store Connect and open
   Settings → Billing.
2. Paid upgrades are opening in stages. The review account must either have
   upgrade access already, or use the access code given in the App Store
   Connect review notes: enter it under **Have an upgrade access code?** and tap
   **Unlock upgrades**. The code only lets the account see and buy store
   products; it grants no paid entitlement. An account without access sees
   **Join upgrade waitlist** instead of products.
3. The plans appear with the App Store's own localized prices. Tap one; the
   StoreKit sheet shows the exact charge. The app never shows a price of its
   own.
4. After the purchase the app sends the signed transaction to
   `/api/mobile/iap/verify`. Access is granted only after the server verifies
   it with Apple, and the transaction is finished only after that.
5. With a paid plan active, **Usage top-ups** lists the consumables. Purchased
   credits do not expire.

UI states in the retained paid-release flow, not this release:

- The plan-change row may be labelled **Upgrade plan**, **Adjust plan**, or
  **Choose plan**, depending on the current subscription. During catalog
  loading the screen shows **Loading native purchases**; Team and Enterprise
  accounts may also see **Workspace administration**.
- **Changing plans.** All four subscriptions are in one group, so a second
  purchase is a plan change, never a second subscription. The screen marks the
  current plan, labels every other plan **Upgrade** or **Downgrade**, and says
  that an upgrade starts right away and a downgrade starts on the next renewal
  date. A scheduled downgrade is shown as "Changing to … at renewal".
- **Ask to Buy.** A purchase that needs a family organiser's approval is shown
  as **Waiting for approval**, not as an error. When it is approved the
  purchase completes on its own, including when the app was closed: the server
  grants it from the App Store Server Notification, and the app finishes the
  transaction the next time Billing opens.
- **Restore purchases** is always present and re-sends existing transactions
  for verification. It never charges.
- A subscription bought on another platform is identified as managed elsewhere
  and the app does not offer a second recurring purchase. Such an account can
  still buy credit top-ups here.
- **Deleting this app does not cancel your plan** is shown to store
  subscribers, with the route to the App Store's subscription settings once the
  listing is live.

After the binary gate is enabled in a future release, every purchase path also requires a server answer. The app asks
`GET /api/mobile/iap/catalog` and offers nothing unless the response says
`enabled: true`. The server owner is `apps/web/lib/server/mobile-iap-catalog.ts`,
which requires the deployment to set `MOBILE_IAP_ENABLED` and to map product
keys to App Store product IDs in `MOBILE_IAP_APPLE_PRODUCT_IDS_JSON`. If you see
no products, the screen shows **"Purchases are not available right now"** with
one of these reasons, quoted exactly:

- **"Native purchases are not enabled for this deployment."** The deployment
  flag is off.
- **"App Store products have not been registered for this build."** The flag is
  on but no product is mapped.
- **"Paid upgrades are opening in stages. This account needs upgrade access
  before plans and credits can be bought here."** The account has no upgrade
  access; see step 2.

Purchases made during review are App Store sandbox purchases and are not
charged. The production service verifies a sandbox-signed transaction with
Apple's sandbox certificate chain and grants it to the review account, only if it has
been allowed to receive test purchases for that paid review. For any other account
the same purchase is refused and the Billing screen says **"This purchase was
made in the store's test environment, which this account is not set up to use.
Nothing was charged."** Server-side verification (`/api/mobile/iap/verify`) also
rejects unregistered products.

Before submitting a future paid release (operator steps): the review account
must be allowed to receive test purchases (operator dashboard, Flags, Store test
purchases; `docs/runbooks/mobile-store-products.md` section 4.1). This tree cannot
confirm that allowance, the live `MOBILE_IAP_ENABLED` state or the App Store
Connect product records; all three must be in place before that paid build is
submitted, and the purchase, restore, renewal, refund, plan-change and Ask to
Buy paths tested with sandbox accounts.

## External links

This section identifies website, store, legal and support destinations in the
current mobile source. `openExternalUrl` (`lib/safeOpenURL.ts`) accepts only
reviewed HTTPS hosts; other link handlers are described separately below.

**A. Billing and account-management destinations (the Guideline 3.1.1 surface).**
The table retains account and billing link ownership. Rows A1–A5 belong to
the paid Billing/paywall flow and are hidden by `FEATURES.nativePurchases=false`.
Other account/workspace destinations remain subject to their stated conditions.

| #   | Control                                               | Opens                                                     | Call site                                                 | Who sees it                                                                                                                                                                                                             |
| --- | ----------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **View invoices** (Settings → Billing)                | `agiworkforce.com/billing`                                | `src/features/settings/cloud-billing/index.tsx:825`       | Hidden in this free-first release. In the retained paid flow, only website-billed accounts get this row.                                                                                                                |
| A2  | **Workspace administration** (Settings → Billing)     | `agiworkforce.com/settings/team`                          | `src/features/settings/cloud-billing/index.tsx:531`       | Hidden in this free-first release. Retained paid-flow condition: Team and Enterprise plans.                                                                                                                             |
| A3  | **Manage on web** (subscription-owner alert)          | `agiworkforce.com/settings/billing`                       | `src/features/settings/cloud-billing/index.tsx:237`       | Accounts whose subscription is recorded as bought on our website or provisioned by an employer. For an Apple- or Google-recorded subscription the same button opens that store's own subscription page instead.         |
| A4  | **Contact Sales** (chat paywall sheet)                | `agiworkforce.com/contact-sales?plan=…`                   | `src/features/chat/components/PaywallBottomSheet.tsx:132` | Only when the gated feature needs Team or Enterprise. Not reachable from the Billing screen: `getNextUpgradeTier` returns only self-serve individual tiers (`packages/contracts/types/src/billing-catalog.ts:362-375`). |
| A5  | **Help with a purchase** (Settings → Billing)         | `agiworkforce.com/help?q=purchase+billing+credits+refund` | `src/features/settings/cloud-billing/index.tsx:832`       | Hidden in this free-first release. Retained paid-flow destination: purchase support guidance.                                                                                                                           |
| A6  | **Continue** on the "Change your email" alert         | `agiworkforce.com/settings/account`                       | `src/features/settings/cloud-account/index.tsx:182`       | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens anything.                                                                                                        |
| A7  | **Create on web** (Settings → Workspace, empty state) | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:454`                    | Accounts with workspace-management access and **no workspace**.                                                                                                                                                         |
| A8  | **Rename or delete this workspace on the web**        | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:580`                    | Any account that has a workspace loaded.                                                                                                                                                                                |

**B. Non-billing destinations.** The sign-in and account-creation flows open
Terms, Privacy, data-use and acceptable-use pages on `agiworkforce.com`; the
account Terms confirmation also links to Terms and Privacy
(`app/(auth)/login.tsx`, `src/features/auth/components/MobileSignUp.tsx`).
Settings → Privacy links to Terms and Privacy
(`src/features/settings/cloud-privacy/index.tsx`). Password recovery opens
`agiworkforce.com/login`, whose password step offers Forgot password
(`app/(auth)/reset-password.tsx`), and
the desktop-pairing safety disclosure opens `agiworkforce.com/security`
(`src/features/companion/components/PairingRiskDisclosure.tsx`).

**C. Opened in an in-app Safari sheet, not the browser.** Settings → About opens
`agiworkforce.com`, `/privacy` and `/terms` through `openInAppBrowser`
(`app/(app)/about.tsx:224`, `:230`, `:236`), which presents
`SFSafariViewController` as a page sheet rather than leaving the app. Assistant
output that contains a link opens the same way and is never auto-followed
(`src/features/chat/components/MessageContentRenderer.tsx:19-32`); a
non-`http(s)` scheme requires a confirmation alert first.

**D. Not `agiworkforce.com`.** Settings → Connectors → GitHub opens the GitHub
App install flow at `${API_URL}/api/github/install/start`
(`src/features/settings/cloud-connectors/index.tsx:690`, URL from
`services/connectors.ts:7-9`), an OAuth start on our own host. The Connect GitHub
button in the new cloud code session sheet runs the same install from the app
(`src/features/cloud-code/githubInstall.ts`). It first opens
`agiworkforce.com/github/connect`, which names the requesting AGI account before
GitHub, and always returns through the verified link
`https://agiworkforce.com/github/installed`: inside an authentication session on
iOS 17.4 and later, as a universal link in Safari on older iOS, and as a verified
App Link from a browser tab on Android. The app then names the GitHub account and
asks before linking it (`app/(app)/github/installed.tsx`). The legal screen
`app/legal/article-50.tsx:34` opens the EU AI Act text at
`artificialintelligenceact.eu`. A map result card opens Maps
(`src/features/chat/components/InteractiveCardBlock.tsx:292`). `mailto:` to
`support@agiworkforce.com`, and the iOS/Android device-settings intents, are the
only other `Linking.openURL` targets in the app.

**E. Present in source but not reachable in this iOS binary.** The Stripe
billing-portal link (`src/features/settings/cloud-billing/index.tsx:274`) remains
behind `FEATURES.billing === false`, in addition to the free-first native
purchase gate. Workspace member administration uses the current native
workspace controls; the earlier Android-only Add a member browser branch is
not part of this source.

Users who subscribed to AGI on the web see their plan's features unlocked when
they sign in here (multiplatform service). The app never advertises, prices, or
initiates that purchase.

Before submission, verify the signed free-first build exposes no checkout or
sales link from Billing, plan comparison or a paywall. Review the remaining
account, support and workspace destinations under App Review purchase policy.

## Account deletion

Required by Guideline 5.1.1(v) and implemented in-app, no support ticket and no
website visit:

**Settings → Account → Delete Account** → confirmation alert → `DELETE
/api/user/delete-account`. This requests deletion of the AGI Cloud account and all cloud data, normally
scheduled 24 hours later. The user can sign back in and cancel before erasure
begins. Local on-device data is removed separately from Settings → Storage →
Delete all local data. Settings → Data Controls offers a full local export
(chats, memory, settings, installed model details) that runs entirely on-device.

Source: `src/features/settings/cloud-account/index.tsx`.

## Privacy and data collection

- Local Mode collects no personal data.
- Signing in to AGI Cloud collects the account email address, and the name if
  the sign-in method provides one. Both are used for app functionality only.
- `NSPrivacyTracking` is `false`. The app contains no IDFA/AdSupport code, no
  ad SDK, and no cross-app tracking.
- The privacy manifest is generated from `ios.privacyManifests` in
  `app.config.js`; the submission copy is `store-listing/ios/PrivacyInfo.xcprivacy`.
- Privacy policy: https://agiworkforce.com/privacy

## AI content disclosure

Three separate mechanisms, described exactly so you can check each one:

- **First run** shows a blocking disclosure before the app is usable, stating
  "You are interacting with an AI system." and naming the on-device model and any
  third-party cloud provider. It carries the EU AI Act Article 50(1) and 50(2)
  text verbatim (`packages/contracts/compliance/src/article50-disclosure.ts`) and
  acceptance is recorded against a hash of the exact copy shown.
- **Every completed assistant turn** carries a provenance footer naming its
  source, "AGI Cloud", or "Local Mode · <model name>" for on-device inference.
  and the turn's role label is the model name or "AGI", never a person's name
  (`src/features/chat/components/ProvenanceFooter.tsx:10-14`, rendered from
  `src/features/chat/components/MessageBubble.tsx:894-895`). The footer names the
  system rather than printing the literal words "AI-generated".
- **The Data Controls export** (Settings → Data Controls → Export Local Data)
  wraps each conversation transcript in a machine-readable Article 50(2)
  provenance marker naming the provider and model
  (`services/dsarExport.ts:49-72`). The ordinary conversation export and share
  in the chat screen, PDF, plain text, Markdown, copy-to-clipboard
  (`services/fileCreation.ts`), carries role labels only and does **not** add
  that marker. We state the difference here rather than let the first-run copy be
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

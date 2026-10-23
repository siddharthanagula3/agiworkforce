# App Review Notes: AGI for iOS

Status: Current
Owner: Mobile lead
Last updated: 2026-09-26
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
enables server-side chat, web search, and, on paid plans, image generation.
Requests go to `https://agiworkforce.com` and `https://api.agiworkforce.com`.
Its Free plan is open to anyone who signs in. Paid plans and credit top-ups are
sold only through in-app purchase; see "Purchases: please read" below.

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
| Face ID (`NSFaceIDUsageDescription`)                       | Optional app lock, opt-in from Settings → Safety & Security (`src/features/auth/hooks/useBiometricGate.ts`). Off by default.                                                                                                                                                                 |
| Calendar / Reminders                                       | Same optional device-context connector, for "what's on my calendar" style questions. Off by default.                                                                                                                                                                                         |
| Translation (no permission prompt)                         | On-device translation through Apple's Translation framework (`native/ios/AGITranslate.swift`). No text is sent to a server.                                                                                                                                                                  |
| Notifications                                              | Optional; used for background task and cloud job completion alerts.                                                                                                                                                                                                                          |

The app does **not** link `expo-location` and requests no location permission.
The app contains no HealthKit code and requests no Health permission, the Apple
Health connector was removed in July 2026.

## Purchases: please read

**This build sells auto-renewing subscriptions and consumable credit top-ups
through StoreKit in-app purchase. There is no other way to pay inside the app.**

What ships:

- `expo-iap` 5.8.1 is a dependency (`package.json`) and is registered as a config
  plugin (`app.config.js`), so the StoreKit 2 framework is linked into the app.
- The purchase flow is `src/features/billing/useMobileIap.ts`, rendered by
  `src/features/settings/cloud-billing/index.tsx`.
- Four subscriptions in one subscription group (Basic, Pro, Max 5x, Max 20x,
  each monthly) and four consumable credit top-ups. The products, their group
  and their levels are listed in `docs/runbooks/mobile-store-products.md`.

How to buy during review:

1. Sign in with the review account supplied in App Store Connect and open
   Settings → Billing.
2. Every signed-in account can buy; there is no waitlist or access code in the
   app. Credit top-ups need an active plan and are not sold in Japan.
3. The plans appear with the App Store's own localized prices. Tap one; the
   StoreKit sheet shows the exact charge. The app never shows a price of its
   own.
4. After the purchase the app sends the signed transaction to
   `/api/mobile/iap/verify`. Access is granted only after the server verifies
   it with Apple, and the transaction is finished only after that.
5. With a paid plan active, **Usage top-ups** lists the consumables. Purchased
   credits do not expire.

What the Billing screen shows:

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

Every purchase path is behind one server answer. The app asks
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

Purchases made during review are App Store sandbox purchases and are not
charged. The production service verifies a sandbox-signed transaction with
Apple's sandbox certificate chain and grants it to the review account, which has
been allowed to receive test purchases for this review. For any other account
the same purchase is refused and the Billing screen says **"This purchase was
made in the store's test environment, which this account is not set up to use.
Nothing was charged."** Server-side verification (`/api/mobile/iap/verify`) also
rejects unregistered products.

Before submitting (operator steps, not for the reviewer): the review account
must be allowed to receive test purchases (operator dashboard, Flags, Store test
purchases; `docs/runbooks/mobile-store-products.md` section 4.1). This tree cannot
confirm that allowance, the live `MOBILE_IAP_ENABLED` state or the App Store
Connect product records; all three must be in place before this build is
submitted, and the purchase, restore, renewal, refund, plan-change and Ask to
Buy paths tested with sandbox accounts.

## External links

This section identifies website, store, legal and support destinations in the
current mobile source. `openExternalUrl` (`lib/safeOpenURL.ts`) accepts only
reviewed HTTPS hosts; other link handlers are described separately below.

**A. Billing and account-management destinations (the Guideline 3.1.1 surface).**
The current source exposes the following account and billing links. Their
availability depends on the signed-in account and plan.

| #   | Control                                               | Opens                                                     | Call site                                                 | Who sees it                                                                                                                                                                                                             |
| --- | ----------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **View invoices** (Settings → Billing)                | `agiworkforce.com/billing`                                | `src/features/settings/cloud-billing/index.tsx:729`       | Only accounts whose plan is billed on our website. Free and store-billed accounts get no invoice row.                                                                                                                   |
| A2  | **Workspace administration** (Settings → Billing)     | `agiworkforce.com/settings/team`                          | `src/features/settings/cloud-billing/index.tsx:451`       | Team and Enterprise plans only.                                                                                                                                                                                         |
| A3  | **Manage on web** (subscription-owner alert)          | `agiworkforce.com/settings/billing`                       | `src/features/settings/cloud-billing/index.tsx:258`       | Accounts whose subscription is recorded as bought on our website or provisioned by an employer. For an Apple- or Google-recorded subscription the same button opens that store's own subscription page instead.         |
| A4  | **Contact Sales** (chat paywall sheet)                | `agiworkforce.com/contact-sales?plan=…`                   | `src/features/chat/components/PaywallBottomSheet.tsx:130` | Only when the gated feature needs Team or Enterprise. Not reachable from the Billing screen: `getNextUpgradeTier` returns only self-serve individual tiers (`packages/contracts/types/src/billing-catalog.ts:362-375`). |
| A5  | **Help with a purchase** (Settings → Billing)         | `agiworkforce.com/help?q=purchase+billing+credits+refund` | `src/features/settings/cloud-billing/index.tsx:740`       | Any signed-in Cloud account; this opens support guidance for charges, missing credits and refunds.                                                                                                                      |
| A6  | **Continue** on the "Change your email" alert         | `agiworkforce.com/settings/account`                       | `src/features/settings/cloud-account/index.tsx:98`        | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens anything.                                                                                                        |
| A7  | **Create on web** (Settings → Workspace, empty state) | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:456`                    | An account with **no workspace at all**, not only Team admins.                                                                                                                                                          |
| A8  | **Rename or delete this workspace on the web**        | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:584`                    | Any account that has a workspace loaded.                                                                                                                                                                                |

Web billing links (A1 to A5) show only on the US App Store storefront and never on Android; elsewhere they are plain text, and purchase help opens in-app support.

**B. Non-billing destinations.** The sign-in and account-creation flows open
Terms, Privacy, data-use and acceptable-use pages on `agiworkforce.com`; the
account Terms confirmation also links to Terms and Privacy
(`app/(auth)/login.tsx`, `src/features/auth/components/MobileSignUp.tsx`).
Settings → Privacy links to Terms and Privacy
(`src/features/settings/cloud-privacy/index.tsx`). Settings → Personalization links its
custom-instructions helper to the acceptable-use page
(`src/features/settings/personalization/index.tsx`). Password recovery opens
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

**E. Present in source but unreachable in this binary.** The Stripe
billing-portal link (`src/features/settings/cloud-billing/index.tsx:292`), dead
behind `FEATURES.billing === false`.

Users who subscribed to AGI on the web see their plan's features unlocked when
they sign in here (multiplatform service). The app never advertises, prices, or
initiates that purchase.

If any link in section A is a problem under Guideline 3.1.1, we will remove or
gate it immediately, please tell us which one rather than rejecting the build,
and we will turn it around the same day.

## Account deletion

Required by Guideline 5.1.1(v) and implemented in-app, no support ticket and no
website visit:

**Settings → Account → Delete Account** → confirmation alert → `DELETE
/api/user/delete-account`. This permanently deletes the AGI Cloud account and
all cloud data. Local on-device data is cleared separately from Settings → Data
Controls, which also offers a full local export (chats, memory, settings,
installed models) that runs entirely on the device.

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

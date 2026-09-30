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
Cloud is in public alpha and its Free plan is open to anyone who signs in, with
no invite code or waitlist. Paid upgrades are opening in stages and need an
access code. Before a build with purchases is submitted, App Review must receive
a review account with upgrade access and working StoreKit products.

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

| Permission                                                 | Where it is used                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera (`NSCameraUsageDescription`)                        | Taking a photo to attach to a chat and scanning documents/text for on-device OCR.                                                                                                                                                                                                            |
| Microphone (`NSMicrophoneUsageDescription`)                | Voice input in the chat composer, and live voice mode in an AGI Cloud chat, which streams the microphone to AGI Cloud over WebRTC for the session (`src/features/voice/services/liveVoiceSession.ts`) and saves the transcript to that chat. Declared as Audio Data in the privacy manifest. |
| Speech Recognition (`NSSpeechRecognitionUsageDescription`) | Transcribing that voice input. Uses the on-device iOS Speech framework via `expo-speech-recognition` (`src/features/voice/services/voiceInput.ts`).                                                                                                                                          |
| Photo Library (`NSPhotoLibraryUsageDescription`)           | Choosing an existing image to attach to a chat.                                                                                                                                                                                                                                              |
| Face ID (`NSFaceIDUsageDescription`)                       | Optional app lock, opt-in from Settings → Safety & Security (`src/features/auth/hooks/useBiometricGate.ts`). Off by default.                                                                                                                                                                 |
| Calendar / Reminders                                       | Same optional device-context connector, for "what's on my calendar" style questions. Off by default.                                                                                                                                                                                         |
| Translation (`NSTranslationUsageDescription`)              | On-device translation through Apple's Translation framework (`native/ios/AGITranslate.swift`). No text is sent to a server.                                                                                                                                                                  |
| Notifications                                              | Optional; used for background task and cloud job completion alerts.                                                                                                                                                                                                                          |

The app does **not** link `expo-location` and requests no location permission.
The app contains no HealthKit code and requests no Health permission, the Apple
Health connector was removed in July 2026.

## Purchases: please read

**Native store billing code ships inside this binary. The checked-in backend
configuration switches off new purchases. Confirm the live backend switch and
App Store Connect product state before using these notes for a submission.**

We would rather over-disclose this than have you find StoreKit in the binary and
read these notes as inaccurate metadata.

What ships:

- `expo-iap` 5.6.2 is a dependency (`package.json`) and is registered as a config
  plugin (`app.config.js`), so the StoreKit 2 framework is linked into the app.
- The purchase flow itself is compiled in:
  `src/features/billing/useMobileIap.ts`, rendered by
  `src/features/settings/cloud-billing/index.tsx`.

Why nothing can be bought:

- Every purchase path in the app is behind one server answer. The app asks
  `GET /api/mobile/iap/catalog` for the product list and offers nothing unless
  that response says `enabled: true`.
- The server (`apps/web/lib/server/mobile-iap-catalog.ts`) reports the catalog as
  enabled only when the deployment sets `MOBILE_IAP_ENABLED` **and** maps at
  least one logical product key to a real store ID in
  `MOBILE_IAP_APPLE_PRODUCT_IDS_JSON`. The gate fails closed, in separate
  branches with different reasons, we quote them exactly because you may see any
  of them:
  - flag off or unset → `enabled: false`, reason **"Native purchases are not
    enabled for this deployment."** (`mobile-iap-catalog.ts:63-69`). This is the
    branch our deployments are in.
  - flag on but no product key mapped → still `enabled: false`, reason **"App
    Store products have not been registered for this build."**
    (`mobile-iap-catalog.ts:77-86`).
  - deployment flag on and products mapped, but the account has never bought and
    holds no upgrade access → still `enabled: false`, reason **"Paid upgrades are
    opening in stages. This account needs upgrade access before plans and credits
    can be bought here."** (`apps/web/app/api/mobile/iap/catalog/route.ts`). The
    screen then titles the same inert notice "Paid upgrades are opening in
    stages" instead of "Native purchases are not configured".

  The checked-in environment templates ship `MOBILE_IAP_ENABLED=false` and
  define no product-ID map. The live deployment setting and App Store Connect
  records must be checked before submitting this draft.

- With that answer, Settings → Billing renders **"Native purchases are not
  configured"** in place of new product offers. It still shows **Restore
  purchases** so an existing store transaction can be recovered. StoreKit is
  not asked for new-product pricing unless the catalog is enabled.
- The product keys in our shared contract
  (`packages/contracts/types/src/mobile-iap.ts`) are logical names only. This
  repository does not establish whether App Store product IDs exist.
- Server-side verification (`/api/mobile/iap/verify`) rejects unregistered
  products. Previously registered products remain verifiable if new sales are
  switched off; keep their product-ID mappings configured for transaction and
  notification processing.

You can confirm all of this from the app: sign in and open Settings → Billing.
The signed-in Billing screen shows the current plan, applicable plan and billing
controls, a native-purchase status, **Restore purchases**, and invoice access.
Its plan-change row may be labelled **Upgrade plan**, **Adjust plan**, or
**Choose plan**, depending on the current subscription. During catalog loading
it shows **Loading native purchases**; Team and Enterprise accounts may also
see **Workspace administration**.
When the server catalog is disabled, no product offer, store price, or purchase
sheet is presented. Restore remains available for earlier subscriptions and
unfinished transactions, and server verification still accepts registered
product IDs after new sales are switched off. A failed verification is not
acknowledged to the store.

When the catalog is enabled for an account with upgrade access, the app fetches
store-localized prices and can present native subscriptions and consumable
credit top-ups. It rechecks the server catalog before opening a purchase sheet.
The upgrade code only permits an account to see and buy store products; it does
not grant a paid entitlement. For App Review of that flow, provide a signed-in
account with a redeemed upgrade code and registered test products in the secure
review fields. The reviewer can also join the waitlist from Billing.

A subscription bought on another platform is identified as managed elsewhere;
the app avoids offering a second recurring purchase through the native store.
Store subscriptions are managed through the corresponding store. A web-billed
plan may show a link to its existing billing management page. The free-tier
invoice row is inert.

This source tree cannot confirm live `MOBILE_IAP_ENABLED` deployment state or
App Store Connect product registration. Recheck both before submission, update
the in-app-purchase listing answer, and test the purchase, restore, renewal and
refund paths with StoreKit sandbox accounts.

## External links

This section identifies website, store, legal and support destinations in the
current mobile source. `openExternalUrl` (`lib/safeOpenURL.ts`) accepts only
reviewed HTTPS hosts; other link handlers are described separately below.

**A. Billing and account-management destinations (the Guideline 3.1.1 surface).**
The current source exposes the following account and billing links. Their
availability depends on the signed-in account and plan.

| #   | Control                                               | Opens                                                     | Call site                                                 | Who sees it                                                                                                                                                                                                             |
| --- | ----------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **View invoices** (Settings → Billing)                | `agiworkforce.com/billing`                                | `src/features/settings/cloud-billing/index.tsx:617`       | Paid plans only; the free tier gets an inert "No invoices yet" row with no handler.                                                                                                                                     |
| A2  | **Workspace administration** (Settings → Billing)     | `agiworkforce.com/settings/team`                          | `src/features/settings/cloud-billing/index.tsx:377`       | Team and Enterprise plans only.                                                                                                                                                                                         |
| A3  | **Manage on web** (subscription-owner alert)          | `agiworkforce.com/settings/billing`                       | `src/features/settings/cloud-billing/index.tsx:176`       | Accounts whose subscription is recorded as bought on our website or provisioned by an employer. For an Apple- or Google-recorded subscription the same button opens that store's own subscription page instead.         |
| A4  | **Contact Sales** (chat paywall sheet)                | `agiworkforce.com/contact-sales?plan=…`                   | `src/features/chat/components/PaywallBottomSheet.tsx:120` | Only when the gated feature needs Team or Enterprise. Not reachable from the Billing screen: `getNextUpgradeTier` returns only self-serve individual tiers (`packages/contracts/types/src/billing-catalog.ts:362-375`). |
| A5  | **Help with a purchase** (Settings → Billing)         | `agiworkforce.com/help?q=purchase+billing+credits+refund` | `src/features/settings/cloud-billing/index.tsx:624`       | Any signed-in Cloud account; this opens support guidance for charges, missing credits and refunds.                                                                                                                      |
| A6  | **Continue** on the "Change your email" alert         | `agiworkforce.com/settings/account`                       | `src/features/settings/cloud-account/index.tsx:98`        | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens anything.                                                                                                        |
| A7  | **Create on web** (Settings → Workspace, empty state) | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:438`                    | An account with **no workspace at all**, not only Team admins.                                                                                                                                                          |
| A8  | **Rename or delete this workspace on the web**        | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:545`                    | Any account that has a workspace loaded.                                                                                                                                                                                |

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

**E. Present in source but not reachable in this iOS binary.** Two, named so you
do not read them as omissions: the Stripe billing-portal link
(`src/features/settings/cloud-billing/index.tsx:213`), dead behind
`FEATURES.billing === false`; and **Add a member** in Settings → Workspace
(`app/(app)/settings/workspace.tsx:134`), which takes the browser branch only
when `Platform.OS !== 'ios'` (`:132`), on iOS the same tap opens a native
`Alert.prompt` instead.

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

# App Review Notes — AGI for iOS

Status: Current
Owner: Mobile lead
Last updated: 2026-08-05
Applies to: `com.agiworkforce.app`, version 1.2.0

Paste the body of this file into the **App Review Information → Notes** field in
App Store Connect. `store-listing/LISTING-METADATA-IOS.json` points
`app_review_information.notes_file` here.

Every statement below is checked against shipped code in `apps/mobile`. When a
behaviour changes, update this file in the same change — App Review reads it as
a factual claim about the binary.

---

## What the app does

AGI is an AI assistant with two independent modes.

**Local Mode (default, no account).** A quantized open-weight language model
runs on the device through ExecuTorch or llama.rn. Inference happens entirely
on-device; no prompt or response leaves the phone. The catalog-selected default
is an Apache-2.0 model that the app fetches on first
run. Chats are stored in a local SQLite database that is encrypted at rest with
SQLCipher; the key lives in the iOS Keychain.

**AGI Cloud (optional, requires sign-in).** Signing in with an AGI account
enables server-side chat, web search, and — on paid plans — image generation.
Requests go to `https://agiworkforce.com` and `https://api.agiworkforce.com`.
Cloud is in public alpha and open to anyone who signs in; there is no invite
code or waitlist.

The two modes never mix silently. Local chats are not uploaded, and switching a
conversation to Cloud is an explicit user action.

## How to review it — no demo account needed

`demo_account_required` is `false` and that is deliberate:

1. **Local Mode requires no account at all.** Launch the app, tap through
   onboarding, and chat. This exercises the core product. Onboarding downloads
   the ~2 GB local model over Wi-Fi — please allow that to finish, or use the
   **Continue to Cloud** button on the download screen to skip it.
2. **AGI Cloud sign-up is open self-service.** Sign-in uses Clerk's native
   `AuthView` (an in-app native sheet, not a web browser). Create an account
   with any email address; a verification code is emailed. Cloud chat and web
   search are available immediately on the free tier.

If you would prefer pre-provisioned credentials, email
`review@agiworkforce.com` and we will supply an account with a paid tier
attached within one business day.

## Why the app asks for each permission

Every permission is requested **on first use, from a user action** — never on
launch and never on screen mount (`src/features/settings/permissions/registry.ts`).
Declining any one of them leaves the rest of the app fully usable. There is also
a Settings → Permissions screen that shows current status for each.

| Permission                                                 | Where it is used                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera (`NSCameraUsageDescription`)                        | Taking a photo to attach to a chat and scanning documents/text for on-device OCR.                                                                                                                                                                   |
| Microphone (`NSMicrophoneUsageDescription`)                | Voice input in the chat composer.                                                                                                                                                                                                                   |
| Speech Recognition (`NSSpeechRecognitionUsageDescription`) | Transcribing that voice input. Uses the on-device iOS Speech framework via `expo-speech-recognition` (`src/features/voice/services/voiceInput.ts`).                                                                                                 |
| Photo Library (`NSPhotoLibraryUsageDescription`)           | Choosing an existing image to attach to a chat.                                                                                                                                                                                                     |
| Face ID (`NSFaceIDUsageDescription`)                       | Optional app lock, opt-in from Settings → Safety & Security (`src/features/auth/hooks/useBiometricGate.ts`). Off by default.                                                                                                                        |
| Contacts (`NSContactsUsageDescription`)                    | Optional device-context connector: looks up a name the user typed so the assistant can address or message the right person (`src/features/integrations/services/deviceIntegrations.ts`). Off by default; nothing is read until the user enables it. |
| Calendar / Reminders                                       | Same optional device-context connector, for "what's on my calendar" style questions. Off by default.                                                                                                                                                |
| Translation (`NSTranslationUsageDescription`)              | On-device translation through Apple's Translation framework (`native/ios/AGITranslate.swift`). No text is sent to a server.                                                                                                                         |
| Notifications                                              | Optional; used for background task and cloud job completion alerts.                                                                                                                                                                                 |

The app does **not** link `expo-location` and requests no location permission.
The app contains no HealthKit code and requests no Health permission — the Apple
Health connector was removed in July 2026.

## Purchases — please read

**There is no in-app purchase in this build, and no StoreKit product exists.**

- Tapping **Settings → Billing → Upgrade plan** opens an in-app bottom sheet
  that says _"Upgrades aren't available in the app yet. Check back soon."_ It
  does not open a browser and does not link to any purchasing mechanism
  (`src/features/settings/cloud-billing/index.tsx` → `handleUpgrade`, and
  `src/features/chat/components/PaywallBottomSheet.tsx`).
- Free-tier users see **no** external billing links anywhere in the app.

Three external links do exist and we want to disclose them plainly rather than
have you find them:

1. **View invoices** (Settings → Billing) opens `agiworkforce.com/billing` in
   the browser. This row is rendered **only** for accounts that already hold a
   paid plan; on the free tier it is an inert "No invoices yet" row with no
   action. It is an account-management/billing-history destination for a
   subscription that was purchased on the web.
2. **Contact Sales** appears only when the gated feature requires the Team or
   Enterprise plan. It opens `agiworkforce.com/contact-sales`, a lead form. No
   price or checkout is presented in the app.
3. **Workspace administration** appears only for Team plan administrators and
   opens `agiworkforce.com/settings/team`.

Users who subscribed to AGI on the web see their plan's features unlocked when
they sign in here (multiplatform service). The app never advertises, prices, or
initiates that purchase.

If any of the three links above is a problem under Guideline 3.1.1, we will
remove or gate them immediately — please tell us which one rather than rejecting
the build, and we will turn it around the same day.

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

Model output is labelled as AI-generated in the UI, and first run shows a
disclosure screen naming the on-device model and any third-party cloud
providers, addressing the EU AI Act Article 50 transparency duty.

We do not claim full compliance with India's DPDP Act 2023. The itemised notice
is published at https://agiworkforce.com/privacy/india, consent withdrawal and
the export/delete controls described above are implemented, and the obligations
we have not met — verifiable parental consent under s.9, notice in Eighth
Schedule languages under s.6(4), and India data residency — are listed at
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

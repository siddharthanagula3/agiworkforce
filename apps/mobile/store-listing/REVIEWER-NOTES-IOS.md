# App Review Notes — AGI for iOS

Status: Current
Owner: Mobile lead
Last updated: 2026-08-27
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

| Permission                                                 | Where it is used                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera (`NSCameraUsageDescription`)                        | Taking a photo to attach to a chat and scanning documents/text for on-device OCR.                                                                   |
| Microphone (`NSMicrophoneUsageDescription`)                | Voice input in the chat composer.                                                                                                                   |
| Speech Recognition (`NSSpeechRecognitionUsageDescription`) | Transcribing that voice input. Uses the on-device iOS Speech framework via `expo-speech-recognition` (`src/features/voice/services/voiceInput.ts`). |
| Photo Library (`NSPhotoLibraryUsageDescription`)           | Choosing an existing image to attach to a chat.                                                                                                     |
| Face ID (`NSFaceIDUsageDescription`)                       | Optional app lock, opt-in from Settings → Safety & Security (`src/features/auth/hooks/useBiometricGate.ts`). Off by default.                        |
| Calendar / Reminders                                       | Same optional device-context connector, for "what's on my calendar" style questions. Off by default.                                                |
| Translation (`NSTranslationUsageDescription`)              | On-device translation through Apple's Translation framework (`native/ios/AGITranslate.swift`). No text is sent to a server.                         |
| Notifications                                              | Optional; used for background task and cloud job completion alerts.                                                                                 |

The app does **not** link `expo-location` and requests no location permission.
The app contains no HealthKit code and requests no Health permission — the Apple
Health connector was removed in July 2026.

## Purchases — please read

**Native store billing code ships inside this binary and is switched off. No
product is purchasable in 1.2.0, and no in-app-purchase product exists in App
Store Connect for `com.agiworkforce.app`.**

We would rather over-disclose this than have you find StoreKit in the binary and
read these notes as inaccurate metadata.

What ships:

- `expo-iap` 5.3.0 is a dependency (`package.json`) and is registered as a config
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
  `MOBILE_IAP_APPLE_PRODUCT_IDS_JSON`. The gate fails closed: if either is
  missing or off, the catalog comes back disabled with the reason "Native
  purchases are not enabled for this deployment." Our checked-in environment
  templates ship `MOBILE_IAP_ENABLED=false` and define no product-ID map, and we
  confirm the flag is off on the deployment this build points at before every
  submission. (That last part is a deployment setting, not something the source
  tree can prove on its own — we state it as our own commitment.)
- With that answer, Settings → Billing renders one inert notice — **"Native
  purchases are not configured"** — in place of the entire native-purchase area:
  no product row, no store price, no Restore Purchases action and no store
  sheet. StoreKit is never asked for a product, because product lookup only runs
  for a catalog that came back enabled.
- The product keys in our shared contract
  (`packages/contracts/types/src/mobile-iap.ts`) are logical names only. The App
  Store product IDs they would map to have not been created, so there is nothing
  for StoreKit to sell.
- Server-side verification (`/api/mobile/iap/verify`) rejects any product it
  cannot resolve from that same gated catalog, so no entitlement can be granted
  through StoreKit while the gate is off.

You can confirm all of this from the app: sign in and open Settings → Billing.
The screen is not empty — so that you are not surprised by what is on it, here is
everything it renders: your current plan card, one plan-change row (covered under
"What the plan-change row does today" below), an invoices row, the **"Native
purchases are not configured"** notice, and — only for an account on an active plan billed
through our website — two static explanatory blocks, "How plan upgrades are
charged" and "Usage top-ups". Those two blocks are text with no button; the
top-up one describes how a store purchase _would_ be priced if native purchases
were ever enabled, and it is the only place on the screen the word "price"
appears. What the screen never renders while the gate is off: a product row, a
store price, a Restore Purchases action, or a store sheet. Every row on the
screen that leaves the app is listed under "External links" below.

When the founder registers App Store Connect products and turns the flag on, we
will update this file, `LISTING-METADATA-IOS.json`, and the App Store Connect
in-app-purchase metadata in the same change, before any purchase becomes
possible.

What the plan-change row does today. It is one row, labelled **Upgrade plan**,
**Adjust plan** or **Choose plan** depending on the account, and `handleUpgrade`
in `src/features/settings/cloud-billing/index.tsx` sends it down one of three
branches. None of them shows a price and none of them starts a purchase, but they
are not all the same, and one of them does open a browser:

- **Account with no subscription on record** — the free tier, and any account
  whose subscription is cancelled or expired. Opens an in-app bottom sheet
  (`src/features/chat/components/PaywallBottomSheet.tsx`) reading _"Plan changes
  aren't available in the app yet. Check back soon."_, or, for a lapsed paid tier,
  _"Billing management isn't available in the app yet. Please try again later."_
  There is no action button on the sheet and nothing opens a browser.
- **Account whose subscription is on record as bought outside this app** — bought
  on our website, or provisioned by an employer, and not yet cancelled or
  expired (`past_due` and `unpaid` count as still on record). Instead of the
  sheet, a native alert appears: _"Subscription managed elsewhere — You purchased
  this subscription through AGI Workforce on the web. To avoid being charged
  twice, manage it there before changing plans in this app."_ (The named source
  is "your organization" for an employer-provisioned plan.) Its buttons are
  **OK** and **Manage on web**; **Manage on web** opens
  `agiworkforce.com/settings/billing` in the browser. That is external link (4)
  below, and it is why we say four links and not three. If the subscription's
  origin is not attributable, the alert carries only **OK** and opens nothing.
- **Native store purchase available** — unreachable in this build, because it
  requires the catalog gate above to be on.

Also on that screen:

- `FEATURES.billing` is `false` (`lib/v1FeatureFlags.ts`), so the "Manage
  billing" row and the Stripe billing-portal link do not render at all.
- On the free tier the Billing screen opens nothing externally: the invoices row
  is inert ("No invoices yet") and the workspace row is not rendered.

Four external links do exist and we want to disclose them plainly rather than
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
4. **Manage on web**, the second button on the "Subscription managed elsewhere"
   alert described above, opens `agiworkforce.com/settings/billing`. It is
   reachable only from the plan-change row, and only for an account that already
   holds a subscription bought outside this app. It is the account-management
   page for that existing subscription; it presents no price, no plan list and no
   checkout, and its purpose is to stop the user being billed twice.

Users who subscribed to AGI on the web see their plan's features unlocked when
they sign in here (multiplatform service). The app never advertises, prices, or
initiates that purchase.

If any of the four links above is a problem under Guideline 3.1.1, we will
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

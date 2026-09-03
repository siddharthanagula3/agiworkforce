# App Review Notes: AGI for iOS

Status: Current
Owner: Mobile lead
Last updated: 2026-08-27
Applies to: `com.agiworkforce.app`, version 1.2.0

Paste the body of this file into the **App Review Information → Notes** field in
App Store Connect. `store-listing/LISTING-METADATA-IOS.json` points
`app_review_information.notes_file` here.

Every statement below is checked against shipped code in `apps/mobile`. When a
behaviour changes, update this file in the same change, App Review reads it as
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
enables server-side chat, web search, and, on paid plans, image generation.
Requests go to `https://agiworkforce.com` and `https://api.agiworkforce.com`.
Cloud is in public alpha and open to anyone who signs in; there is no invite
code or waitlist.

The two modes never mix silently. Local chats are not uploaded, and switching a
conversation to Cloud is an explicit user action.

## How to review it, no demo account needed

`demo_account_required` is `false` and that is deliberate:

1. **Local Mode requires no account at all.** Launch the app, tap through
   onboarding, and chat. This exercises the core product. Onboarding downloads
   the ~2 GB local model over Wi-Fi, please allow that to finish, or use the
   **Continue to Cloud** button on the download screen to skip it.
2. **AGI Cloud sign-up is open self-service.** Sign-in uses Clerk's native
   `AuthView` (an in-app native sheet, not a web browser). Create an account
   with any email address; a verification code is emailed. Cloud chat and web
   search are available immediately on the free tier.

If you would prefer pre-provisioned credentials, email
`review@agiworkforce.com` and we will supply an account with a paid tier
attached within one business day.

## Why the app asks for each permission

Every permission is requested **on first use, from a user action**, never on
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
The app contains no HealthKit code and requests no Health permission, the Apple
Health connector was removed in July 2026.

## Purchases: please read

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
  `MOBILE_IAP_APPLE_PRODUCT_IDS_JSON`. The gate fails closed, in two separate
  branches with two different reasons, we quote them exactly because you may see
  either one:
  - flag off or unset → `enabled: false`, reason **"Native purchases are not
    enabled for this deployment."** (`mobile-iap-catalog.ts:63-69`). This is the
    branch our deployments are in.
  - flag on but no product key mapped → still `enabled: false`, reason **"App
    Store products have not been registered for this build."**
    (`mobile-iap-catalog.ts:77-86`).

  Our checked-in environment templates ship `MOBILE_IAP_ENABLED=false` and define
  no product-ID map, and we confirm the flag is off on the deployment this build
  points at before every submission. (That last part is a deployment setting, not
  something the source tree can prove on its own, we state it as our own
  commitment.)

- With that answer, Settings → Billing renders one inert notice, **"Native
  purchases are not configured"**, in place of the entire native-purchase area:
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
The screen is not empty. So that nothing on it surprises you, here is every block
it can render, in render order, from
`src/features/settings/cloud-billing/index.tsx`:

| Block                                                                                | Line       | When it renders                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "Your plan, usage, and payment details" header                                       | `:214`     | Always.                                                                                                                       |
| Current plan card                                                                    | `:229`     | Always. Free tier also gets a five-item feature list.                                                                         |
| Plan-change row, **Upgrade plan** / **Adjust plan** / **Choose plan**                | `:323-329` | Only when the account has a higher self-serve tier and is not on a workspace plan. See "What the plan-change row does today". |
| **Workspace administration**, opens `agiworkforce.com/settings/team`                 | `:331-338` | Only on a Team or Enterprise plan (`canUseBillingPlanCapability(tier, 'team_admin')`). External link A2 below.                |
| "Manage billing"                                                                     | `:339-346` | Never in 1.2.0, `FEATURES.billing` is `false`.                                                                                |
| "How plan upgrades are charged" and "Usage top-ups"                                  | `:350-363` | Only for an active plan billed through our website. Text, no button.                                                          |
| **"Loading native purchases / Connecting securely to the App Store or Google Play"** | `:365-370` | **On first paint, for every signed-in Cloud account**, see below.                                                             |
| "Native purchases are not configured"                                                | `:479-489` | After that first paint, in this build, always.                                                                                |
| Invoices row, "View invoices" or the inert "No invoices yet"                         | `:492-501` | Always. Actionable only on a paid plan. External link A1 below.                                                               |

Two of those need spelling out because they are easy to misread:

- **The loading block is the first thing you will see.** `nativeIap.loading` is
  `catalogLoading || (enabled && !storeConnected && error === null)`
  (`src/features/billing/useMobileIap.ts:313`) and `catalogLoading` starts `true`
  (`:63`), so a signed-in Cloud account always renders "Loading native purchases"
  for the moment before the catalog answer arrives. It is a spinner-equivalent
  placeholder, not an offer: no product, no price, no action. It is replaced by
  "Native purchases are not configured" as soon as the gated catalog responds.
- **The "Usage top-ups" block is the only place the word "price" appears** on the
  screen, and it describes how a store purchase _would_ be priced if native
  purchases were ever enabled.

What the screen never renders while the gate is off: a product row, a store
price, a Restore Purchases action, or a store sheet. Every row on the screen that
leaves the app is listed under "External links" below.

When the founder registers App Store Connect products and turns the flag on, we
will update this file, `LISTING-METADATA-IOS.json`, and the App Store Connect
in-app-purchase metadata in the same change, before any purchase becomes
possible.

What the plan-change row does today. It is one row, labelled **Upgrade plan**,
**Adjust plan** or **Choose plan** depending on the account, and `handleUpgrade`
in `src/features/settings/cloud-billing/index.tsx` sends it down one of three
branches. None of them shows a price and none of them starts a purchase, but they
are not all the same, and one of them does open a browser:

- **Account with no subscription on record**, the free tier, and any account
  whose subscription is cancelled or expired. Opens an in-app bottom sheet
  (`src/features/chat/components/PaywallBottomSheet.tsx`) reading _"Plan changes
  aren't available in the app yet. Check back soon."_, or, for a lapsed paid tier,
  _"Billing management isn't available in the app yet. Please try again later."_
  There is no action button on the sheet and nothing opens a browser.
- **Account whose subscription is on record as bought outside this app**, bought
  on our website, or provisioned by an employer, and not yet cancelled or
  expired (`past_due` and `unpaid` count as still on record). Instead of the
  sheet, a native alert appears: _"Subscription managed elsewhere, You purchased
  this subscription through AGI Workforce on the web. To avoid being charged
  twice, manage it there before changing plans in this app."_ (The named source
  is "your organization" for an employer-provisioned plan.) Its buttons are
  **OK** and **Manage on web**; **Manage on web** opens
  `agiworkforce.com/settings/billing` in the browser, link A3 below. If the
  subscription's origin is not attributable, the alert carries only **OK** and
  opens nothing.
- **Native store purchase available**, unreachable in this build, because it
  requires the catalog gate above to be on.

**If you review on a paid account we pre-provisioned for you, this is the branch
you land in.** `getSubscriptionOwnerGuard` returns `blocked: true` for any
entitled account (`src/features/billing/subscriptionSource.ts:60-66`), and
`handleUpgrade` checks `blocked` before it ever opens the sheet
(`src/features/settings/cloud-billing/index.tsx:173-177`). The row on such an
account is labelled **Adjust plan**, not "Upgrade plan", and the first thing it
does is show that alert. If the account we provision is on a Team or Enterprise
plan, there is no plan-change row at all, `isWorkspacePlan` suppresses it
(`:323`) and **Workspace administration** takes its place.

Also on that screen:

- `FEATURES.billing` is `false` (`lib/v1FeatureFlags.ts:8`), so the "Manage
  billing" row and the Stripe billing-portal link (`handleManageBilling`,
  `:185-196`) do not render and cannot be reached at all.
- On the free tier the Billing screen opens nothing externally: the invoices row
  is inert ("No invoices yet") and the workspace row is not rendered.

## External links

We would rather over-disclose than have you find a link we did not mention, so
this section is the complete enumeration, re-derived from the source on
2026-08-27 by grepping every `openExternalUrl`, `openInAppBrowser`,
`WebBrowser.openBrowserAsync` and `Linking.openURL` call site under `apps/mobile`
outside `__tests__`.

All of them are filtered by one allowlist. `openExternalUrl`
(`lib/safeOpenURL.ts:31-43`) refuses anything that is not `https:` on
`agiworkforce.com`, a subdomain of it, `stripe.com`, `apps.apple.com` or
`play.google.com`, so no screen in the app can be made to open an arbitrary
destination.

**A. Billing and account-management destinations (the Guideline 3.1.1 surface).**
Eight reachable call sites, seven distinct URLs. None presents a price, a plan
list, or a checkout.

| #   | Control                                               | Opens                                   | Call site                                                 | Who sees it                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **View invoices** (Settings → Billing)                | `agiworkforce.com/billing`              | `src/features/settings/cloud-billing/index.tsx:497`       | Paid plans only; the free tier gets an inert "No invoices yet" row with no handler.                                                                                                                                                    |
| A2  | **Workspace administration** (Settings → Billing)     | `agiworkforce.com/settings/team`        | `src/features/settings/cloud-billing/index.tsx:335`       | Team and Enterprise plans only.                                                                                                                                                                                                        |
| A3  | **Manage on web** (subscription-owner alert)          | `agiworkforce.com/settings/billing`     | `src/features/settings/cloud-billing/index.tsx:155`       | Accounts whose subscription is recorded as bought on our website or provisioned by an employer. For an Apple- or Google-recorded subscription the same button opens that store's own subscription page instead.                        |
| A4  | **Contact Sales** (chat paywall sheet)                | `agiworkforce.com/contact-sales?plan=…` | `src/features/chat/components/PaywallBottomSheet.tsx:121` | Only when the gated feature needs Team or Enterprise. Not reachable from the Billing screen: `getNextUpgradeTier` returns only self-serve individual tiers (`packages/contracts/types/src/billing-catalog.ts:362-375`).                |
| A5  | **View on web** (Settings → Usage)                    | `agiworkforce.com/settings/usage`       | `src/features/settings/cloud-usage/index.tsx:131`         | Any signed-in Cloud account. It sits under the copy "Detailed usage ledger and credit tracking will be available once AGI Cloud billing is active", that is a roadmap note, not an offer; the destination shows usage, not a purchase. |
| A6  | **Continue** on the "Change your email" alert         | `agiworkforce.com/settings/account`     | `src/features/settings/cloud-account/index.tsx:98`        | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens anything.                                                                                                                       |
| A7  | **Create on web** (Settings → Workspace, empty state) | `agiworkforce.com/settings/team`        | `app/(app)/settings/workspace.tsx:438`                    | An account with **no workspace at all**, not only Team admins.                                                                                                                                                                         |
| A8  | **Rename or delete this workspace on the web**        | `agiworkforce.com/settings/team`        | `app/(app)/settings/workspace.tsx:545`                    | Any account that has a workspace loaded.                                                                                                                                                                                               |

**B. Non-billing destinations.** Four reachable `openExternalUrl` call sites:
the privacy policy and terms from Settings → Privacy
(`src/features/settings/cloud-privacy/index.tsx:75` and `:80`), password recovery
from the sign-in screen (`agiworkforce.com/auth/reset-password`,
`app/(auth)/reset-password.tsx:23`), and the desktop-pairing safety page
(`agiworkforce.com/security`,
`src/features/companion/components/PairingRiskDisclosure.tsx:23`).

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
`services/connectors.ts:7-9`), an OAuth start on our own host. The legal screen
`app/legal/article-50.tsx:34` opens the EU AI Act text at
`artificialintelligenceact.eu`. A map result card opens Maps
(`src/features/chat/components/InteractiveCardBlock.tsx:292`). `mailto:` to
`support@agiworkforce.com`, and the iOS/Android device-settings intents, are the
only other `Linking.openURL` targets in the app.

**E. Present in source but not reachable in this iOS binary.** Two, named so you
do not read them as omissions: the Stripe billing-portal link
(`src/features/settings/cloud-billing/index.tsx:189`), dead behind
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

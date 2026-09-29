# Play Console Review Notes, AGI for Android

Status: Current
Owner: Mobile lead
Last updated: 2026-09-26
Applies to: `com.agiworkforce.app`, version 0.0.1 (`app.config.js` → `version`,
`android.package`)

Paste the body of this file into the **App content → App access → Instructions**
field in Play Console.
`store-listing/LISTING-METADATA-ANDROID.json` points
`play_console_review_notes_file` here.

Every statement below is checked against shipped code in `apps/mobile` (and, for
server endpoints, `apps/web`). Each claim names the file it was verified in. When
a behaviour changes, update this file in the same change, a Play reviewer reads
it as a factual claim about the APK/AAB.

Paths are relative to `apps/mobile` unless they begin with `apps/web`.

---

## What the app does

AGI is an AI assistant with two independent modes.

**Local Mode (default, no account).** A language model runs on the device. On a
device whose runtime tier resolves to the Android system model, AGI uses Google's
on-device ML Kit Prompt API over AICore, no model file is downloaded at all
(`native/android/withAGIAICore.cjs` pulls in `com.google.mlkit:genai-prompt`;
its catalog entry carries `fileSizeBytes: 0` because nothing is fetched). On every
other device the default is **AGI Standard**, an Apache-2.0 open-weights model of
roughly 2 GB at Q4, downloaded once and run through ExecuTorch or llama.rn. Both
entries, with their exact model identifiers, licences and sizes, are defined in
`packages/platform/local-llm/src/catalog.ts`, that file is the single source of
truth for what can run on a device, and this document deliberately points at it
rather than restating identifiers that would then drift.

Local chats are stored in a local SQLite database encrypted with SQLCipher
(`app.config.js` → `['expo-sqlite', { useSQLCipher: true }]`). The 256-bit key is
generated with `expo-crypto` and held by `expo-secure-store`, which is
Android Keystore-backed (`storage/db.ts`).

Local Mode does not merely _avoid_ our servers, it is prevented from reaching
them: `lib/egressGuard.ts` throws `EgressBlockedError` on any outbound request to
an AGI managed-cloud host while Local Mode is active.

**AGI Cloud (optional, requires sign-in).** Signing in enables server-side chat,
web search, and image generation (`lib/v1FeatureFlags.ts` → `cloudChat`,
`webSearch`, `imageGen` are all `true`). Sign-in is Clerk's native `AuthView`
sheet, not a browser (`app/(auth)/login.tsx` → `<AuthView mode="signInOrUp" />`).
Cloud is a public alpha whose Free plan is open to anyone who signs in, with no
invite code or waitlist. Paid upgrades are opening in stages and need an access
code. Play purchases require registered products and an enabled server catalog.

## How to review it

Local Mode needs no account. Launch the app, complete onboarding and start a
local chat. On devices without the supported system model, a local model must
be downloaded before offline inference.

Cloud features require sign-in. Before submission, provide an active review
account and any required upgrade access code in Play Console's secure App access
instructions; do not put credentials in this repository. The Cloud entry path
includes age confirmation, and a signed-in account must accept the current
Terms before Cloud unlocks. If Play products are included, the review account
must be able to see and test those products through Google Play Billing.

## Age gate and minor-safe mode

Implemented in `src/features/auth/services/ageGate.ts` and
`app/(public)/age-gate.tsx`.

**Where it fires.** The gate guards Cloud sign-in, not first launch. The moment a
signed-out user heads for the auth group, `app/_layout.tsx` redirects to
`/(public)/age-gate` with `returnTo` set to the Cloud sign-in path. Local first
launch is deliberately _not_ gated, Local Mode sends nothing off the device, so
there is no data subject to protect and the gate would only be a wall. That
boundary is pinned by a test that fails if anyone reintroduces it:
`__tests__/age-gate-guards-cloud-not-local.test.ts`.

**Region-aware thresholds.** The threshold is chosen from the device's IANA time
zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), no location
permission, no IP geolocation, no network call:

| Threshold | Regions (by time-zone prefix)                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18        | India (`Asia/Kolkata`, `Asia/Calcutta`), Brazil (all `America/*` BR zones)                                                                                                     |
| 16        | EU member-state zones (AT, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK), plus North Macedonia (`Europe/Skopje`, MK) |
| 13        | United Kingdom (`Europe/London`, Belfast, Jersey, Guernsey)                                                                                                                    |
| 13        | Everywhere else (`DEFAULT_RULE`), including when the time zone cannot be read                                                                                                  |

**What it stores.** One MMKV record under `age-gate:v1`: confirmed flag, minor
flag, timestamp, region code, threshold. It is on-device only and is never sent
anywhere. The screen says so verbatim: "Your age is stored only on this device
and never shared."

**Minor-safe mode is one-way.** If the entered age is below the region threshold,
`confirmAgeGate` records `isMinor: true` and thereafter refuses to accept a higher
age, nothing in the app verifies a typed age, so accepting one would let the
protected user switch the protection off. Only `clearAgeGate` lifts it, and the
locked screen tells the user the honest way to do that: reinstall the app. The
screen is `age-gate-minor-locked` in `app/(public)/age-gate.tsx`.

**What minor mode does.** `lib/contentFilter.ts` checks every outgoing prompt
against a shared blocklist before it reaches any model, local or cloud. The check
is synchronous and purely client-side. A blocked prompt gets the fixed
`MINOR_SAFE_REFUSAL` copy. Settings → Parental Controls
(`src/features/settings/parental-controls/index.tsx`) shows the state and can
review, but explicitly cannot turn it off.

**To exercise it:** tap Cloud sign-in, enter an age below the threshold for your
device's time zone, and the "Minor-safe mode enabled" screen appears.

## Reporting AI-generated content

Required by the Play GenAI policy, and implemented as an in-app control on the
turn itself rather than a link to a support page.

**Where the control is.** A flag button under **every completed assistant turn**.
`src/features/chat/components/MessageBubble.tsx` renders `<ReportFlagButton />`
whenever the message is from the assistant, is no longer streaming, and has
content. There is no per-conversation opt-in and nothing to enable first.

**What the user picks.** Six categories, from
`src/features/chat/components/ReportFlagButton.tsx`: harmful or dangerous,
inaccurate or misleading, offensive or hateful, misinformation, privacy concern,
other, plus a free-text note.

**Where the report goes.** `services/contentReport.ts`:

1. Writes the report to MMKV (`content-reports:v1`) first, so a failing network
   can never lose it.
2. `POST /api/mobile/content-report` to the AGI trust-and-safety intake. That
   route is `apps/web/app/api/mobile/content-report/route.ts`; it writes into
   `public.content_reports` (`apps/web/db/neon/0093_content_reports.sql`, triage
   columns in `0124_content_report_triage.sql`). `user_id` is nullable on purpose
   so a Local-only user with no Cloud account can still file a report.
3. Optionally opens the device mail client addressed to
   `support@agiworkforce.com`, only when the user ticks that box.

**Offline and Local Mode are handled honestly.** In Local Mode the egress guard
refuses the POST; the report stays on the device and the confirmation says
exactly that, "Report saved on this device … nothing was sent". The
`ReportDelivery` union and the `DELIVERY_TITLE` / `DELIVERY_BODY` maps in
`ReportFlagButton.tsx` make it impossible for a report that never left the phone
to be described as submitted.

## Permissions the app requests, and why

Declared in `app.config.js` → `android.permissions`:

| Permission     | Why                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RECORD_AUDIO` | Voice input in the chat composer (`src/features/voice/services/voiceInput.ts`), and live voice mode in an AGI Cloud chat, which streams the microphone to AGI Cloud over WebRTC for the session (`src/features/voice/services/liveVoiceSession.ts`). Declared as "Voice or sound recordings" in Data safety. |

Merged into the manifest by library config plugins rather than listed above:

- `CAMERA` from `expo-camera`, for taking a photo to attach to a chat and for
  document/text scanning with on-device OCR (`native/android/withAGIVisionOCR.cjs`).
- `USE_BIOMETRIC` from `expo-local-authentication`, for the optional App Lock,
  opt-in from Settings → Safety & Security. Off by default.
- `READ_EXTERNAL_STORAGE` (`android:maxSdkVersion="32"`) from `expo-image-picker`
  and `expo-file-system`, for choosing an existing image or document to attach on
  Android 12 and earlier. Android 13+ uses the photo picker and the document
  picker, which need no storage permission.

- `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` from `expo-notifications`,
  which is only added to production and preview builds (`conditionalPlugins` in
  `app.config.js`). Used for background-task and cloud-job completion alerts.
- `READ_CALENDAR` / `WRITE_CALENDAR` from `expo-calendar`, for the optional
  device-calendar context connector. Off by default; the permission strings say
  "only after you enable device calendar context".
- `com.android.vending.BILLING` from `expo-iap`, see **Billing** below.
- `WRITE_EXTERNAL_STORAGE` (`android:maxSdkVersion="32"`) from `expo-image-picker`'s
  own `AndroidManifest.xml`. It is legacy-only: on Android 13+ it is stripped by
  `maxSdkVersion` and the app never requests it.

**Runtime behaviour.** The permissions in the table above are requested on first
use, from a user action, never on launch and never on screen mount. The request
functions live in `src/features/settings/permissions/registry.ts`, and Settings →
Permissions shows the live OS status of each. Declining any one of them leaves the
rest of the app usable.

**One exception, stated plainly: notifications.** `POST_NOTIFICATIONS` is the only
permission the app can prompt for without a permission-specific tap. Once the user
has signed in to AGI Cloud and the app is in Cloud mode, a root-layout effect
(`app/_layout.tsx:275-297`) calls `registerForPushNotifications`, which requests
the permission if it is not already granted (`services/notifications.ts:154-159`).
On Android 13+ that is the system POST_NOTIFICATIONS dialog, and on a review device
it appears shortly after the first Cloud sign-in completes, not on a tap of a
notifications control. It never fires in Local Mode, never before sign-in, and
never on a fresh launch of a signed-out install; declining it leaves every other
feature working. The same permission can also be requested deliberately from
Settings → Permissions (`registry.ts` → `requestNotifications`).

**Not requested.** The app has no location permission and does not depend on
`expo-location` (it is not in `apps/mobile/package.json`). It collects no
advertising identifier, there is no `AD_ID` permission, no
`AdvertisingIdClient` call, and no ad SDK anywhere in the source tree;
`store-listing/android/data-safety.json` declares `usesAdvertisingId: false`
accordingly. Reminders access is iOS-only and short-circuits to `denied` on
Android (`registry.ts` → `getRemindersStatus`).

Speech recognition on Android is performed by the Android system speech service,
not by AGI's servers: `voiceInput.ts` starts `ExpoSpeechRecognitionModule` with
`requiresOnDeviceRecognition: true`, and `app.config.js` names
`com.google.android.googlequicksearchbox` as the speech service package.

## Data safety: and where each declaration is backed in code

Two files in the repo describe this declaration:
`store-listing/android/data-safety.json` holds the per-type records, and
`LISTING-METADATA-ANDROID.json` → `data_safety` holds the listing copy. **They now
declare the same seven types with the same sharing answer**; an earlier revision
of this file described two disagreements between them, and both have been closed
in the files rather than only in this prose.

| Declared type         | Backed by                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email address, Name   | Clerk sign-in only (`app/(auth)/login.tsx`). Never collected in Local Mode.                                                                                                                                   |
| User IDs              | The account identifier carried by authenticated cloud requests (`services/api.ts`).                                                                                                                           |
| Other in-app messages | Cloud-mode chat content, uploaded to AGI Cloud and processed by the model provider serving the request.                                                                                                       |
| Photos                | Image attachments the user picks for a Cloud message (`src/features/media/photo-picker.ts`), and the Cloud profile photo, which is uploaded to Clerk (`src/features/settings/index.tsx` → `handleEditPhoto`). |
| Files and docs        | A document attached to a Cloud message through `expo-document-picker` (`app/(app)/chat/[id].tsx:703`, `app/(app)/(tabs)/chat.tsx:596`).                                                                       |
| Device or other IDs   | An app-generated UUID from `lib/deviceId.ts`, registered with the push token by `services/notifications.ts` → `POST /api/mobile/push-token`. Created only when push is enabled; it is not an advertising ID.  |

Every type is marked optional in both files, because every one of them is
collected only after a Cloud sign-in the user does not have to perform: a
signed-out user who has completed onboarding lands in Local Mode and is never
redirected to a sign-in wall (`app/_layout.tsx`).

**Sharing: declared "no", and here is exactly what that rests on.** The ground
fact, which we state plainly because it is what you would find by inspecting
traffic: in Cloud mode the user's messages and attachments leave the device,
reach AGI Cloud, and are forwarded server-side to the model provider serving the
request. Both files answer Play's sharing question **no** on the service-provider
basis, the model, storage, auth and push subprocessors listed at
https://agiworkforce.com/subprocessors process that data on AGI's behalf, not for
their own purposes.

What the source tree can prove about this, and does:

- Every outbound request from the device goes to an AGI-controlled host.
  `agiworkforce.com`, `api.agiworkforce.com`, `signaling.agiworkforce.com`
  (`lib/constants.ts:2-16`), plus Clerk for sign-in and the push service. No
  third party receives data directly from the device.
- **The app contains no analytics SDK, no crash-reporting SDK and no ad SDK.**
  `apps/mobile/package.json` has no Sentry, Firebase, Crashlytics, Amplitude,
  PostHog, Mixpanel, Segment, Bugsnag or Datadog dependency, so no telemetry
  stream leaves for a third party's own purposes.
- No advertising identifier is collected: no `AD_ID` permission, no
  `AdvertisingIdClient` call, and `usesAdvertisingId: false` in
  `store-listing/android/data-safety.json`.

Whether Play's service-provider exception covers each subprocessor is a
contractual question the repo cannot settle, so we do not assert it from code.
it rests on the data-processing terms behind the subprocessor list above.

Security practices, each verifiable:

- **Encrypted in transit**: all cloud traffic goes through `services/secureFetch.ts`
  over HTTPS.
- **Encrypted at rest on the device**, SQLCipher plus an Android
  Keystore-backed key (`storage/db.ts`).
- **Deletion supported**: see the next section; the declared deletion endpoint
  is recorded in `store-listing/android/data-safety.json` as
  `apps/web/app/api/user/delete-account/route.ts`.

**Local Mode collects nothing.** That is not a promise about intent, it is
enforced by `lib/egressGuard.ts`, which blocks managed-cloud hosts outright while
Local Mode is active, verified in `__tests__/egress-guard.test.ts`.

## Billing: please read

The binary contains Google Play Billing integration. New purchase offers appear
only when the authenticated server catalog is enabled, configured with Google
Play product IDs, and the account has upgrade access. With a disabled catalog,
Billing shows an unavailable notice instead of new product offers. It still
shows **Restore purchases** for earlier subscriptions and unfinished
transactions. Registered products remain verifiable when new sales are switched
off, and an unverified transaction is not acknowledged to Play.

When offers are enabled, the app uses Play's localized price and purchase sheet,
then grants access only after server verification. An upgrade code grants
permission to see and buy store products; it does not grant a paid entitlement.
The code is redeemable in Billing, and a user can also join the upgrade waitlist
there. Existing subscriptions managed on another platform are identified to
avoid a second recurring charge. The app has no card-entry form or alternative
in-app checkout for these products.

The checked-in backend environment templates keep `MOBILE_IAP_ENABLED=false`;
this source tree cannot verify the live deployment flag or Play Console product
registration. Before submitting a build that offers purchases, set the Play
listing's in-app-products answer to true, update this note, give Play Review an
account with upgrade access, and validate purchase, restore, renewal and refund
paths with Play test purchases.

The `expo-iap` integration reads its product list from the server owner
`mobile-iap-catalog.ts`. The disabled catalog reasons are "Native purchases are
not enabled for this deployment." when the flag is off, and "Google Play
products have not been registered for this build." when the flag is on but the
Play product map is empty. Billing may first show **Loading native purchases**.
Its plan-change row can read **Upgrade plan**, **Adjust plan**, or **Choose plan**;
Team and Enterprise accounts may also see **Workspace administration**.

## External links

This section identifies website, store, legal and support destinations in the
current mobile source. `openExternalUrl` (`lib/safeOpenURL.ts`) accepts only
reviewed HTTPS hosts; other link handlers are described separately below.

**A. Billing and account-management destinations.** Availability depends on
the signed-in account and plan.

| #   | Control                                               | Opens                                                     | Call site                                                 | Who sees it                                                                                                                                                                                                             |
| --- | ----------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **View invoices** (Settings → Billing)                | `agiworkforce.com/billing`                                | `src/features/settings/cloud-billing/index.tsx:617`       | Paid plans only; the free tier gets an inert "No invoices yet" row with no handler.                                                                                                                                     |
| A2  | **Workspace administration** (Settings → Billing)     | `agiworkforce.com/settings/team`                          | `src/features/settings/cloud-billing/index.tsx:377`       | Team and Enterprise plans only.                                                                                                                                                                                         |
| A3  | **Manage on web** (subscription-owner alert)          | `agiworkforce.com/settings/billing`                       | `src/features/settings/cloud-billing/index.tsx:176`       | Accounts whose subscription is recorded as bought on our website or provisioned by an employer. For a Google Play-recorded subscription the same button opens Play's own subscription page.                             |
| A4  | **Contact Sales** (chat paywall sheet)                | `agiworkforce.com/contact-sales?plan=…`                   | `src/features/chat/components/PaywallBottomSheet.tsx:120` | Only when the gated feature needs Team or Enterprise. Not reachable from the Billing screen: `getNextUpgradeTier` returns only self-serve individual tiers (`packages/contracts/types/src/billing-catalog.ts:362-375`). |
| A5  | **Help with a purchase** (Settings → Billing)         | `agiworkforce.com/help?q=purchase+billing+credits+refund` | `src/features/settings/cloud-billing/index.tsx:624`       | Any signed-in Cloud account; this opens support guidance for charges, missing credits and refunds.                                                                                                                      |
| A6  | **Continue** on the "Change your email" alert         | `agiworkforce.com/settings/account`                       | `src/features/settings/cloud-account/index.tsx:98`        | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens anything.                                                                                                        |
| A7  | **Create on web** (Settings → Workspace, empty state) | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:438`                    | An account with **no workspace at all**, not only Team admins.                                                                                                                                                          |
| A8  | **Rename or delete this workspace on the web**        | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:545`                    | Any account that has a workspace loaded.                                                                                                                                                                                |
| A9  | **Add a member** (Settings → Workspace)               | `agiworkforce.com/settings/team`                          | `app/(app)/settings/workspace.tsx:134`                    | **Android only.** The browser branch is taken when `Platform.OS !== 'ios'` (`:132`); on iOS the same tap opens a native prompt instead.                                                                                 |

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

**C. Opened in an in-app Custom Tab, not the browser.** Settings → About opens
`agiworkforce.com`, `/privacy` and `/terms` through `openInAppBrowser`
(`app/(app)/about.tsx:224`, `:230`, `:236`). Assistant output that contains a link
opens the same way and is never auto-followed
(`src/features/chat/components/MessageContentRenderer.tsx:19-32`); a non-`http(s)`
scheme requires a confirmation alert first.

**D. Not `agiworkforce.com`.** Settings → Connectors → GitHub opens the GitHub App
install flow at `${API_URL}/api/github/install/start`
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
`artificialintelligenceact.eu`. A map result card opens the maps app
(`src/features/chat/components/InteractiveCardBlock.tsx:292`). `mailto:` to
`support@agiworkforce.com`, and the Android settings intents in
`src/features/edge-cases/components/StorageFullModal.tsx`, are the only other
`Linking.openURL` targets in the app.

**E. Present in source but unreachable in this binary.** The Stripe
billing-portal link (`src/features/settings/cloud-billing/index.tsx:213`), dead
behind `FEATURES.billing === false`.

Users who subscribed to AGI on the web see their plan's features unlocked when
they sign in here. The app never prices or initiates that purchase. **There is no
alternative in-app payment path**, no web checkout, no UPI sheet, no card form.
and none of the links above reaches one.

## Account deletion and data export

In-app, no support ticket and no website visit:

**Settings → Account → Delete Account** → confirmation alert → `DELETE
/api/user/delete-account`. The confirmation states that the AGI Cloud account and
all cloud data, chats, projects, memory, artifacts, are permanently deleted
within 24 hours, that it cannot be undone, and that on-device Local Mode data
stays on the device and must be removed separately. Source:
`src/features/settings/cloud-account/index.tsx`. The deletion is bound to the
account epoch captured when the dialog opened, so a mid-flight account switch
cannot delete the wrong account.

**Settings → Data Controls** offers **Export Local Data**, chats, memory,
settings and installed model details, which runs entirely on the device
(`src/features/settings/data-controls/index.tsx`,
`services/dsarExport.ts`). The same screen deletes all AGI Cloud chats;
device-only chats are wiped from Settings → Storage.

The web-facing deletion URL declared for Data safety is
`https://agiworkforce.com/settings/account`
(`store-listing/android/data-safety.json`).

## AI disclosure

First run shows a blocking disclosure before the device-tier screen
(`app/(public)/onboarding.tsx` → `composeFirstRunDisclosure`, accepted via
`recordDisclosureAcceptance`). Its summary states, verbatim:

- "You are interacting with an AI system."
- "Responses can be inaccurate. Review important output before using it."
- "AI-generated text, audio, image, or video is marked when you export or share it."

It also carries the EU AI Act Article 50(1) and 50(2) text verbatim and the
penalty notice (`packages/contracts/compliance/src/article50-disclosure.ts`).
Acceptance is recorded with a hash of the exact copy shown.

**What that third line covers in this binary, stated so it is not read wider than
the code.** The marking is implemented on the Data Controls export: Settings →
Data Controls → Export Local Data wraps each conversation transcript in a
machine-readable Article 50(2) provenance marker naming the provider and model
(`services/dsarExport.ts:49-72`, via `wrapTextExportWithMarker` in
`packages/contracts/compliance/src/article50-marker.ts:56-78`). The ordinary
conversation export and share from the chat screen, PDF, plain text, Markdown,
copy-to-clipboard (`services/fileCreation.ts`), carries role labels only and
does not add that marker. The disclosure sentence is a product commitment that
one export path meets today and the other does not yet.

In the chat UI itself, every completed assistant turn carries a provenance footer
naming its source, "AGI Cloud", or "Local Mode · <model name>" for on-device
inference (`src/features/chat/components/ProvenanceFooter.tsx:10-14`, rendered
from `src/features/chat/components/MessageBubble.tsx:894-895`). The footer names
the system rather than printing the literal words "AI-generated".

Before any model is downloaded, the device-tier screen names the recommended
model and its download size, and offers "Pick a different model", the user is
never given a model without being told which one it is.

We do not claim full compliance with India's DPDP Act 2023. The itemised notice
is published at https://agiworkforce.com/privacy/india; consent withdrawal and
the export/delete controls above are implemented; the obligations we have not met

- verifiable parental consent under s.9, notice in Eighth Schedule languages
  under s.6(4), and India data residency, are listed at
  https://agiworkforce.com/trust.

## Contact

- Play review contact: `review@agiworkforce.com`
- User support: `support@agiworkforce.com` / https://agiworkforce.com/support
- Privacy policy: https://agiworkforce.com/privacy

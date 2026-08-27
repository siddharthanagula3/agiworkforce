# Play Console Review Notes — AGI for Android

Status: Current
Owner: Mobile lead
Last updated: 2026-08-27
Applies to: `com.agiworkforce.app`, version 1.2.0 (`app.config.js` → `version`,
`android.package`)

Paste the body of this file into the **App content → App access → Instructions**
field in Play Console.
`store-listing/LISTING-METADATA-ANDROID.json` points
`play_console_review_notes_file` here.

Every statement below is checked against shipped code in `apps/mobile` (and, for
server endpoints, `apps/web`). Each claim names the file it was verified in. When
a behaviour changes, update this file in the same change — a Play reviewer reads
it as a factual claim about the APK/AAB.

Paths are relative to `apps/mobile` unless they begin with `apps/web`.

---

## What the app does

AGI is an AI assistant with two independent modes.

**Local Mode (default, no account).** A language model runs on the device. On a
device whose runtime tier resolves to the Android system model, AGI uses Google's
on-device ML Kit Prompt API over AICore — no model file is downloaded at all
(`native/android/withAGIAICore.cjs` pulls in `com.google.mlkit:genai-prompt`;
its catalog entry carries `fileSizeBytes: 0` because nothing is fetched). On every
other device the default is **AGI Standard**, an Apache-2.0 open-weights model of
roughly 2 GB at Q4, downloaded once and run through ExecuTorch or llama.rn. Both
entries, with their exact model identifiers, licences and sizes, are defined in
`packages/platform/local-llm/src/catalog.ts` — that file is the single source of
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
Cloud is a public alpha open to anyone who signs in; there is no invite code or
waitlist.

## How to review it — no account needed

Nothing in this app is behind credentials we have to hand you. Local Mode — the
core product — needs no account, and Cloud sign-up is open self-service:

1. **Local Mode requires no account.** Launch, tap through onboarding, chat.
   `app/_layout.tsx` carries a locked rule: a user who is not signed in but has
   completed onboarding lands in the app in Local mode and is never redirected to
   a sign-in wall.
2. **You can skip the model download entirely.** Two escapes, both on screen:
   - On the device-tier screen, **Sign in to use Cloud**
     (`testID="device-tier-cloud-btn"`) goes straight to Cloud sign-in without
     downloading anything.
   - On the download screen, **Continue to chat**
     (`testID="download-skip-btn"`) cancels the download and enters the app.

   Both live in `app/(public)/onboarding.tsx`. If the review device supports
   AICore, the card reads "Already on your device · Zero download" and there is
   nothing to wait for at all.

3. **Cloud sign-up is open self-service.** Any email address works; a
   verification code is emailed. Cloud chat and web search are available
   immediately on the free tier.

If you would prefer pre-provisioned credentials, email
`review@agiworkforce.com` and we will supply an account with a paid tier
attached within one business day.

## Age gate and minor-safe mode

Implemented in `src/features/auth/services/ageGate.ts` and
`app/(public)/age-gate.tsx`.

**Where it fires.** The gate guards Cloud sign-in, not first launch. The moment a
signed-out user heads for the auth group, `app/_layout.tsx` redirects to
`/(public)/age-gate` with `returnTo` set to the Cloud sign-in path. Local first
launch is deliberately _not_ gated — Local Mode sends nothing off the device, so
there is no data subject to protect and the gate would only be a wall. That
boundary is pinned by a test that fails if anyone reintroduces it:
`__tests__/age-gate-guards-cloud-not-local.test.ts`.

**Region-aware thresholds.** The threshold is chosen from the device's IANA time
zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — no location
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
age — nothing in the app verifies a typed age, so accepting one would let the
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

**Where the control is.** A flag button under **every completed assistant turn** —
`src/features/chat/components/MessageBubble.tsx` renders `<ReportFlagButton />`
whenever the message is from the assistant, is no longer streaming, and has
content. There is no per-conversation opt-in and nothing to enable first.

**What the user picks.** Six categories, from
`src/features/chat/components/ReportFlagButton.tsx`: harmful or dangerous,
inaccurate or misleading, offensive or hateful, misinformation, privacy concern,
other — plus a free-text note.

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
exactly that — "Report saved on this device … nothing was sent". The
`ReportDelivery` union and the `DELIVERY_TITLE` / `DELIVERY_BODY` maps in
`ReportFlagButton.tsx` make it impossible for a report that never left the phone
to be described as submitted.

## Permissions the app requests, and why

Declared in `app.config.js` → `android.permissions`:

| Permission                          | Why                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CAMERA`                            | Taking a photo to attach to a chat, and document/text scanning for on-device OCR (`native/android/withAGIVisionOCR.cjs`). |
| `RECORD_AUDIO`                      | Voice input in the chat composer (`src/features/voice/services/voiceInput.ts`).                                           |
| `READ_EXTERNAL_STORAGE`             | Choosing an existing image or document to attach (`expo-image-picker`, `expo-document-picker`).                           |
| `USE_BIOMETRIC` / `USE_FINGERPRINT` | Optional App Lock, opt-in from Settings → Safety & Security. Off by default.                                              |

Merged into the manifest by library config plugins rather than listed above:

- `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` from `expo-notifications`,
  which is only added to production and preview builds (`conditionalPlugins` in
  `app.config.js`). Used for background-task and cloud-job completion alerts.
- `READ_CALENDAR` / `WRITE_CALENDAR` from `expo-calendar`, for the optional
  device-calendar context connector. Off by default; the permission strings say
  "only after you enable device calendar context".
- `com.android.vending.BILLING` from `expo-iap` — see **Billing** below.
- `WRITE_EXTERNAL_STORAGE` (`android:maxSdkVersion="32"`) from `expo-image-picker`'s
  own `AndroidManifest.xml`, alongside the `READ_EXTERNAL_STORAGE` declared above.
  It is legacy-only: on Android 13+ it is stripped by `maxSdkVersion` and the app
  never requests it.

**Runtime behaviour.** The permissions in the table above are requested on first
use, from a user action — never on launch and never on screen mount. The request
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
advertising identifier — there is no `AD_ID` permission, no
`AdvertisingIdClient` call, and no ad SDK anywhere in the source tree;
`store-listing/android/data-safety.json` declares `usesAdvertisingId: false`
accordingly. Reminders access is iOS-only and short-circuits to `denied` on
Android (`registry.ts` → `getRemindersStatus`).

Speech recognition on Android is performed by the Android system speech service,
not by AGI's servers: `voiceInput.ts` starts `ExpoSpeechRecognitionModule` with
`requiresOnDeviceRecognition: true`, and `app.config.js` names
`com.google.android.googlequicksearchbox` as the speech service package.

## Data safety — and where each declaration is backed in code

Two files in the repo describe this declaration:
`store-listing/android/data-safety.json` holds the per-type records, and
`LISTING-METADATA-ANDROID.json` → `data_safety` holds the listing copy. Where they
differ, the differences are named below rather than papered over.

These are the six types `data-safety.json` declares, and nothing else:

| Declared type         | Backed by                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email address, Name   | Clerk sign-in only (`app/(auth)/login.tsx`). Never collected in Local Mode.                                                                                                                                   |
| User IDs              | The account identifier carried by authenticated cloud requests (`services/api.ts`).                                                                                                                           |
| Other in-app messages | Cloud-mode chat content, uploaded to AGI Cloud and processed by the model provider serving the request.                                                                                                       |
| Photos                | Image attachments the user picks for a Cloud message (`src/features/media/photo-picker.ts`), and the Cloud profile photo, which is uploaded to Clerk (`src/features/settings/index.tsx` → `handleEditPhoto`). |
| Device or other IDs   | An app-generated UUID from `lib/deviceId.ts`, registered with the push token by `services/notifications.ts` → `POST /api/mobile/push-token`. Created only when push is enabled; it is not an advertising ID.  |

**Two gaps between the two files, disclosed rather than smoothed over.** They are
reconciled in the Play Console form before submission; whoever fills the form uses
the resolution below, not whichever file they opened first.

- **"Files and docs".** `LISTING-METADATA-ANDROID.json` declares this type;
  `data-safety.json` has no entry for it. The behaviour it describes is real —
  `expo-document-picker` attaches a document to a Cloud message
  (`app/(app)/chat/[id].tsx:703`, `app/(app)/(tabs)/chat.tsx:596`) — so the type
  belongs in the submitted form and the missing `data-safety.json` entry is the
  defect, not the listing.
- **Whether data is shared.** `data-safety.json` sets
  `"sharedWithThirdParties": true` on "Other in-app messages" and "Photos";
  `LISTING-METADATA-ANDROID.json` sets `"data_shared": false` and argues in its
  `note` that the model, storage and push subprocessors listed at
  https://agiworkforce.com/subprocessors process that data on AGI's behalf under
  Play's service-provider exception rather than for their own purposes. The
  underlying fact both files describe is the same and is the one stated above:
  Cloud chat content and attachments leave the device, reach AGI Cloud, and are
  passed to the model provider serving the request. Only the Play classification
  differs, and this file makes no claim about which classification is submitted.

Security practices, each verifiable:

- **Encrypted in transit** — all cloud traffic goes through `services/secureFetch.ts`
  over HTTPS.
- **Encrypted at rest on the device** — SQLCipher plus an Android
  Keystore-backed key (`storage/db.ts`).
- **Deletion supported** — see the next section; the declared deletion endpoint
  is recorded in `store-listing/android/data-safety.json` as
  `apps/web/app/api/user/delete-account/route.ts`.

**Local Mode collects nothing.** That is not a promise about intent, it is
enforced by `lib/egressGuard.ts`, which blocks managed-cloud hosts outright while
Local Mode is active — verified in `__tests__/egress-guard.test.ts`.

## Billing — please read

**This build contains the Google Play Billing integration but offers no Play
products.**

- `expo-iap` is a config plugin (`app.config.js` → `plugins`), so
  `com.android.vending.BILLING` is merged into the manifest. That permission is
  present in the APK whether or not any product is offered.
- The Billing screen asks the server for its catalog:
  `GET /api/mobile/iap/catalog?platform=android`
  (`src/features/billing/mobileIapService.ts`).
- The server returns `enabled: false` unless the deployment sets
  `MOBILE_IAP_ENABLED` truthy **and** maps product keys to Play SKUs in
  `MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON`
  (`apps/web/lib/server/mobile-iap-catalog.ts`). The shipped configuration sets
  `MOBILE_IAP_ENABLED=false` (`apps/web/.env.example`,
  `apps/web/.env.local.example`).
- With the catalog disabled, Settings → Billing shows **"Native purchases are not
  configured"** with the reason the server actually returns in this configuration —
  _"Native purchases are not enabled for this deployment."_
  (`mobile-iap-catalog.ts:62-68`, rendered as `catalog.unavailableReason` at
  `src/features/settings/cloud-billing/index.tsx:480-487`). The sibling string
  "Google Play products have not been registered for this build" exists in the same
  file (`mobile-iap-catalog.ts:78-86`) but is unreachable here: it is returned only
  when `MOBILE_IAP_ENABLED` is truthy and no product IDs are mapped.
- **Upgrade plan** opens an in-app bottom sheet, never a browser and never a
  checkout (`src/features/settings/cloud-billing/index.tsx` → `handleUpgrade`,
  `paywallUnavailableMessage`; `src/features/chat/components/PaywallBottomSheet.tsx`).
  Its copy depends on the account
  (`src/features/settings/cloud-billing/index.tsx:136-143`): a free-tier or
  entitled account sees _"Plan changes aren't available in the app yet. Check back
  soon."_, and a signed-in account that is neither free-tier nor entitled sees
  _"Billing management isn't available in the app yet. Please try again later."_
  Both are dead ends by design.
- "Manage billing" is not rendered at all: `FEATURES.billing` is `false`
  (`lib/v1FeatureFlags.ts`).

**If the Play products are registered before this build goes live**, the same
screen renders subscription and top-up rows priced by Play, and every purchase
goes through `requestPurchase` on Google Play Billing with the account bound via
`obfuscatedAccountId`; access is granted only after the server verifies the
signed store transaction (`src/features/billing/useMobileIap.ts`,
`apps/web/app/api/mobile/iap/verify/route.ts`). There is no alternative in-app
payment path — no web checkout, no UPI sheet, no card form.

Three external links exist and we would rather disclose them than have you find
them:

1. **View invoices** (Settings → Billing) opens `agiworkforce.com/billing`. The
   row is actionable **only** for accounts that already hold a paid plan; on the
   free tier it is an inert "No invoices yet" row with no handler. It is billing
   history for a subscription bought on the web.
2. **Contact Sales** appears only when the gated feature requires the Team or
   Enterprise plan, and opens `agiworkforce.com/contact-sales?plan=…` — a lead
   form. No price and no checkout is presented in the app
   (`PaywallBottomSheet.tsx` → `salesTier`).
3. **Workspace administration** appears only for Team plan administrators and
   opens `agiworkforce.com/settings/team`.

Users who subscribed to AGI on the web see their plan's features unlocked when
they sign in here. The app never prices or initiates that purchase.

## Account deletion and data export

In-app, no support ticket and no website visit:

**Settings → Account → Delete Account** → confirmation alert → `DELETE
/api/user/delete-account`. The confirmation states that the AGI Cloud account and
all cloud data — chats, projects, memory, artifacts — are permanently deleted
within 24 hours, that it cannot be undone, and that on-device Local Mode data
stays on the device and must be removed separately. Source:
`src/features/settings/cloud-account/index.tsx`. The deletion is bound to the
account epoch captured when the dialog opened, so a mid-flight account switch
cannot delete the wrong account.

**Settings → Data Controls** offers **Export Local Data** — chats, memory,
settings and installed model details — which runs entirely on the device
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

Before any model is downloaded, the device-tier screen names the recommended
model and its download size, and offers "Pick a different model" — the user is
never given a model without being told which one it is.

We do not claim full compliance with India's DPDP Act 2023. The itemised notice
is published at https://agiworkforce.com/privacy/india; consent withdrawal and
the export/delete controls above are implemented; the obligations we have not met
— verifiable parental consent under s.9, notice in Eighth Schedule languages
under s.6(4), and India data residency — are listed at
https://agiworkforce.com/trust.

## Contact

- Play review contact: `review@agiworkforce.com`
- User support: `support@agiworkforce.com` / https://agiworkforce.com/support
- Privacy policy: https://agiworkforce.com/privacy

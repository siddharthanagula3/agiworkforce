# Play Console Review Notes, AGI for Android

Status: Current
Owner: Mobile lead
Last updated: 2026-11-17
Applies to: `com.agiworkforce.app`, version 0.0.1 (`app.config.js` → `version`,
`android.package`)

`store-listing/LISTING-METADATA-ANDROID.json` points
`play_console_review_notes_file` here. In Play Console, **App content → App
access** takes the review account's email and password in their own fields and
a short instruction text; only the text in the next section goes there. The
rest of this file is the reference behind it and behind the Data safety form:
answer the Play reviewer from it if they ask.

## Paste this into App access

Google's pages read on 2026-11-15 (answers 15748846 and 9859455) allow up to
five instruction sets and state no length limit for the instruction field, so
this text is kept short rather than held to a known limit. When pasting, check
the field's character counter in Play Console.

```text
Local Mode works without an account. AGI Cloud needs the sign-in above; no one-time code is needed.
1. Finish onboarding, then tap Cloud in the Local/Cloud switch (side menu or Settings).
2. Age step: share the age signal if Android asks, or enter an age of 18 or more.
3. Sign in with the email and password above, and accept the Terms if asked.
4. Before AGI Cloud opens, the app asks "Share with AI providers?": tap Allow. Not now keeps Local Mode, and tapping Cloud asks again. To withdraw: Settings > Privacy > Share with AI providers, off.
Nothing is sold on any platform before 1 January 2027: the app has no purchase, upgrade or price, and no plan or credit can be bought on the web either. The review account's plan was granted for this review without a purchase.
Report: three-dot menu under any answer. Delete Account: Settings > Email > Danger Zone; in Local Mode, Settings > Data Controls > Delete account, then Check deletion status.
```

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
about 2.7 GB, downloaded once and run through ExecuTorch or llama.rn. Both
entries, with their exact model identifiers, licences and sizes, are defined in
`packages/platform/local-llm/src/catalog.ts`, that file is the single source of
truth for what can run on a device, and this document deliberately points at it
rather than restating identifiers that would then drift.

Local chats are stored in an MMKV store encrypted with AES-128 in CFB mode,
keyed by 16 random printable characters (about 105 bits) held by
`expo-secure-store`, which is Android Keystore-backed (`lib/mmkv.ts`). On-device
memory and model records use a local SQLite database encrypted with SQLCipher
(AES-256-CBC with HMAC-SHA512 under a random 256-bit key; `app.config.js` →
`['expo-sqlite', { useSQLCipher: true }]`, key handling in `storage/db.ts`).

Local Mode does not merely _avoid_ our servers, it is prevented from reaching
them: `lib/egressGuard.ts` throws `EgressBlockedError` on any outbound request to
an AGI managed-cloud host while Local Mode is active. The exceptions are a
content report the person chooses to send with its own **Send** tap
(`consentedReport`, see **Reporting AI-generated content**) and, for an account
that is already signed in, two kinds of control that carry no chat content: the
account controls (Terms, account deletion and its status and cancellation, the
identity check for deletion, and the data export), because deletion and export
must not depend on sharing with AI providers; and the controls that pause the
account's scheduled and running tasks when the person turns off sharing with AI
providers. AGI Cloud itself is
open only while the signed-in account allows sharing with AI providers
(`services/providerConsent.ts`, `src/features/chat/store/cloudModeDoor.ts`).

**AGI Cloud (optional, requires sign-in).** Signing in enables server-side chat
and web search on the Free plan, which is open to anyone who signs in
(`lib/v1FeatureFlags.ts` → `cloudChat`, `webSearch` are `true`). Sign-in is
the app's own form, not a browser (`app/(auth)/login.tsx`,
`src/features/auth/components/MobileSignIn.tsx`): **Email address**,
**Continue**, then a password or an emailed code, with Google and GitHub
buttons; Clerk's native `AuthView` opens only from **More sign-in options** or
as a fallback. Remote Control and Send to Desktop are not in this version
(`companion` and `dispatch` are `false`). This version is free, sells nothing
and has no in-app products; see **Billing** below.

## How to review it

Local Mode needs no account. Launch the app, complete onboarding and start a
local chat. On devices without the supported system model, a local model must
be downloaded before offline inference.

Cloud features require sign-in. Before submission, provide an active review
account (email and password, no one-time code) in Play Console's secure App
access instructions; do not put credentials in this repository. The Cloud entry path
includes age confirmation, and a signed-in account must accept the current
Terms before Cloud unlocks. The review account needs no purchase setup: this
version has no in-app products.

**Consent before AGI Cloud opens.** After sign-in and the Terms, and whenever a
signed-in person taps **Cloud** in Local Mode, the app asks **Share with AI
providers?**, names each provider, and offers **Details**, **Not now** and
**Allow**. Without **Allow** the app cannot be in AGI Cloud: **Not now** keeps
it in Local Mode, signed in, and tapping **Cloud** asks again. The Back key on
the question counts as **Not now**. The permission belongs to the account that
gave it; another account on the same device is asked itself. Messages,
attachments, picture and video requests, the image editor and live voice check
it again before they send (`services/llmGate.ts`,
`src/features/chat/actions/mediaGenerationConsent.ts`,
`src/features/voice/services/liveVoiceSession.ts`).

**Withdrawing it.** Settings → **Privacy** → **Share with AI providers**,
captioned "AGI Cloud needs this. Off keeps Local Mode." The switch shows in AGI
Cloud, and in Local Mode while the account's permission is on. Turning it off
withdraws the permission at once: the app returns to Local Mode and stays
there, live voice and answers being written stop, and the account's active
schedules and running tasks are paused, never cancelled. When there was
something to pause, one line says what was paused or what could not be.
Turning it on asks the same question
(`src/features/settings/cloud-privacy/CloudProviderSharingGroup.tsx`).

## Age gate and minor-safe mode

Implemented in `src/features/auth/services/ageGate.ts` and
`app/(public)/age-gate.tsx`.
That screen first asks Play Age Signals for the age range (`expo-age-range`) and falls back to typed age if none is shared.

**Where it fires.** The gate guards Cloud sign-in, not first launch. The moment a
signed-out user heads for the auth group, `app/_layout.tsx` redirects to
`/(public)/age-gate` with `returnTo` set to the Cloud sign-in path. Local first
launch is deliberately _not_ gated, Local Mode sends no chat content and no
account data off the device, so the gate would only be a wall. That
boundary is pinned by a test that fails if anyone reintroduces it:
`__tests__/age-gate-guards-cloud-not-local.test.ts`.

**Threshold: 13, or the regional age where that is higher.** `getAgeThreshold`
takes the larger of the device time zone's regional age and `ACCOUNT_MINIMUM_AGE`
(13, in `packages/contracts/types/src/account-eligibility.ts`), so Cloud sign-in
asks for the regional age in the table below and never for less than 13. The
region comes from the device's IANA time zone
(`Intl.DateTimeFormat().resolvedOptions().timeZone`), no location permission, no
IP geolocation, no network call, and no regional age is above 18:

| Regional age | Regions (by time-zone prefix)                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18           | India (`Asia/Kolkata`, `Asia/Calcutta`), Brazil (all `America/*` BR zones)                                                                                                     |
| 16           | EU member-state zones (AT, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK), plus North Macedonia (`Europe/Skopje`, MK) |
| 13           | United Kingdom (`Europe/London`, Belfast, Jersey, Guernsey)                                                                                                                    |
| 13           | Everywhere else (`DEFAULT_RULE`), including when the time zone cannot be read                                                                                                  |

**What it stores.** One MMKV record under `age-gate:v1`: confirmed flag, minor
flag, timestamp, region code, threshold. It is on-device only and is never sent
anywhere. The screen says so verbatim: "Your age stays on this device and is
never shared."

**Minor-safe mode is one-way.** If the entered age is under the device's
threshold, `confirmAgeGate` records `isMinor: true` and thereafter refuses to accept a higher age, nothing in
the app verifies a typed age, so accepting one would let the protected user
switch the protection off. Only `clearAgeGate` lifts it, and the refusal screen
tells the user the honest way to do that: "This device recorded an age under
13, which only erasing AGI’s data on this device can reset." (with the
regional age in place of 13). The screen is `age-gate-refused` in
`app/(public)/age-gate.tsx`.

**What minor mode does.** `lib/contentFilter.ts` checks every outgoing prompt
against a shared blocklist before it reaches any model, local or cloud. The check
is synchronous and purely client-side. A blocked prompt gets the fixed
`MINOR_SAFE_REFUSAL` copy. Settings → Parental Controls
(`src/features/settings/parental-controls/index.tsx`) shows the state and can
review, but explicitly cannot turn it off.

**To exercise it:** tap Cloud sign-in, enter an age under 13, and the "Age
requirement" screen appears; Settings → Parental Controls then reads "Minor-safe
mode is active". Only erasing AGI's data on that device lets it sign in to
Cloud again.

## Reporting AI-generated content

Required by the Play GenAI policy, and implemented as an in-app control on the
turn itself rather than a link to a support page.

**Where the control is.** On **every completed assistant turn**, **Report…** is
in the menu that the three-dot button under the answer opens (TalkBack: **More
message actions**), and in the same menu on a long press.
`src/features/chat/components/MessageBubble.tsx` offers it whenever the message
is from the assistant, is no longer streaming, and has content or a generated
image or video. There is no per-conversation opt-in and nothing to enable
first. A generated image or video also has a Report control in its full-screen
viewer (`src/features/chat/components/ImageFullScreen.tsx`,
`src/features/chat/components/VideoPlayerModal.tsx`), a research report and an
artifact preview have one in their header
(`src/features/research/ReportsScreen.tsx`, `src/features/artifacts/index.tsx`),
and an item shared with the person has its own **Report**
(`src/features/shared-with-you/SharedItemSafetyActions.tsx`).

**What the user picks.** One report sheet, `ReportSheet` in
`src/features/chat/components/ReportFlagButton.tsx`, with six categories:
harmful or dangerous, inaccurate or misleading, offensive or hateful,
misinformation, privacy concern, other, plus a free-text note.

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
refuses the POST, and the sheet asks **Send this report to AGI?** with "Saved on
this device. Nothing was sent." Only a tap on **Send** lets that one report
through the guard (`consentedReport` in `lib/egressGuard.ts`); when the phone is
offline it reads **Report queued** and sends as soon as it can. **Email support
instead** hands it to the mail app. The `ReportDelivery` union and the
`DELIVERY_TITLE` / `DELIVERY_BODY` maps in `ReportFlagButton.tsx` make it
impossible for a report that never left the phone to be described as
submitted.

## Permissions the app requests, and why

Declared in `app.config.js` → `android.permissions`:

| Permission     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECORD_AUDIO` | Voice input in the chat composer (`src/features/voice/services/voiceInput.ts`), and live voice mode in an AGI Cloud chat: AGI Cloud sets up the WebRTC call with the voice provider, then the audio streams directly between the device and that provider (`src/features/voice/services/liveVoiceSession.ts`, `apps/web/app/api/voice/live/sessions/route.ts`, and the app's own Privacy, Data use & access screen, `src/features/settings/cloud-privacy/DataUseScreen.tsx`). Declared as "Voice or sound recordings" in Data safety. |

Merged into the manifest by library config plugins rather than listed above:

- `CAMERA` from `expo-camera`, for taking a photo to attach to a chat and for
  document/text scanning with on-device OCR (`native/android/withAGIVisionOCR.cjs`).
- `USE_BIOMETRIC` from `expo-local-authentication`, for the optional App Lock,
  opt-in from Settings → Safety & Security. Off by default.
- `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` from `expo-notifications`,
  which is only added to production and preview builds (`conditionalPlugins` in
  `app.config.js`). Used for a notice when a reply finishes while the app is in
  the background (`services/replyReadyNotice.ts`). Pushes from AGI Cloud need
  Firebase Cloud Messaging: `app.config.js` sets `googleServicesFile` only when
  the build has `GOOGLE_SERVICES_JSON`, and without it registration fails
  quietly and the Notifications screen says the device could not be registered
  (`services/notifications.ts`). Background polling is off in this version
  (`lib/v1FeatureFlags.ts`, `dispatch` is `false`).
- `READ_CALENDAR` / `WRITE_CALENDAR` from `expo-calendar`, optional: the calendar
  is read when the user asks about their schedule in a Cloud chat, and the
  events read (titles, times, places, notes) go to AGI Cloud and the model
  provider, declared as "Calendar events" in Data safety
  (`src/features/integrations/services/phoneDeviceSteps.ts`); an event is added
  only after the user confirms it in a chat
  (`src/features/settings/permissions/registry.ts` → `calendar`).
- `READ_EXTERNAL_STORAGE`, `READ_MEDIA_VISUAL_USER_SELECTED`,
  `ACCESS_MEDIA_LOCATION` and `SYSTEM_ALERT_WINDOW`, which libraries would add,
  are removed through `android.blockedPermissions` in `app.config.js`. Images and
  documents are chosen through the system photo picker and document picker.
- `com.android.vending.BILLING`, which `expo-iap` would add, is removed from the
  manifest: `app.config.js` lists it in `android.blockedPermissions` while
  `src/features/billing/storePurchases.json` sets `"nativePurchases": false`. See **Billing**
  below.
- `WRITE_EXTERNAL_STORAGE`. `expo-image-picker` and `expo-media-library` declare
  it in their own `AndroidManifest.xml` with `android:maxSdkVersion="32"`, and
  the `expo-media-library` config plugin also adds it at app level without that
  cap, with `android:requestLegacyExternalStorage="true"`
  (`node_modules/expo-media-library/plugin/build/withMediaLibrary.js`). Whether
  the merged manifest keeps the cap is checked on the first release build.

**Runtime behaviour.** The permissions in the table above are requested on first
use, from a user action, never on launch and never on screen mount. The request
functions live in `src/features/settings/permissions/registry.ts`, and Settings →
Permissions shows the live OS status of each. Declining any one of them leaves the
rest of the app usable.

**Notifications follow the same rule.** On Android 13+ the system
POST_NOTIFICATIONS dialog appears only when the user taps **Turn on
notifications** in Settings → Notifications (`services/notifications.ts` →
`enablePushNotifications`) or **Allow Notifications** in Settings → Permissions →
Notifications (`registry.ts` → `requestNotifications`). Signing in to AGI Cloud
registers the device for push only when notifications are already allowed, and
never shows the dialog (`app/_layout.tsx`, `services/notifications.ts` →
`registerForPushNotifications`). The app targets API 36, so creating its
notification channels does not show the dialog either. Declining it leaves every
other feature working.

**Not requested.** The app has no location permission and does not depend on
`expo-location` (it is not in `apps/mobile/package.json`). It collects no
advertising identifier, there is no `AD_ID` permission, no
`AdvertisingIdClient` call, and no ad SDK anywhere in the source tree;
`store-listing/android/data-safety.json` declares `usesAdvertisingId: false`
accordingly. Reminders access is iOS-only and short-circuits to `denied` on
Android (`registry.ts` → `getRemindersStatus`).

Dictation is offered only on Android 13 (API 33) and later, where the on-device
recognizer exists. On Android 8 to 12L the composer shows no dictation
microphone (`onDeviceRecognizerGuaranteed` in
`src/features/voice/services/voiceInput.ts`), and `voiceInput.ts`
refuses dictation there before asking for the microphone. Where it is offered,
speech recognition is performed on the device by the Android system speech
service, not by AGI's servers: `voiceInput.ts` starts
`ExpoSpeechRecognitionModule` with `requiresOnDeviceRecognition: true`, and
`app.config.js` names `com.google.android.googlequicksearchbox` as the speech
service package. A speech language with no on-device model installed gets a
message saying so; the audio is never sent to a server instead.

## Data safety: and where each declaration is backed in code

Two files in the repo describe this declaration:
`store-listing/android/data-safety.json` holds the per-type records, and
`LISTING-METADATA-ANDROID.json` → `data_safety` holds the listing copy. They
declare the same thirteen Play types with the same sharing and optional answers
(Other in-app messages has two records, one for chat content and one for support
messages), and
`__tests__/ios-store-submission-config.test.ts` fails if they drift apart.

| Declared type             | Shared | Optional | Backed by                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email address, Name       | No     | Yes      | Clerk sign-in only (`app/(auth)/login.tsx`). Never collected in Local Mode.                                                                                                                                                                                                                                                                                                              |
| User IDs                  | No     | Yes      | The account identifier carried by authenticated cloud requests (`services/api.ts`).                                                                                                                                                                                                                                                                                                      |
| Other in-app messages     | Yes    | Yes      | Cloud-mode chat content, uploaded to AGI Cloud and forwarded to the model provider serving the request; and the support tickets and in-app feedback the user writes in Cloud mode (`src/features/support/service.ts`, `src/features/feedback/index.tsx`), which go to no model provider.                                                                                                 |
| Photos                    | Yes    | Yes      | Image attachments the user picks for a Cloud message (`src/features/media/photo-picker.ts`), and the Cloud profile photo, which is uploaded to Clerk (`src/features/settings/index.tsx` → `handleEditPhoto`).                                                                                                                                                                            |
| Files and docs            | Yes    | Yes      | A document attached to a Cloud message through `expo-document-picker` (`app/(app)/chat/[id].tsx`, `app/(app)/(tabs)/chat.tsx`).                                                                                                                                                                                                                                                          |
| Voice or sound recordings | Yes    | Yes      | Live voice in an AGI Cloud chat: AGI Cloud sets up the call, then the audio streams directly between the device and the voice provider (`src/features/voice/services/liveVoiceSession.ts`). Not marked ephemeral, because the provider's retention is not established. Dictation transcribes on the device and uploads no audio.                                                         |
| Calendar events           | Yes    | Yes      | Events a Cloud chat reads when the user asks about their schedule and allows calendar access, sent to AGI Cloud and the model provider (`src/features/integrations/services/phoneDeviceSteps.ts`, `stores/chat/chatExecutionStore.ts`).                                                                                                                                                  |
| In-app search history     | Yes    | Yes      | Chat search queries sent to `/api/search` (`stores/chat/chatViewStore.ts`), recorded by the server and sent to the embedding provider when the account has indexed content (`apps/web/app/api/search/route.ts`).                                                                                                                                                                         |
| Device or other IDs       | No     | No       | Expo's per-install client ID with the update check on every launch; Google ML Kit's per-installation identifiers; and, while signed in, an app-generated install ID from `lib/deviceId.ts` with the device name and OS version, sent on every active session (`src/features/device-registry/heartbeat.ts`) and with the push token (`services/notifications.ts`). Not an advertising ID. |
| App interactions          | No     | Yes      | Product analytics events in AGI Cloud, only after the user allows them in Settings → Privacy → Product analytics (`src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup.tsx`).                                                                                                                                                                                               |
| Diagnostics               | No     | No       | Google ML Kit's device information, app information and performance metrics, sent when on-device text recognition, translation or the Android system model runs, Local Mode included; and the diagnostics a Cloud support ticket attaches unless the user turns that off (`src/features/settings/diagnostics/diagnosticsBundle.ts`).                                                     |
| Crash logs                | No     | No       | The launch error and failed update IDs `expo-updates` sends with the update check on every launch.                                                                                                                                                                                                                                                                                       |

**Optional.** A type is optional when only a Cloud sign-in, which the user does
not have to perform, or a feature the user chooses sends it: a signed-out user
who has completed onboarding lands in Local Mode and is never redirected to a
sign-in wall (`app/_layout.tsx`). Device or other IDs, Diagnostics and Crash
logs are required, because SDKs send them on installs that never sign in and the
app gives no control over them.

**Sharing: declared "yes" for messages, photos, files, voice, calendar events
and search history.** Google defines sharing as a transfer to a third party and
exempts a service provider that processes data on the developer's behalf (the
service-provider exception). In Cloud mode those types reach the model, voice
or embedding provider serving the request. On the Free plan some of those
providers' terms allow training on what they receive, which is use for their
own purposes, so the exception cannot be shown to apply and those types are
declared shared (`sharingBasis` in `store-listing/android/data-safety.json`).
Identity data goes only to Clerk, push delivery only to the push service,
update checks only to Expo and ML Kit diagnostics only to Google, each to
provide its service, so those types are declared not shared. The subprocessors
are listed at https://agiworkforce.com/subprocessors.

What the source tree can prove about this, and does:

- The device talks to AGI's hosts (`agiworkforce.com`, `api.agiworkforce.com`,
  `signaling.agiworkforce.com`; `lib/constants.ts` → `API_URL`, `GATEWAY_URL`,
  `WS_URL`), Clerk for sign-in, the push service, Expo's update service on
  every launch (`expo-updates`), Google for ML Kit diagnostics, and, in live
  voice, the voice provider directly.
- **The app contains no ad SDK and no crash-reporting or analytics SDK of its
  own choosing.** `apps/mobile/package.json` has no Sentry, Firebase,
  Crashlytics, Amplitude, PostHog, Mixpanel, Segment, Bugsnag or Datadog
  dependency, and product analytics events go only to AGI Cloud. Google's ML Kit
  SDKs, linked through Gradle for on-device text recognition, translation and
  the Android system model (`native/android/withAGIVisionOCR.cjs`,
  `withAGITranslate.cjs`, `withAGIAICore.cjs`), send their own diagnostics to
  Google, declared above.
- No advertising identifier is collected: no `AD_ID` permission, no
  `AdvertisingIdClient` call, and `usesAdvertisingId: false` in
  `store-listing/android/data-safety.json`.

Security practices, each verifiable:

- **Encrypted in transit**: all cloud traffic goes through `services/secureFetch.ts`
  over HTTPS.
- **Encrypted at rest on the device**, SQLCipher plus an Android
  Keystore-backed key (`storage/db.ts`).
- **Deletion supported**: see the next section; the declared deletion endpoint
  is recorded in `store-listing/android/data-safety.json` as
  `apps/web/app/api/user/delete-account/route.ts`.

**Local Mode sends AGI no chat content.** That is enforced by
`lib/egressGuard.ts`, which blocks managed-cloud hosts while Local Mode is
active, verified in `__tests__/egress-guard.test.ts`. The one thing Local Mode
sends to AGI without a sign-in is a content report, and only after the person
taps **Send** on it. Signed in, Local Mode also sends the account and
withdrawal controls described under **What the app does**, none of which
carries chat content. The update check to Expo and ML Kit's diagnostics to Google
still run in Local Mode, as declared above.

## Billing: please read

**This version is free and has no in-app products. Nothing is sold in the app,
there is no card-entry form or other checkout, and nothing in the app links to a
purchase.**

One build-level value decides it: `src/features/billing/storePurchases.json` sets
`"nativePurchases": false`, and
`src/features/billing/nativePurchaseAvailability.ts` exports it as
`NATIVE_PURCHASES_AVAILABLE`, which every purchase path reads. It is fixed at
build time; no server response or over-the-air update can turn it on. With it
false:

- The app shows no purchase, upgrade, top-up, restore-purchases,
  compare-plans or contact-sales control, and no price.
- The app never opens a Play Billing connection.
  `src/features/billing/useMobileIap.ts` picks an inert implementation at build
  time, and `src/features/billing/mobileIapService.ts` refuses catalog and
  verify calls, so the app never calls `/api/mobile/iap/*`.
- `app.config.js` removes the permission `com.android.vending.BILLING` from the
  manifest.
- The purchase client library `expo-iap` (5.8.3, `package.json`) is still linked
  into the binary and its config plugin is still registered in `app.config.js`,
  but nothing calls it.
- On the server, the `/api/mobile/iap/*` routes (owner
  `apps/web/lib/server/mobile-iap-catalog.ts`) stay off unless the deployment
  sets `MOBILE_IAP_ENABLED`. This version never calls them either way.

What you will see under **Settings → Subscription**: a screen titled **Subscription**
(`src/features/settings/cloud-billing/index.tsx`, the
`if (!NATIVE_PURCHASES_AVAILABLE)` branch) with:

- **Current plan**, and the renewal or end date if the plan has one.
- **Billing**, as plain text with no link, only for an account that already
  holds a paid plan: **Managed on the web**, **By your organization** (a
  workspace plan), **Included with your account** (a personal plan given without
  a purchase), or **Managed where you subscribed**. A Free-plan account gets no
  Billing row.
- **What your plan includes**, which lists the current plan's features only.
- **Usage**: on a paid plan, the account's usage read natively from the usage
  API; on the Free plan, a short explanation of how its limits reset, with no
  meters (`src/features/settings/cloud-usage/index.tsx`).
- **Help with your plan**, which opens the in-app support screen.

How a locked feature is presented: the chat sheet says the item "isn’t
included in your plan" (or that the plan's allowance is used up for now) and
offers **Close**, plus **Choose a standard model** when the locked item is a
model, with no upgrade button, plan comparison or link
(`src/features/chat/components/PaywallBottomSheet.tsx`). A screen whose feature
the plan leaves out, such as Connectors on the Free plan, reads **Not on your
plan** and "Your current plan does not include this." (`src/lib/Capabilities.tsx`).
Server messages are shown without any sentence or alternative about upgrading,
pricing, access codes, the waitlist or credits (`services/failureCopy.ts`), and
server notices about billing are not shown. A model the plan does not include
is not listed in the model picker.

Paid plans exist for the AGI Cloud web product, but nothing is sold on any
platform before 1 January 2027: no plan or credit can be bought in this app, on
the web or anywhere else. The plans that exist were granted without a purchase.
An account that holds one gets that plan's access after signing in here. The app
neither sells nor advertises plans, names no price, and has no link to a
purchase.

The review account's plan was granted to it for this review without a purchase,
so its Plan screen shows **Billing: Included with your account**. It needs no
purchase setup: there are no test purchases to make, no products to load and
nothing to restore.

Before submitting (operator step, not for the reviewer): do not activate Play
products for this release. Selling in the app needs `nativePurchases` set to
`true`, a new build and a new review.

## External links

This section identifies website, legal and support destinations in the
current mobile source. `openExternalUrl` (`lib/safeOpenURL.ts`) accepts only
reviewed HTTPS hosts; other link handlers are described separately below.

Pages on `agiworkforce.com` are opened through `src/platform/webContentPage.ts`.
`openWebContentPage` adds `from=mobile` to the address and opens the page in
an in-app Custom Tab. `openWebAccountPage` adds the same marker, opens only
`/settings/account` and `/settings/security`, and opens nothing for any other
address.

**A. Account destinations.** These account links render in this version:

| #   | Control                                                                                 | Opens                                                     | Call site                                                       | Who sees it                                                                                                         |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A1  | **Continue** on the "Change your email" alert                                           | `agiworkforce.com/settings/account`                       | `src/features/settings/cloud-account/index.tsx`                 | Any signed-in Cloud account. Email change is not implemented in-app; the alert says so before it opens the browser. |
| A2  | **Advanced Account Security**, **Add or remove a sign-in method**, **Open Web account** | `agiworkforce.com/settings/security`, `/settings/account` | `src/features/settings/account-security/index.tsx`              | Any signed-in Cloud account. Opens in an in-app Custom Tab.                                                         |
| A3  | **Turn on** in the two-factor banner                                                    | `agiworkforce.com/settings/security`                      | `src/features/settings/account-security/WorkspaceMfaBanner.tsx` | A member of a workspace that requires two-factor authentication. In-app Custom Tab.                                 |
| A4  | A security recommendation on the workspace administration screen                        | an `agiworkforce.com/workspace/*` admin page              | `src/features/team/WorkspaceAdministration.tsx`                 | A workspace administrator. In-app Custom Tab.                                                                       |

No link in the app opens a page about pricing, billing, invoices, sales or
upgrades. The `agiworkforce.com` pages it opens carry `from=mobile`, which makes
the site leave out its pricing and contact-sales links; that website change
(`apps/web/lib/embedded-page.ts`) must be deployed before review (operator
check, not for the reviewer: on 2026-11-15 production pages opened that way
still linked to `/pricing` and `/contact-sales`).

**B. Non-billing destinations.** In an in-app Custom Tab, through
`openWebContentPage`: the sign-in and account-creation flows open Terms,
Privacy, data-use and acceptable-use pages on `agiworkforce.com`; the account
Terms confirmation also links to Terms and Privacy (`app/(auth)/login.tsx`,
`src/features/auth/components/MobileSignUp.tsx`). Settings → Privacy links to
Privacy, Data rights requests and Terms
(`src/features/settings/cloud-privacy/index.tsx`). Settings → Personalization links its
custom-instructions helper to the acceptable-use page
(`src/features/settings/personalization/index.tsx`). The updated Terms notice
opens `/terms` (`services/termsNotice.ts`). The desktop-pairing safety
disclosure opens `agiworkforce.com/security`
(`src/features/companion/components/PairingRiskDisclosure.tsx`), but it is on
the Remote Control screen, which this version does not show. In the browser:
password recovery opens `agiworkforce.com/login`, whose password step offers
Forgot password, and account recovery opens `agiworkforce.com/recover`
(`app/(auth)/reset-password.tsx`); when the server refuses a locked or
suspended account, the alert's **Open on the web** opens the reset-password or
appeal page (`services/api.ts`).

**C. Opened in an in-app Custom Tab, not the browser.** The Custom Tab is
opened by `lib/safeOpenURL.ts`, so the person never leaves the app. Through
`openWebContentPage`: Settings →
About opens `/privacy`, `/terms`, `/acceptable-use`, `/help` and `/status`
(`app/(app)/about.tsx`); Settings opens the Help Center
(`src/features/settings/index.tsx`); Settings → Permissions opens a help article
(`src/features/settings/permissions/index.tsx`); the first-run disclosure opens
`/privacy`, `/terms` and the India notice at `/privacy/india`
(`src/features/onboarding/components/FirstRunDisclosureModal.tsx`); the cloud
provider consent opens `/privacy` and the provider list at `/subprocessors`
(`src/features/settings/cloud-privacy/NamedProviderConsentModal.tsx`,
`services/providerConsent.ts`). A notification whose target has no screen in
the app opens its web page (`services/notifications.ts`). A link in assistant
output, and a map place or route card, also opens in a Custom Tab and is never
auto-followed; a non-`http(s)` scheme requires a confirmation alert first
(`src/features/chat/components/MarkdownInline.tsx`,
`src/features/chat/components/InteractiveCardBlock.tsx`). **Open** on an
artifact the person has published opens its public page through
`openExternalUrl` (`src/features/chat/components/ArtifactFullScreen.tsx`).

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
(`src/features/companion/components/DesktopSetupChecklistView.tsx`, also on
the Remote Control screen), an
`otpauth:` link to an authenticator app
(`src/features/settings/account-security/TwoFactorSection.tsx`), and the
device-settings intents (`app/(app)/settings/integrations.tsx`,
`src/features/integrations/components/DeviceIntegrationStatus.tsx`).

**E. Present in source but not rendered in this version.** These controls
exist in the source for a build that sells through the store. None of them
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
  (`src/features/billing/webBillingLinks.ts`), which returns false on Android.

**There is no alternative in-app payment path**, no web checkout, no UPI sheet,
no card form, and none of the links above reaches one.

## Account deletion and data export

Requested in the app, with no support ticket:

In Cloud mode: Settings → **Email** (under Account) → **Danger Zone** →
**Delete Account** → confirmation alert → identity check →
`DELETE /api/user/delete-account`. From either mode, Settings → **Data
Controls** → **Delete account** opens the same screen (after sign-in, if
signed out; if the app then asks **Share with AI providers?**, either answer
leads to the same screen). In Local Mode the **Danger Zone** shows **Check
deletion status**; tapping it asks AGI Cloud for the account's deletion status
without switching modes or asking about AI providers, and then shows **Delete
Account**, or **Cancel Account Deletion** when a deletion is scheduled.
Deletion, its cancellation and **Export Cloud Data** never need the permission
to share with AI providers (`lib/egressGuard.ts`). The request schedules deletion of the AGI
Cloud account and its cloud data (chats, projects, memory, artifacts) and
returns a cancellation deadline 24 hours later; the app shows it and signs out,
and signing back in before the deadline lets the person cancel. After the
deadline a daily job ends any Stripe billing still live, erases the data and
deletes the sign-in identity, so erasure can finish later than the deadline.
Data under an active legal hold, and the records the privacy policy lists as
kept, are kept. On-device Local Mode data stays on the device and is removed
separately. Sources: `src/features/settings/cloud-account/index.tsx`,
`src/features/settings/cloud-account/deleteAccountConfirmation.ts`,
`apps/web/app/api/user/delete-account/route.ts`. The deletion is bound to the
account epoch captured when the dialog opened, so a mid-flight account switch
cannot delete the wrong account.

A paid plan does not stop the deletion. A plan that still renews and was bought
on the web stops renewing when the deletion is scheduled, so no renewal can
charge after the account is gone, and cancelling the deletion turns renewal back
on. A plan bought through Google Play or Apple (an older store purchase; this
version sells nothing) cannot be cancelled by us, so the receipt says the store
keeps billing until the person cancels there. A plan already cancelled, and a
personal paid plan given without a purchase on an account with no web billing
account, are scheduled straight away. The remaining paid time ends when erasure
runs, and the confirmation says the unused time is not refunded
(`apps/web/app/api/user/delete-account/route.ts`).

When the server refuses, nothing is scheduled and the app shows why: a payment
still being collected, a plan change already scheduled on a web plan, a plan
whose purchase cannot be identified, and the only owner of a workspace.

**Settings → Data Controls** offers **Export Local Data**, chats, memory,
settings and installed model details, which runs entirely on the device
(`src/features/settings/data-controls/index.tsx`,
`services/dsarExport.ts`). The same screen deletes all AGI Cloud chats;
device-only chats are wiped from Settings → Storage.

The web-facing deletion URL declared for Data safety is
`https://agiworkforce.com/help/delete-your-account`
(`store-listing/android/data-safety.json` → `dataDeletionRequestUrl`).

## AI disclosure

First run shows a blocking disclosure, "Before you start", before the
device-tier screen (`app/(public)/onboarding.tsx` →
`composeShortFirstRunDisclosure`, drawn by
`src/features/onboarding/components/FirstRunDisclosureModal.tsx`, accepted via
`recordDisclosureAcceptance`). It states, verbatim, "You are chatting with an
AI, and it can make mistakes.", says what Local Mode and AGI Cloud collect, and
links to the Privacy Policy and the India DPDP notice. **Why we show this**
expands the EU AI Act Article 50(1) text verbatim
(`packages/contracts/compliance/src/article50-disclosure.ts`). Acceptance is
recorded with a hash of the copy.

**How AI-generated output is marked when exported, stated so it is not read
wider than the code.** The marking is implemented on the Data Controls export: Settings →
Data Controls → Export Local Data wraps each conversation transcript in a
machine-readable Article 50(2) provenance marker naming the provider and model
(`buildMarkedTranscript` in `services/dsarExport.ts`, via
`wrapTextExportWithMarker` in
`packages/contracts/compliance/src/article50-marker.ts`). The ordinary
conversation export and share from the chat screen, PDF, plain text, Markdown,
copy-to-clipboard (`services/fileCreation.ts`), carries role labels only and
does not add that marker.

In the chat UI itself, every completed assistant turn that records its model
carries a provenance footer naming its source: "AGI Cloud · <model name>" (or
"AGI Cloud" alone when the model is not known), or "Local Mode · <model name>"
for on-device inference (`src/features/chat/components/ProvenanceFooter.tsx`,
rendered from `getProvenance` in
`src/features/chat/components/MessageBubble.tsx`). The footer names the system
rather than printing the literal words "AI-generated".

Before any model is downloaded, the device-tier screen names the recommended
model and its download size, and offers "Pick a different model", the user is
never given a model without being told which one it is.

We do not claim full compliance with India's DPDP Act 2023. The itemised notice
is published at https://agiworkforce.com/privacy/india; consent withdrawal and
the export/delete controls above are implemented; the obligations we have not
met, verifiable parental consent under s.9, notice in Eighth Schedule languages
under s.6(4), and India data residency, are listed at
https://agiworkforce.com/trust.

## Contact

- Play review contact: `review@agiworkforce.com`
- User support: `support@agiworkforce.com` / https://agiworkforce.com/support
- Privacy policy: https://agiworkforce.com/privacy

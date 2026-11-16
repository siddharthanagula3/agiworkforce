# First store release of AGI Mobile: the App Store and Google Play

Status: Current
Owner: Founder
Last updated: 2026-11-16

This is the whole submission of AGI Mobile version 0.0.1 to the Apple App Store
and to Google Play, written for the owner, who follows it himself. Work through
it top to bottom: later steps need values that earlier steps produce. Each step
says where to click or what to run, what to enter and where the value comes
from, what you should see, and what to do when it goes wrong.

How to read it:

- **Source, read 2026-11-15** follows every store requirement, with the link to
  Apple's or Google's own page. Store rules change often; before you submit,
  open the links in the "Sources" table at the end once more.
- **Unverified** marks a point nobody could confirm on 2026-11-15. Treat it as a
  question, not a fact.
- A statement about the app names the file it comes from. Paths are relative to
  the repository root.

Signing and the domain-association files are in `mobile-eas-signing.md`. Selling
plans later is in `mobile-store-products.md`; nothing in it is needed for
version 1.

## 1. What version 1 is and is not

Version 1 is free, sells nothing and hides Remote Control.

- **Nothing is sold anywhere before 1 January 2027.** Your decision of
  2026-11-15: no plan or credit is sold on any surface, web or phone, before
  that date. Every paid plan that exists was granted without a purchase, the
  review account's among them. The web enforces this with switches whose
  production values the repository cannot see, and it holds only while no
  Stripe subscription is live; section 4.5 says what to check.
- **No purchases in the app.** `apps/mobile/src/features/billing/storePurchases.json`
  holds `"nativePurchases": false`. With it false the app shows no purchase,
  upgrade, top-up, restore or compare-plans control and no price, opens no
  store connection, and the Android manifest drops the Play Billing permission
  (`apps/mobile/app.config.js`, `blockedPermissions`).
  `scripts/release/check-store-listing-claims.mjs` fails the release if either
  listing declares purchases while this is false. The value is compiled into
  the build; no server switch or update can turn it on.
- **The feature switchboard** is `apps/mobile/lib/v1FeatureFlags.ts`. In this
  build `billing`, `dispatch`, `companion`, `videoGen`, `bankLinking`,
  `pluginMarketplaceAdmin` and `appLanguage` are `false`; Cloud chat, projects,
  tasks, schedules, connectors, skills, web search, research, image generation
  and code execution are `true`.
- **Remote Control and Send to Desktop are hidden** (`companion` and `dispatch`
  are `false`), because the relay host they need, `signaling.agiworkforce.com`,
  is not deployed (audit/decisions/founder-actions.md, "Remote Control relay host
  points nowhere"). Settings has no Remote control section, AGI Code settings has
  no Remote control row, Settings, Capabilities has no Desktop control row, and
  the `/(app)/companion` and `/(app)/settings/remote-control` routes show
  "Remote isn’t available in this build" if reached. The Android App Link for
  `/pair` is declared only when both flags are on (`pairingLinksEnabled` in
  `apps/mobile/app.config.js`).
- **Two modes.** Local Mode needs no account and runs a model on the device.
  AGI Cloud needs sign-in through Clerk and talks to `https://agiworkforce.com`.
- **Version and identifiers.** Version `0.0.1` in `apps/mobile/app.config.js` and
  `apps/mobile/package.json`; bundle and package `com.agiworkforce.app`; Apple
  team `D2PR62RLT4`; EAS project `38f0941c-88a7-468a-9750-fcd8b357ff4c`. The
  release tag is `v-mobile-0.0.1`.
- **Names.** Both phones show "AGI Mobile" under the icon and in permission
  prompts: iOS through `CFBundleDisplayName`, Android through the `app_name`
  string that `withAndroidDisplayName` writes (both from `APP_DISPLAY_NAME` in
  `apps/mobile/app.config.js`). The Android label is checked on the emulator
  (section 11.3).
- **Dictation on Android** is offered only on Android 13 and later, where the
  on-device recognizer exists. Below that the composer shows no microphone for
  it (`onDeviceRecognizerGuaranteed` in
  `apps/mobile/src/features/voice/services/voiceInput.ts`).
- **Not in version 1:** purchases, Remote Control, the phone's large-file upload
  and over-the-air updates. Section 15 says what each needs later.

## 2. Where things stand on 2026-11-15

Neither store can be submitted to today. What stops each one, in order of
weight:

| Blocks                                                                                                                                               | Store   | Who                | Section    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | ---------- |
| No store build has ever succeeded. Three Android builds on 2026-10-17 and 18 failed or were cancelled; no iOS store build has been attempted         | Both    | Owner, then Claude | 9          |
| The work of the last two days is uncommitted, and store builds are made only from committed code                                                     | Both    | Claude, then owner | 9.1        |
| The first iOS signing credentials must be made in an interactive session signed in to Apple, unless the App Store Connect key has the role EAS needs | iOS     | Owner              | 6.2        |
| The web changes the review builds rely on are not deployed                                                                                           | Both    | Owner's deploy     | 4.2        |
| Nobody has confirmed that checkout is closed in production, that no access code was given out and that no Stripe subscription is live                | Both    | Owner              | 4.5        |
| The review account does not exist, and its plan must be granted by hand                                                                              | Both    | Owner              | 10         |
| Export compliance is open with counsel                                                                                                               | iOS     | Owner, counsel     | D9, 8.6    |
| No screenshots usable today, no Play feature graphic, no 512 px Play icon                                                                            | Both    | Owner and Claude   | 8.8, 7.7   |
| The Android app has never been built or run, and no workflow builds it before the Play upload                                                        | Android | Owner, then Claude | D20, 9, 11 |

## 3. The order of everything

One page. "Rough time" is an estimate of your own time, not a promise; the
14-day Play test is the one fixed duration. On a personal Play account, push
steps 10 to 12 hard: the 14 days cannot start until the closed test (step 13)
is live, and Google's release page says to set up the store listing and prepare
the app for review before you create a release (Source, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/9859348).

| #   | Step                                                                            | Who                | Where                                                | Rough time               | Blocked by                                         |
| --- | ------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------- | ------------------------ | -------------------------------------------------- |
| 1   | Make the owner decisions in 4.1                                                 | Owner              | This file, section 4.1                               | 1 to 2 hours             | Nothing                                            |
| 2   | Engineering work in section 4.3, then commit                                    | Claude             | The repository                                       | 1 to 2 days              | Decisions D11, D12, D19, D20                       |
| 3   | Founder-actions items in 4.4 and the sales check in 4.5                         | Owner, counsel     | Vercel, Clerk, the operator dashboard, counsel       | Varies                   | Nothing                                            |
| 4   | Deploy the web changes the phone depends on (4.2)                               | Owner's go-ahead   | Vercel production                                    | 30 minutes               | Step 2 committed                                   |
| 5   | Apple and Google accounts and agreements (5)                                    | Owner              | developer.apple.com, App Store Connect, Play Console | 1 hour                   | Nothing                                            |
| 6   | Create the Play app and give the upload account access (7.1, 7.2)               | Owner              | Play Console                                         | 20 minutes               | Step 5                                             |
| 7   | First iOS credentials, interactively (6.2)                                      | Owner              | Terminal, `eas credentials`                          | 30 minutes               | Steps 2, 5                                         |
| 8   | First Android bundle by hand, rolled out to Internal testing (9.3)              | Owner              | Terminal, Play Console                               | 1 hour plus build        | Steps 2, 6                                         |
| 9   | App signing fingerprint into GitHub and the web (6.3)                           | Owner              | Play Console, GitHub, Vercel                         | 20 minutes               | Step 8                                             |
| 10  | Review account (10)                                                             | Owner              | agiworkforce.com, Clerk, the production database     | 45 minutes               | D6, step 4                                         |
| 11  | Screenshots, feature graphic, icon (8.8, 7.7)                                   | Owner and Claude   | Simulator and emulator, design tool                  | Half a day               | Step 2                                             |
| 12  | Play store listing, App content, Data safety (7.4 to 7.7)                       | Owner              | Play Console                                         | 2 hours                  | Steps 4, 6, 10, 11                                 |
| 13  | Personal Play account only: start the 12-tester closed test (7.8)               | Owner              | Play Console                                         | 30 minutes, then 14 days | Steps 8, 12                                        |
| 14  | App Store version page, App Privacy, age rating, export compliance (8.1 to 8.8) | Owner              | App Store Connect                                    | 2 hours                  | Steps 3, 10, 11                                    |
| 15  | Tagged release: iOS to TestFlight, Android to Internal testing (9.4)            | Owner              | GitHub, Play Console                                 | 30 minutes plus builds   | Steps 2, 7, 9                                      |
| 16  | Emulator and real-device checks (11)                                            | Owner              | Emulator, TestFlight, Play Internal testing          | Half a day               | Step 15                                            |
| 17  | Submit to App Review (8.10)                                                     | Owner              | App Store Connect                                    | 15 minutes               | Steps 3, 14, 16                                    |
| 18  | Release to Production and send for review (7.10)                                | Owner              | Play Console                                         | 15 minutes               | Steps 3, 12, 16, and step 13's 14 days if personal |
| 19  | After approval (14)                                                             | Owner, then Claude | Both consoles, the repository                        | 30 minutes               | Approval                                           |

## 4. Before anything

### 4.1 Decisions that are yours

Each decision says what is true now, the alternative, and when the answer is
needed. "True now" is what the code and the listing files already do, so
leaving a decision alone keeps it.

- **D1. Version number.** True now: everything says `0.0.1`, and the stores
  show "Version 0.0.1" publicly. Alternative: `1.0.0`, a five-file change.
  Needed before the first store build (9).
- **D2. iPad.** True now: the build supports iPad (`supportsTablet: true` in
  `apps/mobile/app.config.js`), so iPad screenshots are required and App Review
  can test on iPad. Alternative: turn it off, a one-line change; an iPhone app
  still runs on iPad in compatibility mode and reviewers can open it there.
  Whether App Store Connect lets a later version drop iPad support is
  unverified. Needed before the first iOS build.
- **D3. Android push notifications.** True now: no Firebase, so the Android
  Notifications screen says the device could not be registered and only local
  notifications (model download, reminders) work
  (`apps/mobile/services/notifications.ts`). The Android reviewer notes say
  exactly that. Alternative: section 12, then a new build. Needed before the
  Android build you submit.
- **D4. Crash reporting.** True now: no crash reporter ships. The only crash
  data the build sends is the launch error `expo-updates` reports with its
  update check, declared in both stores (7.5, 8.4).
  audit/decisions/founder-actions.md ("Crash reporting stance") records a
  2026-09-15 decision to turn crash reporting on, waiting on a vendor project.
  Alternative: add a reporter later, with a new build and new privacy answers.
  Needed: not for version 1.
- **D6. The review account's plan.** True now: you decided on 2026-11-14 that
  it gets a paid plan, because a Free account reached the usage limit after two
  messages. With nothing sold before 2027 (D7), that plan is granted by hand,
  not bought: a Stripe checkout with a 100 percent coupon would itself be a
  sale, through a checkout that must stay closed. Section 10, item 4 says how
  to grant it, and production schedules the deletion of a granted plan only
  after the delete-account change is deployed (4.2). Alternative: Free, whose
  allowance you raised a hundredfold on 2026-11-16, to 200 credits per five
  hours, once the web app carrying it is deployed (4.2, item 5). That is more
  per five hours than a granted Premium plan (50) or Basic plan (10), so the
  reason for this decision no longer holds after the deploy: Free gives the
  reviewer more session usage than the paid plan this decision grants. The
  same deploy carries the second Free model. Needed before section 10.
- **D7. Store payment rules and the sales date.** True now: the app sells
  nothing, and nothing is sold on any platform before 1 January 2027, so every
  plan that exists was granted without a purchase.
  - **Apple.** Guideline 3.1.3(b) lets an app give access to what people
    "have acquired in your app on other platforms or your web site", "provided
    those items are also available as in-app purchases within the app"
    (Source, read 2026-11-15:
    https://developer.apple.com/app-store/review/guidelines/). With nothing
    sold anywhere, nobody has acquired a plan elsewhere: the app gives access
    to nothing bought outside it, which removes most of the 3.1.3(b) risk. If
    App Review asks, answer: "Nothing is sold on any platform before 1 January
    2027: no plan or credit can be bought in the app, on our website or
    anywhere else. The plans that exist, including the demo account's, were
    granted without a purchase, so the app gives access to nothing bought
    outside it. Before we sell plans anywhere, a version that offers them as
    in-app purchases will be submitted for review."
  - **Google Play.** The Payments policy says an app that charges for in-app
    features or services, subscriptions and cloud services included, "must use
    Google Play's billing system for those transactions unless Section 3, 8, or
    9 applies", and that apps "may not lead users to a payment method other than
    Google Play's billing system", including through links, webviews, buttons
    and sign-up flows. Sections 8 and 9 allow another billing system, or leading
    people out of the app to pay, only in eligible countries or regions under a
    program you enrol in. The page says nothing either way about an app giving
    access to a plan bought elsewhere (unverified). Version 1 charges nothing
    and links to no purchase, so the policy asks nothing more of it today. Once
    web sales open, the Android app may still sell nothing and link to no
    purchase; if it sells plans, the sale goes through Play's billing system
    (or an enrolled program where eligible), and it never sends people to the
    web checkout outside such a program. Source, read 2026-11-15:
    https://support.google.com/googleplay/android-developer/answer/9858738.
  - **Before submitting**, confirm that nothing can be bought (section 4.5).
  - **The dated consequence.** Before web sales open on 1 January 2027, a phone
    build that sells the same plans through in-app purchase must be approved
    and live in both stores (section 15, "In-app purchases", and
    `mobile-store-products.md`). Otherwise, from the first web sale, the app
    gives access to plans bought on the web that it does not offer as in-app
    purchases, and the 3.1.3(b) risk returns in full. Leave time for both
    stores' reviews; neither publishes a fixed review time.
  - Alternative: keep web sales closed until that build is live. Needed: the
    in-app purchase build must be planned now; the sales check before this
    submission.
- **D8. Over-the-air update checks.** True now: the build asks Expo's servers
  for an update on every launch, Local Mode included (`updates.url` and no
  `checkAutomatically` in `apps/mobile/app.config.js`), and both stores'
  answers declare it: Device ID (Expo's per-install client ID) and Crash Data,
  not linked, in App Privacy and the privacy manifest; Device or other IDs and
  Crash logs, required, in Data safety. Expo's guidance, Source, read
  2026-11-15: https://docs.expo.dev/eas-update/store-privacy-declarations/.
  Nothing in the repository publishes updates. Alternative: set
  `updates.checkAutomatically` to `NEVER` and remove the Expo parts of those
  answers. Needed before the store builds.
- **D9. Export compliance (counsel).** True now: the build declares
  `ITSAppUsesNonExemptEncryption: false`, while MMKV compiles its own AES into
  the app (`node_modules/react-native-mmkv/MMKV/Core/aes/AESCrypt.cpp`, used
  with a key in `apps/mobile/lib/mmkv.ts`) and the WebRTC framework used for
  live voice contains BoringSSL. Apple says an industry-standard algorithm not
  provided by the OS needs a French encryption declaration where the app is
  sold in France. Source, read 2026-11-15:
  https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption.
  Alternatives: upload a French declaration, leave France out, or change the
  key. Needed before section 8.6.
- **D10. Whether the model, voice and embedding providers "share" data
  (counsel).** True now: both Android files and the reviewer notes declare
  messages, photos, files, voice, calendar events and search history as
  shared, because Google's service-provider exception could not be shown to
  apply while some providers' terms allow training on Free-plan data
  (`sharingBasis` in `apps/mobile/store-listing/android/data-safety.json`).
  Live voice is declared stored, not ephemeral, because the voice provider's
  retention is not established; the reviewer notes and the app's Privacy
  screen both say the audio streams directly between the device and that
  provider. Alternative: counsel finds the exception applies, and those rows
  become not shared. Needed before section 7.5.
- **D11. Health-record connectors.** True now: the server's connector catalogue
  has HealthEx, Epic FHIR and Cerner (`apps/web/features/connectors/data/connectors.ts`),
  and the phone filters out only the bank connector
  (`apps/mobile/src/features/settings/cloud-connectors/index.tsx`). Play's
  Health apps declaration counts managing health records. Unverified whether
  production shows those connectors on the phone. Alternative: hide the
  Healthcare connectors in the phone for version 1 (recommended; Claude does it
  like `bankLinking`), or declare "Healthcare services and management" in 7.4.
  Needed before section 7.4.
- **D12. Blocking another person.** True now: "Hide <name>" on a shared item
  saves the choice on that phone only (`apps/mobile/src/features/shared-with-you/hiddenSharers.ts`),
  and the reviewer notes say so. Apple Guideline 1.2 asks AI content apps for
  "the ability to block abusive users from the service". Alternative: Claude
  stores hidden people on the server. Needed before the store builds.
- **D13. Age-rating judgement calls (Apple).** True now, in
  `age_rating.questionnaire` of `apps/mobile/store-listing/LISTING-METADATA-IOS.json`:
  Unrestricted Web Access Yes (a link in an answer opens any page in the in-app
  Safari sheet), which makes the calculated rating 16+; Parental Controls Yes.
  Parental Controls is your call: the Settings screen shows the status that
  follows from the stored device age, says parent accounts can't be linked, and
  has one control, Review Device Age Settings; Yes rests on an adult being able
  to set a minor age that turns the content filter on. Content Rights: the app
  shows web search results and provider output, and Apple's question covers
  apps that "contain, show, or access third-party content". Alternative:
  Parental Controls No. Needed before section 8.5.
- **D14. Minimum age (counsel).** audit/decisions/founder-actions.md
  ("Minimum-age policy") marks this RELEASE-BLOCKING for the mobile stores: the
  decision is 13, and counsel must confirm 13 on `/privacy` and `/terms`.
  Needed before either submission.
- **D15. Public listing wording.** True now: the Android `full_description` and
  the iOS `description` both say "Free plan" twice and "India DPDP notice and
  open items", and both release notes (Android `release_notes_v0_0_1`, iOS
  `whats_new`) say "on the Free plan"; the iOS keywords are all longer than two
  characters. Alternative: Claude rewords both descriptions and both release
  notes. Needed before sections 7.6 and 8.2.
- **D16. Sign in with Apple on the web.** True now: the web offers no Apple
  sign-in, so a person who signed up in the iPhone app with Apple cannot sign
  in on the web to delete the account; the deletion page sends them to the
  request form at `/privacy/requests`. Alternative: add `apple` to the web's
  `AGI_AUTH_PROVIDERS` after setting up Clerk's Apple web connection (a
  Services ID), which nobody has verified. Needed: not for review.
- **D17. Who sees the Sign in with Apple sentence after deletion.** True now:
  the deletion message tells everyone "If you signed in with Apple, also
  remove this app from Sign in with Apple" (the server message in
  `apps/web/app/api/user/delete-account/route.ts`, and on iPhone the
  confirmation in
  `apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts`).
  Alternative: show it only to Apple accounts, which needs the identity
  adapter in `packages/platform/identity` to expose external accounts. Needed:
  not for review.
- **D18. Release notes in the phone view.** True now: `/release-notes` opened
  from the app shows the 2026-09-27 entry "Basic, Pro, Max 5x and Max 20x are
  sold with monthly billing only" in plain text, with old plan names.
  Alternatives: hide billing entries in the embedded view (a field on each
  release in `apps/web/lib/changelog-entries.ts`), or stop linking release
  notes from the phone in version 1. Needed before the web deploy in 4.2.
- **D19. Pairing links on iPhone.** True now: Android declares no `/pair` App
  Link while Remote Control is off, but the web's Apple association file still
  lists `/pair` and `/pair/*` (`apps/web/lib/server/mobile-app-association.ts`),
  so on an iPhone a pairing link opens the app and nothing happens.
  Alternative: drop those paths while Remote Control is off, with the same
  change to `EXPECTED_IOS_PATHS` in
  `apps/mobile/scripts/release/verify-production-associations.mjs`, deployed
  before the tagged release. Needed before the tagged release (9.4).
- **D20. An Android build gate before the Play upload.** True now: the release
  workflow builds and runs only iOS simulators before your approval, so the
  first time CI compiles the Android app is the upload to Internal testing, as
  a draft. Alternative: Claude adds a job `android-build-gate` on
  `ubuntu-latest` that needs `validate` and that `release-android` needs:
  checkout, the pnpm and Node steps copied from `validate`,
  `actions/setup-java` (Temurin 17) and `android-actions/setup-android`, each
  pinned by commit, with the compile SDK and NDK that `expo-build-properties`
  sets in `apps/mobile/app.config.js`; then
  `pnpm --filter @agiworkforce/mobile exec expo prebuild --platform android --no-install`,
  `./gradlew :app:assembleRelease` in the Android project that prebuild
  generates, and
  `reactivecircus/android-emulator-runner` (pinned) installing the APK and
  checking that the launcher activity starts
  (`adb shell am start -W -n com.agiworkforce.app/.MainActivity`, then
  `pidof`). The workflow uses none of these actions today. Needed before the
  tagged release, if you want it.

Settled since the first draft of this file: the Android label is "AGI Mobile"
(was D5); dictation is not offered below Android 13; code is monospaced on both
platforms; the review account's plan is granted, not bought (D6).

### 4.2 The server deployment the phone build depends on

The phone talks to production at `https://agiworkforce.com`.
`https://agiworkforce.com/api/version` names the commit production runs; on
2026-11-15 that was `e822c4fda6` (released 2026-11-13).

What is already true in production:

- **Phone sessions are accepted.** Until 2026-11-10 production refused every
  phone session after sign-in ("Session Expired"), because the server checked
  the token against the allowed web origins and a native token names none. The
  fix is commit `568584454a`, part of `e822c4fda6`.
- **The routes the phone calls exist.** Every literal `/api/...` path in the
  mobile code exists in production's route tree (checked 2026-11-15; changes to
  request or response shapes are not covered by that check).

What needs the web deploy before the review builds are used, all uncommitted
on 2026-11-15:

1. **The embedded web pages.** The app opens Terms, Privacy, Help, Support,
   Status and the account pages with `from=mobile`
   (`apps/mobile/src/platform/webContentPage.ts`). The website change that reads
   it and leaves out the site header, footer, pricing and contact-sales links is
   `apps/web/lib/embedded-page.ts`. On 2026-11-15 production pages opened that
   way still linked to `/pricing` and `/contact-sales`. App Review would see
   those links inside the app.
2. **Deleting a granted plan.** In production,
   `apps/web/app/api/user/delete-account/route.ts` refuses a renewing paid plan
   whose billing source is manual and tells the person to email support. The
   working tree schedules it instead when the plan is a personal plan with no
   Stripe customer behind it, which is how the review account's plan is given
   (D6). Until this is deployed, the reviewer's Delete Account is refused.
3. **The Sign in with Apple sentence in the deletion message.** The same route
   adds "If you signed in with Apple, also remove this app from Sign in with
   Apple" with the iPhone steps. The web's success dialog and the app's
   "Account deletion scheduled" alert both show the server's message.
4. **The deletion help page.** `https://agiworkforce.com/help/delete-your-account`
   (`apps/web/content/support/delete-your-account.md`, with the regenerated
   help corpus and the `RETENTION.statutoryRecordYears` value) now gives the web
   pathway. Deploy it before you enter the URL in Play Console (7.5).
5. **The Free plan's allowance and its two models** (decided 2026-11-16). The
   phone reads which models Free may pick from the catalogue built into it
   (`apps/mobile/src/features/model-picker/service.ts`), not from the server,
   so a build made after that change lists the fast OpenAI and the fast
   Anthropic model for Free, and Compare offers them side by side. Production
   until this deploy rewrites a Free pick of the Anthropic model to the OpenAI
   one, so the picker would name one model and the other would answer, and it
   keeps Free at 2 credits per five hours
   (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`,
   `packages/contracts/types/src/managed-usage-limits.ts`). Deploy it before a
   build made from this tree reaches review or testers.
6. **Your choices in D18 and D19**, if they change web files.

Deploying is yours to authorise. After a deploy, check:

```bash
curl -s https://agiworkforce.com/api/version
```

```bash
curl -s "https://agiworkforce.com/terms?from=mobile" | grep -c -E 'href="[^"]*/(pricing|contact-sales)([?#"/])'
```

The second command must print `0`. It counts lines holding a link to
`/pricing` or `/contact-sales` in any form: relative, absolute, or with a query
string or anchor. Repeat it for `privacy`, `help`, `help/delete-your-account`,
`subprocessors`, `support` and `release-notes`. Then, signed out in a private
window, open `https://agiworkforce.com/settings/account?from=mobile`: it must
show the sign-in page with no site header, pricing link or footer.

### 4.3 Engineering work before the review builds

These are Claude's, not yours. Each is listed so you know what the build waits
for.

Landed in the working tree on 2026-11-15, not yet committed:

- **The release workflow's build commands.** Both store jobs in
  `.github/workflows/release-mobile.yml` pass `--auto-submit` straight after
  the script name, and `scripts/check-ci-guardrails.mjs` fails a workflow that
  puts `--` back. The submit hints the release scripts print take the same form.
- **Privacy declarations built into the iOS app.** `ios.privacyManifests` in
  `apps/mobile/app.config.js` declares Device ID for App Functionality and
  Analytics, Search History, Other Diagnostic Data, and Crash Data not linked,
  matching sections 7.5 and 8.4.
  `apps/mobile/scripts/release/verify-privacy-declarations.mjs` fails the
  release when the manifest, the submission copy
  `apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy` and
  `apps/mobile/store-listing/android/data-safety.json` disagree. The iOS build
  being tested on the simulator predates this; the review build must be a new
  one.
- **The iOS extensions declared to EAS.** `extra.eas.build.experimental.ios.appExtensions`
  in `apps/mobile/app.config.js` names `AGIShareExtension`
  (`com.agiworkforce.app.share-extension`) and `AGIWidgets`
  (`com.agiworkforce.app.widgets`), each with the app group, so EAS makes a
  signing profile for each. Source, read 2026-11-15:
  https://docs.expo.dev/build-reference/app-extensions/.
- **Android menus.** Menus that were system alerts (at most three buttons, no
  Back) open the app's own sheet from a root host
  (`apps/mobile/src/shared/components/ActionMenuHost.tsx`, mounted in
  `apps/mobile/app/_layout.tsx`), so Report, Share and Delete show on Library
  items and artifacts.
- **Android sheets and Back.** The report sheet and other page sheets pad for
  the status and navigation bars on Android (`PageSheetSafeArea`); Back closes
  the add-to-chat, model picker, voice picker and plan sheets
  (`apps/mobile/src/shared/hooks/useHardwareBackDismiss.ts`).
- **Shared files.** Links that name a file accept only the share inbox
  (`apps/mobile/src/features/share-preview/sharedAttachments.ts`), and the
  Android share handler refuses a stream from the app's own providers or a
  `file://` address (`apps/mobile/native/android/withAGIShareIntent.cjs`).
- **Monospace code on both platforms** through `codeFontFamily`
  (`apps/mobile/src/ui/theme/codeFont.ts`): Menlo on iOS, monospace on Android.
- **Dictation below Android 13** is not offered, as section 1 says.
- **Sign in with Apple revocation.** On iPhone the app signs out when Apple
  reports the sign-in revoked (`apps/mobile/src/features/auth/components/AppleRevokeListener.tsx`),
  and the deletion confirmation names the Settings path.
- **The Android label** "AGI Mobile" (section 1).

Still to do:

- **Screenshot frames without transparency.** The compositor writes PNG with an
  alpha channel (`apps/mobile/scripts/screenshots/compositor.ts`); both stores
  refuse that. Section 8.8 has the conversion until the compositor is changed.
- **Decisions that become code:** D11 (health connectors), D12 (server-side
  hide), D19 (pairing paths), D20 (Android build gate), and D8 if you turn
  update checks off.
- **Commit all of it**, then the store builds can start (9.1, item 3).

### 4.4 Founder-actions items that must be done before the review builds are used

From audit/decisions/founder-actions.md, read 2026-11-15:

1. **"[Release] GitHub environments and variables", item 8.** The
   `mobile-store-release` environment still lacks the secret `EXPO_TOKEN` and the
   variable `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS`. Sections 9.1 and 6.3.
2. **"[Trust & Safety] Minimum-age policy".** RELEASE-BLOCKING for the mobile
   stores: counsel confirms 13 as the minimum age on `/privacy` and `/terms`
   (D14).
3. **"[Production env] Error reporting, tracing, email, push and sign-in
   providers".** Before review: confirm that mail to `contact@agiworkforce.com`
   arrives and name who reads it, because the deletion refusal message and the
   support pages point there. Apple asks that a person whose deletion takes time
   gets a confirmation when it completes (Source, read 2026-11-15:
   https://developer.apple.com/support/offering-account-deletion-in-your-app/);
   whether erasure sends one, and whether production has the email sender
   (`RESEND_API_KEY`, `AGI_NOTIFICATIONS_FROM_EMAIL`), is unverified.
4. **The storage permission check for account deletion.** Account erasure
   deletes a person's stored files before their database rows, and reports the
   deletion complete only when every object was freed (docs/security/security.md,
   section 5.2). If the production object-storage credential cannot delete, the
   reviewer's deletion never completes. Founder-actions has no item by this
   name; the related items are "[Storage] Public R2 bucket inventory" and
   "[Production env] Email sender and purge switch". The check: in the
   Cloudflare dashboard, open the R2 API token whose access key is the
   production `CLOUDFLARE_R2_ACCESS_KEY_ID` and confirm its permission includes
   writing (deleting) objects in both the public and the private bucket. Then
   prove it once: make a throwaway account, attach one photo in a Cloud chat,
   delete the account, and after the next daily erasure run sign-in must fail
   and the photo's address must no longer load. The exact Cloudflare permission
   label is unverified.
5. **"[Mobile] Enable the Native API on the Clerk development instance".** The
   production instance already reported the Native API on (2026-10-19); nothing
   to do for the store builds.

Not needed for version 1: the Remote Control relay items, "[Mobile] Selling
plans in the app", and the Remote Control `ALLOWED_ORIGINS` item.

### 4.5 Confirm that nothing can be bought

Do this before each submission. The reviewer notes tell both stores that
nothing is sold on any platform before 1 January 2027; it must be true of
production, and the repository cannot see production's values. The web has
two gates (`apps/web/app/api/checkout/route.ts`,
`apps/web/lib/server/billing-waitlist-access.ts`), and both stop only new
subscriptions, so the third check is that none is live:

1. **The checkout switch.** Vercel, the web project, Settings, Environment
   Variables, Production:
   - `STRIPE_CHECKOUT_ENABLED` must be `false` (`0` and `off` also close it).
     It closes plan checkout (`/api/checkout`) and credit top-ups
     (`/api/billing/top-up`). An unset value leaves both open whenever
     `STRIPE_SECRET_KEY` is set.
   - `NEXT_PUBLIC_CHECKOUT_ENABLED` must also be `false`, so the pricing page
     shows checkout as unavailable instead of offering a button the server
     refuses (`apps/web/features/billing/lib/localized-pricing.ts`).
   - `AGI_BILLING_WAITLIST_OPEN` must not be `1`; `1` opens paid upgrades to
     every account whatever the operator switch says.
     Vercel applies a changed variable only to a new deployment, so after any
     change, redeploy.
2. **The upgrade waitlist.** Signed in as an operator, open
   `https://agiworkforce.com/operator`, Paid upgrade access. Under "Paid
   upgrades are" it must say **Behind the waitlist** (the switch
   `billing.upgrades_open` is off). Under Access codes, no code may show any
   redemption: an account that redeemed a code can start checkout whenever
   the checkout switch is open. If you gave a code to anyone, disable it there.
3. **No live Stripe subscription.** Stripe dashboard, live mode, Billing,
   Subscriptions, filtered to Active, Trialing and Past due: the list must be
   empty. An entry there is a sale, and its owner can still buy a higher plan
   or more seats. Cancel or refund each one before submitting.

With the checkout switch closed and no live Stripe subscription, nothing can be
bought, even by an account that redeemed a code: plan upgrades and seat
additions (`/api/upgrade`) act only on an active or trialing Stripe
subscription and do not read the checkout switch. Then check it as a buyer: signed in on the web with an account
that holds no plan, open `https://agiworkforce.com/pricing` and choose a paid
plan. No Stripe checkout page may open.

## 5. Accounts and agreements

What was already in place on 2026-11-10 (from the earlier version of this
runbook; recheck any row you depend on):

| Thing                      | State                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub environment         | `mobile-store-release` exists                                                                                                                                                                      |
| Its secrets                | `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_PRIVATE_KEY_BASE64`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`                                                                                 |
| Its variables              | `ASC_APP_ID`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                                                                                                                  |
| Repository variables       | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AGI_AUTH_PROVIDERS`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                                                                       |
| Expo account               | `agiautomationllc`, project `38f0941c-88a7-468a-9750-fcd8b357ff4c`; the EAS production environment has the three `EXPO_PUBLIC_*` values                                                            |
| App Store Connect          | app record "AGI Mobile", Apple ID `6787526447`, bundle `com.agiworkforce.app`, team `D2PR62RLT4` (last confirmed 2026-10-21)                                                                       |
| Sign in with Apple         | enabled in production Clerk (2026-10-19); the release check refuses an iOS build whose provider list lacks `apple`                                                                                 |
| Google Play upload account | `play-publisher@agi-mobile-release.iam.gserviceaccount.com` exists; it has no access until section 7.2                                                                                             |
| Public pages               | `/privacy`, `/terms`, `/support`, `/privacy/requests`, `/subprocessors`, `/trust` and the Apple link file answered 200 (2026-11-15 rechecked for privacy, support, terms, trust and subprocessors) |

### 5.1 Apple

1. **Apple Developer Program.** developer.apple.com, Account, Membership
   details: the membership for team `D2PR62RLT4` must be active. If it has
   lapsed, renew it; nothing else in this section works without it.
2. **The Declared Age Range capability.** developer.apple.com, Certificates,
   Identifiers & Profiles, Identifiers, `com.agiworkforce.app`: tick **Declared
   Age Range** and click Save. The build carries the
   `com.apple.developer.declared-age-range` entitlement
   (`apps/mobile/app.config.js`), and EAS turns on only the capabilities in
   Expo's own list, which does not include it. Source, read 2026-11-15:
   https://docs.expo.dev/build-reference/ios-capabilities/. If you skip this,
   the first signed build stops at code signing with a provisioning profile
   that lacks the entitlement; tick it, then let the next build regenerate the
   profile.
3. **App Store Connect, Business, Agreements.** The Free Apps agreement must
   show Active. The Paid Apps agreement, tax and banking are not needed for
   version 1.
4. **App Store Connect, Business, Digital Services Act trader status.** Declare
   it. Apple says apps without trader status are removed from the EU App Store.
   Source, read 2026-11-15: https://developer.apple.com/news/upcoming-requirements/.
5. **A mailbox for `review@agiworkforce.com`.** The iOS listing gives it to App
   Review (`app_review_information.review_contact_email` in
   `apps/mobile/store-listing/LISTING-METADATA-IOS.json`). Create it or forward
   it to an inbox you read: reviewers write there when sign-in fails.

### 5.2 Google Play

1. **Account type.** Play Console, Settings, Developer account, Account details.
   Write down two things: the account type (personal or organization) and the
   date the account was created.
   - **Personal, created after 13 November 2023:** Google requires a closed test
     "with a minimum of 12 testers" who are "opted in continuously for at least
     14 days" before you can apply for production. Source, read 2026-11-15:
     https://support.google.com/googleplay/android-developer/answer/14151465.
     Start that test the day the first build is uploaded (section 7.8); nothing
     shortens the 14 days.
   - **Organization:** Google's page does not mention organization accounts.
     The earlier runbook said organizations need nothing more; that came from
     third-party sites, so it is unverified. If Play Console shows no
     "Apply for production" requirement on the Dashboard, you can promote
     directly.
2. **Payments profile.** Not needed: the app is free and sells nothing.

### 5.3 EAS (Expo)

1. Sign in on your Mac:

   ```bash
   eas login
   ```

   ```bash
   eas whoami
   ```

   The second command must print `agiautomationllc`.

2. Make a token for the release workflow: expo.dev, Account settings, Access
   tokens, Create. Then:

   ```bash
   gh secret set EXPO_TOKEN --env mobile-store-release
   ```

   Paste the token when asked. `gh secret list --env mobile-store-release` must
   then list `EXPO_TOKEN`.

3. In GitHub, Settings, Environments, `mobile-store-release`: add yourself as a
   required reviewer, so a tag cannot publish without your click.

## 6. Signing

The identifiers, the association files and the GitHub environment table are in
`mobile-eas-signing.md`. This section covers only what the first release needs
on top of it.

### 6.1 How signing works here

- Both platforms use remote EAS credentials (`credentialsSource: "remote"` in
  `apps/mobile/eas.json`).
- The release scripts always pass `--non-interactive` to EAS
  (`apps/mobile/scripts/release/_lib.sh`). In that mode EAS can generate an
  Android upload keystore by itself, but cannot create an iOS distribution
  certificate, cannot register the extension bundle identifiers and does not
  sync capabilities. (Read in the EAS command line source, version 24.8.0,
  installed on this Mac. The workflow pins version 21.4.0, which nobody read;
  unverified that it behaves the same.)
- So iOS needs one interactive setup first (6.2). Android needs nothing first;
  Google re-signs every app with its own key (6.3).

### 6.2 First iOS credentials (interactive, once)

Needs: section 5.1 items 1 and 2 done, and the extension declaration from
section 4.3 committed.

First give your terminal the two values `apps/mobile/app.config.js` checks.
EAS reads the app's configuration on your Mac with only the profile's `env`
block from `apps/mobile/eas.json` added (`APP_ENV` `production` or `preview`),
not the EAS server environment, and `eas.json` sets `EXPO_NO_DOTENV`, so no
`.env` file is read either. For `production` and `preview`, `app.config.js`
stops unless the Clerk key starts with `pk_live_` and the API address is
HTTPS. Without these two lines the command fails with "[clerk] production
builds require EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to be a live Clerk
publishable key." (Read in the EAS command line source, version 24.8.0:
`credentials/manager/ManageIos.js` loads the configuration with the profile's
`env` only.)

```bash
export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="$(gh variable get EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --env mobile-store-release)"
```

```bash
export EXPO_PUBLIC_API_URL=https://agiworkforce.com
```

```bash
echo "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" | cut -c1-8
```

The last command must print `pk_live_`. If `gh` prints nothing, copy the
publishable key of the production instance from the Clerk dashboard instead
and export it the same way. A publishable key is not a secret. These two values only satisfy the
check on your Mac; the build server uses the EAS environment (section 9.1,
item 2).

```bash
cd apps/mobile
```

```bash
eas credentials --platform ios
```

1. Choose the build profile `production`.
2. Sign in to Apple when asked (your Apple ID for team `D2PR62RLT4`).
3. Choose **Build Credentials: Manage everything needed to build your
   project**, then **All: Set up all the required credentials to build your
   project**. EAS makes one distribution certificate and a provisioning
   profile for each target: the app, `AGIShareExtension` and `AGIWidgets`. The
   list shows each target by name and bundle identifier; if only the app
   appears, the extension declaration is missing; stop and tell Claude.
4. Back in the menu, choose **Push Notifications: Manage your Apple Push
   Notifications Key**, then **Set up your project to use Push
   Notifications**, and let EAS generate the key. Without it no push reaches an
   iPhone; EAS cannot do this in non-interactive mode.
5. Run it once more with the profile `beta` and choose the same certificate,
   so a beta build does not stop for credentials.

Result: `eas credentials --platform ios` shows a distribution certificate, three
provisioning profiles and a push key for `production`.

Check once, in App Store Connect, Users and Access, Integrations, App Store
Connect API: the key whose ID is the GitHub secret `ASC_API_KEY_ID` must be a
Team key with the Admin role, or a role with access to Certificates,
Identifiers and Profiles. The tagged release signs in to Apple with that key
(the workflow maps `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID` and the `.p8` key
to `EXPO_ASC_*`). If the key lacks the role, EAS only logs a warning that it
could not authenticate, then stops when a profile it needs is missing; the
profiles made in this section avoid that until one expires. In the first
tagged run, the iOS build log must show no "Failed to authenticate" warning.

If it goes wrong:

- "Missing entitlement" or a capability error: tick the capability on the App
  ID (5.1 item 2), then choose **Provisioning Profile: Delete one from your
  project** and run **All** again.
- Apple sign-in refused: the Apple ID needs the Admin or App Manager role in
  the team.

### 6.3 Play App Signing and the fingerprint

Google signs installed apps with its own key; your upload key only proves the
upload is yours. For new apps Google uses "quantum-ready hybrid signing", which
gives the app three keys, and "Hybrid-signed apps need the fingerprints for all
three keys registered with API providers". Fingerprints are under "Protected
with Play > Play Store protection > Manage Play app signing", section "App
signing key". Source, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/9842756.

The Android release job refuses to build until the website serves the Play
fingerprint (`.github/workflows/release-mobile.yml`, step "Verify deployed Apple
and Android association documents"). Today
`https://agiworkforce.com/.well-known/assetlinks.json` answers 503 for that
reason.

1. Upload the first bundle by hand (section 9.3).
2. Play Console, the app, Protected with Play, Play Store protection, Manage
   Play app signing. Scroll to **App signing key**.
3. Copy every SHA-256 fingerprint shown there. Not the upload key.
4. Set them, comma-separated, in GitHub:

   ```bash
   gh variable set ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS --env mobile-store-release --body "<fingerprint 1>,<fingerprint 2>"
   ```

   and the same value on the web deployment: Vercel, the web project,
   Settings, Environment Variables, Production, name
   `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS`. Both readers accept a comma or
   newline list (`apps/mobile/scripts/release/verify-production-associations.mjs`).
   Which of the three hybrid fingerprints Android App Links verification needs
   is unverified; listing all of them is what Google's page asks for API
   providers.

5. Redeploy the website, then:

   ```bash
   curl --fail https://agiworkforce.com/.well-known/assetlinks.json
   ```

   It must answer with the package `com.agiworkforce.app` and those
   fingerprints. If it answers 503, the variable is missing or malformed on
   Vercel.

## 7. Google Play, step by step

Menu names below are as Play Console showed them to the research on
2026-11-15. Play renames menus; if one is missing, use the search box at the
top of Play Console.

### 7.1 Create the app

Play Console, Create app:

- App name `AGI Mobile` (`app_name` in
  `apps/mobile/store-listing/LISTING-METADATA-ANDROID.json`), default language
  English (United States), App, Free.
- Tick the declarations, then Create app.

Result: the app's Dashboard opens with a list of setup tasks.

### 7.2 Give the upload account access

Users and permissions, Invite new users:

- Email `play-publisher@agi-mobile-release.iam.gserviceaccount.com`.
- App permissions: add AGI Mobile, then tick View app information, Release to
  production, Release apps to testing tracks, Manage testing tracks.
- No account-level permissions. Click Invite user.

The workflow uploads with this account through EAS Submit (`submit.production.android`
in `apps/mobile/eas.json`: track `internal`, release status `draft`).

### 7.3 Testing tracks: what each one is for

- **Internal testing:** up to 100 testers you list by email. Google: "You can
  start an internal test before completing app setup", and internal tests
  "might not be subject to standard Play policy or security reviews". Every
  upload, by hand or by EAS, lands here as a **draft**, and a draft reaches no
  tester: Google says apps in "Draft" status "do not display an opt-in link".
  You roll each one out yourself (9.3 and 9.4). Source, read 2026-11-15:
  https://support.google.com/googleplay/android-developer/answer/9845334.
- **Closed testing:** the 12-tester, 14-day test for a new personal account.
- **Production:** public, after review.

A build already uploaded is added to another track with Add from library; you
do not upload it again.

### 7.4 App content declarations

Policy and programs, App content. Answer every card. Each answer below has its
reason.

| Card                              | Answer for AGI Mobile                                                                                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy                    | `https://agiworkforce.com/privacy`                                                                                                                | `contact_details.privacy_policy_url` in the Android listing JSON                                                                                                                                                                                                                                                                                                                                                                         |
| App access                        | "All or some functionality is restricted", then the review account (section 10) and the short text below                                          | Cloud needs sign-in. Google wants credentials that always work, are reusable, work from any location, are in English and bypass two-step and one-time codes. Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/15748846                                                                                                                                                                            |
| Ads                               | No, my app does not contain ads                                                                                                                   | No ad SDK in `apps/mobile/package.json`                                                                                                                                                                                                                                                                                                                                                                                                  |
| Advertising ID                    | No                                                                                                                                                | `usesAdvertisingId: false` in `apps/mobile/store-listing/android/data-safety.json`. Confirm `com.google.android.gms.permission.AD_ID` is absent from the merged manifest first (section 11.3); unverified until a build exists                                                                                                                                                                                                           |
| Content rating                    | Start the questionnaire, category "All other app types", answers under `content_rating.questionnaire` in the Android listing JSON. Expected: Teen | Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/9898843. The JSON answers "unrestricted internet access" true: a link in an answer opens any page in an in-app Custom Tab, and Cloud chats run web search. Google's pages do not show the live wording, so the JSON's answers are descriptive; read each live question before answering. Expected: Teen with Diverse Content: Discretion Advised |
| Target audience                   | 13 to 15, 16 to 17, 18 and over; not appealing to children                                                                                        | The app admits 13 and over (`apps/mobile/src/features/auth/services/ageGate.ts`). Under-13 bands would bring the Families policy. Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/9867159                                                                                                                                                                                                        |
| Data safety                       | Section 7.5                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Financial features                | "My app doesn't provide any financial features"                                                                                                   | `bankLinking` is `false`; the bank connector is filtered out. Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/13849271                                                                                                                                                                                                                                                                           |
| Health apps                       | None, after D11 hides the health-record connectors. Otherwise "Healthcare services and management"                                                | Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/14738291                                                                                                                                                                                                                                                                                                                                         |
| Government apps, News, COVID-19   | No, if the card appears                                                                                                                           | The app is a Productivity app. Google's pages for these cards were found only by search on 2026-11-15, not read: unverified                                                                                                                                                                                                                                                                                                              |
| Generative AI (if the card shows) | Declare that the app generates content and that reporting is inside the app                                                                       | Report… on every answer (`apps/mobile/src/features/chat/components/MessageBubble.tsx`). Library items and artifacts have Report on Android through the app's own menu sheet (4.3). Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/13985936                                                                                                                                                      |
| Foreground service (if shown)     | None used                                                                                                                                         | WebRTC's screen-capture service is removed (`apps/mobile/native/android/withoutWebRTCScreenCapture.cjs`). Confirm on the merged manifest                                                                                                                                                                                                                                                                                                 |
| Photo and video permissions       | Do not file a declaration                                                                                                                         | No `android.permission.READ_MEDIA_IMAGES` or `android.permission.READ_MEDIA_VIDEO` (`granularPermissions: []` for expo-media-library in `apps/mobile/app.config.js`); attachments use the system picker. Source, read 2026-11-15: https://support.google.com/googleplay/android-developer/answer/14115180                                                                                                                                |

The App access instructions field: paste the block under "Paste this into
App access" at the top of `apps/mobile/store-listing/REVIEWER-NOTES-ANDROID.md`
(738 bytes), and put the review account's email and password in the fields
Play gives for them. The rest of that file is the reference you answer a
reviewer from; do not paste it. Google's pages read on 2026-11-15 state no
character limit for this field (unverified); check the counter as you paste.

### 7.5 Data safety

Google: declare every data type sent off the device, including data sent by
SDKs; for each, say whether it is shared, its purposes, whether it is optional
and whether it is ephemeral. Data may be "optional" only if users can choose
not to provide it; "ephemeral" means kept only in memory for the real-time
request. Google: if any user must provide a type, it is not optional, so one
required source makes the whole type required. Source, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/10787469.

Policy and programs, App content, Data safety. Answers for the first page:

- Does your app collect or share any of the required user data types? **Yes.**
- Is all of the user data collected by your app encrypted in transit? **Yes**
  (`allDataEncryptedInTransit: true`; every Cloud call is HTTPS).
- Which ways can users request that their data is deleted? Choose the in-app
  way and enter `https://agiworkforce.com/help/delete-your-account`
  (`dataDeletionRequestUrl`), only after the web deploy in 4.2, item 4.

Then each data type, exactly as `apps/mobile/store-listing/android/data-safety.json`
declares it. The listing note (`data_safety` in
`LISTING-METADATA-ANDROID.json`) and the reviewer notes say the same, and
`apps/mobile/__tests__/ios-store-submission-config.test.ts` fails if they
drift apart. Every type is collected and stored; none is ephemeral.

| Play category, type                   | Shared   | Purposes                              | Optional | What sends it                                                                                                                                                                      |
| ------------------------------------- | -------- | ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal info, Email address          | No       | App functionality, Account management | Yes      | Clerk sign-in (`apps/mobile/app/(auth)/login.tsx`); never in Local Mode                                                                                                            |
| Personal info, Name                   | No       | App functionality, Account management | Yes      | Only if the sign-in method provides it                                                                                                                                             |
| Personal info, User IDs               | No       | App functionality, Account management | Yes      | The account identifier on every Cloud request (`apps/mobile/services/api.ts`)                                                                                                      |
| Messages, Other in-app messages       | Yes, D10 | App functionality                     | Yes      | Cloud chat content forwarded to the model provider; a Local Mode content report the person chooses to send; support tickets and feedback                                           |
| Photos and videos, Photos             | Yes, D10 | App functionality                     | Yes      | Photos attached to a Cloud message; the Cloud profile photo                                                                                                                        |
| Audio, Voice or sound recordings      | Yes, D10 | App functionality                     | Yes      | Live voice in a Cloud chat. Dictation is on the device and offered only on Android 13 and later                                                                                    |
| Files and docs                        | Yes, D10 | App functionality                     | Yes      | Documents attached to a Cloud message                                                                                                                                              |
| Calendar, Calendar events             | Yes, D10 | App functionality                     | Yes      | Events a Cloud chat reads when the person asks about their schedule (`apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts`)                                         |
| App activity, In-app search history   | Yes, D10 | App functionality                     | Yes      | Chat search queries sent to `/api/search`, recorded by the server and sent to the embedding provider when the account has indexed content                                          |
| App activity, App interactions        | No       | Analytics                             | Yes      | Event names, only in Cloud and only after the person allows product analytics                                                                                                      |
| Device or other IDs                   | No       | App functionality, Analytics          | No       | Expo's per-install client ID with every update check (D8); Google ML Kit's per-installation identifiers; while signed in, the app's install ID with the device name and OS version |
| App info and performance, Diagnostics | No       | App functionality, Analytics          | No       | Google ML Kit's device, app and performance data, Local Mode included; the diagnostics a Cloud support ticket attaches unless the person turns that off                            |
| App info and performance, Crash logs  | No       | Analytics                             | No       | The launch error `expo-updates` sends with its update check (D8)                                                                                                                   |

Sources for the SDK rows, read 2026-11-15:
https://developers.google.com/ml-kit/android-data-disclosure and
https://docs.expo.dev/eas-update/store-privacy-declarations/. The ML Kit SDKs
are linked through Gradle (`apps/mobile/native/android/withAGIVisionOCR.cjs`,
`withAGITranslate.cjs`, `withAGIAICore.cjs`); confirm them in the merged
manifest of the first release bundle (section 11.4).

**The deletion page.** Google requires a web page where people can request
deletion without reinstalling the app, naming the app or developer as on the
listing, with an easy-to-find way to ask: a link, an email or a form. Source,
read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/13327111. The
page (`apps/web/content/support/delete-your-account.md`, served at
`/help/delete-your-account`) names AGI Mobile and gives the web pathway: sign
in at `agiworkforce.com/settings/account` and choose Delete account; if you
cannot sign in, email the privacy address from the account's address or use
the form at `/privacy/requests`; if the account was made with Sign in with
Apple and the web offers no Apple sign-in (D16), use the form. It states what
is deleted, what is kept and for how long, and how to cancel within the 24
hours. Production does not serve this version yet: enter the URL in Play
Console only after the web deploy (4.2, item 4), and open it once signed out
to check.

### 7.6 Store listing text

Grow users, Store presence, Main store listing. Paste from
`apps/mobile/store-listing/LISTING-METADATA-ANDROID.json`:

| Field             | JSON key            | Limit            | Length today |
| ----------------- | ------------------- | ---------------- | ------------ |
| App name          | `app_name`          | 30 characters    | 10           |
| Short description | `short_description` | 80 characters    | 62           |
| Full description  | `full_description`  | 4,000 characters | 828          |

Google forbids "Free", price and ranking claims in the title, icon and short
description; the short description has none. Source, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/13393723.

Store settings: category Productivity; email `support@agiworkforce.com`;
website `https://agiworkforce.com`. The phone is optional; leave it empty unless
you want one public (the JSON holds `__FOUNDER_TO_FILL__` there).

### 7.7 Store listing graphics

Source, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/9866151.

| Asset             | Google's rule                                                                                                                                                                                   | State on 2026-11-15                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| App icon          | 512 x 512, "32-bit PNG (with alpha)", at most 1024 KB                                                                                                                                           | Not exported. `apps/mobile/assets/icon.png` is 1024 x 1024 with no alpha channel          |
| Feature graphic   | 1024 x 500, JPEG or 24-bit PNG, no alpha                                                                                                                                                        | Does not exist (`feature_graphic` is `__DESIGN_TO_PRODUCE__` in the Android listing JSON) |
| Phone screenshots | At least two to publish, up to 8; JPEG or 24-bit PNG, no alpha; each side 320 to 3840 px; long side at most twice the short. Four or more at 1080 x 1920 or larger to be eligible for promotion | None captured. The pipeline makes 1080 x 1920 frames (section 8.8)                        |

Export the icon at 512 px with an alpha channel. On a Mac:

```bash
sips -z 512 512 apps/mobile/assets/icon.png --out play-icon-512.png
```

`sips -g hasAlpha play-icon-512.png` then reports `no`, because the source has
no alpha channel; Google's rule asks for 32-bit with alpha, so open the file in
any image editor and export it as a PNG with transparency (no transparent
pixels needed). Whether Play refuses a 24-bit icon outright is unverified.

### 7.8 The closed test (personal accounts only)

Do this after sections 7.4 to 7.7 are complete. Google's release page says to
set up the store listing and prepare the app for review before you create a
release, and "If the button is disabled, complete any outstanding setup tasks
on your Dashboard" (Source, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/9859348).
Whether Play refuses to send a closed release for review while the listing or
App content is unfinished was not seen on 2026-11-15 (unverified); if Create
new release or Send for review is greyed out, the Dashboard lists the
unfinished setup tasks.

1. Test and release, Testing, Closed testing: use the track Play offers or
   create one.
2. Testers: create an email list with at least 12 Google accounts of people who
   will keep the app installed. Save.
3. Create new release, Add from library, choose the build already in Internal
   testing (the hand-made `beta` bundle from 9.3), Next, Save, then send the
   changes for review. When the tagged `production` bundle exists (9.4), add it
   to this track the same way, so testers run what goes to Production. Google's
   page counts testers who stay opted in and says nothing about a new release
   restarting the 14 days (unverified either way).
4. Copy the opt-in link and send it to the testers. Each must open it, tap
   "Become a tester" and install the app from Play.
5. Do not let testers opt out: Google counts testers "opted in continuously for
   at least 14 days".
6. After 14 days, the Dashboard offers "Apply for production". The form asks
   about the test, the app and its readiness (three sections). Answer it
   plainly. Source, read 2026-11-15:
   https://support.google.com/googleplay/android-developer/answer/14151465.

### 7.9 Pre-launch report

Every upload to a testing track runs Google's pre-launch report on real
devices, subject to capacity. Its crawler signs in only through standard
widgets. Give it the same account: Test and release, Testing, Pre-launch
report, Settings, add the review account's email and password. Source, read
2026-11-15: https://support.google.com/googleplay/android-developer/answer/9842757.

Read the report (crashes, accessibility, screenshots) before you promote past
Internal testing. It is the first launch of this Android build on devices other
than yours.

### 7.10 Production and review

- **First:** confirm that nothing can be bought (section 4.5).
- **Organization account, or personal after the closed test:** Test and
  release, Production, Create new release, Add from library, choose the
  tagged `production` build from section 9.4 (not the hand-made `beta` bundle
  from 9.3, which is built with `APP_ENV` `preview` and the `beta` update
  channel; `apps/mobile/eas.json`). Next, then "Start rollout to production"
  (Google's wording for a first production release). Depending on whether the
  change needs review, Play shows Save, which queues it under Publishing
  overview, Changes ready to send for review, or Publish. Source, read
  2026-11-15: https://support.google.com/googleplay/android-developer/answer/9859348.
- Google reviews the release. The Dashboard and email report the outcome.
- After approval, raise the rollout to 100 percent when the crash rate in Play
  vitals is flat.

## 8. App Store, step by step

Open App Store Connect, Apps, AGI Mobile (Apple ID `6787526447`). In the
sidebar under iOS App, find the version in Prepare for Submission. The build
carries version `0.0.1` (`version` in `apps/mobile/app.config.js`). If the
version listed there has another number, such as 1.0, open it and change its
Version field to `0.0.1`. Use the plus button for a new version only when no
version is listed. Apple's pages read on 2026-11-15 do not say what number a new
app record starts with, or when the field can be edited (unverified); if the
field will not take `0.0.1`, stop and tell Claude, because the build's number
would have to change (D1). Values are in
`apps/mobile/store-listing/LISTING-METADATA-IOS.json`.

### 8.1 App Information

- Name `AGI Mobile` (`app_name`, 10 of 30 characters); subtitle `subtitle`
  (22 of 30).
- Primary category Productivity, secondary Utilities.
- Content Rights: your answer to D13.
- Age rating: section 8.5.

### 8.2 Version page

| Field            | Value and source                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Promotional text | `promotional_text` (116 of 170)                                                                                   |
| Description      | `description` (837 of 4,000)                                                                                      |
| Keywords         | `keywords` (55 of 100 bytes). Apple requires each keyword to be "greater than two characters"; every one is       |
| Support URL      | `urls.support`, `https://agiworkforce.com/support`. Apple requires it to lead to real contact information         |
| Marketing URL    | `urls.marketing`                                                                                                  |
| What's New       | Not shown for a first version                                                                                     |
| Copyright        | `2026 AGI Automation LLC`, as in the JSON. Apple says "The copyright symbol is added automatically", so type no © |
| Version release  | Manual: the app waits in "Pending Developer Release" after approval until you release it                          |

Source for the fields, read 2026-11-15:
https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information.

**Leave "In-App Purchases and Subscriptions" on the version page empty.** Eight
products were created in this app record on 2026-10-21. They stay unattached
and unsubmitted. Attaching any of them contradicts the build and the listing.

**Server notification URLs:** leave them as set on 2026-10-21. They carry
consent-withdrawal notices as well as purchase notices and do nothing while
nothing is sold.

### 8.3 App Review Information

- **Sign-in required:** on. User name and password of the review account
  (section 10). Apple: "The demo account is used during the App Review process
  and must not expire." Never commit the credentials.
- **Contact:** first name and last name from `contact_information`; email from
  `app_review_information.review_contact_email` (`review@agiworkforce.com`, the
  mailbox from section 5.1 item 5); phone from
  `app_review_information.review_contact_phone`. All in the iOS listing JSON.
  Apple: the phone must be "in international format, including a plus sign
  (+)". `contact_information.email` is the same role address.
- **Notes:** at most 4,000 bytes: "The Notes field can contain up to 4000
  bytes." Paste the block under "Paste this into App Review notes" at the top
  of `apps/mobile/store-listing/REVIEWER-NOTES-IOS.md` (2,894 bytes on
  2026-11-15; `apps/mobile/__tests__/ios-store-submission-config.test.ts` holds
  it at 3,900 or less), replacing its two bracketed placeholders with the review
  account's email and password. The rest of that file is the reference you
  answer App Review from; do not paste it. The block tells App Review that
  nothing is sold on any platform before 1 January 2027 and that the demo
  account's plan was granted for review, which holds only after section 4.5.
  If D6 ends on Free, ask Claude to change that paragraph first. Count the
  bytes after any edit, with the text copied:

```bash
pbpaste | wc -c
```

It must print 4000 or less.

### 8.4 App Privacy

App Privacy, Privacy Policy URL `https://agiworkforce.com/privacy`, then Get
Started, "Yes, we collect data from this app". Apple's definitions: "collect"
means transmitting data off the device so you or partners can access it
"longer than what is necessary to service the transmitted request in real
time"; data from SDKs counts; personal data is "linked to the user". Source,
read 2026-11-15: https://developer.apple.com/app-store/app-privacy-details/.

Enter exactly what `privacy_nutrition_labels` in
`apps/mobile/store-listing/LISTING-METADATA-IOS.json` and the privacy manifest
(`ios.privacyManifests` in `apps/mobile/app.config.js`) declare. No type is
used for tracking.

| Apple data type                    | Linked to the user | Purpose                      | What sends it                                                                                                                                                              |
| ---------------------------------- | ------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info, Email Address        | Yes                | App Functionality            | Clerk sign-in                                                                                                                                                              |
| Contact Info, Name                 | Yes                | App Functionality            | Only if the sign-in method provides it                                                                                                                                     |
| User Content, Other User Content   | Yes                | App Functionality            | Cloud messages, attached files, the calendar events a Cloud chat reads, a Local Mode report the person sends                                                               |
| User Content, Photos or Videos     | Yes                | App Functionality            | Photos attached to a Cloud message; the profile photo                                                                                                                      |
| User Content, Audio Data           | Yes                | App Functionality            | Live voice in a Cloud chat                                                                                                                                                 |
| User Content, Customer Support     | Yes                | App Functionality            | Support tickets and feedback in Cloud                                                                                                                                      |
| Identifiers, User ID               | Yes                | App Functionality            | Every Cloud request                                                                                                                                                        |
| Identifiers, Device ID             | Yes                | App Functionality, Analytics | The install ID sent on every signed-in session and with the push token; Expo's per-install client ID with every update check (D8). One answer covers both, so it is linked |
| Usage Data, Product Interaction    | Yes                | Analytics                    | Cloud only, after the person allows product analytics                                                                                                                      |
| Search History                     | Yes                | App Functionality            | Chat search queries recorded by `/api/search`                                                                                                                              |
| Diagnostics, Other Diagnostic Data | Yes                | App Functionality            | The diagnostics a Cloud support ticket attaches unless the person turns that off                                                                                           |
| Diagnostics, Crash Data            | **No**             | App Functionality            | The launch error `expo-updates` sends with its update check (D8)                                                                                                           |

Tracking: No for every type. `NSPrivacyTracking` is false in the privacy
manifest. The labels you publish must match the binary: enter these answers
only for a build made after the manifest change in 4.3, never for the build the
simulator rounds ran.

Then Publish.

### 8.5 Age rating

App Information, under Age Ratings, Set Up Age Ratings (Edit once set). The
dialog first lists in-app controls and capabilities, then content sections, each
with a frequency level, then Age Categories and Override. Since 2026-01-31 every
app answers Apple's current questions; the ratings are 4+, 9+, 13+, 16+ and
18+, and AI chatbot output must be counted. Sources, read 2026-11-15:
https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions,
https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
and https://developer.apple.com/news/?id=ks775ehf.

**Two answers make the app impossible to publish.** Apple rates an app
Unrated for "Infrequent or Frequent graphic sexual content and nudity" or
"Infrequent or Frequent prolonged graphic or sadistic realistic violence", and
"An Unrated app can't be published on the App Store." Both stay **None**.

Answer the live form item by item from `age_rating.questionnaire` in the iOS
listing JSON, which follows Apple's current groups and levels and gives a
reason for each answer. The tier each answer reaches is from Apple's
definitions page:

| Item                                             | Answer     | Tier it reaches | Why                                                                 |
| ------------------------------------------------ | ---------- | --------------- | ------------------------------------------------------------------- |
| Parental Controls                                | Yes (D13)  | 4+              | Your call                                                           |
| Age Assurance                                    | Yes        | 4+              | The Declared Age Range request and the typed age                    |
| Unrestricted Web Access                          | Yes        | 16+             | A link in an answer opens any page in the in-app Safari sheet       |
| User-Generated Content                           | Yes        | 4+              | Projects and agents shared by other people, and published artifacts |
| Social Media; Social Media Disabled for Under 13 | No; No     | None            | No feed and no social features                                      |
| Messaging and Chat, Advertising                  | No         | None            | No person-to-person messaging; no ad SDK                            |
| Profanity or Crude Humor                         | Infrequent | 9+              | AI output is not fixed, so occasional content is possible           |
| Horror/Fear Themes                               | Infrequent | 9+              | Same reason                                                         |
| Alcohol, Tobacco, or Drug Use or References      | Infrequent | 13+             | Same reason                                                         |
| Medical or Treatment Information                 | Infrequent | 13+             | Same reason                                                         |
| Health or Wellness Topics                        | Yes        | 9+              | An assistant answers health questions                               |
| Mature or Suggestive Themes                      | Infrequent | 9+              | Same reason                                                         |
| Sexual Content or Nudity                         | Infrequent | 13+             | Same reason                                                         |
| Graphic Sexual Content and Nudity                | None       | None            | Infrequent or Frequent makes the app Unrated                        |
| Cartoon or Fantasy Violence                      | Infrequent | 9+              | Same reason                                                         |
| Realistic Violence                               | Infrequent | 13+             | Same reason                                                         |
| Prolonged Graphic or Sadistic Realistic Violence | None       | None            | Infrequent or Frequent makes the app Unrated                        |
| Guns or Other Weapons                            | Infrequent | 9+              | Same reason                                                         |
| Gambling, Loot Boxes                             | No         | None            | Not in the app                                                      |
| Simulated Gambling, Contests                     | None       | None            | Not in the app                                                      |

Before Save, read the calculated rating under Additional Information. It must
say 16+ (`age_rating.rating` in the JSON), set by Unrestricted Web Access, and
never Unrated. 16+ is above the Terms minimum of 13, so no override is needed.
AGI Cloud accounts are 13 and over, 16 in EU zones and 18 in India and Brazil
(`apps/mobile/src/features/auth/services/ageGate.ts`). Whether App Review
requires higher regional overrides is unverified.

### 8.6 Export compliance

The build sets `ITSAppUsesNonExemptEncryption` to `false`
(`apps/mobile/app.config.js`), so App Store Connect asks no question at upload.
The listing (`export_compliance.basis`) and the iOS reviewer notes state the
facts, including the two libraries that bring their own cryptography (D9). Do
not submit until counsel has decided. If counsel decides documentation is needed, Apple issues a code for
`ITSEncryptionExportComplianceCode`, and Claude changes the build. Sources,
read 2026-11-15:
https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
and
https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption.

### 8.7 Pricing and availability

- Price: Free.
- Availability: `availability.territories` in the iOS listing JSON, "All App
  Store territories excluding: Mainland China, Russia, Iran, North Korea,
  Syria, Cuba, Crimea". France stays in unless D9 removes it.
- Pre-order: off.

### 8.8 Screenshots

Apple: "To submit your app, you must provide screenshots for the following
required display sizes: iPhone: At least one screenshot for iPhone with
Dynamic Island (medium display). iPad (if your app supports iPadOS): At least
one screenshot for iPad 13-inch display." "Images can't include alpha channels
or transparencies." One to ten per size, JPEG or PNG. Source, read 2026-11-15:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications.
Guideline 2.3.3: screenshots show the app in use, not only a title, login or
splash screen.

| App Store Connect slot                      | Accepted portrait sizes                 | Pipeline class      | Upload                    |
| ------------------------------------------- | --------------------------------------- | ------------------- | ------------------------- |
| iPhone with Dynamic Island (medium display) | 1179 x 2556 or 1206 x 2622              | `iphone-17-pro`     | Required                  |
| iPhone with Dynamic Island (large display)  | 1260 x 2736, 1290 x 2796 or 1320 x 2868 | `iphone-17-pro-max` | Upload as well            |
| iPad 13-inch display                        | 2064 x 2752 or 2048 x 2732              | `ipad-pro-13`       | Required if D2 keeps iPad |

How to make them is in `apps/mobile/store-listing/screenshots/RUNBOOK.md`. The
captures from 2026-09-26 and 27 predate later chat changes, and four of the
five iPhone frames have an alpha channel, so recapture. Convert each composited
PNG to JPEG before uploading, which removes the alpha channel:

```bash
sips -s format jpeg 01-local-demo-chat.png --out 01-local-demo-chat.jpg
```

Check every frame before uploading: one that shows a price, a plan to buy or
an "Upgrade" control does not match the build.

### 8.9 Build upload and TestFlight

The tagged release (section 9.4) builds iOS and uploads it to TestFlight. Then:

1. Wait for Apple's processing email. Read it for ITMS-91061 (missing privacy
   manifest) or ITMS-91065 (missing signature). Apple's list of commonly used
   SDKs that must carry a manifest and signature includes SDWebImage, BoringSSL,
   GoogleUtilities, Promises, Reachability and hermes, all present in this app's
   dependencies. Source, read 2026-11-15:
   https://developer.apple.com/support/third-party-SDK-requirements/. If an
   email names one, send it to Claude before submitting.
2. TestFlight, Internal Testing: add yourself as a tester and install from the
   TestFlight app. Internal testers need no Apple review. Builds expire after
   90 days. Source, read 2026-11-15:
   https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview.
3. External testers are optional. The first build sent to an external group goes
   to Beta App Review and needs Test Information (description, what to test,
   feedback email).

Apple requires uploads built with Xcode 26 or later against the iOS 26 SDK
since 2026-04-28. `apps/mobile/eas.json` uses the EAS image
`macos-tahoe-26.5-xcode-26.6`, which meets it. Source, read 2026-11-15:
https://developer.apple.com/news/upcoming-requirements/. Recheck that page
before each upload.

### 8.10 Submit and release

1. On the `0.0.1` version page, Build, choose the TestFlight build.
2. Confirm that nothing can be bought (section 4.5).
3. Check every field in 8.2 and 8.3 once more, then Add for Review, then Submit
   for Review.
4. The earlier runbook said to answer "No" to an advertising identifier
   question at submission. No Apple page read on 2026-11-15 shows that question
   still exists (unverified). If App Store Connect asks it, the answer is No:
   the app has no advertising SDK and tracks nothing.
5. After approval the version waits in "Pending Developer Release". Release it
   from the version page when you are ready.
6. **Phased release** spreads a version update over seven days (1, 2, 5, 10,
   20, 50, 100 percent) to people with automatic updates. Apple describes it for
   updates, not a first version. Use it from the first update on. Source, read
   2026-11-15:
   https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases.

## 9. Building and uploading both binaries

Each store build spends Expo build minutes. Nothing here starts one for you.

### 9.1 Before any build

1. **The Expo package check.** Both the release workflow and the local scripts
   stop when an Expo package is behind what the SDK expects:

   ```bash
   pnpm --filter @agiworkforce/mobile run check:expo-deps
   ```

   It must end with "Expo dependencies are compatible". The repository refuses
   any package published less than seven days ago, so the check holds a patch
   that is still too young, prints the date it can be installed, and passes.
   On 2026-11-14 the packages were at the 2026-11-05 patches, and the 2026-11-12
   patches could be installed from 2026-11-19. When the check ends with "Found
   outdated dependencies", ask Claude to "apply the Expo patch update", or run:

   ```bash
   pnpm --filter @agiworkforce/mobile exec expo install --fix
   ```

   ```bash
   pnpm install
   ```

   then rerun the check and commit `apps/mobile/package.json` and
   `pnpm-lock.yaml`. If `pnpm install` refuses a version as too new, set that
   package back to the version the check printed and install again.

2. **EAS environment values.** In expo.dev, the project, Environment variables,
   both the `production` and the `preview` environments need
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (a `pk_live_` key) and
   `EXPO_PUBLIC_API_URL` (`https://agiworkforce.com`). The beta profile uses the
   `preview` environment and sets `APP_ENV` to `preview`, and
   `apps/mobile/app.config.js` refuses a non-live Clerk key or a non-HTTPS API
   address for `preview` as well as `production`. Whether the `preview`
   environment holds them today is unverified. A build started on your Mac also
   needs the same two values exported in your terminal, because EAS reads the
   configuration once on your Mac before it fetches the server environment
   (`build/evaluateConfigWithEnvVarsAsync.js` in the EAS command line source,
   version 24.8.0). Section 6.2 has the two `export` lines.
3. **A clean, committed checkout.** `apps/mobile/eas.json` sets `requireCommit`,
   and the preflight refuses a dirty tree. The working tree held about 1,600
   uncommitted changes on 2026-11-15; the store build is made from what is
   committed, not from what the simulator rounds ran.

### 9.2 What the commands do

Each runs `apps/mobile/scripts/release/preflight.sh` first (EAS sign-in, the
Expo check, the update URL, TLS pins, the live Cloud routes, the store-listing
reconciliation and a clean tree), then `eas build --non-interactive`. Flags go
straight after the script name, with no `--` in between: with the pinned pnpm
(`packageManager` in `package.json`), a `--` reaches the script and the script
stops with "unknown arg: --". The release workflow passes the flag this way,
and so do the submit hints the scripts print
(`release:ios:prod:submit --build-id <id>` and the others).

| Command                                                                     | Where it runs             | Profile      | Output                                    | Upload                         |
| --------------------------------------------------------------------------- | ------------------------- | ------------ | ----------------------------------------- | ------------------------------ |
| `pnpm --filter @agiworkforce/mobile run release:android:beta`               | Your Mac, repository root | `beta`       | Android App Bundle (`:app:bundleRelease`) | None; download it              |
| `pnpm --filter @agiworkforce/mobile run release:ios:beta`                   | Your Mac, repository root | `beta`       | Store-signed iOS build                    | None                           |
| `pnpm --filter @agiworkforce/mobile run release:ios:prod --auto-submit`     | The release workflow only | `production` | Store-signed iOS build                    | TestFlight, through EAS Submit |
| `pnpm --filter @agiworkforce/mobile run release:android:prod --auto-submit` | The release workflow only | `production` | Android App Bundle                        | Play Internal testing, draft   |

The two `--auto-submit` rows are for the workflow, not your Mac. With
`--auto-submit` the preflight also requires `ascAppId` in
`submit.production.ios` of `apps/mobile/eas.json` (only the workflow writes it,
through `apps/mobile/scripts/release/configure-ios-submit.sh`) and a key file in
the mobile app's `secrets` folder (the App Store Connect API key for iOS, the
Google Play service account file for Android), which only the workflow creates
and deletes again.

`appVersionSource` is `remote` and `autoIncrement` is on for both store
profiles, so EAS ignores `buildNumber` and `versionCode` in
`apps/mobile/app.config.js` and counts on its own server. Source, read
2026-11-15: https://docs.expo.dev/build-reference/app-versions/.

### 9.3 The first Android bundle, by hand

The fingerprint in section 6.3 needs a bundle in Play first, and the tagged
release cannot provide it because its Android job checks for that fingerprint
before it builds.

In a new terminal at the repository root, export the two values the
configuration checks (the same as section 6.2; the preflight itself requires
`EXPO_PUBLIC_API_URL`, and `apps/mobile/app.config.js` stops a `preview` build
without a `pk_live_` key):

```bash
export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="$(gh variable get EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --env mobile-store-release)"
```

```bash
export EXPO_PUBLIC_API_URL=https://agiworkforce.com
```

```bash
pnpm --filter @agiworkforce/mobile run release:android:beta
```

Result: the command ends with "Android build queued." and a link to the build
on expo.dev. When it finishes (about 15 to 30 minutes; an estimate), open the
build on expo.dev and download the `.aab`.

Upload and roll it out to yourself:

1. Play Console, the app, Test and release, Testing, Internal testing,
   Testers tab: Create email list, name it (for example "Owner"), add your own
   Google account, Save changes, then Create. Tick the list and Save changes.
2. Releases tab (on the same Internal testing page): Create new release.
   Google enrolls a new app in Play App Signing with Google-generated keys
   automatically (answer 9842756, read 2026-11-15); if Play asks, keep Google's
   key. Upload the `.aab`. Save as draft, then Next.
3. Review release: resolve any error shown; Google: "You can't publish your app
   until errors are resolved." Then click the rollout button at the bottom
   (Google's page calls it "Start rollout"; the exact label on the Internal
   testing page was not seen).
4. Back on the Testers tab, copy the link Google gives for testers. Open it on
   the Android phone with the same Google account, accept the invitation and
   install AGI Mobile from Play. Google says the opt-in link is not shown for an
   app still in Draft status; if the link page says the app is not available,
   wait until the release shows as available to internal testers (unverified
   how long that takes).

Sources, read 2026-11-15:
https://support.google.com/googleplay/android-developer/answer/9845334 and
https://support.google.com/googleplay/android-developer/answer/9859348.
Uploading by hand keeps the Play key file off your laptop. Then do section 6.3.

If it goes wrong:

- The command stops with "[clerk] preview builds require
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to be a live Clerk publishable key" or
  "[expo-router] preview builds require an HTTPS EXPO_PUBLIC_API_URL origin":
  the two `export` lines were not run in this terminal.
- The preflight stops on "git working tree is clean": commit or ask Claude.
- The build fails in Gradle: send the build's log link to Claude. This is the
  first Android build of this code; a failure here is expected to need a fix.
- The upload says the version code was used: build again; EAS counts up.

### 9.4 The tagged release

When sections 4 to 8 are done and the branch carrying this work is merged,
check that the required reviewer from
section 5.3 item 3 is set: without it, pushing the tag builds and submits at
once. Then, on the merged commit:

```bash
git tag v-mobile-0.0.1
```

```bash
git push origin v-mobile-0.0.1
```

`.github/workflows/release-mobile.yml` then:

1. **Validates** the tag against both version sources, the Cloud routes, the
   Apple login option, type checks, lint, tests, privacy declarations, TLS pins,
   release integrity, the store listings, the exported bundle and a clean
   native prebuild.
2. **Runs the device matrix**: release simulator builds on the newest iPhone,
   the smallest iPhone and an iPad. iOS only: unless you choose the Android
   build gate (D20), nothing compiles or launches the Android app before the
   Play upload.
3. **Waits for your approval** on the `mobile-store-release` environment.
4. **iOS:** builds the `production` profile and submits that build to
   TestFlight.
5. **Android:** checks both association files, then builds the `production`
   profile and submits it to Internal testing as a draft.

It publishes nothing to the public.

The tag push is itself the validation run. Pushing a `v-mobile-*` tag starts
the whole workflow, and the only thing between validation and the store builds
is the approval in step 3. Open GitHub, Actions, Release Mobile Apps, the run
for the tag. Approve the `mobile-store-release` deployment only when the
validate and device matrix jobs are green. A manual run (Run workflow, tag
`v-mobile-0.0.1`, publish unticked) validates an existing tag again without
building; it cannot come first, because the validate job checks out the tag and
requires `git describe --tags --exact-match` to name it, so the tag must
already be pushed.

**Then roll out the Android build to yourself.** EAS Submit uploads it as a
draft (`releaseStatus: "draft"` in `apps/mobile/eas.json`). Play Console, Test
and release, Testing, Internal testing, Releases: open the draft, Next, then
the rollout button, as in section 9.3 steps 3 and 4. The phone from 9.3
receives the update from Play. On a personal account, also add this build to
the closed track (section 7.8 step 3).

If it goes wrong:

- The iOS job fails at credentials, or its log warns "Failed to authenticate"
  before a missing-profile error: section 6.2, including the App Store Connect
  key's role, is incomplete.
- The Android job fails at "Verify deployed Apple and Android association
  documents": section 6.3 is incomplete.
- Any failure that needs a code change needs a new tag on the fixed commit.
  Delete the old tag on GitHub and on your Mac:

  ```bash
  git push --delete origin v-mobile-0.0.1
  ```

  ```bash
  git tag -d v-mobile-0.0.1
  ```

  then merge the fix, and tag and push again as above. Deleting a tag removes
  only the label, not any commit. If a build was already uploaded, leave it:
  the next build gets a higher build number from EAS.

## 10. The review account

Both stores sign in with the same account. It must be a real production account
that needs only an email and a password.

1. Sign up at `https://agiworkforce.com/signup` with an address you control,
   for example `appreview@agiworkforce.com`, and a strong password. Verify the
   email.
2. Do not add a passkey or two-step verification.
3. Sign out, open a private window and sign in again from another network. If
   Clerk asks for a code sent by email on a new device, Client Trust is on:
   turn it off in the production Clerk dashboard (Configure, Attack
   protection), or the reviewer cannot get in.
4. **Grant it a plan by hand** (D6). On 2026-11-14 the Free plan allowed 2
   credits per five hours, and in the iPhone simulator a Free account's photo
   message was refused at the limit after one earlier short message. The Free
   allowance is now 200 credits per five hours (`fiveHourCredits` for `free`
   in `packages/contracts/types/src/managed-usage-limits.ts`), and a credit is
   5,000 micro-dollars (`MICROUSD_PER_CREDIT` in
   `packages/contracts/types/src/credits.ts`), so 200 credits is one dollar;
   production applies it, and serves the second Free model, only once the web
   app is deployed (4.2, item 5).

   The plan is granted, not bought: nothing is sold before 1 January 2027, and
   the reviewer notes say the plan was granted for review. Do not use the web
   checkout, with or without a 100 percent coupon; checkout stays closed
   (section 4.5). The code has no screen or route that grants a plan: access
   codes from the operator dashboard grant upgrade access only, never a plan
   (`createUpgradeAccessCode` in
   `apps/web/features/admin/services/operator-upgrade-access.ts`), and no route
   under `apps/web/app/api/admin` sets an account's plan. So the grant is a
   change to the account's row in the production `subscriptions` table:

   - `plan_tier`: the plan you choose (below), a personal plan;
   - `status`: `active`;
   - no Stripe subscription, Apple transaction or Google purchase token on the
     row, and no Stripe customer on the account.

   Production then reads its billing source as manual
   (`resolveSubscriptionBillingSource` in
   `apps/web/lib/server/subscription-billing-owner.ts`), the phone's Plan screen
   shows "Billing: Included with your account", and, once the change in 4.2
   item 2 is deployed, Delete Account schedules the deletion instead of
   refusing it. Apple says the demo account "must not expire": give the row no
   end date. How the server treats a granted plan whose period end has passed
   is unverified. Ask Claude to prepare the statement against the production
   database; running it is yours.

   What the reviewer sees depends on the plan (`BILLING_PLAN_CAPABILITY_TIERS`
   in `packages/contracts/types/src/billing-catalog.ts`):
   - `basic`: Free plus Connectors. No Work, Deep Research or image generation.
   - `pro`, `max` or `max_15x`: also Work, Deep Research, image generation and
     the developer surfaces; video only on `max_15x`, which is off in version 1.

   Settings, Subscription then shows the plan name and a plain-text Billing
   line.

5. On a phone, go through the whole path once: Cloud, age, sign-in, Terms,
   "Share with AI providers?", one chat with web search and a photo, Settings,
   Subscription. Then delete the account from Settings and cancel the deletion
   by signing back in. The answer must be a scheduled deletion, not a refusal.
6. Enter the credentials in App Store Connect (8.3), in Play App access (7.4)
   and in the Play pre-launch report settings (7.9). Never commit them.

## 11. Checks on the emulator and on real phones before submitting

The Android emulator can show layout, Back, menus, links, shares and the
manifest; it cannot show the camera, a real microphone, push, a fingerprint,
store screens or what Play installs. So the Android checks come in two groups:
section 11.3 on an emulator (or a computer with the Android tools), which can
start as soon as an Android build exists, and section 11.4 on a real phone
installed from Play Internal testing. The iPhone checks need TestFlight. Tell
Claude what you saw for each line.

### 11.1 Both phones

- First launch, the disclosure sheet, the age question, a Local chat in
  airplane mode.
- Sign up, sign out, sign in with email and password, with an emailed code,
  then with Apple (iPhone) and Google. On the iPhone, open "More sign-in
  options": Apple must appear wherever Google or GitHub appears (Guideline 4.8).
- Cloud chat, web search, a photo attachment, dictation (Android 13 and later
  only), live voice.
- The review account (section 10): Settings, Subscription is titled Plan and
  shows the plan with "Billing: Included with your account", and no price, no
  upgrade and no restore. The model picker and Schedules offer no plan.
- Open Terms, Privacy, Help, Status, Support and the "Delete your account" help
  page from About and Settings, after the web deploy (4.2): none may show a site
  header, a pricing link or a contact-sales link. On the deletion page the
  `agiworkforce.com/settings/account` link keeps `from=mobile`, and the email
  link and the `/privacy/requests` form open. On Android these pages open in a
  Custom Tab.
- Remote Control is gone: no Remote control section in Settings or AGI Code
  settings, no Desktop control row in Settings, Capabilities.
- Report a text answer, an image-only answer, a generated image and a Library
  item, in Cloud and in Local Mode. In Local Mode the report is sent only after
  Send, while chat traffic to AGI hosts stays blocked; reports made offline are
  sent later.
- Hide something shared with you from a second account, then check whether
  that person's items come back on another device or on the web (D12).
- Delete the account, then cancel (section 10, item 5).
- Settings, Connectors: note whether a "Health" or "Life sciences" chip
  appears with an empty list (D11).
- A notification (Android only if Firebase was set up, D3).
- `https://agiworkforce.com/auth/reset-password` opens the app.
- VoiceOver and TalkBack through sign-in and one chat.
- While a reply is being written, the AGI mark beside it shimmers. That
  animation once crashed the app at launch; the fix was checked in the
  simulator only.
- Paste the iOS notes block and the Play App access block into the live fields
  and check each field's counter.

### 11.2 iPhone only

- Force-quit, then cold-launch the TestFlight build: it must open.
  `expo-background-task` registers its task at launch although version 1 no
  longer permits that identifier; Apple documents that registration then
  returns false.
- Read Apple's processing email for the build (section 8.9) and build the
  Xcode privacy report from the `.ipa`.
- Download the `.ipa` from expo.dev, unzip it, open
  `Payload/Mobile.app/Info.plist`: no `UIBackgroundModes` and no
  `BGTaskSchedulerPermittedIdentifiers`. `CFBundleVersion` and
  `CFBundleShortVersionString` must be identical in the app and in
  `PlugIns/AGIShareExtension.appex/Info.plist` and
  `PlugIns/AGIWidgets.appex/Info.plist`, and each extension's
  `embedded.mobileprovision` must name its own bundle identifier and the app
  group. A TestFlight upload that passes Apple's validation confirms it.
- Signed out in Local Mode, watch the first launch through a proxy: a request
  to `u.expo.dev` with an `EAS-Client-ID` header confirms the Device ID and
  Crash Data answers (D8).
- On iOS 26, Cloud sign-in asks for the declared age range; an under-age
  answer refuses sign-in.
- **Sign in with Apple and deletion.** Neither the server nor Clerk revokes
  Apple's authorization: nothing in `apps/web` calls Apple's revoke endpoint
  and the server holds no Apple key or token, and Clerk's Apple setup page
  (read 2026-11-15) says nothing about revoking it when a user is deleted. So
  Apple's manual path applies: the app tells the person to remove it under
  Settings, your name, Sign in with Apple. Check: sign up with Sign in with
  Apple (with Hide My Email), then Settings, Account, Delete Account. The
  confirmation names that path; after the web deploy (4.2, item 3) the
  "Account deletion scheduled" alert does too. Then in iOS Settings, your name,
  Sign in with Apple, the app is listed, and Delete removes it. Sign in again
  with Apple, remove the app there while it is open: it signs out
  (`apps/mobile/src/features/auth/components/AppleRevokeListener.tsx`). Source,
  read 2026-11-15:
  https://developer.apple.com/support/offering-account-deletion-in-your-app/.
- A long press on a link in an answer still shows the system menu (Open, Copy
  Link, Share Link, Cancel), and taps with no menu open are unaffected.
- Code is in Menlo everywhere, including a connector's detail screen and the
  share preview, which used a proportional face before.
- Voice picker: close it with the X, with a drag down and with Start Voice, and
  reopen it each time. The model picker closes and clears its search.
  Add-to-chat still loads the Library list, and offers Paste image when the
  clipboard holds an image. The report sheet closes with a swipe down and shows
  its Close control.
- Dictation asks for permission on first use, then transcribes on the device.
- From the Shortcuts app, run Scan Document, Analyze Image (with a question)
  and Transcribe Audio with a picked image or recording: each screen receives
  the file. Then open
  `agiworkforce://intent/scan?imageUri=file:///private/var/mobile/x.jpg` from
  Safari or Notes: the Scan screen opens without that file.
- Share a photo, a HEIC photo from Photos and a file into the app: each
  attaches. The share sheet and the widget gallery say AGI Mobile, and the
  widgets show data from the shared app group.
- Download a Local model, then iPhone Settings, your name, iCloud, storage,
  Backups, this iPhone: AGI Mobile's backup size must be far below the model's.
- Tap a widget, a Siri shortcut and the Control Center control twice each with
  a return to the Home Screen between: the app opens every time.
- Change Text Size from Control Center with a chat open: the screen stays put.
- iPad, if D2 keeps it: rotate through all four orientations, Split View,
  sign-in, one chat. If D2 turns it off, still run the iPhone build on an iPad.

### 11.3 Android on an emulator

Images: Android 16 (API 36) and Android 15 (API 35), each with gesture
navigation and with three-button navigation; Android 14 (API 34) for the layout
checks, because the app turns edge to edge off on Android 14 and lower; Android
12 (API 31 or 32) for dictation; a Google Play image for Play Age Signals and
speech; the 16 KB page-size Android 15 image; and a tablet or foldable image at
600 dp wide or more. Claude can run these one at a time through
`scripts/dev/heavy-job.sh`.

First, on either platform: the JavaScript bundle must build. `expo start` or
`expo export` has to get past the Tailwind configuration that NativeWind loads;
that load was checked only in plain Node on 2026-11-15.

- **Names.** The launcher label reads "AGI Mobile", not "Mobile". In another
  app (for example Chrome), select text and open the selection menu: the entry
  reads "AGI Mobile" and opens the composer with the text. The camera,
  microphone and calendar permission dialogs name "AGI Mobile".
- **First launch.** Cold launch with no crash; onboarding, the AI disclosure,
  the age step, a Local chat, Cloud sign-in with email and password, a Cloud
  chat.
- **Insets.** With both navigation modes, the status and navigation bars cover
  no header, composer or sheet. Under a complete answer open More, then Report:
  the header and Close sit below the status bar and are tappable, the form's
  bottom clears the navigation bar, and Send stays above the keyboard when the
  text field has focus. Open the response rating details, the tool-call
  timeline, a table in full screen, a file viewer, context details, artifact
  version history, the time zone picker and the Cloud Code sheets: each header
  sits below the status bar and each bottom control above the navigation bar.
- **Keyboard.** Type in the composer (new chat and thread), the model picker
  search, the add-to-chat inputs, the bottom search bar on Chats, Library,
  Projects, Archived chats and Connectors, and the inputs in dialogs (rename,
  edit message, report details, add memory, new skill, custom connector, step-up
  check). Each field stays directly above the keyboard, with no extra gap, and
  the bottom search bar returns to its place when the keyboard hides. Check on
  API 35 or 36 and on API 34.
- **Back.** System Back and the back gesture, with predictive back on Android
  16: on the home chat, inside a chat, with the drawer open, with a sheet open,
  on a settings screen. Each press closes the top layer or goes back one
  screen, and never closes the app from inside a screen (`MOBILE-022`,
  `MOBILE-023` in `audit/prior-audits/mobile-public-release-audit.md`).
- **Back on sheets.** For the add-to-chat sheet, the model picker and the voice
  picker, each: (a) open it, wait until it settles, press Back: the sheet
  closes and the screen under it does not move; (b) open it and press Back at
  once, while it is still sliding up: the sheet closes and the screen does not
  navigate; (c) press Back again: the normal behaviour returns (the previous
  screen, or on the root chat the "Press back again to exit" prompt); (d) voice
  picker only, after (b): tap the voice control again and the picker opens;
  (e) model picker: after a close, its search and filters are cleared.
- **Menus.** A long press on a link in an answer opens the app's sheet titled
  with the link's host, with Open, Copy Link, Share Link and a Cancel row. Open
  loads the page, Copy Link shows the Copied notice, Share Link opens the
  Android share sheet, and Cancel, Back and a tap on the dimmed area each close
  it. A plain tap still opens the link at once. A citation that groups two or
  more sources (try four or more) opens the same sheet listing every source in
  order, scrolling if long; a single-source citation still opens directly.
  Long-press a Library item, a presentation slide and a generated image, and tap
  an artifact's More button: every action shows, Report, Share and Delete
  included, with a way to cancel. The sheet sits above the navigation bar, draws
  over the chat and over an open artifact, never over the app lock cover, and
  nothing invisible blocks taps when no sheet is open.
- **Explanation lines.** Filter chats (Chats list), Sort saved files (Library)
  and a member's access chooser (Project settings) each show their explanation
  line under
  the title, wrapping at large text sizes without being cut off. The Library
  options menu shows no extra line.
- **Code font.** A reply with a fenced code block, inline code, an ASCII table
  and a diff, plus a tool's file diff: columns line up in a monospaced face.
  Also the math, chart and Mermaid source views, the licenses screen and the
  two-factor recovery codes. Repeat at system font size 200 percent and the
  largest display size: the composer, headers and menus stay reachable.
- **Dictation floor.** On API 31 or 32 the composer shows no dictation
  microphone and no microphone permission prompt appears. On API 33 or later
  (Google Play image), the microphone shows; the first tap asks for the
  permission, then dictation produces text. If the image has no on-device
  model for the speech language, the app says so by name and sends nothing to a
  server.
- **Links into the app that name a file.** With `adb shell am start -a android.intent.action.VIEW -d <link>`:
  `agiworkforce://intent/scan?imageUri=file%3A%2F%2F%2Fdata%2Fuser%2F0%2Fcom.agiworkforce.app%2Fdatabases%2Fx.db`
  opens the Scan screen with the live camera and no recognition of that path;
  `intent/analyze_image?imageUri=...&question=hi` opens the camera screen with
  no preview image; `intent/transcribe?audioUri=...` opens the voice screen
  with nothing transcribed or sent; an `intent/share` link whose `files` name a
  `file:///data/user/0/com.agiworkforce.app/files/` address is refused, not
  staged.
- **Sharing into the app.** Plain text, one image, five images, a PDF, a file
  over 12 MB, and Process text from a text selection: the share preview opens
  with the attachments, with no "app not responding" dialog, and Back returns
  sensibly. A photo from Photos, a PDF from Files and a file from Drive each
  still attach: the share handler now refuses streams from the app's own
  providers, and a refused sender would show here.
- **Notifications** on API 33 or later, fresh install: the permission prompt
  appears only from Settings, Notifications; deny once, return (the app sends
  you to system settings), then grant. The app's notification channels appear
  in system settings, and the per-priority vibration switches work. Without
  Firebase (D3): Turn on notifications causes no crash and the screen shows the
  device as not registered; model-download and reminder notifications still
  appear.
- **Media and files.** Attaching a photo opens the system photo picker with no
  permission prompt. Save an image to Photos on API 31 or 32 and on API 33 or
  later: no media permission prompt. Camera, scan, document picker and Share
  file, each with permission granted and denied: no `READ_MEDIA_*` prompt.
- **Calendar.** Ask a Cloud chat about today's schedule: the calendar prompt
  appears then, and names "AGI Mobile".
- **App Lock** with a PIN only (the device credential screen): background the
  app and return; no prompt loop, and the Recents thumbnail does not show the
  conversation.
- **Edge swipes.** Open the drawer from the left edge with gesture navigation
  at default and at high back sensitivity; swipe right to reply on a message
  near the edge; scroll a wide code block or table sideways near the left edge.
  Back, the drawer, swipe-to-reply and sideways scrolling do not take each
  other's gestures.
- **Web content in the app.** An HTML or React artifact preview, a Mermaid
  diagram, a math block and a generated video render; a link inside a preview
  does not navigate the preview or open the browser on its own.
- **Links out.** An answer link opens in a Custom Tab. Google sign-in through
  Clerk returns to the app. Connect GitHub opens a Custom Tab and returns
  through `https://agiworkforce.com/github/installed`.
- **App Links.** After section 6.3, `adb shell pm get-app-links com.agiworkforce.app`
  shows `agiworkforce.com` verified, and `https://agiworkforce.com/auth/reset-password`
  opens the app. `adb shell am start -a android.intent.action.VIEW -d https://agiworkforce.com/pair/ABC123`
  opens the browser, not the app.
- **Shortcuts and widget.** The long-press shortcuts (New chat, Voice, Camera)
  and the Quick Actions widget open the right screen from a cold and a warm
  start, and the widget keeps updating.
- **Tablet or foldable.** Rotate, unfold and use split screen: the layout fills
  the window and the open chat survives. A phone stays portrait.
- **16 KB pages.** On the 16 KB image, `adb shell getconf PAGE_SIZE` prints
  `16384`. Install the build and run a Local model, a scan, Translate and live
  voice: no page-size compatibility warning. Run `zipalign -c -P 16 -v 4` on
  the universal APK.
- **Play Age Signals** on the Google Play image: decline, then share; with the
  service unavailable the app falls back to the typed age without blocking or
  crashing.
- **The merged manifest** of the release bundle (bundletool or Android Studio's
  APK Analyzer): `targetSdkVersion` 36 and `minSdkVersion` 26; none of
  `android.permission.READ_MEDIA_IMAGES`, `android.permission.READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED`,
  `READ_EXTERNAL_STORAGE`, `ACCESS_MEDIA_LOCATION`, `SYSTEM_ALERT_WINDOW`,
  `com.android.vending.BILLING`, `com.google.android.gms.permission.AD_ID`,
  `android.permission.QUERY_ALL_PACKAGES`, `android.permission.SCHEDULE_EXACT_ALARM`, `android.permission.USE_EXACT_ALARM` or
  `android.permission.USE_FULL_SCREEN_INTENT`, and no screen-capture service. Record the
  `maxSdkVersion` on `WRITE_EXTERNAL_STORAGE`, every `android.permission.FOREGROUND_SERVICE`
  permission and service type, and `enableOnBackInvokedCallback`. Confirm the
  ML Kit libraries are present, since the Device or other IDs and Diagnostics
  rows rest on them. `bundletool dump config` shows a 16 KB page alignment, and
  every library under `lib/arm64-v8a` and `lib/x86_64`, WebRTC and ML Kit
  included, is 16 KB aligned. Google requires new apps and updates to target
  Android 16 (API 36) from 2026-08-31 (Source, read 2026-11-15:
  https://developer.android.com/google/play/requirements/target-sdk), and
  apps targeting Android 15 or later to support 16 KB memory pages; updates
  without that support cannot be released from 2027-02-01 (Source, read
  2026-11-15: https://developer.android.com/guide/practices/page-sizes).

### 11.4 Android on a real phone

Install from Play Internal testing, not a sideloaded file, on a phone with
Android 16 and, if you can, one with Android 15.

- Cold launch with no crash. The launcher label reads "AGI Mobile"; the
  adaptive icon sits inside the safe zone on its dark background; the splash
  looks right in light and dark mode; the notification icon is a white
  silhouette.
- Camera, microphone, calendar and notifications each ask only after an
  action (the camera screen, the microphone button, a calendar question, Turn
  on notifications), and declining one leaves the rest working.
- Live voice in a Cloud chat connects and transcribes.
- Local Mode on a phone with AICore needs no download; on one without, the
  model download (about 2.7 GB) finishes, resumes after an interruption, and
  then a chat works in airplane mode.
- App Lock with a real fingerprint.
- The review account on a fresh phone from another network: no emailed code.
- Delete the account, then cancel; then, without the app, find Delete account
  on the web using only the help page.
- After the upload, in Play Console: no "In-app purchases" label, and note any
  foreground-service or sensitive-permission declaration prompt, Billing
  Library notice, 16 KB warning and the download size per device. Test and
  release, App bundle explorer shows the target SDK.
- Read the pre-launch report (crashes, accessibility, screenshots) before you
  promote past Internal testing (7.9).

## 12. Firebase, for Android push (optional, D3)

1. console.firebase.google.com, Add project, name `agi-mobile`, Analytics off.
2. Add an Android app with package `com.agiworkforce.app`. Download
   `google-services.json`.
3. Give it to the build as a file variable:

   ```bash
   cd apps/mobile
   ```

   ```bash
   eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility sensitive
   ```

   Repeat with `--environment preview` for beta builds. `apps/mobile/app.config.js`
   reads `GOOGLE_SERVICES_JSON`; without it the build has no push registration.

4. Firebase, Project settings, Service accounts, Generate new private key. Then
   `eas credentials --platform android`, profile `production`, **Google Service
   Account**, **Manage your Google Service Account Key for Push Notifications
   (FCM V1)**, **Set up a Google Service Account Key for Push Notifications
   (FCM V1)**, and choose the downloaded key.
5. The device identifier used for push is already declared; Firebase adds no
   Data safety row of its own beyond what section 7.5 lists.

## 13. What reviewers do, and how to answer common rejections

Apple tests the build on devices, signs in with the demo account and reads the
Notes. Google's reviewers use the App access instructions, and the pre-launch
report crawls the app. Answer a rejection in the place the rejection appears
(the App Review message in App Store Connect; the policy email and Play Console
for Google), quote the build, and say what you changed if anything.

| Rejection                                              | Rule                                                                                                            | Prepared answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo account did not work, or a code was asked         | Apple 2.1(a); Play App access                                                                                   | Fix first: sign in from a new device and network (section 10, item 3). Then: "The demo account signs in with email and password only and needs no one-time code. We confirmed it on a new device on <date>."                                                                                                                                                                                                                                                                                                                                                                  |
| Paid features without in-app purchase                  | Apple 3.1.1, 3.1.3(b)                                                                                           | Confirm section 4.5 first. Then the prepared answer in D7: "Nothing is sold on any platform before 1 January 2027: no plan or credit can be bought in the app, on our website or anywhere else. The plans that exist, including the demo account's, were granted without a purchase, so the app gives access to nothing bought outside it. Before we sell plans anywhere, a version that offers them as in-app purchases will be submitted for review." If Apple still refuses, move the review account to Free (D6) or bring the in-app purchase build forward (section 15). |
| The app leads people to a payment outside Play billing | Play Payments policy, Sections 2 and 4 (https://support.google.com/googleplay/android-developer/answer/9858738) | Confirm section 4.5 and the pages check in 4.2. Then: "The app charges for nothing and contains no link, button or page that leads to a purchase. Nothing is sold on any platform before 1 January 2027; the review account's plan was granted without a purchase."                                                                                                                                                                                                                                                                                                           |
| A link inside the app leads to pricing or a purchase   | Apple 3.1.1, 3.1.3                                                                                              | Deploy the embedded-page change (4.2) and recheck with the `curl` there. Then: "The pages opened from the app no longer show pricing or sales links; please recheck <page>."                                                                                                                                                                                                                                                                                                                                                                                                  |
| Account deletion not found or not working              | Apple 5.1.1(v); Play account deletion policy                                                                    | "Settings > Email (under Account) > Danger Zone > Delete Account, also Settings > Data Controls > Delete account. Deletion is scheduled with a 24-hour cancellation window." Make sure the review account's deletion is scheduled, not refused (section 10, item 5)                                                                                                                                                                                                                                                                                                           |
| Data sent to AI providers without consent              | Apple 5.1.2(i); Play User Data policy (https://support.google.com/googleplay/android-developer/answer/10144311) | "Before the first Cloud message or live voice session, an alert titled 'Share with AI providers?' names each provider; Cloud sending is refused until the person taps Allow (`apps/mobile/services/providerConsent.ts`)."                                                                                                                                                                                                                                                                                                                                                     |
| No way to report or block content                      | Apple 1.2; Play AI-generated content                                                                            | "Report is in the menu under every answer and on generated images, videos, research reports and artifacts; shared items have Report and Hide." On Android these menus are the app's own sheet (4.3)                                                                                                                                                                                                                                                                                                                                                                           |
| Sign in with Apple missing                             | Apple 4.8                                                                                                       | "Sign in with Apple is offered wherever Google or GitHub sign-in is offered (`apps/mobile/src/features/auth/services/loginProviders.ts`)." Check Clerk's native sheet first (11.1)                                                                                                                                                                                                                                                                                                                                                                                            |
| Screenshots or metadata do not match the app           | Apple 2.3.1, 2.3.3, 2.3.7                                                                                       | Replace the frame or wording; do not argue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| App crashed, or did not work on iPad                   | Apple 2.1, 2.4.1                                                                                                | Ask Claude with the crash log from App Store Connect; resubmit a fixed build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Upload refused for a missing SDK manifest or signature | Apple third-party SDK requirements (ITMS-91061, ITMS-91065)                                                     | Send the email to Claude; a dependency update or a build change follows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Data safety does not match the app                     | Play User Data policy, Data safety                                                                              | Compare the live form with section 7.5 row by row and correct it; then "The form now declares <types>." If Google names an SDK, check it against the merged manifest (11.3)                                                                                                                                                                                                                                                                                                                                                                                                   |
| Health apps declaration inaccurate                     | Play Health apps declaration                                                                                    | D11: hide the health-record connectors in a new build, or declare the category                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Crash or broken behaviour in the pre-launch report     | Play broken functionality                                                                                       | Ask Claude with the report's link; fix before promoting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Guideline numbers: https://developer.apple.com/app-store/review/guidelines/,
read 2026-11-15 (the research did not read the last part of the page or find
its revision date).

## 14. After both stores approve

1. Release the iOS version manually in App Store Connect; raise the Play
   rollout.
2. Tell the repository, because the app and the website read it:
   - `apps/mobile/src/features/release-state/mobileReleaseState.json`: each
     store's `status`, `listingId` and `listingUrl`;
   - `apps/web/lib/surface-status.ts`: `SURFACE_STATUS.mobile`;
   - the store URLs for the mobile page (DEF-3226 in
     audit/decisions/founder-actions.md).
3. Watch crashes in App Store Connect and Play vitals for the first week.
4. For every later version: a new tag `v-mobile-X.Y.Z` with both version sources
   raised, phased release on iOS, a staged rollout on Play.

## 15. Deliberately not in version 1

- **In-app purchases.** Needs `nativePurchases` set to `true` in
  `apps/mobile/src/features/billing/storePurchases.json`, both listings'
  purchase declarations set to `true`, the reviewer notes' purchase sections
  rewritten, the products and agreements in `mobile-store-products.md`, a new
  build and a new review. It cannot be switched on from the server. **Dated:**
  this build must be approved and live in both stores before web sales open on
  1 January 2027, or the Guideline 3.1.3(b) risk returns (D7). On Android the
  sale goes through Play's billing system unless an enrolled program applies in
  an eligible region.
- **Remote Control and Send to Desktop.** Needs the relay deployed at
  `signaling.agiworkforce.com` (audit/decisions/founder-actions.md, the two
  Remote Control relay items), `companion` and `dispatch` set to `true` in
  `apps/mobile/lib/v1FeatureFlags.ts`, the `/pair` App Link restored, a new
  build and new reviewer notes.
- **The phone's large-file upload.** Version 0.0.1 has no large-file client
  and keeps the 25 MiB per-file limit (`docs/specs/large-file-uploads/spec.md`).
  The phone client is deferred until after the review binary; it needs the
  server side of that spec deployed first.
- **Over-the-air updates.** Store builds include `expo-updates`: `updates.url`
  and a fingerprint `runtimeVersion` in `apps/mobile/app.config.js`, and a
  channel per profile in `apps/mobile/eas.json`. No script or workflow
  publishes an update. Do not publish one by hand. A publishing path, when one
  is built, must:
  - stay within Apple's rule: downloaded code may not change the app's primary
    purpose or add features inconsistent with what was reviewed (Developer
    Program License Agreement 3.3.1(B) and Guideline 2.5.2, read 2026-11-15:
    https://developer.apple.com/support/terms/apple-developer-program-license-agreement/);
    fixes, yes; new features, no;
  - run against the Expo `production` environment, because a build profile's
    `env` block does not reach an update, so `APP_ENV`, `EXPO_PUBLIC_APP_ENV`
    and `EXPO_PUBLIC_AGI_AUTH_PROVIDERS` must reach it another way;
  - have `APP_ENV` set to `production`, because `apps/mobile/app.config.js`
    checks the Clerk key and the API address only for `production` and
    `preview`;
  - carry a `pk_live_` Clerk key, `https://agiworkforce.com` and a provider list
    with `apple`;
  - target the `production` channel and the runtime version of the build in the
    store.
    A switch built into the binary, such as `nativePurchases`, changes the
    fingerprint, so an update can never carry it. If D8 turns update checks off,
    turning them on again needs a new build and new privacy answers.

## 16. Listing and reviewer-note statements that are wrong today

Checked in the files on 2026-11-15. One remains, in both listing files (D15):

- `apps/mobile/store-listing/LISTING-METADATA-ANDROID.json`, `full_description`:
  "Free plan" twice and "India DPDP notice and open items"; and
  `release_notes_v0_0_1`: "on the Free plan".
- `apps/mobile/store-listing/LISTING-METADATA-IOS.json`, `description`: "Free
  plan" twice and "India DPDP notice and open items"; and `whats_new`: "on the
  Free plan".

The rest of the first draft's list is corrected in the listing files and the
reviewer notes: both notes carry a short paste block; the pricing-link claim
names the web deploy it waits for; Local Mode, live voice, cryptography,
notifications and `WRITE_EXTERNAL_STORAGE` are described as the code behaves;
the iOS keywords, copyright, age-rating answers, App Review address and privacy
labels match Apple's forms; the Play Data safety rows include calendar events,
search history, diagnostics and crash logs, with one sharing answer on every
surface; and the deletion page gives the web pathway. `apps/mobile/__tests__/ios-store-submission-config.test.ts`
pins these statements, and
`apps/mobile/__tests__/privacy-collection-declarations.test.ts` pins the
privacy declarations against the code.

## Sources

All read on 2026-11-15. Pages marked "re-read" were opened again while writing
this runbook; the others were read the same day by the research behind it.

| Page                                                                                                                        | Used for                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| https://developer.apple.com/app-store/review/guidelines/ (re-read for 3.1.1 and 3.1.3)                                      | Guidelines 1.2, 2.1, 2.3, 2.4.1, 2.5.2, 3.1.1, 3.1.3, 4.8, 5.1.1, 5.1.2 |
| https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information (re-read)         | Notes limit, demo account, copyright, release options, keywords         |
| https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications (re-read)            | Required sizes, alpha, counts                                           |
| https://developer.apple.com/app-store/app-privacy-details/ (re-read)                                                        | App Privacy types and definitions                                       |
| https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions (re-read)   | Age rating questions, tiers, Unrated                                    |
| https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating (re-read)                   | Age rating steps and override                                           |
| https://developer.apple.com/news/?id=ks775ehf                                                                               | Age rating update                                                       |
| https://developer.apple.com/news/upcoming-requirements/                                                                     | Xcode and SDK minimum, trader status, privacy manifests                 |
| https://developer.apple.com/support/third-party-SDK-requirements/                                                           | SDK manifests and signatures                                            |
| https://developer.apple.com/support/offering-account-deletion-in-your-app/                                                  | Deletion and token revocation                                           |
| https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple (re-read)                                  | Sign in with Apple through Clerk                                        |
| https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance                     | Export compliance                                                       |
| https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption | French declaration                                                      |
| https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview                                  | TestFlight                                                              |
| https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases                       | Phased release                                                          |
| https://developer.apple.com/support/terms/apple-developer-program-license-agreement/                                        | Downloaded code (3.3.1(B))                                              |
| https://support.google.com/googleplay/android-developer/answer/14151465 (re-read)                                           | Closed test for personal accounts                                       |
| https://support.google.com/googleplay/android-developer/answer/9866151 (re-read)                                            | Listing graphics                                                        |
| https://support.google.com/googleplay/android-developer/answer/9842756 (re-read)                                            | Play App Signing, hybrid keys, menu path                                |
| https://support.google.com/googleplay/android-developer/answer/10787469                                                     | Data safety                                                             |
| https://support.google.com/googleplay/android-developer/answer/13327111                                                     | Account deletion                                                        |
| https://support.google.com/googleplay/android-developer/answer/10144311                                                     | User Data policy                                                        |
| https://support.google.com/googleplay/android-developer/answer/9858738 (re-read)                                            | Payments policy                                                         |
| https://support.google.com/googleplay/android-developer/answer/13985936                                                     | AI-generated content                                                    |
| https://support.google.com/googleplay/android-developer/answer/15748846                                                     | App access                                                              |
| https://support.google.com/googleplay/android-developer/answer/9842757                                                      | Pre-launch report                                                       |
| https://support.google.com/googleplay/android-developer/answer/9845334 (re-read)                                            | Internal testing, testers, drafts                                       |
| https://support.google.com/googleplay/android-developer/answer/9859348 (re-read)                                            | Creating and rolling out a release                                      |
| https://support.google.com/googleplay/android-developer/answer/9898843                                                      | Content rating                                                          |
| https://support.google.com/googleplay/android-developer/answer/9867159                                                      | Target audience                                                         |
| https://support.google.com/googleplay/android-developer/answer/13849271                                                     | Financial features                                                      |
| https://support.google.com/googleplay/android-developer/answer/14738291                                                     | Health apps                                                             |
| https://support.google.com/googleplay/android-developer/answer/14115180                                                     | Photo and video permissions                                             |
| https://support.google.com/googleplay/android-developer/answer/13393723                                                     | Listing text                                                            |
| https://developer.android.com/google/play/requirements/target-sdk                                                           | Target API 36                                                           |
| https://developer.android.com/guide/practices/page-sizes                                                                    | 16 KB pages                                                             |
| https://developer.android.com/about/versions/16/behavior-changes-16                                                         | Edge to edge, predictive back, large screens                            |
| https://developers.google.com/ml-kit/android-data-disclosure (re-read)                                                      | ML Kit data                                                             |
| https://docs.stripe.com/billing/subscriptions/coupons (re-read)                                                             | Coupon duration and promotion codes                                     |
| https://docs.expo.dev/build-reference/app-extensions/                                                                       | iOS extensions on EAS                                                   |
| https://docs.expo.dev/build-reference/ios-capabilities/                                                                     | Capabilities EAS enables                                                |
| https://docs.expo.dev/build-reference/app-versions/                                                                         | Remote version numbers                                                  |
| https://docs.expo.dev/build-reference/infrastructure/                                                                       | Build images                                                            |
| https://docs.expo.dev/eas-update/store-privacy-declarations/                                                                | Update service privacy answers                                          |
| https://docs.expo.dev/submit/android/                                                                                       | EAS Submit for Android                                                  |

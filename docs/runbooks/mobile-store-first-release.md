# First store release of AGI Mobile: the steps only a person can take

Status: Current
Owner: Founder
Last updated: 2026-11-13

Version 1 of AGI Mobile ships to the App Store and Google Play as a free app
with no in-app purchases. The code side of that is done and checked in; this
runbook is everything left that needs an account, a console, a credential, a
device or a decision. Work through it top to bottom: later steps need values
that earlier steps produce.

Signing and link files are covered in `mobile-eas-signing.md`. Selling plans
later is covered in `mobile-store-products.md`; nothing in that runbook is
needed for version 1.

## One date and one fact before a submission

**No store build can start before 2026-11-12** (step 7, item 1). It is not a
console step.

1. **No store build can start before 2026-11-12** (step 7, item 1).
2. **Production accepts phone sessions.** Until 2026-11-10 production refused
   every phone session: sign-in succeeded, then the app's first call to
   `agiworkforce.com` was refused and the app showed "Session Expired". The
   server checked the phone's token against the list of allowed web origins,
   and a token minted by a native app names no origin. The fix is on `main`
   as commit `568584454a`, and production serves `main` (commit `e822c4fda6`,
   released 2026-11-13), so phone sign-in works there. App Review and Play
   review both sign in. `https://agiworkforce.com/api/version` names the
   commit production runs.

- **Phone sign-in to Cloud.** Production refused every phone session: sign-in
  succeeded, then the app's first call to `agiworkforce.com` was refused and
  the app showed "Session Expired". The server checked the phone's token
  against the list of allowed web origins, and a token minted by a native app
  names no origin. The fix is on `main` (`568584454a`), which production
  serves; an email-and-code sign-in in the iPhone simulator reached the Cloud
  chat screen against the earlier hotfix carrying the same change.
  `https://agiworkforce.com/api/version` names the commit production runs.
- **"Session Expired" after restarting the app in Cloud mode.** This one was
  in the app: its first requests left before sign-in had loaded, were
  refused, and the app signed itself out. The fix is in the app's code, so it
  reaches phones only in a build made from `main` as it is now.
- **Google and GitHub sign-in.** The buttons failed in every build because
  the app never declared `expo-auth-session`. It is now declared, and
  `apps/mobile/__tests__/sso-native-dependencies.test.ts` holds it.

## What version 1 is

- `apps/mobile/src/features/billing/storePurchases.json` holds `"nativePurchases": false`. With
  it false the app shows no purchase, upgrade, top-up, restore or compare-plans
  control and no price, opens no store connection, and the Android manifest
  drops the Play Billing permission. `scripts/release/check-store-listing-claims.mjs`
  fails the release if either listing declares purchases while this is false.
- Both listings (`apps/mobile/store-listing/LISTING-METADATA-*.json`) declare
  no in-app purchases, and the reviewer notes describe the same build.
- The version is `0.0.1` everywhere, so the release tag is `v-mobile-0.0.1`.

## What is already in place (checked 2026-11-10)

| Thing                      | State                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub environment         | `mobile-store-release` exists                                                                                                                     |
| Its secrets                | `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_PRIVATE_KEY_BASE64`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`                                |
| Its variables              | `ASC_APP_ID`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                                                                 |
| Repository variables       | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AGI_AUTH_PROVIDERS`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                      |
| Expo account               | `agiautomationllc`, project `38f0941c-88a7-468a-9750-fcd8b357ff4c`; the production environment has the three `EXPO_PUBLIC_*` values               |
| App Store Connect          | app record "AGI Mobile", Apple ID `6787526447`, bundle `com.agiworkforce.app`, team `D2PR62RLT4` (last confirmed 2026-10-21)                      |
| Sign in with Apple         | enabled in production Clerk (2026-10-19); the release check refuses an iOS build whose provider list lacks `apple`                                |
| Increased Memory Limit     | requested by the app's entitlement for on-device models (2026-11-11); `eas build` enables the capability on the App ID itself, nothing to click   |
| Google Play upload account | `play-publisher@agi-mobile-release.iam.gserviceaccount.com` exists; it has no access until step 3.2                                               |
| Public pages               | `/privacy`, `/terms`, `/support`, `/privacy/requests`, `/subprocessors`, `/trust` and the Apple link file all answer 200 on `agiworkforce.com`    |
| Store builds               | none has ever succeeded: three Android production builds on 2026-10-17 and 18 failed or were cancelled, and no iOS store build has been attempted |

## 1. Decisions that are yours

Each has a default already applied, so none blocks the steps below. Say the
word and the code is changed.

1. **Version number.** The app, both listings and the release tag say `0.0.1`,
   and the stores will show "Version 0.0.1" publicly. Default kept: `0.0.1`,
   because every AGI app carries it. `1.0.0` is the usual first public number
   and is a five-file change.
2. **iPad.** The build supports iPad (`supportsTablet: true`), so App Review
   tests it on iPad and iPad screenshots are required (step 5.3). Default
   kept: iPad supported. Turning it off is a one-line change that can be
   reversed in any later version; turning it on can never be undone once
   shipped.
3. **Android push notifications.** They need a Firebase project (step 4).
   Default: ship without it if you skip step 4. The Notifications screen then
   says the device could not be registered and everything else works.
4. **Crash reporting.** None ships, and both listings say so. Default kept:
   off. Turning it on later means a vendor project, a new build and updated
   privacy answers in both stores.
5. **Remote Control and Send to Desktop.** They use
   `signaling.agiworkforce.com`, which does not resolve today. Default kept:
   the screens stay, and pairing fails with an error until that host is
   deployed. If you want them hidden for version 1 instead, say so.
6. **The name.** A build made now shows "Mobile" under its icon, while both
   listings and the App Store Connect record say "AGI Mobile". On 2026-11-08
   the name registry (`packages/contracts/types/src/product-names.ts`)
   changed the brand to `AGIWORKFORCE` and the product names to plain "Chat",
   "Mobile", "Work". On 2026-11-10 the app's own name in
   `apps/mobile/app.config.js` was changed to "Mobile" to match, because
   `pnpm check:product-names` fails when the two differ. Default kept for the
   stores: "AGI Mobile", because the store record already carries it and the
   permission prompts and most screens say "AGI Mobile" or "AGI". Apple asks
   that an app's names be "similar to avoid creating confusion" (App Store
   Review Guideline 2.3.8, read 2026-11-10), and "Mobile" alone under an icon
   names no product, so settle this before the first build is submitted. Two
   sentences in the app follow the registry and read "AGIWORKFORCE uses your
   nickname in chat." (Personalization) and "Choose when AGIWORKFORCE asks
   before a plugin acts." (Plugins), next to screens that say "AGI". Say
   which name the phone app should use, and the registry, the app and the
   listings are made to match.

## 2. Accounts and agreements

1. **Apple Developer Program**: confirm the membership for team `D2PR62RLT4`
   is active (developer.apple.com, Account, Membership details).
2. **App Store Connect, Business**: the Free Apps agreement must show Active.
   The Paid Apps agreement, tax and banking are not needed for version 1.
3. **App Store Connect, Business, Digital Services Act**: declare trader
   status. Without it Apple does not distribute the app in the EU.
4. **Google Play Console**: open Settings, Developer account, Account details
   and note the account type.
   - Organization: nothing more.
   - Personal, created after 13 November 2023: Play requires a closed test with
     at least 12 testers opted in for 14 consecutive days before it lets you
     apply for production. Start that test the day the first build is uploaded
     (step 7), because nothing shortens the 14 days.
5. **A mailbox for `review@agiworkforce.com`**: the iOS listing gives it to
   App Review as the contact address. Create it or forward it to an inbox you
   read; reviewers write there when sign-in fails.

## 3. Google Play Console

### 3.1 Create the app

Play Console, Create app:

- App name `AGI Mobile`, default language English (United States), App, Free.
- Accept the declarations.

### 3.2 Give the upload account access

Users and permissions, Invite new users:

- Email `play-publisher@agi-mobile-release.iam.gserviceaccount.com`
- App permissions, add AGI Mobile, tick: View app information, Release to
  production, Release apps to testing tracks, Manage testing tracks.
- No account-level permissions.

### 3.3 App signing fingerprint (needed before any Android release build)

The Android release job refuses to build until the website serves the Play
signing fingerprint. Today `https://agiworkforce.com/.well-known/assetlinks.json`
answers 503 for that reason.

1. Play Console, the app, Test and release, Setup, App integrity, App signing.
   Play App Signing is on by default; if the page asks, choose Google-managed.
   The fingerprint appears after the first bundle is uploaded. To get it
   before the tagged release, upload any signed bundle once to Internal
   testing as a draft (step 7, item 4, does exactly this).
2. Copy **SHA-256 certificate fingerprint** under "App signing key
   certificate" (not the upload key).
3. Set it in two places, same value:

   ```bash
   gh variable set ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS --env mobile-store-release --body "<fingerprint>"
   ```

   and on the web deployment as the server variable
   `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS` (Vercel, the web project,
   Settings, Environment Variables, Production).

4. Redeploy the website, then check:

   ```bash
   curl --fail https://agiworkforce.com/.well-known/assetlinks.json
   ```

   It must return 200 with the package `com.agiworkforce.app` and that
   fingerprint.

### 3.4 Store listing

Grow users, Store presence, Main store listing. Paste from
`apps/mobile/store-listing/LISTING-METADATA-ANDROID.json`:

| Field             | JSON key            |
| ----------------- | ------------------- |
| App name          | `app_name`          |
| Short description | `short_description` |
| Full description  | `full_description`  |

Graphics, all still to be produced:

- App icon, 512 x 512 PNG. Export it from `apps/mobile/assets/icon.png`
  (1024 x 1024) at half size.
- Feature graphic, 1024 x 500, PNG or JPEG, no transparency, under 1 MB.
- Phone screenshots, at least two (step 6).

Store settings: category Productivity; contact email
`support@agiworkforce.com`, website `https://agiworkforce.com`. The phone
number is optional on Play; leave it empty unless you want one public, and if
you add one also replace `__FOUNDER_TO_FILL__` in the JSON.

### 3.5 App content

Policy and programs, App content. Answer every card; the values are in the same
JSON unless stated.

| Card            | Answer                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy  | `https://agiworkforce.com/privacy`                                                                                                                             |
| App access      | "All or some functionality is restricted", then the review account from step 5.5 and the instructions at the top of `REVIEWER-NOTES-ANDROID.md`                |
| Ads             | No ads                                                                                                                                                         |
| Content rating  | Start the questionnaire, category "All other app types"; answers under `content_rating.questionnaire`. In-app purchases: No. Expected result: Teen             |
| Target audience | 13-15, 16-17, 18 and over; not appealing to children                                                                                                           |
| Data safety     | Enter `apps/mobile/store-listing/android/data-safety.json` field by field. Account deletion URL: `https://agiworkforce.com/privacy/requests`                   |
| Government apps | No                                                                                                                                                             |
| Financial       | None of the listed features                                                                                                                                    |
| Health          | None of the listed features                                                                                                                                    |
| News            | Not a news app                                                                                                                                                 |
| Advertising ID  | Does not use an advertising ID                                                                                                                                 |
| Generative AI   | If Play shows an AI-generated content card, declare that the app generates content and that reporting is in the app ("Report this response" under each answer) |

Play decides whether the model providers count as "sharing". The JSON answers
on the basis that they process data only on AGI's behalf; that rests on the
data-processing terms behind `https://agiworkforce.com/subprocessors`, which is
a question for counsel, not for the code.

## 4. Firebase, for Android push (optional for version 1)

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

   `app.config.js` reads `GOOGLE_SERVICES_JSON` and passes it to the build;
   with the variable absent the build simply has no push registration.

4. Firebase, Project settings, Service accounts, Generate new private key.
   Then `eas credentials`, Android, production, Google Service Account, "Manage
   your Google Service Account Key for Push Notifications (FCM V1)", upload it.
5. Adding Firebase changes nothing in the Data safety answers: the device
   identifier used for push is already declared.

## 5. App Store Connect

Open the app, then the `0.0.1` version under iOS App (create it with the plus
button if it is absent). Values are in
`apps/mobile/store-listing/LISTING-METADATA-IOS.json`.

### 5.1 Version page

| Field            | JSON key                                                                |
| ---------------- | ----------------------------------------------------------------------- |
| Promotional text | `promotional_text`                                                      |
| Description      | `description`                                                           |
| Keywords         | `keywords`                                                              |
| Support URL      | `urls.support`                                                          |
| Marketing URL    | `urls.marketing`                                                        |
| What's New       | not shown for a first version                                           |
| Copyright        | `copyright`                                                             |
| Sign-in required | on; the review account from step 5.5                                    |
| Notes            | paste `apps/mobile/store-listing/REVIEWER-NOTES-IOS.md`                 |
| Contact          | `contact_information` and `app_review_information.review_contact_email` |
| Version release  | "Manually release this version", so approval does not publish by itself |

**Leave "In-App Purchases and Subscriptions" on the version page empty.** Eight
products were created in this app record on 2026-10-21. They stay unattached
and unsubmitted. Attaching any of them to this version contradicts the build
and the listing and will be rejected.

### 5.2 App Information, Pricing, Privacy

- App Information: name `AGI Mobile`, subtitle from `subtitle`, primary
  category Productivity, secondary Utilities, content rights "does not contain
  third-party content".
- Age rating: answer from `age_rating.questionnaire`. If the result is below
  13+, use "Override to higher age rating" and choose 13+.
- Pricing and Availability: Free. Territories as `availability.territories`.
- App Privacy: privacy policy URL `https://agiworkforce.com/privacy`, then
  enter the data types under `privacy_nutrition_labels.data_linked_to_you`.
  Nothing is used for tracking.
- Export compliance: the build already declares
  `ITSAppUsesNonExemptEncryption = false`, so no question appears. The basis
  is in `export_compliance.basis`; it is a legal statement, so read it once.

### 5.3 Screenshots

Required because of the build's device support:

- iPhone 6.9 inch (1320 x 2868), up to ten.
- iPad 13 inch (2064 x 2752), up to ten, unless you turn iPad off (decision 2).

See step 6 for producing them.

### 5.4 Server notification URLs

Leave as set on 2026-10-21. They carry consent-withdrawal notices as well as
purchase notices, and do nothing while nothing is sold.

### 5.5 The review account

Both stores sign in with the same account. It must be a real production
account that needs nothing but email and password.

1. Sign up at `https://agiworkforce.com/signup` with an address you control,
   for example `appreview@agiworkforce.com`, and a strong password. Verify the
   email.
2. Do not add a passkey or two-step verification to it.
3. Sign out, open a private window, sign in again. If Clerk asks for a code
   sent by email on a new device, Client Trust is on: turn it off in the
   production Clerk dashboard (Configure, Attack protection) or the reviewer
   cannot get in.
4. Leave the account on the Free plan. Version 1 needs no purchase set up.
5. Enter the credentials in App Store Connect (step 5.1) and Play (step 3.5).
   Never commit them.

## 6. Screenshots

The pipeline is `apps/mobile/store-listing/screenshots/RUNBOOK.md`.

```bash
pnpm --filter @agiworkforce/mobile screenshots:required
```

produces the iPhone 6.9 inch, iPad 13 inch and Android phone sets. Android
needs a one-time emulator first: in Android Studio, Device Manager, create a
Pixel 8 on API 34 named exactly `pixel_8_api_34`. Upload the results by hand in
both consoles. Check each frame before uploading: a frame that shows a price,
a plan to buy or an "Upgrade" control does not match the build and must not be
used.

## 7. Build and upload

Each store build spends Expo build minutes; nothing here starts one for you.

1. **Not before 2026-11-12: bring the Expo packages up to date.** Sixteen Expo
   packages are one patch behind what the SDK expects, and both the release
   workflow and the local release script stop on that before they build
   anything. It cannot be done earlier: the repository refuses any package
   published less than seven days ago, and fifteen of these were published on
   2026-11-05. From 2026-11-12, either ask Claude to "apply the Expo patch
   update", or run:

   ```bash
   pnpm --filter @agiworkforce/mobile exec expo install --fix
   ```

   ```bash
   pnpm install
   ```

   ```bash
   pnpm --filter @agiworkforce/mobile run check:expo-deps
   ```

   The last command must end with "Expo dependencies are compatible". Commit
   `apps/mobile/package.json` and `pnpm-lock.yaml`. The item is
   `MOBILE-EXPO-PATCH-LAG-2026-11-10` in `audit/registers/known-flaws.md`;
   delete that row when it is done.

2. Add the one missing secret. Create a token at expo.dev, Account settings,
   Access tokens, then:

   ```bash
   gh secret set EXPO_TOKEN --env mobile-store-release
   ```

3. In GitHub, Settings, Environments, `mobile-store-release`: add yourself as
   a required reviewer, so a tag cannot publish without your click.
4. Produce the first Android bundle from your own machine. Step 3.3 needs a
   bundle in Play before the fingerprint exists, and the tagged release cannot
   supply it, because its Android job checks the website for that fingerprint
   before it builds. On a clean, committed checkout, signed in to the EAS
   command line as `agiautomationllc`:

   ```bash
   export EXPO_PUBLIC_API_URL=https://agiworkforce.com
   ```

   ```bash
   pnpm --filter @agiworkforce/mobile run release:android:beta
   ```

   When the build finishes, open it on expo.dev and download the `.aab`. In
   Play Console go to Test and release, Testing, Internal testing, Create new
   release, upload the file and save it as a draft. Uploading by hand keeps
   the Play key file off your laptop. Now do step 3.3.

5. Play, Internal testing: add your own Google account as a tester, install
   the build from the opt-in link.

## 8. The tagged release

When steps 2 to 7 are done and the branch carrying this work is merged:

```bash
git tag v-mobile-0.0.1
```

```bash
git push origin v-mobile-0.0.1
```

The workflow validates, waits for your approval on the environment, builds
both platforms, uploads iOS to TestFlight and Android to Internal testing as a
draft. It publishes nothing to the public.

## 9. Check the real builds on real devices

On an iPhone from TestFlight and an Android phone from Internal testing:

- First launch, the disclosure sheet, the age question, Local Mode chat with
  the phone in airplane mode.
- Sign up, sign out, sign in with email and password, then with Apple (iPhone)
  and Google.
- Cloud chat, web search, a photo attachment, dictation, live voice.
- Settings, Subscription: the screen is titled Plan and has no price, no
  upgrade and no restore. Open the model picker, Schedules and Remote
  Control: nothing offers a plan.
- Report a response; hide something shared with you.
- Settings, Data controls, Delete account, then cancel the deletion.
- A notification (Android only if step 4 was done).
- `https://agiworkforce.com/auth/reset-password` opens the app on both.
- iPad, if supported: rotate, split view, the same sign-in.
- VoiceOver and TalkBack through sign-in and one chat.
- Android only: press the system Back button on the home chat, inside a
  chat, with the drawer open, with a sheet open and on a settings screen.
  Each press must close the top layer or go back one screen, and must never
  close the app from inside a screen. This is the one open code question
  (`MOBILE-022` and `MOBILE-023` in
  `audit/prior-audits/mobile-public-release-audit.md`) and it needs a real
  Android phone, so tell Claude what you saw.
- While a reply is being written, the AGI mark beside it shimmers. That
  animation crashed the app on launch before this work. The fix was checked
  in the iPhone simulator, where the crash no longer appears; nobody has yet
  watched the shimmer itself on a phone.

## 10. Submit for review

- **App Store Connect**: on the version page choose the TestFlight build,
  then Add for Review, then Submit. Answer "No" to the advertising identifier
  question.
- **Play Console**: Internal testing, Promote release. A personal account goes
  to Closed testing first (step 2.4), then applies for production; an
  organization account can promote to Production with a staged rollout.

If a reviewer asks how people pay: version 1 sells nothing and links to no
purchase. Paid plans are not on general sale; web upgrades are behind a
waitlist. An account that already holds a plan keeps its access when it signs
in, and the app shows that as plain text.

## 11. After both stores approve

Tell the repository, because the app and the website read it:

- `apps/mobile/src/features/release-state/mobileReleaseState.json`: each
  store's `status`, `listingId` and `listingUrl`.
- `apps/web/lib/surface-status.ts`: `SURFACE_STATUS.mobile`.

Then release the iOS version manually in App Store Connect and raise the Play
rollout.

## 12. When you decide to sell plans in the app

Set `nativePurchases` to `true` in `apps/mobile/src/features/billing/storePurchases.json`, set
both listings' purchase declarations to `true`, rewrite the reviewer notes'
purchase sections, and follow `mobile-store-products.md`. That is a new build
and a new review; it cannot be switched on from the server.

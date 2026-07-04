# AGI v1.2.0 — Founder submission checklist

> One-page reference. Every field you must paste into App Store Connect
> and Play Console before clicking Submit. Sources are the canonical
> files in `apps/mobile/store-listing/`.
>
> Fields marked [LOCKED] are final copy — do not paraphrase.
> Fields marked [FOUNDER] require your personal input.
> Fields marked [DESIGN] are blocked on design delivery.

---

## Part A — Apple App Store Connect

Log in at https://appstoreconnect.apple.com → My Apps → + → New App.

### A.1 App Information

| Field            | Value                  | Source                                   | Status                           |
| ---------------- | ---------------------- | ---------------------------------------- | -------------------------------- |
| Platform         | iOS                    | —                                        | LOCKED                           |
| App name         | `AGI`                  | `LISTING-METADATA-IOS.json` → `app_name` | LOCKED                           |
| Primary language | English (U.S.)         | —                                        | LOCKED                           |
| Bundle ID        | `com.agiworkforce.app` | `app.config.js`                          | LOCKED                           |
| SKU              | `agi-ios-v1`           | —                                        | [FOUNDER] pick any unique string |

### A.2 Version Information

Navigate to App Store Connect → Version (1.2.0).

| Field            | Value                                                                                                                                     | Char count / limit |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| App Store name   | `AGI`                                                                                                                                     | 3 / 30             |
| Subtitle         | `On-device AI assistant`                                                                                                                  | 22 / 30            |
| Promotional text | `Chat with AI on your phone. No Wi-Fi required. Free forever. On-device model runs locally — your conversations never leave your device.` | 135 / 170          |
| Keywords         | `ai,chat,assistant,local,offline,privacy,llm,dpdp,on-device,healthkit`                                                                    | 68 / 100           |
| Description      | Paste from `LISTING-METADATA-IOS.json` → `description` field (1,544 chars)                                                                | 1544 / 4000        |
| What's New       | Paste from `LISTING-METADATA-IOS.json` → `whats_new` field                                                                                | 463 / 4000         |
| Support URL      | `https://agiworkforce.com/support`                                                                                                        | —                  |
| Marketing URL    | `https://agiworkforce.com`                                                                                                                | optional           |

### A.3 App Review Information

| Field                     | Value                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| Sign-in required          | No                                                                  |
| Username                  | (leave blank)                                                       |
| Password                  | (leave blank)                                                       |
| Notes (4,000 chars)       | Paste entire contents of `REVIEWER-NOTES-IOS.md` body (3,971 chars) |
| Review contact first name | Siddhartha                                                          |
| Review contact last name  | Nagula                                                              |
| Review contact phone      | [FOUNDER: your phone number]                                        |
| Review contact email      | siddharthanagula3@gmail.com                                         |

### A.4 General App Information

| Field                | Value                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Category — Primary   | Productivity                                                                                               |
| Category — Secondary | Utilities                                                                                                  |
| Age rating           | 12+ (walk through IARC questionnaire; answers in `LISTING-METADATA-IOS.json` → `age_rating.questionnaire`) |
| Copyright            | `© 2026 AGI Automation LLC`                                                                                |
| Privacy policy URL   | `https://agiworkforce.com/privacy`                                                                         |

### A.5 Pricing and Availability

| Field            | Value                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price            | Free                                                                                                                                               |
| In-app purchases | None — the in-app "Upgrade to `<Tier>`" CTA opens a web checkout in-browser; it is not a StoreKit product (see Part D item 11 re: Guideline 3.1.1) |
| Availability     | All territories EXCEPT: Mainland China, Russia, Iran, North Korea, Syria, Cuba, Crimea                                                             |
| Pre-order        | No                                                                                                                                                 |

### A.6 App Privacy (Nutrition Labels)

Path: App Store Connect → App Privacy → Get Started

Do not select **Data Not Collected** — Cloud sign-in (public alpha, open to
any signed-in user) remains in the submitted build.

Local Mode collects no personal data by default. Signing in to AGI Cloud
collects account email address and optional name (from the sign-in method).
Declare those fields as Contact Info used for app functionality and not
shared with third parties.

### A.7 Screenshots and App Previews

Upload captures produced by `pnpm screenshots:ios`:

| Slot                      | Required | Dimensions  | Files                                  |
| ------------------------- | -------- | ----------- | -------------------------------------- |
| 6.9" iPhone (required)    | 6        | 1320 × 2868 | `captures/ios/6.9/final/01..06-*.png`  |
| 6.7" iPhone (recommended) | 6        | 1290 × 2796 | `captures/ios/6.7/final/01..06-*.png`  |
| 6.5" iPhone (required)    | 6        | 1242 × 2688 | `captures/ios/6.5/final/01..06-*.png`  |
| 5.5" iPhone (optional)    | 6        | 1242 × 2208 | `captures/ios/5.5/final/01..06-*.png`  |
| 12.9" iPad Pro (required) | 6        | 2048 × 2732 | `captures/ios/12.9/final/01..06-*.png` |
| 11" iPad Pro (required)   | 6        | 1668 × 2388 | `captures/ios/11/final/01..06-*.png`   |

App Store Connect requires at least the 6.9" (or 6.7") + 6.5" iPhone
slots plus both iPad slots for iPadOS support.

Screenshot titles and captions are set in App Store Connect per slot
(one title per screenshot, up to 30 chars; one caption up to 45 chars).
The per-spec values are in `IOS-01.md` through `IOS-30.md`.

### A.8 App icon

Upload 1024 × 1024 px PNG (no alpha, no rounded corners — Apple rounds
programmatically) to App Store Connect → App Icons.
Status: [DESIGN] — not yet delivered.

---

## Part B — Google Play Console

Log in at https://play.google.com/console → Create app.

### B.1 App details

| Field            | Value                   | Source                                       |
| ---------------- | ----------------------- | -------------------------------------------- |
| App name         | `AGI`                   | `LISTING-METADATA-ANDROID.json` → `app_name` |
| Default language | English (United States) | —                                            |
| App or game      | App                     | —                                            |
| Free or paid     | Free                    | —                                            |

### B.2 Main store listing

Path: Play Console → Store presence → Main store listing

| Field             | Value                                                                         | Char count / limit |
| ----------------- | ----------------------------------------------------------------------------- | ------------------ |
| App name          | `AGI`                                                                         | 3 / 30             |
| Short description | `AI on your phone. Free. Works in airplane mode.`                             | 47 / 80            |
| Full description  | Paste from `LISTING-METADATA-ANDROID.json` → `full_description` (1,544 chars) | 1544 / 4000        |

Category: **Productivity**

### B.3 Contact details

| Field          | Value                              |
| -------------- | ---------------------------------- |
| Email          | `support@agiworkforce.com`         |
| Website        | `https://agiworkforce.com`         |
| Privacy policy | `https://agiworkforce.com/privacy` |
| Phone          | [FOUNDER: your phone number]       |

### B.4 Graphics

| Asset                  | Required    | Spec                                          | Status                         |
| ---------------------- | ----------- | --------------------------------------------- | ------------------------------ |
| App icon               | Yes         | 512 × 512 PNG                                 | [DESIGN]                       |
| Feature graphic        | Yes         | 1024 × 500 PNG/JPEG, no alpha, ≤ 1 MB         | [DESIGN]                       |
| Phone screenshots      | Yes (2–8)   | PNG/JPEG, 16:9 or 9:16, min 320 px short side | Run `pnpm screenshots:android` |
| 7" tablet screenshots  | Recommended | PNG/JPEG, min 1024 × 600                      | Run `pnpm screenshots:android` |
| 10" tablet screenshots | Recommended | PNG/JPEG, min 1920 × 1200                     | Run `pnpm screenshots:android` |

Screenshot slots (after running `pnpm screenshots:android`):

| Class                    | Files                                           |
| ------------------------ | ----------------------------------------------- |
| Phone (1080 × 2400)      | `captures/android/phone/final/01..06-*.png`     |
| 10" tablet (1920 × 1200) | `captures/android/tablet-10/final/01..06-*.png` |
| 7" tablet (1200 × 1920)  | `captures/android/tablet-7/final/01..06-*.png`  |

### B.5 App access

Path: Play Console → App content → App access

Cloud sign-in gates Cloud chat, image generation, and web search — Local
Mode chat requires no login. Select **Some functionality is restricted**
and describe that Cloud features require creating a free account (Clerk
sign-in); no reviewer test credentials are needed since sign-up is
self-service and free.

Additional instructions for reviewers: paste full contents of
`REVIEWER-NOTES-ANDROID.md` into the instructions field (confirm that file
also reflects the public-alpha Cloud sign-in gate before submitting).

### B.6 Data safety

Path: Play Console → App content → Data safety

| Question                                                              | Answer |
| --------------------------------------------------------------------- | ------ |
| Does your app collect or share any of the required user data types?   | No     |
| Is all of the user data collected encrypted in transit?               | Yes    |
| Do you provide a way for users to request that their data is deleted? | Yes    |

Walk through the full questionnaire; every row is "No" or "Not applicable"
for v1. Answers are in `LISTING-METADATA-ANDROID.json` → `data_safety`.

### B.7 Content rating (IARC)

Path: Play Console → App content → Content ratings → Start questionnaire

Category: **Utility**

All content rating answers are "No" / "None". Expected output: **Everyone**.

Full answers: `LISTING-METADATA-ANDROID.json` → `content_rating.questionnaire`.

### B.8 Target audience

Path: Play Console → App content → Target audience and content

| Field              | Answer      |
| ------------------ | ----------- |
| Age group          | 18 and over |
| Appeal to children | No          |

### B.9 Release

Path: Play Console → Production → Create new release

Upload the signed AAB produced by the mobile CI build.
Release notes: paste `LISTING-METADATA-ANDROID.json` → `release_notes_v1_2_0`.

---

## Part C — Pre-submission checklist (both stores)

Run through this list the day before you submit.

- [ ] `pnpm --filter @agiworkforce/mobile typecheck` passes clean
- [ ] `pnpm screenshots:ios && pnpm screenshots:android` ran; 48 PNGs in `captures/`
- [ ] Visual spot-check: every screenshot shows the on-device shield badge
- [ ] Visual spot-check: no placeholder text ("TODO", "**FILL**") visible in any screenshot
- [ ] `apps/mobile/app.config.js` `version` matches the build you are submitting
- [ ] Direct provider-key entry disabled (`FEATURES.byokKeys = false`), `FEATURES.cloudChat = true` (public alpha, open to any signed-in user), and `FEATURES.billing = false` / `FEATURES.iap = false` confirmed in `lib/v1FeatureFlags.ts`
- [ ] Privacy policy page at `https://agiworkforce.com/privacy` is live and accessible
- [ ] Support page at `https://agiworkforce.com/support` is live (or redirects to a working contact page)
- [ ] `review@agiworkforce.com` inbox is monitored; test it before submitting
- [ ] iOS: App Store Connect → App Privacy declares optional Cloud sign-in email/name collection
- [ ] Android: Play Console → Data Safety declares optional Cloud sign-in email/name collection
- [ ] [DESIGN] 1024 × 1024 iOS app icon uploaded
- [ ] [DESIGN] 512 × 512 Android app icon uploaded
- [ ] [DESIGN] 1024 × 500 Android feature graphic uploaded
- [ ] [FOUNDER] Phone number entered in App Store Connect Contact Information
- [ ] [FOUNDER] Phone number entered in Play Console contact details
- [ ] Review notes pasted (iOS: 3,971 chars into the 4,000-char field; Android: ~2,800 chars)
- [ ] App Store Connect: age rating questionnaire answered (expect 12+)
- [ ] Play Console: IARC content rating questionnaire answered (expect Everyone)

---

## Part D — Open questions for the founder

These items are not blocked on engineering; they need founder decisions
or founder-held credentials.

1. **Phone number**: App Store Connect and Play Console both require a
   phone number in the contact information block. Add yours before
   submitting. This number is not shown to users.

2. **Support URL liveness**: `https://agiworkforce.com/support` must
   return HTTP 200 at review time. Confirm the page is up or set a
   redirect to a working contact form / email.

3. **Privacy policy URL liveness**: `https://agiworkforce.com/privacy`
   must be live and GDPR / DPDP compliant. Confirm with legal counsel
   before submission.

4. **Terms of service**: App Store Connect has a Terms of Service URL
   field (optional at submission, but Apple may ask for it on AI apps).
   Confirm `https://agiworkforce.com/terms` is live.

5. **review@agiworkforce.com inbox**: This email is given to both
   Apple and Google as the review contact. Confirm it is monitored
   and can respond within 24 hours during the review window.

6. **Territory exclusions**: The default list in `LISTING-METADATA-IOS.json`
   excludes Mainland China, Russia, Iran, North Korea, Syria, Cuba,
   Crimea. Confirm with legal counsel that this list is complete and
   correct for your export control obligations.

7. **Apple developer account PLA**: Accept the latest Apple Developer
   Program License Agreement at https://developer.apple.com/account
   before attempting any TestFlight or App Store upload. The Xcode
   Organizer will block upload if the PLA is not accepted.

8. **Android signing key**: The production AAB must be signed with the
   key enrolled in Play App Signing. Confirm the keystore is backed
   up securely offline before the first upload.

9. **Hindi quality**: The listing description says AGI "handles Hindi
   queries." Confirm the on-device model (Qwen3-4B) produces acceptable
   Hindi output for the query types you plan to demonstrate. If quality
   is insufficient, remove the Hindi mention from the listing before
   submitting (edit `LISTING-METADATA-IOS.json` and
   `LISTING-METADATA-ANDROID.json` → `full_description`).

10. **Cloud sign-in flow**: Cloud is public alpha — any signed-in user
    reaches Cloud chat, image generation, and web search (no invite or
    waitlist gate; the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is an
    incident-response kill switch only). Confirm Clerk sign-in works
    end-to-end on both platforms before launch.

11. **Upgrade CTA / Guideline 3.1.1 (LIVE LEGAL/POLICY QUESTION — do not
    resolve without founder + legal sign-off)**: The in-app "Upgrade to
    `<Tier>`" button (`PaywallBottomSheet.tsx`) opens a web checkout
    (`agiworkforce.com/pricing?from=mobile-paywall`) in the system browser
    rather than a StoreKit/Play Billing purchase. Apple Guideline 3.1.1
    and Google Play's external offers policy both have region-specific
    rules on whether/how apps may link out to external purchase flows for
    digital subscriptions purchasable in-app. Confirm with legal counsel
    whether this flow is compliant as-is, needs an entitlements-reader
    integration, external-link disclosure copy, or must be gated behind
    Apple's External Purchase Link Entitlement (or removed) for iOS
    before submission. See `KILL-SWITCH.md` for the flag that can hide
    the CTA entirely if the answer is "not yet."

---

## Part E — Review defense pack

If either store sends a rejection or an inquiry, the response playbook
is in:

- `REVIEW-DEFENSE-PACK.md` — 11-section defense with policy citations
- `REVIEWER-NOTES-IOS.md` — paste-in for Apple Resolution Center replies
- `REVIEWER-NOTES-ANDROID.md` — paste-in for Play Console policy replies
- `store-listing/screenshots/safeguards/` — compliance evidence screenshots
  (S-01 through S-08; see `SAFEGUARDS-SCREENSHOTS.md` for capture specs)

Most likely rejection reasons and their sections:

| Rejection reason            | Defense section                                   |
| --------------------------- | ------------------------------------------------- |
| 5.1.2(i) explicit consent   | REVIEW-DEFENSE-PACK §1 + S-07 screenshot          |
| 2.5.2 remote code execution | REVIEW-DEFENSE-PACK §2                            |
| 5.1.3 health claims         | REVIEW-DEFENSE-PACK §7 + S-08 screenshot          |
| Play GenAI report/flag      | REVIEW-DEFENSE-PACK §4 + S-04a, S-04b screenshots |
| Age gate evidence           | REVIEW-DEFENSE-PACK §6 + S-02a, S-02b, S-03       |

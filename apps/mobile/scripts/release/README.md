# AGI Mobile — Release Pipeline Runbook

This runbook is the founder action checklist for shipping `apps/mobile/` to
TestFlight and Google Play. After the one-time setup below, releasing is one
command.

> **TL;DR — daily release flow**
>
> ```bash
> # iOS TestFlight beta (most common):
> pnpm --filter @agiworkforce/mobile release:ios:beta -- --auto-submit
>
> # iOS App Store production:
> pnpm --filter @agiworkforce/mobile release:ios:prod -- --auto-submit
>
> # Android Play Internal Testing:
> pnpm --filter @agiworkforce/mobile release:android:beta -- --auto-submit
> ```

---

## What this pipeline does

- **`eas.json`** — three build profiles (`development` / `preview` / `production`) and matching
  submit profiles for iOS App Store Connect + Google Play Console.
- **`scripts/release/*.sh`** — thin wrappers that preflight-check the environment and then call
  `eas build` / `eas submit` with the right flags. Each script is `--help`-enabled.
- **`apps/mobile/secrets/`** — gitignored directory for local copies of release credentials
  (App Store Connect API key `.p8`, Play service account JSON).

Tested with `eas-cli >= 13.0`, Node 22, pnpm 9.15.3 (matches repo `engines`).

---

## Build profiles

| Profile       | What it produces                        | Distribution                                   | Use for                   |
| ------------- | --------------------------------------- | ---------------------------------------------- | ------------------------- |
| `development` | Debug build with dev client             | Internal / simulator                           | Local QA, fast iteration  |
| `preview`     | Release build, signed                   | Internal (ad-hoc) → TestFlight / Play Internal | Founder + invited testers |
| `production`  | Release build, signed, auto-incremented | App Store / Play Production (draft)            | Public release            |

All profiles `extends: "base"` which pins Node 22.12.0 + pnpm 9.15.3 on the EAS build worker
and uses macOS `m-medium` for iOS / Linux `medium` for Android.

The `appVersionSource: "remote"` setting in `cli` means EAS tracks build numbers — you don't
manually bump `buildNumber` / `versionCode` in `app.config.js`. `autoIncrement: true` on
`production` and `autoIncrement: "buildNumber"` on `preview` make every build a fresh number.

`requireCommit: true` blocks releases from dirty trees — production-grade safety. Override for
local dry-runs with `EAS_SKIP_CLEAN_CHECK=1` (preflight only — EAS itself still enforces).

---

## Founder action checklist (one-time setup)

Each section below is something the **founder** (`siddharthanagula3@gmail.com`) must do
manually — they involve account ownership, payment, or signing the Apple PLA. The release
scripts will fail fast with a clear error if any are missing.

### 1. Apple Developer Program enrollment

**Status (per repo memory):** Active. Team ID `D2PR62RLT4`. PLA renewed 2026-05-16.

**Verify:**

1. Sign in at https://developer.apple.com/account
2. Confirm Team ID reads `D2PR62RLT4` — already wired into `eas.json` `submit.production.ios.appleTeamId`.
3. If the portal shows a banner about an updated Program License Agreement, accept it.
   Notarization will 403 until you do — same root cause as the macOS desktop notarization
   blocker the repo previously hit.

**Cost:** $99/yr — must be renewed annually. Apple will email 30 days before expiry.

### 2. App Store Connect — create the app record

EAS can build and upload, but the App Store Connect app record (the thing TestFlight uploads
attach to) is created **once, by hand**:

1. Sign in at https://appstoreconnect.apple.com → **My Apps** → **+**.
2. **Platforms:** iOS.
3. **Bundle ID:** `com.agiworkforce.app` (already declared in `app.config.js:ios.bundleIdentifier`).
   If it isn't in the dropdown, register it first at
   https://developer.apple.com/account/resources/identifiers/list.
4. **SKU:** `agi-workforce-ios` (anything unique to your account; not user-visible).
5. **User Access:** Full Access (your own account).
6. Record the **Apple ID (numeric SKU)** that appears in the URL after creation — this is the
   `ascAppId` you'll export below. Looks like `1234567890`.

> **Heads-up:** App Store Connect will reject the first upload until you've also entered the
> minimum metadata (app icon, description, category, age rating, screenshots). See
> `tasks/launch-checklist-2026-07-18.md` and the `app-store-prep` task for the spec.

### 3. App Store Connect API key (for `eas submit` automation)

Apple's modern way to authorize automated uploads. Replaces app-specific passwords.

1. Sign in at https://appstoreconnect.apple.com → **Users and Access** → **Integrations** tab →
   **App Store Connect API** subtab.
2. Click **Generate API Key**. Recommended access role: **App Manager** (sufficient for
   TestFlight uploads; not Account Holder).
3. Download the `.p8` file (one-shot — Apple does **not** let you re-download it).
   Save it as **`apps/mobile/secrets/asc-api-key.p8`** (gitignored).
4. Record three values:
   - **Key ID** (e.g., `ABCD1234EF`)
   - **Issuer ID** (visible at the top of the Keys page; UUID format)
   - **App Apple ID** (from step 2.6 above — the numeric ASC app ID)

5. Export as env vars (add to `~/.zshrc` or whatever shell rc you use):

   ```bash
   export APPLE_ID="siddharthanagula3@gmail.com"
   export ASC_APP_ID="<your numeric ASC app id>"
   export ASC_API_KEY_ID="<10-char key id>"
   export ASC_API_KEY_ISSUER_ID="<issuer uuid>"
   ```

6. For CI, store as EAS secrets (server-side, never on disk):

   ```bash
   cd apps/mobile
   eas secret:create --scope project --name ASC_API_KEY_P8 --type file --value ./secrets/asc-api-key.p8
   eas secret:create --scope project --name ASC_API_KEY_ID --value "$ASC_API_KEY_ID"
   eas secret:create --scope project --name ASC_API_KEY_ISSUER_ID --value "$ASC_API_KEY_ISSUER_ID"
   ```

### 4. Apple iOS signing — let EAS manage it (recommended)

`eas.json` sets `credentialsSource: "remote"` for `preview` + `production` iOS builds. The
first build will prompt EAS to provision the Distribution Certificate + App Store provisioning
profile **automatically** by logging into your Apple account via the ASC API key.

If you ever need to manage them by hand:

```bash
cd apps/mobile
eas credentials   # iOS → production → list / regenerate
```

If you already have a `.p12` + `.mobileprovision` from another tool, choose
**"Use an existing distribution certificate"** in `eas credentials`.

**Rotation:** Distribution certificates expire 12 months after issue. EAS emails 30 days out.
Re-run `eas credentials` to regenerate.

### 5. App-specific password (legacy fallback — only if ASC API key is unavailable)

If for any reason the ASC API key path doesn't work (e.g., Apple's API is down), `eas submit`
falls back to app-specific password auth:

1. https://appleid.apple.com → **Sign-In and Security** → **App-Specific Passwords**.
2. Label it `eas-submit-agi`. Save the 16-char password.
3. Export `EXPO_APPLE_APP_SPECIFIC_PASSWORD=<password>` before running `release:ios:*`.

You shouldn't need this if section 3 is done — it's belt-and-suspenders.

### 6. EAS Build account

1. Create one (free tier supports one build queue): https://expo.dev/signup.
2. Install + log in:

   ```bash
   npm install -g eas-cli@latest
   eas login
   eas whoami           # confirm
   ```

3. From `apps/mobile/`, link the project (one time):

   ```bash
   cd apps/mobile
   eas init
   ```

   This writes a real `projectId` (UUID) into `app.config.js:expo.extra.eas.projectId`
   replacing the current placeholder `"agi-workforce"`. Commit that change.

4. Paid tier ($19/mo "Production" or $99/mo "Enterprise") unlocks parallel builds and priority
   queues. Free tier is fine for early TestFlight — builds queue but complete.

### 7. Google Play — service account for `eas submit` automation

1. Create the app once by hand at https://play.google.com/console → **All apps** → **Create app**.
   Use package name `com.agiworkforce.app`.
2. **First upload must be manual** — Google Play won't let `eas submit` create the app record.
   Build once with `release:android:beta` (no `--auto-submit`), download the AAB from the EAS
   dashboard, and upload it to Play Console → Internal testing → Create new release.
3. Once the app exists in Play Console, set up the service account for future automated uploads:
   - Play Console → **Setup** → **API access** → **Create new service account**.
   - Follow the link to Google Cloud Console; create a service account with **Service Account User** role.
   - **Keys** tab → **Add Key** → **Create new key** → **JSON**. Download.
   - Save as **`apps/mobile/secrets/google-play-service-account.json`** (gitignored).
   - Back in Play Console → API access → **Grant access** for the new service account →
     permissions: **Release manager** (enough to upload + manage release tracks).

### 8. Android signing keystore

EAS manages this remotely by default. First Android build will prompt to generate one — say yes.

Keystore details to record (Play Console treats lost upload keys as account-bound, so back this up):

```bash
cd apps/mobile
eas credentials   # Android → production → "Download credentials"
```

Save the resulting `.jks` + keystore password somewhere offline (1Password, encrypted USB, etc).
If you lose it before Play App Signing is enabled, you can never push an update to the same listing.

> **Play App Signing (strongly recommended):** Opt in during your first AAB upload in Play
> Console. Google holds the **app signing key** server-side; you keep the **upload key** locally.
> Lose the upload key? Google rotates it on your behalf. Without App Signing, lost = dead listing.

---

## Daily release flow

### iOS TestFlight beta (recommended weekly cadence)

```bash
# from repo root — or anywhere; the script resolves paths relative to itself
pnpm --filter @agiworkforce/mobile release:ios:beta -- --auto-submit
```

What happens:

1. `preflight.sh` checks: `eas` installed, logged in, `eas.json` valid, secrets present.
2. `eas build --platform ios --profile preview` runs on EAS Build. ~15-25 min.
3. `eas submit --platform ios --profile preview --latest` uploads the IPA to App Store Connect.
4. Apple processes (5-30 min). Build appears in TestFlight → Builds.
5. Add testers in App Store Connect → TestFlight → External Testing → Add Build.

To build only (no upload):

```bash
pnpm --filter @agiworkforce/mobile release:ios:beta
# later:
pnpm --filter @agiworkforce/mobile release:ios:beta:submit
```

### iOS App Store production

```bash
pnpm --filter @agiworkforce/mobile release:ios:prod -- --auto-submit
```

Adds: clean-git check, prompts to bump `expo.version` in `app.config.js` if you haven't.
Production submissions land in TestFlight first; promote via App Store Connect UI after Apple
review (1-3 days, sometimes <24h).

### Android Play Internal Testing beta

```bash
pnpm --filter @agiworkforce/mobile release:android:beta -- --auto-submit
```

What happens:

1. Preflight.
2. `eas build --platform android --profile preview` — produces an APK (faster install + sideload-friendly).
3. `eas submit --platform android --profile preview --latest` — uploads to Play Console
   Internal Testing track as a draft.
4. Promote the draft to a live release in Play Console.

For Play Store production (AAB):

```bash
pnpm --filter @agiworkforce/mobile release:android:prod -- --auto-submit
```

### Preflight only (no build, fast sanity check)

```bash
pnpm --filter @agiworkforce/mobile release:preflight production
```

Useful before a release window to confirm secrets + auth are wired.

---

## Verifying the pnpm filter works for EAS commands

The release scripts shell out to `eas build` and `eas submit` from inside `apps/mobile/`
(via `cd "${MOBILE_DIR}"` in `_lib.sh`). To verify:

```bash
pnpm --filter @agiworkforce/mobile exec eas whoami
pnpm --filter @agiworkforce/mobile exec eas --version
pnpm --filter @agiworkforce/mobile exec eas build:list --platform ios --limit 3
```

If `pnpm exec eas` errors with "command not found", install `eas-cli` globally:

```bash
npm install -g eas-cli@latest
```

(EAS doesn't ship a workspace-local binary — global install is the documented pattern.)

---

## Build configuration changes — when to edit what

| Change                         | File to edit                         | Notes                                       |
| ------------------------------ | ------------------------------------ | ------------------------------------------- |
| App version (user-visible)     | `app.config.js` → `version`          | Semver. Bump for marketing releases.        |
| Build profile env / resources  | `eas.json` → `build.<profile>`       | Restart any in-flight builds after changes. |
| Native code / new entitlements | `app.config.js` → `ios.entitlements` | Then redo `eas credentials` (re-provision). |
| Submit metadata destination    | `eas.json` → `submit.<profile>`      | iOS uses `ascAppId`; Android uses `track`.  |
| Add an environment variable    | `eas.json` → `build.<profile>.env`   | Or `EXPO_PUBLIC_*` for client-visible vars. |

---

## Troubleshooting

| Symptom                                                      | Likely cause                                                      | Fix                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `not logged in to EAS`                                       | `eas-cli` not authed                                              | `eas login`                                                              |
| `git working tree is dirty`                                  | Uncommitted changes + `requireCommit: true`                       | Commit / stash. For local dry-run: `EAS_SKIP_CLEAN_CHECK=1`              |
| `Invalid project id`                                         | Placeholder `projectId: "agi-workforce"` never replaced           | `cd apps/mobile && eas init`, commit the resulting projectId             |
| iOS submit: `Authentication with App Store failed`           | Missing / wrong ASC API key envs                                  | Re-check section 3 above; `echo $APPLE_ID $ASC_APP_ID $ASC_API_KEY_ID`   |
| Apple build rejected: `ITMS-90683 NSPrivacyAccessedAPITypes` | Privacy manifest missing entries                                  | Already wired in `app.config.js:ios.privacyManifests`. If new API → add. |
| Android submit: `Service account not authorized`             | Service account doesn't have Release manager role in Play Console | Play Console → API access → grant access to service account              |
| Android submit: `Package not found`                          | App record never created in Play Console                          | Section 7 — first upload is manual                                       |
| `EAS Build worker timed out`                                 | Free tier queue saturated                                         | Re-run or upgrade EAS plan                                               |
| Notarization 403 on macOS desktop (different surface)        | Apple PLA expired in portal                                       | https://developer.apple.com/account → accept updated PLA                 |

---

## What's intentionally not automated

- **App Store metadata** (description, screenshots, category, age rating, privacy nutrition labels):
  founder enters once in App Store Connect; updates via App Store Connect UI or
  [Fastlane deliver](https://docs.fastlane.tools/actions/deliver/) if we add it later.
- **Test group management:** TestFlight external testing add/remove via App Store Connect UI.
- **Release promotion:** TestFlight → App Store and Play internal → production are deliberate,
  manual gates in the Console UIs.
- **Crash symbol upload:** Expo handles this automatically when `expo-updates` ships builds.

These are all "founder UI work" — by design. The pipeline only automates the bits that benefit
from being reproducible.

---

## Known parallel-state caveats (current repo)

These don't block release-pipeline work but need attention before the first ship:

- **`apps/mobile/app.json` AND `app.config.js` both exist.** Expo prefers `app.config.js` when
  both are present. The team should delete `app.json` to avoid drift — the comment at the top
  of `app.config.js` already says it "replaces app.json".
- **`projectId` placeholder.** `app.json:expo.extra.eas.projectId` is `"agi-workforce"`, which
  isn't a valid UUID. `eas init` rewrites this on the first run. Until then, `eas build` will
  prompt to create / link a project.
- **Legacy `apps/mobile/EAS_SIGNING_RUNBOOK.md`.** Superseded by this file. Its remaining
  content (UI theming TODOs for unmigrated screens) is unrelated to release infra and stays in
  that file until the theming work lands.

---

## File map

```
apps/mobile/
├── eas.json                              # build + submit profiles (this PR)
├── package.json                          # release:* npm scripts
├── secrets/                              # gitignored — local credentials
│   ├── .gitignore
│   ├── .gitkeep
│   └── README.md
└── scripts/release/
    ├── README.md                         # this file — founder runbook
    ├── _lib.sh                           # shared logging + preflight helpers
    ├── preflight.sh                      # env / auth / file sanity check
    ├── ios-beta.sh                       # release:ios:beta entry point
    ├── ios-prod.sh                       # release:ios:prod entry point
    ├── android-beta.sh                   # release:android:beta entry point
    ├── android-prod.sh                   # release:android:prod entry point
    ├── submit-ios.sh                     # upload existing build to ASC
    └── submit-android.sh                 # upload existing build to Play Console
```

# EAS signing and mobile-link release runbook

This runbook covers the production identifiers and public verification inputs
that must agree across EAS, Apple, Google Play, and the web deployment.

## Canonical application identity

| Surface               | Value                                  |
| --------------------- | -------------------------------------- |
| EAS project ID        | `38f0941c-88a7-468a-9750-fcd8b357ff4c` |
| Apple team ID         | `D2PR62RLT4`                           |
| iOS bundle identifier | `com.agiworkforce.app`                 |
| Android package name  | `com.agiworkforce.app`                 |
| Production web origin | `https://agiworkforce.com`             |

Do not create a second EAS project or change a bundle/package identifier to
work around signing errors. Reconcile the remote credential with these values.

## Before a beta or production build

1. Authenticate the EAS CLI with the release-owner account.
2. Set `ASC_APP_ID` to the numeric Apple ID shown in App Store Connect under
   **App Information**, then materialize it before an iOS release:

   ```bash
   bash apps/mobile/scripts/release/configure-ios-submit.sh "$ASC_APP_ID"
   ```

   This identifier is not a secret. Commit the resulting `eas.json` change for
   a local release. The protected GitHub workflow makes an unpushed CI-only
   configuration commit instead, leaving the tagged application source exact.

3. Put the App Store Connect API key at
   `apps/mobile/secrets/asc-api-key.p8` and export its key and issuer IDs.
4. Put the Google Play service-account JSON at
   `apps/mobile/secrets/google-play-service-account.json`.
5. Configure the environment variables listed in `apps/mobile/.env.example`
   in the matching EAS environment.
6. Run the platform-specific release command from the repository root:

   ```bash
   pnpm --filter @agiworkforce/mobile run release:ios:beta
   pnpm --filter @agiworkforce/mobile run release:android:beta
   ```

The release scripts run `release:preflight`, require a clean commit, and use
remote EAS credentials. Production uses the `production` update channel; beta
uses `beta`. The Expo runtime version is derived from the native fingerprint,
so an update cannot be installed on an incompatible native binary.

## Protected tagged GitHub release

`.github/workflows/release-mobile.yml` validates an exact
`v-mobile-X.Y.Z` tag whose version matches both mobile configuration sources.
A tag push, or a manual run with `publish=true`, then waits for approval on the
`mobile-store-release` GitHub environment before starting either store build.
Manual runs with `publish=false` perform validation only and spend no EAS build
credits.

Configure these values on the protected environment:

| Kind     | Name                                      | Purpose                                                    |
| -------- | ----------------------------------------- | ---------------------------------------------------------- |
| Variable | `ASC_APP_ID`                              | Numeric App Store Connect Apple ID                         |
| Variable | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`       | Live public Clerk key used by the production app           |
| Secret   | `EXPO_TOKEN`                              | Token for non-interactive access to the linked EAS project |
| Secret   | `ASC_API_KEY_ID`                          | App Store Connect API key ID                               |
| Secret   | `ASC_API_KEY_ISSUER_ID`                   | App Store Connect API issuer ID                            |
| Secret   | `ASC_API_PRIVATE_KEY_BASE64`              | Base64-encoded contents of the App Store Connect `.p8` key |
| Secret   | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` | Base64-encoded Play Console service-account JSON           |

Also configure the public production variables from `apps/mobile/.env.example`
in the EAS `production` environment. The GitHub Clerk variable and its EAS
counterpart must be identical.

The workflow pins EAS CLI, materializes credentials only into the ignored
`apps/mobile/secrets/` directory, and deletes them even when a job fails. iOS
uses the production profile and uploads the exact completed build to
TestFlight. Android uses the production profile and uploads the exact completed
build to Play Internal Testing as a draft. Promotion to either public store is
an explicit console action after device validation and store review.

## Publish the domain-association files

Apple association uses the checked-in team and bundle identifiers and requires
no secret. Android requires the SHA-256 fingerprint of the certificate Google
Play uses to sign installed builds. The upload-key fingerprint is not a
substitute for Play App Signing.

1. In Google Play Console, open **Setup > App integrity > App signing**.
2. Copy the SHA-256 fingerprint from **App signing key certificate**.
3. Set the server-only web deployment variable:

   ```text
   ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS=<SHA-256 fingerprint>
   ```

   Multiple active fingerprints may be separated by commas or newlines during
   a signing-key rotation. Do not add a sample fingerprint to production.

4. Redeploy the web app and verify the public responses:

   ```bash
   curl --fail --location \
     https://agiworkforce.com/.well-known/apple-app-site-association
   curl --fail --location \
     https://agiworkforce.com/.well-known/assetlinks.json
   ```

Both URLs must return HTTP 200 directly, without an authentication redirect,
with `Content-Type: application/json`. The Android route intentionally returns
HTTP 503 when the fingerprint is missing or malformed.

## Device verification

- Install an iOS TestFlight build, open
  `https://agiworkforce.com/auth/reset-password`, and confirm it opens the app.
- Install an Android build from a Google Play test track (not a locally signed
  APK), repeat the link checks, and inspect verification if needed with
  `adb shell pm get-app-links com.agiworkforce.app`.
- Verify `/pair` and `/pair/<code>` open the companion pairing flow.
- Verify unrelated and extra-segment paths remain in the browser.
- Verify the redirect-only `www.agiworkforce.com` host remains in the browser;
  only the canonical apex host is declared for verified app links.

## OTA update verification

Before publishing an update, resolve the runtime version for each target
platform and compare it with the native build receiving the update:

```bash
cd apps/mobile
npx expo-updates runtimeversion:resolve --platform ios
npx expo-updates runtimeversion:resolve --platform android
```

Publish only to the channel matching the installed build (`beta` or
`production`). Smoke-test cold start and one forced restart after the update.

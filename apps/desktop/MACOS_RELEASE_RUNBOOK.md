# macOS Release Runbook

Canonical procedure for the universal Developer ID distribution published by
`.github/workflows/release-desktop.yml`.

## Release boundary

- The macOS artifact is one universal application containing Apple Silicon and Intel main binaries plus a universal native-messaging sidecar.
- Tauri builds a Developer ID-signed and Apple-notarized `.app`, staples the notarization ticket, creates a signed/notarized `.dmg`, and creates a separately signed `.app.tar.gz` updater artifact.
- The protected `macos-release` GitHub environment is the only CI scope that receives Apple credentials. Never put Apple or Tauri signing material in an application `.env` file.
- The workflow uploads the exact verified artifacts to the draft GitHub release, publishes only after Linux and macOS succeed, and ingests the same universal updater URL/signature for both `darwin-aarch64` and `darwin-x86_64`.
- An unsigned local universal build verifies packaging and architecture only. It does not prove Developer ID trust or Apple notarization.

References:

- <https://v2.tauri.app/distribute/sign/macos/>
- <https://v2.tauri.app/distribute/macos-application-bundle/>
- <https://v2.tauri.app/plugin/updater/>
- <https://developer.apple.com/developer-id/>
- <https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>

## One-time Apple and GitHub setup

1. The Apple Developer Account Holder creates a `Developer ID Application` certificate for direct distribution and exports its certificate plus private key as a password-protected `.p12`.
2. In App Store Connect → Users and Access → Integrations, create a dedicated API key with the minimum role Apple permits for notarization. Record its Key ID and Issuer ID and download the `.p8` once.
3. Create the protected GitHub environment `macos-release`, require a reviewer, restrict it to the protected `main` branch and `v-desktop-*` tags, and add these secrets:
   - `APPLE_CERTIFICATE`: base64 of the exported `.p12`.
   - `APPLE_CERTIFICATE_PASSWORD`: the `.p12` export password.
   - `APPLE_API_KEY`: App Store Connect Key ID.
   - `APPLE_API_ISSUER`: App Store Connect Issuer ID.
   - `APPLE_API_PRIVATE_KEY`: base64 of the downloaded `.p8`.
   - `TAURI_SIGNING_PRIVATE_KEY`: updater signing private key matching the committed public key.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: updater key password.
4. Confirm the certificate identity is exactly `Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)` and the App Store Connect key belongs to team `D2PR62RLT4`.
5. Preserve the original `.p12` and `.p8` in the approved credential vault. GitHub secrets are deployment copies, not the recovery authority.

Encode the two binary credential files locally without printing their contents:

```bash
openssl base64 -A -in DeveloperIDApplication.p12 -out DeveloperIDApplication.p12.base64
openssl base64 -A -in AuthKey_KEYID.p8 -out AuthKey_KEYID.p8.base64
```

## Release

1. Update `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and the Desktop Cargo package to the same SemVer. Tauri owns the generated `CFBundleShortVersionString` and `CFBundleVersion`; do not add fixed versions to `Info.plist`.
2. Run the normal Desktop tests and an unsigned packaging rehearsal when changing macOS bundle, entitlement, sidecar, or installer configuration:

   ```bash
   CI=true pnpm --filter @agiworkforce/desktop exec tauri build \
     --target universal-apple-darwin --bundles app --no-sign
   ```

3. Commit the release, create `v-desktop-<version>`, and push the tag.
4. Review the prepared release metadata and approve `macos-release`. Do not approve if the identity, team, artifact version, channel, or requested secrets differ from this runbook.

The protected job fails unless it can prove all of the following:

- the app and native-messaging host each contain `arm64` and `x86_64`;
- the app has a strict valid Developer ID signature, hardened runtime, expected authority, and expected team;
- Gatekeeper accepts the app;
- Apple stapler validates both the app and DMG tickets;
- the DMG signature is valid;
- the updater archive is readable and its Tauri/minisign signature matches the committed updater public key.

## Post-release verification

1. Download the public DMG onto a clean Mac rather than reusing the runner artifact.
2. Run `codesign --verify --deep --strict --verbose=2 /Applications/AGI.app`, `spctl --assess --type execute --verbose=4 /Applications/AGI.app`, and `xcrun stapler validate /Applications/AGI.app`.
3. Launch from Finder and verify the first-run permission prompts, Local workspace, updater check, native browser host installation, and explicit automation/accessibility consent.
4. On both Apple Silicon and Intel (or an Intel validation host), confirm the updater endpoint returns the same release version with the correct target key and a valid `.app.tar.gz` signature.
5. Confirm the GitHub release contains one universal `.dmg`, one `.app.tar.gz`, and its `.sig`, alongside the Linux artifacts.

## Recovery and rotation

- If signing or notarization fails, leave the GitHub release as a draft, inspect the Tauri/Apple log, fix forward, and rerun the same workflow only while no artifact was published.
- Once public, release a higher version. Do not replace a published binary in place because its recorded updater signature and notarization evidence would no longer identify the downloaded bytes.
- If the Developer ID certificate is exposed, revoke and replace it in Apple Developer, rotate the GitHub environment copy, and ship a new version. Notarization and the independent Tauri updater signature are separate trust boundaries.
- If the App Store Connect key is exposed, revoke only that key and create a replacement; it does not require changing the Developer ID certificate or updater key.
- If the Tauri updater key is exposed, follow the updater key-rotation procedure before shipping; changing it without a client migration can strand installed versions.

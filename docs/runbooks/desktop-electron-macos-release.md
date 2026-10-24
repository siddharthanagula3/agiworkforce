# AGI Desktop macOS Release Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-10-24

How to build, sign, notarize and verify the public AGI Desktop (Electron)
installers for macOS. The retained Tauri app has its own procedure in
`desktop-macos-release.md`; never mix the two tag or asset namespaces.

## What a release contains

- Two DMG installers and two ZIP update archives, one each for Apple silicon
  (arm64) and Intel (x64), named `AGI-Cloud-<version>-<arch>.<ext>`.
- Each app is signed with `Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)`
  with the hardened runtime, notarized, and stapled. Each DMG is notarized and
  stapled on its own.
- `SHA256SUMS` for every installer and archive, which `/api/download/checksums`
  serves.

## Release from this Mac

Use this when the release is built on the owner's Mac instead of in GitHub
Actions. No Apple credential is stored in GitHub.

One-time setup:

1. The Developer ID certificate and its private key are in the login keychain
   (`security find-identity -v -p codesigning` lists it).
2. Create `~/.agi-release/notary.env`, readable by its owner only (`chmod 600`),
   setting `APPLE_API_KEY` (the path to the App Store Connect `.p8` key),
   `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`. Keep it outside the repository.

Each release, from a clean checkout of the commit being released, on an Apple
silicon Mac:

```bash
scripts/release/build-desktop-mac-local.sh 1.0.0
```

The script refuses a dirty tree, a missing certificate or an unreadable key
file. It builds both architectures, notarizes the apps and the DMGs, then runs
`scripts/release/verify-desktop-mac-release.sh`, the same checks the workflow
runs. It never uploads or publishes; the verified files stay in the desktop
app's build output folder, whose path the script prints last. Publishing them is
a separate, owner-approved step.

## Release from GitHub Actions

`.github/workflows/release-desktop-cloud.yml` runs on a `v-cloud-desktop-<semver>`
tag and needs the `macos-release` environment with `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_ISSUER` and
`APPLE_API_PRIVATE_KEY`. On a private repository, environment secrets need a
paid GitHub plan; without one, release from this Mac instead.

## After a release

1. On a Mac that did not build it, download the published DMG, install, and run
   `codesign --verify --deep --strict --verbose=2`, `spctl --assess --type execute --verbose=4`
   and `xcrun stapler validate` against the installed app.
2. Launch from Finder, sign in, and check that an update check reports the new
   version.
3. Never replace a published file in place. Fix forward with a higher version.

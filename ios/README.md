# iOS Native Project

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Kind: native-app-project
Criticality: high

## Purpose

`ios/` is the Xcode-consumed iOS project generated from the Expo mobile app. It stays at repo root for now because the current prebuild/build tooling expects this location.

## Ownership Decision

Root `ios/` is canonical for tracked native project files. `apps/mobile/native/ios/` owns custom native module source that is copied or linked into the native project by Expo config/plugins. `apps/mobile/store-listing/ios/` owns submission metadata and locked review copies.

Do not create a second tracked `apps/mobile/ios/` tree without a dedicated migration plan.

## What Belongs Here

- Xcode project/workspace metadata needed for iOS builds.
- `ios/agiworkforce/` app target files consumed by Xcode.
- `Podfile`, `Podfile.lock`, and Expo/RN native build config.

## What Does Not Belong Here

- `Pods/`, DerivedData, build output, local `.xcode.env.local`, archives, `.ipa` files, or user-specific Xcode state.
- Shared mobile TypeScript or React Native source.
- Store-listing copy and screenshots.

## Verification

- Mobile typecheck: `pnpm --filter @agiworkforce/mobile typecheck`
- Native/prebuild changes: run the relevant Expo/iOS build locally or document why it was not run.
- Privacy manifest changes: keep `ios/agiworkforce/PrivacyInfo.xcprivacy` and `apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy` synchronized.

# apps/mobile/src/features/widget-setup

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-05
Purpose: "Quick Access" guidance screen — documents the OS integrations that actually ship (iOS Siri App Shortcuts from `native/ios/AGIAppIntents/`, Android share-sheet + selected-text entry points, deep/universal links).

## Rules

- Only describe integrations with a real native target. No home-screen widget, Quick Actions, or Control Center tile ships yet — do not document them here until the native code exists (fake availability is a product-rule violation).
- Keep quick-access presentation here; native widget/extension code belongs in native/platform project folders.
- Do not mix general onboarding copy into this feature.

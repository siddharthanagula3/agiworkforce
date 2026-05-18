# IOS-06 — Free plan [iPhone 16 Pro Max, 6.9"]

- **Title**: `Free. Forever. No catch.` (24/30)
- **Caption**: `On-device inference is always free. Always.` (43/45)
- **Device**: iPhone 16 Pro Max — 1320 x 2868 px

## Screen and state

Route: `/(app)/settings/subscription`
Local tile: selected (teal border), "Free forever", "On-device · No account · Offline"
Cloud tile: unselected, "Join waitlist", "Shared chats · Coming soon"
Banner: "You're on the free plan. Inference is free forever."
CTA: "Join cloud waitlist" (ghost button)
Feature flags: `billing: false`, `cloudChat: false`

## Tagline overlay

Heading: `Free. Forever. No catch.`
Subhead: `On-device AI. No subscription. No cloud needed.`

## Detox snippet

```ts
await element(by.id('drawer-settings-link')).tap();
await element(by.id('settings-subscription-row')).tap();
await device.takeScreenshot('IOS-06-free-plan');
```

Output: `captures/ios/6.9/raw/06-free-plan.png`

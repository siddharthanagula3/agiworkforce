# AND-06 — Free plan [Pixel 8, phone]

## Listing metadata

- **Title** (≤30 chars): `Free. Forever. No catch.` (24)
- **Caption** (≤45 chars): `On-device inference is always free. Always.` (43)

## Frame

- **Device**: Pixel 8 — phone class → 1080 × 2400 px
- **Orientation**: Portrait

## Screen and state

Route: `/(app)/settings/subscription`

Data primed:

- Local tile: selected (teal border), "Free forever", sub-label
  "On-device · No account · Offline"
- Cloud tile: not selected, "Join waitlist", sub-label
  "Shared chats · Coming soon"
- Banner: "You're on the free plan. Inference is free forever."
- CTA (ghost button): "Join cloud waitlist"

Feature flags: `billing: false`, `cloudChat: false`

## Tagline overlay

Heading: `Free. Forever. No catch.`
Subhead: `On-device AI. No subscription. No cloud needed.`
Gradient: teal `#21808d` → transparent, top 35%

## Detox automation snippet

```ts
// e2e/screenshots/and-06-free-plan.spec.ts
import { device, element, by } from 'detox';

describe('AND-06 free plan phone', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1' },
    });
  });

  it('captures free plan screen — phone', async () => {
    await element(by.id('drawer-menu-button')).tap();
    await element(by.id('drawer-settings-link')).tap();
    await element(by.id('settings-subscription-row')).tap();
    await device.takeScreenshot('AND-06-free-plan');
  });
});
```

Device config: AVD `pixel_8_api_35`
Output path: `store-listing/screenshots/captures/android/phone/raw/06-free-plan.png`

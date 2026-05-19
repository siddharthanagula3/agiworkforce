# AND-12 — Free plan [Pixel Tablet, 10"]

## Listing metadata

Same content as AND-06. Tablet device class variant.

- **Title** (≤30 chars): `Free. Forever. No catch.` (24)
- **Caption** (≤45 chars): `On-device inference is always free. Always.` (43)

## Frame

- **Device**: Pixel Tablet — 10" class → 1920 × 1200 px (landscape)
- **Orientation**: Landscape

## Screen and state

Subscription/plan screen in the detail pane. Local tile selected
(teal border) on the left; Cloud tile ("Join waitlist") on the right.
Tiles render side-by-side in landscape. "Free forever" banner at top.

## Detox automation snippet

```ts
// e2e/screenshots/and-12-free-plan-tablet-10.spec.ts
import { device, element, by } from 'detox';

describe('AND-12 free plan Pixel Tablet 10"', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1' },
    });
  });

  it('captures free plan screen — 10" tablet', async () => {
    await element(by.id('drawer-settings-link')).tap();
    await element(by.id('settings-subscription-row')).tap();
    await device.takeScreenshot('AND-12-free-plan-tablet-10');
  });
});
```

Device config: AVD `pixel_tablet_api_35`
Output path: `store-listing/screenshots/captures/android/tablet-10/raw/06-free-plan.png`

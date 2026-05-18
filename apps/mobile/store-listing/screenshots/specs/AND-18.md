# AND-18 — Free plan [7" tablet]

## Listing metadata

Same content as AND-06. 7" tablet variant.

- **Title** (≤30 chars): `Free. Forever. No catch.` (24)
- **Caption** (≤45 chars): `On-device inference is always free. Always.` (43)

## Frame

- **Device**: 7" tablet → 1200 × 1920 px portrait (Nexus 7 2013)
- **Orientation**: Portrait

## Screen and state

Plan/mode selector. Single-column on 7" portrait. Local tile at top
(teal border, "Free forever"), Cloud tile below ("Join waitlist").
"Free forever" banner above tiles.

## Detox automation snippet

```ts
// e2e/screenshots/and-18-free-plan-tablet-7.spec.ts
import { device, element, by } from 'detox';

describe('AND-18 free plan 7" tablet', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1' },
    });
  });

  it('captures free plan screen — 7" tablet', async () => {
    await element(by.id('drawer-menu-button')).tap();
    await element(by.id('drawer-settings-link')).tap();
    await element(by.id('settings-subscription-row')).tap();
    await device.takeScreenshot('AND-18-free-plan-tablet-7');
  });
});
```

Device config: AVD `Nexus_7_2013_API_35`
Output path: `store-listing/screenshots/captures/android/tablet-7/raw/06-free-plan.png`

# AND-15 — Privacy screen [7" tablet]

## Listing metadata

Same content as AND-03. 7" tablet variant.

- **Title** (≤30 chars): `Private by design` (17)
- **Caption** (≤45 chars): `Your chats never leave your phone. Ever.` (40)

## Frame

- **Device**: 7" tablet → 1200 × 1920 px portrait (Nexus 7 2013)
- **Orientation**: Portrait

## Screen and state

Identical to AND-03. Single-column privacy screen (no sidebar on 7"
portrait). All compliance rows visible.

## Detox automation snippet

```ts
// e2e/screenshots/and-15-privacy-tablet-7.spec.ts
import { device, element, by } from 'detox';

describe('AND-15 privacy 7" tablet', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1' },
    });
  });

  it('captures privacy screen — 7" tablet', async () => {
    await element(by.id('drawer-menu-button')).tap();
    await element(by.id('drawer-settings-link')).tap();
    await element(by.id('settings-privacy-row')).tap();
    await device.takeScreenshot('AND-15-privacy-tablet-7');
  });
});
```

Device config: AVD `Nexus_7_2013_API_35`
Output path: `store-listing/screenshots/captures/android/tablet-7/raw/03-privacy-screen.png`

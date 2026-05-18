# AND-09 — Privacy screen [Pixel Tablet, 10"]

## Listing metadata

Same content as AND-03. Tablet device class variant.

- **Title** (≤30 chars): `Private by design` (17)
- **Caption** (≤45 chars): `Your chats never leave your phone. Ever.` (40)

## Frame

- **Device**: Pixel Tablet — 10" class → 1920 × 1200 px (landscape)
- **Orientation**: Landscape

## Screen and state

Privacy screen in the detail pane. Settings list at left (sidebar).
All compliance rows visible. On landscape 10" tablet the detail pane
is wide enough to show full row text without truncation.

## Detox automation snippet

```ts
// e2e/screenshots/and-09-privacy-tablet-10.spec.ts
import { device, element, by } from 'detox';

describe('AND-09 privacy Pixel Tablet 10"', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1' },
    });
  });

  it('captures privacy screen — 10" tablet', async () => {
    await element(by.id('drawer-settings-link')).tap();
    await element(by.id('settings-privacy-row')).tap();
    await device.takeScreenshot('AND-09-privacy-tablet-10');
  });
});
```

Device config: AVD `pixel_tablet_api_35`
Output path: `store-listing/screenshots/captures/android/tablet-10/raw/03-privacy-screen.png`

# AND-03 — Privacy screen [Pixel 8, phone]

## Listing metadata

- **Title** (≤30 chars): `Private by design` (17)
- **Caption** (≤45 chars): `Your chats never leave your phone. Ever.` (40)

## Frame

- **Device**: Pixel 8 — phone class → 1080 × 2400 px
- **Orientation**: Portrait

## Screen and state

Route: `/(app)/settings/privacy`

Data primed:

- Privacy screen showing:
  - "On-device only" row with green shield
  - "No account required" — checkmark
  - "No data sent to AGI servers" — checkmark
  - "Conversations in encrypted SQLite on this device" — checkmark
  - "DPDP Act 2023 compliant" — checkmark
  - "EU AI Act Article 50 compliant" — checkmark
  - "Your data rights" section: Export all data, Delete all data

## Tagline overlay

Heading: `Private by design`
Subhead: `No cloud. No tracking. Data stays on device.`
Gradient: teal `#21808d` → transparent, top 35%

## Detox automation snippet

```ts
// e2e/screenshots/and-03-privacy-screen.spec.ts
import { device, element, by } from 'detox';

describe('AND-03 privacy screen phone', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1' },
    });
  });

  it('captures privacy settings screen — phone', async () => {
    await element(by.id('drawer-menu-button')).tap();
    await element(by.id('drawer-settings-link')).tap();
    await element(by.id('settings-privacy-row')).tap();
    await device.takeScreenshot('AND-03-privacy-screen');
  });
});
```

Device config: AVD `pixel_8_api_35`
Output path: `store-listing/screenshots/captures/android/phone/raw/03-privacy-screen.png`

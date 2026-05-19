# AND-11 — Health Connect chat [Pixel Tablet, 10"]

## Listing metadata

Same content as AND-05. Tablet device class variant.

- **Title** (≤30 chars): `AI meets your health data` (25)
- **Caption** (≤45 chars): `Steps, sleep, heart rate — ask in plain text.` (45)

## Frame

- **Device**: Pixel Tablet — 10" class → 1920 × 1200 px (landscape)
- **Orientation**: Landscape

## Screen and state

Health Connect steps-fixture chat in the detail pane. Wide-column
layout. Attribution chip "Health Connect · read-only" visible.
Confirm step-count table renders without horizontal scroll.

## Detox automation snippet

```ts
// e2e/screenshots/and-11-health-connect-tablet-10.spec.ts
import { device, element, by } from 'detox';

describe('AND-11 Health Connect Pixel Tablet 10"', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: {
        E2E_SKIP_ONBOARDING: '1',
        E2E_FIXTURE: 'health-connect-steps-chat',
        E2E_LOCAL_MODE: '1',
        E2E_MOCK_HEALTH_CONNECT: '1',
      },
    });
  });

  it('captures Health Connect chat — 10" tablet', async () => {
    await element(by.id('chat-message-list')).scrollTo('bottom');
    await device.takeScreenshot('AND-11-health-connect-tablet-10');
  });
});
```

Device config: AVD `pixel_tablet_api_35`
Output path: `store-listing/screenshots/captures/android/tablet-10/raw/05-health-connect-chat.png`

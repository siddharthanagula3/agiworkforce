# AND-17 — Health Connect chat [7" tablet]

## Listing metadata

Same content as AND-05. 7" tablet variant.

- **Title** (≤30 chars): `AI meets your health data` (25)
- **Caption** (≤45 chars): `Steps, sleep, heart rate — ask in plain text.` (45)

## Frame

- **Device**: 7" tablet → 1200 × 1920 px portrait (Nexus 7 2013)
- **Orientation**: Portrait

## Screen and state

Health Connect steps-fixture chat. Single-column layout. Attribution
chip "Health Connect · read-only". Last model turn visible.

## Detox automation snippet

```ts
// e2e/screenshots/and-17-health-connect-tablet-7.spec.ts
import { device, element, by } from 'detox';

describe('AND-17 Health Connect 7" tablet', () => {
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

  it('captures Health Connect chat — 7" tablet', async () => {
    await element(by.id('chat-message-list')).scrollTo('bottom');
    await device.takeScreenshot('AND-17-health-connect-tablet-7');
  });
});
```

Device config: AVD `Nexus_7_2013_API_35`
Output path: `store-listing/screenshots/captures/android/tablet-7/raw/05-health-connect-chat.png`

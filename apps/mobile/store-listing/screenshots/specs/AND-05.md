# AND-05 — Health Connect chat [Pixel 8, phone]

## Listing metadata

- **Title** (≤30 chars): `AI meets your health data` (25)
- **Caption** (≤45 chars): `Steps, sleep, heart rate — ask in plain text.` (45)

## Frame

- **Device**: Pixel 8 — phone class → 1080 × 2400 px
- **Orientation**: Portrait

## Screen and state

Route: `/(app)/chat/[id]` — Health Connect-enriched response visible

Data primed (fixture, no live Health Connect call):

- Turn 1 user: "How many steps did I take this week?"
- Turn 1 model response:

  ```
  Here's your step data for this week:

  Mon 12 May  8,432 steps
  Tue 13 May  6,218 steps
  Wed 14 May  10,014 steps ✓ goal
  Thu 15 May  4,901 steps
  Fri 16 May  7,756 steps

  Weekly total: 37,321 steps
  Daily average: 7,464 steps

  [Data from Health Connect · On-device only]
  ```

- Health source attribution chip: "Health Connect · read-only"
- Shield badge + "On-device" visible in header
- Model badge: "Qwen3 · 4B"

Feature flags: `healthConnect: true` (Android only)

## Tagline overlay

Heading: `AI meets your health data`
Subhead: `Steps, sleep, heart rate. Stays on device.`
Gradient: teal `#21808d` → transparent, top 35%

## Detox automation snippet

```ts
// e2e/screenshots/and-05-health-connect-chat.spec.ts
import { device, element, by } from 'detox';

describe('AND-05 Health Connect chat phone', () => {
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

  it('captures Health Connect chat — phone', async () => {
    await element(by.id('chat-message-list')).scrollTo('bottom');
    await device.takeScreenshot('AND-05-health-connect-chat');
  });
});
```

Device config: AVD `pixel_8_api_35`
Output path: `store-listing/screenshots/captures/android/phone/raw/05-health-connect-chat.png`

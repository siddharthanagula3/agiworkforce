# AND-07 — On-device chat [Pixel Tablet, 10"]

## Listing metadata

Same content as AND-01. Tablet device class variant.

- **Title** (≤30 chars): `AI that works offline` (21)
- **Caption** (≤45 chars): `Chat without internet. No sign-up needed.` (41)

## Frame

- **Device**: Pixel Tablet — 10" class → 1920 × 1200 px (landscape)
- **Orientation**: Landscape
- **Layout**: Two-column (conversation list + chat detail pane)

## Screen and state

Identical to AND-01 but landscape split view. roman-empire-chat
fixture in the detail pane. Last 2 turns (Q2 + A2) fully visible.
Shield badge + "On-device" in the detail pane header.

## Detox automation snippet

```ts
// e2e/screenshots/and-07-offline-chat-tablet-10.spec.ts
import { device, element, by } from 'detox';

describe('AND-07 offline chat Pixel Tablet 10"', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: {
        E2E_SKIP_ONBOARDING: '1',
        E2E_FIXTURE: 'roman-empire-chat',
        E2E_LOCAL_MODE: '1',
      },
    });
  });

  it('captures offline chat — 10" tablet landscape', async () => {
    await element(by.id('chat-detail-pane')).scrollTo('bottom');
    await device.takeScreenshot('AND-07-offline-chat-tablet-10');
  });
});
```

Device config: `android.emu.release` with AVD `pixel_tablet_api_35`
Output path: `store-listing/screenshots/captures/android/tablet-10/raw/01-offline-chat.png`

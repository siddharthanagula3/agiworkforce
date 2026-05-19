# AND-13 — On-device chat [Pixel 7, 7" class]

## Listing metadata

Same content as AND-01. 7" tablet device class variant.

- **Title** (≤30 chars): `AI that works offline` (21)
- **Caption** (≤45 chars): `Chat without internet. No sign-up needed.` (41)

## Frame

- **Device**: Pixel 7 (used as 7" representative) → 1080 × 2400 px landscape
  OR Nexus 7 emulator → 1200 × 1920 px portrait
- **Recommended AVD**: `Nexus_7_2013_API_35` (7.02" screen)
- **Orientation**: Portrait
- **Resolution**: 1200 × 1920 minimum for Play "Tablet quality" badge

## Screen and state

Identical to AND-01. roman-empire-chat fixture. Shield badge + "On-device".
On 7" portrait the layout is single-column (no sidebar). Show last 2 turns.

## Detox automation snippet

```ts
// e2e/screenshots/and-13-offline-chat-tablet-7.spec.ts
import { device, element, by } from 'detox';

describe('AND-13 offline chat 7" tablet', () => {
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

  it('captures offline chat — 7" tablet', async () => {
    await element(by.id('chat-message-list')).scrollTo('bottom');
    await device.takeScreenshot('AND-13-offline-chat-tablet-7');
  });
});
```

Device config: `android.emu.release` with AVD `Nexus_7_2013_API_35`
Output path: `store-listing/screenshots/captures/android/tablet-7/raw/01-offline-chat.png`

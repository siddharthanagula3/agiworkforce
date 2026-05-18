# AND-01 — On-device chat in flight [Pixel 8, phone]

## Listing metadata

- **Title** (≤30 chars): `AI that works offline` (21)
- **Caption** (≤45 chars): `Chat without internet. No sign-up needed.` (41)

## Frame

- **Device**: Pixel 8 — phone class → 1080 × 2400 px (portrait)
- **Orientation**: Portrait
- **Status bar**: no network signal bars (airplane mode)

## Screen and state

Route: `/(app)/chat/[id]`

Data primed: roman-empire-chat fixture (3-turn local chat).

- Turn 1 user + model visible; scroll to bottom to show turns 2-3
- Chat header: shield icon + "On-device" (green indicator)
- Model badge: "Qwen3 · 4B"
- Android status bar: airplane mode icon visible

Feature flags: default v1 (`cloudChat: false`, `byokKeys: false`)

## Tagline overlay

Heading: `AI that works offline`
Subhead: `Runs on your phone. No Wi-Fi. No sign-up.`
Gradient: teal `#21808d` → transparent, top 35%

## Detox automation snippet

```ts
// e2e/screenshots/and-01-offline-chat.spec.ts
import { device, element, by, expect as detoxExpect } from 'detox';

describe('AND-01 offline chat phone', () => {
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

  it('captures offline chat frame — phone', async () => {
    await detoxExpect(element(by.id('chat-message-list'))).toBeVisible();
    await element(by.id('chat-message-list')).scrollTo('bottom');
    await detoxExpect(element(by.id('local-mode-badge'))).toBeVisible();
    await device.takeScreenshot('AND-01-offline-chat');
  });
});
```

Device config: `android.emu.release` with AVD `pixel_8_api_35`
Output path: `store-listing/screenshots/captures/android/phone/raw/01-offline-chat.png`

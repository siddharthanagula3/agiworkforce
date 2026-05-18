# AND-14 — Model picker [7" tablet]

## Listing metadata

Same content as AND-02. 7" tablet variant.

- **Title** (≤30 chars): `10+ AI models, one app` (22)
- **Caption** (≤45 chars): `Switch Claude, GPT, Gemini — mid-thread.` (40)

## Frame

- **Device**: 7" tablet → 1200 × 1920 px portrait (Nexus 7 2013)
- **Orientation**: Portrait

## Screen and state

Bottom sheet model picker on 7" portrait. Same content as AND-02.
Qwen3-4B selected. 3+ provider sections visible in the sheet.

## Detox automation snippet

```ts
// e2e/screenshots/and-14-model-picker-tablet-7.spec.ts
import { device, element, by } from 'detox';

describe('AND-14 model picker 7" tablet', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1', E2E_FIXTURE: 'simple-chat' },
    });
  });

  it('captures model picker — 7" tablet', async () => {
    await element(by.id('chat-model-badge')).tap();
    await device.takeScreenshot('AND-14-model-picker-tablet-7');
  });
});
```

Device config: AVD `Nexus_7_2013_API_35`
Output path: `store-listing/screenshots/captures/android/tablet-7/raw/02-model-picker.png`

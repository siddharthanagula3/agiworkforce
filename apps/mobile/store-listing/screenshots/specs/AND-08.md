# AND-08 — Model picker [Pixel Tablet, 10"]

## Listing metadata

Same content as AND-02. Tablet device class variant.

- **Title** (≤30 chars): `10+ AI models, one app` (22)
- **Caption** (≤45 chars): `Switch Claude, GPT, Gemini — mid-thread.` (40)

## Frame

- **Device**: Pixel Tablet — 10" class → 1920 × 1200 px (landscape)
- **Orientation**: Landscape

## Screen and state

On 10" tablet the ModelPicker renders as a popover (not bottom sheet)
anchored to the model badge in the detail pane header. At least 5
provider sections visible. Qwen3-4B selected.

## Detox automation snippet

```ts
// e2e/screenshots/and-08-model-picker-tablet-10.spec.ts
import { device, element, by } from 'detox';

describe('AND-08 model picker Pixel Tablet 10"', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1', E2E_FIXTURE: 'simple-chat' },
    });
  });

  it('captures model picker popover — 10" tablet', async () => {
    await element(by.id('chat-model-badge')).tap();
    await device.takeScreenshot('AND-08-model-picker-tablet-10');
  });
});
```

Device config: AVD `pixel_tablet_api_35`
Output path: `store-listing/screenshots/captures/android/tablet-10/raw/02-model-picker.png`

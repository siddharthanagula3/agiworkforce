# AND-10 — Voice input [Pixel Tablet, 10"]

## Listing metadata

Same content as AND-04. Tablet device class variant.

- **Title** (≤30 chars): `Speak. AI listens.` (18)
- **Caption** (≤45 chars): `On-device voice. No audio uploaded anywhere.` (44)

## Frame

- **Device**: Pixel Tablet — 10" class → 1920 × 1200 px (landscape)
- **Orientation**: Landscape

## Screen and state

Voice recording active in the chat detail pane (landscape). Wider
waveform (12+ bars). Timer "0:04", partial transcript visible.
Mic button in active state in the bottom composer area.

## Detox automation snippet

```ts
// e2e/screenshots/and-10-voice-tablet-10.spec.ts
import { device, element, by } from 'detox';

describe('AND-10 voice Pixel Tablet 10"', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: {
        E2E_SKIP_ONBOARDING: '1',
        E2E_FIXTURE: 'simple-chat',
        E2E_LOCAL_MODE: '1',
        E2E_MOCK_VOICE_RECORDING: '1',
        E2E_MOCK_TRANSCRIPT: 'Tell me about the history of',
      },
    });
  });

  it('captures voice recording — 10" tablet', async () => {
    await element(by.id('voice-mic-button')).longPress();
    await device.takeScreenshot('AND-10-voice-tablet-10');
    await element(by.id('voice-mic-button')).longPressRelease();
  });
});
```

Device config: AVD `pixel_tablet_api_35`
Output path: `store-listing/screenshots/captures/android/tablet-10/raw/04-voice-recording.png`

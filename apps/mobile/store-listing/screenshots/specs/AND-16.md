# AND-16 — Voice input [7" tablet]

## Listing metadata

Same content as AND-04. 7" tablet variant.

- **Title** (≤30 chars): `Speak. AI listens.` (18)
- **Caption** (≤45 chars): `On-device voice. No audio uploaded anywhere.` (44)

## Frame

- **Device**: 7" tablet → 1200 × 1920 px portrait (Nexus 7 2013)
- **Orientation**: Portrait

## Screen and state

Voice recording active state. Single-column layout on 7" portrait.
Waveform (7 bars), timer "0:04", partial transcript visible.

## Detox automation snippet

```ts
// e2e/screenshots/and-16-voice-tablet-7.spec.ts
import { device, element, by } from 'detox';

describe('AND-16 voice 7" tablet', () => {
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

  it('captures voice recording — 7" tablet', async () => {
    await element(by.id('voice-mic-button')).longPress();
    await device.takeScreenshot('AND-16-voice-tablet-7');
    await element(by.id('voice-mic-button')).longPressRelease();
  });
});
```

Device config: AVD `Nexus_7_2013_API_35`
Output path: `store-listing/screenshots/captures/android/tablet-7/raw/04-voice-recording.png`

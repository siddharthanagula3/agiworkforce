# AND-04 — Voice input [Pixel 8, phone]

## Listing metadata

- **Title** (≤30 chars): `Speak. AI listens.` (18)
- **Caption** (≤45 chars): `On-device voice. No audio uploaded anywhere.` (44)

## Frame

- **Device**: Pixel 8 — phone class → 1080 × 2400 px
- **Orientation**: Portrait

## Screen and state

Route: `/(app)/chat/[id]` — voice recording active

Data primed:

- 2 prior chat turns visible (Qwen3-4B)
- Composer in "recording" state:
  - Mic button pulsing (Android: filled mic icon with red ring)
  - Waveform visualizer above composer (7 bars, animated)
  - Partial transcript: "Tell me about the history of…"
  - Timer: "0:04"
  - "Release to send" hint

Uses Android SpeechRecognizer (on-device). No audio upload.
Mock voice state via launch args.

## Tagline overlay

Heading: `Speak. AI listens.`
Subhead: `On-device transcription. No audio uploaded.`
Gradient: teal `#21808d` → transparent, top 35%

## Detox automation snippet

```ts
// e2e/screenshots/and-04-voice-recording.spec.ts
import { device, element, by } from 'detox';

describe('AND-04 voice recording phone', () => {
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

  it('captures voice recording — phone', async () => {
    await element(by.id('voice-mic-button')).longPress();
    await device.takeScreenshot('AND-04-voice-recording');
    await element(by.id('voice-mic-button')).longPressRelease();
  });
});
```

Device config: AVD `pixel_8_api_35`
Output path: `store-listing/screenshots/captures/android/phone/raw/04-voice-recording.png`

# IOS-04 — Voice input [iPhone 16 Pro Max, 6.9"]

- **Title**: `Speak. AI listens.` (18/30)
- **Caption**: `On-device voice. No audio uploaded anywhere.` (44/45)
- **Device**: iPhone 16 Pro Max — 1320 x 2868 px

## Screen and state

Route: `/(app)/chat/[id]`, voice recording active.
Pulsing mic button (red ring), waveform (7 bars), timer "0:04",
partial transcript "Tell me about the history of…", "Release to send" hint.
Feature flag: `voiceInput: true`.

## Tagline overlay

Heading: `Speak. AI listens.`
Subhead: `On-device transcription. No audio uploaded.`

## Detox snippet

```ts
await device.launchApp({
  launchArgs: {
    E2E_MOCK_VOICE_RECORDING: '1',
    E2E_MOCK_TRANSCRIPT: 'Tell me about the history of',
    E2E_FIXTURE: 'simple-chat',
    E2E_LOCAL_MODE: '1',
    E2E_SKIP_ONBOARDING: '1',
  },
});
await element(by.id('voice-mic-button')).longPress();
await device.takeScreenshot('IOS-04-voice-recording');
await element(by.id('voice-mic-button')).longPressRelease();
```

Output: `captures/ios/6.9/raw/04-voice-recording.png`

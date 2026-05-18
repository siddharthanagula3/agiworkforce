# AND-02 — Model picker [Pixel 8, phone]

## Listing metadata

- **Title** (≤30 chars): `10+ AI models, one app` (22)
- **Caption** (≤45 chars): `Switch Claude, GPT, Gemini — mid-thread.` (40)

## Frame

- **Device**: Pixel 8 — phone class → 1080 × 2400 px
- **Orientation**: Portrait

## Screen and state

Route: `/(app)/chat/[id]` — model picker bottom sheet open

Data primed:

- Bottom sheet shows provider sections:
  - Section "On-device": Qwen3-4B (selected), Phi-3-mini
  - Section "Anthropic" (locked chip): Claude 4.7 Sonnet, Claude 4.7 Haiku
  - Section "OpenAI" (locked): GPT-5.4, o4-mini
  - Section "Google" (locked): Gemini 3.1 Flash, Gemini 3.1 Pro
  - Section "xAI" (locked): Grok 4
  - Section "DeepSeek" (locked): DeepSeek-R2
  - "Join waitlist" chip at bottom
- Currently selected "Qwen3 · 4B" highlighted

## Tagline overlay

Heading: `10+ models. One conversation.`
Subhead: `Switch Claude, GPT, Gemini any turn.`
Gradient: teal `#21808d` → transparent, top 35%

## Detox automation snippet

```ts
// e2e/screenshots/and-02-model-picker.spec.ts
import { device, element, by } from 'detox';

describe('AND-02 model picker phone', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { E2E_SKIP_ONBOARDING: '1', E2E_LOCAL_MODE: '1', E2E_FIXTURE: 'simple-chat' },
    });
  });

  it('captures model picker sheet — phone', async () => {
    await element(by.id('chat-model-badge')).tap();
    await element(by.id('model-picker-sheet')).scrollTo('top');
    await device.takeScreenshot('AND-02-model-picker');
  });
});
```

Device config: AVD `pixel_8_api_35`
Output path: `store-listing/screenshots/captures/android/phone/raw/02-model-picker.png`

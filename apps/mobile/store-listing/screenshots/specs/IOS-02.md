# IOS-02 — Model picker [iPhone 16 Pro Max, 6.9"]

- **Title**: `10+ AI models, one app` (22/30)
- **Caption**: `Switch Claude, GPT, Gemini — mid-thread.` (40/45)
- **Device**: iPhone 16 Pro Max — 1320 x 2868 px

## Screen and state

Route: `/(app)/chat/[id]`, ModelPicker bottom sheet open.
Qwen3-4B selected. Sections: On-device (active), Anthropic/OpenAI/Google/xAI/DeepSeek/Mistral (locked, "Join waitlist" chip).

## Tagline overlay

Heading: `10+ models. One conversation.`
Subhead: `Switch Claude, GPT, Gemini any turn.`

## Detox snippet

```ts
await element(by.id('chat-model-badge')).tap();
await element(by.id('model-picker-sheet')).scrollTo('top');
await device.takeScreenshot('IOS-02-model-picker');
```

Output: `captures/ios/6.9/raw/02-model-picker.png`

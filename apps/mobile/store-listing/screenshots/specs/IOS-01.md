# IOS-01 — On-device chat in flight [iPhone 16 Pro Max, 6.9"]

## Listing metadata

- **Title** (30 char max): `AI that works offline` (21)
- **Caption** (45 char max): `Chat without internet. No sign-up needed.` (41)

## Frame

- **Device**: iPhone 16 Pro Max — 6.9" → 1320 x 2868 px
- **Orientation**: Portrait

## Screen and state

Route: `/(app)/chat/[id]`
Fixture: `roman-empire-chat` (3-turn local chat, no network calls)

- Shield icon + "On-device" label (green dot) in chat header
- Model badge: "Qwen3 · 4B"
- Airplane mode active in simulator status bar
- Last 2 turns visible after scroll

## Tagline overlay

Heading: `AI that works offline`
Subhead: `Runs on your phone. No Wi-Fi. No sign-up.`
Gradient: `#21808d` teal top 35%

## Detox snippet

```ts
// e2e/screenshots/01-offline-chat.spec.ts
await device.launchApp({
  newInstance: true,
  launchArgs: {
    E2E_SKIP_ONBOARDING: '1',
    E2E_FIXTURE: 'roman-empire-chat',
    E2E_LOCAL_MODE: '1',
  },
});
await element(by.id('chat-message-list')).scrollTo('bottom');
await device.takeScreenshot('IOS-01-offline-chat');
```

Output: `captures/ios/6.9/raw/01-offline-chat.png`

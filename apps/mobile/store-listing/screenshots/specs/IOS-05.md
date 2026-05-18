# IOS-05 — HealthKit chat [iPhone 16 Pro Max, 6.9"]

- **Title**: `AI meets your health data` (25/30)
- **Caption**: `Steps, sleep, heart rate — ask in plain text.` (45/45)
- **Device**: iPhone 16 Pro Max — 1320 x 2868 px

## Screen and state

Route: `/(app)/chat/[id]`, fixture: `healthkit-steps-chat`.
User: "How many steps did I take this week?"
Model: tabular step data Mon-Fri + weekly total + "[Data from Apple Health · On-device only]"
Attribution chip: "Apple Health · read-only"
Feature flag: `E2E_MOCK_HEALTHKIT: '1'` (no live HealthKit call in E2E)
iOS only — Android equivalent in AND-05.

## Tagline overlay

Heading: `AI meets your health data`
Subhead: `Steps, sleep, heart rate. Stays on device.`

## Detox snippet

```ts
await device.launchApp({
  launchArgs: {
    E2E_SKIP_ONBOARDING: '1',
    E2E_FIXTURE: 'healthkit-steps-chat',
    E2E_LOCAL_MODE: '1',
    E2E_MOCK_HEALTHKIT: '1',
  },
});
await element(by.id('chat-message-list')).scrollTo('bottom');
await device.takeScreenshot('IOS-05-healthkit-chat');
```

Output: `captures/ios/6.9/raw/05-healthkit-chat.png`

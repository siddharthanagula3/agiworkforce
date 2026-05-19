# IOS-03 — Privacy screen [iPhone 16 Pro Max, 6.9"]

- **Title**: `Private by design` (17/30)
- **Caption**: `Your chats never leave your phone. Ever.` (40/45)
- **Device**: iPhone 16 Pro Max — 1320 x 2868 px

## Screen and state

Route: `/(app)/settings/privacy`
Shows: On-device only (shield, green), No account, No data sent to AGI servers,
Encrypted SQLite, DPDP Act 2023 compliant, EU AI Act Article 50 compliant.
"Your data rights" section: Export, Delete.

## Tagline overlay

Heading: `Private by design`
Subhead: `No cloud. No tracking. Data stays on device.`

## Detox snippet

```ts
await element(by.id('drawer-menu-button')).tap();
await element(by.id('drawer-settings-link')).tap();
await element(by.id('settings-privacy-row')).tap();
await device.takeScreenshot('IOS-03-privacy-screen');
```

Output: `captures/ios/6.9/raw/03-privacy-screen.png`

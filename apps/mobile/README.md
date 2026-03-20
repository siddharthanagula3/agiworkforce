# Mobile App

Expo 55 + React Native companion app. QR-pairs with desktop for live agent monitoring.

## Quick Start

```bash
pnpm install
cd apps/mobile && pnpm dev   # Expo dev server
```

## Architecture

- **Router**: expo-router (file-based)
- **Styling**: NativeWind (Tailwind for RN)
- **Storage**: MMKV (fast) + SecureStore (sensitive)
- **Companion**: WebRTC data channel + signaling server fallback
- **State**: Zustand stores

## Key Features

- QR pairing with desktop
- Live agent execution dashboard
- Approve/deny agent actions from phone
- Chat with cross-device sync

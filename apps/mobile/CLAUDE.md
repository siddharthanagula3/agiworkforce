# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Expo 55 + React Native 0.83.2 + React 19 mobile app. Companion to the desktop Tauri app — provides chat, agent oversight, dispatch (mobile→desktop task execution), voice input, and cross-device sync. Package: `@agiworkforce/mobile`. Bundle ID: `com.agiworkforce.app`.

## Build Commands

```bash
pnpm dev                        # Expo dev server
pnpm test                       # Jest (jest-expo preset)
pnpm test -- __tests__/smoke.test.ts  # Single test file
npx expo prebuild                # Generate native projects
npx expo run:ios                 # Build + run iOS
npx expo run:android             # Build + run Android
eas build --profile development  # EAS cloud build (dev)
eas build --profile preview      # EAS cloud build (preview)
eas build --profile production   # EAS cloud build (production)
```

## Architecture

### Navigation (Expo Router, file-based)

```
app/_layout.tsx          # Root: MMKV init → auth guard → biometric gate → deep links
app/onboarding.tsx       # Pre-login flow
app/(auth)/_layout.tsx   # Login/signup stack
app/(app)/_layout.tsx    # Drawer navigator (Dispatch, Chat, Agents, Settings in sidebar)
app/(app)/(tabs)/        # Hidden tab routes (kept for route compatibility, tab bar not shown)
app/(app)/chat/[id].tsx  # Conversation detail with streaming
app/(app)/dispatch/      # Mobile→desktop task dispatch
app/(app)/companion/     # Agent execution monitoring
```

Root layout initialization order matters: `initMmkvEncryption()` **must** complete before any store rehydration.

### State Management (Zustand v5 + Persist)

| Store | Persistence | Purpose |
|-------|-------------|---------|
| `authStore` | SecureStore (Keychain) | Session, tokens, OAuth. 2KB chunking for large JWTs |
| `chatStore` | MMKV (encrypted) | Conversations (cap: 200), messages (cap: 100/conv), streaming |
| `dispatchStore` | MMKV | Desktop task thread (one per user), last 200 messages |
| `agentStore` | MMKV | Live agent status from desktop, approval queue |
| `memoryStore` | MMKV | Desktop memory system sync |
| `scheduleStore` | MMKV | Scheduled task management |
| `desktopStatusStore` | none | Desktop online/offline heartbeat |
| `crossDeviceStore` | MMKV | Cross-device pairing state |

All stores use `partialize` to limit what gets persisted — never persist loading states or functions.

### Storage Layer

- **MMKV** (`lib/mmkv.ts`): Encrypted at rest (256-bit key in Keychain). Falls back to in-memory `Map` in Expo Go. ~30x faster than AsyncStorage.
- **SecureStore** (`lib/secureStorage.ts`): iOS Keychain / Android Keystore. 2KB per-value limit — auto-chunks large JWTs via `supabaseStorage` adapter.
- **Supabase** (`services/supabase.ts`): Cloud persistence + Realtime subscriptions.

### Networking

**API client** (`services/api.ts`):
- Bearer token auto-injected on all requests
- Global 401 handling: refresh token → retry once → on failure: sign out + alert
- Concurrent 401s share a single `_refreshing` promise (prevents thundering herd)
- Default timeout: 30s, streaming: 120s, upload: 60s

**SSE streaming** (`services/streaming.ts`):
- Reconnect: 3 attempts with exponential backoff (1s → 2.5s → 5s)
- Per-conversation abort controllers (concurrent streams supported)
- Delta callbacks: `onDelta`, `onDone`, `onError`, `onReconnecting`

### Cross-Device Sync

Three Supabase Realtime channels power mobile↔desktop communication:

| Channel | Table | Purpose |
|---------|-------|---------|
| `dispatch_messages` | `dispatch_messages` | Task commands + audit trail. Filter: `surface='desktop'` to prevent echo |
| `dispatch_agent_state` | `dispatch_agent_state` | Live agent execution state, tool calls, approval requests |
| `surface_heartbeats` | `surface_heartbeats` | Device liveness (powers ConnectionStatus indicator) |

**Conversation sync** (`services/conversationSync.ts`): Three-device last-write-wins merge using `updated_at` timestamps.

**Dispatch flow**: Mobile sends task → Supabase INSERT → Desktop Realtime listener → Rust executes → UPDATE agent state → Mobile Realtime listener → UI updates.

### Voice

`services/voice.ts`: expo-audio (unavailable in Expo Go). Transcription via API gateway Whisper or Deepgram STT. Output: mono .m4a (44.1kHz, 128kbps). Platform-specific codecs (Android: MPEG4/AAC, iOS: PCM).

## Key Conventions

- **Styling**: NativeWind v4 (Tailwind for RN). Custom palette: terra-cotta, teal, charcoal. Use `cn()` from `lib/cn.ts` for className merging
- **Icons**: Lucide React Native only
- **Lists**: `@shopify/flash-list` for performance, `@gorhom/bottom-sheet` for sheets
- **Toasts**: Alert.alert() for user-facing errors (no sonner on native)
- **Imports**: `@/` alias maps to project root
- **Components**: PascalCase, organized by feature (`chat/`, `companion/`, `voice/`, `agents/`, `ui/`)
- **Store exports**: `useXyzStore` hook pattern
- **Environment**: `EXPO_PUBLIC_*` vars in `lib/constants.ts`

## Testing

Jest with `jest-expo` preset. Key patterns:

- **Mocks before imports**: `jest.mock()` declarations must come BEFORE `import` statements (module caching)
- **Store testing**: Use `useXyzStore.getState()` directly, not React rendering
- **SectionList tests**: Items may be virtualized — use `queryAllByText` defensively, don't assume all items render
- **MMKV mock**: In-memory `Map` object; clear in `beforeEach`
- **Supabase mock**: Chain `.from().select().eq().maybeSingle()` pattern
- **Reanimated mock**: `useSharedValue` returns `{ value: initial }`, `useAnimatedStyle` invokes immediately
- **State reset**: `resetStore()` + `jest.clearAllMocks()` in every `beforeEach`

## Critical Gotchas

1. **MMKV encryption init**: Must call `initMmkvEncryption()` in root layout before stores hydrate. Skipping this = unencrypted data at rest
2. **SecureStore 2KB limit**: Auth tokens chunked automatically by `supabaseStorage` adapter. Don't store large values directly
3. **Expo Go limitations**: No native MMKV module, no expo-audio — both fall back gracefully. Test voice features on device builds only
4. **Token refresh race**: `_refreshing` promise in `api.ts` serializes concurrent 401 refreshes. Don't bypass this
5. **Dispatch echo prevention**: Realtime channels filter by `surface='desktop'` to ignore messages the mobile app itself sent
6. **Android back button**: Hardware back handled in root layout with double-press-to-exit pattern
7. **Share intent**: Android share data arrives as query params; captured in `handleShare` in root layout
8. **Streaming abort**: AbortControllers are per-conversation, not global — canceling one chat doesn't affect others
9. **Deep link deferred**: Cold-start deep links are queued until navigator is ready (`services/notifications.ts`)

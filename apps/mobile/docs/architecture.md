# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Expo 55 + React Native 0.84.1 + React 19.2.4 mobile app. Companion to the desktop Tauri app — provides chat, agent oversight, dispatch (mobile->desktop task execution), voice input, and cross-device sync. Package: `@agiworkforce/mobile`. Bundle ID: `com.agiworkforce.app`. New Architecture enabled.

---

## Build Commands

```bash
# ── Development ──
pnpm dev                        # Expo dev server
npx expo prebuild                # Generate native projects
npx expo run:ios                 # Build + run iOS
npx expo run:android             # Build + run Android

# ── Type Checking & Linting ──
pnpm typecheck                   # tsc --noEmit
pnpm lint                        # ESLint (.ts, .tsx)

# ── Testing ──
pnpm test                        # Jest (silently skips on jest-expo UIManager bug)
pnpm test:local                  # Jest (fails on error — use for local runs)
pnpm test -- __tests__/smoke.test.ts  # Single test file

# ── EAS Cloud Builds ──
eas build --profile development  # Dev client (iOS simulator)
eas build --profile preview      # Internal distribution (Release config)
eas build --profile production   # Production (auto-increment, app-bundle on Android)
```

---

## Tech Stack

| Layer            | Technology                                                | Version                     |
| ---------------- | --------------------------------------------------------- | --------------------------- |
| Framework        | Expo                                                      | 55                          |
| Runtime          | React Native                                              | 0.84.1                      |
| UI framework     | React                                                     | 19.2.4                      |
| Styling          | NativeWind (Tailwind for RN)                              | 4.2.3                       |
| State            | Zustand                                                   | 5.x + Persist + Immer-style |
| Navigation       | Expo Router (file-based)                                  | 55.x                        |
| Auth             | Supabase SSR                                              | 2.100.0                     |
| Realtime         | Supabase Realtime                                         | (via @supabase/supabase-js) |
| Lists            | @shopify/flash-list                                       | 2.3.1                       |
| Sheets           | @gorhom/bottom-sheet                                      | 5.1.2                       |
| Icons            | Lucide React Native                                       | 0.577.0                     |
| Storage (fast)   | react-native-mmkv                                         | 3.2.0                       |
| Storage (secure) | expo-secure-store                                         | 55.x                        |
| WebRTC           | react-native-webrtc                                       | 124.x                       |
| Animation        | react-native-reanimated                                   | 4.2.3                       |
| Bundler          | Metro                                                     | (Expo default)              |
| Test             | Jest 29 + jest-expo 55 + @testing-library/react-native 13 |
| TypeScript       | TypeScript                                                | 5.9.3                       |

---

## Architecture

### Navigation (Expo Router, file-based)

```
app/
  _layout.tsx              # Root: suppress-warnings → MMKV init → auth guard → biometric gate → push notifications → background fetch → Realtime subscriptions → deep links → share intent → Android back button
  onboarding.tsx           # Pre-login flow
  (auth)/
    _layout.tsx            # Auth stack
    login.tsx              # Login/signup
  (app)/
    _layout.tsx            # Drawer navigator (permanent on iPad, slide-out on iPhone)
    (tabs)/                # Hidden tab routes (kept for route compatibility, tab bar not shown)
      index.tsx            # Home
      chat.tsx             # Chat list
      agents.tsx           # Agent list
      projects.tsx         # Projects
      settings.tsx         # Settings
    skills/index.tsx       # Skills catalog
    dispatch/index.tsx     # Mobile→desktop task dispatch
    chat/[id].tsx          # Conversation detail with streaming
    agents/index.tsx       # Agent overview
    agents/[id].tsx        # Agent detail
    companion/index.tsx    # Desktop companion
    companion/agent/[id].tsx  # Agent execution monitoring
    connectors/index.tsx   # Service integrations
    profile/index.tsx      # User profile
    schedules/index.tsx    # Schedule list
    schedules/create.tsx   # Schedule creator
    settings/index.tsx     # Settings hub
    settings/memory.tsx    # Memory management
    settings/integrations.tsx
    settings/notifications.tsx
    settings/personalization.tsx
    settings/capabilities.tsx
    settings/auto-approve.tsx
    messaging/index.tsx    # External messaging
    notifications/index.tsx
    feedback.tsx
    about.tsx
    camera.tsx             # QR scanner
    compare.tsx            # Model comparison
    usage.tsx              # Usage tracking
    widget-setup.tsx       # Widget configuration
```

**Root layout initialization order matters:**

1. `suppress-warnings.ts` import (must be first)
2. `initMmkvEncryption()` **must** complete before any store rehydration
3. Auth session check
4. Biometric gate
5. Push notification registration
6. Background fetch registration
7. Realtime channel subscriptions
8. Deep link handler (`agiworkforce://pair/CODE`)

### State Management (Zustand v5 + Persist)

16 Zustand stores, all using `partialize` to exclude transient state:

| Store                    | Persistence                         | Purpose                                                                  |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------ |
| `authStore`              | SecureStore (Keychain)              | Session, tokens, OAuth. 2KB chunking for large JWTs                      |
| `chatStore`              | MMKV (encrypted)                    | Conversations (cap: 200), messages (cap: 100/conv), streaming state      |
| `dispatchStore`          | MMKV                                | Desktop task thread (cap: 500 messages)                                  |
| `agentStore`             | MMKV                                | Live agent status from desktop, approval queue                           |
| `modelStore`             | MMKV                                | Selected model, favorites, recents, per-model thinking toggle            |
| `settingsStore`          | MMKV                                | Theme, biometric lock, font, personalization, capabilities, auto-approve |
| `connectionStore`        | MMKV (persists: `desktopName` only) | WebRTC/signaling connection, reconnect logic, heartbeat latency          |
| `projectStore`           | MMKV                                | Projects list + active project context                                   |
| `memoryStore`            | MMKV                                | Desktop memory system sync                                               |
| `scheduleStore`          | MMKV                                | Scheduled task management                                                |
| `desktopStatusStore`     | MMKV                                | Desktop online/offline (90s stale threshold)                             |
| `crossDeviceStore`       | MMKV                                | Cross-device pairing state                                               |
| `integrationStore`       | MMKV                                | Connected integrations (Google, Slack, etc.)                             |
| `messagingStore`         | MMKV                                | Messaging thread state                                                   |
| `notificationPrefsStore` | MMKV                                | Notification preferences                                                 |

**Store pattern:**

- `partialize: (state) => ({ field1, field2 })` — never persist loading states or functions
- Direct state access in tests: `useXyzStore.getState()`
- `resetStore()` function on each store for testing

### Storage Layer

| Storage     | Implementation       | Encryption                | Best For               | Limit     |
| ----------- | -------------------- | ------------------------- | ---------------------- | --------- |
| MMKV        | `react-native-mmkv`  | AES-256 (key in Keychain) | All stores except auth | None      |
| SecureStore | `expo-secure-store`  | OS Keychain/Keystore      | Auth tokens, secrets   | 2KB/value |
| In-memory   | Zustand (no persist) | None                      | Transient state        | N/A       |

- `mmkvStorage` adapter in `lib/mmkv.ts` — Zustand `StateStorage` interface
- `secureStorage` adapter in `lib/secureStorage.ts` — sanitizes keys to `[A-Za-z0-9._-]`
- `supabaseStorage` adapter in `services/supabase.ts` — auto-chunks large JWTs across multiple SecureStore entries
- Falls back to in-memory `Map` in Expo Go (no native MMKV module)

### Networking

**API client** (`services/api.ts`):

- Bearer token auto-injected on all requests
- Global 401 handling: refresh token -> retry once -> on failure: sign out + alert
- Concurrent 401s share a single `_refreshing` promise (prevents thundering herd)
- Timeouts: DEFAULT (30s), STREAMING (120s), UPLOAD (60s)

**SSE streaming** (`services/streaming.ts`):

- Auto-reconnect: 3 attempts with exponential backoff (1s -> 2.5s -> 5s)
- Per-conversation abort controllers (concurrent streams supported)
- Delta callbacks: `onDelta`, `onDone`, `onError`, `onReconnecting`

**Offline queue** (`services/offlineQueue.ts`):

- Queues failed messages locally
- Exponential backoff retry
- Flushes on reconnect
- `onSuccess` / `onFailure` callbacks

### Cross-Device Sync

Three Supabase Realtime channels:

| Channel                | Table                  | Purpose                                                                  |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `dispatch_messages`    | `dispatch_messages`    | Task commands + audit trail. Filter: `surface='desktop'` to prevent echo |
| `dispatch_agent_state` | `dispatch_agent_state` | Live agent execution state, tool calls, approval requests                |
| `surface_heartbeats`   | `surface_heartbeats`   | Device liveness (powers ConnectionStatus indicator)                      |

**Conversation sync** (`services/conversationSync.ts`): Three-device last-write-wins merge using `updated_at` timestamps. Background sync on app resume.

**Dispatch flow**: Mobile sends task -> Supabase INSERT -> Desktop Realtime listener -> Rust executes -> UPDATE agent state -> Mobile Realtime listener -> UI updates.

**Desktop companion** (`services/companion.ts`): WebRTC peer connection with signaling server fallback. Control message relay via WebSocket.

### Voice

`services/voice.ts`: expo-av (unavailable in Expo Go). Transcription via API gateway Whisper or Deepgram STT. Output: mono .m4a (44.1kHz, 128kbps). Platform-specific codecs (Android: MPEG4/AAC, iOS: PCM).

---

## Directory Structure

```
app/                       # 56 route files (Expo Router)
components/                # 16 feature directories
  agents/                  #   Agent cards, status badges, tool timelines
  auth/                    #   Login form, OAuth buttons (Apple, Google)
  chat/                    #   20+ files: bubbles, attachments, tool calls, approvals, artifacts, citations, thinking
  companion/               #   Desktop companion UI
  connectors/              #   Connector items + data
  drawer/                  #   Drawer navigation content
  integrations/            #   Integration settings
  messaging/               #   Messaging UI
  model-picker/            #   Model selection dropdown
  projects/                #   Project list + selector
  schedules/               #   Schedule list + creator
  settings/                #   Settings sub-pages
  shared/                  #   Shared UI utilities
  sidebar/                 #   Search bar, conversation list, tags, user card
  ui/                      #   12 primitives: card, button, input, avatar, badge, separator, switch, bottom-sheet, skeleton, text, NetworkBadge
  voice/                   #   Voice input/output
hooks/                     # 4 custom hooks
  useBiometricGate.ts      #   Biometric auth (Face ID / fingerprint)
  useNetworkStatus.ts      #   Network connectivity detection
  useTheme.ts              #   Theme colors provider (dark/light/system)
  useVoicePlayback.ts      #   Voice playback state management
lib/                       # 14 utility files
  abortSignal.ts           #   combineAbortSignals() — Hermes polyfill for AbortSignal.any()
  clipboard.ts             #   copyToClipboard() — graceful degradation if expo-clipboard unavailable
  cn.ts                    #   cn() — clsx + tailwind-merge for NativeWind
  constants.ts             #   API_URL, WS_URL, SUPABASE_URL, SUPABASE_ANON_KEY, TIMEOUTS, etc.
  deviceId.ts              #   getDeviceId() — persistent UUID in SecureStore
  imageGenHelpers.ts       #   Image generation detection, prompt extraction, model defaults
  markdown.ts              #   Lightweight markdown parser (bold, italic, code, thinking blocks)
  mmkv.ts                  #   MMKV encrypted storage adapter + initMmkvEncryption()
  models.ts                #   32 LLM models, 9 providers, 3 auto modes, lookup functions
  secureStorage.ts         #   SecureStore Zustand adapter with key sanitization
  suppress-warnings.ts     #   LogBox + console.warn suppression for known third-party warnings
  tagUtils.ts              #   Tag-to-badge-color mapping, sort-by-count, auto-tag threshold
  theme.ts                 #   Design tokens: colors (dark/light), spacing, radii
  voicePresets.ts          #   5 TTS voice presets (Aurora, Nova, Sage, Ember, Atlas)
services/                  # 25 service files
  api.ts                   #   Authenticated HTTP client (401 refresh, retry, timeouts)
  autotag.ts               #   Auto-tagging conversations
  backgroundFetch.ts       #   Agent status polling (expo-background-fetch)
  companion.ts             #   WebRTC + signaling for desktop pairing
  companionNotifications.ts #  Local push for agent updates
  conversationSync.ts      #   3-device last-write-wins merge
  desktopStatus.ts         #   Desktop liveness tracking
  deviceIntegrations.ts    #   Calendar, Contacts, Health, Camera access
  dispatchRealtime.ts      #   Dispatch Realtime channel listener
  fileCreation.ts          #   File creation in app directories
  healthData.ts            #   HealthKit data sync
  heartbeat.ts             #   Desktop heartbeat polling (25s interval, 2 missed = stale)
  imagegen.ts              #   Image generation (DALL-E, Midjourney)
  memory.ts                #   Memory system sync from desktop
  messaging.ts             #   External messaging
  modelCatalog.ts          #   Model metadata fetching
  notifications.ts         #   Push notification setup + listeners (18KB)
  offlineQueue.ts          #   Offline message queue with exponential backoff retry
  realtime.ts              #   Supabase Realtime subscriptions
  schedules.ts             #   Schedule management
  streaming.ts             #   SSE streaming with auto-reconnect
  supabase.ts              #   Supabase client + SecureStore auth adapter
  tts.ts                   #   Text-to-speech (system + cloud)
  usage.ts                 #   Token/credit usage tracking
  voice.ts                 #   Voice input (Whisper/Deepgram STT), mono .m4a output
stores/                    # 16 Zustand v5 stores (see State Management above)
types/                     # 2 type files
  chat.ts                  #   ChatMessage, MessageAttachment, Artifact, ToolCall, ApprovalRequest, StatusStep, RiskLevel
  navigation.ts            #   Route param types
__tests__/                 # 25 test files (~8,187 LOC)
assets/                    # App icons, splash, notification icon
```

### Shared Monorepo Packages

| Package               | Usage                                                     |
| --------------------- | --------------------------------------------------------- |
| `@agiworkforce/types` | Canonical chat types, approval requests, signaling events |
| `@agiworkforce/utils` | SignalingClient, utility functions, AbortError            |

---

## Configuration Files

| File                 | Purpose                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `app.json`           | Expo config: bundle IDs, iOS/Android permissions, plugins, privacy manifests, intent filters |
| `babel.config.js`    | `babel-preset-expo` + `nativewind/babel`. Reanimated plugin disabled in test env             |
| `metro.config.js`    | Monorepo support (watchFolders, dual node_modules resolution) + NativeWind input             |
| `tailwind.config.js` | NativeWind preset, brand colors (terra-cotta, teal, charcoal), surface/agent colors          |
| `jest.config.js`     | jest-expo preset, pnpm-aware transformIgnorePatterns, `@/` alias mapper                      |
| `jest.setup.js`      | UIManager mock workaround (must run before jest-expo setup)                                  |
| `eas.json`           | EAS build profiles: development (simulator), preview (internal), production (auto-increment) |
| `tsconfig.json`      | strict: true, `@/*` path alias, baseUrl: `.`                                                 |
| `global.css`         | Tailwind directives (`@tailwind base/components/utilities`)                                  |

---

## Coding Conventions

### Styling

- **NativeWind v4** (Tailwind for React Native) — NOT `StyleSheet.create()`
- Custom palette in `tailwind.config.js`: `terra-cotta`, `teal`, `charcoal`, `surface`, `agent`
- `cn()` from `lib/cn.ts` for className merging (clsx + tailwind-merge)
- Raw color tokens in `lib/theme.ts` for Reanimated animations, SVG, and imperative styles
- `getColors(mode, systemScheme)` returns the active palette (dark/light/system)

### Components

- PascalCase filenames, named exports only (no `export default`)
- Organized by feature: `chat/`, `companion/`, `voice/`, `agents/`, `ui/`
- UI primitives in `components/ui/` — wrap React Native + NativeWind
- Lucide React Native for all icons — never heroicons or other libraries
- `@shopify/flash-list` for long lists, `@gorhom/bottom-sheet` for modal sheets
- `Alert.alert()` for user-facing errors (no toast library on native)

### State

- Stores export `useXyzStore` hook
- Zustand v5 + `persist()` middleware with MMKV or SecureStore adapters
- `partialize` to exclude transient state (loading flags, functions)
- Direct mutations OK inside Immer-style producers
- Selectors: destructure needed fields from `useXyzStore()`

### Imports

- `@/` alias maps to project root (`./`)
- Shared types: `import type { ... } from '@agiworkforce/types'`

### Environment Variables

- `EXPO_PUBLIC_*` prefix required for client-side access
- Defined in `lib/constants.ts` with fallbacks
- Required: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Optional: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_DEEPGRAM_API_KEY`

### Model IDs

**NEVER hardcode model IDs.** Mobile model catalog lives in `lib/models.ts` (32 models, 9 providers). Use lookup functions:

- `getModelById(id)` — returns ModelDef | undefined
- `getModelsByProvider(providerId)` — returns ModelDef[]
- `getDisplayName(id)` / `getShortDisplayName(id)` — human-readable labels
- `isAutoMode(id)` — check if ID is an auto-routing mode

---

## Testing

Jest 29 with `jest-expo` preset. 25 test files (~8,187 LOC).

### Configuration

```javascript
// jest.config.js
{
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],           // UIManager mock (before jest-expo setup)
  transformIgnorePatterns: [/* pnpm-aware */],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}
```

### Key Patterns

**Mocks before imports** (Jest hoists mock declarations):

```typescript
jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
// THEN import
import { useChatStore } from '../stores/chatStore';
```

**Store testing** (no React rendering needed):

```typescript
function getState() {
  return useChatStore.getState();
}
beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
});
```

**MMKV mock** — in-memory `Map` for stateful tests, simple jest.fn() for read-only tests.

**Supabase mock** — chain pattern: `.from().select().eq().maybeSingle()`

**Reanimated mock** — `useSharedValue` returns `{ value: initial }`, `useAnimatedStyle` invokes immediately. Reanimated babel plugin disabled in test env via `babel.config.js`.

**Icon mock** — Proxy returns `<View testID="icon-{name}" />` for each Lucide icon.

**Fake timers** — `jest.useFakeTimers()` + `flushMicrotasks()` for backoff/retry testing.

**State reset** — `resetStore()` + `jest.clearAllMocks()` in every `beforeEach`.

**Factory helpers** — `makeSession()`, `makeMessage()` for consistent test data.

---

## Critical Gotchas

1. **MMKV encryption init**: Must call `initMmkvEncryption()` in root layout before stores hydrate. Skipping this = unencrypted data at rest
2. **SecureStore 2KB limit**: Auth tokens chunked automatically by `supabaseStorage` adapter. Don't store large values directly
3. **Expo Go limitations**: No native MMKV module, no expo-av — both fall back gracefully. Test voice features on device builds only
4. **Token refresh race**: `_refreshing` promise in `api.ts` serializes concurrent 401 refreshes. Don't bypass this
5. **Dispatch echo prevention**: Realtime channels filter by `surface='desktop'` to ignore messages the mobile app itself sent
6. **Android back button**: Hardware back handled in root layout with double-press-to-exit pattern
7. **Share intent**: Android share data arrives as query params; captured in `handleShare` in root layout
8. **Streaming abort**: AbortControllers are per-conversation, not global — canceling one chat doesn't affect others
9. **Deep link deferred**: Cold-start deep links are queued until navigator is ready (`services/notifications.ts`)
10. **Hermes AbortSignal**: `AbortSignal.any()` not supported — use `combineAbortSignals()` from `lib/abortSignal.ts`
11. **Reanimated in tests**: Babel plugin disabled in `NODE_ENV=test` (no react-native-worklets in Jest)
12. **NativeWind cn() limitation**: Build-time transform only sees static strings. `twMerge` produces dynamic strings — conflict resolution may leave both classes (last wins at runtime)
13. **Metro monorepo**: `watchFolders` set to monorepo root. Do NOT set `disableHierarchicalLookup` — it breaks workspace package transitive deps
14. **Warning suppression**: `lib/suppress-warnings.ts` must be imported first in root layout (before other modules) to suppress known third-party LogBox warnings
15. **jest-expo UIManager bug**: `jest.setup.js` patches `NativeModules.UIManager` before jest-expo runs. Default `pnpm test` silently skips on failure; use `pnpm test:local` for strict runs

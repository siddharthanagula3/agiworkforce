# Mobile App

Expo 55 + React Native 0.84 companion app. Package: `@agiworkforce/mobile`. Bundle: `com.agiworkforce.app`.

## Commands

```bash
pnpm dev                     # Expo dev server
npx expo run:ios             # Build + run iOS
npx expo run:android         # Build + run Android
pnpm typecheck               # tsc --noEmit
pnpm lint                    # ESLint
pnpm test                    # Jest (499 tests, silently skips on UIManager bug)
pnpm test:local              # Jest (strict — fails on error)
```

## Architecture

- Navigation: Expo Router (file-based), Drawer (permanent iPad, slide-out iPhone)
- State: 16 Zustand stores + MMKV persistence + SecureStore for auth
- Networking: Bearer token auto-inject, 401 refresh serialization, SSE streaming with 3-retry reconnect
- Cross-device: 3 Supabase Realtime channels (dispatch_messages, agent_state, heartbeats)
- Voice: expo-av (not available in Expo Go), Whisper/Deepgram STT, mono .m4a output

## Key Rules

- `initMmkvEncryption()` MUST complete before stores hydrate
- SecureStore 2KB limit — large JWTs auto-chunked by supabaseStorage adapter
- Dispatch echo prevention: filter by `surface='desktop'`
- `combineAbortSignals()` instead of `AbortSignal.any()` (Hermes limitation)
- Root layout init order matters: MMKV → auth → biometric → push → bg fetch → realtime
- NativeWind v4 for styling, `cn()` for class merging, raw tokens in `lib/theme.ts`
- Model catalog: `lib/models.ts` (32 models, 9 providers). NEVER hardcode IDs.

## Don't

- No StyleSheet.create() — use NativeWind
- No Reanimated babel plugin in test env (NODE_ENV=test disables it)
- Don't set `disableHierarchicalLookup` in Metro — breaks workspace deps

## Full Architecture

See `docs/architecture.md`

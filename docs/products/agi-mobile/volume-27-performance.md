# AGI Mobile — Volume 27 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`; grounded in `apps/mobile/services/performanceMonitor.ts`, `apps/mobile/services/streaming.ts`, `apps/mobile/services/modelDownload.ts`, `apps/mobile/services/offlineQueue.ts`, `apps/mobile/src/features/chat/components/MessageList.tsx`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/lib/constants.ts`, `apps/mobile/lib/egressGuard.ts`, `apps/mobile/app.config.js`, `packages/platform/local-llm/src/capabilities.ts`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines performance targets and the budgets that gate them for AGI Mobile: cold/warm start, memory, battery, network, UI rendering, and streaming. Performance is shaped by the two trust modes the surface exposes — **Local** (a small on-device LLM, free) and **Managed Cloud** — and by the rule that **Mobile has no BYOK** and is never the first heavy local compute surface.

The cost models are opposite. In **Local** mode the bottleneck is the device: RAM headroom, thermal state, and tokens/sec on the selected on-device tier. In **Cloud** mode it is the network: time-to-first-token over SSE, reconnect resilience, and offline queueing. The same chat UI must stay smooth under both. Heavy artifact generation (PDF/PPTX/DOCX) and image generation stay **cloud-backed** (`FEATURES.imageGen`, `apps/mobile/lib/v1FeatureFlags.ts`) so the phone never pays the local compute and battery cost. New Architecture is the default (Expo SDK 55, `apps/mobile/app.config.js`) with Hermes, which the budgets below assume.

## Cold start

Cold start = process launch to an interactive new-chat home. Synchronous boot work must stay small: MMKV reads, the offline-queue rehydrate (`restoreFromStorage()` in `apps/mobile/services/offlineQueue.ts`), Clerk token-cache read, and the SQLCipher key ceremony (`expo-sqlite` with `useSQLCipher: true`). Expo updates must not block first paint — `updates.fallbackToCacheTimeout: 0` (`app.config.js`) ensures a slow update fetch never stalls launch.

Requirement: on-device model weights must **never** load on the cold path — model load is lazy, triggered only when a Local chat runs; heavy stores hydrate after the first interactive frame.

🔭 Planned — no cold-start budget is instrumented today; `performanceMonitor.ts` measures inference, not app launch. Target: cold start to interactive ≤ 2.0 s on a mid-tier device; add a startup span and assert it in CI before claiming the budget.

## Warm start

Warm start = resume from background to interactive. The token cache (Clerk SecureStore) and persisted chat/MMKV state must make resume near-instant without a network round-trip; `remoteChatGate` (`apps/mobile/services/remoteChatGate.ts`) must re-evaluate Cloud availability on resume and **fail closed** if Cloud is disabled, never showing a stale "available" state. FlashList scroll restoration keeps the conversation anchored on return.

🔭 Planned — no warm-start span is measured. Target: foreground resume to interactive ≤ 500 ms with no spinner for cached conversations; an in-flight Cloud stream that was interrupted by backgrounding resumes or surfaces an honest error (never a frozen "streaming" bubble).

## Memory usage

Memory is the hard ceiling for Local mode. Tier selection is RAM-gated: `packages/platform/local-llm/src/capabilities.ts` requires `TIER2_MIN_RAM_MB = 3500` for the ExecuTorch tier, falls back to the universal llama.rn tier otherwise, and uses platform foundation models / AICore when available. Lists recycle: `MessageList.tsx` uses FlashList v2 (`@shopify/flash-list`) with a stable `keyExtractor`, so long conversations do not retain off-screen views. Telemetry is capped — `MAX_EVENTS = 500`, `MAX_BENCHMARKS = 50` in `performanceMonitor.ts`.

✅ Built — RAM-tiered model selection (`capabilities.ts`) and recycled message list (`MessageList.tsx`).
🟡 Partial — `PerfEvent.peakMemoryMB` exists as a field but is recorded as `0`/heuristic until a native module surfaces RSS (`performanceMonitor.ts`). Requirement: a low-RAM device must refuse to load a model that exceeds headroom rather than OOM; image gen stays cloud-backed so the phone never holds large image buffers locally.

## Battery usage

Battery cost concentrates in sustained on-device inference and large downloads. Thermal state is a first-class signal: `getThermalState()` / `isThermallyThrottled()` (`performanceMonitor.ts`) tag every inference. Model downloads default to **Wi-Fi-only** and are resumable, so the radio is not held on cellular for multi-GB transfers (`modelDownload.ts`: `wifiOnly = true`, NetInfo-gated, HTTP Range resume).

✅ Built — thermal capture and Wi-Fi-gated, resumable downloads.
🔭 Planned — thermal _throttling response_ (auto-reducing on-device generation when `serious`/`critical`, deferring background work under Low Power Mode) is detection-only today; no automatic backoff is wired. Requirement: when thermally throttled, Local inference must visibly degrade gracefully (warn + slow), and background sync/downloads must yield.

## Network usage

Cloud chat streams over SSE through `guardedFetch` (`apps/mobile/lib/egressGuard.ts`), which **refuses network I/O in Local mode before any bytes leave the device** (fail-closed) and routes allowed traffic through TLS-pinned `secureFetch`. The stream reconnects on transient failures with capped exponential backoff (`MAX_RECONNECT_ATTEMPTS = 3`, delays `[1000, 2500, 5000]` ms in `streaming.ts`), and failed sends persist to an MMKV-backed offline queue that drains FIFO on reconnect (`offlineQueue.ts`).

✅ Built — egress-guarded streaming, reconnect/backoff, offline queue, Wi-Fi-aware downloads.
🔭 Planned — Neon delta-sync of Managed-Cloud chats across Web ↔ Mobile ↔ Desktop is the network-efficiency target but is flag-off (`FEATURES.crossDeviceSync = false`, `v1FeatureFlags.ts`); it must sync deltas, not full histories, and Local chats/memory/files never sync without an explicit reviewed transfer.

## Rendering — UI performance

The chat transcript renders through FlashList v2 with recycling, stable keys, and scroll restoration that anchors the visible message during streaming (`MessageList.tsx`). The new-chat home stays simple by product rule (no suggestion/starter cards), which keeps the most-launched screen cheap to mount. Markdown rendering (`apps/mobile/lib/markdown.ts`) and animated sub-components (Reanimated) must not re-render the whole list per token.

✅ Built — FlashList-based transcript with recycling and scroll restoration.
🔭 Planned — an enforced 60 fps budget (no dropped frames during stream + scroll, memoized rows so only the streaming row re-renders); no frame-drop assertion exists in CI yet.

## Streaming performance

Cloud replies render token-by-token via `expo/fetch`'s real `ReadableStream` (`guardedFetch(..., { stream: true })` in `streaming.ts`), with a whole-buffer fallback through the same line parser if no readable body exists. Time-to-first-token is guarded by a per-attempt timeout (`TIMEOUTS.STREAMING = 120_000`, `lib/constants.ts`) that is **cancelled on the first token**, so a slow-but-healthy long reply is never aborted mid-stream while a dead backend still fails fast. Local inference records tokens/sec and first-token latency per event (`performanceMonitor.ts`).

✅ Built — incremental SSE rendering, TTFT timeout guard, reconnect, and per-event tok/s + TTFT capture.
🔭 Planned — token-coalescing for bursty streams and a streaming-jank assertion are not yet implemented.

## Repository map

- `apps/mobile/services/performanceMonitor.ts` — tok/s, TTFT, peak memory, thermal capture; rolling stats; benchmark runner; MMKV-capped history.
- `apps/mobile/services/streaming.ts` — SSE streaming, TTFT timeout guard, reconnect/backoff, provider-stream flag path.
- `apps/mobile/services/modelDownload.ts` — resumable, checksummed, Wi-Fi-gated model downloads.
- `apps/mobile/services/offlineQueue.ts` — MMKV-backed offline send queue with backoff.
- `apps/mobile/src/features/chat/components/MessageList.tsx` — FlashList transcript (recycling, scroll restoration).
- `apps/mobile/lib/egressGuard.ts` — fail-closed egress chokepoint over TLS-pinned `secureFetch`.
- `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/lib/constants.ts`, `apps/mobile/app.config.js` — flags, timeouts, New-Arch/updates config.
- `packages/platform/local-llm/src/capabilities.ts` (+ `tier1/2/3.ts`, `selector.ts`) — RAM/thermal-tiered on-device runtime selection.
- `packages/contracts/types/src/models.json` — model metadata SSOT (never hardcode IDs).

## Competitor notes

ChatGPT and Claude mobile are thin cloud clients; their performance story is network latency, streaming smoothness, and app start — no on-device inference path to budget. AGI's deliberate divergence: a real **on-device Local** tier whose performance is RAM- and thermal-gated (`capabilities.ts`), **multi-provider** Cloud streaming sourced from `models.json`, per-surface trust with a fail-closed egress guard, and **no BYOK on mobile**. The cost: AGI budgets two regimes (device-bound Local, network-bound Cloud) where competitors budget one, and keeps heavy compute cloud-backed so the phone stays cool and responsive.

## Acceptance / Definition of Done

Production-ready means start/resume, memory, battery, network, render, and streaming budgets are instrumented and asserted — not asserted by build success.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass; cold-start and warm-start spans exist and assert their budgets; FlashList streaming shows no frame-drop regression; `PerfEvent.peakMemoryMB` is real, not `0`.
- [ ] Trust: no BYOK affordance appears on any performance/diagnostics screen; Local inference never silently routes to Cloud; `guardedFetch` refuses Local-mode egress; `remoteChatGate` fails closed on resume when Cloud is disabled.
- [ ] Security: model downloads stay Wi-Fi-gated and SHA-256-verified; TLS pinning via `secureFetch` is preserved on the streaming path; perf telemetry stores no plaintext user content.

## Anti-patterns

- Adding a BYOK / API-key entry anywhere to "speed up" a provider — Mobile has no BYOK, ever.
- Routing Local chats/files to Managed Cloud to offload compute, or making the phone the first heavy local PDF/PPTX/DOCX/image-gen surface (image gen is cloud-backed).
- Loading on-device model weights on the cold-start path, or loading a model that exceeds device RAM headroom instead of refusing it.
- Claiming a cold/warm/render/streaming budget without an instrumented, asserted measurement.
- Reporting fake `peakMemoryMB` or a "connected"/"streaming" state that no longer reflects reality.
- Hardcoding or inventing model IDs (use `packages/contracts/types/src/models.json`); referencing Supabase (removed — Clerk + Neon + Stripe only).
- Inventing INR prices for Pro/Max, or reintroducing "Plus"/`pro_plus`/"Hobby" tiers.

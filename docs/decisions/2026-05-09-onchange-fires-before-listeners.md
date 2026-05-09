# ADR: `createStore.onChange` fires before subscriber listeners

## Status

Accepted — 2026-05-09.

## Context

`createStore` (`packages/runtime/src/state/createStore.ts:1-62`) supports both:

- `subscribe(listener)` — for React via `useSyncExternalStore` and other listeners.
- `onChange(prev, next)` — a single hook the store wires to `onChangeAppState` for the four-channel fan-out (cache invalidation, telemetry, persistence, model-switch broadcast).

The order in which these fire on a `setState` call is significant under React 19 concurrent mode, where useEffect-style work runs after paint. If listeners (and therefore React renders) fire before `onChange`, then by the time React paints, side effects in `onChangeAppState` are not yet settled. Any derived state that depends on those side effects (e.g. an API client whose cache was supposed to be invalidated) will be stale during the first render cycle, causing a second render whenever the side effect mutates derived state.

## Decision

`onChange(prev, next)` fires **before** `subscribe` listeners on every `setState` that produces a new reference. Implemented at `packages/runtime/src/state/createStore.ts:53`. The order is:

1. Compute `next = updater(prev)`.
2. If `Object.is(next, prev)`, return without notification.
3. Call `onChange(prev, next)` synchronously.
4. Call every registered listener synchronously.

Step 3 runs all four `onChangeAppState` channels (cache invalidation, telemetry, persistence, model-switch broadcast) before step 4 hands control to React.

## Consequences

**Positive**

- React re-renders see settled side effects. No second render for derived-state updates.
- Cache invalidation is observed before any in-flight render reads from a now-stale cache.
- Telemetry events appear in time order with the state change that triggered them.

**Negative**

- A throwing channel handler delays listener notification. Mitigated by the fan-out failure isolation pattern (each channel wrapped in try/catch at `onChangeAppState.ts:231-248`).
- A slow channel (synchronous I/O in persistence) blocks React. We accept this because persistence is in-memory or microsecond-level (`localStorage.setItem`, `MMKV.set`). If a future channel needs async I/O, it must offload.
- onChange fires on the main thread synchronously; very large state objects with many tracked fields could noticeably delay the channel comparison work. Today the six-domain shape keeps the comparison constant-time per channel.

## References

- `docs/architecture/foundation-2026.md` §2.2.
- `tasks/research/exec/1.3-report.md` §"Architectural Decisions" item 3.
- `packages/runtime/src/state/createStore.ts:53`.

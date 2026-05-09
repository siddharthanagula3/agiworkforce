# ADR: Per-call depth counter for circular fan-out detection

## Status

Accepted — 2026-05-09.

## Context

`onChangeAppState` (§2 of the architecture doc) fans out four channels (cache invalidation, telemetry, persistence, model-switch broadcast) on every `appStateStore.setState`. A side effect in any channel can mutate another store, which mutates `appStateStore` again, which re-enters `onChangeAppState`. Without a circuit breaker we get a Store A → onChange → Store B → onChange → Store A infinite loop, and the JS event loop hangs.

Two designs were considered:

1. **Module-level `isProcessing` flag**: `onChangeAppState` sets a global flag on entry, clears it on exit, and short-circuits if the flag is already set on re-entry.
2. **Per-call `depth` counter**: each invocation carries a depth integer; if `depth > MAX_FANOUT_DEPTH` (= 2), the call emits `CircularFanOutError` and returns. Depth is passed explicitly by the caller, not tracked in module state.

## Decision

We use the per-call depth counter. `onChangeAppState({ prev, next, depth = 0 })` accepts an optional depth, propagates `depth + 1` to nested invocations, and rejects when `depth > MAX_FANOUT_DEPTH`. Implementation at `packages/runtime/src/state/onChangeAppState.ts:220-228`.

## Consequences

**Positive**

- Independent chains stay independent. A Store A → Store B chain at depth 1 and a concurrent Store C → Store D chain at depth 0 do not block each other; the module-level flag would block the second chain.
- Depth is testable. Unit tests assert that depths 0/1/2 are allowed and depth 3 is rejected (`onChangeAppState.test.ts`).
- Depth is reset between distinct call chains by virtue of being a parameter, not a module variable. No risk of a forgotten `finally` block leaving the flag set.

**Negative**

- Callers must thread the depth parameter explicitly. The bridge adapter at `stateBridge.ts` calls `appStateStore.setState` which passes `depth = 0` by default; nested-store-mutation chains inside a channel (e.g. cache invalidator updates the API client store, which has its own bridge) need to either accept the implicit reset or thread depth manually.
- A `MAX_FANOUT_DEPTH` of 2 means a chain Store A → Store B → Store C is allowed but Store A → Store B → Store C → Store D is rejected. We picked 2 because in practice no legitimate chain exceeds 2 hops; deeper chains almost always indicate a feedback loop. The threshold is configurable if a future use case needs more.

## References

- `docs/architecture/foundation-2026.md` §2.4.
- `tasks/research/exec/1.3-report.md` §"Architectural Decisions" item 2.
- `packages/runtime/src/state/onChangeAppState.ts:220-228`.

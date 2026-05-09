# ADR: Sticky `RetryContext` is mutable to the generator, readonly to callers

## Status

Accepted — 2026-05-09.

## Context

The `withRetry` generator at `packages/llm-runtime/src/retry.ts:1-389` runs an LLM request inside a retry loop with exponential backoff, retry-after honour, fallback-trigger thresholding, and context-overflow handling. Across attempts it carries a sticky `RetryContext`:

- `model: string` — may be swapped on `FallbackTriggeredError` (e.g. Claude → GPT).
- `maxTokensOverride?: number` — set when context-overflow detected; the generator computes a smaller viable value.
- `thinkingConfig?` — disabled on context-overflow retry because thinking + max_tokens compete for the same budget.
- `fastMode?: boolean`.

The closure that performs the request reads from `RetryContext` on each attempt. Two questions:

1. **Should the closure mutate `RetryContext` itself**, or only read?
2. **Should callers (chat layer, providers) be able to mutate it post-creation**?

If callers mutate, behaviour mid-retry becomes unpredictable. If the closure must read-only, the generator cannot adjust `maxTokensOverride` mid-loop — and the whole point of the sticky context is that adjustments persist across attempts.

## Decision

`RetryContext` is a mutable object internally. The generator updates `model` (on fallback) and `maxTokensOverride` (on context overflow) between attempts. The TypeScript type exported to callers is `Readonly<RetryContext>` — callers see the current values for telemetry and UI purposes but cannot assign to fields. The mutability is restricted to the retry generator's own scope.

## Consequences

**Positive**

- The generator stays imperative and readable. No closure-over-state-machine indirection to thread values across attempts.
- Callers get a consistent snapshot at observation time. UI showing "now retrying with model X" reads a real value, not a stale capture.
- Tests can construct a `RetryContext` and inspect post-retry values to assert the generator's transitions (`retry.test.ts`).

**Negative**

- The readonly type is a TypeScript invariant, not a runtime barrier. JS callers can `Object.assign` over it. Mitigated by the small surface area: `RetryContext` is only ever passed to `withRetry`, not exposed to external API consumers.
- Concurrent retries on the same context (callers reusing one `RetryContext` across two `withRetry` calls) would race. The generator does not deep-clone. Convention: one `RetryContext` per `withRetry` call. Documented in the `retry.ts` jsdoc.

## References

- `docs/architecture/foundation-2026.md` §5.4.
- `packages/llm-runtime/src/retry.ts:1-389`.
- `tasks/research/deep/m8-services-api.md` §4 (`withRetry.ts` reference).

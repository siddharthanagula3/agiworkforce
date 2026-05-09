# ADR: Per-chunk `Promise.race` + `setTimeout` for stream-idle watchdog

## Status

Accepted — 2026-05-09.

## Context

Provider stream calls (Anthropic, OpenAI, Google, Ollama, etc.) iterate via `for await (const chunk of stream)`. SDK-level fetch timeouts cover only the initial response head; once the body streams, a silent-drop connection (NAT timeout, cellular hand-off, proxy idle close, kernel TCP RST loss) leaves the iteration hung indefinitely. We need a per-chunk timeout that fires when no data arrives within `idleMs` (default 90,000).

Two implementations were considered:

1. **`AbortController` per chunk**: create one `AbortController` per iteration, signal it on timeout, catch the abort and rethrow `StreamIdleTimeoutError`.
2. **`Promise.race` per chunk**: race the next-chunk promise against `setTimeout`. Whichever resolves first wins; the timer is cleared on chunk arrival.

`AbortController` is the official pattern for cancelling fetch streams, but it requires the underlying SDK to respect the abort signal (some do not, particularly older OpenAI versions and most local LLM SDKs). It also creates and destroys a `AbortController` per chunk, which on a deeply streaming response means thousands of allocations.

## Decision

We use `Promise.race` + `setTimeout`. Implementation at `packages/llm-runtime/src/watchdog.ts:1-191`. Each iteration:

```
const next = iterator.next();
const timeout = new Promise<never>((_, reject) => {
  timer = setTimeout(() => reject(new StreamIdleTimeoutError(idleMs)), idleMs);
});
const result = await Promise.race([next, timeout]);
clearTimeout(timer);
```

A separate half-time warning timer at `DEFAULT_STREAM_IDLE_WARNING_MS = 45_000` fires `onHalfTimeWarning` once per stream, so the UI can show a "server slow…" indicator before the full timeout.

## Consequences

**Positive**

- Works for any iterable, regardless of whether the SDK supports `AbortSignal`. The Ollama and LMStudio SDKs both lack proper abort propagation.
- Setup cost per chunk is one `setTimeout` and one `Promise` — both cheap. `AbortController` would allocate the same plus the controller object.
- The half-time warning hook is trivial to add as a second `setTimeout`; with `AbortController` we would need a separate timer regardless.

**Negative**

- The underlying request is not actually aborted by the watchdog. The hung socket continues to consume a TCP slot until kernel-level cleanup. In the pathological case of a hang every chunk, sockets accumulate. Mitigation: the chat layer wraps the entire stream in an outer `AbortController` keyed to the user's session, so cancellation paths still exist; the watchdog is for the "stream stops mid-flight" case where the outer controller has not been signalled.
- `clearTimeout` happens after `await`, so on a quick chunk arrival the timer fires once before `clearTimeout` runs. This is harmless because the rejected promise is already won by `next`. Documented in `watchdog.ts`.
- Multiple watchdog instances on the same stream would add multiple timers per chunk. Convention: wrap each stream once.

## References

- `docs/architecture/foundation-2026.md` §5.4.
- `packages/llm-runtime/src/watchdog.ts:1-191`.
- `tasks/research/deep/m8-services-api.md` §1.2 phase 5 (`STREAM_IDLE_TIMEOUT_MS = 90s`).

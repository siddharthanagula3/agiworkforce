/**
 * Hermes-compatible polyfill for AbortSignal.any().
 * Hermes (React Native's JS engine) does not support AbortSignal.any(),
 * so we create a new AbortController whose signal aborts when ANY of the
 * input signals abort.
 */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true },
    );
  }

  return controller.signal;
}

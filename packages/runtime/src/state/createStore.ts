/**
 * createStore — 34-LOC hand-rolled store, ported from Anthropic reference architecture.
 *
 * Design invariants (see tasks/research/deep/misc1-skills-tasks-state-memdir.md §8.1):
 *  - Object.is short-circuit: setState is a no-op when next === prev, preventing
 *    render storms on per-keystroke mutations.
 *  - onChange fires BEFORE listeners so React re-renders see already-settled side effects.
 *  - subscribe returns an unsubscribe fn compatible with useSyncExternalStore (React 19).
 *  - Circular re-entrancy guard: onChangeAppState passes a depth counter through the
 *    fan-out chain; createStore itself doesn't need to track depth.
 *
 * Reference: state/store.ts:10-34 from ~/Desktop/reference/src/.
 */

/** Minimal listener type: no arguments, called after every state mutation. */
export type Listener = () => void;

/** Called synchronously before listeners whenever state actually changes. */
export type OnChange<T> = (args: { newState: T; oldState: T }) => void;

/** Public interface returned by createStore. */
export interface Store<T> {
  /** Returns the current snapshot. Stable reference between mutations. */
  getState: () => T;
  /**
   * Apply an updater function. If the result Object.is-equals the current
   * state the call is a no-op (no onChange, no listener notifications).
   */
  setState: (updater: (prev: T) => T) => void;
  /**
   * Register a listener. Returns a cleanup fn (compatible with
   * useSyncExternalStore's second argument).
   */
  subscribe: (listener: Listener) => () => void;
}

/**
 * Create a minimal reactive store.
 *
 * @param initialState — Initial state snapshot (must be immutable after passing in).
 * @param onChange     — Optional side-effect hook; called synchronously before
 *                       React re-renders so effects see settled state.
 */
export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState: (updater: (prev: T) => T) => {
      const prev = state;
      const next = updater(prev);
      if (Object.is(next, prev)) return; // Object.is short-circuit — no render storm
      state = next;
      onChange?.({ newState: next, oldState: prev }); // side effects before React
      for (const listener of listeners) listener();
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

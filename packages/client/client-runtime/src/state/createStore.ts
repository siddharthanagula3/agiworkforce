
export type Listener = () => void;

export type OnChange<T> = (args: { newState: T; oldState: T }) => void;

export interface Store<T> {
  getState: () => T;
  setState: (updater: (prev: T) => T) => void;
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
      if (Object.is(next, prev)) return;
      state = next;
      onChange?.({ newState: next, oldState: prev });
      for (const listener of listeners) listener();
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

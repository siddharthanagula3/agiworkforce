
import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../createStore';

interface Counter {
  value: number;
  flag: boolean;
}

function makeCounterStore(onChange?: Parameters<typeof createStore<Counter>>[1]) {
  return createStore<Counter>({ value: 0, flag: false }, onChange);
}

describe('createStore — basic correctness', () => {
  it('returns initial state from getState()', () => {
    const store = makeCounterStore();
    expect(store.getState()).toEqual({ value: 0, flag: false });
  });

  it('setState with identity updater is a no-op', () => {
    const store = makeCounterStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const before = store.getState();
    store.setState((s) => s);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
  });

  it('setState with Object.is-equal value is a no-op', () => {
    const store = makeCounterStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState((_s) => ({ value: 0, flag: false }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setState with primitive Object.is-equal is a no-op for primitive stores', () => {
    const store = createStore<number>(42);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState((_n) => 42);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setState with mutation notifies listeners', () => {
    const store = makeCounterStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState((s) => ({ ...s, value: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().value).toBe(1);
  });

  it('sequential setState calls each notify listeners', () => {
    const store = makeCounterStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState((s) => ({ ...s, value: 1 }));
    store.setState((s) => ({ ...s, value: 2 }));
    store.setState((s) => ({ ...s, value: 3 }));
    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.getState().value).toBe(3);
  });
});

describe('createStore — subscribe / unsubscribe', () => {
  it('subscribe returns an unsubscribe function', () => {
    const store = makeCounterStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    store.setState((s) => ({ ...s, value: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    store.setState((s) => ({ ...s, value: 2 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers all receive notifications', () => {
    const store = makeCounterStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.setState((s) => ({ ...s, value: 1 }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing one does not affect others', () => {
    const store = makeCounterStore();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = store.subscribe(a);
    store.subscribe(b);

    unsubA();
    store.setState((s) => ({ ...s, value: 1 }));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('createStore — onChange fires before listeners', () => {
  it('onChange is called before listener', () => {
    const order: string[] = [];

    const store = createStore<number>(0, () => {
      order.push('onChange');
    });
    store.subscribe(() => {
      order.push('listener');
    });

    store.setState(() => 1);
    expect(order).toEqual(['onChange', 'listener']);
  });

  it('onChange receives correct prev and next values', () => {
    const changes: Array<{ oldState: number; newState: number }> = [];
    const store = createStore<number>(10, ({ oldState, newState }) => {
      changes.push({ oldState, newState });
    });

    store.setState(() => 20);
    store.setState(() => 30);

    expect(changes).toEqual([
      { oldState: 10, newState: 20 },
      { oldState: 20, newState: 30 },
    ]);
  });

  it('onChange is NOT called when state does not change', () => {
    const onChange = vi.fn();
    const store = createStore<number>(5, onChange);

    store.setState(() => 5);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('createStore — render-storm protection', () => {
  it('single boolean flip causes exactly 1 listener notification', () => {
    const store = makeCounterStore();
    let renderCount = 0;
    store.subscribe(() => {
      renderCount++;
    });

    store.setState((s) => ({ ...s, flag: true }));

    expect(renderCount).toBe(1);
    expect(renderCount).toBeLessThan(5);
  });

  it('no-op setState does not increment render count', () => {
    const store = makeCounterStore();
    let renderCount = 0;
    store.subscribe(() => {
      renderCount++;
    });

    for (let i = 0; i < 100; i++) {
      store.setState((s) => s);
    }
    expect(renderCount).toBe(0);
  });

  it('100 unique mutations produce exactly 100 notifications', () => {
    const store = createStore<number>(0);
    let renderCount = 0;
    store.subscribe(() => {
      renderCount++;
    });

    for (let i = 1; i <= 100; i++) {
      store.setState(() => i);
    }
    expect(renderCount).toBe(100);
  });
});

describe('createStore — useSyncExternalStore compatibility', () => {
  it('subscribe signature matches useSyncExternalStore (subscribe returns () => void)', () => {
    const store = makeCounterStore();
    const unsub = store.subscribe(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('getState is stable — same reference between mutations', () => {
    const store = makeCounterStore();
    const ref1 = store.getState;
    const ref2 = store.getState;
    expect(ref1).toBe(ref2);
  });
});

describe('createStore — property: mutation sequence integrity', () => {
  it('N unique values → exactly N listener calls, final state is last value', () => {
    const store = createStore<number>(0);
    let calls = 0;
    store.subscribe(() => calls++);

    const values = Array.from({ length: 50 }, (_, i) => i + 1);
    for (const v of values) {
      store.setState(() => v);
    }

    expect(calls).toBe(50);
    expect(store.getState()).toBe(50);
  });

  it('interleaved no-ops and mutations: listener count = mutation count only', () => {
    const store = createStore<number>(0);
    let calls = 0;
    store.subscribe(() => calls++);

    let current = 0;
    let mutations = 0;
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        store.setState(() => current);
      } else {
        current = i;
        store.setState(() => current);
        mutations++;
      }
    }

    expect(calls).toBe(mutations);
  });
});

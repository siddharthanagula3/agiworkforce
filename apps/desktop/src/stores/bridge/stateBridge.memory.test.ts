import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  current: {
    memory: { totalEntries: 0, avgImportance: 0, decayEnabled: false },
  } as { memory: { totalEntries: number; avgImportance: number; decayEnabled: boolean } },
};

const appStateStore = {
  getState: () => state.current,
  setState: (updater: (prev: typeof state.current) => typeof state.current) => {
    state.current = updater(state.current);
  },
};

const memorySubscribers: Array<(s: { memories: Array<{ importance: number }> }) => void> = [];
const memoryState = { memories: [] as Array<{ importance: number }> };

const getDecayConfig = vi.fn();

vi.mock('@agiworkforce/client-runtime', () => ({
  appStateStore,
}));

vi.mock('../../api/memory', () => ({
  getDecayConfig: () => getDecayConfig(),
}));

vi.mock('../memoryStore', () => ({
  useMemoryStore: {
    subscribe: (fn: (s: typeof memoryState) => void) => {
      memorySubscribers.push(fn);
      return () => {
        const i = memorySubscribers.indexOf(fn);
        if (i >= 0) memorySubscribers.splice(i, 1);
      };
    },
    getState: () => memoryState,
  },
}));

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('bridgeMemoryStore — decayEnabled reflects real backend config', () => {
  beforeEach(() => {
    state.current = {
      memory: { totalEntries: 0, avgImportance: 0, decayEnabled: false },
    };
    memorySubscribers.length = 0;
    memoryState.memories = [];
    getDecayConfig.mockReset();
  });

  it('sets decayEnabled=true when the backend decay config is enabled', async () => {
    getDecayConfig.mockResolvedValue({
      enabled: true,
      decay_rate: 0.1,
      decay_period_days: 30,
      min_importance: 0.1,
      access_boost: 0.2,
    });

    const { bridgeMemoryStore } = await import('./stateBridge');
    bridgeMemoryStore();
    await flush();

    expect(getDecayConfig).toHaveBeenCalledTimes(1);
    expect(appStateStore.getState().memory.decayEnabled).toBe(true);
  });

  it('leaves decayEnabled=false when the backend decay config is disabled', async () => {
    getDecayConfig.mockResolvedValue({
      enabled: false,
      decay_rate: 0.1,
      decay_period_days: 30,
      min_importance: 0.1,
      access_boost: 0.2,
    });

    const { bridgeMemoryStore } = await import('./stateBridge');
    bridgeMemoryStore();
    await flush();

    memoryState.memories = [{ importance: 0.5 }];
    memorySubscribers.forEach((fn) => fn(memoryState));

    expect(appStateStore.getState().memory.decayEnabled).toBe(false);
    expect(appStateStore.getState().memory.totalEntries).toBe(1);
  });
});

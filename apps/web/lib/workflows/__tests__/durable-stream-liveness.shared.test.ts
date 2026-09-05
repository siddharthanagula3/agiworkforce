import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({ getKeyValueStore: vi.fn<() => KeyValueStore | null>() }));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));

const SHARED_BREAKER_KEY = 'agi-durable-breaker:transport-stall';
const BREAKER_READ_INTERVAL_MS = 1_000;
const COOLDOWN_MS = 60_000;
const NOW_MS = 1_700_000_000_000;

/**
 * One module instance per import, so two of them stand in for two serverless
 * instances that only ever meet through the store.
 */
async function loadInstance() {
  vi.resetModules();
  return import('../durable-stream-liveness');
}

describe('durable breakers are shared through the key-value port', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    store = createMemoryKeyValueStore();
    mocks.getKeyValueStore.mockReturnValue(store);
  });

  it('lets one instance open the breaker for another', async () => {
    const first = await loadInstance();
    const second = await loadInstance();

    await expect(second.isDurableTransportCoolingDown(NOW_MS)).resolves.toBe(false);

    first.recordDurableTransportStall(NOW_MS);
    await expect(first.isDurableTransportCoolingDown(NOW_MS)).resolves.toBe(true);

    await expect(
      second.isDurableTransportCoolingDown(NOW_MS + BREAKER_READ_INTERVAL_MS),
    ).resolves.toBe(true);
  });

  it('lets a successful claim on one instance close the breaker on another', async () => {
    const first = await loadInstance();
    const second = await loadInstance();

    first.recordDurableTransportStall(NOW_MS);
    await expect(
      second.isDurableTransportCoolingDown(NOW_MS + BREAKER_READ_INTERVAL_MS),
    ).resolves.toBe(true);

    first.recordDurableTransportClaim();

    await expect(second.isDurableTransportCoolingDown(NOW_MS + COOLDOWN_MS - 1)).resolves.toBe(
      false,
    );
    await expect(store.get(SHARED_BREAKER_KEY)).resolves.toBeNull();
  });

  it('reads the shared breaker at most once per interval', async () => {
    const instance = await loadInstance();
    const get = vi.spyOn(store, 'get');

    await instance.isDurableTransportCoolingDown(NOW_MS);
    await instance.isDurableTransportCoolingDown(NOW_MS + BREAKER_READ_INTERVAL_MS - 1);
    expect(get).toHaveBeenCalledTimes(1);

    await instance.isDurableTransportCoolingDown(NOW_MS + BREAKER_READ_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps the local decision when no store is configured', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);
    const instance = await loadInstance();

    await expect(instance.isDurableTransportCoolingDown(NOW_MS)).resolves.toBe(false);
    instance.recordDurableTransportStall(NOW_MS);
    await expect(instance.isDurableTransportCoolingDown(NOW_MS)).resolves.toBe(true);
    await expect(instance.isDurableTransportCoolingDown(NOW_MS + COOLDOWN_MS)).resolves.toBe(false);
  });
});

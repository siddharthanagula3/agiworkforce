import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStored: vi.fn(),
  save: vi.fn(async () => ({ version: null })),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: mocks.fetchStored,
  savePreferenceNamespace: mocks.save,
}));

const SERVER_STYLE = {
  id: 'server-style',
  name: 'From another device',
  instruction: 'Write plainly.',
  sampleText: '',
  createdAt: '2026-10-01T00:00:00.000Z',
};

async function freshStore() {
  vi.resetModules();
  const styleStore = await import('./style-store');
  styleStore.useStyleStore.setState({ customStyles: [] });
  return styleStore.useStyleStore;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchStored.mockReset();
  mocks.save.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('account style writes wait for the account copy', () => {
  it('keeps a change local while the account copy could not be read', async () => {
    mocks.fetchStored.mockRejectedValue(new Error('offline'));
    const store = await freshStore();

    await store.getState().hydrateFromServer();
    store.getState().addCustomStyle('Mine', 'Be brief.', '');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.save).not.toHaveBeenCalled();
    expect(store.getState().customStyles.map((style) => style.name)).toEqual(['Mine']);
  });

  it('merges the held change into the account copy once it is read, then saves both', async () => {
    mocks.fetchStored.mockRejectedValueOnce(new Error('offline'));
    const store = await freshStore();

    await store.getState().hydrateFromServer();
    store.getState().addCustomStyle('Mine', 'Be brief.', '');
    mocks.fetchStored.mockResolvedValueOnce({ customStyles: [SERVER_STYLE] });
    await store.getState().hydrateFromServer();
    await vi.advanceTimersByTimeAsync(1_000);

    const names = store.getState().customStyles.map((style) => style.name);
    expect(names).toEqual(['From another device', 'Mine']);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(
      'response-style',
      expect.objectContaining({
        customStyles: expect.arrayContaining([expect.objectContaining({ id: 'server-style' })]),
      }),
    );
  });

  it('saves straight away once the account copy has been read', async () => {
    mocks.fetchStored.mockResolvedValue({ customStyles: [] });
    const store = await freshStore();

    await store.getState().hydrateFromServer();
    store.getState().addCustomStyle('Mine', 'Be brief.', '');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf') }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import { invalidateModelFavouritesCache, useModelFavourites } from './use-model-favourites';

function response(ids: string[]) {
  return {
    ok: true,
    json: async () => ({ settings: { favouriteModelIds: ids } }),
  };
}

describe('model favourites cache isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateModelFavouritesCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the next account after central cleanup instead of reusing the previous promise', async () => {
    let releaseFirst!: (value: unknown) => void;
    const firstBody = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => firstBody })
      .mockResolvedValueOnce(response(['second-account-model']));
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => useModelFavourites());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    invalidateModelFavouritesCache();
    localStorage.removeItem('agi-model-picker-favourites');
    releaseFirst({ settings: { favouriteModelIds: ['first-account-model'] } });
    await waitFor(() => expect(first.result.current.favouriteModelIds).toEqual([]));
    expect(localStorage.getItem('agi-model-picker-favourites')).toBeNull();
    first.unmount();

    const second = renderHook(() => useModelFavourites());
    await waitFor(() =>
      expect(second.result.current.favouriteModelIds).toEqual(['second-account-model']),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('puts a toggle back and says so when the server does not save it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(['kept-model']))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useModelFavourites());
    await waitFor(() => expect(result.current.favouriteModelIds).toEqual(['kept-model']));

    act(() => result.current.toggleFavourite('new-model'));
    expect(result.current.favouriteModelIds).toEqual(['kept-model', 'new-model']);

    await waitFor(() => expect(result.current.favouriteModelIds).toEqual(['kept-model']));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('agi-model-picker-favourites')).toBe('["kept-model"]');
  });
});

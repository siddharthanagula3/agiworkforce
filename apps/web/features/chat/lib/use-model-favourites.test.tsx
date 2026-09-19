import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf') }));

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
});

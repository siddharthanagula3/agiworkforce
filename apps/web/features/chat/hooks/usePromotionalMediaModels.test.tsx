import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FreeQuotaCatalogue } from '@agiworkforce/cloud-contracts';
import { usePromotionalMediaModels } from './use-promotional-media-models';

function catalogue(patch: Partial<FreeQuotaCatalogue> = {}): FreeQuotaCatalogue {
  const base = {
    providerModelId: 'fixture',
    limit: 100,
    consumedApproximate: 0,
    status: 'ready' as const,
  };
  return {
    issuer: 'Fixture Cloud',
    observedOn: '2026-09-19',
    evidenceUrl: 'https://provider.example/free-quota',
    reportedEligible: 5,
    reportedUnavailable: 0,
    models: [
      {
        ...base,
        key: 'chat',
        displayName: 'Chat',
        category: 'chat',
        unit: 'tokens',
        expiresOn: null,
      },
      {
        ...base,
        key: 'image-late',
        displayName: 'Image late',
        category: 'image',
        unit: 'images',
        expiresOn: '2026-11-26',
      },
      {
        ...base,
        key: 'image-early',
        displayName: 'Image early',
        category: 'image',
        unit: 'images',
        expiresOn: '2026-10-21',
      },
      {
        ...base,
        key: 'image-spent',
        displayName: 'Image spent',
        category: 'image',
        unit: 'images',
        expiresOn: '2026-12-01',
        status: 'exhausted',
      },
      {
        ...base,
        key: 'video',
        displayName: 'Video',
        category: 'video',
        unit: 'seconds',
        expiresOn: '2026-11-05',
      },
    ],
    mediaUseOrder: ['image-early', 'video', 'image-late'],
    ...patch,
  };
}

function answer(body: unknown, status = 200) {
  return vi.fn(async () => Response.json(body, { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePromotionalMediaModels', () => {
  it('asks nothing while it is not wanted, then reads the account catalogue once it is', async () => {
    const fetchMock = answer(catalogue());
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ enabled }) => usePromotionalMediaModels(enabled), {
      initialProps: { enabled: false },
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.models).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lists ready image and video offerings in the order the server wants them used', async () => {
    vi.stubGlobal('fetch', answer(catalogue()));
    const { result } = renderHook(() => usePromotionalMediaModels(true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.models.map((model) => model.key)).toEqual([
      'image-early',
      'video',
      'image-late',
    ]);
    expect(result.current.issuer).toBe('Fixture Cloud');
  });

  it.each([401, 403, 404])(
    'keeps HTTP %s unknown instead of claiming the offer ended',
    async (status) => {
      vi.stubGlobal('fetch', answer({ error: 'not offered' }, status));
      const { result } = renderHook(() => usePromotionalMediaModels(true));

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.models).toEqual([]);
      expect(result.current.availability).toEqual({ image: 'unknown', video: 'unknown' });
    },
  );

  it('reports a failed check and reads the catalogue again on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json(catalogue()));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePromotionalMediaModels(true));

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.models.length).toBeGreaterThan(0);
  });
  it('hides old account models immediately and ignores its late response', async () => {
    let finishOld!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce(Response.json(catalogue({ issuer: 'New account' })));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ account }) => usePromotionalMediaModels(true, account),
      { initialProps: { account: 'old' } },
    );
    rerender({ account: 'new' });
    expect(result.current.models).toEqual([]);
    await waitFor(() => expect(result.current.issuer).toBe('New account'));
    await act(async () => { finishOld(Response.json(catalogue({ issuer: 'Old account' }))); });
    expect(result.current.issuer).toBe('New account');
  });

  it('hides settled models while refreshing rather than offering stale choices', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(catalogue()))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePromotionalMediaModels(true, 'account'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.refresh());
    expect(result.current.status).toBe('loading');
    expect(result.current.models).toEqual([]);
    expect(result.current.availability.image).toBe('unknown');
  });

});

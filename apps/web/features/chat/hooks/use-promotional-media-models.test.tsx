import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FreeQuotaCatalogue } from '@agiworkforce/cloud-contracts';
import { usePromotionalMediaModels } from './use-promotional-media-models';

const RESETS_AT = '2026-10-05T00:00:00.000Z';

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
    limitedOffer: [{ category: 'image', dailyCap: 5, remainingToday: 3, resetsAt: RESETS_AT }],
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

  it('reports the limited offer per kind, with the last day a ready offering serves and the daily terms', async () => {
    vi.stubGlobal('fetch', answer(catalogue()));
    const { result } = renderHook(() => usePromotionalMediaModels(true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.limited).toEqual({
      image: { lastDay: '2026-11-25', dailyCap: 5, remainingToday: 3, resetsAt: RESETS_AT },
      video: null,
    });
  });

  it('reports no limited offer once nothing of that kind is ready', async () => {
    const spent = catalogue();
    vi.stubGlobal(
      'fetch',
      answer({
        ...spent,
        models: spent.models.map((model) =>
          model.category === 'image' ? { ...model, status: 'exhausted' } : model,
        ),
      }),
    );
    const { result } = renderHook(() => usePromotionalMediaModels(true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.limited.image).toBeNull();
  });

  it.each([401, 403, 404])(
    'treats HTTP %s as a plan that is offered no free media, not as a failure',
    async (status) => {
      vi.stubGlobal('fetch', answer({ error: 'not offered' }, status));
      const { result } = renderHook(() => usePromotionalMediaModels(true));

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.models).toEqual([]);
      expect(result.current.limited).toEqual({ image: null, video: null });
    },
  );

  it('reports a failed check, and refreshes without dropping what it already has', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json(catalogue()))
      .mockResolvedValueOnce(
        Response.json(
          catalogue({
            limitedOffer: [
              { category: 'image', dailyCap: 5, remainingToday: 0, resetsAt: RESETS_AT },
            ],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePromotionalMediaModels(true));

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.limited.image?.remainingToday).toBe(3);

    act(() => result.current.refresh());
    expect(result.current.status).toBe('ready');
    expect(result.current.models.length).toBeGreaterThan(0);
    await waitFor(() => expect(result.current.limited.image?.remainingToday).toBe(0));
  });
});

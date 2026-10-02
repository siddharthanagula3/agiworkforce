import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FREE_QUOTA_CATALOGUE_PATH } from '@agiworkforce/cloud-contracts';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import { useFreeModelSources } from './use-free-model-sources';

const CATALOGUE: FreeQuotaCatalogue = {
  issuer: 'Fixture Cloud',
  observedOn: '2026-10-01',
  evidenceUrl: 'https://provider.example/free',
  reportedEligible: 0,
  reportedUnavailable: 0,
  models: [],
};

function respond(status: number, body: unknown = null): Response {
  return new Response(JSON.stringify(body), { status });
}

function pending(): Promise<Response> {
  return new Promise<Response>(() => undefined);
}

afterEach(() => vi.unstubAllGlobals());

describe('useFreeModelSources', () => {
  it('loads each source on its own and hides one the account is not offered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === FREE_QUOTA_CATALOGUE_PATH ? respond(200, CATALOGUE) : respond(403),
      ),
    );
    const { result } = renderHook(() => useFreeModelSources(true));

    expect(result.current.quota.status).toBe('loading');
    await waitFor(() => expect(result.current.quota.status).toBe('ready'));
    expect(result.current.quota.catalogue).toEqual(CATALOGUE);
    await waitFor(() => expect(result.current.experiential.status).toBe('hidden'));
  });

  it('does not fetch while the picker is closed', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    renderHook(() => useFreeModelSources(false));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not let a slow source hold back the other', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === FREE_QUOTA_CATALOGUE_PATH ? pending() : Promise.resolve(respond(200, CATALOGUE)),
      ),
    );
    const { result } = renderHook(() => useFreeModelSources(true));

    await waitFor(() => expect(result.current.experiential.status).toBe('ready'));
    expect(result.current.quota.status).toBe('loading');
  });

  it('reports a failure and loads again on retry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(respond(500))
      .mockResolvedValue(respond(200, CATALOGUE));
    vi.stubGlobal('fetch', (url: string) =>
      url === FREE_QUOTA_CATALOGUE_PATH ? fetcher() : Promise.resolve(respond(404)),
    );
    const { result } = renderHook(() => useFreeModelSources(true));

    await waitFor(() => expect(result.current.quota.status).toBe('error'));
    act(() => result.current.quota.retry());
    await waitFor(() => expect(result.current.quota.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the last result on screen while a reopened picker refreshes it', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(respond(200, CATALOGUE))
      .mockImplementation(pending);
    vi.stubGlobal('fetch', (url: string) =>
      url === FREE_QUOTA_CATALOGUE_PATH ? fetcher() : Promise.resolve(respond(404)),
    );
    const { result, rerender } = renderHook(({ open }) => useFreeModelSources(open), {
      initialProps: { open: true },
    });
    await waitFor(() => expect(result.current.quota.status).toBe('ready'));

    rerender({ open: false });
    rerender({ open: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.quota.status).toBe('ready');
    expect(result.current.quota.catalogue).toEqual(CATALOGUE);
  });
});

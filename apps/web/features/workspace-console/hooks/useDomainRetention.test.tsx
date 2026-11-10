import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DomainRetentionPolicy } from '@agiworkforce/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSaveDomainRetention } from './use-domain-retention';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'test-token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { ...renderHook(() => useSaveDomainRetention(), { wrapper: Wrapper }), client };
}

describe('saving domain retention', () => {
  it.each([null, '2026-11-01T00:00:00.000Z'])(
    'sends only the fields the PUT schema accepts when updatedAt is %s',
    async (updatedAt) => {
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(
            JSON.stringify({ organizationId: 'org', canManageRetention: true, policies: [] }),
            { status: 200 },
          ),
      );
      vi.stubGlobal('fetch', fetchMock);
      const policy: DomainRetentionPolicy = {
        domain: 'notifications',
        retentionDays: 30,
        enforced: true,
        updatedAt,
      };
      const { result, client } = setup();
      await act(async () => {
        await result.current.mutateAsync([policy]);
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const init = fetchMock.mock.calls[0]?.[1];
      expect(JSON.parse(String(init?.body))).toEqual({
        policies: [{ domain: 'notifications', retentionDays: 30, enforced: true }],
      });
      client.clear();
    },
  );
});

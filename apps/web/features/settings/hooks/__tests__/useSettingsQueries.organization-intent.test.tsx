import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useUpdateOrganizationSettings } from '../use-settings-queries';
import { getCsrfToken } from '@/lib/client/csrf';

const ORG = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

function harness() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useUpdateOrganizationSettings(), { wrapper }), client };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('organization settings mutation intent', () => {
  it('sends the supplied workspace with the exact settings update', async () => {
    fetchMock.mockImplementation(async () => new Response(
      JSON.stringify({ organization: { id: ORG, name: 'Research', slug: 'research' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const { result, client } = harness();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    act(() => result.current.mutate({ organizationId: ORG, updates: { name: 'Research' } }));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/settings/organization');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(ORG);
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Research' });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['settings', 'organization'] });
  });

  it('retains the invocation target while CSRF acquisition is pending', async () => {
    let releaseCsrf!: (token: string) => void;
    vi.mocked(getCsrfToken).mockReturnValueOnce(new Promise((resolve) => {
      releaseCsrf = resolve;
    }));
    fetchMock.mockImplementation(async () => new Response('Unavailable', { status: 503 }));
    const { result, rerender } = harness();

    act(() => result.current.mutate({ organizationId: ORG, updates: { name: 'Research' } }));
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    rerender();
    await act(async () => releaseCsrf('csrf-token'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(ORG);
  });

  it.each(['transport', 'server response', 'unreadable receipt'] as const)(
    'does not resend after an uncertain %s failure',
    async (failure) => {
      if (failure === 'transport') {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      } else if (failure === 'server response') {
        fetchMock.mockImplementation(async () => new Response('Unavailable', { status: 503 }));
      } else {
        fetchMock.mockImplementation(async () => new Response('{', { status: 200 }));
      }
      const { result } = harness();

      act(() => result.current.mutate({ organizationId: ORG, updates: { slug: 'research' } }));

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(ORG);
      expect(JSON.parse(String(init.body))).toEqual({ slug: 'research' });
      expect(toastMock.error).toHaveBeenCalledTimes(1);
      expect(toastMock.success).not.toHaveBeenCalled();
    },
  );
});

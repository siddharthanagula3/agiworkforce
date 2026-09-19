import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceUsage } from './use-workspace-usage';
import { getAuthToken } from '@shared/lib/get-auth-token';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'test-token') }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(getAuthToken).mockResolvedValue('test-token');
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { ...renderHook(() => useWorkspaceUsage(30), { wrapper: Wrapper }), client };
}

describe('workspace usage errors', () => {
  it.each([
    [401, 'Your session has expired. Sign in again to continue.'],
    [429, 'You are going a little fast. Wait a moment and try again.'],
    [500, 'Something went wrong on our side. Try again shortly.'],
  ])('keeps status %s out of user copy', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>upstream</html>', { status })),
    );
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ message, status });
    client.clear();
  });
  it('explains an expired session without sending a request', async () => {
    vi.mocked(getAuthToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Your session has expired. Sign in again to continue.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    client.clear();
  });
  it('preserves the permission-specific empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 })),
    );
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    client.clear();
  });
});

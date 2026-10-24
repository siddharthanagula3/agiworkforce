import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSelectWorkspace } from './use-workspaces';

const finalizeWorkspaceSwitch = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/features/workspaces/lib/workspace-cache-scope', () => ({
  finalizeWorkspaceSwitch,
}));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'test-token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

afterEach(() => vi.unstubAllGlobals());

describe('workspace selection errors', () => {
  it.each([
    [400, '<html>bad request</html>', 'We could not switch workspaces. Try again.'],
    [401, '{}', 'Your session has expired. Sign in again to continue.'],
    [503, '<html>unavailable</html>', 'Something went wrong on our side. Try again shortly.'],
    [
      400,
      JSON.stringify({ error: { message: 'Choose a workspace you belong to.' } }),
      'Choose a workspace you belong to.',
    ],
    [
      500,
      JSON.stringify({ error: 'SELECT secret FROM internal' }),
      'Something went wrong on our side. Try again shortly.',
    ],
  ])('normalizes status %s without exposing transport details', async (status, body, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status })),
    );
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData(['workspace', 'usage-analytics', 30], { cents: 4200 });
    function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = renderHook(() => useSelectWorkspace(), { wrapper: Wrapper });
    let failure: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync(null);
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toMatchObject({ message, status });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(['workspaces'])).toBeUndefined();
    expect(client.getQueryData(['workspace', 'usage-analytics', 30])).toEqual({ cents: 4200 });
    expect(finalizeWorkspaceSwitch).not.toHaveBeenCalled();
    client.clear();
  });

  it.each([
    ['organization', '11111111-1111-4111-8111-111111111111'],
    ['personal', null],
  ])('purges the previous %s scope after the server commits the switch', async (_scope, id) => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ activeOrganizationId: id }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = renderHook(() => useSelectWorkspace(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(id);
    });

    expect(finalizeWorkspaceSwitch).toHaveBeenCalledWith(client, id);
    client.clear();
  });
});

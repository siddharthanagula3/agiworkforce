import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  type Query,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_WORKSPACES_PATH,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import { observeWorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';
import { useWebhookDeliveries } from '../hooks/use-developer-webhooks';
import type { DeveloperWebhookDelivery } from '../types';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: {
      id: 'session-a',
      user: { id: 'a' },
      getToken: async (): Promise<string | null> => 'token-a',
    },
  },
  polls: [] as Array<{ gate: (query: Query) => number | false | undefined; query: Query }>,
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule0>();
  return {
    ...actual,
    useQuery: (options: UseQueryOptions, client?: QueryClient) => {
      const gate = options.refetchInterval;
      if (
        options.queryKey[0] !== 'developers' ||
        options.queryKey[3] !== 'deliveries' ||
        typeof gate !== 'function'
      )
        return actual.useQuery(options, client);
      return actual.useQuery(
        {
          ...options,
          refetchInterval: (query) => {
            fixture.polls.push({ gate, query });
            return gate(query);
          },
        },
        client,
      );
    },
  };
});

const personal: ManagedCloudAccountWorkspaces = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const deliveryPrefix = ['developers', 'webhooks'] as const;
const deliveryPath = (endpointId: string) =>
  `/api/developers/webhooks/${encodeURIComponent(endpointId)}/deliveries`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deliveries(
  id: string,
  status: DeveloperWebhookDelivery['status'] = 'delivered',
  attempts = 1,
): DeveloperWebhookDelivery[] {
  return [
    {
      id,
      eventId: id,
      eventType: 'test',
      status,
      attempts,
      responseStatus: null,
      error: null,
      redeliveryOf: null,
      lastAttemptAt: null,
      deliveredAt: null,
      createdAt: '2026-10-20T00:00:00.000Z',
    },
  ];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function changeIdentity(userId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId: `session-${userId}` };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: `session-${userId}`,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
}
const fetchMock = vi.fn<typeof fetch>();
const reads = () =>
  fetchMock.mock.calls.filter(([path]) => String(path).startsWith('/api/developers/webhooks/'));
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
function useHarness({ endpointId, enabled }: { endpointId: string; enabled: boolean }) {
  return useWebhookDeliveries(endpointId, enabled);
}
const initialProps = { endpointId: 'endpoint-a', enabled: true };
function expectMasked(query: ReturnType<typeof useWebhookDeliveries>) {
  expect(query).toMatchObject({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isFetching: false,
    isSuccess: false,
  });
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  changeIdentity('a');
  fixture.polls = [];
  client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
    },
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (path) => {
    if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
    if (String(path) === deliveryPath('endpoint-a')) return json({ deliveries: deliveries('a') });
    if (String(path) === deliveryPath('endpoint-b')) return json({ deliveries: deliveries('b') });
    throw new Error(`Unexpected network request: ${String(path)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe('webhook delivery read gates', () => {
  it.each([
    { endpointId: 'endpoint-a', enabled: false },
    { endpointId: '', enabled: true },
    { endpointId: '   ', enabled: true },
  ])('keeps $endpointId enabled=$enabled masked and rejects manual refetch', async (props) => {
    const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
    await waitFor(() => expect(admission.result.current.data).toBeDefined());
    const { result } = renderHook(useHarness, { initialProps: props, wrapper });
    expectMasked(result.current);
    await act(async () => result.current.refetch());
    expect(reads()).toHaveLength(0);
    expect(fixture.polls.length).toBeGreaterThan(0);
    for (const { gate, query } of fixture.polls) expect(gate(query)).toBe(false);
  });

  it('retires enabled and disabled callbacks across true to false to true', async () => {
    const { result, rerender } = renderHook(useHarness, { initialProps, wrapper });
    await waitFor(() => expect(result.current.data).toEqual(deliveries('a')));
    const original = result.current.refetch;
    rerender({ ...initialProps, enabled: false });
    expectMasked(result.current);
    const disabled = result.current.refetch;
    await act(async () => {
      await original();
      await disabled();
    });
    expect(reads()).toHaveLength(1);
    rerender(initialProps);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const count = reads().length;
    await act(async () => {
      await original();
      await disabled();
    });
    expect(reads()).toHaveLength(count);
    await act(async () => result.current.refetch());
    expect(reads()).toHaveLength(count + 1);
  });

  it('does not revive retained endpoint callbacks after A to B to A', async () => {
    const { result, rerender } = renderHook(useHarness, { initialProps, wrapper });
    await waitFor(() => expect(result.current.data).toEqual(deliveries('a')));
    const fromA = result.current.refetch;
    rerender({ ...initialProps, endpointId: 'endpoint-b' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(deliveries('b')));
    const fromB = result.current.refetch;
    await act(async () => fromA());
    expect(reads()).toHaveLength(2);
    rerender(initialProps);
    await waitFor(() => expect(result.current.data).toEqual(deliveries('a')));
    const count = reads().length;
    await act(async () => {
      await fromA();
      await fromB();
    });
    expect(reads()).toHaveLength(count);
    await act(async () => result.current.refetch());
    expect(reads()).toHaveLength(count + 1);
    expect(reads()[reads().length - 1]?.[0]).toBe(deliveryPath('endpoint-a'));
  });

  it('masks cached errors and data while disabled', async () => {
    const { result, rerender } = renderHook(useHarness, { initialProps, wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    fetchMock.mockResolvedValueOnce(json({ error: 'Temporary failure' }, 503));
    await act(async () => result.current.refetch());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual(deliveries('a'));
    rerender({ ...initialProps, enabled: false });
    expectMasked(result.current);
    await act(async () => result.current.refetch());
    expect(reads()).toHaveLength(2);
  });

  it('keeps a shared in-flight request alive when its first observer disables', async () => {
    const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
    await waitFor(() => expect(admission.result.current.data).toBeDefined());
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const first = renderHook(useHarness, { initialProps, wrapper });
    await waitFor(() => expect(reads()).toHaveLength(1));
    const second = renderHook(useHarness, { initialProps, wrapper });
    const signal = reads()[0]![1]?.signal;
    const stale = first.result.current.refetch;
    first.rerender({ ...initialProps, enabled: false });
    expectMasked(first.result.current);
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      await stale();
      await first.result.current.refetch();
    });
    expect(reads()).toHaveLength(1);
    await act(async () => response.resolve(json({ deliveries: deliveries('shared') })));
    await waitFor(() => expect(second.result.current.data).toEqual(deliveries('shared')));
    expectMasked(first.result.current);
    expect(second.result.current.error).toBeNull();
    expect(reads()).toHaveLength(1);
  });

  it('selects the polling interval only for pending first attempts and closes a captured gate after owner retirement', async () => {
    const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
    await waitFor(() => expect(admission.result.current.data).toBeDefined());
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const { result, rerender } = renderHook(useHarness, { initialProps, wrapper });
    await waitFor(() => expect(reads()).toHaveLength(1));
    const beforeData = fixture.polls[fixture.polls.length - 1]!;
    expect(beforeData.query.state.data).toBeUndefined();
    expect(beforeData.gate(beforeData.query)).toBe(false);
    await act(async () => response.resolve(json({ deliveries: deliveries('a') })));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const captured = [...fixture.polls]
      .reverse()
      .find(({ query }) => query.state.data !== undefined)!;
    expect(captured).toBeDefined();
    for (const [data, expected] of [
      [[], false],
      [deliveries('pending', 'pending', 0), 3000],
      [deliveries('retried', 'pending', 1), false],
      [deliveries('failed', 'failed', 0), false],
      [deliveries('delivered', 'delivered', 0), false],
      [[...deliveries('done'), ...deliveries('pending', 'pending', 0)], 3000],
    ] as const) {
      act(() => client.setQueryData(captured.query.queryKey, data));
      expect(captured.gate(captured.query)).toBe(expected);
    }
    changeIdentity('b');
    expect(captured.gate(captured.query)).toBe(false);
    act(() => rerender(initialProps));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured.gate(captured.query)).toBe(false);
    expect(client.getQueryCache().findAll({ queryKey: deliveryPrefix }).length).toBeGreaterThan(1);
  });
});

type ImportedModule0 = typeof import('@tanstack/react-query');

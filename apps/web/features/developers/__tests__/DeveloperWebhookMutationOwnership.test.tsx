import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { getCsrfToken } from '@/lib/client/csrf';
import type { DeveloperWebhookDelivery, DeveloperWebhookEndpoint } from '../types';
import {
  useCreateWebhookEndpoint,
  useUpdateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useSendWebhookTest,
  useRedeliverWebhook,
  WebhookMutationRejectedError,
  type WebhookEndpointDraft,
  type WebhookMutationScope,
} from '../hooks/use-developer-webhooks';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf') }));

const endpoint: DeveloperWebhookEndpoint = {
  id: 'endpoint/a',
  url: 'https://example.com/webhook',
  description: null,
  eventTypes: ['test.event'],
  secretPrefix: 'fixture',
  enabled: true,
  createdAt: '2026-11-06T00:00:00.000Z',
};
const delivery: DeveloperWebhookDelivery = {
  id: 'delivery-new',
  eventId: 'event-a',
  eventType: 'test.event',
  status: 'pending',
  attempts: 0,
  responseStatus: null,
  error: null,
  redeliveryOf: null,
  lastAttemptAt: null,
  deliveredAt: null,
  createdAt: endpoint.createdAt,
};
const deliveryId = 'delivery/original';
const secret = 'fixture-once-only-secret';
const endpointPath = `/api/developers/webhooks/${encodeURIComponent(endpoint.id)}`;
const endpointKey = ['developers', 'webhooks'];
const deliveryKey = [...endpointKey, endpoint.id, 'deliveries'];
const draft = (): WebhookEndpointDraft => ({
  url: endpoint.url,
  description: endpoint.description,
  eventTypes: [...endpoint.eventTypes],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const operations: Array<{
  name: string;
  method: string;
  path: string;
  key: string[];
  payload: unknown;
  receipt: unknown;
  useRun: () => (scope: WebhookMutationScope) => Promise<unknown>;
}> = [
  {
    name: 'create',
    method: 'POST',
    path: '/api/developers/webhooks',
    key: endpointKey,
    payload: { endpoint, secret },
    receipt: { endpoint, secret },
    useRun() {
      const mutation = useCreateWebhookEndpoint();
      return (scope: WebhookMutationScope) => mutation.mutateAsync({ scope, draft: draft() });
    },
  },
  {
    name: 'update',
    method: 'PATCH',
    path: endpointPath,
    key: endpointKey,
    payload: { endpoint },
    receipt: endpoint,
    useRun() {
      const mutation = useUpdateWebhookEndpoint();
      return (scope: WebhookMutationScope) =>
        mutation.mutateAsync({
          scope,
          endpointId: endpoint.id,
          patch: { enabled: false },
        });
    },
  },
  {
    name: 'delete',
    method: 'DELETE',
    path: endpointPath,
    key: endpointKey,
    payload: { deleted: true },
    receipt: { deleted: true },
    useRun() {
      const mutation = useDeleteWebhookEndpoint();
      return (scope: WebhookMutationScope) =>
        mutation.mutateAsync({ scope, endpointId: endpoint.id });
    },
  },
  {
    name: 'test',
    method: 'POST',
    path: `${endpointPath}/test`,
    key: deliveryKey,
    payload: { delivery },
    receipt: { delivery },
    useRun() {
      const mutation = useSendWebhookTest();
      return (scope: WebhookMutationScope) =>
        mutation.mutateAsync({ scope, endpointId: endpoint.id });
    },
  },
  {
    name: 'redeliver',
    method: 'POST',
    path: `${endpointPath}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
    key: deliveryKey,
    payload: { delivery: { ...delivery, redeliveryOf: deliveryId } },
    receipt: { delivery: { ...delivery, redeliveryOf: deliveryId } },
    useRun() {
      const mutation = useRedeliverWebhook();
      return (scope: WebhookMutationScope) =>
        mutation.mutateAsync({
          scope,
          endpointId: endpoint.id,
          deliveryId,
        });
    },
  },
];
const fetchMock = vi.fn<typeof fetch>();
const getToken = vi.fn<() => Promise<string | null>>();
const dispatched = vi.fn<() => void>();
let client: QueryClient;
let current: boolean;
let request: ReturnType<typeof createRequestAuthority>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  current = true;
  getToken.mockReset().mockResolvedValue('captured-token');
  dispatched.mockReset();
  request = createRequestAuthority(
    {
      userId: 'owner-a',
      sessionId: 'session-a',
      isCurrent: () => current,
      getToken,
    },
    () => current,
    dispatched,
  );
  client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 } } });
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  request.retire();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(operations)('webhook $name captured transport', (operation) => {
  function mount(organizationId: string | null = null) {
    fetchMock.mockResolvedValue(json(operation.payload));
    const view = renderHook(operation.useRun, { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const scope: WebhookMutationScope = { request, organizationId };
    return { ...view, invalidate, scope };
  }

  it.each([null, '0190a000-0000-4000-8000-0000000000e1'])(
    'sends captured credentials and explicit scope %s',
    async (organizationId) => {
      const { result, invalidate, scope } = mount(organizationId);
      await act(async () => {
        await expect(result.current(scope)).resolves.toEqual(operation.receipt);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(operation.path);
      expect(init).toMatchObject({
        method: operation.method,
        credentials: 'omit',
        signal: request.signal,
      });
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer captured-token');
      expect(headers.get('x-csrf-token')).toBe('csrf');
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
      expect(getToken).toHaveBeenCalledOnce();
      expect(dispatched).toHaveBeenCalledOnce();
      expect(invalidate).toHaveBeenCalledOnce();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: operation.key });
    },
  );

  it('rejects already retired authority before CSRF, token, or dispatch', async () => {
    const { result, invalidate, scope } = mount();
    request.retire();
    await act(async () => {
      await expect(result.current(scope)).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each(['csrf', 'token'] as const)(
    'does not dispatch after retirement during %s',
    async (stage) => {
      const { result, invalidate, scope } = mount();
      const pause = deferred<string>();
      if (stage === 'csrf') vi.mocked(getCsrfToken).mockReturnValue(pause.promise);
      else getToken.mockReturnValue(pause.promise);
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current(scope);
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(stage === 'csrf' ? getCsrfToken : getToken).toHaveBeenCalledOnce(),
      );
      current = false;
      await act(async () => {
        pause.resolve('retired-value');
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });
      if (stage === 'csrf') expect(getToken).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dispatched).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it.each(['response', 'success-body', 'error-body'] as const)(
    'rejects a retired deferred %s without replay or invalidation',
    async (stage) => {
      const { result, invalidate, scope } = mount();
      const response = deferred<Response>();
      const body = deferred<unknown>();
      const parsing = deferred<void>();
      fetchMock.mockReturnValue(
        stage === 'response'
          ? response.promise
          : Promise.resolve({
              ok: stage !== 'error-body',
              status: stage === 'error-body' ? 409 : 200,
              json: () => {
                parsing.resolve();
                return body.promise;
              },
            } as Response),
      );
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current(scope);
        await Promise.resolve();
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      if (stage !== 'response') await parsing.promise;
      current = false;
      await act(async () => {
        response.resolve(json(operation.payload));
        body.resolve(stage === 'error-body' ? { error: 'Endpoint refused.' } : operation.payload);
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });
      expect(dispatched).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([400, 403, 409, 429])(
    'classifies current %s as rejection without retries',
    async (status) => {
      const { result, invalidate, scope } = mount();
      fetchMock.mockResolvedValue(json({ error: 'Endpoint refused.' }, status));
      await act(async () => {
        await expect(result.current(scope)).rejects.toBeInstanceOf(WebhookMutationRejectedError);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it.each(['server', 'transport'] as const)(
    'keeps %s failure uncertain without retries',
    async (failure) => {
      const { result, invalidate, scope } = mount();
      if (failure === 'server') fetchMock.mockResolvedValue(json({ error: 'Unavailable.' }, 503));
      else fetchMock.mockRejectedValue(new TypeError('Connection lost'));
      await act(async () => {
        const error = await result.current(scope).then(
          () => undefined,
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(WebhookMutationRejectedError);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it.each([{ payload: null }, { payload: {} }, { payload: [] }])(
    'rejects an absent receipt $payload without replay',
    async ({ payload }) => {
      const { result, invalidate, scope } = mount();
      fetchMock.mockResolvedValue(json(payload));
      await act(async () => {
        await expect(result.current(scope)).rejects.toThrow('receipt could not be confirmed');
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it('invalidates matching scoped query descendants, not unrelated prefixes', async () => {
    const { result, invalidate, scope } = mount();
    invalidate.mockRestore();
    const matching = [...operation.key, 'owner-a', 'session-a'];
    const unrelated = ['developers', 'projects', 'owner-a'];
    client.setQueryData(matching, []);
    client.setQueryData(unrelated, []);
    await act(async () => {
      await result.current(scope);
    });
    expect(client.getQueryState(matching)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    if (operation.name === 'test' || operation.name === 'redeliver') {
      const otherEndpoint = [...endpointKey, 'other-endpoint', 'deliveries'];
      client.setQueryData(otherEndpoint, []);
      fetchMock.mockResolvedValue(json(operation.payload));
      await act(async () => {
        await result.current(scope);
      });
      expect(client.getQueryState(otherEndpoint)?.isInvalidated).toBe(false);
    }
  });

  it('skips success invalidation if ownership retires after receipt validation', async () => {
    client.clear();
    client = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          request.retire();
        },
      }),
      defaultOptions: { mutations: { retry: 1, retryDelay: 0 } },
    });
    const { result, invalidate, scope } = mount();
    await act(async () => {
      await expect(result.current(scope)).resolves.toEqual(operation.receipt);
    });
    expect(request.isCurrent()).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('webhook receipt validation', () => {
  const invalidReceipts = [
    { operation: operations[0]!, payload: { endpoint } },
    ...['', null, 123].map((value) => ({
      operation: operations[0]!,
      payload: { endpoint, secret: value },
    })),
    { operation: operations[0]!, payload: { endpoint: { ...endpoint, id: '' }, secret } },
    { operation: operations[1]!, payload: { endpoint: { ...endpoint, id: 'other-endpoint' } } },
    ...[false, 'true', 1].map((deleted) => ({ operation: operations[2]!, payload: { deleted } })),
    { operation: operations[3]!, payload: { delivery: { ...delivery, id: '' } } },
    ...[null, 'other-delivery', undefined].map((redeliveryOf) => ({
      operation: operations[4]!,
      payload: { delivery: { ...delivery, redeliveryOf } },
    })),
  ];
  it.each(invalidReceipts)(
    'rejects invalid $operation.name receipt $payload',
    async ({ operation, payload }) => {
      fetchMock.mockResolvedValue(json(payload));
      const { result } = renderHook(operation.useRun, { wrapper });
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      await act(async () => {
        await expect(result.current({ request, organizationId: null })).rejects.toThrow(
          'receipt could not be confirmed',
        );
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );
});

describe('webhook submitted payload snapshots', () => {
  it.each(['create', 'update'] as const)(
    'snapshots %s before CSRF and token waits',
    async (operation) => {
      const csrf = deferred<string>();
      const token = deferred<string>();
      vi.mocked(getCsrfToken).mockReturnValue(csrf.promise);
      getToken.mockReturnValue(token.promise);
      fetchMock.mockResolvedValue(json({ endpoint, secret }));
      const submitted = draft();
      const original = JSON.stringify(submitted);
      const { result } = renderHook(
        () => {
          const create = useCreateWebhookEndpoint();
          const update = useUpdateWebhookEndpoint();
          return () =>
            operation === 'create'
              ? create.mutateAsync({ scope: { request, organizationId: null }, draft: submitted })
              : update.mutateAsync({
                  scope: { request, organizationId: null },
                  endpointId: endpoint.id,
                  patch: submitted,
                });
        },
        { wrapper },
      );
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current();
        await Promise.resolve();
      });
      await waitFor(() => expect(getCsrfToken).toHaveBeenCalledOnce());
      submitted.url = 'https://example.com/changed';
      submitted.eventTypes.push('changed.event');
      csrf.resolve('csrf');
      await waitFor(() => expect(getToken).toHaveBeenCalledOnce());
      submitted.description = 'Changed again';
      await act(async () => {
        token.resolve('captured-token');
        await pending;
      });
      expect(fetchMock.mock.calls[0]![1]?.body).toBe(original);
    },
  );
});

describe('webhook once-only secret lifecycle', () => {
  it('delivers the receipt without waiting for invalidation and collects it after observer reset', async () => {
    vi.useFakeTimers();
    const refetch = deferred<void>();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockReturnValue(refetch.promise);
    fetchMock.mockResolvedValue(json({ endpoint, secret }));
    const { result } = renderHook(useCreateWebhookEndpoint, { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          scope: { request, organizationId: null },
          draft: draft(),
        }),
      ).resolves.toEqual({ endpoint, secret });
    });
    expect(invalidate).toHaveBeenCalledOnce();
    const mutation = client.getMutationCache().getAll()[0]!;
    expect(mutation.options.gcTime).toBe(0);
    expect(mutation.state.data).toEqual({ endpoint, secret });
    act(() => result.current.reset());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getMutationCache().getAll()).toEqual([]);
    refetch.resolve();
  });
});

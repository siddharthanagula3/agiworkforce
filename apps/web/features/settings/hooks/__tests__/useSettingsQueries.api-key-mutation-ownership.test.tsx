import type { WebFetch } from '@/test/fetch';
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
import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { queryKeys } from '@shared/stores/query-client';
import type { CreateApiKeyFormData } from '../../schemas/settings-validation';
import {
  useCreateAPIKey,
  useDeleteAPIKey,
  APIKeyMutationRejectedError,
  type APIKeyMutationScope,
} from '../use-settings-queries';

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf'),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const key = {
  id: 'key-a',
  name: 'Integration',
  key_prefix: 'fixture',
  scopes: ['models:read'],
  created_at: '2026-11-06T00:00:00.000Z',
};
const created = { api_key: key, full_key: 'fixture-only-key' };
const draft = (): CreateApiKeyFormData => ({
  name: 'Integration',
  scopes: ['models:read'],
  expiresInDays: '30',
  projectId: null,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const challenge = () =>
  json(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'api_credential.reveal',
          consequence: 'Show the key',
          freshnessSeconds: 120,
        },
      },
    },
    403,
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const operations = [
  {
    name: 'create',
    method: 'POST',
    path: '/api/settings/api-keys',
    payload: created,
    receipt: { apiKey: key, fullKey: created.full_key },
    useRun() {
      const mutation = useCreateAPIKey();
      return (scope: APIKeyMutationScope) => mutation.mutateAsync({ scope, draft: draft() });
    },
  },
  {
    name: 'delete',
    method: 'DELETE',
    path: '/api/settings/api-keys/key%2Fa',
    payload: { message: 'API key revoked' },
    receipt: 'key/a',
    useRun() {
      const mutation = useDeleteAPIKey();
      return (scope: APIKeyMutationScope) => mutation.mutateAsync({ scope, keyId: 'key/a' });
    },
  },
];
const fetchMock = vi.fn<WebFetch>();
const getToken = vi.fn<() => Promise<string | null>>();
const dispatched = vi.fn<() => void>();
const knownRefusal = vi.fn<() => void>();
let current: boolean;
let request: ReturnType<typeof createRequestAuthority>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const scope = (organizationId: string | null = null): APIKeyMutationScope => ({
  request,
  organizationId,
  onStepUpRequired: knownRefusal,
});
beforeEach(() => {
  current = true;
  getToken.mockReset().mockResolvedValue('captured-token');
  dispatched.mockReset();
  knownRefusal.mockReset();
  fetchMock.mockReset();
  request = createRequestAuthority(
    { userId: 'owner-a', sessionId: 'session-a', isCurrent: () => current, getToken },
    () => current,
    dispatched,
  );
  client = new QueryClient({ defaultOptions: { mutations: { retry: 2, retryDelay: 0 } } });
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
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

describe.each(operations)('API key $name owned mutation', (operation) => {
  function mount() {
    fetchMock.mockResolvedValue(json(operation.payload));
    const view = renderHook(() => operation.useRun(), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    return { ...view, invalidate };
  }
  it.each([null, '0190a000-0000-4000-8000-0000000000e1'])(
    'sends captured bearer and explicit workspace %s',
    async (organizationId) => {
      const { result, invalidate } = mount();
      await act(async () => {
        await expect(result.current(scope(organizationId))).resolves.toEqual(operation.receipt);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(operation.path);
      expect(init).toMatchObject({ method: operation.method, credentials: 'omit' });
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer captured-token');
      expect(headers.get('x-csrf-token')).toBe('csrf');
      expect(headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
      expect(dispatched).toHaveBeenCalledOnce();
      expect(knownRefusal).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledExactlyOnceWith({
        queryKey: queryKeys.settings.apiKeys(),
      });
    },
  );
  it('rejects retired authority before auth or network', async () => {
    const { result, invalidate } = mount();
    request.retire();
    await act(async () => {
      await expect(result.current(scope())).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each(['csrf', 'token'] as const)(
    'blocks dispatch after retirement during %s',
    async (gate) => {
      const { result, invalidate } = mount();
      const pause = deferred<string>();
      if (gate === 'csrf') vi.mocked(getCsrfToken).mockReturnValue(pause.promise);
      else getToken.mockReturnValue(pause.promise);
      let pending!: Promise<unknown>;
      act(() => {
        pending = result.current(scope());
        void pending.catch(() => undefined);
      });
      await waitFor(() => expect(gate === 'csrf' ? getCsrfToken : getToken).toHaveBeenCalled());
      current = false;
      await act(async () => {
        pause.resolve('old');
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dispatched).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );
  it.each(['response', 'success-body', 'error-body'] as const)(
    'discards retired %s without cache effects',
    async (gate) => {
      const { result, invalidate } = mount();
      const response = deferred<Response>();
      const body = deferred<unknown>();
      const parsing = vi.fn(() => body.promise);
      fetchMock.mockReturnValue(
        gate === 'response'
          ? response.promise
          : Promise.resolve({
              ok: gate !== 'error-body',
              status: gate === 'error-body' ? 409 : 200,
              json: parsing,
            } as unknown as Response),
      );
      let pending!: Promise<unknown>;
      act(() => {
        pending = result.current(scope());
        void pending.catch(() => undefined);
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      if (gate !== 'response') await waitFor(() => expect(parsing).toHaveBeenCalledOnce());
      current = false;
      await act(async () => {
        response.resolve(json(operation.payload));
        body.resolve(gate === 'error-body' ? { error: 'Refused' } : operation.payload);
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });
      expect(invalidate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it.each([400, 409, 429])('classifies current %s refusal without retry', async (status) => {
    const { result, invalidate } = mount();
    fetchMock.mockResolvedValue(json({ error: 'Refused' }, status));
    await act(async () => {
      await expect(result.current(scope())).rejects.toBeInstanceOf(APIKeyMutationRejectedError);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each(['network', 'server', 'body'] as const)(
    'does not replay an uncertain %s failure',
    async (failure) => {
      const { result, invalidate } = mount();
      if (failure === 'network') fetchMock.mockRejectedValue(new TypeError('Connection lost'));
      else
        fetchMock.mockResolvedValue(
          failure === 'server'
            ? json({ error: 'Unknown' }, 503)
            : new Response('{', { status: 200 }),
        );
      await act(async () => {
        const error = await result.current(scope()).catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(APIKeyMutationRejectedError);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );
  it('skips invalidation when ownership retires between receipt and success callback', async () => {
    client.clear();
    client = new QueryClient({
      mutationCache: new MutationCache({ onSuccess: () => request.retire() }),
    });
    const { result, invalidate } = mount();
    await act(async () => {
      await expect(result.current(scope())).resolves.toEqual(operation.receipt);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('owned API key creation proof replay and receipt', () => {
  it('snapshots the draft and expiry and counts only writes, not the grant', async () => {
    const csrf = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(csrf.promise);
    const submitted = draft();
    const { result } = renderHook(useCreateAPIKey, { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === '/api/auth/step-up') return json({ token: 'proof' });
      return new Headers(init?.headers).has(STEP_UP_TOKEN_HEADER) ? json(created) : challenge();
    });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.mutateAsync({ scope: scope(), draft: submitted });
    });
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalledOnce());
    submitted.name = 'Changed';
    submitted.scopes.splice(0);
    submitted.expiresInDays = 'never';
    await act(async () => {
      csrf.resolve('csrf');
      await pending;
    });
    const writes = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/settings/api-keys');
    expect(writes).toHaveLength(2);
    expect(dispatched).toHaveBeenCalledTimes(2);
    expect(knownRefusal).toHaveBeenCalledOnce();
    expect(writes[0]![1]?.body).toBe(writes[1]![1]?.body);
    expect(JSON.parse(String(writes[0]![1]?.body))).toMatchObject({
      name: 'Integration',
      scopes: ['models:read'],
    });
    expect(JSON.parse(String(writes[0]![1]?.body)).expiresAt).toEqual(expect.any(String));
    const grant = fetchMock.mock.calls.find(([url]) => String(url) === '/api/auth/step-up')!;
    expect(new Headers(grant[1]?.headers).get('Authorization')).toBe('Bearer captured-token');
    expect(grant[1]?.credentials).toBe('omit');
    expect(new Headers(writes[1]![1]?.headers).get(STEP_UP_TOKEN_HEADER)).toBe('proof');
    expect(invalidate).toHaveBeenCalledOnce();
  });
  it('never replays after owner retirement while the silent grant is pending', async () => {
    const grant = deferred<Response>();
    fetchMock.mockImplementation(async (url) =>
      String(url) === '/api/auth/step-up' ? grant.promise : challenge(),
    );
    const { result } = renderHook(useCreateAPIKey, { wrapper });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.mutateAsync({ scope: scope(), draft: draft() });
      void pending.catch(() => undefined);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(knownRefusal).toHaveBeenCalledOnce();
    request.retire();
    await act(async () => {
      grant.resolve(json({ token: 'old-proof' }));
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispatched).toHaveBeenCalledOnce();
  });
  it.each([
    { payload: {} },
    { payload: { api_key: key } },
    { payload: { api_key: key, full_key: '' } },
    { payload: { api_key: { id: '' }, full_key: 'fixture' } },
  ])('refuses incomplete creation receipt $payload', async ({ payload }) => {
    fetchMock.mockResolvedValue(json(payload));
    const { result } = renderHook(useCreateAPIKey, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ scope: scope(), draft: draft() })).rejects.toThrow(
        'receipt could not be confirmed',
      );
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not delay the secret on refetch and collects unobserved receipt data after reset', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(json(created));
    const refetch = deferred<void>();
    vi.spyOn(client, 'invalidateQueries').mockReturnValue(refetch.promise);
    const { result } = renderHook(useCreateAPIKey, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ scope: scope(), draft: draft() })).resolves.toEqual(
        { apiKey: key, fullKey: created.full_key },
      );
    });
    expect(client.getMutationCache().getAll()[0]?.options.gcTime).toBe(0);
    act(() => result.current.reset());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getMutationCache().getAll()).toEqual([]);
    refetch.resolve();
  });
});

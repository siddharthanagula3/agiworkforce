import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_PENDING_ACCOUNT_DELETION, type AccountDeletionStatus } from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { useAccountDeletionStatus, permitsAccountDeletionAction } from './use-account-deletion-status';
import { useCancelAccountDeletion, type AccountDeletionCancellationIntent } from './use-cancel-account-deletion';

const mocks = vi.hoisted(() => ({ capture: vi.fn(), csrf: vi.fn() }));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => mocks.capture,
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  addCsrfHeaders: mocks.csrf,
}));

let key: readonly unknown[];
const pending: AccountDeletionStatus = {
  cancellationPrecondition: 'schedule-pair-v1', pending: true, canCancel: true, requestedAt: '2026-11-07T12:00:00.000Z', scheduledFor: '2026-11-08T12:00:00.000Z',
};
const receipt = { message: 'Account deletion cancelled.', cancelled: true };
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
let session: SessionAuthority;
let live: boolean;
let listeners: Set<() => void>;
let token: ReturnType<typeof vi.fn<SessionAuthority['getToken']>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(body: unknown = receipt) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function retireSession() {
  live = false;
  for (const listener of [...listeners]) listener();
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function setup() {
  const hook = renderHook(({ active }) => {
    const reader = useAccountDeletionStatus();
    return { ...useCancelAccountDeletion(active), reader };
  }, {
    initialProps: { active: true }, wrapper,
  });
  await waitFor(() => expect(permitsAccountDeletionAction(hook.result.current.reader.snapshot, 'cancel')).toBe(true));
  key = client.getQueryCache().findAll({ queryKey: queryKeys.settings.accountDeletionStatus() })
    .find((query) => query.state.status === 'success')!.queryKey;
  token.mockClear();
  let intent!: AccountDeletionCancellationIntent;
  act(() => {
    const prepared = hook.result.current.begin(hook.result.current.reader.snapshot);
    if (!prepared) throw new Error('Expected a live cancellation intent');
    intent = prepared;
  });
  return { ...hook, intent };
}

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.csrf.mockReset().mockResolvedValue({ 'x-csrf-token': 'csrf' });
  fetchMock.mockReset().mockImplementation(async () => response());
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => init?.method === 'GET'
    ? Promise.resolve(response(pending)) : fetchMock(input, init)));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 1 } } });

  live = true;
  listeners = new Set();
  token = vi.fn<SessionAuthority['getToken']>().mockResolvedValue('captured-token');
  session = {
    userId: 'native-subject', sessionId: 'session-A', isCurrent: () => live,
    getToken: token,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  mocks.capture.mockImplementation(() => live ? session : null);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe('owned cancellation source fixtures (UNRUN)', () => {
  it('retains the reader owner at open, sends one bearer request without cookies, and settles after its own cache write', async () => {
    const { result, intent } = await setup();
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    act(() => { intent.confirm(); intent.confirm(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/user/delete-account/cancel-schedule');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer captured-token');
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf');
    expect(init?.credentials).toBe('omit');
    expect(init?.method).toBe('PUT');
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(String(init?.body))).toEqual({ expectedSchedule: { scheduledFor: pending.scheduledFor, requestedAt: pending.requestedAt } });
    expect(client.getQueryData<{ status: AccountDeletionStatus }>(key)?.status).toEqual(NO_PENDING_ACCOUNT_DELETION);
    expect(result.current.needsStatusCheck).toBe(false);
    expect(intent.isCurrent()).toBe(true);
    expect(intent.canConfirm()).toBe(false);
    expect(result.current.data).toEqual(receipt);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it.each(['csrf', 'token'] as const)('blocks dispatch after view retirement during %s', async (stage) => {
    const csrf = deferred<HeadersInit>();
    const auth = deferred<string | null>();
    const { intent, rerender, result } = await setup();
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'csrf' ? mocks.csrf : token).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    await act(async () => { csrf.resolve({}); auth.resolve('old-token'); });
    expect(intent.isCurrent()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(client.getQueryData<{ status: AccountDeletionStatus }>(key)?.status).toEqual(pending);
  });

  it.each(['csrf', 'token'] as const)('blocks dispatch after synchronous session retirement during %s', async (stage) => {
    const csrf = deferred<HeadersInit>();
    const auth = deferred<string | null>();
    const { intent, result } = await setup();
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'csrf' ? mocks.csrf : token).toHaveBeenCalledTimes(1));
    act(() => retireSession());
    expect(intent.isCurrent()).toBe(false);
    await act(async () => { csrf.resolve({}); auth.resolve('old-token'); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it.each(['csrf', 'token'] as const)('requires a fresh confirmation when query state changes during %s', async (stage) => {
    const csrf = deferred<HeadersInit>();
    const auth = deferred<string | null>();
    const { intent, result } = await setup();
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'csrf' ? mocks.csrf : token).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, client.getQueryData(key), { updatedAt: 10 }));
    const newer = client.getQueryState(key);
    await act(async () => { csrf.resolve({}); auth.resolve('captured-token'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/Cancellation was not sent/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryState(key)).toBe(newer);
    act(() => intent.confirm());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(intent.canConfirm()).toBe(false);
  });

  it.each(['csrf', 'token'] as const)('blocks invalidation during %s without replacing the captured body (UNRUN)', async (stage) => {
    const csrf = deferred<HeadersInit>();
    const auth = deferred<string | null>();
    const { intent, result } = await setup();
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'csrf' ? mocks.csrf : token).toHaveBeenCalledTimes(1));
    await act(async () => { await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' }); });
    await act(async () => { csrf.resolve({}); auth.resolve('captured-token'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/Cancellation was not sent/);
    expect(result.current.needsStatusCheck).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
  });

  it.each(['response', 'json'] as const)('preserves newer cache and known receipt after delayed %s', async (stage) => {
    const reply = deferred<Response>();
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockReturnValue(stage === 'response' ? reply.promise : Promise.resolve({ ok: true, json: readBody } as unknown as Response));
    const { intent, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'response' ? fetchMock : readBody).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, (old: object | undefined) => ({ ...old, status: { ...pending, scheduledFor: '2026-11-09T12:00:00.000Z' } })));
    const newer = client.getQueryState(key);
    await act(async () => { reply.resolve(response()); body.resolve(receipt); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(receipt);
    expect(result.current.needsStatusCheck).toBe(true);
    expect(client.getQueryState(key)).toBe(newer);
    act(() => intent.confirm());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe.each(['close', 'unmount', 'session'] as const)('%s retirement', (retirement) => {
    it.each(['response', 'json'] as const)('does not publish a delayed %s or resurrect a retired handle', async (stage) => {
      const reply = deferred<Response>();
      const body = deferred<unknown>();
      const readBody = vi.fn(() => body.promise);
      fetchMock.mockReturnValue(stage === 'response' ? reply.promise : Promise.resolve({ ok: true, json: readBody } as unknown as Response));
      const { intent, result, rerender, unmount } = await setup();
      const originalQuery = client.getQueryCache().find({ queryKey: key, exact: true })!;
      act(() => intent.confirm());
      await waitFor(() => expect(stage === 'response' ? fetchMock : readBody).toHaveBeenCalledTimes(1));
      if (retirement === 'close') rerender({ active: false });
      else if (retirement === 'unmount') unmount();
      else act(() => retireSession());
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await act(async () => { reply.resolve(response()); body.resolve(receipt); });
      expect((originalQuery.state.data as { status: AccountDeletionStatus }).status).toEqual(pending);
      expect(intent.isCurrent()).toBe(false);
      if (retirement !== 'unmount') {
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.error).toBeNull();
      }
    });
  });

  it('cannot confirm or dismiss a replacement with a retained handle', async () => {
    const { intent, result } = await setup();
    let replacement!: AccountDeletionCancellationIntent;
    act(() => {
      replacement = result.current.begin(result.current.reader.snapshot)!;
    });
    act(() => { intent.confirm(); intent.dismiss(); });
    expect(intent.isCurrent()).toBe(false);
    expect(replacement.isCurrent()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => { replacement.dismiss(); replacement.confirm(); });
    expect(replacement.isCurrent()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['live', 'retired'] as const)('checks only current status with a %s handle, without replaying cancellation', async (ownership) => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const { intent, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, client.getQueryData(key), { updatedAt: 10 }));
    await act(async () => reply.resolve(response()));
    await waitFor(() => expect(result.current.needsStatusCheck).toBe(true));
    const read = vi.fn(async () => response(NO_PENDING_ACCOUNT_DELETION));
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET' ? read() : fetchMock(input, init));
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) throw new Error('Expected deletion status query');

    if (ownership === 'retired') act(() => intent.dismiss());
    await act(async () => intent.checkCurrentStatus());
    expect(read).toHaveBeenCalledTimes(ownership === 'live' ? 1 : 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (ownership === 'live') {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(receipt);
      expect(result.current.needsStatusCheck).toBe(false);
      expect(client.getQueryData<{ status: AccountDeletionStatus }>(key)?.status).toEqual(NO_PENDING_ACCOUNT_DELETION);
    }
  });

  it('does not settle a replacement dialog when an older status check finishes', async () => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const { intent, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, client.getQueryData(key), { updatedAt: 10 }));
    await act(async () => reply.resolve(response()));
    await waitFor(() => expect(result.current.needsStatusCheck).toBe(true));
    const status = deferred<AccountDeletionStatus>();
    const read = vi.fn(async () => response(await status.promise));
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET' ? read() : fetchMock(input, init));
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) throw new Error('Expected deletion status query');

    let checking!: Promise<void>;
    act(() => { checking = intent.checkCurrentStatus(); });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => intent.dismiss());
    await act(async () => {
      await client.cancelQueries({ queryKey: key, exact: true });
    });
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET'
      ? Promise.resolve(response(pending)) : fetchMock(input, init));
    await act(async () => { await result.current.reader.refetch(); });
    let replacement!: AccountDeletionCancellationIntent;
    act(() => { replacement = result.current.begin(result.current.reader.snapshot)!; });
    await act(async () => { status.resolve(NO_PENDING_ACCOUNT_DELETION); await checking; });
    expect(replacement.isCurrent()).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a retained A dialog capture B on confirm', async () => {
    const { intent } = await setup();
    act(() => retireSession());
    mocks.capture.mockReturnValue({ ...session, sessionId: 'session-B', isCurrent: () => true });
    const captures = mocks.capture.mock.calls.length;
    act(() => intent.confirm());
    expect(mocks.capture).toHaveBeenCalledTimes(captures);
    expect(token).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not publish an old refusal over a fresh view', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: readBody } as unknown as Response);
    const { intent, rerender, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(readBody).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
    await act(async () => { body.resolve({ error: 'The cancellation window has closed.' }); });
    await act(async () => { await result.current.reader.refetch(); });
    let fresh!: AccountDeletionCancellationIntent;
    act(() => { fresh = result.current.begin(result.current.reader.snapshot)!; });
    expect(fresh.isCurrent()).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it.each([null, '2026-11-07T12:00:00.654321Z'])('captures exact microseconds and explicit requestedAt=%s at open (UNRUN)', async (requestedAt) => {
    const exact = { ...pending, requestedAt, scheduledFor: '2026-11-08T12:00:00.123456Z' };
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET'
      ? Promise.resolve(response(exact)) : fetchMock(input, init));
    const { intent, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ expectedSchedule: {
      scheduledFor: exact.scheduledFor, requestedAt,
    } }));
  });

  it('displays legacy status but cannot open protected cancellation without the exact marker (UNRUN)', async () => {
    const { cancellationPrecondition: _marker, ...legacy } = pending;
    vi.mocked(globalThis.fetch).mockImplementation(async () => response(legacy));
    const hook = renderHook(() => ({ reader: useAccountDeletionStatus(), cancellation: useCancelAccountDeletion() }), { wrapper });
    await waitFor(() => expect(hook.result.current.reader.data).toEqual(legacy));
    expect(permitsAccountDeletionAction(hook.result.current.reader.snapshot, 'cancel')).toBe(false);
    expect(hook.result.current.cancellation.begin(hook.result.current.reader.snapshot)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { label: '404 missing route', reply: () => new Response(null, { status: 404 }) },
    { label: '405 missing PUT', reply: () => new Response(null, { status: 405 }) },
    { label: '401', reply: () => new Response(null, { status: 401 }) },
    { label: '409 changed schedule', reply: () => new Response(JSON.stringify({ reason: 'schedule_changed', error: 'Changed.' }), { status: 409 }) },
    { label: '500 after possible commit', reply: () => new Response(null, { status: 500 }) },
    { label: 'malformed receipt', reply: () => response({}) },
    { label: 'parent GET response', reply: () => response(NO_PENDING_ACCOUNT_DELETION) },
    { label: 'timeout', reply: (): Response => { throw new DOMException('Timed out', 'TimeoutError'); } },
    { label: 'redirect failure', reply: (): Response => { throw new TypeError('Failed to fetch'); } },
  ])('fences same-state close/reopen after $label with no fallback or replay (UNRUN)', async ({ label, reply }) => {
    fetchMock.mockImplementation(async () => reply());
    const { intent, result, rerender } = await setup();
    const original = result.current.reader.snapshot;
    act(() => { intent.confirm(); intent.confirm(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.needsStatusCheck).toBe(true);
    if (label === '409 changed schedule') expect(result.current.error?.message).toMatch(/schedule changed/);
    act(() => intent.dismiss());
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current.begin(original)).toBeNull();
    act(() => client.setQueryData(key, client.getQueryData(key), { updatedAt: 99 }));
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
    await act(async () => { await result.current.reader.refetch(); });
    let next!: AccountDeletionCancellationIntent;
    act(() => { next = result.current.begin(result.current.reader.snapshot)!; });
    expect(next.canConfirm()).toBe(true);
    act(() => intent.confirm());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/user/delete-account/cancel-schedule');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', redirect: 'error' });
    expect(token.mock.calls.every(([options]) => options?.skipCache !== true)).toBe(true);
  });

  it('rejects a delayed read started before refusal, even after unrelated query transitions (UNRUN)', async () => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const { intent, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const delayed = deferred<Response>();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET'
      ? delayed.promise : fetchMock(input, init));
    let reading!: Promise<void>;
    act(() => { reading = result.current.reader.refetch(); });
    await waitFor(() => expect(result.current.reader.isFetching).toBe(true));
    await act(async () => { reply.resolve(new Response(null, { status: 409 })); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await act(async () => { delayed.resolve(response(pending)); await reading; });
    act(() => intent.dismiss());
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
    act(() => client.setQueryData(key, client.getQueryData(key), { updatedAt: 100 }));
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET'
      ? Promise.resolve(response(pending)) : fetchMock(input, init));
    await act(async () => { await result.current.reader.refetch(); });
    expect(permitsAccountDeletionAction(result.current.reader.snapshot, 'cancel')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed recovery stays fenced and a later no-pending GET never proves ambiguous cancellation succeeded (UNRUN)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { intent, result } = await setup();
    act(() => intent.confirm());
    await waitFor(() => expect(result.current.isError).toBe(true));
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET'
      ? Promise.resolve(response({})) : fetchMock(input, init));
    await act(async () => { await intent.checkCurrentStatus(); });
    expect(result.current.needsStatusCheck).toBe(true);
    expect(result.current.begin(result.current.reader.snapshot)).toBeNull();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => init?.method === 'GET'
      ? Promise.resolve(response(NO_PENDING_ACCOUNT_DELETION)) : fetchMock(input, init));
    await act(async () => { await intent.checkCurrentStatus(); });
    expect(result.current.needsStatusCheck).toBe(false);
    expect(result.current.reader.data).toEqual(NO_PENDING_ACCOUNT_DELETION);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(intent.canConfirm()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh layout generation in StrictMode instead of reviving earlier handles', async () => {
    const status = renderHook(() => useAccountDeletionStatus(), { wrapper });
    await waitFor(() => expect(permitsAccountDeletionAction(status.result.current.snapshot, 'cancel')).toBe(true));
    const snapshot = status.result.current.snapshot;
    const handles: AccountDeletionCancellationIntent[] = [];
    function Harness() {
      const cancellation = useCancelAccountDeletion();
      useLayoutEffect(() => {
        const intent = cancellation.begin(snapshot);
        if (intent) handles.push(intent);
      }, []);
      return null;
    }
    render(<QueryClientProvider client={client}><StrictMode><Harness /></StrictMode></QueryClientProvider>);
    expect(handles).toHaveLength(2);
    expect(handles[0]?.isCurrent()).toBe(false);
    expect(handles[1]?.isCurrent()).toBe(true);
    act(() => { handles[0]?.confirm(); handles[0]?.dismiss(); });
    expect(handles[1]?.isCurrent()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

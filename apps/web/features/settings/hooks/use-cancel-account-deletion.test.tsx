import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_PENDING_ACCOUNT_DELETION, type AccountDeletionStatus } from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import type { SessionAuthority } from '@/lib/identity/request-authority';
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

const key = queryKeys.settings.accountDeletionStatus();
const pending: AccountDeletionStatus = {
  pending: true, canCancel: true, requestedAt: '2026-11-07T12:00:00.000Z', scheduledFor: '2026-11-08T12:00:00.000Z',
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

function setup() {
  const hook = renderHook(({ active }) => useCancelAccountDeletion(active), {
    initialProps: { active: true }, wrapper,
  });
  let intent!: AccountDeletionCancellationIntent;
  act(() => {
    const prepared = hook.result.current.begin(client.getQueryState<AccountDeletionStatus, Error>(key));
    if (!prepared) throw new Error('Expected a live cancellation intent');
    intent = prepared;
  });
  return { ...hook, intent };
}

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.csrf.mockReset().mockResolvedValue({ 'x-csrf-token': 'csrf' });
  fetchMock.mockReset().mockImplementation(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 1 } } });
  client.setQueryData(key, pending);
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
  it('captures at open, sends one bearer request without cookies, and settles after its own cache write', async () => {
    const { result, intent } = setup();
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    act(() => { intent.confirm(); intent.confirm(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/user/delete-account/cancel');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer captured-token');
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf');
    expect(init?.credentials).toBe('omit');
    expect(client.getQueryData(key)).toEqual(NO_PENDING_ACCOUNT_DELETION);
    expect(result.current.needsStatusCheck).toBe(false);
    expect(intent.isCurrent()).toBe(true);
    expect(intent.canConfirm()).toBe(false);
    expect(result.current.data).toEqual(receipt);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it.each(['csrf', 'token'] as const)('blocks dispatch after view retirement during %s', async (stage) => {
    const csrf = deferred<HeadersInit>();
    const auth = deferred<string | null>();
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    const { intent, rerender, result } = setup();
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'csrf' ? mocks.csrf : token).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    await act(async () => { csrf.resolve({}); auth.resolve('old-token'); });
    expect(intent.isCurrent()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(client.getQueryData(key)).toEqual(pending);
  });

  it.each(['csrf', 'token'] as const)('blocks dispatch after synchronous session retirement during %s', async (stage) => {
    const csrf = deferred<HeadersInit>();
    const auth = deferred<string | null>();
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    const { intent, result } = setup();
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
    if (stage === 'csrf') mocks.csrf.mockReturnValue(csrf.promise);
    else token.mockReturnValue(auth.promise);
    const { intent, result } = setup();
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'csrf' ? mocks.csrf : token).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, { ...pending }, { updatedAt: 10 }));
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

  it.each(['response', 'json'] as const)('preserves newer cache and known receipt after delayed %s', async (stage) => {
    const reply = deferred<Response>();
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockReturnValue(stage === 'response' ? reply.promise : Promise.resolve({ ok: true, json: readBody } as unknown as Response));
    const { intent, result } = setup();
    act(() => intent.confirm());
    await waitFor(() => expect(stage === 'response' ? fetchMock : readBody).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, { ...pending, scheduledFor: '2026-11-09T12:00:00.000Z' }));
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
      const { intent, result, rerender, unmount } = setup();
      act(() => intent.confirm());
      await waitFor(() => expect(stage === 'response' ? fetchMock : readBody).toHaveBeenCalledTimes(1));
      if (retirement === 'close') rerender({ active: false });
      else if (retirement === 'unmount') unmount();
      else act(() => retireSession());
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await act(async () => { reply.resolve(response()); body.resolve(receipt); });
      expect(client.getQueryData(key)).toEqual(pending);
      expect(intent.isCurrent()).toBe(false);
      if (retirement !== 'unmount') {
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.error).toBeNull();
      }
    });
  });

  it('cannot confirm or dismiss a replacement with a retained handle', () => {
    const { intent, result } = setup();
    let replacement!: AccountDeletionCancellationIntent;
    act(() => {
      replacement = result.current.begin(client.getQueryState<AccountDeletionStatus, Error>(key))!;
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
    const { intent, result } = setup();
    act(() => intent.confirm());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, { ...pending }, { updatedAt: 10 }));
    await act(async () => reply.resolve(response()));
    await waitFor(() => expect(result.current.needsStatusCheck).toBe(true));
    const read = vi.fn(async () => NO_PENDING_ACCOUNT_DELETION);
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) throw new Error('Expected deletion status query');
    query.setOptions({ ...query.options, queryFn: read });
    if (ownership === 'retired') act(() => intent.dismiss());
    await act(async () => intent.checkCurrentStatus());
    expect(read).toHaveBeenCalledTimes(ownership === 'live' ? 1 : 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (ownership === 'live') {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(receipt);
      expect(result.current.needsStatusCheck).toBe(false);
      expect(client.getQueryData(key)).toEqual(NO_PENDING_ACCOUNT_DELETION);
    }
  });

  it('does not settle a replacement dialog when an older status check finishes', async () => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValue(reply.promise);
    const { intent, result } = setup();
    act(() => intent.confirm());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, { ...pending }, { updatedAt: 10 }));
    await act(async () => reply.resolve(response()));
    await waitFor(() => expect(result.current.needsStatusCheck).toBe(true));
    const status = deferred<AccountDeletionStatus>();
    const read = vi.fn(() => status.promise);
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) throw new Error('Expected deletion status query');
    query.setOptions({ ...query.options, queryFn: read });
    let checking!: Promise<void>;
    act(() => { checking = intent.checkCurrentStatus(); });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => intent.dismiss());
    await act(async () => {
      await client.cancelQueries({ queryKey: key, exact: true });
    });
    let replacement!: AccountDeletionCancellationIntent;
    act(() => { replacement = result.current.begin(client.getQueryState<AccountDeletionStatus, Error>(key))!; });
    await act(async () => { status.resolve(NO_PENDING_ACCOUNT_DELETION); await checking; });
    expect(replacement.isCurrent()).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a retained A dialog capture B on confirm', () => {
    const { intent } = setup();
    act(() => retireSession());
    mocks.capture.mockReturnValue({ ...session, sessionId: 'session-B', isCurrent: () => true });
    act(() => intent.confirm());
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(token).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not publish an old refusal over a fresh view', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: readBody } as unknown as Response);
    const { intent, rerender, result } = setup();
    act(() => intent.confirm());
    await waitFor(() => expect(readBody).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    rerender({ active: true });
    let fresh!: AccountDeletionCancellationIntent;
    act(() => { fresh = result.current.begin(client.getQueryState<AccountDeletionStatus, Error>(key))!; });
    await act(async () => { body.resolve({ error: 'The cancellation window has closed.' }); });
    expect(fresh.isCurrent()).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('creates a fresh layout generation in StrictMode instead of reviving earlier handles', () => {
    const handles: AccountDeletionCancellationIntent[] = [];
    function Harness() {
      const cancellation = useCancelAccountDeletion();
      useLayoutEffect(() => {
        const intent = cancellation.begin(client.getQueryState<AccountDeletionStatus, Error>(key));
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

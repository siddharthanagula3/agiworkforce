import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import {
  PasswordMutationRejectedError,
  useChangePassword,
  type ChangePasswordMutation,
  type ChangePasswordParams,
  type ChangePasswordReceipt,
  type PasswordMutationScope,
} from '../use-settings-queries';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn() }));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const passwordPath = '/api/settings/password';
const grantPath = '/api/auth/step-up';
const receipt: ChangePasswordReceipt = {
  success: true,
  otherSessionsEnded: 2,
  otherSessionsRemaining: 0,
  deviceCredentialsRevoked: 3,
};

function draft(): ChangePasswordParams {
  return {
    currentPassword: 'fixture-current-password',
    newPassword: 'fixture-new-password',
    confirmPassword: 'fixture-new-password',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function challenge(): Response {
  return json({
    error: {
      code: 'STEP_UP_REQUIRED',
      message: 'Confirm your identity before changing your password.',
      details: {
        action: 'password.change',
        consequence: 'Your other sessions and device credentials will be revoked.',
        freshnessSeconds: 120,
      },
    },
  }, 403);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const fetchMock = vi.fn<typeof fetch>();
const getToken = vi.fn<() => Promise<string | null>>();
const dispatched = vi.fn<() => void>();
const onStepUpRequired = vi.fn<() => void>();
let current: boolean;
let request: ReturnType<typeof createRequestAuthority>;
let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function scope(): PasswordMutationScope {
  return { request, onStepUpRequired };
}

function start(mutation: ChangePasswordMutation, submitted = draft()) {
  let pending!: Promise<ChangePasswordReceipt>;
  act(() => {
    pending = mutation.mutateAsync({ scope: scope(), draft: submitted });
    void pending.catch(() => undefined);
  });
  return pending;
}

function passwordWrites() {
  return fetchMock.mock.calls.filter(([url]) => String(url) === passwordPath);
}

beforeEach(() => {
  current = true;
  fetchMock.mockReset().mockImplementation(async () => json(receipt));
  getToken.mockReset().mockResolvedValue('captured-session-token');
  dispatched.mockReset();
  onStepUpRequired.mockReset();
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf-token');
  vi.mocked(getAuthToken).mockReset().mockResolvedValue('unrelated-ambient-token');
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  request = createRequestAuthority({
    userId: 'captured-owner',
    sessionId: 'captured-session',
    isCurrent: () => current,
    getToken,
  }, () => current, dispatched);
  client = new QueryClient({
    defaultOptions: { mutations: { retry: 3, retryDelay: 0 } },
  });
  vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  try {
    expect(getAuthToken).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(client.invalidateQueries).not.toHaveBeenCalled();
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe('omit');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer captured-session-token');
    }
  } finally {
    cleanup();
    request.retire();
    client.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

describe('owned password mutation transport', () => {
  it.each(['fixture-current-password', null])(
    'sends an ordinary request without requiring proof, with current password %s',
    async (currentPassword) => {
      const submitted = { ...draft(), currentPassword };
      const { result } = renderHook(useChangePassword, { wrapper });

      await act(async () => {
        await expect(result.current.mutateAsync({ scope: scope(), draft: submitted }))
          .resolves.toEqual(receipt);
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(passwordPath);
      expect(init).toMatchObject({ method: 'POST', signal: request.signal });
      const headers = new Headers(init?.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('x-csrf-token')).toBe('csrf-token');
      expect(headers.has(STEP_UP_TOKEN_HEADER)).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({
        newPassword: submitted.newPassword,
        ...(currentPassword === null ? {} : { currentPassword }),
      });
      expect(getToken).toHaveBeenCalledOnce();
      expect(dispatched).toHaveBeenCalledOnce();
      expect(onStepUpRequired).not.toHaveBeenCalled();
      expect(result.current.stepUpDialog).toBeNull();
      expect(client.getMutationCache().getAll()[0]?.options.retry).toBe(false);
    },
  );

  it('rejects mismatched confirmation before CSRF, authentication or dispatch', async () => {
    const { result } = renderHook(useChangePassword, { wrapper });
    await act(async () => {
      const error = await result.current.mutateAsync({
        scope: scope(),
        draft: { ...draft(), confirmPassword: 'different-password' },
      }).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(PasswordMutationRejectedError);
      expect(error).toMatchObject({ message: 'Passwords do not match' });
    });
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
  });

  it('does not substitute ambient authentication when the captured session has no token', async () => {
    getToken.mockResolvedValue(null);
    const { result } = renderHook(useChangePassword, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ scope: scope(), draft: draft() }))
        .rejects.toThrow('Not authenticated');
    });
    expect(getToken).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 409, 422, 429])('classifies a current %s refusal without retry', async (status) => {
    const message = 'Your current password is incorrect.';
    fetchMock.mockImplementation(async () => json({ error: { message } }, status));
    const { result } = renderHook(useChangePassword, { wrapper });
    await act(async () => {
      const error = await result.current.mutateAsync({ scope: scope(), draft: draft() })
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(PasswordMutationRejectedError);
      expect(error).toMatchObject({ message });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(dispatched).toHaveBeenCalledOnce();
    expect(onStepUpRequired).not.toHaveBeenCalled();
  });

  it.each(['lost-network', 'server-error', 'unreadable-success', 'unreadable-error', 'invalid-receipt'] as const)(
    'keeps a dispatched %s outcome ambiguous and does not retry',
    async (outcome) => {
      const networkError = new TypeError('Connection lost after dispatch');
      fetchMock.mockImplementation(async () => {
        if (outcome === 'lost-network') throw networkError;
        if (outcome === 'server-error') return json({ error: 'The operation could not be confirmed.' }, 500);
        if (outcome === 'unreadable-success') return new Response('{', { status: 200 });
        if (outcome === 'unreadable-error') return new Response('{', { status: 503 });
        return json({ success: true });
      });
      const { result } = renderHook(useChangePassword, { wrapper });
      await act(async () => {
        const error = await result.current.mutateAsync({ scope: scope(), draft: draft() })
          .catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PasswordMutationRejectedError);
        if (outcome === 'lost-network') expect(error).toBe(networkError);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(dispatched).toHaveBeenCalledOnce();
      expect(onStepUpRequired).not.toHaveBeenCalled();
    },
  );

  it('preserves the partial-change 503 message without replaying the old password', async () => {
    const message = 'Your password was changed, but signing out your other devices did not finish.';
    fetchMock.mockImplementation(async () => json({ error: { message } }, 503));
    const { result } = renderHook(useChangePassword, { wrapper });
    await act(async () => {
      const error = await result.current.mutateAsync({ scope: scope(), draft: draft() })
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PasswordMutationRejectedError);
      expect(error).toMatchObject({ message });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onStepUpRequired).not.toHaveBeenCalled();
  });
});

describe('password request ownership across asynchronous boundaries', () => {
  it('rejects retired authority before CSRF or authentication', async () => {
    const { result } = renderHook(useChangePassword, { wrapper });
    request.retire();
    await act(async () => {
      await expect(result.current.mutateAsync({ scope: scope(), draft: draft() }))
        .rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['csrf', 'token'] as const)('blocks dispatch when ownership changes during %s', async (gate) => {
    const pause = deferred<string>();
    if (gate === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(pause.promise);
    else getToken.mockReturnValueOnce(pause.promise);
    const { result } = renderHook(useChangePassword, { wrapper });
    const pending = start(result.current);
    await waitFor(() => expect(gate === 'csrf' ? getCsrfToken : getToken).toHaveBeenCalledOnce());
    if (gate === 'csrf') expect(getToken).not.toHaveBeenCalled();
    current = false;

    await act(async () => {
      pause.resolve('retired-value');
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
    expect(onStepUpRequired).not.toHaveBeenCalled();
  });

  it.each(['response', 'success-body', 'error-body'] as const)(
    'discards a retired %s before accepting a receipt or classifying a refusal',
    async (gate) => {
      const responseWait = deferred<Response>();
      const bodyWait = deferred<unknown>();
      const response = json({}, gate === 'error-body' ? 409 : 200);
      const parse = vi.spyOn(response, 'json').mockReturnValue(bodyWait.promise);
      fetchMock.mockReturnValue(gate === 'response' ? responseWait.promise : Promise.resolve(response));
      const { result } = renderHook(useChangePassword, { wrapper });
      const pending = start(result.current);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      if (gate !== 'response') await waitFor(() => expect(parse).toHaveBeenCalledOnce());
      current = false;

      await act(async () => {
        responseWait.resolve(json(receipt));
        bodyWait.resolve(gate === 'error-body' ? { error: 'Current password rejected.' } : receipt);
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(dispatched).toHaveBeenCalledOnce();
      expect(onStepUpRequired).not.toHaveBeenCalled();
      expect(result.current.data).toBeUndefined();
    },
  );
});

describe('owned password proof replay', () => {
  it('freezes the password body before the first wait and sends only one proof replay', async () => {
    const csrfWait = deferred<string>();
    const grantWait = deferred<Response>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(csrfWait.promise);
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === grantPath) return grantWait.promise;
      return new Headers(init?.headers).has(STEP_UP_TOKEN_HEADER) ? json(receipt) : challenge();
    });
    const submitted = draft();
    const expectedBody = JSON.stringify({
      newPassword: submitted.newPassword,
      currentPassword: submitted.currentPassword,
    });
    const { result } = renderHook(useChangePassword, { wrapper });
    const pending = start(result.current, submitted);
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalledOnce());
    expect(getToken).not.toHaveBeenCalled();
    submitted.currentPassword = 'changed-during-csrf';
    submitted.newPassword = 'changed-during-csrf';
    submitted.confirmPassword = 'changed-during-csrf';
    await act(async () => { csrfWait.resolve('csrf-token'); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    submitted.currentPassword = null;
    submitted.newPassword = 'changed-during-grant';
    submitted.confirmPassword = 'changed-during-grant';

    await act(async () => {
      grantWait.resolve(json({ token: 'single-use-proof' }));
      await expect(pending).resolves.toEqual(receipt);
    });

    const writes = passwordWrites();
    expect(writes).toHaveLength(2);
    expect(dispatched).toHaveBeenCalledTimes(2);
    expect(onStepUpRequired).toHaveBeenCalledOnce();
    expect(writes[0]![1]?.body).toBe(expectedBody);
    expect(writes[1]![1]?.body).toBe(expectedBody);
    expect(new Headers(writes[0]![1]?.headers).has(STEP_UP_TOKEN_HEADER)).toBe(false);
    expect(new Headers(writes[1]![1]?.headers).get(STEP_UP_TOKEN_HEADER)).toBe('single-use-proof');
    const grants = fetchMock.mock.calls.filter(([url]) => String(url) === grantPath);
    expect(grants).toHaveLength(1);
    expect(JSON.parse(String(grants[0]![1]?.body))).toEqual({ action: 'password.change' });
    expect(grants[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.stepUpDialog).toBeNull();
  });

  it.each(['lost-response', 'second-challenge'] as const)(
    'never starts a third password write after a replay has a %s',
    async (outcome) => {
      fetchMock.mockImplementation(async (url, init) => {
        if (String(url) === grantPath) return json({ token: 'single-use-proof' });
        if (new Headers(init?.headers).has(STEP_UP_TOKEN_HEADER) && outcome === 'lost-response') {
          throw new TypeError('Replay response lost');
        }
        return challenge();
      });
      const { result } = renderHook(useChangePassword, { wrapper });
      await act(async () => {
        const error = await result.current.mutateAsync({ scope: scope(), draft: draft() })
          .catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        if (outcome === 'second-challenge') expect(error).toBeInstanceOf(PasswordMutationRejectedError);
        else expect(error).not.toBeInstanceOf(PasswordMutationRejectedError);
      });
      expect(passwordWrites()).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(dispatched).toHaveBeenCalledTimes(2);
      expect(onStepUpRequired).toHaveBeenCalledOnce();
      expect(result.current.stepUpDialog).toBeNull();
    },
  );

  it.each(['token', 'csrf', 'response', 'body'] as const)(
    'does not replay when the owner retires during silent-grant %s',
    async (gate) => {
      const authWait = deferred<string>();
      const responseWait = deferred<Response>();
      const bodyWait = deferred<unknown>();
      const grantResponse = json({});
      const parse = vi.spyOn(grantResponse, 'json').mockReturnValue(bodyWait.promise);
      if (gate === 'token') {
        getToken.mockResolvedValueOnce('captured-session-token').mockReturnValueOnce(authWait.promise);
      }
      if (gate === 'csrf') {
        vi.mocked(getCsrfToken).mockResolvedValueOnce('csrf-token').mockReturnValueOnce(authWait.promise);
      }
      fetchMock.mockImplementation(async (url) => {
        if (String(url) !== grantPath) return challenge();
        return gate === 'response' ? responseWait.promise : grantResponse;
      });
      const { result } = renderHook(useChangePassword, { wrapper });
      const pending = start(result.current);
      if (gate === 'token') await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));
      else if (gate === 'csrf') await waitFor(() => expect(getCsrfToken).toHaveBeenCalledTimes(2));
      else await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      if (gate === 'body') await waitFor(() => expect(parse).toHaveBeenCalledOnce());
      expect(onStepUpRequired).toHaveBeenCalledOnce();
      request.retire();

      await act(async () => {
        authWait.resolve('retired-value');
        responseWait.resolve(json({ token: 'retired-proof' }));
        bodyWait.resolve({ token: 'retired-proof' });
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });

      expect(passwordWrites()).toHaveLength(1);
      expect(dispatched).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(gate === 'token' || gate === 'csrf' ? 1 : 2);
      expect(result.current.stepUpDialog).toBeNull();
    },
  );
});

describe('password receipt validation and mutation retention', () => {
  it.each([0, 4, Number.MAX_SAFE_INTEGER])('accepts safe nonnegative receipt counts of %s', async (count) => {
    const expected = { ...receipt, otherSessionsEnded: count, deviceCredentialsRevoked: count };
    fetchMock.mockImplementation(async () => json(expected));
    const { result } = renderHook(useChangePassword, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ scope: scope(), draft: draft() })).resolves.toEqual(expected);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  const invalidCounts = [
    { label: 'missing', value: undefined },
    { label: 'null', value: null },
    { label: 'string', value: '1' },
    { label: 'boolean', value: true },
    { label: 'negative', value: -1 },
    { label: 'fractional', value: 0.5 },
    { label: 'unsafe integer', value: Number.MAX_SAFE_INTEGER + 1 },
    { label: 'infinite', value: Infinity },
    { label: 'not a number', value: NaN },
  ];
  const invalidReceipts = [
    { label: 'null receipt', value: null },
    { label: 'array receipt', value: [] },
    { label: 'missing success', value: { ...receipt, success: undefined } },
    { label: 'false success', value: { ...receipt, success: false } },
    { label: 'string success', value: { ...receipt, success: 'true' } },
    ...(['otherSessionsEnded', 'deviceCredentialsRevoked'] as const).flatMap((field) =>
      invalidCounts.map(({ label, value }) => ({
        label: `${field}: ${label}`,
        value: { ...receipt, [field]: value },
      }))),
    ...[...invalidCounts, { label: 'remaining session', value: 1 }].map(({ label, value }) => ({
      label: `otherSessionsRemaining: ${label}`,
      value: { ...receipt, otherSessionsRemaining: value },
    })),
  ];

  it.each(invalidReceipts)('keeps an invalid $label ambiguous rather than reporting success', async ({ value }) => {
    const response = json({});
    vi.spyOn(response, 'json').mockResolvedValue(value);
    fetchMock.mockResolvedValue(response);
    const { result } = renderHook(useChangePassword, { wrapper });
    await act(async () => {
      const error = await result.current.mutateAsync({ scope: scope(), draft: draft() })
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PasswordMutationRejectedError);
      expect(error).toMatchObject({ message: 'The password change receipt could not be confirmed.' });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.data).toBeUndefined();
  });

  it.each(['success', 'failure'] as const)(
    'releases settled %s variables from the observer and zero-GC cache after reset',
    async (outcome) => {
      vi.useFakeTimers();
      const submitted = draft();
      if (outcome === 'failure') fetchMock.mockRejectedValue(new TypeError('Response lost'));
      const { result } = renderHook(useChangePassword, { wrapper });
      await act(async () => {
        const pending = result.current.mutateAsync({ scope: scope(), draft: submitted });
        if (outcome === 'success') await expect(pending).resolves.toEqual(receipt);
        else await expect(pending).rejects.toThrow('Response lost');
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(client.getMutationCache().getAll()).toHaveLength(1);
      const mutation = client.getMutationCache().getAll()[0]!;
      expect(mutation.options.gcTime).toBe(0);
      expect(mutation.options.retry).toBe(false);
      expect(mutation.state.variables).toMatchObject({ draft: submitted });
      expect(result.current.variables?.draft).toBe(submitted);

      act(() => result.current.reset());
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      expect(result.current.status).toBe('idle');
      expect(result.current.variables).toBeUndefined();
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeNull();
      expect(client.getMutationCache().getAll()).toEqual([]);
      expect(submitted.newPassword).toBe('fixture-new-password');
    },
  );
});

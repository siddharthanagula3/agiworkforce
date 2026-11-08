import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type NativeSession = {
  id: string;
  user: { id: string };
  getToken: (options?: { skipCache?: boolean }) => Promise<string>;
  startVerification?: () => Promise<unknown>;
};
const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  listeners: new Set<() => void>(),
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: null as NativeSession | null,
    addListener:
      (_listener: () => void): (() => void) =>
      () =>
        undefined,
  },
  validate: null as Promise<void> | null,
  resolverCalls: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  panels: [] as Array<{ submit: React.FormEventHandler<HTMLFormElement>; clear: () => void }>,
}));
vi.mock('@clerk/nextjs', async (original) => ({
  ...(await original()),
  useAuth: () => fixture.auth,
  useClerk: () => fixture.sdk,
  useSession: () => ({ isLoaded: true, session: fixture.sdk.session }),
}));
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<MockedModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));
vi.mock('@hookform/resolvers/zod', async (original) => {
  const actual = await original<MockedModule1>();
  return {
    ...actual,
    zodResolver: (...args: Parameters<typeof actual.zodResolver>) => {
      const resolve = actual.zodResolver(...args);
      return async (...values: Parameters<typeof resolve>) => {
        fixture.resolverCalls();
        if (fixture.validate) await fixture.validate;
        return resolve(...values);
      };
    },
  };
});
vi.mock('./TwoFactor', async (original) => {
  const actual = await original<MockedModule2>();
  return {
    ...actual,
    PasswordPanel: (props: React.ComponentProps<typeof actual.PasswordPanel>) => {
      fixture.panels.push({ submit: props.onPasswordSubmit, clear: props.onReset });
      return <actual.PasswordPanel {...props} />;
    },
  };
});

import { getCsrfToken } from '@/lib/client/csrf';
import { PasswordEditor } from './PasswordEditor';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const receipt = {
  success: true,
  otherSessionsEnded: 2,
  otherSessionsRemaining: 0,
  deviceCredentialsRevoked: 3,
};
const challenge = () =>
  json(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'password.change',
          consequence: 'Change your password and sign out other devices.',
          freshnessSeconds: 300,
        },
      },
    },
    403,
  );
const verify = () =>
  json(
    {
      error: {
        code: 'STEP_UP_VERIFICATION_REQUIRED',
        details: { level: 'first_factor' },
        message: 'Confirm it is you.',
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
const fetchMock = vi.fn<typeof fetch>();
const writes = () =>
  fetchMock.mock.calls.filter(([path]) => String(path) === '/api/settings/password');
const grants = () => fetchMock.mock.calls.filter(([path]) => String(path) === '/api/auth/step-up');
let client: QueryClient;
let policy: { id: string; hasPassword: boolean };
let focus: React.RefObject<(() => void) | null>;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const latest = () => fixture.panels.at(-1)!;
const newInput = () => screen.getByPlaceholderText('Enter new password');
function fill(password = 'Submitted1!') {
  const old = screen.queryByPlaceholderText('Enter current password');
  if (old) fireEvent.change(old, { target: { value: 'Previous1!' } });
  fireEvent.change(newInput(), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
    target: { value: password },
  });
}
const submit = () => fireEvent.submit(newInput().closest('form')!);
function identity(userId: string, sessionId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
  for (const listener of [...fixture.listeners]) listener();
}
function aba() {
  const original = fixture.sdk.session;
  const auth = fixture.auth;
  const user = fixture.sdk.user;
  identity('b', 'session-b');
  fixture.sdk.session = original;
  fixture.auth = auth;
  fixture.sdk.user = user;
  for (const listener of [...fixture.listeners]) listener();
}
function mount(hasPassword = true) {
  policy = { id: 'a', hasPassword };
  return render(<PasswordEditor policy={policy} active focus={focus} />, { wrapper });
}
beforeEach(() => {
  fixture.listeners.clear();
  fixture.sdk.addListener = (listener) => {
    fixture.listeners.add(listener);
    listener();
    return () => {
      fixture.listeners.delete(listener);
    };
  };
  identity('a', 'session-a');
  fixture.validate = null;
  fixture.panels = [];
  fixture.resolverCalls.mockReset();
  fixture.success.mockReset();
  fixture.error.mockReset();
  focus = { current: null };
  policy = { id: 'a', hasPassword: true };
  client = new QueryClient({ defaultOptions: { mutations: { retry: 3, retryDelay: 0 } } });
  fetchMock.mockReset().mockResolvedValue(json(receipt));
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('password editor admission and lifetime', () => {
  it('admits one submission before deferred validation even under StrictMode and synchronous native subscription', async () => {
    render(
      <StrictMode>
        <PasswordEditor policy={policy} active focus={focus} />
      </StrictMode>,
      { wrapper },
    );
    fill();
    const validation = deferred<void>();
    fixture.validate = validation.promise;
    act(() => {
      submit();
      submit();
    });
    expect(newInput()).toBeDisabled();
    expect(screen.getByPlaceholderText('Enter current password')).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      validation.resolve();
    });
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(1);
    expect(newInput()).toHaveValue('');
    expect(new Headers(writes()[0]![1]?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(writes()[0]![1]?.credentials).toBe('omit');
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({
      currentPassword: 'Previous1!',
      newPassword: 'Submitted1!',
    });
  });

  it('sends no current password or confirmation field for a passwordless account', async () => {
    mount(false);
    fill();
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({ newPassword: 'Submitted1!' });
  });

  it('uses a confirmed set-password receipt until the original policy snapshot is refreshed', async () => {
    fetchMock.mockImplementation(async () => json(receipt));
    const mounted = mount(false);
    fill();
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(screen.getByPlaceholderText('Enter current password')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
    fill('Replacement2!');
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(writes()[1]![1]?.body))).toEqual({
      currentPassword: 'Previous1!',
      newPassword: 'Replacement2!',
    });
    policy = { id: 'a', hasPassword: false };
    mounted.rerender(<PasswordEditor policy={policy} active focus={focus} />);
    expect(screen.queryByPlaceholderText('Enter current password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
  });

  it('never carries the receipt-derived password mode to a replacement session', async () => {
    mount(false);
    fill();
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(screen.getByPlaceholderText('Enter current password')).toBeInTheDocument();
    act(() => identity('a', 'replacement-session'));
    expect(screen.queryByPlaceholderText('Enter current password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
  });

  it.each(['missing', 'another-user'] as const)(
    'does not admit a password editor with %s policy',
    (kind) => {
      const mismatched = kind === 'missing' ? null : { id: 'b', hasPassword: false };
      const mounted = render(<PasswordEditor policy={mismatched} active focus={focus} />, {
        wrapper,
      });
      expect(screen.queryByPlaceholderText('Enter new password')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      mounted.rerender(<PasswordEditor policy={policy} active focus={focus} />);
      expect(screen.getByPlaceholderText('Enter current password')).toBeInTheDocument();
    },
  );

  it('requires a current password without dispatch and allows correction', async () => {
    mount();
    fill();
    fireEvent.change(screen.getByPlaceholderText('Enter current password'), {
      target: { value: '' },
    });
    submit();
    await screen.findByText('Enter your current password');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Enter current password'), {
      target: { value: 'Previous1!' },
    });
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
  });

  it.each(['valid', 'invalid'] as const)(
    'cannot apply deferred %s validation to a cleared replacement',
    async (kind) => {
      mount();
      fill(kind === 'valid' ? 'Submitted1!' : 'invalid');
      const validation = deferred<void>();
      fixture.validate = validation.promise;
      submit();
      const retired = latest();
      act(() => retired.clear());
      expect(newInput()).toHaveValue('');
      fill('Replacement2!');
      await act(async () => {
        retired.clear();
        validation.resolve();
      });
      expect(newInput()).toHaveValue('Replacement2!');
      expect(writes()).toHaveLength(0);
      expect(screen.queryByText(/Password must contain/)).toBeNull();
    },
  );

  it('ignores repeated stale callbacks while a clear and replacement are batched', async () => {
    mount();
    fill();
    const validation = deferred<void>();
    fixture.validate = validation.promise;
    submit();
    const retired = latest();
    act(() => {
      retired.clear();
      retired.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>);
      retired.clear();
    });
    fill('Replacement2!');
    await act(async () => {
      validation.resolve();
      retired.clear();
    });
    expect(newInput()).toHaveValue('Replacement2!');
    expect(writes()).toHaveLength(0);
  });

  it('validates the copied submitted values, not edits made while the resolver waits', async () => {
    mount();
    fill('invalid');
    const validation = deferred<void>();
    fixture.validate = validation.promise;
    submit();
    fill('LaterValid2!');
    await act(async () => {
      validation.resolve();
    });
    await screen.findByText('Password must be at least 8 characters');
    expect(writes()).toHaveLength(0);
    expect(newInput()).toHaveValue('LaterValid2!');
  });

  it('retires deferred validation at Settings close, then opens a fresh form', async () => {
    const mounted = mount();
    fill();
    const validation = deferred<void>();
    fixture.validate = validation.promise;
    submit();
    const retired = latest();
    mounted.rerender(<PasswordEditor policy={policy} active={false} focus={focus} />);
    expect(screen.queryByPlaceholderText('Enter new password')).toBeNull();
    expect(focus.current).toBeNull();
    mounted.rerender(<PasswordEditor policy={policy} active focus={focus} />);
    fill('Replacement2!');
    await act(async () => {
      retired.clear();
      validation.resolve();
    });
    expect(newInput()).toHaveValue('Replacement2!');
    expect(writes()).toHaveLength(0);
    fixture.validate = null;
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
  });

  it('retains a dispatched unknown outcome through Settings close and reopening for the same session only', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const mounted = mount();
    fill();
    submit();
    await waitFor(() => expect(writes()).toHaveLength(1));
    const retired = latest();
    mounted.rerender(<PasswordEditor policy={policy} active={false} focus={focus} />);
    mounted.rerender(<PasswordEditor policy={policy} active focus={focus} />);
    expect(
      screen.getByText(/could not confirm the complete password change outcome/),
    ).toBeInTheDocument();
    act(() => retired.clear());
    fill('Replacement2!');
    submit();
    expect(writes()).toHaveLength(1);
    await act(async () => {
      response.resolve(json(receipt));
    });
    expect(fixture.success).not.toHaveBeenCalled();
    act(() => identity('b', 'session-b'));
    expect(screen.queryByText(/could not confirm the complete password change outcome/)).toBeNull();
    policy = { id: 'b', hasPassword: true };
    mounted.rerender(<PasswordEditor policy={policy} active focus={focus} />);
    expect(screen.queryByText(/could not confirm the complete password change outcome/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'I checked my sign-in and sessions' })).toBeNull();
    fetchMock.mockResolvedValue(json(receipt));
    fill('AccountB2!');
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(2);
    expect(new Headers(writes()[1]![1]?.headers).get('Authorization')).toBe('Bearer token-b');
  });

  it('retires a pending resolver when the canonical policy snapshot is replaced', async () => {
    const mounted = mount();
    fill();
    const validation = deferred<void>();
    fixture.validate = validation.promise;
    submit();
    const retired = latest();
    policy = { id: 'a', hasPassword: false };
    mounted.rerender(<PasswordEditor policy={policy} active focus={focus} />);
    expect(screen.queryByPlaceholderText('Enter current password')).toBeNull();
    fill('Replacement2!');
    await act(async () => {
      retired.clear();
      validation.resolve();
    });
    expect(newInput()).toHaveValue('Replacement2!');
    expect(writes()).toHaveLength(0);
  });

  it.each(['validation', 'csrf', 'token', 'response', 'success-body', 'error-body'] as const)(
    'retires %s across native A/B/A before React rerenders',
    async (boundary) => {
      const pending = deferred<string>();
      const validation = deferred<void>();
      const response = deferred<Response>();
      const body = deferred<unknown>();
      const parsing = vi.fn(() => body.promise);
      mount();
      fill();
      if (boundary === 'validation') fixture.validate = validation.promise;
      if (boundary === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(pending.promise);
      if (boundary === 'token') fixture.sdk.session!.getToken = vi.fn(() => pending.promise);
      if (boundary === 'response') fetchMock.mockReturnValue(response.promise);
      if (boundary.endsWith('body'))
        fetchMock.mockResolvedValue({
          ok: boundary === 'success-body',
          status: boundary === 'success-body' ? 200 : 409,
          json: parsing,
        } as unknown as Response);
      submit();
      if (boundary === 'validation')
        await waitFor(() => expect(fixture.resolverCalls).toHaveBeenCalled());
      else if (boundary === 'csrf') await waitFor(() => expect(getCsrfToken).toHaveBeenCalled());
      else if (boundary === 'token')
        await waitFor(() => expect(fixture.sdk.session!.getToken).toHaveBeenCalled());
      else await waitFor(() => expect(writes()).toHaveLength(1));
      if (boundary.endsWith('body')) await waitFor(() => expect(parsing).toHaveBeenCalled());
      act(() => aba());
      fill('Replacement2!');
      await act(async () => {
        validation.resolve();
        pending.resolve('old-token');
        response.resolve(json(receipt));
        body.resolve(boundary === 'error-body' ? { error: 'Old refusal' } : receipt);
      });
      expect(newInput()).toHaveValue('Replacement2!');
      expect(writes()).toHaveLength(
        ['response', 'success-body', 'error-body'].includes(boundary) ? 1 : 0,
      );
      expect(fixture.success).not.toHaveBeenCalled();
      expect(fixture.error).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each(['unmount', 'close', 'same-user-session', 'sign-out'] as const)(
    'aborts an in-flight password request on %s without a stale toast',
    async (transition) => {
      const response = deferred<Response>();
      fetchMock.mockReturnValue(response.promise);
      const mounted = mount();
      fill();
      submit();
      await waitFor(() => expect(writes()).toHaveLength(1));
      act(() => {
        if (transition === 'unmount') mounted.unmount();
        else if (transition === 'close')
          mounted.rerender(<PasswordEditor policy={policy} active={false} focus={focus} />);
        else if (transition === 'same-user-session') identity('a', 'session-a-new');
        else {
          fixture.auth.isSignedIn = false;
          fixture.sdk.session = null;
          for (const listener of [...fixture.listeners]) listener();
        }
      });
      expect(writes()[0]![1]?.signal?.aborted).toBe(true);
      await act(async () => {
        response.resolve(json(receipt));
      });
      expect(fixture.success).not.toHaveBeenCalled();
      expect(fixture.error).not.toHaveBeenCalled();
      mounted.unmount();
      expect(fixture.listeners.size).toBe(0);
    },
  );

  it('keeps a replacement request pending when the retired request finally settles', async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    mount();
    fill();
    submit();
    await waitFor(() => expect(writes()).toHaveLength(1));
    act(() => latest().clear());
    expect(
      screen.getByText(/could not confirm the complete password change outcome/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear password form' }));
    expect(
      screen.getByText(/could not confirm the complete password change outcome/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I checked my sign-in and sessions' }));
    fill('Replacement2!');
    submit();
    await waitFor(() => expect(writes()).toHaveLength(2));
    await act(async () => {
      old.resolve(json(receipt));
    });
    expect(newInput()).toHaveValue('Replacement2!');
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeDisabled();
    expect(fixture.success).not.toHaveBeenCalled();
    await act(async () => {
      fresh.resolve(json(receipt));
    });
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
  });
});

describe('password editor results and proof ownership', () => {
  it('keeps a known refusal editable and reports no success', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Your current password is not correct.' }, 400));
    mount();
    fill();
    submit();
    await screen.findByText('Your current password is not correct.');
    expect(newInput()).toHaveValue('Submitted1!');
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(json(receipt));
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(2);
  });

  it.each(['network', 'receipt', 'partial-cleanup'] as const)(
    'does not retry or claim rollback after %s',
    async (failure) => {
      if (failure === 'network') fetchMock.mockRejectedValue(new TypeError('Lost response'));
      if (failure === 'receipt') fetchMock.mockResolvedValue(json({ success: true }));
      const partial =
        'Your password was changed, but signing out your other devices did not finish. End your other sessions in Settings to finish.';
      if (failure === 'partial-cleanup')
        fetchMock.mockResolvedValue(json({ error: { message: partial } }, 503));
      mount();
      fill();
      submit();
      await screen.findByText(/could not confirm the complete password change outcome/);
      if (failure === 'partial-cleanup')
        expect(screen.getByRole('status')).toHaveTextContent(partial);
      expect(newInput()).toHaveValue('');
      fill('Replacement2!');
      submit();
      expect(writes()).toHaveLength(1);
      expect(fixture.success).not.toHaveBeenCalled();
      expect(fixture.error).not.toHaveBeenCalled();
    },
  );

  it('does not unlock an uncertain outcome through cosmetic form clearing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Lost response'));
    mount();
    fill();
    submit();
    await screen.findByText(/could not confirm the complete password change outcome/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear password form' }));
    fill('Replacement2!');
    submit();
    expect(writes()).toHaveLength(1);
    expect(
      screen.getByText(/could not confirm the complete password change outcome/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I checked my sign-in and sessions' }));
    fetchMock.mockResolvedValue(json(receipt));
    fill('Replacement2!');
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(2);
  });

  it('checks ownership again after receipt before toast or form replacement', async () => {
    client.clear();
    client = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => aba() }) });
    mount();
    fill();
    submit();
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(newInput()).toHaveValue(''));
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('replays one immutable password change after a captured silent grant', async () => {
    const grant = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up') return grant.promise;
      return new Headers(init?.headers).has('x-step-up-token') ? json(receipt) : challenge();
    });
    mount();
    fill();
    submit();
    await waitFor(() => expect(grants()).toHaveLength(1));
    fill('LaterEdit2!');
    await act(async () => {
      grant.resolve(json({ token: 'proof' }));
    });
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(2);
    expect(writes()[1]![1]?.body).toBe(writes()[0]![1]?.body);
    expect(new Headers(writes()[1]![1]?.headers).get('x-step-up-token')).toBe('proof');
    expect(new Headers(grants()[0]![1]?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(grants()[0]![1]?.credentials).toBe('omit');
    expect(JSON.parse(String(grants()[0]![1]?.body))).toEqual({ action: 'password.change' });
  });

  it('finishes native verification with a captured fresh token grant and one proof replay', async () => {
    const start = vi.fn(async () => ({ status: 'complete' }));
    const getToken = vi.fn(async (options?: { skipCache?: boolean }) =>
      options?.skipCache ? 'fresh-a' : 'token-a',
    );
    fixture.sdk.session!.startVerification = start;
    fixture.sdk.session!.getToken = getToken;
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up')
        return grants().length === 1 ? verify() : json({ token: 'verified-proof' });
      return new Headers(init?.headers).has('x-step-up-token') ? json(receipt) : challenge();
    });
    mount(false);
    fill();
    submit();
    await waitFor(() => expect(fixture.success).toHaveBeenCalledOnce());
    expect(start).toHaveBeenCalledWith({ level: 'first_factor' });
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(grants()).toHaveLength(2);
    expect(new Headers(grants()[1]![1]?.headers).get('Authorization')).toBe('Bearer fresh-a');
    expect(grants()[1]![1]?.credentials).toBe('omit');
    expect(writes()).toHaveLength(2);
    expect(writes()[1]![1]?.body).toBe(writes()[0]![1]?.body);
    expect(new Headers(writes()[1]![1]?.headers).get('x-step-up-token')).toBe('verified-proof');
    expect(screen.getByPlaceholderText('Enter current password')).toHaveValue('');
  });

  it('keeps current verification cancellation quiet and editable', async () => {
    fixture.sdk.session!.startVerification = vi.fn(async () => ({
      status: 'needs_first_factor',
      supportedFirstFactors: [{ strategy: 'password' }],
    }));
    fetchMock.mockImplementation(async (path) =>
      String(path) === '/api/auth/step-up' ? verify() : challenge(),
    );
    mount();
    fill();
    fireEvent.blur(screen.getByPlaceholderText('Enter current password'));
    fireEvent.blur(newInput());
    fireEvent.blur(screen.getByPlaceholderText('Confirm new password'));
    const save = screen.getByRole('button', { name: 'Change Password' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(newInput()).toHaveValue('Submitted1!');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change Password' })).toBeEnabled(),
    );
    expect(screen.queryByText(/could not confirm/)).toBeNull();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });

  it.each(['silent-grant', 'native-verification', 'fresh-token', 'verified-grant'] as const)(
    'never replays for a retired editor during %s',
    async (stage) => {
      const pause = deferred<Response>();
      const native = deferred<unknown>();
      const token = deferred<string>();
      const nativeStart = vi.fn(() =>
        stage === 'native-verification' ? native.promise : Promise.resolve({ status: 'complete' }),
      );
      fixture.sdk.session!.startVerification = nativeStart;
      const getToken = vi.fn(async (options?: { skipCache?: boolean }) => {
        if (options?.skipCache) return stage === 'fresh-token' ? token.promise : 'fresh-a';
        return 'token-a';
      });
      fixture.sdk.session!.getToken = getToken;
      fetchMock.mockImplementation(async (path) => {
        if (String(path) !== '/api/auth/step-up') return challenge();
        if (stage === 'silent-grant' || grants().length > 1) return pause.promise;
        return verify();
      });
      mount();
      fill();
      submit();
      if (stage === 'silent-grant') await waitFor(() => expect(grants()).toHaveLength(1));
      if (stage === 'native-verification')
        await waitFor(() => expect(nativeStart).toHaveBeenCalled());
      if (stage === 'fresh-token')
        await waitFor(() => expect(getToken).toHaveBeenCalledWith({ skipCache: true }));
      if (stage === 'verified-grant') await waitFor(() => expect(grants()).toHaveLength(2));
      act(() => aba());
      fill('Replacement2!');
      await act(async () => {
        native.resolve({ status: 'complete' });
        token.resolve('late-fresh-a');
        pause.resolve(json({ token: 'late-proof' }));
      });
      expect(writes()).toHaveLength(1);
      expect(grants()).toHaveLength(stage === 'verified-grant' ? 2 : 1);
      expect(newInput()).toHaveValue('Replacement2!');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(fixture.success).not.toHaveBeenCalled();
      expect(fixture.error).not.toHaveBeenCalled();
    },
  );

  it('cancels waiting after a recognized step-up refusal without reporting uncertain change', async () => {
    const grant = deferred<Response>();
    fetchMock.mockImplementation(async (path) =>
      String(path) === '/api/auth/step-up' ? grant.promise : challenge(),
    );
    mount();
    fill();
    submit();
    await waitFor(() => expect(grants()).toHaveLength(1));
    act(() => latest().clear());
    await act(async () => {
      grant.resolve(json({ token: 'late-proof' }));
    });
    expect(writes()).toHaveLength(1);
    expect(screen.queryByText(/could not confirm/)).toBeNull();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
  });
});

type MockedModule0 = typeof import('@/lib/client/csrf');
type MockedModule1 = typeof import('@hookform/resolvers/zod');
type MockedModule2 = typeof import('./TwoFactor');

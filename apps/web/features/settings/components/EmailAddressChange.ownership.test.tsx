import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Address = {
  id: string;
  emailAddress: string;
  verification: { status: string };
  prepareVerification: (input: { strategy: string }) => Promise<Address>;
  attemptVerification: (input: { code: string }) => Promise<Address>;
};
type User = { id: string; emailAddresses: Address[]; reload: () => Promise<User> };
type Session = { id: string; user: User; getToken: (options?: { skipCache?: boolean }) => Promise<string>;
  startVerification?: () => Promise<unknown> };
const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  listeners: new Set<() => void>(),
  sdk: { loaded: true, user: null as User | null, session: null as Session | null,
    addListener: (_listener: () => void): (() => void) => () => undefined },
  inputs: [] as Array<{ onKeyDown?: React.KeyboardEventHandler<HTMLInputElement> }>,
  dialogs: [] as Array<{ onOpenChange?: (open: boolean) => void }>,
  confirmations: [] as Array<{ onConfirm: () => unknown; onCancel?: () => void }>,
}));
vi.mock('@clerk/nextjs', async (original) => ({
  ...await original<typeof import('@clerk/nextjs')>(),
  useAuth: () => fixture.auth,
  useClerk: () => fixture.sdk,
  useUser: () => ({ user: fixture.sdk.user }),
  useSession: () => ({ session: fixture.sdk.session }),
}));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...await original<typeof import('@/lib/client/csrf')>(), getCsrfToken: vi.fn(async () => 'csrf'),
}));
vi.mock('@agiworkforce/ui', async (original) => {
  const actual = await original<typeof import('@agiworkforce/ui')>();
  return { ...actual, Input: (props: React.ComponentProps<typeof actual.Input>) => {
    fixture.inputs.push(props); return <actual.Input {...props} />;
  }, Dialog: (props: React.ComponentProps<typeof actual.Dialog>) => {
    fixture.dialogs.push(props); return <actual.Dialog {...props} />;
  }, useConfirmAction: () => {
    const result = actual.useConfirmAction();
    return { ...result, confirm: (request: Parameters<typeof result.confirm>[0]) => {
      fixture.confirmations.push(request); result.confirm(request);
    } };
  } };
});

import { getCsrfToken } from '@/lib/client/csrf';
import { EmailAddressChange } from './EmailAddressChange';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const receipt = { emailAddress: 'new@example.com', previousAddressRemoved: false };
const challenge = () => json({ error: { code: 'STEP_UP_REQUIRED', details: {
  action: 'email.change', consequence: 'Change account email.', freshnessSeconds: 300,
} } }, 403);
const needsVerification = () => json({ error: { code: 'STEP_UP_VERIFICATION_REQUIRED',
  details: { level: 'first_factor' }, message: 'Confirm it is you.' } }, 403);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const fetchMock = vi.fn<typeof fetch>();
const changed = vi.fn();
const closed = vi.fn();
const writes = (method?: string) => fetchMock.mock.calls.filter(([path, init]) =>
  String(path) === '/api/settings/email' && (!method || init?.method === method));
const grants = () => fetchMock.mock.calls.filter(([path]) => String(path) === '/api/auth/step-up');
function identity(id: string, sessionId = `session-${id}`) {
  const address: Address = { id: 'email-new', emailAddress: 'new@example.com', verification: { status: 'unverified' },
    prepareVerification: vi.fn(async () => address),
    attemptVerification: vi.fn(async () => { address.verification.status = 'verified'; return address; }) };
  const user: User = { id, emailAddresses: [address], reload: vi.fn(async () => user) };
  fixture.auth = { isLoaded: true, isSignedIn: true, userId: id, sessionId };
  fixture.sdk.user = user;
  fixture.sdk.session = { id: sessionId, user, getToken: vi.fn(async () => `token-${id}`) };
  for (const listener of [...fixture.listeners]) listener();
}
function aba() {
  const session = fixture.sdk.session; const user = fixture.sdk.user; const auth = fixture.auth;
  identity('b');
  fixture.sdk.session = session; fixture.sdk.user = user; fixture.auth = auth;
  for (const listener of [...fixture.listeners]) listener();
}
function view(active = true, accountId: string | null = 'a') {
  return <EmailAddressChange active={active} accountId={accountId} currentEmail="old@example.com" onChanged={changed} onClose={closed} />;
}
function submitAddress() {
  fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
}
async function enterCode() {
  const input = await screen.findByLabelText('Code sent to new@example.com');
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change address' }));
}
async function approve() {
  const dialog = await screen.findByRole('alertdialog', { name: 'Use this email address?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Change address' }));
}
beforeEach(() => {
  fixture.listeners.clear(); fixture.confirmations = []; fixture.dialogs = []; fixture.inputs = [];
  fixture.sdk.addListener = (listener) => {
    fixture.listeners.add(listener); listener();
    return () => { fixture.listeners.delete(listener); };
  };
  identity('a'); changed.mockReset(); closed.mockReset();
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
  fetchMock.mockReset().mockImplementation(async (_path, init) => init?.method === 'POST'
    ? json({ emailAddressId: 'email-new', verified: false }, 201) : json(receipt));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('email editor ownership and completion', () => {
  it('owns one complete add, code and primary change under StrictMode with synchronous subscriptions', async () => {
    render(<StrictMode>{view()}</StrictMode>);
    const token = deferred<string>();
    vi.mocked(fixture.sdk.session!.getToken).mockReturnValueOnce(token.promise);
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.com' } });
    const input = screen.getByLabelText('New email address');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.change(input, { target: { value: 'later@example.com' } });
    });
    expect(input).toHaveValue('new@example.com');
    await act(async () => { token.resolve('token-a'); });
    await enterCode(); await approve();
    await screen.findByText('Your account now uses new@example.com.');
    expect(writes('POST')).toHaveLength(1); expect(writes('PATCH')).toHaveLength(1);
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0]![0]).toBe('new@example.com');
    await waitFor(() => expect(screen.queryByText('Refreshing account details…')).toBeNull());
    expect(changed.mock.calls[0]![1].isCurrent()).toBe(false);
    for (const [, init] of writes()) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
      expect(init?.credentials).toBe('omit'); expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(JSON.parse(String(writes('POST')[0]![1]?.body))).toEqual({ emailAddress: 'new@example.com' });
    expect(JSON.parse(String(writes('PATCH')[0]![1]?.body))).toEqual({ emailAddressId: 'email-new' });
  });

  it('does not admit a mismatched account and validates before dispatch', async () => {
    const mounted = render(view(true, 'b'));
    expect(screen.queryByLabelText('New email address')).toBeNull();
    mounted.rerender(view());
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByText('Enter a valid email address.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cannot close an admitted replacement through an old loading dialog callback', () => {
    const mounted = render(view(true, null));
    const staleClose = fixture.dialogs.at(-1)!.onOpenChange!;
    mounted.rerender(view());
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'replacement@example.com' } });
    act(() => staleClose(false));
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New email address')).toHaveValue('replacement@example.com');
  });

  it.each(['csrf', 'token', 'response', 'body', 'native-reload', 'native-prepare'] as const)(
    'retires an add at %s across native A/B/A before React rerenders', async (boundary) => {
      const text = deferred<string>(); const response = deferred<Response>(); const body = deferred<unknown>();
      const user = fixture.sdk.user!; const address = user.emailAddresses[0]!;
      const reloaded = deferred<User>(); const prepared = deferred<Address>();
      if (boundary === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(text.promise);
      if (boundary === 'token') vi.mocked(fixture.sdk.session!.getToken).mockReturnValueOnce(text.promise);
      if (boundary === 'response') fetchMock.mockReturnValueOnce(response.promise);
      if (boundary === 'body') fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: () => body.promise } as Response);
      if (boundary === 'native-reload') vi.mocked(user.reload).mockReturnValueOnce(reloaded.promise);
      if (boundary === 'native-prepare') vi.mocked(address.prepareVerification).mockReturnValueOnce(prepared.promise);
      render(view()); submitAddress();
      if (boundary === 'csrf') await waitFor(() => expect(getCsrfToken).toHaveBeenCalled());
      else if (boundary === 'token') await waitFor(() => expect(fixture.sdk.session!.getToken).toHaveBeenCalled());
      else if (boundary === 'native-reload') await waitFor(() => expect(user.reload).toHaveBeenCalled());
      else if (boundary === 'native-prepare') await waitFor(() => expect(address.prepareVerification).toHaveBeenCalled());
      else await waitFor(() => expect(writes()).toHaveLength(1));
      act(aba);
      expect(screen.getByLabelText('New email address')).toHaveValue('');
      await act(async () => {
        text.resolve('late-token'); response.resolve(json({ emailAddressId: 'email-new', verified: false }));
        body.resolve({ emailAddressId: 'email-new', verified: false }); reloaded.resolve(user); prepared.resolve(address);
      });
      expect(writes()).toHaveLength(boundary === 'csrf' || boundary === 'token' ? 0 : 1);
      expect(changed).not.toHaveBeenCalled(); expect(writes('PATCH')).toHaveLength(0);
      expect(screen.getByLabelText('New email address')).toHaveValue('');
      if (boundary !== 'native-prepare') expect(address.prepareVerification).not.toHaveBeenCalled();
    },
  );

  it.each(['csrf', 'response', 'success-body', 'error-body'] as const)(
    'retires primary promotion at %s without changing replacement account state', async (boundary) => {
      const mounted = render(view()); submitAddress(); await enterCode();
      const text = deferred<string>(); const response = deferred<Response>(); const body = deferred<unknown>();
      if (boundary === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(text.promise);
      if (boundary === 'response') fetchMock.mockReturnValueOnce(response.promise);
      if (boundary === 'success-body' || boundary === 'error-body') fetchMock.mockResolvedValueOnce({
        ok: boundary === 'success-body', status: boundary === 'success-body' ? 200 : 503, json: () => body.promise,
      } as Response);
      await approve();
      if (boundary === 'csrf') await waitFor(() => expect(getCsrfToken).toHaveBeenCalledTimes(2));
      else await waitFor(() => expect(writes('PATCH')).toHaveLength(1));
      act(aba); mounted.rerender(view());
      await act(async () => { text.resolve('late-csrf'); response.resolve(json(receipt)); body.resolve(receipt); });
      expect(changed).not.toHaveBeenCalled();
      expect(writes('PATCH')).toHaveLength(boundary === 'csrf' ? 0 : 1);
      expect(screen.getByLabelText('New email address')).toHaveValue('');
      expect(screen.queryByText(/complete email change outcome/)).toBeNull();
    },
  );

  it('retires unmounted work and its retained loading close callback', async () => {
    const pending = deferred<string>(); vi.mocked(getCsrfToken).mockReturnValueOnce(pending.promise);
    const loading = render(view(true, null));
    const staleClose = fixture.dialogs.at(-1)!.onOpenChange!;
    loading.unmount(); act(() => staleClose(false));
    expect(closed).not.toHaveBeenCalled();
    const mounted = render(view()); submitAddress();
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalled());
    mounted.unmount();
    await act(async () => { pending.resolve('late-csrf'); });
    expect(writes()).toHaveLength(0); expect(changed).not.toHaveBeenCalled();
  });

  it('retires code verification and never promotes its late result', async () => {
    const verified = deferred<Address>(); const address = fixture.sdk.user!.emailAddresses[0]!;
    vi.mocked(address.attemptVerification).mockReturnValueOnce(verified.promise);
    render(view()); submitAddress(); await enterCode();
    await waitFor(() => expect(address.attemptVerification).toHaveBeenCalledOnce());
    act(aba);
    await act(async () => { address.verification.status = 'verified'; verified.resolve(address); });
    expect(fixture.confirmations).toHaveLength(0); expect(writes('PATCH')).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
  });

  it('rejects stale address-stage submit and close callbacks after entering the code stage', async () => {
    render(view());
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.com' } });
    const oldSubmit = fixture.inputs.at(-1)!.onKeyDown!;
    const oldClose = fixture.dialogs.at(-1)!.onOpenChange!;
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByLabelText('Code sent to new@example.com');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled());
    act(() => {
      oldSubmit({ key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>);
      oldClose(false);
    });
    expect(writes('POST')).toHaveLength(1); expect(closed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Code sent to new@example.com')).toBeInTheDocument();
  });

  it('checks an already-verified add receipt against native state before primary promotion', async () => {
    const address = fixture.sdk.user!.emailAddresses[0]!;
    fetchMock.mockResolvedValueOnce(json({ emailAddressId: 'email-new', verified: true }));
    render(view()); submitAddress(); await approve();
    await screen.findByText(/not currently verified. Close this dialog and start again/);
    expect(writes('PATCH')).toHaveLength(0); expect(address.prepareVerification).not.toHaveBeenCalled();
    expect(address.attemptVerification).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });

  it('promotes an already-verified matching native address without sending or verifying a code', async () => {
    const address = fixture.sdk.user!.emailAddresses[0]!; address.verification.status = 'verified';
    fetchMock.mockResolvedValueOnce(json({ emailAddressId: 'email-new', verified: true }));
    render(view()); submitAddress(); await approve();
    await screen.findByText('Your account now uses new@example.com.');
    expect(address.prepareVerification).not.toHaveBeenCalled(); expect(address.attemptVerification).not.toHaveBeenCalled();
    expect(writes('PATCH')).toHaveLength(1); expect(changed).toHaveBeenCalledOnce();
  });

  it('retires old confirmation callbacks on close and preserves replacement draft', async () => {
    const mounted = render(view()); submitAddress(); await enterCode();
    await screen.findByRole('alertdialog', { name: 'Use this email address?' });
    const old = fixture.confirmations.at(-1)!;
    mounted.rerender(view(false)); mounted.rerender(view());
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'replacement@example.com' } });
    await act(async () => { await old.onConfirm(); old.onCancel?.(); });
    expect(writes('PATCH')).toHaveLength(0);
    expect(screen.getByLabelText('New email address')).toHaveValue('replacement@example.com');
  });

  it('does not duplicate promotion when a confirmation callback fires twice', async () => {
    render(view()); submitAddress(); await enterCode();
    await screen.findByRole('alertdialog', { name: 'Use this email address?' });
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const confirmation = fixture.confirmations.at(-1)!;
    act(() => { void confirmation.onConfirm(); void confirmation.onConfirm(); });
    await waitFor(() => expect(writes('PATCH')).toHaveLength(1));
    await act(async () => { pending.resolve(json(receipt)); });
    expect(changed).toHaveBeenCalledOnce();
  });

  it('retains unknown dispatched outcomes across close and reopen for the same session only', async () => {
    const response = deferred<Response>(); fetchMock.mockReturnValueOnce(response.promise);
    const mounted = render(view()); submitAddress();
    await waitFor(() => expect(writes()).toHaveLength(1));
    mounted.rerender(view(false));
    expect(writes()[0]![1]?.signal?.aborted).toBe(true);
    mounted.rerender(view());
    expect(screen.getByText(/could not confirm the complete email change outcome/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New email address')).toBeNull();
    await act(async () => { response.resolve(json({ emailAddressId: 'email-new', verified: false })); });
    expect(changed).not.toHaveBeenCalled(); expect(writes()).toHaveLength(1);
    act(aba);
    expect(screen.queryByText(/could not confirm the complete email change outcome/)).toBeNull();
    expect(screen.getByLabelText('New email address')).toHaveValue('');
  });

  it.each(['network', 'partial-4xx', 'malformed-receipt'] as const)('blocks re-add after %s without claiming rollback', async (failure) => {
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Response lost'));
    if (failure === 'partial-4xx') fetchMock.mockResolvedValueOnce(json({ error: 'Provider rejected add after stale-address cleanup.' }, 400));
    if (failure === 'malformed-receipt') fetchMock.mockResolvedValueOnce(json({ emailAddressId: 'email-new', verified: 'yes' }));
    render(view()); submitAddress();
    await screen.findByText(/could not confirm the complete email change outcome/);
    expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull();
    expect(writes()).toHaveLength(1); expect(changed).not.toHaveBeenCalled();
  });

  it('never treats a resolved nonverified native attempt as permission to promote', async () => {
    const address = fixture.sdk.user!.emailAddresses[0]!;
    vi.mocked(address.attemptVerification).mockResolvedValueOnce(address);
    render(view()); submitAddress(); await enterCode();
    await screen.findByText(/verification could not be confirmed/);
    expect(writes('PATCH')).toHaveLength(0); expect(fixture.confirmations).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
  });

  it('retries a failed native code send without adding the address again', async () => {
    const address = fixture.sdk.user!.emailAddresses[0]!;
    vi.mocked(address.prepareVerification).mockRejectedValueOnce(new Error('Delivery response was lost.'));
    render(view()); submitAddress();
    await screen.findByText(/Code delivery was not confirmed/);
    expect(screen.getByLabelText('Verification code for new@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    await screen.findByLabelText('Code sent to new@example.com');
    expect(address.prepareVerification).toHaveBeenCalledTimes(2);
    expect(writes('POST')).toHaveLength(1); expect(writes('PATCH')).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
  });

  it('retries a nonverified code result without re-adding or promoting before confirmation', async () => {
    const address = fixture.sdk.user!.emailAddresses[0]!;
    vi.mocked(address.attemptVerification).mockResolvedValueOnce(address);
    render(view()); submitAddress(); await enterCode();
    await screen.findByText(/Address verification was not confirmed/);
    expect(fixture.confirmations).toHaveLength(0);
    await enterCode();
    await screen.findByRole('alertdialog', { name: 'Use this email address?' });
    expect(address.attemptVerification).toHaveBeenCalledTimes(2);
    expect(writes('POST')).toHaveLength(1); expect(writes('PATCH')).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
    await approve(); await screen.findByText('Your account now uses new@example.com.');
    expect(writes('POST')).toHaveLength(1); expect(writes('PATCH')).toHaveLength(1);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('rejects a primary receipt for another address', async () => {
    render(view()); submitAddress(); await enterCode();
    fetchMock.mockResolvedValueOnce(json({ ...receipt, emailAddress: 'other@example.com' }));
    await approve(); await screen.findByText(/could not confirm the complete email change outcome/);
    expect(changed).not.toHaveBeenCalled(); expect(writes('PATCH')).toHaveLength(1);
  });

  it('settles confirmed success refresh feedback when a same-account native user resource is replaced', async () => {
    render(view()); submitAddress(); await enterCode();
    const user = fixture.sdk.user!; const refresh = deferred<User>();
    vi.mocked(user.reload).mockResolvedValueOnce(user).mockReturnValueOnce(refresh.promise);
    await approve();
    await screen.findByText('Refreshing account details…');
    act(() => {
      fixture.sdk.session!.user = { ...user };
      for (const listener of [...fixture.listeners]) listener();
    });
    await act(async () => { refresh.resolve(user); });
    await screen.findByText(/Your email was changed, but account details could not refresh/);
    expect(screen.queryByText('Refreshing account details…')).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
  });

  it.each(['pending', 'failed'] as const)('publishes confirmed primary success before a %s refresh', async (kind) => {
    render(view()); submitAddress(); await enterCode();
    const user = fixture.sdk.user!; const refresh = deferred<User>();
    vi.mocked(user.reload).mockResolvedValueOnce(user).mockReturnValueOnce(refresh.promise);
    await approve();
    await screen.findByText('Your account now uses new@example.com.');
    expect(changed).toHaveBeenCalledOnce();
    expect(screen.getByText('Refreshing account details…')).toBeInTheDocument();
    if (kind === 'failed') {
      await act(async () => { refresh.reject(new Error('Refresh unavailable')); });
      await screen.findByText(/Your email was changed, but account details could not refresh/);
      expect(screen.queryByText(/complete email change outcome/)).toBeNull();
    }
  });
});

describe('email owned step-up', () => {
  it('uses captured bearer auth for silent grants and replays exactly one immutable POST', async () => {
    const grant = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) => String(path) === '/api/auth/step-up' ? grant.promise
      : new Headers(init?.headers).has('x-step-up-token') ? json({ emailAddressId: 'email-new', verified: false }) : challenge());
    render(view()); submitAddress();
    await waitFor(() => expect(grants()).toHaveLength(1));
    await act(async () => { grant.resolve(json({ token: 'proof-a' })); });
    await screen.findByLabelText('Code sent to new@example.com');
    expect(writes('POST')).toHaveLength(2);
    expect(writes()[1]![1]?.body).toBe(writes()[0]![1]?.body);
    expect(new Headers(writes()[1]![1]?.headers).get('x-step-up-token')).toBe('proof-a');
    expect(new Headers(grants()[0]![1]?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(grants()[0]![1]?.credentials).toBe('omit');
  });

  it('reverifies the captured session and replays one immutable primary change with its address-scoped proof', async () => {
    fixture.sdk.session!.startVerification = vi.fn(async () => ({ status: 'complete' }));
    fixture.sdk.session!.getToken = vi.fn(async (options?: { skipCache?: boolean }) => options?.skipCache ? 'fresh-a' : 'token-a');
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up') return grants().length === 1 ? needsVerification() : json({ token: 'primary-proof' });
      if (init?.method === 'POST') return json({ emailAddressId: 'email-new', verified: false });
      return new Headers(init?.headers).has('x-step-up-token') ? json(receipt) : challenge();
    });
    render(view()); submitAddress(); await enterCode(); await approve();
    await screen.findByText('Your account now uses new@example.com.');
    expect(writes('POST')).toHaveLength(1); expect(writes('PATCH')).toHaveLength(2);
    expect(writes('PATCH')[1]![1]?.body).toBe(writes('PATCH')[0]![1]?.body);
    expect(new Headers(writes('PATCH')[1]![1]?.headers).get('x-step-up-token')).toBe('primary-proof');
    expect(grants()).toHaveLength(2);
    for (const [, init] of grants()) {
      expect(JSON.parse(String(init?.body))).toEqual({ action: 'email.change', resourceId: 'email-new' });
      expect(init?.credentials).toBe('omit');
    }
    expect(new Headers(grants()[1]![1]?.headers).get('Authorization')).toBe('Bearer fresh-a');
    expect(changed).toHaveBeenCalledOnce();
  });

  it.each(['silent-grant', 'native-verification', 'fresh-token', 'verified-grant'] as const)(
    'does not replay an add retired during %s', async (boundary) => {
      const response = deferred<Response>(); const native = deferred<unknown>(); const token = deferred<string>();
      const start = vi.fn(() => boundary === 'native-verification' ? native.promise : Promise.resolve({ status: 'complete' }));
      fixture.sdk.session!.startVerification = start;
      const getToken = vi.fn(async (options?: { skipCache?: boolean }) => options?.skipCache
        ? boundary === 'fresh-token' ? token.promise : 'fresh-a' : 'token-a');
      fixture.sdk.session!.getToken = getToken;
      fetchMock.mockImplementation(async (path) => {
        if (String(path) !== '/api/auth/step-up') return challenge();
        return boundary === 'silent-grant' || grants().length > 1 ? response.promise : needsVerification();
      });
      render(view()); submitAddress();
      if (boundary === 'silent-grant') await waitFor(() => expect(grants()).toHaveLength(1));
      if (boundary === 'native-verification') await waitFor(() => expect(start).toHaveBeenCalled());
      if (boundary === 'fresh-token') await waitFor(() => expect(getToken).toHaveBeenCalledWith({ skipCache: true }));
      if (boundary === 'verified-grant') await waitFor(() => expect(grants()).toHaveLength(2));
      act(aba);
      await act(async () => { response.resolve(json({ token: 'late-proof' })); native.resolve({ status: 'complete' }); token.resolve('late-token'); });
      expect(writes('POST')).toHaveLength(1); expect(changed).not.toHaveBeenCalled();
      expect(screen.getByLabelText('New email address')).toHaveValue('');
      expect(screen.queryByRole('dialog', { name: 'Confirm it is you' })).toBeNull();
    },
  );

  it('keeps cancellation after a recognized refusal quiet without unknown-mutation warning', async () => {
    fixture.sdk.session!.startVerification = vi.fn(async () => ({ status: 'needs_first_factor', supportedFirstFactors: [{ strategy: 'password' }] }));
    fetchMock.mockImplementation(async (path) => String(path) === '/api/auth/step-up' ? needsVerification() : challenge());
    render(view()); submitAddress();
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled());
    expect(screen.queryByText(/complete email change outcome/)).toBeNull();
    expect(writes()).toHaveLength(1); expect(changed).not.toHaveBeenCalled();
  });
});

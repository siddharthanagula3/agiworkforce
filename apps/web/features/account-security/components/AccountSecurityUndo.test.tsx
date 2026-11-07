import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_SECURITY_ENROLLMENT_UNDO_PATH,
  ACCOUNT_SECURITY_POLICY,
} from '@agiworkforce/cloud-contracts/account-security';

const fixture = vi.hoisted(() => ({
  confirmations: [] as Array<{
    title: string;
    description: string;
    onConfirm: () => unknown | Promise<unknown>;
    onCancel?: () => void;
  }>,
}));

// Keep the real confirmation hook and dialog; retain callbacks only to model stale
// and duplicate delivery. Transport/CSRF are controlled, not a browser/server proof.
vi.mock('@agiworkforce/ui', async (original) => {
  const actual = await original<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    useConfirmAction: () => {
      const result = actual.useConfirmAction();
      return {
        ...result,
        confirm: (request: Parameters<typeof result.confirm>[0]) => {
          fixture.confirmations.push(request);
          result.confirm(request);
        },
      };
    },
  };
});
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<typeof import('@/lib/client/csrf')>()),
  addCsrfHeaders: vi.fn(),
}));
vi.mock('@/features/auth/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import { addCsrfHeaders } from '@/lib/client/csrf';
import AccountSecurityUndoPage from '@/app/login/not-me/page';
import { AUTH_LOGIN_PATH } from '@/features/auth/authRoutes';
import { AccountSecurityUndo } from './AccountSecurityUndo';

const token = 'a'.repeat(43);
const nextToken = 'b'.repeat(43);
const actionName = 'Turn off Advanced Account Security';
const confirmName = 'Turn off and remove registrations';
const success =
  'Advanced Account Security was turned off. Review your sign-in methods and active sessions. Account recovery may need further attention.';
const fetchMock = vi.fn<typeof fetch>();
const gates: Array<() => void> = [];
const receipt = (passwordReset = false) => ({ sessionsSignedOut: 98765, passwordReset });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  gates.push(() => resolve(fallback));
  return { promise, resolve };
}
function setLink(fragment = token) {
  window.history.replaceState(null, '', `/login/not-me#${fragment}`);
}
function changeLink() {
  setLink(nextToken);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
function openConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: actionName, exact: true }));
  return screen.getByRole('alertdialog');
}
function acceptConfirmation() {
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: confirmName }),
  );
}
function expectNoRetry() {
  const action = screen.queryByRole('button', { name: actionName, exact: true });
  if (action) expect(action).toBeDisabled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
}

beforeEach(() => {
  fixture.confirmations = [];
  setLink();
  vi.mocked(addCsrfHeaders).mockReset().mockResolvedValue({ 'x-csrf-token': 'fixture-csrf' });
  fetchMock.mockReset().mockResolvedValue(json(receipt()));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const settle of gates.splice(0)) settle();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('anonymous undo-link intent and outcome fixtures', () => {
  it('captures and scrubs the original fragment across Strict Mode replay without auto-dispatch', async () => {
    render(
      <StrictMode>
        <AccountSecurityUndo />
      </StrictMode>,
    );
    expect(window.location.hash).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    const dialog = openConfirmation();
    expect(dialog).toHaveTextContent(/permanent/i);
    expect(dialog).toHaveTextContent(/recovery keys/i);
    expect(dialog).toHaveTextContent(/registrations/i);
    expect(dialog).toHaveTextContent(/existed when/i);
    expect(fetchMock).not.toHaveBeenCalled();
    acceptConfirmation();
    expect(await screen.findByText(success)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(ACCOUNT_SECURITY_ENROLLMENT_UNDO_PATH);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ token });
  });

  it.each(['', 'short', '%E0%A4%A', `${token}!`, `${token}%0A`])(
    'rejects incomplete or malformed fragment %j without dispatch',
    (fragment) => {
      setLink(fragment);
      render(<AccountSecurityUndo />);
      expect(screen.getByRole('alert')).toHaveTextContent(/incomplete/i);
      expect(window.location.hash).toBe('');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('cancels through the real dialog and allows a fresh deliberate attempt', async () => {
    render(<AccountSecurityUndo />);
    fireEvent.click(within(openConfirmation()).getByRole('button', { name: 'Cancel' }));
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    openConfirmation();
    acceptConfirmation();
    await screen.findByText(success);
    expect(fixture.confirmations).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a cancelled confirmation after a newer prompt owns the view', async () => {
    render(<AccountSecurityUndo />);
    const firstDialog = openConfirmation();
    const first = fixture.confirmations[0]!;
    fireEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }));
    openConfirmation();
    await act(async () => {
      first.onCancel?.();
      await first.onConfirm();
    });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    acceptConfirmation();
    await screen.findByText(success);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('locks duplicate same-tick opening and duplicate retained confirmation callbacks', async () => {
    render(<AccountSecurityUndo />);
    const button = screen.getByRole('button', { name: actionName, exact: true });
    act(() => {
      button.click();
      button.click();
    });
    expect(fixture.confirmations).toHaveLength(1);
    const request = fixture.confirmations[0]!;
    await act(async () => {
      await Promise.all([request.onConfirm(), request.onConfirm()]);
    });
    expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows retry after CSRF fails before dispatch', async () => {
    vi.mocked(addCsrfHeaders).mockRejectedValueOnce(new Error('CSRF unavailable'));
    render(<AccountSecurityUndo />);
    openConfirmation();
    acceptConfirmation();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request could not start. Try again.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    openConfirmation();
    acceptConfirmation();
    await screen.findByText(success);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a retained confirmation after unmount', async () => {
    const view = render(<AccountSecurityUndo />);
    openConfirmation();
    const request = fixture.confirmations[0]!;
    view.unmount();
    await act(async () => {
      await request.onConfirm();
    });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['unmount', 'hashchange'] as const)(
    'does not dispatch after deferred CSRF resolves following %s',
    async (retirement) => {
      const gate = deferred<Record<string, string>>({ 'x-csrf-token': 'late' });
      vi.mocked(addCsrfHeaders).mockReturnValueOnce(gate.promise);
      const view = render(<AccountSecurityUndo />);
      openConfirmation();
      acceptConfirmation();
      await waitFor(() => expect(addCsrfHeaders).toHaveBeenCalledTimes(1));
      act(() => {
        if (retirement === 'unmount') view.unmount();
        else changeLink();
      });
      await act(async () => {
        gate.resolve({ 'x-csrf-token': 'late' });
        await gate.promise;
      });
      expect(fetchMock).not.toHaveBeenCalled();
      if (retirement === 'hashchange') expectNoRetry();
    },
  );

  it('retires a changed fragment before a queued hashchange event can deliver confirmation', async () => {
    render(<AccountSecurityUndo />);
    openConfirmation();
    const request = fixture.confirmations[0]!;
    setLink(nextToken);
    await act(async () => {
      await request.onConfirm();
    });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    expectNoRetry();
  });

  it('retires an open prompt and does not adopt a new hash as a fresh attempt', async () => {
    render(<AccountSecurityUndo />);
    openConfirmation();
    const request = fixture.confirmations[0]!;
    act(changeLink);
    await act(async () => {
      await request.onConfirm();
    });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expectNoRetry();
    expect(window.location.hash).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/open|reopen/i);
  });

  it.each(['success', 'failure'] as const)(
    'ignores late in-flight %s after hash retirement',
    async (outcome) => {
      const gate = deferred<Response>(json(receipt()));
      fetchMock.mockReturnValueOnce(gate.promise);
      render(<AccountSecurityUndo />);
      openConfirmation();
      acceptConfirmation();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      act(changeLink);
      const retirementMessage = screen.getByRole('alert').textContent;
      expect(screen.getByRole('alert')).toHaveTextContent('We could not confirm the outcome.');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Sign in to review your sign-in methods and active sessions.',
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Do not retry this action here.');
      expect(screen.getByRole('alert')).not.toHaveTextContent(/open.*email/i);
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        AUTH_LOGIN_PATH,
      );
      expect(window.location.hash).toBe('');
      act(changeLink);
      expect(screen.getByRole('alert').textContent).toBe(retirementMessage);
      await act(async () => {
        gate.resolve(outcome === 'success' ? json(receipt()) : json({ error: 'late' }, 500));
        await gate.promise;
      });
      expect(screen.getByRole('alert').textContent).toBe(retirementMessage);
      expect(screen.queryByText(success)).not.toBeInTheDocument();
      expectNoRetry();
      await act(async () => {
        await fixture.confirmations[0]!.onConfirm();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves validated success when a later fragment retires the view', async () => {
    render(<AccountSecurityUndo />);
    openConfirmation();
    acceptConfirmation();
    await screen.findByText(success);
    act(changeLink);
    expect(screen.getByRole('status')).toHaveTextContent(success);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', AUTH_LOGIN_PATH);
    expect(window.location.hash).toBe('');
    expectNoRetry();
    await act(async () => {
      await fixture.confirmations[0]!.onConfirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pushState', '/login/different'],
    ['replaceState', '/login/not-me?intent=changed'],
  ] as const)('blocks a new prompt after synchronous %s route change', (method, route) => {
    render(<AccountSecurityUndo />);
    window.history[method](null, '', route);
    fireEvent.click(screen.getByRole('button', { name: actionName, exact: true }));
    expect(fixture.confirmations).toHaveLength(0);
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['pushState', '/login/different'],
    ['replaceState', '/login/not-me?intent=changed'],
  ] as const)(
    'blocks dispatch after %s changes the route during deferred CSRF',
    async (method, route) => {
      const gate = deferred<Record<string, string>>({ 'x-csrf-token': 'late' });
      vi.mocked(addCsrfHeaders).mockReturnValueOnce(gate.promise);
      render(<AccountSecurityUndo />);
      openConfirmation();
      acceptConfirmation();
      await waitFor(() => expect(addCsrfHeaders).toHaveBeenCalledTimes(1));
      window.history[method](null, '', route);
      await act(async () => {
        gate.resolve({ 'x-csrf-token': 'late' });
        await gate.promise;
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByText(success)).not.toBeInTheDocument();
    },
  );

  it.each([
    ['hashchange', '/different#destination'],
    ['hashchange', '/login/not-me?other=view#destination'],
    ['popstate', '/different#destination'],
    ['popstate', '/login/not-me?other=view#destination'],
    ['pagehide', '/different#destination'],
    ['pagehide', '/login/not-me?other=view#destination'],
  ])('preserves an unrelated destination fragment on %s at %s', (eventName, route) => {
    render(<AccountSecurityUndo />);
    window.history.replaceState(null, '', route);
    act(() => window.dispatchEvent(new Event(eventName)));
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(route);
    expectNoRetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['popstate', 'pagehide'])(
    'retires a same-route prompt on %s without revival',
    async (eventName) => {
      render(<AccountSecurityUndo />);
      openConfirmation();
      const request = fixture.confirmations[0]!;
      act(() => window.dispatchEvent(new Event(eventName)));
      expectNoRetry();
      expect(screen.getByRole('alert')).toHaveTextContent(/open.*email/i);
      await act(async () => {
        await request.onConfirm();
        request.onCancel?.();
      });
      expect(addCsrfHeaders).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      act(() => window.dispatchEvent(new Event('pageshow')));
      expectNoRetry();
    },
  );

  it.each([
    ['popstate', 'success'],
    ['popstate', 'failure'],
    ['pagehide', 'success'],
    ['pagehide', 'failure'],
  ] as const)('keeps posted outcome unknown after %s and late %s', async (eventName, outcome) => {
    const gate = deferred<Response>(json(receipt()));
    fetchMock.mockReturnValueOnce(gate.promise);
    render(<AccountSecurityUndo />);
    openConfirmation();
    acceptConfirmation();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event(eventName)));
    expect(screen.getByRole('alert')).toHaveTextContent('We could not confirm the outcome.');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign in to review your sign-in methods and active sessions.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Do not retry this action here.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/open.*email/i);
    act(() => window.dispatchEvent(new Event('pageshow')));
    await act(async () => {
      gate.resolve(outcome === 'success' ? json(receipt()) : json({ error: 'late' }, 500));
      await gate.promise;
      await fixture.confirmations[0]!.onConfirm();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('We could not confirm the outcome.');
    expect(screen.queryByText(success)).not.toBeInTheDocument();
    expectNoRetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['popstate', 'pagehide'])('preserves a validated receipt after %s', async (eventName) => {
    render(<AccountSecurityUndo />);
    openConfirmation();
    acceptConfirmation();
    await screen.findByText(success);
    act(() => window.dispatchEvent(new Event(eventName)));
    act(() => window.dispatchEvent(new Event('pageshow')));
    expect(screen.getByRole('status')).toHaveTextContent(success);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoRetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not publish an unmounted request into a freshly opened link', async () => {
    const gate = deferred<Response>(json(receipt()));
    fetchMock.mockReturnValueOnce(gate.promise);
    const old = render(<AccountSecurityUndo />);
    openConfirmation();
    acceptConfirmation();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    old.unmount();
    setLink(nextToken);
    render(<AccountSecurityUndo />);
    await act(async () => {
      gate.resolve(json(receipt()));
      await gate.promise;
    });
    expect(screen.queryByText(success)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionName, exact: true })).toBeEnabled();
    openConfirmation();
    acceptConfirmation();
    await screen.findByText(success);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({ token: nextToken });
  });

  it.each(['http', 'network', 'invalid-json', 'invalid-receipt'] as const)(
    'makes dispatched %s failure terminal in this view',
    async (failure) => {
      if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('connection lost'));
      else
        fetchMock.mockResolvedValueOnce(
          failure === 'http'
            ? json({ error: 'rejected' }, 400)
            : failure === 'invalid-json'
              ? new Response('{')
              : json({ sessionsSignedOut: 1, passwordReset: 'yes' }),
        );
      render(<AccountSecurityUndo />);
      openConfirmation();
      acceptConfirmation();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not confirm the outcome.',
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Do not retry this action here.');
      await waitFor(expectNoRetry);
      await act(async () => {
        await fixture.confirmations[0]!.onConfirm();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(success)).not.toBeInTheDocument();
    },
  );

  it.each([false, true])(
    'does not infer password or universal sign-out guarantees from passwordReset=%s',
    async (passwordReset) => {
      fetchMock.mockResolvedValueOnce(json(receipt(passwordReset)));
      render(<AccountSecurityUndo />);
      openConfirmation();
      acceptConfirmation();
      expect(await screen.findByText(success)).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(
        /every session|everyone out|password was reset|98765/i,
      );
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        AUTH_LOGIN_PATH,
      );
      expectNoRetry();
    },
  );

  it('renders the real page detail with bounded consequences and anonymous access', () => {
    render(<AccountSecurityUndoPage />);
    expect(screen.getByRole('heading', { name: 'Was this not you?' })).toBeInTheDocument();
    expect(document.body).toHaveTextContent('off here without a passkey');
    expect(document.body).toHaveTextContent('registrations that existed when it was turned on');
    expect(document.body).toHaveTextContent(
      'Session sign-out and password protection are attempted',
    );
    expect(document.body).toHaveTextContent(`${ACCOUNT_SECURITY_POLICY.undoHours} hours`);
    expect(document.body).not.toHaveTextContent(
      /every session and linked device is signed out|your password is reset/i,
    );
    expect(screen.getByRole('button', { name: actionName, exact: true })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BROWSER_SIGN_IN_START,
  BROWSER_SIGN_IN_CANCEL,
  BROWSER_SIGN_IN_STATE,
  type PendingBrowserSignIn,
} from '@agiworkforce/local-runtime-contract';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { AuthFlow } from '@/features/auth/AuthFlow';
import { DesktopBrowserSignIn } from '../components/DesktopBrowserSignIn';
import { beginBrowserSignIn, cancelBrowserSignIn } from '../lib/browser-sign-in';

const localPassword = vi.hoisted(() => vi.fn());
type IdentityAuthModule = typeof import('@/features/auth/identityAuthAdapter');
vi.mock('@/features/auth/identityAuthAdapter', async (importOriginal) => ({
  ...(await importOriginal<IdentityAuthModule>()),
  useIdentityAuthClient: () => ({
    isReady: true,
    startProvider: async () =>
      (await beginBrowserSignIn())
        ? { status: 'redirecting', phase: 'browser' }
        : { status: 'failed', kind: 'unexpected', message: 'Could not start sign-in' },
    signInWithPassword: localPassword,
  }),
  IdentityBotProtection: () => null,
}));

let native: PendingBrowserSignIn;
const invoke = vi.fn();
const redirects = {
  completeUrl: '/login/complete',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback',
};

function renderSignIn() {
  return render(
    <>
      <AuthFlow
        mode="login"
        providers={[{ id: 'google', label: 'Google' }]}
        redirects={redirects}
      />
      <DesktopBrowserSignIn />
    </>,
  );
}

beforeEach(() => {
  localPassword.mockReset();
  native = { kind: 'idle' };
  invoke.mockReset().mockImplementation(async (command: string) => {
    if (command === BROWSER_SIGN_IN_STATE) return { ok: true, value: native };
    if (command === BROWSER_SIGN_IN_START) {
      native = { kind: 'waiting', expiresAtMs: Date.now() + 60_000 };
      return { ok: true, value: { started: true, expiresAtMs: native.expiresAtMs } };
    }
    if (command === BROWSER_SIGN_IN_CANCEL) {
      native = { kind: 'idle' };
      return { ok: true, value: { cancelled: true } };
    }
    throw new Error('Unexpected command');
  });
  window.agiHost = hostBridgeStub({ invokeRuntime: invoke });
  window.localStorage.clear();
});

afterEach(async () => {
  window.agiHost = hostBridgeStub({ invokeRuntime: invoke });
  invoke.mockImplementation(async () => ({ ok: true, value: { cancelled: true } }));
  await act(async () => {
    await cancelBrowserSignIn();
  });
  cleanup();
  delete window.agiHost;
  vi.useRealTimers();
});

describe('desktop browser sign-in recovery', () => {
  it('keeps the form in place and restores it after Cancel, then allows another attempt', async () => {
    renderSignIn();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await screen.findByRole('button', { name: 'Open the browser again' });
    expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeDisabled();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Finish signing in in your browser');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: 'Cancel sign-in' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await screen.findByRole('button', { name: 'Open the browser again' });
    expect(invoke.mock.calls.filter(([command]) => command === BROWSER_SIGN_IN_START)).toHaveLength(
      2,
    );
  });

  it('restores a pending native attempt when the renderer mounts again', async () => {
    native = { kind: 'waiting', expiresAtMs: Date.now() + 60_000 };
    renderSignIn();
    await screen.findByRole('button', { name: 'Open the browser again' });
    expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeEnabled(),
    );
  });

  it('ignores a stale launch reply after cancellation and a newer attempt', async () => {
    let settle!: (value: unknown) => void;
    const usual = invoke.getMockImplementation()!;
    invoke.mockImplementation((command: string) =>
      command === BROWSER_SIGN_IN_START
        ? new Promise((resolve) => {
            settle = resolve;
          })
        : usual(command),
    );
    renderSignIn();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await screen.findByRole('button', { name: 'Opening your browser' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeEnabled(),
    );
    invoke.mockImplementation(usual);
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await screen.findByRole('button', { name: 'Open the browser again' });
    await act(async () => {
      settle({ ok: true, value: { started: true, expiresAtMs: Date.now() + 60_000 } });
    });
    expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel sign-in' })).toBeEnabled();
    expect(screen.queryByText('Could not start sign-in')).not.toBeInTheDocument();
  });

  it('keeps cancellation failure visible and blocks local login until retry succeeds', async () => {
    renderSignIn();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await screen.findByRole('button', { name: 'Open the browser again' });
    invoke.mockResolvedValueOnce({
      ok: false,
      error: { code: 'io-error', message: 'Cannot cancel now' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await screen.findByText('Cannot cancel now');
    expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeEnabled(),
    );
  });

  it('ends waiting at the native expiry and offers a usable Back action', async () => {
    vi.useFakeTimers();
    native = { kind: 'waiting', expiresAtMs: Date.now() + 1000 };
    renderSignIn();
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeEnabled();
    expect(screen.getByText(/That sign-in link has expired/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Back to sign in' })).not.toBeInTheDocument();
  });

  it('does not mount desktop controls on the public website', () => {
    delete window.agiHost;
    const { container } = render(<DesktopBrowserSignIn />);
    expect(container).toBeEmptyDOMElement();
  });
});

it('leaves older Desktop login usable without probing unsupported native commands', async () => {
  window.agiHost = hostBridgeStub({ invokeRuntime: invoke, browserSignIn: undefined });
  renderSignIn();
  await act(async () => {});
  expect(invoke).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue', hidden: true })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Continue in your browser' })).toBeDisabled();
  expect(screen.getByText(/Update AGI Desktop to use browser sign-in/)).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

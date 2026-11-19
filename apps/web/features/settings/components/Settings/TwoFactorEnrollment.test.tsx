import { StrictMode, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';

const fixture = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  listeners: new Set<() => void>(),
  confirmations: [] as { onConfirm: () => unknown; onCancel?: () => unknown }[],
  handlers: new Map<string, () => unknown>(),
  invalidate: vi.fn(),
  qr: vi.fn(),
}));
const reverification = vi.hoisted(() => ({
  start: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyPassword: vi.fn(),
  verifyEmailCode: vi.fn(),
  verifyPasskey: vi.fn(),
  verifySecondFactor: vi.fn(),
  freshToken: vi.fn(),
}));
vi.mock('@/lib/identity/useSessionSnapshot', async (original) => ({
  ...(await original<MockedModule0>()),
  useSessionSnapshot: () => () => fixture.session,
}));
vi.mock('@agiworkforce/ui', async (original) => {
  const ui = await original<MockedModule1>();
  return {
    ...ui,
    Button: (props: ComponentProps<typeof ui.Button>) => {
      const label = (Array.isArray(props.children) ? props.children : [props.children])
        .filter((child) => typeof child === 'string')
        .join('')
        .trim();
      if (label && props.onClick) fixture.handlers.set(label, props.onClick as () => unknown);
      return <ui.Button {...props} />;
    },
    useConfirmAction: () => {
      const actual = ui.useConfirmAction();
      return {
        ...actual,
        confirm: (options: Parameters<typeof actual.confirm>[0]) => {
          fixture.confirmations.push(options);
          return actual.confirm(options);
        },
      };
    },
  };
});
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CompleteMockModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));
// Native identity methods are modeled here; this is not evidence about live SDK event ordering.
vi.mock('@/lib/identity/client', async (original) => ({
  ...(await original<MockedModule2>()),
  useSessionReverification: () => reverification,
  useSignOut: () => vi.fn(),
}));
vi.mock('@features/settings/hooks/use-mfa-readers', async (original) => ({
  ...(await original<MockedModule3>()),
  invalidateMfaReaders: fixture.invalidate,
}));
vi.mock('qrcode', () => ({ default: { toString: fixture.qr } }));

import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { generateOTPAuthURL, TOTP_CONFIG } from '../../services/user-preferences';
import { TwoFactorEnrollmentPanel } from './TwoFactorEnrollment';

const fetchMock = vi.fn<typeof fetch>();
const SECRET = TOTP_CONFIG.SECRET_ALPHABET[0]!.repeat(
  Math.ceil((TOTP_CONFIG.SECRET_LENGTH * 8) / 5),
);
const OTPAUTH = generateOTPAuthURL(SECRET, 'user@example.com');
const BACKUP_CODES = Array.from({ length: TOTP_CONFIG.BACKUP_CODE_COUNT }, (_, index) =>
  TOTP_CONFIG.BACKUP_CODE_ALPHABET[index]!.repeat(TOTP_CONFIG.BACKUP_CODE_LENGTH),
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const statusBody = (enabled = false, available = true) => ({
  enabled,
  backup_codes_ready: enabled,
  enrollment_available: available,
});
let status: unknown;
let statusFailure = false;
let mutate: (url: string, init?: RequestInit) => Promise<Response>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function session(userId = 'a', sessionId = 'session-a') {
  let retired = false;
  const candidate: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => {
      if (fixture.session !== candidate) retired = true;
      return !retired;
    },
    getToken: vi.fn(async () => `token-${userId}`),
    subscribe: (listener) => {
      fixture.listeners.add(listener);
      return () => {
        fixture.listeners.delete(listener);
      };
    },
  };
  fixture.session = candidate;
  return candidate;
}
function notify() {
  for (const listener of [...fixture.listeners]) listener();
}
function mutationCalls() {
  return fetchMock.mock.calls.filter(
    ([, init]) => init?.method === 'POST' || init?.method === 'DELETE',
  );
}
function refusal(action: string) {
  return json(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action,
          consequence: 'Existing codes stop working immediately.',
          freshnessSeconds: 300,
        },
      },
    },
    403,
  );
}
function needsVerification(action: string) {
  return json(
    {
      error: { code: 'STEP_UP_VERIFICATION_REQUIRED', details: { action, level: 'second_factor' } },
    },
    403,
  );
}
async function enroll(user = userEvent.setup()) {
  await user.click(await screen.findByRole('button', { name: /set up authenticator app/i }));
  await screen.findByTestId('totp-secret');
  return user;
}
async function backupCodes() {
  const user = await enroll();
  await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '123456');
  await user.click(screen.getByRole('button', { name: /verify and enable/i }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: /^Enable two-factor$/i,
    }),
  );
  await screen.findByRole('list', { name: /Backup codes/i });
  return user;
}
async function confirmMutation(label: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: label }));
  const dialog = await screen.findByRole('alertdialog');
  await user.click(
    within(dialog).getByRole('button', { name: /replace backup codes|turn off two-factor/i }),
  );
  return user;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.listeners.clear();
  fixture.confirmations.length = 0;
  fixture.handlers.clear();
  session();
  status = statusBody();
  statusFailure = false;
  fixture.qr.mockResolvedValue('<svg/>');
  mutate = async (url) => {
    if (url.endsWith('/setup')) return json({ secret: SECRET, otpauth_url: OTPAUTH });
    status = statusBody(true);
    return json({ success: true, backup_codes: BACKUP_CODES });
  };
  fetchMock.mockReset().mockImplementation(async (url, init) => {
    if (String(url) === '/api/settings/2fa' && !init?.method)
      return json(status, statusFailure ? 500 : 200);
    return mutate(String(url), init);
  });
  vi.stubGlobal('fetch', fetchMock);
  reverification.start.mockResolvedValue({
    kind: 'second_factor',
    methods: ['authenticator', 'backup_code'],
  });
  reverification.verifySecondFactor.mockResolvedValue({ kind: 'complete' });
  reverification.freshToken.mockResolvedValue('fresh-session-token');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TwoFactorEnrollmentPanel owned lifetime (source-authored, unrun fixtures)', () => {
  it('runs setup, scan and verification and publishes only server-confirmed codes', async () => {
    render(<TwoFactorEnrollmentPanel />);
    const user = await enroll();
    expect(screen.getByTestId('totp-secret')).toHaveTextContent(SECRET);
    expect(
      await screen.findByAltText(/QR code containing your two-factor setup key/i),
    ).toBeInTheDocument();
    expect(fixture.qr).toHaveBeenCalledWith(OTPAUTH, expect.objectContaining({ type: 'svg' }));
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
    await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: /^Enable two-factor$/i,
      }),
    );
    expect(await screen.findByText(/is now enabled on your account/i)).toBeInTheDocument();
    const verify = mutationCalls().find(([url]) => String(url).endsWith('/verify'))!;
    expect(verify[1]?.body).toBe(JSON.stringify({ code: '123456' }));
    expect(new Headers(verify[1]?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(new Headers(verify[1]?.headers).get('x-csrf-token')).toBe('csrf-token');
    expect(fixture.invalidate).toHaveBeenLastCalledWith(fixture.session);
  });

  it.each([401, 429, 503])(
    'treats HTTP %s after dispatch as unknown rather than claiming 2FA stayed off',
    async (httpStatus) => {
      render(<TwoFactorEnrollmentPanel />);
      const user = await enroll();
      mutate = async () => json({ error: { message: 'Request rejected' } }, httpStatus);
      await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '000000');
      await user.click(screen.getByRole('button', { name: /verify and enable/i }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: /^Enable two-factor$/i,
        }),
      );
      expect(
        await screen.findByText(/could not confirm the complete two-factor change outcome/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /verify and enable/i })).toBeNull();
      expect(screen.queryByTestId('totp-secret')).toBeNull();
      expect(screen.getByText(/only clears the local warning/i)).toBeInTheDocument();
    },
  );

  it.each(['malformed', 'network'] as const)(
    'does not publish setup material after %s failure',
    async (failure) => {
      mutate = async () => {
        if (failure === 'network') throw new TypeError('Connection lost');
        return json({ secret: SECRET, otpauth_url: 'otpauth://totp/example?secret=WRONG' });
      };
      render(<TwoFactorEnrollmentPanel />);
      await userEvent
        .setup()
        .click(await screen.findByRole('button', { name: /set up authenticator/i }));
      expect(await screen.findByText(/could not confirm the complete/i)).toBeInTheDocument();
      expect(screen.queryByTestId('totp-secret')).toBeNull();
      expect(fixture.invalidate).not.toHaveBeenCalled();
    },
  );

  it('shows codes once, preserves them through failed follow-up status reads, and requires acknowledgement', async () => {
    render(<TwoFactorEnrollmentPanel />);
    const user = await enroll();
    statusFailure = true;
    await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: /^Enable two-factor$/i,
      }),
    );
    const list = await screen.findByRole('list', { name: /Backup codes/i });
    for (const code of BACKUP_CODES) expect(list).toHaveTextContent(code);
    expect(
      await screen.findByText(/Could not read your current two-factor status/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/These are shown once. Each code works a single time/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /^Done$/i })).toBeDisabled();
    statusFailure = false;
    await user.click(screen.getByLabelText(/I have saved these backup codes/i));
    await user.click(screen.getByRole('button', { name: /^Done$/i }));
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
    expect(await screen.findByText(/Backup codes are set/i)).toBeInTheDocument();
  });

  it('admits no request without identity', () => {
    fixture.session = null;
    render(<TwoFactorEnrollmentPanel />);
    expect(screen.getByRole('status')).toHaveTextContent(/Sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears a secret across same-ID replacement and A to B to A without resurrecting it', async () => {
    render(<TwoFactorEnrollmentPanel />);
    await enroll();
    act(() => {
      session();
      notify();
    });
    expect(screen.queryByTestId('totp-secret')).toBeNull();
    await screen.findByRole('button', { name: /set up authenticator app/i });
    await enroll();
    act(() => {
      session('b', 'session-b');
      notify();
    });
    await screen.findByRole('button', { name: /set up authenticator app/i });
    act(() => {
      session();
      notify();
    });
    await screen.findByRole('button', { name: /set up authenticator app/i });
    expect(screen.queryByTestId('totp-secret')).toBeNull();
  });

  it('closes and reopens without retaining secrets or accepting stale QR completion', async () => {
    const qr = deferred<string>();
    fixture.qr.mockReturnValue(qr.promise);
    const view = render(<TwoFactorEnrollmentPanel />);
    await enroll();
    view.rerender(<TwoFactorEnrollmentPanel active={false} />);
    expect(screen.queryByTestId('totp-secret')).toBeNull();
    view.rerender(<TwoFactorEnrollmentPanel active />);
    await screen.findByRole('button', { name: /set up authenticator app/i });
    await act(async () => {
      qr.resolve('<svg id="stale"/>');
    });
    expect(screen.queryByAltText(/QR code containing/i)).toBeNull();
  });

  it.each(['close', 'unmount', 'signout'] as const)(
    'does not publish a delayed successful receipt after %s',
    async (exit) => {
      const pending = deferred<Response>();
      const view = render(<TwoFactorEnrollmentPanel />);
      await screen.findByRole('button', { name: /set up authenticator app/i });
      mutate = () => pending.promise;
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: /set up authenticator app/i }));
      await waitFor(() => expect(mutationCalls()).toHaveLength(1));
      const signal = mutationCalls()[0]![1]?.signal;
      if (exit === 'close') view.rerender(<TwoFactorEnrollmentPanel active={false} />);
      else if (exit === 'unmount') view.unmount();
      else
        act(() => {
          fixture.session = null;
          notify();
        });
      await act(async () => {
        pending.resolve(json({ secret: SECRET, otpauth_url: OTPAUTH }));
      });
      expect(signal?.aborted).toBe(true);
      expect(screen.queryByTestId('totp-secret')).toBeNull();
      expect(fixture.invalidate).not.toHaveBeenCalled();
      if (exit === 'close') {
        view.rerender(<TwoFactorEnrollmentPanel active />);
        expect(await screen.findByText(/could not confirm the complete/i)).toBeInTheDocument();
      }
    },
  );

  it('settles only the live StrictMode generation and releases subscriptions', async () => {
    const token = deferred<string | null>();
    vi.mocked(fixture.session!.getToken).mockReturnValue(token.promise);
    const view = render(
      <StrictMode>
        <TwoFactorEnrollmentPanel />
      </StrictMode>,
    );
    await act(async () => {
      token.resolve('captured-token');
    });
    await screen.findByRole('button', { name: /set up authenticator app/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(fixture.listeners.size).toBe(0);
  });

  it('rejects synchronous duplicate setup invocations before a rerender', async () => {
    const pending = deferred<Response>();
    mutate = () => pending.promise;
    render(<TwoFactorEnrollmentPanel />);
    await screen.findByRole('button', { name: /set up authenticator app/i });
    const retained = fixture.handlers.get('Set up authenticator app')!;
    act(() => {
      retained();
      retained();
    });
    await waitFor(() => expect(mutationCalls()).toHaveLength(1));
    await act(async () => {
      pending.resolve(json({ secret: SECRET, otpauth_url: OTPAUTH }));
    });
    expect(await screen.findByTestId('totp-secret')).toHaveTextContent(SECRET);
  });

  it('does not dispatch retained confirmation or cancellation after owner replacement', async () => {
    status = statusBody(true);
    render(<TwoFactorEnrollmentPanel />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    const old = fixture.confirmations[0]!;
    expect(mutationCalls()).toHaveLength(0);
    act(() => {
      session();
      notify();
    });
    await screen.findByRole('button', { name: /turn off two-factor/i });
    await act(async () => {
      await old.onConfirm();
      old.onCancel?.();
    });
    expect(mutationCalls()).toHaveLength(0);
  });

  it('dispatches a retained confirmation at most once and stale cancellation cannot unlock a new intent', async () => {
    status = statusBody(true);
    const pending = deferred<Response>();
    mutate = () => pending.promise;
    render(<TwoFactorEnrollmentPanel />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    const old = fixture.confirmations[0]!;
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /turn off two-factor/i }),
    );
    act(() => {
      void old.onConfirm();
    });
    await waitFor(() => expect(mutationCalls()).toHaveLength(1));
    await act(async () => {
      pending.resolve(json({ success: true }));
    });
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    act(() => {
      old.onCancel?.();
      fixture.handlers.get('Turn off two-factor')!();
    });
    expect(fixture.confirmations).toHaveLength(2);
    expect(mutationCalls()).toHaveLength(1);
  });

  it.each(['disable', 'regenerate'] as const)(
    'confirms the consequence and replays %s with an owned proof',
    async (action) => {
      status = statusBody(true);
      const routeAction =
        action === 'disable' ? 'two_factor.disable' : 'two_factor.regenerate_backup_codes';
      let calls = 0;
      mutate = async () => {
        calls += 1;
        if (calls === 1) return refusal(routeAction);
        if (calls === 2) return needsVerification(routeAction);
        if (calls === 3) return json({ token: 'grant.signature' });
        status = statusBody(action !== 'disable');
        return json(action === 'disable' ? { success: true } : { backup_codes: BACKUP_CODES });
      };
      render(<TwoFactorEnrollmentPanel />);
      const user = await confirmMutation(
        action === 'disable' ? /turn off two-factor/i : /generate new backup codes/i,
      );
      const input = await screen.findByLabelText(/Code from your authenticator app/i);
      expect(screen.getByText(/Existing codes stop working immediately/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeDisabled();
      if (action === 'disable') {
        await user.click(screen.getByRole('button', { name: /use a backup code instead/i }));
        await user.type(screen.getByLabelText(/^Backup code$/i), 'aaaa2345');
      } else await user.type(input, '654321');
      await user.click(screen.getByRole('button', { name: /^Confirm$/i }));
      if (action === 'disable')
        await screen.findByRole('button', { name: /set up authenticator app/i });
      else
        expect(await screen.findByRole('list', { name: /Backup codes/i })).toHaveTextContent(
          BACKUP_CODES[0]!,
        );
      const mutations = mutationCalls();
      expect(mutations).toHaveLength(4);
      expect(mutations[1]![0]).toBe('/api/auth/step-up');
      expect(mutations[2]![0]).toBe('/api/auth/step-up');
      expect(new Headers(mutations[3]![1]?.headers).get(STEP_UP_TOKEN_HEADER)).toBe(
        'grant.signature',
      );
      for (const [index, [, init]] of mutations.entries()) {
        expect(init?.credentials).toBe('omit');
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          index === 2 ? 'Bearer fresh-session-token' : 'Bearer token-a',
        );
      }
      if (action === 'disable') expect(mutations[0]![1]?.body).toBeUndefined();
      expect(reverification.verifySecondFactor).toHaveBeenCalledWith(
        action === 'disable' ? 'backup_code' : 'authenticator',
        action === 'disable' ? 'aaaa2345' : '654321',
      );
    },
  );

  it('cancels step-up without replaying or reporting a completed code change', async () => {
    status = statusBody(true);
    let calls = 0;
    mutate = async () =>
      ++calls === 1
        ? refusal('two_factor.regenerate_backup_codes')
        : needsVerification('two_factor.regenerate_backup_codes');
    render(<TwoFactorEnrollmentPanel />);
    const user = await confirmMutation(/generate new backup codes/i);
    await screen.findByLabelText(/Code from your authenticator app/i);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Code from your authenticator app/i)).toBeNull(),
    );
    expect(mutationCalls()).toHaveLength(2);
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
    expect(screen.queryByText(/could not confirm the complete/i)).toBeNull();
  });

  it('does not replay step-up when its modeled SDK verification settles after signout', async () => {
    status = statusBody(true);
    let calls = 0;
    mutate = async () =>
      ++calls === 1 ? refusal('two_factor.disable') : needsVerification('two_factor.disable');
    const factor = deferred<{ kind: 'complete' }>();
    reverification.verifySecondFactor.mockReturnValue(factor.promise);
    render(<TwoFactorEnrollmentPanel />);
    const user = await confirmMutation(/turn off two-factor/i);
    await user.type(await screen.findByLabelText(/Code from your authenticator app/i), '123456');
    await user.click(screen.getByRole('button', { name: /^Confirm$/i }));
    act(() => {
      fixture.session = null;
      notify();
    });
    await act(async () => {
      factor.resolve({ kind: 'complete' });
    });
    expect(mutationCalls()).toHaveLength(2);
    expect(reverification.freshToken).not.toHaveBeenCalled();
    expect(fixture.invalidate).not.toHaveBeenCalled();
  });

  it('copies every code and does not allow retained exports after retirement', async () => {
    const view = render(<TwoFactorEnrollmentPanel />);
    const user = await backupCodes();
    const pending = deferred<void>();
    const writeText = vi.fn(() => pending.promise);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const copy = fixture.handlers.get('Copy codes')!;
    const download = fixture.handlers.get('Download codes')!;
    const print = fixture.handlers.get('Print codes')!;
    const create = vi.fn();
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = create;
    await user.click(screen.getByRole('button', { name: /Copy codes/i }));
    expect(writeText).toHaveBeenCalledWith(BACKUP_CODES.join('\n'));
    view.rerender(<TwoFactorEnrollmentPanel active={false} />);
    await act(async () => {
      pending.resolve();
      copy();
      download();
      print();
    });
    expect(writeText).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    URL.createObjectURL = originalCreate;
    expect(document.querySelector('iframe')).toBeNull();
    view.rerender(<TwoFactorEnrollmentPanel active />);
    await screen.findByRole('button', { name: /generate new backup codes/i });
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
  });

  it.each([false, true])(
    'revokes the download object URL even when anchor click fails: %s',
    async (failClick) => {
      const create = vi.fn((_blob: Blob) => 'blob:backup-codes');
      const revoke = vi.fn();
      const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        if (failClick) throw new Error('Download unavailable');
      });
      try {
        render(<TwoFactorEnrollmentPanel />);
        const user = await backupCodes();
        await user.click(screen.getByRole('button', { name: /Download codes/i }));
        const blob = create.mock.calls[0]![0];
        const contents = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsText(blob);
        });
        expect(contents).toBe(`${BACKUP_CODES.join('\n')}\n`);
        expect(click).toHaveBeenCalledOnce();
        expect(revoke).toHaveBeenCalledWith('blob:backup-codes');
        if (failClick) expect(screen.getByText(/could not be downloaded/i)).toBeInTheDocument();
      } finally {
        URL.createObjectURL = original.create;
        URL.revokeObjectURL = original.revoke;
      }
    },
  );

  it('prints in its own sandboxed frame; an old afterprint cannot remove the new frame', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const print = vi.fn();
    const original = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      'contentWindow',
    )!.get!;
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (
      this: HTMLIFrameElement,
    ) {
      const view = original.call(this) as Window;
      if (view) {
        view.print = print;
        view.focus = () => undefined;
      }
      return view;
    });
    const view = render(<TwoFactorEnrollmentPanel />);
    const user = await backupCodes();
    await user.click(screen.getByRole('button', { name: /Print codes/i }));
    const first = document.querySelector('iframe')!;
    const oldWindow = first.contentWindow!;
    expect(first).toHaveAttribute('sandbox', 'allow-same-origin allow-modals');
    expect(first).toHaveAttribute('aria-hidden', 'true');
    expect(first.contentDocument!.title).toBe('AGI backup codes');
    expect(
      [...first.contentDocument!.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(BACKUP_CODES);
    await user.click(screen.getByRole('button', { name: /Print codes/i }));
    const second = document.querySelector('iframe')!;
    expect(second).not.toBe(first);
    act(() => {
      oldWindow.dispatchEvent(new Event('afterprint'));
    });
    expect(document.querySelector('iframe')).toBe(second);
    expect(print).toHaveBeenCalledTimes(2);
    expect(open).not.toHaveBeenCalled();
    act(() => {
      second.contentWindow!.dispatchEvent(new Event('afterprint'));
    });
    expect(document.querySelector('iframe')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Print codes/i }));
    view.unmount();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('reports unavailable printing and removes the unusable frame', async () => {
    vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(null);
    render(<TwoFactorEnrollmentPanel />);
    const user = await backupCodes();
    await user.click(screen.getByRole('button', { name: /Print codes/i }));
    expect(await screen.findByText(/could not be sent to the printer/i)).toHaveTextContent(
      /download or copy/i,
    );
    expect(document.querySelector('iframe')).toBeNull();
  });

  it.each([false, true])(
    'keeps unavailable enrollment controls disabled for enabled=%s',
    async (enabled) => {
      status = statusBody(enabled, false);
      render(<TwoFactorEnrollmentPanel />);
      const control = await screen.findByRole('button', {
        name: enabled ? /generate new backup codes/i : /set up authenticator app/i,
      });
      expect(control).toBeDisabled();
      expect(screen.getByText('Temporarily unavailable')).toBeInTheDocument();
      if (enabled)
        expect(screen.getByRole('button', { name: /turn off two-factor/i })).toBeEnabled();
      else
        expect(
          screen.getByText(/Authenticator apps are temporarily unavailable/i),
        ).toBeInTheDocument();
      fireEvent.click(control);
      expect(mutationCalls()).toHaveLength(0);
    },
  );

  it('shows a status failure without implying 2FA is off or permitting setup', async () => {
    statusFailure = true;
    render(<TwoFactorEnrollmentPanel />);
    expect(
      await screen.findByText(/Could not read your current two-factor status/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set up authenticator app/i })).toBeNull();
    expect(mutationCalls()).toHaveLength(0);
  });

  it('preserves the proof endpoint rate-limit message without replaying the mutation', async () => {
    status = statusBody(true);
    let calls = 0;
    mutate = async () => {
      calls += 1;
      if (calls === 1) return refusal('two_factor.disable');
      if (calls === 2) return needsVerification('two_factor.disable');
      return json({ error: { message: 'Too many attempts. Try again in a few minutes.' } }, 429);
    };
    render(<TwoFactorEnrollmentPanel />);
    const user = await confirmMutation(/turn off two-factor/i);
    await user.type(await screen.findByLabelText(/Code from your authenticator app/i), '123456');
    await user.click(screen.getByRole('button', { name: /^Confirm$/i }));
    expect(
      await screen.findByText('Too many attempts. Try again in a few minutes.'),
    ).toBeInTheDocument();
    expect(mutationCalls()).toHaveLength(3);
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
  });

  it('never publishes valid backup codes after session termination during receipt parsing', async () => {
    const body = deferred<unknown>();
    render(<TwoFactorEnrollmentPanel />);
    const user = await enroll();
    fixture.invalidate.mockClear();
    const parse = vi.fn(() => body.promise);
    mutate = async () => ({ ok: true, status: 200, json: parse }) as unknown as Response;
    await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: /^Enable two-factor$/i,
      }),
    );
    await waitFor(() => expect(parse).toHaveBeenCalledOnce());
    act(() => {
      fixture.session = null;
      notify();
    });
    await act(async () => {
      body.resolve({ success: true, backup_codes: BACKUP_CODES });
    });
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
    expect(screen.queryByText(/is now enabled on your account/i)).toBeNull();
    expect(fixture.invalidate).not.toHaveBeenCalled();
  });

  it('cannot cancel a started mutation through a retained callback or admit a duplicate action', async () => {
    status = statusBody(true);
    const pending = deferred<Response>();
    mutate = () => pending.promise;
    render(<TwoFactorEnrollmentPanel />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    const retained = fixture.confirmations[0]!;
    const disable = fixture.handlers.get('Turn off two-factor')!;
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /turn off two-factor/i }),
    );
    await waitFor(() => expect(mutationCalls()).toHaveLength(1));
    const signal = mutationCalls()[0]![1]?.signal;
    act(() => {
      retained.onCancel?.();
      disable();
    });
    expect(signal?.aborted).toBe(false);
    expect(fixture.confirmations).toHaveLength(1);
    expect(mutationCalls()).toHaveLength(1);
    await act(async () => {
      pending.resolve(json({ error: { message: 'Unknown commit result' } }, 500));
    });
    expect(await screen.findByText(/could not confirm the complete/i)).toBeInTheDocument();
  });

  it.each(['qr', 'clipboard', 'receipt'] as const)(
    'reconciles silent owner loss when pending %s settles',
    async (boundary) => {
      const qr = deferred<string>();
      if (boundary === 'qr') fixture.qr.mockReturnValue(qr.promise);
      render(<TwoFactorEnrollmentPanel />);
      const user = await enroll();
      const clipboard = deferred<void>();
      const body = deferred<unknown>();
      if (boundary === 'clipboard') {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: vi.fn(() => clipboard.promise) },
        });
        await user.click(screen.getByRole('button', { name: /Copy key/i }));
      }
      if (boundary === 'receipt') {
        const parse = vi.fn(() => body.promise);
        mutate = async () => ({ ok: true, status: 200, json: parse }) as unknown as Response;
        await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '123456');
        await user.click(screen.getByRole('button', { name: /verify and enable/i }));
        await user.click(
          within(await screen.findByRole('alertdialog')).getByRole('button', {
            name: /^Enable two-factor$/i,
          }),
        );
        await waitFor(() => expect(parse).toHaveBeenCalledOnce());
      }
      fixture.invalidate.mockClear();
      await act(async () => {
        session('b', 'session-b');
        if (boundary === 'qr') qr.resolve('<svg id="retired"/>');
        else if (boundary === 'clipboard') clipboard.resolve();
        else body.resolve({ success: true, backup_codes: BACKUP_CODES });
      });
      await waitFor(() => expect(screen.queryByTestId('totp-secret')).toBeNull());
      expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
      expect(screen.queryByAltText(/QR code containing/i)).toBeNull();
      expect(fixture.invalidate).not.toHaveBeenCalled();
      await screen.findByRole('button', { name: /set up authenticator app/i });
    },
  );

  it('discards a status body after silent owner replacement and reads the new owner', async () => {
    const body = deferred<unknown>();
    const parse = vi.fn(() => body.promise);
    fetchMock.mockResolvedValueOnce({ ok: true, json: parse } as unknown as Response);
    render(<TwoFactorEnrollmentPanel />);
    await waitFor(() => expect(parse).toHaveBeenCalledOnce());
    await act(async () => {
      session('b', 'session-b');
      body.resolve(statusBody(true));
    });
    await screen.findByRole('button', { name: /set up authenticator app/i });
    expect(screen.queryByRole('button', { name: /turn off two-factor/i })).toBeNull();
    expect(new Headers(fetchMock.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(
      'Bearer token-b',
    );
    expect(fixture.invalidate).not.toHaveBeenCalled();
  });
});

type MockedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type MockedModule1 = typeof import('@agiworkforce/ui');
type MockedModule2 = typeof import('@/lib/identity/client');
type MockedModule3 = typeof import('@features/settings/hooks/use-mfa-readers');

type CompleteMockModule0 = typeof import('@/lib/client/csrf');

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  get2FAStatus: vi.fn(),
  setup2FA: vi.fn(),
  verify2FA: vi.fn(),
}));

vi.mock('@features/settings/services/user-preferences', () => ({
  default: service,
  settingsService: service,
}));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { TwoFactorEnrollmentPanel } from './TwoFactorEnrollment';

const fetchMock = vi.fn();

function stepUpRefusal(action: string, consequence: string) {
  return new Response(
    JSON.stringify({
      error: {
        code: 'STEP_UP_REQUIRED',
        message: 'Confirm it is you with a second factor before completing this action.',
        details: { reason: 'step_up_required', action, consequence, freshnessSeconds: 300 },
      },
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
}

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function headersOf(call: unknown[] | undefined): Record<string, string> {
  return ((call?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
}

const SECRET = 'JBSWY3DPEHPK3PXP';
const OTPAUTH = `otpauth://totp/AGI%20Workforce:user@example.com?secret=${SECRET}&issuer=AGI%20Workforce&algorithm=SHA1&digits=6&period=30`;
const BACKUP_CODES = ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'];

function disabledStatus() {
  return { data: { enabled: false, backupCodesRemaining: 0 } };
}

function enabledStatus(backupCodesRemaining = 3) {
  return {
    data: {
      enabled: true,
      enabledAt: '2026-08-05T00:00:00.000Z',
      backupCodesRemaining,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  service.get2FAStatus.mockResolvedValue(disabledStatus());
  service.setup2FA.mockResolvedValue({
    data: { secret: SECRET, otpauthUrl: OTPAUTH, backupCodes: BACKUP_CODES },
  });
  service.verify2FA.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TwoFactorEnrollmentPanel · enable', () => {
  it('runs setup -> scan -> verify and only reports enabled after the server confirms', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(<TwoFactorEnrollmentPanel onStatusChange={onStatusChange} />);

    const setupButton = await screen.findByRole('button', { name: /set up authenticator app/i });
    expect(screen.queryByText(/Two-factor authentication is on/i)).toBeNull();

    service.get2FAStatus.mockResolvedValue(enabledStatus());
    await user.click(setupButton);

    await waitFor(() => expect(service.setup2FA).toHaveBeenCalledTimes(1));

    expect(await screen.findByTestId('totp-secret')).toHaveTextContent(SECRET);
    expect(
      await screen.findByAltText(/QR code containing your two-factor setup key/i),
    ).toBeInTheDocument();

    expect(screen.queryByText(BACKUP_CODES[0]!)).toBeNull();

    await user.type(screen.getByLabelText(/Enter the 6-digit code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));

    await waitFor(() => expect(service.verify2FA).toHaveBeenCalledWith('123456'));
    expect(
      await screen.findByText(/Two-factor authentication is now enabled on your account/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(enabledStatus().data));
  });

  it('keeps 2FA off and explains the failure when the server rejects the code', async () => {
    const user = userEvent.setup();
    service.verify2FA.mockResolvedValue({
      success: false,
      error: 'Authentication required',
      status: 401,
    });

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /set up authenticator app/i }));
    await user.type(await screen.findByLabelText(/Enter the 6-digit code from the app/i), '000000');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));

    expect(await screen.findByText(/That code was not accepted/i)).toBeInTheDocument();
    expect(screen.queryByText(/is now enabled on your account/i)).toBeNull();
    expect(screen.queryByText(BACKUP_CODES[0]!)).toBeNull();
    expect(screen.getByRole('button', { name: /verify and enable/i })).toBeInTheDocument();
    expect(service.get2FAStatus).toHaveBeenCalledTimes(1);
  });

  it('reports the rate limit truthfully instead of a generic failure', async () => {
    const user = userEvent.setup();
    service.verify2FA.mockResolvedValue({
      success: false,
      error: 'Too many requests',
      status: 429,
    });

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /set up authenticator app/i }));
    await user.type(await screen.findByLabelText(/Enter the 6-digit code from the app/i), '000000');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));

    expect(await screen.findByText(/Too many attempts/i)).toBeInTheDocument();
  });

  it('explains a temporary setup outage without exposing configuration details', async () => {
    const user = userEvent.setup();
    service.setup2FA.mockResolvedValue({
      error: 'An unexpected error occurred',
      status: 503,
    });

    render(<TwoFactorEnrollmentPanel />);
    await user.click(await screen.findByRole('button', { name: /set up authenticator app/i }));

    expect(
      await screen.findByText(
        'Authenticator setup is temporarily unavailable. Try again later or contact support.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('totp-secret')).toBeNull();
  });
});

describe('TwoFactorEnrollmentPanel · backup codes', () => {
  it('shows the codes exactly once, gated behind an explicit acknowledgement', async () => {
    const user = userEvent.setup();
    render(<TwoFactorEnrollmentPanel />);

    service.get2FAStatus.mockResolvedValue(enabledStatus());
    await user.click(await screen.findByRole('button', { name: /set up authenticator app/i }));
    await user.type(await screen.findByLabelText(/Enter the 6-digit code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));

    const codeList = await screen.findByRole('list', { name: /Backup codes/i });
    for (const backupCode of BACKUP_CODES) {
      expect(codeList).toHaveTextContent(backupCode);
    }

    const done = screen.getByRole('button', { name: /^Done$/i });
    expect(done).toBeDisabled();
    await user.click(screen.getByLabelText(/I have saved these backup codes/i));
    expect(done).toBeEnabled();
    await user.click(done);

    await waitFor(() => expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull());
    expect(screen.queryByText(BACKUP_CODES[0]!)).toBeNull();
    expect(await screen.findByText(/3 backup codes remaining/i)).toBeInTheDocument();
  });

  async function reachBackupCodes() {
    const user = userEvent.setup();
    render(<TwoFactorEnrollmentPanel />);
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    await user.click(await screen.findByRole('button', { name: /set up authenticator app/i }));
    await user.type(await screen.findByLabelText(/Enter the 6-digit code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));
    await screen.findByRole('list', { name: /Backup codes/i });
    return user;
  }

  it('explains before dismissal that the codes are shown once and each works once', async () => {
    await reachBackupCodes();

    expect(screen.getByText(/These are shown once/i)).toBeVisible();
    expect(screen.getByText(/Each code works a single time/i)).toBeVisible();
  });

  it('copies every code to the clipboard in one action', async () => {
    const writeText = vi.fn(async () => undefined);
    const user = await reachBackupCodes();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await user.click(screen.getByRole('button', { name: /Copy codes/i }));

    expect(writeText).toHaveBeenCalledWith(BACKUP_CODES.join('\n'));
  });

  it('downloads every code as a text file', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:backup-codes');
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const user = await reachBackupCodes();

      await user.click(screen.getByRole('button', { name: /Download codes/i }));

      const blob = createObjectURL.mock.calls[0]![0];
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
      expect(text).toBe(`${BACKUP_CODES.join('\n')}\n`);
      expect(click).toHaveBeenCalledOnce();
    } finally {
      click.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });

  it('prints the codes on a page of their own', async () => {
    const printDocument = document.implementation.createHTMLDocument('print');
    const print = vi.fn();
    const open = vi.fn(() => ({ document: printDocument, print }) as unknown as Window);
    vi.stubGlobal('open', open);
    const user = await reachBackupCodes();

    await user.click(screen.getByRole('button', { name: /Print codes/i }));

    expect(open).toHaveBeenCalledOnce();
    expect(printDocument.title).toBe('AGI Workforce backup codes');
    expect([...printDocument.querySelectorAll('li')].map((item) => item.textContent)).toEqual(
      BACKUP_CODES,
    );
    expect(print).toHaveBeenCalledOnce();
    expect(screen.queryByText(/blocked the print window/i)).toBeNull();
  });

  it('says so when the browser blocks the print window instead of doing nothing', async () => {
    vi.stubGlobal(
      'open',
      vi.fn(() => null),
    );
    const user = await reachBackupCodes();

    await user.click(screen.getByRole('button', { name: /Print codes/i }));

    const notice = await screen.findByText(/blocked the print window/i);
    expect(notice.closest('[role="alert"]')).toHaveTextContent(
      /download or copy the codes instead/i,
    );
  });

  it('regenerates backup codes only after the route has been satisfied with a proof', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    fetchMock
      .mockResolvedValueOnce(
        stepUpRefusal(
          'two_factor.regenerate_backup_codes',
          'Your existing backup codes stop working immediately.',
        ),
      )
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(jsonOk({ backup_codes: ['ZZZZ-9999'] }));

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /generate new backup codes/i }));

    expect(
      await screen.findByText(/Your existing backup codes stop working immediately/i),
    ).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '654321');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(
      await screen.findByText(/Your previous backup codes have been invalidated/i),
    ).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: /Backup codes/i })).toHaveTextContent(
      'ZZZZ-9999',
    );

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/step-up');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/settings/2fa/backup-codes');
    expect(headersOf(fetchMock.mock.calls[2])[STEP_UP_TOKEN_HEADER]).toBe('grant.signature');
  });

  it('keeps the old codes when the challenge is dismissed', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    fetchMock.mockResolvedValue(
      stepUpRefusal(
        'two_factor.regenerate_backup_codes',
        'Your existing backup codes stop working immediately.',
      ),
    );

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /generate new backup codes/i }));
    await user.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/Authenticator or backup code/i)).toBeNull(),
    );
    expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('TwoFactorEnrollmentPanel · disable', () => {
  it('names the consequence, replays the disable with the proof, and re-reads status', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    fetchMock
      .mockResolvedValueOnce(
        stepUpRefusal(
          'two_factor.disable',
          'Two-factor authentication is switched off for your account.',
        ),
      )
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(jsonOk({ success: true }));

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /turn off two-factor/i }));

    expect(
      await screen.findByText(/Two-factor authentication is switched off for your account/i),
    ).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /^confirm$/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Authenticator or backup code/i), 'AAAA-1111');
    service.get2FAStatus.mockResolvedValue(disabledStatus());
    await user.click(confirm);

    expect(
      await screen.findByRole('button', { name: /set up authenticator app/i }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/settings/2fa');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBeUndefined();
    expect(headersOf(fetchMock.mock.calls[2])[STEP_UP_TOKEN_HEADER]).toBe('grant.signature');
  });

  it('stays enabled and surfaces the failure when the replayed disable is rejected', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    fetchMock
      .mockResolvedValueOnce(
        stepUpRefusal('two_factor.disable', 'Two-factor authentication is switched off.'),
      )
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Authentication required' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '000000');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByText(/That code was not accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set up authenticator app/i })).toBeNull();
  });

  it('surfaces the server message when the code minting itself fails', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    fetchMock
      .mockResolvedValueOnce(
        stepUpRefusal('two_factor.disable', 'Two-factor authentication is switched off.'),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'That backup code has been spent.' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '000000');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That backup code has been spent.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('TwoFactorEnrollmentPanel · status read failure', () => {
  it('says the status could not be read rather than implying 2FA is off', async () => {
    service.get2FAStatus.mockResolvedValue({
      data: { enabled: false },
      error: 'HTTP 500',
    });

    render(<TwoFactorEnrollmentPanel />);

    expect(
      await screen.findByText(/Could not read your current two-factor status/i),
    ).toBeInTheDocument();
  });
});

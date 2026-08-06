import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  get2FAStatus: vi.fn(),
  setup2FA: vi.fn(),
  verify2FA: vi.fn(),
  disable2FA: vi.fn(),
  regenerateBackupCodes: vi.fn(),
}));

vi.mock('@features/settings/services/user-preferences', () => ({
  default: service,
  settingsService: service,
}));

import { TwoFactorEnrollmentPanel } from './TwoFactorEnrollment';

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
  service.get2FAStatus.mockResolvedValue(disabledStatus());
  service.setup2FA.mockResolvedValue({
    data: { secret: SECRET, otpauthUrl: OTPAUTH, backupCodes: BACKUP_CODES },
  });
  service.verify2FA.mockResolvedValue({ success: true });
  service.disable2FA.mockResolvedValue({ success: true });
  service.regenerateBackupCodes.mockResolvedValue({ backupCodes: BACKUP_CODES });
});

describe('TwoFactorEnrollmentPanel · enable', () => {
  it('runs setup -> scan -> verify and only reports enabled after the server confirms', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(<TwoFactorEnrollmentPanel onStatusChange={onStatusChange} />);

    const setupButton = await screen.findByRole('button', { name: /set up authenticator app/i });
    // The server has said "off", so the panel must not be claiming a second factor.
    expect(screen.queryByText(/Two-factor authentication is on/i)).toBeNull();

    // GET status resolved before /setup is ever called — nothing is optimistic.
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    await user.click(setupButton);

    await waitFor(() => expect(service.setup2FA).toHaveBeenCalledTimes(1));

    // Manual-entry secret is selectable, and the otpauth URI is rendered as a QR image.
    expect(await screen.findByTestId('totp-secret')).toHaveTextContent(SECRET);
    expect(
      await screen.findByAltText(/QR code containing your two-factor setup key/i),
    ).toBeInTheDocument();

    // Backup codes exist locally at this point but must stay hidden until verified.
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
    // No success banner, no backup codes, and the user is still on the verify step.
    expect(screen.queryByText(/is now enabled on your account/i)).toBeNull();
    expect(screen.queryByText(BACKUP_CODES[0]!)).toBeNull();
    expect(screen.getByRole('button', { name: /verify and enable/i })).toBeInTheDocument();
    // Status was only read on mount — a rejected code never triggers a re-read.
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

    // Dismissal is blocked until the user says they saved them.
    const done = screen.getByRole('button', { name: /^Done$/i });
    expect(done).toBeDisabled();
    await user.click(screen.getByLabelText(/I have saved these backup codes/i));
    expect(done).toBeEnabled();
    await user.click(done);

    // Once dismissed the plaintext codes are gone from the DOM for good; only
    // the server-reported remaining count survives.
    await waitFor(() => expect(screen.queryByRole('list', { name: /Backup codes/i })).toBeNull());
    expect(screen.queryByText(BACKUP_CODES[0]!)).toBeNull();
    expect(await screen.findByText(/3 backup codes remaining/i)).toBeInTheDocument();
  });

  it('regenerates backup codes with a current authenticator code', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    service.regenerateBackupCodes.mockResolvedValue({ backupCodes: ['ZZZZ-9999'] });

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /generate new backup codes/i }));
    await user.type(screen.getByLabelText(/^Authenticator code$/i), '654321');
    await user.click(screen.getByRole('button', { name: /generate new codes/i }));

    await waitFor(() => expect(service.regenerateBackupCodes).toHaveBeenCalledWith('654321'));
    expect(
      await screen.findByText(/Your previous backup codes have been invalidated/i),
    ).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: /Backup codes/i })).toHaveTextContent(
      'ZZZZ-9999',
    );
  });
});

describe('TwoFactorEnrollmentPanel · disable', () => {
  it('requires a code, sends it to the disable route, and re-reads status', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /turn off two-factor/i }));

    const confirm = screen.getByRole('button', { name: /turn off two-factor/i });
    // An empty code can never reach the route — it would just 400.
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Authenticator or backup code/i), 'AAAA-1111');
    service.get2FAStatus.mockResolvedValue(disabledStatus());
    await user.click(confirm);

    await waitFor(() => expect(service.disable2FA).toHaveBeenCalledWith('AAAA-1111'));
    expect(
      await screen.findByRole('button', { name: /set up authenticator app/i }),
    ).toBeInTheDocument();
  });

  it('stays enabled and surfaces the failure when the disable code is rejected', async () => {
    const user = userEvent.setup();
    service.get2FAStatus.mockResolvedValue(enabledStatus());
    service.disable2FA.mockResolvedValue({
      success: false,
      error: 'Authentication required',
      status: 401,
    });

    render(<TwoFactorEnrollmentPanel />);

    await user.click(await screen.findByRole('button', { name: /turn off two-factor/i }));
    await user.type(screen.getByLabelText(/Authenticator or backup code/i), '000000');
    await user.click(screen.getByRole('button', { name: /turn off two-factor/i }));

    expect(await screen.findByText(/That code was not accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set up authenticator app/i })).toBeNull();
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

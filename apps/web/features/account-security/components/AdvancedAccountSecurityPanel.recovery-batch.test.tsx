import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSecurityStatus } from '@agiworkforce/cloud-contracts/account-security';
import * as client from '../lib/account-security-client';
import { AdvancedAccountSecurityPanel } from './AdvancedAccountSecurityPanel';

const listeners = vi.hoisted(() => new Set<() => void>());
const identity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'owner-a', sessionId: 'session-a' },
  clerk: {
    loaded: true,
    user: { id: 'owner-a' },
    session: { id: 'session-a', user: { id: 'owner-a' }, getToken: vi.fn() },
    addListener: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  },
}));
const proof = vi.hoisted(() => ({ withStepUp: vi.fn() }));
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => identity.auth,
  useClerk: () => identity.clerk,
}));
vi.mock('@features/settings/hooks/useStepUp', () => ({
  useStepUp: () => ({ withStepUp: proof.withStepUp, dialog: null }),
}));
vi.mock('@agiworkforce/ui', async () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Alert: Box,
    AlertDescription: Box,
    Card: Box,
    CardContent: Box,
    CardDescription: Box,
    CardHeader: Box,
    CardTitle: Box,
    Button: ({
      variant: _variant,
      size: _size,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
      <button {...props} />
    ),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Spinner: () => <span role="status">Working</span>,
    useConfirmAction: () => ({ confirm: vi.fn(), dialog: null }),
  };
});
vi.mock('../lib/account-security-client', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule0>();
  return {
    ...actual,
    addCredential: vi.fn(),
    cancelRecovery: vi.fn(),
    canUseWebAuthn: vi.fn(),
    confirmReplacementRecoveryKeys: vi.fn(),
    disableAccountSecurity: vi.fn(),
    enrollAccountSecurity: vi.fn(),
    fetchAccountSecurityStatus: vi.fn(),
    generateRecoveryKeys: vi.fn(),
    removeCredential: vi.fn(),
    sendEnrollmentCode: vi.fn(),
    verifyWithPasskey: vi.fn(),
  };
});

const receiptA = {
  recoveryBatchId: 'a'.repeat(43),
  recoveryKeys: ['AAAA-BBBB-CCCC'],
  expiresAt: '2026-11-07T13:00:00.000Z',
};
const receiptB = {
  recoveryBatchId: 'b'.repeat(43),
  recoveryKeys: ['DDDD-EEEE-FFFF'],
  expiresAt: '2026-11-07T13:10:00.000Z',
};
const credentials = [0, 1].map((index) => ({
  id: `credential-${index}`,
  name: `Key ${index}`,
  kind: 'passkey' as const,
  worksAcrossDevices: true,
  createdAt: '2026-11-01T12:00:00.000Z',
  lastUsedAt: null,
}));
const available: AccountSecurityStatus = { state: 'available', credentials };
const enrolled: AccountSecurityStatus = {
  state: 'enrolled',
  credentials,
  enrolledAt: '2026-11-01T12:00:00.000Z',
  verifiedUntil: '2026-11-08T12:00:00.000Z',
  recoveryKeysRemaining: 8,
  recovery: null,
};
const enrollmentResult = {
  enrolledAt: enrolled.enrolledAt,
  verifiedUntil: enrolled.verifiedUntil,
  sessionsSignedOut: 1,
  devicesSignedOut: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function changeIdentity(userId: string, sessionId: string) {
  identity.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  identity.clerk.user = { id: userId };
  identity.clerk.session = { id: sessionId, user: { id: userId }, getToken: vi.fn() };
}
async function click(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}
async function setupKeys() {
  await click('Set up');
  await click('Continue');
  await screen.findByText(receiptA.recoveryKeys[0]!);
}
async function acknowledge() {
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'I saved my recovery keys somewhere safe' }),
  );
}
async function emailStep() {
  await setupKeys();
  await acknowledge();
  await click('Continue');
  await screen.findByRole('textbox', { name: 'Code from the email' });
}
async function enroll() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Code from the email' }), {
    target: { value: '123456' },
  });
  await click('Turn on Advanced Account Security');
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  changeIdentity('owner-a', 'session-a');
  vi.mocked(client.canUseWebAuthn).mockReturnValue(true);
  vi.mocked(client.fetchAccountSecurityStatus).mockResolvedValue(available);
  vi.mocked(client.generateRecoveryKeys).mockResolvedValue(receiptA);
  vi.mocked(client.sendEnrollmentCode).mockResolvedValue({
    sentTo: 'owner@example.test',
    expiresAt: receiptA.expiresAt,
  });
  vi.mocked(client.enrollAccountSecurity).mockResolvedValue(enrollmentResult);
  vi.mocked(client.confirmReplacementRecoveryKeys).mockResolvedValue(undefined);
});

describe('recovery batch UI ownership (source-authored, not browser acceptance)', () => {
  it('retains the exact acknowledged receipt through setup, email resend and enrollment', async () => {
    render(<AdvancedAccountSecurityPanel />);
    await setupKeys();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await acknowledge();
    await click('Continue');
    await click('Send a new code');
    await enroll();
    await waitFor(() =>
      expect(client.enrollAccountSecurity).toHaveBeenCalledWith(
        proof.withStepUp,
        '123456',
        receiptA.recoveryBatchId,
      ),
    );
    expect(client.generateRecoveryKeys).toHaveBeenCalledTimes(1);
    expect(client.sendEnrollmentCode).toHaveBeenCalledTimes(2);
  });

  it('confirms only the acknowledged replacement batch', async () => {
    vi.mocked(client.fetchAccountSecurityStatus).mockResolvedValue(enrolled);
    render(<AdvancedAccountSecurityPanel />);
    await click('Replace recovery keys');
    await screen.findByText(receiptA.recoveryKeys[0]!);
    expect(screen.getByRole('button', { name: 'Save new recovery keys' })).toBeDisabled();
    await acknowledge();
    await click('Save new recovery keys');
    await waitFor(() =>
      expect(client.confirmReplacementRecoveryKeys).toHaveBeenCalledWith(
        proof.withStepUp,
        receiptA.recoveryBatchId,
      ),
    );
    await screen.findByText('Your new recovery keys are saved. The old ones no longer work.');
  });

  it.each(['cancel', 'regenerate'] as const)(
    'retires a replacement receipt on %s',
    async (action) => {
      vi.mocked(client.fetchAccountSecurityStatus).mockResolvedValue(enrolled);
      vi.mocked(client.generateRecoveryKeys)
        .mockResolvedValueOnce(receiptA)
        .mockResolvedValueOnce(receiptB);
      render(<AdvancedAccountSecurityPanel />);
      await click('Replace recovery keys');
      await acknowledge();
      if (action === 'cancel') {
        await click('Keep current keys');
        await click('Replace recovery keys');
      } else await click('Generate new recovery keys');
      await screen.findByText(receiptB.recoveryKeys[0]!);
      expect(screen.queryByText(receiptA.recoveryKeys[0]!)).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(screen.getByRole('button', { name: 'Save new recovery keys' })).toBeDisabled();
      await acknowledge();
      await click('Save new recovery keys');
      expect(client.confirmReplacementRecoveryKeys).toHaveBeenCalledWith(
        proof.withStepUp,
        receiptB.recoveryBatchId,
      );
    },
  );

  it('requires a new acknowledgment and email step after regenerating during setup', async () => {
    vi.mocked(client.generateRecoveryKeys)
      .mockResolvedValueOnce(receiptA)
      .mockResolvedValueOnce(receiptB);
    render(<AdvancedAccountSecurityPanel />);
    await emailStep();
    fireEvent.change(screen.getByRole('textbox', { name: 'Code from the email' }), {
      target: { value: '123456' },
    });
    await click('Generate new recovery keys');
    await screen.findByText(receiptB.recoveryKeys[0]!);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await acknowledge();
    await click('Continue');
    expect(await screen.findByRole('textbox', { name: 'Code from the email' })).toHaveValue('');
    await enroll();
    expect(client.enrollAccountSecurity).toHaveBeenCalledWith(
      proof.withStepUp,
      '123456',
      receiptB.recoveryBatchId,
    );
  });

  it('retires the setup receipt when the email flow is cancelled', async () => {
    vi.mocked(client.generateRecoveryKeys)
      .mockResolvedValueOnce(receiptA)
      .mockResolvedValueOnce(receiptB);
    render(<AdvancedAccountSecurityPanel />);
    await emailStep();
    await click('Not now');
    await click('Set up');
    await click('Continue');
    await screen.findByText(receiptB.recoveryKeys[0]!);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(client.enrollAccountSecurity).not.toHaveBeenCalled();
  });

  it('removes the previous replacement before regeneration settles, even if regeneration fails', async () => {
    const pending = deferred<typeof receiptB>();
    vi.mocked(client.fetchAccountSecurityStatus).mockResolvedValue(enrolled);
    vi.mocked(client.generateRecoveryKeys)
      .mockResolvedValueOnce(receiptA)
      .mockReturnValueOnce(pending.promise);
    render(<AdvancedAccountSecurityPanel />);
    await click('Replace recovery keys');
    await acknowledge();
    await click('Generate new recovery keys');
    expect(screen.queryByText(receiptA.recoveryKeys[0]!)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await act(async () => {
      pending.reject(new Error('Generation failed'));
      await pending.promise.catch(() => undefined);
    });
    expect(screen.queryByText(receiptA.recoveryKeys[0]!)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save new recovery keys' }),
    ).not.toBeInTheDocument();
    expect(client.confirmReplacementRecoveryKeys).not.toHaveBeenCalled();
  });

  it('retires a conflicted replacement and retries only after fresh acknowledgment', async () => {
    vi.mocked(client.fetchAccountSecurityStatus).mockResolvedValue(enrolled);
    vi.mocked(client.generateRecoveryKeys)
      .mockResolvedValueOnce(receiptA)
      .mockResolvedValueOnce(receiptB);
    vi.mocked(client.confirmReplacementRecoveryKeys)
      .mockRejectedValueOnce(
        new client.AccountSecurityRequestError('Generate new recovery keys.', 409),
      )
      .mockResolvedValueOnce(undefined);
    render(<AdvancedAccountSecurityPanel />);
    await click('Replace recovery keys');
    await acknowledge();
    await click('Save new recovery keys');
    await click('Replace recovery keys');
    await screen.findByText(receiptB.recoveryKeys[0]!);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(client.confirmReplacementRecoveryKeys).toHaveBeenCalledTimes(1);
    await acknowledge();
    await click('Save new recovery keys');
    expect(vi.mocked(client.confirmReplacementRecoveryKeys).mock.calls.map(([, id]) => id)).toEqual(
      [receiptA.recoveryBatchId, receiptB.recoveryBatchId],
    );
  });

  it('retires a conflicted enrollment and requires renewed email/passkey submission', async () => {
    vi.mocked(client.generateRecoveryKeys)
      .mockResolvedValueOnce(receiptA)
      .mockResolvedValueOnce(receiptB);
    vi.mocked(client.enrollAccountSecurity)
      .mockRejectedValueOnce(
        new client.AccountSecurityRequestError('Generate new recovery keys.', 409),
      )
      .mockResolvedValueOnce(enrollmentResult);
    render(<AdvancedAccountSecurityPanel />);
    await emailStep();
    await enroll();
    await click('Continue');
    await screen.findByText(receiptB.recoveryKeys[0]!);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await acknowledge();
    await click('Continue');
    expect(await screen.findByRole('textbox', { name: 'Code from the email' })).toHaveValue('');
    await enroll();
    expect(client.sendEnrollmentCode).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(client.enrollAccountSecurity).mock.calls.map(([, code, id]) => [code, id]),
    ).toEqual([
      ['123456', receiptA.recoveryBatchId],
      ['123456', receiptB.recoveryBatchId],
    ]);
    // The transport fixture, not this mocked client, covers actual proof acquisition/replay.
  });

  it('retires visible keys on an identity subscription notification without an external rerender', async () => {
    vi.mocked(client.fetchAccountSecurityStatus).mockResolvedValue(enrolled);
    render(<AdvancedAccountSecurityPanel />);
    await click('Replace recovery keys');
    await acknowledge();
    expect(listeners.size).toBeGreaterThan(0);
    act(() => {
      changeIdentity('owner-b', 'session-b');
      for (const listener of [...listeners]) listener();
    });
    await screen.findByRole('button', { name: 'Replace recovery keys' });
    expect(screen.queryByText(receiptA.recoveryKeys[0]!)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(client.confirmReplacementRecoveryKeys).not.toHaveBeenCalled();
  });

  it.each(['account', 'session'] as const)(
    'suppresses late generation after a %s change',
    async (change) => {
      const pending = deferred<typeof receiptA>();
      vi.mocked(client.generateRecoveryKeys).mockReturnValueOnce(pending.promise);
      const view = render(<AdvancedAccountSecurityPanel />);
      await click('Set up');
      await click('Continue');
      changeIdentity(change === 'account' ? 'owner-b' : 'owner-a', 'session-b');
      view.rerender(<AdvancedAccountSecurityPanel />);
      await screen.findByRole('button', { name: 'Set up' });
      await act(async () => {
        pending.resolve(receiptA);
        await pending.promise;
      });
      expect(screen.queryByText(receiptA.recoveryKeys[0]!)).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    },
  );

  it.each(['account', 'session'] as const)(
    'suppresses late enrollment success after a %s change',
    async (change) => {
      const pending = deferred<typeof enrollmentResult>();
      vi.mocked(client.enrollAccountSecurity).mockReturnValueOnce(pending.promise);
      const view = render(<AdvancedAccountSecurityPanel />);
      await emailStep();
      await enroll();
      changeIdentity(change === 'account' ? 'owner-b' : 'owner-a', 'session-b');
      view.rerender(<AdvancedAccountSecurityPanel />);
      await screen.findByRole('button', { name: 'Set up' });
      await act(async () => {
        pending.resolve(enrollmentResult);
        await pending.promise;
      });
      expect(screen.queryByText(/Advanced Account Security is on\./)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Set up' })).toBeEnabled();
    },
  );
});

type ImportedModule0 = typeof import('../lib/account-security-client');

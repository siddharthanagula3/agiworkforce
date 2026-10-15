import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const waitlistMocks = vi.hoisted(() => ({
  join: vi.fn(),
  redeem: vi.fn(),
}));

const statusMocks = vi.hoisted(() => ({
  status: null as null | {
    joinedPlans: string[];
    upgradeGateEnabled: boolean;
    accessGranted: boolean;
    noticeEmail?: string | null;
  },
  recordJoined: vi.fn(),
  recordAccessGranted: vi.fn(),
}));

vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children?: React.ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Dismiss dialog
        </button>
        {children}
      </div>
    ),
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    Button: ({
      children,
      disabled,
      onClick,
      'aria-describedby': describedBy,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      'aria-describedby'?: string;
    }) => (
      <button type="button" disabled={disabled} onClick={onClick} aria-describedby={describedBy}>
        {children}
      </button>
    ),
  };
});

vi.mock('@features/billing/services/upgrade-waitlist', () => ({
  joinUpgradeWaitlist: waitlistMocks.join,
  readUpgradeWaitlistStatus: vi.fn(),
  redeemUpgradeAccessCode: waitlistMocks.redeem,
  upgradeNeedsWaitlist: vi.fn(),
}));

vi.mock('@features/billing/hooks/use-upgrade-waitlist', () => ({
  resolveUpgradeWaitlistStatus: vi.fn(),
  useUpgradeWaitlistStatus: () => statusMocks,
}));

import { UpgradeWaitlistDialog, UpgradeWaitlistPanel } from './UpgradeWaitlistDialog';

const request = { plan: 'pro' as const, billingInterval: 'monthly' as const };

describe('UpgradeWaitlistDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusMocks.status = {
      joinedPlans: [],
      upgradeGateEnabled: true,
      accessGranted: false,
      noticeEmail: 'ada@example.com',
    };
    waitlistMocks.join.mockResolvedValue(undefined);
    waitlistMocks.redeem.mockResolvedValue(undefined);
  });

  it('joins the selected plan waitlist and confirms how the account will hear, without opening checkout', async () => {
    const onAccessGranted = vi.fn();
    render(
      <UpgradeWaitlistDialog
        request={request}
        onClose={vi.fn()}
        onAccessGranted={onAccessGranted}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Join the Pro upgrade waitlist' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Join upgrade waitlist' }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(
      'We’ll email ada@example.com when you can upgrade to Pro.',
    );
    expect(confirmation).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'You’re on the Pro waitlist' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Join upgrade waitlist' })).toBeNull();
    expect(waitlistMocks.join).toHaveBeenCalledWith(request);
    expect(statusMocks.recordJoined).toHaveBeenCalledWith('pro');
    expect(onAccessGranted).not.toHaveBeenCalled();
  });

  it('joins as soon as the plan card that asked to join opens it, then confirms', async () => {
    render(
      <React.StrictMode>
        <UpgradeWaitlistDialog
          request={request}
          joinOnOpen
          onClose={vi.fn()}
          onAccessGranted={vi.fn()}
        />
      </React.StrictMode>,
    );

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(
      'We’ll email ada@example.com when you can upgrade to Pro.',
    );
    expect(confirmation).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'You’re on the Pro waitlist' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Join upgrade waitlist' })).toBeNull();
    expect(screen.getByLabelText('Access code')).toBeEnabled();
    expect(waitlistMocks.join.mock.calls).toEqual([[request]]);
    expect(statusMocks.recordJoined).toHaveBeenCalledWith('pro');
  });

  it('lets the dialog close while joining, because joining again changes nothing', () => {
    waitlistMocks.join.mockReturnValue(new Promise(() => undefined));
    const onClose = vi.fn();
    render(
      <UpgradeWaitlistDialog
        request={request}
        joinOnOpen
        onClose={onClose}
        onAccessGranted={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open while a code is being redeemed into checkout', async () => {
    waitlistMocks.redeem.mockReturnValue(new Promise(() => undefined));
    const onClose = vi.fn();
    render(<UpgradeWaitlistDialog request={request} onClose={onClose} onAccessGranted={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Access code'), { target: { value: 'early-access' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));
    await screen.findByRole('button', { name: 'Checking code…' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers the join again when joining on open fails', async () => {
    waitlistMocks.join.mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'));

    render(
      <UpgradeWaitlistDialog
        request={request}
        joinOnOpen
        onClose={vi.fn()}
        onAccessGranted={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Try again shortly.',
    );
    expect(screen.getByRole('button', { name: 'Join upgrade waitlist' })).toBeEnabled();
    expect(statusMocks.recordJoined).not.toHaveBeenCalled();
  });

  it('reports a failed join beside the join control, never as an access code error', async () => {
    waitlistMocks.join.mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'));

    render(
      <UpgradeWaitlistDialog
        request={request}
        joinOnOpen
        onClose={vi.fn()}
        onAccessGranted={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Try again shortly.',
    );
    const code = screen.getByLabelText('Access code');
    expect(code).not.toHaveAttribute('aria-invalid', 'true');
    expect(code).not.toHaveAttribute('aria-describedby');
    expect(
      screen.getByRole('button', { name: 'Join upgrade waitlist' }),
    ).toHaveAccessibleDescription('Too many requests. Try again shortly.');
  });

  it('opens on the place the server already holds, so a reload or another device still shows it', () => {
    statusMocks.status = {
      joinedPlans: ['pro'],
      upgradeGateEnabled: true,
      accessGranted: false,
      noticeEmail: 'ada@example.com',
    };

    render(<UpgradeWaitlistDialog request={request} onClose={vi.fn()} onAccessGranted={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'You’re on the Pro waitlist' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'We’ll email ada@example.com when you can upgrade to Pro.',
    );
    expect(screen.queryByRole('button', { name: 'Join upgrade waitlist' })).toBeNull();
    expect(screen.getByLabelText('Access code')).toBeEnabled();
    expect(waitlistMocks.join).not.toHaveBeenCalled();
  });

  it('promises a notice in Notifications, not an email, when no email will go out', async () => {
    statusMocks.status = {
      joinedPlans: [],
      upgradeGateEnabled: true,
      accessGranted: false,
      noticeEmail: null,
    };

    render(<UpgradeWaitlistDialog request={request} onClose={vi.fn()} onAccessGranted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Join upgrade waitlist' }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(
      'We’ll let you know in Notifications when you can upgrade to Pro.',
    );
    expect(confirmation).not.toHaveTextContent(/email/i);
  });

  it('promises no email while the upgrade status has not been read', async () => {
    statusMocks.status = null;

    render(<UpgradeWaitlistDialog request={request} onClose={vi.fn()} onAccessGranted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Join upgrade waitlist' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'We’ll let you know in Notifications when you can upgrade to Pro.',
    );
  });

  it('shows why joining failed and keeps the join control', async () => {
    waitlistMocks.join.mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'));

    render(<UpgradeWaitlistDialog request={request} onClose={vi.fn()} onAccessGranted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Join upgrade waitlist' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Try again shortly.',
    );
    expect(screen.getByRole('button', { name: 'Join upgrade waitlist' })).toBeEnabled();
    expect(statusMocks.recordJoined).not.toHaveBeenCalled();
  });

  it('opens the existing checkout only after a valid code is redeemed', async () => {
    const onAccessGranted = vi.fn(async () => undefined);
    render(
      <UpgradeWaitlistDialog
        request={request}
        onClose={vi.fn()}
        onAccessGranted={onAccessGranted}
      />,
    );

    fireEvent.change(screen.getByLabelText('Access code'), {
      target: { value: 'agiwaitlist2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    await waitFor(() => expect(waitlistMocks.redeem).toHaveBeenCalledWith('AGIWAITLIST2026'));
    expect(statusMocks.recordAccessGranted).toHaveBeenCalled();
    expect(onAccessGranted).toHaveBeenCalledWith(request);
  });

  it('lets the dialog go once checkout has opened somewhere else', async () => {
    const onClose = vi.fn();
    render(
      <UpgradeWaitlistDialog
        request={request}
        onClose={onClose}
        onAccessGranted={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Access code'), {
      target: { value: 'agiwaitlist2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Continue with code' })).toBeEnabled();
    expect(screen.queryByText('Opening checkout…')).toBeNull();
  });

  it('keeps checkout closed and shows the refusal when a code is invalid', async () => {
    waitlistMocks.redeem.mockRejectedValueOnce(new Error('This access code is not valid.'));
    const onAccessGranted = vi.fn();
    render(
      <UpgradeWaitlistDialog
        request={request}
        onClose={vi.fn()}
        onAccessGranted={onAccessGranted}
      />,
    );

    fireEvent.change(screen.getByLabelText('Access code'), { target: { value: 'invalidcode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This access code is not valid.');
    expect(screen.getByLabelText('Access code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Access code')).toHaveAccessibleDescription(
      'This access code is not valid.',
    );
    expect(statusMocks.recordAccessGranted).not.toHaveBeenCalled();
    expect(onAccessGranted).not.toHaveBeenCalled();
  });
});

describe('UpgradeWaitlistPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusMocks.status = {
      joinedPlans: [],
      upgradeGateEnabled: true,
      accessGranted: false,
      noticeEmail: 'ada@example.com',
    };
    waitlistMocks.join.mockResolvedValue(undefined);
  });

  it('hands its controls back once access is granted and checkout has opened', async () => {
    waitlistMocks.redeem.mockResolvedValue(undefined);
    const onAccessGranted = vi.fn(async () => undefined);
    render(<UpgradeWaitlistPanel request={request} onAccessGranted={onAccessGranted} />);

    fireEvent.change(screen.getByLabelText('Access code'), {
      target: { value: 'agiwaitlist2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    await waitFor(() => expect(onAccessGranted).toHaveBeenCalledWith(request));
    expect(await screen.findByRole('button', { name: 'Continue with code' })).toBeEnabled();
    expect(screen.getByLabelText('Access code')).toBeEnabled();
  });

  it('offers the same waitlist inline, named by its own heading', async () => {
    render(<UpgradeWaitlistPanel request={request} onAccessGranted={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Join the Pro upgrade waitlist' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Join upgrade waitlist' }));

    expect(await screen.findByRole('region', { name: 'You’re on the Pro waitlist' })).toBeVisible();
    expect(waitlistMocks.join).toHaveBeenCalledWith(request);
  });
});

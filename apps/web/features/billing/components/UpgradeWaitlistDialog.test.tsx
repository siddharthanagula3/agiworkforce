import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const waitlistMocks = vi.hoisted(() => ({
  join: vi.fn(),
  redeem: vi.fn(),
}));

vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
    Button: ({
      children,
      disabled,
      onClick,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

vi.mock('@features/billing/services/upgrade-waitlist', () => ({
  joinUpgradeWaitlist: waitlistMocks.join,
  redeemUpgradeAccessCode: waitlistMocks.redeem,
}));

import { UpgradeWaitlistDialog } from './UpgradeWaitlistDialog';

const request = { plan: 'pro' as const, billingInterval: 'monthly' as const };

describe('UpgradeWaitlistDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitlistMocks.join.mockResolvedValue(undefined);
    waitlistMocks.redeem.mockResolvedValue(undefined);
  });

  it('joins the selected plan waitlist without opening checkout', async () => {
    const onAccessGranted = vi.fn();
    render(
      <UpgradeWaitlistDialog
        request={request}
        onClose={vi.fn()}
        onAccessGranted={onAccessGranted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Join upgrade waitlist' }));

    await screen.findByRole('button', { name: 'You’re on the waitlist' });
    expect(waitlistMocks.join).toHaveBeenCalledWith(request);
    expect(onAccessGranted).not.toHaveBeenCalled();
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
    expect(onAccessGranted).toHaveBeenCalledWith(request);
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
    expect(onAccessGranted).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { NotificationsSection } from './NotificationsSection';
import { SecuritySection } from './SecuritySection';

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (state: { subscription: { status: string; tier: string } }) => unknown,
  ) => selector({ subscription: { status: 'active', tier: 'pro' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: () => Promise.resolve({ browserReplyReady: true }),
  savePreferenceNamespace: () => Promise.resolve(undefined),
}));

vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  useUserSettings: () => ({ data: null, isLoading: false }),
  useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@features/settings/components/Settings/TwoFactor', () => ({
  TwoFactorPanel: () => <div>Account controls</div>,
}));

vi.mock('@features/settings/components/AuditLogPanel', () => ({
  AuditLogPanel: () => <div>Security activity</div>,
}));

vi.mock('@agiworkforce/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@agiworkforce/ui');
  return {
    ...actual,
    Switch: ({ checked }: { checked: boolean }) => <span role="switch" aria-checked={checked} />,
  };
});

describe('Web Settings capability boundaries', () => {
  it('shows only the notification channels with a real sender', async () => {
    render(<NotificationsSection />);

    expect(screen.getByText('Three channels have a sender')).toBeInTheDocument();
    expect(
      screen.getByText(/Project, usage, billing, security, connector, tips, and marketing/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Synced to your account')).toBeInTheDocument());
  });

  it('does not deny the email and push schedule channels, which are implemented', () => {
    render(<NotificationsSection />);

    expect(screen.queryByText('Browser replies only')).not.toBeInTheDocument();
    expect(screen.queryByText(/Email, task, schedule, project/)).not.toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Mobile push')).toBeInTheDocument();
    expect(screen.getAllByText('Scheduled task finished')).toHaveLength(2);
  });

  it('does not imply unsupported account factors or trusted contacts', () => {
    render(<SecuritySection />);

    expect(screen.getByText('Current account boundary')).toBeInTheDocument();
    expect(
      screen.getByText(/Passkeys, security keys, SMS MFA, and trusted-device lists/),
    ).toBeInTheDocument();
    expect(screen.getByText('Trusted contact · Not configured')).toBeInTheDocument();
    expect(
      screen.getByText(/does not monitor conversations to notify another person/),
    ).toBeInTheDocument();
  });

  it('does not deny cross-device session revocation, which is implemented', () => {
    render(<SecuritySection />);

    expect(screen.queryByText(/cross-device session revocation/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sign out other devices, use\s+Account settings/i)).toBeInTheDocument();
  });
});

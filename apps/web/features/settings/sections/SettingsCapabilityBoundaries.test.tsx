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
  it('shows only the notification channel with a real sender', async () => {
    render(<NotificationsSection />);

    expect(screen.getByText('Browser replies only')).toBeInTheDocument();
    expect(
      screen.getByText(/Email, task, schedule, project, usage, tips, and marketing channels/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Synced to your account')).toBeInTheDocument());
  });

  it('does not imply unsupported account factors, device revocation, or trusted contacts', () => {
    render(<SecuritySection />);

    expect(screen.getByText('Current account boundary')).toBeInTheDocument();
    expect(
      screen.getByText(/Passkeys, security keys, SMS MFA, trusted-device lists/),
    ).toBeInTheDocument();
    expect(screen.getByText('Trusted contact · Not configured')).toBeInTheDocument();
    expect(
      screen.getByText(/does not monitor conversations to notify another person/),
    ).toBeInTheDocument();
  });
});

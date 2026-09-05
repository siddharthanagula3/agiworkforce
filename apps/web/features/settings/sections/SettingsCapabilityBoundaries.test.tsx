import { render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { NotificationsSection } from './NotificationsSection';
import { SecuritySection } from './SecuritySection';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { publicMetadata: { role: 'member' } } }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (state: { subscription: { status: string; tier: string } }) => unknown,
  ) => selector({ subscription: { status: 'active', tier: 'pro' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
  fetchStoredPreferenceNamespace: vi.fn(async () => ({})),
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => {}),
  refreshProfileConsumers: vi.fn(async () => {}),
  saveDisplayName: vi.fn(async () => {}),
}));

vi.mock('@features/settings/hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
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

    const scheduleSelect = screen.getByRole('combobox', { name: 'Scheduled task finished' });
    const optionLabels = within(scheduleSelect)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['Off', 'Email', 'Mobile push', 'Email, Mobile push']);
    expect(screen.queryByText(/project, usage, billing/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('offers the browser push channel that web-push delivery actually sends to', () => {
    render(<NotificationsSection />);

    const runEvent = screen.getByRole('region', { name: 'Agent run updates' });
    expect(within(runEvent).getByText('Browser notifications')).toBeInTheDocument();
    expect(within(runEvent).getByRole('switch')).toBeInTheDocument();
  });

  it('does not deny the email and push schedule channels, which are implemented', () => {
    render(<NotificationsSection />);

    expect(screen.queryByText('Browser replies only')).not.toBeInTheDocument();
    expect(screen.queryByText(/Email, task, schedule, project/)).not.toBeInTheDocument();
    const scheduleEvent = screen.getByRole('region', { name: 'Scheduled task finished' });
    expect(within(scheduleEvent).getByRole('option', { name: 'Email' })).toBeInTheDocument();
    expect(within(scheduleEvent).getByRole('option', { name: 'Mobile push' })).toBeInTheDocument();
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

  it('leads with the working controls and keeps the boundary notes last', () => {
    render(<SecuritySection />);

    const controls = screen.getByText('Account controls');
    const boundary = screen.getByText('Current account boundary');
    const trustedContact = screen.getByText('Trusted contact · Not configured');

    expect(controls.compareDocumentPosition(boundary)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(boundary.compareDocumentPosition(trustedContact)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('does not deny cross-device session revocation, which is implemented', () => {
    render(<SecuritySection />);

    expect(screen.queryByText(/cross-device session revocation/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sign out other devices, use\s+Account settings/i)).toBeInTheDocument();
  });
});

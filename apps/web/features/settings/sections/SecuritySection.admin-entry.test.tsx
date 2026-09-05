import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerk = vi.hoisted(() => ({
  user: null as { publicMetadata: Record<string, unknown> } | null,
  isLoaded: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: clerk.isLoaded, user: clerk.user }),
}));

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

vi.mock('@features/settings/hooks/use-settings-queries', async (importOriginal) => {
  const settings = { two_factor_enabled: false, session_timeout: 60 };
  return {
    ...(await importOriginal()),
    useUserSettings: () => ({ data: settings, isLoading: false }),
    useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
    useChangePassword: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('@features/settings/components/AuditLogPanel', () => ({
  AuditLogPanel: () => <div>Security activity</div>,
}));

vi.mock('@features/settings/components/Settings/TwoFactor', () => ({
  TwoFactorPanel: () => <div data-testid="security-form-2fa" />,
}));

vi.mock('@features/settings/components/Settings/TwoFactorEnrollment', () => ({
  TwoFactorEnrollmentPanel: () => <div data-testid="two-factor-enrollment" />,
}));

import { SecuritySection } from './SecuritySection';

function adminConsoleLink(): HTMLAnchorElement | null {
  return screen.queryByRole('link', { name: /open admin console/i }) as HTMLAnchorElement | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  clerk.isLoaded = true;
  clerk.user = null;
  service.get2FAStatus.mockResolvedValue({ data: { enabled: false, backupCodesRemaining: 0 } });
});

describe('SecuritySection · operator console is not advertised to customers', () => {
  it.each([['admin'], ['owner'], ['member'], ['viewer'], ['ADMIN'], ['']])(
    'renders no inbound /admin link for role %s',
    (role) => {
      clerk.user = { publicMetadata: { role } };
      render(<SecuritySection />);

      expect(adminConsoleLink()).toBeNull();
      expect(screen.queryByTestId('admin-console-entry')).toBeNull();
    },
  );

  it('renders no admin entry point when the user has no role metadata', () => {
    clerk.user = { publicMetadata: {} };
    render(<SecuritySection />);

    expect(screen.queryByTestId('admin-console-entry')).toBeNull();
  });
});

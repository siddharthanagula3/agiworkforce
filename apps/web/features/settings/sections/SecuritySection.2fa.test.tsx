import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseFormReturn } from 'react-hook-form';
import type { SecuritySettingsFormData } from '@features/settings/schemas/settings-validation';

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

vi.mock('@features/settings/hooks/use-settings-queries', () => {
  // Stable reference, exactly as react-query hands back cached data · a fresh
  // object literal per render would re-fire SecuritySection's reset effect.
  const settings = { two_factor_enabled: false, session_timeout: 60 };
  return {
    // The mirror column disagrees with the authoritative 2FA route on purpose.
    useUserSettings: () => ({ data: settings, isLoading: false }),
    useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
    useChangePassword: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('@features/settings/components/AuditLogPanel', () => ({
  AuditLogPanel: () => <div>Security activity</div>,
}));

// Surface the security form's own value so the mirror-vs-authority wiring is
// observable without driving the radix Select in jsdom.
vi.mock('@features/settings/components/Settings/TwoFactor', () => ({
  TwoFactorPanel: ({ securityForm }: { securityForm: UseFormReturn<SecuritySettingsFormData> }) => (
    <div data-testid="security-form-2fa">{String(securityForm.watch('two_factor_enabled'))}</div>
  ),
}));

import { SecuritySection } from './SecuritySection';

beforeEach(() => {
  vi.clearAllMocks();
  service.get2FAStatus.mockResolvedValue({ data: { enabled: false, backupCodesRemaining: 0 } });
});

describe('SecuritySection · authenticator enrollment', () => {
  it('mounts a reachable enrollment control instead of the old disabled toggle', async () => {
    render(<SecuritySection />);

    expect(
      await screen.findByRole('button', { name: /set up authenticator app/i }),
    ).toBeInTheDocument();
    // The claim that enrollment "is coming to web" was false once the routes shipped.
    expect(screen.queryByText(/coming to web/i)).toBeNull();
    expect(screen.queryByText(/remains read-only/i)).toBeNull();
  });

  it('mirrors the authoritative 2FA status into the security form, not the stale column', async () => {
    service.get2FAStatus.mockResolvedValue({
      data: { enabled: true, backupCodesRemaining: 8 },
    });

    render(<SecuritySection />);

    // useUserSettings reports two_factor_enabled: false; GET /api/settings/2fa
    // reports true. Saving the form must not write the stale `false` back.
    await waitFor(() => expect(screen.getByTestId('security-form-2fa')).toHaveTextContent('true'));
  });
});

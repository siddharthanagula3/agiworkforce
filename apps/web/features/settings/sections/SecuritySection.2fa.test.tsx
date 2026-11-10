import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { TwoFactorStatus } from '../services/user-preferences';

const fixture = vi.hoisted(() => ({
  settings: { two_factor_enabled: false, session_timeout: 240 },
  status: undefined as TwoFactorStatus | undefined,
  mutate: vi.fn(),
  readStatus: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/identity/client', async (original) => ({
  ...(await original<ImportedModule0>()),
  useCurrentUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useSignOut: () => vi.fn(),
}));
vi.mock('@shared/stores/authentication-store', async () => ({
  ...(await vi.importActual<AuthenticationStoreModule>('@shared/stores/authentication-store')),
  useAuthStore: () => vi.fn(),
}));
vi.mock('@agiworkforce/ui', async (original) => ({
  ...(await original<ImportedModule1>()),
  useConfirmAction: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock('@features/settings/hooks/useStepUp', () => ({
  useStepUp: () => ({ withStepUp: vi.fn(), dialog: null }),
}));
vi.mock('@features/settings/hooks/use-settings-queries', async () => ({
  ...(await vi.importActual<UseSettingsQueriesModule>(
    '@features/settings/hooks/use-settings-queries',
  )),

  useUserSettings: () => ({ data: fixture.settings, isLoading: false, isError: false }),
  useUpdateSettings: () => ({ mutate: fixture.mutate, isPending: false }),
}));
vi.mock('@features/settings/hooks/use-mfa-readers', async (original) => ({
  ...(await original<ImportedModule2>()),
  useMfaStatus: (active: boolean) => {
    fixture.readStatus(active);
    return { data: active ? fixture.status : undefined };
  },
}));
vi.mock('@features/settings/components/Settings/TwoFactorEnrollment', () => ({
  TwoFactorEnrollmentPanel: ({ active }: { active: boolean }) => (
    <div data-testid="enrollment-active">{String(active)}</div>
  ),
}));
vi.mock('@features/settings/components/Settings/PasswordEditor', () => ({
  PasswordEditor: () => null,
}));
vi.mock('@features/settings/components/Settings/SignInMethodsPanel', () => ({
  SignInMethodsPanel: () => null,
}));
vi.mock('@features/settings/components/Settings/PasskeysPanel', () => ({
  PasskeysPanel: () => null,
}));
vi.mock('@/features/account-security/components/AdvancedAccountSecurityPanel', () => ({
  AdvancedAccountSecurityPanel: () => null,
}));
vi.mock('@features/settings/components/AuditLogPanel', () => ({ AuditLogPanel: () => null }));
vi.mock('@features/settings/components/DeviceSignInToggle', () => ({
  DeviceSignInToggle: ({ active }: { active: boolean }) => (
    <div data-testid="device-sign-in-active">{String(active)}</div>
  ),
}));
vi.mock('@/features/support/components/HelpArticleLink', () => ({ HelpArticleLink: () => null }));
vi.mock('@features/settings/components/SettingsSectionLink', async () => ({
  ...(await vi.importActual<SettingsSectionLinkModule>(
    '@features/settings/components/SettingsSectionLink',
  )),

  SettingsSectionLink: () => null,
}));
vi.mock('./AccountSection', async () => ({
  ...(await vi.importActual<AccountSectionModule>('./AccountSection')),

  readApiError: (_body: unknown, fallback: string) => fallback,
}));
vi.mock('@features/settings/components/Settings/TwoFactor', async (original) => ({
  ...(await original<ImportedModule3>()),
  TwoFactorPanel: ({
    securityForm,
    onSaveSecurity,
  }: ComponentProps<
    typeof import('@features/settings/components/Settings/TwoFactor').TwoFactorPanel
  >) => (
    <>
      <div data-testid="timeout-form">{JSON.stringify(securityForm.watch())}</div>
      <button onClick={securityForm.handleSubmit(onSaveSecurity)}>Save timeout</button>
      <button
        onClick={() =>
          onSaveSecurity({ ...securityForm.getValues(), two_factor_enabled: true } as Parameters<
            typeof onSaveSecurity
          >[0])
        }
      >
        Submit stale caller data
      </button>
    </>
  ),
}));

import { SecuritySection } from './SecuritySection';
type AuthenticationStoreModule = typeof import('@shared/stores/authentication-store');
type UseSettingsQueriesModule = typeof import('@features/settings/hooks/use-settings-queries');
type SettingsSectionLinkModule = typeof import('@features/settings/components/SettingsSectionLink');
type AccountSectionModule = typeof import('./AccountSection');

beforeEach(() => {
  vi.clearAllMocks();
  fixture.settings = { two_factor_enabled: false, session_timeout: 240 };
  fixture.status = undefined;
});

describe('SecuritySection mocked child composition (not enrollment integration)', () => {
  it('independently withdraws and restores device sign-in admission', () => {
    const view = render(<SecuritySection />);
    expect(screen.getByTestId('device-sign-in-active')).toHaveTextContent('true');
    view.rerender(<SecuritySection deviceSignInActive={false} />);
    expect(screen.getByTestId('device-sign-in-active')).toHaveTextContent('false');
    expect(screen.getByTestId('enrollment-active')).toHaveTextContent('true');
    view.rerender(<SecuritySection deviceSignInActive />);
    expect(screen.getByTestId('device-sign-in-active')).toHaveTextContent('true');
  });

  it('withdraws and restores enrollment and reader admission together', () => {
    const view = render(<SecuritySection />);
    expect(screen.getByTestId('enrollment-active')).toHaveTextContent('true');
    expect(fixture.readStatus).toHaveBeenLastCalledWith(true);
    view.rerender(<SecuritySection twoFactorActive={false} />);
    expect(screen.getByTestId('enrollment-active')).toHaveTextContent('false');
    expect(fixture.readStatus).toHaveBeenLastCalledWith(false);
    view.rerender(<SecuritySection twoFactorActive />);
    expect(screen.getByTestId('enrollment-active')).toHaveTextContent('true');
    expect(fixture.readStatus).toHaveBeenLastCalledWith(true);
  });

  it('distinguishes unconfirmed availability from confirmed unavailable and available', () => {
    const view = render(<SecuritySection />);
    expect(screen.getByLabelText('Account security availability')).toHaveTextContent(
      'availability has not been confirmed',
    );
    fixture.status = { enabled: false, backupCodesReady: false, enrollmentAvailable: false };
    view.rerender(<SecuritySection />);
    expect(screen.getByLabelText('Account security availability')).toHaveTextContent(
      'temporarily unavailable',
    );
    fixture.status = { ...fixture.status, enrollmentAvailable: true };
    view.rerender(<SecuritySection />);
    expect(screen.getByLabelText('Account security availability')).toHaveTextContent(
      'supported second factor',
    );
    view.rerender(<SecuritySection twoFactorActive={false} />);
    expect(screen.getByLabelText('Account security availability')).toHaveTextContent(
      'availability has not been confirmed',
    );
  });

  it.each([true, false])(
    'keeps stale preference %s and authoritative status out of timeout form and submissions',
    async (stale) => {
      fixture.settings = { two_factor_enabled: stale, session_timeout: 240 };
      fixture.status = { enabled: !stale, backupCodesReady: !stale, enrollmentAvailable: true };
      const view = render(<SecuritySection />);
      await waitFor(() =>
        expect(screen.getByTestId('timeout-form')).toHaveTextContent('{"session_timeout":240}'),
      );
      expect(screen.getByTestId('timeout-form')).not.toHaveTextContent('two_factor_enabled');
      fireEvent.click(screen.getByRole('button', { name: 'Save timeout' }));
      await waitFor(() => expect(fixture.mutate).toHaveBeenCalledWith({ session_timeout: 240 }));
      fixture.status = { enabled: stale, backupCodesReady: stale, enrollmentAvailable: true };
      view.rerender(<SecuritySection />);
      expect(screen.getByTestId('timeout-form')).not.toHaveTextContent('two_factor_enabled');
      fireEvent.click(screen.getByRole('button', { name: 'Submit stale caller data' }));
      expect(fixture.mutate).toHaveBeenLastCalledWith({ session_timeout: 240 });
      expect(
        fixture.mutate.mock.calls.every(([payload]) => !('two_factor_enabled' in payload)),
      ).toBe(true);
    },
  );
});

type ImportedModule0 = typeof import('@/lib/identity/client');
type ImportedModule1 = typeof import('@agiworkforce/ui');
type ImportedModule2 = typeof import('@features/settings/hooks/use-mfa-readers');
type ImportedModule3 = typeof import('@features/settings/components/Settings/TwoFactor');

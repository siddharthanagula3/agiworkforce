'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useUserSettings,
  useUpdateSettings,
  useChangePassword,
} from '@features/settings/hooks/use-settings-queries';
import {
  changePasswordSchema,
  securitySettingsSchema,
  type ChangePasswordFormData,
  type SecuritySettingsFormData,
} from '@features/settings/schemas/settings-validation';
import { TwoFactorPanel } from '@features/settings/components/Settings/TwoFactor';
import { TwoFactorEnrollmentPanel } from '@features/settings/components/Settings/TwoFactorEnrollment';
import { PasskeysPanel } from '@features/settings/components/Settings/PasskeysPanel';
import { AdvancedAccountSecurityPanel } from '@/features/account-security/components/AdvancedAccountSecurityPanel';
import { SignInMethodsPanel } from '@features/settings/components/Settings/SignInMethodsPanel';
import { AuditLogPanel } from '@features/settings/components/AuditLogPanel';
import { DeviceSignInToggle } from '@features/settings/components/DeviceSignInToggle';
import type { TwoFactorStatus } from '@features/settings/services/user-preferences';
import { useCurrentUser } from '@/lib/identity/client';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

export function SecuritySection() {
  const { data: serverSettings, isLoading } = useUserSettings();
  const updateSettingsMutation = useUpdateSettings();
  const changePasswordMutation = useChangePassword();
  const hasPassword = useCurrentUser().user?.hasPassword === true;
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const securityForm = useForm<SecuritySettingsFormData>({
    resolver: zodResolver(securitySettingsSchema) as Resolver<SecuritySettingsFormData>,
    defaultValues: {
      two_factor_enabled: false,
      session_timeout: 60,
    },
  });

  const passwordForm = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  const authoritativeTwoFactor = useRef<boolean | null>(null);
  const [authenticatorAvailable, setAuthenticatorAvailable] = useState(false);

  useEffect(() => {
    if (serverSettings) {
      securityForm.reset({
        two_factor_enabled:
          authoritativeTwoFactor.current ?? serverSettings.two_factor_enabled ?? false,
        session_timeout: serverSettings.session_timeout ?? 60,
      });
    }
    // securityForm is stable from useForm; only re-run when server data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSettings]);

  const handleSaveSecurity = useCallback(
    (data: SecuritySettingsFormData) => {
      updateSettingsMutation.mutate(data);
    },
    [updateSettingsMutation],
  );

  const handleTwoFactorStatus = useCallback(
    (status: TwoFactorStatus) => {
      authoritativeTwoFactor.current = status.enabled;
      setAuthenticatorAvailable(status.enrollmentAvailable);
      securityForm.setValue('two_factor_enabled', status.enabled, { shouldDirty: false });
    },
    [securityForm],
  );

  const handlePasswordChange = useCallback(
    (data: ChangePasswordFormData) => {
      if (hasPassword && !data.currentPassword) {
        passwordForm.setError('currentPassword', { message: 'Enter your current password' });
        return;
      }
      changePasswordMutation.mutate(
        {
          currentPassword: hasPassword ? (data.currentPassword ?? null) : null,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        },
        {
          onSuccess: () => {
            passwordForm.reset();
          },
        },
      );
    },
    [changePasswordMutation, hasPassword, passwordForm],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Security
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Sign-in methods, passkeys, Advanced Account Security, two-factor authentication, session
          timeout, and password.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="account-security" label="How account security works" />
        </div>
      </div>

      <SignInMethodsPanel />

      <PasskeysPanel />

      <AdvancedAccountSecurityPanel />

      <TwoFactorEnrollmentPanel onStatusChange={handleTwoFactorStatus} />

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading security settings...</div>
      ) : (
        <TwoFactorPanel
          securityForm={securityForm}
          passwordForm={passwordForm}
          isSaving={updateSettingsMutation.isPending || changePasswordMutation.isPending}
          isUpdateSettingsPending={updateSettingsMutation.isPending}
          isChangePasswordPending={changePasswordMutation.isPending}
          hasPassword={hasPassword}
          showNewPassword={showNewPassword}
          showConfirmPassword={showConfirmPassword}
          onSaveSecurity={handleSaveSecurity}
          onPasswordChange={handlePasswordChange}
          onToggleShowNewPassword={() => setShowNewPassword((p) => !p)}
          onToggleShowConfirmPassword={() => setShowConfirmPassword((p) => !p)}
        />
      )}

      {changePasswordMutation.stepUpDialog}

      <AuditLogPanel />

      <DeviceSignInToggle />

      <section
        aria-label="Account security availability"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: 'var(--space-4) var(--space-5)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Current account boundary
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
          SMS MFA is not available, and no device skips the sign-in checks. Hardware security keys
          work with Advanced Account Security. Devices you linked, such as the CLI, VS Code, the
          Chrome extension or the desktop app, are listed in Account settings under Linked devices,
          where you can unlink each one. Passkeys sign you in.{' '}
          {authenticatorAvailable
            ? 'Authenticator app codes (TOTP) with recovery backup codes are the supported second factor.'
            : 'Authenticator app codes (TOTP) and backup codes are temporarily unavailable.'}{' '}
          To review active sessions or sign out other devices, use Account settings.
        </p>
      </section>

      <section
        aria-label="Trusted contact availability"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: 'var(--space-4) var(--space-5)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Trusted contact · Not configured
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
          AGI does not monitor conversations to notify another person. No contact receives
          conversation content or automatic safety alerts.
        </p>
      </section>
    </div>
  );
}

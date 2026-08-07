'use client';

/**
 * SecuritySection — wires the previously-orphaned TwoFactorPanel (session
 * timeout + change password) into the reachable in-app Settings modal.
 * TwoFactorPanel itself was fully built (features/settings/components/
 * Settings/TwoFactor.tsx) and backed by real Neon/Clerk endpoints, but was
 * only ever imported by features/settings/pages/UserSettings.tsx, which is
 * not mounted by any route — making the whole security tab unreachable.
 *
 * Authenticator (TOTP) enrollment lives in TwoFactorEnrollmentPanel below.
 * This route is the product's only 2FA enrollment surface — the mobile app
 * links here (WEB_SECURITY_URL) rather than enrolling on device.
 *
 * Same fix pattern as NotificationsSection.tsx: a section component owning
 * its own form + query wiring, added to WebSettingsModal's sectionContent
 * map and the shared SettingsModal nav config.
 */

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
import { AuditLogPanel } from '@features/settings/components/AuditLogPanel';
import type { TwoFactorStatus } from '@features/settings/services/user-preferences';

export function SecuritySection() {
  const { data: serverSettings, isLoading } = useUserSettings();
  const updateSettingsMutation = useUpdateSettings();
  const changePasswordMutation = useChangePassword();
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
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  // `user_settings.two_factor_enabled` is a mirror column; the authority is
  // `user_two_factor.enabled` behind GET /api/settings/2fa. Once
  // TwoFactorEnrollmentPanel has read that route, its answer wins over the
  // mirror — the two disagree for any account enrolled before the mirror was
  // last written, and a form save must not persist the stale value.
  const authoritativeTwoFactor = useRef<boolean | null>(null);

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

  // Feed the real value into the form without marking it dirty, so saving the
  // session timeout cannot silently write `false` over a live enrollment.
  const handleTwoFactorStatus = useCallback(
    (status: TwoFactorStatus) => {
      authoritativeTwoFactor.current = status.enabled;
      securityForm.setValue('two_factor_enabled', status.enabled, { shouldDirty: false });
    },
    [securityForm],
  );

  const handlePasswordChange = useCallback(
    (data: ChangePasswordFormData) => {
      changePasswordMutation.mutate(
        { newPassword: data.newPassword, confirmPassword: data.confirmPassword },
        {
          onSuccess: () => {
            passwordForm.reset();
          },
        },
      );
    },
    [changePasswordMutation, passwordForm],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Security
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Two-factor authentication, session timeout, and password.
        </p>
      </div>

      <section
        aria-label="Account security availability"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '16px 20px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
          Current account boundary
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
          Passkeys, security keys, SMS MFA, and trusted-device lists are not available in the
          current account contract. Authenticator app codes (TOTP) with recovery backup codes are
          the supported second factor. To review active sessions or sign out other devices, use
          Account settings.
        </p>
      </section>

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
          showNewPassword={showNewPassword}
          showConfirmPassword={showConfirmPassword}
          onSaveSecurity={handleSaveSecurity}
          onPasswordChange={handlePasswordChange}
          onToggleShowNewPassword={() => setShowNewPassword((p) => !p)}
          onToggleShowConfirmPassword={() => setShowConfirmPassword((p) => !p)}
        />
      )}

      <AuditLogPanel />

      <section
        aria-label="Trusted contact availability"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '16px 20px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
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

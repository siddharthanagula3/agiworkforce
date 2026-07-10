'use client';

/**
 * SecuritySection — wires the previously-orphaned TwoFactorPanel (2FA toggle
 * + session timeout + change password) into the reachable in-app Settings
 * modal. TwoFactorPanel itself was fully built (features/settings/components/
 * Settings/TwoFactor.tsx) and backed by real Neon/Clerk endpoints, but was
 * only ever imported by features/settings/pages/UserSettings.tsx, which is
 * not mounted by any route — making the whole security tab unreachable.
 *
 * Same fix pattern as NotificationsSection.tsx: a section component owning
 * its own form + query wiring, added to WebSettingsModal's sectionContent
 * map and the shared SettingsModal nav config.
 */

import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (serverSettings) {
      securityForm.reset({
        two_factor_enabled: serverSettings.two_factor_enabled ?? false,
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
    </div>
  );
}

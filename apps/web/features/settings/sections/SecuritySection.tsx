'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { ChevronRight, LogOut } from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUserSettings, useUpdateSettings } from '@features/settings/hooks/use-settings-queries';
import {
  securitySettingsSchema,
  type SecuritySettingsFormData,
} from '@features/settings/schemas/settings-validation';
import { TwoFactorPanel } from '@features/settings/components/Settings/TwoFactor';
import { PasswordEditor } from '@features/settings/components/Settings/PasswordEditor';
import { TwoFactorEnrollmentPanel } from '@features/settings/components/Settings/TwoFactorEnrollment';
import { PasskeysPanel } from '@features/settings/components/Settings/PasskeysPanel';
import { AdvancedAccountSecurityPanel } from '@/features/account-security/components/AdvancedAccountSecurityPanel';
import { SignInMethodsPanel } from '@features/settings/components/Settings/SignInMethodsPanel';
import { AuditLogPanel } from '@features/settings/components/AuditLogPanel';
import { DeviceSignInToggle } from '@features/settings/components/DeviceSignInToggle';
import { useMfaStatus } from '@features/settings/hooks/use-mfa-readers';
import { useCurrentUser, useSignOut } from '@/lib/identity/client';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { useAuthStore } from '@shared/stores/authentication-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/useStepUp';
import { SettingsSectionLink } from '@features/settings/components/SettingsSectionLink';
import { toUserMessage } from '@/lib/user-error-message';
import { readApiError } from './AccountSection';

const sessionRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) 0',
  borderTop: '1px solid var(--settings-border)',
  width: '100%',
} as const;

const sessionLabelStyle = { margin: 0, fontSize: 14, color: 'var(--text-1)' } as const;
const sessionHintStyle = { margin: 0, fontSize: 12, color: 'var(--text-3)' } as const;

function SessionsPanel() {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const logout = useAuthStore((s) => s.logout);
  const identitySignOut = useSignOut();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogOutAll = useCallback(async () => {
    setLoggingOut(true);
    setLogoutError(null);
    let sessionsRevoked = false;
    try {
      const response = await withStepUp(async (stepUpHeaders) =>
        fetch('/api/settings/sessions', {
          method: 'DELETE',
          headers: { ...(await addCsrfHeaders()), ...stepUpHeaders },
        }),
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(data, 'Unable to log out every device.'));
      sessionsRevoked = true;
      await logout();
      await identitySignOut({ redirectUrl: '/login' });
    } catch (err) {
      if (sessionsRevoked) {
        router.replace('/login');
        return;
      }
      if (!isStepUpCancelled(err)) setLogoutError(toUserMessage(err, 'Sign out failed.'));
      setLoggingOut(false);
    }
  }, [identitySignOut, logout, router, withStepUp]);

  return (
    <section
      aria-labelledby="settings-sessions-heading"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: 'var(--space-4) var(--space-5)',
      }}
    >
      {confirmDialog}
      {stepUpDialog}
      <h2
        id="settings-sessions-heading"
        style={{
          margin: '0 0 var(--space-3)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-2)',
        }}
      >
        Sessions
      </h2>
      <SettingsSectionLink
        section="account"
        style={{ ...sessionRowStyle, textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ ...sessionLabelStyle, display: 'block' }}>Active sessions</span>
          <span style={{ ...sessionHintStyle, display: 'block' }}>
            Review every signed-in device in Account and revoke any you do not recognize.
          </span>
        </span>
        <ChevronRight size={16} aria-hidden="true" color="var(--text-3)" />
      </SettingsSectionLink>
      <div style={{ ...sessionRowStyle, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={sessionLabelStyle}>Log out of all devices</p>
          <p style={sessionHintStyle}>Ends every active session, including this one.</p>
        </div>
        <button
          type="button"
          aria-label="Log out of all devices"
          onClick={() =>
            confirm({
              title: 'Log out of all devices?',
              description:
                'Every signed-in session on every device ends immediately, including this one. You will need to sign in again.',
              confirmLabel: 'Log out everywhere',
              onConfirm: () => handleLogOutAll(),
            })
          }
          disabled={loggingOut}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-1)',
            background: 'transparent',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            cursor: loggingOut ? 'default' : 'pointer',
            opacity: loggingOut ? 0.5 : 1,
          }}
        >
          <LogOut size={14} aria-hidden="true" />
          {loggingOut ? 'Signing out...' : 'Log out'}
        </button>
      </div>
      {logoutError ? (
        <p
          role="alert"
          style={{
            margin: 'var(--space-2) 0 0',
            fontSize: 14,
            color: 'var(--settings-destructive-text)',
          }}
        >
          {logoutError}
        </p>
      ) : null}
    </section>
  );
}

export function SecuritySection({
  passwordEditorActive = true,
  signInMethodsActive = true,
  twoFactorActive = true,
  deviceSignInActive = true,
}: {
  passwordEditorActive?: boolean;
  signInMethodsActive?: boolean;
  twoFactorActive?: boolean;
  deviceSignInActive?: boolean;
}) {
  const { data: serverSettings, isLoading, isError: settingsFailed } = useUserSettings();
  const updateSettingsMutation = useUpdateSettings();
  const identity = useCurrentUser();
  const currentUser = identity.isLoaded && identity.isSignedIn ? identity.user : null;
  const passwordFocus = useRef<(() => void) | null>(null);

  const securityForm = useForm<SecuritySettingsFormData>({
    resolver: zodResolver(securitySettingsSchema) as Resolver<SecuritySettingsFormData>,
    defaultValues: {
      session_timeout: 60,
    },
  });

  const { data: authenticatorStatus } = useMfaStatus(twoFactorActive);

  const openPasswordForm = useCallback(() => {
    passwordFocus.current?.();
  }, []);

  useEffect(() => {
    if (serverSettings) {
      securityForm.reset({
        session_timeout: serverSettings.session_timeout ?? 60,
      });
    }
    // securityForm is stable from useForm; only re-run when server data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSettings]);

  const handleSaveSecurity = useCallback(
    (data: SecuritySettingsFormData) => {
      updateSettingsMutation.mutate({ session_timeout: data.session_timeout });
    },
    [updateSettingsMutation],
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
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          Sign-in methods, two-factor, passkeys, password and sessions.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="account-security" label="How account security works" />
        </div>
      </div>

      <SignInMethodsPanel
        active={signInMethodsActive}
        onOpenPassword={isLoading ? undefined : openPasswordForm}
      />

      <PasskeysPanel />

      <AdvancedAccountSecurityPanel />

      <TwoFactorEnrollmentPanel active={twoFactorActive} />

      {settingsFailed ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 13, color: 'var(--settings-destructive-text)' }}
        >
          Your saved session timeout could not be loaded, so the value below is the default.
        </p>
      ) : null}

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading security settings...</div>
      ) : (
        <TwoFactorPanel
          securityForm={securityForm}
          isSaving={updateSettingsMutation.isPending}
          isUpdateSettingsPending={updateSettingsMutation.isPending}
          onSaveSecurity={handleSaveSecurity}
          passwordPanel={
            <PasswordEditor
              active={passwordEditorActive}
              policy={currentUser}
              focus={passwordFocus}
            />
          }
        />
      )}

      <SessionsPanel />

      <AuditLogPanel />

      <DeviceSignInToggle active={deviceSignInActive} />

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
          {!authenticatorStatus
            ? 'Authenticator app and backup code availability has not been confirmed.'
            : authenticatorStatus.enrollmentAvailable
              ? 'Authenticator app codes (TOTP) with recovery backup codes are the supported second factor.'
              : 'Authenticator app codes (TOTP) and backup codes are temporarily unavailable.'}{' '}
          To review or revoke a single session, use Account settings.
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

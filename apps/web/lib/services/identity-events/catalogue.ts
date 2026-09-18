import type { NotificationCategory, NotificationSeverity } from '@agiworkforce/types';
import type { AuditEventType } from '@/lib/security-audit';

export const IDENTITY_SECURITY_EVENT_KEYS = [
  'new_sign_in',
  'new_device',
  'new_location',
  'password_changed',
  'email_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'backup_codes_regenerated',
  'passkey_added',
  'passkey_removed',
  'session_revoked',
  'all_sessions_revoked',
  'api_key_created',
  'api_key_revoked',
  'identity_linked',
  'identity_unlinked',
  'sso_connection_changed',
  'recovery_requested',
  'account_deletion_scheduled',
] as const;

export type IdentitySecurityEventKey = (typeof IDENTITY_SECURITY_EVENT_KEYS)[number];

export interface IdentitySecurityEventSpec {
  readonly category: NotificationCategory;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly message: string;
  readonly auditEventType: AuditEventType;
  readonly resourceType: string;
  /** Settings section the notification opens, so every notice ends somewhere actionable. */
  readonly settingsSection: string;
}

const UNDO = 'If this was not you, secure your account from account security.';

export const IDENTITY_SECURITY_EVENTS: Readonly<
  Record<IdentitySecurityEventKey, IdentitySecurityEventSpec>
> = Object.freeze({
  new_sign_in: {
    category: 'security',
    severity: 'info',
    title: 'A new sign-in to your account',
    message: `Someone signed in to your account. ${UNDO}`,
    auditEventType: 'login',
    resourceType: 'session',
    settingsSection: 'security',
  },
  new_device: {
    category: 'security',
    severity: 'warning',
    title: 'A new device is using your account',
    message: `A device that has not signed in before is now signed in. ${UNDO}`,
    auditEventType: 'login',
    resourceType: 'device',
    settingsSection: 'account',
  },
  new_location: {
    category: 'security',
    severity: 'warning',
    title: 'A sign-in from a new place',
    message: `Your account was reached from a country it has not been reached from before. ${UNDO}`,
    auditEventType: 'new_location_sign_in',
    resourceType: 'session',
    settingsSection: 'security',
  },
  password_changed: {
    category: 'security',
    severity: 'warning',
    title: 'Your password was changed',
    message: `The password on your account is now different. ${UNDO}`,
    auditEventType: 'password_changed',
    resourceType: 'credential',
    settingsSection: 'security',
  },
  email_changed: {
    category: 'security',
    severity: 'warning',
    title: 'Your sign-in address was changed',
    message: `Password resets and security notices now go to a different address. ${UNDO}`,
    auditEventType: 'email_changed',
    resourceType: 'account',
    settingsSection: 'account',
  },
  two_factor_enabled: {
    category: 'security',
    severity: 'success',
    title: 'Two-factor authentication is on',
    message: `Signing in now asks for a second factor. ${UNDO}`,
    auditEventType: 'two_factor_enabled',
    resourceType: 'two_factor',
    settingsSection: 'security',
  },
  two_factor_disabled: {
    category: 'security',
    severity: 'warning',
    title: 'Two-factor authentication was switched off',
    message: `Your password is now the only thing protecting your account. ${UNDO}`,
    auditEventType: 'two_factor_disabled',
    resourceType: 'two_factor',
    settingsSection: 'security',
  },
  backup_codes_regenerated: {
    category: 'security',
    severity: 'warning',
    title: 'Your backup codes were replaced',
    message: `The codes you had saved no longer work. ${UNDO}`,
    auditEventType: 'two_factor_backup_codes_regenerated',
    resourceType: 'two_factor',
    settingsSection: 'security',
  },
  passkey_added: {
    category: 'security',
    severity: 'warning',
    title: 'A passkey was added to your account',
    message: `That passkey can now sign in without your password. ${UNDO}`,
    auditEventType: 'passkey_added',
    resourceType: 'credential',
    settingsSection: 'security',
  },
  passkey_removed: {
    category: 'security',
    severity: 'info',
    title: 'A passkey was removed',
    message: `It can no longer sign in to your account. ${UNDO}`,
    auditEventType: 'passkey_removed',
    resourceType: 'credential',
    settingsSection: 'security',
  },
  session_revoked: {
    category: 'security',
    severity: 'info',
    title: 'A session was signed out',
    message: `One signed-in session was ended and has to sign in again. ${UNDO}`,
    auditEventType: 'session_revoked',
    resourceType: 'session',
    settingsSection: 'security',
  },
  all_sessions_revoked: {
    category: 'security',
    severity: 'warning',
    title: 'Every other session was signed out',
    message: `Everything except the session that asked for it has to sign in again. ${UNDO}`,
    auditEventType: 'session_revoked',
    resourceType: 'session',
    settingsSection: 'security',
  },
  api_key_created: {
    category: 'security',
    severity: 'warning',
    title: 'An API key was created',
    message: `A new key can now call the API as you. ${UNDO}`,
    auditEventType: 'api_key_created',
    resourceType: 'api_key',
    settingsSection: 'security',
  },
  api_key_revoked: {
    category: 'security',
    severity: 'info',
    title: 'An API key was revoked',
    message: `Calls made with that key are refused from now on. ${UNDO}`,
    auditEventType: 'api_key_revoked',
    resourceType: 'api_key',
    settingsSection: 'security',
  },
  identity_linked: {
    category: 'security',
    severity: 'warning',
    title: 'A new sign-in method was linked',
    message: `Another provider can now sign in to this account. ${UNDO}`,
    auditEventType: 'identity_linked',
    resourceType: 'identity',
    settingsSection: 'security',
  },
  identity_unlinked: {
    category: 'security',
    severity: 'warning',
    title: 'A sign-in method was unlinked',
    message: `That provider can no longer reach this account. ${UNDO}`,
    auditEventType: 'identity_unlinked',
    resourceType: 'identity',
    settingsSection: 'security',
  },
  sso_connection_changed: {
    category: 'security',
    severity: 'warning',
    title: 'Single sign-on for your workspace changed',
    message: `How your workspace signs in was reconfigured by an administrator. ${UNDO}`,
    auditEventType: 'sso_connection_updated',
    resourceType: 'sso_connection',
    settingsSection: 'security',
  },
  recovery_requested: {
    category: 'security',
    severity: 'warning',
    title: 'Account recovery was requested',
    message: `Someone asked to recover access to your account. ${UNDO}`,
    auditEventType: 'account_recovery_requested',
    resourceType: 'account',
    settingsSection: 'security',
  },
  account_deletion_scheduled: {
    category: 'security',
    severity: 'error',
    title: 'Your account is scheduled for deletion',
    message: `Your account and its content are queued to be erased. ${UNDO}`,
    auditEventType: 'account_deletion_requested',
    resourceType: 'account',
    settingsSection: 'account',
  },
});

export function isIdentitySecurityEventKey(value: unknown): value is IdentitySecurityEventKey {
  return (
    typeof value === 'string' && (IDENTITY_SECURITY_EVENT_KEYS as readonly string[]).includes(value)
  );
}

export function identitySecurityEventSpec(
  key: IdentitySecurityEventKey,
): IdentitySecurityEventSpec {
  return IDENTITY_SECURITY_EVENTS[key];
}

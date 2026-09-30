import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { notificationTargetHref } from '@/features/notifications/lib/notification-target';
import { logger } from '@/lib/logger';
import { SITE_URL } from '@/lib/seo/site';
import { sendSecurityAlertEmail } from './notification-email-service';
import { recordNotification } from './notification-service';
import {
  identitySecurityEventSpec,
  type IdentitySecurityEventKey,
} from './identity-events/catalogue';

const DEVICES_SETTINGS_SECTION = 'account';

export interface IdentitySecurityNotificationInput {
  userId: string;
  event: IdentitySecurityEventKey;
  /** Distinguishes two notices of the same event; without one they collapse. */
  subjectRef?: string | null;
  /** A whole sentence the call site owns, naming the device, place or key. */
  context?: string | null;
}

export async function notifyIdentitySecurityEvent(
  db: DatabaseAdapter,
  input: IdentitySecurityNotificationInput,
): Promise<void> {
  const spec = identitySecurityEventSpec(input.event);
  const context = input.context?.trim();
  const subjectRef = input.subjectRef?.trim();
  const message = context ? `${spec.message} ${context}` : spec.message;
  const dedupeKey = `identity:${input.event}:${subjectRef || 'account'}`;
  const { recorded } = await recordNotification(db, {
    userId: input.userId,
    category: spec.category,
    severity: spec.severity,
    title: spec.title,
    message,
    target: { kind: 'settings', id: spec.settingsSection },
    dedupeKey,
  });
  if (!recorded) return;

  const address = await securityAlertEmailAddress(db, input.userId);
  if (!address) return;
  const href = notificationTargetHref('settings', spec.settingsSection) ?? '/chat';
  await sendSecurityAlertEmail({
    to: address,
    title: spec.title,
    message,
    settingsUrl: `${SITE_URL}${href}`,
    idempotencyKey: `${input.userId}:${dedupeKey}`,
  });
}

export const SECURITY_EMAIL_PREFERENCE_KEY = 'emailSecurityAlerts';

async function securityAlertsRequired(db: DatabaseAdapter, userId: string): Promise<boolean> {
  try {
    const [row] = await db.query<{ enrolled: boolean }>(
      `select exists (
                select 1 from public.account_security_enrollments
                 where user_id = $1 and enrolled_at is not null
              ) as enrolled`,
      [userId],
    );
    return row?.enrolled === true;
  } catch (error) {
    logger.warn({ error, userId }, '[notifications] advanced account security state unreadable');
    return false;
  }
}

async function securityAlertEmailAddress(
  db: DatabaseAdapter,
  userId: string,
): Promise<string | null> {
  try {
    const [row] = await db.query<{ opted_out: boolean; email: string | null }>(
      `select coalesce((us.settings -> 'notifications' ->> $2) = 'false', false) as opted_out,
              p.email as email
         from public.profiles as p
         left join public.user_settings as us on us.user_id = p.id
        where p.id = $1
        limit 1`,
      [userId, SECURITY_EMAIL_PREFERENCE_KEY],
    );
    if (!row?.email) return null;
    if (!row.opted_out) return row.email;
    return (await securityAlertsRequired(db, userId)) ? row.email : null;
  } catch (error) {
    logger.warn({ error, userId }, '[notifications] security alert preference unreadable');
    return null;
  }
}

export async function notifyAccountCompromiseContained(
  db: DatabaseAdapter,
  input: { userId: string; responseId: string; sessionsRevoked: number },
): Promise<void> {
  await recordNotification(db, {
    userId: input.userId,
    category: 'security',
    severity: 'error',
    title: 'Your account was secured',
    message:
      `We signed out ${input.sessionsRevoked} other session${input.sessionsRevoked === 1 ? '' : 's'} ` +
      'because your account looked compromised. Set a new password before signing in anywhere else, ' +
      'and contact support if you did not expect this.',
    target: { kind: 'settings', id: 'security' },
    dedupeKey: `account-compromise:${input.responseId}`,
  });
}

export async function notifyDeviceSignInApproved(
  db: DatabaseAdapter,
  input: { userId: string; deviceRef: string },
): Promise<void> {
  await recordNotification(db, {
    userId: input.userId,
    category: 'security',
    severity: 'warning',
    title: 'A new device signed in to your account',
    message:
      'You approved a device sign-in code. If this was not you, unlink the device and review your account security.',
    target: { kind: 'settings', id: DEVICES_SETTINGS_SECTION },
    dedupeKey: `device-sign-in:${input.deviceRef}`,
  });
}

const SURFACE_LABEL: Readonly<Record<string, string>> = {
  desktop: 'The desktop app',
  cli: 'The CLI',
  vscode: 'The VS Code extension',
  chrome: 'The Chrome extension',
  mobile: 'The mobile app',
};

export async function notifyNewDeviceRegistered(
  db: DatabaseAdapter,
  input: { userId: string; deviceId: string; surface: string; name: string | null; os: string },
): Promise<void> {
  const label = input.name?.trim() || SURFACE_LABEL[input.surface] || 'A new device';
  await recordNotification(db, {
    userId: input.userId,
    category: 'security',
    severity: 'warning',
    title: `${label} started using your account`,
    message: `It reported itself as ${input.os} and is now signed in. If this was not you, unlink it and review your account security.`,
    target: { kind: 'settings', id: DEVICES_SETTINGS_SECTION },
    dedupeKey: `device-registered:${input.deviceId}`,
  });
}

/**
 * A spent credential presented a second time means someone else holds a copy.
 * The device it belonged to is already signed out by the time this is sent.
 */
export async function notifyDeviceCredentialCompromised(
  db: DatabaseAdapter,
  input: { userId: string; sessionRef: string; deviceName: string | null },
): Promise<void> {
  const label = input.deviceName?.trim() || 'A signed-in device';
  await recordNotification(db, {
    userId: input.userId,
    category: 'security',
    severity: 'error',
    title: `${label} was signed out to protect your account`,
    message:
      'Its sign-in credential was presented twice, which happens when a copy of it has been taken. ' +
      'Sign in on that device again, and if you did not expect this, review your account security.',
    target: { kind: 'settings', id: DEVICES_SETTINGS_SECTION },
    dedupeKey: `device-credential-compromised:${input.sessionRef}`,
  });
}

export async function notifyDeviceDisconnected(
  db: DatabaseAdapter,
  input: { userId: string; deviceId: string; kind: string; name: string | null },
): Promise<void> {
  const label = input.name?.trim() || (input.kind === 'mobile' ? 'A phone' : 'A desktop app');
  await recordNotification(db, {
    userId: input.userId,
    category: 'device',
    severity: 'info',
    title: `${label} was disconnected`,
    message:
      'It is no longer linked to your account and has to sign in again before it can reach your chats, Work or files.',
    target: { kind: 'settings', id: DEVICES_SETTINGS_SECTION },
    dedupeKey: `device-disconnected:${input.deviceId}`,
  });
}

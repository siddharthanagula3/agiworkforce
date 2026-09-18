import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
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
  await recordNotification(db, {
    userId: input.userId,
    category: spec.category,
    severity: spec.severity,
    title: spec.title,
    message: context ? `${spec.message} ${context}` : spec.message,
    target: { kind: 'settings', id: spec.settingsSection },
    dedupeKey: `identity:${input.event}:${subjectRef || 'account'}`,
  });
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

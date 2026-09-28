import type { PermissionDecision } from './capabilities';

export const SYSTEM_PERMISSION_KINDS = ['screen-recording', 'accessibility', 'microphone'] as const;

export type SystemPermissionKind = (typeof SYSTEM_PERMISSION_KINDS)[number];

export type SystemPermissionStatus =
  'granted' | 'denied' | 'not-determined' | 'restricted' | 'not-required';

export const SYSTEM_PERMISSION_LABELS: Readonly<Record<SystemPermissionKind, string>> = {
  'screen-recording': 'Screen Recording',
  accessibility: 'Accessibility',
  microphone: 'Microphone',
};

export const SYSTEM_PERMISSION_PURPOSES: Readonly<Record<SystemPermissionKind, string>> = {
  'screen-recording': 'Screenshots to chat, window capture and computer use',
  accessibility: 'Computer use: moving the pointer, clicking and typing',
  microphone: 'Dictation and voice conversations',
};

export interface ReviewedPermission extends PermissionDecision {
  description: string;
}

export interface DesktopPermissionsReview {
  decisions: ReviewedPermission[];
  system: Record<SystemPermissionKind, SystemPermissionStatus>;
}

export function isSystemPermissionKind(value: unknown): value is SystemPermissionKind {
  return (
    typeof value === 'string' && (SYSTEM_PERMISSION_KINDS as readonly string[]).includes(value)
  );
}

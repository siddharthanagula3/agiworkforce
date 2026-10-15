/**
 * Permission categories for the privileged local runtime.
 *
 * Every category defaults to denied. A grant is always scoped: to a workspace
 * root, to an application, to a site, or to a single session. Nothing here
 * grants anything on its own; `PermissionDecision` records what the user chose
 * and the runtime enforces it before dispatch.
 */

export const DESKTOP_CAPABILITIES = [
  'filesystem.read',
  'filesystem.write',
  'shell.execute',
  'git.read',
  'git.write',
  'git.destructive',
  'browser.site',
  'browser.cdp',
  'computer.use',
  'application.control',
  'screen.capture',
  'clipboard.read',
  'microphone',
  'local.inference',
  'host.remote',
] as const;

export type DesktopCapability = (typeof DESKTOP_CAPABILITIES)[number];

export function isDesktopCapability(value: string): value is DesktopCapability {
  return (DESKTOP_CAPABILITIES as readonly string[]).includes(value);
}

export type PermissionScopeKind = 'workspace' | 'application' | 'site' | 'global';

export interface PermissionScope {
  kind: PermissionScopeKind;
  /** Approved folder path, bundle/executable id, or site origin. Absent for `global`. */
  target?: string;
}

export type PermissionGrantDuration = 'once' | 'session' | 'always';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PermissionDecision {
  capability: DesktopCapability;
  scope: PermissionScope;
  state: Exclude<PermissionState, 'prompt'>;
  duration: PermissionGrantDuration;
  decidedAtMs: number;
}

export interface PermissionRequest {
  capability: DesktopCapability;
  scope: PermissionScope;
  /** Human-readable reason shown in the prompt. */
  reason: string;
}

/**
 * Capabilities whose blast radius warrants a stronger prompt than the ordinary
 * allow/deny card, and which never accept an `always` grant silently.
 */
export const HIGH_RISK_CAPABILITIES: readonly DesktopCapability[] = [
  'shell.execute',
  'git.destructive',
  'computer.use',
  'application.control',
  'browser.cdp',
  'host.remote',
];

export function isHighRiskCapability(capability: DesktopCapability): boolean {
  return HIGH_RISK_CAPABILITIES.includes(capability);
}

export const PERMISSION_COMMANDS = ['permission_review', 'permission_revoke'] as const;

export type PermissionCommand = (typeof PERMISSION_COMMANDS)[number];

const PERMISSION_SCOPE_KINDS: readonly PermissionScopeKind[] = [
  'workspace',
  'application',
  'site',
  'global',
];

export function isPermissionScope(value: unknown): value is PermissionScope {
  if (!value || typeof value !== 'object') return false;
  const { kind, target } = value as { kind?: unknown; target?: unknown };
  if (typeof kind !== 'string' || !(PERMISSION_SCOPE_KINDS as readonly string[]).includes(kind)) {
    return false;
  }
  if (kind === 'global') return target === undefined;
  return typeof target === 'string' && target !== '';
}

export function permissionScopeKey(scope: PermissionScope): string {
  return scope.target ? `${scope.kind}:${scope.target}` : scope.kind;
}

export function permissionKey(capability: DesktopCapability, scope: PermissionScope): string {
  return `${capability}@${permissionScopeKey(scope)}`;
}
